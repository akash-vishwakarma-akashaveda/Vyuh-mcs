import React, { useState } from 'react';
import { useAlarmStore } from '../../store/useAlarmStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useMissionStore } from '../../store/useMissionStore';
import { can } from '../../auth/policy';
import { Button } from '../atoms/Button';
import { Pill } from '../atoms/Badge';
import { fmtNum } from '../../ops/history';
import type { Alarm } from '../../types';
import { Select } from '../molecules/Select';

export const SHELVE_FOR: [number, string][] = [[15, '15 min'], [30, '30 min'], [60, '1 h'], [240, '4 h'], [720, '12 h']];

const age = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  return s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min` : `${Math.floor(s / 3600)} h`;
};
const initials = (n: string) => n.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

/** Records an alarm action in the audit ledger, as the signed-in person. */
export function auditAlarm(a: { sat_id: string; alarm_id: string }, what: string, detail: string) {
  const u = useAuthStore.getState().user;
  useMissionStore.getState().appendAudit({
    timestamp_utc: new Date().toISOString(), operator_id: u.id, operator_name: u.name, sat_id: a.sat_id,
    command_mnemonic: what, procedure_id: '—', procedure_version: '—', sequence_count: 0, result: 'ACK',
    params_summary: `${a.alarm_id} ${detail}`,
  });
}

/** Shelving needs a reason and an expiry (SRS S06); the shelve always ends on its own. */
export const ShelveForm: React.FC<{ onShelve: (reason: string, minutes: number) => void; onCancel: () => void }> = ({ onShelve, onCancel }) => {
  const [reason, setReason] = useState('');
  const [minutes, setMinutes] = useState(30);
  return (
    <form className="flex flex-col gap-2 rounded-xl bg-[#161A22] p-3" onSubmit={(e) => { e.preventDefault(); if (reason.trim()) onShelve(reason.trim(), minutes); }}>
      <label className="text-[12.5px] text-[#9AA3B2]" htmlFor="shelve-reason">Reason</label>
      <input id="shelve-reason" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Known heater fault, recovery running"
        className="h-9 bg-[#11141B] border border-[#232936] focus:border-[#6CB8FF] rounded-lg px-2.5 text-[13px] outline-none" />
      <label className="text-[12.5px] text-[#9AA3B2]" htmlFor="shelve-for">Comes back after</label>
      <Select id="shelve-for" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="h-9 bg-[#161A22] border border-[#232936] rounded-xl px-2 text-[13px] text-[#E9ECF1]">
        {SHELVE_FOR.map(([m, l]) => <option key={m} value={m}>{l}</option>)}
      </Select>
      <span className="flex gap-2 pt-1">
        <Button size="sm" type="submit" disabled={!reason.trim()} reason={!reason.trim() ? 'A reason is required' : undefined}>Shelve for {SHELVE_FOR.find(([m]) => m === minutes)?.[1]}</Button>
        <Button size="sm" variant="ghost" type="button" onClick={onCancel}>Cancel</Button>
      </span>
    </form>
  );
};

/** Alarms on one satellite, with acknowledge and shelve for the roles that may. Hidden actions where they do not apply. */
export const AlarmPanel: React.FC<{ satId: string; onOpenParam: (paramId: string) => void; readOnly?: boolean }> = ({ satId, onOpenParam, readOnly }) => {
  const all = useAlarmStore((s) => s.active);
  const errors = useAlarmStore((s) => s.ackErrors);
  const ack = useAlarmStore((s) => s.ackAlarm);
  const shelve = useAlarmStore((s) => s.shelveAlarm);
  const role = useAuthStore((s) => s.activeRole);
  const actor = useAuthStore((s) => s.user.name);
  const mayAck = can('alarm:ack', role);
  const mayShelve = can('alarm:shelve', role);
  const [shelving, setShelving] = useState<string | null>(null);

  const mine = all.filter((a) => a.sat_id === satId && a.state !== 'RTN').sort((a, b) => b.alarm_state - a.alarm_state || Date.parse(b.timestamp_utc) - Date.parse(a.timestamp_utc));

  if (mine.length === 0) return <p className="text-[13px] text-[#9AA3B2]">No open alarms on {satId}.</p>;

  const doAck = (a: Alarm) => { void ack(a.alarm_id, actor).then((ok) => ok && auditAlarm(a, 'ALARM_ACK', `${a.param_id} acknowledged`)); };

  return (
    <div className="flex flex-col gap-2">
      {mine.map((a) => {
        const open = a.state === 'UNACK' || a.state === 'ESCALATED';
        return (
          <div key={a.alarm_id} data-alarm={a.alarm_id} className="rounded-xl px-3.5 py-3 flex flex-col gap-2" style={{ background: open && a.alarm_state === 2 ? 'rgba(255,107,107,0.07)' : '#161A22' }}>
            <span className="flex justify-between gap-3 text-[13px]">
              <button type="button" onClick={() => onOpenParam(a.param_id)} className="text-left hover:underline">
                {a.condition ?? `${a.param_id} out of limits`} <span className="font-mono-code text-[#9AA3B2]">{fmtNum(a.eu_value)} {a.unit}</span>
              </button>
              <span className="text-[#7C8594] shrink-0">{age(a.timestamp_utc)}</span>
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <Pill tone={a.alarm_state === 2 ? 'crit' : 'warn'} glyph={a.alarm_state === 2 ? 'critical' : 'caution'}>{a.alarm_state === 2 ? 'Critical' : 'Warning'}</Pill>
              {a.state === 'ACKED' && <span className="text-[12px] text-[#7C8594]">acked by {initials(a.acknowledged_by ?? a.owner ?? '?')}</span>}
              {a.state === 'SHELVED' && <span className="text-[12px] text-[#8CC8FF]">shelved until {a.shelved_until_utc?.slice(11, 16)} UTC</span>}
              {a.state === 'ESCALATED' && <span className="text-[12px] text-[#FF7A7A]">escalated</span>}
            </span>
            {errors[a.alarm_id] && <span role="alert" className="text-[12.5px] text-[#FF7A7A]">{errors[a.alarm_id]}</span>}
            {!readOnly && open && shelving !== a.alarm_id && (
              <span className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => doAck(a)} disabled={!mayAck.allowed} reason={mayAck.reason}>Acknowledge</Button>
                {mayShelve.allowed && <Button size="sm" variant="secondary" onClick={() => setShelving(a.alarm_id)}>Shelve</Button>}
              </span>
            )}
            {shelving === a.alarm_id && (
              <ShelveForm onCancel={() => setShelving(null)} onShelve={(reason, minutes) => {
                shelve(a.alarm_id, reason, minutes, actor); auditAlarm(a, 'ALARM_SHELVE', `${minutes} min: ${reason}`); setShelving(null);
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
};
