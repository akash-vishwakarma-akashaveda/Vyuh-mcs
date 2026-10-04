import React, { useEffect } from 'react';
import { AppRouter } from './router/AppRouter';
import { TooltipHost } from './components/molecules/TooltipHost';
import { mockEngine } from './mocks/mockTelemetryEngine';
import { startLiveLink } from './live/start';
import { startNotifications } from './notify/wire';
import { startCommandRelease } from './live/release';
import { startEscalation, startIdleTimeout } from './notify/escalation';
import { useAuthStore } from './store/useAuthStore';
import { startConjunctionScreening } from './ops/conjunctionStore';
import { usePlanStore } from './store/usePlanStore';

/**
 * VITE_BACKEND: 'auto' (default) uses the live backend when it answers and the
 * built-in simulation otherwise; 'mock' never connects; 'live' is the same as auto
 * (the link chip in the top bar always says which one you are looking at).
 */
const BACKEND = (import.meta.env.VITE_BACKEND as string | undefined) ?? 'auto';

export const App: React.FC = () => {
  useEffect(() => {
    // The simulation seeds every satellite's parameter table (names, units, limits) and
    // drives whatever the backend does not fly; it starts first so the console is never empty.
    mockEngine.start();
    // The demo world (src/demo/scenario.ts) is already in the stores; the plan carries its request over now.
    usePlanStore.getState().init();
    const stopNotify = startNotifications();
    const stopConj = startConjunctionScreening();
    const stopRelease = startCommandRelease();
    const stopEscalation = startEscalation();
    const stopIdle = startIdleTimeout(
      // signed in = inside the console (past landing, sign-in and scope)
      () => !/^#?\/?(landing|signin|scope)?$/.test(location.hash),
      () => { useAuthStore.getState().logout(); location.hash = '#/signin'; },
    );
    const stopLive = BACKEND === 'mock' ? () => {} : startLiveLink();
    return () => {
      stopLive();
      stopNotify();
      stopConj();
      stopRelease();
      stopEscalation();
      stopIdle();
      mockEngine.stop();
    };
  }, []);

  return (<><TooltipHost /><AppRouter /></>);
};

export default App;
