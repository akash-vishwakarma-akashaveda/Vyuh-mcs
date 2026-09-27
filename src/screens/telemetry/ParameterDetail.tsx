import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import type uPlot from 'uplot';
import { Download, Pause, Play, Plus, RotateCcw, X, ZoomIn, ZoomOut, LineChart, Table2, Rows3, Columns2, Layers } from 'lucide-react';
import { MultiPlot, PlotSeries } from '../../components/organisms/MultiPlot';
import { Card, PageHead, Td, Th } from '../../components/molecules/Page';
import { Button } from '../../components/atoms/Button';
import { useFleetStore } from '../../store/useFleetStore';
import { useAlarmStore } from '../../store/useAlarmStore';
import { FLEET, PARAMETERS } from '../../data/fleet';
import { findDef, history } from '../../ops/history';

const RANGES = ['Pass', '1 h', '24 h', '7 d', '30 d'] as const;
type Range = typeof RANGES[number];

/** Points, seconds per point, and the resolution the archive would have used. */
const RANGE_SPEC: Record<Range, { points: number; step: number; resolution: string }> = {
  'Pass':  { points: 660, step: 1,      resolution: 'raw 1 Hz' },
  '1 h':   { points: 360, step: 10,     resolution: '1 s rollup' },
  '24 h':  { points: 288, step: 300,    resolution: '1 min rollup' },
  '7 d':   { points: 336, step: 1800,   resolution: '1 min rollup' },
  '30 d':  { points: 360, step: 7200,   resolution: '1 h rollup' },
};

/** Categorical colours — deliberately not the status colours (red / amber / green), which mean alarm state. */
const PALETTE = ['#5B8DEF', '#A78BFA', '#22D3EE', '#F472B6', '#84CC16', '#E879F9', '#2DD4BF', '#94A3B8'];
const MAX_SERIES = 6;

type Layout = 'OVERLAY' | 'STACKED' | 'GRID';
type View = 'PLOT' | 'TABLE';
interface Sel { id: string; sat: string; param: string; color: string }

const fmt = (n: number) => n.toFixed(Math.abs(n) >= 100 ? 0 : 2);
const selectCls = 'h-9 bg-[#0A1018] border border-[#2A3B52] rounded-md px-2.5 font-mono-code text-[13px] outline-none focus:border-[#2DCCFF]';
const seg = (on: boolean) => clsx('h-8 px-2.5 rounded flex items-center gap-1.5 text-[12px] font-medium',
  on ? 'bg-[#1F2D40] text-[#E6EDF3]' : 'text-[#A3B1C2] hover:text-[#E6EDF3]');

/** S05 · Parameter history — compare, overlay and inspect several parameters at once. */
export const ParameterDetail: React.FC<{ satId: string; paramId: string; onNavigate: (to: string) => void; /** Inside Satellite health: no page banner. */ embedded?: boolean }> = ({
  satId, paramId, onNavigate, embedded,
}) => {
  const first = findDef(paramId) ?? findDef('BUS_VOLTAGE')!;
  const [sel, setSel] = useState<Sel[]>([{ id: `${satId}:${first.def.param_id}`, sat: satId, param: first.def.param_id, color: PALETTE[0] }]);
  const [range, setRange] = useState<Range>('1 h');
  const [layout, setLayout] = useState<Layout>('OVERLAY');
  const [view, setView] = useState<View>('PLOT');
  const [normalize, setNormalize] = useState(false);
  const [xRange, setXRange] = useState<[number, number] | null>(null);
  const [addSat, setAddSat] = useState(satId);
  const [addParam, setAddParam] = useState('BUS_VOLTAGE');

  useEffect(() => { // navigated here for a different parameter (e.g. from a satellite card)
    const f = findDef(paramId) ?? findDef('BUS_VOLTAGE')!;
    setSel([{ id: `${satId}:${f.def.param_id}`, sat: satId, param: f.def.param_id, color: PALETTE[0] }]);
    setAddSat(satId);
    setXRange(null);
  }, [satId, paramId]);

  const liveCvt = useFleetStore((s) => s.cvt);
  const [frozen, setFrozen] = useState<typeof liveCvt | null>(null);
  const paused = frozen !== null;
  const cvt = frozen ?? liveCvt;
  const [pausedAt, setPausedAt] = useState('');
  const togglePause = () => {
    if (paused) { setFrozen(null); setTick((n) => n + 1); return; }
    setFrozen(liveCvt);
    setPausedAt(new Date().toISOString().slice(11, 19));
  };
  const alarmHistory = useAlarmStore((s) => s.history);
  const spec = RANGE_SPEC[range];

  const [tick, setTick] = useState(0); // the window slides forward so the live tail stays at 'now'
  useEffect(() => {
    if (paused) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 10_000);
    return () => clearInterval(t);
  }, [paused]);

  const timestamps = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    return Array.from({ length: spec.points }, (_, i) => now - (spec.points - 1 - i) * spec.step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, paused ? 'paused' : tick]);

  const rows = useMemo(() => sel.map((s) => {
    const { def, subsystem } = findDef(s.param)!;
    return { ...s, def, subsystem };
  }), [sel]);

  // The history is regenerated only when the selection or the time window changes; the live tail is patched per tick.
  const base = useMemo(() => rows.map((r) => history(r.sat, r.def, cvt[r.sat]?.[r.def.param_id]?.eu_value ?? r.def.value, timestamps)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, timestamps]);

  const data = useMemo(() => rows.map((r, i) => {
    const live = cvt[r.sat]?.[r.def.param_id]?.eu_value ?? r.def.value;
    const v = base[i].slice();
    v[v.length - 1] = live;
    return v;
  }), [rows, base, cvt]);

  const plotSeries: PlotSeries[] = useMemo(() => rows.map((r, i) => {
    const raw = data[i];
    const lo = Math.min(...raw), hi = Math.max(...raw);
    const values = normalize ? raw.map((v) => (hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100)) : raw;
    return {
      label: `${r.sat} · ${r.param}`, color: r.color, unit: normalize ? '%' : r.def.unit, values,
      limits: !normalize ? { lowSoft: r.def.warnLo, hiSoft: r.def.warnHi, lowHard: r.def.critLo, hiHard: r.def.critHi } : undefined,
    };
  }), [rows, data, normalize]);

  // ---- zoom -----------------------------------------------------------------
  const plots = useRef(new Set<uPlot>());
  const registry = (u: uPlot | null) => {
    if (u) plots.current.add(u);
    else plots.current = new Set([...plots.current].filter((p) => p.root.isConnected));
  };
  const dataMin = timestamps[0], dataMax = timestamps[timestamps.length - 1];
  const zoomBy = (factor: number) => {
    const [a, b] = xRange ?? [dataMin, dataMax];
    const mid = (a + b) / 2, half = ((b - a) / 2) * factor;
    const lo = Math.max(dataMin, mid - half), hi = Math.min(dataMax, mid + half);
    plots.current.forEach((p) => p.setScale('x', { min: lo, max: hi }));
    setXRange(lo <= dataMin && hi >= dataMax ? null : [lo, hi]);
  };
  const resetZoom = () => {
    plots.current.forEach((p) => p.setScale('x', { min: dataMin, max: dataMax }));
    setXRange(null);
  };
  const onXRange = useCallback((min: number, max: number) => {
    setXRange(min <= dataMin + 1 && max >= dataMax - 1 ? null : [min, max]);
  }, [dataMin, dataMax]);

  // ---- selection ------------------------------------------------------------
  const nextColor = () => PALETTE.find((c) => !sel.some((s) => s.color === c)) ?? PALETTE[sel.length % PALETTE.length];
  const add = () => {
    const id = `${addSat}:${addParam}`;
    if (sel.length >= MAX_SERIES || sel.some((s) => s.id === id)) return;
    setSel([...sel, { id, sat: addSat, param: addParam, color: nextColor() }]);
  };
  const remove = (id: string) => sel.length > 1 && setSel(sel.filter((s) => s.id !== id));
  const recolor = (id: string, color: string) => setSel(sel.map((s) => (s.id === id ? { ...s, color } : s)));

  // ---- stats + table ----------------------------------------------------------
  const inView = (i: number) => !xRange || (timestamps[i] >= xRange[0] && timestamps[i] <= xRange[1]);
  const stats = rows.map((r, i) => {
    const vs = data[i].filter((_, k) => inView(k));
    const mean = vs.reduce((a, b) => a + b, 0) / vs.length;
    return {
      r, last: data[i][data[i].length - 1], min: Math.min(...vs), max: Math.max(...vs), mean,
      sigma: Math.sqrt(vs.reduce((a, b) => a + (b - mean) ** 2, 0) / vs.length),
      breaches: vs.filter((v) => v <= r.def.warnLo || v >= r.def.warnHi).length,
      state: cvt[r.sat]?.[r.def.param_id]?.alarm_state ?? 0,
    };
  });

  const tableIdx = timestamps.map((_, i) => i).filter(inView).reverse();
  const exportCsv = () => {
    const head = ['utc', ...rows.map((r) => `${r.sat}:${r.param}${r.def.unit ? ` (${r.def.unit})` : ''}`)].join(',');
    const lines = timestamps.map((t, i) => inView(i) ? [new Date(t * 1000).toISOString(), ...data.map((d) => d[i])].join(',') : null).filter(Boolean);
    const url = URL.createObjectURL(new Blob([[head, ...lines].join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `parameters-${range.replace(' ', '')}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const chartGroups: { key: string; height: number; series: PlotSeries[] }[] =
    layout === 'OVERLAY' ? [{ key: 'all', height: 360, series: plotSeries }]
    : plotSeries.map((s, i) => ({ key: rows[i].id, height: layout === 'GRID' ? 240 : 190, series: [s] }));
  const single = plotSeries.length === 1;
  const primary = rows[0];

  return (
    <>
      {!embedded && (
      <PageHead
          title="Parameter history"
          sub={rows.length === 1 ? `${primary.def.name} · ${primary.subsystem}` : `${rows.length} parameters compared`}
          actions={
            <Button variant="secondary" onClick={() => onNavigate(`satellite?sat=${primary.sat}&tab=${primary.subsystem}`)}>
              Open {primary.sat}
            </Button>
          }
        />
      )}

      {/* Series builder */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          {rows.map((r) => (
            <span key={r.id} className="h-9 pl-2 pr-1 rounded-full border border-[#2A3B52] bg-[#0A1018] flex items-center gap-2 text-[12.5px]">
              <label className="relative w-4 h-4 rounded-full cursor-pointer shrink-0" style={{ background: r.color }} title="Change colour">
                <input type="color" value={r.color} onChange={(e) => recolor(r.id, e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer" aria-label={`Colour for ${r.sat} ${r.param}`} />
              </label>
              <span className="font-mono-code">{r.sat}</span>
              <span className="font-mono-code font-bold">{r.param}</span>
              <button onClick={() => remove(r.id)} disabled={rows.length === 1} aria-label={`Remove ${r.sat} ${r.param}`}
                className="w-6 h-6 rounded-full flex items-center justify-center text-[#8496AB] hover:text-[#E6EDF3] hover:bg-[#1F2D40] disabled:opacity-30">
                <X size={13} />
              </button>
            </span>
          ))}

          <span className="mx-1 h-6 w-px bg-[#2A3B52]" aria-hidden="true" />
          <select value={addSat} onChange={(e) => setAddSat(e.target.value)} aria-label="Satellite to add" className={selectCls}>
            {FLEET.map((s) => <option key={s.sat_id} value={s.sat_id}>{s.sat_id}</option>)}
          </select>
          <select value={addParam} onChange={(e) => setAddParam(e.target.value)} aria-label="Parameter to add" className={selectCls}>
            {Object.entries(PARAMETERS).map(([sub, defs]) => (
              <optgroup key={sub} label={sub}>{defs.map((d) => <option key={d.param_id} value={d.param_id}>{d.param_id}</option>)}</optgroup>
            ))}
          </select>
          <Button size="sm" onClick={add} disabled={sel.length >= MAX_SERIES}><Plus size={15} /> Add</Button>
          {sel.length >= MAX_SERIES && <span className="text-[12px] text-[#8496AB]">Up to {MAX_SERIES} at once</span>}
        </div>
      </Card>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <button onClick={togglePause} aria-pressed={paused}
          title={paused ? 'Resume live data' : 'Freeze the data to inspect it'}
          className={clsx('h-[30px] pl-2.5 pr-3 rounded-full border text-[12px] font-medium flex items-center gap-1.5',
            paused ? 'border-[#FCE83A]/60 bg-[#FCE83A]/12 text-[#FCE83A]' : 'border-[#2E6FD8] bg-[#2E6FD8]/15 text-[#4DACFF]')}>
          {paused ? <Play size={13} /> : <Pause size={13} />}
          {paused ? `Paused ${pausedAt} UTC · Play` : 'Live · Pause'}
        </button>
        <div className="flex gap-1.5">
          {RANGES.map((r) => (
            <button key={r} onClick={() => { setRange(r); setXRange(null); }}
              className={clsx('h-[30px] px-3 rounded-full border text-[12px]',
                range === r ? 'border-[#2E6FD8] text-white bg-[#2E6FD8]' : 'border-[#2A3B52] text-[#A3B1C2] hover:bg-[#172434]')}>
              {r}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-0.5 rounded-md border border-[#2A3B52] p-0.5" role="group" aria-label="View">
          <button className={seg(view === 'PLOT')} onClick={() => setView('PLOT')} aria-pressed={view === 'PLOT'}><LineChart size={14} /> Plot</button>
          <button className={seg(view === 'TABLE')} onClick={() => setView('TABLE')} aria-pressed={view === 'TABLE'}><Table2 size={14} /> Table</button>
        </div>

        {view === 'PLOT' && (
          <>
            <div className="flex items-center gap-0.5 rounded-md border border-[#2A3B52] p-0.5" role="group" aria-label="Layout">
              <button className={seg(layout === 'OVERLAY')} onClick={() => setLayout('OVERLAY')} aria-pressed={layout === 'OVERLAY'}><Layers size={14} /> Overlay</button>
              <button className={seg(layout === 'STACKED')} onClick={() => setLayout('STACKED')} aria-pressed={layout === 'STACKED'}><Rows3 size={14} /> Stacked</button>
              <button className={seg(layout === 'GRID')} onClick={() => setLayout('GRID')} aria-pressed={layout === 'GRID'}><Columns2 size={14} /> Side by side</button>
            </div>
            {layout === 'OVERLAY' && rows.length > 1 && (
              <label className="flex items-center gap-2 text-[12px] text-[#A3B1C2] cursor-pointer">
                <input type="checkbox" checked={normalize} onChange={(e) => setNormalize(e.target.checked)} className="accent-[#2E6FD8]" />
                Normalise 0–100 % (compare shapes)
              </label>
            )}
            <div className="flex items-center gap-0.5 rounded-md border border-[#2A3B52] p-0.5" role="group" aria-label="Zoom">
              <button className={seg(false)} onClick={() => zoomBy(0.5)} aria-label="Zoom in" title="Zoom in"><ZoomIn size={15} /></button>
              <button className={seg(false)} onClick={() => zoomBy(2)} aria-label="Zoom out" title="Zoom out"><ZoomOut size={15} /></button>
              <button className={seg(false)} onClick={resetZoom} aria-label="Reset zoom" title="Reset zoom"><RotateCcw size={14} /></button>
            </div>
          </>
        )}

        <span className="ml-auto flex items-center gap-3 font-mono-code text-[11.5px] text-[#A3B1C2]">
          {xRange && <span className="text-[#5B8DEF]">zoom {new Date(xRange[0] * 1000).toISOString().slice(11, 19)}–{new Date(xRange[1] * 1000).toISOString().slice(11, 19)}</span>}
          {spec.points} points · {spec.resolution}
          <Button size="sm" variant="secondary" onClick={exportCsv}><Download size={14} /> CSV</Button>
        </span>
      </div>

      {view === 'PLOT' && (
        <>
          <div className={clsx('grid gap-3 mb-4', layout === 'GRID' ? 'md:grid-cols-2' : 'grid-cols-1')}>
            {chartGroups.map((g) => (
              <Card key={g.key} title={layout === 'OVERLAY' ? undefined : g.series[0].label} className="min-w-0">
                <MultiPlot key={range} timestamps={timestamps} series={g.series} height={g.height} syncKey="params" onReady={registry} onXRange={onXRange} />
              </Card>
            ))}
          </div>
          <p className="text-[11.5px] text-[#8496AB] -mt-2 mb-4">Drag on a chart to zoom; the cursor and zoom follow across all charts. Double-click or Reset returns to the full range.</p>
        </>
      )}

      {view === 'TABLE' && (
        <Card title={`Samples · ${tableIdx.length} rows`} className="mb-4">
          <div className="-m-4 max-h-[460px] overflow-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr>
                  <Th>UTC</Th>
                  {rows.map((r) => (
                    <Th key={r.id}><span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full" style={{ background: r.color }} />{r.sat} · {r.param}{r.def.unit ? ` (${r.def.unit})` : ''}</span></Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableIdx.map((i) => (
                  <tr key={i} className="hover:bg-[#172434]">
                    <Td className="font-mono-code text-[#A3B1C2] whitespace-nowrap">{new Date(timestamps[i] * 1000).toISOString().slice(0, 19).replace('T', ' ')}</Td>
                    {rows.map((r, k) => {
                      const v = data[k][i];
                      const bad = v <= r.def.warnLo || v >= r.def.warnHi;
                      return <Td key={r.id} className={clsx('font-mono-code tabular-nums', bad && 'text-[#FCE83A]')}>{fmt(v)}</Td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Side-by-side numbers for every selected parameter */}
      <Card title={xRange ? 'Statistics · zoomed range' : 'Statistics'} className="mb-4">
        <div className="-m-4 overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead><tr><Th>Parameter</Th><Th>Now</Th><Th>Min</Th><Th>Max</Th><Th>Mean</Th><Th>σ</Th><Th>Out of limits</Th><Th>Limits (warn / crit)</Th></tr></thead>
            <tbody>
              {stats.map(({ r, last, min, max, mean, sigma, breaches, state }) => (
                <tr key={r.id} className="hover:bg-[#172434]">
                  <Td>
                    <span className="inline-flex items-center gap-2">
                      <i className="w-2.5 h-2.5 rounded-full" style={{ background: r.color }} />
                      <span className="font-mono-code">{r.sat}</span><span className="font-mono-code font-bold">{r.param}</span>
                    </span>
                  </Td>
                  <Td className={clsx('font-mono-code tabular-nums font-bold', state === 2 ? 'text-[#FF3838]' : state === 1 ? 'text-[#FCE83A]' : '')}>{fmt(last)} <span className="text-[#8496AB] font-normal">{r.def.unit}</span></Td>
                  <Td className="font-mono-code tabular-nums">{fmt(min)}</Td>
                  <Td className="font-mono-code tabular-nums">{fmt(max)}</Td>
                  <Td className="font-mono-code tabular-nums">{fmt(mean)}</Td>
                  <Td className="font-mono-code tabular-nums">{fmt(sigma)}</Td>
                  <Td className={clsx('tabular-nums', breaches ? 'text-[#FCE83A]' : 'text-[#56F000]')}>{breaches}</Td>
                  <Td className="font-mono-code text-[11.5px] text-[#A3B1C2]">{fmt(r.def.warnLo)}…{fmt(r.def.warnHi)} / {fmt(r.def.critLo)}…{fmt(r.def.critHi)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {single && <p className="text-[12px] text-[#A3B1C2] mt-4">Limits come from the signed dictionary bundle, so the console cannot disagree with the spacecraft. Bands are drawn on the chart.</p>}
      </Card>

      <Card title="Alarm history">
        <table className="w-full border-collapse">
          <thead><tr><Th>Alarm</Th><Th>Satellite</Th><Th>Condition</Th><Th>Peak</Th><Th>Owner</Th><Th>State</Th></tr></thead>
          <tbody>
            {alarmHistory.filter((a) => rows.some((r) => r.param === a.param_id)).map((a) => (
              <tr key={a.alarm_id}>
                <Td className="font-mono-code text-[12.5px] text-[#4DACFF]">{a.alarm_id}</Td>
                <Td className="font-mono-code text-[12.5px]">{a.sat_id}</Td>
                <Td>{a.condition ?? a.param_id}</Td>
                <Td className="tabular-nums">{a.eu_value} {a.unit}</Td>
                <Td className="text-[#A3B1C2]">{a.owner ?? '—'}</Td>
                <Td className="text-[#56F000]">RETURNED</Td>
              </tr>
            ))}
            {!alarmHistory.some((a) => rows.some((r) => r.param === a.param_id)) && (
              <tr><Td className="text-[#A3B1C2]">No alarm has closed on the selected parameters in this session.</Td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
};
