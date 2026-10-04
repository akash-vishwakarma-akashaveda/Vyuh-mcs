/**
 * The demo world holds together: every reference points at something that exists, the two-person
 * rule holds in the seeded approvals, and the seeded ledger chains. Run: npm run check
 */
import assert from 'node:assert/strict';
import {
  ADVISORIES, ALARMS, COMMANDS, CONDITIONS, GENESIS, GRANTS, KEY_REQUESTS, ONCALL, PAGES, PASSES, PASS_REPORTS, PROCEDURE_RUN,
  REQUESTS, SEED_APPROVALS, SEED_COMMANDS, SESSIONS, seedAudit, T0, MDB_TIMELINE,
} from '../demo/scenario';
import { PEOPLE } from '../store/useAuthStore';
import { FLEET, STATIONS, tenantOf } from '../data/fleet';
import { can } from '../auth/policy';
import { REVIEWER_ROLES } from '../store/useMdbStore';

const person = (name: string) => PEOPLE.find((p) => p.name === name);
const sat = (id: string) => FLEET.some((s) => s.sat_id === id);

// alarms: one per condition, on a real satellite
assert.equal(ALARMS.length, CONDITIONS.length);
for (const a of ALARMS) assert.ok(sat(a.sat_id), `${a.alarm_id} on a real satellite`);
for (const a of ALARMS) if (a.acknowledged_by) assert.ok(can('alarm:ack', person(a.acknowledged_by)!.roles[0]).allowed || person(a.acknowledged_by)!.roles.some((r) => can('alarm:ack', r).allowed), `${a.alarm_id} acked by someone allowed`);
for (const v of ADVISORIES) if (v.linked_alarm_id) {
  const a = ALARMS.find((x) => x.alarm_id === v.linked_alarm_id);
  assert.ok(a, `${v.advisory_id} links a real alarm`);
  assert.equal(a!.sat_id, v.sat_id, `${v.advisory_id} and its alarm are on the same satellite`);
}

// commands and approvals: every approval has its command, requester ≠ approver, approver may approve
for (const ap of SEED_APPROVALS) {
  const c = SEED_COMMANDS.find((x) => x.command_id === ap.command_id);
  assert.ok(c, `${ap.approval_id} has command ${ap.command_id}`);
  assert.equal(c!.approval_id, ap.approval_id);
  assert.ok(person(ap.requested_by), `${ap.approval_id} requester is a real person`);
  if (ap.decided_by) {
    assert.notEqual(ap.decided_by, ap.requested_by, `${ap.approval_id}: requester never approves`);
    assert.ok(person(ap.decided_by)!.roles.includes('Flight Director'), `${ap.approval_id} decided by a Flight Director`);
  } else {
    assert.ok(Date.parse(ap.expires_utc) - T0 >= 2 * 3600_000, `${ap.approval_id} lasts a demo session`);
    assert.equal(c!.status, 'AWAITING_APPROVAL');
  }
}
for (const c of COMMANDS) assert.ok(person(c.by)!.roles.some((r) => can('command:send', r).allowed), `${c.id} sent by someone who may command`);
assert.equal(new Set(SEED_COMMANDS.map((c) => c.command_id)).size, SEED_COMMANDS.length, 'command ids unique');

// the ledger: chained from genesis, every actor real (or the system), every command recorded
const audit = seedAudit();
let prev = GENESIS;
for (const r of [...audit].reverse()) { assert.equal(r.prev_record_sha256, prev, `${r.record_id} links`); prev = r.bytes_sha256; }
for (const r of audit) assert.ok(r.operator_id === 'SYS' || person(r.operator_name), `${r.record_id} actor ${r.operator_name} exists`);
for (const r of audit) assert.ok(Date.parse(r.timestamp_utc) <= T0, `${r.record_id} is in the past`);
for (const c of COMMANDS) assert.ok(audit.some((r) => r.params_summary.startsWith(`${c.id} `)), `${c.id} is in the ledger`);
assert.ok(audit.some((r) => r.params_summary === `run ${PROCEDURE_RUN.id}: completed`), 'the finished run is in the ledger');

// passes, reports, payload sessions, requests, products
for (const rep of PASS_REPORTS) assert.ok(PASSES.some((p) => p.session_id === rep.session_id && p.state === 'COMPLETE'), `${rep.report_id} belongs to a flown pass`);
for (const s of SESSIONS) {
  assert.ok(PASSES.some((p) => p.sat_id === s.sat && p.station_id === s.station && s.startedAt >= Date.parse(p.aos_utc) && s.startedAt <= Date.parse(p.los_utc)), `${s.id} came down on a pass`);
  assert.equal(tenantOf(s.sat), s.tenant, `${s.id} tenant matches its satellite`);
  assert.ok(STATIONS.some((x) => x.id === s.station));
}
for (const r of REQUESTS) {
  if (r.deliveryId) {
    const s = SESSIONS.find((x) => x.id === r.deliveryId);
    assert.ok(s, `${r.id} payload session exists`);
    assert.equal(s!.requestId, r.id);
    assert.equal(s!.tenant, r.tenant, `${r.id} same tenant end to end`);
    assert.equal(s!.sat, r.placement?.sat);
  }
  if (r.productId) assert.equal(SESSIONS.find((x) => x.id === r.deliveryId)!.productId, r.productId, `${r.id} product is its session's`);
  if (r.state === 'DELIVERED') assert.ok(r.productId, `${r.id} delivered with a product`);
  if (r.tenant !== 'Akashaveda') assert.ok(person(r.requestedBy), `${r.id} requester exists`);
}

// governance: real people with allowed roles
for (const o of ONCALL) assert.ok(person(o.name), `on-call ${o.name} exists`);
assert.ok(person(ONCALL.find((o) => o.position === 'Flight Director')!.name)!.roles.includes('Flight Director'));
for (const p of PAGES) if (p.ackBy) assert.ok(person(p.ackBy));
for (const g of GRANTS) { assert.ok(PEOPLE.some((p) => p.id === g.personId)); assert.ok(PEOPLE.some((p) => p.id === g.requestedBy)); if (g.state === 'APPROVED') assert.notEqual(g.decidedBy, g.requestedBy); }
for (const k of KEY_REQUESTS) { assert.ok(person(k.requestedByName)); if ('decidedBy' in k && k.decidedBy) assert.notEqual(k.decidedBy, k.requestedByName); }
for (const name of [...MDB_TIMELINE.older.reviewers, ...MDB_TIMELINE.active419.reviewers, ...MDB_TIMELINE.draft420.reviewers.map((r) => r.name)]) {
  const p = person(name);
  assert.ok(p, `MDB reviewer ${name} exists`);
  assert.ok(p!.roles.some((r) => REVIEWER_ROLES.includes(r)), `MDB reviewer ${name} holds a reviewer role`);
  assert.notEqual(name, MDB_TIMELINE.draft420.author, 'the author never reviews');
}

console.log('scenario.check: OK');
