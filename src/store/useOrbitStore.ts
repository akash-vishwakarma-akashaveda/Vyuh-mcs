import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { demoKey, demoStorage } from '../demo/persist';
import { parseTle, sgp4init, sgp4State, Satrec } from '../orbit/sgp4';
import { propagate, State } from '../orbit/orbit';
import { satElements } from '../orbit/fleetOrbit';
import { FLEET } from '../data/fleet';

/**
 * Orbit data per satellite: the ingested TLE (if any). Without one, every screen falls back to the
 * console's model elements (two-body + J2). With one, passes and positions come from SGP4.
 */
export interface TleRecord { satId: string; text: string; ingestedAt: number; by: string; sample: boolean }

interface OrbitStore {
  tles: Record<string, TleRecord>;
  ingest: (r: TleRecord) => void;
  remove: (satId: string) => void;
}

export const useOrbitStore = create<OrbitStore>()(persist((set) => ({
  tles: {},
  ingest: (r) => set((s) => ({ tles: { ...s.tles, [r.satId]: r } })),
  remove: (satId) => set((s) => { const t = { ...s.tles }; delete t[satId]; return { tles: t }; }),
}), { name: demoKey('orbits'), storage: demoStorage }));

const recs = new Map<string, { text: string; rec: Satrec }>();

/** SGP4 record for a satellite with an ingested TLE, else null. */
export function satrecOf(satId: string): Satrec | null {
  const t = useOrbitStore.getState().tles[satId];
  if (!t) return null;
  const hit = recs.get(satId);
  if (hit && hit.text === t.text) return hit.rec;
  const p = parseTle(t.text);
  if (!p.tle) return null;
  const rec = sgp4init(p.tle);
  recs.set(satId, { text: t.text, rec });
  return rec;
}

/** Propagator for a satellite: SGP4 when a TLE is ingested, else the model elements. */
export function stateFn(satId: string): (ms: number) => State {
  const rec = satrecOf(satId);
  if (rec) return (ms) => sgp4State(rec, ms);
  const sat = FLEET.find((s) => s.sat_id === satId);
  const el = sat ? satElements(sat) : satElements(FLEET[0]);
  return (ms) => propagate(el, ms);
}

/** "sgp4:<epoch>" or "model": part of cache keys so contacts recompute after an ingest. */
export const orbitSourceKey = (satId: string) => {
  const t = useOrbitStore.getState().tles[satId];
  return t ? `tle:${t.ingestedAt}` : 'model';
};
