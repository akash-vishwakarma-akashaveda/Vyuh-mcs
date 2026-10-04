/**
 * Headless check of the governance rules: ledger hash walk, users-and-access
 * two-person rules, key changes, and that every demo step's screen is open to its persona.
 * Run alone: esbuild src/checks/govern.check.ts --bundle --platform=node --format=cjs --outfile=node_modules/.tmp/govern.cjs "--define:import.meta.env={}" && node node_modules/.tmp/govern.cjs
 */
import assert from 'node:assert/strict';
import { useAuthStore } from '../store/useAuthStore';
import { useMissionStore } from '../store/useMissionStore';
import { digest, toCsv, walk } from '../store/useLedgerStore';
import { useUsersStore } from '../store/useUsersStore';
import { useKeyStore } from '../store/useKeyStore';
import { DEMO_STEPS } from '../store/useDemoStore';
import { canOpenRoute } from '../auth/policy';

(async () => {
  /* ledger: an intact chain passes; an edited field or a removed record is caught */
  const audit = useMissionStore.getState().audit;
  const seals: Record<string, string> = {};
  for (const r of audit) seals[r.record_id] = await digest(r);
  assert.equal((await walk(audit, seals)).problems.length, 0, 'seeded chain is intact');
  const edited = audit.map((r, i) => (i === 3 ? { ...r, params_summary: 'tampered' } : r));
  assert.deepEqual((await walk(edited, seals)).problems.map((p) => p.record_id), [audit[3].record_id], 'edited record is caught');
  const removed = audit.filter((_, i) => i !== 4);
  assert.ok((await walk(removed, seals)).problems.some((p) => p.record_id === audit[3].record_id), 'removed record breaks the next link');
  const csv = toCsv([{ ...audit[0], params_summary: 'a "quoted", =cmd' }]);
  assert.ok(csv.includes('"a ""quoted"", =cmd"') && csv.split('\r\n')[0].includes('kind'), 'CSV quotes every field');
  assert.ok(toCsv([{ ...audit[0], operator_name: '=HYPERLINK()' }]).includes(`"'=HYPERLINK()"`), 'formula cells are defused');

  /* users: requester never approves; nobody approves their own account; no self-suspend */
  const auth = useAuthStore.getState();
  auth.signInAs('USR-005', 'Security Officer'); // Farah raised GR-0107
  const u = useUsersStore.getState();
  assert.match(u.approveGrant('GR-0107')!, /raised this request/);
  assert.match(u.setStatus('USR-005', 'Suspended')!, /own account/);
  auth.signInAs('USR-011', 'Flight Director'); // Arjun is the subject, and not an administrator
  assert.ok(useUsersStore.getState().approveGrant('GR-0107'), 'a non-administrator cannot approve');
  auth.signInAs('USR-006', 'Platform Administrator');
  assert.equal(useUsersStore.getState().approveGrant('GR-0107'), null, 'a second administrator approves');
  assert.ok(useUsersStore.getState().people.find((p) => p.id === 'USR-011')!.roles.includes('Spacecraft Operator'));
  const s0 = useUsersStore.getState().sessions[0];
  assert.equal(useUsersStore.getState().revokeSession(s0.id), null);
  assert.ok(useUsersStore.getState().revokeSession(s0.id), 'a revoked session stays revoked');
  const inv = useUsersStore.getState().issueInvite({ name: 'Test Person', email: 't@akashaveda.com', role: 'Flight Director', scope: ['AKV-*'], expiresH: 24 });
  assert.match(inv.key!, /^AKV-INV-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(useUsersStore.getState().keys[0].state, 'AWAITING_SECOND', 'commanding invite waits for a second administrator');
  assert.ok(!JSON.stringify(useUsersStore.getState()).includes(inv.key!), 'the key itself is never stored');

  /* keys: requester cannot apply their own change */
  auth.signInAs('USR-005', 'Security Officer');
  assert.match(useKeyStore.getState().approve('KR-0041')!, /raised this request/);
  auth.signInAs('USR-006', 'Platform Administrator');
  assert.equal(useKeyStore.getState().approve('KR-0041'), null);
  assert.equal(useKeyStore.getState().keys.filter((k) => k.satId === 'AKV-05' && k.type === 'SESSION' && k.state === 'ACTIVE').length, 1, 'one active session key after OTAR');

  /* demo: every step's screen is open to the step's persona */
  for (const s of DEMO_STEPS) assert.ok(canOpenRoute(s.route, s.as.role), `step ${s.n} (${s.route}) is open to ${s.as.role}`);

  console.log('govern.check: OK');
})().catch((e) => { console.error(e); process.exit(1); });
