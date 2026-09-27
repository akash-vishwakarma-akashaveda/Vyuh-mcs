import { create } from 'zustand';
import type { MdbRelease } from '../types';
import { FLEET, MDB_RELEASES } from '../data/fleet';
import { useFleetStore } from './useFleetStore';
import { useMissionStore } from './useMissionStore';

/**
 * Dictionary releases (S19): change → review → compile → sign → simulator verify → release.
 * Two reviewers are required and the author cannot be one of them (BR-12); a release only becomes
 * active once verified on the simulator; activation moves the satellites to the new bundle version and
 * rollback brings the previous signed bundle back (BR-10, BR-11).
 */
export interface Release extends MdbRelease {
  verifiedAt?: string;
  rolledBackTo?: string;
  rollbackReason?: string;
}

const extra: Release[] = [
  { version: 'nbh-mdb 2.3.1', state: 'ACTIVE', author: 'Meera Iyer', created_utc: new Date(Date.now() - 20 * 86400000).toISOString(),
    reviewers: [{ name: 'Ananya Rao', approved: true }, { name: 'Karan Malhotra', approved: true }], diff: [{ change: 'CHANGED', item: 'RSSI warning low', from: '-98 dBm', to: '-96 dBm' }],
    effective: FLEET.filter((s) => s.sat_id.startsWith('NBH')).map((s) => ({ sat_id: s.sat_id, effective_utc: new Date(Date.now() - 19 * 86400000).toISOString() })), bundle_sha256: '4a7b9e2c11d0f5a86e3b7c9d20f1a4b6c8e0d2f4a6b8c0e2d4f6a8b0c2e4d6f8' },
  { version: 'akv-mdb 4.17.2', state: 'ROLLED_BACK', author: 'Meera Iyer', created_utc: new Date(Date.now() - 34 * 86400000).toISOString(),
    reviewers: [{ name: 'Ananya Rao', approved: true }, { name: 'Karan Malhotra', approved: true }], diff: [{ change: 'CHANGED', item: 'SEQ_ERR warning high', from: '5', to: '3' }],
    effective: [], bundle_sha256: '17d2f8c0a1b3d5e7f90214365870a9bcdef1234567890abcdef0123456789ab', rollbackReason: 'Link alarms too noisy after release' },
];

interface Store {
  releases: Release[];
  verifying: Record<string, number>;
  approve: (version: string, by: string) => { ok: boolean; reason?: string };
  verify: (version: string) => void;
  schedule: (version: string) => void;
  activate: (version: string) => void;
  rollback: (version: string, to: string, reason: string) => void;
  draftFromUpload: (fileName: string, author: string) => void;
}

const audit = (text: string, who: string, result: 'ACK' | 'NACK' = 'ACK') =>
  useMissionStore.getState().appendAudit({
    timestamp_utc: new Date().toISOString(), operator_id: 'MDB', operator_name: who, sat_id: 'AKV-*', command_mnemonic: 'MDB',
    procedure_id: '—', procedure_version: '—', sequence_count: 0, result, params_summary: text,
  });

const prefix = (version: string) => version.split('-')[0].toUpperCase();
const setSatVersion = (version: string) => {
  const fleet = useFleetStore.getState();
  Object.values(fleet.satellites).filter((s) => s.sat_id.startsWith(prefix(version))).forEach((s) => fleet.updateSatellite(s.sat_id, { mib_version: version }));
};

export const useMdbStore = create<Store>((set, get) => {
  const patch = (version: string, p: Partial<Release>) => set((s) => ({ releases: s.releases.map((r) => (r.version === version ? { ...r, ...p } : r)) }));
  return {
    releases: [...MDB_RELEASES.map((r) => ({ ...r })), ...extra],
    verifying: {},

    approve: (version, by) => {
      const r = get().releases.find((x) => x.version === version);
      if (!r || r.state !== 'IN_REVIEW') return { ok: false, reason: 'This release is not in review.' };
      if (r.author === by) return { ok: false, reason: 'The author cannot review their own release.' };
      if (r.reviewers.some((x) => x.name === by && x.approved)) return { ok: false, reason: 'You have already approved this release.' };
      const listed = r.reviewers.some((x) => x.name === by);
      const reviewers = listed
        ? r.reviewers.map((x) => (x.name === by ? { ...x, approved: true } : x))
        : [...r.reviewers.filter((x) => x.approved), { name: by, approved: true }, ...r.reviewers.filter((x) => !x.approved).slice(1)];
      patch(version, { reviewers });
      audit(`${version} review approved (${reviewers.filter((x) => x.approved).length} of 2)`, by);
      return { ok: true };
    },

    verify: (version) => {
      if (get().verifying[version] !== undefined) return;
      set((s) => ({ verifying: { ...s.verifying, [version]: 0 } }));
      const t = window.setInterval(() => {
        const cur = (get().verifying[version] ?? 0) + 10;
        if (cur >= 100) {
          clearInterval(t);
          set((s) => { const v = { ...s.verifying }; delete v[version]; return { verifying: v }; });
          patch(version, { state: 'VERIFIED', verifiedAt: new Date().toISOString() });
          audit(`${version} compiled, signed and verified on the simulator (148 of 148 checks)`, 'Spacecraft Simulator');
        } else set((s) => ({ verifying: { ...s.verifying, [version]: cur } }));
      }, 300);
    },

    schedule: (version) => {
      const windows = useFleetStore.getState().contactWindows;
      const sats = FLEET.filter((s) => s.sat_id.startsWith(prefix(version)));
      const effective = sats.map((s, i) => {
        const next = windows.filter((w) => w.sat_id === s.sat_id && Date.parse(w.aos_utc) > Date.now()).sort((a, b) => Date.parse(a.aos_utc) - Date.parse(b.aos_utc))[0];
        return { sat_id: s.sat_id, effective_utc: next?.aos_utc ?? new Date(Date.now() + (30 + i * 9) * 60_000).toISOString() };
      });
      patch(version, { state: 'SCHEDULED', effective });
      audit(`${version} release scheduled per satellite at its next AOS`, 'Mission Database');
    },

    activate: (version) => {
      set((s) => ({ releases: s.releases.map((r) => (r.version === version ? { ...r, state: 'ACTIVE' } : r.state === 'ACTIVE' && prefix(r.version) === prefix(version) ? { ...r, state: 'ROLLED_BACK', rollbackReason: 'Superseded' } : r)) }));
      setSatVersion(version);
      audit(`${version} active on ${prefix(version)}-* satellites`, 'Mission Database');
    },

    rollback: (version, to, reason) => {
      set((s) => ({ releases: s.releases.map((r) => (r.version === version ? { ...r, state: 'ROLLED_BACK', rollbackReason: reason, rolledBackTo: to } : r.version === to ? { ...r, state: 'ACTIVE' } : r)) }));
      setSatVersion(to);
      audit(`${version} rolled back to ${to}: ${reason}`, 'Mission Database');
    },

    draftFromUpload: (fileName, author) => {
      const active = get().releases.filter((r) => r.version.startsWith('akv')).map((r) => r.version);
      const next = `akv-mdb 4.${Math.max(...active.map((v) => Number(v.split('.')[1]))) + 1}.0`;
      set((s) => ({ releases: [{
        version: next, state: 'DRAFT', author, created_utc: new Date().toISOString(), reviewers: [{ name: 'Ananya Rao', approved: false }, { name: 'Karan Malhotra', approved: false }],
        diff: [{ change: 'CHANGED', item: `Imported from ${fileName}`, from: 'previous bundle', to: 'new definitions' }], effective: [], bundle_sha256: Array.from({ length: 64 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join(''),
      }, ...s.releases] }));
      audit(`${next} drafted from ${fileName}`, author);
    },
  };
});
