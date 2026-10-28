# US-54 on top of Room Proof 08: where each change lands

**27 October 2026 · re-base of `recommendations.md` onto the designer-portal redesign (US-52, branch `redesign/designer-portal-round8`) · design-only, nothing built**

The recommendations were written against main (ee9c450a5+). This document says where each one lands once round 8 is finished, what round 8 already does, and what changes in the plan. Evidence was read at round-8 tip `3a6b60e46` against main `dab3e61b9`. Paths are relative to `apps/designer-portal/src/` unless they start with `supabase/` or `docs/`. Re-check every anchor when US-54 actually starts (§6).

## 1 · What round 8 changes for buying

- **One continuous job paper.** Chapters 01–10 replace the one-section-at-a-time page. Buying lives in **06 FF&E** (`FFESection` and `PiecesOverview` wrapped) and **08 Financials** (`MoneyRegion`). The left `DocSpine` retires: its section ladder moves to the right contents margin, and its money-ladder doors become chapter sub-labels (plan §Spec corrections 3).
- **Dense work unfolds in place.** The FF&E sheet opens inline as an embedded `BuildRoom` and pushes `?unfold=pieces&lens=…&line=` with no route change. Every instrument captures its opener and returns focus. A failed save shows an inline `role="alert"` and keeps the value; there's no whole-document remount (`docs/design/designer-portal-round8/DESIGN-CONTRACT.md`, "Return and editing contract").
- **A sixth sheet lens, `purchase`, ratified by Kody 2026-10-27** (`DECISIONS.md:22`). `components/document/pieces/purchase-lens.tsx` (575 lines, round-8 renderer only):
  - It groups lines by room with the columns Selection · Stage · Authority · Order or next act · Amount.
  - Filters: Ready to order, Waiting on something, On an order or bought, Bought by others (`:80-86`).
  - A waiting line shows "Not ready to order" plus the canonical readiness reasons joined as a sub-line, and its next act (`:489-503`).
  - A "Bought already" section lists the job's `studio_purchases` and embeds the existing `PurchaseRecordForm` (`:13-14`).
  - Its stated rule: "Nothing here drafts, sends or releases an order. Orders are prepared and sent from the line and the Orders book, draft first" (`:16-17`).
  - Its next-act word for an orderable line is **"Prepare a PO"** (`:115-127`).
- **C5 external fulfilment.** A line with `external_fulfilment_id` is someone else's to buy and bill. Round 8 already removes such lines from:
  - studio-purchase selectors: `purchases/purchase-record.ts` `buyableLines` now skips `isExternalResponsibility` (SQ-2216, `b496f98e6`);
  - the Bill and Price paths: `lib/document/invoice-composer.ts` returns a separate `external` partition (SQ-2211, `da4c1bb8f`);
  - FF&E pricing (SQ-2201, `66d5e3862`).

  C5 says `purchase_orders` are studio maker orders and `studio_purchases` are studio-paid buys, and neither is the external record (`contracts/C5-external-fulfilment.md:32-38`). WP-06 must never fake a PO.
- **Type floor and emphasis.** Inside the round-8 renderer, primary row text is 14px and metadata 12px (`DESIGN-CONTRACT.md:12`). Filled nav and save controls and a few shadows are allowed only under `[data-paper-renderer="round8"]` (P02). Terminal commercial actions keep explicit consequence language.
- **Seams round 8 touched and how.**
  - The order paper (`portal/procurement/order-paper/index.tsx`, 50 lines) changed only in focus return (`returnFocusTo`, `previewOpener`) and a read-error state with "Read the order lines again". Its copy and acts are unchanged.
  - `line-unfold.tsx` changed only in inspection focus return.
  - `change-order.tsx` gained a return ref.
  - Riders, record-payment, the Folio, ship-to, People's locations editor, Add-to-project, `orders-book-vendors.tsx` and `movement-cell.tsx` are unchanged.
- **Migrations.** Round 8 runs to at least `00887_round8_external_reading_grant_binding.sql`, and later round-8 waves have numbers reserved beyond that. Main's head is 00867. Every US-54 migration takes its number after round 8 merges, never from main's head.

## 2 · Where each recommendation lands

"Both" means a shared component that the legacy frame and the round-8 chapter render alike. "Round 8" means the purchase lens or another round-8-only surface.

| R | Lands in | Renderer | Round-8 status | What changes in the plan |
|---|---|---|---|---|
| R-01 held reason | Line unfold Next row (`next-act.ts`, `line-unfold.tsx`) **and** the purchase lens waiting row | Both + round 8 | **Partly done in the lens**: reasons show, but as a plain sub-line with no act | Reuse the R-01 reason-to-act map in two places: the Next row and each lens reason, so "Waiting on the deposit (A1)" becomes "Record the payment →". Drop the deck's "11px" argument for round 8, where the reason is legible; the gap is that it isn't an act. The refresh-in-place check is unchanged. |
| R-02 payment gap | 08 Financials, Folio (`accounts/invoice-folio.tsx`) | Both | Unchanged | Lands as written. The "2 pieces stay held" sentence may also feed the chapter's money sub-label, owned by the lead's index work. |
| R-03 places on the job | People (studio resource, WP-02 restyle) + Destinations sheet + ship-to | Both | Unchanged | Lands as written. Confirm the WP-02 People restyle has finished before editing `studio-locations-editor.tsx`. |
| R-04 expenses where Leah stands | Add-to-project sheet + lens "Bought already" | Both + round 8 | Lens already embeds `PurchaseRecordForm` | The preset entry lands in Add items as written. The "Expenses to pass through · N · $—" count goes in the lens's Bought already head rather than a new FF&E section line. |
| R-05 no-quote copy | Order paper | Both | Copy unchanged | Lands as written. |
| R-06 "mark as placed" | Order paper foot | Both | Copy unchanged; send preview now returns focus | R-06a is copy only. R-06b (the Q-07 review) must reuse the `previewOpener` / `returnFocusTo` pattern round 8 added. |
| R-07 named fees | Order riders (`riders.tsx`, `riders-model.ts`) + payment-to-Actual write | Both | Unchanged | Studio POs only. A rider never attaches to an external (C5) line. New write is reviewed at the frontier level. |
| R-08 price rise | Money out (`record-payment.tsx`) + flagged line (`pieces/price-table.tsx`) | Both | Unchanged | Exclude external lines from the variance prompt (`isExternalResponsibility`). Show the flag in the lens Amount column too. |
| R-09 receipt later | Payment / purchase record + lens Bought already | Both + round 8 | Unchanged | "Receipt still owed" also reads in the lens's Bought already rows; the Money out count is unchanged. The append path is new schema. |
| R-10 can't bill twice | `purchase-record-form.tsx` default + `invoice-composer.ts` | Both | **The same function round 8 just changed** (external partition) | Extend round 8's partition rather than adding a second one: a linked studio purchase bills shipping and fees only. Rebase onto SQ-2211's code; its tests are the regression floor. The Q-02 deposit warning sits beside round 8's `buyableLines` external filter. |
| R-11 cost-plus copy | Riders | Both | Unchanged | Lands as written. |
| R-12 entry "Order together" | **Moves**: from the FF&E section head to the purchase lens | Round 8 | The lens groups by room and offers "Prepare a PO" per line | Under the Ready to order filter, add a "by maker" grouping with one door per maker and job: "2 ready from Rejuvenation · Order together →". It opens the existing `OrderPaperQueue` instrument; a paper is created only when the studio saves. This needs ruling **Q-08**, because the lens's rule is that nothing in it drafts. No legacy section-head entry; legacy keeps the vendor page. |
| R-12 block | Vendor page `VendorOrderAll` (Orders book, WP-06) | Both | Unchanged | Lands as written. Coordinate with WP-06 if it is still open. |
| R-13 record the checkout | A new sheet from the placed paper | Both | New | Build it as a DocSheet / unfold instrument under the return contract (opener captured, no remount, Back/Forward safe, inline errors). Load it lazily: `/doc/[id]` is already at its raised tripwire (`DECISIONS.md`, G5-doc). |
| R-14 ETA copy | `line-unfold/movement-cell.tsx` | Both | Unchanged | Lands as written. |
| R-15 keep | Field receiving, payment record, mark-and-record | Both | Kept; round 8 added focus return only | No change. |
| R-16 freight percent | Riders + job setting + bill | Both | Unchanged | After Q-05. Rebase on round 8's composer partition (see R-10). |
| R-17 fee on Bought it already | Purchase record schema + form | Both | Form touched 2 lines (external filter) | New schema; studio purchases only. |

## 3 · Constraints US-54 inherits from round 8

1. **Don't touch the integration-lead-only files** unless the slice is the lead's: `doc/[id]/page.tsx`, `(document)/layout.tsx`, `lib/document/registry.tsx`, `document-index.ts`, `pieces/build-room-url.ts` (the lens URL contract), `room-origin.ts`, `packages/supabase/src/query-keys/document.ts`, the frame slot interface, `use-paper-renderer.ts`. Everything in §2 fits outside them, except the R-02 chapter sub-label, which is optional.
2. **One domain owner per commerce hook.** `use-commercial-documents.ts` is leased to commerce, and `ffe-section.tsx` to selections. Reuse mutation hooks for invalidation, and never add a "refresh the whole job" fan-out (plan §Spec corrections 11). R-01's refresh-in-place check uses the client-payment mutation's own invalidation.
3. **C5 boundary on every money change.** R-07, R-08, R-09, R-10, R-16 and R-17 each carry a test that an external line is excluded.
4. **Return and editing contract** for every new instrument (R-06b review, R-08 variance, R-09 append, R-12 queue door, R-13 sheet).
5. **Type and emphasis.** 14px rows and 12px meta inside the round-8 renderer. Consequence language stays on terminal acts: "Mark as placed", "Record the payment · $3,978.20".
6. **Gates.** Use round 8's own G1–G5 (plan §Verification) in addition to the US-54 oracles. Measure G5 for any first-load addition to `/doc/[id]`.
7. **No sends.** V22 and draft-first are unchanged; R-12's door opens a draft queue and sends nothing.

## 4 · Re-based phasing

Start only after round 8 is merged to main (WP-11 release candidate accepted, then the merge). Then do §6, then file the story.

| Wave | Contents | Renderer | Notes |
|---|---|---|---|
| **A · minimal unblock (S)** | R-01a (reason in the Next row), R-02a, R-04a, R-05, R-06a, R-07a, R-11, R-14 | Both | Copy and single controls in files round 8 left unchanged or touched only for focus. Low merge risk. |
| **B · lens and entry (M)** | R-01 reason-to-act map in the Next row **and** the lens; R-04 count in the lens; R-12 entry in the lens (after Q-08); R-02 gap feedback; R-03 places; R-06b review (after Q-07) | Both + round 8 | Lens work is one owner (`purchase-lens.tsx` and its test). R-03 waits for the WP-02 People restyle. |
| **C · money writers (L, migrations)** | R-10 first (it gates Q-02's "allow" default), then R-08, R-09, R-07 payment-to-Actual link | Both | Numbers after round 8's head. Frontier-level review per migration. C5 exclusion tests. |
| **D · NEXT** | R-12 vendor block, R-13 checkout sheet (lazy), R-16 (after Q-05), R-17 | Both | R-13 measured against G5. |

R-18–R-21 stay parked.

## 5 · Rulings, updated

- **Q-01 … Q-07 are unchanged**; see `recommendations.md` §5.
- **Q-08 (new). May the purchase lens hold a door that opens the order queue?** Recommended: **yes, a door, never a writer**. "Order together →" opens the existing `OrderPaperQueue`, which creates a paper only on the studio's save, exactly as the line's "Prepare a PO" door does. The lens's "nothing here drafts" rule still holds for the lens itself. Alternative: keep grouping on the vendor page only, which is today's hard-to-find path.
- **The US-51 verb ruling is now concrete.** Round 8 has put "Prepare a PO" into the lens's next-act words (`purchase-lens.tsx:115-127`), and the line's purchase choices use the same words. The deck's "Order" and "Order together" copy has to match whatever Kody rules, so rule it before Wave B.

## 6 · Before starting, after round 8 merges

1. Re-run the anchor check: `git diff --stat <this doc's main dab3e61b9>...main` over every §2 path. Re-open any that changed, especially `purchase-lens.tsx`, `invoice-composer.ts`, `purchase-record.ts`, and the order paper.
2. Confirm the `designer-paper-round8` rollout state. If the legacy renderer is still live for real studios, Wave A and the shared rows still reach them; the lens-only rows (R-01 lens, R-04 count, R-12 entry) don't. Decide then whether legacy needs the R-12 section-head entry. Recommended: no; legacy keeps the vendor page until it retires.
3. Read the true migration head on main and reserve US-54's numbers.
4. Merge-check against open round-8 follow-ups that touch the same files, such as the G5 debt trim of shared chunks and any WP-06 orders-book work.
