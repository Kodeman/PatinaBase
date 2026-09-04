# The homeowner's approval journey — architecture

**Role:** Journey Architect · Patina client approval experience · 2026-09-03
**Ground truth:** the four discovery reports in `../discovery/`, cited as (01 §A.3), (02 §1B), (03 §5.3), (04 §2.7). Claims not in those reports are marked **unclear** rather than guessed.

Patina's customer is the studio; the homeowner is the studio's client (`VISION.md` §2). The homeowner promise is the one place engagement is the point — *"you're engaged every day, and you and your designer are looking at the same agreed direction. Fewer surprises. The decision record is the relationship"* (§4). So the goal is not faster clicks. It is: **saying yes should feel like a small ceremony with her designer, and the record of what she said should feel like hers.** Delight is Leah's studio speaking clearly, on Patina's paper, with Patina never taking the byline.

---

## 1. Current-state service blueprint

Five arrival channels reach a homeowner, from two backend families — Stage-2 project approvals (`client_decisions` with `approval_contract='project_artifact_v1'`) and the proposal/commercial rail (`proposals`) — across three surfaces.

### 1.1 Email — project approvals (Stage-2 and legacy decisions)

| | Observed behaviour |
|---|---|
| Trigger | `publish_client_decision` fires `_enqueue_decision_notification(id,'decision_required')` at issue; the `decision-reminders` cron (09:00) re-fires the identical kind for anything due within 48h; `expire-decisions` (02:00) fires `decision_overdue` (02 §1A; 04 §3.5) |
| Copy the client sees | Subject `Reminder: "{title}" needs your decision` — **the same subject on the very first send** (02 §1A). Body: *"Your designer is waiting on a decision: **{title}**."*; *"Approval artifact: **{title}** ({kind}, version {N})."*; *"SHA-256 checksum: {hash}"*; *"It's due in approximately {N} hour(s)."*; *"Open your Patina dashboard to review the options and pick one."* Signed *"— Patina"* (02 §1A; 01 §A.3) |
| Link target | **None.** `renderDecisionEmail` uses `paragraph()` only; zero `ctaButton`/href in `decision-notify.ts` (02 §1A). The footer's Dashboard/Help/Preferences links resolve from `DESIGNER_PORTAL_URL`, default `https://app.patina.cloud` (01 §E.1) — the client's footer points at the studio's portal. Prod value of that env var: **unclear** |
| Auth required | Yes. `/decisions` and `/decisions/[id]` sit outside the public allowlist; unauthenticated visitors bounce to `/auth/signin?callbackUrl=…` (02 §1A). No token path |
| First screen | Undetermined — the email names no destination |
| Decision action | Two acts: **"I reviewed this exact edition"** (`confirm_project_decision_review`, `reviewMethod:'portal_clickthrough'`), then a radio plus **"Submit response"** (`respond_project_approval`) (02 §2A, §3) |
| Confirmation | Inline `GateStamp` — *"Approved"* (seal) or *"Held for discussion"* (hold). `changes_requested` gets **no stamp**, only *"Recorded outcome: **Changes requested**"* (02 §2A) |
| What the designer sees back | `decision_resolved` email, subject `Resolved: "{title}"`; the row collapses to one line plus a stamp in "Client approvals" (02 §1A; 01 §A.4) |
| Delivery proof | **None** — `decision_notifications` rows are optimistic, no provider-confirmation loop (04 §2.8, obs. 11) |

### 1.2 Email — proposals and commercial documents

| | Observed behaviour |
|---|---|
| Trigger | The designer's browser invokes `proposal-send` after `send_proposal` returns (01 §B.3); `proposal-nudge` on a 3-day cooldown; `proposal-sign-confirmation` after signing (04 §3.1) |
| Copy | Subject `{senderName} sent you a {documentLabel}: "{proposalTitle}"` — the studio's name leads. Kind-specific body, e.g. *"Review the named furnishings wave. Only its listed items, quantities, and client prices become purchasing authority after signature and execution."* Optional personal message; `Investment: $X`; *"Please review by {date}."* (02 §1B; 04 §3.1) |
| Link target | Real deep link `{CLIENT_PORTAL_URL}{clientPortalPath}` → `/proposals/{id}`, CTA **"Review agreement"**, plus a plaintext fallback (01 §B.3) |
| Auth required | Yes — behind middleware; not a bearer token |
| First screen | `/proposals/[id]` — `ProposalDocument` (legacy) or `CommercialDocumentShell` |
| Decision action | **"Ask a question"** (only if `project_id` exists), **"Request a change"**, **"Decline"**, **"Sign document"** → `/proposals/[id]/sign`: typed full name + required consent checkbox (02 §2B, §2C) |
| Confirmation | Client email *"Thanks for signing "{title}". Your designer is now activating your project."*; on-page `SignatureLedger` card and state banner (02 §1B, §3) |
| What the designer sees back | `ProposalWatch` — stamps SENT/VIEWED/AWAITING/SIGNED, a Sent · Opened · Reading · Most-read strip, and a per-open "the record" log (01 §B.4) |
| Nudge copy | *"Just a gentle nudge — {designerName}'s proposal **{title}** is still waiting for you whenever you have a moment to review it."* — sent by a direct Resend call bypassing `sendCompliantEmail`'s suppression/rate-cap/unsubscribe handling (04 §3.1, obs. 7) |

### 1.3 Push (APNs, iOS)

| | Observed behaviour |
|---|---|
| Trigger | `notify_client_attention()` writes one `in_app` row and one queued `push` row, then best-effort invokes `apns-send` (04 §3.3–3.4); decision pushes from `notify_decision_required/overdue/resolved` |
| Copy | From the notification row; `DecisionPushHandler` supplies defaults such as *"A decision needs you"* (03 §1.1) |
| Link target | `entity_type`/`entity_id` → `NotificationRouter` → `.decisionDetail` / `.proposalDetail` / `.invoiceDetail` (03 §5.3) |
| Auth required | App session. Signed-out tap behaviour: **unclear** — not covered in discovery |
| First screen | `DecisionDetailView` / `ProposalDetailView` |
| Decision action | Option cards with **"Choose this"**, then `DecisionConsentSheet` — click-through or typed e-signature (*"Add my signature… Type your full name to e-sign this approval."*); or deferral, which sends a message and leaves status `pending` (03 §1.1) |
| Confirmation | `checkmark.seal.fill` plus *"You've responded to this decision"* — no stamp component exists (03 §6, §8.3) |
| Gaps | `proposal`/`invoice` `entity_type` routes are tested but **no sender emits them** (03 §8.4), so the primer's promise — *"We'll tell you when your designer sends something that needs you — a decision, a proposal, or an invoice. Nothing else."* — holds only for decisions. The bell query spans `channel IN (in_app, push)`, so each attention **reads twice** (04 §3.4) |

### 1.4 In-app bell and header count (web)

| | Observed behaviour |
|---|---|
| Trigger | `notification_log` rows from `notify_client_attention` and `sync_proposal_send_in_app_log`, deduped per `(user, entity_type, entity_id)` while unread (04 §3.4) |
| Copy | A numeric `CountBadge` beside "Approval tasks", aria-label *"Approval tasks, {N} need attention"* (02 §1A) |
| Link target | `/decisions`; metadata carries `deep_link` `/proposals\|/invoices\|/decisions/<id>`, though `stamp_client_decision_reminder`'s `deep_link` has **no reader found in either portal** (01 §E.3) |
| First screen | `/decisions`, bucketed six ways: Project approvals · Awaiting studio issue · Overdue · Awaiting Your Response · Your Designer Is Handling · History (02 §1A) |
| Vision conflict | A numeric badge is on the refusal list (`VISION.md` §6) |
| Realtime | None keyed to proposals or approvals — arrival is poll/fetch (04 §3.4) |

### 1.5 iOS home — "The Record" (Daily Return)

| | Observed behaviour |
|---|---|
| Trigger | `HouseRecordBuilder`, from the same `StudioQueueBuilder.itemizedAwaitingRows` the Studio hub uses, so the two can never disagree (03 §2.1) |
| Copy | Eyebrow **NEEDS YOU**, ≤3 rows, ascending by ask date, never window-filtered — *"an open obligation does not age out of view. Nothing decays."* Rows: *"Leah asked about Rug color — Natural vs Sand."*, *"{subject} sent a proposal to review."*, *"Your invoice is due."* (03 §2.1) |
| Link target | `RouteToken` → `.decisionDetail` / `.proposalDetail` / `.invoiceDetail`; also `patina://record/<rowId>` from the widget (03 §5.4) |
| State rendering | `.overdue` styled **red** (03 §2.1) — red/green status is a vision refusal |
| Cap | 3 rows per eyebrow, "See all →" overflow (03 §8.8) |

### 1.6 Web home — the project surface

| | Legacy (`ProjectViewWrapper`) | The Making (flag `single-pane`) |
|---|---|---|
| Where an approval appears | Compact `ProjectApprovalSummary` per milestone plus an unlinked project-level section (02 §7) | `ProjectApprovalGate` — a square break in the spine, kind line *"A gate · your review is required"* / *"your response is required"* (02 §7) |
| The act | Click through to `/decisions/[id]` | **Also** `/decisions/[id]` — only the announcement is inline; the six-part ceremony is not (02 §9.5) |
| Signature gates | `AwaitingSignatureCards` | Inline `SpineGate`: *"A gate · the line stops until you sign"*, act **"Sign"** (02 §7) |
| State line | None | The standing sentence — *"one paper waits for your name"*, *"a balance of {$} stands open"* (02 §7) |
| Flag behaviour | — | Fail-closed: while loading or if PostHog never answers, the legacy tree renders, never a spinner (02 §7) |

---

## 2. The seven moments

### Moment 1 — Notice
**Today.** For a proposal the notice is good: the studio's name is in the subject, there is a personal message, there is a real link (01 §B.3). For a project approval — the newer, more consequential system — it is a linkless email whose first-ever send says *"Reminder:"*, whose only instruction is *"Open your Patina dashboard"*, and which prints a SHA-256 checksum to a homeowner (02 §1A). On iOS the notice is well-shaped (NEEDS YOU, no decay) but push fires for decisions only (03 §8.4).

**Broken.** A linkless email is a dead end that reads as machine mail. "Reminder" on first contact makes the studio look as though it has already been waiting. And the raw checksum — real evidence — reads like a fraud notice rather than a letter from Leah.

**Polished.** A short note in the designer's voice, studio name at the top: one sentence of why, one line of what changes, one button. First send `{Studio} — {designer} needs your call on {title}`; later sends `Still with you — {title}`. The checksum moves under the artifact name in a calm register: *"Edition 3, sealed 2 September. The exact copy you'll approve."* The proof stays; the cryptography stops shouting.

### Moment 2 — Arrive
**Today.** Proposal email → `/proposals/{id}` → sign-in wall → document. Approval email → nowhere. iOS universal links are strong: `client.patina.cloud/decisions/<id>` opens `DecisionDetailView` with the app installed and falls back to Safari without it (03 §5.5). Nothing in the approval email uses that door.

**Broken.** The sign-in wall between a homeowner and a document her designer just sent is the largest friction in the journey; there is no token path for `/decisions/*` or `/proposals/*` (02 §1A). The `callbackUrl` round-trip works but is unadvertised — she does not know signing in will land her where she was going.

**Polished.** Every approval email links to `client.patina.cloud/decisions/{id}` — the exact shape iOS already parses. The sign-in screen, when its callback points at an approval or proposal, says whose it is first: *"Leah's studio sent you something to look at. Sign in and it opens."* On landing, the letterhead and question settle before the body — one beat, no spinner.

### Moment 3 — Understand
**Today.** The strongest thing in the product. The six-part anatomy — Artifact, Question, Scope, Impact, Authority, Confirmation — is a real ceremony, and *"You are approving edition {artifactVersion}, exactly as shown."* is one of the best sentences in the codebase (02 §2A). Budget approvals cross-check the live budget against the frozen artifact by id, version and checksum.

**Broken.** The artifact is *named* but rarely *shown* — for `plan_issue` or `spec_book_artifact` the client sees a title and a version, not the thing; budget is the only kind that renders detail (02 §2A). And "Scope" is optional free text, so the most human part of the screen is often empty.

**Polished.** Above the question, a real preview of the edition — plan sheet, spec page, budget table — at a size worth looking at, edition line beneath. Under it, in the designer's own hand, one line of why. Top to bottom: *this is the thing · here is why · here is what it costs you · here is what you can say.*

### Moment 4 — Weigh
**Today.** Impact is a three-column `<dl>`: `+$4,200`, `+3 days`, `$0 — no cost change` (02 §2A). The designer-side equivalent already speaks it in prose — *"cost unchanged"*, *"±N lead-time days"* (01 §A.4). Discussion sits below with the right guardrail: *"Comments help you and your designer discuss the work. They never submit or change an approval outcome."*

**Broken.** The client gets the table; the designer gets the sentence — backwards, since the homeowner reads it once, on a phone, possibly at 9pm. And "Needs discussion" as a radio beside a Discussion box that explicitly isn't an outcome is a comprehension trap: a client with a question may write it there and believe she has answered.

**Polished.** The three deltas become one sentence in the standing-sentence grammar already proven in `standing-sentence.ts`: *"Saying yes adds $4,200 and three days. Lead time is unchanged."* Zero stays spoken. While no outcome is chosen, the Discussion box carries a quiet line: *"A note here reaches Leah, but it doesn't answer her. When you're ready to answer, the three choices are above."* After posting, scroll back to the picker rather than leaving it behind.

### Moment 5 — Decide
**Today.** Two clicks: **"I reviewed this exact edition"**, then a radio plus **"Submit response"** (02 §2A). Neither is a signature. The proposal side is heavier — typed name in display type, required consent checkbox, kind-specific consent copy (02 §2C). iOS uses a consent sheet with typed e-signature for decisions (03 §1.1).

**Broken.** Weight is inverted: signing a services agreement asks for a typed name; approving a budget edition that unblocks procurement asks for two clicks. The authority contract leaves this deliberately open ("Whether every outcome requires click-through or e-signature evidence"). The client-facing consequence is that the heavier act feels lighter.

**Polished.** Keep the two steps — the contract requires them — but make the second feel like an act: three outcomes rendered as three lines of a short document rather than radio buttons, and a button reading **"Record my answer"**. If Kody and Leah rule for signature (§8), the typed-name field drops straight in, since `respond_project_approval` already writes `client_signature` and `client_consent_method` (01 §A.2).

### Moment 6 — Seal
**Today.** `GateStamp` — doubled border, ~2° off-square, mono caps, no fill or shadow, `settle` animation. *"Approved"* seals; *"Held for discussion"* is deliberately drawn as loud as the seal (02 §2A). Excellent. But `changes_requested` gets **no stamp** — only *"Recorded outcome: **Changes requested**"* in text. iOS gets an SF Symbol.

**Broken.** Asking for changes is the answer a nervous homeowner is most likely to give, and it is the only one that leaves no mark. The message is: *the system records agreement; disagreement is a footnote.* On iOS the ceremony is absent entirely (03 §8.3).

**Polished.** Three stamps, all drawn: **APPROVED**, **HELD**, **RETURNED** (same doubled border, terracotta ink). Beneath each, one sentence — *"Recorded 2 September. Leah has it."* / *"Returned 2 September. Leah is preparing the next edition."* It lands with the existing `settle`, then the page goes quiet: no confetti, no toast, no praise. The stamp is the reward. Port all three into `PatinaDesignKit` so the iOS act ends the same way.

### Moment 7 — Afterglow
**Today.** Almost nothing. `decision_resolved` goes to the **designer**, not the client (02 §1A); her only trace is a stamp on a page she must revisit. The proposal rail does have a client receipt (*"Thanks for signing"*), which is why signing feels more finished than approving. Meanwhile the response invalidates `section-gates`, `section-tasks`, `coordination-items`, `project-ffe-items`, `margin-items`, `document-state` (02 §3) — real things move, and she is never told.

**Broken.** This is the largest missed opportunity in the journey and the one most directly tied to the homeowner promise. An approval unblocks `project_ffe_items` rows via `blocked_by_decision_id` (04 §2.7): three chairs start moving and nobody mentions it.

**Polished.** (a) A client-addressed receipt on response — the approval analogue of *"Thanks for signing"* — naming what she answered and what it released, composed only from data the server has, under the caption discipline `SpineGate` already enforces (*"the only caption the data can honestly support… everything else stays silent rather than inventing a consequence"*). (b) On next return, one line above the fold: *"Because you approved the March budget, three pieces went to order."* That is the daily engagement the vision promises, and it costs the studio nothing.

---

## 3. Cross-surface continuity

**One address shape.** `client.patina.cloud/{decisions|proposals|invoices}/{id}` is already canonical: `00534` writes it into every attention row's `metadata.deep_link`, the AASA file publishes it, and `DeepLinkHandler.route(forUniversalLink:)` parses the plural form (03 §5.3). Every email, push, in-app row and widget tap should use exactly this and nothing else; singular aliases stay compatibility-only.

**App versus web is not a product decision.** Universal Links settle it — app installed → `DecisionDetailView`; not installed → Safari → portal. No "open in app?" interstitial, ever. That imposes a hard requirement: web and iOS must complete the *same* act, or her outcome depends on which device opened the mail. **Whether iOS can complete a Stage-2 approval is unclear**: discovery 03 documents `DecisionsAPIClient` calling `apply_client_decision` and `mark_client_decision_viewed` only, with no `confirm_project_decision_review` / `respond_project_approval` call sites (03 §1.1), and 01 §E.6 flags that the confirm RPC's only found caller is the `packages/supabase` hook. If iOS lists a Stage-2 row it cannot answer, NEEDS YOU dead-ends. **Verify this first.**

**Signed out.** Web round-trips `callbackUrl` correctly (02 §1A); it should say what it is holding — studio and document named, nothing else. On iOS a universal link received while signed out should hold the route and replay it after auth rather than dropping her on the home tab; **current behaviour unclear**.

**Expired links.** Copy the precedent already in `/share/[token]`: a calm dead-link page — *"This link isn't available… The share link may have been turned off or has expired. Ask the studio for a fresh link."* — leaking nothing about whether a link ever existed (02 §1B). Every expired, withdrawn or superseded landing should use that voice and shape, not a 404.

**State sync after a decision.** Web invalidates a long query rail (02 §3). Three surfaces must agree afterwards: **The Making spine** (the break closes, the standing sentence drops a clause); **iOS Record** (the NEEDS YOU row disappears on next fetch — Record and Studio hub share `itemizedAwaitingRows`, so the risk is staleness, not disagreement); **designer watch** (row collapses to one line plus stamp; `decision_resolved` mails the designer). There is no realtime channel for either family (04 §3.4), so "instant" is not available and should not be implied. Re-fetch on foreground and navigation, with one rule: **never show a stale actionable state** — once a response is recorded, the act must not be re-offerable anywhere.

**One decision at a time.** Several may be open — six buckets on `/decisions`, "Later approvals" and "Other project approvals" in The Making, a 3-row cap on iOS. The rule that keeps this from becoming a to-do list: **one act is ranked and drawn; the rest are counted in a sentence.** The Making already does this — the spine breaks once, at the open chapter. Extend the grammar everywhere: the nearest-due open item full-size, then one line — *"Two more wait after this one."* Never a numeric badge (a vision refusal), never a list of equals.

---

## 4. Waiting and edge states

**Pending, not yet due.** Sits in "Awaiting Your Response" (02 §1A). Should feel unhurried and clear about when it turns urgent: *"Leah asked on 28 August. She'd like an answer by Friday."* Never a countdown.

**Awaiting studio issue.** After the client confirms review on a `draft`, it lands in a bucket reading *"Your review is complete. The studio is preparing the approval for issue."* — a client-visible dead end with no timing and no act (02 §9.6). Should feel like a completed step: *"You've confirmed the edition. Leah issues it next — nothing is waiting on you."* Give it one quiet act: **"Ask Leah about this"** into the existing project thread.

**Overdue.** Presentation only, never a status transition (`APPROVAL-AUTHORITY-CONTRACT.md`; 01 §A.2). Today: subject `Overdue: "{title}" still needs your decision`, an "Overdue" bucket, and **red** styling on iOS. Should feel gently noticed, never scolded — she is the studio's client, not a delinquent. *"Still open — Leah asked about {title} on 28 August."* Drop "Overdue" from client-facing language; remove the red (vision refusal) in favour of the quiet mono-caps register the stamps already use.

**Withdrawn.** `withdraw_project_approval_decision` → `status='expired'`, `disposition='withdrawn'` (04 §2.7). Borrow the commercial rail's sentence verbatim: *"This document was withdrawn and no longer asks anything of you."* Add the reason — it is required designer-side, so it exists (01 §A.4). Should feel like release.

**Superseded / revised.** Today: **"Review previous edition"** / **"Review revised edition"** links (02 §2A); the commercial shell says *"This edition was replaced and can no longer be signed."* Should feel like one continuing conversation: *"Edition 3 replaces the one you asked Leah to change. Open edition 3 →"*, with the old page kept readable and clearly stamped. This chain of editions *is* the decision record the vision calls the relationship.

**Declined proposal.** *"You declined this proposal{ on {date}}.{ Reason: {reason}}"* (02 §2B). Should feel unembarrassed. Add: *"Leah has been told. She'll follow up."*

**Expired proposal.** *"This proposal has expired{ on {date}}. Contact your designer to renew."* — auto-expired nightly at 03:00 (04 §3.5). Should feel not-her-fault: *"This one lapsed on 14 August. Ask Leah for a fresh copy — nothing was lost."*

**Nudged.** *"Just a gentle nudge — {designerName}'s proposal **{title}** is still waiting for you whenever you have a moment to review it."* — already right; leave it. Stage-2 has no equivalent (the cron re-sends the same `decision_required` mail); give it this voice.

**Offline / paper signature.** *"Your studio recorded your signed paper original. This document is awaiting the studio countersignature and is not yet effective."* (02 §2B), with **"View the signed original"** behind a time-boxed signed URL. Should feel like her paper is in the record. Two constraints: Stage-2 has **no paper path** (01 §A.4), and a paper-issued proposal is deliberately never nudge-eligible (01 §B.3).

**Second household member viewing.** Today any comment not authored by the viewer is labelled **"Designer"**, so a spouse's note is misattributed to the studio (02 §9.3). Should feel like the household is present and the authority unambiguous: attribute by name, with a quiet role line under the picker — *"Dana is the named decision lead on this project. Anyone can leave a note."* No red flag, no lockout screen.

**Co-approver configured.** Schema-present, RPC-blocked: creation requires `required_coapprover_id` to be NULL (*"project has no valid explicit household approval authority"*, 04 §2.7), and the portal always sends explicit null (02 §4) — so the state is currently unreachable. When it opens, the contract already dictates the shape: the co-approver **reviews but never answers** (*"only the frozen household decision lead may respond"*). To the co-approver: *"Leah needs your eyes on this before Dana answers."* To the lead: *"Waiting on Sam's review. You answer once it's in."* Internal reviewer identities must never reach clients (contract) — so this naming applies only if the reviewers are household members, which is itself an open ruling.

---

## 5. What the designer must supply at creation

The studio must not notice Patina (`VISION.md` §4). So this is not "add fields"; it is "capture, inside the natural act of composing, the three things without which the client experience is flat."

**1. One line of why, in her voice.** The composer today has **Scope note**, placeholder *"What this releases, and what it does not."*, with the helper *"The bound phase is the scope of record; the note qualifies it and is never an approval response"* (01 §A.5) — a legal qualifier, not a human sentence, and optional, so often empty. The client needs something else: one sentence Leah would say aloud. **Ask for it as the composer's first field**, labelled in her register — *"What would you tell her about this?"* — with a real placeholder: *"The kitchen counts came in under what we planned, so I'd like to move the island stone up a grade."* One field, four surfaces (email, push, gate, iOS row).

**2. The artifact preview, not just its name.** `project_approval_artifacts` already freezes `source_kind`, `source_id`, `source_version`, `artifact_hash` and a `source_snapshot` blob (04 §1.5), so nothing extra is asked of her. What The Document should do is show her the client's view at compose time, as `SendSheet` already does with **"Preview as {family}"** (01 §B.4). One line: **"See what she'll see."** An empty or unrenderable preview is then a compose-time signal, not a client-time surprise.

**3. The deltas, already required.** Cost, schedule and lead-time deltas are mandatory and stated even at zero (01 §A.4). Keep that. The only ask: show the sentence they produce, live, under the three fields — *"Saying yes adds $4,200 and three days. Lead time is unchanged."* She corrects the sentence, not the columns.

**4. Due-date framing.** The field is **"Due date and time"** and the email computes *"It's due in approximately {N} hour(s)."* Hours-precision from a designer to her own client is the wrong register. Keep the timestamp (the cron needs it); change the ask to *"When would you like her answer?"* with three quiet presets — *this week · by Friday · before the order goes in* — that map to real timestamps. Client-facing: *"Leah would like an answer by Friday."*

**How The Document asks, lightly.** (a) Nothing new in the region head — it stays **"Client approvals"** with eyebrow *"Exact artifact · named authority"*. (b) The why-line is one input above Title, and empty is allowed; on **"Create review draft"** with it empty, one inline line appears where the button is — *"She'll get this with no note from you. Send it that way?"* — with the button relabelled **"Send it plain"**. One beat, no modal, no blocker. (c) The preview is a link, not a panel. (d) No new region, no counters, no completeness meter — a percentage bar on approvals would be exactly the studio-surface engagement instrumentation the vision refuses.

---

## 6. Proposals

**P1 · The letter that links.** Surface: email (both families).
*Changes:* `renderDecisionEmail` gains a `ctaButton()` to `{CLIENT_PORTAL_URL}/decisions/{id}` plus the plaintext fallback the proposal mail already uses.
*Why:* fixes Moment 2 outright — the notice becomes a door. Today the approval email is the only client-facing mail in the product with no way in (02 §9.1).
*Sketch:* `[ Open the approval ]` under the why-line; below it `If the button doesn't work, copy this link: https://client.patina.cloud/decisions/<id>`.
*Deps:* `supabase/functions/_shared/decision-notify.ts`, `_shared/branded-email.ts` (`ctaButton`), a `CLIENT_PORTAL_URL` env for the decision functions; redeploy every function importing `_shared/*`. *Effort:* S. *Risk:* none — a link cannot apply an outcome, which the contract requires.

**P2 · A first word, not a reminder.** Surface: email.
*Changes:* split first send from reminder. First: `{Studio} — {designer} needs your call on {title}`. Later: `Still with you — {title}`.
*Why:* Moment 1. Opening with "Reminder" makes the studio look impatient before she has seen anything.
*Deps:* do **not** widen the `decision_notifications.kind` enum (04 §2.8); pass a first-send boolean from `publish_client_decision` through `_enqueue_decision_notification` (00466) into the render, or derive it from `reminder_sent_at IS NULL`. *Effort:* M. *Risk:* `notification_log` dedupe keys must not collapse the two.

**P3 · Her own door in the footer.** Surface: email.
*Changes:* `portalBase()` resolves per recipient audience — clients get `CLIENT_PORTAL_URL`, studio recipients `DESIGNER_PORTAL_URL`.
*Why:* Moment 2. A homeowner's Preferences link points at `app.patina.cloud/desk?account=notifications` today (01 §E.1).
*Deps:* `_shared/branded-email.ts:69-79,161-164`; redeploy importers. *Effort:* S. *Risk:* confirm the prod value of `DESIGNER_PORTAL_URL` first — 01 §E.1 marks it **unclear**.

**P4 · One thing at a time (the threshold).** Surface: web; mirrors iOS NEEDS YOU.
*Changes:* `/decisions` stops being a six-bucket list. It becomes a letterhead page: the nearest-due open item full-size, one sentence counting the rest, history behind a quiet link. The header `CountBadge` is replaced by the standing sentence.
*Why:* Moments 1 and 4 — and it retires a numeric badge, a `VISION.md` §6 refusal.
*Sketch:*
```
                    LEAH KOCHAVER DESIGN
  ─────────────────────────────────────────────────────
  Two things wait for you, and a balance of $3,200 stands open.

  A GATE · YOUR RESPONSE IS REQUIRED
  ══════════════════════════════════════════
  Kitchen budget, edition 3
  "The counts came in under plan — I'd like to move
   the island stone up a grade."
  Saying yes adds $4,200 and three days.
                                   [ Open it ]
  ══════════════════════════════════════════

  After this one: the lighting spec, and one paper
  that waits for your name.                    see all →
```
*Deps:* `apps/client-portal/src/app/decisions/page.tsx:120-232`, `lib/client-attention.ts`, `components/layout/app-chrome.tsx` + `client-header.tsx`, `components/making/standing-sentence.ts`. *Effort:* M. *Risk:* must not become a dashboard — one act drawn, everything else a sentence.

**P5 · The ceremony on the spine.** Surface: web, The Making (`single-pane`).
*Changes:* render the six-part anatomy inline in the spine break instead of linking away. Proposal gates are already fully inline; approval gates alone hand off (02 §9.5).
*Why:* Moments 3–6 in one place. The surface that argues "the line stops until you act" currently outsources the act.
*Deps:* `components/making/the-making.tsx:274-319`, `components/approvals/project-approval-review.tsx` (extract the anatomy as a shared component), `components/making/spine-gate.tsx`, `packages/supabase/src/hooks/use-project-approvals.ts`. *Effort:* L. *Risk:* `/decisions/[id]` must keep working unchanged for email arrivals — one component, two mounts.

**P6 · Her line, carried.** Surface: designer portal + email + push + web + iOS.
*Changes:* a first-class one-line "why" captured at compose time (§5), frozen into the artifact snapshot, rendered on every client surface.
*Why:* Moments 1, 3, 7. The single change that most makes the studio's voice lead and Patina disappear.
*Deps:* new column on `project_approval_artifacts` (hand-numbered migration; the table is immutable by design, so it freezes correctly); `_create_project_approval_decision_checked` (00463); `apps/designer-portal/src/components/document/approvals/project-approval-document.tsx`; `_shared/decision-notify.ts`; `components/approvals/project-approval-review.tsx`; `HouseRecordBuilder.title(for:)` in `apps/mobile/Patina/.../Features/Home/Models/HouseRecord.swift:407-419`. *Effort:* M. *Risk:* the sentence is the designer's — never generated, never suggested.

**P7 · The impact, in a sentence.** Surface: web, iOS, email.
*Changes:* replace the three-column `<dl>` with a spoken sentence; keep the figures beneath as a small mono line.
*Why:* Moment 4. *Sketch:* `Saying yes adds $4,200 and three days. Lead time is unchanged.` / `Nothing about the cost, schedule, or lead time changes.`
*Deps:* `components/approvals/project-approval-review.tsx` (`formatMoneyDelta`, `formatDayDelta`), grammar from `components/making/standing-sentence.ts`; the designer side already speaks it (`project-approval-model.ts:87-115`). *Effort:* S. *Risk:* a zero delta must stay stated — it is stored evidence.

**P8 · Three marks, not one.** Surface: web + iOS.
*Changes:* `GateStamp` gains a **RETURNED** variant so all three outcomes leave a mark; port all three into `PatinaDesignKit`, replacing `checkmark.seal.fill`.
*Why:* Moment 6. Today only agreement is drawn; iOS has no ceremony (03 §8.3).
*Sketch:* doubled hairline border, ~2° off-square, mono caps, low-opacity ink, no fill, no shadow, `settle` on appear, caption beneath — `Returned 2 September. Leah is preparing the next edition.`
*Deps:* `apps/client-portal/src/components/approvals/gate-stamp.tsx`; new `PatinaStamp` in `apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Components/`; call sites `DecisionDetailView.swift:180` and `ProposalDetailView.statusIcon(for:justSigned:)` (guarded by `ProposalDetailStatusIconTests`). *Effort:* M. *Risk:* no shadows (vision refusal); keep the rule that a signed mark requires a real signature record.

**P9 · The receipt.** Surface: email + in-app + web.
*Changes:* on response, send the **client** a receipt naming what she answered and what it released — the approval analogue of *"Thanks for signing"*. `decision_resolved` addresses the designer only today (02 §1A).
*Why:* Moment 7, and the vision's "engaged every day."
*Sketch:* subject `Recorded — {title}`; body `You approved edition 3 of the kitchen budget on 2 September. Three pieces went to order.`; `[ See the record ]`
*Deps:* either widen `decision_notifications.kind` (migration) or add a `notify_client_attention()` call from `_respond_project_approval_checked` (00464), which already writes an in-app and a push row (04 §3.4); `_shared/decision-notify.ts`; the released-work clause derives from `project_ffe_items.blocked_by_decision_id` unblocked at 00464:770-777 and stays silent when there is nothing honest to say. *Effort:* M. *Risk:* the receipt cites; it must never re-offer the act.

**P10 · The promise kept, and the bell that says it once.** Surface: iOS.
*Changes:* (a) emit `entity_type: 'proposal'`/`'invoice'` on APNs so `NotificationRouter`'s tested routes fire; (b) narrow the bell query to `channel = 'in_app'` so each attention reads once.
*Why:* Moment 1. The primer promises *"a decision, a proposal, or an invoice"*; only decisions are delivered (03 §8.4), and the double-read is a documented seam (04 §3.4).
*Deps:* `notify_client_attention()` (00534), `supabase/functions/apns-send/core.ts`, `NotificationRouter.swift:60-109`, `NotificationsAPIClient.swift:135-145`. *Effort:* S–M. *Risk:* fix the double-read **before** enabling more push, or the noise doubles.

**P11 · Quiet overdue.** Surface: iOS + web + email.
*Changes:* remove red from `.overdue`; retire "Overdue" from client-facing copy in favour of *"Still open — Leah asked on 28 August."*
*Why:* Moment 1 tone, and `VISION.md` §6 refuses red/green status.
*Deps:* `HouseRecord.swift` `state(for:now:)` (~440-452) and its row rendering; `apps/client-portal/src/app/decisions/page.tsx` bucket label; `decision-notify.ts` `decision_overdue` subject/body. *Effort:* S. *Risk:* `decision_overdue` bypasses quiet hours as time-critical (02 §1A) — keep that; change only words and ink.

**P12 · Who is in the room.** Surface: web Discussion, later iOS.
*Changes:* attribute comments by name and side instead of `{isMine ? 'You' : 'Designer'}`; add one standing line naming the decision lead.
*Why:* Moment 4, and ADR 0003 made visible rather than merely enforced.
*Sketch:* `Dana · 2 September` / `Leah · Studio · 2 September`, with `Dana answers this one. Anyone can leave a note.` under the picker.
*Deps:* `apps/client-portal/src/app/decisions/[id]/page.tsx:43-156` (the label at ~108-110), the decision-comments read hook, `project_decision_authority_snapshots.decision_lead_id`. *Effort:* S. *Risk:* a comment must never render as an outcome; internal studio reviewer identities stay hidden.

**P13 · The successor, read as one thread.** Surface: web + email.
*Changes:* a superseded edition opens with a continuation line and one forward act; the successor names what changed since her last answer.
*Why:* Moment 7 — the record as the relationship. Today it is two bare links (02 §2A).
*Sketch:* old page — `You asked for changes on 28 August. Edition 3 answers that.  [ Open edition 3 ]`; new page — eyebrow `EDITION 3 · replaces the one you returned`.
*Deps:* `predecessor_decision_id` and successor receipts (00463; `supersede_project_approval_decision`, 00464), `disposition` derivation in `packages/supabase/src/hooks/use-project-approvals.ts:13-26`, the revision-history block in `project-approval-review.tsx`. *Effort:* M. *Risk:* a successor is a new decision, never a reopen — copy must not imply the old answer was undone.

**P14 · The waiting, answered.** Surface: web (`/decisions`, The Making deferred buckets).
*Changes:* "Awaiting studio issue" gets a completion sentence and one act.
*Why:* Moment 5→6 continuity; today it dead-ends (02 §9.6).
*Sketch:* `You've confirmed the edition. Leah issues it next — nothing waits on you.   [ Ask Leah about this ]`
*Deps:* `apps/client-portal/src/app/decisions/page.tsx:120-232`, `components/making/the-making.tsx` deferred sections, the project-thread route used by `ProposalClarifyButton` (`/messages?thread={id}`). *Effort:* S. *Risk:* the act must be a message, never anything readable as issuing or approving.

---

## 7. Prioritized roadmap

### Wave 1 — Fix the floor
Arrival, links and copy defects; nothing here needs a ruling. **P1 · P2 · P3 · P10 · P11 · P14**, plus the §3 verification: *can iOS complete a Stage-2 approval?*

*Success — qualitative:* a homeowner who receives an approval email reaches the exact document without asking how, on either device. *Measurable:* **share of `decision_required` emails whose recipient reaches `/decisions/{id}` (or `.decisionDetail`) within 24 hours** — a client-surface arrival measure, never shown to a designer, never a studio-facing number.

### Wave 2 — Make it a ceremony
The act itself. **P6 · P7 · P8 · P9 · P5** (P5 behind `single-pane`).

*Success — qualitative:* Leah reads the client's approval email and recognizes her own sentence at the top; the client, shown the three stamps, can say what each means unprompted. *Measurable:* **share of Stage-2 approvals created with a non-empty designer why-line** — a quality measure of the artifact, not of anyone's activity, and never surfaced as a studio score.

### Wave 3 — Make it a habit
Return, continuity, household. **P4 · P12 · P13**, plus co-approver presentation once §8 lands.

*Success — qualitative:* a homeowner opening the portal or app on a day with nothing owed still sees a true sentence about her house and leaves satisfied. *Measurable:* **share of approvals reaching a recorded outcome without any reminder firing** — a friction measure that goes *down* when the studio has to chase, and never rewards volume of client activity.

Explicitly not measured on any surface: sessions, time-in-app, streaks, notification open rates as a designer-facing figure, or any completeness score on the studio's own composition (`VISION.md` §6).

---

## 8. Open rulings for Kody and Leah

1. **Does an approval outcome need a signature?** The contract lists this unresolved ("Whether every outcome requires click-through or e-signature evidence"). Approving a budget edition is two clicks; signing an agreement is a typed name. Either weight is defensible; the mismatch is not. Moment 5's design depends on the answer.

2. **Are the decision lead and co-approver household members or studio reviewers?** The contract flags this directly. Every word of §4's household copy assumes household. If they are internal, that copy is wrong and the co-approver must stay invisible to clients.

3. **Do we ship the co-approver at all in the next twelve months?** It is schema-present and RPC-blocked. Does a real Leah project have two people who must both look before one answers?

4. **May a homeowner reach a decision without signing in?** Every other homeowner-facing surface has a login-less door (`/share/`, `/plans/`, `/piece/`, and the `middleware.ts` note about "a homeowner texts the link to her husband, who has no Patina account and may never have one"). Approvals deliberately do not. Should a view-only tokened preview of the artifact exist, with the act still behind sign-in?

5. **The badge and the tab bar.** `VISION.md` §6 refuses badges and tab/zone UI, yet the client portal ships a numeric "Approval tasks" `CountBadge` and iOS is built on a `.studio` tab with a numeric tab badge. Does the refusal govern the client surfaces or only The Document? P4 assumes both.

6. **Does the studio see when a client opened an approval?** `ProposalWatch` shows opens, reading minutes and most-read section for proposals; Stage-2 has no equivalent and `document_state` has no Stage-2 arm (04 §1.6). Given "the studio won't notice Patina," is a watch on approvals a service to Leah or an instrument pointed at her client?

7. **What may an approval receipt name?** P9 wants to tell her what her yes released, honestly sourced from unblocked `project_ffe_items`. Is naming procurement consequences to a homeowner right in every case, or does Leah want to control that sentence?

8. **Should the checksum be visible to the homeowner at all?** It is real evidence and it is currently in her email. Keep it quieter, keep it verbatim, or move it behind a link?

9. **What replaces "Overdue" in the studio's own mouth?** The word is presentation-only by contract, but Leah is the one whose relationship it touches. Her wording should win.
