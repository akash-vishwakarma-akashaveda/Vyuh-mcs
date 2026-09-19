/**
 * Glue between the live backend and the parts of the demo that are still scripted.
 *
 * The physical facts are real: telemetry, limit alarms, command uplink and its
 * acknowledgement all come from the ground segment. What has no backend yet — the AI
 * advisory, the approval desk — stays in the console, but is now *triggered by* the real
 * events (the advisory appears because the live battery temperature is really falling),
 * and the operator's actions (inject a fault, release a command, acknowledge an alarm)
 * are sent to the real services instead of flipping a flag.
 */
import { useAlarmStore, setAckHook } from '../store/useAlarmStore';
import { useAuthStore } from '../store/useAuthStore';
import { useFleetStore } from '../store/useFleetStore';
import { isLiveSatellite } from '../store/useLinkStore';
import { demoAdvisoryNow, useMissionStore } from '../store/useMissionStore';
import { apidOf, mapCommandStatus, toCommandRecord, toConsoleAlarm } from '../realtime/mapping';
import type { AlarmView, CommandStatus } from '../realtime/protocol';
import { liveApi, scidOf } from './api';

const STORY_SAT = 'AKV-03';
const STORY_COMMAND = 'CMD-8841';
/** The simulated model "notices" a cooling battery before the limit is crossed (Q-07). */
const ADVISORY_BELOW_C = 15;
const VERIFY_TIMEOUT_MS = 30_000;

/** Backend command id -> the console's command id, for commands this console released. */
const bridged = new Map<string, string>();
const liveAlarmIds = new Set<string>();
let advisoryRaised = false;

const operatorName = () => useAuthStore.getState().user.name;
const short = (id: string) => id.slice(-8).toUpperCase();

// ---- alarms ------------------------------------------------------------------

export function onAlarm(view: AlarmView) {
  liveAlarmIds.add(view.alarm_id);
  const store = useAlarmStore.getState();
  if (view.status === 'CLEARED') {
    store.returnToNormal(view.alarm_id);
    return;
  }
  const alarm = toConsoleAlarm(view);
  if (view.sat_id === STORY_SAT && view.param_id === 'BAT_TEMP') alarm.advisory_id = 'AN-401';
  store.upsertAlarm(alarm);
}

/** Refetch the open alarms over REST — after the gateway refused to resume, or on first connect. */
export async function resync() {
  try {
    const open = await liveApi.listAlarms(true);
    for (const a of open) onAlarm(a);
    // Alarms the backend no longer holds open (it restarted, or they cleared while we were away).
    const still = new Set(open.map((a) => a.alarm_id));
    for (const id of [...liveAlarmIds]) {
      if (!still.has(id)) {
        useAlarmStore.getState().returnToNormal(id);
        liveAlarmIds.delete(id);
      }
    }
  } catch { /* backend not answering yet; the live stream will deliver them */ }
}

// ---- commands ----------------------------------------------------------------

export function onStatus(s: CommandStatus) {
  const mission = useMissionStore.getState();
  const consoleId = bridged.get(s.command_id) ?? short(s.command_id);

  if (!mission.commands.some((c) => c.command_id === consoleId)) {
    // Sent from another console (or by an automated procedure): show it here too.
    mission.addCommand({ ...toCommandRecord(s), command_id: consoleId });
  } else {
    mission.setCommandStatus(consoleId, mapCommandStatus(s.status));
  }

  if (s.status === 'ACKNOWLEDGED') verifyByTelemetry(consoleId, s);
  if (mapCommandStatus(s.status) === 'FAILED') {
    mission.appendAudit({
      timestamp_utc: new Date().toISOString(), operator_id: 'SYS', operator_name: s.operator_id || 'unknown', sat_id: s.sat_id,
      command_mnemonic: consoleId, procedure_id: '—', procedure_version: '—', sequence_count: 0,
      result: 'NACK', params_summary: s.reason || s.status,
    });
  }
}

/**
 * A command is only COMPLETED when the spacecraft's telemetry shows its effect — the
 * CLCW proves it was received, not that it worked. Heater B switching on is confirmed
 * by HTR_B_STATE.
 */
function verifyByTelemetry(consoleId: string, s: CommandStatus) {
  const p = s.params ?? {};
  const isHeaterBOn = String(p.HEATER).toUpperCase() === 'B' && String(p.STATE).toUpperCase() === 'ON';
  if (!isHeaterBOn) return; // no telemetry signature defined for the other commands yet

  const started = Date.now();
  const unsubscribe = useFleetStore.subscribe((state) => {
    const v = state.cvt[s.sat_id]?.HTR_B_STATE;
    if (v && v.eu_value >= 1 && v.quality === 0) {
      unsubscribe();
      useMissionStore.getState().setCommandStatus(consoleId, 'COMPLETED');
    } else if (Date.now() - started > VERIFY_TIMEOUT_MS) {
      unsubscribe();
      useMissionStore.getState().setCommandStatus(consoleId, 'FAILED');
    }
  });
}

/** The operator's approved command leaves the console for the real uplink. */
async function releaseHeaterB() {
  const scid = scidOf(STORY_SAT);
  const apid = apidOf('HTR_SWITCH');
  if (scid === undefined || apid === undefined) return;

  const mission = useMissionStore.getState();
  const params = { HEATER: 'B', STATE: 'ON' };
  if (!mission.commands.some((c) => c.command_id === STORY_COMMAND)) {
    mission.addCommand({
      command_id: STORY_COMMAND, sat_id: STORY_SAT, mnemonic: 'HTR_SWITCH', params, status: 'RELEASED',
      requested_by: operatorName(), epoch: 17, utc: new Date().toISOString(), critical: true,
    });
  }
  try {
    const backendId = await liveApi.submitCommand({ scid, apid, priority: 'CRITICAL', params }, operatorName());
    bridged.set(backendId, STORY_COMMAND);
    useMissionStore.getState().setCommandStatus(STORY_COMMAND, 'RELEASED');
  } catch {
    useMissionStore.getState().setCommandStatus(STORY_COMMAND, 'FAILED');
  }
}

// ---- the director --------------------------------------------------------------

export function startDirector(): () => void {
  setAckHook((alarm, by) => {
    if (liveAlarmIds.has(alarm.alarm_id) && isLiveSatellite(alarm.sat_id)) void liveApi.acknowledgeAlarm(alarm.alarm_id, by).catch(() => {});
  });

  // Scripted controls now act on the real spacecraft.
  const stopMission = useMissionStore.subscribe((s, prev) => {
    if (!isLiveSatellite(STORY_SAT)) return;
    if (!prev.heaterFault && s.heaterFault) void liveApi.injectFault(STORY_SAT, 'HEATER_A_FAIL').catch(() => {});
    if (prev.heaterFault && !s.heaterFault) {
      advisoryRaised = false;
      void liveApi.clearFault(STORY_SAT).catch(() => {});
    }
    if (!prev.heaterBOn && s.heaterBOn) void releaseHeaterB();
  });

  // The (simulated) anomaly model: it reacts to the real battery temperature.
  const stopFleet = useFleetStore.subscribe((state) => {
    if (advisoryRaised || !isLiveSatellite(STORY_SAT) || !useMissionStore.getState().heaterFault) return;
    const t = state.cvt[STORY_SAT]?.BAT_TEMP;
    if (t && t.quality === 0 && t.eu_value < ADVISORY_BELOW_C) {
      advisoryRaised = true;
      useMissionStore.getState().addAdvisory(demoAdvisoryNow());
    }
  });

  return () => {
    stopMission();
    stopFleet();
    setAckHook(null);
  };
}
