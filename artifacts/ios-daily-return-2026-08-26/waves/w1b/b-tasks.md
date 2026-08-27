# W1b · Lane B — money & studio — task list

Implementer: Opus, worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w1b-b`
(branch `daily-return/w1b-b`, base `main` @ `5b5c0c054`), simulator `dr-w1b-b`
`8A414D4A-8CD2-4867-ADBE-4F00FAEB5E06`.

Planks: **SP-04, SP-05, SP-15, SP-16 (remainder), SP-17, SP-19 (money-screen half)**.
Owned files: `waves/w1b/steward.md` §6.2. Nothing outside that row is edited — cross-lane needs go to
`waves/w1b/b-notes.md`.

## New files this lane creates (all under owned dirs, or a new dir no lane claims)

| File | Why |
|---|---|
| `Patina/Features/Proposals/ProposalStatusDisplay.swift` | SP-04's accepted≠signed label, as a pure testable seam |
| `Patina/Features/Proposals/ProposalSignTerms.swift` | SP-04's restated terms, composed only from bundle fields |
| `Patina/Features/Projects/ProjectDetailCopy.swift` | SP-05's overview facts + missing-section copy, pure |
| `Patina/Features/Money/MoneyFailureCopy.swift` | SP-15's one mapper: every money error → Patina-voice sentence + acts |
| `Patina/Features/Money/MoneyScreenChrome.swift` | SP-19's status-bar band + the Hearth clearance metric |
| `Patina/Features/Decisions/DecisionDeferral.swift` | SP-17's "Not yet" / "Neither of these" note composition |
| `Patina/Features/Decisions/Views/DecisionDeferSheet.swift` | SP-17's note sheet |
| `PatinaTests/MoneyAndStudioCopyTests.swift` | the one new B-named suite (SP-05, SP-15 render, SP-16, SP-19) |

`Features/Money/` is a new directory claimed by no lane in `steward.md` §6; `Patina/` is a
`PBXFileSystemSynchronizedRootGroup` (`project.pbxproj:70-77`), so new files do **not** touch the
pbxproj (C is its sole writer).

## Gate (every task, foreground, sandbox disabled)

```bash
/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w1b-b/apps/mobile/Patina/scripts/ios-gate.sh build
xcodebuild test \
  -project /Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w1b-b/apps/mobile/Patina/Patina.xcodeproj \
  -scheme Patina -configuration Debug \
  -destination 'platform=iOS Simulator,id=8A414D4A-8CD2-4867-ADBE-4F00FAEB5E06' \
  -derivedDataPath /Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w1b-b/.build/dd \
  -only-testing:PatinaTests
```

Suites B keeps green: `BudgetAggregationTests`, `InvoicesMoneyRailTests`, `ProposalsMoneyRailTests`,
`StudioHubTests`, `AttentionCountTests`, `DecisionConsentValidationTests`.

---

## Task 1 — SP-04a · "Accepted" is not "Signed"

**Files.** `Features/Proposals/ProposalStatusDisplay.swift` (new) ·
`Features/Proposals/Views/ProposalListView.swift` (`:59` section title, `:164-173` row label) ·
`Services/API/ProposalsAPIClient.swift` (`RemoteProposal.hasSignatureRecord`).

**Interface neighbours rely on.**
```swift
extension RemoteProposal { var hasSignatureRecord: Bool }   // signed_at != nil || signed_by_name non-empty
enum ProposalStatusDisplay {
    static func rowLabel(_ p: RemoteProposal) -> String       // "Signed" only with a signature record
    static let acceptedSectionTitle = "Accepted"              // was "Signed"
}
```

**Failing test** (`PatinaTests/ProposalsMoneyRailTests.swift`, appended):
```swift
@Test("an accepted proposal with no signature record is called Accepted, never Signed")
func acceptedWithoutSignatureIsNotCalledSigned() throws {
    let json = """
    { "id": "p-1", "status": "accepted", "title": "Sample accepted proposal",
      "total_amount": 10000000, "signed_at": null, "signed_by_name": null,
      "created_at": "2026-07-01T00:00:00Z" }
    """
    let proposal = try decode(RemoteProposal.self, json)
    #expect(!proposal.hasSignatureRecord)
    #expect(ProposalStatusDisplay.rowLabel(proposal) == "Accepted")
    #expect(ProposalStatusDisplay.acceptedSectionTitle == "Accepted")
}

@Test("a proposal carrying a signature record is called Signed")
func signedProposalIsCalledSigned() throws {
    let json = """
    { "id": "p-2", "status": "accepted", "signed_at": "2026-07-04T10:00:00Z",
      "signed_by_name": "Ruth Alvarez", "created_at": "2026-07-01T00:00:00Z" }
    """
    let proposal = try decode(RemoteProposal.self, json)
    #expect(proposal.hasSignatureRecord)
    #expect(ProposalStatusDisplay.rowLabel(proposal) == "Signed")
}
```

**Run.** gate above (`-only-testing:PatinaTests/ProposalsMoneyRailTests` for the red run).

**Implement.** `hasSignatureRecord` on `RemoteProposal`; `ProposalStatusDisplay` carrying the whole
`statusLabel` switch (sent→"Awaiting your review", viewed→"In review", accepted→signature-gated,
declined, expired, default capitalized). `ProposalListView` section title `"Signed"` → the constant;
`ProposalRowCard.statusLabel` delegates.

**Commit.** `fix(ios): SP-04 — an accepted proposal is called Accepted until it is signed`
pathspecs: the three files + the test file.

---

## Task 2 — SP-04b · the sign sheet restates what is being agreed to

**Files.** `Features/Proposals/ProposalSignTerms.swift` (new) ·
`Features/Proposals/Views/ProposalSignSheet.swift` · `Features/Proposals/Views/ProposalDetailView.swift`
(`:40-51`, passes the terms).

**Interface.**
```swift
struct ProposalSignTerms: Equatable {
    let projectName: String?     // proposal.project?.name — omitted when null
    let total: String?           // PatinaCurrency.format(total_amount) — omitted when null
    let deposit: String?         // first milestone by sort_order: "Deposit — $25,000 (25%)"
    let terms: String?           // PaymentTermsDisplay.label(payment_terms)
    let expiry: String?          // "Expires Sep 8, 2026" from valid_until
    var lines: [(String, String)]
    static func make(proposal: RemoteProposal?, milestones: [RemoteProposalMilestone]) -> ProposalSignTerms
}
```
Nothing composed: every line is a field the bundle returned, or absent.

**Failing test** (`ProposalsMoneyRailTests`):
```swift
@Test("the sign sheet restates only fields the bundle returned")
func signTermsComposeFromTheBundleAndOmitNulls() throws {
    let proposal = try decode(RemoteProposal.self, """
    { "id": "p-3", "status": "sent", "title": "Aspen Loft",
      "total_amount": 10000000, "payment_terms": "net_30",
      "valid_until": "2026-09-08", "project": { "id": "pr", "name": "Aspen Loft Refresh" },
      "created_at": "2026-07-01T00:00:00Z" }
    """)
    let milestones = try decode([RemoteProposalMilestone].self, """
    [{ "id": "m1", "label": "Deposit", "percentage": 25, "amount_cents": 2500000, "sort_order": 0 }]
    """)
    let terms = ProposalSignTerms.make(proposal: proposal, milestones: milestones)
    #expect(terms.projectName == "Aspen Loft Refresh")
    #expect(terms.total == "$100,000.00")
    #expect(terms.deposit == "Deposit — $25,000.00")
    #expect(terms.terms == "Net 30")
    #expect(terms.expiry == "Expires Sep 8, 2026")

    let bare = try decode(RemoteProposal.self, """
    { "id": "p-4", "status": "sent", "created_at": "2026-07-01T00:00:00Z" }
    """)
    #expect(ProposalSignTerms.make(proposal: bare, milestones: []).lines.isEmpty)
}
```

**Implement.** Render `terms.lines` as a label/value stack directly above `PatinaTextField`, keeping
`"Type your full name to e-sign. Signing confirms the scope and kicks off your project."`
**verbatim** immediately below them (plank: keep the existing instruction line). Sheet gains
`terms: ProposalSignTerms`; `ProposalDetailView` passes
`ProposalSignTerms.make(proposal: viewModel.proposal, milestones: viewModel.milestones)`.

**Commit.** `feat(ios): SP-04 — the sign sheet restates total, deposit, terms and expiry`

---

## Task 3 — SP-04c · the signature confirmation email

**Verify first, do not rebuild.** `ProposalsAPIClient.signProposal` already fires
`proposal-sign-confirmation` best-effort after the RPC (`:418-429`), and
`supabase/functions/proposal-sign-confirmation/` exists on `main`. Read
`waves/w1b/d-notes.md` before closing: lane D writes there whether the function is wired to the
`send-email` chokepoint. If D says it is not, the fix is D's — record it as an integration note in
`b-notes.md`, not a client change.

**Failing test** (`ProposalsMoneyRailTests`, source-scan idiom already used at `:216`):
```swift
@Test("signing fires the confirmation email the RPC does not send")
func signPathInvokesTheConfirmationFunction() throws {
    let source = try String(contentsOf: proposalsClientSourceURL(), encoding: .utf8)
    #expect(source.contains("\"proposal-sign-confirmation\""))
    #expect(source.contains("rpc(\"sign_proposal\""))
}
```

**Implement.** No production change expected. Commit the test.

**Commit.** `test(ios): SP-04 — pin the sign path's confirmation-email call`

---

## Task 4 — SP-05 · the client's project screen stops talking to the designer

**Files.** `Features/Projects/ProjectDetailCopy.swift` (new) ·
`Features/Projects/Views/ProjectDetailView.swift` (`:113-130` facts, `:132-166` portal hint).

**Interface.**
```swift
enum ProjectDetailCopy {
    static func overviewFacts(_ p: RemoteProject) -> [(String, String)]   // no "Client view"
    static func missingSectionLines(phases: Bool, payments: Bool, ffe: Bool) -> [String]
}
```

**Failing test** (`PatinaTests/MoneyAndStudioCopyTests.swift`, new):
```swift
@Test("the client's project screen never prints the visibility tier")
func overviewFactsDropTheClientViewTile() throws {
    let project = try decode(RemoteProject.self, """
    { "id": "pr-1", "name": "Aspen Loft Refresh", "status": "in_progress",
      "budget_cents": 12000000, "client_visibility_tier": "milestone" }
    """)
    let labels = ProjectDetailCopy.overviewFacts(project).map(\.0)
    #expect(!labels.contains("Client view"))
    #expect(labels.contains("Budget"))
}

@Test("empty project sections speak to the client, not the designer's portal")
func missingSectionsUseClientVoice() {
    let lines = ProjectDetailCopy.missingSectionLines(phases: true, payments: true, ffe: true)
    #expect(lines == [
        "Your designer is still putting the phases together.",
        "No payment schedule yet.",
        "No furnishings list yet."
    ])
    #expect(!lines.contains { $0.lowercased().contains("portal") })
}
```

**Implement.** Move `overviewFacts` into `ProjectDetailCopy` minus the `client_visibility_tier`
branch; replace `portalHintCard` + `joinedList` with a stack of the client-voiced lines (same quiet
outlined card, no `→`, no tap target).

**Commit.** `fix(ios): SP-05 — the project screen drops designer-facing copy and the CLIENT VIEW tile`

---

## Task 5 — SP-15a · the date you need is on the screen you leave

**Files.** `Features/Shared/DateDisplay.swift` (the shared due/expiry line) ·
`Features/Profile/ViewModels/StudioQueueBuilder.swift` (`:466-473` delegates to it) ·
`Features/Invoices/Views/InvoiceDetailView.swift` · `Features/Proposals/Views/ProposalDetailView.swift` ·
`Features/Decisions/Views/DecisionDetailView.swift` · `Features/Decisions/Views/DecisionListView.swift`.

**Interface.**
```swift
extension DateDisplay {
    struct DueLine: Equatable { let text: String; let isPastDue: Bool }
    static func due(_ raw: String?, now: Date = Date()) -> DueLine?     // "Overdue · Aug 22" / "Due today" / "Due Sep 1"
    static func expiry(_ raw: String?, now: Date = Date()) -> DueLine?  // "Expired Sep 8" / "Expires Sep 8"
}
```
Day precision via `ISO8601DateParsing.dateOrDay` (a Postgres `date` is not ISO8601 — the same trap
W1a fixed for `isAwaitingSignature`).

**Failing test** (`MoneyAndStudioCopyTests`):
```swift
@Test("the due line reads the same on every money surface")
func dueLineIsOneStringForEverySurface() throws {
    let now = try #require(ISO8601DateFormatter().date(from: "2026-08-27T16:00:00Z"))
    #expect(DateDisplay.due("2026-08-22", now: now) == .init(text: "Overdue · Aug 22", isPastDue: true))
    #expect(DateDisplay.due("2026-08-27", now: now) == .init(text: "Due today", isPastDue: false))
    #expect(DateDisplay.due("2026-09-01", now: now) == .init(text: "Due Sep 1", isPastDue: false))
    #expect(DateDisplay.due(nil, now: now) == nil)
    #expect(DateDisplay.expiry("2026-09-08", now: now)?.text == "Expires Sep 8")
}
```
plus, in `StudioHubTests` (kept green), the existing `"Overdue · Aug 22"` / `"Review by Sep 8"` metas
must not change — `StudioQueueBuilder.dueLabel` delegates to `DateDisplay.due` and the proposal row
keeps `"Review by …"`.

**Implement.** Invoice detail: due line under the balance tiles, above the pay footer, red when
`isPastDue` (replaces the ad-hoc `isOverdue(_:)` parser at `:229-237`). Proposal detail: expiry line
in the investment summary. Decision detail: due line under the title; decision list card: same line
in the row.

**Commit.** `fix(ios): SP-15 — carry the due and expiry dates onto every money detail`

---

## Task 6 — SP-15b · the failure speaks Patina, above the fold, never the vendor

The verbatim leak (`research/05-rewalk.md` §2b): **"Invalid API Key provided: sk_test_****…alls"**,
rendered in red beneath a still-enabled `"Pay $4,250.00"` at y≈763 — below the fold and under the
Companion dock. Cause: `CheckoutError.from(code:detail:)` default branch is
`.generic(detail ?? …)` (`InvoicesAPIClient.swift:170`) and `InvoiceDetailViewModel.startCheckout`
prints `(error as? LocalizedError)?.errorDescription` (`:119`).

**Files.** `Features/Money/MoneyFailureCopy.swift` (new) · `Services/API/InvoicesAPIClient.swift`
(`CheckoutError`) · `Features/Invoices/ViewModels/InvoicesViewModel.swift` (`:111-126`, `:135-157`) ·
`Features/Invoices/Views/InvoiceDetailView.swift` (`:96-118` banner, `:196-225` pay footer) ·
`Features/Proposals/ViewModels/ProposalsViewModel.swift` (`:139`) ·
`Features/Decisions/ViewModels/DecisionsViewModel.swift` (`:115`) ·
`Features/Decisions/Views/DecisionDetailView.swift` (render it).

**Interface.**
```swift
struct MoneyFailure: Equatable {
    let sentence: String           // one plain sentence, Patina's voice
    let retryLabel: String         // "Let's try that again"
    let offersDesignerMessage: Bool
}
enum MoneyFailureCopy {
    static func checkout(_ error: Error) -> MoneyFailure
    static func sign(_ error: Error) -> MoneyFailure
    static func decision(_ error: Error) -> MoneyFailure
    static func load(_ surface: Surface) -> String
}
```
`CheckoutError.generic(String)` is **removed** and replaced by `.unavailable` (no associated value),
so no vendor string can reach a case at all; `from(code:detail:)` keeps `detail` only for the DEBUG
log. Every branch of `MoneyFailureCopy` returns app-authored text.

**Failing tests** (`InvoicesMoneyRailTests` — the existing `checkoutErrorMapsEdgeCodes` asserting
`.generic` carries the detail is **rewritten**, it encodes the defect):
```swift
@Test("an unknown checkout failure never carries the vendor's words")
func unknownCheckoutErrorDropsTheVendorDetail() {
    let vendor = "Invalid API Key provided: sk_test_********************alls"
    let mapped = CheckoutError.from(code: nil, detail: vendor)
    let failure = MoneyFailureCopy.checkout(mapped)
    #expect(!failure.sentence.contains("sk_test"))
    #expect(!failure.sentence.contains("API Key"))
    #expect(failure.sentence == "We couldn't start this payment. Nothing has been charged.")
    #expect(failure.retryLabel == "Let's try that again")
    #expect(failure.offersDesignerMessage)
}

@Test("every money failure is one plain sentence, whatever was thrown")
func everyThrownErrorMapsToPatinaVoice() {
    let raw = NSError(domain: "PostgrestError", code: 500, userInfo: [
        NSLocalizedDescriptionKey: "PGRST202 ... sk_test_51Q ... stripe.com"
    ])
    for failure in [MoneyFailureCopy.checkout(raw), MoneyFailureCopy.sign(raw), MoneyFailureCopy.decision(raw)] {
        #expect(!failure.sentence.contains("PGRST"))
        #expect(!failure.sentence.contains("sk_test"))
        #expect(!failure.sentence.contains("stripe"))
        #expect(failure.sentence.hasSuffix("."))
    }
    // and the app's own mapped codes keep their specific, true sentence
    #expect(MoneyFailureCopy.checkout(CheckoutError.notConfigured).sentence
            == "Online payment isn't set up for this invoice yet. Your designer can sort it out.")
}
```
and, in `MoneyAndStudioCopyTests`, the placement + settle-branch rules:
```swift
@Test("the pay failure is rendered above the button, not below it")
func payFailureIsAboveThePayButton() throws {
    let source = try String(contentsOf: invoiceDetailSourceURL(), encoding: .utf8)
    let failure = try #require(source.range(of: "moneyFailureBanner"))
    let button = try #require(source.range(of: "invoiceDetail.pay"))
    #expect(failure.lowerBound < button.lowerBound)
}

@Test("an unconfirmed payment is not called a bank transfer unless it is one")
func settleBannerDefaultsToTheTruth() throws {
    let card = try decode(RemoteInvoice.self, """
    { "id": "i", "status": "sent", "total_cents": 425000, "amount_paid_cents": 0,
      "payments": [{ "id": "p", "method": "stripe", "status": "pending",
                     "stripe_payment_intent_id": "pi_1" }] }
    """)
    #expect(InvoiceSettleCopy.unconfirmed(card)
            == "We haven't seen this payment yet. We'll update this as soon as it clears.")
    let ach = try decode(RemoteInvoice.self, """
    { "id": "i2", "status": "sent", "total_cents": 425000, "amount_paid_cents": 0,
      "payments": [{ "id": "p2", "method": "ach_manual", "status": "pending" }] }
    """)
    #expect(InvoiceSettleCopy.unconfirmed(ach).contains("3–5 business days"))
}
```

**Implement.**
1. `MoneyFailureCopy` + `MoneyFailure`; `CheckoutError.generic` → `.unavailable`.
2. `InvoiceDetailViewModel.payFailure: MoneyFailure?` replaces `payError: String?`; the catch calls
   `MoneyFailureCopy.checkout(error)` and logs the raw error only under `#if DEBUG`.
3. `InvoiceDetailView.payFooter`: banner **above** the button (`moneyFailureBanner`), the button
   disabled while `isStartingCheckout`, two acts — `"Let's try that again"` and
   `"Message your designer"` (the latter opens the project thread via
   `MessagingAPIClient.createThread(projectId:)`, W1a's merged interface, then
   `coordinator.navigate(to: .threadDetail(threadId:))`; hidden when the invoice has no `project_id`).
   Caption becomes `"Payment opens securely in Safari."` above the existing
   `"Pay securely by card or bank transfer."`.
4. `ConfirmState.achPending` → `.unconfirmed`, drawn from `InvoiceSettleCopy.unconfirmed(invoice)`:
   the bank-transfer sentence only when a pending payment's `method` is `ach_manual` or `wire`
   (`00178_invoices_v1.sql:128-129` is the whole vocabulary; a Stripe card and a Stripe ACH are both
   `method='stripe'`, so the method is unknowable there and the copy must not guess).
   `InvoicePaymentsBlock`'s empty line becomes "Paid in full — your designer recorded it outside
   Patina." when `invoice.isPaid`, keeping "No payments recorded yet." otherwise.
5. Proposal sign error and decision submit error route through `MoneyFailureCopy`; the decision
   failure is **rendered** (today `DecisionDetailViewModel.error` is only drawn when the decision
   itself failed to load, so a failed submit is silent).

**Commit.** `fix(ios): SP-15 — money failures speak Patina's voice above the fold, never the vendor's`

---

## Task 7 — SP-16 remainder · a budget screen named for what it computes

**Files.** `Features/Budget/BudgetView.swift` (`:34-43` header, `:99-139` summary) ·
`Features/Budget/BudgetViewModel.swift` (`BudgetProjectSection` gains the designer's figure) ·
`Features/Budget/BudgetBlocks.swift` (renders it) ·
`Features/Profile/ViewModels/StudioQueueBuilder.swift` (`:348-360` row detail).

**Interface.**
```swift
struct BudgetProjectSection { /* … */ let designerBudgetCents: Int? }
```

**Failing test** (`BudgetAggregationTests`):
```swift
@Test("a project's own budget is carried separately from what has been billed")
func sectionsCarryTheDesignersFigureSeparately() throws {
    let projects = try decode([RemoteProject].self, """
    [{ "id": "pr-1", "name": "Aspen Loft Refresh", "budget_cents": 12000000 }]
    """)
    let invoices = try decode([RemoteInvoice].self, """
    [{ "id": "i-1", "project_id": "pr-1", "status": "sent",
       "total_cents": 425000, "amount_paid_cents": 0 }]
    """)
    let sections = BudgetMath.buildSections(projects: projects, acceptedProposals: [],
                                            milestonesByProposal: [:], visibleInvoices: invoices)
    #expect(sections.first?.designerBudgetCents == 12_000_000)
    #expect(sections.first?.rollup.billedCents == 425_000)   // never conflated
}
```
plus in `MoneyAndStudioCopyTests`:
```swift
@Test("the screen is named for what it computes")
func budgetScreenIsNamedBilledToDate() throws {
    let source = try String(contentsOf: budgetViewSourceURL(), encoding: .utf8)
    #expect(source.contains("\"Billed to date\""))
    #expect(!source.contains("\"Your budget\""))
}
```

**Implement.** H3 `"Your budget"` → `"Billed to date"`; eyebrow stays `BUDGET` (the canonical surface
name, C4 — the route's `displayName` is C's file and is not touched). Each project section prints
`"Project budget $120,000 · your designer's figure"` when `budget_cents`/`total_amount_cents` is
present, visually separate from the billed/paid/outstanding rollup. `records.budget`'s detail
`"Project totals and payment progress"` → `"What's been billed, and what's been paid"`; the row **id
stays `records.budget`** so `StudioHubTests` is unaffected.

**Commit.** `fix(ios): SP-16 — the budget screen is named for what it computes`

---

## Task 8 — SP-17 · a decision can be deferred, and shows the colour

**Files.** `Features/Decisions/DecisionDeferral.swift` (new) ·
`Features/Decisions/Views/DecisionDeferSheet.swift` (new) ·
`Features/Decisions/Views/DecisionDetailView.swift` (`:111-145` option card + fallback, `:202-226`
act row) · `Features/Decisions/ViewModels/DecisionsViewModel.swift`.

**Interface.**
```swift
enum DecisionDeferral: String, CaseIterable {
    case notYet, neitherOfThese
    var actLabel: String                                   // "Not yet" / "Neither of these"
    func draft(decisionTitle: String?) -> String           // the note, with the decision named
}
```
Sends through W1a's merged `MessagingAPIClient.createThread(projectId:)` + `sendMessage(threadId:body:)`,
then `coordinator.navigate(to: .threadDetail(threadId:))`. The decision stays `pending` — no new
status (`client_decisions.status` CHECK is `draft|pending|responded|expired`,
`00062_client_management_v2.sql:80-81`).

**Failing tests** (`DecisionConsentValidationTests`):
```swift
@Test("deferring names the decision and never resolves it")
func deferralDraftNamesTheDecision() {
    #expect(DecisionDeferral.notYet.actLabel == "Not yet")
    #expect(DecisionDeferral.neitherOfThese.actLabel == "Neither of these")
    let draft = DecisionDeferral.notYet.draft(decisionTitle: "Rug color - Natural vs Sand")
    #expect(draft.contains("Rug color - Natural vs Sand"))
    let neither = DecisionDeferral.neitherOfThese.draft(decisionTitle: nil)
    #expect(neither.contains("this decision"))
    #expect(!neither.isEmpty)
}

@Test("an option with nothing to show is not offered as a choice, and says why")
func contentlessOptionsSayWhyInTheClientsWords() throws {
    let bare = try decode(RemoteDecisionOption.self, """
    { "id": "o-1", "decision_id": "d-1", "title": null, "description": null, "image_url": null }
    """)
    #expect(!bare.hasRenderableContent)
    #expect(DecisionOptionCopy.unavailableLine == "Your designer is still adding this option.")
    #expect(DecisionOptionCopy.allUnavailableLine == "Your designer is still adding the options.")
    #expect(!DecisionOptionCopy.unavailableLine.lowercased().contains("portal"))
}
```

**Implement.** Two ghost acts under the option cards while unresolved, opening `DecisionDeferSheet`
(prefilled draft, editable, send). `"Details unavailable — view in portal"` →
`DecisionOptionCopy.unavailableLine`; when **no** option has renderable content the card stack is
replaced by `allUnavailableLine` (the plank's own risk note — never a blank choice). The image/swatch
requirement is a content contract on the designer side: noted in `b-notes.md` and stopped there, per
the plank.

**Commit.** `feat(ios): SP-17 — a decision can be deferred, and an empty option says why`

---

## Task 9 — SP-19 (money half) · the status bar and the Hearth stop covering the money

**Files.** `Features/Money/MoneyScreenChrome.swift` (new) · the eight money scroll containers:
`InvoiceDetailView`, `InvoiceListView`, `ProposalDetailView`, `ProposalListView`,
`DecisionDetailView`, `DecisionListView`, `BudgetView`, `ProjectDetailView`.

**Interface.**
```swift
enum MoneyScreenMetrics {
    /// Clearance under the last element so nothing lands inside the Hearth.
    static let bottomClearance: CGFloat = CompanionHearthMetrics.reservedHeight + 24
}
extension View { func moneyScreenTopBand() -> some View }   // opaque status-bar reservation
```
`moneyScreenTopBand()` is a zero-height `safeAreaInset(edge: .top)` whose background ignores the top
safe area, so scrolled content passes **behind** the status bar instead of overprinting `9:41`
(`research/05-rewalk.md` §2b(iii)).

**Failing test** (`MoneyAndStudioCopyTests`):
```swift
@Test("nothing on a money screen is drawn inside the Hearth")
func moneyScreensClearTheHearth() {
    #expect(MoneyScreenMetrics.bottomClearance >= CompanionHearthMetrics.reservedHeight)
}

@Test("every money screen reserves the status bar and the Hearth from one place")
func moneyScreensShareOneChromeSource() throws {
    for file in MoneyScreenSources.all {
        let source = try String(contentsOf: file, encoding: .utf8)
        #expect(source.contains("moneyScreenTopBand()"), "\(file.lastPathComponent) misses the top band")
        #expect(source.contains("MoneyScreenMetrics.bottomClearance"),
                "\(file.lastPathComponent) hard-codes its Hearth clearance")
    }
}
```

**Implement.** Replace each `.padding(.bottom, 120/140)` with
`.padding(.bottom, MoneyScreenMetrics.bottomClearance)` and add `.moneyScreenTopBand()` beside
`.patinaScreen(title: nil)`. **Not in this lane:** the opaque `PatinaColors.Background.primary` band
inside `companionHearthReservation` and the back chevron's missing scrim — both live in C's
`CompanionSafeArea.swift` / `PatinaScreenChrome.swift`; they go to `b-notes.md` as integration notes.

**Commit.** `fix(ios): SP-19 — money screens reserve the status bar and clear the Hearth`

---

## Close-out

1. `waves/w1b/b-notes.md` — integration notes for C (Hearth band, chevron scrim) and, if lane D's
   notes say so, the `proposal-sign-confirmation` wiring.
2. Full gate: `ios-gate.sh build` + the whole `-only-testing:PatinaTests` tier.
3. Sim check on `dr-w1b-b`, signed in as `client@patina.dev` / `password123`, launched with
   `-DeploymentTarget local`; shots `shots/w1b-b-NN-slug.png`, ledger rows under `## w1b-b`.
4. Signed `.app` built (no `CODE_SIGNING_ALLOWED=NO`), path recorded.
5. `rmdir .writer.lock.d`; `git log --oneline main..HEAD`; `git status --porcelain` empty.
