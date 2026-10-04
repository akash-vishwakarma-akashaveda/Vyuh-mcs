/**
 * Headless check of the demo-critical logic: routing, the alarm lifecycle, the
 * two-person rule and the audit hash chain. Run: npm run check
 */
import assert from 'node:assert/strict';
import { normalize, parseHash, toHash } from '../router/routes';
import { useAlarmStore } from '../store/useAlarmStore';
import { PEOPLE, useAuthStore } from '../store/useAuthStore';
import { can, canApprove, canOpen } from '../auth/policy';
import { useMissionStore } from '../store/useMissionStore';
import { CONDITIONS } from '../demo/scenario';
import { CHAPTER_START, DEMO_CHAPTERS, DEMO_STEPS } from '../store/useDemoStore';
import { SCREENS } from '../data/screens';
import { FLEET, PARAMETERS } from '../data/fleet';

/* --- routes --------------------------------------------------------------- */
assert.deepEqual(parseHash('#/satellite?sat=AKV-03&tab=POWER'),
  { route: 'satellite', params: { sat: 'AKV-03', tab: 'POWER' } });
assert.equal(parseHash('').route, 'landing');
assert.equal(toHash('parameter', { sat: 'AKV-03', param: 'BAT_TEMP' }), '#/parameter?sat=AKV-03&param=BAT_TEMP');
// legacy paths from the pre-v2 screens still land somewhere real
assert.equal(normalize('/satellites/AKV-03'), '#/satellite?sat=AKV-03');
assert.equal(normalize('/satellites/AKV-03/parameters/BAT_TEMP'), '#/parameter?sat=AKV-03&param=BAT_TEMP');
assert.equal(normalize('/commanding/queue'), '#/uplink');
assert.equal(normalize('/admin/audit'), '#/audit');
assert.equal(normalize('fleet'), '#/fleet');

/* --- screen inventory ----------------------------------------------------- */
assert.equal(SCREENS.length, 34, '29 SRS v2 screens plus 5 gap-analysis screens');
assert.equal(new Set(SCREENS.map((s) => s.route)).size, 34, 'routes are unique');
// every route the demo drives to must resolve to a screen, as a person who holds the step's role
for (const step of DEMO_STEPS) {
  assert.ok(SCREENS.some((s) => s.route === step.route), `demo step ${step.n} targets a real screen`);
  assert.ok(PEOPLE.find((p) => p.id === step.as.person)?.roles.includes(step.as.role), `demo step ${step.n}: ${step.as.name} holds ${step.as.role}`);
  assert.equal(PEOPLE.find((p) => p.id === step.as.person)?.name, step.as.name);
}
// four chapters, each a contiguous run of steps that starts where the picker jumps to
assert.equal(DEMO_CHAPTERS.length, 4);
DEMO_CHAPTERS.forEach((_, c) => {
  assert.ok(CHAPTER_START[c] >= 0, `chapter ${c + 1} has steps`);
  assert.equal(DEMO_STEPS[CHAPTER_START[c]].chapter, c);
  if (c > 0) assert.equal(DEMO_STEPS[CHAPTER_START[c] - 1].chapter, c - 1, 'chapters are in order');
});
// the second person differs from the requester in both approval steps
const appr = DEMO_STEPS.filter((s) => s.route === 'approvals');
assert.equal(appr.length, 2);
for (const s of appr) assert.notEqual(DEMO_STEPS[s.n - 2].as.person, s.as.person, `step ${s.n}: the approver is not the requester`);

/* --- alarm lifecycle (ISA-18.2) ------------------------------------------- */
useAlarmStore.getState().clearAll(); // start from no alarms; the scenario's own are checked in scenario.check
const alarms = useAlarmStore.getState();
alarms.addAlarm({
  alarm_id: 'AL-801', sat_id: 'AKV-03', param_id: 'BAT_TEMP', subsystem: 'POWER',
  alarm_state: 1, eu_value: 9.2, unit: '°C', timestamp_utc: new Date().toISOString(), acknowledged: false,
});
alarms.addAlarm({ ...useAlarmStore.getState().active[0] });           // duplicate is ignored
assert.equal(useAlarmStore.getState().active.length, 1);
useAlarmStore.getState().acknowledgeAlarm('AL-801', 'Vikram Shetty');
assert.equal(useAlarmStore.getState().active[0].state, 'ACKED');
useAlarmStore.getState().shelveAlarm('AL-801', 'known heater fault', 30);
assert.equal(useAlarmStore.getState().active[0].state, 'SHELVED');
useAlarmStore.getState().returnToNormal('AL-801');
assert.equal(useAlarmStore.getState().active.length, 0);
assert.equal(useAlarmStore.getState().history[0].state, 'RTN');

/* --- two-person rule and the audit chain ---------------------------------- */
useMissionStore.setState({ approvals: [], commands: [] });
const m = useMissionStore.getState();
m.addCommand({
  command_id: 'CMD-8841', sat_id: 'AKV-03', mnemonic: 'HTR_SWITCH', params: { HEATER: 'B', STATE: 'ON' },
  status: 'AWAITING_APPROVAL', requested_by: 'Vikram Shetty', epoch: 17,
  utc: new Date().toISOString(), critical: true,
});
m.requestApproval({
  approval_id: 'AP-2261', command_id: 'CMD-8841', sat_id: 'AKV-03', mnemonic: 'HTR_SWITCH', params: { HEATER: 'B', STATE: 'ON' },
  reason: 'PR-THM-004 step 5', requested_by: 'Vikram Shetty', requester_role: 'Spacecraft Operator', requested_utc: new Date().toISOString(),
  expires_utc: new Date(Date.now() + 20 * 60_000).toISOString(), state: 'PENDING', interlocks: [],
});
assert.equal(useMissionStore.getState().approvals[0].state, 'PENDING');

// the requester is never the approver
useAuthStore.getState().setRole('Spacecraft Operator');
assert.equal(useMissionStore.getState().approvals[0].requested_by, 'Vikram Shetty');

useMissionStore.getState().decideApproval('AP-2261', true, 'Ananya Rao');
const after = useMissionStore.getState();
assert.equal(after.approvals[0].state, 'APPROVED');
assert.equal(after.approvals[0].decided_by, 'Ananya Rao');
assert.equal(after.commands[0].status, 'RELEASED');
assert.equal(after.commands[0].approved_by, 'Ananya Rao');

// V(S) advances exactly once per accepted command (Q-04)
const vsBefore = after.fop1.vS;
useMissionStore.getState().setCommandStatus('CMD-8841', 'ACCEPTED');
assert.equal(useMissionStore.getState().fop1.vS, vsBefore + 1);

// every record links to the previous one
useMissionStore.getState().appendAudit({
  timestamp_utc: new Date().toISOString(), operator_id: 'USR-001', operator_name: 'Vikram Shetty',
  sat_id: 'AKV-03', command_mnemonic: 'HTR_SWITCH', procedure_id: 'PR-THM-004', procedure_version: '4.2.0',
  sequence_count: 42, result: 'ACK', params_summary: 'HEATER=B STATE=ON',
});
const chain = [...useMissionStore.getState().audit].reverse();
assert.ok(chain.length >= 2, 'approval and completion are both recorded');
let prev = '0'.repeat(64);
for (const r of chain) {
  assert.equal(r.prev_record_sha256, prev, `record ${r.record_id} links to its predecessor`);
  assert.equal(r.bytes_sha256.length, 64);
  prev = r.bytes_sha256;
}

/* --- authorisation ---------------------------------------------------------- */
{
  // Capability matrix
  assert.equal(can('command:approve', 'Flight Director').allowed, true);
  assert.equal(can('command:approve', 'Spacecraft Operator').allowed, false, 'operators cannot approve');
  assert.equal(can('command:send', 'Flight Engineer').allowed, false, 'engineers do not command');
  assert.equal(can('alarm:ack', 'Customer User').allowed, false, 'customers never touch alarms');
  assert.ok(can('command:send', 'Customer User').reason, 'a refusal always explains itself');

  // The two-person rule binds to the person, not the role: holding Flight Director
  // is not enough if you are the one who asked.
  assert.equal(canApprove('Flight Director', 'Ananya Rao', 'Ananya Rao').allowed, false);
  assert.equal(canApprove('Flight Director', 'Vikram Shetty', 'Ananya Rao').allowed, true);
  assert.equal(canApprove('Spacecraft Operator', 'Vikram Shetty', 'Ananya Rao').allowed, false);

  // The administrator reaches everything but commands nothing.
  assert.equal(can('platform:admin', 'System Administrator').allowed, true);
  assert.equal(can('user:manage', 'System Administrator').allowed, true);
  assert.equal(can('audit:verify', 'System Administrator').allowed, true);
  assert.equal(can('command:send', 'System Administrator').allowed, false, 'admin is not a commanding role');
  assert.equal(can('command:approve', 'System Administrator').allowed, false, 'admin cannot be the second person');
  assert.equal(can('alarm:ack', 'System Administrator').allowed, false);
  assert.match(can('command:send', 'System Administrator').reason!, /no spacecraft authority/);
  assert.equal(canApprove('System Administrator', 'Vikram Shetty', 'Aditya Menon').allowed, false);
  for (const s of SCREENS.filter((s) => s.flow !== 'public')) {
    assert.equal(canOpen(s, 'System Administrator'), true, `admin can open ${s.id}`);
  }

  // Screen access
  const approvalsScreen = SCREENS.find((s) => s.route === 'approvals')!;
  const customerScreen = SCREENS.find((s) => s.route === 'customer')!;
  const fleetScreen = SCREENS.find((s) => s.route === 'fleet')!;
  assert.equal(canOpen(approvalsScreen, 'Flight Director'), true);
  assert.equal(canOpen(approvalsScreen, 'Spacecraft Operator'), false);
  assert.equal(canOpen(fleetScreen, 'Customer User'), false, 'tenant isolation: no fleet view');
  assert.equal(canOpen(customerScreen, 'Customer User'), true);

  // A role can only be switched to if the person actually holds it.
  const auth = useAuthStore.getState();
  auth.signInAs('USR-001'); // Vikram Shetty — Operator / Engineer
  useAuthStore.getState().setRole('Flight Director');
  assert.notEqual(useAuthStore.getState().activeRole, 'Flight Director', 'cannot self-promote');
  useAuthStore.getState().setRole('Flight Engineer');
  assert.equal(useAuthStore.getState().activeRole, 'Flight Engineer');

  // Signing in as someone else changes the identity, not just the label.
  useAuthStore.getState().signInAs('USR-002', 'Flight Director');
  assert.equal(useAuthStore.getState().user.name, 'Ananya Rao');
  assert.equal(useAuthStore.getState().activeRole, 'Flight Director');

  // Every person's seeded roles are real roles, and every screen is reachable by someone.
  const ALL = PEOPLE.flatMap((p) => p.roles);
  for (const screen of SCREENS.filter((s) => s.flow !== 'public')) {
    assert.ok(ALL.some((r) => canOpen(screen, r)), `${screen.id} is reachable by some role`);
  }
}

/* --- fleet scale and the dictionary's alarm bounds ------------------------- */
{
  assert.equal(FLEET.length, 50, 'fleet is 50 satellites');
  assert.equal(new Set(FLEET.map((s) => s.sat_id)).size, 50, 'every sat_id is unique');
  // Health follows the telemetry; the scenario decides which satellites sit off-nominal.
  const sats = new Set(CONDITIONS.map((c) => c.sat));
  assert.ok(sats.size > 0 && sats.size <= 10, `a handful in warning, not the whole fleet (got ${sats.size})`);
  for (const c of CONDITIONS) {
    assert.ok(FLEET.some((s) => s.sat_id === c.sat), `${c.sat} is in the fleet`);
    const p = Object.values(PARAMETERS).flat().find((x) => x.param_id === c.param)!;
    const state = c.value <= p.critLo || c.value >= p.critHi ? 2 : c.value <= p.warnLo || c.value >= p.warnHi ? 1 : 0;
    assert.equal(state, 1, `${c.sat} ${c.param}=${c.value} is a warning (nothing opens critical, nothing is a fake warning)`);
  }

  // Regression guard for the exact bug this caught: a discrete flag or counter
  // whose *nominal* value sits on its own critLo/critHi reads CRITICAL forever.
  for (const defs of Object.values(PARAMETERS)) {
    for (const p of defs) {
      const state = p.value <= p.critLo || p.value >= p.critHi ? 2 : p.value <= p.warnLo || p.value >= p.warnHi ? 1 : 0;
      assert.equal(state, 0, `${p.param_id}'s resting value (${p.value}) must not sit on its own alarm bound`);
    }
  }
}

console.log('demo.check: OK');
