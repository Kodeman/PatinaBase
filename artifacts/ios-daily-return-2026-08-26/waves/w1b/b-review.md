# W1b · lane B — adversarial review (money & studio)

Reviewer: separate context, read-only. Branch `daily-return/w1b-b` @ `feef08d87`, 8 commits off
`main`, 31 files, +1587/−202. No build, no commit, no push performed by this review.

**Verdict: land after the blocking items are answered.** Six of the six planks are attempted and
four land cleanly (SP-04's list/detail/sheet halves, SP-05, SP-16, SP-17's main path). Three planks
are **partial** in ways the report does not say: SP-15 is not carried onto the invoice **list**,
SP-04's third repair (the confirmation email) does not meet the plank's stated backend delta and no
integration note raises it, and SP-19's money half is a padding bump the plank explicitly rejects,
unverified at the Dynamic Type the plank names. Two honesty items survive: the unconditional
bank-transfer sentence lives on in the checkout failure copy (and is now pinned by a test), and the
budget rename did not reach the Companion, which still calls the same route "Your budget".

Scope hygiene is clean: **no edits outside lane B's owned files** (steward.md §6.2), pathspec
commits, Conventional Commits, message matches `git show --stat` on all eight, branch not pushed,
`.writer.lock.d` released, working tree clean. Lane B is not the backend lane — no migrations, no
grants, no numbering to check.

---

## Blocking / major

### B-1 · SP-15 is not carried onto the invoice list — the two surfaces still disagree
**Severity: major · Confidence: high**
`apps/mobile/Patina/Patina/Features/Invoices/Views/InvoiceListView.swift:189-193`

```swift
private var dueLine: String? {
    guard invoice.status == "sent" || invoice.status == "partially_paid",
          let due = invoice.due_date else { return nil }
    return "Due \(DateDisplay.fromDateString(due))"
}
```

Every other money surface now reads `DateDisplay.due` — the decision list, the decision detail, the
invoice detail, `StudioQueueBuilder.dueLabel` — and the lane's own test is named *"the due line
reads the same on every money surface"*. The invoice list is the one that is not. Consequence: an
overdue invoice reads **"Due Aug 22, 2026"** in muted grey on the list and **"Overdue · Aug 22"** in
red one tap later. SP-15's `Where` block names this exact file and line range
(`InvoiceListView.swift:189-192`), so it is inside the plank, not adjacent to it. It is also inside
lane B's owned files, so there is nothing to escalate — it is a one-line change.

### B-2 · SP-04's confirmation-email half does not meet the plank's backend delta, and nothing raises it
**Severity: major · Confidence: high**
`supabase/functions/proposal-sign-confirmation/index.ts:62-79` (lane D's file — an integration note,
not an edit)

SP-04's backend delta is specific: *"The confirmation email is one edge-function send through
`_shared/send-email.ts` (§12 §6 — the chokepoint exists; `notification_log` is written by it)."*
Verified: `proposal-sign-confirmation` does **not** use the chokepoint — it POSTs
`https://api.resend.com/emails` directly and writes **no `notification_log` row**
(`supabase/functions/_shared/send-email.ts:394,409,426` is where those rows are written). So after a
signature there is no durable record that the client was written to, which is the half of the plank
that mattered for SP-08's bell and for any later audit.

Lane B closed the item as *"needed NO code change … pinned by test instead of rebuilt"* (b-notes §5)
and lane D closed it as *"the signature-confirmation email is ALREADY wired. No backend change."*
(d-notes §1). Both checked **whether it fires**; neither checked **how it sends**. B raised one note
on this file (the 100× total, B-3 below) and should have raised this one beside it.

### B-3 · The ACH lie SP-15 exists to kill survives in the checkout failure copy — and is now pinned by a test
**Severity: major · Confidence: medium-high**
`apps/mobile/Patina/Patina/Features/Money/MoneyFailureCopy.swift:63-68`,
`apps/mobile/Patina/PatinaTests/InvoicesMoneyRailTests.swift` (`mappedCheckoutCodesKeepTheirOwnCopy`)

```swift
case .paymentProcessing:
    return MoneyFailure(
        "A payment on this invoice is already going through. Bank transfers take 3–5 business days to clear.",
        ...
```

and the test asserts `MoneyFailureCopy.checkout(.paymentProcessing).sentence.contains("3–5 business days")`.

`payment_processing` is returned whenever a **completed** Checkout session still points at a pending
`invoice_payments` row (`supabase/functions/create-checkout-session/index.ts:1118-1126`,
`:259-268`) — the sibling payables' own comments name the two causes as *"card just cleared and the
webhook hasn't landed, **or** an ACH debit settling"* (`:433-439`, `:562-568`). A card payer who taps
Pay twice inside the webhook gap is therefore told a bank transfer is clearing.

This is the same guess lane B correctly refused four files away: `InvoiceSettleCopy` prints the
3–5-day sentence **only** for `ach_manual`/`wire` precisely because *"a Stripe card and a Stripe ACH
are BOTH `stripe`, so the method behind a Stripe row is not knowable … and the app must not guess."*
Two copies of the same fact, one branched and one not, and the unbranched one now has a test holding
it in place. Either drop the second sentence, or route it through `InvoiceSettleCopy.isBankTransfer`
the way the banner does.

### B-4 · SP-16's rename did not reach the Companion, and no integration note asks for it
**Severity: major · Confidence: high**
`Patina/Features/Companion/Services/CompanionActionRows.swift:66-68` (lane A per steward §6.5),
`Patina/Features/Companion/Services/CompanionAreaBuilders.swift:242,255,261,323,329,336,349` (lane A),
`Patina/Features/Companion/Models/CompanionContext.swift:220` (lane C)

The route `.budget` is now labelled three different ways for the same client:

| Surface | Label |
|---|---|
| Budget screen H3 (B, changed) | **Billed to date** |
| Studio row (B, kept) | **Budget** / "What's been billed, and what's been paid" |
| Companion rows (A's files, untouched) | **"Your budget"** / "See your budget", subtitle **"Your spend"** |
| Companion context label (C's file, untouched) | **"Your budget"** |

F56 — the finding SP-16 answers — *is* surfaces disagreeing about the same thing. Renaming the
screen while leaving four call sites promising "Your budget" reproduces the class of defect one layer
out: the Companion offers "Your budget", and the screen that opens says something else. This is
exactly the shape §6.6 exists for, and `b-notes.md` carries no such note. Needed: one note to A
(`CompanionActionRows`/`CompanionAreaBuilders` labels) and one to C (`CompanionContext:220`).

### B-5 · SP-19's money half is the fix the plank rules out, and the plank's own verification was not run
**Severity: major · Confidence: high (on the verification gap), medium (on whether the clearance holds)**
`Patina/Features/Money/MoneyScreenChrome.swift:31-34`, the eight money screens

SP-19 says it in as many words: *"More padding is **not** the fix: the proposal detail already pads
140 points at `ProposalDetailView.swift:32` and still collides."* What shipped is
`bottomClearance = CompanionHearthMetrics.reservedHeight + 24` = **144** — four points more than the
140 the plank names as insufficient — plus a top band. The plank's actual choice ("pin the primary
act in a bottom bar above the Hearth" **or** "let the orb yield on screens that own a primary act")
is still unruled (critique §(h)6 flagged this before the wave opened), and the mechanical cause — the
opaque `PatinaColors.Background.primary` band inside `companionHearthReservation` — is correctly
deferred to C (b-notes §2). Two consequences:

1. **The money half cannot be proven until C lands.** Shot `w1b-b-04` measures `proposalDetail.sign`
   at y 644–696 with the Hearth at 720 on one proposal at default type. That is one screen, one
   content length, one type size — not the class.
2. **The plank's stated verification was skipped.** *"Verify at Dynamic Type XXL on the four money
   screens."* No XXL shot exists in `research/01-shot-ledger.md` §w1b-b, and the report makes no XXL
   claim. This is a named acceptance step of the plank, not an extra.

Sub-item, same plank: `moneyScreenTopBand()` is a **zero-height** `safeAreaInset` whose background
`ignoresSafeArea(edges: .top)` — it *paints over* the status-bar strip rather than *reserving* it
(SP-19: "Reserve the top safe-area inset on every scroll container and sheet header"). It works for
legibility, and it is the honest cheap fix, but it is the same "opaque band inserted as a
safeAreaInset" pattern that b-notes §2 condemns in C's file as *"a painted bar"* contradicting C8.
Worth Fable naming which of the two is the house pattern before C acts on the note. Also: no sheet
header got the band (`ProposalSignSheet`, `DecisionDeferSheet`, `DecisionConsentSheet`) — low impact
at `.medium`/`.large` detents, but the plank says "and sheet header".

### B-6 · SP-17's deferral is a dead end on a project-less decision, and its failure sentence is wrong
**Severity: major · Confidence: high (code path), medium (how often the data allows it)**
`Patina/Features/Decisions/ViewModels/DecisionsViewModel.swift` (`sendDeferral`),
`Patina/Features/Decisions/Views/DecisionDetailView.swift` (`deferralActs`)

`client_decisions.project_id` is nullable by schema — `project_id UUID REFERENCES projects(id) ON
DELETE SET NULL` (`00062_client_management_v2.sql:71`) — and `RemoteClientDecision` documents it as
*"nil when the decision isn't linked to a project (or the embed was filtered by RLS)"*
(`DecisionsAPIClient.swift:58-60`). On such a decision:

- `deferralActs` still draws both buttons (it gates only on `!isResolved`);
- the sheet opens, prefills, and accepts a note;
- `sendDeferral` hits `guard let projectId = decision?.project_id` and fails **every time**;
- the sentence it fails with is `MoneyFailureCopy.decision(...)` = *"We couldn't send your choice.
  Your designer hasn't seen it yet."* — and a deferral is explicitly **not** a choice; SP-17's whole
  point is that it is a message.

W1a merged `MessagingAPIClient.createDirectThread(counterpart:)` over `rpc_start_direct_thread` for
precisely the no-project case. Either use it, or hide the two acts when there is no project. The
lane's own test (`deferralWithoutAProjectFailsHonestly`) pins the current behaviour as correct, so
this ships as intended unless it is changed.

---

## Minor

### m-1 · `MoneyFailureCopy.decision(_:)` ignores its argument
**Minor · high.** `MoneyFailureCopy.swift:96-98` takes `_ error: Error` and returns one constant
sentence for everything — a Postgrest failure, a network drop, and the app's own synthesised
"no project" `NSError` all read identically. Harmless for honesty, but it means a real
decision-submit failure and an internal precondition failure are indistinguishable to the client and
to the log reader.

### m-2 · The decision failure banner drops SP-15's two acts
**Minor · high.** `DecisionDetailView.submitFailureBanner` renders the sentence and, *only if a
thread already exists*, "Message your designer". There is no retry act (`MoneyFailure.retryLabel` is
unread there), and unlike the invoice path it never creates a thread. SP-15's ask is "two acts";
the invoice path has both, the decision path has zero-or-one.

### m-3 · "Accepted on <date>" is a branch the server can never reach, and its test is synthetic
**Minor · high.** `ProposalStatusDisplay.detailStatusLine` falls back to
`"Accepted on \(DateDisplay.fromTimestamp(accepted_at))"`, but neither client RPC emits
`accepted_at`: `list_client_proposals` (`00422:2304-2327`) and `get_client_proposal_bundle`
(`00407:341-372`) both omit it. `RemoteProposal.accepted_at` is therefore always nil in the app, the
branch is dead, and `ProposalsMoneyRailTests` asserts `== "Accepted on Jul 4, 2026"` on a hand-made
fixture the server cannot send. In the app the line reads plain **"Accepted"** — under a sage
`checkmark.seal.fill`, which still reads as *done*. Consider whether the seal belongs on an unsigned
proposal at all; that is the residue of the F02 defect.

### m-4 · Two expiry vocabularies, two formats, one date
**Minor · high.** The sign sheet prints `"Expires Sep 8, 2026"` (via `DateDisplay.fromTimestamp`),
the proposal detail one layer behind it prints `"Expires Sep 8"` (via `DateDisplay.expiry`), and the
Studio hub prints `"Review by Sep 8"` (`StudioQueueBuilder.swift:148`, deliberately kept). The sheet
also cannot say "Expired" — it has no past-due branch — where the list now can.

### m-5 · The deposit line prints the milestone's own label inside a row labelled "Deposit"
**Minor · medium.** `ProposalSignTerms.depositLine` takes the first milestone by `sort_order ?? 0`
and renders `"<its label> — $X"` into a row whose label is the constant `"Deposit"`. A first
milestone named "Retainer" prints `Deposit | Retainer — $25,000.00`; a mis-ordered schedule prints
whatever sorts first. The nil-coalescing sort is also non-deterministic when several milestones share
or omit `sort_order`. The guard against a percentage-only milestone is right and well tested.

### m-6 · The plan's lane row asks for a line count the sheet does not restate
**Minor · high.** The W1b table says *"the sign sheet restates total, line count, terms, date"*; the
plank body says *"project name, total, the deposit line, and the expiry date"*. The implementation
follows the body (plus terms) and omits the line count. Worth one line from Fable saying which text
governs, since the sheet is legal copy Kody signs off.

### m-7 · `MoneyFailureCopy.load(_ surface:)` was specified and never built
**Minor · high.** The lane's own task-list interface declares it; the load-error strings stayed
ad hoc (`"Couldn't load invoices"`, `"Couldn't load your budget"` — which now names a screen called
"Billed to date"). All are app-authored, so no honesty problem; it is an unclosed item in B's own
plan, not the plank's.

### m-8 · Half the SP-15/SP-19 assertions are source greps, not behaviour
**Minor · high.** `moneyScreensShareOneChromeSource`, `payFailureIsAboveThePayButton`,
`moneyDetailsCarryTheirDates`, `projectDetailHasNoPortalInstruction`,
`budgetScreenIsNamedBilledToDate` and `signPathInvokesTheConfirmationFunction` all assert that a
string exists in a `.swift` file, or that one substring precedes another. They hold the *shape of the
source*, not the rendered result — a refactor that keeps the identifiers and breaks the layout stays
green, and `moneyScreenTopBand()` being present says nothing about whether the status bar is covered.
The idiom is pre-existing in this suite and reasonable given no UI-test harness for these screens;
the point is that the "+32 tests, 0 failures" figure should not be read as behavioural coverage of
SP-15 and SP-19. The genuinely behavioural additions are the `DateDisplay`, `MoneyFailureCopy`,
`InvoiceSettleCopy`, `ProposalSignTerms`, `ProposalStatusDisplay`, `BudgetMath` and
`DecisionDetailViewModel` tests — those are real and would fail without the change (the two
`CheckoutError`/`ProposalSignError` cases were rewritten from assertions that encoded the defect,
which is correct).

### m-9 · New unclaimed directory `Features/Money/`
**Minor · informational.** Correctly flagged by the lane. `Patina/` is a
`PBXFileSystemSynchronizedRootGroup`, so nothing touched the pbxproj and lane C remains its sole
writer — verified. The steward should fold `Features/Money/**` into §6.2 at integration so W2+ has an
owner on record.

### m-10 · Report wording: "above the fold"
**Minor · high.** The failure banner is above the Pay **button** (which is what the plank asks and
what shipped). The whole pay footer sits at the bottom of a `ScrollView`, so on a long invoice the
failure is not necessarily on the first screen. The plank's ask is met; the report's phrase overstates
it slightly.

### m-11 · Evidence gap the ledger names honestly
**Minor · informational.** The sign sheet was sim-verified with only TOTAL and EXPIRY drawing — the
seeded proposal returns null project, milestones and terms, so the Project / Deposit / Terms rows are
unit-verified only. `w1b-b-05` and the ledger say so. Likewise the whole invoice rail is
unit-verified only (empty `invoices` table after D's reset), raised precisely and actionably as
b-notes §4 with a seed instruction. Both are correctly reported, not concealed — noted here so the
steward carries them into the walk.

---

## Checked and clean

- **Owned files.** Every changed path is in steward.md §6.2 (`Features/{Proposals,Invoices,Budget,
  Decisions,Projects}/**`, `Features/Profile/ViewModels/StudioQueueBuilder.swift`,
  `Features/Shared/DateDisplay.swift`, `Services/API/{Proposals,Invoices}APIClient.swift`) or under
  the new unclaimed `Features/Money/`. Tests touch only B's six named suites plus the new
  `MoneyAndStudioCopyTests`. **No out-of-lane edit.**
- **Suites B owns.** `StudioHubTests` and `AttentionCountTests` are untouched, and the two strings
  they could have caught are safe: `records.budget`'s **id** and **title** are unchanged (only the
  subtitle moved), and `dueLabel` delegates to `DateDisplay.due` with byte-identical output
  ("Overdue · Aug 22" / "Due today" / "Due Sep 1"). Nothing in `PatinaTests/` or `PatinaUITests/`
  still expects `"Your budget"`, `section("Signed"`, `payError`, `.achPending` or
  `"Details unavailable"`.
- **Vendor text, at the type level.** `CheckoutError.generic(String)` → `.unavailable` and
  `ProposalSignError.generic(String)` → `.unexpected` genuinely make the Stripe leak unrepresentable;
  `errorDescription` on both now routes through `MoneyFailureCopy`, so a stray `LocalizedError` read
  anywhere else in the app still cannot print a server string. `detail` survives only in `#if DEBUG`
  logs. The recursion the implementer hit and fixed (errorDescription → localizedDescription →
  errorDescription) is real and its fix — a pure mapper, callers log the raw error — is the right
  one, and it is pinned. Every remaining `self.error =` in the five money view models is
  app-authored.
- **SP-05.** `client_visibility_tier` is gone from `overviewFacts`; the portal instruction is gone
  and no longer greppable in the file; the three replacement lines are client-voiced and portal-free.
  Sim-verified against `projects.client_visibility_tier = 'milestone'` on live local data. The plank's
  literal example strings ("Your designer is still putting this together." / "No invoices yet." /
  "No documents yet.") were written against a different section set; the shipped phrasing covers the
  screen's real missing sections (phases / payments / FF&E) in the same voice. Acceptable deviation —
  flagged only for the record.
- **SP-04 list/detail/sheet.** `hasSignatureRecord` reads `signed_at`/`signed_by_name`, and both
  client RPCs do emit them (`00422:2320-2321`, `00407:359-360`), so the gate works in both
  directions — a genuinely signed proposal still reads "Signed". Sim-verified: ACCEPTED (1) over the
  $100,000 proposal whose signature columns are null in Postgres. The sheet composes from bundle
  fields only, the instruction line is kept verbatim below the terms, and the
  `client_visibility_tier` line-price policy is correctly left alone as an open ruling for Kody.
- **SP-16.** `designerBudgetCents` is carried separately and labelled "your designer's figure", never
  folded into the rollup; the Studio row keeps its id; the rename is honest about what the screen
  computes. (Subject to B-4.)
- **SP-17 main path.** Server-side evidence is real and exactly the right evidence: the note landed
  in `comms_messages` while `client_decisions` stayed `status='pending'` with `responded_at` NULL —
  which is the plank's entire contract given the CHECK at `00062:80-81`. The blank-option collapse
  and the client-voiced fallback are correct and the swatch is properly left as a content contract.
- **Cross-lane notes.** b-notes §1 (the 100× total in `proposal-sign-confirmation`) is verified
  correct end to end: `proposals.total_amount` is `INTEGER -- cents` (`00014:138`), the function
  formats it undivided (`index.ts:44-50, 131-132`), so the seeded $100,000.00 proposal emails
  "$10,000,000". The diff supplied is right. §2/§3 (Hearth band, chevron scrim) are correctly scoped
  to C's files with the mechanism left as C's ruling. §4 (no invoice seed) is precise and actionable.
  The two missing notes are B-2 and B-4 above.
- **Git.** 8 commits, Conventional, each `git show --stat` matches its subject, no `git add -A`
  footprint, no `Secrets.swift`, branch local only, tree clean, lock released. Trivial: the planned
  ninth commit (`test(ios): SP-04 — pin the sign path's confirmation-email call`) was folded into
  `960f29c96`, so that `feat:` commit carries one test about a different half of the plank.
- **Not applicable.** Lane B mints no migrations, edge functions, grants or seeds — those checks are
  lane D's row. No device claim is made anywhere in the report, the ledger, or this review.
