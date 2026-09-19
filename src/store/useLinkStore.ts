import { create } from 'zustand';
import type { LinkState } from '../realtime/connection';

export interface LatencyStats {
  p50: number;
  p99: number;
  last: number;
  samples: number;
}

/**
 * The state of the console's link to the backend. `mode` says what is driving the
 * numbers on screen: the built-in simulation ('mock', used when no backend is
 * reachable) or the live ground segment ('live', once the Realtime Gateway has
 * answered). Screens and the top bar read this to say honestly which they are showing.
 */
interface LinkStore {
  mode: 'mock' | 'live';
  state: LinkState;
  attempt: number;
  lastMessageAt: number;
  eventSeq: number;
  framesRejected: number;
  latency: LatencyStats | null;
  liveSatellites: string[];

  setMode: (mode: LinkStore['mode'], liveSatellites?: string[]) => void;
  setState: (state: LinkState, attempt: number) => void;
  setMeta: (m: { eventSeq: number; lastMessageAt: number; framesRejected: number }) => void;
  setLatency: (l: LatencyStats) => void;
}

export const useLinkStore = create<LinkStore>((set) => ({
  mode: 'mock',
  state: 'DISCONNECTED',
  attempt: 0,
  lastMessageAt: 0,
  eventSeq: 0,
  framesRejected: 0,
  latency: null,
  liveSatellites: [],

  setMode: (mode, liveSatellites) => set((s) => ({ mode, liveSatellites: liveSatellites ?? s.liveSatellites })),
  setState: (state, attempt) => set({ state, attempt }),
  setMeta: (m) => set(m),
  setLatency: (latency) => set({ latency }),
}));

export const isLiveSatellite = (satId: string) => useLinkStore.getState().liveSatellites.includes(satId);

/** Rolling end-to-end latency (gateway receive -> render), P50/P99 over the last samples. */
const window_: number[] = [];
export function recordLatency(ms: number): LatencyStats {
  window_.push(ms);
  if (window_.length > 300) window_.shift();
  const sorted = [...window_].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return { p50: at(0.5), p99: at(0.99), last: ms, samples: sorted.length };
}
