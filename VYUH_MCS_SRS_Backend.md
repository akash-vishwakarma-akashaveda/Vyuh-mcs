# VYUH-MCS — Software Requirements Specification (Backend)

**Document type:** Software Requirements Specification  
**Project:** Vanguard Unified Horizon — Mission Control Software  
**Organisation:** Akashaveda Space Technologies  
**Version:** 1.0  
**Date:** September 2026  
**Status:** Approved for Development

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [System Context](#2-system-context)
3. [Complete Tech Stack](#3-complete-tech-stack)
4. [Microservice Catalogue](#4-microservice-catalogue)
5. [Functional Requirements — Per Service](#5-functional-requirements)
6. [Non-Functional Requirements](#6-non-functional-requirements)
7. [API Specifications](#7-api-specifications)
8. [Data Models & Schemas](#8-data-models--schemas)
9. [Kafka Message Schemas](#9-kafka-message-schemas)
10. [Database Schemas](#10-database-schemas)
11. [Infrastructure Setup](#11-infrastructure-setup)
12. [Local Development Setup](#12-local-development-setup)
13. [Testing Requirements](#13-testing-requirements)
14. [CI/CD Pipeline](#14-cicd-pipeline)
15. [Security Requirements](#15-security-requirements)
16. [Observability Requirements](#16-observability-requirements)
17. [Acceptance Criteria](#17-acceptance-criteria)

---

## 1. Introduction

### 1.1 Purpose

This document specifies all backend requirements for VYUH-MCS — a cloud-native Mission Control Software system for real-time satellite constellation management. It serves as the authoritative reference for:

- Backend development teams implementing microservices
- DevOps engineers setting up infrastructure
- QA engineers writing integration and performance tests
- Architects reviewing design decisions

### 1.2 Scope

This SRS covers all server-side components:
- 10 Go microservices
- Apache Kafka message bus
- Redis Cluster, TimescaleDB, PostgreSQL, etcd, Vault, S3
- Kubernetes deployment configuration
- CI/CD pipeline
- Observability stack

It does not cover the Operator Console frontend (React 18) or antenna hardware integration specifications.

### 1.3 Definitions

| Term | Definition |
|------|-----------|
| SCID | Spacecraft Identifier — 10-bit integer uniquely identifying a satellite |
| VCID | Virtual Channel Identifier — 6-bit integer for multiplexing within one satellite downlink |
| VCFC | Virtual Channel Frame Counter — 8-bit modulo counter for gap detection |
| APID | Application Process Identifier — 11-bit integer identifying a telemetry packet type |
| CVT | Current Value Table — Redis store of the latest value of every telemetry parameter |
| CCSDS | Consultative Committee for Space Data Systems — international space data standard |
| COP-1 | Communications Operation Procedure-1 — CCSDS reliable uplink protocol |
| FOP-1 | Frame Operations Procedure-1 — ground implementation of COP-1 |
| CLCW | Command Link Control Word — satellite acknowledgement field in downlink frames |
| XTCE | XML Telemetry & Command Exchange — parameter dictionary standard |
| OBT | On-Board Time — satellite clock counter |
| TC | Telecommand — uplink direction |
| TM | Telemetry — downlink direction |
| EU | Engineering Units — calibrated physical value (e.g. degrees Celsius) |
| DN | Data Number — raw binary encoded value before calibration |
| HPA | Horizontal Pod Autoscaler |
| SLO | Service Level Objective |

### 1.4 References

- CCSDS 132.0-B-3: TM Space Data Link Protocol
- CCSDS 232.0-B-4: TC Space Data Link Protocol
- CCSDS 232.1-B-2: Communications Operation Procedure-1
- CCSDS 133.0-B-2: Space Packet Protocol
- CCSDS 660.0-B-2: XML Telemetry and Command Exchange (XTCE)
- VYUH-MCS Complete Architecture Reference v2.0
- VYUH-MCS HLD Document v1.0

---

## 2. System Context

### 2.1 System Boundaries

```
External systems that VYUH-MCS backend interfaces with:

INPUTS:
  Ground Station Antenna  →  raw CCSDS TM transfer frames (TCP/UDP)
  Operator Console        →  REST commands, WebSocket subscriptions
  Keycloak                →  JWT tokens for authentication

OUTPUTS:
  Ground Station Antenna  ←  CCSDS TC transfer frames (HTTP/gRPC)
  Operator Console        ←  real-time WebSocket telemetry + REST responses
  S3 / Azure Blob         ←  Parquet archives
  PagerDuty               ←  alert webhooks

INTERNAL:
  Kafka (9 brokers)       ↔  all inter-service messaging
  Redis Cluster           ↔  hot state (CVT, gaps, cache, COP-1 buffer)
  TimescaleDB             ↔  30-day hot telemetry archive
  PostgreSQL              ↔  config, commands, audit
  etcd                    ↔  uplink locks + sequence counters
  Vault                   ↔  encryption keys + secrets
```

### 2.2 Constellation Parameters

| Parameter | Value |
|-----------|-------|
| Satellites | 500 (extendable to 2,000) |
| Max parameters per satellite | 2,000 |
| SCID range | 1–1023 (10-bit) |
| VCID range | 0–63 (6-bit) |
| APID range | 0–2047 (11-bit) |
| Frame size | 1,115 bytes (fixed) |
| TC frame max size | 1,024 bytes |
| TC Space Packet max size | 1,019 bytes |

---

## 3. Complete Tech Stack

### 3.1 Languages & Runtimes

| Component | Language | Version | Justification |
|-----------|----------|---------|---------------|
| All microservices | Go | 1.22+ | Goroutine concurrency, compiled binary, fast startup for StatefulSets |
| Build scripts | Makefile + shell | — | Standard Go toolchain |
| Infrastructure as Code | Terraform | 1.8+ | Cloud-agnostic provisioning |
| K8s manifests | Helm 3 + Kustomize | — | Templating + environment overlays |
| DB migrations | SQL (Flyway) | 10+ | Version-controlled schema migrations |

### 3.2 Go Module Structure

```
github.com/akashaveda/vyuh-mcs/
  cmd/
    frame-ingest/        # main package for Frame Ingest service
    tfpe/                # main package for TFPE
    tppp/                # main package for TPPP
    tdae/                # main package for TDAE
    upe/                 # main package for UPE
    utfe/                # main package for UTFE
    command-gateway/     # main package for Command Gateway
    bff/                 # main package for BFF
    gap-replay/          # main package for Gap Replay Service
    dead-letter-monitor/ # main package for Dead Letter Monitor
    alarm-manager/       # main package for Alarm Manager
  internal/
    ccsds/               # CCSDS frame/packet parsing library
    kafka/               # Kafka producer/consumer wrappers
    redis/               # Redis client wrappers
    telemetry/           # shared telemetry types
    command/             # shared command types
    auth/                # JWT validation middleware
    metrics/             # Prometheus metrics helpers
    health/              # health check handlers
  pkg/
    xtce/                # XTCE dictionary parser
    calibration/         # calibration algorithms
    cop1/                # COP-1 FOP-1 state machine
    bitreader/           # bit-level binary reader
    parquet/             # Parquet file writer
  proto/                 # protobuf definitions (CLCW gRPC)
  migrations/
    vyuh_config/         # Flyway SQL migrations for config DB
    vyuh_commands/       # Flyway SQL migrations for commands DB
    vyuh_audit/          # Flyway SQL migrations for audit DB
  deployments/
    helm/                # Helm charts per service
    kustomize/           # environment overlays
  scripts/
    local/               # local dev scripts
    ci/                  # CI/CD scripts
```

### 3.3 Key Go Dependencies

```go
// go.mod — primary dependencies

// Kafka
github.com/confluentinc/confluent-kafka-go/v2 v2.5.0

// Schema Registry
github.com/riferrei/srclient v0.6.0

// Redis
github.com/redis/go-redis/v9 v9.5.0

// PostgreSQL / TimescaleDB
github.com/jackc/pgx/v5 v5.6.0
github.com/jackc/pgxpool v5.6.0

// etcd
go.etcd.io/etcd/client/v3 v3.5.13

// Vault
github.com/hashicorp/vault/api v1.14.0

// gRPC (CLCW path)
google.golang.org/grpc v1.64.0
google.golang.org/protobuf v1.34.0

// HTTP router
github.com/go-chi/chi/v5 v5.0.12

// WebSocket
github.com/gorilla/websocket v1.5.3

// JWT validation
github.com/golang-jwt/jwt/v5 v5.2.1

// Prometheus
github.com/prometheus/client_golang v1.19.0

// OpenTelemetry
go.opentelemetry.io/otel v1.27.0
go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc v1.27.0

// Structured logging
go.uber.org/zap v1.27.0

// Config
github.com/spf13/viper v1.18.0

// S3 / Parquet
github.com/aws/aws-sdk-go-v2 v1.30.0
github.com/parquet-go/parquet-go v0.23.0

// Testing
github.com/testcontainers/testcontainers-go v0.31.0
github.com/stretchr/testify v1.9.0
```

### 3.4 Infrastructure Services

| Service | Product | Version | Deployment |
|---------|---------|---------|-----------|
| Message bus | Apache Kafka | 3.7+ | K8s StatefulSet (9 brokers) |
| Schema registry | Confluent Schema Registry | 7.6+ | K8s Deployment (2 replicas) |
| Hot state cache | Redis | 7.2+ | K8s StatefulSet (6 pods cluster) |
| Time-series DB | TimescaleDB | 2.15+ | K8s StatefulSet (primary + replica) |
| Config / command DB | PostgreSQL | 16+ | K8s StatefulSet + Patroni |
| Distributed lock | etcd | 3.5+ | K8s StatefulSet (3 pods) |
| Secrets manager | HashiCorp Vault | 1.17+ | K8s StatefulSet (3 pods HA) |
| API gateway | Kong | 3.7+ | K8s Deployment (2 replicas) |
| Identity provider | Keycloak | 24+ | K8s Deployment (3 replicas) |
| Cold archive | AWS S3 / Azure Blob | — | Managed cloud service |
| Container registry | — | — | AWS ECR / Azure ACR |
| Kubernetes | — | 1.29+ | EKS / AKS / on-prem |
| Service mesh | Istio | 1.22+ | K8s addon |

### 3.5 Observability Stack

| Tool | Purpose | Version |
|------|---------|---------|
| Prometheus | Metrics scraping & alerting | 2.52+ |
| Grafana | Dashboards | 11+ |
| Loki | Log aggregation | 3.1+ |
| Promtail | Log shipping agent | 3.1+ |
| OpenTelemetry Collector | Trace collection | 0.102+ |
| Jaeger | Distributed tracing | 1.58+ |
| Thanos | Long-term metrics storage | 0.35+ |

---

## 4. Microservice Catalogue

| # | Service | Language | Deployment | Replicas | Kafka Consume | Kafka Produce |
|---|---------|----------|-----------|---------|--------------|--------------|
| 1 | Frame Ingest | Go | Deployment (2: primary+standby) | 2 | — | telemetry.raw.frames |
| 2 | TFPE | Go | Deployment (HPA 4–32) | 4–32 | telemetry.raw.frames | telemetry.space.packets, clcw.events, telemetry.gaps |
| 3 | TPPP | Go | Deployment (HPA 4–32) | 4–32 | telemetry.space.packets | telemetry.processed, alarm.events |
| 4 | TDAE | Go | Deployment (HPA 4–16) | 4–16 | telemetry.processed | — |
| 5 | UPE | Go | StatefulSet (1/sat) | 500 | raw.commands, cmd.ack.events | tc.packets |
| 6 | UTFE | Go | StatefulSet (1/sat) | 500 | tc.packets, clcw.events | cmd.ack.events |
| 7 | Command Gateway | Go | Deployment (2) | 2 | — | raw.commands |
| 8 | BFF | Go | Deployment (3) | 3 | — | — |
| 9 | Gap Replay | Go | Deployment (2) | 2 | telemetry.gaps | telemetry.raw.frames |
| 10 | Alarm Manager | Go | Deployment (2) | 2 | alarm.events | — |
| 11 | Dead Letter Monitor | Go | Deployment (1) | 1 | dead.letter | — |

### 4.1 Service Responsibilities Summary

```
Frame Ingest    — Antenna TCP/UDP → Kafka (protocol adapter)
TFPE            — Raw frames → Space packets (CCSDS frame processing)
TPPP            — Space packets → Parameters (decommutation + calibration)
TDAE            — Parameters → CVT + TimescaleDB + S3 + WebSocket
UPE             — Commands → Encrypted TC packets (safety + crypto)
UTFE            — TC packets → Antenna (COP-1 FOP-1 + framing)
Command Gateway — REST API → raw.commands (command ingress)
BFF             — REST API → TimescaleDB/PostgreSQL (historical queries)
Gap Replay      — Gap events → Re-injected frames (gap fill)
Alarm Manager   — Alarm events → Operator notifications + PagerDuty
Dead Letter Mon — Dead letter topic → Metrics + alerts
```

---

## 5. Functional Requirements

### FR-FINGEST: Frame Ingest Service

| ID | Requirement |
|----|------------|
| FR-FINGEST-001 | SHALL maintain persistent TCP connections to all configured ground station antennas |
| FR-FINGEST-002 | SHALL support UDP reception for high-rate downlink streams |
| FR-FINGEST-003 | SHALL append receive_timestamp (nanosecond precision, UTC) and antenna_id to every frame before publishing |
| FR-FINGEST-004 | SHALL produce every received frame to `telemetry.raw.frames` with key = SCID bytes |
| FR-FINGEST-005 | SHALL support active-standby HA: standby pod monitors primary via `system.health` topic; promotes if primary misses 3 heartbeats (9 seconds) |
| FR-FINGEST-006 | SHALL publish heartbeat to `system.health` every 3 seconds |
| FR-FINGEST-007 | SHALL track per-antenna frames_received_total, bytes_received_total, connection_state metrics |
| FR-FINGEST-008 | SHALL reconnect to antenna on connection drop with exponential backoff (1s, 2s, 4s, 8s, max 30s) |
| FR-FINGEST-009 | SHALL support concurrent connections to up to 32 antennas simultaneously |
| FR-FINGEST-010 | SHALL store raw frames to S3 raw-frame store (s3://vyuh-mcs-raw-frames/scid={scid}/pass={pass_id}/) for 7-day gap replay window |

### FR-TFPE: Telemetry Frame Processing Engine

| ID | Requirement |
|----|------------|
| FR-TFPE-001 | SHALL consume from `telemetry.raw.frames` using consumer group `tfpe-cg` |
| FR-TFPE-002 | SHALL locate CCSDS ASM (0x1ACFFC1D) using sliding-window search; establish frame lock at fixed 1115-byte intervals |
| FR-TFPE-003 | SHALL validate CRC-16/CCITT over frame header + data zone; drop frame on mismatch |
| FR-TFPE-004 | SHALL validate SCID against whitelist in Redis DB-1 `scid:whitelist`; route unknown SCIDs to dead.letter |
| FR-TFPE-005 | SHALL detect VCFC sequence gaps; publish gap events to `telemetry.gaps` |
| FR-TFPE-006 | SHALL reassemble space packets across frame boundaries using FHP (First Header Pointer) |
| FR-TFPE-007 | SHALL store partial reassembly state in Redis DB-3 with TTL=30s |
| FR-TFPE-008 | SHALL extract CLCW from frame OCF zone when present |
| FR-TFPE-009 | SHALL publish CLCW via gRPC to UTFE pod for the relevant SCID (best-effort, <5ms target) |
| FR-TFPE-010 | SHALL publish CLCW to `clcw.events` Kafka topic (durable record) |
| FR-TFPE-011 | SHALL produce completed space packets to `telemetry.space.packets` |
| FR-TFPE-012 | SHALL run 16 goroutines (one per assigned Kafka partition) |
| FR-TFPE-013 | SHALL implement Bloom filter in Redis DB-1 for replayed frame deduplication (TTL=24h) |

### FR-TPPP: Telemetry Packet Pre-Processor

| ID | Requirement |
|----|------------|
| FR-TPPP-001 | SHALL consume from `telemetry.space.packets` using consumer group `tppp-cg` |
| FR-TPPP-002 | SHALL route each packet to the correct XTCE parameter set by APID |
| FR-TPPP-003 | SHALL cache XTCE parameter sets in Redis DB-2 with TTL=5min backed by PostgreSQL |
| FR-TPPP-004 | SHALL extract parameter values using BitReader at XTCE-defined bit offsets |
| FR-TPPP-005 | SHALL support polynomial, cubic spline, and LUT calibration conversions |
| FR-TPPP-006 | SHALL convert OBT to UTC using polynomial correlation coefficients from PostgreSQL |
| FR-TPPP-007 | SHALL evaluate 4-level alarm limits: LOW_LOW, LOW, HIGH, HIGH_HIGH |
| FR-TPPP-008 | SHALL implement alarm hysteresis: 3 consecutive samples required to confirm state change; 1% band for return-to-normal |
| FR-TPPP-009 | SHALL publish triggered/cleared alarm events to `alarm.events` |
| FR-TPPP-010 | SHALL produce fully decoded parameter records to `telemetry.processed` |
| FR-TPPP-011 | SHALL run 32 goroutines |
| FR-TPPP-012 | SHALL route undecodable packets to `dead.letter` with error_type=DECOM_FAILURE |
| FR-TPPP-013 | SHALL support alarm inhibit flags from Redis DB-2 `alarm:inhibit:{scid}:{param}` |

### FR-TDAE: Telemetry Data Archive Engine

| ID | Requirement |
|----|------------|
| FR-TDAE-001 | SHALL consume from `telemetry.processed` using consumer group `tdae-cg` |
| FR-TDAE-002 | SHALL write every parameter to Redis DB-0 CVT: `cvt:{scid}:{param}` → JSON{value, ts, quality, eu_unit} |
| FR-TDAE-003 | SHALL flush Redis pipeline every 200 commands (target P99 ≤5ms flush latency) |
| FR-TDAE-004 | SHALL publish parameter updates to Redis Pub/Sub channel `ws:updates:{scid}` |
| FR-TDAE-005 | SHALL maintain WebSocket connections for Operator Console clients (max 500 concurrent) |
| FR-TDAE-006 | SHALL deliver parameter updates to subscribed clients at ≤10 updates/sec per parameter |
| FR-TDAE-007 | SHALL reconnect WebSocket clients transparently on pod restart within 500ms |
| FR-TDAE-008 | SHALL accumulate 100ms batches and write to TimescaleDB using COPY protocol |
| FR-TDAE-009 | TimescaleDB INSERT SHALL use ON CONFLICT DO NOTHING for idempotent replay support |
| FR-TDAE-010 | SHALL write Parquet files to S3 with target size 128MB; partition by year/month/day/scid |
| FR-TDAE-011 | SHALL commit Kafka offset ONLY after both TimescaleDB and S3 writes succeed |
| FR-TDAE-012 | SHALL update `cvt:updated:{scid}` ZSET with parameter name and update timestamp |
| FR-TDAE-013 | SHALL NOT overwrite CVT with replayed data if replayed timestamp is older than current CVT timestamp |

### FR-UPE: Uplink Processing Engine

| ID | Requirement |
|----|------------|
| FR-UPE-001 | SHALL consume from `raw.commands` using consumer group `upe-cg-{scid}` (per-satellite group) |
| FR-UPE-002 | SHALL execute safety chain L1→L4 in sequence; abort on first failure |
| FR-UPE-003 | L1: SHALL validate all command parameters against min/max limits in command_definitions |
| FR-UPE-004 | L2: SHALL evaluate constraint expressions against current CVT values from Redis DB-0 |
| FR-UPE-005 | L3: SHALL check inhibit flags in Redis DB-2 `uplink:inhibited:{scid}` |
| FR-UPE-006 | L4: SHALL check interlock chain in Redis DB-2 `uplink:executing:{scid}` |
| FR-UPE-007 | SHALL fetch AES-256-GCM key from Vault `secret/satellite/{scid}/uplink-key`; cache for 5 minutes |
| FR-UPE-008 | SHALL generate 12-byte random IV per command |
| FR-UPE-009 | SHALL encrypt command payload with AES-256-GCM; AAD = commandID bytes |
| FR-UPE-010 | SHALL acquire etcd lease `uplink/lock/{scid}` (TTL=10s, keepalive every 3s) |
| FR-UPE-011 | SHALL increment `uplink/seqcnt/{scid}` using CAS transaction; retry on conflict |
| FR-UPE-012 | SHALL build CCSDS TC Space Packet per CCSDS 232.0-B-4 |
| FR-UPE-013 | SHALL publish encrypted TC packet to `tc.packets` |
| FR-UPE-014 | SHALL write command_log record for every command (PENDING → QUEUED → ACKNOWLEDGED/FAILED) |
| FR-UPE-015 | SHALL consume `cmd.ack.events` and update command_log status |
| FR-UPE-016 | SHALL implement degraded mode: hold up to 50 commands in memory queue for 30s during PostgreSQL unavailability |
| FR-UPE-017 | SHALL support MISSION_DIRECTOR role bypass of degraded mode restrictions |

### FR-UTFE: Uplink Transfer Frame Engine

| ID | Requirement |
|----|------------|
| FR-UTFE-001 | SHALL consume from `tc.packets` using consumer group `utfe-cg-{scid}` |
| FR-UTFE-002 | SHALL build CCSDS TC Transfer Frame per CCSDS 232.0-B-4 |
| FR-UTFE-003 | SHALL append CRC-16/CCITT trailer to every frame |
| FR-UTFE-004 | SHALL store each frame in Redis DB-5 `cop1:{scid}:{V(S)}` with TTL=60s |
| FR-UTFE-005 | SHALL implement COP-1 FOP-1 state machine with states S1, S2, S3, S4 |
| FR-UTFE-006 | SHALL use adaptive T1 timer: initial=3s, adjusted to 2×measured_rtt + 500ms |
| FR-UTFE-007 | SHALL retransmit unacknowledged frames up to 3 times before entering S3 Wait |
| FR-UTFE-008 | SHALL receive CLCW via gRPC from TFPE (primary) and `clcw.events` Kafka (fallback) |
| FR-UTFE-009 | SHALL call acknowledgeUpTo(V(R)): remove acknowledged frames from Redis DB-5 |
| FR-UTFE-010 | SHALL transmit frames to antenna driver via HTTP POST with circuit breaker (closed/open/half-open) |
| FR-UTFE-011 | SHALL publish command acknowledgement to `cmd.ack.events` |
| FR-UTFE-012 | SHALL support bypass mode (Type-BC frame) for MISSION_DIRECTOR role |
| FR-UTFE-013 | SHALL publish LINK_FAILURE event to `system.health` after 3 retransmit failures |

### FR-CMDGW: Command Gateway

| ID | Requirement |
|----|------------|
| FR-CMDGW-001 | SHALL expose REST API at `POST /api/v1/commands` |
| FR-CMDGW-002 | SHALL validate JWT token (delegated to Kong); extract operator_id and role from claims |
| FR-CMDGW-003 | SHALL require role ≥ OPERATOR for normal commands; MISSION_DIRECTOR for bypass-mode commands |
| FR-CMDGW-004 | SHALL validate command JSON schema: scid, apid, params, priority (CRITICAL/HIGH/NORMAL/LOW) |
| FR-CMDGW-005 | SHALL look up command_definition from PostgreSQL and validate parameter types |
| FR-CMDGW-006 | SHALL generate commandID as UUID v7 (time-ordered) |
| FR-CMDGW-007 | SHALL INSERT command_log record with status=PENDING before publishing to Kafka |
| FR-CMDGW-008 | SHALL produce to `raw.commands` with key=SCID |
| FR-CMDGW-009 | SHALL return HTTP 202 Accepted `{"commandId": "...", "status": "PENDING"}` |
| FR-CMDGW-010 | SHALL expose `GET /api/v1/commands/{commandId}` for status polling |

### FR-BFF: Backend for Frontend

| ID | Requirement |
|----|------------|
| FR-BFF-001 | SHALL expose `GET /api/v1/telemetry/{scid}/{param}/history` with start/end query params |
| FR-BFF-002 | SHALL route queries to TimescaleDB telemetry_raw (≤24h), telemetry_1min (≤7d), telemetry_1hour (≤30d), or Athena (>30d) |
| FR-BFF-003 | SHALL expose `GET /api/v1/satellites` returning all satellite_config records |
| FR-BFF-004 | SHALL expose `GET /api/v1/commands/{commandId}` proxying to PostgreSQL command_log |
| FR-BFF-005 | SHALL expose `GET /api/v1/alarms/{scid}` returning active alarms from PostgreSQL |
| FR-BFF-006 | SHALL expose `GET /api/v1/telemetry/{scid}/current` returning all CVT values from Redis DB-0 |
| FR-BFF-007 | SHALL use TimescaleDB read replica for all SELECT queries to avoid OLAP load on primary |
| FR-BFF-008 | SHALL implement response caching (30s TTL) for satellite_config and command_definitions |

### FR-GAPREPLAY: Gap Replay Service

| ID | Requirement |
|----|------------|
| FR-GAPREPLAY-001 | SHALL consume from `telemetry.gaps` using consumer group `gap-replay-cg` |
| FR-GAPREPLAY-002 | SHALL look up missing frames from S3 raw-frame store within 7-day window |
| FR-GAPREPLAY-003 | SHALL check Bloom filter in Redis DB-1 to avoid duplicate replay |
| FR-GAPREPLAY-004 | SHALL re-inject recovered frames to `telemetry.raw.frames` with Kafka header `replay=true` |
| FR-GAPREPLAY-005 | SHALL set Bloom filter bit in Redis DB-1 after re-injection (TTL=24h) |
| FR-GAPREPLAY-006 | SHALL publish gap resolution result to `audit.events` |
| FR-GAPREPLAY-007 | SHALL report gap_replay_recovered_total and gap_replay_failed_total metrics |

### FR-ALARM: Alarm Manager

| ID | Requirement |
|----|------------|
| FR-ALARM-001 | SHALL consume from `alarm.events` using consumer group `alarm-mgr-cg` |
| FR-ALARM-002 | SHALL de-duplicate alarms: same param + level within 30s → suppress repeat |
| FR-ALARM-003 | SHALL check Redis DB-2 alarm inhibit flags before processing |
| FR-ALARM-004 | SHALL INSERT alarm record to PostgreSQL alarm_log |
| FR-ALARM-005 | SHALL publish to Redis Pub/Sub `ws:alarms:{scid}` for real-time UI delivery |
| FR-ALARM-006 | SHALL send PagerDuty webhook for alarm_level = HIGH_HIGH or SAFETY_CRITICAL |
| FR-ALARM-007 | SHALL expose `POST /api/v1/alarms/{alarmId}/acknowledge` endpoint |

### FR-DLM: Dead Letter Monitor

| ID | Requirement |
|----|------------|
| FR-DLM-001 | SHALL consume from `dead.letter` using consumer group `dlm-cg` |
| FR-DLM-002 | SHALL increment `kafka_dead_letter_total{service,error_type,scid}` Prometheus counter per message |
| FR-DLM-003 | SHALL log full message to Loki with structured JSON fields |
| FR-DLM-004 | SHALL trigger PagerDuty alert if dead letter rate exceeds 10 messages/min for any (service, error_type) |
| FR-DLM-005 | SHALL store dead letter summary to PostgreSQL dead_letter_log table |

---

## 6. Non-Functional Requirements

### 6.1 Performance SLOs

| Service / Operation | P50 | P95 | P99 | Throughput |
|--------------------|-----|-----|-----|-----------|
| Frame Ingest → Kafka produce | 1ms | 3ms | 5ms | 50,000 frames/sec |
| TFPE frame → space packet | 3ms | 8ms | 15ms | 50,000 frames/sec |
| TPPP packet → decoded param | 10ms | 25ms | 40ms | 1,000,000 params/sec |
| TDAE Redis CVT write | 0.5ms | 2ms | 5ms | 1,000,000 writes/sec |
| TDAE WebSocket delivery | 2ms | 5ms | 10ms | 500 clients × 10 params/sec |
| TDAE TimescaleDB batch write | 20ms | 60ms | 100ms | 1,000,000 rows/sec |
| UPE command processing | 20ms | 60ms | 100ms | 833 commands/sec |
| UTFE frame transmit | 5ms | 15ms | 35ms | 833 frames/sec |
| Command Gateway REST | 10ms | 30ms | 50ms | 1,000 req/sec |
| BFF history query (≤24h) | 50ms | 150ms | 300ms | 100 req/sec |
| BFF history query (≤30d) | 200ms | 500ms | 1,000ms | 20 req/sec |

### 6.2 Availability SLOs

| Component | Availability target | Max downtime/month |
|-----------|--------------------|--------------------|
| Downlink pipeline | 99.95% | 21 minutes |
| Uplink pipeline | 99.99% | 4.4 minutes |
| CVT / WebSocket | 99.9% | 43 minutes |
| Historical query API | 99.5% | 3.6 hours |
| Command Gateway | 99.99% | 4.4 minutes |

### 6.3 Reliability Requirements

| ID | Requirement |
|----|------------|
| NFR-REL-001 | System SHALL NOT lose telemetry frames after acknowledgement to Kafka (at-least-once delivery) |
| NFR-REL-002 | Command log SHALL be ACID-compliant; no command SHALL be lost once accepted by Command Gateway |
| NFR-REL-003 | System SHALL tolerate failure of any single K8s node without data loss |
| NFR-REL-004 | Redis cluster SHALL tolerate loss of 1 master without operator intervention |
| NFR-REL-005 | Kafka cluster SHALL tolerate loss of 2 brokers (RF=3, min.insync=2) |
| NFR-REL-006 | PostgreSQL SHALL failover automatically via Patroni within 30 seconds |
| NFR-REL-007 | No single microservice failure SHALL cascade to other microservices (bulkhead pattern) |

### 6.4 Scalability Requirements

| ID | Requirement |
|----|------------|
| NFR-SCALE-001 | Downlink services (TFPE, TPPP, TDAE) SHALL scale horizontally to 32 pods with zero configuration change |
| NFR-SCALE-002 | System SHALL support constellation growth from 500 to 2,000 satellites by adding StatefulSet ordinals only |
| NFR-SCALE-003 | Adding a new satellite SHALL be achievable through the Satellite CRD without code changes |
| NFR-SCALE-004 | Kafka partition count SHALL NOT need to increase for constellation growth to 2,000 satellites |
| NFR-SCALE-005 | TimescaleDB SHALL handle 2× write throughput with horizontal scaling of TDAE pods |

### 6.5 Security Requirements (summary — detailed in Section 15)

| ID | Requirement |
|----|------------|
| NFR-SEC-001 | All inter-service traffic SHALL use Istio mTLS |
| NFR-SEC-002 | All external traffic SHALL use TLS 1.3 minimum |
| NFR-SEC-003 | All uplink commands SHALL be encrypted with AES-256-GCM |
| NFR-SEC-004 | No plaintext secrets SHALL appear in K8s manifests, environment variables, or logs |
| NFR-SEC-005 | All operator actions SHALL be written to immutable audit log |

### 6.6 Operational Requirements

| ID | Requirement |
|----|------------|
| NFR-OPS-001 | All services SHALL expose /health/live and /health/ready HTTP endpoints |
| NFR-OPS-002 | All services SHALL expose /metrics in Prometheus exposition format |
| NFR-OPS-003 | All services SHALL emit structured JSON logs with fields: service, level, ts, scid, trace_id, span_id |
| NFR-OPS-004 | All services SHALL propagate OpenTelemetry trace context via Kafka message headers |
| NFR-OPS-005 | Deployment of any service SHALL require zero downtime (rolling update strategy) |
| NFR-OPS-006 | Database migrations SHALL be idempotent and run via Flyway init containers |

---

## 7. API Specifications

### 7.1 Command Gateway API

```
Base URL: /api/v1
Authentication: Bearer JWT (validated by Kong)

POST /commands
  Description: Submit a telecommand for execution
  Role required: OPERATOR or higher
  Request body:
    {
      "scid": 42,
      "apid": 100,
      "priority": "NORMAL",         // CRITICAL | HIGH | NORMAL | LOW
      "params": {
        "target_voltage": 3.3,
        "enable_heater": true
      },
      "bypass_cop1": false           // only valid for MISSION_DIRECTOR
    }
  Response 202:
    {
      "commandId": "019032bc-1234-7abc-...",
      "scid": 42,
      "apid": 100,
      "status": "PENDING",
      "submittedAt": "2026-09-01T10:00:00.000Z",
      "operatorId": "user:john.doe"
    }
  Response 400: { "error": "INVALID_SCHEMA", "detail": "..." }
  Response 403: { "error": "INSUFFICIENT_ROLE" }
  Response 422: { "error": "COMMAND_NOT_FOUND", "detail": "APID 999 not in command_definitions for SCID 42" }
  Response 503: { "error": "SERVICE_DEGRADED", "detail": "PostgreSQL unavailable, command queue full" }

GET /commands/{commandId}
  Description: Get command execution status
  Response 200:
    {
      "commandId": "019032bc-...",
      "scid": 42, "apid": 100,
      "status": "ACKNOWLEDGED",      // PENDING | QUEUED | SENT | ACKNOWLEDGED | FAILED | REJECTED_*
      "submittedAt": "...",
      "queuedAt": "...",
      "sentAt": "...",
      "acknowledgedAt": "...",
      "rejectionReason": null,
      "retransmitCount": 0
    }

GET /commands?scid={scid}&status={status}&limit={n}&offset={n}
  Description: List commands for a satellite
  Response 200: { "commands": [...], "total": 150, "limit": 20, "offset": 0 }

POST /commands/{commandId}/cancel
  Description: Cancel a PENDING or QUEUED command
  Role required: SENIOR_OPERATOR or higher
  Response 200: { "commandId": "...", "status": "CANCELLED" }
  Response 409: { "error": "CANNOT_CANCEL", "detail": "Command already SENT" }
```

### 7.2 BFF API

```
Base URL: /api/v1
Authentication: Bearer JWT

GET /telemetry/{scid}/{param}/history
  Query params:
    start: ISO 8601 timestamp (required)
    end:   ISO 8601 timestamp (required)
    resolution: raw | 1min | 1hour | auto (default: auto)
  Response 200:
    {
      "scid": 42, "param": "OBC_TEMP",
      "unit": "degC",
      "resolution": "1min",
      "data": [
        { "t": "2026-09-01T10:00:00Z", "avg": 23.5, "min": 22.1, "max": 24.8, "count": 60 }
      ]
    }

GET /telemetry/{scid}/current
  Description: Get all current CVT values for a satellite
  Response 200:
    {
      "scid": 42, "as_of": "2026-09-01T10:05:00Z",
      "params": {
        "OBC_TEMP": { "value": 23.5, "unit": "degC", "ts": "...", "quality": 0, "alarm": "NORMAL" },
        "BUS_VOLTAGE": { "value": 28.1, "unit": "V", "ts": "...", "quality": 0, "alarm": "NORMAL" }
      }
    }

GET /satellites
  Response 200: { "satellites": [ { "scid": 42, "name": "VYUH-042", "enabled": true, ... } ] }

GET /satellites/{scid}
  Response 200: { satellite config + current pass status + active alarm count }

GET /alarms/{scid}
  Query params: status=ACTIVE|ACKNOWLEDGED|CLEARED, limit, offset
  Response 200: { "alarms": [ { "alarmId", "param", "level", "value", "threshold", "ts", "status" } ] }

POST /alarms/{alarmId}/acknowledge
  Role required: OPERATOR or higher
  Response 200: { "alarmId": "...", "status": "ACKNOWLEDGED", "acknowledgedBy": "user:jane.doe" }

GET /health
  Response 200: { "status": "ok", "dependencies": { "timescaledb": "ok", "redis": "ok", "postgresql": "ok" } }
```

### 7.3 WebSocket API (TDAE → Operator Console)

```
Endpoint: wss://mcs.domain.com/ws/telemetry
  (routed by Kong to TDAE with sticky session by operatorId)

After connection, client sends subscription message:
  {
    "type": "SUBSCRIBE",
    "subscriptions": [
      { "scid": 42, "params": ["OBC_TEMP", "BUS_VOLTAGE", "BATTERY_SOC"] },
      { "scid": 43, "params": ["*"] }  // "*" means all params for this satellite
    ]
  }

TDAE sends parameter updates (rate-limited to 10/sec per param):
  {
    "type": "PARAM_UPDATE",
    "scid": 42, "param": "OBC_TEMP",
    "value": 23.5, "unit": "degC",
    "ts": "2026-09-01T10:05:00.123Z",
    "quality": 0,                      // 0=good, 1=uncertain, 2=bad
    "alarm": "NORMAL"                  // NORMAL | LOW | LOW_LOW | HIGH | HIGH_HIGH
  }

TDAE sends alarm events (from Alarm Manager via Redis Pub/Sub):
  {
    "type": "ALARM_EVENT",
    "scid": 42, "param": "OBC_TEMP",
    "level": "HIGH", "value": 45.2, "threshold": 45.0,
    "ts": "2026-09-01T10:05:01.456Z",
    "alarmId": "alm-..."
  }

Client sends unsubscribe:
  { "type": "UNSUBSCRIBE", "scid": 42, "params": ["OBC_TEMP"] }

Heartbeat (both directions every 30s):
  { "type": "PING" } / { "type": "PONG" }
```

### 7.4 Internal gRPC API (TFPE → UTFE)

```protobuf
// proto/clcw/v1/clcw.proto

syntax = "proto3";
package clcw.v1;

service CLCWService {
  rpc SendCLCW (CLCWEvent) returns (CLCWAck);
}

message CLCWEvent {
  uint32 scid              = 1;
  uint32 v_r               = 2;   // Next expected V(S)
  bool   retransmit        = 3;
  bool   wait              = 4;
  bool   no_rf             = 5;
  bool   no_bitlock        = 6;
  int64  timestamp_ns      = 7;   // nanoseconds since epoch
  string pass_id           = 8;
}

message CLCWAck {
  bool received = 1;
}
```

---

## 8. Data Models & Schemas

### 8.1 Core Go Types

```go
// internal/ccsds/types.go

// TransferFrame represents a CCSDS TM Transfer Frame (CCSDS 132.0-B-3)
type TransferFrame struct {
    // Primary header (6 bytes)
    TransferFrameVersion    uint8  // 2 bits, must be 0b01
    SpacecraftID            uint16 // 10 bits
    VirtualChannelID        uint8  // 6 bits
    OperationalControlField bool   // 1 bit (OCF present flag)
    MasterChannelFC         uint8  // 8 bits (MCFC)
    VirtualChannelFC        uint8  // 8 bits (VCFC)
    // Data field status (2 bytes)
    SecHdrFlag             bool   // 1 bit
    SyncFlag               bool   // 1 bit
    PacketOrderFlag        bool   // 1 bit
    SegLenID               uint8  // 2 bits
    FirstHeaderPointer     uint16 // 11 bits (FHP, 0x7FF = no packet start)
    // Payload
    DataField              []byte // variable length
    // Optional fields
    OCF                    *uint32 // 4 bytes if OperationalControlField=true
    FECF                   *uint16 // 2 bytes CRC if enabled
    // Metadata (added by Frame Ingest)
    ReceiveTimestampNs     int64
    AntennaID              string
    PassID                 string
}

// SpacePacket represents a CCSDS Space Packet (CCSDS 133.0-B-2)
type SpacePacket struct {
    // Primary header (6 bytes)
    Version        uint8  // 3 bits, must be 0b000
    Type           uint8  // 1 bit (0=TM, 1=TC)
    SecHdrFlag     bool   // 1 bit
    APID           uint16 // 11 bits
    SeqFlags       uint8  // 2 bits
    SeqCount       uint16 // 14 bits
    DataLength     uint16 // 16 bits (data field length - 1)
    // Data
    Data           []byte
    // Derived
    SCID           uint16
    ReceivedAt     int64  // ns
}

// CLCW represents the Command Link Control Word (CCSDS 232.1-B-2)
type CLCW struct {
    ControlWordType  uint8  // 1 bit, must be 0
    CLCWVersion      uint8  // 2 bits, must be 0b00
    StatusField      uint8  // 3 bits
    CopInEffect      uint8  // 2 bits
    VirtualChannelID uint8  // 6 bits
    NoRF             bool
    NoBitLock        bool
    Lockout          bool
    Wait             bool
    Retransmit       bool
    FarmerBCounter   uint8  // 2 bits
    Reserved         uint8  // 1 bit
    ReportValue      uint8  // 8 bits (V(R))
}

// TCTransferFrame represents a CCSDS TC Transfer Frame (CCSDS 232.0-B-4)
type TCTransferFrame struct {
    // Primary header (5 bytes)
    TransferFrameVersion uint8  // 2 bits, 0b00
    BypassFlag           bool   // 1 bit (Type-BC if true)
    ControlCommandFlag   bool   // 1 bit
    Reserved             uint8  // 2 bits
    SpacecraftID         uint16 // 10 bits
    VirtualChannelID     uint8  // 6 bits
    FrameLength          uint16 // 10 bits
    SeqNumber            uint8  // 8 bits (V(S))
    // Data field
    Data                 []byte
    // Frame Error Control
    FECF                 uint16 // CRC-16
}
```

```go
// internal/telemetry/types.go

// DecodedParameter represents a fully processed telemetry parameter
type DecodedParameter struct {
    SCID        uint16
    APID        uint16
    ParamName   string
    RawValue    int64   // DN (data number)
    EUValue     float64 // calibrated engineering unit value
    EUUnit      string  // e.g. "degC", "V", "rpm"
    Quality     Quality // Good=0, Uncertain=1, Bad=2
    OBTRaw      uint64  // on-board time raw counter
    Timestamp   time.Time // UTC, after OBT correlation
    AlarmState  AlarmState
    PacketSeq   uint16  // source space packet sequence count
    IsReplay    bool
}

type AlarmState uint8
const (
    AlarmNormal   AlarmState = 0
    AlarmLow      AlarmState = 1
    AlarmLowLow   AlarmState = 2
    AlarmHigh     AlarmState = 3
    AlarmHighHigh AlarmState = 4
)

type Quality uint8
const (
    QualityGood      Quality = 0
    QualityUncertain Quality = 1
    QualityBad       Quality = 2
)
```

```go
// internal/command/types.go

// RawCommand is the inbound command from Operator Console
type RawCommand struct {
    CommandID  string          // UUID v7
    SCID       uint16
    APID       uint16
    Priority   Priority
    Params     map[string]any  // parameter values
    OperatorID string          // from JWT claim
    BypassCOP1 bool            // MISSION_DIRECTOR only
    SubmittedAt time.Time
}

// TCSpacePacket is the encrypted, sequenced TC packet ready for UTFE
type TCSpacePacket struct {
    CommandID  string
    SCID       uint16
    APID       uint16
    Priority   Priority
    SeqCount   uint16 // from etcd CAS
    IV         []byte // 12 bytes AES-GCM IV
    Ciphertext []byte // encrypted params
    GCMTag     []byte // 16 bytes auth tag
    BuiltAt    time.Time
}

type Priority uint8
const (
    PriorityCritical Priority = 0
    PriorityHigh     Priority = 1
    PriorityNormal   Priority = 2
    PriorityLow      Priority = 3
)
```

---

## 9. Kafka Message Schemas

All messages use JSON encoding registered in Schema Registry.

### 9.1 telemetry.raw.frames

```json
{
  "$schema": "http://json-schema.org/draft-07/schema",
  "title": "RawFrameMessage",
  "type": "object",
  "required": ["scid", "frame_bytes_b64", "receive_ts_ns", "antenna_id", "pass_id"],
  "properties": {
    "scid":            { "type": "integer", "minimum": 1, "maximum": 1023 },
    "frame_bytes_b64": { "type": "string", "description": "base64-encoded 1115-byte CCSDS frame" },
    "receive_ts_ns":   { "type": "integer", "description": "nanoseconds since Unix epoch, UTC" },
    "antenna_id":      { "type": "string" },
    "pass_id":         { "type": "string" },
    "replay":          { "type": "boolean", "default": false }
  }
}
```

### 9.2 telemetry.space.packets

```json
{
  "title": "SpacePacketMessage",
  "type": "object",
  "required": ["scid", "apid", "seq_count", "seq_flags", "packet_bytes_b64", "obt_raw", "receive_ts_ns"],
  "properties": {
    "scid":             { "type": "integer" },
    "apid":             { "type": "integer", "minimum": 0, "maximum": 2047 },
    "seq_count":        { "type": "integer", "minimum": 0, "maximum": 16383 },
    "seq_flags":        { "type": "integer", "minimum": 0, "maximum": 3 },
    "packet_bytes_b64": { "type": "string" },
    "obt_raw":          { "type": "integer" },
    "receive_ts_ns":    { "type": "integer" },
    "pass_id":          { "type": "string" },
    "replay":           { "type": "boolean", "default": false }
  }
}
```

### 9.3 telemetry.processed

```json
{
  "title": "ProcessedTelemetryMessage",
  "type": "object",
  "required": ["scid", "apid", "params", "packet_ts"],
  "properties": {
    "scid":       { "type": "integer" },
    "apid":       { "type": "integer" },
    "packet_ts":  { "type": "string", "format": "date-time" },
    "pass_id":    { "type": "string" },
    "replay":     { "type": "boolean", "default": false },
    "params": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "eu_value", "quality"],
        "properties": {
          "name":        { "type": "string" },
          "dn_value":    { "type": "integer" },
          "eu_value":    { "type": "number" },
          "eu_unit":     { "type": "string" },
          "quality":     { "type": "integer", "minimum": 0, "maximum": 2 },
          "alarm_state": { "type": "integer", "minimum": 0, "maximum": 4 }
        }
      }
    }
  }
}
```

### 9.4 raw.commands

```json
{
  "title": "RawCommandMessage",
  "type": "object",
  "required": ["command_id", "scid", "apid", "priority", "params", "operator_id", "submitted_at"],
  "properties": {
    "command_id":   { "type": "string", "format": "uuid" },
    "scid":         { "type": "integer" },
    "apid":         { "type": "integer" },
    "priority":     { "type": "string", "enum": ["CRITICAL","HIGH","NORMAL","LOW"] },
    "params":       { "type": "object" },
    "operator_id":  { "type": "string" },
    "bypass_cop1":  { "type": "boolean", "default": false },
    "submitted_at": { "type": "string", "format": "date-time" }
  }
}
```

### 9.5 tc.packets

```json
{
  "title": "TCPacketMessage",
  "type": "object",
  "required": ["command_id", "scid", "apid", "seq_count", "iv_b64", "ciphertext_b64", "gcm_tag_b64"],
  "properties": {
    "command_id":     { "type": "string", "format": "uuid" },
    "scid":           { "type": "integer" },
    "apid":           { "type": "integer" },
    "priority":       { "type": "string" },
    "seq_count":      { "type": "integer", "minimum": 0, "maximum": 16383 },
    "iv_b64":         { "type": "string", "description": "base64 12-byte IV" },
    "ciphertext_b64": { "type": "string" },
    "gcm_tag_b64":    { "type": "string", "description": "base64 16-byte GCM auth tag" },
    "bypass_cop1":    { "type": "boolean", "default": false },
    "built_at":       { "type": "string", "format": "date-time" }
  }
}
```

### 9.6 alarm.events

```json
{
  "title": "AlarmEvent",
  "type": "object",
  "required": ["alarm_id", "scid", "param_name", "alarm_level", "eu_value", "threshold", "ts"],
  "properties": {
    "alarm_id":    { "type": "string", "format": "uuid" },
    "scid":        { "type": "integer" },
    "param_name":  { "type": "string" },
    "alarm_level": { "type": "string", "enum": ["LOW_LOW","LOW","HIGH","HIGH_HIGH"] },
    "direction":   { "type": "string", "enum": ["TRIGGERED","CLEARED"] },
    "eu_value":    { "type": "number" },
    "threshold":   { "type": "number" },
    "eu_unit":     { "type": "string" },
    "ts":          { "type": "string", "format": "date-time" }
  }
}
```

---

## 10. Database Schemas

### 10.1 PostgreSQL — vyuh_config

```sql
-- V001__init_config.sql

CREATE TABLE satellite_config (
    scid           SMALLINT PRIMARY KEY,
    name           VARCHAR(64) NOT NULL UNIQUE,
    enabled        BOOLEAN NOT NULL DEFAULT true,
    tle_line1      VARCHAR(70),
    tle_line2      VARCHAR(70),
    antennas       TEXT[],                          -- antenna_id list
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE vcid_config (
    scid           SMALLINT NOT NULL REFERENCES satellite_config(scid),
    vcid           SMALLINT NOT NULL,
    description    VARCHAR(128),
    frame_rate_hz  REAL,
    PRIMARY KEY (scid, vcid)
);

CREATE TABLE xtce_parameters (
    id             BIGSERIAL PRIMARY KEY,
    scid           SMALLINT NOT NULL REFERENCES satellite_config(scid),
    apid           SMALLINT NOT NULL,
    param_name     VARCHAR(128) NOT NULL,
    description    TEXT,
    data_type      VARCHAR(32) NOT NULL,    -- UINT, INT, FLOAT, BOOL, STRING
    bit_offset     INTEGER NOT NULL,
    bit_length     INTEGER NOT NULL,
    byte_order     VARCHAR(16) NOT NULL DEFAULT 'BIG_ENDIAN',
    eu_unit        VARCHAR(32),
    -- Calibration
    calib_type     VARCHAR(16),             -- POLYNOMIAL, SPLINE, LUT, NONE
    calib_data     JSONB,                   -- coefficients, breakpoints, or LUT table
    -- Alarm limits
    low_low_limit  DOUBLE PRECISION,
    low_limit      DOUBLE PRECISION,
    high_limit     DOUBLE PRECISION,
    high_high_limit DOUBLE PRECISION,
    alarm_enabled  BOOLEAN NOT NULL DEFAULT true,
    version        INTEGER NOT NULL DEFAULT 1,
    UNIQUE (scid, apid, param_name)
);
CREATE INDEX idx_xtce_scid_apid ON xtce_parameters(scid, apid);

CREATE TABLE obt_correlation (
    id             BIGSERIAL PRIMARY KEY,
    scid           SMALLINT NOT NULL REFERENCES satellite_config(scid),
    pass_id        VARCHAR(64) NOT NULL,
    valid_from     TIMESTAMPTZ NOT NULL,
    coeff_a0       DOUBLE PRECISION NOT NULL,  -- UTC = a0 + a1*OBT + a2*OBT^2
    coeff_a1       DOUBLE PRECISION NOT NULL,
    coeff_a2       DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (scid, pass_id)
);

CREATE TABLE alarm_definitions (
    id             BIGSERIAL PRIMARY KEY,
    scid           SMALLINT NOT NULL REFERENCES satellite_config(scid),
    param_name     VARCHAR(128) NOT NULL,
    low_low_limit  DOUBLE PRECISION,
    low_limit      DOUBLE PRECISION,
    high_limit     DOUBLE PRECISION,
    high_high_limit DOUBLE PRECISION,
    hysteresis_pct REAL NOT NULL DEFAULT 1.0,
    enabled        BOOLEAN NOT NULL DEFAULT true,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by     VARCHAR(128),
    UNIQUE (scid, param_name)
);
```

### 10.2 PostgreSQL — vyuh_commands

```sql
-- V001__init_commands.sql

CREATE TABLE command_definitions (
    id             BIGSERIAL PRIMARY KEY,
    scid           SMALLINT NOT NULL,
    apid           SMALLINT NOT NULL,
    name           VARCHAR(128) NOT NULL,
    description    TEXT,
    min_role       VARCHAR(32) NOT NULL DEFAULT 'OPERATOR',
    params_schema  JSONB NOT NULL,    -- JSON Schema for parameter validation
    constraints    JSONB,             -- constraint expressions [{param, op, value}]
    interlocks     JSONB,             -- interlock chain definitions
    enabled        BOOLEAN NOT NULL DEFAULT true,
    UNIQUE (scid, apid)
);

CREATE TABLE command_log (
    id             BIGSERIAL PRIMARY KEY,
    command_id     UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    scid           SMALLINT NOT NULL,
    apid           SMALLINT NOT NULL,
    command_name   VARCHAR(128),
    params         JSONB NOT NULL,
    operator_id    VARCHAR(256) NOT NULL,
    priority       VARCHAR(16) NOT NULL,
    status         VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    -- Status: PENDING | QUEUED | SENT | ACKNOWLEDGED | FAILED | REJECTED_RANGE |
    --         REJECTED_CONSTRAINT | REJECTED_INHIBITED | REJECTED_INTERLOCK | CANCELLED
    rejection_reason TEXT,
    seq_count      SMALLINT,          -- CCSDS sequence count used
    retransmit_count SMALLINT DEFAULT 0,
    submitted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    queued_at      TIMESTAMPTZ,
    sent_at        TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ,
    failed_at      TIMESTAMPTZ
);
CREATE INDEX idx_cmdlog_scid_ts ON command_log(scid, submitted_at DESC);
CREATE INDEX idx_cmdlog_status ON command_log(status) WHERE status NOT IN ('ACKNOWLEDGED', 'FAILED');

CREATE TABLE dead_letter_log (
    id             BIGSERIAL PRIMARY KEY,
    kafka_topic    VARCHAR(128) NOT NULL,
    kafka_partition INTEGER NOT NULL,
    kafka_offset   BIGINT NOT NULL,
    source_service VARCHAR(64) NOT NULL,
    error_type     VARCHAR(64) NOT NULL,
    scid           SMALLINT,
    payload_b64    TEXT,
    error_detail   TEXT,
    received_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 10.3 PostgreSQL — vyuh_audit

```sql
-- V001__init_audit.sql

CREATE TABLE audit_log (
    id             BIGSERIAL PRIMARY KEY,
    event_id       UUID NOT NULL DEFAULT gen_random_uuid(),
    event_type     VARCHAR(64) NOT NULL,
    -- EVENT_TYPES: CMD_SUBMIT | CMD_CANCEL | ALARM_ACK | CONFIG_CHANGE |
    --              INHIBIT_SET | INHIBIT_CLEAR | LOGIN | LOGOUT | ROLE_CHANGE
    operator_id    VARCHAR(256) NOT NULL,
    operator_role  VARCHAR(32) NOT NULL,
    scid           SMALLINT,
    resource_id    VARCHAR(256),
    resource_type  VARCHAR(64),
    detail         JSONB,
    ip_address     INET,
    session_id     VARCHAR(256),
    ts             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- BRIN index: optimal for append-only time-series with sequential ts
CREATE INDEX idx_audit_ts ON audit_log USING BRIN(ts);
CREATE INDEX idx_audit_operator ON audit_log(operator_id, ts DESC);

CREATE TABLE alarm_log (
    id             BIGSERIAL PRIMARY KEY,
    alarm_id       UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    scid           SMALLINT NOT NULL,
    param_name     VARCHAR(128) NOT NULL,
    alarm_level    VARCHAR(16) NOT NULL,
    eu_value       DOUBLE PRECISION NOT NULL,
    threshold      DOUBLE PRECISION NOT NULL,
    eu_unit        VARCHAR(32),
    triggered_at   TIMESTAMPTZ NOT NULL,
    cleared_at     TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by VARCHAR(256),
    inhibited      BOOLEAN NOT NULL DEFAULT false,
    status         VARCHAR(32) NOT NULL DEFAULT 'ACTIVE'
    -- ACTIVE | ACKNOWLEDGED | CLEARED
);
CREATE INDEX idx_alarmlog_scid_active ON alarm_log(scid, triggered_at DESC) WHERE status = 'ACTIVE';
```

### 10.4 TimescaleDB — vyuh_telemetry

```sql
-- V001__init_telemetry.sql

CREATE TABLE telemetry_raw (
    time        TIMESTAMPTZ NOT NULL,
    scid        SMALLINT    NOT NULL,
    param_name  TEXT        NOT NULL,
    dn_value    BIGINT,
    eu_value    DOUBLE PRECISION,
    eu_unit     TEXT,
    quality     SMALLINT    NOT NULL DEFAULT 0,
    alarm_state SMALLINT    NOT NULL DEFAULT 0,
    apid        SMALLINT,
    packet_seq  SMALLINT,
    pass_id     TEXT,
    is_replay   BOOLEAN     NOT NULL DEFAULT false,
    PRIMARY KEY (time, scid, param_name)  -- dedup key
);

SELECT create_hypertable('telemetry_raw', 'time',
    chunk_time_interval => INTERVAL '1 day',
    partitioning_column => 'scid',
    number_partitions => 64
);

ALTER TABLE telemetry_raw SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'scid, param_name',
    timescaledb.compress_orderby = 'time DESC'
);

SELECT add_compression_policy('telemetry_raw', INTERVAL '7 days');
SELECT add_retention_policy('telemetry_raw', INTERVAL '30 days');

-- Continuous aggregates
CREATE MATERIALIZED VIEW telemetry_1min
    WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT
    time_bucket('1 minute', time) AS bucket,
    scid, param_name,
    AVG(eu_value)   AS avg_val,
    MIN(eu_value)   AS min_val,
    MAX(eu_value)   AS max_val,
    COUNT(*)        AS sample_count,
    MIN(quality)    AS min_quality
FROM telemetry_raw
WHERE quality < 2   -- exclude bad quality
GROUP BY bucket, scid, param_name
WITH NO DATA;

SELECT add_continuous_aggregate_policy('telemetry_1min',
    start_offset => INTERVAL '2 minutes',
    end_offset   => INTERVAL '30 seconds',
    schedule_interval => INTERVAL '1 minute'
);

CREATE MATERIALIZED VIEW telemetry_1hour
    WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT
    time_bucket('1 hour', bucket) AS bucket,
    scid, param_name,
    AVG(avg_val) AS avg_val,
    MIN(min_val) AS min_val,
    MAX(max_val) AS max_val,
    SUM(sample_count) AS sample_count
FROM telemetry_1min
GROUP BY time_bucket('1 hour', bucket), scid, param_name
WITH NO DATA;
```

### 10.5 Redis Key Reference

```
DB-0  CVT (noeviction)
  cvt:{scid}:{param_name}           HASH  { value, eu_unit, ts_ns, quality, alarm_state }
  cvt:updated:{scid}                ZSET  { param_name: ts_ns }
  cvt:alarm_active:{scid}           HASH  { param_name: alarm_level }

DB-1  Gap + Whitelist (noeviction)
  scid:whitelist                    HSET  { scid_string: "1" }
  gap:{scid}:{vcid}                 HASH  { last_vcfc, gap_count, last_updated_ns }
  gap:seen:{scid}:{vcfc}            BITFIELD  (Bloom filter bits, TTL=24h)

DB-2  XTCE Config Cache (volatile-lru for TTL keys, noeviction for inhibit)
  xtce:{scid}:{apid}                STRING  JSON param set (TTL=5min)
  alarm:inhibit:{scid}:{param}      STRING  "1" (no TTL — operator must clear)
  uplink:inhibited:{scid}           SET     { apid_strings }
  uplink:executing:{scid}           SET     { command_id_strings, TTL=120s }

DB-3  Reassembly Buffer (volatile-lru)
  reassembly:{scid}:{vcid}:{apid}:{first_seq}   HASH  { fragments, total_len, TTL=30s }

DB-5  COP-1 Retransmit Buffer (noeviction)
  cop1:{scid}:{v_s}                 STRING  binary TC frame bytes (TTL=60s)
  cop1:window:{scid}                LIST    V(S) values outstanding
  cop1:vs:{scid}                    STRING  current V(S) uint8
  cop1:rtt:{scid}                   LIST    last 10 RTT measurements (ms), LPUSH/LTRIM
```

---

## 11. Infrastructure Setup

### 11.1 Prerequisites

```bash
# Required tools
kubectl  >= 1.29
helm     >= 3.14
terraform >= 1.8
go       >= 1.22
docker   >= 25
make
jq
```

### 11.2 Kafka Setup (Helm)

```yaml
# deployments/helm/kafka/values.yaml
kafka:
  replicaCount: 9
  config:
    defaultReplicationFactor: 3
    minInsyncReplicas: 2
    offsets.topic.replication.factor: 3
    transaction.state.log.replication.factor: 3
    transaction.state.log.min.isr: 2
    log.retention.hours: 168
    log.segment.bytes: 1073741824
    auto.create.topics.enable: "false"
  persistence:
    size: 2Ti
    storageClass: gp3

schemaRegistry:
  replicaCount: 2
  config:
    compatibility: BACKWARD
```

```bash
# Create all topics
./scripts/local/create-topics.sh
# Topics created: see Section 3.4 topic list
# Each topic created with: kafka-topics.sh --create --partitions N --replication-factor 3 --config retention.ms=... --config min.insync.replicas=2
```

### 11.3 Redis Cluster Setup

```yaml
# deployments/helm/redis/values.yaml
cluster:
  enabled: true
  slaveCount: 1    # 1 replica per master
redis:
  replicas: 6      # 3 masters + 3 replicas
  config:
    maxmemory: 512mb
    maxmemory-policy: noeviction  # overridden per-DB via CONFIG SET
    hz: 20
    save: ""      # disable RDB persistence (Kafka is the source of truth)
    appendonly: "yes"
    appendfsync: everysec
```

```bash
# Post-startup: set eviction policy per DB
redis-cli -c CONFIG SET maxmemory-policy noeviction        # DB-0, DB-1, DB-5
redis-cli -c SELECT 2 && CONFIG SET maxmemory-policy volatile-lru  # DB-2
redis-cli -c SELECT 3 && CONFIG SET maxmemory-policy volatile-lru  # DB-3
```

### 11.4 PostgreSQL Setup (Patroni)

```yaml
# deployments/helm/postgres/values.yaml
postgresql:
  replicaCount: 2   # primary + 1 sync standby
  parameters:
    max_connections: 500
    shared_buffers: 4GB
    effective_cache_size: 12GB
    work_mem: 16MB
    wal_level: replica
    max_wal_senders: 5
    synchronous_commit: "on"
patroni:
  enabled: true
  synchronousMode: true
  syncStandbyNames: "*"
```

```bash
# Apply Flyway migrations (also run automatically in init containers)
flyway -url=jdbc:postgresql://postgres:5432/vyuh_config   migrate
flyway -url=jdbc:postgresql://postgres:5432/vyuh_commands migrate
flyway -url=jdbc:postgresql://postgres:5432/vyuh_audit    migrate
flyway -url=jdbc:postgresql://timescaledb:5432/vyuh_telemetry migrate
```

### 11.5 etcd Setup

```yaml
# deployments/helm/etcd/values.yaml
replicaCount: 3
auth:
  rbac:
    create: true
  client:
    enableAuthentication: true
    secureTransport: true
  peer:
    enableAuthentication: true
    secureTransport: true
```

### 11.6 Vault Setup

```bash
# Initial Vault setup (run once after install)
vault operator init -key-shares=5 -key-threshold=3   # split keys to ops team
vault operator unseal <key1>
vault operator unseal <key2>
vault operator unseal <key3>

# Enable KV v2 for satellite secrets
vault secrets enable -path=secret kv-v2

# Enable Kubernetes auth
vault auth enable kubernetes
vault write auth/kubernetes/config \
    token_reviewer_jwt="$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)" \
    kubernetes_host="https://kubernetes.default.svc" \
    kubernetes_ca_cert="@/var/run/secrets/kubernetes.io/serviceaccount/ca.crt"

# Create UPE policy
vault policy write upe-policy - <<EOF
path "secret/data/satellite/+/uplink-key" { capabilities = ["read"] }
EOF

# Bind UPE service account to policy
vault write auth/kubernetes/role/upe \
    bound_service_account_names=upe \
    bound_service_account_namespaces=vyuh-uplink \
    policies=upe-policy \
    ttl=1h

# Create satellite key (per satellite)
vault kv put secret/satellite/42/uplink-key \
    key="$(openssl rand -base64 32)" version=1
```

### 11.7 Kong Setup

```yaml
# deployments/helm/kong/values.yaml
replicaCount: 2
proxy:
  enabled: true
  tls:
    enabled: true
ingressController:
  enabled: true
```

```bash
# Configure JWT validation plugin
kubectl apply -f - <<EOF
apiVersion: configuration.konghq.com/v1
kind: KongPlugin
metadata:
  name: jwt-auth
  namespace: vyuh-ingress
plugin: jwt
config:
  key_claim_name: kid
  secret_is_base64: false
  anonymous: null
  run_on_preflight: true
EOF

# Configure rate limiting
kubectl apply -f - <<EOF
apiVersion: configuration.konghq.com/v1
kind: KongPlugin
metadata:
  name: rate-limit
plugin: rate-limiting
config:
  minute: 1000
  policy: redis
  redis_host: redis-cluster.vyuh-data.svc.cluster.local
EOF
```

---

## 12. Local Development Setup

### 12.1 Prerequisites

```bash
# Install Go
brew install go@1.22  # or download from go.dev

# Install tools
go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
go install github.com/golang/mock/mockgen@latest
go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest

# Install docker compose (for local infra)
brew install docker docker-compose
```

### 12.2 Local Infrastructure (Docker Compose)

```yaml
# docker-compose.dev.yml
version: "3.9"
services:
  kafka:
    image: confluentinc/cp-kafka:7.6.0
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka:9093
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      CLUSTER_ID: MkU3OEVBNTcwNTJENDM2Qk
    ports: ["9092:9092"]

  schema-registry:
    image: confluentinc/cp-schema-registry:7.6.0
    environment:
      SCHEMA_REGISTRY_KAFKASTORE_BOOTSTRAP_SERVERS: kafka:9092
      SCHEMA_REGISTRY_HOST_NAME: schema-registry
      SCHEMA_REGISTRY_LISTENERS: http://0.0.0.0:8081
    ports: ["8081:8081"]
    depends_on: [kafka]

  redis:
    image: redis:7.2-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy noeviction
    ports: ["6379:6379"]

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: vyuh
      POSTGRES_PASSWORD: vyuh_dev_password
      POSTGRES_MULTIPLE_DATABASES: vyuh_config,vyuh_commands,vyuh_audit
    ports: ["5432:5432"]
    volumes: ["./scripts/local/init-postgres.sh:/docker-entrypoint-initdb.d/init.sh"]

  timescaledb:
    image: timescale/timescaledb:latest-pg16
    environment:
      POSTGRES_USER: vyuh
      POSTGRES_PASSWORD: vyuh_dev_password
      POSTGRES_DB: vyuh_telemetry
    ports: ["5433:5432"]

  etcd:
    image: quay.io/coreos/etcd:v3.5.13
    command: >
      etcd --name=local-etcd
      --initial-cluster-state=new
      --listen-client-urls=http://0.0.0.0:2379
      --advertise-client-urls=http://localhost:2379
    ports: ["2379:2379"]

  vault:
    image: hashicorp/vault:1.17
    environment:
      VAULT_DEV_ROOT_TOKEN_ID: dev-root-token
      VAULT_DEV_LISTEN_ADDRESS: 0.0.0.0:8200
    ports: ["8200:8200"]
    cap_add: [IPC_LOCK]

  keycloak:
    image: quay.io/keycloak/keycloak:24.0
    command: start-dev --import-realm
    environment:
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: admin
    volumes: ["./scripts/local/keycloak-realm.json:/opt/keycloak/data/import/realm.json"]
    ports: ["8080:8080"]
```

### 12.3 Starting Local Dev Environment

```bash
# Clone repository
git clone https://github.com/akashaveda/vyuh-mcs.git
cd vyuh-mcs

# Start infrastructure
docker-compose -f docker-compose.dev.yml up -d

# Wait for services to be ready
./scripts/local/wait-for-services.sh

# Run database migrations
./scripts/local/run-migrations.sh

# Create Kafka topics (local single-replica)
./scripts/local/create-topics.sh --replication-factor 1

# Seed test data
./scripts/local/seed-data.sh --satellites 5 --params-per-sat 20

# Set up Vault dev secrets
./scripts/local/setup-vault-dev.sh

# Build all services
make build-all

# Run a single service
SCID=1 \
KAFKA_BROKERS=localhost:9092 \
REDIS_ADDR=localhost:6379 \
PG_DSN="postgres://vyuh:vyuh_dev_password@localhost:5432/vyuh_config" \
go run ./cmd/tfpe/

# Or use the convenience script
./scripts/local/run-service.sh tfpe
```

### 12.4 Environment Variables Per Service

**Common to all services:**
```bash
KAFKA_BROKERS          # comma-separated broker list
KAFKA_SCHEMA_REGISTRY  # schema registry URL
LOG_LEVEL              # debug | info | warn | error
OTEL_EXPORTER_OTLP_ENDPOINT  # OpenTelemetry collector endpoint
SERVICE_NAME           # e.g. "tfpe"
METRICS_PORT           # Prometheus metrics port (default 9090)
HEALTH_PORT            # Health check port (default 8080)
```

**TFPE:**
```bash
KAFKA_CONSUMER_GROUP   # tfpe-cg
KAFKA_INPUT_TOPIC      # telemetry.raw.frames
KAFKA_OUTPUT_TOPIC_SP  # telemetry.space.packets
KAFKA_OUTPUT_TOPIC_GAP # telemetry.gaps
KAFKA_OUTPUT_TOPIC_CLCW# clcw.events
REDIS_ADDR             # Redis cluster address
REDIS_DB1_WHITELIST    # DB number for whitelist (1)
REDIS_DB3_REASSEMBLY   # DB number for reassembly (3)
UTFE_GRPC_ADDR_TEMPLATE# template: utfe-{scid}.vyuh-uplink.svc.cluster.local:50051
NUM_WORKERS            # goroutine count (default 16)
```

**UPE:**
```bash
SCID                   # satellite ID for this pod (from StatefulSet ordinal)
KAFKA_CONSUMER_GROUP   # upe-cg-{SCID}
KAFKA_INPUT_TOPIC      # raw.commands
KAFKA_ACK_TOPIC        # cmd.ack.events
KAFKA_OUTPUT_TOPIC     # tc.packets
REDIS_ADDR             # Redis cluster
PG_DSN                 # vyuh_commands database
ETCD_ENDPOINTS         # etcd cluster endpoints
VAULT_ADDR             # Vault address
VAULT_AUTH_METHOD      # kubernetes
VAULT_K8S_ROLE         # upe
VAULT_SECRET_PATH_TMPL # secret/satellite/{scid}/uplink-key
KEY_CACHE_TTL_SECS     # 300
```

**UTFE:**
```bash
SCID                   # satellite ID for this pod
KAFKA_CONSUMER_GROUP   # utfe-cg-{SCID}
KAFKA_INPUT_TOPIC_TC   # tc.packets
KAFKA_INPUT_TOPIC_CLCW # clcw.events
KAFKA_OUTPUT_TOPIC_ACK # cmd.ack.events
REDIS_ADDR             # Redis cluster (DB-5)
ANTENNA_HTTP_BASE_URL  # antenna driver base URL
T1_TIMER_INITIAL_MS    # 3000
T1_TIMER_MAX_MS        # 10000
MAX_RETRANSMITS        # 3
```

**TDAE:**
```bash
KAFKA_CONSUMER_GROUP   # tdae-cg
KAFKA_INPUT_TOPIC      # telemetry.processed
REDIS_ADDR             # Redis cluster (DB-0)
TSDB_DSN               # TimescaleDB connection string
TSDB_POOL_SIZE         # 10
S3_BUCKET              # vyuh-mcs-telemetry
S3_REGION              # us-east-1
BATCH_WINDOW_MS        # 100
REDIS_PIPELINE_BATCH   # 200
WS_MAX_CONNECTIONS     # 500
```

---

## 13. Testing Requirements

### 13.1 Unit Tests

All services must achieve **≥80% line coverage**. Unit tests must use testify/assert and mock all external dependencies.

```go
// Example: TFPE CRC validation unit test
func TestCRCValidation(t *testing.T) {
    frame := buildTestFrame(t, testSCID, testVCID)
    // Valid frame
    assert.True(t, validateCRC(frame))
    // Corrupt one byte
    frame.DataField[5] ^= 0xFF
    assert.False(t, validateCRC(frame))
}

// Example: UPE safety chain unit test
func TestSafetyChainL1_RangeCheck(t *testing.T) {
    ctrl := gomock.NewController(t)
    mockPG := mock_pg.NewMockCommandRepo(ctrl)
    mockPG.EXPECT().GetCommandDef(ctx, 42, 100).Return(&CommandDef{
        Params: map[string]ParamDef{
            "voltage": {Min: 0.0, Max: 5.0, Type: "FLOAT"},
        },
    }, nil)

    chain := NewSafetyChain(mockPG, nil, nil, nil)
    err := chain.CheckL1(ctx, &RawCommand{SCID: 42, APID: 100, Params: map[string]any{
        "voltage": 6.0,  // out of range
    }})
    assert.ErrorIs(t, err, ErrRangeViolation)
}
```

### 13.2 Integration Tests (Testcontainers)

Each service has an integration test suite that spins up real dependencies using Testcontainers:

```go
// Example: TFPE integration test
func TestTFPEIntegration(t *testing.T) {
    ctx := context.Background()

    // Start containers
    kafkaContainer, _ := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
        ContainerRequest: testcontainers.ContainerRequest{
            Image:        "confluentinc/cp-kafka:7.6.0",
            ExposedPorts: []string{"9092/tcp"},
        },
    })
    redisContainer, _ := testcontainers.GenericContainer(ctx, ...)

    // Start TFPE with test config
    svc := NewTFPE(testConfig(kafkaContainer, redisContainer))
    go svc.Run(ctx)

    // Produce a test frame
    producer.Produce(&kafka.Message{
        TopicPartition: kafka.TopicPartition{Topic: &rawFramesTopic},
        Key:   []byte{0, 42},  // SCID=42
        Value: buildValidTestFrame(42, 3, 100),  // SCID, VCID, VCFC
    })

    // Wait for space packet on output topic
    msg := consumeWithTimeout(t, spacePacketConsumer, 5*time.Second)
    assert.NotNil(t, msg)

    var pkt SpacePacketMessage
    json.Unmarshal(msg.Value, &pkt)
    assert.Equal(t, uint16(42), pkt.SCID)
}
```

### 13.3 Performance Tests

Performance tests use k6 and are run in the staging environment:

```javascript
// scripts/perf/test_downlink_throughput.js
import { check } from 'k6';
import { Kafka } from 'k6/x/kafka';

const producer = new Kafka({ brokers: [__ENV.KAFKA_BROKER] });

export const options = {
  scenarios: {
    downlink_flood: {
      executor: 'constant-arrival-rate',
      rate: 50000,        // 50K frames/sec target
      timeUnit: '1s',
      duration: '60s',
      preAllocatedVUs: 100,
    },
  },
  thresholds: {
    'kafka_consumer_lag{topic:telemetry.processed}': ['max < 10000'],
  },
};

export default function () {
  producer.produce({
    topic: 'telemetry.raw.frames',
    messages: [{ key: buildSCIDKey(), value: buildValidFrame() }],
  });
}
```

### 13.4 Contract Tests

Kafka message schemas are validated using Schema Registry compatibility checks in CI:

```bash
# scripts/ci/validate-schemas.sh
for schema in internal/kafka/schemas/*.json; do
  curl -X POST http://schema-registry:8081/compatibility/subjects/$(basename $schema .json)-value/versions/latest \
    -H "Content-Type: application/vnd.schemaregistry.v1+json" \
    -d "{\"schema\": $(cat $schema | jq -Rs .)}" | jq '.is_compatible' | grep -q true
done
```

### 13.5 End-to-End Tests

E2E tests in `tests/e2e/` validate full pipeline flows:

```bash
# Run full downlink E2E: inject frames → verify CVT updated
go test ./tests/e2e/downlink/... -v -timeout 120s

# Run uplink E2E: submit command → verify CLCW ack → verify command_log ACKNOWLEDGED
go test ./tests/e2e/uplink/... -v -timeout 120s
```

---

## 14. CI/CD Pipeline

### 14.1 GitHub Actions Workflow

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with: { go-version: '1.22' }
      - run: golangci-lint run ./...

  test:
    runs-on: ubuntu-latest
    services:
      kafka:
        image: confluentinc/cp-kafka:7.6.0
        env: { CLUSTER_ID: test, KAFKA_NODE_ID: 1, KAFKA_PROCESS_ROLES: broker+controller }
      redis:
        image: redis:7.2-alpine
      postgres:
        image: postgres:16-alpine
        env: { POSTGRES_PASSWORD: test }
      timescaledb:
        image: timescale/timescaledb:latest-pg16
        env: { POSTGRES_PASSWORD: test }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
      - run: make test-unit
      - run: make test-integration
      - run: go tool cover -func=coverage.out | grep total

  schema-compat:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/ci/validate-schemas.sh

  build:
    needs: [lint, test, schema-compat]
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: [frame-ingest, tfpe, tppp, tdae, upe, utfe, command-gateway, bff, gap-replay, alarm-manager, dead-letter-monitor]
    steps:
      - uses: actions/checkout@v4
      - run: |
          docker build \
            --build-arg SERVICE=${{ matrix.service }} \
            -t ${{ env.REGISTRY }}/${{ matrix.service }}:${{ github.sha }} \
            -f Dockerfile .
          docker push ${{ env.REGISTRY }}/${{ matrix.service }}:${{ github.sha }}

  deploy-staging:
    needs: [build]
    if: github.ref == 'refs/heads/develop'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          helm upgrade --install vyuh-mcs deployments/helm/vyuh-mcs \
            --namespace vyuh \
            --set global.image.tag=${{ github.sha }} \
            --set global.environment=staging \
            -f deployments/helm/vyuh-mcs/values.staging.yaml

  perf-test:
    needs: [deploy-staging]
    runs-on: ubuntu-latest
    steps:
      - run: k6 run scripts/perf/test_downlink_throughput.js

  deploy-prod:
    needs: [perf-test]
    if: github.ref == 'refs/heads/main'
    environment: production
    runs-on: ubuntu-latest
    steps:
      - run: |
          helm upgrade --install vyuh-mcs deployments/helm/vyuh-mcs \
            --namespace vyuh \
            --set global.image.tag=${{ github.sha }} \
            --set global.environment=production \
            --set downlink.tfpe.replicaCount=8 \
            -f deployments/helm/vyuh-mcs/values.production.yaml
```

### 14.2 Dockerfile (multi-stage)

```dockerfile
# Dockerfile — shared multi-stage for all services
FROM golang:1.22-alpine AS builder
ARG SERVICE
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-w -s" -o /bin/service ./cmd/${SERVICE}/

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=builder /bin/service /service
USER nonroot:nonroot
EXPOSE 8080 9090
ENTRYPOINT ["/service"]
```

### 14.3 Helm Chart Structure

```
deployments/helm/vyuh-mcs/
  Chart.yaml
  values.yaml              # defaults
  values.staging.yaml      # staging overrides
  values.production.yaml   # production overrides
  templates/
    _helpers.tpl
    namespace.yaml
    downlink/
      frame-ingest-deployment.yaml
      tfpe-deployment.yaml         # includes HPA
      tppp-deployment.yaml         # includes HPA
      tdae-deployment.yaml         # includes HPA
    uplink/
      command-gateway-deployment.yaml
      upe-statefulset.yaml         # 500 replicas
      utfe-statefulset.yaml        # 500 replicas
      satellite-lifecycle-crd.yaml
    api/
      bff-deployment.yaml
    support/
      gap-replay-deployment.yaml
      alarm-manager-deployment.yaml
      dead-letter-monitor-deployment.yaml
    hpa/
      tfpe-hpa.yaml               # scales on kafka_consumer_lag + CPU
      tppp-hpa.yaml
      tdae-hpa.yaml
    pdb/                          # PodDisruptionBudgets
      downlink-pdb.yaml           # minAvailable: 50%
```

---

## 15. Security Requirements

### 15.1 Authentication & Authorisation

| ID | Requirement |
|----|------------|
| SEC-001 | All REST API calls MUST present a valid JWT issued by Keycloak |
| SEC-002 | JWT validation MUST check: signature, expiry, issuer, audience |
| SEC-003 | Role claims in JWT MUST be enforced per endpoint (see Section 7 role requirements) |
| SEC-004 | WebSocket connections MUST authenticate via JWT query param or Authorization header on upgrade |
| SEC-005 | Service-to-service calls (internal) MUST use Istio mTLS with certificate validation |

### 15.2 Secrets Management

| ID | Requirement |
|----|------------|
| SEC-006 | No secrets SHALL appear in K8s manifests, ConfigMaps, or environment variables in plain text |
| SEC-007 | All secrets SHALL be stored in Vault and mounted via Vault Agent Injector or External Secrets Operator |
| SEC-008 | Database credentials SHALL be rotated automatically by Vault every 24 hours |
| SEC-009 | Uplink encryption keys SHALL be rotatable without pod restart (cache TTL=5min) |
| SEC-010 | Vault audit log SHALL be enabled and forwarded to Loki |

### 15.3 Data Security

| ID | Requirement |
|----|------------|
| SEC-011 | All uplink TC frames SHALL be encrypted with AES-256-GCM before Kafka publication |
| SEC-012 | Kafka topics SHALL use TLS transport + SASL/SCRAM authentication |
| SEC-013 | TimescaleDB and PostgreSQL connections SHALL require SSL (sslmode=require) |
| SEC-014 | S3 objects SHALL be encrypted with AES-256 SSE |
| SEC-015 | All Kubernetes Secrets SHALL be encrypted at rest via KMS provider |

### 15.4 Audit & Compliance

| ID | Requirement |
|----|------------|
| SEC-016 | Every command submission SHALL create an immutable audit_log record |
| SEC-017 | Audit log records SHALL NOT be updatable or deletable by any service account |
| SEC-018 | All operator logins/logouts SHALL be logged in audit_log |
| SEC-019 | Audit log SHALL retain records for minimum 2 years |
| SEC-020 | All changes to alarm limits, inhibit flags, and satellite config SHALL be audit-logged |

---

## 16. Observability Requirements

### 16.1 Required Prometheus Metrics Per Service

Every service MUST expose these standard metrics:

```
# Standard (auto-generated by prometheus/client_golang)
go_goroutines
go_memstats_alloc_bytes
process_cpu_seconds_total

# Kafka (required for all consumers)
kafka_consumer_lag_sum{topic, partition, consumer_group}
kafka_messages_consumed_total{topic, status}
kafka_messages_produced_total{topic, status}

# HTTP (required for all HTTP servers)
http_requests_total{method, path, status_code}
http_request_duration_seconds{method, path}
```

**TFPE-specific:**
```
tfpe_frames_processed_total{scid, result}        # result: ok | crc_fail | scid_unknown
tfpe_gaps_detected_total{scid, vcid}
tfpe_reassembly_active                           # gauge: in-progress reassembly buffers
tfpe_frame_processing_duration_seconds           # histogram
```

**TPPP-specific:**
```
tppp_params_decoded_total{scid, apid, status}
tppp_alarms_triggered_total{scid, level}
tppp_calibration_errors_total{scid, apid, calib_type}
tppp_xtce_cache_hits_total / tppp_xtce_cache_misses_total
```

**TDAE-specific:**
```
tdae_cvt_writes_total{scid}
tdae_redis_pipeline_flush_duration_seconds
tdae_websocket_connections                       # gauge
tdae_tsdb_batch_rows_written_total
tdae_s3_parquet_files_written_total
tdae_kafka_offset_commit_lag_seconds             # time between consume and commit
```

**UPE-specific:**
```
upe_commands_total{scid, status}                 # status: accepted | rejected_l1..l4 | failed
upe_safety_check_duration_seconds{level}
upe_vault_key_fetches_total{scid, cached}
upe_etcd_lock_acquires_total{scid, result}
```

**UTFE-specific:**
```
utfe_frames_sent_total{scid}
utfe_retransmits_total{scid}
utfe_cop1_state{scid}                            # gauge: 1=S1, 2=S2, 3=S3, 4=S4
utfe_t1_timer_fires_total{scid}
utfe_link_failures_total{scid}
utfe_rtt_milliseconds{scid}                      # histogram
```

### 16.2 Required Log Fields

All log entries MUST be structured JSON with these fields:

```json
{
  "ts":          "2026-09-01T10:00:00.123456789Z",
  "level":       "info",
  "service":     "tfpe",
  "pod":         "tfpe-7d8f9c-xkp2n",
  "scid":        42,
  "trace_id":    "4bf92f3577b34da6a3ce929d0e0e4736",
  "span_id":     "00f067aa0ba902b7",
  "msg":         "frame processed",
  "vcfc":        100,
  "result":      "ok",
  "duration_ms": 3.2
}
```

### 16.3 Distributed Tracing Requirements

| ID | Requirement |
|----|------------|
| OBS-001 | Every Kafka message SHALL carry W3C trace context headers (`traceparent`, `tracestate`) |
| OBS-002 | TFPE SHALL start a new trace span per frame batch; propagate through TPPP and TDAE |
| OBS-003 | UPE SHALL start a trace for each command; propagate through UTFE |
| OBS-004 | HTTP services (BFF, Command Gateway) SHALL extract incoming trace context from headers |
| OBS-005 | Trace sampling rate SHALL be configurable via environment variable (default: 1% in prod, 100% in staging) |

---

## 17. Acceptance Criteria

### 17.1 Phase 0 — Infrastructure & Scaffolding

- [ ] All 11 Go service repositories initialised with standard project layout
- [ ] Docker Compose dev environment boots all dependencies in < 3 minutes
- [ ] All Flyway migrations apply cleanly on fresh databases
- [ ] All Kafka topics created with correct partition counts and retention settings
- [ ] Schema Registry operational; baseline schemas registered
- [ ] Vault configured with UPE AppRole and test satellite keys
- [ ] CI pipeline runs lint + unit tests on every PR
- [ ] Grafana dashboards provisioned (empty, no data yet)

### 17.2 Phase 1 — Downlink Pipeline (TFPE + TPPP + TDAE)

- [ ] Frame Ingest receives test frames from antenna simulator and publishes to Kafka
- [ ] TFPE correctly parses valid frames; rejects CRC failures; detects gaps
- [ ] TFPE reassembles 3-frame spanning space packet correctly
- [ ] TPPP decodes all parameter types (UINT, INT, FLOAT, BOOL)
- [ ] TPPP applies polynomial calibration with ≤0.001% numerical error vs reference
- [ ] TPPP triggers HIGH alarm when parameter crosses threshold for 3 consecutive samples
- [ ] TDAE writes all parameters to Redis CVT within 5ms (P99)
- [ ] TDAE delivers WebSocket updates to connected client within 10ms (P99)
- [ ] TDAE inserts into TimescaleDB; rows queryable via SQL
- [ ] 1-min continuous aggregate auto-refreshes within 90 seconds of data arrival
- [ ] Full downlink pipeline throughput: 1,000,000 params/sec sustained for 60 seconds
- [ ] Kafka consumer lag stays < 10,000 messages under peak load

### 17.3 Phase 2 — Uplink Pipeline (Command Gateway + UPE + UTFE)

- [ ] Command Gateway accepts valid command via REST and produces to Kafka
- [ ] Command Gateway rejects command with invalid parameter value (400 response)
- [ ] UPE rejects out-of-range parameter (L1 check)
- [ ] UPE rejects inhibited command (L3 check)
- [ ] UPE encrypts command with AES-256-GCM; encryption verifiable with test key
- [ ] UPE acquires etcd lock; second concurrent attempt for same SCID waits/queues
- [ ] UTFE builds valid CCSDS TC Transfer Frame; CRC computed correctly
- [ ] UTFE retransmits after T1 timeout; stops after 3 retries
- [ ] UTFE acknowledges command on CLCW V(R) advancement
- [ ] Command status transitions: PENDING → QUEUED → SENT → ACKNOWLEDGED
- [ ] Full uplink round-trip P99 ≤ 100ms (gateway receipt to tc.packets publish)

### 17.4 Phase 3 — Reliability & Operations

- [ ] Frame Ingest standby promotes within 9 seconds of primary failure; zero frame loss
- [ ] TFPE pod restart: Kafka rebalance completes; processing resumes within 30 seconds
- [ ] TDAE pod restart: all WebSocket clients reconnect within 500ms
- [ ] Redis master failure: replica promoted; CVT reads/writes resume within 10 seconds
- [ ] PostgreSQL failover: Patroni promotes standby; UPE hold queue flushes on recovery
- [ ] Gap Replay Service recovers 5 missing frames from S3 and injects into pipeline
- [ ] Dead Letter Monitor fires PagerDuty alert when 11 dead letters arrive in 1 minute
- [ ] All services pass /health/ready probe within 30 seconds of startup
- [ ] Rolling deployment of TPPP: zero Kafka message loss, zero consumer group rebalance error

---

*VYUH-MCS SRS Backend v1.0 · Akashaveda Space Technologies · September 2026*  
*Document owner: Platform Engineering Team*  
*Review cycle: Quarterly or on major architecture change*
