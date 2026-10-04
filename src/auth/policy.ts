import { UserRole } from '../types';
import { CUSTOMER_ROUTES, SCREENS, ScreenSpec } from '../data/screens';

const SCREEN_LOOKUP = () => SCREENS;

/**
 * Capability policy for the console.
 *
 * This decides what the UI *offers*, never what the system *permits*: the product
 * re-checks every one of these server-side through OPA (NFR-06). A hidden button is
 * a courtesy to the operator, not a control.
 */

export type Action =
  | 'telemetry:read'
  | 'alarm:ack'
  | 'alarm:shelve'
  | 'command:send'          // routine commands
  | 'command:request'       // ask for a critical command
  | 'command:approve'       // second person
  | 'procedure:run'
  | 'procedure:author'
  | 'plan:edit'
  | 'booking:edit'
  | 'mdb:edit'
  | 'mdb:release'
  | 'model:promote'
  | 'sim:run'
  | 'user:manage'
  | 'audit:verify'
  | 'platform:admin'
  | 'tasking:submit';

const OPERATIONAL: UserRole[] = [
  'Flight Director', 'Spacecraft Operator', 'Flight Engineer', 'Mission Planner',
  'Ground Station Engineer', 'Mission Database Engineer', 'ML Engineer',
  'Security Officer', 'Platform Administrator', 'System Administrator',
];

/**
 * The administrator can reach every screen and change the platform, but cannot
 * command a spacecraft, approve a command or work an alarm. Q-14 says one stolen
 * credential must never be enough to command — an account that can do everything
 * is exactly that credential. An admin who needs to operate is granted an
 * operational role by a second administrator, and the grant is audited.
 */
const ADMIN: UserRole = 'System Administrator';

/**
 * Nobody both sends critical commands and approves them. The Flight Director may
 * send routine commands, but a critical one they raise is still approved by
 * somebody else — the two-person rule binds to the person, not the role.
 */
export const MATRIX: Record<Action, UserRole[]> = {
  'telemetry:read':   [...OPERATIONAL, 'Customer User'],
  'alarm:ack':        ['Spacecraft Operator', 'Flight Director'],
  'alarm:shelve':     ['Spacecraft Operator', 'Flight Director'],
  'command:send':     ['Spacecraft Operator', 'Flight Director'],
  'command:request':  ['Spacecraft Operator', 'Flight Director'],
  'command:approve':  ['Flight Director'],
  'procedure:run':    ['Spacecraft Operator', 'Flight Director'],
  'procedure:author': ['Flight Engineer'],
  'plan:edit':        ['Mission Planner'],
  'booking:edit':     ['Mission Planner', 'Ground Station Engineer'],
  'mdb:edit':         ['Mission Database Engineer'],
  'mdb:release':      ['Mission Database Engineer'],
  'model:promote':    ['ML Engineer'],
  'sim:run':          ['Flight Engineer', 'Spacecraft Operator', ADMIN],
  'user:manage':      ['Security Officer', 'Platform Administrator', ADMIN],
  'audit:verify':     ['Security Officer', 'Flight Director', ADMIN],
  'platform:admin':   ['Platform Administrator', 'Flight Director', ADMIN],
  'tasking:submit':   ['Customer User', 'Mission Planner'],
};

export interface Decision {
  allowed: boolean;
  /** Shown to the operator so a blocked control explains itself (SRS §3.6). */
  reason?: string;
}

const ALLOW: Decision = { allowed: true };

export function can(action: Action, role: UserRole): Decision {
  const roles = MATRIX[action];
  if (roles.includes(role)) return ALLOW;

  // Deliberately no admin override: an administrator is refused a spacecraft
  // action like anyone else, and told how to get it done properly.
  if (role === ADMIN) {
    return {
      allowed: false,
      reason: `System Administrator has no spacecraft authority. Ask ${roles.join(' or ')}, or have a second administrator grant you that role.`,
    };
  }

  return {
    allowed: false,
    reason: `${role} cannot do this. Requires ${roles.join(' or ')}.`,
  };
}

/**
 * Approving is the one decision that depends on more than the role: the requester
 * can never approve their own request, whatever role they hold right now.
 */
export function canApprove(role: UserRole, requestedBy: string, actor: string): Decision {
  if (requestedBy === actor) {
    return { allowed: false, reason: 'You raised this request. The requester can never approve their own request.' };
  }
  return can('command:approve', role);
}

/** Screen-level access, driven by the roles each screen declares in the inventory. */
export function canOpen(screen: ScreenSpec, role: UserRole): boolean {
  if (screen.flow === 'public') return true;
  if (role === 'Customer User') return CUSTOMER_ROUTES.includes(screen.route);
  // Reach everywhere so support and audit work; the action gates still refuse.
  if (role === ADMIN) return true;

  return screen.roles.some((r) =>
    r === 'All users' || r === 'Multi-role users' || r === 'All operational roles' || r === role
  );
}

/** Where each role lands after sign-in, and where "back" from a refusal goes. */
const HOME: Partial<Record<UserRole, string>> = {
  'Spacecraft Operator': 'fleet',
  'Flight Engineer': 'fleet',
  'Flight Director': 'approvals',
  'Mission Planner': 'plan',
  'Ground Station Engineer': 'pass',
  'Mission Database Engineer': 'mdb',
  'ML Engineer': 'anomalies',
  'Security Officer': 'users',
  'Platform Administrator': 'platform',
  'System Administrator': 'platform',
  'Customer User': 'customer',
};
export const homeOf = (role: UserRole): string => HOME[role] ?? 'fleet';

/** Same as canOpen, by route name (hash route without '#/' or its query). */
export function canOpenRoute(route: string, role: UserRole): boolean {
  const name = route.replace(/^#?\/?/, '').split('?')[0];
  const screen = SCREEN_LOOKUP().find((s) => s.route === name);
  return screen ? canOpen(screen, role) : true;
}

/** Who can open a screen, for "handled by …" text in place of a link the role cannot follow. */
export function whoCanOpen(route: string): string {
  const name = route.replace(/^#?\/?/, '').split('?')[0];
  const screen = SCREEN_LOOKUP().find((s) => s.route === name);
  return screen ? screen.roles.join(', ') : '';
}

/** Plain-language names for every action, for the sign-in and role screens. */
const ACTION_LABEL: Record<Action, string> = {
  'telemetry:read': 'Watch telemetry and history',
  'alarm:ack': 'Acknowledge alarms',
  'alarm:shelve': 'Shelve alarms with a reason',
  'command:send': 'Send routine commands',
  'command:request': 'Send critical commands',
  'command:approve': 'Approve critical commands raised by others',
  'procedure:run': 'Run procedures',
  'procedure:author': 'Write procedures',
  'plan:edit': 'Edit and solve the mission plan',
  'booking:edit': 'Book and release passes',
  'mdb:edit': 'Edit the mission database',
  'mdb:release': 'Release a mission database',
  'model:promote': 'Promote anomaly models',
  'sim:run': 'Run the simulator',
  'user:manage': 'Invite users and change roles',
  'audit:verify': 'Verify and export the audit ledger',
  'platform:admin': 'Run the platform',
  'tasking:submit': 'Request imagery',
};

/** Actions that are allowed but only with a second person. */
export const NEEDS_SECOND: Partial<Record<Action, string>> = {
  'command:request': 'a Flight Director who did not raise it approves',
  'mdb:release': 'two reviewers and a simulator check',
  'procedure:author': 'release reviewed by a second engineer',
  'plan:edit': 'plan approved by a Flight Director',
  'user:manage': 'a commanding role needs a second administrator',
};

export interface Capabilities { can: string[]; second: string[]; cannot: string[] }

/** What a role can do, needs a second person for, and cannot do — straight from MATRIX. */
export function capabilitiesOf(role: UserRole): Capabilities {
  const out: Capabilities = { can: [], second: [], cannot: [] };
  for (const [action, roles] of Object.entries(MATRIX) as [Action, UserRole[]][]) {
    const label = ACTION_LABEL[action];
    if (!roles.includes(role)) continue;
    if (NEEDS_SECOND[action]) out.second.push(`${label}: ${NEEDS_SECOND[action]}`);
    else out.can.push(label);
  }
  // The few refusals people most often expect to have, so "cannot" is meaningful.
  const notable: Action[] = ['command:send', 'command:approve', 'alarm:ack', 'mdb:edit', 'user:manage', 'plan:edit'];
  for (const a of notable) if (!MATRIX[a].includes(role)) out.cannot.push(ACTION_LABEL[a]);
  if (role === 'Flight Director') out.cannot.unshift('Approve your own request');
  if (role === 'Customer User') out.can = out.can.map((c) => (c === 'Watch telemetry and history' ? 'See your own satellites only' : c));
  return { ...out, cannot: out.cannot.slice(0, 4) };
}
