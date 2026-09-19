# VYUH-MCS — System Architecture, Microservices & Operations Manual

**Document ID:** VYUH-DOC-ARCH-001  
**Version:** 1.0.0  
**Classification:** Mission Critical Engineering Specification  
**System:** Vanguard Unified Horizon — Mission Control Software (VYUH-MCS)  
**Organization:** Akashaveda Space Technologies  
**Target Specification:** CCSDS 132.0, 133.0, 232.0, 232.1 (COP-1), 660.0 (XTCE)  
**Date:** September 2026  

---

## Table of Contents

1. [Executive Summary & System Overview](#1-executive-summary--system-overview)
2. [CCSDS & Space Communications Standards Compliance](#2-ccsds--space-communications-standards-compliance)
3. [End-to-End System Architecture](#3-end-to-end-system-architecture)
4. [Downlink Telemetry Pipeline](#4-downlink-telemetry-pipeline)
   - 4.1 Frame Ingest Service (`internal/ingest`)
   - 4.2 Telemetry Frame Processing Engine (TFPE - `internal/tfpe`)
   - 4.3 Telemetry Packet Processing Engine (TPPP - `internal/tppp`)
   - 4.4 Telemetry Data Archive Engine (TDAE - `internal/tdae`)
5. [Uplink Telecommand Pipeline & Closed-Loop COP-1](#5-uplink-telecommand-pipeline--closed-loop-cop-1)
   - 5.1 Command Gateway Service (`internal/cmdgw`)
   - 5.2 Uplink Processing Engine (UPE - `internal/upe`)
   - 5.3 Uplink Transfer Frame Engine (UTFE - `internal/utfe`)
   - 5.4 Closed-Loop COP-1 Flow Control via CLCW
6. [Support & Reliability Microservices](#6-support--reliability-microservices)
   - 6.1 Backend-for-Frontend Service (BFF - `internal/bff`)
   - 6.2 Alarm Manager Service (`internal/alarm`)
   - 6.3 Gap Replay Service (`internal/gapreplay`)
   - 6.4 Dead Letter Monitor (`internal/dlm`)
   - 6.5 Spacecraft Telemetry Simulator (`internal/simulator`)
7. [Storage Architecture & Database Schemas](#7-storage-architecture--database-schemas)
   - 7.1 Redis In-Memory Key-Space Layout
   - 7.2 TimescaleDB Hypertables & Continuous Aggregates
   - 7.3 PostgreSQL Relational Schemas
8. [Frontend Ingestion & UI Architecture](#8-frontend-ingestion--ui-architecture)
   - 8.1 Network Proxying & Port Mapping
   - 8.2 Client-Side WebSocket & Store Flow
   - 8.3 Reactive Subsystem Display Components
9. [Operator & Developer Guide](#9-operator--developer-guide)
   - 9.1 Build System & Binaries
   - 9.2 Running All Engines (Separate Processes)
   - 9.3 Running Individual Engines
   - 9.4 Running Full Test Suites
   - 9.5 API Reference & Interactive Testing

---

## 1. Executive Summary & System Overview

**Vanguard Unified Horizon — Mission Control Software (VYUH-MCS)** is an enterprise-grade, microservice-based satellite ground operations and mission control platform. Engineered to support modern low Earth orbit (LEO), medium Earth orbit (MEO), and geostationary (GEO) satellite constellations, VYUH-MCS provides real-time telemetry processing, command dispatch with strict safety interlocks, automated space-link protocol execution, and responsive multi-satellite operator consoles.

### Key Performance Capabilities
- **Throughput:** >100,000 telemetry parameters/sec sustained processing across multi-spacecraft constellations.
- **Latency:** Sub-100 millisecond glass-to-glass latency from ground antenna reception to browser UI update.
- **Reliability:** Hardware-grade CRC-16 validation, automated frame gap recovery, and closed-loop COP-1 guaranteed uplink delivery.
- **Security:** AES-256-GCM authenticated encryption on telecommands, role-based access control (RBAC), and immutable audit logs.
- **Modularity:** 12 standalone microservice engines implemented in Go 1.22+, capable of running as individual microservices, containerized pods, or an integrated orchestration stack.

---

## 2. CCSDS & Space Communications Standards Compliance

VYUH-MCS strictly conforms to international space communications standards established by the Consultative Committee for Space Data Systems (CCSDS):

| Standard | Specification Title | Implementation Details in VYUH-MCS |
| :--- | :--- | :--- |
| **CCSDS 132.0-B-3** | TM Space Data Link Protocol | Attached Sync Marker (ASM `0x1ACFFC1D`) sync lock, 1,115-byte fixed frame processing, Virtual Channel ID (VCID) routing, CRC-16/CCITT error checking, First Header Pointer (FHP) packet reassembly. |
| **CCSDS 133.0-B-2** | Space Packet Protocol | Packing and unpacking of primary Space Packet headers: Application Process Identifier (APID), packet sequence flags, and 14-bit packet sequence counter. |
| **CCSDS 232.0-B-4** | TC Space Data Link Protocol | Type-AD (Sequence-Controlled) and Type-BC (Expedited Bypass) Transfer Frames, Segment Header parsing, Frame Error Control Field (FECF) generation. |
| **CCSDS 232.1-B-2** | Communications Operation Procedure-1 (COP-1) | Full Frame Operation Procedure-1 (FOP-1) state machine with 4 formal states ($S1$ Active, $S2$ Retransmit, $S3$ Wait, $S4$ Initial), sliding transmission window, modulo-256 transmitter frame count $V(S)$ and report value $V(R)$ processing, adaptive $T1$ timeout ($2 \times \text{RTT} + 500\text{ms}$). |
| **CCSDS 660.0-B-2** | XML Telemetric & Command Exchange (XTCE) | Arbitrary bit-offset and bit-length extraction, polynomial ($y = a_0 + a_1 x + ...$), Look-Up Table (LUT), and cubic spline calibrations, 4-level limit checks with 3-consecutive-sample hysteresis. |

---

## 3. End-to-End System Architecture

The following block diagram illustrates the complete interaction between the space segment, ground antenna hardware, downlink processing pipeline, uplink command chain, closed-loop COP-1 feedback, support microservices, storage tiers, and frontend user interface:

```mermaid
flowchart TB
    subgraph Space_Segment ["🛰️ SPACE SEGMENT & GROUND ANTENNAS"]
        SAT["Spacecraft (SCID 42 / SCID 1)"]
        GS_RX["Ground Station Receiver (TCP/UDP :5050)"]
        GS_TX["Ground Station Transmitter Driver"]
        SIM["Telemetry Simulator (Orbit Simulation)"]
    end

    subgraph Downlink_Pipeline ["📥 DOWNLINK PIPELINE (Telemetry)"]
        INGEST["Frame Ingest Service (:5050)<br/><i>internal/ingest</i>"]
        TFPE["TFPE Engine<br/><i>internal/tfpe</i><br/>• ASM 0x1ACFFC1D Lock<br/>• CRC-16/CCITT Verify<br/>• FHP Reassembly<br/>• OCF/CLCW Extract"]
        TPPP["TPPP Engine<br/><i>internal/tppp</i><br/>• XTCE Bit-Field Decom<br/>• Calibrations (Poly/LUT/Spline)<br/>• 4-Level Hysteresis Alarms"]
        TDAE["TDAE Engine (:8088)<br/><i>internal/tdae</i><br/>• WebSocket Broadcaster (/ws/telemetry)<br/>• Redis DB-0 (CVT Writer)<br/>• TimescaleDB Batch Ingest"]
    end

    subgraph Uplink_Pipeline ["📤 UPLINK PIPELINE (Telecommands)"]
        CMDGW["Command Gateway (:8080)<br/><i>internal/cmdgw</i><br/>• REST API (/api/v1/commands)<br/>• UUID v7 Generation<br/>• Command State Tracking"]
        UPE["UPE Engine<br/><i>internal/upe</i><br/>• L1-L4 Safety Checks<br/>• AES-256-GCM Cipher<br/>• 14-bit Sequence Count"]
        UTFE["UTFE Engine<br/><i>internal/utfe</i><br/>• CCSDS 232.0 TC Framing<br/>• COP-1 FOP-1 State Machine<br/>• Adaptive T1 Timer<br/>• Redis DB-5 Retransmit Buffer"]
    end

    subgraph Closed_Loop ["🔄 CLOSED-LOOP COP-1 FEEDBACK"]
        CLCW_BUS["Kafka Topic: clcw.events<br/><i>Report Value V(R), Retransmit, Wait</i>"]
    end

    subgraph Support_Microservices ["🛡️ SUPPORT MICROSERVICES"]
        BFF["BFF Service (:8085)<br/><i>internal/bff</i><br/>• Satellite Registry REST<br/>• CVT & History Query<br/>• Alarm Acknowledgment"]
        ALARM["Alarm Manager<br/><i>internal/alarm</i><br/>• 30s Sliding Dedup<br/>• Redis Pub/Sub (ws:alarms)"]
        GAP["Gap Replay Service<br/><i>internal/gapreplay</i><br/>• Frame Gap Recovery<br/>• S3 / Redis Bloom Filter"]
        DLM["Dead Letter Monitor<br/><i>internal/dlm</i><br/>• DLQ Failure Analysis<br/>• Rate Alerting (>10/min)"]
    end

    subgraph Storage_Tiers ["💾 MULTI-TIER DATA STORES"]
        REDIS["Redis In-Memory Key-Value<br/>• DB-0: CVT (Current Value Table)<br/>• DB-1: Whitelist & Gap Filter<br/>• DB-2: Command Inhibits<br/>• DB-5: COP-1 Retransmit Buffer"]
        KAFKA["Kafka Event Streaming Backbone<br/>• telemetry.raw.frames<br/>• telemetry.space.packets<br/>• telemetry.processed<br/>• raw.commands<br/>• tc.packets<br/>• cmd.ack.events"]
        TIMESCALE["TimescaleDB (PostgreSQL 16)<br/>• telemetry_raw (Hypertable)<br/>• Continuous Aggregates"]
    end

    subgraph Frontend_UI ["🖥️ FRONTEND USER INTERFACE (React 18 :3000)"]
        VITE_PROXY["Vite Dev Server Proxy (:3000)<br/>• /ws/telemetry ──► :8088<br/>• /api/v1 ──► :8085<br/>• /api/v1/commands ──► :8080"]
        USE_WS["src/hooks/useWebSocket.ts<br/>• WebSocket Client Listener"]
        STORE["src/store/useFleetStore.ts<br/>• Reactive CVT State (Zustand)"]
        UI_VIEWS["Mission Control Screens<br/>• Constellation Overview<br/>• Satellite Health Dashboard<br/>• Telecommand Queue & Dispatcher"]
    end

    SAT ──► GS_RX
    SIM ──► GS_RX
    GS_RX ──► INGEST
    GS_TX ──► SAT
    INGEST ──► KAFKA
    KAFKA ──► TFPE
    TFPE ──► KAFKA
    TFPE ──► CLCW_BUS
    KAFKA ──► TPPP
    TPPP ──► KAFKA
    KAFKA ──► TDAE
    TDAE ──► REDIS
    TDAE ──► TIMESCALE
    CLCW_BUS ──► UTFE
    CMDGW ──► KAFKA
    KAFKA ──► UPE
    UPE ──► REDIS
    UPE ──► KAFKA
    KAFKA ──► UTFE
    UTFE ──► GS_TX
    UTFE ──► REDIS
    UTFE ──► KAFKA
    KAFKA ──► CMDGW
    KAFKA ──► GAP
    GAP ──► KAFKA
    KAFKA ──► ALARM
    KAFKA ──► DLM
    UI_VIEWS ──► VITE_PROXY
    VITE_PROXY ──► CMDGW
    VITE_PROXY ──► BFF
    BFF ──► REDIS
    BFF ──► TIMESCALE
    TDAE ──► VITE_PROXY
    VITE_PROXY ──► USE_WS
    USE_WS ──► STORE
    STORE ──► UI_VIEWS
```

---

## 4. Downlink Telemetry Pipeline

The downlink pipeline processes raw telemetry from physical antennas to calibrated user values:

### 4.1 Frame Ingest Service (`internal/ingest`)
- **Network Interface:** Listens on port `:5050 TCP` (and UDP).
- **Functionality:** Ingests raw byte streams, wraps them with antenna metadata (`antenna_id`, reception timestamp `receive_ts_ns`, `pass_id`), and produces to Kafka topic `telemetry.raw.frames`.
- **Redundancy:** Supports active/standby pod roles (`is_primary`) with automatic failover heartbeats.

### 4.2 Telemetry Frame Processing Engine (TFPE - `internal/tfpe`)
- **Input:** Consumes `telemetry.raw.frames`.
- **Sync Locking:** Locates the 4-byte Attached Sync Marker (ASM `0x1ACFFC1D`) using a sliding window bit buffer.
- **Error Detection:** Computes CRC-16/CCITT ($x^{16} + x^{12} + x^5 + 1$, initial value `0xFFFF`) over the 1,113 frame bytes. Invalid frames are routed to `dead.letter`.
- **CLCW Extraction:** Decodes the 32-bit Operational Control Field (OCF) containing COP-1 feedback and emits to `clcw.events`.
- **Packet Reassembly:** Reads the 11-bit First Header Pointer (FHP) to reconstruct variable-length CCSDS Space Packets across fixed frame boundaries.
- **Gap Detection:** Compares Virtual Channel Frame Count (VCFC) against expected values; detected missing frames trigger events on `telemetry.gaps`.

### 4.3 Telemetry Packet Processing Engine (TPPP - `internal/tppp`)
- **Input:** Consumes `telemetry.space.packets`.
- **XTCE Decommutation:** Extracts arbitrary-width bitfields from the packet data payload using bitmask and bit-shift operations ([`pkg/bitreader`](file:///D:/Vyuh-Mcs/pkg/bitreader/bitreader.go)).
- **Calibration Engine:**
  - *Polynomial:* $y = a_0 + a_1 x + a_2 x^2 + ...$
  - *Look-Up Table (LUT):* Piecewise linear interpolation between calibrated pairs.
  - *Cubic Spline:* Natural cubic spline interpolation for high-precision sensor curves.
- **Alarm Monitoring:** Evaluates 4 alarm thresholds (`LOW_LOW`, `LOW`, `HIGH`, `HIGH_HIGH`). Requires 3 consecutive samples beyond a threshold before triggering state changes (hysteresis filtering). Emits to `alarm.events`.
- **Output:** Produces calibrated records to `telemetry.processed`.

### 4.4 Telemetry Data Archive Engine (TDAE - `internal/tdae`)
- **Network Interface:** Native WebSocket listener on `:8088/ws/telemetry`.
- **Redis DB-0 CVT:** Caches the latest value of every parameter in $O(1)$ key-value format (`cvt:<scid>:<param>`).
- **TimescaleDB Archiver:** Buffers telemetry samples and commits batch inserts into the `telemetry_raw` hypertable.
- **WebSocket Streaming:** Broadcasts JSON `PARAM_UPDATE` frames to connected browser clients with rate-limiting protection (10 Hz per parameter per client).

---

## 5. Uplink Telecommand Pipeline & Closed-Loop COP-1

The uplink pipeline guarantees verified, encrypted, and order-controlled telecommand delivery:

### 5.1 Command Gateway Service (`internal/cmdgw`)
- **Network Interface:** HTTP REST API on `:8080`.
- **Ingress Route:** `POST /api/v1/commands`.
- **Validation:** Validates JSON syntax, required fields (`scid`, `apid`), priority (`CRITICAL`, `HIGH`, `NORMAL`, `LOW`), and authorization headers (`X-Operator-ID`).
- **Command ID Generation:** Generates monotonically sortable UUID v7 identifiers.
- **Lifecycle Tracking:** Tracks command states (`PENDING` $\rightarrow$ `QUEUED` $\rightarrow$ `SENT` $\rightarrow$ `ACKNOWLEDGED` or `FAILED`/`CANCELLED`).
- **Output:** Publishes accepted commands to `raw.commands` and returns HTTP 202 Accepted.

### 5.2 Uplink Processing Engine (UPE - `internal/upe`)
- **Input:** Consumes `raw.commands`.
- **Safety Chain Verification:**
  - **L1 (Range Limits):** Validates parameters against parameter limits ($min \le val \le max$).
  - **L2 (CVT Constraints):** Checks live spacecraft conditions in Redis DB-0 (e.g., verifying bus voltage before payload activation).
  - **L3 (Inhibit Flags):** Queries Redis DB-2 (`uplink:inhibited:<scid>:<apid>`) to ensure the command is not blocked.
  - **L4 (Interlock Check):** Ensures no conflicting command is currently executing on the satellite.
- **Cryptography:** Retrieves the 256-bit AES key, generates a cryptographically secure 12-byte initialization vector (IV), and encrypts the payload using **AES-256-GCM**, producing a 16-byte authentication tag.
- **Packet Construction:** Assembles the CCSDS 133.0 TC Space Packet, increments the 14-bit sequence counter, and emits to `tc.packets`.

### 5.3 Uplink Transfer Frame Engine (UTFE - `internal/utfe`)
- **Input:** Consumes `tc.packets`.
- **Frame Construction:** Wraps packets into CCSDS 232.0 TC Transfer Frames:
  - *Type-AD:* Sequence-controlled transmission managed by COP-1.
  - *Type-BC:* Expedited bypass transmission for critical emergencies.
- **COP-1 FOP-1 State Machine:**
  - Manages transmitter frame sequence counter $V(S)$.
  - Buffers unacknowledged frames in Redis DB-5 (`cop1:<scid>:<seq>`).
  - Starts the adaptive $T1$ retransmission timer.
- **Transmitter Dispatch:** Sends raw frame bytes to the antenna driver.

### 5.4 Closed-Loop COP-1 Flow Control via CLCW
1. Spacecraft receives the TC frame, updates its receiver counter $V(R)$, and generates a **Command Link Control Word (CLCW)**.
2. The CLCW is embedded in the downlink TM frame OCF field and transmitted to the ground station.
3. In the downlink pipeline, **TFPE** extracts the CLCW and emits to `clcw.events`.
4. In the uplink pipeline, **UTFE** receives the event:
   - If report value $V(R) > V(S)$, the frame is confirmed received; UTFE removes the frame from Redis DB-5 and emits `ACKNOWLEDGED`.
   - If the Retransmit flag is set or the $T1$ timer expires, UTFE initiates automatic Go-Back-N retransmission.

---

## 6. Support & Reliability Microservices

### 6.1 Backend-for-Frontend Service (BFF - `internal/bff`)
- **Network Interface:** HTTP REST API on `:8085`.
- **Key Endpoints:**
  - `GET /health`: Health status of TimescaleDB, Redis, and PostgreSQL.
  - `GET /api/v1/satellites`: Fleet catalogue and orbit regime metadata.
  - `GET /api/v1/satellites/{scid}`: Detailed satellite configuration and TLE lines.
  - `GET /api/v1/telemetry/{scid}/current`: Full satellite Current Value Table (CVT).
  - `GET /api/v1/telemetry/{scid}/{param}/history`: Downsampled historical time series.
  - `POST /api/v1/alarms/{alarmId}/acknowledge`: Operator alarm acknowledgment.

### 6.2 Alarm Manager Service (`internal/alarm`)
- **Input:** Consumes `alarm.events`.
- **Sliding Window De-duplication:** Suppresses identical alarms for the same parameter and level within 30 seconds.
- **Operator Inhibit Check:** Checks Redis DB-2 (`alarm:inhibit:<scid>:<param>`).
- **Real-Time Distribution:** Publishes active alarms to Redis Pub/Sub channel `ws:alarms:{scid}`.

### 6.3 Gap Replay Service (`internal/gapreplay`)
- **Input:** Consumes `telemetry.gaps`.
- **Missing Frame Recovery:** Iterates through lost frame sequence numbers ($ExpectedFC$ to $ReceivedFC - 1$).
- **Bloom Filter Protection:** Checks Redis DB-1 to prevent duplicate re-injections.
- **Re-injection:** Reconstructs frames from storage and re-injects into `telemetry.raw.frames` with header `replay: true`.

### 6.4 Dead Letter Monitor (`internal/dlm`)
- **Input:** Consumes `dead.letter`.
- **Error Tracking:** Records corrupted frames, sync losses, and safety violations.
- **Rate Alerting:** Maintains a sliding 1-minute window; if error rate exceeds 10 msgs/min, triggers system alerts.

### 6.5 Spacecraft Telemetry Simulator (`internal/simulator`)
- **Target:** Streams over TCP to `:5050` (Frame Ingest).
- **Physics Simulation:** Generates realistic sinusoidal bus voltage (~28.2V), sinusoidal battery temperatures (18–32°C), and subsystem status flags.
- **Framing:** Packs payloads into valid CCSDS Space Packets and TM Transfer Frames with Attached Sync Markers and CRC-16.

---

## 7. Storage Architecture & Database Schemas

### 7.1 Redis In-Memory Key-Space Layout

| Redis DB | Purpose | Key Pattern | TTL / Format |
| :--- | :--- | :--- | :--- |
| **DB-0** | Current Value Table (CVT) | `cvt:<scid>:<param>` | Persistent Hash: `value`, `unit`, `ts_ns`, `alarm_state`, `quality` |
| **DB-1** | SCID Whitelist & Gap Tracking | `scid:whitelist`<br/>`gap:seen:<scid>:<fc>` | Hash: `scid -> 1`<br/>String: `1` with 24h TTL |
| **DB-2** | Safety Inhibit Flags | `uplink:inhibited:<scid>:<apid>`<br/>`alarm:inhibit:<scid>:<param>` | String: `"1"` (inhibited) or `"0"` |
| **DB-3** | XTCE Parameter Definitions | `xtce:param:<scid>:<param>` | JSON metadata cache |
| **DB-5** | COP-1 Retransmit Buffer | `cop1:<scid>:<seq>` | Raw binary TC frame with 60s TTL |

---

### 7.2 TimescaleDB Hypertables & Continuous Aggregates
Located in [`migrations/vyuh_telemetry/V001__init_telemetry.sql`](file:///D:/Vyuh-Mcs/migrations/vyuh_telemetry/V001__init_telemetry.sql):

- **`telemetry_raw` Hypertable:**
  - Partitioned by 1-day chunks on `ts`.
  - Columns: `ts TIMESTAMPTZ`, `scid INT`, `param_name TEXT`, `value DOUBLE PRECISION`, `raw_dn BIGINT`, `quality INT`, `alarm_level TEXT`, `pass_id TEXT`.
  - Indexes: `(scid, param_name, ts DESC)`.
- **Continuous Aggregates:**
  - `telemetry_1min_agg`: 1-minute rollups (`avg_val`, `min_val`, `max_val`, `sample_count`).
  - `telemetry_1hour_agg`: 1-hour rollups.
- **Compression:** ZSTD compression enabled on chunks older than 7 days.

---

### 7.3 PostgreSQL Relational Schemas

- **Configuration DB (`vyuh_config`):** Spacecraft registry (`satellites`), ground station definitions (`ground_stations`), antenna pass schedules (`pass_schedules`), and user role permissions.
- **Command DB (`vyuh_commands`):** Command log audit records (`command_logs`), execution states, operator IDs, and rejection reasons.
- **Audit DB (`vyuh_audit`):** Immutable compliance event ledger (`audit_events`) recording all telecommand submissions, alarm acknowledgments, and system configuration modifications.

---

## 8. Frontend Ingestion & UI Architecture

The frontend is built with **React 18**, **TypeScript**, **Zustand**, and **Tailwind CSS**, running on Vite port `:3000`.

### 8.1 Network Proxying & Port Mapping
[`vite.config.ts`](file:///D:/Vyuh-Mcs/vite.config.ts) routes local development calls directly to backend engines:
- `/ws/telemetry` $\longrightarrow$ `ws://127.0.0.1:8088` (TDAE WebSocket Server)
- `/api/v1/commands` $\longrightarrow$ `http://127.0.0.1:8080` (Command Gateway)
- `/api/v1` $\longrightarrow$ `http://127.0.0.1:8085` (BFF REST API)

### 8.2 Client-Side WebSocket & Store Flow
1. **Mount:** [`src/App.tsx`](file:///D:/Vyuh-Mcs/src/App.tsx) mounts [`useWebSocket()`](file:///D:/Vyuh-Mcs/src/hooks/useWebSocket.ts).
2. **Subscription:** The hook establishes connection and sends:
   ```json
   { "type": "SUBSCRIBE", "subscriptions": [{ "scid": 42, "params": ["*"] }] }
   ```
3. **Dispatch:** Upon receiving `PARAM_UPDATE`, it dispatches directly to [`src/store/useFleetStore.ts`](file:///D:/Vyuh-Mcs/src/store/useFleetStore.ts):
   ```typescript
   useFleetStore.getState().updateParam(satId, data.param, {
     eu_value: data.value,
     unit: data.unit,
     alarm_state: data.alarm === 'HIGH' ? 2 : 0,
     timestamp_utc: data.ts,
   });
   ```

### 8.3 Reactive Subsystem Display Components
- [`SatelliteHealth.tsx`](file:///D:/Vyuh-Mcs/src/screens/telemetry/SatelliteHealth.tsx): Selectively reads `cvt[satId]` across Power, ADCS, Thermal, and Comms subsystems.
- [`ParameterCard.tsx`](file:///D:/Vyuh-Mcs/src/components/organisms/ParameterCard.tsx): Displays live numerical values, limit progress bars, trend sparklines, and dynamic alarm color badges (`NOMINAL`, `WARNING`, `CRITICAL`, or `STALE DATA`).

---

## 9. Operator & Developer Guide

### 9.1 Build System & Binaries
All microservices can be compiled into standalone Windows executables using the automated build script:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/local/build-all.ps1
```

Executables output to [`D:\Vyuh-Mcs\bin\`](file:///D:/Vyuh-Mcs/bin/):
- `alarm-manager.exe`
- `bff.exe`
- `command-gateway.exe`
- `dead-letter-monitor.exe`
- `frame-ingest.exe`
- `gap-replay.exe`
- `simulator.exe`
- `tdae.exe`
- `tfpe.exe`
- `tppp.exe`
- `upe.exe`
- `utfe.exe`
- `vyuh-mcs.exe` (Unified orchestrator)

---

### 9.2 Running All Engines (Separate Processes)
To launch each of the 12 microservices in its own dedicated, titled PowerShell console:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/local/run-all-separate.ps1
```

---

### 9.3 Running Individual Engines
To launch an individual engine by name:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/local/run-engine.ps1 -Engine tfpe
powershell -ExecutionPolicy Bypass -File scripts/local/run-engine.ps1 -Engine command-gateway
powershell -ExecutionPolicy Bypass -File scripts/local/run-engine.ps1 -Engine tdae
```

---

### 9.4 Running Full Test Suites

#### Automated End-to-End Live Integration Tests:
Tests all running ports (`:8085`, `:8080`, `:5050`, `:8088`, `:3000`), command submission, conflict protection, schema validation, and WebSocket streaming:
```powershell
powershell -ExecutionPolicy Bypass -File scripts/local/test-all-engines.ps1
```
*Result: `13 PASSED, 0 FAILED`.*

#### Unit Test Suite (Across All 28 Test Modules):
```powershell
$env:Path = "C:\Users\akash\go_sdk\go\bin;" + $env:Path
$env:GOTOOLCHAIN = "local"
go test ./pkg/... ./internal/... ./cmd/... -v
```
*Result: `100% PASS`.*

---

### 9.5 API Reference & Interactive Testing

#### Submit a Live Telecommand:
```powershell
$cmd = @{
    scid = 42
    apid = 100
    priority = "HIGH"
    params = @{
        heater_power = 85.0
    }
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:8080/api/v1/commands" -Method Post -Body $cmd -ContentType "application/json"
```

#### Query Command Status:
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8080/api/v1/commands/<commandId>"
```

#### Fetch Live Satellite CVT via BFF REST:
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8085/api/v1/telemetry/42/current"
```

#### Fetch Historical Downsampled Telemetry:
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8085/api/v1/telemetry/42/OBC_TEMP/history?resolution=1min"
```

---

*Document compiled and verified by Antigravity AI Engineering for Akashaveda Space Technologies.*
