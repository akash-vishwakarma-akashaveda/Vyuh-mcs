import React, { useState } from 'react';
import { clsx } from 'clsx';
import { ArrowDown, ArrowUp, Globe, Map, Plus, Search, Table2 } from 'lucide-react';
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
import { formatUTC } from '../../utils/formatUTC';
import { isStale } from '../../utils/stalenessUtils';
import type { Param } from '../../types';

type Filter = string;
type View = 'TABLE' | 'GLOBE' | 'MAP';
type SortKey = 'sat' | 'status' | 'soc' | 'temp';
const SEVERITY: Record<string, number> = { CRITICAL: 0, WARNING: 1 };
const ALARM_TEXT = ['text-[#F3F4F6]', 'text-[#E8943A]', 'text-[#FF6B6B]'];

/** One live value: alarm colour on a limit violation, dimmed when stale, dash if never received. */
const Val: React.FC<{ p?: Param; digits?: number }> = ({ p, digits = 1 }) => {
  if (!p) return <span className="text-[#5E6572]">—</span>;
  return (
    <span className={clsx('font-mono-code tabular-nums', isStale(p) ? 'text-[#5E6572]' : ALARM_TEXT[p.alarm_state])}>
      {p.eu_value.toFixed(digits)}<span className="text-[#5E6572] ml-0.5 text-[10.5px]">{p.unit}</span>
    </span>
  );
};

/** S03 · Fleet overview — the whole constellation at a glance. */
export const ConstellationOverview: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => {
  const [view, setView] = useState<View>('TABLE');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'status', dir: 1 });
  const cvt = useFleetStore((s) => s.cvt);
  const [filter, setFilter] = useState<Filter>('All planes');
  const [query, setQuery] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const satellites = useFleetStore((s) => s.satellites);
  const contactWindows = useFleetStore((s) => s.contactWindows);
  const alarms = useAlarmStore((s) => s.active);
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

  const val = (id: string, p: string) => cvt[id]?.[p]?.eu_value ?? Infinity;
  const rows = [...satList].sort((a, b) => {
    const k = sort.key;
    const d = k === 'sat' ? a.sat_id.localeCompare(b.sat_id)
      : k === 'status' ? (SEVERITY[a.health_state] ?? 2) - (SEVERITY[b.health_state] ?? 2) || a.sat_id.localeCompare(b.sat_id)
      : k === 'soc' ? val(a.sat_id, 'BAT_SOC') - val(b.sat_id, 'BAT_SOC')
      : val(a.sat_id, 'BAT_TEMP') - val(b.sat_id, 'BAT_TEMP');
    return Number.isNaN(d) ? 0 : d * sort.dir;
  });
  const sortBy = (key: SortKey) => setSort((x) => ({ key, dir: x.key === key ? (x.dir === 1 ? -1 : 1) : 1 }));

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
                filter === f ? 'border-[#0F6E56] text-white bg-[#0F6E56]' : 'border-[#2B303B] text-[#A1A7B3] hover:bg-[#1A1D24]')}>
              {f}
            </button>
          ))}
        </div>
        <div className="relative ml-auto">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8B92A0]" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a satellite…"
            aria-label="Search satellites"
            className="h-[30px] w-[200px] bg-[#1A1D24] border border-[#2E3440] rounded-full pl-8 pr-3 text-[12px] outline-none focus:border-[#4A9EFF]" />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <KpiTile value={count('NOMINAL')} label="Nominal" tone="ok" />
        <KpiTile value={count('WARNING')} label="Warning" tone="warn" onClick={() => onNavigate('alarms')} />
        <KpiTile value={count('CRITICAL')} label="Critical" tone="crit" onClick={() => onNavigate('alarms')} />
        <KpiTile value={activePasses.length} label="In contact" tone="info" sub="AOS now" onClick={() => onNavigate('pass')} />
        <KpiTile value={approvals.length} label="Pending approvals" tone="pending" onClick={() => onNavigate('approvals')} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-4 items-start">
        <div className="flex flex-col gap-4 min-w-0">
          <Card
            title="Satellites"
            actions={
              <div className="flex items-center gap-1 rounded-md border border-[#2B303B] p-0.5">
                {([['TABLE', Table2, 'Table'], ['GLOBE', Globe, 'Globe'], ['MAP', Map, 'Map']] as const).map(([m, Icon, label]) => (
                  <button key={m} onClick={() => setView(m)} aria-pressed={view === m}
                    className={clsx('flex items-center gap-1.5 px-2.5 py-1 rounded text-[12px] font-medium',
                      view === m ? 'bg-[#22262F] text-[#F3F4F6]' : 'text-[#A1A7B3] hover:text-[#F3F4F6]')}>
                    <Icon size={14} aria-hidden="true" /> {label}
                  </button>
                ))}
              </div>
            }
          >
            {view === 'TABLE' ? (
              <div className="-mx-4 -my-4 max-h-[560px] overflow-auto">
                <table className="w-full text-[12.5px]">
                  <thead className="sticky top-0 bg-[#14161B] z-10">
                    <tr className="text-left text-[11px] font-semibold text-[#8B92A0] border-b border-[#23272F]">
                      {([['sat', 'Satellite'], ['status', 'Health'], [null, 'Plane'], ['soc', 'Battery'], ['temp', 'Bat temp'], [null, 'Bus V'], [null, 'RSSI'], [null, 'Next contact']] as const).map(([k, label]) => (
                        <th key={label} className="px-4 py-2.5 font-semibold whitespace-nowrap">
                          {k ? (
                            <button onClick={() => sortBy(k)} className="inline-flex items-center gap-1 hover:text-[#F3F4F6]">
                              {label}{sort.key === k && (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                            </button>
                          ) : label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((sat) => {
                      const c = cvt[sat.sat_id];
                      const next = contactWindows.find((w) => w.sat_id === sat.sat_id && w.status === 'UPCOMING');
                      const nAlarms = alarms.filter((a) => a.sat_id === sat.sat_id).length;
                      return (
                        <tr key={sat.sat_id} onClick={() => open(sat.sat_id)} tabIndex={0}
                          onKeyDown={(e) => e.key === 'Enter' && open(sat.sat_id)}
                          className="border-b border-[#1B1F26] hover:bg-[#1A1D24] cursor-pointer">
                          <td className="px-4 py-2 whitespace-nowrap">
                            <span className="font-mono-code font-bold text-[#3CB992]">{sat.sat_id}</span>
                          </td>
                          <td className="px-4 py-2">
                            <span className="inline-flex items-center gap-2">
                              <StatusBadge status={sat.health_state} size="sm" />
                              {nAlarms > 0 && <span className="text-[11px] text-[#E8943A] tabular-nums">{nAlarms} alarm{nAlarms > 1 ? 's' : ''}</span>}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-[#A1A7B3] whitespace-nowrap">{sat.constellation_group}</td>
                          <td className="px-4 py-2"><Val p={c?.BAT_SOC} digits={0} /></td>
                          <td className="px-4 py-2"><Val p={c?.BAT_TEMP} /></td>
                          <td className="px-4 py-2"><Val p={c?.BUS_VOLTAGE} /></td>
                          <td className="px-4 py-2"><Val p={c?.RSSI} /></td>
                          <td className="px-4 py-2 whitespace-nowrap font-mono-code tabular-nums text-[#A1A7B3]">{next ? formatUTC(next.aos_utc, 'HH:mm') : '—'}</td>
                        </tr>
                      );
                    })}
                    {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-[#A1A7B3]">No satellites match.</td></tr>}
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
        <div className="flex flex-col gap-4">
          <Card title={`Active passes · ${activePasses.length}`}>
            {activePasses.length === 0 && <p className="text-[13px] text-[#A1A7B3]">No satellite in contact.</p>}
            <div className="flex flex-col gap-2">
              {activePasses.map((w) => (
                <button key={w.window_id} onClick={() => onNavigate(`pass?sat=${w.sat_id}`)}
                  className="text-left rounded border border-[#4A9EFF]/40 bg-[#4A9EFF]/[0.07] hover:border-[#4A9EFF] transition-colors px-3 py-2.5 flex flex-col gap-1">
                  <span className="flex items-center justify-between">
                    <span className="font-mono-code text-[12.5px] font-bold text-[#3CB992]">{w.sat_id}</span>
                    <StatusBadge status={w.status} size="sm" />
                  </span>
                  <span className="text-[12px] text-[#A1A7B3]">{w.ground_station} · {w.max_elevation_deg}° max</span>
                  <span className="font-mono-code text-[11px] text-[#5E6572] tabular-nums">
                    LOS {formatUTC(w.los_utc, 'HH:mm:ss')}
                  </span>
                </button>
              ))}
            </div>
          </Card>

          <Card title="Next contacts" actions={
            <button onClick={() => onNavigate('schedule')} className="text-[12px] text-[#3CB992] hover:underline">Schedule</button>
          }>
            <div className="flex flex-col">
              {nextPasses.map((w) => (
                <div key={w.window_id} className="flex items-center justify-between py-2 border-b border-[#23272F] last:border-0 text-[12.5px]">
                  <span className="font-mono-code">{w.sat_id}</span>
                  <span className="text-[#A1A7B3]">{w.ground_station}</span>
                  <span className="font-mono-code tabular-nums text-[#A1A7B3]">{formatUTC(w.aos_utc, 'HH:mm')}</span>
                </div>
              ))}
              {nextPasses.length === 0 && <span className="text-[13px] text-[#A1A7B3]">Nothing scheduled.</span>}
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
