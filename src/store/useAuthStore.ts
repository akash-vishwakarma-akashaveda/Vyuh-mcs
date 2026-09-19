import { create } from 'zustand';
import { User, UserRole } from '../types';

/**
 * Demo personas. In the product these come from Keycloak; here they exist so the
 * two-person rule is real — "switch to Flight Director" changes *who you are*, not
 * just a label, otherwise the requester could approve their own request.
 */
export const PEOPLE: User[] = [
  { id: 'USR-001', name: 'Vikram Shetty', email: 'vikram.shetty@akashaveda.com', roles: ['Spacecraft Operator', 'Flight Engineer'], satellite_scope: ['AKV-*'], last_login_utc: new Date().toISOString(), status: 'ACTIVE', mfa_enabled: true },
  { id: 'USR-002', name: 'Ananya Rao', email: 'ananya.rao@akashaveda.com', roles: ['Flight Director', 'Spacecraft Operator'], satellite_scope: ['AKV-*'], last_login_utc: new Date().toISOString(), status: 'ACTIVE', mfa_enabled: true },
  { id: 'USR-003', name: 'Meera Iyer', email: 'meera.iyer@akashaveda.com', roles: ['Mission Database Engineer', 'Flight Engineer'], satellite_scope: ['AKV-*'], last_login_utc: new Date().toISOString(), status: 'ACTIVE', mfa_enabled: true },
  { id: 'USR-004', name: 'Karan Malhotra', email: 'karan.malhotra@akashaveda.com', roles: ['Mission Planner', 'Ground Station Engineer'], satellite_scope: ['AKV-*'], last_login_utc: new Date().toISOString(), status: 'ACTIVE', mfa_enabled: true },
  { id: 'USR-005', name: 'Farah Siddiqui', email: 'farah.siddiqui@akashaveda.com', roles: ['Security Officer'], satellite_scope: ['*'], last_login_utc: new Date().toISOString(), status: 'ACTIVE', mfa_enabled: true },
  { id: 'USR-006', name: 'Rohit Nair', email: 'rohit.nair@akashaveda.com', roles: ['Platform Administrator'], satellite_scope: ['*'], last_login_utc: new Date().toISOString(), status: 'ACTIVE', mfa_enabled: true },
  { id: 'USR-007', name: 'Leena Joseph', email: 'leena.joseph@akashaveda.com', roles: ['ML Engineer'], satellite_scope: ['AKV-*'], last_login_utc: new Date().toISOString(), status: 'ACTIVE', mfa_enabled: true },
  { id: 'USR-009', name: 'Aditya Menon', email: 'aditya.menon@akashaveda.com', roles: ['System Administrator', 'Platform Administrator'], satellite_scope: ['*'], last_login_utc: new Date().toISOString(), status: 'ACTIVE', mfa_enabled: true },
  { id: 'USR-008', name: 'Priya Nabhas', email: 'priya@nabhas-agritech.com', roles: ['Customer User'], satellite_scope: ['NBH-01', 'NBH-02'], last_login_utc: new Date().toISOString(), status: 'ACTIVE', mfa_enabled: true },
  { id: 'USR-010', name: 'Daniel Osei', email: 'daniel@terra-analytics.io', roles: ['Customer User'], satellite_scope: ['TRA-01', 'TRA-02'], last_login_utc: new Date().toISOString(), status: 'ACTIVE', mfa_enabled: true },
];

/** How the sign-in screen groups people: by the category of their primary role. */
export const ROLE_CATEGORIES: { id: string; label: string; roles: UserRole[] }[] = [
  { id: 'ops', label: 'Operations', roles: ['Spacecraft Operator', 'Flight Director'] },
  { id: 'eng', label: 'Engineering', roles: ['Flight Engineer', 'Mission Database Engineer', 'ML Engineer'] },
  { id: 'plan', label: 'Planning & ground', roles: ['Mission Planner', 'Ground Station Engineer'] },
  { id: 'gov', label: 'Governance & platform', roles: ['Security Officer', 'Platform Administrator', 'System Administrator'] },
  { id: 'cust', label: 'Customers', roles: ['Customer User'] },
];

export const categoryOf = (p: User) => ROLE_CATEGORIES.find((c) => c.roles.includes(p.roles[0])) ?? ROLE_CATEGORIES[0];

export const tenantOfPerson = (p: User) =>
  p.email.endsWith('nabhas-agritech.com') ? 'Nabhas Agritech' : p.email.endsWith('terra-analytics.io') ? 'Terra Analytics' : 'Akashaveda';

interface AuthStore {
  user: User;
  activeRole: UserRole;
  isAuthenticated: boolean;
  /** Roles the signed-in person actually holds — the only ones offerable. */
  availableRoles: () => UserRole[];
  signInAs: (personId: string, role?: UserRole) => void;
  setRole: (role: UserRole) => void;
  logout: () => void;
}

const DEFAULT = PEOPLE[0];

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: DEFAULT,
  activeRole: DEFAULT.roles[0],
  isAuthenticated: true,

  availableRoles: () => get().user.roles,

  signInAs: (personId, role) =>
    set(() => {
      const person = PEOPLE.find((p) => p.id === personId) ?? DEFAULT;
      return {
        user: person,
        // Only one role is active per session (BR-S02-01), and only a held role.
        activeRole: role && person.roles.includes(role) ? role : person.roles[0],
      };
    }),

  setRole: (role) =>
    set((s) => (s.user.roles.includes(role) ? { activeRole: role } : s)),

  logout: () => set({ isAuthenticated: false }),
}));
