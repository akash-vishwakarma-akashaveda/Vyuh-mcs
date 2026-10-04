# Console UI audit and redesign plan

Audit date: 2026-10-04. Scope: every screen and shared component in `src/` (29 routed screens, the shell, SimLab).
Design canvas: https://claude.ai/artifact/MQcDRPi7JmcneVw6gwqTb7 (one page per layer below).

Verdict key used by the audit: **works**, **state-only** (changes local UI only), **no-op** (toast or nothing), **broken** (wrong target, throws), **role dead end** (sends the user to a screen their role cannot open).

## Cross-cutting rules for the rebuild

1. **Every role has a home screen.** After choosing a role you land on it, and "Back" from a refusal goes there, never to Fleet.
   | Role | Home |
   |---|---|
   | Spacecraft Operator, Flight Engineer | Fleet |
   | Flight Director | Approvals (with fleet summary) |
   | Mission Planner | Mission plan |
   | Ground Station Engineer | Passes |
   | Mission Database Engineer | Mission database |
   | ML Engineer | Anomaly advisories |
   | Security Officer | Users and access |
   | Platform / System Administrator | Platform |
   | Customer User | Customer portal |
2. **No link to a screen the role cannot open.** One helper (`linkFor(route, role)`) returns either the link or "Handled by: <role>" text. Applies to every cross-link, toast action, palette result and shortcut.
3. **Real sign-in gate.** The router checks `isAuthenticated`; sign out calls `logout()`; public pages never deep-link into the console.
4. **Tenant isolation in every shared component.** Customers see only their tenant's satellites, alarms, search results and Copilot sources.
5. **One identity source.** Actions record the signed-in person (no hardcoded "Vikram Shetty" / `USR-001`).
6. **Sample data is labelled.** Anything not from the backend shows a `SAMPLE DATA` tag. No invented "verified", "PASSED" or "streaming to Splunk" claims.
7. **One dialog component** (Escape, focus trap, focus restore); dangerous actions confirm with a reason.
8. **Design tokens, no hex in screens.** Foundations board defines them.
9. **Every gated control explains itself** in visible text, not only a tooltip.
10. **State lives in stores or the URL**, not component state that is lost on navigation (procedure runs, tab, view, filters).

## Layer 1 · Access and shell

| # | Defect | Fix |
|---|---|---|
| A1 | Six roles land on NotAuthorized right after sign-in (RoleSelection sends all to fleet) | Role homes (rule 1) |
| A2 | No auth gate; sign out only navigates | Rule 3 |
| A3 | Customer sees fleet-wide alarm count, health strip, satellite search, Copilot internals | Rule 4 |
| A4 | Guided demo ends on NotAuthorized (steps 13–14); Prev/Next desync state | Demo steps switch persona via sign-in; Next runs the step |
| A5 | Passkey always fails first, SSO signs in as previous user, break-glass dead end | New sign-in: pick person, passkey succeeds, break-glass = request flow |
| A6 | Bare keys `c` / `t` jump screens | Remove; keep Ctrl K |
| A7 | Spec overlay and Copilot overlap; launcher covers content; invalid shadow class | One right-side drawer slot; launcher only in top bar |
| A8 | Contact form submits nothing; Architecture "Start guided demo" lies; Architecture page unlinked | Honest copy, real demo start, link from landing |
| A9 | Copy contradicts itself (31 modules / 29 screens / 12 engines; 12 vs 50 satellites; hardcoded "measured 25 ms") | One fact sheet in `src/data` |
| A10 | Demo personas: no second Flight Director, no dedicated Ground Station Engineer | Add Arjun Desai (FD), Sanjay Kulkarni (GSE) |

## Layer 2 · Operate (fleet, satellite, alarms, passes)

| # | Defect | Fix |
|---|---|---|
| O1 | Flight Director can open Fleet but every row/globe/heatmap link goes to Satellite (FD cannot open) | Give FD read access to Satellite, or rule 2 |
| O2 | AlarmPanel Ack: ungated, wrong actor sent to backend, shown on acked/shelved alarms and in playback | Gate, pass actor, hide when not applicable |
| O3 | AlarmPanel on a satellite page lists the whole fleet and opens params on the wrong satellite | Filter to this satellite |
| O4 | Missing telemetry shows green "0 NOMINAL" | `○ NO DATA` / `◆ STALE` states |
| O5 | Fake: heatmap ("NOM" everywhere), identical sparklines on every card, synthetic parameter history | Heatmap from CVT; sparkline from recent CVT samples; history labelled SAMPLE until the archive API exists |
| O6 | Shelve/escalate local only; ack failures swallowed | Backend calls with error UI |
| O7 | Add satellite ungated, fake verification, identical orbits, missing from selects | Gate (Platform Admin / FD), unique elements, fleet store as source |
| O8 | Cesium sim speed desyncs positions from real time with no indicator; Lock/auto-rotate no-op in 2D | Sim clock readout + "Back to now"; disable controls that do not apply |
| O9 | Satellite tabs not in URL; unknown satellite renders blank/zeros | `mode`/`tab` in hash; not-found state |
| O10 | Live pass: elevation dot off the arc and frozen; latency bars hardcoded; 5 actions toast-only | Real arc from look angles, ticking; actions wired or removed |
| O11 | Formatting: raw floats, wrong rollup labels, NaN stats, hardcoded "RETURNED" | Shared number formatter, correct labels |
| O12 | Dead files: PassPlayback, Globe3D, UPlotChart component, ParameterRow, MetricValue, CLCWRegister (orphan) | Delete |

3D/2D visualisations kept: **CesiumGlobe** (3D globe and 2D map, layers, conjunctions, inspector), **LiveConstellation** (landing), **uPlot MultiPlot** (history, limit bands, shared cursor), **OrbitalMap** (Leaflet fallback), Gantt/timeline SVGs. Restyled to the Foundations globe and chart spec.

## Layer 3 · Command

| # | Defect | Fix |
|---|---|---|
| C1 | Procedure story command strands in RELEASED after approval; run state lost on navigation | Run state in store; completion in the release pipeline, not a mounted effect |
| C2 | Approval requester hardcoded → a Flight Director can approve her own request | Requester = signed-in person |
| C3 | "Switch to Flight Director" one-click impersonation | Remove |
| C4 | Runner: non-critical command steps send nothing, checks evaluate nothing, modes do nothing; Pause has no Resume; Abort unconfirmed | Real step engine, Resume, confirm Abort |
| C5 | Role dead ends: console → approvals/uplink, runner → approvals, pass report → payload | Rule 2; requester sees approval status inline |
| C6 | Editor back button → fleet; release unreachable (reviewer cannot open editor) | Fix route; review happens in Approvals inbox |
| C7 | Uplink screen ignores `?sat=`, fixed FOP values, no cancel | Per-satellite, live FOP from backend `/v1/uplink`, cancel unradiated |
| C8 | Approvals never expire; timer labelled LOS | Expiry + separate LOS |
| C9 | Three dialog implementations | Rule 7 |
| C10 | Debug "simulate stale interlock" toggle shown to operators | Move to Simulator |

## Layer 4 · Plan

| # | Defect | Fix |
|---|---|---|
| P1 | Queued requests show "Scheduled on AKV-10" without a solve; approve claims uplink to 11 satellites | Request states driven by the solver result |
| P2 | Conflict banner and solver score shown on unsolved draft | Show only after solve |
| P3 | Customer tasking never reaches the planner queue | One shared request store |
| P4 | Contact schedule "Open satellite" dead end for both its roles; `?station=` ignored | Rule 2; station filter from URL |
| P5 | Payload `?id=` ignored; "Get download link" toast only | Open drawer from URL; real signed link or labelled sample |

## Layer 5 · Engineer

| # | Defect | Fix |
|---|---|---|
| E1 | MDB verify/schedule/activate/rollback not role-gated; reviewer approval checks name not role | Gate with `mdb:release` / reviewer role |
| E2 | MDB draft has no "Submit for review" | Add |
| E3 | Rollback list offers already-withdrawn bundles | Filter |
| E4 | Anomaly confirm/dismiss: no gate, audit, reason or undo | Add all four |
| E5 | "Inject heater fault" on the anomaly screen, ungated, reaches the real simulator | Move to Simulator, gate `sim:run`, add Clear fault |
| E6 | Simulator: always PASSED; fault buttons only log | Call the real simulator API (as SimLab does) |
| E7 | SimLab: no auth, no confirmation for "every spacecraft" link faults / TC drop / reset; error banner never clears | Gate behind sign-in + confirmations |
| E8 | Forecast: "Add note to mission plan" creates nothing, dead end for FE | Create plan note in shared store |

## Layer 6 · Govern

| # | Defect | Fix |
|---|---|---|
| G1 | Verify chain always VERIFIED; anchor/Splunk/"S3 object lock" invented | Real hash walk; remove invented tiles |
| G2 | Export CSV unescaped, drops params, ungated; date filter only affects export | Proper CSV, gate, filter the table |
| G3 | Users: second-admin check by name only; can approve a change to own account; suspend self; revoked sessions return | Fix rules, confirm destructive actions |
| G4 | "Verify signature", "Zone failover drill" fake | Remove or label as drill |
| G5 | On-call has no actions | Acknowledge page, take over, test page |

## Layer 7 · Customer and public

| # | Defect | Fix |
|---|---|---|
| U1 | Customer portal requests lost on navigation, never reach planner | P3 |
| U2 | System Administrator view claims "can only read Akashaveda data" | Tenant picker for admins |
| U3 | Delivery links dead (`payload?id=`) | P5 |

## Order of work

1. Foundations (tokens, components, dialog, number formatter, `linkFor`).
2. Access layer (sign-in, roles, homes, auth gate, personas).
3. Operate → Command → Plan → Engineer → Govern → Customer, each: design board, build, then click-through test of every control against this list.
