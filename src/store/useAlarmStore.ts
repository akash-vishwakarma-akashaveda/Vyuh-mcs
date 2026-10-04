import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Alarm } from '../types';
import { ALARMS } from '../demo/scenario';
import { demoKey, demoStorage } from '../demo/persist';
import { useAuthStore } from './useAuthStore';
import { isLiveSatellite } from './useLinkStore';
import { liveApi } from '../live/api';

/** ISA-18.2 lifecycle (SRS S06): UNACK → ACKED → RTN, with SHELVED and ESCALATED. */
interface AlarmStore {
  /** Every live alarm, whatever its state. Acked alarms stay until they return to normal. */
  active: Alarm[];
  history: Alarm[];
  /** Backend refusals of an acknowledgement, by alarm id. Shown on the alarm until retried. */
  ackErrors: Record<string, string>;
  addAlarm: (alarm: Alarm) => void;
  /** Insert or update by id: a live alarm arrives again when it escalates or is acknowledged on another console. */
  upsertAlarm: (alarm: Alarm) => void;
  /** Acknowledges locally and, for a satellite the backend flies, on the backend. Resolves false when the backend refused. */
  ackAlarm: (alarm_id: string, operator_name?: string) => Promise<boolean>;
  /** Same, fire-and-forget (a refusal still lands in ackErrors and on the alarm). */
  acknowledgeAlarm: (alarm_id: string, operator_name?: string) => void;
  shelveAlarm: (alarm_id: string, reason: string, minutes: number, by?: string) => void;
  escalateAlarm: (alarm_id: string, to: string, by?: string) => void;
  /** A shelve ran out (BR-13): the alarm is live again. */
  unshelve: (alarm_id: string) => void;
  returnToNormal: (alarm_id: string) => void;
  clearAll: () => void;
}

const stamp = (a: Alarm, text: string): Alarm => ({
  ...a,
  timeline: [...(a.timeline ?? []), { utc: new Date().toISOString(), text }],
});

const me = () => useAuthStore.getState().user.name;

/**
 * Kept for the live director, which still registers one. The store now calls the backend itself so a
 * refusal can be shown on the alarm instead of being swallowed; the hook is no longer invoked.
 */
export const setAckHook = (_fn: ((alarm: Alarm, by: string) => void) | null) => { /* superseded, see acknowledgeAlarm */ };

/** Open-alarm count over time (one point per change), for the fleet trend. */
export const alarmTrend: { t: number; n: number }[] = [];

export const useAlarmStore = create<AlarmStore>()(persist((set, get) => ({
  active: ALARMS,
  history: [],
  ackErrors: {},

  addAlarm: (alarm) =>
    set((s) =>
      s.active.some((a) => a.alarm_id === alarm.alarm_id)
        ? s
        : { active: [{ state: 'UNACK', ...alarm }, ...s.active] }
    ),

  upsertAlarm: (alarm) =>
    set((s) => {
      const prev = s.active.find((a) => a.alarm_id === alarm.alarm_id);
      if (!prev) return { active: [{ state: 'UNACK', ...alarm }, ...s.active] };
      const escalated = prev.alarm_state !== alarm.alarm_state;
      const merged: Alarm = {
        ...prev, ...alarm,
        state: prev.state === 'SHELVED' || prev.state === 'ESCALATED' ? prev.state : alarm.state,
        timeline: [...(prev.timeline ?? []), ...(escalated ? [{ utc: new Date().toISOString(), text: alarm.alarm_state === 2 ? 'Escalated to critical' : 'Level changed' }] : [])],
      };
      return { active: s.active.map((a) => (a.alarm_id === alarm.alarm_id ? merged : a)) };
    }),

  acknowledgeAlarm: (alarm_id, operator_name) => { void get().ackAlarm(alarm_id, operator_name); },

  ackAlarm: async (alarm_id, operator_name = me()) => {
    const before = get().active.find((a) => a.alarm_id === alarm_id);
    if (!before || before.acknowledged) return true;
    set((s) => {
      const { [alarm_id]: _gone, ...ackErrors } = s.ackErrors;
      return {
        ackErrors,
        active: s.active.map((a) =>
          a.alarm_id === alarm_id
            ? stamp({ ...a, acknowledged: true, acknowledged_by: operator_name, acknowledged_utc: new Date().toISOString(), state: 'ACKED', owner: operator_name }, `Acknowledged by ${operator_name}`)
            : a
        ),
      };
    });
    if (!isLiveSatellite(before.sat_id)) return true;
    try {
      await liveApi.acknowledgeAlarm(alarm_id, operator_name);
      return true;
    } catch (e) {
      const msg = (e as { response?: { status?: number; data?: { error?: string } }; message?: string });
      const why = msg.response?.data?.error ?? (msg.response?.status ? `HTTP ${msg.response.status}` : msg.message ?? 'no answer');
      // The backend still holds it open: put it back so nobody believes it was acknowledged.
      set((s) => ({
        ackErrors: { ...s.ackErrors, [alarm_id]: `Backend refused the acknowledgement (${why}). It is still open.` },
        active: s.active.map((a) => (a.alarm_id === alarm_id
          ? stamp({ ...a, acknowledged: false, acknowledged_by: undefined, acknowledged_utc: undefined, owner: undefined, state: before.state === 'ESCALATED' ? 'ESCALATED' : 'UNACK' }, `Acknowledgement by ${operator_name} refused by the backend: ${why}`)
          : a)),
      }));
      return false;
    }
  },

  shelveAlarm: (alarm_id, reason, minutes, by = me()) =>
    set((s) => ({
      active: s.active.map((a) =>
        a.alarm_id === alarm_id
          ? stamp({ ...a, state: 'SHELVED', shelve_reason: reason, owner: by, shelved_until_utc: new Date(Date.now() + minutes * 60_000).toISOString() }, `Shelved by ${by} for ${minutes} min: ${reason}`)
          : a
      ),
    })),

  escalateAlarm: (alarm_id, to, by) =>
    set((s) => ({
      active: s.active.map((a) => (a.alarm_id === alarm_id ? stamp({ ...a, state: 'ESCALATED' }, by ? `${by} paged ${to}` : `Escalated to ${to}`) : a)),
    })),

  unshelve: (alarm_id) =>
    set((s) => ({
      active: s.active.map((a) => (a.alarm_id === alarm_id && a.state === 'SHELVED'
        ? stamp({ ...a, state: a.acknowledged ? 'ACKED' : 'UNACK', shelved_until_utc: undefined }, 'Shelve expired: alarm is live again') : a)),
    })),

  returnToNormal: (alarm_id) =>
    set((s) => {
      const alarm = s.active.find((a) => a.alarm_id === alarm_id);
      if (!alarm) return s;
      return {
        active: s.active.filter((a) => a.alarm_id !== alarm_id),
        history: [stamp({ ...alarm, state: 'RTN' }, 'Returned to normal'), ...s.history],
      };
    }),

  clearAll: () => set({ active: [], history: [], ackErrors: {} }),
}), { name: demoKey('alarms'), storage: demoStorage, partialize: (s) => ({ active: s.active, history: s.history }) as unknown as AlarmStore }));

useAlarmStore.subscribe((s, prev) => {
  if (s.active.length === prev.active.length) return;
  alarmTrend.push({ t: Date.now(), n: s.active.length });
  if (alarmTrend.length > 240) alarmTrend.shift();
});
