import React, { Suspense, useEffect, useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { SCREENS, screenByRoute } from '../data/screens';
import { navigate, parseHash, Route } from './routes';
import { canOpen } from '../auth/policy';
import { useAuthStore } from '../store/useAuthStore';
import { NotAuthorized } from '../screens/NotAuthorized';
import { Skeleton } from '../components/molecules/Page';

/** Each screen is its own chunk, fetched the first time it is opened. */
const lazyNamed = <M extends Record<K, React.ComponentType<any>>, K extends keyof M>(load: () => Promise<M>, name: K) => // eslint-disable-line @typescript-eslint/no-explicit-any
  React.lazy(() => load().then((m) => ({ default: m[name] })));

const ScreenLoading: React.FC = () => (
  <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading screen">
    <Skeleton className="h-9 w-72 rounded-xl" />
    <Skeleton className="h-28 rounded-2xl" />
    <Skeleton className="h-[420px] rounded-2xl" />
  </div>
);

// Public & access
const ProductLanding = lazyNamed(() => import('../screens/landing/ProductLanding'), 'ProductLanding');
const Architecture = lazyNamed(() => import('../screens/landing/Architecture'), 'Architecture');
const ContactDemo = lazyNamed(() => import('../screens/landing/ContactDemo'), 'ContactDemo');
const Login = lazyNamed(() => import('../screens/auth/Login'), 'Login');
const RoleSelection = lazyNamed(() => import('../screens/auth/RoleSelection'), 'RoleSelection');
// Fleet & telemetry
const ConstellationOverview = lazyNamed(() => import('../screens/telemetry/ConstellationOverview'), 'ConstellationOverview');
const SatelliteHealth = lazyNamed(() => import('../screens/telemetry/SatelliteHealth'), 'SatelliteHealth');
const AlarmConsole = lazyNamed(() => import('../screens/telemetry/AlarmConsole'), 'AlarmConsole');
// Passes & ground
const LivePassMonitor = lazyNamed(() => import('../screens/passes/LivePassMonitor'), 'LivePassMonitor');
const ContactSchedule = lazyNamed(() => import('../screens/mission/ContactSchedule'), 'ContactSchedule');
const GroundStations = lazyNamed(() => import('../screens/passes/GroundStations'), 'GroundStations');
const PassReportScreen = lazyNamed(() => import('../screens/passes/PassReportScreen'), 'PassReportScreen');
// Commanding
const CommandSandbox = lazyNamed(() => import('../screens/commanding/CommandSandbox'), 'CommandSandbox');
const Approvals = lazyNamed(() => import('../screens/commanding/Approvals'), 'Approvals');
const TCDashboard = lazyNamed(() => import('../screens/commanding/TCDashboard'), 'TCDashboard');
const CommandQueue = lazyNamed(() => import('../screens/commanding/CommandQueue'), 'CommandQueue');
const ProcedureEditor = lazyNamed(() => import('../screens/commanding/ProcedureEditor'), 'ProcedureEditor');
// Planning & mission data
const ActivityPlanner = lazyNamed(() => import('../screens/mission/ActivityPlanner'), 'ActivityPlanner');
const PayloadTasking = lazyNamed(() => import('../screens/mission/PayloadTasking'), 'PayloadTasking');
const MIBManager = lazyNamed(() => import('../screens/config/MIBManager'), 'MIBManager');
// Intelligence
const AnomalyDashboard = lazyNamed(() => import('../screens/analytics/AnomalyDashboard'), 'AnomalyDashboard');
const PredictiveHealth = lazyNamed(() => import('../screens/analytics/PredictiveHealth'), 'PredictiveHealth');
const OpsCopilot = lazyNamed(() => import('../screens/intelligence/OpsCopilot'), 'OpsCopilot');
// Simulation & customers
const Simulator = lazyNamed(() => import('../screens/simulation/Simulator'), 'Simulator');
const CustomerPortal = lazyNamed(() => import('../screens/simulation/CustomerPortal'), 'CustomerPortal');
// Governance & platform
const UserManagement = lazyNamed(() => import('../screens/admin/UserManagement'), 'UserManagement');
const AuditLog = lazyNamed(() => import('../screens/admin/AuditLog'), 'AuditLog');
const SystemHealth = lazyNamed(() => import('../screens/admin/SystemHealth'), 'SystemHealth');
const OnCall = lazyNamed(() => import('../screens/admin/OnCall'), 'OnCall');
const Archive = lazyNamed(() => import('../screens/telemetry/Archive'), 'Archive');
const SpacecraftServices = lazyNamed(() => import('../screens/commanding/SpacecraftServices'), 'SpacecraftServices');
const Orbits = lazyNamed(() => import('../screens/mission/Orbits'), 'Orbits');
const GroundNetwork = lazyNamed(() => import('../screens/passes/GroundNetwork'), 'GroundNetwork');
const LinkSecurity = lazyNamed(() => import('../screens/admin/LinkSecurity'), 'LinkSecurity');

const DEFAULT_SAT = 'AKV-03';

export const AppRouter: React.FC = () => {
  const [route, setRoute] = useState<Route>(() => parseHash());

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    if (!window.location.hash) window.location.hash = '#/landing';
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const { params } = route;
  const sat = params.sat ?? DEFAULT_SAT;
  const role = useAuthStore((s) => s.activeRole);
  const signedIn = useAuthStore((s) => s.isAuthenticated);

  /** Marketing pages that sit outside the 29-screen SRS inventory. */
  if (route.route === 'architecture') return <Suspense fallback={null}><Architecture onNavigate={navigate} /></Suspense>;
  if (route.route === 'contact') return <Suspense fallback={null}><ContactDemo onNavigate={navigate} /></Suspense>;

  const spec = screenByRoute(route.route) ?? SCREENS[3]; // fall back to Fleet overview

  const render = () => {
    switch (spec.route) {
      case 'landing': return <ProductLanding onNavigate={navigate} />;
      case 'signin': return <Login onNavigate={navigate} />;
      case 'scope': return <RoleSelection onNavigate={navigate} />;

      case 'fleet': return <ConstellationOverview onNavigate={navigate} />;
      case 'satellite': return <SatelliteHealth key={sat} satId={sat} tab={params.tab} mode={params.mode} param={params.param} popout={params.win === '1'} onNavigate={navigate} />;
      case 'parameter': return <SatelliteHealth key={`${sat}-h`} satId={sat} mode="history" param={params.param ?? 'BAT_TEMP'} popout={params.win === '1'} onNavigate={navigate} />;
      case 'alarms': return <AlarmConsole onNavigate={navigate} />;
      case 'playback': return <SatelliteHealth key={`${sat}-p`} satId={sat} mode="playback" popout={params.win === '1'} onNavigate={navigate} />;

      case 'pass': return <LivePassMonitor onNavigate={navigate} satId={params.sat} sessionId={params.session} />;
      case 'schedule': return <ContactSchedule onNavigate={navigate} />;
      case 'stations': return <GroundStations onNavigate={navigate} />;
      case 'report': return <PassReportScreen onNavigate={navigate} sessionId={params.session} />;

      case 'command': return <CommandSandbox onNavigate={navigate} satId={params.sat} />;
      case 'approvals': return <Approvals onNavigate={navigate} />;
      case 'procedure': return <TCDashboard onNavigate={navigate} />;
      case 'uplink': return <CommandQueue onNavigate={navigate} />;
      case 'editor': return <ProcedureEditor procedureId={params.proc ?? 'PR-THM-004'} onNavigate={navigate} />;

      case 'plan': return <ActivityPlanner onNavigate={navigate} />;
      case 'payload': return <PayloadTasking onNavigate={navigate} />;
      case 'mdb': return <MIBManager satId={sat} onNavigate={navigate} />;

      case 'anomalies': return <AnomalyDashboard onNavigate={navigate} />;
      case 'forecast': return <PredictiveHealth satId={sat} onNavigate={navigate} />;
      case 'copilot': return <OpsCopilot onNavigate={navigate} />;

      case 'simulator': return <Simulator />;
      case 'customer': return <CustomerPortal onNavigate={navigate} />;

      case 'users': return <UserManagement onNavigate={navigate} />;
      case 'audit': return <AuditLog onNavigate={navigate} />;
      case 'platform': return <SystemHealth onNavigate={navigate} />;
      case 'oncall': return <OnCall onNavigate={navigate} />;
      case 'archive': return <Archive onNavigate={navigate} />;
      case 'services': return <SpacecraftServices onNavigate={navigate} />;
      case 'orbits': return <Orbits onNavigate={navigate} />;
      case 'network': return <GroundNetwork onNavigate={navigate} />;
      case 'keys': return <LinkSecurity onNavigate={navigate} />;

      default: return <ConstellationOverview onNavigate={navigate} />;
    }
  };

  // Public screens render without the app shell.
  if (spec.flow === 'public') return <Suspense fallback={null}>{render()}</Suspense>;

  // Everything else needs a signed-in session.
  if (!signedIn) {
    if (window.location.hash !== '#/signin') window.location.hash = '#/signin';
    return null;
  }

  // A deep link to a screen this role may not open is refused, not rendered empty.
  return (
    <AppShell screen={spec} onNavigate={navigate} compact={params.win === '1'}>
      {canOpen(spec, role) ? <Suspense fallback={<ScreenLoading />}>{render()}</Suspense> : <NotAuthorized screen={spec} role={role} onNavigate={navigate} />}
    </AppShell>
  );
};
