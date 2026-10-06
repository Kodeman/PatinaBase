# Current state — designer buying flow (planning sweep, 2026-10-05, main @ 4207b8e2d)

This is the seed brief for R1. It comes from a read-only sweep, so check against code before citing it. Paths are relative to `apps/designer-portal/src` unless prefixed.

**Headline.** The R21 dissolve removed the dedicated procurement routes. Procurement now lives in two places: a slide-over **Orders book** on the Desk, and acts inside each project's FF&E line unfold in The Document. By Status and By Vendor no longer exist.

## 1. Surfaces
- `/desk` (`app/(document)/desk/page.tsx`). `?book=orders[&page=ledger|week|receiving|vendors][&vendorId][&projectId][&po&checkout=…]` opens the Orders book; the doorway is `components/document/desk-doorway.tsx`.
- `/doc/[id]`. FF&E sits at `#doc-section-project`. The spec book is at `/doc/[id]/spec-book` (`components/document/spec-books/spec-book-workspace.tsx`).
- `/drafting/[proposalId]` is the Drafting Room (`components/document/rooms/drafting/drafting-room.tsx`). `/people?role=maker` is the vendor directory. `/invoices/[invoiceId]/print`.
- Legacy redirects live in `next.config.js:386,464-471`:
  - `/portal/procurement` → `/desk?book=orders`
  - by-vendor → Vendors
  - receiving → Receiving
  - calendar and expediting → The Week
  - `/portal/projects/:id/ffe` → `/doc/:id#doc-section-project`
- **Orders book** (`components/document/orders-ledger.tsx`). Its pages are text links, not tabs:
  - **Ledger.** POs grouped by vendor, send/resend/PDF, log ack, project and payment filters, a "same truck" ETA.
  - **The Week** (`orders-book-week.tsx`). An 8-week grid with delivery conflicts (`lib/procurement/delivery-conflicts.ts`).
  - **Receiving** (`orders-book-receiving.tsx`). Stats, the awaiting-inspection queue, claim acts, and a Settled fold.
  - **Vendors** (`orders-book-vendors.tsx`). Terms, thread and open orders, with "Order all — N" and "Brief vendor".
- **Order Assistant** (`components/portal/procurement/order-assistant/`) is a side sheet: review → coverage → details → created. Catalog vendors skip details and go to Stripe Checkout.

## 2. The flow
1. **Spec / price.** Proposal lines are priced trade/markup/client in `ScheduleLineUnfold` and `FFEScheduleBuilder` (bulk markup at `ffe-schedule-builder.tsx:963`). Project FF&E lines are a separate model, added via "Add a line" (`ffe-section.tsx:1208`) or the spec book.
2. **Approval.**
   - Commercial jobs (`isCommercialOrigin`, `ffe-section.tsx:935`) get "Release for authorization", a ceremony, and an "authorized" stamp.
   - **Gap:** on non-commercial jobs the line unfold treats specified/quoted/approved as orderable (`line-unfold.tsx:75`), so a line can be ordered before client approval.
   - The Vendors page "Order all" needs `approved` (`orders-book-vendors.tsx:80`) but skips `poGate`.
3. **PO.** "Order with Assistant" (`line-unfold.tsx:518`) → `useCreatePurchaseOrder` → `create_purchase_order` RPC (`packages/supabase/src/hooks/use-procurement.ts:497`).
   - The button is disabled without a vendor.
   - The coverage step is a soft "Proceed anyway" gate.
   - **Ship-to is hardcoded** as `"Middlewest Studio · Madison WI"` (`step-review.tsx:31`).
   - Mixed-currency totals show 0.
4. **Send.** There are two different send UIs:
   - `PoPreview` (`po-preview.tsx`, with the PDF as confirmation plus Send / Mark sent) appears in the line unfold and the Ledger.
   - Older `PoSendActions` buttons appear on the Assistant's created step.
   - `PoSendPopover` is orphaned.
   - The personal message is a `TODO(W4 follow-up)` (`po-send-actions.tsx:26`).
   - Both call `supabase/functions/po-send/`.
5. **Ack.** `LogAckInline` exists only inside the Ledger resend preview, not in the line unfold.
6. **Ship / ETA.**
   - The line unfold Movement cell edits a single confirmed ETA (`line-unfold.tsx:84`); the Ledger can align ETA across POs.
   - **Nothing in the web UI moves a PO to production or shipped** (`useUpdatePurchaseOrderStatus` has zero callers).
   - There is no tracking or carrier field and no delivery events.
7. **Receive.**
   - `LogInspectionDrawer` opens from the unfold (only when the line is shipped or delivered) and from the Receiving queue.
   - Desktop photo upload is a placeholder ("desktop defers to mobile"). iOS photos show as existing but can't be opened.
   - Claims can be notified and resolved from both entry points.
8. **Install.**
   - **No web control sets `installed`.** `StageSelect` only renders when `FFEItemCard` gets a `stage` prop, and `ffe-schedule-builder.tsx:507` never passes one.
   - In the 15-step trail (`lib/document/procurement-lifecycle.ts:11-18`), steps 04, 07, 11, 12 and 15 read "no record".
9. **Invoice / deposit.**
   - Client side: "Bill" per line and "Bill N uninvoiced" open the invoice composer.
   - Vendor side: **there is no way to record a deposit or balance paid.** `useLogPaymentPaid`, `useAdvancePaymentToDue` and `useUpdateVendorPaymentTerms` have zero callers. Only catalog (Stripe) orders are actually payable.

## 3. Flags
- The Document has no flag (`the-document-pilot` is retired), and procurement is not flagged.
- Nearby flags: `studio-invoice`, `worktable`, and `design-build`/`agreement-library`/`agreement-parts`. The last three affect which jobs are commercial and therefore which get the authorization gate.

## 4. Wayfinding
- **Global entry points:** Studio Drawer "Orders" (`studio-drawer.tsx:565`), `g o`, ⌘K aliases (procurement/po/receiving), and mobile sheets.
- **From a project:** Desk → `/doc/[id]` → FF&E line → unfold. The section menu has "Chase the PO" (Ledger) and "File the claim" (Receiving) at `ffe-section.tsx:1229`. The colophon has "Brief a vendor".
- **Context loss:** the openers pass `projectId`, but the Ledger starts unfiltered (`orders-ledger.tsx:158`), and Week and Receiving ignore it (`:331-334`).

## 5. Hotspots (lines)
| Lines | File |
|---|---|
| 3571 | `doc/[id]/page.tsx` |
| 2222 | `use-procurement.ts` |
| 1775 | `ffe-schedule-builder.tsx` |
| 1714 | `ffe-section.tsx` |
| 1666 | `spec-book-workspace.tsx` |
| 1263 | `po-send/` |
| 1120 | `order-assistant/index.tsx` |
| 1057 / 992 | `invoice-folio` / `invoice-composer` |
| 890 | `schedule-line-unfold` |
| 706 / 702 / 621 | `orders-ledger` / `orders-book-vendors` / `line-unfold` |

**Warnings.**
- `docs/design/the-document/portal-vs-desk-feature-gap-matrix-v2.md` (2026-07-01) is stale. Several items it lists as gaps have since been built (PRC-06/07/11/12/18/24/27).
- Comments in `order-assistant/index.tsx:6,133`, `log-inspection-drawer.tsx:4` and `po-send-actions.tsx:6` describe pages that were deleted.
