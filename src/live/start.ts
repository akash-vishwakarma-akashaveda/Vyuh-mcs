import { mockEngine } from '../mocks/mockTelemetryEngine';
import { defaultGatewayUrl, startRealtime } from '../realtime/client';
import { useLinkStore } from '../store/useLinkStore';
import { LIVE_SATELLITES } from './api';
import { onAlarm, onStatus, resync, startDirector } from './director';

/**
 * Connects the console to the live backend. Until the Realtime Gateway first answers,
 * the built-in simulation keeps driving every screen (so the console still works
 * offline); from then on the backend's satellites are driven by real telemetry and the
 * simulation is switched off for exactly those — the rest of the fleet stays simulated.
 */
export function startLiveLink(): () => void {
  const stopDirector = startDirector();
  const stopRealtime = startRealtime(defaultGatewayUrl(), LIVE_SATELLITES, {
    onAlarm,
    onStatus,
    onResync: () => void resync(),
    onFirstConnect: () => {
      mockEngine.setLiveSatellites(LIVE_SATELLITES);
      useLinkStore.getState().setMode('live', LIVE_SATELLITES);
      void resync();
    },
  });
  return () => {
    stopRealtime();
    stopDirector();
  };
}
