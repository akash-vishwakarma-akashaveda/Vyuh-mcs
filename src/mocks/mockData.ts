import { Satellite, Param, ContactWindow, Procedure, Anomaly, AuditRecord, ServiceHealth, User } from '../types';

export const MOCK_SATELLITES: Satellite[] = Array.from({ length: 50 }).map((_, i) => {
  const pad = (i + 1).toString().padStart(3, '0');
  const plane = Math.floor(i / 10) + 1;
  const isWarning = i === 3 || i === 14 || i === 28;
  const isCritical = i === 7;
  const health = isCritical ? 'CRITICAL' : isWarning ? 'WARNING' : 'NOMINAL';

  return {
    sat_id: `SAT-${pad}`,
    name: `VYUH-LEO-${pad}`,
    status: 'ACTIVE',
    orbit_regime: 'LEO',
    constellation_group: `Plane ${plane}`,
    health_state: health,
    last_contact_utc: new Date(Date.now() - (i % 5) * 120000).toISOString(),
    next_contact_utc: new Date(Date.now() + ((i % 5) + 1) * 300000).toISOString(),
    latitude: -60 + ((i * 13) % 120),
    longitude: -180 + ((i * 27) % 360),
    altitude_km: 520 + (i % 15),
    velocity_kms: 7.61 + (i % 3) * 0.02,
    period_minutes: 94.8 + (i % 5) * 0.2,
    inclination_deg: 53.0 + (i % 3) * 20.0,
    eccentricity: 0.0012 + (i % 4) * 0.0005,
    raan_deg: Number(((i * 360) / 50).toFixed(1)),
    arg_of_perigee_deg: (i * 45) % 360,
    true_anomaly_deg: (i * 18) % 360,
    apogee_km: 532 + (i % 10),
    perigee_km: 512 + (i % 8),
    assigned_ground_stations: ['KSAT-Svalbard', 'SGS-Chile', 'SANSA-Hartebeeshoek'],
    mib_version: 'v2.3.1',
    tle: [
      `1 500${pad}U 26001A   26166.50000000  .00001000  00000-0  50000-4 0  9991`,
      `2 500${pad}  53.0000 ${(i * 7.2).toFixed(4)} 0012000 ${(i * 45).toFixed(4)} ${(i * 18).toFixed(4)} 15.12345678 1001`
    ],
  };
});

export const MOCK_PARAMETERS: Record<string, Partial<Param>[]> = {
  POWER: [
    { param_id: 'BUS_VOLTAGE_1', name: 'Main Power Bus Voltage', eu_value: 28.4, unit: 'V', limit_low_soft: 26.0, limit_hi_soft: 30.0, limit_low_hard: 24.0, limit_hi_hard: 32.0, calibration_eq: 'EU = DN * 0.0125 + 0.1' },
    { param_id: 'BATT_TEMP_1', name: 'Battery Array 1 Temp', eu_value: 18.2, unit: '°C', limit_low_soft: 0.0, limit_hi_soft: 40.0, limit_low_hard: -10.0, limit_hi_hard: 50.0, calibration_eq: 'EU = (DN / 1024) * 100 - 50' },
    { param_id: 'BATT_SOC', name: 'Battery State of Charge', eu_value: 94.5, unit: '%', limit_low_soft: 40.0, limit_hi_soft: 100.0, limit_low_hard: 20.0, limit_hi_hard: 100.0, calibration_eq: 'EU = DN * 0.1' },
    { param_id: 'SOLAR_PANEL_I', name: 'Array Generation Current', eu_value: 14.8, unit: 'A', limit_low_soft: 2.0, limit_hi_soft: 20.0, limit_low_hard: 0.0, limit_hi_hard: 25.0, calibration_eq: 'EU = DN * 0.05' },
  ],
  ADCS: [
    { param_id: 'RW_SPEED_1', name: 'Reaction Wheel 1 RPM', eu_value: 3200, unit: 'RPM', limit_low_soft: -5000, limit_hi_soft: 5000, limit_low_hard: -6000, limit_hi_hard: 6000, calibration_eq: 'EU = DN * 2.5' },
    { param_id: 'RW_SPEED_2', name: 'Reaction Wheel 2 RPM', eu_value: -2450, unit: 'RPM', limit_low_soft: -5000, limit_hi_soft: 5000, limit_low_hard: -6000, limit_hi_hard: 6000, calibration_eq: 'EU = DN * 2.5' },
    { param_id: 'ATTITUDE_ERR', name: 'Pointing Error Vector', eu_value: 0.024, unit: 'deg', limit_low_soft: 0.0, limit_hi_soft: 0.1, limit_low_hard: 0.0, limit_hi_hard: 0.5, calibration_eq: 'EU = DN * 0.001' },
    { param_id: 'GYRO_DRIFT_X', name: 'FOG Gyro X Rate', eu_value: 0.0012, unit: 'deg/s', limit_low_soft: -0.01, limit_hi_soft: 0.01, limit_low_hard: -0.05, limit_hi_hard: 0.05, calibration_eq: 'EU = DN * 0.0001' },
  ],
  THERMAL: [
    { param_id: 'OBC_TEMP', name: 'OBC Mainboard Temp', eu_value: 34.1, unit: '°C', limit_low_soft: -10, limit_hi_soft: 55, limit_low_hard: -20, limit_hi_hard: 70, calibration_eq: 'EU = DN * 0.25' },
    { param_id: 'PAYLOAD_TEMP', name: 'Optical Payload Sensor Temp', eu_value: 12.4, unit: '°C', limit_low_soft: 5, limit_hi_soft: 25, limit_low_hard: 0, limit_hi_hard: 35, calibration_eq: 'EU = DN * 0.1' },
    { param_id: 'STR_TEMP', name: 'Star Tracker Thermal Sensor', eu_value: -4.2, unit: '°C', limit_low_soft: -20, limit_hi_soft: 20, limit_low_hard: -35, limit_hi_hard: 35, calibration_eq: 'EU = DN * 0.2' },
  ],
  COMMS: [
    { param_id: 'TX_POWER', name: 'X-Band Downlink Transmitter Power', eu_value: 4.8, unit: 'W', limit_low_soft: 3.5, limit_hi_soft: 6.0, limit_low_hard: 2.0, limit_hi_hard: 7.0, calibration_eq: 'EU = DN * 0.01' },
    { param_id: 'RSSI_S_BAND', name: 'S-Band Uplink RSSI', eu_value: -88.4, unit: 'dBm', limit_low_soft: -110, limit_hi_soft: -50, limit_low_hard: -125, limit_hi_hard: -40, calibration_eq: 'EU = DN * 0.5 - 140' },
    { param_id: 'BER_X_BAND', name: 'Demodulator Bit Error Rate', eu_value: 1.2e-7, unit: '', limit_low_soft: 0, limit_hi_soft: 1e-5, limit_low_hard: 0, limit_hi_hard: 1e-3, calibration_eq: 'EU = 10^(-DN)' },
  ],
  PAYLOAD: [
    { param_id: 'CAM_STATUS', name: 'High-Res Multispectral Imager', eu_value: 1, unit: 'state', calibration_eq: '1=STANDBY, 2=IMAGING' },
    { param_id: 'STORAGE_USED', name: 'Solid State Mass Memory', eu_value: 432.8, unit: 'GB', limit_low_soft: 0, limit_hi_soft: 900, limit_low_hard: 0, limit_hi_hard: 1000, calibration_eq: 'EU = DN * 0.1' },
  ],
  OBC: [
    { param_id: 'CPU_LOAD', name: 'Core Processing Unit Load', eu_value: 28.5, unit: '%', limit_low_soft: 0, limit_hi_soft: 85, limit_low_hard: 0, limit_hi_hard: 98, calibration_eq: 'EU = DN * 1' },
    { param_id: 'RAM_FREE', name: 'Available Memory', eu_value: 512, unit: 'MB', limit_low_soft: 64, limit_hi_soft: 1024, limit_low_hard: 16, limit_hi_hard: 1024, calibration_eq: 'EU = DN * 4' },
    { param_id: 'BOOT_COUNT', name: 'Scrubbed Boot Counter', eu_value: 14, unit: 'cnt', calibration_eq: 'EU = DN' },
  ],
};

export const MOCK_PROCEDURES: Procedure[] = [
  {
    id: 'PROC-SAFE-01',
    name: 'Sun-Pointing Safe Mode Transition',
    version: '2.1',
    category: 'Safe Mode',
    last_used_utc: new Date(Date.now() - 86400000 * 3).toISOString(),
    target_satellites: ['ALL_LEO'],
    script_content: `// Step 1: Inhibit Non-Essential Payloads
TC_EXEC(PAYLOAD_POWER_OFF);
WAIT_TELEMETRY(PAYLOAD_CURRENT == 0, TIMEOUT=10s);

// Step 2: Orient Solar Arrays to Sun Vector
TC_EXEC(ADCS_SET_MODE, MODE="SUN_POINTING");
WAIT_TELEMETRY(ATTITUDE_ERR < 0.5, TIMEOUT=60s);

// Step 3: Enable Beaconing
TC_EXEC(COMMS_SET_BEACON_INTERVAL, SECONDS=10);`,
    step_count: 3,
    author: 'Dr. V. Raman',
    created_utc: '2026-01-15T09:00:00Z',
  },
  {
    id: 'PROC-HK-04',
    name: 'Battery Reconditioning & Thermal Balancing',
    version: '1.4',
    category: 'Housekeeping',
    last_used_utc: new Date(Date.now() - 86400000).toISOString(),
    target_satellites: ['SAT-001', 'SAT-002'],
    script_content: `TC_EXEC(HEATER_ZONE_1_ON, TEMP_TARGET=20);
WAIT_TELEMETRY(BATT_TEMP_1 >= 15, TIMEOUT=300s);
TC_EXEC(BATT_TRICKLE_CHARGE_ENABLE);`,
    step_count: 3,
    author: 'K. Patel',
    created_utc: '2026-03-22T14:30:00Z',
  },
  {
    id: 'PROC-PAYLOAD-09',
    name: 'High-Res Optical Imaging Pass Execution',
    version: '3.0',
    category: 'Payload Ops',
    last_used_utc: new Date(Date.now() - 3600000 * 4).toISOString(),
    target_satellites: ['SAT-001', 'SAT-003'],
    script_content: `TC_EXEC(CAM_POWER_ON);
WAIT_TELEMETRY(CAM_STATUS == 1, TIMEOUT=30s);
TC_EXEC(ADCS_SET_TARGET, LAT=28.6139, LON=77.2090);
WAIT_TELEMETRY(ATTITUDE_ERR < 0.05, TIMEOUT=120s);
TC_EXEC(CAM_TRIGGER_BURST, FRAMES=150, EXPOSURE_MS=4.2);
TC_EXEC(CAM_STANDBY);`,
    step_count: 6,
    author: 'A. Sharma',
    created_utc: '2026-05-10T11:15:00Z',
  },
];

export const MOCK_CONTACT_WINDOWS: ContactWindow[] = Array.from({ length: 12 }).map((_, i) => {
  const satId = `SAT-${((i % 5) + 1).toString().padStart(3, '0')}`;
  const now = Date.now();
  const aosOffset = (i - 2) * 45 * 60 * 1000;
  const aos = new Date(now + aosOffset).toISOString();
  const los = new Date(now + aosOffset + 12 * 60 * 1000).toISOString();
  const isAOS = i === 2;

  return {
    window_id: `WIN-2026-${(100 + i)}`,
    sat_id: satId,
    ground_station: i % 3 === 0 ? 'KSAT-Svalbard' : i % 3 === 1 ? 'SGS-Chile' : 'SANSA-Hartebeeshoek',
    aos_utc: aos,
    los_utc: los,
    duration_seconds: 720,
    max_elevation_deg: 42 + (i * 3) % 45,
    frequency_band: i % 2 === 0 ? 'X' : 'S',
    quality_score: 88 + (i % 12),
    status: isAOS ? 'AOS' : i < 2 ? 'LOS' : 'UPCOMING',
  };
});

export const MOCK_ANOMALIES: Anomaly[] = [
  {
    anomaly_id: 'ANO-2026-0881',
    sat_id: 'SAT-007',
    param_id: 'BATT_TEMP_1',
    subsystem: 'POWER',
    type: 'TREND',
    confidence: 94.2,
    severity: 'CRITICAL',
    detected_utc: new Date(Date.now() - 14 * 60000).toISOString(),
    resolved_utc: null,
    description: 'Thermal rise of +1.8°C/min detected on Battery Array 1 during eclipse shadow. Exceeds historical baseline vector by 3.2σ.',
  },
  {
    anomaly_id: 'ANO-2026-0880',
    sat_id: 'SAT-003',
    param_id: 'RW_SPEED_1',
    subsystem: 'ADCS',
    type: 'POINT',
    confidence: 87.5,
    severity: 'WARNING',
    detected_utc: new Date(Date.now() - 48 * 60000).toISOString(),
    resolved_utc: null,
    description: 'Reaction wheel 1 tachometer pulse glitch: instantaneous delta of 450 RPM without torque command.',
  },
  {
    anomaly_id: 'ANO-2026-0879',
    sat_id: 'SAT-014',
    param_id: 'TX_POWER',
    subsystem: 'COMMS',
    type: 'CONTEXTUAL',
    confidence: 91.0,
    severity: 'WARNING',
    detected_utc: new Date(Date.now() - 120 * 60000).toISOString(),
    resolved_utc: new Date(Date.now() - 30 * 60000).toISOString(),
    description: 'RF Output RF_PWR dropped by 0.8W while temperature remained nominal during Svalbard pass.',
  },
];

export const MOCK_AUDIT_LOGS: AuditRecord[] = Array.from({ length: 15 }).map((_, i) => ({
  record_id: `AUD-90210-${1000 + i}`,
  timestamp_utc: new Date(Date.now() - i * 1800000).toISOString(),
  operator_id: 'USR-001',
  operator_name: 'Akashaveda Mission Controller',
  sat_id: `SAT-${((i % 5) + 1).toString().padStart(3, '0')}`,
  command_mnemonic: i % 2 === 0 ? 'TC_ADCS_SET_MODE' : 'TC_PAYLOAD_ENABLE',
  procedure_id: i % 2 === 0 ? 'PROC-SAFE-01' : 'PROC-PAYLOAD-09',
  procedure_version: '2.1',
  sequence_count: 1042 + i,
  result: i === 4 ? 'NACK' : i === 8 ? 'TIMEOUT' : 'ACK',
  bytes_sha256: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852${1000 + i}`,
  prev_record_sha256: `8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327a${i}`,
  params_summary: `MODE="SUN_POINTING", TIMEOUT=60s`,
}));

export const MOCK_SERVICES: ServiceHealth[] = [
  { name: 'TFPE (Telemetry Frame Processor)', status: 'RUNNING', replicas_current: 4, replicas_desired: 4, cpu_pct: 18.2, memory_pct: 42.1, last_restart_utc: '2026-06-01T00:00:00Z' },
  { name: 'TPPP (Telemetry Parameter Processor)', status: 'RUNNING', replicas_current: 6, replicas_desired: 6, cpu_pct: 31.4, memory_pct: 58.0, last_restart_utc: '2026-06-01T00:00:00Z' },
  { name: 'TDAE Hot Path (WebSocket & CVT)', status: 'RUNNING', replicas_current: 8, replicas_desired: 8, cpu_pct: 24.8, memory_pct: 64.3, last_restart_utc: '2026-06-01T00:00:00Z' },
  { name: 'TDAE Cold Path (TimescaleDB)', status: 'RUNNING', replicas_current: 3, replicas_desired: 3, cpu_pct: 44.0, memory_pct: 71.2, last_restart_utc: '2026-06-01T00:00:00Z' },
  { name: 'UPE (Uplink Procedure Engine)', status: 'RUNNING', replicas_current: 4, replicas_desired: 4, cpu_pct: 12.0, memory_pct: 35.5, last_restart_utc: '2026-06-01T00:00:00Z' },
  { name: 'UTFE (Uplink Transfer Frame)', status: 'RUNNING', replicas_current: 4, replicas_desired: 4, cpu_pct: 9.5, memory_pct: 29.8, last_restart_utc: '2026-06-01T00:00:00Z' },
  { name: 'FDS Bridge (Flight Dynamics)', status: 'RUNNING', replicas_current: 2, replicas_desired: 2, cpu_pct: 52.1, memory_pct: 82.0, last_restart_utc: '2026-06-01T00:00:00Z' },
  { name: 'AI Anomaly & Predictive Service', status: 'DEGRADED', replicas_current: 3, replicas_desired: 4, cpu_pct: 88.4, memory_pct: 89.1, last_restart_utc: '2026-08-14T04:12:00Z' },
  { name: 'Config Sync & MIB Service', status: 'RUNNING', replicas_current: 2, replicas_desired: 2, cpu_pct: 5.2, memory_pct: 22.0, last_restart_utc: '2026-06-01T00:00:00Z' },
  { name: 'API Gateway (Istio Envoy)', status: 'RUNNING', replicas_current: 6, replicas_desired: 6, cpu_pct: 19.8, memory_pct: 45.0, last_restart_utc: '2026-06-01T00:00:00Z' },
];

export const MOCK_USERS: User[] = [
  { id: 'USR-001', name: 'Akashaveda Mission Controller', email: 'controller@vyuh-mcs.com', roles: ['Mission Controller', 'System Administrator'], satellite_scope: ['ALL'], last_login_utc: new Date().toISOString(), status: 'ACTIVE', mfa_enabled: true },
  { id: 'USR-002', name: 'Kavya Nair', email: 'kavya.nair@akashaveda.com', roles: ['Flight Engineer'], satellite_scope: ['SAT-001', 'SAT-002', 'SAT-003'], last_login_utc: new Date(Date.now() - 3600000 * 5).toISOString(), status: 'ACTIVE', mfa_enabled: true },
  { id: 'USR-003', name: 'Marcus Vance', email: 'marcus.v@akashaveda.com', roles: ['Payload Engineer'], satellite_scope: ['SAT-001', 'SAT-004'], last_login_utc: new Date(Date.now() - 86400000 * 2).toISOString(), status: 'ACTIVE', mfa_enabled: false },
  { id: 'USR-004', name: 'Dr. Elena Rostova', email: 'elena.r@akashaveda.com', roles: ['Mission Designer'], satellite_scope: ['ALL'], last_login_utc: new Date(Date.now() - 3600000 * 12).toISOString(), status: 'ACTIVE', mfa_enabled: true },
];
