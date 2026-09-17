# Client Portal Retirement Inventory — old portal → the Threshold

Read-only inventory. No edits made.

- Repo: `/Users/kody/Code/patina-merged`, branch `main`
- HEAD: `26b15145ecbd23fffe1e6af54d518e6fc7c9f794`
- `git log --oneline -3`:
  - `26b15145e chore(client-page): merge hotfix — /projects collapse`
  - `9b32f85a9 fix(client): fail-closed override for threshold until the flag is retargeted`
  - `1a51a16f0 fix(client): /projects collapses to the threshold page for solo clients`
- Migration head on main: `supabase/migrations/00565_the_client_page.sql`
  (tail: 00562_notification_log_owner_opened, 00563_proposal_signing_multi_studio,
  00564_client_signoff_approval, 00565_the_client_page; plus `supabase/migrations/_pending/`)

## 0. The switch, in one paragraph

`/Users/kody/Code/patina-merged/apps/client-portal/src/app/projects/[projectId]/page.tsx`
(server) renders
`/Users/kody/Code/patina-merged/apps/client-portal/src/components/making/project-surface-switch.tsx`
(client), which reads `threshold` then `single-pane` and picks one of three trees:
`components/threshold/threshold.tsx` (Threshold), `components/making/the-making.tsx`
(The Making), `components/project-view-wrapper.tsx` (today's shipped portal).
Two more flag consumers move the rest of the surface:
`components/layout/threshold-chrome-gate.tsx` (drops the global header on a bare
`/projects/[id]` for a solo client) and
`components/threshold/threshold-route-collapse.tsx` (mounted in `src/app/layout.tsx`,
folds 9 top-level routes onto in-page anchors).
Prod is currently pinned OFF: `apps/client-portal/wrangler.jsonc` sets
`"NEXT_PUBLIC_FLAG_OVERRIDES": "threshold:false"`.

---

## 1. ROUTE TABLE

Anchors referenced below come from
`apps/client-portal/src/components/threshold/route-collapse.ts` (`ROUTE_COLLAPSE`):
`/today→doorstep`, `/decisions→doorstep`, `/proposals→door`, `/invoices→letterbox`,
`/budget→ledger`, `/documents→mat-papers`, `/orders→road`, `/messages→note`,
`/projects→doorstep`. Exact-match only — every nested route keeps its own page.

All page paths are relative to `/Users/kody/Code/patina-merged/apps/client-portal/`.

### 1a. Public / token / auth / system — KEEP (all)

| Route | File | S/C | What it does | ACTS | Calls | Email/SMS link | iOS / ext | Threshold parity | Class |
|---|---|---|---|---|---|---|---|---|---|
| `/.well-known/apple-app-site-association` | `src/app/.well-known/apple-app-site-association/route.ts` | server | AASA doc; `paths: ["/field/sr_*"]` (Field) and `["/piece/*","/invoices/*","/proposals/*","/decisions/*"]` (Patina) | — | — | — | both entitlements claim `applinks:client.patina.cloud` | n/a | **KEEP** |
| `/` | `src/app/page.tsx` | server | `redirect('/projects')` | — | — | — | — | `/projects` collapses to `#doorstep` | **KEEP** |
| `/auth/signin` | `src/app/auth/signin/page.tsx` | client | login shell → `ClientPortalLogin` | sign-in | Supabase Auth | every auth email | — | n/a | **KEEP** |
| `/auth/callback` | `src/app/auth/callback/page.tsx` | client | OTP/recovery/magic-link exchange | sign-in | `createBrowserClient` | yes | — | n/a | **KEEP** |
| `/auth/error` | `src/app/auth/error/page.tsx` | client | auth error notice | — | — | — | — | n/a | **KEEP** |
| `/auth/forgot-password` | `src/app/auth/forgot-password/page.tsx` | client | reset request | send reset | Supabase Auth | — | — | n/a | **KEEP** |
| `/auth/reset-password` | `src/app/auth/reset-password/page.tsx` | client | set new password | password change | `useUpdatePassword` | recovery email | — | n/a | **KEEP** |
| `/auth/verify-otp` | `src/app/auth/verify-otp/page.tsx` | client | 6-digit OTP | sign-in | Supabase Auth | OTP email | — | n/a | **KEEP** |
| `/auth/invite/[token]` | `src/app/auth/invite/[token]/page.tsx` | server + `AcceptInviteForm` | client invite landing | accept invite (account create) | `POST /api/auth/invite/accept` → edge fn | `supabase/functions/client-invite/index.ts:125` → `${CLIENT_PORTAL_URL}/auth/invite/${token}` | — | n/a | **KEEP** |
| `/share/[token]` | `src/app/share/[token]/page.tsx` | server | guest, view-only proposal / board | board pin approve/pass (`board-reactions.tsx`) | `resolve_document_share()`, `resolve_board_share()` | designer-minted share links | — | no | **KEEP** |
| `/field/[token]` | `src/app/field/[token]/page.tsx` | server | login-less field party page | photo upload, problem report, site-request checklist | `resolve_field_link()`, server actions in `actions.ts` | `supabase/functions/_shared/sms.ts:283`, `site-request-dispatch/core.ts:125` | Capture: `AppConfiguration.swift:36`, `SiteRequestScreens.swift:431`; AASA `/field/sr_*` | no | **KEEP** |
| `/field/spec-book/[token]` | `src/app/field/spec-book/[token]/page.tsx` | server | spec-book guest view | — | share token RPC | designer-minted | — | no | **KEEP** |
| `/field/spec-book/[token]/download` | `.../download/route.ts` | server | spec-book PDF/zip | download | — | — | — | no | **KEEP** |
| `/rfq/[token]` | `src/app/rfq/[token]/page.tsx` | server | trade RFQ guest | submit bid | `resolve_trade_rfq_link()`, `submit_trade_rfq_response` | `supabase/functions/trade-rfq-send/lib.ts:379` | — | no | **KEEP** |
| `/evidence/[token]` | `src/app/evidence/[token]/page.tsx` | server | damage-evidence upload | upload | `fulfillment_evidence_token_context()`, `supabase/functions/fulfillment-evidence` | BOH S7 dispatch | — | no | **KEEP** |
| `/plans/[token]` | `src/app/plans/[token]/page.tsx` | server | plan transmittal guest | view sheets | `resolve_plan_transmittal()` | designer-minted | — | no | **KEEP** |
| `/plans/[token]/print/[printId]` | `.../print/[printId]/route.ts` | server | sheet stream | download | — | — | — | no | **KEEP** |
| `/piece/[id]` | `src/app/piece/[id]/page.tsx` | server | public piece page (anon RLS) | — | `products_catalog_select_anon` | — | **iOS `PatinaPortalLinks.swift:20-28`** builds `client.patina.cloud/piece/<id>`; AASA `/piece/*` | no | **KEEP** |
| `/quiz`, `/quiz/results` | `src/app/quiz/page.tsx`, `src/app/quiz/results/page.tsx` | server + client | pre-auth Aesthete quiz | quiz submit / claim | `claim_quiz_session`, `useAestheteMatches` | — | — | no | **KEEP** (unrelated funnel) |
| `/preferences/unsubscribe` | `src/app/preferences/unsubscribe/page.tsx` | server | unsubscribe outcome page | (token already applied) | `applyUnsubscribeToken` | landing of `GET /api/unsubscribe` | — | no | **KEEP** ⚠ see §6 bug |
| `/unauthorized` | `src/app/unauthorized/page.tsx` | server | shim → `/wrong-portal` | — | — | — | — | n/a | **KEEP** |
| `/wrong-portal` | `src/app/wrong-portal/page.tsx` | client | wrong-role interstitial | sign-out / switch account | `useAuth().signOut` | — | — | Mat has its own sign-out | **KEEP** |
| `/demo/approval-flow` | `src/app/demo/approval-flow/page.tsx` | client | design showcase, 661 lines | — | none (static fixtures) | — | — | n/a | **DELETE** |
| `/demo/timeline` | `src/app/demo/timeline/page.tsx` | client | showcase | — | none | — | — | n/a | **DELETE** |
| `/demo/timeline-3d` | `src/app/demo/timeline-3d/page.tsx` | client | showcase, 832 lines | — | none | — | — | n/a | **DELETE** |

`middleware.ts` already 302s every `/demo/*` to `/` in production, so the three demo pages
are dead weight in the bundle only.

### 1b. Authenticated — the Threshold's own page and its act targets

| Route | File | S/C | What it does | ACTS | Calls | Email/SMS | iOS | Threshold parity | Class |
|---|---|---|---|---|---|---|---|---|---|
| `/projects/[projectId]` | `src/app/projects/[projectId]/page.tsx` → `ProjectSurfaceSwitch` | server → client | THE surface | everything below | see `threshold.tsx` | `packages/email/src/__tests__/consumer-templates.test.ts:204` shows `client.patina.cloud/projects/abc` shape | — | **is** the Threshold | **KEEP** |
| `/account` | `src/app/account/page.tsx` → `components/account/ProfileForm.tsx` | server → client | profile + sessions | profile edit, avatar upload, session revoke | `fetchClientProfile`, `AvatarUploadField` | — | — | Mat links `accountHref="/account"` (`components/threshold/mat.tsx:38,113`) | ~~**KEEP** (Threshold's own outbound)~~ → **ABSORBED / DELETED.** Superseded 2026-09-04: the End state deletes the route, the mat no longer emits an `accountHref`, and profile editing + session revoke live in `components/threshold/details-sheet.tsx` (the avatar field moved with them). `/account` folds to `#mat`. Row kept struck through rather than removed so the change is visible to the next reader. |
| `/decisions/[id]` | `src/app/decisions/[id]/page.tsx` | client | decision + Stage-2 approval review | **approve/decide**, comment, consent block | `useClientDecision`, `useProjectApprovalByDecision`, `useCreateDecisionComment`, `useDecisionRealtime` | `notification-digest/index.ts:145` → `/decisions`; migrations `00399:3887`, `00464:2316` write `deep_link '/decisions/<id>'` | AASA `/decisions/*`; `PortalLinkRoutingTests.swift:45,57` | ❌ Threshold **links out** (`threshold.tsx:207` `href={/decisions/${approval.decisionId}}`) | **ABSORB** (act target; keep route until absorbed) |
| `/invoices/[invoiceId]` | `src/app/invoices/[invoiceId]/page.tsx` (752 lines) | client | invoice detail + pay | **pay/checkout**, method choose, check-intent notify | `useInvoice`, `useInvoicePaymentOptions`, `useStartCheckout`, `useNotifyCheckIntent`, `checkout-return.ts` | `invoice-send:249`, `invoice-reminders:342`, `stripe-webhook:392,490`, `create-checkout-session:279-280` (Stripe success/cancel URLs), `deep_link '/invoices/<id>'` | AASA `/invoices/*`; `PortalLinkRoutingTests.swift:44,55`; `DeepLinkQueueTests.swift:27` | ❌ `components/making/spine-toll.tsx:112` links out `href={/invoices/${invoiceId}}`; Letterbox renders SpineToll | **ABSORB** (act target; Stripe return URLs pin the route) |
| `/invoices/[invoiceId]/print` | `src/app/invoices/[invoiceId]/print/page.tsx` | client | printable invoice | print | `useInvoice`, `useInvoicePaymentOptions`, `useStudioIdentity` | — | — | no | **KEEP** (reached from detail) |
| `/proposals/[id]` | `src/app/proposals/[id]/page.tsx` | client | commercial document reader | **decline**, request change, clarify, notification replay | `useClientProposal`, `useClientCommercialDocument`, `POST /api/proposals/[id]/decline`, `.../notifications/replay` | `proposal-sign-confirmation:121`, `proposal-nudge:185`, `commercial-document-notify:382` | AASA `/proposals/*`; `PortalLinkRoutingTests.swift:45,56`; `DeepLinkQueueTests.swift:26` | ⚠ DoorGate signs but has **no decline / request-change / clarify** | **ABSORB** (decline etc.) |
| `/proposals/[id]/sign` | `src/app/proposals/[id]/sign/page.tsx` | client | typed-name signature ceremony | **sign** | `POST /api/proposals/[id]/sign` | not linked from email (emails point at `/proposals/<id>`) | — | ✅ `components/threshold/door-gate.tsx:176` posts the same route with the same consent copy (`consent-copy.ts` is drift-guarded against `sign/route.ts`) | **REDIRECT** → `#door` (act already in place) |

### 1c. Authenticated — the nine collapsed routes (REDIRECT by `ROUTE_COLLAPSE`)

| Route | File | S/C | What it does | ACTS | Calls | Email/SMS | iOS | Threshold parity | Class |
|---|---|---|---|---|---|---|---|---|---|
| `/projects` | `src/app/projects/page.tsx` + `SinglePaneSoloRedirect` | server | project list | pick project | `fetchClientProjects` | — | — | anchor `#doorstep`; **multi-project clients keep the list** | **REDIRECT** (solo only) |
| `/today` | `src/app/today/page.tsx` → `components/today/TodayPage.tsx` | server → client | editorial stories + per-room feed | — (read only) | `GET /api/stories/today`, `GET /api/feed/[roomId]` | — | iOS `DailyRoomAPI.swift:7-8` names both endpoints | anchor `#doorstep`; **Threshold has no editorial feed at all** | **REDIRECT** (content dies) |
| `/decisions` | `src/app/decisions/page.tsx` | client | decision + approval list | — (links to detail) | `useAllDecisions`, `useMyProjectApprovalReviews` | `notification-digest:145` | — | `#doorstep` renders `DoorstepApproval` per actionable approval | **REDIRECT** |
| `/proposals` | `src/app/proposals/page.tsx` | client | proposal list | — | `useClientProposals`, `partitionProposals` | `commercial-document-notify:382` | — | `#door` = DoorGate per pending signature | **REDIRECT** |
| `/invoices` | `src/app/invoices/page.tsx` | client | invoice list | — | `useInvoices` | `commercial-document-notify:381` | — | `#letterbox` shows the soonest-due open invoice only | **REDIRECT** (older invoices lose their list) |
| `/budget` | `src/app/budget/page.tsx` | client | budget rollup + payment schedule | — | `useProjects`, `useProjectInvoices`, `useClientProposals`, `./rollup.ts` | `commercial-document-notify:379` → `${CLIENT_PORTAL_URL}/budget` | — | `#ledger` = `HouseLedger` (planned / authorized / owed) | **REDIRECT** |
| `/documents` | `src/app/documents/page.tsx` | client | documents + plan-set sheets | open sheet, download | `useClientDocuments`, `useClientPlanSet`, `./group.ts` | — | — | ⚠ `#mat-papers` lists **in-page anchor labels only** — no sheet viewer, no download | **REDIRECT + ABSORB** |
| `/orders` | `src/app/orders/page.tsx` | client | direct (marketplace) orders | **direct-order checkout** | `useDirectOrders`, `useStartDirectOrderCheckout` | `stripe-webhook:1282,1367`, `create-checkout-session:657-658` (`?order=…&checkout=success`) | — | ⚠ `#road` (`the-road.tsx`) is a **read-only** drawing of pieces in transit; no orders, no checkout | **REDIRECT + ABSORB** |
| `/messages` | `src/app/messages/page.tsx` (423 lines) | client | threads, compose, attachments | **reply/send**, mark read, mute, attach | `useThreads`, `useThread`, `useThreadMessages`, `useSendMessage`, `useMarkThreadRead`, `useTypingIndicator`, `useThreadRealtime`, `useInboxRealtime`, `MessageAttachmentUploader` | `supabase/functions/comms-mute/index.ts:60` → `client.patina.cloud/messages/${threadId}` ⚠ (no such route) | — | ⚠ `#note` (`the-note.tsx`) is **read-only** — the studio's standing note + enclosures; no reply | **REDIRECT + ABSORB** |

### 1d. Authenticated — not collapsed, act-bearing

| Route | File | S/C | What it does | ACTS | Calls | Email/SMS | iOS | Threshold parity | Class |
|---|---|---|---|---|---|---|---|---|---|
| `/inbox` | `src/app/inbox/page.tsx` | client | notifications + message inbox | mark read (single/all) | `useInboxNotifications`, `useInboxMessages`, `useUnreadInboxCount`, `useInboxNotificationsRealtime`, `POST /api/inbox/mark-read` | every `notification_log` row's `deep_link` renders here | — | ❌ nothing | **ABSORB** |
| `/scans` | `src/app/scans/page.tsx` → `components/scans/RoomScanList.tsx` | server → client | captured-room list | — | scans query | — | iOS is the capture surface | ❌ Threshold reads `useProjectRooms` for the plan key, but shows no scans | **ABSORB** |
| `/scans/[scanId]` | `src/app/scans/[scanId]/page.tsx` | server | 3D room viewer + share | **share/revoke** a scan | `ClientRoomScanViewer`, `RoomScanShareStatus`, `ShareScanDialog` | — | — | ❌ nothing | **ABSORB** |
| `/reviews` | `src/app/reviews/page.tsx` → `components/reviews/ReviewsIndex.tsx` | server → client | review index | **review submit**, star rating | `SubmitReviewDialog`, `StarRatingInput`, `PastReviewCard` | `supabase/functions/review-requests/index.ts:70` → `${CLIENT_PORTAL_URL}/review/${projectId}` ⚠ **singular `/review/` — no such route** | — | ❌ nothing | **ABSORB** |
| `/projects/[projectId]/reviews/[editionId]` | `src/app/projects/[projectId]/reviews/[editionId]/page.tsx` → `components/project/ProjectReviewEdition.tsx` | server | selection-edition review | edition sign-off | `useClientCommercialDocument` | `supabase/functions/selection-review-send/index.test.ts:34` → `/projects/<id>/reviews/<editionId>` | — | ❌ nothing | **ABSORB** |
| `/projects/[projectId]/scope-change/new` | `.../scope-change/new/page.tsx` | client | raise a change request | **scope-change request** | `useCreateClientScopeChangeRequest`, `ChangeRequestForm` | — | — | ❌ nothing | **ABSORB** |
| `/projects/[projectId]/scope-change/[changeId]` | `.../scope-change/[changeId]/page.tsx` | client | decide a change request | **approve / decline / cancel** | `useScopeChangeRequest`, `useApproveScopeChange`, `useDeclineScopeChange`, `useCancelClientScopeChangeRequest` | — | — | ❌ nothing | **ABSORB** |
| `/preferences` | `src/app/preferences/page.tsx` (510 lines) | client | notification preferences (token-applyable) | **preferences**, apply token | `useNotificationPreferences`, `useUpdateNotificationPreferences`, `POST /api/preferences/apply-token` | one-click preference tokens | — | ❌ nothing | **ABSORB** |
| `/settings/notifications` | `src/app/settings/notifications/page.tsx` | client | prefs + per-thread overrides | **preferences**, mute thread | `GET/PUT /api/user/preferences`, `useMyThreadOverrides`, `useUpdateThreadNotificationPref`, `useMuteThread` | linked from `/preferences/unsubscribe` | — | ❌ nothing | **ABSORB** (duplicate of `/preferences` — merge them) |

### Route counts

| Class | Count | Notes |
|---|---|---|
| **KEEP** | 27 | 7 auth pages, AASA route, 8 token/guest routes, `/piece/[id]`, `/`, `/quiz`+`/quiz/results`, `/preferences/unsubscribe`, `/unauthorized`, `/wrong-portal`, `/projects/[projectId]`, `/account`, `/invoices/[invoiceId]/print` |
| **REDIRECT** | 10 | the 9 in `ROUTE_COLLAPSE` + `/proposals/[id]/sign` (act already in place) |
| **ABSORB** | 12 | `/decisions/[id]`, `/invoices/[invoiceId]`, `/proposals/[id]`, `/inbox`, `/scans`, `/scans/[scanId]`, `/reviews`, `/projects/[projectId]/reviews/[editionId]`, `/projects/[projectId]/scope-change/new`, `/projects/[projectId]/scope-change/[changeId]`, `/preferences`, `/settings/notifications` |
| **DELETE** | 3 | `/demo/approval-flow`, `/demo/timeline`, `/demo/timeline-3d` |
| Total page routes | 52 | (3 of the KEEP entries are `route.ts` handlers on public paths) |

Three of the REDIRECT rows carry act debt and appear in ABSORB's work list too:
`/documents` (sheet viewer), `/orders` (direct-order checkout), `/messages` (reply).

---

## 2. API ROUTES (`apps/client-portal/src/app/api`)

25 handlers. Callers grepped repo-wide (`apps`, `packages`, `supabase`, `services`).

| Route | Used by | Verdict |
|---|---|---|
| `auth/invite/accept/route.ts` | `components/auth/AcceptInviteForm.tsx:80` (only) | **KEEP** — invite flow |
| `proposals/[id]/sign/route.ts` | `app/proposals/[id]/sign/page.tsx:134` **and** `components/threshold/door-gate.tsx:176` | **KEEP** — Threshold act |
| `proposals/[id]/decline/route.ts` | `hooks/use-commercial-client.ts:207` (from `/proposals/[id]`) | **KEEP if decline absorbed**; otherwise dies with `/proposals/[id]` |
| `proposals/[id]/notifications/replay/route.ts` | `components/commercial-notification-recovery.tsx:46` **and** `components/threshold/door-gate.tsx:230` | **KEEP** — Threshold act |
| `trade-scopes/[id]/accept/route.ts` | `hooks/use-commercial-client.ts:241` ← `useAcceptTradeScope` ← `components/threshold/wall-gate.tsx:115` (and `making/spine-gate.tsx`) | **KEEP** — Threshold act |
| `projects/[projectId]/budget-checkpoints/[checkpointId]/acknowledge/route.ts` | `hooks/use-commercial-client.ts:267` | KEEP — used by the commercial hook layer both surfaces share |
| `inbox/mark-read/route.ts` | `app/inbox/page.tsx:77`, `components/notifications/notification-bell.tsx:217` (+ designer-portal has its own copy) | **dies with `/inbox` + the header bell** unless the Threshold grows an inbox |
| `preferences/apply-token/route.ts` | `app/preferences/page.tsx:108` | dies with `/preferences` unless absorbed |
| `user/preferences/route.ts` | `app/settings/notifications/page.tsx:57,63` | dies with `/settings/notifications` unless absorbed |
| `user/data-export/route.ts` | **no caller in this repo** (`lib/gdpr.ts` server-only helper) | **DELETE candidate** — orphan; verify no external/legal dependency |
| `user/data-erase/route.ts` | **no caller in this repo** | **DELETE candidate** — same |
| `unsubscribe/route.ts` | `supabase/functions/campaign-dispatch/index.ts:413`, `supabase/functions/_shared/send-email.ts:160`, `packages/email/src/send.ts:234` | **KEEP** — email infrastructure (note: those builders use their own `PORTAL_URL`, often admin/designer) |
| `interactions/batch/route.ts` | **iOS only** — `apps/mobile/Patina/.../DailyRoomBatchQueue.swift`, `DailyRoomTelemetry.swift`, `DailyRoomAPI.swift:34` | **KEEP** — iOS contract (its Swift comments say the deploy is still owed) |
| `stories/today/route.ts` | `components/today/TodayPage.tsx:24` **and** iOS `DailyRoomAPI.swift:8` | **KEEP** — iOS also consumes it |
| `feed/[roomId]/route.ts` | `components/today/RoomFeedSection.tsx:38`; iOS `DailyRoomFeedMappingTests.swift:6` calls it "the dead `/api/feed/:roomId` portal route" and has moved to `get_recommendations` | **DELETE** — reads `feed_cache_meta`, which nothing writes since AE Wave 0C |
| `rooms/route.ts`, `rooms/[id]/route.ts`, `rooms/[id]/items/route.ts`, `rooms/[id]/items/[itemId]/route.ts`, `rooms/[id]/scans/route.ts`, `rooms/[id]/timeline/route.ts` | **no in-repo caller** (only a historical mention in `00288_legacy_pending_leads_reconcile.sql`) | **DELETE candidates** — confirm against a live iOS build before removing; nothing in `apps/mobile` references `/api/rooms` |
| `projects/[projectId]/timeline/analytics/{summary,health,view}` | `hooks/use-progress-analytics.ts:99,105,114` — and `use-progress-analytics` has **zero importers** | **DELETE** — dead chain |
| `projects/[projectId]/timeline/{immersive,celebrations,celebrations/[milestoneId]}` | `hooks/use-immersive-timeline.ts:110,119,128,137` ← `components/timeline/celebration-overlay.tsx` ← `components/timeline/index.ts` ← **nothing** | **DELETE** — dead chain (proxies to the projects NestJS service) |
| `projects/[projectId]/timeline/segment/[segmentId]/media`, `.../media/opened` | same dead chain (`use-immersive-timeline.ts:147`, `use-progress-analytics.ts:125`) | **DELETE** |
| `version/route.ts` | deploy verification convention | **KEEP** |

Summary: **8 KEEP outright** (invite/accept, sign, replay, trade-scope accept, budget-checkpoint ack, unsubscribe, interactions/batch, stories/today, version — 9 with version), **4 die with ABSORB routes if the acts are not moved**, **~12 DELETE candidates** (feed, 6 rooms, 8 timeline proxies, 2 gdpr).

---

## 3. COMPONENTS

`src/components` — 104 non-test files. Importer map below (`←` = imported by; test-only importers marked).

### 3a. `layout/` — the global chrome

| File | Imported by | Fate |
|---|---|---|
| `layout/app-chrome.tsx` | `src/app/layout.tsx` | **stays**, but its whole body becomes a no-op once every authenticated route is the Threshold. It already returns bare `children` for `/auth /piece /share /field /rfq /plans /quiz /demo /wrong-portal /unauthorized`. |
| `layout/threshold-chrome-gate.tsx` | `layout/app-chrome.tsx` | **delete at cutover** — its only job is hiding the header while the flag rolls; when the header goes, it goes |
| `layout/client-header.tsx` | `layout/app-chrome.tsx` | **DEAD** at cutover. Links: `/projects`, nav items, `/decisions`, `/messages`, `/scans`, `/reviews`, `/account`, `/settings/notifications` |
| `layout/mobile-nav-drawer.tsx` | `layout/client-header.tsx` | **DEAD** |
| `layout/nav-config.ts` | `client-header.tsx`, `mobile-nav-drawer.tsx` | **DEAD** — its 7 hrefs are exactly 7 of the 9 `ROUTE_COLLAPSE` keys |
| `layout/project-switcher.tsx` | `client-header.tsx` | **DEAD** — ⚠ this is the **only** multi-project switcher; see §8 |

### 3b. `making/` — split fate

| File | Imported by | Fate |
|---|---|---|
| `making/project-surface-switch.tsx` | `app/projects/[projectId]/page.tsx` | **collapses** to rendering `<Threshold>` directly (also the sole emitter of `client_project_view`) |
| `making/single-pane-solo-redirect.tsx` | `app/projects/page.tsx` | **DEAD** with the `single-pane` flag |
| `making/the-making.tsx` | `project-surface-switch.tsx` | **DEAD** — the middle surface retires with the flag |
| `making/making-masthead.tsx` | `the-making.tsx` | **DEAD** |
| `making/scored-action.tsx` | 12 importers incl. `threshold/{door-gate,doorstep,letterbox,mat,the-note,threshold,wall-gate}` and `approvals/project-approval-review.tsx` | **KEEP — Threshold depends on it** |
| `making/making-spine.tsx` (`splitSpinePhases`, `openChapterOf`) | `threshold/{threshold,ground-floor,story-pole}`, `spine-toll.tsx`, `the-making.tsx` | **KEEP** |
| `making/standing-sentence.ts` (`monthAndYear`, `moneyInWords`) | 9 threshold files + `lib/threshold/standing.ts` | **KEEP** |
| `making/spine-gate.tsx` | `threshold/door-gate.tsx`, `threshold/wall-gate.tsx`, `the-making.tsx` | **KEEP** |
| `making/spine-toll.tsx` | `threshold/letterbox.tsx`, `the-making.tsx` | **KEEP** — ⚠ line 112 is the outbound `/invoices/[id]` link |
| `making/tracking-row.tsx` | `threshold/room-band.tsx`, `the-making.tsx` | **KEEP** |

Recommendation: move the seven KEEP files out of `making/` into `threshold/` (or a neutral
`house/`) at cutover so the directory name stops lying.

### 3c. The old project view tree — all DEAD

`components/project-view-wrapper.tsx` ← only `making/project-surface-switch.tsx` (+ its test).
Everything it imports dies with it:

- `components/project-overview.tsx`
- `components/project-scope-details.tsx`
- `components/project-commercial-summary.tsx`
- `components/project-invoices-summary.tsx`
- `components/budget-overview.tsx`
- `components/ffe-status.tsx`
- `components/project/FFEPipelinePanel.tsx`
- `components/project/ProjectActivityFeed.tsx`
- `components/project/ProjectDocumentsPanel.tsx`
- `components/project/ProjectTeamPanel.tsx`
- `components/timeline/enhanced-timeline.tsx`
- `components/commercial/awaiting-signature-cards.tsx`
- `components/commercial/client-plan-grid.tsx`
- `components/commercial/client-selections.tsx`

⚠ `components/commercial/journey-stepper.tsx` is imported by
`threshold/room-band.tsx`, `threshold/the-road.tsx`, `lib/threshold/derive.ts`,
`making/the-making.tsx`, `commercial/client-selections.tsx` — **KEEP**, and move it out of
`commercial/` (it is the last survivor of that directory).

### 3d. Other directories

| Dir / file | Importers | Fate |
|---|---|---|
| `today/TodayPage.tsx`, `today/StoryCard.tsx`, `today/RoomFeedSection.tsx` | `app/today/page.tsx` only | **DEAD** with `/today` |
| `timeline/celebration-overlay.tsx`, `timeline/index.ts`, `timeline/mobile-timeline-wrapper.tsx`, `timeline/milestone-card.tsx`, `timeline/project-timeline.tsx` | `index.ts` has **no importer**; `project-timeline.tsx` has none; the rest chain off them | **ALREADY DEAD today** — delete now |
| `timeline/enhanced-timeline.tsx` | `project-view-wrapper.tsx` | DEAD at cutover |
| `approvals/project-approval-review.tsx` | `app/decisions/[id]/page.tsx` | dies with `/decisions/[id]` **unless the decide act is absorbed** — this component *is* the ceremony |
| `approvals/project-approval-summary.tsx` | `app/decisions/page.tsx`, `timeline/enhanced-timeline.tsx` | DEAD |
| `approvals/gate-stamp.tsx` | **no importer** | **ALREADY DEAD** |
| `commercial/journey-stepper.tsx` | see above | **KEEP** |
| `commercial/{awaiting-signature-cards,client-plan-grid,client-selections}.tsx` | project-view tree | DEAD |
| `decision-card-client.tsx`, `decisions/coordination-banner.tsx`, `decisions/DecisionConsentBlock.tsx` | `/decisions`, `/decisions/[id]` | DEAD unless decide absorbed |
| `messages/{MessageAttachmentUploader,ReadReceipt,ThreadSettingsMenu}.tsx` | `app/messages/page.tsx` only | DEAD unless reply absorbed |
| `notifications/notification-bell.tsx`, `notifications/index.ts` | `index.ts` has **no importer** → bell is **already unreachable** | **ALREADY DEAD** |
| `scans/*` (11 files incl. `scene/RoomModel.tsx`, `scene/SceneSetup.tsx` with no importers) | `app/scans/*` | DEAD unless rooms absorbed; `scene/*` already dead |
| `reviews/*` (4 files) | `app/reviews/page.tsx` | DEAD unless reviews absorbed |
| `project/ProjectReviewEdition.tsx` | `app/projects/[projectId]/reviews/[editionId]/page.tsx` | DEAD unless absorbed |
| `projects/ProjectsEmptyState.tsx` | `app/projects/page.tsx` | DEAD |
| `proposal-document.tsx`, `board-block.tsx`, `proposal-line-feedback.tsx` | `/proposals/[id]` **and `/share/[token]`** | **KEEP** — the public share page needs them |
| `commercial-document-shell.tsx`, `commercial-notification-recovery.tsx`, `proposals/{ProposalClarifyButton,ProposalDeclineDialog,ProposalRequestChangeDialog}.tsx` | `/proposals/[id]` only | DEAD unless decline/clarify absorbed |
| `account/{ProfileForm,AvatarUploadField}.tsx` | `/account` | **KEEP** (Mat links there) |
| `auth/{ClientAuthShell,ClientPortalLogin,AcceptInviteForm}.tsx` | auth routes | **KEEP** |
| `auth/QRLoginDisplay.tsx` | **no importer** | **ALREADY DEAD** |
| `error-fallback.tsx` | **no importer** | **ALREADY DEAD** |
| `strata-mark.tsx` | 11 pages + `threshold/doorplate.tsx` | **KEEP** |
| `query-failure.tsx` | 6 pages + 2 components incl. `reviews/ReviewsIndex.tsx` | KEEP while any of those routes survive |
| `help/help-state-setup.tsx` | `app/providers.tsx`, `/proposals/[id]` | **KEEP** (providers) |
| `demo/` | — | **no `src/components/demo/` exists**; the demo pages are self-contained under `src/app/demo/` |
| `threshold/*` (18 files) | the surface | **KEEP** |

### Component counts

- Total non-test component files: **104**
- **Already dead today** (zero importers, before any cutover): **8** —
  `approvals/gate-stamp.tsx`, `auth/QRLoginDisplay.tsx`, `error-fallback.tsx`,
  `notifications/index.ts` (+ `notification-bell.tsx` behind it),
  `scans/scene/RoomModel.tsx`, `scans/scene/SceneSetup.tsx`,
  `timeline/index.ts`, `timeline/project-timeline.tsx`
- **Dead at cutover if nothing is absorbed**: **62** (the project-view tree 14, layout 5,
  making 3, today 3, timeline 5, approvals 2, commercial 3, decisions 3, messages 3,
  scans 9, reviews 4, projects 1, proposals-detail 5, project/ProjectReviewEdition 1, plus
  the already-dead 8 rolled in)
- **Dead only if the matching act is NOT absorbed**: 26 of those 62 (scans 9, reviews 4+1,
  messages 3, decisions 3 + approvals/project-approval-review 1, proposals-detail 5)
- **KEEP**: **34** — `threshold/*` (18), the 7 `making/*` survivors,
  `commercial/journey-stepper.tsx`, `strata-mark.tsx`, `query-failure.tsx`,
  `proposal-document.tsx` + `board-block.tsx` + `proposal-line-feedback.tsx`,
  `auth/*` (3), `account/*` (2), `help/help-state-setup.tsx`, `layout/app-chrome.tsx`

---

## 4. HOOKS (`apps/client-portal/src/hooks`, 14 files)

| Hook | Importers (non-test) | Fate |
|---|---|---|
| `use-auth.ts` | 11 pages/components incl. `threshold/threshold.tsx` (sign-out + user name) | **KEEP** |
| `use-hydrated.ts` | `threshold/threshold.tsx`, `making/the-making.tsx` | **KEEP** |
| `use-commercial-client.ts` | 20+ sites incl. `threshold/{threshold,door-gate,wall-gate}` — exports `useClientPlan`, `useClientSelections`, `clientCommercialDocumentQueryOptions`, `useAcceptTradeScope`, decline/ack fetchers | **KEEP** |
| `use-proposals-client.ts` | `threshold/threshold.tsx`, `making/the-making.tsx`, 4 proposal/budget pages | **KEEP** |
| `use-feature-flag.ts` | 4 non-test sites (below) | **KEEP the file** (generic), but every current read site retires |
| `use-decisions-client.ts` | `/decisions`, `/decisions/[id]` only | **DIES** unless decide absorbed |
| `use-documents-client.ts` | `/documents` + `app/documents/group.ts` only | **DIES** unless sheets absorbed |
| `use-notifications.ts` | `components/notifications/index.ts` (unimported) + test utils | **ALREADY DEAD** |
| `use-progress-analytics.ts` | **none** | **ALREADY DEAD** |
| `use-immersive-timeline.ts` | `timeline/celebration-overlay.tsx` (dead chain) + test factory | **ALREADY DEAD** |
| `use-project-phase-realtime.ts` | `project-view-wrapper.tsx` only | **DIES** at cutover |
| `use-touch-gestures.ts` | `timeline/mobile-timeline-wrapper.tsx` (dead chain) | **ALREADY DEAD** |
| `use-qr-auth.ts` | `auth/QRLoginDisplay.tsx` (unimported) | **ALREADY DEAD** |
| `use-aesthete-matches.ts` | `app/quiz/results/results-view.tsx` | **KEEP** (quiz funnel) |

**Hooks dead: 6 already dead + 3 conditional + 1 at cutover = 4 KEEP-core + 1 quiz + 1 flag = 6 survive, 8 die.**

### `use-feature-flag` read sites — all 5 (`single-pane` ×2, `threshold` ×3)

| Site | Flag | Retires |
|---|---|---|
| `components/making/project-surface-switch.tsx:54` | `threshold` | yes — branch becomes unconditional |
| `components/making/project-surface-switch.tsx:55` | `single-pane` | yes |
| `components/making/single-pane-solo-redirect.tsx:29` | `single-pane` | yes — file deleted |
| `components/layout/threshold-chrome-gate.tsx:28` | `threshold` | yes — file deleted |
| `components/threshold/threshold-route-collapse.tsx:47` | `threshold` | becomes unconditional (or moves into `middleware.ts` as real 308s) |

No other portal or package reads either flag.

---

## 5. TESTS

### Jest

`jest.config.js` — `coverageThreshold.global = { lines: 70, branches: 60, functions: 70, statements: 70 }`,
`collectCoverageFrom: ['src/**/*.{ts,tsx}', …]` excluding only `*.d.ts`, `*.stories.*`,
`src/app/layout.tsx`, `src/app/page.tsx`.

Suites tied to what dies (delete alongside their subject):

- `src/app/__tests__/{error,global-error}.test.tsx` — keep
- `src/app/budget/__tests__/{page,rollup}.test.tsx` — dies with `/budget`
- `src/app/decisions/{page.test.tsx,[id]/page.test.tsx,[id]/decision-realtime.test.tsx}` — dies unless decide absorbed
- `src/app/documents/__tests__/{page,group}.test.*` — dies unless sheets absorbed
- `src/app/invoices/__tests__/page.test.tsx` — dies with `/invoices` list
- `src/app/invoices/[invoiceId]/__tests__/{checkout-return,payment-method-chooser}.test.*` — **keep** if payment absorbed (logic moves)
- `src/app/preferences/__tests__/page.test.tsx`, `src/app/settings/notifications/__tests__/page.test.tsx` — dies unless prefs absorbed
- `src/app/projects/[projectId]/scope-change/{new,[changeId]}/__tests__/page.test.tsx` — dies unless absorbed
- `src/app/proposals/__tests__/{page,error}.test.tsx`, `src/app/proposals/[id]/__tests__/page.test.tsx` — dies with the list/detail
- `src/components/__tests__/{project-view-wrapper,project-overview,project-commercial-summary,project-invoices-summary,ffe-safe-reader}.test.tsx` — dies with the project-view tree
- `src/components/approvals/__tests__/*` (2), `src/components/commercial/__tests__/{awaiting-signature-cards,client-plan-grid,client-selections}.test.tsx` — dies
- `src/components/commercial/__tests__/journey-stepper.test.tsx` — **KEEP**
- `src/components/layout/__tests__/{client-header,app-chrome,threshold-chrome-gate}.test.tsx` — dies with the chrome
- `src/components/making/__tests__/*` (7) — 5 die (`the-making`, `making-masthead`, `project-surface-switch`, `single-pane-solo-redirect`, partly `open-chapter`); `making-spine`, `standing-sentence` KEEP
- `src/components/notifications/__tests__/notification-bell.test.tsx` — already testing dead code
- `src/components/project/__tests__/{ProjectReviewEdition,ProjectTeamPanel}.test.tsx`,
  `src/components/reviews/__tests__/ReviewsIndex.test.tsx`,
  `src/components/scans/ViewerErrorBoundary.test.tsx` — die unless absorbed
- `src/components/timeline/__tests__/{celebration-overlay,enhanced-timeline}.test.tsx` — die
- `src/hooks/__tests__/{use-commercial-client,use-documents-client,use-immersive-timeline,use-notifications,use-project-phase-realtime,use-auth}.test.tsx` — 4 die, `use-auth` + `use-commercial-client` KEEP
- `src/components/threshold/__tests__/*` (19) — **all KEEP**

**Effect on the coverage floor**: coverage is a *ratio*, and the deleted suites cover the
deleted source, so the ratio is roughly preserved — with two asymmetries:
1. The Threshold ships 19 test files against 18 source files, well above the portal average,
   so the surviving ratio should *rise*.
2. But `src/app/**` loses far more *tested* lines than *untested* ones: the ~12 dead API
   route chains (`rooms/*`, `timeline/*`, `feed/*`, `user/data-*`) have **no tests at all**
   and stay in `collectCoverageFrom` unless deleted in the same pass. **Delete the dead API
   routes together with the pages, or the 70/60/70/70 floor will break.**
   Deleting demo pages (1,770 untested lines) *helps* the floor.

### Playwright

`playwright.config.ts` defines **two `projects`** and **two `webServer` entries**:

| Project | testMatch/Ignore | baseURL | Server |
|---|---|---|---|
| `chromium` | ignores `threshold.spec.ts` | `http://localhost:3002` | `pnpm dev`, `reuseExistingServer: true`, **no flag override** |
| `threshold` | only `threshold.spec.ts` | `http://localhost:3102` | `pnpm exec next dev --webpack -p 3102`, `reuseExistingServer: false`, `NEXT_DIST_DIR=.next-threshold`, `NEXT_PUBLIC_FLAG_OVERRIDES=threshold:true` |

At cutover **the split collapses**: one server, `threshold:true` (or no flag at all), one
project. `next.config.js`'s `distDir: process.env.NEXT_DIST_DIR || '.next'` exists only for
this split and can go back to a literal.

Specs that visit old routes:

| Spec | Routes visited | Fate |
|---|---|---|
| `tests/smoke.spec.ts` | `/`, `/auth/signin`, `/auth/error`, **`/dashboard`, `/timeline`, `/notifications`, `/profile`, `/settings`, `/project/<id>`, `/project/<id>/milestone/<id>`, `/project/<id>/approval/<id>`** | mostly **already dead** — none of those bracketed paths exist in `src/app`; it is a 404-tolerant smoke sweep. Rewrite or delete. |
| `tests/projects-load.spec.ts` | `/projects` ×4 | rewrite against the collapsed `/projects` → `/projects/<id>#doorstep` |
| `tests/plan-set.spec.ts` | `/auth/signin`, `/documents` | dies unless the sheet viewer is absorbed |
| `tests/threshold.spec.ts` | `/auth/signin`, `/projects/<id>`, `/invoices` (collapse assertion) | **KEEP — becomes the main suite** |
| `tests/gate-ceremony.spec.ts`, `tests/wp3-screenshots.spec.ts` | `/decisions/<id>` | die unless decide absorbed |
| `tests/wave2-screenshots.spec.ts` | `/share/<token>`, `/proposals/<id>` | share half KEEP |
| `tests/{share-link,field-link,plans-link,spec-book-share}.spec.ts` | token routes | **KEEP** |
| `tests/e2e/*.spec.ts` (account, approvals, project-timeline, projects, quiz, timeline-3d*, timeline-3d-centering) | `/approvals` (no such route), timeline-3d demo | **mostly already dead** — delete with the demos |
| `e2e/timeline-animations.spec.ts` | demo timeline | delete |

---

## 6. CONFIG

| Item | File | Current | Action at cutover |
|---|---|---|---|
| PWA shortcuts | `public/manifest.json` | `"View Projects" → /projects`, **`"Pending Approvals" → /approvals`** | ⚠ **`/approvals` has no page in `src/app` — the shortcut is already a 404.** Replace both with `/projects` (or the solo project's `#doorstep`) |
| PWA start_url / scope | `public/manifest.json` | `/` | fine — `/` redirects to `/projects` which collapses |
| Service worker | `public/sw.js` + `public/workbox-89257885.js` (committed build output) | `next-pwa` `NetworkFirst` for `^https?.*`, 150 entries / 30 days | a cached old-route HTML can outlive the deploy; bump/regenerate. Note `next.config.js` skips `withPWA` entirely when `OPEN_NEXT=true`, so the **Cloudflare build ships no SW at all** — the risk is only for stale installs |
| Auth destination | `src/middleware.ts` (line with `safeAuthReturnPath(..., '/projects')`) | signed-in users on an auth page land on `/projects` (or a sanitized `callbackUrl`) | ⚠ **the string `CLIENT_AUTH_DESTINATION` does not exist anywhere in the repo** — the constant named in the brief is the literal `'/projects'` here, plus `route-collapse.ts`'s doc comment referring to it. Point it at the solo project, or leave it and let `ThresholdRouteCollapse` hop |
| Public-page allowlist | `src/middleware.ts` | `/`, `/demo`, `/auth/invite/`, `/quiz`, `/share/`, `/field/`, `/rfq/`, `/evidence/`, `/plans/`, `/piece/` | ⚠ **`/preferences/unsubscribe` is NOT public.** `GET /api/unsubscribe` redirects there, so a signed-out recipient is bounced to `/auth/signin?callbackUrl=/preferences/unsubscribe…`. Fix in the same pass |
| Role gate | `src/middleware.ts` | service-role `user_roles` lookup; tri-state fail-open-but-loud with `x-patina-role-check: skipped` | unchanged |
| Demo gate | `src/middleware.ts` | `env.isProduction && /demo` → `/` | delete with the demo pages |
| `/proposals` IP header | `src/middleware.ts` | sets `x-client-ip` for `/proposals*` | ⚠ **the sign act now lives at `/api/proposals/[id]/sign` called from `/projects/<id>`** — `src/lib/utils/client-ip.ts:12` already notes API routes don't match. Verify signature IP capture still works from the Threshold |
| Next redirects | `next.config.js` | **none** — no `async redirects()` at all | add 308s for the 9 collapsed routes here (or in middleware) instead of the client-side `router.replace` in `ThresholdRouteCollapse` |
| `distDir` | `next.config.js` | `process.env.NEXT_DIST_DIR \|\| '.next'` | revert once the two-server Playwright split goes |
| `typescript.ignoreBuildErrors` | `next.config.js` | `true` | ⚠ the client portal's build does **not** gate types — deleting files will not fail the build; run `pnpm --filter @patina/client-portal type-check` explicitly |
| Prod flag pin | `wrangler.jsonc` `vars` | `"NEXT_PUBLIC_FLAG_OVERRIDES": "threshold:false"` | **must be removed** at cutover — `parseFlagOverride()` in `use-feature-flag.ts` short-circuits PostHog entirely with no env guard |
| Staging vars | `wrangler.jsonc` `env.staging.vars` | **no `NEXT_PUBLIC_FLAG_OVERRIDES` key** | staging follows PostHog, which "currently evaluates true for EVERY client" per the top-level comment |
| Other prod vars | `wrangler.jsonc` | `NEXT_PUBLIC_SUPABASE_STORAGE_KEY` pin, service bindings `SVC_PROJECTS/SVC_ORDERS/SVC_MEDIA` | ⚠ the three service bindings exist for the timeline proxies + media; if the timeline routes go, only media/orders bindings remain justified |
| Nav config | `src/components/layout/nav-config.ts` | 7 items | deleted |

---

## 7. DATABASE / EDGE

### RPCs reached only through routes that die

| RPC / read | Reached from | After retirement |
|---|---|---|
| `get_client_project_selections` | `apps/mobile/Patina/Patina/Core/Network/ProjectsAPIClient.swift:249` **only** | **iOS-only.** Web reads `get_client_project_threshold` instead (`hooks/use-commercial-client.ts:106`). `00565_the_client_page.sql:17` explicitly leaves it untouched. Keep and document as an iOS contract. |
| `useAllDecisions`, `useClientDecision`, `useDecisionComments`, `useCreateDecisionComment`, `useDecisionRealtime` | `/decisions`, `/decisions/[id]` | orphaned unless decide is absorbed |
| `useClientDocuments`, `useClientPlanSet` | `/documents` | orphaned unless sheets absorbed |
| `useDirectOrders`, `useStartDirectOrderCheckout` | `/orders` | orphaned unless direct orders absorbed |
| `useThreads/useThread/useThreadMessages/useSendMessage/useMarkThreadRead/useTypingIndicator` | `/messages` | orphaned unless reply absorbed |
| `useInboxNotifications/useInboxMessages/useUnreadInboxCount` | `/inbox` + the dead bell | orphaned |
| `useNotificationPreferences/useUpdateNotificationPreferences/useMyThreadOverrides/useUpdateThreadNotificationPref/useMuteThread` | `/preferences`, `/settings/notifications` | orphaned unless prefs absorbed |
| `useCreateClientScopeChangeRequest/useApproveScopeChange/useDeclineScopeChange/useCancelClientScopeChangeRequest/useScopeChangeRequest` | scope-change routes | orphaned unless absorbed |
| `useStartCheckout`, `useNotifyCheckIntent`, `useInvoicePaymentOptions` | `/invoices/[invoiceId]` | ⚠ **must move with the payment act** |
| projects-service timeline endpoints (`/timeline/immersive`, `/celebrations`, `/segment/*`, `/analytics/*`) | dead hook chain | already orphaned — the NestJS projects service keeps serving them for nobody |

RPCs the Threshold itself needs (keep): `mark_project_read`, `previous_reading_mark`,
`get_client_project_threshold`, `useProjectInvoices`, `useProjectRooms`, `useProjectNotes`
(+ realtime), `useProjectParties`, `useProjectTeamMembers`, `useStudioIdentity`,
`useProjectApprovals` / `useMyProjectApprovalReviews`, `useClientPlan`, `useAcceptTradeScope`.

### Email / SMS / notification templates pointing at routes that move

| Producer | Link | Status after retirement |
|---|---|---|
| `supabase/functions/invoice-send/index.ts:249,303` | `/invoices/<id>` + `deep_link` | **survives** (route kept) |
| `supabase/functions/invoice-reminders/index.ts:342,364` | `/invoices/<id>` | survives |
| `supabase/functions/stripe-webhook/index.ts:392,439,490,528` | `/invoices/<id>` | survives |
| `supabase/functions/stripe-webhook/index.ts:1282,1297,1367` | `/orders?order=<id>` | ⚠ **breaks** — `/orders` collapses to `#road`, which has no order detail |
| `supabase/functions/create-checkout-session/index.ts:279-280` | `/invoices/<id>?checkout=success\|cancelled` | survives — **`checkout-return.ts` must move with the payment act** |
| `supabase/functions/create-checkout-session/index.ts:657-658` | `/orders?order=<id>&checkout=…` | ⚠ **breaks** with `/orders` |
| `supabase/functions/proposal-sign-confirmation/index.ts:121` | `/proposals/<id>` | survives if `/proposals/[id]` kept; else needs `#previously` |
| `supabase/functions/proposal-nudge/index.ts:185` | `/proposals/<id>` | same |
| `supabase/functions/commercial-document-notify/index.ts:379-382` | `/budget` \| `/invoices` \| `/proposals/<id>` | `/budget` and `/invoices` collapse cleanly (`#ledger`, `#letterbox`) |
| `supabase/functions/proposal-send/index.ts:256` | `deep_link: input.dispatch.clientPortalPath` | audit the caller's path values |
| `supabase/functions/client-invite/index.ts:125` | `/auth/invite/<token>` | survives |
| `supabase/functions/notification-digest/index.ts:81,145` | `${CLIENT_PORTAL_URL}${deepLink}` and `/decisions` | `/decisions` collapses to `#doorstep`; arbitrary `deepLink` values need the redirect map |
| `supabase/functions/review-requests/index.ts:70` | `${CLIENT_PORTAL_URL}/review/${projectId}` | ⚠ **already broken** — singular `/review/`; no such route exists today |
| `supabase/functions/comms-mute/index.ts:60` | `client.patina.cloud/messages/${threadId}` | ⚠ **already broken** — no `/messages/[threadId]` route exists |
| `supabase/functions/selection-review-send` | `/projects/<id>/reviews/<editionId>` | survives only if that route is kept/absorbed |
| `supabase/functions/trade-rfq-send/lib.ts:338,379` | `/rfq/preview`, `/rfq/<token>` | survives (⚠ `/rfq/preview` has no page — `[token]` catches it) |
| `supabase/functions/_shared/sms.ts:283`, `site-request-dispatch/core.ts:125` | `/field/<token>` | survives |
| `supabase/functions/campaign-dispatch/index.ts:413`, `_shared/send-email.ts:160`, `packages/email/src/send.ts:234` | `${PORTAL_URL}/api/unsubscribe?token=` | survives (API route) — but see the auth-gate bug in §6 |

`notification_log.metadata.deep_link` literals written by migrations that land on the client
portal: `'/decisions/<id>'` (`00399:3887`, `00464:2316`) and
`'/portal/billing/invoices/<id>'` (`00280:93` — ⚠ **a designer-portal-shaped path that has
never resolved on the client portal**). The `/doc/…`, `/desk?…`, `/work/…/site/…` deep links
are designer-portal targets and are unaffected.

`packages/email/src` and `packages/notifications/src` contain **no hard-coded
`client.patina.cloud` route strings** — every client-portal deep link is assembled in
`supabase/functions/*` from `CLIENT_PORTAL_URL`. That is the single choke point for a
redirect map.

---

## 8. THE THRESHOLD TODAY — the completion gaps

What the Threshold performs in place today:

| Act | Where | Call |
|---|---|---|
| **sign** a commercial document (all kinds) | `components/threshold/door-gate.tsx:176` | `POST /api/proposals/[id]/sign` + `invalidateSignedCommercialDocument` |
| notification replay after signing | `door-gate.tsx:229` | `POST /api/proposals/[id]/notifications/replay` |
| **accept** a trade scope (typed name) | `components/threshold/wall-gate.tsx:115,164` | `useAcceptTradeScope` → `POST /api/trade-scopes/[id]/accept` |
| mark project read (the "since yesterday" mark) | `threshold.tsx:258` | `useMarkProjectRead` / `usePreviousReadingMark` |
| **sign out** | `components/threshold/mat.tsx` (`onSignOut`), wired at `threshold.tsx:604` | `useAuth().signOut` |
| toggle the since-yesterday reading | `doorstep.tsx` / `since-yesterday.tsx` | local state |
| anchor navigation (plan key, note enclosures, mat papers) | `plan-key.tsx:142,156`, `the-note.tsx:123`, `mat.tsx:51` | in-page `#` hrefs |

What it does **not** do — the completion list, in the order the old routes made them matter:

| Gap | Old surface | What has to move |
|---|---|---|
| **1. Approve/decide in place** | `/decisions/[id]` + `components/approvals/project-approval-review.tsx` | `threshold.tsx:207`'s `DoorstepApproval` currently links out. Needs the six-part gate ceremony (comment, consent, HELD/approved stamps, realtime) inside `#doorstep`. Hooks: `useClientDecision`, `useProjectApprovalByDecision`, `useCreateDecisionComment`, `useDecisionRealtime` |
| **2. Pay an invoice in place** | `/invoices/[invoiceId]` (752 lines) | `spine-toll.tsx:112` links out. Needs `useStartCheckout` + `useInvoicePaymentOptions` + `PaymentMethodChooser` + `checkout-return.ts` + `useNotifyCheckIntent` inside `#letterbox`. **Stripe success/cancel URLs point at `/invoices/<id>`**, so the route must survive or the edge function must be repointed at `/projects/<id>?checkout=…#letterbox` |
| **3. Every invoice, not just the soonest** | `/invoices` list | `model.letterbox` is a single invoice; paid history has nowhere to live |
| **4. Decline / request change / clarify a document** | `/proposals/[id]` | DoorGate signs only. Needs `ProposalDeclineDialog`, `ProposalRequestChangeDialog`, `ProposalClarifyButton` (which links to `/messages`), `POST /api/proposals/[id]/decline` |
| **5. Message reply** | `/messages` | `#note` is read-only. Needs `useSendMessage`, `useThreadMessages`, `useMarkThreadRead`, `useTypingIndicator`, attachments, and a `/messages/[threadId]` equivalent (`comms-mute` already links to one that does not exist) |
| **6. Documents / plan-sheet viewer** | `/documents` | `#mat-papers` lists labels with in-page anchors only. Needs `useClientDocuments`, `useClientPlanSet`, sheet open + download |
| **7. Room scans viewer** | `/scans`, `/scans/[scanId]` | Threshold uses `useProjectRooms` for the plan key's geometry, never renders a scan. Needs `ClientRoomScanViewer` + `RoomScanShareStatus` + **share/revoke** (`ShareScanDialog`) |
| **8. Reviews** | `/reviews`, `/projects/[id]/reviews/[editionId]` | no review submit anywhere on the Threshold. Also fix `review-requests/index.ts:70`'s broken `/review/<id>` link at the same time |
| **9. Scope-change request + decide** | `/projects/[id]/scope-change/{new,[changeId]}` | 5 mutation hooks, `ChangeRequestForm` from the design system |
| **10. Direct orders + marketplace checkout** | `/orders` | `#road` is a read-only drawing. `useDirectOrders`, `useStartDirectOrderCheckout`, and the `?order=…&checkout=…` return handling. **`stripe-webhook` and `create-checkout-session` both link at `/orders`** |
| **11. Account / preferences / notification settings / unsubscribe** | `/account` (linked ✅), `/preferences`, `/settings/notifications`, `/preferences/unsubscribe` | Mat reaches `/account` only. Two duplicate preference pages need merging; unsubscribe needs the middleware public-list fix |
| **12. Notifications inbox** | `/inbox` + `notification-bell.tsx` (already unreachable) | every `notification_log` deep link renders here. Nothing on the Threshold shows notifications |
| **13. Project switching for multi-project clients** | `components/layout/project-switcher.tsx` (inside the header) | ⚠ **hard blocker.** `ThresholdChromeGate` keeps the header for `projectCount > 1` and `ThresholdRouteCollapse`/`SinglePaneSoloRedirect` only fire for `projectIds.length === 1`. Retiring the header removes the **only** way a two-project client changes project. The Threshold needs its own switcher (a line on the Doorplate or the Mat) before the chrome can go for everyone |
| **14. Editorial "Today" feed** | `/today` | no equivalent; iOS also consumes `/api/stories/today` and `/api/feed/[roomId]`, so the endpoints stay even though the page goes |

### Suggested cutover order

1. Delete what is already dead (8 components, 6 hooks, ~12 API routes, 3 demo pages, dead specs) — no behavior change, and it protects the coverage floor.
2. Fix the three already-broken links (`manifest.json` `/approvals`, `review-requests` `/review/`, `comms-mute` `/messages/<id>`) and the `/preferences/unsubscribe` auth gate.
3. Absorb gaps 1, 2, 5 (decide, pay, reply) — the three acts that carry email/Stripe/iOS deep links.
4. Add the multi-project switcher (gap 13), then drop `ThresholdChromeGate` and the header.
5. Convert `ThresholdRouteCollapse` into real 308 redirects in `middleware.ts`/`next.config.js`; remove `NEXT_PUBLIC_FLAG_OVERRIDES` from `wrangler.jsonc`; collapse the two Playwright servers to one.
6. Absorb gaps 6–12; delete the routes and their component trees.
