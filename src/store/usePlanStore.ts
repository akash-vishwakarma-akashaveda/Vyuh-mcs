import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { demoKey, demoStorage } from '../demo/persist';
import { FLEET, STATIONS, tenantOf } from '../data/fleet';
import { seeded } from '../ops/history';
import { satContacts, ContactWindow } from '../orbit/contacts';
import { Activity, conflicts, Conflict, Fix, profile, Resources, solve, WEIGHT } from '../orbit/planSolver';
import { stateFn } from './useOrbitStore';
import { isSunlit } from '../orbit/orbit';
import { cloudForecast, isOpen, useRequestStore } from './useRequestStore';
import { useFleetStore } from './useFleetStore';
import { useMissionStore } from './useMissionStore';
import { useDeliveryStore } from './useDeliveryStore';
import { useBookingStore, bookingOf } from './useBookingStore';

/**
 * The mission plan: Draft → Solved → Sent for approval → Approved (by a Flight Director, in Approvals)
 * → Uplinked as a PUS-11 time-based schedule. Request states are written from the solver result only.
 */
export type PlanStage = 'DRAFT' | 'SOLVED' | 'PENDING_APPROVAL' | 'UPLINKED';
export interface SolveSummary { at: number; by: string; ms: number; placed: number; total: number; score: number; unplaced: Record<string, string>; ids: string[] }
export interface Pus11 { at: number; by: string; total: number; perSat: { sat: string; tcs: number; first: number; last: number }[]; crc: string; sessions: string[] }

interface PlanStore {
  planId: string;
  seq: number;
  from: number;
  span: number;
  stage: PlanStage;
  activities: Activity[];
  solved?: SolveSummary;
  conflicts: Conflict[];
  approvalId?: string;
  pus11?: Pus11;
  log: { at: number; by: string; text: string }[];
  init: (force?: boolean) => void;
  solve: (by: string) => void;
  applyFix: (f: Fix, by: string) => void;
  sendForApproval: (by: string) => string;
  uplink: (by: string) => void;
}

const H = 3600_000, MIN = 60_000;
export const PLAN_SPAN = 12 * H;
const SGP_SAT_STORAGE = 51.2; // GB: the satellite whose approved downlink is on the station now in maintenance

let scenarioSat: string | null = null;
export const resources: Resources = {
  storageGb: (sat) => (sat === scenarioSat ? SGP_SAT_STORAGE : Math.round((12 + seeded(`store:${sat}`)() * 20) * 10) / 10),
  soc: (sat) => Math.round(useFleetStore.getState().cvt[sat]?.BAT_SOC?.eu_value ?? 70 + seeded(`soc:${sat}`)() * 25),
};

const contactsOf = (from: number) => (sat: string) => satContacts(sat, from, PLAN_SPAN);
const working = (c: ContactWindow) => STATIONS.find((s) => s.id === c.station)?.state !== 'MAINTENANCE';

/** Activities carried over from the last approved plan: a few downlinks and maintenance blocks, and the AKV satellite whose downlink sits on SGP. */
function baseline(from: number): Activity[] {
  const out: Activity[] = [];
  const cs = contactsOf(from);
  scenarioSat = null;
  for (const s of FLEET.filter((f) => f.sat_id.startsWith('AKV'))) {
    const list = cs(s.sat_id);
    const sgp = list.find((c) => c.station === 'SGP' && c.aos > from + 2 * H && c.los < from + PLAN_SPAN - 2 * H);
    if (!sgp) continue;
    const alt = list.find((c) => working(c) && Math.abs(c.aos - sgp.aos) < 3 * H && c.aos > from + 90 * MIN && c.los < from + PLAN_SPAN - 2 * H);
    if (!alt) continue;
    const t1 = Math.min(sgp.aos, alt.aos) - 50 * MIN, t3 = Math.max(sgp.los, alt.los) + 30 * MIN;
    scenarioSat = s.sat_id;
    out.push(
      { id: 'IMG-TR-5539', sat: s.sat_id, kind: 'IMG', start: t1, end: t1 + 2 * MIN, label: 'TR-5539', requestId: 'TR-5539', fixed: true },
      { id: `DL-BASE-${s.sat_id}`, sat: s.sat_id, kind: 'DL', start: sgp.aos, end: sgp.los, label: 'SGP', station: 'SGP', contactId: sgp.id, fixed: true },
      { id: 'IMG-OPS-CAL', sat: s.sat_id, kind: 'IMG', start: t3, end: t3 + 2 * MIN, label: 'Calibration', fixed: true },
    );
    useRequestStore.getState().update('TR-5539', { placement: { sat: s.sat_id, at: t1, dlStation: 'SGP', dlAt: sgp.aos } });
    break;
  }
  for (const id of ['AKV-01', 'AKV-02', 'AKV-05', 'NBH-01', 'NBH-02']) {
    if (id === scenarioSat) continue;
    const c = cs(id).find((x) => working(x) && x.aos > from + H);
    if (c) out.push({ id: `DL-BASE-${id}`, sat: id, kind: 'DL', start: c.aos, end: c.los, label: c.station, station: c.station, contactId: c.id, fixed: true });
  }
  out.push({ id: 'MNT-AKV-02', sat: 'AKV-02', kind: 'MNT', start: from + 8.5 * H, end: from + 9 * H, label: 'RW desat', fixed: true });
  out.push({ id: 'MNT-AKV-06', sat: 'AKV-06', kind: 'MNT', start: from + 10 * H, end: from + 10.8 * H, label: 'Time sync', fixed: true });
  return out;
}

const satsOf = (tenant: string) => FLEET.filter((s) => tenantOf(s.sat_id) === tenant && useFleetStore.getState().satellites[s.sat_id]?.health_state !== 'CRITICAL').map((s) => s.sat_id);

/** Fraction of priority weight placed, minus 0.05 per open conflict. */
function score(placedIds: string[], all: { id: string; priority: 'P1' | 'P2' | 'P3' }[], nConf: number) {
  const tot = all.reduce((a, r) => a + WEIGHT[r.priority], 0);
  const got = all.filter((r) => placedIds.includes(r.id)).reduce((a, r) => a + WEIGHT[r.priority], 0);
  return tot ? Math.max(0, got / tot - 0.05 * nConf) : 1;
}

const audit = (by: string, mnemonic: string, summary: string, planId: string) => useMissionStore.getState().appendAudit({
  timestamp_utc: new Date().toISOString(), operator_id: 'PLAN', operator_name: by, sat_id: 'FLEET', command_mnemonic: mnemonic,
  procedure_id: planId, procedure_version: '1', sequence_count: 0, result: 'ACK', params_summary: summary,
});

const crc16 = (s: string) => { let c = 0xffff; for (const ch of s) { c ^= ch.charCodeAt(0) << 8; for (let i = 0; i < 8; i++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff; } return c.toString(16).toUpperCase().padStart(4, '0'); };
const doy = (ms: number) => { const d = new Date(ms); return `${d.getUTCFullYear() % 100}${String(Math.floor((ms - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400_000) + 1).padStart(3, '0')}`; };

export const usePlanStore = create<PlanStore>()(persist((set, get) => ({
  planId: '',
  seq: 277,
  from: 0,
  span: PLAN_SPAN,
  stage: 'DRAFT',
  activities: [],
  conflicts: [],
  log: [],

  init: (force) => {
    const s = get();
    if (!force && s.activities.length && Date.now() < s.from + s.span) { if (!scenarioSat) scenarioSat = s.activities.find((a) => a.id === 'IMG-TR-5539')?.sat ?? null; return; }
    const from = Math.floor(Date.now() / H) * H;
    const seq = s.planId ? s.seq + 1 : s.seq;
    set({ planId: `P-2026-${seq}`, seq, from, span: PLAN_SPAN, stage: 'DRAFT', activities: baseline(from), solved: undefined, conflicts: [], approvalId: undefined, pus11: undefined, log: [] });
  },

  solve: (by) => {
    const s = get();
    const reqStore = useRequestStore.getState();
    const open = reqStore.requests.filter(isOpen);
    const base = s.activities.filter((a) => a.fixed);
    const r = solve({ from: s.from, span: s.span, now: Date.now(), requests: open, baseline: base, satsOf, contacts: contactsOf(s.from), stateAt: stateFn, cloud: cloudForecast, res: resources });
    const conf = conflicts(r.activities, resources, s.from, s.span, contactsOf(s.from));
    reqStore.updateMany(Object.fromEntries(open.map((q) => [q.id, r.placed[q.id] ? { state: 'PLACED' as const, placement: r.placed[q.id], reason: undefined } : { state: 'NOT_PLACED' as const, placement: undefined, reason: r.unplaced[q.id] }])));
    const placedIds = Object.keys(r.placed);
    set({
      stage: 'SOLVED', activities: r.activities, conflicts: conf, approvalId: undefined,
      solved: { at: Date.now(), by, ms: r.ms, placed: placedIds.length, total: open.length, score: score(placedIds, open, conf.length), unplaced: r.unplaced, ids: open.map((q) => q.id) },
      log: [{ at: Date.now(), by, text: `Solved: ${placedIds.length} of ${open.length} requests placed, ${conf.length} conflict${conf.length === 1 ? '' : 's'}` }, ...s.log],
    });
    audit(by, 'PLAN_SOLVE', `${s.planId}: ${placedIds.length}/${open.length} placed, ${conf.length} conflicts`, s.planId);
  },

  applyFix: (f, by) => {
    const s = get();
    let acts = s.activities;
    let text = '';
    if (f.kind === 'MOVE_DL') {
      const old = acts.find((a) => a.id === f.activityId);
      acts = acts.map((a) => (a.id === f.activityId ? { ...a, start: f.to.aos, end: f.to.los, station: f.to.station, label: f.to.station, contactId: f.to.id } : a));
      text = f.label;
      const rq = useRequestStore.getState();
      rq.updateMany(Object.fromEntries(rq.requests.filter((q) => q.placement && q.placement.sat === old?.sat && q.placement.dlAt === old?.start)
        .map((q) => [q.id, { placement: { ...q.placement!, dlStation: f.to.station, dlAt: f.to.aos } }])));
    } else {
      acts = acts.filter((a) => a.requestId !== f.requestId && a.forRequest !== f.requestId);
      useRequestStore.getState().update(f.requestId, { state: 'DROPPED', placement: undefined, reason: `Dropped by ${by} to resolve a storage conflict` });
      text = `Dropped ${f.requestId}`;
    }
    const conf = conflicts(acts, resources, s.from, s.span, contactsOf(s.from));
    const reqs = useRequestStore.getState().requests;
    const all = reqs.filter((q) => s.solved?.ids.includes(q.id));
    const placedIds = all.filter((q) => q.state === 'PLACED').map((q) => q.id);
    set({
      activities: acts, conflicts: conf, stage: 'SOLVED', approvalId: undefined,
      solved: s.solved && { ...s.solved, placed: placedIds.length, score: score(placedIds, all, conf.length) },
      log: [{ at: Date.now(), by, text: `Resolved conflict: ${text}` }, ...s.log],
    });
    audit(by, 'PLAN_EDIT', `${s.planId}: ${text}`, s.planId);
  },

  sendForApproval: (by) => {
    const s = get();
    const id = `APR-${s.planId}-${s.log.length}`;
    const sats = [...new Set(s.activities.map((a) => a.sat))];
    const peak = Math.max(...sats.map((x) => Math.max(...profile(x, s.activities, resources, s.from, s.span).series.map((p) => p.storage))));
    const low = Math.min(...sats.map((x) => Math.min(...profile(x, s.activities, resources, s.from, s.span).series.map((p) => p.soc))));
    useMissionStore.getState().requestApproval({
      approval_id: id, command_id: s.planId, sat_id: 'FLEET', mnemonic: 'PLAN_APPROVE',
      params: { plan: s.planId, activities: s.activities.length, satellites: sats.length, placed: s.solved?.placed ?? 0 },
      reason: `Mission plan ${s.planId} for ${new Date(s.from).toISOString().slice(11, 16)}–${new Date(s.from + s.span).toISOString().slice(11, 16)} UTC, uplinked as a PUS-11 schedule once approved`,
      requested_by: by, requested_utc: new Date().toISOString(), expires_utc: new Date(Date.now() + 2 * H).toISOString(), state: 'PENDING',
      interlocks: [
        { param: 'Peak storage', value: `${Math.round(peak)} %`, rule: '≤ 95 %', pass: peak <= 95 },
        { param: 'Lowest battery', value: `${Math.round(low)} %`, rule: '≥ 35 %', pass: low >= 35 },
        { param: 'Open conflicts', value: String(s.conflicts.length), rule: '= 0', pass: s.conflicts.length === 0 },
      ],
    });
    set({ stage: 'PENDING_APPROVAL', approvalId: id, log: [{ at: Date.now(), by, text: 'Sent to a Flight Director for approval' }, ...s.log] });
    audit(by, 'PLAN_SUBMIT', `${s.planId} sent for approval (${id})`, s.planId);
    return id;
  },

  uplink: (by) => {
    const s = get();
    const now = Date.now();
    const sats = [...new Set(s.activities.map((a) => a.sat))].sort();
    const perSat = sats.map((sat) => { const a = s.activities.filter((x) => x.sat === sat); return { sat, tcs: a.length, first: Math.min(...a.map((x) => x.start)), last: Math.max(...a.map((x) => x.end)) }; });
    const total = perSat.reduce((a, p) => a + p.tcs, 0);

    // Book every downlink the plan relies on.
    const bookings = useBookingStore.getState();
    for (const a of s.activities.filter((x) => x.kind === 'DL' && x.contactId)) {
      const c = satContacts(a.sat, s.from, s.span).find((x) => x.id === a.contactId);
      if (c && working(c) && bookingOf(c, bookings.state) === 'PREDICTED') bookings.request(c, by);
    }

    // Placed requests become scheduled; each gets a payload session (sample: starts now, so the delivery chain can be followed).
    const req = useRequestStore.getState();
    const deliveries = useDeliveryStore.getState();
    const patches: Record<string, { state: 'SCHEDULED'; deliveryId: string }> = {};
    const sessions: string[] = [];
    req.requests.filter((q) => q.state === 'PLACED' && q.placement).forEach((q, i) => {
      const id = `DL-${doy(now)}-${String(100 + deliveries.sessions.length + i).slice(-3)}`;
      const size = 2000 + Math.round(seeded(q.id)() * 4000);
      deliveries.addSession({ id, sat: q.placement!.sat, station: q.placement!.dlStation, tenant: q.tenant, requestId: q.id, sizeMb: size, chunksTotal: Math.ceil(size / 10), startedAt: now, recvDoneAt: now + 40_000 + i * 10_000, mergeDoneAt: now + 55_000 + i * 10_000, failedChunks: [], retries: [] });
      patches[q.id] = { state: 'SCHEDULED', deliveryId: id };
      sessions.push(id);
    });
    req.updateMany(patches);

    const crc = crc16(s.activities.map((a) => `${a.sat}${a.kind}${a.start}`).join('|'));
    set({ stage: 'UPLINKED', pus11: { at: now, by, total, perSat, crc, sessions }, log: [{ at: now, by, text: `Uplinked as PUS-11: ${total} activities on ${sats.length} satellites` }, ...s.log] });
    audit(by, 'PLAN_UPLINK', `${s.planId} uplinked: TC(11,4) × ${sats.length}, ${total} activities, CRC ${crc}`, s.planId);
  },
}), { name: demoKey('plan'), storage: demoStorage }));

/**
 * Guided demo: a point under one of the tenant's satellites on a daylight pass inside the current
 * plan window, early enough that a working downlink contact follows it. The solver still decides
 * whether the request fits. Null when no such pass exists.
 */
export function daylightTarget(tenant: string): { sat: string; lat: number; lon: number } | null {
  const { from, span } = usePlanStore.getState();
  const found: { sat: string; lat: number; lon: number }[] = [];
  for (const sat of satsOf(tenant)) {
    const at = stateFn(sat);
    const dls = satContacts(sat, from, span).filter(working);
    for (let t = Math.max(from, Date.now()) + 30 * MIN; t < from + span - 2 * H; t += 5 * MIN) {
      const s = at(t);
      if (Math.abs(s.lat) > 60 || !isSunlit(s, t)) continue;
      if (!dls.some((c) => c.aos > t + 15 * MIN && c.los < from + span)) continue;
      found.push({ sat, lat: Math.round(s.lat * 100) / 100, lon: Math.round(s.lon * 100) / 100 });
    }
  }
  // Prefer India (the customers' region), else the first daylight pass anywhere.
  return found.find((f) => f.lat > 8 && f.lat < 32 && f.lon > 70 && f.lon < 90) ?? found[0] ?? null;
}
