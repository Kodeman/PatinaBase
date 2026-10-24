# Money truth: what was paid, what's still owed, what the client pays

**US-54 · design only · role: information and state design · owns F2, F3, F4, F6, F11**

Sources: `transcript/findings.md`, `transcript/as-built.md`, `transcript/meeting-2026-10-23.md` (cited `mtg:line`). Code paths are relative to `apps/designer-portal/src/` unless they start with `supabase/`; every anchor was re-opened on 2026-10-24. V26 rulings F-01 to F-09 stand. Card endings and PO numbers in wireframes are illustrative.

**The thesis in one line.** In both walks the paper and the money disagreed, and the studio had nowhere honest to put the difference, so it went into freight. Every proposal below gives each difference its own place with its reason, and leaves the client's price alone until the studio decides.

Both buys in the meeting went through the order paper: the bed released by phone or portal with a white-glove rider and a vendor payment (`mtg:144-150, 296-303, 401-404`), the wallpaper a web buy on full payment (`mtg:66-76`). So the main path is **PO + riders + vendor payment**; "Bought it already" gets the same treatment where it differs.

---

## 1 · F2 — The price rose at checkout

**Today**
- The vendor payment form pre-fills the PO's remainder and never compares the typed amount to the paper (`line-unfold/record-payment.tsx:206-208, 232`).
- The line's cost is locked once the line is released or on a PO: "Released lines change through Record a change." (`supabase/migrations/00809_us37_trade_pricing_core.sql:375-382`)
- On a PO line, Record a change offers Cancel, Credit, Claim, Change the maker, Remedy — none is "it cost more" (`line-unfold/change-order.tsx:28-34`).
- The ack mismatch path is refused here too: "change_order_required when the line sits on a sent, signed or executed authorization" (`00705_po_acknowledgments.sql:54-57`).
- **Already built:** "a cost change never moves the client price; it flags the line and HOLDS the markup" (`00809:39-46`); `keep_client` is allowed on a released line, `keep_markup` refused (`00809:1343-1349`); the price table draws "cost changed from $X to $Y · Keep client price · Keep markup" (`pieces/price-table.tsx:605-668`).
- **In the meeting:** the $230.20 went into the white-glove rider, making it $529.20 (`mtg:374-378`), with "Bill the client" ticked (`order-paper/riders.tsx:419`). The ended sale would have reached the Harchess invoice labelled as white glove.

**Problem.** Leah: "Ooh, that's going to be complicated later to figure out why we did that." (`mtg:386`) · "I know it says once you change it, it's done. But this is going to happen." (`mtg:391`) · Kody: "I think it's locked in… I'm going to have to change that." (`mtg:395-396`)

**Proposal: the payment form notices, asks once, and files the difference where it belongs.**

```
 Money out · Sierra bed                                    PO 0412
 ───────────────────────────────────────────────────────────────────
 Paid on  23 Oct      Amount  3,978.20      How  Amex ••1007
 Payment reference  [checkout order number]

 That is $230.20 more than the paper ($3,748.00: bed $3,449.00
 + white glove $299.00). Where did it go?

  ( ) The bed cost more            bed $3,449.00 → $3,679.20
  ( ) A fee I haven't added yet    adds a line under the order
  ( ) I typed it wrong             back to the amount

 Why, in a few words  [ sale ended at checkout            ]

 Records $3,978.20 paid to the maker on 23 Oct. The bed's cost
 becomes $3,679.20. Harchess's price does not change.

 [ Record the payment · $3,978.20 ]
```

- If she picks **"The bed cost more"**, the actual cost is written through the existing cost-change trigger. Only internal columns change, the same as `keep_client`. The line then carries the flag the price table already draws, with the reason added:

```
 Sierra bed · cost changed from $3,449.00 to $3,679.20
 sale ended at checkout · recorded by Ashley, 23 Oct
 Margin on this piece: down $230.20

 [ Keep Harchess's price ]   the studio absorbs $230.20
 [ Ask Harchess for it ]     opens Record a change → On the agreement,
                             with +$230.20 on the bed filled in
```

- "Ask Harchess for it" opens the existing amendment sheet. That sheet already carries FF&E impacts and sends to the client (`overlays/record-a-change-sheet.tsx:7-9`, `overlays/amendment-sheet.tsx:4-17`). Nothing reprices silently, and the client sees a paper she signs.
- The flag stays until a choice is made, as today (`price-table.tsx:606`).
- If she picks **"A fee I haven't added yet"**, the form opens the rider row (see F3) with the difference as its estimate. The payment can then be recorded against a paper that matches.
- The same notice goes on "Bought it already" when a line is linked: "That is $X more than the bed's cost ($3,449.00)". It sits beside the Paid field (`purchases/purchase-record-form.tsx:231`).

**Reuse vs new.** Reused: the vendor payment form, the cost-change trigger, `resolve_ffe_cost_change`, the price-table row, the amendment sheet. New: the variance sentence and its three choices, a reason on the cost change, and one writer that records an *actual* cost on a released line (internal columns only); today the lock refuses it.

**Open ruling R-M1: who absorbs a checkout price rise?** Recommendation: preselect nothing. The line stays flagged, and both buttons show the dollar effect. Leah's own reasoning leans towards absorbing small rises: "I don't want to be greedy" (`mtg:308`), and "This is probably why we mark up the freight" (`mtg:362`). A threshold below which the studio absorbs automatically is a founder call, not a default this proposal sets.

**Vision test.** The Document, line Money out · right after checkout · margin stream (protects the margin figure) · the books explain themselves later, so the studio doesn't notice Patina.

---

## 2 · F3 — Fees that aren't shipping, and the "ding later"

**Today**
- The rider kinds are Freight, Crating, Liftgate, Residential delivery, White glove, Receiving, Storage, Handling and Restocking (`order-paper/riders-model.ts:16-26`). The DB also allows `other` (`00704_po_cost_lines_shipments.sql:73-75`), but the picker never offers it, and a new rider draft has no note (`riders-model.ts:40-47`).
- **What already works:** a blank estimate is allowed and reads "no estimate yet" (`riders-model.ts:55-60`, `riders.tsx:230`). A rider can be owed to someone other than the vendor, and it gets its own "Record payment to {payee}" (`riders.tsx:78, 560`). The composer bills a rider only once it has an actual or an estimate (`lib/document/invoice-composer.ts:351-355`).
- On "Bought it already" there is only a Shipping field. There is no other-fee field and no fee that arrives later (`purchase-record-form.tsx:243-246`; `purchases/purchase-record.ts:31-49`).

**Problem.** Leah: "there is an import fee on orders this large… we'll also have to add track that cost to be billed later in our freight charges." (`mtg:48`) · "So I think they send me another—I get sent another ding later on." (`mtg:100`) · Kody: "Maybe just put that in the shipping." (`mtg:76`)

**Proposal: name the fee, say who collects it, and leave the amount blank until it arrives.**

```
 Olaf mural, Misty Blue · order paper
 ───────────────────────────────────────────────────────────────────
 + Freight, crating, receiving, fees…

   Kind     [ Import tariff ▾ ]      Freight · … · Import tariff ·
                                     Processing fee · Other (name it)
   Owed to  [ The courier ▾ ]        collected at delivery
   Amount   [            ]           blank = not known yet
   [x] Bill the client   [ at cost ▾ ]

 Riders
   import tariff · owed to the courier · amount not known yet · bill at cost
   processing fee · owed to the courier · about 3% · not known yet · bill at cost
```

- The rider row reads **"amount not known yet · owed when the courier asks"**.
- When the ding arrives, the existing "Record payment to the courier" fills the actual. The rider then joins "Bill N unbilled riders" (`ffe-section.tsx:2336`) and is billed at that point.
- On "Bought it already", a **"+ Another fee"** row sits under Shipping, with the same kind, owed to and amount fields. This is new, because studio purchases have no riders.

**Reuse vs new.** Reused: `po_cost_lines` (null estimate, payee, billable flag) and the rider payment. New: two kind labels, "Import tariff" and "Processing fee". These need a constraint change, and until then they can ship as `other` plus a required name, using the existing `note` column (`00704:68`). Also new: the fee row on recorded purchases.

**Open ruling.** None; named kinds vs "Other" with a name is a build call.

**Vision test.** The Document, order paper · checkout, then the courier's bill weeks later · margin (an unbilled fee is margin lost) · the studio doesn't remember the ding; the paper does.

---

## 3 · F4 — Receipt later, more than one file, a quiet "owed"

**Today**
- A recorded purchase holds one file in state (`purchase-record-form.tsx:88`) and stores it in one column (`00703_studio_purchases.sql:78`).
- A vendor payment also takes one file (`record-payment.tsx:212, 381`; `00695_vendor_payments.sql:144`), and "Payments are never edited" (`record-payment.tsx:8`).
- Neither has a path to attach later (as-built F4).
- The Folio already holds any number of files against a line (`hooks/use-folio.ts:18-21, 95-130`).

**Problem.** Ashley: "an opportunity to still save it, and then I can upload it… Or a screenshot?" (`mtg:159-160`) · "If I attached a screenshot, could I add the receipt like a second attachment?… Later?" (`mtg:174-178`) · Kody: "come back in and attach a receipt once you get that receipt." (`mtg:172`)

**Proposal: recording money and attaching paper are separate acts.**

```
 Money out · Sierra bed
   Paid $3,978.20 · Amex ••1007 · 23 Oct · Ashley
   Receipts   checkout-screenshot.png  ·  [ + Add a receipt ]
              receipt still owed — the order email went to Leah

 (a week later)
   Receipts   checkout-screenshot.png  ·  order-55-57.pdf
```

- **On record:** the receipt field becomes "Receipts (optional — add now or later)" and accepts several files.
- **Recording with none attached** leaves a quiet line under the payment: "receipt still owed". It names the person whose inbox has the email when the payment method belongs to someone else, as with Leah's logins (`mtg:157`).
- **After recording:** "+ Add a receipt" is always there. It files to the line's Folio, linked to that payment or purchase. Adding paper never edits the money, so "never edited" still holds.
- **Gentle means:** nothing is pushed to the Desk. The owed state shows on the line, as a count on the Ledger's Money out ("2 receipts owed"), and in closeout.

**Reuse vs new.** Reused: Folio storage and versioning. New: a link from a payment or purchase to its files, an append-only "add a receipt" act, and the owed state.

**Open ruling R-M2: must a purchase have a receipt before it counts as complete?** Recommendation: no. "Owed" is visible but blocks nothing, and closeout lists what's still owed. Leah's reason for receipts is "bookkeeping and if we ever were to get audited" (`mtg:155`), which a closeout list serves without putting a gate in the buyer's way.

**Vision test.** The Document, Money out · the first hand buying on the owner's logins · margin · nothing nags; the paper waits.

---

## 4 · F6 — Freight billed to the client, with an honest markup

**Today**
- A rider's "Bill the client" is on by default, with "at cost / cost plus" (`riders.tsx:393-430`; `riders-model.ts:28-31`).
- **"Cost plus" is a label only.** The composer never reads `billing_rule`. It bills the actual, else the estimate, at cost (`invoice-composer.ts:351-355`), unless the studio types an override (:598-607). No percent is stored, and whether the client ever sees cost-plus is open ruling R1 (`00704:96-97`).
- The job's markup override "covers goods lines… never freight/delivery/install" (`00809:47-48`).

**Problem.** Leah: "if I could mark the freight up 10% just to make sure we're covered for anything weird that might happen… I don't want to be greedy." (`mtg:307-308`) · Ashley: "are you putting a markup on that as well?" (`mtg:305`)

**Proposal: cost plus means a percent, and the figure is shown before it's billed.**

```
 White glove · owed to the maker · $299.00
   [x] Bill the client   [ cost plus ▾ ] [ 10 ]%
   Harchess sees  White glove delivery  $328.90
   The studio keeps $29.90 · from the job's freight markup (10%)
```

- A **freight markup** is set per job (Leah's case is the Harchess job at 10%). Each rider can override it.
- "Bill N unbilled riders" pre-fills $328.90, and the internal cost stays $299.00 for the margin figure. This uses the existing `invoice_line_item_internals`, as purchases do (`00822_us36_invoice_line_internal_cost.sql:254-255`).
- **A guard tied to F2:** a rider that has absorbed a price variance can't be billed silently. If the white-glove actual exceeds the vendor's shipping charge, the rider says "includes $230.20 not on the vendor's shipping line" and points to F2's choices.

**A money-truth hazard found while tracing this (verify before building).** On "Bought it already", "Bill the client, at cost, on its own line" is ticked by default even when a line is linked (`purchase-record-form.tsx:84, 321`). The billing RPC doesn't check whether that line is already billed to the client through its own price (`00822:200-262`). For a sold piece like the bed, the whole buy, freight included, could be billed a second time. Proposal: when a line is linked, the checkbox reads **"Bill the client for the delivery only ($299.00)"**, and the piece itself bills through its line.

**Open ruling R1, carried: the freight markup default, and whether the client sees the add-on.** Recommendation: the studio default is 0% (at cost, as today). The per-job percent is set by the studio. The client sees one delivery figure ($328.90), never a separate "markup" row. The internal cost line keeps the split for the studio. Leah's 10% on Harchess is an example, not the default.

**Vision test.** The Document, order paper then composer · adding delivery at checkout · margin, the first dollar · the client sees delivery as delivery, at a figure chosen on purpose.

---

## 5 · F11 — The client payment that was $2,000 short

**Today**
- The Folio's record-payment panel opens with an empty amount and the balance as a placeholder (`accounts/invoice-folio.tsx:1205-1213`). Only an amount *over* the balance gets flagged: "amount exceeds the remaining balance" (:1250-1256).
- Anything under the balance records as a partial without a word (:606-607).
- The Desk's act sheet pre-fills the balance and refuses anything over it (`acts/record-payment-sheet.tsx:233, 240, 279`), but it is also silent on short amounts.

**Problem.** Ashley: "I think your amount is off. You have 21, and I think it's supposed to be 23." (`mtg:222`) · Leah: "Don't want our money to be off." (`mtg:228`) A short entry here also keeps the deposit gate shut. Ordering came back only once the full $23,123.19 was recorded (`mtg:231-240`, F1).

**Proposal: say the gap and what it leaves closed.**

```
 Record a payment · balance $23,123.19
   Amount  [ 21,123.19 ]   Method  Check   Reference  personal check

   $2,000.00 less than the balance. $2,000.00 stays open, and the
   deposit on A1 is not covered, so the bed and wallpaper can't be
   ordered yet.                                [ Use $23,123.19 ]

 — or, when it matches —
   Matches the balance. Clears the invoice; {n} pieces can be ordered.
```

- Pre-fill the balance on both surfaces, reusing the act sheet's behaviour.
- Short amounts stay allowed, because partials are real. The sentence just names the gap and its consequence for ordering, using `deriveOrderReadiness` (`lib/document/authorization-derivation.ts:439-478`).
- $21,123.19 is illustrative; the transcript records only "21".

**Reuse vs new.** Reused: the balance, the gate derivation, and the act sheet's pre-fill. New: the under-balance sentence and the "Use $X" fill.

**Open ruling.** None.

**Vision test.** The Document, Money · banking the client's check · margin (it unblocks buying) · a second pair of eyes that is always there.

---

## Open rulings this proposal leaves open

| Id | Question | Recommended default |
|---|---|---|
| R-M1 | Who absorbs a checkout price rise | Preselect nothing; keep the line flagged and show both dollar effects |
| R-M2 | Receipt required before a purchase is "complete" | Not required; show "owed" quietly and list it at closeout |
| R1 | Freight markup default, and whether the client sees it | 0% for the studio, a percent per job; the client sees one figure |
| (F1 owner) | Whether "Bought it already" must respect the deposit gate | Cross-reference only; not decided here |

Out of scope: P1 (the job mailbox) and P2 (visual differentiation). Nothing here prints the Harchess address.
