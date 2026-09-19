<!--
  VYUH-MCS Frontend UI — Software Requirements Specification
  Document: VYUH-MCS-SRS-UI-001 | Version: 1.0 | June 2026
  Akashaveda Space Technologies — Architecture Team
  CONFIDENTIAL — Internal Engineering Document
-->
# VYUH-MCS Frontend UI — Software Requirements Specification

**Document:** VYUH-MCS-SRS-UI-001  
**Version:** 1.0 | June 2026  
**Author:** Akashaveda Architecture Team  
**Status:** Approved for Engineering

---

# Chapter 1 — Project Overview & Scope

## 1.1 Purpose of This Document

This SRS defines every requirement for the VYUH-MCS frontend application: what the system must do, how it must behave, what technologies to use, how it communicates with the backend, and what quality standards it must meet. Developers building the frontend should be able to start without asking any clarifying questions after reading this document.

## 1.2 What Is VYUH-MCS

VYUH-MCS (Satellite Constellation Mission Control System) is a cloud-native, real-time platform for operating satellite constellations. Operators use the frontend to:

- Monitor telemetry from up to 500 satellites simultaneously in real time
- Send commands to spacecraft via validated, encrypted procedures
- Review AI-generated anomaly detections and predictive health forecasts
- Plan contact windows, payload tasks, and mission timelines
- Manage configuration, users, and compliance audit logs

The frontend is a **single-page application (SPA)** served to operators on desktop workstations. It is the only interface between human operators and spacecraft.

## 1.3 Scope

| In Scope | Out of Scope |
|---|---|
| All 26 screens across 8 user flows | Native mobile app (v1 desktop-only) |
| React SPA with WebSocket real-time telemetry | Backend microservices (separate repos) |
| Authentication, RBAC enforcement | Ground station hardware control |
| Component library (design system implementation) | Orbit determination / flight dynamics |
| Mock telemetry engine for development/demo | Onboard flight software |
| Dark mode (primary) | Light mode (v2 future) |

## 1.4 Users and Roles

| Role | What They Do in the UI | Key Screens |
|---|---|---|
| Mission Controller | Commands spacecraft, monitors fleet health, handles anomalies | 03.1, 03.2, 04.1, 05.1 |
| Flight Engineer | Monitors telemetry, limited commanding | 03.1, 03.2, 03.3, 06.1 |
| RF / Link Engineer | Link monitoring, ground station status | 03.2 (COMMS subsystem), 06.1 |
| Payload Engineer | Payload tasking and monitoring | 06.2, 03.2 (PAYLOAD), 04.3 |
| Mission Designer | Procedure authoring, configuration management | 04.2, 07.1, 07.2, 07.3 |
| System Administrator | User management, audit, infrastructure health | 08.1, 08.2, 08.3 |

## 1.5 Design Philosophy Reference

The VYUH-MCS UI follows the **"Orbital Precision"** design philosophy:

> Every element earns its place through function. Darkness is not empty — it is charged with potential. The interface disappears so only the mission remains.

Key principles from the Design System v2:

- **Dark-native**: Background `#090C14`, never bright white in operational screens
- **One accent**: Teal `#0F6E56` marks interactive affordances — used sparingly
- **Amber for attention**: `#E8943A` appears only where human action is required
- **Red for critical**: `#C62828` for hard limit breaches and emergency states only
- **Monospace for data**: All parameter names, hex values, CCSDS fields use JetBrains Mono
- **Calm Technology**: No animations on live data. Motion only on UI state transitions, never on telemetry values

## 1.6 Document Structure

| Chapter | Content |
|---|---|
| 2 | System Architecture — how frontend connects to backend |
| 3 | Finalised Tech Stack with rationale |
| 4 | Design System Implementation (tokens, components) |
| 5 | Screen Requirements — all 26 screens |
| 6 | Backend API Contracts (REST + WebSocket + gRPC-Web) |
| 7 | State Management Architecture |
| 8 | Real-Time Data Handling |
| 9 | Authentication & Security |
| 10 | Performance Requirements |
| 11 | Accessibility Requirements |
| 12 | Testing Strategy |
| 13 | Development Conventions |

---

# Chapter 2 — System Architecture & Data Flow

## 2.1 System Context

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         OPERATOR'S BROWSER                               │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │              VYUH-MCS React SPA (Vite build)                    │    │
│  │                                                                   │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │    │
│  │  │  Auth Layer   │  │  App Shell   │  │  Screen Components    │  │    │
│  │  │  (JWT + RBAC) │  │  (Sidebar,   │  │  (26 screens)         │  │    │
│  │  └──────┬────────┘  │   TopBar)    │  └────────────┬──────────┘  │    │
│  │         │           └──────────────┘               │              │    │
│  │         │                                           │              │    │
│  │  ┌──────▼───────────────────────────────────────────▼──────────┐  │    │
│  │  │                  State Layer (Zustand)                       │  │    │
│  │  │  fleetStore │ commandStore │ alarmStore │ authStore │ uiStore│  │    │
│  │  └──────────────────────────┬────────────────────────────────┘   │    │
│  │                             │                                      │    │
│  │  ┌──────────────────────────▼────────────────────────────────┐   │    │
│  │  │               API / Transport Layer                        │   │    │
│  │  │  wsClient (WebSocket)  │  apiClient (REST/Axios)           │   │    │
│  │  │  TanStack Query cache  │  grpcWebClient (gRPC-Web)         │   │    │
│  │  └──────────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────┬───────────────────────────────────┘
                                       │  HTTPS + WSS (TLS 1.3)
                                       │  JWT in Authorization header
                                       │  or WS upgrade frame
                          ┌────────────▼────────────┐
                          │    API Gateway           │
                          │  (Istio + JWT validate   │
                          │   + RBAC enforcement)    │
                          └────────────┬────────────┘
              ┌─────────────┬──────────┴──────────┬──────────────┐
              │             │                      │              │
     ┌────────▼──────┐ ┌────▼──────┐  ┌──────────▼──┐  ┌───────▼───────┐
     │  TDAE Hot     │ │  UPE      │  │  Config      │  │  Auth / IAM   │
     │  Path         │ │  (REST)   │  │  Sync (REST) │  │  Service      │
     │  (WebSocket)  │ │           │  │              │  │               │
     │  CVT updates  │ │  Commands │  │  XTCE / MIB  │  │  JWT issue    │
     │  + alarms     │ │           │  │              │  │  + RBAC       │
     └───────────────┘ └───────────┘  └──────────────┘  └───────────────┘
```

## 2.2 Connection Types

### WebSocket Connection (Primary — Real-Time Telemetry)

```
Frontend WS Client ──WSS──▶ API Gateway ──▶ TDAE Hot Path

Subscription message (client → server):
{
  "type": "subscribe",
  "satellite_ids": ["SAT-001", "SAT-002"],
  "param_filter": null    // null = all params, or ["BUS_V", "BATT_T"]
}

Telemetry push (server → client, continuous):
{
  "type": "telemetry",
  "sat_id": "SAT-001",
  "param_id": "BUS_VOLTAGE_1",
  "eu_value": 28.4,
  "unit": "V",
  "alarm_state": 0,       // 0=nominal, 1=warning, 2=critical
  "quality": 0,           // 0=fresh, 1=stale
  "timestamp_utc": "2026-06-01T14:32:45.123Z"
}

Alarm push (server → client, event-driven):
{
  "type": "alarm",
  "sat_id": "SAT-001",
  "param_id": "BATT_TEMP_1",
  "alarm_state": 2,
  "eu_value": 85.3,
  "limit_hi_soft": 75.0,
  "limit_hi_hard": 85.0,
  "unit": "degC",
  "timestamp_utc": "..."
}

Contact window event:
{
  "type": "contact",
  "sat_id": "SAT-001",
  "status": "AOS",
  "ground_station": "KSAT-Svalbard",
  "aos_utc": "...",
  "los_utc": "..."
}
```

### REST API (Commands, Config, Auth, Historical Data)

```
Base URL: https://api.vyuh-mcs.akashaveda.com/v1

Auth:     Authorization: Bearer <JWT>
Format:   Content-Type: application/json

Key endpoints:
POST   /auth/login              → { access_token, refresh_token, role }
POST   /auth/refresh            → { access_token }
POST   /commands/execute        → { command_id, status }
GET    /telemetry/current/{sat} → full CVT snapshot for satellite
GET    /telemetry/history       → historical time-range query
GET    /satellites              → fleet registry
GET    /procedures              → procedure library
POST   /playback/sessions       → start time-machine session
GET    /anomalies               → AI anomaly feed
GET    /contact-windows         → FDS pass schedule
GET    /audit-log               → command audit records
```

### gRPC-Web (Binary Streaming — optional, for AI data export)

```
Service: TelemetryExport
Method:  StreamBatchExport(ExportRequest) returns (stream ExportChunk)
Use case: AI training data download — large Parquet files
```

## 2.3 Complete Data Flow — Telemetry Path

```
Spacecraft
    │ RF Downlink
    ▼
Ground Station (SLE RAF)
    │ SLE over TCP/IP
    ▼
GS Adapter (vyuh-integration namespace)
    │ Kafka: telemetry.raw.frames
    ▼
TFPE (Frame Sync → CRC → VCID Demux → Packet Extract)
    │ Kafka: telemetry.packet.extracted
    ▼
TPPP (APID Route → Decommutation → EU Conversion → Limit Check)
    │ Kafka: telemetry.parameter.processed
    ▼
TDAE Hot Path ──────────────────────────────────────── TDAE Cold Path
    │                                                       │
    ├── Redis CVT (cvt:{sat}:{param})                       ├── TimescaleDB (0–30d)
    │                                                       │
    ├── WebSocket fan-out ──────────────────────────────────├── S3 Parquet (30d+)
    │       │                                               │
    │       ▼                                               └── AI Batch API
    │   Frontend WS Client
    │       │
    │       ▼
    │   wsClient.onMessage()
    │       │
    │       ▼
    │   fleetStore.updateParam(sat_id, param_id, value)
    │       │
    │       ▼
    │   React Component re-render (only subscribed params)
    │       │
    │       ▼
    └── Operator sees updated value on dashboard
```

## 2.4 Complete Data Flow — Command Path

```
Operator clicks "Execute" in TC Dashboard (04.1)
    │
    ▼
Frontend validates locally (all required params present, types correct)
    │
    ▼
POST /v1/commands/execute  {procedure_id, satellite_id, params, operator_jwt}
    │
    ▼
API Gateway (JWT validate + RBAC: MissionController role required)
    │
    ▼
UPE Service
    │
    ├── Priority Queue (P1 Emergency → P4 Background)
    ├── Sequence Engine (procedure script execution)
    ├── TM Gate check (poll Redis CVT for WAIT conditions)
    ├── MIB translate (XTCE command template lookup)
    ├── EU→DN encoding (reverse calibration)
    ├── CCSDS TC Packet Gen (APID + sequence count via etcd)
    └── AES-256 encrypt → Kafka: uplink.packet.ready
              │
              ▼
            UTFE
              │
              ├── TC Transfer Frame generation (SCID + VCID)
              ├── COP-1 sequence management
              ├── CLTU encapsulation
              └── SLE F-CLTU → Ground Station → Spacecraft
                                    │
                                    ▼ (CLCW feedback in downlink)
                            TFPE extracts CLCW
                                    │
                                    ▼
                            TPPP publishes CLCW event
                                    │
                                    ▼
                            TDAE → WebSocket push to frontend
                                    │
                                    ▼
                            commandStore.updateACK(cmd_id, status)
                                    │
                                    ▼
                            TC Dashboard step shows ACK'd ✓
```

## 2.5 Deployment Architecture (Frontend)

```
Source code (GitHub)
    │ CI/CD (GitHub Actions)
    ▼
npm run build → dist/ (static assets)
    │
    ▼
S3 Bucket (AWS GovCloud / Azure Government)
    │
    ▼
CloudFront CDN (HTTPS, TLS 1.3, HSTS)
    │
    ▼
Operator's Browser (Chrome 120+, Edge 120+, Firefox 120+)
```

**Environment Variables (managed via AWS Secrets Manager / Azure Key Vault):**

```env
VITE_API_BASE_URL=https://api.vyuh-mcs.akashaveda.com/v1
VITE_WS_URL=wss://ws.vyuh-mcs.akashaveda.com/v1/telemetry/stream
VITE_AUTH_ISSUER=https://auth.vyuh-mcs.akashaveda.com
VITE_SENTRY_DSN=<dsn>
VITE_ENVIRONMENT=production
```

---

# Chapter 3 — Finalised Tech Stack

## 3.1 Core Framework

| Layer | Technology | Version | Rationale |
|---|---|---|---|
| Framework | **React** | 18.3+ | Concurrent features, Suspense, `useTransition` for non-blocking telemetry updates |
| Build Tool | **Vite** | 5.x | Sub-100ms HMR, native ESM, fastest cold start. Critical for DX on large component tree |
| Language | **TypeScript** | 5.x | Strict mode. Every prop, store slice, and API response typed. Eliminates whole class of runtime bugs in safety-critical UI |
| Router | **TanStack Router** | 1.x | Type-safe routes, file-based routing, deep-link support per screen (every screen needs a shareable URL) |

> **Why TanStack Router over React Router v6?**  
> TanStack Router provides full TypeScript inference on route params and search params. Since every satellite health screen and parameter view is deep-linked (`/satellites/SAT-001/parameters/BUS_VOLTAGE_1`), type-safe URL params eliminate a category of runtime error. React Router v6 requires manual typing.

## 3.2 State Management

| Concern | Technology | Why |
|---|---|---|
| Global UI state (fleet, commands, alarms, auth) | **Zustand** 4.x | Zero boilerplate. Slice-based stores. `subscribeWithSelector` for fine-grained telemetry subscriptions |
| Server state / REST API caching | **TanStack Query** 5.x | Stale-while-revalidate, automatic background refetch, devtools. Handles historical queries, procedure library, fleet registry |
| Real-time telemetry (WebSocket) | **Custom `useWebSocket` hook** + Zustand | WS push goes directly into Zustand store. TanStack Query not used for WS — it's a push channel, not a request/response channel |
| Form state | **React Hook Form** 7.x + **Zod** 3.x | Typed forms with Zod schema validation. Used in Command Sandbox, Procedure Editor, all config forms |

### Zustand Store Architecture

```typescript
// src/store/useFleetStore.ts
interface FleetStore {
  satellites: Record<string, Satellite>;        // keyed by sat_id
  cvt: Record<string, Record<string, Param>>;   // cvt[sat_id][param_id]
  contactWindows: ContactWindow[];
  activePasses: Pass[];

  // Actions
  updateParam: (sat_id: string, param_id: string, param: Param) => void;
  setContactStatus: (sat_id: string, status: 'AOS' | 'LOS') => void;
  addSatellite: (sat: Satellite) => void;
}

// src/store/useAlarmStore.ts
interface AlarmStore {
  active: Alarm[];
  acknowledged: Alarm[];
  addAlarm: (alarm: Alarm) => void;
  acknowledgeAlarm: (alarm_id: string) => void;
}

// src/store/useCommandStore.ts
interface CommandStore {
  queue: Command[];
  history: CommandRecord[];
  activeProcedure: Procedure | null;
  executionState: 'idle' | 'executing' | 'pending_ack' | 'complete' | 'aborted';
  addToQueue: (cmd: Command) => void;
  updateStep: (step_id: string, status: StepStatus) => void;
  setExecutionState: (state: ExecutionState) => void;
}
```

## 3.3 Styling

| Technology | Version | Role |
|---|---|---|
| **CSS Custom Properties** (vanilla CSS) | — | All design tokens as CSS vars. Zero runtime overhead. Exact match to design spec |
| **CSS Modules** | — | Component-scoped styles for complex components |
| **Tailwind CSS** | 4.x | Utility classes for layout, spacing, responsive. Do NOT use Tailwind for color (use tokens instead) |
| **shadcn/ui** | latest | Headless, accessible component primitives: Dialog, Dropdown, Select, Tooltip, Command palette. Custom-styled to match VYUH design system |

> **Why CSS Custom Properties for tokens, not Tailwind theme?**  
> The design token system is already defined with 40+ tokens. Mapping them to both a Tailwind config AND CSS vars creates a maintenance split. CSS Custom Properties are native to the browser, have zero runtime overhead, and are accessible in JS via `getComputedStyle`. Tailwind is used only for layout utilities.

### Token Implementation

```css
/* src/styles/tokens.css */
:root {
  /* Neutrals */
  --neutral-900: #090C14;
  --neutral-800: #0D1828;
  --neutral-700: #131E30;
  --neutral-600: #1E2535;
  --neutral-500: #2A3349;
  --neutral-400: #3A4A60;
  --neutral-300: #505A70;
  --neutral-200: #99A3BC;  /* Text secondary — WCAG AA verified */
  --neutral-50:  #F0F4FF;  /* Text primary */

  /* Brand */
  --brand-navy: #0D1B4B;
  --brand-blue: #1A3A7C;

  /* Action */
  --action-primary: #0F6E56;
  --action-hover:   #1A8A6E;
  --action-active:  #0B5443;
  --info:           #4A9EFF;
  --warning:        #E8943A;
  --danger:         #C62828;
  --success:        #4CAF81;

  /* Semantic aliases */
  --color-bg-canvas:    var(--neutral-900);
  --color-bg-surface:   var(--neutral-800);
  --color-bg-elevated:  var(--neutral-700);
  --color-bg-overlay:   var(--neutral-600);
  --color-border:       var(--neutral-500);
  --color-text-primary: var(--neutral-50);
  --color-text-secondary: var(--neutral-200);
  --color-text-disabled: var(--neutral-300);

  /* Spacing (4px base) */
  --sp-1: 4px;   --sp-2: 8px;   --sp-3: 12px;  --sp-4: 16px;
  --sp-5: 24px;  --sp-6: 32px;  --sp-7: 48px;  --sp-8: 64px;

  /* Radius */
  --r-2: 2px; --r-4: 4px; --r-6: 6px; --r-8: 8px; --r-12: 12px; --r-full: 9999px;

  /* Motion */
  --duration-fast: 100ms;
  --duration-base: 180ms;
  --duration-slow: 280ms;
  --ease-standard:  cubic-bezier(0.2, 0, 0, 1);
  --ease-accelerate: cubic-bezier(0.3, 0, 1, 1);
  --ease-linear: linear;  /* Always use for live data motion */
}
```

## 3.4 Charts & Data Visualisation

| Chart Type | Library | Why |
|---|---|---|
| **Time-series telemetry** (Parameter Detail, Predictive Health) | **uPlot** 1.x | 166k data points in 25ms cold start. Canvas-based. Best performance for live telemetry. Scales linearly. Critical for 500-param real-time view |
| **Fleet heatmap** (Constellation Overview) | **D3.js** 7.x (custom) | Pixel-level control over the satellite×subsystem grid. No charting library has this as a first-class primitive |
| **Sparklines** (Parameter Cards) | **Recharts** 2.x | Simple, SVG, React-native. Acceptable for 64px thumbnail charts where performance is not critical |
| **Orbital world map** (Constellation Overview) | **Leaflet** 1.x + **react-leaflet** | Dark tile layer (CartoDB Dark Matter). Custom satellite marker components |
| **AI anomaly confidence** (05.1) | **Recharts** 2.x | Horizontal bar charts, timeline views — within Recharts' strengths |
| **RUL forecast curve** (05.2) | **uPlot** | Long-range forecast with confidence band — needs performance |
| **Playback timeline scrubber** | Custom CSS + D3 scale | Full control over timeline interaction with event markers |

> **Why uPlot over Recharts for primary telemetry?**  
> A single satellite pass at 1 Hz with 500 parameters generates 27,000 data points in 45 minutes. With 10 satellites in view simultaneously, the Parameter Detail chart could be rendering 270,000 points. Recharts (SVG) degrades below 10k points. uPlot handles this natively and is the only React-compatible library that does.

## 3.5 Real-Time & Networking

| Concern | Technology | Notes |
|---|---|---|
| WebSocket management | **Custom hook** (`useWebSocket`) + `react-realtime-hooks` pattern | Auto-reconnect with exponential backoff. Heartbeat ping/pong. Visibility API pause on tab hide |
| REST client | **Axios** 1.x | Interceptors for JWT injection + refresh. Request cancellation via AbortController |
| Query caching | **TanStack Query** 5.x | All REST calls. 60s stale time for fleet registry, 0s for commands |
| Message schema | **Zod** 3.x | Parse every incoming WS message and REST response. Unknown shape → discard + log to Sentry |

### WebSocket Hook Pattern

```typescript
// src/hooks/useWebSocket.ts
interface UseWebSocketOptions {
  url: string;
  onMessage: (msg: WSMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  reconnectDelay?: number;   // default: 1000ms, doubles on each failure (max 30s)
  heartbeatInterval?: number; // default: 30s
}

export function useWebSocket(options: UseWebSocketOptions) {
  // - Manages connection lifecycle
  // - Exponential backoff reconnect
  // - Page visibility API: pauses heartbeat on hidden, reconnects on visible
  // - Returns: { connectionState, send, disconnect }
}
```

## 3.6 Authentication

| Technology | Role |
|---|---|
| **JWT** (RS256) | Access token in memory (NOT localStorage). Refresh token in httpOnly cookie |
| **Axios interceptor** | Attaches `Authorization: Bearer <token>` to every request. Handles 401 → refresh → retry |
| **WS auth** | JWT sent in first WebSocket message frame (post-upgrade). Not in URL params (security) |
| **React context** | `AuthContext` provides `user`, `role`, `permissions` to all components |
| **Route guards** | TanStack Router `beforeLoad` hook checks auth state before rendering protected routes |

## 3.7 Supporting Libraries

| Library | Version | Use |
|---|---|---|
| **date-fns** | 3.x | All UTC formatting. `formatUTC`, `parseISO`. No moment.js |
| **Lucide React** | latest | UI icons — consistent 24px SVG set |
| **Framer Motion** | 11.x | Used ONLY for: modal enter/exit, drawer slide, page transitions. NEVER on telemetry data |
| **react-aria** (Adobe) | 3.x | ARIA live regions for alarm announcements. Focus management for modals |
| **Sentry** | 8.x | Error tracking + performance monitoring (Web Vitals) |
| **Vitest** | 2.x | Unit tests (collocated with components) |
| **Playwright** | 1.x | E2E tests for critical flows: login, command execute, alarm acknowledge |
| **Storybook** | 8.x | Component development and design review |

## 3.8 Complete package.json Dependencies

```json
{
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@tanstack/react-router": "^1.x",
    "@tanstack/react-query": "^5.x",
    "zustand": "^4.x",
    "axios": "^1.x",
    "zod": "^3.x",
    "react-hook-form": "^7.x",
    "@hookform/resolvers": "^3.x",
    "uplot": "^1.x",
    "recharts": "^2.x",
    "d3": "^7.x",
    "leaflet": "^1.x",
    "react-leaflet": "^4.x",
    "framer-motion": "^11.x",
    "lucide-react": "latest",
    "date-fns": "^3.x",
    "@radix-ui/react-dialog": "latest",
    "@radix-ui/react-dropdown-menu": "latest",
    "@radix-ui/react-select": "latest",
    "@radix-ui/react-tooltip": "latest",
    "@radix-ui/react-tabs": "latest",
    "@radix-ui/react-toast": "latest",
    "@adobe/react-spectrum": "^3.x",
    "@sentry/react": "^8.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "vite": "^5.x",
    "@vitejs/plugin-react": "latest",
    "tailwindcss": "^4.x",
    "vitest": "^2.x",
    "@testing-library/react": "^16.x",
    "@testing-library/user-event": "latest",
    "playwright": "^1.x",
    "@storybook/react-vite": "^8.x",
    "eslint": "^9.x",
    "prettier": "^3.x"
  }
}
```

## 3.9 Project Folder Structure

```
vyuh-mcs/
├── public/
│   ├── favicon.svg
│   └── manifest.json
├── src/
│   ├── styles/
│   │   ├── tokens.css          ← All design tokens as CSS custom properties
│   │   ├── typography.css      ← Type scale utility classes
│   │   ├── reset.css
│   │   └── global.css
│   ├── components/
│   │   ├── atoms/
│   │   │   ├── Badge/          ← StatusBadge (NOMINAL/WARNING/CRITICAL/AOS/LOS/PENDING)
│   │   │   ├── Button/         ← 6 variants × 5 states
│   │   │   ├── Icon/
│   │   │   ├── Spinner/
│   │   │   └── Tooltip/
│   │   ├── molecules/
│   │   │   ├── InputField/     ← Default/Focus/Error/Disabled
│   │   │   ├── LimitBar/       ← Visual EU value vs soft/hard limits
│   │   │   ├── MetricValue/    ← Value + unit + status color
│   │   │   ├── Sparkline/      ← 64px Recharts thumbnail
│   │   │   └── ParameterRow/   ← Name + value + unit + sparkline + badge
│   │   ├── organisms/
│   │   │   ├── Sidebar/        ← Navigation (240px / 60px collapsed)
│   │   │   ├── TopBar/         ← Satellite selector + AOS/LOS + alerts
│   │   │   ├── ParameterCard/  ← Full parameter card with chart
│   │   │   ├── MetricCard/     ← KPI summary card
│   │   │   ├── AlarmPanel/     ← Active alarm list
│   │   │   ├── CLCWRegister/   ← Live CLCW bit display
│   │   │   ├── CommandStep/    ← Single procedure step row
│   │   │   ├── DataTable/      ← Sortable/filterable table
│   │   │   ├── uPlotChart/     ← uPlot wrapper for time-series
│   │   │   ├── Heatmap/        ← D3 satellite×subsystem grid
│   │   │   └── OrbitalMap/     ← Leaflet constellation map
│   │   └── layout/
│   │       ├── AppShell/       ← Sidebar + TopBar + content area
│   │       ├── Modal/          ← Radix Dialog + Framer Motion
│   │       ├── Drawer/         ← Right-side detail drawer (480px)
│   │       └── Toast/          ← Radix Toast for notifications
│   ├── screens/                ← One file per screen
│   │   ├── landing/            ← 01.1–01.3
│   │   ├── auth/               ← 02.1–02.4
│   │   ├── telemetry/          ← 03.1–03.4
│   │   ├── commanding/         ← 04.1–04.4
│   │   ├── analytics/          ← 05.1–05.3
│   │   ├── mission/            ← 06.1–06.3
│   │   ├── config/             ← 07.1–07.3
│   │   └── admin/              ← 08.1–08.3
│   ├── store/
│   │   ├── useFleetStore.ts
│   │   ├── useCommandStore.ts
│   │   ├── useAlarmStore.ts
│   │   ├── useAuthStore.ts
│   │   └── useUIStore.ts
│   ├── hooks/
│   │   ├── useWebSocket.ts     ← WS lifecycle + reconnect
│   │   ├── useTelemetry.ts     ← Subscribe to specific params from CVT
│   │   ├── useAlarms.ts        ← Alarm stream + acknowledgment
│   │   ├── useCommand.ts       ← Execute + poll ACK status
│   │   └── useKeyboard.ts      ← Global keyboard shortcuts
│   ├── api/
│   │   ├── client.ts           ← Axios instance + interceptors
│   │   ├── auth.api.ts
│   │   ├── telemetry.api.ts
│   │   ├── commands.api.ts
│   │   ├── fleet.api.ts
│   │   └── analytics.api.ts
│   ├── schemas/                ← Zod schemas for all API shapes
│   │   ├── telemetry.schema.ts
│   │   ├── command.schema.ts
│   │   └── alarm.schema.ts
│   ├── utils/
│   │   ├── formatUTC.ts        ← Always UTC, never local time
│   │   ├── statusUtils.ts      ← NOMINAL/WARNING/CRITICAL → token mapping
│   │   └── formatBytes.ts
│   ├── router/
│   │   └── routes.ts           ← All TanStack Router route definitions
│   ├── App.tsx
│   └── main.tsx
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

# Chapter 4 — Screen Requirements (All 26 Screens)

> **Frame:** 1440×900 (primary) · 1920×1080 (wide monitor optional)  
> **Shell:** Every screen inside auth uses AppShell (240px sidebar + 52px topbar + content area)  
> **URL pattern:** `/flow/screen-id` — all deep-linkable, shareable

---

## Flow 01 — Landing & Marketing (3 screens)

### 01.1 Product Landing Page `/`
**Purpose:** First impression. Communicate what VYUH-MCS does, drive demo request.  
**Layout:** Full-width sections, sticky nav bar, light-mode optional  
**Required content:**
- Hero: wordmark + tagline + primary CTA "Request a Demo" + secondary "View Architecture"
- Feature strip: 3 columns (TM Processing / C&C / AI Health)
- Social proof bar: partner logos
- Feature deep-dives: alternating left/right sections with product screenshots
- Footer: links + compliance notice (ITAR)

**States:** Default · CTA hover · Demo modal open

---

### 01.2 Feature Deep-Dive `/features/:module`
**Purpose:** Technical evaluators — expanded capability per module  
**Modules:** telemetry · commanding · ai-analytics · mission-planning  
**Required content:** Module heading · architecture diagram · capability list · tech spec table · screenshots · CTA

---

### 01.3 Contact / Demo Request `/contact`
**Purpose:** Lead capture form  
**Required fields:** Name · Job Title · Organisation · Email · Constellation size (dropdown) · Message  
**States:** Default · Field validation errors (inline, red border) · Submitting (spinner) · Success (inline confirmation, no redirect)  
**Microcopy:** "We'll reach out within one business day." — never generic "Email sent!"

---

## Flow 02 — Authentication (4 screens)

> All auth screens: centered card on `bg-01`, no sidebar, no topbar, logo centred top.

### 02.1 Login `/login`
**Required content:**
- VYUH-MCS logotype
- Email input + Password input (show/hide toggle)
- "Forgot password?" link (below password, right-aligned)
- Primary CTA: "Sign In" (full-width)
- Divider + SSO buttons (Okta, Azure AD — configurable per deployment)

**States:**
- Default
- Loading: button shows spinner, fields disabled
- Error: "Invalid email or password" — danger banner above form, fields retain value (not cleared)
- Session expired: pre-filled email, amber banner "Your session has expired. Sign in again."

**Behaviour:** Enter key submits. JWT stored in memory, refresh token in httpOnly cookie.

---

### 02.2 Multi-Factor Auth `/login/mfa`
**Required content:**
- Heading: "Two-step verification"
- 6-digit OTP input (monospaced JetBrains Mono, large touch targets)
- Live countdown timer: "Expires in 04:32" (ease-linear — never ease time)
- "Resend code" link (disabled until countdown expires)
- "Back to sign in" link

**States:** Default · Wrong code (danger, "2 attempts remaining") · Expired (timer hits 0:00, fields grey out, resend activates)

---

### 02.3 Role Selection `/login/role`
**Purpose:** Shown only for multi-role users. Sets RBAC scope for the session.  
**Required content:**
- Heading: "Select your role for this session"
- Role cards grid (2-col): Role name · Scope description · Access level badge
- Roles: Mission Controller · Flight Engineer · RF Engineer · Payload Engineer · Mission Designer · System Administrator
- CTA: "Continue"

**States:** Default (no selection) · Selected (teal 2px border + `action-subtle` fill on card)

---

### 02.4 Password Reset `/login/reset`
**Steps (inline state machine, no page navigation):**
1. Email input + "Send reset link"
2. Confirmation: "Check your inbox — link expires in 15 minutes"
3. New password form (with strength meter) + confirm
4. Success: "Password updated — Sign in now"

---

## Flow 03 — Telemetry Monitoring (4 screens)

### 03.1 Constellation Overview `/constellation`
**Purpose:** Fleet situational awareness. Most-opened screen.  
**Layout:** 3-panel — satellite list (280px) · orbital map (flex) · pass details (280px, collapsible)

**Required content:**
- **Orbital map:** Dark Leaflet map (CartoDB Dark Matter tile). Satellite positions as animated dots. Ground tracks as arc overlays. Ground station markers with coverage cones.
- **Fleet KPI bar** (top): Nominal count · Warning count · Critical count · Active passes · Pending commands
- **Satellite status grid:** StatusBadge per satellite, grouped by constellation plane
- **Active pass panel** (right): AOS satellites with GS name + LOS countdown (UTC)
- **Subsystem heatmap:** rows = subsystems, cols = satellites, cells = health colour

**Real-time behaviour:**
- WebSocket subscription: all satellites, all params
- CVT updates → `fleetStore.updateParam()` → React re-render
- AOS event → satellite dot pulses (180ms ease-standard) → pass panel updates
- CRITICAL alarm → red pulsing badge at ≤1Hz (CSS animation, not JS timer)

**Performance:** With 100 satellites, heatmap = 100 × 6 = 600 cells. D3 canvas, not SVG. Re-render budget: <16ms.

---

### 03.2 Satellite Health Dashboard `/satellites/:satId`
**Purpose:** Full telemetry view for one satellite.  
**URL example:** `/satellites/SAT-001`

**Layout:** TopBar with satellite context · tabbed content area · alarm panel (right, 280px, collapsible)

**Required content:**
- **Context bar:** Satellite ID · Orbit regime · AOS/LOS badge · Next contact UTC · "Send Command" shortcut button
- **Subsystem tabs:** POWER · ADCS · THERMAL · COMMS · PAYLOAD · OBC
- **Per-tab:** grid of ParameterCard components
- **Each ParameterCard:** parameter mnemonic (Code) · current EU value + unit · StatusBadge · LimitBar · 64px Recharts sparkline · "last updated HH:MM:SS UTC"
- **Alarm panel:** active alarms sorted severity-first · acknowledge button · "View in AI" link

**Real-time behaviour:**
- Subscribe to `satellite_ids: [satId]`
- useTelemetry(satId) hook → provides param values from fleetStore
- Stale detection: if `quality === 1` OR `Date.now() - timestamp > 10000ms` → apply stale styling

**Stale styling:** Value in `neutral-400`. "Last: HH:MM:SS UTC" replaces live indicator. LimitBar greyed.

---

### 03.3 Parameter Detail View `/satellites/:satId/parameters/:paramId`
**Purpose:** Deep analysis of one parameter.  
**URL example:** `/satellites/SAT-001/parameters/BUS_VOLTAGE_1`

**Layout:** Full-width chart (no sidebar panels) · info row below chart

**Required content:**
- **Identity header:** Breadcrumb · Parameter mnemonic (Code teal, 20px) · Full name · Unit · Current value (Display 32px, status-coloured)
- **uPlot time-series chart:**
  - Y-axis: engineering unit values with limit lines (warning = amber dashed, hard = danger dashed)
  - X-axis: UTC timestamps
  - Shaded limit bands at 12% opacity
  - Live update via WebSocket push
- **Time range selector:** 1h / 6h / 24h / Pass / 7d / Custom (tabs above chart)
- **Stats panel:** Min · Max · Mean · Std Dev · Trend slope — for selected time range
- **Calibration panel** (collapsible): raw DN · EU conversion equation · curve type
- **Alarm history table:** timestamp · severity · value · duration · resolution

**Chart performance:** uPlot. 24h at 1Hz = 86,400 points. Must render in <100ms.

---

### 03.4 Pass Playback `/playback`
**Purpose:** Replay historical passes. Post-pass analysis, training, anomaly investigation.

**Required content:**
- Amber top banner: "PLAYBACK MODE — Not Live Data" (always visible, cannot be dismissed while in playback)
- Pass selector: satellite + ground station + date/time UTC
- Speed control: 1× · 5× · 10× · 50× (selector)
- Scrubber: full pass timeline. Draggable. AOS/LOS markers. Alarm event markers (colour-coded).
- Parameter overlay: select up to 6 params to show simultaneously
- Main content: same layout as 03.2 but driven by playback position

**States:** Playing · Paused · Seeking (drag scrubber) · Pass ended (summary card + "AI Triage" link)

**Chart motion:** ease-linear throughout. Time must feel proportional.

---

## Flow 04 — Command & Control (4 screens)

### 04.1 TC Dashboard `/commanding`
**Purpose:** Primary command execution workspace. Most critical screen.

**Layout:** 3-panel — procedure library (280px) · execution canvas (flex) · CLCW + controls (240px)

**Procedure library panel:**
- Search input (filters by name/tag)
- List: name · version · category · "last executed UTC"
- Category groups: Safe Mode · Housekeeping · Payload Ops · Maintenance · Emergency

**Execution canvas:**
- Loaded procedure name + version (breadcrumb)
- Execution mode selector: CONTINUOUS · STEP-BY-STEP · BREAKPOINT (toggle group)
- Step list: step # · mnemonic (Code) · params summary · StatusBadge (QUEUED/SENT/ACK'D/NACK'D/COMPLETE)
- Active step: teal left border + subtle highlight row
- Execution log (collapsible bottom): raw command bytes (hex) + CLCW responses

**CLCW register panel:**
- Live CLCW display: Report Value · Farm-B Counter · LOCKOUT · WAIT · RETRANSMIT (bit indicators, danger-coloured when set)
- Queue depth + estimated uplink time

**Controls:**
- EXECUTE (Primary, large) — disabled until pre-check passes
- STEP (Blue secondary) — only in STEP-BY-STEP mode
- ABORT (Danger, large) — always enabled once executing
- FORCE CONTINUE (Amber) — override stalled WAIT; requires MissionController role; logs `forced_continue` event

**Two-person rule:** For designated P1 procedures — "Execute" shows "Awaiting co-authorisation" indicator. Second user's confirmation appears as a live status, not a tooltip.

**States:** Idle · Loaded · Executing (steps updating) · Pending ACK · NACK received (execution pauses, warning modal) · LOS during execution (amber banner, execution pauses) · Complete · Aborted

---

### 04.2 Procedure Editor `/procedures/:procedureId/edit`
**Purpose:** Authoring environment for command procedures.

**Tabs:** Script · Visual · Validation

**Script tab:**
- Monaco-based code editor (syntax highlighting for procedure DSL)
- Line numbers · error gutter icons · bracket matching
- Command palette: searchable MIB commands, drag to insert
- Save Draft (Ghost) · Publish v[n] (Primary — requires confirmation)

**Visual tab:** Drag-drop flowchart. Each command = box. WAIT = diamond. IF/ELSE = branching. Edit params in right panel.

**Validation tab:** Run against current satellite's command dictionary. Shows: errors count + list with line numbers + suggested fixes.

**States:** New (empty) · Existing (with version history dropdown) · Syntax error (inline) · Test mode active (amber banner "TEST MODE — commands NOT uplinked")

---

### 04.3 Command Sandbox `/commanding/sandbox`
**Purpose:** Single ad-hoc command builder with full byte transparency.

**Required content:**
- Satellite selector
- Command search (autocomplete from MIB — mnemonic + name + APID)
- Dynamic parameter form: each param = typed input + valid range + unit suffix
- Out-of-range blocking: danger border on field + tooltip, Send button disabled
- Byte preview panel: hex CCSDS frame, updates live as params change
- Send button: "Uplink Command" (Primary, large)

**Confirmation dialog (always shown):**
- Command name in Code style
- Final parameter summary table
- "Type CONFIRM to proceed" text input
- Cancel is default focused button — not Send
- Audit note: logged as `manual_injection`

---

### 04.4 Command Queue Monitor `/commanding/queue`
**Purpose:** Real-time view of the command queue, pending ACKs, retransmission state.

**Required content:**
- Stats row: Queue depth · Active V(S) per satellite · Last ACK UTC · Active UTFE connections
- Queue table: Priority badge · Command name · Target satellite · Queued UTC · Status · Operator
- P1 rows: red row background
- P2 rows: amber row background
- Row actions: Reprioritise · Cancel
- Retransmission monitor (expandable): frames in COP-1 retx buffer — Frame # · Sent UTC · Retry count · Status

---

## Flow 05 — AI Analytics (3 screens)

### 05.1 Anomaly Detection Dashboard `/analytics/anomalies`
**Layout:** Left feed (60%) · Right heatmap (40%)

**Anomaly feed:**
- Newest-first scrollable list
- Each entry: timestamp UTC · satellite ID · subsystem · parameter · confidence score (%) · anomaly type (point/trend/contextual) · severity badge
- Filter bar: satellite · subsystem · confidence threshold · date range
- Click entry → expands inline chart of anomalous parameter window

**Subsystem heatmap:**
- Rows = satellites (or groups) · Columns = subsystems
- Cell = max anomaly severity (green/amber/red)
- Click cell → filters feed to that satellite+subsystem

**Model info footer:** Last model update UTC · Model version · Training data range

---

### 05.2 Predictive Health `/analytics/health/:satId`
**Subsystem tabs:** Battery · Reaction Wheels · Solar Panels · Propulsion

**Per-subsystem content:**
- Health score gauge (0–100%, colour zones: green 60–100 · amber 30–60 · red 0–30)
- RUL display: "Estimated remaining life: 847 days" (Display-size, Space Grotesk)
- Confidence interval: "720–980 days (90% CI)"
- uPlot forecast chart: historical health (solid line) + projected degradation (dashed) + 90% CI band (shaded) + alert threshold (horizontal red dashed)
- Contributing factors: bar chart of top contributing parameters
- AI recommendation (plain-English prose summary, Code-italic style)

---

### 05.3 Fleet Trend Analysis `/analytics/trends`
**Required content:**
- Multi-satellite selector + parameter selector
- uPlot multi-line chart (one line per satellite, same parameter)
- Outlier highlight: satellites >2σ from fleet mean → labelled + coloured distinctly
- Fleet stats panel: Mean · Std Dev · Min · Max for selected range
- Export button: "Export dataset (CSV / Parquet)" — rate-limited 10 req/min, async job

---

## Flow 06 — Mission Planning (3 screens)

### 06.1 Contact Windows & Schedule `/mission/schedule`
**Layout:** Timeline (full width) · Satellite filter (left 240px, collapsible)

**Timeline:**
- X-axis: time (24h default, zoom to 6h/72h)
- Y-axis: satellites (one row each, or grouped by constellation)
- Pass bars: colour = ground station. Width = duration. Label: elevation + data rate
- Current time: vertical red line
- Hover: popup with full pass details
- Click bar: right drawer with detailed pass metadata + schedule override button

---

### 06.2 Payload Tasking `/mission/payload`
**Layout:** Task queue (left 320px) · Task detail (center) · Map preview (right 240px)

**Task queue:** List with priority badge · task type icon · target satellite · status badge
**Task detail:**
- Target: coordinates · imaging mode · resolution · cloud coverage limit
- Timing constraints: earliest/latest start · preferred pass
- Feasibility check result (AI-generated): "SAT-003 via KSAT at 14:32 UTC — 92% feasibility"
- Generated TC procedure preview (collapsible)
- Approval workflow: SUBMIT → REVIEW → APPROVED → SCHEDULED (with role-gated buttons)

---

### 06.3 Activity Planner `/mission/planner`
**Timeline drag-drop builder:**
- Horizontal timeline (same base as 06.1)
- Activity blocks: drag to reschedule, drag edges to resize, click to edit
- Colour coding: green = housekeeping · blue = payload · amber = maintenance · red = emergency-reserved
- Resource conflict detector: overlapping power-budget activities flagged in red
- Activity library panel (left): procedures to drag onto timeline
- Power budget overlay (optional): second timeline row showing estimated draw

---

## Flow 07 — Configuration (3 screens)

### 07.1 Satellite Registry `/config/satellites`
**Table:** SATID · Name · Status · Mission · Launch date · Constellation group · Last contact · Actions  
**Add/Edit Drawer (480px):** Full satellite definition form — SATID · TLE import · GS assignments · MIB link · Status toggle  
**Empty state:** Illustration + "Add your first satellite" CTA

---

### 07.2 MIB / XTCE Manager `/config/mib/:satId`
**Three tabs:**
1. **Telemetry Dictionary:** APID · Parameter name · Offset · Bit length · Data type · Calibration curve · Limits · Units. Upload new XTCE file. Version history with diff view + rollback.
2. **Command Database:** Command name · Service/Subtype · APID · Parameters. Import from MIB.
3. **Calibration Tables:** Satellite · Parameter · Curve type · Coefficients · Graph preview. Inline edit.

**Version mismatch warning:** "Flight software v2.3 detected — dictionary validated for v2.2. Verify before commanding." (amber banner, cannot be dismissed without acknowledgement)

---

### 07.3 Alarm Threshold Manager `/config/alarms/:satId`
**Table:** Parameter · Unit · Current value · Soft low/high · Hard low/high · Mode context · Status  
**Inline editing:** Click any limit cell → edits in place  
**Alarm preview chart:** Mini uPlot below the row showing 24h history with NEW limit lines drawn — "this threshold would have fired N times in the last 24h"  
**Mode context:** Support per-operational-mode limits (SCIENCE vs SAFE_MODE vs ECLIPSE)  
**Save flow:** Unsaved rows → amber highlight + "Unsaved changes" sticky banner → Save All / Discard

---

## Flow 08 — Admin & Audit (3 screens)

### 08.1 User & RBAC Management `/admin/users`
**Table:** Name · Email · Roles · Last login · Status · 2FA enabled · Actions  
**User detail drawer:** Role assignments (scoped per satellite) · 2-person rule configuration · Session history · Revoke all sessions  
**Invite flow:** Email input + role pre-assign + "Send invite" button  
**Pending users:** PENDING badge until first login

---

### 08.2 Command Audit Log `/admin/audit`
**Filter bar:** Date range picker · Satellite · Operator · Command type · Result (ACK/NACK/TIMEOUT)  
**Table (append-only, no edit):** Timestamp UTC · Operator · Satellite · Command · Params (truncated) · Procedure ID+version · Seq # · APID · Result · SHA-256 hash (12-char preview + copy button)  
**Row expand:** Full params · Complete hex bytes · Full hash · CLCW values · Round-trip latency  
**Export:** "Export filtered (CSV / JSON)" — date range required, cannot export unbounded  
**Integrity verification:** "Verify log integrity" → hash chain check → "0 anomalies" or flagged gaps

---

### 08.3 System Health `/admin/system`
**Service status grid:** One card per microservice (TFPE / TPPP / TDAE-Hot / TDAE-Cold / UPE / UTFE / Config Sync / FDS Bridge / AI Service / Key Mgmt / API Gateway)  
**Each card:** Service name · Status (RUNNING/DEGRADED/DOWN) · Replica count (current/desired) · CPU % · Memory % · Last restart UTC  
**Kafka health:** Consumer lag per topic as horizontal bar chart (green <100 · amber 100–1000 · red >1000)  
**Key metrics:** CVT write latency P99 · Command E2E latency P99 · AI inference latency P99 · DLQ depth  
**External links:** "Open Grafana" · "Open Jaeger" (new tab)  
**Incident log:** Last 5 incidents — timestamp · affected service · duration · resolution


---

# Chapter 5 — Backend API Contracts

## 5.1 Authentication API

```
POST /v1/auth/login
Body:   { email: string, password: string }
200:    { access_token: string, token_type: "Bearer", expires_in: 900, role: string, satellite_scope: string[] }
401:    { error: "INVALID_CREDENTIALS" }
429:    { error: "TOO_MANY_ATTEMPTS", retry_after: 300 }

POST /v1/auth/mfa/verify
Body:   { session_token: string, otp_code: string }
200:    { access_token: string, refresh_token: string (httpOnly cookie) }
401:    { error: "INVALID_OTP", attempts_remaining: number }
410:    { error: "OTP_EXPIRED" }

POST /v1/auth/refresh
Cookie: refresh_token (httpOnly)
200:    { access_token: string, expires_in: 900 }
401:    { error: "REFRESH_TOKEN_INVALID" }

POST /v1/auth/logout
Header: Authorization: Bearer <token>
204:    (no body)
```

## 5.2 Fleet & Satellite API

```
GET /v1/satellites
Header: Authorization: Bearer <token>
200: {
  satellites: [{
    sat_id: string,
    name: string,
    status: "ACTIVE" | "INACTIVE" | "DECOMMISSIONED",
    orbit_regime: "LEO" | "MEO" | "GEO" | "HEO",
    constellation_group: string,
    last_contact_utc: string | null,
    next_contact_utc: string | null,
    health_state: "NOMINAL" | "WARNING" | "CRITICAL" | "NO_DATA"
  }]
}

GET /v1/satellites/:sat_id
200: { ...satellite fields + tle: string, assigned_ground_stations: string[], mib_version: string }

POST /v1/satellites
Body: { sat_id, name, tle, constellation_group, ground_stations, mib_id }
Role: SystemAdministrator
201: { sat_id, created_at }
```

## 5.3 Telemetry API

```
GET /v1/telemetry/current/:sat_id
200: {
  sat_id: string,
  timestamp_utc: string,
  parameters: {
    [param_id: string]: {
      eu_value: number,
      unit: string,
      alarm_state: 0 | 1 | 2,
      quality: 0 | 1,
      timestamp_utc: string
    }
  }
}

GET /v1/telemetry/history
Query: sat_id, param_ids (comma-sep), start_utc, end_utc, resolution (raw|1m|5m|1h)
200: {
  sat_id: string,
  param_id: string,
  data: [{ timestamp_utc: string, eu_value: number, alarm_state: number }]
}

GET /v1/telemetry/batch
Query: sat_id, param_ids, start_utc, end_utc, format (csv|parquet)
Rate limit: 10 req/min per service account
200: { job_id: string, status: "queued", estimated_size_mb: number }

GET /v1/telemetry/batch/jobs/:job_id
200: { status: "complete" | "processing" | "failed", download_url: string, expires_in: 3600 }
```

## 5.4 WebSocket API (Telemetry Stream)

```
Endpoint: wss://ws.vyuh-mcs.akashaveda.com/v1/telemetry/stream

Connection flow:
1. Frontend upgrades HTTP → WebSocket
2. Frontend sends auth frame immediately:
   { "type": "auth", "token": "<JWT>" }
3. Server responds: { "type": "auth_ok", "session_id": "..." }
   OR: { "type": "auth_error", "reason": "..." } → connection closes
4. Frontend subscribes:
   { "type": "subscribe", "satellite_ids": ["SAT-001"], "param_filter": null }
5. Server streams:
   - Telemetry updates (per param, on change or every 1s max)
   - Alarm events (immediate on threshold breach)
   - Contact events (AOS/LOS)
   - CLCW updates (on command path)

Message types (server → client):
  telemetry | alarm | contact | clcw | system_health | playback_tick

Heartbeat:
  Client sends: { "type": "ping" }
  Server replies: { "type": "pong", "server_time_utc": "..." }
  Interval: 30s. If no pong in 10s → reconnect.

Reconnect policy:
  Attempt 1: 1s delay
  Attempt 2: 2s delay
  Attempt 3: 4s delay
  ...exponential up to 30s max, then linear at 30s
```

## 5.5 Command API

```
POST /v1/commands/execute
Role: MissionController | FlightEngineer (limited)
Body: {
  satellite_id: string,
  procedure_id: string,
  procedure_version: string,
  params: Record<string, unknown>,
  execution_mode: "CONTINUOUS" | "STEP_BY_STEP" | "BREAKPOINT"
}
201: { command_id: string, status: "QUEUED", queue_position: number }
403: { error: "INSUFFICIENT_ROLE" }
422: { error: "PARAM_VALIDATION_FAILED", fields: { [param]: string } }
503: { error: "SATELLITE_LOS", message: "No active contact window" }

GET /v1/commands/:command_id/status
200: {
  command_id: string,
  status: "QUEUED" | "EXECUTING" | "PENDING_ACK" | "ACK" | "NACK" | "TIMEOUT" | "ABORTED",
  steps: [{
    step_id: string,
    mnemonic: string,
    status: StepStatus,
    sent_utc: string | null,
    ack_utc: string | null
  }],
  clcw_report_value: number | null
}

DELETE /v1/commands/:command_id
Role: MissionController
Body: { reason: string }
200: { status: "ABORTED", aborted_at_step: number }

GET /v1/commands/queue/:sat_id
200: { queue: [{ command_id, priority, mnemonic, queued_utc, status, operator }] }

POST /v1/commands/sandbox
Role: MissionController
Body: { satellite_id, command_mnemonic, params, preview_only: boolean }
200: {
  hex_preview: string,       // CCSDS frame hex
  ccsds_apid: number,
  sequence_count: number,
  param_validation: { valid: boolean, errors: string[] }
}
If preview_only=false → behaves like /execute for single command
```

## 5.6 Procedures API

```
GET /v1/procedures
Query: satellite_id (optional), category
200: { procedures: [{ id, name, version, category, last_used_utc, target_satellites }] }

GET /v1/procedures/:id
200: { id, name, version, script_content, step_count, parameters_schema, author, created_utc }

POST /v1/procedures
Role: MissionDesigner
Body: { name, script_content, target_satellites, category }
201: { id, version: "1.0" }

PUT /v1/procedures/:id
Role: MissionDesigner
Body: { script_content, change_notes }
200: { id, version: "1.1" }
```

## 5.7 Contact Windows API

```
GET /v1/contact-windows
Query: satellite_ids (comma-sep), start_utc, end_utc, ground_station
200: {
  windows: [{
    window_id: string,
    sat_id: string,
    ground_station: string,
    aos_utc: string,
    los_utc: string,
    duration_seconds: number,
    max_elevation_deg: number,
    frequency_band: "S" | "X" | "Ka",
    quality_score: number   // 0-100, AI-generated
  }]
}
```

## 5.8 Anomaly / AI API

```
GET /v1/anomalies
Query: sat_id, start_utc, end_utc, min_confidence (0-1), subsystem
200: {
  anomalies: [{
    anomaly_id: string,
    sat_id: string,
    param_id: string,
    subsystem: string,
    type: "POINT" | "TREND" | "CONTEXTUAL",
    confidence: number,
    severity: "WARNING" | "CRITICAL",
    detected_utc: string,
    resolved_utc: string | null,
    description: string
  }]
}

GET /v1/health/predictive/:sat_id/:subsystem
200: {
  health_score: number,          // 0-100
  rul_days: number,
  rul_confidence_low: number,
  rul_confidence_high: number,
  alert_threshold_days: number,
  contributing_factors: [{ param_id, weight }],
  recommendation: string,        // plain-English prose
  forecast_data: [{ date, predicted_score, lower_bound, upper_bound }]
}
```

## 5.9 Admin API

```
GET /v1/admin/users
Role: SystemAdministrator
200: { users: [{ id, email, name, roles, last_login_utc, status, mfa_enabled }] }

POST /v1/admin/users/invite
Body: { email, name, role, satellite_scope }
201: { invite_id, expires_utc }

PATCH /v1/admin/users/:id
Body: { roles?, status?, satellite_scope? }
200: { updated }

GET /v1/admin/audit-log
Query: start_utc, end_utc, sat_id, operator_id, command_type, result
200: {
  records: [{
    record_id: string,
    timestamp_utc: string,
    operator_id: string,
    sat_id: string,
    command_mnemonic: string,
    procedure_id: string,
    procedure_version: string,
    sequence_count: number,
    result: "ACK" | "NACK" | "TIMEOUT",
    bytes_sha256: string,
    prev_record_sha256: string   // hash chain
  }],
  total: number
}

GET /v1/admin/audit-log/verify
200: { integrity: "VALID" | "TAMPERED", anomalies: [] }

GET /v1/admin/system-health
200: {
  services: [{
    name: string,
    status: "RUNNING" | "DEGRADED" | "DOWN",
    replicas_current: number,
    replicas_desired: number,
    cpu_pct: number,
    memory_pct: number,
    last_restart_utc: string
  }],
  kafka_lag: { [topic: string]: number },
  slos: {
    cvt_write_latency_p99_ms: number,
    command_e2e_latency_p99_ms: number,
    ai_inference_latency_p99_ms: number,
    dlq_depth: number
  }
}
```

## 5.10 Error Response Schema (All Endpoints)

```typescript
interface ApiError {
  error: string;          // Machine-readable error code (SCREAMING_SNAKE)
  message: string;        // Human-readable description
  request_id: string;     // For support / Sentry correlation
  timestamp_utc: string;
  details?: unknown;      // Additional context (validation errors, etc.)
}

// Common HTTP status codes:
// 400 — Validation failure (malformed request)
// 401 — Not authenticated (missing/expired JWT)
// 403 — Authenticated but insufficient role
// 404 — Resource not found
// 422 — Business logic validation (e.g., param out of range)
// 429 — Rate limited
// 503 — Downstream service unavailable (e.g., satellite in LOS)
```

---

# Chapter 6 — State Management Architecture

## 6.1 Store Topology

```
┌─────────────────────────────────────────────────────────┐
│                    Zustand Stores                        │
│                                                          │
│  fleetStore      ← WebSocket telemetry push              │
│  alarmStore      ← WebSocket alarm events                │
│  commandStore    ← REST + WebSocket CLCW updates         │
│  authStore       ← JWT lifecycle                         │
│  uiStore         ← Local UI state (sidebars, modals)     │
└─────────────────────────────────────────────────────────┘
         │
         │  subscribeWithSelector (fine-grained)
         ▼
┌─────────────────────────────────────────────────────────┐
│              React Components                           │
│  Only re-render when their specific slice changes        │
│  e.g. ParameterCard only updates when its param changes  │
└─────────────────────────────────────────────────────────┘
```

## 6.2 Telemetry Update Performance Pattern

```typescript
// BAD — re-renders ALL parameter cards on ANY telemetry update:
const allParams = useFleetStore(state => state.cvt);

// GOOD — re-renders only when THIS specific param changes:
const busVoltage = useFleetStore(
  useCallback(
    state => state.cvt[satId]?.[paramId],
    [satId, paramId]
  )
);
```

## 6.3 WebSocket → Store Flow

```typescript
// src/hooks/useTelemetryStream.ts
export function useTelemetryStream(satelliteIds: string[]) {
  const updateParam = useFleetStore(s => s.updateParam);
  const addAlarm    = useAlarmStore(s => s.addAlarm);
  const setContact  = useFleetStore(s => s.setContactStatus);

  const { send } = useWebSocket({
    url: import.meta.env.VITE_WS_URL,
    onConnect: () => {
      send({ type: 'auth', token: getAccessToken() });
    },
    onMessage: (raw) => {
      const msg = WSMessageSchema.safeParse(raw);
      if (!msg.success) {
        Sentry.captureMessage('Unknown WS message shape', { extra: { raw } });
        return;
      }
      switch (msg.data.type) {
        case 'telemetry': updateParam(msg.data.sat_id, msg.data.param_id, msg.data); break;
        case 'alarm':     addAlarm(msg.data); break;
        case 'contact':   setContact(msg.data.sat_id, msg.data.status); break;
      }
    },
  });

  useEffect(() => {
    if (satelliteIds.length > 0) {
      send({ type: 'subscribe', satellite_ids: satelliteIds });
    }
  }, [satelliteIds]);
}
```

---

# Chapter 7 — Real-Time Data Handling

## 7.1 Telemetry Update Rate Limits

| Scenario | Max Update Rate | Technique |
|---|---|---|
| Single satellite, all params | 10 updates/s per param | WS server throttles to 1Hz max per param |
| 10 satellites simultaneously | 5000 total updates/s (500 params × 10) | React batching via `unstable_batchedUpdates` |
| 100 satellites (constellation view) | Only badge/status updates, not raw values | Subscribe to `summary` mode in WS frame |

## 7.2 Stale Data Detection

```typescript
// src/utils/stalenessUtils.ts
const STALE_THRESHOLD_MS = 10_000; // 10 seconds

export function isStale(param: Param): boolean {
  return (
    param.quality === 1 ||  // Backend-flagged stale
    Date.now() - new Date(param.timestamp_utc).getTime() > STALE_THRESHOLD_MS
  );
}
```

**UI treatment for stale values:**
- Value text: `neutral-400` (dim)
- Badge: grey "STALE" badge replaces normal status badge
- LimitBar: greyed out
- Timestamp: "Last: HH:MM:SS UTC" replaces live indicator dot

## 7.3 Connection State Display

```typescript
type WSConnectionState = 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';

// TopBar displays:
// CONNECTED     → green dot, no text
// RECONNECTING  → amber pulsing dot + "Reconnecting…"
// DISCONNECTED  → red dot + "No connection — data may be stale"
//                 + banner across top of content area
```

## 7.4 Backpressure — Slow Client Handling

The backend TDAE implements per-client ring buffer (1024 slots) with eviction. The frontend handles a fast stream with:

```typescript
// useWebSocket.ts — message queue with RAF drain
const msgQueue = useRef<WSMessage[]>([]);

// On WS message: push to queue (non-blocking)
ws.onmessage = (e) => msgQueue.current.push(JSON.parse(e.data));

// Drain queue at animation frame rate (≤60fps)
useEffect(() => {
  let rafId: number;
  const drain = () => {
    const batch = msgQueue.current.splice(0, 50); // max 50 per frame
    if (batch.length > 0) processBatch(batch);
    rafId = requestAnimationFrame(drain);
  };
  rafId = requestAnimationFrame(drain);
  return () => cancelAnimationFrame(rafId);
}, []);
```

---

# Chapter 8 — Authentication & Security

## 8.1 JWT Storage Strategy

| Token | Storage | Reason |
|---|---|---|
| Access token (15min) | JavaScript memory (Zustand authStore) | Never in localStorage (XSS-vulnerable). Lost on page refresh → uses refresh token to renew |
| Refresh token (7 days) | httpOnly cookie (set by backend) | Inaccessible to JavaScript. Sent automatically on `/v1/auth/refresh` requests |

## 8.2 Token Refresh Flow

```
Request fails with 401
    │
    ▼
Axios response interceptor intercepts
    │
    ▼
POST /v1/auth/refresh (cookie sent automatically)
    │
    ├── 200 → new access_token → update authStore → retry original request
    └── 401 → refresh token invalid → authStore.logout() → redirect to /login
```

## 8.3 Route Protection

```typescript
// src/router/routes.ts
export const protectedRoute = createRoute({
  getParentRoute: () => rootRoute,
  beforeLoad: ({ context }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: '/login' });
    }
  },
});

// Role-specific guard example:
export const commandingRoute = createRoute({
  beforeLoad: ({ context }) => {
    if (!context.auth.hasPermission('commanding:execute')) {
      throw redirect({ to: '/unauthorized' });
    }
  },
});
```

## 8.4 RBAC Permission Matrix (Frontend)

| Feature | Mission Controller | Flight Engineer | Payload Eng | Mission Designer | Sys Admin |
|---|---|---|---|---|---|
| View TM (all sats) | ✓ | ✓ | ✓ (own sat) | ✓ | ✓ |
| Execute procedures | ✓ | Limited | Payload only | — | — |
| Command sandbox | ✓ | — | — | Test only | — |
| Force continue | ✓ | — | — | — | — |
| Edit procedures | — | — | — | ✓ | — |
| Edit alarm limits | — | — | — | ✓ | ✓ |
| User management | — | — | — | — | ✓ |
| Audit log view | ✓ | ✓ | — | — | ✓ |

## 8.5 Security Requirements

- **CSP Header:** `default-src 'self'; script-src 'self'; connect-src 'self' wss://*.akashaveda.com`
- **HSTS:** `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- **No inline scripts.** All scripts are bundled.
- **Zod parse all inputs:** Every form field and API response parsed before use. Unknown shapes discarded.
- **No secrets in frontend code.** All configuration via `VITE_` env vars (public values only).
- **Audit-sensitive actions:** Command execute, force-continue, user invite — all logged server-side with JWT sub claim.

---

# Chapter 9 — Performance Requirements

## 9.1 Core Web Vitals Targets

| Metric | Target | Why |
|---|---|---|
| LCP (Largest Contentful Paint) | < 2.5s | First meaningful paint of operator dashboard |
| FID / INP (Interaction to Next Paint) | < 100ms | Operator clicks must feel immediate |
| CLS (Cumulative Layout Shift) | < 0.1 | Telemetry updates must not cause layout reflow |
| TTI (Time to Interactive) | < 3.5s | Operator must be able to command quickly after load |

## 9.2 Runtime Performance Targets

| Scenario | Target |
|---|---|
| Constellation overview (100 satellites, D3 heatmap) | 60fps, <16ms per frame |
| Parameter Detail chart (24h, 86k points) | Initial render <100ms (uPlot) |
| WS message processing (5000 updates/s burst) | <5ms per frame via RAF batching |
| Command form submit → ACK display | <500ms total (full E2E) |
| Route navigation (SPA transitions) | <200ms |

## 9.3 Bundle Size Targets

| Bundle | Max Size (gzipped) |
|---|---|
| Initial JS bundle (entry) | < 150KB |
| Per-route lazy chunks | < 80KB each |
| Total app (all routes loaded) | < 800KB |
| uPlot | ~50KB (canvas, no overhead) |
| D3 (tree-shaken) | ~40KB |

**Code splitting strategy:**
- All 8 flows loaded lazily via `React.lazy()` + `Suspense`
- uPlot, D3, Leaflet loaded only when their respective screens are visited
- Component library (shadcn primitives) in separate vendor chunk

## 9.4 Optimisations

```typescript
// Telemetry cards: memo to prevent re-renders on unrelated param changes
const ParameterCard = React.memo(({ satId, paramId }: Props) => {
  const param = useFleetStore(
    useCallback(s => s.cvt[satId]?.[paramId], [satId, paramId])
  );
  // ...
}, (prev, next) => prev.satId === next.satId && prev.paramId === next.paramId);

// uPlot chart: imperative API, never re-mounts on data push
const chartRef = useRef<uPlot | null>(null);
useEffect(() => {
  if (chartRef.current) {
    chartRef.current.setData(newData); // no React reconciliation
  }
}, [newData]);
```

---

# Chapter 10 — Accessibility Requirements

## 10.1 Standards

- **WCAG 2.2 Level AA** minimum compliance
- **Section 508** for government/defence customers

## 10.2 Colour Contrast (Verified)

| Combination | Ratio | Pass |
|---|---|---|
| Text primary (#F0F4FF) on bg-01 (#090C14) | 14.9:1 | AAA |
| Text secondary (#99A3BC) on bg-01 | 5.1:1 | AA |
| Teal (#0F6E56) on bg-01 | 4.8:1 | AA |
| Amber (#E8943A) on bg-01 | 4.6:1 | AA |
| danger-text (#FF6B6B) on bg-01 | 7.04:1 | AAA |

> `#505A70` (neutral-300): **2.83:1 only** — NEVER use for body text. Only for decorative/disabled.

## 10.3 Keyboard Navigation

- Every interactive element reachable by Tab
- Arrow keys navigate within: dropdown menus, role selection grid, parameter tabs
- Escape closes: modals, drawers, dropdowns
- `Ctrl+K` opens global command palette (keyboard shortcut reference)
- Custom shortcuts (documented in `/help`): `G+C` → Constellation · `G+T` → TC Dashboard

## 10.4 Screen Reader Support

```tsx
// ARIA live regions for real-time updates:
<div
  role="status"
  aria-live="polite"
  aria-atomic="false"
  className="sr-only"
>
  {latestAlarmAnnouncement}  {/* "Critical alarm: Battery temperature on SAT-001 exceeded limit" */}
</div>

// Critical alarms use assertive:
<div role="alert" aria-live="assertive" aria-atomic="true" className="sr-only">
  {criticalAlarmAnnouncement}
</div>
```

## 10.5 Focus Management

```tsx
// Modal focus trap using @adobe/react-spectrum FocusScope:
<FocusScope contain restoreFocus autoFocus>
  <CommandConfirmationModal />
</FocusScope>
// Cancel is always the first focused element in command confirmation dialogs
```

## 10.6 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  /* Collapse all non-essential animations */
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  /* Exception: data-drive live chart updates remain (functional, not decorative) */
}
```

## 10.7 Focus Ring

```css
:focus-visible {
  outline: 2px solid var(--info); /* #4A9EFF */
  outline-offset: 2px;
  border-radius: var(--r-4);
}
```

---

# Chapter 11 — Testing Strategy

## 11.1 Test Pyramid

```
        ┌──────────┐
        │  E2E     │  10% — Playwright — critical user flows
        ├──────────┤
        │Integration│  20% — Vitest + MSW — screens with API mocking
        ├──────────┤
        │  Unit    │  70% — Vitest — components, hooks, utils, stores
        └──────────┘
```

## 11.2 Critical E2E Flows (Playwright)

```
1. Login → MFA → Role Selection → Constellation Overview
2. Select satellite → View telemetry → Navigate to parameter detail
3. Load procedure → Execute → Confirm ACK displayed
4. Abort executing procedure
5. Open Command Sandbox → Build command → Confirm dialog → Send
6. View anomaly dashboard → Click anomaly → Navigate to parameter detail
7. System admin: invite user → assign role
```

## 11.3 Component Testing Patterns

```typescript
// Stale data visual test:
it('shows stale styling when quality is 1', () => {
  render(<ParameterCard satId="SAT-001" paramId="BUS_V" />);
  act(() => {
    useFleetStore.setState(s => ({
      cvt: { 'SAT-001': { BUS_V: { quality: 1, eu_value: 28.4, ... } } }
    }));
  });
  expect(screen.getByTestId('param-value')).toHaveClass('stale');
  expect(screen.getByText(/Last:/)).toBeInTheDocument();
});

// Command abort test:
it('aborts executing procedure and shows ABORTED badge', async () => {
  // ...
  fireEvent.click(screen.getByRole('button', { name: /abort/i }));
  expect(await screen.findByText('ABORTED')).toBeInTheDocument();
});
```

## 11.4 Mock Service Worker (MSW)

All REST endpoints mocked via MSW for integration tests. WebSocket mocked via a custom `MockWebSocket` that emits scripted telemetry sequences.

---

# Chapter 12 — Development Conventions

## 12.1 Code Standards

- **TypeScript strict mode** — no `any`. All types explicit.
- **No `console.log`** in production code — use structured logging to Sentry
- **All timestamps in UTC** — `date-fns/formatISO` for serialisation, `formatInTimeZone(date, 'UTC', ...)` for display
- **No `localStorage` for auth tokens** — access token in memory only
- **Every Zod parse at boundaries** — API responses, WS messages, URL params

## 12.2 Naming Conventions

| Element | Convention | Example |
|---|---|---|
| Components | PascalCase | `ParameterCard.tsx` |
| Hooks | camelCase, `use` prefix | `useTelemetry.ts` |
| Stores | camelCase, `use` prefix | `useFleetStore.ts` |
| API functions | camelCase, verb-noun | `fetchSatelliteHealth()` |
| CSS tokens | `--kebab-case` | `--color-bg-canvas` |
| Zustand actions | verb + noun | `updateParam`, `setContactStatus` |

## 12.3 Git Branch Strategy

```
main           ← production (protected, requires PR + review)
├── staging    ← pre-production integration
└── dev        ← active development
    ├── feature/srs-telemetry-charts
    ├── feature/command-sandbox
    └── fix/ws-reconnect-loop
```

## 12.4 Environment-Specific Behaviour

| env | WS | REST | Mock data |
|---|---|---|---|
| development | MSW mock | MSW mock | Simulation engine |
| staging | Real backend (staging cluster) | Real | Staged satellite simulators |
| production | Real backend | Real | Live spacecraft |

```typescript
// vite.config.ts — development mock injection
if (import.meta.env.DEV) {
  const { worker } = await import('./src/mocks/browser');
  await worker.start({ onUnhandledRequest: 'bypass' });
}
```

---

