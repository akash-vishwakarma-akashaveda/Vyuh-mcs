import React, { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Button } from '../../components/atoms/Button';
import { Pill } from '../../components/atoms/Badge';
import { Banner, Card, Meter, PageHead, SampleTag, Td, Th, Tile } from '../../components/molecules/Page';
import { Modal } from '../../components/molecules/Modal';
import { MODULES, SLOS, ZONES } from '../../data/mission';
import { PASSES } from '../../demo/scenario';
import { SERVICES, errOf, inOf, usePlatformStore } from '../../store/usePlatformStore';
import { useAuthStore } from '../../store/useAuthStore';
import { can, canOpenRoute, whoCanOpen } from '../../auth/policy';
import { utc } from '../../store/govern';
import { Select } from '../../components/molecules/Select';

const POLL_MS = 5000;
const n = (v: number | undefined, digits = 0) =>
  v === undefined || !Number.isFinite(v) ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: v < 10 ? Math.max(digits, 1) : digits });

/** S27 · Platform — the ground segment services, from the pipeline's own counters when the backend answers. */
export const SystemHealth: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => {
  const { source, snap, at, prev, prevAt, error, poll, drills, startDrill, abortDrill } = usePlatformStore();
  const role = useAuthStore((s) => s.activeRole);
  const admin = can('platform:admin', role);
  const [confirmZone, setConfirmZone] = useState<string | null>(null);
  const [zone, setZone] = useState(ZONES[2].name);

  useEffect(() => {
    poll();
    const t = window.setInterval(poll, POLL_MS);
    return () => window.clearInterval(t);
  }, [poll]);

  const live = source === 'live' && snap;
  const dt = prev && prevAt && at ? (at - prevAt) / 1000 : 0;
  const rows = SERVICES.map((svc) => {
    const total = inOf(snap, svc), errs = errOf(snap, svc);
    const rate = dt > 0 && total !== undefined ? Math.max(0, (total - (inOf(prev, svc) ?? 0)) / dt) : undefined;
    const errMin = dt > 0 ? Math.max(0, ((errs - errOf(prev, svc)) * 60) / dt) : undefined;
    const lat = svc.latency ? snap?.latency[svc.latency] : undefined;
    const state = total === undefined ? 'nodata' : errMin && errMin > 0 ? 'warn' : lat && lat.p95_ms > 100 ? 'warn' : 'ok';
    return { svc, total, errs, rate, errMin, lat, state };
  });
  const healthy = rows.filter((r) => r.state === 'ok').length;
  const degraded = rows.filter((r) => r.state === 'warn').length;

  const e2e = snap?.latency.ert_to_ws;
  const running = drills.find((d) => d.state === 'RUNNING');
  const freeze = PASSES.some((p) => p.state === 'ACTIVE');
  const drillBlock = !admin.allowed ? admin.reason : freeze ? 'A pass is in progress: drills wait for LOS.' : running ? 'A drill is already running.' : undefined;
  const sampleSlo = (name: string) => SLOS.find((s) => s.name === name)!;

  return (
    <>
      <PageHead
        title="Ground segment services"
        sub={live ? `From the pipeline's own counters, polled every ${POLL_MS / 1000} s. Last poll ${utc(at!, true)}.` : 'The backend is not answering, so this page shows sample figures. Start the backend to see live counters.'}
        actions={live ? <>
          <Pill tone="ok" glyph="normal">{healthy} healthy</Pill>
          {degraded > 0 && <Pill tone="warn" glyph="caution">{degraded} degraded</Pill>}
        </> : <SampleTag />}
      />

      {source === 'offline' && <Banner kind="info" lead="Backend not running.">Showing sample figures; live per-stage counters appear as soon as the ground segment answers (checked every {POLL_MS / 1000} s).</Banner>}
      {freeze && (
        <Banner kind="info" lead="Deploys frozen."
          action={canOpenRoute('pass', role) ? <Button size="sm" variant="secondary" onClick={() => onNavigate('pass')}>Open live pass</Button> : <span className="text-[12.5px] text-[#7C8594]">Handled by {whoCanOpen('pass')}</span>}>
          A pass is in progress, so no critical deploy runs until LOS.
        </Banner>
      )}

      <div className="grid gap-4 mb-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <SloCard name="Antenna to screen, p99" value={live && e2e?.count ? n(e2e.p99_ms) : sampleSlo('Telemetry to screen P99').value.replace(' ms', '')} unit="ms"
          meter={live && e2e?.count ? e2e.p99_ms : 71} max={100} note={live && e2e?.count ? `budget 100 ms · ${n(e2e.count)} samples` : 'budget 100 ms'} sample={!(live && e2e?.count)} tone={live && e2e && e2e.p99_ms > 100 ? 'crit' : undefined} />
        <SloCard name="Frames dropped after receipt" value={live ? n(snap!.stages.link?.spool_dropped ?? 0) : '0'} unit="frames" meter={100} max={100} note="Link Gateway spool, since start" sample={!live} tone={live && (snap!.stages.link?.spool_dropped ?? 0) > 0 ? 'crit' : 'ok'} />
        <SloCard name="Commands failed on uplink" value={live ? n(snap!.stages.uplink?.commands_failed ?? 0) : '0'} unit="commands" meter={100} max={100} note="since start" sample={!live} tone={live && (snap!.stages.uplink?.commands_failed ?? 0) > 0 ? 'warn' : 'ok'} />
        <SloCard name="Pass-minutes served" value={sampleSlo('Pass-minute availability').value.replace(' %', '')} unit="%" meter={99.96} max={100} note="30 days, target 99.95 %" sample />
      </div>

      <Card title="Services" flush className="mb-5" actions={live ? <span className="text-[#7C8594]">uptime {n(snap!.uptime_s / 3600, 1)} h · rates over the last poll</span> : <SampleTag />}>
        <div className="overflow-x-auto px-2 pb-2">
          {live ? (
            <table className="w-full min-w-[820px] border-collapse">
              <thead><tr><Th>Service</Th><Th>State</Th><Th className="text-right">In / s</Th><Th className="text-right">Errors / min</Th><Th className="text-right">p95</Th><Th>Note</Th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.svc.name} className={clsx(r.state === 'warn' && 'bg-[#F5C451]/[0.05]')}>
                    <Td className="text-[#E9ECF1] font-medium">{r.svc.name}</Td>
                    <Td>{r.state === 'nodata' ? <Pill>No data</Pill> : r.state === 'warn' ? <Pill tone="warn">Degraded</Pill> : <Pill tone="ok">Healthy</Pill>}</Td>
                    <Td className="text-right font-mono-code">{n(r.rate, 1)}</Td>
                    <Td className="text-right font-mono-code">{n(r.errMin, 1)}</Td>
                    <Td className={clsx('text-right font-mono-code', r.lat && r.lat.p95_ms > 100 && 'text-[#F5C451]')}>{r.lat?.count ? `${n(r.lat.p95_ms)} ms` : '—'}</Td>
                    <Td className="text-[12.5px] text-[#9AA3B2]">{r.total === undefined ? 'No counters reported yet' : `${n(r.total)} in · ${n(r.errs)} errors since start`}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full min-w-[640px] border-collapse">
              <thead><tr><Th>Service</Th><Th>Domain</Th><Th>State</Th><Th className="text-right">Replicas</Th><Th className="text-right">Consumer lag</Th></tr></thead>
              <tbody>
                {MODULES.map((m) => (
                  <tr key={m.name}>
                    <Td className="text-[#E9ECF1]">{m.name}</Td>
                    <Td>{m.domain}</Td>
                    <Td><Pill tone={m.state === 'HEALTHY' ? 'ok' : m.state === 'DEGRADED' ? 'warn' : 'crit'}>{m.state === 'HEALTHY' ? 'Healthy' : m.state === 'DEGRADED' ? 'Degraded' : 'Down'}</Pill></Td>
                    <Td className="text-right font-mono-code">{m.replicas}</Td>
                    <Td className="text-right font-mono-code">{m.lag.toLocaleString('en-US')}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <div className="flex flex-wrap gap-4 items-start">
        <Card className="flex-[999_1_560px] min-w-0" title="Zones" actions={<SampleTag />}>
          <div className="flex flex-col gap-2">
            {ZONES.map((z) => (
              <Tile key={z.name} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="font-mono-code">{z.name}</span><span className="text-[#9AA3B2]">{z.role}</span>
                <Pill tone={z.state === 'HEALTHY' ? 'ok' : 'warn'}>{z.state === 'HEALTHY' ? 'Healthy' : 'Degraded'}</Pill>
              </Tile>
            ))}
          </div>
          <p className="text-[12.5px] text-[#7C8594] mt-3">Target: region loss RTO 15 min, RPO 1 min; zero loss for commands and audit.</p>
        </Card>

        <Card className="flex-[1_1_320px] min-w-0" title="Zone failover drill" actions={<Pill tone="violet">Drill · simulated</Pill>}>
          <p className="text-[13px] text-[#9AA3B2] leading-[1.5] mb-3">A rehearsal: it simulates draining one zone and reports the telemetry gap. No real infrastructure is touched in this console.</p>
          <div className="flex flex-col gap-2.5">
            <Select value={zone} onChange={(e) => setZone(e.target.value)} aria-label="Zone to drain" disabled={!!drillBlock}
              className="h-9 rounded-xl bg-[#161A22] border border-[#232936] px-3 text-[13px] text-[#E9ECF1]">
              {ZONES.filter((z) => z.role === 'Primary').map((z) => <option key={z.name}>{z.name}</option>)}
            </Select>
            {running
              ? <Button variant="danger" onClick={abortDrill} disabled={!admin.allowed} reason={admin.reason}>Abort drill {running.id}</Button>
              : <Button variant="secondary" onClick={() => setConfirmZone(zone)} disabled={!!drillBlock} reason={drillBlock}>Start drill</Button>}
          </div>
          {drills.length > 0 && (
            <ul className="mt-4 flex flex-col gap-1.5 text-[12.5px] text-[#9AA3B2]">
              {drills.map((d) => (
                <li key={d.id}><span className="font-mono-code">{d.id}</span> · {d.zone} · {d.startedBy} · {utc(d.startedAt)} · {d.state === 'RUNNING' ? 'running…' : d.state === 'ABORTED' ? 'aborted' : `simulated gap ${d.gapS} s of 30 s budget`}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {confirmZone && (
        <Modal title="Start zone failover drill" onClose={() => setConfirmZone(null)}
          footer={<><Button variant="secondary" autoFocus onClick={() => setConfirmZone(null)}>Cancel</Button>
            <Button onClick={() => { startDrill(confirmZone); setConfirmZone(null); }}>Start drill</Button></>}>
          <p className="text-[13.5px] text-[#C9CED6] leading-[1.55]">This is a drill. It simulates draining <span className="font-mono-code">{confirmZone}</span> for about eight seconds and records the result in the audit ledger. No service, zone or link is changed.</p>
        </Modal>
      )}
    </>
  );
};

const SloCard: React.FC<{ name: string; value: string; unit: string; meter: number; max: number; note: string; sample?: boolean; tone?: 'ok' | 'warn' | 'crit' }> = ({ name, value, unit, meter, max, note, sample, tone }) => (
  <section className="bg-[#11141B] border border-[#1A1E27] rounded-2xl px-5 py-4 flex flex-col gap-3">
    <span className="flex items-center justify-between gap-2 text-[13px] text-[#9AA3B2]">{name}{sample && <SampleTag />}</span>
    <span className="flex items-baseline gap-2">
      <span className={clsx('text-[34px] font-semibold tracking-[-0.02em] numeric', tone === 'ok' ? 'text-[#4ADE9A]' : tone === 'warn' ? 'text-[#F5C451]' : tone === 'crit' ? 'text-[#FF7A7A]' : 'text-[#E9ECF1]')}>{value}</span>
      <span className="text-[14px] text-[#7C8594]">{unit}</span>
    </span>
    <Meter value={meter} max={max} color={tone === 'crit' ? '#FF6B6B' : tone === 'warn' ? '#F5C451' : '#6CB8FF'} />
    <span className="text-[12px] text-[#7C8594]">{note}</span>
  </section>
);
