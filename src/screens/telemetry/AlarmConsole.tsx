import React, { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { Button } from '../../components/atoms/Button';
import { Pill, Tone } from '../../components/atoms/Badge';
import { AlarmDetail } from '../../components/organisms/AlarmDetail';
import { auditAlarm, ShelveForm } from '../../components/organisms/AlarmPanel';
import { Banner, KpiRow, KpiTile, PageHead } from '../../components/molecules/Page';
import { useAlarmStore } from '../../store/useAlarmStore';
import { useMissionStore } from '../../store/useMissionStore';
import { useAuthStore } from '../../store/useAuthStore';
import { CATEGORIES, AlarmCategory, UAlarm, useDerivedAckStore, useUnifiedAlarms } from '../../ops/opsAlarms';
import { can } from '../../auth/policy';
import { useOnCallStore } from '../../store/useOnCallStore';
import { parseHash } from '../../router/routes';
import { fmtUtc } from '../../ops/history';
import { RoleLink } from './RoleLink';

const AGE = (ms: number) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min` : `${Math.floor(s / 3600)} h`;
};
const initials = (n?: string) => (n ?? '').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const STATE: Record<UAlarm['state'], [Tone, (a: UAlarm) => string]> = {
  UNACK: ['action', () => 'Unacknowledged'],
  ACKED: ['neutral', (a) => `Acked · ${initials(a.owner)}`],
  SHELVED: ['info', (a) => `Shelved → ${a.health?.shelved_until_utc?.slice(11, 16) ?? ''}`],
  ESCALATED: ['crit', () => 'Paged on-call'],
};
const CAT_LABEL: Record<AlarmCategory, string> = { HEALTH: 'Health', CONJUNCTION: 'Conjunction', PAYLOAD: 'Payload', COMMAND: 'Commands', GROUND: 'Ground', DATA: 'Data' };

/** S06 · Alarm console — every kind of alert in one soft table, with the analysis and the actions beside it. */
export const AlarmConsole: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => {
  const { params } = parseHash();
  const cat = (CATEGORIES.some((c) => c.id === params.cat) ? params.cat : 'ALL') as AlarmCategory | 'ALL';
  const unackOnly = params.unack === '1';
  const selectedId = params.id ?? params.alarm ?? null;
  const setQuery = (p: { cat?: string; unack?: boolean; id?: string | null }) => {
    const q = new URLSearchParams();
    const c = p.cat ?? cat; if (c !== 'ALL') q.set('cat', c);
    if (p.unack ?? unackOnly) q.set('unack', '1');
    const id = p.id === undefined ? selectedId : p.id; if (id) q.set('id', id);
    const s = q.toString();
    onNavigate(`alarms${s ? `?${s}` : ''}`);
  };

  const ack = useAlarmStore((s) => s.ackAlarm);
  const shelve = useAlarmStore((s) => s.shelveAlarm);
  const escalate = useAlarmStore((s) => s.escalateAlarm);
  const ackErrors = useAlarmStore((s) => s.ackErrors);
  const closed = useAlarmStore((s) => s.history);
  const deriveAck = useDerivedAckStore((s) => s.ack);
  const advisories = useMissionStore((s) => s.advisories).filter((a) => a.state === 'NEW');
  const role = useAuthStore((s) => s.activeRole);
  const user = useAuthStore((s) => s.user);
  const mayAck = can('alarm:ack', role);
  const mayShelve = can('alarm:shelve', role);
  const [shelving, setShelving] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick((n) => n + 1), 15_000); return () => clearInterval(t); }, []);

  const all = useUnifiedAlarms();
  const count = (c: AlarmCategory) => all.filter((a) => a.category === c).length;
  const rows = all.filter((a) => (cat === 'ALL' || a.category === cat) && (!unackOnly || a.state === 'UNACK' || a.state === 'ESCALATED'));
  const current = selectedId ? all.find((a) => a.id === selectedId) : rows[0];
  useEffect(() => setShelving(false), [current?.id]);

  const critical = all.filter((a) => a.severity === 2);
  const warnings = all.filter((a) => a.severity === 1);
  const unack = all.filter((a) => a.state === 'UNACK' || a.state === 'ESCALATED');
  const shelved = all.filter((a) => a.state === 'SHELVED');
  const oldestUnack = unack.reduce<number | null>((m, a) => (m === null || a.at < m ? a.at : m), null);
  const shelvedUntil = shelved.map((a) => a.health?.shelved_until_utc).filter(Boolean).sort()[0];

  const onCall = useOnCallStore((s) => s.rota).find((o) => o.position === 'Primary');
  const doAck = (a: UAlarm) => {
    if (a.category === 'HEALTH' && a.health) void ack(a.id, user.name).then((ok) => ok && auditAlarm(a.health!, 'ALARM_ACK', `${a.title} acknowledged`));
    else { deriveAck(a.id, user.name); auditAlarm({ sat_id: a.sat_id, alarm_id: a.id }, 'ALARM_ACK', `${a.title} acknowledged`); }
  };
  const page = (a: UAlarm) => {
    if (!a.health) return;
    const to = onCall ? `${onCall.name} (primary on-call)` : 'primary on-call';
    escalate(a.id, to, user.name);
    auditAlarm(a.health, 'ALARM_PAGE', `paged ${to}`);
  };

  const filters: { id: AlarmCategory | 'ALL'; label: string; n: number }[] = [
    { id: 'ALL', label: 'All', n: all.length },
    ...CATEGORIES.map((c) => ({ id: c.id, label: CAT_LABEL[c.id], n: count(c.id) })),
  ];

  const isHealth = current?.category === 'HEALTH';
  const open = current && (current.state === 'UNACK' || current.state === 'ESCALATED');

  return (
    <>
      <PageHead title="Alarms" sub={<>
        <span className={critical.length ? 'text-[#FF7A7A]' : ''}>{critical.length} critical</span> · {warnings.length} warning{warnings.length === 1 ? '' : 's'} · {unack.length} unacknowledged
        {shelved.length > 0 && <> · {shelved.length} shelved{shelvedUntil ? ` until ${shelvedUntil.slice(11, 16)} UTC` : ''}</>} · {closed.length} returned to normal this session
      </>} />

      {!mayAck.allowed && <Banner kind="info" lead="Read only.">{mayAck.reason}</Banner>}

      <KpiRow>
        <KpiTile label="Critical" value={critical.length} tone={critical.length ? 'crit' : 'ok'} sub="need action" />
        <KpiTile label="Warnings" value={warnings.length} tone={warnings.length ? 'warn' : 'ok'} sub="open" />
        <KpiTile label="Unacknowledged" value={unack.length} tone={unack.length ? 'action' : 'ok'} sub={oldestUnack ? `oldest ${AGE(oldestUnack)}` : 'none waiting'}
          onClick={() => setQuery({ unack: !unackOnly, id: null })} />
        <KpiTile label="Shelved" value={shelved.length} tone="info" sub={shelvedUntil ? `until ${shelvedUntil.slice(11, 16)} UTC` : 'none'} />
      </KpiRow>

      <div className="flex flex-wrap gap-4 items-start">
        <section className="flex-[999_1_560px] min-w-0 bg-[#11141B] border border-[#1A1E27] rounded-2xl px-2 pt-2 pb-1 overflow-x-auto">
          <div className="flex flex-wrap gap-1.5 px-3 py-2.5" role="group" aria-label="Filter alarms">
            {filters.map((f) => (
              <button key={f.id} type="button" aria-pressed={cat === f.id} onClick={() => setQuery({ cat: f.id, id: null })}
                className={clsx('h-[30px] px-3 rounded-full text-[12.5px] flex items-center gap-1.5', cat === f.id ? 'bg-[#232936] text-white' : 'bg-[#161A22] text-[#9AA3B2] hover:text-[#E9ECF1]')}>
                {f.label} <span className="font-mono-code text-[#7C8594]">{f.n}</span>
              </button>
            ))}
            <button type="button" aria-pressed={unackOnly} onClick={() => setQuery({ unack: !unackOnly, id: null })}
              className={clsx('h-[30px] px-3 rounded-full text-[12.5px] flex items-center gap-1.5', unackOnly ? 'bg-[#232936] text-white' : 'bg-[#161A22] text-[#9AA3B2] hover:text-[#E9ECF1]')}>
              Unacknowledged only <span className="font-mono-code text-[#7C8594]">{unack.length}</span>
            </button>
          </div>
          <table className="w-full min-w-[780px] text-[13px] border-separate border-spacing-y-1">
            <thead><tr className="text-left text-[12px] text-[#6B7383]">
              <th className="px-3 py-1 font-normal">Severity</th><th className="px-3 py-1 font-normal">Satellite</th><th className="px-3 py-1 font-normal">Condition</th>
              <th className="px-3 py-1 font-normal text-right">Value</th><th className="px-3 py-1 font-normal">State</th><th className="px-3 py-1 font-normal text-right">Age</th>
            </tr></thead>
            <tbody>
              {rows.map((a) => {
                const sel = current?.id === a.id;
                const [tone, label] = STATE[a.state];
                return (
                  <tr key={a.id} tabIndex={0} aria-selected={sel} onClick={() => setQuery({ id: a.id })}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setQuery({ id: a.id }); } }}
                    className={clsx('cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F28C28]', sel ? 'bg-[#1B2130]' : 'bg-[#141821] hover:bg-[#171C26]')}>
                    <td className="px-3 py-2.5 rounded-l-[10px]"><Pill tone={a.severity === 2 ? 'crit' : 'warn'} glyph={a.severity === 2 ? 'critical' : 'caution'}>{a.severity === 2 ? 'Critical' : 'Warning'}</Pill></td>
                    <td className="px-3 py-2.5 font-mono-code font-medium">{a.sat_id === '—' ? a.ref : a.sat_id}</td>
                    <td className="px-3 py-2.5 leading-[1.35]">{a.title}<span className="block text-[12px] text-[#7C8594]">{CAT_LABEL[a.category]}{a.group ? ` · ${a.group.toLowerCase()}` : ''}{a.conjunction ? ` · TCA ${fmtUtc(a.conjunction.tcaMs)}` : ''}</span></td>
                    <td className={clsx('px-3 py-2.5 text-right font-mono-code whitespace-nowrap', a.severity === 2 && 'text-[#FF7A7A]')}>{a.value ?? '—'}</td>
                    <td className="px-3 py-2.5"><Pill tone={tone}>{label(a)}</Pill></td>
                    <td className="px-3 py-2.5 rounded-r-[10px] text-right font-mono-code text-[#9AA3B2]">{AGE(a.at)}</td>
                  </tr>
                );
              })}
              {cat === 'ALL' && !unackOnly && advisories.map((a) => (
                <tr key={a.advisory_id} className="bg-[#141821]">
                  <td className="px-3 py-2.5 rounded-l-[10px]"><Pill tone="violet">Advisory · {a.tier}</Pill></td>
                  <td className="px-3 py-2.5 font-mono-code font-medium">{a.sat_id}</td>
                  <td className="px-3 py-2.5 leading-[1.35]">{a.title}<span className="block text-[12px] text-[#7C8594]">AI advisory · never raises an alarm on its own</span></td>
                  <td className="px-3 py-2.5 text-right font-mono-code">score {a.score.toFixed(2)}</td>
                  <td className="px-3 py-2.5"><RoleLink to={`anomalies?id=${a.advisory_id}`} onNavigate={onNavigate}>Review</RoleLink></td>
                  <td className="px-3 py-2.5 rounded-r-[10px] text-right font-mono-code text-[#9AA3B2]">{AGE(Date.parse(a.detected_utc))}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-[#9AA3B2]">No alarms in this view.</td></tr>}
            </tbody>
          </table>
        </section>

        <aside aria-label="Alarm detail" className="flex-[1_1_360px] min-w-0">
          {!current ? (
            <section className="bg-[#11141B] border border-[#1A1E27] rounded-2xl p-5 text-[13px] text-[#9AA3B2]">Select an alarm to see what happened and what to do.</section>
          ) : (
            <section className="bg-[#11141B] border border-[#1A1E27] rounded-2xl p-5 flex flex-col gap-3.5">
              <div className="flex flex-col gap-2">
                <span className="flex flex-wrap items-center gap-2">
                  <Pill tone={current.severity === 2 ? 'crit' : 'warn'}>{current.severity === 2 ? 'Critical' : 'Warning'}</Pill>
                  <Pill>{current.group ? current.group.charAt(0) + current.group.slice(1).toLowerCase() : CAT_LABEL[current.category]}</Pill>
                  <span className="font-mono-code text-[12px] text-[#7C8594]">{current.id}</span>
                </span>
                <h2 className="text-[18px] font-semibold tracking-[-0.01em]">{current.sat_id === '—' ? '' : `${current.sat_id} `}{current.title}</h2>
                <p className="text-[13px] text-[#9AA3B2] leading-[1.45]">
                  Raised {fmtUtc(current.at)} UTC, {AGE(current.at)} ago. {open ? 'Nobody has acknowledged it.' : current.state === 'SHELVED' ? `Shelved by ${current.owner ?? '—'}: ${current.health?.shelve_reason ?? ''}` : `Acknowledged by ${current.owner ?? '—'}.`}
                </p>
              </div>

              <AlarmDetail alarm={current} onNavigate={onNavigate} />

              {ackErrors[current.id] && <Banner kind="crit" lead="Not acknowledged.">{ackErrors[current.id]}</Banner>}

              {shelving && isHealth ? (
                <ShelveForm onCancel={() => setShelving(false)} onShelve={(reason, minutes) => {
                  shelve(current.id, reason, minutes, user.name); auditAlarm(current.health!, 'ALARM_SHELVE', `${minutes} min: ${reason}`); setShelving(false);
                }} />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {open && <Button onClick={() => doAck(current)} disabled={!mayAck.allowed} reason={mayAck.reason}>Acknowledge</Button>}
                  {isHealth && current.state !== 'SHELVED' && (
                    <Button variant="secondary" onClick={() => setShelving(true)} disabled={!mayShelve.allowed} reason={mayAck.allowed ? mayShelve.reason : undefined}>Shelve with reason</Button>
                  )}
                  {isHealth && current.state !== 'ESCALATED' && (
                    <Button variant="secondary" onClick={() => page(current)} disabled={!mayAck.allowed} reason={undefined}>Page on-call</Button>
                  )}
                </div>
              )}
              <p className="text-[12px] text-[#7C8594] leading-[1.45]">
                {isHealth
                  ? `Acknowledging, shelving or paging records ${user.name}, ${role}, in the alarm timeline and the audit ledger. Acknowledgements on live satellites go to the alarm service; shelve and page are held by this console until the alarm service accepts them.`
                  : `Acknowledging records ${user.name}, ${role}. This alarm clears when its source clears; shelve and page apply to health alarms.`}
                {onCall && isHealth && ` Primary on-call: ${onCall.name}.`}
              </p>
            </section>
          )}
        </aside>
      </div>
    </>
  );
};
