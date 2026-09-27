/**
 * One alarm list across every kind of alert the console knows about. Health alarms come from the
 * alarm store (limit violations); the rest are derived from the systems that own them:
 * conjunction screening, payload / data chain / procedure uplink state, ground stations and commands.
 */
import { create } from 'zustand';
import { useMemo } from 'react';
import { FLEET, STATIONS } from '../data/fleet';
import { useAlarmStore } from '../store/useAlarmStore';
import { useMissionStore } from '../store/useMissionStore';
import { useConjunctionStore } from './conjunctionStore';
import { getSatOps } from './satOps';
import type { Alarm } from '../types';
import type { Conjunction } from '../orbit/debris';

export type AlarmCategory = 'HEALTH' | 'CONJUNCTION' | 'PAYLOAD' | 'COMMAND' | 'GROUND' | 'DATA';
export const CATEGORIES: { id: AlarmCategory; label: string; blurb: string }[] = [
  { id: 'HEALTH', label: 'Health', blurb: 'Parameter limit violations, by subsystem' },
  { id: 'CONJUNCTION', label: 'Conjunction', blurb: 'Close approaches with debris and other objects' },
  { id: 'PAYLOAD', label: 'Payload', blurb: 'Imaging and payload faults' },
  { id: 'COMMAND', label: 'Commands & procedures', blurb: 'Failed or rejected commands, stalled uplinks' },
  { id: 'GROUND', label: 'Ground contact', blurb: 'Station and link problems' },
  { id: 'DATA', label: 'Data processing', blurb: 'Download, processing and dissemination backlog' },
];

/** Conjunctions closer than this raise an alarm (critical under 5 km). */
export const ALARM_MISS_KM = 10;

export type UState = 'UNACK' | 'ACKED' | 'SHELVED' | 'ESCALATED';

export interface UAlarm {
  id: string;
  category: AlarmCategory;
  sat_id: string;            // '—' when the alarm belongs to a station, not a satellite
  severity: 1 | 2;           // 1 warning, 2 critical
  title: string;
  value?: string;
  at: number;
  state: UState;
  group?: string;            // subsystem for health alarms
  owner?: string;
  /** Category-specific payload for the detail view. */
  health?: Alarm;
  conjunction?: Conjunction;
  ref?: string;              // station id, command id, ...
}

/** Acknowledgements of derived alarms (health alarms keep theirs in the alarm store). */
interface AckStore { acked: Record<string, { by: string; at: number }>; ack: (id: string, by: string) => void }
export const useDerivedAckStore = create<AckStore>((set) => ({
  acked: {},
  ack: (id, by) => set((s) => ({ acked: { ...s.acked, [id]: { by, at: Date.now() } } })),
}));

export function useUnifiedAlarms(): UAlarm[] {
  const health = useAlarmStore((s) => s.active);
  const conjunctions = useConjunctionStore((s) => s.conjunctions);
  const computedAt = useConjunctionStore((s) => s.computedAt);
  const commands = useMissionStore((s) => s.commands);
  const acked = useDerivedAckStore((s) => s.acked);
  const minute = Math.floor(Date.now() / 60_000);

  return useMemo(() => {
    const now = Date.now();
    const out: UAlarm[] = [];
    const derivedState = (id: string): { state: UState; owner?: string } => acked[id] ? { state: 'ACKED', owner: acked[id].by } : { state: 'UNACK' };

    for (const a of health) {
      if (a.state === 'RTN') continue;
      out.push({ id: a.alarm_id, category: 'HEALTH', sat_id: a.sat_id, severity: a.alarm_state, title: a.condition ?? a.param_id,
        value: `${a.eu_value} ${a.unit}`, at: Date.parse(a.timestamp_utc), state: (a.state ?? 'UNACK') as UState, group: a.subsystem, owner: a.owner, health: a });
    }

    for (const c of conjunctions) {
      if (c.missKm >= ALARM_MISS_KM) continue; // screening lists everything under 25 km; only the close ones alarm
      const id = `CJ-${c.satId}-${c.objectId}`;
      out.push({ id, category: 'CONJUNCTION', sat_id: c.satId, severity: c.risk === 'CRITICAL' ? 2 : 1,
        title: `Close approach with ${c.objectName}`, value: `${c.missKm.toFixed(1)} km`, at: computedAt || now, conjunction: c, ...derivedState(id) });
    }

    for (const sat of FLEET) {
      const ops = getSatOps(sat.sat_id, now);
      if (ops.payload.status === 'FAULT') {
        const id = `PL-${sat.sat_id}`;
        out.push({ id, category: 'PAYLOAD', sat_id: sat.sat_id, severity: 2, title: 'Payload fault — imaging suspended', value: 'FAULT', at: now - 25 * 60_000, ...derivedState(id) });
      }
      if (ops.uplink.state === 'FAILED') {
        const id = `UP-${sat.sat_id}`;
        out.push({ id, category: 'COMMAND', sat_id: sat.sat_id, severity: 1, title: `Procedure uplink failed: ${ops.uplink.procedure.split(' ')[0]}`, value: `${ops.uplink.pct}%`, at: now - 12 * 60_000, ref: ops.uplink.procedure, ...derivedState(id) });
      }
      if (ops.data.pendingGb > 4.2 && ops.payload.status !== 'IMAGING' && ops.data.processedPct < 30 && sat.sat_id.endsWith('3')) {
        const id = `DP-${sat.sat_id}`;
        out.push({ id, category: 'DATA', sat_id: sat.sat_id, severity: 1, title: 'Processing backlog growing', value: `${ops.data.pendingGb} GB pending`, at: now - 40 * 60_000, ...derivedState(id) });
      }
    }

    for (const c of commands) {
      if (c.status === 'FAILED' || c.status === 'REJECTED') {
        const id = `CMD-${c.command_id}`;
        out.push({ id, category: 'COMMAND', sat_id: c.sat_id, severity: 2, title: `Command ${c.status.toLowerCase()}: ${c.mnemonic}`, value: c.status, at: Date.parse(c.utc) || now, ref: c.command_id, ...derivedState(id) });
      }
    }

    for (const st of STATIONS) {
      if (st.adapter_health === 'OK') continue;
      const id = `GS-${st.id}`;
      out.push({ id, category: 'GROUND', sat_id: '—', severity: st.adapter_health === 'DOWN' ? 2 : 1,
        title: `${st.id} ${st.adapter_health === 'DOWN' ? 'is down' : 'is degraded'} (${st.protocol})`, value: st.adapter_health, at: now - 3 * 3600_000, ref: st.id, ...derivedState(id) });
    }

    return out.sort((a, b) => b.severity - a.severity || b.at - a.at);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [health, conjunctions, computedAt, commands, acked, minute]);
}
