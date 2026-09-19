import React, { useState } from 'react';
import { clsx } from 'clsx';
import { Terminal, ListChecks } from 'lucide-react';
import { useFleetStore } from '../../store/useFleetStore';
import { ParameterCard } from '../../components/organisms/ParameterCard';
import { AlarmPanel } from '../../components/organisms/AlarmPanel';
import { StatusBadge } from '../../components/atoms/Badge';
import { Button } from '../../components/atoms/Button';
import { Card, PageHead } from '../../components/molecules/Page';
import { FLEET, PARAM_CARDS } from '../../data/fleet';
import { formatUTC } from '../../utils/formatUTC';

type Subsystem = 'POWER' | 'ADCS' | 'THERMAL' | 'COMMS' | 'PAYLOAD' | 'OBC';
const TABS: Subsystem[] = ['POWER', 'ADCS', 'THERMAL', 'COMMS', 'PAYLOAD', 'OBC'];

/** S04 · Satellite health — telemetry for one satellite, by subsystem. */
export const SatelliteHealth: React.FC<{ satId: string; tab?: string; onNavigate: (to: string) => void }> = ({ satId, tab: initialTab, onNavigate }) => {
  const [tab, setTab] = useState<Subsystem>(
    TABS.includes(initialTab as Subsystem) ? (initialTab as Subsystem) : 'POWER'
  );
  const satellites = useFleetStore((s) => s.satellites);
  const cvt = useFleetStore((s) => s.cvt)[satId] || {};

  const sat = satellites[satId];
  const params = PARAM_CARDS[tab] || [];
  const inContact = Boolean(sat?.last_contact_utc && Date.now() - Date.parse(sat.last_contact_utc) < 15 * 60_000);

  // A tab shows a dot when any of its parameters is out of limits.
  const tabState = (t: Subsystem) =>
    (PARAM_CARDS[t] || []).reduce((worst, p) => Math.max(worst, cvt[p.param_id]?.alarm_state ?? 0), 0);

  return (
    <>
      <PageHead
        title={satId}
        sub={sat ? `${sat.name} · ${sat.constellation_group} · ${sat.altitude_km} km ${sat.orbit_regime}` : 'Unknown satellite'}
        actions={
          <>
            <select value={satId} onChange={(e) => onNavigate(`satellite?sat=${e.target.value}&tab=${tab}`)} aria-label="Satellite"
              className="h-9 bg-[#0C0D10] border border-[#2B303B] rounded-[2px] px-2.5 font-mono-code text-[13px] outline-none focus:border-[#4A9EFF]">
              {FLEET.map((s) => <option key={s.sat_id} value={s.sat_id}>{s.sat_id}</option>)}
            </select>
            <Button variant="secondary" onClick={() => onNavigate('procedure')}>
              <ListChecks size={16} /> Run procedure
            </Button>
            <Button onClick={() => onNavigate(`command?sat=${satId}`)}>
              <Terminal size={16} /> Send command
            </Button>
          </>
        }
      />

      {/* Context bar */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-[#2B303B] bg-[#14161B] px-3.5 py-2.5 mb-4 text-[12.5px]">
        <span className="flex items-center gap-2">
          <StatusBadge status={sat?.health_state ?? 'NO_DATA'} size="sm" />
          <StatusBadge status={inContact ? 'AOS' : 'LOS'} size="sm" />
        </span>
        <span className="text-[#A1A7B3]">
          Last contact <span className="font-mono-code text-[#F3F4F6] tabular-nums">{sat?.last_contact_utc ? formatUTC(sat.last_contact_utc, 'HH:mm:ss') : '—'}</span>
        </span>
        <span className="text-[#A1A7B3]">
          Next pass <span className="font-mono-code text-[#F3F4F6] tabular-nums">{sat?.next_contact_utc ? formatUTC(sat.next_contact_utc, 'HH:mm:ss') : '—'}</span>
        </span>
        <span className="text-[#A1A7B3]">
          Station <span className="font-mono-code text-[#F3F4F6]">{sat?.assigned_ground_stations?.[0] ?? '—'}</span>
        </span>
        <span className="text-[#A1A7B3] ml-auto">
          Dictionary <span className="font-mono-code text-[#3CB992]">{sat?.mib_version ?? '—'}</span>
        </span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
        <div className="flex flex-col gap-4 min-w-0">
          {/* Subsystem tabs */}
          <div className="flex items-center gap-1 border-b border-[#2B303B] overflow-x-auto">
            {TABS.map((t) => {
              const state = tabState(t);
              return (
                <button key={t} onClick={() => setTab(t)}
                  className={clsx('flex items-center gap-2 px-3.5 py-2.5 text-[13px] font-bold whitespace-nowrap transition-colors border-b-2 -mb-[1px]',
                    tab === t ? 'text-[#F3F4F6] border-[#3CB992]' : 'text-[#A1A7B3] border-transparent hover:text-[#F3F4F6]')}>
                  {t[0] + t.slice(1).toLowerCase()}
                  {state > 0 && <span className={clsx('w-[7px] h-[7px] rounded-full', state === 2 ? 'bg-[#C62828]' : 'bg-[#E8943A]')} />}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
            {params.map((p) => {
              const live = cvt[p.param_id];
              return (
                <ParameterCard
                  key={p.param_id}
                  param={{
                    param_id: p.param_id,
                    name: p.name,
                    subsystem: tab,
                    eu_value: live?.eu_value ?? 0,
                    unit: p.unit,
                    alarm_state: live?.alarm_state ?? 0,
                    quality: live?.quality ?? 0,
                    limit_low_soft: p.limit_low_soft,
                    limit_hi_soft: p.limit_hi_soft,
                    limit_low_hard: p.limit_low_hard,
                    limit_hi_hard: p.limit_hi_hard,
                    timestamp_utc: live?.timestamp_utc || new Date().toISOString(),
                  }}
                  onClick={() => onNavigate(`parameter?sat=${satId}&param=${p.param_id}`)}
                />
              );
            })}
          </div>
        </div>

        <Card title="Alarms" className="xl:sticky xl:top-0">
          <AlarmPanel onNavigateParam={(sId, pId) => onNavigate(`parameter?sat=${sId}&param=${pId}`)} />
        </Card>
      </div>
    </>
  );
};
