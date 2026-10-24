# As-built facts per finding (Explore pass, 2026-10-24, main ee9c450a5+)

Paths are relative to `apps/designer-portal/src/` unless they start with `supabase/` or `packages/`. Treat these as verified starting anchors. Re-read a file before quoting a line in the deck.

1. **F1 Order gate.**
   - `deriveOrderReadiness` (`lib/document/authorization-derivation.ts:439-478`) refuses the order when the line is trade scope, removed, not selected, has no maker, has no client price, is blocked by a decision, or is already on a PO.
   - **Deposit:** on a job with an executed agreement (`isCommercialOrigin`), the line must also be authorized ("Waiting on the authorization") and its deposit paid ("Waiting on the deposit (A{n})", :471). Deposit paid means `deposit_paid_cents >= deposit_required_cents` (`lib/document/project-commerce.ts:416-420`; `depositPaid` set at authorization-derivation.ts:252).
   - **Jobs with no agreement:** the act is allowed with the warning "No signed agreement behind this yet. You can still order." (:474).
   - **What the UI shows:** a "Before this can be ordered" list replaces Order (`components/document/line-unfold/order-cell.tsx:132-142`). "Prepare a PO" is disabled when not ready (`components/document/purchases/purchase-choices.tsx:25`). The strip sentence reads "Authorized — the purchase order opens when the deposit clears (A{n})" (authorization-derivation.ts:388-391, rendered `components/document/line-unfold.tsx:469`). The schedule card shows "Orderable once it has: …" (`components/document/schedule/line-card.tsx:538`).
   - **Inconsistency:** `buyableLines` (`components/document/purchases/purchase-record.ts:166-185`) has no authorization or deposit check, so "Bought it already" can record a buy on a line whose PO path is gated.
   - In the meeting, the reason list existed, but the people driving read it as "the button went away".
2. **F2 Price variance.**
   - **The lock:** `_ffe_pricing_lock_reason` (`supabase/migrations/00809_us37_trade_pricing_core.sql:364-402`) refuses `set_ffe_line_pricing` (unit_cost too) when the line is on a PO, on a sent / signed / executed authorization ("Released lines change through Record a change"), on a draft authorization, invoiced ("price stays as billed"), or configuration-locked.
   - **Ack mismatch path (PO only):** a mismatch becomes a `po_ack_lines` row, and `resolve_ack_line` "accepted" writes the vendor unit price into `trade_price_cents` (`supabase/migrations/00705_po_acknowledgments.sql:45-50`).
   - **Cost-change flag:** a cost change raises `pending_cost_changed_at` and holds the old markup until `resolve_ffe_cost_change` (00809:36-46, 180, 1335).
   - **No actual-paid-vs-recorded-cost variance exists for a recorded purchase.** The `account-band.tsx:601` "variance" is budget variance.
3. **F3 Fees.**
   - **Recorded-purchase fields:** kind (Store buy / Find / Antique or auction / Expense / Sample fee), description, payee, optional vendor, date, amount, tax, buyer's premium (finds and lots only), shipping, paid with, returnable / return-by, this project vs studio overhead, optional line, and "Bill the client, at cost" (`components/document/purchases/purchase-record.ts:14-49`; form `purchase-record-form.tsx:231-320`). There is no "other fees" field and no fee that arrives later.
   - **PO riders:** 9 kinds (Freight, Crating, Liftgate, Residential delivery, White glove, Receiving, Storage, Handling, Restocking) (`components/portal/procurement/order-paper/riders-model.ts:16-26`), plus "other" in the DB (`supabase/migrations/00704_po_cost_lines_shipments.sql:73-75`).
4. **F4 Receipt later.**
   - **One file only:** a single `File` state (form :88) stored in the single column `receipt_document_path` (`supabase/migrations/00703_studio_purchases.sql:78`). It is filed only when the purchase is "for this project" (form :134).
   - **No attach-later path:** the table is written only through `record_studio_purchase` and `void_studio_purchase` (00703:170, 456), and neither updates the receipt.
5. **F5 Grouped buy.**
   - **One line per purchase:** a studio purchase covers at most one `ffe_item_id` (00703:63). The RPC refuses a line that already has a live purchase (00703:319).
   - **VendorOrderAll is PO-only:** the vendor page "Order all — N items" (`components/document/orders-book-vendors.tsx:621-738`) queues only PO papers (`OrderPaperQueue`), one per (vendor, project), from ready, unordered lines. It is mounted on vendor → Orders page (:1168). Vendor pages are reached via Ledgers → Purchase orders → Vendor accounts.
   - **Shipments are PO-only:** `po_shipments` has `purchase_order_id` NOT NULL, and `po_shipment_lines` holds per-line quantities (00704:112-163). Neither is linked to `studio_purchases`.
   - **Recorded-purchase arrival:** goes through a receiving inspection keyed by `studio_purchase_id` (`supabase/migrations/00865_studio_purchase_arrival.sql:23-30`; `components/document/purchases/purchase-arrival.tsx:19`).
   - **One PO = one vendor + one project:** `create_purchase_order` in `supabase/migrations/00450_ffe_po_compat_and_media_dedupe.sql` refuses a cross-project or cross-vendor line.
6. **F6 Freight bill-to-client.**
   - **The checkbox:** "Bill the client" is on by default (`components/portal/procurement/order-paper/riders.tsx:393-430`). It sets `po_cost_lines.billable_to_client` and creates no job item. The row joins "unbilled riders" (`lib/document/invoice-composer.ts:343-348`), which "Bill N unbilled riders" opens in the composer (`components/document/ffe-section.tsx:2336`).
   - **Markup:** a `billing_rule` at cost / cost plus exists (riders-model.ts:28-31), but no markup percent is stored. The composer bills actual, else estimate, at cost, and the studio may type an override amount (invoice-composer.ts:351-355, 598-607). Whether cost-plus is ever shown is **open ruling R1** (00704:96-97).
7. **F7 Destinations.**
   - **Studio-wide:** destinations are `studio_locations` rows (`upsert_studio_location`, `supabase/migrations/00856_job_destinations.sql:14`) with `hasDock`, `needsLiftgate`, receiving hours, storage terms, instructions, `isPrivateHome` and default receiver (00856:43-56).
   - **Job-scoped:** the join table is `project_destination_locations` (00856:152-252).
   - **Two creation paths:** the job Destinations sheet saves, then auto-adds the new location to the job (`components/document/destinations/job-destinations-sheet.tsx:82-85`), and existing studio locations have an "Add to job" toggle (:145-157). The studio-wide People editor (`components/document/people/studio-locations-editor.tsx`) has Dock and Liftgate selects (:284-285) and does not add to a job. That is the likely origin of Kody's studio-wide "den".
   - **Ship-to choice:** lists job locations first, then studio, site and other (`components/portal/procurement/order-assistant/ship-to-choice.tsx:76`), and opens the Destinations sheet (:231).
8. **F8 Incidental expenses.** **These already exist.** Add to project → "Bought it already" (`components/document/schedule/add-to-project-sheet.tsx:114-116, 184`) → kind Expense, "No line" (`purchase-record-form.tsx:311-322`). There is no client approval, and it is billable at cost by default. It shows in "unbilled purchases" and is billed later through the composer (invoice-composer.ts:298-319; ffe-section.tsx:2319). The 00703 header calls it "a studio-paid expense to pass through".
9. **F9 ETA.**
   - **Where it's set:** the line unfold Movement cell has an inline "Confirmed ETA" field with an optional "Why the ETA moved" note. It confirms with "eta updated — arrives ~{date}" (`components/document/line-unfold/movement-cell.tsx:197-221, 256-285`).
   - **What it writes:** `useUpdatePurchaseOrderETA` calls `set_purchase_order_eta` (`packages/supabase/src/hooks/use-procurement.ts:903-935`; 00698), which keeps `eta_history`. The ETA is **per PO**.
   - **Other ETA sources:** each shipment has `current_eta` (00704:122), and an ack can set `confirmedEta` (00705).

## Evidence screenshots (local walk, 2026-10-22, pre-US-51 build names in some)
`artifacts/purchasing-workflow-review-2026-10-22/walk/screens/`:
- order paper: 05–09
- ship-to: 32–34
- record-purchase form: 38, 39
- after an antique was recorded: 40
- order register: 44
- vendor accounts: 47
- partial shipments: 48, 49
- release: 50–55
- phone receiving: 26–29, 56, 57
- desk: 43, 43b

Compressed copies already exist in `artifacts/purchasing-workflow-review-2026-10-22/deck/img/` and in `/private/tmp/claude-501/-Users-kody-Code-patina-merged/a9d6d2d8-91d1-4fbe-836d-9aebe777da59/scratchpad/buying-deck/img/` (post-build: purchase-record, desk-mine, register, paper-shipto, shipment, inbound, receive).
