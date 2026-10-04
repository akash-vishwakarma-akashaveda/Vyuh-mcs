import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Satellite } from '../../types';
import { STATIONS } from '../../data/fleet';
import { passes } from '../../orbit/orbit';
import { satElements } from '../../orbit/fleetOrbit';
import { stationColor } from '../../ops/colors';
import { completion, plannedOnContact } from '../../ops/satOps';

const PAST = 2 * 3600_000, FUTURE = 10 * 3600_000;
const hm = (ms: number) => new Date(ms).toISOString().slice(11, 16);
const mins = (ms: number) => { const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`; };
const ITEM_TONE = { DONE: 'text-[#4ADE9A]', RUNNING: 'text-[#6CB8FF]', PLANNED: 'text-[#9AA3B2]', SKIPPED: 'text-[#6B7383]' } as const;

interface Contact { id: string; station: string; name: string; aos: number; los: number; maxEl: number }

/** Collapsible time bar of every contact (2 h back, 10 h ahead). Hover a segment for AOS / LOS and what is planned on it. */
export const ContactTimeline: React.FC<{ sat: Satellite }> = ({ sat }) => {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<Contact | null>(null);
  const minute = Math.floor(Date.now() / 60_000);
  const now = Date.now();

  const contacts = useMemo<Contact[]>(() => {
    const el = satElements(sat);
    const t = Date.now();
    return sat.assigned_ground_stations.flatMap((id) => {
      const st = STATIONS.find((s) => s.id === id);
      if (!st) return [];
      return passes(el, st, t - PAST, PAST + FUTURE, 10, 60_000).map((p, n) => ({ id: `${sat.sat_id}-${id}-${n}-${p.aos}`, station: id, name: st.name, aos: p.aos, los: p.los, maxEl: Math.round(p.maxElevationDeg) }));
    }).sort((a, b) => a.aos - b.aos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sat.sat_id, minute]);

  const plans = useMemo(() => new Map(contacts.map((c) => [c.id, plannedOnContact(sat.sat_id, c.id, c.aos, c.los, now)])), [contacts, sat.sat_id, minute]); // eslint-disable-line react-hooks/exhaustive-deps
  const allItems = [...plans.values()].flat();
  const pct = completion(allItems);
  const next = contacts.find((c) => c.los > now);
  const inContact = next && next.aos <= now;

  const start = now - PAST, span = PAST + FUTURE;
  const x = (t: number) => `${Math.min(100, Math.max(0, ((t - start) / span) * 100))}%`;

  return (
    <div className="rounded-2xl border border-[#1A1E27] bg-[#11141B]">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left text-[12.5px]">
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <span className="text-[14px] font-medium">Contact timeline</span>
        <span className="text-[#9AA3B2]">
          {next ? (inContact ? `In contact with ${next.station} · LOS in ${mins(next.los - now)}` : `Next ${next.station} at ${hm(next.aos)} UTC · in ${mins(next.aos - now)}`) : 'No contact in the next 10 h'}
        </span>
        <span className="ml-auto flex items-center gap-2 text-[#9AA3B2]">
          Procedures completed <b className="text-[#E9ECF1] tabular-nums">{pct}%</b>
          <span className="w-16 h-1.5 rounded-full bg-[#1A1E27] overflow-hidden"><span className="block h-full bg-[#6CB8FF]" style={{ width: `${pct}%` }} /></span>
        </span>
      </button>

      {open && (
        <div className="px-3.5 pb-3.5 flex flex-col gap-3">
          <div className="relative h-14 rounded-md bg-[#090B10] border border-[#1A1E27]">
            {[-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((h) => (
              <span key={h} className="absolute top-0 bottom-0 border-l border-[#161A22]" style={{ left: x(now + h * 3600_000) }}>
                <span className="absolute -bottom-4 -translate-x-1/2 text-[10px] text-[#6B7383] tabular-nums">{hm(now + h * 3600_000)}</span>
              </span>
            ))}
            {contacts.map((c) => (
              <button key={c.id} onMouseEnter={() => setHover(c)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(c)} onBlur={() => setHover(null)}
                aria-label={`${c.station} ${hm(c.aos)} to ${hm(c.los)}`}
                className="absolute top-2 bottom-2 rounded-[4px] min-w-[4px] outline-none focus-visible:ring-2 ring-white"
                style={{ left: x(c.aos), width: `calc(${x(c.los)} - ${x(c.aos)})`, background: stationColor(c.station), opacity: c.los < now ? 0.45 : 1 }} />
            ))}
            <span className="absolute top-0 bottom-0 w-px bg-[#E9ECF1]" style={{ left: x(now) }}><span className="absolute -top-4 -translate-x-1/2 text-[10px] font-bold text-[#E9ECF1]">now</span></span>

            {hover && (
              <div className="absolute z-20 -top-2 -translate-y-full rounded-lg border border-[#232936] bg-[#11141B] shadow-xl px-3 py-2 text-[11.5px] w-[250px]" style={{ left: `clamp(0px, calc(${x(hover.aos)}), calc(100% - 250px))` }}>
                <div className="flex items-center gap-2 font-semibold"><i className="w-2.5 h-2.5 rounded-full" style={{ background: stationColor(hover.station) }} />{hover.station} · {hover.name}</div>
                <div className="text-[#9AA3B2] mt-1">AOS <b className="text-[#E9ECF1] font-mono-code">{hm(hover.aos)}</b> · LOS <b className="text-[#E9ECF1] font-mono-code">{hm(hover.los)}</b> UTC</div>
                <div className="text-[#9AA3B2]">{mins(hover.los - hover.aos)} · max elevation {hover.maxEl}°</div>
                <ul className="mt-1.5 flex flex-col gap-0.5">
                  {(plans.get(hover.id) ?? []).map((i) => <li key={i.id} className={ITEM_TONE[i.state]}>{i.kind === 'PROCEDURE' ? 'Proc' : i.kind === 'DUMP' ? 'Dump' : 'Cmd'} · {i.name} <span className="text-[#6B7383]">({i.state.toLowerCase()})</span></li>)}
                </ul>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-3 text-[11.5px] text-[#9AA3B2]">
            {sat.assigned_ground_stations.map((id) => <span key={id} className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: stationColor(id) }} />{id}</span>)}
            <span className="ml-auto">{contacts.length} contacts · {allItems.length} planned items</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead><tr className="text-left text-[11px] text-[#7C8594]"><th className="py-1 pr-3">Station</th><th className="pr-3">AOS</th><th className="pr-3">LOS</th><th className="pr-3">Max el</th><th className="pr-3">Planned procedures and commands</th><th>Done</th></tr></thead>
              <tbody>
                {contacts.map((c) => {
                  const items = plans.get(c.id) ?? [];
                  return (
                    <tr key={c.id} className="border-t border-[#161A22] align-top">
                      <td className="py-1.5 pr-3 whitespace-nowrap"><i className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: stationColor(c.station) }} />{c.station}</td>
                      <td className="pr-3 font-mono-code">{hm(c.aos)}</td><td className="pr-3 font-mono-code">{hm(c.los)}</td><td className="pr-3">{c.maxEl}°</td>
                      <td className="pr-3">{items.map((i) => <span key={i.id} className={`block ${ITEM_TONE[i.state]}`}>{i.name} <span className="text-[#6B7383]">· {i.state.toLowerCase()}</span></span>)}</td>
                      <td className="tabular-nums">{completion(items)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
