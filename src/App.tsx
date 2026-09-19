import React, { useEffect } from 'react';
import { AppRouter } from './router/AppRouter';
import { mockEngine } from './mocks/mockTelemetryEngine';
import { startLiveLink } from './live/start';
import { startNotifications } from './notify/wire';

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
    const stopNotify = startNotifications();
    const stopLive = BACKEND === 'mock' ? () => {} : startLiveLink();
    return () => {
      stopLive();
      stopNotify();
      mockEngine.stop();
    };
  }, []);

  return <AppRouter />;
};

export default App;
