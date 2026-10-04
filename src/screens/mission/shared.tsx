import React, { useCallback, useEffect, useState } from 'react';
import { canOpenRoute, whoCanOpen } from '../../auth/policy';
import { parseHash, toHash } from '../../router/routes';
import { useAuthStore } from '../../store/useAuthStore';
import { Button } from '../../components/atoms/Button';
import { PLACES } from '../../orbit/places';
import { Priority, useRequestStore } from '../../store/useRequestStore';
import { toast } from '../../store/useToastStore';
import { Select } from '../../components/molecules/Select';
import { Combobox } from '../../components/molecules/Combobox';

/** Hash query params for the current screen, kept in sync both ways (replaceState: no history spam). */
export function useHashParams(): [Record<string, string>, (patch: Record<string, string | undefined>) => void] {
  const [p, setP] = useState(() => parseHash().params);
  useEffect(() => {
    const f = () => setP(parseHash().params);
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  const set = useCallback((patch: Record<string, string | undefined>) => {
    const { route, params } = parseHash();
    const next: Record<string, string> = { ...params };
    for (const [k, v] of Object.entries(patch)) { if (v === undefined || v === '') delete next[k]; else next[k] = v; }
    window.history.replaceState(null, '', toHash(route, next));
    setP(next);
  }, []);
  return [p, set];
}

/** A link only for roles that can open the target; otherwise "Handled by …" (never a dead end). */
export const RoleLink: React.FC<{ to: string; onNavigate: (to: string) => void; children: React.ReactNode }> = ({ to, onNavigate, children }) => {
  const role = useAuthStore((s) => s.activeRole);
  if (canOpenRoute(to, role)) {
    return <button type="button" onClick={() => onNavigate(to.startsWith('#') ? to : `#/${to}`)} className="text-[13px] text-[#F2A65A] hover:text-[#FFC48A] text-left">{children}</button>;
  }
  return <span className="text-[12.5px] text-[#7C8594]">{children}: handled by {whoCanOpen(to)}</span>;
};

/** "14:05" today, "3 Oct 14:05" otherwise (UTC). */
export function utc(ms: number, withZone = true) {
  const d = new Date(ms), n = new Date();
  const hm = d.toISOString().slice(11, 16);
  const same = d.toISOString().slice(0, 10) === n.toISOString().slice(0, 10);
  return `${same ? '' : `${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })} `}${hm}${withZone ? ' UTC' : ''}`;
}
export const hm = (ms: number) => new Date(ms).toISOString().slice(11, 16);
export const mins = (ms: number) => Math.max(1, Math.round(ms / 60000));

export const inputCls = 'h-10 rounded-[10px] bg-[#161A22] border border-[#232936] px-3 text-[14px] text-[#E9ECF1] outline-none focus:border-[#6CB8FF] min-w-0';
export const selectCls = 'h-[38px] rounded-[10px] bg-[#11141B] border border-[#1A1E27] px-3 text-[13px] text-[#E9ECF1]';

/* ---------- imaging request form: the customer portal and the mission plan raise requests the same way ---------- */

/** Named areas customers ask for most, plus the globe's reference places. */
export const AREAS = [
  { name: 'Ludhiana wheat belt', lat: 30.9, lon: 75.85 }, { name: 'Kaveri delta', lat: 10.9, lon: 79.4 }, { name: 'Punjab canal network', lat: 30.7, lon: 76.2 },
  { name: 'Sundarbans', lat: 21.95, lon: 89.18 }, { name: 'Rann of Kutch', lat: 23.73, lon: 69.86 }, { name: 'Godavari basin', lat: 17.0, lon: 81.8 },
  { name: 'Chilika lake', lat: 19.72, lon: 85.32 }, { name: 'Brahmaputra basin', lat: 26.2, lon: 91.7 },
  ...PLACES.map((p) => ({ name: p.name, lat: p.lat, lon: p.lon })),
];

export const ImagingRequestForm: React.FC<{ tenant: string; requestedBy: string; blocked?: string; withPriority?: boolean; onDone?: (id: string) => void }> = ({ tenant, requestedBy, blocked, withPriority, onDone }) => {
  const submit = useRequestStore((s) => s.submit);
  const [area, setArea] = useState('');
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [windowH, setWindowH] = useState(48);
  const [cloud, setCloud] = useState(30);
  const [priority, setPriority] = useState<Priority>('P2');
  const la = Number(lat), lo = Number(lon);
  const err = !area.trim() ? 'Name the area.' : lat === '' || lon === '' ? 'Pick a known area or enter latitude and longitude.'
    : !(la >= -90 && la <= 90) ? 'Latitude is between -90 and 90.' : !(lo >= -180 && lo <= 180) ? 'Longitude is between -180 and 180.' : '';
  const onArea = (v: string) => {
    setArea(v);
    const hit = AREAS.find((a) => a.name.toLowerCase() === v.trim().toLowerCase());
    if (hit) { setLat(String(hit.lat)); setLon(String(hit.lon)); }
  };
  const go = (e: React.FormEvent) => {
    e.preventDefault();
    if (err || blocked) return;
    const id = submit({ tenant, requestedBy, target: area.trim(), lat: la, lon: lo, priority, windowH, maxCloudPct: cloud });
    toast.success(`Request ${id} sent`, { body: 'It is in the mission plan queue; the planner places it at the next solve.' });
    setArea(''); setLat(''); setLon('');
    onDone?.(id);
  };
  const lbl = 'flex flex-col gap-1.5 text-[12px] text-[#7C8594]';
  return (
    <form onSubmit={go} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3 items-end">
        <label className={`${lbl} flex-[1_1_240px]`}>Area of interest
          <Combobox value={area} onChange={onArea} options={AREAS.map((a) => a.name)} placeholder="Name, or pick from the list" className={inputCls} aria-label="Area of interest" />
        </label>
        <label className={`${lbl} w-[110px]`}>Latitude<input inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} className={`${inputCls} font-mono-code`} /></label>
        <label className={`${lbl} w-[110px]`}>Longitude<input inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} className={`${inputCls} font-mono-code`} /></label>
      </div>
      <div className="flex flex-wrap gap-3 items-end">
        <label className={`${lbl} w-[150px]`}>Window<Select value={windowH} onChange={(e) => setWindowH(+e.target.value)} className={inputCls}><option value={24}>Next 24 h</option><option value={48}>Next 48 h</option><option value={72}>Next 72 h</option></Select></label>
        <label className={`${lbl} w-[150px]`}>Max cloud<Select value={cloud} onChange={(e) => setCloud(+e.target.value)} className={inputCls}>{[10, 20, 30, 40, 60].map((c) => <option key={c} value={c}>{c} %</option>)}</Select></label>
        {withPriority && <label className={`${lbl} w-[110px]`}>Priority<Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className={inputCls}><option>P1</option><option>P2</option><option>P3</option></Select></label>}
        <Button type="submit" disabled={!!err || !!blocked} reason={blocked ?? (area ? err : undefined)}>Request imagery</Button>
      </div>
    </form>
  );
};
