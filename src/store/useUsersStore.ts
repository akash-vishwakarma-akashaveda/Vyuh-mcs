import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserRole } from '../types';
import { GRANTS, INVITE_ISSUED_MIN, T0 } from '../demo/scenario';
import { demoKey, demoStorage } from '../demo/persist';
import { can } from '../auth/policy';
import { INVITE_KEYS, PEOPLE, useAuthStore } from './useAuthStore';
import { recordAudit } from './govern';

/**
 * Users and access (S25). Every rule lives here, not in the screen, so a control
 * that slips past the UI is still refused:
 *  - only user:manage roles change access;
 *  - a commanding role (grant or invite) waits for a second administrator;
 *  - the requester never approves, and nobody approves a change to their own account;
 *  - nobody suspends themselves; a revoked session stays revoked.
 * ponytail: browser-side store; the server enforces the same rules when the IAM API exists.
 */

export const ALL_ROLES: UserRole[] = [
  'Spacecraft Operator', 'Flight Director', 'Flight Engineer', 'Mission Database Engineer', 'ML Engineer',
  'Mission Planner', 'Ground Station Engineer', 'Security Officer', 'Platform Administrator', 'System Administrator', 'Customer User',
];
/** Roles that can put a command on a spacecraft — straight from the policy table. */
export const isCommanding = (r: UserRole) =>
  can('command:send', r).allowed || can('command:approve', r).allowed || can('procedure:run', r).allowed;

export const SCOPE_OPTIONS = [
  { value: 'AKV-*', label: 'Akashaveda fleet (AKV-*)' },
  { value: 'NBH-*', label: 'Nabhas Agritech (NBH-*)' },
  { value: 'TRA-*', label: 'Terra Analytics (TRA-*)' },
  { value: '*', label: 'All satellites and stations' },
];

export type PersonStatus = 'Active' | 'Invited' | 'Suspended';
export interface Person { id: string; name: string; email: string; roles: UserRole[]; scope: string[]; passkeys: number; status: PersonStatus }
export interface Session { id: string; personId: string; device: string; where: string; since: string; acr: string; revoked?: { by: string; at: string } }
export interface Grant {
  id: string; personId: string; role: UserRole; scope: string[];
  requestedBy: string; requestedAt: string;
  state: 'PENDING' | 'APPROVED' | 'WITHDRAWN' | 'REJECTED'; decidedBy?: string; decidedAt?: string;
  /** Set when the grant is the second-administrator gate on an invite key. */
  keyId?: string;
}
export interface InviteKey {
  id: string; masked: string; personId: string; role: UserRole; scope: string[];
  issuedBy: string; issuedAt: string; expiresAt: string; approvedBy?: string;
  state: 'AWAITING_SECOND' | 'OPEN' | 'REDEEMED' | 'REVOKED';
}

const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString();
/** A time relative to the moment the demo world was seeded. */
const isoT0 = (ms: number) => new Date(T0 + ms).toISOString();
const H = 3_600_000;
const nameOf = (id: string) => PEOPLE.find((p) => p.id === id)?.name ?? id;
const mask = (key: string) => `${key.split('-').slice(0, 2).join('-')}-••••-${key.slice(-4)}`;

const seedPeople = (): Person[] => PEOPLE.map((p) => ({
  id: p.id, name: p.name, email: p.email, roles: p.roles, scope: p.satellite_scope,
  passkeys: p.status === 'PENDING' ? 0 : ['USR-011', 'USR-012', 'USR-008', 'USR-010'].includes(p.id) ? 1 : 2,
  status: p.status === 'PENDING' ? 'Invited' : 'Active',
}));

const seedSessions = (): Session[] => PEOPLE.filter((p) => p.status !== 'PENDING').flatMap((p, i) => {
  const s: Session[] = [{ id: `SES-${4100 + i * 2}`, personId: p.id, device: 'Chrome 128 · macOS', where: 'Bengaluru ops floor', since: isoT0(-(1 + (i % 5)) * H), acr: 'passkey · acr 2' }];
  if (i % 3 === 0) s.push({ id: `SES-${4101 + i * 2}`, personId: p.id, device: 'Firefox 130 · Ubuntu', where: 'VPN 10.20.4.17', since: isoT0(-(6 + i) * H), acr: 'passkey · acr 1' });
  return s;
});

const seedKeys = (): InviteKey[] => Object.entries(INVITE_KEYS).map(([key, k]) => ({
  id: `KEY-${key.slice(-4)}`, masked: mask(key), personId: k.personId, role: k.role, scope: ['AKV-*'],
  issuedBy: PEOPLE.find((p) => p.name === k.issuedBy)?.id ?? k.issuedBy, issuedAt: isoT0(INVITE_ISSUED_MIN * 60_000),
  expiresAt: isoT0(INVITE_ISSUED_MIN * 60_000 + 72 * H), approvedBy: PEOPLE.find((p) => p.name === k.approvedBy)?.id, state: 'OPEN',
}));

const seedGrants = (): Grant[] => GRANTS.map((g) => ({ ...g, scope: [...g.scope] }));

/** A key the person types once at enrolment. Shown once at issue; only the masked form is kept. */
function newKey(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  const c = Array.from(b, (x) => A[x % A.length]).join('');
  return `AKV-INV-${c.slice(0, 4)}-${c.slice(4)}`;
}

/** Returns null when allowed, otherwise the reason (shown next to the control). */
type Result = string | null;

interface UsersStore {
  people: Person[];
  sessions: Session[];
  grants: Grant[];
  keys: InviteKey[];
  requestGrant: (personId: string, role: UserRole, scope: string[]) => Result;
  approveGrant: (id: string) => Result;
  closeGrant: (id: string, how: 'WITHDRAWN' | 'REJECTED') => Result;
  issueInvite: (inv: { name: string; email: string; role: UserRole; scope: string[]; expiresH: number }) => { key?: string; error?: string };
  revokeKey: (id: string) => Result;
  setStatus: (personId: string, status: 'Active' | 'Suspended') => Result;
  revokeSession: (id: string) => Result;
}

const me = () => useAuthStore.getState();
const manage = (): Result => { const d = can('user:manage', me().activeRole); return d.allowed ? null : d.reason ?? 'Not allowed.'; };

/** Why the signed-in person may not approve this grant, or null. Used by the screen and the store. */
export function approveBlock(g: Grant): Result {
  const m = manage(); if (m) return m;
  if (g.state !== 'PENDING') return 'Already decided.';
  if (g.requestedBy === me().user.id) return 'You raised this request, so another administrator must approve it.';
  if (g.personId === me().user.id) return 'Nobody approves a change to their own account.';
  return null;
}

/** People who could approve: active, hold a user:manage role, not the requester, not the person changed. */
export const approversFor = (g: Grant, people: Person[]) =>
  people.filter((p) => p.status === 'Active' && p.id !== g.requestedBy && p.id !== g.personId && p.roles.some((r) => can('user:manage', r).allowed)).map((p) => p.name);

export const useUsersStore = create<UsersStore>()(persist((set, get) => ({
  people: seedPeople(),
  sessions: seedSessions(),
  grants: seedGrants(),
  keys: seedKeys(),

  requestGrant: (personId, role, scope) => {
    const m = manage(); if (m) return m;
    const p = get().people.find((x) => x.id === personId);
    if (!p) return 'Unknown person.';
    if (personId === me().user.id) return 'You cannot change your own account. Ask another administrator.';
    if (p.roles.includes(role)) return `${p.name} already holds ${role}.`;
    if (get().grants.some((g) => g.personId === personId && g.role === role && g.state === 'PENDING')) return 'That grant is already waiting.';
    if (isCommanding(role)) {
      const g: Grant = { id: `GR-${String(108 + get().grants.length).padStart(4, '0')}`, personId, role, scope, requestedBy: me().user.id, requestedAt: iso(0), state: 'PENDING' };
      set((s) => ({ grants: [g, ...s.grants] }));
      recordAudit('ROLE_GRANT_REQUEST', `Requested ${role} for ${p.name} on ${scope.join(', ')}; waiting for a second administrator`, { target: p.name });
    } else {
      set((s) => ({ people: s.people.map((x) => (x.id === personId ? { ...x, roles: [...x.roles, role], scope: [...new Set([...x.scope, ...scope])] } : x)) }));
      recordAudit('ROLE_GRANT', `Granted ${role} to ${p.name} on ${scope.join(', ')}`, { target: p.name });
    }
    return null;
  },

  approveGrant: (id) => {
    const g = get().grants.find((x) => x.id === id);
    if (!g) return 'Unknown request.';
    const block = approveBlock(g); if (block) return block;
    const by = me().user.id;
    set((s) => ({
      grants: s.grants.map((x) => (x.id === id ? { ...x, state: 'APPROVED', decidedBy: by, decidedAt: iso(0) } : x)),
      // An invite's role takes effect when the key is redeemed; a grant takes effect now.
      people: g.keyId ? s.people : s.people.map((x) => (x.id === g.personId ? { ...x, roles: [...new Set([...x.roles, g.role])], scope: [...new Set([...x.scope, ...g.scope])] } : x)),
      keys: s.keys.map((k) => (k.id === g.keyId ? { ...k, state: 'OPEN', approvedBy: by } : k)),
    }));
    recordAudit('ROLE_GRANT', `${g.role} for ${get().people.find((p) => p.id === g.personId)?.name} approved (requested by ${nameOf(g.requestedBy)})`, { target: g.personId });
    return null;
  },

  closeGrant: (id, how) => {
    const g = get().grants.find((x) => x.id === id);
    if (!g || g.state !== 'PENDING') return 'Already decided.';
    const m = manage(); if (m) return m;
    const mine = g.requestedBy === me().user.id;
    if (how === 'WITHDRAWN' && !mine) return 'Only the requester withdraws a request; reject it instead.';
    if (how === 'REJECTED' && mine) return 'Withdraw your own request instead.';
    set((s) => ({
      grants: s.grants.map((x) => (x.id === id ? { ...x, state: how, decidedBy: me().user.id, decidedAt: iso(0) } : x)),
      keys: s.keys.map((k) => (k.id === g.keyId ? { ...k, state: 'REVOKED' } : k)),
    }));
    recordAudit(how === 'WITHDRAWN' ? 'ROLE_GRANT_WITHDRAWN' : 'ROLE_GRANT_REJECTED', `${g.role} for ${get().people.find((p) => p.id === g.personId)?.name} ${how.toLowerCase()}`, { target: g.personId });
    return null;
  },

  issueInvite: ({ name, email, role, scope, expiresH }) => {
    const m = manage(); if (m) return { error: m };
    const e = email.trim().toLowerCase();
    if (get().people.some((p) => p.email.toLowerCase() === e)) return { error: 'Someone with that email already has access.' };
    const key = newKey();
    const personId = `USR-${String(100 + get().people.length)}`;
    const commanding = isCommanding(role);
    const k: InviteKey = {
      id: `KEY-${key.slice(-4)}`, masked: mask(key), personId, role, scope, issuedBy: me().user.id,
      issuedAt: iso(0), expiresAt: iso(expiresH * H), state: commanding ? 'AWAITING_SECOND' : 'OPEN',
    };
    set((s) => ({
      people: [...s.people, { id: personId, name: name.trim(), email: e, roles: [role], scope, passkeys: 0, status: 'Invited' }],
      keys: [k, ...s.keys],
      grants: commanding ? [{ id: `GR-${String(108 + s.grants.length).padStart(4, '0')}`, personId, role, scope, requestedBy: me().user.id, requestedAt: iso(0), state: 'PENDING', keyId: k.id }, ...s.grants] : s.grants,
    }));
    recordAudit('INVITE_KEY_ISSUED', `Invite key ${k.masked} for ${name.trim()} <${e}> as ${role} on ${scope.join(', ')}, expires in ${expiresH} h${commanding ? '; waiting for a second administrator' : ''}`, { target: personId });
    return { key };
  },

  revokeKey: (id) => {
    const m = manage(); if (m) return m;
    const k = get().keys.find((x) => x.id === id);
    if (!k || (k.state !== 'OPEN' && k.state !== 'AWAITING_SECOND')) return 'This key is no longer open.';
    set((s) => ({
      keys: s.keys.map((x) => (x.id === id ? { ...x, state: 'REVOKED' } : x)),
      grants: s.grants.map((g) => (g.keyId === id && g.state === 'PENDING' ? { ...g, state: 'WITHDRAWN', decidedBy: me().user.id, decidedAt: iso(0) } : g)),
    }));
    recordAudit('INVITE_KEY_REVOKED', `Invite key ${k.masked} revoked`, { target: k.personId });
    return null;
  },

  setStatus: (personId, status) => {
    const m = manage(); if (m) return m;
    if (personId === me().user.id) return 'You cannot suspend or reactivate your own account.';
    const p = get().people.find((x) => x.id === personId);
    if (!p) return 'Unknown person.';
    const now = iso(0), by = me().user.name;
    set((s) => ({
      people: s.people.map((x) => (x.id === personId ? { ...x, status } : x)),
      // Suspending ends every session at once.
      sessions: status === 'Suspended' ? s.sessions.map((x) => (x.personId === personId && !x.revoked ? { ...x, revoked: { by, at: now } } : x)) : s.sessions,
    }));
    recordAudit(status === 'Suspended' ? 'USER_SUSPEND' : 'USER_REACTIVATE', `${p.name} ${status === 'Suspended' ? 'suspended; all sessions revoked' : 'reactivated'}`, { target: personId });
    return null;
  },

  revokeSession: (id) => {
    const m = manage(); if (m) return m;
    const s0 = get().sessions.find((x) => x.id === id);
    if (!s0 || s0.revoked) return 'Already revoked.';
    set((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? { ...x, revoked: { by: me().user.name, at: iso(0) } } : x)) }));
    recordAudit('SESSION_REVOKE', `Session ${id} (${s0.device}) revoked for ${get().people.find((p) => p.id === s0.personId)?.name}`, { target: s0.personId });
    return null;
  },
}), { name: demoKey('users'), storage: demoStorage, partialize: (s) => ({ people: s.people, sessions: s.sessions, grants: s.grants, keys: s.keys }) as unknown as UsersStore }));
