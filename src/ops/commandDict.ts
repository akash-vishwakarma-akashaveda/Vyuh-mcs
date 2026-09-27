import { COMMANDS } from '../data/mission';

/** Typed parameters for each catalogue command, so the console can validate before anything leaves. */
export interface CmdParam { id: string; type: 'enum' | 'number'; values?: string[]; min?: number; max?: number; unit?: string; def: string | number }
export type Interlock = 'BAT_TEMP' | 'ATT_ERR' | 'CONTACT' | null;
export interface CmdDef {
  mnemonic: string; name: string; apid: string; service: string; critical: boolean;
  params: CmdParam[]; interlock: Interlock;
}

const P: Record<string, { params: CmdParam[]; interlock: Interlock }> = {
  HTR_SWITCH: { interlock: 'BAT_TEMP', params: [{ id: 'HEATER', type: 'enum', values: ['A', 'B'], def: 'B' }, { id: 'STATE', type: 'enum', values: ['ON', 'OFF'], def: 'ON' }] },
  SET_HTR_SETPOINT: { interlock: null, params: [{ id: 'HEATER', type: 'enum', values: ['A', 'B'], def: 'B' }, { id: 'SETPOINT', type: 'number', min: 5, max: 25, unit: '°C', def: 15 }] },
  DUMP_START: { interlock: 'CONTACT', params: [{ id: 'VCID', type: 'number', min: 0, max: 7, def: 1 }, { id: 'RATE', type: 'enum', values: ['LOW', 'MED', 'HIGH'], def: 'MED' }] },
  HK_RATE_SET: { interlock: null, params: [{ id: 'RATE_HZ', type: 'number', min: 0.1, max: 10, unit: 'Hz', def: 1 }] },
  RW_DESAT: { interlock: 'ATT_ERR', params: [{ id: 'WHEEL', type: 'enum', values: ['RW1', 'RW2', 'RW3', 'RW4', 'ALL'], def: 'ALL' }, { id: 'DURATION', type: 'number', min: 5, max: 120, unit: 's', def: 30 }] },
  SAFE_MODE: { interlock: null, params: [{ id: 'CONFIRM', type: 'enum', values: ['YES'], def: 'YES' }] },
  TX_POWER_SET: { interlock: null, params: [{ id: 'POWER_W', type: 'number', min: 2, max: 6, unit: 'W', def: 4 }] },
  IMG_CAPTURE: { interlock: null, params: [{ id: 'FRAMES', type: 'number', min: 1, max: 64, def: 8 }, { id: 'EXPOSURE_MS', type: 'number', min: 0.5, max: 50, unit: 'ms', def: 5 }] },
  TIME_SYNC: { interlock: null, params: [{ id: 'OFFSET_MS', type: 'number', min: -500, max: 500, unit: 'ms', def: 0 }] },
  PUS11_LOAD: { interlock: null, params: [{ id: 'SCHEDULE', type: 'enum', values: ['PLAN-A', 'PLAN-B'], def: 'PLAN-A' }] },
};

export const COMMAND_DICT: CmdDef[] = COMMANDS.map((c) => ({
  mnemonic: c.mnemonic, name: c.name, apid: c.apid, service: c.pus, critical: c.critical,
  params: P[c.mnemonic]?.params ?? [], interlock: P[c.mnemonic]?.interlock ?? null,
}));

/** CRC-16/CCITT-FALSE, the CCSDS TC error-control field. */
function crc16(bytes: number[]): number {
  let c = 0xffff;
  for (const b of bytes) { c ^= b << 8; for (let i = 0; i < 8; i++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff; }
  return c;
}

/** Layout of the TC space packet the console previews (primary header, PUS-C secondary header, data, CRC). */
export function encodePreview(cmd: CmdDef, values: Record<string, string>, seq: number) {
  const apid = parseInt(cmd.apid, 16);
  const [st, sst] = cmd.service.split(',').map(Number);
  const fn = [...cmd.mnemonic].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) & 0xffff, 7);
  const data: number[] = [fn >> 8, fn & 255];
  for (const p of cmd.params) {
    if (p.type === 'enum') data.push(Math.max(0, p.values!.indexOf(values[p.id])));
    else { const v = Math.round((Number(values[p.id]) || 0) * 100) & 0xffff; data.push(v >> 8, v & 255); }
  }
  const sec = [0x2f, st, sst, 0x00, 0x2a];
  const len = sec.length + data.length + 2 - 1;
  const prim = [0x18 | (apid >> 8), apid & 255, 0xc0 | ((seq >> 8) & 0x3f), seq & 255, len >> 8, len & 255];
  const crc = crc16([...prim, ...sec, ...data]);
  return { prim, sec, data, crc: [crc >> 8, crc & 255] };
}

/** Validation of typed values against the dictionary: one error message per bad field. */
export function validate(cmd: CmdDef, values: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const p of cmd.params) {
    const v = values[p.id];
    if (p.type === 'enum') { if (!p.values!.includes(v)) errors[p.id] = `One of ${p.values!.join(' | ')}`; continue; }
    const n = Number(v);
    if (v === '' || Number.isNaN(n)) errors[p.id] = 'Enter a number';
    else if (n < p.min! || n > p.max!) errors[p.id] = `Out of range ${p.min} … ${p.max}${p.unit ? ' ' + p.unit : ''}`;
  }
  return errors;
}
