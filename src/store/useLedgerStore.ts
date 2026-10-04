import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuditRecord } from '../types';
import { demoKey, demoStorage } from '../demo/persist';
import { useMissionStore } from './useMissionStore';

/**
 * Audit ledger verification (S26).
 *
 * Two checks per record, walked oldest to newest:
 *  1. link: prev_record_sha256 equals the previous record's hash (catches a deleted,
 *     inserted or reordered record, or a rewritten hash);
 *  2. content: a SHA-256 seal of every field, taken by this console when the record
 *     arrived, still matches (catches an edited field).
 * ponytail: the seal is a browser-side witness; when the ledger API exists, compare
 * against the server's anchored digest instead of a seal taken here.
 */

export const GENESIS = '0'.repeat(64);
const FIELDS: (keyof AuditRecord)[] = [
  'record_id', 'timestamp_utc', 'operator_id', 'operator_name', 'sat_id', 'command_mnemonic', 'procedure_id',
  'procedure_version', 'sequence_count', 'result', 'params_summary', 'prev_record_sha256', 'bytes_sha256',
];

export async function digest(r: AuditRecord): Promise<string> {
  const text = JSON.stringify(FIELDS.map((f) => r[f]));
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const buf = await subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Insecure origin (plain http on a LAN address): no WebCrypto. Still a deterministic digest.
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return `fnv-${h.toString(16)}`;
}

export interface Problem { record_id: string; reason: string }

/** Pure walk over a newest-first ledger. */
export async function walk(newestFirst: AuditRecord[], seals: Record<string, string>): Promise<{ checked: number; problems: Problem[] }> {
  const problems: Problem[] = [];
  let prev = GENESIS;
  for (const r of [...newestFirst].reverse()) {
    if (r.prev_record_sha256 !== prev) problems.push({ record_id: r.record_id, reason: 'Does not link to the record before it (a record was removed, inserted or reordered).' });
    const seal = seals[r.record_id];
    if (seal && seal !== (await digest(r))) problems.push({ record_id: r.record_id, reason: 'Its content changed after it was written.' });
    prev = r.bytes_sha256;
  }
  return { checked: newestFirst.length, problems };
}

export interface Verification { state: 'RUNNING' | 'INTACT' | 'BROKEN'; checked: number; problems: Problem[]; by: string; at: string; first?: string; last?: string; headId?: string }
export interface AuditFilters { from: string; to: string; actor: string; kind: string }

interface LedgerStore {
  seals: Record<string, string>;
  verification: Verification | null;
  filters: AuditFilters;
  setFilters: (f: Partial<AuditFilters>) => void;
  verify: (by: string) => Promise<Verification>;
}

const today = () => new Date().toISOString().slice(0, 10);

export const useLedgerStore = create<LedgerStore>()(persist((set, get) => ({
  seals: {},
  verification: null,
  filters: { from: new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10), to: today(), actor: '', kind: '' },
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
  verify: async (by) => {
    set({ verification: { state: 'RUNNING', checked: 0, problems: [], by, at: new Date().toISOString() } });
    await sealNew();
    const audit = useMissionStore.getState().audit;
    const { checked, problems } = await walk(audit, get().seals);
    const v: Verification = {
      state: problems.length ? 'BROKEN' : 'INTACT', checked, problems, by, at: new Date().toISOString(),
      first: audit[audit.length - 1]?.timestamp_utc, last: audit[0]?.timestamp_utc, headId: audit[0]?.record_id,
    };
    set({ verification: v });
    return v;
  },
  // The content seals are the witness: they persist with the ledger they sealed.
}), { name: demoKey('ledger'), storage: demoStorage, partialize: (s) => ({ seals: s.seals }) as unknown as LedgerStore }));

/** Seals every record not yet sealed. Records are sealed once, when first seen. */
let sealing: Promise<void> = Promise.resolve();
function sealNew() {
  sealing = sealing.then(async () => {
    const { seals } = useLedgerStore.getState();
    const fresh = useMissionStore.getState().audit.filter((r) => !seals[r.record_id]);
    if (!fresh.length) return;
    const add: Record<string, string> = {};
    for (const r of fresh) add[r.record_id] = await digest(r);
    useLedgerStore.setState((s) => ({ seals: { ...add, ...s.seals } }));
  });
  return sealing;
}
sealNew();
useMissionStore.subscribe((s, p) => {
  if (s.audit === p.audit) return;
  // A demo reset reseeds the ledger under the same record ids: start a fresh witness.
  if (s.audit.length < p.audit.length) useLedgerStore.setState({ seals: {}, verification: null });
  sealNew();
});

/** What kind of event a ledger record is, from its mnemonic. */
export function kindOf(mnemonic: string): string {
  if (/^(ROLE|INVITE|USER|SESSION|ACCESS|SIGN)/.test(mnemonic)) return 'Access';
  if (/^(KEY|SDLS|OTAR)/.test(mnemonic)) return 'Keys';
  if (/^(ONCALL|PAGE|ROUTING)/.test(mnemonic)) return 'On-call';
  if (/^(DRILL|DEPLOY|PLATFORM)/.test(mnemonic)) return 'Platform';
  if (/^(LEDGER|AUDIT)/.test(mnemonic)) return 'Audit';
  if (/^ALARM/.test(mnemonic)) return 'Alarm';
  if (/^(SCENARIO|SIM)/.test(mnemonic)) return 'Simulator';
  if (/^(MDB|DICT)/.test(mnemonic)) return 'Mission database';
  if (/^(ADVISORY|ANOMALY|MODEL)/.test(mnemonic)) return 'Advisory';
  return 'Command';
}

/** CSV with every field quoted; formula-leading cells are defused for spreadsheet safety. */
export function toCsv(rows: AuditRecord[]): string {
  const cols: (keyof AuditRecord | 'kind')[] = ['record_id', 'timestamp_utc', 'kind', ...FIELDS.filter((f) => f !== 'record_id' && f !== 'timestamp_utc')];
  const q = (v: unknown) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = rows.map((r) => cols.map((c) => q(c === 'kind' ? kindOf(r.command_mnemonic) : r[c])).join(','));
  return [cols.join(','), ...lines].join('\r\n');
}
