import React, { useState } from 'react';
import { Button } from '../../components/atoms/Button';
import { Pill, Tone } from '../../components/atoms/Badge';
import { Card, Drawer, PageHead, SampleTag, Segmented, Td, Th, Tile } from '../../components/molecules/Page';
import { Rule, useOnCallStore } from '../../store/useOnCallStore';
import { useAuthStore } from '../../store/useAuthStore';
import { can } from '../../auth/policy';
import { initials, utc } from '../../store/govern';
import { toast } from '../../store/useToastStore';
import { Select } from '../../components/molecules/Select';
import { Stepper } from '../../components/molecules/Stepper';

const STATE: Record<string, [Tone, string]> = {
  DELIVERED: ['info', 'Delivered'], RETRYING: ['warn', 'Retrying'], ESCALATED: ['crit', 'Escalated'], ACKNOWLEDGED: ['ok', 'Acknowledged'],
};
const CHANNELS = ['Push', 'SMS', 'Voice', 'Email'];
const inputCls = 'h-9 rounded-[10px] bg-[#0D1016] border border-[#232936] px-3 text-[13px] text-[#E9ECF1] outline-none focus:border-[#6CB8FF]';
const say = (err: string | null, ok: string, body?: string) => (err ? toast.warning('Not done', { body: err }) : toast.success(ok, { body }));

/** S28 · Notifications and on-call. */
export const OnCall: React.FC<{ onNavigate?: (to: string) => void }> = () => {
  const { rota, rules, steps, pages, acknowledge, takeOver, testPage } = useOnCallStore();
  const me = useAuthStore((s) => s.user);
  const role = useAuthStore((s) => s.activeRole);
  const admin = can('platform:admin', role);
  const [filter, setFilter] = useState<'ALL' | 'OPEN' | 'ACKNOWLEDGED'>('ALL');
  const [channel, setChannel] = useState('Push');
  const [edit, setEdit] = useState<Rule | null>(null);
  const open = pages.filter((p) => p.state !== 'ACKNOWLEDGED');
  const rows = pages.filter((p) => filter === 'ALL' || (filter === 'OPEN' ? p.state !== 'ACKNOWLEDGED' : p.state === 'ACKNOWLEDGED'));

  return (
    <>
      <PageHead title="Notifications and on-call" sub={`Who is paged, in what order, and what happened to every page. ${open.length} page${open.length === 1 ? '' : 's'} not acknowledged.`}
        actions={<SampleTag>Sample deliveries</SampleTag>} />

      <div className="grid gap-4 mb-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {rota.map((o) => {
          const mine = o.name === me.name;
          const fdOnly = o.position === 'Flight Director' && role !== 'Flight Director';
          return (
            <div key={o.position} data-oncall={o.name} className="contents"><Card>
              <div className="flex flex-col gap-3">
                <span className="text-[13px] text-[#9AA3B2]">{o.position}</span>
                <span className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-full bg-[#232936] text-[13px] font-semibold flex items-center justify-center">{initials(o.name)}</span>
                  <span className="flex flex-col"><span className="text-[15px] font-medium">{o.name}{mine && <span className="text-[#7C8594]"> · you</span>}</span><span className="text-[12.5px] text-[#7C8594]">until {utc(o.until_utc)}</span></span>
                </span>
                <span className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" disabled={mine || fdOnly} reason={fdOnly ? 'Flight Director slot needs the Flight Director role.' : undefined}
                    onClick={() => say(takeOver(o.position), `You are ${o.position.toLowerCase()} on-call`, 'For the next 8 hours.')}>{mine ? 'You hold this slot' : 'Take over'}</Button>
                  <Button size="sm" variant="ghost" onClick={() => say(testPage(o.position, channel), 'Test page sent', `${o.name} by ${channel}`)}>Test page</Button>
                </span>
              </div>
            </Card></div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-4 items-start mb-5">
        <Card className="flex-[999_1_560px] min-w-0" title="Routing rules" flush actions={!admin.allowed && <span className="text-[#7C8594]">{admin.reason}</span>}>
          <div className="overflow-x-auto px-2 pb-2">
            <table className="w-full min-w-[560px] border-collapse">
              <thead><tr><Th>Trigger</Th><Th>Goes to</Th><Th>Escalates</Th><Th /></tr></thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <Td className="text-[#E9ECF1]">{r.trigger}</Td>
                    <Td>{r.target}</Td>
                    <Td>{r.after_min ? <>after <span className="font-mono-code text-[#F5C451]">{r.after_min} min</span> · {r.escalate_to}</> : '—'}</Td>
                    <Td className="text-right"><Button size="sm" variant="ghost" disabled={!admin.allowed} onClick={() => setEdit(r)}>Edit</Button></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="flex-[1_1_320px] min-w-0" title="Escalation for an unacknowledged critical alarm">
          <ol className="flex flex-col gap-2">
            {steps.map((s) => (
              <Tile key={s.atMin} className="flex items-center gap-3">
                <Pill tone="warn" className="font-mono-code">{s.atMin} min</Pill>
                <span className="text-[13px]">{s.text}</span>
              </Tile>
            ))}
          </ol>
          <label className="flex items-center gap-2 mt-4 text-[12.5px] text-[#9AA3B2]">Test pages go by
            <Select value={channel} onChange={(e) => setChannel(e.target.value)} className={inputCls}>{CHANNELS.map((c) => <option key={c}>{c}</option>)}</Select>
          </label>
        </Card>
      </div>

      <Card title="Delivery log" flush actions={<Segmented size="sm" value={filter} onChange={setFilter}
        options={[{ value: 'ALL', label: 'All' }, { value: 'OPEN', label: `Not acknowledged · ${open.length}` }, { value: 'ACKNOWLEDGED', label: 'Acknowledged' }]} />}>
        <div className="overflow-x-auto px-2 pb-2">
          <table className="w-full min-w-[760px] border-collapse">
            <thead><tr><Th>Page</Th><Th>Trigger</Th><Th>Channel</Th><Th>Recipient</Th><Th>Sent</Th><Th>State</Th><Th /></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><Td colSpan={7} className="text-[#7C8594]">Nothing here.</Td></tr>}
              {rows.map((d) => (
                <tr key={d.id}>
                  <Td className="font-mono-code text-[12.5px]">{d.id}</Td>
                  <Td className="text-[#E9ECF1]">{d.trigger}{d.test && <span className="text-[#7C8594]"> · test</span>}</Td>
                  <Td>{d.channel}</Td>
                  <Td>{d.recipient}</Td>
                  <Td className="font-mono-code text-[12px] whitespace-nowrap">{utc(d.sent_utc)}</Td>
                  <Td><Pill tone={STATE[d.state][0]}>{STATE[d.state][1]}</Pill>{d.ackBy && <span className="block text-[12px] text-[#7C8594] mt-1">by {d.ackBy} {utc(d.ackAt!)}</span>}</Td>
                  <Td className="text-right">{d.state !== 'ACKNOWLEDGED' && <Button size="sm" onClick={() => say(acknowledge(d.id), 'Page acknowledged', d.id)}>Acknowledge</Button>}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {edit && <RuleDrawer rule={edit} onClose={() => setEdit(null)} />}
    </>
  );
};

const RuleDrawer: React.FC<{ rule: Rule; onClose: () => void }> = ({ rule, onClose }) => {
  const updateRule = useOnCallStore((s) => s.updateRule);
  const [target, setTarget] = useState(rule.target);
  const [esc, setEsc] = useState(!!rule.after_min);
  const [after, setAfter] = useState(rule.after_min ?? 5);
  const [to, setTo] = useState(rule.escalate_to ?? 'Page secondary on-call');
  const [err, setErr] = useState<string | null>(null);
  const save = () => {
    const e = updateRule(rule.id, { target, after_min: esc ? after : undefined, escalate_to: esc ? to : undefined });
    setErr(e);
    if (!e) { toast.success('Routing rule saved', { body: rule.trigger }); onClose(); }
  };
  return (
    <Drawer title="Edit routing rule" onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Save rule</Button></>}>
      <p className="text-[13.5px] text-[#E9ECF1]">{rule.trigger}</p>
      <label className="flex flex-col gap-1 text-[12.5px] text-[#9AA3B2]">Goes to<input value={target} onChange={(e) => setTarget(e.target.value)} className={inputCls} /></label>
      <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={esc} onChange={(e) => setEsc(e.target.checked)}  />Escalate when not acknowledged</label>
      {esc && <>
        <label className="flex flex-col gap-1 text-[12.5px] text-[#9AA3B2]">After (minutes)<span className="flex gap-1"><input type="number" min={1} max={240} value={after} onChange={(e) => setAfter(Number(e.target.value))} className={`${inputCls} flex-1 min-w-0`} /><Stepper value={after} onChange={setAfter} step={5} min={1} max={240} label="minutes" /></span></label>
        <label className="flex flex-col gap-1 text-[12.5px] text-[#9AA3B2]">Escalate to<input value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} /></label>
      </>}
      {err && <p className="text-[12.5px] text-[#FF7A7A]">{err}</p>}
    </Drawer>
  );
};
