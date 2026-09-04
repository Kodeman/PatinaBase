# How a designer creates and sends client approvals in Patina

Scope: the designer-portal ("The Document") side of two independent client-approval
systems. System A ("Project approvals" / "Stage-2") is the newer, artifact-bound
approval gate. System B (proposal send + signature) is the older flow where a client
signs a full project proposal. This document was produced by reading the source
directly — every claim below cites a file and line.

---

## A. PROJECT APPROVALS ("Stage-2")

### A.1 Trigger & entry points

The whole surface is one region component, `ProjectApprovalDocument`
(`apps/designer-portal/src/components/document/approvals/project-approval-document.tsx`),
mounted via `ProjectApprovalDocumentMount`
(`apps/designer-portal/src/components/document/project-approval-document-mount.tsx:21-44`)
inside `app/(document)/doc/[id]/page.tsx`, immediately after the workflow-stage
document. Per `docs/design/the-document/DECISIONS.md:7104-7127` (ruling I113,
2026-08-11), this is a deliberate, ratified UX cutover: the old "Request sign-off"
button that used to live inline in a section's work block
(`work-block.tsx`, via `useRequestSectionGate`) was removed entirely — sign-off is
now authored *only* from this dedicated "Client approvals" region, not from inside a
section.

The region head reads **"Client approvals"** with eyebrow **"Exact artifact · named
authority"** (`project-approval-document.tsx:672-678`). Below the head, when open, sits
a fixed explanatory line:

> "Bind each request to one issued plan, client-ready specification, or published
> budget checkpoint. Discussion stays in the project thread; only the recorded outcome
> settles an approval." (`project-approval-document.tsx:692-696`)

**Preconditions, in order:**

1. **A project client must exist.** If `clientProfileId` is null: *"Add the project
   client before assigning decision authority."* (`:699-702`)
2. **A decision-lead authority must be assigned.** If none exists yet: *"This project
   does not have a designated decision lead yet."* (`:704-709`) with a head-ledger
   button **"Assign project client"** (`:530-536`), which calls
   `useSetProjectDecisionAuthority` → RPC `set_project_decision_authority`. On success:
   *"The project client is now the designated decision lead."* (`:326-329`) The
   decision lead is **hard-locked to `projects.client_id`** — the RPC rejects any other
   value server-side (`set_project_decision_authority`, 00463:1016-1021, error "decision
   lead must be the exact project client").
3. **If the project's client changed since authority was assigned**, a mismatch
   banner shows: *"Decision authority does not match this project's current client."*
   (`:710-718`, `role="alert"`) with button **"Assign current project client"**
   (`:537-544`) to re-run the same RPC.
4. **Composing a new approval requires an open (non-completed) project phase.** With
   none available: *"Add or reopen a project phase before authoring a new approval.
   Completed phases cannot receive a new unresolved blocker."* (`:721-725`) This is
   also enforced server-side by a trigger (`guard_client_decision_completed_phase_gate`,
   00464:227-260) that raises *"client_decisions cannot add an unresolved blocker to a
   completed phase."*

Once authority matches and a live phase exists, the head-ledger button reads **"New
approval"** (toggles to **"Close draft"** while composing) (`:522-528`).

**A second, separate entry point exists in the document's margin rail**, not for
creating approvals but for *nudging* or *jumping to* an existing open one
(`apps/designer-portal/src/components/document/margin-handoff-item.tsx:128-216`,
`ProjectApprovalHandoffItem`). Its one act is computed by `actKindFor` /
`gateActVerb` (`apps/designer-portal/src/lib/document/workflow-gate.ts:177-208`):
label is **"Nudge"** when the approval's `sourceState === 'response_required'`,
otherwise **"Publish"**, **"Review"**, or **"Open"** depending on state. "Nudge" fires
`useSendDecisionReminder` → RPC `stamp_client_decision_reminder` — the *same*
reminder RPC the generic (non-Stage-2) coordination/decision system uses
(`packages/supabase/src/hooks/use-decisions.ts:1149-1169`). Anything else dispatches a
`window` `CustomEvent` (`document:focus-project-approval`, defined in
`project-approval-navigation.ts:1-14`) that `ProjectApprovalDocument` listens for
(`:265-296`) to scroll to and focus the exact row. **There is no nudge control inside
the approvals region itself** — nudging only happens from the margin rail.

### A.2 Data model

Stage-2 project approvals are **not a new table**. They extend the pre-existing
`client_decisions` / `client_decision_options` tables, which originate at latest by
`supabase/migrations/00064_decision_workflow_v2.sql` (header: "Extends
client_decisions and client_decision_options with decision types, blocking status,
pricing, audit trail timestamps...") — no `CREATE TABLE` for `client_decisions` exists
anywhere in the numbered migration ledger, so the table predates it. At 00064 it
already carried a generic `decision_type` (`material | product | layout | budget |
approval`) and `blocking_status` (`blocks_procurement | blocks_phase | non_blocking`),
plus `linked_proposal_id` — i.e. `client_decisions` is a general-purpose
decision/gate table used across several unrelated Patina features, not something
built for Stage-2.

`00463_project_approval_authority_evidence.sql` adds:
- `client_decisions.approval_contract` (must be `NULL` or `'project_artifact_v1'`)
  and `predecessor_decision_id` (self-FK, unique when set — the supersession chain).
- A `CHECK` constraint (`client_decisions_stage2_shape_check`, `:34-49`) that, whenever
  `approval_contract = 'project_artifact_v1'`, **forces** the row into an exact shape:
  `project_id NOT NULL`, `linked_proposal_id NULL`, `decision_type='approval'`,
  `decision_kind='approval'`, `coordination_kind='signoff'`, `court='client'`,
  `phase_id NOT NULL`, `blocking_status='blocks_phase'`, `blocks_kind='phase'`.
- `client_decision_options` gets `approval_outcome`
  (`approved|changes_requested|needs_discussion`) plus per-option `cost_cents_delta`,
  `schedule_days_delta`, `lead_time_days_delta`.

New tables (00463:87-211):

| Table | Purpose |
|---|---|
| `project_decision_authorities` | One row per project — the *current, mutable* pointer: `decision_lead_id`, `required_coapprover_id` (must be NULL today), `revision` (optimistic-concurrency CAS). |
| `project_decision_authority_snapshots` | Immutable, one-per-decision copy of the authority *at the moment the approval was created* — later authority reassignment never rewrites historical evidence. |
| `project_approval_artifacts` | Immutable, one-per-decision snapshot of the bound artifact: `source_kind` (`plan_issue|spec_book_artifact|budget_version`), `source_id`, `source_version`, `artifact_hash` (SHA-256 hex), title, question, context, `due_at`, `phase_id`, the three signed deltas, and a `source_snapshot` JSON blob. |
| `project_decision_review_confirmations` | One row per approver click-through, unique per `(decision_id, approver_id)` and per `(decision_id, approver_role)` — so at most one "lead" and one "coapprover" confirmation can ever exist per decision. |
| `project_approval_action_receipts` | The idempotency/audit ledger: `action_kind ∈ (created, review_confirmed, published, responded, withdrawn, superseded)`, `idempotency_key`, `request_hash` (SHA-256 of the normalized request), `actor_id`, `result`, and `successor_decision_id`. Every mutating RPC is idempotent because of this table's unique constraints. |

**Enums** (mirrored client-side in `packages/supabase/src/hooks/use-project-approvals.ts:13-26`):
- `lifecycleStatus`: `draft | pending | responded | expired`
- `outcome` (set only once responded): `approved | changes_requested | needs_discussion`
- `disposition`: `active | withdrawn | superseded` — an orthogonal axis, computed
  purely from the receipts table (a `superseded` receipt with a
  `successor_decision_id` → `'superseded'`; a `withdrawn` receipt → `'withdrawn'`;
  else `'active'`), **never from `client_decisions.status`** — this is how a
  *responded* (approved) decision can still show as superseded once a later edition
  chains off it.
- `isOverdue`: computed server-side (`status='pending' AND due_date < now()`), never
  a stored status. Per `docs/design/workflow-completion/APPROVAL-AUTHORITY-CONTRACT.md`:
  "`overdue` is derived... it is never a status transition, approval, or phase advance."

**The full legal state machine** is enforced by a DB trigger,
`guard_decision_status_transition` (00465:533-578, current/live version): every
no-op passes; the general legal transitions are `draft→pending`,
`pending→responded`, `pending→expired`, `responded→pending`,
`expired→pending`; and **one narrow escape hatch** — `draft→expired` — is legal
*only* when the actor is Postgres itself acting on behalf of
`withdraw_project_approval_decision` (checked via a session GUC scoped to the exact
decision id), i.e. only that one RPC can withdraw an unpublished draft. Every other
transition raises `check_violation`: *"Invalid decision status transition: % -> %
(decision %)"*. This matches the human-readable machine documented in
`APPROVAL-AUTHORITY-CONTRACT.md`:

```
draft
  |-- lead review confirmed
  `-- publish -> pending
pending
  |-- approved -> responded; approved effects may settle
  |-- changes requested -> responded; blockers remain
  |-- needs discussion -> responded; blockers remain
  |-- withdraw -> expired
  `-- supersede -> expired + successor draft
responded
  `-- supersede -> historical response retained + successor draft
```

**Consent-method model.** `respond_project_approval` (the client's response act,
00464:496-847) writes `client_decisions.client_consent_method`,
`client_signature`, and `client_consented_at` on response — the **same columns**
the legacy proposal-signature path uses (see §D). A consent method, if supplied,
must be `electronic_signature` or `click_through`; an electronic signature requires
≥2 characters; a signature with no consent method is rejected. In practice, however,
the *review-confirmation* step (`confirm_project_decision_review`) hardcodes
`reviewMethod: 'portal_clickthrough'` client-side
(`use-project-approvals.ts:585-609`) — Patina calls this a "portal click-through,"
not a signature, for Stage-2 review confirmation specifically.

**Who can do what:** authoring (create/publish/withdraw/supersede/assign authority) —
studio co-members (`is_design_studio_comember`). Review confirmation and the final
response — only the frozen `decision_lead_id` (and coapprover, currently disabled).
There is **no designer-side override** for a Stage-2 outcome — contrast with the
legacy `apply_client_decision` path, which does support one
(`useApplyDecisionOverride`). Per `docs/adr/0003-household-comments-are-not-approvals.md`:
"Other household participants may comment, but only the named approver set may
submit an authoritative response against an immutable artifact edition."

### A.3 What "sending" does

There is no single "Send" button — the act is split into **draft → confirm → publish**:

1. **Create the draft.** RPC `create_project_approval_decision` (public wrapper of
   `_create_project_approval_decision_checked`, 00463:1106-1463) validates title
   (1-240 chars), question (1-500 chars), a future due date, a live in-project phase,
   and the chosen artifact candidate, then atomically inserts the `client_decisions`
   row (`status='draft'`), the frozen authority snapshot, the frozen artifact
   snapshot, and **three canonical option rows** — literally labeled `'Approved'`,
   `'Changes requested'`, `'Needs discussion'` — plus a `created` receipt. Comment on
   the function (1459-1463): *"Atomically creates one Stage-2 draft, authority
   snapshot, client-safe immutable artifact, three canonical outcomes with one
   explicit signed impact triplet, and one idempotency receipt."*
2. **The client (not the designer) confirms review** via
   `confirm_project_decision_review` (00463:1467-1664) — a click-through act bound to
   the exact frozen `authorityRevision` and `artifactHash`; any drift in either value
   rejects the confirmation (a stale reviewer cannot confirm a document that has since
   changed).
3. **Publish.** The designer's **"Publish for approval"** button
   (`project-approval-document.tsx:1101-1126`) is disabled until
   `completedReviewCount >= requiredReviewCount`
   (`project-approval-model.ts:40-44`), with the standing note *"Publish unlocks after
   every frozen reviewer has confirmed the exact artifact."* (`:1076-1082`) The RPC,
   `publish_client_decision`'s Stage-2 branch (00464:857-1035), re-verifies every
   required confirmation server-side, flips `status` to `pending`, stamps `sent_at`,
   writes a `published` receipt, and — this is the actual send —
   **fires `_enqueue_decision_notification(decision_id, 'decision_required')`.**

That enqueue call (00466:10-113, the current/live redefinition) writes a row to
`decision_notifications`, which the shared pipeline
(`supabase/functions/_shared/decision-notify.ts`) turns into: (a) an idempotent
in-app notification via the frozen spine RPC `notify_decision_required`, and (b) an
email through the compliance chokepoint `sendCompliantEmail`, gated by the
recipient's `notification_preferences.type_project_milestone` toggle, quiet hours,
and reminder-cadence (`daily_digest` clients get it deferred to the digest cron
instead — `decision-notify.ts:486-500`).

**Exact email copy** (`decision-notify.ts:329-431`, function `renderDecisionEmail`):

| Kind | Subject | Body opens |
|---|---|---|
| `decision_required` (send/reminder) | `Reminder: "{title}" needs your decision` | "Your designer is waiting on a decision: **{title}**." + optional "It's due in approximately **{N} hour(s)**." + "Open your Patina dashboard to review the options and pick one." |
| `decision_overdue` | `Overdue: "{title}" still needs your decision` | "The decision **{title}** has passed its due date and is still waiting on you." + "Open your Patina dashboard to review the options and pick one." |
| `decision_resolved` (to the **designer**) | `Resolved: "{title}"` | "Your client has responded to the decision **{title}**." + "Open your Patina dashboard to review their selection." |

Every email with a bound artifact also includes: *"Approval artifact: **{title}**
({kind}, version {version})."* and *"SHA-256 checksum: {64-char hex}"* — the client
literally sees the artifact checksum in the email body. Every email closes "— Patina".

**No SMS.** `decision-reminders/index.ts` notes: "SMS escalation (PRD line 120 final
clause) is intentionally deferred pending Twilio integration."

**No token/magic link, and no visible URL to the exact decision.** The email body
never constructs a decision-specific link; it only says "Open your Patina dashboard."
The shared branded-email footer (`supabase/functions/_shared/branded-email.ts:69-79,
161-164`) resolves its Dashboard/Help/Preferences nav links from `portalBase()`,
which reads the `DESIGNER_PORTAL_URL` env var (default `https://app.patina.cloud`) —
i.e. the client's own reminder/overdue emails link, by default, to the **designer**
portal's base URL and its `/desk?account=notifications` route, not a client-portal
domain or a `/decisions/[id]` deep link. (Flagged again under §F.)

**Reminders and expiry** run on cron (pg_cron, 00092): `decision-reminders`
(daily, decisions due within 48h and not yet reminded — for Stage-2 it resolves the
recipient from the **frozen** snapshot only, and explicitly refuses to fall back to
the mutable relationship, logging *"decision-reminders: Stage-2 evidence incomplete;
delivery denied"* if the frozen evidence is missing) and `expire-decisions` (overdue
handling). The designer can also force an immediate reminder from the margin rail
("Nudge") via `stamp_client_decision_reminder`, rate-limited to once per hour
(*"a reminder was sent less than one hour ago"*, 00465:165-170).

### A.4 What the designer sees after publishing

Each approval renders as a "gate" with six fixed parts, in fixed order — **Artifact,
Question, Scope, Impact, Authority, Confirmation**
(`apps/designer-portal/src/components/document/approvals/gate-anatomy.tsx:20-38`).
While unresolved ("open"), the full six-part ceremony renders; the moment it settles
(`disposition !== 'active' || outcome === 'approved'` —
`project-approval-document.tsx:142-144`), it collapses to one line plus a stamp:

- **Approved** → border/text in `--color-mocha`, label `"Approved · {date}"`
- **Withdrawn / Superseded / anything else settled** → muted pearl border, label
  e.g. `"Withdrawn · {date}"`, `"Superseded · {date}"`
- Still-active but bounced (`Changes requested` / `Needs discussion`) stays
  **unfolded** — the model comment is explicit: *"the same component still marks
  them the current live leaf, so their anatomy stays unfolded"* (`:137-144`)

Confirmation-line copy while open (`:1061-1082`): `"Due {date} once published"`
(draft), or `"Published {date} · due {date}"` (pending, appending `" · overdue"` if
past due), or `"{status} · {date} · awaiting a superseding edition"` once responded
but not yet approved. The Impact line is always fully spelled out, even at zero —
*"cost unchanged"* / *"±$X"*, *"schedule unchanged"* / *"±N days"*, *"lead time
unchanged"* / *"±N lead-time days"* (`project-approval-model.ts:87-115`) — "R2 ·
IMPACT — the deltas, signed, and explicitly unchanged when zero. A zero delta is
stored evidence, so it is stated rather than omitted." (`:83-86`)

**Revise/resupersede.** There is no "resend" — a designer who needs to change a
pending or responded approval clicks **"Supersede with new artifact"**
(`:1145-1154`, only offered on the live leaf, never on a completed-phase approval),
which opens an inline form requiring a genuinely different artifact (different
`source_id` or at minimum a different checksum — RPC error *"supersession requires a
genuinely new immutable artifact"*) and submits via **"Create superseding draft"**
(`:1427-1435`). Internally `supersede_project_approval_decision`
(00464:1251-1497) just re-runs the create path with
`predecessor_decision_id` set, chaining a brand-new draft off the old one; if the
predecessor was `pending` it flips to `expired`, but a `responded` predecessor's
status is left untouched (only its `disposition` becomes `superseded` via the
receipt). The settled row shows a link: **"Edition {N} superseded — view"**
(`:1009-1021`) that scrolls to the prior edition in place.

**Withdraw.** **"Withdraw"** (`:1128-1144`) opens an inline reason field (required —
*"A withdrawal reason is required."*, `:398-402`) and **"Confirm withdrawal"**
(`:1234-1242`); success message: *"Approval withdrawn. Its evidence remains in the
record."* (`:412-416`) Withdrawal now works on both unpublished drafts and pending
approvals (00465's redefinition of `withdraw_project_approval_decision`
widened the accepted status set from `pending`-only to `draft OR pending`).

**No offline/manual signature path exists for Stage-2** — unlike System B's
`MarkSignedSheet`, there is no designer-side "record it happened outside the portal"
action here; the response can only come from the client through
`respond_project_approval`.

### A.5 Exact designer-facing copy (consolidated)

- Region: **"Client approvals"**, eyebrow **"Exact artifact · named authority"**
- Head actions: **"New approval"** / **"Close draft"**, **"Assign project client"**,
  **"Assign current project client"**
- Composer heading: **"Draft an exact review request"**; gate part legends:
  **Artifact, Question, Scope, Impact, Authority, Confirmation**
- Field labels: **Issued artifact**, **Title**, **Approval question**, **Exact
  project phase**, **Scope note** (placeholder *"What this releases, and what it does
  not."*), **Cost delta (cents)**, **Schedule delta (days)**, **Lead-time delta
  (days)**, **Due date and time**
- Helper text: *"The bound phase is the scope of record; the note qualifies it and
  is never an approval response"*
- Submit/cancel: **"Create review draft"**, **"Cancel"**
- Row actions: **"Publish for approval"**, **"Withdraw"**, **"Confirm withdrawal"**,
  **"Supersede with new artifact"**, **"Create superseding draft"**
- Status labels (`readableStatus`, `:126-135`): **Withdrawn**, **Superseded**,
  **Changes requested**, **Needs discussion**, **Approved**, **Draft**, **Pending ·
  overdue**, **Pending**, **Expired**
- Authority line: *"Decision lead — {clientName} · frozen at publish"* or
  *"Decision lead — the designated project client · frozen at publish"*
  (`:172-177`)
- Empty state: *"No exact-artifact approvals have been authored."*

---

## B. PROPOSAL SEND + SIGNATURE (legacy)

**Read this caveat first.** As of the code on disk, sending a *fresh* legacy proposal
is retired. `LegacyProposalInstruments`
(`apps/designer-portal/src/components/document/proposal-instruments.tsx:235-414`)
documents it plainly: *"Legacy retirement: no new legacy sending. A draft here is
either a project-bound furnishing draft... or an orphan legacy draft that stays
editable but is no longer sendable — new client-facing agreements start as design
agreements."* A draft-status legacy proposal shows only **"Continue drafting"**
(walks into the Drafting Room) — there is no "Send" button on it any more. Everything
below is still fully live, though: it is what the designer sees for **every legacy
proposal already out the door** (sent/viewed/revised/expired/declined/accepted), it
is what a designer uses to **resend** or check delivery on one, and the exact same
`SendSheet` / `send_proposal` / notification machinery is still what the newer
"design services agreement" rail (`ServiceAgreementInstruments`,
`service-agreement-drafting-room.tsx`) calls for new client-facing agreements —
that successor system was out of this directive's scope and is not documented here.

### B.1 Trigger & entry points

The proposal-stage document renders `ProposalInstruments`
(`apps/designer-portal/src/components/document/proposal-instruments.tsx:56-108`),
gated to `engagement_kind === 'proposal'` — this is the *same* `/doc/[id]` route
System A uses, just showing different content for a different lifecycle stage (see
§F). Two states:

- **Draft** — a Golden-Hour work band: a `StrataMark` fill showing *"Drafting the
  proposal — {pct}% written"*, body copy *"Not started yet — open the Drafting Room to
  write it"* / *"A draft taking shape · {pct}% written — keep going"* /
  *"{Ready to send} — every facet is written,"* and button **"Continue drafting"**
  (`:341-394`) → navigates to `/drafting/{proposalId}` (the Drafting Room,
  `rooms/drafting/drafting-room.tsx`), where the proposal is actually composed and,
  for new commercial documents, sent.
- **Out the door** (any non-draft status) — the section becomes `ProposalWatch`
  (§B.4) plus, above it, a persistent **"send wall"** line (`SendWallLine`,
  `:116-233`) that is *never silent* about where the document stands.

**The Send flow itself** (`SendSheet`,
`apps/designer-portal/src/components/document/overlays/send-sheet.tsx`) is a
full-screen `DocSheet` overlay — comment: *"the document-native send instrument...
ported 1:1 into a charcoal DocSheet (D8) that slides up over the open Proposal —
never a route, never an unmount (D1)."* (`:1-16`) Title **"Send proposal"**; subtitle
line *"{proposal title} · v{version}.0 · ${total}"*; explainer copy:

> "The client receives a branded email with your note and a link to the full
> proposal — same design, same fonts. They sign at the bottom; you're notified when
> they open, view, and sign." (`:611-616`)

**Preconditions / guards**, surfaced live under a **"Client copy check"** panel
(`:807-873`):
- *"Checking the latest client preview and payment schedule…"* while validating.
- **Hard blockers** (send disabled), header *"Not safe to send yet"*
  (`assessProposalSendReadiness`,
  `apps/designer-portal/src/lib/document/proposal-send-validation.ts:24-54`):
  - *"The client preview is still refreshing and does not match the proposal
    total."* — proposal total ≠ materialized client-copy total.
  - Payment-schedule issues from `assessProposalPaymentSchedule`
    (`packages/supabase`, function found via `grep`, messages verbatim):
    *"The client-facing proposal total must be greater than $0."*,
    *"Add a payment schedule before sending."*,
    *"Payment milestones currently allocate {N}%; they must total 100%."*,
    *"Every payment milestone needs a client-facing label."*,
    *"{label or 'A payment milestone'} must be greater than 0% and $0."*
  - If the linked client has no email: *"Add an email to the linked client before
    sending."* (`:733-737`)
  - If the proposal isn't linked to a client yet, a **ClientPicker** banner blocks
    send entirely: *"This proposal isn't linked to a client yet. Choose the client it
    belongs to so they receive the proposal and can sign it."* (`:655-661`)
- **Soft warnings** (send allowed only with acknowledgement) — header *"This draft is
  incomplete"*, listing e.g. *"Still missing: {gaps}."*, with a required checkbox: *"I
  reviewed the missing parts and still want to send this version."* (`:850-869`) —
  the code comment is explicit that this exists so *"Send as-is" cannot silently
  bypass an 83% draft.*
- All-clear: *"Client total and payment schedule are ready to send."* (`:879-884`)
- If another version of the same proposal chain was already accepted: *"Another
  version is already accepted — Another version of this proposal has already been
  accepted. Sending this version will not affect the accepted one."* (`:700-708`)

Fields: **Recipient** (read-only, the linked client), **CC (optional)**, **Expires
after** (a select of durations), **Personal message** (textarea, placeholder *"Write
a personal note to your client…"*). Buttons: **"Send proposal"** (disabled unless
`canSend`) and **"Send later"** (`:975-991`).

### B.2 Data model

**`proposals`** is its own dedicated table (not `client_decisions`) with lifecycle
`status`. From the code read, the full status vocabulary is: `draft`, `sent`,
`viewed`, `revised`, `expired`, `declined`, `accepted`
(`proposal-watch-derivation.ts:20-26`, `send_proposal`/`record_offline_signature`
guards). Relevant columns seen: `sent_at`, `viewed_at`, `accepted_at`, `signed_at`,
`signed_by_name`, `signed_ip`, `last_nudged_at`, `nudge_count`, `valid_until`,
`personal_message`, `cc_email`, `version`, `parent_proposal_id`, `client_id`,
`project_id` (NULL until activation), `document_kind` (`legacy | design_services |
service_addendum | furnishings_authorization | trade_scope`), `commercial_state`
(00412/00414, e.g. `client_signed`, `executed`, `declined`, `superseded` — a
*separate* state machine for the newer commercial-document rail, layered over the
same `status` column), `issued_on_paper` (00477).

**State transitions found:**
- `send_proposal` (00176 origin; current head 00414, wrapping `_send_proposal_with_
  dispatch`): `draft → sent`, stamps `sent_at`, and **atomically supersedes sibling
  versions** in the same proposal chain — any other `sent`/`viewed`/`revised` row
  sharing the root becomes `revised` — "so a stale version can no longer be viewed-
  as-pending or signed by the client" (00176:290-300). Guarded by full optimistic
  concurrency: `p_expected_updated_at`, `p_expected_total_amount`,
  `p_expected_schedule_fingerprint` (00414:273-281) — i.e. a stale send-sheet cannot
  send a version of the proposal the designer didn't actually review.
- Client-side (out of scope, inferred from column names / triggers, not directly
  read): `sent → viewed` on client open; `viewed`/`sent → expired` past
  `valid_until`; `→ declined` on client decline.
- **Sign, digital** — `sign_proposal(proposal_id, signed_name)` (client-invoked,
  origin 00210, current head 00400) — requires an authenticated client
  (`auth.uid()`), delegates to a private `_sign_proposal_authorized_00400` core.
  Requires ≥2-char name. On success (00400:375-382): returns
  `{status, signed_at, accepted_at, project_id, newly_signed}` — **and auto-activates
  the project in the same call** (`_activate_proposal_as_project_authorized`) unless
  one already exists. A `sign_proposal_with_trusted_ip` service-role variant exists
  for the production API route to attach a server-verified IP without trusting the
  client's own claim (00400:445-505).
- **Sign, offline/paper** — `record_offline_signature(proposal_id, signed_name,
  auto_activate=true, start_date=today)` (designer-invoked, 00254): requires the
  authenticated caller to be the proposal's own designer; only accepts
  `status IN ('sent','viewed','expired')` — *"A paper signature isn't time-boxed, so
  'expired' is allowed and there is no valid_until check. 'draft'/'declined'/'revised'
  are excluded."* (00254:101-108) Idempotent: an already-`accepted` proposal is a
  no-op returning the existing `project_id` (00254:95-99).

**Both sign paths write the identical shape into `client_decisions`** — this is the
single most important fact tying System B to System A's substrate (see §F): one row,
`decision_type='approval'`, `blocking_status='non_blocking'`, `status='responded'`
(immediately — there is no draft/pending phase for a proposal signature),
`linked_proposal_id = proposal.id`, `title='Proposal approval'`,
`client_consent_method` = `'electronic_signature'` (via `sign_proposal`) or
`'paper'` (via `record_offline_signature`; CHECK constraint widened for `'paper'` in
00254:37-43), `client_signature` = the signed name, `client_consented_at`/
`sent_at`/`responded_at` = the signature instant, `selected_by` = the actor who
recorded it (the client for e-sign, the **designer** for paper). A **partial unique
index**, `client_decisions_one_approval_per_proposal` (origin 00210:36), guarantees
exactly one approval row per proposal even if both paths somehow race. `sign_proposal`
re-verifies this exact row's shape byte-for-byte against the `proposals` row before
trusting an idempotent retry (00400:184-243) — a deliberate anti-forgery check,
not just a convenience read.

An audit trail is kept separately in **`proposal_engagement`**
(`event_type`: `opened`, `section_viewed`, `signed`, `signed_offline`, plus
whatever records views — not directly read), with per-`section_viewed` rows
carrying `section_type` (`vision | concept | space_plan | selections | investment |
timeline | terms`) and `duration_seconds`. This table is what backs the "record" log
and reading-time stats in the watch view (§B.4) — it is populated by the client's
own reading session (client-portal side, out of scope here) plus one `signed`/
`signed_offline` row written by whichever sign RPC ran.

**Consent-method model:** `client_consent_method ∈ (electronic_signature |
click_through | paper)` (column defined 00117, widened for `paper` at 00254) is a
`client_decisions` column, **shared verbatim with Stage-2's own consent columns**
(`client_signature`, `client_consented_at`) — System A's `respond_project_approval`
writes into the same three columns, just restricted to `electronic_signature` /
`click_through` (Stage-2 has no paper/offline path).

**Who can do what:** `send_proposal`/`nudge_proposal` — the proposal's own
designer (`_can_author_proposal`). `sign_proposal` — the linked client only
(`auth.uid()` must resolve; no designer override). `record_offline_signature` — the
designer only, explicitly modeling "the client signed a physical piece of paper and
told the designer."

### B.3 What "sending" does

`useSendProposal` (`packages/supabase/src/hooks/use-proposals.ts:986-1207`) runs the
RPC, then — unlike Stage-2, where the *server* enqueues the notification —
**the designer's own browser directly invokes the edge function** on success:

```
send_proposal (RPC, flips status + supersedes siblings)
  → returns { sent_at, proposal_send_dispatch_id }
  → client calls supabase.functions.invoke('proposal-send', { proposalId, sentAt, dispatchId })
```

(`use-proposals.ts:1149-1180`, `invokeProposalSendEdge`). The edge function
(`supabase/functions/proposal-send/handler.ts`, `renderProposalEmail`,
`:219-301`) builds the email from a **dispatch snapshot** row (already resolved
server-side, including `client_portal_path`) rather than re-querying live state.

**Exact subject and copy** (verbatim), branching on `document_kind` — the legacy
`proposal` case:
- Subject: `{senderName} sent you a proposal: "{proposalTitle}"`
- Heading: **"Your proposal is ready"**
- Body: *"Hi {clientName}, {designerName} has prepared a design proposal for you:
  **{proposalTitle}**."* + optional personal-message callout + *"**Investment:**
  {formatted total}"* + optional *"Please review by {date}."* + a CTA button
  **"Review proposal"** + *"If the button doesn't work, copy this link: {link}"* +
  "— Patina" (`:249-300`)

**The link is real and specific — a genuine contrast to System A.** `link =
{CLIENT_PORTAL_URL}{clientPortalPath}`, where `clientPortalPath` is server-resolved
per dispatch (test fixtures show the shape `/proposals/{proposalId}`,
`proposal-send/handler.test.ts:43`) and `CLIENT_PORTAL_URL` defaults to
`https://client.patina.cloud` (`supabase/functions/proposal-send/index.ts:27-28`) —
**the correct client-facing domain**, not the designer portal. This is not a bearer
token — the client still needs to sign in to `client.patina.cloud` to view/sign it;
it is a deep link to the specific proposal, not just "go to your dashboard."

**Nudge.** Button **"Nudge {client's family name}"**
(`proposal-instruments.tsx:194-204`) → `useNudgeProposal` → RPC `nudge_proposal`
(00231) stamps `last_nudged_at` + `nudge_count` (never re-stamps `sent_at`, never
supersedes siblings — "deliberately NOT a re-send," `use-proposals.ts:1238-1245`),
then the client invokes the `proposal-nudge` edge function directly (same
client-invokes-edge-function pattern as send). RPC-enforced: ownership, a
`sent`/`viewed` state only, and a **3-day cooldown** server-side
(`NUDGE_COOLDOWN_DAYS`, `proposal-watch-derivation.ts:101`, matched in
00231's own RPC). Email subject: **"A reminder about your proposal"**
(`proposal-nudge/index.ts:158`, personalized with the studio/sender name when
resolvable). Success/failure feedback in the portal: *"Reminder sent to
{family}."* or, if the RPC stamp succeeded but the email failed, *"Nudge recorded,
but the email couldn't be sent — follow up directly."*
(`proposal-instruments.tsx:144-151`)

**A paper-issued proposal is deliberately never nudge-eligible** — code comment:
*"nudge_proposal (00231) would accept it, burn the three-day cooldown and dispatch a
reminder email — to a household that may have no address on file and was never
emailed in the first place."* (`proposal-watch-derivation.ts:369-373`)

**On signature**, `proposal-sign-confirmation` fires a **designer-addressed** email:
subject **`Signed: "{proposal title}"`** (`:144,179`) — the direct System-B analog of
System A's `Resolved: "{title}"`.

**No SMS** was found for this system either.

### B.4 What the designer sees after sending

`ProposalWatch` (`apps/designer-portal/src/components/document/proposal-watch.tsx`)
replaces the draft work-band once a legacy proposal is out. It is driven entirely by
the pure, unit-tested `deriveProposalWatch`
(`apps/designer-portal/src/lib/document/proposal-watch-derivation.ts`), which folds
`proposals` + `ProposalEngagementStats` + raw `proposal_engagement` events into one
view-model — comment: *"so all the 'is it sent / opened / how many times / how long
has it sat' logic lives in one tested place and the JSX stays dumb."*

**Stamps** (`deriveStamp`, `:127-145`): `SENT` (clay), `VIEWED` (sage) — promoted to
**`AWAITING`** (golden) once a viewed-but-unsigned proposal has sat ≥2 calendar days
(`AWAITING_AGED_DAYS`), `SIGNED` (sage, on `accepted`), `DECLINED` (terracotta),
`EXPIRED` (muted), `REVISED` (muted).

**Layout** (`proposal-watch.tsx:180-330`): eyebrow **"With the client"**; a
four-up figures strip — **Sent** (date), **Opened** (`{N}×` / "not yet", with a
"last {date}" sub-line), **Reading** (formatted minutes), **Most read** (the
top-dwelt proposal section by label); below that, a live-updating status line
(`statusLine`, `:73-90`) — e.g. *"Sent 3 days ago · not yet opened"*, *"Awaiting
signature · 4 days"*, *"Opened Jun 12 · awaiting signature"*, *"Superseded by a
newer version"*, *"Expired · sent Jun 1"*, *"Declined by the client"*; a collapsible
**"the record ↓/↑"** per-open log listing each `Dispatched` / `Opened · {N} min ·
lingered on {Section}` entry with date + time (`:238-267`); a preview panel headed
**"The client's copy · as sent"** with a **"Preview as {family}"** button opening the
client-facing rendering full-screen (`proposal-preview.tsx`, gated so the preview
never mutates anything).

**Actions** (`:283-320`): while awaiting, **"Email delivery"**; once terminal,
**"Email delivery status"** — both open `SendSheet` again in its resend/status mode
(`proposal.status !== 'draft'` branch, `send-sheet.tsx:965-991`), where the
buttons become **"Retry email delivery"** / **"Check delivery"** / **"Close"**
instead of Send. And, while `status ∈ {sent, viewed, expired}` (signable):
**"Mark signed →"** — opens `MarkSignedSheet`.

**Retirement note printed directly on the watch**: *"Changes now travel as a design
services agreement."* (`:326-330`) — legacy "Revise" is gone; there is no clone/
resend-as-new-draft act any more for a legacy proposal.

**Offline/manual signature — `MarkSignedSheet`**
(`apps/designer-portal/src/components/document/overlays/mark-signed-sheet.tsx`).
Eyebrow **"Signed offline · on paper"**; heading **"Who signed, and when?"**;
explainer: *"Records the paper signature against this proposal and opens the
project — the same as if they had signed here."* Two fields: **"Signed by"**
(pre-filled with the client's name, placeholder *"The name on the signature line"*)
and **"Date signed"** (defaults to today). Submit: **"Record signed →"** (disabled
until the name is ≥2 characters and the date is valid); **"Cancel"**; a trailing
note **"opens the project"** sits beside the buttons. On error: *"Enter a valid
signature date in MM/DD/YYYY format."* or the RPC's own message, else *"Could not
record the signature. Try again."* On success the sheet closes and the caller is
handed the (possibly newly-activated) `projectId`.

**On acceptance (either path), the watch collapses to a quiet seal**
(`SignedSeal`, `:377-465`): stamp **SIGNED** (sage) plus one line — *"Signed
{date} — the project is open"* if a project already links back, or *"Signed
{date} — waiting on your hand to open the project"* with an **"Open the project"**
button (→ `activate_proposal_as_project`) if not. This fixed a documented defect
(`docs/design/the-document/DECISIONS.md:2620`, walk finding **F10**): the seal used
to print "Signed — the project is open." unconditionally, with *"no existence check
and no act,"* even when no project had actually been created yet.

### B.5 Exact designer-facing copy (consolidated)

- Draft band: **"Continue drafting"**; states *"Not started yet — open the Drafting
  Room to write it"*, *"A draft taking shape · {pct}% written — keep going"*,
  *"{Ready to send label} — every facet is written"*
- Send sheet: title **"Send proposal"**; explainer as quoted in §B.1; fields
  **Recipient**, **CC (optional)**, **Expires after**, **Personal message**; buttons
  **"Send proposal"**, **"Send later"**
- Readiness panel: **"Client copy check"**; **"Not safe to send yet"**; **"This
  draft is incomplete"**; **"Client total and payment schedule are ready to send."**
- Watch eyebrow: **"With the client"**; figures **Sent / Opened / Reading / Most
  read**; record toggle **"the record"**
- Watch actions: **"Nudge {name}"**, **"Email delivery"** / **"Email delivery
  status"**, **"Preview as {name}"**, **"Mark signed →"**
- MarkSignedSheet: **"Record the signature"** (sheet title), **"Signed offline · on
  paper"**, **"Who signed, and when?"**, **"Signed by"**, **"Date signed"**,
  **"Record signed →"**
- Seal: **"SIGNED"**, *"Signed {date} — the project is open"* / *"Signed {date} —
  waiting on your hand to open the project"*, **"Open the project"**
- Retirement note: *"Changes now travel as a design services agreement."*

---

## C. Relationship between the two systems

**They share one physical table, in mutually exclusive shapes.** Both a Stage-2
project approval and a proposal signature are rows in the same `client_decisions` /
`client_decision_options` tables — a general-purpose decision/gate aggregate that
predates both features (extended since at least
`supabase/migrations/00064_decision_workflow_v2.sql`, itself an `ALTER TABLE`, not a
`CREATE TABLE`, so the table's true origin is older than the numbered migration
ledger). The two features occupy structurally disjoint, mutually-exclusive shapes
of that same row, enforced by a database `CHECK` constraint
(`client_decisions_stage2_shape_check`, 00463:34-49):

| | Proposal signature | Stage-2 project approval |
|---|---|---|
| `approval_contract` | `NULL` | `'project_artifact_v1'` |
| `linked_proposal_id` | set (FK to `proposals`) | must be `NULL` |
| `project_id` | `NULL` until activation, then back-linked | required, non-null from creation |
| `status` on write | goes straight to `'responded'` — there is no draft/pending phase | `draft → pending → responded`, a full multi-step lifecycle |
| Options | none authored — an implicit single "Proposal approval" title | exactly 3 canonical options (Approved / Changes requested / Needs discussion), atomically created |
| Consent method | `electronic_signature` or `paper` | `electronic_signature` or `click_through` (no paper path) |
| Who can settle it | the client (e-sign) or the **designer on the client's behalf** (paper) | only the client (the frozen `decision_lead_id`) — no designer override exists |

So: **a proposal signature is modeled as a `client_decisions` row, not as a Stage-2
project approval** — they are siblings under one umbrella table, not one built on
top of the other. `linked_proposal_id` is exactly what the `client_decisions_stage2
_shape_check` constraint forbids on a Stage-2 row, which is the database's own
explicit statement that a Stage-2 approval is never a proposal decision and a
proposal decision is never a Stage-2 approval.

**They are, practically, sequential rather than overlapping**, gated by the same
document surface's own routing. The single `/doc/[id]` route (`app/(document)/doc/
[id]/page.tsx`) renders an entirely different instrument set depending on
`row.engagement_kind` (`lead | proposal | project | relationship`). System B
(`ProposalInstruments`, `ProposalWatch`, `SendSheet`) mounts only when
`engagement_kind === 'proposal'`; System A (`ProjectApprovalDocumentMount`) is
always in the render tree but is passed `projectId={null}` — and renders nothing
(`project-approval-document-mount.tsx:34`) — unless `engagement_kind === 'project'`
(`page.tsx:2685-2692`). A proposal's signature (either RPC) **auto-activates the
proposal into a project in the same transaction** (`activate_proposal_as_project`),
which is precisely the event that flips `engagement_kind` from `'proposal'` to
`'project'` and hands the same document over from System B's watch to System A's
approvals region. In the ordinary lifecycle a client engagement is never in both
systems' "active" state at once — System B ends (signature) exactly where System A
begins (a project with phases to gate).

**A third, older "signoff" path also exists and predates Stage-2**: the generic
coordination system's `resolveKind: 'sign'` panel
(`apps/designer-portal/src/components/document/coordination/item-resolve/resolve-
signoff.tsx`), which records a phase sign-off through `resolve_coordination_item`
(00218) as a plain (non-`approval_contract`) `client_decisions` row with
`coordination_kind='signoff'`. Per `docs/design/the-document/DECISIONS.md:7104-7127`
(ruling I113), this used to be reachable from a section's own work-block "Request
sign-off" button; that entry point was removed when Stage-2 shipped, but the
underlying generic coordination signoff mechanism itself was not deleted — it
remains live for whatever non-Stage-2 coordination items still use it. There is also
a wholly distinct **"approved" concept on mood boards**
(`apps/designer-portal/src/components/mood-board/board-approved-pins-panel.tsx`):
a client or guest "verdict" (`item_feedback.verdict = 'approved'`) reacting to a
pinned image, unrelated to `client_decisions` entirely — worth flagging so a UX
team doesn't conflate "approved pins" with either approval system.

**Which is canonical going forward.** Per
`docs/design/workflow-completion/APPROVAL-AUTHORITY-CONTRACT.md`: *"Project
approvals extend `client_decisions`. Patina must not create or dual-write another
approval aggregate."* and, under "Compatibility cutover": *"Proposal signatures
remain legacy decisions with no approval contract and must pass regression tests
unchanged."* The contract document frames Stage-2 as the durable, general-purpose
shape going forward for anything that is a bound-artifact client decision within an
active project, while proposal signature evidence is treated as a fixed,
already-correct legacy shape that Stage-2 must not disturb — not something being
migrated into the Stage-2 contract. `docs/adr/0003-household-comments-are-not-
approvals.md` states the shared underlying principle for both: *"Other household
participants may comment, but only the named approver set may submit an
authoritative response against an immutable artifact edition."*

Independent of the two named systems, the codebase itself is already mid-migration
away from legacy proposals toward a **third, newer "design services agreement" /
commercial-document rail** (`document_kind`, `commercial_state`, 00412/00414;
`ServiceAgreementInstruments`, `send_commercial_document`) — out of this
directive's scope, but worth naming because "no new legacy sending" means a UX
team designing around System B today is designing around a resend/status/paper-
signature surface for existing proposals, not the entry point for new ones.

## D. Existing tests that encode intended behavior

**System A (project approvals):**
- `apps/designer-portal/src/components/document/approvals/project-approval-model.test.ts`
  — pure-logic unit tests: signed-delta parsing/validation, future-due-date
  validation, the `projectApprovalActions` gating (publish requires full review
  coverage; supersede offered only for a genuinely new artifact+checksum).
- `apps/designer-portal/src/components/document/approvals/project-approval-document.test.tsx`
  (1172 lines) — authority CAS assignment/reassignment, completed-phase exclusion
  from authoring, the six-part gate anatomy rendering in order, exact artifact
  edition/proof/impact-delta formatting (including the "states unchanged rather than
  omits a zero delta" rule), settled-vs-bounced gate collapse behavior, supersession
  chain linking/focus, D4 (no shadows) and 44px-touch-target/one-column-320px
  accessibility assertions, and the fixed region-gap token contract.
- `apps/designer-portal/src/components/document/approvals/approvals-region-head.test.tsx`
  — the folded/quiet-density region head: exactly one ledger leader when open,
  correct default-fold behavior with no lead/no approvals, round-tripping the
  fold/unfold seam, the NF4-01 "ranked need's act is the sole quiet leader" rule.
- `supabase/functions/_shared/project-approval-notification.test.ts` and
  `decision-notify.test.ts` — the recipient-resolution and email-rendering helpers
  for decision notifications.

**System B (proposal send + signature):**
- `apps/designer-portal/src/lib/document/__tests__/proposal-watch-derivation.test.ts`
  — status→stamp mapping, the per-open "record" log construction (including R71
  Phase-4 per-section attention windowing), nudge-eligibility/cooldown logic
  (Phase 3), section-label humanization.
- `apps/designer-portal/src/components/document/overlays/__tests__/send-sheet.test.tsx`
  — the canonical client-copy/readiness validation surfaced in the send sheet.
- `apps/designer-portal/src/components/document/overlays/__tests__/mark-signed-sheet.test.tsx`
  and `.../overlays/mark-signed-sheet.test.tsx` — offline-signature date-field
  defaults/validation.
- `packages/supabase/src/hooks/__tests__/use-send-proposal.test.ts` — the
  `useSendProposal` payment-schedule preflight.
- `packages/supabase/src/hooks/__tests__/use-sign-proposal.test.ts` — the
  `useSignProposal` authority contract (who may call `sign_proposal`).
- `supabase/functions/proposal-send/handler.test.ts` and
  `commercial-render.test.ts` — the proposal-send email rendering per
  `document_kind` (legacy vs. design-services vs. furnishings vs. trade-scope
  copy branches).
- Per `docs/design/the-document/DECISIONS.md:2847` (ruling R92), the offline-
  signature path was verified end-to-end via a manual SQL smoke test at migration
  00254: idempotency on re-call, `client` callers rejected
  (`insufficient_privilege`), and `declined`/`draft` proposals rejected
  (`check_violation`) — described in the ruling log rather than a checked-in test
  file at that point.

## E. Friction/gaps (observations, not verified bugs)

1. **System A's client-facing emails may link to the wrong portal.** The `decision_
   required`/`decision_overdue` emails a client receives for a Stage-2 approval say
   only "Open your Patina dashboard" with no per-decision link in the body; the
   shared branded-email shell's footer nav (Dashboard/Help/Preferences) resolves
   from `DESIGNER_PORTAL_URL` (default `https://app.patina.cloud`,
   `supabase/functions/_shared/branded-email.ts:69-79`) — a variable name and
   default that read as designer-portal-scoped. By contrast, System B's proposal-
   send email correctly resolves its link from `CLIENT_PORTAL_URL`
   (`https://client.patina.cloud`, `supabase/functions/proposal-send/index.ts:27-
   28`). I did not verify what these env vars actually resolve to in prod, and it's
   possible `DESIGNER_PORTAL_URL` is intentionally repurposed there — but the naming
   and default strongly suggest a client recipient's footer links point at the
   studio's own portal rather than their own.
2. **Stage-2 emails carry no deep link to the specific decision at all** — only a
   generic "open your dashboard" instruction, versus System B's specific
   `/proposals/{id}` link. A client with several open approvals across projects has
   no way to jump straight to the one named in the email.
3. **A stale/orphaned metadata field**: `stamp_client_decision_reminder` (00465)
   writes `deep_link: '/decisions/' || decision_id` into `notification_log.metadata`
   for the in-app reminder, but I could not find anywhere in the designer-portal or
   client-portal code that reads/renders this specific field — it may feed a
   different in-app surface I didn't check, or be dead.
4. **A budget-version approval candidate can silently vanish.** Per the parent
   fork's read of `get_project_approval_artifact_candidates` (00465), a
   `budget_version` candidate is only listed while its `project_budget_checkpoints`
   snapshot fingerprint still matches the live budget — if the budget has since
   drifted, the candidate quietly disappears from the picker with no explanation
   surfaced to the designer.
5. **No nudge control lives inside the Stage-2 approvals region itself** — a
   designer has to go find the item in the margin rail to nudge a pending approval,
   whereas the equivalent System-B nudge is right on the send wall next to the
   document it concerns.
6. **`confirm_project_decision_review`'s only caller found is the sanitized hook**
   `useConfirmProjectDecisionReview` in `packages/supabase` — no designer-portal
   component calls it (correctly so, since only the client may confirm), but I did
   not check the client-portal or iOS app to confirm it is actually wired up there;
   if it isn't, a Stage-2 approval could get stuck at `draft` forever with no way to
   reach the publish gate.
7. **Two different authorization predicates gate authorship** — `set_project_
   decision_authority`/`create_project_approval_decision` use `is_design_studio_
   comember`, while `publish_client_decision`'s Stage-2 branch uses `_can_author_
   proposal` (per the parent fork's read of 00464:889-893). These may resolve
   identically in practice, but it's worth a UX/product sanity check on whether a
   studio role that can create an approval draft can always also publish it.
8. **"Legacy retirement" is only in code comments, not user-facing copy.** A
   designer opening an old, never-sent legacy proposal draft sees only "Continue
   drafting" with no explanation that this document type can no longer be sent as
   a legacy proposal — the `modelNote` text (*"New client work begins with a design
   agreement — this earlier-format draft stays for your records."*) only appears
   for a draft with no `project_id`, and even then reads more like an FYI than a
   redirect to the actual current send path.
