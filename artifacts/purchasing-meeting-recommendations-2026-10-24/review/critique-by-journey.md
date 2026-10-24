# Critique from the journey seat

**US-54 · reviewer: service / journey · reads `design/grouped-buy.md` (GB) and `design/money-truth.md` (MT) against `design/journey.md` (J) · 24 Oct 2026**

Severity is H/M/L. Confidence is in brackets. "mtg:N" means a line of `transcript/meeting-2026-10-23.md`.

## Conflicts between proposals

1. **H [high] — GB §5 sends a checkout price rise down a path that refuses it.** GB says a piece paid above the paper "becomes an ack difference on that line". But "accepted" is refused (`change_order_required`) on an authorized line or once a vendor payment exists (`supabase/migrations/00705_po_acknowledgments.sql:52-57`), and the pair is authorized under A1. **Fix:** GB §5 adopts MT §1's variance sentence and its writer, the cost-change flag (`00809:39-46`). G3 and R-M1 merge into one ruling.

2. **H [high] — Three different homes for "receipt owed".** J: a Desk need. GB G4: on the order. MT §3: on the line plus a Money out count, "nothing is pushed to the Desk". Nobody asked to be reminded; Kody only said "come back in and attach a receipt" (mtg:172), and the email goes to Leah (mtg:157). **Fix:** MT's model, with the owed state on the order's payment and linked from each grouped line. I withdraw my Desk need.

3. **M [high] — The receipt has two homes.** GB §4 files it under the project section and links it from each line. MT §3 files it to the line's Folio. A grouped checkout has one receipt for several lines (mtg:476, 496). **Fix:** file it once against the order payment and link it from each line. MT's per-line Folio stays for single-line buys.

4. **M [high] — One act, four names.** GB: "Order these 2 together →", "Prepare one order →". J: "Order together — 2 from Rejuvenation →". GB keeps "Released by phone or portal"; J renames it "Ordered on their site or by phone — mark as placed" because "Released" now means the owner's release (F-03). **Fix:** one entry verb, **"Order together — N from {maker} →"**, then **"Record the checkout"**; the F-03 rename goes into GB §4.

5. **M [med] — Ruling ids collide and one scope is wrong.** J-1/G5/MT's F1 cross-reference, J-2/G2 and J-3/G4/R-M2 each ask the same question. GB G5 says the deposit-gate question "only matters if G1 picks the grouped purchase". That is wrong: single-line "Bought it already" skips the gate today (`purchase-record.ts:166-185`). **Fix:** one id per question; the defaults already agree.

## Longer flows for Ashley or Leah

6. **M [high] — GB §4's per-piece "Paid" column makes Ashley type every piece on every checkout.** Kody asked for "a single money out line" (mtg:476). **Fix:** per-piece amounts prefill from the paper. They open only when the total disagrees, and then MT's "Where did it go?" asks once at the order level.

7. **M [high] — MT §1 forces a choice the buyer can't make.** Ashley buys on Leah's logins (mtg:157); absorbing $230.20 is the owner's call. **Fix:** add a fourth choice, **"Not sure — leave it flagged"**. The payment records; the flag waits. R-M1 stays open.

8. **L [med] — GB §2 adds a third tick mode next to J frame 3's vendor block.** **Fix:** the job door opens GB §1's per-job VendorOrderAll block, ticked, reasons showing. One component, Kody's vendor-page door kept (mtg:487), no new mode.

## Possible invented asks and accuracy

9. **L [med] — MT §4 "Ask Harchess for it" puts an action in front of the client that nobody raised.** Leah worried about the books (mtg:386), not about re-billing the client. Fine as one of two unselected buttons, but say **"Ask the client"**; the rule is "the Harchess job", not "Harchess" as a person (also "Harchess sees", "Harchess's price", MT §1, §4).

10. **L [med] — MT §5 says "the bed and wallpaper can't be ordered yet".** The wallpaper was ordered before the payment was fixed (mtg:66-76 come before mtg:222). **Fix:** say "the bed".

11. **L [med] — The scenario facts disagree.** GB puts the Stanton rod in the Living room, J in the Primary bedroom; the transcript gives neither. GB's third piece on "A2" is invented. **Fix:** rooms from the job's real lines; drop the third piece.

12. **L [high] — Two things done well, kept.** MT §4's per-job freight markup rests on what Leah said: "a healthy markup on this job" (mtg:306). MT's double-billing hazard (`purchase-record-form.tsx:84, 321`: billable defaults to true even with a line linked) is real and should go to engineering. 

## What I change in journey.md

- **Frames 7–8 become one frame:** GB's "Record the checkout" sheet, (order number, one payment, shipping as a rider, receipt now or later, ETA), expense offer at its foot. Saves Ashley two trips.
- **Frame 8 picks up MT §1:** a placeholder total that runs $230.20 over the paper shows the variance sentence with "Not sure — leave it flagged".
- **Frame 2 picks up MT §5:** the payment sentence reads "Matches the balance. A1's deposit is clear, so 2 pieces can be ordered", and the Next row turns to Order in place.
- **Frame 6 moves:** shipping is entered in the checkout sheet, where the figure is known.
- **Withdrawn:** the "Receipt owed" Desk need. Frame 10 keeps only **ETA passed** (Leah's "benchmark", mtg:452).
- **J-3 folds into R-M2, and J-2 folds into G2.** J-1 stays, as the single deposit-gate ruling.
