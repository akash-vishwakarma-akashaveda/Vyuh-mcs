import { useCallback } from 'react';
import { useFleetStore } from '../store/useFleetStore';

export function useTelemetryParam(satId: string, paramId: string) {
  return useFleetStore(
    useCallback((state) => state.cvt[satId]?.[paramId], [satId, paramId])
  );
}

export function useSatelliteCVT(satId: string) {
  return useFleetStore(
    useCallback((state) => state.cvt[satId] || {}, [satId])
  );
}
