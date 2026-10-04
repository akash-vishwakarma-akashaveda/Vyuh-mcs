import React, { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Param } from '../../types';
import { PARAMETERS, ParamDef } from '../../data/fleet';
import { fmtNum, fmtUtc, history, recentSamples, rollupLabel } from '../../ops/history';
import { usePersisted } from '../../lib/usePersisted';
import { ParameterCard, tileState, TileState } from './ParameterCard';
import { ColumnChooser } from './ColumnChooser';
import { MultiPlot } from './MultiPlot';
import { Pill, Tone } from '../atoms/Badge';
import { SampleTag, Segmented } from '../molecules/Page';
import { Select } from '../molecules/Select';

export type Sub = 'POWER' | 'ADCS' | 'THERMAL' | 'COMMS' | 'PAYLOAD' | 'OBC';
export const SUBSYSTEMS = Object.keys(PARAMETERS) as Sub[];
export type ViewKind = 'CELLS' | 'TABLE' | 'GRAPHS';

const ALL = SUBSYSTEMS.flatMap((s) => PARAMETERS[s].map((d) => ({ ...d, subsystem: s })));
const ALL_IDS = ALL.map((p) => p.param_id);
export const subLabel = (s: string) => (s === 'ADCS' || s === 'OBC' ? s : s[0] + s.slice(1).toLowerCase());

const GRAPH_RANGES = { '15 min': { pts: 90, step: 10 }, '1 h': { pts: 180, step: 20 }, '6 h': { pts: 180, step: 120 }, '24 h': { pts: 288, step: 300 } } as const;
type GraphRange = keyof typeof GRAPH_RANGES;
const PALETTE = ['#6CB8FF', '#9B8CFF', '#3DD9C1'];
const RANK: Record<TileState, number> = { crit: 4, warn: 3, stale: 2, nodata: 1, ok: 0 };
const DOT: Record<TileState, string> = { crit: '#FF6B6B', warn: '#F5C451', stale: '#7C8594', nodata: '#3A4252', ok: '#4ADE9A' };
const STATE_PILL: Record<TileState, [Tone, string]> = {
  crit: ['crit', 'Critical'], warn: ['warn', 'Warning'], ok: ['ok', 'Nominal'], stale: ['neutral', 'Stale'], nodata: ['neutral', 'No data'],
};

interface Props {
  satId: string;
  cvt: Record<string, Param>;
  onOpenParam: (paramId: string) => void;
  /** Subsystem filter, held by the caller (it lives in the URL as `tab`). */
  sub: Sub | 'ALL';
  onSub: (s: Sub | 'ALL') => void;
  /** Values to show instead of the live table (playback). */
  override?: Record<string, Param>;
  /** Playback: graphs plot this window, with a marker at the playback position. */
  window?: { ts: number[]; series: (id: string) => number[]; cursorTs: number };
}

/** The worst state among a subsystem's parameters (or every parameter for 'ALL'). */
export const worstOf = (source: Record<string, Param>, s: Sub | 'ALL'): TileState =>
  (s === 'ALL' ? ALL : PARAMETERS[s]).reduce<TileState>((w, p) => { const t = tileState(source[p.param_id]); return RANK[t] > RANK[w] ? t : w; }, 'ok');

/** The satellite's parameters as tiles, a paged table or a grid of graphs; each view remembers which parameters it shows. */
export const ParamViews: React.FC<Props> = ({ satId, cvt, onOpenParam, sub, onSub, override, window: win }) => {
  const [view, setView] = usePersisted<ViewKind>('vyuh-sathealth-view', 'CELLS');
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

  const sorted = useMemo(() => {
    const val = (p: (typeof ALL)[number]) => sort.key === 'name' ? p.param_id : sort.key === 'value' ? source[p.param_id]?.eu_value ?? -Infinity : sort.key === 'subsystem' ? p.subsystem : RANK[tileState(source[p.param_id])];
    return [...list].sort((a, b) => {
      const x = val(a), y = val(b);
      const d = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return (d || a.param_id.localeCompare(b.param_id)) * sort.dir;
    });
  }, [list, sort, source]);

  const perPage = view === 'TABLE' ? pageSize : view === 'GRAPHS' ? graphsPerPage : Infinity;
  const pages = perPage === Infinity ? 1 : Math.max(1, Math.ceil(sorted.length / perPage));
  const cur = Math.min(page, pages - 1);
  const shown = perPage === Infinity ? sorted : sorted.slice(cur * perPage, cur * perPage + perPage);

  const spec = GRAPH_RANGES[range];
  const graphTs = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    return Array.from({ length: spec.pts }, (_, i) => now - (spec.pts - 1 - i) * spec.step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, view, cur]);

  const th = (key: string, label: string, right?: boolean) => (
    <th className={clsx('px-3 py-2 text-[12px] font-normal text-[#6B7383] whitespace-nowrap', right ? 'text-right' : 'text-left')}>
      <button type="button" onClick={() => setSort((x) => ({ key, dir: x.key === key ? (x.dir === 1 ? -1 : 1) : -1 }))} className="inline-flex items-center gap-1 hover:text-[#E9ECF1]">
        {label}{sort.key === key && (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
      </button>
    </th>
  );

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-[14px] font-medium mr-1">Subsystems</span>
        {(['ALL', ...SUBSYSTEMS] as const).map((s) => {
          const w = worstOf(source, s);
          return (
            <button key={s} type="button" onClick={() => { onSub(s); setPage(0); }} aria-pressed={sub === s}
              className={clsx('h-8 px-3 rounded-full text-[13px] flex items-center gap-1.5', sub === s ? 'bg-[#232936] text-white' : 'bg-[#11141B] text-[#9AA3B2] hover:text-[#E9ECF1]')}>
              <span className="w-[7px] h-[7px] rounded-full" style={{ background: s === 'ALL' ? '#9AA3B2' : DOT[w] }} aria-hidden="true" />
              {s === 'ALL' ? 'All' : subLabel(s)}
              {s !== 'ALL' && w !== 'ok' && <span className="sr-only">({STATE_PILL[w][1]})</span>}
            </button>
          );
        })}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {view === 'GRAPHS' && !win && (
            <Segmented size="sm" value={range} onChange={setRange} options={(Object.keys(GRAPH_RANGES) as GraphRange[]).map((r) => ({ value: r, label: r }))} />
          )}
          <Segmented size="sm" value={view} onChange={(v) => { setView(v); setPage(0); }}
            options={[{ value: 'CELLS', label: 'Tiles' }, { value: 'TABLE', label: 'Table' }, { value: 'GRAPHS', label: 'Graphs' }]} />
          <ColumnChooser label={view === 'CELLS' ? 'Edit tiles' : view === 'TABLE' ? 'Edit rows' : 'Edit graphs'}
            items={ALL.map((p) => ({ id: p.param_id, label: p.param_id, group: subLabel(p.subsystem) }))}
            selected={selected} onChange={(ids) => { setSelected(ids); setPage(0); }} onReset={() => setSelected(ALL_IDS)} />
        </span>
      </div>

      {shown.length === 0 && <p className="text-[13px] text-[#9AA3B2] py-8 text-center">Nothing selected here. Use “Edit” to add parameters to this view.</p>}

      {view === 'CELLS' && (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
          {shown.map((d) => (
            <ParameterCard key={d.param_id} def={d} live={source[d.param_id]} onClick={() => onOpenParam(d.param_id)}
              samples={win ? (win.series(d.param_id).slice(0, Math.max(2, win.ts.findIndex((t) => t > win.cursorTs)))) : recentSamples(satId, d.param_id).map((x) => x.v)} />
          ))}
        </div>
      )}

      {view === 'TABLE' && shown.length > 0 && (
        <div className="bg-[#11141B] border border-[#1A1E27] rounded-2xl p-2 overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px] border-separate border-spacing-y-1">
            <thead><tr>{th('name', 'Parameter')}{th('subsystem', 'Subsystem')}{th('value', 'Value', true)}{th('state', 'State')}<th className="px-3 py-2 text-left text-[12px] font-normal text-[#6B7383]">Limits (warn · critical)</th><th className="px-3 py-2 text-left text-[12px] font-normal text-[#6B7383]">Updated</th></tr></thead>
            <tbody>
              {shown.map((d) => {
                const p = source[d.param_id];
                const st = tileState(p);
                const [tone, label] = STATE_PILL[st];
                return (
                  <tr key={d.param_id} tabIndex={0} onClick={() => onOpenParam(d.param_id)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpenParam(d.param_id))}
                    className="cursor-pointer bg-[#141821] hover:bg-[#1B2130] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F28C28]">
                    <td className="px-3 py-2.5 rounded-l-[10px]"><span className="font-mono-code">{d.param_id}</span><span className="block text-[12px] text-[#7C8594]">{d.name}</span></td>
                    <td className="px-3 py-2.5 text-[#9AA3B2]">{subLabel(d.subsystem)}</td>
                    <td className={clsx('px-3 py-2.5 text-right font-mono-code tabular-nums', st === 'crit' ? 'text-[#FF7A7A]' : st === 'warn' ? 'text-[#F5C451]' : st === 'ok' ? '' : 'text-[#7C8594]')}>
                      {p ? fmtNum(p.eu_value) : '—'} <span className="text-[#7C8594]">{d.unit}</span>
                    </td>
                    <td className="px-3 py-2.5"><Pill tone={tone}>{label}</Pill></td>
                    <td className="px-3 py-2.5 font-mono-code text-[12px] text-[#9AA3B2] whitespace-nowrap">{fmtNum(d.warnLo)} to {fmtNum(d.warnHi)} · {fmtNum(d.critLo)} to {fmtNum(d.critHi)}</td>
                    <td className="px-3 py-2.5 rounded-r-[10px] font-mono-code text-[12px] text-[#7C8594]">{p ? fmtUtc(Date.parse(p.timestamp_utc), true) : 'never'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {view === 'GRAPHS' && shown.length > 0 && (
        <>
          <p className="text-[12px] text-[#7C8594] flex flex-wrap items-center gap-2">
            {win ? 'Playback window' : `${range} · ${rollupLabel(spec.step)}`}
            <SampleTag>Reconstructed — archive not connected</SampleTag>
          </p>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
            {shown.map((d, i) => {
              const p = source[d.param_id];
              const st = tileState(p);
              const live = p?.eu_value ?? d.value;
              return (
                <div key={`${satId}-${d.param_id}-${range}-${win ? win.ts[0] : 0}`} className="rounded-2xl border border-[#1A1E27] bg-[#11141B] p-3 min-w-0">
                  <button type="button" onClick={() => onOpenParam(d.param_id)} className="w-full flex items-baseline justify-between gap-2 mb-1 text-left">
                    <span className="font-mono-code text-[12.5px] truncate">{d.param_id}</span>
                    <span className={clsx('font-mono-code tabular-nums text-[13px]', st === 'crit' ? 'text-[#FF7A7A]' : st === 'warn' ? 'text-[#F5C451]' : st === 'ok' ? '' : 'text-[#7C8594]')}>
                      {p ? fmtNum(p.eu_value) : 'No data'}<span className="text-[#7C8594] text-[11px] ml-0.5">{p ? d.unit : ''}</span>
                    </span>
                  </button>
                  <MultiPlot timestamps={win ? win.ts : graphTs} height={130} compact syncKey={`grid-${satId}`} onReady={() => {}} onXRange={() => {}} cursorTs={win?.cursorTs}
                    series={[{ label: d.param_id, color: PALETTE[i % PALETTE.length], unit: d.unit, values: win ? win.series(d.param_id) : history(satId, d as ParamDef, live, graphTs), limits: { lowSoft: d.warnLo, hiSoft: d.warnHi, lowHard: d.critLo, hiHard: d.critHi } }]} />
                </div>
              );
            })}
          </div>
        </>
      )}

      {perPage !== Infinity && sorted.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-[#9AA3B2]">
          <span className="flex items-center gap-2">
            Per page
            <Select value={perPage} onChange={(e) => { (view === 'TABLE' ? setPageSize : setGraphsPerPage)(Number(e.target.value)); setPage(0); }}
              className="h-8 rounded-xl bg-[#161A22] border border-[#232936] px-2 text-[13px] text-[#E9ECF1]" aria-label="Items per page">
              {(view === 'TABLE' ? [10, 15, 25, 50] : [3, 6, 9, 12]).map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
            <span className="tabular-nums">{cur * perPage + 1}–{Math.min(sorted.length, cur * perPage + perPage)} of {sorted.length}</span>
          </span>
          <span className="flex items-center gap-1">
            <button type="button" disabled={cur === 0} onClick={() => setPage(cur - 1)} aria-label="Previous page" className="w-8 h-8 rounded-lg bg-[#11141B] flex items-center justify-center disabled:opacity-30 hover:bg-[#171B24]"><ChevronLeft size={14} /></button>
            <span className="px-2 tabular-nums">{cur + 1} / {pages}</span>
            <button type="button" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} aria-label="Next page" className="w-8 h-8 rounded-lg bg-[#11141B] flex items-center justify-center disabled:opacity-30 hover:bg-[#171B24]"><ChevronRight size={14} /></button>
          </span>
        </div>
      )}
    </div>
  );
};
