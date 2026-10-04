/**
 * Mission-plan solver: places imaging requests on real imaging opportunities (sub-satellite point within
 * reach of the target, satellite in sunlight), books a downlink on a real contact window, and checks
 * on-board storage and battery for every satellite touched.
 *
 * ponytail: greedy by priority then age, first feasible opportunity wins. No backtracking, so it can miss
 * a placement an exact solver (CP-SAT) would find when two requests compete for one satellite. Swap in a
 * CP model behind `solve` when the request volume makes that matter.
 */
import { STATIONS } from '../data/fleet';
import type { ContactWindow } from './contacts';
import { isSunlit, State } from './orbit';
import type { ImagingRequest } from '../store/useRequestStore';

export type Kind = 'IMG' | 'DL' | 'MNT';
export interface Activity {
  id: string; sat: string; kind: Kind; start: number; end: number; label: string;
  requestId?: string; station?: string; contactId?: string;
  /** Carried over from the approved plan; the solver does not move it on its own. */
  fixed?: boolean;
  /** The downlink was added to drain this request's image. */
  forRequest?: string;
}
export type Fix =
  | { kind: 'MOVE_DL'; label: string; activityId: string; to: ContactWindow }
  | { kind: 'DROP'; label: string; requestId: string };
export interface Conflict { id: string; sat: string; at: number; title: string; detail: string; fixes: Fix[] }

export const STORAGE_GB = 64, STORAGE_CAP = 0.95, IMG_GB = 6, DL_GB_PER_MIN = 1.1;
export const SOC_MIN = 35, IMG_SOC = 5, DL_SOC = 2, SOC_PER_H = 5;
const MIN = 60_000, H = 3600_000;

export interface Resources { storageGb: (sat: string) => number; soc: (sat: string) => number }

/** Storage (% of capacity) and battery (% SOC) through the window, sampled every 5 min, plus the first breach. */
export function profile(sat: string, acts: Activity[], res: Resources, from: number, span: number) {
  const mine = acts.filter((a) => a.sat === sat);
  const out: { t: number; storage: number; soc: number }[] = [];
  let gb = res.storageGb(sat), soc = res.soc(sat);
  let breach: { t: number; what: 'STORAGE' | 'POWER' } | null = null;
  const step = 5 * MIN;
  for (let t = from; t <= from + span; t += step) {
    for (const a of mine) {
      const ov = Math.max(0, Math.min(a.end, t + step) - Math.max(a.start, t));
      if (!ov) continue;
      const frac = ov / Math.max(1, a.end - a.start);
      if (a.kind === 'IMG') { gb += IMG_GB * frac; soc -= IMG_SOC * frac; }
      if (a.kind === 'DL') {
        const st = STATIONS.find((s) => s.id === a.station);
        if (st && st.state !== 'MAINTENANCE') gb = Math.max(0, gb - DL_GB_PER_MIN * (ov / MIN));
        soc -= DL_SOC * frac;
      }
      if (a.kind === 'MNT') soc -= 2 * frac;
    }
    soc = Math.min(100, soc + SOC_PER_H * (step / H));
    const pct = (gb / STORAGE_GB) * 100;
    out.push({ t, storage: pct, soc });
    if (!breach && pct > STORAGE_CAP * 100) breach = { t, what: 'STORAGE' };
    if (!breach && soc < SOC_MIN) breach = { t, what: 'POWER' };
  }
  return { series: out, breach };
}

const R_KM = 6371;
const groundKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(a)));
};

export interface SolveInput {
  from: number; span: number; now: number;
  requests: ImagingRequest[];
  baseline: Activity[];
  satsOf: (tenant: string) => string[];
  contacts: (sat: string) => ContactWindow[];
  stateAt: (sat: string) => (ms: number) => State;
  cloud: (r: ImagingRequest) => number;
  res: Resources;
}
export interface SolveResult {
  activities: Activity[];
  placed: Record<string, { sat: string; at: number; dlStation: string; dlAt: number }>;
  unplaced: Record<string, string>;
  ms: number;
}

const PRIO = { P1: 0, P2: 1, P3: 2 } as const;
export const WEIGHT = { P1: 3, P2: 2, P3: 1 } as const;
const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }, pad = 0) => a.start < b.end + pad && b.start < a.end + pad;
const hm = (ms: number) => new Date(ms).toISOString().slice(11, 16);

/** A free contact on a working station for `sat` starting after `after` and ending before `before`. */
export function freeContact(sat: string, acts: Activity[], contacts: ContactWindow[], after: number, before: number, skipId?: string): ContactWindow | null {
  for (const c of contacts) {
    if (c.aos <= after || c.los >= before || c.id === skipId) continue;
    if (STATIONS.find((s) => s.id === c.station)?.state === 'MAINTENANCE') continue;
    const clash = acts.some((a) => a.kind === 'DL' && a.id !== skipId && (a.station === c.station || a.sat === sat) && overlaps(a, { start: c.aos, end: c.los }, MIN));
    if (!clash) return c;
  }
  return null;
}

export function solve(inp: SolveInput): SolveResult {
  const t0 = performance.now();
  const acts: Activity[] = [...inp.baseline];
  const placed: SolveResult['placed'] = {};
  const unplaced: SolveResult['unplaced'] = {};
  const end = inp.from + inp.span;
  const start = Math.max(inp.from, inp.now);
  const queue = [...inp.requests].sort((a, b) => PRIO[a.priority] - PRIO[b.priority] || a.createdAt - b.createdAt);

  for (const r of queue) {
    const cloud = inp.cloud(r);
    if (cloud > r.maxCloudPct) { unplaced[r.id] = `Cloud forecast ${cloud} % is above the request maximum of ${r.maxCloudPct} %`; continue; }
    const deadline = Math.min(end, r.createdAt + r.windowH * H);
    if (deadline <= start) { unplaced[r.id] = `Acquisition window closed at ${hm(r.createdAt + r.windowH * H)} UTC`; continue; }
    const sats = inp.satsOf(r.tenant);
    if (!sats.length) { unplaced[r.id] = `${r.tenant} has no satellites in this plan`; continue; }

    // Imaging opportunities: one per satellite pass over the target, at closest approach.
    const opps: { sat: string; t: number; lit: boolean }[] = [];
    for (const sat of sats) {
      const at = inp.stateAt(sat);
      let best: { t: number; d: number; lit: boolean } | null = null;
      for (let t = start; t <= deadline; t += MIN) {
        const s = at(t);
        const reach = Math.max(150, s.altKm * Math.tan((45 * Math.PI) / 180)); // agile platform, up to 45° off-nadir
        const d = groundKm(s.lat, s.lon, r.lat, r.lon);
        if (d <= reach) { if (!best || d < best.d) best = { t, d, lit: isSunlit(s, t) }; }
        else if (best) { opps.push({ sat, t: best.t, lit: best.lit }); best = null; }
      }
      if (best) opps.push({ sat, t: best.t, lit: best.lit });
    }
    if (!opps.length) { unplaced[r.id] = `No pass over the target before ${hm(deadline)} UTC`; continue; }
    const lit = opps.filter((o) => o.lit).sort((a, b) => a.t - b.t);
    if (!lit.length) { unplaced[r.id] = 'No daylight pass over the target in the window'; continue; }

    const why = { busy: 0, dl: 0, storage: 0, power: 0 };
    let done = false;
    for (const o of lit) {
      const img: Activity = { id: `IMG-${r.id}`, sat: o.sat, kind: 'IMG', start: o.t - MIN, end: o.t + MIN, label: r.id, requestId: r.id };
      if (acts.some((a) => a.sat === o.sat && overlaps(a, img, 3 * MIN))) { why.busy++; continue; }
      const contacts = inp.contacts(o.sat);
      const existing = acts.find((a) => a.sat === o.sat && a.kind === 'DL' && a.start > img.end && STATIONS.find((s) => s.id === a.station)?.state !== 'MAINTENANCE');
      const c = existing ? null : freeContact(o.sat, acts, contacts, img.end + 5 * MIN, end);
      if (!existing && !c) { why.dl++; continue; }
      const dl: Activity | null = c ? { id: `DL-${r.id}`, sat: o.sat, kind: 'DL', start: c.aos, end: c.los, label: c.station, station: c.station, contactId: c.id, forRequest: r.id } : null;
      const trial = [...acts, img, ...(dl ? [dl] : [])];
      const p = profile(o.sat, trial, inp.res, inp.from, inp.span);
      if (p.breach) { why[p.breach.what === 'STORAGE' ? 'storage' : 'power']++; continue; }
      acts.push(img, ...(dl ? [dl] : []));
      const d = dl ?? existing!;
      placed[r.id] = { sat: o.sat, at: o.t, dlStation: d.station!, dlAt: d.start };
      done = true;
      break;
    }
    if (!done) {
      unplaced[r.id] = why.storage ? 'Storage would pass 95 % on every satellite that sees the target'
        : why.power ? `Battery would fall below ${SOC_MIN} % on every satellite that sees the target`
        : why.dl ? 'No free downlink contact after the image before the window ends'
        : 'Every satellite that sees the target is busy then';
    }
  }
  return { activities: acts, placed, unplaced, ms: performance.now() - t0 };
}

/** Storage and power conflicts left in a plan, each with fixes that actually change it. */
export function conflicts(acts: Activity[], res: Resources, from: number, span: number, contacts: (sat: string) => ContactWindow[]): Conflict[] {
  const out: Conflict[] = [];
  for (const sat of [...new Set(acts.map((a) => a.sat))]) {
    const p = profile(sat, acts, res, from, span);
    if (!p.breach) continue;
    const t = p.breach.t;
    const dead = acts.find((a) => a.sat === sat && a.kind === 'DL' && a.start < t && STATIONS.find((s) => s.id === a.station)?.state === 'MAINTENANCE');
    const fixes: Fix[] = [];
    if (dead) {
      const firstImg = acts.filter((a) => a.sat === sat && a.kind === 'IMG').sort((a, b) => a.start - b.start)[0];
      const alt = freeContact(sat, acts, contacts(sat), firstImg ? firstImg.end : from, t, dead.id);
      if (alt) fixes.push({ kind: 'MOVE_DL', label: `Move downlink to ${alt.station} ${hm(alt.aos)}`, activityId: dead.id, to: alt });
    }
    const imgs = acts.filter((a) => a.sat === sat && a.kind === 'IMG' && a.requestId && a.start <= t).sort((a, b) => b.start - a.start);
    for (const i of imgs.slice(0, 2)) fixes.push({ kind: 'DROP', label: `Drop ${i.requestId}`, requestId: i.requestId! });
    const pt = p.series.find((s) => s.t === t)!;
    out.push({
      id: `${sat}-${t}`, sat, at: t,
      title: p.breach.what === 'STORAGE' ? `${sat} storage reaches ${Math.min(100, Math.round(pt.storage))} % at ${hm(t)}` : `${sat} battery falls to ${Math.round(pt.soc)} % at ${hm(t)}`,
      detail: dead ? `The ${dead.station} downlink it needs at ${hm(dead.start)} is in maintenance.` : p.breach.what === 'STORAGE' ? 'No downlink drains it in time.' : `Minimum is ${SOC_MIN} %.`,
      fixes,
    });
  }
  return out;
}
