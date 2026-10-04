import React, { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Lock, Unlock, X } from 'lucide-react';
import type { Satellite } from '../../types';
import { StatusBadge } from '../atoms/Badge';
import { STATIONS } from '../../data/fleet';
import { useFleetStore } from '../../store/useFleetStore';
import { useAlarmStore } from '../../store/useAlarmStore';
import { betaAngleDeg, isSunlit, lookAngles, passes, propagate } from '../../orbit/orbit';
import { satElements } from '../../orbit/fleetOrbit';

interface Props {
  sat: Satellite & { tenant?: string };
  /** Simulation clock in ms (the globe can run faster than real time). */
  getMs: () => number;
  locked: boolean;
  /** Following only works on the 3D globe. */
  canLock?: boolean;
  observing: boolean;
  onToggleObserve: () => void;
  /** Colour this satellite is drawn with on the globe. */
  color: string;
  onToggleLock: () => void;
  onClose: () => void;
  onOpen: () => void;
}

const hemi = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? pos : neg}`;
const hms = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s >= 3600 ? `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
};

const Row: React.FC<{ k: string; v: React.ReactNode; tone?: string }> = ({ k, v, tone }) => (
  <div className="flex items-baseline justify-between gap-3">
    <span className="text-[#7C8594]">{k}</span>
    <span className={`font-semibold tabular-nums text-right ${tone ?? 'text-[#E9ECF1]'}`}>{v}</span>
  </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="flex flex-col gap-1 pt-2 border-t border-[#1A1E27]">
    <span className="text-[12px] text-[#7C8594] font-sans">{title}</span>
    {children}
  </div>
);

/** Everything the console knows about one satellite: where it is, its orbit, who can see it, and how it is doing. */
export const SatelliteDetailCard: React.FC<Props> = ({ sat, getMs, locked, canLock = true, observing, onToggleObserve, color, onToggleLock, onClose, onOpen }) => {
  const [, force] = useState(0);
  useEffect(() => { const t = window.setInterval(() => force((n) => n + 1), 1000); return () => clearInterval(t); }, []);

  const cvt = useFleetStore((s) => s.cvt[sat.sat_id]);
  const alarms = useAlarmStore((s) => s.active.filter((a) => a.sat_id === sat.sat_id && a.state !== 'RTN'));

  const el = useMemo(() => satElements(sat), [sat]);
  const ms = getMs();
  const st = propagate(el, ms);
  const sunlit = isSunlit(st, ms);
  const beta = betaAngleDeg(st, ms);

  // Passes are searched once a minute of wall time, not every second.
  const minuteKey = Math.floor(Date.now() / 60_000);
  const upcoming = useMemo(() => {
    return sat.assigned_ground_stations.flatMap((id) => {
      const station = STATIONS.find((s) => s.id === id);
      if (!station) return [];
      return passes(el, station, Date.now() - 20 * 60_000, 8 * 3600_000, 10, 60_000)
        .filter((p) => p.los > Date.now())
        .slice(0, 1).map((p) => ({ id, name: station.name, ...p }));
    }).sort((a, b) => a.aos - b.aos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el, sat.assigned_ground_stations, minuteKey]);

  const views = STATIONS.map((s) => ({ s, ...lookAngles(st, s) })).filter((v) => v.elevationDeg > 0).sort((a, b) => b.elevationDeg - a.elevationDeg);
  const nearest = STATIONS.map((s) => ({ s, ...lookAngles(st, s) })).sort((a, b) => a.rangeKm - b.rangeKm)[0];

  const val = (id: string, digits = 1, unit = '') => {
    const p = cvt?.[id];
    return p ? `${p.eu_value.toFixed(digits)}${unit}` : '—';
  };
  const tone = (id: string) => { const a = cvt?.[id]?.alarm_state; return a === 2 ? 'text-[#FF6B6B]' : a === 1 ? 'text-[#F5C451]' : undefined; };
  const ago = (iso: string | null) => (iso ? hms(Date.now() - Date.parse(iso)) + ' ago' : '—');

  return (
    <div className="absolute top-[60px] left-3 z-20 w-[320px] max-w-[calc(100%-24px)] max-h-[calc(100%-120px)] overflow-y-auto bg-[#11141B]/95 border border-[#232936] rounded-2xl text-[11.5px] font-mono-code text-[#E9ECF1] shadow-2xl flex flex-col gap-2 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-[14px] font-bold flex items-center gap-2"><i className="w-3 h-3 rounded-full" style={{ background: color }} />{sat.sat_id}</span>
          <span className="text-[11px] text-[#7C8594] truncate">{sat.name} · {sat.constellation_group} · {sat.orbit_regime}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <StatusBadge status={sat.health_state} size="sm" />
          <button onClick={onToggleObserve} aria-pressed={observing} aria-label={observing ? 'Show all satellites' : 'Observe only this satellite'}
            title={observing ? 'Show all satellites' : 'Observe only this satellite (hide the rest)'}
            className={`w-6 h-6 rounded flex items-center justify-center ${observing ? 'bg-[#232936] text-white' : 'text-[#9AA3B2] hover:bg-[#1A1E27]'}`}>
            {observing ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
          {canLock && <button onClick={onToggleLock} aria-label={locked ? 'Unlock camera' : 'Lock camera on satellite'} title={locked ? 'Unlock camera' : 'Follow with camera'}
            className={`w-6 h-6 rounded flex items-center justify-center ${locked ? 'bg-[#232936] text-white' : 'text-[#9AA3B2] hover:bg-[#1A1E27]'}`}>
            {locked ? <Lock size={13} /> : <Unlock size={13} />}
          </button>}
          <button onClick={onClose} aria-label="Close" className="w-6 h-6 rounded flex items-center justify-center text-[#9AA3B2] hover:bg-[#1A1E27]"><X size={14} /></button>
        </div>
      </div>

      <Section title="Position at sim time">
        <Row k="Latitude" v={hemi(st.lat, 'N', 'S')} />
        <Row k="Longitude" v={hemi(st.lon, 'E', 'W')} />
        <Row k="Altitude" v={`${st.altKm.toFixed(1)} km`} />
        <Row k="Velocity" v={`${st.speedKms.toFixed(2)} km/s`} />
        <Row k="Orbit number" v={`#${st.orbitNumber.toLocaleString()}`} />
        <Row k="True anomaly" v={`${st.trueAnomalyDeg.toFixed(1)}°`} />
      </Section>

      <Section title="Orbit">
        <Row k="Period" v={`${(2 * Math.PI / Math.sqrt(3.986004418e14 / el.a ** 3) / 60).toFixed(1)} min`} />
        <Row k="Inclination" v={`${sat.inclination_deg.toFixed(1)}°`} />
        <Row k="RAAN (epoch)" v={`${sat.raan_deg.toFixed(1)}°`} />
        <Row k="Eccentricity" v={sat.eccentricity.toFixed(4)} />
        <Row k="Arg. of perigee" v={`${sat.arg_of_perigee_deg.toFixed(1)}°`} />
        <Row k="Apogee / perigee" v={`${sat.apogee_km.toFixed(0)} / ${sat.perigee_km.toFixed(0)} km`} />
      </Section>

      <Section title="Environment">
        <Row k="Sun" v={sunlit ? 'Sunlit' : 'Eclipse'} tone={sunlit ? 'text-[#F5C451]' : 'text-[#6CB8FF]'} />
        <Row k="Beta angle" v={`${beta.toFixed(1)}°`} />
      </Section>

      <Section title="Contact · real time">
        <Row k="Nearest station" v={`${nearest.s.id} · ${nearest.rangeKm.toFixed(0)} km`} />
        <Row k="In view of" v={views.length ? views.map((v) => `${v.s.id} ${v.elevationDeg.toFixed(0)}°`).join(', ') : 'no station'} tone={views.length ? 'text-[#4ADE9A]' : undefined} />
        {upcoming.slice(0, 3).map((p) => {
          const live = p.aos <= Date.now();
          return (
            <Row key={p.id} k={`${p.id} ${live ? 'LOS in' : 'AOS in'}`}
              v={`${hms(live ? p.los - Date.now() : p.aos - Date.now())} · max ${Math.round(p.maxElevationDeg)}°`} tone={live ? 'text-[#4ADE9A]' : undefined} />
          );
        })}
        <Row k="Last contact" v={ago(sat.last_contact_utc)} />
        <Row k="Stations" v={sat.assigned_ground_stations.join(' · ')} />
      </Section>

      <Section title="Live telemetry">
        <Row k="Battery" v={val('BAT_SOC', 0, ' %')} tone={tone('BAT_SOC')} />
        <Row k="Battery temp" v={val('BAT_TEMP', 1, ' °C')} tone={tone('BAT_TEMP')} />
        <Row k="Bus voltage" v={val('BUS_VOLTAGE', 2, ' V')} tone={tone('BUS_VOLTAGE')} />
        <Row k="Array current" v={val('ARRAY_I', 2, ' A')} tone={tone('ARRAY_I')} />
        <Row k="Attitude error" v={val('ATT_ERR', 3, ' °')} tone={tone('ATT_ERR')} />
        <Row k="Downlink RSSI" v={val('RSSI', 1, ' dBm')} tone={tone('RSSI')} />
        <Row k="Open alarms" v={alarms.length} tone={alarms.length ? 'text-[#F5C451]' : 'text-[#4ADE9A]'} />
      </Section>

      <Section title="Platform">
        <Row k="Operator" v={sat.tenant ?? '—'} />
        <Row k="Dictionary" v={sat.mib_version} tone="text-[#6CB8FF]" />
      </Section>

      <button onClick={onOpen} className="w-full h-10 rounded-[10px] bg-[#F28C28] hover:bg-[#F59A45] text-[#1A0E02] text-[13.5px] font-semibold font-sans">
        Open {sat.sat_id}
      </button>
    </div>
  );
};
