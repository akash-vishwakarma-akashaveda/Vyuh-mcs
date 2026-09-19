/**
 * Translation between what the backend says and what the console's stores hold.
 * Pure functions, so the rules (alarm levels, command lifecycle) are checkable.
 */
import { PARAMETERS } from '../data/fleet';
import { COMMANDS } from '../data/mission';
import type { Alarm, Param } from '../types';
import type { CommandRecord } from '../store/useMissionStore';
import type { AlarmView, CommandStatus, LiveValue } from './protocol';

export function toParamPartial(v: LiveValue): Partial<Param> {
  return {
    eu_value: Number(v.eu_value.toPrecision(6)), // 6 significant digits: no float noise, no lost resolution
    ...(v.unit ? { unit: v.unit } : {}),
    alarm_state: v.alarm_state,
    quality: v.quality,
    timestamp_utc: v.timestamp_utc,
  };
}

const DEFS = new Map(
  Object.entries(PARAMETERS).flatMap(([subsystem, defs]) => defs.map((d) => [d.param_id, { subsystem, ...d }] as const)),
);

/** A live alarm in the console's ISA-18.2 shape, with limits and subsystem from the dictionary. */
export function toConsoleAlarm(a: AlarmView): Alarm {
  const def = DEFS.get(a.param_id);
  const below = a.level.startsWith('LOW');
  const critical = a.level === 'LOW_LOW' || a.level === 'HIGH_HIGH';
  const limit = def ? (below ? (critical ? def.critLo : def.warnLo) : critical ? def.critHi : def.warnHi) : undefined;
  const state: Alarm['state'] = a.status === 'CLEARED' ? 'RTN' : a.status === 'ACKNOWLEDGED' ? 'ACKED' : 'UNACK';

  return {
    alarm_id: a.alarm_id,
    sat_id: a.sat_id,
    param_id: a.param_id,
    subsystem: (def?.subsystem ?? 'POWER') as Alarm['subsystem'],
    alarm_state: a.alarm_state === 2 ? 2 : 1,
    eu_value: a.eu_value,
    limit_low_soft: def?.warnLo, limit_hi_soft: def?.warnHi,
    limit_low_hard: def?.critLo, limit_hi_hard: def?.critHi,
    unit: a.unit || def?.unit || '',
    timestamp_utc: a.timestamp_utc,
    acknowledged: a.acknowledged,
    acknowledged_by: a.acknowledged_by || undefined,
    acknowledged_utc: a.acknowledged_utc || undefined,
    state,
    owner: a.acknowledged_by || undefined,
    condition: limit !== undefined ? `${a.param_id} ${below ? 'below' : 'above'} ${limit} ${a.unit || def?.unit || ''}`.trim() : a.param_id,
    timeline: [{ utc: a.timestamp_utc, text: `${a.param_id} reached ${a.level.replace('_', ' ')} at ${a.eu_value}` }],
  };
}

/**
 * Command lifecycle. The backend reports uplink milestones: PENDING (accepted by the
 * Command Gateway) -> QUEUED (through the safety chain, encrypted) -> SENT (framed under
 * COP-1 and transmitted) -> ACKNOWLEDGED (the spacecraft's CLCW confirms receipt).
 * Execution is confirmed separately, by telemetry.
 */
export function mapCommandStatus(backend: string): CommandRecord['status'] {
  switch (backend) {
    case 'PENDING':
    case 'QUEUED':
    case 'SENT':
      return 'RELEASED';
    case 'ACKNOWLEDGED':
      return 'ACCEPTED';
    default:
      return 'FAILED'; // FAILED, REJECTED_*, CANCELLED
  }
}

export const apidOf = (mnemonic: string): number | undefined => {
  const c = COMMANDS.find((x) => x.mnemonic === mnemonic);
  return c ? parseInt(c.apid, 16) : undefined;
};

/** The catalogue mnemonic for an APID + parameters (HTR_SWITCH and SET_HTR_SETPOINT share 0x021). */
export function mnemonicOf(apid: number, params: Record<string, unknown> | null | undefined): string {
  const candidates = COMMANDS.filter((c) => parseInt(c.apid, 16) === apid);
  if (candidates.length === 0) return `APID 0x${apid.toString(16)}`;
  if (candidates.length > 1 && params && 'SETPOINT' in params) return candidates.find((c) => c.mnemonic.includes('SETPOINT'))!.mnemonic;
  return candidates[0].mnemonic;
}

export function toCommandRecord(s: CommandStatus): CommandRecord {
  const params = Object.fromEntries(Object.entries(s.params ?? {}).map(([k, v]) => [k, typeof v === 'number' ? v : String(v)]));
  return {
    command_id: s.command_id.slice(-8).toUpperCase(),
    sat_id: s.sat_id,
    mnemonic: mnemonicOf(s.apid, s.params),
    params,
    status: mapCommandStatus(s.status),
    requested_by: s.operator_id,
    epoch: 0,
    utc: s.submitted_utc || new Date().toISOString(),
    critical: COMMANDS.find((c) => c.mnemonic === mnemonicOf(s.apid, s.params))?.critical ?? false,
  };
}
