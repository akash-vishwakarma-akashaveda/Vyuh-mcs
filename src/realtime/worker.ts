/// <reference lib="webworker" />
/**
 * The Realtime Gateway link runs here, off the main thread: socket handling, frame
 * validation and coalescing never compete with rendering for the UI thread (§21.5).
 * The main thread only receives ready-to-apply batches.
 */
import { Env, RealtimeConnection, Sink } from './connection';
import type { Subscription } from './protocol';

export type ToWorker = { t: 'start'; url: string; subs: Subscription[] } | { t: 'stop' };

const env: Env = {
  createSocket: (url) => new WebSocket(url) as unknown as ReturnType<Env['createSocket']>,
  now: () => Date.now(),
  setTimeout: (fn, ms) => self.setTimeout(fn, ms),
  clearTimeout: (h) => self.clearTimeout(h as number),
  setInterval: (fn, ms) => self.setInterval(fn, ms),
  clearInterval: (h) => self.clearInterval(h as number),
  random: () => Math.random(),
};

const sink: Sink = {
  state: (state, attempt) => self.postMessage({ t: 'state', state, attempt }),
  values: (batches, timing) => self.postMessage({ t: 'values', batches, timing }),
  alarm: (alarm) => self.postMessage({ t: 'alarm', alarm }),
  status: (status) => self.postMessage({ t: 'status', status }),
  resync: (reason) => self.postMessage({ t: 'resync', reason }),
  meta: (meta) => self.postMessage({ t: 'meta', meta }),
};

let conn: RealtimeConnection | null = null;

self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const m = ev.data;
  if (m.t === 'start') {
    conn?.stop();
    conn = new RealtimeConnection(m.url, m.subs, env, sink);
    conn.start();
  } else if (m.t === 'stop') {
    conn?.stop();
    conn = null;
  }
};
