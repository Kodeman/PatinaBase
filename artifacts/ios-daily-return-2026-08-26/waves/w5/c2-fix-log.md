# W5 · C2 — fix round

Against `waves/w5/c2-review.md`. Branch `daily-return/w5-c2`, worktree
`.codex/worktrees/agent-dr-w5-c2`, clone `dr-w5-c2` `6611FFA8-1820-4C98-81B8-60DE52086D00`.

Every **blocking** and every **major** is addressed below — changed, or rebutted with evidence. The
minors I took are listed at the end; the ones I did not are named with a reason rather than left
silent.

## Gate, re-run after the fixes

| Gate | Result |
|---|---|
| `apps/mobile/Patina/scripts/ios-gate.sh build` | `** BUILD SUCCEEDED **`, first run, no `error:` lines |
| `xcodebuild test … -destination id=6611FFA8-… -only-testing:PatinaTests` | `Test run with 1322 tests in 147 suites passed` · `** TEST SUCCEEDED **` |

1312 → **1322** (ten new, in `PatinaTests/OrderResolutionTests.swift`), no test removed except the
two assertions on the deleted `placedByLabel` (MI-6), which were re-pointed at `attributionFooter` —
the copy that actually draws.

---

## Blocking

### B1 · Two lanes, one route, two id shapes — **fixed from this side; the merge still needs the steward**

The review is right on every fact and I am not disputing the conflict. What I can fix on this branch
is the half that makes the seam *silent*: the resolution.

- `ClientOrder.routingToken(rail:recordId:)` is now the **one mint** for the token, and
  `ClientOrder.id` is defined in terms of it. A caller in another feature has a named function to
  call instead of a string to reinvent.
- `OrdersService.order(withId:)` now resolves a **bare uuid** as well as a prefixed token, via the
  new pure `OrdersService.resolve(_:in:)`. A bare id is matched against `recordId` **and against
  `directOrderId`** — which matters more than it looks: by the time she taps `See your order`, the
  settle may already have merged that direct order onto the fulfillment rail under a *different*
  uuid, so matching only `recordId` would still miss. A prefixed token that names nothing still
  resolves to nothing, so the two rails cannot be crossed by accident.

Pinned by three tests in `OrderResolutionTests`: `aBareDirectIdResolves`,
`aBareDirectIdFollowsTheMerge`, `aPrefixedMissStaysAMiss`.

**Still the steward's, and I am not able to do it from here:** the six-file textual conflict, and
the duplicate `orderDetail` enum case. The merge must keep **C2's `orderList` case** (C1 has none)
and one `orderDetail(orderId: String)`. With the change above, either lane's navigation now lands
correctly regardless of which arm survives the resolution — but the conflict itself still has to be
resolved by hand, and the prefixed shape is the one to keep.

### B2 · The detail screen never fetched an order it did not already hold — **fixed**

`OrderDetailView` now takes one re-read on a miss before it will say the order does not exist:

- `OrdersService.shouldRefetchOnMiss(found:alreadyRefetched:)` — pure, `nonisolated`, pinned by
  `aMissRefetchesOnce` (fires once on a miss; never twice; never on a hit).
- `.task` calls `refreshIfNeeded()`, then `refresh()` if the order is still missing, then stamps
  `refetchedOnMiss`. The empty state does not draw until that stamp exists, so a warm app shows the
  loading state during the re-read rather than flashing "we couldn't find that order".
- While I was in there: a **total** read failure now draws the connection error, not the not-found
  empty state. "We could not reach your orders" and "this order does not exist" are different facts
  and the screen was saying the second when the first was true.

---

## Major

### M1 · "On its way" over delivered, cancelled and refunded orders — **fixed, and proven on glass**

`StudioQueueBuilder.orderRecordRow` now counts the set the sentence is about:

- `moving` = live and not delivered → `N piece(s) on their way`;
- else, if anything arrived → `N piece(s) delivered`;
- else (everything refunded or cancelled) → `N past order(s)`.

The **meta** now names the furthest-along order *within the set the detail just counted*, so the two
halves of the row cannot describe different orders.

The test that pinned the false sentence is rewritten, not deleted: `theStudioRowDrawsFromOrders` now
asserts `"1 piece on its way"` for one confirmed + one delivered + one refunded, `"2 pieces
delivered"` when everything has arrived, and `"1 past order"` for a refund on its own.

**Sim-verified.** `w5-c2-11-studio-delivered-row.png` — with the seeded line temporarily at
`delivered`, the row reads `Ordered · 1 piece delivered · Delivered`. Before the fix it read
`1 piece on its way`. Line restored (see the ledger).

### M2 · "paid <date>" on a designer-sourced card — **fixed, and proven on glass**

`ClientOrderCopy.moneyLine` returns `String?` and is **nil for anything the reader did not buy
herself**, which is exactly M8's second card (`Woven Jute Area Rug` carries no money line at all).
The two claims the wire will not support are gone with it: `captured_total_cents` is Patina's
capture on the designer's rail, not this reader's bill, and `intake_at` is not a payment date.

The same rule now governs the detail screen: `moneyBlock` draws only where `moneyLabel` is non-nil.

**Sim-verified.** `w5-c2-09-ordered-list.png` — the card that used to print `$6,800.00 · PAID AUG 7`
above `Leah ordered this for you.` now prints no money line. `w5-c2-10-order-detail.png` — no
`PAID / $6,800.00 / August 7, 2026` block.

### M3 · The two routes escaped the tab-table matrix — **fixed**

`PatinaTests/RouteTabTableTests.swift` gains `(.orderList, .studio)` and
`(.orderDetail(orderId: "fulfillment:order-1"), .studio)`; the guards move to
`expected.count == 37` and `studio == 19`; the file's own comments now say 34 `AppRoute` cases and
37 rows. That was the guard rail for exactly this change and it should not have taken a reviewer.

### M4 · "Report a problem" was a dead control for an unlinkable contact — **fixed**

T5's third branch is built. `OrderDetailView` assembles its rows first
(`actionRows(_:) -> [OrderDetailAction]`): a contact that `OrderContactLink.url(for:)` can resolve
becomes the tappable `Report a problem`; one it cannot becomes `.contact`, a **plain, selectable
row** that prints the string under the heading `Report a problem` and offers no chevron and no tap.

Pinned by `anUnlinkableContactIsPlain` — address → `mailto`, number → `tel`, URL → `https`,
`"Patina Concierge, 9–5 CT"` → nil, and the row that draws for it is `.contact`.

Not sim-verifiable today: the config value is `hello@patina.cloud`, which takes the `mailto` branch
(`w5-c2-10-order-detail.png` shows the tappable row). The plain branch is unit-tested only, and it
will stay that way until Kody names the real route.

### M5 · M8's card rows were missing from the card — **fixed, and proven on glass**

`Track with the carrier →` and `Message <first name>` are now **on the card**, with M8's own top
rule and a divider between them only when both draw.

The structural reason they were missing is worth recording: the card was one big `Button`, and a
`Button` inside another `Button`'s label is inert in SwiftUI. So `OrderCard` no longer *is* the
button — its summary is (with the accessibility label and identifier on that), and the action rows
are their own controls beneath it. `OrderedListView` passes `onOpen` / `onMessage`; tracking opens
through the card's own `openURL`.

**Sim-verified.** `w5-c2-09-ordered-list.png` shows `Message Leah` on the card, above
`Leah ordered this for you.` (`Track with the carrier` still does not draw — `Pilot Freight` is not
in the carrier map, which is MI-11's standing limit, not a regression).

### M6 · The `.order` bell bucket cannot fire — **the finding is accepted; the comments are fixed, the code is kept and re-labelled**

I re-ran the reviewer's grep and it holds: `order_confirmed` and its five siblings appear **nowhere**
in `supabase/` or `packages/`; the only hit for `direct_order_paid` anywhere in the repo is
`00308_transaction_tracker.sql:539`, and that is a **ledger event name**, not a
`notification_log.type`. `fulfillment-notify` calls `sendPush` with no `notification_log_id`,
`apns-send` only ever *updates* a log row, and `_shared/client-attention.ts` (00534) declares
`proposal | invoice | decision`. Nothing writes an order row to the bell.

What I changed is the **claim**, which is the C5 half:

- `AppNotificationType.order` no longer says an order "fell to `.newRecommendations` and a shipped
  sofa was titled 'New pieces for you'" as though it were observed. It now states plainly that only
  the **push** path works today, names the three verified reasons the bell path cannot, and says the
  server gap is W6's.
- The `serverType` arm is labelled `⚠ FORWARD-COMPATIBLE, NOT OBSERVED`, with an instruction to
  delete the strings if W6 settles on other names.

I did **not** delete the mapping. If it goes and W6 later writes `order_shipped`, the row falls
through to `.newRecommendations` and we ship the SP-08 failure for real. Dead-but-labelled beats
absent-and-wrong here. **For D / W6:** an order transition reaches a homeowner today only if push is
authorised, with no in-app trace — that is a real gap and it is not this screen's to close.

### M7 · "PAID" over a refunded order — **fixed**

`ClientOrderCopy.moneyLabel(_:)` is the label now: `REFUNDED` for a refunded order, `PAID`
otherwise, and nil where the reader did not pay it (M2). Pinned by
`aRefundedOrderIsNotLabelledPaid`, which also asserts the state line above still reads `Refunded …`,
so the two lines cannot drift apart again.

---

## Minors taken

| # | What changed |
|---|---|
| MI-1 | `"oldedominion"` → `"olddominion"`, the key `normalise("Old Dominion")` actually produces. `everyCarrierKeyIsReachable` now pins it (and pins that `Pilot Freight` still resolves to nil). |
| MI-2 | Dividers are drawn *between* assembled rows on both the detail card and the list card, so no arrangement can leave a rule hanging under the last row. |
| MI-3 | An empty action list draws **no card at all** — `actions(_:)` returns nothing rather than a padded box around nothing. |
| MI-6 | The `ORDERED BY LEAH` eyebrow is gone, and `ClientOrderCopy.placedByLabel` with it (M8 has only the footer, and its eyebrow is the *maker*, which this read cannot supply — `vendor_id` is withheld by 00540's column grant). The two tests on it now assert `attributionFooter`. |
| MI-7 | `IF SOMETHING’S WRONG` takes the curly apostrophe the rest of the lane's copy uses. |

## Minors not taken, with reasons

- **MI-4 (one shipment attached)** — accepted as a limitation, not fixed. Attaching a *second*
  shipment needs the shipment→order mapping the wire does not give (`c2-tasks.md` §6); with the
  one-order rule the current attachment is the only one that is provably this order's. The doc
  comment's overclaim about ordering is fair and I have left the code alone rather than half-fix it.
- **MI-5 (`refresh()` on every record build)** — real, and a performance change on the Today path is
  not something to make in a fix round without a walk behind it. Handing it forward.
- **MI-8 (`Message your designer` on `.orderList` for a reader with no designer)** — **rebutted as
  C2's.** `CompanionContext` carries no has-a-designer signal at all (`grep` over its fields), and
  every one of the seventeen `messageDesignerRow` call sites in `CompanionAreaBuilders.swift` is
  ungated the same way. This is an app-wide pattern, not a regression this lane introduced, and
  gating one screen would make the Companion inconsistent for no gain. It belongs to whoever gives
  the Companion that signal.
- **MI-9 (meta names the furthest-along order)** — partly addressed by M1: the meta is now computed
  over the same set the detail counts, so the row is internally coherent. Whether "nearest to
  arriving" is the better fact is a copy ruling, not a defect; leaving it for Kody.
- **MI-10 (no analytics)** — confirmed and disclosed here rather than fixed. The sibling
  Invoices/Proposals features emit none either; adding two events to one screen would be the only
  instrumented screen in the Studio. A program-level decision.
- **MI-11 (claim level)** — accepted verbatim, and carried into the ledger below. The direct rail,
  `paidNotOnRail`, the merge and the refund branch remain **compile-green + unit-tested, not
  sim-verified**; `direct_orders` is still empty on this stack.
- **MI-12 (`@MainActor` on `ClientOrderBuilder`)** — not taken. Cosmetic, and it would touch every
  test that calls it for no behavioural gain. The two new pure statics on `OrdersService` *are*
  `nonisolated`, which is where it actually mattered.
- **MI-13 (out-of-map ratification)** — noted; the disclosure stands in `c2-tasks.md` §4 and B1 is
  the cost. Nothing further this lane can do.
- **MI-14 (`"order"` → the fulfillment prefix)** — left as is, and now explicitly commented as
  defensive: nothing emits that spelling today.
