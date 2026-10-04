/**
 * Mission reference data beyond the fleet itself: the module inventory, SLOs,
 * procedures and the command dictionary. The records already in the ledger are the demo scenario's.
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
  { id: 'PR-ADCS-011', name: 'Reaction wheel desaturation', version: '2.6.1', state: 'RELEASED', steps: 5, author: 'Vikram Shetty', category: 'ADCS' },
  { id: 'PR-SAFE-001', name: 'Sun-pointing safe mode entry', version: '5.0.0', state: 'RELEASED', steps: 5, author: 'Ananya Rao', category: 'Safe mode' },
  { id: 'PR-PL-022', name: 'Imaging pass execution', version: '3.3.0', state: 'RELEASED', steps: 5, author: 'Karan Malhotra', category: 'Payload' },
  { id: 'PR-COM-008', name: 'X-band transmitter reset', version: '1.4.0', state: 'IN_REVIEW', steps: 5, author: 'Meera Iyer', category: 'Comms' },
  { id: 'PR-PWR-015', name: 'Battery reconditioning cycle', version: '2.0.0', state: 'DRAFT', steps: 11, author: 'Leena Joseph', category: 'Power' },
];

/** One executable step. `check` and `wait` conditions are evaluated against live telemetry. */
export type StepCond = { param: string; op: '<' | '>'; value: number; unit?: string } | { contact: true } | { always: true };
export interface ProcStepDef {
  n: number;
  kind: 'check' | 'command' | 'wait' | 'operator';
  text: string;
  critical?: boolean;
  mnemonic?: string;
  params?: Record<string, string | number>;
  /** check: must hold now. wait: wait until it holds (or `pus1` = the previous command's TM(1,7)). */
  cond?: StepCond;
  waitFor?: 'pus1';
  timeoutS?: number;
}

/**
 * The released procedures as the runner executes them. The editor's YAML is their source; the
 * runner keeps the version it started with.
 */
export const PROCEDURE_STEPS: Record<string, ProcStepDef[]> = {
  'PR-THM-004': [
    { n: 1, kind: 'check', text: 'Satellite in contact and link locked', cond: { contact: true } },
    { n: 2, kind: 'check', text: 'BAT_TEMP below 10 °C', cond: { param: 'BAT_TEMP', op: '<', value: 10, unit: '°C' } },
    { n: 3, kind: 'command', text: 'Switch heater A off', mnemonic: 'HTR_SWITCH', params: { HEATER: 'A', STATE: 'OFF' } },
    { n: 4, kind: 'wait', text: 'Wait for PUS-1 completion report', waitFor: 'pus1', timeoutS: 30 },
    { n: 5, kind: 'command', text: 'Switch heater B on', critical: true, mnemonic: 'HTR_SWITCH', params: { HEATER: 'B', STATE: 'ON' } },
    { n: 6, kind: 'command', text: 'Set heater B setpoint to 15 °C', mnemonic: 'SET_HTR_SETPOINT', params: { HEATER: 'B', SETPOINT: 15 } },
    { n: 7, kind: 'wait', text: 'Wait for BAT_TEMP above 12 °C', cond: { param: 'BAT_TEMP', op: '>', value: 12, unit: '°C' }, timeoutS: 1200 },
    { n: 8, kind: 'operator', text: 'Operator confirms the trend is rising' },
    { n: 9, kind: 'check', text: 'Close out and attach to the pass report', cond: { always: true } },
  ],
  'PR-ADCS-011': [
    { n: 1, kind: 'check', text: 'Satellite in contact and link locked', cond: { contact: true } },
    { n: 2, kind: 'check', text: 'Attitude error under 0.08°', cond: { param: 'ATT_ERR', op: '<', value: 0.08, unit: '°' } },
    { n: 3, kind: 'command', text: 'Desaturate all wheels for 30 s', critical: true, mnemonic: 'RW_DESAT', params: { WHEEL: 'ALL', DURATION: 30 } },
    { n: 4, kind: 'wait', text: 'Wait for PUS-1 completion report', waitFor: 'pus1', timeoutS: 60 },
    { n: 5, kind: 'operator', text: 'Operator confirms wheel speeds are back in band' },
  ],
  'PR-SAFE-001': [
    { n: 1, kind: 'check', text: 'Satellite in contact and link locked', cond: { contact: true } },
    { n: 2, kind: 'operator', text: 'Flight Director has agreed to safe mode entry' },
    { n: 3, kind: 'command', text: 'Enter sun-pointing safe mode', critical: true, mnemonic: 'SAFE_MODE', params: { CONFIRM: 'YES' } },
    { n: 4, kind: 'wait', text: 'Wait for PUS-1 completion report', waitFor: 'pus1', timeoutS: 60 },
    { n: 5, kind: 'operator', text: 'Operator confirms the array is sun-pointing' },
  ],
  'PR-PL-022': [
    { n: 1, kind: 'check', text: 'Satellite in contact and link locked', cond: { contact: true } },
    { n: 2, kind: 'command', text: 'Capture an 8-frame imaging sequence', mnemonic: 'IMG_CAPTURE', params: { FRAMES: 8, EXPOSURE_MS: 5 } },
    { n: 3, kind: 'wait', text: 'Wait for PUS-1 completion report', waitFor: 'pus1', timeoutS: 60 },
    { n: 4, kind: 'command', text: 'Start the mass-memory dump on VC 7', mnemonic: 'DUMP_START', params: { VCID: 7, RATE: 'HIGH' } },
    { n: 5, kind: 'wait', text: 'Wait for PUS-1 completion report', waitFor: 'pus1', timeoutS: 60 },
  ],
};

/** Catalogue groups for the command console. */
export const COMMAND_GROUP: Record<string, string> = {
  HTR_SWITCH: 'Thermal', SET_HTR_SETPOINT: 'Thermal', RW_DESAT: 'ADCS', SAFE_MODE: 'ADCS', HK_RATE_SET: 'Data',
  DUMP_START: 'Data', TIME_SYNC: 'Data', PUS11_LOAD: 'Data', TX_POWER_SET: 'Comms', IMG_CAPTURE: 'Payload',
};

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
