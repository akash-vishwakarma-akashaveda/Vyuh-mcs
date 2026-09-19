import React, { useEffect, useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { SCREENS, screenByRoute } from '../data/screens';
import { navigate, parseHash, Route } from './routes';
import { canOpen } from '../auth/policy';
import { useAuthStore } from '../store/useAuthStore';
import { NotAuthorized } from '../screens/NotAuthorized';

// Public & access
import { ProductLanding } from '../screens/landing/ProductLanding';
import { Architecture } from '../screens/landing/Architecture';
import { ContactDemo } from '../screens/landing/ContactDemo';
import { Login } from '../screens/auth/Login';
import { RoleSelection } from '../screens/auth/RoleSelection';
// Fleet & telemetry
import { ConstellationOverview } from '../screens/telemetry/ConstellationOverview';
import { SatelliteHealth } from '../screens/telemetry/SatelliteHealth';
import { ParameterDetail } from '../screens/telemetry/ParameterDetail';
import { AlarmConsole } from '../screens/telemetry/AlarmConsole';
import { PassPlayback } from '../screens/telemetry/PassPlayback';
// Passes & ground
import { LivePassMonitor } from '../screens/passes/LivePassMonitor';
import { ContactSchedule } from '../screens/mission/ContactSchedule';
import { GroundStations } from '../screens/passes/GroundStations';
import { PassReportScreen } from '../screens/passes/PassReportScreen';
// Commanding
import { CommandSandbox } from '../screens/commanding/CommandSandbox';
import { Approvals } from '../screens/commanding/Approvals';
import { TCDashboard } from '../screens/commanding/TCDashboard';
import { CommandQueue } from '../screens/commanding/CommandQueue';
import { ProcedureEditor } from '../screens/commanding/ProcedureEditor';
// Planning & mission data
import { ActivityPlanner } from '../screens/mission/ActivityPlanner';
import { PayloadTasking } from '../screens/mission/PayloadTasking';
import { MIBManager } from '../screens/config/MIBManager';
// Intelligence
import { AnomalyDashboard } from '../screens/analytics/AnomalyDashboard';
import { PredictiveHealth } from '../screens/analytics/PredictiveHealth';
import { OpsCopilot } from '../screens/intelligence/OpsCopilot';
// Simulation & customers
import { Simulator } from '../screens/simulation/Simulator';
import { CustomerPortal } from '../screens/simulation/CustomerPortal';
// Governance & platform
import { UserManagement } from '../screens/admin/UserManagement';
import { AuditLog } from '../screens/admin/AuditLog';
import { SystemHealth } from '../screens/admin/SystemHealth';
import { OnCall } from '../screens/admin/OnCall';

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

  /** Marketing pages that sit outside the 29-screen SRS inventory. */
  if (route.route === 'architecture') return <Architecture onNavigate={navigate} />;
  if (route.route === 'contact') return <ContactDemo onNavigate={navigate} />;

  const spec = screenByRoute(route.route) ?? SCREENS[3]; // fall back to Fleet overview

  const render = () => {
    switch (spec.route) {
      case 'landing': return <ProductLanding onNavigate={navigate} />;
      case 'signin': return <Login onNavigate={navigate} />;
      case 'scope': return <RoleSelection onNavigate={navigate} />;

      case 'fleet': return <ConstellationOverview onNavigate={navigate} />;
      case 'satellite': return <SatelliteHealth satId={sat} tab={params.tab} onNavigate={navigate} />;
      case 'parameter': return <ParameterDetail satId={sat} paramId={params.param ?? 'BAT_TEMP'} onNavigate={navigate} />;
      case 'alarms': return <AlarmConsole onNavigate={navigate} />;
      case 'playback': return <PassPlayback onNavigate={navigate} />;

      case 'pass': return <LivePassMonitor onNavigate={navigate} satId={params.sat} sessionId={params.session} />;
      case 'schedule': return <ContactSchedule onNavigate={navigate} />;
      case 'stations': return <GroundStations onNavigate={navigate} />;
      case 'report': return <PassReportScreen onNavigate={navigate} sessionId={params.session} />;

      case 'command': return <CommandSandbox onNavigate={navigate} />;
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
      case 'oncall': return <OnCall />;

      default: return <ConstellationOverview onNavigate={navigate} />;
    }
  };

  // Public screens render without the app shell.
  if (spec.flow === 'public') return <>{render()}</>;

  // A deep link to a screen this role may not open is refused, not rendered empty.
  return (
    <AppShell screen={spec} onNavigate={navigate}>
      {canOpen(spec, role) ? render() : <NotAuthorized screen={spec} role={role} onNavigate={navigate} />}
    </AppShell>
  );
};
