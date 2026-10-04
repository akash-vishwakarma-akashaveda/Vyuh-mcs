import React, { useMemo, useState } from 'react';
import { CalendarCheck, CalendarClock, Ban } from 'lucide-react';
import { Button } from '../../components/atoms/Button';
import { Pill, Tone } from '../../components/atoms/Badge';
import { Banner, Card, KpiRow, KpiTile, PageHead, SampleTag, Tile } from '../../components/molecules/Page';
import { Modal } from '../../components/molecules/Modal';
import { FLEET, STATIONS } from '../../data/fleet';
import { can } from '../../auth/policy';
import { fleetContacts, ContactWindow } from '../../orbit/contacts';
import { useAuthStore } from '../../store/useAuthStore';
import { Booking, bookingOf, useBookingStore } from '../../store/useBookingStore';
import { usePlanStore } from '../../store/usePlanStore';
import { useMissionStore } from '../../store/useMissionStore';
import { hm, mins, RoleLink, selectCls, useHashParams, utc } from './shared';
import { Select } from '../../components/molecules/Select';

const SPAN = 24 * 3600_000, PAST = 3600_000;
const FREEZE = { from: 2, to: 3.5 }; // UTC hours: daily deploy freeze
const LABEL: Record<Booking, string> = { BOOKED: 'Booked', PREDICTED: 'To book', REQUESTED: 'Requested', SHIFTED: 'Shifted', CANCEL_REQUESTED: 'Cancelling', CANCELLED: 'Cancelled' };
const TONE: Record<Booking, Tone> = { BOOKED: 'ok', PREDICTED: 'action', REQUESTED: 'violet', SHIFTED: 'warn', CANCEL_REQUESTED: 'neutral', CANCELLED: 'neutral' };
const PILL: Record<Booking, { bg: string; b: string }> = {
  BOOKED: { bg: '#3DD9C1', b: '#3DD9C1' }, PREDICTED: { bg: 'transparent', b: '#F28C28' }, REQUESTED: { bg: 'rgba(155,140,255,0.35)', b: '#9B8CFF' },
  SHIFTED: { bg: '#F5C451', b: '#F5C451' }, CANCEL_REQUESTED: { bg: '#3A4252', b: '#3A4252' }, CANCELLED: { bg: 'transparent', b: '#3A4252' },
};

/** S09 · Contact schedule: the next 24 h of contact windows from the orbit model (SGP4 where a TLE is ingested), with booking. */
export const ContactSchedule: React.FC<{ onNavigate: (path: string) => void }> = ({ onNavigate }) => {
  const user = useAuthStore((s) => s.user);
  const role = useAuthStore((s) => s.activeRole);
  const mayBook = can('booking:edit', role);
  const { state: bookings, log, request, cancel } = useBookingStore();
  const plan = usePlanStore();
  const [q, setQ] = useHashParams();
  const station = q.station ?? 'ALL', state = (q.booking ?? 'ALL') as 'ALL' | Booking, sat = q.sat ?? 'ALL';
  const [confirmCancel, setConfirmCancel] = useState(false);
  const bucket = Math.floor(Date.now() / 600_000);
  const now = Date.now(), start = now - PAST;

  const all = useMemo(() => fleetContacts(start, SPAN), [bucket]); // eslint-disable-line react-hooks/exhaustive-deps
  const withState = all.map((c) => ({ ...c, booking: bookingOf(c, bookings) }));
  const contacts = withState.filter((c) => (station === 'ALL' || c.station === station) && (sat === 'ALL' || c.sat === sat) && (state === 'ALL' || c.booking === state));
  const rows = [...new Set(contacts.map((c) => c.sat))].sort();
  const sel = withState.find((c) => c.id === q.pass);
  const count = (b: Booking) => contacts.filter((c) => c.booking === b).length;
  const x = (t: number) => Math.min(100, Math.max(0, ((t - start) / SPAN) * 100));

  const freezes: [number, number][] = [];
  for (let d = -1; d <= 1; d++) {
    const day = new Date(now); day.setUTCHours(0, 0, 0, 0);
    const a = day.getTime() + d * 86400_000 + FREEZE.from * 3600_000, b = day.getTime() + d * 86400_000 + FREEZE.to * 3600_000;
    if (b > start && a < start + SPAN) freezes.push([a, b]);
  }

  const st = sel && STATIONS.find((s) => s.id === sel.station);
  const usedBy = sel && plan.activities.find((a) => a.contactId === sel.id);
  const auditBooking = (c: ContactWindow, what: string) => useMissionStore.getState().appendAudit({
    timestamp_utc: new Date().toISOString(), operator_id: user.id, operator_name: user.name, sat_id: c.sat, command_mnemonic: what,
    procedure_id: '—', procedure_version: '—', sequence_count: 0, result: 'ACK', params_summary: `${c.station} ${utc(c.aos)}–${hm(c.los)}`,
  });
  const select = (v: string, opts: string[], label: string, key: string, names?: Record<string, string>) => (
    <label className={`${selectCls} flex items-center gap-2`}><span className="text-[#7C8594]">{label}</span>
      <Select value={v} onChange={(e) => setQ({ [key]: e.target.value === 'ALL' ? undefined : e.target.value, pass: undefined })} className="bg-transparent outline-none text-[#E9ECF1]">
        {opts.map((o) => <option key={o} value={o} className="bg-[#11141B]">{o === 'ALL' ? 'All' : names?.[o] ?? o}</option>)}
      </Select>
    </label>
  );

  return (
    <>
      <PageHead crumb="Plan / Contact schedule" title="Next 24 hours of contacts" sub="Windows computed from orbits, 10° minimum elevation"
        actions={<>
          {select(station, ['ALL', ...STATIONS.map((s) => s.id)], 'Station', 'station', Object.fromEntries(STATIONS.map((s) => [s.id, `${s.id} · ${s.name}`])))}
          {select(sat, ['ALL', ...FLEET.map((s) => s.sat_id)], 'Satellite', 'sat')}
          {select(state, ['ALL', 'BOOKED', 'PREDICTED', 'REQUESTED', 'SHIFTED', 'CANCELLED'], 'Booking', 'booking', LABEL)}
        </>} />

      <KpiRow>
        <KpiTile value={contacts.length} label="In view" sub="windows" />
        <KpiTile value={count('BOOKED')} label="Booked" sub="confirmed" tone="ok" />
        <KpiTile value={count('PREDICTED')} label="To book" sub="need a request" tone="action" />
        <KpiTile value={count('SHIFTED')} label="Shifted by provider" sub="check timing" tone="warn" />
      </KpiRow>

      <div className="flex flex-wrap gap-4 items-start">
        <div className="flex-[999_1_560px] min-w-0">
          <Card title="Contact windows" actions={<span className="flex flex-wrap gap-1.5">
            <Pill tone="ok">Booked</Pill><Pill tone="action">To book</Pill><Pill tone="warn">Shifted</Pill><Pill tone="neutral">Freeze 02:00–03:30</Pill></span>}>
            <div className="overflow-auto max-h-[64vh]">
              <div className="min-w-[860px] relative flex flex-col gap-1.5">
                <div className="grid grid-cols-[90px_1fr] h-[22px] items-center sticky top-0 z-10 bg-[#11141B]">
                  <span />
                  <div className="relative h-full font-mono-code text-[11px] text-[#6B7383]">
                    {Array.from({ length: 12 }, (_, k) => Math.ceil(start / 7200_000) * 7200_000 + k * 7200_000).filter((t) => t < start + SPAN).map((t) => <span key={t} className="absolute top-1" style={{ left: `${x(t)}%` }}>{hm(t).slice(0, 2)}</span>)}
                  </div>
                </div>
                {rows.map((r) => (
                  <div key={r} className="grid grid-cols-[90px_1fr] h-8 items-center">
                    <span className="font-mono-code text-[12.5px] text-[#C9CED6]">{r}</span>
                    <div className="relative h-8 rounded-lg bg-[#161A22] overflow-hidden">
                      {freezes.map(([a, b]) => <span key={a} className="absolute top-0 bottom-0 bg-[rgba(155,165,185,0.07)]" style={{ left: `${x(a)}%`, width: `${x(b) - x(a)}%` }} />)}
                      {contacts.filter((c) => c.sat === r).map((c) => {
                        const on = c.id === q.pass;
                        return (
                          <button key={c.id} type="button" onClick={() => setQ({ pass: c.id })}
                            aria-label={`${c.sat} over ${c.station} ${hm(c.aos)}, ${LABEL[c.booking]}${on ? ', selected' : ''}`} aria-pressed={on}
                            title={`${c.station} ${hm(c.aos)}–${hm(c.los)} · ${LABEL[c.booking]}`}
                            className="absolute top-2 h-4 min-w-[8px] rounded-md box-border outline-none focus-visible:ring-2 ring-white"
                            style={{ left: `${x(c.aos)}%`, width: `${x(c.los) - x(c.aos)}%`, background: PILL[c.booking].bg, border: `1.5px solid ${PILL[c.booking].b}`, opacity: c.los < now || c.booking === 'CANCELLED' ? 0.4 : 1, boxShadow: on ? '0 0 0 2px #161A22, 0 0 0 4px #F28C28' : undefined }} />
                        );
                      })}
                    </div>
                  </div>
                ))}
                {rows.length === 0 && <p className="p-6 text-[13px] text-[#7C8594]">No contacts match these filters.</p>}
                <span className="absolute top-[18px] bottom-0 w-[2px] -ml-px rounded bg-[#F28C28] pointer-events-none" style={{ left: `calc(90px + (100% - 90px) * ${(now - start) / SPAN})` }} />
                <span className="absolute top-0 -translate-x-1/2 rounded-full bg-[#F28C28] text-[#1A0E02] text-[11px] font-semibold px-[7px] py-px pointer-events-none" style={{ left: `calc(90px + (100% - 90px) * ${(now - start) / SPAN})` }}>Now</span>
              </div>
            </div>
          </Card>
        </div>

        <div className="flex-[1_1_320px] min-w-0">
          <Card title="Selected pass" actions={sel && <Pill tone={TONE[sel.booking]}>{LABEL[sel.booking]}</Pill>}>
            {!sel ? <p className="text-[13px] text-[#7C8594]">Pick a pass on the timeline to see its details and book it.</p> : (
              <div className="flex flex-col gap-3.5">
                <div className="flex flex-col gap-1">
                  <span className="text-[20px] font-semibold tracking-[-0.01em]">{sel.sat} over {st?.name}</span>
                  <span className="font-mono-code text-[13px] text-[#9AA3B2]">{utc(sel.aos, false)} – {hm(sel.los)} UTC</span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <Tile><span className="text-[26px] font-semibold">{sel.maxEl}<span className="text-[13px] text-[#7C8594]">°</span></span><span className="block text-[12px] text-[#7C8594]">max elevation</span></Tile>
                  <Tile><span className="text-[26px] font-semibold">{mins(sel.los - sel.aos)}<span className="text-[13px] text-[#7C8594] ml-1">min</span></span><span className="block text-[12px] text-[#7C8594]">duration</span></Tile>
                </div>
                <dl className="flex flex-col gap-2.5 text-[13px]">
                  <div className="flex justify-between gap-3"><dt className="text-[#9AA3B2]">Provider</dt><dd>{st?.provider} · {st?.provider === 'Akashaveda' ? 'own station' : <span className="font-mono-code">${st?.cost_per_min_usd.toFixed(2)} / min</span>}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-[#9AA3B2]">Cost</dt><dd className="font-mono-code">{st?.provider === 'Akashaveda' ? '—' : `$${((st?.cost_per_min_usd ?? 0) * mins(sel.los - sel.aos)).toFixed(0)}`}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-[#9AA3B2]">Needed for</dt><dd className="text-right">{usedBy ? `${plan.planId} downlink${usedBy.forRequest ? ` for ${usedBy.forRequest}` : ''}` : 'Not used by the current plan'}</dd></div>
                </dl>
                {st?.state === 'MAINTENANCE' && <Banner kind="warn" lead="Station in maintenance.">This pass cannot be used.</Banner>}
                {sel.booking === 'SHIFTED' && <Banner kind="warn" lead="Shifted by the provider.">Check the timing of activities planned on this pass.</Banner>}
                {st?.state !== 'MAINTENANCE' && (sel.booking === 'PREDICTED' || sel.booking === 'CANCELLED') && (
                  <Button disabled={!mayBook.allowed || sel.los < now} reason={!mayBook.allowed ? mayBook.reason : sel.los < now ? 'This pass is over.' : undefined}
                    onClick={() => { request(sel, user.name); auditBooking(sel, 'BOOKING_REQUEST'); }}>
                    <CalendarClock size={15} /> {st?.provider === 'Akashaveda' ? 'Book own station' : `Request booking from ${st?.provider}`}
                  </Button>
                )}
                {sel.booking === 'REQUESTED' && <Button variant="secondary" isLoading disabled><CalendarCheck size={15} /> Waiting for {st?.provider} to confirm</Button>}
                {(sel.booking === 'BOOKED' || sel.booking === 'SHIFTED') && sel.los > now && (
                  <Button variant="danger" disabled={!mayBook.allowed} reason={mayBook.reason} onClick={() => setConfirmCancel(true)}><Ban size={15} /> Cancel booking</Button>
                )}
                <span className="text-[12px] text-[#7C8594] leading-[1.45]">{st?.provider === 'Akashaveda' ? 'Own stations confirm at once.' : `${st?.provider} confirms or shifts a request; you see the change here.`} Mission Planners and Ground Station Engineers can book. <SampleTag>Provider answers simulated</SampleTag></span>
                {(log[sel.id] ?? []).length > 0 && (
                  <ol className="flex flex-col gap-1 text-[12.5px] text-[#9AA3B2]">
                    {log[sel.id].map((e, i) => <li key={i}><span className="font-mono-code text-[#7C8594]">{hm(e.at)}</span> {e.text}{e.by ? ` · ${e.by}` : ''}</li>)}
                  </ol>
                )}
                <div className="flex flex-col gap-1.5 pt-1 border-t border-[#1A1E27]">
                  <RoleLink to={`pass?sat=${sel.sat}`} onNavigate={onNavigate}>Live pass monitor for {sel.sat}</RoleLink>
                  <RoleLink to={`satellite?sat=${sel.sat}`} onNavigate={onNavigate}>Open {sel.sat}</RoleLink>
                  <RoleLink to="stations" onNavigate={onNavigate}>Ground stations</RoleLink>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {confirmCancel && sel && (
        <Modal title="Cancel this booking?" onClose={() => setConfirmCancel(false)}
          footer={<><Button variant="secondary" autoFocus onClick={() => setConfirmCancel(false)}>Keep booking</Button>
            <Button variant="danger" onClick={() => { cancel(sel, user.name); auditBooking(sel, 'BOOKING_CANCEL'); setConfirmCancel(false); }}>Cancel booking</Button></>}>
          <p className="text-[13.5px] text-[#C9CED6]">{sel.sat} over {st?.name}, {utc(sel.aos)}. {st?.provider === 'Akashaveda' ? 'The antenna is released.' : `${st?.provider} is asked to release it and confirms the cancellation.`}{usedBy ? ` Plan ${plan.planId} uses this pass for a downlink; re-solve the plan afterwards.` : ''}</p>
        </Modal>
      )}
    </>
  );
};
