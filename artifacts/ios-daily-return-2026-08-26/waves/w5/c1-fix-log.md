# W5 · lane C1 — fix round

Against `c1-review.md` (reviewed at `fddb4a0ba`). Branch `daily-return/w5-c1`, worktree
`.codex/worktrees/agent-dr-w5-c1`, base `daily-return/w5-d` `ee784a83c`.

Every **blocking** and every **major** is changed. Two of the three blocking findings are C1's
half of a two-lane collision, so what C1 could change is stated exactly, and what remains the
steward's is stated as an ask rather than left implied. Seven of the eleven minors are also
changed; the other four are answered at the bottom.

Also answering `c1-review.md` §"Two process facts": the report the reviewer was handed described
the a11y lane's commits. **The gate line for the reviewed sha is in this round's report**, and this
round's own gate output is recorded in §Gate below.

---

## BLOCKING

### B1 · Two lanes minted `AppRoute.orderDetail`, and the ids meant different things — **CHANGED (C1's half), plus a steward ask**

The finding is right on all three counts and the third one is the reason the first two exist:
minting the case here was the wrong call. **C1 has dropped its copy of the case and every switch
arm and route-count assertion it forced.** Reverted to `ee784a83c` verbatim:

```
apps/mobile/Patina/Patina/App/Coordinators/Coordinator.swift
apps/mobile/Patina/Patina/App/Coordinators/AppCoordinator.swift
apps/mobile/Patina/Patina/ContentView.swift
apps/mobile/Patina/Patina/Features/Navigation/HouseFirstRoot.swift
apps/mobile/Patina/Patina/Features/Navigation/RouteTabTable.swift
apps/mobile/Patina/PatinaTests/RouteTabTableTests.swift
```

and the `.orderDetail` arms removed by hand from the four Companion switches
(`CompanionContext.contextSummary`/`.contextIcon`, `CompanionContextProvider.screenItems`,
`CompanionViewModel.screenIdentifier`, `CompanionAPIClient.screenIdentifier`) and from
`CompanionActionMatrixTests`'s route list. Evidence:

```
$ grep -rn "orderDetail" apps/mobile/Patina/Patina apps/mobile/Patina/PatinaTests
(no rows)
```

C2's `orderList` + prefixed-token `orderDetail` therefore survive the merge alone. The
duplicate-declaration compile error is gone, and so are the two disagreeing route-count assertions
— `RouteTabTableTests` is byte-identical to the base again, so C2's `36`/`18` (or whatever its own
two cases make it) is the only version in the merge.

**What that costs, stated plainly.** M5c's mock carries a primary `See your order`.
`OrderPlacedView.onSeeOrder` is now `((String) -> Void)?` and `ProductDetailView` passes `nil`, so
on this branch **the control is not drawn at all** and `Back to Today` is the primary. A control
that pushes a blank screen — which is what `.orderDetail` did on this branch alone, falling to
`workDocumentsDestination`'s `default: EmptyView()` — is worse than no control, and a control that
tells a person who paid ninety seconds ago that we cannot find their order is worse than both.

M5c itself is **not** captured on glass this round, and cannot be: the local `STRIPE_SECRET_KEY` is
the 32-char placeholder, so no session settles and `OrderPlacedView` is unreachable. Its copy and
its now-conditional control are asserted in `OrderSheetCopyTests`, and the claim is stated at that
level rather than dressed up.

**The steward ask, so this is one line and not a redesign.** The hand-off wants a lookup **by
direct-order id**, not a string cast, exactly as the review says. `ClientOrder.directOrderId`
already carries it on both rails — C2 sets it to `behind?.id` on a fulfillment row
(`ClientOrder.swift:269`) and to `order.id` on a direct row (`:340`). So after the merge:

1. C2 adds `func order(withDirectOrderId id: String) -> ClientOrder?` beside
   `order(withId:)` (`OrdersService.swift:113`), or `OrderDetailView` accepts either key;
2. `ProductDetailView`'s `orderPlaced` arm passes
   `onSeeOrder: { id in presented = nil; coordinator.navigate(to: <C2's route for direct id>) }`.

`"direct:\(uuid)"` is **not** a safe substitute: it is correct at the moment of placement and stops
resolving the instant intake mints the fulfillment row and C2's merge suppresses the direct row
(`settledDirectIds`, `ClientOrder.swift:212,223`) — which is the state a just-settled order is
racing toward.

### B2 · Out-of-map edits to the steward-reserved router — **CHANGED, and the rule accepted**

All five router files are back at base (listed above), so `Coordinator.swift` and the route→tab
table are untouched by this lane, as §6 requires. `ContentView.swift`, `HouseFirstRoot.swift` and
`AppCoordinator.swift` — the three the task list did not even disclose — are likewise back at base.

The rule is accepted without argument: a lane that needs a file outside its map asks the steward
and does not edit and disclose afterwards. Had that been done, the steward would have found C2's
case before either lane wrote a line.

**One out-of-map edit is made this round, deliberately, and disclosed here rather than after the
fact** — see M1. It is `Services/Badges/BadgeCountService.swift`, three lines, and **no other W5
lane touches that file**:

```
$ for b in daily-return/w5-c2 daily-return/w5-a11y daily-return/w5-d; do
    git diff --name-only ee784a83c..$b | grep -i badge; done
(no rows on any branch)
```

If the steward would rather carry M1 differently, the change is one property and two assignments to
back out; the alternative in-map shapes are named under M1 and all of them are worse.

### B3 · `payment_processing` was unmapped, so a settling bank transfer was told "Nothing has been charged." — **CHANGED**

Verified first, not taken on trust: the direct-order branch returns the 409 at
`create-checkout-session/index.ts:1228-1237`, guarded by the direct payable's own
`hasInFlightPayment`, and `OrderCheckoutError.from` had no case for `payment_processing`, so it fell
to `.unavailable`.

`OrderCheckoutError` gains `.paymentProcessing`; `from(code:detail:)` maps `"payment_processing"`
to it; `analyticsReason` reports `payment_processing`; and the copy is the invoice rail's sentence
one noun over —

> **"A payment on this order is already going through. We'll update this as soon as it clears."**

matching `MoneyFailureCopy.checkout(.paymentProcessing)` (`MoneyFailureCopy.swift:56-67`), whose
comment already carries the reasoning: the *method* is not knowable here, so the sentence names
neither card nor bank. The server's `detail` ("A bank transfer for this order is already
processing…") is logged under `#if DEBUG` and rendered nowhere.

Pinned by `OrderHandoffTests.paymentProcessingNeverClaimsNoCharge`, which asserts the sentence, that
it does **not** contain "Nothing has been charged", that it does not contain "bank transfer", and
that `order_failed` reports the code.

---

## MAJOR

### M1 · R3's guard rested on `hasLoaded`, which is true when the *projects* fetch is the one that failed — **CHANGED**

The finding is exactly right, including that `lastRefreshFailed` does not close it (set only when
all five fail, `BadgeCountService.swift:167-173`).

`BadgeCountService` gains one read-only property that says only what it knows:

```swift
private(set) var projectsLoaded: Bool = false
…
if let fetchedProjects {
    projects = fetchedProjects
    projectCount = fetchedProjects.count
    projectsLoaded = true      // set ONLY inside the `if let` — a nil fetch leaves it false
}
```

reset to `false` in the guest branch of `refresh()` alongside `hasLoaded`. `hasLoaded` is unchanged
and still means what the rail needs it to mean.

The predicate itself is now a pure function in C1's own file, so it can be asserted:

```swift
PieceActResolver.relationshipIsResolved(
    isAuthenticated: Bool, projectsAnswered: Bool, leadAnswered: Bool
) -> Bool           // guest ⇒ true; otherwise BOTH halves must have answered
```

and `ProductDetailView.relationshipIsResolved` calls it with
`BadgeCountService.shared.projectsLoaded` and `DesignRequestStatusService.shared.hasLoaded` (the
DRS half already stays `false` on failure, as the review says).

Pinned by `PieceActMatrixTests.aFailedProjectsFetchIsNotAnAnswer` — a detached
`BadgeCountService.makeForTests()` given `projects: nil` and four answered fetches keeps
`projectsLoaded == false` and the predicate false; given `projects: []` and four *failed* fetches it
goes true — and by `bothHalvesOrNoBuy` for the lead half and the guest.

**Why not an in-map shape.** The two available in-map signals both fail: `hasLoaded` is the broken
one, and `projects.isEmpty` cannot distinguish "no projects" from "the fetch failed and `[]` stood",
so keying on it would leave every genuinely designer-less client on Path C forever — the feature
would never draw. A second `listProjects()` call from the piece screen would answer the predicate
while `DesignerThreadOpener.currentRelationship` still resolved from the stale array, which is a
worse lie than the one being fixed.

### M2 · The guest-wall test asserted nothing — **CHANGED**

`aGuestNeverReachesCreate` is gone. The guard it claimed to pin is now a value:

```swift
enum PieceActEntry { case authWall(title: String), askDesigner, askAboutPiece(reason: String?), order }
PieceActResolver.entry(for: PieceAct, isAuthenticated: Bool) -> PieceActEntry
```

`ProductDetailView.performPrimaryAct` switches on it and does nothing else. Two tests replace the
empty one:

- `aGuestMeetsTheWallBeforeAnythingIsWritten` — **every** act a guest can tap resolves to
  `.authWall`, and it fails (`Issue.record`) if any of them reaches a destination that writes.
  Delete the guard and this test goes red.
- `signedInEntriesAreTheActsThemselves` — signed in, only `.buy` resolves to `.order`.

`nothingIsCreatedBeforeBegin` keeps the old machine-side assertion under an honest name. The
behaviour was already proven server-side by `w5-c1-05` (0 `direct_orders` rows before and after the
guest's tap) and is re-proven this round in `w5-c1-14`.

While extracting it, the guard was widened: `.askDesigner` previously reached the sheet with no auth
check at all. A guest cannot hold a live relationship today, so nothing could reach it — but the
sheet writes a message, and the wall now precedes every act that writes.

### M3 · With freight on the piece the sheet showed two rows and never the number the session bills — **CHANGED**

`OrderSheetContent.make` now appends a **`Total`** row wherever `shipping_flat_cents > 0`:

```swift
money.append(MoneyRow(
    label: "Total",
    value: order.map(\.formattedTotal) ?? PatinaCurrency.format(cents: piecePrice + freight)
))
```

Once the row exists the value is `direct_orders.amount_cents` — the figure the Checkout session
bills, which 00540 folded freight into — not a figure the app re-multiplied. Before the row exists
it is the catalogue's own two numbers added once, by the app, so the reader never is.

With **one** component the row is not added: the `Piece` row already is the total and a second row
repeating it is decoration.

`OrderSheetCopyTests.freightRow` now asserts `["Piece", "Delivery", "Total"]` and
`$4,380.00`; `sheetPrintsTheOrdersOwnFigure` asserts `content.moneyRows.last?.value ==
order.formattedTotal` — the total that used to be computed and not rendered is now rendered and
asserted.

Locally still invisible (`shipping_flat_cents` is NULL on all seven buyable rows), so the pin is
the test, not the walk; `w5-c1-16` captures the sheet against a piece given a freight value for the
capture and restored after.

### M4 · `OrderPlacedView.summaryLine`'s enabled branch was unreachable — **CHANGED**

The defaulted parameter is gone: `summaryLine(_:taxShippingEnabled:)` now requires the argument, so
no caller can drift back into the dead branch by omission. `OrderPlacedView` takes
`taxShippingEnabled` as a stored property and `ProductDetailView` passes `terms.taxShippingEnabled`
— the terms it had already read and was not passing.

`orderPlacedSummaryBranches` now also constructs the view with `taxShippingEnabled: true` and
asserts the property survives, so the test guards the wiring and not just the string.

---

## MINORS — changed

1. **`order_checkout_returned` carries no `{outcome}`** — changed, and the timing moved with it.
   Safari's *Done* is not a moment at which any outcome is knowable, so filling the property there
   would have meant inventing one. The event is now **armed** at dismissal and **reported once**
   when the return actually resolves, with `outcome` ∈ `settled` · `unconfirmed` · `abandoned`
   (the reader closed the sheet before the row answered). Pinned by three tests
   (`checkoutReturnCarriesItsOutcome`, `unsettledReturnReportsUnconfirmed`,
   `abandonedReturnIsItsOwnOutcome`), including that nothing fires at the dismissal itself and that
   it never fires twice.
2. **`PurchaseActionBarTests.swift` was never written** — written.
   `apps/mobile/Patina/PatinaTests/PurchaseActionBarTests.swift`: the primary label per act, the
   ghost act, the reason drawn only for Path C, and the R3 pin asserted through the bar itself over
   relationship × flag × resolution.
4. **The auth wall said "Sign in to order" for Path C** — changed. `Presented.authWall` carries a
   title, and `PieceActResolver.entry` sets it per act: `Sign in to order` (Buy),
   `Sign in to ask` (Path C), `Sign in to message your designer` (Path B). Asserted in
   `aGuestMeetsTheWallBeforeAnythingIsWritten`.
5. **`.noSellerOfRecord` over-claimed** — changed to *"We can't sell this piece through the app
   yet."* The gate refuses whatever it cannot prove `patina_managed`, but the server also sells a
   vendor's catalogue row, so the sentence may not be about the piece. Asserted in
   `BuyabilityGateTests.refusalSentencesNameTheirOwnFact`, including that it no longer contains
   "isn't sold through Patina".
6. **`lead_time_weeks == 0` was refused with the wrong sentence** — the refusal stands (the safe
   direction) and the sentences split: `.dimensions` → *"We don't have this piece's size yet."*,
   `.leadTimeWeeks` → *"We don't have this piece's lead time yet."* Three tests updated to the
   sentence that is now true of each.
7. **`AskComposer.clientRequestId` lost idempotency for a non-uuid id** — changed. A product id that
   is not a uuid now derives a **stable** key (SHA-256 of the id, RFC-4122-shaped) instead of
   `UUID()`, so a second tap replays the same lead. `nonUUIDProductStillKeys` now asserts stability
   and distinctness rather than non-emptiness.
8. **The designer was "she" in fixed copy** — changed on both surfaces. `AskDesignerSheet.caption`
   takes the first name and reads *"Leah will see the piece, the price and the room."*, falling back
   to *"Your designer will see…"*; the Companion's row hint does the same. The app knows the name
   and does not know the gender. Test asserts no caption contains "She".

## MINORS — answered, not changed

3. **Intermediate commits do not compile** (`e02d27761` mounts `PurchaseActionBar` two commits
   before the file arrives). True, and not fixable without rewriting history that the reviewer has
   already read and the steward is about to merge. The branch tip compiles; the cost is bisect
   hostility inside one lane's six commits. Recorded rather than repaired.
9. **`Buy — $4,200.00` vs the mock's `Buy — $4,200`.** Kept with cents. Every other money surface in
   the app prints cents (`PatinaCurrency.format`), M5a's own money row prints cents, and a bar that
   rounds beside a sheet that does not is the drift this program exists to remove.
10. **`get_direct_order_terms` is called twice per piece** — once for the sold-by block on the
    screen, once inside the sheet. Kept: the sheet is presented over a screen it does not own and
    cannot assume the caller read the terms; the call is one row, cached for the sheet's life
    (`hasLoadedTerms`), and threading it through a sheet initialiser to save one RPC would tie the
    sheet to one presenter.
11. **The poll stops on sheet dismissal.** Kept, and now more visible rather than less: dismissing
    mid-`.confirming` reports `order_checkout_returned {outcome: abandoned}` (minor 1), so the case
    is measurable instead of silent. A poll that outlives its sheet would settle a screen nobody is
    looking at, and C2's Ordered list is where that order is answered.

---

## Gate

Run in the C1 worktree, foreground, unsandboxed.

```
$ apps/mobile/Patina/scripts/ios-gate.sh build
** BUILD SUCCEEDED **

$ xcodebuild test -project …/agent-dr-w5-c1/apps/mobile/Patina/Patina.xcodeproj \
    -scheme Patina -configuration Debug \
    -destination 'platform=iOS Simulator,id=38B7C735-6911-4E7A-B8B8-0273BACA59AB' \
    -derivedDataPath …/agent-dr-w5-c1/.build/dd -only-testing:PatinaTests
✔ Test run with 1337 tests in 149 suites passed after 4.386 seconds.
** TEST SUCCEEDED **        (exit 0; re-run after the sign-in fix below, same result)
```

No `ios-gate.sh all`, no `lint-delta` — both are the steward's on the integration branch.

## Sim check

Clone `dr-w5-c1` `38B7C735-6911-4E7A-B8B8-0273BACA59AB`. Signed build from
`.build/dd/Build/Products/Debug-iphonesimulator/Patina.app` (`codesign -dv` → `Identifier=cloud.patina.app`,
`Signature=adhoc`), launched `-DeploymentTarget local -PatinaFlags direct-orders` and once without
the flag. Every frame from `xcrun simctl io <udid> screenshot`; every tap from blitz with the
explicit udid. No `screencapture`. Shots `w5-c1-14` … `w5-c1-20`, ledger rows under `## w5-c1`.

| Shot | What it proves |
|---|---|
| `14` | R3 still holds after the round: `client@patina.dev` → `Ask Leah to source this`, no Buy anywhere |
| `15` | Minor 8: the Path B caption reads **"Leah will see the piece and the price."** — the name, no pronoun, and no room promised to a client with no rooms |
| `16` | The guest's Buy meets the wall titled **"Sign in to order"**; `select count(*) from direct_orders` = 1 before and 1 after (the row is W1's, from the first walk) |
| `17` | Minor 4: flag off, guest taps **"Ask about this piece"** → the wall is titled **"Sign in to ask"**, not "Sign in to order" |
| `18` | M3: with `shipping_flat_cents = 18000` the sheet prints `Piece $4,200.00` · `Delivery $180.00` · **`Total $4,380.00`** |
| `19` | M1 did not over-tighten: the signed-in designer-less client still draws `Buy — $4,200.00` once the projects fetch answers |
| `20` | The sign-in defect below, fixed: signing in **at the wall** flips the bar to Buy without a relaunch |

**A defect the walk found, and this round fixed.** Signing in through the wall left the bar on
`Ask about this piece` for the rest of the session. `.task` had already run — as a guest, where the
relationship is knowable without any fetch, so nothing was asked — and nothing re-asks when a
session lands. `ProductDetailView` now watches `AuthService.shared.isAuthenticated` and re-resolves.
Server-side proof for `20`: one `auth.sessions` row for `w5c1-discovering@patina.test` created
inside the five minutes before the frame.

**Local data touched, and restored.** `products.shipping_flat_cents` on
`a0000000-…-0001` was set to `18000` for shot `18` and set back to NULL immediately after (verified
by re-select). The simulator keychain was reset twice to reach a guest. No new `direct_orders` row
was written by this round — the count was 1 at the start and 1 at the end.

## Claim level

**compile-green + sim-verified.** Unchanged from the first round, and for the unchanged reason: the
local `STRIPE_SECRET_KEY` is the 32-char placeholder, so no real Checkout page opens locally and the
honest capture past `Continue to payment` is the Patina-voice failure. No device claim; Apple Pay
untouched.
