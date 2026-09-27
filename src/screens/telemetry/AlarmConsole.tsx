import React, { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { Activity, Antenna, Camera, CircleDot, Database, Terminal } from 'lucide-react';
import { Button } from '../../components/atoms/Button';
import { AlarmDetail } from '../../components/organisms/AlarmDetail';
import { Banner, Card, Drawer, KpiTile, PageHead, Td, Th } from '../../components/molecules/Page';
import { useAlarmStore } from '../../store/useAlarmStore';
import { useMissionStore } from '../../store/useMissionStore';
import { useAuthStore } from '../../store/useAuthStore';
import { CATEGORIES, AlarmCategory, UAlarm, useDerivedAckStore, useUnifiedAlarms } from '../../ops/opsAlarms';
import { can } from '../../auth/policy';

const AGE = (ms: number) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min` : `${Math.floor(s / 3600)} h`;
};

const STATE_STYLE: Record<string, string> = {
  UNACK: 'border-[#FCE83A]/60 bg-[#FCE83A]/12 text-[#FCE83A]',
  ACKED: 'border-[#9C9AEC]/60 bg-[#9C9AEC]/12 text-[#9C9AEC]',
  SHELVED: 'border-[#FCE83A]/40 bg-transparent text-[#FCE83A] border-dashed',
  ESCALATED: 'border-[#D42C2C]/60 bg-[#D42C2C]/16 text-[#FF3838]',
};
const Pill: React.FC<{ state: string }> = ({ state }) => (
  <span className={`inline-flex items-center rounded-full border px-2 h-5 font-mono-code text-[10.5px] font-bold ${STATE_STYLE[state]}`}>{state}</span>
);

const ICON: Record<AlarmCategory, React.ElementType> = { HEALTH: Activity, CONJUNCTION: CircleDot, PAYLOAD: Camera, COMMAND: Terminal, GROUND: Antenna, DATA: Database };
const SHELVE_FOR: [number, string][] = [[15, '15 min'], [30, '30 min'], [60, '1 h'], [240, '4 h'], [720, '12 h']];
const cap = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

/** S06 · Alarm console — every kind of alert, grouped by type, with an analysis view for each. */
export const AlarmConsole: React.FC<{ onNavigate: (to: string) => void }> = ({ onNavigate }) => {
  const { history, acknowledgeAlarm, shelveAlarm, escalateAlarm } = useAlarmStore();
  const deriveAck = useDerivedAckStore((s) => s.ack);
  const advisories = useMissionStore((s) => s.advisories);
  const role = useAuthStore((s) => s.activeRole);
  const actor = useAuthStore((s) => s.user.name);
  const mayAck = can('alarm:ack', role);
  const mayShelve = can('alarm:shelve', role);

  const all = useUnifiedAlarms();
  const [cat, setCat] = useState<AlarmCategory | 'ALL'>('ALL');
  const [filter, setFilter] = useState<'ALL' | 'UNACK' | 'ACKED' | 'SHELVED'>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shelving, setShelving] = useState(false);
  const [reason, setReason] = useState('');
  const [minutes, setMinutes] = useState(30);

  const counts = useMemo(() => Object.fromEntries(CATEGORIES.map((c) => [c.id, { n: all.filter((a) => a.category === c.id).length, crit: all.filter((a) => a.category === c.id && a.severity === 2).length }])) as Record<AlarmCategory, { n: number; crit: number }>, [all]);
  const rows = all.filter((a) => (cat === 'ALL' || a.category === cat) && (filter === 'ALL' || a.state === filter));
  const newAdvisories = advisories.filter((a) => a.state === 'NEW');

  const groups = useMemo(() => {
    const key = (a: UAlarm) => (cat === 'ALL' ? CATEGORIES.find((c) => c.id === a.category)!.label : cat === 'HEALTH' ? `${cap(a.group ?? 'POWER')} subsystem` : '');
    const map = new Map<string, UAlarm[]>();
    rows.forEach((a) => map.set(key(a), [...(map.get(key(a)) ?? []), a]));
    return [...map.entries()];
  }, [rows, cat]);

  const current = selectedId ? all.find((a) => a.id === selectedId) : undefined;
  const linkedAdvisory = current?.health?.advisory_id ? advisories.find((a) => a.advisory_id === current.health!.advisory_id) : undefined;
  const isHealth = current?.category === 'HEALTH';

  const ack = (a: UAlarm) => (a.category === 'HEALTH' ? acknowledgeAlarm(a.id, actor) : deriveAck(a.id, actor));

  return (
    <>
      <PageHead title="Alarm console" sub="Grouped by type · click an alarm for its analysis · shelving needs a reason and an expiry" />

      {!mayAck.allowed && <Banner kind="warn" lead="Read only.">{mayAck.reason}</Banner>}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
        {CATEGORIES.map((c) => {
          const Icon = ICON[c.id];
          const n = counts[c.id];
          return (
            <button key={c.id} onClick={() => setCat(cat === c.id ? 'ALL' : c.id)} aria-pressed={cat === c.id}
              className={clsx('text-left rounded-xl border p-3.5 flex flex-col gap-1.5 hover:border-[#3E5370]', cat === c.id ? 'border-[#2E6FD8] bg-[#2E6FD8]/10' : 'border-[#213044] bg-[#111A25]')}>
              <span className="flex items-center justify-between text-[12px] text-[#A3B1C2]"><span className="flex items-center gap-1.5"><Icon size={14} />{c.label}</span></span>
              <span className={clsx('numeric text-[26px] font-semibold', n.crit ? 'text-[#FF3838]' : n.n ? 'text-[#FCE83A]' : 'text-[#56F000]')}>{n.n}</span>
              <span className="text-[11px] text-[#8496AB] leading-snug">{n.crit ? `${n.crit} critical` : n.n ? 'warnings only' : 'all clear'}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex gap-1.5 flex-wrap">
          {(['ALL', ...CATEGORIES.map((c) => c.id)] as const).map((c) => (
            <button key={c} onClick={() => setCat(c)} className={clsx('h-[28px] px-3 rounded-full border text-[12px]', cat === c ? 'border-[#2E6FD8] text-white bg-[#2E6FD8]' : 'border-[#2A3B52] text-[#A3B1C2] hover:bg-[#172434]')}>
              {c === 'ALL' ? `All ${all.length}` : `${CATEGORIES.find((x) => x.id === c)!.label} ${counts[c].n}`}
            </button>
          ))}
        </div>
        <span className="mx-1 h-5 w-px bg-[#2A3B52]" />
        {(['ALL', 'UNACK', 'ACKED', 'SHELVED'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={clsx('h-[28px] px-3 rounded-full border text-[12px]', filter === f ? 'border-[#4DACFF] text-[#4DACFF]' : 'border-[#2A3B52] text-[#A3B1C2] hover:bg-[#172434]')}>
            {f === 'ALL' ? 'Any state' : cap(f)}
          </button>
        ))}
        <span className="ml-auto text-[12px] text-[#8496AB]">{history.length} returned to normal this session</span>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto -m-3.5">
          <table className="w-full border-collapse">
            <thead><tr><Th>Sev</Th><Th>Alarm</Th><Th>Satellite</Th><Th>Condition</Th><Th>Value</Th><Th>State</Th><Th>Age</Th><Th>Owner</Th><Th>{null}</Th></tr></thead>
            <tbody>
              {rows.length === 0 && newAdvisories.length === 0 && <tr><Td className="text-[#A3B1C2]">No alarms in this view.</Td></tr>}
              {groups.map(([label, list]) => (
                <React.Fragment key={label || 'flat'}>
                  {label && (
                    <tr><td colSpan={9} className="px-3.5 py-1.5 bg-[#16222F] text-[11px] font-bold uppercase tracking-[0.06em] text-[#8496AB] border-y border-[#213044]">
                      {label} <span className="text-[#5F7087] normal-case tracking-normal font-normal">· {list.length}</span>
                    </td></tr>
                  )}
                  {list.map((a) => (
                    <tr key={a.id} onClick={() => { setSelectedId(a.id); setShelving(false); }} className="cursor-pointer hover:bg-[#172434]">
                      <Td>
                        <span className={`inline-block w-[3px] h-4 rounded-sm mr-2 align-middle ${a.severity === 2 ? 'bg-[#D42C2C]' : 'bg-[#FCE83A]'}`} />
                        <span className={`font-mono-code text-[11px] font-bold ${a.severity === 2 ? 'text-[#FF3838]' : 'text-[#FCE83A]'}`}>{a.severity === 2 ? 'CRITICAL' : 'WARNING'}</span>
                      </Td>
                      <Td className="font-mono-code text-[12.5px] text-[#4DACFF] whitespace-nowrap">{a.id}</Td>
                      <Td className="font-mono-code text-[12.5px] whitespace-nowrap">{a.sat_id}</Td>
                      <Td>{a.title}</Td>
                      <Td className="tabular-nums whitespace-nowrap">{a.value ?? '—'}</Td>
                      <Td><Pill state={a.state} /></Td>
                      <Td className="tabular-nums text-[#A3B1C2]">{AGE(a.at)}</Td>
                      <Td className="text-[#A3B1C2]">{a.owner ?? '—'}</Td>
                      <Td>{a.state === 'UNACK' && <Button size="sm" onClick={(e) => { e.stopPropagation(); ack(a); }} disabled={!mayAck.allowed} title={mayAck.reason}>Ack</Button>}</Td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}

              {/* AI advisories sit in their own rows and never auto-escalate (BR-S06-02). */}
              {cat === 'ALL' && filter === 'ALL' && newAdvisories.length > 0 && (
                <>
                  <tr><td colSpan={9} className="px-3.5 py-1.5 bg-[#16222F] text-[11px] font-bold uppercase tracking-[0.06em] text-[#8496AB] border-y border-[#213044]">AI advisories <span className="text-[#5F7087] normal-case tracking-normal font-normal">· {newAdvisories.length}</span></td></tr>
                  {newAdvisories.map((a) => (
                    <tr key={a.advisory_id} onClick={() => onNavigate(`anomalies?id=${a.advisory_id}`)} className="cursor-pointer hover:bg-[#172434]">
                      <Td><span className="inline-block w-[3px] h-4 rounded-sm mr-2 align-middle bg-[#C77DDB]" /><span className="font-mono-code text-[11px] font-bold text-[#C77DDB]">ADVISORY</span></Td>
                      <Td className="font-mono-code text-[12.5px] text-[#4DACFF]">{a.advisory_id}</Td>
                      <Td className="font-mono-code text-[12.5px] whitespace-nowrap">{a.sat_id}</Td>
                      <Td>{a.title}</Td>
                      <Td className="tabular-nums">score {a.score.toFixed(2)}</Td>
                      <Td><span className="inline-flex items-center rounded-full border border-[#C77DDB]/60 bg-[#C77DDB]/12 text-[#C77DDB] px-2 h-5 font-mono-code text-[10.5px] font-bold">{a.tier}</span></Td>
                      <Td className="tabular-nums text-[#A3B1C2]">{AGE(Date.parse(a.detected_utc))}</Td><Td className="text-[#A3B1C2]">—</Td><Td>{null}</Td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {current && (
        <Drawer
          title={`${CATEGORIES.find((c) => c.id === current.category)!.label} · ${current.sat_id}`}
          onClose={() => { setSelectedId(null); setShelving(false); }}
          footer={
            <>
              {current.state === 'UNACK' && <Button onClick={() => ack(current)} disabled={!mayAck.allowed} title={mayAck.reason}>Acknowledge</Button>}
              {isHealth && <Button variant="secondary" onClick={() => setShelving((v) => !v)} disabled={!mayShelve.allowed} title={mayShelve.reason}>Shelve…</Button>}
              {isHealth && <Button variant="danger" onClick={() => escalateAlarm(current.id, 'On-call')} disabled={!mayAck.allowed} title={mayAck.reason}>Escalate</Button>}
            </>
          }
        >
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2"><Pill state={current.state} /><span className="font-mono-code text-[11.5px] text-[#8496AB]">{current.id}</span></div>
            <p className="text-[14px] font-semibold">{current.title}</p>
          </div>

          {shelving && (
            <div className="flex flex-col gap-2 border border-[#2A3B52] rounded p-3">
              <label className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#A3B1C2]">Reason (required)</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)} className="h-9 bg-[#0A1018] border border-[#2A3B52] focus:border-[#2DCCFF] rounded-md px-2.5 text-[14px] outline-none" />
              <label className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#A3B1C2]">Expires after</label>
              <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="h-9 bg-[#0A1018] border border-[#2A3B52] rounded-md px-2.5 text-[14px]">{SHELVE_FOR.map(([m, l]) => <option key={m} value={m}>{l}</option>)}</select>
              <p className="text-[11.5px] text-[#8496AB]">A shelve always ends: the alarm comes back on its own after this time.</p>
              <Button size="sm" disabled={!reason.trim()} onClick={() => { shelveAlarm(current.id, reason, minutes); setShelving(false); setReason(''); }}>Shelve for {SHELVE_FOR.find(([m]) => m === minutes)?.[1]}</Button>
            </div>
          )}

          {linkedAdvisory && <Banner kind="advisory" lead="Advisory evidence.">{linkedAdvisory.advisory_id} — {linkedAdvisory.detail}</Banner>}

          <AlarmDetail alarm={current} onNavigate={onNavigate} />

          {current.health?.timeline && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#8496AB]">Timeline</span>
              {current.health.timeline.map((t, i) => (
                <div key={i} className="flex gap-2 text-[12.5px]"><span className="font-mono-code text-[#A3B1C2]">{t.utc.slice(11, 19)}</span><span>{t.text}</span></div>
              ))}
            </div>
          )}
        </Drawer>
      )}
    </>
  );
};
