# Client portal homeowner usability — implementation specification

**Status:** Ready for implementation of the required core scope. No application changes have been made by this specification.

**Prepared:** October 20, 2026

**Repository:** [Kodeman/PatinaBase](https://github.com/Kodeman/PatinaBase)

**Source baseline:** `de198e8b3`

**Handoff branch:** `docs/client-homeowner-ux-review-2026-10-20`

**Review artifact:** [`artifacts/client-portal-review-2026-10-20/index.html`](https://github.com/Kodeman/PatinaBase/blob/905aa55d39796582b0fa4ea3a5de96a876f4d9a7/artifacts/client-portal-review-2026-10-20/index.html), first committed as `905aa55d3`

**Primary application:** `apps/client-portal`

**Audience:** Any coding agent implementing this work, plus the reviewing designer and engineer.

## 1. Assignment and intended result

Improve the existing client page for a homeowner invited by their designer who has low confidence using websites. They should be able to find and understand their invoices, respond to approvals, see project progress, and contact their designer without learning Patina's internal terminology.

Implement **CPUX-01 through CPUX-07** below. Preserve the existing single-page architecture, financial authority, approval records, access controls, and design-system conventions. Complete the applicable verification gates and provide the evidence listed in §12.

The HTML presentation is a discussion artifact, not production markup or a pixel-perfect specification. Its example names, prices, dates, tab treatment, green buttons, cards, and badges must not be copied into the application. This document translates the recommendations into the current Patina architecture and design rules.

This is an implementation handoff, not authorization to deploy, make payments, sign agreements, send messages, or mutate production data. A later explicit deployment instruction authorizes the deployment chain under `patina-deploy` without per-step re-asking.

### Copy-and-paste instruction for the implementing agent

> Implement the required core in `docs/specs/_active/client-portal-homeowner-usability.md`. Read the repository's current AGENTS.md and the skills named in the spec. Re-check the listed source symbols against your checkout. Deliver exactly CPUX-01–07, preserving payment and approval invariants; do not implement the deferred confirmation experiment. Use an isolated worktree, make explicit-path Conventional Commits, push the branch, and report acceptance-test evidence and remaining gaps. Do not deploy unless separately instructed. If the checkout already satisfies a requirement, preserve it and add only necessary regression coverage. Do not add unrelated features, refactors, services, schema changes, or design-system rewrites.

## 2. What was observed, and what was not

The October 20 review inspected an existing signed-in account at `client.patina.cloud` in a separate browser tab. That account landed in the studio-only view: one invoice was featured, “Six letters are waiting for you” appeared above it, and **five additional unpaid invoices due in the future were hidden under “Earlier invoices,” together with paid history**. The payment details used “A toll on the line” and “Settle the balance.”

At 390 × 844, the observed action targets were at least 44 CSS px high and there was no horizontal overflow. Some critical text was much smaller: the payment due-date line was about 10 px; several action labels were 12 px. These measurements are not a complete accessibility audit.

Invitations, full-project navigation, approvals, and progress were also examined in source by separate homeowner-journey and UI/accessibility reviewers. No fresh invitation, binding approval, payment submission, or message was exercised. **Do not assume the full project page lacks navigation or progress:** those capabilities already exist. Source findings must be rechecked against the implementation checkout and runtime.

## 3. Decisions already resolved for this implementation

| Topic | Required decision |
|---|---|
| Page structure | Keep `/` and `/projects/[projectId]`. Details unfold on the current page. No new invoice, approval, progress, inbox, or dashboard route tree. |
| Navigation | Evolve the existing `LandmarkLedger` into clearer in-document links. Keep it under the studio/project heading and scrolling with the page. No fixed header, bottom tab bar, utility bar, or moved project switcher. |
| Primary destinations | Use the visible names **Invoices**, **Approvals**, and **Progress**. Preserve useful existing Updates and Documents access. Keep named designer help nearby. |
| Invoice discovery | All outstanding invoice rows are visible without expanding history. Payment history may collapse. Processing and payment holds remain visible. |
| Confirmation | Retain the current hold interaction in core. Improve its wording, consequence, missing-input explanation, and focus behavior. The click-to-confirm alternative is deferred to §13. |
| Approval semantics | “Request changes” still records `changes_requested`; “Pause to discuss” still records `needs_discussion`. Asking an ordinary question is a separate action and records neither. |
| Data model | Reuse current tables, hooks, RPCs, domain types, query keys, and payment/approval contracts. No migration is expected. |
| Feature flags | Do not restore retired client-page flags or introduce a flag for the core clarity fixes. |
| Visual system | Follow the house sheet and R139–R141. The deck's styling is illustrative. Preserve studio authorship, existing instruments, and document hierarchy. |

### Required repository context

Read these before implementation; the running code and current user instructions take precedence over stale summaries:

- Root `AGENTS.md`; the applicable subtree instructions.
- `.agents/skills/patina-portal-features/SKILL.md`.
- `.agents/skills/patina-testing/SKILL.md` and `patina-verification/SKILL.md`.
- `.agents/skills/patina-local-dev/SKILL.md` before starting local infrastructure.
- `.agents/skills/patina-parallel-work/SKILL.md` for worktrees, delegation, and commits.
- `.agents/skills/patina-stripe-payments/SKILL.md` for any payment-facing changes.
- `.agents/skills/patina-brand-voice/SKILL.md` for homeowner copy.
- `apps/client-portal/README.md`, `docs/design/the-client-page/README.md`.
- `docs/design/the-document/DECISIONS.md`: **R139, R140, R141**; `docs/design/house-sheet/SPEC.md`.
- `docs/vision/VISION-DECISIONS.md`: **V8**.
- `artifacts/client-approval-experience-2026-09-03/build/PROGRAM-REPORT.md`, especially its later signature and consent-token corrections. This tracked report is available in a fresh checkout; do not depend on a local-only rulings file.

R141 expressly allows a short list of same-page anchors under the doorplate. It does not restore the retired header. R139/R141 require a consequence sentence above terminal actions and an explained unavailable state. R140 sets critical money/date/party/consequence text at a 15 px floor. Older approval proposals describe different hold behavior; the current component and its tests define the behavior to preserve.

### 3a. Founders' amendments — 2026-10-20 (Kody; supersede the lines they name)

Recorded from the US-45 interview after the US-44 design canvas (`artifacts/client-homeowner-design-2026-10-20/`, row 3b "Approvals, green direction"). Where this table conflicts with any other line of this spec, this table wins.

| # | Amendment | Supersedes |
|---|---|---|
| A1 | **Green direction.** The client page adopts the review deck's forest green as its single action colour: filled `#3E5145` with `#FFFDF9` ink (8.38:1) for every terminal act — Approve this edition, Send change request, Confirm pause, and every Pay / Continue to secure payment button. Choices (Approve / Request changes / Pause to discuss) are green-outline buttons that fill green when picked. | §1 "green buttons … must not be copied"; §3 Visual system row; CPUX-07 terminal line (§4, "keep R139's charcoal treatment … Do not copy the presentation's green buttons"); R139 terminal colour on client surfaces. |
| A2 | **Green replaces clay on the client page.** Links, italic party names, focus ring, and selected states use forest green; clay/Mocha leave client surfaces (resolves canvas F8). Studio branding is unchanged. | Clay accent on client surfaces. |
| A3 | **Framed cards.** Approval asks and the payment sheet sit in deck-style cards: `#FFFDF9` fill, 1px `#C9C7BD` border, 8px radius, soft shadow. Consequence/next-step notes use the pale green note `#F0F3ED`; recorded approvals use `#E8EEE7` fill with `#B6C3B7` rule. Unavailable acts: `#E8EEE7` fill, dashed `#6E7B71` edge, `#4A574D` text, and a visible reason line (resolves canvas F4 and green-row Q7/Q8). | Document-stock payment sheet; "cards" in §1. |
| A4 | **Hold stays.** The 900 ms hold remains on every binding act (§3 Confirmation row and §13 stand unchanged). | — |
| A5 | **Designer portal in scope (one slice).** The designer portal's terminal tier (`.da-terminal`: money and signature acts) fills forest green instead of charcoal, and client-response states (Approved verdicts, paid/complete status, recorded approvals, success notices) move from pale sage to the green record treatment. Its buttons' other tiers, navigation, and the US-43 `--focus-ring` stay as they are. | §8 "cross-portal UI changes" (for this slice only). R139 terminal colour in the designer portal. |
| A6 | **Deploy authorized after review.** Once gates, independent review, and screenshots pass, the founder's go on the screenshots authorizes deploying client-portal and designer-portal under `patina-deploy`. | §1 / §8 / §12 "not deployed" default. |
| A7 | **Canvas rulings taken as drawn.** F1 literal heads (Invoices, Approvals, Progress); F2 15px quiet tools / 16px ledger links on client pages; F3 the canvas Main order; F6 the studio-only purpose sentence "Pay invoices, review approvals, and follow your project here."; F7 click-to-confirm stays deferred. | Open founders' questions F1–F8 in the canvas brief. |

## 4. Required behavior

### CPUX-01 — A recognizable arrival and stable in-page wayfinding

**Applies to:** full project `Threshold`, named project routes, and studio-only `LetterboxDoor`.

1. Keep the studio/project identity as the page's introduction. Add one concise purpose sentence where needed: **“Pay invoices, review approvals, and follow your project here.”** A studio-only state must not imply that project information is available when it is not.
2. Under the doorplate, offer **Invoices**, **Approvals**, and **Progress** as page-local links. Reuse the existing `LandmarkLedger` and action primitives. Use descriptive link text, not icon-only controls or numeric badges.
3. Preserve existing meaningful sections and anchors, including Updates, Documents, money standing, correspondence, and other houses in the mat. This is not a wholesale page reorder. The current highest-priority ask keeps its prominence.
4. Invoices targets `#letterbox`. Approvals targets the existing first relevant ask through the current `whatNeedsYou` logic; when no ask is present, provide a truthful empty state at a stable location on the page. Progress targets the progress summary at `#road`, keeping detailed order progress there.
5. All displayed links must have a rendered destination. Studio-only Approvals can expose pending origin agreements already available in that view. If no project is connected, Progress lands on an explanation, not an empty diagram or broken anchor: **“Your project isn’t connected to this page yet. You can still view and pay your studio invoices.”** Do not claim the designer has not started the project; absence from the page is the fact known.
6. Never display “Nothing to approve,” “No payment due,” or an all-clear statement until the relevant reads have succeeded. Empty, loading, failure, and incomplete cached data are different states.
7. Keep the task summary factual and derived. Prefer prose such as **“You have six invoices to review.”** Use existing count-word conventions; do not add notification badges or a separate task system. Do not sum unlike approval types into a count unless each distinct actionable request is represented exactly once.
8. No onboarding modal, required tour, new account-profile step, new password requirement, or persisted first-visit flag is needed. A short introduction and the actual work are sufficient.

**Acceptance:** a homeowner can find all three destinations from the top of either page state; each link reaches actual content, an honest empty state, or a recovery message without leaving the project. Project switching remains in its existing place.

### CPUX-02 — One invoice projection; every outstanding invoice discoverable

#### Shared projection and ownership

Introduce a small pure invoice display projection by extending `lib/threshold/invoice-rollup.ts` or adding an adjacent `invoice-groups.ts` that imports the existing helpers. Use it in the invoice portions of `deriveThreshold`, `LetterboxDoor`, `Letterbox`, and the current `EarlierInvoices` presentation. Avoid separate implementations of visibility, counts, sorting, and totals.

Inputs are existing `Invoice` records, an explicit calendar-day reference for tests, and explicit read completeness/error state. Return existing records plus display grouping/counts/totals; do not redefine the database or invoice domain type.

Preserve these boundaries:

- `visibleInvoices` excludes `draft` and `void`. A URL parameter cannot bypass that rule or authorization.
- Deduplicate by invoice ID before counting, totaling, or rendering.
- Project pages show their project invoices. Studio invoices (`project_id === null`) are added **only to the adopted project**, as determined by `adoptedHouseId` / `standsUnfiled`.
- The adopted project is the lexicographically lowest nonempty ID among the homeowner's projects. It is not necessarily the active or most recently updated project. Do not duplicate studio invoices across projects.
- With no project, `LetterboxDoor` retains its studio invoices, pending origin agreements, and signed-agreement history. Do not replace it with an invoice-only component that discards those records.
- Resolve the payee for each row through the existing `useLetterPayee` identity. A studio invoice can belong to a different studio than the surrounding project. Never charge or label it using a guessed page-level payee.

#### Amounts and grouping

Use `invoiceBalanceCents` from `@patina/shared` for remaining balances. Keep integer cents and the existing fee functions. Never derive settled money from a checkout return URL, selected method, notification, or optimistic state.

| Group / state | Rule | Required presentation |
|---|---|---|
| Payable candidate | `sent` or `partially_paid`, with canonical balance greater than zero | Visible under **Invoices to pay**, subject to existing checkout eligibility and the processing/hold rules below. |
| Processing | Existing payment evidence shows `status === 'pending'` and a non-null `stripe_payment_intent_id` | Visible under **Payments in progress**, adjacent to unpaid invoices. Explain that confirmation is pending; do not offer another payment. |
| Payment needs review | Existing evidence includes `requires_refund`, or the server returns its reconciliation hold | Visible under **Payment needs review** with available facts and designer help. Do not offer a retry payment or call it a paid receipt. |
| History | `paid`, or a visible zero-balance row | Findable under **Payment history**. Say **Paid** only with paid evidence; a zero-balance `sent` row can say **No balance due**. Do not invent a receipt or paid date. |
| Contradictory or unfamiliar state | For example, paid status with a positive canonical balance, unknown status, or evidence that cannot be reconciled | Show available facts and a payment-status/help message. Do not silently invent eligibility or successful settlement. |

Assign each invoice to exactly one primary group, in this precedence: **review-required/contradictory hold → processing → payable → history**. Preserve any additional relevant facts as secondary text. For example, a zero-balance row with `requires_refund` remains in review, and review takes precedence over a simultaneous pending PaymentIntent. No invoice may appear or count in two groups.

A pending payment **without** a PaymentIntent can be an abandoned or newly claimed checkout; it is not proof that funds are processing. A checkout-session ID alone is not processing evidence. The current resolver documents this distinction in `supabase/migrations/00636_invoice_link_hardening.sql`; recheck the current authoritative implementation before reusing the predicate.

The `Invoices to pay` count must match the actionable payable rows in that group. State processing/held counts separately. A visible **Total outstanding** includes the canonical unpaid balances of payable, processing, and held rows, counted once, and identifies the scope: this project and any displayed studio invoices, or studio invoices when there is no project. Do not present it as every balance across all the homeowner's projects.

Sum separately by `invoice.currency`; never convert currencies or display a mixed-currency dollar total. All rows and totals use their actual currency. If reads are incomplete or evidence is contradictory, withhold an authoritative combined total and explain that status is incomplete.

#### Sorting

- Outstanding rows: valid due date ascending; missing or invalid due dates last.
- Due-date ties: first valid issue date, else sent timestamp, else created timestamp, ascending; invoice ID lexical as the final tie-breaker.
- History: first valid paid timestamp, else sent timestamp, else created timestamp, descending; missing dates last; invoice ID lexical as final tie-breaker.
- Use `parseSourceDate` in `lib/threshold/dates.ts`. Date-only values are calendar dates, not UTC midnight shifted into the previous day. A due-today invoice is not past due before the end of that local calendar day. Use an explicit date in unit fixtures.

#### Layout and interaction

- Outstanding groups are expanded by default. History can collapse. No outstanding row may be hidden solely behind **Earlier invoices** or history.
- Each row shows invoice number, title if supplied, project/studio origin, remaining amount, and written due/payment status. Use the invoice number as the fallback identifier; do not invent a description.
- Use **View invoice** for a row's disclosure. The expanded region contains its details and existing payment flow. Keep any existing explicit **Pay {amount}** entry point accurate and nonduplicative.
- Prefer one expanded payment region per invoice collection, with one set of payment inputs. Opening another invoice closes the old disclosure without submitting or clearing server state. Keep each invoice's draft UI state scoped to its ID where needed. Preserve server-returned holds and uncertain checkout outcomes by invoice ID across close/switch/reopen, either above the disclosure or by preserving the settlement component's state. A reconciliation hold may reflect missing/inconsistent attempt evidence without a `requires_refund` row; a plain invoice refetch is not necessarily proof that the hold cleared. Only an authoritative resolution can release it.
- Opening moves focus into the named region and announces what opened. Closing restores focus to the invoking row control. Reopening history for a named paid invoice must work as well.
- Preserve print links. Label a link **Receipt** only if it actually leads to a verified payment receipt; an invoice print sheet is not automatically a receipt.

#### Read parity and failures

`useProjectInvoices` currently joins `payments`; `useClientInvoices` does not. Add the same authorized `payments:invoice_payments(*)` read shape to the client invoice hook, with tests, if needed to give both surfaces the above states. Keep its RLS scope and query key. Missing payment details must not be interpreted as proof that no payment is processing.

| Read condition | Required behavior |
|---|---|
| Initial pending | Invoice loading state; no zero count or all-clear. |
| Failed with no data | **“We couldn’t load your invoices.”** with Retry. |
| Adopted-project merge with one read failed | Retain available rows, label the list incomplete, withhold combined count/total and all-clear statements. Retry the necessary reads. |
| Background refresh failed | Keep cached rows, identify the refresh failure, and do not imply current completeness. |
| Successful empty outstanding groups | **“No invoices to pay.”** Keep history if present; distinguish any processing/held group. |

An invoice error must not erase origin agreements or working project content. A proposal error must not erase readable invoices. Preserve hydration gating and call hooks before early returns.

**Acceptance:** the mixed-invoice fixture in §10 exposes all six outstanding rows without expanding history; the zero-balance sent row cannot inflate a payable count; adopted-project ownership, currencies, pending evidence, and partial-read states remain correct.

### CPUX-03 — Clear payment language with unchanged payment authority

Reuse `Settlement`, the portal and guest `PaymentMethodChooser` patterns, existing fee helpers, `useStartCheckout`, and the checkout receipt parser. This is a presentation/read-shape change, not a change to payment policy or the payments rail.

**Required fee-read correction:** `useInvoicePaymentOptions` currently returns default options as successful data on RPC failure or malformed/missing fee fields. An `isError` check alone cannot distinguish a verified quote from this fallback. Add compatible quote-source/availability metadata, or an equivalent explicit result contract, so the client knows whether the required fee was actually resolved. Keep the RPC, query key, fee policy, calculation helpers, and existing consumers compatible. An unresolved authoritative card fee must show a recoverable unavailable state, withhold a confirmed card total, and prevent card continuation until resolved. Test transport/RPC failure, malformed data, and a missing fee field. Do not disable an independently verified method merely because another method is unresolved, or introduce a guessed fallback fee.

1. Replace **A toll on the line** with the actual due status, for example **Due 2 November 2026** or **Past due · 25 September 2026**, in ordinary body ink.
2. Replace **Settle the balance** at the checkout continuation step with **Continue to secure payment · {total}**. The amount includes the selected method's known fee. If a method is not yet selected or a required quote is unavailable, do not display a guessed total or enable checkout.
3. Show the full total for each available payment method with the fee underneath, following the clearer existing guest chooser. Preserve availability, defaults, fee policy, caps, and calculation source. Never hard-code the presentation's example fees.
4. Keep the invoice number and real payee visible. Above the continuation action explain that the next screen reviews/confirms payment. Opening details or changing a method does not submit payment.
5. Preserve check instructions and the separate check-intent acknowledgement. **Check expected** appears only after a successful acknowledgement; it does not reduce the balance, become Paid, or create a receipt.
6. Preserve duplicate-submit prevention and the existing checkout idempotency/receipt behavior. Rapid activation must not start a second checkout. Reconcile with authoritative results after async work; do not act on a stale invoice snapshot.
7. Preserve `payment_processing` and `payment_reconciliation_required` as holds, including across closing and reopening the details. Network uncertainty is not payment failure and must not invite a second charge. Reuse the existing authoritative resolution path; if it cannot resolve a returned hold, retain it and offer designer help rather than inventing a clearing condition.
8. Keep the canonical nonce return path: `/pay/return/[nonce]` resolves to the appropriate `/pay/[token]` result, including dead/spent cases. Do not replace it with a home-page redirect, bypass its nonce, mint payment tokens on page load, or treat `?checkout=settled` / `success` as proof of funds.
9. Only authoritative payment evidence can produce processing, paid, failed, or receipt copy. A successful redirect alone must say no more than the existing verified result permits.

**Acceptance:** amount and payee match the invoice and server response; payment choices disclose verified full totals; unresolved fee data cannot appear as a successful quote; opening a row causes no mutation; double activation is guarded; processing and reconciliation holds survive closing/switching/reopening and cannot expose another payment; check intent and settlement remain distinct.

### CPUX-04 — Understandable approvals with exact existing consent

#### Outcome labels and payloads

| Visible choice | Existing outcome | Final action label | Input and consent that must remain |
|---|---|---|---|
| Approve / Approve this edition | `approved` | **Approve this edition** (use the actual document noun when available) | Trimmed signature name satisfying current `signatureIsComplete` (currently at least two characters); `clientSignature`; `clientConsentMethod: 'electronic_signature'`. |
| Request changes | `changes_requested` | **Send change request** | Nonblank trimmed change note, posted through the existing discussion path before the response. No signature; `clientConsentMethod: 'click_through'`. |
| Pause to discuss | `needs_discussion` | **Confirm pause** | No required signature or note; `clientConsentMethod: 'click_through'`. Explicitly explain that this records a pause/discussion outcome. |

Provide a separate **Ask {designer} a question** action only where it can focus/open the existing approval discussion. It must not record `needs_discussion`, approve, reject, or submit a comment merely by opening the composer. The homeowner explicitly selects Send to send a question.

Do not flatten every instrument into “Approve item.” Keep **Sign agreement**, review confirmation, commercial authorization, scope-change consent, and other legally distinct acts appropriately named. Apply the outcome-label mapping above to the existing generic approval response rail; adapt surrounding instructions on other rails only when their meaning is identical.

#### Eligibility and authority

Preserve the existing state machine and upstream partitioning:

- `draft` with review incomplete and a usable authority revision offers **Confirm review**, not approval.
- A review-confirmed draft can say **“Your review is confirmed. Your designer prepares the approval next. Nothing is waiting on you.”** It does not acquire approval controls until the actual state allows them.
- Active `pending`, review complete, no recorded outcome: show the allowed outcome choices.
- Recorded outcome: show the dated record and copy link; do not offer another response.
- `studio` and `household` viewer projections retain their read-only response behavior. Preserve current treatment of null/older projections.
- Withdrawn, superseded, expired, and stale revisions keep their current access/response restrictions and history links.

Preserve the distinction between approval state (`draft | pending | responded | expired`), outcome (`approved | changes_requested | needs_discussion`), and disposition (`active | withdrawn | superseded`). Do not create new statuses for the new labels.

Keep all existing authority and race protections:

- Review: `authorityRevision`, `artifactHash`, idempotency key, and **`reviewMethod: 'portal_clickthrough'`**.
- Response: `expectedUpdatedAt`, idempotency key, existing signature, and consent method. **`click_through` is the response consent token; it is not interchangeable with `portal_clickthrough`.**
- Exact artifact/version/hash matching before showing the corresponding figures or recording a response.
- Cost, schedule, and lead-time impacts as separate facts; do not add them into a fabricated overall impact.
- Frozen `whyAuthorName` stays the historical author; do not substitute the current designer.
- Existing event keys and semantics: considering/choosing is not the recorded outcome event.

#### Inputs, focus, and recovery

1. Keep the current hold interaction: **900 ms**; existing keyboard and assistive-click paths; cancellation on early release, pointer leave, scroll, blur, and cancellation; reduced motion affects the visual treatment, not the duration.
2. Put the selected action's consequence directly above the final action, including when unavailable. Keep hold instructions adjacent and associated with the control.
3. Wire `unmetReason` and `unmetFocusId` into `HoldAction`. Name helper: **“Type your full name before approving.”** Change helper: **“Tell your designer what you’d like changed before sending.”** Associate helpers with inputs and expose semantic required information as appropriate.
4. Preserve focusable `aria-disabled` behavior. Attempting an unavailable action explains the missing step and focuses its field; it performs no response mutation. Use neutral instructional copy before interaction, not a red error or “invalid” treatment on untouched fields.
5. When choosing an outcome reveals a name/note field, move focus there; otherwise focus the confirmation heading. **Choose another response** returns focus to the prior choice.
6. Preserve entered text on failure. A failed note post blocks the response. If the note succeeded but the response failed, retry must not post the note again.
7. Replace internal errors such as **“The frozen authority revision was not supplied.”** with a useful explanation: **“We couldn’t load the information needed to confirm this review. Refresh the review or contact your designer.”** Provide a read-only **Refresh review** control using the existing approval query/refetch path and a working designer-contact affordance. Missing authority can remove the confirm action, so “Try again” without a usable recovery control is insufficient. Keep the underlying failure classification for diagnosis; never retry with a guessed revision, discard a version conflict, or silently submit against a newer edition. Refresh does not submit anything; if it returns a changed edition, show the changed content and require another deliberate response. Preserve entered text as an unsent draft, clearly separated from any changed edition.
8. Use literal loading/unavailable-document copy such as **Loading document** and **“This document isn’t available. Contact your designer for help.”** Do not expose raw exception text, hashes, or internal implementation terms as recovery instructions.

**Acceptance:** each label submits the same existing payload as before; Confirm review and Ask a question cannot approve; missing inputs explain and focus; authority conflicts fail safely; note/response retries do not duplicate work; current hold tests still pass.

### CPUX-05 — Invitation and sign-in recovery that keeps context

1. Preserve studio, project, recipient, and personal-note context in the invitation shell. Use **Open your project** for a project invitation and **Open your page** when it is not tied to a project. Do not force an account setup tour.
2. Add the short explanation of the page's purpose to the invitation/arrival UI where space permits. This spec does not authorize changing outbound email infrastructure or sending invitations. Email-template changes are outside core unless an existing shared UI copy path requires a matching change.
3. Replace **This letter has already been opened** with **“This invitation has already been used. Sign in to continue.”** Preserve the server's token/capability distinctions and accepted-state behavior.
4. Replace **This letter’s gone stale** with **“This invitation link has expired.”** Replace **Send a fresh letter** with **Send a new invitation link**.
5. After the refresh API responds, use neutral acknowledgement: **“If a new invitation can be sent, you’ll receive an email.”** The API intentionally conceals token validity and upstream failure; `{ok:true}` is not proof of delivery. Do not change that privacy contract or display “Email sent” as a certainty.
6. A client transport failure may show **“We couldn’t request a new link. Try again or contact your designer.”** Offer Retry and reset the request-in-flight guard so a retry can actually run. The message must not reveal whether the token exists. Handle unexpected non-success HTTP responses without claiming delivery.
7. Offer safe sign-in recovery. Preserve Supabase Auth, cookie/session handling, the existing safe return-path sanitizer, and wrong-portal gates. No open redirects, new auth system, or new persistent onboarding records.
8. Verify that a signed-out named invoice, approval, proposal, or review link returns to the correct instrument after sign-in, including when another project has more recent activity. Preserve the existing behavior if it already works; do not refactor auth merely to satisfy this spec.

**Acceptance:** used and expired invitations explain the next step; refresh failures do not falsely claim delivery; retries work without revealing token validity; sign-in retains the intended project/instrument.

### CPUX-06 — A truthful progress summary and real designer help

Add a short **Project progress** summary above the existing detailed progress/order content. Keep room views, phases, pieces, tracking, documents, and history.

| Label | Source and rule | Unknown-state copy |
|---|---|---|
| **Now** | Existing resolved phase / `project.currentPhase`. Use its approved human-readable name. | On successful empty data: **“No project stage is shown here yet.”** |
| **Next** | `project.nextMilestone` when present; otherwise an existing actionable approval/request can identify what is waiting on the homeowner. Do not infer a dated next stage merely from phase ordering. | **“Your designer will share the next step here.”** |
| **Target date** / **Target completion** | The corresponding source milestone date or `project.projectedCompletionDate`, explicitly labeled as a target, not a confirmed promise. | Omit an absent target or say **Date not confirmed** in its relevant context. |
| **Current designer update** | The current visible standing note selected by the existing derivation, with that note's actual `sentAt` and frozen attribution. Do not relabel it the latest historical note. | On successful empty data: **“No current designer update is shown here.”** Keep access to past updates where available. |

Apply loading/error/success-empty distinctions to each progress source, including notes. A failed read uses a recovery message and usable Retry, not an empty-state assertion. A missing standing note does not mean no historical updates exist; answered/historical notes may still be available. Do not let a failed note read erase a working phase summary.

Do not present the current computed progress percentage as measured completion of the home. The existing phase mapper can default an in-progress phase to 50%; that fallback must not become a headline such as “Your project is 50% complete.” Do not relabel `ClientProjectView.lastUpdated` as the last activity across the entire project; it currently comes from the project row's `updated_at`. Do not use fetch time as update time.

An optional line **Waiting on you** may summarize existing accessible asks. Link directly to the relevant in-page ask. Say nothing is needed only after the relevant reads have succeeded. Do not generate a new task queue or infer dependencies not held in source data.

For help:

- Make **Contact {designer}** or **Contact your designer** easy to find from the page's existing introduction/landmarks. Link to existing correspondence or presented contact information, not a new help/inbox route.
- Project-level messaging reuses `useProjectCorrespondence`, `WriteBack`, `useWriteBack`, and `useSendMessage`. If there is no `threadId`, do not fabricate chat availability or create a thread on page load.
- Approval questions use the approval-specific Discussion so context stays attached to the ask.
- Use email/phone only when supplied by `usePresentationIdentity` / `PresentedBy`. Do not infer addresses or promise response times.
- Studio-only `StudioIdentity` currently has name/logo/website/source, not designer phone/email. A safe fallback is **“Contact your designer using the phone number or email you already use.”** A verified studio website can be offered separately. `DetailsSheet` contains the homeowner's own details; it is not a designer-contact source.
- Opening help or a composer sends nothing. Only the homeowner's explicit Send action sends a message, through the current flow.

**Acceptance:** a homeowner can identify the current stage, next known step, source of any date, and whether something is waiting on them. Missing dates, notes, threads, and contacts yield honest fallbacks with no dead action or fabricated information.

### CPUX-07 — Readability and accessible interaction across changed surfaces

Apply these requirements to the surfaces changed above, not as a repo-wide restyle:

- Use existing house-sheet classes/tokens. Body instructions should normally use `.t-body` (16 px). Money, dates, party names, and consequence sentences meet R140's 15 px floor. Do not bury a due date or signature consequence in 10–11 px uppercase metadata.
- Terminal controls keep R139's charcoal treatment, 16 px sentence-case action text, and amount where applicable. Do not copy the presentation's green buttons into the app. Keep lighter actions on the existing score hierarchy.
- Preserve at least 44 CSS px effective touch targets and visible resting affordances for actions. This is the product target, not a claim that WCAG AA requires 44 px everywhere.
- Status is conveyed in text, not color alone. Keep the established quiet refusal/late-payment style; no red error register or new urgency colors.
- Keep visible keyboard focus, logical focus order, named disclosure controls (`aria-expanded`, `aria-controls`), and associated instructions. Move/restore focus for opened/closed details and sheets.
- Loading, refresh failure, and mutation result messages use the appropriate current status/announcement pattern without repetitive live-region announcements.
- At 360 and 390 CSS px, no horizontal overflow or clipped amount/action text. At 200% zoom, core content and actions remain reachable without overlapping controls. Reflow is acceptable; hiding functionality is not.
- Retain reduced-motion support and current hold timing. Preserve native payment radio semantics and keyboard selection.
- Validate normal-text contrast to 4.5:1, large text and relevant non-text controls to 3:1 under the applicable WCAG rules. Do not claim conformance from a screenshot or font-size check alone.

References: [W3C clear words](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o3p01-clear-words/), [writing guidance](https://www.w3.org/WAI/tips/writing/), [target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum).

## 5. Copy inventory

Use this inventory as the source for exact replacements where the existing action has the described meaning. Do not change immutable historical records or printed legal language merely to rename a current control.

| Existing copy | Replacement / rule |
|---|---|
| Six letters are waiting for you | Derived, type-specific summary such as **You have six invoices to review.** Account for agreements separately; no fabricated total of unlike work. |
| Earlier invoices | Split into **Invoices to pay**, **Payments in progress**, **Payment needs review**, and **Payment history** as data supports. |
| A toll on the line | Actual **Due {date}** / **Past due · {date}** status. |
| Settle the balance | **Continue to secure payment · {total}** at the checkout continuation. |
| Close this letter | **Close payment details** when it closes that region. |
| What you owe | **Invoices** in the in-document navigation; retain the separately scoped money standing. |
| What needs you | **Approvals** in that navigation, preserving the correct instrument target. |
| Project status | **Progress** for the main progress destination. |
| Return (approval choice) | **Request changes**; domain value stays `changes_requested`. |
| Hold (approval choice) | **Pause to discuss**; domain value stays `needs_discussion`. |
| Submit response | The selected action's explicit label from CPUX-04. |
| This letter’s gone stale | **This invitation link has expired.** |
| A fresh letter is on its way | **If a new invitation can be sent, you’ll receive an email.** |
| The frozen authority revision was not supplied | Actionable recovery copy; preserve the actual authority failure. |

Keep the house metaphor in the visual composition and studio voice where useful. Literal wording is required at navigation, money, consent, and recovery points. Dates use the existing long-date convention, for example **2 November 2026**, not hard-coded locale snippets from the mockup.

## 6. Route and authorization contract

The following is a regression contract, not a request to rebuild routing:

| Incoming address | Preserve |
|---|---|
| `/` | Resolve a named accessible instrument before choosing the active project. |
| `/projects/[projectId]` | That authorized project's Threshold; no fallback exposing another project. |
| `/invoices/<id>` | `/?invoice=<id>#letterbox`; open the addressed visible invoice, including inside history. |
| `/decisions/<id>` | `/?decision=<id>#approval-<id>`; correct project and ask. |
| `/proposals/<id>` and its sign path | `/?proposal=<id>#door`; preserve existing proposal behavior. |
| Project review edition links | Preserve the named project and `review` parameter. |
| Invoice print / approval record / proposal record | Remain real print/record pages; do not redirect into a generic new page. |
| Public token/auth/system routes | Keep their existing access and resolution contracts. |
| Checkout return nonce | Keep the canonical resolution and dead/used handling described in CPUX-03. |

Keep middleware's auth-before-retired-route-folding order so `callbackUrl` retains the named path. `resolveHouseForInstrument` and `useNamedInvoice` must continue to enforce ownership, consume intent once, clean the query as currently designed, and bring the right record into view. Unknown/unowned/invisible IDs must not reveal another customer's record or bypass visibility. Preserve existing `#letterbox`, `#ledger`, `#mat-papers`, `#road`, `#note`, `#door`, and named approval anchors.

## 7. Implementation map

Paths prefixed with `apps/`, `packages/`, or other top-level directories are relative to the repo root. Unprefixed `src/...` paths are relative to `apps/client-portal`; adjacent bare filenames share the directory of their table entry. Verify symbols before editing. Renaming files is unnecessary unless it materially clarifies a changed responsibility.

| Area | Starting files / symbols |
|---|---|
| Page selection and composition | `apps/client-portal/src/app/page.tsx`; `src/app/projects/[projectId]/page.tsx`; `src/components/threshold/threshold.tsx` (`Threshold`); `letterbox-door.tsx` (`LetterboxDoor`). |
| Wayfinding | `src/components/threshold/landmark-ledger.tsx` (`LandmarkLedger`); preserve `Mat`, `OtherHouses`, existing identity and ask priority. |
| Shared invoice projection | `src/lib/threshold/invoice-rollup.ts`; `derive.ts`; `adopted-house.ts`; `dates.ts`; `invoiceBalanceCents` from `@patina/shared`. |
| Invoice presentation | `src/components/threshold/letterbox.tsx`; `earlier-invoices.tsx`; `settlement.tsx`; `letter-payee.ts`; `instruments/spine-toll.tsx`. |
| Payment method totals | `src/components/threshold/payment-method-chooser.tsx`; reference `src/app/pay/[token]/payment-method-chooser.tsx`; current fee/receipt helpers. |
| Invoice reads and fee availability | `packages/supabase/src/hooks/use-invoices.ts`: `useProjectInvoices`, `useClientInvoices`, `useInvoice`, `useInvoicePaymentOptions`, `useStartCheckout`. Preserve keys `['invoices','project',projectId]`, `['invoices','client']`, `['invoices',id]`, `['invoice-payment-options',invoiceId]`. |
| Approval rail | `src/components/threshold/approval-ask.tsx`; `instruments/signature-line.tsx`; `instruments/scored-action.tsx` (`HoldAction`); `packages/supabase/src/hooks/use-project-approvals.ts`. |
| Related review instruments | `review-ask.tsx`, `scope-change-ask.tsx`, `door-acts.tsx`, `door-gate.tsx`, `budget-checkpoint-review.tsx`, `instrument-reading.tsx`. Preserve their distinct semantics. |
| Invite and recovery | `src/components/letter/letter-shell.tsx`, `OpenLetterForm.tsx`, `StaleLetterForm.tsx`; `src/app/auth/invite/[token]/page.tsx`; existing refresh route privacy contract. |
| Progress and help | `src/components/threshold/the-road.tsx`, `story-pole.tsx`, `the-note.tsx`, `correspondence.tsx`; `src/hooks/use-project-correspondence.ts`; `src/components/presented-by.tsx`; `src/types/project.ts`; `src/lib/data/projects.ts`. |
| Routing regression | `src/middleware.ts`; `src/lib/retired-routes.ts`, `auth-redirect.ts`, `client-auth-destination.ts`, `data/active-project.ts`; existing named-invoice hook and nonce return route. |

Use `@patina/supabase` hooks for data and existing route/RPC boundaries for mutations. Do not use service-role credentials in the browser or add ad hoc calls to a NestJS service. Supabase Auth remains the only auth system. Do not revive the dormant orders-service Stripe module.

## 8. Explicit non-goals

- New backend services, migrations, RLS changes, new approval/payment statuses, fee policies, refund behavior, or payment-provider integration.
- A new project dashboard, inbox, task queue, top/bottom navigation shell, route tree, or replacement room/house visualization.
- Household co-approver accounts, passwordless capability changes, partner invitations, or auth redesign.
- Sending invitation/notification emails, automatic messages, notifications, or production data repair.
- Global design-system changes, global HoldAction replacement, broad typography restyling, or cross-portal UI changes.
- New analytics event taxonomy or new PII capture. Preserve existing event keys and avoid duplicating events through new wrappers.
- Invented delivery estimates, progress percentages, payment certainty, invoice descriptions, designer contacts, or receipt artifacts.
- Production deploy. The implementing agent delivers verified changes and a pushed branch unless a separate instruction authorizes shipping.

## 9. Suggested implementation sequence

| Slice | Deliverable | Dependencies / review focus |
|---|---|---|
| A | Shared invoice grouping, read parity, and pure tests | First. Verify money/visibility/adopted ownership before building UI on it. |
| B | Expanded outstanding invoice presentation and payment copy/totals | Uses A. Preserve checkout guards, named invoice opening, payee, focus, and unknown-result handling. |
| C | Arrival/navigation and honest empty/error states | Use A's counts/completeness; keep R141 anchors and origin agreements. |
| D | Approval labels, consequence/instruction wiring, focus and recovery | Preserve exact payloads and current hold behavior; test review vs outcome vs question separately. |
| E | Invitation recovery, progress summary, and contact affordance | Reuse existing auth, project, and correspondence data; no invented fields. |
| F | Accessibility, integrated regression walk, independent review, handoff | Resolve cross-slice consistency and run the gates below. |

These are delivery slices, not a second operational task queue. If parallelizing, follow `patina-parallel-work`; give each writer an isolated worktree and explicit paths, and assign a single owner to shared invoice composition files, local DB state, and dev-server ports.

## 10. Acceptance matrix and fixtures

Use synthetic local fixtures and current test helpers. Never reuse real customer IDs or financial data from the screenshots in automated tests.

| ID | Scenario | Required observable result |
|---|---|---|
| A01 | Six positive-balance invoices: past due, due today, future, partially paid, and undated; plus paid history | All six outstanding rows visible without history expansion; correct stable order, balances, and counts. |
| A02 | Draft, void, and sent-with-zero-balance rows | Draft/void invisible; zero-balance row does not inflate payable count and remains findable without a fabricated Paid assertion. |
| A03 | Duplicate IDs in merged inputs; multiple projects with studio invoices | Each invoice appears and contributes once; studio invoices only appear in the adopted project, regardless of active-project recency. |
| A04 | USD and another currency in the same visible scope | Correct per-row currency and separate totals; no conversion or mixed dollar total. |
| A05 | Pending payment with PI; pending without PI; requires_refund; overlapping paid/zero/pending/review evidence | A mere checkout claim is not processing; review/contradictory holds outrank processing, which outranks payable/history. Exactly one row/group/count contribution per ID; no payment CTA for a hold. |
| A06 | Initial load, empty success, failed query, one-half merge failure, stale-cache refresh failure | No false all-clear or misleading aggregate. Available content stays; Retry is usable; unrelated agreements/project sections remain. |
| A07 | Deep link to unpaid, paid-history, unauthorized, and invisible invoices | Correct allowed row opens/focuses; history expands when needed; unauthorized/draft/void records never leak. |
| A08 | Select each method; fee RPC failure/malformed or missing fee; double activation; cancel/unknown return; close/switch/reopen after returned hold | Verified full amount and fee only; unresolved fee blocks its method's continuation with recovery. One checkout request; no optimistic Paid state or unsafe retry. Opening details makes no payment request. Server holds and unknown results survive disclosure lifecycle until authoritative resolution. |
| A09 | Check-intent success/failure and actual settled payment | Check expected only after acknowledgement and balance remains due; paid/receipt only from actual evidence. |
| A10 | Each approval choice | Labels map to unchanged outcome, consent, signature, authority fields and idempotency keys. Selecting alone does not submit. |
| A11 | Missing/whitespace name or change note; choose another response | No mutation; neutral reason is exposed and field focused; focus restores appropriately. |
| A12 | Note post fails; response fails after note succeeds; authority changes mid-flow; missing revision and refresh success/failure | No response after failed note; no duplicate note on retry; stale revision rejected; draft input retained; usable read-only Refresh review. A changed edition is displayed and requires a new deliberate response; refresh never submits. |
| A13 | Review-only draft, confirmed draft, pending, responded, expired/withdrawn/superseded; studio/household viewer | Correct eligibility and record display; Confirm review never approves; read-only viewers cannot respond. |
| A14 | Hold pointer/keyboard/assistive activation, early release/scroll/blur, reduced motion | Existing 900 ms contract and cancellation/alternate activation behavior preserved. |
| A15 | Expired/used invitation, generic refresh response, transport/non-success failure, retry | Useful copy without token-validity disclosure or promised delivery; retry guard resets. |
| A16 | Signed-out named instrument belonging to a non-active project | Safe sign-in returns to that instrument/project, preserving query/anchor intent and no open redirect. |
| A17 | Current phase, next milestone/target, dated standing note; unknown stage/date/note; failed note read; historical notes without a standing note | Summary reflects actual source. Loading/error/empty are distinct; past updates remain accessible. No guessed dates, false “no updates ever” assertion, 50% fallback headline, or fetch-time “updated” claim. |
| A18 | Existing thread, absent thread, known contact, studio-only no contact | Existing messaging/contact works; missing capability gets truthful fallback; opening help sends nothing. |
| A19 | 360/390 px, tablet/desktop, 200% zoom, keyboard and screen reader | No lost actions or overflow; focus, names, states, announcements, readable critical copy, and effective touch targets verified. |
| A20 | New links plus legacy anchors/print/records/nonce paths | No broken page-local destination, retired route reintroduced, origin agreement lost, or checkout path replaced. |

For repeatable invoice arithmetic, a local fixture may use balances `60000 + 10000 + 30000 + 25000 + 5000 + 7500 = 137500` cents in one currency, with the `30000` balance represented by a partially paid invoice. Add paid/void/draft/zero-balance rows that contribute nothing to that outstanding total. Freeze the date and vary only the evidence under test. Pending/held cases keep their outstanding balance but leave the actionable-payable count.

## 11. Verification commands and execution conditions

The following commands describe required implementation gates. They were inspected for this spec, not run as proof that an implementation exists.

### Environment

- Use the repository's pinned pnpm `9.0.0` and supported Node version.
- Check the Supabase URL before any test fixture mutation. Local tests must point to local Supabase, not Strata production. Do not print secrets.
- Use selective dev scripts. Never run root `pnpm dev`. The client Playwright config's `pnpm dev` command runs inside the client workspace; that is not permission to fan out the entire monorepo.
- `apps/client-portal/playwright.config.ts` uses `tests/`, the `chromium` project, port 3002, local env values, and `reuseExistingServer: true`. An existing server may have different env values; verify it before reusing. Do not kill an unrelated session's server.
- Do not run a build against the same app's live dev `.next` directory. Use type-check while dev is running, and stop only the server you own before any required build.

### App checks

From repo root:

```bash
pnpm --filter @patina/client-portal type-check
pnpm --filter @patina/client-portal lint
```

**Current configuration correction:** this checkout has `eslint.config.mjs` and `lint: eslint .`; older skills describe `next lint` with no flat config. Use the current files. A client build is not a substitute for type-check.

Run affected Jest suites first, for example:

```bash
pnpm --filter @patina/client-portal exec jest --runInBand --runTestsByPath \
  src/lib/threshold/__tests__/invoice-rollup.test.ts \
  src/lib/threshold/__tests__/derive.test.ts \
  src/components/threshold/__tests__/letterbox.test.tsx \
  src/components/threshold/__tests__/earlier-invoices.test.tsx \
  src/components/threshold/__tests__/payment-method-chooser.test.tsx \
  src/components/threshold/__tests__/settlement.test.tsx
```

Add the new projection's test path if a new file is introduced. Add a focused `src/components/threshold/__tests__/letterbox-door.test.tsx` suite for the studio-only composition (it is not present at the baseline), or clearly identify equivalent integrated coverage, and run it. Also run the relevant approval, hold, landmark, Threshold, correspondence, invitation, auth, routing, pay-link, and checkout-return unit suites. Do not treat a regex that collects no tests as a passing gate. New client source behavior ships with tests that exercise user-visible outcomes and invariants, not snapshots that merely mirror implementation.

At integration, run the client suite with its existing coverage gate:

```bash
pnpm --filter @patina/client-portal test:coverage --runInBand
```

The current Jest thresholds are lines 70, branches 60, functions 70, statements 70. Do not lower them. Establish/report pre-existing failures separately; do not silently relabel a failing gate as passed or broaden this task into unrelated repairs.

Create or extend focused browser coverage. The proposed new integration file is `apps/client-portal/tests/homeowner-usability.spec.ts`. Run it with the existing relevant regression specs:

```bash
pnpm --filter @patina/client-portal exec playwright test \
  tests/homeowner-usability.spec.ts \
  tests/threshold.spec.ts \
  tests/pay-link.spec.ts \
  tests/origin-door.spec.ts \
  --project=chromium
```

Use web-first assertions, not fixed sleeps. Use isolated browser contexts for different actors. Use an established local fixture path and authoritative reads for mutation results; DOM success copy alone is not financial or approval evidence. Include manual narrow-screen, keyboard, screen-reader, and zoom checks for the changed interactions and capture screenshots.

### Shared-package checks

The client-invoice read-parity and fee-availability changes touch `packages/supabase`; this is not app-only work. Run its narrow affected tests and type gate:

```bash
pnpm --filter @patina/supabase exec vitest run src/hooks/__tests__/use-invoices.test.ts
pnpm --filter @patina/supabase type-check
```

Follow the current `patina-verification` shared-package matrix: inspect package entry points, build edited dist-resolved packages, type-check consuming portals/services as applicable, and run the strict admin-portal build. Record actual consumers and exact commands; do not infer safety from a green client build. Do not rebuild unrelated workspaces repeatedly after a passing gate without a new reason.

Obtain independent review in a separate context under the repository's current provider/routing instructions, with particular attention to invoice evidence, approval authority, routing, and incomplete-data states. Address findings before declaring core complete.

## 12. Definition of done and handoff evidence

Core is complete only when:

- CPUX-01–07 are implemented or specifically demonstrated already satisfied, with all relevant A01–A20 scenarios accounted for.
- Required checks actually ran and passed, or the handoff explicitly identifies a remaining blocker. Do not call unfinished behavior complete.
- No real payment, signature, message, or production mutation was used as a test.
- No new route tree, schema, financial policy, approval status, global confirmation change, or design-system restyle was introduced.
- Review findings are resolved; code is committed with explicit pathspecs and pushed. Task worktrees are retired according to the repo policy.

The implementing agent's final handoff must include:

1. Branch and commit IDs, plus a concise change summary and changed-file list.
2. Requirement/acceptance IDs covered and any remaining gaps.
3. Exact commands and pass/fail results; identify pre-existing failures and what was not exercised.
4. Desktop/mobile screenshots of arrival, multiple unpaid invoices, a processing/hold state, approval instructions, progress, and an error/empty state using synthetic data.
5. Confirmation that named deep links, adopted-project invoice ownership, currency separation, payment evidence, approval payloads, and nonce checkout returns were preserved.
6. Any shared-package rebuilds and consumer checks, and any data/query shape changes.
7. Whether anything was deployed. Default for this assignment: **not deployed**.

## 13. Deferred experiment — familiar click-to-confirm

This is **not part of required core** and must not delay its completion.

The presentation proposed comparing the current hold gesture against a two-step **Review → Confirm** interaction. Existing product rulings deliberately adopted hold, and the review did not test real homeowners. Do not globally replace `HoldAction` or enable a production experiment as part of the clarity fixes.

A separately commissioned prototype may compare the two interactions using identical item/version information, consequences, signatures, consent methods, authority checks, idempotency, and receipts. It must use synthetic data and submit no binding decisions. Measure task completion without coaching, comprehension of the consequence, accidental activation, hesitation, and help requests with homeowners who have low digital confidence. Record a product decision before implementing the replacement in production.

## 14. Source references and interpretation notes

All references below were checked against the source baseline. Prefer symbol names to stale line numbers when the branch moves.

- `earlier-invoices.tsx`: the current “earlier” list excludes only the featured invoice, not other unpaid invoices.
- `letterbox-door.tsx`: studio-only invoice filtering and agreements; `threshold.tsx`: adopted-project merging and `refetchInvoices` of both required query sources.
- `invoice-rollup.ts`, `adopted-house.ts`, `dates.ts`: visibility, ownership, and date helpers to retain.
- `use-invoices.ts`: project/client query-shape difference and canonical keys; `useInvoice` includes payment details; `useInvoicePaymentOptions` currently conceals fallback fee data as success.
- `approval-ask.tsx`: choice definitions, eligibility, review/response path, note-first behavior, final HoldAction call.
- `use-project-approvals.ts`: review and response RPC contracts; `signature-line.tsx`: current signature-completeness rule.
- `scored-action.tsx` and `instruments/__tests__/hold-action.test.tsx`: current 900 ms behavior and assistive/cancellation paths.
- `StaleLetterForm.tsx`: generic refresh acknowledgement and stuck in-flight risk; invite refresh API: intentionally generic response.
- `retired-routes.ts`, `middleware.ts`, `data/active-project.ts`: intent, ownership, auth ordering, and retained record/print paths.
- `types/project.ts`, `lib/data/projects.ts`: phase/milestone data and percentage/date limitations.
- `correspondence.tsx`, `use-project-correspondence.ts`, `presented-by.tsx`: actual message and contact capabilities.

If the checkout changes a load-bearing contract, re-establish the current invariant before editing. Preserve financial/access/consent safeguards and adapt the presentation layer; do not guess new business behavior to make the mockup look complete.
