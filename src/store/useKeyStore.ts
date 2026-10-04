import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { KEY_REQUESTS, T0 } from '../demo/scenario';
import { demoKey, demoStorage } from '../demo/persist';
import satellites from '../../config/satellites.json';
import { can } from '../auth/policy';
import { useAuthStore } from './useAuthStore';
import { recordAudit } from './govern';

/**
 * Link security and keys (S33): CCSDS SDLS (355.0) security associations per
 * satellite, the key inventory, rotation and OTAR (355.1) rekey requests.
 * Every key change is a request that a second person applies; the requester
 * never approves their own. All changes go to the audit ledger.
 * ponytail: browser-side store with software keys; replace with the Key Management
 * service and an HSM (PKCS#11) when they exist.
 */

export type SdlsMode = 'AUTH' | 'AUTH_ENC';
export interface SecurityAssociation { satId: string; spi: number; vcid: number; mode: SdlsMode; algorithm: 'AES-256-GCM'; arsnWindow: number }
export interface Key { keyId: string; satId: string; type: 'MASTER' | 'SESSION'; state: 'ACTIVE' | 'PRE_ACTIVE' | 'DEACTIVATED' | 'COMPROMISED'; created: string; expires: string }
export interface KeyRequest {
  id: string; kind: 'OTAR' | 'REVOKE' | 'CONFIG'; satId: string; keyId?: string; detail: string;
  patch?: Partial<Pick<SecurityAssociation, 'mode' | 'arsnWindow'>>;
  requestedBy: string; requestedByName: string; at: string;
  state: 'PENDING' | 'APPLIED' | 'WITHDRAWN' | 'REJECTED'; decidedBy?: string; decidedAt?: string;
}

export const SESSION_DAYS = 30;
export const MASTER_DAYS = 365;
export const KEY_SATS: string[] = satellites.map((s) => s.sat_id);
const DAY = 86_400_000;
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
const isoT0 = (ms: number) => new Date(T0 + ms).toISOString();

const seedSa = (): SecurityAssociation[] => KEY_SATS.map((satId, i) => ({
  satId, spi: 100 + i, vcid: 0, mode: satId.startsWith('NBH') || satId.startsWith('OPSSAT') ? 'AUTH' : 'AUTH_ENC', algorithm: 'AES-256-GCM',
  // an applied configuration request in the scenario already changed this association
  arsnWindow: KEY_REQUESTS.find((r) => r.state === 'APPLIED' && r.satId === satId && r.patch)?.patch?.arsnWindow ?? 64,
}));

const seedKeys = (): Key[] => KEY_SATS.flatMap((satId, i) => {
  const age = 3 + ((i * 7) % 27); // days since the current session key was made
  return [
    { keyId: `MK-${satId}-01`, satId, type: 'MASTER', state: 'ACTIVE', created: isoT0(-(200 + i) * DAY), expires: isoT0((MASTER_DAYS - 200 - i) * DAY) },
    { keyId: `SK-${satId}-${String(12 - (i % 3)).padStart(3, '0')}`, satId, type: 'SESSION', state: 'ACTIVE', created: isoT0(-age * DAY), expires: isoT0((SESSION_DAYS - age) * DAY) },
    { keyId: `SK-${satId}-${String(11 - (i % 3)).padStart(3, '0')}`, satId, type: 'SESSION', state: 'DEACTIVATED', created: isoT0(-(age + SESSION_DAYS) * DAY), expires: isoT0(-age * DAY) },
  ];
});

const seedRequests = (): KeyRequest[] => KEY_REQUESTS.map((r) => ({ ...r }));

const me = () => useAuthStore.getState();
/** Same roles as access management (Security Officer, Platform and System Administrator). */
export const keyGate = () => { const d = can('user:manage', me().activeRole); return d.allowed ? null : (d.reason ?? 'Not allowed.').replace('cannot do this', 'cannot change link keys'); };
export const approveKeyBlock = (r: KeyRequest) =>
  keyGate() ?? (r.state !== 'PENDING' ? 'Already decided.' : r.requestedBy === me().user.id ? 'You raised this request, so a second person must apply it.' : null);

interface KeyStore {
  sa: SecurityAssociation[];
  keys: Key[];
  requests: KeyRequest[];
  request: (r: Pick<KeyRequest, 'kind' | 'satId' | 'keyId' | 'detail' | 'patch'>) => string | null;
  approve: (id: string) => string | null;
  close: (id: string, how: 'WITHDRAWN' | 'REJECTED') => string | null;
}

export const useKeyStore = create<KeyStore>()(persist((set, get) => ({
  sa: seedSa(),
  keys: seedKeys(),
  requests: seedRequests(),

  request: (r) => {
    const g = keyGate(); if (g) return g;
    if (get().requests.some((x) => x.state === 'PENDING' && x.satId === r.satId && x.kind === r.kind)) return `A ${r.kind === 'OTAR' ? 'rekey' : r.kind === 'REVOKE' ? 'revocation' : 'configuration change'} for ${r.satId} is already waiting.`;
    const req: KeyRequest = { ...r, id: `KR-${String(40 + get().requests.length).padStart(4, '0')}`, requestedBy: me().user.id, requestedByName: me().user.name, at: iso(0), state: 'PENDING' };
    set((s) => ({ requests: [req, ...s.requests] }));
    recordAudit(`KEY_${r.kind}_REQUEST`, `${req.id}: ${r.detail}; waiting for a second person`, { target: r.satId });
    return null;
  },

  approve: (id) => {
    const r = get().requests.find((x) => x.id === id);
    if (!r) return 'Unknown request.';
    const block = approveKeyBlock(r); if (block) return block;
    const by = me().user.name, now = iso(0);
    set((s) => {
      let keys = s.keys, sa = s.sa;
      if (r.kind === 'OTAR') {
        const n = s.keys.filter((k) => k.satId === r.satId && k.type === 'SESSION').length + 10;
        keys = [
          { keyId: `SK-${r.satId}-${String(n).padStart(3, '0')}`, satId: r.satId, type: 'SESSION', state: 'ACTIVE', created: now, expires: iso(SESSION_DAYS * DAY) },
          ...s.keys.map((k) => (k.satId === r.satId && k.type === 'SESSION' && k.state === 'ACTIVE' ? { ...k, state: 'DEACTIVATED' as const } : k)),
        ];
      } else if (r.kind === 'REVOKE') {
        keys = s.keys.map((k) => (k.keyId === r.keyId ? { ...k, state: 'COMPROMISED' as const } : k));
      } else if (r.patch) {
        sa = s.sa.map((x) => (x.satId === r.satId ? { ...x, ...r.patch } : x));
      }
      return { keys, sa, requests: s.requests.map((x) => (x.id === id ? { ...x, state: 'APPLIED', decidedBy: by, decidedAt: now } : x)) };
    });
    recordAudit(`KEY_${r.kind}`, `${r.id} applied: ${r.detail} (requested by ${r.requestedByName})`, { target: r.satId });
    return null;
  },

  close: (id, how) => {
    const r = get().requests.find((x) => x.id === id);
    if (!r || r.state !== 'PENDING') return 'Already decided.';
    const g = keyGate(); if (g) return g;
    const mine = r.requestedBy === me().user.id;
    if (how === 'WITHDRAWN' && !mine) return 'Only the requester withdraws; reject it instead.';
    if (how === 'REJECTED' && mine) return 'Withdraw your own request instead.';
    set((s) => ({ requests: s.requests.map((x) => (x.id === id ? { ...x, state: how, decidedBy: me().user.name, decidedAt: iso(0) } : x)) }));
    recordAudit(`KEY_${r.kind}_${how}`, `${r.id} ${how.toLowerCase()}: ${r.detail}`, { target: r.satId, result: 'NACK' });
    return null;
  },
}), { name: demoKey('keys'), storage: demoStorage, partialize: (s) => ({ sa: s.sa, keys: s.keys, requests: s.requests }) as unknown as KeyStore }));
