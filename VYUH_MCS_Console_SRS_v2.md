#### **AKASHAVEDA SPACE TECHNOLOGIES** 



<!-- Start of picture text -->
.) VYUH<br><!-- End of picture text -->

# **VYUH-MCS Console** 

Software Requirements Specification — screens, brand identity, user flows, Figma specifications and demo script 

|**Document ID**|VYUH-MCS-SRS-UI-002|
|---|---|
|**Version**|2.0 — aligned to System Architecture v2.2; supersedes VYUH_MCS_UI_SRS.md (26 screens)|
|**Date**|17 September 2026|
|**Status**|Draft for design review|
|**Prototype**|VYUH-MCS Console demo (hosted artifact) · vyuh-mcs-demo.html · React source vyuh-mcs-demo-<br>src.zip|
|**Related**|VYUH-MCS System Architecture v2.2 · VYUH-MCS Module Deck · VYUH Brand Identity v1 (Signal<br>Cartography) · Design System v2|
|**Classification**|Confidential|



VYUH-MCS Console · Software Requirements Specification v2.0 

## **Contents** 

|**§**|**Chapter**|**What it covers**|
|---|---|---|
|**1**|Introduction|Purpose, scope, audiences, how to run the prototype|
|**2**|Users, roles and operating context|Who uses each screen and in what conditions|
|**3**|Brand identity|Logo, colour, typography, iconography, voice, accessibility, motion|
|**4**|Information architecture|App shell, navigation, modes, screen inventory|
|**5**|User flows|Screen map and four critical journeys|
|**6**|Screen specifications|29 screens: purpose, regions, states, rules, data, constraints, acceptance|
|**7**|Figma-ready specifications|File structure, variables, text styles, components, frames, handoff|
|**8**|Non-functional requirements (UI)|Performance, security, accessibility, reliability, compatibility|
|**9**|Demo script and walkthrough|15-step guided story, setup, talking points, recovery tips|
|**10**|Traceability|Screens × constraints, modules × screens|
|**A**|Appendix — prototype technical notes|Source layout, build, simulated data, differences from product|



Akashaveda Space Technologies · Confidential · Page 2 

VYUH-MCS Console · Software Requirements Specification v2.0 

## **1. Introduction** 

### **1.1 Purpose** 

This document specifies the operator and customer console of VYUH-MCS, the mission control system for the Akashaveda satellite constellation. It defines every screen, the brand identity the console must follow, how users move between screens, the exact design tokens and components for Figma, and a scripted demo. It is written against **System Architecture v2.2** , so every screen names the back-end modules it depends on and the quality targets (Q), hard constraints (C) and principles (P) it must satisfy. 

A working prototype accompanies this document. Every screenshot in Chapter 6 is taken from that prototype, and the prototype's screen inventory file (src/data/screens.js) is the single source for the regions, states and rules listed here, so the document and the prototype cannot drift apart. 

### **1.2 Scope** 

|**In scope**|**Details**|
|---|---|
|**Screens**|29 screens in 8 flows: public & access, fleet & telemetry, passes & ground, commanding, planning &<br>mission data, intelligence, simulation & customers, governance & platform.|
|**Brand**|Application of the existing VYUH Brand Identity v1 to the console, with two documented refinements<br>(text-safe teal, advisory and simulation colours).|
|**Flows**|Screen map and four critical journeys with constraints marked.|
|**Design handoff**|Figma file structure, variable collections, text and effect styles, component specifications, frame and<br>grid rules.|
|**Demo**|A 15-step guided demo built into the prototype and a presenter script.|
|**Out of scope**|Back-end implementation (see Architecture v2.2), marketing website beyond the landing screen,<br>mobile operator app, light theme for operations.|



### **1.3 What changed from the previous UI SRS** 

|**Change**|**Reason**|
|---|---|
|Passwords + OTP replaced by passkeys, SSO<br>and step-up confirmation (S01, S13)|Q-14: one stolen credential cannot command a spacecraft.|
|Command dashboard split into Command<br>console, Approvals, Procedure runner and<br>Uplink & COP-1 (S12–S15)|Matches Command Service, Procedure Engine, TC Encoder and Forward Link Engine; makes<br>the two-person rule and single-writer guarantee visible.|
|New Live pass, Contact schedule, Ground<br>stations and Pass report (S08–S11)|Pass Orchestrator, GS Resource Manager and pass-aware operations in v2.2.|
|New Alarm console with ISA-18.2 lifecycle<br>(S06)|Events & Alarms module; shelving and escalation rules.|
|New Ops Copilot, Simulator, Customer<br>portal, Mission database releases, On-call<br>(S19, S22–S24, S28)|New v2.2 modules and customer tenancy (C-06).|
|Audit log becomes a verifiable hash-chained<br>ledger (S26); System health covers all 31<br>modules and SLOs (S27)|C-07 and Q-08/Q-10/Q-11/Q-15.|
|Every screen carries a specification overlay<br>(<br>) in the prototype<br>ⓘ|Design reviews can check modules and constraints in place.|



### **1.4 How to run the prototype** 

|**Option**|**How**|
|---|---|
|**Hosted link**|Open the VYUH-MCS Console artifact on claude.ai and share it from its share menu. Nothing to install.|



Akashaveda Space Technologies · Confidential · Page 3 

VYUH-MCS Console · Software Requirements Specification v2.0 

|**Option**|**How**|
|---|---|
|**Single file**|Openvyuh-mcs-demo.htmlin Chrome, Edge or Firefox. Works offline; fonts fall back to system fonts<br>without internet.|
|**React source**|Unzipvyuh-mcs-demo-src.zip, thennpm installandnpm run dev(Vite), ornode build.mjsto<br>produce the single file.|
|**Start the story**|On the landing page press**Start guided demo**, or press the compass button in the top bar on any<br>screen.|
|**Inspect a screen**|Press the<br>button in the top bar to show the screen ID, purpose, modules, constraints and data<br>ⓘ<br>sources.|
|**Switch role**|Open the user menu (top right) and choose a role, e.g. Flight Director for approvals or Customer User<br>for the portal.|



### **1.5 Conventions** 

- Screen IDs are S00–S28. Functional requirements are FR-Sxx-nn, business rules BR-Sxx-nn, non-functional requirements NFR-nn. 

- "Shall" is mandatory for the product; "should" is recommended. The prototype demonstrates each requirement with simulated data unless noted. 

- Constraint IDs follow Architecture v2.2 (Q = quality target, C = hard constraint, P = principle). Section 10 maps them to screens. 

- All times are UTC. All satellites, people and figures in screenshots are example data. 

Akashaveda Space Technologies · Confidential · Page 4 

VYUH-MCS Console · Software Requirements Specification v2.0 

## **2. Users, roles and operating context** 

### **2.1 Roles** 

|**Role**|**Responsibilities**|**Primary screens**|
|---|---|---|
|**Flight Director**|Owns the shift and safety decisions. Approves critical commands, runs<br>recovery procedures, escalation point.|S03, S06, S12–S14, S26–S28|
|**Spacecraft Operator**|Monitors the fleet, acknowledges alarms, sends routine commands,<br>runs procedures, requests critical commands.|S03–S08, S12, S14, S15, S20, S22|
|**Flight Engineer**|Analyses telemetry and trends, authors procedures, reviews AI<br>advisories and forecasts.|S04, S05, S07, S16, S20, S21, S23|
|**Mission Planner**|Builds and approves plans, books ground station passes, manages<br>payload deliveries.|S09, S10, S17, S18, S21|
|**Ground Station Engineer**|Watches the ground link, provider performance and pass reports.|S08–S11, S15|
|**Mission Database Engineer**|Changes, reviews, verifies and releases telemetry and command<br>dictionaries.|S19, S16, S23|
|**ML Engineer**|Monitors model quality, reviews feedback and promotes models.|S20, S21|
|**Security Officer**|Manages access, verifies the audit ledger, handles break-glass events.|S25, S26|
|**Platform Administrator**|Watches service health, SLOs, deploy freezes and on-call.|S27, S28|
|**Customer User**|Sees only their tenant's satellites, passes and deliveries; submits<br>tasking requests. No commanding by default.|S24, S18, S22|



### **2.2 Operating context** 

- Operators work 8–12 hour shifts in dim control rooms, often overnight during passes. The console is **dark-native** and desktop-first: primary frame 1440 × 900, wide monitors 1920 × 1080 and above. 

- A pass lasts 8–12 minutes. Anything that needs attention during a pass must be visible within one glance and one click. 

- Several people share responsibility: requester and approver are different people, and every action must be attributable (C-07). 

- Screens are shared on large displays and in customer demos, so every page must also read correctly when projected and at narrow widths (the prototype collapses to a single column on phones). 

### **2.3 Design principles for the console** 

|**Principle**|**What it means on screen**|
|---|---|
|**Signal over decoration**|Every element earns its place. Colour carries state, never decoration. Teal is the single action accent;<br>amber appears only where attention is needed.|
|**Truthful data**|No animation on data values; stale values are dimmed and labelled with their last update; live,<br>playback and simulation can never be confused.|
|**Safety by structure (P-01)**|Unsafe actions are impossible, not merely discouraged: gates block, interlocks fail closed, the copilot<br>has no command permission.|
|**Summary before detail**|KPIs and status first, then lists, then drill-down drawers and history.|
|**One screen, one job**|Each screen has a single purpose stated in its specification overlay.|
|**Evidence everywhere**|Advisories show evidence, approvals show interlock snapshots, audit shows the chain.|



Akashaveda Space Technologies · Confidential · Page 5 

VYUH-MCS Console · Software Requirements Specification v2.0 

## **3. Brand identity** 

The console applies the existing **VYUH Brand Identity v1 — Signal Cartography** : precision-first, dark-native and cognitively calm. This chapter restates the parts the console uses and records two refinements made while building the prototype. 

### **3.1 Logo** 



<!-- Start of picture text -->
Logo and variants<br>.) VYUH<br>. MCS 2<br><!-- End of picture text -->

_Figure 1. VYUH logo and variants as implemented in the console_ 

|**Rule**<br>~~a ~~|**Specification**<br> ~~ee~~|
|---|---|
|**Construction**|Orbit ring Ø26 on a 64 grid, stroke 2.6, teal #0F6E56. Five nodes at −90°, −18°, 54°, 126°, 198°: node 1<br>teal-hover #1A8A6E r 3.6, node 4 cold blue #4A9EFF, others mid #3A4A60 r 2.6. Signal lines 1 px teal at<br>45 % opacity. Core: navy r 9 → teal r 6 → near-white r 2.6.|
|**Wordmark**|"VYUH" Inter 700, letter-spacing 0.04 em; "MCS" JetBrains Mono 700, teal-text, letter-spacing 0.18 em,<br>below.|
|**Variants**|Primary (on canvas) · On light (navy wordmark) · Icon only · Monochrome (single white or navy).|
|**Minimum size**|Icon 24 px; full mark 120 px wide. Sidebar uses 30 px icon + wordmark; collapsed rail uses icon only.|
|**Clear space**|1 × icon height on all sides. Never stretch, rotate, recolour or place on photographs.|



Akashaveda Space Technologies · Confidential · Page 6 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **3.2 Colour** 



<!-- Start of picture text -->
Colour tokens<br>NEUTRAL SCALE — DARK-NATIVE SURFACES<br>wos0ci4 woo1828 #131620 eases wanaa9 ananso<br>canvas Surface Elevated overlay Border mi<br>= Ln |<br>veeccoerd ‘Text secondary Text primary<br>BRAND AND ACTION<br>won1e48 #AASATC inners ‘WANBAGE (#085443 =<br>Brand navy Brand blue TaD) ‘Teal hover Teal pressed ieee<br>SEMANTIC STATUS — NEVER DECORATIVE<br>aa Ksamacsed =a | La<br>Nominal Warning Critical Critical text ‘AOS / info Pending ack<br>Al advisory Simulation<br><!-- End of picture text -->

_Figure 2. Colour tokens_ 

|**Token**|**Hex**|**Swatch**|**Use**|
|---|---|---|---|
|--bg-canvas|#090C14||App background|
|--bg-surface|#0D1828||Cards, sidebar, tables|
|--bg-elevated|#131E30||Hover rows, sub-panels|
|--bg-overlay|#1E2535||Modals, drawers, toasts, menus|
|--border|#2A3349||Card and input borders|
|--border-soft|#1C2436||Row dividers|
|--mid|#3A4A60||Secondary icons, LOS state|
|--text|#F0F4FF||Primary text|
|--text-2|#99A3BC||Secondary text, labels|
|--text-dis|#505A70||Disabled and placeholder only|
|--navy|#0D1B4B||Brand backdrops|
|--blue|#1A3A7C||Secondary button border, avatar, user message|
|--teal|#0F6E56||Primary action fill, active states|
|--teal-hover|#1A8A6E||Hover|
|--teal-active|#0B5443||Pressed|



Akashaveda Space Technologies · Confidential · Page 7 

VYUH-MCS Console · Software Requirements Specification v2.0 

|**Token**|**Hex**|**Swatch**|**Use**|
|---|---|---|---|
|--teal-text|#3CB992||Links, active nav marker, mnemonics (refinement)|
|--ok|#4CAF81||NOMINAL|
|--warn|#E8943A||WARNING, attention, playback|
|--crit|#C62828||CRITICAL fills, danger buttons|
|--crit-text|#FF6B6B||Critical text on dark (refinement)|
|--info|#4A9EFF||AOS, info, focus ring|
|--pending|#9C9AEC||Pending acknowledgement / approval|
|--advisory|#C77DDB||AI advisory (new)|
|--sim|#8B7CF6||Simulation mode (new)|



##### **COLOUR RULES** 

- Teal is the only accent. It marks what can be acted on. Amber marks exactly where human attention is required and is never decorative. 

- Status is always encoded twice: colour **and** a text badge or shape (sev bar, icon). Colour alone never carries meaning. 

- Playback uses an amber banner and frame; simulation uses a violet banner. Both are permanent while the mode is active. 

- AI output uses the advisory violet so it is never mistaken for a limit alarm. 

##### **ACCESSIBILITY — MEASURED CONTRAST** 

|**Combination**|**Ratio**|**WCAG 2.2 result**|
|---|---|---|
|Text primary on canvas|17.77 : 1|AAA text|
|Text secondary on canvas|7.74 : 1|AAA text|
|Text secondary on surface|7.06 : 1|AAA text|
|Brand teal #0F6E56 as text on canvas|3.15 : 1|AA large text / UI only|
|Teal-text #3CB992 on canvas|7.96 : 1|AAA text|
|White on teal button|6.20 : 1|AA text|
|Amber on canvas|8.12 : 1|AAA text|
|Critical red #C62828 as text on canvas|3.48 : 1|AA large text / UI only|
|Critical text #FF6B6B on canvas|7.04 : 1|AAA text|
|Info blue on canvas|7.10 : 1|AAA text|
|Disabled #505A70 on canvas|2.83 : 1|Fails — decorative/disabled only|



**Refinements.** The brand teal #0F6E56 and critical red #C62828 do not reach 4.5 : 1 as text on the canvas, so the console uses them for fills only and adds --teal-text #3CB992 and --crit-text #FF6B6B for text. The brand brief's contrast figures for teal should be updated accordingly. 

Akashaveda Space Technologies · Confidential · Page 8 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **3.3 Typography** 



<!-- Start of picture text -->
Typography<br>Mission status<br>Fleet overview<br>Subsystem health<br>Calibrated parameters are pushed to the console within 100 ms of receipt.<br>18.52 °C - 15:32:07 UTC<br><!-- End of picture text -->

_Figure 3. Type scale in use_ 

|**Style**|**Family**|**Size / line**|**Weight**|**Use**|
|---|---|---|---|---|
|Display|Inter|32 / 1.1|700|Landing hero, big figures|
|H1 page title|Inter|24 / 1.15|700|Page heading|
|H2 card title|Inter|14–16 / 1.2|700|Card and drawer titles|
|H3|Inter|13|700 · info blue|Sub-headings in panels|
|Body|Inter|14 / 1.5|400|Content|
|Body small|Inter|12 / 1.5|400|Secondary lines|
|Label|Inter|11 caps, +0.06<br>em|700|Field labels, table headers|
|Mono|JetBrains Mono|12.5 / 1.5|400–700|Mnemonics, IDs, topics, hashes, hex|
|Numeric|Space Grotesk|24–26|700 tabular|Telemetry values, KPIs, clock|
|Badge|JetBrains Mono|10.5 caps|700|Status badges|



- Only weights 400 and 700 are used in the product UI. Headings are left-aligned. Numbers use tabular figures so columns align. 

- Anything that comes from a database, dictionary or protocol (parameter names, commands, topic names, hashes) is always monospace. 

### **3.4 Spacing, radius, elevation** 

|**Spacing (4 px base)**|**Radius**|**Elevation**|
|---|---|---|
|sp-1 4 · sp-2 8 · sp-3 12|r-2 inputs|E0 canvas — no shadow|
|sp-4 16 (standard padding)|r-4 buttons, nav items|E1 card — 1 px border, no shadow|
|sp-5 24 (page gutter)|r-6 cards, KPI, toasts|E2 menu — 0 16 40 rgba(0,0,0,.5)|
|sp-6 32 · sp-7 48 · sp-8 64|r-8 guide panel · r-12 modals · full badges|E3 modal/drawer — 0 24 60 rgba(0,0,0,.5)|



### **3.5 Iconography** 

Phosphor icons, **Bold** weight, 18 px in navigation, 16 px in buttons, 20 px in dialogs. A custom satellite glyph and the constellation mark cover subjects Phosphor does not. Icons never appear without a text label except in the top bar, where each has a tooltip and accessible name. 

Akashaveda Space Technologies · Confidential · Page 9 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **3.6 Voice and microcopy** 

|**Write**|**Avoid**|
|---|---|
|Command completed · AKV-03|Your command may have been received|
|BAT_TEMP below 10.0 °C|Warning: temperature issue detected|
|Blocked. Interlock BAT_TEMP 12.6 °C — must be < 10.0 °C|Something went wrong|
|Approve with passkey|OK|
|Shelve for 30 min — reason required|Snooze|
|Chain verified · anchor #4412 matches|Everything looks good!|



- Precise, declarative, calm. No exclamation marks. Numbers with units. Controls say exactly what happens; the toast confirms it in the past tense. 

### **3.7 Motion** 

- No easing or transitions on data values, charts or gauges — a value is shown the moment it arrives. 

- Critical alarm indicators pulse at 1 Hz with a stepped (on/off) animation; nothing else pulses. 

- UI motion (drawer slide on mobile) is under 200 ms and disabled when the user prefers reduced motion. 

Akashaveda Space Technologies · Confidential · Page 10 

VYUH-MCS Console · Software Requirements Specification v2.0 

## **4. Information architecture** 

### **4.1 App shell** 



<!-- Start of picture text -->
=) (15:54:04 vn ; @ Vikram shetty<br>[ @ Fleet overview Fleet overview Allplanes Plane A Plane B Customer<br>a 2 1 2 t) 1<br>; - Constellation nominal © waming. © rial satellites<br>2 © mv-01 ><br>x<br>© av-05<br>= mv-06 ><br>a<br>e Subsystem health — =<br>- ° axv-o1<br>ns v0 7 [eel<br><!-- End of picture text -->

_Figure 4. App shell on Fleet overview: sidebar, top bar and content area_ 

|**Element**|**Specification**|
|---|---|
|**Sidebar**|232 px (collapsible to 60 px icon rail). Logo at top in a 52 px bar. Groups with 10 px caps labels; items 13<br>px with 18 px icon. Active item: teal tint background + 2 px teal-text inset marker. Counters: red for<br>unacknowledged alarms and approvals, amber for new AI advisories. On screens < 900 px the sidebar<br>becomes an off-canvas drawer opened by a menu button.|
|**Top bar**|52 px. Left: collapse/menu button, UTC clock (Space Grotesk 15/700, updates each second), mode chip<br>(LIVE with green dot · PLAYBACK amber · SIMULATION violet), tenant chip. Right: unacknowledged alarm<br>chip (pulses if critical), specification<br>toggle, guided demo toggle, Ops Copilot toggle, user avatar with<br>ⓘ<br>name, role and role-switch menu.|
|**Mode banner**|Full-width banner above the shell in PLAYBACK (amber: "Playback mode — not live data · commanding<br>disabled") and SIMULATION (violet). Cannot be dismissed.|
|**Content**|Max width 1680 px, padding 20/24 px (16 px on phones). Page head: breadcrumb (flow name + screen ID),<br>H1, right-aligned actions. Grids: split (main + 340 px side), split-left, three-column, 2/3/4 columns — all<br>collapse to one column on narrow screens.|
|**Overlays**|Drawer 460 px from the right (details), modal ≤ 520 px (confirmations), toasts bottom-right (max 4, 6 s,<br>click to open related screen), Copilot side panel 420 px, guided demo panel bottom-left.|



Akashaveda Space Technologies · Confidential · Page 11 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **4.2 Navigation groups** 

|**Group**|**Items (screen IDs)**|
|---|---|
|**Public & access**|Product landing (S00) · Sign in (S01) · Mission & role scope (S02)|
|**Fleet & telemetry**|Fleet overview (S03) · Satellite health (S04) · Parameter history (S05) · Alarm console (S06) · Pass<br>playback (S07)|
|**Passes & ground**|Live pass monitor (S08) · Contact schedule (S09) · Ground stations (S10) · Pass report (S11)|
|**Commanding**|Command console (S12) · Approvals (S13) · Procedure runner (S14) · Uplink & COP-1 (S15) · Procedure<br>editor (S16)|
|**Planning & mission data**|Mission plan (S17) · Payload deliveries (S18) · Mission database (S19)|
|**Intelligence**|Anomaly advisories (S20) · Health forecast (S21) · Ops Copilot (S22)|
|**Simulation & customers**|Simulator (S23) · Customer portal (S24)|
|**Governance & platform**|Users & access (S25) · Audit ledger (S26) · Platform health (S27) · Notifications & on-call (S28)|



Customer users see a reduced navigation: Customer portal, Deliveries and Ask Copilot. 

### **4.3 Routes and deep links** 

Every screen has a shareable URL of the form #/route?key=value, for example #/satellite?sat=AKV-03&tab=Power, #/parameter?sat=AKV-03&param=BAT_TEMP, #/alarms?id=AL-801. Opening a deep link without a session starts a demo session in the prototype; the product redirects to Sign in and returns to the link afterwards. 

### **4.4 Screen inventory** 

|**ID**|**Screen**|**Route**|**Roles**|**Modules**|
|---|---|---|---|---|
|**S00**|Product landing|landing|Public|Web Console|
|**S01**|Sign in|signin|All users|Identity (Keycloak), Edge API Gateway,<br>Operator BFF|
|**S02**|Mission & role scope|scope|Multi-role users|Identity (Keycloak), Policy (OPA)|
|**S03**|Fleet overview|fleet|Flight Director, Spacecraft<br>Operator, Flight Engineer|Live Telemetry, Events & Alarms, Pass<br>Orchestrator, Realtime Gateway|
|**S04**|Satellite health|satellite|Spacecraft Operator, Flight<br>Engineer|TM Processor, Live Telemetry, Events & Alarms|
|**S05**|Parameter history|parameter|Flight Engineer, Spacecraft<br>Operator|TM Archive & Query, Mission Database|
|**S06**|Alarm console|alarms|Spacecraft Operator, Flight<br>Director|Events & Alarms, Notification Service, Anomaly<br>Detection|
|**S07**|Pass playback|playback|Flight Engineer, Spacecraft<br>Operator|TM Archive & Query, Realtime Gateway|
|**S08**|Live pass monitor|pass|Ground Station Engineer,<br>Spacecraft Operator|Pass Orchestrator, Link Gateway, Frame<br>Processor, Forward Link Engine|
|**S09**|Contact schedule|schedule|Mission Planner, Ground<br>Station Engineer|Flight Dynamics Bridge, GS Resource Manager,<br>Planning & Scheduling|
|**S10**|Ground stations|stations|Ground Station Engineer,<br>Mission Planner|GS Resource Manager, Link Gateway|
|**S11**|Pass report|report|Ground Station Engineer,<br>Flight Engineer, Flight<br>Director|Pass Orchestrator, Bulk Payload Pipeline, Frame<br>Processor|
|**S12**|Command console|command|Spacecraft Operator, Flight<br>Director|Command Service, Policy (OPA), Live Telemetry,<br>TC Encoder|
|**S13**|Approvals|approvals|Flight Director|Command Service, Identity (Keycloak), Audit<br>Ledger|



Akashaveda Space Technologies · Confidential · Page 12 

VYUH-MCS Console · Software Requirements Specification v2.0 

|**ID**|**Screen**|**Route**|**Roles**|**Modules**|
|---|---|---|---|---|
|**S14**|Procedure runner|procedure|Spacecraft Operator, Flight<br>Director|Procedure Engine, Command Service, Live<br>Telemetry|
|**S15**|Uplink & COP-1|uplink|Spacecraft Operator, Ground<br>Station Engineer|Forward Link Engine, TC Encoder, Frame<br>Processor|
|**S16**|Procedure editor|editor|Flight Engineer|Procedure Engine, Mission Database,<br>Spacecraft Simulator|
|**S17**|Mission plan|plan|Mission Planner|Planning & Scheduling, Health Forecasting, GS<br>Resource Manager|
|**S18**|Payload deliveries|payload|Mission Planner, Customer<br>User|Bulk Payload Pipeline, Customer API|
|**S19**|Mission database|mdb|Mission Database Engineer,<br>Flight Engineer|Mission Database, Spacecraft Simulator|
|**S20**|Anomaly advisories|anomalies|Spacecraft Operator, Flight<br>Engineer, ML Engineer|Anomaly Detection, Events & Alarms, ML<br>Platform|
|**S21**|Health forecast|forecast|Flight Engineer, Mission<br>Planner|Health Forecasting, ML Platform|
|**S22**|Ops Copilot|copilot|All operational roles|Ops Copilot, Operator BFF|
|**S23**|Simulator|simulator|Flight Engineer, Spacecraft<br>Operator|Spacecraft Simulator, Link Gateway|
|**S24**|Customer portal|customer|Customer User|Customer API, Planning & Scheduling, Bulk<br>Payload Pipeline|
|**S25**|Users & access|users|Security Officer, Platform<br>Administrator|Identity (Keycloak), Policy (OPA)|
|**S26**|Audit ledger|audit|Security Officer, Flight<br>Director|Audit Ledger|
|**S27**|Platform health|platform|Platform Administrator, Flight<br>Director|All services, Observability (LGTM)|
|**S28**|Notifications & on-call|oncall|Flight Director, Platform<br>Administrator|Notification Service, Events & Alarms|



Akashaveda Space Technologies · Confidential · Page 13 

VYUH-MCS Console · Software Requirements Specification v2.0 

## **5. User flows** 

The screen map shows how the 29 screens connect; the journeys show the critical paths across people and modules, with the constraint each step must meet. 



<!-- Start of picture text -->
Screen map — VYUH-MCS console v1 (demo scope)<br>Every in-app screen is reachable from the side navigation; arrows show the main task transitions; cross-flow jumps are listed on the left<br>Product landing [APP SHELL - side navigation « top bar (UTC clock, mode, alarms, spec ©, guide, copilot, role switch)<br>Dp so siz si? S20 S23 S25<br>Fleet overview Live pass monitor Command console Mission plan Anomaly advisories Simulator Users & access<br>a0 Live Telemetry - Events& ass Orchestrator- Link Planning& Scheduling -Heatth | | Anomaly Detection - Events& | | Spacecraft simulator Link Identity (Keyeioak - Policy<br>son ‘alarms ‘Gateway Command Service «Policy (OPA) Forecasting ‘alarms ‘Gateway (OPA)<br>xD 2D ED ED S21 S24 S26<br>Mission &sozrole scope Satellite health Contact schedule Approvals Payload deliveries Health forecast Customer portal ‘Audit ledger<br>2 cessor ee eae Flight Oynamics Bridge -GS_| | command Service «Identity Bulk Payload Pipeline Health Forecasting - ML CustomerAPI Planning& ae ee<br>Live Telemetry Resource Manager (keycloak) Customer API Pratform ‘Scheduling udit Ledger<br>S05 ED 0 S19 S22 S27<br>‘Tw Parameter Archive & QueryhistoryMission | | GS ResGr ou rcend stationsManager Link | | ProcedureProcedureEngine runner-Command | | MissionMissionDatabase datab - Sp cecraft a se ops;  Copitot _ All servicesPlatform -Obsh e rvabiltyalth<br>Database Gateway Service Simulator Ops Copilot- OperatorBt (ucTM)<br>506 su sis S28<br>Legend EventsAlarm console Pass report Uplink & COP-1 Notifications & on-call<br>— within a tow & AlarmsServiceNotification assPayload OrchestratorPipelineBulk Forward EncoderLink Engine “TC Ntiication@ AlarmeService - Events<br>cross-flow jumps<br>504 + $12 Send command<br>$08 + $15 COP-1<br>522520 ++ S06514 advisorycited procedurestate~ alarm S07 sis<br>520 + $23 reproduce Pass playback Procedure editor<br>Sees oe sis ev eee TM ArchiveGateway&: Query - Realtime Procedure EngineDatabase- Mission<br>29 screens 8 flows<br><!-- End of picture text -->

_Figure 5. Screen map_ 

Akashaveda Space Technologies · Confidential · Page 14 

VYUH-MCS Console · Software Requirements Specification v2.0 



<!-- Start of picture text -->
Journey 1 — Respond to a heater fault and recover (demo story)<br>an p 3 GD 7 o—o H<br><!-- End of picture text -->

_Figure 6. Journey 1 — heater fault response (the demo story)_ 

Akashaveda Space Technologies · Confidential · Page 15 

VYUH-MCS Console · Software Requirements Specification v2.0 



<!-- Start of picture text -->
Journey 2 — Send a critical command with two-person approval<br>Requester Build command Status on screen<br>(operator) S12 typed form, ranges | ACCEPTED ~ COMPLETED<br>Commandpolicy Service & Dictionary10 + fed valid?error |.) Policystaleffailed+  +interlock blocked _,/ AWAITINGRecord APPROVAL+ outbox<br>ApproverDirector) (Flight or Rejectrequesterwithnatiiedreason |2°| ApproveS13 - notwith own passkeyrequest<br>Uplink chain TC Encoder (lease, epoch) FoP-1 + station<br>SOLS seal Cucw accept<br><!-- End of picture text -->

_Figure 7. Journey 2 — critical command with two-person approval_ 

Akashaveda Space Technologies · Confidential · Page 16 

VYUH-MCS Console · Software Requirements Specification v2.0 



<!-- Start of picture text -->
Journey 3 — Monitor a pass and close its report<br>Ground Station Check schedule Watch live pass | Mark report final<br>; GD DD ——o<><br>VYUH-Mcs Prepare at AOS-10 Zone fails + standby LOS « drain « backfill<br>ass Orchestrator | -< 30 takeover gap ledge<br>Station provider AOSSLE- framesAWS / ownflow<br><!-- End of picture text -->

_Figure 8. Journey 3 — monitor a pass and close its report_ 

Akashaveda Space Technologies · Confidential · Page 17 

VYUH-MCS Console · Software Requirements Specification v2.0 



<!-- Start of picture text -->
Journey 4 — Release a dictionary change<br>Mission Database Change XTCE in Git Schedule effective time<br>Engineer 19 draft | per satelite<br>2 approvals |<br>VYUH-Mcs Compile + sign bundle _y) Simulator verify Active at AOS<br>FlatBurters 523 reference passes hot-swap - rollback ready<br><!-- End of picture text -->

_Figure 9. Journey 4 — release a dictionary change_ 

Akashaveda Space Technologies · Confidential · Page 18 

VYUH-MCS Console · Software Requirements Specification v2.0 

|**Journey**|**Steps**|
|---|---|
|**Journey 1**|Heater A fails on AKV-03 → advisory AN-401 within 60 s (Q-07) → alarm AL-801 on screen within 1 s (Q-02) → operator acknowledges and inspects (S06, S04, S05) → Copilot cites PR-<br>THM-004 (S22) → procedure runs to step 5 (S14) → gates require a second person (Q-14) → Flight Director approves with passkey (S13, C-07) → TC Encoder encodes under its lease,<br>COP-1 delivers (S15, Q-04) → heater B on, temperature recovers (S04) → audit chain verified (S26).|
|**Journey 2**|Build command with typed parameters (S12) → dictionary validation (C-03) → policy and interlocks, stale telemetry fails closed (P-01) → record + outbox, awaiting approval (C-07) →<br>approver reviews and approves or rejects with reason (S13, Q-14) → release to TC Encoder within 150 ms (Q-03) → FOP-1 delivery with CLCW acceptance (Q-05) → status<br>COMPLETED on screen.|
|**Journey 3**|Check booked passes (S09) → Pass Orchestrator prepares at AOS−10 with deploy freeze (Q-15) → AOS, frames flow over SLE / provider APIs (C-02) → watch live pass KPIs (S08, Q-01)<br>→ zone failure handled by standby in < 30 s (Q-10) → LOS, drain and backfill (Q-06) → report marked final (S11).|
|**Journey 4**|Change XTCE in Git (S19) → two reviewers approve the semantic diff (C-07) → compile and sign the bundle (P-06) → verify on the simulator (S23, C-03) → schedule effective time per<br>satellite → active at AOS with rollback ready.|



Akashaveda Space Technologies · Confidential · Page 19 

VYUH-MCS Console · Software Requirements Specification v2.0 

## **6. Screen specifications** 

Each screen has: a screenshot from the prototype, a summary table, functional requirements derived from its regions, the states it must support, business rules, the constraints it must meet with their acceptance checks, and a Figma frame note. Additional state screenshots from the demo story are included where they show behaviour that the default state cannot. 

Akashaveda Space Technologies · Confidential · Page 20 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **S00 · Product landing** 



<!-- Start of picture text -->
VYUH 4] Sign in<br>One console for 8<br>every satellite,<br>pass and command. = ‘<br><!-- End of picture text -->

_Figure 10. S00 Product landing — default state_ 

|**Purpose**|Introduce VYUH-MCS to prospects and start the guided demo.|
|---|---|
|**Route**|#/landing|
|**Flow**|Public & access|
|**Roles**|Public|
|**Modules**|Web Console|
|**Data sources**|Static content|
|**Constraints**|C-06|



##### **FUNCTIONAL REQUIREMENTS** 

**FR-S00-01** The screen shall provide: Top bar with logo and Sign in. 

**FR-S00-02** The screen shall provide: Hero: constellation mark, headline, Start demo / Sign in. 

**FR-S00-03** The screen shall provide: Four capability cards. 

**FR-S00-04** The screen shall provide: Proof numbers (100 ms, 500 satellites, 0 double commands, 99.95 %). 

**FR-S00-05** The screen shall provide: Footer with sovereignty note. 

##### **STATES** 

1 Default 

##### **BUSINESS RULES** 

**BR-S00-01** Primary action "Start guided demo" opens Sign in with the demo guide running. **BR-S00-02** No live data on the public page. 

Akashaveda Space Technologies · Confidential · Page 21 

VYUH-MCS Console · Software Requirements Specification v2.0 

##### **CONSTRAINTS AND ACCEPTANCE** 

|**ID**|**Target / rule**|**Meaning on this screen**|**Acceptance check**|
|---|---|---|---|
|**C-06**|Sovereign data and tenant isolation|Mission data stays in the agreed<br>country/region and one customer never sees<br>another's data.|Tenant in every key, PostgreSQL row-<br>level security, in-region AI inference.|



**Figma frame:** Full-width, 1440 × auto, 12-column 72/24 grid, sp-7 section spacing · page Screens — Public & access · frame name S00 Product landing / Default plus one frame per state. 

Akashaveda Space Technologies · Confidential · Page 22 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **S01 · Sign in** 



<!-- Start of picture text -->
>) VYUH r<br>Sign in to mission control<br>@ Sign in with passkey<br>@ Continue with corporate sso<br><!-- End of picture text -->

_Figure 11. S01 Sign in — default state_ 

|**Purpose**|Phishing-resistant sign-in with passkeys or corporate SSO.|
|---|---|
|**Route**|#/signin|
|**Flow**|Public & access|
|**Roles**|All users|
|**Modules**|Identity (Keycloak) · Edge API Gateway · Operator BFF|
|**Data sources**|OIDC authorization code + PKCE via Keycloak·WebAuthn passkey ceremony·BFF session cookie<br>(httpOnly)|
|**Constraints**|Q-14 · C-07|



##### **FUNCTIONAL REQUIREMENTS** 

**FR-S01-01** The screen shall provide: Centred card on canvas with logo. **FR-S01-02** The screen shall provide: Passkey button (primary). **FR-S01-03** The screen shall provide: Corporate SSO button. **FR-S01-04** The screen shall provide: Break-glass link (audited). 

**FR-S01-05** The screen shall provide: Environment tag and classification banner. 

##### **STATES** 

|1|Default|
|---|---|
|2|Waiting for passkey|
|3|Passkey rejected|
|4|Session expired (amber banner)|
|5|Account locked|



Akashaveda Space Technologies · Confidential · Page 23 

VYUH-MCS Console · Software Requirements Specification v2.0 

##### **BUSINESS RULES** 

**BR-S01-01** No passwords are typed in the console; passkeys are the default factor. **BR-S01-02** Tokens never reach JavaScript storage (token-handler pattern). **BR-S01-03** Every sign-in is written to the audit ledger. 

##### **CONSTRAINTS AND ACCEPTANCE** 

|**ID**|**Target / rule**|**Meaning on this screen**|**Acceptance check**|
|---|---|---|---|
|**Q-14**|One stolen credential cannot<br>command a spacecraft|A single leaked password, token or laptop is<br>never enough to send a command.|Passkeys, step-up authentication, two-<br>person rule for critical commands, OPA<br>policy, signed request envelopes, HSM-<br>rooted keys.|
|**C-07**|Every command attributable|For every command we can prove who|Approvals in the command record; hash-|
|||asked, who approved, what policy allowed it|chained audit ledger anchored to|
|||and what happened.|WORM storage.|



##### **ADDITIONAL STATES** 



<!-- Start of picture text -->
vyun<br>Sign in to mission control<br>@ Sign in with passkey<br>1. Continue with corporate S50<br>Sign in with a passkey<br>Use passkey<br><!-- End of picture text -->

_Figure 12. S01 — Sign in with the guided demo panel open_ 

**Figma frame:** Centred 440 px card on canvas, 1440 × 900 · page Screens — Public & access · frame name S01 Sign in / Default plus one frame per state. 

Akashaveda Space Technologies · Confidential · Page 24 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **S02 · Mission & role scope** 



<!-- Start of picture text -->
>) YUH Vikram shetty Sign out<br>Choose mission and role<br>3 Spacecraft Operator W Flight Director 2 Flight Engineer<br>0 Mission Planner © Security officer<br><!-- End of picture text -->

_Figure 13. S02 Mission & role scope — default state_ 

|**Purpose**|Choose tenant, mission and role for the session; sets satellite scope for every later authorisation.|
|---|---|
|**Route**|#/scope|
|**Flow**|Public & access|
|**Roles**|Multi-role users|
|**Modules**|Identity (Keycloak) · Policy (OPA)|
|**Data sources**|GET /v1/me/scopes·acr claim for step-up level|
|**Constraints**|C-06 · Q-14|



##### **FUNCTIONAL REQUIREMENTS** 

**FR-S02-01** The screen shall provide: Tenant selector. 

**FR-S02-02** The screen shall provide: Role cards with scope and allowed actions. 

**FR-S02-03** The screen shall provide: Satellite scope summary. 

**FR-S02-04** The screen shall provide: Continue button. 

##### **STATES** 

|1|No selection|
|---|---|
|2|Selected|
|3|Role requires on-shift confirmation|



##### **BUSINESS RULES** 

**BR-S02-01** Only one role is active per session. 

**BR-S02-02** Commanding roles require an on-shift roster entry. 

Akashaveda Space Technologies · Confidential · Page 25 

VYUH-MCS Console · Software Requirements Specification v2.0 

##### **CONSTRAINTS AND ACCEPTANCE** 

|**ID**|**Target / rule**|**Meaning on this screen**|**Acceptance check**|
|---|---|---|---|
|**C-06**|Sovereign data and tenant isolation|Mission data stays in the agreed<br>country/region and one customer never sees<br>another's data.|Tenant in every key, PostgreSQL row-<br>level security, in-region AI inference.|
|**Q-14**|One stolen credential cannot<br>command a spacecraft|A single leaked password, token or laptop is<br>never enough to send a command.|Passkeys, step-up authentication, two-<br>person rule for critical commands, OPA<br>policy, signed request envelopes, HSM-<br>rooted keys.|



**Figma frame:** 1440 × 900, 960 px centred container, 3-column role grid · page Screens — Public & access · frame name S02 Mission & role scope / Default plus one frame per state. 

Akashaveda Space Technologies · Confidential · Page 26 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **S03 · Fleet overview** 



<!-- Start of picture text -->
spec (15:54:04 vr Z @ Vikram shetty<br>[ @ Fleet overview Fleet overview Allplanes Plane A PlaneB Customer<br>a 9 2 1 2 t) 1<br>. Constellation e nominal © warning. © crea Satellites<br>= mev-02 ><br>a<br>c<br>© av-07<br>w<br>=) Subsystem health — a<br>e axv-02 |e<br><!-- End of picture text -->

_Figure 14. S03 Fleet overview — default state_ 

|**Purpose**|Situational awareness for the whole constellation at a glance.|
|---|---|
|**Route**|#/fleet|
|**Flow**|Fleet & telemetry|
|**Roles**|Flight Director, Spacecraft Operator, Flight Engineer|
|**Modules**|Live Telemetry · Events & Alarms · Pass Orchestrator · Realtime Gateway|
|**Data sources**|WSS cvt:* conflated deltas·alarms.state.v1·link.sessions.v1·fd.contacts.v1|
|**Constraints**|Q-01 · Q-02 · Q-12|



##### **FUNCTIONAL REQUIREMENTS** 

**FR-S03-01** The screen shall provide: KPI strip: nominal / warning / critical / in contact / pending approvals. **FR-S03-02** The screen shall provide: Dot-matrix world map with satellites, ground tracks and stations. **FR-S03-03** The screen shall provide: Satellite list with status and next contact. 

**FR-S03-04** The screen shall provide: Subsystem health matrix (satellites x subsystems). 

**FR-S03-05** The screen shall provide: Active and next passes panel. 

##### **STATES** 

|1|Live|
|---|---|
|2|Stale link (> 15 s without heartbeat)|
|3|Filtered by tenant/plane|
|4|Critical alarm present|



##### **BUSINESS RULES** 

**BR-S03-01** Values update without easing (no animation on data). **BR-S03-02** Critical alarms pulse at most 1 Hz. 

Akashaveda Space Technologies · Confidential · Page 27 

VYUH-MCS Console · Software Requirements Specification v2.0 

##### **BR-S03-03** Clicking a satellite opens Satellite health. 

##### **CONSTRAINTS AND ACCEPTANCE** 

|**ID**|**Target / rule**|**Meaning on this screen**|**Acceptance check**|
|---|---|---|---|
|**Q-01**|Telemetry within 100 ms from<br>receipt to screen (P99)|A value the spacecraft sends must be visible<br>to an operator almost instantly, so decisions<br>are made on current data.|Measured end to end from Link<br>Gateway receive timestamp to browser<br>render, P99 over each pass.|
|**Q-02**|Alarm on screen within 1 s|A limit violation must reach a person fast<br>enough to act inside a short pass.|Measured from the violating sample<br>receipt to the alarm banner rendering.|
|**Q-12**|Scale from 5 to 500 satellites<br>without a rewrite|The design must grow with the constellation<br>by adding capacity, not rebuilding.|Everything is partitioned by<br>tenant:satellite; load tests at 500-<br>satellite rates.|



##### **ADDITIONAL STATES** 



<!-- Start of picture text -->
vyun 15:55:30 5 Vira shetty<br>[© rectoveniew Fleet overview oes Es cs<br>: 3 1 2 0 2<br>pai "<br>Guided demo<br>3 A fault is developing<br>ees * |<br><!-- End of picture text -->

_Figure 15. S03 — Fleet overview after the heater fault: warning count and advisory badge increase_ 

**Figma frame:** 1440 × 900 · app shell (sidebar 232, top bar 52) · content padding 24 · 12-column grid, 24 gutter · page Screens — Fleet & telemetry · frame name S03 Fleet overview / Default plus one frame per state. 

Akashaveda Space Technologies · Confidential · Page 28 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **S04 · Satellite health** 



<!-- Start of picture text -->
oy aed<br>(15:54:06ure « z vs Vikram shetty<br>os i AKV-03 AKV-03 . Run procedure | Send command<br>29.36 81.8 18.5<br>' ' '<br>é<br>4.16<br>9<br>=]<br>$°<br>x<br><!-- End of picture text -->

_Figure 16. S04 Satellite health — default state_ 

|**Purpose**|All telemetry for one satellite grouped by subsystem, with limits and freshness.|
|---|---|
|**Route**|#/satellite|
|**Flow**|Fleet & telemetry|
|**Roles**|Spacecraft Operator, Flight Engineer|
|**Modules**|TM Processor · Live Telemetry · Events & Alarms|
|**Data sources**|WSS cvt:{tenant}:{sat}·GET /v1/satellites/{id}·mdb bundle version|
|**Constraints**|Q-01 · Q-02 · C-03 · C-04|



##### **FUNCTIONAL REQUIREMENTS** 

**FR-S04-01** The screen shall provide: Context bar: ID, mode, AOS/LOS, station, dictionary version, Send command. **FR-S04-02** The screen shall provide: Subsystem tabs: Power, ADCS, Thermal, Comms, Payload, OBC. 

**FR-S04-03** The screen shall provide: Parameter cards: mnemonic, value, unit, limit bar, sparkline, age. 

**FR-S04-04** The screen shall provide: Alarm side panel. 

##### **STATES** 

|1|In contact|
|---|---|
|2|Out of contact (last known values dimmed)|
|3|Stale parameter|
|4|Out of limits|



##### **BUSINESS RULES** 

**BR-S04-01** A value is stale after 3 missed periods and is dimmed with its last-update time. 

**BR-S04-02** Mnemonics use JetBrains Mono. 

Akashaveda Space Technologies · Confidential · Page 29 

VYUH-MCS Console · Software Requirements Specification v2.0 

##### **CONSTRAINTS AND ACCEPTANCE** 

|**ID**|**Target / rule**|**Meaning on this screen**|**Acceptance check**|
|---|---|---|---|
|**Q-01**|Telemetry within 100 ms from<br>receipt to screen (P99)|A value the spacecraft sends must be visible<br>to an operator almost instantly, so decisions<br>are made on current data.|Measured end to end from Link<br>Gateway receive timestamp to browser<br>render, P99 over each pass.|
|**Q-02**|Alarm on screen within 1 s|A limit violation must reach a person fast<br>enough to act inside a short pass.|Measured from the violating sample<br>receipt to the alarm banner rendering.|
|**C-03**|XTCE dictionaries (with SCOS-2000<br>MIB import)|Telemetry and command definitions use the<br>standard XML format so they are portable<br>between tools.|Mission Database imports, validates and<br>compiles XTCE.|
|**C-04**|PUS services 1, 3, 5, 11|Standard on-board services: request<br>verification (1), housekeeping (3), events (5)<br>and time-based scheduling (11).|PUS codecs in TM Processor and TC<br>Encoder.|



##### **ADDITIONAL STATES** 



<!-- Start of picture text -->
vvun 15:56:06 © z Ge vierom shetty<br>AKV-03 a<br>: 29.39 82.2 9.1 Se<br>. * = VY Acknowledge — Det»!<br>4.08<br>; Temperature recovers<br>°<br>Ce<br><!-- End of picture text -->

_Figure 17. S04 — AKV-03 power after recovery: BAT_TEMP climbing, alarm still visible until return to normal_ 

**Figma frame:** 1440 × 900 · app shell (sidebar 232, top bar 52) · content padding 24 · 12-column grid, 24 gutter · page Screens — Fleet & telemetry · frame name S04 Satellite health / Default plus one frame per state. 

Akashaveda Space Technologies · Confidential · Page 30 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **S05 · Parameter history** 



<!-- Start of picture text -->
2) (15:54:09 vn ; @ Vikram shetty<br>ans<br>* ° 179 19.1 18.6 0.3 0.0%<br><!-- End of picture text -->

_Figure 18. S05 Parameter history — default state_ 

|**Purpose**|Deep analysis of one parameter over time with limits, statistics and calibration.|
|---|---|
|**Route**|#/parameter|
|**Flow**|Fleet & telemetry|
|**Roles**|Flight Engineer, Spacecraft Operator|
|**Modules**|TM Archive & Query · Mission Database|
|**Data sources**|GET /v1/history?param&from&to&agg (ClickHouse / Iceberg)·Calibration from signed bundle|
|**Constraints**|Q-13 · C-03|



##### **FUNCTIONAL REQUIREMENTS** 

**FR-S05-01** The screen shall provide: Identity header with current value. 

**FR-S05-02** The screen shall provide: Range tabs: Pass / 1 h / 24 h / 7 d / 30 d. 

**FR-S05-03** The screen shall provide: Time-series chart with warning and critical bands. **FR-S05-04** The screen shall provide: Statistics row. 

**FR-S05-05** The screen shall provide: Calibration panel. 

**FR-S05-06** The screen shall provide: Alarm history table. 

##### **STATES** 

|1|Loading (< 500 ms target)|
|---|---|
|2|Rollup resolution notice|
|3|Cold data from lakehouse|



##### **BUSINESS RULES** 

**BR-S05-01** Resolution is chosen automatically (raw, 1 s, 1 min, 1 h) and shown on the chart. 

**BR-S05-02** Export is an asynchronous job. 

Akashaveda Space Technologies · Confidential · Page 31 

VYUH-MCS Console · Software Requirements Specification v2.0 

##### **CONSTRAINTS AND ACCEPTANCE** 

|**ID**|**Target / rule**|**Meaning on this screen**|**Acceptance check**|
|---|---|---|---|
|**Q-13**|History query within 500 ms (P95)|An engineer plotting weeks of data gets the<br>chart in under a second.|Measured at the Query API for standard<br>30-day parameter plots.|
|**C-03**|XTCE dictionaries (with SCOS-2000<br>MIB import)|Telemetry and command definitions use the<br>standard XML format so they are portable<br>between tools.|Mission Database imports, validates and<br>compiles XTCE.|



**Figma frame:** 1440 × 900 · app shell (sidebar 232, top bar 52) · content padding 24 · 12-column grid, 24 gutter · page Screens — Fleet & telemetry · frame name S05 Parameter history / Default plus one frame per state. 

Akashaveda Space Technologies · Confidential · Page 32 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **S06 · Alarm console** 



<!-- Start of picture text -->
> vyYUH ia) SRerore 2 @ Vikram shetty<br>@ Alarm console =<br>a 1 2 C) 0) 1 1<br>[18 aterm console<br>; 28<br>w<br>=)<br>$ °<br>(2<br><!-- End of picture text -->

_Figure 19. S06 Alarm console — default state_ 

|**Purpose**|Manage alarms through their ISA-18.2 lifecycle.|
|---|---|
|**Route**|#/alarms|
|**Flow**|Fleet & telemetry|
|**Roles**|Spacecraft Operator, Flight Director|
|**Modules**|Events & Alarms · Notification Service · Anomaly Detection|
|**Data sources**|alarms.state.v1·POST /v1/alarms/{id}/ack | shelve·notify.requests.v1|
|**Constraints**|Q-02 · Q-07 · C-07|



##### **FUNCTIONAL REQUIREMENTS** 

**FR-S06-01** The screen shall provide: Severity counters. 

**FR-S06-02** The screen shall provide: Filter bar. 

**FR-S06-03** The screen shall provide: Alarm table: severity, satellite, condition, value/limit, state, age, owner. 

**FR-S06-04** The screen shall provide: Detail drawer: timeline, related parameters, advisory evidence, actions. 

##### **STATES** 

|1|Unacknowledged|
|---|---|
|2|Acknowledged|
|3|Returned to normal|
|4|Shelved (expires)|
|5|Advisory (AI, never auto-escalated)|
|6|Escalated to on-call|



##### **BUSINESS RULES** 

**BR-S06-01** Shelving requires a reason and an expiry. 

Akashaveda Space Technologies · Confidential · Page 33 

VYUH-MCS Console · Software Requirements Specification v2.0 

**BR-S06-02** AI advisories are shown with a distinct ADVISORY badge. **BR-S06-03** Unacknowledged CRITICAL alarms escalate after 5 and 15 minutes. 

##### **CONSTRAINTS AND ACCEPTANCE** 

|**ID**|**Target / rule**|**Meaning on this screen**|**Acceptance check**|
|---|---|---|---|
|**Q-02**|Alarm on screen within 1 s|A limit violation must reach a person fast<br>enough to act inside a short pass.|Measured from the violating sample<br>receipt to the alarm banner rendering.|
|**Q-07**|Anomaly advisory within 5 s<br>(point) / 60 s (multivariate)|AI warnings must arrive while they are still<br>useful during a pass.|Measured from sample receipt to<br>advisory visible in Events & Alarms.|
|**C-07**|Every command attributable|For every command we can prove who<br>asked, who approved, what policy allowed it<br>and what happened.|Approvals in the command record; hash-<br>chained audit ledger anchored to<br>WORM storage.|



##### **ADDITIONAL STATES** 



<!-- Start of picture text -->
vyun 15:55:37 w 5 Vira shetty<br>Alarm console =<br>:<br>a 3 0 1 a, 2<br>mpieall Guided demo end sing over9 days ==<br>3 ‘The alarm follows<br>e pen Ak-23 power<br><!-- End of picture text -->

_Figure 20. S06 — New unacknowledged WARNING AL-801 with its ADVISORY row_ 

Akashaveda Space Technologies · Confidential · Page 34 

VYUH-MCS Console · Software Requirements Specification v2.0 



<!-- Start of picture text -->
vyuH 6:2 BatteryA duty 1s temperature97 falling while heater<br>% — heaterA likely failed<br>Alarm console<br>o Pee eseat oe<br>13.7<br>Guided deme<br>Proof for the auditor<br>— © Raviaw mivinary<br><!-- End of picture text -->

_Figure 21. S06 — Alarm detail drawer with evidence and timeline_ 

**Figma frame:** 1440 × 900 · app shell (sidebar 232, top bar 52) · content padding 24 · 12-column grid, 24 gutter · page Screens — Fleet & telemetry · frame name S06 Alarm console / Default plus one frame per state. 

Akashaveda Space Technologies · Confidential · Page 35 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **S07 · Pass playback** 



<!-- Start of picture text -->
PLAYBACK HODE = NOT LVE DATA: COMMANDING DISARLED<br>os hee) (15:54:14 ur 2 vs Vikram Shetty<br>Pass playback P5:262600812-AKv.O3-HYD ~|_—) Pane report<br>a<br>t Dew 15:11:14 PEED 1x Sx 10x 50x 00x<br>- Parameter overlay Event log<br>e<br>z, °<br>z<br><!-- End of picture text -->

_Figure 22. S07 Pass playback — default state_ 

|**Purpose**|Replay a past pass at variable speed for investigation and training.|
|---|---|
|**Route**|#/playback|
|**Flow**|Fleet & telemetry|
|**Roles**|Flight Engineer, Spacecraft Operator|
|**Modules**|TM Archive & Query · Realtime Gateway|
|**Data sources**|Playback stream 1x-100x·Pass Quality Report|
|**Constraints**|Q-13 · Q-06|



##### **FUNCTIONAL REQUIREMENTS** 

**FR-S07-01** The screen shall provide: Permanent PLAYBACK banner. 

**FR-S07-02** The screen shall provide: Pass selector. 

**FR-S07-03** The screen shall provide: Scrubber with AOS/LOS, gaps and alarm markers. 

**FR-S07-04** The screen shall provide: Speed control. 

**FR-S07-05** The screen shall provide: Parameter overlay chart. 

**FR-S07-06** The screen shall provide: Event log at playback time. 

##### **STATES** 

|1|Playing|
|---|---|
|2|Paused|
|3|Seeking|
|4|End of pass|



##### **BUSINESS RULES** 

**BR-S07-01** Playback can never be confused with live: banner, amber frame and mode chip. 

Akashaveda Space Technologies · Confidential · Page 36 

VYUH-MCS Console · Software Requirements Specification v2.0 

##### **BR-S07-02** Commanding is disabled in playback mode. 

##### **CONSTRAINTS AND ACCEPTANCE** 

|**ID**|**Target / rule**|**Meaning on this screen**|**Acceptance check**|
|---|---|---|---|
|**Q-13**|History query within 500 ms (P95)|An engineer plotting weeks of data gets the<br>chart in under a second.|Measured at the Query API for standard<br>30-day parameter plots.|
|**Q-06**|Zero data loss after receipt|Once a frame has reached our software it is<br>never lost, even if a server crashes.|Write-ahead spool before<br>acknowledgement, Kafka replication<br>factor 3, gap ledger and backfill from<br>station recordings.|



**Figma frame:** 1440 × 900 · app shell (sidebar 232, top bar 52) · content padding 24 · 12-column grid, 24 gutter · page Screens — Fleet & telemetry · frame name S07 Pass playback / Default plus one frame per state. 

Akashaveda Space Technologies · Confidential · Page 37 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **S08 · Live pass monitor** 



<!-- Start of picture text -->
see) (15:54:17 un = @ Vikram shetty<br>@ Live pass monitor Akv-03 - Hvo AKV-03, . Schedule Pass report<br>;<br>Session LS-20260917-HYD-0412<br>a<br>[ 4. tive pass 41 258 1 76 ms 46°<br>: Elevation Standby gateway<br>c<br>5 a ~~ axv-o3 46° oe<br>ae<br>20s Tea Los<br>=)<br>retuicence Virtual channels Latency budget<br>Se ° conten nour FRAMES/S GAPS ACKFILL. STAT -<br>ms is se<br><!-- End of picture text -->

_Figure 23. S08 Live pass monitor — default state_ 

|**Purpose**|Watch the ground link during an active pass: session state, frames, gaps, latency and COP-1.|
|---|---|
|**Route**|#/pass|
|**Flow**|Passes & ground|
|**Roles**|Ground Station Engineer, Spacecraft Operator|
|**Modules**|Pass Orchestrator · Link Gateway · Frame Processor · Forward Link Engine|
|**Data sources**|link.sessions.v1·tm.frames metrics·gap & reset events·tm.clcw.v1|
|**Constraints**|Q-06 · Q-08 · Q-10 · Q-05 · C-01 · C-02|



##### **FUNCTIONAL REQUIREMENTS** 

**FR-S08-01** The screen shall provide: Session lifecycle stepper (SCHEDULED → COMPLETE). **FR-S08-02** The screen shall provide: Elevation arc with AOS/TCA/LOS. 

**FR-S08-03** The screen shall provide: Link KPIs: frames/s, spool depth, gaps, E2E latency P99. 

**FR-S08-04** The screen shall provide: Virtual channel table. 

**FR-S08-05** The screen shall provide: Standby gateway status. 

**FR-S08-06** The screen shall provide: Latency budget bar. 

##### **STATES** 

|1|Preparing|
|---|---|
|2|Ready|
|3|Active|
|4|Draining|
|5|Standby takeover|
|6|Closed|



Akashaveda Space Technologies · Confidential · Page 38 

VYUH-MCS Console · Software Requirements Specification v2.0 

##### **BUSINESS RULES** 

**BR-S08-01** A gap opens a backfill request automatically. 

**BR-S08-02** Standby takeover must complete in under 30 s. 

##### **CONSTRAINTS AND ACCEPTANCE** 

|**ID**|**Target / rule**|**Meaning on this screen**|**Acceptance check**|
|---|---|---|---|
|**Q-06**|Zero data loss after receipt|Once a frame has reached our software it is<br>never lost, even if a server crashes.|Write-ahead spool before<br>acknowledgement, Kafka replication<br>factor 3, gap ledger and backfill from<br>station recordings.|
|**Q-08**|99.95 % of pass-minutes available|Availability is counted only when a satellite is<br>in contact, because that is when failure costs<br>the mission.|Pass-minutes with full service ÷<br>scheduled pass-minutes, per month.|
|**Q-10**|Zone loss: no pass gap longer than<br>30 s|A whole data-centre zone can fail and a pass<br>in progress continues after a short hiccup.|Chaos test: kill one availability zone mid-<br>pass; measure the telemetry gap.|
|**Q-05**|CLCW feedback within 100 ms|The satellite's acknowledgement (CLCW)<br>must reach the uplink engine quickly so<br>retransmission decisions are right.|Measured from frame receipt to FOP-1<br>state update.|
|**C-01**|CCSDS TM / AOS / USLP / TC / COP-1<br>/ SDLS|We speak the international space-link<br>standards, so any standards-compliant<br>spacecraft and station works.|Rust codec library tested against CCSDS<br>reference vectors.|
|**C-02**|SLE RAF / RCF / F-CLTU for agency<br>stations|Space-agency ground stations (e.g. ISRO,<br>ESA) require the Space Link Extension<br>protocol.|ESA SLE API bridge; interoperability tests<br>with each provider.|



**Figma frame:** 1440 × 900 · app shell (sidebar 232, top bar 52) · content padding 24 · 12-column grid, 24 gutter · page Screens — Passes & ground · frame name S08 Live pass monitor / Default plus one frame per state. 

Akashaveda Space Technologies · Confidential · Page 39 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **S09 · Contact schedule** 



<!-- Start of picture text -->
> vvuH Wy SESS z Vikram shetty<br>: Contact schedule Al providers veh ath 72h<br>. Orbit update fd.contacts.v1 at 06:10 UTC shifted contacts. 6 passes moved by more than 20 s; shifted bars have an amber outline, Check bookings with the<br>; Timeline- 09-17 09:54 ~ 09-18 09:54 UTC booked predicted shined“ deploy eece<br>—S——<br>{ ree ' ' ' ' ‘ ' ot' ' ‘ ' ‘'<br>= ' ' ‘ ' L] ‘ 1 ' ' ' ' 1<br>commen ‘ ' ‘ ' Py ‘<br>e'''<br>'<br>t) ' i] ' ‘ 0 ' ' t) ‘<br>5 ‘ ‘ a ‘ 1 1 '<br>LY ' '<br>' ' a ‘<br>w<br>=]<br>$ °<br>ce<br><!-- End of picture text -->

_Figure 24. S09 Contact schedule — default state_ 

|**Purpose**|See predicted contact windows and bookings for all satellites and stations.|
|---|---|
|**Route**|#/schedule|
|**Flow**|Passes & ground|
|**Roles**|Mission Planner, Ground Station Engineer|
|**Modules**|Flight Dynamics Bridge · GS Resource Manager · Planning & Scheduling|
|**Data sources**|fd.contacts.v1·gs.bookings.v1·pass calendar|
|**Constraints**|C-05 · Q-15|



##### **FUNCTIONAL REQUIREMENTS** 

**FR-S09-01** The screen shall provide: 24 h timeline, one row per satellite. 

**FR-S09-02** The screen shall provide: Pass bars coloured by provider, booked vs predicted. 

**FR-S09-03** The screen shall provide: Now line. 

**FR-S09-04** The screen shall provide: Deploy freeze windows. 

**FR-S09-05** The screen shall provide: Pass detail drawer with elevation, duration, cost. 

##### **STATES** 

|1|Predicted|
|---|---|
|2|Requested|
|3|Booked|
|4|Cancelled by provider|
|5|Shifted after orbit update|



##### **BUSINESS RULES** 

**BR-S09-01** Flight-critical deploys are blocked during booked passes. 

Akashaveda Space Technologies · Confidential · Page 40 

VYUH-MCS Console · Software Requirements Specification v2.0 

##### **BR-S09-02** Shifted contacts are flagged in amber. 

##### **CONSTRAINTS AND ACCEPTANCE** 

|**ID**|**Target / rule**|**Meaning on this screen**|**Acceptance check**|
|---|---|---|---|
|**C-05**|External systems through APIs only|Providers and flight dynamics systems are<br>integrated through defined interfaces, never<br>shared databases or manual files.|Adapters behind interfaces with an<br>egress proxy.|
|**Q-15**|No critical deployments during a<br>pass|Software updates never interrupt a live<br>contact.|Argo CD sync windows are generated<br>from the pass calendar published by<br>Pass Orchestrator.|



**Figma frame:** 1440 × 900 · app shell (sidebar 232, top bar 52) · content padding 24 · 12-column grid, 24 gutter · page Screens — Passes & ground · frame name S09 Contact schedule / Default plus one frame per state. 

Akashaveda Space Technologies · Confidential · Page 41 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **S10 · Ground stations** 



<!-- Start of picture text -->
> YUH ae 5 SES<br>; Gratinalarations! Ai) mine | Oeste | sitonan =<br>ifa 6 1 1 3<br>aur wo se<br>a 97.8 98.9% 9.50 99.1 99.6% 2.00 99.4 99.8% 14.00<br>; sm san Aw —<br>98.6 94.2 12.00 97.1 98.1% 7.50 96.4 = 8.00<br><!-- End of picture text -->

_Figure 25. S10 Ground stations — default state_ 

|**Purpose**|Station catalogue, provider performance and cost.|
|---|---|
|**Route**|#/stations|
|**Flow**|Passes & ground|
|**Roles**|Ground Station Engineer, Mission Planner|
|**Modules**|GS Resource Manager · Link Gateway|
|**Data sources**|GET /v1/stations·Pass Quality Report aggregates|
|**Constraints**|C-02 · C-05 · Q-08|



##### **FUNCTIONAL REQUIREMENTS** 

**FR-S10-01** The screen shall provide: Station cards: provider, band, protocol (SLE, AWS Data/IP, own). 

**FR-S10-02** The screen shall provide: Availability and quality score. 

**FR-S10-03** The screen shall provide: Cost per minute. 

**FR-S10-04** The screen shall provide: Adapter health. 

##### **STATES** 

|1|Available|
|---|---|
|2|Degraded|
|3|Maintenance|



##### **BUSINESS RULES** 

**BR-S10-01** Credentials are never displayed; they live in OpenBao. 

Akashaveda Space Technologies · Confidential · Page 42 

VYUH-MCS Console · Software Requirements Specification v2.0 

##### **CONSTRAINTS AND ACCEPTANCE** 

|**ID**|**Target / rule**|**Meaning on this screen**|**Acceptance check**|
|---|---|---|---|
|**C-02**|SLE RAF / RCF / F-CLTU for agency<br>stations|Space-agency ground stations (e.g. ISRO,<br>ESA) require the Space Link Extension<br>protocol.|ESA SLE API bridge; interoperability tests<br>with each provider.|
|**C-05**|External systems through APIs only|Providers and flight dynamics systems are<br>integrated through defined interfaces, never<br>shared databases or manual files.|Adapters behind interfaces with an<br>egress proxy.|
|**Q-08**|99.95 % of pass-minutes available|Availability is counted only when a satellite is<br>in contact, because that is when failure costs<br>the mission.|Pass-minutes with full service ÷<br>scheduled pass-minutes, per month.|



**Figma frame:** 1440 × 900 · app shell (sidebar 232, top bar 52) · content padding 24 · 12-column grid, 24 gutter · page Screens — Passes & ground · frame name S10 Ground stations / Default plus one frame per state. 

Akashaveda Space Technologies · Confidential · Page 43 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **S11 · Pass report** 



<!-- Start of picture text -->
5) ed (15:54:25 ur : Vikram shetty<br>; Paeereners GSR cnD IMs aces<br>. Provisional — backfill running. A report becomes Final only when every gap is backfilled or declared unrecoverable.<br>a<br>© HYD 15:16:23 - 15:27:23UTC 11. min —-<br>[ pane xm = an<br>sre 99 : = —_<br>ver 9440-9 549 110 HYD recording —- 0<br>.<br><!-- End of picture text -->

_Figure 26. S11 Pass report — default state_ 

|**Purpose**|Report card for a completed pass: data completeness, latency, gaps and commands.|
|---|---|
|**Route**|#/report|
|**Flow**|Passes & ground|
|**Roles**|Ground Station Engineer, Flight Engineer, Flight Director|
|**Modules**|Pass Orchestrator · Bulk Payload Pipeline · Frame Processor|
|**Data sources**|link.pass-reports.v1·payload.l0.ready.v1|
|**Constraints**|Q-06 · Q-01 · Q-03|



##### **FUNCTIONAL REQUIREMENTS** 

**FR-S11-01** The screen shall provide: Completeness score. 

**FR-S11-02** The screen shall provide: Frames expected vs received, duplicates merged. 

**FR-S11-03** The screen shall provide: Gap list with backfill status. 

**FR-S11-04** The screen shall provide: Latency percentiles. 

**FR-S11-05** The screen shall provide: Commands sent and verified. 

**FR-S11-06** The screen shall provide: Bulk payload deliveries. 

##### **STATES** 

|1|Provisional (backfill running)|
|---|---|
|2|Final|



##### **BUSINESS RULES** 

**BR-S11-01** A report becomes Final only when all gaps are backfilled or declared unrecoverable. 

Akashaveda Space Technologies · Confidential · Page 44 

VYUH-MCS Console · Software Requirements Specification v2.0 

##### **CONSTRAINTS AND ACCEPTANCE** 

|**ID**|**Target / rule**|**Meaning on this screen**|**Acceptance check**|
|---|---|---|---|
|**Q-06**|Zero data loss after receipt|Once a frame has reached our software it is<br>never lost, even if a server crashes.|Write-ahead spool before<br>acknowledgement, Kafka replication<br>factor 3, gap ledger and backfill from<br>station recordings.|
|**Q-01**|Telemetry within 100 ms from<br>receipt to screen (P99)|A value the spacecraft sends must be visible<br>to an operator almost instantly, so decisions<br>are made on current data.|Measured end to end from Link<br>Gateway receive timestamp to browser<br>render, P99 over each pass.|
|**Q-03**|Command release to CLTU within<br>150 ms (P99)|Once a command is approved it must be on<br>its way to the station quickly; pass time is<br>scarce.|Measured from release in Command<br>Service to CLTU handed to the station;<br>human approval time excluded.|



**Figma frame:** 1440 × 900 · app shell (sidebar 232, top bar 52) · content padding 24 · 12-column grid, 24 gutter · page Screens — Passes & ground · frame name S11 Pass report / Default plus one frame per state. 

Akashaveda Space Technologies · Confidential · Page 45 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **S12 · Command console** 



<!-- Start of picture text -->
5) ed (15:54:27 ur : Vikram shetty<br>@ Command console AKV-03 . > Uplink & COP-1<br>. Commands wre sure Safety gates<br>a<br>ae _ _aa Dycliomars vem<br>= iRy Battery heater recovery (alarm4 ed<br>[rceded pocket preview<br>2<br>aan m0-8K21, DUMP_START Vikram Shetty aL<br><!-- End of picture text -->

_Figure 27. S12 Command console — default state_ 

|**Purpose**|Build and send a single command through all safety gates.|
|---|---|
|**Route**|#/command|
|**Flow**|Commanding|
|**Roles**|Spacecraft Operator, Flight Director|
|**Modules**|Command Service · Policy (OPA) · Live Telemetry · TC Encoder|
|**Data sources**|GET /v1/mdb/commands·POST /v1/commands·cmd.status.v1|
|**Constraints**|Q-14 · Q-04 · Q-03 · C-03 · C-07 · P-01|



##### **FUNCTIONAL REQUIREMENTS** 

**FR-S12-01** The screen shall provide: Satellite and command search. 

**FR-S12-02** The screen shall provide: Typed parameter form with ranges and units. 

**FR-S12-03** The screen shall provide: Safety gate checklist (identity, dictionary, policy, second person, interlocks). 

**FR-S12-04** The screen shall provide: Encoded packet preview. 

**FR-S12-05** The screen shall provide: Send / Request approval button. 

**FR-S12-06** The screen shall provide: Recent commands with status. 

##### **STATES** 

|1|Draft|
|---|---|
|2|Invalid parameter|
|3|Interlock failed|
|4|Needs approval|
|5|Released|
|6|Accepted / Started / Completed|



Akashaveda Space Technologies · Confidential · Page 46 

VYUH-MCS Console · Software Requirements Specification v2.0 

7 Failed 

##### **BUSINESS RULES** 

**BR-S12-01** Critical commands require a second approver and passkey step-up. 

**BR-S12-02** Stale interlock telemetry fails closed. 

**BR-S12-03** Cancel has default focus in the confirmation dialog. 

##### **CONSTRAINTS AND ACCEPTANCE** 

|**ID**|**Target / rule**|**Meaning on this screen**|**Acceptance check**|
|---|---|---|---|
|**Q-14**|One stolen credential cannot<br>command a spacecraft|A single leaked password, token or laptop is<br>never enough to send a command.|Passkeys, step-up authentication, two-<br>person rule for critical commands, OPA<br>policy, signed request envelopes, HSM-<br>rooted keys.|
|**Q-04**|Zero duplicate or reordered<br>commands|Sending a command twice (e.g. "fire<br>thruster") or out of order can damage or lose<br>a spacecraft.|Structural guarantee: shard leases,<br>fencing epochs, idempotency keys,<br>COP-1 sequence control. Verified with<br>TLA+ models and chaos tests.|
|**Q-03**|Command release to CLTU within<br>150 ms (P99)|Once a command is approved it must be on<br>its way to the station quickly; pass time is<br>scarce.|Measured from release in Command<br>Service to CLTU handed to the station;<br>human approval time excluded.|
|**C-03**|XTCE dictionaries (with SCOS-2000<br>MIB import)|Telemetry and command definitions use the<br>standard XML format so they are portable<br>between tools.|Mission Database imports, validates and<br>compiles XTCE.|
|**C-07**|Every command attributable|For every command we can prove who<br>asked, who approved, what policy allowed it<br>and what happened.|Approvals in the command record; hash-<br>chained audit ledger anchored to<br>WORM storage.|
|**P-01**|Safety by structure, not convention|Unsafe actions are made impossible by<br>design, rather than relying on people<br>remembering rules.|Design review against the principle|



##### **ADDITIONAL STATES** 



<!-- Start of picture text -->
vyun 15:56:21 vs. Vikram shetty<br>Command console aKv03 . vplink & coP-1<br>es commands rm surren Safety gates<br>e<br>. Encoded packet preview<br>panance Proof for the auditor<br>ry ‘open platform health Mitra Shetty —<br><!-- End of picture text -->

_Figure 28. S12 — Command console after the story: recent commands with approver and epoch_ 

**Figma frame:** 1440 × 900 · app shell (sidebar 232, top bar 52) · content padding 24 · 12-column grid, 24 gutter · page Screens — Commanding · frame name S12 Command console / Default plus one frame per state. 

Akashaveda Space Technologies · Confidential · Page 47 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **S13 · Approvals** 



<!-- Start of picture text -->
see) (D 15:54:30 ure Z @ Vikram shetty<br>@ Approvals witch to Flight Directo<br>.<br>Pending<br>Fi<br>c<br>o<br>8<br>$ °<br>e<br><!-- End of picture text -->

_Figure 29. S13 Approvals — default state_ 

|**Purpose**|Second-person approval of critical commands and procedures.|
|---|---|
|**Route**|#/approvals|
|**Flow**|Commanding|
|**Roles**|Flight Director|
|**Modules**|Command Service · Identity (Keycloak) · Audit Ledger|
|**Data sources**|GET /v1/approvals?state=pending·POST /v1/approvals/{id} (step-up acr)|
|**Constraints**|Q-14 · C-07|



##### **FUNCTIONAL REQUIREMENTS** 

**FR-S13-01** The screen shall provide: Pending list with urgency and next LOS. 

**FR-S13-02** The screen shall provide: Request detail: who, what, why, parameters, interlock snapshot. 

**FR-S13-03** The screen shall provide: Approve with passkey / Reject with reason. 

##### **STATES** 

|1|Pending|
|---|---|
|2|Approved|
|3|Rejected|
|4|Expired|



##### **BUSINESS RULES** 

**BR-S13-01** The requester can never approve their own request. 

**BR-S13-02** Approval expires at the end of the pass window. 

##### **CONSTRAINTS AND ACCEPTANCE** 

|**ID**<br>**Target / rule**<br>**Meaning on this screen**<br>**Acceptance check**|
|---|



Akashaveda Space Technologies · Confidential · Page 48 

VYUH-MCS Console · Software Requirements Specification v2.0 



<!-- Start of picture text -->
ID Target / rule Meaning on this screen Acceptance check<br>C-07 Every command attributable For every command we can prove who  Approvals in the command record; hash-<br>asked, who approved, what policy allowed it  chained audit ledger anchored to<br>and what happened. WORM storage.<br><!-- End of picture text -->

##### **ADDITIONAL STATES** 



<!-- Start of picture text -->
vyuw 15:55:51 .<br>Approvals<br>feiect— @ Approve<br>with passe<br>eames .<br>Guided demo<br>3 ‘Second person approves<br>;<br>| ‘Second approval requested<br>P bed aaa | Role switched<br><!-- End of picture text -->



<!-- Start of picture text -->
Figure 30. S13 — Pending approval as Flight Director with live interlock snapshot<br><!-- End of picture text -->



<!-- Start of picture text -->
Confirm with passkey<br>@®<br><!-- End of picture text -->



<!-- Start of picture text -->
Figure 31. S13 — Passkey step-up confirmation<br><!-- End of picture text -->

**Figma frame:** 1440 × 900 · app shell (sidebar 232, top bar 52) · content padding 24 · 12-column grid, 24 gutter · page Screens — Commanding · frame name S13 Approvals / Default plus one frame per state. 

Akashaveda Space Technologies · Confidential · Page 49 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **S14 · Procedure runner** 



<!-- Start of picture text -->
spec (15:54:33 or Z @ Vikram shetty<br>@ PR-THM-004 Battery heater recovery Contin Step Breakpoin<br>a iv-03— assigned at start) (et) 0/9 — aod<br>steps Run log<br>@ switch heater A OFF am Demo controls<br>; Wait for PUS 1 completion report 5<br>Switch heater 8 ON (critical — second approver)<br>Duane aees Operator confirms temperaturetrend is rising —<br>w<br>=)<br>$ °<br>(2<br><!-- End of picture text -->

_Figure 32. S14 Procedure runner — default state_ 

|**Purpose**|Run a durable procedure step by step with waits, checks and operator decisions.|
|---|---|
|**Route**|#/procedure|
|**Flow**|Commanding|
|**Roles**|Spacecraft Operator, Flight Director|
|**Modules**|Procedure Engine · Command Service · Live Telemetry|
|**Data sources**|Temporal workflow state·procedure definitions (YAML PDL)·cmd.status.v1|
|**Constraints**|Q-04 · C-07 · P-01|



##### **FUNCTIONAL REQUIREMENTS** 

**FR-S14-01** The screen shall provide: Procedure header: name, version, satellite, run ID. 

**FR-S14-02** The screen shall provide: Mode: continuous / step / breakpoint. **FR-S14-03** The screen shall provide: Step list with status. **FR-S14-04** The screen shall provide: Current step detail with telemetry condition. **FR-S14-05** The screen shall provide: Controls: Start, Step, Pause, Abort. 

**FR-S14-06** The screen shall provide: Run log. 

##### **STATES** 

|1|Ready|
|---|---|
|2|Running|
|3|Waiting for condition|
|4|Waiting for operator|
|5|Waiting for approval|
|6|Paused at LOS|



Akashaveda Space Technologies · Confidential · Page 50 

VYUH-MCS Console · Software Requirements Specification v2.0 

|7|Completed|
|---|---|
|8|Aborted|



##### **BUSINESS RULES** 

**BR-S14-01** Every command step goes through Command Service gates. 

**BR-S14-02** A running procedure keeps its original version. 

##### **CONSTRAINTS AND ACCEPTANCE** 

|**ID**|**Target / rule**|**Meaning on this screen**|**Acceptance check**|
|---|---|---|---|
|**Q-04**|Zero duplicate or reordered<br>commands|Sending a command twice (e.g. "fire<br>thruster") or out of order can damage or lose<br>a spacecraft.|Structural guarantee: shard leases,<br>fencing epochs, idempotency keys,<br>COP-1 sequence control. Verified with<br>TLA+ models and chaos tests.|
|**C-07**|Every command attributable|For every command we can prove who<br>asked, who approved, what policy allowed it<br>and what happened.|Approvals in the command record; hash-<br>chained audit ledger anchored to<br>WORM storage.|
|**P-01**|Safety by structure, not convention|Unsafe actions are made impossible by<br>design, rather than relying on people<br>remembering rules.|Design review against the principle|



##### **ADDITIONAL STATES** 



<!-- Start of picture text -->
vvun 15:55:50 « . & Virom shetty<br>PR-THM-004 Battery heater recovery stinnous [Rap entpein<br>es pm zeeeen7-03 Ga He ae 0 rouse (\Glabor<br>steps un tog<br>Verify satelite in contacand ink locked seep 5:  HR SHIT HEATER<br>Switch heater8 ON (critical~ second approver) shep3 done: Switch heater A OF<br>3<br>Run the recovery procedure sng Senso<br>e<br>aaa | Sect soroatennte<br><!-- End of picture text -->

_Figure 33. S14 — Procedure waiting for second approval at step 5_ 

Akashaveda Space Technologies · Confidential · Page 51 

VYUH-MCS Console · Software Requirements Specification v2.0 



<!-- Start of picture text -->
yrun 15:56:12 w @& Vierom shetty<br>PR-THM-004 Battery heater recovery tinuous Step Breskpon<br>® steps un fog<br>beviachanintoad<br>3 Temperature recovers<br>Cy<br><!-- End of picture text -->

_Figure 34. S14 — Procedure completed with full run log_ 

**Figma frame:** 1440 × 900 · app shell (sidebar 232, top bar 52) · content padding 24 · 12-column grid, 24 gutter · page Screens — Commanding · frame name S14 Procedure runner / Default plus one frame per state. 

Akashaveda Space Technologies · Confidential · Page 52 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **S15 · Uplink & COP-1** 



<!-- Start of picture text -->
spec<br>(15:54:35or = @ Vikram shetty<br>@ Uplink & COP-1 aevos— v EEEESSERRY command con<br>;<br>FoP-1 state machine CLEW register<br>a<br>rn “ Nobitlock 0 ~FARMBcounter 3<br>Sliding window<br>SEE mous usa<br>> —<br>Queue Shard owner<br>$ ° . .<br>= 41<br><!-- End of picture text -->

_Figure 35. S15 Uplink & COP-1 — default state_ 

|**Purpose**|Command queue and COP-1 delivery state for each satellite.|
|---|---|
|**Route**|#/uplink|
|**Flow**|Commanding|
|**Roles**|Spacecraft Operator, Ground Station Engineer|
|**Modules**|Forward Link Engine · TC Encoder · Frame Processor|
|**Data sources**|tc.frame.status.v1·tm.clcw.v1·etcd shard ownership|
|**Constraints**|Q-04 · Q-05 · C-01|



##### **FUNCTIONAL REQUIREMENTS** 

**FR-S15-01** The screen shall provide: FOP-1 state machine (S1–S6) with current state. **FR-S15-02** The screen shall provide: CLCW register bits. **FR-S15-03** The screen shall provide: Sliding window V(S), NN(R). **FR-S15-04** The screen shall provide: Queue table. 

**FR-S15-05** The screen shall provide: Shard owner and fencing epoch. 

##### **STATES** 

|1|S1 Active|
|---|---|
|2|S2 Retransmit|
|3|S3 Retransmit wait|
|4|S4 Init no BC|
|5|S5 Init with BC|
|6|S6 Initial (operator needed)|



Akashaveda Space Technologies · Confidential · Page 53 

VYUH-MCS Console · Software Requirements Specification v2.0 

##### **BUSINESS RULES** 

**BR-S15-01** Lockout and wait bits are shown in red when set. 

**BR-S15-02** Owner hand-over is shown with the new epoch. 

##### **CONSTRAINTS AND ACCEPTANCE** 

|**ID**|**Target / rule**|**Meaning on this screen**|**Acceptance check**|
|---|---|---|---|
|**Q-04**|Zero duplicate or reordered<br>commands|Sending a command twice (e.g. "fire<br>thruster") or out of order can damage or lose<br>a spacecraft.|Structural guarantee: shard leases,<br>fencing epochs, idempotency keys,<br>COP-1 sequence control. Verified with<br>TLA+ models and chaos tests.|
|**Q-05**|CLCW feedback within 100 ms|The satellite's acknowledgement (CLCW)<br>must reach the uplink engine quickly so<br>retransmission decisions are right.|Measured from frame receipt to FOP-1<br>state update.|
|**C-01**|CCSDS TM / AOS / USLP / TC / COP-1<br>/ SDLS|We speak the international space-link<br>standards, so any standards-compliant<br>spacecraft and station works.|Rust codec library tested against CCSDS<br>reference vectors.|



##### **ADDITIONAL STATES** 



<!-- Start of picture text -->
vyun 15:55:57 : vs. Vikram shetty<br>Uplink & coP-1 -o -<br>Sates<br>Sliding window<br><!-- End of picture text -->

_Figure 36. S15 — Uplink after approval: V(S) advanced, command completed_ 

**Figma frame:** 1440 × 900 · app shell (sidebar 232, top bar 52) · content padding 24 · 12-column grid, 24 gutter · page Screens — Commanding · frame name S15 Uplink & COP-1 / Default plus one frame per state. 

Akashaveda Space Technologies · Confidential · Page 54 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **S16 · Procedure editor** 



<!-- Start of picture text -->
spec (15:54:38 or Z @ Vikram shetty<br>@ Procedure editor Pr-tTi"-004 - Battery heater recovery : a<br>a orate<br>= Command palette procedures/thermal/pr-thm-004.yaml<br>- satellite class: akv-adb 4.18.0<br>ry kind: check<br>kind: check<br>e Validation results Simulator test run<br>$ °<br>(2<br><!-- End of picture text -->

_Figure 37. S16 Procedure editor — default state_ 

|**Purpose**|Author and validate procedures as reviewed, versioned definitions.|
|---|---|
|**Route**|#/editor|
|**Flow**|Commanding|
|**Roles**|Flight Engineer|
|**Modules**|Procedure Engine · Mission Database · Spacecraft Simulator|
|**Data sources**|Git-backed procedure repository·dictionary validation API|
|**Constraints**|C-03 · C-07|



##### **FUNCTIONAL REQUIREMENTS** 

**FR-S16-01** The screen shall provide: YAML editor with line numbers. **FR-S16-02** The screen shall provide: Command palette from dictionary. **FR-S16-03** The screen shall provide: Validation results. 

**FR-S16-04** The screen shall provide: Simulator test run. 

**FR-S16-05** The screen shall provide: Submit for review. 

##### **STATES** 

|1|Draft|
|---|---|
|2|Validation errors|
|3|Test run passed|
|4|In review|
|5|Released|



##### **BUSINESS RULES** 

**BR-S16-01** A procedure cannot be released without a passing simulator run and one reviewer. 

Akashaveda Space Technologies · Confidential · Page 55 

VYUH-MCS Console · Software Requirements Specification v2.0 

##### **CONSTRAINTS AND ACCEPTANCE** 

|**ID**|**Target / rule**|**Meaning on this screen**|**Acceptance check**|
|---|---|---|---|
|**C-03**|XTCE dictionaries (with SCOS-2000<br>MIB import)|Telemetry and command definitions use the<br>standard XML format so they are portable<br>between tools.|Mission Database imports, validates and<br>compiles XTCE.|
|**C-07**|Every command attributable|For every command we can prove who<br>asked, who approved, what policy allowed it|Approvals in the command record; hash-<br>chained audit ledger anchored to|
|||and what happened.|WORM storage.|



**Figma frame:** 1440 × 900 · app shell (sidebar 232, top bar 52) · content padding 24 · 12-column grid, 24 gutter · page Screens — Commanding · frame name S16 Procedure editor / Default plus one frame per state. 

Akashaveda Space Technologies · Confidential · Page 56 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **S17 · Mission plan** 



<!-- Start of picture text -->
see) (15:54:41 un = @ Vikram shetty<br>@ Mission plan ve plan<br>a P-2026-261 - 29 - 1<br>Plan timeline imaging @ Downink @ Maintenance © Reserved<br>iz axv-01<br>i. axv-02<br>- axv-03<br>axv-0s<br>axv-08<br>axv-07 =<br>Pane eee woi-02<br>[1 tesion pan ven-02<br>=)<br>Resource tracks Solver result<br>$ °<br><!-- End of picture text -->

_Figure 38. S17 Mission plan — default state_ 

|**Purpose**|Optimised plan of imaging, downlinks and maintenance that respects every resource rule.|
|---|---|
|**Route**|#/plan|
|**Flow**|Planning & mission data|
|**Roles**|Mission Planner|
|**Modules**|Planning & Scheduling · Health Forecasting · GS Resource Manager|
|**Data sources**|POST /v1/plans:solve (CP-SAT)·gs.bookings.v1·ai.forecasts.v1|
|**Constraints**|C-04 · Q-12|



##### **FUNCTIONAL REQUIREMENTS** 

**FR-S17-01** The screen shall provide: Plan timeline by satellite. 

**FR-S17-02** The screen shall provide: Storage and power resource tracks. 

**FR-S17-03** The screen shall provide: Requests queue with priority. 

**FR-S17-04** The screen shall provide: Solver result: score, unscheduled requests with reason. 

**FR-S17-05** The screen shall provide: Approve plan. 

##### **STATES** 

|1|Draft|
|---|---|
|2|Solving|
|3|Solved|
|4|Conflict|
|5|Approved|
|6|Uplinked as PUS 11 schedule|



Akashaveda Space Technologies · Confidential · Page 57 

VYUH-MCS Console · Software Requirements Specification v2.0 

##### **BUSINESS RULES** 

**BR-S17-01** Re-planning applies stability penalties so approved activities move as little as possible. 

##### **CONSTRAINTS AND ACCEPTANCE** 

|**ID**|**Target / rule**|**Meaning on this screen**|**Acceptance check**|
|---|---|---|---|
|**C-04**|PUS services 1, 3, 5, 11|Standard on-board services: request<br>verification (1), housekeeping (3), events (5)<br>and time-based scheduling (11).|PUS codecs in TM Processor and TC<br>Encoder.|
|**Q-12**|Scale from 5 to 500 satellites<br>without a rewrite|The design must grow with the constellation<br>by adding capacity, not rebuilding.|Everything is partitioned by<br>tenant:satellite; load tests at 500-<br>satellite rates.|



**Figma frame:** 1440 × 900 · app shell (sidebar 232, top bar 52) · content padding 24 · 12-column grid, 24 gutter · page Screens — Planning & mission data · frame name S17 Mission plan / Default plus one frame per state. 

Akashaveda Space Technologies · Confidential · Page 58 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **S18 · Payload deliveries** 



<!-- Start of picture text -->
see) 15:54:43 or = @ Vikram shetty<br>@ Payload deliveries Al Receiving Lo ready Failed<br>.<br>a 314314 MbpsMbps 6 3 11<br>Throughput<br>Lanne & DATA Download sessions<br>[ € rayoed deliveries s-26261-014 #0 1e4ca 1123_ Manifest<br>a poe<br>< © rs.zs81-012 se 22068 2290 oar<br>s-26261-011 sm 14ice 1410<br><!-- End of picture text -->

_Figure 39. S18 Payload deliveries — default state_ 

|**Purpose**|Track bulk payload downloads from chunks to L0 products and customer delivery.|
|---|---|
|**Route**|#/payload|
|**Flow**|Planning & mission data|
|**Roles**|Mission Planner, Customer User|
|**Modules**|Bulk Payload Pipeline · Customer API|
|**Data sources**|bulk.chunks.v1·payload.l0.ready.v1·object storage manifests|
|**Constraints**|Q-06 · C-06|



##### **FUNCTIONAL REQUIREMENTS** 

**FR-S18-01** The screen shall provide: Throughput chart (Mbps). 

**FR-S18-02** The screen shall provide: Session table: satellite, station, size, chunks, checksum, status. 

**FR-S18-03** The screen shall provide: Product detail with manifest. 

##### **STATES** 

|1|Receiving|
|---|---|
|2|Merging stations|
|3|L0 ready|
|4|Delivered|
|5|Checksum failed|



##### **BUSINESS RULES** 

**BR-S18-01** Payload never travels through Kafka; only claim-check events do. 

##### **CONSTRAINTS AND ACCEPTANCE** 

|**ID**<br>**Target / rule**<br>**Meaning on this screen**<br>**Acceptance check**|
|---|



Akashaveda Space Technologies · Confidential · Page 59 

VYUH-MCS Console · Software Requirements Specification v2.0 

|**ID**|**Target / rule**|**Meaning on this screen**|**Acceptance check**|
|---|---|---|---|
|**C-06**|Sovereign data and tenant isolation|Mission data stays in the agreed<br>country/region and one customer never sees<br>another's data.|Tenant in every key, PostgreSQL row-<br>level security, in-region AI inference.|



**Figma frame:** 1440 × 900 · app shell (sidebar 232, top bar 52) · content padding 24 · 12-column grid, 24 gutter · page Screens — Planning & mission data · frame name S18 Payload deliveries / Default plus one frame per state. 

Akashaveda Space Technologies · Confidential · Page 60 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **S19 · Mission database** 



<!-- Start of picture text -->
see) (15:54:46 vn = @ Vikram shetty<br>@ Mission database a<br>a Releases akv-mdb 4.19.0 ie Rev<br>aky-ndb 4.19.0 ——————<br>asses & caouno ahv-ndb 4.18.0 Semantic diff<br>a abh-db 2.3.1<br>xr_TewP<br>akv-ndb 4.37.2<br>c akv-ndb 4.20.0 - wR p.pury z<br>vam erred true :<br>[: Reviewers Effective time per satellite<br>¢ C) Qn" sav-02<br><!-- End of picture text -->

_Figure 40. S19 Mission database — default state_ 

|**Purpose**|Review, verify and release dictionary changes like software.|
|---|---|
|**Route**|#/mdb|
|**Flow**|Planning & mission data|
|**Roles**|Mission Database Engineer, Flight Engineer|
|**Modules**|Mission Database · Spacecraft Simulator|
|**Data sources**|XTCE Git repository·mdb.releases.v1·signed FlatBuffers bundles|
|**Constraints**|C-03 · C-07 · P-06|



##### **FUNCTIONAL REQUIREMENTS** 

**FR-S19-01** The screen shall provide: Release pipeline: change → review → compile → sign → simulator verify → release. **FR-S19-02** The screen shall provide: Semantic diff table. 

**FR-S19-03** The screen shall provide: Reviewers and approvals. 

**FR-S19-04** The screen shall provide: Effective time per satellite. 

**FR-S19-05** The screen shall provide: Rollback. 

##### **STATES** 

|1|Draft|
|---|---|
|2|In review|
|3|Verified|
|4|Scheduled|
|5|Active|
|6|Rolled back|



Akashaveda Space Technologies · Confidential · Page 61 

VYUH-MCS Console · Software Requirements Specification v2.0 

##### **BUSINESS RULES** 

##### **BR-S19-01** Two reviewers are required. 

**BR-S19-02** Every telemetry sample records the bundle version. 

##### **CONSTRAINTS AND ACCEPTANCE** 

|**ID**|**Target / rule**|**Meaning on this screen**|**Acceptance check**|
|---|---|---|---|
|**C-03**|XTCE dictionaries (with SCOS-2000<br>MIB import)|Telemetry and command definitions use the<br>standard XML format so they are portable<br>between tools.|Mission Database imports, validates and<br>compiles XTCE.|
|**C-07**|Every command attributable|For every command we can prove who<br>asked, who approved, what policy allowed it<br>and what happened.|Approvals in the command record; hash-<br>chained audit ledger anchored to<br>WORM storage.|
|**P-06**|Compile configuration, don't query<br>it|Dictionaries are compiled into fast in-<br>memory tables instead of being looked up at<br>run time.|Design review against the principle|



**Figma frame:** 1440 × 900 · app shell (sidebar 232, top bar 52) · content padding 24 · 12-column grid, 24 gutter · page Screens — Planning & mission data · frame name S19 Mission database / Default plus one frame per state. 

Akashaveda Space Technologies · Confidential · Page 62 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **S20 · Anomaly advisories** 



<!-- Start of picture text -->
> YUH a) EE = @ Vikram shetty<br>@ Anomaly advisories ‘All New Confirmed Dismissed<br>Advisory feed oon 7 X Dismiss Y Confirm<br>ow-01 . I<br>=)<br>wereuuicence ‘op contributing parameters Mode!<br>[& anomaly advisories @ oe Se et<br><!-- End of picture text -->

_Figure 41. S20 Anomaly advisories — default state_ 

|**Purpose**|AI advisories with evidence for people to confirm or dismiss.|
|---|---|
|**Route**|#/anomalies|
|**Flow**|Intelligence|
|**Roles**|Spacecraft Operator, Flight Engineer, ML Engineer|
|**Modules**|Anomaly Detection · Events & Alarms · ML Platform|
|**Data sources**|ai.anomalies.v1·POST /v1/anomalies/{id}/feedback|
|**Constraints**|Q-07 · P-01|



##### **FUNCTIONAL REQUIREMENTS** 

**FR-S20-01** The screen shall provide: Advisory feed with tier (T1–T4), score and satellite. 

**FR-S20-02** The screen shall provide: Evidence chart with expected band. **FR-S20-03** The screen shall provide: Top contributing parameters. **FR-S20-04** The screen shall provide: Confirm / Dismiss feedback. 

**FR-S20-05** The screen shall provide: Satellite x subsystem heatmap. 

##### **STATES** 

|1|New|
|---|---|
|2|Confirmed|
|3|Dismissed|
|4|Linked to alarm|



##### **BUSINESS RULES** 

**BR-S20-01** Advisories never raise CRITICAL alarms on their own. 

**BR-S20-02** Feedback becomes training labels. 

Akashaveda Space Technologies · Confidential · Page 63 

VYUH-MCS Console · Software Requirements Specification v2.0 

##### **CONSTRAINTS AND ACCEPTANCE** 

|**ID**|**Target / rule**|**Meaning on this screen**|**Acceptance check**|
|---|---|---|---|
|**Q-07**|Anomaly advisory within 5 s<br>(point) / 60 s (multivariate)|AI warnings must arrive while they are still<br>useful during a pass.|Measured from sample receipt to<br>advisory visible in Events & Alarms.|
|**P-01**|Safety by structure, not convention|Unsafe actions are made impossible by<br>design, rather than relying on people<br>remembering rules.|Design review against the principle|



##### **ADDITIONAL STATES** 



<!-- Start of picture text -->
vyun 15:55:31 : vs. Vikram shetty<br>Anomaly advisories Ai Won | conte em<br>7 ‘The Al notices first<br>—<br><!-- End of picture text -->

_Figure 42. S20 — Advisory AN-401 with evidence chart leaving the expected band_ 

**Figma frame:** 1440 × 900 · app shell (sidebar 232, top bar 52) · content padding 24 · 12-column grid, 24 gutter · page Screens — Intelligence · frame name S20 Anomaly advisories / Default plus one frame per state. 

Akashaveda Space Technologies · Confidential · Page 64 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **S21 · Health forecast** 



<!-- Start of picture text -->
> vvuH (ay See . Vikram shetty<br>@ Health forecast AKV-03 ¥ Open aKv-o3<br>Fl<br>(1s 2.3y 84.3 nf-battery-opr 1.8.6<br>Capacity retention - AKV-03 Contributing factors<br>. 5 Planning recommendation<br>No action needed for ss-02 battery<br>Eatiest threshold crossing in the 90 %<br>——— 4 interval is 2.6 y from today. Review at next<br>w nightly run,<br>=)<br>¢ °<br><!-- End of picture text -->

_Figure 43. S21 Health forecast — default state_ 

|**Purpose**|Remaining useful life and degradation forecasts per component.|
|---|---|
|**Route**|#/forecast|
|**Flow**|Intelligence|
|**Roles**|Flight Engineer, Mission Planner|
|**Modules**|Health Forecasting · ML Platform|
|**Data sources**|ai.forecasts.v1 (nightly)|
|**Constraints**|Q-12 · C-06|



##### **FUNCTIONAL REQUIREMENTS** 

**FR-S21-01** The screen shall provide: Component tabs: battery, reaction wheels, solar array, propulsion. 

**FR-S21-02** The screen shall provide: Health score gauge. **FR-S21-03** The screen shall provide: RUL with 90 % interval. 

**FR-S21-04** The screen shall provide: Forecast chart with confidence band and threshold. 

**FR-S21-05** The screen shall provide: Planning recommendation. 

##### **STATES** 

|1|Current|
|---|---|
|2|Forecast outdated|
|3|Model in shadow|



##### **BUSINESS RULES** 

**BR-S21-01** Forecasts always show their uncertainty interval. 

Akashaveda Space Technologies · Confidential · Page 65 

VYUH-MCS Console · Software Requirements Specification v2.0 

##### **CONSTRAINTS AND ACCEPTANCE** 

|**ID**|**Target / rule**|**Meaning on this screen**|**Acceptance check**|
|---|---|---|---|
|**Q-12**|Scale from 5 to 500 satellites<br>without a rewrite|The design must grow with the constellation<br>by adding capacity, not rebuilding.|Everything is partitioned by<br>tenant:satellite; load tests at 500-<br>satellite rates.|
|**C-06**|Sovereign data and tenant isolation|Mission data stays in the agreed<br>country/region and one customer never sees<br>another's data.|Tenant in every key, PostgreSQL row-<br>level security, in-region AI inference.|



**Figma frame:** 1440 × 900 · app shell (sidebar 232, top bar 52) · content padding 24 · 12-column grid, 24 gutter · page Screens — Intelligence · frame name S21 Health forecast / Default plus one frame per state. 

Akashaveda Space Technologies · Confidential · Page 66 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **S22 · Ops Copilot** 



<!-- Start of picture text -->
see) (15:54:54 un = @ Vikram shetty<br>6 Ops Copilot<br>; conversation Read-onlb y design. The copilothas no<br>epi 2 Sources indexed<br>a Procedures (POL) a<br>c<br>o Drafts for review<br>7 PassE report note - AKV-03 heater A<br>$ ° z<br>C2<br><!-- End of picture text -->

_Figure 44. S22 Ops Copilot — default state_ 

|**Purpose**|Ask questions about procedures, manuals and pass reports; answers cite sources.|
|---|---|
|**Route**|#/copilot|
|**Flow**|Intelligence|
|**Roles**|All operational roles|
|**Modules**|Ops Copilot · Operator BFF|
|**Data sources**|POST /v1/copilot/ask (vLLM in-region)·pgvector document index|
|**Constraints**|Q-14 · C-06 · P-01|



##### **FUNCTIONAL REQUIREMENTS** 

**FR-S22-01** The screen shall provide: Conversation. 

**FR-S22-02** The screen shall provide: Citations with document and section. 

**FR-S22-03** The screen shall provide: Suggested questions. 

**FR-S22-04** The screen shall provide: Read-only notice. 

**FR-S22-05** The screen shall provide: Draft-for-review output. 

##### **STATES** 

|1|Idle|
|---|---|
|2|Thinking|
|3|Answer with citations|
|4|Refused (no source)|



##### **BUSINESS RULES** 

**BR-S22-01** The copilot cannot send commands; it can only draft for human review. 

**BR-S22-02** Answers without a source are refused. 

Akashaveda Space Technologies · Confidential · Page 67 

VYUH-MCS Console · Software Requirements Specification v2.0 

##### **CONSTRAINTS AND ACCEPTANCE** 

|**ID**|**Target / rule**|**Meaning on this screen**|**Acceptance check**|
|---|---|---|---|
|**Q-14**|One stolen credential cannot<br>command a spacecraft|A single leaked password, token or laptop is<br>never enough to send a command.|Passkeys, step-up authentication, two-<br>person rule for critical commands, OPA<br>policy, signed request envelopes, HSM-<br>rooted keys.|
|**C-06**|Sovereign data and tenant isolation|Mission data stays in the agreed<br>country/region and one customer never sees<br>another's data.|Tenant in every key, PostgreSQL row-<br>level security, in-region AI inference.|
|**P-01**|Safety by structure, not convention|Unsafe actions are made impossible by<br>design, rather than relying on people<br>remembering rules.|Design review against the principle|



##### **ADDITIONAL STATES** 



<!-- Start of picture text -->
vyun 15:55:42 . Vira shetty<br>Ops Copilot<br>3 Ask the copilot<br>e :<br>cpap rae<br><!-- End of picture text -->



<!-- Start of picture text -->
Figure 45. S22 — Copilot answer with citations and link to the procedure<br><!-- End of picture text -->

**Figma frame:** 1440 × 900 · app shell (sidebar 232, top bar 52) · content padding 24 · 12-column grid, 24 gutter · page Screens — Intelligence · frame name S22 Ops Copilot / Default plus one frame per state. 

Akashaveda Space Technologies · Confidential · Page 68 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **S23 · Simulator** 



<!-- Start of picture text -->
‘SIMULATION — SIMULATED SATELLITES ONLY - COMMANDS NEVER REACH A LIVE LINK<br>> VyUH (15:54:57 ur ° i Vikram shetty<br>Simulator Reset D Rum scenario<br>Policy. OPA forbids routing simulated<br>a commands t live links. Commands from this workspacecarry env-sim and the Link Gateway rejects themon any lve station.<br>t Scenario catalogue Battery heater failure and recovery<br>~~ earsReaction wheel stuck, safe mode entry stn-01: sim-02 smn-03 stH-04:<br>} sc-um-02 , : :<br>nea Link dropout mid-pass with COPA<br>5 $ Fault injection Event log<br>sc-mo0-19akvmdb4.19.0 regression pack HeaterA failure<br>Reaction wheel stuck<br>o. . Link dropout<br>3 LEW lockout<br>¢ e ‘Test verdicts<br>& .<br><!-- End of picture text -->

_Figure 46. S23 Simulator — default state_ 

|**Purpose**|Run scenarios against simulated satellites for verification and training.|
|---|---|
|**Route**|#/simulator|
|**Flow**|Simulation & customers|
|**Roles**|Flight Engineer, Spacecraft Operator|
|**Modules**|Spacecraft Simulator · Link Gateway|
|**Data sources**|sim.* topics·scenario catalogue|
|**Constraints**|C-01 · Q-12 · P-01|



##### **FUNCTIONAL REQUIREMENTS** 

**FR-S23-01** The screen shall provide: Permanent SIMULATION banner (violet). **FR-S23-02** The screen shall provide: Scenario list. **FR-S23-03** The screen shall provide: Fault injection controls. **FR-S23-04** The screen shall provide: Simulated fleet status. 

**FR-S23-05** The screen shall provide: Test verdicts. 

##### **STATES** 

|1|Idle|
|---|---|
|2|Running|
|3|Fault injected|
|4|Verdict passed / failed|



##### **BUSINESS RULES** 

**BR-S23-01** Policy forbids routing simulated commands to a live link. 

Akashaveda Space Technologies · Confidential · Page 69 

VYUH-MCS Console · Software Requirements Specification v2.0 

##### **CONSTRAINTS AND ACCEPTANCE** 

|**ID**|**Target / rule**|**Meaning on this screen**|**Acceptance check**|
|---|---|---|---|
|**C-01**|CCSDS TM / AOS / USLP / TC / COP-1<br>/ SDLS|We speak the international space-link<br>standards, so any standards-compliant<br>spacecraft and station works.|Rust codec library tested against CCSDS<br>reference vectors.|
|**Q-12**|Scale from 5 to 500 satellites<br>without a rewrite|The design must grow with the constellation<br>by adding capacity, not rebuilding.|Everything is partitioned by<br>tenant:satellite; load tests at 500-<br>satellite rates.|
|**P-01**|Safety by structure, not convention|Unsafe actions are made impossible by<br>design, rather than relying on people<br>remembering rules.|Design review against the principle|



**Figma frame:** 1440 × 900 · app shell (sidebar 232, top bar 52) · content padding 24 · 12-column grid, 24 gutter · page Screens — Simulation & customers · frame name S23 Simulator / Default plus one frame per state. 

Akashaveda Space Technologies · Confidential · Page 70 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **S24 · Customer portal** 



<!-- Start of picture text -->
see) (15:54:59 on = @ Vikram shetty<br>6 Nabhas Agritech medancetan<br>a<br>8 NoH-01 noH-02 Upcoming passes<br>o-01 16:32<br>81% 82% an-02 17:05<br>a 5 = na-02 17:58<br>n-02 19.19<br>sumawoin New tasking request Deliveries<br>Submit request<br>a neoue: Anta eure ACUISITION are API keys and webhooks<br>1.5526 Ludhiana wheat Novi va-02<br>J<br>7<br>$ ° taskingsurite productsirend<br><!-- End of picture text -->

_Figure 47. S24 Customer portal — default state_ 

|**Purpose**|Tenant-scoped view for customers: their satellites, passes, deliveries and tasking requests.|
|---|---|
|**Route**|#/customer|
|**Flow**|Simulation & customers|
|**Roles**|Customer User|
|**Modules**|Customer API · Planning & Scheduling · Bulk Payload Pipeline|
|**Data sources**|Customer API (OAuth client credentials, webhooks)|
|**Constraints**|C-06 · Q-14|



##### **FUNCTIONAL REQUIREMENTS** 

**FR-S24-01** The screen shall provide: Tenant header. 

**FR-S24-02** The screen shall provide: My satellites status. 

**FR-S24-03** The screen shall provide: Upcoming passes. 

**FR-S24-04** The screen shall provide: Deliveries. **FR-S24-05** The screen shall provide: New tasking request form. 

**FR-S24-06** The screen shall provide: API keys and webhooks. 

##### **STATES** 

|1|Default|
|---|---|
|2|Request submitted|
|3|Request scheduled|



##### **BUSINESS RULES** 

**BR-S24-01** No command endpoints by default. 

**BR-S24-02** Only the tenant's own data is visible. 

Akashaveda Space Technologies · Confidential · Page 71 

VYUH-MCS Console · Software Requirements Specification v2.0 

##### **CONSTRAINTS AND ACCEPTANCE** 

|**ID**|**Target / rule**|**Meaning on this screen**|**Acceptance check**|
|---|---|---|---|
|**C-06**|Sovereign data and tenant isolation|Mission data stays in the agreed<br>country/region and one customer never sees<br>another's data.|Tenant in every key, PostgreSQL row-<br>level security, in-region AI inference.|
|**Q-14**|One stolen credential cannot<br>command a spacecraft|A single leaked password, token or laptop is<br>never enough to send a command.|Passkeys, step-up authentication, two-<br>person rule for critical commands, OPA<br>policy, signed request envelopes, HSM-<br>rooted keys.|



**Figma frame:** 1440 × 900 · app shell (sidebar 232, top bar 52) · content padding 24 · 12-column grid, 24 gutter · page Screens — Simulation & customers · frame name S24 Customer portal / Default plus one frame per state. 

Akashaveda Space Technologies · Confidential · Page 72 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **S25 · Users & access** 



<!-- Start of picture text -->
see) (15:55:02 vr 9 @ Vikram shetty<br>@ Users & access a<br>a<br>~ 8 ul 1 oO<br>Users<br>i. Ananya Rao<br>canara’ Vikram Shetty<br>Meera tyer<br>Karan Malhotra 1<br>Farah Siddiqui<br>a Rohit Nair<br>> Leena Joseph ><br>¢ ° mate<br>& Priya Nabhas<br><!-- End of picture text -->

_Figure 48. S25 Users & access — default state_ 

|**Purpose**|Manage users, roles, satellite scopes and two-person rules.|
|---|---|
|**Route**|#/users|
|**Flow**|Governance & platform|
|**Roles**|Security Officer, Platform Administrator|
|**Modules**|Identity (Keycloak) · Policy (OPA)|
|**Data sources**|Keycloak admin API (via BFF)·OPA bundle metadata|
|**Constraints**|Q-14 · C-06|



##### **FUNCTIONAL REQUIREMENTS** 

**FR-S25-01** The screen shall provide: User table: name, roles, scope, passkeys, last sign-in, status. 

**FR-S25-02** The screen shall provide: User drawer: role assignments, sessions, revoke. 

**FR-S25-03** The screen shall provide: Policy bundle version. 

##### **STATES** 

|1|Active|
|---|---|
|2|Invited|
|3|Suspended|



##### **BUSINESS RULES** 

**BR-S25-01** Role changes for commanding roles require a second administrator. 

Akashaveda Space Technologies · Confidential · Page 73 

VYUH-MCS Console · Software Requirements Specification v2.0 

##### **CONSTRAINTS AND ACCEPTANCE** 

|**ID**|**Target / rule**|**Meaning on this screen**|**Acceptance check**|
|---|---|---|---|
|**Q-14**|One stolen credential cannot<br>command a spacecraft|A single leaked password, token or laptop is<br>never enough to send a command.|Passkeys, step-up authentication, two-<br>person rule for critical commands, OPA<br>policy, signed request envelopes, HSM-<br>rooted keys.|
|**C-06**|Sovereign data and tenant isolation|Mission data stays in the agreed<br>country/region and one customer never sees<br>another's data.|Tenant in every key, PostgreSQL row-<br>level security, in-region AI inference.|



**Figma frame:** 1440 × 900 · app shell (sidebar 232, top bar 52) · content padding 24 · 12-column grid, 24 gutter · page Screens — Governance & platform · frame name S25 Users & access / Default plus one frame per state. 

Akashaveda Space Technologies · Confidential · Page 74 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **S26 · Audit ledger** 



<!-- Start of picture text -->
spec (15:55:04 vr = @ Vikram shetty<br>@ Audit ledger Export @ Verify chain<br>a v<br>Integrity SIEM export<br>R 44012 - wordt 53 object tock<br>Records<br>=)<br>$ °<br><!-- End of picture text -->

_Figure 49. S26 Audit ledger — default state_ 

|**Purpose**|Tamper-evident record of every command, approval and policy decision.|
|---|---|
|**Route**|#/audit|
|**Flow**|Governance & platform|
|**Roles**|Security Officer, Flight Director|
|**Modules**|Audit Ledger|
|**Data sources**|audit.records.v1·GET /v1/audit/verify·WORM anchors|
|**Constraints**|C-07 · Q-14|



##### **FUNCTIONAL REQUIREMENTS** 

**FR-S26-01** The screen shall provide: Filter bar. 

**FR-S26-02** The screen shall provide: Append-only table with hash preview. 

**FR-S26-03** The screen shall provide: Record detail: full chain link. **FR-S26-04** The screen shall provide: Verify chain action with anchor result. 

**FR-S26-05** The screen shall provide: SIEM export status. 

##### **STATES** 

|1|Chain verified|
|---|---|
|2|Verification running|
|3|Break detected|



##### **BUSINESS RULES** 

**BR-S26-01** Records are read-only. 

**BR-S26-02** Exports require a bounded date range. 

Akashaveda Space Technologies · Confidential · Page 75 

VYUH-MCS Console · Software Requirements Specification v2.0 

##### **CONSTRAINTS AND ACCEPTANCE** 

|**ID**|**Target / rule**|**Meaning on this screen**|**Acceptance check**|
|---|---|---|---|
|**C-07**|Every command attributable|For every command we can prove who<br>asked, who approved, what policy allowed it<br>and what happened.|Approvals in the command record; hash-<br>chained audit ledger anchored to<br>WORM storage.|
|**Q-14**|One stolen credential cannot<br>command a spacecraft|A single leaked password, token or laptop is<br>never enough to send a command.|Passkeys, step-up authentication, two-<br>person rule for critical commands, OPA<br>policy, signed request envelopes, HSM-<br>rooted keys.|



##### **ADDITIONAL STATES** 



<!-- Start of picture text -->
vyun 15:56:19 vs. Vikram shetty<br>Audit ledger cxcor (iB eaiyeha<br>°<br>. 7 Proof for the auditor SET_HTR_SETPOINT HEATER=B SETPOINT=15<br>a ‘Open platform health HTR_SWITCH approved (step-up passkey. acr- porctecies<br><!-- End of picture text -->

_Figure 50. S26 — Chain verified against WORM anchor_ 

**Figma frame:** 1440 × 900 · app shell (sidebar 232, top bar 52) · content padding 24 · 12-column grid, 24 gutter · page Screens — Governance & platform · frame name S26 Audit ledger / Default plus one frame per state. 

Akashaveda Space Technologies · Confidential · Page 76 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **S27 · Platform health** 



<!-- Start of picture text -->
> YUH fe) SLEtEe = @ Vikram shetty<br>@ Platform health All domains ¥ 2 Zone failover drill<br>2 71 ms 0.42s 138 ms 99.962 % 2.31s<br>Services Kafka consumer lag<br>eo Pace Orchestrator Link Gateway Frame Processor x8<br>| 1m processor Live Telemetry | ‘Tm archive & Query<br>Zones and DR<br>:<br>=)<br>sp-south-1a<br>¢ ° Shes Procedure Engine Te Encoder ere<br>Koy Management ap-sosth-1c<br><!-- End of picture text -->

_Figure 51. S27 Platform health — default state_ 

|**Purpose**|Health of all 31 modules, Kafka, data stores and SLOs.|
|---|---|
|**Route**|#/platform|
|**Flow**|Governance & platform|
|**Roles**|Platform Administrator, Flight Director|
|**Modules**|All services · Observability (LGTM)|
|**Data sources**|Prometheus / Mimir SLO queries·Kafka consumer lag·Argo CD sync status|
|**Constraints**|Q-08 · Q-10 · Q-11 · Q-15|



##### **FUNCTIONAL REQUIREMENTS** 

**FR-S27-01** The screen shall provide: SLO tiles with error budget. **FR-S27-02** The screen shall provide: Service grid by domain. **FR-S27-03** The screen shall provide: Kafka lag by consumer group. **FR-S27-04** The screen shall provide: Zones and DR region status. 

**FR-S27-05** The screen shall provide: Deploy freeze indicator. 

##### **STATES** 

|1|Healthy|
|---|---|
|2|Degraded|
|3|Zone failover|
|4|Deploy frozen (pass in progress)|



##### **BUSINESS RULES** 

**BR-S27-01** A red SLO links to its runbook. 

Akashaveda Space Technologies · Confidential · Page 77 

VYUH-MCS Console · Software Requirements Specification v2.0 

##### **CONSTRAINTS AND ACCEPTANCE** 

|**ID**|**Target / rule**|**Meaning on this screen**|**Acceptance check**|
|---|---|---|---|
|**Q-08**|99.95 % of pass-minutes available|Availability is counted only when a satellite is<br>in contact, because that is when failure costs<br>the mission.|Pass-minutes with full service ÷<br>scheduled pass-minutes, per month.|
|**Q-10**|Zone loss: no pass gap longer than<br>30 s|A whole data-centre zone can fail and a pass<br>in progress continues after a short hiccup.|Chaos test: kill one availability zone mid-<br>pass; measure the telemetry gap.|
|**Q-11**|Region disaster: RTO 15 min, RPO 1<br>min (0 for commands and audit)|If the whole region is lost, operations resume<br>in the standby region within 15 minutes,<br>losing at most one minute of non-critical<br>data.|Quarterly DR rehearsal; command and<br>audit data use synchronous replication.|
|**Q-15**|No critical deployments during a<br>pass|Software updates never interrupt a live<br>contact.|Argo CD sync windows are generated<br>from the pass calendar published by<br>Pass Orchestrator.|



**Figma frame:** 1440 × 900 · app shell (sidebar 232, top bar 52) · content padding 24 · 12-column grid, 24 gutter · page Screens — Governance & platform · frame name S27 Platform health / Default plus one frame per state. 

Akashaveda Space Technologies · Confidential · Page 78 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **S28 · Notifications & on-call** 



<!-- Start of picture text -->
spec (15:55:20 vr = @ Vikram shetty<br>@ Notifications & on-call Orestes<br>;a Primary Secondary Flight Director<br>8 yg, Vikram shetty fay Meera tyer am Ananya Rao<br>Routing rules Escalation policy<br>eo<br>- CRITICAL alarm Primary on-call Simin Page secondary on-call<br>WARNING alarm Primary on-call 15min) Escalateto Flight Director<br>Critical command awaiting ae<br>approval<br>Al advisory score = 0.9 sops-akv channel<br>es<br>SLO burn rate > 10x Platform on-call<br>Customer dalivery fallad Cat<br>=)<br>swreuucenee Delivery log<br>wf e All Delivered Retrying escalated Acknowledge<br><!-- End of picture text -->

_Figure 52. S28 Notifications & on-call — default state_ 

|**Purpose**|Routing rules, escalation and on-call rota.|
|---|---|
|**Route**|#/oncall|
|**Flow**|Governance & platform|
|**Roles**|Flight Director, Platform Administrator|
|**Modules**|Notification Service · Events & Alarms|
|**Data sources**|notify.requests.v1·rota API|
|**Constraints**|Q-02 · Q-08|



##### **FUNCTIONAL REQUIREMENTS** 

**FR-S28-01** The screen shall provide: Current on-call. **FR-S28-02** The screen shall provide: Escalation policy steps. 

**FR-S28-03** The screen shall provide: Routing rules table. 

**FR-S28-04** The screen shall provide: Delivery log. 

##### **STATES** 

|1|Delivered|
|---|---|
|2|Retrying|
|3|Escalated|
|4|Acknowledged|



##### **BUSINESS RULES** 

**BR-S28-01** Escalation after 5 and 15 minutes for unacknowledged critical alarms. 

##### **CONSTRAINTS AND ACCEPTANCE** 

|**ID**<br>**Target / rule**<br>**Meaning on this screen**<br>**Acceptance check**|
|---|



Akashaveda Space Technologies · Confidential · Page 79 

VYUH-MCS Console · Software Requirements Specification v2.0 

**Figma frame:** 1440 × 900 · app shell (sidebar 232, top bar 52) · content padding 24 · 12-column grid, 24 gutter · page Screens — Governance & platform · frame name S28 Notifications & on-call / Default plus one frame per state. 

Akashaveda Space Technologies · Confidential · Page 80 

VYUH-MCS Console · Software Requirements Specification v2.0 

## **7. Figma-ready specifications** 

This chapter lets a designer rebuild the prototype in Figma with identical values. Token names match the CSS custom properties in src/styles/app.css, so design and code stay in sync. 

### **7.1 File structure** 

|**#**|**Page**|**Contents**|
|---|---|---|
|00|Cover & index|Status, version, links to prototype and this SRS|
|01|Brand identity|Logo construction, variants, clear space (Figure 1)|
|02|Foundations|Colour, type, spacing, radius, elevation, grids — as variables and styles|
|03|Icons|Phosphor Bold set used + satellite glyph + constellation mark|
|04|Components|Atoms → molecules → organisms (7.5)|
|05|Patterns|App shell, page head, KPI strip, drawers, empty/loading/error states|
|06|User flows|Screen map and journeys 1–4 (Chapter 5)|
|07|Screens — Public & access|S00, S01, S02|
|08|Screens — Fleet & telemetry|S03, S04, S05, S06, S07|
|09|Screens — Passes & ground|S08, S09, S10, S11|
|10|Screens — Commanding|S12, S13, S14, S15, S16|
|11|Screens — Planning & mission data|S17, S18, S19|
|12|Screens — Intelligence|S20, S21, S22|
|13|Screens — Simulation & customers|S23, S24|
|14|Screens — Governance & platform|S25, S26, S27, S28|
|15|Prototype links|Clickable flows mirroring the guided demo (Chapter 9)|
|16|Handoff|Redlines, specs, changelog|



### **7.2 Variable collections** 

|**Collection / group**|**Variable**|**Value**|**Notes**|
|---|---|---|---|
|color / background|bg/canvas|#090C14|App background|
|color / background|bg/surface|#0D1828|Cards, sidebar, tables|
|color / background|bg/elevated|#131E30|Hover rows, sub-panels|
|color / background|bg/overlay|#1E2535|Modals, drawers, toasts, menus|
|color / border|border|#2A3349|Card and input borders|
|color / border|border/soft|#1C2436|Row dividers|
|color / border|mid|#3A4A60|Secondary icons, LOS state|
|color / text|text|#F0F4FF|Primary text|
|color / text|text/2|#99A3BC|Secondary text, labels|
|color / text|text/dis|#505A70|Disabled and placeholder only|
|color / brand|navy|#0D1B4B|Brand backdrops|
|color / brand|blue|#1A3A7C|Secondary button border, avatar, user message|
|color / brand|teal|#0F6E56|Primary action fill, active states|
|color / brand|teal/hover|#1A8A6E|Hover|
|color / brand|teal/active|#0B5443|Pressed|



Akashaveda Space Technologies · Confidential · Page 81 

VYUH-MCS Console · Software Requirements Specification v2.0 

|**Collection / group**|**Variable**|**Value**|**Notes**|
|---|---|---|---|
|color / text|teal/text|#3CB992|Links, active nav marker, mnemonics<br>(refinement)|
|color / status|ok|#4CAF81|NOMINAL|
|color / status|warn|#E8943A|WARNING, attention, playback|
|color / status|crit|#C62828|CRITICAL fills, danger buttons|
|color / text|crit/text|#FF6B6B|Critical text on dark (refinement)|
|color / status|info|#4A9EFF|AOS, info, focus ring|
|color / status|pending|#9C9AEC|Pending acknowledgement / approval|
|color / status|advisory|#C77DDB|AI advisory (new)|
|color / status|sim|#8B7CF6|Simulation mode (new)|
|space|sp/1 … sp/8|4, 8, 12, 16, 24, 32,<br>48, 64|Use for auto-layout padding and gap|
|radius|r/2, r/4, r/6, r/8, r/12, r/full|2, 4, 6, 8, 12, 999|Inputs, buttons, cards, guide, modals, badges|
|size|sidebar, sidebar/collapsed,<br>topbar, drawer, modal, copilot|232, 60, 52, 460,<br>520, 420|Shell dimensions|
|opacity|tint/ok, tint/warn, tint/crit,<br>tint/info, tint/adv|12 %, 12 %, 16 %, 12<br>%, 12 %|Badge and banner fills|



Akashaveda Space Technologies · Confidential · Page 82 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **7.3 Text styles** 

|**Style name**|**Family**|**Size**|**Line height**|**Weight**|**Tracking**|
|---|---|---|---|---|---|
|display|Inter|32|110 %|Bold|−1 %|
|heading/h1|Inter|24|115 %|Bold|−1 %|
|heading/h2|Inter|16|120 %|Bold|0|
|heading/card|Inter|14|120 %|Bold|0|
|heading/h3|Inter|13|130 %|Bold|0|
|body/md|Inter|14|150 %|Regular|0|
|body/sm|Inter|12|150 %|Regular|0|
|label/caps|Inter|11|130 %|Bold|+6 %,<br>uppercase|
|nav/group|Inter|10|130 %|Bold|+6 %,<br>uppercase|
|mono/md|JetBrains Mono|12.5|150 %|Regular|0|
|mono/badge|JetBrains Mono|10.5|100 %|Bold|+3 %,<br>uppercase|
|numeric/value|Space Grotesk|24|110 %|Bold|tabular|
|numeric/kpi|Space Grotesk|26|110 %|Bold|tabular|
|numeric/clock|Space Grotesk|15|100 %|Bold|tabular|



### **7.4 Effects and grids** 

|**Style**|**Value**|
|---|---|
|effect/menu|Drop shadow 0 16 40, #000 50 %|
|effect/modal|Drop shadow 0 24 60, #000 50 %|
|effect/toast|Drop shadow 0 10 30, #000 45 %|
|effect/focus|Stroke 2 px #4A9EFF outside, offset 2 px|
|effect/accent-top|Inner shadow 0 3 0 (status colour) — card top accent|
|effect/sev-left|Inner shadow 3 0 0 (status colour) — parameter card state|
|grid/desktop|1440 × 900 · content columns 12 · gutter 24 · margin 24 (after 232 sidebar)|
|grid/wide|1920 × 1080 · columns 12 · gutter 24 · max content 1680|
|grid/phone|400 wide · columns 4 · gutter 16 · margin 16|



Akashaveda Space Technologies · Confidential · Page 83 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **7.5 Component specifications** 



<!-- Start of picture text -->
Buttons<br>© Send command Abort. — Step Default Cancel<br><!-- End of picture text -->

_Figure 53. Buttons_ 

|**Variant**|**Fill / border**|**Text**|**Hover / pressed**|**Use**|
|---|---|---|---|---|
|primary|teal / teal|#FFFFFF 13 Bold|teal-hover / teal-active|Send, Approve, Start|
|danger|crit / crit|#FFFFFF|—|Abort, Revoke|
|secondary|none / blue|info|elevated bg|Step, Run procedure|
|warning|warn / warn|#1B1204|—|Force continue, Simulate|
|default|none / border|text|elevated bg, mid border|Neutral actions|
|ghost|none / none|text-2|text colour|Cancel, Dismiss|
|disabled|overlay / overlay|text-dis|—|Any unavailable action|



Sizes: **sm** 28 h, padding 0 10, text 12 · **md** 36 h, padding 0 14, text 13 · **lg** 44 h, padding 0 20, text 14. Radius r/4, icon 16, gap 8. Auto-layout horizontal, hug contents. In confirmation dialogs Cancel is the default-focused button. 



<!-- Start of picture text -->
Status badges, constraint tags and chips<br>eer cor Pere Live E<br><!-- End of picture text -->

###### _Figure 54. Badges, constraint tags and chips_ 

|**Component**|**Specification**|
|---|---|
|**Badge**|Height 20, padding 0 8, radius full, border 1.5 in status colour, fill status at 12 %, JetBrains Mono 10.5 Bold<br>caps. Variants: NOMINAL, WARNING, CRITICAL, AOS, LOS, PENDING ACK, ADVISORY, SIM, plus workflow<br>states mapped to the same colours (COMPLETED = ok, AWAITING APPROVAL = pending, RUNNING = info,<br>SHELVED = warn, REJECTED = crit).|
|**Constraint tag**|Padding 4 6, radius 3, mono 10.5 Bold. Q: #FF9A73 on coral 18 %; C: #F2B26B on amber 16 %; P: #C3CADB<br>on slate 14 %.|
|**Chip**|Height 26, padding 0 10, radius full, border, surface fill, text-2 12. LIVE chip adds 7 px green dot with 3 px<br>halo.|





<!-- Start of picture text -->
Inputs and selection<br>AKV.03 | 15 40<br>6h 26h 72h Power ADCS Thermal Comms<br><!-- End of picture text -->

_Figure 55. Inputs, segmented control and tabs_ 

|**Component**|**Specification**|
|---|---|
|**Input / select**|Height 36, padding 0 10, radius r/2, border, canvas fill, text 14. Focus: border info + 1 px info ring. Error:<br>border crit + help text crit-text 11.5. Label above: 11 Bold caps text-2, gap 5.|
|**Segmented control**|Border, radius r/4; segments padding 6 12, 12 Bold text-2; selected: elevated fill, text, 2 px teal-text<br>bottom inner stroke.|



Akashaveda Space Technologies · Confidential · Page 84 

VYUH-MCS Console · Software Requirements Specification v2.0 

|**Component**|**Specification**|
|---|---|
|**Tabs**|Bottom border; tab padding 10 14, 13 Bold; selected text + 2 px teal-text underline. Tabs may carry a 7 px<br>status dot.|
|**Search**|Input with 16 px magnifier at left 10, text indent 32.|





<!-- Start of picture text -->
Data display<br>9 1 sae<br>9.4 Br<br>' 72<br><!-- End of picture text -->

_Figure 56. Data display components_ 

|**Component**|**Specification**|
|---|---|
|**KPI tile**|Surface, border, r/6, padding 12 14, vertical gap 2. Value numeric/kpi in status colour; label body/sm<br>text-2; sub-label 11 text-dis. Clickable tiles show mid border on hover and open the related screen.|
|**Parameter card**|Surface, border, r/6, padding 12 14, gap 6. Row 1: mnemonic (mono, teal-text) + badge. Row 2: name<br>body/sm. Row 3: value numeric/value + unit. Limit bar 6 h. Sparkline 34 h. Footer 11 text-dis "updated n s<br>ago · limits". Out of limits: 3 px left inner accent in status colour, value in status colour. Stale: value and<br>sparkline at 45 % opacity, badge STALE, footer "Last hh:mm:ss UTC".|
|**Limit bar**|6 h, radius 3, gradient zones: crit 0–8 %, warn 8–18 %, nominal 18–82 %, warn 82–92 %, crit 92–100 %.<br>Marker 3 × 12, text colour, radius 2.|
|**Sparkline**|Line 1.4 px in status colour, area fill 10 %, end dot r 2.2. No axes.|
|**Line chart**|Grid dashed #2A3349; y labels 11 text-2; limit bands 9 % (nominal green, warning amber, critical red) with<br>dashed limit lines; forecast dashed with 14 % blue confidence band; markers dashed vertical with label.|
|**Gauge**|240° arc, 10 stroke, zones 0–30 red, 30–60 amber, 60–100 green at 28 %; value arc solid; value 30 Bold<br>numeric.|
|**Health matrix cell**|22 h, r 3; nominal green 22 % fill; warning amber 55 %; critical red 75 %; 1 px border in status colour.|
|**Map**|Equirectangular dot matrix: land dots r 2.1 #26324A on canvas; stations as triangles with dashed coverage<br>circle; satellites r 4.2 dot with 18 % halo, label mono 12; link to station dashed info line; selected satellite<br>ground track 1.3 px info at 60 %.|





<!-- Start of picture text -->
Feedback: banners, toasts, modal<br>© Waiting for approval. Step - AKV-03<br>5 is with Command Service. | CommandITR_SWITCH completedHEATER=B STATE=ON<br>Provisional. Backfill running for 1 gap.<br>© Blocked. interlockBAT_TEMP 12.6 °C — must be< 10.0 °C. | WARNINGee - AKV-03“<br>Chain verified. Anchor #4412 matches Confirm with passkey x<br>4 Advisory only. Never auto-escalated<br>Approving HTR_SWITCH HEATER=B STATE=ON on<br>AKV-03. Step-up to acr=2.<br>cancel v Use passkey<br><!-- End of picture text -->

_Figure 57. Feedback components_ 

|**Component**|**Specification**|
|---|---|
|**Banner**|Padding 10 14, radius r/4, 1 px border in kind colour at 40–60 %, fill at 7–10 %, 18 px icon in kind colour,<br>i i t|
||bold lead-in then text 13. Kinds: info, warn, crit (role alert), ok, advisory. Optional action button at right.|



Akashaveda Space Technologies · Confidential · Page 85 

VYUH-MCS Console · Software Requirements Specification v2.0 

|**Component**|**Specification**|
|---|---|
|**Toast**|Overlay fill, border, r/6, padding 10 12, 3 px status bar left, title 13 Bold, text 12.5 text-2. Width 360. Stack<br>bottom-right, gap 8, max 4, auto-dismiss 6 s, click opens related screen.|
|**Modal**|Overlay fill, border, r/12, width ≤ 520. Header 16 20 with icon + H2 + close. Body padding 20, gap 14.<br>Footer right-aligned buttons, Cancel first. Backdrop #04060C at 62 %. Escape closes.|
|**Drawer**|Right, width 460, overlay fill, left border, shadow −20 0 50. Header 14 18; body padding 18 gap 14;<br>optional footer actions.|





<!-- Start of picture text -->
Navigation and table<br>@ Fleet overview axv-e3 quay Sapseneteconitn! 94°C Comex<br># Hover axv-08 Safe mode entered — battery SOC low ,38% (ex<br>vison Axv-08 Reaction wheel 1 friction trend rising on Ce<br><!-- End of picture text -->

_Figure 58. Navigation item and table_ 

|**Component**|**Specification**|
|---|---|
|**Nav item**|Padding 7 10, radius r/4, gap 10, icon 18, text 13 text-2. Hover: elevated fill, text. Active: teal 18 % fill,<br>text, 2 px teal-text left inner stroke. Counter: 11 Bold, padding 0 6, full radius, crit or warn fill.|
|**Table**|Header 10.5 Bold caps +6 % text-2, padding 9 12, bottom border, sticky. Rows padding 9 12, soft divider.<br>Clickable rows: elevated hover. Selected: teal 14 %. Numeric columns right-aligned with tabular figures.<br>Wide tables scroll horizontally in their own container.|
|**Stepper**|Steps flex 1 (min 96); 4 px bar: done teal-text, current info, future border; label 11.5, current Bold.|
|**Guide panel**|Overlay fill, 1 px teal border, r/8, width 380, bottom-left above content. Progress segments 3 h. Title 15<br>Bold, narration 13 text-2, controls previous / primary action / next.|



### **7.6 Naming, states and handoff** 

- Component names: Category/Component/Variant/State, e.g. Button/Primary/md/Hover, Badge/Status/Critical, Card/Parameter/Warning. 

- Every interactive component has Default, Hover, Focus, Pressed and Disabled; data components have Nominal, Warning, Critical, Stale and Loading. 

- Each screen frame has variants for every state listed in Chapter 6, named Sxx Name / State. 

- Use auto-layout everywhere; no absolute positioning except map markers and chart annotations. 

- Handoff checklist: tokens only (no raw hex), text styles applied, icons from the library, contrast verified (3.2), focus states drawn, empty/loading/error states present, prototype links match Chapter 9. 

Akashaveda Space Technologies · Confidential · Page 86 

VYUH-MCS Console · Software Requirements Specification v2.0 

## **8. Non-functional requirements (UI)** 

|**ID**<br>**NFR-01**|**Area**<br>Performance|**Requirement**<br>A telemetry value shall render within 30 ms of arriving at the<br>browser (decode + render share of the 100 ms budget); frame<br>budget < 16 ms at 500 satellites × subscribed parameters.|**Traces to**<br>Q-01|
|---|---|---|---|
|**NFR-02**|Performance|Alarms and command status shall use an unconflated priority<br>lane and appear within 1 s end to end.|Q-02, Q-03|
|**NFR-03**|Performance|History charts for 30 days shall return within 500 ms P95; the<br>chart shows the resolution used.|Q-13|
|**NFR-04**|Scale|Lists, maps and matrices shall virtualise or use canvas beyond<br>100 rows / 600 cells without layout change.|Q-12|
|**NFR-05**|Security|No access or refresh token in JavaScript-readable storage; BFF<br>session cookie httpOnly, Secure, SameSite=strict.|Q-14|
|**NFR-06**|Security|Critical actions require passkey step-up (acr=2) at the moment<br>of action; the UI never decides authorisation, servers enforce<br>every rule.|Q-14, P-01|
|**NFR-07**|Security|Strict Content Security Policy; no third-party scripts in the<br>operational console.|Q-14|
|**NFR-08**|Tenancy|Customer and tenant scoping shall be visible on screen (tenant<br>chip) and enforced by the API; no cross-tenant data in any<br>view, export or cache.|C-06|
|**NFR-09**|Audit|Every state-changing action shall produce an audit record with<br>actor, role, time, target and result.|C-07|
|**NFR-10**|Reliability|The console shall show "Link to MCS lost" within 15 s of<br>missing heartbeats and resume with a snapshot using a<br>resume token.|Q-08|
|**NFR-11**|Reliability|The UI shall tolerate a zone failover without reload; in-flight<br>actions show their server status after reconnect.|Q-10|
|**NFR-12**|Accessibility|WCAG 2.2 AA: text contrast ≥ 4.5 : 1 (Section 3.2), visible 2 px<br>focus ring, keyboard access to all actions, ARIA names on icon<br>buttons, status not by colour alone.|—|
|**NFR-13**|Accessibility|Respect prefers-reduced-motion; no flashing above 3 Hz.|—|
|**NFR-14**|Compatibility|Latest two versions of Chrome, Edge and Firefox; 1440 × 900<br>primary, 1920 × 1080 and 2560 × 1440 supported; read-only<br>use down to 400 px wide.|—|
|**NFR-15**|Time|All times in UTC with explicit label; on-board time shown<br>separately where relevant.|—|
|**NFR-16**|Deployability|Console releases follow pass-aware sync windows; a release<br>never forces a reload during a pass.|Q-15|



Akashaveda Space Technologies · Confidential · Page 87 

VYUH-MCS Console · Software Requirements Specification v2.0 

## **9. Demo script and walkthrough** 

The prototype contains a 15-step guided demo that tells one complete story: a battery heater fails on AKV-03 and the team detects, diagnoses and recovers it safely. It takes about six minutes and touches 11 screens. The guide panel shows what to say and offers the next action; presenters can also click through the screens directly. 

### **9.1 Before you start** 

- Open the hosted link (or vyuh-mcs-demo.html) in a fresh tab so the story starts from the landing page. Reload the tab to reset all data. 

- Use a 1440 px or wider window; zoom the browser to 90 % on smaller laptops. 

- Close other overlays. Keep the ⓘ specification toggle off for business audiences and on for engineering audiences. 

- If internet is unavailable, the single HTML file still works; only the brand fonts fall back. 

Akashaveda Space Technologies · Confidential · Page 88 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **9.2 Script** 

|**#**|**Step**|**Screen**|**Say**|**Do**|
|---|---|---|---|---|
|1|Welcome to VYUH-MCS|S00 Product<br>landing|VYUH-MCS runs a satellite constellation from one<br>console: live telemetry in 100 ms, commands that can<br>never be sent twice, and AI that advises but never acts<br>alone. This story takes about six minutes.|Press**Sign in**.|
|2|Sign in with a passkey|S01 Sign in|No passwords. Operators sign in with a passkey bound<br>to their device, so a phished password is worthless<br>(Q-14). Every sign-in is written to the audit ledger.|Press**Use passkey**.|
|3|Choose mission and role|S02 Mission & role<br>scope|The role sets what this session may do and which<br>satellites it can see. We work as a Spacecraft Operator<br>on the Akashaveda fleet.|Press**Continue as**<br>**operator**.|
|4|Fleet at a glance|S03 Fleet overview|Twelve satellites, their ground tracks and the station<br>each one is talking to. Values update live without<br>animation, so nothing on screen misrepresents a rate of<br>change. Now simulate a failure on AKV-03.|Press**Inject heater**<br>**fault on AKV-03**.|
|5|A fault is developing|S03 Fleet overview|Heater A on AKV-03 has failed on. Battery temperature<br>starts to fall. Within about ten seconds the anomaly<br>model raises an advisory — watch the badge next to<br>Anomaly advisories.|Point to the warning<br>count and the red<br>counter on Alarm<br>console as they<br>increase. Then press<br>**Open advisories**.|
|6|The AI notices first|S20 Anomaly<br>advisories|The multivariate model flags AKV-03: temperature falling<br>while heater A runs at 97 % duty. It is an advisory with<br>evidence and contributing parameters; a person<br>confirms or dismisses it (P-01).|Press**Open alarm**<br>**console**.|
|7|The alarm follows|S06 Alarm console|When BAT_TEMP crosses the 10 °C warning limit, Events<br>& Alarms raises an ISA-18.2 alarm. Acknowledge it to<br>take ownership; shelving would need a reason and an<br>expiry.|Press**Ack**on AL-801.<br>Point out the<br>ADVISORY row is<br>separate from the limit<br>alarm. Then press<br>**Open AKV-03 power**.|
|8|Look at the satellite|S04 Satellite<br>health|Every Power parameter with its limit bar, sparkline and<br>freshness. BAT_TEMP is falling and the alarm is on the<br>right. Ask the copilot what to do.|Press**Ask the copilot**.|
|9|Ask the copilot|S22 Ops Copilot|The copilot answers from procedures and past pass<br>reports, with citations. It is read-only by design: it can<br>explain PR-THM-004 but has no permission to run it.|Press**Open procedure**<br>**runner**.|
|10|Run the recovery<br>procedure|S14 Procedure<br>runner|PR-THM-004 runs as a durable workflow. Press Start,<br>then Step through steps 1–4. Step 5 switches heater B<br>on — a critical command, so the run waits for a second<br>person.|Press**Start**, then**Step**<br>four times (step 4<br>waits a moment for<br>the completion<br>report). Press**Step**on<br>step 5; the run shows<br>Waiting for approval.<br>Then press**Switch to**<br>**Flight Director**.|
|11|Second person approves|S13 Approvals|As Flight Director, review who asked, why, the<br>parameters and the live interlock snapshot. Approve<br>with a fresh passkey touch (C-07). The requester could<br>never approve their own request.|Press**Approve with**<br>**passkey**, then**Use**<br>**passkey**. Mention the<br>requester could not<br>approve their own<br>request. Then press<br>**Back to operator ·**<br>**uplink**.|



Akashaveda Space Technologies · Confidential · Page 89 

VYUH-MCS Console · Software Requirements Specification v2.0 

|**#**|**Step**|**Screen**|**Say**|**Do**|
|---|---|---|---|---|
|12|Delivered exactly once|S15 Uplink &<br>COP-1|The TC Encoder holds the only lease for this satellite,<br>stamped with a fencing epoch. COP-1 delivers the frame,<br>the CLCW confirms receipt and V(S) advances. PUS 1<br>reports accepted, started, completed.|Point at V(S) and the<br>command status<br>reaching COMPLETED.<br>Then press**Back to**<br>**AKV-03**.|
|13|Temperature recovers|S04 Satellite<br>health|Heater B is on and BAT_TEMP climbs back; the alarm<br>returns to normal on its own. Finish the remaining<br>procedure steps in the runner whenever you like.|Press**Open audit**<br>**ledger**.|
|14|Proof for the auditor|S26 Audit ledger|Advisory, acknowledgement, request, approval,<br>commands and completion are all in a hash-chained<br>ledger anchored to write-once storage. Press Verify<br>chain.|Press**Verify chain**and<br>wait for the green<br>banner. Then press<br>**Open platform health**.|
|15|The platform behind it|S27 Platform<br>health|31 modules across three zones and a DR region, with<br>deployments frozen during passes. Explore any screen<br>from the menu; the<br>button in the top bar shows each<br>ⓘ<br>screen's specification.|Press**Finish demo**.|



Akashaveda Space Technologies · Confidential · Page 90 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **9.3 Storyboard** 

**1. Welcome to VYUH-MCS** — S00 



<!-- Start of picture text -->
One console for ©<br>every satellite,<br>pass and command. ;<br><!-- End of picture text -->

**2. Sign in with a passkey** — S01 



<!-- Start of picture text -->
Sign in to mission control<br><!-- End of picture text -->

Akashaveda Space Technologies · Confidential · Page 91 

VYUH-MCS Console · Software Requirements Specification v2.0 

##### **3. Choose mission and role** — S02 



<!-- Start of picture text -->
yun Vikram shetty men<br>Choose mission and role<br>@ Spacecraft Operator Flight Director Flight Engineer<br>tWiesion Planner © Security omicer<br>Choose mission and role<br><!-- End of picture text -->

**4. Fleet at a glance** — S03 



<!-- Start of picture text -->
yun 155515  Viram shetty<br>@ Feet overview Fleet overview — Soc<br>g 2 1 3 ° 1<br>Fleet<br>at a glance<br>° |<br>Inject heater fet on AKO 7 meee<br><!-- End of picture text -->

Akashaveda Space Technologies · Confidential · Page 92 

VYUH-MCS Console · Software Requirements Specification v2.0 

##### **5. A fault is developing** — S03 



<!-- Start of picture text -->
vyun 15:55:30 = @ vitram shetty<br>Oni Fleet overview 2<br>3 1 2 0) 2<br>A faults developing<br>° |<br>pen sveron ; jane ace<br><!-- End of picture text -->

**6. The AI notices first** — S20 



<!-- Start of picture text -->
vyun 15:55:32 = @ vitram shetty<br>Anomaly advisories “ =<br>‘The Al notices frst<br>en sim emake | ane sce<br><!-- End of picture text -->

Akashaveda Space Technologies · Confidential · Page 93 

VYUH-MCS Console · Software Requirements Specification v2.0 

##### **7. The alarm follows** — S06 



<!-- Start of picture text -->
yun 155537 é @ rons<br>Alarm console sro<br>1 3 o 1 1 2<br>‘The alarm follows |<br>° open Ape<br><!-- End of picture text -->

**8. Look at the satellite** — S04 



<!-- Start of picture text -->
yun 15:55:39 é @ rons<br>AKV-03 vos = Oe<br>nea<br>28.70 82.1 6.2<br>; ? + —_<br>4.20<br>'<br>Look atthe satelite<br>° st cnt<br><!-- End of picture text -->

Akashaveda Space Technologies · Confidential · Page 94 

VYUH-MCS Console · Software Requirements Specification v2.0 

**9. Ask the copilot** — S22 



<!-- Start of picture text -->
vyun 15:55:42 = @ vitram shetty<br>Ops Copilot<br>Ask the copiot<br>° ><br>pn reedmer<br><!-- End of picture text -->

##### **10. Run the recovery procedure** — S14 



<!-- Start of picture text -->
vyun 15:55:50 = @ vitram shetty<br>PR-THM-004 Battery heater recovery c seep brea<br>steps untog<br>Switch heater 8 ON (critical — second approver) sep 3 done: Sich heater AOFF<br>Run the recovery procedure ing See<br><!-- End of picture text -->

Akashaveda Space Technologies · Confidential · Page 95 

VYUH-MCS Console · Software Requirements Specification v2.0 

##### **11. Second person approves** — S13 



<!-- Start of picture text -->
—— 15:55:51 . ‘am Ananya Rac<br>Approvals<br>seiect— @ Approve<br>ith pasty<br>Second person approves<br>°<br><!-- End of picture text -->

##### **12. Delivered exactly once** — S15 



<!-- Start of picture text -->
vyun 15:55:57 = @ vitram shetty<br>Uplink& COP-1 ovo - EEREEEEEY « -<br>Deliveredexactly once sporoved with pashay<br>°<br><!-- End of picture text -->

Akashaveda Space Technologies · Confidential · Page 96 

VYUH-MCS Console · Software Requirements Specification v2.0 

##### **13. Temperature recovers** — S04 



<!-- Start of picture text -->
yun 15:56:06 é @ rons<br>AKV-03 vos = Oe<br>nea<br>29.39 82.2 9.1<br>: : : —_<br>4.08<br>’<br>Temperature recovers<br>°<br>es<br><!-- End of picture text -->

##### **14. Proof for the auditor** — S26 



<!-- Start of picture text -->
yrun 15:69 @ ener<br>Audit ledger con | EEE<br>mere can caper<br>°<br><!-- End of picture text -->

Akashaveda Space Technologies · Confidential · Page 97 

VYUH-MCS Console · Software Requirements Specification v2.0 

##### **15. The platform behind it** — S27 



<!-- Start of picture text -->
vyon 15:56:20  virom shetty<br>Platform health dain Zone aver et<br>71 ms 0.42 s 138 ms 99.962 % 2.31s<br>- Prootforthe auditor onsen<br><!-- End of picture text -->

Akashaveda Space Technologies · Confidential · Page 98 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **9.4 Recovery tips** 

|**If this happens**|**Do this**|
|---|---|
|**The advisory has not appeared after step 5**|Wait up to 15 s; the temperature must fall below 12 °C first. The Anomaly advisories<br>screen also has an "Inject heater fault" button.|
|**Step button is disabled in the procedure runner**|The run is waiting for a condition (step 4 waits for the heater A completion report) or for<br>approval. Wait, or go to Approvals.|
|**Approvals says you cannot approve your own**<br>**request**|This is the rule working. Use "Switch to Flight Director" on the page or the user menu.|
|**You clicked away from the story**|Open the compass button in the top bar; use the arrows to return to the step you were<br>on.|
|**You want to start again**|Reload the browser tab. All data is simulated and resets.|



### **9.5 Talking points by audience** 

|**Audience**|**Emphasise**|
|---|---|
|**Executives / customers**|Six-minute story; one console for the whole fleet; sovereign data; AI advises, people decide; every action<br>provable.|
|**Operators**|Alarm lifecycle, stale data, procedure runner, copilot citations, playback and simulation separation.|
|**Engineers**|Turn on<br>: modules, topics and constraints per screen; single-writer lease and fencing epoch; COP-1<br>ⓘ<br>state machine; hash-chained audit.|
|**Security / auditors**|Passkeys, step-up, requester ≠ approver, OPA decisions, audit chain verification, customer tenancy.|



Akashaveda Space Technologies · Confidential · Page 99 

VYUH-MCS Console · Software Requirements Specification v2.0 

## **10. Traceability** 

### **10.1 Constraints × screens** 

|**Constraint**|**Screens that must demonstrate it**|
|---|---|
|**C-01**CCSDS TM / AOS / USLP / TC /<br>COP-1 / SDLS|S08 Live pass monitor · S15 Uplink & COP-1 · S23 Simulator|
|**C-02**SLE RAF / RCF / F-CLTU for agency<br>stations|S08 Live pass monitor · S10 Ground stations|
|**C-03**XTCE dictionaries (with SCOS-2000<br>MIB import)|S04 Satellite health · S05 Parameter history · S12 Command console · S16 Procedure editor · S19<br>Mission database|
|**C-04**PUS services 1, 3, 5, 11|S04 Satellite health · S17 Mission plan|
|**C-05**External systems through APIs only|S09 Contact schedule · S10 Ground stations|
|**C-06**Sovereign data and tenant isolation|S00 Product landing · S02 Mission & role scope · S18 Payload deliveries · S21 Health forecast · S22<br>Ops Copilot · S24 Customer portal · S25 Users & access|
|**C-07**Every command attributable|S01 Sign in · S06 Alarm console · S12 Command console · S13 Approvals · S14 Procedure runner ·<br>S16 Procedure editor · S19 Mission database · S26 Audit ledger|
|**P-01**Safety by structure, not convention|S12 Command console · S14 Procedure runner · S20 Anomaly advisories · S22 Ops Copilot · S23<br>Simulator|
|**P-06**Compile configuration, don't query<br>it|S19 Mission database|
|**Q-01**Telemetry within 100 ms from<br>receipt to screen (P99)|S03 Fleet overview · S04 Satellite health · S11 Pass report|
|**Q-02**Alarm on screen within 1 s|S03 Fleet overview · S04 Satellite health · S06 Alarm console · S28 Notifications & on-call|
|**Q-03**Command release to CLTU within<br>150 ms (P99)|S11 Pass report · S12 Command console|
|**Q-04**Zero duplicate or reordered<br>commands|S12 Command console · S14 Procedure runner · S15 Uplink & COP-1|
|**Q-05**CLCW feedback within 100 ms|S08 Live pass monitor · S15 Uplink & COP-1|
|**Q-06**Zero data loss after receipt|S07 Pass playback · S08 Live pass monitor · S11 Pass report · S18 Payload deliveries|
|**Q-07**Anomaly advisory within 5 s (point)<br>/ 60 s (multivariate)|S06 Alarm console · S20 Anomaly advisories|
|**Q-08**99.95 % of pass-minutes available|S08 Live pass monitor · S10 Ground stations · S27 Platform health · S28 Notifications & on-call|
|**Q-10**Zone loss: no pass gap longer than<br>30 s|S08 Live pass monitor · S27 Platform health|
|**Q-11**Region disaster: RTO 15 min, RPO 1<br>min (0 for commands and audit)|S27 Platform health|
|**Q-12**Scale from 5 to 500 satellites<br>without a rewrite|S03 Fleet overview · S17 Mission plan · S21 Health forecast · S23 Simulator|
|**Q-13**History query within 500 ms (P95)|S05 Parameter history · S07 Pass playback|
|**Q-14**One stolen credential cannot<br>command a spacecraft|S01 Sign in · S02 Mission & role scope · S12 Command console · S13 Approvals · S22 Ops Copilot ·<br>S24 Customer portal · S25 Users & access · S26 Audit ledger|
|**Q-15**No critical deployments during a<br>pass|S09 Contact schedule · S27 Platform health|



Akashaveda Space Technologies · Confidential · Page 100 

VYUH-MCS Console · Software Requirements Specification v2.0 

### **10.2 Modules × screens** 

|**Domain**|**Module**|**Screens**|
|---|---|---|
|Ground link|Pass Orchestrator|S03, S08, S11|
|Ground link|Link Gateway|S08, S10, S23|
|Ground link|Frame Processor|S08, S11, S15|
|Ground link|Forward Link Engine|S08, S15|
|Ground link|Bulk Payload Pipeline|S11, S18, S24|
|Telemetry|TM Processor|S04|
|Telemetry|Live Telemetry|S03, S04, S12, S14|
|Telemetry|TM Archive & Query|S05, S07|
|Telemetry|Events & Alarms|S03, S04, S06, S20, S28|
|Commanding|Command Service|S12, S13, S14|
|Commanding|Procedure Engine|S14, S16|
|Commanding|TC Encoder|S12, S15|
|Commanding|Key Management|(background only — surfaced in S27 Platform health)|
|Mission ops|Mission Database|S05, S16, S19|
|Mission ops|Flight Dynamics Bridge|S09|
|Mission ops|GS Resource Manager|S09, S10, S17|
|Mission ops|Planning & Scheduling|S09, S17, S24|
|Mission ops|Spacecraft Simulator|S16, S19, S23|
|Intelligence|Anomaly Detection|S06, S20|
|Intelligence|Health Forecasting|S17, S21|
|Intelligence|ML Platform|S20, S21|
|Intelligence|Ops Copilot|S22|
|Experience|Edge API Gateway|S01|
|Experience|Operator BFF|S01, S22|
|Experience|Realtime Gateway|S03, S07|
|Experience|Customer API|S18, S24|
|Experience|Web Console|S00|
|Security|Identity (Keycloak)|S01, S02, S13, S25|
|Security|Policy (OPA)|S02, S12, S25|
|Security|Audit Ledger|S13, S26|
|Security|Notification Service|S06, S28|



Akashaveda Space Technologies · Confidential · Page 101 

VYUH-MCS Console · Software Requirements Specification v2.0 

## **Appendix A — Prototype technical notes** 

|**Topic**|**Notes**|
|---|---|
|**Stack**|React (single-page app), Phosphor icons via react-icons, no other runtime dependencies. Charts, map<br>and diagrams are hand-built SVG so they follow the brand exactly and need no external services.|
|**Source layout**|src/data/screens.jsscreen inventory (source for Chapter 6) ·src/data/fleet.jsexample fleet, stations,<br>dictionary, commands, procedure, users ·src/lib/store.jsstate, simulation and actions ·<br>src/components/ui.jsxcomponent library ·src/components/Guide.jsxdemo story ·<br>src/screens/<flow>/*.jsxone file per screen ·src/styles/app.csstokens and components ·<br>src/specimen.jsxbrand and component sheets.|
|**Build**|npm install && npm run dev(Vite) for development;node build.mjscreates the single-file<br>dist/vyuh-mcs-demo.html;node build.mjs --specimencreates the component specimen.|
|**Simulation**|12 satellites in three orbital planes propagated in accelerated time, 6 ground stations, 22 parameters<br>per satellite updated at 1 Hz with noise, scripted heater-fault scenario, command lifecycle ENCODED →<br>UPLINKED → ACCEPTED → STARTED → COMPLETED, hash-chained audit records.|
|**Differences from product**|No back end: identity, policy, approvals and COP-1 are simulated in the browser. Data resets on reload.<br>Time acceleration for orbits. The product enforces all rules server-side; the prototype only<br>demonstrates the behaviour.|
|**Example data**|Satellites AKV-01…10 and NBH-01…02, people, figures, hashes and documents are fictional examples.|



Akashaveda Space Technologies · Confidential · Page 102 

