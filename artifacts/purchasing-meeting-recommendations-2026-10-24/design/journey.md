# The web-checkout buy, approved to installed

**US-54 · Service / journey design · 24 October 2026 · Design-only, nothing built**

Owns F1, F7, F8, F9, F10, F12 and the end-to-end web-checkout journey. F2–F6 belong to other seats; this file only shows where they land in the flow. V26 is settled: one ship-to per order (F-05), one review before every Send (F-06), manual tracking (F-07), and the assigned buyer owns the order (F-03).

Code paths are relative to `apps/designer-portal/src/` unless they start with `supabase/`. "meeting:N" means line N of `transcript/meeting-2026-10-23.md`. Screens are in `artifacts/purchasing-workflow-review-2026-10-22/walk/screens/`.

## The finding behind the journey

A web checkout already works end to end, and it is the path the meeting walked and liked. The steps are Order, then the paper (ship-to, riders, bill-to), then **"Released by phone or portal — mark as sent"** (`components/portal/procurement/order-paper/index.tsx:1261`), then Record a payment with a reference and a receipt (`components/document/line-unfold/record-payment.tsx:211-212, 275-277`), then the ETA, the shipments, and receiving on the phone. Leah: "That's super nice" (meeting:151).

Grouping already exists too. The vendor page's "Order all — N items" lays **one paper per vendor and job** holding every ready line (`components/document/orders-book-vendors.tsx:615-620, 671-704`). Riders sit on the order, not on a piece: `po_cost_lines.purchase_order_id` is NOT NULL (`supabase/migrations/00704_po_cost_lines_shipments.sql:58`). Shipments carry per-line quantities (00704:112-163).

The trouble in the meeting was reading, not capability. Most of the work below is helping people find what is already there. Only two pieces are new: two Desk needs and a few copy changes.

**Default door (Ruling J-4).** If the piece ships to a destination, it goes through **the paper**, because only a PO carries ship-to, riders, ETA (`line-unfold/movement-cell.tsx:216` refuses an ETA without a PO), and shipments. If the studio walked out with it, or it is a pass-through cost, it goes through **Bought it already**.

---

## F1 · The gate says its reason and offers its act

**Today.** When a line isn't ready, `deriveNextAct` returns null (`components/document/line-unfold/next-act.ts:87-90`). The whole **Next** row disappears (`components/document/line-unfold.tsx:344-364`). The reasons drop into the third of six cells as an 11px muted list. Its heading, "Before this can be ordered", exists only as an aria-label (`line-unfold/order-cell.tsx:132-142`). The strip sentence "Authorized — the purchase order opens when the deposit clears (A1)" is also 11px (`lib/document/authorization-derivation.ts:388-391`, rendered at `line-unfold.tsx:469-472`). After Leah recorded the check, the Order act came back only after a refresh (meeting:235-237). Engineering should check whether the payment write refreshes the line's deposit read; this pass did not confirm it.

**Problem.** "My order button went away… I did something wrong" (meeting:120, 131). Then: "So we couldn't order because she hadn't." / "We hadn't recorded her payment yet." (meeting:239-240).

**Proposal.** The Next row never vanishes on a selected line. When the line can't be ordered, the row states the reason and offers the act that clears it. Order comes back in place with no refresh.

```
NEXT   Waiting on the client's deposit (A1) · $23,123.19 due     [ Record the payment → ]
       Order opens as soon as it's recorded.
```

| Reason (authorization-derivation.ts:446-472) | Next row reads | Act |
|---|---|---|
| Waiting on the deposit (A{n}) | Waiting on the client's deposit (A{n}) | Record the payment → |
| Waiting on the authorization | Waiting on the client's authorization | Open the authorization → |
| Needs a maker | Needs a maker before it can be ordered | Choose the maker → |
| Needs a client price | Needs a client price | Set the price → |
| Waiting on a decision | Waiting on a decision | Open the decision → |

When several reasons apply, the first one leads and the rest read "+2 more" and open the cell. The section head adds up what is held: **"2 pieces approved and authorized · waiting on the deposit (A1) — Record the payment →"**. On the vendor page, "Order all" names the lines it skipped: "1 more for Rejuvenation waits on the deposit (A1)."

**The inconsistency.** `buyableLines` has no authorization or deposit check (`components/document/purchases/purchase-record.ts:166-185`). That lets "Record a purchase already made" (`purchases/purchase-choices.tsx:31-33`) record a buy that the paper path would refuse. **Ruling J-1** (open) asks whether that should stay allowed. **Recommended default:** allow it, because a purchase already made is "historical truth" (US-50 `direction.md:147`). Say so before recording: *"The deposit (A1) hasn't cleared. If you've already bought it, record it. It will show as bought before the deposit."* Afterwards, mark the line *"Bought before the deposit cleared (A1)"*. The same act also goes by two names, "Record a purchase already made" and "Bought it already" (`schedule/add-to-project-sheet.tsx:114`). Use one.

Reuse: deriveOrderReadiness, the Next row, and the existing client-payment record Leah used (meeting:206-231). New: copy, plus a reason-to-act map.
Vision test: The Document · the morning the studio means to start buying · margin stream · nobody has to wonder whether they broke something.

## F7 · Destinations land on the job

**Today.** The Destinations sheet saves a place and adds it to the job (`components/document/destinations/job-destinations-sheet.tsx:82-85`). The People editor saves studio-wide and never asks about a job (`components/document/people/studio-locations-editor.tsx:284-285`). That is probably where Kody's den came from. Ship-to lists every studio location, with job places first and an "On this job" mark (`components/portal/procurement/order-assistant/ship-to-choice.tsx:70-77, 179`). So a private home from one job is offered on every job.

**Problem.** "Once you add her address in, then add it to the job… not be global. I forgot to do that with my den." (meeting:258-259).

**Proposal.**
1. Wherever a place is created inside a job (the paper, the Destinations sheet, a line), it lands on that job. This already happens; keep it.
2. A place created in the People editor asks **"For a job?"** and offers the job you came from. The other choice is "No job — a studio place (receiver, workroom)". A private home always needs a job.
3. On a job, ship-to shows **On this job** first, then **Studio places**, which are receivers, the studio and workrooms. Private homes from other jobs are hidden behind "A home on another job…". This is the narrowing that V26 already planned in P-10.
4. The Destinations sheet flags strays: *"Kody's den is a private home on no job. Add it to a job, or make it a studio place."*

Reuse: `project_destination_locations` (00856:152-252) and the sheet's Add to job act (:145-157). New: one prompt, one grouping, one stray notice.
Vision test: The Document · setting up the job's places · margin stream · the client's address never turns up on someone else's job.

## F8 · Incidental expenses are found where Leah stands

**Today.** Expenses already exist, but they sit four steps deep. The path is **Add items** (`components/document/ffe-section.tsx:2141-2146`), then **Bought it already**, the last entry under "Not in any catalog" (`add-to-project-sheet.tsx:113-116`, screen 37b), then kind **Expense** (`purchases/purchase-record-form.tsx:160`), then "No line" and "Bill the client, at cost, on its own line" (:311-321). They bill later through "Bill N unbilled purchases" (`ffe-section.tsx:2317-2331`).

**Problem.** "I never ordered her curtain rings… there are definitely more expenses… we just kind of continue to catalog." / "I'm not going to be like 73.97 for the gallon of paint, approve or deny." (meeting:463-470).

**Proposal.**
- Add an **Add an expense** act to the Pieces & purchasing head, beside Add items. It opens the same form preset to kind Expense, This project, No line, and Bill the client at cost. There is no client approval step; that matches her contract (meeting:468).
- After an order is marked placed, the paper offers *"Bought something extra in this checkout? Add it as an expense →"*. The form opens with the payee and date already filled.
- Change the description under Bought it already to *"Paid for already: a store buy, a lot, an expense like rings or paint, or a sample fee."*
- Print a running tally on the section's money line: **"Expenses to pass through · 3 · $186.40 · billed at final billing"**.

Reuse: everything except one head act and the tally.
Vision test: The Document · the moment she remembers the rings · margin stream (pass-through at cost) · no approve-or-deny ceremony.

## F9 + receipts · The Desk keeps two benchmarks

**Today.** The ETA is set inline with an optional "Why the ETA moved" note (`line-unfold/movement-cell.tsx:256-285`), and it is per PO. The Desk has a `return_by` need that is fed by a purchase signal (`lib/document/desk-derivation.ts:161, 362-373, 1784`). It has **no** need for a passed ETA and **no** need for a missing receipt (NeedKind union, `desk-derivation.ts:114-162`). A drafted "Arrival date request to the maker" already exists (`desk-derivation.ts:432`).

**Problem.** "That would be kind of a good benchmark… January 15th, we should be getting something." (meeting:452). For receipts: "come back in and attach a receipt once you get that receipt" (meeting:172).

**Proposal.** Two quiet needs on the **assigned buyer's** Desk, following F-03:
- **Receipt owed.** This rises the morning after a purchase or order payment is recorded without a receipt. It reads *"Receipt owed — Rejuvenation order, the Harchess job · placed 24 Oct"* with **[Attach the receipt]** and, as a secondary act, "No receipt — say why". Attaching later depends on F4's attach-later write.
- **ETA passed.** This rises once, the day after the benchmark passes, if no shipment is recorded. It reads *"ETA passed — Stanton rod was due ~14 Nov · no shipping word yet"* with **[Ask Rejuvenation for a date]**, which opens the existing draft (V22: the designer sends it), and "Set a new benchmark".

Nothing rises before a date passes, and nothing repeats. **Ruling J-3** (open) asks whether a receipt is required before a purchase counts as "complete". **Recommended default:** no. It stays owed on the Desk and never blocks receiving or billing.

Reuse: the Desk need pattern, the ETA write, the draft composer, and `sweep_procurement_clocks`, which is the existing nightly pg_cron sweep. New: two need kinds.
Vision test: Desk · the week nobody remembers to chase · margin stream · the studio hears only when a benchmark is actually missed.

## F10 · An Order without a quote is correct for a web buy

**Today.** No readiness reason asks for a quote (`authorization-derivation.ts:446-477`). That is why the wallpaper's Order opened without one. It was not the vendor setup Kody suspected (meeting:199-200).

**Proposal.** Keep it. When there is no quote, the paper says once: *"No quote on file. For a web checkout, the checkout total is the price."*

Vision test: The Document · the first web buy · margin stream · no false alarm.

## F12 · Keep

Keep these as they are, changing copy only where marked:
- the release-and-record act (`order-paper/index.tsx:1261, 1346`). Its copy changes to *"Ordered on their site or by phone — mark as placed"*, because "Released" now also means owner release (F-03).
- the payment record with its reference and receipt (`record-payment.tsx:368`)
- ship-to with a door into Destinations (`ship-to-choice.tsx:231`)
- the ETA field and its history
- receiving in the field app with photos and claims (screens 26–29)

"That's super nice" (meeting:151, 191, 197).

---

## Storyboard · the grouped Rejuvenation buy

**Scenario.** The Harchess job. The Stanton adjustable drapery rod and the Eden swing arm sconce are both from Rejuvenation, both approved and authorized under A1, and both ship to the Harchess home. They go through one checkout. Curtain rings are added in that same checkout as an expense. **Every figure is a placeholder.** Use the job's real numbers in the mockup. The mockup never shows the street or zip. Desktop is 1440 wide; frames 1, 10 and 11 must also work at 390.

| # | On screen | The one act | Key copy | Shows |
|---|---|---|---|---|
| 1 | Pieces & purchasing on the Harchess job. The Rejuvenation pair is folded, and the Next row is held by the deposit. | Record the payment → | "Waiting on the client's deposit (A1) · $23,123.19 due. Order opens as soon as it's recorded." | F1 |
| 2 | The existing client-payment record for A1: a check, with the reference "Check". On save, the Next row turns to **Order** in place. | Record | "Recorded. A1's deposit is clear, so 2 pieces can be ordered." | F1 (no refresh) |
| 3 | The section, grouped by vendor: a Rejuvenation block with 2 ready pieces. | Order together — 2 from Rejuvenation → | "One paper, one checkout. Each piece keeps its own ship dates." | F5 door, reusing VendorOrderAll on the job |
| 4 | One paper, two lines. Ship-to has an **On this job** group holding the Harchess home (private home, no dock, liftgate). The den is absent. | Ship to the Harchess home | "On this job · Studio places · A home on another job…" | F7, F-05 |
| 5 | The Destinations sheet opened from the paper, adding a place. | Add destination | "Saves to this job. Studio places live in People." | F7 |
| 6 | Riders on the paper: one Shipping rider on the order, with Bill the client on. No quote is on file. | Add shipping | "Shipping sits on the order, not on one piece." · "No quote on file. For a web checkout, the checkout total is the price." | F5/F6, F10; R1 and J-2 open |
| 7 | The paper's foot after the outside checkout, then the one review sheet. | Ordered on their site or by phone — mark as placed | "Nothing is sent to Rejuvenation. This records an order you placed." | F12, F-06 |
| 8 | Record the payment: one money-out line for the order. The vendor order number is the reference, the receipt is "Add now, or later", and the expense offer appears below. | Record the payment | "Bought something extra in this checkout? Add it as an expense →" | F4 lands here, F8 |
| 9 | The expense form, preset to Expense, Rejuvenation, today, This project, No line, and Bill the client at cost. | Record the buy · $38.00 | "Curtain rings for the Stanton rod — same checkout as PO-1042." | F8 |
| 10 | Ashley's Desk the next morning, and again in mid-November. | Attach the receipt / Ask Rejuvenation for a date | "Receipt owed — Rejuvenation order, the Harchess job" · "ETA passed — Stanton rod was due ~14 Nov · no shipping word yet" | receipts, F9 |
| 11 | Phone, in the field app at the Harchess home. The sconce has arrived and is photographed as good; the rod is still out on its own shipment. | Received — looks good | "Eden sconce · 1 of 1 received · Stanton rod still on its way (ships separately)" | F12, F5 per-line dates |
| 12 | The line is folded: Installed. The Money line reads "1 rider and 1 expense to bill". | Bill 2 unbilled → | "Installed 3 Dec · billed at final billing" | F8, F6 |

Frame 1 at 1440:

```
┌ PIECES & PURCHASING · the Harchess job ───────────────────────────────┐
│ 2 pieces approved and authorized · waiting on the deposit (A1)        │
│                                        [ Record the payment → ]       │
├───────────────────────────────────────────────────────────────────────┤
│ Stanton adjustable drapery rod · Rejuvenation · Primary bedroom       │
│ NEXT  Waiting on the client's deposit (A1) · $23,123.19 due           │
│       Order opens as soon as it's recorded.  [ Record the payment → ] │
│ Eden swing arm sconce · Rejuvenation · Primary bedroom   same reason  │
└───────────────────────────────────────────────────────────────────────┘
```

Frame 10 at 390:

```
┌ DESK · Fri 25 Oct ─────────────┐
│ Receipt owed                   │
│ Rejuvenation order ·           │
│ the Harchess job · 24 Oct      │
│ [ Attach the receipt ]         │
│ No receipt — say why           │
└────────────────────────────────┘
```

## Open rulings (each with a recommended default; none decided here)

- **J-1.** Must "Bought it already" respect the deposit gate? *Default:* allow it, and mark the line "bought before the deposit cleared".
- **J-2.** How is shipping allocated across a grouped buy? *Default:* one rider on the order, billed to the client as one line. Split it only if a piece is returned.
- **J-3.** Is a receipt required before a purchase is "complete"? *Default:* no. It stays owed on the Desk and never blocks.
- **J-4.** Which door does a web checkout of a shipping piece use? *Default:* the paper.
- **R1** (freight markup) and the price-rise ruling (F2) are open and owned by other seats. These frames don't settle them.

Parked, not designed: P1 (the job mailbox) and P2 (visual differentiation).
