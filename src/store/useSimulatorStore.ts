import { create } from 'zustand';
import type { UserRole } from '../types';
import { can } from '../auth/policy';
import { useFleetStore } from './useFleetStore';
import { useMissionStore } from './useMissionStore';

/**
 * The backend spacecraft simulator, through the Operator BFF (/api/v1/simulator/…): faults per
 * satellite, the OPS-SAT flight-data replay, space-to-ground link impairments and the per-stage
 * pipeline counters. Shared by the Simulator screen (S23) and the Simulator Lab page.
 * Plain fetch, not the axios client: a 401 here must not sign the operator out of the console.
 */
export const SIM_API = '/api/v1/simulator';

export async function simCall<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const r = await fetch(SIM_API + path, { method, credentials: 'include', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let j: unknown = {};
  try { j = text ? JSON.parse(text) : {}; } catch { j = {}; }
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `The simulator answered HTTP ${r.status}`);
  return j as T;
}

export type Stages = Record<string, Record<string, number>>;
export interface Lat { count: number; p50_ms: number; p95_ms: number; p99_ms: number; max_ms: number }
export interface Stats { uptime_s: number; stages: Stages; latency: Record<string, Lat> }
export interface Replay {
  state: string; error?: string; samples: number; segments: number; anomaly_segments: number; position: number; speed: number; loop: boolean;
  replay_seconds: number; virtual_seconds: number; recorded_utc: string; samples_emitted: number; anomaly_samples_emitted: number; frames: number; connected: boolean;
}
export interface Impairments {
  enabled: boolean; scope: string; ber: number; drop_pct: number; burst_pct: number; burst_len: number; dup_pct: number; reorder_pct: number; reorder_depth: number;
  garbage_pct: number; asm_corrupt_pct: number; truncate_pct: number; wrong_scid_pct: number;
}
export interface Events { detections?: { param: string; kind: string; score: number; value: number; obt: string }[]; dead_letters?: { error_type: string; scid: number; reason?: string; detail?: string; received_time: string }[] }

export const CLEAN: Impairments = { enabled: false, scope: 'OPSSAT-1', ber: 0, drop_pct: 0, burst_pct: 0, burst_len: 10, dup_pct: 0, reorder_pct: 0, reorder_depth: 3, garbage_pct: 0, asm_corrupt_pct: 0, truncate_pct: 0, wrong_scid_pct: 0 };
export const PRESETS: Record<string, Partial<Impairments>> = {
  'Clean link': {},
  'Bit errors': { ber: 1e-4 },
  'Lossy (2 %)': { drop_pct: 2 },
  Fades: { burst_pct: 1, burst_len: 10 },
  'Two stations': { dup_pct: 5 },
  'Out of order': { reorder_pct: 5, reorder_depth: 3 },
  'Bad pass': { ber: 1e-5, drop_pct: 1, dup_pct: 2, reorder_pct: 2, reorder_depth: 2, garbage_pct: 1, truncate_pct: 0.5 },
};
export const FIELDS: [keyof Impairments, string, number, number, number][] = [
  ['ber', 'Bit error rate', 0, 0.001, 0.00001], ['drop_pct', 'Frame loss %', 0, 20, 0.5], ['burst_pct', 'Fade chance %', 0, 10, 0.5], ['burst_len', 'Fade length (frames)', 1, 50, 1],
  ['dup_pct', 'Duplicates %', 0, 20, 0.5], ['reorder_pct', 'Reordered %', 0, 20, 0.5], ['reorder_depth', 'Reorder depth', 1, 16, 1], ['garbage_pct', 'Garbage before frame %', 0, 20, 0.5],
  ['asm_corrupt_pct', 'Damaged sync marker %', 0, 10, 0.5], ['truncate_pct', 'Truncated frames %', 0, 10, 0.5], ['wrong_scid_pct', 'Foreign spacecraft %', 0, 10, 0.5],
];

export interface ScenarioRun { id: string; sat: string; verdict: 'RUNNING' | 'PASSED' | 'FAILED' | 'ABORTED'; started: string; ended?: string; by: string; log: string[] }
export interface Actor { id: string; name: string; role: UserRole }
type Result = { ok: true } | { ok: false; reason: string };

interface Store {
  online: boolean | null;
  error: string;
  stats: Stats | null;
  prev: Stats | null;
  replay: Replay | null;
  link: Impairments;
  faults: Record<string, string>;
  events: Events;
  /** Console-side option read by the command console: treat interlock telemetry as stale so gates fail closed. */
  staleInterlock: boolean;
  runs: Record<string, ScenarioRun>;
  log: string[];

  start: () => () => void;
  clearError: () => void;
  inject: (sat: string, fault: string, actor: Actor) => Promise<Result>;
  clearFault: (sat: string, actor: Actor) => Promise<Result>;
  dropNextTc: (actor: Actor) => Promise<Result>;
  replayControl: (body: Record<string, unknown>, actor: Actor) => Promise<Result>;
  applyLink: (next: Impairments, actor: Actor) => Promise<Result>;
  setStaleInterlock: (on: boolean, actor: Actor) => Result;
  runScenario: (id: string, sat: string, actor: Actor) => Result;
}

const gate = (role: UserRole): Result => { const d = can('sim:run', role); return d.allowed ? { ok: true } : { ok: false, reason: d.reason ?? 'Not allowed' }; };
const audit = (actor: Actor, sat: string, mnemonic: string, text: string, result: 'ACK' | 'NACK' = 'ACK') =>
  useMissionStore.getState().appendAudit({
    timestamp_utc: new Date().toISOString(), operator_id: actor.id, operator_name: actor.name, sat_id: sat, command_mnemonic: mnemonic,
    procedure_id: '—', procedure_version: '—', sequence_count: 0, result, params_summary: `env=sim ${text}`,
  });

/** What the console's own simulation can fly when the backend simulator is off. */
export const BUILT_IN_SAT = 'AKV-03';
const BUILT_IN_FAULTS = ['HEATER_A_FAIL', 'HTR_B_ON'];

let users = 0;
let timer: number | undefined;
const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

export const useSimulatorStore = create<Store>((set, get) => {
  const stamp = (text: string) => set((s) => ({ log: [`${new Date().toISOString().slice(11, 19)}  ${text}`, ...s.log].slice(0, 60) }));
  const guarded = async (actor: Actor, fn: () => Promise<void>, ok: string): Promise<Result> => {
    const g = gate(actor.role); if (!g.ok) return g;
    try { await fn(); set({ error: '' }); stamp(ok); return { ok: true }; } catch (x) { const reason = (x as Error).message; set({ error: reason }); stamp(`Failed: ${reason}`); return { ok: false, reason }; }
  };
  // Callers outside the Simulator screen (the guided demo) may act before anything has polled the backend.
  const reachable = async () => {
    if (get().online !== null) return !!get().online;
    try { await simCall('/pipeline/stats'); return true; } catch { return false; }
  };
  // Backend off: the console's own simulation still flies the heater scenario on AKV-03 (mock engine).
  const builtIn = async (sat: string, fault: string, actor: Actor): Promise<Result> => {
    const g = gate(actor.role); if (!g.ok) return g;
    if (sat !== BUILT_IN_SAT || (fault && !BUILT_IN_FAULTS.includes(fault))) return { ok: false, reason: `With the backend simulator offline, only the heater faults on ${BUILT_IN_SAT} run (in the console's own simulation).` };
    const m = useMissionStore.getState();
    if (fault === 'HEATER_A_FAIL') m.injectHeaterFault();
    else if (fault === 'HTR_B_ON') m.switchHeaterB();
    else useMissionStore.setState({ heaterFault: false, heaterBOn: false });
    set((s) => { const faults = { ...s.faults }; if (fault) faults[sat] = fault; else delete faults[sat]; return { faults }; });
    audit(actor, sat, 'SIM_FAULT', fault ? `inject ${fault} (built-in simulation)` : 'clear all faults (built-in simulation)');
    stamp(fault ? `${fault} on ${sat} (built-in simulation)` : `Faults cleared on ${sat}`);
    return { ok: true };
  };
  const tick = async () => {
    try {
      const [stats, replay, events, faults] = await Promise.all([
        simCall<Stats>('/pipeline/stats'), simCall<Replay>('/replay').catch(() => null), simCall<Events>('/pipeline/events').catch(() => ({})), simCall<Record<string, string>>('/faults'),
      ]);
      // Recovery clears a stale "not reachable" error; an action's own error stays until the next action.
      set((s) => ({ prev: s.stats, stats, replay, events, faults, online: true, error: s.online === false ? '' : s.error }));
    } catch {
      // Raised once when the simulator goes away, so Dismiss sticks while it stays offline.
      set((s) => (s.online === false ? {} : { online: false, error: 'The backend simulator is not reachable. Start bin/vyuh-mcs.exe (see docs/STARTUP.md). Controls stay off until it answers.' }));
    }
  };

  return {
    online: null, error: '', stats: null, prev: null, replay: null, link: CLEAN, faults: {}, events: {}, staleInterlock: false, runs: {}, log: [],

    start: () => {
      if (users++ === 0) {
        void tick();
        void simCall<Impairments>('/link').then((link) => set({ link })).catch(() => {});
        timer = window.setInterval(tick, 1000);
      }
      return () => { if (--users === 0) { clearInterval(timer); timer = undefined; } };
    },
    clearError: () => set({ error: '' }),

    inject: async (sat, fault, actor) => !(await reachable()) ? builtIn(sat, fault, actor) : guarded(actor, async () => {
      set({ faults: await simCall<Record<string, string>>('/faults', 'POST', { sat_id: sat, fault }) });
      audit(actor, sat, 'SIM_FAULT', `inject ${fault}`);
    }, `${fault} on ${sat}`),

    clearFault: async (sat, actor) => !(await reachable()) ? builtIn(sat, '', actor) : guarded(actor, async () => {
      set({ faults: await simCall<Record<string, string>>(`/faults/${encodeURIComponent(sat)}`, 'DELETE') });
      audit(actor, sat, 'SIM_FAULT', 'clear all faults');
    }, `Faults cleared on ${sat}`),

    dropNextTc: (actor) => guarded(actor, async () => {
      await simCall('/uplink/drop', 'POST');
      audit(actor, 'ALL', 'SIM_LINK', 'lose the next telecommand frame');
    }, 'Next telecommand frame will be lost'),

    replayControl: (body, actor) => guarded(actor, async () => { set({ replay: await simCall<Replay>('/replay', 'POST', body) }); }, `Replay ${String(body.action)}`),

    applyLink: (next, actor) => guarded(actor, async () => {
      set({ link: await simCall<Impairments>('/link', 'PUT', next) });
      audit(actor, next.scope || 'ALL', 'SIM_LINK', next.enabled ? `impairments on: loss ${next.drop_pct} %, BER ${next.ber}, dup ${next.dup_pct} %, reorder ${next.reorder_pct} %` : 'impairments off');
    }, next.enabled ? `Link impairments applied to ${next.scope || 'every spacecraft'}` : 'Link clean'),

    setStaleInterlock: (on, actor) => {
      const g = gate(actor.role); if (!g.ok) return g;
      set({ staleInterlock: on });
      stamp(on ? 'Interlock telemetry treated as stale in the command console' : 'Interlock telemetry back to its real freshness');
      audit(actor, 'ALL', 'SIM_OPTION', `stale interlock telemetry ${on ? 'on' : 'off'}`);
      return { ok: true };
    },

    /** Only scenarios that the backend can really drive are runnable; the verdict comes from observed telemetry. */
    runScenario: (id, sat, actor) => {
      const g = gate(actor.role); if (!g.ok) return g;
      if (!get().online) return { ok: false, reason: 'The backend simulator is offline.' };
      if (get().runs[id]?.verdict === 'RUNNING') return { ok: false, reason: 'Already running.' };
      const run: ScenarioRun = { id, sat, verdict: 'RUNNING', started: new Date().toISOString(), by: actor.name, log: [] };
      const upd = (p: Partial<ScenarioRun>, line?: string) => set((s) => ({ runs: { ...s.runs, [id]: { ...s.runs[id], ...p, log: line ? [...s.runs[id].log, `${new Date().toISOString().slice(11, 19)}  ${line}`] : s.runs[id].log } } }));
      set((s) => ({ runs: { ...s.runs, [id]: run } }));
      audit(actor, sat, 'SIM_SCENARIO', `${id} started`);
      const value = (p: string) => useFleetStore.getState().cvt[sat]?.[p];
      const finish = (verdict: ScenarioRun['verdict'], why: string) => { upd({ verdict, ended: new Date().toISOString() }, why); stamp(`${id} ${verdict.toLowerCase()}: ${why}`); audit(actor, sat, 'SIM_SCENARIO', `${id} ${verdict}: ${why}`, verdict === 'PASSED' ? 'ACK' : 'NACK'); };
      const waitFor = async (pred: () => boolean, s: number) => { for (let i = 0; i < s; i++) { if (pred()) return true; await sleep(1000); } return pred(); };

      void (async () => {
        try {
          if (id === 'SC-THM-01') {
            const t0 = value('BAT_TEMP')?.eu_value;
            if (t0 === undefined) return finish('ABORTED', `No live BAT_TEMP for ${sat}: is the console connected to the backend?`);
            await simCall('/faults', 'POST', { sat_id: sat, fault: 'HEATER_A_FAIL' }); upd({}, `HEATER_A_FAIL injected, BAT_TEMP ${t0.toFixed(1)} °C`);
            const fell = await waitFor(() => (value('BAT_TEMP')?.eu_value ?? t0) < t0 - 2, 90);
            if (!fell) { await simCall(`/faults/${sat}`, 'DELETE'); return finish('FAILED', 'BAT_TEMP did not fall 2 °C within 90 s of the fault'); }
            const low = value('BAT_TEMP')!.eu_value; upd({}, `BAT_TEMP fell to ${low.toFixed(1)} °C; switching heater B on`);
            await simCall('/faults', 'POST', { sat_id: sat, fault: 'HTR_B_ON' });
            const rose = await waitFor(() => (value('BAT_TEMP')?.eu_value ?? low) > low + 1, 90);
            await simCall(`/faults/${sat}`, 'DELETE'); upd({}, 'Faults cleared');
            return rose ? finish('PASSED', `BAT_TEMP recovered to ${value('BAT_TEMP')!.eu_value.toFixed(1)} °C on heater B`) : finish('FAILED', 'BAT_TEMP did not rise within 90 s of heater B on');
          }
          if (id === 'SC-LNK-02') {
            const before = await simCall<Impairments>('/link');
            const s0 = await simCall<Stats>('/pipeline/stats');
            await simCall('/link', 'PUT', { ...CLEAN, scope: '', enabled: true, drop_pct: 20, burst_pct: 5, burst_len: 20 }); upd({}, 'Link degraded: 20 % loss with fades, every spacecraft');
            await sleep(20000);
            const s1 = await simCall<Stats>('/pipeline/stats');
            await simCall('/link', 'PUT', before); upd({}, 'Link restored');
            const d = (st: string, k: string) => (s1.stages[st]?.[k] ?? 0) - (s0.stages[st]?.[k] ?? 0);
            const lost = d('frame', 'lost'), gaps = d('frame', 'gap_events'), processed = d('frame', 'processed');
            return lost > 0 && gaps > 0 && processed > 0
              ? finish('PASSED', `${lost} frames lost, ${gaps} gaps detected, ${processed} frames still processed in order`)
              : finish('FAILED', `Expected losses and gap events to be detected: lost ${lost}, gaps ${gaps}, processed ${processed}`);
          }
          finish('ABORTED', 'This scenario is not automated against the backend yet.');
        } catch (x) {
          finish('ABORTED', (x as Error).message);
        }
      })();
      return { ok: true };
    },
  };
});

/** Scenarios the backend can really run, and which satellites they need. */
export const AUTOMATED: Record<string, string> = {
  'SC-THM-01': 'Injects heater A failure, checks BAT_TEMP falls, switches heater B on, checks it recovers.',
  'SC-LNK-02': 'Degrades the link for 20 s and checks the frame processor detects the losses and gaps.',
};
