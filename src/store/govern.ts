import { useAuthStore } from './useAuthStore';
import { useMissionStore } from './useMissionStore';

/** Small helpers shared by the governance stores and screens. */

/** Writes one record to the audit ledger as the signed-in person. */
export function recordAudit(mnemonic: string, summary: string, o: { target?: string; result?: 'ACK' | 'NACK' } = {}) {
  const me = useAuthStore.getState().user;
  useMissionStore.getState().appendAudit({
    timestamp_utc: new Date().toISOString(),
    operator_id: me.id, operator_name: me.name,
    sat_id: o.target ?? '—', command_mnemonic: mnemonic,
    procedure_id: '—', procedure_version: '—', sequence_count: 0,
    result: o.result ?? 'ACK', params_summary: summary,
  });
}

/** UTC time; the date is added when it is not today. */
export function utc(iso: string | number, withSeconds = false): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const s = d.toISOString();
  const time = s.slice(11, withSeconds ? 19 : 16);
  return s.slice(0, 10) === new Date().toISOString().slice(0, 10) ? `${time} UTC` : `${s.slice(0, 10)} ${time} UTC`;
}

export const initials = (name: string) => name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

/** Satellite scope patterns: '*' (all), 'AKV-*' (prefix) or an exact id. */
export const inScope = (satId: string, scope: string[]) =>
  scope.some((p) => p === '*' || (p.endsWith('*') ? satId.startsWith(p.slice(0, -1)) : satId === p));
