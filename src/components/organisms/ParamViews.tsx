import React, { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, LayoutGrid, LineChart, Table2 } from 'lucide-react';
import type { Param } from '../../types';
import { PARAMETERS, ParamDef } from '../../data/fleet';
import { history } from '../../ops/history';
import { usePersisted } from '../../lib/usePersisted';
import { isStale } from '../../utils/stalenessUtils';
import { ParameterCard } from './ParameterCard';
import { ColumnChooser } from './ColumnChooser';
import { MultiPlot } from './MultiPlot';
import { StatusBadge } from '../atoms/Badge';

type Sub = 'POWER' | 'ADCS' | 'THERMAL' | 'COMMS' | 'PAYLOAD' | 'OBC';
export const SUBSYSTEMS = Object.keys(PARAMETERS) as Sub[];
export type ViewKind = 'CELLS' | 'TABLE' | 'GRAPHS';

const ALL = SUBSYSTEMS.flatMap((s) => PARAMETERS[s].map((d) => ({ ...d, subsystem: s })));
const ALL_IDS = ALL.map((p) => p.param_id);
const cap = (s: string) => s[0] + s.slice(1).toLowerCase();

const GRAPH_RANGES = { '15 min': { pts: 90, step: 10 }, '1 h': { pts: 180, step: 20 }, '6 h': { pts: 180, step: 120 }, '24 h': { pts: 288, step: 300 } } as const;
type GraphRange = keyof typeof GRAPH_RANGES;
const PALETTE = ['#5B8DEF', '#A78BFA', '#22D3EE', '#F472B6', '#84CC16', '#E879F9'];

const paramOf = (d: ParamDef & { subsystem: Sub }, live?: Param): Param => ({
  param_id: d.param_id, name: d.name, subsystem: d.subsystem, eu_value: live?.eu_value ?? 0, unit: d.unit,
  alarm_state: live?.alarm_state ?? 0, quality: live?.quality ?? 0,
  limit_low_soft: d.warnLo, limit_hi_soft: d.warnHi, limit_low_hard: d.critLo, limit_hi_hard: d.critHi,
  timestamp_utc: live?.timestamp_utc || new Date().toISOString(),
});

interface Props {
  satId: string;
  cvt: Record<string, Param>;
  onOpenParam: (paramId: string) => void;
  initialSubsystem?: string;
  /** Values to show instead of the live table (playback). */
  override?: Record<string, Param>;
  /** Playback: graphs plot this window, with a marker at the playback position. */
  window?: { ts: number[]; series: (id: string) => number[]; cursorTs: number };
}

/** The satellite's parameters as cells, a paged table or a grid of graphs; each view remembers which parameters it shows. */
export const ParamViews: React.FC<Props> = ({ satId, cvt, onOpenParam, initialSubsystem, override, window: win }) => {
  const [view, setView] = usePersisted<ViewKind>('vyuh-sathealth-view', 'CELLS');
  const [sub, setSub] = useState<Sub | 'ALL'>(SUBSYSTEMS.includes(initialSubsystem as Sub) ? (initialSubsystem as Sub) : 'POWER');
  // Each view keeps its own selection ("edit the contents of each view").
  const [selCells, setSelCells] = usePersisted<string[]>('vyuh-sathealth-sel-cells', ALL_IDS);
  const [selTable, setSelTable] = usePersisted<string[]>('vyuh-sathealth-sel-table', ALL_IDS);
  const [selGraphs, setSelGraphs] = usePersisted<string[]>('vyuh-sathealth-sel-graphs', ALL_IDS);
  const [pageSize, setPageSize] = usePersisted<number>('vyuh-sathealth-pagesize', 15);
  const [graphsPerPage, setGraphsPerPage] = usePersisted<number>('vyuh-sathealth-graphs', 6);
  const [range, setRange] = useState<GraphRange>('1 h');
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: 'state', dir: -1 });

  const source = override ?? cvt;
  const selected = view === 'CELLS' ? selCells : view === 'TABLE' ? selTable : selGraphs;
  const setSelected = view === 'CELLS' ? setSelCells : view === 'TABLE' ? setSelTable : setSelGraphs;

  const list = useMemo(() => ALL.filter((p) => selected.includes(p.param_id) && (sub === 'ALL' || p.subsystem === sub)), [selected, sub]);
  const state = (id: string) => source[id]?.alarm_state ?? 0;
  const subState = (s: Sub) => PARAMETERS[s].reduce((w, p) => Math.max(w, state(p.param_id)), 0);

  const sorted = useMemo(() => {
    const val = (p: (typeof ALL)[number]) => sort.key === 'name' ? p.param_id : sort.key === 'value' ? source[p.param_id]?.eu_value ?? -Infinity : sort.key === 'subsystem' ? p.subsystem : state(p.param_id);
    return [...list].sort((a, b) => {
      const x = val(a), y = val(b);
      const d = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return (d || a.param_id.localeCompare(b.param_id)) * sort.dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, sort, source]);

  const perPage = view === 'TABLE' ? pageSize : view === 'GRAPHS' ? graphsPerPage : Infinity;
  const pages = Math.max(1, Math.ceil(sorted.length / (perPage === Infinity ? sorted.length || 1 : perPage)));
  const cur = Math.min(page, pages - 1);
  const shown = perPage === Infinity ? sorted : sorted.slice(cur * perPage, cur * perPage + perPage);

  // Graphs: one shared time axis, history generated around each live value.
  const spec = GRAPH_RANGES[range];
  const graphTs = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    return Array.from({ length: spec.pts }, (_, i) => now - (spec.pts - 1 - i) * spec.step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, view, cur]);

  const th = (key: string, label: string) => (
    <th className="px-3 py-2 text-left text-[11px] font-semibold text-[#8496AB] whitespace-nowrap border-b border-[#213044] bg-[#111A25]">
      <button onClick={() => setSort((x) => ({ key, dir: x.key === key ? (x.dir === 1 ? -1 : 1) : -1 }))} className="inline-flex items-center gap-1 hover:text-[#E6EDF3]">
        {label}{sort.key === key && (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
      </button>
    </th>
  );

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-0.5 rounded-md border border-[#2A3B52] p-0.5" role="group" aria-label="View">
          {([['CELLS', LayoutGrid, 'Cells'], ['TABLE', Table2, 'Table'], ['GRAPHS', LineChart, 'Graphs']] as const).map(([k, Icon, label]) => (
            <button key={k} onClick={() => { setView(k); setPage(0); }} aria-pressed={view === k}
              className={clsx('h-7 px-2.5 rounded flex items-center gap-1.5 text-[12px] font-medium', view === k ? 'bg-[#1F2D40] text-[#E6EDF3]' : 'text-[#A3B1C2] hover:text-[#E6EDF3]')}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 overflow-x-auto">
          {(['ALL', ...SUBSYSTEMS] as const).map((s) => (
            <button key={s} onClick={() => { setSub(s); setPage(0); }}
              className={clsx('h-7 px-2.5 rounded-full border text-[12px] whitespace-nowrap flex items-center gap-1.5',
                sub === s ? 'border-[#2E6FD8] bg-[#2E6FD8] text-white' : 'border-[#2A3B52] text-[#A3B1C2] hover:bg-[#172434]')}>
              {s === 'ALL' ? 'All' : cap(s)}
              {s !== 'ALL' && subState(s) > 0 && <i className={clsx('w-1.5 h-1.5 rounded-full', subState(s) === 2 ? 'bg-[#D42C2C]' : 'bg-[#FCE83A]')} />}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {view === 'GRAPHS' && !win && (
            <div className="flex items-center gap-0.5 rounded-md border border-[#2A3B52] p-0.5" role="group" aria-label="Graph range">
              {(Object.keys(GRAPH_RANGES) as GraphRange[]).map((r) => (
                <button key={r} onClick={() => setRange(r)} className={clsx('h-7 px-2 rounded text-[11.5px]', range === r ? 'bg-[#1F2D40] text-[#E6EDF3]' : 'text-[#A3B1C2] hover:text-[#E6EDF3]')}>{r}</button>
              ))}
            </div>
          )}
          <ColumnChooser label={view === 'CELLS' ? 'Edit cells' : view === 'TABLE' ? 'Edit rows' : 'Edit graphs'}
            items={ALL.map((p) => ({ id: p.param_id, label: p.param_id, group: cap(p.subsystem) }))}
            selected={selected} onChange={(ids) => { setSelected(ids); setPage(0); }} onReset={() => setSelected(ALL_IDS)} />
        </div>
      </div>

      {shown.length === 0 && <p className="text-[13px] text-[#A3B1C2] py-8 text-center">Nothing selected here. Use “Edit” to add parameters to this view.</p>}

      {view === 'CELLS' && (
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
          {shown.map((d) => <ParameterCard key={d.param_id} param={paramOf(d, source[d.param_id])} onClick={() => onOpenParam(d.param_id)} />)}
        </div>
      )}

      {view === 'TABLE' && shown.length > 0 && (
        <div className="rounded-lg border border-[#213044] overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead><tr>{th('name', 'Parameter')}{th('subsystem', 'Subsystem')}{th('value', 'Value')}<th className="px-3 py-2 text-left text-[11px] text-[#8496AB] border-b border-[#213044] bg-[#111A25]">Unit</th>{th('state', 'State')}<th className="px-3 py-2 text-left text-[11px] text-[#8496AB] border-b border-[#213044] bg-[#111A25]">Warn / critical limits</th><th className="px-3 py-2 text-left text-[11px] text-[#8496AB] border-b border-[#213044] bg-[#111A25]">Updated</th></tr></thead>
            <tbody>
              {shown.map((d) => {
                const p = source[d.param_id];
                const st = p?.alarm_state ?? 0;
                return (
                  <tr key={d.param_id} onClick={() => onOpenParam(d.param_id)} className="cursor-pointer hover:bg-[#172434] border-b border-[#1A2738]">
                    <td className="px-3 py-2"><span className="font-mono-code font-bold text-[#4DACFF]">{d.param_id}</span><span className="block text-[11px] text-[#8496AB]">{d.name}</span></td>
                    <td className="px-3 py-2 text-[#A3B1C2]">{cap(d.subsystem)}</td>
                    <td className={clsx('px-3 py-2 font-mono-code tabular-nums font-bold', p && isStale(p) ? 'text-[#5F7087]' : st === 2 ? 'text-[#FF3838]' : st === 1 ? 'text-[#FCE83A]' : '')}>{p ? p.eu_value.toFixed(Math.abs(p.eu_value) >= 100 ? 0 : 2) : '—'}</td>
                    <td className="px-3 py-2 text-[#8496AB]">{d.unit || '—'}</td>
                    <td className="px-3 py-2"><StatusBadge status={st === 2 ? 'CRITICAL' : st === 1 ? 'WARNING' : 'NOMINAL'} size="sm" /></td>
                    <td className="px-3 py-2 font-mono-code text-[11.5px] text-[#A3B1C2] whitespace-nowrap">{d.warnLo}…{d.warnHi} / {d.critLo}…{d.critHi}</td>
                    <td className="px-3 py-2 font-mono-code text-[11.5px] text-[#8496AB]">{p?.timestamp_utc?.slice(11, 19) ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {view === 'GRAPHS' && (
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
          {shown.map((d, i) => {
            const live = source[d.param_id]?.eu_value ?? d.value;
            const st = state(d.param_id);
            return (
              <div key={`${satId}-${d.param_id}-${range}-${win ? win.ts[0] : 0}`} className="rounded-lg border border-[#213044] bg-[#111A25] p-3 min-w-0">
                <button onClick={() => onOpenParam(d.param_id)} className="w-full flex items-baseline justify-between gap-2 mb-1 text-left">
                  <span className="font-mono-code text-[12px] font-bold text-[#4DACFF] truncate">{d.param_id}</span>
                  <span className={clsx('font-mono-code tabular-nums text-[13px] font-bold', st === 2 ? 'text-[#FF3838]' : st === 1 ? 'text-[#FCE83A]' : '')}>{live.toFixed(Math.abs(live) >= 100 ? 0 : 2)}<span className="text-[#8496AB] font-normal text-[11px] ml-0.5">{d.unit}</span></span>
                </button>
                <MultiPlot timestamps={win ? win.ts : graphTs} height={130} compact syncKey={`grid-${satId}`} onReady={() => {}} onXRange={() => {}} cursorTs={win?.cursorTs}
                  series={[{ label: d.param_id, color: PALETTE[i % PALETTE.length], unit: d.unit, values: win ? win.series(d.param_id) : history(satId, d, live, graphTs), limits: { lowSoft: d.warnLo, hiSoft: d.warnHi, lowHard: d.critLo, hiHard: d.critHi } }]} />
              </div>
            );
          })}
        </div>
      )}

      {perPage !== Infinity && sorted.length > 0 && (
        <div className="flex items-center justify-between text-[12px] text-[#A3B1C2]">
          <span className="flex items-center gap-2">
            Per page
            <select value={perPage} onChange={(e) => { (view === 'TABLE' ? setPageSize : setGraphsPerPage)(Number(e.target.value)); setPage(0); }}
              className="h-7 rounded bg-[#0A1018] border border-[#2A3B52] px-1.5" aria-label="Rows per page">
              {(view === 'TABLE' ? [10, 15, 25, 50] : [3, 6, 9, 12]).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span className="tabular-nums">{cur * perPage + 1}–{Math.min(sorted.length, cur * perPage + perPage)} of {sorted.length}</span>
          </span>
          <span className="flex items-center gap-1">
            <button disabled={cur === 0} onClick={() => setPage(cur - 1)} aria-label="Previous page" className="w-7 h-7 rounded border border-[#2A3B52] flex items-center justify-center disabled:opacity-30 hover:bg-[#172434]"><ChevronLeft size={14} /></button>
            <span className="px-2 tabular-nums">{cur + 1} / {pages}</span>
            <button disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} aria-label="Next page" className="w-7 h-7 rounded border border-[#2A3B52] flex items-center justify-center disabled:opacity-30 hover:bg-[#172434]"><ChevronRight size={14} /></button>
          </span>
        </div>
      )}
    </div>
  );
};
