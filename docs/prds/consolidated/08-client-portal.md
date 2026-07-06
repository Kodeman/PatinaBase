# Client Portal — Detailed PRD (As-Built)

## 1. Header

**Area:** Client Portal (`apps/client-portal`) — Next.js 15 App Router PWA at `client.patina.cloud` (port 3002), the client-facing surface for everything a designer produces.

**Status by sub-feature:**

| Sub-feature | Status |
|---|---|
| Auth (password, magic link, QR-to-web, email invite) | Shipped |
| Projects (list/detail, Supabase-backed timeline) | Shipped |
| Scope-change requests (client-initiated) | Shipped |
| Decisions (Track 5 client mirror — "your move" vs designer-handled) | Shipped |
| Proposals + e-sign (`sign_proposal` one-tx RPC, auto-activate project) | Shipped |
| Proposal watch view (open-count, nudge) | Partial ⚠ (00230/00231 + `proposal-nudge` edge fn NOT on prod) |
| Offline (paper) signature | Planned ⚠ (branch `the-document/offline-signature`, unmerged, not on prod) |
| Invoices + Stripe checkout | Shipped (depends on real Stripe keys + prod webhook `?apikey=`, per memory) |
| Messages + Inbox | Shipped |
| Rooms / scan viewer (orbit only, single model URL) | Partial (no measurement/annotation/LOD tooling) |
| Aesthete quiz (pre-auth) | Shipped |
| Today feed / Reviews | Shipped |
| Orders (proxied to NestJS orders service) | Shipped |
| Immersive timeline (NestJS `projects` proxy + demo pages) | Planned / unwired ⚠ (dead surface — live page reads Supabase instead) |
| Account / GDPR export-erase | Shipped |
| Header badges (approvalsPending / unreadMessages) | Partial ⚠ (hardcoded to 0, real aggregation not built) |

**Last reconciled:** 2026-07-06

**Source docs:**
- `docs/specs/_active/roomscan-client-association-prd.md`
- `docs/prds/Projects/patina-designer-portal-mvp-additions-spec.md`
- `docs/prds/Projects/patina-designer-portal-mvp-additions.html`
- `docs/prds/Projects/patina-project-creation-detailed-screens.html`
- `docs/specs/Redesign/patina-client-management-design.html`
- `docs/prds/in-app-messaging-prd.md`
- `docs/prds/AE/aesthete-engine-system-design.md`
- `docs/design/the-document/portal-vs-desk-feature-gap-matrix-v2.md`

---

## 2. Overview

**Purpose:** The Client Portal is Patina's client-facing PWA (`public/manifest.json` + `public/sw.js`) — the read/act surface for everything a designer produces. It gives homeowners/clients a way to track project timelines and milestones, make decisions/selections, review and e-sign proposals, pay invoices via Stripe, view and share room scans, message their designer directly, take a pre-auth Aesthete style quiz, browse a daily "Today" feed, leave reviews, track orders, and manage account/GDPR controls.

**Primary users:** Homeowners and clients engaging interior designers through Patina — the consumer side of the designer↔client relationship. Distinct from the Designer Portal (design/production workspace) and Admin Portal (internal operations).

**Where it lives in the product:** `apps/client-portal`, Next.js 15 App Router, served at `client.patina.cloud` on port 3002. It is Supabase-first — nearly every read is a `@patina/supabase` hook or a server helper hitting `public.*` tables with RLS scoped to `client_id = auth.uid()`; only orders and the (largely unwired) "immersive timeline" proxy to the retained NestJS services. Auth is Supabase-only (password + magic link + QR + email invite); the legacy `[...nextauth]` route is a 410 stub.

---

## 3. As-Built Architecture

### Shell & routing

- `apps/client-portal/src/app/page.tsx` — `/` redirects to `/projects`.
- `apps/client-portal/src/app/layout.tsx` — root layout (Inter/Playfair/DM Mono fonts, CSS-var theme, `Providers`). Metadata markets an "immersive timeline experience" (see §7 drift).
- `apps/client-portal/src/app/providers.tsx` — TanStack Query + PostHog analytics + design-system `Toaster`. No auth `SessionProvider` (Supabase manages state internally).
- `apps/client-portal/src/middleware.ts` — Supabase `getUser()` gate. `userHasClientPortalRole()` uses the service-role admin client to check `user_roles → roles.domain ∈ {consumer, admin}` (⚠ fails **open** on missing key / errors). Public allowlist: `/`, `/demo/*`, `/auth/invite/*`, `/quiz*`. Unauthenticated protected routes redirect to `/auth/signin?callbackUrl=…`; wrong-domain users → `/unauthorized`. Cookies are copied onto redirects to preserve cross-subdomain SSO. Sets `x-client-ip` for `/proposals` (sign audit trail).

### Auth (`apps/client-portal/src/app/auth/*`)

- `signin/page.tsx` — password + magic-link modes (`authMode` state) plus `QRLoginDisplay` (phone-to-web QR via `hooks/use-qr-auth.ts`, polling a session token). `verify-otp`, `callback`, `error`, and `invite/[token]` landing pages. `lib/auth.ts`, `lib/rbac.ts` back role checks.
- `api/auth/[...nextauth]/route.ts` — **legacy stub returning HTTP 410** ("Auth is now handled by Supabase").

### Projects (Supabase, repointed off dead NestJS)

- `lib/data/projects.ts` — server-only `cache()`d helpers. `fetchClientProjects()` and `fetchClientProjectView()` read `supabase.from('projects').select(...project_phases...).eq('client_id', user.id)` (RLS). Dev-only fallback to `devFallbackProjects` on error.
- `app/projects/page.tsx` — list with progress bars from `summarisePhases()`; `components/projects/ProjectsEmptyState`, `SectionIntro` help copy.
- `app/projects/[projectId]/page.tsx` → `components/project-view-wrapper.tsx` → `components/timeline/enhanced-timeline.tsx` (renders milestones derived from `project_phases`, **NOT** the immersive-timeline API).
- `app/projects/[projectId]/scope-change/new` + `[changeId]` — client-initiated change requests via `useCreateClientScopeChangeRequest` → `scope_change_requests` table.

### Decisions (client mirror of the coordination table)

- `app/decisions/page.tsx` + `[id]/page.tsx`; `hooks/use-decisions-client.ts`; `components/decision-card-client.tsx`. Uses `@patina/supabase` `useAllDecisions/useDecision/useSelectDecisionOption/useMarkDecisionViewed`. `isClientActionableDecision()` scopes the "your move" pile to `court='client'` + `coordination_kind ∈ {selection, signoff}`; everything else renders read-only as "Your Designer Is Handling" (Track 5).

### Proposals + e-sign

- `app/proposals/page.tsx` + `[id]/page.tsx` + `[id]/sign/page.tsx`; `hooks/use-proposals-client.ts` (`useProposals({clientId})`, `partitionProposals`); `components/proposal-document.tsx`, `components/proposals/{ProposalDeclineDialog,ProposalRequestChangeDialog,ProposalClarifyButton}`. Detail composes `useProposalSections/PaymentMilestones/Phases/Exclusions/ScopeRooms/useBoards`.
- `app/api/proposals/[id]/sign/route.ts` — pre-checks ownership/status/expiry then calls the `sign_proposal` RPC (`p_auto_activate: true`) — one SECURITY DEFINER tx that settles the approval decision, flips proposal → `accepted`, logs the signed event, and opens the project. Idempotent.

### Invoices + payments (Stripe)

- `app/invoices/page.tsx` + `[invoiceId]/page.tsx` + `[invoiceId]/print`; `useInvoices/useInvoice/useStartCheckout` from `@patina/supabase`; formatting from `@patina/shared`. Pay button → `create-checkout-session` edge fn → Stripe redirect; return `?checkout=success|cancelled` polled while `stripe-webhook` settles the payment row.

### Messages + Inbox

- `app/messages/page.tsx` — `useThreads/useThread/useThreadMessages/useSendMessage/useMarkThreadRead/useTypingIndicator/useThreadRealtime` + design-system `MessageThread/MessageComposer`; attachments via `components/messages/MessageAttachmentUploader`.
- `app/inbox/page.tsx` — `useInboxNotifications/useInboxMessages/useInboxNotificationsRealtime/useUnreadInboxCount` (reads `notification_log` + comms tables). `settings/notifications/page.tsx` — thread overrides + notification prefs; `preferences` + `preferences/unsubscribe` — email prefs.

### Rooms / Scans

- `app/scans/page.tsx` → `components/scans/RoomScanList` (`useRoomScans({userId})` + `useConsumerSharedScans`, active-share badges). `app/scans/[scanId]/page.tsx` → `components/scans/ClientRoomScanViewer` (a lightweight WebGL `ClientViewerCanvas` reading `scan.model_url_gltf ?? scan.model_url`; orbit modes, "full quality" toggle) + `RoomScanShareStatus` + `ShareScanDialog`. Sharing is backed by the `@patina/supabase` `useRoomScanAssociations`/`useConsumerSharedScans` hooks (`packages/supabase/src/hooks/use-room-scan-associations.ts`) → `room_scan_associations` table.

### Aesthete quiz (pre-auth)

- `app/quiz/page.tsx` → `quiz-flow.tsx` (uses `@patina/aesthete-quiz/react`, PostHog attribution, `lib/aesthete/profile-store`). `app/quiz/results/page.tsx` → `results-view.tsx`. Anonymous localStorage session key claimed on signup (`claim_quiz_session`). `hooks/use-aesthete-matches.ts` powers recommendations.

### Today / Reviews / Orders / Account

- `app/today/page.tsx` → `components/today/TodayPage` (`/api/stories/today` daily story + `useRooms` room feed via `RoomFeedSection`).
- `app/reviews/page.tsx` → `components/reviews/ReviewsIndex` (`useMyPendingReviewRequests/useMySubmittedReviews` → `client_reviews`).
- `app/orders/page.tsx` + `[id]` + `[id]/checkout` — `lib/data/orders.ts` fetches `/api/orders` which **proxies the NestJS orders service** (`@patina/api-routes` `proxyToBackend`, port 3015, retry + circuit breaker).
- `app/account/page.tsx` → `components/account/ProfileForm` (+ `AvatarUploadField`); GDPR `api/user/data-export` + `data-erase` (admin client, `lib/gdpr.ts`).
- `app/demo/{timeline,timeline-3d,approval-flow}` — design-system prototype pages on hardcoded sample data (not wired to live data).

---

## 4. Data Model

All tables are in the `public` schema, accessed via Supabase client with RLS scoped to the signed-in client. Migration numbers reflect the file that created/last materially changed each.

- **projects** — created `00001_initial_schema.sql`; **project_phases** — created `00066_proposal_project_flow_v2.sql`. Client reads scoped by `projects.client_id = auth.uid()` (the repoint off the empty NestJS `svc_projects`, whose parallel `svc_projects.projects` is `00054_svc_projects_schema.sql`).
- **proposals** base table — `00014`; `proposal_sections` — `00063_proposal_system_v2.sql`; `proposal_phases`/`proposal_exclusions`/`proposal_scope_rooms`/`proposal_payment_milestones` + change-order terms + `scope_change_requests` — `00066_proposal_project_flow_v2.sql`. `clone_proposal`/`send_proposal` RPCs `00176`. **`sign_proposal`** RPC (signs as an approval decision, auto-activates project) `00210_sign_proposal_as_decision.sql`; `document_state.proposal_updated_at` `00211`. Proposal "watch view" open-count amend `00230`; nudge (`last_nudged_at`/`nudge_count` + `nudge_proposal` RPC) `00231`. **`record_offline_signature`** RPC `00254_record_offline_signature.sql`.
- **client_decisions** — created `00062_client_management_v2.sql`; widened orthogonally: `decision_type` `00084_project_management_mvp.sql`, `decision_kind` `00202_section_work_and_gates.sql`, `coordination_kind`/`court`/blocking `00212`–`00220` (coordination RLS `00217`, `resolve_coordination_item` `00218`, read-models `00219`). `apply_decision` auto-creates FF&E lines `00175`.
- **scope_change_requests** — `00066`; client-cancel `00114_scope_change_client_cancel.sql`; activity type `00094`; ownership guard `00253_apply_scope_change_ownership_guard.sql`.
- **invoices** (+ payments/lines) — `00178_invoices_v1.sql` (part of the 00177–00182 invoicing/A-R program). Stripe settlement server-side via `stripe-webhook` edge fn.
- **rooms** — `00019_roomplan_features.sql`. **room_scans** — `00014`, advanced `00077_advanced_room_scan.sql`, images `00032_room_scan_images.sql`, upload pipeline `00082_scan_upload_pipeline.sql`. **room_scan_associations** (consumer↔designer scan sharing) — `00020_room_scan_associations.sql`.
- **comms_threads / comms_messages / comms_thread_participants** — `00101_comms_tables.sql`. Inbox reads from **notification_log** (+ comms).
- **client_reviews** — `00062`; review-request cron/generation `00096_review_requests_cron.sql`.
- **daily story / room tracking** (Today feed) — `00069_daily_room_tracking.sql`.
- **notifications** (legacy) — `00054_svc_projects_schema.sql` (svc_projects schema is largely dead for the client portal).

**RLS notes:** RLS is the primary access control across the portal — reads are scoped to `client_id = auth.uid()` (projects/proposals/invoices/decisions) or the party's own profile id (room scan associations, reviews). No RLS bypass is used except in Next.js API routes that legitimately need admin/server-role access (GDPR export/erase, room/story feed routes) — those use the Supabase admin client server-side, never exposed to the browser.

The repo has 254 migration files numbered through `00254` (some numbers intentionally skipped, e.g., the 00160→00165 dedup noted in project memory).

---

## 5. API / Edge / Service Surface

### Next.js API routes (`apps/client-portal/src/app/api/**`)

- **Orders → NestJS proxy** (`@patina/api-routes` `proxyToBackend`, `ORDERS_SERVICE_URL` :3015, retry + circuit breaker + short cache): `orders`, `orders/[id]`, `orders/[id]/{fulfillments,payments,checkout/payment-intent}`, `orders/cart`, `orders/cart/items[/itemId]`.
- **Immersive timeline → NestJS projects proxy** (`PROJECTS_URL` :3016, path `/api/v1/projects/{id}/timeline/…`): `projects/[projectId]/timeline/immersive`, `/segment[/segmentId]/media[/opened]`, `/celebrations[/milestoneId]`, `/analytics/{health,summary,view}`. ⚠ **The live project detail page does NOT call these — it renders Supabase `project_phases` instead** (see §7).
- **Supabase-backed routes** (admin/server client): `rooms` + `rooms/[id]` + `rooms/[id]/{scans,items[/itemId],timeline,designer-lead}`, `feed/[roomId]`, `stories/today`, `inbox/mark-read`, `interactions/batch`.
- **Proposal sign**: `proposals/[id]/sign` → `sign_proposal` RPC (Supabase, not NestJS).
- **Account/GDPR/email**: `user/{data-export,data-erase,preferences}`, `preferences/apply-token`, `unsubscribe`, `version`.
- **Auth**: `auth/invite/accept`; `auth/[...nextauth]` = 410 legacy stub.

### Edge functions (`supabase/functions/**`) touching the client portal

- **Proposals**: `proposal-send`, `proposal-sign-confirmation` (client receipt + designer notify, fired from the sign route), `proposal-nudge`.
- **Payments/invoicing**: `create-checkout-session`, `stripe-webhook`, `invoice-send`, `invoice-reminders`.
- **Client lifecycle**: `client-invite` (POST send + `/accept`; token lands at `${CLIENT_PORTAL_URL}/auth/invite/{token}`).
- **Decisions/comms/reviews**: `decision-reminders`, `decision-resolved-notify`, `expire-decisions`, `comms-notification-dispatch`, `comms-mute`, `review-requests`, `notification-dispatch`, `digest-dispatcher`.
- **Aesthete/feed**: `aesthete-ask`, `emergence-recommend`, `aesthete-embed-worker`, `aesthete-nightly`.

### Retained NestJS services consumed

- **orders** (:3015, `svc_orders`) — live, via proxy.
- **projects** (:3016, `svc_projects`) — proxied only by the immersive-timeline endpoints, which are effectively unwired (client detail page reads Supabase).

---

## 6. UI Surfaces

Real routes under `apps/client-portal/src/app`:

- `/` → redirect `/projects`
- `/projects`, `/projects/[projectId]`, `/projects/[projectId]/scope-change/new`, `/projects/[projectId]/scope-change/[changeId]`
- `/decisions`, `/decisions/[id]`
- `/proposals`, `/proposals/[id]`, `/proposals/[id]/sign`
- `/invoices`, `/invoices/[invoiceId]`, `/invoices/[invoiceId]/print`
- `/orders`, `/orders/[id]`, `/orders/[id]/checkout`
- `/messages`, `/inbox`
- `/scans`, `/scans/[scanId]`
- `/quiz`, `/quiz/results` (pre-auth)
- `/today`, `/reviews`
- `/account`, `/settings/notifications`, `/preferences`, `/preferences/unsubscribe`
- `/auth/signin`, `/auth/verify-otp`, `/auth/callback`, `/auth/error`, `/auth/invite/[token]`
- `/unauthorized`
- `/demo/timeline`, `/demo/timeline-3d`, `/demo/approval-flow` (prototype/sample-data pages, public via middleware allowlist)

**Shell chrome:** `components/layout/client-header.tsx` (projects switcher + approvals/messages badges), `components/strata-mark.tsx`. Ambient help via `@patina/help-system` `SectionIntro`/`EmptyState` on `/projects`, `/scans`, `/reviews`, `/today`, `/messages` (F3 migration, consumer voice).

**Designer/Admin/Native equivalents:** Not covered by this PRD — see the Designer Portal and Admin Portal consolidated PRDs for the corresponding designer-side proposal/decision/coordination surfaces (The Document program), and the iOS Field Capture PRD for native scan capture. This document is scoped to `apps/client-portal` only.

---

## 7. Reconciliation & Gaps

### Spec-vs-reality drift

- ⚠ `roomscan-client-association-prd.md` specs a Node/Express + AWS S3 + CloudFront + PostGIS + USDZ→glTF stack and REST endpoints like `/api/v1/room-scans/{id}/viewer-data`, `/measurements`, `/annotations`, `/export`. Reality is Supabase-first: `room_scan_associations` (00020) + RLS + `@patina/supabase` hooks, and the client viewer reads a single `model_url_gltf` from Supabase — none of those REST endpoints exist and the storage stack is MinIO/media-service, not S3/CloudFront.
- ⚠ The roomscan PRD's Scan Viewer (point-to-point measurement tool, annotation pins with categories, bounding-box furniture placement, LOD0/1/2 progressive streaming, walkthrough/elevation modes) is **NOT built** on the client side. `ClientRoomScanViewer`/`ClientViewerCanvas` is orbit-focused, and its own code comment states the scan carries only a single model URL and the "full quality" toggle is informational "until the media service returns tiered URLs."
- ⚠ Layout metadata + `/api/projects/[projectId]/timeline/immersive` (and segment/celebrations/analytics) proxy the NestJS projects service and imply a rich immersive timeline, but the live `/projects/[projectId]` page renders `EnhancedTimeline` derived from Supabase `project_phases` and **never calls those endpoints** — the immersive-timeline API + `hooks/use-immersive-timeline.ts` + `/demo/timeline*` are a parallel, effectively-unwired system against a `svc_projects` schema that project memory documents as empty.
- ⚠ `lib/data/projects.ts` hardcodes `approvalsPending: 0` and `unreadMessages: 0` for every project (both list and detail), with an in-code comment that real counts are "a follow-up." The `ClientHeader` badges and per-project counts therefore always read 0 regardless of actual pending decisions/unread messages.
- ⚠ The roomscan PRD data model names tables `room_scan_associations(client_id→clients, consumer_id→consumers, designer_id→designers)`; the actual 00020 table and the `use-room-scan-associations` hook use the real `profiles`/`room_scans` shape, not the spec's `consumers`/`designers`/`clients` tables (which don't exist by those names).

### Known bugs / TODOs

- ⚠ Client-side scan viewer has no persisted measurements, no annotation pins, and no furniture-placement/fit-check — all specced in `roomscan-client-association-prd.md` Feature 2 but absent from `components/scans/*`.
- ⚠ Tiered LOD mesh streaming (LOD0/LOD1/LOD2 + texture atlas) is not implemented; viewer falls back to one model URL (explicit code comment).
- ⚠ Project list/detail approval + unread-message counts are stubbed to 0 (TODO in `lib/data/projects.ts`) — the aggregation from decisions + comms unread is unbuilt.
- ⚠ Proposal "watch view" migrations 00230/00231 and the `proposal-nudge` edge function are **NOT on prod** per project memory (prod tip ~00229); the nudge send path is unavailable in production.
- ⚠ Offline (paper) signature: `record_offline_signature` (00254) is on branch `the-document/offline-signature`, not merged and not on prod.
- ⚠ Immersive-timeline NestJS endpoints (segments/celebrations/analytics/media) have no live data source wired to the client detail page — they proxy `svc_projects`, which is documented as empty; effectively dead surface.
- ⚠ roomscan PRD Appendix D open questions (scan retention policy, multi-designer access rules, offline download, annotation visibility) remain unresolved and unimplemented.
- ⚠ `/demo/*` timeline/approval prototype routes ship to production behind the public middleware allowlist on hardcoded sample data (not gated behind a flag).
- ⚠ `userHasClientPortalRole()` in `middleware.ts` fails **open** (grants access) on a missing service-role key or lookup error — a latent security-posture risk, not just a gap.

---

## 8. Forward Roadmap / Open Requirements

| Item | Priority |
|---|---|
| Compute real `approvalsPending`/`unreadMessages` in `lib/data/projects.ts` (join pending `client_decisions` in client court + unread comms) so header + list badges are truthful. | P0 |
| Deploy proposal-watch migrations 00230/00231 + `proposal-nudge` edge fn to prod so the client-facing proposal review/nudge loop matches main. | P0 |
| Decide the immersive-timeline story: either wire `/projects` detail to the NestJS timeline endpoints with real segment data, or delete the unused immersive-timeline proxy routes/hook/demo pages to remove drift. | P1 |
| Merge + prod-deploy the offline-signature branch (00254 `record_offline_signature`) to close the paper-signature gap. | P1 |
| Build client scan-viewer measurement/annotation persistence + tiered LOD once the media service returns tiered mesh URLs (or formally descope from the roomscan PRD). | P2 |
| Gate or remove `/demo/*` prototype routes from the production shell. | P2 |
| Reconcile `roomscan-client-association-prd.md` to the Supabase-first reality (tables, storage stack, endpoints) or archive it as historical. | P2 |

---

## 9. Status & Deploy

**On main:** The full architecture described above (auth, projects, decisions, proposals/e-sign, invoices, messages/inbox, scans, quiz, today/reviews/orders/account) is on `main`.

**On prod:** Production Supabase tip is ~migration **00229** (per project memory). The client-portal `/projects` repoint to Supabase `public.projects` (RLS `client_id=auth.uid()`) is on prod (main `ce1e8061`).

**NOT yet on prod:**
- Proposal-watch migrations **00230**/**00231** + the `proposal-nudge` edge fn.
- Migration **00252** (project_documents proposal anchor), **00253** (scope-change ownership guard), and **00254** (offline signature).
- The offline-signature work overall — it lives on branch `the-document/offline-signature` (unmerged).

**Dependencies:** Invoicing/Stripe (00177–00182) is on main and depends on real Stripe keys + a prod webhook URL with `?apikey=` (per memory).

**Retained NestJS status:** orders (:3015) is live and proxied; the projects service (:3016) is proxied only by the immersive-timeline routes and is effectively empty for client-portal purposes.

---

## 10. Superseded Sources

This consolidated PRD does not fully supersede any single source document (no `supersededDocs` were identified in reconciliation) — the following are **retained** as historical/reference context rather than replaced outright:

- `docs/specs/_active/roomscan-client-association-prd.md` — retained; describes a scan-viewer feature set (measurement/annotation/LOD) not yet built, and a stack (Node/Express, S3/CloudFront) that diverges from the Supabase-first reality (see §7). Kept as the aspirational spec pending reconciliation or archival.
- `docs/prds/Projects/patina-designer-portal-mvp-additions-spec.md` — retained; cross-referenced for shared project/timeline vocabulary.
- `docs/prds/Projects/patina-project-creation-detailed-screens.html` — retained; screen reference for project creation flows.
- `docs/prds/in-app-messaging-prd.md` — retained; source for the Messages/Inbox surface.
- `docs/prds/AE/aesthete-engine-system-design.md` — retained; source for the pre-auth Aesthete quiz.
- `docs/operations/email-system-runbook.md` — retained; operational reference for notification/email delivery underlying invoice/proposal/review emails.
- `docs/operations/e2e-local-test.md` — retained; operational reference for local e2e testing conventions.
