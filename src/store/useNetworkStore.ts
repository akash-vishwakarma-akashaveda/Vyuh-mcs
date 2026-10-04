import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STATIONS } from '../data/fleet';
import { NETWORK_BOOKINGS, isoAt } from '../demo/scenario';
import { demoKey, demoStorage } from '../demo/persist';
import { useAuthStore } from './useAuthStore';
import { useMissionStore } from './useMissionStore';

/**
 * Ground network (S32): providers, SLE service instances per station, and bookings. No provider
 * APIs are connected yet, so this is a sample model; the flow is the real one: a booking is only
 * confirmed when the provider confirms it (here a simulated provider answers after a few seconds).
 */

export type ProviderState = 'CONNECTED' | 'DEGRADED' | 'NOT_CONFIGURED';
export interface Provider { id: string; name: string; kind: string; state: ProviderState; api: string; stations: string[]; note?: string }
export interface NetStation { id: string; name: string; provider: string; lat: number; lon: number; bands: string[] }
export type SleState = 'UNBOUND' | 'READY' | 'ACTIVE';
export interface SleService { station: string; type: 'RAF' | 'RCF' | 'FCLTU'; state: SleState }
export interface Booking {
  id: string; sat: string; station: string; provider: string; aos: string; los: string; maxEl: number;
  state: 'REQUESTED' | 'CONFIRMED' | 'DECLINED' | 'CANCELLED'; requestedBy: string; utc: string; note?: string;
}

const EXTRA: NetStation[] = [
  { id: 'LSP', name: 'Sardinia (Leaf Space)', provider: 'LEAF', lat: 39.5, lon: 9.0, bands: ['S', 'X'] },
  { id: 'ATL', name: 'Fairbanks (ATLAS)', provider: 'ATLAS', lat: 64.84, lon: -147.72, bands: ['S', 'X'] },
];

const providerOf = (provider: string) =>
  provider === 'Akashaveda' || provider === 'ISRO' ? 'OWN' : provider === 'KSAT' ? 'KSAT' : provider === 'AWS' ? 'AWS' : 'PARTNER';

export const NET_STATIONS: NetStation[] = [
  ...STATIONS.map((s) => ({ id: s.id, name: s.name, provider: providerOf(s.provider), lat: s.lat, lon: s.lon, bands: s.bands })),
  ...EXTRA,
];

const PROVIDERS: Provider[] = [
  { id: 'OWN', name: 'Own stations', kind: 'SLE over the ops WAN', state: 'CONNECTED', api: 'SLE 5 (RAF, RCF, FCLTU)', stations: ['HYD', 'BLR'] },
  { id: 'KSAT', name: 'KSAT', kind: 'Ground station as a service', state: 'CONNECTED', api: 'KSATlite booking API + SLE', stations: ['SVL', 'PTH'] },
  { id: 'AWS', name: 'AWS Ground Station', kind: 'Ground station as a service', state: 'DEGRADED', api: 'GroundStation API, Data Defender', stations: ['AWS'], note: 'Dataflow endpoint health check failing in us-east-2' },
  { id: 'LEAF', name: 'Leaf Space', kind: 'Ground station as a service', state: 'CONNECTED', api: 'Leaf API v2', stations: ['LSP'] },
  { id: 'ATLAS', name: 'ATLAS Space Operations', kind: 'Ground station as a service', state: 'NOT_CONFIGURED', api: 'Freedom API', stations: ['ATL'], note: 'Contract signed; credentials not yet in OpenBao' },
  { id: 'PARTNER', name: 'Partner stations', kind: 'Bilateral agreement', state: 'DEGRADED', api: 'Own protocol', stations: ['SGP'], note: 'Singapore in maintenance' },
];

const SLE: SleService[] = ['HYD', 'BLR', 'SVL', 'PTH'].flatMap((st) => (['RAF', 'RCF', 'FCLTU'] as const).map((type) => ({ station: st, type, state: (st === 'HYD' && type !== 'RCF' ? 'ACTIVE' : 'READY') as SleState })));


interface Store {
  providers: Provider[];
  sle: SleService[];
  bookings: Booking[];
  setSle: (station: string, type: SleService['type'], state: SleState) => void;
  request: (b: Omit<Booking, 'id' | 'state' | 'requestedBy' | 'utc' | 'provider'>) => void;
  cancel: (id: string) => void;
}

const audit = (sat: string, mn: string, text: string, result: 'ACK' | 'NACK' = 'ACK') => {
  const u = useAuthStore.getState().user;
  useMissionStore.getState().appendAudit({ timestamp_utc: new Date().toISOString(), operator_id: u.id, operator_name: u.name, sat_id: sat, command_mnemonic: mn, procedure_id: '—', procedure_version: '—', sequence_count: 0, result, params_summary: text });
};
/** Next booking number: above every booking already held. */
const nextSeq = (bs: Booking[]) => 1 + bs.reduce((m, b) => Math.max(m, Number(b.id.slice(3)) || 0), 3100);

export const useNetworkStore = create<Store>()(persist((set, get) => ({
  providers: PROVIDERS,
  sle: SLE,
  bookings: NETWORK_BOOKINGS.map((b) => ({
    id: b.id, sat: b.sat, station: b.station, provider: NET_STATIONS.find((x) => x.id === b.station)!.provider, aos: b.aos, los: b.los, maxEl: b.maxEl,
    state: b.state, requestedBy: b.requestedBy, utc: isoAt(b.min), note: b.note,
  })),

  setSle: (station, type, state) => {
    set((s) => ({ sle: s.sle.map((x) => (x.station === station && x.type === type ? { ...x, state } : x)) }));
    audit('ALL', 'SLE', `${station} ${type} → ${state.toLowerCase()}`);
  },

  request: (b) => {
    const st = NET_STATIONS.find((s) => s.id === b.station)!;
    const provider = get().providers.find((p) => p.id === st.provider)!;
    const id = `BK-${nextSeq(get().bookings)}`;
    set((s) => ({ bookings: [{ ...b, id, provider: provider.id, state: 'REQUESTED', requestedBy: useAuthStore.getState().user.name, utc: new Date().toISOString() }, ...s.bookings] }));
    audit(b.sat, 'BOOKING_REQUEST', `${id} ${b.station} ${b.aos.slice(11, 16)}–${b.los.slice(11, 16)}Z with ${provider.name}`);
    // The provider answers, not us. ponytail: simulated answer; replace with the provider adapter's webhook.
    window.setTimeout(() => {
      const cur = get().bookings.find((x) => x.id === id);
      if (!cur || cur.state !== 'REQUESTED') return;
      const ok = provider.state === 'CONNECTED' || (provider.state === 'DEGRADED' && Math.random() > 0.5);
      set((s) => ({ bookings: s.bookings.map((x) => (x.id === id ? { ...x, state: ok ? 'CONFIRMED' : 'DECLINED', note: ok ? `Confirmed by ${provider.name}` : provider.note ?? 'Declined by the provider' } : x)) }));
    }, provider.state === 'NOT_CONFIGURED' ? 0 : 4000);
  },

  cancel: (id) => {
    const b = get().bookings.find((x) => x.id === id);
    set((s) => ({ bookings: s.bookings.map((x) => (x.id === id ? { ...x, state: 'CANCELLED', note: `Cancelled by ${useAuthStore.getState().user.name}` } : x)) }));
    if (b) audit(b.sat, 'BOOKING_CANCEL', `${id} ${b.station}`, 'NACK');
  },
}), { name: demoKey('network'), storage: demoStorage, partialize: (s) => ({ sle: s.sle, bookings: s.bookings }) as unknown as Store }));
