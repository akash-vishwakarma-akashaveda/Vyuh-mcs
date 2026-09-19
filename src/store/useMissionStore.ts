import { create } from 'zustand';
import { Advisory, Approval, AuditRecord } from '../types';
import { ADVISORIES, DEMO_ADVISORY, DEMO_APPROVAL, PROCEDURE_PR_THM_004 } from '../data/fleet';
import { SEED_AUDIT } from '../data/mission';

export type ProcState = 'READY' | 'RUNNING' | 'WAIT_CONDITION' | 'WAIT_OPERATOR' | 'WAIT_APPROVAL' | 'PAUSED_LOS' | 'COMPLETED' | 'ABORTED';

export interface CommandRecord {
  command_id: string;
  sat_id: string;
  mnemonic: string;
  params: Record<string, string | number>;
  status: 'DRAFT' | 'AWAITING_APPROVAL' | 'RELEASED' | 'ACCEPTED' | 'STARTED' | 'COMPLETED' | 'FAILED' | 'REJECTED';
  requested_by: string;
  approved_by?: string;
  epoch: number;
  utc: string;
  critical: boolean;
}

interface Fop1 {
  state: 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6';
  vS: number;
  nnR: number;
  lockout: boolean;
  wait: boolean;
  retransmit: boolean;
  farmB: number;
  epoch: number;
  owner: string;
}

interface MissionStore {
  advisories: Advisory[];
  approvals: Approval[];
  commands: CommandRecord[];
  audit: AuditRecord[];
  chainVerified: 'IDLE' | 'RUNNING' | 'VERIFIED' | 'BROKEN';
  fop1: Fop1;
  /** Demo scenario: heater A failed on AKV-03. */
  heaterFault: boolean;
  heaterBOn: boolean;

  addAdvisory: (a: Advisory) => void;
  setAdvisoryState: (id: string, state: Advisory['state']) => void;
  requestApproval: (a: Approval) => void;
  decideApproval: (id: string, approve: boolean, by: string, reason?: string) => void;
  addCommand: (c: CommandRecord) => void;
  setCommandStatus: (id: string, status: CommandRecord['status'], approvedBy?: string) => void;
  appendAudit: (entry: Omit<AuditRecord, 'record_id' | 'prev_record_sha256' | 'bytes_sha256'> & { bytes_sha256?: string }) => void;
  verifyChain: () => void;
  injectHeaterFault: () => void;
  switchHeaterB: () => void;
  reset: () => void;
}

const hash = (s: string) => {
  // ponytail: FNV-1a widened to 64 hex chars — a stand-in for SHA-256 in the
  // browser demo. Swap for the real digest when the ledger comes from the API.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return Array.from({ length: 8 }, (_, i) => ((h * (i + 7)) >>> 0).toString(16).padStart(8, '0')).join('').slice(0, 64);
};

const GENESIS = '0'.repeat(64);

/** The ledger a shift inherits: earlier records, already chained. */
function seedAudit(): AuditRecord[] {
  let prev = GENESIS;
  const chained = [...SEED_AUDIT]
    .sort((a, b) => b.minutes_ago - a.minutes_ago)
    .map((e, i) => {
      const rec: AuditRecord = {
        record_id: `AUD-${44112 + i}`,
        timestamp_utc: new Date(Date.now() - e.minutes_ago * 60_000).toISOString(),
        operator_id: `USR-${String(i + 1).padStart(3, '0')}`,
        operator_name: e.operator_name,
        sat_id: e.sat_id,
        command_mnemonic: e.command_mnemonic,
        procedure_id: '—',
        procedure_version: '—',
        sequence_count: 40 - i,
        result: e.result,
        params_summary: e.params_summary,
        prev_record_sha256: prev,
        bytes_sha256: hash(e.operator_name + e.command_mnemonic + e.minutes_ago + prev),
      };
      prev = rec.bytes_sha256;
      return rec;
    });
  return chained.reverse(); // newest first, as the table shows it
}

export const useMissionStore = create<MissionStore>((set, get) => ({
  advisories: ADVISORIES,
  approvals: [],
  commands: [],
  audit: seedAudit(),
  chainVerified: 'IDLE',
  fop1: { state: 'S1', vS: 41, nnR: 41, lockout: false, wait: false, retransmit: false, farmB: 3, epoch: 17, owner: 'tc-encoder-2' },
  heaterFault: false,
  heaterBOn: false,

  addAdvisory: (a) =>
    set((s) => (s.advisories.some((x) => x.advisory_id === a.advisory_id) ? s : { advisories: [a, ...s.advisories] })),

  setAdvisoryState: (id, state) =>
    set((s) => ({ advisories: s.advisories.map((a) => (a.advisory_id === id ? { ...a, state } : a)) })),

  requestApproval: (a) =>
    set((s) => (s.approvals.some((x) => x.approval_id === a.approval_id) ? s : { approvals: [a, ...s.approvals] })),

  decideApproval: (id, approve, by, reason) => {
    const appr = get().approvals.find((a) => a.approval_id === id);
    set((s) => ({
      approvals: s.approvals.map((a) =>
        a.approval_id === id
          ? { ...a, state: approve ? 'APPROVED' : 'REJECTED', decided_by: by, decided_utc: new Date().toISOString(), reject_reason: reason }
          : a
      ),
    }));
    if (appr) {
      get().setCommandStatus(appr.command_id, approve ? 'RELEASED' : 'REJECTED', by);
      get().appendAudit({
        timestamp_utc: new Date().toISOString(),
        operator_id: 'USR-FD', operator_name: by, sat_id: appr.sat_id,
        command_mnemonic: appr.mnemonic,
        procedure_id: PROCEDURE_PR_THM_004.id, procedure_version: PROCEDURE_PR_THM_004.version,
        sequence_count: get().fop1.vS,
        result: approve ? 'ACK' : 'NACK',
        params_summary: `${approve ? 'approved' : 'rejected'} (step-up passkey, acr=2) ${Object.entries(appr.params).map(([k, v]) => `${k}=${v}`).join(' ')}`,
      });
    }
  },

  addCommand: (c) => set((s) => ({ commands: [c, ...s.commands] })),

  setCommandStatus: (id, status, approvedBy) =>
    set((s) => ({
      commands: s.commands.map((c) => (c.command_id === id ? { ...c, status, approved_by: approvedBy ?? c.approved_by } : c)),
      fop1: status === 'ACCEPTED' ? { ...s.fop1, vS: s.fop1.vS + 1, nnR: s.fop1.nnR + 1 } : s.fop1,
    })),

  appendAudit: (entry) =>
    set((s) => {
      const prev = s.audit[0]?.bytes_sha256 ?? GENESIS;
      const body = JSON.stringify(entry) + prev;
      return {
        audit: [{
          ...entry,
          record_id: `AUD-${44120 + s.audit.length}`,
          prev_record_sha256: prev,
          bytes_sha256: entry.bytes_sha256 ?? hash(body),
        } as AuditRecord, ...s.audit],
        chainVerified: 'IDLE',
      };
    }),

  verifyChain: () => {
    set({ chainVerified: 'RUNNING' });
    window.setTimeout(() => {
      const recs = [...get().audit].reverse();
      let prev = GENESIS;
      const ok = recs.every((r) => {
        const match = r.prev_record_sha256 === prev;
        prev = r.bytes_sha256;
        return match;
      });
      set({ chainVerified: ok ? 'VERIFIED' : 'BROKEN' });
    }, 900);
  },

  injectHeaterFault: () => {
    if (get().heaterFault) return;
    set({ heaterFault: true, heaterBOn: false });
    get().appendAudit({
      timestamp_utc: new Date().toISOString(),
      operator_id: 'SYS', operator_name: 'Spacecraft Simulator', sat_id: 'AKV-03',
      command_mnemonic: 'SCENARIO_INJECT', procedure_id: 'SC-THM-01', procedure_version: '1.0',
      sequence_count: 0, result: 'ACK', params_summary: 'HEATER=A FAULT=STUCK_ON',
    });
  },

  switchHeaterB: () => set({ heaterBOn: true }),

  reset: () =>
    set({
      advisories: ADVISORIES, approvals: [], commands: [], audit: seedAudit(), chainVerified: 'IDLE',
      heaterFault: false, heaterBOn: false,
      fop1: { state: 'S1', vS: 41, nnR: 41, lockout: false, wait: false, retransmit: false, farmB: 3, epoch: 17, owner: 'tc-encoder-2' },
    }),
}));

export const demoAdvisoryNow = (): Advisory => ({ ...DEMO_ADVISORY, detected_utc: new Date().toISOString() });

export const demoApprovalNow = (): Approval => ({
  ...DEMO_APPROVAL,
  requested_utc: new Date().toISOString(),
  expires_utc: new Date(Date.now() + 7 * 60_000).toISOString(),
});
