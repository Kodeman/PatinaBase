# W1b · lane B — fix round

Against `b-review.md` (branch `daily-return/w1b-b` @ `feef08d87`). Every blocking and major item is
either **changed** or **rebutted with evidence**; the cheap minors are taken. Two commits:

```
$ git log --oneline main..HEAD | head -2
9f9386dae fix(ios): B-1, m-3, m-4, m-5, m-7 — one date vocabulary, and the sheet carries the designer's own labels
5fb7debc3 fix(ios): B-3, B-6, m-1, m-2 — money failures stop guessing, and a deferral has somewhere to go
```

Gate, re-run exactly as the brief specifies:

```
$ apps/mobile/Patina/scripts/ios-gate.sh build
** BUILD SUCCEEDED **

$ xcodebuild test -project .../Patina.xcodeproj -scheme Patina -configuration Debug \
    -destination 'platform=iOS Simulator,id=8A414D4A-8CD2-4867-ADBE-4F00FAEB5E06' \
    -derivedDataPath .../.build/dd -only-testing:PatinaTests CODE_SIGNING_ALLOWED=NO
✔ Test run with 710 tests in 87 suites passed after 7.088 seconds.

# lane B's seven owned suites, explicitly
✔ Test run with 91 tests in 7 suites passed after 0.359 seconds.   (exit 0)
```

(`710` is the whole `PatinaTests` tier, up from 702 — eight net new tests, no removals but three
rewritten assertions, each named below.)

---

## Blocking / major

### B-1 · SP-15 not carried onto the invoice list — **CHANGED**

`InvoiceListView.dueLine` now returns `DateDisplay.DueLine` and the row colours on `isPastDue`,
which is what the decision list and the invoice detail already did:

```swift
private var dueLine: DateDisplay.DueLine? {
    guard invoice.status == "sent" || invoice.status == "partially_paid" else { return nil }
    return DateDisplay.due(invoice.due_date)
}
```

The overdue invoice that read muted "Due Aug 22, 2026" on the list and red "Overdue · Aug 22" one
tap later now reads the same words in the same colour on both.

**Taken beyond the finding, because it is the other half of the plank's own sentence** ("turn it red
once past due"): `ProposalListView.expiryLine` returns the `DueLine` too and reddens an expired
proposal. It already read `DateDisplay.expiry`; it discarded `isPastDue`.

New test `MoneyAndStudioCopyTests.moneyListsReadTheSharedDateHelper` fails on either regression —
it asserts both lists call the helper, that `InvoiceListView` contains no `"Due \(` interpolation
of its own, and that both carry the `isPastDue ? PatinaColors.error` branch.

### B-2 · SP-04's confirmation email does not use the chokepoint — **RAISED, as `b-notes.md` §6**

The finding is correct and lane B verified it independently rather than taking it on trust:

```
$ grep -n "notification_log\|_shared/send-email\|api.resend.com" \
    supabase/functions/proposal-sign-confirmation/index.ts
67:  const res = await fetch('https://api.resend.com/emails', {
```

No `notification_log`, no `_shared/send-email` import. The function's own `sendEmail` (`:62-80`) is a
bare `fetch`; every `notification_log` row for an email in this repo is written by
`sendCompliantEmail` (`_shared/send-email.ts:388, 409, 426`). The review is right that lane B's
§5 and lane D's §1 both answered *does it fire* and neither answered *how it sends*.

`supabase/**` is lane D's entire row (`steward.md` §6.4), so this is an integration note, not an
edit: `b-notes.md` §6 carries the import, the two `sendCompliantEmail` call sites with their
`userId` / `category` / `templateId` / `idempotencyKey`, and the `client_id, designer_id` the
current select omits and `notification_log.user_id` needs. It also says to apply it together with
§1 (the 100× total), since both live in the same two sends.

Lane B's client side needs no change and none was made: `ProposalsAPIClient.signProposal` already
invokes the function best-effort after the RPC (`:418-429`).

### B-3 · the unconditional ACH sentence in the checkout failure copy — **CHANGED**

Verified the mechanism before changing the words. `payment_processing` is returned for **any**
completed Checkout session still pointing at a pending payment row:

```
create-checkout-session/index.ts:1114-1122   // Completed session with a still-pending payment row
create-checkout-session/index.ts:433-439     // "card just cleared and the webhook hasn't landed,
                                             //  or an ACH debit settling"
```

So a card payer inside the webhook gap was told a bank transfer was clearing. The sentence is now:

> A payment on this invoice is already going through. We'll update this as soon as it clears.

Routing it through `InvoiceSettleCopy.isBankTransfer` (the review's alternative) is not possible
here: `MoneyFailureCopy.checkout` takes an `Error`, not an invoice, and the caller is the checkout
*start* path — there may be no settled payment row to read a method from yet. Dropping the guess is
the same discipline `InvoiceSettleCopy` already applies, and nothing true is lost: the settle banner
on the same screen still prints the 3–5-day sentence when the payment row itself says `ach_manual`
or `wire`.

The test that pinned the defect (`mappedCheckoutCodesKeepTheirOwnCopy`) is rewritten to assert the
new sentence and its absence, and a loop was added over **every** `CheckoutError` case that fails
any branch naming a payment method — so the guess cannot come back through a different case.

### B-4 · SP-16's rename did not reach the Companion — **RAISED, as `b-notes.md` §7**

Correct, and the count is four labels for one route. All three files are outside `steward.md` §6.2
(`CompanionActionRows` and `CompanionAreaBuilders` are A's by the §6.5 carve-out; `CompanionContext`
is C's), so the note carries exact diffs for each and the grep proving the set is closed:

```
$ grep -rn "Your budget\|Your spend\|See your budget" apps/mobile/Patina/Patina/
Features/Companion/Models/CompanionContext.swift:220                            → C
Features/Companion/Services/CompanionActionRows.swift:67                        → A
Features/Companion/Services/CompanionAreaBuilders.swift:255,261,323,329,336,349 → A
Features/Budget/BudgetViewModel.swift:168   — a comment quoting the old name to explain the
                                              rename, in lane B's own file. Not a label.
```

The note also flags `PatinaTests/CompanionActionMatrixTests.swift:308`, which asserts the literal
`"See your budget"` and is lane A's suite to update in the same commit. Shot
`w1b-b-17-companion-budget-label.png` (XXL) shows the live disagreement.

### B-5 · SP-19's money half — **PART CHANGED, PART RUN, PART REBUTTED**

Three separate claims; they do not resolve the same way.

**(a) The plank's named verification was skipped — CORRECT, and it has now been run.**
This was the real gap and it is closed as far as the environment allows. The app was reinstalled at
Dynamic Type XXL (`xcrun simctl ui <udid> content_size extra-extra-extra-large`, read back before
and after) and walked. Four new shots and a full accounting of what could **not** be reached are in
`research/01-shot-ledger.md` § "w1b-b · fix round (Dynamic Type XXL)". In summary:

- **Verified at XXL:** the proposals list and the proposal detail. The plank's XXL claim — "the
  Dynamic Island pill blots out a proposal title outright" — does not reproduce: the title wraps to
  two lines fully below the band (`w1b-b-13`), and scrolled content passes **behind** the band
  rather than under the clock (`w1b-b-18`).
- **NOT verified at XXL, and not claimed:** the proposal detail's `Sign proposal` clearance (the
  harness could not drive the `ScrollView` to its end at XXL — ~30 swipes covered ~40 % before
  rubber-banding); decision detail and Budget (the harness stopped delivering navigations mid-run,
  surviving an app relaunch and a full simulator reboot); invoice detail (no invoices on the local
  stack — `b-notes.md` §4).

So SP-19's Hearth half stands at **default-type sim-verified** (`w1b-b-04`) and **XXL-unverified**.
That is stated in the ledger and here rather than papered over.

**(b) 144 is "more padding", the fix the plank rules out — CORRECT, and deliberately not fixed
here.** The plank offers two real fixes: a bottom bar above the Hearth, or the orb yielding. Both
change `ContentView` and `CompanionSafeArea`, which are **C's files** (`steward.md` §6.2, last
paragraph: "The shared chrome primitives … are C's — B writes an integration note"). The mechanical
cause — the opaque `PatinaColors.Background.primary` band inside `companionHearthReservation` — is
raised as `b-notes.md` §2 with both options spelled out and the mechanism left as C's ruling. The
choice between them is unruled (critique §(h)6) and is **Fable's to make, not lane B's**: it is a
spatial-contract decision (C8) that changes every screen in the app, not just money.

What B did change is not "more padding" in the sense the plank rejects — it is one derived constant
replacing eight hard-coded numbers (120 here, 140 there) that had no relationship to the Hearth
metric, so a change to the Hearth now moves them all. `+24` over the reserved height is a clearance,
not a guess at the collision. It is not a fix and it is not reported as one.

**(c) `moneyScreenTopBand()` "paints over" rather than reserves, contradicting b-notes §2 — REBUTTED,
with the distinction named.** The two bands are not the same pattern:

| | the Hearth band (C's file, condemned in §2) | the money top band (B's) |
|---|---|---|
| Height | **120 pt** of real estate | **0 pt** |
| What it covers | live content the client is reading, at the bottom, where the primary act is | the status-bar strip, which iOS owns and always draws over |
| At rest | sits on top of `Sign proposal`, clipping it to `Sign proposa` | nothing is under it — SwiftUI's own safe area already starts content below |
| While scrolling | the same 120 pt stays opaque over whatever scrolls under it | content passes behind it, which is exactly what a navigation bar's material does |

C8's contract is *"a reserved layout region, never a painted bar"* — a bar that **consumes content**
is the defect. A zero-height inset that makes the system's own status-bar strip opaque consumes
nothing; it is the standard treatment for a `ScrollView` under a hidden navigation bar, and
`w1b-b-18` shows it working at XXL. Nonetheless the review is right that Fable should name which is
the house pattern before C acts on §2, and that is flagged for the steward rather than assumed.

**(d) No sheet header got the band — CHANGED.** `ProposalSignSheet`, `DecisionDeferSheet` and
`DecisionConsentSheet` now take `.moneyScreenTopBand()`; the plank says "every scroll container and
sheet header" and all three are scroll containers that reach the status bar at the `.large` detent.
`MoneyAndStudioCopyTests.moneySheetsReserveTheStatusBar` pins all three (and that the decision
detail file carries it exactly twice — once for the screen, once for the consent sheet). Low impact,
as the review says: **compile-green and unit-asserted, not sim-verified.**

### B-6 · the deferral is a dead end on a project-less decision — **CHANGED**

Confirmed the schema first: `project_id UUID REFERENCES projects(id) ON DELETE SET NULL`
(`00062_client_management_v2.sql:71`), and `RemoteClientDecision.project` documents nil for the
unlinked case. `deferralActs` gated only on `!isResolved`, so on such a decision both buttons drew,
the sheet opened, prefilled, took the note, and `sendDeferral` failed every time.

`DecisionDetailViewModel` now resolves a route before offering the acts:

```swift
enum MessageRoute: Equatable { case project(String); case direct(UUID) }

var messageRoute: MessageRoute? {
    if let projectId = decision?.project_id, !projectId.isEmpty { return .project(projectId) }
    let relationship = DesignerRelationshipResolver.resolve(
        lead: DesignRequestStatusService.shared.liveLead,
        projects: BadgeCountService.shared.projects,
        roster: BadgeCountService.shared.roster)
    if let designerId = relationship.designerId { return .direct(designerId) }
    return nil
}
var canDefer: Bool { messageRoute != nil }
```

`.direct` opens W1a's `MessagingAPIClient.createDirectThread(counterpart:)` — the review's own
suggestion, and the same resolver `ThreadListView.openThread(with:)` already uses, so the decision
screen and the inbox cannot disagree about who the designer is. Where there is neither a project nor
a designer, the two acts **do not draw** and `beginDeferral` refuses: an act that cannot succeed is
not offered, and no note is ever taken from a client the app cannot deliver it for.

The failure sentence is fixed too, which was the second half of the finding: a deferral now reads
*"We couldn't send that note. Your designer hasn't seen it yet."* SP-17's whole point is that a
deferral is a message, not a choice, and it was being reported as *"We couldn't send your choice."*

`deferralWithoutAProjectFailsHonestly` — which pinned the dead end as correct — is replaced by three
tests: the project route, the no-route case (acts withheld, sheet refuses to open), and the copy.

---

## Minors

| # | Verdict | What was done |
|---|---|---|
| m-1 | **taken** | `MoneyFailureCopy.decision(_:)` took an `Error` it never read. It is now a constant, so the signature no longer implies a branch that does not exist, and `deferral` is a second constant with its own sentence. Callers already logged the raw error through `MoneyFailureCopy.log`. |
| m-2 | **taken** | The decision failure banner now carries both acts. "Let's try that again" calls `retrySelection()`, which re-opens the consent step on the option the failed submit was carrying (`lastAttemptedOptionId`) rather than dropping the client back into the option list, and refuses once the decision has resolved. "Message your designer" opens or creates the thread through `messageDesigner()` instead of appearing only when one had already resolved. |
| m-3 | **taken** | The `"Accepted on <date>"` branch is deleted. Verified the review's claim against both RPCs: `list_client_proposals` (`00422:2304-2334`) and `get_client_proposal_bundle` (`00407:341-372`) emit `signed_at`/`signed_by_name` and **no** `accepted_at`. The fixture in `acceptedWithoutSignatureIsNotCalledSigned` now matches what the server actually sends and asserts the line reads `"Accepted"`. The seal-on-an-unsigned-proposal question the review raises alongside it is a design call, left for Kody — see "Open, not closed" below. |
| m-4 | **taken** | The sign sheet's expiry now comes from `DateDisplay.expiry`, so it reads `"Expires Sep 8"` like the detail behind it and can say `"Expired Sep 8"`, which it could not before. `StudioQueueBuilder`'s `"Review by Sep 8"` is deliberately left — it is the Studio's own verb for a queue row, not the expiry vocabulary. |
| m-5 | **taken** | The milestone's own label is now the row label (`Retainer | $25,000.00`, not `Deposit | Retainer — $25,000.00`), falling back to `"Deposit"` only when the milestone has none. The sort tie-breaks on the milestone id, so a schedule that shares or omits `sort_order` picks the same row every render — two new tests, one of which asserts `make(milestones:) == make(milestones.reversed())`. |
| m-6 | **open — needs Fable** | The W1b table says the sheet restates "total, line count, terms, date"; the plank body says "project name, total, the deposit line, and the expiry date". The implementation follows the body. Not guessed at in a fix round: it is legal copy Kody signs off, and one line from Fable settles it. Adding a line count is a ten-minute change if the table governs. |
| m-7 | **part taken, part declined** | Taken: `"Couldn't load your budget"` → `"Couldn't load what's been billed"`, since it named a screen SP-16 renamed. Declined: `MoneyFailureCopy.load(_ surface:)` is **not** built. The `"Couldn't load X"` idiom is app-wide — 19 sites across five lanes' files — so a money-only helper would be an unrequested abstraction that unifies nothing. It is struck from B's plan rather than left as an open item. |
| m-8 | **acknowledged, not changed** | Fair and accurate. The six source-grep assertions hold the shape of the source, not the render. They exist because there is no UI-test harness for these screens; they are cheap regression fences, not behavioural coverage, and the report should not have let "+32 tests" read as proof of SP-15 and SP-19. The genuinely behavioural additions are the `DateDisplay`, `MoneyFailureCopy`, `InvoiceSettleCopy`, `ProposalSignTerms`, `ProposalStatusDisplay`, `BudgetMath` and `DecisionDetailViewModel` tests — and this round adds four more of that kind (the route resolution, the retry, the deposit label, the deterministic sort). |
| m-9 | **acknowledged** | `Features/Money/` is still unclaimed; `b-notes.md` §5 already asks the steward to fold it into §6.2 at integration. Nothing new. |
| m-10 | **accepted** | Correct: the banner is above the Pay **button**, which is what the plank asks and what shipped, but on a long invoice the pay footer is not necessarily on the first screen. "Above the fold" overstated it; "above the button" is the claim. |
| m-11 | **acknowledged** | Unchanged and still honest. The sign sheet's Project/Deposit/Terms rows and the whole invoice rail remain unit-verified only, for the reasons the ledger already gives. |

---

## Open, not closed — for Fable and the steward

1. **SP-19's Hearth ruling** (B-5b) — bottom bar above the Hearth, or the orb yields. Unruled since
   the critique; it changes `ContentView` and `CompanionSafeArea`, so C cannot act on `b-notes.md`
   §2 without it, and B's money half cannot be proven until C lands.
2. **Which top-band pattern is the house pattern** (B-5c) — named so C is not asked to remove one
   painted band while B keeps another.
3. **m-6** — whether the sign sheet restates a line count.
4. **The seal on an accepted-but-unsigned proposal** (m-3's residue) — `checkmark.seal.fill` still
   reads as *done* over a line that now correctly says only "Accepted". Changing the glyph is a
   design call, not a defect fix.
5. **`b-notes.md` §6 and §7** are new asks on lanes D, A and C respectively, added in this round.
