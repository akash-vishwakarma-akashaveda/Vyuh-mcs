# VYUH-MCS — Granular Microservice Engine Architectures

**Document ID:** VYUH-DOC-ENG-002  
**Version:** 1.0.0  
**Classification:** Deep-Dive Technical Engineering Specification  
**System:** Vanguard Unified Horizon — Mission Control Software (VYUH-MCS)  
**Organization:** Akashaveda Space Technologies  
**Target Standards:** CCSDS 132.0, 133.0, 232.0, 232.1 (COP-1), 660.0 (XTCE)  

---

## Index of 12 Microservice Engines

1. [Frame Ingest Service (`internal/ingest`)](#1-frame-ingest-service-internalingest)
2. [Telemetry Frame Processing Engine (TFPE - `internal/tfpe`)](#2-telemetry-frame-processing-engine-tfpe---internaltfpe)
3. [Telemetry Packet Processing Engine (TPPP - `internal/tppp`)](#3-telemetry-packet-processing-engine-tppp---internaltppp)
4. [Telemetry Data Archive Engine (TDAE - `internal/tdae`)](#4-telemetry-data-archive-engine-tdae---internaltdae)
5. [Command Gateway Service (`internal/cmdgw`)](#5-command-gateway-service-internalcmdgw)
6. [Uplink Processing Engine (UPE - `internal/upe`)](#6-uplink-processing-engine-upe---internalupe)
7. [Uplink Transfer Frame Engine (UTFE - `internal/utfe`)](#7-uplink-transfer-frame-engine-utfe---internalutfe)
8. [Backend-for-Frontend Service (BFF - `internal/bff`)](#8-backend-for-frontend-service-bff---internalbff)
9. [Alarm Manager Service (`internal/alarm`)](#9-alarm-manager-service-internalalarm)
10. [Gap Replay Service (`internal/gapreplay`)](#10-gap-replay-service-internalgapreplay)
11. [Dead Letter Monitor (`internal/dlm`)](#11-dead-letter-monitor-internaldlm)
12. [Spacecraft Telemetry Simulator (`internal/simulator`)](#12-spacecraft-telemetry-simulator-internalsimulator)

---

## 1. Frame Ingest Service (`internal/ingest`)

### 1.1 Purpose & Role
The **Frame Ingest Service** serves as the primary boundary layer between external ground station antenna modems and the VYUH-MCS backend. It ingests continuous bitstreams over physical and network links without introducing backpressure or packet loss.

### 1.2 Micro-Architecture Diagram

```mermaid
flowchart LR
    subgraph External_Antenna ["Physical Ground Antennas"]
        TCP_SRC["Antenna Modem (TCP Stream)"]
        UDP_SRC["Antenna Modem (UDP Datagrams)"]
    end

    subgraph Ingest_Service ["Frame Ingest Engine (internal/ingest)"]
        TCP_L["TCP Listener (:5050)"]
        UDP_L["UDP Listener (:5051)"]
        BUF["Stream Buffer & Boundary Slicer"]
        META["Metadata Tagging Engine<br/>• antenna_id<br/>• receive_ts_ns<br/>• pass_id<br/>• replay=false"]
        HB["Pod Heartbeat & Standby Monitor"]
    end

    subgraph Kafka_Bus ["Kafka Backbone"]
        RAW_TOPIC["telemetry.raw.frames"]
        HEALTH_TOPIC["system.health"]
    end

    TCP_SRC ──► TCP_L
    UDP_SRC ──► UDP_L
    TCP_L ──► BUF
    UDP_L ──► BUF
    BUF ──► META
    META ──►|"Produce RawFrameMessage"| RAW_TOPIC
    HB ──►|"Pod Heartbeat (1 Hz)"| HEALTH_TOPIC
```

### 1.3 Internal Components & Data Structures
- **`Config`:** Defines `ListenTCPAddr` (default `:5050`), `ListenUDPAddr`, `AntennaID`, `PodID`, and `IsPrimary`.
- **`RawFrameMessage`:**
  ```go
  type RawFrameMessage struct {
      SCID          uint16 `json:"scid"`
      FrameBytesB64 string `json:"frame_bytes_b64"`
      ReceiveTSNs   int64  `json:"receive_ts_ns"`
      AntennaID     string `json:"antenna_id"`
      PassID        string `json:"pass_id"`
      Replay        bool   `json:"replay"`
  }
  ```
- **Concurrency Model:** Multi-threaded non-blocking accept loop. Each TCP connection is handled in a dedicated goroutine with a 4,096-byte chunk buffer to guarantee sustained antenna throughput.

---

## 2. Telemetry Frame Processing Engine (TFPE - `internal/tfpe`)

### 2.1 Purpose & Role
**TFPE** is the core CCSDS 132.0-B-3 frame de-framing, error validation, and packet reassembly engine. It reconstructs mission packets out of sliced antenna bitstreams.

### 2.2 Micro-Architecture Diagram

```mermaid
flowchart TD
    RAW_IN["Kafka: telemetry.raw.frames"] ──► B64["Base64 Frame Decoder"]
    B64 ──► SYNC["Attached Sync Marker (ASM) Lock<br/>Matches 0x1ACFFC1D"]
    
    SYNC ──►|Sync Failed| DLQ1["Kafka: dead.letter<br/>(SYNC_LOST)"]
    SYNC ──►|Locked| CRC["CRC-16/CCITT Verifier<br/>Poly 0x1021, Init 0xFFFF"]
    
    CRC ──►|CRC Mismatch| DLQ2["Kafka: dead.letter<br/>(CRC_FAILURE)"]
    CRC ──►|CRC Valid| VC_CHECK["Virtual Channel Counter Check<br/>VCFC Modulo-256 Sequence Tracker"]
    
    VC_CHECK ──►|Lost Frames Detected| GAP_EVT["Kafka: telemetry.gaps<br/>(ExpectedFC, ReceivedFC)"]
    VC_CHECK ──► OCF_EXT["OCF Field Parser (32-bit)<br/>Extracts CLCW (Report V(R), Flags)"]
    OCF_EXT ──► CLCW_OUT["Kafka: clcw.events"]
    
    VC_CHECK ──► FHP_REASM["First Header Pointer (FHP) Reassembler<br/>Merges Spanned Packet Bytes"]
    FHP_REASM ──► PKT_OUT["Kafka: telemetry.space.packets<br/>(APID, SeqCount, Data)"]
```

### 2.3 Algorithms & Standards
- **ASM Lock:** Sliding window 32-bit search matching `0x1ACFFC1D`.
- **CRC-16/CCITT:** Hardware-exact table-driven CRC check over 1,113 data bytes:
  $$\text{CRC} = \text{CRC16}(D[0..1112]) \equiv D[1113..1114]$$
- **FHP Reassembly:** Reads the 11-bit First Header Pointer:
  - If `FHP == 0`: Packet begins immediately after the primary header.
  - If `FHP == 2046`: Frame contains continuous packet data without a header.
  - If `0 < FHP < 2046`: Prepends remaining bytes from `partialBuf[scid:vcid]` to complete the preceding packet, then starts new packet at offset `FHP`.

---

## 3. Telemetry Packet Processing Engine (TPPP - `internal/tppp`)

### 3.1 Purpose & Role
**TPPP** implements the CCSDS 660.0-B-2 (XTCE) telemetry decommutation pipeline. It extracts raw bits, applies mathematical calibrations, and checks 4-tier alarm limits.

### 3.2 Micro-Architecture Diagram

```mermaid
flowchart TD
    PKT_IN["Kafka: telemetry.space.packets"] ──► XTCE_REG["XTCE ParameterSet Registry<br/>(SCID, APID Matcher)"]
    
    XTCE_REG ──► BIT_READ["pkg/bitreader<br/>Arbitrary Bit Extraction<br/>Offset & Length (1-64 bits)"]
    
    BIT_READ ──► CALIB_ROUTER{"Calibration Type"}
    
    CALIB_ROUTER ──►|POLYNOMIAL| CAL_POLY["Polynomial Evaluator<br/>y = a0 + a1*x + a2*x^2"]
    CALIB_ROUTER ──►|LUT| CAL_LUT["Look-Up Table (LUT)<br/>Piecewise Linear Interp"]
    CALIB_ROUTER ──►|SPLINE| CAL_SPLINE["Cubic Spline Solver<br/>Tridiagonal Matrix Interp"]
    CALIB_ROUTER ──►|NONE| CAL_NONE["Raw Direct Conversion"]
    
    CAL_POLY ──► ALM_EVAL["4-Level Alarm Evaluator<br/>LOW_LOW | LOW | HIGH | HIGH_HIGH"]
    CAL_LUT ──► ALM_EVAL
    CAL_SPLINE ──► ALM_EVAL
    CAL_NONE ──► ALM_EVAL
    
    ALM_EVAL ──► HYST["3-Sample Hysteresis Filter<br/>Consecutive Hits Tracker"]
    
    HYST ──►|State Change| ALM_OUT["Kafka: alarm.events<br/>(TRIGGERED / CLEARED)"]
    HYST ──► PROC_OUT["Kafka: telemetry.processed<br/>DecodedParameter[] Array"]
```

### 3.3 Core Structures & Hysteresis Logic
```go
type AlarmTracker struct {
    CurrentState    telemetry.AlarmState // NORMAL, LOW, HIGH, etc.
    PendingState    telemetry.AlarmState
    ConsecutiveHits int                  // Must reach 3 hits to transition
}
```

---

## 4. Telemetry Data Archive Engine (TDAE - `internal/tdae`)

### 4.1 Purpose & Role
**TDAE** maintains the real-time operational state (Current Value Table) and streams telemetry to operators at low latency while archiving time-series data to TimescaleDB.

### 4.2 Micro-Architecture Diagram

```mermaid
flowchart TD
    PROC_IN["Kafka: telemetry.processed"] ──► TDAE_DISP["TDAE Dispatcher"]
    
    TDAE_DISP ──► CVT_WRITER["Redis DB-0 Writer<br/>Key: cvt:scid:param<br/>ZSET: cvt:updated:scid"]
    
    TDAE_DISP ──► BATCH_BUF["TimescaleDB Batch Buffer<br/>(Flushes at 200 items or 1s)"]
    BATCH_BUF ──► TIMESCALE["TimescaleDB Hypertable<br/>telemetry_raw (PostgreSQL 16)"]
    
    TDAE_DISP ──► SUB_FILTER["WebSocket Subscription Matcher<br/>Filter: scid & param list or '*'"]
    
    SUB_FILTER ──► RATE_LIMIT["Rate Limiter Watchdog<br/>Max 10 Hz per Parameter"]
    RATE_LIMIT ──► WS_QUEUE["Client Send Queue (chan []byte)"]
    WS_QUEUE ──► WS_SRV["WebSocket Server (:8088/ws/telemetry)"]
    WS_SRV ──► BROWSER["React Frontend UI"]
```

---

## 5. Command Gateway Service (`internal/cmdgw`)

### 5.1 Purpose & Role
The **Command Gateway** provides the secure, audited, and validated HTTP ingress for telecommand submissions from ground operators, automated procedures, and flight dynamics systems.

### 5.2 Micro-Architecture Diagram

```mermaid
flowchart LR
    OP["Operator / UI Console"] ──►|POST /api/v1/commands| HTTP_SRV["HTTP Server (:8080)"]
    
    HTTP_SRV ──► SCHEMA_VAL["Schema Validation<br/>• SCID & APID required<br/>• Priority mapping"]
    SCHEMA_VAL ──► AUTH_CHK["RBAC Operator Check<br/>X-Operator-ID Header"]
    
    AUTH_CHK ──► UUID_GEN["UUID v7 Generator<br/>Monotonic Millisecond Timestamp"]
    
    UUID_GEN ──► AUDIT_LOG["In-Memory Command Audit Store<br/>Status: PENDING"]
    
    AUDIT_LOG ──► KAFKA_PUB["Kafka Producer<br/>Topic: raw.commands"]
    
    KAFKA_PUB ──► HTTP_RESP["HTTP 202 Accepted Response<br/>{commandId, status: PENDING}"] ──► OP
    
    ACK_IN["Kafka: cmd.ack.events"] ──► STATUS_TRACK["Status Tracker<br/>PENDING ──► QUEUED ──► SENT ──► ACK"]
    STATUS_TRACK ──► AUDIT_LOG
```

---

## 6. Uplink Processing Engine (UPE - `internal/upe`)

### 6.1 Purpose & Role
**UPE** is the flight-safety enforcement engine. It verifies commands against four consecutive safety barriers and encrypts the command payload using space-qualified AES-256-GCM.

### 6.2 Micro-Architecture Diagram

```mermaid
flowchart TD
    CMD_IN["Kafka: raw.commands"] ──► L1["Safety Check L1: Parameter Range Limits<br/>min <= value <= max"]
    
    L1 ──►|Violation| REJECT["Kafka: cmd.ack.events<br/>Status: FAILED (ErrRangeViolation)"]
    L1 ──►|Pass| L2["Safety Check L2: CVT State Constraint<br/>Query Redis DB-0 (e.g. Bus Volts > 26V)"]
    
    L2 ──►|Violation| REJECT
    L2 ──►|Pass| L3["Safety Check L3: Inhibit Flag Verification<br/>Query Redis DB-2 (uplink:inhibited:scid:apid)"]
    
    L3 ──►|Violation| REJECT
    L3 ──►|Pass| L4["Safety Check L4: Interlock Mutex<br/>Query Redis DB-2 (uplink:executing:scid)"]
    
    L4 ──►|Violation| REJECT
    L4 ──►|Pass| VAULT["Key Store<br/>256-bit AES Key Lookup"]
    
    VAULT ──► CRYPTO["AES-256-GCM Encryption<br/>• 12-byte Random IV<br/>• AAD = commandId<br/>• 16-byte Authentication Tag"]
    
    CRYPTO ──► SEQ_CNT["Atomic 14-bit Sequence Counter<br/>seq = (seq + 1) & 0x3FFF"]
    
    SEQ_CNT ──► PKT_BUILD["CCSDS 133.0 TC Space Packet Builder"]
    
    PKT_BUILD ──► KAFKA_TC["Kafka: tc.packets"]
    PKT_BUILD ──► KAFKA_ACK["Kafka: cmd.ack.events (QUEUED)"]
```

---

## 7. Uplink Transfer Frame Engine (UTFE - `internal/utfe`)

### 7.1 Purpose & Role
**UTFE** is the CCSDS 232.0 TC Transfer Frame and CCSDS 232.1 COP-1 FOP-1 state machine engine. It manages the sliding transmission window, reliable Go-Back-N retransmission, and physical transmission dispatch.

### 7.2 Micro-Architecture Diagram

```mermaid
flowchart TD
    TC_IN["Kafka: tc.packets"] ──► MODE_CHECK{"BypassCOP1?"}
    
    MODE_CHECK ──►|true| TYPE_BC["Build Type-BC Frame<br/>Bypass Flag = 1 (Expedited)"]
    MODE_CHECK ──►|false| TYPE_AD["Build Type-AD Frame<br/>Sequence-Controlled<br/>SeqNumber = V(S)"]
    
    TYPE_AD ──► FOP_SM["COP-1 FOP-1 State Machine<br/>States: S1 (Active), S2 (Retransmit), S3 (Wait), S4 (Init)"]
    
    FOP_SM ──► REDIS_BUF["Redis DB-5 Retransmit Buffer<br/>Key: cop1:scid:seq (TTL 60s)"]
    
    FOP_SM ──► T1_TIMER["Adaptive T1 Timer<br/>T1 = 2*RTT + 500ms"]
    
    TYPE_BC ──► TX_DRV["Antenna Transmitter Driver<br/>(Hardware / Socket Output)"]
    TYPE_AD ──► TX_DRV
    
    TX_DRV ──► ACK_SENT["Kafka: cmd.ack.events (SENT)"]
    
    CLCW_IN["Kafka: clcw.events"] ──► CLCW_PROC["FOP-1 CLCW Report Processor<br/>Reads V(R), Retransmit, Wait flags"]
    
    CLCW_PROC ──►|V(R) > seq| CONFIRM_ACK["Clear Redis DB-5<br/>Kafka: cmd.ack.events (ACKNOWLEDGED)"]
    CLCW_PROC ──►|Retransmit Flag == 1| RE_TX["Go-Back-N Retransmission<br/>Re-transmit all frames from V(R)"]
    RE_TX ──► TX_DRV
```

---

## 8. Backend-for-Frontend Service (BFF - `internal/bff`)

### 8.1 Purpose & Role
**BFF** isolates UI presentation details from internal microservices, providing a high-speed RESTful facade for mission configuration, live telemetry queries, historical charts, and operator alarm control.

### 8.2 Micro-Architecture Diagram

```mermaid
flowchart LR
    UI["Frontend Console (:3000)"] ──►|HTTP Requests| BFF_MUX["BFF Router (:8085)"]
    
    BFF_MUX ──►|GET /api/v1/satellites| SAT_REG["Satellite Fleet Catalogue<br/>Names, SCIDs, TLE, Orbit Regime"]
    BFF_MUX ──►|GET /api/v1/telemetry/{scid}/current| CVT_READER["Redis DB-0 CVT Reader<br/>Full Satellite Snapshot"]
    BFF_MUX ──►|GET /api/v1/telemetry/{scid}/{param}/history| HIST_QUERY["TimescaleDB Continuous Aggregates<br/>1-min / 1-hour Rollups"]
    BFF_MUX ──►|POST /api/v1/alarms/{id}/acknowledge| ALM_ACK["Alarm Acknowledger<br/>Sets Status = ACKNOWLEDGED"]
    BFF_MUX ──►|GET /health| HEALTH_CHK["Service Health Monitor<br/>Pings DBs & Redis"]
    
    CVT_READER ──► REDIS["Redis DB-0"]
    HIST_QUERY ──► TIMESCALE["TimescaleDB"]
    ALM_ACK ──► AUDIT["Audit DB"]
```

---

## 9. Alarm Manager Service (`internal/alarm`)

### 9.1 Purpose & Role
The **Alarm Manager** prevents telemetry alarm fatigue by de-duplicating repeat alarm alerts, enforcing operator alarm inhibit policies, and broadcasting alerts over Redis Pub/Sub.

### 9.2 Micro-Architecture Diagram

```mermaid
flowchart TD
    ALM_IN["Kafka: alarm.events"] ──► DEDUP["30-Second Sliding Window De-duplicator<br/>Key: scid:param:level"]
    
    DEDUP ──►|Within 30s| SUPPRESS["Suppress Duplicate Alert"]
    DEDUP ──►|After 30s / New| INHIBIT_CHK["Redis DB-2 Inhibit Check<br/>alarm:inhibit:scid:param"]
    
    INHIBIT_CHK ──►|Inhibited == '1'| SUPPRESS
    INHIBIT_CHK ──►|Active| REC_STORE["In-Memory Active Alarm Store<br/>Status: ACTIVE"]
    
    REC_STORE ──► REDIS_PUB["Redis Pub/Sub Channel<br/>ws:alarms:{scid}"]
    
    REC_STORE ──► CRIT_CHECK{"Level == HIGH_HIGH?"}
    CRIT_CHECK ──►|Yes| PAGER["PagerDuty / Webhook Critical Escalation"]
    CRIT_CHECK ──►|No| DONE["Nominal Distribution"]
```

---

## 10. Gap Replay Service (`internal/gapreplay`)

### 10.1 Purpose & Role
The **Gap Replay Service** guarantees telemetry sequence completeness. It identifies missing sequence numbers and re-injects archived frames without risking infinite replay loops.

### 10.2 Micro-Architecture Diagram

```mermaid
flowchart LR
    GAP_IN["Kafka: telemetry.gaps"] ──► SEQ_EXP["Sequence Expander<br/>for fc = ExpectedFC to ReceivedFC-1"]
    
    SEQ_EXP ──► BLOOM["Redis DB-1 Seen Filter<br/>Key: gap:seen:scid:fc (TTL 24h)"]
    
    BLOOM ──►|Already Replayed| SKIP["Skip Frame"]
    BLOOM ──►|New Gap| ARCHIVE["S3 / Storage Frame Reconstructor<br/>Rebuilds Frame with VCFC = fc"]
    
    ARCHIVE ──► MARK_SEEN["Set Redis DB-1 seen = '1'"]
    MARK_SEEN ──► RE_INJECT["Kafka Producer: telemetry.raw.frames<br/>Header: replay = 'true'"]
```

---

## 11. Dead Letter Monitor (`internal/dlm`)

### 11.1 Purpose & Role
The **Dead Letter Monitor** inspects, categorizes, and alerts on failed frames, cryptographic signature rejections, and CRC errors.

### 11.2 Micro-Architecture Diagram

```mermaid
flowchart TD
    DLQ_IN["Kafka: dead.letter"] ──► PARSER["Dead Letter JSON Parser<br/>Service, ErrorType, SCID, Reason"]
    
    PARSER ──► WIN_SLIDE["Sliding 1-Minute Window Buffer<br/>Prunes timestamps older than 60s"]
    
    WIN_SLIDE ──► RATE_CALC["Calculate Message Rate<br/>count = len(rateWindow)"]
    
    RATE_CALC ──► THRESHOLD{"count > 10 msgs/min?"}
    THRESHOLD ──►|Yes| ALERT["[DLM ALERT] Trigger Pager & System Health Event<br/>Excessive Drop Rate"]
    THRESHOLD ──►|No| LOG["Log Nominal Anomaly"]
```

---

## 12. Spacecraft Telemetry Simulator (`internal/simulator`)

### 12.1 Purpose & Role
The **Simulator** provides a deterministic hardware-in-the-loop (HIL) substitute, generating physically accurate orbital telemetry bitstreams conforming to CCSDS standards and streaming them to port `:5050`.

### 12.2 Micro-Architecture Diagram

```mermaid
flowchart TD
    TICKER["Precision 4.0 Hz Simulation Ticker"] ──► MATH["Orbital Physics Model<br/>• Voltage: 28.0 + 0.3*sin(0.1*t) + noise<br/>• Temp: 25.0 + 8.0*sin(0.05*t)<br/>• Subsystem Flags: Arrays & TX Active"]
    
    MATH ──► SP_BUILD["CCSDS 133.0 Space Packet Builder<br/>APID = 100, SeqCount = N"]
    
    SP_BUILD ──► CLCW_BUILD["CCSDS 232.1 CLCW Builder<br/>VCID = 1, ReportValue = 0"]
    
    CLCW_BUILD ──► TM_FRAME["CCSDS 132.0 TM Transfer Frame Builder<br/>SCID = 42, VCID = 1, OCF = CLCW"]
    
    TM_FRAME ──► CRC_GEN["CRC-16/CCITT Generator (2 Bytes)"]
    CRC_GEN ──► ASM_PREPEND["Prepend Attached Sync Marker (ASM)<br/>0x1ACFFC1D (4 Bytes)"]
    
    ASM_PREPEND ──► TCP_CLIENT["TCP Client Socket<br/>Connects to 127.0.0.1:5050 (Frame Ingest)"]
```

---

*Document compiled and verified by Antigravity AI Engineering for Akashaveda Space Technologies.*
