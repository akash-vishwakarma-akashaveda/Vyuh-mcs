/**
 * Takes a command that has been released (routine, or approved by a second person) to the uplink,
 * and follows it to the end. For satellites the backend flies, the command goes through the real
 * chain (safety, encryption, COP-1) and its acknowledgement and PUS-1 execution reports come back on the status stream;
 * for the rest of the fleet the same lifecycle is simulated. The heater-recovery story command is
 * released by the director and skipped here.
 */
import { useMissionStore } from '../store/useMissionStore';
import { isLiveSatellite } from '../store/useLinkStore';
import { useAuthStore } from '../store/useAuthStore';
import { apidOf } from '../realtime/mapping';
import { liveApi, scidOf } from './api';
import { bridgeCommand } from './director';

const STORY_COMMAND = 'CMD-8841';
const handled = new Set<string>();
const later = (fn: () => void, ms: number) => window.setTimeout(fn, ms);

async function release(id: string) {
  const store = useMissionStore.getState();
  const c = store.commands.find((x) => x.command_id === id);
  if (!c) return;
  const set = (status: Parameters<typeof store.setCommandStatus>[1]) => useMissionStore.getState().setCommandStatus(id, status);

  const audit = (result: 'ACK' | 'NACK', text: string) => useMissionStore.getState().appendAudit({
    timestamp_utc: new Date().toISOString(), operator_id: 'SYS', operator_name: c.requested_by, sat_id: c.sat_id, command_mnemonic: c.mnemonic,
    procedure_id: '—', procedure_version: '—', sequence_count: useMissionStore.getState().fop1.vS, result, params_summary: text,
  });

  const scid = scidOf(c.sat_id), apid = apidOf(c.mnemonic);
  if (isLiveSatellite(c.sat_id) && scid !== undefined && apid !== undefined) {
    try {
      const backendId = await liveApi.submitCommand({ scid, apid, priority: c.critical ? 'CRITICAL' : 'NORMAL', params: c.params }, useAuthStore.getState().user.name);
      bridgeCommand(backendId, id);
      set('RELEASED');
      audit('ACK', `released to uplink ${Object.entries(c.params).map(([k, v]) => `${k}=${v}`).join(' ')}`);
      // From here the status stream carries the real milestones: CLCW acknowledgement,
      // then the spacecraft's PUS-1 acceptance and completion reports.
    } catch {
      set('FAILED');
      audit('NACK', 'uplink refused the command');
    }
    return;
  }

  // Simulated satellite: same lifecycle, no spacecraft.
  audit('ACK', `released (simulated) ${Object.entries(c.params).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  later(() => set('ACCEPTED'), 900);
  later(() => set('STARTED'), 1700);
  later(() => set('COMPLETED'), 2800);
}

export function startCommandRelease(): () => void {
  return useMissionStore.subscribe((s) => {
    for (const c of s.commands) {
      if (c.status !== 'RELEASED' || c.command_id === STORY_COMMAND || handled.has(c.command_id)) continue;
      handled.add(c.command_id);
      void release(c.command_id);
    }
  });
}
