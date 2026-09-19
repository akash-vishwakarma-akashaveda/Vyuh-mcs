/**
 * Main-thread side of the live link. The Web Worker owns the socket and hands over
 * coalesced batches; this applies them to the stores — at most once per animation
 * frame, in a single store write — and reports link health and latency.
 */
import type { Param } from '../types';
import { useFleetStore } from '../store/useFleetStore';
import { recordLatency, useLinkStore } from '../store/useLinkStore';
import { useUIStore } from '../store/useUIStore';
import { Env, RealtimeConnection, Sink, ValueBatch } from './connection';
import { toParamPartial } from './mapping';
import type { AlarmView, CommandStatus, Subscription } from './protocol';
import type { ToWorker } from './worker';

export interface LiveHandlers {
  onAlarm(a: AlarmView): void;
  onStatus(s: CommandStatus): void;
  /** Resume was refused: refetch alarms/commands over REST. */
  onResync(reason: string): void;
  /** First time the gateway answers: the console is now driven by the live backend. */
  onFirstConnect(): void;
}

export function subscriptionsFor(satellites: string[]): Subscription[] {
  return [
    ...satellites.map((satellite): Subscription => ({ id: `p-${satellite}`, kind: 'PARAMS', satellite })),
    { id: 'alarms', kind: 'ALARMS', scope: ['*'] },
    { id: 'status', kind: 'STATUS', scope: ['*'] },
  ];
}

const raf: (fn: () => void) => void =
  typeof requestAnimationFrame === 'function' ? (fn) => requestAnimationFrame(fn) : (fn) => setTimeout(fn, 16);

export function startRealtime(url: string, satellites: string[], h: LiveHandlers): () => void {
  let pending = new Map<string, Record<string, Partial<Param>>>();
  let timing = { ertMs: 0 };
  let scheduled = false;
  let firstConnect = true;
  let lastLatencyPush = 0;

  const flush = () => {
    if (!scheduled) return; // the other of the two triggers (frame / timer) already ran
    scheduled = false;
    const updates = [...pending].map(([sat_id, params]) => ({ sat_id, params }));
    pending = new Map();
    if (updates.length === 0) return;
    useFleetStore.getState().applyTick(updates);

    // End-to-end: Link Gateway receive -> stores written (the next paint is one frame away).
    if (timing.ertMs > 0) {
      const now = Date.now();
      const stats = recordLatency(Math.max(0, now - timing.ertMs));
      if (now - lastLatencyPush > 1000) {
        lastLatencyPush = now;
        useLinkStore.getState().setLatency(stats);
      }
    }
    timing = { ertMs: 0 };
  };

  const onValues = (batches: ValueBatch[], t: { ertMs: number }) => {
    for (const b of batches) {
      const sat = pending.get(b.satellite) ?? {};
      for (const v of b.values) sat[v.param_id] = toParamPartial(v);
      pending.set(b.satellite, sat);
    }
    timing.ertMs = Math.max(timing.ertMs, t.ertMs);
    if (!scheduled) {
      scheduled = true;
      raf(flush); // normally: once per painted frame, in a single store write
      // Frames do not fire in hidden tabs or throttled webviews; a display that stops
      // updating there would silently show stale data, so a timer guarantees progress.
      setTimeout(flush, 100);
    }
  };

  const sink: Sink = {
    state: (state, attempt) => {
      useLinkStore.getState().setState(state, attempt);
      useUIStore.getState().setWsConnectionState(state);
      if (state === 'CONNECTED' && firstConnect) {
        firstConnect = false;
        h.onFirstConnect();
      }
    },
    values: onValues,
    alarm: (a) => h.onAlarm(a),
    status: (s) => h.onStatus(s),
    resync: (r) => h.onResync(r),
    meta: (m) => useLinkStore.getState().setMeta(m),
  };

  const subs = subscriptionsFor(satellites);

  // Preferred: the socket runs in a Worker. Fallback (no Worker, e.g. some test hosts): inline.
  if (typeof Worker !== 'undefined') {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent) => {
      const m = ev.data;
      switch (m.t) {
        case 'state': return sink.state(m.state, m.attempt);
        case 'values': return sink.values(m.batches, m.timing);
        case 'alarm': return sink.alarm(m.alarm);
        case 'status': return sink.status(m.status);
        case 'resync': return sink.resync(m.reason);
        case 'meta': return sink.meta(m.meta);
      }
    };
    worker.postMessage({ t: 'start', url, subs } satisfies ToWorker);
    return () => {
      worker.postMessage({ t: 'stop' } satisfies ToWorker);
      worker.terminate();
    };
  }

  const env: Env = {
    createSocket: (u) => new WebSocket(u) as unknown as ReturnType<Env['createSocket']>,
    now: () => Date.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (x) => clearTimeout(x as number),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (x) => clearInterval(x as number),
    random: () => Math.random(),
  };
  const conn = new RealtimeConnection(url, subs, env, sink);
  conn.start();
  return () => conn.stop();
}

/** ws(s)://host/ws/telemetry, same origin — the dev server proxies it to the gateway. */
export function defaultGatewayUrl(): string {
  const override = import.meta.env.VITE_WS_URL as string | undefined;
  if (override) return override;
  const { protocol, host } = window.location;
  return `${protocol === 'https:' ? 'wss' : 'ws'}://${host}/ws/telemetry`;
}
