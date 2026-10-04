import { create } from 'zustand';
import { tenantOfPerson, useAuthStore } from './useAuthStore';
import { useAlarmStore } from './useAlarmStore';
import { useMissionStore } from './useMissionStore';
import { useLedgerStore } from './useLedgerStore';
import { useProcedureRunStore } from './useProcedureRunStore';
import { useRequestStore } from './useRequestStore';
import { daylightTarget, usePlanStore } from './usePlanStore';
import { useBookingStore } from './useBookingStore';
import { stageOf, useDeliveryStore, productManifest, saveBlob } from './useDeliveryStore';
import { useMdbStore } from './useMdbStore';
import { useAdvisoryStore } from './useAdvisoryStore';
import { useUsersStore } from './useUsersStore';
import { answer, useCopilotStore } from '../components/organisms/copilotEngine';
import { restageHeaterStory } from '../mocks/mockTelemetryEngine';
import { FACTS } from '../data/facts';
import type { UserRole } from '../types';

type Nav = (to: string) => void;
/** A step's action. Returns a sentence when it could not do its job: the demo stays and shows it. */
type Action = () => void | string | undefined | Promise<void | string | undefined>;

export interface DemoStep {
  n: number;
  chapter: number;
  title: string;
  screen: string;          // S-ID, for the caption
  route: string;           // screen route the step is shown on
  params?: string | (() => string);
  /** The person and role the step is seen as. Every route is open to that role. */
  as: { person: string; role: UserRole; name: string };
  say: string;
  action: string;          // label of Next: it runs `run`, then moves on
  run?: Action;
}

export interface DemoChapter { title: string; who: string; summary: string; setup?: () => void }

const P = (person: string, role: UserRole, name: string) => ({ person, role, name });
const VIKRAM = P('USR-001', 'Spacecraft Operator', 'Vikram Shetty');
const VIKRAM_FE = P('USR-001', 'Flight Engineer', 'Vikram Shetty');
const ANANYA = P('USR-002', 'Flight Director', 'Ananya Rao');
const MEERA = P('USR-003', 'Mission Database Engineer', 'Meera Iyer');
const KARAN = P('USR-004', 'Mission Planner', 'Karan Malhotra');
const FARAH = P('USR-005', 'Security Officer', 'Farah Siddiqui');
const ROHIT = P('USR-006', 'Platform Administrator', 'Rohit Nair');
const LEENA = P('USR-007', 'ML Engineer', 'Leena Joseph');
const PRIYA = P('USR-008', 'Customer User', 'Priya Nabhas');
const NISHA = P('USR-014', 'Flight Engineer', 'Nisha Pillai');

const me = () => useAuthStore.getState().user;
const actor = () => ({ id: me().id, name: me().name, role: useAuthStore.getState().activeRole });
const why = (r: { ok: true } | { ok: false; reason: string }) => (r.ok ? undefined : r.reason);

/** Waits until `pred` holds, checking four times a second. False on timeout. */
export const until = (pred: () => boolean, ms: number) => new Promise<boolean>((res) => {
  const t0 = Date.now();
  const tick = () => { if (pred()) res(true); else if (Date.now() - t0 > ms) res(false); else setTimeout(tick, 250); };
  tick();
});

// ---- what the steps act on, found in the stores so a chapter can start cold ---------------------

const heaterRun = () => useProcedureRunStore.getState().runs.find((r) => r.procId === 'PR-THM-004' && r.satId === 'AKV-03');
const heaterStep5 = () => heaterRun()?.steps[4];
const ctx: { requestId?: string; mdb?: string } = {};
const priyaRequest = () => useRequestStore.getState().requests.find((r) => r.id === ctx.requestId);
const priyaSession = () => useDeliveryStore.getState().sessions.find((s) => s.id === priyaRequest()?.deliveryId);
const mdbRelease = () => useMdbStore.getState().releases.find((r) => r.version === ctx.mdb);
const openAdvisory = () => { const all = useMissionStore.getState().advisories.filter((a) => a.state === 'NEW'); return all.find((a) => a.advisory_id === 'AN-401') ?? all[0]; };
const farahGrant = () => useUsersStore.getState().grants.find((g) => g.keyId && g.requestedBy === FARAH.person);
const heldWhy = () => { const r = heaterRun(); return r?.state === 'HELD' ? `The run is held: ${r.held}` : r?.state === 'ABORTED' ? 'The run was aborted.' : undefined; };

export const DEMO_CHAPTERS: DemoChapter[] = [
  {
    title: 'Operations', who: 'Vikram (operator) and Ananya (Flight Director)',
    summary: 'A heater fails, the AI and the alarm catch it, a procedure recovers it under the two-person rule.',
    setup: () => {
      const run = heaterRun();
      if (run && run.state !== 'COMPLETED' && run.state !== 'ABORTED') useProcedureRunStore.getState().abort(run.id, 'Guided demo restarted');
      restageHeaterStory();
    },
  },
  {
    title: 'Planning and customers', who: 'Priya (customer), Karan (planner), Ananya',
    summary: 'A customer asks for imagery; the plan is solved, approved, uplinked and the product delivered.',
    setup: () => { usePlanStore.getState().init(true); },
  },
  {
    title: 'Engineering', who: 'Meera (database), Nisha and Vikram (reviewers), Leena (ML)',
    summary: 'A limit change goes from draft through two reviewers and a simulator check to every satellite.',
    setup: () => {
      const draft = useMdbStore.getState().releases.find((r) => r.line === 'akv-mdb' && r.state === 'DRAFT');
      if (draft) useMdbStore.getState().discard(draft.version, actor());
    },
  },
  {
    title: 'Governance', who: 'Farah (security) and Rohit (platform admin)',
    summary: 'New access needs two administrators, and the ledger proves everything above happened.',
  },
];

const RAW: Omit<DemoStep, 'n'>[] = [
  // ---- Chapter 1: operations ------------------------------------------------------------------
  { chapter: 0, title: 'Fleet at a glance', screen: 'S03', route: 'fleet', as: VIKRAM, action: 'Make heater A fail on AKV-03',
    say: `You are Vikram Shetty, Spacecraft Operator. This is the fleet of ${FACTS.demoFleet} satellites, all simulated in this browser. Next, the simulator makes heater A on AKV-03 fail, the way a real fault would arrive.`,
    run: async () => {
      useMissionStore.getState().injectHeaterFault();
      return (await until(() => useMissionStore.getState().advisories.some((a) => a.advisory_id === 'AN-401'), 25_000)) ? undefined : 'The anomaly model has not raised its advisory yet. Try again in a few seconds.';
    } },
  { chapter: 0, title: 'The AI notices first', screen: 'S20', route: 'anomalies', params: 'id=AN-401', as: VIKRAM, action: 'Wait for the alarm',
    say: 'Battery temperature is falling while heater A runs flat out. The anomaly model raises AN-401 before any limit is crossed, and shows which parameters drove it. A person decides what it means.',
    run: async () => ((await until(() => useAlarmStore.getState().active.some((a) => a.alarm_id === 'AL-801'), 25_000)) ? undefined : 'BAT_TEMP has not crossed its limit yet. Try again in a few seconds.') },
  { chapter: 0, title: 'The alarm follows', screen: 'S06', route: 'alarms', params: 'id=AL-801', as: VIKRAM, action: 'Acknowledge the alarm',
    say: 'BAT_TEMP crossed its 10 °C warning limit, so AL-801 is raised. Acknowledging takes ownership and is recorded under your name.',
    run: () => { useAlarmStore.getState().acknowledgeAlarm('AL-801', me().name); } },
  { chapter: 0, title: 'Look at the satellite', screen: 'S04', route: 'satellite', params: 'sat=AKV-03&tab=POWER', as: VIKRAM, action: 'Ask the copilot what to do',
    say: 'Every power value with its limits and age. BAT_TEMP keeps falling and heater A duty is at 97 %: the heater is stuck, not off.',
    run: () => {
      const q = 'What do I do when a battery heater fails?';
      const owner = `${me().id}:${useAuthStore.getState().activeRole}`;
      const c = useCopilotStore.getState();
      c.set(owner, [...(c.owner === owner ? c.messages : []), { role: 'user', text: q }, answer(q, { user: me(), role: useAuthStore.getState().activeRole })]);
    } },
  { chapter: 0, title: 'Ask the copilot', screen: 'S22', route: 'copilot', as: VIKRAM, action: 'Start procedure PR-THM-004',
    say: 'The copilot answers from the procedure library and past events, and cites each source. It points at PR-THM-004, battery heater recovery. It can explain, never command.',
    run: () => { useProcedureRunStore.getState().start('PR-THM-004', 'AKV-03', 'AUTO'); } },
  { chapter: 0, title: 'Run the recovery procedure', screen: 'S14', route: 'procedure', params: () => `proc=PR-THM-004&sat=AKV-03&run=${heaterRun()?.id ?? ''}`, as: VIKRAM, action: 'Wait for the approval request',
    say: 'The runner checks contact and BAT_TEMP on live values, switches heater A off and waits for the spacecraft to confirm. Step 5, heater B on, is critical: Vikram can request it but never approve it.',
    run: async () => ((await until(() => heaterRun()?.waitingFor === 'APPROVAL' || !!heldWhy(), 40_000)) ? heldWhy() : 'The procedure has not reached step 5 yet. Try again in a few seconds.') },
  { chapter: 0, title: 'A second person approves', screen: 'S13', route: 'approvals', params: () => `id=${heaterStep5()?.approvalId ?? ''}`, as: ANANYA, action: 'Approve with passkey',
    say: 'Now you are Ananya Rao, Flight Director: a different person. She sees who asked, why, the parameters and the interlocks at request time, and approves with a fresh passkey touch.',
    run: () => {
      const id = heaterStep5()?.approvalId;
      const a = useMissionStore.getState().approvals.find((x) => x.approval_id === id);
      if (!a) return 'There is no approval request from the procedure. Start chapter 1 again.';
      if (a.state === 'PENDING') useMissionStore.getState().decideApproval(a.approval_id, true, me().name);
      return undefined;
    } },
  { chapter: 0, title: 'Sent and acknowledged', screen: 'S15', route: 'uplink', params: 'sat=AKV-03', as: VIKRAM, action: 'Wait for PUS-1 completion',
    say: 'Back as Vikram. The approved HTR_SWITCH goes out on the uplink: COP-1 sends the frame, the CLCW confirms receipt, then the spacecraft reports accepted, started and completed (PUS-1).',
    run: async () => {
      const id = heaterStep5()?.commandId;
      const ok = await until(() => useMissionStore.getState().commands.find((c) => c.command_id === id)?.status === 'COMPLETED', 20_000);
      return ok ? undefined : 'The command has not completed yet. Try again in a few seconds.';
    } },
  { chapter: 0, title: 'The procedure finishes', screen: 'S14', route: 'procedure', params: () => `proc=PR-THM-004&sat=AKV-03&run=${heaterRun()?.id ?? ''}`, as: VIKRAM, action: 'Confirm the trend is rising',
    say: 'Heater B is on. The run sets its setpoint and waits for BAT_TEMP above 12 °C, then asks the operator to confirm the trend before closing out.',
    run: async () => {
      const ok = await until(() => heaterRun()?.waitingFor === 'OPERATOR' || heaterRun()?.state === 'COMPLETED' || !!heldWhy(), 45_000);
      if (!ok) return 'BAT_TEMP is still below 12 °C. Try again in a few seconds.';
      const r = heaterRun()!;
      if (r.waitingFor === 'OPERATOR') useProcedureRunStore.getState().confirm(r.id);
      return heldWhy();
    } },
  { chapter: 0, title: 'Temperature recovers', screen: 'S04', route: 'satellite', params: 'sat=AKV-03&tab=POWER', as: VIKRAM, action: 'Next: planning',
    say: 'BAT_TEMP is climbing on heater B and AL-801 returns to normal by itself. Everything that happened is in the audit ledger under the real names (chapter 4).',
    run: async () => { await until(() => !useAlarmStore.getState().active.some((a) => a.alarm_id === 'AL-801'), 20_000); } },

  // ---- Chapter 2: planning and customers ------------------------------------------------------
  { chapter: 1, title: 'A customer asks for imagery', screen: 'S24', route: 'customer', as: PRIYA, action: 'Request imagery of a farm block',
    say: 'You are Priya Nabhas of Nabhas Agritech, a customer. She sees only her own satellites, requests and products, and cannot command anything. She asks for a farm block that her satellites pass over in daylight today.',
    run: () => {
      const tenant = tenantOfPerson(me());
      const at = daylightTarget(tenant);
      if (!at) return `None of ${tenant}'s satellites has a daylight pass in this plan window.`;
      ctx.requestId = useRequestStore.getState().submit({ tenant, requestedBy: me().name, target: `Field trial block ${at.lat.toFixed(2)}, ${at.lon.toFixed(2)}`, lat: at.lat, lon: at.lon, priority: 'P1', windowH: 24, maxCloudPct: 40 });
      return undefined;
    } },
  { chapter: 1, title: 'The planner sees it', screen: 'S17', route: 'plan', params: 'view=open', as: KARAN, action: 'Solve the plan',
    say: 'You are Karan Malhotra, Mission Planner. Priya\'s request is in the open queue with the others. Solving places each request on a satellite pass and a downlink, within storage and battery.',
    run: () => {
      usePlanStore.getState().solve(me().name);
      const r = priyaRequest();
      return r && r.state !== 'PLACED' ? `${r.id} was not placed: ${r.reason ?? 'no reason given'}. The plan shows why.` : undefined;
    } },
  { chapter: 1, title: 'Resolve the conflict', screen: 'S17', route: 'plan', params: 'view=open', as: KARAN, action: 'Apply the suggested fix',
    say: 'The solver flags what does not fit, for example a downlink on a station that is in maintenance, and offers fixes. Karan picks one; the plan re-checks itself.',
    run: () => {
      const f = usePlanStore.getState().conflicts[0]?.fixes[0];
      if (f) usePlanStore.getState().applyFix(f, me().name);
    } },
  { chapter: 1, title: 'Send for approval', screen: 'S17', route: 'plan', params: 'view=open', as: KARAN, action: 'Send for approval',
    say: 'No conflicts left. A plan is uplinked only after a Flight Director other than the planner approves it.',
    run: () => {
      const p = usePlanStore.getState();
      if (p.conflicts.length) return 'The plan still has a conflict. Apply a fix first.';
      if (p.stage === 'SOLVED') p.sendForApproval(me().name);
      return undefined;
    } },
  { chapter: 1, title: 'The plan is approved', screen: 'S13', route: 'approvals', params: () => `id=${usePlanStore.getState().approvalId ?? ''}`, as: ANANYA, action: 'Approve with passkey',
    say: 'Ananya reviews the plan with its checks: peak storage, lowest battery and open conflicts, then approves it with her passkey.',
    run: () => {
      const id = usePlanStore.getState().approvalId;
      const a = useMissionStore.getState().approvals.find((x) => x.approval_id === id);
      if (!a) return 'The plan has not been sent for approval.';
      if (a.state === 'PENDING') useMissionStore.getState().decideApproval(a.approval_id, true, me().name);
      return undefined;
    } },
  { chapter: 1, title: 'Uplink the schedule', screen: 'S17', route: 'plan', params: 'view=all', as: KARAN, action: 'Uplink as PUS-11 schedule',
    say: 'Approved. Karan uplinks the plan as a PUS-11 time-tagged schedule: the satellites run it on board, and every downlink it needs is booked.',
    run: () => { if (usePlanStore.getState().stage !== 'UPLINKED') usePlanStore.getState().uplink(me().name); } },
  { chapter: 1, title: 'Station booking confirmed', screen: 'S09', route: 'schedule',
    params: () => {
      const pl = priyaRequest()?.placement;
      if (!pl) return '';
      const dl = usePlanStore.getState().activities.find((a) => a.kind === 'DL' && a.sat === pl.sat && a.start === pl.dlAt);
      return `sat=${pl.sat}${dl?.contactId ? `&pass=${encodeURIComponent(dl.contactId)}` : ''}`;
    }, as: KARAN, action: 'Follow the imagery',
    say: 'Every downlink the plan needs is booked: own stations confirm at once, partner providers answer within seconds. Selected is the pass that brings Priya\'s image down.',
    run: async () => { await until(() => !Object.values(useBookingStore.getState().state).includes('REQUESTED'), 6_000); } },
  { chapter: 1, title: 'Payload on the ground', screen: 'S18', route: 'payload', params: () => `id=${priyaRequest()?.deliveryId ?? ''}`, as: KARAN, action: 'Wait for Product ready',
    say: 'The image arrives in chunks, each checked, then merged into an L0 product. This takes under a minute here.',
    run: async () => {
      if (!priyaSession()) return 'Priya\'s request was not placed in this plan, so no payload session exists. Start chapter 2 again.';
      return (await until(() => stageOf(priyaSession()!) === 'L0_READY' || stageOf(priyaSession()!) === 'DELIVERED', 90_000)) ? undefined : 'The product is not ready yet. Try again in a few seconds.';
    } },
  { chapter: 1, title: 'Deliver to the customer', screen: 'S18', route: 'payload', params: () => `id=${priyaRequest()?.deliveryId ?? ''}`, as: KARAN, action: 'Deliver',
    say: 'Product ready: chunks verified and merged. Delivering publishes it to Priya\'s portal and calls her webhook.',
    run: () => {
      const s = priyaSession();
      if (!s) return 'No payload session for Priya\'s request.';
      if (s.deliveredAt) return undefined;
      const p = useDeliveryStore.getState().deliver(s.id, me().name);
      if (!p) return 'The product is not ready yet.';
      // as the Deliver button on S18 does: the request is delivered, and the ledger says so
      if (s.requestId) useRequestStore.getState().update(s.requestId, { state: 'DELIVERED', productId: p.id });
      useMissionStore.getState().appendAudit({
        timestamp_utc: new Date().toISOString(), operator_id: me().id, operator_name: me().name, sat_id: s.sat, command_mnemonic: 'PRODUCT_DELIVER',
        procedure_id: '—', procedure_version: '—', sequence_count: 0, result: 'ACK', params_summary: `${p.id} delivered to ${s.tenant}${s.requestId ? ` for ${s.requestId}` : ''}`,
      });
      return undefined;
    } },
  { chapter: 1, title: 'Priya gets her image', screen: 'S24', route: 'customer', as: PRIYA, action: 'Download the product',
    say: 'Back as Priya. Her request shows as delivered and the product is in her list, with its checksum. The download is a sample manifest; the bulk pipeline is not connected in this demo.',
    run: () => {
      const p = useDeliveryStore.getState().products.find((x) => x.requestId === ctx.requestId);
      const r = priyaRequest();
      if (!p) return 'No product for this request yet.';
      saveBlob(productManifest(p, r ? { name: r.target, lat: r.lat, lon: r.lon } : undefined), `${p.id}_manifest_SAMPLE.geojson`);
      return undefined;
    } },

  // ---- Chapter 3: engineering -----------------------------------------------------------------
  { chapter: 2, title: 'The mission database', screen: 'S19', route: 'mdb', as: MEERA, action: 'Draft a BAT_TEMP limit change',
    say: 'You are Meera Iyer, Mission Database Engineer. The database holds every parameter, its limits and calibrations. After the heater event she wants an earlier BAT_TEMP warning.',
    run: () => {
      const d = useMdbStore.getState().newDraft('akv-mdb', actor());
      if (!d.ok) return d.reason;
      ctx.mdb = d.version;
      const cur = mdbRelease()!.dict.params.find((p) => p.name === 'BAT_TEMP')!.limits.NOMINAL!;
      return why(useMdbStore.getState().editLimits(d.version!, 'BAT_TEMP', 'NOMINAL', { ...cur, l: 11 }, 'Earlier warning after the heater A event', actor()));
    } },
  { chapter: 2, title: 'Submit for review', screen: 'S19', route: 'mdb', params: () => `v=${encodeURIComponent(ctx.mdb ?? '')}`, as: MEERA, action: 'Submit for review',
    say: 'The draft shows exactly one change: the BAT_TEMP warning low from 10 to 11 °C, with her reason. She cannot review her own change.',
    run: () => why(useMdbStore.getState().submit(ctx.mdb ?? '', actor())) },
  { chapter: 2, title: 'First reviewer', screen: 'S19', route: 'mdb', params: () => `v=${encodeURIComponent(ctx.mdb ?? '')}`, as: NISHA, action: 'Approve as reviewer',
    say: 'You are Nisha Pillai, Flight Engineer. Two reviewers who are not the author must approve. She checks the change and approves.',
    run: () => why(useMdbStore.getState().approve(ctx.mdb ?? '', actor())) },
  { chapter: 2, title: 'Second reviewer', screen: 'S19', route: 'mdb', params: () => `v=${encodeURIComponent(ctx.mdb ?? '')}`, as: VIKRAM_FE, action: 'Approve as second reviewer',
    say: 'You are Vikram Shetty, this time as Flight Engineer. His approval is the second one.',
    run: () => why(useMdbStore.getState().approve(ctx.mdb ?? '', actor())) },
  { chapter: 2, title: 'Simulator check', screen: 'S19', route: 'mdb', params: () => `v=${encodeURIComponent(ctx.mdb ?? '')}`, as: MEERA, action: 'Run the simulator check',
    say: 'Back as Meera. Before anything flies, the release is checked: limits in order, no overlapping fields, and derived values computed on live telemetry.',
    run: async () => {
      const r = useMdbStore.getState().runCheck(ctx.mdb ?? '', actor());
      if (!r.ok) return r.reason;
      await until(() => useMdbStore.getState().checking[ctx.mdb ?? ''] === undefined, 6_000);
      return mdbRelease()?.state === 'VERIFIED' ? undefined : `The check failed: ${mdbRelease()?.check?.failures[0] ?? 'see the release'}`;
    } },
  { chapter: 2, title: 'Schedule per satellite', screen: 'S19', route: 'mdb', params: () => `v=${encodeURIComponent(ctx.mdb ?? '')}`, as: MEERA, action: 'Schedule on every AKV satellite',
    say: 'Checked. Scheduling moves each satellite to the new release at its own next contact, never mid-pass.',
    run: () => why(useMdbStore.getState().schedule(ctx.mdb ?? '', actor())) },
  { chapter: 2, title: 'Make it active', screen: 'S19', route: 'mdb', params: () => `v=${encodeURIComponent(ctx.mdb ?? '')}&tab=satellites`, as: MEERA, action: 'Activate',
    say: 'Each satellite with the time it takes the new release. Activating supersedes the old one; it stays signed, so a rollback is one step.',
    run: () => why(useMdbStore.getState().activate(ctx.mdb ?? '', actor())) },
  { chapter: 2, title: 'Label the anomaly', screen: 'S20', route: 'anomalies',
    params: () => `id=${openAdvisory()?.advisory_id ?? ''}`, as: LEENA, action: 'Confirm the advisory',
    say: 'You are Leena Joseph, ML Engineer. She reviews an open advisory (the heater one, if chapter 1 ran) against the data. Every confirm or dismiss becomes a training label for the next model, and is recorded.',
    run: () => {
      const a = openAdvisory();
      if (a) return why(useAdvisoryStore.getState().decide(a.advisory_id, 'CONFIRMED', a.advisory_id === 'AN-401' ? 'Matches the heater A failure' : 'Confirmed on engineering review of the trend', actor()));
      return undefined;
    } },

  // ---- Chapter 4: governance ------------------------------------------------------------------
  { chapter: 3, title: 'Who has access', screen: 'S25', route: 'users', as: FARAH, action: 'Issue an invite key',
    say: 'You are Farah Siddiqui, Security Officer. People join with a one-time invite key and a passkey. She invites a new Spacecraft Operator.',
    run: () => {
      const r = useUsersStore.getState().issueInvite({ name: 'Devika Menon', email: `devika.menon.${Date.now() % 100000}@akashaveda.com`, role: 'Spacecraft Operator', scope: ['AKV-*'], expiresH: 48 });
      return r.error;
    } },
  { chapter: 3, title: 'A second administrator', screen: 'S25', route: 'users', as: FARAH, action: 'Open the audit ledger',
    say: 'A commanding role is never granted by one person: the key waits for a second administrator, and Farah cannot approve her own request.' },
  { chapter: 3, title: 'The ledger', screen: 'S26', route: 'audit', as: FARAH, action: 'Verify the chain',
    say: 'Every action in this demo is here under the real person: the fault, the approvals, the plan, the release, the invite. Each record links to the one before it by hash.',
    run: async () => { await useLedgerStore.getState().verify(me().name); } },
  { chapter: 3, title: 'Chain verified', screen: 'S26', route: 'audit', as: FARAH, action: 'Hand over to Rohit',
    say: 'Verify walked every link and every content seal. A removed, reordered or edited record would be named here.' },
  { chapter: 3, title: 'Platform health', screen: 'S27', route: 'platform', as: ROHIT, action: 'Open Users and access',
    say: `You are Rohit Nair, Platform Administrator: the ground segment services and their health. With the backend running it flies ${FACTS.liveSatellites} satellites for real; here they are sample figures.` },
  { chapter: 3, title: 'Approve the grant', screen: 'S25', route: 'users', as: ROHIT, action: 'Approve Farah\'s request',
    say: 'Rohit is the second administrator. He did not raise the request and it is not his account, so he may approve it.',
    run: () => { const g = farahGrant(); if (!g) return 'No invite waiting. Issue one first.'; if (g.state === 'PENDING') return useUsersStore.getState().approveGrant(g.id) ?? undefined; return undefined; } },
  { chapter: 3, title: 'Done', screen: 'S25', route: 'users', as: ROHIT, action: 'Finish demo',
    say: 'The invite key is now open for the new operator. That is VYUH end to end: operations, planning, engineering and governance, each step by the person allowed to take it.',
    run: () => useDemoStore.getState().stop() },
];

export const DEMO_STEPS: DemoStep[] = RAW.map((s, i) => ({ ...s, n: i + 1 }));
/** Index of each chapter's first step. */
export const CHAPTER_START = DEMO_CHAPTERS.map((_, c) => DEMO_STEPS.findIndex((s) => s.chapter === c));

interface DemoStore {
  /** The guide panel is open (overview or a step). */
  running: boolean;
  /** Current step, or -1 for the overview. */
  index: number;
  busy: boolean;
  collapsed: boolean;
  /** Why the last action could not finish; cleared on the next move. */
  problem?: string;
  /** Opens the guide at the overview (signs in as Vikram first if nobody is signed in). */
  start: (nav: Nav) => void;
  stop: () => void;
  overview: () => void;
  setCollapsed: (c: boolean) => void;
  /** Jumps to a chapter's first step and sets up what that chapter needs. */
  startChapter: (c: number, nav: Nav) => void;
  /** Shows step i: signs in as its person and opens its screen. Runs nothing. */
  goto: (i: number, nav: Nav) => void;
  /** Runs the current step's action, then shows the next step. */
  next: (nav: Nav) => Promise<void>;
  prev: (nav: Nav) => void;
}

export const useDemoStore = create<DemoStore>((set, get) => ({
  running: false,
  index: -1,
  busy: false,
  collapsed: false,
  start: (nav) => {
    if (!useAuthStore.getState().isAuthenticated) { useAuthStore.getState().signInAs(VIKRAM.person, VIKRAM.role); nav('fleet'); }
    set({ running: true, index: -1, collapsed: false, problem: undefined });
  },
  stop: () => set({ running: false, busy: false, problem: undefined }),
  overview: () => set({ index: -1, problem: undefined }),
  setCollapsed: (collapsed) => set({ collapsed }),
  startChapter: (c, nav) => {
    set({ running: true, collapsed: false });
    get().goto(CHAPTER_START[c], nav);
    DEMO_CHAPTERS[c].setup?.();
  },
  goto: (i, nav) => {
    const index = Math.max(0, Math.min(i, DEMO_STEPS.length - 1));
    const s = DEMO_STEPS[index];
    const auth = useAuthStore.getState();
    if (auth.user.id !== s.as.person || auth.activeRole !== s.as.role || !auth.isAuthenticated) auth.signInAs(s.as.person, s.as.role);
    set({ index, problem: undefined });
    const q = typeof s.params === 'function' ? s.params() : s.params;
    nav(q ? `${s.route}?${q}` : s.route);
  },
  next: async (nav) => {
    const { index, busy } = get();
    if (busy || index < 0) return;
    set({ busy: true, problem: undefined });
    let problem: string | undefined;
    try { problem = (await DEMO_STEPS[index].run?.()) || undefined; } catch (e) { problem = e instanceof Error ? e.message : 'The action failed.'; }
    set({ busy: false });
    if (problem) { set({ problem }); return; }
    if (!get().running || index === DEMO_STEPS.length - 1) return;
    const to = DEMO_STEPS[index + 1];
    if (to.chapter !== DEMO_STEPS[index].chapter) get().startChapter(to.chapter, nav);
    else get().goto(index + 1, nav);
  },
  prev: (nav) => { if (get().index > 0) get().goto(get().index - 1, nav); },
}));
