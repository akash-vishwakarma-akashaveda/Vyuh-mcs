# VYUH-MCS — Master Plan

**A single hand-off document: where the system came from, what is wrong with it, what we decided, and what to build next.**

Akashaveda Space Technologies · compiled 4 October 2026

---

## 0. How to use this document

This file is written to be handed to a fresh Claude Code session (or a new engineer) with no other context. It is the index to everything else. Read it top to bottom once; after that, use §3 to find the source document for whatever you are working on.

**Three things to understand before you touch anything:**

1. **There are two codebases and they are not the same thing.** `D:\Vyuh-Mcs` is a working prototype — Go and Rust services plus a React console — that demonstrates the pipeline on simulated and recorded data. `D:\MCS-Designing-Phase\VYUH-DETAILS\VYUH-MCS-DESIGN\` is the *design* record: architecture documents, reviews, gap analysis and the v3 workspace. The design is ahead of the code in some places and behind it in others. Never assume a document describes what the code does.

2. **Architecture v2.2 is documented, reviewed, and not being extended.** It was reviewed adversarially on 4 Oct 2026 and produced 95 findings. v3 is the live design workspace. Do not add to v2.2; react to it.

3. **The honesty rule.** Several documents in this project previously claimed things that were demonstrated on simulated data with in-memory state. The correct phrasing for those is "designed and demonstrated", never "implemented". Keep that discipline. If you write a number, say where it was measured. If it was not measured, say "design target".

---

## 1. What VYUH-MCS is

A mission control system for LEO satellite operators: the ground software that receives telemetry from spacecraft, decodes it, shows it to operators, raises alarms, sends commands back, keeps the archive, and plans the contacts.

**The market position, stated bluntly** (this is the conclusion of the gap analysis and it drives every roadmap decision below):

> Basic TM/TC is a commodity and cannot be charged for. Yamcs ships framing, SDLS, CFDP, XTCE, COP-1 and replication under AGPL at no licence cost. OpenC3 sells RBAC, SSO, CFDP and framing from $33k/year. Reaching parity with those buys **eligibility, not differentiation**.
>
> The defensible ground is the fleet layer: per-satellite configuration with staged rollout, fleet contact economics, population analytics that compare a unit to its siblings, and a measured operator-to-satellite ratio. At one satellite the MCS is a control room; at fifty it is a fleet management system that happens to speak CCSDS.

**Operating envelope** (decided — ADR-0001): LEO, 1 to 500 satellites, all customer categories (commercial / agency / GSaaS-integrated), one core codebase. First deployments are 1–5 satellites. *Design for 500, deploy for 5.*

---

## 2. Where things stand today

### 2.1 The prototype — `D:\Vyuh-Mcs`

A Go + Rust backend with a React/TypeScript console. Roughly 115 Go files and 175 TS/TSX files. Git history is short (4 commits); the most recent substantive one is *"Make the ground segment real end to end and verify it with ESA OPS-SAT data"*.

**Services present as `cmd/` entry points:**

```
alarm-manager      frame-processor    mission-database    simulator
bff                gap-replay         pipeline-verify     tm-processor
command-gateway    link-gateway       realtime-gateway    upe
dead-letter-monitor live-telemetry    vyuh-mcs            utfe
```

**Internal packages** mirror these, plus `ccsds`, `anomaly`, `kafka`, `redis`, `platform`, `telemetry`, `verification`, `verify`, `demo`.

**Frontend stack:** React 18, TanStack Router + Query, Zustand, Tailwind, Recharts + uPlot + D3, Cesium / globe.gl / Leaflet for geo, Framer Motion, Zod.

**Verification harness:** `bin/verify-*` scripts (D10–D30, M, U series) — this is real and worth preserving. There is a `pipeline-verify` command and an `internal/verification` package.

**What is honest about the prototype:** it demonstrates an end-to-end ground segment and has been run against ESA OPS-SAT data. **What is not yet true:** no persistent archive of record, no real ground-station interface (SLE or GSaaS), only PUS service 1, no CFDP or memory load/dump, encryption that is not CCSDS SDLS, no real identity provider or server-side enforcement of roles and approvals, no redundancy, no server-side procedure language, and no TLE/OEM/CDM handling. This list comes from the gap analysis and has not changed.

### 2.2 The design record — `D:\MCS-Designing-Phase\VYUH-DETAILS\`

```
VYUH-MCS-DESIGN\
  Architecture_v2\          v2, v2.1, v2.2 docs; diagrams; review; gap analysis; decks; guides
  Architecture_v3\          the live workspace — ADRs, README, source material
  Brand_Identity\           logo, colour, typography, brand philosophy
VYUH-Notebook\              the learning notebook (React app + built single file)
Claude outputs\             FRD, console SRS, module deck, demo source
```

---

## 3. Asset inventory — what exists and where

### 3.1 Architecture documents

| File | What it is | Status |
|---|---|---|
| `Architecture_v2\VYUH_MCS_System_Architecture_v2.docx` | First full architecture | superseded |
| `Architecture_v2\VYUH_MCS_System_Architecture_v2.1.docx` | + master diagram | superseded |
| `Architecture_v2\VYUH_MCS_System_Architecture_v2.2.docx` / `.pdf` | **The architecture of record until v3 lands.** 31 services, ~18 stores, Q/C/P catalogues, LLD sections 15–21 | reviewed, frozen |
| `Architecture_v2\Master_Diagram\` | `VYUH_MCS_Master_Architecture.svg/.png`, poster PDF, per-view renders (telemetry, command, mission ops, AI, security, data), diagram sources zip | current |
| `Architecture_v2\diagrams\` | 32 numbered diagrams: context, logical, HLD, pass lifecycle, TM realtime, bulk flow, command uplink, command states, alarm flow, MDB release, planning, auth, event map, data tiers, deployment, security, DR, observability, tech stack, link internal, TM processor, live fanout, archive, alarm states, command internal, ownership, FOP states, AI, copilot, frontend | current |
| `Architecture_v2\VYUH_MCS_Explained_Simply.docx` | Plain-language version of v2.2 | current |

### 3.2 Analysis documents

| File | What it is |
|---|---|
| `Architecture_v2\VYUH_MCS_Architecture_Review_v2.2.md` | **The adversarial review.** 95 findings from four independent reviews. Summarised in §5 below |
| `Architecture_v2\VYUH_MCS_Gap_Analysis_rev2.md` | **What must be built before it flies**, web-verified, with the constellation layer. Summarised in §6 below |
| `Architecture_v2\VYUH_MCS_FRD_v1.md` | Functional requirements |
| `Architecture_v2\VYUH_Ground_Segment_Fundamentals.html` / `.pdf` | Illustrated reference: CCSDS frames, packets, data types. **Known error: the RS(255,223) I=5 figure is wrong — it says a 1115-byte codeblock carrying an 892-byte frame; correct is a 1275-byte codeblock carrying 1115 bytes of frame.** Fix before circulating |
| `Architecture_v2\VYUH_MCS_Plain_Guide.html` / `.pdf` | Non-specialist guide |
| `Architecture_v2\VYUH_MCS_Features_and_User_Journeys.docx` / `.pdf` | Feature set and journeys |

### 3.3 v3 workspace — `Architecture_v3\`

```
README.md                                   method and layout
01-decisions\INDEX.md                       18 open decisions, live list
01-decisions\ADR-0000-template.md
01-decisions\ADR-0001-scope-and-operating-envelope.md    proposed
01-decisions\ADR-0002-build-the-core.md                  proposed
99-source\VYUH_MCS_Architecture_Review_v2.2.md
99-source\VYUH_MCS_Gap_Analysis_rev2.md
```

Directories reserved but empty: `00-context/`, `02-model/`, `03-cross-cutting/`, `04-verification/`, `05-diagrams/`.

### 3.4 Commercial material

`VYUH_MCS_Customer_Deck.pptx` (10 slides, image-led), `VYUH_MCS_Customer_Overview.pptx` (one slide), `VYUH_MCS_Module_Deck.pptx` + explanation docx, brand identity set.

⚠️ **Correction required in competitive material:** earlier drafts asserted Terma CCS5 ships the full SLE service set with Aurora archive and perpetual + 20%/yr pricing. Terma publishes **SLE RAF and F-CLTU only**; archive is MySQL-compatible or PostgreSQL; **no public perpetual + 20% pricing exists.** Remove it.

---

## 4. Architecture v2.2 as documented

This is the thing being reviewed and replaced. Summarised so you do not have to open the docx.

### 4.1 The 31 services

| # | Service | Plane | Lang | Owns |
|---|---|---|---|---|
| 1 | Pass Orchestrator | Ground link | Go | LinkSession resources, session history |
| 2 | Link Gateway | Ground link | Rust | Session spool (WAL) |
| 3 | Frame Processor | Ground link | Rust | Per-satellite frame actor state |
| 4 | Forward Link Engine | Ground link | Rust | COP-1 FOP state per satellite |
| 5 | Bulk Payload Pipeline | Ground link | Rust + Argo | Chunks, manifests |
| 6 | TM Processor | Telemetry | Rust | Limit hysteresis state |
| 7 | Live Telemetry | Telemetry | Go | Current Value Table (CVT) |
| 8 | TM Archive & Query | Telemetry | Go | Parameter history |
| 9 | Events & Alarms | Telemetry | Go | Alarm objects, event log |
| 10 | Command Service | Commanding | Go | Command records, approvals, queues |
| 11 | Procedure Engine | Commanding | Go + Temporal | Procedure executions |
| 12 | TC Encoder | Commanding | Rust | Packet sequence counters |
| 13 | Mission Database | Mission ops | Go | Dictionary versions, bundles |
| 14 | Flight Dynamics Bridge | Mission ops | Java + Orekit | Ephemerides, contact predictions |
| 15 | GS Resource Manager | Mission ops | Go | Stations, bookings |
| 16 | Planning & Scheduling | Mission ops | Python | Plans, activities |
| 17 | Spacecraft Simulator | Mission ops | Rust | Simulation scenarios |
| 18 | Anomaly Detection | Intelligence | Python | Model deployments, baselines |
| 19 | Health Forecasting | Intelligence | Python | Forecast results |
| 20 | ML Platform | Intelligence | MLflow + Argo | Models, features, experiments |
| 21 | Ops Copilot | Intelligence | Python + vLLM | Document index, conversation audit |
| 22 | Edge API Gateway | Experience | Envoy Gateway | Routes, rate limits |
| 23 | Operator BFF | Experience | Go | stateless |
| 24 | Realtime Gateway | Experience | Go | Connection state |
| 25 | Customer API | Experience | Go | API clients, webhooks |
| 26 | Web Console | Experience | TS / React | Browser state |
| 27 | Identity | Security | Keycloak | Users, credentials, sessions |
| 28 | Policy | Security | OPA | Policy bundles |
| 29 | Key Management | Security | Go + HSM | Key metadata |
| 30 | Audit Ledger | Security | Go | Hash-chained audit records |
| 31 | Notification Service | Security / ops | Go | Rules, deliveries |

### 4.2 Stores and their owners

| Store | Engine | Owner |
|---|---|---|
| Event log | Kafka 4.3 (KRaft, Strimzi) | Platform; topics owned by producers |
| WAL spool | Local NVMe append-only segments | Link Gateway |
| Sessions DB | PostgreSQL 18 (CloudNativePG) | Pass Orchestrator |
| FOP state | etcd 3.7 | Forward Link Engine |
| Bulk object storage | S3-compatible | Bulk Payload Pipeline |
| CVT | Valkey 9 cluster | Live Telemetry |
| Telemetry history | ClickHouse (3 shards × 2 replicas) | TM Archive & Query |
| Alarms DB | PostgreSQL 18 | Events & Alarms |
| Commands DB | PostgreSQL 18 | Command Service |
| Procedure state | Temporal on PostgreSQL | Procedure Engine |
| TC counters & leases | etcd 3.7, dedicated cluster | TC Encoder |
| HSM | FIPS 140-3 L3 cluster | Key Management |
| Dictionary DB + bundles | PostgreSQL 18 + S3 | Mission Database |
| Bookings DB | PostgreSQL 18 | GS Resource Manager |
| Plans DB | PostgreSQL 18 | Planning & Scheduling |
| Lakehouse | Iceberg on S3 (REST catalogue) | TM Archive & Query (writer), ML Platform |
| Vector index | PostgreSQL 18 + pgvector | Ops Copilot |

Parameter sample identity: `sample_id = (tenant, satellite, parameter_id, obt_tai_ns, source_packet_seq, origin_rank)`; ClickHouse `ReplacingMergeTree` ordered by `(tenant, satellite, parameter_id, obt)` with `version = mdb_version, processed_at`.

### 4.3 Quality targets (Q), constraints (C)

| ID | Attribute | Target |
|---|---|---|
| Q-01 | Telemetry latency | ≤ 100 ms P99 gateway→screen (≤ 250 ms from ERT incl. WAN) |
| Q-02 | Alarm latency | ≤ 1 s P99; page on-call ≤ 30 s |
| Q-03 | Command latency | ≤ 150 ms P99 internal; ≤ 500 ms to station incl. WAN |
| Q-04 | Command integrity | Zero duplicate or out-of-order TCs; zero unaudited commands |
| Q-05 | Command feedback | CLCW → COP-1 state and status on screen ≤ 100 ms P99 |
| Q-06 | Data completeness | Zero loss after receipt; link losses detected and backfilled |
| Q-07 | Anomaly detection | Point ≤ 5 s; multivariate trend ≤ 60 s |
| Q-08 | Availability — ops plane | 99.95% of pass-minutes per month |
| Q-09 | Availability — analytics | 99.5% monthly |
| Q-10 | Recovery (AZ loss) | No pass interruption > 30 s; RPO 0 for commands and audit |
| Q-11 | DR (region loss) | RTO ≤ 15 min ops plane; RPO ≤ 1 min |
| Q-12 | Scalability | 20 → 500 satellites with config and capacity changes only |
| Q-13 | History query | 24 h × 50 params, downsampled, ≤ 500 ms P95 |
| Q-14 | Security | One compromised service credential cannot command, cross-read tenants, or alter audit |
| Q-15 | Deployability | No operator-visible impact; no flight-critical deploy during an active pass |

Constraints C-01…C-08 cover: CCSDS TM 132.0 / AOS 732.0 / USLP 732.1 / TC 232.0 / COP-1 232.1 / SDLS 355.0 / Space Packet 133.0 to specification; SLE RAF/RCF/F-CLTU for agency cross-support; XTCE dictionaries with SCOS-2000 MIB import; PUS (ECSS-E-ST-70-41C) services 1, 3, 5, 11, 17, 20; external systems only via published APIs; sovereign data residency with physical isolation for export-controlled tenants; every command attributable to authenticated people + approved procedure version + dictionary version; OSS licences compatible with commercial redistribution.

> **Note for whoever resolves the review:** review §5 claims "Q-09 is missing from the catalogue entirely." That is a review error — Q-09 (analytics-plane availability, 99.5% monthly) is defined in v2.2 §3.1. Withdraw that row rather than acting on it.

---

## 5. The v2.2 adversarial review — what breaks

Full document: `VYUH_MCS_Architecture_Review_v2.2.md`. Four independent reviews, 95 findings, catalogued A1–A25 (downlink/stores), B1–B21 (uplink/commanding/security), C1–C24 (platform/availability/ops), D1–D25 (mission ops/intelligence/fleet).

### 5.1 The verdict

> v2.2 is a credible design for **one spacecraft** that has not yet been designed for **failure** or for a **fleet**.

Three patterns explain most of the 95 findings:

- **Rigour was applied to commanding and not to recovery.** Command Service gets a transactional outbox, TC Encoder gets fencing epochs, FOP-1 gets a TLA+ model. Events & Alarms — which decides whether a human is told — gets none of those patterns.
- **Isolation is claimed per satellite and implemented per process.** P-03 "partition everything by satellite" is true for Kafka keys and actor assignment, false for failure domains: nine components stop the entire fleet, and thirteen services share one PostgreSQL cluster behind a logical ownership claim.
- **Fencing stops one hop short of the antenna.** The single-writer design is correct up to the point CLTUs enter the Link Gateway, which is never said to validate the epoch.

### 5.2 The ten that break first

1. **Two Forward Link Engines command the same satellite.** A 12-second GC pause at AOS+4, lease expires, new owner resumes COP-1, old pod flushes its retransmission window down an already-open gRPC stream. FARM-1 sees interleaved frames — some accepted twice, probably lockout. Nothing says Link Gateway validates the epoch, that a station session admits one engine identity, or that an epoch bump tears down the stream. The lease TTL is never stated.
2. **Region failover duplicates commands.** DR covers MirrorMaker 2, a PostgreSQL replica, object replication and provider tunnels. **etcd is not in that list.** Neither is Temporal or ClickHouse. After failover the new region has no evidence of what the old one already radiated. In a partition rather than a true region loss, two regions hold two independently monotonic epoch lineages and fencing has no concept of a forked lineage.
3. **A spacecraft clock reset locks out recovery commanding.** Live Telemetry's CVT "never goes back in on-board time". Frame Processor detects resets. The two facts are never connected: post-reset samples are discarded, `GetValues` returns stale, Command Service treats stale interlocks as failed, all interlocked commanding is blocked at exactly the moment the spacecraft needs it.
4. **The one credential that can command is the envelope signing key.** All five gates run inside Command Service, upstream of TC Encoder. Anyone with that key mints envelopes onto the command topic — no second person, no policy, no interlock, and **no command record in PostgreSQL**, so no audit entry. HSM is scoped to SDLS keys only.
5. **Nothing defines what gets dropped when overloaded.** The central omission of the downlink design; it recurs at every stage.
6. **The alarm lane is unbounded by construction** and OOMs during an alarm storm.
7. **Losing one AZ blocks commanding fleet-wide**, and the CVT has no rebuild path.
8. **Five-minute tokens make the IdP a fleet-wide cliff** — and it gates its own recovery.
9. **Q-15 becomes a permanent deploy freeze** somewhere past twenty satellites.
10. **There is no fleet object**, so every fleet operation is a human with a spreadsheet.

### 5.3 Targets that contradict each other

Resolve before quoting any of these to a customer.

| Conflict | Resolution |
|---|---|
| Q-15 (no deploys during a pass) vs Q-12 (500 sats) | Re-express Q-15 per shard, not per cluster; Argo CD's rollout unit and Pass Orchestrator's placement unit must be the same partition; plus an emergency-patch override with its own approval |
| Q-11 (RPO 0 for commands) vs Q-03 (150 ms release) | State which is true. If RPO 0 is AZ-scoped, Q-11 is false for region loss. If the standby is cross-region, Q-03 is unachievable past ~8 ms RTT |
| Q-01 (100 ms) vs its own decomposition | Six stages sum to exactly 100 ms and omit three Kafka hops priced at 10 ms each elsewhere in the same document |
| Q-06 (zero loss after receipt) vs the node-local spool | "After receipt" means "after the frame reaches a disk one node loss destroys" |
| Q-14 (one stolen credential can't command) vs non-critical commands | True only for commands marked critical |
| Q-08 (99.95% of pass-minutes) vs its own denominator | The denominator is produced by services inside the system — if Planning is down, availability improves |
| Q-07 (advisory ≤ 5 s / 60 s) vs zero advisories | Latency-only targets are satisfied by silence. Add a coverage obligation |
| Q-04 (structural guarantee) vs semantic duplicates | Operator double-clicks and procedure retries produce legitimately distinct commands |
| P-03 (partition by satellite) vs shared stores | Partitioning gives throughput and ordering; it is cited as if it also gives isolation and fleet scaling, and it gives neither |

### 5.4 Seven components that do not exist and need to

1. **Fleet Registry** — satellite identity and attributes (bus block, OBSW version, dictionary baseline, plane, launch, commissioning state, lifecycle phase), and the authoritative `tenant:satellite` key.
2. **Campaign / Fleet Operations service** — campaigns as durable objects: target group, per-satellite state, soak gates, abort, resume.
3. **On-board Schedule Model** — believed-vs-reported on-board schedule, reconciled against PUS 11 reports, with a defined mismatch action.
4. **Observability** — metrics, traces, logs, trace-context propagation through Kafka/Valkey/WebSocket, per-hop SLIs matching the published budget, time-synchronisation design. Currently a word on a stack slide.
5. **Conjunction / space-safety** — CDM ingestion, per-satellite screening state, manoeuvre decision record, plan pre-emption, post-manoeuvre re-booking, intra-constellation screening.
6. **Platform ownership** — Kubernetes, Istio, Argo CD, schema registry, DR region have no owning service, no constraints and no SLO. Every target that depends on them is therefore unowned.
7. **A reconciliation layer** — Kafka↔ClickHouse↔Iceberg; local bookings↔provider truth; commands sent↔on-board execution reports; desired fleet config↔actual.

### 5.5 What the review says is genuinely good

The single-writer commanding core, the claim-check pattern, the transactional outbox, and the structurally read-only Copilot. The problem is not carelessness — it is that the architecture is rigorous where it looked and silent where it did not, and the silences cluster around failure, recovery and the fleet.

---

## 6. Gap analysis rev 2 — what must be built before it flies

Full document: `VYUH_MCS_Gap_Analysis_rev2.md`. Web-verified against primary sources; §1 lists seven corrections made to the previous revision.

### 6.1 The 2026 competitive baseline

Every serious product covers: database-driven CCSDS TM/TC, per-command verification, limits and alarms, archive with replay and trending, a procedure language, a scheduler, ground-equipment M&C, a training simulator, redundancy, an external API. **What changed between 2024 and 2026 is that this baseline became free.**

| Product | What it brings that VYUH lacks | Licence |
|---|---|---|
| Yamcs 5.13.6 | TM/AOS/USLP, CLTU, COP-1, SDLS, CFDP, XTCE MDB, replication, timeline with activity chaining, Parameter Retrieval Service, PUS ST[22] | AGPL + commercial |
| OpenC3 COSMOS 7.2 | Script Runner; Enterprise adds RBAC, Keycloak SSO, K8s, CFDP, KSAT Lite and Leaf plugins, Autonomic, Calendar, Command Queue, audit log | Core free; $33k / $100k / $165k per year |
| ESA SCOS-2000 → EGS-CC / EGOS-CC | PUS chain, SLE, MIB/TDM database, PLUTO automation, on-board queue modelling. First operations **planned** 2026 (not achieved) | Free to European entities |
| Kratos EPOCH IPS / OpenSpace | Triggers, ARES procedures, ABE offline analysis, memory management, OASYS FD, 300+ missions | Quote |
| L3Harris InControl | Constellation view, onboard system management, ground M&C, training simulator | Quote |
| NASA ITOS / GMSEC / AIT / Open MCT | STOL lights-out automation, messaging middleware, YAML dictionaries + CFDP, visualisation | NOSA / MIT / Apache 2.0 |

### 6.2 The constellation layer — the part that differentiates

This is §7 of the gap analysis and the part the previous revision missed entirely. **These are Must for a constellation customer**, and several are cheaper to build early than to retrofit because they constrain the per-satellite data model.

**Fleet configuration management — the biggest missing block.** A constellation is never homogeneous; satellites fly different software builds, dictionary versions and hardware blocks simultaneously.

- Per-satellite mission-database binding with a **fleet version matrix** — which satellite flies which dictionary, which OBSW build, which limit set. Without it, a dictionary change silently misdecodes half the fleet.
- **Apply-to-subset operations** — a change, procedure or command applied to a named group, with per-satellite result tracking and honest partial-failure semantics.
- **Staged rollout with canary and automatic halt** — patch one satellite, bake for N orbits, ring out, stop on anomaly. Standard in software operations, essentially absent from MCS products. Strong differentiator.
- **Campaign management** for OBSW and configuration updates: who received patch X, who failed, who needs retry, what the rollback is.

**Launch and identification.** Post-launch **object identification** — after a rideshare, which catalogue object is which satellite, with re-correlation after manoeuvres and a record of the decision. A wrong assignment points the antenna at someone else's satellite and commands against the wrong ephemeris. Batch LEOP with per-satellite checklist state machines. Constellation phasing and plane management. Fleet consumables (delta-V, battery cycles, wheel hours, radiation dose) rolled up to constellation capacity and EOL forecasting.

**Ground network at fleet scale.** Fleet-level contact allocation (satellites competing for the same station minutes, resolved by priority, backlog and cost — a fleet optimisation problem a per-satellite scheduler does not solve). Automatic rebooking and provider fallback.

**Operations economics.** An explicit **operator-to-satellite ratio** as a measured design target (human touches per satellite per week). Exception-based operations: a per-satellite state machine with a fleet queue of "needs a human", not N dashboards. Cost per satellite per month, attributed. A capacity model with measured headroom.

> Regulatory notes worth carrying: the FCC 5-year disposal rule binds by **launch date** (after 29 Sep 2024), not filing date. ESA ESSB-ST-U-007 req 5.3.3.2(c) — **membership of a constellation by itself requires recurrent manoeuvre capability**; that requirement matters to VYUH's customers more than the 1e-4 figure that is often quoted. The EU Space Act does not apply to assets launched before 1 Jan 2030; adoption expected ~2028.

### 6.3 The roadmap

| Phase | Goal | Content |
|---|---|---|
| **0. Make it real** | Nothing in memory that must survive a restart | TimescaleDB archive (frames, packets, parameters, events, alarms, command history, audit) + retrieval API replacing synthetic history; real Kafka/Redis; OIDC/SAML SSO with MFA; backend-enforced RBAC, two-person approval, shelving, hash-chained audit with SIEM export; mTLS between services; active/standby with persisted FOP-1 state |
| **1. Reach a real spacecraft** | Pass a first contact through a real antenna | SLE user (RAF/RCF/F-CLTU) via `sleapi-j` or a native port, plus one GSaaS adapter behind a provider interface; CLTU encoding, TC BD/segmentation; SDLS 355.0; TLE/OMM ingest and SGP4 passes via an Orekit sidecar; **object identification and TLE-to-satellite correlation**; simulator/SVF link so procedures run unchanged on both |
| **2. Operate it per PUS** | Pass an ORR for a PUS-C LEO mission | PUS ST[1] full, [3], [5], [9], [11] with on-board queue model, [15] with playback merge, [17], [20]; multi-stage verification windows; command stacks and time-tagged uplink; XTCE import/export; derived parameters; phase limit sets; server-side Python procedure executor; CFDP Class 1/2; memory load/dump/check; CDM ingest; OEM/OCM exchange; configuration baselines and freezes |
| **3. Make it a fleet system** | Support the 2nd and 20th satellite without multiplying cost | Per-satellite MDB binding and fleet version matrix; apply-to-subset with partial-failure semantics; staged rollout with canary and automatic halt; OBSW campaign management; batch LEOP; fleet contact allocation with rebooking and provider fallback; downlink backlog management; exception-based fleet view with measured operator load; per-tenant quotas under load test; fleet compliance matrix; payload pipeline and storage tiering at fleet volume |
| **4. Run it efficiently** | Cut operator load; satisfy security reviews | Real plan solver; trigger-reaction automation; ST[6, 12, 13, 19, 23]; SCOS MIB import; SDLS-EP/OTAR and HSM; alarm rationalisation and flood suppression; KPI dashboard, operator log, handover; trend and pass reports; two-tier retention; external REST API; Helm/K8s; ground-equipment M&C; FD integration for OD and manoeuvres; constellation phasing campaigns; NIST IR 8401 / SPARTA mapping, SBOM, incident evidence export; training mode; SLOs and on-call |
| **5. Win on the layer above** | Beat free Yamcs where protocols cannot | Population analytics and fleet anomaly correlation; reliability engineering across the population; cost-per-satellite reporting; published throughput and fleet-size benchmarks; AI operator assistant; AI fleet tasking; supervision of on-board autonomy; autonomous CA hooks; AOS/USLP, CSP; ST[18]/[22]; 70-31 SSM and PLUTO import; Open MCT/Grafana bridge; transparent pricing with security in the base tier |

**Phase 3 was moved forward** from the previous roadmap, where its contents sat in "Should" and "Differentiator" buckets after everything else.

### 6.4 What the gap analysis does not tell you

Stated plainly because the previous version implied more completeness than it had: no effort or cost estimate per item; no buy-vs-build decision per item (half the musts have open implementations to wrap — `sleapi-j`, Orekit, CCSDS reference stacks — but no item says which); **no target ConOps**; no definition of done per gap; no non-software readiness items (ICD, flight ops plan, contingency procedures, trained operators, 24/7 support, SLA); no validation of the PUS core list (it is an inference — the first customer's ICD overrides Phase 2); no commercial model.

**The single most useful thing to add next is engineer-months per item against a team size.** Without it the roadmap is a wish list in dependency order.

---

## 7. Architecture v3 — the live design

Workspace: `Architecture_v3\`.

### 7.1 Method — the rules of this workspace

- **One decision per file, and nothing is true until it is written down.** The failure mode of v2.2 was not bad decisions; it was unmade ones — roughly half the review findings are "the architecture does not say". If a question comes up and we answer it in conversation, it becomes an ADR before we move on.
- **Decisions before services.** The service list is an output, not an input. v2.2 started from 31 services and derived the targets; the result was targets that contradict each other. Order here: operations concept → quality attributes with their verification → decisions → services.
- **Every quality target carries three things or it does not exist:** a number, how it is measured and from where, and what happens when it is missed.
- **Every component carries a blast radius:** one satellite, one tenant, or the fleet. This is the single artifact v2.2 was most missing.
- **Fleet-first data model**, decided before Phase 0, not retrofitted.

### 7.2 Decisions taken

**ADR-0001 — Operating envelope.** LEO, 1 to 500 satellites, all customer categories, one core. First deployments 1–5. Tractable only under four conditions that are part of the decision: (1) the data model is designed for 500 from day one; (2) deployment is a profile not a build — Small, Standard, Sovereign — each naming which components run *and which quality targets do not apply to it*; (3) customer categories are capability sets, not forks; (4) scale claims are stated as "designed for 500, demonstrated at N" with N published. Honest cost: roughly a third more design effort before any code.

**ADR-0002 — Build the commodity core ourselves.** With four conditions: (1) commodity means commodity — the frame, packet, COP-1 and dictionary implementations get no inventions, they implement the Blue Books and nothing more; (2) protocol scope follows the first customer's ICD, not the standard; (3) we measure ourselves against the free alternative continuously — if a reviewer cannot name what our frame processing does that Yamcs does not, we are spending engineering on parity, which is acceptable for control but not acceptable unnoticed; (4) published CCSDS reference stacks are read, not ignored. Roughly eight services of the thirty-odd are parity work. **The differentiating layer must be funded in parallel, not after — if the commodity layer absorbs all capacity, the result is a worse Yamcs.**

### 7.3 The 18 open decisions

Ordered by how expensive they become if deferred. All `open`.

| ID | Question | Raised by |
|---|---|---|
| 0003 | Is the data model fleet-first (satellite attributes, groups, per-satellite versions) from day one? | D1, D18, D19 |
| 0004 | What is the authority for a telemetry value, per time horizon? | cross-cutting |
| 0005 | Where does the command authority credential live, and does the encoder enforce a second gate? | B3 |
| 0006 | Does the link gateway validate the forward-link epoch? | B1 |
| 0007 | Does the forward-link state write precede or follow emission? | B16 |
| 0008 | What is the load-shedding order, stage by stage, antenna to screen? | A2 |
| 0009 | What is the failure mode of policy evaluation on the command path? | B11 |
| 0010 | How is the current-value table rebuilt, and in what time? | A6 |
| 0011 | Is bundle version part of the archive key? | D7 |
| 0012 | How is simulation isolated from flight — structurally, not by convention? | D4 |
| 0013 | What is the cross-store consistent recovery point, and what reconciles stores after failover? | C2 |
| 0014 | How is split-brain prevented across regions? | C4, B2 |
| 0015 | Can the deploy freeze be expressed per shard rather than per cluster? | C1 |
| 0016 | What is the minimum deployment profile, and which targets do not apply to it? | C10 |
| 0017 | Which components own observability, and how is the latency budget measured per hop? | C12 |
| 0018 | What is the blast radius of each component, and which fleet-wide stops are acceptable? | C15 |
| 0001 | *(decided — see ADR-0001)* | — |
| 0002 | *(decided — see ADR-0002)* | — |

**ADR-0003 is the enabling decision and is blocked on nothing.** Do it first.

The review's recommended answers, where it had one:

- **0006** → Yes, and a station session admits exactly one engine identity. Without this the fencing design does not reach the antenna.
- **0005** → HSM, pinned key ID, and the signature covers an approval attestation, not just the command body.
- **0011** → Yes, or re-derivation is impossible and reprocessing destroys evidence.
- **0007** → Precede, and re-budget Q-03 accordingly. This single unstated ordering is the difference between missing a latency target and duplicating commands.
- **0004** → Name one authority per horizon and add scheduled reconciliation (row counts and checksums per satellite-day) with the gap ledger as the independent expectation.
- **0008** → Alarms > command status > live telemetry > history > analytics is a defensible default; the point is that it is chosen rather than discovered.
- **0009** → Fail-closed, with a bundle max-age past which it denies, and an alarm on bundle staleness.
- **0010** → A compacted parameter topic is the only cheap answer; otherwise state the rebuild time honestly and accept that Q-10 does not hold for interlocked commanding.
- **0012** → Separate deployment, separate Kafka, distinct spacecraft ID range and tenant prefix, archive rejects non-LIVE origin at write time.
- **0013** → A global consistency marker stamped across Kafka, PostgreSQL, etcd and ClickHouse, plus a stated authority on conflict and a post-failover reconciliation runbook.
- **0014** → Region generation number mixed into every fencing epoch, with uplink disable and station-tunnel teardown as the *first* step of any failover.

Also recommended and not yet an ADR: separate the spool devices (housekeeping and bulk on different filesystems, reserved capacity for real-time VCs); COP directives get an authorisation, approval and audit path plus a ground-computed safe range for V(R); spacecraft reset advances a CVT epoch; per-tenant resource quotas at every shared store; Keycloak HA with a degraded-mode token policy so read-only monitoring survives an identity outage; a cost model per satellite / pass / tenant; **a blast-radius table — the most useful single artifact the architecture is missing, and a day's work.**

---

## 8. The learning notebook

Location: `D:\MCS-Designing-Phase\VYUH-DETAILS\VYUH-Notebook\`

### 8.1 What it is and why it exists

A hand-written-notes-style interactive textbook that walks the architecture from first principles, day by day. Its purpose is to make the design decisions understandable to someone who is not already a ground-segment engineer — both the technical and the non-technical side of each idea — before those decisions get locked into ADRs. It is a teaching artifact and a thinking artifact, not documentation of what exists.

### 8.2 Structure

14 chapters, 106 topics, 33 days across 7 weeks.

| Ch | Title | Days | Status |
|---|---|---|---|
| 1 | Groundwork — the domain | 1–3 | **all 3 days written** |
| 2 | Groundwork — the engineering | 4–6 | **all 3 days written** |
| 3 | Requirements & operations concept | 7–9 | contents only |
| 4 | Quality attributes & constraints | 10–11 | contents only |
| 5 | Context & boundaries | 12 | contents only |
| 6 | The fleet data model | 13–15 | contents only |
| 7 | Domains & services | 16–18 | contents only |
| 8 | Data, events & store authority | 19–20 | contents only |
| 9 | Critical paths & budgets | 21–22 | contents only |
| 10 | Failure, recovery & blast radius | 23–25 | contents only |
| 11 | Security & governance | 26–27 | contents only |
| 12 | Deployment, profiles & operations | 28–29 | contents only |
| 13 | Verification | 30–31 | contents only |
| 14 | Build sequence | 32–33 | contents only |

**Chapter 1** covers: what a ground segment is; inside a ground station; the pass; bands and link budget; CCSDS frames; the wire format; packets inside frames; virtual channels; commanding and its five gates; PUS; the telemetry dictionary; the three clocks; how data reaches you (SLE RAF/RCF/ROCF, F-CLTU); flight dynamics.

**Chapter 2** covers: at-least-once vs exactly-once *effects*; idempotency keys; leases and fencing tokens; consensus store placement; log vs database authority; two storage engines; backpressure and shedding order; consistent recovery points; state machines; blast radius; fail-closed vs fail-open; SLI/SLO/error budget.

### 8.3 How it is built

React 19, no bundler dependency on npm install — a single `build.mjs` using the globally installed esbuild produces one self-contained `notebook.html` (~344 KB) with everything inlined.

```
VYUH-Notebook\
  notebook.html          the built single-file app — open this
  index.html             redirect to notebook.html
  app\
    build.mjs            esbuild → notebook.html
    src\
      main.jsx  App.jsx  Contents.jsx  styles.css
      lib\sketch.jsx     Box, Arrow, Label, RoughFilter — hand-drawn SVG primitives, deterministic seeded wobble
      lib\store.js       useStored (localStorage, try/catch), useTheme, useRoute, go()
      components\index.jsx  Stamp, Topic, Voice, Sticky, Cards, Card, Figure, Tbl, DayTabs, Quiz, Goals
      data\book.js       BOOK (14 chapters), WEEKS, TOTAL_TOPICS
      chapters\index.js  route table → ch01, ch01d2, ch01d3, ch02, ch02d2, ch02d3
      chapters\ch01\     index.jsx, Day1.jsx, Day2.jsx, Day3.jsx
      chapters\ch02\     index.jsx, Day1.jsx, Day2.jsx, Day3.jsx
      diagrams\          16 SVG diagram components
```

**To rebuild:** `node build.mjs` from `app\`. It writes `notebook.html` one level up. There is no `npm install` step and no `node_modules` in the tree.

**Interactives already built:** `PassPlay` (elevation slider using real geometry — `lam(E) = acos(R/(R+H)·cos E) − E`, `PERIOD = 2π√((R+H)³/μ)/60`), `FrameMap` (clickable frame field → explanation), `PacketsInFrames` (packet-size slider → first-header-pointer values), `Calibration` (raw 12-bit count → `volts = 0.0082·raw + 18.0` against four limit bands), `Fencing` (toggle the fence, watch the zombie writer get rejected), `Backpressure` (arrival-rate slider against a fixed 100/s service rate).

### 8.4 Design system

Handwriting fonts from Google Fonts: Kalam (body), Caveat (headings and labels), Special Elite (typewriter), with Segoe Print / Segoe Script / Comic Sans fallbacks. Ruled-paper background via `repeating-linear-gradient` with a red margin rule; sticky notes with a tape pseudo-element. Light and dark tokens in the three-block pattern (`:root`, `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])`, `:root[data-theme="dark"]`).

### 8.5 To continue it

Chapter 3 (Requirements & operations concept) is next and **is blocked** on the ConOps answers in §10. Write a day as a new `DayN.jsx` under `chapters/chNN/`, register the route in `chapters/index.js`, mark the chapter `ready` in `data/book.js`, and rebuild. Every day carries: topics with both a technical and a plain-language explanation, at least one diagram, at least one interactive where the idea has a knob worth turning, a quiz, and an end-of-day goals checklist with its own `storeKey`.

**Always verify by rendering.** Run the page in headless Chromium, count `.topic` and `svg` elements, drive the interactives, capture `pageerror`, and screenshot each SVG to check for text overflowing its box or a label clipped at the viewBox edge. Several defects in this notebook were only visible in a screenshot. Google Fonts is blocked from some sandboxes — a `ERR_TUNNEL_CONNECTION_FAILED` console error for fonts is expected and benign.

---

## 9. The plan — what to do next, in order

### Track A — finish the design (the blocking track)

1. **ADR-0003, fleet-first data model.** Nothing else in v3 can be specified until this lands. Satellite identity and attributes, groups, per-satellite dictionary and OBSW versions, campaign state. It is the enabling condition of ADR-0001 and the fix for review D1/D18/D19 and the whole constellation layer.
2. **Write `00-context/operations-concept.md`** from Akash's answers in §10. Gap priorities cannot be settled without it, and the operator-to-satellite ratio is unanswerable without it.
3. **The blast-radius table** (`03-cross-cutting/blast-radius.md`) — one satellite / one tenant / the fleet, per component. A day's work and the most useful missing artifact. This becomes ADR-0018.
4. **The six "before any more code" decisions** — 0006, 0005, 0003, 0011, 0007, 0004 — as one-page ADRs each, using the review's recommended answers in §7.3 as the starting position, not the conclusion.
5. **Re-derive the quality attributes** (`00-context/quality-attributes.md`) with the §5.3 contradictions resolved. Each target carries a number, a measurement point, and a miss policy, or it does not exist.
6. **Then, and only then, the service model** (`02-model/`) — one file per service, each answering "what does this look like at 1, at 20, at 500".

### Track B — make the prototype real (can run in parallel)

Phase 0 of the roadmap, against the existing `D:\Vyuh-Mcs` code:

1. **Persistent archive.** Replace synthetic history with a real store (TimescaleDB per the roadmap; reconcile with v2.2's ClickHouse choice before building — this is an open question the roadmap and the architecture answer differently). Frames, packets, parameters, events, alarms, command history, audit, plus a retrieval API.
2. **Real Kafka and Redis** in place of the in-memory stand-ins.
3. **Real identity** — OIDC/SAML SSO with MFA and named accounts; backend-enforced RBAC, two-person approval, shelving; hash-chained audit with SIEM export.
4. **mTLS between services.**
5. **Active/standby with persisted FOP-1 state** — and, per decision 0007, make the state write precede emission.

**Keep the `bin/verify-*` harness and extend it.** Every decision in Track A should land with a test in `04-verification/` that would prove or disprove it, and where that test is runnable it belongs in the harness.

### Track C — the notebook

Chapter 3 onward, one chapter at a time, after the ConOps answers land. The notebook should stay one chapter *behind* the design, not ahead of it: it explains decisions that have been made, so writing a chapter is a check that the decision is explicable.

### Track D — corrections to circulated material

- Fix RS(255,223) in `VYUH_Ground_Segment_Fundamentals.pdf` (see §3.2).
- Remove the Terma pricing and full-SLE claims from competitive material (see §3.4).
- Withdraw the review's Q-09 finding (see §4.3 note).

---

## 10. Questions only Akash can answer

Track A stops at step 2 without these. They are the target **operations concept** — not what exists, what we are designing toward.

1. **How many operators, on what shift pattern?** Follow-the-sun, business hours plus on-call, or lights-out with escalation?
2. **What is automated versus approved?** Which classes of command execute without a human in the loop, and which always need one — and which need two?
3. **What is the target response time** from an alarm page to a human acting on it, and does it differ by severity and by time of day?
4. **What is the operator-to-satellite ratio we are designing for?** Spire publishes "100+ satellites, one person" as a marketing claim. What is our number, and at what fleet size?
5. **What is the data retention obligation** per customer class — and who pays for the cold tier?
6. **Who commands?** Does the customer operate through our console, do we operate for them, or both as separate SKUs? This decides whether the tenant boundary is a UI concern or a deployment concern.
7. **What is the first real customer's mission profile** — band, bus, PUS subset, ground network, satellites in the first year? ADR-0002 condition 2 makes this the thing that scopes Phase 2.

Two more that are not ConOps but block costing:

8. **Team size and shape** for the next four quarters. Without it the roadmap cannot be converted into engineer-months, which §6.4 names as the most useful missing thing.
9. **Buy versus build, per gap item.** Candidates to wrap rather than write: `sleapi-j` for SLE, Orekit for flight dynamics (already the choice in v2.2 service 14), published CCSDS reference stacks for conformance clarification.

---

## 11. Rules of engagement

For whoever — human or agent — works on this next.

- **Nothing is true until it is written down.** The lesson of v2.2 is that unmade decisions cost more than wrong ones.
- **Design for 500, deploy for 5.** Every service specification answers the question at 1, at 20, and at 500, or it is not specified.
- **Every quality target carries a number, a measurement point, and a miss policy.**
- **Every component carries a blast radius.**
- **Commodity means commodity.** No inventions in the frame, packet, COP-1 or dictionary layer. It implements the Blue Books and nothing more.
- **Say "designed and demonstrated" when that is what it is.** A reviewer will test the claims in the "VYUH already has" column.
- **Verify by rendering, not by reasoning.** Screenshot the diagram, run the test, drive the interactive. Several real defects in this project were invisible in the source and obvious in a picture.
- **Do not extend v2.2.** React to it in v3.

---

## 12. One-paragraph summary, if you read nothing else

VYUH-MCS is a working prototype of a satellite mission control system with a thoroughly documented v2.2 architecture (31 services) that was adversarially reviewed and found to be a credible single-spacecraft design that has not been designed for failure or for a fleet — 95 findings, of which the ten worst centre on duplicate commanding when a lease expires, command duplication on region failover, a spacecraft clock reset that locks out recovery commanding, a single signing key that bypasses every authorisation gate, and no defined behaviour under overload. Separately, a web-verified gap analysis established that the entire TM/TC protocol layer is now a free commodity (Yamcs, OpenC3 Core) and that the defensible product is the fleet layer above it: per-satellite configuration with staged rollout, fleet contact economics, population analytics, and a measured operator-to-satellite ratio. Architecture v3 is the live workspace; two decisions are proposed (envelope 1–500 LEO satellites with deployment profiles, and build the commodity core ourselves under four conditions) and eighteen remain open, of which the fleet-first data model is the one that blocks everything else. A 14-chapter interactive notebook teaches the whole domain from first principles and has its first two chapters written. The next move is ADR-0003, the operations concept, and the blast-radius table — and the operations concept needs answers from Akash before it can be written.

---

*Sources for every claim in this document: `VYUH_MCS_Architecture_Review_v2.2.md`, `VYUH_MCS_Gap_Analysis_rev2.md`, `VYUH_MCS_System_Architecture_v2.2.docx`, `Architecture_v3/README.md`, `Architecture_v3/01-decisions/`, and the `D:\Vyuh-Mcs` working tree as of 4 October 2026.*
