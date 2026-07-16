# mem:frontend/core — Portals & clients under `apps/`

Frontends for the Patina monorepo. All web portals are **Next.js 15 App Router + React 19 + TS + Tailwind + TanStack Query**, each its own workspace pkg `@patina/<name>-portal`, routes under `src/app`. Data comes from `@patina/supabase` (the hub) + `@patina/api-routes` (proxy to the 3 NestJS services); UI from `@patina/design-system` (pkg dir is `patina-design-system`); types from `@patina/types`. See `mem:packages/core` for those, `mem:backend/core` for services.

## The 6 apps (CLAUDE.md lists only 5 — **manufacturer-portal is undocumented there**)

| App | Port | State |
|---|---|---|
| `designer-portal` | 3000 | primary, by far the largest |
| `admin-portal` | 3001 | dashboard |
| `client-portal` | 3002 | client-facing **PWA** |
| `manufacturer-portal` | 3003 | **bare scaffold** — not in CLAUDE.md |
| `extension` | — | Plasmo Chrome MV3 |
| `mobile` | — | **two** Xcode apps (see below) |

Each portal: `src/app` (routes) + `src/components` + `src/hooks` + `src/lib` + `src/middleware.ts`. Auth is per-portal `hooks/use-auth.ts` wrapping `@patina/supabase` `useSession()`/`useProfile()`; roles/permissions resolved in `src/lib/rbac`. No SessionProvider. Middleware enforces domain/role gating and cookie-preserving redirects.

## designer-portal (3000) — the big one
63 hooks, ~460 `@patina/supabase` imports. **Two coexisting route groups** under `src/app`:
- `(document)` + `(document-help)` = **"The Document"** — the modern replacement surface. Routes: `/desk`, `/doc/[id]`, `/drafting/[proposalId]`, `/library` + `/library/[id]`, `/people`, `/compose`, `/help`. Heavy code lives in `src/components/document/` (~70 files: desk, drafting, coordination, rooms, engine, accounts, orders-book, proposal-watch, mobile shell, overlays). Layout is deliberately chrome-less (StudioDrawer/LogStrip/CommandBar). This is the dominant active workstream — see user-memory `project_the_document_*` topic files.
- `(portal)/portal` = **legacy zone-nav** (~28 zones: clients, projects, decisions, procurement, billing, library, teaching, rooms, leads, proposals, insights, etc.).
- Root `/` is a marketing landing page linking to `/portal`; authed base redirects to `/portal`. Both surfaces are live on this merged branch (a pilot flag historically flipped `/portal`→`/desk`).
- Also has `src/app/api/*` (many route handlers: clients, vendors, projects, po, comms, search, campaigns, orders, media…), `src/features/catalog`, `src/providers/` (providers.tsx, react-query-provider.tsx), `src/contexts`, `src/data`.
- Uniquely also imports `@patina/help-system`, `@patina/catalog-ui`, `@patina/email`, `@patina/notifications`.

## admin-portal (3001)
`(dashboard)` route group + `preferences`, `auth`, `api`, `unauthorized`. `src/features/catalog`, ~30 hooks. Import mix is types/supabase/shared-heavy (it does ops/support cross-portal work). `dev` sets a larger `--max-http-header-size`.

## client-portal (3002) — PWA
`public/manifest.json` + `public/sw.js`; `next.config.js` wires PWA. Routes: today, projects, decisions, proposals, invoices, orders, messages, inbox, scans, quiz, reviews, account, settings, demo. Client mirrors of designer features (`decision-card-client.tsx`, budget/ffe/board blocks). Only portal importing `@patina/aesthete-quiz`. ~10 hooks.
⚠ Shares the localhost Supabase cookie with designer on :3000 (signing into one logs the other out) — see user-memory `project_local_two_portal_cookie_collision`.

## manufacturer-portal (3003) — scaffold only
Just 3 files: `src/app/{layout,page}.tsx` + `src/app/onboarding/page.tsx`. Only dep is `@patina/supabase`. Added by "manufacturer-portal scaffold + pilot launch gate (S3.9/.12)". Do not assume real features here.

## extension — Plasmo Chrome MV3
`@patina/extension`, **React 18** (not 19 — a deliberate dedupe fix; see user-memory `project_extension_react_dedupe`). Deps `@patina/catalog-ui` + `@patina/shared`. Entrypoints in `src/`: `background.ts`, `sidepanel.tsx`, `contents/`, `tabs/`, `panel/`, `overlays/`, `screens/`, `state/`. Build to `build/chrome-mv3-prod`. Adopts the portal's Supabase session via its auth cookie (`project_extension_portal_session_cookie`).

## mobile — TWO Swift/SwiftUI Xcode apps
- `apps/mobile/Patina/` — the main iOS app (room scans, decisions, messaging, QR/OAuth auth). SwiftUI groups under `Patina/Patina/`: App, Core, Design, Features, Services, Generated, Utilities. Uses MobAI/Blitz for device testing.
- `apps/mobile/Capture/` — a **separate** camera-first field-capture app (targets: Capture, CaptureKit, CaptureKitMocks, CaptureWidgets, CaptureShareExtension). Newer standalone app; see user-memory `project_field_capture_ios`.
