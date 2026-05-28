# Designer Portal — QA Punch-List (triaged)

Source: live Chrome walk (`findings.md`) + 3 background code-audit agents. Local seeded dev, `designer@patina.dev`.

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

---

## Cross-cutting (fix once — assign to a dedicated agent)

| ID | Sev | Effort | Item | Fix |
|----|-----|--------|------|-----|
| X-01 | P1 | Quick | `withMockData` logs full error object (17KB HTML ×4) → renderer freeze | `src/lib/mock-data.ts:30` → log `error?.message` only; de-dupe; debug-gate |
| X-02 | P1 | Large | `auto` data mode silently masks broken live endpoints across 5 hooks (30 sites) | Audit which `api-client`/service/admin endpoints 404; fix/implement; make fallback visibly loud in dev |
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
