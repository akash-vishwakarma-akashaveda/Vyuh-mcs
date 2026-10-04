# Agency and Open-Source Mission Control System (MCS) Software: Capability Inventory (as of Oct 2026)

Scope: ESA SCOS-2000, ESA EGS-CC / EGOS-CC, Yamcs, OpenC3 COSMOS, NASA ITOS, GMSEC, AMMOS (AIT) and Open MCT. Research date 2026-10-04. Items marked [OLDER] come from sources older than about 2023. Items in "Gaps" could not be verified in this session and must not be quoted as fact.

## Q1: What does each product offer out of the box vs. via plugins/extensions?

### Takeaway
Yamcs is the most complete open-source MCS out of the box. It covers CCSDS TM/AOS/USLP and TC frames, COP-1, CLTU (BCH/LDPC), SDLS, CFDP, time correlation, timeline/activities, replication and PUS packet handling, all under one licence. OpenC3 COSMOS Core is a strong generic C2/test system. Its operational features (RBAC, LDAP/SSO, Kubernetes scaling, calendar, autonomic triggers, CFDP and CCSDS TC/TM plugins) are in the paid Enterprise edition. The ESA systems (SCOS-2000, EGS-CC) are complete, PUS-centric, agency-grade and restricted to European entities. ESA is moving from SCOS-2000 to EGS-CC: first operations are planned for 2026, it should be fully operational in 2027, and SCOS-2000 retires no earlier than 2033. The NASA items are mostly components rather than full MCSs: ITOS is a full T&C system; GMSEC is messaging middleware; AIT is a lightweight Python toolkit; Open MCT is a visualisation framework only.

### Cited Findings

**Yamcs (Space Applications Services; open source)**
- Latest version 5.13.6 (Oct 2026). It is a security-hardening release: automatic admin user creation is removed, forwarded headers are only processed from trusted proxies, and several vulnerabilities are patched. It also adds **PUS service 22** support and improves scheduled stack execution. — [Yamcs release notes](https://docs.yamcs.org/yamcs-relnotes/changelog/)
- 5.13.0 (May 2026) added activity chaining ("B starts after successful A"). The timeline shows the relations between activities and has an execution-control bar. — [Yamcs release notes](https://docs.yamcs.org/yamcs-relnotes/changelog/)
- 5.12.6 (Apr 2026) brought redesigned charting (Y-axis zoom, raw values, persistent configurations, fill and step plots). 5.12.2 (Oct 2025) added SDLS with AES-256-GCM. 5.11.0 (Feb 2025) added the Parameter Retrieval Service (one service for archive, replay and cache), an explicit "pending" alarm status and alarm mirroring through replication. 5.10.0 (Aug 2024) requires Java 17 and introduced a single file-transfer page. 5.9.9 (Oct 2024) let command stacks interleave commands, comments and parameter-verification steps. — [Yamcs release notes](https://docs.yamcs.org/yamcs-relnotes/changelog/)
- **TM/TC frames:** Telemetry supports AOS, TM and USLP frames ("to a certain extent all three"). Commands can be packed into TC Transfer Frames and wrapped in CLTUs, with BCH, LDPC64, LDPC256 or custom encoding plus randomisation. Frame error control can be none, CRC16 or CRC32; USLP supports all three. — [Yamcs CCSDS frame processing](https://docs.yamcs.org/yamcs-server-manual/links/ccsds-frame-processing/)
- **COP-1:** Fully implemented (FOP side), with AD, BD and BC frames, configurable timeouts and retransmission limits. — [Yamcs CCSDS frame processing](https://docs.yamcs.org/yamcs-server-manual/links/ccsds-frame-processing/)
- **SDLS:** Built in, using AES-256-GCM authenticated encryption with configurable Security Parameter Indices and sequence-number windows. — [Yamcs CCSDS frame processing](https://docs.yamcs.org/yamcs-server-manual/links/ccsds-frame-processing/)
- **Data links:** File-polling, TCP and UDP links for TM; TCP and UDP links for TC and TM/TC; a UDP parameter link; a TSE (test equipment) link; a Yamcs-to-Yamcs cascading link. Links share a packet preprocessor and a command postprocessor, and there is a PUS packet preprocessor. — [Yamcs data links](https://docs.yamcs.org/yamcs-server-manual/links/), [PUS packet preprocessor](https://docs.yamcs.org/yamcs-server-manual/links/packet-preprocessor/pus/)
- **Services included:**
  - Global: HTTP server, Process Runner, TSE Commander, Replication Server.
  - Instance: Alarm Recorder, Command History Recorder, Event Recorder, CCSDS TM Index, Parameter Archive, Parameter List, Parameter Recorder, Parameter Retrieval, Processor Creator, Replay Server, System Parameters, XTCE TM Recorder, Time Correlation, Timeline, Replication Master and Slave, CFDP, File Listing, CFS Event Decoder (NASA cFE events), Alarm Mirroring.
  - Source: [Yamcs services](https://docs.yamcs.org/yamcs-server-manual/services/)
- **Time-tagged commanding (PUS ST[11]):** There is a PUS postprocessor package (`org.yamcs.tctm.pus`). A third-party fork from Pixxel (a commercial EO constellation operator) made TC(11,4) scheduling configurable and added the `pus11SubscheduleId` and `pus11GroupId` command options. This shows constellation operators extending Yamcs for ST[11]. — [Yamcs javadoc pus](https://docs.yamcs.org/javadoc/yamcs/latest/org/yamcs/tctm/pus/package-summary.html), [pixxelhq/yamcs PR #229](https://github.com/pixxelhq/yamcs/pull/229)
- **Mission database:** Organised as hierarchical "space systems" using XTCE terminology. It has data types, parameters, containers, alarms, algorithms, command definitions and loaders. Since 5.8.8, chosen sub-trees can be read/write, so subsystems, parameters and types can be added at runtime and saved to disk. — [Yamcs MDB](https://docs.yamcs.org/yamcs-server-manual/mdb/)
- **Main functional areas:** MDB, Data Management, Data Links, Processors, Commanding, Activities, Timeline, Services, Security, Web Interface, Programs. — [Yamcs server manual](https://docs.yamcs.org/yamcs-server-manual/)
- **Open MCT integration:** The `openmct-yamcs` plugin connects Open MCT to Yamcs. — [nasa/openmct README](https://github.com/nasa/openmct)

**OpenC3 COSMOS (Ball Aerospace COSMOS successor)**
- Described as "a cloud native, containerized, microservice oriented command and control system", built as a suite of applications. — [OpenC3 docs](https://docs.openc3.com/docs)
- **Core (open source):** Command and control, telemetry processing, Script Runner (Ruby and Python), packet logging and replay. — [OpenC3 Enterprise page](https://openc3.com/enterprise/)
- **Enterprise only:**
  - User accounts with RBAC; LDAP and SSO through Keycloak.
  - Kubernetes clustering and horizontal scaling; multi-environment "scopes" with hard isolation.
  - Calendar scheduling for passes, contacts and scripts; Autonomic triggers and reactions.
  - Enterprise plugin library: **CFDP, CCSDS TC/TM**, ground-station integrations.
  - 40 hours a year of developer support, monthly releases, commercial licence with no copyleft.
  - Source: [OpenC3 Enterprise page](https://openc3.com/enterprise/)
- **Enterprise pricing:** Single Purpose $33,000/yr, Product Line $100,000/yr, Multi-Product $165,000/yr. No seat, node or licence-key limits. — [OpenC3 Enterprise page](https://openc3.com/enterprise/)
- **Recent releases:** v7.4.1 is the latest. It moves to Debian trixie base images to close CVEs, updates Telemetry Viewer immediately and adds scatter plots. v7.4.0 introduced the "Bridge" concept for secure hardware control. v7.2.0 added an **MCP server and AI Chat** (Enterprise) and rewrote the Grafana integration. v7.1.0 added TSDB metrics and Enterprise sharding. — [OpenC3 releases](https://github.com/OpenC3/cosmos/releases)
  - The date the fetch reported for v7.4.1 (24 Sept 2024) looks wrong for a v7.x line and is probably 2025 or 2026. Check before quoting.
- **Telemetry definition (own text format):**
  - Packets and items: `TELEMETRY`, `ITEM`, `APPEND_ITEM`, `ID_ITEM`, `ARRAY_ITEM`.
  - Limits: `LIMITS` gives red/yellow low/high bands plus an optional green operational band, named limit sets (DEFAULT is required, plus others such as TVAC), persistence and enable/disable. `LIMITS_RESPONSE` attaches custom reaction classes.
  - Derived and conversions: `DERIVED` items computed with `READ_CONVERSION`, `POLY_READ_CONVERSION`, `SEG_POLY_READ_CONVERSION` or `GENERIC_READ_CONVERSION` (Ruby or Python). `STATE` maps values to text.
  - `PROCESSOR` runs code on every packet. Items can be `HIDDEN` or `OBFUSCATE`d.
  - Source: [OpenC3 telemetry config](https://docs.openc3.com/docs/configuration/telemetry)

**ESA SCOS-2000**
- ESA's generic MCS, developed by ESOC with European industry. Reached Release 6.0 and descends from SCOS-II (Huygens, SOHO). It has a commanding chain (CCSDS frames, manual and automatic loading, constraint validation), a telemetry chain (CCSDS frames and packets over SLE) and an archive. — [Wikipedia SCOS-2000](https://en.wikipedia.org/wiki/SCOS_2000)
- Missions include Mars Express, Venus Express, Rosetta, Gaia, XMM-Newton and INTEGRAL. It is ESA-owned and licensed, available to European industry on varying terms. Integrators include CGI, GMV, SCISYS, Terma, Telespazio VEGA and CS. — [Wikipedia SCOS-2000](https://en.wikipedia.org/wiki/SCOS_2000)
- **MIB:** The TM/TC database is a set of ASCII tables defined by the SCOS MIB ICD and built for each mission. — [Planck LFI paper, arXiv 1001.4730](https://arxiv.org/pdf/1001.4730) [OLDER, 2010]
- **TC verification** is defined in the MIB, so criteria and time windows can differ per command. Global settings cover space-link propagation delay and timing jitter. — [ESAW "Advanced Telecommand Verification" (Armitage)](https://indico.esa.int/event/93/contributions/3576/attachments/2798/3255/1530_Armitage.pdf)
- Built around PUS. Packets must follow PUS, so non-PUS spacecraft are not supported natively. — [Planck LFI paper](https://arxiv.org/pdf/1001.4730) [OLDER]
- **Surrounding MICONYS suite:**
  - MOIS and ProToS for procedures; MATIS for automation (executes a customised form of **PLUTO**).
  - DABYS for the database; FOPPER.
  - Source: [SpaceOps 2025 "Towards EGS-CC at ESOC"](https://publications.spaceops.org/2025/download_by_id.php?id=0477), [ESAW EGS-CC MCS infrastructure paper](https://indico.esa.int/event/180/contributions/1367/attachments/1248/1473/0930_Pecchioli_-_Paper.pdf)

**ESA EGS-CC / EGOS-CC**
- **What it is:** A common European core for both MCS (operations) and EGSE/AIT. Its architecture is open, component-based and service-oriented, and it is designed to scale. — [Wikipedia EGS-CC](https://en.wikipedia.org/wiki/EGS-CC), [ESA](https://www.esa.int/Enabling_Support/Operations/Ground_Systems_Engineering/First_test_of_Europe_s_new_space_brain)
- **Status (SpaceOps 2025, ESOC):**
  - In April 2024 ESOC re-confirmed that its next-generation MCS will be based on EGS-CC.
  - Swarm is the pilot (legacy migration). Ariel (first SVTs 2027, launch 2029) is the first new mission.
  - First operations in 2026, fully operational for ESA missions in 2027.
  - Transition takes at least 7 years across more than 40 ESOC missions; SCOS-2000 end of life no earlier than 2033.
  - Source: [SpaceOps 2025 #477](https://publications.spaceops.org/2025/download_by_id.php?id=0477)
- **Layering and recent work:** ESOC's mission-specific layer on top of EGS-CC is called MCS-CC. Recent work covers:
  - Pre-release command checks, playback TM processing, an SLE link UI.
  - Historical retrieval, refurbished **time correlation**, on-board queue modelling.
  - Smaller memory footprint and usability fixes.
  - **Not yet operational** (next on the roadmap): file-based operations, on-board software maintenance, security, PUS-C operational use cases and the Generic Operational Interface Requirements.
  - Source: [SpaceOps 2025 #477](https://publications.spaceops.org/2025/download_by_id.php?id=0477)
- **Database:** EGS-CC uses its own Tailoring Data Model (TDM) instead of the SCOS MIB, with a MIB-to-TDM converter. OPEN-M (Operations Preparation Environment) replaces MOIS, ProToS, MATIS preparation, FOPPER and DABYS. Automated execution is native in EGS-CC. — [SpaceOps 2025 #477](https://publications.spaceops.org/2025/download_by_id.php?id=0477), [ESAW OPEN paper](https://indico.esa.int/event/180/contributions/1369/attachments/1263/1488/1400_Trifin_-_Paper.pdf)
- **Archive:** Stores frames, packets, parameters, events, logs, alarm states and control activities. It is web-based, giving "installation free" access from any authorised device. — [SpaceOps 2025 #477](https://publications.spaceops.org/2025/download_by_id.php?id=0477)
- **Shadow operations:** First contact with Swarm through Kiruna on 19 Nov 2022; first commanding of Swarm-B on 19 Jan 2023. From 2025 new ESA missions are to use EGOS-CC, and it is "freely available to European entities under ESA Community licence". — [ESOC EGOS-CC article](https://esoc.esa.int/content/egos-cc-commanding-satellites-shadows)
- **Conflict:** Wikipedia names JUICE as the first official EGS-CC adopter. The 2025 ESOC paper names Swarm (migration) and Ariel (first new mission) and does not mention JUICE. — [Wikipedia SCOS-2000](https://en.wikipedia.org/wiki/SCOS_2000) vs [SpaceOps 2025 #477](https://publications.spaceops.org/2025/download_by_id.php?id=0477)

**NASA ITOS (GSFC)**
- A suite for processing, displaying, storing and monitoring TM and generating TCs. It serves flight operations, I&T and development. — [NASA Spinoff 2010](https://spinoff.nasa.gov/Spinoff2010/ct_6.html) [OLDER]
- **Automation:** Uses STOL (System Test and Operations Language). The STOL interpreter, configuration monitor and schedule executor support lights-out operations. STOL can hold a command until telemetry confirms a condition. — [NASA Spinoff 2010](https://spinoff.nasa.gov/Spinoff2010/ct_6.html), [nasa/stol-mode](https://github.com/nasa/stol-mode)
- **Adoption:** At the time of that source it supported 15 orbiting satellites with 6 more in development. — [NASA Spinoff 2010](https://spinoff.nasa.gov/Spinoff2010/ct_6.html) [OLDER, 2010]

**NASA GMSEC**
- Middleware and a messaging API with standard message formats. Components include the API, GSS (GMSEC Support System), GREAT and the Criteria Action Table. It is open source under NOSA. GSS 4.0 is built on Open MCT. — [GMSEC overview Aug 2024](https://www.nasa.gov/wp-content/uploads/2024/08/gmsec-overview-august-2024.pdf), [SpaceOps 2023 #352](https://publications.spaceops.org/2023/download_by_id.php?id=0352)
  - The PDF text extracted poorly. Component names are confirmed; detailed features are not.

**AMMOS Instrument Toolkit (AIT, JPL)**
- **Scope:** Python GDS/EGSE toolkit for commanding, TM uplink/downlink and sequencing on instruments and CubeSats. It grew out of ISS instrument tools.
- **Features:** YAML command/TM dictionaries, limits, EVRs, CCSDS packets, a server with plugins, an Open MCT plugin, and CFDP through AIT-DSN.
- **Licence and activity:** MIT licence; about 650 commits, 99 open issues.
- Source: [NASA-AMMOS/AIT-Core](https://github.com/NASA-AMMOS/AIT-Core), [SPIE 2018](https://ui.adsabs.harvard.edu/abs/2018SPIE10769E..14J/abstract)
- **AMMOS SmallSat Toolkit:** Deploys AIT, Open MCT and the AIT Sequence Editor on AWS EC2 (RHEL 8). — [AWS quickstart](https://aws-ia.github.io/cfn-ps-ammos-smallsat-toolkit/)

**NASA Open MCT (Ames / JPL MGSS)**
- A visualisation framework, not a full MCS. It provides plots, tables, display layouts, conditional styling, notebooks and timelines/plans, and connects to data sources through telemetry adapter plugins. Apache 2.0 licence; built on Vue 3; 13.2k GitHub stars. — [nasa/openmct](https://github.com/nasa/openmct), [AWS quickstart](https://aws-quickstart.github.io/quickstart-ammos-smallsat-toolkit/)
- Used as the front end by GMSEC GSS 4.0, AIT, Yamcs (plugin) and JPL's MCWS. — [SpaceOps 2023 #352](https://publications.spaceops.org/2023/download_by_id.php?id=0352), [nasa/openmct](https://github.com/nasa/openmct)

### Inferences
- **Out-of-box ranking for a CCSDS/PUS spacecraft MCS:** ESA SCOS-2000 / EGS-CC (complete, but European-only and heavy) > Yamcs > COSMOS Enterprise > ITOS > COSMOS Core > AIT. GMSEC and Open MCT are building blocks, not MCSs.
- **Yamcs is the closest open-source benchmark for VYUH-MCS.** In 2025–2026 it added SDLS, PUS 22, activity chaining and stronger security. Space-link security and timeline automation are now baseline even in open source.
- **COSMOS's open-core model** keeps operations-critical features behind a $33k–165k/yr paywall: RBAC, CFDP, CCSDS TC/TM, scheduling and autonomic reactions. These are the natural comparison points for a commercial MCS.
- **COSMOS v7.2 shipped an MCP server and AI chat.** AI-assistant integration is becoming a differentiator competitors already advertise.

### Gaps
- No product-by-product matrix of PUS services (1, 3, 5, 6, 8, 9, 11, 12, 13, 15, 17, 19, 20, 23) was found for Yamcs, COSMOS, ITOS or AIT. For Yamcs only ST[11] (time-tagged) and ST[22] were confirmed. SCOS-2000 is "PUS-based", but its per-service list (PUS-A/B, and PUS-C coverage) was not retrieved. For EGS-CC, PUS-C operational use is still roadmap work.
- **Yamcs details not confirmed this session:**
  - Algorithm languages (Java/JavaScript/Python).
  - Command verifier stages: the XTCE-style stages are believed to be TransferredToRange, SentFromRange, Received, Accepted, Queued, Execution, Complete and Failed.
  - Command queue model, spreadsheet MDB loader, RBAC model, and on-board memory load/dump support.
- **COSMOS XTCE import/export:** The telemetry config page did not mention it. COSMOS is widely believed to support it, but this is unverified.
- **COP-1:** Not confirmed for COSMOS Core. "CCSDS TC/TM" is listed as an Enterprise plugin.
- **NASA sources:** The ITOS official page (sed.gsfc.nasa.gov) and the EGS-CC site (egscc.esa.int) did not resolve (DNS failure). ITOS licensing, current mission list, DB format and CFDP support are not verified with current sources.
- **AMMOS beyond AIT:** AMMOS components such as AMPCS, MCWS and the CFDP library were not covered.

## Q2: Which capabilities are considered baseline expectations for an operational MCS?

### Takeaway
The surveyed systems share a common baseline:
- CCSDS TM/TC frame and packet processing over SLE or TCP/UDP, with COP-1.
- A mission database of TM/TC definitions with calibrations, derived parameters and limits.
- Alarms and events, plus command verification with per-command stages and time windows.
- Command stacks/queues and time-tagged (on-board scheduled) commanding.
- An archive with replay and retrieval, and time correlation.
- Procedure automation (PLUTO, STOL, Python/Ruby) and web or desktop displays.

The newer "baseline" items in 2025–2026 are SDLS, CFDP/file-based operations, RBAC/SSO, horizontal scaling or replication, web access and timeline/activity automation.

### Cited Findings
- **ESA's SCOS-2000 baseline:** a commanding chain with constraint validation and manual/automatic loading; a telemetry chain over SLE; an archive. — [Wikipedia SCOS-2000](https://en.wikipedia.org/wiki/SCOS_2000)
- **ESOC's EGS-CC must-haves for Swarm:**
  - Pre-release command checks, playback telemetry processing, SLE link handling.
  - Historical retrieval and display, time correlation, on-board queue modelling.
  - Next tier: file-based operations, on-board software maintenance (memory load/dump), security, PUS-C/GOIR.
  - Source: [SpaceOps 2025 #477](https://publications.spaceops.org/2025/download_by_id.php?id=0477)
- **The EGS-CC archive must hold** frames, packets, parameters, events, logs, alarm states and control activities, handle performance peaks and support many filter combinations. — [SpaceOps 2025 #477](https://publications.spaceops.org/2025/download_by_id.php?id=0477)
- **Per-command TC verification criteria and time windows** (allowing for propagation delay and jitter) are a key SCOS-2000 strength compared with systems that assume one criterion for every command. — [ESAW Armitage](https://indico.esa.int/event/93/contributions/3576/attachments/2798/3255/1530_Armitage.pdf)
- **ITOS lights-out operations** rely on STOL automation, a configuration monitor and a schedule executor. — [NASA Spinoff](https://spinoff.nasa.gov/Spinoff2010/ct_6.html) [OLDER]
- **COSMOS Enterprise sells as operational features:** RBAC, SSO, multi-environment isolation, calendar/pass scheduling, autonomic triggers and CFDP. — [OpenC3 Enterprise](https://openc3.com/enterprise/)
- **Yamcs ships as standard:** SDLS, CFDP, time correlation, replication and timeline. — [Yamcs services](https://docs.yamcs.org/yamcs-server-manual/services/), [frame processing](https://docs.yamcs.org/yamcs-server-manual/links/ccsds-frame-processing/)

### Inferences
- **Treat as table stakes for VYUH-MCS:**
  - Uplink: COP-1, CLTU encoding, SLE, per-command verification stages, on-board queue (ST[11]) modelling.
  - Data: derived parameters, limit sets/persistence, archive, replay and retrieval.
  - Security and operations: SDLS, CFDP, RBAC/SSO, procedure language, web UI.
- **Differentiators for an agency-grade customer:** an operations-preparation and database toolchain (MIB/XTCE import, validation and versioning, like OPEN-M) and on-board software maintenance.

### Gaps
- No single published "baseline requirements" standard was retrieved for MCS functions, such as ECSS-E-ST-70-31 (monitoring & control data definition), ECSS-E-ST-70-32 (PLUTO) or the ESOC GOIR. They should be consulted directly.

## Q3: What do current users (missions, companies) say are strengths/weaknesses?

### Takeaway
User evidence is thin and mostly comes from agency papers.
- **SCOS-2000:** praised as mature and efficient; criticised as obsolete (hardware and OS).
- **EGS-CC:** praised for its common code base, native automation, automatic testing and web access. Weaknesses are UI usability issues, process overhead in a large community, archive cost/performance and the slow migration.
- **Yamcs:** commercial constellation operators (e.g. Pixxel) fork and extend it, which signals adoptability but also missing features (PUS 11 configurability).
- **COSMOS:** its weakness is the paywall on operational features.

### Cited Findings
- **SCOS-2000 strength:** "a mature baseline, which is able to very efficiently serve the needs of operating satellites at ESOC". — [SpaceOps 2025 #477](https://publications.spaceops.org/2025/download_by_id.php?id=0477)
- **SCOS-2000 weakness:** "signs of obsolescence… can no longer be ignored". Replacement hardware is hard to source and the operating systems are no longer updated. — [SpaceOps 2025 #477](https://publications.spaceops.org/2025/download_by_id.php?id=0477), [ESOC article](https://esoc.esa.int/content/egos-cc-commanding-satellites-shadows)
- **EGS-CC strengths (ESOC):**
  - The automatic testing approach "proven to be highly beneficial".
  - Native automation, giving a smooth path from manual to automated operations.
  - A common data model from pre- to post-launch (AIT to operations).
  - Web access with no installation.
  - Source: [SpaceOps 2025 #477](https://publications.spaceops.org/2025/download_by_id.php?id=0477)
- **EGS-CC weaknesses (ESOC):**
  - "A significant part of issues… concentrated around user interface issues". This led to UI customisation initiatives.
  - Community development "implies some overhead in processes" compared with SCOS.
  - Archive storage/retrieval balance and total cost of data ownership needed significant optimisation.
  - Moving to the new data model "must not be underestimated".
  - Source: [SpaceOps 2025 #477](https://publications.spaceops.org/2025/download_by_id.php?id=0477)
- **SCOS-2000 PUS dependence:** it "will not work for other types of satellite which do not use PUS". — [Planck LFI](https://arxiv.org/pdf/1001.4730) [OLDER]
- **Yamcs at Pixxel:** Pixxel keeps a public fork with PUS ST[11] scheduling and simulator changes. — [pixxelhq/yamcs PR #229](https://github.com/pixxelhq/yamcs/pull/229)
- **AIT:** "light-weight and easily configured", aimed at instruments and CubeSats. — [SPIE 2018](https://ui.adsabs.harvard.edu/abs/2018SPIE10769E..14J/abstract)
- **COSMOS:** The vendor page names no customers. — [OpenC3 Enterprise](https://openc3.com/enterprise/)

### Inferences
- **Openings for VYUH-MCS:**
  - The EGS-CC migration is slow (complete only in the early 2030s) and has UI pain.
  - Yamcs/COSMOS users must self-integrate PUS or pay for operational features.
  - So a commercial MCS can compete on: PUS-C completeness, polished operator UX, MIB/XTCE migration tooling, and bundled RBAC/CFDP/SDLS.

### Gaps
- No independent user reviews (forums, surveys) were found comparing Yamcs and COSMOS in operations.
- Named Yamcs operational missions were not retrieved this session. The Yamcs website "users" list and ESA/ESOC uses (e.g. Columbus/ISS payloads) should be checked.
- Named COSMOS operational missions were not retrieved.
- ITOS's current user base (beyond 2010 figures) and GMSEC adoption numbers were not retrieved.
- Redundancy/HA details are missing for SCOS-2000, EGS-CC and ITOS.
