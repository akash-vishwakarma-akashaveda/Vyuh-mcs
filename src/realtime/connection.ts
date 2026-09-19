/**
 * The console's end of the Realtime Gateway link: connect, subscribe, coalesce,
 * survive. It has no DOM dependency — sockets and timers are injected — so the same
 * class runs inside a Web Worker in the browser and under a fake clock in the checks.
 *
 * Reliability rules (each one a way a live console silently lies if it is missing):
 *  - reconnect with exponential backoff + jitter, never a tight loop;
 *  - a heartbeat watchdog: no frame for 3 heartbeats means the link is dead even if
 *    TCP has not noticed (a half-open connection looks connected and shows stale data);
 *  - on reconnect, re-subscribe (the gateway sends a fresh SNAPSHOT) and RESUME so alarms
 *    and command status raised while away are replayed, never lost;
 *  - values are coalesced: many updates to one parameter inside a flush window become one.
 */
import { backoffDelay } from './backoff';
import { AlarmView, CommandStatus, LiveValue, parseFrame, Subscription } from './protocol';

export type LinkState = 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';

export interface SocketLike {
  onopen: (() => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  send(data: string): void;
  close(): void;
}

export interface Env {
  createSocket(url: string): SocketLike;
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  random(): number;
}

export interface ValueBatch {
  satellite: string;
  values: LiveValue[];
}

export interface LinkMeta {
  eventSeq: number;
  instanceId: string;
  lastMessageAt: number;
  framesRejected: number;
}

export interface Sink {
  state(state: LinkState, attempt: number): void;
  values(batches: ValueBatch[], timing: { ertMs: number; gwMs: number }): void;
  alarm(alarm: AlarmView): void;
  status(status: CommandStatus): void;
  /** Resume was refused (gateway restarted, or away too long): refetch alarms/commands over REST. */
  resync(reason: string): void;
  meta(meta: LinkMeta): void;
}

export interface ConnectionOptions {
  flushMs?: number;
  /** A link with no frame for this many heartbeats is declared dead. */
  watchdogHeartbeats?: number;
  /** After this many consecutive failures the state reads DISCONNECTED (retries continue, slowly). */
  slowAfterAttempts?: number;
}

export class RealtimeConnection {
  private socket: SocketLike | null = null;
  private attempt = 0;
  private stopped = true;
  private lastMessageAt = 0;
  private heartbeatMs = 5000;
  private instanceId = '';
  private previousInstance = '';
  private eventSeq = 0;
  private framesRejected = 0;
  private metaAt = 0;
  private pending = new Map<string, Map<string, LiveValue>>();
  private pendingErt = 0;
  private pendingGw = 0;
  private reconnectTimer: unknown = null;
  private flushTimer: unknown = null;
  private watchdogTimer: unknown = null;

  private readonly flushMs: number;
  private readonly watchdogHeartbeats: number;
  private readonly slowAfter: number;

  constructor(
    private readonly url: string,
    private readonly subs: Subscription[],
    private readonly env: Env,
    private readonly sink: Sink,
    opts: ConnectionOptions = {},
  ) {
    this.flushMs = opts.flushMs ?? 25;
    this.watchdogHeartbeats = opts.watchdogHeartbeats ?? 3;
    this.slowAfter = opts.slowAfterAttempts ?? 8;
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.flushTimer = this.env.setInterval(() => this.flush(), this.flushMs);
    this.watchdogTimer = this.env.setInterval(() => this.watchdog(), 1000);
    this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer !== null) this.env.clearTimeout(this.reconnectTimer);
    if (this.flushTimer !== null) this.env.clearInterval(this.flushTimer);
    if (this.watchdogTimer !== null) this.env.clearInterval(this.watchdogTimer);
    this.reconnectTimer = this.flushTimer = this.watchdogTimer = null;
    const s = this.socket;
    this.socket = null;
    try {
      s?.close();
    } catch { /* already closed */ }
    this.sink.state('DISCONNECTED', 0);
  }

  // ---- connection lifecycle -------------------------------------------------

  private connect() {
    this.sink.state(this.stateFor(this.attempt), this.attempt);
    let socket: SocketLike;
    try {
      socket = this.env.createSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    this.lastMessageAt = this.env.now();
    socket.onopen = () => { this.lastMessageAt = this.env.now(); /* wait for HELLO */ };
    socket.onmessage = (ev) => this.onMessage(String(ev.data));
    socket.onclose = () => this.onClosed(socket);
    socket.onerror = () => { try { socket.close(); } catch { /* onclose follows */ } };
  }

  private stateFor(attempt: number): LinkState {
    if (attempt === 0) return this.previousInstance ? 'RECONNECTING' : 'CONNECTING';
    return attempt < this.slowAfter ? 'RECONNECTING' : 'DISCONNECTED';
  }

  private onClosed(socket: SocketLike) {
    if (this.socket !== socket) return; // a superseded socket closing late
    this.socket = null;
    if (this.stopped) return;
    this.scheduleReconnect();
  }

  private scheduleReconnect() {
    if (this.stopped) return;
    const delay = backoffDelay(this.attempt, () => this.env.random());
    this.attempt++;
    this.sink.state(this.stateFor(this.attempt), this.attempt);
    this.reconnectTimer = this.env.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  /** A half-open connection is still "open" to TCP; only silence gives it away. */
  private watchdog() {
    if (this.stopped || !this.socket) return;
    if (this.env.now() - this.lastMessageAt > this.heartbeatMs * this.watchdogHeartbeats) {
      const dead = this.socket;
      try {
        dead.close();
      } catch { /* ignore */ }
      this.onClosed(dead);
    }
  }

  // ---- inbound --------------------------------------------------------------

  private onMessage(text: string) {
    const f = parseFrame(text);
    if (!f) {
      this.framesRejected++;
      return;
    }
    this.lastMessageAt = this.env.now();

    switch (f.type) {
      case 'HELLO': {
        const reconnect = this.previousInstance !== '';
        this.instanceId = f.instance_id;
        this.heartbeatMs = f.heartbeat_ms;
        this.attempt = 0;
        this.sink.state('CONNECTED', 0);
        for (const s of this.subs) this.send({ type: 'SUBSCRIBE', sub_id: s.id, ...(s.kind === 'PARAMS' ? { kind: 'PARAMS', satellite: s.satellite, params: s.params } : { kind: s.kind, scope: s.scope }) });
        if (reconnect) {
          // Subscriptions first (so replay is filtered to them), then ask for what was missed.
          this.send({ type: 'RESUME', instance_id: this.previousInstance, last_event_seq: this.eventSeq });
        } else {
          this.eventSeq = f.event_seq; // first connection: nothing before now is ours to replay
        }
        this.previousInstance = f.instance_id;
        break;
      }
      case 'SNAPSHOT':
      case 'DELTA': {
        this.bucket(f.satellite, f.values);
        if (f.type === 'DELTA') {
          this.pendingErt = Math.max(this.pendingErt, f.ert_ns);
          this.pendingGw = Math.max(this.pendingGw, f.gw_ns);
        }
        break;
      }
      case 'ALARM':
        this.eventSeq = Math.max(this.eventSeq, f.event_seq);
        this.sink.alarm(f.alarm);
        break;
      case 'STATUS':
        this.eventSeq = Math.max(this.eventSeq, f.event_seq);
        this.sink.status(f.status);
        break;
      case 'HEARTBEAT':
        this.eventSeq = Math.max(this.eventSeq, f.event_seq);
        break;
      case 'RESUME_FAILED':
        this.eventSeq = f.event_seq;
        this.sink.resync(f.reason);
        break;
      default:
        break; // SUBSCRIBED, RESUMED, ERROR, PONG carry nothing the console acts on
    }
  }

  private bucket(satellite: string, values: LiveValue[]) {
    let m = this.pending.get(satellite);
    if (!m) this.pending.set(satellite, (m = new Map()));
    for (const v of values) m.set(v.param_id, v); // a newer value replaces an unflushed older one
  }

  private flush() {
    if (this.pending.size > 0) {
      const batches: ValueBatch[] = [...this.pending].map(([satellite, m]) => ({ satellite, values: [...m.values()] }));
      const timing = { ertMs: this.pendingErt / 1e6, gwMs: this.pendingGw / 1e6 };
      this.pending.clear();
      this.pendingErt = this.pendingGw = 0;
      this.sink.values(batches, timing);
    }
    // Link metadata changes rarely; refresh it about once a second, not every flush.
    const now = this.env.now();
    if (now - this.metaAt >= 1000) {
      this.metaAt = now;
      this.sink.meta({
        eventSeq: this.eventSeq, instanceId: this.instanceId,
        lastMessageAt: this.lastMessageAt, framesRejected: this.framesRejected,
      });
    }
  }

  private send(frame: unknown) {
    try {
      this.socket?.send(JSON.stringify(frame));
    } catch { /* socket is closing; onclose handles it */ }
  }
}
