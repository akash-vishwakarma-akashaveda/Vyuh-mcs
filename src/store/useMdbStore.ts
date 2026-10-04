import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserRole } from '../types';
import { MDB_TIMELINE, T0 } from '../demo/scenario';
import { demoKey, demoStorage } from '../demo/persist';
import { FLEET } from '../data/fleet';
import { can } from '../auth/policy';
import { useFleetStore } from './useFleetStore';
import { useMissionStore } from './useMissionStore';
import {
  CheckResult, DerivedParam, Dictionary, DiffRow, Limits, Phase, PHASE_LABEL, checkDict, diffDict, platformDictionary,
} from '../screens/config/mdbLib';

/**
 * Mission database releases (S19): Draft → In review → Simulator check → Scheduled → Active, with rollback.
 * Two reviewers who hold the Mission Database Engineer or Flight Engineer role and are not the author
 * (BR-12); only a checked release may be scheduled; activation moves each satellite to the new bundle at
 * its next contact and rollback brings back a previously active signed bundle (BR-10, BR-11).
 * Every rule is enforced here as well as on the screen, so no caller can skip one.
 */
export type ReleaseState = 'DRAFT' | 'IN_REVIEW' | 'VERIFIED' | 'SCHEDULED' | 'ACTIVE' | 'SUPERSEDED' | 'ROLLED_BACK';
export const STATE_LABEL: Record<ReleaseState, string> = {
  DRAFT: 'Draft', IN_REVIEW: 'In review', VERIFIED: 'Checked', SCHEDULED: 'Scheduled', ACTIVE: 'Active', SUPERSEDED: 'Superseded', ROLLED_BACK: 'Withdrawn',
};
export const REVIEWER_ROLES: UserRole[] = ['Mission Database Engineer', 'Flight Engineer'];

export interface Reviewer { name: string; role: UserRole; approved: boolean; at?: string }
export interface Release {
  version: string;
  /** Dictionary line: akv-mdb flies AKV-*, nbh-mdb flies NBH-*. */
  line: string;
  state: ReleaseState;
  author: string;
  created_utc: string;
  /** The release this one was drafted from; the diff is against it. */
  base?: string;
  source: string;
  dict: Dictionary;
  /** Why each change was made, by diff item. */
  why: Record<string, string>;
  reviewers: Reviewer[];
  check?: CheckResult & { at: string; by: string };
  effective: { sat_id: string; effective_utc: string }[];
  bundle_sha256: string;
  rollbackReason?: string;
  rolledBackTo?: string;
}
export interface Actor { id: string; name: string; role: UserRole }
export type Result = { ok: true } | { ok: false; reason: string };

const prefixOf = (line: string) => line.split('-')[0].toUpperCase();
export const satsOf = (line: string) => FLEET.filter((s) => s.sat_id.startsWith(prefixOf(line)));
const now = () => new Date().toISOString();
/** Days before the demo world was seeded (reviews and releases are scenario facts, see MDB_TIMELINE). */
const daysAgo = (d: number) => new Date(T0 - d * 86400000).toISOString();
const minAt = (min: number) => new Date(T0 + min * 60_000).toISOString();
const [R1, R2] = MDB_TIMELINE.older.reviewers;
const reviewedBy = (d: number) => [{ name: R1, role: 'Flight Engineer' as UserRole, approved: true, at: daysAgo(d) }, { name: R2, role: 'Flight Engineer' as UserRole, approved: true, at: daysAgo(d) }];
const sha = (s: string) => {
  // ponytail: FNV-1a stretched to 64 hex chars stands in for the backend's SHA-256 bundle signature.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return Array.from({ length: 8 }, (_, i) => ((h * (i + 3) + i * 2654435761) >>> 0).toString(16).padStart(8, '0')).join('');
};
const clone = (d: Dictionary): Dictionary => structuredClone(d);

// ---- seed: the backend's real dictionary is 4.19.0; 4.20.0 is the change under review --------

const base = platformDictionary();
const v420 = clone(base);
{
  const bt = v420.params.find((p) => p.name === 'BAT_TEMP')!;
  bt.limits.NOMINAL = { ...bt.limits.NOMINAL, l: 11 };
  bt.limits.LEOP = { ll: 0, l: 5, h: 45, hh: 55 };
  const soc = v420.params.find((p) => p.name === 'BAT_SOC')!;
  soc.limits.SAFE = { ll: 15, l: 30, h: 100, hh: 100 };
  const htrA = v420.params.find((p) => p.name === 'HTR_A_DUTY')!;
  v420.params.push({ ...htrA, name: 'HTR_B_DUTY', description: 'Heater B duty cycle', offset: htrA.offset + 16 * 30 });
  v420.derived.push({ name: 'BAT_POWER', expression: 'BAT_VOLTAGE * BUS_CURRENT', unit: 'W', description: 'Power drawn from the battery bus' });
}

const SEED: Release[] = [
  {
    version: 'akv-mdb 4.20.0', line: 'akv-mdb', state: 'IN_REVIEW', author: MDB_TIMELINE.draft420.author, created_utc: minAt(MDB_TIMELINE.draft420.min), base: 'akv-mdb 4.19.0', source: 'Edited in the console',
    dict: v420, why: {
      'BAT_TEMP nominal limits': 'Earlier warning after the 3 Oct heater event',
      'BAT_TEMP leop limits': 'Wider band while the battery settles after separation',
      'BAT_SOC safe mode limits': 'Safe mode sheds load, so a lower charge is expected',
      HTR_B_DUTY: 'Heater B is now reported in housekeeping',
      'BAT_POWER (derived)': 'Lets operators watch battery power without a calculator',
    },
    reviewers: MDB_TIMELINE.draft420.reviewers.map((r) => ({ name: r.name, role: r.role, approved: true, at: minAt(r.min) })),
    effective: [], bundle_sha256: sha('akv-mdb 4.20.0'),
  },
  {
    version: 'akv-mdb 4.19.0', line: 'akv-mdb', state: 'ACTIVE', author: 'Meera Iyer', created_utc: minAt(MDB_TIMELINE.active419.createdMin), base: 'akv-mdb 4.18.1', source: 'Generated from the platform dictionary',
    dict: base, why: {}, reviewers: reviewedBy(6),
    check: { at: daysAgo(6), by: 'Meera Iyer', checks: 412, failures: [], warnings: [] },
    effective: satsOf('akv-mdb').map((s) => ({ sat_id: s.sat_id, effective_utc: minAt(MDB_TIMELINE.active419.activeMin) })), bundle_sha256: '7c1a93ef00d2b58a4419e7c6d3b2f1085a9e4d7c6b5a493827160f5e4d3c2b1a',
  },
  {
    version: 'akv-mdb 4.18.1', line: 'akv-mdb', state: 'SUPERSEDED', author: 'Meera Iyer', created_utc: daysAgo(30), source: 'Generated from the platform dictionary',
    dict: base, why: {}, reviewers: reviewedBy(30),
    check: { at: daysAgo(30), by: 'Meera Iyer', checks: 409, failures: [], warnings: [] }, effective: [], bundle_sha256: '9e0b51c2d4f6a8b0c2e4d6f8a0b2c4d6e8f0a2b4c6d8e0f2a4b6c8d0e2f4a6b8',
  },
  {
    version: 'akv-mdb 4.17.2', line: 'akv-mdb', state: 'ROLLED_BACK', author: 'Meera Iyer', created_utc: daysAgo(34), source: 'Edited in the console',
    dict: base, why: {}, reviewers: reviewedBy(34),
    effective: [], bundle_sha256: '17d2f8c0a1b3d5e7f90214365870a9bcdef1234567890abcdef0123456789ab', rollbackReason: 'Link alarms too noisy after release', rolledBackTo: 'akv-mdb 4.16.0',
  },
  {
    version: 'nbh-mdb 2.3.1', line: 'nbh-mdb', state: 'ACTIVE', author: 'Meera Iyer', created_utc: daysAgo(20), source: 'Generated from the platform dictionary',
    dict: base, why: {}, reviewers: reviewedBy(20),
    check: { at: daysAgo(20), by: 'Meera Iyer', checks: 398, failures: [], warnings: [] },
    effective: satsOf('nbh-mdb').map((s) => ({ sat_id: s.sat_id, effective_utc: daysAgo(19) })), bundle_sha256: '4a7b9e2c11d0f5a86e3b7c9d20f1a4b6c8e0d2f4a6b8c0e2d4f6a8b0c2e4d6f8',
  },
];

// ---- store -----------------------------------------------------------------------------------

export interface Freeze { on: boolean; by?: string; at?: string; reason?: string; baseline?: string[] }

interface Store {
  releases: Release[];
  checking: Record<string, number>;
  freeze: Freeze;
  /** Which limit set each dictionary line applies (mission phase). */
  phase: Record<string, Phase>;

  diffOf: (version: string) => DiffRow[];
  newDraft: (line: string, actor: Actor, from?: { dict: Dictionary; source: string }) => Result & { version?: string };
  editLimits: (version: string, param: string, phase: Phase, limits: Limits | undefined, why: string, actor: Actor) => Result;
  setDerived: (version: string, d: DerivedParam, why: string, actor: Actor) => Result;
  removeDerived: (version: string, name: string, actor: Actor) => Result;
  discard: (version: string, actor: Actor) => Result;
  submit: (version: string, actor: Actor) => Result;
  approve: (version: string, actor: Actor) => Result;
  runCheck: (version: string, actor: Actor) => Result;
  schedule: (version: string, actor: Actor) => Result;
  cancelSchedule: (version: string, actor: Actor) => Result;
  activate: (version: string, actor: Actor) => Result;
  rollback: (version: string, to: string, reason: string, actor: Actor) => Result;
  setFreeze: (on: boolean, reason: string, actor: Actor) => Result;
  setPhase: (line: string, phase: Phase, actor: Actor) => Result;
}

const audit = (text: string, actor: Actor, result: 'ACK' | 'NACK' = 'ACK') =>
  useMissionStore.getState().appendAudit({
    timestamp_utc: now(), operator_id: actor.id, operator_name: actor.name, sat_id: 'MDB', command_mnemonic: 'MDB_RELEASE',
    procedure_id: '—', procedure_version: '—', sequence_count: 0, result, params_summary: text,
  });

const no = (reason: string): Result => ({ ok: false, reason });
const gate = (action: 'mdb:edit' | 'mdb:release', actor: Actor): Result => {
  const d = can(action, actor.role);
  return d.allowed ? { ok: true } : no(d.reason ?? 'Not allowed');
};

/** Rules shared by the screen (to explain a disabled button) and the store (to refuse). */
export const rules = {
  edit: (r: Release, a: Actor): Result => {
    const g = gate('mdb:edit', a); if (!g.ok) return g;
    return r.state === 'DRAFT' ? { ok: true } : no('Only a draft can be edited. Start a new draft from this release.');
  },
  submit: (r: Release, a: Actor, diff: number): Result => {
    const g = gate('mdb:edit', a); if (!g.ok) return g;
    if (r.state !== 'DRAFT') return no('Only a draft can be submitted.');
    return diff === 0 ? no('The draft has no changes yet.') : { ok: true };
  },
  approve: (r: Release, a: Actor): Result => {
    if (!REVIEWER_ROLES.includes(a.role)) return no(`Reviewers must hold ${REVIEWER_ROLES.join(' or ')}. You are signed in as ${a.role}.`);
    if (r.state !== 'IN_REVIEW') return no('Only a release in review can be approved.');
    if (r.author === a.name) return no('You wrote this release, so you cannot review it.');
    if (r.reviewers.some((x) => x.name === a.name && x.approved)) return no('You already approved this release.');
    return r.reviewers.filter((x) => x.approved).length >= 2 ? no('Both approvals are in.') : { ok: true };
  },
  check: (r: Release, a: Actor): Result => {
    const g = gate('mdb:release', a); if (!g.ok) return g;
    if (r.state !== 'IN_REVIEW') return no(r.state === 'DRAFT' ? 'Submit the draft for review first.' : 'The check runs on a release in review.');
    const n = r.reviewers.filter((x) => x.approved).length;
    return n < 2 ? no(`Waiting for ${2 - n} more reviewer approval${n === 1 ? '' : 's'}.`) : { ok: true };
  },
  schedule: (r: Release, a: Actor, f: Freeze): Result => {
    const g = gate('mdb:release', a); if (!g.ok) return g;
    if (f.on) return no(`The configuration baseline is frozen (${f.reason}). Lift the freeze to schedule.`);
    return r.state === 'VERIFIED' ? { ok: true } : no('Only a release that passed the simulator check can be scheduled.');
  },
  activate: (r: Release, a: Actor, f: Freeze): Result => {
    const g = gate('mdb:release', a); if (!g.ok) return g;
    if (f.on) return no(`The configuration baseline is frozen (${f.reason}).`);
    return r.state === 'SCHEDULED' ? { ok: true } : no('Schedule the release first.');
  },
  rollback: (r: Release, a: Actor, targets: Release[]): Result => {
    const g = gate('mdb:release', a); if (!g.ok) return g;
    if (r.state !== 'ACTIVE') return no('Only the active release can be rolled back.');
    return targets.length ? { ok: true } : no('No earlier signed release of this line to return to.');
  },
};

/** Earlier signed releases of the same line that may be brought back. Withdrawn bundles are never offered. */
export const rollbackTargets = (releases: Release[], r: Release) =>
  releases.filter((x) => x.line === r.line && x.version !== r.version && x.state === 'SUPERSEDED');

const liveValues = (line: string) => {
  const ids = new Set(satsOf(line).map((s) => s.sat_id));
  const cvt = useFleetStore.getState().cvt;
  return Object.fromEntries(Object.entries(cvt).filter(([sat]) => ids.has(sat)).map(([sat, ps]) => [sat, Object.fromEntries(Object.entries(ps).map(([k, p]) => [k, p.eu_value]))]));
};

export const useMdbStore = create<Store>()(persist((set, get) => {
  const find = (v: string) => get().releases.find((r) => r.version === v);
  const patch = (version: string, p: Partial<Release> | ((r: Release) => Partial<Release>)) =>
    set((s) => ({ releases: s.releases.map((r) => (r.version === version ? { ...r, ...(typeof p === 'function' ? p(r) : p) } : r)) }));
  const missing = no('No such release.');

  return {
    releases: SEED,
    checking: {},
    freeze: { on: false },
    phase: { 'akv-mdb': 'NOMINAL', 'nbh-mdb': 'NOMINAL' },

    diffOf: (version) => {
      const r = find(version);
      if (!r) return [];
      return diffDict(r.base ? find(r.base)?.dict : undefined, r.dict);
    },

    newDraft: (line, actor, from) => {
      const g = gate('mdb:edit', actor); if (!g.ok) return g;
      if (get().releases.some((r) => r.line === line && r.state === 'DRAFT')) return no(`${line} already has an open draft. Finish or discard it first.`);
      const active = get().releases.find((r) => r.line === line && r.state === 'ACTIVE');
      const minors = get().releases.filter((r) => r.line === line).map((r) => r.version.split(' ')[1].split('.').map(Number));
      const [maj, min] = minors.sort((a, b) => b[0] - a[0] || b[1] - a[1])[0] ?? [1, 0];
      const version = `${line} ${maj}.${min + 1}.0`;
      const dict = from ? from.dict : clone(active?.dict ?? base);
      set((s) => ({ releases: [{
        version, line, state: 'DRAFT', author: actor.name, created_utc: now(), base: active?.version, source: from?.source ?? `Copied from ${active?.version ?? 'the platform dictionary'}`,
        dict, why: {}, reviewers: [], effective: [], bundle_sha256: sha(version + JSON.stringify(dict)),
      }, ...s.releases] }));
      audit(`${version} drafted (${from?.source ?? 'copy of the active release'})`, actor);
      return { ok: true, version };
    },

    editLimits: (version, param, phase, limits, why, actor) => {
      const r = find(version); if (!r) return missing;
      const ok = rules.edit(r, actor); if (!ok.ok) return ok;
      if (phase === 'NOMINAL' && !limits) return no('The nominal set cannot be removed.');
      const dict = clone(r.dict);
      const p = dict.params.find((x) => x.name === param); if (!p) return no(`${param} is not in this dictionary.`);
      if (limits) {
        if (!(limits.ll <= limits.l && limits.l <= limits.h && limits.h <= limits.hh)) return no('Limits must be ordered: critical low ≤ warning low ≤ warning high ≤ critical high.');
        p.limits[phase] = limits;
      } else delete p.limits[phase];
      const item = `${param} ${PHASE_LABEL[phase].toLowerCase()} limits`;
      patch(version, { dict, why: why.trim() ? { ...r.why, [item]: why.trim() } : r.why });
      audit(`${version}: ${item} ${limits ? `set to ${limits.l}…${limits.h} (crit ${limits.ll}…${limits.hh})` : 'removed'}`, actor);
      return { ok: true };
    },

    setDerived: (version, d, why, actor) => {
      const r = find(version); if (!r) return missing;
      const ok = rules.edit(r, actor); if (!ok.ok) return ok;
      if (!/^[A-Z][A-Z0-9_]{1,31}$/.test(d.name)) return no('Name it in capitals, letters, digits and underscores, for example BAT_POWER.');
      if (r.dict.params.some((p) => p.name === d.name)) return no(`${d.name} is already a telemetry parameter.`);
      const dict = { ...r.dict, derived: [...r.dict.derived.filter((x) => x.name !== d.name), d] };
      patch(version, { dict, why: why.trim() ? { ...r.why, [`${d.name} (derived)`]: why.trim() } : r.why });
      audit(`${version}: derived ${d.name} = ${d.expression}`, actor);
      return { ok: true };
    },

    removeDerived: (version, name, actor) => {
      const r = find(version); if (!r) return missing;
      const ok = rules.edit(r, actor); if (!ok.ok) return ok;
      patch(version, { dict: { ...r.dict, derived: r.dict.derived.filter((x) => x.name !== name) } });
      audit(`${version}: derived ${name} removed`, actor);
      return { ok: true };
    },

    discard: (version, actor) => {
      const r = find(version); if (!r) return missing;
      const ok = rules.edit(r, actor); if (!ok.ok) return ok;
      set((s) => ({ releases: s.releases.filter((x) => x.version !== version) }));
      audit(`${version} draft discarded`, actor);
      return { ok: true };
    },

    submit: (version, actor) => {
      const r = find(version); if (!r) return missing;
      const ok = rules.submit(r, actor, get().diffOf(version).length); if (!ok.ok) return ok;
      patch(version, { state: 'IN_REVIEW', reviewers: [], bundle_sha256: sha(version + JSON.stringify(r.dict)) });
      audit(`${version} submitted for review`, actor);
      return { ok: true };
    },

    approve: (version, actor) => {
      const r = find(version); if (!r) return missing;
      const ok = rules.approve(r, actor); if (!ok.ok) return ok;
      const reviewers = [...r.reviewers.filter((x) => x.name !== actor.name), { name: actor.name, role: actor.role, approved: true, at: now() }];
      patch(version, { reviewers });
      audit(`${version} review approved by ${actor.name} as ${actor.role} (${reviewers.filter((x) => x.approved).length} of 2)`, actor);
      return { ok: true };
    },

    runCheck: (version, actor) => {
      const r = find(version); if (!r) return missing;
      const ok = rules.check(r, actor); if (!ok.ok) return ok;
      if (get().checking[version] !== undefined) return no('The check is already running.');
      set((s) => ({ checking: { ...s.checking, [version]: 0 } }));
      const t = window.setInterval(() => {
        const cur = (get().checking[version] ?? 0) + 20;
        if (cur < 100) { set((s) => ({ checking: { ...s.checking, [version]: cur } })); return; }
        clearInterval(t);
        set((s) => { const c = { ...s.checking }; delete c[version]; return { checking: c }; });
        const res = checkDict(find(version)!.dict, liveValues(r.line));
        const passed = res.failures.length === 0;
        patch(version, { check: { ...res, at: now(), by: actor.name }, ...(passed ? { state: 'VERIFIED' as const } : {}) });
        audit(`${version} simulator check ${passed ? 'passed' : 'failed'}: ${res.checks} checks, ${res.failures.length} failures, ${res.warnings.length} warnings`, actor, passed ? 'ACK' : 'NACK');
      }, 250);
      return { ok: true };
    },

    schedule: (version, actor) => {
      const r = find(version); if (!r) return missing;
      const ok = rules.schedule(r, actor, get().freeze); if (!ok.ok) return ok;
      const windows = useFleetStore.getState().contactWindows;
      const effective = satsOf(r.line).map((s) => {
        const next = windows.filter((w) => w.sat_id === s.sat_id && Date.parse(w.aos_utc) > Date.now()).sort((a, b) => Date.parse(a.aos_utc) - Date.parse(b.aos_utc))[0];
        return { sat_id: s.sat_id, effective_utc: next?.aos_utc ?? s.next_contact_utc ?? now() };
      });
      patch(version, { state: 'SCHEDULED', effective });
      audit(`${version} scheduled on ${effective.length} satellites, each at its next contact`, actor);
      return { ok: true };
    },

    cancelSchedule: (version, actor) => {
      const r = find(version); if (!r) return missing;
      const g = gate('mdb:release', actor); if (!g.ok) return g;
      if (r.state !== 'SCHEDULED') return no('Only a scheduled release can be unscheduled.');
      patch(version, { state: 'VERIFIED', effective: [] });
      audit(`${version} schedule cancelled`, actor);
      return { ok: true };
    },

    activate: (version, actor) => {
      const r = find(version); if (!r) return missing;
      const ok = rules.activate(r, actor, get().freeze); if (!ok.ok) return ok;
      set((s) => ({ releases: s.releases.map((x) => (x.version === version ? { ...x, state: 'ACTIVE' } : x.line === r.line && x.state === 'ACTIVE' ? { ...x, state: 'SUPERSEDED' } : x)) }));
      const fleet = useFleetStore.getState();
      satsOf(r.line).forEach((s) => fleet.updateSatellite(s.sat_id, { mib_version: version }));
      audit(`${version} active on ${prefixOf(r.line)}-* satellites`, actor);
      return { ok: true };
    },

    rollback: (version, to, reason, actor) => {
      const r = find(version); if (!r) return missing;
      const targets = rollbackTargets(get().releases, r);
      const ok = rules.rollback(r, actor, targets); if (!ok.ok) return ok;
      if (!targets.some((x) => x.version === to)) return no(`${to} cannot be rolled back to.`);
      if (reason.trim().length < 8) return no('Give a reason of at least 8 characters.');
      const effective = satsOf(r.line).map((s) => ({ sat_id: s.sat_id, effective_utc: s.next_contact_utc ?? now() }));
      set((s) => ({ releases: s.releases.map((x) => (x.version === version ? { ...x, state: 'ROLLED_BACK', rollbackReason: reason.trim(), rolledBackTo: to } : x.version === to ? { ...x, state: 'ACTIVE', effective } : x)) }));
      const fleet = useFleetStore.getState();
      satsOf(r.line).forEach((s) => fleet.updateSatellite(s.sat_id, { mib_version: to }));
      audit(`${version} rolled back to ${to}: ${reason.trim()}`, actor, 'NACK');
      return { ok: true };
    },

    setFreeze: (on, reason, actor) => {
      const g = gate('mdb:release', actor); if (!g.ok) return g;
      if (on && reason.trim().length < 8) return no('Give a reason of at least 8 characters.');
      const baseline = get().releases.filter((r) => r.state === 'ACTIVE').map((r) => r.version);
      set({ freeze: on ? { on, by: actor.name, at: now(), reason: reason.trim(), baseline } : { on: false } });
      audit(on ? `Configuration baseline frozen (${baseline.join(', ')}): ${reason.trim()}` : 'Configuration baseline freeze lifted', actor);
      return { ok: true };
    },

    setPhase: (line, phase, actor) => {
      const g = gate('mdb:release', actor); if (!g.ok) return g;
      set((s) => ({ phase: { ...s.phase, [line]: phase } }));
      audit(`${line}: ${PHASE_LABEL[phase]} limit set selected`, actor);
      return { ok: true };
    },
  };
}, { name: demoKey('mdb'), storage: demoStorage, partialize: (s) => ({ releases: s.releases, freeze: s.freeze, phase: s.phase }) as unknown as Store }));
