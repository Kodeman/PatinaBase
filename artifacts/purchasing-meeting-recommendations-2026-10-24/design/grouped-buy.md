# The grouped buy: one checkout, several pieces (US-54, F5)

Interaction design, design-only. F5, plus F2/F3/F4 as they apply to a group. Paths are under `apps/designer-portal/src/` unless they start with `supabase/` or `packages/`. Walk screenshots: `artifacts/purchasing-workflow-review-2026-10-22/walk/screens/`.

## The finding in one breath

Two Rejuvenation pieces on the Harchess job, the Stanton adjustable drapery rod and the Eden swing arm sconce, go through one web checkout. That gives one order number, one receipt and one shipping charge, but Ashley wants to "still have them be their own entity… separate shipping dates on them." Kody: "a single money out line… one receipt for six items… track the shipping separately." Leah: "being able to order as a group and then easily saving that order confirmation to all three items." A different destination means a separate order (Kody: "You would do two separate orders." Leah: "Yep.").

## The finding most of this rests on: the order paper already is a grouped buy

The meeting's bed purchase went the PO way. Kody: "you can just do this release by phone or portal, and then it keeps that on file." Then "record that you paid for it… Attach your receipt here." Leah: "That's super nice." Every part a group needs is already on that path:

| A group needs | Already there |
|---|---|
| Several lines, one vendor, one job | One PO = one vendor + one project (`supabase/migrations/00450_ffe_po_compat_and_media_dedupe.sql`, `create_purchase_order`). The vendor page's "Order all — N items" lays papers with many lines (`components/document/orders-book-vendors.tsx:621-738`). |
| A web checkout that sends nothing | "Released by phone or portal — mark as sent" (`components/portal/procurement/order-paper/index.tsx:1261`). The record reads "Released by phone or portal · {day}" (:1346). |
| Their order number | "Vendor confirmed by phone or email?" carries `vendorPoNumber` and `confirmedEta` (`components/document/po-preview.tsx:446-460`). Walk 11–12. |
| One money-out record + receipt | `RecordPaymentForm` against the PO, with one receipt (`components/document/line-unfold/record-payment.tsx:212, 275-277`). |
| One shipping charge, not on any one piece | Riders are `po_cost_lines` keyed to the PO, not to a line (`supabase/migrations/00704_po_cost_lines_shipments.sql:56-81`). They render on the paper above the total (`order-paper/index.tsx:1039-1047`). |
| Each piece ships on its own date | `po_shipments` with `po_shipment_lines (shipment_id, ffe_item_id, qty)` (00704:112-163, lines at :158-163). "Pieces on this shipment" (walk 48–49). |
| Each piece arrives on its own | Receiving per shipment, claims per line (walk 16–17, 26–29). |

**So this proposal invents no grouped-purchase object.** It makes the existing grouped order paper reachable from the vendor page and the job, reads it as a web checkout, and closes three gaps: order number, payment and receipt are three trips; the receipt files to one line; the ETA silently covers the whole order.

"Bought it already" (`studio_purchases`) stays one line per purchase for now — see the data paragraph and ruling G1.

---

## 1. Entry from the vendor page: a block per job

**Today.** "Order all — {n} items · ready · unordered" lays one paper per (vendor, project) across every job, and only for lines that are already ready (`orders-book-vendors.tsx:637-642, 712-728`). Lines that are not yet ready don't show at all — the same silence as F1's "my order button went away". The block lives on vendor → Orders (:1168). The way in is Ledgers → Purchase orders → Vendor accounts, where each row says only its terms and "open page →" (walk 47). Nothing tells you a vendor has pieces waiting.

**Problem.** Kody: "come into your vendor page… everything that was queued up to order with them for a job… a block of items." Ashley: "you would have to go through each item and put in probably the order information."

**Proposal.** Split VendorOrderAll into one block per job, using the same readiness rule (`readinessOf`, :603-612). Lines that are not ready show inside the block with their reason and no tick. Lines that are ready start ticked. The planned destination splits the block (see §3).

```
REJUVENATION · ORDERS

QUEUED TO ORDER
──────────────────────────────────────────────────────────────
The Harchess job                              2 ready · 1 waiting
  [x] Stanton adjustable drapery rod    Living room     trade $—
  [x] Eden swing arm sconce             Primary bed     trade $—
  [ ] (a third Rejuvenation piece)     waiting on the deposit (A2)
  To the Harchess home · one order

  [ Order these 2 together → ]        Nothing is sent until you choose how.
──────────────────────────────────────────────────────────────
```

- The vendor accounts row (walk 47) gains one mono line under the terms, shown only when something is queued: `2 QUEUED · HARCHESS`.
- If every queued line is waiting, the block still prints, with the reason and no act: `Nothing ready yet — the Harchess job is waiting on the deposit (A2).` This is the F1 discoverability fix carried into the group.
- The "no signed agreement" sentence stays as it is (:731-737).

**Reuse vs new.** Reused: readiness, `OrderPaperQueue`, paper vendor mapping. New: grouping by job, the waiting rows and the queued count on the accounts row. None of it touches the schema.

**Vision test.** Surface: The Document (vendor page). Moment: the buyer sits down to order a job's pieces from one maker. Stream: margin on furniture sold. Promise: one block instead of N line unfolds, so the studio won't notice Patina.

## 2. Entry from the job: tick several lines on Pieces & purchasing

**Today.** "Prepare a PO" on a line opens a paper with that single line (`components/document/line-unfold.tsx:606-613`; `components/document/purchases/purchase-choices.tsx:25`). Pieces & purchasing already has two tick modes with a composition bar: "Tick the lines the client is being asked to authorize" (`components/document/ffe-section.tsx:2727-2731`) and "Tick the pieces that are in place" (:2834-2838), with "{n} pieces ticked" (:1190-1193). Lines that can't take part carry "reasons (never refusals)" (:28-29).

**Problem.** Leah: "it'd be nice to be able to group your orders… these are both from Rejuvenation."

**Proposal.** Add a third tick mode, opened from the head ledger's quiet tools beside Add items: **Order several together**.

```
PIECES & PURCHASING                    Order several together · Add items · More
Tick pieces from one maker, going to one place.

 [x] Stanton adjustable drapery rod     Rejuvenation   ready
 [x] Eden swing arm sconce              Rejuvenation   ready
 [ ] Sierra bed                         —              already ordered
 [ ] Olaf mural wallpaper               —              another maker
──────────────────────────────────────────────────────────────
2 PIECES TICKED · REJUVENATION · TO THE HARCHESS HOME
[ Prepare one order → ]   Put back
```

- The first tick sets the maker. After that, lines from other makers dim with the reason `another maker`. Lines that aren't ready show their F1 reason (`waiting on the deposit (A2)`).
- "Prepare one order →" opens the same paper the vendor block opens. One paper is created, and only when the studio saves or acts on it. "Nothing is created until the review sheet commits" (:30) still holds.

**Reuse vs new.** Reused: tick surface, composition bar, `deriveOrderReadiness`, `OrderPaper` with many `ffeItems`. New: the tick mode and its head entry.

**Vision test.** The Document, Pieces & purchasing. Moment: the buyer is on the job, cart open in the other tab. Margin stream. Promise: no hop to Ledgers in the middle of a task.

## 3. One destination per order (F-05, decided)

**Today.** Lines carry a planned destination (`supabase/migrations/00856_job_destinations.sql:206-226`, "Never changes a PO ship-to (F-05)"). The paper takes one ship-to (walk 32–34).

**Problem.** Kody: "You would never… if you're going to ship some stuff to, say, the plumber and some stuff to the site… two separate orders." Leah: "I would do two separate orders for that, for sure."

**Proposal.** When ticked lines have different planned destinations, the bar says so and the act counts the orders:

```
3 PIECES TICKED · REJUVENATION · TWO PLACES
Two places, so two orders: 2 to the Harchess home, 1 to the plumber.
[ Prepare 2 orders → ]
```

The orders open stepped in `OrderPaperQueue`, which already walks several papers in one sheet (`orders-book-vendors.tsx:614-619`). A line with no planned destination joins whichever order the studio picks on the paper's ship-to. Nothing is split silently. A checkout covering two jobs gives two papers that carry the same order number, because one PO is one project (00450).

**Reuse vs new.** All reused, plus one sentence. This does not reopen F-05.

## 4. Ordered on their site: the one checkout sheet

**Today.** Recording a web checkout as a group takes three trips. First "Released by phone or portal — mark as sent" (through the one review, F-06). Then "Vendor confirmed by phone or email?" for the order number (`po-preview.tsx:446-460`). Then "Record a payment" from one line (`purchase-choices.tsx:36-42`). When that payment is recorded from a line, its receipt files to **that line's folio only**: `receiptAnchor={{ kind: 'line', anchorId: item.id }}` (`purchase-choices.tsx:42`; same at `line-unfold/order-cell.tsx:157`, `money-out-cell.tsx:65`).

**Problem.** Leah: "Here's the order number that attaches to this. And then we can still load in the order confirmation." / "easily saving that order confirmation to all three items."

**Proposal.** Once the paper is marked "Released by phone or portal", its record line offers one sheet that brings together parts that already exist:

```
REJUVENATION · THE HARCHESS JOB · 2 PIECES
Released by phone or portal · Oct 24

Record the checkout
  Their order number    [ RJ-          ]
  Paid                  [ $        ]   with  [ Studio card ••—    v ]
    Per piece, as the checkout showed it
      Stanton adjustable drapery rod   [ $      ]   paper $—
      Eden swing arm sconce            [ $      ]   paper $—
  Shipping              [ $        ]   → rides the order as Freight
  Receipt               [ Attach ]   or  ( ) I'll attach it later
  Arrives about         [ MM/DD/YYYY ]   for the whole order

[ Record the checkout ]     One payment, one receipt, both pieces.
```

- **Order number** writes through the existing acknowledgment log (`vendorPoNumber`).
- **Paid** is one PO payment, through `RecordPaymentForm`. This is the single money-out record Kody asked for.
- **Shipping** becomes one Freight rider on the order (`riders-model.ts:16-26`). It keeps "Bill the client" on by default (`order-paper/riders.tsx:393-430`), so the white-glove case from the bed carries over unchanged.
- **Receipt** files once, to the order; each line reads `Receipt · on the Rejuvenation order`. The folio has no order anchor (`hooks/use-folio.ts:18-21`), so file it under the project section as the paper's riders do (`order-paper/index.tsx:1046`) and link it from each line. "Attach it later" is the F4 owner's; in a group one upload covers every piece.
- **Arrives about** is the existing order ETA (`set_purchase_order_eta`; as-built F9). It is per PO, so the label says so.

**Reuse vs new.** Reused: every write. New: one sheet that composes them, the receipt link on each line, and the per-piece price column (§5).

**Vision test.** The Document, the order paper. Moment: the minute after "Pay now". Margin stream. Promise: one entry for one checkout.

## 5. Money facts across a group (F2, F3, F4)

**F2 · the price moved at checkout.** *Today:* cost locks once the line is on a PO or authorization (`supabase/migrations/00809_us37_trade_pricing_core.sql:364-402`); on a PO a vendor difference becomes `po_ack_lines`, and "accepted" writes the vendor's price (`supabase/migrations/00705_po_acknowledgments.sql:45-50`). *Quote:* Leah: "that's going to be complicated later to figure out why we did that." *Proposal:* the §4 per-piece column is the acknowledgment in another form — a piece paid above the paper prints `+$230.20 against the paper` and becomes an ack difference on that line, never on the shipping, so the Sierra workaround ("do you just add it to the freight?") doesn't repeat across a group. Who absorbs it stays open (G3).

**F3 · fees that arrive later.** In a group an import or processing fee belongs to the order, like shipping — a rider, never one piece's price. Field design is the F3 owner's.

**F4 · receipt.** One receipt per checkout, attached to the order (§4).

## 6. Shipping across the pieces (ruling G2)

**Today.** On the paper, shipping is an order-level rider that bills at cost as its own client line (`lib/document/invoice-composer.ts:343-355`). On a recorded purchase, `shipping_cents` is part of that one purchase and is billed inside it (`invoice-composer.ts:307-318`).

**Problem.** Leah: "if those four items have one shipping cost, how are we listing that out to make sense? Do you just attach the shipping cost to one item?"

| Option | What the studio sees | Cost |
|---|---|---|
| **A. On the order (recommended default)** | One rider, `Freight · Rejuvenation order (2 pieces)`. The client sees one freight line. No piece's price moves. | None. This is how riders work today. |
| B. Shared by value, shown per piece | Same rider. Each line also reads `+$— of the order's freight` (pro-rata by trade cost, computed for the line's landed cost, not stored). | A display rule only. Matters if a piece is returned. |
| C. On one piece | Leah's "for now". One line carries `includes the order's shipping`. | Skews that piece's margin and breaks if it's returned. |

Recommend **A**. It answers Leah's question with "you don't attach it to an item" and reuses everything. B can be added later as a read-out without changing any record. Whether freight carries a markup is **R1**, which stays open and is not decided here.

## 7. ETA and ship dates per piece

**Today.** The line's "Confirmed ETA" writes the **PO's** ETA (`components/document/line-unfold/movement-cell.tsx:197-221`; `packages/supabase/src/hooks/use-procurement.ts:903-935`). Shipments carry their own `current_eta` and lines (00704:122, 158-163).

**Problem.** Ashley: "sometimes the things ship separately too… separate shipping dates on them."

**Proposal.** Keep the order ETA as Leah's benchmark (F9, which they liked). On a grouped order the field says what it moves: `Arrives ~{date} · for both pieces on this order`. When the sconce ships first, "Record dispatch" with "Pieces on this shipment: 1 of 1 · Eden swing arm sconce" gives it its own date. The rod keeps the order ETA until it ships. No per-line ETA field is added.

**Reuse vs new.** Reused. New: one clause of copy.

## 8. What is new, what is reused

| | Reused | New |
|---|---|---|
| Vendor block | readiness, `OrderPaperQueue`, Order all | grouping by job, waiting rows, queued count on accounts row |
| Job entry | tick surface, composition bar, `OrderPaper` | "Order several together" tick mode |
| Destination | planned destination, one ship-to | the "Two places, so two orders" sentence |
| Checkout | mark-as-sent, ack number, PO payment, riders, order ETA | "Record the checkout" sheet, per-piece paid column, receipt link on each line |
| Ship dates | `po_shipments`, `po_shipment_lines`, receiving | ETA scope copy |

## Data model, in one paragraph

The recommended lane needs **no schema change for the group**: a PO already holds many lines (00450), one acknowledgment number, payments with a receipt, order-level riders (00704:56-81) and per-line shipment quantities (00704:158-163); the receipt's home is a frontend choice (`use-folio.ts:18-21`). The other lane is different. A studio purchase covers at most one `ffe_item_id` (`supabase/migrations/00703_studio_purchases.sql:63`), with a unique "one live purchase per line" index (00703:119-122). Arrival advances that one line (`supabase/migrations/00865_studio_purchase_arrival.sql:23-30`), and `po_shipments.purchase_order_id` is NOT NULL (00704:115), so a recorded purchase cannot carry per-piece shipments. Grouping it means a `studio_purchase_lines (studio_purchase_id, ffe_item_id, amount_cents)` child holding the uniqueness, an arrival trigger looping over lines, and a shipment link that doesn't exist — a large lift for a case the order paper covers. The cheap fallback (N purchases sharing an order number and receipt) misses Kody's "single money out line".

## Open rulings (recommend, don't decide)

| Id | Question | Recommended default |
|---|---|---|
| **G1** | Which record holds a grouped web checkout: the order paper (marked "by phone or portal") or a new grouped "Bought it already"? Leah: "really, I am just going to order it on the interweb." | **The order paper.** "Bought it already" stays one line per purchase until a real multi-line store buy needs more. |
| **G2** | How shipping is shared across a grouped buy | **A: on the order**, one freight line (§6) |
| **G3** | Who absorbs a checkout price rise on a piece in a group (shared with the F2 owner) | Record the actual price per piece as an ack difference. The client price question stays with the founders. |
| **G4** | Must a receipt be on file before a grouped checkout counts as complete? (shared with F4) | No. `Receipt owed` shows on the order until it is attached. |
| **G5** | Must "Bought it already" respect the deposit gate? (`components/document/purchases/purchase-record.ts:166-185` has no such check) | Only matters if G1 picks the grouped purchase. The order paper lane already respects the gate. |
| R1 | Freight markup default | Stays open. Group freight bills at cost until R1 is ruled. |

Parked and not touched here: P1 (job mailbox) and P2 (visual differentiation).
