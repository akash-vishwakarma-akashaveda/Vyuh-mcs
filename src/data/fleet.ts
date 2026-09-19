/**
 * Example fleet and mission data for SRS v2. Satellites AKV-01…10 (Akashaveda) and
 * NBH-01…02 (Nabhas Agritech), people, hashes and documents are fictional examples.
 */
import {
  Advisory, Approval, Delivery, GroundStation, MdbRelease, NotificationDelivery, OnCallEntry,
  PassReport, PassSession, RoutingRule, Satellite, Scenario,
} from '../types';
import { elementsFrom, periodMinutes, propagate } from '../orbit/orbit';

/** Three operators on one platform — the multi-tenant story, not a single-customer tool. */
export const TENANTS = ['Akashaveda', 'Nabhas Agritech', 'Terra Analytics'];

const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString();
const min = (n: number) => n * 60_000;

export const STATIONS: GroundStation[] = [
  { id: 'HYD', name: 'Hyderabad', provider: 'Akashaveda', protocol: 'Own', bands: ['S', 'X'], lat: 17.39, lon: 78.49, availability_pct: 99.4, quality_pct: 99.8, cost_per_min_usd: 14.0, adapter_health: 'OK', state: 'AVAILABLE' },
  { id: 'BLR', name: 'Bengaluru (ISTRAC)', provider: 'ISRO', protocol: 'SLE', bands: ['S'], lat: 12.97, lon: 77.59, availability_pct: 99.1, quality_pct: 99.6, cost_per_min_usd: 2.0, adapter_health: 'OK', state: 'AVAILABLE' },
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
 * Fleet health on open: mostly nominal, a handful genuinely in warning, nothing
 * critical until the guided demo puts AKV-03 there itself. A wall of red on the
 * first screen an investor sees reads as "broken demo," not "busy ops floor."
 */
const SEEDED_WARNING = new Set(['AKV-08', 'AKV-14', 'AKV-22', 'AKV-31', 'AKV-39', 'NBH-02', 'TRA-01']);

export const FLEET: Satellite[] = [
  ...Array.from({ length: 46 }).map((_, i) => build(`AKV-${String(i + 1).padStart(2, '0')}`, i, 'Akashaveda', 'LEO')),
  build('NBH-01', 46, 'Nabhas Agritech', 'LEO'),
  build('NBH-02', 47, 'Nabhas Agritech', 'LEO'),
  build('TRA-01', 48, 'Terra Analytics', 'MEO'),
  build('TRA-02', 49, 'Terra Analytics', 'MEO'),
];

function build(id: string, i: number, tenant: string, regime: 'LEO' | 'MEO'): Satellite & { tenant: string } {
  const plane = ['A', 'B', 'C', 'D'][i % 4];
  const health = SEEDED_WARNING.has(id) ? 'WARNING' : 'NOMINAL';
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
    health_state: health,
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

/** Same parameters in the shape the pre-v2 parameter cards expect. */
export const PARAM_CARDS: Record<string, { param_id: string; name: string; unit: string; limit_low_soft: number; limit_hi_soft: number; limit_low_hard: number; limit_hi_hard: number }[]> =
  Object.fromEntries(
    Object.entries(PARAMETERS).map(([sub, ps]) => [
      sub,
      ps.map((p) => ({
        param_id: p.param_id, name: p.name, unit: p.unit,
        limit_low_soft: p.warnLo, limit_hi_soft: p.warnHi,
        limit_low_hard: p.critLo, limit_hi_hard: p.critHi,
      })),
    ])
  );

export const PASSES: PassSession[] = [
  {
    session_id: 'LS-20260917-HYD-0412', sat_id: 'AKV-03', station_id: 'HYD',
    aos_utc: iso(-min(4)), tca_utc: iso(min(1)), los_utc: iso(min(7)),
    state: 'ACTIVE', max_elevation_deg: 46, frames_per_s: 258, spool_depth: 1,
    gaps: 0, e2e_latency_p99_ms: 76, standby_gateway: 'READY', booking: 'BOOKED',
    virtual_channels: [
      { vcid: 0, name: 'Housekeeping', frames_per_s: 120, gaps: 0, backfill: '—' },
      { vcid: 1, name: 'Events', frames_per_s: 18, gaps: 0, backfill: '—' },
      { vcid: 7, name: 'Payload bulk', frames_per_s: 120, gaps: 1, backfill: 'HYD recording' },
    ],
  },
  ...['AKV-01', 'AKV-05', 'AKV-08', 'NBH-01', 'AKV-02', 'AKV-07', 'TRA-01', 'AKV-22', 'NBH-02', 'TRA-02'].map((sat, i) => ({
    session_id: `LS-20260917-${['BLR', 'SVL', 'PTH', 'HYD', 'AWS', 'BLR', 'SGP', 'PTH', 'HYD', 'SVL'][i]}-04${13 + i}`,
    sat_id: sat, station_id: ['BLR', 'SVL', 'PTH', 'HYD', 'AWS', 'BLR', 'SGP', 'PTH', 'HYD', 'SVL'][i],
    aos_utc: iso(min(14 + i * 39)), tca_utc: iso(min(19 + i * 39)), los_utc: iso(min(25 + i * 39)),
    state: 'SCHEDULED' as const, max_elevation_deg: 28 + ((i * 11) % 55), frames_per_s: 0, spool_depth: 0,
    gaps: 0, e2e_latency_p99_ms: 0, standby_gateway: 'NONE' as const,
    booking: (i === 2 ? 'SHIFTED' : i === 4 ? 'PREDICTED' : 'BOOKED') as PassSession['booking'],
    virtual_channels: [],
  })),
];

export const PASS_REPORTS: PassReport[] = [
  {
    report_id: 'PR-20260917-HYD-0411', session_id: 'LS-20260917-HYD-0411', sat_id: 'AKV-03', station_id: 'HYD',
    aos_utc: iso(-min(48)), los_utc: iso(-min(37)), status: 'PROVISIONAL',
    completeness_pct: 99.4, frames_expected: 9440, frames_received: 9389, duplicates_merged: 110,
    latency_p50_ms: 41, latency_p95_ms: 68, latency_p99_ms: 84,
    gaps: [{ from_utc: iso(-min(43)), to_utc: iso(-min(42)), frames: 51, backfill: 'RUNNING', source: 'HYD recording' }],
    commands: [{ mnemonic: 'DUMP_START', result: 'VERIFIED' }, { mnemonic: 'HK_RATE_SET', result: 'VERIFIED' }],
  },
  {
    report_id: 'PR-20260917-BLR-0408', session_id: 'LS-20260917-BLR-0408', sat_id: 'AKV-01', station_id: 'BLR',
    aos_utc: iso(-min(184)), los_utc: iso(-min(173)), status: 'FINAL',
    completeness_pct: 100, frames_expected: 8920, frames_received: 8920, duplicates_merged: 42,
    latency_p50_ms: 38, latency_p95_ms: 61, latency_p99_ms: 74,
    gaps: [], commands: [{ mnemonic: 'HK_RATE_SET', result: 'VERIFIED' }],
  },
  {
    report_id: 'PR-20260917-SVL-0404', session_id: 'LS-20260917-SVL-0404', sat_id: 'AKV-07', station_id: 'SVL',
    aos_utc: iso(-min(322)), los_utc: iso(-min(309)), status: 'FINAL',
    completeness_pct: 97.1, frames_expected: 11200, frames_received: 10879, duplicates_merged: 210,
    latency_p50_ms: 52, latency_p95_ms: 88, latency_p99_ms: 121,
    gaps: [{ from_utc: iso(-min(318)), to_utc: iso(-min(317)), frames: 321, backfill: 'UNRECOVERABLE', source: 'station outage' }],
    commands: [{ mnemonic: 'IMG_CAPTURE', result: 'VERIFIED' }, { mnemonic: 'DUMP_START', result: 'FAILED' }],
  },
];

export const ADVISORIES: Advisory[] = [
  {
    advisory_id: 'AN-398', sat_id: 'AKV-08', tier: 'T2', score: 0.74,
    title: 'Reaction wheel 1 friction trend rising',
    detail: 'Wheel 1 current draw is 8 % above its 30-day baseline at the same speed.',
    detected_utc: iso(-min(180)), state: 'NEW', model: 'mv-adcs 2.4.1',
    contributors: [{ param: 'RW1_SPEED', contribution: 0.42 }, { param: 'BUS_VOLTAGE', contribution: 0.19 }],
  },
  {
    advisory_id: 'AN-397', sat_id: 'AKV-05', tier: 'T3', score: 0.61,
    title: 'Payload sensor temperature drifting',
    detail: 'Slow upward drift of 0.3 °C/day over 9 days.',
    detected_utc: iso(-min(600)), state: 'CONFIRMED', model: 'mv-thermal 1.9.0',
    contributors: [{ param: 'PL_TEMP', contribution: 0.55 }],
  },

  {
    advisory_id: 'AN-396', sat_id: 'AKV-02', tier: 'T2', score: 0.68,
    title: 'Mass memory filling faster than the downlink drains it',
    detail: 'Storage has risen every orbit for 3 days. At this rate the buffer is full in 9 orbits.',
    detected_utc: iso(-min(420)), state: 'NEW', model: 'mv-payload 1.2.0',
    contributors: [{ param: 'STORAGE_USED', contribution: 0.71 }, { param: 'FRAMES_CAPTURED', contribution: 0.18 }],
  },
  {
    advisory_id: 'AN-395', sat_id: 'NBH-02', tier: 'T3', score: 0.55,
    title: 'Battery recharge slower after eclipse',
    detail: 'Time to 80 % state of charge has grown 11 % over 30 days.',
    detected_utc: iso(-min(900)), state: 'NEW', model: 'mv-power 3.1.2',
    contributors: [{ param: 'BAT_SOC', contribution: 0.48 }, { param: 'ARRAY_I', contribution: 0.31 }],
  },
  {
    advisory_id: 'AN-394', sat_id: 'AKV-01', tier: 'T4', score: 0.34,
    title: 'On-board time drift within limits but trending',
    detail: 'Drift has grown 0.4 ms per day since the last correlation.',
    detected_utc: iso(-min(1600)), state: 'DISMISSED', model: 'mv-obc 0.9.4',
    contributors: [{ param: 'OBT_DRIFT', contribution: 0.88 }],
  },
  {
    advisory_id: 'AN-393', sat_id: 'AKV-07', tier: 'T2', score: 0.72,
    title: 'Transmitter temperature rising during long downlinks',
    detail: 'Peak TX_TEMP rose 6 °C across the last five X-band passes.',
    detected_utc: iso(-min(2200)), state: 'CONFIRMED', linked_alarm_id: 'AL-788', model: 'mv-comms 2.0.1',
    contributors: [{ param: 'TX_TEMP', contribution: 0.62 }, { param: 'TX_POWER', contribution: 0.21 }],
  },
];

/** Raised by the demo scenario; see useDemoStore. */
export const DEMO_ADVISORY: Advisory = {
  advisory_id: 'AN-401', sat_id: 'AKV-03', tier: 'T1', score: 0.93,
  title: 'Battery temperature falling while heater A runs at 97 % duty',
  detail: 'Multivariate model: BAT_TEMP is falling while HTR_A_DUTY is saturated — heater A likely failed.',
  detected_utc: '', state: 'NEW', model: 'mv-power 3.1.2',
  contributors: [
    { param: 'BAT_TEMP', contribution: 0.51 },
    { param: 'HTR_A_DUTY', contribution: 0.34 },
    { param: 'BUS_VOLTAGE', contribution: 0.09 },
  ],
};

export const DEMO_APPROVAL: Approval = {
  approval_id: 'AP-2261', command_id: 'CMD-8841', sat_id: 'AKV-03',
  mnemonic: 'HTR_SWITCH', params: { HEATER: 'B', STATE: 'ON' },
  reason: 'PR-THM-004 step 5 — heater A failed, switch to heater B',
  requested_by: 'Vikram Shetty', requested_utc: '', expires_utc: '',
  state: 'PENDING',
  interlocks: [
    { param: 'BAT_TEMP', value: '8.4 °C', rule: 'must be < 10.0 °C', pass: true },
    { param: 'HTR_A_STATE', value: 'OFF', rule: 'must be OFF', pass: true },
    { param: 'LINK', value: 'HYD locked', rule: 'satellite in contact', pass: true },
  ],
};

interface ProcStep {
  n: number;
  kind: 'check' | 'command' | 'wait' | 'operator';
  text: string;
  critical: boolean;
  mnemonic?: string;
  params?: Record<string, string | number>;
}

export const PROCEDURE_PR_THM_004: {
  id: string; name: string; version: string; satellite_class: string; steps: ProcStep[]; yaml: string;
} = {
  id: 'PR-THM-004',
  name: 'Battery heater recovery',
  version: '4.2.0',
  satellite_class: 'akv-adb',
  steps: [
    { n: 1, kind: 'check', text: 'Verify satellite in contact and link locked', critical: false },
    { n: 2, kind: 'check', text: 'Verify BAT_TEMP below 10.0 °C', critical: false },
    { n: 3, kind: 'command', text: 'Switch heater A OFF', critical: false, mnemonic: 'HTR_SWITCH', params: { HEATER: 'A', STATE: 'OFF' } },
    { n: 4, kind: 'wait', text: 'Wait for PUS 1 completion report', critical: false },
    { n: 5, kind: 'command', text: 'Switch heater B ON (critical — second approver)', critical: true, mnemonic: 'HTR_SWITCH', params: { HEATER: 'B', STATE: 'ON' } },
    { n: 6, kind: 'command', text: 'Set heater B setpoint 15 °C', critical: false, mnemonic: 'SET_HTR_SETPOINT', params: { HEATER: 'B', SETPOINT: 15 } },
    { n: 7, kind: 'wait', text: 'Wait for BAT_TEMP to rise above 12.0 °C', critical: false },
    { n: 8, kind: 'operator', text: 'Operator confirms temperature trend is rising', critical: false },
    { n: 9, kind: 'check', text: 'Close out and record in pass report', critical: false },
  ],
  yaml: `id: PR-THM-004
name: Battery heater recovery
version: 4.2.0
satellite_class: akv-adb
steps:
  - kind: check
    condition: link.locked == true
  - kind: check
    condition: BAT_TEMP < 10.0
  - kind: command
    mnemonic: HTR_SWITCH
    params: { HEATER: A, STATE: OFF }
  - kind: wait
    for: pus1.completion
    timeout: 30s
  - kind: command
    mnemonic: HTR_SWITCH
    params: { HEATER: B, STATE: ON }
    critical: true          # second approver required
  - kind: command
    mnemonic: SET_HTR_SETPOINT
    params: { HEATER: B, SETPOINT: 15 }
  - kind: wait
    condition: BAT_TEMP > 12.0
    timeout: 600s
  - kind: operator
    prompt: Confirm temperature trend is rising
  - kind: check
    condition: true
`,
};

export const COPILOT_SUGGESTIONS = [
  'What do I do when a battery heater fails?',
  'Why did AKV-08 enter safe mode last week?',
  'Which passes are booked for AKV-03 today?',
];

export const COPILOT_ANSWERS: Record<string, { text: string; citations: { doc: string; section: string; route?: string }[] }> = {
  heater: {
    text: 'Run PR-THM-004 Battery heater recovery. It switches heater A off, waits for the PUS 1 completion report, then switches heater B on — that step is critical and needs a second approver. Set the heater B setpoint to 15 °C and confirm BAT_TEMP is rising before closing out.\n\nI can explain the procedure but I have no permission to run it.',
    citations: [
      { doc: 'PR-THM-004 Battery heater recovery v4.2.0', section: 'Steps 3–7', route: 'procedure' },
      { doc: 'Pass report PR-20260812-BLR-0331', section: 'Anomalies', route: 'report' },
    ],
  },
};

export const ONCALL: OnCallEntry[] = [
  { position: 'Primary', name: 'Vikram Shetty', until_utc: iso(min(260)) },
  { position: 'Secondary', name: 'Meera Iyer', until_utc: iso(min(260)) },
  { position: 'Flight Director', name: 'Ananya Rao', until_utc: iso(min(500)) },
];

export const ROUTING_RULES: RoutingRule[] = [
  { trigger: 'CRITICAL alarm', target: 'Primary on-call', after_min: 5, escalate_to: 'Page secondary on-call' },
  { trigger: 'WARNING alarm', target: 'Primary on-call', after_min: 15, escalate_to: 'Escalate to Flight Director' },
  { trigger: 'Critical command awaiting approval', target: 'Flight Director', after_min: 2, escalate_to: 'Page Flight Director' },
  { trigger: 'AI advisory score ≥ 0.9', target: '#ops-akv channel' },
  { trigger: 'SLO burn rate > 10×', target: 'Platform on-call' },
  { trigger: 'Customer delivery failed', target: 'Customer success' },
];

export const DELIVERY_LOG: NotificationDelivery[] = [
  { id: 'ND-5521', trigger: 'WARNING alarm AL-799', channel: 'Push', recipient: 'Vikram Shetty', sent_utc: iso(-min(22)), state: 'ACKNOWLEDGED' },
  { id: 'ND-5520', trigger: 'AI advisory AN-398', channel: 'Slack #ops-akv', recipient: 'Ops channel', sent_utc: iso(-min(180)), state: 'DELIVERED' },
  { id: 'ND-5519', trigger: 'SLO burn rate', channel: 'Email', recipient: 'Platform on-call', sent_utc: iso(-min(240)), state: 'RETRYING' },
  { id: 'ND-5518', trigger: 'CRITICAL alarm AL-796', channel: 'Voice', recipient: 'Meera Iyer', sent_utc: iso(-min(420)), state: 'ESCALATED' },
];

export const MDB_RELEASES: MdbRelease[] = [
  {
    version: 'akv-mdb 4.20.0', state: 'IN_REVIEW', author: 'Meera Iyer', created_utc: iso(-min(90)),
    reviewers: [{ name: 'Ananya Rao', approved: true }, { name: 'Karan Malhotra', approved: false }],
    diff: [
      { change: 'CHANGED', item: 'BAT_TEMP warning low', from: '10.0 °C', to: '11.0 °C' },
      { change: 'ADDED', item: 'HTR_B_DUTY (calibrated, %)' },
      { change: 'CHANGED', item: 'HTR_SWITCH critical flag', from: 'false', to: 'true' },
    ],
    effective: [{ sat_id: 'AKV-01', effective_utc: iso(min(120)) }, { sat_id: 'AKV-02', effective_utc: iso(min(180)) }],
    bundle_sha256: 'b41f0c7e29a5d6188c0a7f4b21e9c5d3a86f1e4470bd9c2a3f8e10d6c5b4a3921',
  },
  {
    version: 'akv-mdb 4.19.0', state: 'ACTIVE', author: 'Meera Iyer', created_utc: iso(-min(60 * 24 * 6)),
    reviewers: [{ name: 'Ananya Rao', approved: true }, { name: 'Karan Malhotra', approved: true }],
    diff: [{ change: 'ADDED', item: 'HTR_A_DUTY (calibrated, %)' }],
    effective: FLEET.filter((s) => s.sat_id.startsWith('AKV')).map((s) => ({ sat_id: s.sat_id, effective_utc: iso(-min(60 * 24 * 5)) })),
    bundle_sha256: '7c1a93ef00d2b58a4419e7c6d3b2f1085a9e4d7c6b5a493827160f5e4d3c2b1a',
  },
];

export const DELIVERIES: Delivery[] = [
  { delivery_id: 'DL-26261-014', sat_id: 'AKV-03', station_id: 'HYD', tenant: 'Akashaveda', size_mb: 1123, chunks_received: 184, chunks_total: 184, checksum_ok: true, state: 'L0_READY', started_utc: iso(-min(26)), manifest: [{ name: 'AKV03_L0_26261_1512.pkt', bytes: 1177452544, sha256: 'a41c9e…1123' }] },
  { delivery_id: 'DL-26261-013', sat_id: 'NBH-02', station_id: 'BLR', tenant: 'Nabhas Agritech', size_mb: 842, chunks_received: 121, chunks_total: 140, checksum_ok: true, state: 'RECEIVING', started_utc: iso(-min(9)), manifest: [] },
  { delivery_id: 'DL-26261-012', sat_id: 'AKV-07', station_id: 'SVL', tenant: 'Akashaveda', size_mb: 2290, chunks_received: 372, chunks_total: 372, checksum_ok: true, state: 'DELIVERED', started_utc: iso(-min(95)), manifest: [{ name: 'AKV07_L0_26261_1402.pkt', bytes: 2401239040, sha256: '22c6b8…2290' }] },
  { delivery_id: 'DL-26261-011', sat_id: 'AKV-01', station_id: 'PTH', tenant: 'Akashaveda', size_mb: 1410, chunks_received: 198, chunks_total: 214, checksum_ok: false, state: 'CHECKSUM_FAILED', started_utc: iso(-min(140)), manifest: [] },
  { delivery_id: 'DL-26261-010', sat_id: 'NBH-01', station_id: 'HYD', tenant: 'Nabhas Agritech', size_mb: 664, chunks_received: 96, chunks_total: 96, checksum_ok: true, state: 'DELIVERED', started_utc: iso(-min(210)), manifest: [{ name: 'NBH01_L0_26261_1210.pkt', bytes: 696254464, sha256: '9f2d41…0664' }] },
  { delivery_id: 'DL-26261-009', sat_id: 'AKV-05', station_id: 'AWS', tenant: 'Akashaveda', size_mb: 1980, chunks_received: 240, chunks_total: 302, checksum_ok: true, state: 'MERGING', started_utc: iso(-min(48)), manifest: [] },
  { delivery_id: 'DL-26261-008', sat_id: 'AKV-03', station_id: 'BLR', tenant: 'Akashaveda', size_mb: 1044, chunks_received: 168, chunks_total: 168, checksum_ok: true, state: 'DELIVERED', started_utc: iso(-min(280)), manifest: [{ name: 'AKV03_L0_26261_1104.pkt', bytes: 1094713344, sha256: '6b18c3…1044' }] },
  { delivery_id: 'DL-26261-007', sat_id: 'AKV-10', station_id: 'PTH', tenant: 'Akashaveda', size_mb: 1770, chunks_received: 289, chunks_total: 289, checksum_ok: true, state: 'L0_READY', started_utc: iso(-min(360)), manifest: [{ name: 'AKV10_L0_26261_1002.pkt', bytes: 1856076800, sha256: 'd41e77…1770' }] },
  { delivery_id: 'DL-26261-006', sat_id: 'TRA-01', station_id: 'SGP', tenant: 'Terra Analytics', size_mb: 1288, chunks_received: 210, chunks_total: 210, checksum_ok: true, state: 'DELIVERED', started_utc: iso(-min(410)), manifest: [{ name: 'TRA01_L0_26261_0902.pkt', bytes: 1350565888, sha256: '5c94a2…1288' }] },
  { delivery_id: 'DL-26261-005', sat_id: 'TRA-02', station_id: 'PTH', tenant: 'Terra Analytics', size_mb: 596, chunks_received: 74, chunks_total: 110, checksum_ok: true, state: 'RECEIVING', started_utc: iso(-min(15)), manifest: [] },
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

export const SIM_FLEET = ['SIM-01', 'SIM-02', 'SIM-03', 'SIM-04'];
