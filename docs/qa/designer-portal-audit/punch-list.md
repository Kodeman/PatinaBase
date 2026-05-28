# Designer Portal — QA Punch-List (triaged)

Source: live Chrome walk (`findings.md`) + 3 background code-audit agents. Local seeded dev, `designer@patina.dev`.

## Backlog build status (2026-05-28) — Waves 1–3 DELIVERED & pushed to `main`

**Wave 1 (backend foundation):** ✅ migration 00162 (vendor_quote_requests, user_sessions, nurture content, sms_opt_in); ✅ all missing `/api/*` routes (orders proxy, comms, style-profile, search FTS, comms dashboard) — X-02 / COMM-01/02 fixed at the source.
**Wave 2 (wire existing backend):** ✅ SEC-03 room viewer, ✅ PROD-16/19/20 teaching persistence, ✅ PROD-05/CLI-03 image upload, ✅ SET-01 invite / SET-06 2FA / SET-10 sessions / SET-09 notif-unify, ✅ CLI-08 nurture send / CLI-09/19 review send+schedule / VEN-01/02 vendor actions / CLI-17 real journey.
**Wave 3 (net-new + polish):** ✅ PROD-09/10 CSV import, ✅ PROD-12/13 library tabs (2 of 3 live), ✅ SET-08 SMS plumbing (creds-gated), ✅ C-03 by-vendor sort.

**Also done (resume + follow-up passes):**
- ✅ **PROD-13 Founding Circle** — migration 00163 adds `vendors.founding_circle`; hook wired (two-step query, avoids the dual-FK embed); verified live (renders the linked catalog products).
- ✅ **VEN-02 / SET-06** verified end-to-end live: vendor Save (POST 200 → `saved_vendors` row); 2FA enroll (real Supabase TOTP QR + secret).
- ✅ **SET-10 session list** — migration 00164 adds an exception-guarded `auth.sessions`→`user_sessions` trigger (can't block login) + `ON DELETE CASCADE` FK + backfill. Profile Active Sessions now shows real sessions (verified live).
- ✅ **SMOKE-04 (partial)** — app tsconfig was type-checking other packages' **test/story** files (missing vitest/jest globals); added the missing excludes → tsc errors **3085 → 267** (only real app-source errors remain).

**Still open (explicitly deferred, with reasons):**
- **X-05 resources** ✅ FIXED — `page-enter` keyframe now animates transform only (never opacity), so the entrance slide can't leave content invisible; resources renders at full opacity.
- **SMOKE-04 remainder + SMOKE-05** — ~262 real type errors remain (was 3085 → config fix → 267 → `@types/three` → 262). This is a dedicated type-debt initiative with three distinct sub-efforts: (1) **rooms/viewer ~40** — `@react-three/fiber` v8 + React 19 JSX-namespace skew (`mesh`/`group` not on `JSX.IntrinsicElements`); needs an **r3f v8→v9 upgrade** (major) or a JSX shim. (2) **~200 real per-file app type bugs** — `lib/permissions.ts` (23, `UserRole` comparisons), email-builder props-forms, products components, `use-search.ts`, etc.; each a targeted fix. (3) **`@patina/api-client` (17)** — shared-package export/resolution errors. Plus migrate deprecated `next lint` → ESLint CLI (SMOKE-05). `tsc` won't exit 0 until all three are done.
- **SEC-06/07 Help content** — Sanity content-authoring task (studio + components wired); needs a dedicated authoring pass with the `kv3qrinl` project, not app code.
- **X-05 / `/portal/resources` stuck-fade** — `animate-page-enter` never settles on that static SEC-01 page (not fill-mode, no console error; likely a re-render reset). Low value; needs focused debug, not a global animation change. Broader X-05 (no-SSR blank) is architectural; most data pages already use `LoadingStrata`.
- **C-03 by-status faceted filters** — `aria-hidden` decorative Sprint-1 stubs on the pilot-gated, data-less zone (can't verify); by-vendor sort done. **XLSX import** — needs a parser dep (CSV done).


**Severity:** P0 crash · P1 core-broken · P2 incomplete-stub · P3 cosmetic.
**Effort:** Quick (no-op/dead-link/copy/hide) · Medium (wire to existing Supabase hook) · Large (needs backend/feature build).

## Headline takeaways
1. **The portal isn't intentionally "on mock data" — the live API layer is broken and the data layer silently fails over to mock** (`withMockData` `auto` mode, `src/lib/mock-data.ts`). Several `api-client`/NestJS/admin-only endpoints 404 or return HTML, so reads quietly show fabricated data while writes can throw silently. This is the root cause behind most P1s.
2. **A fallback `console.warn(..., error)` logs a 17KB HTML error blob ×4 on `/portal/projects`, freezing the renderer** (screenshot + Playwright `load` timeouts). One-line fix, high impact (X-01).
3. **Metric/stat cards systemically read 0 while the lists beside them show real data** across dashboard, decisions, financials, project-detail (X-04).
4. **Communications hub is permanently empty** — it calls `/api/admin/comms/dashboard`, which only exists in admin-portal (COMM-01/02).
5. **Several "built-looking" features silently discard input**: product image upload (PROD-05), single-product teaching save (PROD-16), deep-analysis save (PROD-20).
6. **Notification settings write the wrong DB columns** → toggles no-op/error and always read "on" (SET-04/05).
7. **Large orphaned catalog code surface** (`src/features/catalog/**`, `src/components/catalog/**`) — fake reviews, AR/3D stubs, dead buttons, `via.placeholder.com` — not used by any route; cleanup, not user-facing (PROD-24..30).

Counts (approx): P1 ≈ 16, P2 ≈ 40, P3 ≈ 35. Total ≈ 90 distinct items (excludes pure dupes).

## Remediation status (2026-05-28) — DONE & pushed to `main`

Cross-cutting wave: **X-01, X-02 (audit), X-04 (MetricBlock + useProjectListMetrics residual), MSG-01** ✅.
Lane waves (5 parallel agents, file-disjoint, integrated + spot-verified in Chrome): **A-02, B-01..B-07, SEED-03, C-01/C-02, PROD-06/08/11/15/17/18/21/22/23/32, CLI-01/02/04/05/06/07/10/11/12/13/14/18, MSG-04/05/07, SEC-02/04/05/08/09, COMM-03/04/05/06/07, VEN-03, SET-03/04/05/07/11** ✅.
All 40 changed files type-clean (no new tsc errors vs the pre-existing baseline). Verified live: profile menu (one Settings), pipeline names + budgets, projects metrics ($120k/1 real), financials card consistency, decisions/dashboard metric cards, teaching honest metrics, settings notif toggles, unread badge.

**Still open (Large / needs-its-own-plan):** X-02 implement missing `/api/*` routes (search/comms/orders/style-profile/admin-comms-dashboard) → COMM-01/02; PROD-05 image upload, PROD-09/10 import pipeline, PROD-16 teaching save, PROD-19/20 deep analysis, PROD-12/13 library tabs; CLI-03 option-image upload, CLI-08 nurture send, CLI-09/19 reviews send/schedule, CLI-17 journey phase; VEN-01/02 vendor actions; SET-01 team invite, SET-06 2FA, SET-08 SMS, SET-09 unify notif systems, SET-10 sessions; SEC-03 3D viewer, SEC-06/07 help CMS; X-05 loading skeletons; C-03 procurement filters; SMOKE-04/05 repo type-check/lint health. Minor: `/portal/insights` nav entry still shown to non-admins (page now shows a friendly message).

---

## Cross-cutting (fix once — assign to a dedicated agent)

> **Status (2026-05-28 wave):** X-01 ✅ fixed+verified, X-02 ✅ audited, X-04 ✅ fixed+verified (MetricBlock), MSG-01 ✅ fixed+verified. Remaining: X-05 (loading skeletons), X-03 (placeholder images), and X-04 residual = `useProjectListMetrics` still returns mock (projects-list "$142k across 5 projects" vs 1 real project).

| ID | Sev | Effort | Item | Fix |
|----|-----|--------|------|-----|
| X-01 | P1 | Quick | ✅ DONE — `withMockData` logged full 17KB HTML error ×4 → renderer freeze. Now logs `error.message` only. Verified: /portal/projects renders, no freeze. | `src/lib/mock-data.ts` |
| X-02 | P1 | Large | `auto` data mode silently masks broken live endpoints across 5 hooks (30 sites) | **AUDIT DONE (2026-05-28):** these api-client base paths have NO route handler in designer-portal → 404 `text/html` → mock fallback: `/api/search` (searchApi), `/api/comms` (commsApi), `/api/style-profile` (styleProfileApi), `/api/orders` (ordersApi), `/api/admin/comms/dashboard` (COMM-01). Working: `/api/catalog/*` (200), `/api/projects` (401=auth OK). Fix = implement these proxy routes (Large, needs backing services). X-01 already makes the failures non-fatal. |
| X-04 | P1 | Medium | Stat/metric cards read 0 while lists show real data (dashboard, decisions, financials, project-detail) | Wire `*ListMetrics`/aggregate queries to same Supabase data as lists; drop mock metric branches |
| X-05 | P2 | Medium | No-SSR pages ghost/empty 3–7s on entry; entrance fade can stick | Loading skeletons; ensure fade completes to full opacity |
| X-03 | P3 | Quick | `via.placeholder.com` images + hardcoded `Middlewest Studio` ship-to | Local placeholder asset; remove hardcoded ship-to |

---

## Lane A — Shell & Auth

| ID | Sev | Effort | Route | Item |
|----|-----|--------|-------|------|
| A-02 | P2 | Quick | profile menu | "Settings" listed twice; "Time Tracking" → /portal/settings (no real page) |
| A-01 | P3 | Quick | /portal | Stat cards flash 0 before load (also see X-04/X-05) |
| MSG-01 | P1 | Medium | global nav | `use-unread-counts.ts` stub returns 0 → all nav badges dead (SEED-11) |
| MSG-02/03 | P2 | Medium | top-bar + mobile-tab-bar | message/notification badge consumers of the always-0 hook |
| SMOKE-02 | P3 | Quick | e2e | smoke spec unauthenticated (no auth fixture) |
| SMOKE-03 | P3 | Quick | e2e | Firefox/WebKit browsers not installed |

## Lane B — Pipeline

| ID | Sev | Effort | Route | Item |
|----|-----|--------|-------|------|
| B-03 | P1 | Medium | /portal/pipeline | List rows don't navigate on click |
| B-05 | P1 | Medium | projects/[id]/financials | Summary cards ($0) contradict table ($2,500) & "$120k remaining" (X-04) |
| B-01 | P2 | Medium | /portal/pipeline | Rows show "Unknown" instead of client name |
| B-02 | P2 | Quick | /portal/pipeline | Timeline view toggle no-op (SEED-09) — implement or remove |
| B-07 | P2 | Quick | financials/ffe/projects | "Coming soon" controls use `alert()` (SEED-01/02/04) — replace/remove; never alert() |
| SEED-03 | P1 | Quick | financials | `isLeadDesigner = true` hardcoded permission |
| B-04 | P2 | Quick | projects/[id] | "Started Invalid Date" |
| B-06 | P3 | Medium | projects/[id] | "DECISIONS 2" ≠ 3 open + 1 decided |

## Lane C — Procurement

| ID | Sev | Effort | Route | Item |
|----|-----|--------|-------|------|
| C-03 | P2 | Medium | procurement by-vendor/by-status | Filter/Sort controls inert (SEED-14, Wave 2) |
| C-01 | P3 | Quick | procurement/* | Sub-nav shows for gated non-pilot users (all tabs → placeholder) |
| C-02 | P3 | Quick | procurement/by-vendor | Placeholder paint race (blank flash) |

## Lane D — Products

Reads (PROD-01..04, 31) all silently mock-fallback → covered by X-02. Specific items:

| ID | Sev | Effort | Route | Item |
|----|-----|--------|-------|------|
| PROD-05 | P1 | Large | catalog/new | Image upload only console.logs — never uploaded (SEED-06) |
| PROD-07 | P1 | Medium | catalog/new | Create has no fallback; Save throws silently if proxy down (no error toast) |
| PROD-16 | P1 | Large | teaching/product/[id] | Teaching save only console.logs — discarded (SEED-08) |
| PROD-19/20 | P1 | Large | teaching/deep | "Spectrum sliders will render here" stub; Save button no onClick |
| PROD-03 | P2 | Medium | catalog | Publish/unpublish/delete fake success via withMockData |
| PROD-06 | P2 | Medium | catalog/new | Lead time/dimensions/material collected but dropped on save |
| PROD-08/09/10 | P2 | Large | catalog/import | Template "download" dead; steps 2/3 stubs; import just routes away (SEED-07) |
| PROD-11 | P2 | Quick | collections/[id] | Price ÷100 (cents) while rest use dollars |
| PROD-12/13 | P2 | Large | library/catalog | 3 of 4 tabs are "Sprint 3 follow-up" empty states (SEED-15) |
| PROD-15/18/21 | P2 | Medium | teaching | Fabricated metrics (accuracy 94, "847", "Queue 4", "Impact 12") |
| PROD-17 | P2 | Medium | teaching/product/[id] | Existing teaching not loaded into form for edit |
| PROD-22 | P2 | Quick | companion | Quick-actions fall back to 4 hardcoded prompts |
| PROD-23 | P3 | Quick | companion | Sends `conversationId` not `conversation_id` — threading bug |
| PROD-31 | P2 | Medium | catalog/categories, /collections | Direct api-client (no fallback) → empty-state when proxy down |
| PROD-32 | P3 | Quick | teaching/product/[id] | Empty `{url:''}` image → broken gallery img |
| D-01 | P2 | Medium | catalog | Slow ~7s skeleton load (X-05) |
| D-02 | P3 | Quick | catalog | Broken product image (Ceramic Table Lamp alt text) |
| D-03 | P3 | Quick | catalog | "Catalog 11" tab badge ≠ "ALL PRODUCTS 15" |
| PROD-14 | P3 | Quick | library/* | Whole Library gated behind `useLibraryPilotEnabled` (note) |

## Lane E — Clients (CRM / Decisions / Reviews / Nurture)

| ID | Sev | Effort | Route | Item |
|----|-----|--------|-------|------|
| CLI-01 | P1 | Medium | /portal/decisions | "+ New Decision" primary CTA has no onClick/href |
| CLI-03 | P2 | Large | clients/[id]/decisions/new | Option image submitted but no image input exists |
| CLI-08 | P2 | Large | /portal/nurture | "Send Personalized Note" only flips status — nothing sent |
| CLI-09 | P2 | Medium | /portal/reviews | "Send Review Request" — no send confirmation; onCustomize/onSchedule unwired |
| CLI-14 | P2 | Quick | decisions/[decisionId] | Non-exhaustive type/blocking label maps → `undefined` for color/substitution |
| CLI-13 | P2 | Quick | decisions/new | decisionType options mismatch detail label map (crash risk) |
| CLI-02/18 | P3 | Quick | decisions | Dead `onView={()=>{}}` prop; `<button>` nested in `<a>` (a11y) |
| CLI-04/05 | P3 | Quick | clients/nurture, reviews | Literal `·` rendered instead of middot |
| CLI-06/07 | P3 | Medium | decisions detail/comments | Raw UUID `.slice(0,8)` shown instead of actor/author name |
| CLI-10/11/12 | P3 | Medium | decisions/clients | Legacy `/clients/[id]/messages` redirect dead-ends for profile-less clients |
| CLI-17 | P3 | Medium | clients/[id] | Relationship-journey phase is a heuristic, can mislabel |
| CLI-19 | P3 | Medium | /portal/reviews | "Scheduled for TBD" with no way to set date |
| RT-03/SEC-01 | P2 | Large | /portal/resources | Static list, `cursor-pointer` rows with no onClick/href |

## Lane F — Messages

| ID | Sev | Effort | Route | Item |
|----|-----|--------|-------|------|
| MSG-04 | P2 | Quick | /portal/messages | FilterRow given `value=` but prop is `active=` → scope tab never highlights |
| MSG-06 | P2 | Medium | use-comms (messaging) | `withMockData` auto-fallback serves mock threads on live error |
| MSG-07 | P3 | Medium | messages/[threadId] | Attachment uses raw `storage_path` not signed URL → broken links |
| MSG-05 | P3 | Quick | /portal/messages | `?scope` deep-link doesn't restore active tab (with MSG-04) |
| SEC-08 | P2 | Medium | /portal/inbox | Rows link to /portal/communications hub, not the specific thread |
| SEC-09 | P3 | Quick | /portal/inbox | mark-read swallows errors (shows success on failure) |

## Lane G — Communications

| ID | Sev | Effort | Route | Item |
|----|-----|--------|-------|------|
| COMM-01/02 (RT-01) | P1 | Large | /portal/communications | Hub calls admin-only `/api/admin/comms/dashboard` → 404 → metrics 0, no sends/activity |
| COMM-07 | P2 | Medium | templates/[id] | `dangerouslySetInnerHTML` unsanitized (stored-XSS surface) — **security** |
| COMM-04 | P2 | Quick | campaigns/[id] | Delete doesn't redirect — stays on deleted campaign |
| COMM-05/06 | P3 | Quick | audiences/templates [id] | Fire-and-navigate delete; navigates even on failure |
| COMM-03 | P3 | Quick | communications | Unused `LoadingStrata` import / unused `isLoading` |

## Lane H — Vendors / Settings / Profile / Team / Secondary

| ID | Sev | Effort | Route | Item |
|----|-----|--------|-------|------|
| SET-04/05 | P1 | Medium | /portal/settings | Notification toggles write wrong columns (`new_leads` vs `type_new_lead`) → no-op/error, always read "on" |
| VEN-01 | P2 | Large | vendors/[id] | View-only — no Contact/Request Quote/Save on detail |
| VEN-02 | P3 | Medium | vendors/[id] | No save/unsave on detail |
| VEN-03 | P3 | Quick | vendors | Save button `hidden md:block` → invisible on mobile |
| SET-01 | P2 | Large | /portal/team | "+ Invite member" → `alert('Invite — coming soon')` (SEED-05) |
| SET-02 | P2 | Medium | /portal/team | `useProjects` mock-fallback can show fake team assignments |
| SET-06 | P2 | Large | /portal/settings | Hardcoded "2FA: Not enabled", no enable action |
| SET-08 | P2 | Large | settings/notifications | SMS channel disabled "Coming soon" (SEED-13) |
| SET-09 | P2 | Large | settings/notifications/preferences | 3 divergent notification UIs / backends |
| SET-10 | P2 | Medium | /portal/profile | "Active Sessions" hardcoded placeholder |
| SET-03/07/11 | P3 | Quick | team/settings/profile | Stub copy; unused import; `<Link>` in `<button>` |
| SEC-02 | P2 | Medium | /portal/portfolio | `useProjects(completed)` mock-fallback → fake completed projects |
| SEC-03 | P2 | Large | rooms/[id] | "3D Room Viewer" is a static striped div |
| SEC-06/07 | P2 | Large | /portal/help/* | Fully Sanity-CMS dependent; empty if unpopulated; topic stub |
| SEC-04 | P3 | Quick | /portal/earnings | Unused `usePayouts` import (payouts unbuilt) |
| SEC-05 | P3 | Quick | /portal/insights | Hard "Access denied" for designers, but route in nav |

---

## Large / needs-its-own-plan backlog (NOT auto-fixed by waves)

These need backend, schema, or a feature build — surface to user for prioritization:

- **X-02** — Fix/implement the broken live API layer (api-client → NestJS / admin-only endpoints). Root cause of pervasive mock fallback.
- **COMM-01/02** — Build (or proxy) the comms dashboard endpoint in designer-portal.
- **PROD-05 / PROD-16 / PROD-19-20** — Real media-service upload; persist single-product teaching; build Deep Analysis spectrum UI + save.
- **PROD-08/09/10** — Real catalog import pipeline (template, column mapping, preview/import).
- **PROD-12/13** — Library "active projects" / "Teach the Engine" / "Founding Circle" tabs.
- **CLI-03 / CLI-08** — Decision option image upload; real nurture note compose+send.
- **VEN-01** — Vendor contact / request-quote / save actions.
- **SET-06 / SET-08 / SET-09** — 2FA enable; SMS channel; unify the 3 notification systems.
- **SEC-03** — Real 3D room viewer.
- **SEC-06/07** — Help Center content (Sanity) population + topic pages.

## Quick-win batch (Quick effort, high signal — do first)
X-01 (console freeze), A-02 (dup Settings), B-02 (timeline toggle), B-04 (Invalid Date), B-07 (alert→real/remove), SEED-03 (hardcoded lead), PROD-11 (cents), PROD-23 (conversation_id), PROD-32, D-02, D-03, CLI-02/04/05/13/14/18, MSG-04/05, COMM-03/04/05/06, VEN-03, SET-03/07/11, SEC-04/05/09, SMOKE-02/03.

---

## Remediation wave plan (file-disjoint lanes)
- **Wave 1:** Lane A (Shell/Auth) + Lane B (Pipeline)
- **Wave 2:** Lane D (Products) + Lane C (Procurement)
- **Wave 3:** Lane E (Clients) + Lane F (Messages)
- **Wave 4:** Lane G (Communications) + Lane H (Vendors/Settings/Secondary)
- **Cross-cutting agent:** X-01..05 + MSG-01 (unread counts) + shared `mock-data.ts`/`use-projects.ts` (no other agent edits these)

Each agent: fix Quick + Medium P0–P2 in its lane; skip Large (backlog above); add/extend `e2e/` test where practical; verify route loads clean + control works on seeded data; commit logical conventional commits + push.
