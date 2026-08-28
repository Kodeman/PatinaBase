# W5 · lane C1 — adversarial review

Reviewer: separate context, read-only. Nothing in the C1 worktree, the main checkout or any
database was modified; no `git` write ran anywhere; no build was started (the gate writes to the
shared DerivedData and the reviewer's role is read-only).

**Under review:** `daily-return/w5-c1` `fddb4a0ba`, six commits over `daily-return/w5-d`
`ee784a83c` — 37 files, +3,819 / −71.

```
246671f89 feat(ios): the buyability gate, the act matrix, and the direct-order rail
71f6e94d1 feat(ios): the purchase flow — order sheet, hand-off, ask sheets, Order placed
e02d27761 feat(ios): the piece screen carries its act, the sold-by line, and the wall
14c0cf5e8 feat(ios): the Companion's piece row performs the piece's own act
f1d6ce898 feat(ios): AppRoute.orderDetail — the case, and the switches it forces
fddb4a0ba feat(ios): PurchaseActionBar and PieceActChannel
```

Read for this review, in full: `source/build-plan.md` (Global constraints + W5),
`source/rulings-2026-08-27.md` (R3, Q5, Q6, Q11), `source/direction-b.md` §5,
`mock/fragments/b-M3*.html`, `b-M5a/b/c.html`, `b-M7.html`, `waves/w5/steward.md` (§4–§6 owned-file
map + money rules), `waves/w5/c1-tasks.md`, `research/01-shot-ledger.md` `## w5-c1`, and — because
the findings turn on them — `supabase/migrations/00540_direct_orders_attribution.sql`,
`supabase/functions/create-checkout-session/index.ts`, and lane C2's branch
`daily-return/w5-c2` `c0a695d51`.

## ⚠ Two process facts, stated before the findings

1. **The report handed to this reviewer is not C1's.** The brief's `commits` /`gate`/`notes` block
   describes `CompanionHearthView.swift`, `CompanionSafeArea.swift` and
   `CompanionSheetDriverTests.swift` (`39f632086`, `4888a34d0`, `ee377b670`) — the W5 **a11y**
   lane's work, on `daily-return/w5-a11y`. Those shas exist in the shared `.git` but are **not**
   ancestors of `daily-return/w5-c1`. Everything below is judged against the C1 diff itself.
2. **There is no C1 report and no C1 gate evidence on disk** — `waves/w5/` holds `c1-tasks.md` but
   no `c1-report.md`/`c1-notes.md`. So this review cannot confirm that
   `ios-gate.sh build` or `xcodebuild test -only-testing:PatinaTests` was run, or what it returned.
   The lane's **walk** evidence is unusually strong and specific (`research/01-shot-ledger.md`
   §`## w5-c1`, 13 shots, four accounts, server-side row counts) and is treated as real; the unit
   tier's greenness is **unverified**. Fable should ask C1 for the gate line before merging.

---

## BLOCKING

### B1 — Both C1 and C2 mint `AppRoute.orderDetail`, and their `orderId` means different things. "See your order" tells a paying customer his order does not exist.
**Severity: blocking · Confidence: high (both branches read; both cases quoted below).**

C1 `App/Coordinators/Coordinator.swift:114`:

```swift
case orderDetail(orderId: String)          // C1: a bare direct_orders uuid
```

C2 `App/Coordinators/Coordinator.swift` (branch `daily-return/w5-c2`):

```swift
case orderList
/// `orderId` is a PREFIXED token — `"fulfillment:<uuid>"` / `"direct:<uuid>"`
/// (`ClientOrder.id`). Two rails are two tables, and a bare uuid cannot say which one.
case orderDetail(orderId: String)
```

Three consequences, in order of how badly they bite:

- **After the steward merges**, C1's `OrderPlacedView` hands `order.id` (a bare
  `direct_orders` uuid) to `coordinator.navigate(to: .orderDetail(orderId:))`
  (`ProductDetailView.swift`, `onSeeOrder`). C2 resolves it with
  `OrdersService.order(withId:) { orders.first { $0.id == id } }` against prefixed ids, so the match
  fails and `OrderDetailView` draws its empty state: **"We couldn't find that order — It may have
  been refunded, or it belongs to another account."** to the person who paid ninety seconds ago.
  That is a false sentence on the money rail (C5), reached by the single most likely tap on M5c.
- The fix is not "prefix it `direct:`" either: C2's merge keys a settled direct order onto
  `"fulfillment:<uuid>"` once intake mints the fulfillment row, which is exactly the state a
  just-settled order is racing toward. The hand-off wants a lookup **by direct-order id across both
  rails** (C2's `ClientOrder.directOrderId` already carries it), not a string cast.
- **On the C1 branch alone**, `.orderDetail` dispatches to `workDocumentsDestination(for:)` in both
  `ContentView.swift:409` and `HouseFirstRoot.swift:340`, whose `default:` returns
  `EmptyView() // unreachable`. So today "See your order" pushes a blank screen titled "Order".
  C1's own comment says the arm "belongs to the order lane" — which is true, and is why minting the
  case here was the wrong call (see B2).

Also mechanical: both lanes edited `Coordinator.swift`, `RouteTabTable.swift`, `ContentView.swift`,
`HouseFirstRoot.swift`, `AppCoordinator.swift`, `CompanionContext.swift`,
`CompanionContextProvider.swift`, `CompanionViewModel.swift`, `CompanionAPIClient.swift`,
`CompanionActionRows.swift`, `CompanionAreaBuilders.swift`, `RouteTabTableTests.swift` and
`CompanionActionMatrixTests.swift`. The merge is a duplicate-declaration compile error plus two
route-count assertions that disagree (C1 raises the pinned totals to 36/18; C2 adds two more cases).
This is steward work and it must happen before either lane lands.

### B2 — Out-of-map edits: the router files the steward reserved to *neither* lane, three of them undisclosed
**Severity: blocking (process; it is the direct cause of B1) · Confidence: high.**

`waves/w5/steward.md` §6 "Shared / contested — steward-arbitrated, nobody edits unilaterally":

> `App/Coordinators/Coordinator.swift` and the route→tab table (**neither lane**; if an order route
> is needed, C2 asks)

C1 edited both, and also `ContentView.swift`, `HouseFirstRoot.swift` and `AppCoordinator.swift`,
which appear in no lane's map. `c1-tasks.md` §"Disclosed out-of-map edits" names Coordinator,
RouteTabTable, the four Companion files, the two test files and CompanionOverlay — it does **not**
name ContentView, HouseFirstRoot or AppCoordinator. The rule the steward wrote ("A lane that needs a
file outside its map **asks the steward**; it does not edit and disclose afterwards") was the
mechanism that would have caught B1 before either lane wrote a line.

Nothing here is malicious and every edit is small and mechanical. It is blocking only in the sense
that the steward now has to arbitrate the collision rather than rubber-stamp two clean branches.

### B3 — `payment_processing` (409) is unmapped, so an order with a bank transfer in flight is told "Nothing has been charged."
**Severity: blocking · Confidence: high (both sides read; the invoice rail's correct copy is four
files away).**

`create-checkout-session` returns 409 `{ error: 'payment_processing', detail: … }` on the
**direct-order** branch when a completed session still points at a not-yet-paid order
(`index.ts:1228-1237`, guarded by the direct payable's own `hasInFlightPayment`, `:664-675`, whose
`processingDetail` reads *"A bank transfer for this order is already processing…"*).

`OrderCheckoutError.from(code:detail:)` (`Features/Purchase/OrderFailureCopy.swift:38-47`) has no
`payment_processing` case, so it falls to `.unavailable`, whose sentence is:

> **"We couldn't start this payment. Nothing has been charged."**

That is false in exactly the window it fires in — an ACH debit is settling, or a card cleared and
the webhook has not landed — and it invites the reader to tap again, which is the double-charge the
server guard exists to prevent. The invoice rail already holds the right sentence and the reasoning
behind it (`Features/Money/MoneyFailureCopy.swift:55-67`, `CheckoutError.paymentProcessing` →
*"A payment on this invoice is already going through. We'll update this as soon as it clears."*).
One case and one sentence closes it; the `MoneyFailure` type is already shared.

---

## MAJOR

### M1 — R3's client-side guard rests on `hasLoaded`, which is true when the *projects* fetch is the one that failed
**Severity: major · Confidence: high on the code path; medium on how often it fires.**

`ProductDetailView.relationshipIsResolved` (`:66-72`) reads
`BadgeCountService.shared.hasLoaded && DesignRequestStatusService.shared.hasLoaded`.
`BadgeCountService.refresh()` (`Services/Badges/BadgeCountService.swift:152-173`) fires five
independent `try?` fetches and then:

```swift
if decisions != nil || summaries != nil || proposals != nil
    || invoices != nil || fetchedProjects != nil {
    hasLoaded = true
```

`hasLoaded` therefore means *"at least one of five queries answered"*, not *"the projects answer
arrived"*, and `apply(...)` keeps the **previous** value for a nil fetch — which on a cold launch is
`[]`. So a signed-in client with an active project, on a session where decisions/invoices answer and
`ProjectsAPIClient.listProjects()` alone fails, resolves to `.none`, `relationshipIsResolved ==
true`, and — flag on, gate passing — **draws `Buy — $4,200.00`**. That is the precise breach the
lane already caught once on the simulator and fixed for the *timing* case (round-2 defect 1); the
*partial-failure* case is the same hole one step over.

The honest predicate is "the projects fetch answered" (and, for the lead half, DRS's, which already
stays `false` on failure — safe). `BadgeCountService.lastRefreshFailed` exists but is set only when
**all five** fail, so it does not close this either. Because R3 is the wave's hard rule and the
failure direction is toward Buy rather than away from it, this deserves a fix rather than a note.

### M2 — the guest-wall test asserts nothing; the guard it claims to pin is untested
**Severity: major (test integrity) · Confidence: high.**

`OrderHandoffTests.aGuestNeverReachesCreate` builds a machine, never calls `begin`, then asserts
`phase == .idle` and `created.value == 0`. It would pass with the guard deleted, with
`ProductDetailView` deleted, with the whole wall deleted. The real guard is
`ProductDetailView.performPrimaryAct`'s `guard AuthService.shared.isAuthenticated else { presented
= .authWall; return }` and has no test at all.

The **behaviour** is nonetheless verified — walk shot `w5-c1-05` records
`select count(*) from direct_orders` at 0 before and 0 after the guest's tap — so this is a hole in
the pinning, not in the app. Worth saying plainly in the record so a later refactor does not read
the green test as cover.

### M3 — with freight on the piece, the sheet shows two rows and never the number the session will charge
**Severity: major · Confidence: high on the code; medium on intent (the mock has no freight case).**

`OrderSheetContent.make` emits `Piece` (= `unit × qty`) and, where
`products.shipping_flat_cents > 0`, a `Delivery` row — and no total. 00540 folds freight into
`amount_cents`, so the figure Stripe will take (`DirectOrder.amountCents`, and its own
`formattedTotal`, which the sheet never prints) is only obtainable by the reader adding two rows.
The money rule the brief states is "the sheet prints the session's real total"; today it prints the
session's real *components*. `OrderSheetCopyTests.sheetPrintsTheOrdersOwnFigure` even computes
`order.formattedTotal == "$8,580.00"` and then asserts only the `$8,400.00` row — the total is
tested and not rendered.

Locally this is invisible (`shipping_flat_cents` is NULL on all seven buyable rows, per C1's own
ground-truth table), which is exactly why it will ship unnoticed.

### M4 — `OrderPlacedView.summaryLine`'s `taxShippingEnabled` branch is unreachable from the app
**Severity: major · Confidence: high.**

The view calls `Self.summaryLine(order)` with the defaulted `taxShippingEnabled: false`, and
`ProductDetailView` holds a resolved `terms` it does not pass. So when the server setting is ON —
the only world where Path A completes at all — M5c drops the mock's *"· total with delivery and
tax"* clause. `OrderSheetCopyTests.orderPlacedSummaryBranches` asserts a branch production cannot
reach. Under-claiming rather than over-claiming, so it is not a C5 breach; it is a dead parameter
and a test that guards nothing. Pass `terms.taxShippingEnabled` through.

---

## MINOR

1. **`order_checkout_returned` carries no `{outcome}`** (`OrderHandoff.checkoutDismissed`, only
   `order_id`), though `c1-tasks.md` §10 and the wave brief both name the property. Confidence high.
2. **`PatinaTests/PurchaseActionBarTests.swift` was never written**, though task §7 names it. Its
   assertions live in `PieceActMatrixTests` (`liveRelationshipNeverProducesBuy` checks
   `primaryLabel` over the whole matrix), so coverage exists; the task list is what is now untrue.
   Confidence high.
3. **Intermediate commits do not compile**: `e02d27761` mounts `PurchaseActionBar` in
   `ProductDetailView`; the file arrives two commits later in `fddb4a0ba`. Bisect-hostile only.
   Confidence high.
4. **The auth wall says "Sign in to order" for Path C too.** `performPrimaryAct`'s
   `.askAboutPiece` arm raises `AuthSheet(title: "Sign in to order")`; a guest who tapped
   *"Ask about this piece"* is told to sign in to order something. Confidence high.
5. **`.noSellerOfRecord`'s sentence over-claims.** "This piece isn't sold through Patina." is drawn
   whenever `patina_managed != true`, but the server also sells any piece whose vendor carries
   `is_patina_catalog`. The gate's comment defends the *refusal* correctly (catalog rows are forced
   managed by `products_catalog_requires_management`, verified at `00152:104`) — but a studio-layer
   row on a catalogue vendor is refused with a sentence that is not true of it. "We can't sell this
   piece through the app yet" is the honest one. Confidence high; occurrence rare.
6. **`lead_time_weeks == 0`** is refused client-side ("We don't have this piece's size and lead time
   yet") where the server accepts it (`00540` tests `IS NULL` only). Safe direction, inaccurate
   sentence. Confidence high.
7. **`AskComposer.clientRequestId` silently loses idempotency for a non-uuid product id** —
   `UUID(uuidString: product.id) ?? UUID()` mints a fresh key per call, so two taps would write two
   leads. Only reachable for synthetic/preview ids today; the test
   (`nonUUIDProductStillKeys`) asserts non-emptiness rather than stability, which reads as cover it
   is not. Confidence high.
8. **The designer is "she" in fixed copy** — `AskDesignerSheet.caption` and the Companion row hint
   ("She'll see the piece, the price and the room"). It is the mock's own wording (`b-M7.html`), so
   this is a spec inheritance, not a lane invention; flagged because the app knows the designer's
   name and does not know their gender. Confidence high, severity low.
9. **`Buy — $4,200.00` vs the mock's `Buy — $4,200`** on the bar (M5a's money row does use cents).
   Nit. Confidence high.
10. **`get_direct_order_terms` is called twice per piece** — once in `ProductDetailView.task` for
    the sold-by block, once in `OrderSheet.task`. Harmless, one extra RPC.
11. **The poll stops on sheet dismissal** (`OrderSheet.onDisappear { handoff.stopPolling() }`), so a
    reader who swipes the sheet away during `.confirming` sees the settle only via C2's Ordered
    list. Defensible; worth stating in the wave record.

---

## What was checked and is right

Recorded so Fable does not re-derive it.

- **R3, no Buy for a live client — one act site, and it holds.** `PieceActResolver.act` returns
  `.askDesigner` on `relationship.isLive` **before** consulting the flag or the gate
  (`PieceAct.swift:110-114`). A grep across `apps/mobile/Patina/Patina` for `\.buy(`, `isBuy`,
  `"Buy`, `Buy —` and `PieceActResolver.act` finds exactly one resolution site
  (`ProductDetailView.act(for:)`) and one mirror (`CompanionActionProvider.pieceActRow`, which
  reproduces `act.primaryLabel` verbatim and dispatches `.performPieceAct` back into the same
  `performPrimaryAct`). No secondary "Buy it myself", no disclosure line for those clients.
  `liveRelationshipNeverProducesBuy` asserts it over relationship × piece × flag; the walk shows it
  on glass for both live shapes (`w5-c1-01` project, `w5-c1-13` lead).
- **The gate mirrors the server and defers to it.** `BuyabilityGate.evaluate` asks 00540's six
  questions in 00540's order; `refusal(fromServerMessage:)` prefix-matches the four
  `not_buyable:<field>` codes plus 00276's two shipped sentences, and an unrecognised message maps
  to `.unknown` and renders Patina's own words. The client is *stricter* in two places (M-6 above
  and requiring `patina_managed`), never looser — the safe direction.
- **The 16-column contract is exact.** `DirectOrder.selectColumns` matches 00540 §1b's
  `GRANT SELECT (…)` list column-for-column and order-for-order; there is no `select=*` anywhere on
  `direct_orders`; `commission_rate` is absent from the Swift type entirely, which is the right
  answer given the RPC masks it on the returned copy and the ACL withholds it on the read.
- **The tax branch and Path A's kill switch.** `taxShippingEnabled == false` (its default, and the
  local truth) ⇒ *"Delivery and tax are not included yet."*, `isPrimaryEnabled == false`, and the
  reason printed under a disabled act — so `begin()` cannot be reached at all. `.unknown` terms
  (RPC unreadable) resolve the same way. Critique M14 satisfied; walk shots `07` (off) and `08`
  (toggled on, then restored) show both.
- **No vendor or system sentence reaches a homeowner.** `detail` is decoded, logged under `#if
  DEBUG` and dropped in both `OrderCheckoutError.from` and `DirectOrdersAPIClient.mapCreate`;
  `MoneyFailureCopy.log` is reused rather than re-cut. Walk shot `09` is the 502 on the placeholder
  key showing *"We couldn't start this payment. Nothing has been charged."* with Stripe's
  `Invalid API Key provided: sk_test_…` nowhere on screen — the W0 leak, closed on this rail.
  (B3 is the one gap in this otherwise clean discipline, and it is a *wrong* Patina sentence rather
  than a leaked server one.)
- **The guest writes nothing.** The wall precedes the machine, `begin` is never called, and the walk
  proves it server-side (0 `direct_orders` rows before and after the tap, `w5-c1-05`).
- **The hand-off reuses the invoice pattern**: `SFSafariViewController` via the existing
  `SafariView`/`IdentifiableURL`, poll-on-dismiss at 3 s / 60 s, `MoneyFailure` +
  `MoneyFailureCopy`, `FunctionsError.httpError` decoded the same way `InvoicesAPIClient` decodes
  it. No `PaymentSheet`, no Stripe SPM dependency, no wallet promised — "Payment opens securely in
  Safari." is the only wallet-adjacent sentence (C15 / G2 respected).
- **No painted tracker.** M5c prints *"We'll email you when it ships."*; the mock's "Notify me"
  control is drawn only as a **statement** and only where push authorization is already granted
  (read via `notificationSettings()`, which cannot consume Q7's one ask).
- **The credited inset is server-led.** It draws only from `order.designerId` on the row
  `create_direct_order` returned, never from a client-side resolution, and the copy drops "on your
  project" because the only client who can reach it is a roster client with no project — which is
  true rather than merely careful.
- **Path C's shape** matches `00314`: `p_project_type == "single_piece"` (via
  `DesignServiceType.furniturePlacement`, whose raw value is `single_piece`), empty scan set,
  `client_request_id` = the product's own uuid so `(homeowner_id, client_request_id)` makes the
  duplicate-lead failure structurally impossible, and the description names the piece.
- **Path B** goes into the shared thread through `DesignerThreadOpener` (project thread where a
  project exists, direct thread on a lead), body carries piece · price · maker · room, and the
  caption no longer promises a room the message does not carry.
- **Companion:** piece rows only, ≤ 6 rows and exactly one suggested row at every tier (asserted),
  and the row performs the screen's act through `PieceActChannel` instead of a lookalike.
- **Hygiene:** six pathspec commits, no `git add -A` residue, no `Secrets.swift`, no
  `Patina.xcodeproj`, no pushes, Conventional Commit subjects, canonical names throughout.
- **Not applicable to this lane:** the Record's `orderMoved` honesty (C2 owns the producer;
  `HouseRecord.swift` is untouched here).

---

## Recommended disposition

Return to C1 for a fix round on **B3**, **M1**, **M3**, **M4** and minors 1/4/5/6/7 — all small and
all inside C1's own files. **B1/B2 are the steward's**: decide who owns `AppRoute.orderDetail` (the
map says C2 asks for it), settle the `orderId` contract on C2's prefixed token *or* on a
direct-order-id lookup across both rails, and have the losing lane drop its copy of the case and the
route-count assertions before the integration merge. Ask C1 for its gate line while that happens.
