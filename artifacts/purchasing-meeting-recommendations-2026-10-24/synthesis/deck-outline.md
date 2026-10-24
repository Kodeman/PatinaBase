# Deck outline · After the first buys

**US-54 · founders' deck for Kody and Leah · 19 sheets + the mockup storyboard · design-only**

Source of truth: `synthesis/recommendations.md` (R-01–R-21, Q-01–Q-07). Screens (local walk, 22 October) are in `artifacts/purchasing-workflow-review-2026-10-22/walk/screens/`; compressed copies are in `artifacts/purchasing-workflow-review-2026-10-22/deck/img/` (`*-crop.jpg`). Post-build captures in the session scratchpad (`buying-deck/img/`) are volatile and are wiped on restart, so re-capture them before relying on them.

## Presentation contract

- One job carries the story: **the Harchess job**. Never print the client's street, zip or phone. Say "the client", never a person's name, on any client-facing figure.
- The meeting's real figures may appear: Sierra bed $3,449.00 estimated and $3,679.20 at checkout (+$230.20), white glove $299.00, card charge $3,978.20, the client's check $23,123.19. Every other figure is `$—` or labelled **Proposed example**. Card endings read `••—`.
- Today screens are labelled **Today · local walk**. Proposed frames are labelled **Proposed · not built**.
- Use the Document's own type and tokens: hairline rules, no shadows, no gradients (D4), and no red/green status system. No dashboard tiles.
- Voice: calm, plain, designer-to-designer. Say "the paper", "the line", "money out". Say "Designer-Taught Intelligence" if it comes up, never "AI".
- Each workflow sheet answers: **what Leah or Ashley sees → what they do → what changes → who acts next**.
- At 1440, keep the Document shell and the central column. At 390, stack, wrap names, use 44px targets, and never scroll the page sideways.

---

## Sheets

### 1 · After the first buys
- **The point.** The path held. What went wrong was finding things, and money that didn't match the paper.
- **Content.** Title; "the Harchess job · 23 October walk-through · Leah, Ashley, Kody". Three lines: *It works: paper, release by phone, payment, ETA, receiving.* · *Hard to find: why Order was held, job places, expenses, ordering together.* · *Nowhere honest to put a difference: a price that rose, fees that come later.* Footer: **Proposal only · nothing built or purchased.**
- **Evidence.** `transcript/findings.md` F1–F12; screen `02v-pieces-overview-viewport-1440`.

### 2 · What we watched
- **The point.** Two real buys (the wallpaper and the Sierra bed) and one asked-for case (two Rejuvenation pieces in one checkout) produced twelve findings.
- **Content.** The F1–F12 table in plain words, each tagged *exists, not found* (F1, F7, F8, F10), *money truth* (F2, F3, F4, F6, F11), *new shape* (F5) or *keep* (F9, F12). P1 and P2 are greyed out as parked.
- **Evidence.** `findings.md`; `as-built.md` §1–9.

### 3 · Keep: what drew "that's super nice"
- **The point.** These stay as they are. Only one label changes.
- **Content.** Five crops with one quote each: the paper's release-and-record act; the payment with reference and receipt; ship-to with Destinations; the ETA benchmark; field-app receiving with photos and claims.
- **Evidence.** Screens `07-paper-bottom-actions-1440`, `38-purchase-record-form-1440`, `32-fabric-paper-ship-to-workroom-1440`, `26`–`29` (390); `order-paper/index.tsx:1261`, `record-payment.tsx:378-384`, `movement-cell.tsx:256-285`; mtg:147, 151, 194, 454.

### 4 · A web checkout is a paper marked placed
- **The point.** Only the paper carries ship-to, riders, the ETA and per-piece shipments, so a web checkout of a shipping piece goes through it. Grouping needs no new object (Q-06).
- **Content.** The four-lane swimlane from recommendations §2 (studio · vendor site · Patina · client billing), with the R-ids on the steps they change. A side note: walked-out store buys, finds and expenses go through Bought it already.
- **Evidence.** `movement-cell.tsx:216` (no ETA without a PO); `00704_po_cost_lines_shipments.sql:56-59, 112-124, 158-163`; `00703_studio_purchases.sql:119-122`.

### 5 · Order says why it's held — R-01
- **The point.** "My order button went away" was a deposit gate speaking at 11px. The Next row should say the reason and offer the act that clears it.
- **Content.** Before: the line unfold with no Next row and a muted reason list. After: `NEXT  Waiting on the client's deposit (A1) · $23,123.19 due  [ Record the payment → ]`. The reason-to-act table (5 rows). The section-head sum.
- **Evidence.** `next-act.ts:87-90`, `line-unfold.tsx:344`, `order-cell.tsx:132-142`, `authorization-derivation.ts:388-391, 446-472`; screens `30b-chair-buy-cell-1440`, `03v-line-unfold-viewport-1440`; mtg:120, 131, 239-240.

### 6 · The payment says what it leaves closed — R-02
- **The point.** A short entry is allowed, but it should say the gap and that it keeps the deposit gate shut.
- **Content.** Mock: "$2,000.00 less than the balance… 2 pieces stay held. [ Use $23,123.19 ]" and the matching line "Matches the balance. A1's deposit is clear, so 2 pieces can be ordered."
- **Evidence.** `invoice-folio.tsx:1205-1213, 1250-1256, 606-607`; mtg:222. Ordinary Folio opening is empty; landOn=record pre-fills the balance (invoice-folio.tsx:274–282; money-region.tsx:317). Make the paths consistent. There's no walk screen of the Folio payment panel; the sheet uses the mock only.

### 7 · The price rose at checkout — R-08 (1 of 2)
- **The point.** The $230.20 went into white glove because there was nowhere honest to put it. Money out should notice and ask once.
- **Content.** What happened: estimate $3,449.00, checkout $3,679.20, the rider became $529.20, billed to the client as delivery. The proposed payment form with "Where did it go?" and four unselected choices. "The client's price does not change."
- **Evidence.** `record-payment.tsx:206-208`, `00809_us37_trade_pricing_core.sql:375-382`, `change-order.tsx:26-35`, `00705_po_acknowledgments.sql:52-57`; mtg:374-378, 386, 391, 395.

### 8 · The client's price waits for the studio — R-08 (2 of 2) · Q-01
- **The point.** The bed-cost branch changes cost; Not sure leaves $230.20 unallocated and flagged without an invented reason. The client’s price waits.
- **Content.** The flagged line: "cost changed from $3,449.00 to $3,679.20 · Example reason: possible sale change · margin on this piece down $230.20 · [ Keep the client's price ] [ Ask the client for it ]". Q-01's options and the default (preselect nothing; the buyer can leave it flagged).
- **Evidence.** `00809:39-46, 1343-1349`; `price-table.tsx:636-648`; mtg:308, 362.

### 9 · Fees that come later — R-07 · NOW-next · L
- **The point.** A possible fee has no known amount yet. Type, rate and payee are unconfirmed until the vendor’s bill arrives; 3% was Kody’s guess and the site offered to cover new customs fees.
- **Content.** One possible import / processing fee, not two confirmed charges. Today Actual is entered separately on blur; the courier payment inserts a vendor payment only. A payment-to-Actual link is proposed new coordinated work, L, not existing reuse.
- **Evidence.** riders.tsx:477–511, 540–549; 00718:624–780; mtg:48, 76, 100. S blank-estimate copy is the minimal NOW slice.

### 10 · Receipt now or later — R-09 · Q-04
- **The point.** Recording money and attaching paper are separate acts. More than one file, owed quietly, no reminder.
- **Content.** Money out with "Receipts — add now or later", a screenshot attached, "Receipt still owed"; a week later, the PDF added with "+ Add a receipt". "2 receipts owed" on Money out. Q-04's default.
- **Evidence.** `purchase-record-form.tsx:88, 133-134`; `00703:78`; `record-payment.tsx:8, 212`; `purchase-choices.tsx:42`; `use-folio.ts:18-21`; screens `38`, `39`; mtg:157, 159-160, 172, 174-178, 436-440.

### 11 · Freight to the client, honestly — R-11 now, R-16 next · Q-05
- **The point.** "Cost plus" is a label that does nothing today. Say so now, and make it a percent once Q-05 is ruled.
- **Content.** Today: the rider row's "Bill the client · cost plus" and the composer billing at cost. NOW copy: "Set the billed figure when you bill." NEXT mock: white glove $299.00 → the client sees $328.90, the studio keeps $29.90 at the job's freight markup (10%). Q-05's options.
- **Evidence.** `riders.tsx:393-430`, `riders-model.ts:28-31`, `invoice-composer.ts:351-355, 597-604`, `00704:96-97`, `00809:47-48`; mtg:305-308.

### 12 · A buy that can't bill twice — R-10 · Q-02
- **The point.** Found while tracing, not asked: Bought it already with a linked line ticks "Bill the client" by default, so a sold piece could be billed twice. Fix this before Q-02's "allow" default.
- **Content.** The form's checkbox today, then the proposed "Bill the client for the shipping and fees on this buy ($X) · The piece bills through its line." Q-02's options (allow with a warning and a mark).
- **Evidence.** `purchase-record-form.tsx:84, 319-321`; `invoice-composer.ts:307-318`; `00822_us36_invoice_line_internal_cost.sql` (purchase branch); `purchase-record.ts:166-185`.

### 13 · Order together — R-12
- **The point.** Grouping already exists on the vendor page and is hard to find. Bring it to the job in NOW-next (M); give the vendor page a block per job next.
- **Content.** Today: Vendor accounts rows with no sign of waiting pieces, and Order all for ready lines only. NOW-next (M): "2 ready from Rejuvenation · Order together →" on the section head. NEXT: the per-job block with ticks, waiting reasons, and "Two places, so two orders".
- **Evidence.** `orders-book-vendors.tsx:614-645, 710-728, 1168`; `00450_ffe_po_compat_and_media_dedupe.sql`; screens `47-orders-vendor-accounts-1440`, `44-orders-book-1440`; mtg:457, 462-463, 479-480, 489.

### 14 · Record the checkout — R-13 (NEXT)
- **The point.** One checkout gives one sheet, one payment, one receipt and one order number typed once, and each piece keeps its own line.
- **Content.** The sheet mock, itemized: pieces from the paper, Freight filling the existing rider, fees, something else on this charge, receipts now or later, and "Arrives about … for both pieces". Today’s three trips shown as a strip: mark-as-sent is direct, not reviewed. Review is new under Q-07; composing linked writes is L, not copy.
- **Evidence.** `po-preview.tsx:446-460`; `purchase-choices.tsx:36-42`; screens `11-ack-check-1440`, `12-after-ack-1440`; mtg:476, 482, 496.

### 15 · Ships separately, arrives separately — R-14
- **The point.** The order's ETA is the benchmark; a shipment gives each piece its own date. No new ETA field.
- **Content.** "Arrives ~{date} · for both pieces on this order"; then Record dispatch "Pieces on this shipment · 1 of 1 · Eden swing arm sconce"; then the phone receiving that sconce.
- **Evidence.** `movement-cell.tsx:197-221`; `00704:122, 158-163`; screens `48-partial-shipment-form-4of6-1440`, `49-partial-shipment-saved-1440`, `26-phone-inspection-drawer-390`; mtg:452-453, 473-475.

### 16 · Places land on the job — R-03
- **The point.** The den went studio-wide because the People editor never asks about a job. Ask, fold other jobs' homes away, and name strays.
- **Content.** Today: ship-to listing every studio place. Proposed: "For a job?" in People; ship-to grouped On this job / Studio places / "A home on another job…"; the stray notice about Kody's den.
- **Evidence.** `studio-locations-editor.tsx:284-285`; `job-destinations-sheet.tsx:82-85, 145-157`; `ship-to-choice.tsx:68-77, 179, 231`; screens `32`–`34`; mtg:258-259.

### 17 · Expenses where Leah stands — R-04 · and two small truths, R-05 and R-06
- **The point.** Pass-through expenses already work, four steps deep. Put them first in Add items. And two S copy fixes, plus a separate M review extension under Q-07: no quote is fine for a web buy, and "Released" becomes "mark as placed".
- **Content.** The Add items menu today vs proposed ("An expense to pass through" first); the "Expenses to pass through · 3 · $— · billed at final billing" count. Two one-liners: "No quote on file. For a web checkout, the checkout total is the price." and "Ordered on their site or by phone — mark as placed".
- **Evidence.** Screen `37b-add-items-menu-1440`; `add-to-project-sheet.tsx:113-116`; `ffe-section.tsx:2141-2146, 2317-2331`; `authorization-derivation.ts:446-472`; `order-paper/index.tsx:1261, 1346`; mtg:199-200, 463-470.

### 18 · What comes when
- **The point.** Minimal S-sized NOW unblock before the next buys; larger NOW-next follow-ons in the same push; NEXT; ungated parked LATER.
- **Content.** Use the exact minimal NOW, NOW-next, NEXT and LATER lists and full-item sizes in recommendations §4. Full acceptance follows NOW-next, not the minimal unblock. R-18–R-21 are ungated parked ideas until their four-part vision test is stated.
- **Evidence.** recommendations §4.

### 19 · For you to rule · and what's parked
- **The point.** Seven questions, each with a recommended default. Nothing here is decided in code.
- **Content.** Q-01 to Q-07 with options and defaults (one row each). A footer band: **Parked**, P1 the job mailbox (mtg:163-172) and P2 visual differentiation, which goes to the redesign review (mtg:511-523).
- **Evidence.** recommendations §5, §7.

---

## Mockup storyboard

One continuous Proposed walk on the Harchess job, in four acts. Desktop frames are 1440 wide. Frames marked **390** must also be drawn at phone width. Real figures are only the meeting's; the rest are `$—`. The rooms come from the job's real lines (written `{room}` here). The rings are a **Proposed example**: the transcript says only that Leah never ordered them.

### Act 1 · Clear to buy

| # | Frame | The one act | Key copy | R | 390 |
|---|---|---|---|---|---|
| 1 | Pieces & purchasing, the Harchess job. The Rejuvenation pair is folded; each Next row is held by the deposit; the head adds them up. | Record the payment → | "2 pieces approved and authorized · waiting on the deposit (A1) — Record the payment →" · "NEXT · Waiting on the client's deposit (A1) · $23,123.19 due · Order opens as soon as it's recorded." | R-01 | **390** |
| 2 | The client-payment panel, pre-filled at $23,123.19 and typed short to show the sentence, then corrected. | Use $23,123.19 | "$2,000.00 less than the balance. $2,000.00 stays open, and the deposit on A1 isn't covered, so 2 pieces stay held." → "Matches the balance. A1's deposit is clear, so 2 pieces can be ordered." | R-02 | — |
| 3 | Back on the section, without a refresh: both Next rows read Order, and the head offers the pair. | 2 ready from Rejuvenation · Order together → | "One paper for both. Nothing is sent until you choose how." | R-01, R-12 | — |

### Act 2 · The Rejuvenation pair, one checkout

| # | Frame | The one act | Key copy | R | 390 |
|---|---|---|---|---|---|
| 4 | One paper, two lines. Ship-to grouped: **On this job** holds the Harchess home (private home · no dock · liftgate); Studio places below; "A home on another job…" folded. The den is gone. | Ship to the Harchess home | "On this job · Studio places · A home on another job…" · "No quote on file. For a web checkout, the checkout total is the price." | R-03, R-05 | — |
| 5 | The paper's riders: one Freight rider on the order, Bill the client on, cost plus showing its honest note. | + Freight, crating, receiving, fees… | "Freight · owed to Rejuvenation · $— · bill the client" · "Set the billed figure when you bill. Patina doesn't add a percent yet." | R-07, R-11 | — |
| 6 | The paper's foot after the outside checkout, then a proposed new review sheet (Q-07; today direct, F-06 covers Send only). | Ordered on their site or by phone — mark as placed | "Nothing is sent to Rejuvenation. This records an order you placed." | R-06 | — |
| 7 | NOW-next version of the money: one payment on the order, receipt field with a screenshot attached, ETA set. (NEXT variant, same frame: the Record the checkout sheet.) | Record the payment | "Receipts — add now or later" · "Arrives ~{date} · for both pieces on this order" · NEXT: "One payment, one receipt, both pieces." | R-09, R-14 (R-13 NEXT) | — |
| 8 | Phone, a week later: Ashley adds the PDF Leah forwarded. Each line reads where its receipt lives. | + Add a receipt | "Receipts · checkout-screenshot.png · order-confirmation.pdf" · on the line: "Receipt · on the Rejuvenation order" | R-09 | **390** |

### Act 3 · The bed and the wallpaper, money that didn't match

| # | Frame | The one act | Key copy | R | 390 |
|---|---|---|---|---|---|
| 9 | Money out on the Sierra bed's paper: $3,978.20 typed against the reconstructed $3,748.00 baseline, as the paper should have read, after correcting white glove $529.20 → $299.00. The question, nothing selected. | The bed cost more | "First correct white glove $529.20 → $299.00. As the paper should have read: $3,748.00; $230.20 below the charge. Where did it go?" · four choices · "The client's price does not change." | R-08 | — |
| 10 | The bed's line after recording: the flag with its reason and both dollar effects. | (none chosen; shown waiting) | "cost changed from $3,449.00 to $3,679.20 · Example reason: possible sale change · recorded by Leah, 23 Oct · margin on this piece down $230.20 · [ Keep the client's price ] [ Ask the client for it ]" | R-08, Q-01 | — |
| 11 | Possible fee, details unconfirmed until the bill. Later courier bill is illustrative. | Show a later bill · example | Proposed new payment-to-Actual link; today Actual entered separately. No confirmed rate or payee yet. | R-07 | — |

### Act 4 · Afterwards

| # | Frame | The one act | Key copy | R | 390 |
|---|---|---|---|---|---|
| 12 | Phone at the store: Add items opens with "An expense to pass through" first; the preset form for the curtain rings (**Proposed example**). | Record the buy · $— | "An expense to pass through · Rings, screws, paint. Billed to the client at cost at final billing." | R-04 | **390** |
| 13 | Field app at the Harchess home: the sconce has arrived and is photographed as good; the rod is still on its way on its own shipment. | Received — looks good | "Eden swing arm sconce · 1 of 1 received · Stanton adjustable drapery rod still on its way (ships separately)" | R-14, KEEP | **390** |
| 14 | The section's money line before final billing: expenses, riders and receipts owed, each with its door. | Bill 2 unbilled → | "Expenses to pass through · 1 · $— · billed at final billing" · "1 rider to bill" · "1 receipt owed" | R-04, R-09, R-07 | — |

Frame 1 at 1440, for the mock-up builder:

```
┌ PIECES & PURCHASING · the Harchess job ────────────────────────────────┐
│ 2 pieces approved and authorized · waiting on the deposit (A1)         │
│                                         [ Record the payment → ]       │
├────────────────────────────────────────────────────────────────────────┤
│ Stanton adjustable drapery rod · Rejuvenation · {room}                 │
│ NEXT  Waiting on the client's deposit (A1) · $23,123.19 due            │
│       Order opens as soon as it's recorded.   [ Record the payment → ] │
│ Eden swing arm sconce · Rejuvenation · {room}            same reason   │
└────────────────────────────────────────────────────────────────────────┘
```

Frame 8 at 390:

```
┌ THE HARCHESS JOB · MONEY OUT ──┐
│ Rejuvenation order · 2 pieces  │
│ Paid $— · Studio card ••—      │
│ 24 Oct · Ashley                │
│ Receipts                       │
│  checkout-screenshot.png       │
│  order-confirmation.pdf        │
│ [ + Add a receipt ]            │
└────────────────────────────────┘
```

R coverage: R-01 (1, 3) · R-02 (2) · R-03 (4) · R-04 (12, 14) · R-05 (4) · R-06 (6) · R-07 (5, 11, 14) · R-08 (9, 10) · R-09 (7, 8, 14) · R-11 (5) · R-12 (3) · R-13 (7, NEXT variant) · R-14 (7, 13). R-10 and R-16 appear on sheets 12 and 11 only, not in the walk. Frames needing 390: **1, 8, 12, 13**.

Sizing and phasing authority: recommendations §3–4. R-01 M, R-02 M, R-03 L, R-04 M, R-05 S, R-06 S rename + M review, R-07 L, R-08 L, R-09 L, R-10 L, R-11 S, R-12 entry M / block M, R-13 L, R-14 S, R-15 KEEP, R-16 L, R-17 M. No large follow-on is promised before the next purchase. Q-07 explicitly asks whether to extend V26’s Send-only review to external-order recording.
