import { createJSONStorage } from 'zustand/middleware';

/**
 * One persistence rule for the demo world (see docs/ui-redesign/DEMO_DATA.md):
 * every store that holds scenario state persists to sessionStorage under `vyuh.demo.v1.<store>`.
 * The marker key `vyuh.demo.v1` holds the moment the world was seeded (T0). When it is missing, every
 * demo key (and the pre-v1 keys) is cleared first, so all stores seed together from the same T0 and
 * cross-references stay valid after a reload. Bump VERSION when the scenario's shape changes.
 *
 * This module imports nothing from the app, so any store can use it without an import cycle.
 */
const VERSION = 'vyuh.demo.v1';
const PREFIX = 'vyuh.demo.';
/** Keys the stores used before the scenario existed. */
const LEGACY = ['vyuh.requests', 'vyuh.plan', 'vyuh.deliveries', 'vyuh.bookings', 'vyuh.cdms', 'vyuh.orbits'];

function anchor(): number {
  try {
    const saved = Number(sessionStorage.getItem(VERSION));
    if (saved > 0) return saved;
    for (const k of Object.keys(sessionStorage)) if (k.startsWith(PREFIX) || LEGACY.includes(k)) sessionStorage.removeItem(k);
    const t = Date.now();
    sessionStorage.setItem(VERSION, String(t));
    return t;
  } catch {
    return Date.now(); // no sessionStorage (node checks, private mode): the world lives for this page only
  }
}

/** The moment the demo world was seeded. Every scenario time is relative to it. */
export const T0 = anchor();

export const demoStorage = createJSONStorage(() => sessionStorage);
export const demoKey = (store: string) => `${VERSION}.${store}`;

/** Forget the demo world and seed a fresh one (the signed-in session is kept). */
export function resetDemo() {
  try {
    for (const k of Object.keys(sessionStorage)) if (k === VERSION || k.startsWith(PREFIX)) sessionStorage.removeItem(k);
  } catch { /* nothing stored */ }
  location.reload();
}
