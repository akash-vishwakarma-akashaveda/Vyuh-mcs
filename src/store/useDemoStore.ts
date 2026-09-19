import { create } from 'zustand';
import { useAuthStore } from './useAuthStore';
import { useAlarmStore } from './useAlarmStore';
import { useMissionStore, demoApprovalNow } from './useMissionStore';
import { PROCEDURE_PR_THM_004 } from '../data/fleet';

export interface DemoStep {
  n: number;
  title: string;
  screen: string;          // S-ID, for the caption
  route: string;           // route the step belongs on
  say: string;
  action: string;          // primary button label
  /** Runs on the primary action; returns the route to move to. */
  run?: (nav: (to: string) => void) => void;
}

/** SRS §9.2 — 15-step guided demo: one heater fault, detected, diagnosed and recovered. */
export const DEMO_STEPS: DemoStep[] = [
  { n: 1, title: 'Welcome to VYUH-MCS', screen: 'S00', route: 'landing', action: 'Sign in',
    say: 'VYUH-MCS runs a satellite constellation from one console: live telemetry in 100 ms, commands that can never be sent twice, and AI that advises but never acts alone.',
    run: (nav) => nav('signin') },
  { n: 2, title: 'Sign in with a passkey', screen: 'S01', route: 'signin', action: 'Use passkey',
    say: 'No passwords. Operators sign in with a passkey bound to their device, so a phished password is worthless (Q-14). Every sign-in is written to the audit ledger.',
    run: (nav) => nav('scope') },
  { n: 3, title: 'Choose mission and role', screen: 'S02', route: 'scope', action: 'Continue as operator',
    say: 'The role sets what this session may do and which satellites it can see. We work as a Spacecraft Operator on the Akashaveda fleet.',
    run: (nav) => { useAuthStore.getState().signInAs('USR-001', 'Spacecraft Operator'); nav('fleet'); } },
  { n: 4, title: 'Fleet at a glance', screen: 'S03', route: 'fleet', action: 'Inject heater fault on AKV-03',
    say: 'Twelve satellites, their ground tracks and the station each one is talking to. Values update live without animation, so nothing on screen misrepresents a rate of change.',
    run: () => useMissionStore.getState().injectHeaterFault() },
  { n: 5, title: 'A fault is developing', screen: 'S03', route: 'fleet', action: 'Open advisories',
    say: 'Heater A on AKV-03 has failed on. Battery temperature starts to fall. Within about ten seconds the anomaly model raises an advisory.',
    run: (nav) => nav('anomalies') },
  { n: 6, title: 'The AI notices first', screen: 'S20', route: 'anomalies', action: 'Open alarm console',
    say: 'The multivariate model flags AKV-03: temperature falling while heater A runs at 97 % duty. It is an advisory with evidence; a person confirms or dismisses it (P-01).',
    run: (nav) => nav('alarms') },
  { n: 7, title: 'The alarm follows', screen: 'S06', route: 'alarms', action: 'Ack AL-801 · open AKV-03 power',
    say: 'When BAT_TEMP crosses the 10 °C warning limit, Events & Alarms raises an ISA-18.2 alarm. Acknowledge it to take ownership; shelving would need a reason and an expiry.',
    run: (nav) => { useAlarmStore.getState().acknowledgeAlarm('AL-801'); nav('satellite?sat=AKV-03&tab=POWER'); } },
  { n: 8, title: 'Look at the satellite', screen: 'S04', route: 'satellite', action: 'Ask the copilot',
    say: 'Every Power parameter with its limit bar, sparkline and freshness. BAT_TEMP is falling and the alarm is on the right.',
    run: (nav) => nav('copilot') },
  { n: 9, title: 'Ask the copilot', screen: 'S22', route: 'copilot', action: 'Open procedure runner',
    say: 'The copilot answers from procedures and past pass reports, with citations. It is read-only by design: it can explain PR-THM-004 but has no permission to run it.',
    run: (nav) => nav('procedure') },
  { n: 10, title: 'Run the recovery procedure', screen: 'S14', route: 'procedure', action: 'Switch to Flight Director',
    say: 'PR-THM-004 runs as a durable workflow. Step through steps 1–4. Step 5 switches heater B on — a critical command, so the run waits for a second person.',
    run: (nav) => {
      useMissionStore.getState().requestApproval(demoApprovalNow());
      useMissionStore.getState().addCommand({
        command_id: 'CMD-8841', sat_id: 'AKV-03', mnemonic: 'HTR_SWITCH', params: { HEATER: 'B', STATE: 'ON' },
        status: 'AWAITING_APPROVAL', requested_by: 'Vikram Shetty', epoch: 17,
        utc: new Date().toISOString(), critical: true,
      });
      useAuthStore.getState().signInAs('USR-002', 'Flight Director'); // Ananya Rao — a different person
      nav('approvals');
    } },
  { n: 11, title: 'Second person approves', screen: 'S13', route: 'approvals', action: 'Approve with passkey · uplink',
    say: 'As Flight Director, review who asked, why, the parameters and the live interlock snapshot. Approve with a fresh passkey touch (C-07). The requester could never approve their own request.',
    run: (nav) => {
      const m = useMissionStore.getState();
      if (m.approvals.some((a) => a.state === 'PENDING')) m.decideApproval('AP-2261', true, useAuthStore.getState().user.name);
      useAuthStore.getState().signInAs('USR-001', 'Spacecraft Operator'); // back to Vikram Shetty
      nav('uplink?sat=AKV-03');
    } },
  { n: 12, title: 'Delivered exactly once', screen: 'S15', route: 'uplink', action: 'Back to AKV-03',
    say: 'The TC Encoder holds the only lease for this satellite, stamped with a fencing epoch. COP-1 delivers the frame, the CLCW confirms receipt and V(S) advances. PUS 1 reports accepted, started, completed.',
    run: (nav) => {
      const m = useMissionStore.getState();
      m.setCommandStatus('CMD-8841', 'ACCEPTED');
      m.switchHeaterB();
      m.setCommandStatus('CMD-8841', 'COMPLETED');
      m.appendAudit({
        timestamp_utc: new Date().toISOString(), operator_id: 'USR-001', operator_name: 'Vikram Shetty',
        sat_id: 'AKV-03', command_mnemonic: 'HTR_SWITCH', procedure_id: PROCEDURE_PR_THM_004.id,
        procedure_version: PROCEDURE_PR_THM_004.version, sequence_count: 42, result: 'ACK',
        params_summary: 'HEATER=B STATE=ON — completed (PUS 1/7)',
      });
      nav('satellite?sat=AKV-03&tab=POWER');
    } },
  { n: 13, title: 'Temperature recovers', screen: 'S04', route: 'satellite', action: 'Open audit ledger',
    say: 'Heater B is on and BAT_TEMP climbs back; the alarm returns to normal on its own.',
    run: (nav) => nav('audit') },
  { n: 14, title: 'Proof for the auditor', screen: 'S26', route: 'audit', action: 'Verify chain · platform health',
    say: 'Advisory, acknowledgement, request, approval, commands and completion are all in a hash-chained ledger anchored to write-once storage.',
    run: (nav) => { useMissionStore.getState().verifyChain(); window.setTimeout(() => nav('platform'), 1200); } },
  { n: 15, title: 'The platform behind it', screen: 'S27', route: 'platform', action: 'Finish demo',
    say: '31 modules across three zones and a DR region, with deployments frozen during passes. The ⓘ button in the top bar shows each screen’s specification.',
    run: () => useDemoStore.getState().stop() },
];

interface DemoStore {
  running: boolean;
  index: number;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  goto: (index: number) => void;
}

export const useDemoStore = create<DemoStore>((set, get) => ({
  running: false,
  index: 0,
  start: () => set({ running: true, index: 0 }),
  stop: () => set({ running: false }),
  toggle: () => set((s) => ({ running: !s.running })),
  next: () => set((s) => ({ index: Math.min(s.index + 1, DEMO_STEPS.length - 1) })),
  prev: () => set((s) => ({ index: Math.max(s.index - 1, 0) })),
  goto: (index) => set({ index: Math.max(0, Math.min(index, DEMO_STEPS.length - 1)) }),
}));

/** Runs the current step's action, then advances. */
export function runCurrentStep(nav: (to: string) => void) {
  const { index, next } = useDemoStore.getState();
  DEMO_STEPS[index].run?.(nav);
  next();
}
