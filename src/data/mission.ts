/**
 * Mission reference data beyond the fleet itself: the module inventory, SLOs,
 * procedures, the command dictionary and the records already in the ledger.
 * Kept apart from fleet.ts so the fleet file stays about spacecraft.
 */

export type ModuleState = 'HEALTHY' | 'DEGRADED' | 'DOWN';

/** The 31 modules of Architecture v2.2, grouped by domain (S27 Platform health). */
export const MODULES: { name: string; domain: string; state: ModuleState; replicas: string; lag: number }[] = [
  { name: 'Pass Orchestrator', domain: 'Ground link', state: 'HEALTHY', replicas: '3/3', lag: 0 },
  { name: 'Link Gateway', domain: 'Ground link', state: 'HEALTHY', replicas: '6/6', lag: 12 },
  { name: 'Frame Processor', domain: 'Ground link', state: 'HEALTHY', replicas: '8/8', lag: 4 },
  { name: 'Forward Link Engine', domain: 'Ground link', state: 'HEALTHY', replicas: '4/4', lag: 0 },
  { name: 'Bulk Payload Pipeline', domain: 'Ground link', state: 'DEGRADED', replicas: '3/4', lag: 1840 },
  { name: 'TM Processor', domain: 'Telemetry', state: 'HEALTHY', replicas: '8/8', lag: 18 },
  { name: 'Live Telemetry', domain: 'Telemetry', state: 'HEALTHY', replicas: '6/6', lag: 2 },
  { name: 'TM Archive & Query', domain: 'Telemetry', state: 'HEALTHY', replicas: '4/4', lag: 96 },
  { name: 'Events & Alarms', domain: 'Telemetry', state: 'HEALTHY', replicas: '4/4', lag: 0 },
  { name: 'Command Service', domain: 'Commanding', state: 'HEALTHY', replicas: '3/3', lag: 0 },
  { name: 'Procedure Engine', domain: 'Commanding', state: 'HEALTHY', replicas: '3/3', lag: 0 },
  { name: 'TC Encoder', domain: 'Commanding', state: 'HEALTHY', replicas: '2/2', lag: 0 },
  { name: 'Key Management', domain: 'Commanding', state: 'HEALTHY', replicas: '2/2', lag: 0 },
  { name: 'Mission Database', domain: 'Mission ops', state: 'HEALTHY', replicas: '2/2', lag: 0 },
  { name: 'Flight Dynamics Bridge', domain: 'Mission ops', state: 'HEALTHY', replicas: '2/2', lag: 0 },
  { name: 'GS Resource Manager', domain: 'Mission ops', state: 'HEALTHY', replicas: '2/2', lag: 0 },
  { name: 'Planning & Scheduling', domain: 'Mission ops', state: 'HEALTHY', replicas: '3/3', lag: 0 },
  { name: 'Spacecraft Simulator', domain: 'Mission ops', state: 'HEALTHY', replicas: '2/2', lag: 0 },
  { name: 'Anomaly Detection', domain: 'Intelligence', state: 'HEALTHY', replicas: '4/4', lag: 34 },
  { name: 'Health Forecasting', domain: 'Intelligence', state: 'HEALTHY', replicas: '2/2', lag: 0 },
  { name: 'ML Platform', domain: 'Intelligence', state: 'DEGRADED', replicas: '3/4', lag: 0 },
  { name: 'Ops Copilot', domain: 'Intelligence', state: 'HEALTHY', replicas: '2/2', lag: 0 },
  { name: 'Edge API Gateway', domain: 'Experience', state: 'HEALTHY', replicas: '6/6', lag: 0 },
  { name: 'Operator BFF', domain: 'Experience', state: 'HEALTHY', replicas: '4/4', lag: 0 },
  { name: 'Realtime Gateway', domain: 'Experience', state: 'HEALTHY', replicas: '8/8', lag: 1 },
  { name: 'Customer API', domain: 'Experience', state: 'HEALTHY', replicas: '3/3', lag: 0 },
  { name: 'Web Console', domain: 'Experience', state: 'HEALTHY', replicas: '3/3', lag: 0 },
  { name: 'Identity (Keycloak)', domain: 'Security', state: 'HEALTHY', replicas: '3/3', lag: 0 },
  { name: 'Policy (OPA)', domain: 'Security', state: 'HEALTHY', replicas: '4/4', lag: 0 },
  { name: 'Audit Ledger', domain: 'Security', state: 'HEALTHY', replicas: '3/3', lag: 0 },
  { name: 'Notification Service', domain: 'Security', state: 'HEALTHY', replicas: '2/2', lag: 0 },
];

export const SLOS = [
  { name: 'Telemetry to screen P99', value: '71 ms', target: '100 ms', budget: 78, ok: true },
  { name: 'Alarm to screen', value: '0.42 s', target: '1 s', budget: 91, ok: true },
  { name: 'Command release P99', value: '138 ms', target: '150 ms', budget: 34, ok: true },
  { name: 'Pass-minute availability', value: '99.962 %', target: '99.95 %', budget: 62, ok: true },
  { name: 'History query P95', value: '2.31 s', target: '500 ms', budget: 0, ok: false },
];

export const ZONES = [
  { name: 'ap-south-1a', role: 'Primary', state: 'HEALTHY' as ModuleState },
  { name: 'ap-south-1b', role: 'Primary', state: 'HEALTHY' as ModuleState },
  { name: 'ap-south-1c', role: 'Primary', state: 'DEGRADED' as ModuleState },
  { name: 'ap-south-2 (DR)', role: 'Standby', state: 'HEALTHY' as ModuleState },
];

/** Procedures for the runner and the editor (S14, S16). */
export const PROCEDURES = [
  { id: 'PR-THM-004', name: 'Battery heater recovery', version: '4.2.0', state: 'RELEASED', steps: 9, author: 'Meera Iyer', category: 'Thermal' },
  { id: 'PR-ADCS-011', name: 'Reaction wheel desaturation', version: '2.6.1', state: 'RELEASED', steps: 7, author: 'Vikram Shetty', category: 'ADCS' },
  { id: 'PR-SAFE-001', name: 'Sun-pointing safe mode entry', version: '5.0.0', state: 'RELEASED', steps: 12, author: 'Ananya Rao', category: 'Safe mode' },
  { id: 'PR-PL-022', name: 'Imaging pass execution', version: '3.3.0', state: 'RELEASED', steps: 6, author: 'Karan Malhotra', category: 'Payload' },
  { id: 'PR-COM-008', name: 'X-band transmitter reset', version: '1.4.0', state: 'IN_REVIEW', steps: 5, author: 'Meera Iyer', category: 'Comms' },
  { id: 'PR-PWR-015', name: 'Battery reconditioning cycle', version: '2.0.0', state: 'DRAFT', steps: 11, author: 'Leena Joseph', category: 'Power' },
];

/** Command dictionary for the command console (S12). */
export const COMMANDS = [
  { mnemonic: 'HTR_SWITCH', name: 'Switch a battery heater circuit', apid: '0x021', pus: '8,1', critical: true, params: 'HEATER enum · STATE enum' },
  { mnemonic: 'SET_HTR_SETPOINT', name: 'Set heater setpoint', apid: '0x021', pus: '8,1', critical: false, params: 'HEATER enum · SETPOINT float 5–25 °C' },
  { mnemonic: 'DUMP_START', name: 'Start mass memory dump', apid: '0x033', pus: '8,1', critical: false, params: 'VCID uint · RATE enum' },
  { mnemonic: 'HK_RATE_SET', name: 'Set housekeeping rate', apid: '0x011', pus: '3,5', critical: false, params: 'RATE_HZ float 0.1–10' },
  { mnemonic: 'RW_DESAT', name: 'Desaturate reaction wheels', apid: '0x042', pus: '8,1', critical: true, params: 'WHEEL enum · DURATION uint s' },
  { mnemonic: 'SAFE_MODE', name: 'Enter sun-pointing safe mode', apid: '0x001', pus: '8,1', critical: true, params: 'CONFIRM enum' },
  { mnemonic: 'TX_POWER_SET', name: 'Set transmitter power', apid: '0x052', pus: '8,1', critical: false, params: 'POWER_W float 2–6' },
  { mnemonic: 'IMG_CAPTURE', name: 'Capture imaging sequence', apid: '0x061', pus: '8,1', critical: false, params: 'FRAMES uint · EXPOSURE_MS float' },
  { mnemonic: 'TIME_SYNC', name: 'Correlate on-board time', apid: '0x002', pus: '9,128', critical: false, params: 'UTC_NS uint64' },
  { mnemonic: 'PUS11_LOAD', name: 'Load time-based schedule', apid: '0x00B', pus: '11,4', critical: true, params: 'SCHEDULE blob' },
];

/** Already in the ledger when the console opens, so S26 is never empty. */
export const SEED_AUDIT: { operator_name: string; sat_id: string; command_mnemonic: string; result: 'ACK' | 'NACK' | 'TIMEOUT'; params_summary: string; minutes_ago: number }[] = [
  { operator_name: 'Vikram Shetty', sat_id: 'AKV-03', command_mnemonic: 'DUMP_START', result: 'ACK', params_summary: 'VCID=7 RATE=HIGH', minutes_ago: 8 },
  { operator_name: 'Vikram Shetty', sat_id: 'AKV-03', command_mnemonic: 'HK_RATE_SET', result: 'ACK', params_summary: 'RATE_HZ=1.0', minutes_ago: 25 },
  { operator_name: 'Karan Malhotra', sat_id: 'AKV-07', command_mnemonic: 'IMG_CAPTURE', result: 'ACK', params_summary: 'FRAMES=150 EXPOSURE_MS=4.2', minutes_ago: 52 },
  { operator_name: 'Meera Iyer', sat_id: 'AKV-01', command_mnemonic: 'HTR_SWITCH', result: 'ACK', params_summary: 'HEATER=A STATE=ON, approved by Ananya Rao', minutes_ago: 96 },
  { operator_name: 'Farah Siddiqui', sat_id: 'ALL', command_mnemonic: 'ROLE_GRANT', result: 'ACK', params_summary: 'Leena Joseph granted ML Engineer', minutes_ago: 140 },
  { operator_name: 'Vikram Shetty', sat_id: 'AKV-05', command_mnemonic: 'TX_POWER_SET', result: 'NACK', params_summary: 'POWER_W=7.5 rejected, above dictionary maximum', minutes_ago: 188 },
  { operator_name: 'Ananya Rao', sat_id: 'AKV-08', command_mnemonic: 'RW_DESAT', result: 'ACK', params_summary: 'WHEEL=1 DURATION=300, approved by Vikram Shetty', minutes_ago: 240 },
  { operator_name: 'Rohit Nair', sat_id: 'ALL', command_mnemonic: 'DEPLOY_FREEZE', result: 'ACK', params_summary: 'Freeze window opened for AKV-03 HYD pass', minutes_ago: 305 },
];
