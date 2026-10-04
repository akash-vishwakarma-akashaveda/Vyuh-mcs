import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { TENANTS } from '../data/fleet';
import { SESSIONS, T0 } from '../demo/scenario';
import { demoKey, demoStorage } from '../demo/persist';
import { seeded } from '../ops/history';

/**
 * Payload sessions (downlink → chunks verified → merged → L0 → delivered), the products customers
 * download, and each tenant's API key and webhook. Stage is derived from timestamps, so sessions move
 * on with the clock without timers and a retry or a delivery survives navigation.
 *
 * ponytail: the bulk payload pipeline has no backend yet; sessions, products and webhook calls are
 * sample data shown with a SampleTag.
 */
export type Stage = 'RECEIVING' | 'CHECKSUM_FAILED' | 'MERGING' | 'L0_READY' | 'DELIVERED';

export interface Session {
  id: string;
  sat: string;
  station: string;
  tenant: string;
  requestId?: string;
  sizeMb: number;
  chunksTotal: number;
  startedAt: number;
  recvDoneAt: number;
  mergeDoneAt: number;
  failedChunks: number[];
  retries: { at: number; by: string; chunks: number[] }[];
  deliveredAt?: number;
  deliveredBy?: string;
  productId?: string;
}

export interface Product { id: string; sessionId: string; requestId?: string; tenant: string; sat: string; sizeMb: number; sha256: string; createdAt: number }
export interface TenantApi { clientId: string; secretLast4: string; rotatedAt: number; rotatedBy: string; webhook: string; calls: { at: number; event: string; url: string; status: string }[] }

export const hex = (key: string, n = 64) => { const r = seeded(key); return Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(r() * 16)]).join(''); };

export function stageOf(s: Session, now = Date.now()): Stage {
  if (s.deliveredAt) return 'DELIVERED';
  if (now < s.recvDoneAt) return 'RECEIVING';
  if (s.failedChunks.length) return 'CHECKSUM_FAILED';
  if (now < s.mergeDoneAt) return 'MERGING';
  return 'L0_READY';
}

export function chunksIn(s: Session, now = Date.now()) {
  if (now >= s.recvDoneAt) return s.chunksTotal - s.failedChunks.length;
  return Math.floor(((now - s.startedAt) / Math.max(1, s.recvDoneAt - s.startedAt)) * s.chunksTotal);
}

/** Payload sessions of the demo scenario, each on one of its passes. */
const seedSessions = (): Session[] => SESSIONS.map((x) => ({ ...x, failedChunks: [...x.failedChunks], retries: [] }));

const seedProducts = (sessions: Session[]): Product[] => sessions.filter((s) => s.productId).map((s) => ({
  id: s.productId!, sessionId: s.id, requestId: s.requestId, tenant: s.tenant, sat: s.sat, sizeMb: s.sizeMb, sha256: hex(s.id), createdAt: s.deliveredAt!,
}));

interface DeliveryStore {
  sessions: Session[];
  products: Product[];
  api: Record<string, TenantApi>;
  addSession: (s: Session) => void;
  retry: (id: string, by: string) => void;
  deliver: (id: string, by: string) => Product | null;
  rotateSecret: (tenant: string, by: string) => string;
  setWebhook: (tenant: string, url: string) => void;
}

const t0 = T0;
const sessions0 = seedSessions();
const slug = (t: string) => t.toLowerCase().split(' ')[0];

export const useDeliveryStore = create<DeliveryStore>()(persist((set, get) => ({
  sessions: sessions0,
  products: seedProducts(sessions0),
  api: Object.fromEntries(TENANTS.map((t) => [t, { clientId: `${slug(t)}-prod-01`, secretLast4: hex(t, 4), rotatedAt: t0 - 40 * 86400_000, rotatedBy: 'Onboarding', webhook: `https://hooks.${slug(t)}.example/l0-ready`, calls: [] }])),

  addSession: (s) => set((st) => ({ sessions: [s, ...st.sessions] })),

  retry: (id, by) => set((st) => ({
    sessions: st.sessions.map((s) => (s.id === id ? { ...s, retries: [...s.retries, { at: Date.now(), by, chunks: s.failedChunks }], failedChunks: [], mergeDoneAt: Date.now() + 6000 } : s)),
  })),

  deliver: (id, by) => {
    const s = get().sessions.find((x) => x.id === id);
    if (!s || stageOf(s) !== 'L0_READY') return null;
    const now = Date.now();
    const p: Product = { id: `PRD-${s.id.slice(3)}`, sessionId: s.id, requestId: s.requestId, tenant: s.tenant, sat: s.sat, sizeMb: s.sizeMb, sha256: hex(s.id), createdAt: now };
    const api = get().api[s.tenant];
    set((st) => ({
      sessions: st.sessions.map((x) => (x.id === id ? { ...x, deliveredAt: now, deliveredBy: by, productId: p.id } : x)),
      products: [p, ...st.products],
      api: api ? { ...st.api, [s.tenant]: { ...api, calls: [{ at: now, event: 'product.delivered', url: api.webhook, status: '202 (sample)' }, ...api.calls].slice(0, 20) } } : st.api,
    }));
    return p;
  },

  rotateSecret: (tenant, by) => {
    const secret = `sk_live_${hex(`${tenant}:${Date.now()}:${Math.random()}`, 32)}`;
    set((st) => ({ api: { ...st.api, [tenant]: { ...st.api[tenant], secretLast4: secret.slice(-4), rotatedAt: Date.now(), rotatedBy: by } } }));
    return secret;
  },

  setWebhook: (tenant, url) => set((st) => ({ api: { ...st.api, [tenant]: { ...st.api[tenant], webhook: url } } })),
}), { name: demoKey('deliveries'), storage: demoStorage }));

/** A small, real file for a product: a GeoJSON manifest (the L0 data itself is not in the browser). */
export function productManifest(p: Product, target?: { name: string; lat: number; lon: number }): Blob {
  const body = {
    type: 'Feature',
    geometry: target ? { type: 'Point', coordinates: [target.lon, target.lat] } : null,
    properties: {
      sample: true,
      note: 'SAMPLE manifest generated by the VYUH console. The bulk payload pipeline is not connected yet.',
      product_id: p.id, session_id: p.sessionId, request_id: p.requestId ?? null, tenant: p.tenant, satellite: p.sat,
      level: 'L0', size_bytes: p.sizeMb * 1048576, sha256: p.sha256, created_utc: new Date(p.createdAt).toISOString(), target: target?.name ?? null,
    },
  };
  return new Blob([JSON.stringify(body, null, 2)], { type: 'application/geo+json' });
}

/** Save a blob as a file. */
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
