import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { demoKey, demoStorage } from '../demo/persist';
import type { PassState } from '../types';

/** What can be done to a pass. Which of these each pass state offers is configuration, not code. */
export const PASS_ACTIONS = {
  reschedule: { label: 'Reschedule or cancel booking', route: 'schedule' },
  editPlan: { label: 'Edit planned procedures and commands', route: 'procedure' },
  swapStation: { label: 'Swap or request an alternate station', route: 'network' },
  backupStation: { label: 'Book a backup station', route: 'network' },
  preChecks: { label: 'Run the pre-pass checklist (link config, dictionary, time correlation, station health)' },
  loadQueue: { label: 'Load the uplink queue', route: 'uplink' },
  standby: { label: 'Arm or hand over to the standby gateway' },
  sendCommands: { label: 'Send commands', route: 'command' },
  monitor: { label: 'Monitor link, virtual channels and latency' },
  backfill: { label: 'Review gaps and request backfill' },
  signOff: { label: 'Sign off the pass (all gaps resolved)' },
  report: { label: 'Open the pass report', route: 'report' },
  replay: { label: 'Replay the pass', route: 'playback' },
} as const;
export type PassActionId = keyof typeof PASS_ACTIONS;

export interface PassStateConfig { label: string; description: string; actions: PassActionId[] }

export const DEFAULT_PASS_CONFIG: Record<PassState, PassStateConfig> = {
  SCHEDULED: { label: 'Planned', description: 'Booked with a station; nothing is running yet. The plan can still change freely.', actions: ['reschedule', 'editPlan', 'swapStation', 'backupStation'] },
  PREPARING: { label: 'Pre-pass checks', description: 'AOS−10 min: the station, link and dictionary are being verified and the uplink queue loaded.', actions: ['editPlan', 'preChecks', 'loadQueue', 'swapStation', 'backupStation'] },
  READY: { label: 'Ready for AOS', description: 'Checks passed; waiting for the satellite to rise. Changes now need a reason.', actions: ['loadQueue', 'standby', 'backupStation'] },
  ACTIVE: { label: 'In contact', description: 'Link is up: telemetry is flowing and commands can be sent.', actions: ['sendCommands', 'monitor', 'standby'] },
  DRAINING: { label: 'Data drain', description: 'LOS has passed; remaining frames are being drained and gaps reconciled.', actions: ['monitor', 'backfill', 'signOff'] },
  COMPLETE: { label: 'Closed', description: 'Every gap is resolved and the pass is signed off.', actions: ['report', 'replay', 'backfill'] },
};

const KEY = 'vyuh-pass-states';
const load = (): Record<PassState, PassStateConfig> => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (v) return Object.fromEntries((Object.keys(DEFAULT_PASS_CONFIG) as PassState[]).map((k) => [k, { ...DEFAULT_PASS_CONFIG[k], ...v[k] }])) as Record<PassState, PassStateConfig>;
  } catch { /* blocked or corrupt */ }
  return DEFAULT_PASS_CONFIG;
};

interface Store {
  config: Record<PassState, PassStateConfig>;
  set: (state: PassState, patch: Partial<PassStateConfig>) => void;
  reset: () => void;
}

export const usePassConfigStore = create<Store>((set, get) => ({
  config: load(),
  set: (state, patch) => {
    const config = { ...get().config, [state]: { ...get().config[state], ...patch } };
    try { localStorage.setItem(KEY, JSON.stringify(config)); } catch { /* ignore */ }
    set({ config });
  },
  reset: () => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } set({ config: DEFAULT_PASS_CONFIG }); },
}));

/** What operators have done to each pass session (pre-pass checks, standby, backfill, sign-off). Sample: no Pass Orchestrator API yet. */
export interface PassOps {
  checks?: { name: string; ok: boolean; text: string }[];
  checkedBy?: string; checkedUtc?: string;
  standby?: 'ARMED' | 'TAKEOVER';
  backfillRequested?: string;
  signedOffBy?: string; signedOffUtc?: string;
  /** Pass report: how the open gaps were resolved, and who made it final. */
  gapResolution?: 'DONE' | 'UNRECOVERABLE';
  finalBy?: string; finalUtc?: string;
}
interface OpsStore { ops: Record<string, PassOps>; put: (session: string, p: Partial<PassOps>) => void }
export const usePassOpsStore = create<OpsStore>()(persist((set) => ({
  ops: {},
  put: (session, p) => set((s) => ({ ops: { ...s.ops, [session]: { ...s.ops[session], ...p } } })),
}), { name: demoKey('passOps'), storage: demoStorage }));
