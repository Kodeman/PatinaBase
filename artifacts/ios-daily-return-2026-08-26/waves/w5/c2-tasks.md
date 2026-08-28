# W5 · C2 — Ordered, over both rails, and the order's return loop

Written before any code, from `source/build-plan.md` (Global constraints + W5),
`source/rulings-2026-08-27.md` (R3/Q5/Q6/Q11), `source/direction-b.md` §5 + §11 M8 (+ M3/M5/M7 for
the seam with C1), `source/direction-a.md` §5, `research/2x-panel-u3.md`, `research/12-backend-reality.md`,
`research/17-gap-fills.md`, `source/build-plan-critique.md` M3/M14/M15, `waves/w1b/d-notes.md`,
`waves/w2/integration.md`, `waves/w4/integration.md` + `walk.md`, and D's contract as delivered on
`daily-return/w5-d` (`ee784a83c`).

Base: `daily-return/w5-c2` off `daily-return/w5-d` @ `ee784a83c`.
Simulator clone: `dr-w5-c2` = `6611FFA8-1820-4C98-81B8-60DE52086D00`.

---

## 0. What the wire actually gives me (read first, before the first line)

Verified in this worktree, not quoted from the plan.

| Fact | Where | Consequence for C2 |
|---|---|---|
| `direct_orders` table GRANT to `authenticated` was withdrawn and re-issued as **16 named columns**; `commission_rate` is **not** among them | `00540:131-138` | my read **names its columns**. `select=*` is a 42501 for every client. |
| `fulfillment_order_items` table GRANT to `authenticated` likewise narrowed to **11 named columns** (`unit_cost_cents`, `vendor_id`, `vendor_sku`, `mapping_state`, `po_line_id` withheld) | `00540:973-977` | same — named columns, and the cost side never reaches the app. |
| `fulfillment_orders` keeps its full table GRANT; new policy `client_profile_id = auth.uid()` | `00540:933-936` | readable, `order_no` included. |
| `fulfillment_shipments` policy is `fulfillment_po_belongs_to_caller(po_id)` | `00540:946-949` | ⚠ **see §6 — the shipment carries `po_id` and nothing else the client can read; there is no client-readable `po → order` mapping.** |
| `fulfillment_orders.designer_attribution` carries `{source, direct_order_id, project_id}` — set **only when the order had a designer** | `create-checkout-session/direct-order.ts:201-206` | usable as a secondary merge key; `stripe_payment_intent_id` is the primary one, present on both tables and on both rails. |
| `get_direct_order_terms()` returns exactly one row, always: `(responsibility_paragraph, contact, tax_shipping_enabled)`; today `contact = 'hello@patina.cloud'` (**placeholder — Kody names the real route**), `tax_shipping_enabled = false` | D's contract, `00540:294-320` | "Report a problem" prints the returned contact; when it is null the row does not draw rather than inventing "support". |
| `fulfillment-notify` pushes with `entity_type: 'fulfillment_order'` | `fulfillment-notify/core.ts:265` | the router's key is `fulfillment_order`, not `order`. Both are accepted. |
| the six client transitions are `confirmed · in_production · shipped · delivered · eta_change · substitution` | `_shared/fulfillment-templates.ts:38-49` | M8's copy contract. |
| `HouseRecordRow.Kind.orderMoved` already exists (`:32`), unproduced | `Features/Home/Models/HouseRecord.swift` | I write the **producer**, not the enum. |
| `AppRoute` has **no** order case; `RouteTabTable.tab(for:)` has no `default:` on purpose | `Coordinator.swift:52-112`, `RouteTabTable.swift:24-70` | adding the route is a deliberate, compiler-enforced ripple. Steward map says "if an order route is needed, C2 asks" — **the brief asked and answered it: `AppRoute.orderDetail(id)`.** |

---

## 1. Tasks

**T1 · `FulfillmentAPIClient`** — `Core/Network/FulfillmentAPIClient.swift` (new, my map).
Four reads, all `authenticated`, all column-named:
`fulfillment_orders` (client policy) with the designer embed + a 400-retry without it (the
`DecisionsAPIClient.decisions(matching:)` idiom — a naming surprise costs the designer's name, never
the orders); `fulfillment_order_items` by `order_id=in.(…)`; `fulfillment_shipments` (no filter —
the policy IS the filter); and `direct_orders?client_id=eq.<me>` with the sixteen granted columns.
Plus `orderTerms()` over the `get_direct_order_terms()` RPC.
**Naming discipline for the integration merge:** C1 owns `Core/Network/DirectOrdersAPIClient.swift`
and will declare its own direct-order types. Mine live in **my** file under distinct names
(`ClientDirectOrder`, `OrderResponsibilityTerms`) so the two lanes cannot collide on a symbol.

**T2 · `ClientOrder` + the two-rail merge** — `Features/Orders/Models/ClientOrder.swift` (new).
- `ClientOrderState`: `.paidNotOnRail · .confirmed · .inProduction · .shipped · .delivered · .cancelled · .refunded`.
- **Derivation (Q6, direction B §5): the order's state is the MINIMUM line stage**, never a text
  column. `intake|split` → `.confirmed`; `transmitted|acknowledged` → `.confirmed` (nothing the
  client is told changed — those are operator stages, and `fulfillment-templates` has no copy for
  them); `in_production` → `.inProduction`; `shipped` → `.shipped`; `delivered|settled` → `.delivered`;
  every line `cancelled` → `.cancelled`.
- **The merge key is `stripe_payment_intent_id`**, present on both tables, falling back to
  `designer_attribution->>'direct_order_id'`. A paid direct order that has reached the rail is ONE
  row, on the fulfillment rail, flagged `placedByReader`. A paid direct order that has not is one
  row in `.paidNotOnRail`. A fulfillment order with no direct order behind it is designer-sourced.
- `pending_payment` and `canceled` direct orders are **not** listed — an unpaid order is not an order.
- Sort: newest first by `placedAt` (`paid_at` / `intake_at`).

**T3 · Studio → "Ordered"** — `StudioQueueBuilder.swift` + `StudioQueueModels.swift`
(`orders` added last, defaulted `[]`, so the nine existing `StudioQueueInput(...)` call sites keep
compiling). Row `records.orders` in **Money & documents** per Option B's Studio contract, priority 0
(above Proposals), title `Ordered`, detail the count, meta the most advanced live state.
`StudioHubView.swift` needs **no** edit — the section renders rows generically and `open(_:in:)`
follows `row.route`.

**T4 · `OrderedListView`** — `Features/Orders/Views/OrderedListView.swift` (new). M8: header
`ORDERED` / `Your orders`; one card per `ClientOrder`; the four-step rail
(`Confirmed · In production · Shipped · Delivered`) drawn ONLY for an order on the fulfillment rail;
`.paidNotOnRail` prints **"Paid · we'll email you when it ships."** and **no rail at all** (no
painted tracker); `Track with the carrier →` only where a shipment is attributable (§6);
`Message <first name>` only where the order is attributed; footer `You ordered this.` /
`Ordered by <first name>` + `Leah ordered this for <project>.`

**T5 · `OrderDetailView`** — `Features/Orders/Views/OrderDetailView.swift` (new), on
`AppRoute.orderDetail(orderId:)`. The piece, the money (`$4,200.00 · paid Sep 3`), the state line,
`Track with the carrier`, `Message <designer>` when attributed, `Report a problem` → the
`get_direct_order_terms()` contact (`mailto:` when it parses as an address, `tel:` when it parses as
a number, otherwise the string printed plainly). The responsibility paragraph prints under it when
the config holds one. **No vendor or system error text ever reaches the reader** (C5) — every
non-2xx maps to Patina copy and the server body goes to `PatinaLog` only.

**T6 · The route** — `Coordinator.swift` (`orderList`, `orderDetail(orderId:)` + `displayName`),
`RouteTabTable.swift` (both `.studio`), `ContentView.swift` + `HouseFirstRoot.swift` (destinations),
`CompanionAreaBuilders.swift` (`studioItems` gains `.orderList, .orderDetail`), and every exhaustive
switch the compiler names. `orderId` is a **prefixed token** — `"fulfillment:<uuid>"` /
`"direct:<uuid>"` — because the two rails are two tables and a bare uuid cannot say which.

**T7 · The record's `orderMoved` producer** — `HouseRecord.swift` (`orders:` input, defaulted `[]`;
`RouteToken` gains `order`), `DailyRoomViewModel.swift` (passes what the orders service holds).
A row for `.inProduction` / `.shipped` / `.delivered` only, dated by the **real**
`line_state_entered_at` of the lines at that stage — never by "now", never by the intake.
**`.confirmed` and `.paidNotOnRail` never draw**: placing the order is the reader's own act, and the
Record does not report the reader to himself (B §2, the same rule that keeps a saved piece's own
save off the card).

**T8 · Notifications** — `NotificationRouter.swift` (`fulfillment_order`, `order`, `direct_order` →
`.orderDetail`), `AppNotification.swift` (an `.order` bucket with its own icon and title, so an
order does not arrive as "New pieces for you" — the SP-08 failure, again),
`NotificationsAPIClient.swift` (`AppNotificationType(entityType:)` + `(serverType:)`).

**T9 · Tests** — `PatinaTests/OrderStateDerivationTests.swift`,
`OrderRailMergeTests.swift`, `OrderRecordRowTests.swift`, `OrderRoutingTests.swift`; and
`CompanionActionMatrixTests.allRoutes` gains the two routes (hand-maintained by design).

---

## 2. Gate

`scripts/ios-gate.sh build` (twice if the first fails on `GitCommit.swift`), then
`xcodebuild test … -destination 'platform=iOS Simulator,id=6611FFA8-1820-4C98-81B8-60DE52086D00'
-only-testing:PatinaTests` — whole tier green. No `ios-gate.sh all`, no `lint-delta` (steward's).

## 3. Sim check

`-DeploymentTarget local -PatinaFlags direct-orders`, and once without the flag (Ordered is **not**
flagged — R3/`direct-orders` gates *Buy*, not "where is it"; a client whose designer bought her a
sofa must see it with the flag off, which is precisely M8's second card). Shots to
`artifacts/ios-daily-return-2026-08-26/shots/w5-c2-NN-*.png` via `xcrun simctl io … screenshot` only.

---

## 4. Out-of-map edits I will make, and why (steward/Fable disclosure)

The steward's §6 map gives C2 five paths. Six more are unavoidable and none of them is C1's:

| Path | Why | Collision risk with C1 |
|---|---|---|
| `App/Coordinators/Coordinator.swift` | the brief names `AppRoute.orderDetail(id)`; the map says "if an order route is needed, C2 asks" | none — C1's surfaces are sheets over `.pieceDetail` |
| `Features/Navigation/RouteTabTable.swift` | `tab(for:)` has no `default:` — a new case **must** be placed or the app does not compile | none |
| `ContentView.swift`, `Features/Navigation/HouseFirstRoot.swift` | both roots need the destination, or the route pushes an `EmptyView` | none |
| `Features/Profile/ViewModels/StudioQueue{Builder,Models}.swift` | the Ordered row is a Studio-queue row; the map gave me `StudioHubView.swift`, which turns out to need no edit at all | none — W5 assigns these to nobody |
| `Features/Home/ViewModels/DailyRoomViewModel.swift` | the record's builder needs the orders the producer consumes | none |
| `Core/Network/NotificationsAPIClient.swift` | `AppNotificationType(entityType:)` lives here, not in `Features/Notifications/**` | none |
| `Features/Companion/Services/CompanionAreaBuilders.swift` | C1 owns Companion **piece-context rows only**; mine are the two order screens in `studioItems` | low — different functions, different switch arms |

**Not done, deliberately:** no Ordered row is added to `.studio`'s own Companion list. C8's cap is
six rows *including* the provider's tail and `.studio` already sits at six for a guest
(`CompanionAreaBuilders.swift:218`). The Ordered door is the Studio hub's own row (T3), which is
where "where the Studio rows are" points.

---

## 5. `direct-orders` is NOT the gate on this screen

R3 and the plan gate **Buy** behind `FeatureFlags.shared.isOn(.directOrders)`. Ordered is the
*answer to "where is it"*, and M8's second card is a piece **Leah** bought — which exists with the
flag off and has nothing to do with direct purchase. Gating the list would hide a designer-sourced
order from a client who has no direct-order surface at all. So: **the list is unflagged; only the
direct-order rail's own rows depend on a purchase having happened.** Named here rather than assumed.

## 6. ⚠ A gap in the wire, found while reading 00540 — reported, not worked around

**There is no client-readable path from a shipment to its order.** `fulfillment_shipments` hangs off
`fulfillment_vendor_pos` (`00350:161`), the client's policy is
`fulfillment_po_belongs_to_caller(po_id)` — a boolean — and `fulfillment_vendor_pos` /
`_vendor_po_lines` / `fulfillment_events` have **no** client policy at all (00350:305-331,
00351:182-194), by design: they carry the operator's cost. A PostgREST embed
`fulfillment_shipments?select=…,fulfillment_vendor_pos(order_id)` is filtered by that table's own
RLS and comes back null for everyone.

So the client can read *that* a shipment of hers exists, its carrier, its tracking and its dates —
and cannot tell **which of her orders it belongs to** once she has more than one.

What I do about it, rather than guessing:
- the **state machine is unaffected** — `line_state` lives on `fulfillment_order_items`, which is
  order-scoped and readable, so `Shipped` / `Delivered` derive correctly for every order;
- `Track with the carrier` draws **only when the attribution is certain** — i.e. when the client has
  exactly one fulfillment order, in which case the policy itself proves every readable shipment is
  that order's. With two or more orders the row does not draw. A tracking number on the wrong table
  is worse than no tracking number (the M8 sheet's own principle, and C5).

**For Fable / D:** one line closes it — either a client SELECT policy on `fulfillment_vendor_pos`
narrowed by column grant to `(id, order_id)`, or a `client_order_shipments()` SECURITY DEFINER
reader. It is a **major**, not a blocker: the wave's acceptance line ("the seeded fulfillment order,
shipped") walks either way, because that client has one order.
