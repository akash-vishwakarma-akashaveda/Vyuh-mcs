import React, { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { ExternalLink, ListChecks, Terminal } from 'lucide-react';
import { useFleetStore } from '../../store/useFleetStore';
import { useUIStore } from '../../store/useUIStore';
import { AlarmPanel } from '../../components/organisms/AlarmPanel';
import { ContactTimeline } from '../../components/organisms/ContactTimeline';
import { ParamViews } from '../../components/organisms/ParamViews';
import { PlaybackPanel } from '../../components/organisms/PlaybackPanel';
import { SatOpsPanel } from '../../components/organisms/SatOpsPanel';
import { StatusBadge } from '../../components/atoms/Badge';
import { Button } from '../../components/atoms/Button';
import { Card, PageHead } from '../../components/molecules/Page';
import { FLEET } from '../../data/fleet';
import { formatUTC } from '../../utils/formatUTC';
import { openSatelliteWindow } from '../../ops/window';
import { ParameterDetail } from './ParameterDetail';

type Mode = 'LIVE' | 'HISTORY' | 'PLAYBACK';
const MODES: { id: Mode; label: string }[] = [
  { id: 'LIVE', label: 'Live' },
  { id: 'HISTORY', label: 'History' },
  { id: 'PLAYBACK', label: 'Playback' },
];

/** S04 · Satellite health — live values, parameter history and pass playback for one satellite, in one place. */
export const SatelliteHealth: React.FC<{ satId: string; tab?: string; mode?: string; param?: string; popout?: boolean; onNavigate: (to: string) => void }> = ({
  satId, tab, mode: initialMode, param: initialParam, popout, onNavigate,
}) => {
  const [mode, setMode] = useState<Mode>((MODES.find((m) => m.id === initialMode?.toUpperCase())?.id) ?? 'LIVE');
  const [histParam, setHistParam] = useState(initialParam ?? 'BAT_TEMP');
  const satellites = useFleetStore((s) => s.satellites);
  const cvtAll = useFleetStore((s) => s.cvt);
  const cvt = useMemo(() => cvtAll[satId] ?? {}, [cvtAll, satId]);
  const windows = useFleetStore((s) => s.contactWindows);

  const sat = satellites[satId];
  const now = Date.now();
  const mine = windows.filter((w) => w.sat_id === satId);
  const lastWin = [...mine].filter((w) => Date.parse(w.los_utc) <= now).sort((a, b) => Date.parse(b.los_utc) - Date.parse(a.los_utc))[0];
  const nextWin = [...mine].filter((w) => Date.parse(w.los_utc) > now).sort((a, b) => Date.parse(a.aos_utc) - Date.parse(b.aos_utc))[0];
  const inContact = Boolean(nextWin && Date.parse(nextWin.aos_utc) <= now);
  const lastContact = sat?.last_contact_utc ?? lastWin?.los_utc ?? null;

  // Playback can never be mistaken for live: the whole console switches to PLAYBACK while this tab is open.
  const setConsoleMode = useUIStore((s) => s.setMode);
  const playback = mode === 'PLAYBACK';
  useEffect(() => {
    if (!playback) return;
    setConsoleMode('PLAYBACK');
    return () => { if (useUIStore.getState().mode === 'PLAYBACK') setConsoleMode('LIVE'); };
  }, [playback, setConsoleMode]);

  const openParam = (id: string) => { setHistParam(id); setMode('HISTORY'); };
  const go = (id: string) => onNavigate(`satellite?sat=${id}${popout ? '&win=1' : ''}`);

  return (
    <>
      <PageHead
        title={satId}
        sub={sat ? `${sat.name} · ${sat.constellation_group} · ${sat.altitude_km} km ${sat.orbit_regime}` : 'Unknown satellite'}
        actions={
          <>
            <select value={satId} onChange={(e) => go(e.target.value)} aria-label="Satellite"
              className="h-9 bg-[#0A1018] border border-[#2A3B52] rounded-md px-2.5 font-mono-code text-[13px] outline-none focus:border-[#2DCCFF]">
              {FLEET.map((s) => <option key={s.sat_id} value={s.sat_id}>{s.sat_id}</option>)}
            </select>
            {!popout && (
              <Button variant="secondary" onClick={() => openSatelliteWindow(satId)} title="Open this satellite in its own window">
                <ExternalLink size={15} /> New window
              </Button>
            )}
            <Button variant="secondary" onClick={() => onNavigate('procedure')} disabled={playback} title={playback ? 'Commanding is disabled in playback' : undefined}><ListChecks size={16} /> Run procedure</Button>
            <Button onClick={() => onNavigate(`command?sat=${satId}`)} disabled={playback} title={playback ? 'Commanding is disabled in playback' : undefined}><Terminal size={16} /> Send command</Button>
          </>
        }
      />

      {/* Context bar: only last and next contact; the full picture is in the timeline below. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-[#2A3B52] bg-[#111A25] px-3.5 py-2.5 mb-3 text-[12.5px]">
        <span className="flex items-center gap-2">
          <StatusBadge status={sat?.health_state ?? 'NO_DATA'} size="sm" />
          <StatusBadge status={inContact ? 'AOS' : 'LOS'} size="sm" />
        </span>
        <span className="text-[#A3B1C2]">Last contact <span className="font-mono-code text-[#E6EDF3] tabular-nums">{lastContact ? formatUTC(lastContact, 'HH:mm:ss') : '—'}</span>{lastWin && <span className="text-[#8496AB]"> · {lastWin.ground_station}</span>}</span>
        <span className="text-[#A3B1C2]">Next contact <span className="font-mono-code text-[#E6EDF3] tabular-nums">{nextWin ? formatUTC(nextWin.aos_utc, 'HH:mm:ss') : sat?.next_contact_utc ? formatUTC(sat.next_contact_utc, 'HH:mm:ss') : '—'}</span>{nextWin && <span className="text-[#8496AB]"> · {nextWin.ground_station}</span>}</span>
        <span className="text-[#A3B1C2] ml-auto">Dictionary <span className="font-mono-code text-[#4DACFF]">{sat?.mib_version ?? '—'}</span></span>
      </div>

      {sat && <ContactTimeline sat={sat} />}

      <div className="flex items-center gap-1 border-b border-[#2A3B52] mb-4" role="tablist" aria-label="Satellite health mode">
        {MODES.map((m) => (
          <button key={m.id} role="tab" aria-selected={mode === m.id} onClick={() => setMode(m.id)}
            className={clsx('px-4 py-2.5 text-[13px] font-semibold border-b-2 -mb-px', mode === m.id ? 'text-[#E6EDF3] border-[#4DACFF]' : 'text-[#A3B1C2] border-transparent hover:text-[#E6EDF3]')}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
        <div className="min-w-0">
          {mode === 'LIVE' && <ParamViews satId={satId} cvt={cvt} initialSubsystem={tab} onOpenParam={openParam} />}
          {mode === 'HISTORY' && <ParameterDetail satId={satId} paramId={histParam} onNavigate={onNavigate} embedded />}
          {mode === 'PLAYBACK' && sat && <PlaybackPanel sat={sat} cvt={cvt} onOpenParam={openParam} />}
        </div>

        <div className="flex flex-col gap-4 xl:sticky xl:top-0">
          <Card title="Alarms"><AlarmPanel onNavigateParam={(_s, p) => openParam(p)} /></Card>
          <SatOpsPanel satId={satId} />
        </div>
      </div>
    </>
  );
};
