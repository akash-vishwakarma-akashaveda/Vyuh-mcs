# CCSDS and ECSS standards an operational satellite MCS is expected to implement

Status as of October 2026. Version identifiers were checked against the files currently hosted on ccsds.org/Pubs (an HTTP 200 for the file name, e.g. `732x1b3e1.pdf` = 732.1-B-3 with Editorial Change 1) and against the ECSS active-standards list. Where I could not confirm the current issue, it is listed under Gaps.

## Q1. What each standard requires of ground software (checklist)

### Takeaway
PUS-C (ECSS-E-ST-70-41C, 2016) is still the published ECSS edition. A Rev.1 draft went to public review from December 2024 to February 2025. It removes ST[8], adds ST[24] to ST[27] (file transfer, file data storage, parameter extraction, critical packet log), and reworks ST[1] and ST[3]. The standard explicitly assumes that the ground segment "implements all standardized capabilities". The CCSDS link, SLE and navigation-message stack is mature, and most of it was reissued between 2020 and 2024.

### Cited Findings

**ECSS ground standards: current versions**
- ECSS-E-ST-70C Ground systems and operations, 31 Jul 2008. ECSS-E-ST-70-01C, 16 Apr 2010. **ECSS-E-ST-70-11C Rev.1 (space segment operability), 15 Oct 2025**. ECSS-E-ST-70-31C, 31 Jul 2008. ECSS-E-ST-70-32C (PLUTO), 31 Jul 2008. ECSS-E-ST-70-41C, 15 Apr 2016. ECSS-E-ST-50C Rev.2, 5 Dec 2024. ECSS-E-ST-80C "Security in space systems lifecycles", 1 Jul 2024 — [ECSS active standards](https://ecss.nl/standards/active-standards/)
- ECSS-E-ST-70-31C defines the monitoring and control data that a supplier delivers with a product, so that the customer can do integration, testing and operations. It is expressed as the Space System Model (SSM): a hierarchy of System Elements with entity and value types. Ground impact: the MCS database must be able to import and represent SSM-style data (parameters, calibrations, limits, commands, procedures) — [ECSS-E-ST-70-31C](https://ecss.nl/standard/ecss-e-st-70-31c-ground-systems-and-operations-monitoring-and-control-data-definition/), [Globalspec summary](https://standards.globalspec.com/std/1266532/E-ST-70-31C)
- PLUTO (ECSS-E-ST-70-32C) is used in end-to-end automation chains, for example MOIS with PLUTO, where procedures are authored and then executed by the MCS — [AIAA 2014-1833](https://arc.aiaa.org/doi/pdf/10.2514/6.2014-1833). EGS-CC, the European common core, builds on the 70-31 conceptual data model — [EGS-CC CDM utilisation](https://indico.esa.int/event/93/contributions/3554/attachments/2826/3283/01.2015-03-24_EGS-CC_CDM_Utilization_v5.pdf)
- ESA's Generic Operability Interface Requirements (GOIRD) are the operability counterpart that ESA applies to spacecraft — [ESA GOIRD slides](https://indico.esa.int/event/338/contributions/5709/attachments/4007/5912/1500%20-%20Operability%20GOIRD%20v1.pdf)

**ECSS-E-ST-70-41C (PUS-C): general rules**
- All services are optional. Each service is implemented at a level made of capability sets, and the minimum capability set is always included. The PUS is a "menu" tailored per application process. Ground-segment requirements "can be derived" and are not specified. The standard "assumes that the mission ground segment … implements all standardized capabilities" — [ECSS-E-ST-70-41C Rev.1 DIR1 §1 (Dec 2024)](https://ecss.nl/wp-content/uploads/2024/12/ECSS-E-ST-70-41C-Rev.1-DIR1(11December2024).pdf); the same text is in the [2016 edition](https://librecube.gitlab.io/standards/spacecan/assets/ECSS-E-ST-70-41C.pdf)
- Rev.1 DIR1 change log: public review ran 12 Dec 2024 to 28 Feb 2025. The changes are:
  - ST[1] request verification is reworked.
  - ST[3] housekeeping is reworked.
  - ST[8] function management is deleted ("not used in current and future missions") and shown as reserved.
  - New ST[24] file transfer (CFDP-based, with a file transaction subservice and a file downlink manager subservice), ST[25] file data storage, ST[26] parameter extraction and ST[27] critical packet log management.
  - Configuration policy is formalised as requirements.
  - ST[18] is renamed "on-board control procedure".
  - Source: [Rev.1 DIR1 change log and table of contents](https://ecss.nl/wp-content/uploads/2024/12/ECSS-E-ST-70-41C-Rev.1-DIR1(11December2024).pdf)
- Rev.1 adopts CFDP for all file transactions between space and ground, uplink and downlink. Several on-board downlink managers can share one CFDP entity, and files are created autonomously in prioritised directories — [Rev.1 DIR1 §6.24](https://ecss.nl/wp-content/uploads/2024/12/ECSS-E-ST-70-41C-Rev.1-DIR1(11December2024).pdf)
- The ECSS site still lists the 15 Apr 2016 edition as the active one — [ECSS active standards](https://ecss.nl/standards/active-standards/)

**PUS-C services: what the space side does and what the ground side needs**

The service descriptions come from [AcubeSAT PUS overview](https://acubesat.gitlab.io/obc/ecss-services/docs/pus-overview.html) and [Rev.1 DIR1](https://ecss.nl/wp-content/uploads/2024/12/ECSS-E-ST-70-41C-Rev.1-DIR1(11December2024).pdf). The ground-side column is my inference from those service semantics.

| ST | Service | What the spacecraft does | Ground-side support needed |
|---|---|---|---|
| 1 | Request verification | Acceptance, start, progress and completion success/failure reports per TC | Command history with per-stage verification state, a failure-code decoder, timeouts, and linking to the source request ID (APID + sequence count) |
| 2 | Device access | Raw read/write to on-board devices | Command builders, raw-data display, an expert-only role |
| 3 | Housekeeping | Periodic HK reports with selectable parameters and rates; create, delete and modify report structures | Decom driven by structure ID; on-board structure definitions kept in sync with the database; UI and commands to create/modify/enable/disable structures; handling of the "report structure" dump |
| 4 | Parameter statistics | Min, max, mean and standard deviation over intervals | Decode and display statistics; reset and report commands |
| 5 | Event reporting | Severity-graded event reports (info and low/medium/high severity); enable/disable per event | Event log, alarms by severity, an event-definition database, enable/disable management |
| 6 | Memory management | Load, dump and check memory | Image management, patch loading, dump-vs-reference comparison, CRC/checksum verification |
| 8 | Function management | Perform function with arguments | Generic function commanding. Removed in Rev.1, but still used by PUS-C 2016 missions |
| 9 | Time management | Time reports and rate control. Rev.1 also covers time control and time distribution | Spacecraft time to UTC correlation (see the time section) and rate commanding |
| 11 | Time-based scheduling | Insert, delete, time-shift, enable/disable and report the time-tagged TC schedule; sub-schedules and groups | A ground model of the on-board schedule, a schedule-dump comparison, a free-space budget, and uplink of time-tagged commands with correct time encoding |
| 12 | On-board monitoring | Parameter limit, expected-value and delta checks plus functional monitoring, raising ST[5] events | Configuration of the on-board monitoring definitions, matched against ground limits |
| 13 | Large packet transfer | Splitting into and reassembling from segments | Reassembly on downlink, segmentation on uplink |
| 14 | Real-time forwarding control | Choose which reports are sent to the ground in real time | Commanding UI and a ground mirror of the forwarding tables |
| 15 | On-board storage and retrieval | Packet stores; downlink by time range or packet range; filtering | Playback planning, store-status monitoring, gap detection and re-request, and merging playback with real-time data (ordering by generation time) |
| 17 | Test | Are-you-alive / connection test | A ping command and a link test |
| 18 | On-board operations procedures | Load, start, stop, suspend and abort OBCPs | OBCP compile/load, version management, status monitoring |
| 19 | Event-action | Event ID to action TC table | Table editor and validation, plus a ground mirror |
| 20 | Parameter management | Report and set on-board parameter values | Read/set UI and a parameter definition database |
| 21 | Request sequencing | Load and run TC sequences | Sequence authoring and loading |
| 22 | Position-based scheduling | TCs triggered by orbit position | Needs orbit or position input from flight dynamics |
| 23 | File management | Create, delete, copy and move files and directories; report attributes | A file browser plus a CFDP ground entity (727.0) |
| 24–27 | Rev.1 additions | File transfer, file data storage, parameter extraction, critical packet log | A CFDP-driven file-based operations model on the ground |

**CCSDS link layer and packets: current issues confirmed on ccsds.org**
- 131.0-B-5 TM synchronization and channel coding — [ccsds.org/Pubs/131x0b5.pdf](https://ccsds.org/Pubs/131x0b5.pdf)
- 132.0-B-3 TM SDLP — [132x0b3](https://ccsds.org/Pubs/132x0b3.pdf). The MCS must handle:
  - TM frames: master and virtual channels, frame counters with gap detection, first header pointer, and packet extraction across frame boundaries
  - the OCF/CLCW carried in the frame, which feeds COP-1
  - frame error control (FECF)
- 232.0-B-4 (with editorial change and corrigendum) TC SDLP — [232x0b4e1c1](https://ccsds.org/Pubs/232x0b4e1c1.pdf). This covers TC frames with type AD/BD, segmentation, MAP IDs and the frame sequence number.
- 232.1-B-2 COP-1, cited by [dariol83/ccsds README](https://github.com/dariol83/ccsds/blob/master/README.md). The ground half (FOP-1) must:
  - keep a sliding window
  - process CLCW Lockout, Wait and Retransmit flags
  - support AD mode, BD bypass and the Unlock/Set V(R) control commands
  - support timers and transmission limits, and the initialise modes with or without CLCW check
- 732.0-B-4 AOS SDLP — [732x0b4](https://ccsds.org/Pubs/732x0b4.pdf)
- 732.1-B-3 (Editorial Change 1) USLP — [732x1b3e1](https://ccsds.org/Pubs/732x1b3e1.pdf)
- 133.0-B-2 Space Packet Protocol (Editorial Change 2) — [133x0b2e2](https://ccsds.org/Pubs/133x0b2e2.pdf)
- 301.0-B-4 (EC1) Time Code Formats (CUC, CDS, CCS, ASCII) — [301x0b4e1](https://ccsds.org/Pubs/301x0b4e1.pdf)
- 401.0-B-32 RF and Modulation — [401x0b32](https://ccsds.org/Pubs/401x0b32.pdf). This is mostly a ground-station and transponder concern. The MCS only needs to configure and monitor through station M&C.
- 727.0-B-5 (EC1) CFDP — [727x0b5e1](https://ccsds.org/Pubs/727x0b5e1.pdf). Ground entity requirements:
  - Class 1 (unacknowledged) and Class 2 (acknowledged, with NAK/EOF/FIN handling)
  - transaction management, suspend/resume, fault handlers and a Metadata/EOF/FIN state machine
- Open-source reference implementations cover 131, 132, 133, 133.1, 231, 232.0, 232.1, 301, 727, 732.0 and SLE — [dariol83/ccsds](https://github.com/dariol83/ccsds/blob/master/README.md), [Yamcs tctm.ccsds](https://docs.yamcs.org/javadoc/yamcs/latest/org/yamcs/tctm/ccsds/package-summary.html)

**Security**
- 355.0-B-2 SDLS protocol — [355x0b2](https://ccsds.org/Pubs/355x0b2.pdf). It inserts a security header and trailer into TC, TM, AOS and USLP frames, with Security Associations (SAs) per virtual channel. Services are authentication, encryption or authenticated encryption, with anti-replay sequence numbers.
- 355.1-B-1 SDLS Extended Procedures — [355x1b1](https://ccsds.org/Pubs/355x1b1.pdf). It covers Key Management, SA Management and SDLS Monitoring & Control. The services are OTAR, key activation, deactivation, inventory and verification. Master keys encrypt session keys for OTAR. Source: [355x1b1](https://ccsds.org/Pubs/355x1b1.pdf), [KTH thesis summary](https://www.diva-portal.org/smash/get/diva2:1902617/FULLTEXT01.pdf). Ground impact:
  - a key-management system or HSM
  - SA state tracking: unkeyed, keyed, operational, expired
  - an EP command builder and reply parsing
  - anti-replay counter synchronisation
- 352.0-B-2 CCSDS Cryptographic Algorithms (AES-GCM, CMAC etc.) — [352x0b2](https://ccsds.org/Pubs/352x0b2.pdf)
- Green books:
  - 350.1-G-3 Security Threats against Space Missions — [350x1g3](https://ccsds.org/Pubs/350x1g3.pdf)
  - 350.5-G-2 SDLS summary — file present at [ccsds.org/Pubs/350x5g2.pdf](https://ccsds.org/Pubs/350x5g2.pdf)
  - 350.11-G-1 SDLS Extended Procedures summary — [350x11g1e1](https://ccsds.org/Pubs/350x11g1e1.pdf)
- 354.0-M-1 Symmetric Key Management (Magenta Book, recommended practice) — [354x0m1](https://ccsds.org/Pubs/354x0m1.pdf). A revision was in draft review in 2025 — [354x0r1 draft](https://ccsds.org/wp-content/uploads/gravity_forms/9-6f599803174a64f5da08b9814720b5c4/2025/02/354x0r1.pdf)

**Cross support (SLE / CSTS)**
- SLE versions:
  - RAF 911.1, RCF 911.2, ROCF 911.5, FCLTU 912.1 and ISP1 913.1-B-2. The Yamcs SLE plugin lists 911.1-B-5, 911.2-B-4, 911.5-B-4 and 912.1-B-5 — [Yamcs SLE plugin](https://docs.yamcs.org/yamcs-sle/about/)
  - 911.5-B-4 (EC1) is hosted — [911x5b4e1](https://ccsds.org/Pubs/911x5b4e1.pdf)
  - **Conflict:** the dariol83 README lists the older issues 911.1-B-4, 911.2-B-3, 911.5-B-3 and 912.1-B-4 — [dariol83](https://github.com/dariol83/ccsds/blob/master/README.md)
- MCS role: an SLE user that binds, starts and receives transfer buffers. It processes ERT and frame quality annotations, handles FCLTU throw-event and CLTU status, and runs the BIND authentication (credentials). ESA's open-source SLE API is [esa/sleapi-j](https://github.com/esa/sleapi-j).
- CSTS framework and services:
  - 922.1-B-2 CSTS Specification Framework — [922x1b2](https://ccsds.org/Pubs/922x1b2.pdf)
  - 922.2-B-2 Monitored Data — [922x2b2](https://ccsds.org/Pubs/922x2b2.pdf)
  - 922.3-B-1 Tracking Data — [922x3b1](https://ccsds.org/Pubs/922x3b1.pdf)

**Mission Operations, database exchange and navigation**
- MO services:
  - 520.0-G-3 MO Services Concept — [520x0g3](https://ccsds.org/Pubs/520x0g3.pdf)
  - 521.0-B-3 MO Message Abstraction Layer (MAL) — [521x0b3](https://ccsds.org/Pubs/521x0b3.pdf)
  - 521.1-B-1 MO Common Object Model — [521x1b1](https://ccsds.org/Pubs/521x1b1.pdf)
  - 522.1-B-1 MO Monitor and Control services — [522x1b1](https://ccsds.org/Pubs/522x1b1.pdf)
- 660.0-B-2 XTCE (XML Telemetric and Command Exchange) — [660x0b2](https://ccsds.org/Pubs/660x0b2.pdf). 660.1-G-2 XTCE Green Book — [660x1g2](https://ccsds.org/Pubs/660x1g2.pdf). Yamcs uses XTCE as its native mission database model ([Yamcs](https://docs.yamcs.org/javadoc/yamcs/latest/org/yamcs/tctm/ccsds/package-summary.html)).
- 508.0-B-1 CDM (EC2 and corrigendum) — [508x0b1e2c2](https://ccsds.org/Pubs/508x0b1e2c2.pdf)
  - KVN or XML format, carrying TCA, miss distance, Pc, relative position and velocity, and covariance for both objects.
  - US TraCSS uses CDM 508.0-B-1 and plans to adopt 508.0-P-1.1 and later versions — [TraCSS CDM Spec v2.1](https://space.commerce.gov/wp-content/uploads/2025/07/TraCSS-_CDM_Spec_Version_2.1.pdf), [TraCSS-Spec-001 v2.1, Jan 2026](https://space.commerce.gov/wp-content/uploads/2026/01/TraCSS-Spec-001-v2.1_CDM.pdf)
- 502.0-B-3 Orbit Data Messages, April 2023 (OPM, OMM, OEM and the new OCM) — [502x0b3e1](https://ccsds.org/Pubs/502x0b3e1.pdf). TraCSS asks owners and operators for ephemerides in OCM format — [TraCSS OCM Spec 002](https://space.commerce.gov/wp-content/uploads/2025/07/TraCSS-OCM-Spec-2_Public.pdf)
- 503.0-B-2 Tracking Data Message (with corrigendum) — [503x0b2c1](https://ccsds.org/Pubs/503x0b2c1.pdf). A 505.0 XML specification for NDMs is in draft — [505x0p31](https://ccsds.org/wp-content/uploads/gravity_forms/9-6f599803174a64f5da08b9814720b5c4/2025/02/505x0p31.pdf)

**Time correlation**
- PUS ST[9]: the ground correlates the reported spacecraft time with the UTC used on the ground. This "enables the ground system to reconstitute accurately the on-board time of other information", such as event times — [Rev.1 DIR1 §6.9](https://ecss.nl/wp-content/uploads/2024/12/ECSS-E-ST-70-41C-Rev.1-DIR1(11December2024).pdf)
- The standard method relates the on-board time at which a specific TM frame left the spacecraft to its Earth Reception Time (ERT). It corrects for on-board delays, ground-station delays and light time, and maintains a correlation factor such as UTCF so that SCET = clock + offset. Sources: [INTEGRAL timing paper](https://arxiv.org/pdf/astro-ph/0309525), [NASA ST-5 timekeeping](https://ntrs.nasa.gov/api/citations/20030025281/downloads/20030025281.pdf), [ESA Athena time-stamping note](https://www.cosmos.esa.int/documents/400752/400864/Absolute+time+stamping+with+Athena/26c12e40-d300-49df-8851-f3b9ca5ae474)
- SLE return services deliver per-frame ERT annotations at up to picosecond resolution. Station clocks are GPS-disciplined to UTC at the few-ns level — [SKKU space NTP paper](http://dash.skku.edu/pub/spacentp.pdf), [911.1 via Yamcs SLE](https://docs.yamcs.org/yamcs-sle/about/)

### Inferences
- What a ground system must do for PUS is defined by the mission's tailoring (its PUS tailoring and ICD). A product MCS therefore needs configurable support for each service and its capability sets, rather than a hard-coded subset. It should be ready for both PUS-C 2016 (with ST[8]) and PUS-C Rev.1 (ST[24] to ST[27]).
- Rev.1 moves PUS towards file-based operations. That makes CFDP Class 2 on the ground a de-facto requirement for new ECSS missions.

### Gaps
- I could not confirm whether ECSS-E-ST-70-41C Rev.1 was published after its public review ended in February 2025. The ECSS active list still shows the 2016 edition.
- Current issues I could not confirm on ccsds.org:
  - 232.1 COP-1 (B-2 per dariol83)
  - 912.1 and 911.1/911.2 (B-4/B-5 conflict)
  - whether a 508.0-B-2 CDM exists (only the Pink Sheet 508.0-P-1.1 is referenced)
  - the 356.0 Network Layer Security status
- I did not retrieve the content of ECSS-E-ST-70-11C Rev.1 (Oct 2025) or ECSS-E-ST-70-32C (PLUTO), beyond their status and use.
- I found no single CCSDS Blue Book dedicated to the time-correlation algorithm. Practice is mission- and agency-specific, and ESA documents it in mission ICDs.

## Q2. Must-haves for a typical LEO EO constellation MCS today

### Takeaway
The baseline is:
- TM/TC SDLP with COP-1, Space Packets and PUS-C core services (1, 3, 5, 6, 9, 11, 15, 17, 20 and usually 12, 13, 19, 23)
- CUC/CDS time and time correlation
- an SLE or vendor ground-station interface (RAF/RCF/FCLTU)
- CFDP for payload and file operations
- an XTCE- or SSM-style database
- OEM/OPM/OCM and CDM handling for collision avoidance

USLP, AOS, MO services and CSTS are optional or emerging for LEO EO.

### Cited Findings
- Ground-station-as-a-service and agency networks expose SLE RAF, RCF, ROCF and FCLTU as the standard ground-to-MCS interface. This is implemented by Yamcs and ESA SLE API — [Yamcs SLE](https://docs.yamcs.org/yamcs-sle/about/), [esa/sleapi-j](https://github.com/esa/sleapi-j)
- TraCSS (the US civil SSA service that takes over from Space-Track for civil and commercial operators) distributes CDMs per CCSDS 508.0 and asks operators for OCM ephemerides — [TraCSS CDM Spec](https://space.commerce.gov/wp-content/uploads/2025/07/TraCSS-_CDM_Spec_Version_2.1.pdf), [TraCSS OCM Spec](https://space.commerce.gov/wp-content/uploads/2025/07/TraCSS-OCM-Spec-2_Public.pdf)
- PUS Rev.1 standardises CFDP-based file transfer, which reflects how current missions operate — [Rev.1 DIR1](https://ecss.nl/wp-content/uploads/2024/12/ECSS-E-ST-70-41C-Rev.1-DIR1(11December2024).pdf)

### Inferences
- **Must:**
  - 132.0 TM SDLP, 232.0 TC SDLP with 232.1 COP-1 (FOP-1), 131/231 coding (usually done at the station or modem), 133.0 Space Packets and 301.0 CUC/CDS time
  - PUS ST[1, 3, 5, 9, 11, 15, 17, 20], with ST[6, 12, 13, 19, 23] commonly tailored in
  - CFDP (727.0) Class 1 and 2
  - SLE RAF/RCF/FCLTU or the provider API
  - CDM ingest and OEM/OCM exchange
  - time correlation
  - an exportable and importable TM/TC database (XTCE 660.0 is the most common interchange format)
- **Should:**
  - SDLS 355.0 at least for TC authentication (see Q3)
  - ROCF, PLUTO-like procedure automation (70-32), and a 70-31 SSM import
  - TDM 503.0 when ranging or Doppler is used
  - fleet-level scheduling aware of ST[11]
- **Optional or emerging:** USLP 732.1, AOS 732.0 (mainly for high-rate payload downlink, often outside the MCS), MO services 52x, CSTS 922.x, ST[18] OBCP and ST[22] position-based scheduling.

### Gaps
- I found no public survey that quantifies which PUS services commercial LEO EO operators actually use. The list above is an inference.

## Q3. What customers and regulators increasingly require

### Takeaway
The momentum is behind cybersecurity:
- SDLS with key management and OTAR
- NIST IR 8401 for the ground segment
- NIS2, with the proposed EU Space Act as lex specialis
- ECSS-E-ST-80C

On the regulatory side, conjunction-data handling (CDM/OCM exchange with TraCSS) is becoming expected.

### Cited Findings
- NIST IR 8401, "Satellite Ground Segment: Applying the Cybersecurity Framework to Assure Satellite Command and Control", was finalised on 3 Jan 2023. It covers terminals, Mission Operation Centers and Payload Operation Centers — [NIST CSRC](https://csrc.nist.gov/news/2023/nist-releases-nist-ir-8401), [SecurityWeek](https://www.securityweek.com/nist-finalizes-cybersecurity-guidance-ground-segment-space-operations/)
- NIS2 already applies to operators of ground-based infrastructure that supports space services. The proposed EU Space Act (COM(2025) 335) would set space-specific cybersecurity rules for all space operators, as lex specialis to NIS2 — [EUR-Lex 52025PC0335](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A52025PC0335), [Mondaq](https://www.mondaq.com/cybersecurity/1785852/beyond-nis-2-the-eu-space-act-and-the-coming-of-age-of-space-cybersecurity). The draft requires:
  - risk identification and review
  - vulnerability remediation
  - asset categorisation
  - identity management and access control
  - Source: [Mayer Brown, Dec 2025](https://www.mayerbrown.com/en/insights/publications/2025/12/securing-the-final-frontier-cybersecurity-risk-regulation-and-compliance-trends-in-space-and-satellite-operations)
- A 12-hour cyber-incident reporting clock in the EU Space Act draft is reported by a vendor news site — [CYSAT](https://cysat.eu/news/eu-space-act-satellite-cybersecurity-reporting). This is a secondary source and is not verified against the legal text.
- ECSS-E-ST-80C (1 Jul 2024) is the ECSS security-in-lifecycle standard — [ECSS active standards](https://ecss.nl/standards/active-standards/)
- CCSDS 350.1-G-3 catalogues threats against space missions, including command injection, replay and ground-segment compromise. SDLS and the Extended Procedures (OTAR) are the CCSDS countermeasures at link level — [350x1g3](https://ccsds.org/Pubs/350x1g3.pdf), [355x1b1](https://ccsds.org/Pubs/355x1b1.pdf), [ESA Indico: CCSDS-compliant secure links](https://indico.esa.int/event/528/attachments/5988/10191/Developing_a_CCSDS_compliant_platform_to_reliably_secure_current_and_future_space_data_links.pdf)
- TraCSS (US Dept of Commerce) uses CCSDS CDM and OCM. Its v2.1 spec was published in January 2026 — [TraCSS-Spec-001 v2.1](https://space.commerce.gov/wp-content/uploads/2026/01/TraCSS-Spec-001-v2.1_CDM.pdf)

### Inferences
- For an MCS, the regulatory controls translate into:
  - MFA and RBAC with two-person rules for hazardous commands
  - tamper-evident audit logs
  - SDLS SA, key and anti-replay management through an HSM or KMS
  - incident detection and reporting hooks
  - secure SLE BIND credentials
  - conjunction workflows: CDM ingest, Pc screening, manoeuvre planning, and ephemeris (OCM/OEM) sharing back to TraCSS or EU SST
- Exposure differs by market. EU customers face NIS2 and later the EU Space Act. US customers and US-government work look to NIST IR 8401 (and related controls).

### Gaps
- The EU Space Act was still a proposal at the time of the sources (Nov–Dec 2025). Its adoption status and final timelines in 2026 were not confirmed.
- I found no source confirming that any regulator mandates SDLS specifically. It appears as an agency or customer requirement (ESA and NASA missions), not a legal mandate.
- EU SST CDM format details and ESA's own ground-segment cybersecurity guidance documents were not retrieved.
