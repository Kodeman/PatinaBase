# W5 · C2 — adversarial review

Reviewer: separate context, read-only. Branch `daily-return/w5-c2` @ `c0a695d51`, four commits off
`daily-return/w5-d` @ `ee784a83c`. Read against `source/build-plan.md` (Global constraints + W5),
`source/rulings-2026-08-27.md` (R3/Q5/Q6/Q11), `source/direction-b.md` §5 + §11 M7/M8 (+ the M8
fragment), `source/direction-a.md` §5, `research/2x-panel-u3.md`, `research/12-backend-reality.md`,
`research/17-gap-fills.md`, `source/build-plan-critique.md` M3/M14/M15, `waves/w1b/d-notes.md`,
`waves/w2/integration.md`, `waves/w4/integration.md` + `walk.md`, `waves/w5/steward.md` §6,
`waves/w5/c2-tasks.md`, and the migrations / edge functions the lane cites.

---

## 0. A note on the brief I was handed

**The report block in my brief is C1's, not C2's.** It names commits
`246671f89 / 71f6e94d1 / e02d27761 / 14c0cf5e8 / f1d6ce898 / fddb4a0ba`, the worktree
`.codex/worktrees/agent-dr-w5-c1`, the simulator `38B7C735-…`, and 1325 tests — none of which is
this lane. C2's branch carries four commits (`16df0b855 · 0abbb0515 · addae6da3 · c0a695d51`) and its
clone is `6611FFA8-…`.

So I had **no gate claim to check** for C2. I re-ran the gate myself rather than review on trust:

| Gate | Result |
|---|---|
| `apps/mobile/Patina/scripts/ios-gate.sh build` | `** BUILD SUCCEEDED **`, first run, no `error:` lines |
| `xcodebuild test -project Patina.xcodeproj -scheme Patina -destination id=6611FFA8-1820-4C98-81B8-60DE52086D00 -only-testing:PatinaTests` | `Test run with 1312 tests in 146 suites passed` · `** TEST SUCCEEDED **` |

Hygiene, verified unsandboxed: `git status --porcelain -uno` **empty**; every file in the diff is
under `apps/mobile/Patina/` (30 files, 2559 insertions); `.writer.lock.d` released; nothing pushed;
`Core/State/DesignerRelationship.swift` untouched (frozen this wave, correctly).

Sim evidence exists and is real — `research/01-shot-ledger.md` `## w5-c2`, seven shots, all from
`xcrun simctl io`, no `screencapture`, with the temporary line-state change disclosed and restored
and the trigger re-enable verified. That ledger is honest about its own limits, which I credit
below and also count against the lane's coverage (§4, MI-11).

---

## 1. What holds

Checked, not assumed:

- **R3 is not touched by this lane, and cannot be.** `git diff … | grep -i buy` over the whole C2
  diff returns no control, no label, no `FeatureFlags.isOn(.directOrders)` read. Ordered is
  deliberately unflagged, and §5 of `c2-tasks.md` argues that correctly: M8's second card is a piece
  *Leah* bought, which exists with the flag off. Sim-proven — `w5-c2-05-flag-off-studio.png`.
- **No painted tracker.** `ClientOrderState.drawsRail` is false for `paidNotOnRail`, `cancelled` and
  `refunded`; both the card and the detail gate `OrderRail` on it; `OrderStateDerivationTests`
  ("only the four real steps draw a rail") pins it. The `paidNotOnRail` copy is
  `Paid <date>. We'll email you when it ships.` — the money rule verbatim.
- **Q6's derivation is the minimum line stage, in one place, never a text column.** `intake|split`
  and the two operator stages fold to `Confirmed`, `settled` to `Delivered`, an unknown stage maps
  to `nil` rather than a guess. Thirteen tests, including "a cancelled line does not drag the order
  backwards" and "lines further along do not lend their dates to the state below them".
- **The record's `orderMoved` honesty is right, and is the best-argued part of the branch.**
  `.confirmed` and `.paidNotOnRail` never draw — placing an order is the reader's own act — and a
  movement the wire will not date does not draw at all rather than being stamped "now".
  Sim-proven twice: `w5-c2-01-today.png` (`Meadow Linen Sectional shipped. · AUG 24`, the real
  `line_state_entered_at`) and `w5-c2-06` after a deliberate line-state change (`arrived. · AUG 28`).
- **`commission_rate` is never requested.** I diffed both column lists against 00540's grants:
  `ClientDirectOrder.selectColumns` is 15 of the 16 granted columns (`client_id` omitted as the
  filter), `RemoteFulfillmentOrderItem.selectColumns` is exactly the 11 left to `authenticated`.
  Direction B §5 discloses *that* a commission exists, never its size; the wire cannot leak it here.
- **No vendor or system error text reaches the reader.** Every read goes through
  `OrdersService.fetch`, which swallows to `PatinaLog.sync.error` and returns nil; the screens print
  `We couldn't reach your orders. Check your connection and try again.` The PostgREST body is never
  rendered. Same discipline in the designer-embed 400 retry.
- **The two-rail merge key actually holds where it matters most.** I chased this because
  `designer_attribution` is stamped **only** when `order.designer_id` exists
  (`create-checkout-session/direct-order.ts:196-206`) — which is never true for R3's primary case, a
  client with no designer. The fallback is fine: `stripe-webhook/index.ts:1189-1191` stamps
  `direct_orders.stripe_payment_intent_id` on the paid transition, and
  `fulfillment_orders.stripe_payment_intent_id` is `UNIQUE` and is the intake's own dedupe key
  (`00350:71`). So a settled no-designer direct order merges to one row and does not double-count.
- **The shipment→order gap (§6 of `c2-tasks.md`) is real, correctly degraded, and reported rather
  than faked.** I verified the policy shape: `fulfillment_shipments` is scoped by
  `fulfillment_po_belongs_to_caller(po_id)`, and `fulfillment_vendor_pos` has no client policy, so
  no readable path maps a PO to an order. Attaching only when the client has exactly one
  fulfillment order is the honest degradation, and it is pinned by two tests. **This is a correct
  finding and belongs in D's backlog, not C2's.**
- **The route is placed, not defaulted.** `RouteTabTable.tab(for:)` has no `default:`; both new
  cases are placed on `.studio`, and both roots render them. `CompanionActionMatrixTests.allRoutes`
  gains both, so the six-row ceiling still covers them.
- **Naming discipline with C1 was observed** — `ClientDirectOrder` / `OrderResponsibilityTerms`
  against C1's `DirectOrder` / `DirectOrderTerms`. No symbol collision at integration.

---

## 2. Blocking

### B1 · The purchase flow's terminal CTA dead-ends after integration — two lanes minted the same route, with two different id shapes
**Severity: blocking · Confidence: high (both branches read).**

The steward's map (§6, "Shared / contested") says `Coordinator.swift` and the route→tab table are
**neither lane's; if an order route is needed, C2 asks**. Both lanes went ahead independently:

- C2 `0abbb0515` adds `case orderList` **and** `case orderDetail(orderId: String)`;
- C1 `f1d6ce898` adds `case orderDetail(orderId: String)` — with its own comment, its own
  `displayName`, and its own arms in the same six switches
  (`AppCoordinator`, `ContentView`, `HouseFirstRoot`, `RouteTabTable`, `CompanionContext`,
  `CompanionAPIClient`), plus `RouteTabTableTests` and `CompanionActionMatrixTests`.

That is a guaranteed textual conflict in six files, and a duplicate enum case if a merge resolves it
carelessly. That part is merely painful. The part that is a defect is the **semantic divergence**:

- C2's `orderId` is a **prefixed token** — `ClientOrder.id` = `"fulfillment:<uuid>"` /
  `"direct:<uuid>"` — and `OrderDetailView` resolves it with `service.order(withId:)`, an exact
  string match.
- C1 navigates with a **bare uuid**: `OrderPlacedView.swift:80` →
  `onSeeOrder(order.id)` → `ProductDetailView.swift:216` →
  `coordinator.navigate(to: .orderDetail(orderId: orderId))`, where `order` is `DirectOrder` and
  `DirectOrder.id` is the raw `direct_orders` id (`Core/Models/DirectOrder.swift:30`).

After integration, `Order placed.` → **`See your order`** lands on
`We couldn't find that order. It may have been refunded, or it belongs to another account.` — the
one screen a person reaches straight off a $4,200 charge. Neither lane's tests catch it because the
seam does not exist on either branch alone.

**Fix belongs to integration, and it should be C2's shape** (the prefix is the right call — two
rails are two tables): C1 passes `"direct:\(order.id)"`, or the token is minted by one named helper
both lanes call. Whoever resolves the conflict must also keep C2's `orderList` case, which C1 does
not have.

### B2 · `OrderDetailView` never fetches an order it does not already hold
**Severity: blocking · Confidence: high (code-read; no test covers it).**

`OrderDetailView.task { await service.refreshIfNeeded() }`, and
`refreshIfNeeded()` is `guard !hasLoaded else { return }`. `OrdersService` is a
session-lifetime singleton, and `hasLoaded` is set by the *first* load — which happens on Today
(`DailyRoomViewModel`) and on the Studio hub (`StudioHubViewModel`) before a reader ever opens an
order. So on any warm app:

- an **order push** (`entity_type: 'fulfillment_order'` — the one this lane wired) routing to an
  order minted since that load renders the not-found empty state;
- the just-placed direct order from B1's flow renders it too, even once B1's prefix is fixed,
  because the row was created seconds ago and `hasLoaded` is already true.

`OrderedListView` is insulated (its two feeders call the full `refresh()`), so this is the detail
screen alone. **Fix:** when `order(withId:)` misses, call `refresh()` once before drawing the empty
state — and only then say it cannot be found.

---

## 3. Major

### M1 · The Studio row calls delivered, cancelled and refunded orders "on their way" — and a test pins it
**Severity: major (C5) · Confidence: high.**

`StudioQueueBuilder.orderRecordRow` builds its detail from `orders.count` — every order, whatever
its state — over the copy `"1 piece on its way"` / `"N pieces on their way"`. The `live` filter that
drops refunded and cancelled is applied only to the **meta**. So a client whose single order was
refunded reads `Ordered · 1 piece on its way`, and a delivered order stays "on its way" forever.

`OrderRoutingTests.theStudioRowDrawsFromOrders` asserts exactly that:

```swift
let refundedOnly = StudioQueueBuilder.orderRecordRow([order("c", .refunded)])
#expect(refundedOnly?.detail == "1 piece on its way")
```

A false sentence pinned by a test is worse than an unpinned one. The count should be of live,
not-yet-delivered orders, with its own copy when the remainder is delivered or refunded.

### M2 · The card says "paid <date>" on a designer-sourced order, dated by the intake and priced by the capture
**Severity: major (C5) · Confidence: high (code + walk shot).**

`ClientOrderCopy.moneyLine` prints `"\(amount) · paid \(DateDisplay.short(placed))"` for every card,
and on a fulfillment row with no direct order behind it —
i.e. **exactly the piece the designer bought** —
`amountCents = order.captured_total_cents` and `placedAt = order.intake_at`.

Two claims the wire does not support. `intake_at` is when the order reached the rail, not when
anybody paid. And a client whose designer sourced a piece is billed on the invoice rail; Patina's
capture total on `fulfillment_orders` is not necessarily the figure that person paid, or paid *for
that piece*.

M8 agrees, and the implementation departs from it: the mock's designer-sourced card
(`Woven Jute Area Rug 8x10 / Studio Piet / rail / Leah updates this as it moves. /
Message your designer / Leah ordered this for Aspen Loft Refresh.`) carries **no money line at
all** — the price line belongs only to the card the reader bought. The walk shot confirms the
delivered behaviour: `w5-c2-03-ordered-list.png` prints `$6,800.00 · PAID AUG 7` above
`Leah ordered this for you.`

Suggested: `moneyLine` draws only for `placedBy == .reader`, or on the designer rail prints the
amount without the word "paid" and without the intake date.

### M3 · The two new routes escape the tab-table matrix that exists to catch them
**Severity: major (test integrity) · Confidence: high.**

`PatinaTests/RouteTabTableTests.swift` holds a hand-maintained `expected` list of
(route → tab) pairs with `#expect(Self.expected.count == 35)` and `#expect(studio == 17)`. C2 added
`.orderList` and `.orderDetail` to `RouteTabTable.tab(for:)` and **did not add them to that list**.
The suite still passes because the assertions count the stale list, and the file's own comment
("32 `AppRoute` cases") is now wrong by two.

That file's whole purpose is that a new route cannot slip past the tab table unexamined. It slipped.
(C1 did update it — which is also part of B1's conflict surface.)

### M4 · "Report a problem" is a dead control for any contact that is not an address, a number or a URL
**Severity: major · Confidence: high.**

`OrderDetailView.actions` draws the row whenever `service.terms?.reachableContact != nil`, but the
tap goes through `OrderContactLink.url(for:)`, which returns nil for anything that is not
`http(s)://`, an `@`-bearing token, or ≥10 digits — and `reach(_:)` then does nothing at all. The
lane's own `c2-tasks.md` T5 specified the third branch — *"otherwise the string printed plainly"* —
and it was not built.

Today's config value is `hello@patina.cloud`, so the walk could not see it. Direction B §5 makes
this contact a **gate condition on Path A** and says Kody names the real route; the moment that value
becomes "Patina Concierge, 9–5 CT" the screen offers a tappable row that silently does nothing.
Either print the unlinkable contact as text (T5's own rule) or do not draw the row.

### M5 · M8's card rows are missing from the list
**Severity: major (spec) · Confidence: high.**

M8's cards carry `Track with the carrier →` and `Message your designer` **on the card**, and
`c2-tasks.md` T4 restates both ("`Track with the carrier →` only where a shipment is attributable
(§6); `Message <first name>` only where the order is attributed"). `OrderCard` has neither — both
live only on the detail screen. The list is a tappable card so nothing is unreachable, but the
screen M8 specifies as *the* answer to "where is it" now needs a second tap to reach the tracking
number, and the lane shipped less than its own task list without flagging the cut.

### M6 · The `.order` notification bucket cannot fire in the bell
**Severity: major · Confidence: high (edge-function + migration read, plus a repo-wide grep).**

The push half is right and is the valuable half: `fulfillment-notify/core.ts:265` sends
`entity_type: 'fulfillment_order'`, and `NotificationRouter` + `AppNotificationType(entityType:)` now
handle it. The bell half is speculative:

- `fulfillment-notify` calls `sendPush` **without** a `notification_log_id`, and `apns-send` only
  *updates* a log row when given one (`apns-send/index.ts:217-238`) — it never inserts. So no bell
  row is written for an order at all.
- `_shared/client-attention.ts` — the one sanctioned way an edge function writes a bell row (00534) —
  declares `AttentionEntityType = "proposal" | "invoice" | "decision"`. No order.
- The `serverType` strings the lane added — `order_confirmed`, `order_in_production`, `order_shipped`,
  `order_delivered`, `order_eta_change`, `order_substitution`, `direct_order_paid` — appear
  **nowhere** in `supabase/` or `packages/` (grep, zero hits). They are invented.

The comment claims the change stops "a shipped sofa titled 'New pieces for you'". Nothing today can
put a shipped sofa in the bell, so the claim is unearned. Harmless code; a C5 problem in the comment,
and a real gap for D or W6: an order transition currently reaches a homeowner only if push is
authorised, with no in-app trace.

### M7 · "PAID" over a refunded order's amount
**Severity: major (C5) · Confidence: high.**

`OrderDetailView.moneyBlock` prints the label `PAID` unconditionally. For a `.refunded` order the
state line above says `Refunded Sep 20.` and the money block below says `PAID · $4,200.00 ·
September 3, 2026`. M8's states row is explicit that a refunded order reads `Refunded Sep 20`; the
label should follow the state.

---

## 4. Minor

| # | Finding | Confidence |
|---|---|---|
| MI-1 | `CarrierTracking.templates` key `"oldedominion"` is a typo — `normalise("Old Dominion")` is `"olddominion"`, so that key can never match. (`"odfl"` still covers the abbreviation, so the row degrades to not-drawing, which is the safe direction.) | high |
| MI-2 | `OrderDetailView.actions` emits a hanging divider when a row is the last one drawn: tracking-only, or attributed-only, both append a `divider` with nothing after it. The `productId` arm gates its divider correctly; the two above it do not. | high |
| MI-3 | If none of the four rows draws, `actions(_:)` still lays down a padded `Background.secondary` card around nothing. | medium |
| MI-4 | `attachShipments` attaches exactly one shipment. Furniture orders ship in parts; with two shipments on one order the card's `Shipped <date>` and tracking are one of them, silently. The doc comment ("the most recently created shipment") is a property of `shipments()`'s `created_at.desc` ordering, not of this pure function — a test could pass an unordered array and the comment would be false. | medium |
| MI-5 | `DailyRoomViewModel` awaits a full `OrdersService.refresh()` — four PostgREST reads — on **every** record build, on the Today path, ahead of the saved-piece fetch. `refresh()` (not `refreshIfNeeded()`) is right for freshness and wrong for the one screen this whole program is about; consider letting the record build without it and folding the rows in when they land, as the story task does. | medium |
| MI-6 | The card's eyebrow `ORDERED BY LEAH` and its footer `Leah ordered this for you.` say the same thing twice on one card. M8 has only the footer. | high |
| MI-7 | `MonoLabel(text: "IF SOMETHING'S WRONG")` uses a straight apostrophe where the rest of the lane's copy uses `’` (`We couldn’t reach your orders`, `We couldn’t find that order`). | high |
| MI-8 | The Companion's `orderItems` suggests `Message your designer` on `.orderList` for a reader who bought directly and has no designer — the one tier Path A exists for. `projectItems` has the same shape, but there a designer is implied. | medium |
| MI-9 | `orderRecordRow`'s meta names the **furthest-along** order across the whole list, so `Ordered · 3 pieces… · Delivered` can head a group whose other two are only Confirmed. The nearest-to-arriving is arguably the more useful fact. | medium |
| MI-10 | M8's screen sheet names `order_status_opened` and `order_track_tapped`; the branch emits no analytics at all. Consistent with the sibling Invoices/Proposals features (which emit none either), so a spec gap rather than a regression — but `c2-tasks.md` did not disclose the cut. | high |
| MI-11 | **Claim level.** Sim-verified covers the *designer* rail only. The lane's own ledger says `direct_orders` was empty on the stack, so `paidNotOnRail`, the two-rail merge, the refund branch and the whole direct rail are **compile-green + unit-tested, not sim-verified**; `Track with the carrier` likewise (the seeded carrier `Pilot Freight` is not in the map — correctly, and it means the row has never drawn). Honest reporting; it should carry into the wave record so nobody reads §1's shots as covering Path A. | high |
| MI-12 | `ClientOrderBuilder` is `@MainActor` for a set of pure static functions, which forces `@MainActor` onto every test that touches them. Cosmetic. | high |
| MI-13 | Out-of-map edits: seven paths beyond the steward's five for C2 (`Coordinator`, `RouteTabTable`, `ContentView`, `HouseFirstRoot`, `StudioQueue{Builder,Models}`, `DailyRoomViewModel`, `NotificationsAPIClient`, `CompanionAreaBuilders`), all disclosed in `c2-tasks.md` §4 — plus the two the map explicitly reserved (see B1). Disclosure was correct; **ratification was not obtained**, and B1 is the cost. | high |
| MI-14 | `NotificationRouter` maps the bare spelling `"order"` to the *fulfillment* prefix. Defensible and documented, but if anything ever emits `entity_type: 'order'` for a direct order it lands on a token that cannot resolve. | low |

---

## 5. Verdict

The core of this lane is good work and, on the parts I could check independently, honest: the state
machine is derived and never stored, the record refuses to report the reader to himself, the copy
never promises a tracker the rail has not entered, the column lists are pinned against 00540's
narrowed grants, no server text reaches a homeowner, and the one gap in the wire was found, named,
degraded safely and handed back rather than papered over. Fifty-nine new tests, and the gate is
green — I re-ran both halves myself.

It should not merge as it stands. **B1** and **B2** together mean the purchase path's last screen —
`Order placed.` → `See your order` — does not work end to end after integration, and B1 additionally
guarantees a six-file conflict with C1 that the steward must resolve deliberately, not
mechanically. **M1**, **M2** and **M7** are three separate sentences the app would say to a
homeowner that are not true, one of them pinned by a test; on a money rail those are the findings
this program exists to catch. **M3** means the guard rail for exactly this kind of change was left
un-updated.

Recommended: one fix round back to C2 for M1–M5 and M7 and the minors it accepts; B1 resolved at
integration by the steward with both lanes' agreement on the token shape (C2's prefix is the right
one); B2 fixed by C2; M6 handed to D as a backlog item alongside the `fulfillment_vendor_pos`
one-liner from `c2-tasks.md` §6.
