import React, { useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { Pause, Play, SkipBack } from 'lucide-react';
import type { Param, Satellite } from '../../types';
import { PARAMETERS, STATIONS } from '../../data/fleet';
import { history, seeded } from '../../ops/history';
import { passes } from '../../orbit/orbit';
import { satElements } from '../../orbit/fleetOrbit';
import { stationColor } from '../../ops/colors';
import { ParamViews, Sub } from './ParamViews';
import { SampleTag } from '../molecules/Page';
import { Select } from '../molecules/Select';
import { DateInput } from '../molecules/DateInput';

type Source = 'RANGE' | 'DURATION' | 'LAST_PASS' | 'PASS_NUMBER';
const DURATIONS = { '5 min': 5, '15 min': 15, '30 min': 30, '1 h': 60, '3 h': 180, '6 h': 360 } as const;
const SPEEDS = [1, 4, 16, 64];
const POINTS = 240;

const local = (ms: number) => { const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
const utc = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

const state = (v: number, d: { warnLo: number; warnHi: number; critLo: number; critHi: number }): 0 | 1 | 2 =>
  v <= d.critLo || v >= d.critHi ? 2 : v <= d.warnLo || v >= d.warnHi ? 1 : 0;

/** Replays past values: by time range, last duration, last pass, or pass number. Scrub or play; the views below follow. */
export const PlaybackPanel: React.FC<{ sat: Satellite; cvt: Record<string, Param>; onOpenParam: (id: string) => void; sub: Sub | 'ALL'; onSub: (s: Sub | 'ALL') => void }> = ({ sat, cvt, onOpenParam, sub, onSub }) => {
  const [source, setSource] = useState<Source>('DURATION');
  const [duration, setDuration] = useState<keyof typeof DURATIONS>('30 min');
  const [rangeFrom, setRangeFrom] = useState(() => local(Date.now() - 45 * 60_000));
  const [rangeTo, setRangeTo] = useState(() => local(Date.now() - 15 * 60_000));
  const [passNo, setPassNo] = useState(1);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);

  // Past passes over this satellite's stations in the last 24 h, oldest first and numbered.
  const pastPasses = useMemo(() => {
    const el = satElements(sat), now = Date.now();
    return sat.assigned_ground_stations.flatMap((id) => {
      const st = STATIONS.find((s) => s.id === id);
      return st ? passes(el, st, now - 24 * 3600_000, 24 * 3600_000, 10, 60_000).filter((p) => p.los < now).map((p) => ({ ...p, station: id })) : [];
    }).sort((a, b) => a.aos - b.aos).map((p, i) => ({ ...p, no: i + 1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sat.sat_id]);

  const win = useMemo(() => {
    const now = Date.now();
    if (source === 'DURATION') return { t0: now - DURATIONS[duration] * 60_000, t1: now, label: `Last ${duration}` };
    if (source === 'RANGE') { const a = Date.parse(rangeFrom + 'Z') + new Date().getTimezoneOffset() * 60000, b = Date.parse(rangeTo + 'Z') + new Date().getTimezoneOffset() * 60000; return { t0: Math.min(a, b), t1: Math.max(a, b), label: 'Time range' }; }
    if (source === 'LAST_PASS') { const p = pastPasses[pastPasses.length - 1]; return p ? { t0: p.aos, t1: p.los, label: `Last pass · ${p.station} #${p.no}` } : null; }
    const p = pastPasses.find((x) => x.no === passNo);
    return p ? { t0: p.aos, t1: p.los, label: `Pass #${p.no} · ${p.station}` } : null;
  }, [source, duration, rangeFrom, rangeTo, passNo, pastPasses]);

  const t0 = win?.t0 ?? Date.now() - 600_000, t1 = win?.t1 ?? Date.now();
  const anchor = Math.floor(Date.now() / 1000);
  const ts = useMemo(() => Array.from({ length: POINTS }, (_, i) => Math.round((t0 + (i / (POINTS - 1)) * (t1 - t0)) / 1000)), [t0, t1]);

  // Values for every parameter over the window; same generator as everywhere else, anchored to "now".
  const series = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const defs of Object.values(PARAMETERS)) for (const d of defs) map.set(d.param_id, history(sat.sat_id, d, cvt[d.param_id]?.eu_value ?? d.value, ts, anchor));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sat.sat_id, ts]);

  useEffect(() => { setIdx(0); setPlaying(false); }, [t0, t1]);
  const pos = useRef(idx); // fractional position, so 1x moves at a quarter of the 4x rate
  useEffect(() => { pos.current = idx; }, [idx]);
  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => {
      pos.current += speed / 4;
      if (pos.current >= POINTS - 1) { pos.current = POINTS - 1; setIdx(POINTS - 1); setPlaying(false); } else setIdx(Math.floor(pos.current));
    }, 250);
    return () => clearInterval(t);
  }, [playing, speed]);

  const at = ts[idx];
  const override = useMemo(() => {
    const out: Record<string, Param> = {};
    for (const [sub, defs] of Object.entries(PARAMETERS)) for (const d of defs) {
      const v = series.get(d.param_id)![idx];
      out[d.param_id] = { param_id: d.param_id, name: d.name, subsystem: sub as Param['subsystem'], eu_value: v, unit: d.unit, alarm_state: state(v, d), quality: 0, timestamp_utc: new Date(at * 1000).toISOString() };
    }
    return out;
  }, [series, idx, at]);

  // Markers on the scrubber: contact edges, telemetry gaps and alarm transitions inside the window.
  const events = useMemo(() => {
    const at = (t: number) => Math.round(((t - t0) / (t1 - t0 || 1)) * (POINTS - 1));
    const out: { i: number; kind: 'AOS' | 'LOS' | 'GAP' | 'ALARM'; text: string }[] = [];
    for (const p of pastPasses) {
      if (p.aos >= t0 && p.aos <= t1) out.push({ i: at(p.aos), kind: 'AOS', text: `AOS ${p.station}` });
      if (p.los >= t0 && p.los <= t1) out.push({ i: at(p.los), kind: 'LOS', text: `LOS ${p.station}` });
    }
    const r = seeded(`${sat.sat_id}-gaps-${Math.round(t0 / 60000)}`);
    for (let g = 0; g < Math.floor(r() * 3); g++) out.push({ i: 8 + Math.floor(r() * (POINTS - 24)), kind: 'GAP', text: `Telemetry gap ${4 + Math.floor(r() * 20)} s` });
    for (const defs of Object.values(PARAMETERS)) for (const d of defs) {
      const v = series.get(d.param_id); if (!v) continue;
      for (let i = 1; i < v.length; i++) if (state(v[i], d) > state(v[i - 1], d) && out.filter((e) => e.kind === 'ALARM').length < 10) { out.push({ i, kind: 'ALARM', text: `${d.param_id} ${state(v[i], d) === 2 ? 'critical' : 'warning'}` }); break; }
    }
    return out.sort((a, b) => a.i - b.i);
  }, [pastPasses, t0, t1, series, sat.sat_id]);
  const MARK: Record<string, string> = { AOS: '#4ADE9A', LOS: '#7C8594', GAP: '#6CB8FF', ALARM: '#FF6B6B' };
  const timeAt = (i: number) => new Date(ts[i] * 1000).toISOString().slice(11, 19);

  const chip = (on: boolean) => clsx('h-8 px-3 rounded-full text-[12.5px]', on ? 'bg-[#232936] text-white' : 'bg-[#161A22] text-[#9AA3B2] hover:text-[#E9ECF1]');

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-[#1A1E27] bg-[#11141B] p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Playback source">
          {([['DURATION', 'Last duration'], ['LAST_PASS', 'Last pass'], ['PASS_NUMBER', 'Pass number'], ['RANGE', 'Time range']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setSource(k)} aria-pressed={source === k} className={chip(source === k)}>{l}</button>
          ))}
          <span className="mx-1 h-5 w-px bg-[#232936]" />
          {source === 'DURATION' && (Object.keys(DURATIONS) as (keyof typeof DURATIONS)[]).map((d) => <button key={d} onClick={() => setDuration(d)} aria-pressed={duration === d} className={chip(duration === d)}>{d}</button>)}
          {source === 'RANGE' && (
            <>
              <label className="text-[12px] text-[#9AA3B2] flex items-center gap-1.5">From <DateInput type="datetime-local" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} className="h-8 rounded bg-[#090B10] border border-[#232936] px-2 text-[12px]" /></label>
              <label className="text-[12px] text-[#9AA3B2] flex items-center gap-1.5">To <DateInput type="datetime-local" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} className="h-8 rounded bg-[#090B10] border border-[#232936] px-2 text-[12px]" /></label>
              <span className="text-[11px] text-[#6B7383]">local time</span>
            </>
          )}
          {source === 'PASS_NUMBER' && (
            <Select value={passNo} onChange={(e) => setPassNo(Number(e.target.value))} aria-label="Pass number" className="h-8 rounded-xl bg-[#161A22] border border-[#232936] px-2 text-[12px] text-[#E9ECF1]">
              {pastPasses.length === 0 && <option>No pass in 24 h</option>}
              {[...pastPasses].reverse().map((p) => <option key={p.no} value={p.no}>#{p.no} · {p.station} · {new Date(p.aos).toISOString().slice(11, 16)}–{new Date(p.los).toISOString().slice(11, 16)}</option>)}
            </Select>
          )}
          {(source === 'LAST_PASS' || source === 'PASS_NUMBER') && pastPasses.length > 0 && (
            <span className="flex items-center gap-1.5 text-[11.5px] text-[#9AA3B2]">{win && <i className="w-2.5 h-2.5 rounded-sm" style={{ background: stationColor(pastPasses.find((p) => p.aos === win.t0)?.station ?? 'HYD') }} />}{pastPasses.length} passes in the last 24 h</span>
          )}
        </div>

        {!win ? <p className="text-[12.5px] text-[#F5C451]">No matching pass in the last 24 hours.</p> : (
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => { setIdx(0); setPlaying(false); }} aria-label="Back to start" className="w-8 h-8 rounded border border-[#232936] flex items-center justify-center hover:bg-[#171B24]"><SkipBack size={14} /></button>
            <button onClick={() => { if (idx >= POINTS - 1) setIdx(0); setPlaying(!playing); }} aria-label={playing ? 'Pause playback' : 'Play'}
              className="h-8 px-3 rounded-[10px] bg-[#F28C28] text-[#1A0E02] text-[12.5px] font-semibold flex items-center gap-1.5">{playing ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Play</>}</button>
            <div className="flex items-center gap-0.5 rounded border border-[#232936] p-0.5" role="group" aria-label="Playback speed">
              {SPEEDS.map((s) => <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)} className={clsx('h-7 px-2 rounded font-mono-code text-[12px]', speed === s ? 'bg-[#232936] text-white' : 'text-[#9AA3B2]')}>{s}×</button>)}
            </div>
            <input type="range" min={0} max={POINTS - 1} value={idx} onChange={(e) => { setIdx(Number(e.target.value)); setPlaying(false); }} aria-label="Playback position" className="flex-1 min-w-[200px]" />
            <span className="font-mono-code text-[12px] tabular-nums text-[#E9ECF1] whitespace-nowrap">{utc(at * 1000)} UTC</span>
          </div>
        )}
        {win && (
          <div className="flex flex-col gap-1">
            <div className="relative h-6 rounded bg-[#090B10] border border-[#1A1E27] cursor-pointer" role="presentation"
              onClick={(e) => { const b = e.currentTarget.getBoundingClientRect(); setIdx(Math.round(((e.clientX - b.left) / b.width) * (POINTS - 1))); setPlaying(false); }}>
              {events.map((e, k) => <span key={k} title={`${timeAt(e.i)} · ${e.text}`} className="absolute top-1 bottom-1 w-[3px] -translate-x-1/2 rounded-sm" style={{ left: `${(e.i / (POINTS - 1)) * 100}%`, background: MARK[e.kind] }} />)}
              <span className="absolute top-0 bottom-0 w-px bg-[#E9ECF1]" style={{ left: `${(idx / (POINTS - 1)) * 100}%` }} />
            </div>
            <div className="flex gap-3 text-[11px] text-[#7C8594]">{Object.entries(MARK).map(([k, c]) => <span key={k} className="flex items-center gap-1"><i className="w-2 h-2 rounded-sm" style={{ background: c }} />{k === 'ALARM' ? 'Alarm' : k === 'GAP' ? 'Gap' : k === 'AOS' ? 'Contact start' : 'Contact end'}</span>)}</div>
          </div>
        )}
        {win && <p className="text-[11.5px] text-[#7C8594]">{win.label} · {utc(t0)} → {utc(t1)} UTC · {Math.round((t1 - t0) / 60000)} min. </p>}
        {win && <SampleTag className="self-start">Reconstructed — archive not connected</SampleTag>}
      </div>

      {win && (
        <div className="rounded-2xl border border-[#1A1E27] bg-[#11141B] p-4">
          <h3 className="text-[14px] font-medium mb-2">Event log at {timeAt(idx)} UTC</h3>
          {events.filter((e) => e.i <= idx).length === 0 ? <p className="text-[12.5px] text-[#7C8594]">Nothing yet. Play or drag the position forward.</p> : (
            <ul className="flex flex-col gap-1 text-[12.5px]">
              {events.filter((e) => e.i <= idx).slice(-8).reverse().map((e, k) => <li key={k} className="flex items-center gap-2"><i className="w-2 h-2 rounded-sm" style={{ background: MARK[e.kind] }} /><span className="font-mono-code tabular-nums text-[#9AA3B2]">{timeAt(e.i)}</span>{e.text}</li>)}
            </ul>
          )}
        </div>
      )}

      <ParamViews satId={sat.sat_id} cvt={cvt} override={override} onOpenParam={onOpenParam} sub={sub} onSub={onSub}
        window={{ ts, series: (id) => series.get(id) ?? [], cursorTs: at }} />
    </div>
  );
};
