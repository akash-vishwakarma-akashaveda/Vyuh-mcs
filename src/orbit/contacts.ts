/**
 * Contact windows for the fleet, shared by the contact schedule and the mission-plan solver so both
 * see the same passes. Propagation is SGP4 when a TLE has been ingested (Orbits screen), else the model.
 */
import { FLEET, STATIONS } from '../data/fleet';
import { passesOf } from './orbit';
import { orbitSourceKey, stateFn } from '../store/useOrbitStore';

export interface ContactWindow { id: string; sat: string; station: string; aos: number; los: number; maxEl: number }

/** Stable id for a pass: the same contact keeps its id while the clock moves. */
export const contactId = (sat: string, station: string, aos: number) => `${sat}-${station}-${Math.round(aos / 300_000)}`;

const cache = new Map<string, ContactWindow[]>();
const BUCKET = 600_000;

/** Passes (≥ 10° elevation) of one satellite over its assigned stations from `from` for `span` ms. Cached per 10 min. */
export function satContacts(satId: string, from: number, span: number): ContactWindow[] {
  const b = Math.floor(from / BUCKET) * BUCKET;
  const key = `${satId}|${b}|${span}|${orbitSourceKey(satId)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const sat = FLEET.find((s) => s.sat_id === satId);
  const at = stateFn(satId);
  const out: ContactWindow[] = [];
  for (const id of sat?.assigned_ground_stations ?? []) {
    const st = STATIONS.find((x) => x.id === id);
    if (!st) continue;
    for (const p of passesOf(at, st, b, span + BUCKET, 10, 60_000)) {
      out.push({ id: contactId(satId, id, p.aos), sat: satId, station: id, aos: p.aos, los: p.los, maxEl: Math.round(p.maxElevationDeg) });
    }
  }
  out.sort((x, y) => x.aos - y.aos);
  if (cache.size > 400) cache.clear();
  cache.set(key, out);
  return out;
}

export const fleetContacts = (from: number, span: number) => FLEET.flatMap((s) => satContacts(s.sat_id, from, span));
