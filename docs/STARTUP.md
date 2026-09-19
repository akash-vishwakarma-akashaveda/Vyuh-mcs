# VYUH-MCS — Startup guide

## 1. Quick start (the demo)

Two processes. Backend first.

```bash
go build -o bin/vyuh-mcs.exe ./cmd/vyuh-mcs
./bin/vyuh-mcs.exe          # backend: every service in one process
npm install                 # first time only
npm run dev                 # console on http://localhost:3000
```

Open http://localhost:3000. The top bar chip reads **LIVE LINK · n ms** when the console is on the real backend,
**SIMULATED DATA** when the backend is not reachable (console falls back to its built-in mock engine).
To force mock mode: `VITE_BACKEND=mock npm run dev`.

Vite proxies `/ws/telemetry` → `:8088` and `/api/v1` → `:8085`, so the browser only talks to `:3000`.

## 2. What `vyuh-mcs` starts (`internal/demo`)

| Service | Address | Role |
|---|---|---|
| Simulator (12 sats) + fault API | `:9120` | produces telemetry frames; `/v1/faults` |
| Link Gateway | `127.0.0.1:5050` (TCP) | receives frames from link adapters |
| Frame Processor | — | dedup, reorder, drops idle frames |
| Mission Database | `:9104` | dictionaries; loaded and released at boot |
| TM Processor | — | decodes packets with the dictionary, checks limits |
| Live Telemetry | — | current-value table + batched deltas |
| Alarm Manager | — | one open alarm per (satellite, parameter) |
| Realtime Gateway | `:8088` (`/ws/telemetry`) | pushes to browsers (§21.3 protocol) |
| Command Gateway → UPE → UTFE (per sat) | `:8080` | safety checks, encryption, COP-1 uplink |
| BFF | `:8085` | REST for the console; proxies commands and simulator |

Health: each service also has `/livez /readyz /startupz /metrics` where it serves HTTP.

Env overrides: `TCP_ADDR WS_ADDR MDB_ADDR CMD_ADDR BFF_ADDR SIM_ADDR`, `SIM_TIME_SCALE` (speed up the sim),
`REDIS_ADDR` (use a real Redis instead of the in-memory one).

## 3. How ingestion happens

```
Simulator ──TCP, ASM-synced 256-byte frames──▶ Link Gateway
   (or any adapter: SLE, AWS GS, file, MQTT, TCP/UDP)   │  topic tm.frames.stream.v1
                                                       ▼
                                             Frame Processor  (dedup, reorder, drop idle APID 0x7FF)
                                          tm.packets.realtime.v1 │        │ tm.clcw.v1 ──▶ UTFE (uplink acks)
                                                                 ▼
                                             TM Processor  (reads on-board time header, decodes with the
                                                            dictionary, 3-hit persistence limits)
                                       processed telemetry │        │ alarm.events
                                                           ▼        ▼
                                             Live Telemetry     Alarm Manager
                                    (CVT hash cvt:*, delta pub/sub cvtd:*)   (ws:alarms:*)
                                                           ▼
                                             Realtime Gateway ──WebSocket──▶ console worker ──▶ stores ──▶ screens
```

- **Link Gateway** is the only place that knows about link types. Two ways in: the CCSDS-standard path
  (`sle/`, talking to an SLE provider; `slemock/` is the in-repo test provider) and pluggable adapters
  (`tcp_udp.go`, `file.go`, `mqtt.go`, `awsgs.go`). Adapters yield raw units; the frame stream is the same afterwards.
- **To ingest your own data**: point an adapter at the Link Gateway (e.g. `TCP_PORT` for `cmd/link-gateway`) and import
  a dictionary for the satellite via Mission Database (`POST /v1/dictionaries/...`, JSON format; `GET /v1/dictionaries/{scid}`).
  Unknown APIDs/SCIDs without a dictionary are not decoded.
- **Satellites** are defined once in `config/satellites.json` (AKV-01..10 → SCID 1..10, NBH-01/02 → 11/12).
  Dictionaries are generated from the console's parameter table: `npm run gen:dictionary`.

## 4. Running services separately

`cmd/<service>` mains exist for each engine (`make build` builds all into `bin/`). **Caveat:** the message bus is
in-memory (a flagged substitution for Kafka), and each binary creates its own, so separately started services do
**not** see each other's topics. Use `vyuh-mcs` for anything end to end. Splitting processes needs a Kafka-backed
`internal/kafka` implementation (docker-compose.dev.yml already lists Kafka, Redis, Postgres, etcd, Vault for that day).

Standalone use is fine for a single service in isolation, e.g. the simulator alone:

```bash
go run ./cmd/simulator      # fault API on :9120
```

## 5. Demo controls

Inject the heater fault from the console (Anomaly advisories page) or directly:

```bash
curl -X POST localhost:8085/api/v1/simulator/faults -H "Content-Type: application/json" -d '{"sat_id":"AKV-03","fault":"HEATER_A_FAIL"}'
```

Then: alarm appears → acknowledge → run procedure PR-THM-004 → Flight Director approves → real HTR_SWITCH command goes UPE → UTFE → spacecraft → BAT_TEMP recovers, alarms clear.

## 6. Checks

```bash
go vet ./... && go test ./...
npx tsc --noEmit && npm run check
```

On Windows with AppControl, test binaries in temp can be blocked: set `GOTMPDIR` to a folder inside the repo.

## 7. Not real yet

Kafka and Redis (in-memory), Protobuf/gRPC (JSON), XTCE XML (JSON dictionary), CLTU uplink through the Link Gateway
(ideal uplink), real sign-in (persona picker), TM Archive & Query (session buffer only). Approvals, procedures, passes,
planning and AI screens are simulated in the console.
