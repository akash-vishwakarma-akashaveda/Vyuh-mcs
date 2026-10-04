import React, { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '../../components/atoms/Button';
import { Pill } from '../../components/atoms/Badge';
import { Banner, Card, KpiRow, KpiTile, PageHead, SampleTag } from '../../components/molecules/Page';
import { Modal } from '../../components/molecules/Modal';
import { FLEET, STATIONS } from '../../data/fleet';
import { PASSES } from '../../demo/scenario';
import type { PassSession, PassState } from '../../types';
import { can } from '../../auth/policy';
import { useAuthStore } from '../../store/useAuthStore';
import { useLinkStore } from '../../store/useLinkStore';
import { useMissionStore } from '../../store/useMissionStore';
import { useMdbStore } from '../../store/useMdbStore';
import { PASS_ACTIONS, PassActionId, usePassConfigStore, usePassOpsStore } from '../../store/usePassConfigStore';
import { PassStateConfigDialog } from '../../components/organisms/PassStateConfigDialog';
import { satElements } from '../../orbit/fleetOrbit';
import { lookAngles, passes, propagate } from '../../orbit/orbit';
import { RouteLink, mmss, useNow, utc } from '../commanding/gates';
import { Select } from '../../components/molecules/Select';

const LIFECYCLE: PassState[] = ['SCHEDULED', 'PREPARING', 'READY', 'ACTIVE', 'DRAINING', 'COMPLETE'];
const PRE_MIN = 10, READY_MIN = 2, DRAIN_MIN = 5;
const W = 700, X0 = 30, X1 = 670, Y0 = 180, YTOP = 24;

/** A session for any satellite: the sample session if one exists, else its first assigned station. */
function sessionFor(satId: string): PassSession {
  const sat = FLEET.find((f) => f.sat_id === satId)!;
  return {
    ...PASSES[1], session_id: `LS-${satId}-${sat.assigned_ground_stations[0]}`, sat_id: satId, station_id: sat.assigned_ground_stations[0],
    state: 'SCHEDULED', frames_per_s: 0, gaps: 0, e2e_latency_p99_ms: 0, virtual_channels: [], standby_gateway: 'NONE',
  };
}

/** S08 · Live pass monitor: phase, elevation from the orbit, link KPIs, channels and what you can do now. */
export const LivePassMonitor: React.FC<{ onNavigate: (to: string) => void; satId?: string; sessionId?: string }> = ({ onNavigate, satId, sessionId }) => {
  const cfg = usePassConfigStore((s) => s.config);
  const role = useAuthStore((s) => s.activeRole);
  const user = useAuthStore((s) => s.user);
  const approvals = useMissionStore((s) => s.approvals);
  const latency = useLinkStore((s) => s.latency);
  const liveMode = useLinkStore((s) => s.mode === 'live');
  const opsAll = usePassOpsStore((s) => s.ops);
  const putOps = usePassOpsStore((s) => s.put);
  const now = useNow(1000);
  const [configOpen, setConfigOpen] = useState(false);
  const [handover, setHandover] = useState(false);
  const [signOff, setSignOff] = useState(false);

  const session: PassSession =
    PASSES.find((p) => p.session_id === sessionId)
    ?? (satId && FLEET.some((f) => f.sat_id === satId) ? PASSES.find((p) => p.sat_id === satId) ?? sessionFor(satId) : undefined)
    ?? PASSES[0];
  const sat = FLEET.find((f) => f.sat_id === session.sat_id)!;
  const station = STATIONS.find((s) => s.id === session.station_id)!;
  const ops = opsAll[session.session_id] ?? {};

  // ---- geometry: the pass from the orbit, not from the booking record ------------------------
  const minute = Math.floor(now / 60_000);
  const geo = useMemo(() => {
    const el = satElements(sat);
    const t0 = minute * 60_000;
    const p = passes(el, station, t0 - 40 * 60_000, 24 * 3600_000, 10, 20_000).find((x) => x.los + DRAIN_MIN * 60_000 > t0);
    if (!p) return null;
    // widen to the horizon so the arc starts and ends on it, and sample elevation every few seconds
    const pts = Array.from({ length: 81 }, (_, i) => { const t = p.aos + ((p.los - p.aos) * i) / 80; return { t, el: lookAngles(propagate(el, t), station).elevationDeg }; });
    const tca = pts.reduce((a, b) => (b.el > a.el ? b : a));
    return { aos: p.aos, los: p.los, maxEl: p.maxElevationDeg, pts, tca: tca.t };
  }, [sat, station, minute]);

  const look = useMemo(() => lookAngles(propagate(satElements(sat), now), station), [sat, station, now]);
  const phaseIdx = !geo ? 0
    : now < geo.aos - PRE_MIN * 60_000 ? 0 : now < geo.aos - READY_MIN * 60_000 ? 1 : now < geo.aos ? 2 : now < geo.los ? 3 : now < geo.los + DRAIN_MIN * 60_000 ? 4 : 5;
  const phase = LIFECYCLE[phaseIdx];
  const inContact = phase === 'ACTIVE';
  const flowing = inContact || phase === 'DRAINING';

  const xOf = (t: number) => (geo ? X0 + ((t - geo.aos) / (geo.los - geo.aos)) * (X1 - X0) : X0);
  const yScale = geo ? Math.max(30, Math.ceil(geo.maxEl / 10) * 10) : 90;
  const yOf = (el: number) => Y0 - (Math.max(0, el) / yScale) * (Y0 - YTOP);
  const mask = yOf(10);
  const arc = (to?: number) => geo ? geo.pts.filter((p) => to === undefined || p.t <= to).map((p, i) => `${i ? 'L' : 'M'}${xOf(p.t).toFixed(1)} ${yOf(p.el).toFixed(1)}`).join(' ') : '';
  const nowDone = geo && inContact ? arc(now) + ` L${xOf(now).toFixed(1)} ${yOf(look.elevationDeg).toFixed(1)}` : '';

  // ---- KPIs ------------------------------------------------------------------------------------
  const p99 = liveMode && latency?.samples ? Math.round(latency.p99) : session.e2e_latency_p99_ms || 76;
  const waitingApproval = approvals.filter((a) => a.sat_id === sat.sat_id && a.state === 'PENDING' && Date.parse(a.expires_utc) > now).length;
  const BUDGET = [['Link gateway', 18, '#6CB8FF'], ['Frame processing', 21, '#9B8CFF'], ['TM processing', 24, '#3DD9C1'], ['To browser', 13, '#8CC8FF']] as const;
  const wsum = BUDGET.reduce((a, b) => a + b[1], 0);
  const parts = BUDGET.map(([n, w, c], i) => ({ n, c, v: i < BUDGET.length - 1 ? Math.round((w / wsum) * p99) : 0 }));
  parts[parts.length - 1].v = p99 - parts.slice(0, -1).reduce((a, b) => a + b.v, 0); // parts always sum to the total

  // ---- actions ---------------------------------------------------------------------------------
  const opsGate = can('booking:edit', role);
  const gaps = ops.backfillRequested ? 0 : session.gaps;
  const runChecks = () => {
    const active = useMdbStore.getState().releases.find((r) => r.state === 'ACTIVE');
    const checks = [
      { name: 'Station health', ok: station.adapter_health === 'OK', text: `${station.name} adapter ${station.adapter_health.toLowerCase()}, ${station.state.toLowerCase()}` },
      { name: 'Link configuration', ok: station.bands.length > 0, text: `${station.protocol}, ${station.bands.join('/')}-band` },
      { name: 'Dictionary', ok: true, text: `akv-mdb ${active?.version ?? '4.19.0'} loaded for ${sat.sat_id}` },
      { name: 'Time correlation', ok: true, text: 'last correlation within 0.4 ms' },
      { name: 'Contact window', ok: !!geo, text: geo ? `AOS ${utc(geo.aos)} · max ${geo.maxEl.toFixed(0)}°` : 'no pass in the next 24 h' },
    ];
    putOps(session.session_id, { checks, checkedBy: user.name, checkedUtc: new Date().toISOString() });
    useMissionStore.getState().appendAudit({ timestamp_utc: new Date().toISOString(), operator_id: user.id, operator_name: user.name, sat_id: sat.sat_id, command_mnemonic: 'PREPASS_CHECK', procedure_id: '—', procedure_version: '—', sequence_count: 0, result: checks.every((c) => c.ok) ? 'ACK' : 'NACK', params_summary: `${session.session_id}: ${checks.filter((c) => c.ok).length}/${checks.length} checks passed` });
  };
  const routeFor = (a: PassActionId): string | undefined => ({
    reschedule: `schedule?station=${station.id}&sat=${sat.sat_id}`, editPlan: `procedure?sat=${sat.sat_id}`,
    swapStation: `network?sat=${sat.sat_id}&book=1`, backupStation: `network?sat=${sat.sat_id}&book=1`,
    loadQueue: `uplink?sat=${sat.sat_id}`, sendCommands: `command?sat=${sat.sat_id}`,
    report: `report?session=${session.session_id}`, replay: `playback?sat=${sat.sat_id}`,
  } as Partial<Record<PassActionId, string>>)[a];
  const DESC: Partial<Record<PassActionId, string>> = {
    sendCommands: waitingApproval ? `${waitingApproval} waiting for a Flight Director` : 'Command console for this satellite',
    standby: ops.standby === 'TAKEOVER' ? 'Standby gateway has taken over' : ops.standby === 'ARMED' ? 'Standby armed, 30 s maximum gap' : `Standby ${session.standby_gateway === 'READY' ? 'ready' : 'not armed'}`,
    loadQueue: 'Uplink and COP-1 for this satellite',
    monitor: 'Channels, gaps and latency below',
    backfill: ops.backfillRequested ? `Requested by ${ops.backfillRequested}` : `${session.gaps} gap${session.gaps === 1 ? '' : 's'} this pass`,
    signOff: ops.signedOffBy ? `Signed off by ${ops.signedOffBy}` : gaps ? 'Resolve gaps first' : 'All gaps resolved',
    report: 'Provisional until the data drain ends',
    preChecks: ops.checkedUtc ? `Last run ${utc(ops.checkedUtc)} by ${ops.checkedBy}` : 'Not run yet for this pass',
  };
  const doAction = (a: PassActionId) => {
    if (a === 'preChecks') runChecks();
    else if (a === 'standby') { if (ops.standby === 'ARMED') setHandover(true); else putOps(session.session_id, { standby: 'ARMED' }); }
    else if (a === 'monitor') document.getElementById('vc-table')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    else if (a === 'backfill') putOps(session.session_id, { backfillRequested: user.name });
    else if (a === 'signOff') setSignOff(true);
  };
  const actionLabel = (a: PassActionId) => ({ preChecks: ops.checks ? 'Run again' : 'Run checks', standby: ops.standby === 'ARMED' ? 'Hand over…' : 'Arm standby', monitor: 'Show channels', backfill: 'Request backfill', signOff: 'Sign off…' } as Partial<Record<PassActionId, string>>)[a] ?? 'Open';
  const needsGate = (a: PassActionId) => ['preChecks', 'standby', 'backfill', 'signOff'].includes(a);
  const actionDisabled = (a: PassActionId) => (needsGate(a) && !opsGate.allowed) || (a === 'standby' && ops.standby === 'TAKEOVER') || (a === 'backfill' && (!!ops.backfillRequested || !session.gaps)) || (a === 'signOff' && (!!ops.signedOffBy || gaps > 0));

  const elapsed = geo ? (now - geo.aos) / 1000 : 0;
  const phaseSub = (i: number) => !geo ? '' : [
    session.booking === 'BOOKED' ? 'booked' : session.booking.toLowerCase(),
    ops.checkedUtc ? `checks done ${utc(ops.checkedUtc, false)}` : `from ${utc(geo.aos - PRE_MIN * 60_000, false)}`,
    `AOS ${utc(geo.aos, false)}`,
    i === phaseIdx ? `${mmss(elapsed)} elapsed` : `until ${utc(geo.los, false)}`,
    `from ${utc(geo.los, false)}`,
    ops.signedOffBy ? `signed off by ${ops.signedOffBy}` : 'report after LOS',
  ][i];

  const sessions = [...PASSES, ...(PASSES.some((p) => p.session_id === session.session_id) ? [] : [session])];

  return (
    <>
      <PageHead
        crumb={<RouteLink to="schedule" onNavigate={onNavigate}>← Passes</RouteLink>}
        title={`${sat.sat_id} over ${station.name}`}
        sub={<span className="font-mono-code">{session.session_id}{geo ? ` · AOS ${utc(geo.aos)} · TCA ${utc(geo.tca)} · LOS ${utc(geo.los)}` : ' · no pass above 10° in the next 24 h'}</span>}
        actions={<>
          <Pill tone={inContact ? 'info' : phase === 'DRAINING' ? 'warn' : 'neutral'} className="h-[38px] px-3 rounded-[10px] text-[12.5px]">
            {cfg[phase].label}{inContact ? ` · ${mmss(elapsed)} elapsed` : geo && now < geo.aos ? ` · AOS in ${mmss((geo.aos - now) / 1000)}` : ''}
          </Pill>
          <label className="flex items-center gap-2 h-[38px] rounded-[10px] bg-[#11141B] border border-[#1A1E27] px-3 text-[13px]">
            <span className="text-[#7C8594]">Pass</span>
            <Select aria-label="Pass" value={session.session_id} onChange={(e) => onNavigate(`pass?session=${e.target.value}`)} className="bg-transparent text-[#E9ECF1] font-mono-code text-[13px] outline-none max-w-[220px]">
              {sessions.map((p) => <option key={p.session_id} value={p.session_id} className="bg-[#11141B]">{p.sat_id} · {p.station_id}</option>)}
            </Select>
          </label>
          <Button variant="secondary" disabled={!opsGate.allowed} onClick={() => setConfigOpen(true)}>Configure states</Button>
        </>} />
      {!opsGate.allowed && <p className="text-[12.5px] text-[#7C8594] -mt-3 mb-4">Configure states and pass operations: {opsGate.reason}</p>}

      {ops.standby === 'TAKEOVER' && <Banner kind="warn" lead="Standby takeover.">The standby gateway carries the link; the gap must stay under 30 s (Q-10).</Banner>}

      <ol aria-label="Pass phases" className="list-none m-0 p-[3px] rounded-xl bg-[#11141B] grid gap-[3px] mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        {LIFECYCLE.map((s, i) => (
          <li key={s} aria-current={i === phaseIdx ? 'step' : undefined} title={cfg[s].description} className="rounded-[9px] px-3 py-2.5 flex flex-col gap-2" style={{ background: i === phaseIdx ? '#232936' : 'transparent' }}>
            <span className="h-1 rounded-sm block" style={{ background: i === phaseIdx ? '#6CB8FF' : i < phaseIdx ? 'rgba(108,184,255,0.45)' : '#1A1E27' }} />
            <span className="flex items-center gap-1.5 text-[13px] font-medium" style={{ color: i === phaseIdx ? '#8CC8FF' : i < phaseIdx ? '#C9CED6' : '#7C8594' }}>{i < phaseIdx && <Check size={13} color="#4ADE9A" strokeWidth={2.4} aria-hidden="true" />}{cfg[s].label}</span>
            <span className="text-[12px] text-[#7C8594]">{phaseSub(i)}</span>
          </li>
        ))}
      </ol>

      <KpiRow>
        <KpiTile label="Downlink rate" value={<>{flowing ? session.frames_per_s || '—' : 0} <span className="text-[14px] text-[#7C8594] font-normal">frames/s</span></>} sub={<SampleTag />} />
        <KpiTile label="Gaps this pass" value={flowing ? gaps : 0} tone={flowing && gaps ? 'warn' : 'ok'} sub={ops.backfillRequested ? 'backfill requested' : 'backfill opens automatically'} />
        <KpiTile label="Antenna to screen, p99" value={<>{p99} <span className="text-[14px] text-[#7C8594] font-normal">ms</span></>} tone={p99 < 100 ? 'plain' : 'warn'} sub={liveMode && latency?.samples ? `measured, ${latency.samples} samples` : <SampleTag />} />
        <KpiTile label="Waiting approval" value={<>{waitingApproval} <span className="text-[14px] text-[#7C8594] font-normal">command{waitingApproval === 1 ? '' : 's'}</span></>} tone={waitingApproval ? 'action' : 'plain'} />
      </KpiRow>

      <div className="flex flex-wrap gap-4 items-start">
        <div className="flex-[999_1_560px] min-w-0 flex flex-col gap-4">
          <Card>
            <div className="flex flex-wrap justify-between items-end gap-3 mb-3">
              <span className="flex flex-col gap-1">
                <span className="text-[14px] font-medium">Elevation</span>
                <span className="flex items-baseline gap-2">
                  <span className="text-[36px] font-semibold tracking-[-0.02em]">{inContact ? `${look.elevationDeg.toFixed(1)}°` : '—'}</span>
                  <span className="text-[13px] text-[#7C8594]">{!geo ? 'no pass' : inContact ? (now < geo.tca ? 'rising to closest approach' : 'past closest approach') : now < geo.aos ? `below the horizon, rises to ${geo.maxEl.toFixed(0)}°` : 'set'}</span>
                </span>
              </span>
              {inContact && <span className="flex gap-2 text-[12px]">
                <span className="rounded-full bg-[#161A22] px-2.5 py-1 text-[#9AA3B2]">Azimuth <span className="font-mono-code text-[#E9ECF1]">{look.azimuthDeg.toFixed(0)}°</span></span>
                <span className="rounded-full bg-[#161A22] px-2.5 py-1 text-[#9AA3B2]">Range <span className="font-mono-code text-[#E9ECF1]">{look.rangeKm.toFixed(0)} km</span></span>
              </span>}
            </div>
            {geo ? (
              <svg viewBox={`0 0 ${W} 220`} width="100%" height="220" role="img" aria-label={`Elevation over ${station.name}: AOS ${utc(geo.aos)}, maximum ${geo.maxEl.toFixed(0)} degrees, LOS ${utc(geo.los)}`}>
                <rect x={X0} y={mask} width={X1 - X0} height={Y0 - mask} fill="rgba(124,133,148,0.06)" />
                <line x1={X0} y1={mask} x2={X1} y2={mask} stroke="#7C8594" strokeOpacity="0.5" strokeDasharray="4 5" />
                <text x={X0 + 6} y={mask - 6} fill="#6B7383" fontSize="11">10° mask</text>
                <line x1={X0} y1={Y0} x2={X1} y2={Y0} stroke="#232936" />
                <path d={arc()} fill="none" stroke="#6CB8FF" strokeOpacity="0.35" strokeWidth="1.6" strokeDasharray="3 4" />
                {inContact && <path d={`${nowDone} L${xOf(now).toFixed(1)} ${Y0} L${X0} ${Y0} Z`} fill="rgba(108,184,255,0.10)" />}
                {inContact && <path d={nowDone} fill="none" stroke="#6CB8FF" strokeWidth="2" />}
                <line x1={xOf(geo.tca)} y1="40" x2={xOf(geo.tca)} y2={Y0} stroke="#7C8594" strokeDasharray="2 4" />
                <rect x={xOf(geo.tca) - 54} y="14" width="108" height="22" rx="6" fill="#1A1E27" />
                <text x={xOf(geo.tca)} y="29" textAnchor="middle" fill="#C9CED6" fontFamily="Geist Mono, monospace" fontSize="11">TCA {utc(geo.tca).slice(-8)}</text>
                {inContact && <><circle cx={xOf(now)} cy={yOf(look.elevationDeg)} r="12" fill="#6CB8FF" fillOpacity="0.15" /><circle cx={xOf(now)} cy={yOf(look.elevationDeg)} r="5.5" fill="#FFFFFF" /></>}
                <g fontFamily="Geist Mono, monospace" fontSize="11" fill="#6B7383"><text x={X0} y="204">AOS {utc(geo.aos, false).slice(-5)}</text><text x={X1} y="204" textAnchor="end">LOS {utc(geo.los, false).slice(-5)}</text></g>
              </svg>
            ) : <p className="text-[13px] text-[#7C8594]">{sat.sat_id} does not rise above 10° over {station.name} in the next 24 hours.</p>}
            <p className="text-[12px] text-[#7C8594] mt-1">From the orbit propagated now (two-body with J2), {station.protocol} · {station.provider}.</p>
          </Card>

          <Card title="Virtual channels" actions={<span className="text-[12px] text-[#7C8594] flex items-center gap-2">this pass <SampleTag /></span>} flush>
            <div id="vc-table" className="overflow-x-auto px-2 pb-1">
              <table className="w-full min-w-[520px] text-[13px] border-separate" style={{ borderSpacing: '0 4px' }}>
                <thead><tr className="text-left text-[12px] text-[#6B7383]"><th className="px-3 py-1 font-normal">VC</th><th className="px-3 py-1 font-normal">Content</th><th className="px-3 py-1 font-normal text-right">Frames/s</th><th className="px-3 py-1 font-normal text-right">Gaps</th><th className="px-3 py-1 font-normal">Backfill</th></tr></thead>
                <tbody>
                  {flowing && session.virtual_channels.map((v) => (
                    <tr key={v.vcid} className="bg-[#141821]">
                      <td className="px-3 py-[11px] rounded-l-[10px] font-mono-code font-medium">{v.vcid}</td>
                      <td className="px-3 py-[11px]">{v.name}</td>
                      <td className="px-3 py-[11px] text-right font-mono-code">{inContact ? v.frames_per_s : 0}</td>
                      <td className="px-3 py-[11px] text-right font-mono-code" style={{ color: v.gaps && !ops.backfillRequested ? '#F5C451' : '#4ADE9A' }}>{ops.backfillRequested ? 0 : v.gaps}</td>
                      <td className="px-3 py-[11px] rounded-r-[10px] text-[#9AA3B2]">{v.gaps ? (ops.backfillRequested ? `requested from ${v.backfill}` : v.backfill) : 'not needed'}</td>
                    </tr>
                  ))}
                  {(!flowing || session.virtual_channels.length === 0) && <tr><td colSpan={5} className="px-3 py-3 bg-[#141821] rounded-[10px] text-[#7C8594]">No channels: {phaseIdx < 3 ? 'the pass has not started' : 'the pass is closed'}.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <aside className="flex-[1_1_320px] min-w-0 flex flex-col gap-4">
          <Card title={`${cfg[phase].label}: you can`}>
            <div className="flex flex-col gap-2">
              {cfg[phase].actions.map((a) => {
                const route = routeFor(a);
                return (
                  <div key={a} className="rounded-xl bg-[#161A22] px-3.5 py-3 flex justify-between gap-3 items-center text-[13px]">
                    <span className="flex flex-col gap-0.5 leading-[1.35] min-w-0"><span>{PASS_ACTIONS[a].label.split(' (')[0]}</span><span className="text-[12px] text-[#7C8594]">{DESC[a] ?? ''}</span></span>
                    {route ? <RouteLink as="button" to={route} onNavigate={onNavigate} className="shrink-0 text-right">{actionLabel(a)}</RouteLink>
                      : <Button size="sm" variant="secondary" disabled={actionDisabled(a)} onClick={() => doAction(a)}>{actionLabel(a)}</Button>}
                  </div>
                );
              })}
              {cfg[phase].actions.length === 0 && <span className="text-[12.5px] text-[#7C8594]">No actions are enabled for this state.</span>}
              {cfg[phase].actions.some(needsGate) && !opsGate.allowed && <span className="text-[12px] text-[#7C8594]">Pass operations: {opsGate.reason}</span>}
            </div>
            {ops.checks && (
              <div className="mt-3 flex flex-col gap-1.5">
                <span className="text-[12px] text-[#7C8594]">Pre-pass checks · {utc(ops.checkedUtc)} · {ops.checkedBy}</span>
                {ops.checks.map((c) => <span key={c.name} className="text-[12.5px] flex gap-2"><span style={{ color: c.ok ? '#4ADE9A' : '#FF7A7A' }}>{c.ok ? '●' : '■'}</span><span className="text-[#C9CED6]">{c.name}</span><span className="text-[#7C8594]">{c.text}</span></span>)}
              </div>
            )}
          </Card>

          <Card title="Antenna to screen" actions={<span className="text-[12px] text-[#7C8594]">p99 this pass</span>}>
            <span className="flex items-baseline gap-2"><span className="text-[32px] font-semibold tracking-[-0.02em]">{p99}</span><span className="text-[14px] text-[#7C8594]">ms of 100 budget</span></span>
            <span className="flex gap-[3px] h-2 my-3">
              {parts.map((b) => <span key={b.n} className="block rounded" style={{ flex: Math.max(0, b.v), background: b.c }} />)}
              {p99 < 100 && <span className="block rounded bg-[#1A1E27]" style={{ flex: 100 - p99 }} />}
            </span>
            <div className="flex flex-col gap-2">
              {parts.map((b) => <div key={b.n} className="grid grid-cols-[12px_1fr_56px] gap-2.5 items-center text-[13px]"><span className="w-2 h-2 rounded-[3px] block" style={{ background: b.c }} /><span className="text-[#9AA3B2]">{b.n}</span><span className="font-mono-code text-right">{b.v} ms</span></div>)}
            </div>
            <p className="text-[12px] text-[#7C8594] mt-3">{liveMode && latency?.samples ? 'Total measured by this console; the split by stage is the design budget.' : 'Sample figures until the backend reports per-stage latency.'}</p>
          </Card>
        </aside>
      </div>

      {configOpen && <PassStateConfigDialog onClose={() => setConfigOpen(false)} />}
      {handover && (
        <Modal title="Hand over to the standby gateway?" onClose={() => setHandover(false)}
          footer={<><Button variant="secondary" autoFocus onClick={() => setHandover(false)}>Cancel</Button><Button variant="warning" onClick={() => { putOps(session.session_id, { standby: 'TAKEOVER' }); setHandover(false); }}>Hand over</Button></>}>
          <p className="text-[13.5px] text-[#C9CED6]">The standby gateway takes the link for {sat.sat_id}. Telemetry may pause for up to 30 s; COP-1 resumes from the last acknowledged frame.</p>
        </Modal>
      )}
      {signOff && (
        <Modal title="Sign off this pass?" onClose={() => setSignOff(false)}
          footer={<><Button variant="secondary" autoFocus onClick={() => setSignOff(false)}>Cancel</Button><Button onClick={() => {
            putOps(session.session_id, { signedOffBy: user.name, signedOffUtc: new Date().toISOString() });
            useMissionStore.getState().appendAudit({ timestamp_utc: new Date().toISOString(), operator_id: user.id, operator_name: user.name, sat_id: sat.sat_id, command_mnemonic: 'PASS_SIGNOFF', procedure_id: '—', procedure_version: '—', sequence_count: 0, result: 'ACK', params_summary: `${session.session_id} signed off` });
            setSignOff(false);
          }}>Sign off</Button></>}>
          <p className="text-[13.5px] text-[#C9CED6]">All gaps are resolved for {session.session_id}. Signing off closes the pass and is recorded in the audit ledger under your name.</p>
        </Modal>
      )}
    </>
  );
};
