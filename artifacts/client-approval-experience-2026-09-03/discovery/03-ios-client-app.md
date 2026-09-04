# iOS client app — approvals & proposals discovery

Scope: `apps/mobile/Patina` (Patina, the homeowner/client app), the "Daily
Return" home-screen program (`artifacts/ios-daily-return-2026-08-26/`), and
`apps/mobile/Capture` (Patina Field, the designer/trades app) for contrast.
All paths are relative to `/Users/kody/Code/patina-merged` unless noted.
`.build/`, `DerivedData/`, and `.xcworkspace` were excluded from every search.

**Headline finding, up front:** the premise that the client app has no
approval surface is wrong. Patina (client) ships a full, wired,
production-grade approval and e-signature system — Decisions, Proposals,
and Invoices — with its own API clients, view models, consent/e-sign UI,
push notifications, universal-link deep linking, and a "Daily Return" home
feed that surfaces open approvals every day. This was built across three
Wave-2/Wave-3 programs (visible in code comments as "D.1", "D.2", "D.4",
"SP-04", "SP-08", "SP-15", "SP-17") and was walked end-to-end with
screenshots on 2026-08-26–28. What is genuinely absent is covered in §8.

---

## 1. The client approval surfaces in Patina (client app)

### 1.1 Decisions — designer-authored multiple-choice approvals

**Feature**: A designer poses a decision ("Rug color — Natural vs Sand")
with 1+ options (image, note, price, product link); the client reviews the
options and either chooses one (with consent/e-signature) or defers
("Not yet" / "Neither of these", which sends a message instead of
resolving the decision).

- **Screens**: `DecisionListView` (`apps/mobile/Patina/Patina/Features/Decisions/Views/DecisionListView.swift`)
  — list of pending decisions, header copy "Awaiting your call"
  (line 37); `DecisionDetailView`
  (`apps/mobile/Patina/Patina/Features/Decisions/Views/DecisionDetailView.swift`)
  — option cards with a "Choose this" CTA per option (line 271-279) and a
  `DecisionConsentSheet` (same file, lines 368-448) that captures either a
  click-through or a typed e-signature ("Add my signature… Type your full
  name to e-sign this approval.", lines 401-407) before calling `apply_client_decision`.
- **View model**: `DecisionsViewModel.swift`
  (`apps/mobile/Patina/Patina/Features/Decisions/ViewModels/DecisionsViewModel.swift`)
  — `DecisionsListViewModel` (list) and `DecisionDetailViewModel` (detail +
  selection + deferral). Selection flow: `beginSelection(optionId:)` →
  consent sheet → `confirmSelection(decisionId:consent:signature:)` (lines
  201-239).
- **Service/API**: `DecisionsAPIClient.swift`
  (`apps/mobile/Patina/Patina/Core/Network/DecisionsAPIClient.swift`), an
  `actor` that talks PostgREST directly (not the Supabase Swift SDK) against
  `client_decisions` / `client_decision_options`.
  - Reads: `listPending()` (status `eq.pending`, ordered
    `due_date.asc.nullslast,created_at.desc`, lines 250-255),
    `fetchDecision(id:)`, `listOptions(forDecision:)`.
  - Writes: `markViewed(decisionId:)` → RPC `mark_client_decision_viewed`
    (lines 333-344); `selectOption(decisionId:optionId:consent:signature:)`
    → RPC `apply_client_decision` (lines 354-377), passing
    `p_client_consent_method` (`click_through` | `electronic_signature`) and
    `p_client_signature`.
  - RLS: gated to the `designer_clients.client_id = auth.uid()` participant
    (file header comment, migrations 00062/00064).
- **Push handling**: `DecisionPushHandler.swift`
  (`apps/mobile/Patina/Patina/Features/Decisions/DecisionPushHandler.swift`)
  recognizes three push types emitted by backend RPCs
  `notify_decision_required/overdue/resolved`
  (`DecisionPushType`: `.required`, `.overdue`, `.resolved`, lines 32-38),
  each with its own SF Symbol, default title (e.g. "A decision needs you"),
  and urgency flag (`isActionRequired`).
- **Deferral (not an approval, but the client's other honest answer)**:
  `DecisionDeferral.swift`
  (`apps/mobile/Patina/Patina/Features/Decisions/DecisionDeferral.swift`)
  — "Not yet" and "Neither of these" both compose an editable message
  ("About \(subject) — not yet. I need a little more time before I
  decide.") sent into the project's comms thread; the decision's `status`
  stays `pending` because the CHECK constraint has no "deferred" value
  (comment, lines 9-13).

### 1.2 Proposals — designer-authored scope/price documents, e-signed

**Feature**: A full "typography-first document" (narrative sections,
line items, payment schedule/milestones, phases, exclusions, scope rooms,
mood boards as a thumbnail grid) that the client reviews and e-signs by
typing their full legal name. Signing runs an atomic RPC that accepts the
proposal and (by default) activates the project.

- **Screens**: `ProposalListView.swift`
  (`apps/mobile/Patina/Patina/Features/Proposals/Views/ProposalListView.swift`)
  — three sections: "Awaiting your review", "Accepted", "Archive" (lines
  58-64), header copy "Your design proposals"; `ProposalDetailView.swift`
  (`apps/mobile/Patina/Patina/Features/Proposals/Views/ProposalDetailView.swift`)
  — header, investment summary, document blocks (sections/phases/
  milestones/exclusions/scope rooms/boards via `ProposalDetailBlocks.swift`
  and `ProposalBoardsGrid.swift`), then a sign footer; `ProposalSignSheet.swift`
  (`apps/mobile/Patina/Patina/Features/Proposals/Views/ProposalSignSheet.swift`)
  — restates the terms being agreed to (project, total, deposit/retainer
  label+amount, payment terms, expiry — composed by
  `ProposalSignTerms.swift`, "Nothing here is invented… the client signs
  what the server said, never what the app composed", lines 10-13) above a
  "Full name" signature field, copy: "Type your full name to e-sign.
  Signing confirms the scope and kicks off your project." (line 46).
- **View model**: `ProposalsViewModel.swift`
  (`apps/mobile/Patina/Patina/Features/Proposals/ViewModels/ProposalsViewModel.swift`)
  — `ProposalListViewModel` partitions `pending`/`accepted`/`archived`
  (lines 21-34, mirrors the client portal's `partitionProposals`);
  `ProposalDetailViewModel.sign(proposalId:name:)` (lines 130-144).
- **Service/API**: `ProposalsAPIClient.swift`
  (`apps/mobile/Patina/Patina/Services/API/ProposalsAPIClient.swift`) — this
  one uses the Supabase Swift SDK's `.rpc()`, not raw PostgREST. Reads go
  exclusively through client-safe JSON RPCs (`listReadRPC =
  "list_client_proposals"`, `detailReadRPC = "get_client_proposal_bundle"`,
  lines 274-275) — the file header explains why: "row-level policies cannot
  protect trade pricing or internal columns on authored proposal tables"
  (line 6-7). Sign: `sign_proposal` RPC (SECURITY DEFINER, idempotent,
  lines 405-418), then a best-effort call to the edge function
  `proposal-sign-confirmation` for the confirmation email (lines 420-430,
  because the RPC itself does not send it). Board images are re-signed via
  Supabase Storage `createSignedURL` after the bundle loads (lines 337-357).
- **Status vocabulary discipline**: `ProposalStatusDisplay.swift`
  (`apps/mobile/Patina/Patina/Features/Proposals/ProposalStatusDisplay.swift`)
  deliberately keeps "Accepted" (server status) and "Signed" (has an actual
  signature record) as separate labels — a comment explains a prior bug
  where the app told a client she'd signed a $100,000 proposal she hadn't
  (lines 5-9).

### 1.3 Invoices — pay via Stripe Checkout hand-off

Not a decision/consent flow, but the third leg of the "money rail" and the
third thing pushed to the client. `InvoicesViewModel.swift`
(`apps/mobile/Patina/Patina/Features/Invoices/ViewModels/InvoicesViewModel.swift`)
partitions `open`/`paid`/`archived` invoices; `InvoiceDetailView.swift`
starts a Stripe Checkout session and hands off to an in-app
`SFSafariViewController`, then polls (3s interval, ~60s deadline) for the
webhook-driven status flip rather than trusting a `patina://` return deep
link (comment, lines 6-8 of the view model: "R30: poll-first… no patina://
deep link this wave").

### 1.4 Documents — read-only, but adjacent

`DocumentsViewModel.swift`
(`apps/mobile/Patina/Patina/Features/Documents/DocumentsViewModel.swift`)
lists client-visible documents grouped by project and opens them via a
download-then-QuickLook flow (`DocumentQuickLook.swift`). Explicitly
read-only — no approval action lives here; it mirrors the client portal's
`/documents` page.

### 1.5 Answering the brief's explicit question

**Is there ANY surface where a homeowner can view a proposal or an approval
request and act on it?** Yes, unambiguously: Decisions (choose an option +
consent/e-sign, or defer) and Proposals (review the full document + e-sign)
are both live, RLS-scoped, RPC-backed action surfaces, not read-only
mirrors. Invoices adds a third "act on it" surface (pay), one step removed
from a pure approval. All three are grouped under the same "Studio" tab
(§1.6) and are the three things `PushPrimerView`'s copy names by name (see
§4).

### 1.6 Where these sit in navigation

Every one of these routes belongs to the `.studio` tab, never a standalone
tab of its own — see `RouteTabTable.swift`
(`apps/mobile/Patina/Patina/Features/Navigation/RouteTabTable.swift`, lines
59-76): `.decisionList`, `.decisionDetail`, `.proposalList`,
`.proposalDetail`, `.invoiceList`, `.invoiceDetail`, `.documentList`,
`.budget`, `.orderList`, `.orderDetail` are all Studio-tab routes, listed
alongside `.projectList`, `.threadList` (messaging) and `.notifications`.
`Coordinator.swift`
(`apps/mobile/Patina/Patina/App/Coordinators/Coordinator.swift`, lines
94-121) documents these as "MVP v1 expanded — client surfaces" (Decisions),
"Wave 2 — money rail: proposals + e-sign (D.1)", "Wave 2 — money rail:
invoices + pay (D.2)", "Wave 3 … + shared documents (D.4)". The Studio hub
(`StudioHubView.swift` / `StudioQueueBuilder.swift`,
`apps/mobile/Patina/Patina/Features/Profile/ViewModels/StudioQueueBuilder.swift`)
composes an "Awaiting you" section whose count
(`StudioAttentionSummary.awaitingCount`, line 27-29) is
`pendingDecisions.count + pendingProposals.count + payableInvoices.count` —
the same three-way count `BadgeCountService.attentionCount`
(`apps/mobile/Patina/Patina/Services/Badges/BadgeCountService.swift`, line
73) drives for the tab badge.

---

## 2. The "Daily Return" program and where an approval sits in it

`artifacts/ios-daily-return-2026-08-26/` documents a full review + build
program (`RESUME.md`) commissioned by Kody: "Review the Patina iOS
application and create a presentation outlining how the UI and UX flow
could be updated to make the application more sticky and make users want
to return and use it everyday. And eventually purchase through the app."
Six waves (W1a–W6) landed on `main` between 2026-08-27 and 2026-08-28,
building the home-screen model the approval surfaces above now feed.

### 2.1 The home-screen model: "The Record"

`HouseRecord.swift`
(`apps/mobile/Patina/Patina/Features/Home/Models/HouseRecord.swift`) is the
data model behind the Today tab's home card. Its own header comment: "what
moved on your house while you were away, and what is waiting on you." It
has exactly two eyebrows:

- **NEEDS YOU** — up to 3 rows, ascending by the date each was asked,
  never window-filtered ("an open obligation does not age out of view.
  Nothing decays", line 253). Kinds: `.decisionAsked`, `.proposalSent`,
  `.invoiceDue` (lines 25-27). Built directly from the same
  `StudioQueueBuilder.itemizedAwaitingRows(decisions:proposals:invoices:...)`
  the Studio hub's "Awaiting you" section uses (lines 243-250), specifically
  so the two surfaces can never disagree about the count.
- **MOVED** — up to 3 rows, newest first, filtered to a rolling 7-day
  window (widened back to the last visit if that was longer ago). Kinds
  include `.messageReceived`, `.orderMoved`, `.savedPieceRepriced`,
  `.savedPieceWithdrawn`, `.story`, `.matchedDesigner`.

**Row copy for approvals, verbatim** (`HouseRecordBuilder.title(for:)`,
lines 407-419):
- Decision with a named question: `"\(designer first name) asked about
  \(question)."` (e.g. "Leah asked about Rug color — Natural vs Sand.")
- Decision with no question: `"\(subject) asked you to choose."`
- Proposal: `"\(subject) sent a proposal to review."`
- Invoice: `"Your invoice is due."`

State rendering (`state(for:now:)`, lines 440-452): invoices show
`.amount(cents:due:)`; decisions/proposals show `.overdue` or `.due(Date)`
computed from the item's own due date, with red styling reserved for
`.overdue`.

This is a genuinely well-specified "approval slots into the daily home
screen" answer: NEEDS YOU is exactly the approval inbox, ordered by
urgency, never silently decaying, capped at 3 with a "See all" overflow
into the full list screens (§1.1/1.2). `HouseRecordRow`'s `route` field
round-trips straight into `AppRoute.decisionDetail` / `.proposalDetail` /
`.invoiceDetail` via a `RouteToken` (lines 125-167), so tapping a NEEDS YOU
row on the home screen opens the exact same approval/e-sign UI documented
in §1.

### 2.2 What a client sees daily, and existing screenshots

The Daily Return walkthrough (`artifacts/ios-daily-return-2026-08-26/shots/`)
captured the full client session, in order, including the approval
surfaces:

- `c-02-home-immediately-after-signin.png`, `c-03-home-top-activeproject.png`,
  `c-04-home-scrolled-studio-rows.png` — the home/Record screen.
- `c-04b-your-studio-hub.png`, `c-06b-studio-awaiting-you.png`,
  `c-06c-studio-bottom.png`, `c-06d-studio-money-documents.png` — the
  Studio hub, including its "Awaiting you" block.
- `c-09-proposals-list.png`, `c-10-proposal-detail-top.png`,
  `c-11-proposal-detail-scrolled.png`, `c-11b-proposal-sign-act.png`,
  `c-11c-sign-sheet.png` — the full proposal review + sign flow.
- `c-12-invoices-list.png`, `c-13-invoice-detail.png`,
  `c-13b-invoice-detail-scrolled.png`, `c-14-pay-handoff.png` — invoices +
  Stripe Checkout hand-off.
- `c-17-decisions-list.png`, `c-18-decision-detail.png` — the decisions
  list and detail (option cards + choose CTA).
- `d-06b-home-with-active-room.png`, `d-07-proposal-detail.png`,
  `d-08-invoice-detail.png`, `d-09-companion-panel.png`,
  `d-10-notifications.png` — a second (dark-mode) pass over the same
  surfaces.

`RESUME.md` (lines 17-27) documents each wave: **W2 "the Record"** (ruling
R1 "now": Record card, designer seat, house rail, migrations 00537-00538)
is the wave that built the home-screen model described in §2.1.

---

## 3. Patina Field's QRApprove and Decisions (contrast: not client approvals)

### 3.1 QRApprove is portal-login auth, not a client-facing approval

Confirmed by direct comparison of both implementations:

- **Patina (client)**: `Features/QRAuth/` — `QRAuthModels.swift`
  (`apps/mobile/Patina/Patina/Features/QRAuth/Models/QRAuthModels.swift`)
  defines `QRAuthSession` (a scanned session token + expiry + browser info)
  and parses URLs of the form
  `patina://auth?session=<64-hex>&exp=<unix>&browser=&os=&loc=`.
- **Capture (Field)**: `Features/QRApprove/` is a documented **port** of
  the same flow — see `apps/mobile/CLAUDE.md`: "QR portal-login approval
  (scan a portal sign-in QR, confirm with Face ID/Touch ID) is implemented
  in both apps: `Patina/Patina/Features/QRAuth/` is the original
  implementation; `Capture/Capture/Features/QRApprove/` is a port of it,
  rebuilt on CaptureKit's seams." The shared protocol,
  `PortalAuthApprovalService`
  (`apps/mobile/Capture/CaptureKit/CaptureKit/Work/PortalAuthApprovalService.swift`,
  lines 40-47), has exactly three methods: `parse(qrPayload:)`,
  `approve(_:)`, `reject(_:)` — all against a `FieldPortalAuthRequest`
  carrying `nonce` (the session token), `portalHost` (e.g.
  "app.patina.cloud"), `expiresAt`, and `browserLabel`. The file header
  (lines 4-9) is explicit: "approve (or reject) a **web portal login** by
  scanning its QR code."

**Three-sentence summary**: QRApprove in Patina Field is a device-pairing
mechanism, not a client approval — a designer or trades user scans a QR
code shown on a browser trying to sign into the designer/admin portal, and
the phone (already authenticated, Face ID/Touch ID gated) approves or
rejects that login. It is a straight rebuild of the client app's own
`QRAuth` feature (`apps/mobile/Patina/Patina/Features/QRAuth/`) onto
CaptureKit's service-seam architecture, sharing the exact wire format
(`patina://auth?session=…`) and consuming `SupabasePortalAuthApprovalService`
as its concrete implementation. It never touches `client_decisions`,
`proposals`, or `invoices` — it authenticates a browser tab, nothing more.

### 3.2 Does Field have a "send approval"/"send proposal" action?

**Not found.** `grep -rniE 'send.?approv|send.?proposal|create.?proposal|issue.?proposal'`
across all of `apps/mobile/Capture` returned zero matches. Field's own
`Features/Decisions/` is explicitly read-only:
`SupabaseDecisionsReadService.swift`
(`apps/mobile/Capture/Capture/Features/Decisions/SupabaseDecisionsReadService.swift`,
header comment) reads `client_decisions`/`client_decision_options`
directly and is titled "Wave D (Decisions, read-only)". `DecisionListScreen.swift`
(same directory) states the intent directly: "Read-only: this is visibility
into what's waiting on a client, not an inbox to act on — tapping a row
only opens D2's read-only detail." There is no `DecisionsWriteService`, no
`ProposalsReadService`/write counterpart, and no proposal feature folder at
all under `Capture/Capture/Features/`. Designers author and send
proposals/decisions exclusively from the designer portal (Next.js,
`apps/designer-portal`) — Field only lets a designer *see* what is pending
on a client, never send or resolve it from the phone.

---

## 4. Push notifications

**Both apps register for APNs**, but only the client app's push
infrastructure is wired to approvals.

- **Registration**: `PushTokenService.swift`
  (`apps/mobile/Patina/Patina/Services/API/PushTokenService.swift`) —
  `requestAuthorizationAndRegister()` (lines 66-77) is called from exactly
  one sanctioned site, `PushPrimerView` (§4.1), never at cold launch. Token
  upload upserts into `device_push_tokens` (`user_id`, `token`, `platform:
  "ios"`, `environment`) keyed by the current session user (lines 130-157).
  Per-token `aps-environment` is derived from the embedded provisioning
  profile at registration time, never inferred from `#if DEBUG` (I66,
  lines 187-256) — because this project's Release signing has shipped
  `development`-entitled builds before.
- **Delivery/routing**: `AppDelegate.swift`
  (`apps/mobile/Patina/Patina/App/AppDelegate.swift`) implements
  `UNUserNotificationCenterDelegate`; a tap resolves through
  `NotificationRouter.resolve(apnsUserInfo:)` to an `AppRoute` and marks
  the originating `notification_log` row opened.
- **Entitlement**: `apps/mobile/Patina/Patina/Patina.entitlements` has
  `aps-environment: development`.
- **Device-token table**: `device_push_tokens`, created in migration
  `supabase/migrations/00335_device_push_tokens.sql`, touched again by
  `00536_client_side_server_gaps.sql`, `00538_client_account_anonymize.sql`,
  `00539_saved_item_note_and_presence.sql`.
- **Send edge function**: `supabase/functions/apns-send/` — `core.ts`
  builds the JWT-signed APNs payload (`{ aps: { alert, sound }, entity_type,
  entity_id, notification_log_id }`, lines 61-73), resolves each token's
  sandbox/production host per-token (never guessed, lines 46-53), and marks
  dead tokens (410 / `BadDeviceToken` / `Unregistered`) for deletion (lines
  109-114).
- **Notification categories that exist**, from `notification_log.type` /
  `entity_type` values written by backend RPCs (grep across
  `supabase/migrations/`):
  - Decisions: `decision_required`, `decision_overdue`, `decision_resolved`
    (`notify_decision_required/overdue/resolved`, first defined in
    `00173_decision_notifications.sql`, redefined through
    `00399_journey_authority_integrity.sql`, `00413`, `00415`, `00464`,
    `00465_project_approval_notification_traceability.sql`).
  - Proposals: `proposal_sent` (e.g. `00534_client_attention_notifications.sql`
    line 256; also read by the onboarding drip in
    `00561_onboarding_drip_state_triggers.sql`).
  - Invoices: covered by the shared `notify_client_attention(...)` helper
    added in `00534_client_attention_notifications.sql` — one `in_app`
    row (never deleted by a push failure) plus one `push` envelope row per
    event, deduplicated per `(user, entity_type, entity_id)` (comment,
    lines 1-40 of that migration).
- **The primer's promise, verbatim** (`PushPrimerView.swift`
  `apps/mobile/Patina/Patina/Features/Notifications/Views/PushPrimerView.swift`,
  line 24): *"We'll tell you when your designer sends something that needs
  you — a decision, a proposal, or an invoice. Nothing else."* This is
  presented once, gated on the client's first "money moment"
  (`PushPrimerTrigger.shouldPresent`, lines 77-102) — deliberately not at
  cold launch (ruling Q7, file header comment lines 1-16).

**Capture (Field)**: also registers for APNs (grep hits in
`apps/mobile/Capture` for `apns`/push infra exist in its own `Services/`),
but its push categories are trade/work-oriented (site requests, receiving,
work assignments), not client-approval categories — Field never receives a
`decision_required`/`proposal_sent` push, since those are addressed to the
client's own `device_push_tokens` row, not the designer's.

---

## 5. Deep links and universal links

### 5.1 Entitlements (associated domains)

- **Patina (client)**: `Patina.entitlements`
  (`apps/mobile/Patina/Patina/Patina.entitlements`) declares
  `com.apple.developer.associated-domains: applinks:client.patina.cloud`,
  plus Sign in with Apple and the `group.cloud.patina.app` App Group.
- **Capture (Field)**: `Capture.entitlements`
  (`apps/mobile/Capture/Capture/Capture.entitlements`) declares the
  **same** domain, `applinks:client.patina.cloud`, plus
  `group.cloud.patina.field`. (Field's associated domain points at the
  client portal host, not a designer-portal host — worth flagging to the
  UX team as possibly intentional for QR-approval hand-off, or possibly
  unexamined; nothing in the code comments explains this choice.)
- **Widget**: `PatinaWidget.entitlements` only has the App Group, no
  associated domains (it uses the custom `patina://` scheme instead — §5.3).

### 5.2 URL schemes (Info.plist)

- Patina (client): custom scheme `patina` (`CFBundleURLSchemes`,
  `apps/mobile/Patina/Patina/Info.plist`).
- Capture (Field): custom scheme `field` (per `apps/mobile/CLAUDE.md`:
  "scheme `field://`"; confirmed in `apps/mobile/Capture/Capture/Info.plist`).

### 5.3 What DeepLinkHandler resolves today (client app)

`DeepLinkHandler.swift`
(`apps/mobile/Patina/Patina/App/DeepLinking/DeepLinkHandler.swift`) handles
four families of incoming URL, in priority order:

1. **Universal links** (`https://client.patina.cloud/...`) — checked
   first, before the custom-scheme guard, because `.onOpenURL` delivers
   universal links with `scheme == "https"` and an earlier version of this
   code dropped every one of them (comment, line 61-63). The mapping table,
   `DeepLinkHandler.route(forUniversalLink:)` (lines 217-241), is a pure,
   unit-tested function:
   - `/piece/<id>` or `/pieces/<id>` → `.pieceDetail(pieceId:)`
   - `/invoice/<id>` or `/invoices/<id>` → `.invoiceDetail(invoiceId:)`
   - `/proposal/<id>` or `/proposals/<id>` → `.proposalDetail(proposalId:)`
   - `/decision/<id>` or `/decisions/<id>` → `.decisionDetail(decisionId:)`
   The comment at lines 224-228 is explicit that the **plural** forms are
   canonical — "what client-portal serves… what the AASA file publishes,
   and what 00534 writes into every notification's `deep_link`" — and the
   singular forms exist only as compatibility aliases for older links.
2. **Custom scheme (`patina://`)**: `patina://auth?...` (magic link /
   QR-auth), `patina://room/<uuid>`, `patina://piece/<id>`,
   `patina://today` and `patina://record/<rowId>` (the widget's two doors,
   §5.4).
3. **Path-based fallback** for universal links that don't match the host
   switch (`/auth`, `/room/`, `/piece/` prefixes).
4. **APNs entity routing** — a separate table,
   `NotificationRouter.swift`
   (`apps/mobile/Patina/Patina/App/DeepLinking/NotificationRouter.swift`),
   maps `entity_type`/`entity_id` (from either the push payload or an
   in-feed `notification_log` row) to the same `AppRoute` cases: `project`,
   `proposal`, `decision`, `invoice`, `design_request`/`lead`,
   `thread`/`message_thread`, `room`, `product`/`piece`, plus
   `fulfillment_order`/`order`/`direct_order` (lines 60-109). Notably,
   `proposal` and `invoice` are marked "Forward-compatible: no edge
   function emits entity_type … yet" (lines 65-66, 71-73) — i.e. the route
   exists and is tested, but no current APNs sender uses `entity_type:
   "proposal"`/`"invoice"` (those pushes route via the `decision_*` types
   in §4, or fall through to the notification feed).

### 5.4 Widget deep links (a fourth, narrower door)

`DeepLinkHandler.route(forWidgetLink:in:)` (lines 263-276) resolves
`patina://today` (plain open) and `patina://record/<rowId>` (a specific
Record row, resolved against the on-disk `HouseRecord` snapshot written by
the app — including NEEDS YOU rows, so a widget tap on a decision/proposal
row can open the exact approval screen). An unknown id or missing snapshot
always falls back to `.heroFrame` (home) rather than dead-ending.

### 5.5 Could an approval email link open the app?

**Yes, today, by design.** `00534_client_attention_notifications.sql`
writes `metadata.deep_link` = `/proposals|/invoices|/decisions/<id>` on
every attention row (comment, lines 30-35 of that migration), and that
exact path shape is what `DeepLinkHandler.route(forUniversalLink:)` parses.
If Resend-sent approval emails (or the client portal's own copy) link to
`https://client.patina.cloud/proposals/<id>` etc., a tap on iOS with the
app installed opens `ProposalDetailView` directly via Universal Links —
no custom scheme needed, no app-not-installed dead end (Universal Links
fall back to Safari automatically). This is the same host both apps'
entitlements already declare (§5.1).

---

## 6. Design system

- **Shared UI kit**: `apps/mobile/PatinaDesignKit` — a local Swift package
  "the shared tokens + portable components" (comment,
  `apps/mobile/Patina/Patina/Design/DesignKitReexport.swift`, lines 6-9),
  consumed by **both** iOS apps and re-exported into the Patina target via
  `@_exported import PatinaDesignKit` so existing call sites didn't need to
  add the import everywhere ("R27 Wave 0").
- **Structure**: `apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/`
  has `Tokens/` (`PatinaTypography.swift`, `PatinaColors.swift`),
  `Components/` (`PatinaButton.swift`, `MonoLabel.swift`,
  `PatinaTextField.swift`, and others), `Support/`, `Resources/Fonts/`.
- **Typography/color usage in the approval flows**: all decision/proposal/
  invoice screens use `PatinaTypography.h2/h3/h5/bodySmall/monoLabel/
  monoTiny`, `PatinaColors.Text.{primary,secondary,muted,interactive}`,
  `PatinaColors.{sage, clay, error}`, and `MonoLabel` for eyebrow labels
  ("DECISION", "PROPOSAL", "CONFIRM YOUR CHOICE", "SIGN PROPOSAL") — a
  consistent typographic vocabulary already proven across all three money
  rails.
- **Signature-like / receipt-like components**: there is **no dedicated
  "stamp", "receipt", "seal", or "scored ink" component** in the design
  kit. What exists instead:
  - The SF Symbol `checkmark.seal.fill` is used as an ad-hoc "this is
    signed/resolved" glyph in three places: the resolved-decision banner
    ("You've responded to this decision",
    `DecisionDetailView.swift` line 180), `DecisionPushHandler`'s
    `.resolved` icon (line 45), and `ProposalDetailView.statusIcon(for:justSigned:)`
    (lines 87-89) — which is explicitly gated so it only appears when a
    real signature record exists (pinned by
    `ProposalDetailStatusIconTests.swift`, whose header cites
    "rulings-fable.md #6").
  - `DecisionConsentSheet` and `ProposalSignSheet` both use a plain typed
    "Full name" `PatinaTextField` with `icon: "signature"` as the
    e-signature affordance — text input, not a drawn/traced signature
    capture (no `PKCanvasView`/`SignatureView` anywhere in the client app).
  - No "scored ink" component was found by name anywhere in
    `apps/mobile/Patina` — `docs/design/the-document/` (the designer
    portal's document metaphor, "Scored Ink") does not appear to have an
    iOS-native counterpart in the client app; this is a gap the UX team
    may want to close deliberately (§8) rather than something that already
    exists under another name.

---

## 7. Existing tests touching these areas

All under `apps/mobile/Patina/PatinaTests/` — no dedicated UI-test
(`PatinaUITests`) coverage was found for decisions/proposals/invoices
(`grep` for `decisionDetail|proposalDetail|invoiceDetail|DecisionsAPIClient|ProposalsAPIClient|InvoicesAPIClient`
across `PatinaUITests` returned nothing).

- `DecisionConsentValidationTests.swift` — "Keeps the client consent sheet
  aligned with `apply_client_decision`'s electronic-signature contract."
- `ProposalsMoneyRailTests.swift` — "Pins `ProposalsAPIClient`'s
  client-safe RPC DTOs, immutable product snapshot fallbacks, raw-table
  read prohibition, sign guard, and route names."
- `ProposalDetailStatusIconTests.swift` — pins the rule that
  `checkmark.seal.fill` is reserved for a proposal carrying an actual
  signature record.
- `InvoicesMoneyRailTests.swift` — "pins `InvoicesAPIClient`'s decode
  paths against the portal wire shapes, the balance/payable/settled
  computed helpers, the checkout error-code [mapping]."
- `InvoiceReminderTests.swift`, `InvoiceReminderServiceTests.swift`,
  `InvoiceReminderAuthorizationTests.swift` — the app's one local
  notification (an invoice due-date reminder), its scheduling rules, and
  its permission ask.
- `DocumentsAPIClientTests.swift` — decode paths + kind/size/title display
  helpers for the (read-only) documents list.

---

## 8. Gaps and observations (for the UX team)

These are observations, not verified defects — flagged for the UX team's
judgment, not claims of broken behavior.

1. **The premise driving this discovery brief appears outdated or
   mistaken.** The client app already has a full approval/e-sign system
   (Decisions + Proposals), wired to push, deep links, and a daily home
   feed. Any UX work here should start from "how do we make this surface
   better/more discoverable/more delightful," not "should this exist."

2. **No native drawn/traced signature capture.** Both e-sign flows
   (Decisions, Proposals) accept a typed full name as the signature, not a
   finger-drawn signature (no `PKCanvasView` usage found). This mirrors the
   client portal's web e-sign, but on a touch device a drawn signature is
   a well-worn, more ceremony-appropriate pattern the team may want to
   consider — especially given the proposals are explicitly framed as
   "typography-first document[s]" with real financial commitment.

3. **No dedicated "signed"/"approved" visual language.** The only signal
   that something was approved is a small SF Symbol
   (`checkmark.seal.fill`) plus a text banner ("You've responded to this
   decision" / "Signed by \(name) on \(date)"). There's no equivalent of
   the designer-portal's "Scored Ink"/document-stamp metaphor
   (`docs/design/the-document/`) translated to iOS. If the brand wants
   approvals to feel like a *ceremony* (the way a paper contract stamp or
   wax seal does), this is unbuilt, not merely hidden.

4. **Proposal and invoice push types are "forward-compatible" but
   currently unused.** `NotificationRouter`'s `proposal`/`invoice`
   `entity_type` cases (lines 65-73) are tested and routable, but no
   current backend sender emits those `entity_type` values on an APNs
   payload — proposal/invoice attention rows currently reach the client
   only through the in-app bell + Studio/Record surfaces (via
   `notify_client_attention`, §4) and the decision push types. Confirm
   with backend/product whether "we'll tell you… a decision, a proposal,
   or an invoice" (the primer's own promise, §4) is fully honored for push
   today, or only for decisions.

5. **`device_push_tokens` scoping.** Push delivery depends entirely on a
   client having previously granted notification permission via
   `PushPrimerView`, gated to first "money moment"
   (`PushPrimerTrigger.shouldPresent`). A homeowner who dismisses "Not
   now" (line 59 of `PushPrimerView.swift`) is never re-asked
   automatically — worth checking whether there's a settings-surface
   re-ask path, since the once-per-install gate
   (`armAuthorizationPromptGate()`) appears to be a true one-shot.

6. **Field's associated domain points at the client host.** Capture
   (Field)'s entitlements declare `applinks:client.patina.cloud`, the same
   domain the client app uses — not a designer/admin-portal host. Whether
   this is intentional (e.g. so a QR-approval or a shared client link can
   route through Field too) or an unexamined copy-paste from the client
   app's entitlements is not evidenced anywhere in comments; worth a
   one-line confirmation from whoever set it up.

7. **Field's Decisions surface is deliberately read-only, with no
   designer-side "send" action anywhere on iOS.** All authoring (decision
   creation, proposal creation/sending) happens exclusively in the
   designer portal (web). If there's ever a product ask for a designer to
   send a decision/proposal from their phone in the field, that is
   greenfield work on Capture, not an extension of an existing draft/edit
   surface.

8. **The "Daily Return" NEEDS YOU eyebrow is capped at 3 rows** with a
   "See all →" overflow (`maxRowsPerEyebrow = 3`,
   `HouseRecord.swift` line 204). For a studio with an unusually large
   number of simultaneous open decisions/proposals/invoices for one
   client, this caps daily visibility on the home screen itself — by
   design (to avoid an overwhelming home screen), but worth validating
   against real caseloads.
