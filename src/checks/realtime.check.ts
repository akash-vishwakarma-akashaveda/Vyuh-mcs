/**
 * Headless checks of the live-link logic: the wire protocol, reconnect backoff, and
 * the connection state machine (subscribe, coalesce, resume, watchdog) driven by a
 * fake socket and a virtual clock. Run: npm run check
 */
import assert from 'node:assert/strict';
import { backoffDelay, DEFAULT_BACKOFF } from '../realtime/backoff';
import { Env, LinkMeta, LinkState, RealtimeConnection, Sink, SocketLike, ValueBatch } from '../realtime/connection';
import { AlarmView, CommandStatus, parseFrame, Subscription } from '../realtime/protocol';

/* --- protocol ------------------------------------------------------------- */
const value = (id: string, v: number, alarm = 0) =>
  ({ param_id: id, eu_value: v, unit: 'V', alarm_state: alarm, quality: 0, timestamp_utc: '2026-09-19T10:00:00Z' });

assert.equal(parseFrame('not json'), null);
assert.equal(parseFrame('{"type":"NOPE"}'), null);
assert.equal(parseFrame(JSON.stringify({ type: 'DELTA', sub_id: 's', satellite: 'AKV-03', seq: 1, values: [value('X', 1, 3)] })), null,
  'alarm_state 3 is not a level');
const delta = parseFrame(JSON.stringify({ type: 'DELTA', sub_id: 's', satellite: 'AKV-03', seq: 1, ert_ns: 5, values: [value('BUS_VOLTAGE', 29.3)] }));
assert.ok(delta && delta.type === 'DELTA' && delta.values[0].eu_value === 29.3);
assert.equal(delta.type === 'DELTA' && delta.gw_ns, 0, 'optional fields default');

/* --- backoff: exponential, capped, jittered ------------------------------- */
assert.equal(backoffDelay(0, () => 0), 250, 'half the 500 ms ceiling is fixed');
assert.equal(backoffDelay(0, () => 1), 500);
assert.equal(backoffDelay(3, () => 1), 4000, '500 * 2^3');
assert.equal(backoffDelay(20, () => 1), DEFAULT_BACKOFF.maxMs, 'capped at 30 s');
for (let i = 0; i < 200; i++) {
  const ceiling = Math.min(DEFAULT_BACKOFF.maxMs, 500 * 2 ** 4);
  const d = backoffDelay(4);
  assert.ok(d >= ceiling / 2 && d <= ceiling, `jitter stays inside [${ceiling / 2}, ${ceiling}]: ${d}`);
}
assert.notEqual(backoffDelay(5, () => 0.1), backoffDelay(5, () => 0.9), 'clients do not all retry at the same instant');

/* --- a virtual clock and a fake socket ------------------------------------ */
class Clock implements Env {
  t = 1_000_000;
  private timers: { id: number; at: number; fn: () => void; every?: number }[] = [];
  private next = 1;
  sockets: FakeSocket[] = [];
  rand = 0.5;
  now() { return this.t; }
  random() { return this.rand; }
  setTimeout(fn: () => void, ms: number) { const id = this.next++; this.timers.push({ id, at: this.t + ms, fn }); return id; }
  setInterval(fn: () => void, ms: number) { const id = this.next++; this.timers.push({ id, at: this.t + ms, fn, every: ms }); return id; }
  clearTimeout(h: unknown) { this.timers = this.timers.filter((x) => x.id !== h); }
  clearInterval(h: unknown) { this.clearTimeout(h); }
  createSocket(url: string) { const s = new FakeSocket(url); this.sockets.push(s); return s; }
  advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      const due = this.timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.t = due.at;
      if (due.every) due.at += due.every; else this.timers = this.timers.filter((x) => x.id !== due.id);
      due.fn();
    }
    this.t = end;
  }
}

class FakeSocket implements SocketLike {
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: any[] = [];
  closed = false;
  constructor(readonly url: string) {}
  send(d: string) { this.sent.push(JSON.parse(d)); }
  close() { this.closed = true; }
  // server side
  serve(frame: unknown) { this.onmessage?.({ data: JSON.stringify(frame) }); }
  drop() { this.onclose?.(); }
}

class RecordingSink {
  states: [LinkState, number][] = [];
  batches: { batches: ValueBatch[]; ertMs: number }[] = [];
  alarms: AlarmView[] = [];
  statuses: CommandStatus[] = [];
  resyncs: string[] = [];
  meta: LinkMeta | null = null;
  state(s: LinkState, attempt: number) { this.states.push([s, attempt]); }
  values(batches: ValueBatch[], t: { ertMs: number }) { this.batches.push({ batches, ertMs: t.ertMs }); }
  alarm(a: AlarmView) { this.alarms.push(a); }
  status(s: CommandStatus) { this.statuses.push(s); }
  resync(r: string) { this.resyncs.push(r); }
  metaFn(m: LinkMeta) { this.meta = m; }
}

function rig() {
  const clock = new Clock();
  const rec = new RecordingSink();
  const sink: Sink = {
    state: (s, a) => rec.state(s, a), values: (b, t) => rec.values(b, t), alarm: (a) => rec.alarm(a),
    status: (s) => rec.status(s), resync: (r) => rec.resync(r), meta: (m) => rec.metaFn(m),
  };
  const subs: Subscription[] = [
    { id: 'p-AKV-03', kind: 'PARAMS', satellite: 'AKV-03' },
    { id: 'alarms', kind: 'ALARMS', scope: ['*'] },
  ];
  const conn = new RealtimeConnection('ws://gw/ws/telemetry', subs, clock, sink, { flushMs: 50 });
  return { clock, rec, conn, sock: () => clock.sockets[clock.sockets.length - 1] };
}
const hello = (instance: string, seq = 0) => ({ type: 'HELLO', instance_id: instance, event_seq: seq, heartbeat_ms: 5000, resume_window_s: 60 });

/* --- connect, subscribe, coalesce ----------------------------------------- */
{
  const { clock, rec, conn, sock } = rig();
  conn.start();
  assert.deepEqual(rec.states.at(-1), ['CONNECTING', 0]);
  sock().serve(hello('rtg-1', 7));
  assert.deepEqual(rec.states.at(-1), ['CONNECTED', 0]);
  assert.deepEqual(sock().sent.map((f) => [f.type, f.sub_id]), [['SUBSCRIBE', 'p-AKV-03'], ['SUBSCRIBE', 'alarms']]);
  assert.ok(!sock().sent.some((f) => f.type === 'RESUME'), 'a first connection has nothing to resume');

  // Snapshot, then a burst of deltas inside one flush window: one batch, newest value wins.
  sock().serve({ type: 'SNAPSHOT', sub_id: 'p-AKV-03', satellite: 'AKV-03', values: [value('BAT_TEMP', 18), value('BUS_VOLTAGE', 29)] });
  for (let i = 1; i <= 5; i++) {
    sock().serve({ type: 'DELTA', sub_id: 'p-AKV-03', satellite: 'AKV-03', seq: i, ert_ns: 2e9 + i, values: [value('BAT_TEMP', 18 - i)] });
  }
  assert.equal(rec.batches.length, 0, 'nothing reaches the stores between flushes');
  clock.advance(50);
  assert.equal(rec.batches.length, 1);
  const [b] = rec.batches[0].batches;
  assert.equal(b.satellite, 'AKV-03');
  assert.equal(b.values.length, 2, 'two parameters');
  assert.equal(b.values.find((v) => v.param_id === 'BAT_TEMP')!.eu_value, 13, 'six updates became one: the newest');
  assert.ok(rec.batches[0].ertMs > 0, 'gateway receive time is carried for the latency probe');
  clock.advance(500);
  assert.equal(rec.batches.length, 1, 'no empty batches');

  // Garbage is counted, not fatal.
  sock().onmessage?.({ data: '{"type":"DELTA","broken":true}' });
  clock.advance(1000);
  assert.equal(rec.meta?.framesRejected, 1);
  assert.equal(rec.meta?.eventSeq, 7);

  // Alarms and command status are forwarded immediately (priority lane) and tracked for resume.
  sock().serve({ type: 'ALARM', event_seq: 9, satellite: 'AKV-03', alarm: {
    alarm_id: 'a1', sat_id: 'AKV-03', param_id: 'BAT_TEMP', alarm_state: 2, level: 'LOW_LOW', eu_value: 3, unit: '°C',
    timestamp_utc: '2026-09-19T10:00:00Z', status: 'ACTIVE', acknowledged: false } });
  assert.equal(rec.alarms.length, 1);
  sock().serve({ type: 'STATUS', event_seq: 10, satellite: 'AKV-03', status: { kind: 'COMMAND', command_id: 'c1', sat_id: 'AKV-03', apid: 33, status: 'SENT' } });
  assert.equal(rec.statuses[0].status, 'SENT');
  conn.stop();
}

/* --- reconnect with backoff, then resume from the last event -------------- */
{
  const { clock, rec, conn, sock } = rig();
  conn.start();
  sock().serve(hello('rtg-1', 0));
  sock().serve({ type: 'ALARM', event_seq: 4, satellite: 'AKV-03', alarm: {
    alarm_id: 'a1', sat_id: 'AKV-03', param_id: 'BAT_TEMP', alarm_state: 1, level: 'LOW', eu_value: 9, unit: '°C',
    timestamp_utc: '2026-09-19T10:00:00Z', status: 'ACTIVE', acknowledged: false } });

  const first = sock();
  first.drop(); // the network goes away
  assert.deepEqual(rec.states.at(-1), ['RECONNECTING', 1]);
  assert.equal(clock.sockets.length, 1, 'does not retry immediately');
  clock.advance(249);
  assert.equal(clock.sockets.length, 1, 'waits at least half the backoff ceiling');
  clock.advance(1000);
  assert.equal(clock.sockets.length, 2, 'retries after the backoff');

  // Fail again: the delay grows.
  sock().drop();
  assert.deepEqual(rec.states.at(-1), ['RECONNECTING', 2]);
  clock.advance(500);
  assert.equal(clock.sockets.length, 2, 'second wait is longer (>= 500 ms at rand 0.5 -> 750 ms)');
  clock.advance(500);
  assert.equal(clock.sockets.length, 3);

  // The gateway is back: subscribe again, then ask to resume from event 4.
  sock().serve(hello('rtg-1', 6));
  assert.deepEqual(rec.states.at(-1), ['CONNECTED', 0], 'attempts reset on a successful connection');
  const kinds = sock().sent.map((f) => f.type);
  assert.deepEqual(kinds, ['SUBSCRIBE', 'SUBSCRIBE', 'RESUME']);
  assert.deepEqual(sock().sent[2], { type: 'RESUME', instance_id: 'rtg-1', last_event_seq: 4 });

  // The gateway restarted meanwhile: it refuses, and the console refetches over REST.
  sock().serve({ type: 'RESUME_FAILED', reason: 'INSTANCE_CHANGED', event_seq: 0 });
  assert.deepEqual(rec.resyncs, ['INSTANCE_CHANGED']);
  conn.stop();
}

/* --- watchdog: silence means dead, even if TCP says open ------------------- */
{
  const { clock, rec, conn, sock } = rig();
  conn.start();
  sock().serve(hello('rtg-1'));
  const dead = sock();
  clock.advance(14_000);
  assert.ok(!dead.closed, 'under 3 heartbeats of silence is still alive');
  sock().serve({ type: 'HEARTBEAT', event_seq: 0 }); // a heartbeat resets the watchdog
  clock.advance(14_000);
  assert.ok(!dead.closed);
  clock.advance(2_000); // 16 s with nothing at all
  assert.ok(dead.closed, 'the half-open connection is torn down');
  assert.equal(rec.states.at(-1)![0], 'RECONNECTING');
  clock.advance(1000);
  assert.equal(clock.sockets.length, 2, 'and replaced');
  conn.stop();
}

/* --- after many failures the state reads DISCONNECTED, retries continue ---- */
{
  const { clock, rec, conn, sock } = rig();
  conn.start();
  for (let i = 0; i < 9; i++) {
    sock().drop();
    clock.advance(31_000);
  }
  assert.equal(rec.states.some(([s]) => s === 'DISCONNECTED'), true);
  assert.ok(clock.sockets.length >= 9, 'still retrying, slowly');
  // Recovery from the slow state works the same.
  sock().serve(hello('rtg-1'));
  assert.deepEqual(rec.states.at(-1), ['CONNECTED', 0]);

  // stop() means stop: no reconnect after it.
  conn.stop();
  const n = clock.sockets.length;
  sock().drop();
  clock.advance(60_000);
  assert.equal(clock.sockets.length, n);
  assert.deepEqual(rec.states.at(-1), ['DISCONNECTED', 0]);
}

console.log('realtime.check: OK');
