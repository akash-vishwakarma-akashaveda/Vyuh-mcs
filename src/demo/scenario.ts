/**
 * THE demo world. Every screen reads its sample state from stores seeded here, so a fact (an alarm,
 * an approval, a request, a person) is the same wherever it shows. All times are relative to T0, the
 * moment the world was seeded (see ./persist.ts), so the world reads "now" on every load and stays
 * put across reloads. What exists and where it shows: docs/ui-redesign/DEMO_DATA.md.
 *
 * Reference data that is not state (fleet geometry, stations, the parameter dictionary, procedures,
 * the command dictionary) stays in data/fleet.ts and data/mission.ts.
 */
import type { Advisory, Alarm, AuditRecord, NotificationDelivery, OnCallEntry, PassReport, PassSession } from '../types';
import { PARAMETERS } from '../data/fleet';
import { INVITE_KEYS, PEOPLE } from '../store/useAuthStore';
import { T0 } from './persist';
import { satContacts } from '../orbit/contacts';

export { T0 };

const MIN = 60_000, H = 3_600_000, DAY = 86_400_000;
/** Epoch ms `min` minutes after T0 (negative = before). */
export const at = (min: number) => T0 + min * MIN;
export const isoAt = (min: number) => new Date(at(min)).toISOString();
const YMD = new Date(T0).toISOString().slice(0, 10).replace(/-/g, '');
const DOY = (() => { const d = new Date(T0); return `${d.getUTCFullYear() % 100}${String(Math.floor((T0 - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY) + 1).padStart(3, '0')}`; })();
const idOf = (name: string) => PEOPLE.find((p) => p.name === name)?.id ?? 'SYS';
const paramText = (p: Record<string, string | number>) => Object.entries(p).map(([k, v]) => `${k}=${v}`).join(' ');

// ---- people ---------------------------------------------------------------------------------------
// The people are exactly useAuthStore's PEOPLE; the names below are used for who did what.
const VIKRAM = 'Vikram Shetty', ANANYA = 'Ananya Rao', ARJUN = 'Arjun Desai', MEERA = 'Meera Iyer', KARAN = 'Karan Malhotra',
  SANJAY = 'Sanjay Kulkarni', FARAH = 'Farah Siddiqui', ROHIT = 'Rohit Nair', NISHA = 'Nisha Pillai', LEENA = 'Leena Joseph';

// ---- satellite conditions and their alarms --------------------------------------------------------
/**
 * The satellites that sit off-nominal (every one a warning: nothing opens critical, the guided demo
 * puts AKV-03 there itself). The telemetry engine holds each value on its side of the limit, the
 * fleet health and the alarm list follow from it, and each has exactly one open alarm.
 */
export interface Condition {
  alarmId: string; sat: string; param: string; value: number; raised: number;
  ack?: { by: string; min: number };
  shelve?: { by: string; min: number; untilMin: number; reason: string };
  advisoryId?: string;
}
export const CONDITIONS: Condition[] = [
  { alarmId: 'AL-7101', sat: 'AKV-08', param: 'RW1_SPEED', value: 5240, raised: -200, ack: { by: VIKRAM, min: -190 }, advisoryId: 'AN-398' },
  { alarmId: 'AL-7102', sat: 'AKV-11', param: 'IMAGER_TEMP', value: 2.4, raised: -30 },
  { alarmId: 'AL-7103', sat: 'AKV-14', param: 'BUS_VOLTAGE', value: 25.6, raised: -48, ack: { by: ANANYA, min: -42 } },
  { alarmId: 'AL-7104', sat: 'AKV-22', param: 'TX_TEMP', value: 61.4, raised: -110, ack: { by: VIKRAM, min: -95 }, advisoryId: 'AN-393' },
  { alarmId: 'AL-7105', sat: 'AKV-31', param: 'STORAGE_USED', value: 902, raised: -70, shelve: { by: VIKRAM, min: -20, untilMin: 160, reason: 'Dump re-planned on the next pass' }, advisoryId: 'AN-396' },
  { alarmId: 'AL-7106', sat: 'AKV-39', param: 'RAD_TEMP', value: 11.2, raised: -15 },
  { alarmId: 'AL-7107', sat: 'NBH-02', param: 'BAT_SOC', value: 38.4, raised: -75, advisoryId: 'AN-395' },
  { alarmId: 'AL-7108', sat: 'TRA-01', param: 'SNR', value: 7.4, raised: -55 },
];
/** Satellite → its held off-nominal values (what the telemetry engine reads). */
export const SAT_CONDITIONS: Record<string, { param: string; value: number }[]> = CONDITIONS.reduce((m, c) => {
  (m[c.sat] ??= []).push({ param: c.param, value: c.value });
  return m;
}, {} as Record<string, { param: string; value: number }[]>);

const defOf = (param: string) => {
  for (const [sub, ps] of Object.entries(PARAMETERS)) { const p = ps.find((x) => x.param_id === param); if (p) return { sub, p }; }
  throw new Error(`scenario: unknown parameter ${param}`);
};
const conditionText = (param: string, value: number) => {
  const { p } = defOf(param);
  return value >= p.warnHi ? `${param} above ${p.warnHi} ${p.unit}`.trim() : `${param} below ${p.warnLo} ${p.unit}`.trim();
};

export const ALARMS: Alarm[] = CONDITIONS.map((c) => {
  const { sub, p } = defOf(c.param);
  const timeline = [{ utc: isoAt(c.raised), text: `${conditionText(c.param, c.value)} (warning)` }];
  if (c.ack) timeline.push({ utc: isoAt(c.ack.min), text: `Acknowledged by ${c.ack.by}` });
  if (c.shelve) timeline.push({ utc: isoAt(c.shelve.min), text: `Shelved by ${c.shelve.by} for ${c.shelve.untilMin - c.shelve.min} min: ${c.shelve.reason}` });
  return {
    alarm_id: c.alarmId, sat_id: c.sat, param_id: c.param, subsystem: sub, alarm_state: 1, eu_value: c.value, unit: p.unit,
    limit_low_soft: p.warnLo, limit_hi_soft: p.warnHi, limit_low_hard: p.critLo, limit_hi_hard: p.critHi,
    timestamp_utc: isoAt(c.raised), condition: conditionText(c.param, c.value), advisory_id: c.advisoryId,
    acknowledged: !!c.ack, acknowledged_by: c.ack?.by, acknowledged_utc: c.ack && isoAt(c.ack.min), owner: c.ack?.by ?? c.shelve?.by,
    state: c.shelve ? 'SHELVED' : c.ack ? 'ACKED' : 'UNACK',
    shelve_reason: c.shelve?.reason, shelved_until_utc: c.shelve && isoAt(c.shelve.untilMin), timeline,
  };
});

/** Operational alarms that are not telemetry limits (see ops/opsAlarms.ts). */
export const PAYLOAD_FAULTS: Record<string, number> = { 'AKV-11': at(-30) };   // imager too warm (AL-7102): imaging suspended
export const DATA_BACKLOG: Record<string, number> = { 'AKV-31': at(-70) };     // mass memory near full (AL-7105)
export const STATION_FAULT_SINCE = at(-180);                                   // SGP maintenance, AWS adapter degraded
/** Derived alarms already acknowledged (id → who, when). */
export const DERIVED_ACKS: Record<string, { by: string; at: number }> = { 'GS-SGP': { by: VIKRAM, at: at(-170) } };

// ---- AI advisories --------------------------------------------------------------------------------
export const ADVISORIES: Advisory[] = [
  { advisory_id: 'AN-398', sat_id: 'AKV-08', tier: 'T2', score: 0.74, title: 'Reaction wheel 1 friction trend rising',
    detail: 'Wheel 1 current draw is 8 % above its 30-day baseline at the same speed; its speed is above the 5,000 RPM warning (AL-7101).',
    detected_utc: isoAt(-185), state: 'NEW', linked_alarm_id: 'AL-7101', model: 'mv-adcs 2.4.1',
    contributors: [{ param: 'RW1_SPEED', contribution: 0.42 }, { param: 'BUS_CURRENT', contribution: 0.19 }] },
  { advisory_id: 'AN-397', sat_id: 'AKV-05', tier: 'T3', score: 0.61, title: 'Payload sensor temperature drifting',
    detail: 'Slow upward drift of 0.3 °C/day over 9 days, still inside limits.', detected_utc: isoAt(-10 * 60), state: 'CONFIRMED', model: 'mv-thermal 1.9.0',
    contributors: [{ param: 'PL_TEMP', contribution: 0.55 }] },
  { advisory_id: 'AN-396', sat_id: 'AKV-31', tier: 'T2', score: 0.68, title: 'Mass memory filling faster than the downlink drains it',
    detail: 'Storage has risen every orbit for 3 days and is now above the 900 GB warning (AL-7105).',
    detected_utc: isoAt(-7 * 60), state: 'NEW', linked_alarm_id: 'AL-7105', model: 'mv-payload 1.2.0',
    contributors: [{ param: 'STORAGE_USED', contribution: 0.71 }, { param: 'FRAMES_CAPTURED', contribution: 0.18 }] },
  { advisory_id: 'AN-395', sat_id: 'NBH-02', tier: 'T3', score: 0.55, title: 'Battery recharge slower after eclipse',
    detail: 'Time to 80 % state of charge has grown 11 % over 30 days; charge is now below the 40 % warning (AL-7107).',
    detected_utc: isoAt(-15 * 60), state: 'NEW', linked_alarm_id: 'AL-7107', model: 'mv-power 3.1.2',
    contributors: [{ param: 'BAT_SOC', contribution: 0.48 }, { param: 'ARRAY_I', contribution: 0.31 }] },
  { advisory_id: 'AN-394', sat_id: 'AKV-01', tier: 'T4', score: 0.34, title: 'On-board time drift within limits but trending',
    detail: 'Drift has grown 0.4 ms per day since the last correlation.', detected_utc: isoAt(-30 * 60), state: 'DISMISSED', model: 'mv-obc 0.9.4',
    contributors: [{ param: 'OBT_DRIFT', contribution: 0.88 }] },
  { advisory_id: 'AN-393', sat_id: 'AKV-22', tier: 'T2', score: 0.72, title: 'Transmitter temperature rising during long downlinks',
    detail: 'Peak TX_TEMP rose 6 °C across the last five X-band passes and is now above the 60 °C warning (AL-7104).',
    detected_utc: isoAt(-130), state: 'CONFIRMED', linked_alarm_id: 'AL-7104', model: 'mv-comms 2.0.1',
    contributors: [{ param: 'TX_TEMP', contribution: 0.62 }, { param: 'TX_POWER', contribution: 0.21 }] },
];
/** Decisions on the decided advisories (who, as which role, when, why). */
export const ADVISORY_DECISIONS: Record<string, { state: 'CONFIRMED' | 'DISMISSED'; by: string; role: 'ML Engineer' | 'Spacecraft Operator'; min: number; reason: string }> = {
  'AN-397': { state: 'CONFIRMED', by: LEENA, role: 'ML Engineer', min: -8 * 60, reason: 'Matches the seasonal thermal model; watch it' },
  'AN-394': { state: 'DISMISSED', by: LEENA, role: 'ML Engineer', min: -26 * 60, reason: 'Drift is corrected by the next time correlation' },
  'AN-393': { state: 'CONFIRMED', by: VIKRAM, role: 'Spacecraft Operator', min: -92, reason: 'Same trend as AL-7104; shorten X-band dumps' },
};

/** Raised by the guided demo's heater story (see useDemoStore, mockTelemetryEngine). */
export const DEMO_ADVISORY: Advisory = {
  advisory_id: 'AN-401', sat_id: 'AKV-03', tier: 'T1', score: 0.93,
  title: 'Battery temperature falling while heater A runs at 97 % duty',
  detail: 'Multivariate model: BAT_TEMP is falling while HTR_A_DUTY is saturated — heater A likely failed.',
  detected_utc: '', state: 'NEW', model: 'mv-power 3.1.2',
  contributors: [{ param: 'BAT_TEMP', contribution: 0.51 }, { param: 'HTR_A_DUTY', contribution: 0.34 }, { param: 'BUS_VOLTAGE', contribution: 0.09 }],
};

// ---- commands and approvals -----------------------------------------------------------------------
export type CmdStatus = 'AWAITING_APPROVAL' | 'COMPLETED' | 'FAILED' | 'REJECTED' | 'CANCELLED';
export interface ScenarioCommand {
  id: string; sat: string; mnemonic: string; params: Record<string, string | number>; by: string; role: string; min: number;
  status: CmdStatus; source: string; reason?: string; note?: string;
  procedure?: { id: string; version: string };
  approval?: { id: string; expiresMin: number; interlocks: { param: string; value: string; rule: string; pass: boolean }[]; decided?: { by: string; min: number; approve: boolean; reason?: string } };
  /** When it was cancelled (by the requester). */
  cancelledMin?: number;
}
/** Oldest first. Two wait for a Flight Director; three were decided today; the rest went straight to the uplink. */
export const COMMANDS: ScenarioCommand[] = [
  { id: 'CMD-7690', sat: 'AKV-07', mnemonic: 'IMG_CAPTURE', params: { FRAMES: 8, EXPOSURE_MS: 5 }, by: VIKRAM, role: 'Spacecraft Operator', min: -318, status: 'COMPLETED', source: 'Command console' },
  { id: 'CMD-7691', sat: 'AKV-07', mnemonic: 'DUMP_START', params: { VCID: 7, RATE: 'HIGH' }, by: VIKRAM, role: 'Spacecraft Operator', min: -314, status: 'FAILED', source: 'Command console',
    note: 'No PUS-1 completion report before LOS: SVL lost the downlink for 60 s' },
  { id: 'CMD-7692', sat: 'AKV-01', mnemonic: 'HK_RATE_SET', params: { RATE_HZ: 1 }, by: VIKRAM, role: 'Spacecraft Operator', min: -180, status: 'COMPLETED', source: 'Command console' },
  { id: 'CMD-7693', sat: 'AKV-08', mnemonic: 'RW_DESAT', params: { WHEEL: 1, DURATION: 300 }, by: VIKRAM, role: 'Spacecraft Operator', min: -150, status: 'REJECTED', source: 'Command console',
    reason: 'Wheel 1 speed above 5,000 RPM (AL-7101)',
    approval: { id: 'AP-7693', expiresMin: -30, interlocks: [{ param: 'ATT_ERR', value: '0.026 °', rule: '< 0.08 °', pass: true }],
      decided: { by: ARJUN, min: -146, approve: false, reason: 'A 300 s single-wheel dump is too long in this eclipse; desaturate all wheels for 30 s on the next pass' } } },
  { id: 'CMD-7694', sat: 'AKV-01', mnemonic: 'HTR_SWITCH', params: { HEATER: 'A', STATE: 'ON' }, by: VIKRAM, role: 'Spacecraft Operator', min: -96, status: 'COMPLETED', source: 'Command console',
    reason: 'Battery bay cooling ahead of a long eclipse',
    approval: { id: 'AP-7694', expiresMin: -76, interlocks: [{ param: 'BAT_TEMP', value: '17.9 °C', rule: 'must be < 30.0 °C', pass: true }], decided: { by: ANANYA, min: -94, approve: true } } },
  { id: 'CMD-7695', sat: 'AKV-03', mnemonic: 'IMG_CAPTURE', params: { FRAMES: 8, EXPOSURE_MS: 5 }, by: VIKRAM, role: 'Spacecraft Operator', min: -46, status: 'COMPLETED', source: 'PR-PL-022 step 2',
    reason: 'PR-PL-022 step 2: Capture an 8-frame imaging sequence', procedure: { id: 'PR-PL-022', version: '3.3.0' } },
  { id: 'CMD-7696', sat: 'AKV-03', mnemonic: 'DUMP_START', params: { VCID: 7, RATE: 'HIGH' }, by: VIKRAM, role: 'Spacecraft Operator', min: -44, status: 'COMPLETED', source: 'PR-PL-022 step 4',
    reason: 'PR-PL-022 step 4: Start the mass-memory dump on VC 7', procedure: { id: 'PR-PL-022', version: '3.3.0' } },
  { id: 'CMD-7697', sat: 'AKV-14', mnemonic: 'HTR_SWITCH', params: { HEATER: 'B', STATE: 'OFF' }, by: ANANYA, role: 'Spacecraft Operator', min: -40, status: 'COMPLETED', source: 'Command console',
    reason: 'Shed heater B load while the bus voltage is low (AL-7103)',
    approval: { id: 'AP-7697', expiresMin: -20, interlocks: [{ param: 'BUS_VOLTAGE', value: '25.6 V', rule: 'must be > 24.0 V', pass: true }], decided: { by: ARJUN, min: -37, approve: true } } },
  { id: 'CMD-7698', sat: 'AKV-31', mnemonic: 'DUMP_START', params: { VCID: 7, RATE: 'LOW' }, by: VIKRAM, role: 'Spacecraft Operator', min: -22, status: 'CANCELLED', source: 'Command console', cancelledMin: -21 },
  { id: 'CMD-7701', sat: 'AKV-08', mnemonic: 'RW_DESAT', params: { WHEEL: 'ALL', DURATION: 30 }, by: VIKRAM, role: 'Spacecraft Operator', min: -25, status: 'AWAITING_APPROVAL', source: 'Command console',
    reason: 'Wheel 1 still above 5,000 RPM (AL-7101): desaturate all wheels for 30 s, as Arjun Desai asked',
    approval: { id: 'AP-7701', expiresMin: 180, interlocks: [{ param: 'ATT_ERR', value: '0.024 °', rule: '< 0.08 °', pass: true }] } },
  { id: 'CMD-7702', sat: 'AKV-39', mnemonic: 'HTR_SWITCH', params: { HEATER: 'A', STATE: 'OFF' }, by: ANANYA, role: 'Spacecraft Operator', min: -12, status: 'AWAITING_APPROVAL', source: 'Command console',
    reason: 'Radiator above its 10 °C warning (AL-7106): switch heater A off until it settles',
    approval: { id: 'AP-7702', expiresMin: 150, interlocks: [{ param: 'RAD_TEMP', value: '11.2 °C', rule: 'must be > -40.0 °C', pass: true }] } },
];

/** COP-1 state before this console sent anything: stable per satellite. */
export function fopSeed(satId: string) {
  let h = 7;
  for (const ch of satId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const base = 20 + (h % 200);
  return { state: 'S1' as const, vS: base, nnR: base, lockout: false, wait: false, retransmit: false, farmB: h % 8, epoch: 12 + (h % 9), owner: `tc-encoder-${1 + (h % 3)}`, retransmissions: 0 };
}

export const SEED_COMMANDS = [...COMMANDS].reverse().map((c) => ({
  command_id: c.id, sat_id: c.sat, mnemonic: c.mnemonic, params: c.params, status: c.status, requested_by: c.by,
  approved_by: c.approval?.decided?.approve ? c.approval.decided.by : undefined, epoch: fopSeed(c.sat).epoch, utc: isoAt(c.min),
  critical: !!c.approval, radiated: c.status === 'COMPLETED' || c.status === 'FAILED', source: c.source, approval_id: c.approval?.id,
  note: c.note ?? (c.cancelledMin !== undefined ? `Cancelled by ${c.by}` : undefined),
}));

export const SEED_APPROVALS = [...COMMANDS].reverse().filter((c) => c.approval).map((c) => {
  const a = c.approval!;
  return {
    approval_id: a.id, command_id: c.id, sat_id: c.sat, mnemonic: c.mnemonic, params: c.params, reason: c.reason ?? '',
    requested_by: c.by, requester_role: c.role, requested_utc: isoAt(c.min), expires_utc: isoAt(a.expiresMin),
    state: (a.decided ? (a.decided.approve ? 'APPROVED' : 'REJECTED') : 'PENDING') as 'PENDING' | 'APPROVED' | 'REJECTED',
    decided_by: a.decided?.by, decided_utc: a.decided && isoAt(a.decided.min), reject_reason: a.decided?.reason,
    interlocks: a.interlocks, source: c.source, procedure_id: c.procedure?.id, procedure_version: c.procedure?.version,
  };
});

// ---- procedures: one finished run ---------------------------------------------------------------
export const PROCEDURE_RUN = {
  id: `${YMD}-0410`, procId: 'PR-PL-022', version: '3.3.0', satId: 'AKV-03', startedBy: VIKRAM, startedRole: 'Spacecraft Operator',
  startedMin: -47, finishedMin: -40, commands: ['CMD-7695', 'CMD-7696'],
};

// ---- passes and reports -------------------------------------------------------------------------
const pass = (sat: string, station: string, n: number, aos: number, los: number, state: PassSession['state'], maxEl: number, booking: PassSession['booking'] = 'BOOKED'): PassSession => ({
  session_id: `LS-${YMD}-${station}-${String(n).padStart(4, '0')}`, sat_id: sat, station_id: station,
  aos_utc: isoAt(aos), tca_utc: isoAt((aos + los) / 2), los_utc: isoAt(los), state, max_elevation_deg: maxEl,
  frames_per_s: state === 'ACTIVE' ? 258 : 0, spool_depth: state === 'ACTIVE' ? 1 : 0, gaps: 0, e2e_latency_p99_ms: state === 'ACTIVE' ? 76 : 0,
  standby_gateway: state === 'ACTIVE' ? 'READY' : 'NONE', booking, virtual_channels: [],
});
const SCHEDULED = ['AKV-01', 'AKV-05', 'AKV-08', 'NBH-01', 'AKV-02', 'AKV-07', 'TRA-01', 'AKV-22', 'NBH-02', 'TRA-02'];
const SCHED_ST = ['BLR', 'SVL', 'PTH', 'HYD', 'AWS', 'BLR', 'SGP', 'PTH', 'HYD', 'SVL'];
/**
 * Scripted passes: AKV-03 over HYD now (the guided demo's pass), the next scheduled passes, and the
 * passes already flown today (every pass report and payload session below belongs to one of them).
 * Order matters: [0] is the live pass, [1] a scheduled one (the pass monitor uses it as a template).
 */
export const PASSES: PassSession[] = [
  { ...pass('AKV-03', 'HYD', 412, -4, 7, 'ACTIVE', 46), virtual_channels: [
    { vcid: 0, name: 'Housekeeping', frames_per_s: 120, gaps: 0, backfill: '—' },
    { vcid: 1, name: 'Events', frames_per_s: 18, gaps: 0, backfill: '—' },
    { vcid: 7, name: 'Payload bulk', frames_per_s: 120, gaps: 1, backfill: 'HYD recording' },
  ] },
  ...SCHEDULED.map((sat, i) => pass(sat, SCHED_ST[i], 413 + i, 14 + i * 39, 25 + i * 39, 'SCHEDULED', 28 + ((i * 11) % 55),
    i === 2 ? 'SHIFTED' : i === 4 ? 'PREDICTED' : i === 6 ? 'CANCELLED' : 'BOOKED')),
  pass('AKV-03', 'HYD', 411, -48, -37, 'COMPLETE', 52),
  pass('NBH-02', 'BLR', 410, -24, -13, 'COMPLETE', 38),
  pass('AKV-01', 'BLR', 408, -184, -173, 'COMPLETE', 61),
  pass('NBH-01', 'HYD', 406, -212, -201, 'COMPLETE', 44),
  pass('AKV-07', 'SVL', 404, -322, -309, 'COMPLETE', 57),
  pass('AKV-10', 'PTH', 403, -372, -361, 'COMPLETE', 35),
  pass('TRA-01', 'SVL', 402, -412, -399, 'COMPLETE', 29),
];
const sid = (sat: string, station: string) => PASSES.find((p) => p.sat_id === sat && p.station_id === station && p.state === 'COMPLETE')!.session_id;

export const PASS_REPORTS: PassReport[] = [
  { report_id: `PR-${YMD}-HYD-0411`, session_id: sid('AKV-03', 'HYD'), sat_id: 'AKV-03', station_id: 'HYD', aos_utc: isoAt(-48), los_utc: isoAt(-37), status: 'PROVISIONAL',
    completeness_pct: 99.4, frames_expected: 9440, frames_received: 9389, duplicates_merged: 110, latency_p50_ms: 41, latency_p95_ms: 68, latency_p99_ms: 84,
    gaps: [{ from_utc: isoAt(-43), to_utc: isoAt(-42), frames: 51, backfill: 'RUNNING', source: 'HYD recording' }],
    commands: [{ mnemonic: 'IMG_CAPTURE', result: 'VERIFIED' }, { mnemonic: 'DUMP_START', result: 'VERIFIED' }] },
  { report_id: `PR-${YMD}-BLR-0408`, session_id: sid('AKV-01', 'BLR'), sat_id: 'AKV-01', station_id: 'BLR', aos_utc: isoAt(-184), los_utc: isoAt(-173), status: 'FINAL',
    completeness_pct: 100, frames_expected: 8920, frames_received: 8920, duplicates_merged: 42, latency_p50_ms: 38, latency_p95_ms: 61, latency_p99_ms: 74,
    gaps: [], commands: [{ mnemonic: 'HK_RATE_SET', result: 'VERIFIED' }] },
  { report_id: `PR-${YMD}-SVL-0404`, session_id: sid('AKV-07', 'SVL'), sat_id: 'AKV-07', station_id: 'SVL', aos_utc: isoAt(-322), los_utc: isoAt(-309), status: 'FINAL',
    completeness_pct: 97.1, frames_expected: 11200, frames_received: 10879, duplicates_merged: 210, latency_p50_ms: 52, latency_p95_ms: 88, latency_p99_ms: 121,
    gaps: [{ from_utc: isoAt(-316), to_utc: isoAt(-315), frames: 321, backfill: 'UNRECOVERABLE', source: 'station outage' }],
    commands: [{ mnemonic: 'IMG_CAPTURE', result: 'VERIFIED' }, { mnemonic: 'DUMP_START', result: 'FAILED' }] },
];

// ---- imaging requests → plan → payload sessions → products → customer portal ------------------------
export type RequestState = 'NEW' | 'PLACED' | 'NOT_PLACED' | 'DROPPED' | 'SCHEDULED' | 'ACQUIRED' | 'DELIVERED';
const dl = (n: number) => `DL-${DOY}-${String(n).padStart(3, '0')}`;
const prd = (n: number) => `PRD-${DOY}-${String(n).padStart(3, '0')}`;
export const REQUESTS = [
  { id: 'TR-5526', tenant: 'Nabhas Agritech', requestedBy: 'Priya Nabhas', target: 'Ludhiana wheat belt', lat: 30.9, lon: 75.85, priority: 'P1' as const, windowH: 48, maxCloudPct: 40, createdAt: at(-9 * 60), state: 'NEW' as RequestState },
  { id: 'TR-5539', tenant: 'Akashaveda', requestedBy: KARAN, target: 'Western Ghats strip', lat: 14.5, lon: 74.6, priority: 'P2' as const, windowH: 24, maxCloudPct: 40, createdAt: at(-6 * 60), state: 'SCHEDULED' as RequestState, reason: 'Carried over from the approved plan' },
  { id: 'TR-5541', tenant: 'Terra Analytics', requestedBy: 'Daniel Osei', target: 'Sundarbans, morning light', lat: 21.95, lon: 89.18, priority: 'P2' as const, windowH: 48, maxCloudPct: 30, createdAt: at(-5 * 60), state: 'NEW' as RequestState },
  { id: 'TR-5542', tenant: 'Nabhas Agritech', requestedBy: 'Priya Nabhas', target: 'Kaveri delta repeat', lat: 10.9, lon: 79.4, priority: 'P3' as const, windowH: 72, maxCloudPct: 30, createdAt: at(-2 * 60), state: 'NEW' as RequestState },
  { id: 'TR-5543', tenant: 'Akashaveda', requestedBy: KARAN, target: 'Raipur flood extent', lat: 21.25, lon: 81.63, priority: 'P1' as const, windowH: 24, maxCloudPct: 60, createdAt: at(-60), state: 'NEW' as RequestState },
  { id: 'TR-5544', tenant: 'Akashaveda', requestedBy: KARAN, target: 'Assam paddy survey', lat: 26.2, lon: 92.9, priority: 'P2' as const, windowH: 24, maxCloudPct: 30, createdAt: at(-60), state: 'NEW' as RequestState },
  { id: 'TR-5537', tenant: 'Nabhas Agritech', requestedBy: 'Priya Nabhas', target: 'Krishna delta paddy', lat: 16.2, lon: 81.1, priority: 'P1' as const, windowH: 24, maxCloudPct: 40, createdAt: at(-14 * 60), state: 'ACQUIRED' as RequestState,
    placement: { sat: 'NBH-02', at: at(-30), dlStation: 'BLR', dlAt: at(-24) }, deliveryId: dl(13) },
  { id: 'TR-5536', tenant: 'Terra Analytics', requestedBy: 'Daniel Osei', target: 'Godavari basin mosaic', lat: 17.0, lon: 81.8, priority: 'P2' as const, windowH: 48, maxCloudPct: 30, createdAt: at(-20 * 60), state: 'DELIVERED' as RequestState,
    placement: { sat: 'TRA-01', at: at(-430), dlStation: 'SVL', dlAt: at(-412) }, deliveryId: dl(6), productId: prd(6) },
  { id: 'TR-5511', tenant: 'Nabhas Agritech', requestedBy: 'Priya Nabhas', target: 'Punjab canal network', lat: 30.7, lon: 76.2, priority: 'P2' as const, windowH: 48, maxCloudPct: 40, createdAt: at(-30 * 60), state: 'DELIVERED' as RequestState,
    placement: { sat: 'NBH-01', at: at(-225), dlStation: 'HYD', dlAt: at(-212) }, deliveryId: dl(10), productId: prd(10) },
];
export const REQUEST_SEQ = 5545;

/** Payload sessions, each on a pass above. Products are made from the delivered ones (useDeliveryStore). */
export const SESSIONS = [
  { id: dl(15), sat: 'AKV-03', station: 'HYD', tenant: 'Akashaveda', sizeMb: 1180, chunksTotal: 184, startedAt: at(-3), recvDoneAt: at(5), mergeDoneAt: at(7), failedChunks: [] as number[], retries: [] },
  { id: dl(14), sat: 'AKV-03', station: 'HYD', tenant: 'Akashaveda', sizeMb: 1123, chunksTotal: 176, startedAt: at(-44), recvDoneAt: at(-37), mergeDoneAt: at(-34), failedChunks: [], retries: [] },
  { id: dl(13), sat: 'NBH-02', station: 'BLR', tenant: 'Nabhas Agritech', requestId: 'TR-5537', sizeMb: 842, chunksTotal: 140, startedAt: at(-22), recvDoneAt: at(-13), mergeDoneAt: at(6), failedChunks: [], retries: [] },
  { id: dl(11), sat: 'AKV-01', station: 'BLR', tenant: 'Akashaveda', sizeMb: 1410, chunksTotal: 214, startedAt: at(-182), recvDoneAt: at(-173), mergeDoneAt: at(-170), failedChunks: [199, 202, 207], retries: [] },
  { id: dl(10), sat: 'NBH-01', station: 'HYD', tenant: 'Nabhas Agritech', requestId: 'TR-5511', sizeMb: 664, chunksTotal: 96, startedAt: at(-210), recvDoneAt: at(-201), mergeDoneAt: at(-198), failedChunks: [], retries: [], deliveredAt: at(-190), deliveredBy: KARAN, productId: prd(10) },
  { id: dl(9), sat: 'AKV-10', station: 'PTH', tenant: 'Akashaveda', sizeMb: 1770, chunksTotal: 289, startedAt: at(-370), recvDoneAt: at(-361), mergeDoneAt: at(-358), failedChunks: [], retries: [] },
  { id: dl(6), sat: 'TRA-01', station: 'SVL', tenant: 'Terra Analytics', requestId: 'TR-5536', sizeMb: 1288, chunksTotal: 210, startedAt: at(-410), recvDoneAt: at(-399), mergeDoneAt: at(-396), failedChunks: [], retries: [], deliveredAt: at(-380), deliveredBy: KARAN, productId: prd(6) },
];

// ---- governance: access, keys, on-call --------------------------------------------------------------
export const GRANTS = [
  // The invite key for Kiran Bose: Farah issued it, Rohit was the second administrator.
  { id: 'GR-0106', personId: 'USR-013', role: 'Spacecraft Operator' as const, scope: ['AKV-*'], requestedBy: 'USR-005', requestedAt: isoAt(-25 * 60), state: 'APPROVED' as const, decidedBy: 'USR-006', decidedAt: isoAt(-24 * 60), keyId: 'KEY-2KXP' },
  // Arjun Desai asked to operate as well as direct: waiting for a second administrator.
  { id: 'GR-0107', personId: 'USR-011', role: 'Spacecraft Operator' as const, scope: ['AKV-*'], requestedBy: 'USR-005', requestedAt: isoAt(-90), state: 'PENDING' as const },
];
export const INVITE_ISSUED_MIN = -25 * 60;

export const KEY_REQUESTS = [
  { id: 'KR-0041', kind: 'OTAR' as const, satId: 'AKV-05', detail: 'Over-the-air rekey: new session key wrapped under MK-AKV-05-01', requestedBy: 'USR-005', requestedByName: FARAH, at: isoAt(-36), state: 'PENDING' as const },
  { id: 'KR-0040', kind: 'CONFIG' as const, satId: 'AKV-02', detail: 'Anti-replay window 64 → 128 frames', patch: { arsnWindow: 128 }, requestedBy: 'USR-006', requestedByName: ROHIT, at: isoAt(-3 * 24 * 60), state: 'APPLIED' as const, decidedBy: FARAH, decidedAt: isoAt(-3 * 24 * 60 + 25) },
];

export const ONCALL: OnCallEntry[] = [
  { position: 'Primary', name: VIKRAM, until_utc: isoAt(260) },
  { position: 'Secondary', name: ANANYA, until_utc: isoAt(260) },
  { position: 'Flight Director', name: ARJUN, until_utc: isoAt(500) },
];
export const PAGES: (NotificationDelivery & { ackBy?: string; ackAt?: string })[] = [
  { id: 'ND-5521', trigger: 'WARNING alarm AL-7101', channel: 'Push', recipient: VIKRAM, sent_utc: isoAt(-199), state: 'ACKNOWLEDGED', ackBy: VIKRAM, ackAt: isoAt(-190) },
  { id: 'ND-5520', trigger: 'AI advisory AN-398', channel: 'Slack #ops-akv', recipient: 'Ops channel', sent_utc: isoAt(-185), state: 'DELIVERED' },
  { id: 'ND-5519', trigger: 'Ground station SGP down', channel: 'Voice', recipient: ANANYA, sent_utc: isoAt(-175), state: 'ESCALATED' },
  { id: 'ND-5518', trigger: 'SLO burn rate', channel: 'Email', recipient: 'Platform on-call', sent_utc: isoAt(-240), state: 'RETRYING' },
];

/** Who reviewed which dictionary release, and when (useMdbStore builds the releases from it). */
export const MDB_TIMELINE = {
  draft420: { author: MEERA, min: -2 * 24 * 60, submittedMin: -2 * 24 * 60 + 40, reviewers: [{ name: VIKRAM, role: 'Flight Engineer' as const, min: -24 * 60 }] },
  active419: { author: MEERA, createdMin: -6 * 24 * 60, reviewers: [VIKRAM, NISHA], activeMin: -5 * 24 * 60 },
  older: { author: MEERA, reviewers: [VIKRAM, NISHA] },
};

/** Ground network bookings already in place (useNetworkStore, useBookingStore). Each is a real contact from the orbit. */
const NETWORK_BOOKING_FACTS = [
  { id: 'BK-3091', sat: 'AKV-05', station: 'PTH', after: 60, state: 'CONFIRMED' as const, requestedBy: KARAN, min: -600, note: 'Confirmed by KSAT' },
  { id: 'BK-3094', sat: 'AKV-02', station: 'AWS', after: 90, state: 'CONFIRMED' as const, requestedBy: SANJAY, min: -45, note: 'Confirmed by AWS Ground Station' },
  { id: 'BK-3088', sat: 'NBH-01', station: 'SGP', after: 0, state: 'DECLINED' as const, requestedBy: KARAN, min: -200, note: 'Station in maintenance' },
];
export const NETWORK_BOOKINGS = NETWORK_BOOKING_FACTS.flatMap((b) => {
  const c = satContacts(b.sat, at(b.after), 24 * H).find((x) => x.station === b.station);
  return c ? [{ ...b, contactId: c.id, aos: new Date(c.aos).toISOString(), los: new Date(c.los).toISOString(), maxEl: Math.round(c.maxEl) }] : [];
});

// ---- the audit ledger ---------------------------------------------------------------------------
export const GENESIS = '0'.repeat(64);
/** ponytail: FNV-1a widened to 64 hex chars stands in for SHA-256 in the browser demo; the ledger API replaces it. */
export const chainHash = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return Array.from({ length: 8 }, (_, i) => ((h * (i + 7)) >>> 0).toString(16).padStart(8, '0')).join('').slice(0, 64);
};
export const AUDIT_BASE = 44000;

type Ev = { min: number; by: string; sat: string; what: string; text: string; result?: AuditRecord['result']; proc?: { id: string; version: string }; system?: boolean };

/** Every seeded action above, once, as the console would have recorded it. */
function events(): Ev[] {
  const ev: Ev[] = [];
  for (const c of COMMANDS) {
    const p = paramText(c.params);
    ev.push({ min: c.min, by: c.by, sat: c.sat, what: c.mnemonic, proc: c.procedure,
      text: `${c.id} ${c.approval ? `approval requested (${c.approval.id})` : 'released to the uplink'} · ${p}${c.reason && !c.procedure ? ` · why: ${c.reason}` : ''}` });
    const d = c.approval?.decided;
    if (d) ev.push({ min: d.min, by: d.by, sat: c.sat, what: c.mnemonic, proc: c.procedure, result: d.approve ? 'ACK' : 'NACK',
      text: `${c.id} ${d.approve ? 'approved (step-up passkey, acr=2)' : `rejected: ${d.reason}`} · requested by ${c.by} · ${p}` });
    if (c.status === 'COMPLETED' || c.status === 'FAILED') ev.push({ min: (d?.min ?? c.min) + 0.1, by: c.by, sat: c.sat, what: c.mnemonic, system: true, text: `${c.id} released (simulated) ${p}` });
    if (c.status === 'FAILED') ev.push({ min: c.min + 6, by: 'System', sat: c.sat, what: c.mnemonic, system: true, result: 'TIMEOUT', text: `${c.id} ${c.note}` });
    if (c.cancelledMin !== undefined) ev.push({ min: c.cancelledMin, by: c.by, sat: c.sat, what: c.mnemonic, result: 'NACK', text: `${c.id} cancelled before radiation · ${p}` });
  }
  const r = PROCEDURE_RUN;
  ev.push({ min: r.startedMin, by: r.startedBy, sat: r.satId, what: 'PROCEDURE', proc: { id: r.procId, version: r.version }, text: `run ${r.id}: started on ${r.satId}` });
  ev.push({ min: r.finishedMin, by: r.startedBy, sat: r.satId, what: 'PROCEDURE', proc: { id: r.procId, version: r.version }, system: true, text: `run ${r.id}: completed` });

  for (const c of CONDITIONS) {
    const text = conditionText(c.param, c.value);
    if (c.ack) ev.push({ min: c.ack.min, by: c.ack.by, sat: c.sat, what: 'ALARM_ACK', text: `${c.alarmId} ${text} acknowledged` });
    if (c.shelve) ev.push({ min: c.shelve.min, by: c.shelve.by, sat: c.sat, what: 'ALARM_SHELVE', text: `${c.alarmId} ${c.shelve.untilMin - c.shelve.min} min: ${c.shelve.reason}` });
  }
  for (const [id, a] of Object.entries(DERIVED_ACKS)) ev.push({ min: (a.at - T0) / MIN, by: a.by, sat: '—', what: 'ALARM_ACK', text: `${id} SGP is down (Own) acknowledged` });
  for (const [id, d] of Object.entries(ADVISORY_DECISIONS)) {
    const a = ADVISORIES.find((x) => x.advisory_id === id)!;
    ev.push({ min: d.min, by: d.by, sat: a.sat_id, what: 'ADVISORY_DECISION', result: d.state === 'CONFIRMED' ? 'ACK' : 'NACK', text: `${id} ${d.state === 'CONFIRMED' ? 'confirmed as a real anomaly' : 'dismissed'}: ${d.reason}` });
  }

  const [inv] = Object.entries(INVITE_KEYS);
  const kiran = PEOPLE.find((p) => p.id === inv[1].personId)!;
  ev.push({ min: INVITE_ISSUED_MIN, by: FARAH, sat: kiran.id, what: 'INVITE_KEY_ISSUED', text: `Invite key ${inv[0].split('-').slice(0, 2).join('-')}-••••-${inv[0].slice(-4)} for ${kiran.name} <${kiran.email}> as ${inv[1].role} on AKV-*, expires in 72 h; waiting for a second administrator` });
  const g6 = GRANTS[0], g7 = GRANTS[1];
  ev.push({ min: (Date.parse(g6.decidedAt!) - T0) / MIN, by: ROHIT, sat: g6.personId, what: 'ROLE_GRANT', text: `${g6.role} for ${kiran.name} approved (requested by ${FARAH})` });
  ev.push({ min: (Date.parse(g7.requestedAt) - T0) / MIN, by: FARAH, sat: 'Arjun Desai', what: 'ROLE_GRANT_REQUEST', text: `Requested ${g7.role} for Arjun Desai on ${g7.scope.join(', ')}; waiting for a second administrator` });
  for (const k of KEY_REQUESTS) {
    ev.push({ min: (Date.parse(k.at) - T0) / MIN, by: k.requestedByName, sat: k.satId, what: `KEY_${k.kind}_REQUEST`, text: `${k.id}: ${k.detail}; waiting for a second person` });
    if (k.state === 'APPLIED') ev.push({ min: (Date.parse(k.decidedAt!) - T0) / MIN, by: k.decidedBy!, sat: k.satId, what: `KEY_${k.kind}`, text: `${k.id} applied: ${k.detail} (requested by ${k.requestedByName})` });
  }
  for (const p of PAGES) if (p.ackBy) ev.push({ min: (Date.parse(p.ackAt!) - T0) / MIN, by: p.ackBy, sat: p.recipient, what: 'PAGE_ACK', text: `Page ${p.id} (${p.trigger}) acknowledged` });

  const m = MDB_TIMELINE;
  ev.push({ min: m.active419.activeMin, by: m.active419.author, sat: 'MDB', what: 'MDB_RELEASE', text: 'akv-mdb 4.19.0 active on AKV-* satellites' });
  ev.push({ min: m.draft420.min, by: m.draft420.author, sat: 'MDB', what: 'MDB_RELEASE', text: 'akv-mdb 4.20.0 drafted (copy of the active release)' });
  ev.push({ min: m.draft420.submittedMin, by: m.draft420.author, sat: 'MDB', what: 'MDB_RELEASE', text: 'akv-mdb 4.20.0 submitted for review' });
  m.draft420.reviewers.forEach((rv, i) => ev.push({ min: rv.min, by: rv.name, sat: 'MDB', what: 'MDB_RELEASE', text: `akv-mdb 4.20.0 review approved by ${rv.name} as ${rv.role} (${i + 1} of 2)` }));

  for (const s of SESSIONS) if (s.deliveredAt) ev.push({ min: (s.deliveredAt - T0) / MIN, by: s.deliveredBy!, sat: s.sat, what: 'PRODUCT_DELIVER', text: `${s.productId} delivered to ${s.tenant}${s.requestId ? ` for ${s.requestId}` : ''}` });
  for (const b of NETWORK_BOOKINGS) ev.push({ min: b.min, by: b.requestedBy, sat: b.sat, what: 'BOOKING_REQUEST', text: `${b.id} ${b.station} requested` });
  return ev;
}

/** The ledger as the shift inherits it: newest first, hash-chained from the genesis record. */
export function seedAudit(): AuditRecord[] {
  let prev = GENESIS;
  const out = events().sort((a, b) => a.min - b.min).map((e, i) => {
    const body = {
      record_id: `AUD-${AUDIT_BASE + i}`, timestamp_utc: isoAt(e.min), operator_id: e.system ? 'SYS' : idOf(e.by), operator_name: e.by, sat_id: e.sat,
      command_mnemonic: e.what, procedure_id: e.proc?.id ?? '—', procedure_version: e.proc?.version ?? '—', sequence_count: 0,
      result: e.result ?? 'ACK', params_summary: e.text,
    };
    const rec: AuditRecord = { ...body, prev_record_sha256: prev, bytes_sha256: chainHash(JSON.stringify(body) + prev) };
    prev = rec.bytes_sha256;
    return rec;
  });
  return out.reverse();
}

