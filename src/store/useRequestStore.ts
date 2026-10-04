import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { REQUESTS, REQUEST_SEQ } from '../demo/scenario';
import { demoKey, demoStorage } from '../demo/persist';

/**
 * Imaging requests: one list shared by the customer portal (where customers raise them) and the
 * mission plan (where the solver places them). A request's state is written only by the plan
 * (solve, approval, uplink) and by delivery — never invented by the screen showing it.
 */
export type Priority = 'P1' | 'P2' | 'P3';
export type RequestState = 'NEW' | 'PLACED' | 'NOT_PLACED' | 'DROPPED' | 'SCHEDULED' | 'ACQUIRED' | 'DELIVERED';

export interface ImagingRequest {
  id: string;
  tenant: string;
  requestedBy: string;
  target: string;
  lat: number;
  lon: number;
  priority: Priority;
  windowH: number;          // must be acquired within this many hours of submission
  maxCloudPct: number;
  createdAt: number;
  state: RequestState;
  /** Set by the solver. */
  placement?: { sat: string; at: number; dlStation: string; dlAt: number };
  reason?: string;
  deliveryId?: string;
  productId?: string;
}

interface RequestStore {
  requests: ImagingRequest[];
  seq: number;
  submit: (r: Omit<ImagingRequest, 'id' | 'createdAt' | 'state'>) => string;
  update: (id: string, patch: Partial<ImagingRequest>) => void;
  updateMany: (patches: Record<string, Partial<ImagingRequest>>) => void;
}

/** Requests already in the queue when the shift starts (the demo scenario's; TR-5511 and TR-5536 are delivered). */
const SEED: ImagingRequest[] = REQUESTS.map((r) => ({ ...r }));

export const useRequestStore = create<RequestStore>()(persist((set, get) => ({
  requests: SEED,
  seq: REQUEST_SEQ,
  submit: (r) => {
    const id = `TR-${get().seq}`;
    set((s) => ({ seq: s.seq + 1, requests: [{ ...r, id, createdAt: Date.now(), state: 'NEW' }, ...s.requests] }));
    return id;
  },
  update: (id, patch) => set((s) => ({ requests: s.requests.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
  updateMany: (patches) => set((s) => ({ requests: s.requests.map((r) => (patches[r.id] ? { ...r, ...patches[r.id] } : r)) })),
}), { name: demoKey('requests'), storage: demoStorage }));

/** Requests the planner still has to place (everything not dropped, scheduled or finished). */
export const isOpen = (r: ImagingRequest) => r.state === 'NEW' || r.state === 'PLACED' || r.state === 'NOT_PLACED';

/** Cloud forecast over a target for the plan window. ponytail: seeded sample until a weather feed exists. */
export const cloudForecast = (r: ImagingRequest) => (r.id === 'TR-5544' ? 78 : Math.round(Math.abs(Math.sin(r.lat * 3.1 + r.lon)) * 35));
