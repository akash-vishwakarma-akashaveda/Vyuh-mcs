/**
 * Shared by the commanding and pass screens: live interlocks, contact state, who approves,
 * the command lifecycle track, URL params and role-aware links. One place, so the console,
 * the approvals desk and the procedure runner judge a command the same way.
 */
import React, { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { FLEET, STATIONS } from '../../data/fleet';
import { COMMAND_DICT } from '../../ops/commandDict';
import { canOpenRoute, whoCanOpen } from '../../auth/policy';
import { PEOPLE, useAuthStore } from '../../store/useAuthStore';
import { useFleetStore } from '../../store/useFleetStore';
import { useSimulatorStore } from '../../store/useSimulatorStore';
import type { CommandRecord, MissionApproval } from '../../store/useMissionStore';
import { satElements } from '../../orbit/fleetOrbit';
import { passes } from '../../orbit/orbit';
import { isStale } from '../../utils/stalenessUtils';
import { parseHash, toHash } from '../../router/routes';
import type { Approval } from '../../types';

// ---- time ----------------------------------------------------------------------------

/** Re-renders every `ms` so countdowns and arcs move. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

/** 372 s -> "6:12"; 4000 s -> "1:06:40". Negative clamps to 0. */
export function mmss(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

/** "09:42:10" for today, "3 Oct 09:42" otherwise. Always UTC. */
export function utc(iso: string | number | undefined, seconds = true): string {
  if (iso === undefined || iso === '') return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const t = d.toISOString().slice(11, seconds ? 19 : 16);
  const today = new Date().toISOString().slice(0, 10) === d.toISOString().slice(0, 10);
  return today ? t : `${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })} ${t}`;
}

export const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

export const paramText = (p: Record<string, string | number>) => Object.entries(p).map(([k, v]) => `${k}=${v}`).join(' ');

// ---- URL ------------------------------------------------------------------------------

/** The current hash route's query, kept in sync with navigation. */
export function useHashParams(): Record<string, string> {
  const [p, setP] = useState(() => parseHash().params);
  useEffect(() => {
    const on = () => setP(parseHash().params);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return p;
}

/** Change some params of the current route (replaces history so Back still leaves the screen). */
export function setHashParams(patch: Record<string, string | undefined>) {
  const { route, params } = parseHash();
  const next = { ...params, ...patch };
  for (const k of Object.keys(next)) if (next[k] === undefined || next[k] === '') delete next[k];
  window.history.replaceState(null, '', toHash(route, next as Record<string, string>));
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export const isSat = (id: string | undefined): id is string => !!id && FLEET.some((s) => s.sat_id === id);

// ---- role-aware links -------------------------------------------------------------------

/**
 * A link to another screen if this role may open it, otherwise plain muted text naming who can.
 * `as="button"` renders a secondary button instead of a text link.
 */
export const RouteLink: React.FC<{
  to: string; onNavigate: (to: string) => void; children: React.ReactNode; as?: 'link' | 'button'; className?: string;
}> = ({ to, onNavigate, children, as = 'link', className }) => {
  const role = useAuthStore((s) => s.activeRole);
  if (!canOpenRoute(to, role)) return <span className={clsx('text-[12.5px] text-[#7C8594]', className)}>Handled by {whoCanOpen(to)}</span>;
  return (
    <button type="button" onClick={() => onNavigate(to)}
      className={clsx(as === 'button'
        ? 'h-8 px-3 rounded-[10px] bg-[#171B24] border border-[#232936] text-[12.5px] text-[#E9ECF1] hover:bg-[#1D222D] whitespace-nowrap'
        : 'text-[13px] text-[#F2A65A] hover:text-[#FFC48A] text-left', className)}>
      {children}
    </button>
  );
};

// ---- contact ----------------------------------------------------------------------------

export interface Contact { inContact: boolean; station?: string; aos?: number; los?: number; nextAos?: number; nextStation?: string }

/**
 * Contact from the fleet's contact windows; when a satellite has none left (its scripted demo
 * window is over), from orbit geometry over its assigned stations.
 */
export function contactOf(satId: string, now = Date.now()): Contact {
  const windows = useFleetStore.getState().contactWindows.filter((w) => w.sat_id === satId);
  const cur = windows.find((w) => Date.parse(w.aos_utc) <= now && Date.parse(w.los_utc) > now);
  const next = windows.filter((w) => Date.parse(w.aos_utc) > now).sort((a, b) => Date.parse(a.aos_utc) - Date.parse(b.aos_utc))[0];
  if (cur || next) {
    return {
      inContact: !!cur, station: cur?.ground_station, aos: cur ? Date.parse(cur.aos_utc) : undefined, los: cur ? Date.parse(cur.los_utc) : undefined,
      nextAos: next ? Date.parse(next.aos_utc) : undefined, nextStation: next?.ground_station,
    };
  }
  return geometricContact(satId, now);
}

const geoCache = new Map<string, { at: number; c: Contact }>();
function geometricContact(satId: string, now: number): Contact {
  const hit = geoCache.get(satId);
  if (hit && now - hit.at < 30_000 && (!hit.c.los || hit.c.los > now)) return hit.c;
  const sat = FLEET.find((s) => s.sat_id === satId);
  let best: Contact = { inContact: false };
  if (sat) {
    const el = satElements(sat);
    for (const id of sat.assigned_ground_stations) {
      const st = STATIONS.find((s) => s.id === id);
      if (!st) continue;
      for (const p of passes(el, st, now - 20 * 60_000, 12 * 3600_000, 10, 30_000)) {
        if (p.aos <= now && p.los > now) best = { ...best, inContact: true, station: id, aos: p.aos, los: p.los };
        else if (p.aos > now && (!best.nextAos || p.aos < best.nextAos)) best = { ...best, nextAos: p.aos, nextStation: id };
      }
    }
  }
  geoCache.set(satId, { at: now, c: best });
  return best;
}

// ---- interlocks -------------------------------------------------------------------------

export type Gate = 'pass' | 'fail' | 'warn' | 'pending';
export interface InterlockRow { param: string; value: string; rule: string; pass: boolean }

/** Live interlock rows for a command on a satellite. Stale telemetry fails closed. */
export function interlocksFor(mnemonic: string, satId: string, now = Date.now()): InterlockRow[] {
  const def = COMMAND_DICT.find((c) => c.mnemonic === mnemonic);
  const cvt = useFleetStore.getState().cvt[satId] ?? {};
  const stale = useSimulatorStore.getState().staleInterlock;
  const read = (param: string, op: '<' | '>', limit: number, unit: string, digits: number): InterlockRow => {
    const p = cvt[param];
    const rule = `${op} ${limit} ${unit}`.trim();
    // The Simulator's "stale interlock telemetry" fault makes every interlock read stale: gates fail closed.
    if (!p || isStale(p) || stale) return { param, value: p ? `${p.eu_value.toFixed(digits)} ${unit} (stale)` : 'no data', rule, pass: false };
    const v = p.eu_value;
    return { param, value: `${v.toFixed(digits)} ${unit}`.trim(), rule, pass: op === '<' ? v < limit : v > limit };
  };
  switch (def?.interlock) {
    case 'BAT_TEMP': {
      const rows = [read('BAT_TEMP', '<', 10, '°C', 1)];
      if (cvt.HTR_B_STATE) rows.push({ param: 'HTR_B_STATE', value: cvt.HTR_B_STATE.eu_value >= 1 ? '1 (on)' : '0 (off)', rule: 'reported', pass: !stale && !isStale(cvt.HTR_B_STATE) });
      return rows;
    }
    case 'ATT_ERR': return [read('ATT_ERR', '<', 0.08, '°', 3)];
    case 'CONTACT': {
      const c = contactOf(satId, now);
      return [{ param: 'LINK', value: c.inContact ? `${c.station} locked` : 'no contact', rule: 'in contact', pass: c.inContact }];
    }
    default: return [];
  }
}

/** Snapshot stored with an approval request (C-07 evidence). */
export const snapshot = (mnemonic: string, satId: string): Approval['interlocks'] => interlocksFor(mnemonic, satId);

// ---- people -----------------------------------------------------------------------------

/** Flight Directors who could approve a request by `requester`: never the requester. */
export const approversFor = (requester: string) =>
  PEOPLE.filter((p) => p.status === 'ACTIVE' && p.roles.includes('Flight Director') && p.name !== requester).map((p) => p.name);

export const orList = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`);

// ---- lifecycle track ----------------------------------------------------------------------

export const LIFECYCLE = ['Requested', 'Approved', 'Queued', 'Sent', 'Acknowledged', 'Accepted', 'Completed'] as const;

/** How far a command got (index of the current step) and whether it stopped there. */
export function lifecycleOf(c: CommandRecord): { done: number; failed: boolean; skippedApproval: boolean } {
  const skippedApproval = !c.critical;
  const failed = c.status === 'FAILED' || c.status === 'REJECTED' || c.status === 'CANCELLED';
  const reached =
    c.status === 'COMPLETED' ? 7
    : c.status === 'STARTED' ? 6
    : c.status === 'ACCEPTED' ? 5
    : c.status === 'RELEASED' ? (c.radiated ? 4 : 2)
    : 1; // DRAFT, AWAITING_APPROVAL
  if (!failed) return { done: reached, failed, skippedApproval };
  // where it stopped
  const at = c.status === 'REJECTED' || (c.status === 'CANCELLED' && !c.approved_by && c.critical) ? 1 : c.radiated ? 4 : 2;
  return { done: at, failed, skippedApproval };
}

export const LifecycleTrack: React.FC<{ c: CommandRecord }> = ({ c }) => {
  const { done, failed, skippedApproval } = lifecycleOf(c);
  return (
    <span className="flex gap-[3px] flex-wrap" aria-label={`${LIFECYCLE[Math.min(done, 6)]}${failed ? ', stopped' : ''}`}>
      {LIFECYCLE.map((n, i) => {
        const isDone = i < done || (i === 1 && skippedApproval && done > 1);
        const cur = i === done && done < 7;
        return (
          <span key={n} className="rounded-full px-[9px] py-[3px] text-[11.5px] whitespace-nowrap"
            style={{
              background: isDone ? 'rgba(74,222,154,0.12)' : cur ? (failed ? 'rgba(255,107,107,0.15)' : 'rgba(242,140,40,0.14)') : '#1A1E27',
              color: isDone ? '#4ADE9A' : cur ? (failed ? '#FF7A7A' : '#F2A65A') : '#6B7383',
            }}>
            {i === 1 && skippedApproval ? 'No approval needed' : n}
          </span>
        );
      })}
    </span>
  );
};

/** Pending approvals that have run past their expiry are shown as expired even between sweeps. */
export const effectiveState = (a: MissionApproval, now = Date.now()) =>
  a.state === 'PENDING' && Date.parse(a.expires_utc) <= now ? 'EXPIRED' : a.withdrawn ? 'WITHDRAWN' : a.state;

export const field = 'h-10 rounded-[10px] bg-[#161A22] border border-[#232936] px-3 text-[13.5px] text-[#E9ECF1] outline-none focus:border-[#6CB8FF]';
