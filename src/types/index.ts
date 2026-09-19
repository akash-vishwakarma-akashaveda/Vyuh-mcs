export type HealthState = 'NOMINAL' | 'WARNING' | 'CRITICAL' | 'NO_DATA';
export type OrbitRegime = 'LEO' | 'MEO' | 'GEO' | 'HEO';
export type SatelliteStatus = 'ACTIVE' | 'INACTIVE' | 'DECOMMISSIONED';

export interface Param {
  param_id: string;
  name: string;
  subsystem: 'POWER' | 'ADCS' | 'THERMAL' | 'COMMS' | 'PAYLOAD' | 'OBC';
  eu_value: number;
  unit: string;
  alarm_state: 0 | 1 | 2; // 0=nominal, 1=warning, 2=critical
  quality: 0 | 1; // 0=fresh, 1=stale
  limit_low_soft?: number;
  limit_hi_soft?: number;
  limit_low_hard?: number;
  limit_hi_hard?: number;
  raw_dn?: number;
  calibration_eq?: string;
  timestamp_utc: string;
}

export interface Satellite {
  sat_id: string;
  name: string;
  status: SatelliteStatus;
  orbit_regime: OrbitRegime;
  constellation_group: string;
  health_state: HealthState;
  last_contact_utc: string | null;
  next_contact_utc: string | null;
  latitude: number;
  longitude: number;
  altitude_km: number;
  velocity_kms: number;
  period_minutes: number;
  inclination_deg: number;
  eccentricity: number;
  raan_deg: number;
  arg_of_perigee_deg: number;
  true_anomaly_deg: number;
  apogee_km: number;
  perigee_km: number;
  assigned_ground_stations: string[];
  mib_version: string;
  tle?: string[];
}

export interface Alarm {
  alarm_id: string;
  sat_id: string;
  param_id: string;
  subsystem: string;
  alarm_state: 1 | 2; // 1=warning, 2=critical
  eu_value: number;
  limit_hi_soft?: number;
  limit_hi_hard?: number;
  limit_low_soft?: number;
  limit_low_hard?: number;
  unit: string;
  timestamp_utc: string;
  acknowledged: boolean;
  acknowledged_by?: string;
  acknowledged_utc?: string;
  /* ISA-18.2 lifecycle (SRS S06) */
  condition?: string;
  state?: 'UNACK' | 'ACKED' | 'RTN' | 'SHELVED' | 'ESCALATED';
  shelved_until_utc?: string;
  shelve_reason?: string;
  owner?: string;
  advisory_id?: string;
  timeline?: { utc: string; text: string }[];
}

export interface ContactWindow {
  window_id: string;
  sat_id: string;
  ground_station: string;
  aos_utc: string;
  los_utc: string;
  duration_seconds: number;
  max_elevation_deg: number;
  frequency_band: 'S' | 'X' | 'Ka';
  quality_score: number;
  status: 'UPCOMING' | 'AOS' | 'LOS';
}

export type StepStatus = 'QUEUED' | 'SENT' | 'ACK' | 'NACK' | 'COMPLETE' | 'FAILED' | 'PENDING';

export interface CommandStep {
  step_id: string;
  mnemonic: string;
  params: Record<string, any>;
  status: StepStatus;
  sent_utc?: string | null;
  ack_utc?: string | null;
}

export interface Command {
  command_id: string;
  satellite_id: string;
  procedure_id: string;
  procedure_name: string;
  procedure_version: string;
  execution_mode: 'CONTINUOUS' | 'STEP_BY_STEP' | 'BREAKPOINT';
  status: 'QUEUED' | 'EXECUTING' | 'PENDING_ACK' | 'ACK' | 'NACK' | 'TIMEOUT' | 'ABORTED' | 'COMPLETE';
  priority: 'P1' | 'P2' | 'P3' | 'P4';
  queued_utc: string;
  operator: string;
  steps: CommandStep[];
  clcw_report_value?: number;
}

export interface Procedure {
  id: string;
  name: string;
  version: string;
  category: 'Safe Mode' | 'Housekeeping' | 'Payload Ops' | 'Maintenance' | 'Emergency';
  last_used_utc: string;
  target_satellites: string[];
  script_content: string;
  step_count: number;
  author: string;
  created_utc: string;
}

export interface Anomaly {
  anomaly_id: string;
  sat_id: string;
  param_id: string;
  subsystem: string;
  type: 'POINT' | 'TREND' | 'CONTEXTUAL';
  confidence: number; // 0-100
  severity: 'WARNING' | 'CRITICAL';
  detected_utc: string;
  resolved_utc: string | null;
  description: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  roles: UserRole[];
  satellite_scope: string[];
  last_login_utc: string;
  status: 'ACTIVE' | 'INACTIVE' | 'PENDING';
  mfa_enabled: boolean;
}

/** SRS v2 §2.1 roles, plus the v1 roles still referenced by pre-v2 screens. */
export type UserRole =
  | 'Flight Director'
  | 'Spacecraft Operator'
  | 'Flight Engineer'
  | 'Mission Planner'
  | 'Ground Station Engineer'
  | 'Mission Database Engineer'
  | 'ML Engineer'
  | 'Security Officer'
  | 'Platform Administrator'
  | 'Customer User'
  | 'Mission Controller'
  | 'RF / Link Engineer'
  | 'Payload Engineer'
  | 'Mission Designer'
  | 'System Administrator';

export const SRS_ROLES: UserRole[] = [
  'Flight Director',
  'Spacecraft Operator',
  'Flight Engineer',
  'Mission Planner',
  'Ground Station Engineer',
  'Mission Database Engineer',
  'ML Engineer',
  'Security Officer',
  'Platform Administrator',
  'Customer User',
  // Not an SRS operating role: platform administration, never spacecraft authority.
  'System Administrator',
];

export interface AuditRecord {
  record_id: string;
  timestamp_utc: string;
  operator_id: string;
  operator_name: string;
  sat_id: string;
  command_mnemonic: string;
  procedure_id: string;
  procedure_version: string;
  sequence_count: number;
  result: 'ACK' | 'NACK' | 'TIMEOUT';
  bytes_sha256: string;
  prev_record_sha256: string;
  params_summary: string;
}

/* ===== SRS v2 types ===== */

export interface GroundStation {
  id: string;
  name: string;
  provider: string;
  protocol: 'SLE' | 'AWS Data/IP' | 'Own';
  bands: ('S' | 'X' | 'Ka')[];
  lat: number;
  lon: number;
  availability_pct: number;
  quality_pct: number;
  cost_per_min_usd: number;
  adapter_health: 'OK' | 'DEGRADED' | 'DOWN';
  state: 'AVAILABLE' | 'DEGRADED' | 'MAINTENANCE';
}

export type PassState = 'SCHEDULED' | 'PREPARING' | 'READY' | 'ACTIVE' | 'DRAINING' | 'COMPLETE';

export interface PassSession {
  session_id: string;
  sat_id: string;
  station_id: string;
  aos_utc: string;
  tca_utc: string;
  los_utc: string;
  state: PassState;
  max_elevation_deg: number;
  frames_per_s: number;
  spool_depth: number;
  gaps: number;
  e2e_latency_p99_ms: number;
  standby_gateway: 'READY' | 'TAKEOVER' | 'NONE';
  booking: 'PREDICTED' | 'REQUESTED' | 'BOOKED' | 'CANCELLED' | 'SHIFTED';
  virtual_channels: { vcid: number; name: string; frames_per_s: number; gaps: number; backfill: string }[];
}

export interface PassReport {
  report_id: string;
  session_id: string;
  sat_id: string;
  station_id: string;
  aos_utc: string;
  los_utc: string;
  status: 'PROVISIONAL' | 'FINAL';
  completeness_pct: number;
  frames_expected: number;
  frames_received: number;
  duplicates_merged: number;
  latency_p50_ms: number;
  latency_p95_ms: number;
  latency_p99_ms: number;
  gaps: { from_utc: string; to_utc: string; frames: number; backfill: 'RUNNING' | 'DONE' | 'UNRECOVERABLE'; source: string }[];
  commands: { mnemonic: string; result: 'VERIFIED' | 'FAILED' }[];
}

export interface Approval {
  approval_id: string;
  command_id: string;
  sat_id: string;
  mnemonic: string;
  params: Record<string, string | number>;
  reason: string;
  requested_by: string;
  requested_utc: string;
  expires_utc: string;
  state: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  decided_by?: string;
  decided_utc?: string;
  reject_reason?: string;
  /** Interlock values captured when the request was raised (C-07 evidence). */
  interlocks: { param: string; value: string; rule: string; pass: boolean }[];
}

export interface Advisory {
  advisory_id: string;
  sat_id: string;
  tier: 'T1' | 'T2' | 'T3' | 'T4';
  score: number;
  title: string;
  detail: string;
  detected_utc: string;
  state: 'NEW' | 'CONFIRMED' | 'DISMISSED' | 'LINKED';
  linked_alarm_id?: string;
  contributors: { param: string; contribution: number }[];
  model: string;
}

export interface CopilotMessage {
  role: 'user' | 'assistant';
  text: string;
  citations?: { doc: string; section: string; route?: string }[];
  refused?: boolean;
}

export interface OnCallEntry {
  position: 'Primary' | 'Secondary' | 'Flight Director';
  name: string;
  until_utc: string;
}

export interface RoutingRule {
  trigger: string;
  target: string;
  after_min?: number;
  escalate_to?: string;
}

export interface NotificationDelivery {
  id: string;
  trigger: string;
  channel: string;
  recipient: string;
  sent_utc: string;
  state: 'DELIVERED' | 'RETRYING' | 'ESCALATED' | 'ACKNOWLEDGED';
}

export interface MdbRelease {
  version: string;
  state: 'DRAFT' | 'IN_REVIEW' | 'VERIFIED' | 'SCHEDULED' | 'ACTIVE' | 'ROLLED_BACK';
  author: string;
  created_utc: string;
  reviewers: { name: string; approved: boolean }[];
  diff: { change: 'ADDED' | 'CHANGED' | 'REMOVED'; item: string; from?: string; to?: string }[];
  effective: { sat_id: string; effective_utc: string }[];
  bundle_sha256: string;
}

export interface Delivery {
  delivery_id: string;
  sat_id: string;
  station_id: string;
  tenant: string;
  size_mb: number;
  chunks_received: number;
  chunks_total: number;
  checksum_ok: boolean;
  state: 'RECEIVING' | 'MERGING' | 'L0_READY' | 'DELIVERED' | 'CHECKSUM_FAILED';
  started_utc: string;
  manifest: { name: string; bytes: number; sha256: string }[];
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  duration_s: number;
  verdict: 'NOT_RUN' | 'PASSED' | 'FAILED';
}

export interface ServiceHealth {
  name: string;
  status: 'RUNNING' | 'DEGRADED' | 'DOWN';
  replicas_current: number;
  replicas_desired: number;
  cpu_pct: number;
  memory_pct: number;
  last_restart_utc: string;
}
