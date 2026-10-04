/**
 * Takes a command that has been released (routine, or approved by a second person) to the uplink,
 * and follows it to the end. For satellites the backend flies, the command goes through the real
 * chain (safety, encryption, COP-1) and its acknowledgement and PUS-1 execution reports come back on
 * the status stream; for the rest of the fleet the same lifecycle is simulated.
 *
 * This is the release pipeline, not a screen: it runs from app start, so an approval granted while
 * nobody has the procedure runner open still moves the command (and the run) on (C1). The
 * procedure engine ticks from here for the same reason.
 */
import { isFinalStatus, useMissionStore, type CommandRecord } from '../store/useMissionStore';
import { isLiveSatellite } from '../store/useLinkStore';
import { useAuthStore } from '../store/useAuthStore';
import { apiClient } from '../api/client';
import { STATUS_RANK, apidOf } from '../realtime/mapping';
import { liveApi, scidOf } from './api';
import { backendIdOf, bridgeCommand } from './director';
import { tickProcedures } from '../store/useProcedureRunStore';

/** The heater-recovery story command: on a live AKV-03 the director sends it (see director.ts). */
const STORY_COMMAND = 'CMD-8841';
const STORY_SAT = 'AKV-03';
const handled = new Set<string>();
const later = (fn: () => void, ms: number) => window.setTimeout(fn, ms);

const mission = () => useMissionStore.getState();
const current = (id: string) => mission().commands.find((x) => x.command_id === id);

/** Never backwards, never out of a final state (a late timer after a cancel or a manual step). */
function advance(id: string, status: CommandRecord['status']) {
  const c = current(id);
  if (!c || isFinalStatus(c.status) || (STATUS_RANK[status] ?? 0) < (STATUS_RANK[c.status] ?? 0)) return;
  mission().setCommandStatus(id, status);
}

/** The simulated spacecraft's reaction to the story command, so the heater story plays without a backend. */
const isHeaterBOn = (c: CommandRecord) => c.sat_id === STORY_SAT && c.mnemonic === 'HTR_SWITCH' && String(c.params.HEATER) === 'B' && String(c.params.STATE) === 'ON';

async function release(id: string) {
  const c = current(id);
  if (!c) return;
  const audit = (result: 'ACK' | 'NACK', text: string) => mission().appendAudit({
    timestamp_utc: new Date().toISOString(), operator_id: 'SYS', operator_name: c.requested_by, sat_id: c.sat_id, command_mnemonic: c.mnemonic,
    procedure_id: '—', procedure_version: '—', sequence_count: mission().fopOf(c.sat_id).vS, result, params_summary: text,
  });

  const live = isLiveSatellite(c.sat_id);
  if (live && id === STORY_COMMAND) { mission().switchHeaterB(); return; } // director.releaseHeaterB sends and bridges it

  const scid = scidOf(c.sat_id), apid = apidOf(c.mnemonic);
  if (live && scid !== undefined && apid !== undefined) {
    try {
      const backendId = await liveApi.submitCommand({ scid, apid, priority: c.critical ? 'CRITICAL' : 'NORMAL', params: c.params }, useAuthStore.getState().user.name);
      bridgeCommand(backendId, id);
      audit('ACK', `${id} released to uplink ${Object.entries(c.params).map(([k, v]) => `${k}=${v}`).join(' ')}`);
      // From here the status stream carries the real milestones: SENT, CLCW acknowledgement,
      // then the spacecraft's PUS-1 acceptance and completion reports.
    } catch {
      mission().setCommandStatus(id, 'FAILED');
      mission().noteCommand(id, 'The uplink refused the command');
      audit('NACK', 'uplink refused the command');
    }
    return;
  }

  // Simulated satellite: same lifecycle, no spacecraft.
  // ponytail: the simulation radiates without waiting for AOS; the real uplink holds the frame for the COP-1 window.
  audit('ACK', `${id} released (simulated) ${Object.entries(c.params).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  later(() => { const x = current(id); if (x && x.status === 'RELEASED') mission().markRadiated(id); }, 2500);
  later(() => advance(id, 'ACCEPTED'), 3400);
  later(() => advance(id, 'STARTED'), 4200);
  later(() => {
    const x = current(id);
    advance(id, 'COMPLETED');
    if (x && !isFinalStatus(x.status) && isHeaterBOn(x)) mission().switchHeaterB();
  }, 5400);
}

/**
 * Cancel a command before it is radiated. On a live satellite the Command Gateway decides
 * (it refuses once the frame is dispatched). Returns why it could not be cancelled, or null.
 */
export async function cancelCommand(id: string): Promise<string | null> {
  const by = useAuthStore.getState().user.name;
  const backendId = backendIdOf(id);
  if (backendId) {
    try {
      await apiClient.post(`/commands/${backendId}/cancel`, null, { headers: { 'X-Operator-ID': by } });
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } }).response?.status;
      return status === 409 ? 'Already dispatched to the station: too late to cancel.' : 'The Command Gateway did not answer; the command was not cancelled.';
    }
  }
  return mission().cancelCommand(id, by);
}

export function startCommandRelease(): () => void {
  const pick = (s: ReturnType<typeof mission>) => {
    for (const c of s.commands) {
      if (c.status !== 'RELEASED' || handled.has(c.command_id)) continue;
      handled.add(c.command_id);
      void release(c.command_id);
    }
  };
  const stop = useMissionStore.subscribe(pick);
  pick(mission()); // a released command restored after a reload goes out too
  const engine = window.setInterval(tickProcedures, 500);
  return () => { stop(); clearInterval(engine); };
}
