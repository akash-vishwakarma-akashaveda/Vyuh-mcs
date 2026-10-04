import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { demoKey, demoStorage } from '../demo/persist';
import { NETWORK_BOOKINGS, at } from '../demo/scenario';
import { STATIONS } from '../data/fleet';
import { seeded } from '../ops/history';
import type { ContactWindow } from '../orbit/contacts';

/**
 * Ground-station bookings. Own stations confirm at once; partner and commercial providers answer a
 * request after a short delay (the provider adapter is not built yet, so the answer is simulated —
 * the screen marks it as sample). Cancelling is confirmed by the provider the same way.
 */
export type Booking = 'PREDICTED' | 'REQUESTED' | 'BOOKED' | 'CANCEL_REQUESTED' | 'CANCELLED' | 'SHIFTED';
export interface BookingEvent { at: number; text: string; by?: string }

interface BookingStore {
  state: Record<string, Booking>;
  log: Record<string, BookingEvent[]>;
  request: (c: ContactWindow, by: string) => void;
  cancel: (c: ContactWindow, by: string) => void;
}

export const PROVIDER_DELAY_MS = 2500;

/** Booking state before anyone touched it: own stations booked, the rest seeded, maintenance cancelled. */
export function baseBooking(c: ContactWindow): Booking {
  const st = STATIONS.find((s) => s.id === c.station);
  if (st?.state === 'MAINTENANCE') return 'CANCELLED';
  if (st?.provider === 'Akashaveda') return 'BOOKED';
  const r = seeded(c.id)();
  return r < 0.6 ? 'BOOKED' : r < 0.9 ? 'PREDICTED' : 'SHIFTED';
}

export const bookingOf = (c: ContactWindow, state: Record<string, Booking>) => state[c.id] ?? baseBooking(c);

const note = (s: BookingStore, id: string, e: BookingEvent) => ({ ...s.log, [id]: [...(s.log[id] ?? []), e] });

/** The network bookings of the scenario, as booking states on their contacts (the same fact on S09 and S32). */
const SEEDED: Record<string, Booking> = Object.fromEntries(NETWORK_BOOKINGS.map((b) => [b.contactId, b.state === 'CONFIRMED' ? 'BOOKED' : 'CANCELLED']));
const SEEDED_LOG: Record<string, BookingEvent[]> = Object.fromEntries(NETWORK_BOOKINGS.map((b) => [b.contactId, [{ at: at(b.min), text: `${b.id}: ${b.note}`, by: b.requestedBy }]]));

export const useBookingStore = create<BookingStore>()(persist((set) => ({
  state: SEEDED,
  log: SEEDED_LOG,
  request: (c, by) => {
    const st = STATIONS.find((s) => s.id === c.station);
    const own = st?.provider === 'Akashaveda';
    set((s) => ({ state: { ...s.state, [c.id]: own ? 'BOOKED' : 'REQUESTED' }, log: note(s, c.id, { at: Date.now(), text: own ? 'Booked on own station' : `Requested from ${st?.provider}`, by }) }));
    if (!own) window.setTimeout(() => set((s) => s.state[c.id] !== 'REQUESTED' ? s : ({ state: { ...s.state, [c.id]: 'BOOKED' }, log: note(s, c.id, { at: Date.now(), text: `${st?.provider} confirmed the booking` }) })), PROVIDER_DELAY_MS);
  },
  cancel: (c, by) => {
    const st = STATIONS.find((s) => s.id === c.station);
    set((s) => ({ state: { ...s.state, [c.id]: 'CANCEL_REQUESTED' }, log: note(s, c.id, { at: Date.now(), text: 'Cancellation sent', by }) }));
    window.setTimeout(() => set((s) => s.state[c.id] !== 'CANCEL_REQUESTED' ? s : ({ state: { ...s.state, [c.id]: 'CANCELLED' }, log: note(s, c.id, { at: Date.now(), text: `${st?.provider} confirmed the cancellation` }) })), PROVIDER_DELAY_MS);
  },
}), {
  name: demoKey('bookings'), storage: demoStorage,
  // A reload drops the provider timers: settle anything that was still waiting on one.
  merge: (p, cur) => {
    const saved = (p ?? {}) as Partial<BookingStore>;
    const state = Object.fromEntries(Object.entries(saved.state ?? {}).map(([k, v]) => [k, v === 'REQUESTED' ? 'BOOKED' : v === 'CANCEL_REQUESTED' ? 'CANCELLED' : v])) as Record<string, Booking>;
    return { ...cur, log: saved.log ?? cur.log, state: saved.state ? state : cur.state };
  },
}));
