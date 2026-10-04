import { create } from 'zustand';
import type { CopilotMessage, User, UserRole } from '../../types';
import { COPILOT_ANSWERS, FLEET } from '../../data/fleet';
import { findDef } from '../../ops/history';
import { PROCEDURES } from '../../data/mission';
import { canOpenRoute } from '../../auth/policy';
import { useAlarmStore } from '../../store/useAlarmStore';
import { useConjunctionStore } from '../../ops/conjunctionStore';
import { ALARM_MISS_KM } from '../../ops/opsAlarms';
import { useFleetStore } from '../../store/useFleetStore';
import { useMissionStore } from '../../store/useMissionStore';
import { tenantOfPerson } from '../../store/useAuthStore';
import { utc } from '../../screens/config/mdbLib';

/**
 * Ops Copilot retrieval (S22). Deterministic: every answer is assembled from the console's own
 * stores (current values, alarms, contact windows, advisories, the audit ledger, procedures) and
 * cites where each fact came from. No source, no answer. Customers only ever see their tenant's
 * satellites and never internal procedures or the ledger.
 */
type Citation = NonNullable<CopilotMessage['citations']>[number];
export interface Ctx { user: User; role: UserRole }

const SAT_RE = /\b((?:AKV|NBH|TRA)-\d{2}|OPSSAT-1)\b/i;
const no = (text: string): CopilotMessage => ({ role: 'assistant', refused: true, text });
const isCustomer = (c: Ctx) => c.role === 'Customer User';
/** Satellites this person may ask about. */
export const scopeOf = (c: Ctx): string[] => {
  if (!isCustomer(c)) return FLEET.map((s) => s.sat_id);
  return FLEET.filter((s) => c.user.satellite_scope.includes(s.sat_id)).map((s) => s.sat_id);
};

/** Only cite a screen the role can open; otherwise keep the source name and drop the link. */
const cite = (c: Ctx, doc: string, section: string, ...routes: string[]): Citation => ({ doc, section, route: routes.find((r) => canOpenRoute(r, c.role)) });

function satOf(q: string, c: Ctx): { sat?: string; refusal?: CopilotMessage } {
  const m = q.match(SAT_RE)?.[1]?.toUpperCase();
  const scope = scopeOf(c);
  if (m && !scope.includes(m)) return { refusal: no(isCustomer(c) ? `${m} is not one of ${tenantOfPerson(c.user)}'s satellites, so I have nothing I can tell you about it.` : `${m} is not in the fleet.`) };
  return { sat: m };
}

function passes(q: string, c: Ctx): CopilotMessage {
  const { sat, refusal } = satOf(q, c);
  if (refusal) return refusal;
  const scope = sat ? [sat] : scopeOf(c);
  const today = /today/i.test(q);
  const end = new Date(); end.setUTCHours(24, 0, 0, 0);
  const windows = useFleetStore.getState().contactWindows
    .filter((w) => scope.includes(w.sat_id) && Date.parse(w.los_utc) > Date.now() && (!today || Date.parse(w.aos_utc) < end.getTime()))
    .sort((a, b) => a.aos_utc.localeCompare(b.aos_utc));
  const cites = [cite(c, 'Contact schedule', sat ? `${sat} windows` : 'upcoming windows', 'schedule', isCustomer(c) ? 'customer' : 'pass')];
  if (windows.length === 0) {
    const next = FLEET.filter((s) => scope.includes(s.sat_id) && s.next_contact_utc).sort((a, b) => a.next_contact_utc!.localeCompare(b.next_contact_utc!))[0];
    return { role: 'assistant', text: `No booked pass ${today ? 'remains today ' : ''}for ${sat ?? 'your satellites'} in the contact schedule.${next ? ` The next predicted contact is ${next.sat_id} at ${utc(next.next_contact_utc!)}.` : ''}`, citations: cites };
  }
  const lines = windows.slice(0, 6).map((w) => `• ${w.sat_id} via ${w.ground_station}: ${utc(w.aos_utc)} to ${utc(w.los_utc).replace(' UTC', '')} UTC, max elevation ${w.max_elevation_deg.toFixed(0)}°, ${w.frequency_band}-band`);
  return { role: 'assistant', text: `${windows.length} pass${windows.length === 1 ? '' : 'es'} ${today ? 'booked for the rest of today' : 'coming up'} for ${sat ?? (isCustomer(c) ? 'your satellites' : 'the fleet')}:\n${lines.join('\n')}${windows.length > 6 ? `\n…and ${windows.length - 6} more.` : ''}`, citations: cites };
}

function alarms(q: string, c: Ctx): CopilotMessage {
  const { sat, refusal } = satOf(q, c);
  if (refusal) return refusal;
  const scope = sat ? [sat] : scopeOf(c);
  const open = useAlarmStore.getState().active.filter((a) => scope.includes(a.sat_id) && a.state !== 'RTN');
  const cites = [cite(c, 'Alarm console', 'open alarms', sat ? `alarms?sat=${sat}` : 'alarms', 'customer')];
  if (open.length === 0) return { role: 'assistant', text: `No open alarms on ${sat ?? (isCustomer(c) ? 'your satellites' : 'the fleet')} right now.`, citations: cites };
  const lines = open.slice(0, 6).map((a) => `• ${a.sat_id} ${a.param_id} ${a.alarm_state === 2 ? 'critical' : 'warning'} at ${Number(a.eu_value.toPrecision(4))} ${a.unit}, ${a.state === 'ACKED' ? `acknowledged by ${a.acknowledged_by}` : 'not acknowledged'}`);
  return { role: 'assistant', text: `${open.length} open alarm${open.length === 1 ? '' : 's'}:\n${lines.join('\n')}`, citations: cites };
}

function status(q: string, c: Ctx): CopilotMessage {
  const { sat, refusal } = satOf(q, c);
  if (refusal) return refusal;
  const { satellites, cvt } = useFleetStore.getState();
  const scope = sat ? [sat] : scopeOf(c);
  const lines = scope.slice(0, 8).map((id) => {
    const s = satellites[id] ?? FLEET.find((x) => x.sat_id === id)!;
    const v = cvt[id] ?? {};
    const bad = Object.values(v).filter((p) => p.alarm_state > 0).map((p) => `${p.param_id} ${Number(p.eu_value.toPrecision(4))} ${p.unit}`);
    const soc = v.BAT_SOC ? `, battery ${v.BAT_SOC.eu_value.toFixed(0)} %` : '';
    return `• ${id}: ${s.health_state.toLowerCase()}${soc}${bad.length ? `, out of limits: ${bad.slice(0, 3).join(', ')}` : ', every parameter within limits'}`;
  });
  return { role: 'assistant', text: `Current values${scope.length > 8 ? ' (first 8)' : ''}:\n${lines.join('\n')}`, citations: [cite(c, 'Current value table', 'live telemetry', sat ? `satellite?sat=${sat}` : 'fleet', 'customer')] };
}

function parameter(q: string, c: Ctx): CopilotMessage | null {
  const name = q.toUpperCase().match(/\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/)?.[0];
  if (!name || !findDef(name)) return null;
  const { sat, refusal } = satOf(q, c);
  if (refusal) return refusal;
  const id = sat ?? scopeOf(c)[0];
  const p = useFleetStore.getState().cvt[id]?.[name];
  const def = findDef(name)!.def;
  if (!p) return no(`No current value for ${name} on ${id}.`);
  return {
    role: 'assistant',
    text: `${id} ${name} (${def.name}) is ${Number(p.eu_value.toPrecision(5))} ${p.unit}, ${p.alarm_state === 2 ? 'critical' : p.alarm_state === 1 ? 'in warning' : 'within limits'}${p.quality ? ', stale' : ''}, updated ${utc(p.timestamp_utc)}. Warning band ${def.warnLo} to ${def.warnHi} ${def.unit}.`,
    citations: [cite(c, 'Current value table', `${id} ${name}`, `parameter?sat=${id}&param=${name}`, 'customer')],
  };
}

function heater(q: string, c: Ctx): CopilotMessage {
  if (isCustomer(c)) return no('Recovery procedures are internal to the operations team. Your operator handles anomalies on your satellites; I can tell you their current status or open alarms.');
  const { cvt } = useFleetStore.getState();
  const cold = Object.entries(cvt).filter(([, v]) => v.BAT_TEMP && v.BAT_TEMP.alarm_state > 0).map(([id, v]) => `${id} at ${v.BAT_TEMP.eu_value.toFixed(1)} °C`);
  const a = COPILOT_ANSWERS.heater;
  return {
    role: 'assistant',
    text: `${a.text}${cold.length ? `\n\nRight now BAT_TEMP is out of limits on ${cold.join(', ')}.` : '\n\nNo satellite has BAT_TEMP out of limits right now.'}`,
    citations: [...a.citations.map((x) => cite(c, x.doc, x.section, x.route ?? '', 'procedure')), cite(c, 'Current value table', 'BAT_TEMP across the fleet', 'fleet')],
  };
}

function flagged(q: string, c: Ctx): CopilotMessage {
  const { sat, refusal } = satOf(q, c);
  if (refusal) return refusal;
  if (!sat) return no('Name the satellite, for example AKV-08.');
  const s = useFleetStore.getState().satellites[sat] ?? FLEET.find((x) => x.sat_id === sat)!;
  const facts: string[] = [`${sat} health is ${s.health_state.toLowerCase()}.`];
  const cites: Citation[] = [cite(c, 'Fleet overview', `${sat} health`, `satellite?sat=${sat}`, 'customer')];
  const adv = useMissionStore.getState().advisories.filter((a) => a.sat_id === sat);
  if (adv.length && !isCustomer(c)) {
    facts.push(`Anomaly advisories: ${adv.map((a) => `${a.advisory_id} “${a.title}” (score ${a.score.toFixed(2)}, ${a.state.toLowerCase()})`).join('; ')}.`);
    cites.push(cite(c, 'Anomaly advisories', adv.map((a) => a.advisory_id).join(', '), `anomalies?id=${adv[0].advisory_id}`));
  }
  const open = useAlarmStore.getState().active.filter((a) => a.sat_id === sat && a.state !== 'RTN');
  facts.push(open.length ? `Open alarms: ${open.map((a) => `${a.param_id} ${a.alarm_state === 2 ? 'critical' : 'warning'}`).join(', ')}.` : 'No open alarms.');
  if (!isCustomer(c)) {
    const cmds = useMissionStore.getState().audit.filter((r) => r.sat_id === sat).slice(0, 3);
    if (cmds.length) {
      facts.push(`Recent ledger entries: ${cmds.map((r) => `${r.command_mnemonic} by ${r.operator_name} ${utc(r.timestamp_utc)} (${r.params_summary})`).join('; ')}.`);
      cites.push(cite(c, 'Audit ledger', `${sat} entries`, 'audit'));
    }
  }
  if (/safe/i.test(q)) {
    const safe = useMissionStore.getState().audit.some((r) => r.sat_id === sat && /SAFE/.test(r.command_mnemonic));
    facts.push(safe ? `${sat} has a safe-mode record.` : `I find no safe-mode entry for ${sat} in the ledger or its health history, so I cannot say it entered safe mode.`);
    if (!isCustomer(c)) { facts.push(COPILOT_ANSWERS.safe.text); cites.push(...COPILOT_ANSWERS.safe.citations.map((x) => cite(c, x.doc, x.section, x.route ?? '', 'procedure'))); }
  }
  return { role: 'assistant', text: facts.join('\n'), citations: cites };
}

function procedure(q: string, c: Ctx): CopilotMessage | null {
  if (!/procedure|how do i|what do i do|recover|steps/i.test(q)) return null;
  if (isCustomer(c)) return no('Operations procedures are internal to the operator and are not shared with customers.');
  const words = q.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const hit = PROCEDURES.find((p) => words.some((w) => `${p.name} ${p.category}`.toLowerCase().includes(w)));
  if (!hit) return null;
  return { role: 'assistant', text: `${hit.id} ${hit.name}, version ${hit.version} (${hit.state.toLowerCase().replace('_', ' ')}), ${hit.steps} steps, owned by ${hit.author}.${hit.state !== 'RELEASED' ? ' It is not released, so it must not be run on a live spacecraft.' : ''}`, citations: [cite(c, `${hit.id} ${hit.name} v${hit.version}`, 'procedure library', `editor?proc=${hit.id}`, 'procedure')] };
}

export function answer(q: string, c: Ctx): CopilotMessage {
  if (/heater|htr_|bat_temp/i.test(q)) return heater(q, c);
  if (/pass|contact|downlink window|booked/i.test(q)) return passes(q, c);
  if (/alarm/i.test(q)) return alarms(q, c);
  if (/safe mode|flagged|why .*(warning|degraded)|what happened/i.test(q)) return flagged(q, c);
  const p = parameter(q, c); if (p) return p;
  if (/status|doing|health|how (is|are)/i.test(q)) return status(q, c);
  const pr = procedure(q, c); if (pr) return pr;
  return no(`No source I can read answers that. I search ${isCustomer(c) ? 'your satellites\' status, passes and alarms' : 'current values, alarms, the contact schedule, advisories, the audit ledger and the procedure library'}, and I do not answer without a citation.`);
}

/** Conversation per person: survives navigation and closing the panel, cleared when someone else signs in. */
export const useCopilotStore = create<{ owner: string; messages: CopilotMessage[]; set: (owner: string, m: CopilotMessage[]) => void }>((set) => ({
  owner: '', messages: [], set: (owner, messages) => set({ owner, messages }),
}));
