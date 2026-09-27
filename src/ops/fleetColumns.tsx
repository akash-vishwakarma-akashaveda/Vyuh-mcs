import React from 'react';
import { clsx } from 'clsx';
import { StatusBadge } from '../components/atoms/Badge';
import { PARAMETERS } from '../data/fleet';
import { isStale } from '../utils/stalenessUtils';
import type { Alarm, ContactWindow, Param, Satellite } from '../types';
import type { Conjunction } from '../orbit/debris';
import type { SatOps } from './satOps';

export interface ColCtx {
  sat: Satellite;
  cvt: Record<string, Param> | undefined;
  windows: ContactWindow[];       // this satellite's, soonest first
  conj: Conjunction[];            // this satellite's, closest first
  ops: SatOps;
  alarms: Alarm[];                // open
  history: Alarm[];               // closed
  now: number;
}

export interface Col {
  id: string;
  label: string;
  group: string;
  sort?: (c: ColCtx) => number | string;
  cell: (c: ColCtx) => React.ReactNode;
}

const t = (ms: number) => new Date(ms).toISOString().slice(11, 16);
const rel = (ms: number) => {
  const m = Math.round(Math.abs(ms) / 60000);
  const s = m >= 1440 ? `${Math.floor(m / 1440)}d` : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
  return ms >= 0 ? `in ${s}` : `${s} ago`;
};
const mute = <span className="text-[#5F7087]">—</span>;

const Bar: React.FC<{ pct: number; tone?: string }> = ({ pct, tone = '#4DACFF' }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className="w-[54px] h-1.5 rounded-full bg-[#1F2D40] overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${pct}%`, background: tone }} /></span>
    <span className="tabular-nums text-[11.5px] w-[30px]">{pct}%</span>
  </span>
);

const RISK = { CRITICAL: 'text-[#FF3838]', WARNING: 'text-[#FCE83A]', WATCH: 'text-[#FACC15]' } as const;
const PAYLOAD_TONE: Record<string, string> = { IDLE: 'text-[#A3B1C2]', IMAGING: 'text-[#2DCCFF]', DOWNLINKING: 'text-[#22D3EE]', PROCESSING: 'text-[#A78BFA]', FAULT: 'text-[#FF3838]' };

const STATIC: Col[] = [
  { id: 'sat', label: 'Satellite', group: 'Identity', sort: (c) => c.sat.sat_id, cell: (c) => <span className="font-mono-code font-bold text-[#4DACFF]">{c.sat.sat_id}</span> },
  { id: 'health', label: 'Health', group: 'Identity', sort: (c) => ({ CRITICAL: 0, WARNING: 1 } as Record<string, number>)[c.sat.health_state] ?? 2,
    cell: (c) => (
      <span className="inline-flex items-center gap-2">
        <StatusBadge status={c.sat.health_state} size="sm" />
        {c.alarms.length > 0 && <span className="text-[11px] text-[#FCE83A] tabular-nums">{c.alarms.length} alarm{c.alarms.length > 1 ? 's' : ''}</span>}
      </span>
    ) },
  { id: 'plane', label: 'Plane', group: 'Identity', sort: (c) => c.sat.constellation_group, cell: (c) => <span className="text-[#A3B1C2]">{c.sat.constellation_group}</span> },

  { id: 'contact', label: 'Ground contact', group: 'Ground contact',
    sort: (c) => Date.parse(c.windows[0]?.aos_utc ?? '') || Infinity,
    cell: (c) => {
      const w = c.windows[0];
      if (!w) return mute;
      const aos = Date.parse(w.aos_utc), los = Date.parse(w.los_utc);
      return aos <= c.now && los > c.now
        ? <span className="text-[#56F000] whitespace-nowrap">In contact · {w.ground_station} · LOS {rel(los - c.now)}</span>
        : <span className="whitespace-nowrap">{w.ground_station} <span className="font-mono-code">{t(aos)}</span> <span className="text-[#8496AB]">{rel(aos - c.now)}</span></span>;
    } },

  { id: 'lastCritical', label: 'Last critical parameter', group: 'Health',
    sort: (c) => (c.alarms.concat(c.history).filter((a) => a.alarm_state === 2).length ? 0 : 1),
    cell: (c) => {
      const a = c.alarms.concat(c.history).filter((x) => x.alarm_state === 2).sort((x, y) => Date.parse(y.timestamp_utc) - Date.parse(x.timestamp_utc))[0];
      return a
        ? <span className="whitespace-nowrap text-[#FF3838]"><span className="font-mono-code">{a.param_id}</span> {a.eu_value}{a.unit ? ` ${a.unit}` : ''} <span className="text-[#8496AB]">· {a.timestamp_utc.slice(11, 16)}</span></span>
        : <span className="text-[#56F000]">none</span>;
    } },

  { id: 'payload', label: 'Payload', group: 'Payload & data', sort: (c) => c.ops.payload.status,
    cell: (c) => <span className={clsx('text-[12px] font-medium', PAYLOAD_TONE[c.ops.payload.status])}>{c.ops.payload.status.charAt(0) + c.ops.payload.status.slice(1).toLowerCase()}</span> },
  { id: 'imaging', label: 'Last imaging', group: 'Payload & data', sort: (c) => c.ops.payload.lastImaging?.at ?? 0,
    cell: (c) => c.ops.payload.lastImaging
      ? <span className="whitespace-nowrap"><span className="font-mono-code">{t(c.ops.payload.lastImaging.at)}</span> <span className="text-[#A3B1C2]">{c.ops.payload.lastImaging.target} · {c.ops.payload.lastImaging.frames} fr</span></span>
      : mute },
  { id: 'downlink', label: 'Data downloaded', group: 'Payload & data', sort: (c) => c.ops.data.downlinkedPct, cell: (c) => <Bar pct={c.ops.data.downlinkedPct} tone="#22D3EE" /> },
  { id: 'processed', label: 'Data processed', group: 'Payload & data', sort: (c) => c.ops.data.processedPct, cell: (c) => <Bar pct={c.ops.data.processedPct} tone="#A78BFA" /> },

  { id: 'uplink', label: 'Procedure uplink', group: 'Procedures', sort: (c) => c.ops.uplink.pct,
    cell: (c) => (
      <span className="inline-flex flex-col gap-0.5 min-w-[150px]">
        <span className="text-[11.5px] text-[#A3B1C2] truncate max-w-[190px]">{c.ops.uplink.procedure.split(' ')[0]}</span>
        <Bar pct={c.ops.uplink.pct} tone={c.ops.uplink.state === 'FAILED' ? '#D42C2C' : '#4DACFF'} />
      </span>
    ) },
  { id: 'uplinkState', label: 'Uplink state', group: 'Procedures', sort: (c) => c.ops.uplink.state,
    cell: (c) => <span className={c.ops.uplink.state === 'FAILED' ? 'text-[#FF3838]' : c.ops.uplink.state === 'UPLOADING' ? 'text-[#2DCCFF]' : 'text-[#A3B1C2]'}>{c.ops.uplink.state.charAt(0) + c.ops.uplink.state.slice(1).toLowerCase()}</span> },

  { id: 'conjunction', label: 'Conjunction', group: 'Safety', sort: (c) => c.conj[0]?.missKm ?? Infinity,
    cell: (c) => {
      const j = c.conj[0];
      return j
        ? <span className={clsx('whitespace-nowrap', RISK[j.risk])}><b className="tabular-nums">{j.missKm.toFixed(1)} km</b> <span className="text-[#A3B1C2]">{rel(j.tcaMs - c.now)}</span> {j.risk.toLowerCase()}</span>
        : <span className="text-[#56F000]">clear · 4 h</span>;
    } },
  { id: 'lastOm', label: 'Last manoeuvre', group: 'Flight dynamics', sort: (c) => c.ops.fd.lastOm?.at ?? 0,
    cell: (c) => c.ops.fd.lastOm
      ? <span className="whitespace-nowrap"><span className={c.ops.fd.lastOm.status === 'SUCCESS' ? 'text-[#56F000]' : 'text-[#FCE83A]'}>{c.ops.fd.lastOm.status.toLowerCase()}</span> <span className="text-[#A3B1C2]">{c.ops.fd.lastOm.name} · {rel(c.ops.fd.lastOm.at - c.now)}</span></span>
      : mute },
  { id: 'nextOm', label: 'Manoeuvre planned', group: 'Flight dynamics', sort: (c) => c.ops.fd.nextOm?.at ?? Infinity,
    cell: (c) => c.ops.fd.nextOm ? <span className="whitespace-nowrap">{c.ops.fd.nextOm.name} <span className="text-[#8496AB]">{rel(c.ops.fd.nextOm.at - c.now)}</span></span> : <span className="text-[#5F7087]">none planned</span> },
  { id: 'contingency', label: 'Last contingency', group: 'Flight dynamics', sort: (c) => c.ops.contingency?.at ?? 0,
    cell: (c) => c.ops.contingency ? <span className="whitespace-nowrap">{c.ops.contingency.name} <span className="text-[#8496AB]">· {rel(c.ops.contingency.at - c.now)}</span></span> : <span className="text-[#5F7087]">none recorded</span> },
];

/** Any telemetry parameter can become a column: value, coloured by limit state, dimmed when stale. */
export const PARAM_COLUMNS: Col[] = Object.entries(PARAMETERS).flatMap(([subsystem, defs]) =>
  defs.map((d): Col => ({
    id: `p:${d.param_id}`, label: d.param_id, group: `Telemetry · ${subsystem[0] + subsystem.slice(1).toLowerCase()}`,
    sort: (c) => c.cvt?.[d.param_id]?.eu_value ?? Infinity,
    cell: (c) => {
      const p = c.cvt?.[d.param_id];
      if (!p) return mute;
      const tone = isStale(p) ? 'text-[#5F7087]' : p.alarm_state === 2 ? 'text-[#FF3838]' : p.alarm_state === 1 ? 'text-[#FCE83A]' : '';
      const digits = Math.abs(p.eu_value) >= 100 ? 0 : 2;
      return <span className={clsx('font-mono-code tabular-nums', tone)}>{p.eu_value.toFixed(digits)}<span className="text-[#5F7087] ml-0.5 text-[10.5px]">{p.unit}</span></span>;
    },
  })),
);

export const COLUMNS: Col[] = [...STATIC, ...PARAM_COLUMNS];
export const COLUMN_BY_ID = new Map(COLUMNS.map((c) => [c.id, c]));
export const DEFAULT_COLUMNS = ['sat', 'health', 'contact', 'lastCritical', 'payload', 'imaging', 'downlink', 'processed', 'uplink', 'conjunction', 'lastOm', 'nextOm', 'contingency', 'p:BAT_SOC', 'p:BAT_TEMP'];
