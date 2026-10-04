import { useAlarmStore } from '../store/useAlarmStore';
import { useMissionStore } from '../store/useMissionStore';
import { toast } from '../store/useToastStore';

/**
 * Alarm timers (BR-13, BR-14): a critical alarm nobody acknowledges goes to the secondary on-call
 * after 5 min and to the Flight Director after 15 min; a shelve ends when its time is up.
 */
const STEPS = [
  { after: 5 * 60_000, to: 'secondary on-call', note: 'Escalated to the secondary on-call: no acknowledgement in 5 min' },
  { after: 15 * 60_000, to: 'the Flight Director', note: 'Escalated to the Flight Director: no acknowledgement in 15 min' },
];

/** An approval that is not decided before its pass ends lapses: the command never leaves (S13-05). */
function expireApprovals() {
  const m = useMissionStore.getState();
  for (const a of m.approvals) {
    if (a.state !== 'PENDING' || Date.parse(a.expires_utc) > Date.now()) continue;
    useMissionStore.setState((s) => ({ approvals: s.approvals.map((x) => (x.approval_id === a.approval_id ? { ...x, state: 'EXPIRED' } : x)) }));
    m.setCommandStatus(a.command_id, 'REJECTED');
    m.appendAudit({ timestamp_utc: new Date().toISOString(), operator_id: 'SYS', operator_name: 'System', sat_id: a.sat_id, command_mnemonic: a.mnemonic, procedure_id: '—', procedure_version: '—', sequence_count: 0, result: 'NACK', params_summary: `${a.command_id} approval ${a.approval_id} expired at the end of the pass; command not sent` });
    toast.warning(`Approval expired: ${a.mnemonic} on ${a.sat_id}`, { body: 'It was not decided before the pass ended. Request it again on the next pass.', key: a.approval_id });
  }
}

export function startEscalation(): () => void {
  const tick = () => {
    expireApprovals();
    const store = useAlarmStore.getState();
    const now = Date.now();
    let toasts = 0; // a backlog at start-up is stamped on the alarm but does not bury the screen
    for (const a of store.active) {
      if (a.state === 'SHELVED') {
        if (a.shelved_until_utc && Date.parse(a.shelved_until_utc) <= now) { store.unshelve(a.alarm_id); toast.warning(`${a.sat_id} · ${a.param_id} shelve expired`, { body: 'The alarm is live again.', key: `unshelve-${a.alarm_id}` }); }
        continue;
      }
      if (a.alarm_state !== 2 || a.acknowledged) continue;
      const age = now - Date.parse(a.timestamp_utc);
      for (const step of STEPS) {
        if (age >= step.after && !a.timeline?.some((t) => t.text === step.note)) {
          store.escalateAlarm(a.alarm_id, step.to);
          // escalateAlarm words its own entry; keep the exact rule text too so the step is not repeated
          useAlarmStore.setState((s) => ({ active: s.active.map((x) => (x.alarm_id === a.alarm_id ? { ...x, timeline: [...(x.timeline ?? []), { utc: new Date().toISOString(), text: step.note }] } : x)) }));
          if (toasts++ < 2) toast.critical(`${a.sat_id} · ${a.param_id} still unacknowledged`, { body: step.note, key: `esc-${a.alarm_id}-${step.after}`, action: { label: 'Open alarm console', route: 'alarms' } });
          break;
        }
      }
    }
  };
  tick();
  const t = window.setInterval(tick, 15_000);
  return () => clearInterval(t);
}

const IDLE_MS = 30 * 60_000;
export const SESSION_EXPIRED_KEY = 'mcs.sessionExpired';

/** A signed-in session with no input for 30 min ends; the sign-in screen says why (S01 "Session expired"). */
export function startIdleTimeout(isSignedIn: () => boolean, signOut: () => void): () => void {
  let last = Date.now();
  const touch = () => { last = Date.now(); };
  const events = ['pointerdown', 'keydown', 'wheel'] as const;
  events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
  const t = window.setInterval(() => {
    if (isSignedIn() && Date.now() - last > IDLE_MS) {
      try { sessionStorage.setItem(SESSION_EXPIRED_KEY, '1'); } catch { /* private mode */ }
      signOut();
      last = Date.now();
    }
  }, 30_000);
  return () => { clearInterval(t); events.forEach((e) => window.removeEventListener(e, touch)); };
}
