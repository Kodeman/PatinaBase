# Critique from the grouped-buy seat (US-54)

Reviews `design/money-truth.md` (MT) and `design/journey.md` (J) against `design/grouped-buy.md` (GB). Severity · confidence, H/M/L.

## Agreement: merge into one ruling each

All three agree: the paper is the door for a web checkout (G1 = J-4), shipping sits on the order (G2 = J-2), no receipt is required (G4 = J-3 = R-M2). Synthesis should merge G1/J-4, G2/J-2, G4/J-3/R-M2, G3/R-M1, G5/J-1.

## Conflicts

**1. My F2 route is refused on Harchess lines. Change mine and adopt MT's. (H · H)**
GB §5 sends a per-piece price rise into an ack difference. MT §1 cites `00705_po_acknowledgments.sql:54-57`, which I re-opened: accepting is "Refused with change_order_required when the line sits on a sent, signed or executed authorization… or a vendor payment is already recorded". Both Rejuvenation pieces sit under A1.
*Fix:* GB's per-piece "Paid" column feeds MT's three choices, one row for each piece that differs, and writes through MT's actual-cost writer.
MT needs the group case: its form is one line, but a grouped payment is one PO amount, so the per-piece split comes first.

**2. The variance sentence fires on every grouped checkout. (H · M)**
MT compares the typed amount with the paper. The card charge also includes shipping that isn't on the paper yet, F3 fees, and the rings in J frame 9.
*Fix:* one sheet (GB §4) in order: order number, per-piece paid, shipping, fees, "+ Something extra in this checkout (an expense)", then `Card charge $— = order $— + expense $—`. Compare against the paper only after that. Kody's "single money out line" stays one charge.

**3. Receipt owed: Desk (J) or the line (MT). (H · M)**
J §F9's need rises "the morning after"; MT says "nothing is pushed to the Desk". Nobody asked for a reminder: "come back in and attach a receipt once you get that receipt" (meeting:172). A need per web buy works against "the studio won't notice Patina".
*Fix:* side with MT: owed on the line and order, a Money out count, a closeout list. One owed state per checkout, not per piece.

**4. The order number has three homes. (M · H)**
GB writes it to `vendorPoNumber` (`po-preview.tsx:446-460`). J frame 8 and MT §1 put it in the payment reference. Leah: "Here's the order number that attaches to this" (meeting:482).
*Fix:* one field that writes `vendorPoNumber` and pre-fills the reference. Ashley types it once.

**5. The job entry. (M · M)**
J frame 3's "Order together — 2 from Rejuvenation →" is one tap, shorter than my tick mode, but assumes the section is grouped by vendor, which nobody shows.
*Change mine:* when two or more ready lines share maker and destination, the head offers `2 ready from Rejuvenation · Order together →`, opening GB §2 pre-ticked. Tick mode stays for hand-picking; no re-layout.

**6. Head crowding. (M · M)**
GB and J each add a head act beside Add items. Point 5 removes mine. *Fix for J:* make the expense the first entry inside Add items, which still fixes the "four steps deep" path.

**7. Duplicate F1 copy. (L · H)**
GB says "Nothing ready yet — … waiting on the deposit (A2)", and J says "1 more for Rejuvenation waits on the deposit (A1)". *Fix:* use J's reason-to-act map as the single source. My A2 becomes A1.

**8. My G5 is mis-scoped. (M · H)**
`buyableLines` lets any single "Bought it already" skip the deposit gate, not only a grouped one. *Defer to J-1.*

## Invented or over-reaching

- **J frame 9, rings "same checkout as PO-1042":** Leah said only "I never ordered her curtain rings to go with this" (meeting:463). Label it as an illustration. (L · H)
- **J's "ETA passed" need:** Leah's "benchmark… we should be getting some shipping information" (meeting:452) supports it loosely. On a group, the need names the piece and stands down once a shipment covers that piece (GB §7). (L · M)
- **MT §3, "the order email went to Leah":** Patina doesn't know whose inbox a login's email lands in. Drop the name, or let the buyer type it. (M · M)
- **MT §4, per-job freight percent:** Leah asked for one figure, "mark the freight up 10%". A studio default plus a per-rider override covers it. R1 stays open. (L · M)
- **J's intro, "Only two pieces are new":** undercounts; the Next-row map, People prompt, ship-to grouping, stray notice, expense act and tally are new too. (L · H)

## Voice

- MT: "Harchess's price", "Ask Harchess for it", "Harchess sees". Write "the client's price", "Ask the client for it", "The client sees". (L · M)
- MT: "Amex ••1007" reads as real. Use `••—`. (L · M)
- I adopt J's "Ordered on their site or by phone — mark as placed". "Released" now means Leah's release (V26 F-03, `direction.md:89`). (M · H)

## Carry forward

- MT's double-billing hazard (`purchase-record-form.tsx:84, 321`, re-opened) is one more reason G1 keeps grouped web buys on the paper. J's "Next row never vanishes" too.

## Changes to grouped-buy.md

1. §5: route price rises through MT's choices, not `po_ack_lines`.
2. §4: itemize before comparing, use one order-number field, use the "mark as placed" copy.
3. §2: lead with the suggested group and drop the standing head tool.
4. G5: defer to J-1. Receipt owed stays on the line and the order, with no Desk need.
