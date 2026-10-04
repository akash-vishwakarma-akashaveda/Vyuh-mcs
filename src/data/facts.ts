import satellites from '../../config/satellites.json';
import { FLEET, STATIONS } from './fleet';
import { MODULES } from './mission';
import { SCREENS } from './screens';

/**
 * The one fact sheet for numbers in public copy. Every count is computed from its
 * source, so the landing page, the architecture page and the demo cannot disagree.
 */
export const FACTS = {
  /** Satellites the Go backend really flies (config/satellites.json): 12 simulated + the OPS-SAT replay. */
  liveSatellites: satellites.length,
  /** Satellites in the console's built-in demo fleet (data/fleet.ts). */
  demoFleet: FLEET.length,
  tenants: new Set(FLEET.map((s) => s.sat_id.slice(0, 3))).size,
  stations: STATIONS.length,
  /** Console screens, not counting the public pages. */
  consoleScreens: SCREENS.filter((s) => s.flow !== 'public').length,
  /** Modules in the target architecture (Architecture v2.2). */
  architectureModules: MODULES.length,
  /** Ground-segment services built in this repository (cmd/*, excluding the all-in-one binary and the verifier). */
  backendServices: 14,
  latencyBudgetMs: 100,
} as const;
