import React, { useState } from 'react';
import { clsx } from 'clsx';
import { ArrowDown, ArrowUp, ExternalLink, Globe, Map, Plus, Search, Table2 } from 'lucide-react';
import { useFleetStore } from '../../store/useFleetStore';
import { useAlarmStore } from '../../store/useAlarmStore';
import { useMissionStore } from '../../store/useMissionStore';
import { StatusBadge } from '../../components/atoms/Badge';
import { CesiumGlobe } from '../../components/organisms/CesiumGlobe';
import { Heatmap } from '../../components/organisms/Heatmap';
import { OrbitalMap } from '../../components/organisms/OrbitalMap';
import { ErrorBoundary } from '../../components/layout/ErrorBoundary';
import { Button } from '../../components/atoms/Button';
import { AddSatelliteWizard } from '../../components/organisms/AddSatelliteWizard';
import { Card, KpiTile, PageHead } from '../../components/molecules/Page';
import { tenantOf } from '../../data/fleet';
import type { Satellite } from '../../types';
import { formatUTC } from '../../utils/formatUTC';
import { ColumnChooser } from '../../components/organisms/ColumnChooser';
import { COLUMNS, COLUMN_BY_ID, ColCtx, DEFAULT_COLUMNS } from '../../ops/fleetColumns';
import { getSatOps } from '../../ops/satOps';
import { useConjunctionStore } from '../../ops/conjunctionStore';
import { openSatelliteWindow } from '../../ops/window';
import { usePersisted } from '../../lib/usePersisted';

type Filter = string;
type View = 'TABLE' | 'GLOBE' | 'MAP';

/** S03 · Fleet overview — the whole constellation at a glance. */
export const ConstellationOverview: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => {
  const [view, setView] = useState<View>('TABLE');
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: 'health', dir: 1 });
  const [colIds, setColIds] = usePersisted<string[]>('vyuh-fleet-columns', DEFAULT_COLUMNS);
  const cvt = useFleetStore((s) => s.cvt);
  const [filter, setFilter] = useState<Filter>('All planes');
  const [query, setQuery] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const satellites = useFleetStore((s) => s.satellites);
  const contactWindows = useFleetStore((s) => s.contactWindows);
  const alarms = useAlarmStore((s) => s.active);
  const alarmHistory = useAlarmStore((s) => s.history);
  const conjunctions = useConjunctionStore((s) => s.conjunctions);
  const approvals = useMissionStore((s) => s.approvals.filter((a) => a.state === 'PENDING'));

  const all = Object.values(satellites);
  // Planes are derived from the live fleet, not hardcoded, so a satellite added
  // through the wizard — in a plane nobody typed into this file — still filters.
  const planes = Array.from(new Set(all.map((s) => s.constellation_group))).sort();
  const FILTERS = ['All planes', ...planes, 'Customer'];

  const q = query.trim().toUpperCase();
  const satList = all
    .filter((s) =>
      filter === 'All planes' ? true
      : filter === 'Customer' ? tenantOf(s.sat_id) !== 'Akashaveda'
      : s.constellation_group === filter
    )
    .filter((s) => !q || s.sat_id.includes(q) || s.name.toUpperCase().includes(q));

  const now = Date.now();
  const ctxFor = (sat: Satellite): ColCtx => ({
    sat, cvt: cvt[sat.sat_id], now,
    windows: contactWindows.filter((w) => w.sat_id === sat.sat_id && Date.parse(w.los_utc) > now).sort((x, y) => Date.parse(x.aos_utc) - Date.parse(y.aos_utc)),
    conj: conjunctions.filter((c) => c.satId === sat.sat_id),
    ops: getSatOps(sat.sat_id, now),
    alarms: alarms.filter((a) => a.sat_id === sat.sat_id && a.state !== 'RTN'),
    history: alarmHistory.filter((a) => a.sat_id === sat.sat_id),
  });
  const cols = colIds.map((id) => COLUMN_BY_ID.get(id)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const sortCol = COLUMN_BY_ID.get(sort.key);
  const rows = satList.map((sat) => ({ sat, ctx: ctxFor(sat) })).sort((a, b) => {
    if (!sortCol?.sort) return 0;
    const x = sortCol.sort(a.ctx), y = sortCol.sort(b.ctx);
    const d = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
    return (Number.isNaN(d) ? 0 : d || a.sat.sat_id.localeCompare(b.sat.sat_id)) * sort.dir;
  });
  const sortBy = (key: string) => setSort((x) => ({ key, dir: x.key === key ? (x.dir === 1 ? -1 : 1) : 1 }));

  const count = (state: string) => satList.filter((s) => s.health_state === state).length;
  const activePasses = contactWindows.filter((w) => w.status === 'AOS');
  const nextPasses = contactWindows.filter((w) => w.status === 'UPCOMING').slice(0, 6);

  const open = (id: string) => onNavigate(`satellite?sat=${id}`);

  return (
    <>
      <PageHead
        title="Fleet overview"
        sub={`${all.length} satellites · ${activePasses.length} in contact`}
        actions={
          <Button onClick={() => setWizardOpen(true)} size="sm">
            <Plus size={15} /> Add satellite
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={clsx('h-[30px] px-3 rounded-full border text-[12px] transition-colors',
                filter === f ? 'border-[#2E6FD8] text-white bg-[#2E6FD8]' : 'border-[#2A3B52] text-[#A3B1C2] hover:bg-[#172434]')}>
              {f}
            </button>
          ))}
        </div>
        <div className="relative ml-auto">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8496AB]" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a satellite…"
            aria-label="Search satellites"
            className="h-[30px] w-[200px] bg-[#172434] border border-[#30435B] rounded-full pl-8 pr-3 text-[12px] outline-none focus:border-[#2DCCFF]" />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <KpiTile value={count('NOMINAL')} label="Nominal" tone="ok" />
        <KpiTile value={count('WARNING')} label="Warning" tone="warn" onClick={() => onNavigate('alarms')} />
        <KpiTile value={count('CRITICAL')} label="Critical" tone="crit" onClick={() => onNavigate('alarms')} />
        <KpiTile value={activePasses.length} label="In contact" tone="info" sub="AOS now" onClick={() => onNavigate('pass')} />
        <KpiTile value={approvals.length} label="Pending approvals" tone="pending" onClick={() => onNavigate('approvals')} />
      </div>

      <div className="grid grid-cols-1 gap-4 items-start">
        <div className="flex flex-col gap-4 min-w-0">
          <Card
            title="Satellites"
            actions={
              <div className="flex items-center gap-2">
              {view === 'TABLE' && (
                <ColumnChooser items={COLUMNS.map((c) => ({ id: c.id, label: c.label, group: c.group }))} selected={colIds}
                  onChange={setColIds} onReset={() => setColIds(DEFAULT_COLUMNS)} locked={['sat']} />
              )}
              <div className="flex items-center gap-1 rounded-md border border-[#2A3B52] p-0.5">
                {([['TABLE', Table2, 'Table'], ['GLOBE', Globe, 'Globe'], ['MAP', Map, 'Map']] as const).map(([m, Icon, label]) => (
                  <button key={m} onClick={() => setView(m)} aria-pressed={view === m}
                    className={clsx('flex items-center gap-1.5 px-2.5 py-1 rounded text-[12px] font-medium',
                      view === m ? 'bg-[#1F2D40] text-[#E6EDF3]' : 'text-[#A3B1C2] hover:text-[#E6EDF3]')}>
                    <Icon size={14} aria-hidden="true" /> {label}
                  </button>
                ))}
              </div>
              </div>
            }
          >
            {view === 'TABLE' ? (
              <div className="-mx-4 -my-4 max-h-[620px] overflow-auto">
                <table className="w-full text-[12.5px] border-separate border-spacing-0">
                  <thead className="sticky top-0 z-10">
                    <tr className="text-left text-[11px] font-semibold text-[#8496AB]">
                      {cols.map((c, i) => (
                        <th key={c.id} className={clsx('px-4 py-2.5 whitespace-nowrap bg-[#111A25] border-b border-[#213044]', i === 0 && 'sticky left-0 z-20')}>
                          {c.sort ? (
                            <button onClick={() => sortBy(c.id)} className="inline-flex items-center gap-1 hover:text-[#E6EDF3]">
                              {c.label}{sort.key === c.id && (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                            </button>
                          ) : c.label}
                        </th>
                      ))}
                      <th className="bg-[#111A25] border-b border-[#213044] w-9" aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ sat, ctx }) => (
                      <tr key={sat.sat_id} onClick={() => open(sat.sat_id)} tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && open(sat.sat_id)} className="group cursor-pointer">
                        {cols.map((c, i) => (
                          <td key={c.id} className={clsx('px-4 py-2 whitespace-nowrap border-b border-[#1A2738] group-hover:bg-[#172434]', i === 0 && 'sticky left-0 bg-[#111A25] group-hover:bg-[#172434]')}>{c.cell(ctx)}</td>
                        ))}
                        <td className="px-2 border-b border-[#1A2738] group-hover:bg-[#172434]">
                          <button onClick={(e) => { e.stopPropagation(); openSatelliteWindow(sat.sat_id); }} title={`Open ${sat.sat_id} in a new window`} aria-label={`Open ${sat.sat_id} in a new window`}
                            className="w-7 h-7 rounded flex items-center justify-center text-[#8496AB] hover:text-[#E6EDF3] hover:bg-[#1F2D40]"><ExternalLink size={14} /></button>
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 && <tr><td colSpan={cols.length + 1} className="px-4 py-6 text-[#A3B1C2]">No satellites match.</td></tr>}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="h-[640px] rounded overflow-hidden">
                <ErrorBoundary label="3D globe" fallback={<OrbitalMap satellites={satList} onSelectSat={open} />}>
                  <CesiumGlobe satellites={satList} onSelectSat={open} viewMode={view === 'GLOBE' ? '3D' : '2D'} />
                </ErrorBoundary>
              </div>
            )}
          </Card>

          <Card title="Subsystem health">
            <Heatmap satellites={satList} onSelectSat={open} />
          </Card>
        </div>

        {/* Passes */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card title={`Active passes · ${activePasses.length}`}>
            {activePasses.length === 0 && <p className="text-[13px] text-[#A3B1C2]">No satellite in contact.</p>}
            <div className="flex flex-col gap-2">
              {activePasses.map((w) => (
                <button key={w.window_id} onClick={() => onNavigate(`pass?sat=${w.sat_id}`)}
                  className="text-left rounded border border-[#2DCCFF]/40 bg-[#2DCCFF]/[0.07] hover:border-[#2DCCFF] transition-colors px-3 py-2.5 flex flex-col gap-1">
                  <span className="flex items-center justify-between">
                    <span className="font-mono-code text-[12.5px] font-bold text-[#4DACFF]">{w.sat_id}</span>
                    <StatusBadge status={w.status} size="sm" />
                  </span>
                  <span className="text-[12px] text-[#A3B1C2]">{w.ground_station} · {w.max_elevation_deg}° max</span>
                  <span className="font-mono-code text-[11px] text-[#5F7087] tabular-nums">
                    LOS {formatUTC(w.los_utc, 'HH:mm:ss')}
                  </span>
                </button>
              ))}
            </div>
          </Card>

          <Card title="Next contacts" actions={
            <button onClick={() => onNavigate('schedule')} className="text-[12px] text-[#4DACFF] hover:underline">Schedule</button>
          }>
            <div className="flex flex-col">
              {nextPasses.map((w) => (
                <div key={w.window_id} className="flex items-center justify-between py-2 border-b border-[#213044] last:border-0 text-[12.5px]">
                  <span className="font-mono-code">{w.sat_id}</span>
                  <span className="text-[#A3B1C2]">{w.ground_station}</span>
                  <span className="font-mono-code tabular-nums text-[#A3B1C2]">{formatUTC(w.aos_utc, 'HH:mm')}</span>
                </div>
              ))}
              {nextPasses.length === 0 && <span className="text-[13px] text-[#A3B1C2]">Nothing scheduled.</span>}
            </div>
          </Card>
        </div>
      </div>

      {wizardOpen && (
        <AddSatelliteWizard onClose={() => setWizardOpen(false)} onNavigate={onNavigate} />
      )}
    </>
  );
};
