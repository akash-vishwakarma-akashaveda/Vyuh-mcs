import React, { useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { Pause, Play, RotateCcw, Square, Zap } from 'lucide-react';
import { Logo } from '../components/atoms/Logo';
import { StatusGlyph } from '../components/atoms/Badge';

/**
 * Simulator Lab: drives the OPS-SAT flight-data replay and the space-to-ground
 * link, and shows what every stage of the ground segment did with it. All data
 * comes from the running backend (simulator control API via the BFF, and the
 * Realtime Gateway WebSocket) — nothing on this page is generated in the browser.
 */

const API = '/api/v1/simulator';

type Stages = Record<string, Record<string, number>>;
interface Lat { count: number; p50_ms: number; p95_ms: number; p99_ms: number; max_ms: number }
interface Stats { uptime_s: number; stages: Stages; latency: Record<string, Lat> }
interface Replay {
  state: string; error?: string; samples: number; segments: number; anomaly_segments: number; position: number; speed: number; loop: boolean;
  replay_seconds: number; virtual_seconds: number; recorded_utc: string; samples_emitted: number; anomaly_samples_emitted: number; frames: number; connected: boolean;
}
interface Impairments {
  enabled: boolean; scope: string; ber: number; drop_pct: number; burst_pct: number; burst_len: number; dup_pct: number; reorder_pct: number; reorder_depth: number;
  garbage_pct: number; asm_corrupt_pct: number; truncate_pct: number; wrong_scid_pct: number;
}
interface Events { detections?: { param: string; kind: string; score: number; value: number; obt: string }[]; dead_letters?: { error_type: string; scid: number; reason?: string; detail?: string; received_time: string }[] }

const CLEAN: Impairments = { enabled: false, scope: 'OPSSAT-1', ber: 0, drop_pct: 0, burst_pct: 0, burst_len: 10, dup_pct: 0, reorder_pct: 0, reorder_depth: 3, garbage_pct: 0, asm_corrupt_pct: 0, truncate_pct: 0, wrong_scid_pct: 0 };
const PRESETS: Record<string, Partial<Impairments>> = {
  Clean: {},
  'Bit errors': { ber: 1e-4 },
  'Lossy (2 %)': { drop_pct: 2 },
  Fades: { burst_pct: 1, burst_len: 10 },
  'Two stations': { dup_pct: 5 },
  'Out of order': { reorder_pct: 5, reorder_depth: 3 },
  'Bad pass': { ber: 1e-5, drop_pct: 1, dup_pct: 2, reorder_pct: 2, reorder_depth: 2, garbage_pct: 1, truncate_pct: 0.5 },
};
const FIELDS: [keyof Impairments, string, number, number, number][] = [
  ['ber', 'Bit error rate', 0, 0.001, 0.00001], ['drop_pct', 'Frame loss %', 0, 20, 0.5], ['burst_pct', 'Fade chance %', 0, 10, 0.5], ['burst_len', 'Fade length (frames)', 1, 50, 1],
  ['dup_pct', 'Duplicates %', 0, 20, 0.5], ['reorder_pct', 'Reordered %', 0, 20, 0.5], ['reorder_depth', 'Reorder depth', 1, 16, 1], ['garbage_pct', 'Garbage before frame %', 0, 20, 0.5],
  ['asm_corrupt_pct', 'Damaged sync marker %', 0, 10, 0.5], ['truncate_pct', 'Truncated frames %', 0, 10, 0.5], ['wrong_scid_pct', 'Foreign spacecraft %', 0, 10, 0.5],
];
const SPEEDS: [number, string][] = [[1, '1×'], [10, '10×'], [100, '100×'], [1000, '1000×'], [0, 'max']];
const CHANNELS = ['MAG_X', 'MAG_Y', 'MAG_Z', 'PD1_THETA', 'PD3_THETA', 'PD5_THETA', 'PD6_THETA'];

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const r = await fetch(API + path, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`);
  return j as T;
}

const fmt = (n: number | undefined) => (n ?? 0).toLocaleString('en-US');
const card = 'border border-[#213044] bg-[#111A25] rounded-[4px]';
const label = 'text-[10.5px] font-medium uppercase tracking-[0.12em] text-[#8496AB]';

export const SimLab: React.FC = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [prev, setPrev] = useState<Stats | null>(null);
  const [replay, setReplay] = useState<Replay | null>(null);
  const [imp, setImp] = useState<Impairments>(CLEAN);
  const [events, setEvents] = useState<Events>({});
  const [err, setErr] = useState('');
  const [speed, setSpeed] = useState(100);
  const [channel, setChannel] = useState('MAG_X');
  const [online, setOnline] = useState(false);
  const lastStats = useRef<Stats | null>(null);

  // Poll the backend once a second.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const [s, r, e] = await Promise.all([call<Stats>('/pipeline/stats'), call<Replay>('/replay'), call<Events>('/pipeline/events')]);
        if (!alive) return;
        setPrev(lastStats.current);
        lastStats.current = s;
        setStats(s); setReplay(r); setEvents(e); setOnline(true);
      } catch {
        if (alive) { setOnline(false); setErr('Backend not reachable. Start bin/vyuh-mcs.exe (see docs/STARTUP.md).'); }
      }
    };
    void tick();
    const t = window.setInterval(tick, 1000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  useEffect(() => { void call<Impairments>('/link').then(setImp).catch(() => {}); }, []);

  const act = async (fn: () => Promise<unknown>) => { setErr(''); try { await fn(); } catch (x) { setErr((x as Error).message); } };
  const control = (body: Record<string, unknown>) => act(async () => setReplay(await call<Replay>('/replay', 'POST', body)));
  const inject = (event: string, arg = 0) => act(() => call('/replay/inject', 'POST', { event, arg }));
  const applyLink = (next: Impairments) => act(async () => setImp(await call<Impairments>('/link', 'PUT', next)));

  const g = (stage: string, k: string) => stats?.stages[stage]?.[k] ?? 0;
  const rate = (stage: string, k: string) => {
    if (!stats || !prev) return 0;
    return Math.max(0, (stats.stages[stage]?.[k] ?? 0) - (prev.stages[stage]?.[k] ?? 0)) / Math.max(0.5, stats.uptime_s - prev.uptime_s);
  };
  const lat = stats?.latency?.ert_to_ws;
  const pct = replay && replay.samples ? (100 * replay.position) / replay.samples : 0;

  return (
    <div className="min-h-screen bg-[#0A1018] text-[#E6EDF3] font-sans-body">
      <header className="h-14 px-5 flex items-center gap-4 border-b border-[#213044] bg-[#070C12]">
        <Logo />
        <span className="font-display-title text-[14px] text-[#A3B1C2]">Simulator Lab</span>
        <span className="text-[12px] text-[#5F7087]">OPSSAT-1 replays ESA OPS-SAT flight telemetry (OPS-SAT-AD, CC-BY-4.0) through the real ground segment</span>
        <span className="ml-auto flex items-center gap-2 text-[12px]">
          <StatusGlyph kind={online ? 'normal' : 'critical'} className={online ? 'text-[#56F000]' : 'text-[#FF3838]'} />
          {online ? `backend up ${Math.round(stats?.uptime_s ?? 0)} s` : 'backend offline'}
        </span>
        <a href="/" className="text-[12px] text-[#4DACFF] hover:underline">Open console</a>
      </header>

      {err && <div className="mx-5 mt-4 border-l-[3px] border-[#FF3838] bg-[#FF3838]/10 px-4 py-2 text-[13px]">{err}</div>}

      <main className="p-5 grid grid-cols-1 xl:grid-cols-[380px_minmax(0,1fr)] gap-4">
        <div className="flex flex-col gap-4">
          {/* Replay */}
          <section className={card}>
            <header className="px-4 h-10 flex items-center justify-between border-b border-[#213044]"><h2 className={label}>Flight data replay</h2><span className="font-mono-code text-[11.5px] text-[#A3B1C2]">{replay?.state ?? '—'}</span></header>
            <div className="p-4 flex flex-col gap-3 text-[12.5px]">
              <dl className="grid grid-cols-2 gap-y-1 font-mono-code text-[12px]">
                <dt className="text-[#8496AB]">Samples</dt><dd>{fmt(replay?.samples)}</dd>
                <dt className="text-[#8496AB]">Segments</dt><dd>{fmt(replay?.segments)} ({fmt(replay?.anomaly_segments)} labelled anomalous)</dd>
                <dt className="text-[#8496AB]">Emitted</dt><dd>{fmt(replay?.samples_emitted)} · {fmt(replay?.anomaly_samples_emitted)} in anomalies</dd>
                <dt className="text-[#8496AB]">Frames</dt><dd>{fmt(replay?.frames)}</dd>
                <dt className="text-[#8496AB]">Recorded at</dt><dd>{replay?.recorded_utc?.replace('T', ' ').slice(0, 19) ?? '—'}</dd>
              </dl>
              <div className="h-1.5 bg-[#1F2D40]"><i className="block h-full bg-[#4DACFF]" style={{ width: `${pct}%` }} /></div>
              <input type="range" min={0} max={100} step={0.5} value={pct} aria-label="Replay position" onChange={(e) => control({ action: 'seek', position_pct: Number(e.target.value) })} />
              <div className="flex flex-wrap gap-1" role="group" aria-label="Replay speed">
                {SPEEDS.map(([v, l]) => (
                  <button key={l} onClick={() => { setSpeed(v); if (replay?.state === 'running' || replay?.state === 'paused') void control({ action: 'speed', speed: v }); }}
                    className={clsx('h-7 px-2.5 rounded-[3px] border text-[12px] font-mono-code', speed === v ? 'border-[#2E6FD8] bg-[#2E6FD8]/20 text-[#E6EDF3]' : 'border-[#2A3B52] text-[#A3B1C2] hover:bg-[#172434]')}>{l}</button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => control({ action: 'start', speed, position_pct: pct >= 99.9 ? 0 : pct })} className="h-8 px-3 rounded-[3px] bg-[#B8570C] hover:bg-[#D9731A] text-white text-[12.5px] font-medium flex items-center gap-1.5"><Play size={14} /> Start</button>
                {replay?.state === 'running'
                  ? <button onClick={() => control({ action: 'pause' })} className="h-8 px-3 rounded-[3px] border border-[#2A3B52] text-[12.5px] flex items-center gap-1.5 hover:bg-[#172434]"><Pause size={14} /> Pause</button>
                  : <button onClick={() => control({ action: 'resume' })} disabled={replay?.state !== 'paused'} className="h-8 px-3 rounded-[3px] border border-[#2A3B52] text-[12.5px] flex items-center gap-1.5 hover:bg-[#172434] disabled:opacity-40"><Play size={14} /> Resume</button>}
                <button onClick={() => control({ action: 'stop' })} className="h-8 px-3 rounded-[3px] border border-[#2A3B52] text-[12.5px] flex items-center gap-1.5 hover:bg-[#172434]"><Square size={13} /> Stop</button>
                <label className="flex items-center gap-1.5 text-[12px] text-[#A3B1C2] ml-auto"><input type="checkbox" checked={replay?.loop ?? false} onChange={(e) => control({ action: 'speed', loop: e.target.checked })} /> Loop</label>
              </div>
            </div>
          </section>

          {/* Link faults */}
          <section className={card}>
            <header className="px-4 h-10 flex items-center justify-between border-b border-[#213044]">
              <h2 className={label}>Space-to-ground link</h2>
              <label className="flex items-center gap-1.5 text-[12px]"><input type="checkbox" checked={imp.enabled} onChange={(e) => applyLink({ ...imp, enabled: e.target.checked })} /> faults on</label>
            </header>
            <div className="p-4 flex flex-col gap-3">
              <div className="flex flex-wrap gap-1">
                {Object.entries(PRESETS).map(([name, p]) => (
                  <button key={name} onClick={() => applyLink({ ...CLEAN, scope: imp.scope, ...p, enabled: name !== 'Clean' })} className="h-7 px-2 rounded-[3px] border border-[#2A3B52] text-[11.5px] text-[#A3B1C2] hover:bg-[#172434]">{name}</button>
                ))}
              </div>
              <label className="flex items-center justify-between text-[12px] text-[#A3B1C2]">Applies to
                <select value={imp.scope} onChange={(e) => applyLink({ ...imp, scope: e.target.value })} className="h-7 bg-[#0A1018] border border-[#2A3B52] rounded-[3px] px-2 text-[12px] text-[#E6EDF3]"><option value="OPSSAT-1">OPSSAT-1</option><option value="">every spacecraft</option></select>
              </label>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                {FIELDS.map(([k, l, min, max, step]) => (
                  <label key={k} className="flex flex-col gap-0.5 text-[11px] text-[#8496AB]">{l}
                    <input type="number" min={min} max={max} step={step} value={imp[k] as number}
                      onChange={(e) => setImp({ ...imp, [k]: Number(e.target.value) })} onBlur={() => applyLink(imp)}
                      className="h-7 bg-[#0A1018] border border-[#2A3B52] rounded-[3px] px-2 font-mono-code text-[12px] text-[#E6EDF3] outline-none focus:border-[#2DCCFF]" />
                  </label>
                ))}
              </div>
            </div>
          </section>

          {/* Source events */}
          <section className={card}>
            <header className="px-4 h-10 flex items-center border-b border-[#213044]"><h2 className={label}>One-off events</h2></header>
            <div className="p-4 grid grid-cols-2 gap-2 text-[12px]">
              {([['Counter reset', () => inject('counter_reset')], ['Clock jump +2 h', () => inject('time_jump', 7200)], ['Unknown APID ×10', () => inject('unknown_apid', 10)],
                ['Malformed packet', () => inject('bad_packet', 1)], ['Station outage 3 s', () => inject('stall', 3)], ['Lose next TC frame', () => act(() => call('/uplink/drop', 'POST'))]] as [string, () => void][]).map(([l, fn]) => (
                <button key={l} onClick={fn} className="h-8 px-2 rounded-[3px] border border-[#2A3B52] hover:bg-[#172434] flex items-center gap-1.5 text-left"><Zap size={13} className="text-[#FCE83A]" /> {l}</button>
              ))}
              <button onClick={() => act(() => call('/pipeline/reset', 'POST'))} className="col-span-2 h-8 px-2 rounded-[3px] border border-[#2A3B52] hover:bg-[#172434] flex items-center justify-center gap-1.5"><RotateCcw size={13} /> Reset all counters</button>
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-4 min-w-0">
          {/* Pipeline */}
          <section className={card}>
            <header className="px-4 h-10 flex items-center justify-between border-b border-[#213044]">
              <h2 className={label}>Pipeline · per stage</h2>
              <span className="font-mono-code text-[11.5px] text-[#A3B1C2]">{lat ? `receive → browser p50 ${lat.p50_ms.toFixed(1)} · p95 ${lat.p95_ms.toFixed(1)} · p99 ${lat.p99_ms.toFixed(1)} ms` : 'latency —'}</span>
            </header>
            <div className="p-3 grid grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8 gap-2">
              <Stage title="Spacecraft" main={g('sim', 'frames_generated')} unit="frames" rate={rate('sim', 'frames_generated')}
                rows={[['samples replayed', g('replay', 'samples')], ['PUS-1 reports', g('uplink', 'pus1_reports')]]} />
              <Stage title="Link" main={g('sim', 'frames_sent')} unit="delivered" rate={rate('sim', 'frames_sent')}
                rows={[['dropped', g('sim', 'frames_dropped'), 'bad'], ['bit-errored', g('sim', 'frames_corrupted'), 'bad'], ['duplicated', g('sim', 'duplicated')], ['reordered', g('sim', 'reordered')], ['truncated', g('sim', 'truncated'), 'bad']]} />
              <Stage title="Link gateway" main={g('link', 'frames_published')} unit="frames" rate={rate('link', 'frames_published')}
                rows={[['sync slip bytes', g('link', 'sync_slip_bytes')], ['truncated caught', g('link', 'truncated_frames')], ['recorded', g('archive', 'frames')]]} />
              <Stage title="Frame processor" main={g('frame', 'processed')} unit="in order" rate={rate('frame', 'processed')}
                rows={[['CRC rejected', g('frame', 'crc_error'), 'bad'], ['duplicates dropped', g('frame', 'duplicate')], ['frames lost', g('frame', 'lost'), 'bad'], ['gap events', g('frame', 'gap_events')], ['recovered (replay)', g('gapreplay', 'recovered')], ['foreign SCID', g('frame', 'unknown_scid'), 'bad']]} />
              <Stage title="Packets" main={g('packet', 'forwarded')} unit="packets" rate={rate('packet', 'forwarded')}
                rows={[['sequence gaps', g('packet', 'seq_gap'), 'bad'], ['bad headers', g('packet', 'bad_header'), 'bad'], ['bytes discarded', g('packet', 'discarded_bytes')]]} />
              <Stage title="TM processor" main={g('tm', 'packets_decoded')} unit="decoded" rate={rate('tm', 'params_out')}
                rows={[['parameters', g('tm', 'params_out')], ['unknown APID', g('tm', 'unknown_apid'), 'bad'], ['time jumps', g('tm', 'time_jump'), 'bad'], ['alarms raised', g('alarm', 'raised'), 'warn'], ['alarms cleared', g('alarm', 'cleared')]]} />
              <Stage title="Current values" main={g('cvt', 'updates')} unit="updates" rate={rate('cvt', 'updates')}
                rows={[['throttled', g('cvt', 'throttled')], ['trailing flushes', g('cvt', 'trailing_flushes')], ['older rejected', g('cvt', 'older_rejected')]]} />
              <Stage title="Browser" main={g('ws', 'values_sent')} unit="values" rate={rate('ws', 'values_sent')}
                rows={[['DELTA frames', g('ws', 'delta_frames')], ['alarm frames', g('ws', 'alarm_events')], ['dropped (slow client)', g('ws', 'delta_dropped'), 'bad']]} />
            </div>
            <div className="px-4 pb-3 grid grid-cols-2 lg:grid-cols-4 gap-2 text-[12px]">
              <Mini title="Anomaly model" items={[['spikes', g('anomaly', 'SPIKE')], ['noise', g('anomaly', 'NOISE')], ['flat', g('anomaly', 'FLAT')], ['gaps', g('anomaly', 'GAP')]]} />
              <Mini title="Dead letters" items={[['total', g('deadletter', 'total')], ['bad frames', g('deadletter', 'FRAME_VALIDATION_FAILED')], ['unknown SCID', g('deadletter', 'UNKNOWN_SCID')], ['decode', g('deadletter', 'DECOM_FAILURE')]]} />
              <Mini title="Uplink (COP-1)" items={[['frames sent', g('uplink', 'frames_sent')], ['acknowledged', g('uplink', 'acknowledged')], ['retransmitted', g('uplink', 'retransmitted_frames')], ['T1 timeouts', g('uplink', 't1_timeouts')]]} />
              <Mini title="Verification (PUS-1)" items={[['accepted', g('verification', 'accepted')], ['completed', g('verification', 'completed')], ['failed on board', g('verification', 'execution_failed') + g('verification', 'acceptance_failed')], ['queued (window)', g('uplink', 'queued')]]} />
            </div>
          </section>

          {/* Live data */}
          <section className={card}>
            <header className="px-4 h-10 flex items-center justify-between border-b border-[#213044]">
              <h2 className={label}>OPSSAT-1 live · as a console receives it</h2>
              <div className="flex gap-1">{CHANNELS.map((c) => <button key={c} onClick={() => setChannel(c)} className={clsx('h-6 px-2 rounded-[3px] text-[11px] font-mono-code border', channel === c ? 'border-[#2E6FD8] bg-[#2E6FD8]/20' : 'border-[#2A3B52] text-[#A3B1C2]')}>{c}</button>)}</div>
            </header>
            <LiveChart channel={channel} />
          </section>

          <div className="grid lg:grid-cols-2 gap-4">
            <section className={card}>
              <header className="px-4 h-10 flex items-center border-b border-[#213044]"><h2 className={label}>Anomaly detections</h2></header>
              <EventList rows={(events.detections ?? []).map((d) => [d.obt?.slice(11, 19) ?? '', `${d.param} · ${d.kind}`, `score ${d.score.toFixed(1)} · value ${d.value.toFixed(3)}`, d.kind === 'SPIKE' ? 'critical' : 'caution'])} empty="No detections yet. Start the replay." />
            </section>
            <section className={card}>
              <header className="px-4 h-10 flex items-center border-b border-[#213044]"><h2 className={label}>Dead letters</h2></header>
              <EventList rows={(events.dead_letters ?? []).map((d) => [d.received_time?.slice(11, 19) ?? '', `${d.error_type} · SCID ${d.scid}`, d.reason ?? d.detail ?? '', 'critical'])} empty="Nothing rejected." />
            </section>
          </div>
        </div>
      </main>
    </div>
  );
};

const Stage: React.FC<{ title: string; main: number; unit: string; rate: number; rows: [string, number, ('bad' | 'warn')?][] }> = ({ title, main, unit, rate, rows }) => (
  <div className="border border-[#213044] bg-[#0E151F] rounded-[3px] p-2.5 flex flex-col gap-1.5 min-w-0">
    <span className="text-[10.5px] uppercase tracking-[0.1em] text-[#8496AB]">{title}</span>
    <span className="font-mono-code text-[18px] tabular-nums leading-none">{fmt(main)}</span>
    <span className="text-[10.5px] text-[#5F7087] font-mono-code">{unit} · {rate.toFixed(0)}/s</span>
    <ul className="mt-1 flex flex-col gap-0.5">
      {rows.map(([l, v, tone]) => (
        <li key={l} className="flex justify-between gap-2 text-[11px]">
          <span className="text-[#8496AB] truncate">{l}</span>
          <span className={clsx('font-mono-code tabular-nums', v > 0 && tone === 'bad' ? 'text-[#FF3838]' : v > 0 && tone === 'warn' ? 'text-[#FCE83A]' : 'text-[#C9D4E0]')}>{fmt(v)}</span>
        </li>
      ))}
    </ul>
  </div>
);

const Mini: React.FC<{ title: string; items: [string, number][] }> = ({ title, items }) => (
  <div className="border border-[#1A2738] rounded-[3px] px-2.5 py-2">
    <span className="text-[10.5px] uppercase tracking-[0.1em] text-[#8496AB]">{title}</span>
    <div className="grid grid-cols-2 gap-x-2 mt-1">{items.map(([l, v]) => <span key={l} className="flex justify-between gap-1 text-[11px]"><span className="text-[#8496AB] truncate">{l}</span><span className="font-mono-code">{fmt(v)}</span></span>)}</div>
  </div>
);

const EventList: React.FC<{ rows: [string, string, string, 'critical' | 'caution'][]; empty: string }> = ({ rows, empty }) => (
  <ul className="max-h-[260px] overflow-y-auto divide-y divide-[#1A2738] text-[12px]">
    {rows.length === 0 && <li className="px-4 py-3 text-[#8496AB]">{empty}</li>}
    {rows.map(([t, a, b, kind], i) => (
      <li key={i} className="px-4 py-1.5 flex items-center gap-2.5">
        <StatusGlyph kind={kind} className={kind === 'critical' ? 'text-[#FF3838]' : 'text-[#FCE83A]'} />
        <span className="font-mono-code text-[#8496AB] tabular-nums">{t}</span>
        <span className="font-mono-code">{a}</span>
        <span className="text-[#8496AB] truncate ml-auto">{b}</span>
      </li>
    ))}
  </ul>
);

/** Subscribes to OPSSAT-1 on the Realtime Gateway, exactly like a console. */
const LiveChart: React.FC<{ channel: string }> = ({ channel }) => {
  const host = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const series = useRef<Record<string, { t: number[]; v: number[] }>>({});
  const [last, setLast] = useState<{ v: number; unit: string; alarm: number } | null>(null);
  const [ws, setWs] = useState('connecting');

  useEffect(() => {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/telemetry`;
    let sock: WebSocket | null = null;
    let closed = false;
    const connect = () => {
      sock = new WebSocket(url);
      sock.onopen = () => setWs('connected');
      sock.onclose = () => { setWs('reconnecting'); if (!closed) window.setTimeout(connect, 1500); };
      sock.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.type === 'HELLO') sock?.send(JSON.stringify({ type: 'SUBSCRIBE', sub_id: 'lab', kind: 'PARAMS', satellite: 'OPSSAT-1' }));
        if (m.type !== 'DELTA' && m.type !== 'SNAPSHOT') return;
        for (const v of m.values ?? []) {
          const s = (series.current[v.param_id] ??= { t: [], v: [] });
          s.t.push(Date.parse(v.timestamp_utc) / 1000); s.v.push(v.eu_value);
          if (s.t.length > 900) { s.t.shift(); s.v.shift(); }
        }
      };
    };
    connect();
    return () => { closed = true; sock?.close(); };
  }, []);

  useEffect(() => {
    if (!host.current) return;
    plot.current?.destroy();
    plot.current = new uPlot({
      width: host.current.clientWidth, height: 240,
      scales: { x: { time: true } },
      axes: [{ stroke: '#8496AB', grid: { stroke: '#1A2738' } }, { stroke: '#8496AB', grid: { stroke: '#1A2738' }, size: 60 }],
      series: [{}, { label: channel, stroke: '#4DACFF', width: 1.5 }],
      legend: { show: false },
    }, [[], []], host.current);
    const t = window.setInterval(() => {
      const s = series.current[channel];
      if (s && plot.current) {
        plot.current.setData([s.t, s.v]);
        setLast({ v: s.v[s.v.length - 1], unit: channel.startsWith('MAG') ? 'µT' : 'rad', alarm: 0 });
      }
    }, 500);
    const onResize = () => host.current && plot.current?.setSize({ width: host.current.clientWidth, height: 240 });
    window.addEventListener('resize', onResize);
    return () => { clearInterval(t); window.removeEventListener('resize', onResize); plot.current?.destroy(); plot.current = null; };
  }, [channel]);

  const summary = useMemo(() => (last ? `${last.v.toFixed(channel.startsWith('MAG') ? 3 : 4)} ${last.unit}` : '—'), [last, channel]);
  return (
    <div className="p-3">
      <div className="flex items-center gap-3 text-[12px] mb-2">
        <StatusGlyph kind={ws === 'connected' ? 'normal' : 'standby'} className={ws === 'connected' ? 'text-[#56F000]' : 'text-[#2DCCFF]'} />
        <span className="text-[#8496AB]">WebSocket {ws}</span>
        <span className="ml-auto font-mono-code text-[16px]">{summary}</span>
      </div>
      <div ref={host} className="w-full" />
      <p className="text-[11px] text-[#5F7087] mt-1">Time axis is on-board time: it follows the recorded sample spacing, so at speeds above 1× it runs faster than the wall clock.</p>
    </div>
  );
};
