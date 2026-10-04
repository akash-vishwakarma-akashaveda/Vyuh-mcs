import React from 'react';
import { clsx } from 'clsx';
import { Pill } from '../../components/atoms/Badge';
import { Card, KpiRow, KpiTile, PageHead } from '../../components/molecules/Page';
import { STATIONS } from '../../data/fleet';
import { useFleetStore } from '../../store/useFleetStore';
import { RouteLink, setHashParams, useHashParams, utc } from '../commanding/gates';

const STATE_TONE = { AVAILABLE: 'ok', DEGRADED: 'warn', MAINTENANCE: 'neutral' } as const;
const ADAPTER_TONE = { OK: 'ok', DEGRADED: 'warn', DOWN: 'crit' } as const;

/** S10 · Ground stations: catalogue, provider performance and cost. `?station=` focuses one. */
export const GroundStations: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => {
  const params = useHashParams();
  const focus = STATIONS.find((s) => s.id === params.station)?.id;
  const windows = useFleetStore((s) => s.contactWindows);
  const now = Date.now();

  return (
    <>
      <PageHead title="Ground stations" sub="Credentials are never displayed; they live in OpenBao (BR-S10-01)"
        actions={<RouteLink as="button" to="network" onNavigate={onNavigate}>Ground network and bookings</RouteLink>} />

      <KpiRow>
        <KpiTile label="Stations" value={STATIONS.length} />
        <KpiTile label="Available" value={STATIONS.filter((s) => s.state === 'AVAILABLE').length} tone="ok" />
        <KpiTile label="Degraded" value={STATIONS.filter((s) => s.state === 'DEGRADED').length} tone="warn" />
        <KpiTile label="Maintenance" value={STATIONS.filter((s) => s.state === 'MAINTENANCE').length} />
      </KpiRow>

      {focus && <p className="text-[13px] text-[#9AA3B2] mb-3">Showing {STATIONS.find((s) => s.id === focus)?.name}. <button type="button" className="text-[#F2A65A] hover:text-[#FFC48A]" onClick={() => setHashParams({ station: undefined })}>Show all stations</button></p>}

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {STATIONS.filter((s) => !focus || s.id === focus).map((s) => {
          const next = windows.filter((w) => w.ground_station === s.id && Date.parse(w.los_utc) > now).sort((a, b) => Date.parse(a.aos_utc) - Date.parse(b.aos_utc));
          const inPass = next.find((w) => Date.parse(w.aos_utc) <= now);
          return (
            <Card key={s.id} className={clsx(focus === s.id && 'border-[#2F3A4F]')}>
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[15px] font-medium">{s.name} <span className="font-mono-code text-[12.5px] text-[#7C8594]">{s.id}</span></span>
                  <span className="text-[12.5px] text-[#9AA3B2]">{s.provider} · {s.bands.join('/')}-band · {s.protocol}</span>
                </div>
                <Pill tone={STATE_TONE[s.state]} glyph={s.state === 'AVAILABLE' ? 'normal' : s.state === 'DEGRADED' ? 'caution' : 'off'}>{s.state.charAt(0) + s.state.slice(1).toLowerCase()}</Pill>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {[[`${s.availability_pct}`, 'Availability %'], [s.quality_pct ? `${s.quality_pct}` : '—', 'Quality %'], [`$${s.cost_per_min_usd.toFixed(2)}`, 'per minute']].map(([v, l]) => (
                  <div key={l} className="rounded-xl bg-[#161A22] px-3 py-2.5"><div className="text-[22px] font-semibold tracking-[-0.02em]">{v}</div><div className="text-[12px] text-[#7C8594]">{l}</div></div>
                ))}
              </div>
              <div className="flex flex-col gap-1 text-[12.5px] text-[#9AA3B2] mb-3">
                <span className="flex items-center gap-2">Adapter <Pill tone={ADAPTER_TONE[s.adapter_health]}>{s.adapter_health === 'OK' ? 'Healthy' : s.adapter_health.charAt(0) + s.adapter_health.slice(1).toLowerCase()}</Pill></span>
                <span>{inPass ? <>In a pass with <span className="font-mono-code text-[#E9ECF1]">{inPass.sat_id}</span> until {utc(inPass.los_utc, false)}</> : next[0] ? <>Next pass <span className="font-mono-code text-[#E9ECF1]">{next[0].sat_id}</span> at {utc(next[0].aos_utc, false)} UTC</> : 'No pass in the next 12 h'} · {next.length} in 12 h</span>
              </div>
              <div className="flex flex-wrap gap-3 pt-3 border-t border-[#1A1E27]">
                <RouteLink to={`schedule?station=${s.id}`} onNavigate={onNavigate}>Passes</RouteLink>
                {inPass && <RouteLink to={`pass?sat=${inPass.sat_id}`} onNavigate={onNavigate}>Live pass</RouteLink>}
                <RouteLink to={`network?station=${s.id}&book=1`} onNavigate={onNavigate}>Book</RouteLink>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
};
