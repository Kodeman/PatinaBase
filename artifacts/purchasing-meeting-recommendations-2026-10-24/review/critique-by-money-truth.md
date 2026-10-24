# Critique from the money-truth seat

**US-54 · design only.** Reviews `design/grouped-buy.md` (GB) and `design/journey.md` (J) against `design/money-truth.md` (MT). Lens: every dollar has one home with its reason; the client's price waits for the studio. Ratings: severity, then confidence.

## Findings

**1. GB §5 routes a price rise down a path that refuses it, and would move the client's price.** H · conf H
- GB §5 makes a per-piece overpay "an ack difference on that line".
- `resolve_ack_line` accepted is "Refused with change_order_required when the line sits on a sent, signed or executed authorization… or a vendor payment is already recorded" (`supabase/migrations/00705_po_acknowledgments.sql:54-57`). Both conditions hold here: the pair is authorized under A1 (J frame 1), and GB's own sheet records the payment.
- Even where it is allowed, it writes "trade_price_cents (+ markup…)" (00705:52), so Harchess's price rises with no paper.
- *Fix:* feed GB's per-piece column into MT §1's variance notice, which writes internal cost only and holds the markup (`00809:39-46`). Leah: "that's going to be complicated later" (`mtg:386`).

**2. One shipping charge has two writers.** H · conf M
- J frame 6 adds a shipping rider before checkout; GB §4's "Shipping → rides the order as Freight" adds another. Both bill the client by default (`order-paper/riders.tsx:393-430`): freight billed twice.
- *Fix:* the checkout sheet fills the **actual** of the existing Freight rider, and adds one only if none exists. "Shipping" isn't a rider kind (`riders-model.ts:16-26`), so J should call it Freight.

**3. Curtain rings in the same checkout count money out twice.** H · conf M
- J frames 8–9 record the order payment, then a $38 rings expense "same checkout as PO-1042". If Ashley enters the checkout total, the $38 counts twice.
- The transcript doesn't put the rings in that checkout. Leah: "I never ordered her curtain rings… that's a thing that I'll add on here too" (`mtg:463-464`).
- *Fix:* drop the same-checkout framing, or add a fourth choice to MT §1, "Something extra in this checkout". It records the expense and reduces the order payment by the same amount.

**4. J-1's default reopens the double-bill hazard.** H · conf M
- Recording a linked line through "Bought it already" leaves "Bill the client, at cost, on its own line" on by default (`purchase-record-form.tsx:84, 321`).
- Billing only checks whether the *purchase* was billed (`00822:219-220`), not the piece, so the bed could reach Harchess twice.
- *Fix:* J-1's "allow" default needs MT §4's guard as a precondition: when a line is linked, the checkbox reads "Bill the client for the delivery only".

**5. "Receipt owed" has three homes.** M · conf H
- MT §3 keeps it off the Desk. GB G4 shows it on the order. J F9 puts it on the assigned buyer's Desk the next morning.
- The email goes to Leah: "I'm using Leah's logins, and she gets the emails" (`mtg:157`). Nudging Ashley asks for paper she can't reach and makes the studio notice Patina.
- *Fix:* "owed" on the order or purchase plus a Money-out count, naming whose inbox holds it. If the Desk carries it, it rises after several days, to that inbox holder.

**6. The receipt anchor differs.** M · conf H
- MT files to the line's Folio; GB to the project section, linked from each line.
- *Fix (I'm adopting it):* anchor the receipt to the **money record**, the payment or purchase. Lines reach it through that record; works for one piece or six.

**7. The per-piece paid column adds typing.** M · conf M
- GB §4 asks for every piece's price; most checkouts will match the paper.
- *Fix:* pre-fill from the paper; open the column only when the total disagrees, via MT's "That is $X more than the paper… Where did it go?"

**8. One act has two entries on the job.** M · conf M
- GB §2 adds a tick mode, "Order several together". J frame 3 offers a ready block, "Order together — 2 from Rejuvenation".
- *Fix:* lead with J's block (no ticking, shorter for Ashley); keep GB's tick mode for editing it.

**9. The rulings are triplicated.** M · conf H
- Receipt required: R-M2, G4, J-3. Deposit gate: G5, J-1. Shipping split: G2, J-2. Price rise: R-M1, G3.
- *Fix:* defaults agree; synthesis merges each set into one id. G3's "ack difference" default falls away (finding 1).

**10. Agreements.** Info · late fees are order riders (GB §5 = MT §2); group freight at cost while R1 is open (GB §6 A, J-2); J frame 2's "A1's deposit is clear" and MT §5's match line become one sentence.

**11. Copy.** L · conf H
- The release act has two names: GB §4 should adopt J F12's "Ordered on their site or by phone — mark as placed".
- `2 QUEUED · HARCHESS` (GB §1) → "2 queued · the Harchess job". J's "No receipt — say why" interrogates; use "No receipt for this one". No address is printed.

## Where I change money-truth.md

- **§1:** add "Something extra in this checkout" (3); in a group, ask "Which piece?" and fill GB's column (7).
- **§2:** a fee or shipping amount fills an existing rider's actual before creating one (2).
- **§3:** receipts anchor to the money record (6); a delayed Desk need to the inbox holder becomes an option under the merged ruling (5).
- **§4:** the linked-line guard becomes a precondition of J-1 (4).
