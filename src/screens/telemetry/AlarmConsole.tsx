import React, { useState } from 'react';
import { Button } from '../../components/atoms/Button';
import { Banner, Card, Drawer, KpiTile, PageHead, Td, Th } from '../../components/molecules/Page';
import { useAlarmStore } from '../../store/useAlarmStore';
import { useMissionStore } from '../../store/useMissionStore';
import { useAuthStore } from '../../store/useAuthStore';
import { can } from '../../auth/policy';
import { Alarm } from '../../types';

const AGE = (utc: string) => {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(utc)) / 1000));
  return s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min` : `${Math.floor(s / 3600)} h`;
};

const STATE_STYLE: Record<string, string> = {
  UNACK: 'border-[#E8943A]/60 bg-[#E8943A]/12 text-[#E8943A]',
  ACKED: 'border-[#9C9AEC]/60 bg-[#9C9AEC]/12 text-[#9C9AEC]',
  SHELVED: 'border-[#E8943A]/40 bg-transparent text-[#E8943A] border-dashed',
  ESCALATED: 'border-[#C62828]/60 bg-[#C62828]/16 text-[#FF6B6B]',
  RTN: 'border-[#4CAF81]/60 bg-[#4CAF81]/12 text-[#4CAF81]',
};

const Pill: React.FC<{ state?: string }> = ({ state = 'UNACK' }) => (
  <span className={`inline-flex items-center rounded-full border px-2 h-5 font-mono-code text-[10.5px] font-bold tracking-[0.03em] ${STATE_STYLE[state]}`}>
    {state === 'RTN' ? 'RETURNED' : state}
  </span>
);

/** S06 · Alarm console — ISA-18.2 lifecycle. */
export const AlarmConsole: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => {
  const { active, history, acknowledgeAlarm, shelveAlarm, escalateAlarm } = useAlarmStore();
  const advisories = useMissionStore((s) => s.advisories);
  const role = useAuthStore((s) => s.activeRole);
  const actor = useAuthStore((s) => s.user.name);
  const mayAck = can('alarm:ack', role);
  const mayShelve = can('alarm:shelve', role);
  const [filter, setFilter] = useState<'ALL' | 'UNACK' | 'ACKED' | 'SHELVED'>('ALL');
  const [selected, setSelected] = useState<Alarm | null>(null);
  const [shelving, setShelving] = useState(false);
  const [reason, setReason] = useState('');

  const rows = active.filter((a) => filter === 'ALL' || a.state === filter);
  const counts = {
    critical: active.filter((a) => a.alarm_state === 2).length,
    warning: active.filter((a) => a.alarm_state === 1).length,
    unack: active.filter((a) => a.state === 'UNACK').length,
    shelved: active.filter((a) => a.state === 'SHELVED').length,
    advisory: advisories.filter((a) => a.state === 'NEW').length,
    rtn: history.length,
  };

  const current = selected ? active.find((a) => a.alarm_id === selected.alarm_id) ?? selected : null;
  const linkedAdvisory = current?.advisory_id ? advisories.find((a) => a.advisory_id === current.advisory_id) : undefined;

  return (
    <>
      <PageHead title="Alarm console" sub="ISA-18.2 lifecycle · shelving needs a reason and an expiry" />

      {!mayAck.allowed && <Banner kind="warn" lead="Read only.">{mayAck.reason}</Banner>}

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
        <KpiTile value={counts.critical} label="Critical" tone="crit" />
        <KpiTile value={counts.warning} label="Warning" tone="warn" />
        <KpiTile value={counts.unack} label="Unacknowledged" tone="pending" onClick={() => setFilter('UNACK')} />
        <KpiTile value={counts.shelved} label="Shelved" tone="warn" onClick={() => setFilter('SHELVED')} />
        <KpiTile value={counts.advisory} label="AI advisories" tone="advisory" onClick={() => onNavigate('anomalies')} />
        <KpiTile value={counts.rtn} label="Returned to normal" tone="ok" />
      </div>

      <div className="flex gap-1.5 mb-3">
        {(['ALL', 'UNACK', 'ACKED', 'SHELVED'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`h-[26px] px-3 rounded-full border text-[12px] ${filter === f ? 'border-[#0F6E56] text-white bg-[#0F6E56]' : 'border-[#2B303B] text-[#A1A7B3] hover:bg-[#1A1D24]'}`}>
            {f === 'ALL' ? 'All' : f}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto -m-3.5">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Sev</Th><Th>Alarm</Th><Th>Satellite</Th><Th>Condition</Th>
                <Th>Value / limit</Th><Th>State</Th><Th>Age</Th><Th>Owner</Th><Th>{null}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><Td className="text-[#A1A7B3]">No alarms in this filter.</Td></tr>
              )}
              {rows.map((a) => (
                <tr key={a.alarm_id} onClick={() => setSelected(a)} className="cursor-pointer hover:bg-[#1A1D24]">
                  <Td>
                    <span className={`inline-block w-[3px] h-4 rounded-sm mr-2 align-middle ${a.alarm_state === 2 ? 'bg-[#C62828]' : 'bg-[#E8943A]'}`} />
                    <span className={`font-mono-code text-[11px] font-bold ${a.alarm_state === 2 ? 'text-[#FF6B6B]' : 'text-[#E8943A]'}`}>
                      {a.alarm_state === 2 ? 'CRITICAL' : 'WARNING'}
                    </span>
                  </Td>
                  <Td className="font-mono-code text-[12.5px] text-[#3CB992]">{a.alarm_id}</Td>
                  <Td className="font-mono-code text-[12.5px]">{a.sat_id}</Td>
                  <Td>{a.condition ?? a.param_id}</Td>
                  <Td className="tabular-nums">{a.eu_value} {a.unit} / {a.limit_low_soft ?? a.limit_hi_soft} {a.unit}</Td>
                  <Td><Pill state={a.state} /></Td>
                  <Td className="tabular-nums text-[#A1A7B3]">{AGE(a.timestamp_utc)}</Td>
                  <Td className="text-[#A1A7B3]">{a.owner ?? '—'}</Td>
                  <Td>
                    {a.state === 'UNACK' && (
                      <Button size="sm" onClick={(e) => { e.stopPropagation(); acknowledgeAlarm(a.alarm_id, actor); }} disabled={!mayAck.allowed} title={mayAck.reason}>Ack</Button>
                    )}
                  </Td>
                </tr>
              ))}

              {/* AI advisories sit in their own rows and never auto-escalate (BR-S06-02). */}
              {advisories.filter((a) => a.state === 'NEW').map((a) => (
                <tr key={a.advisory_id} onClick={() => onNavigate(`anomalies?id=${a.advisory_id}`)} className="cursor-pointer hover:bg-[#1A1D24]">
                  <Td>
                    <span className="inline-block w-[3px] h-4 rounded-sm mr-2 align-middle bg-[#C77DDB]" />
                    <span className="font-mono-code text-[11px] font-bold text-[#C77DDB]">ADVISORY</span>
                  </Td>
                  <Td className="font-mono-code text-[12.5px] text-[#3CB992]">{a.advisory_id}</Td>
                  <Td className="font-mono-code text-[12.5px]">{a.sat_id}</Td>
                  <Td>{a.title}</Td>
                  <Td className="tabular-nums">score {a.score.toFixed(2)}</Td>
                  <Td><span className="inline-flex items-center rounded-full border border-[#C77DDB]/60 bg-[#C77DDB]/12 text-[#C77DDB] px-2 h-5 font-mono-code text-[10.5px] font-bold">{a.tier}</span></Td>
                  <Td className="tabular-nums text-[#A1A7B3]">{AGE(a.detected_utc)}</Td>
                  <Td className="text-[#A1A7B3]">—</Td>
                  <Td>{null}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {current && (
        <Drawer
          title={`${current.alarm_id} · ${current.sat_id}`}
          onClose={() => { setSelected(null); setShelving(false); }}
          footer={
            <>
              {current.state === 'UNACK' && <Button onClick={() => acknowledgeAlarm(current.alarm_id, actor)} disabled={!mayAck.allowed} title={mayAck.reason}>Acknowledge</Button>}
              <Button variant="secondary" onClick={() => setShelving((v) => !v)} disabled={!mayShelve.allowed} title={mayShelve.reason}>Shelve…</Button>
              <Button variant="danger" onClick={() => escalateAlarm(current.alarm_id, 'On-call')} disabled={!mayAck.allowed} title={mayAck.reason}>Escalate</Button>
            </>
          }
        >
          <div className="flex items-center gap-2">
            <Pill state={current.state} />
            <span className="text-[13px] text-[#A1A7B3]">{current.condition}</span>
          </div>

          <div className="font-display-title text-[24px] font-bold tabular-nums">
            {current.eu_value} <span className="text-[14px] text-[#A1A7B3]">{current.unit}</span>
          </div>

          {shelving && (
            <div className="flex flex-col gap-2 border border-[#2B303B] rounded p-3">
              <label className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#A1A7B3]">Reason (required)</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)}
                className="h-9 bg-[#0C0D10] border border-[#2B303B] focus:border-[#4A9EFF] rounded-[2px] px-2.5 text-[14px] outline-none" />
              <Button size="sm" disabled={!reason.trim()}
                onClick={() => { shelveAlarm(current.alarm_id, reason, 30); setShelving(false); setReason(''); }}>
                Shelve for 30 min
              </Button>
            </div>
          )}

          {linkedAdvisory && (
            <Banner kind="advisory" lead="Advisory evidence.">
              {linkedAdvisory.advisory_id} — {linkedAdvisory.detail}
            </Banner>
          )}

          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#A1A7B3]">Timeline</span>
            {(current.timeline ?? []).map((t, i) => (
              <div key={i} className="flex gap-2 text-[12.5px]">
                <span className="font-mono-code text-[#A1A7B3]">{t.utc.slice(11, 19)}</span>
                <span>{t.text}</span>
              </div>
            ))}
          </div>

          <Button variant="secondary" onClick={() => onNavigate(`satellite?sat=${current.sat_id}&tab=POWER`)}>
            Open {current.sat_id} power
          </Button>
        </Drawer>
      )}
    </>
  );
};
