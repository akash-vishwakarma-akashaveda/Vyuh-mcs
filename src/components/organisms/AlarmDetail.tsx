import React from 'react';
import { clsx } from 'clsx';
import { Banner } from '../molecules/Page';
import { Button } from '../atoms/Button';
import { MultiPlot } from './MultiPlot';
import { FLEET, STATIONS } from '../../data/fleet';
import { findDef, history } from '../../ops/history';
import { getSatOps } from '../../ops/satOps';
import { UAlarm } from '../../ops/opsAlarms';
import { useFleetStore } from '../../store/useFleetStore';
import { useMissionStore } from '../../store/useMissionStore';
import { toast } from '../../store/useToastStore';
import { stationColor } from '../../ops/colors';

const utc = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
const rel = (ms: number) => { const m = Math.round(Math.abs(ms) / 60000); const s = m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`; return ms >= 0 ? `in ${s}` : `${s} ago`; };

const Row: React.FC<{ k: string; v: React.ReactNode; tone?: string }> = ({ k, v, tone }) => (
  <div className="flex justify-between gap-4 text-[12.5px] py-1 border-b border-[#1A2738] last:border-0">
    <span className="text-[#A3B1C2]">{k}</span><span className={clsx('text-right', tone)}>{v}</span>
  </div>
);
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="flex flex-col gap-1.5">
    <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#8496AB]">{title}</span>
    {children}
  </section>
);
const Steps: React.FC<{ items: string[] }> = ({ items }) => (
  <ol className="flex flex-col gap-1.5 text-[12.5px] list-decimal pl-5 text-[#C9D4E0]">{items.map((s) => <li key={s}>{s}</li>)}</ol>
);

/** The analysis behind an alarm. What it shows depends on what kind of alarm it is. */
export const AlarmDetail: React.FC<{ alarm: UAlarm; onNavigate: (to: string) => void }> = ({ alarm, onNavigate }) => {
  const cvt = useFleetStore((s) => s.cvt);
  const windows = useFleetStore((s) => s.contactWindows);
  const commands = useMissionStore((s) => s.commands);
  const now = Date.now();

  if (alarm.category === 'HEALTH' && alarm.health) {
    const a = alarm.health;
    const found = findDef(a.param_id);
    const live = cvt[a.sat_id]?.[a.param_id]?.eu_value ?? a.eu_value;
    const ts = Array.from({ length: 120 }, (_, i) => Math.floor(now / 1000) - (119 - i) * 15);
    return (
      <>
        <div className="font-display-title text-[26px] font-bold tabular-nums">{live} <span className="text-[14px] text-[#A3B1C2]">{a.unit}</span></div>
        <Section title="Last 30 minutes">
          {found && <MultiPlot timestamps={ts} height={150} compact syncKey={`al-${a.alarm_id}`} onReady={() => {}} onXRange={() => {}}
            series={[{ label: a.param_id, color: '#5B8DEF', unit: a.unit, values: history(a.sat_id, found.def, live, ts), limits: { lowSoft: found.def.warnLo, hiSoft: found.def.warnHi, lowHard: found.def.critLo, hiHard: found.def.critHi } }]} />}
        </Section>
        <Section title="Limits">
          <Row k="Warning" v={`${a.limit_low_soft ?? '—'} … ${a.limit_hi_soft ?? '—'} ${a.unit}`} />
          <Row k="Critical" v={`${a.limit_low_hard ?? '—'} … ${a.limit_hi_hard ?? '—'} ${a.unit}`} />
          <Row k="Subsystem" v={a.subsystem} />
          <Row k="Raised" v={`${utc(Date.parse(a.timestamp_utc))} · ${rel(Date.parse(a.timestamp_utc) - now)}`} />
        </Section>
        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" size="sm" onClick={() => onNavigate(`parameter?sat=${a.sat_id}&param=${a.param_id}`)}>Open parameter history</Button>
          <Button variant="secondary" size="sm" onClick={() => onNavigate(`satellite?sat=${a.sat_id}`)}>Open {a.sat_id}</Button>
        </div>
      </>
    );
  }

  if (alarm.category === 'CONJUNCTION' && alarm.conjunction) {
    const c = alarm.conjunction;
    // Indicative only: a Gaussian falloff against an assumed 1 km position uncertainty. Real Pc needs covariance.
    const pc = Math.exp(-((c.missKm / 1.5) ** 2) / 2) * 1e-3;
    return (
      <>
        <Banner kind={c.risk === 'CRITICAL' ? 'crit' : 'warn'} lead={`${c.risk.charAt(0) + c.risk.slice(1).toLowerCase()} approach.`}>
          {c.satId} passes {c.missKm.toFixed(1)} km from {c.objectName} {rel(c.tcaMs - now)}, closing at {c.relSpeedKms.toFixed(1)} km/s.
        </Banner>
        <Section title="Encounter">
          <Row k="Time of closest approach" v={utc(c.tcaMs)} />
          <Row k="Miss distance" v={`${c.missKm.toFixed(2)} km`} tone={c.risk === 'CRITICAL' ? 'text-[#FF3838]' : 'text-[#FCE83A]'} />
          <Row k="Relative speed" v={`${c.relSpeedKms.toFixed(2)} km/s`} />
          <Row k="Indicative collision probability" v={pc.toExponential(1)} />
        </Section>
        <Section title="Secondary object">
          <Row k="Name" v={c.objectName} />
          <Row k="Type" v={c.kind === 'DEBRIS' ? 'Debris fragment' : c.kind === 'ROCKET_BODY' ? 'Rocket body' : 'Defunct satellite'} />
          <Row k="Manoeuvrable" v="No" />
          <Row k="Catalogue" v="Demo catalogue (not live tracking data)" tone="text-[#8496AB]" />
        </Section>
        <Section title="Thresholds used">
          <Row k="Critical" v="miss distance under 5 km" /><Row k="Warning" v="under 25 km" />
        </Section>
        <Section title="Recommended">
          <Steps items={['Request an updated conjunction data message from the tracking provider', 'Flight dynamics to assess an avoidance manoeuvre before TCA − 6 h', 'Book a contact before TCA to uplink the burn if required', 'Re-screen 2 h before TCA with the refreshed state vector']} />
        </Section>
        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" size="sm" onClick={() => onNavigate('fleet')}>Show on globe</Button>
          <Button variant="secondary" size="sm" onClick={() => toast.info('Manoeuvre planning requested', { body: `Demo: flight dynamics has no backend yet (${c.satId} × ${c.objectName}).` })}>Request manoeuvre plan</Button>
        </div>
      </>
    );
  }

  if (alarm.category === 'PAYLOAD') {
    const ops = getSatOps(alarm.sat_id, now);
    const affected = ops.events.filter((e) => e.kind === 'IMAGING' && e.at > now);
    return (
      <>
        <Section title="Payload state">
          <Row k="Status" v={ops.payload.status} tone="text-[#FF3838]" />
          <Row k="Last imaging" v={ops.payload.lastImaging ? `${utc(ops.payload.lastImaging.at)} · ${ops.payload.lastImaging.target}` : '—'} />
          <Row k="Imaging sessions today" v={ops.payload.imagesToday} />
          <Row k="Data on board" v={`${ops.data.pendingGb} GB`} />
        </Section>
        <Section title={`Affected planned imaging (${affected.length})`}>
          {affected.slice(0, 5).map((e) => <Row key={e.id} k={e.label.replace('Imaging · ', '')} v={`${utc(e.at).slice(5, 16)} ${rel(e.at - now)}`} />)}
        </Section>
        <Section title="Recommended">
          <Steps items={['Confirm the fault flag in PAYLOAD telemetry (PL_TEMP, TX_POWER)', 'Hold new imaging tasks for this satellite', 'Run the payload health-check procedure on the next contact', 'Re-plan affected tasks onto other satellites if the fault persists']} />
        </Section>
        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" size="sm" onClick={() => onNavigate(`satellite?sat=${alarm.sat_id}&tab=PAYLOAD`)}>Open payload telemetry</Button>
          <Button variant="secondary" size="sm" onClick={() => onNavigate('payload')}>Payload deliveries</Button>
        </div>
      </>
    );
  }

  if (alarm.category === 'COMMAND') {
    const cmd = commands.find((c) => c.command_id === alarm.ref);
    const ops = getSatOps(alarm.sat_id, now);
    return (
      <>
        {cmd ? (
          <Section title="Command">
            <Row k="Command" v={`${cmd.mnemonic} ${Object.entries(cmd.params).map(([k, v]) => `${k}=${v}`).join(' ')}`} />
            <Row k="Status" v={cmd.status} tone="text-[#FF3838]" />
            <Row k="Requested by" v={cmd.requested_by} />
            <Row k="Approved by" v={cmd.approved_by ?? '—'} />
            <Row k="Critical command" v={cmd.critical ? 'Yes (two-person rule)' : 'No'} />
          </Section>
        ) : (
          <Section title="Procedure uplink">
            <Row k="Procedure" v={ops.uplink.procedure} />
            <Row k="Uplinked" v={`${ops.uplink.pct}%`} tone="text-[#FCE83A]" />
            <Row k="State" v={ops.uplink.state} tone="text-[#FF3838]" />
            <Row k="Started" v={`${utc(ops.uplink.startedAt)} · ${rel(ops.uplink.startedAt - now)}`} />
            <Row k="Likely cause" v="Contact ended before the load completed" />
          </Section>
        )}
        <Section title="Recommended">
          <Steps items={['Check COP-1 state (V(S), N(R), lockout) on Uplink & COP-1', 'Resume from the last acknowledged frame on the next contact', 'For a rejected command, correct the parameters and resubmit for approval']} />
        </Section>
        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" size="sm" onClick={() => onNavigate(`uplink?sat=${alarm.sat_id}`)}>Open Uplink &amp; COP-1</Button>
          <Button variant="secondary" size="sm" onClick={() => onNavigate('procedure')}>Procedure runner</Button>
        </div>
      </>
    );
  }

  if (alarm.category === 'GROUND') {
    const st = STATIONS.find((s) => s.id === alarm.ref);
    const upcoming = windows.filter((w) => w.ground_station === alarm.ref && Date.parse(w.los_utc) > now);
    const alternatives = STATIONS.filter((s) => s.id !== alarm.ref && s.adapter_health === 'OK');
    return (
      <>
        {st && (
          <Section title="Station">
            <Row k="Station" v={<span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full" style={{ background: stationColor(st.id) }} />{st.id} · {st.name}</span>} />
            <Row k="Provider / protocol" v={`${st.provider} · ${st.protocol}`} />
            <Row k="Adapter" v={st.adapter_health} tone={st.adapter_health === 'DOWN' ? 'text-[#FF3838]' : 'text-[#FCE83A]'} />
            <Row k="Link quality" v={`${st.quality_pct}%`} />
            <Row k="Availability" v={`${st.availability_pct}%`} />
          </Section>
        )}
        <Section title={`Upcoming contacts affected (${upcoming.length})`}>
          {upcoming.slice(0, 6).map((w) => <Row key={w.window_id} k={w.sat_id} v={`${w.aos_utc.slice(11, 16)}–${w.los_utc.slice(11, 16)} UTC · max ${w.max_elevation_deg}°`} />)}
          {upcoming.length === 0 && <span className="text-[12.5px] text-[#8496AB]">None in the next 12 hours.</span>}
        </Section>
        <Section title="Alternatives">
          <div className="flex flex-wrap gap-2">{alternatives.map((s) => <span key={s.id} className="text-[12px] rounded-full border border-[#2A3B52] px-2.5 py-1 flex items-center gap-1.5"><i className="w-2 h-2 rounded-full" style={{ background: stationColor(s.id) }} />{s.id} · {s.quality_pct}%</span>)}</div>
        </Section>
        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" size="sm" onClick={() => onNavigate('stations')}>Ground stations</Button>
          <Button variant="secondary" size="sm" onClick={() => onNavigate('schedule')}>Contact schedule</Button>
        </div>
      </>
    );
  }

  // DATA
  const ops = getSatOps(alarm.sat_id, now);
  const sat = FLEET.find((s) => s.sat_id === alarm.sat_id);
  return (
    <>
      <Section title="Data chain">
        <Row k="Downloaded" v={`${ops.data.downlinkedPct}%`} />
        <Row k="Processed" v={`${ops.data.processedPct}%`} tone="text-[#FCE83A]" />
        <Row k="Pending on board" v={`${ops.data.pendingGb} GB`} />
        <Row k="Last dump" v={`${utc(ops.data.lastDumpAt)} · ${rel(ops.data.lastDumpAt - now)}`} />
      </Section>
      <Section title="Impact">
        <Row k="Satellite" v={sat ? `${sat.sat_id} · ${sat.constellation_group}` : alarm.sat_id} />
        <Row k="Estimated clear time" v={`${Math.max(20, Math.round(ops.data.pendingGb * 9))} min at current rate`} />
        <Row k="Deliveries at risk" v="Next customer delivery window" />
      </Section>
      <Section title="Recommended">
        <Steps items={['Check the processing queue depth and worker health on Platform health', 'Prioritise the oldest scenes; defer low-priority products', 'If the backlog exceeds two orbits, schedule an extra dump on the next contact']} />
      </Section>
      <div className="flex gap-2 flex-wrap">
        <Button variant="secondary" size="sm" onClick={() => onNavigate('platform')}>Platform health</Button>
        <Button variant="secondary" size="sm" onClick={() => onNavigate('payload')}>Payload deliveries</Button>
      </div>
    </>
  );
};
