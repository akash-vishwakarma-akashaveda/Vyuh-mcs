/**
 * Operational picture of one satellite beyond its telemetry: payload, data chain, procedure uplink,
 * flight dynamics, contingencies and the on-board plan.
 *
 * DEMO DATA. There is no payload, data-processing, flight-dynamics or procedure backend yet, so these
 * values are generated deterministically from the satellite id and the clock (the same satellite reads
 * the same at the same moment on every screen). Contact windows and conjunctions are the exception:
 * those come from the orbit model and the conjunction screening.
 */
import { seeded } from './history';

export type PayloadStatus = 'IDLE' | 'IMAGING' | 'DOWNLINKING' | 'PROCESSING' | 'FAULT';
export type EventKind = 'IMAGING' | 'DUMP' | 'MANEUVER' | 'PROCEDURE';
export type EventState = 'DONE' | 'ACTIVE' | 'PLANNED' | 'FAILED';

export interface SatEvent { id: string; kind: EventKind; label: string; at: number; state: EventState; detail?: string }

export interface SatOps {
  payload: { status: PayloadStatus; lastImaging: { at: number; target: string; frames: number } | null; imagesToday: number };
  data: { downlinkedPct: number; processedPct: number; pendingGb: number; lastDumpAt: number };
  uplink: { procedure: string; pct: number; state: 'IDLE' | 'UPLOADING' | 'COMPLETE' | 'FAILED'; startedAt: number };
  fd: { lastOm: { name: string; at: number; status: 'SUCCESS' | 'PARTIAL' | 'FAILED' } | null; nextOm: { name: string; at: number } | null };
  contingency: { name: string; at: number; outcome: string } | null;
  events: SatEvent[];
}

const TARGETS = ['Ludhiana wheat belt', 'Krishna delta', 'Sundarbans', 'Rann of Kutch', 'Brahmaputra basin', 'Western Ghats', 'Godavari basin', 'Thar desert', 'Kaveri delta', 'Chilika lake'];
const PROCEDURES = ['PR-THM-004 Battery heater recovery', 'PR-ADCS-011 Reaction wheel desaturation', 'PR-PL-020 Payload calibration', 'PR-OBC-007 Software patch upload', 'PR-PWR-003 Array orientation update'];
const OMS = ['Drag make-up burn', 'Phasing manoeuvre', 'Inclination trim', 'Collision-avoidance burn'];
const CONTINGENCIES = [
  ['Safe-mode entry, recovered', 'Cleared after wheel reset'],
  ['Star tracker dropout', 'Fell back to gyro-only, tracker restored'],
  ['Downlink buffer overflow', 'Dump re-planned on next pass'],
  ['Battery under-voltage warning', 'Load shed, charge restored'],
] as const;

const HOUR = 3600_000;

/** A pure function of (satellite, minute): stable while you look at it, drifting as time passes. */
export function getSatOps(satId: string, now = Date.now()): SatOps {
  const minute = Math.floor(now / 60_000);
  const r = seeded(`ops:${satId}`);
  const rr = () => r();

  // Payload and data chain.
  const imagingPeriod = 95 * 60_000; // one imaging opportunity per orbit
  const slot = Math.floor(now / imagingPeriod);
  const lastImagingAt = slot * imagingPeriod - Math.floor(rr() * 20) * 60_000;
  const target = TARGETS[(slot + Math.floor(rr() * 100)) % TARGETS.length];
  const phase = (now - lastImagingAt) / 60_000;
  const status: PayloadStatus = satId === 'AKV-11' ? 'FAULT' : phase < 4 ? 'IMAGING' : phase < 12 ? 'DOWNLINKING' : phase < 25 ? 'PROCESSING' : 'IDLE';
  const dumped = Math.min(100, Math.max(0, Math.round(((phase - 4) / 8) * 100)));
  const processed = Math.min(100, Math.max(0, Math.round(((phase - 12) / 13) * 100)));

  // Procedure uplink: one procedure at a time, progress climbs and wraps.
  const procIdx = (Math.floor(minute / 47) + Math.floor(rr() * 10)) % PROCEDURES.length;
  const uplinkPct = Math.round(((minute % 47) / 47) * 100);
  const uplinkState = satId === 'AKV-07' ? 'FAILED' : uplinkPct >= 98 ? 'COMPLETE' : uplinkPct < 3 ? 'IDLE' : 'UPLOADING';

  // Flight dynamics.
  const lastOmAt = now - (6 + Math.floor(rr() * 60)) * HOUR;
  const nextOmAt = now + (3 + Math.floor(rr() * 70)) * HOUR;
  const omName = OMS[Math.floor(rr() * OMS.length)];
  const omStatus = rr() > 0.85 ? 'PARTIAL' : 'SUCCESS';
  const hasNextOm = rr() > 0.35;

  const [cName, cOutcome] = CONTINGENCIES[Math.floor(rr() * CONTINGENCIES.length)];
  const hasContingency = rr() > 0.3;

  // Event log around now: what happened, what is running, what is planned.
  const events: SatEvent[] = [];
  const push = (kind: EventKind, label: string, at: number, detail?: string) => {
    const state: EventState = at > now ? 'PLANNED' : now - at < 6 * 60_000 && kind !== 'MANEUVER' ? 'ACTIVE' : 'DONE';
    events.push({ id: `${satId}-${kind}-${at}`, kind, label, at, state, detail });
  };
  for (let k = -3; k <= 4; k++) push('IMAGING', `Imaging · ${TARGETS[(slot + k + 100) % TARGETS.length]}`, (slot + k) * imagingPeriod, `${18 + ((slot + k) % 9)} frames`);
  for (let k = -2; k <= 4; k++) push('DUMP', 'Data dump', (slot + k) * imagingPeriod + 8 * 60_000, 'Station pass');
  push('MANEUVER', `${omName}`, lastOmAt, omStatus === 'SUCCESS' ? 'Completed' : 'Partially executed');
  if (hasNextOm) push('MANEUVER', `${OMS[(OMS.indexOf(omName) + 1) % OMS.length]}`, nextOmAt, 'Planned by flight dynamics');
  push('PROCEDURE', PROCEDURES[procIdx], now - uplinkPct * 47 * 600, `${uplinkPct}% uplinked`);
  events.sort((a, b) => a.at - b.at);

  return {
    payload: { status, lastImaging: { at: lastImagingAt, target, frames: 18 + (slot % 9) }, imagesToday: 8 + (slot % 5) },
    data: { downlinkedPct: dumped, processedPct: processed, pendingGb: Number(((100 - dumped) * 0.06).toFixed(1)), lastDumpAt: lastImagingAt + 8 * 60_000 },
    uplink: { procedure: PROCEDURES[procIdx], pct: uplinkState === 'FAILED' ? 62 : uplinkPct, state: uplinkState, startedAt: now - uplinkPct * 47 * 600 },
    fd: {
      lastOm: { name: omName, at: lastOmAt, status: omStatus },
      nextOm: hasNextOm ? { name: OMS[(OMS.indexOf(omName) + 1) % OMS.length], at: nextOmAt } : null,
    },
    contingency: hasContingency ? { name: cName, at: now - (2 + Math.floor(rr() * 20)) * 24 * HOUR, outcome: cOutcome } : null,
    events,
  };
}

// ---- what is planned on each contact ------------------------------------------------------------------

export interface PlannedItem { id: string; kind: 'PROCEDURE' | 'COMMAND' | 'DUMP'; name: string; state: 'DONE' | 'RUNNING' | 'PLANNED' | 'SKIPPED' }

const CONTACT_ITEMS: Omit<PlannedItem, 'id' | 'state'>[] = [
  { kind: 'PROCEDURE', name: 'PR-ADCS-011 Wheel desaturation' },
  { kind: 'COMMAND', name: 'SET_TIME_TAG_OFFSET' },
  { kind: 'DUMP', name: 'Payload data dump' },
  { kind: 'PROCEDURE', name: 'PR-PL-020 Payload calibration' },
  { kind: 'COMMAND', name: 'TC_ACS_SET_MODE' },
  { kind: 'COMMAND', name: 'HTR_SWITCH HEATER=A' },
  { kind: 'PROCEDURE', name: 'PR-OBC-007 Software patch' },
];

/** The procedures and commands planned on a contact, and how far each has got, from the contact's own time. */
export function plannedOnContact(satId: string, windowId: string, aos: number, los: number, now = Date.now()): PlannedItem[] {
  const r = seeded(`plan:${satId}:${windowId}`);
  const n = 1 + Math.floor(r() * 3);
  return Array.from({ length: n }, (_, i) => {
    const item = CONTACT_ITEMS[Math.floor(r() * CONTACT_ITEMS.length)];
    const state: PlannedItem['state'] = now > los ? (r() > 0.9 ? 'SKIPPED' : 'DONE') : now >= aos ? (i === 0 ? 'RUNNING' : 'PLANNED') : 'PLANNED';
    return { ...item, id: `${windowId}-${i}`, state };
  });
}

export const completion = (items: PlannedItem[]) => {
  const counted = items.filter((i) => i.state !== 'SKIPPED');
  return counted.length ? Math.round((counted.filter((i) => i.state === 'DONE').length / counted.length) * 100) : 0;
};
