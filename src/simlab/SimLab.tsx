import React, { useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { Pause, Play, RotateCcw, Square, Zap } from 'lucide-react';
import { Logo } from '../components/atoms/Logo';
import { StatusGlyph } from '../components/atoms/Badge';
import { Button } from '../components/atoms/Button';
import { Modal } from '../components/molecules/Modal';
import { can } from '../auth/policy';
import { useAuthStore } from '../store/useAuthStore';
import { CLEAN, Events, FIELDS, Impairments, PRESETS, Replay, Stats, simCall } from '../store/useSimulatorStore';
import { Select } from '../components/molecules/Select';

/**
 * Simulator Lab: drives the OPS-SAT flight-data replay and the space-to-ground link, and shows
 * what every stage of the ground segment did with it. All data comes from the running backend
 * (simulator control API via the BFF, and the Realtime Gateway WebSocket). It needs a signed-in
 * console session whose role may run the simulator.
 */

const SPEEDS: [number, string][] = [[1, '1×'], [10, '10×'], [100, '100×'], [1000, '1000×'], [0, 'max']];
const CHANNELS = ['MAG_X', 'MAG_Y', 'MAG_Z', 'PD1_THETA', 'PD3_THETA', 'PD5_THETA', 'PD6_THETA'];
const OFFLINE = 'Backend not reachable. Start bin/vyuh-mcs.exe (see docs/STARTUP.md).';

const fmt = (n: number | undefined) => (n ?? 0).toLocaleString('en-US');
const card = 'bg-[#11141B] border border-[#1A1E27] rounded-2xl';
const head = 'px-5 pt-4 pb-1 flex items-center justify-between gap-3';
const title = 'text-[14px] font-medium text-[#E9ECF1]';
const chip = (on: boolean) => clsx('h-8 px-3 rounded-full text-[12.5px] disabled:opacity-40', on ? 'bg-[#232936] text-white' : 'bg-[#161A22] text-[#C9CED6] hover:bg-[#1B2130]');
const input = 'h-9 bg-[#161A22] border border-[#1A1E27] rounded-[10px] px-3 font-mono-code text-[13px] text-[#E9ECF1] outline-none focus:border-[#6CB8FF] min-w-0';

type Confirm = { title: string; body: string; label: string; run: () => void };

export const SimLab: React.FC = () => {
  const signedIn = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const role = useAuthStore((s) => s.activeRole);
  const gate = can('sim:run', role);
  if (!signedIn || !gate.allowed) {
    return (
      <div className="min-h-screen bg-[#090B10] text-[#E9ECF1] font-sans-body flex items-center justify-center p-4">
        <div className={clsx(card, 'max-w-[440px] w-full p-6 flex flex-col gap-4')}>
          <Logo />
          <h1 className="text-[20px] font-semibold">Simulator Lab</h1>
          <p className="text-[13.5px] text-[#9AA3B2] leading-relaxed">
            {!signedIn ? 'Sign in to the console first. The lab changes what the ground segment receives, so it needs a named person whose role may run the simulator.'
              : `${user.name} is signed in as ${role}. ${gate.reason}`}
          </p>
          <a href="/#/signin" className="self-start h-10 px-4 rounded-[10px] bg-[#F28C28] hover:bg-[#F59A45] text-[#1A0E02] font-semibold text-[13.5px] inline-flex items-center">{signedIn ? 'Switch person or role' : 'Sign in'}</a>
          <p className="text-[12px] text-[#7C8594]">Open the lab from the console in the same browser tab so your session carries over.</p>
        </div>
      </div>
    );
  }
  return <Lab who={`${user.name} · ${role}`} />;
};

const Lab: React.FC<{ who: string }> = ({ who }) => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [prev, setPrev] = useState<Stats | null>(null);
  const [replay, setReplay] = useState<Replay | null>(null);
  const [imp, setImp] = useState<Impairments>(CLEAN);
  const [events, setEvents] = useState<Events>({});
  const [err, setErr] = useState('');
  const [speed, setSpeed] = useState(100);
  const [channel, setChannel] = useState('MAG_X');
  const [online, setOnline] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const lastStats = useRef<Stats | null>(null);

  // Poll the backend once a second; a recovered backend clears its own "not reachable" error.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const [s, r, e] = await Promise.all([simCall<Stats>('/pipeline/stats'), simCall<Replay>('/replay').catch(() => null), simCall<Events>('/pipeline/events').catch(() => ({}))]);
        if (!alive) return;
        setPrev(lastStats.current);
        lastStats.current = s;
        setStats(s); setReplay(r); setEvents(e); setOnline(true);
        setErr((x) => (x === OFFLINE ? '' : x));
      } catch {
        if (alive) { setOnline(false); setErr(OFFLINE); }
      }
    };
    void tick();
    const t = window.setInterval(tick, 1000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  useEffect(() => { void simCall<Impairments>('/link').then(setImp).catch(() => {}); }, []);

  const act = async (fn: () => Promise<unknown>) => { setErr(''); try { await fn(); } catch (x) { setErr((x as Error).message); } };
  const control = (body: Record<string, unknown>) => act(async () => { const r = await simCall<Replay>('/replay', 'POST', body); setReplay(r); });
  const inject = (event: string, arg = 0) => act(() => simCall('/replay/inject', 'POST', { event, arg }));
  const applyLink = (next: Impairments) => {
    const go = () => void act(async () => setImp(await simCall<Impairments>('/link', 'PUT', next)));
    if (next.enabled && next.scope === '') setConfirm({ title: 'Impair the link for every spacecraft?', body: 'Every simulated satellite, not only OPSSAT-1, will lose, corrupt or reorder frames until you turn this off. Anyone watching the console will see gaps and alarms.', label: 'Apply to every spacecraft', run: go });
    else go();
  };

  const g = (stage: string, k: string) => stats?.stages[stage]?.[k] ?? 0;
  const rate = (stage: string, k: string) => {
    if (!stats || !prev) return 0;
    return Math.max(0, (stats.stages[stage]?.[k] ?? 0) - (prev.stages[stage]?.[k] ?? 0)) / Math.max(0.5, stats.uptime_s - prev.uptime_s);
  };
  const lat = stats?.latency?.ert_to_ws;
  const pct = replay && replay.samples ? (100 * replay.position) / replay.samples : 0;

  const events1: [string, () => void][] = [
    ['Counter reset', () => inject('counter_reset')], ['Clock jump +2 h', () => inject('time_jump', 7200)], ['Unknown APID ×10', () => inject('unknown_apid', 10)],
    ['Malformed packet', () => inject('bad_packet', 1)], ['Station outage 3 s', () => inject('stall', 3)],
    ['Lose next TC frame', () => setConfirm({ title: 'Lose the next telecommand frame?', body: 'The next telecommand sent to any spacecraft from any console is dropped on the forward link. COP-1 should retransmit it.', label: 'Drop next frame', run: () => void act(() => simCall('/uplink/drop', 'POST')) })],
  ];

  return (
    <div className="min-h-screen bg-[#090B10] text-[#E9ECF1] font-sans-body">
      <header className="min-h-14 px-5 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[#1A1E27]">
        <Logo />
        <span className="text-[15px] font-semibold">Simulator Lab</span>
        <span className="text-[12.5px] text-[#7C8594]">OPSSAT-1 replays ESA OPS-SAT flight telemetry (OPS-SAT-AD, CC-BY-4.0) through the real ground segment</span>
        <span className="ml-auto flex items-center gap-2 text-[12.5px] text-[#9AA3B2]">
          <StatusGlyph kind={online ? 'normal' : 'critical'} className={online ? 'text-[#4ADE9A]' : 'text-[#FF6B6B]'} />
          {online ? `backend up ${Math.round(stats?.uptime_s ?? 0)} s` : 'backend offline'} · {who}
        </span>
        <a href="/" className="text-[12.5px] text-[#F2A65A] hover:text-[#FFC48A]">Open console</a>
      </header>

      <div className="mx-5 mt-4 flex items-center gap-2.5 rounded-xl bg-[#6CB8FF]/12 text-[#8CC8FF] px-3.5 py-2.5 text-[13px]"><b className="font-semibold">Simulation</b> · no real spacecraft is commanded from this page</div>
      {err && <div role="status" className="mx-5 mt-3 rounded-xl bg-[#FF6B6B]/10 px-4 py-2.5 text-[13px] flex items-center gap-3"><span className="text-[#FF7A7A] font-medium">Error.</span><span className="flex-1">{err}</span><button type="button" onClick={() => setErr('')} className="text-[#9AA3B2] hover:text-[#E9ECF1]">Dismiss</button></div>}

      <main className="p-5 flex flex-wrap gap-4 items-start">
        <div className="flex-[1_1_360px] min-w-0 flex flex-col gap-4">
          <section className={card}>
            <header className={head}><h2 className={title}>Flight data replay</h2><span className="font-mono-code text-[12px] text-[#9AA3B2]">{replay?.state ?? '—'}</span></header>
            <div className="px-5 pb-5 pt-3 flex flex-col gap-3 text-[13px]">
              <dl className="grid grid-cols-2 gap-y-1 text-[12.5px]">
                <dt className="text-[#7C8594]">Samples</dt><dd className="font-mono-code">{fmt(replay?.samples)}</dd>
                <dt className="text-[#7C8594]">Segments</dt><dd className="font-mono-code">{fmt(replay?.segments)} ({fmt(replay?.anomaly_segments)} anomalous)</dd>
                <dt className="text-[#7C8594]">Emitted</dt><dd className="font-mono-code">{fmt(replay?.samples_emitted)} · {fmt(replay?.anomaly_samples_emitted)} in anomalies</dd>
                <dt className="text-[#7C8594]">Frames</dt><dd className="font-mono-code">{fmt(replay?.frames)}</dd>
                <dt className="text-[#7C8594]">Recorded</dt><dd className="font-mono-code">{replay?.recorded_utc?.replace('T', ' ').slice(0, 16) ?? '—'} UTC</dd>
              </dl>
              <span className="block h-2 rounded bg-[#1A1E27]"><i className="block h-full rounded bg-[#6CB8FF]" style={{ width: `${pct}%` }} /></span>
              <input type="range" min={0} max={100} step={0.5} value={pct} aria-label="Replay position" onChange={(e) => control({ action: 'seek', position_pct: Number(e.target.value) })} />
              <div className="flex p-[3px] rounded-xl bg-[#090B10]" role="group" aria-label="Replay speed">
                {SPEEDS.map(([v, l]) => (
                  <button key={l} type="button" aria-pressed={speed === v} onClick={() => { setSpeed(v); if (replay?.state === 'running' || replay?.state === 'paused') void control({ action: 'speed', speed: v }); }}
                    className={clsx('flex-1 h-8 rounded-[9px] font-mono-code text-[12.5px]', speed === v ? 'bg-[#232936] text-white' : 'text-[#9AA3B2]')}>{l}</button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => control({ action: 'start', speed, position_pct: pct >= 99.9 ? 0 : pct })}><Play size={14} /> Start</Button>
                {replay?.state === 'running'
                  ? <Button size="sm" variant="secondary" onClick={() => control({ action: 'pause' })}><Pause size={14} /> Pause</Button>
                  : <Button size="sm" variant="secondary" onClick={() => control({ action: 'resume' })} disabled={replay?.state !== 'paused'}><Play size={14} /> Resume</Button>}
                <Button size="sm" variant="danger" onClick={() => control({ action: 'stop' })}><Square size={13} /> Stop</Button>
                <label className="flex items-center gap-1.5 text-[12.5px] text-[#9AA3B2] ml-auto"><input type="checkbox" checked={replay?.loop ?? false} onChange={(e) => control({ action: 'speed', loop: e.target.checked })}  /> Loop</label>
              </div>
            </div>
          </section>

          <section className={card}>
            <header className={head}>
              <h2 className={title}>Space-to-ground link</h2>
              <label className="flex items-center gap-1.5 text-[12.5px]"><input type="checkbox" checked={imp.enabled} onChange={(e) => applyLink({ ...imp, enabled: e.target.checked })}  /> Faults on</label>
            </header>
            <div className="px-5 pb-5 pt-3 flex flex-col gap-3">
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(PRESETS).map(([name, p]) => <button key={name} type="button" onClick={() => applyLink({ ...CLEAN, scope: imp.scope, ...p, enabled: name !== 'Clean link' })} className={chip(false)}>{name}</button>)}
              </div>
              <label className="flex items-center justify-between gap-3 text-[12.5px] text-[#9AA3B2]">Applies to
                <Select value={imp.scope} onChange={(e) => applyLink({ ...imp, scope: e.target.value })} className={input}><option value="OPSSAT-1">OPSSAT-1</option><option value="">every spacecraft</option></Select>
              </label>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                {FIELDS.map(([k, l, min, max, step]) => (
                  <label key={k} className="flex flex-col gap-1 text-[12px] text-[#7C8594]">{l}
                    <input type="number" min={min} max={max} step={step} value={imp[k] as number}
                      onChange={(e) => setImp({ ...imp, [k]: Math.min(max, Math.max(min, Number(e.target.value) || 0)) })} onBlur={() => applyLink(imp)} className={input} />
                  </label>
                ))}
              </div>
            </div>
          </section>

          <section className={card}>
            <header className={head}><h2 className={title}>One-off events</h2></header>
            <div className="px-5 pb-5 pt-3 grid grid-cols-2 gap-2 text-[12.5px]">
              {events1.map(([l, fn]) => (
                <button key={l} type="button" onClick={fn} className="h-9 px-3 rounded-[10px] bg-[#161A22] hover:bg-[#1B2130] flex items-center gap-1.5 text-left"><Zap size={13} className="text-[#F5C451]" /> {l}</button>
              ))}
              <button type="button" onClick={() => setConfirm({ title: 'Reset every counter?', body: 'Zeroes every pipeline counter and the replay ledger for everyone using the lab or the Simulator screen. The numbers cannot be recovered.', label: 'Reset counters', run: () => void act(() => simCall('/pipeline/reset', 'POST')) })}
                className="col-span-2 h-9 px-3 rounded-[10px] bg-[#161A22] hover:bg-[#1B2130] text-[#FF7A7A] flex items-center justify-center gap-1.5"><RotateCcw size={13} /> Reset all counters</button>
            </div>
          </section>
        </div>

        <div className="flex-[999_1_560px] min-w-0 flex flex-col gap-4">
          <section className={card}>
            <header className={head}>
              <h2 className={title}>Pipeline, per stage</h2>
              <span className="font-mono-code text-[12px] text-[#9AA3B2]">{lat ? `receive → browser p50 ${lat.p50_ms.toFixed(1)} · p95 ${lat.p95_ms.toFixed(1)} · p99 ${lat.p99_ms.toFixed(1)} ms` : 'latency —'}</span>
            </header>
            <div className="px-5 pt-3 pb-3 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
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
            <div className="px-5 pb-5 grid gap-2 text-[12px]" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              <Mini title="Anomaly model" items={[['spikes', g('anomaly', 'SPIKE')], ['noise', g('anomaly', 'NOISE')], ['flat', g('anomaly', 'FLAT')], ['gaps', g('anomaly', 'GAP')]]} />
              <Mini title="Dead letters" items={[['total', g('deadletter', 'total')], ['bad frames', g('deadletter', 'FRAME_VALIDATION_FAILED')], ['unknown SCID', g('deadletter', 'UNKNOWN_SCID')], ['decode', g('deadletter', 'DECOM_FAILURE')]]} />
              <Mini title="Uplink (COP-1)" items={[['frames sent', g('uplink', 'frames_sent')], ['acknowledged', g('uplink', 'acknowledged')], ['retransmitted', g('uplink', 'retransmitted_frames')], ['T1 timeouts', g('uplink', 't1_timeouts')]]} />
              <Mini title="Verification (PUS-1)" items={[['accepted', g('verification', 'accepted')], ['completed', g('verification', 'completed')], ['failed on board', g('verification', 'execution_failed') + g('verification', 'acceptance_failed')], ['queued (window)', g('uplink', 'queued')]]} />
            </div>
          </section>

          <section className={card}>
            <header className={clsx(head, 'flex-wrap')}>
              <h2 className={title}>OPSSAT-1 live, as a console receives it</h2>
              <div className="flex flex-wrap gap-1">{CHANNELS.map((c) => <button key={c} type="button" onClick={() => setChannel(c)} className={clsx(chip(channel === c), 'h-7 font-mono-code text-[12px]')}>{c}</button>)}</div>
            </header>
            <LiveChart channel={channel} />
          </section>

          <div className="flex flex-wrap gap-4">
            <section className={clsx(card, 'flex-[1_1_320px] min-w-0')}>
              <header className={head}><h2 className={title}>Anomaly detections</h2></header>
              <EventList rows={(events.detections ?? []).map((d) => [d.obt?.slice(11, 19) ?? '', `${d.param} · ${d.kind}`, `score ${d.score.toFixed(1)} · value ${d.value.toFixed(3)}`, d.kind === 'SPIKE' ? 'critical' : 'caution'])} empty="No detections yet. Start the replay." />
            </section>
            <section className={clsx(card, 'flex-[1_1_320px] min-w-0')}>
              <header className={head}><h2 className={title}>Dead letters</h2></header>
              <EventList rows={(events.dead_letters ?? []).map((d) => [d.received_time?.slice(11, 19) ?? '', `${d.error_type} · SCID ${d.scid}`, d.reason ?? d.detail ?? '', 'critical'])} empty="Nothing rejected." />
            </section>
          </div>
        </div>
      </main>

      {confirm && (
        <Modal title={confirm.title} onClose={() => setConfirm(null)}
          footer={<><Button variant="secondary" autoFocus onClick={() => setConfirm(null)}>Cancel</Button><Button variant="warning" onClick={() => { const c = confirm; setConfirm(null); c.run(); }}>{confirm.label}</Button></>}>
          <p className="text-[13px] text-[#C9CED6]">{confirm.body}</p>
        </Modal>
      )}
    </div>
  );
};

const Stage: React.FC<{ title: string; main: number; unit: string; rate: number; rows: [string, number, ('bad' | 'warn')?][] }> = ({ title, main, unit, rate, rows }) => (
  <div className="bg-[#161A22] rounded-xl p-3 flex flex-col gap-1.5 min-w-0">
    <span className="text-[13px] text-[#9AA3B2]">{title}</span>
    <span className="text-[24px] font-semibold tracking-[-0.02em] leading-none">{fmt(main)}</span>
    <span className="text-[12px] text-[#7C8594]">{unit} · {rate.toFixed(0)}/s</span>
    <ul className="mt-1 flex flex-col gap-0.5">
      {rows.map(([l, v, tone]) => (
        <li key={l} className="flex justify-between gap-2 text-[12px]">
          <span className="text-[#7C8594] truncate">{l}</span>
          <span className={clsx('font-mono-code tabular-nums', v > 0 && tone === 'bad' ? 'text-[#FF6B6B]' : v > 0 && tone === 'warn' ? 'text-[#F5C451]' : 'text-[#C9CED6]')}>{fmt(v)}</span>
        </li>
      ))}
    </ul>
  </div>
);

const Mini: React.FC<{ title: string; items: [string, number][] }> = ({ title, items }) => (
  <div className="bg-[#161A22] rounded-xl px-3 py-2.5">
    <span className="text-[13px] text-[#9AA3B2]">{title}</span>
    <div className="grid grid-cols-2 gap-x-2 mt-1">{items.map(([l, v]) => <span key={l} className="flex justify-between gap-1 text-[12px]"><span className="text-[#7C8594] truncate">{l}</span><span className="font-mono-code">{fmt(v)}</span></span>)}</div>
  </div>
);

const EventList: React.FC<{ rows: [string, string, string, 'critical' | 'caution'][]; empty: string }> = ({ rows, empty }) => (
  <ul className="max-h-[260px] overflow-y-auto divide-y divide-[#161A22] text-[12.5px]">
    {rows.length === 0 && <li className="px-4 py-3 text-[#7C8594]">{empty}</li>}
    {rows.map(([t, a, b, kind], i) => (
      <li key={i} className="px-4 py-1.5 flex items-center gap-2.5">
        <StatusGlyph kind={kind} className={kind === 'critical' ? 'text-[#FF6B6B]' : 'text-[#F5C451]'} />
        <span className="font-mono-code text-[#7C8594] tabular-nums">{t}</span>
        <span className="font-mono-code">{a}</span>
        <span className="text-[#7C8594] truncate ml-auto">{b}</span>
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
        let m: { type?: string; values?: { param_id: string; timestamp_utc: string; eu_value: number }[] };
        try { m = JSON.parse(ev.data); } catch { return; }
        if (m.type === 'HELLO') sock?.send(JSON.stringify({ type: 'SUBSCRIBE', sub_id: 'lab', kind: 'PARAMS', satellite: 'OPSSAT-1' }));
        if (m.type !== 'DELTA' && m.type !== 'SNAPSHOT') return;
        for (const v of m.values ?? []) {
          if (typeof v?.eu_value !== 'number') continue;
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
      axes: [{ stroke: '#7C8594', grid: { stroke: '#161A22' } }, { stroke: '#7C8594', grid: { stroke: '#161A22' }, size: 60 }],
      series: [{}, { label: channel, stroke: '#6CB8FF', width: 1.5 }],
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
        <StatusGlyph kind={ws === 'connected' ? 'normal' : 'standby'} className={ws === 'connected' ? 'text-[#4ADE9A]' : 'text-[#6CB8FF]'} />
        <span className="text-[#7C8594]">WebSocket {ws}</span>
        <span className="ml-auto font-mono-code text-[16px]">{summary}</span>
      </div>
      <div ref={host} className="w-full" />
      <p className="text-[11px] text-[#6B7383] mt-1">Time axis is on-board time: it follows the recorded sample spacing, so at speeds above 1× it runs faster than the wall clock.</p>
    </div>
  );
};
