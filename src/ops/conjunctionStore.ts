import { create } from 'zustand';
import { FLEET } from '../data/fleet';
import { satElements } from '../orbit/fleetOrbit';
import { Conjunction, SpaceObject, findConjunctions, generateDebris } from '../orbit/debris';
import { toast } from '../store/useToastStore';

/**
 * One conjunction screening for the whole console, so the globe, the fleet table, the alarm
 * console and the satellite pages all show the same numbers. Runs shortly after start and every
 * ten minutes; demo catalogue (see orbit/debris.ts).
 */
interface ConjStore {
  objects: SpaceObject[];
  conjunctions: Conjunction[];
  computedAt: number;
  refresh: () => void;
}

const refs = () => FLEET.map((s) => ({ id: s.sat_id, el: satElements(s) }));
const alerted = new Set<string>();

export const useConjunctionStore = create<ConjStore>((set, get) => ({
  objects: [],
  conjunctions: [],
  computedAt: 0,
  refresh: () => {
    const now = Date.now();
    const r = refs();
    const objects = get().objects.length ? get().objects : generateDebris(r, now);
    const conjunctions = findConjunctions(r, objects, now, 4 * 3600_000, 25);
    set({ objects, conjunctions, computedAt: now });

    const fresh = conjunctions.filter((c) => c.risk === 'CRITICAL' && !alerted.has(`${c.satId}:${c.objectId}`));
    fresh.forEach((c) => alerted.add(`${c.satId}:${c.objectId}`));
    const mins = (ms: number) => { const m = Math.round((ms - Date.now()) / 60000); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`; };
    if (fresh.length === 1) {
      const c = fresh[0];
      toast.critical(`Conjunction: ${c.satId} and ${c.objectName}`, {
        body: `Miss distance ${c.missKm.toFixed(1)} km in ${mins(c.tcaMs)}, closing at ${c.relSpeedKms.toFixed(1)} km/s.`, key: 'conjunction',
        action: { label: 'Open alarm console', route: 'alarms' },
      });
    } else if (fresh.length > 1) {
      toast.critical(`${fresh.length} critical conjunctions (under 5 km)`, {
        body: fresh.slice(0, 3).map((c) => `${c.satId} × ${c.objectName}: ${c.missKm.toFixed(1)} km in ${mins(c.tcaMs)}`).join(' · '), key: 'conjunction',
        action: { label: 'Open alarm console', route: 'alarms' },
      });
    }
  },
}));

export function startConjunctionScreening(): () => void {
  const first = window.setTimeout(() => useConjunctionStore.getState().refresh(), 1500);
  const again = window.setInterval(() => useConjunctionStore.getState().refresh(), 10 * 60_000);
  return () => { clearTimeout(first); clearInterval(again); };
}
