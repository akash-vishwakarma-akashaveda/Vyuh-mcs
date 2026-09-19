import type { Satellite } from '../types';
import { Elements, elementsFrom } from './orbit';

/** Element set of a satellite; `true_anomaly_deg` holds the mean anomaly at the element epoch. */
export const satElements = (s: Satellite): Elements =>
  elementsFrom({
    altitude_km: s.altitude_km, eccentricity: s.eccentricity, inclination_deg: s.inclination_deg,
    raan_deg: s.raan_deg, arg_of_perigee_deg: s.arg_of_perigee_deg, mean_anomaly_deg: s.true_anomaly_deg,
  });
