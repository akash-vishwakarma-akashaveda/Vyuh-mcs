import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { T0, demoKey, demoStorage } from '../demo/persist';
import { FLEET, TENANTS, tenantOf } from '../data/fleet';
import { satElements } from '../orbit/fleetOrbit';
import { Conjunction, ObjectKind, SpaceObject, findConjunctions, generateDebris } from '../orbit/debris';
import { toast } from '../store/useToastStore';
import { parseCdm, sampleCdms } from '../orbit/cdm';

/**
 * One conjunction picture for the whole console, so the globe, the fleet table, the alarm console and
 * the satellite pages all show the same numbers. Two sources:
 *  - screening of the demo catalogue (see orbit/debris.ts), run shortly after start and every ten minutes;
 *  - conjunction data messages (CCSDS 508.0 CDM, KVN) ingested on the Orbits screen. A CDM whose
 *    collision probability is at or above the mission's Pc threshold becomes a critical conjunction,
 *    which the alarm console turns into an alarm.
 */
export type CdmStatus = 'NEW' | 'SCREENING' | 'SCREENED' | 'CLOSED';
export interface Cdm {
  messageId: string; created: string; originator: string; sample: boolean;
  satId: string; objectId: string; objectName: string; objectType: string;
  tcaMs: number; missM: number; relSpeedMs: number; pc: number;
  r: number; t: number; n: number;
  status: CdmStatus;
  screening?: { requestedBy: string; at: number; result?: string };
  receivedAt: number; raw: string;
}

interface ConjStore {
  objects: SpaceObject[];
  screened: Conjunction[];
  conjunctions: Conjunction[];
  computedAt: number;
  cdms: Cdm[];
  /** Collision-probability action threshold per mission (tenant). */
  thresholds: Record<string, number>;
  refresh: () => void;
  addCdm: (c: Cdm) => void;
  setThreshold: (mission: string, pc: number) => void;
  setCdm: (id: string, patch: Partial<Cdm>) => void;
}

const refs = () => FLEET.map((s) => ({ id: s.sat_id, el: satElements(s) }));
const alerted = new Set<string>();

const kindOf = (t: string): ObjectKind => (/ROCKET/i.test(t) ? 'ROCKET_BODY' : /PAYLOAD/i.test(t) ? 'DEFUNCT' : 'DEBRIS');

/** CDMs that are open and at or above their mission's threshold, as conjunctions. */
export const aboveThreshold = (c: Cdm, thresholds: Record<string, number>) => c.status !== 'CLOSED' && c.pc >= (thresholds[tenantOf(c.satId)] ?? 1e-4);

function merge(screened: Conjunction[], cdms: Cdm[], thresholds: Record<string, number>): Conjunction[] {
  const fromCdm: Conjunction[] = cdms.filter((c) => aboveThreshold(c, thresholds) && c.tcaMs > Date.now() - 3600_000).map((c) => ({
    satId: c.satId, objectId: `CDM-${c.objectId}`, objectName: c.objectName, kind: kindOf(c.objectType),
    tcaMs: c.tcaMs, missKm: c.missM / 1000, relSpeedKms: c.relSpeedMs / 1000, risk: 'CRITICAL',
  }));
  return [...fromCdm, ...screened].sort((a, b) => a.missKm - b.missKm);
}

function alert(conjunctions: Conjunction[]) {
  const fresh = conjunctions.filter((c) => c.risk === 'CRITICAL' && !alerted.has(`${c.satId}:${c.objectId}`));
  fresh.forEach((c) => alerted.add(`${c.satId}:${c.objectId}`));
  const mins = (ms: number) => { const m = Math.round((ms - Date.now()) / 60000); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`; };
  if (fresh.length === 1) {
    const c = fresh[0];
    toast.critical(`Conjunction: ${c.satId} and ${c.objectName}`, {
      body: `Miss distance ${c.missKm < 1 ? `${Math.round(c.missKm * 1000)} m` : `${c.missKm.toFixed(1)} km`} in ${mins(c.tcaMs)}, closing at ${c.relSpeedKms.toFixed(1)} km/s.`, key: 'conjunction',
      action: { label: 'Open alarm console', route: 'alarms' },
    });
  } else if (fresh.length > 1) {
    toast.critical(`${fresh.length} critical conjunctions`, {
      body: fresh.slice(0, 3).map((c) => `${c.satId} × ${c.objectName}: ${c.missKm.toFixed(1)} km in ${mins(c.tcaMs)}`).join(' · '), key: 'conjunction',
      action: { label: 'Open alarm console', route: 'alarms' },
    });
  }
}

export const useConjunctionStore = create<ConjStore>()(persist((set, get) => {
  const sync = (patch: Partial<ConjStore>) => {
    const next = { ...get(), ...patch };
    const conjunctions = merge(next.screened, next.cdms, next.thresholds);
    set({ ...patch, conjunctions });
    alert(conjunctions);
  };
  return {
    objects: [],
    screened: [],
    conjunctions: [],
    computedAt: 0,
    cdms: [],
    thresholds: Object.fromEntries(TENANTS.map((t) => [t, 1e-4])),
    refresh: () => {
      const now = Date.now();
      const r = refs();
      // The catalogue and the sample CDMs are anchored to the demo world (T0), so a reload finds the same encounters.
      const objects = get().objects.length ? get().objects : generateDebris(r, T0);
      // First run in this session: ship the sample CDMs so the inbox and its alarm path have data.
      const cdms = get().cdms.length ? get().cdms : sampleCdms(T0).map((t) => parseCdm(t, true).cdm!).filter(Boolean);
      sync({ objects, cdms, screened: findConjunctions(r, objects, now, 4 * 3600_000, 25), computedAt: now });
    },
    addCdm: (c) => sync({ cdms: [c, ...get().cdms.filter((x) => x.messageId !== c.messageId)] }),
    setThreshold: (mission, pc) => sync({ thresholds: { ...get().thresholds, [mission]: pc } }),
    setCdm: (id, patch) => sync({ cdms: get().cdms.map((c) => (c.messageId === id ? { ...c, ...patch } : c)) }),
  };
}, {
  name: demoKey('conjunctions'), storage: demoStorage,
  partialize: (s) => ({ cdms: s.cdms, thresholds: s.thresholds }) as unknown as ConjStore,
}));

export function startConjunctionScreening(): () => void {
  const first = window.setTimeout(() => useConjunctionStore.getState().refresh(), 1500);
  const again = window.setInterval(() => useConjunctionStore.getState().refresh(), 10 * 60_000);
  return () => { clearTimeout(first); clearInterval(again); };
}
