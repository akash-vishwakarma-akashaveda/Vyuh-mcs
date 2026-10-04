import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Advisory, UserRole } from '../types';
import { ADVISORY_DECISIONS, isoAt } from '../demo/scenario';
import { demoKey, demoStorage } from '../demo/persist';
import { can } from '../auth/policy';
import { useFleetStore } from './useFleetStore';
import { useMissionStore } from './useMissionStore';

/**
 * Decisions on anomaly advisories (S20). The advisory itself lives in the mission store; this
 * keeps who decided, why, and when, so a decision can be explained and reversed within 24 h.
 * Each decision is a training label for the next model and is written to the audit ledger.
 */
export interface Decision {
  state: 'CONFIRMED' | 'DISMISSED';
  by: string;
  role: UserRole;
  at: string;
  reason: string;
  previous: Advisory['state'];
}
export interface Actor { id: string; name: string; role: UserRole }
type Result = { ok: true } | { ok: false; reason: string };

export const UNDO_WINDOW_MS = 24 * 3600_000;

/** ML engineers own the model; operators and directors work the alarms an advisory points at. */
export function canDecide(role: UserRole): Result {
  if (can('model:promote', role).allowed || can('alarm:ack', role).allowed) return { ok: true };
  return { ok: false, reason: `${role} cannot decide on advisories. Requires ML Engineer, Spacecraft Operator or Flight Director.` };
}

interface Sample { t: number; v: number }

interface Store {
  decisions: Record<string, Decision>;
  /** Recent values of watched parameters, sampled from the live current-value table: key `${sat}:${param}`. */
  samples: Record<string, Sample[]>;
  compare: boolean;
  decide: (id: string, state: Decision['state'], reason: string, actor: Actor) => Result;
  undo: (id: string, actor: Actor) => Result;
  setCompare: (on: boolean) => void;
  watch: (keys: string[]) => void;
}

const audit = (actor: Actor, sat: string, text: string, result: 'ACK' | 'NACK' = 'ACK') =>
  useMissionStore.getState().appendAudit({
    timestamp_utc: new Date().toISOString(), operator_id: actor.id, operator_name: actor.name, sat_id: sat,
    command_mnemonic: 'ADVISORY_DECISION', procedure_id: '—', procedure_version: '—', sequence_count: 0, result, params_summary: text,
  });

let watched = new Set<string>();
const MAX = 240;

/** Decisions already taken in the scenario, with the state each advisory had before. */
const SEED_DECISIONS: Record<string, Decision> = Object.fromEntries(Object.entries(ADVISORY_DECISIONS).map(([id, d]) => [id, {
  state: d.state, by: d.by, role: d.role, at: isoAt(d.min), reason: d.reason, previous: 'NEW' as Advisory['state'],
}]));

export const useAdvisoryStore = create<Store>()(persist((set, get) => ({
  decisions: SEED_DECISIONS,
  samples: {},
  compare: false,

  decide: (id, state, reason, actor) => {
    const g = canDecide(actor.role); if (!g.ok) return g;
    const a = useMissionStore.getState().advisories.find((x) => x.advisory_id === id);
    if (!a) return { ok: false, reason: 'No such advisory.' };
    if (a.state !== 'NEW') return { ok: false, reason: 'Already decided. Undo the decision first.' };
    if (state === 'DISMISSED' && reason.trim().length < 8) return { ok: false, reason: 'Say why it is not an anomaly (at least 8 characters).' };
    useMissionStore.getState().setAdvisoryState(id, state);
    set((s) => ({ decisions: { ...s.decisions, [id]: { state, by: actor.name, role: actor.role, at: new Date().toISOString(), reason: reason.trim(), previous: a.state } } }));
    audit(actor, a.sat_id, `${id} ${state === 'CONFIRMED' ? 'confirmed as a real anomaly' : 'dismissed'}${reason.trim() ? `: ${reason.trim()}` : ''}`, state === 'CONFIRMED' ? 'ACK' : 'NACK');
    return { ok: true };
  },

  undo: (id, actor) => {
    const g = canDecide(actor.role); if (!g.ok) return g;
    const d = get().decisions[id];
    const a = useMissionStore.getState().advisories.find((x) => x.advisory_id === id);
    if (!a || a.state === 'NEW') return { ok: false, reason: 'Nothing to undo.' };
    if (!d) return { ok: false, reason: 'This decision was recorded before this shift and is outside the 24 h window.' };
    if (Date.now() - Date.parse(d.at) > UNDO_WINDOW_MS) return { ok: false, reason: 'Decisions can be changed for 24 h. This one is older.' };
    useMissionStore.getState().setAdvisoryState(id, 'NEW');
    set((s) => { const x = { ...s.decisions }; delete x[id]; return { decisions: x }; });
    audit(actor, a.sat_id, `${id} decision (${d.state.toLowerCase()} by ${d.by}) withdrawn, back to new`);
    return { ok: true };
  },

  setCompare: (on) => set({ compare: on }),

  watch: (keys) => { watched = new Set([...watched, ...keys]); },
}), { name: demoKey('advisories'), storage: demoStorage, partialize: (s) => ({ decisions: s.decisions }) as unknown as Store }));

// Sample the watched parameters every 2 s from the live current-value table (backend or built-in simulator).
// ponytail: an in-browser ring buffer of 240 samples (8 min); replace with the archive retrieval API once it exists.
if (typeof window !== 'undefined') {
  window.setInterval(() => {
    if (watched.size === 0) return;
    const cvt = useFleetStore.getState().cvt;
    const add: Record<string, Sample> = {};
    for (const key of watched) {
      const [sat, param] = key.split(':');
      const p = cvt[sat]?.[param];
      if (p && p.quality === 0) add[key] = { t: Date.parse(p.timestamp_utc) || Date.now(), v: p.eu_value };
    }
    if (Object.keys(add).length === 0) return;
    useAdvisoryStore.setState((s) => {
      const samples = { ...s.samples };
      for (const [k, x] of Object.entries(add)) {
        const prev = samples[k] ?? [];
        if (prev.length && prev[prev.length - 1].t >= x.t) continue;
        samples[k] = [...prev, x].slice(-MAX);
      }
      return { samples };
    });
  }, 2000);
}
