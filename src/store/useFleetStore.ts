import { create } from 'zustand';
import { Satellite, Param, ContactWindow } from '../types';

interface FleetStore {
  satellites: Record<string, Satellite>;
  cvt: Record<string, Record<string, Param>>; // cvt[sat_id][param_id]
  contactWindows: ContactWindow[];
  selectedSatId: string;
  
  // Actions
  setSatellites: (sats: Satellite[]) => void;
  addSatellite: (sat: Satellite) => void;
  updateSatellite: (sat_id: string, partial: Partial<Satellite>) => void;
  updateParam: (sat_id: string, param_id: string, param: Partial<Param>) => void;
  applyTick: (updates: { sat_id: string; params: Record<string, Partial<Param>> }[]) => void;
  setSelectedSatId: (satId: string) => void;
  setContactStatus: (sat_id: string, status: 'AOS' | 'LOS') => void;
  setContactWindows: (windows: ContactWindow[]) => void;
}

export const useFleetStore = create<FleetStore>((set) => ({
  satellites: {},
  cvt: {},
  contactWindows: [],
  selectedSatId: 'SAT-001',

  setSatellites: (sats) =>
    set(() => {
      const map: Record<string, Satellite> = {};
      sats.forEach((s) => (map[s.sat_id] = s));
      return { satellites: map };
    }),

  /** Grows the fleet without touching anyone already in it — see the onboarding wizard. */
  addSatellite: (sat) =>
    set((state) => ({ satellites: { ...state.satellites, [sat.sat_id]: sat } })),

  updateSatellite: (sat_id, partial) =>
    set((state) => {
      const existing = state.satellites[sat_id];
      if (!existing) return state;
      return {
        satellites: {
          ...state.satellites,
          [sat_id]: { ...existing, ...partial },
        },
      };
    }),

  updateParam: (sat_id, param_id, paramData) =>
    set((state) => {
      const satCvt = state.cvt[sat_id] || {};
      const existing = satCvt[param_id];
      const updatedParam: Param = {
        param_id,
        name: paramData.name || existing?.name || param_id,
        subsystem: paramData.subsystem || existing?.subsystem || 'POWER',
        eu_value: paramData.eu_value ?? existing?.eu_value ?? 0,
        unit: paramData.unit || existing?.unit || '',
        alarm_state: paramData.alarm_state ?? existing?.alarm_state ?? 0,
        quality: paramData.quality ?? existing?.quality ?? 0,
        limit_low_soft: paramData.limit_low_soft ?? existing?.limit_low_soft,
        limit_hi_soft: paramData.limit_hi_soft ?? existing?.limit_hi_soft,
        limit_low_hard: paramData.limit_low_hard ?? existing?.limit_low_hard,
        limit_hi_hard: paramData.limit_hi_hard ?? existing?.limit_hi_hard,
        raw_dn: paramData.raw_dn ?? existing?.raw_dn,
        calibration_eq: paramData.calibration_eq || existing?.calibration_eq,
        timestamp_utc: paramData.timestamp_utc || new Date().toISOString(),
      };

      return {
        cvt: {
          ...state.cvt,
          [sat_id]: {
            ...satCvt,
            [param_id]: updatedParam,
          },
        },
      };
    }),

  /**
   * One immutable merge for a whole simulation tick. 12 satellites × ~42 parameters
   * through updateParam would be ~500 store writes a second; this is one.
   */
  applyTick: (updates) =>
    set((state) => {
      const cvt = { ...state.cvt };
      for (const { sat_id, params } of updates) {
        const satCvt = { ...(cvt[sat_id] || {}) };
        for (const [param_id, partial] of Object.entries(params)) {
          const existing = satCvt[param_id];
          if (!existing) continue;
          satCvt[param_id] = { ...existing, ...partial };
        }
        cvt[sat_id] = satCvt;
      }
      return { cvt };
    }),

  setSelectedSatId: (satId) => set({ selectedSatId: satId }),

  setContactStatus: (sat_id, status) =>
    set((state) => {
      const sat = state.satellites[sat_id];
      if (!sat) return state;
      return {
        satellites: {
          ...state.satellites,
          [sat_id]: {
            ...sat,
            last_contact_utc: status === 'AOS' ? new Date().toISOString() : sat.last_contact_utc,
          },
        },
      };
    }),

  setContactWindows: (windows) => set({ contactWindows: windows }),
}));
