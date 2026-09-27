import React from 'react';
import { clsx } from 'clsx';
import { Card, KpiTile, PageHead } from '../../components/molecules/Page';
import { STATIONS } from '../../data/fleet';

const STATE_CLS = {
  AVAILABLE: 'border-[#56F000]/60 bg-[#56F000]/12 text-[#56F000]',
  DEGRADED: 'border-[#FCE83A]/60 bg-[#FCE83A]/12 text-[#FCE83A]',
  MAINTENANCE: 'border-[#3E5370]/60 bg-[#3E5370]/20 text-[#A3B1C2]',
};

/** S10 · Ground stations — catalogue, provider performance and cost. */
export const GroundStations: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => (
  <>
    <PageHead title="Ground stations" sub="Credentials are never displayed; they live in OpenBao (BR-S10-01)" />

    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      <KpiTile value={STATIONS.length} label="Stations" />
      <KpiTile value={STATIONS.filter((s) => s.state === 'AVAILABLE').length} label="Available" tone="ok" />
      <KpiTile value={STATIONS.filter((s) => s.state === 'DEGRADED').length} label="Degraded" tone="warn" />
      <KpiTile value={STATIONS.filter((s) => s.state === 'MAINTENANCE').length} label="Maintenance" />
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {STATIONS.map((s) => (
        <Card key={s.id}>
          <div className="flex items-start justify-between mb-3">
            <div className="flex flex-col">
              <span className="text-[14px] font-bold">{s.name}</span>
              <span className="text-[12px] text-[#A3B1C2]">{s.provider} · {s.bands.join('/')}-band</span>
            </div>
            <span className={clsx('inline-flex items-center rounded-full border px-2 h-5 font-mono-code text-[10.5px] font-bold', STATE_CLS[s.state])}>
              {s.state}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-3">
            <div>
              <div className="font-display-title text-[24px] font-bold tabular-nums">{s.availability_pct}</div>
              <div className="text-[11px] text-[#A3B1C2]">Availability %</div>
            </div>
            <div>
              <div className={clsx('font-display-title text-[24px] font-bold tabular-nums', s.quality_pct === 0 ? 'text-[#5F7087]' : '')}>
                {s.quality_pct || '—'}
              </div>
              <div className="text-[11px] text-[#A3B1C2]">Quality %</div>
            </div>
            <div>
              <div className="font-display-title text-[24px] font-bold tabular-nums">{s.cost_per_min_usd.toFixed(2)}</div>
              <div className="text-[11px] text-[#A3B1C2]">$ / min</div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[12px] border-t border-[#213044] pt-2.5">
            <span className="font-mono-code text-[12.5px] text-[#4DACFF]">{s.protocol}</span>
            <span className={clsx(s.adapter_health === 'OK' ? 'text-[#56F000]' : s.adapter_health === 'DEGRADED' ? 'text-[#FCE83A]' : 'text-[#FF3838]')}>
              Adapter {s.adapter_health}
            </span>
            <button onClick={() => onNavigate(`schedule?station=${s.id}`)} className="text-[#4DACFF] hover:underline">Passes</button>
          </div>
        </Card>
      ))}
    </div>
  </>
);
