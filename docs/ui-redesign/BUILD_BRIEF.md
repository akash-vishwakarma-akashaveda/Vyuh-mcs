# Console rebuild brief (for every screen builder)

You are rebuilding screens of the VYUH mission-control console (React 18 + TypeScript + Vite + Tailwind + zustand) in `D:\Vyuh-Mcs\src` to the approved modern design, fixing every defect found in the UI audit, and wiring every control.

## Sources of truth (read first)
1. Design boards (the approved look, one per screen): `C:\Users\akash\AppData\Local\Temp\claude\D--Vyuh-Mcs\f8135c62-0db9-4776-88e6-71b69912bc89\scratchpad\console-design\project\*.dc.html`. Read the boards for your screens (HTML with inline styles; `renderVals()` holds the sample content). Match layout, hierarchy and copy tone; real data replaces the sample values.
2. Defect list and rules: `D:\Vyuh-Mcs\docs\ui-redesign\UI_AUDIT_AND_PLAN.md` (fix every item in your layer; the "Cross-cutting rules" apply everywhere).
3. Gap analysis: `D:\Vyuh-Mcs\reports\MCS software gap analysis.md` (for the new feature screens).

## Shared building blocks (already done — use them, do not restyle them)
- `components/molecules/Page.tsx`: `PageHead` (title, sub, actions, crumb), `Card` (title, actions, flush), `Tile`, `KpiTile` + `KpiRow`, `Th`/`Td`, `Banner` (info/warn/crit/ok/advisory/action), `Drawer` (Escape closes), `Segmented`, `SampleTag`, `Ring`, `Meter`, `Skeleton`.
- `components/atoms/Button.tsx`: variants primary/secondary/danger/ghost/outline/warning, sizes sm/md/lg, `reason` prop = visible one-line reason next to a disabled button (use it for every gated control).
- `components/atoms/Badge.tsx`: `Pill` (tone ok/warn/crit/info/action/violet/neutral, optional glyph), `StatusBadge` (maps raw statuses to tone, shows sentence case), `StatusGlyph`, `humanise()`.
- `components/organisms/DottedGlobe.tsx`: SVG dotted Earth with sats/stations/tracks/footprint.
- `auth/policy.ts`: `can(action, role)` → {allowed, reason}; `canApprove`; `canOpen`; `canOpenRoute(route, role)`; `whoCanOpen(route)`; `homeOf(role)`; `capabilitiesOf(role)`.
- `store/useAuthStore.ts`: the signed-in `user` and `activeRole`. Always record the real signed-in person as actor — never hardcode "Vikram Shetty" or "USR-001".

## Look (match the boards)
- Ground `#090B10`; cards `bg-[#11141B] border border-[#1A1E27] rounded-2xl`; inner tiles `bg-[#161A22] rounded-xl`; selected `#1B2130` / `#232936`.
- Text `#E9ECF1`, secondary `#9AA3B2`/`#C9CED6`, muted `#7C8594`/`#6B7383`. Fonts are global: Geist (UI) and `font-mono-code` (Geist Mono) only for values, ids, mnemonics, times.
- Page title via `PageHead`; card titles 14px sentence case; big numbers 28–40px semibold with a small muted label. No ALL-CAPS labels, no `label-caps` uppercase, no left-border accent strips, no gradients, no emoji.
- State colours: ok `#4ADE9A`, warn `#F5C451`, crit `#FF6B6B`/`#FF7A7A`, info/data `#6CB8FF`, second series `#9B8CFF`, third `#3DD9C1`. Kesari `#F28C28` only for primary actions, selection and "waiting on you".
- Tables: soft rows, header 12px muted, no grid lines; empty rows use `colSpan` across all columns.
- Layout: bento — `flex flex-wrap gap-4` rows with `flex-[999_1_560px] min-w-0` main + `flex-[1_1_320px] min-w-0` side; KPI rows with `KpiRow`. Must work narrow (wrap).

## Behaviour rules
- Every button, link, tab, input does something real: store update, backend call, navigation, or download. No toast-only "coming soon". If the backend for something does not exist yet, implement it against a zustand store with realistic data AND show `<SampleTag />` near it so nobody mistakes it for live data.
- Cross-screen links: only render a link if `canOpenRoute(target, role)`; otherwise show muted text "Handled by <roles>" using `whoCanOpen`. Never send a role to NotAuthorized. Use the URL params the target screen reads (and make your screens read the params others send).
- Gated actions: `can(...)` / `canApprove(...)`; disabled with `reason`.
- Destructive or irreversible actions confirm (use `components/molecules/Modal.tsx` or a Drawer footer), and record an audit entry via `useMissionStore.getState().appendAudit(...)` where the screen already does audit.
- State that must survive navigation lives in a store or the URL hash params, not component state.
- Live backend: the console already connects to it (src/live, src/realtime). Reuse what exists (`liveApi` in `src/live/api.ts`, fleet store CVT for live values, simulator API via `/api/v1/simulator/...` proxied by the BFF). Keep working when the backend is down (mock engine).
- Numbers: never print raw floats (`toPrecision`/`toFixed` sensibly), times in UTC with date when not today.

## File ownership
Edit ONLY the files listed as yours in your task, plus new files you create under your area. Do NOT edit: `Page.tsx`, `Button.tsx`, `Badge.tsx`, `DottedGlobe.tsx`, `auth/policy.ts`, `data/screens.ts`, `router/AppRouter.tsx`, `routes.ts`, `Sidebar.tsx`, `TopBar.tsx`, `useAuthStore.ts`, `styles/*`, `tailwind.config.js`. If you need a change there, describe it in your final report instead.
Other builders are editing other screens at the same time: if `npx tsc --noEmit -p .` shows errors only in files you do not own, ignore them; your files must be error-free.

## Done means
- `npx tsc --noEmit -p .` clean for your files.
- Every control on your screens listed in your final report with what it does now (store/backend/nav), and every audit item in your layer marked fixed or explained.
- Do not start dev servers, do not commit, do not touch the backend Go code.
