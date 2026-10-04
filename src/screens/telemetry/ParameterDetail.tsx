import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import type uPlot from 'uplot';
import { Download, Pause, Play, Plus, X } from 'lucide-react';
import { MultiPlot, PlotSeries } from '../../components/organisms/MultiPlot';
import { Card, KpiRow, KpiTile, SampleTag, Segmented } from '../../components/molecules/Page';
import { Button } from '../../components/atoms/Button';
import { Pill } from '../../components/atoms/Badge';
import { useFleetStore } from '../../store/useFleetStore';
import { useAlarmStore } from '../../store/useAlarmStore';
import { useMissionStore } from '../../store/useMissionStore';
import { useAuthStore } from '../../store/useAuthStore';
import { PARAMETERS, STATIONS } from '../../data/fleet';
import { findDef, fmtNum, fmtUtc, history, rollupLabel } from '../../ops/history';
import { passes } from '../../orbit/orbit';
import { satElements } from '../../orbit/fleetOrbit';
import { Select } from '../../components/molecules/Select';

export const RANGES = ['Last pass', '15 min', '1 h', '6 h', '24 h', '7 d'] as const;
export type Range = typeof RANGES[number];
export const rangeOf = (s?: string): Range => (RANGES as readonly string[]).includes(s ?? '') ? (s as Range) : '1 h';

/** Points and seconds per point for each range; the label on screen is derived from the step. */
const RANGE_SPEC: Record<Exclude<Range, 'Last pass'>, { points: number; step: number }> = {
  '15 min': { points: 900, step: 1 },
  '1 h': { points: 360, step: 10 },
  '6 h': { points: 360, step: 60 },
  '24 h': { points: 288, step: 300 },
  '7 d': { points: 336, step: 1800 },
};

/** Categorical colours, deliberately not the status colours. */
const PALETTE = ['#6CB8FF', '#9B8CFF', '#3DD9C1', '#F472B6', '#84CC16', '#E879F9'];
const MAX_SERIES = 6;
type Layout = 'OVERLAY' | 'STACKED';
interface Sel { id: string; sat: string; param: string; color: string }
const selectCls = 'h-8 bg-[#11141B] border border-[#232936] rounded-lg px-2 font-mono-code text-[12.5px] outline-none focus:border-[#6CB8FF]';

/** S05 · Parameter history — the History tab of a satellite: compare and inspect parameters over time. */
export const ParameterDetail: React.FC<{ satId: string; paramId: string; range: Range; onRange: (r: Range) => void; onNavigate: (to: string) => void }> = ({
  satId, paramId, range, onRange,
}) => {
  const satellites = useFleetStore((s) => s.satellites);
  const fleetIds = Object.keys(satellites).sort();
  const first = findDef(paramId) ?? findDef('BAT_TEMP')!;
  const [sel, setSel] = useState<Sel[]>([{ id: `${satId}:${first.def.param_id}`, sat: satId, param: first.def.param_id, color: PALETTE[0] }]);
  const [layout, setLayout] = useState<Layout>('OVERLAY');
  const [xRange, setXRange] = useState<[number, number] | null>(null);
  const [adding, setAdding] = useState(false);
  const [addSat, setAddSat] = useState(satId);
  const [addParam, setAddParam] = useState('HTR_A_DUTY');

  useEffect(() => {
    const f = findDef(paramId) ?? findDef('BAT_TEMP')!;
    setSel([{ id: `${satId}:${f.def.param_id}`, sat: satId, param: f.def.param_id, color: PALETTE[0] }]);
    setAddSat(satId);
    setXRange(null);
  }, [satId, paramId]);

  const liveCvt = useFleetStore((s) => s.cvt);
  const [frozen, setFrozen] = useState<typeof liveCvt | null>(null);
  const paused = frozen !== null;
  const cvt = frozen ?? liveCvt;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (paused) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 10_000);
    return () => clearInterval(t);
  }, [paused]);

  // The last pass of the first satellite over any of its stations, from the orbit model.
  const lastPass = useMemo(() => {
    const sat = satellites[satId];
    if (!sat) return null;
    const now = Date.now(), el = satElements(sat);
    const all = sat.assigned_ground_stations.flatMap((id) => {
      const st = STATIONS.find((s) => s.id === id);
      return st ? passes(el, st, now - 24 * 3600_000, 24 * 3600_000, 10, 60_000).filter((p) => p.los < now).map((p) => ({ ...p, station: id })) : [];
    });
    return all.sort((a, b) => b.los - a.los)[0] ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [satId, range]);

  const { timestamps, step } = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    if (range === 'Last pass') {
      if (!lastPass) return { timestamps: [now - 600, now], step: 600 };
      const a = Math.floor(lastPass.aos / 1000), b = Math.floor(lastPass.los / 1000);
      const st = Math.max(1, Math.ceil((b - a) / 600));
      return { timestamps: Array.from({ length: Math.floor((b - a) / st) + 1 }, (_, i) => a + i * st), step: st };
    }
    const sp = RANGE_SPEC[range];
    return { timestamps: Array.from({ length: sp.points }, (_, i) => now - (sp.points - 1 - i) * sp.step), step: sp.step };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, lastPass, paused ? 'paused' : tick]);

  const rows = useMemo(() => sel.map((s) => ({ ...s, ...findDef(s.param)! })), [sel]);
  const endsNow = range !== 'Last pass';
  const data = useMemo(() => rows.map((r) => {
    const live = cvt[r.sat]?.[r.def.param_id]?.eu_value ?? r.def.value;
    return history(r.sat, r.def, live, timestamps, endsNow ? undefined : Math.floor(Date.now() / 1000));
  }), [rows, timestamps, cvt, endsNow]);

  const plotSeries: PlotSeries[] = rows.map((r, i) => ({
    label: `${r.sat} ${r.param}`, color: r.color, unit: r.def.unit, values: data[i],
    limits: { lowSoft: r.def.warnLo, hiSoft: r.def.warnHi, lowHard: r.def.critLo, hiHard: r.def.critHi },
  }));

  // Alarms on the selected parameters, from the alarm store: open and returned to normal.
  const active = useAlarmStore((s) => s.active);
  const closed = useAlarmStore((s) => s.history);
  const alarmRows = [...active, ...closed].filter((a) => rows.some((r) => r.sat === a.sat_id && r.param === a.param_id))
    .sort((a, b) => Date.parse(b.timestamp_utc) - Date.parse(a.timestamp_utc));
  const commands = useMissionStore((s) => s.commands);
  const t0 = timestamps[0], t1 = timestamps[timestamps.length - 1];
  const markers = [
    ...alarmRows.map((a) => ({ t: Date.parse(a.timestamp_utc) / 1000, color: a.alarm_state === 2 ? '#FF6B6B' : '#F5C451', label: `${a.alarm_state === 2 ? 'Critical' : 'Warning'} ${a.param_id} · ${fmtUtc(Date.parse(a.timestamp_utc))}` })),
    ...commands.filter((c) => rows.some((r) => r.sat === c.sat_id)).map((c) => ({ t: Date.parse(c.utc) / 1000, color: '#F28C28', label: `${c.mnemonic} · ${fmtUtc(Date.parse(c.utc))}` })),
  ].filter((m) => m.t >= t0 && m.t <= t1);

  // ---- zoom -----------------------------------------------------------------
  const plots = useRef(new Set<uPlot>());
  const registry = (u: uPlot | null) => {
    if (u) plots.current.add(u);
    else plots.current = new Set([...plots.current].filter((p) => p.root.isConnected));
  };
  const resetZoom = () => { plots.current.forEach((p) => p.setScale('x', { min: t0, max: t1 })); setXRange(null); };
  const onXRange = useCallback((min: number, max: number) => setXRange(min <= t0 + 1 && max >= t1 - 1 ? null : [min, max]), [t0, t1]);

  // ---- selection ------------------------------------------------------------
  const add = () => {
    const id = `${addSat}:${addParam}`;
    if (sel.length >= MAX_SERIES || sel.some((s) => s.id === id)) return;
    setSel([...sel, { id, sat: addSat, param: addParam, color: PALETTE.find((c) => !sel.some((s) => s.color === c)) ?? PALETTE[0] }]);
    setAdding(false);
  };

  // ---- stats ----------------------------------------------------------------
  const inView = (i: number) => !xRange || (timestamps[i] >= xRange[0] && timestamps[i] <= xRange[1]);
  const stats = rows.map((r, i) => {
    const vs = data[i].filter((_, k) => inView(k));
    const n = vs.length;
    const out = vs.filter((v) => v <= r.def.warnLo || v >= r.def.warnHi).length;
    const live = cvt[r.sat]?.[r.def.param_id];
    return {
      r, live, n,
      min: n ? Math.min(...vs) : NaN, max: n ? Math.max(...vs) : NaN, mean: n ? vs.reduce((a, b) => a + b, 0) / n : NaN,
      outSec: out * step,
    };
  });
  const dur = (s: number) => (s <= 0 ? 'none' : s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`);

  const actor = useAuthStore((s) => s.user.name);
  const appendAudit = useMissionStore((s) => s.appendAudit);
  const exportCsv = () => {
    const head = ['utc', ...rows.map((r) => `${r.sat}:${r.param}${r.def.unit ? ` (${r.def.unit})` : ''}`)].join(',');
    const lines = timestamps.map((t, i) => (inView(i) ? [new Date(t * 1000).toISOString(), ...data.map((d) => d[i])].join(',') : null)).filter(Boolean);
    const url = URL.createObjectURL(new Blob([['# reconstructed values: archive not connected', head, ...lines].join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${satId}-history-${range.replace(/\s/g, '')}.csv`; a.click();
    URL.revokeObjectURL(url);
    appendAudit({ timestamp_utc: new Date().toISOString(), operator_id: useAuthStore.getState().user.id, operator_name: actor, sat_id: satId, command_mnemonic: 'HISTORY_EXPORT', procedure_id: '—', procedure_version: '—', sequence_count: 0, result: 'ACK', params_summary: `${rows.map((r) => `${r.sat}:${r.param}`).join(' ')} range=${range} rows=${lines.length}` });
  };

  const p0 = stats[0], p1 = stats[1];
  const groups = layout === 'OVERLAY' ? [{ key: 'all', series: plotSeries, h: 340 }] : plotSeries.map((s, i) => ({ key: rows[i].id, series: [s], h: 200 }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[13px] text-[#7C8594] mr-auto">
          {rows.length === 1 ? `${p0.r.def.name}` : `${rows.length} parameters`} · <span className="font-mono-code">{timestamps.length} points · {rollupLabel(step)}</span>
          {range === 'Last pass' && lastPass && <> · pass over {lastPass.station} {fmtUtc(lastPass.aos)}–{fmtUtc(lastPass.los)}</>}
          {range === 'Last pass' && !lastPass && <> · no pass in the last 24 h</>}
        </span>
        <SampleTag>Reconstructed — archive not connected</SampleTag>
        <Segmented size="sm" value={range} onChange={(r) => { onRange(r); setXRange(null); }} options={RANGES.map((r) => ({ value: r, label: r }))} />
        <Button size="sm" variant="secondary" onClick={exportCsv}><Download size={14} /> CSV</Button>
      </div>

      <KpiRow className="!mb-0">
        <KpiTile label={`${p0.r.param} now`} tone={p0.live?.alarm_state === 2 ? 'crit' : p0.live?.alarm_state === 1 ? 'warn' : 'plain'}
          value={<>{p0.live ? fmtNum(p0.live.eu_value) : '—'} <span className="text-[14px] text-[#7C8594] font-normal">{p0.r.def.unit}</span></>}
          sub={p0.live ? `limits ${fmtNum(p0.r.def.warnLo)} to ${fmtNum(p0.r.def.warnHi)} ${p0.r.def.unit}` : 'no reading received'} />
        <KpiTile label={`${p0.r.param} range`} value={p0.n ? `${fmtNum(p0.min)}–${fmtNum(p0.max)}` : '—'} sub={p0.n ? `mean ${fmtNum(p0.mean)} ${p0.r.def.unit}` : 'no points in view'} />
        <KpiTile label="Out of limits" tone={p0.outSec ? 'warn' : 'ok'} value={dur(p0.outSec)} sub={xRange ? 'in the zoomed range' : `in this ${range === 'Last pass' ? 'pass' : range}`} />
        {p1 ? <KpiTile label={`${p1.r.param} now`} value={<>{p1.live ? fmtNum(p1.live.eu_value) : '—'} <span className="text-[14px] text-[#7C8594] font-normal">{p1.r.def.unit}</span></>} sub={p1.n ? `max ${fmtNum(p1.max)} · mean ${fmtNum(p1.mean)}` : '—'} />
          : <KpiTile label="Alarms on this parameter" value={alarmRows.length} sub={alarmRows.length ? `latest ${fmtUtc(Date.parse(alarmRows[0].timestamp_utc))}` : 'none this session'} />}
      </KpiRow>

      <Card title="Trend" actions={
        <span className="flex items-center gap-2">
          <Segmented size="sm" value={layout} onChange={setLayout} options={[{ value: 'OVERLAY', label: 'Overlay' }, { value: 'STACKED', label: 'Stacked' }]} />
          <Button size="sm" variant="ghost" onClick={() => setFrozen(paused ? null : liveCvt)} aria-pressed={paused}>
            {paused ? <><Play size={13} /> Resume</> : <><Pause size={13} /> Pause</>}
          </Button>
          {xRange && <Button size="sm" variant="ghost" onClick={resetZoom}>Reset zoom</Button>}
        </span>
      }>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {rows.map((r) => (
            <span key={r.id} className="flex items-center gap-2 h-[30px] pl-3 pr-1.5 rounded-full bg-[#161A22] font-mono-code text-[12px] text-[#C9CED6]">
              <span className="w-3 h-[3px] rounded-sm" style={{ background: r.color }} aria-hidden="true" />{r.sat} {r.param}
              <button type="button" onClick={() => setSel(sel.filter((s) => s.id !== r.id))} disabled={rows.length === 1} aria-label={`Remove ${r.sat} ${r.param}`}
                className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-[#7C8594] hover:text-[#E9ECF1] disabled:opacity-30"><X size={12} /></button>
            </span>
          ))}
          {adding ? (
            <span className="flex flex-wrap items-center gap-2">
              <Select value={addSat} onChange={(e) => setAddSat(e.target.value)} aria-label="Satellite to add" className={selectCls}>
                {fleetIds.map((id) => <option key={id} value={id}>{id}</option>)}
              </Select>
              <Select value={addParam} onChange={(e) => setAddParam(e.target.value)} aria-label="Parameter to add" className={selectCls}>
                {Object.entries(PARAMETERS).map(([sub, defs]) => <optgroup key={sub} label={sub}>{defs.map((d) => <option key={d.param_id} value={d.param_id}>{d.param_id}</option>)}</optgroup>)}
              </Select>
              <Button size="sm" onClick={add} disabled={sel.length >= MAX_SERIES || sel.some((s) => s.id === `${addSat}:${addParam}`)}
                reason={sel.length >= MAX_SERIES ? `Up to ${MAX_SERIES} at once` : sel.some((s) => s.id === `${addSat}:${addParam}`) ? 'Already on the chart' : undefined}>Add</Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            </span>
          ) : (
            <Button size="sm" variant="secondary" className="!rounded-full !h-[30px]" onClick={() => setAdding(true)} disabled={sel.length >= MAX_SERIES} reason={sel.length >= MAX_SERIES ? `Up to ${MAX_SERIES} at once` : undefined}><Plus size={13} /> Add parameter</Button>
          )}
        </div>
        <div className="flex flex-col gap-3">
          {groups.map((g) => (
            <div key={g.key} className="min-w-0">
              {layout === 'STACKED' && <div className="text-[12px] text-[#9AA3B2] font-mono-code mb-1">{g.series[0].label}</div>}
              <MultiPlot key={`${range}-${layout}`} timestamps={timestamps} series={g.series} height={g.h} syncKey="params" onReady={registry} onXRange={onXRange} markers={markers} />
            </div>
          ))}
        </div>
        <p className="text-[12px] text-[#7C8594] mt-3">Drag to zoom. Alarms and commands share the time axis. Limit bands are drawn when one series is on a chart.</p>
      </Card>

      <Card title={xRange ? 'Statistics for the zoomed range' : 'Statistics for this range'} flush>
        <div className="overflow-x-auto px-2 pb-2">
          <table className="w-full min-w-[720px] text-[13px] border-separate border-spacing-y-1">
            <thead><tr className="text-[12px] text-[#6B7383] text-right"><th className="px-3 py-1 font-normal text-left">Parameter</th><th className="px-3 py-1 font-normal">Now</th><th className="px-3 py-1 font-normal">Min</th><th className="px-3 py-1 font-normal">Max</th><th className="px-3 py-1 font-normal">Mean</th><th className="px-3 py-1 font-normal">Out of limits</th><th className="px-3 py-1 font-normal">Limits</th></tr></thead>
            <tbody>
              {stats.map(({ r, live, min, max, mean, outSec }) => (
                <tr key={r.id} className="bg-[#141821] text-right font-mono-code">
                  <td className="px-3 py-2.5 rounded-l-[10px] text-left"><span className="flex items-center gap-2.5"><span className="w-3 h-[3px] rounded-sm" style={{ background: r.color }} />{r.sat} {r.param} <span className="text-[#7C8594]">{r.def.unit}</span></span></td>
                  <td className={clsx('px-3 py-2.5', live?.alarm_state === 2 ? 'text-[#FF7A7A]' : live?.alarm_state === 1 ? 'text-[#F5C451]' : '')}>{live ? fmtNum(live.eu_value) : '—'}</td>
                  <td className="px-3 py-2.5">{fmtNum(min)}</td>
                  <td className="px-3 py-2.5">{fmtNum(max)}</td>
                  <td className="px-3 py-2.5">{fmtNum(mean)}</td>
                  <td className="px-3 py-2.5">{dur(outSec)}</td>
                  <td className="px-3 py-2.5 rounded-r-[10px] text-[#9AA3B2]">{fmtNum(r.def.critLo)} · {fmtNum(r.def.warnLo)} · {fmtNum(r.def.warnHi)} · {fmtNum(r.def.critHi)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Alarm history" flush>
        <div className="overflow-x-auto px-2 pb-2">
          <table className="w-full min-w-[640px] text-[13px] border-separate border-spacing-y-1">
            <thead><tr className="text-[12px] text-[#6B7383] text-left"><th className="px-3 py-1 font-normal">Raised</th><th className="px-3 py-1 font-normal">Alarm</th><th className="px-3 py-1 font-normal">Condition</th><th className="px-3 py-1 font-normal text-right">Value</th><th className="px-3 py-1 font-normal">Owner</th><th className="px-3 py-1 font-normal">State</th></tr></thead>
            <tbody>
              {alarmRows.map((a) => (
                <tr key={a.alarm_id} className="bg-[#141821]">
                  <td className="px-3 py-2.5 rounded-l-[10px] font-mono-code text-[#9AA3B2]">{fmtUtc(Date.parse(a.timestamp_utc), true)}</td>
                  <td className="px-3 py-2.5 font-mono-code">{a.alarm_id}</td>
                  <td className="px-3 py-2.5">{a.condition ?? `${a.sat_id} ${a.param_id}`}</td>
                  <td className="px-3 py-2.5 text-right font-mono-code">{fmtNum(a.eu_value)} {a.unit}</td>
                  <td className="px-3 py-2.5 text-[#9AA3B2]">{a.owner ?? a.acknowledged_by ?? '—'}</td>
                  <td className="px-3 py-2.5 rounded-r-[10px]">
                    <Pill tone={a.state === 'RTN' ? 'ok' : a.state === 'SHELVED' ? 'info' : a.state === 'ACKED' ? 'neutral' : 'action'}>
                      {a.state === 'RTN' ? 'Returned to normal' : a.state === 'ACKED' ? 'Acknowledged' : a.state === 'SHELVED' ? 'Shelved' : a.state === 'ESCALATED' ? 'Escalated' : 'Unacknowledged'}
                    </Pill>
                  </td>
                </tr>
              ))}
              {alarmRows.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-[#9AA3B2]">No alarm on the selected parameters this session.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
