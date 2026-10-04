import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isFinalStatus, useMissionStore } from './useMissionStore';
import { T0, demoKey, demoStorage } from '../demo/persist';

/**
 * On-board services (S30): the ground's model of each satellite's PUS-11 schedule, PUS-6 memory
 * areas, CFDP transfers and PUS-3/5 report definitions. No backend for these yet, so the model
 * lives here (sample data); every change is still a real command through useMissionStore's
 * raiseCommand, so it follows the same gates, approvals, uplink queue and audit as the console.
 * A change takes effect in the model only when its command completes.
 */

export interface SchedEntry { id: string; mnemonic: string; params: Record<string, string | number>; release_utc: string; critical: boolean; pending?: 'INSERT' | 'DELETE' | 'SHIFT'; shiftTo?: string; commandId?: string; failed?: string }
export interface MemArea { id: string; name: string; start: string; sizeKb: number; writable: boolean; critical: boolean; expectedCrc?: string; onboardCrc?: string; lastOp?: string; busy?: string; dump?: string }
export interface Transfer { id: string; dir: 'UP' | 'DOWN'; file: string; bytes: number; cls: 1 | 2; done: number; state: 'WAITING' | 'RUNNING' | 'SUSPENDED' | 'COMPLETE' | 'CANCELLED' | 'FAILED'; startedBy: string; utc: string; naks?: number }
export interface ReportDef { id: string; kind: 'HK' | 'EVENT'; name: string; enabled: boolean; rateS?: number; severity?: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH'; pending?: string; commandId?: string }

interface SatServices { schedule: SchedEntry[]; scheduleSyncUtc: string; memory: MemArea[]; transfers: Transfer[]; reports: ReportDef[] }

interface Store {
  sats: Record<string, SatServices>;
  of: (sat: string) => SatServices;
  /** Raise the command for a change; `apply` runs when it completes, `fail` when it does not. */
  issue: (sat: string, mnemonic: string, params: Record<string, string | number>, critical: boolean, reason: string, apply: () => void, fail?: (why: string) => void) => string;
  patch: (sat: string, f: (s: SatServices) => Partial<SatServices>) => void;
}

/** Relative to the moment the demo world was seeded, so a satellite's model reads the same on every screen and after a reload. */
const iso = (minFromT0: number) => new Date(T0 + minFromT0 * 60_000).toISOString();

function seed(sat: string): SatServices {
  return {
    scheduleSyncUtc: iso(-42),
    schedule: [
      { id: `${sat}-S1`, mnemonic: 'IMG_CAPTURE', params: { FRAMES: 8, EXPOSURE_MS: 5 }, release_utc: iso(64), critical: false },
      { id: `${sat}-S2`, mnemonic: 'DUMP_START', params: { VCID: 7, RATE: 'HIGH' }, release_utc: iso(118), critical: false },
      { id: `${sat}-S3`, mnemonic: 'HK_RATE_SET', params: { RATE_HZ: 0.5 }, release_utc: iso(240), critical: false },
    ],
    memory: [
      { id: 'OBC_RAM', name: 'OBC working RAM', start: '0x2000_0000', sizeKb: 512, writable: true, critical: false, expectedCrc: '0x5A1C', onboardCrc: '0x5A1C', lastOp: 'checked 6 h ago' },
      { id: 'EEPROM_PATCH', name: 'EEPROM patch area', start: '0x0804_0000', sizeKb: 128, writable: true, critical: true, expectedCrc: '0xC3E1', onboardCrc: '0xC3E1', lastOp: 'loaded 9 d ago' },
      { id: 'BOOT_ROM', name: 'Boot ROM', start: '0x0000_0000', sizeKb: 64, writable: false, critical: true, expectedCrc: '0x1F00', onboardCrc: '0x1F00', lastOp: 'checked 30 d ago' },
    ],
    transfers: [
      { id: `${sat}-F1`, dir: 'DOWN', file: '/payload/img_0412.raw', bytes: 48_234_496, cls: 2, done: 48_234_496, state: 'COMPLETE', startedBy: 'Vikram Shetty', utc: iso(-95) },
      { id: `${sat}-F2`, dir: 'UP', file: '/obc/tables/adcs_gains_v7.bin', bytes: 16_384, cls: 2, done: 0, state: 'WAITING', startedBy: 'Vikram Shetty', utc: iso(-12) },
    ],
    reports: [
      { id: 'SID 1', kind: 'HK', name: 'Power and thermal', enabled: true, rateS: 1 },
      { id: 'SID 2', kind: 'HK', name: 'ADCS', enabled: true, rateS: 1 },
      { id: 'SID 3', kind: 'HK', name: 'Payload status', enabled: false, rateS: 10 },
      { id: 'SID 4', kind: 'HK', name: 'Diagnostic: battery cells', enabled: false, rateS: 5 },
      { id: 'RID 0x101', kind: 'EVENT', name: 'Heater switched', enabled: true, severity: 'INFO' },
      { id: 'RID 0x2A0', kind: 'EVENT', name: 'Wheel over-speed', enabled: true, severity: 'HIGH' },
      { id: 'RID 0x310', kind: 'EVENT', name: 'Memory scrub corrected bit', enabled: false, severity: 'LOW' },
    ],
  };
}

const waiting = new Map<string, { apply: () => void; fail?: (why: string) => void }>();

export const useServicesStore = create<Store>()(persist((set, get) => ({
  sats: {},
  of: (sat) => get().sats[sat] ?? seed(sat),
  patch: (sat, f) => set((s) => { const cur = s.sats[sat] ?? seed(sat); return { sats: { ...s.sats, [sat]: { ...cur, ...f(cur) } } }; }),
  issue: (sat, mnemonic, params, critical, reason, apply, fail) => {
    const { command_id } = useMissionStore.getState().raiseCommand({ sat_id: sat, mnemonic, params, critical, reason, source: 'Spacecraft services' });
    waiting.set(command_id, { apply, fail });
    return command_id;
  },
}), { name: demoKey('services'), storage: demoStorage, partialize: (s) => ({ sats: s.sats }) as unknown as Store }));

// Apply a change when its command completes (the release pipeline moves it, wherever the operator is).
useMissionStore.subscribe((s) => {
  for (const [id, w] of waiting) {
    const c = s.commands.find((x) => x.command_id === id);
    if (!c || !isFinalStatus(c.status)) continue;
    waiting.delete(id);
    if (c.status === 'COMPLETED') w.apply();
    else w.fail?.(c.status === 'REJECTED' ? 'Not approved' : c.status === 'CANCELLED' ? 'Cancelled' : c.note ?? 'Failed on board');
  }
});

// CFDP progress. ponytail: one timer for every satellite; real progress comes from the CFDP entity's indications.
const RATE = 1_200_000; // bytes per second on the simulated link
window.setInterval(() => {
  const st = useServicesStore.getState();
  for (const [sat, sv] of Object.entries(st.sats)) {
    if (!sv.transfers.some((t) => t.state === 'RUNNING')) continue;
    st.patch(sat, (cur) => ({
      transfers: cur.transfers.map((t) => {
        if (t.state !== 'RUNNING') return t;
        const done = Math.min(t.bytes, t.done + RATE * 0.5);
        return { ...t, done, state: done >= t.bytes ? 'COMPLETE' : 'RUNNING', naks: t.cls === 2 && Math.random() < 0.02 ? (t.naks ?? 0) + 1 : t.naks };
      }),
    }));
  }
}, 500);


/** CRC-16/CCITT-FALSE of a file image, as PUS-6 check uses. */
export function crc16(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  let c = 0xffff;
  for (let i = 0; i < b.length; i++) { c ^= b[i] << 8; for (let k = 0; k < 8; k++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff; }
  return `0x${c.toString(16).toUpperCase().padStart(4, '0')}`;
}
