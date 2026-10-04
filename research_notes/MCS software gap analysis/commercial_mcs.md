# Commercial Satellite MCS / Ground Software Capability Inventory (as of Oct 2026)

Scope note: about 22 tool calls. Vendor pages are mostly marketing, and few publish technical datasheets. The two best primary technical sources found were the Terma CCS5/TSC public presentation (13 Mar 2024) and a Kratos EPOCH T&C Server datasheet (DS-015). The Kratos datasheet is hosted under a 2026/08 upload path, but its content is clearly old: "last 17 years", "298 missions", Visual Basic clients. Treat it as **legacy information**. Anything marked [MKT] is a vendor marketing claim that no independent source verifies.

---

## Q1: What features do commercial vendors market as differentiators in 2024-2026?

### Takeaway
In 2024-2026 vendors push five themes: (1) constellation/fleet orchestration with "one operator, many spacecraft" views, (2) cloud-native/Kubernetes or SaaS delivery, (3) automation that ranges from lights-out to "agentic AI", (4) cybersecurity (built-in SDLS, key management), and (5) support for software-defined satellites and software-defined ground. Legacy vendors (Kratos, GMV, L3Harris, Terma) lead on heritage and mission counts. New-space vendors (OpenC3, Bright Ascension, Telespazio EASE, ATLAS, Cognitive Space) lead on cloud, APIs and transparent pricing.

### Cited Findings: per-product inventory

#### Kratos EPOCH IPS (lineage: Integral Systems, acquired by Kratos) and Kratos OpenSpace
- **Components:** EPOCH T&C Server (real-time TM/TC), EPOCH Client (visualisation), EPOCH Triggers (automated activity detection and action), EPOCH ARES (procedure development), Archive Manager, EPOCH Database, Task Initiator (scheduling and automation), and EPOCH ABE (offline telemetry analysis) — [Kratos EPOCH IPS](https://www.kratosspace.com/products/satellites/command-and-control/epoch-ips)
- **Scale/heritage:** "deployed in more than 300 missions over 30 years". Pitched as "one platform to operate mixed fleets" that "grows seamlessly from single-satellite missions to large constellations" [MKT]. No public spacecraft-count benchmark — [Kratos EPOCH IPS](https://www.kratosspace.com/products/satellites/command-and-control/epoch-ips)
- **Datasheet (legacy):** TM processing for CCSDS and TDM. Commanding and command verification "with encryption and CCSDS". Open API for telemetry, status, events and commanding. Memory management. Archiving and playback. Alarm/event processing. Ground equipment monitoring and control (M&C). Automation through Task Initiator and the **STOL** procedure language. Procedures can also be written in manufacturer languages such as **CECIL**. Server Triggers support automated anomaly resolution. Redundancy comes from "running multiple copies of the software". Runs on UNIX/Linux. Out-of-the-box support for GEO buses from Airbus (Eurostar), Thales (Spacebus), Boeing (601/702), LM (A2100), Loral 1300, MELCO DS2000 and Orbital GEOStar — [EPOCH T&C Server datasheet](https://www.kratosspace.com/wp-content/uploads/2026/08/EPOCH-TC-Server.pdf)
- **No evidence found** for native PUS or XTCE support, which fits EPOCH's GEO-commercial and US heritage. The datasheet only says "any satellite command and telemetry format" via its database-driven architecture — [same datasheet](https://www.kratosspace.com/wp-content/uploads/2026/08/EPOCH-TC-Server.pdf)
- **Software-defined satellite support (2025-26):** Kratos completed the first Factory Acceptance Test (FAT) of EPOCH with the Airbus OneSat reprogrammable platform (announced 30 Dec 2025). Kratos added features to handle "frequent configuration changes, onboard autonomy, and continuous updates" — [SatNews](https://satnews.com/2025/12/30/kratos-epoch-c2-software-completes-factory-acceptance-testing-for-airbus-onesat-platform/); [The Defense Post](https://thedefensepost.com/2026/01/05/kratos-airbus-onesat-epoch-software/); [Kratos release](https://www.kratosdefense.com/newsroom/kratos-successfully-completes-first-factory-acceptance-test-of-epoch-command-and-control-system-with-airbus-software-defined-satellite)
- **Government:** $25M task order under the USSF CCS-C Sustainment and Resiliency contract, for Evolved Strategic SATCOM (ESS) ground capability (June 2025) — [SatNews](https://news.satnews.com/2025/06/12/kratos-awarded-25-million-task-order-for-ussfs-evolved-strategic-satcom/)
- **OpenSpace:** marketed as "the industry's only commercially available, fully software-defined satellite ground system" [MKT]. Three lines: SpectralNet (RF digitisation), quantum (virtualised modem/hardware functions) and the OpenSpace Platform (orchestration). Demonstrated a fully virtualised ground system over SES O3b MEO for US Army (2024) — [Kratos O3b demo](https://www.kratosdefense.com/newsroom/kratos-demonstrates-fully-virtualized-satcom-ground-system-for-u-s-army-futures-command-over-sess-o3b-meo-constellation); [SatNews 2024](https://news.satnews.com/2024/04/17/kratos-executed-fully-virtualized-satcom-ground-system-for-u-s-army-combat-capabilities-development-command-over-sess-o3b-meo-constellation/)
- **Other customer:** Airbus contract for the OmanSat-1 ground system — [Kratos](https://www.kratosdefense.com/newsroom/kratos-awarded-multi-million-dollar-ground-system-contract-by-airbus-to-support-omansat-1)
- **Licensing/pricing:** not public.

#### Parsons (Integral Systems heritage; Ace CtrlPoint, SatCentral, OrbitXchange)
- Ace CtrlPoint is an automated space vehicle and ground station C2 application with a plug-in architecture, "nearly lights-out" TT&C, electronic command plans, anomaly detection, ground station control/status, antenna scheduling integration, and support for multiple front-end processor vendors [MKT] — [Parsons Ace CtrlPoint](https://www.parsons.com/products/ace-ctrlpoint/); [datasheet PDF (2022)](https://www.parsons.com/wp-content/uploads/2022/02/Ace-CtrlPoint.pdf)
- A Parsons subsidiary won a $245M Navy ground station contract (June 2026) — [Washington Technology](https://www.washingtontechnology.com/contracts/2026/06/parsons-subsidiary-awarded-245m-navy-ground-station-contract/414539/)
- Note: EPOCH itself went to Kratos with Integral Systems, so Parsons' present satellite C2 products are a separate line. Product list: [SatCentral](https://www.parsons.com/products/satcentral/), [OrbitXchange](https://www.parsons.com/products/orbitxchange/)

#### L3Harris InControl (and OS/COMET)
- Covers TM processing, data display/analysis, constellation monitoring and control, onboard system management, and ground equipment M&C. It also simulates TM and command-verification responses for training and procedure development — [L3Harris InControl](https://www.l3harris.com/all-capabilities/incontrol-satellite-command-and-control); [sell sheet (2020)](https://www.l3harris.com/sites/default/files/2020-09/l3harris-InControl_SellSheet_FINAL_web-sas.pdf)
- "Scales from... demonstration satellites to... a full constellation on orbit with a small number of operators". Offers a constellation view with one-click drill-down [MKT] — [L3Harris](https://www.l3harris.com/all-capabilities/incontrol-satellite-command-and-control)
- Customers: Iridium (NEXT) Satellite Control Segment fleet operations — [Space Foundation 2017](https://www.spacefoundation.org/2017/03/15/l3-telemetry-rf-products-supports-the-successful-launch-of-the-iridium-next-satellite-constellation/). Sidus Space LizzieSat constellation (2022, "Mission Critical Operations Center" software) — [Sidus IR](https://investors.sidusspace.com/news-events/press-releases/detail/30/sidus-space-selects-l3harris-mission-critical-operations)
- OS/COMET: I found no current (2024-26) public product page.

#### Terma CCS5 / TSC (TGSS suite) — the best technical detail found
- **Origin:** a full re-implementation that replaces SCOS-2000-era European systems while keeping the **SCOS-2000 MIB** data model (MIB 6.9 to 7.2, with extensions). TSC is the single-user product for AIT/EGSE; CCS5 is multi-user for AIT and operations. Built with Qt/QML, Tcl/Tk, JavaScript and NATS — [Terma CCS5/TSC presentation, Mar 2024](https://tgss-static.terma.com/public/PresentationCcs5andTsc.pdf)
- **Standards:** ECSS **PUS-A and PUS-C** ("PUS not mandatory"), CCSDS packets and **CFDP**, TM frames, TC CLTU and **COP-1**, and CubeSat Space Protocol v1/v2. Supports variable packets, deduced parameters in TM and TC, mixed endianness, and several synthetic-parameter languages — [same](https://tgss-static.terma.com/public/PresentationCcs5andTsc.pdf)
- **Ground network interfaces:** ESA NIS with optional **SLE**, Cortex, NDIU LITE and **KSAT LITE**. Any number of named station interfaces (e.g. Kiruna, Svalbard). Protocol drivers are scripted in TOPE, so new GSaaS protocols can be added quickly. EGSE plugins cover EDEN, C&C, serial, CAN, ZMQ and NATS — [same](https://tgss-static.terma.com/public/PresentationCcs5andTsc.pdf)
- **Performance (vendor-published):** about 150,000 TM parameter updates/s, about 50,000 archived changes/s, about 1,500 monitored HK packets/s (about 5 Mbit/s), about 80 Mbit/s unmonitored bandwidth, about 500 TC/s (TSC) and about 100 TC/s with verification (CCS) — [same](https://tgss-static.terma.com/public/PresentationCcs5andTsc.pdf)
- **Automation:** **TOPE** (Test & Operations Procedure Executive) has Tcl-based syntax derived from SCOS-2000 TOPE. It includes a debugger and supports suspend/resume/restart with permissions — [same](https://tgss-static.terma.com/public/PresentationCcs5andTsc.pdf)
- **Fleet:** "AutoPilot" fleet viewer gives multi-satellite filtered status (e.g. in alarm, or action pending in the next period). Operators can drill into one satellite and run tested TC stacks or sequences — [same](https://tgss-static.terma.com/public/PresentationCcs5andTsc.pdf)
- **Planning:** PLAN tool provides onboard schedule management, generic automated schedule search, arbitrary resources, a timeline viewer and a Python API — [same](https://tgss-static.terma.com/public/PresentationCcs5andTsc.pdf)
- **Constellation deployment:** clusters of VMs grouped per orbital plane, sized at roughly "1GB RAM, 1 vCPU per S/C" for small spacecraft. A Kubernetes/Helm deployment allows an "arbitrary number of S/C", health monitoring, automated migration, restart and load balancing, and runs on public or on-prem cloud. Docker images are available to licensees. Installs on Windows, SUSE and Red Hat, or via `docker pull` — [same](https://tgss-static.terma.com/public/PresentationCcs5andTsc.pdf)
- **Archive:** MySQL, MariaDB, PostgreSQL or AWS Aurora, queryable in plain SQL. TM is stored on change. Long-term compressed archive. Retrieval tools work without starting CCS — [same](https://tgss-static.terma.com/public/PresentationCcs5andTsc.pdf)
- **Security:** built-in **CCSDS 355.0-B-1 (SDLS) and 355.1-B-1 (SDLS-EP)**. Authentication via CMAC, HMAC, GMAC or CBC-MAC. Encryption via ECB, GCM or CCM. Also supports ESA PSS-04-151 authentication and the "Sentinel-1" CMAC enhancement. Includes **key-management UIs** and can be deployed separately "towards NIST FIPS-140 compliance". Login relies on OS authentication — [same](https://tgss-static.terma.com/public/PresentationCcs5andTsc.pdf)
- **API:** CCS Web Services REST API can start/stop sessions, run automated tests and retrieve TM parameters — [same](https://tgss-static.terma.com/public/PresentationCcs5andTsc.pdf)
- **Licensing (rare public data):** perpetual license with 1-year warranty included. Later years cost **20% of license cost per year** — [same](https://tgss-static.terma.com/public/PresentationCcs5andTsc.pdf)
- **Missions:** more than 30 missions over 10 years, including Euclid, JUICE, **OneWeb**, THEOS-1 and OptSat. Positioned for CubeSats through constellations, cloud or on-prem — [Terma 10th anniversary news, 2024](https://www.terma.com/news-events/news/news-archive/2024/ccs5-mission-control-system-celebrates-10th-anniversary-marking-a-decade-of-space-innovation/); [Terma CCS5 page](https://www.terma.com/products/space/ccs5/) (returned 403 to fetch; summary taken from search snippet)
- **TMCS:** I found no separate current "TMCS" product page. Terma's suite branding is TGSS — [TGSS brochure](https://www.terma.com/media/rpvjbcit/terma-space-tgss-a4.pdf)

#### Bright Ascension HELIX Ops (formerly "Mission Control Software", pairs with GenerationOne/HELIX Flightkit flight software)
- Supports ECSS PUS, CCSDS Space Packet, CCSDS Space Data Link Protocols and CubeSat Space Protocol — [SmallSat Catalog](https://catalog.orbitaltransports.com/mission-control-software/) (search snippet)
- Real-time and offline TM monitoring, visualisation, archiving and custom event notifications. A scheduling engine covers contact planning, command sequences and data handling across constellations. Open APIs. "Constellation-ready from day one" [MKT] — [satsearch](https://satsearch.co/products/bright-ascension-mission-control-software); [Bright Ascension](https://brightascension.com/products/helix-ops/)
- 50+ missions in orbit and 15+ years of heritage. "Near-automatic integration" with HELIX flight software. The key differentiator is a shared flight/ground data model — [Bright Ascension HELIX Ops](https://brightascension.com/products/helix-ops/)
- Not public: cloud/SaaS details, GSaaS integrations, CFDP, security, pricing.

#### GMV hifly / FocusSuite / Flexplan / fleet tools (also Magnet, smartSAT-family offerings)
- Product set: hifly (real-time TM/TC), FocusSuite (flight dynamics), Flexplan (planning), Magnet (ground station M&C), Smart Payload, Focusoc, Prodigi — [GMV SmallSat Symposium 2025](https://www.gmv.com/en/communication/news/boosting-future-small-satellites-smallsat-symposium-2025); [GMV Magnet](https://www.gmv.com/en/products/space/magnet)
- **Telesat Lightspeed (Feb 2025):** hifly, FocusSuite and Flexplan, plus the fleet tools **Flyplan orchestrator, FleetDashboard and Archiva analytics**. This is the control suite for **198 LEO satellites** and includes "automation... and cybersecurity" — [GMV press release](https://www.gmv.com/en/communication/press-room/press-releases/telecommunications/gmv-deliver-next-generation-satellite)
- Earlier constellation win: **OneWeb** constellation command and control (older) — [GMV](https://www.gmv.com/en/communication/news/oneweb-awards-gmv-contract-develop-onewebs-satellite-constellation-command-and). Poland's CAMILA satellite control system — [GMV](https://www.gmv.com/en/communication/press-room/press-releases/earth-observation/gmv-will-develop-satellite-control-system)
- FocusSuite: "Cloud Native", REST APIs, "unlimited automation of lights-out operations" with Python/SOL scripts, conjunction analysis [MKT] — [GMV FocusSuite](https://www.gmv.com/en/products/space/focussuite)
- GMV states that roughly **40% of global telecom satellite launches** are controlled by its hifly/fleet portfolio [MKT] — [GMV Space](https://www.gmv.com/en/sectors/space). hifly 6.0 release (older) — [SpaceNews](https://spacenews.com/gmv-releases-hifly-60-satellite-control-system/); hifly brochure (2020) — [PDF](https://www.gmv.com/sites/default/files/content/file/2020/06/15/1/hifly_en.pdf)

#### Telespazio / Leonardo: EASE and EASE-Rise
- EASE is a modular, cloud-native ground segment line sold as complete solution or building blocks, delivered SaaS "directly from the cloud". It covers M&C, mission planning and flight dynamics. It is pitched as an end-to-end small-constellation platform with a single dashboard, multi-constellation orchestration, "automated and AI-optimized" workflows, multi-protocol ground station brokering, and payload data processing that is "big data by design" [MKT] — [Telespazio EASE](https://www.telespazio.com/en/business/space-players/ground-systems/ease)
- Customers: constellr (EASE-Rise) — [Telespazio](https://www.telespazio.com/en/news-and-stories-detail/-/detail/ease). Hellenic Space Dawn mission — [Telespazio Germany](https://www.telespazio.de/en/news-and-stories-detail/-/detail/hellenic-space-dawn-mission-adopts-telespazio-s-ease-rise-mission-control-solution)

#### Space Applications Services: Yamcs
- Open-source (AGPL) C3 framework, with commercial enterprise support, hosting, alternative (non-AGPL) licensing, extension development and mission operations services — [yamcs.org](https://yamcs.org/); [About Yamcs](https://yamcs.org/about); [Space Applications](https://www.spaceapplications.com/news/yamcs-mission-control-software-thats-open-tested-and-trusted)
- Users include NASA, ESA, MBRSC and CMU. ISS payloads (ACES, ICE Cubes). Lunar rovers (VIPER, Rashid, Iris). Small-launcher EGSE (Reaction Dynamics, Sidereus) — [Space Applications](https://www.spaceapplications.com/news/yamcs-mission-control)
- The ICE Cubes lean commercial control centre paper (2018, older) — [AIAA](https://arc.aiaa.org/doi/pdf/10.2514/6.2018-2682)

#### OpenC3 COSMOS (Core and Enterprise)
- Enterprise adds: Kubernetes-native horizontal scaling ("no license key or node limits"), RBAC down to packet level, LDAP/SSO via Keycloak, "scopes" for isolated multi-environment use, a calendar for scheduling passes and scripts, telemetry-triggered "autonomic" reactions, and plugins for **CFDP, CCSDS TC/TM framing, Leaf Space and KSAT Lite**. Ruby/Python scripting is in both editions — [OpenC3 Enterprise](https://openc3.com/cosmos-enterprise)
- **Public pricing: $33K–$165K/year** for Enterprise. Core is free/open source — [OpenC3 Enterprise](https://openc3.com/cosmos-enterprise)
- COSMOS 7.1 Enterprise adds sharding with ValKey and QuestDB for scale — [OpenC3 7.1](https://openc3.com/news/cosmos-7-1-release-video); [search summary of openc3.com/enterprise](https://openc3.com/enterprise)

#### Cognitive Space (CNTIENT)
- AI/ML mission planning and tasking (CNTIENT.Optimize). Schedules across "single satellites to mega constellations" for EO/SAR/HSI/IR/RF, balancing order priority with fleet and ground constraints. It is now branded as "agentic AI" constellation orchestration [MKT]. It is an AWS partner — [CNTIENT.Optimize](https://www.cognitivespace.com/cntient-optimize/); [AWS blog](https://aws.amazon.com/blogs/publicsector/satellite-mission-operations-using-artificial-intelligence-on-aws/); [SmallSat 2025 paper SSC25-VIII-04](https://digitalcommons.usu.edu/cgi/viewcontent.cgi?article=6263&context=smallsat)
- It is a planning/automation layer, not a TM/TC MCS.

#### ATLAS Space Operations (Freedom)
- "Ground Software as a Service". Freedom is a cloud-based, software-only ground network management/control system that automates scheduling, status and notifications, with "a single integration" for real-time data — [ATLAS](https://atlasspace.com/company/); [Breaking Defense 2022](https://breakingdefense.com/2022/10/atlas-space-a-netflix-for-satellite-ground-operations-software/); [ATLAS gov traction](https://atlasspace.com/freedom-space-gains-traction-with-government-customers-securing-jobs-satellite-services-and-space-access-anytime-anywhere/)

#### Kubos Major Tom (now Xplore)
- Cloud mission control with ground station scheduling, tasking, TM dashboards and a commanding API. AWS Ground Station integration (2021). Kubos was acquired by Xplore in 2022 — [GeekWire](https://www.geekwire.com/2022/xplore-acquires-assets-of-kubos-flight-software-company-as-it-ramps-up-for-first-space-mission/); [SatNews 2021](https://satnews.com/2021/07/14/kubos-ground-control-customer-options-now-expanded-using-aws-ground-station/)

#### Sedaro (digital twin)
- Cloud-scalable digital twin used to test commands and software updates, train operators and diagnose on-orbit faults. Also an onboard digital twin demo. SBIR Phase II for SDA/SSC — [Cesium blog 2022](https://cesium.com/blog/2022/08/11/sedaro-satellite-visualizes-spacecraft-digital-twins-cesiumjs/); [SpaceNews](https://spacenews.com/startups-demonstrate-in-orbit-satellite-autonomy/); [Sedaro SBIR](https://www.sedaro.com/news/sedaro-awarded-phase-ii-sbir-supporting-sda-and-ssc)

#### Ground station networks (integration targets, not MCS)
- **Leaf Space:** Leaf Line is a multi-mission GSaaS network reached through a single API plus a real-time data interface for customer MCS integration. In Nov 2025 Leaf added **Leaf Key** (dedicated stations, S/X/Ka bands, 1.8–13 m antennas) and **Leaf Hosting** (customer-owned antennas on Leaf sites), both on the same API — [Leaf Line](https://leaf.space/leaf-line/); [Leaf Key/Hosting](https://leaf.space/leaf-space-unveils-leaf-key-and-leaf-hosting-expanding-ground-segment-beyond-leaf-line/)
- **Infostellar StellarStation:** a cloud GSaaS marketplace. One API controls partner antennas — [satsearch](https://satsearch.co/products/infostellar-stellar-station)
- **Azure Orbital Ground Station was retired** (announced Oct 2024, service ended 18 Dec 2024). Its antennas were sold to SLI and leased to RBC Signals. **Do not list Azure Orbital as a live integration target** — [DCD](https://www.datacenterdynamics.com/en/news/microsoft-retires-ground-station-services-sells-antenna-to-sli/)
- AWS Ground Station remains the main hyperscaler GSaaS. Major Tom and Cognitive Space integrate with it — [SatNews](https://satnews.com/2021/07/14/kubos-ground-control-customer-options-now-expanded-using-aws-ground-station/); [AWS blog](https://aws.amazon.com/blogs/publicsector/satellite-mission-operations-using-artificial-intelligence-on-aws/)

### Inferences
- Differentiators in 2024-26 are: fleet dashboards (Terma AutoPilot, GMV FleetDashboard, L3Harris constellation view); Kubernetes scale-out (Terma, OpenC3); SaaS delivery (Telespazio EASE, ATLAS); built-in GSaaS adapters (KSAT Lite and Leaf in Terma/OpenC3); AI planning (Cognitive Space, EASE); and support for reconfigurable (software-defined) satellites (Kratos/OneSat).
- Pricing is opaque except at Terma (perpetual license plus 20%/yr) and OpenC3 ($33K–$165K/yr). Transparent, subscription-style pricing is itself a differentiator for new-space vendors.

### Gaps
- No public XTCE support statement found for any commercial product here except by implication (the European products use the SCOS-2000 MIB). Other sources say OpenC3 and Yamcs support XTCE, but I did not verify that in this pass.
- I found no current public technical datasheets for GMV hifly, L3Harris InControl, OS/COMET or Bright Ascension security/cloud features.
- Not researched in this pass (out of budget): Bifrost (synthetic training data, not an MCS), "Epoch/Atlas" beyond ATLAS Freedom, Slingshot Aerospace (an SSA vendor, not an MCS), and the Infostellar API surface.

---

## Q2: What features are table stakes for satellite operators buying an MCS?

### Takeaway
Every serious product covers the same baseline: database-driven CCSDS TM/TC with command verification, limit/alarm monitoring, an archive with replay and trending, a procedure/scripting language, a scheduler or task initiator, ground equipment M&C, a simulator for training, redundancy, and an external API. European buyers also expect PUS-C, a SCOS-2000 MIB, SLE/NIS and CFDP. US GEO buyers expect STOL-style procedures, manufacturer bus databases and encryption.

### Cited Findings
- Kratos baseline: CCSDS TM and TC with verification and encryption, memory management, archive/playback, alarms, ground equipment M&C, STOL automation, an API, and redundancy via multiple copies — [EPOCH T&C datasheet (legacy)](https://www.kratosspace.com/wp-content/uploads/2026/08/EPOCH-TC-Server.pdf)
- Terma baseline: SCOS-2000 MIB, PUS-A/C, CFDP, COP-1, SLE/NIS, an SQL archive, TOPE procedures, a REST API and SDLS — [Terma presentation 2024](https://tgss-static.terma.com/public/PresentationCcs5andTsc.pdf)
- L3Harris baseline: TM processing, display/analysis, onboard system management, ground equipment M&C, and a simulator for training and procedure development — [L3Harris](https://www.l3harris.com/all-capabilities/incontrol-satellite-command-and-control)
- Smallsat baseline: PUS, CCSDS SPP/SDLP and CSP; a scheduler for contacts and sequences; an archive; notifications — [SmallSat Catalog HELIX Ops](https://catalog.orbitaltransports.com/mission-control-software/)
- Open-source tier: OpenC3 Core and Yamcs offer core C2 for free, so the commercial value has moved to enterprise features (RBAC/SSO, scale-out, CFDP, GSaaS plugins, support) — [OpenC3](https://openc3.com/cosmos-enterprise); [Yamcs](https://yamcs.org/about)

### Inferences
- Because open-source exists, basic TM/TC, displays and Python scripting no longer differentiate anyone. VYUH-MCS needs to match them and win on the higher layers.
- SDLS with key management is becoming standard (Terma ships it built-in), and NIS2/ESA requirements will push it further.

### Gaps
- I found no independent buyer surveys (e.g. SpaceOps papers ranking MCS requirements) in this pass.

---

## Q3: What do new-space constellation operators need that legacy MCS lacks?

### Takeaway
Constellation operators need management by exception across hundreds of spacecraft. That means fleet rollups and automated pass execution, elastic per-spacecraft scaling, multiple GSaaS providers behind one API, AI/constraint-based tasking across the fleet, CI/CD-friendly deployment (containers), quick onboarding of new satellites, and transparent pricing. Legacy GEO-heritage systems (one console per satellite, VM installs, perpetual licenses) adapted through bolt-ons: fleet viewers, Kubernetes ports, and partnerships.

### Cited Findings
- Terma's own motivation slide says legacy European systems were "very onerous" to install/upgrade and not flexible or performant enough. Their fix was a Kubernetes deployment with an arbitrary number of S/C at about 1 vCPU per small S/C — [Terma 2024](https://tgss-static.terma.com/public/PresentationCcs5andTsc.pdf)
- Telesat chose a fleet layer (orchestrator, FleetDashboard, Archiva analytics) *on top of* hifly for 198 LEO spacecraft. Constellation ops therefore needs orchestration and analytics beyond core TM/TC — [GMV 2025](https://www.gmv.com/en/communication/press-room/press-releases/telecommunications/gmv-deliver-next-generation-satellite)
- Cognitive Space addresses fleet-wide, priority- and constraint-based tasking and fast onboarding of new satellites, which is AI planning that MCS products lack natively [MKT] — [CNTIENT.Optimize](https://www.cognitivespace.com/cntient-optimize/)
- GSaaS abstraction: Leaf, StellarStation and ATLAS each sell "single API" access to many antennas. MCS vendors are adding adapters (KSAT Lite and Leaf in OpenC3; KSAT LITE in Terma) — [Leaf](https://leaf.space/leaf-line/); [StellarStation](https://satsearch.co/products/infostellar-stellar-station); [ATLAS](https://atlasspace.com/company/); [OpenC3](https://openc3.com/cosmos-enterprise)
- Software-defined/reconfigurable satellites need ground C2 that handles frequent reconfiguration and onboard autonomy. Kratos had to add features for this — [SatNews Dec 2025](https://satnews.com/2025/12/30/kratos-epoch-c2-software-completes-factory-acceptance-testing-for-airbus-onesat-platform/)
- Digital twins for testing commands and software updates before uplink, and for fault diagnosis — [Cesium/Sedaro](https://cesium.com/blog/2022/08/11/sedaro-satellite-visualizes-spacecraft-digital-twins-cesiumjs/)
- SaaS mission control for small constellations (constellr and others on Telespazio EASE-Rise) — [Telespazio](https://www.telespazio.com/en/news-and-stories-detail/-/detail/ease)

### Inferences
- Gaps VYUH-MCS could exploit: (a) a native fleet/exception UI plus automated pass execution in the core product, not a bolt-on; (b) first-class adapters for KSAT, Leaf, AWS Ground Station, ATLAS and StellarStation; (c) built-in SDLS key management with multi-spacecraft key rotation; (d) published scale benchmarks (only Terma publishes numbers); (e) transparent subscription pricing that beats OpenC3 Enterprise's $33K–$165K/yr band, or justifies a premium over it; (f) AI-assisted anomaly triage. No incumbent publicly documents ML anomaly detection inside the MCS; Kratos and Parsons describe rule/trigger-based "anomaly resolution".
- Azure Orbital's exit shows GSaaS adapters should sit behind an abstraction layer, since providers come and go.

### Gaps
- No vendor publishes a verified "N spacecraft per operator" or maximum fleet size. All constellation scale claims are marketing, apart from the actual deployments (Telesat Lightspeed 198, OneWeb, Iridium).
- I found no public detail on ML-based anomaly detection inside hifly, EPOCH or InControl.
- Accreditation (e.g. US DoD RMF/ATO, NIST FIPS 140-3 validated modules, ISO 27001) is not documented on vendor pages, except Terma's "towards FIPS-140" deployability note.
