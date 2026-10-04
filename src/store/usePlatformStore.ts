import { create } from 'zustand';
import { apiClient } from '../api/client';
import { recordAudit } from './govern';
import { useAuthStore } from './useAuthStore';

/**
 * Platform health (S27). Live numbers come from the simulator's pipeline registry
 * (GET /api/v1/simulator/pipeline/stats through the BFF): per-stage counters and
 * end-to-end latency. Rates are the difference between two polls.
 */

export interface StageLatency { count: number; p50_ms: number; p95_ms: number; p99_ms: number; max_ms: number }
export interface PipelineSnapshot { uptime_s: number; stages: Record<string, Record<string, number>>; latency: Record<string, StageLatency> }

/** Which counters mean "work in" and which mean "something went wrong", per stage. */
export const SERVICES: { name: string; stage: string; inKey?: string; errKeys: string[]; latency?: string }[] = [
  { name: 'Link Gateway', stage: 'link', inKey: 'frames_published', errKeys: ['decode_error', 'truncated_frames', 'spool_dropped'] },
  { name: 'Frame Processor', stage: 'frame', inKey: 'received', errKeys: ['rejected', 'unknown_scid', 'bad_fhp'] },
  { name: 'Packet extraction', stage: 'packet', inKey: 'forwarded', errKeys: ['bad_header'] },
  { name: 'Gap Replay', stage: 'gapreplay', errKeys: [] },
  { name: 'TM Processor', stage: 'tm', inKey: 'packets_in', errKeys: ['decom_error', 'unknown_apid', 'short_packet'] },
  { name: 'Live Telemetry', stage: 'cvt', inKey: 'values_published', errKeys: [] },
  { name: 'Realtime Gateway', stage: 'ws', inKey: 'values_sent', errKeys: ['delta_dropped'], latency: 'ert_to_ws' },
  { name: 'Alarm Manager', stage: 'alarm', inKey: 'events_in', errKeys: [] },
  { name: 'Anomaly engine', stage: 'anomaly', errKeys: [] },
  { name: 'Archive', stage: 'archive', errKeys: [] },
  { name: 'Uplink engines', stage: 'uplink', inKey: 'frames_sent', errKeys: ['transmit_errors', 'link_failures', 'commands_failed'] },
  { name: 'Verification', stage: 'verification', inKey: 'reports', errKeys: ['acceptance_failed', 'execution_failed', 'malformed'] },
  { name: 'Dead Letter Monitor', stage: 'deadletter', errKeys: [] },
  { name: 'Spacecraft simulator', stage: 'sim', inKey: 'frames_sent', errKeys: [] },
];

const sum = (o?: Record<string, number>) => Object.values(o ?? {}).reduce((a, b) => a + b, 0);
export const inOf = (s: PipelineSnapshot | undefined, svc: (typeof SERVICES)[number]) =>
  s?.stages[svc.stage] ? (svc.inKey ? s.stages[svc.stage][svc.inKey] ?? 0 : sum(s.stages[svc.stage])) : undefined;
export const errOf = (s: PipelineSnapshot | undefined, svc: (typeof SERVICES)[number]) =>
  svc.errKeys.reduce((a, k) => a + (s?.stages[svc.stage]?.[k] ?? 0), 0);

export interface Drill { id: string; zone: string; startedBy: string; startedAt: string; state: 'RUNNING' | 'COMPLETED' | 'ABORTED'; endedAt?: string; gapS?: number }

interface PlatformStore {
  source: 'unknown' | 'live' | 'offline';
  snap?: PipelineSnapshot; at?: number;
  prev?: PipelineSnapshot; prevAt?: number;
  error?: string;
  drills: Drill[];
  poll: () => Promise<void>;
  startDrill: (zone: string) => void;
  abortDrill: () => void;
}

let drillTimer: number | undefined;

export const usePlatformStore = create<PlatformStore>((set, get) => ({
  source: 'unknown',
  drills: [],
  poll: async () => {
    try {
      const r = await apiClient.get<PipelineSnapshot>('/simulator/pipeline/stats', { timeout: 3000 });
      if (!r.data || typeof r.data !== 'object' || !r.data.stages) throw new Error('Unexpected response');
      const s = get();
      // A pipeline reset zeroes the counters: do not report a negative rate.
      const reset = s.snap && r.data.uptime_s < s.snap.uptime_s;
      set({ source: 'live', prev: reset ? undefined : s.snap, prevAt: reset ? undefined : s.at, snap: r.data, at: Date.now(), error: undefined });
    } catch (e) {
      set({ source: 'offline', error: e instanceof Error ? e.message : String(e) });
    }
  },

  // ponytail: the drill is simulated in the browser; wire to the chaos tooling when it exists.
  startDrill: (zone) => {
    if (get().drills.some((d) => d.state === 'RUNNING')) return;
    const d: Drill = { id: `DR-${String(get().drills.length + 1).padStart(3, '0')}`, zone, startedBy: useAuthStore.getState().user.name, startedAt: new Date().toISOString(), state: 'RUNNING' };
    recordAudit('DRILL_START', `Zone failover drill ${d.id} started for ${zone} (simulated, no infrastructure touched)`, { target: zone });
    set((s) => ({ drills: [d, ...s.drills] }));
    drillTimer = window.setTimeout(() => {
      const gapS = 8 + Math.round(Math.random() * 10);
      set((s) => ({ drills: s.drills.map((x) => (x.id === d.id ? { ...x, state: 'COMPLETED', endedAt: new Date().toISOString(), gapS } : x)) }));
      recordAudit('DRILL_END', `Zone failover drill ${d.id} completed: simulated telemetry gap ${gapS} s against a 30 s budget`, { target: zone });
    }, 8000);
  },
  abortDrill: () => {
    const d = get().drills.find((x) => x.state === 'RUNNING');
    if (!d) return;
    window.clearTimeout(drillTimer);
    set((s) => ({ drills: s.drills.map((x) => (x.id === d.id ? { ...x, state: 'ABORTED', endedAt: new Date().toISOString() } : x)) }));
    recordAudit('DRILL_END', `Zone failover drill ${d.id} aborted`, { target: d.zone, result: 'NACK' });
  },
}));

