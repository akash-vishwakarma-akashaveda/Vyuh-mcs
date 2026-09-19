/**
 * Turns state changes into toasts, in one place, so no screen has to remember to notify.
 * What raises one: a new or escalated alarm, an alarm returning to normal, the live link
 * dropping or coming back, a command failing or completing, and an approval being asked
 * for or decided. Everything that arrives in the first seconds (initial load, first sync
 * with the backend) is treated as background, not news.
 */
import { useAlarmStore } from '../store/useAlarmStore';
import { useLinkStore } from '../store/useLinkStore';
import { useMissionStore } from '../store/useMissionStore';
import { toast } from '../store/useToastStore';

const QUIET_MS = 4_000;

export function startNotifications(): () => void {
  const started = Date.now();
  const quiet = () => Date.now() - started < QUIET_MS;

  // ---- alarms -------------------------------------------------------------
  let known = new Map(useAlarmStore.getState().active.map((a) => [a.alarm_id, a.alarm_state]));
  let closed = new Set(useAlarmStore.getState().history.map((a) => a.alarm_id));
  const unAlarm = useAlarmStore.subscribe((s) => {
    const fresh: typeof s.active = [];
    for (const a of s.active) {
      const was = known.get(a.alarm_id);
      if (was === undefined) fresh.push(a);
      else if (was !== a.alarm_state && a.alarm_state === 2) {
        if (!quiet()) toast.critical(`${a.sat_id} · ${a.param_id} escalated to critical`, { body: a.condition, key: a.alarm_id, action: { label: 'Open alarm console', route: 'alarms' } });
      }
    }
    known = new Map(s.active.map((a) => [a.alarm_id, a.alarm_state]));

    if (!quiet()) {
      if (fresh.length > 3) {
        toast.warning(`${fresh.length} new alarms`, { key: 'alarm-burst', action: { label: 'Open alarm console', route: 'alarms' } });
      } else {
        for (const a of fresh) {
          const send = a.alarm_state === 2 ? toast.critical : toast.warning;
          send(`${a.sat_id} · ${a.param_id} ${a.alarm_state === 2 ? 'critical' : 'warning'}`, {
            body: a.condition ?? `${a.eu_value} ${a.unit}`, key: a.alarm_id, action: { label: 'Open alarm console', route: 'alarms' },
          });
        }
      }
      for (const h of s.history) {
        if (!closed.has(h.alarm_id)) toast.success(`${h.sat_id} · ${h.param_id} back to normal`, { key: h.alarm_id });
      }
    }
    closed = new Set(s.history.map((a) => a.alarm_id));
  });

  // ---- live link ----------------------------------------------------------
  let linkUp = useLinkStore.getState().state === 'CONNECTED';
  let linkWasLost = false;
  const unLink = useLinkStore.subscribe((s) => {
    if (s.mode !== 'live') return;
    const up = s.state === 'CONNECTED';
    if (up === linkUp) return;
    linkUp = up;
    if (quiet() && up) return;
    if (!up) {
      linkWasLost = true;
      toast.critical('Live link lost', { body: 'Telemetry on screen is ageing and will be marked stale. Reconnecting automatically.', key: 'link' });
    } else if (linkWasLost) {
      toast.success('Live link restored', { key: 'link' });
    }
  });

  // ---- commands and approvals ---------------------------------------------
  let cmdStatus = new Map(useMissionStore.getState().commands.map((c) => [c.command_id, c.status]));
  let apprState = new Map(useMissionStore.getState().approvals.map((a) => [a.approval_id, a.state]));
  const unMission = useMissionStore.subscribe((s) => {
    for (const c of s.commands) {
      const was = cmdStatus.get(c.command_id);
      if (was === c.status || quiet()) continue;
      const what = `${c.mnemonic} on ${c.sat_id}`;
      if (c.status === 'FAILED' || c.status === 'REJECTED') {
        toast.critical(`Command ${c.status === 'FAILED' ? 'failed' : 'rejected'}: ${what}`, { key: c.command_id, action: { label: 'Open command console', route: 'command' } });
      } else if (c.status === 'COMPLETED') {
        toast.success(`Command completed: ${what}`, { key: c.command_id });
      }
    }
    cmdStatus = new Map(s.commands.map((c) => [c.command_id, c.status]));

    for (const a of s.approvals) {
      const was = apprState.get(a.approval_id);
      if (was === a.state || quiet()) continue;
      const what = `${a.mnemonic} on ${a.sat_id}`;
      if (a.state === 'PENDING') toast.warning(`Approval needed: ${what}`, { body: `Requested by ${a.requested_by}`, key: a.approval_id, action: { label: 'Open approvals', route: 'approvals' } });
      else if (a.state === 'APPROVED') toast.info(`Approved by ${a.decided_by}: ${what}`, { key: a.approval_id });
      else if (a.state === 'REJECTED') toast.warning(`Rejected by ${a.decided_by}: ${what}`, { key: a.approval_id });
    }
    apprState = new Map(s.approvals.map((a) => [a.approval_id, a.state]));
  });

  return () => { unAlarm(); unLink(); unMission(); };
}
