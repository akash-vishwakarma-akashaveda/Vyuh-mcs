import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Advisory, Approval, AuditRecord } from '../types';
import { ADVISORIES, AUDIT_BASE, DEMO_ADVISORY, GENESIS, SEED_APPROVALS, SEED_COMMANDS, chainHash as hash, fopSeed, seedAudit } from '../demo/scenario';
import { demoKey, demoStorage } from '../demo/persist';
import { PEOPLE, useAuthStore } from './useAuthStore';

export type ProcState = 'READY' | 'RUNNING' | 'WAIT_CONDITION' | 'WAIT_OPERATOR' | 'WAIT_APPROVAL' | 'PAUSED_LOS' | 'COMPLETED' | 'ABORTED';

export interface CommandRecord {
  command_id: string;
  sat_id: string;
  mnemonic: string;
  params: Record<string, string | number>;
  status: 'DRAFT' | 'AWAITING_APPROVAL' | 'RELEASED' | 'ACCEPTED' | 'STARTED' | 'COMPLETED' | 'FAILED' | 'REJECTED' | 'CANCELLED';
  requested_by: string;
  approved_by?: string;
  epoch: number;
  utc: string;
  critical: boolean;
  /** Framed and sent on the forward link: from here it can no longer be cancelled. */
  radiated?: boolean;
  /** Where it came from, e.g. "PR-THM-004 step 5". */
  source?: string;
  approval_id?: string;
  /** Why it failed or was refused, in words. */
  note?: string;
}

/** An approval request as the console holds it: the API shape plus what the screens need. */
export type MissionApproval = Approval & {
  /** End of the satellite's current contact, when it was in contact at request time. */
  los_utc?: string;
  source?: string;
  requester_role?: string;
  procedure_id?: string;
  procedure_version?: string;
  /** The requester took the request back before anyone decided. */
  withdrawn?: boolean;
};

export interface Fop1 {
  state: 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6';
  vS: number;
  nnR: number;
  lockout: boolean;
  wait: boolean;
  retransmit: boolean;
  farmB: number;
  epoch: number;
  owner: string;
  retransmissions?: number;
}

export interface RaiseInput {
  sat_id: string;
  mnemonic: string;
  params: Record<string, string | number>;
  critical: boolean;
  reason?: string;
  source?: string;
  procedure?: { id: string; version: string };
  interlocks?: Approval['interlocks'];
  los_utc?: string;
  /** Requester when a procedure raises it on behalf of the person who started the run. */
  by?: string;
  role?: string;
}

interface MissionStore {
  advisories: Advisory[];
  approvals: MissionApproval[];
  commands: CommandRecord[];
  audit: AuditRecord[];
  chainVerified: 'IDLE' | 'RUNNING' | 'VERIFIED' | 'BROKEN';
  /** Aggregate COP-1 counters (kept for the story and its check). Per satellite: `fop`. */
  fop1: Fop1;
  fop: Record<string, Fop1>;
  /** Demo scenario: heater A failed on AKV-03. */
  heaterFault: boolean;
  heaterBOn: boolean;

  addAdvisory: (a: Advisory) => void;
  setAdvisoryState: (id: string, state: Advisory['state']) => void;
  requestApproval: (a: MissionApproval) => void;
  decideApproval: (id: string, approve: boolean, by: string, reason?: string) => void;
  addCommand: (c: CommandRecord) => void;
  setCommandStatus: (id: string, status: CommandRecord['status'], approvedBy?: string) => void;
  /** One path for every command the console raises: console, procedure steps, services. */
  raiseCommand: (c: RaiseInput) => { command_id: string; approval_id?: string };
  /** Withdraw a command nobody has radiated yet. Returns why not, or null when done. */
  cancelCommand: (id: string, by: string) => string | null;
  markRadiated: (id: string) => void;
  noteCommand: (id: string, note: string) => void;
  fopOf: (satId: string) => Fop1;
  fopDirective: (satId: string, directive: 'UNLOCK' | 'SET_VR', by: string) => void;
  appendAudit: (entry: Omit<AuditRecord, 'record_id' | 'prev_record_sha256' | 'bytes_sha256'> & { bytes_sha256?: string }) => void;
  verifyChain: () => void;
  injectHeaterFault: () => void;
  switchHeaterB: () => void;
  reset: () => void;
}

const FINAL = new Set<CommandRecord['status']>(['COMPLETED', 'FAILED', 'REJECTED', 'CANCELLED']);
export const isFinalStatus = (s: CommandRecord['status']) => FINAL.has(s);

const FOP1_SEED: Fop1 = { state: 'S1', vS: 41, nnR: 41, lockout: false, wait: false, retransmit: false, farmB: 3, epoch: 17, owner: 'tc-encoder-2' };

const actor = () => useAuthStore.getState().user;
const idOf = (name: string) => PEOPLE.find((p) => p.name === name)?.id ?? 'SYS';
const paramText = (p: Record<string, string | number>) => Object.entries(p).map(([k, v]) => `${k}=${v}`).join(' ');
/** Next free number for CMD-/AP- ids: above every command already held (seeded or restored after a reload). */
const nextSeq = (commands: CommandRecord[]) => 1 + commands.reduce((m, c) => Math.max(m, Number(c.command_id.replace(/\D/g, '')) || 0), 100);
/** Pending, and its pass has not ended: what every "waiting" count counts. */
export const isWaiting = (a: MissionApproval, now = Date.now()) => a.state === 'PENDING' && !a.withdrawn && Date.parse(a.expires_utc) > now;

export const useMissionStore = create<MissionStore>()(persist((set, get) => ({
  advisories: ADVISORIES,
  approvals: SEED_APPROVALS,
  commands: SEED_COMMANDS,
  audit: seedAudit(),
  chainVerified: 'IDLE',
  fop1: FOP1_SEED,
  fop: {},
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
    if (!appr || appr.state !== 'PENDING') return;
    set((s) => ({
      approvals: s.approvals.map((a) =>
        a.approval_id === id
          ? { ...a, state: approve ? 'APPROVED' : 'REJECTED', decided_by: by, decided_utc: new Date().toISOString(), reject_reason: reason }
          : a
      ),
    }));
    get().setCommandStatus(appr.command_id, approve ? 'RELEASED' : 'REJECTED', by);
    get().appendAudit({
      timestamp_utc: new Date().toISOString(),
      operator_id: idOf(by), operator_name: by, sat_id: appr.sat_id,
      command_mnemonic: appr.mnemonic,
      procedure_id: appr.procedure_id ?? '—', procedure_version: appr.procedure_version ?? '—',
      sequence_count: get().fopOf(appr.sat_id).vS,
      result: approve ? 'ACK' : 'NACK',
      params_summary: `${appr.command_id} ${approve ? 'approved (step-up passkey, acr=2)' : `rejected: ${reason ?? 'no reason'}`} · requested by ${appr.requested_by} · ${paramText(appr.params)}`,
    });
  },

  addCommand: (c) => set((s) => (s.commands.some((x) => x.command_id === c.command_id) ? s : { commands: [c, ...s.commands] })),

  setCommandStatus: (id, status, approvedBy) =>
    set((s) => {
      const c = s.commands.find((x) => x.command_id === id);
      const fop = { ...s.fop };
      if (c && status === 'ACCEPTED' && c.status !== 'ACCEPTED') {
        const f = fop[c.sat_id] ?? fopSeed(c.sat_id);
        const nnR = f.nnR + 1;
        fop[c.sat_id] = { ...f, nnR, vS: Math.max(f.vS, nnR) };
      }
      return {
        commands: s.commands.map((x) => (x.command_id === id ? { ...x, status, approved_by: approvedBy ?? x.approved_by } : x)),
        fop1: status === 'ACCEPTED' ? { ...s.fop1, vS: s.fop1.vS + 1, nnR: s.fop1.nnR + 1 } : s.fop1,
        fop,
      };
    }),

  raiseCommand: (c) => {
    const n = nextSeq(get().commands);
    const me = c.by ? (PEOPLE.find((p) => p.name === c.by) ?? actor()) : actor();
    const role = c.role ?? useAuthStore.getState().activeRole;
    const command_id = `CMD-${n}`;
    const now = new Date().toISOString();
    const approval_id = c.critical ? `AP-${n}` : undefined;
    get().addCommand({
      command_id, sat_id: c.sat_id, mnemonic: c.mnemonic, params: c.params, requested_by: me.name,
      epoch: get().fopOf(c.sat_id).epoch, utc: now, critical: c.critical, source: c.source, approval_id,
      status: c.critical ? 'AWAITING_APPROVAL' : 'RELEASED', // routine: the release pipeline takes it from here
    });
    if (approval_id) {
      get().requestApproval({
        approval_id, command_id, sat_id: c.sat_id, mnemonic: c.mnemonic, params: c.params, reason: c.reason ?? '',
        requested_by: me.name, requester_role: role, requested_utc: now,
        expires_utc: new Date(Date.now() + 20 * 60_000).toISOString(), state: 'PENDING',
        interlocks: c.interlocks ?? [], los_utc: c.los_utc, source: c.source,
        procedure_id: c.procedure?.id, procedure_version: c.procedure?.version,
      });
    }
    get().appendAudit({
      timestamp_utc: now, operator_id: me.id, operator_name: me.name, sat_id: c.sat_id, command_mnemonic: c.mnemonic,
      procedure_id: c.procedure?.id ?? '—', procedure_version: c.procedure?.version ?? '—', sequence_count: get().fopOf(c.sat_id).vS,
      result: 'ACK', params_summary: `${command_id} ${c.critical ? `approval requested (${approval_id})` : 'released to the uplink'} · ${paramText(c.params)}${c.reason ? ` · why: ${c.reason}` : ''}`,
    });
    return { command_id, approval_id };
  },

  cancelCommand: (id, by) => {
    const c = get().commands.find((x) => x.command_id === id);
    if (!c) return 'No such command.';
    if (isFinalStatus(c.status)) return `Already ${c.status.toLowerCase()}.`;
    if (c.radiated || (c.status !== 'AWAITING_APPROVAL' && c.status !== 'RELEASED')) return 'Already radiated: a command on its way to the spacecraft cannot be called back.';
    set((s) => ({
      commands: s.commands.map((x) => (x.command_id === id ? { ...x, status: 'CANCELLED', note: `Cancelled by ${by}` } : x)),
      approvals: s.approvals.map((a) => (a.command_id === id && a.state === 'PENDING'
        ? { ...a, state: 'REJECTED', withdrawn: true, decided_by: by, decided_utc: new Date().toISOString(), reject_reason: 'Withdrawn by the requester' } : a)),
    }));
    get().appendAudit({
      timestamp_utc: new Date().toISOString(), operator_id: idOf(by), operator_name: by, sat_id: c.sat_id, command_mnemonic: c.mnemonic,
      procedure_id: '—', procedure_version: '—', sequence_count: get().fopOf(c.sat_id).vS, result: 'NACK',
      params_summary: `${id} cancelled before radiation · ${paramText(c.params)}`,
    });
    return null;
  },

  markRadiated: (id) =>
    set((s) => {
      const c = s.commands.find((x) => x.command_id === id);
      if (!c || c.radiated) return s;
      const f = s.fop[c.sat_id] ?? fopSeed(c.sat_id);
      return {
        commands: s.commands.map((x) => (x.command_id === id ? { ...x, radiated: true } : x)),
        fop: { ...s.fop, [c.sat_id]: { ...f, vS: f.vS + 1 } },
      };
    }),

  noteCommand: (id, note) => set((s) => ({ commands: s.commands.map((x) => (x.command_id === id ? { ...x, note } : x)) })),

  fopOf: (satId) => get().fop[satId] ?? fopSeed(satId),

  fopDirective: (satId, directive, by) => {
    const f = get().fopOf(satId);
    const next: Fop1 = directive === 'UNLOCK'
      ? { ...f, lockout: false, wait: false, retransmit: false, state: 'S1' }
      : { ...f, nnR: f.vS, lockout: false, retransmit: false, state: 'S1' };
    set((s) => ({ fop: { ...s.fop, [satId]: next } }));
    get().appendAudit({
      timestamp_utc: new Date().toISOString(), operator_id: idOf(by), operator_name: by, sat_id: satId,
      command_mnemonic: directive === 'UNLOCK' ? 'COP1_UNLOCK' : 'COP1_SET_VR', procedure_id: '—', procedure_version: '—',
      sequence_count: next.vS, result: 'ACK', params_summary: directive === 'UNLOCK' ? 'FARM unlock directive (BC frame)' : `Set V(R)=${next.vS} directive (BC frame)`,
    });
  },

  appendAudit: (entry) =>
    set((s) => {
      const prev = s.audit[0]?.bytes_sha256 ?? GENESIS;
      const body = JSON.stringify(entry) + prev;
      return {
        audit: [{
          ...entry,
          record_id: `AUD-${AUDIT_BASE + s.audit.length}`,
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
      advisories: ADVISORIES, approvals: SEED_APPROVALS, commands: SEED_COMMANDS, audit: seedAudit(), chainVerified: 'IDLE',
      heaterFault: false, heaterBOn: false, fop1: FOP1_SEED, fop: {},
    }),
}), {
  name: demoKey('mission'), storage: demoStorage,
  partialize: (s) => ({ advisories: s.advisories, approvals: s.approvals, commands: s.commands, audit: s.audit, fop1: s.fop1, fop: s.fop, heaterFault: s.heaterFault, heaterBOn: s.heaterBOn }) as unknown as MissionStore,
  // A reload drops the simulated uplink's timers: a command already on board finishes, one already radiated is acknowledged.
  merge: (saved, cur) => {
    const p = (saved ?? {}) as Partial<MissionStore>;
    const commands = (p.commands ?? cur.commands).map((c) => (c.status === 'ACCEPTED' || c.status === 'STARTED' || (c.status === 'RELEASED' && c.radiated) ? { ...c, status: 'COMPLETED' as const } : c));
    return { ...cur, ...p, commands };
  },
}));

export const demoAdvisoryNow = (): Advisory => ({ ...DEMO_ADVISORY, detected_utc: new Date().toISOString() });


