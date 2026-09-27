import React, { useState } from 'react';
import { clsx } from 'clsx';
import { Button } from '../../components/atoms/Button';
import { Banner, Card, KpiTile, PageHead, Td, Th } from '../../components/molecules/Page';
import { PASSES, STATIONS } from '../../data/fleet';
import { PassState } from '../../types';
import { PASS_ACTIONS, PassActionId, usePassConfigStore } from '../../store/usePassConfigStore';
import { PassStateConfigDialog } from '../../components/organisms/PassStateConfigDialog';
import { toast } from '../../store/useToastStore';

const LIFECYCLE: PassState[] = ['SCHEDULED', 'PREPARING', 'READY', 'ACTIVE', 'DRAINING', 'COMPLETE'];

/** S08 · Live pass monitor. */
export const LivePassMonitor: React.FC<{ onNavigate: (to: string) => void; satId?: string; sessionId?: string }> = ({ onNavigate, satId, sessionId }) => {
  const cfg = usePassConfigStore((s) => s.config);
  const [configOpen, setConfigOpen] = useState(false);
  const pass =
    PASSES.find((p) => p.session_id === sessionId) ??
    PASSES.find((p) => (satId ? p.sat_id === satId : p.state === 'ACTIVE')) ??
    PASSES[0];
  const station = STATIONS.find((s) => s.id === pass.station_id);
  const at = LIFECYCLE.indexOf(pass.state);

  const elapsed = Math.round((Date.now() - Date.parse(pass.aos_utc)) / 1000);
  const total = Math.round((Date.parse(pass.los_utc) - Date.parse(pass.aos_utc)) / 1000);
  const frac = Math.min(1, Math.max(0, elapsed / total));

  return (
    <>
      <PageHead
        title={`${pass.sat_id} · ${station?.name}`}
        sub={`Session ${pass.session_id}`}
        actions={
          <>
            <select value={pass.session_id} onChange={(e) => onNavigate(`pass?session=${e.target.value}`)} aria-label="Pass session"
              className="h-9 bg-[#0A1018] border border-[#2A3B52] rounded-[2px] px-2.5 font-mono-code text-[13px] outline-none focus:border-[#2DCCFF]">
              {PASSES.map((p) => (
                <option key={p.session_id} value={p.session_id}>
                  {p.sat_id} · {p.station_id} · {cfg[p.state].label}
                </option>
              ))}
            </select>
            <Button variant="secondary" onClick={() => setConfigOpen(true)}>Configure states</Button>
            <Button variant="secondary" onClick={() => onNavigate('schedule')}>Schedule</Button>
            <Button variant="secondary" onClick={() => onNavigate(`report?session=${pass.session_id}`)}>Pass report</Button>
          </>
        }
      />

      {pass.standby_gateway === 'TAKEOVER' && (
        <Banner kind="warn" lead="Standby takeover.">Primary gateway lost; standby took over. Target is under 30 s (Q-10).</Banner>
      )}

      {/* Session lifecycle stepper */}
      <div className="flex gap-2 mb-4">
        {LIFECYCLE.map((s, i) => (
          <div key={s} className="flex-1 min-w-[96px]">
            <div className={clsx('h-1 rounded-full mb-1.5', i < at ? 'bg-[#4DACFF]' : i === at ? 'bg-[#2DCCFF]' : 'bg-[#2A3B52]')} />
            <span className={clsx('text-[11.5px]', i === at ? 'font-bold text-[#E6EDF3]' : 'text-[#A3B1C2]')} title={cfg[s].description}>{cfg[s].label}</span>
          </div>
        ))}
      </div>

      <Card title={`${cfg[pass.state].label} — what you can do now`} className="mb-4">
        <p className="text-[12.5px] text-[#A3B1C2] mb-3">{cfg[pass.state].description}</p>
        <div className="flex flex-wrap gap-2">
          {cfg[pass.state].actions.map((a: PassActionId) => {
            const act = PASS_ACTIONS[a] as { label: string; route?: string };
            return (
              <Button key={a} size="sm" variant="secondary"
                onClick={() => act.route
                  ? onNavigate(a === 'report' ? `report?session=${pass.session_id}` : a === 'sendCommands' ? `uplink?sat=${pass.sat_id}` : act.route)
                  : toast.info(act.label, { body: `Demo: no backend behind this action yet (${pass.session_id}).` })}>
                {act.label.split(' (')[0]}
              </Button>
            );
          })}
          {cfg[pass.state].actions.length === 0 && <span className="text-[12.5px] text-[#8496AB]">No actions are enabled for this state.</span>}
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <KpiTile value={pass.frames_per_s} label="Frames / s" tone="info" />
        <KpiTile value={pass.spool_depth} label="Spool depth" sub="write-ahead, Q-06" />
        <KpiTile value={pass.gaps} label="Gaps" tone={pass.gaps ? 'warn' : 'ok'} sub="backfill opens automatically" />
        <KpiTile value={`${pass.e2e_latency_p99_ms} ms`} label="E2E latency P99" tone={pass.e2e_latency_p99_ms < 100 ? 'ok' : 'warn'} sub="budget 100 ms (Q-01)" />
        <KpiTile value={`${pass.max_elevation_deg}°`} label="Max elevation" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
        <div className="flex flex-col gap-4">
          <Card title="Elevation">
            <svg viewBox="0 0 400 120" className="w-full h-[120px]" role="img" aria-label="Elevation arc with AOS, TCA and LOS">
              <path d="M20 110 Q200 -10 380 110" fill="none" stroke="#2A3B52" strokeWidth="1.5" />
              <circle cx={20 + 360 * frac} cy={110 - Math.sin(Math.PI * frac) * 105} r="4.2" fill="#2DCCFF" />
              <text x="20" y="118" fill="#A3B1C2" fontSize="10">AOS</text>
              <text x="190" y="14" fill="#A3B1C2" fontSize="10">TCA</text>
              <text x="362" y="118" fill="#A3B1C2" fontSize="10">LOS</text>
            </svg>
            <div className="flex justify-between font-mono-code text-[12px] text-[#A3B1C2]">
              <span>{pass.aos_utc.slice(11, 19)}</span>
              <span className="text-[#E6EDF3]">{station?.protocol} · {station?.provider}</span>
              <span>{pass.los_utc.slice(11, 19)}</span>
            </div>
          </Card>

          <Card title="Virtual channels">
            <div className="overflow-x-auto -m-3.5">
              <table className="w-full border-collapse">
                <thead><tr><Th>VCID</Th><Th>Content</Th><Th>Frames / s</Th><Th>Gaps</Th><Th>Backfill source</Th></tr></thead>
                <tbody>
                  {pass.virtual_channels.length === 0 && <tr><Td className="text-[#A3B1C2]">No channels — pass not started.</Td><Td>{''}</Td><Td>{''}</Td><Td>{''}</Td><Td>{''}</Td></tr>}
                  {pass.virtual_channels.map((vc) => (
                    <tr key={vc.vcid}>
                      <Td className="font-mono-code">{vc.vcid}</Td>
                      <Td>{vc.name}</Td>
                      <Td className="tabular-nums">{vc.frames_per_s}</Td>
                      <Td className={vc.gaps ? 'text-[#FCE83A] tabular-nums' : 'tabular-nums'}>{vc.gaps}</Td>
                      <Td className="text-[#A3B1C2]">{vc.backfill}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card title="Standby gateway">
            <div className="flex items-center gap-2">
              <span className={clsx('w-2 h-2 rounded-full', pass.standby_gateway === 'READY' ? 'bg-[#56F000]' : pass.standby_gateway === 'TAKEOVER' ? 'bg-[#FCE83A]' : 'bg-[#3E5370]')} />
              <span className="text-[13px]">{pass.standby_gateway}</span>
            </div>
            <p className="text-[12px] text-[#A3B1C2] mt-2">Zone loss must not open a pass gap longer than 30 s (Q-10).</p>
          </Card>

          <Card title="Latency budget">
            {[['Link Gateway', 18], ['Frame Processor', 21], ['TM Processor', 24], ['Realtime + render', 13]].map(([label, ms]) => (
              <div key={label as string} className="mb-2.5">
                <div className="flex justify-between text-[12px] mb-1">
                  <span>{label}</span><span className="tabular-nums text-[#A3B1C2]">{ms} ms</span>
                </div>
                <div className="h-1.5 rounded-full bg-[#172434]">
                  <div className="h-full rounded-full bg-[#2DCCFF]" style={{ width: `${(ms as number)}%` }} />
                </div>
              </div>
            ))}
            <p className="text-[12px] text-[#A3B1C2]">Total {pass.e2e_latency_p99_ms} ms of the 100 ms budget.</p>
          </Card>

          <Card title="COP-1">
            <Button variant="secondary" onClick={() => onNavigate(`uplink?sat=${pass.sat_id}`)}>Open Uplink &amp; COP-1</Button>
          </Card>
        </div>
      </div>
      {configOpen && <PassStateConfigDialog onClose={() => setConfigOpen(false)} />}
    </>
  );
};
