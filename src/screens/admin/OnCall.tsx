import React, { useState } from 'react';
import { clsx } from 'clsx';
import { Card, PageHead, Td, Th } from '../../components/molecules/Page';
import { DELIVERY_LOG, ONCALL, ROUTING_RULES } from '../../data/fleet';

const STATE_CLS: Record<string, string> = {
  DELIVERED: 'text-[#56F000]',
  RETRYING: 'text-[#FCE83A]',
  ESCALATED: 'text-[#FF3838]',
  ACKNOWLEDGED: 'text-[#9C9AEC]',
};

/** S28 · Notifications & on-call. */
export const OnCall: React.FC = () => {
  const [filter, setFilter] = useState<'ALL' | keyof typeof STATE_CLS>('ALL');
  const rows = DELIVERY_LOG.filter((d) => filter === 'ALL' || d.state === filter);

  return (
    <>
      <PageHead title="Notifications & on-call" sub="Routing, escalation and the current rota" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        {ONCALL.map((o) => (
          <Card key={o.position}>
            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#A3B1C2]">{o.position}</span>
            <div className="flex items-center gap-2.5 mt-2">
              <span className="w-8 h-8 rounded-full bg-[#2C3E55] text-[12px] font-bold flex items-center justify-center">
                {o.name.split(' ').map((w) => w[0]).join('')}
              </span>
              <div className="flex flex-col">
                <span className="text-[14px] font-bold">{o.name}</span>
                <span className="font-mono-code text-[11.5px] text-[#A3B1C2]">until {o.until_utc.slice(11, 16)} UTC</span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card title="Routing rules">
          <table className="w-full border-collapse">
            <thead><tr><Th>Trigger</Th><Th>Goes to</Th><Th>Escalates</Th></tr></thead>
            <tbody>
              {ROUTING_RULES.map((r) => (
                <tr key={r.trigger}>
                  <Td>{r.trigger}</Td>
                  <Td className="text-[#A3B1C2]">{r.target}</Td>
                  <Td className="text-[12px] text-[#A3B1C2]">
                    {r.escalate_to ? <><span className="font-mono-code text-[#FCE83A]">{r.after_min} min</span> · {r.escalate_to}</> : '—'}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Escalation policy">
          <ol className="flex flex-col gap-3">
            {[
              { at: '0 min', text: 'Notify primary on-call (push + SMS)' },
              { at: '5 min', text: 'Page secondary on-call' },
              { at: '15 min', text: 'Escalate to Flight Director' },
            ].map((s, i) => (
              <li key={s.at} className="flex gap-3 items-start">
                <span className="font-mono-code text-[11px] font-bold rounded-full border border-[#FCE83A]/60 bg-[#FCE83A]/12 text-[#FCE83A] px-2 h-5 flex items-center shrink-0">{s.at}</span>
                <span className="text-[13px]">{s.text}</span>
                {i === 0 && <span className="text-[12px] text-[#A3B1C2] ml-auto">unacknowledged CRITICAL</span>}
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <Card
        title="Delivery log"
        actions={
          <div className="flex gap-1.5">
            {(['ALL', 'DELIVERED', 'RETRYING', 'ESCALATED', 'ACKNOWLEDGED'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={clsx('h-[26px] px-2.5 rounded-full border text-[12px]',
                  filter === f ? 'border-[#2E6FD8] text-white bg-[#2E6FD8]' : 'border-[#2A3B52] text-[#A3B1C2] hover:bg-[#172434]')}>
                {f === 'ALL' ? 'All' : f[0] + f.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        }
      >
        <table className="w-full border-collapse">
          <thead><tr><Th>ID</Th><Th>Trigger</Th><Th>Channel</Th><Th>Recipient</Th><Th>Sent</Th><Th>State</Th></tr></thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <Td className="font-mono-code text-[12.5px] text-[#4DACFF]">{d.id}</Td>
                <Td>{d.trigger}</Td>
                <Td className="text-[#A3B1C2]">{d.channel}</Td>
                <Td>{d.recipient}</Td>
                <Td className="font-mono-code text-[12px] tabular-nums text-[#A3B1C2]">{d.sent_utc.slice(11, 19)}</Td>
                <Td className={STATE_CLS[d.state]}>{d.state}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
};
