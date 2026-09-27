import { create } from 'zustand';
import { Alarm } from '../types';

/** ISA-18.2 lifecycle (SRS S06): UNACK → ACKED → RTN, with SHELVED and ESCALATED. */
interface AlarmStore {
  /** Every live alarm, whatever its state. Acked alarms stay until they return to normal. */
  active: Alarm[];
  history: Alarm[];
  addAlarm: (alarm: Alarm) => void;
  /** Insert or update by id: a live alarm arrives again when it escalates or is acknowledged on another console. */
  upsertAlarm: (alarm: Alarm) => void;
  acknowledgeAlarm: (alarm_id: string, operator_name?: string) => void;
  shelveAlarm: (alarm_id: string, reason: string, minutes: number) => void;
  escalateAlarm: (alarm_id: string, to: string) => void;
  /** A shelve ran out (BR-13): the alarm is live again. */
  unshelve: (alarm_id: string) => void;
  returnToNormal: (alarm_id: string) => void;
  clearAll: () => void;
}

const stamp = (a: Alarm, text: string): Alarm => ({
  ...a,
  timeline: [...(a.timeline ?? []), { utc: new Date().toISOString(), text }],
});

/** Lets the live layer mirror an operator's acknowledgement to the backend without every screen knowing. */
let ackHook: ((alarm: Alarm, by: string) => void) | null = null;
export const setAckHook = (fn: typeof ackHook) => { ackHook = fn; };

export const useAlarmStore = create<AlarmStore>((set, get) => ({
  active: [],
  history: [],

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

  acknowledgeAlarm: (alarm_id, operator_name = 'Vikram Shetty') => {
    const before = get().active.find((a) => a.alarm_id === alarm_id);
    set((s) => ({
      active: s.active.map((a) =>
        a.alarm_id === alarm_id
          ? stamp({ ...a, acknowledged: true, acknowledged_by: operator_name, acknowledged_utc: new Date().toISOString(), state: 'ACKED', owner: operator_name }, `Acknowledged by ${operator_name}`)
          : a
      ),
    }));
    if (before && !before.acknowledged) ackHook?.(before, operator_name);
  },

  shelveAlarm: (alarm_id, reason, minutes) =>
    set((s) => ({
      active: s.active.map((a) =>
        a.alarm_id === alarm_id
          ? stamp({ ...a, state: 'SHELVED', shelve_reason: reason, shelved_until_utc: new Date(Date.now() + minutes * 60_000).toISOString() }, `Shelved for ${minutes} min — ${reason}`)
          : a
      ),
    })),

  escalateAlarm: (alarm_id, to) =>
    set((s) => ({
      active: s.active.map((a) => (a.alarm_id === alarm_id ? stamp({ ...a, state: 'ESCALATED' }, `Escalated to ${to}`) : a)),
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

  clearAll: () => set({ active: [], history: [] }),
}));
