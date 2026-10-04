import React from 'react';
import { Banner, SampleTag, Tile } from '../molecules/Page';
import { MultiPlot } from './MultiPlot';
import { FLEET, STATIONS } from '../../data/fleet';
import { findDef, fmtNum, fmtUtc, history, recentSamples } from '../../ops/history';
import { getSatOps } from '../../ops/satOps';
import { UAlarm } from '../../ops/opsAlarms';
import { useFleetStore } from '../../store/useFleetStore';
import { useMissionStore } from '../../store/useMissionStore';
import { stationColor } from '../../ops/colors';
import { RoleLink } from '../../screens/telemetry/RoleLink';
import type { Alarm } from '../../types';

const rel = (ms: number) => { const m = Math.round(Math.abs(ms) / 60000); const s = m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; return ms >= 0 ? `in ${s}` : `${s} ago`; };

const Row: React.FC<{ k: string; v: React.ReactNode; tone?: string }> = ({ k, v, tone }) => (
  <div className="flex justify-between gap-4 text-[13px] py-1">
    <span className="text-[#9AA3B2]">{k}</span><span className="text-right" style={tone ? { color: tone } : undefined}>{v}</span>
  </div>
);
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <Tile className="flex flex-col gap-1">
    <span className="text-[12.5px] text-[#7C8594]">{title}</span>
    {children}
  </Tile>
);

export interface Advice { text: string; links: { to: string; label: string }[] }

/** What an operator should do about a health alarm, with the screens that fix it. */
export function adviceFor(a: Alarm, heaterFault: boolean): Advice {
  const hist = { to: `satellite?sat=${a.sat_id}&mode=history&param=${a.param_id}`, label: `Open ${a.param_id} history` };
  if (a.param_id === 'BAT_TEMP' || a.param_id === 'BAT_BAY_TEMP' || a.param_id.startsWith('HTR_')) {
    return {
      text: heaterFault
        ? 'Heater A has stopped heating the battery. Run PR-THM-004 to switch to heater B. The heater B command is critical and needs a Flight Director who did not raise it.'
        : 'Battery temperature is outside its limits. Check heater duty (HTR_A_DUTY, HTR_B_STATE) and run PR-THM-004 if a heater has failed.',
      links: [{ to: 'procedure', label: 'Open PR-THM-004 in the procedure runner' }, hist],
    };
  }
  const d = findDef(a.param_id)?.def;
  const low = d ? a.eu_value <= d.warnLo : false;
  const limit = d ? (a.alarm_state === 2 ? (low ? d.critLo : d.critHi) : (low ? d.warnLo : d.warnHi)) : undefined;
  return {
    text: `${a.param_id} is ${low ? 'below' : 'above'} its ${a.alarm_state === 2 ? 'critical' : 'warning'} limit${limit !== undefined ? ` of ${fmtNum(limit)} ${a.unit}` : ''}. Compare it with the other ${a.subsystem.toLowerCase()} parameters and follow the ${a.subsystem.toLowerCase()} contingency procedure if it keeps moving.`,
    links: [{ to: `satellite?sat=${a.sat_id}&tab=${a.subsystem}`, label: `Open ${a.sat_id} ${a.subsystem.toLowerCase()}` }, hist],
  };
}

const Links: React.FC<{ links: { to: string; label: string }[]; onNavigate: (to: string) => void }> = ({ links, onNavigate }) => (
  <span className="flex flex-col gap-1.5 pt-1">{links.map((l) => <RoleLink key={l.to + l.label} to={l.to} onNavigate={onNavigate}>{l.label}</RoleLink>)}</span>
);

/** The analysis behind an alarm. What it shows depends on what kind of alarm it is. */
export const AlarmDetail: React.FC<{ alarm: UAlarm; onNavigate: (to: string) => void }> = ({ alarm, onNavigate }) => {
  const cvt = useFleetStore((s) => s.cvt);
  const windows = useFleetStore((s) => s.contactWindows);
  const commands = useMissionStore((s) => s.commands);
  const heaterFault = useMissionStore((s) => s.heaterFault);
  const now = Date.now();

  if (alarm.category === 'HEALTH' && alarm.health) {
    const a = alarm.health;
    const found = findDef(a.param_id);
    const live = cvt[a.sat_id]?.[a.param_id];
    const ts = Array.from({ length: 120 }, (_, i) => Math.floor(now / 1000) - (119 - i) * 15);
    const advice = adviceFor(a, heaterFault);
    const real = recentSamples(a.sat_id, a.param_id).length;
    return (
      <>
        <span className="flex items-baseline gap-2">
          <span className="text-[38px] font-semibold tracking-[-0.02em] tabular-nums" style={{ color: (live?.alarm_state ?? a.alarm_state) === 2 ? '#FF7A7A' : (live?.alarm_state ?? a.alarm_state) === 1 ? '#F5C451' : '#E9ECF1' }}>
            {fmtNum(live?.eu_value ?? a.eu_value)}
          </span>
          <span className="text-[14px] text-[#7C8594]">{a.unit} {live ? 'now' : 'when raised'}</span>
        </span>
        {found && (
          <div className="flex flex-col gap-1">
            <MultiPlot timestamps={ts} height={140} compact syncKey={`al-${a.alarm_id}`} onReady={() => {}} onXRange={() => {}}
              markers={[{ t: Date.parse(a.timestamp_utc) / 1000, color: a.alarm_state === 2 ? '#FF6B6B' : '#F5C451', label: `Raised ${fmtUtc(Date.parse(a.timestamp_utc))}` }]}
              series={[{ label: a.param_id, color: '#FF7A7A', unit: a.unit, values: history(a.sat_id, found.def, live?.eu_value ?? a.eu_value, ts), limits: { lowSoft: found.def.warnLo, hiSoft: found.def.warnHi, lowHard: found.def.critLo, hiHard: found.def.critHi } }]} />
            <span className="flex flex-wrap justify-between gap-2 text-[11.5px] font-mono-code text-[#6B7383]">
              <span>last 30 min</span><span>limits {fmtNum(found.def.critLo)} · {fmtNum(found.def.warnLo)} · {fmtNum(found.def.warnHi)} · {fmtNum(found.def.critHi)} {a.unit}</span>
            </span>
            <SampleTag className="self-start">{real > 1 ? `Reconstructed — archive not connected (${real} live samples this session)` : 'Reconstructed — archive not connected'}</SampleTag>
          </div>
        )}
        <Section title="What to do">
          <p className="text-[13px] leading-[1.5] text-[#C9CED6]">{advice.text}</p>
          <Links links={advice.links} onNavigate={onNavigate} />
        </Section>
        {a.timeline && a.timeline.length > 0 && (
          <Section title="Timeline">
            {a.timeline.map((t, i) => (
              <div key={i} className="flex gap-3 text-[12.5px]"><span className="font-mono-code text-[#9AA3B2] shrink-0">{fmtUtc(Date.parse(t.utc), true)}</span><span>{t.text}</span></div>
            ))}
          </Section>
        )}
      </>
    );
  }

  if (alarm.category === 'CONJUNCTION' && alarm.conjunction) {
    const c = alarm.conjunction;
    // Indicative only: a Gaussian falloff against an assumed 1 km position uncertainty. Real Pc needs covariance.
    const pc = Math.exp(-((c.missKm / 1.5) ** 2) / 2) * 1e-3;
    return (
      <>
        <Banner kind={c.risk === 'CRITICAL' ? 'crit' : 'warn'} lead={c.risk === 'CRITICAL' ? 'Critical approach.' : 'Close approach.'}>
          {c.satId} passes {fmtNum(c.missKm, 1)} km from {c.objectName} {rel(c.tcaMs - now)}, closing at {fmtNum(c.relSpeedKms, 1)} km/s.
        </Banner>
        <Section title="Encounter">
          <Row k="Closest approach" v={`${fmtUtc(c.tcaMs, true)} UTC`} />
          <Row k="Miss distance" v={`${fmtNum(c.missKm, 2)} km`} tone={c.risk === 'CRITICAL' ? '#FF7A7A' : '#F5C451'} />
          <Row k="Relative speed" v={`${fmtNum(c.relSpeedKms, 2)} km/s`} />
          <Row k="Indicative collision probability" v={pc.toExponential(1)} />
          <Row k="Object" v={`${c.objectName} · ${c.kind === 'DEBRIS' ? 'debris' : c.kind === 'ROCKET_BODY' ? 'rocket body' : 'defunct satellite'}`} />
          <SampleTag className="self-start mt-1">Demo catalogue, not live tracking data</SampleTag>
        </Section>
        <Section title="What to do">
          <p className="text-[13px] leading-[1.5] text-[#C9CED6]">Get an updated conjunction data message, have flight dynamics assess an avoidance manoeuvre before TCA minus 6 h, and book a contact before TCA in case a burn is needed.</p>
          <Links onNavigate={onNavigate} links={[{ to: 'orbits', label: 'Review conjunction in orbits and conjunctions' }, { to: 'fleet?view=globe', label: 'Show in the 3D view' }]} />
        </Section>
      </>
    );
  }

  if (alarm.category === 'PAYLOAD') {
    const ops = getSatOps(alarm.sat_id, now);
    const affected = ops.events.filter((e) => e.kind === 'IMAGING' && e.at > now);
    return (
      <>
        <Section title="Payload state">
          <Row k="Status" v={ops.payload.status.charAt(0) + ops.payload.status.slice(1).toLowerCase()} tone="#FF7A7A" />
          <Row k="Last imaging" v={ops.payload.lastImaging ? `${fmtUtc(ops.payload.lastImaging.at)} · ${ops.payload.lastImaging.target}` : '—'} />
          <Row k="Data on board" v={`${fmtNum(ops.data.pendingGb)} GB`} />
          <Row k="Planned imaging affected" v={affected.length} />
        </Section>
        <Section title="What to do">
          <p className="text-[13px] leading-[1.5] text-[#C9CED6]">Confirm the fault in payload telemetry (PL_TEMP, TX_POWER), hold new imaging for this satellite, and run the payload health check on the next contact.</p>
          <Links onNavigate={onNavigate} links={[{ to: `satellite?sat=${alarm.sat_id}&tab=PAYLOAD`, label: 'Open payload telemetry' }, { to: 'payload', label: 'Payload deliveries' }]} />
        </Section>
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
            <Row k="Command" v={<span className="font-mono-code">{cmd.mnemonic} {Object.entries(cmd.params).map(([k, v]) => `${k}=${v}`).join(' ')}</span>} />
            <Row k="Status" v={cmd.status.charAt(0) + cmd.status.slice(1).toLowerCase()} tone="#FF7A7A" />
            <Row k="Requested by" v={cmd.requested_by} />
            <Row k="Approved by" v={cmd.approved_by ?? '—'} />
          </Section>
        ) : (
          <Section title="Procedure uplink">
            <Row k="Procedure" v={ops.uplink.procedure} />
            <Row k="Uplinked" v={`${ops.uplink.pct} %`} tone="#F5C451" />
            <Row k="Started" v={`${fmtUtc(ops.uplink.startedAt)} · ${rel(ops.uplink.startedAt - now)}`} />
          </Section>
        )}
        <Section title="What to do">
          <p className="text-[13px] leading-[1.5] text-[#C9CED6]">Check COP-1 state on Uplink, resume from the last acknowledged frame on the next contact, or correct and resubmit a rejected command.</p>
          <Links onNavigate={onNavigate} links={[{ to: `uplink?sat=${alarm.sat_id}`, label: 'Open uplink and COP-1' }, { to: 'procedure', label: 'Procedure runner' }]} />
        </Section>
      </>
    );
  }

  if (alarm.category === 'GROUND') {
    const st = STATIONS.find((s) => s.id === alarm.ref);
    const upcoming = windows.filter((w) => w.ground_station === alarm.ref && Date.parse(w.los_utc) > now);
    return (
      <>
        {st && (
          <Section title="Station">
            <Row k="Station" v={<span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full" style={{ background: stationColor(st.id) }} />{st.id} · {st.name}</span>} />
            <Row k="Provider" v={`${st.provider} · ${st.protocol}`} />
            <Row k="Adapter" v={st.adapter_health.charAt(0) + st.adapter_health.slice(1).toLowerCase()} tone={st.adapter_health === 'DOWN' ? '#FF7A7A' : '#F5C451'} />
            <Row k="Contacts affected" v={upcoming.length} />
          </Section>
        )}
        <Section title="What to do">
          <p className="text-[13px] leading-[1.5] text-[#C9CED6]">Move the affected contacts to another station and ask the ground station engineer to check the adapter.</p>
          <Links onNavigate={onNavigate} links={[{ to: 'stations', label: 'Ground stations' }, { to: 'schedule', label: 'Contact schedule' }]} />
        </Section>
      </>
    );
  }

  const ops = getSatOps(alarm.sat_id, now);
  const sat = FLEET.find((s) => s.sat_id === alarm.sat_id);
  return (
    <>
      <Section title="Data chain">
        <Row k="Satellite" v={sat ? `${sat.sat_id} · ${sat.constellation_group}` : alarm.sat_id} />
        <Row k="Downloaded" v={`${ops.data.downlinkedPct} %`} />
        <Row k="Processed" v={`${ops.data.processedPct} %`} tone="#F5C451" />
        <Row k="Pending on board" v={`${fmtNum(ops.data.pendingGb)} GB`} />
      </Section>
      <Section title="What to do">
        <p className="text-[13px] leading-[1.5] text-[#C9CED6]">Check processing worker health, prioritise the oldest scenes, and schedule an extra dump if the backlog exceeds two orbits.</p>
        <Links onNavigate={onNavigate} links={[{ to: 'platform', label: 'Platform health' }, { to: 'payload', label: 'Payload deliveries' }]} />
      </Section>
    </>
  );
};
