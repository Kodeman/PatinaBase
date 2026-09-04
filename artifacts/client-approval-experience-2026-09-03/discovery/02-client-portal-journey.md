# Client Portal Approval & Signature Journey — Discovery

Scope: `apps/client-portal` (Next.js PWA, prod `client.patina.cloud`), covering **(A) Project Approvals** (the Stage‑2 gate ceremony over budgets/plans/spec-book artifacts) and **(B) Proposal view + sign** (design-services agreements, furnishings authorizations, trade scopes, and legacy proposals), plus their notification/email legs and "The Making" single-pane surface (flag `single-pane`). All file paths are relative to `/Users/kody/Code/patina-merged` unless stated otherwise. Line numbers are cited against the code as read on 2026-09-03; treat them as approximate if the files have since moved.

---

## 1. Arrival — how a client learns something is waiting

There are two independent notification systems in play, one per approval family. Neither currently pushes to a mobile device (no SMS, no native push) — both are email + in‑app only.

### A. Project Approvals (Stage‑2 gate) — `_enqueue_decision_notification` / `deliverDecisionNotification`

Source: `supabase/functions/_shared/decision-notify.ts`. Three kinds exist: `decision_required`, `decision_overdue`, `decision_resolved`. All three write an in‑app row via a frozen spine RPC (idempotent) and then attempt an email through the shared `sendCompliantEmail` chokepoint (suppression, per‑user rate cap, RFC‑8058 unsubscribe headers, `notification_log` dedupe, and quiet‑hours/preference gating for `channels_email` / `type_project_milestone` / `reminder_cadence`).

**Firing points** (all call `public._enqueue_decision_notification(p_decision_id, 'decision_required')`):
- `publish_client_decision` — the designer's "issue" act — fires `decision_required` immediately (`supabase/migrations/00464_project_approval_lifecycle.sql:1031, 1042, 1065`).
- `decision-reminders` edge function (`supabase/functions/decision-reminders/index.ts:1-203`), a daily cron job (registered in migration 00092) that finds `client_decisions` with `status = 'pending'`, `reminder_sent_at IS NULL`, and `due_date` within the next 48 hours, and sends the **same** `decision_required` email.

**Email copy** (`renderDecisionEmail` in `supabase/functions/_shared/decision-notify.ts:329-437`):
- Subject: `Reminder: "{title}" needs your decision` — this is the subject **even on the very first send** issued by `publish_client_decision`, because both the initial issue and the 48h cron reminder route through the identical `decision_required` render path. There is no distinct "new approval" subject line.
- Body: `Hi {name},` … `Your designer is waiting on a decision: **{title}**.` … an artifact citation block (`Approval artifact: **{title}** ({kind}, version {N}).` and `SHA-256 checksum: {hash}`) … `It's due in approximately {N} hour(s).` (only if a due date exists) … `Open your Patina dashboard to review the options and pick one.` … `— Patina`.
- **No clickable link or button is rendered in this email.** `renderDecisionEmail` builds the body purely from `paragraph()` calls; there is no `ctaButton()` call anywhere in `decision-notify.ts` (confirmed by grep — zero matches for `ctaButton|appUrl|dashboardUrl|/decisions` in that file). The client must navigate to `client.patina.cloud` and find the item themselves.
- `decision_overdue`: subject `Overdue: "{title}" still needs your decision`, fired by `expire-decisions` (`supabase/functions/expire-decisions/index.ts:1-176`) for every still‑pending decision whose `due_date` has passed; bypasses quiet hours (time‑critical). Same "no link" limitation.
- `decision_resolved`: subject `Resolved: "{title}"`, addressed to the **designer**, not the client (fired by `decision-resolved-notify` on the `client_decisions` AFTER UPDATE trigger, migration 00174).

**Recipient resolution**: For Stage‑2 (`approval_contract = 'project_artifact_v1'`) decisions, the recipient is the **frozen decision lead** captured in `project_decision_authority_snapshots` at issue time (`resolveFrozenLeadRecipient`), never a live lookup — so if the designer changes who owns approvals mid‑flight, an in‑flight decision still emails the person named when it was issued.

**Sign‑in requirement**: `/decisions` and `/decisions/[id]` are **not** in the client‑portal middleware's public‑page allowlist (`apps/client-portal/src/middleware.ts:139-150`). An unauthenticated visitor is redirected to `/auth/signin?callbackUrl=/decisions/[id]` (`middleware.ts:216-219`). There is no magic‑link or OTP shortcut embedded in the notification itself — since the email carries no link at all, the client signs in through the normal `/auth/signin` flow and then has to locate the item in "Your Decisions."

**In‑app arrival surfaces**:
- Global header badge: `AppChrome`/`ClientHeader` shows a numeric `CountBadge` next to an "Approval tasks" nav item, aria‑label `"Approval tasks, {N} need attention"` (`apps/client-portal/src/components/layout/app-chrome.tsx:60-84`, `client-header.tsx:124-129`). Counts both legacy non‑Stage‑2 approvals and Stage‑2 approvals filtered through `isClientActionableProjectApproval`.
- `/decisions` list page groups by state: "Project approvals (N)" (patina‑terracotta heading), "Awaiting studio issue (N)" (client's review is done but studio hasn't issued yet — helper copy: *"Your review is complete. The studio is preparing the approval for issue."*), "Overdue (N)", "Awaiting Your Response (N)", "Your Designer Is Handling (N)" (read‑only Track‑5 coordination items), and "History (N)" (`apps/client-portal/src/app/decisions/page.tsx:120-232`).
- On a project's timeline (legacy `ProjectViewWrapper`/`AuthoritativeEnhancedTimeline`), approvals appear per‑milestone under an "Project approvals" sub‑heading using the same `ProjectApprovalSummary` card in `compact` mode (`apps/client-portal/src/components/timeline/enhanced-timeline.tsx:221-260, 353-368`), plus an "Project-level approvals" section for approvals not tied to a milestone.
- On "The Making" (flag `single-pane`), an approval renders as a hard break in the vertical spine — see §2 and §6.

### B. Proposals / commercial documents — `proposal-send`, `proposal-nudge`, `proposal-sign-confirmation`

Source: `supabase/functions/proposal-send/handler.ts`, `proposal-nudge/index.ts`, `proposal-sign-confirmation/index.ts`.

**Initial send** (`renderProposalEmail`, `proposal-send/handler.ts:218-300`):
- Subject: `{senderName} sent you a {documentLabel}: "{proposalTitle}"` where `documentLabel` is `design services agreement` / `furnishings authorization` / `trade scope` / `proposal` depending on `documentKind`.
- Body: eyebrow (`Design services` / `FF&E authorization` / `Trade scope` / `Proposal`), heading (`Your {…} is ready`), `Hi {clientName},`, a kind‑specific description (e.g. for `design_services`: *"Review the professional services, role-based rates, retainer policy, billing cadence, ceiling, and terms. Furnishings and permission to purchase are not included."*; for `furnishings_authorization`: *"Review the named furnishings wave. Only its listed items, quantities, and client prices become purchasing authority after signature and execution."*; for `trade_scope`: *"Review the named trade scope — its scope of work, draw schedule, and price. Signing authorizes only the work and draws described inside."*), an optional personal message from the designer (`callout`), an `Investment: {$}` line, an optional `Please review by {date}.` expiry line, and a CTA button labeled `Review agreement` / `Review authorization` / `Review trade scope` / `Review proposal` that **does** link to `{clientPortalUrl}{clientPortalPath}` (a real deep link, unlike the decision‑notify emails), followed by a fallback `If the button doesn't work, copy this link: {link}`.
- Sign‑in requirement: the deep link lands on `/proposals/[id]`, which (same as `/decisions`) is behind the auth middleware — the client signs in normally; there is no token‑based passwordless entry for this path.

**Reminder ("nudge")** (`proposal-nudge/index.ts:140-224`): Subject is either `A reminder from {senderName} about your proposal: "{title}"` (when a studio identity resolves) or the generic `A gentle reminder about your proposal: "{title}"`. Body: *"Just a gentle nudge — {designerName}'s proposal **{title}** is still waiting for you whenever you have a moment to review it."* plus an expiry line and a `Review proposal` CTA button linking to `{CLIENT_PORTAL_URL}/proposals/{id}`. When the client is on `reminder_cadence = 'daily_digest'`, the nudge is deferred: instead of emailing, an in‑app `notification_log` row is inserted with `type: 'proposal_nudge'`, `subject: 'A reminder about your proposal'`, deduped against any existing unread nudge for the same proposal (`proposal-nudge/index.ts:140-168`).

**Post‑signature confirmation** (`proposal-sign-confirmation/index.ts:118-180`): Two emails fire — to the **client**, subject `Signed: "{title}"`, heading *"Thanks for signing"*, body *"Thanks for signing "{title}". Your designer is now activating your project."*, the investment line, `Signed: {date} by {signerName}`, and a `View proposal` CTA; and to the **designer**, same subject, heading *"Your proposal was signed"*, and an `Activate project` CTA.

**Share‑token path**: `/share/[token]` (`apps/client-portal/src/app/share/[token]/page.tsx:1-16`) is an explicitly **view‑only**, session‑less window onto a proposal's client copy, resolved server‑side via `resolve_document_share()`. It renders the *same* `ProposalDocument` component the authenticated client sees, under the share's own field‑visibility record, with `feedbackEnabled=false` and **no sign/verdict affordances at all** — the code comment states this is deliberate ("no sign/verdict affordances"). An invalid/revoked/expired token renders a calm dead‑link page (*"This link isn't available… The share link may have been turned off or has expired. Ask the studio for a fresh link."*) that does not leak whether a link ever existed. One documented exception: a board‑type share token minted with the reaction opt‑in (migration 00549) offers per‑pin approve/pass reactions — but this is mood‑board feedback, not a proposal signature or project approval.

**Not signed in**: middleware treats `/share/`, `/field/`, `/rfq/`, `/evidence/`, `/plans/`, `/piece/`, `/quiz` as public/login‑less by design (comments in `middleware.ts:108-133` explain each: "a homeowner texts the link to her husband, who has no Patina account and may never have one"). `/proposals/*` and `/decisions/*` are **not** in that list — both require a session.

---

## 2. Screen‑by‑screen walkthrough

### 2A. Project approval review — `/decisions/[id]` → `ProjectApprovalReview`

File: `apps/client-portal/src/components/approvals/project-approval-review.tsx:87-529`. A code comment states the design law explicitly: *"A gate has six parts and no more (Ruling II, folio 08): Artifact, Question, Scope, Impact, Authority, Confirmation."*

1. **Artifact** — eyebrow "Project approval", then a section headed "Artifact" showing `approval.artifactTitle`, and the load‑bearing **immutability sentence**: *"You are approving edition {artifactVersion}, exactly as shown."* A `Due` field with the formatted due date.
2. **Budget details** (only when `artifactKind === 'budget_version'`) — cross‑checks the live working budget against the frozen artifact by id/version/checksum (`budgetMatchesArtifact`). Loading state: *"Budget details are loading…"* (role="status"). Mismatch/unavailable state: *"Budget details are unavailable for this exact approved edition."* When matched, shows Target/Low/High totals and a per‑room‑per‑category breakdown.
3. **Question** — `<h1>` rendering `approval.question` verbatim (this is the page's actual `<h1>`, per `aria-labelledby="project-approval-question"`).
4. **Scope** — free‑text `approval.context`, only rendered if present, `whitespace-pre-wrap`.
5. **Impact** — three‑column `<dl>`: Cost (`formatMoneyDelta`, e.g. `+$4,200` / `−$1,100` / `$0 — no cost change`), Schedule and Lead time (`formatDayDelta`, e.g. `+3 days` / `0 days — no schedule change`).
6. **Authority** — `{completedReviewCount} of {requiredReviewCount} required reviews confirmed.` If `canConfirm` (status `draft`, review incomplete, `authorityRevision` present), a scored primary button **"I reviewed this exact edition"** (busy label: *"Confirming review…"*) calls `confirm_project_decision_review`. If the frozen `authorityRevision` is missing, an alert: *"Review confirmation is temporarily unavailable. The frozen authority revision was not supplied."* If review is complete but still in `draft`: *"Review complete. Your designer can now issue this request."*
7. **Confirmation** — only rendered when `canRespond` (status `pending`, `disposition='active'`, review complete, no outcome yet). Helper copy: *"Choose one outcome. Add questions or notes in Discussion below; comments do not submit an outcome."* Three radio options (`OUTCOMES` array, `project-approval-review.tsx:31-51`):
   - **Approved** — *"Accept this exact artifact and its stated impacts."*
   - **Changes requested** — *"Return this edition for revision and a new approval request."*
   - **Needs discussion** — *"Hold the gate while you and your designer talk it through."*
   A primary button **"Submit response"** (busy: *"Recording response…"*), disabled until an outcome is picked.

**After a decision** (outcome rendered below the gate anatomy):
- `approved` → a `GateStamp` (`apps/client-portal/src/components/approvals/gate-stamp.tsx`) labeled **"Approved"**, variant `seal` (mocha border/ink, `settle` animation), plus *"Recorded outcome: **Approved**"*.
- `needs_discussion` → `GateStamp` labeled **"Held for discussion"**, variant `hold` (gold border, charcoal ink — deliberately drawn "as loud as the seal," per the component's own comment, "a held gate must never read as a soft approval"), plus *"Recorded outcome: **Held for discussion**"* (note: the picker's radio option reads "Needs discussion" but the stamp and confirmation text both say "Held for discussion" — a deliberate wording split documented in‑code as keeping the visible stamp and the outcome record in agreement).
- `changes_requested` → plain text *"Recorded outcome: **Changes requested**"*, no stamp.

**Revision history**: if the approval has a predecessor/successor decision (superseded chain), links **"Review previous edition"** / **"Review revised edition"**.

**Errors/notices**: a `role="status"` notice line (*"Review confirmed for this exact artifact. Your designer can now issue it."* / *"{Outcome} recorded."*) and a `role="alert"` error line (falls back to *"The artifact changed or the review could not be confirmed. Refresh and review it again."* / *"This approval changed while it was open. Refresh before responding."* — both are optimistic‑concurrency messages keyed on `expectedUpdatedAt`/checksum mismatches).

**Discussion** (`apps/client-portal/src/app/decisions/[id]/page.tsx:43-156`): a separate section below the gate. Helper copy: *"Comments help you and your designer discuss the work. They never submit or change an approval outcome."* Loading: spinner + *"Loading comments..."*. Error: *"Comments could not be read just now. Refresh to try again."* Empty: *"No comments yet. Add a note for your designer below."* Each comment shows `You` or `Designer` (see §4 — this label logic does not distinguish a second household member from the designer) and a formatted timestamp. A `<textarea>` (placeholder *"Share a question or note"*) with a **"Post"** button (busy: *"Posting..."*); failure: *"Comment could not be posted. Your draft is still here; try again."*

### 2B. Proposal / commercial document — `/proposals/[id]` → `ProposalDocument` or `CommercialDocumentShell`

File: `apps/client-portal/src/app/proposals/[id]/page.tsx:1-343`. Legacy proposals (`commercial.kind === 'legacy'`) render `ProposalDocument` (`apps/client-portal/src/components/proposal-document.tsx`); everything else (design services / service addendum / furnishings authorization / trade scope) renders `CommercialDocumentShell` (`apps/client-portal/src/components/commercial-document-shell.tsx`).

**Header row**: "All Proposals" back‑link, and a **"Download PDF"** button that calls `window.print()` (relies on print CSS classes `proposal-print-hide` / `proposal-print-area` to hide chrome and print the document only).

**Status banners** (mutually exclusive, `page.tsx:182-252`):
- Legacy signed: *"Signed by {name} on {date}."* with a green check icon.
- Expired: *"This proposal has expired{ on {date}}. Contact your designer to renew."* (clock icon).
- Declined: *"You declined this proposal{ on {date}}.{ Reason: {reason}}"*.
- Superseded (legacy): *"This edition was replaced and can no longer be signed."* + either "Open the current edition." link or *"Ask your studio for the current edition."*

**`ProposalDocument` body** (`proposal-document.tsx:298-519`): a print‑styled article (max‑width 760px). Header: "Proposal" eyebrow, title, "For {client name}", a verdict‑rollup line when feedback is enabled (see below), created date, and an optional "Shared by {studio}" byline with logo. Narrative sections come from `proposal.sections` filtered to drop legacy `investment`/`timeline` markers; each renders its title, body text, and a type‑specific block: `concept` (mood images + color palette swatches), `space_plan` (floor‑plan image or *"Space plan pending"*), `selections` (an itemized list — see below). Mood boards are interleaved after the `concept` section (or before `selections`, or last). Structured sections gated by the share‑visibility tier (`shareVisibilityForTier`/`blockVisibilityFromShare`, R86): **Scope** (`In scope`, rooms with budgets or bare names depending on tier), **Investment** (itemized `LineItemsBlock` at full tier, else a single rolled‑up total), **Payment schedule**, **Timeline** (`TimelinePhasesBlock`), **Exclusions** (`Not included`). Footer: "Patina" wordmark and "{title} · v{version}.0".

**Selections list items** (`SelectionsList`, `proposal-document.tsx:641-745`): thumbnail image, item name, meta line (`supplier · Qty N · N wk lead`, each clause independently gated by share fields `showSupplier`/`showLeadTimes`), source‑host provenance tag (`showSourceUrls`, e.g. "westelm.com"), a "record completeness" trust mark (three stacked fill bars) with caption `Verified record` (100%) or `Record {pct}% complete`, and price (`showPrices`). When `feedbackEnabled`, each line also renders `<LineFeedback>` — a per‑line verdict control (not read in full for this discovery; referenced via `useClientProposalFeedback`/`ItemFeedback`).

**`CommercialDocumentShell` body** (`commercial-document-shell.tsx:66-732`): header shows a kind label (Design services / Furnishings authorization / Service addendum / Trade scope), title, optional wave name, a right‑aligned state label and version. State banners:
- `client_signed`: *"Your studio recorded your signed paper original. This document is awaiting the studio countersignature and is not yet effective."* or *"Your signature is recorded. This document is awaiting the studio countersignature and is not yet effective."*
- `executed`: check icon + *"Fully executed{ on {date}}."* (+ a paper‑signature note when applicable).
- `declined` / `superseded`: *"This document was withdrawn and no longer asks anything of you."* (+ replacement link for superseded).

Kind‑specific bodies:
- **Design services / addendum**: Services (scope text), Deliverables (bulleted), "Rates & design authorization" (per‑role hourly rate table, plus a "Design authorization ceiling" row — shows *"Not yet set"* in italic muted text if the ceiling is genuinely zero, explicitly to avoid implying an authorized $0 ceiling is real), Retainer (amount + activation policy: *"Design work begins after the fully executed agreement and retainer payment."* or *"Due under the terms of the fully executed agreement."*), Billing cadence, Terms, Not included.
- **Furnishings authorization**: "Named furnishing lines" section; a deposit‑handoff block once executed.
- **Trade scope**: "Scope of work", "Draw schedule", "Acceptance" (once accepted, shows *"Accepted by {name} on {date}. {Recorded by your studio from a signed paper original. if paper}"* plus a **"View the signed original"** link that opens a time‑boxed signed URL for a client‑visible paper scan), and a standing note: *"Signing authorizes this trade to begin the work described above, at the price shown. The deposit draw is due on signature; each remaining draw is billed as the work reaches that stage. Accepting the finished work later releases the final draw."*

**Signatures ledger** (`SignatureLedger`, `commercial-document-shell.tsx:576-624`): per‑party card (party label, signer's typed name in display type, "Signed {date}{ · on paper}", and for paper signatures a "recorded {date}" sub‑line plus the same "View the signed original" link). If no studio signature exists yet and the kind isn't furnishings/trade‑scope: a card reading *"Awaiting countersignature"* with a clock icon.

**Action bar** (only while `isActionable`, i.e. `state === 'sent'` and not past `valid_until`) — `page.tsx:277-318`: helper copy varies by kind (*"Sign to record your consent. The agreement becomes effective only after the studio countersigns."* / *"Authorize only the named furnishing lines, quantities, and client prices shown here."* / *"Sign to accept these additional design-services terms."* / *"Ready to move forward? Sign to confirm the proposal."* / legacy: *"Your designer will send a new agreement to move this forward — questions and change requests still work in the meantime."*). Buttons: **"Ask a question"** (`ProposalClarifyButton`, only if `proposal.project_id` exists — starts a project message thread and routes to `/messages?thread={id}`), **"Request a change"**, **"Decline"**, and **"Sign document"** (or **"Authorize furnishings"** for furnishings kind) linking to `/proposals/[id]/sign`.

**Request‑a‑change dialog** (`ProposalRequestChangeDialog`, `apps/client-portal/src/components/proposals/ProposalRequestChangeDialog.tsx:1-125`): title "Request a change", description *"Tell your designer what you'd like adjusted. This won't decline the proposal — it stays open while they take a look."* Textarea (placeholder *"What would you like to change?"*, 1000‑char cap with live counter), validation error *"Add a note so your designer knows what to change."* if empty on submit, success toast *"Your note was sent"*, generic failure fallback *"Failed to send your note"*.

**Decline dialogs** — two implementations depending on document kind:
- Legacy: `ProposalDeclineDialog` (`apps/client-portal/src/components/proposals/ProposalDeclineDialog.tsx:1-112`) — title "Decline this proposal?", description *"Your designer will be notified. You can share a reason to help them respond — this is optional."*, optional reason textarea (placeholder *"What's holding you back?"*, 1000‑char cap), destructive **"Decline proposal"** button (busy: *"Declining…"*), generic failure fallback *"Failed to decline proposal"*.
- Commercial: `CommercialDeclineDialog` (`commercial-document-shell.tsx:639-732`, not fully read but shares the same reason‑textarea/1000‑char pattern per grep) — wired to a dedicated `/api/proposals/[id]/decline` route rather than calling `decline_proposal` directly.

### 2C. Sign page — `/proposals/[id]/sign`

File: `apps/client-portal/src/app/proposals/[id]/sign/page.tsx:1-267`.

**Guard states** (each renders a centered message + a back link, no half‑built form):
- Loading: spinner.
- Error: `QueryFailure` with title "Unable to load this proposal", message *"The proposal could not be checked for signing just now."*, and a **Retry**.
- Not found: *"Proposal not found."*
- Legacy: *"Your designer will send a new agreement to move this forward."*
- Not signable (`commercial.state !== 'sent'`): *"This proposal isn't available to sign right now."*
- Expired (`valid_until` passed): *"This proposal has expired and can no longer be signed. Contact your designer to renew it."*

**Form** (only reached once all guards pass): Title varies by kind — *"Authorize {waveName}"* / *"Authorize this trade scope"* / *"Sign Design Services Addendum"* / *"Sign Design Services Agreement"*. Subhead sentence names exactly what signing does per kind (e.g. furnishings: *"By signing, you authorize only the named furnishing lines, quantities, and client prices in "{title}"."*; design services: *"By signing, you accept the services, signed role rates, design authorization ceiling, retainer, and terms in "{title}". The agreement becomes effective only after the studio countersigns."*).

Fields:
- **"Type your full name"** — text input, `autoComplete="name"`, placeholder is the authenticated user's display name or "Full name", `required`, `minLength={2}`, styled in the display/heading font so it visually reads as a signature. Helper copy: *"Your typed name acts as your electronic signature."*
- A required checkbox with kind‑specific consent copy, e.g. furnishings: *"I authorize the studio to procure only the named lines at the quantities and client prices shown. I understand any required deposit is a separate payment step."*; trade scope: *"I authorize this trade to begin the work described, at the price shown. I understand the deposit draw is due on signature and each remaining draw is billed as the work reaches that stage."*; design services: *"I agree to these design-services terms and understand my signature alone does not authorize work until the studio countersigns."*; legacy fallback: *"I agree to the scope and investment in this proposal."*

Submit button label varies: **"Sign authorization"** / **"Sign and authorize"** / **"Sign and accept"** (busy: "Signing…", spinner). **"Cancel"** returns to `/proposals/[id]`. Errors render inline in a bordered/tinted box.

On submit, `POST /api/proposals/[id]/sign` with `{ signedByName }`; on success the client is routed to `/proposals/[id]` (or `/proposals/[id]?delivery=pending_retry` if the post‑sign notification could not be confirmed delivered — see §3) and a `proposal_signed` analytics event fires.

---

## 3. The decision moment — what is captured, what happens after

### Project Approvals
`confirm_project_decision_review` (Authority step) captures: `authorityRevision` (a frozen CAS/optimistic‑concurrency token), `artifactHash` (checksum of the exact edition), and `reviewMethod: 'portal_clickthrough'` (`use-project-approvals.ts:585-609`) — i.e., the review act is a click, not a typed name; there is no signature field at this stage, only proof that the client reviewed the exact frozen artifact identified by its checksum.

`respond_project_approval` (Confirmation step) captures: the chosen `outcome` (`approved` | `changes_requested` | `needs_discussion`), `expectedUpdatedAt` (optimistic concurrency), and an `idempotencyKey` (`use-project-approvals.ts:634-655`). No typed name or checkbox — the outcome radio + "Submit response" click is the whole act.

**After**: the outcome renders inline as a `GateStamp` (see §2A) plus a "Recorded outcome" line; the revision‑history nav appears if the artifact was later superseded; the invalidation rail (`invalidateProjectApprovalQueries`, `use-project-approvals.ts:143-177`) refreshes a long list of related query keys — including `section-gates`, `section-tasks`, `coordination-items`, `project-ffe-items`, `margin-items`, and `document-state` — meaning an approval outcome is understood to ripple into scheduling/FF&E/margin state elsewhere in the project, though this discovery did not trace each downstream consumer.

### Proposals / commercial documents
The **typed full name** is the electronic signature (`signedByName`, `minLength(2)`). A **required checkbox** captures explicit consent to kind‑specific terms (copy in §2C). The server additionally captures a **trusted, server‑derived client IP** (`resolveClientIp`, never trusted from the browser payload) via the `/api/proposals/[id]/sign` route (`apps/client-portal/src/app/api/proposals/[id]/sign/route.ts:54, 130-190, 226-238`), which is passed only to service‑role RPCs suffixed `_with_trusted_ip` (`execute_furnishings_authorization_with_trusted_ip`, `execute_trade_scope_with_trusted_ip`, `sign_design_services_agreement_with_trusted_ip`). This matches the intent of migration `00400_proposal_signature_authority.sql:1-40`, whose header explains a prior five‑argument surface let a caller *supply* `signed_ip` directly, which this migration closed off by splitting into a minimal client‑authenticated RPC (`sign_proposal(uuid,text)`) and a separate service‑role‑only bridge that injects the trusted IP after the production route authenticates the client.

Per‑kind transaction shape (from the sign route):
- **Furnishings authorization**: one transaction writes immutable signature evidence, applies the named lines, and creates the deposit invoice handoff. Response includes `newlyExecuted`, `depositInvoiceId`, and a `notificationDelivery` state (`delivered` / `pending_retry` / `not_requested`) for both the "furnishings executed" and "deposit ready" notification transitions.
- **Trade scope**: same one‑act shape — signature evidence + apply sections/draws + auto‑issue the deposit draw invoice.
- **Design services / addendum**: signature‑only. The route's own comment is explicit: *"never activates or creates a project; that remains the studio's separate countersignature transaction."* Response state moves to `client_signed`, not `executed`.
- **Legacy**: `POST` returns `410 legacy_signing_retired` — *"Legacy proposals no longer support client signing — the format is retired in favor of the design services agreement flow."*

If the post‑sign notification call to `commercial-document-notify` fails or is unconfirmed, the sign still succeeds but `notificationDelivery.state = 'pending_retry'`; the sign page appends `?delivery=pending_retry` to the redirect (`sign/page.tsx:149-152`), and `CommercialNotificationRecovery` renders on the proposal detail page in that case (referenced at `apps/client-portal/src/app/proposals/[id]/page.tsx:19-20, 273-275`; component internals not read for this discovery).

**Confirmation email**: see §1B — subject `Signed: "{title}"`, *"Thanks for signing"*, restates the investment amount and `Signed: {date} by {signerName}`, links back with **"View proposal."**

**What changes on the project surface afterward**:
- The `SignatureLedger` (§2B) now shows a card per signing party with the typed name, signed date, and "on paper"/"recorded" qualifiers, plus (for paper signatures) a link to view the scanned original via a 1‑hour signed URL.
- State banners flip from the "sent"/actionable state to `client_signed` (awaiting countersignature) or `executed` (fully executed).
- On "The Making" (§6), the spine's gate for that instrument disappears once its act is taken, and the standing‑sentence counts (papers waiting, balance owed) recompute.
- Furnishings/trade‑scope execution auto‑creates a deposit invoice; the client‑portal "toll" surface (`SpineToll`, not read in depth) is presumably where that balance later surfaces, per the standing‑sentence's `openBalanceCents` clause.

---

## 4. Household / multi‑person

`docs/adr/0003-household-comments-are-not-approvals.md` (verbatim, in full):

> Every project has one designated household decision lead and may require one contract-designated co-approver. Other household participants may comment, but only the named approver set may submit an authoritative response against an immutable artifact edition.

**How this manifests in the client portal**:
- The `ProjectDecisionAuthority` type carries `decisionLeadId` and `requiredCoapproverId` (`packages/supabase/src/hooks/use-project-approvals.ts:76-84`), but `useSetProjectDecisionAuthority` (called from the designer side, not client‑portal) always sends `p_required_coapprover_id: null` (`use-project-approvals.ts:506-551`) — a code comment explains this is deliberate: *"database.types.ts currently marks p_required_coapprover_id as non-null even though 00436 explicitly requires NULL. Keep that generated mismatch at this boundary; every authority write below still sends an explicit null."* In the code as read, **the co‑approver concept exists in the schema/types but is not wired to a second person in the client portal** — there is exactly one frozen decision lead per Stage‑2 approval (`resolveFrozenLeadRecipient`, used by notifications), and the review/respond RPCs are keyed to that one person's snapshot.
- `isClientActionableProjectApproval` / the whole attention model in `apps/client-portal/src/lib/client-attention.ts` operates on the single approval record; there is no per‑household‑member "your turn" concept exposed in the UI.
- The one place multiple people plausibly interact is the **Discussion** thread under a decision (`DecisionDiscussion`, `apps/client-portal/src/app/decisions/[id]/page.tsx:43-156`). Comment authorship is rendered with exactly two labels: `{isMine ? 'You' : 'Designer'}` (line 108‑110, `isMine = !!user && comment.author_id === user.id`). **This means any comment not authored by the currently signed‑in viewer is labeled "Designer," even if it was actually posted by a spouse or other household member using a different account.** No code path in this component distinguishes a second client‑side commenter from the studio side. This is the clearest UI‑level artifact of the "household comments are not approvals" ADR: comments are treated as a two‑party (you/designer) channel, not a household channel, even though the underlying `decision_comments` table presumably supports any number of `author_id`s.
- No invite/share flow for a second household member to gain their own login was found under `apps/client-portal/src` (grep for `household` in that tree returns only `lib/env.ts`, unrelated). Household/co‑approver provisioning, if it exists, is out of scope for this file tree.

---

## 5. Engagement instrumentation

### Proposal engagement (Supabase table `proposal_engagement`)
Written directly from `ProposalDocument` (`apps/client-portal/src/components/proposal-document.tsx:108-208`), guarded so the proposal's own designer never counts as a "viewer" (`if (!user || user.id === proposal.designer_id) return;`):
- **`opened`** — recorded once per mount (`hasRecordedOpen` ref guard) when `trackEngagement` is true and the viewer isn't the designer. Also calls `mark_proposal_viewed` RPC when `proposal.status === 'sent'` (transitions the proposal to a "viewed" state).
- **`section_viewed`** — an `IntersectionObserver` (50% visibility threshold) tracks which `data-section-type` block is active; when the active section changes (or on `beforeunload`), it flushes an event with `section_type` and `duration_seconds`, but **only if the dwell was ≥ 2 seconds** (a hard‑coded minimum in the flush logic).

Both writes are wrapped in `try { … } catch { /* Silent — engagement tracking should never block render */ }` — a failed insert never surfaces to the client and is not retried.

### PostHog / analytics events (`apps/client-portal/src/lib/analytics/events.ts`)
- `proposalClientEvents`: `proposal_viewed_by_client` (`{proposal_id, platform:'client'}`), `proposal_section_viewed` (`{proposal_id, section_type, duration_seconds, platform:'client'}`), `proposal_signed` (`{proposal_id, signed_by_name, platform:'client'}`).
- `makingEvents` (single‑pane surface): `client_making_surface_viewed` (`{project_id, gate_count, toll_count, tracking_count}` — fired once per render with a summary of what the spine found), `client_making_gate_followed` (`{project_id, proposal_id, kind}` — fired when a client taps a gate's act, e.g. "Sign document"), `client_making_toll_followed` (`{project_id, invoice_id, balance_cents}`), `client_making_action_shown` / `client_making_action_selected` (generic scored‑action impression/selection events keyed by `surface_key`/`region_key`/`action_key`/`variant`/`presentation` — used by the shared `ScoredAction` component across every act on the surface, including approval and signature gates).
- `clientEvents.projectView` (`client_project_view`) — the project page's own view event, deliberately emitted exactly once per project open regardless of which surface (legacy vs. single‑pane) rendered, to avoid double counting during the flag's client‑side resolution (documented at length in `project-surface-switch.tsx:32-38`).
- No dedicated PostHog event was found for the **project‑approval** review/respond acts themselves (the `confirm_project_decision_review` / `respond_project_approval` mutations in `use-project-approvals.ts` do not call any `track(...)`/PostHog helper) — the only durable trace of a project‑approval action is the in‑app `notification_log`/`agent_task_audit`‑style DB rows and the `GateStamp` UI state, not a PostHog event, unless one is fired from `ScoredAction`'s generic `actionKey="confirm_project_approval_review"` / `"submit_project_approval_response"` instrumentation (the review component passes those `actionKey`s to `ScoredAction`, which is presumably what feeds `client_making_action_selected`‑style events — but that wiring is `apps/client-portal/src/components/making/scored-action.tsx`, not fully read in this discovery, so treat as **unclear** whether it fires on the legacy `/decisions/[id]` page too or only inside The Making).

---

## 6. Mobile web / PWA behavior

- `apps/client-portal/public/manifest.json`: `name: "Patina Client Portal"`, `short_name: "Patina"`, `display: "standalone"`, `background_color: "#ede9e4"`, `theme_color: "#c49a6c"`, `orientation: "portrait"`, installable icons (192/512, `purpose: "any maskable"`), and a shortcut to `/projects` ("View Projects"). No dedicated in‑app "Add to Home Screen" prompt component was found under `apps/client-portal/src` (grep for `InstallPrompt|beforeinstallprompt|AddToHomeScreen` returned nothing) — installability relies entirely on the browser's native PWA install affordance reading the manifest.
- No explicit `viewport` export was found in `apps/client-portal/src/app/layout.tsx` (only a plain `metadata` object with `title`/`description`) — the app relies on Next.js's default viewport behavior rather than a hand‑tuned `maximumScale`/`userScalable` setting.
- The proposal/commercial‑document action bar (Ask a question / Request a change / Decline / Sign) is laid out `flex-col gap-4 sm:flex-row sm:items-center sm:justify-between` (`apps/client-portal/src/app/proposals/[id]/page.tsx:278`) — it **stacks vertically on narrow viewports** rather than staying a horizontal row, but it is **not** position‑sticky; it sits inline below the document body, so on a long proposal a client must scroll to the bottom to find the sign/decline actions on mobile as much as on desktop.
- "Download PDF" triggers `window.print()` gated by `proposal-print-area`/`proposal-print-hide` CSS classes rather than a generated PDF file — on mobile web this depends on the device browser's own print‑to‑PDF capability, which varies by platform (not verified in this discovery pass).
- Touch targets: many interactive elements in the approval/decision UI are explicitly sized `min-h-11` (44px) — e.g. the outcome radio labels in `ProjectApprovalReview` (`min-h-11` on the `<label>`, `project-approval-review.tsx:415`), the "Back to decisions" link, revision‑history links, and the discussion "Post" button — consistent with a touch‑target‑aware design pass, though this was not exhaustively audited across every button in this discovery.
- "The Making" (§7 below) is described in its own source comments as reading like *"one letterhead, one spine, and the whole engagement drawn on it in time order"* — i.e., a single vertically‑scrolling document, which is inherently mobile‑friendly (no tab bars/side panels to collapse), but no responsive breakpoints specific to the gate/stamp components were inspected beyond the `sm:` prefixes noted inline in the JSX (e.g. `px-5 py-5 sm:px-6` on `SpineGate`).

---

## 7. "The Making" single‑pane surface (flag `single-pane`)

Flag gate: `ProjectSurfaceSwitch` (`apps/client-portal/src/components/making/project-surface-switch.tsx:1-77`). Reads `useFeatureFlag('single-pane')`. **Fail‑closed and explicit about it**: while the flag is loading, or if PostHog never answers (no key, blocked network, ad‑blocker), the component renders **today's legacy tree** (`ProjectViewWrapper`), never a spinner — the in‑code rationale: *"A client opening their own project must never watch it assemble... the stable state is the portal they already know."* `client_project_view` is emitted exactly once from this switch component regardless of branch, to avoid the child‑effects‑run‑first double‑count problem the comment describes in detail.

### The Gate — `SpineGate` (`apps/client-portal/src/components/making/spine-gate.tsx:1-204`)
This is Direction B's dedicated signature/acceptance device — deliberately **not** a card floating beside the timeline but a literal break in the vertical spine rule that runs the length of the surface. In‑code design rationale (verbatim from the file's header comment): *"The spine runs the length of The Making unbroken until something is owed. Where an act is required the line does not fade or branch: it STOPS, square, and does not resume until the client's name is on the paper. That break is the whole argument of the surface."*

Two variants:
- `signature` — kind line: *"A gate · the line stops until you sign"*; act label **"Sign"**; deposit caption suffix "on signing"; links to `/proposals/[id]/sign`.
- `acceptance` — kind line: *"A gate · the line stops until you accept"*; act label **"Accept the finished work"**; deposit caption suffix "releases on your acceptance"; **has no route of its own** — the component doc explains trade‑scope acceptance has always been an inline form posting to `/api/trade-scopes/[id]/accept`, so under this flag the gate hosts that inline form directly (name field + confirm) rather than linking away.

A gate card shows: the kind line, the instrument's title, a "vitals" line (`kindLabel · totalAmount`, e.g. "Furnishings authorization · $12,500"), an optional deposit line (`moneyInWords(depositCents) + " on signing"/"releases on your acceptance"`), an optional italic caption composed only from real data (e.g. *"Three pieces order the moment you sign."* or, for acceptance, *"Two draws are paid. The draw of $1,440 releases on your acceptance."*) — the code is explicit that captions are never invented: *"The only caption the data can honestly support... Everything else stays silent rather than inventing a consequence."*

**A separate, parallel gate exists for project approvals** inside The Making: `ProjectApprovalGate` (`the-making.tsx:274-319`) — visually similar (same square‑cut spine break) but not built from `SpineGate`; its own kind line reads *"A gate · your review is required"* or *"A gate · your response is required"* depending on `lifecycleStatus`, shows the approval's question as the heading, artifact title + edition + due date, and one button: **"Review exact edition"** (draft/review phase) or **"Respond"** (pending/confirmation phase), linking to `/decisions/[id]` — i.e., project‑approval gates on The Making still hand off to the *legacy* `/decisions/[id]` page (§2A) rather than rendering the gate anatomy inline; only proposal signature/acceptance gates are natively inline on the spine.

Deferred approval sections below the open chapter: **"Later approvals"** (approvals scoped to a future phase), **"Other project approvals"** (approvals outside the visible phase window), and one specifically for the "awaiting studio issue" state with description *"Your review is complete. The studio is preparing the approval for issue."* — mirroring the same three buckets seen on `/decisions`.

### Stamps
`GateStamp` (§2A) is reused verbatim inside the legacy `/decisions/[id]` review, described in its own header comment as "the client-scale seal/hold marks from the gate ceremony (Ruling VIII, folio 13, mockup M8)" and explicitly matching a designer‑side "inspection‑tag grammar" (`StatusStamp` in `tracking-row.tsx`) — a doubled border, low‑opacity ink, a couple degrees off‑square, mono caps, no shadow/fill. This confirms The Making's visual language (stamps, spine breaks, mono captions) is shared with — not a divergent skin from — the approval ceremony on `/decisions`.

### Standing sentence
`apps/client-portal/src/components/making/standing-sentence.ts:1-335` — a pure, side‑effect‑free text composer for the masthead's one‑sentence state line. Design rules stated in its own header: present tense, second person ("Your walnut credenza is in production," never "1 item · status: production"); counts under twelve spelled out ("two papers wait for your name"); "nothing is ever reported as zero... if every clause is silent, the sentence says so in plain words"; money is always whole‑dollar figures. Approval‑adjacent clauses:
- `papersClause`: *"one paper waits for your name"* / *"{N} papers wait for your name"* — counts `signatureCount` (proposals sent and unsigned).
- `acceptanceClause`: *"finished work waits for your acceptance"* / *"{N} scopes of finished work wait for your acceptance"* — counted apart from papers "on purpose: acceptance is an inline act with no document behind it."
- `balanceClause`: *"a balance of {$} stands open"*.
Clauses join with the deck's own grammar (two clauses: `", and"`; three+: serial comma), all composed via `joinClauses`/`standingSentence` (not fully traced but the surrounding infra was read in full).

### Legacy vs. single‑pane comparison
| | Legacy (`ProjectViewWrapper`) | The Making (`single-pane`) |
|---|---|---|
| Project approval location | Per‑milestone in `AuthoritativeEnhancedTimeline`, compact `ProjectApprovalSummary` cards, plus an "unlinked" project‑level section | Spine break (`ProjectApprovalGate`) in the open chapter; deferred buckets below |
| Approval action surface | Always off‑surface: click through to `/decisions/[id]` | Same — still off‑surface to `/decisions/[id]` (only the *gate announcement* is inline; the actual Artifact/Question/Scope/Impact/Authority/Confirmation ceremony is not duplicated inside The Making) |
| Signature (proposal) location | `AwaitingSignatureCards` component (not read in depth) | Inline `SpineGate` break, act is a same‑page link to `/proposals/[id]/sign` |
| Acceptance (trade scope) | Inline form on the project page (pre‑existing pattern) | Same inline form, now hosted inside the `SpineGate` break rather than a separate card |
| Nav badge | `ClientHeader` "Approval tasks" count | Same shared `AppChrome`/`ClientHeader`, unaffected by the flag |
| State line | None equivalent | The "standing sentence" masthead line |

---

## 8. Existing tests

- `apps/client-portal/src/components/approvals/__tests__/project-approval-review.test.tsx` — covers `ProjectApprovalReview` rendering, gate anatomy, outcome submission, and stamp states.
- `apps/client-portal/src/components/approvals/__tests__/project-approval-summary.test.tsx` — covers `ProjectApprovalSummary` status‑label derivation and compact rendering.
- `apps/client-portal/src/app/decisions/page.test.tsx` — covers the `/decisions` list page's bucketing (active/awaiting‑studio/overdue/awaiting/handled/history).
- `apps/client-portal/src/app/decisions/[id]/page.test.tsx` — covers the detail page's branch selection (Stage‑2 vs. legacy) and discussion thread.
- `apps/client-portal/src/app/decisions/[id]/decision-realtime.test.tsx` — covers `useDecisionRealtime` wiring on the decision detail page.
- `apps/client-portal/src/components/__tests__/proposal-document.test.tsx` — covers `ProposalDocument` rendering across sections/visibility tiers.
- `apps/client-portal/src/lib/__tests__/guest-proposal-document.test.ts` — covers the guest/share bundle builder used by `/share/[token]`.
- `apps/client-portal/src/lib/proposal-product-snapshot.test.ts` — covers normalizing a proposal item's frozen product snapshot.
- `apps/client-portal/src/app/proposals/__tests__/page.test.tsx` — covers the `/proposals` list page partitioning (pending/accepted/archived).
- `apps/client-portal/src/app/proposals/__tests__/error.test.tsx` — covers the proposals list error boundary.
- `apps/client-portal/src/app/proposals/[id]/__tests__/page.test.tsx` (referenced from the directory listing; not opened in this pass) — presumably covers the detail page's state banners and action bar.
- `apps/client-portal/src/app/api/proposals/[id]/sign/__tests__/route.test.ts` — covers the sign API route's per‑kind branching (furnishings/trade‑scope/services/legacy‑410).
- `apps/client-portal/src/app/api/proposals/[id]/decline/__tests__/route.test.ts` — covers the decline API route's kind gating and RPC error‑code‑to‑HTTP‑status mapping.
- `apps/client-portal/src/app/api/proposals/[id]/notifications/replay/__tests__/route.test.ts` — covers a notification‑replay endpoint (for `pending_retry` recovery, presumably feeding `CommercialNotificationRecovery`).
- `packages/supabase/src/hooks/__tests__/use-sign-proposal.test.ts` — covers the `useSignProposal`/legacy signing hook contract.
- `apps/client-portal/src/lib/analytics/__tests__/proposal-events.test.ts` — covers the `proposalClientEvents` track‑call shapes.
- `apps/client-portal/src/components/making/__tests__/the-making.test.tsx` — covers `TheMaking` composition (gates, tolls, tracking rows).
- `apps/client-portal/src/components/making/__tests__/open-chapter.test.tsx` — covers the open‑chapter ordering logic (what is owed, read first).
- `apps/client-portal/src/components/making/__tests__/making-masthead.test.tsx` — covers the masthead/standing‑sentence integration.
- `apps/client-portal/src/components/making/__tests__/making-spine.test.tsx` — covers spine phase‑splitting and ink‑color resolution.
- `apps/client-portal/src/components/making/__tests__/standing-sentence.test.ts` — covers the pure sentence‑composition functions directly.
- `apps/client-portal/src/components/making/__tests__/project-surface-switch.test.tsx` — covers the fail‑closed flag‑switch behavior.
- `apps/client-portal/src/components/making/__tests__/single-pane-solo-redirect.test.tsx` — covers `SinglePaneSoloRedirect` (not read in this discovery pass).
- `apps/client-portal/src/app/share/[token]/__tests__/page.test.tsx` — covers the guest share page's token resolution and dead‑link fallback.
- `apps/client-portal/src/app/share/[token]/__tests__/board-reactions.test.tsx` — covers the board‑share reaction opt‑in path.

---

## 9. Friction / gaps observed (raw material for the UX team, not verified bugs)

1. **Project‑approval emails carry no link.** `renderDecisionEmail` (`decision-notify.ts`) has no `ctaButton()`/href anywhere — it says "Open your Patina dashboard" with nothing to tap. Every proposal‑family email (`proposal-send`, `proposal-nudge`, `proposal-sign-confirmation`) *does* include a deep‑linked CTA button. This is an inconsistency between the two approval systems that likely costs real completion rate on the Stage‑2 (project approval) side — a client has to remember the domain, sign in, and hunt through `/decisions`.
2. **The first‑ever approval email reads as a reminder.** Because `publish_client_decision` (issue) and the 48‑hour cron (`decision-reminders`) both fire the identical `decision_required` render, a client's very first notice of a brand‑new approval has the subject *"Reminder: "{title}" needs your decision"* — there is no distinct "new approval" copy. This could read as confusing ("a reminder about something I've never seen") or, worse, get triaged as low‑priority noise.
3. **Household comment mislabeling.** `DecisionDiscussion` labels every comment not authored by the current viewer as **"Designer"** (`isMine ? 'You' : 'Designer'`), with no third label for a second client‑side participant. Given ADR 0003 explicitly anticipates a household with more than one participant (even if only one can approve), a spouse's comment would be misattributed to the designer in the UI.
4. **No push/SMS for approvals or signatures**, only email + in‑app badge — worth confirming this is intentional given Patina's SMS rail exists elsewhere in the product (per project memory, Field SMS is live) but is not wired into this journey.
5. **`/decisions` vs `/proposals` are two separately‑designed, separately‑tested systems with overlapping vocabulary** ("approval," "decision," "sign," "gate") that a homeowner experiences as one blended "things I need to do" list only via the shared header badge and (on the flagged surface) the shared spine — but the actual review/response ceremonies, copy voice, and even component libraries (`ScoredAction`/`GateStamp` vs. plain buttons) differ meaningfully between the two. The Making's `ProjectApprovalGate` still hands off to the legacy `/decisions/[id]` page rather than hosting the Artifact/Question/Scope/Impact/Authority/Confirmation ceremony inline, unlike proposal signature gates, which are fully inline — an inconsistency within the single‑pane surface itself.
6. **"Awaiting studio issue" is a client‑visible dead‑end state** — after a client finishes their required reviews on a `draft` approval, it sits in an "Awaiting studio issue" bucket with no indication of expected timing, and no way for the client to nudge or ask about it beyond leaving a Discussion comment.
7. **The decline/request‑change/sign action row is not sticky** on long proposals, and the "Ask a question" button only appears when `proposal.project_id` is set — a proposal not yet linked to a project (pre‑activation) offers no in‑document way to ask a clarifying question, only decline/request‑change/sign.
8. **Design authorization ceiling / retainer can display "Not yet set" in italic on a document the client is being asked to sign** (`CommercialDocumentShell`'s `ceilingIsSet`/`retainerIsSet` gates) — this is explicitly there to avoid implying a real $0 authorization, but a client asked to sign an agreement that visibly says "Not yet set" for its own financial ceiling may reasonably hesitate; it's unclear whether the sign flow blocks signing in that state or merely displays it honestly (not verified — the sign‑page guard logic only checks `commercial.state === 'sent'` and expiry, not whether ceiling/retainer are populated).
9. **Print‑to‑PDF depends on the browser**, not a generated file — "Download PDF" is `window.print()`; on some mobile browsers this may not produce a savable PDF at all, and the resulting layout is whatever the print stylesheet renders rather than a controlled document.
10. **`pending_retry` notification state is surfaced via a URL query param** (`?delivery=pending_retry`) rather than a persistent, revisit‑safe indicator — if the client closes the tab before reading `CommercialNotificationRecovery`'s content, it's unclear (not verified in this pass) whether that recovery state is still discoverable on a later visit to the same proposal.
11. **The 2026‑07‑31 audit's findings most relevant to this journey (F01, F05, F07 — see §Prior audit below) all concerned proposal financial/date integrity feeding directly into what a client would sign.** The remediation artifact claims all were fixed and locally verified, but explicitly states *"Production unchanged. No deployment was performed"* as of that artifact's date — this discovery did not independently confirm whether those exact fixes are the ones now live in the code read above (the current `execute_*_with_trusted_ip` / atomic‑transaction pattern is consistent with the F01/F07 remediation description, but that inference was not verified against a deploy log).
12. **No co‑approver UI exists** despite the schema/type surface (`requiredCoapproverId`) implying the product anticipated a second authoritative approver — worth confirming with product whether this is simply unbuilt or deliberately deferred.

---

## Prior audit findings (2026‑07‑31) touching approvals/proposals

Two artifacts were read: `artifacts/patina-client-journey-audit-2026-07-31/` (the audit — a Vite/React scaffold whose actual findings live in `src/App.tsx`, not `README.md`, which is generic Vite boilerplate) and `artifacts/patina-client-journey-remediation-2026-07-31/` (the remediation claim, same scaffold shape, findings in `src/App.tsx`).

The audit is a broader designer‑portal‑to‑client‑signature journey audit (14 findings, `F01`–`F14`, most about the *designer* authoring experience), but several bear directly on what a client eventually sees/signs:

- **F01 (critical)** — *"The sent proposal contains a zero-dollar payment schedule."* Evidence: the editor showed "Project deposit · 100% · $13,200," but the live client preview and the final sent proposal both showed "New Milestone · 0% · $0" — and blurring/waiting never reconciled it. Impact (verbatim): *"The client can sign an agreement whose payment schedule contradicts the proposal total. This creates collection, contract, and trust risk."* Fix directive: use one canonical milestone payload across editor/preview/send, and block send when allocated percentage/amount doesn't equal 100%/total.
- **F05 (high)** — *"Date-only values shifted across local and generated records."* Evidence: on Jul 31 in `America/Chicago`, "Mark signed" defaulted to Aug 1; after correcting the signature date to Jul 31, the project still opened with Start = Aug 1; Install was Nov 14 against a Nov 15 hard date. Impact: *"Off-by-one dates weaken legal records, schedules, reporting, and client expectations."* Directly relevant to signature‑date integrity — the exact date a client's typed signature is recorded against.
- **F07 (high)** — *"Send validation does not catch stale financial data."* Evidence: an 83%‑complete proposal could be sent with no warning about the zero‑dollar payment schedule (F01) or an open mood‑board facet. Impact (verbatim): *"The product knowingly exposes a client-facing preview yet does not validate the exact payload that will be signed."*
- **F03 (high)** — client association could be dropped between Discovery and Direction (a designer‑side authoring defect, upstream of what a client ever sees, but would mean a proposal drafted against the wrong/no client).
- **F02 (critical)** — project closeout could ignore install/invoice/payment truth (downstream of the client's signed commitments, not the signing moment itself).

**Remediation status** (`artifacts/patina-client-journey-remediation-2026-07-31/src/App.tsx`): the remediation deck claims **14/14** original findings addressed, "18 SQL suites with 998 assertions" plus "the full lead-to-archive browser witness" passing, and specifically for the client‑signing‑relevant ones:
- **F01**: *"Bind send to the exact reviewed snapshot. Reconcile canonical amounts on the server, reject changed tokens, and remove the unsafe legacy send overload."* Verification claimed: *"The clean SQL replay passed, and Chrome carried a six-phase $1,000 proposal with one 100% Final payment through guest review, client signature, invoice and paid readback."*
- **F05**: *"Use direct MM/DD/YYYY date-only entry and guarded parsing rather than UTC timestamp defaults or stale invalid values."* Verification claimed: *"Timezone-boundary and project-open coverage passed on the integrated head; the accepted signature and paid invoice retained their August 1, 2026 evidence in database and client readback."*
- **F07**: *"Gate every active refetch, refresh drafting state before send, reset acknowledgement when gaps change, and require a second reviewed click after any snapshot change."* Verification claimed: *"Stale-cache, changed-token and concurrent-edit coverage passed; Chrome sent, signed and invoiced the same reviewed $1,000 / 100% schedule."*

However, the remediation artifact's own top‑line status stamp reads (verbatim): *"**Production unchanged.** No deployment was performed"* — meaning as of 2026‑07‑31, these were locally/staging‑verified fixes, not confirmed live in prod. This discovery pass did **not** independently trace whether the specific commits described there are the ones present in the `00400_proposal_signature_authority.sql` / `execute_*_with_trusted_ip` RPC pattern read in §3 above; the shapes are consistent (single reviewed‑snapshot binding, server‑side trusted‑IP capture, atomic execution) but that is an inference, not a verified lineage — flagged here as **unclear** and worth a direct migration‑history check if the UX team needs certainty that F01/F05/F07 are live in the current prod build.

Both artifacts are self‑contained Vite/shadcn scaffolds (not part of the main app) — `bundle.html`/`index.html` are thin HTML shells; the substantive content is exclusively in each `src/App.tsx`.
