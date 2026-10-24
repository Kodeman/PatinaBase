# After the first buys on the Harchess job: recommendations

**US-54 · synthesis by the design lead · 24 October 2026 · design-only, nothing built**

Inputs: `design/journey.md` (J), `design/money-truth.md` (MT), `design/grouped-buy.md` (GB), the three critiques in `review/`, `transcript/findings.md` (F1–F12, P1–P2), `transcript/as-built.md`, `transcript/meeting-2026-10-23.md` (cited `mtg:N`, the line number). Code paths are relative to `apps/designer-portal/src/` unless they start with `supabase/`. Every anchor quoted below was re-opened on 24 October against main. Screens are in `artifacts/purchasing-workflow-review-2026-10-22/walk/screens/` (local walk, 22 October, some pre-US-51 names).

Settled in V26 and not reopened here: one ship-to per order (F-05), one review before every Send (F-06), tracking stays manual (F-07), the assigned buyer owns the order (F-03), client visibility is studio-only (F-08).

---

## 1 · For the founders, in one paragraph

The meeting bought two real things on the Harchess job, and the path held: the paper, "release by phone or portal", the payment with its reference, the ETA benchmark and the field-app receiving all drew "that's super nice". Where it went wrong, it went wrong in two ways. Either something that already exists couldn't be found (the Order act's reason, job destinations, pass-through expenses, grouped ordering on the vendor page), or the paper and the money disagreed and there was nowhere honest to put the difference, so it went into freight (the $230.20 the Sierra bed rose at checkout, the wallpaper's import tariff and processing fee). The spine of this recommendation is that **a web checkout is an order paper marked as placed**, because only the paper carries a ship-to, riders, an ETA and per-piece shipments. That means grouped buying needs no new object. Before the next Harchess purchases we recommend thirteen small changes (eleven are copy or one control): say why Order is held and offer the act that clears it; say what a short client payment leaves closed; let places land on the job; put expenses where Leah stands; name fees that arrive later; record a checkout price rise with its reason and never move the client's price silently; and let a receipt come later, more than one file, with a quiet "owed" instead of a reminder. The one-sheet "Record the checkout" for a grouped buy, and a freight markup that actually computes, come next. Six questions stay with you as rulings, each with a recommended default.

---

## 2 · The web-checkout buy, as proposed (swimlane)

Lanes: **Studio** (Leah or Ashley) · **Vendor site** (the maker's web checkout, on Leah's login) · **Patina** (The Document) · **Client billing** (what the client is asked to pay). Each `R-` marks the recommendation that changes that step; unmarked steps work today.

```
             STUDIO                    VENDOR SITE               PATINA (The Document)                      CLIENT BILLING
             ──────                    ───────────               ─────────────────────                      ──────────────
 0 clear     banks the client's                                  Next row: "Waiting on the client's         client pays the
   to buy    check ───────────────────────────────────────────▶ deposit (A1) · Record the payment →"       deposit (A1)
                                                                 payment form: "Matches the balance.  ◀──── $23,123.19 recorded
                                                                 A1's deposit is clear; 2 pieces can
                                                                 be ordered."  Order appears in place
                                                                 [R-01, R-02]

 1 open the  "2 ready from Rejuvenation                         one paper per maker + job
   paper     · Order together →" ───────────────────────────▶   (VendorOrderAll, reused) [R-12]
             (or Order on one line)                              ship-to: On this job first [R-03]
                                                                 riders: White glove / Freight,
                                                                 Bill the client on (reused)
                                                                 fee riders: "Import tariff · amount not
                                                                 known yet" [R-07]
                                                                 no quote: "the checkout total is the
                                                                 price" [R-05]

 2 check     cart, ship to the  ──▶  order number,
   out       Harchess home,          confirmation page,
             pay on studio card      email to Leah's inbox,
                                     lead time maybe

 3 mark      "Ordered on their site or by phone —                one review sheet (F-06), nothing sent
   placed     mark as placed" ─────────────────────────────▶     [R-06]

 4 money     one payment for the checkout ──────────────────▶   order number → the order's vendor number
   out       (screenshot now, or nothing)                        and the payment reference [R-13 NEXT]
                                                                 paid vs paper: "That is $230.20 more    ──▶ the client's price
                                                                 than the paper. Where did it go?"           does not move;
                                                                 [R-08]                                      line flagged
                                                                 "receipt still owed" on the money           (Q-01)
                                                                 record [R-09]
                                                                 ETA benchmark "for both pieces on
                                                                 this order" [R-14]

 5 bill                                                          "Bill N unbilled riders" (reused)  ──────▶ delivery at cost, or
                                                                 cost plus prints what it does [R-11]        at the job's freight
                                                                                                             markup (Q-05, R-16)

 6 later     forwarded email / PDF ─────────────────────────▶   "+ Add a receipt" on the money record;
   paper                                                         owed clears [R-09]

 7 later     the courier's "ding"   ◀──  processing fee           "Record payment to the courier" fills the ─▶ fee rider joins
   fee       arrives                     collected at delivery    rider's actual (reused) [R-07]               unbilled riders

 8 ships     ──────────────────────▶  the sconce ships first      Record dispatch: "Pieces on this
                                                                 shipment · 1 of 1" (reused); the rod
                                                                 keeps the order ETA

 9 arrives   field app at the site: photo, good / damaged, claim (reused, KEEP)

10 extras    curtain rings, paint ──────────────────────────▶   Add items → "An expense to pass       ──────▶ "Bill N unbilled
                                                                 through" (reused form, preset) [R-04]       purchases" at final
                                                                                                             billing, at cost
```

Off this lane, by design: a piece the studio walked out with, or a pass-through cost, goes through **Bought it already** (one line per purchase, `supabase/migrations/00703_studio_purchases.sql:119-122`). A piece that ships to a destination goes through the paper (Q-06).

---

## 3 · Recommendations

Size is design-size (S = copy or one control on an existing surface; M = a new sheet, a new state, or one schema change; L = a new object or several surfaces). Vision test order: surface · studio moment · stream · promise.

### R-01 · The Order act says why it's held and offers the act that clears it — F1

- **Quote.** Kody: "my order button went away… I did something wrong." (mtg:120, 131) · "So we couldn't order because she hadn't." / Leah: "We hadn't recorded her payment yet." (mtg:239-240)
- **Today.** When a selected line isn't ready, the next act returns `null` (`components/document/line-unfold/next-act.ts:87-90`), so the whole Next row is not drawn (`components/document/line-unfold.tsx:344`). The reasons drop into the order cell as an 11px muted list whose heading "Before this can be ordered" exists only as an aria-label (`components/document/line-unfold/order-cell.tsx:132-142`). The strip sentence "Authorized — the purchase order opens when the deposit clears (A{n})" is also 11px (`lib/document/authorization-derivation.ts:388-391`, rendered at `line-unfold.tsx:469-472`). The reasons are `lib/document/authorization-derivation.ts:446-472`. After the payment was recorded, Order came back only on refresh (mtg:235-237).
- **Change.** On a selected line the Next row never disappears. When the line can't be ordered, it states the first reason and offers the act that clears it; further reasons read "+2 more" and open the cell. Order comes back in place, without a refresh.

  ```
  NEXT   Waiting on the client's deposit (A1) · $23,123.19 due      [ Record the payment → ]
         Order opens as soon as it's recorded.
  ```

  | Reason today (authorization-derivation.ts) | Next row reads | Act |
  |---|---|---|
  | Waiting on the deposit (A{n}) | Waiting on the client's deposit (A{n}) | Record the payment → |
  | Waiting on the authorization | Waiting on the client's authorization | Open the authorization → |
  | Needs a maker | Needs a maker before it can be ordered | Choose the maker → |
  | Needs a client price | Needs a client price | Set the price → |
  | Waiting on a decision | Waiting on a decision | Open the decision → |

  The section head adds up what is held, once: **"2 pieces approved and authorized · waiting on the deposit (A1) — Record the payment →"**. This map is the single source for every held-reason sentence in this set (R-12 uses it too).
  Engineering check, not a design change: confirm whether the client-payment write refreshes the line's deposit read; the meeting needed a refresh (mtg:235-237).
- **Reuse vs new.** Reused: `deriveOrderReadiness`, the Next row, the client-payment record. New: the reason-to-act map and the copy.
- **Size.** S.
- **Vision test.** The Document · the morning the studio starts buying · margin · nobody wonders whether they broke something.

### R-02 · The client payment says the gap and what it leaves closed — F11

- **Quote.** Ashley: "I think your amount is off. You have 21, and I think it's supposed to be 23." (mtg:222) · Leah: "Don't want our money to be off."
- **Today.** The Folio's payment panel opens empty, with the balance only as a placeholder (`components/document/accounts/invoice-folio.tsx:1205-1213`). Only an amount over the balance is flagged, "amount exceeds the remaining balance" (:1250-1256); anything under records as a partial without a word (:606-607).
- **Change.** Pre-fill the balance. When the amount is under it:

  > **$2,000.00 less than the balance.** $2,000.00 stays open, and the deposit on A1 isn't covered, so 2 pieces stay held. **[ Use $23,123.19 ]**

  When it matches: **"Matches the balance. A1's deposit is clear, so 2 pieces can be ordered."** Partials stay allowed. (The transcript records only "21"; $21,123.19 is illustrative.)
- **Reuse vs new.** Reused: the balance, the gate derivation (`authorization-derivation.ts:439-478`). New: one sentence and the "Use $X" fill.
- **Size.** S.
- **Vision test.** The Document, Money · banking the client's check · margin (it unblocks buying) · the second pair of eyes is always there.

### R-03 · Places land on the job; strays are named — F7

- **Quote.** Kody: "once you add her address in, then add it to the job… not be global. I forgot to do that with my den." (mtg:258-259)
- **Today.** The job Destinations sheet saves and then adds to the job (`components/document/destinations/job-destinations-sheet.tsx:82-85`), with "Add to job" on existing places (:145-157). The People editor saves studio-wide with Dock and Liftgate and never asks about a job (`components/document/people/studio-locations-editor.tsx:284-285`), the likely origin of the den. Ship-to puts job places first but lists every studio place after them (`components/portal/procurement/order-assistant/ship-to-choice.tsx:68-77`), marking "On this job" and "Private home" (:179). Screens 32–34.
- **Change.**
  1. A place made inside a job (paper, Destinations sheet, line) lands on that job. This already happens; keep it.
  2. A place made in People asks **"For a job?"**, offering the job you came from, or **"No job — a studio place (receiver, workroom)"**. A private home always needs a job.
  3. On a job, ship-to shows **On this job**, then **Studio places**. Private homes on other jobs fold behind **"A home on another job…"**.
  4. The Destinations sheet names a stray once: **"Kody's den is a private home on no job. Add it to a job, or make it a studio place."**
- **Reuse vs new.** Reused: `project_destination_locations` (`supabase/migrations/00856_job_destinations.sql:152-252`), the Add to job act. New: one prompt, one fold, one notice.
- **Size.** S.
- **Vision test.** The Document · setting up the job's places · margin · the client's home never turns up on another job.

### R-04 · Pass-through expenses are found where Leah stands — F8

- **Quote.** Leah: "I never ordered her curtain rings… There are definitely more expenses… we just kind of continue to catalog." · "I'm not going to be like 73.97 for the gallon of paint, approve or deny." (mtg:463-470)
- **Today.** This exists, four steps deep: Add items (`components/document/ffe-section.tsx:2141-2146`) → "Bought it already", the last entry (`components/document/schedule/add-to-project-sheet.tsx:113-116`, screen 37b) → kind Expense → "No line" and "Bill the client, at cost, on its own line" (`components/document/purchases/purchase-record-form.tsx:308-322`). It bills later through "Bill N unbilled purchases" (`ffe-section.tsx:2317-2331`). No client approval step, which matches her contract (mtg:468). The same act also goes by "Record a purchase already made" on the line (`components/document/purchases/purchase-choices.tsx:31-33`).
- **Change.**
  - The first entry in Add items becomes **"An expense to pass through"** · *"Rings, screws, paint. Billed to the client at cost at final billing."* It opens the existing form preset to Expense, This project, No line, Bill the client at cost.
  - "Bought it already" keeps its place, described as **"Paid for already: a store buy, a lot, an expense or a sample fee."** The line's "Record a purchase already made" becomes **"Bought it already"**, one name for one act; its sub-line "Nothing will be sent or ordered." stays.
  - The section's money line carries one quiet count: **"Expenses to pass through · 3 · $186.40 · billed at final billing"** (figures illustrative).
  - No new head act (head-crowding; see Rejected).
- **Reuse vs new.** All reused except the preset entry and the count.
- **Size.** S.
- **Vision test.** The Document · the moment she remembers the rings · margin (pass-through at cost) · no approve-or-deny ceremony.

### R-05 · An Order without a quote is right for a web buy — F10

- **Quote.** Kody: "I was able to click that order without getting a quote… I think it had to do with how we set up the wallpaper and who the vendor was on it." (mtg:199-200)
- **Today.** No readiness reason asks for a quote (`lib/document/authorization-derivation.ts:446-472`). The wallpaper behaved correctly; it wasn't the vendor setup.
- **Change.** When the paper has no quote, it says once: **"No quote on file. For a web checkout, the checkout total is the price."**
- **Reuse vs new.** Copy only.
- **Size.** S.
- **Vision test.** The Document, the paper · the first web buy · margin · no false alarm.

### R-06 · "Released by phone or portal" becomes "mark as placed" — F12 (kept, renamed)

- **Quote.** Kody: "you can just do this release by phone or portal, and then it keeps that on file." Leah: "That's nice." (mtg:144-147)
- **Today.** The act reads "Released by phone or portal — mark as sent" (`components/portal/procurement/order-paper/index.tsx:1261`) and the record "Released by phone or portal · {day}" (:1346). Since V26 F-03, "released" also means the owner's release back to the buyer.
- **Change.** Act: **"Ordered on their site or by phone — mark as placed"**. Record: **"Placed on their site or by phone · {day}"**. The one review sheet (F-06) says: **"Nothing is sent to {maker}. This records an order you placed."** Behaviour unchanged.
- **Reuse vs new.** Copy only.
- **Size.** S.
- **Vision test.** The Document, the paper · the minute after "Pay now" · margin · one word, one meaning.

### R-07 · Fees get a name, an owner and "not known yet" — F3

- **Quote.** Leah: "there is an import fee on orders this large… we'll also have to add track that cost to be billed later in our freight charges." (mtg:48) · "I get sent another ding later on." (mtg:100) · Kody: "Maybe just put that in the shipping." (mtg:76)
- **Today.** The rider picker offers nine kinds (`components/portal/procurement/order-paper/riders-model.ts:16-26`). The table also allows `other` (`supabase/migrations/00704_po_cost_lines_shipments.sql:73-75`) and has a `note` column (:68), and `upsert_po_cost_line` accepts both, plus a later `actualCents` (00704:209-210); the picker offers neither. A blank estimate is allowed (`riders-model.ts:55-60`), and a rider can be owed to someone other than the maker with its own payment act. "Bought it already" has only a Shipping field (`purchase-record-form.tsx:243-246`).
- **Change (on the paper).** The rider act reads **"+ Freight, crating, receiving, fees…"**. The kind list adds **Import tariff**, **Processing fee** and **Other (name it)**. Until the kind constraint changes, these ship as `other` with the name in `note`.

  ```
  Riders
    Import tariff · owed to the courier · amount not known yet · bill the client at cost
    Processing fee · owed to the courier · about 3% · amount not known yet · bill the client at cost
  ```

  When the courier's bill comes, the existing "Record payment to {payee}" fills the actual, and the rider joins "Bill N unbilled riders" (`ffe-section.tsx:2336`). Verify that a rider can be added after the order is marked placed.
- **Reuse vs new.** Reused: `po_cost_lines`, null estimate, payee, the rider payment. New: three picker labels and the "not known yet" copy. The "+ Another fee" row on Bought it already is R-17 (NEXT).
- **Size.** S.
- **Vision test.** The Document, the paper · checkout, then the courier's bill weeks later · margin (an unbilled fee is margin lost) · the paper remembers the ding, not Leah.

### R-08 · A checkout price rise is recorded with its reason; the client's price waits — F2

- **Quote.** Leah: "Ooh, that's going to be complicated later to figure out why we did that." (mtg:386) · "I know it says once you change it, it's done. But this is going to happen." (mtg:391) · Kody: "I think it's locked in… I'm going to have to change that." (mtg:395-396)
- **Today.** The maker payment form pre-fills the PO's remainder and never compares the amount with the paper (`components/document/line-unfold/record-payment.tsx:206-208`). The line's cost is locked: "Released lines change through Record a change." (`supabase/migrations/00809_us37_trade_pricing_core.sql:375-382`). Record a change offers Cancel, Credit, Claim, Change the maker and Remedy, but not "it cost more" (`components/document/line-unfold/change-order.tsx:26-35`). The ack path refuses too: accepting a price is "Refused with change_order_required when the line sits on a sent, signed or executed authorization… or a vendor payment is already recorded" (`supabase/migrations/00705_po_acknowledgments.sql:52-57`). **Already built:** "a cost change never moves the client price; it flags the line and HOLDS the markup", and `keep_client` is allowed on a released line (00809:39-46, 1343-1349); the price table draws "cost changed from … · Keep client price" (`components/document/pieces/price-table.tsx:636-648`). In the meeting, the $230.20 went into the white-glove rider, making it $529.20 with "Bill the client" ticked (mtg:374-378).
- **Change.** The payment form compares the amount with the paper (pieces plus riders) and asks once:

  ```
  Money out · Sierra bed                                         PO —
    Paid on 23 Oct    Amount $3,978.20    How  Studio card ••—
    That is $230.20 more than the paper ($3,748.00: bed $3,449.00 + white glove $299.00).
    Where did it go?
      ( ) The bed cost more                 bed $3,449.00 → $3,679.20
      ( ) A fee or shipping not on the paper   adds a rider to the order (R-07)
      ( ) Something else on this charge     records it as an expense (R-04) and
                                            takes it off this payment
      ( ) Not sure — leave it flagged       records the payment; the difference waits
    Why, in a few words  [ sale ended at checkout ]
    Records $3,978.20 paid to the maker. The client's price does not change.
    [ Record the payment · $3,978.20 ]
  ```

  Nothing is preselected. A typo is fixed in the amount field; there is no "I typed it wrong" choice. On a grouped order the question first asks **"Which piece?"** (pre-filled from the paper, opened only on a difference).
  After "The bed cost more", the line carries the existing flag with the reason:

  ```
  Sierra bed · cost changed from $3,449.00 to $3,679.20
  sale ended at checkout · recorded by Ashley, 23 Oct · margin on this piece down $230.20
  [ Keep the client's price ]   the studio absorbs $230.20
  [ Ask the client for it ]     opens Record a change → On the agreement, +$230.20 on the bed filled in
  ```

  The flag stays until someone chooses (Q-01). The same sentence appears beside "Paid" on Bought it already when a line is linked.
- **Reuse vs new.** Reused: the payment form, the cost-change trigger, `resolve_ffe_cost_change`, the price-table row, the amendment sheet. New: the comparison sentence and its four choices; a reason on the cost change; one writer that records an *actual* unit cost on a released line, touching internal columns only, which the lock refuses today.
- **Size.** M.
- **Vision test.** The Document, Money out · right after checkout · margin (protects the margin figure) · the books explain themselves later.

### R-09 · Receipt now or later, more than one file, owed quietly — F4

- **Quote.** Ashley: "I'm using Leah's logins, and she gets the emails." (mtg:157) · "an opportunity to still save it, and then I can upload it… Or a screenshot?" (mtg:159-160) · "If I attached a screenshot, could I add the receipt like a second attachment? … Later?" (mtg:174-178) · Kody: "come back in and attach a receipt once you get that receipt." (mtg:172)
- **Today.** A recorded purchase holds one file (`purchase-record-form.tsx:88`), stored in one column (`supabase/migrations/00703_studio_purchases.sql:78`) and filed only when the purchase is for this project (form :133-134). A maker payment also takes one file (`record-payment.tsx:212, 378-384`) and files it to the line it was opened from (`purchase-choices.tsx:42`, `receiptAnchor: { kind: 'line' }`). "Payments are never edited" (`record-payment.tsx:8`). There is no attach-later path. The Folio anchors to a section, a line or the letterhead (`hooks/use-folio.ts:18-21`), not to a money record. Screens 38–39.
- **Change.** Recording money and attaching paper are separate acts.
  - The field reads **"Receipts — add now or later"** and takes several files (a screenshot now, the PDF later).
  - Recorded with none: a quiet line under the money record, **"Receipt still owed"**.
  - Always there after recording: **"+ Add a receipt"**. Appending a file never edits the money, so "never edited" holds.
  - The receipt anchors to the **money record** (the payment or the purchase). Each line on that order reads **"Receipt · on the Rejuvenation order"**: one upload for a checkout of one piece or six.
  - Owed shows on the record, as a count on Money out (**"2 receipts owed"**), and in closeout. No Desk need (Q-04).
- **Reuse vs new.** Reused: Folio storage. New: a money-record anchor or link, the append-only act, the owed state. One schema change.
- **Size.** M.
- **Vision test.** The Document, Money out · the first hand buying on the owner's logins · margin · nothing nags; the paper waits.

### R-10 · "Bought it already" with a linked line can't bill the piece twice — hazard found while tracing (F6/F8 money truth, not a meeting ask)

- **Quote.** Leah, on freight billed to the client: "It would be new." (mtg:300) — the client pays for delivery, not for the piece again.
- **Today.** "Bill the client, at cost, on its own line" is ticked by default even when a line is linked (`purchase-record-form.tsx:84, 319-321`). A purchase bills its whole amount plus tax, premium and shipping (`lib/document/invoice-composer.ts:307-318`). The billing RPC refuses only a purchase that is already billed, not a piece already billed through its own price (`supabase/migrations/00822_us36_invoice_line_internal_cost.sql`, the purchase branch). A sold piece recorded this way could reach the client twice.
- **Change.** Verify, then: when a line is linked, the box reads **"Bill the client for the shipping and fees on this buy ($X)"** and is off by default, with **"The piece bills through its line."** under it. This is a precondition of Q-02's recommended default.
- **Reuse vs new.** Copy plus one composer rule (linked purchases bill shipping and fees only).
- **Size.** S.
- **Vision test.** The Document · recording a buy against a sold piece · margin · the client is never billed twice.

### R-11 · "Cost plus" says what it does until R1 is ruled — F6

- **Quote.** Leah: "if I could mark the freight up 10% just to make sure we're covered for anything weird that might happen… I don't want to be greedy." (mtg:307-308) · Ashley: "are you putting a markup on that as well?" (mtg:305)
- **Today.** A rider's "Bill the client" is on by default, with "at cost / cost plus" (`order-paper/riders.tsx:393-430`, `riders-model.ts:28-31`). The composer never reads the billing rule; it bills the actual, else the estimate, at cost (`invoice-composer.ts:351-355`), unless the studio types an override amount in the bill (:597-604). No percent is stored. Whether the client sees cost plus is open ruling R1 (`supabase/migrations/00704_po_cost_lines_shipments.sql:96-97`).
- **Change.** Until R-16 lands, choosing "cost plus" prints: **"Set the billed figure when you bill. Patina doesn't add a percent yet."** Leah's 10% on the bed's $299 white glove is possible today by typing $328.90 in the bill.
- **Reuse vs new.** Copy only.
- **Size.** S.
- **Vision test.** The Document, the paper · adding delivery at checkout · margin · no label that promises a sum it doesn't do.

### R-12 · "Order together" from the job, using the vendor page's Order all — F5 (entry)

- **Quote.** Leah: "I think it'd be nice to be able to group your orders… these are both from Rejuvenation." (mtg:462-463) · Ashley: "you would have to go through each item and put in probably the order information." (mtg:457) · Kody: "come into your vendor page and then you would see everything that was queued up to order with them for a job… a block of items." (mtg:489)
- **Today.** One PO is one maker and one job (`create_purchase_order`, `supabase/migrations/00450_ffe_po_compat_and_media_dedupe.sql`). The vendor page's "Order all — N items · ready · unordered" lays one paper per (maker, job) from ready lines only (`components/document/orders-book-vendors.tsx:614-645, 710-728`), mounted on vendor → Orders (:1168). Lines not yet ready don't appear at all, the same silence as F1. The way in is Ledgers → Purchase orders → Vendor accounts, whose rows say only terms and "open page →" (screen 47). On the job, "Prepare a PO" opens a paper with one line (`purchase-choices.tsx:25`).
- **Change.**
  - **NOW (entry).** When two or more ready lines on a job share a maker and a planned place, the section head offers **"2 ready from Rejuvenation · Order together →"**. It opens the existing `OrderPaperQueue` for this job and maker. One paper is created only when the studio saves or acts on it.
  - **NEXT (the block).** VendorOrderAll is split into one block per job. Ready lines start ticked; lines not ready show with their R-01 reason and no tick; the planned place splits the block:

    ```
    REJUVENATION · ORDERS
    The Harchess job                                  2 ready · 1 waiting
      [x] Stanton adjustable drapery rod      {room}
      [x] Eden swing arm sconce               {room}
      [ ] {another piece}       waiting on the client's deposit (A1)
      To the Harchess home · one order
      [ Order these 2 together → ]        Nothing is sent until you choose how.
    ```

    When ticked lines go to two places: **"Two places, so two orders: 2 to the Harchess home, 1 to {place}. [ Prepare 2 orders → ]"** (F-05; Kody: "You would do two separate orders." Leah: "Yep." mtg:479-480). The Vendor accounts row gains **"2 queued · the Harchess job"** only when something is queued. The job's "Order together" opens this same block, pre-ticked; there is no separate tick mode.
- **Reuse vs new.** Reused: `readinessOf`/`deriveOrderReadiness`, `OrderPaperQueue`, Order all, one ship-to. New: the head suggestion (NOW); grouping by job, waiting rows, the two-places sentence and the queued count (NEXT). No schema change.
- **Size.** S (NOW) · M (NEXT).
- **Vision test.** The Document, Pieces & purchasing and the vendor page · the buyer sits down with one maker's cart open · margin · one block instead of N unfolds.

### R-13 · "Record the checkout": one sheet for one checkout — F5 (record) · NEXT

- **Quote.** Kody: "you would want to do a single money out line because you'd have one receipt for six items… but still have the ability to… track the shipping separately." (mtg:476) · Leah: "Here's the order number that attaches to this. And then we can still load in the order confirmation." (mtg:482) · "easily saving that order confirmation to all three items" (mtg:496)
- **Today.** Recording a web checkout takes three trips: mark as placed (through the one review), then "Vendor confirmed by phone or email?" for the order number, `vendorPoNumber` (`components/document/po-preview.tsx:446-460`, screens 11–12), then "Record a payment" from one line (`purchase-choices.tsx:36-42`), whose receipt files to that line only (:42).
- **Change.** Once the paper is marked placed, its record line offers one sheet that composes the existing writes, in this order:

  ```
  REJUVENATION · THE HARCHESS JOB · 2 PIECES
  Placed on their site or by phone · 24 Oct

  Record the checkout
    Their order number   [ RJ-        ]     also the payment's reference
    Card charge          [ $      ]   with [ Studio card ••— ▾ ]
      Stanton adjustable drapery rod   $—  (from the paper)
      Eden swing arm sconce            $—  (from the paper)
      Freight                          [ $   ]   fills the order's Freight rider
      Fees                             + Import tariff, processing fee… (R-07)
      Something else on this charge    + an expense (R-04)
    Receipts             [ Attach ]   or  leave it owed (R-09)
    Arrives about        [ date ]   for both pieces on this order
  [ Record the checkout ]      One payment, one receipt, both pieces.
  ```

  - The order number is typed once: it writes `vendorPoNumber` and pre-fills the payment reference.
  - Per-piece amounts come from the paper and open only when the card charge disagrees with the itemized total, which raises R-08's question.
  - Freight fills the **actual** of the order's existing Freight or White glove rider; it adds a rider only if none exists, so one charge never has two writers.
- **Reuse vs new.** Reused: every write (ack log, PO payment, riders, order ETA). New: the sheet that composes them and the itemized comparison.
- **Size.** M.
- **Vision test.** The Document, the paper · the minute after "Pay now" · margin · one entry for one checkout.

### R-14 · The ETA says what it covers — F9 (kept) and F5

- **Quote.** Leah: "I would add 12 weeks… January 15th, we should be getting something." Kody: "you can always come in and change it." (mtg:452-453) · Ashley: "you could have separate shipping dates on them" (mtg:475)
- **Today.** The line's "Confirmed ETA" writes the PO's ETA (`components/document/line-unfold/movement-cell.tsx:197-221`; `set_purchase_order_eta`), and is refused without a PO (:216). Shipments carry their own `current_eta` and per-piece quantities (`supabase/migrations/00704_po_cost_lines_shipments.sql:122, 158-163`; screens 48–49).
- **Change.** On an order with more than one piece the field reads **"Arrives ~{date} · for both pieces on this order"**. When the sconce ships first, "Record dispatch · Pieces on this shipment: 1 of 1 · Eden swing arm sconce" gives it its own date; the rod keeps the order's benchmark. No per-line ETA field.
- **Reuse vs new.** One clause of copy.
- **Size.** S.
- **Vision test.** The Document, Movement · setting the benchmark · margin · one date, said honestly.

### R-15 · Keep the field-app receiving, the payment record and the release-and-record act as they are — F12

See §6. No change beyond R-06's rename.

### R-16 · A freight markup that computes — F6 · NEXT, after Q-05

- **Quote.** Leah: "I feel like we have… a healthy markup on this job. I wouldn't want to mark her up too much more on the freight… if I could mark the freight up 10%…" (mtg:306-307) · "This is probably why we mark up the freight" (mtg:362)
- **Today.** See R-11. The job's markup override "covers goods lines… never freight/delivery/install" (`00809:47-48`).
- **Change.** "Cost plus" carries a percent. A job can set its freight markup (Q-05 default: the studio's, 0%), and each rider can override it.

  ```
  White glove · owed to the maker · $299.00
    [x] Bill the client   [ cost plus ▾ ] [ 10 ]%
    The client sees  White glove delivery  $328.90
    The studio keeps $29.90 · the job's freight markup (10%)
  ```

  "Bill N unbilled riders" pre-fills $328.90; the internal cost stays $299.00 for the margin figure through the existing internal-cost record (`00822_us36_invoice_line_internal_cost.sql`). The client sees one delivery figure, never a "markup" row. A rider that has absorbed a price rise can't bill silently: it says **"includes $230.20 not on the maker's shipping line"** and points to R-08.
- **Reuse vs new.** Reused: `billing_rule`, the composer override, the internal-cost record. New: a stored percent (job and rider), the read-out. One schema change.
- **Size.** M.
- **Vision test.** The Document, the paper and the bill · adding delivery · margin (the first dollar) · delivery reads as delivery, at a figure chosen on purpose.

### R-17 · "+ Another fee" on Bought it already — F3 · NEXT

- **Quote.** As R-07.
- **Today.** Studio purchases have Shipping and Buyer's premium only (`components/document/purchases/purchase-record.ts:31-49`; form :229-246); they have no riders.
- **Change.** A **"+ Another fee"** row under Shipping with the same kind, owed-to and "not known yet" amount as R-07.
- **Reuse vs new.** New fields on the purchase (schema change).
- **Size.** M.
- **Vision test.** The Document · a store buy with a fee · margin · the same fee looks the same on either door.

### LATER, only when a real buy needs it

- **R-18 · A grouped "Bought it already"** (`studio_purchase_lines`, an arrival trigger over lines, a shipment link). Today a studio purchase covers at most one line (00703:63, 119-122), and `po_shipments.purchase_order_id` is NOT NULL (00704:115). Build only if a real multi-piece store buy (not a web checkout of shipping pieces) needs it. L.
- **R-19 · Freight share per piece, read-only** (Q-03 option B): "+$— of the order's freight", pro-rata by trade cost, computed not stored. Useful if a piece is returned. S.
- **R-20 · "ETA passed" on the buyer's Desk.** Inferred from Leah's "benchmark" (mtg:452); nobody asked for a reminder. Ask Leah before building. The Desk has no such need today (`lib/document/desk-derivation.ts:114-162`). If built: it rises once, the day after the benchmark passes with no shipment recorded, names the piece, and stands down once a shipment covers it. S–M.
- **R-21 · Named rider kinds in the schema** (Import tariff, Processing fee), if `other` plus a name proves out. S.

---

## 4 · Phasing

**NOW — before the next purchases on the Harchess job** (small; mostly discoverability, receipt-later, fees and variance):

| Id | What | F | Size |
|---|---|---|---|
| R-01 | Next row says why and offers the act; Order returns without refresh | F1 | S |
| R-02 | Short client payment names the gap and what stays held | F11 | S |
| R-03 | "For a job?", the ship-to fold, the stray notice | F7 | S |
| R-04 | "An expense to pass through" first in Add items; one name for Bought it already; the count | F8 | S |
| R-05 | "No quote on file… the checkout total is the price" | F10 | S |
| R-06 | "Ordered on their site or by phone — mark as placed" | F12 | S |
| R-07 | Import tariff, Processing fee, Other (name it); "amount not known yet" | F3 | S |
| R-08 | Price-rise question on Money out; reason on the cost change; client's price waits | F2 | M |
| R-09 | Receipts now or later, several files, on the money record; "receipt still owed" | F4 | M |
| R-10 | Linked "Bought it already" can't bill the piece twice (verify first) | hazard | S |
| R-11 | "Cost plus" says what it does | F6 | S |
| R-12 (entry) | "2 ready from Rejuvenation · Order together →" opens the existing queue | F5 | S |
| R-14 | ETA "for both pieces on this order" | F9/F5 | S |

Acceptance on the Harchess job: the Rejuvenation pair can be ordered on one paper from the job; the bed's $230.20 can be recorded as "the bed cost more" with the client's price unchanged; the wallpaper's tariff and processing fee sit on the paper as named riders with no amount until the courier bills; Ashley can record a payment with a screenshot and add the PDF later; Kody's den no longer appears on the Harchess ship-to.

**NEXT:** R-12 (per-job block on the vendor page), R-13 (Record the checkout), R-16 (freight markup, after Q-05), R-17 (fees on Bought it already).

**LATER:** R-18 to R-21.

---

## 5 · Open rulings for the founders

Each was asked in more than one proposal; the ids below replace J-1–J-4, G1–G5, R-M1–R-M2 and carry R1.

| Id | Question | Options | Recommended default |
|---|---|---|---|
| **Q-01** (was R-M1, G3) | Who absorbs a checkout price rise, and who decides? | A. Preselect nothing: the line stays flagged, both buttons show the dollar effect, the owner (or whoever holds pricing) chooses. B. The studio absorbs automatically below a threshold the studio sets. C. Always ask the client through Record a change. | **A.** The buyer can record and "leave it flagged" (Ashley buys on Leah's logins; absorbing is the owner's call). Leah leaned towards absorbing small rises ("I don't want to be greedy", mtg:308), so a threshold is a reasonable later step, but it's a founder call. |
| **Q-02** (was J-1, G5) | Must "Bought it already" respect the deposit gate? (`purchase-record.ts:166-185` has no such check; the paper does.) | A. Allow, warn before ("The deposit (A1) hasn't cleared. If you've already bought it, record it."), mark after ("Bought before the deposit cleared (A1)"). B. Refuse until the deposit clears. C. Allow for the owner only. | **A**, a purchase already made is historical truth (US-50 `direction.md:147-149`), **conditional on R-10** so the piece can't bill twice. |
| **Q-03** (was G2, J-2) | How is shipping allocated across a grouped buy? | A. On the order: one rider, one client line, no piece's price moves. B. A, plus a computed per-piece share read-out. C. On one piece (Leah's "for now", mtg:483-485). | **A** (riders already sit on the order, `00704:56-59`). B can come later (R-19) without changing any record. C skews one piece's margin and breaks on a return. |
| **Q-04** (was R-M2, G4, J-3) | Is a receipt required before a purchase is "complete"? | A. Not required; "receipt still owed" on the money record, a Money out count and a closeout list. B. A, plus a Desk need to the person who holds the email, after a set number of days. C. Required before the line can be billed or the job closed. | **A.** Leah's reason is "bookkeeping and if we ever were to get audited" (mtg:155), which a closeout list serves without putting a gate in the buyer's way. |
| **Q-05** (R1, carried) | The freight markup default, and whether the client sees it. | A. Studio default 0% (at cost, as today); a job sets its own percent; a rider can override; the client sees one delivery figure. B. A studio-wide default percent (e.g. 10%). C. Per-rider only. D. Stay at cost; type an override in the bill (works today, R-11). | **A.** Leah's 10% was reasoned from this job ("a healthy markup on this job", mtg:306), so it is the Harchess job's setting, not the studio default. Until ruled, D is what works. |
| **Q-06** (was G1, J-4) | Which door does a web checkout of a piece that ships use? | A. The order paper, marked placed. B. A grouped "Bought it already". | **A.** Only the paper carries ship-to, riders, the ETA (`movement-cell.tsx:216`) and per-piece shipments. "Bought it already" stays for walked-out store buys, finds and expenses. |

---

## 6 · KEEP (F12 and F9)

Keep these as they are; only R-06's words change.

- **Release by phone or portal keeps the paper on file** (`order-paper/index.tsx:1261, 1346`). "That's nice." (mtg:147)
- **Record the payment with a reference and a receipt** (`record-payment.tsx:211-212, 378-384`). "That's super nice." (mtg:151)
- **Field-app receiving with photos and claims**, multiple pictures (screens 26–29, 56–57). "That's awesome." (mtg:193-194)
- **Ship-to with a door into Destinations** (`ship-to-choice.tsx:231`), dock and liftgate on the place (screens 32–34). Leah: "That's nice." (mtg:134-137)
- **The ETA as a benchmark, editable, with its history** (`movement-cell.tsx:256-285`; `eta_history`). "I think that's a nice benchmark." (mtg:454)
- **No client approve-or-deny for pass-through expenses** (mtg:470). R-04 changes where it's found, not how it works.
- The V26 rulings F-01–F-09 stand.

---

## 7 · PARKED

- **P1 · The job mailbox** (a job or purchasing address that takes in receipts and tracking). Leah: vendors "just have one email" and changing it "becomes a laborious thing"; Kody: other studios "aren't going to want to give a software platform access to their email server" … "let's not worry about automation." (mtg:165-172). R-09's "receipt later" is the manual answer for now.
- **P2 · Visual differentiation** ("some more lines, some more bold… just some highlights"; Studio Designer's orange and blue "draws your eye", mtg:511-523). This goes to the redesign review. Nothing here changes weight, colour or rules.

---

## Why the alternatives lost

- **Price rise as an ack difference (GB §5).** Refused on an authorized line or once a payment is recorded (`00705:52-57`), which is exactly the Harchess case. Where it is allowed, it writes `trade_price_cents` with markup, so the client's price would rise with no paper. R-08 writes internal cost only.
- **A third tick mode, "Order several together" (GB §2).** The head suggestion plus the per-job block, which has its own ticks, covers hand-picking with one component.
- **A "Receipt owed" need on the Desk the next morning (J).** Nobody asked to be reminded; it would nudge Ashley for an email that lands in Leah's inbox, and the studio would notice Patina. Kept as Q-04 option B.
- **Naming whose inbox holds the receipt (MT §3).** Patina doesn't know whose inbox a login's email goes to, and a typed name is one more field on every buy.
- **A new "Add an expense" head act (J).** The head already carries Add items and the billing doors; the expense goes first inside Add items, which still removes the four-step path.
- **A per-piece "Paid" column always open (GB §4).** Makes Ashley type every piece on every checkout; pre-filled from the paper and opened only on a difference.
- **Shipping entered in the checkout sheet as a new Freight rider (GB §4) while the paper already holds one (J frame 6).** Two writers, freight billed twice. The sheet fills the existing rider's actual.
- **"I typed it wrong" as a variance choice (MT §1).** Replaced by fixing the amount; a fourth choice, "Not sure — leave it flagged", was added because the buyer may not be the person who can absorb money.
- **A grouped studio purchase object.** A large lift (child table, arrival loop, shipment link) for a case the paper already covers (R-18, LATER).
- **A per-line ETA field.** Not asked; shipments already carry their own dates.
- **Invented scenario facts.** The rings "in the same checkout as PO-1042" (J frame 9), a third Rejuvenation piece "on A2" (GB §1), the rod's room, and "the bed and wallpaper can't be ordered" (the wallpaper was handled before the payment was fixed) are dropped or marked illustrative. "Harchess sees" and "Ask Harchess" become "the client".
