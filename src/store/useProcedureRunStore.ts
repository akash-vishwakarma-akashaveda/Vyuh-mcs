import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { PROCEDURE_RUN, isoAt } from '../demo/scenario';
import { demoKey, demoStorage } from '../demo/persist';
import { PROCEDURES, PROCEDURE_STEPS, ProcStepDef, StepCond } from '../data/mission';
import { useAuthStore } from './useAuthStore';
import { useFleetStore } from './useFleetStore';
import { isFinalStatus, useMissionStore } from './useMissionStore';
import { contactOf, interlocksFor, snapshot } from '../screens/commanding/gates';
import { isStale } from '../utils/stalenessUtils';
import { COMMAND_DICT } from '../ops/commandDict';

/**
 * Procedure runs (S14). The run lives here, not in the runner screen, and the engine is ticked by
 * the release pipeline (live/release.ts) — so a run waiting for an approval carries on by itself
 * once a Flight Director approves, whether or not anyone has the runner open (C1).
 */

export type RunState = 'RUNNING' | 'WAITING' | 'HELD' | 'PAUSED' | 'COMPLETED' | 'ABORTED';
export type WaitingFor = 'NEXT' | 'OPERATOR' | 'APPROVAL' | 'COMMAND' | 'CONDITION' | 'PUS1';
export type StepStatus = 'TODO' | 'ACTIVE' | 'DONE' | 'FAILED' | 'SKIPPED';

export interface StepRun { status: StepStatus; note?: string; at?: string; commandId?: string; approvalId?: string; startedAt?: number }

export interface Run {
  id: string;
  procId: string;
  version: string;
  satId: string;
  startedBy: string;
  startedRole: string;
  startedUtc: string;
  finishedUtc?: string;
  mode: 'STEP' | 'AUTO';
  breakpoints: number[];
  state: RunState;
  waitingFor?: WaitingFor;
  /** State to go back to on Resume. */
  pausedFrom?: RunState;
  /** The operator asked for the next step (step-by-step mode, or past a breakpoint). */
  go: boolean;
  cursor: number;
  steps: StepRun[];
  log: { t: string; x: string }[];
  lastCommandId?: string;
  held?: string;
}

interface Store {
  runs: Run[];
  /** Released versions (the editor bumps them); a run keeps the one it started with. */
  released: Record<string, string>;
  start: (procId: string, satId: string, mode: Run['mode']) => string;
  setMode: (id: string, mode: Run['mode']) => void;
  toggleBreakpoint: (id: string, n: number) => void;
  next: (id: string) => void;
  confirm: (id: string) => void;
  retry: (id: string) => void;
  skip: (id: string, reason: string) => void;
  pause: (id: string) => void;
  resume: (id: string) => void;
  abort: (id: string, reason: string) => void;
  release: (procId: string, version: string) => void;
}

const stamp = () => new Date().toISOString().slice(11, 19);
const me = () => useAuthStore.getState().user;
/** Next run number: above every run already held (seeded or restored after a reload). */
const nextRunSeq = (): number => 1 + useProcedureRunStore.getState().runs.reduce((m: number, r: Run) => Math.max(m, Number(r.id.split('-')[1]) || 0), 410);

/** The finished run of the scenario: PR-PL-022 on AKV-03 over HYD earlier today. */
function seedRun(): Run {
  const r = PROCEDURE_RUN;
  const t = (min: number) => isoAt(min).slice(11, 19);
  const notes = ['Check passed: in contact with HYD', `IMG_CAPTURE acknowledged by the spacecraft (${r.commands[0]})`, `TM(1,7) completion received for ${r.commands[0]}`,
    `DUMP_START acknowledged by the spacecraft (${r.commands[1]})`, `TM(1,7) completion received for ${r.commands[1]}`];
  const mins = [-47, -46, -45.5, -44, -40];
  return {
    id: r.id, procId: r.procId, version: r.version, satId: r.satId, startedBy: r.startedBy, startedRole: r.startedRole,
    startedUtc: isoAt(r.startedMin), finishedUtc: isoAt(r.finishedMin), mode: 'AUTO', breakpoints: [], state: 'COMPLETED', go: false, cursor: 4,
    steps: notes.map((note, i) => ({ status: 'DONE' as StepStatus, note, at: t(mins[i]), commandId: i === 1 ? r.commands[0] : i === 3 ? r.commands[1] : undefined })),
    log: [{ t: t(r.finishedMin), x: 'Procedure completed' }, ...notes.map((x, i) => ({ t: t(mins[i]), x: `Step ${i + 1}: ${x}` })).reverse(),
      { t: t(r.startedMin), x: `Run started by ${r.startedBy}, run to breakpoint` }],
    lastCommandId: r.commands[1],
  };
}

export const versionOf = (procId: string) =>
  useProcedureRunStore.getState().released[procId] ?? PROCEDURES.find((p) => p.id === procId)?.version ?? '—';

export const stepsOf = (procId: string): ProcStepDef[] => PROCEDURE_STEPS[procId] ?? [];

function audit(run: Run, text: string, result: 'ACK' | 'NACK' = 'ACK', by = me().name) {
  useMissionStore.getState().appendAudit({
    timestamp_utc: new Date().toISOString(), operator_id: useAuthStore.getState().user.name === by ? me().id : 'PROC', operator_name: by,
    sat_id: run.satId, command_mnemonic: 'PROCEDURE', procedure_id: run.procId, procedure_version: run.version,
    sequence_count: run.cursor + 1, result, params_summary: `run ${run.id}: ${text}`,
  });
}

/** Evaluate a step condition on live values. Stale or missing telemetry never satisfies it. */
export function evaluate(cond: StepCond | undefined, satId: string): { ok: boolean; text: string } {
  if (!cond || 'always' in cond) return { ok: true, text: 'no condition' };
  if ('contact' in cond) {
    const c = contactOf(satId);
    return c.inContact ? { ok: true, text: `in contact with ${c.station}` } : { ok: false, text: `${satId} is not in contact${c.nextAos ? ` (next AOS ${new Date(c.nextAos).toISOString().slice(11, 16)} ${c.nextStation})` : ''}` };
  }
  const p = useFleetStore.getState().cvt[satId]?.[cond.param];
  if (!p || isStale(p)) return { ok: false, text: `${cond.param} has no fresh value, so the check fails closed` };
  const v = p.eu_value;
  const ok = cond.op === '<' ? v < cond.value : v > cond.value;
  const digits = Math.abs(cond.value) < 1 ? 3 : 1;
  return { ok, text: `${cond.param} ${v.toFixed(digits)} ${cond.unit ?? ''} ${ok ? 'is' : 'is not'} ${cond.op === '<' ? 'below' : 'above'} ${cond.value} ${cond.unit ?? ''}`.replace(/\s+/g, ' ').trim() };
}

export const useProcedureRunStore = create<Store>()(persist((set, get) => {
  const patch = (id: string, f: (r: Run) => Partial<Run>) =>
    set((s) => ({ runs: s.runs.map((r) => (r.id === id ? { ...r, ...f(r) } : r)) }));
  const log = (id: string, x: string) => patch(id, (r) => ({ log: [{ t: stamp(), x }, ...r.log] }));
  const run = (id: string) => get().runs.find((r) => r.id === id);

  return {
    runs: [seedRun()],
    released: {},

    start: (procId, satId, mode) => {
      const id = `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(nextRunSeq()).padStart(4, '0')}`;
      const steps = stepsOf(procId);
      const r: Run = {
        id, procId, version: versionOf(procId), satId, startedBy: me().name, startedRole: useAuthStore.getState().activeRole,
        startedUtc: new Date().toISOString(), mode, breakpoints: [], state: 'RUNNING', go: true, cursor: 0,
        steps: steps.map(() => ({ status: 'TODO' as StepStatus })),
        log: [{ t: stamp(), x: `Run started by ${me().name}, ${mode === 'STEP' ? 'step by step' : 'run to breakpoint'}` }],
      };
      set((s) => ({ runs: [r, ...s.runs] }));
      audit(r, `started on ${satId}`);
      return id;
    },

    setMode: (id, mode) => { patch(id, () => ({ mode })); log(id, `Mode set to ${mode === 'STEP' ? 'step by step' : 'run to breakpoint'}`); },
    toggleBreakpoint: (id, n) => patch(id, (r) => ({ breakpoints: r.breakpoints.includes(n) ? r.breakpoints.filter((b) => b !== n) : [...r.breakpoints, n] })),

    next: (id) => patch(id, (r) => (r.state === 'WAITING' && r.waitingFor === 'NEXT' ? { go: true, state: 'RUNNING', waitingFor: undefined } : {})),

    confirm: (id) => {
      const r = run(id);
      if (!r || r.waitingFor !== 'OPERATOR') return;
      log(id, `Step ${r.cursor + 1} confirmed by ${me().name}`);
      finishStep(id, 'DONE', `Confirmed by ${me().name}`);
    },

    retry: (id) => {
      const r = run(id);
      if (!r || r.state !== 'HELD') return;
      patch(id, (x) => ({ state: 'RUNNING', held: undefined, go: true, steps: x.steps.map((s, i) => (i === x.cursor ? { status: 'TODO' } : s)) }));
      log(id, `Step ${r.cursor + 1} retried by ${me().name}`);
    },

    skip: (id, reason) => {
      const r = run(id);
      if (!r || r.state !== 'HELD') return;
      log(id, `Step ${r.cursor + 1} skipped by ${me().name}: ${reason}`);
      audit(r, `step ${r.cursor + 1} skipped: ${reason}`, 'NACK');
      patch(id, () => ({ state: 'RUNNING', held: undefined }));
      finishStep(id, 'SKIPPED', `Skipped by ${me().name}: ${reason}`);
    },

    pause: (id) => {
      const r = run(id);
      if (!r || !(r.state === 'RUNNING' || r.state === 'WAITING')) return;
      patch(id, () => ({ state: 'PAUSED', pausedFrom: r.state }));
      log(id, `Paused by ${me().name}${r.steps[r.cursor]?.commandId ? '; the command already raised carries on' : ''}`);
    },

    resume: (id) => {
      const r = run(id);
      if (!r || r.state !== 'PAUSED') return;
      patch(id, () => ({ state: r.pausedFrom ?? 'RUNNING', pausedFrom: undefined }));
      log(id, `Resumed by ${me().name}`);
    },

    abort: (id, reason) => {
      const r = run(id);
      if (!r || r.state === 'COMPLETED' || r.state === 'ABORTED') return;
      patch(id, (x) => ({ state: 'ABORTED', finishedUtc: new Date().toISOString(), steps: x.steps.map((s, i) => (i === x.cursor && s.status === 'ACTIVE' ? { ...s, status: 'FAILED', note: 'Aborted' } : s)) }));
      log(id, `Aborted by ${me().name}: ${reason}`);
      audit(r, `aborted: ${reason}`, 'NACK');
    },

    release: (procId, version) => set((s) => ({ released: { ...s.released, [procId]: version } })),
  };

  function finishStep(id: string, status: 'DONE' | 'SKIPPED', note: string) {
    const r = get().runs.find((x) => x.id === id);
    if (!r) return;
    const last = r.cursor + 1 >= r.steps.length;
    patch(id, (x) => ({
      steps: x.steps.map((s, i) => (i === x.cursor ? { ...s, status, note, at: stamp() } : s)),
      cursor: last ? x.cursor : x.cursor + 1,
      state: last ? 'COMPLETED' : 'RUNNING',
      waitingFor: undefined,
      finishedUtc: last ? new Date().toISOString() : undefined,
      go: x.mode === 'AUTO' && !x.breakpoints.includes(x.cursor + 2),
    }));
    if (last) {
      log(id, 'Procedure completed');
      audit(r, 'completed', 'ACK', r.startedBy);
    }
  }
}, { name: demoKey('procedureRuns'), storage: demoStorage, partialize: (s) => ({ runs: s.runs, released: s.released }) as unknown as Store }));

// ---- the engine ------------------------------------------------------------------------

const S = () => useProcedureRunStore.getState();
const setRun = (id: string, f: (r: Run) => Partial<Run>) =>
  useProcedureRunStore.setState((s) => ({ runs: s.runs.map((r) => (r.id === id ? { ...r, ...f(r) } : r)) }));
const logRun = (id: string, x: string) => setRun(id, (r) => ({ log: [{ t: stamp(), x }, ...r.log] }));
const setStep = (id: string, p: Partial<StepRun>) => setRun(id, (r) => ({ steps: r.steps.map((s, i) => (i === r.cursor ? { ...s, ...p } : s)) }));

function hold(r: Run, why: string) {
  setRun(r.id, (x) => ({ state: 'HELD', held: why, waitingFor: undefined, steps: x.steps.map((s, i) => (i === x.cursor ? { ...s, status: 'FAILED', note: why, at: stamp() } : s)) }));
  logRun(r.id, `Step ${r.cursor + 1} held: ${why}`);
}

function done(r: Run, note: string) {
  const last = r.cursor + 1 >= r.steps.length;
  setRun(r.id, (x) => ({
    steps: x.steps.map((s, i) => (i === x.cursor ? { ...s, status: 'DONE', note, at: stamp() } : s)),
    cursor: last ? x.cursor : x.cursor + 1, state: last ? 'COMPLETED' : 'RUNNING', waitingFor: undefined,
    finishedUtc: last ? new Date().toISOString() : undefined, go: x.mode === 'AUTO' && !x.breakpoints.includes(x.cursor + 2),
  }));
  logRun(r.id, `Step ${r.cursor + 1}: ${note}`);
  if (last) {
    logRun(r.id, 'Procedure completed');
    useMissionStore.getState().appendAudit({
      timestamp_utc: new Date().toISOString(), operator_id: 'PROC', operator_name: r.startedBy, sat_id: r.satId, command_mnemonic: 'PROCEDURE',
      procedure_id: r.procId, procedure_version: r.version, sequence_count: r.steps.length, result: 'ACK', params_summary: `run ${r.id}: completed`,
    });
  }
}

function startStep(r: Run, def: ProcStepDef) {
  setStep(r.id, { status: 'ACTIVE', startedAt: Date.now() });
  setRun(r.id, () => ({ go: false }));
  if (def.kind === 'check') {
    const e = evaluate(def.cond, r.satId);
    return e.ok ? done(r, `Check passed: ${e.text}`) : hold(r, `Check failed: ${e.text}`);
  }
  if (def.kind === 'operator') {
    setRun(r.id, () => ({ state: 'WAITING', waitingFor: 'OPERATOR' }));
    return logRun(r.id, `Step ${def.n} waiting for the operator: ${def.text}`);
  }
  if (def.kind === 'wait') {
    setRun(r.id, () => ({ state: 'WAITING', waitingFor: def.waitFor === 'pus1' ? 'PUS1' : 'CONDITION' }));
    return logRun(r.id, `Step ${def.n} waiting: ${def.text}`);
  }
  // command: the same gates as the console, then the same path (raiseCommand -> approval or release).
  const cmd = COMMAND_DICT.find((c) => c.mnemonic === def.mnemonic);
  if (!cmd) return hold(r, `${def.mnemonic} is not in the dictionary`);
  const failed = interlocksFor(cmd.mnemonic, r.satId).filter((i) => !i.pass);
  if (failed.length) return hold(r, `Interlock: ${failed.map((i) => `${i.param} ${i.value}, needs ${i.rule}`).join('; ')}`);
  const c = contactOf(r.satId);
  const { command_id, approval_id } = useMissionStore.getState().raiseCommand({
    sat_id: r.satId, mnemonic: cmd.mnemonic, params: def.params ?? {}, critical: !!def.critical, // the released procedure marks which steps need a second person
    reason: `${r.procId} step ${def.n}: ${def.text}`, source: `${r.procId} step ${def.n}`, procedure: { id: r.procId, version: r.version },
    interlocks: snapshot(cmd.mnemonic, r.satId), los_utc: c.los ? new Date(c.los).toISOString() : undefined, by: r.startedBy, role: r.startedRole,
  });
  setStep(r.id, { commandId: command_id, approvalId: approval_id });
  setRun(r.id, () => ({ state: 'WAITING', waitingFor: approval_id ? 'APPROVAL' : 'COMMAND', lastCommandId: command_id }));
  logRun(r.id, approval_id ? `Step ${def.n} sent for approval as ${approval_id}` : `${cmd.mnemonic} ${Object.entries(def.params ?? {}).map(([k, v]) => `${k}=${v}`).join(' ')} released as ${command_id}`);
}

function followStep(r: Run, def: ProcStepDef) {
  const sr = r.steps[r.cursor];
  const m = useMissionStore.getState();
  if (def.kind === 'command' && sr.commandId) {
    const c = m.commands.find((x) => x.command_id === sr.commandId);
    if (!c) return hold(r, 'The command disappeared from the uplink queue');
    const appr = sr.approvalId ? m.approvals.find((a) => a.approval_id === sr.approvalId) : undefined;
    if (r.waitingFor === 'APPROVAL' && c.status !== 'AWAITING_APPROVAL' && appr?.state === 'APPROVED') {
      logRun(r.id, `${sr.approvalId} approved by ${appr.decided_by}; released to the uplink`);
      setRun(r.id, () => ({ waitingFor: 'COMMAND' }));
    }
    if (c.status === 'ACCEPTED' || c.status === 'STARTED' || c.status === 'COMPLETED') return done(r, `${c.mnemonic} acknowledged by the spacecraft (${c.command_id})`);
    if (c.status === 'REJECTED') return hold(r, appr?.state === 'EXPIRED' ? 'The approval expired before anyone decided' : `Rejected by ${appr?.decided_by ?? 'the approver'}${appr?.reject_reason ? `: ${appr.reject_reason}` : ''}`);
    if (c.status === 'CANCELLED') return hold(r, `${c.command_id} was cancelled`);
    if (c.status === 'FAILED') return hold(r, `${c.command_id} failed${c.note ? `: ${c.note}` : ''}`);
    return;
  }
  if (def.kind === 'wait') {
    const elapsed = (Date.now() - (sr.startedAt ?? Date.now())) / 1000;
    if (def.waitFor === 'pus1') {
      const c = m.commands.find((x) => x.command_id === r.lastCommandId);
      if (!c) return done(r, 'No command to wait for');
      if (c.status === 'COMPLETED') return done(r, `TM(1,7) completion received for ${c.command_id}`);
      if (isFinalStatus(c.status)) return hold(r, `${c.command_id} ended ${c.status.toLowerCase()} instead of completing`);
    } else {
      const e = evaluate(def.cond, r.satId);
      if (e.ok) return done(r, `Condition met: ${e.text}`);
    }
    if (def.timeoutS && elapsed > def.timeoutS) hold(r, `Timed out after ${Math.round(def.timeoutS / 60) >= 1 ? `${Math.round(def.timeoutS / 60)} min` : `${def.timeoutS} s`}`);
  }
}

/** One engine step for every live run. Called every 500 ms by the release pipeline. */
export function tickProcedures() {
  for (const r of S().runs) {
    if (r.state !== 'RUNNING' && r.state !== 'WAITING') continue;
    const defs = stepsOf(r.procId);
    const def = defs[r.cursor];
    if (!def) continue;
    const sr = r.steps[r.cursor];
    if (sr.status === 'TODO') {
      if (!r.go) {
        if (r.waitingFor !== 'NEXT') {
          setRun(r.id, () => ({ state: 'WAITING', waitingFor: 'NEXT' }));
          if (r.mode === 'AUTO') logRun(r.id, `Stopped at breakpoint before step ${def.n}`);
        }
        continue;
      }
      startStep(r, def);
      continue;
    }
    if (sr.status === 'ACTIVE') followStep(r, def);
  }
}
