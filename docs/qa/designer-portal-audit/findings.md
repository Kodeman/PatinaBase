# Designer Portal — Chrome QA Audit: Findings

Environment: local seeded dev (`localhost:3000`), logged in as `designer@patina.dev`.
Date: 2026-05-28. Driver: Claude Code (Chrome automation, single shared browser, sequential).

**Severity:** `P0` crash/blank/500 · `P1` core element broken (should work, doesn't) · `P2` incomplete/stub (coming-soon, mock-where-real-expected, missing empty state) · `P3` cosmetic/layout/copy.
**Type:** `render` · `console` · `dead-action` · `mock-data` · `layout` · `nav` · `flag-gated` · `data-integrity`.

Columns: `ID | Route | Severity | Type | Description | Evidence | Suspected fix`

---

## Known code-level gaps (pre-seeded from source exploration — confirm during walk)

These were found by reading the source before the live walk. Live testing should confirm each still reproduces.

| ID | Route / File | Sev | Type | Description |
|----|------|-----|------|-------------|
| SEED-01 | projects/page.tsx:403,406,409 | P2 | dead-action | Bulk actions fire `alert('… coming soon')`: change lead designer, export financials, combined report |
| SEED-02 | projects/[id]/financials/page.tsx:180,516 | P2 | dead-action | "Generate invoice" and export buttons `alert('… coming soon')` |
| SEED-03 | projects/[id]/financials/page.tsx:154 | P1 | data-integrity | `isLeadDesigner = true` hardcoded — permission check stubbed |
| SEED-04 | projects/[id]/ffe/page.tsx:349,352,465 | P2 | dead-action | "Generate POs", "Reassign vendor", "Generate PO" `alert('… coming soon')` |
| SEED-05 | team/page.tsx:69 | P2 | dead-action | "Invite" button `alert('Invite — coming soon')` |
| SEED-06 | catalog/new/page.tsx:126 | P1 | dead-action | File upload handler only `console.log`s — no media-service upload |
| SEED-07 | catalog/import/page.tsx:176 | P2 | dead-action | Import steps 2/3 are stubs — no actual import |
| SEED-08 | teaching/product/[id]/page.tsx:112 | P1 | dead-action | Teaching save only `console.log`s — no API persist |
| SEED-09 | components/portal/sub-nav.tsx:169 | P2 | dead-action | Pipeline list/timeline view toggle is a TODO (no-op) |
| SEED-10 | catalog/product-detail-modal.tsx:134,143 | P2 | dead-action | AR view + 3D model viewer are `console.log` stubs |
| SEED-11 | hooks/use-unread-counts.ts | P2 | mock-data | Unread counts hard-return 0/0 — nav badges never populate |
| SEED-12 | data/mock-designer-data.ts | P2 | mock-data | Central mock store feeds use-products/use-projects/use-comms/use-style-profile instead of Supabase |
| SEED-13 | settings/notifications/page.tsx:158 | P3 | dead-action | SMS channel disabled, "Coming soon" |
| SEED-14 | procurement/by-vendor & by-status | P2 | flag-gated | Filter rows are inert stubs (Wave 2); whole zone gated by `procurement-workspace-pilot` |
| SEED-15 | library/catalog/page.tsx | P2 | mock-data | "For your active projects" / "Teach the Engine" tabs show "Coming in a Sprint 3 follow-up" |
| SEED-16 | order-assistant.tsx:98, multiple product imgs | P3 | mock-data | Hardcoded `via.placeholder.com` images + `Middlewest Studio` ship-to placeholder |

---

## Live findings

### Zone A — Shell & Auth

| ID | Route | Sev | Type | Description | Evidence | Suspected fix |
|----|-------|-----|------|-------------|----------|---------------|
| A-01 | /portal | P3 | render | Dashboard stat cards flash all-zeros (NEW LEADS/ACTIVE PROJECTS/THIS MONTH/AVG MATCH) on first paint, then ACTIVE PROJECTS populates to 1 after data loads. Brief loading flash — add skeleton/loading state for stat cards. NEW LEADS / THIS MONTH / AVG MATCH remain 0 (may be genuine seed emptiness). | — | Add loading skeleton to stat cards |
| A-02 | profile menu (top-bar) | P2 | nav | Profile dropdown lists "Settings" **twice** (both → /portal/settings) and a "Time Tracking" item that also → /portal/settings (no dedicated time-tracking page). Redundant/misleading entries. | top-bar.tsx / navigation.ts profileMenu | Remove duplicate Settings; either build Time Tracking page or drop the item |

### Phase 1a — Playwright smoke pre-pass observations

| ID | Route | Sev | Type | Description | Evidence | Suspected fix |
|----|-------|-----|------|-------------|----------|---------------|
| SMOKE-01 | / , /dashboard, /catalog, /clients, /projects, /proposals, /messages | P2 | render | Chromium `page.goto(..., waitUntil:'load')` times out at 30s on these routes — the `load` event never fires. Likely a never-settling network request (websocket/long-poll/analytics beacon) keeping the page from reaching `load`. Verify in Chrome via network panel. | /tmp/pw-smoke.log | Find the hanging request; ensure pages reach `load`/idle |
| SMOKE-02 | (test infra) | P3 | render | E2E smoke spec runs **unauthenticated** — `/settings`, `/profile`, `/notifications`, `/help`, `/analytics` all redirect to `/auth/signin?callbackUrl=…`. The smoke spec doesn't use the `authenticatedPage` fixture, so it only ever tests the signin redirect, not the real pages. | pw log L341-473 | Use auth fixture in smoke spec for protected routes |
| SMOKE-03 | (test infra) | P3 | render | Firefox & WebKit Playwright browsers not installed (`pnpm exec playwright install` needed) — only chromium runs locally; cross-browser smoke is silently skipped. | pw log L199 | Document/install browsers or restrict project to chromium |

### Cross-cutting (affect many routes — fix once)

| ID | Route/File | Sev | Type | Description | Evidence | Suspected fix |
|----|------|-----|------|-------------|----------|---------------|
| X-01 | src/lib/mock-data.ts:30 | P1 | console | `withMockData` fallback does `console.warn('[Designer Portal] Falling back to mock data', error)`. On /portal/projects the live call fails with an error whose payload is the **full 17KB HTML document** (an API route returned HTML, not JSON), and it logs this **4×**. Serializing those huge objects **freezes the renderer** — Chrome screenshot CDP timed out (30s) and Playwright `page.goto` 'load' timed out (SMOKE-01). | console dump 83KB | Log `error?.message` only (never the full object/response body); de-dupe; gate behind a debug flag |
| X-02 | hooks: use-products, use-projects, use-comms, use-style-profile, use-search (30 call sites) | P1 | mock-data | Data layer runs in `auto` mode (`NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE` unset) → tries live, **silently** falls back to mock on ANY error. The portal isn't "intentionally on mock data" — the live API layer (api-client → NestJS services / Next API routes) is failing, so mock fallback masks broken/missing endpoints. Some Supabase-direct reads DO work (dashboard shows real seeded projects/decisions), so it's a mix. | use-projects.ts, mock-data.ts | Identify which api-client endpoints 404/HTML; fix or implement them; make fallback loud (visible dev banner) so gaps aren't hidden |
| X-03 | product images app-wide | P3 | mock-data | Product imagery falls back to `via.placeholder.com` (external) and a `Middlewest Studio` ship-to placeholder (confirms SEED-16). External placeholder = broken images offline + privacy leak. | — | Local placeholder asset; remove hardcoded ship-to |
| X-04 | dashboard, financials, project-detail, decisions (≥4 surfaces) | P1 | data-integrity | **Systemic**: summary/metric stat cards show 0 while the lists below them show real data. Examples: /portal/decisions "OPEN DECISIONS 0 / OVERDUE 0" vs 2 open + 1 overdue listed; financials Budget $0k vs $2,500 table; dashboard cards flash 0; project-detail "DECISIONS 2" vs 3+1. Metric queries are unwired/mock while list queries hit Supabase. | multiple | Wire the metric/aggregate queries to the same Supabase data as the lists (likely the `*ListMetrics`/`withMockData` mock branches) |
| X-05 | resources, catalog, decisions, financials, many routes | P2 | render | Client-rendered pages have **no SSR content** and a page-entrance fade animation, so `<main>` is empty/ghosted (low opacity) for ~3–7s after navigation before content fades in — sometimes appears stuck faded (e.g. /portal/resources). Poor perceived performance; `get_page_text` returned "no text" repeatedly during this window. | resources.jpg, catalog.jpg | Add loading skeletons / SSR; ensure entrance animation always completes to full opacity |

### Runtime spot-checks of agent findings (validated live)

| ID | Route | Sev | Type | Description | Evidence | Suspected fix |
|----|-------|-----|------|-------------|----------|---------------|
| RT-01 | /portal/communications | P1 | render | Confirms COMM-01/02 live: hub shows EMAILS SENT 0, OPEN RATE —, CLICK RATE —, HEALTH "Unknown", and NO Upcoming Sends / Recent Activity sections — dashboard calls `/api/admin/comms/dashboard` which doesn't exist in designer-portal. | communications.jpg | Implement the dashboard endpoint in designer-portal or proxy it |
| RT-02 | /portal/decisions | P2 | data-integrity | Confirms metric mismatch (X-04) + CLI-01 dead "+ New Decision" CTA present. Decision cards & filters use real data; stat cards read 0. | decisions text | See X-04 + CLI-01 |
| RT-03 | /portal/resources | P2 | render | Confirms SEC-01 live: static resource list renders (ghosted) with `cursor-pointer` rows that have no onClick/href — entire page is non-interactive. | resources.jpg | Wire rows to real help/resource links or remove cursor-pointer |

### Zone B — Pipeline

| ID | Route | Sev | Type | Description | Evidence | Suspected fix |
|----|-------|-----|------|-------------|----------|---------------|
| B-01 | /portal/pipeline | P2 | data-integrity | Every pipeline row shows "Unknown" as the secondary label (client/owner name). The client name isn't resolving from the row's data. | pipeline list | Resolve client/owner name in pipeline query/join |
| B-02 | /portal/pipeline | P2 | dead-action | "Timeline" view toggle is a no-op — clicking it doesn't change the List view (confirms SEED-09 / sub-nav.tsx:169). | — | Implement timeline view or remove the toggle |
| B-03 | /portal/pipeline | P1 | dead-action | Pipeline list rows don't navigate on click — clicking a row only highlights it; no nav to project/proposal detail. (Counts are correct: All 3 = Proposals 2 + Active 1.) | — | Make rows link to /portal/projects/[id] or /portal/proposals/[id] |
| B-04 | /portal/projects/[id] | P2 | data-integrity | Project header shows "Started **Invalid Date**" — start date parses to Invalid Date (null/format issue). | project detail | Guard date formatting; show "—" when null |
| B-05 | /portal/projects/[id]/financials | P1 | data-integrity | Top summary cards show BUDGET **$0k** / COMMITTED $0 / ACTUAL $0, but the table below totals **$2,500** (Design Fee) and the card subtext says "$120,000 remaining" against a $0 budget — three different budget numbers on one screen. Summary cards not wired to the table's data source. | financials.jpg | Wire summary cards to same financials query as the table |
| B-06 | /portal/projects/[id] | P3 | data-integrity | Overview stat "DECISIONS 2" but the Decisions section lists 3 OPEN + 1 DECIDED (=4). Stat count inconsistent with list. | project detail | Fix decisions count source |
| B-07 | financials, ffe, projects (bulk) | P2 | dead-action | "Coming soon" controls (Generate Invoice, Export, Generate PO/POs, Reassign vendor, change lead designer, combined report) use **`alert()`** — bad UX and blocks automation. Confirms SEED-01/02/04. | code | Replace alert() with real actions or disabled+tooltip; never use alert() |

### Zone D — Products (live runtime; code-level enumeration via background agent merged in Phase 2)

| ID | Route | Sev | Type | Description | Evidence | Suspected fix |
|----|-------|-----|------|-------------|----------|---------------|
| D-01 | /portal/catalog | P2 | render | Catalog shows a blank/ghosted skeleton for ~5–7s before the product grid appears — initial load is slow and the heading/filters render faded during load. | catalog.jpg | Investigate slow query; tighten loading skeleton |
| D-02 | /portal/catalog | P3 | mock-data | At least one product image broken — "Ceramic Table Lamp" renders alt text instead of an image. Confirms X-03 (placeholder/broken imagery). | catalog.jpg | Local placeholder asset / valid image URLs |
| D-03 | /portal/catalog | P3 | data-integrity | Sub-nav badge says "Catalog **11**" but grid header says "ALL PRODUCTS **15**" (15 rendered). Tab count ≠ actual. | catalog.jpg | Single source for catalog count |

### Zone C — Procurement (tested forced-on via temp flag override, since reverted)

| ID | Route | Sev | Type | Description | Evidence | Suspected fix |
|----|-------|-----|------|-------------|----------|---------------|
| C-01 | /portal/procurement/* | P3 | nav | When non-pilot, the "Coming soon" placeholder shows but the procurement sub-nav (By Vendor/By Status/Calendar/Receiving) still renders — all tabs lead to the same placeholder. | procurement-comingsoon.jpg | Hide sub-nav for gated zone, or move gate above sub-nav |
| C-02 | /portal/procurement/by-vendor | P3 | render | Placeholder card renders ~1s after sub-nav (paint race) — content area flashes blank first. | — | Render gate synchronously / skeleton |
| C-03 | /portal/procurement/* (forced-on) | P2 | dead-action | Filter/Sort controls on by-vendor & by-status are inert stubs (confirms SEED-14, Wave 2). All 4 sub-pages otherwise render clean, well-written empty states (no seeded POs). | by-vendor.jpg | Wire filters or hide until implemented |

> Note: Procurement zone is otherwise well-built — graceful empty states on all 4 sub-views. Main gaps are the flag gate + inert filters + no seeded PO data to exercise it.

### Zones D–H — code-level enumeration (3 background agents) + runtime spot-checks

Exhaustive per-file dead-action/mock/stub inventories were produced by code-audit agents and are merged into `punch-list.md` (Phase 2). IDs: `PROD-01..32` (Products), `MSG-01..07` + `CLI-01..19` (Messages/Clients), `COMM-01..07`, `VEN-01..03`, `SET-01..11`, `SEC-01..09`. Runtime spot-checks below validate the highest-severity ones live.

<!-- append findings below, grouped by zone -->
