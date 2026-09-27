import React, { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { Ban, CalendarCheck, CalendarClock } from 'lucide-react';
import { Button } from '../../components/atoms/Button';
import { Banner, Card, Drawer, KpiTile, PageHead } from '../../components/molecules/Page';
import { FLEET, STATIONS } from '../../data/fleet';
import { passes } from '../../orbit/orbit';
import { satElements } from '../../orbit/fleetOrbit';
import { stationColor } from '../../ops/colors';
import { seeded } from '../../ops/history';
import { can } from '../../auth/policy';
import { useAuthStore } from '../../store/useAuthStore';
import { usePersisted } from '../../lib/usePersisted';
import { toast } from '../../store/useToastStore';

type Booking = 'PREDICTED' | 'REQUESTED' | 'BOOKED' | 'CANCELLED' | 'SHIFTED';
interface Contact { id: string; sat: string; station: string; aos: number; los: number; maxEl: number; booking: Booking; shiftedMin: number; cost: number }

const SPAN = 24 * 3600_000, PAST = 1 * 3600_000;
const FREEZE = { from: 2, to: 3.5, why: 'Daily deploy freeze: no dictionary or procedure releases' }; // UTC hours
const hm = (ms: number) => new Date(ms).toISOString().slice(11, 16);
const mins = (ms: number) => Math.max(1, Math.round(ms / 60000));
const TONE: Record<Booking, string> = { BOOKED: 'text-[#56F000]', REQUESTED: 'text-[#9C9AEC]', PREDICTED: 'text-[#A3B1C2]', SHIFTED: 'text-[#FCE83A]', CANCELLED: 'text-[#8496AB] line-through' };
const LABEL: Record<Booking, string> = { BOOKED: 'Booked', REQUESTED: 'Requested', PREDICTED: 'Predicted', SHIFTED: 'Shifted', CANCELLED: 'Cancelled' };

/** S09 · Contact schedule: 24 h of predicted passes for the fleet, by satellite, with booking state. */
export const ContactSchedule: React.FC<{ onNavigate: (path: string) => void }> = ({ onNavigate }) => {
  const role = useAuthStore((s) => s.activeRole);
  const mayBook = can('booking:edit', role);
  const [override, setOverride] = usePersisted<Record<string, Booking>>('mcs.bookings', {});
  const [station, setStation] = useState('ALL');
  const [sat, setSat] = useState('ALL');
  const [state, setState] = useState<'ALL' | Booking>('ALL');
  const [open, setOpen] = useState<string | null>(null);
  const bucket = Math.floor(Date.now() / 600_000);

  const base = useMemo<Contact[]>(() => {
    const t = Date.now() - PAST;
    return FLEET.flatMap((s) => {
      const el = satElements(s);
      return s.assigned_ground_stations.flatMap((id) => {
        const st = STATIONS.find((x) => x.id === id);
        if (!st) return [];
        return passes(el, st, t, SPAN, 10, 60_000).map((p) => {
          const key = `${s.sat_id}-${id}-${Math.round(p.aos / 300_000)}`;
          const r = seeded(key)();
          const own = st.provider === 'Akashaveda';
          const booking: Booking = st.state === 'MAINTENANCE' ? 'CANCELLED' : own || r < 0.55 ? 'BOOKED' : r < 0.75 ? 'REQUESTED' : r < 0.9 ? 'PREDICTED' : 'SHIFTED';
          return { id: key, sat: s.sat_id, station: id, aos: p.aos, los: p.los, maxEl: Math.round(p.maxElevationDeg), booking, shiftedMin: booking === 'SHIFTED' ? 2 + Math.round(r * 30) % 6 : 0, cost: st.provider === 'Akashaveda' ? 0 : mins(p.los - p.aos) * st.cost_per_min_usd };
        });
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucket]);

  const contacts = base.map((c) => ({ ...c, booking: override[c.id] ?? c.booking })).filter((c) => (station === 'ALL' || c.station === station) && (sat === 'ALL' || c.sat === sat) && (state === 'ALL' || c.booking === state));
  const rows = [...new Set(contacts.map((c) => c.sat))].sort();
  const now = Date.now(), start = now - PAST;
  const x = (t: number) => `${Math.min(100, Math.max(0, ((t - start) / SPAN) * 100))}%`;
  const sel = base.map((c) => ({ ...c, booking: override[c.id] ?? c.booking })).find((c) => c.id === open);
  const count = (b: Booking) => contacts.filter((c) => c.booking === b).length;

  // freeze bands: the UTC hours in view
  const freezes: [number, number][] = [];
  for (let d = -1; d <= 1; d++) {
    const day = new Date(now); day.setUTCHours(0, 0, 0, 0);
    const a = day.getTime() + d * 86400_000 + FREEZE.from * 3600_000, b = day.getTime() + d * 86400_000 + FREEZE.to * 3600_000;
    if (b > start && a < start + SPAN) freezes.push([a, b]);
  }

  const set = (c: Contact, b: Booking, msg: string) => { setOverride({ ...override, [c.id]: b }); toast.info(msg, { body: `${c.sat} · ${c.station} · ${hm(c.aos)} UTC` }); };

  return (
    <>
      <PageHead title="Contact schedule" sub="Predicted and booked passes for every satellite and station over the next 24 hours" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KpiTile value={contacts.length} label="Contacts in view" />
        <KpiTile value={count('BOOKED')} label="Booked" tone="ok" />
        <KpiTile value={count('REQUESTED') + count('PREDICTED')} label="Awaiting booking" tone="pending" />
        <KpiTile value={count('SHIFTED')} label="Shifted by provider" tone="warn" />
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-3 text-[12.5px]">
        {([['Satellite', sat, setSat, ['ALL', ...FLEET.map((s) => s.sat_id)]], ['Station', station, setStation, ['ALL', ...STATIONS.map((s) => s.id)]], ['Booking', state, setState as (v: string) => void, ['ALL', 'BOOKED', 'REQUESTED', 'PREDICTED', 'SHIFTED', 'CANCELLED']]] as const).map(([l, v, fn, opts]) => (
          <label key={l} className="flex items-center gap-2 text-[#A3B1C2]">{l}
            <select value={v} onChange={(e) => (fn as (v: string) => void)(e.target.value)} className="h-8 rounded-md bg-[#111A25] border border-[#2A3B52] px-2 text-[#E6EDF3]">{opts.map((o) => <option key={o}>{o}</option>)}</select>
          </label>
        ))}
        <span className="ml-auto flex flex-wrap gap-3 text-[#A3B1C2]">{STATIONS.map((s) => <span key={s.id} className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: stationColor(s.id) }} />{s.id} <span className="text-[#5F7087]">{s.provider}</span></span>)}</span>
      </div>

      <Card>
        <div className="-m-4 overflow-auto max-h-[62vh]">
          <div className="min-w-[900px] relative">
            <div className="sticky top-0 z-10 flex bg-[#111A25] border-b border-[#213044] h-7 text-[10px] text-[#5F7087] tabular-nums">
              <div className="w-20 shrink-0" />
              <div className="relative flex-1">{Array.from({ length: 13 }, (_, k) => now - PAST + k * 2 * 3600_000).map((t) => <span key={t} className="absolute top-2 -translate-x-1/2" style={{ left: x(t) }}>{hm(t)}</span>)}</div>
            </div>
            {rows.map((r) => (
              <div key={r} className="flex items-center h-[26px] border-b border-[#1A2738]">
                <span className="w-20 shrink-0 pl-3 font-mono-code text-[11.5px] text-[#A3B1C2]">{r}</span>
                <div className="relative flex-1 h-full">
                  {freezes.map(([a, b]) => <span key={a} className="absolute top-0 bottom-0 bg-[#FCE83A]/10" style={{ left: x(a), width: `calc(${x(b)} - ${x(a)})` }} />)}
                  {contacts.filter((c) => c.sat === r).map((c) => (
                    <button key={c.id} onClick={() => setOpen(c.id)} title={`${c.station} ${hm(c.aos)}–${hm(c.los)} · ${LABEL[c.booking]}`} aria-label={`${r} ${c.station} ${hm(c.aos)} ${LABEL[c.booking]}`}
                      className={clsx('absolute top-[5px] bottom-[5px] min-w-[5px] rounded-[3px] outline-none focus-visible:ring-2 ring-white', c.los < now && 'opacity-40', c.booking === 'CANCELLED' && 'opacity-30')}
                      style={{ left: x(c.aos), width: `calc(${x(c.los)} - ${x(c.aos)})`, background: c.booking === 'PREDICTED' || c.booking === 'REQUESTED' ? `repeating-linear-gradient(135deg, ${stationColor(c.station)} 0 3px, transparent 3px 6px)` : stationColor(c.station), boxShadow: c.booking === 'SHIFTED' ? 'inset 0 0 0 2px #FCE83A' : c.booking === 'REQUESTED' ? `inset 0 0 0 1px ${stationColor(c.station)}` : undefined }} />
                  ))}
                </div>
              </div>
            ))}
            {rows.length === 0 && <p className="p-6 text-[13px] text-[#8496AB]">No contacts match these filters.</p>}
            <span className="absolute top-7 bottom-0 w-px bg-[#E6EDF3] pointer-events-none" style={{ left: `calc(5rem + (100% - 5rem) * ${(now - start) / SPAN})` }}><span className="absolute -top-4 -translate-x-1/2 text-[10px] font-bold text-[#E6EDF3]">now</span></span>
          </div>
        </div>
      </Card>
      <p className="text-[11.5px] text-[#8496AB] mt-2">Solid = booked · hatched = predicted or requested · amber outline = shifted by the provider · faint = past or cancelled · amber band = daily deploy freeze ({String(FREEZE.from).padStart(2, '0')}:00–03:30 UTC).</p>

      {sel && (
        <Drawer title={`${sel.sat} · ${sel.station}`} onClose={() => setOpen(null)}
          footer={<>
            <Button variant="secondary" onClick={() => onNavigate(`/satellites/${sel.sat}`)}>Open {sel.sat}</Button>
            {sel.booking === 'PREDICTED' && <Button disabled={!mayBook.allowed} title={mayBook.reason} onClick={() => set(sel, 'REQUESTED', 'Booking requested')}><CalendarClock size={15} /> Request booking</Button>}
            {sel.booking === 'REQUESTED' && <Button disabled={!mayBook.allowed} title={mayBook.reason} onClick={() => set(sel, 'BOOKED', 'Booking confirmed')}><CalendarCheck size={15} /> Confirm booking</Button>}
            {(sel.booking === 'BOOKED' || sel.booking === 'REQUESTED' || sel.booking === 'SHIFTED') && <Button variant="danger" disabled={!mayBook.allowed} title={mayBook.reason} onClick={() => set(sel, 'CANCELLED', 'Booking cancelled')}><Ban size={15} /> Cancel</Button>}
          </>}>
          <div className={clsx('text-[13px] font-bold', TONE[sel.booking])}>{LABEL[sel.booking]}</div>
          {sel.booking === 'SHIFTED' && <Banner kind="warn" lead="Moved by the provider.">The window now starts {sel.shiftedMin} min later than predicted. Procedures planned for it are re-checked against the new times.</Banner>}
          {STATIONS.find((s) => s.id === sel.station)?.state === 'MAINTENANCE' && <Banner kind="warn" lead="Station in maintenance.">This pass cannot be used.</Banner>}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
            {[['AOS', `${hm(sel.aos)} UTC`], ['LOS', `${hm(sel.los)} UTC`], ['Duration', `${mins(sel.los - sel.aos)} min`], ['Max elevation', `${sel.maxEl}°`], ['Provider', STATIONS.find((s) => s.id === sel.station)?.provider ?? ''], ['Cost', sel.cost ? `$${sel.cost.toFixed(0)}` : 'Own station']].map(([k, v]) => (
              <div key={k}><dt className="text-[11.5px] text-[#8496AB]">{k}</dt><dd className="font-mono-code">{v}</dd></div>
            ))}
          </dl>
          {!mayBook.allowed && <p className="text-[12px] text-[#8496AB]">{mayBook.reason}</p>}
        </Drawer>
      )}
    </>
  );
};
