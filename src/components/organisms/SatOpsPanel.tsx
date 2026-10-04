import React from 'react';
import { clsx } from 'clsx';
import { Crosshair, Download, Rocket, ScrollText } from 'lucide-react';
import { useConjunctionStore } from '../../ops/conjunctionStore';
import { EventKind, SatEvent, getSatOps } from '../../ops/satOps';
import { Card } from '../molecules/Page';

const hm = (ms: number) => new Date(ms).toISOString().slice(5, 16).replace('T', ' ');
const rel = (ms: number) => { const m = Math.round(Math.abs(ms) / 60000); const s = m >= 1440 ? `${Math.floor(m / 1440)}d` : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; return ms >= 0 ? `in ${s}` : `${s} ago`; };
const ICON: Record<EventKind, React.ElementType> = { IMAGING: Crosshair, DUMP: Download, MANEUVER: Rocket, PROCEDURE: ScrollText };
const KIND_LABEL: Record<EventKind, string> = { IMAGING: 'Imaging', DUMP: 'Dump', MANEUVER: 'Manoeuvre', PROCEDURE: 'Procedure' };
const STATE_TONE = { DONE: 'text-[#4ADE9A]', ACTIVE: 'text-[#6CB8FF]', PLANNED: 'text-[#9AA3B2]', FAILED: 'text-[#FF6B6B]' } as const;

const Bar: React.FC<{ label: string; pct: number; tone?: string }> = ({ label, pct, tone = '#6CB8FF' }) => (
  <div className="flex items-center gap-2 text-[12px]">
    <span className="w-[86px] text-[#9AA3B2]">{label}</span>
    <span className="flex-1 h-1.5 rounded-full bg-[#1A1E27] overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${pct}%`, background: tone }} /></span>
    <span className="w-9 text-right tabular-nums">{pct}%</span>
  </div>
);

const EventRow: React.FC<{ e: SatEvent; now: number }> = ({ e, now }) => {
  const Icon = ICON[e.kind];
  return (
    <li className="flex items-start gap-2.5 py-1.5">
      <Icon size={14} className="mt-0.5 text-[#7C8594] shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="block text-[12.5px] truncate">{e.label}</span>
        <span className="block text-[11px] text-[#7C8594]">{hm(e.at)} UTC · {rel(e.at - now)}{e.detail ? ` · ${e.detail}` : ''}</span>
      </span>
      <span className={clsx('text-[12px]', STATE_TONE[e.state])}>{e.state.charAt(0) + e.state.slice(1).toLowerCase()}</span>
    </li>
  );
};

/** Payload, data chain, procedure uplink, flight dynamics and the on-board plan for one satellite. */
export const SatOpsPanel: React.FC<{ satId: string }> = ({ satId }) => {
  const now = Date.now();
  const ops = getSatOps(satId, now);
  const conj = useConjunctionStore((s) => s.conjunctions).filter((c) => c.satId === satId)[0];

  const kinds: EventKind[] = ['IMAGING', 'DUMP', 'MANEUVER'];
  const last = kinds.map((k) => [...ops.events].reverse().find((e) => e.kind === k && e.at <= now)).filter((e): e is SatEvent => Boolean(e));
  const planned = kinds.map((k) => ops.events.find((e) => e.kind === k && e.at > now)).filter((e): e is SatEvent => Boolean(e));

  return (
    <>
      <Card title="Payload and data">
        <div className="flex flex-col gap-2">
          <div className="flex justify-between text-[12.5px]"><span className="text-[#9AA3B2]">Payload</span><span className="font-medium">{ops.payload.status.charAt(0) + ops.payload.status.slice(1).toLowerCase()}</span></div>
          <div className="flex justify-between text-[12.5px]"><span className="text-[#9AA3B2]">Imaging today</span><span className="tabular-nums">{ops.payload.imagesToday} sessions</span></div>
          <Bar label="Downloaded" pct={ops.data.downlinkedPct} tone="#3DD9C1" />
          <Bar label="Processed" pct={ops.data.processedPct} tone="#9B8CFF" />
          <div className="flex justify-between text-[12px] text-[#7C8594]"><span>Pending on board</span><span className="tabular-nums">{ops.data.pendingGb} GB</span></div>
        </div>
      </Card>

      <Card title="Procedure uplink">
        <div className="flex flex-col gap-2 text-[12.5px]">
          <span className="truncate">{ops.uplink.procedure}</span>
          <Bar label={ops.uplink.state.charAt(0) + ops.uplink.state.slice(1).toLowerCase()} pct={ops.uplink.pct} tone={ops.uplink.state === 'FAILED' ? '#E5484D' : '#6CB8FF'} />
        </div>
      </Card>

      <Card title="Last events">
        <ul className="divide-y divide-[#161A22]">{last.map((e) => <EventRow key={e.id} e={e} now={now} />)}</ul>
      </Card>

      <Card title="On-board planned">
        <ul className="divide-y divide-[#161A22]">
          {planned.map((e) => <EventRow key={e.id} e={e} now={now} />)}
          {planned.length === 0 && <li className="text-[12.5px] text-[#7C8594] py-1">Nothing planned.</li>}
        </ul>
        <p className="text-[11px] text-[#6B7383] mt-2">{kinds.map((k) => KIND_LABEL[k]).join(' · ')}</p>
      </Card>

      <Card title="Flight dynamics and safety">
        <div className="flex flex-col gap-1.5 text-[12.5px]">
          <div className="flex justify-between gap-3"><span className="text-[#9AA3B2]">Last manoeuvre</span><span className="text-right">{ops.fd.lastOm ? `${ops.fd.lastOm.name} · ${ops.fd.lastOm.status.toLowerCase()} · ${rel(ops.fd.lastOm.at - now)}` : '—'}</span></div>
          <div className="flex justify-between gap-3"><span className="text-[#9AA3B2]">Next manoeuvre</span><span className="text-right">{ops.fd.nextOm ? `${ops.fd.nextOm.name} · ${rel(ops.fd.nextOm.at - now)}` : 'none planned'}</span></div>
          <div className="flex justify-between gap-3"><span className="text-[#9AA3B2]">Last contingency</span><span className="text-right">{ops.contingency ? `${ops.contingency.name} · ${rel(ops.contingency.at - now)}` : 'none recorded'}</span></div>
          <div className="flex justify-between gap-3"><span className="text-[#9AA3B2]">Conjunction</span>
            <span className={clsx('text-right', conj ? (conj.risk === 'CRITICAL' ? 'text-[#FF6B6B]' : 'text-[#F5C451]') : 'text-[#4ADE9A]')}>
              {conj ? `${conj.missKm.toFixed(1)} km with ${conj.objectName} · ${rel(conj.tcaMs - now)}` : 'clear for 4 h'}
            </span>
          </div>
        </div>
      </Card>
    </>
  );
};
