# Demo data: one scenario

The console runs as a UI-only demo (backend off, built-in telemetry engine). Every sample fact now comes from
**one demo world**, `src/demo/scenario.ts`, anchored to `T0` (the moment the world was seeded). Every screen
reads it through the stores, so the same alarm, approval, request or person shows the same everywhere.

## Inventory before the change (what existed, where it showed, what was wrong)

| Source | What it seeded | Shown on | Problem |
|---|---|---|---|
| `src/demo/seed.ts` | approval AP-7710 + CMD-7710 (RW_DESAT, AKV-08) | Fleet "Needs you now", Approvals, Command console | Expired 16 min after load; the sweep marked it EXPIRED, so it left the Waiting tab while Fleet had shown it as "Waiting on you". Not persisted while the plan/requests were: after a reload it was re-seeded with a new time. Not in the audit ledger. |
| `data/fleet.ts` `SEEDED_WARNING` + `mockTelemetryEngine` `SEEDED` | 7 warning satellites (two copies of one list) | Fleet, Sidebar, Satellite pages | AKV-14's value (26.3 V) was not below its 26 V limit, so it flipped to nominal on the first tick; the engine pulled every held value back to nominal within a minute; **no alarm record existed** for any of them, so Fleet said "warning" while the alarm console and the satellite's alarm list were empty. |
| `data/fleet.ts` `ADVISORIES` | AN-393…398 | Anomalies, Alarm detail | AN-393 linked alarm AL-788 that never existed; AN-396 pointed at AKV-02 while the full-memory satellite was AKV-31; decided advisories had no decision record and no ledger entry. |
| `data/fleet.ts` `DEMO_APPROVAL`, `PROCEDURE_PR_THM_004`, `PARAM_CARDS`, `MDB_RELEASES`, `SIM_FLEET`, `DELIVERY_LOG`, `ONCALL`, `DELIVERIES`, `PASS_REPORTS`, `PASSES` | sample approval, procedure copy, MDB releases, pages, rota, deliveries, reports, passes | various | `PARAM_CARDS`, `PROCEDURE_PR_THM_004`, `MDB_RELEASES` (with reviewers Ananya Rao / Karan Malhotra, who may not review), `SIM_FLEET` fed nothing. Pages referenced alarms AL-799 / AL-796 that never existed. Pass reports referred to sessions that were not in `PASSES`; the pass report's delivery table read the static `DELIVERIES` while the payload screen read `useDeliveryStore`; a delivery came "via SGP" while SGP was in maintenance; ids carried a fixed date (20260917). |
| `mocks/mockData.ts` | an older fleet | nothing | Dead file. |
| `data/mission.ts` `SEED_AUDIT` | 8 ledger records | Audit ledger | None of them matched a command, approval or person action in any store; "Meera Iyer" (an engineer, who may not command) sent HTR_SWITCH; "Karan Malhotra" (a planner) sent IMG_CAPTURE; a grant gave Leena Joseph a role she already held. |
| `useMissionStore` | approvals, commands, audit, advisories | many | In memory: reset on reload while `useRequestStore`, `usePlanStore`, `useDeliveryStore`, `useBookingStore`, `useConjunctionStore`, `useOrbitStore` persisted in sessionStorage, so after a reload the plan's `approvalId`, request placements and sessions pointed at approvals and commands that no longer existed. Command ids restarted at CMD-101 after a reload and collided. |
| `useMdbStore` | releases | Mission database | Reviewer "Kavya Nair" is not a person in the console. Dates relative to each call. |
| `useUsersStore` / `useAuthStore PEOPLE` | people, sessions, grants, invite keys | Users & access, sign-in | Already one list (good); but in memory, so grants made before a reload vanished while their ledger records (also in memory) went too, and the invite key's approval had no grant record. |
| `useKeyStore`, `useOnCallStore`, `useNetworkStore`, `useServicesStore`, `useProcedureRunStore`, `useAdvisoryStore`, `usePlanNoteStore`, `useLedgerStore`, `usePassOpsStore`, `useDerivedAckStore` | key requests, rota/pages, network bookings, on-board services, runs, decisions, notes, seals, pass sign-offs, derived-alarm acks | their screens | All in memory (reset on reload) next to persisted stores. Network bookings (BK-30xx) were on stations the satellite is not assigned to and at times that were not passes, and disagreed with the contact schedule's booking state. Services seeded times relative to each render. Procedure run numbers restarted after a reload. |
| `ops/satOps.ts` | AKV-11 payload FAULT, AKV-07 uplink FAILED, a "processing backlog" alarm that came and went with the clock on satellites ending in 3 | Fleet table, Alarm console | Faults with no cause anywhere else; the backlog alarm flickered, so counts differed between two screens opened a minute apart. A rejected approval became a **critical** "Command rejected" alarm. |
| `ops/conjunctionStore.ts` / `orbit/debris.ts` / `orbit/cdm.ts` | debris catalogue, designed encounters, sample CDMs | Orbits, Fleet, Alarm console | Anchored to the load time, so a reload moved every encounter. |
| `screens/analytics/PredictiveHealth.tsx` | "AKV-08 is in safe mode" banner | Health forecast | Contradicted every other screen (AKV-08 is a wheel-friction warning, never in safe mode). |
| Fleet "Needs you now" | every pending approval labelled "Waiting on you" | Fleet | Shown to a Spacecraft Operator who cannot approve, and to the Flight Director who raised it. |
| Sidebar / top-bar alarm badge | unacknowledged **health** alarms only | every screen | Did not match the alarm console (all kinds) or the Fleet KPI. |
| `CustomerPortal`, `CommandPalette`, plan solver | satellite health from the static `FLEET` list | portal, palette | Never changed with the telemetry. |

## The scenario (what the demo world contains)

All in `src/demo/scenario.ts`; times are minutes relative to `T0`.

- **People**: exactly `PEOPLE` in `useAuthStore` (14). Users & access shows the same list, roles, scopes and statuses (Kiran Bose invited, the rest active).
- **Fleet and tenants**: the 50 satellites and 6 stations of `data/fleet.ts` (reference data). Akashaveda (AKV-01…46), Nabhas Agritech (NBH-01/02), Terra Analytics (TRA-01/02). SGP in maintenance, AWS adapter degraded.
- **Satellite conditions → alarms** (`CONDITIONS`): 8 satellites hold one warning value each, and each has exactly one open health alarm: AL-7101 AKV-08 RW1_SPEED (acked, Vikram), AL-7102 AKV-11 IMAGER_TEMP, AL-7103 AKV-14 BUS_VOLTAGE (acked, Ananya), AL-7104 AKV-22 TX_TEMP (acked), AL-7105 AKV-31 STORAGE_USED (shelved by Vikram), AL-7106 AKV-39 RAD_TEMP, AL-7107 NBH-02 BAT_SOC, AL-7108 TRA-01 SNR. Nothing opens critical (the guided demo puts AKV-03 there with AL-801).
- **Operational alarms**: AKV-11 payload fault (its imager is too warm, AL-7102), AKV-31 processing backlog (AL-7105), the failed AKV-07 DUMP_START, SGP down (acknowledged) and AWS degraded, plus conjunctions from screening (anchored to T0).
- **Advisories**: AN-398 (AKV-08 → AL-7101), AN-396 (AKV-31 → AL-7105), AN-395 (NBH-02 → AL-7107), AN-393 (AKV-22 → AL-7104, confirmed by Vikram), AN-397 (confirmed by Leena), AN-394 (dismissed by Leena, outside the 24 h undo window). Each decision is in `useAdvisoryStore` and the ledger.
- **Commands and approvals**: 11 commands. Waiting for a Flight Director: CMD-7701 / AP-7701 (RW_DESAT AKV-08, Vikram, expires T0+3 h) and CMD-7702 / AP-7702 (HTR_SWITCH AKV-39, Ananya as operator, expires T0+2.5 h). Decided today: AP-7693 rejected by Arjun, AP-7694 approved by Ananya, AP-7697 approved by Arjun. Also completed routine commands, one FAILED (AKV-07 DUMP_START, no PUS-1 before LOS) and one CANCELLED. Requester is never the approver.
- **Procedures**: the released procedures of `data/mission.ts`; one finished run, PR-PL-022 on AKV-03 (CMD-7695, CMD-7696).
- **Passes and reports**: AKV-03 over HYD now; 10 scheduled; 7 flown today. The 3 pass reports belong to flown passes and list the commands sent on them.
- **Requests → plan → sessions → products → portal**: TR-5511 (Nabhas) and TR-5536 (Terra) delivered with products PRD-…-010 / PRD-…-006 from sessions DL-…-010 / DL-…-006; TR-5537 (Nabhas) acquired, its session DL-…-013 merging; TR-5539 scheduled from the approved plan (placed by the plan on start); five new. Every payload session came down on a flown pass, same tenant end to end.
- **Governance**: grants GR-0106 (Kiran's invite, Farah → Rohit, approved) and GR-0107 (Arjun as operator, waiting); key requests KR-0040 (applied) and KR-0041 (waiting); on-call Vikram / Ananya / Arjun; 4 pages; MDB 4.20.0 in review (author Meera, reviewer Vikram as Flight Engineer), older releases reviewed by Vikram and Nisha Pillai; network bookings BK-3091/3094/3088 on real contacts, mirrored in the contact schedule's booking state.
- **Audit ledger**: `seedAudit()` writes one record per seeded action above (command raised, decided, released, failed, cancelled; run started/completed; alarm acks and shelve; advisory decisions; invite, grant, key requests; page ack; MDB steps; product deliveries; booking requests), same people, ids and times, hash-chained from genesis. Command records carry the command id.

## Persistence rule

Every store that holds scenario state persists to **sessionStorage** under `vyuh.demo.v1.<store>` (`src/demo/persist.ts`):
mission, alarms, derivedAcks, advisories, users, keys, oncall, mdb, procedureRuns, requests, plan, deliveries,
bookings, network, services, planNotes, conjunctions, orbits, ledger (seals), passOps.

The marker `vyuh.demo.v1` holds `T0`. When it is missing (new tab, or after a reset) every `vyuh.demo.*` key and the
pre-v1 keys are cleared before any store loads, so all stores seed together from one `T0` and every cross-reference
survives a reload. The signed-in session (`vyuh.session`) is kept. **Reset demo data** (user menu in the top bar)
clears the demo keys and reloads. Bump the version in `persist.ts` when the scenario changes shape.

## Counts that must match (and what they count)

- Pending approvals: sidebar badge = Approvals "Waiting" = Fleet "Needs you now" approval items; per requester = their "Your commands" rows awaiting approval. Waiting = pending and not past its expiry (`isWaiting`). The wording is "Waiting on you" only for a Flight Director who did not raise it, "Waiting for another Flight Director" for the one who did, "Waiting for a Flight Director" for everyone else.
- Alarms: Fleet "Open alarms, all kinds" = Alarm console "All"; Fleet "N unacknowledged" = Alarm console "Unacknowledged" = sidebar badge = top-bar bell.
- Satellite health is telemetry health: Fleet state = satellite page header = its health-alarm list (one alarm per off-nominal parameter).

Checks: `npm run check` (includes `src/checks/scenario.check.ts`, the scenario's referential integrity) and the browser
script `scratchpad/ui-shots/consistency.mjs` (fresh load, reload, reset).
