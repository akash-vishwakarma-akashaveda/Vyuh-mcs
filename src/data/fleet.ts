/**
 * Example fleet and mission data for SRS v2. Satellites AKV-01…10 (Akashaveda) and
 * NBH-01…02 (Nabhas Agritech), people, hashes and documents are fictional examples.
 */
import { GroundStation, RoutingRule, Satellite, Scenario } from '../types';
import { elementsFrom, periodMinutes, propagate } from '../orbit/orbit';

/** Three operators on one platform — the multi-tenant story, not a single-customer tool. */
export const TENANTS = ['Akashaveda', 'Nabhas Agritech', 'Terra Analytics'];

const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString();
const min = (n: number) => n * 60_000;

export const STATIONS: GroundStation[] = [
  { id: 'HYD', name: 'Hyderabad', provider: 'Akashaveda', protocol: 'Own', bands: ['S', 'X'], lat: 17.39, lon: 78.49, availability_pct: 99.4, quality_pct: 99.8, cost_per_min_usd: 14.0, adapter_health: 'OK', state: 'AVAILABLE' },
  { id: 'BLR', name: 'Bengaluru', provider: 'ISRO', protocol: 'SLE', bands: ['S'], lat: 12.97, lon: 77.59, availability_pct: 99.1, quality_pct: 99.6, cost_per_min_usd: 2.0, adapter_health: 'OK', state: 'AVAILABLE' },
  { id: 'SVL', name: 'Svalbard', provider: 'KSAT', protocol: 'SLE', bands: ['S', 'X', 'Ka'], lat: 78.23, lon: 15.39, availability_pct: 97.8, quality_pct: 98.9, cost_per_min_usd: 9.5, adapter_health: 'OK', state: 'AVAILABLE' },
  { id: 'AWS', name: 'Ohio (Ground Station)', provider: 'AWS', protocol: 'AWS Data/IP', bands: ['S', 'X'], lat: 40.42, lon: -82.91, availability_pct: 98.6, quality_pct: 94.2, cost_per_min_usd: 12.0, adapter_health: 'DEGRADED', state: 'DEGRADED' },
  { id: 'PTH', name: 'Perth', provider: 'KSAT', protocol: 'SLE', bands: ['S', 'X'], lat: -31.95, lon: 115.86, availability_pct: 97.1, quality_pct: 98.1, cost_per_min_usd: 7.5, adapter_health: 'OK', state: 'AVAILABLE' },
  { id: 'SGP', name: 'Singapore', provider: 'Partner', protocol: 'Own', bands: ['S'], lat: 1.35, lon: 103.82, availability_pct: 96.4, quality_pct: 0, cost_per_min_usd: 8.0, adapter_health: 'DOWN', state: 'MAINTENANCE' },
];

/**
 * 50 satellites: 46 AKV (Akashaveda, LEO imaging constellation), 2 NBH (Nabhas
 * Agritech, LEO — an agri-monitoring customer) and 2 TRA (Terra Analytics, MEO —
 * a second, differently-orbited customer, so the platform's "any tenant, any
 * orbit regime" claim is something you can click into, not just a slide).
 *
 * AKV-03 stays the demo subject at a fixed index so the guided demo never shifts
 * under it. Everything else is generated — this is the whole point: growing the
 * constellation is adding rows, never rewriting code (see Architecture §06).
 *
 * Health is not reference data: it follows the telemetry, and which satellites sit off-nominal is
 * the demo scenario's call (src/demo/scenario.ts, CONDITIONS). Every satellite starts NOMINAL here and
 * the telemetry engine sets its health from its values before the first frame.
 */

export const FLEET: Satellite[] = [
  ...Array.from({ length: 46 }).map((_, i) => build(`AKV-${String(i + 1).padStart(2, '0')}`, i, 'Akashaveda', 'LEO')),
  build('NBH-01', 46, 'Nabhas Agritech', 'LEO'),
  build('NBH-02', 47, 'Nabhas Agritech', 'LEO'),
  build('TRA-01', 48, 'Terra Analytics', 'MEO'),
  build('TRA-02', 49, 'Terra Analytics', 'MEO'),
];

function build(id: string, i: number, tenant: string, regime: 'LEO' | 'MEO'): Satellite & { tenant: string } {
  const plane = ['A', 'B', 'C', 'D'][i % 4];
  const isMeo = regime === 'MEO';
  // Three stations per satellite, rotated through the catalogue so the fleet
  // doesn't funnel through the same three antennas regardless of size.
  const stations = [0, 1, 2].map((k) => STATIONS[(i + k) % STATIONS.length].id);

  // Walker-style layout: four sun-synchronous planes 45° apart in RAAN, satellites spread
  // evenly in each plane, planes phased against each other — the geometry of a real constellation.
  const planeIdx = i % 4;
  const slot = Math.floor(i / 4);
  const altitude = isMeo ? 8062 + (i % 9) * 40 : 521 + (i % 7);
  const inclination = isMeo ? 55.0 : 97.4;
  const raan = isMeo ? (i % 2) * 180 : planeIdx * 45;
  const meanAnomaly = isMeo ? (i % 2) * 180 : (slot * 30 + planeIdx * 7.5) % 360;
  const argp = isMeo ? 0 : 90;
  const el = elementsFrom({ altitude_km: altitude, eccentricity: 0.0012, inclination_deg: inclination, raan_deg: raan, arg_of_perigee_deg: argp, mean_anomaly_deg: meanAnomaly });
  const now = propagate(el, Date.now());

  return {
    sat_id: id,
    name: `${tenant.split(' ')[0]} ${id}`,
    status: 'ACTIVE',
    orbit_regime: regime,
    constellation_group: `Plane ${plane}`,
    health_state: 'NOMINAL',
    last_contact_utc: iso(-min(6 + (i * 7) % 180)),
    next_contact_utc: iso(min(5 + (i * 11) % 240)),
    latitude: Number(now.lat.toFixed(4)),
    longitude: Number(now.lon.toFixed(4)),
    altitude_km: altitude,
    velocity_kms: Number(now.speedKms.toFixed(2)),
    period_minutes: Number(periodMinutes(el.a).toFixed(1)),
    inclination_deg: inclination,
    eccentricity: 0.0012,
    raan_deg: raan,
    arg_of_perigee_deg: argp,
    true_anomaly_deg: meanAnomaly, // mean anomaly at the element epoch (ν ≈ M for e ≈ 0)
    apogee_km: Number((altitude + 7.6).toFixed(1)),
    perigee_km: Number((altitude - 7.6).toFixed(1)),
    assigned_ground_stations: stations,
    mib_version: 'akv-mdb 4.19.0',
    tenant,
  };
}

const TENANT_PREFIX: Record<string, string> = { AKV: 'Akashaveda', NBH: 'Nabhas Agritech', TRA: 'Terra Analytics' };
export const tenantOf = (satId: string) => TENANT_PREFIX[satId.slice(0, 3)] ?? 'Akashaveda';

/**
 * Telemetry dictionary. `drift` is how far the simulator moves a value each second,
 * in engineering units — 0 means the value only changes when something changes it.
 * BAT_TEMP, HTR_A_DUTY and HTR_B_STATE on AKV-03 are driven by the demo story.
 */
export interface ParamDef {
  param_id: string; name: string; value: number; unit: string;
  warnLo: number; warnHi: number; critLo: number; critHi: number;
  drift: number;
}

export const PARAMETERS: Record<string, ParamDef[]> = {
  POWER: [
    { param_id: 'BUS_VOLTAGE', name: 'Main bus voltage', value: 29.36, unit: 'V', warnLo: 26, warnHi: 31, critLo: 24, critHi: 32, drift: 0.12 },
    { param_id: 'BUS_CURRENT', name: 'Main bus current', value: 12.4, unit: 'A', warnLo: 2, warnHi: 22, critLo: 0, critHi: 26, drift: 0.3 },
    { param_id: 'BAT_SOC', name: 'Battery state of charge', value: 81.8, unit: '%', warnLo: 40, warnHi: 100, critLo: 20, critHi: 100, drift: 0.25 },
    { param_id: 'BAT_VOLTAGE', name: 'Battery voltage', value: 28.1, unit: 'V', warnLo: 24, warnHi: 30, critLo: 22, critHi: 31, drift: 0.08 },
    { param_id: 'BAT_TEMP', name: 'Battery A temperature', value: 18.5, unit: '°C', warnLo: 10, warnHi: 40, critLo: 4, critHi: 50, drift: 0.2 },
    { param_id: 'ARRAY_I', name: 'Array generation current', value: 4.16, unit: 'A', warnLo: 1.5, warnHi: 8, critLo: 0, critHi: 10, drift: 0.18 },
    { param_id: 'ARRAY_V', name: 'Array voltage', value: 33.8, unit: 'V', warnLo: 28, warnHi: 38, critLo: 26, critHi: 40, drift: 0.2 },
    { param_id: 'HTR_A_DUTY', name: 'Heater A duty cycle', value: 22.0, unit: '%', warnLo: -1, warnHi: 80, critLo: -1, critHi: 100, drift: 0 }, // 0 % duty is a normal resting state, never a low alarm
    { param_id: 'HTR_B_STATE', name: 'Heater B state', value: 0, unit: '', warnLo: -1, warnHi: 2, critLo: -1, critHi: 2, drift: 0 }, // OFF (0) is normal; this is a state readout, not an alarmable range
    { param_id: 'PDU_TEMP', name: 'Power distribution unit temperature', value: 26.4, unit: '°C', warnLo: -5, warnHi: 45, critLo: -15, critHi: 60, drift: 0.15 },
  ],
  ADCS: [
    { param_id: 'RW1_SPEED', name: 'Reaction wheel 1 speed', value: 3210, unit: 'RPM', warnLo: -5000, warnHi: 5000, critLo: -6000, critHi: 6000, drift: 45 },
    { param_id: 'RW2_SPEED', name: 'Reaction wheel 2 speed', value: -2455, unit: 'RPM', warnLo: -5000, warnHi: 5000, critLo: -6000, critHi: 6000, drift: 45 },
    { param_id: 'RW3_SPEED', name: 'Reaction wheel 3 speed', value: 1876, unit: 'RPM', warnLo: -5000, warnHi: 5000, critLo: -6000, critHi: 6000, drift: 45 },
    { param_id: 'RW4_SPEED', name: 'Reaction wheel 4 speed', value: -940, unit: 'RPM', warnLo: -5000, warnHi: 5000, critLo: -6000, critHi: 6000, drift: 45 },
    { param_id: 'ATT_ERR', name: 'Pointing error', value: 0.024, unit: 'deg', warnLo: 0, warnHi: 0.1, critLo: 0, critHi: 0.5, drift: 0.004 },
    { param_id: 'GYRO_X_RATE', name: 'Gyro X rate', value: 0.0012, unit: 'deg/s', warnLo: -0.01, warnHi: 0.01, critLo: -0.05, critHi: 0.05, drift: 0.0006 },
    { param_id: 'SUN_ANGLE', name: 'Sun vector angle', value: 42.6, unit: 'deg', warnLo: 0, warnHi: 90, critLo: 0, critHi: 180, drift: 0.8 },
    { param_id: 'ST_QUALITY', name: 'Star tracker solution quality', value: 96.2, unit: '%', warnLo: 70, warnHi: 100, critLo: 50, critHi: 100, drift: 0.5 },
  ],
  THERMAL: [
    { param_id: 'OBC_TEMP', name: 'OBC board temperature', value: 34.1, unit: '°C', warnLo: -10, warnHi: 55, critLo: -20, critHi: 70, drift: 0.14 },
    { param_id: 'PL_TEMP', name: 'Payload sensor temperature', value: 12.4, unit: '°C', warnLo: 5, warnHi: 25, critLo: 0, critHi: 35, drift: 0.1 },
    { param_id: 'RAD_TEMP', name: 'Radiator temperature', value: -18.3, unit: '°C', warnLo: -40, warnHi: 10, critLo: -55, critHi: 25, drift: 0.3 },
    { param_id: 'PROP_TANK_TEMP', name: 'Propellant tank temperature', value: 21.7, unit: '°C', warnLo: 10, warnHi: 35, critLo: 5, critHi: 45, drift: 0.07 },
    { param_id: 'BAT_BAY_TEMP', name: 'Battery bay temperature', value: 19.8, unit: '°C', warnLo: 8, warnHi: 38, critLo: 2, critHi: 48, drift: 0.12 },
    { param_id: 'SA_TEMP', name: 'Solar array temperature', value: 54.2, unit: '°C', warnLo: -60, warnHi: 85, critLo: -80, critHi: 100, drift: 1.2 },
  ],
  COMMS: [
    { param_id: 'TX_POWER', name: 'X-band transmit power', value: 4.8, unit: 'W', warnLo: 3.5, warnHi: 6, critLo: 2, critHi: 7, drift: 0.05 },
    { param_id: 'RSSI', name: 'S-band uplink RSSI', value: -88.4, unit: 'dBm', warnLo: -110, warnHi: -50, critLo: -125, critHi: -40, drift: 0.9 },
    { param_id: 'SNR', name: 'Downlink signal-to-noise ratio', value: 14.2, unit: 'dB', warnLo: 8, warnHi: 25, critLo: 5, critHi: 30, drift: 0.3 },
    { param_id: 'BER', name: 'Bit error rate exponent', value: -7.2, unit: 'log10', warnLo: -9, warnHi: -5, critLo: -9, critHi: -3, drift: 0.08 },
    { param_id: 'VC0_FPS', name: 'Housekeeping frames per second', value: 120, unit: 'f/s', warnLo: 80, warnHi: 140, critLo: 40, critHi: 160, drift: 1.5 },
    { param_id: 'TX_TEMP', name: 'Transmitter temperature', value: 38.9, unit: '°C', warnLo: 0, warnHi: 60, critLo: -10, critHi: 75, drift: 0.2 },
    { param_id: 'ANT_DEPLOY', name: 'Antenna deployment state', value: 1, unit: '', warnLo: -1, warnHi: 2, critLo: -1, critHi: 2, drift: 0 }, // deployed (1) is normal; not-yet-deployed only matters pre-commissioning
  ],
  PAYLOAD: [
    { param_id: 'STORAGE_USED', name: 'Mass memory used', value: 432.8, unit: 'GB', warnLo: 0, warnHi: 900, critLo: 0, critHi: 1000, drift: 0.6 },
    { param_id: 'IMAGER_TEMP', name: 'Imager focal plane temperature', value: -12.6, unit: '°C', warnLo: -25, warnHi: 0, critLo: -35, critHi: 10, drift: 0.15 },
    { param_id: 'IMAGER_STATE', name: 'Imager state', value: 1, unit: '', warnLo: -1, warnHi: 4, critLo: -1, critHi: 4, drift: 0 }, // enum readout (STANDBY..IMAGING), not an alarmable range
    { param_id: 'FRAMES_CAPTURED', name: 'Frames captured this orbit', value: 1840, unit: 'cnt', warnLo: 0, warnHi: 5000, critLo: 0, critHi: 8000, drift: 3 },
    { param_id: 'SHUTTER_COUNT', name: 'Shutter actuations', value: 214930, unit: 'cnt', warnLo: 0, warnHi: 400000, critLo: 0, critHi: 500000, drift: 2 },
    { param_id: 'COMP_RATIO', name: 'Onboard compression ratio', value: 3.4, unit: ':1', warnLo: 2, warnHi: 6, critLo: 1, critHi: 8, drift: 0.05 },
  ],
  OBC: [
    { param_id: 'CPU_LOAD', name: 'CPU load', value: 28.5, unit: '%', warnLo: 0, warnHi: 85, critLo: 0, critHi: 98, drift: 1.8 },
    { param_id: 'RAM_FREE', name: 'Free memory', value: 512, unit: 'MB', warnLo: 64, warnHi: 1024, critLo: 16, critHi: 1024, drift: 4 },
    { param_id: 'BOOT_COUNT', name: 'Boot counter', value: 14, unit: 'cnt', warnLo: -1, warnHi: 50, critLo: -1, critHi: 100, drift: 0 }, // 0 boots since launch is fine; only a high count is worth a flag
    { param_id: 'OBT_DRIFT', name: 'On-board time drift from UTC', value: 1.8, unit: 'ms', warnLo: -50, warnHi: 50, critLo: -200, critHi: 200, drift: 0.4 },
    { param_id: 'SEU_COUNT', name: 'Single event upsets scrubbed', value: 7, unit: 'cnt', warnLo: -1, warnHi: 40, critLo: -1, critHi: 100, drift: 0 }, // zero upsets is the good outcome
    { param_id: 'TASK_OVERRUNS', name: 'Scheduler task overruns', value: 0, unit: 'cnt', warnLo: -1, warnHi: 5, critLo: -1, critHi: 20, drift: 0 }, // zero overruns is the good outcome
  ],
};

/** Suggested prompts, per audience. Every one of them has an answer in the copilot's retrieval (copilotEngine.ts). */
export const COPILOT_SUGGESTIONS = [
  'What do I do when a battery heater fails?',
  'Why is AKV-08 flagged, and did it enter safe mode?',
  'Which passes are booked for AKV-03 today?',
];
export const COPILOT_SUGGESTIONS_CUSTOMER = [
  'When is the next pass for my satellites?',
  'How are my satellites doing right now?',
  'Are there any open alarms on my satellites?',
];

/** Procedure knowledge the copilot cites (internal to the operator: never shown to customers). */
export const COPILOT_ANSWERS: Record<string, { text: string; citations: { doc: string; section: string; route?: string }[] }> = {
  heater: {
    text: 'Run PR-THM-004 Battery heater recovery. It switches heater A off, waits for the PUS 1 completion report, then switches heater B on. That step is critical and needs a second approver. Set the heater B setpoint to 15 °C and confirm BAT_TEMP is rising before closing out.',
    citations: [{ doc: 'PR-THM-004 Battery heater recovery v4.2.0', section: 'Steps 3–7', route: 'editor?proc=PR-THM-004' }],
  },
  safe: {
    text: 'Safe mode entry follows PR-SAFE-001: the spacecraft sun-points, sheds payload load and waits for ground. Recovery starts only after the cause is understood and a Flight Director approves leaving safe mode.',
    citations: [{ doc: 'PR-SAFE-001 Sun-pointing safe mode entry v5.0.0', section: 'Entry conditions, recovery', route: 'editor?proc=PR-SAFE-001' }],
  },
};

export const ROUTING_RULES: RoutingRule[] = [
  { trigger: 'CRITICAL alarm', target: 'Primary on-call', after_min: 5, escalate_to: 'Page secondary on-call' },
  { trigger: 'WARNING alarm', target: 'Primary on-call', after_min: 15, escalate_to: 'Escalate to Flight Director' },
  { trigger: 'Critical command awaiting approval', target: 'Flight Director', after_min: 2, escalate_to: 'Page Flight Director' },
  { trigger: 'AI advisory score ≥ 0.9', target: '#ops-akv channel' },
  { trigger: 'SLO burn rate > 10×', target: 'Platform on-call' },
  { trigger: 'Customer delivery failed', target: 'Customer success' },
];

export const SCENARIOS: Scenario[] = [
  { id: 'SC-THM-01', name: 'Battery heater failure and recovery', description: 'Heater A fails on, battery temperature falls, PR-THM-004 recovers with heater B.', duration_s: 420, verdict: 'PASSED' },
  { id: 'SC-ADCS-07', name: 'Reaction wheel stuck, safe mode entry', description: 'Wheel 1 seizes; ADCS enters sun-pointing safe mode.', duration_s: 600, verdict: 'NOT_RUN' },
  { id: 'SC-LNK-02', name: 'Link dropout mid-pass with COP-1 lockout', description: 'Station drops for 40 s; FOP-1 enters lockout and recovers.', duration_s: 300, verdict: 'FAILED' },
  { id: 'SC-MDB-19', name: 'akv-mdb 4.19.0 regression pack', description: 'Replays reference passes against the new dictionary bundle.', duration_s: 900, verdict: 'PASSED' },
  { id: 'SC-PWR-04', name: 'Deep eclipse, battery below 30 %', description: 'Long eclipse with payload active; load shedding must hold the bus above 26 V.', duration_s: 540, verdict: 'NOT_RUN' },
  { id: 'SC-OPS-11', name: 'Zone failover mid-pass', description: 'Kills one availability zone during an active pass; gap must stay under 30 s.', duration_s: 360, verdict: 'PASSED' },
  { id: 'SC-SEC-02', name: 'Stale interlock on a critical command', description: 'Freezes BAT_TEMP and confirms the gate fails closed rather than passing.', duration_s: 180, verdict: 'PASSED' },
];

