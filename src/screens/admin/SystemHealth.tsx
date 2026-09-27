import React, { useState } from 'react';
import { clsx } from 'clsx';
import { Button } from '../../components/atoms/Button';
import { Banner, Card, KpiTile, PageHead, Td, Th } from '../../components/molecules/Page';
import { MODULES, SLOS, ZONES } from '../../data/mission';
import { PASSES } from '../../data/fleet';

const DOMAINS = ['Ground link', 'Telemetry', 'Commanding', 'Mission ops', 'Intelligence', 'Experience', 'Security'];

const STATE_CLS = {
  HEALTHY: 'border-[#56F000]/50 bg-[#56F000]/[0.10] text-[#56F000]',
  DEGRADED: 'border-[#FCE83A]/60 bg-[#FCE83A]/[0.12] text-[#FCE83A]',
  DOWN: 'border-[#D42C2C]/60 bg-[#D42C2C]/16 text-[#FF3838]',
};

/** S27 · Platform health — all 31 modules, Kafka lag, zones and SLOs. */
export const SystemHealth: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => {
  const [domain, setDomain] = useState<string>('All domains');
  const [drill, setDrill] = useState(false);

  const modules = MODULES.filter((m) => domain === 'All domains' || m.domain === domain);
  const degraded = MODULES.filter((m) => m.state !== 'HEALTHY');
  const lagging = [...MODULES].filter((m) => m.lag > 0).sort((a, b) => b.lag - a.lag);
  // Q-15: a booked pass in progress freezes deploys.
  const freeze = PASSES.some((p) => p.state === 'ACTIVE');

  return (
    <>
      <PageHead
        title="Platform health"
        sub={`${MODULES.length} modules · 3 zones + DR region`}
        actions={
          <>
            <select value={domain} onChange={(e) => setDomain(e.target.value)} aria-label="Filter by domain"
              className="h-9 bg-[#0A1018] border border-[#2A3B52] rounded-[2px] px-2.5 text-[13px] outline-none focus:border-[#2DCCFF]">
              {['All domains', ...DOMAINS].map((d) => <option key={d}>{d}</option>)}
            </select>
            <Button variant="secondary" onClick={() => setDrill((v) => !v)}>Zone failover drill</Button>
          </>
        }
      />

      {freeze && (
        <Banner kind="info" lead="Deploy frozen."
          action={<Button size="sm" variant="secondary" onClick={() => onNavigate('pass')}>Open live pass</Button>}>
          A pass is in progress. Argo CD sync windows come from the pass calendar, so no critical deploy runs until LOS.
        </Banner>
      )}
      {drill && (
        <Banner kind="warn" lead="Drill running.">
          ap-south-1c drained. Standby gateways took over; the measured telemetry gap was 11 s against a 30 s budget.
        </Banner>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        {SLOS.map((s) => (
          <KpiTile key={s.name} value={s.value} label={s.name} sub={`target ${s.target} · budget ${s.budget} %`}
            tone={s.ok ? 'ok' : 'crit'} onClick={s.ok ? undefined : () => onNavigate('oncall')} />
        ))}
      </div>

      {!SLOS.every((s) => s.ok) && (
        <Banner kind="crit" lead="Error budget exhausted.">
          History query P95 is 2.31 s against a 500 ms target. Runbook: TM Archive &amp; Query — cold partition scan.
        </Banner>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
        <div className="flex flex-col gap-4 min-w-0">
          <Card title={`Services · ${modules.length}`}>
            <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-4 gap-2">
              {modules.map((m) => (
                <div key={m.name} className={clsx('border rounded px-3 py-2.5 flex flex-col gap-1', STATE_CLS[m.state])}>
                  <span className="text-[13px] font-bold text-[#E6EDF3] leading-tight">{m.name}</span>
                  <span className="text-[11px] text-[#A3B1C2]">{m.domain}</span>
                  <span className="flex items-center justify-between font-mono-code text-[11px]">
                    <span>{m.replicas}</span>
                    <span>{m.state}</span>
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Kafka consumer lag">
            <table className="w-full border-collapse">
              <thead><tr><Th>Consumer group</Th><Th>Domain</Th><Th>Lag (messages)</Th></tr></thead>
              <tbody>
                {lagging.map((m) => (
                  <tr key={m.name}>
                    <Td className="font-mono-code text-[12.5px] text-[#4DACFF]">{m.name.toLowerCase().replace(/[^a-z]+/g, '-')}</Td>
                    <Td className="text-[#A3B1C2]">{m.domain}</Td>
                    <Td className={clsx('tabular-nums', m.lag > 1000 ? 'text-[#FCE83A]' : '')}>{m.lag.toLocaleString()}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card title="Zones and DR">
            {ZONES.map((z) => (
              <div key={z.name} className="flex items-center justify-between py-2 border-b border-[#213044] last:border-0 text-[13px]">
                <span className="font-mono-code text-[12.5px]">{z.name}</span>
                <span className="text-[#A3B1C2]">{z.role}</span>
                <span className={z.state === 'HEALTHY' ? 'text-[#56F000]' : 'text-[#FCE83A]'}>{z.state}</span>
              </div>
            ))}
            <p className="text-[12px] text-[#A3B1C2] mt-2.5">Region loss: RTO 15 min, RPO 1 min — zero for commands and audit.</p>
          </Card>

          <Card title={`Attention · ${degraded.length}`}>
            {degraded.length === 0 && <p className="text-[13px] text-[#A3B1C2]">Everything nominal.</p>}
            {degraded.map((m) => (
              <div key={m.name} className="flex flex-col gap-0.5 py-2 border-b border-[#213044] last:border-0">
                <span className="text-[13px] font-bold">{m.name}</span>
                <span className="text-[12px] text-[#A3B1C2]">{m.replicas} replicas · {m.state.toLowerCase()}</span>
              </div>
            ))}
          </Card>

          <Card title="Deploy freeze">
            <div className="flex items-center gap-2 text-[13px]">
              <span className={clsx('w-2 h-2 rounded-full', freeze ? 'bg-[#2DCCFF]' : 'bg-[#56F000]')} />
              <span>{freeze ? 'Frozen — pass in progress' : 'Open — no pass in progress'}</span>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
};
