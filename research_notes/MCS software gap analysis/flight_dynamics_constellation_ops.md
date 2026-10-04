# Flight Dynamics, Mission Planning and Constellation Operations in Modern MCS Ground Segments (as of Oct 2026)

## What do established FD / mission-planning tools provide, and which are typically integrated with an MCS?

### Takeaway
Flight dynamics (FD) and mission planning (MP) are almost always separate products that plug into the MCS, not features of the TM/TC core. Vendors sell them as a set: GMV Hifly (MCS), FocusSuite (FD) and Flexplan (MP); Kratos EPOCH plus OASYS; Ansys STK plus ODTK. Open libraries (Orekit, GMAT) are the usual build-it-yourself base. New-space ground-station-as-a-service (GSaaS) networks expose pass booking as REST APIs that the MCS scheduler calls.

### Cited Findings

**Integrated vendor stacks (MCS + FD + MP)**
- GMV FocusSuite covers the full lifecycle of flight dynamics operations, mission analysis and close-approach prediction, for GEO, LEO, MEO, HEO and interplanetary missions. GMV says it is "proven in over 139 operational missions". — [GMV FocusSuite](https://www.gmv.com/en/products/space/focussuite)
- GMV Flexplan is a configurable COTS mission planning and scheduling (MPS) system. GMV positions it for EO, telecom, lunar, interplanetary and debris-removal missions, reusable from one mission to the next and covering the whole planning cycle. — [GMV Flexplan](https://www.gmv.com/en/products/space/gmv-flexplan); [Flexplan datasheet](https://www.gmv.com/en/Flexplan)
- Reference integration: Telesat Lightspeed uses GMV Hifly (real-time TM/TC), FocusSuite (FD) and Flexplan (MP) together. — [GMV press release](https://www.gmv.com/en/communication/press-room/press-releases/telecommunications/gmv-deliver-next-generation-satellite)
- In June 2026 GMV was selected to build the core ground control platform for Poland's CAMILA constellation. — [SatNews, 15 Jun 2026](https://satnews.com/2026/06/15/poland-sovereignty-gmv-to-develop-core-ground-control-platform-for-camila-constellation/)
- Older (pre-2021): Catapult used GMV FD and MP systems for the ELSA-d debris-removal demo. — [GMV](https://www.gmv.com/en/node/5111/printable/print)
- Kratos OASYS is the orbit analysis component of the EPOCH Integrated Product Suite. It provides orbit determination, force modelling and mission analysis for any Earth-orbiting satellite. — [Kratos OASYS](https://www.kratosspace.com/products/satellites/command-and-control/oasys)
- Kratos OpenSpace is a software-defined, orchestrated ground system. In March 2026 SSC deployed it for its new LEO service, "SSC Space Go". — [Kratos OpenSpace](https://www.kratosdefense.com/newsroom/kratos-introduces-openspace-platform-supporting-dynamic-software-defined-satellite-ground-systems); [ASDNews, Mar 2026](https://www.asdnews.com/news/defense/2026/03/02/ssc-space-deploys-kratos-openspace-platform-its-new-service-leo-missions-ssc-space-go)
- In late 2025 Kratos EPOCH C2 passed factory acceptance testing with Airbus's software-defined OneSat. — [Kratos newsroom](https://www.kratosdefense.com/newsroom/kratos-successfully-completes-first-factory-acceptance-test-of-epoch-command-and-control-system-with-airbus-software-defined-satellite); [Defense Post, Jan 2026](https://thedefensepost.com/2026/01/05/kratos-airbus-onesat-epoch-software/)

**Ansys (formerly AGI) STK and ODTK** (Ansys is now part of Synopsys)
- STK 2025 R1 added an "Optimal Strand by Duration" option for constellation analysis. ODTK 2025 R1 added cislunar initial orbit determination (IOD) and a co-location object. — [Ansys blog](https://www.ansys.com/blog/whats-new-with-ansys-digital-mission-engineering)
- ODTK added mass estimation: it estimates fuel used during manoeuvres and the fuel mass remaining afterwards. — [Ansys/Synopsys blog](https://ansys.synopsys.com/blog/mass-estimation-ansys-odtk-orbital-measurement-software)
- In 2025 R2, Ansys markets STK and ODTK as "unified flight dynamics", tightening the link between orbit determination and mission planning. — [Ansys 2025 R2 webinar](https://ansys.synopsys.com/webinars/ansys-2025-r2-stk-odtk-unified-flight-dynamics); [2025 R2 what's new](https://ansys.synopsys.com/blog/ansys-2025-r2-whats-new-with-dme)

**a.i. solutions FreeFlyer**
- FreeFlyer is COTS software for mission design, analysis and operations. The vendor cites heritage on 250+ missions, use by NASA, NOAA, USAF, NRO and commercial operators, and "easy integration into modern ground systems". — [a.i. solutions FreeFlyer](https://ai-solutions.com/freeflyer-astrodynamic-software/)
- FreeFlyer 8 has been announced as a new major version. — [announcement](https://baytobaynews.com/crisfield/stories/ai-solutions-announces-freeflyer-8-a-new-foundation-for-space-mission-design,341581); [Via Satellite 2025](https://interactive.satellitetoday.com/via/april-may-2025/breaking-new-ground-in-deep-space-with-freeflyer-astrodynamics-software)

**NASA GMAT (open source)**
- GMAT R2025a (April/May 2025) added:
  - multi-body harmonic gravity
  - new operational orbit determination data types
  - JSON output for batch least squares (BLS) residuals
  - K-band support
- GMAT already supports operational orbit determination with batch and extended Kalman filter estimators. — [GMAT R2025a announcement](https://gmat.atlassian.net/wiki/spaces/GW/blog/2025/05/16/2962227204/Announcing+GMAT+R2025a+Release); [SourceForge news](https://sourceforge.net/p/gmat/news/2025/04/announcing-nasa-space-mission-design-and-navigation-software-release-gmat-r2025a/)

**CS GROUP Orekit (open source, Java, Apache 2.0)**
- Latest API line is 13.1.x. — [Orekit API](https://www.orekit.org/site-orekit-latest/apidocs/index.html); [Zenodo 13.1](https://zenodo.org/records/16694949)
- Orbit determination options:
  - batch least squares, with Levenberg-Marquardt or Gauss-Newton optimisers
  - Kalman filtering, including an extended semi-analytical Kalman filter
  - OD over numerical, DSST, SGP4/SDP4, Eckstein-Hechler, Brouwer-Lyddane, Keplerian or GNSS propagators
  - estimation of measurement parameters such as station biases and clock offsets
  — [Orekit estimation architecture](https://www.orekit.org/site-orekit-13.0.3/architecture/estimation.html)
- Reads and writes CCSDS OPM, OEM, OMM and OCM messages, in KVN or XML. — [Orekit estimation architecture](https://www.orekit.org/site-orekit-13.0.3/architecture/estimation.html)
- SpaceOps 2025 includes a paper on an FD system for space-based operations built around these capabilities. — [SpaceOps 2025 paper](https://publications.spaceops.org/2025/download_by_id.php?id=0501)

**ESA Space Debris Office tooling (collision avoidance reference)**
- CORAM combines two tools: CORCOS computes collision risk and CAMOS optimises avoidance manoeuvres. ESA's operational service downloads CDMs automatically and computes risk with CORAM, using object geometry from the DISCOS database. — [ESA SDO CA service paper](https://kelvins.esa.int/media/public/competitions/collision-avoidance-challenge/SDC7-paper1017.pdf)
- DRAMA (debris risk and mitigation analysis) is available to registered users at sdup.esoc.esa.int. — [same](https://kelvins.esa.int/media/public/competitions/collision-avoidance-challenge/SDC7-paper1017.pdf)
- CREAM (Collision Risk Estimation and Automated Mitigation) is ESA's programme to automate collision avoidance. Paper dates from 2019. — [AMOS 2019](https://amostech.com/TechnicalPapers/2019/Space-Situational-Awareness/Flohrer.pdf)
- For an overview of manoeuvre-design methods, see the 2025 review "CAMmary". — [Acta Astronautica 2025](https://www.sciencedirect.com/science/article/pii/S0094576525004576)

**Commercial SSA / collision avoidance**
- LeoLabs runs its own radar network and offers:
  - API and streaming conjunction alerts
  - on-demand ephemeris screening
  - ingestion of 18th SDS (formerly 18 SPCS) CDMs, merged with LeoLabs' own CDMs in one platform
  — [LeoLabs CA](https://leolabs-space.medium.com/introducing-leolabs-collision-avoidance-184d62e01f99); [SpaceNews](https://spacenews.com/leolabs-collision-avoidance/)

**Ground-station networks and booking APIs**
- **Azure Orbital Ground Station (retired):** Microsoft retired the service in October 2024; customers could use it until 18 December 2024. Its ten 6 m S/X-band antennas were sold to Space Leasing International and leased to RBC Signals. — [DCD](https://www.datacenterdynamics.com/en/news/microsoft-retires-ground-station-services-sells-antenna-to-sli/)
- **AWS Ground Station:** a managed, pay-per-minute antenna service. In July 2025 KSAT announced it would integrate AWS Ground Station into its offering, so KSAT customers can reach both antenna networks. — [Via Satellite, Jul 2025](https://www.satellitetoday.com/technology/2025/07/30/ksat-to-integrate-aws-ground-station-capabilities-into-its-offerings/); [DCD](https://www.datacenterdynamics.com/en/news/aws-and-ksat-sign-ground-station-agreement/)
- **KSATlite:** 50+ antennas at 12+ sites, with a REST API and web scheduling portal. Source is an aggregator. — [ObservationData comparison](https://www.observationdata.com/providers/ground-station-services/)
- **SSC Infinity:** a network designed for small-satellite constellations in LEO. Source is an aggregator. — [ObservationData](https://www.observationdata.com/providers/ground-station-services/)
- **Leaf Space:** GSaaS through a simple API, proprietary autonomous scheduling software, and global LEO coverage. Source is an aggregator. — [ObservationData](https://www.observationdata.com/providers/ground-station-services/)
- **ATLAS Space Operations Freedom:**
  - a single API to 50+ antennas at 34+ sites
  - the "Flex Scheduler" REST machine-to-machine interface, explicitly for client lights-out operations
  - the "FreeTime/Discover" API to find unused antenna time
  - Java and Python client libraries
  - ATLAS is being acquired by York Space Systems' parent company
  — [ATLAS Freedom GSaaS](https://atlasspace.com/freedom-gsaas/); [Freedom integration PDF, Sep 2024](https://atlasspace.com/wp-content/uploads/2024/09/Freedom-Integration-09092024-WEB.pdf); [GovConWire](https://www.govconwire.com/articles/york-space-systems-atlas-space-operations-freedom-software-ground-ops)

**AI / automated mission planning**
- Cognitive Space CNTIENT.Optimize provides:
  - an AI-based scheduler for tasks under dynamic priorities and constraints
  - order management
  - automated pass reservation and optimisation across multiple ground-station networks
  - deployment on AWS
  — [Cognitive Space](https://www.cognitivespace.com/cntient-optimize/); [AWS blog](https://aws.amazon.com/blogs/publicsector/satellite-mission-operations-using-artificial-intelligence-on-aws/)
- Cognitive Space won a $900K NOAA ground-processing demonstration contract. — [Cognitive Space](https://www.cognitivespace.com/news/cognitive-space-wins-NOAA-contract/)

**Data standards an MCS FD interface must speak**
- CCSDS 508.0-B-1 CDM is the standard conjunction message. TraCSS publishes its own CDM field spec, v2.1 dated July 2025. — [TraCSS CDM Spec v2.1](https://space.commerce.gov/wp-content/uploads/2025/07/TraCSS-_CDM_Spec_Version_2.1.pdf); [TraCSS CDM field recommendations](https://space.commerce.gov/wp-content/uploads/Recommendation-on-TraCSS-CDM-Fields-3-25-2024-v1.2.pdf)

### Inferences
- An MCS does not need to re-implement high-fidelity orbit determination. The common pattern is the MCS owning:
  - TLE/OMM ingestion
  - SGP4-level pass and visibility prediction
  - an OEM import/export pipe
  - CDM ingestion and display
  - a scheduler

  Precision OD, manoeuvre design and Pc computation are delegated to FocusSuite, ODTK, FreeFlyer, OASYS, Orekit or GMAT.
- Orekit (Java) is the natural embeddable library for a non-COTS MCS, given its OD, CCSDS and SGP4 coverage. Python or Go stacks would call it as a sidecar service.
- Pass booking should be abstracted behind a provider interface. Azure's exit shows that networks churn, and every surviving network (ATLAS, KSAT, AWS, Leaf) exposes REST scheduling.

### Gaps
- Telespazio's mission-planning products: not researched (no searches run within budget).
- CS GROUP commercial FD products beyond Orekit: not verified.
- Whether Orekit 13 reads and writes CDMs: not confirmed in the sources fetched.
- Kratos "OS/COMET" as an FD product: no source found. Kratos FD is OASYS within EPOCH.
- Dedicated GNSS-based OD products (onboard GNSS plus ground OD such as ODTK GNSS mode): not specifically sourced. Orekit lists a GNSS propagator option.
- Current per-minute pricing and API details for AWS Ground Station, Leaf Space, SSC and KSATlite: not pulled from primary vendor pages.
- Attitude and pointing planning, and eclipse / beta-angle tools: no dedicated sources gathered. They are standard features of STK, FreeFlyer, GMAT and Orekit (event detectors), but this is not cited here.

## What are the 2024-2026 regulatory and operational expectations for collision avoidance and space traffic coordination?

### Takeaway
- **FCC:** the 5-year post-mission disposal rule is in force for new US-licensed LEO satellites, effective 29 Sep 2024.
- **ESA:** its Oct 2025 requirements set a 1e-4 action threshold and require recurrent manoeuvre capability for constellations. The Zero Debris Charter adds 2030 targets.
- **US civil space traffic coordination:** TraCSS is live but still in pilot as of Aug 2026. Space-Track (18th SDS) remains the system of record for CDMs until the migration is declared.
- **Big constellations:** they act on far tighter thresholds. Starlink manoeuvres at Pc of 3e-7.

### Cited Findings
- **FCC 22-74:**
  - adopted September 2022
  - requires disposal within 5 years of mission end for satellites in LEO, replacing the 25-year guideline
  - effective 29 Sep 2024 for new applications; earlier authorisations are grandfathered
  — [FCC 22-74 order](https://docs.fcc.gov/public/attachments/FCC-22-74A1.pdf); [FCC news release](https://docs.fcc.gov/public/attachments/DOC-387720A1.pdf); [SpaceNews](https://spacenews.com/fcc-approves-new-orbital-debris-rule/)
- FAA withdrew its proposed 25-year upper-stage deorbit rule in March 2026. Source is secondary and was not verified against the Federal Register. — [SpaceNexus blog](https://spacenexus.us/blog/space-debris-regulations-changes-2026)
- **ESA Space Debris Mitigation Requirements (Oct 2025):**
  - collision-probability action threshold of 1e-4 or lower
  - recurrent manoeuvre capability required in GEO, in LEO for high and very-high risk cases, and for constellations
  — [ESA Zero Debris policy & requirements PDF](https://blogs.esa.int/spacesafety-community/files/2026/02/ESAs-Internal-Zero-Debris-Policy-and-Space-Debris-Mitigation-Requirements.pdf)
- **Zero Debris Charter (non-binding):**
  - 2030 targets: below 1-in-1,000 probability of debris generation per object; 99% success in post-mission clearance of LEO and GEO; re-entry casualty risk well below 1-in-10,000
  - first signed by 12 countries (Austria, Belgium, Cyprus, Estonia, Germany, Lithuania, Poland, Portugal, Romania, Slovakia, Sweden, UK)
  - also signed by 40+ companies and organisations
  — [Charter text](https://esoc.esa.int/sites/default/files/Zero_Debris_Charter_EN.pdf); [ESA](https://www.esa.int/Space_Safety/Dozens_of_companies_institutions_and_NGOs_sign_the_Zero_Debris_Charter); [Access Partnership](https://accesspartnership.com/opinion/access-alert-12-countries-sign-zero-debris-charter-pivot-to-space-sustainability/)
- **Space-Track operator processes:**
  - Operators manage CDM and close-approach notification (CAN) privileges in the Operator Panel, and can see intra-constellation CDMs.
  - The Spaceflight Safety Handbook v1.7 (Apr 2023) sets basic and advanced CDM reporting criteria per orbital regime.
  - It recommends submitting operator ephemeris to Space-Track on a recurring basis.
  — [Space-Track Handbook for Operators](https://www.space-track.org/documents/Spacetrack_Handbook_for_Operators.pdf); [SFS Handbook v1.7](https://www.space-track.org/documents/SFS_Handbook_For_Operators_V1.7.pdf)
- **TraCSS (US Office of Space Commerce):**
  - production launch March 2026 with 17 users
  - by Aug 2026, 70+ operators and 10+ nations registered, covering about 11,345 satellites
  - screening every 4 hours, using the catalogue plus operator ephemerides and updated space weather
  - on-demand screening of candidate manoeuvres, with results in seconds
  - operator directory
  - remains in "pilot" because of budget uncertainty that depends on FY27 appropriations
  - migration off Space-Track not yet scheduled
  - commercial SSA data integration on hold
  - public SSA data (locations, conjunction notifications, operator ephemerides with manoeuvre plans) planned for later in 2026
  — [Via Satellite, 26 Aug 2026](https://www.satellitetoday.com/government-military/2026/08/26/tracss-traffic-coordination-system-remains-in-pilot-mode-due-to-budget-uncertainty/); [TraCSS page](https://space.commerce.gov/traffic-coordination-system-for-space-tracss/); [PI 1.2 on-demand screening](https://space.commerce.gov/tracss-implements-program-increment-1-2-on-demand-ephemerides-screening-and-bulk-submissions-now-live/)
- **Operational practice at scale:**
  - Starlink reported 207,152 avoidance manoeuvres from Dec 2025 to May 2026, and 148,696 in the prior half-year: over 355,000 a year, more than 40 per satellite per year.
  - Manoeuvres are autonomous and trigger at Pc above 3e-7. Starlink earlier tightened from 1e-4 to 1e-5.
  - These figures come from SpaceX's FCC semiannual reports via secondary press; the FCC filing itself was not fetched.
  — [Space.com](https://www.space.com/space-exploration/satellites/every-spacex-starlink-satellite-has-to-dodge-a-collision-almost-weekly-and-experts-fear-the-worst); [KeepTrack deep dive](https://keeptrack.space/deep-dive/collision-avoidance-conjunction-screening)

### Inferences
- A 2026 MCS that targets FCC-licensed or ESA-contracted missions needs:
  - CDM ingestion from Space-Track, with a TraCSS adapter ready and both formats normalised to CCSDS CDM
  - an action-threshold policy configurable per mission, from 1e-4 down to Starlink-like 1e-7
  - an operator ephemeris upload workflow, including planned manoeuvres
  - manoeuvre-screening requests before executing a burn
  - disposal-plan tracking against the 5-year deadline
- Dual-source CDMs (18th SDS plus commercial, e.g. LeoLabs) with conflicting Pc values are normal. Conflict display and source provenance are UX requirements.

### Gaps
- EU Space Act (proposed June 2025) status and its collision-avoidance obligations: not researched.
- UK CAA and ISO 24113:2023 updates: not researched.
- The text of the FCC 2024-2026 orbital-debris follow-on proceedings: not fetched.

## How do new-space operators automate passes and operations at scale, and what does their ops tooling look like?

### Takeaway
Large new-space fleets run "lights-out" by design:
- in-house microservice MCSs with automated contact scheduling and automated tasking
- federated ground networks (owned plus GSaaS)
- autonomous onboard or ground-automated collision avoidance

Humans handle exceptions. Some, like Spire, sell their internal tooling as a product.

### Cited Findings
- **Planet:**
  - 500+ satellites launched
  - Mission Control is surrounded by distributed microservices for scheduling, tasking and telemetry processing, which automate most day-to-day fleet operations
  - the ground network handles 650+ high-speed downlink passes per day
  - TT&C radios carry health telemetry, logs and tasking
  — [APNIC blog (2022, older)](https://blog.apnic.net/2022/07/27/behind-the-network-that-images-the-whole-world-every-day/); [Planet Pulse](https://www.planet.com/pulse/so-you-launched-a-satellite-now-what/)
- Planet is reported to run onboard NVIDIA IGX Thor processors for in-orbit classification to cut downlink. Source is secondary (newspaceeconomy.ca, Mar 2026) and is treated with caution. — [newspaceeconomy.ca](https://newspaceeconomy.ca/2026/03/30/ai-as-mission-control-how-autonomous-satellite-operations-are-changing-the-ground-segment/)
- **Spire:**
  - 34+ stations with 100+ antennas, plus partnerships with KSAT and Kepler
  - 120+ satellites powered by its ops stack
  - reports 99.7% automated operations
  - sells a web Constellation Management Platform (tasking, contact scheduling, fleet health, payload ops), launched Nov 2023 with ESA support
  — [Spire ground network](https://spire.com/space-services/ground-station-network/); [Spire CMP](https://spire.com/space-services/constellation-management-platform/); [SatNews 2023](https://news.satnews.com/2023/11/14/spire-global-unveils-constellation-management-platform/)
- Spire's automated constellation operations are documented academically in "On the Automation, Optimization, and In-Orbit Validation of Intelligent Satellite Constellation Operations" (2022). — [arXiv 2210.11171](https://arxiv.org/pdf/2210.11171)
- **Capella:**
  - the flow from customer request (web or API) to downlink is fully automated
  - tasks are relayed to satellites through a GEO communications relay
  - downlinks are booked with AWS Ground Station's scheduling API
  - data reaches the cloud about 25 minutes after downlink
  - Capella runs C2 on AWS
  — [AWS / Capella](https://aws.amazon.com/blogs/publicsector/capella-uses-space-bring-you-closer-earth); [Amazon press 2020 (older)](https://press.aboutamazon.com/2020/6/capella-space-goes-all-in-on-aws)
- **Starlink:** collision avoidance is autonomous, at hundreds of thousands of manoeuvres a year (see Q2). — [Space.com](https://www.space.com/space-exploration/satellites/every-spacex-starlink-satellite-has-to-dodge-a-collision-almost-weekly-and-experts-fear-the-worst)
- **OneWeb:** had an operational agreement with LeoLabs for conjunction data (older, around 2020-21). — [LeoLabs/OneWeb](https://leolabs-space.medium.com/leolabs-announces-operational-agreement-with-oneweb-fde505c0262e)
- **Productised lights-out building blocks:**
  - ATLAS Flex Scheduler REST, explicitly for "client lights out operations"
  - Cognitive Space multi-network pass reservation
  - Leaf Space autonomous scheduling
  — [ATLAS](https://atlasspace.com/freedom-gsaas/); [Cognitive Space](https://www.cognitivespace.com/cntient-optimize/); [ObservationData](https://www.observationdata.com/providers/ground-station-services/)
- A 2020 review paper on automated operations of large distributed satellite systems describes the paradigm shift. — [ResearchGate](https://www.researchgate.net/publication/343791434_Towards_the_Automated_Operations_of_Large_Distributed_Satellite_Systems_Part_1_Review_and_Paradigm_Shifts)

### Inferences
- The common scale pattern:
  1. Plan (tasking optimiser) produces the schedule (contacts across federated GSaaS).
  2. Each pass executes automatically: pre-pass command stack upload, TM ingest, data delivery.
  3. Automated limit checks and anomaly rules escalate to on-call humans.

  The ratio of operators to satellites is driven by exception handling, not by manual passes.
- Features most of these operators share that an MCS needs to scale to 50-1000+ satellites:
  - fleet-level (not per-satellite) views
  - per-satellite plan and contact timelines
  - provider-agnostic contact booking
  - autonomous CA hooks
  - API-first tasking

### Gaps
- Starlink internal ground tooling is not publicly documented beyond FCC CA reports.
- Ops tooling at OneWeb/Eutelsat and Satellogic in 2024-2026: no primary sources found within budget.
- Operator-to-satellite staffing ratios: no reliable published numbers found.
- Automated anomaly response details (rule engines, onboard FDIR versus ground) at these operators: not publicly sourced.
- Planet's current (2025-2026) architecture: the APNIC description dates from 2022.
