# W5 · lane C1 (the piece's acts and the purchase flow) — task list

Written before any code. Base `daily-return/w5-d` `ee784a83c` · branch `daily-return/w5-c1` ·
worktree `.codex/worktrees/agent-dr-w5-c1` · simulator clone `dr-w5-c1`
`38B7C735-6911-4E7A-B8B8-0273BACA59AB`.

Sources read in full before writing this: `source/build-plan.md` (Global constraints + W5),
`source/rulings-2026-08-27.md` (R3, Q5, Q6, Q11), `source/direction-b.md` §5 + §11 M3/M5/M7/M8,
`source/direction-a.md` §5, `research/2x-panel-u3.md` §3–§7, `research/12-backend-reality.md`
§4–§5 + §12, `research/17-gap-fills.md` G2/G3, `source/build-plan-critique.md` M3/M14/M15,
`waves/w5/steward.md` (owned-file map, money rules, RPC inventory), `waves/w5/d-fix-log.md`
contract, `mock/fragments/b-M3.html`, `b-M3.sheet.html`, `b-M5a.html`, `b-M5b.html`, `b-M5c.html`,
`b-M7.html`, `research/02-steward-boot.md` §4–§8.

---

## Ground truths this list is built on (verified, not quoted)

| Fact | Evidence |
|---|---|
| `create_direct_order(p_product_id, p_quantity)` RETURNS `public.direct_orders`, `commission_rate` masked to NULL on the returned copy | `00540:384-548` |
| Refusal codes are prefix-matchable strings raised by the RPC | `00540:452-461` + `00276`'s three shipped ones |
| `authenticated` holds a **16-column** SELECT grant on `direct_orders` — `select=*` is a 42501 | `00540:131-138` |
| `get_direct_order_terms()` returns exactly one row; `tax_shipping_enabled` is **FALSE** locally | `00540:294-320`, `fulfillment_config` seed |
| Every `layer='catalog'` row is forced `patina_managed = TRUE` | D's schema note; 7 of 19 catalog rows pass the gate locally (verified by query) |
| `shipping_flat_cents` is NULL on all 7 → no Delivery money row locally | psql |
| `DesignerRelationship` + `DesignerRelationshipResolver` exist (W1a). C1 **reads**, never writes | `Core/State/DesignerRelationship.swift` |
| `leads.client_request_id` is unique per `(homeowner_id, client_request_id)` → the product's own UUID is a safe idempotency key | `00285:77-79` |
| `submit_design_request` has **no** product parameter — Path C names the piece in `p_description` and keys idempotency on the product id | `00314:25-34` |
| Checkout error codes: `direct_order_not_found` · `_already_paid` · `_canceled` · `_refunded` · `nothing_due` · `stripe_error` · `stripe_not_configured` | `create-checkout-session/index.ts:556-593,761,1361` |
| `InvoicesViewModel` poll = 3 s interval / 60 s deadline, started on Safari dismiss | `InvoicesViewModel.swift:100-160` |
| Six switches over `AppRoute` are exhaustive with no `default:` — adding a case forces them | `Coordinator.displayName`, `RouteTabTable.tab(for:)`, `CompanionContextProvider.screenItems`, `CompanionContext.contextSummary`/`.contextIcon`, `CompanionViewModel.screenIdentifier`, `CompanionAPIClient.screenIdentifier` |

---

## Tasks

Each task: failing test → run → implement → run → pathspec commit.

### 1 — `BuyabilityGate` (the client mirror; the server stays authoritative)
- **Test** `PatinaTests/BuyabilityGateTests.swift`: a fully-specced `patina_managed` piece passes;
  each missing field refuses with its own case; `deleted_at` refuses; a non-`patina_managed` piece
  refuses (the client cannot see `vendors.is_patina_catalog`, so it will not assert a seller of
  record it has not been told about); every server refusal string maps to its case by prefix,
  including the three shipped `00276` sentences; an unrecognised server message maps to the
  catch-all and **never** renders the server's words.
- **Implement** `Features/Purchase/BuyabilityGate.swift`.

### 2 — the act matrix (`PieceAct` / `PieceActResolver`)
- **Test** `PatinaTests/PieceActMatrixTests.swift`: relationship × flag × gate.
  `isLive` (lead **or** project) → `.askDesigner` with the designer's first name, **at every flag
  and gate combination** — the R3 pin, and the "no Buy for a live client" test the brief names.
  Not live + flag on + gate passes → `.buy(priceCents:)`. Not live + flag **off** → `.askAboutPiece`
  with **no** reason (a flag is not a fact about the piece). Not live + gate fails → `.askAboutPiece`
  carrying the gate's plain sentence. `.roster` is **not** live → Buy draws.
- **Implement** `Features/Purchase/PieceAct.swift`.

### 3 — `DirectOrdersAPIClient` + the row/terms models
- **Test** `PatinaTests/DirectOrderContractTests.swift`: the PostgREST select names its sixteen
  columns and contains no `*` (a `select=*` is a 42501 under 00540 §1b); `DirectOrder` decodes a
  real row shape; `DirectOrderTerms` decodes the one-row RPC array and decodes a
  missing/NULL paragraph to `nil` + `taxShippingEnabled == false`; `isSettled` is true only for
  `paid`.
- **Implement** `Core/Models/DirectOrder.swift`, `Core/Network/DirectOrdersAPIClient.swift`
  (`create_direct_order` RPC · `get_direct_order_terms` RPC · `create-checkout-session
  {direct_order_id}` · poll-by-id).

### 4 — the order sheet's copy and money rows
- **Test** `PatinaTests/OrderSheetCopyTests.swift`: money rows are `Piece` + (Delivery only when
  `shipping_flat_cents > 0`); the tax/delivery line is
  "Delivery and tax are added at payment. You'll see the full total before you pay." **only** when
  the server says `tax_shipping_enabled`, else "Delivery and tax are not included yet." and the
  primary act is **disabled** carrying that reason (critique M14 — Path A stays off); sold-by is
  "Sold and shipped by Patina." for `patina_managed`, "Sold by <maker>, <town>." otherwise; the
  responsibility paragraph and contact come from the terms RPC and the block is absent when the
  config holds nothing; "Payment opens securely in Safari." is present; the credited inset is
  **absent** until the server names a designer.
- **Implement** `Features/Purchase/OrderSheetContent.swift` (the pure content model) +
  `Features/Purchase/OrderSheet.swift` (the view, drawn on the `AddToRoomSheet` pattern).

### 5 — `OrderHandoff` (the state machine)
- **Test** `PatinaTests/OrderHandoffTests.swift`: idle → creating → (designer on the created row)
  → `attributing` → checkout → awaitingPayment → confirming → placed; with no designer the
  `attributing` step is skipped; a create refusal lands `.failed` with a **Patina sentence** and
  the server's words appear nowhere; a checkout 502 (`stripe_error`) lands `.failed` with
  "We couldn't start this payment. Nothing has been charged."; the poll settles on `paid` and
  times out to `.unconfirmed` with "We haven't seen this payment yet. We'll update this as soon as
  it clears."; a guest never reaches `creating` (the wall comes first and nothing is written).
- **Implement** `Features/Purchase/OrderHandoff.swift`, `Features/Purchase/OrderFailureCopy.swift`
  (delegates to the existing `MoneyFailureCopy` for `CheckoutError` and its logger).

### 6 — Path B and Path C sheets
- **Test** `PatinaTests/AskSheetsTests.swift`: the Path B message names the piece, the price and
  the room when there is one, and omits the room clause when there is not; the thread is the
  project thread where a project exists and the direct thread where the relationship is a lead
  (reusing `DesignerThreadOpener`); Path C's `SubmitDesignRequestParams` carry
  `client_request_id == the product's own UUID` (one lead per client per piece, never a duplicate),
  `project_type == "single_piece"`, an empty scan set, and a description naming the piece.
- **Implement** `Features/Purchase/AskDesignerSheet.swift`,
  `Features/Purchase/AskAboutPieceSheet.swift`, `Features/Purchase/AskComposer.swift`.

### 7 — the piece screen's action bar and the M3 blocks
- **Test** `PatinaTests/PurchaseActionBarTests.swift`: the bar's primary label per act
  ("Ask Leah to source this" / "Buy — $4,200.00" / "Ask about this piece"), the ghost act stays
  "Add to room", and **no `Buy` label is producible for a live relationship** (the pin, asserted
  over the whole matrix); the gate-failed variant prints the reason under the primary; the sold-by
  + responsibility block draws from the terms.
- **Implement** `Features/Purchase/PurchaseActionBar.swift`; mount it in
  `Features/ProductDetail/Views/ProductDetailView.swift`, extend the screen's one `Presented`
  enum in `ProductDetailBlocks.swift`.

### 8 — `OrderPlaced` (M5c) + the order route
- **Test** in `OrderSheetCopyTests`: "Order placed." + the total + the piece + "We'll email you
  when it ships." — **no** painted step rail, and **no** "Notify me" row unless push authorization
  has already been granted.
- **Implement** `Features/Purchase/OrderPlacedView.swift`; add `AppRoute.orderDetail(orderId:)`
  (C2 renders it) and carry it through the six exhaustive switches.

### 9 — the Companion's piece-context row
- **Test** in `PatinaTests/PieceActMatrixTests.swift`: the `.pieceDetail` menu's act row mirrors
  the bar's act, and the menu stays ≤ 6 rows at every tier (`CompanionActionMatrixTests` already
  asserts the ceiling for every route in its list — `.orderDetail` is added to that list).
- **Implement** `Features/Companion/Services/CompanionActionRows.swift` +
  `CompanionAreaBuilders.swift` + the `SpecialAction` case and its dispatch;
  `Features/Purchase/PieceActChannel.swift` is the seam that hands the act back to the piece
  screen.

### 10 — analytics
- The sheets' events, fired through the existing `PostHogService.capture`:
  `piece_buy_tapped` · `piece_ask_designer_tapped` · `ask_designer_sent {has_room}` ·
  `order_sheet_shown` · `order_created` · `order_checkout_opened` ·
  `order_checkout_returned {outcome}` · `order_settled` · `order_failed {reason}`.
  `reason` is the **refusal code**, never a server sentence.

### 11 — gate, sim check, ledger
- `apps/mobile/Patina/scripts/ios-gate.sh build` (twice if the first fails on `GitCommit.swift`).
- `xcodebuild test … -only-testing:PatinaTests -destination id=38B7C735-…` — the whole tier green.
- A **signed** simulator build (not `CODE_SIGNING_ALLOWED=NO`) installed on the clone; shots to
  `shots/w5-c1-NN-*.png`; ledger rows under `## w5-c1`.
- Sim script: `client@patina.dev` (live → Ask Leah, no Buy) · `james.okafor@example.com` (live →
  Ask Leah) · guest → Buy → the C9 auth wall, nothing written · an account with no designer → Buy
  → order sheet → the act as the server's terms leave it.

---

## Disclosed out-of-map edits (forced, minimal, mechanical)

Adding `AppRoute.orderDetail(orderId:)` — which the brief assigns to C1, with C2 rendering it —
breaks six deliberately-exhaustive switches. Each gains one arm and nothing else:
`App/Coordinators/Coordinator.swift`, `Features/Navigation/RouteTabTable.swift`,
`Features/Companion/Services/CompanionContextProvider.swift`,
`Features/Companion/Models/CompanionContext.swift`,
`Features/Companion/ViewModels/CompanionViewModel.swift`,
`Services/Companion/CompanionAPIClient.swift`, plus the route lists in
`PatinaTests/RouteTabTableTests.swift` and `PatinaTests/CompanionActionMatrixTests.swift` so the
new route does not escape the pinned matrices. `Features/Companion/Views/CompanionOverlay.swift`
gains one arm for the piece-act special action.

## Round 2 — what the simulator changed (added after the walk, not backdated)

Three defects the unit tier could not have caught, all found on the device and all now pinned by a
test:

1. **R3 breached on glass.** `client@patina.dev` — three active projects — was offered
   `Buy — $4,200.00`. The screen resolved the relationship once in `.task`, before
   `BadgeCountService` had loaded, and an unresolved relationship reads `.none`, which is the one
   value that draws Buy. The relationship is now computed in `body` (so the services' refresh
   re-resolves it) and `PieceActResolver` takes `relationshipIsResolved`: unresolved falls to
   Path C, never to Buy. Pinned by `unresolvedRelationshipNeverBuys` and
   `liveWinsEvenWhenUnresolved`.
2. **The answer never arrived at all for a deep-linked session.** With (1) fixed, a signed-in
   discovering client who lands straight on `patina://piece/<id>` sat on Path C for the whole
   session, because nothing on that screen asks the two services to refresh. `ProductDetailView`
   now asks when it has no answer.
3. **The Path B caption promised a room that was not in the message.** "She'll see the piece, the
   price and the room" drew for a client with no rooms.
   `AskDesignerSheet.caption(hasRoom:sent:)` branches; pinned by
   `captionNeverPromisesARoomThatIsntThere`.

Plus one layout collision the walk caught: the Companion's 44 pt corner mark clipped the ghost act
to `Add to ro…`. The bar now stops short of the mark.

## Known limits, stated up front

- `direct_orders.tax_shipping_enabled` is **FALSE** on this stack, so the sheet's primary act is
  correctly disabled and Path A does not complete. The handoff past that point is proven by unit
  test, and by one deliberate, restored local config toggle for the failure capture the brief asks
  for — recorded in the ledger.
- `STRIPE_SECRET_KEY` is the 32-char placeholder (steward §2), so a real Checkout page cannot open
  locally. The honest capture is the Patina-voice failure, not a Stripe page.
- The local edge runtime container is **Exited**; it is restarted (not reset) before the sim check.
- Claim level: **compile-green + sim-verified**. No device claim; Apple Pay is untouched (it is
  already inside the hosted Checkout — G2).
