/**
 * Headless check of the procedure engine: checks read live values, the critical step raises a
 * real approval as the run owner, and the run continues after approval with no screen mounted (C1).
 * Run: add `import '../store/procedureRun.check';` to src/checks/run.ts, then npm run check.
 */
import assert from 'node:assert/strict';
import { useAuthStore } from './useAuthStore';
import { useFleetStore } from './useFleetStore';
import { useMissionStore } from './useMissionStore';
import { tickProcedures, useProcedureRunStore } from './useProcedureRunStore';

const now = () => new Date().toISOString();
const param = (id: string, v: number) => ({ param_id: id, name: id, subsystem: 'POWER' as const, eu_value: v, unit: '°C', alarm_state: 0 as const, quality: 0 as const, timestamp_utc: now() });
useFleetStore.setState({
  cvt: { 'AKV-03': { BAT_TEMP: param('BAT_TEMP', 3.1), HTR_B_STATE: param('HTR_B_STATE', 0) } },
  contactWindows: [{ window_id: 'W', sat_id: 'AKV-03', ground_station: 'HYD', aos_utc: new Date(Date.now() - 60_000).toISOString(), los_utc: new Date(Date.now() + 600_000).toISOString(), duration_seconds: 660, max_elevation_deg: 40, frequency_band: 'X', quality_score: 90, status: 'AOS' }],
});
useAuthStore.getState().signInAs('USR-001', 'Spacecraft Operator');
const S = () => useProcedureRunStore.getState();
const id = S().start('PR-THM-004', 'AKV-03', 'AUTO');
const run = () => S().runs.find((r) => r.id === id)!;
const tick = (n = 1) => { for (let i = 0; i < n; i++) tickProcedures(); };

tick(3); // contact check, BAT_TEMP check, step 3 command raised
assert.equal(run().steps[0].status, 'DONE');
assert.equal(run().steps[1].status, 'DONE', 'BAT_TEMP 3.1 is below 10');
const c3 = run().steps[2].commandId!;
assert.ok(c3, 'step 3 raised a command');
assert.equal(useMissionStore.getState().commands.find((c) => c.command_id === c3)!.status, 'RELEASED');
useMissionStore.getState().setCommandStatus(c3, 'ACCEPTED');
tick();
assert.equal(run().steps[2].status, 'DONE');
tick(); // step 4 waits for TM(1,7)
useMissionStore.getState().setCommandStatus(c3, 'COMPLETED');
tick(2); // step 4 done, step 5 raises the approval
const appr = useMissionStore.getState().approvals.find((a) => a.approval_id === run().steps[4].approvalId)!;
assert.equal(appr.requested_by, 'Vikram Shetty', 'requested as the person who started the run');
assert.equal(run().waitingFor, 'APPROVAL');

// The Flight Director approves while the operator is elsewhere; nothing on screen is involved.
useAuthStore.getState().signInAs('USR-002', 'Flight Director');
useMissionStore.getState().decideApproval(appr.approval_id, true, 'Ananya Rao');
useMissionStore.getState().setCommandStatus(appr.command_id, 'ACCEPTED');
tick(2);
assert.equal(run().steps[4].status, 'DONE', 'continues by itself after approval');
const c6 = useMissionStore.getState().commands.find((c) => c.command_id === run().steps[5].commandId)!;
assert.equal(c6.requested_by, 'Vikram Shetty', 'later steps still act for the run owner');

// A stale value fails a check closed and holds the run.
const id2 = S().start('PR-THM-004', 'AKV-03', 'AUTO');
useFleetStore.setState((s) => ({ cvt: { 'AKV-03': { ...s.cvt['AKV-03'], BAT_TEMP: { ...param('BAT_TEMP', 3.1), timestamp_utc: new Date(Date.now() - 60_000).toISOString() } } } }));
tick(4);
const r2 = S().runs.find((r) => r.id === id2)!;
assert.equal(r2.state, 'HELD');
assert.match(r2.held!, /fails closed/);

console.log('procedureRun.check: OK');
