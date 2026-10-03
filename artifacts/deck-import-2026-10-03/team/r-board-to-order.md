# Mood board to ordered product: chain trace (patina-merged, read-only)

Legend: **V** means I read it in the code. **I** means inferred. Confidence is H, M or L.

## 0. Summary
Two chains run from a board item to an order. Neither one carries the board pin's commercial data intact.
- **Proposal-owned board.** Path: pin, then "Send to the schedule", then `proposal_items`, then client signs (legacy activation or furnishings authorization), then `project_ffe_items`, then readiness check, then `create_purchase_order`, then `po-send`, then `po_payments` / Stripe.
- **Project-owned board.** Path: pin, then "Promote to project selection" (`promote_board_reference_to_selection`), then `project_ffe_items` as a *candidate*, then the same PO steps.

A PO requires all of these: `vendor_id` (a FK to `vendors`), `design_disposition='selected'`, a client price above 0 and, under the default spec-book template, a catalog `product_id` plus media. An image+URL pin has none of them, so it can never be ordered without manual repair.

## 1. Hop 1: board item (source data)
- **Table:** `proposal_board_items` (`supabase/migrations/00179_proposal_boards.sql:51-70`). Types are `product|capture|image|palette|note|room_scan`. Columns: `product_id` FK (nullable), `capture_id`, `image_url`, `data` JSONB. **V/H**
- **URL unfurl pin** (`apps/designer-portal/src/lib/mood-board/url-unfurl.ts:372-396`):
  - It is `type:'capture'` with `productId:null` and `captureId:null`.
  - `data` holds `name, vendor_name (brand), price_cents (retail), image_url, source_url, description`.
  - No SKU, dimensions, trade price or lead time. **V/H**
  - The extractor only parses OG / JSON-LD name, brand, description, retail price and images (`supabase/functions/capture-from-url/extract.ts:4-26`). **V/H**
- **Failed unfurl:** becomes `type:'note'` with only `source_url` (`url-unfurl.ts:400-420`). **V/H**
- **Uploaded image:** `type:'image'` (`apps/designer-portal/src/components/mood-board/board-add-rail.tsx` ≈272). **V/H**
- **Library product pin:** `productPickToBoardItem` (`board-add-rail.tsx:189-216`). `productId` is set; `data` = `name, price_cents, vendor_name, image_url`. **V/H**
- **Capture-inbox pin:** `captureToBoardItem` (`board-add-rail.tsx:158-187`). Carries `capture.product_id` (a draft personal product) and `source_url`. **V/H**
- **The extension / capture path does create a product, but URL unfurl does not.** `useCommitProposalCapture` → `commit_proposal_capture` (00516) creates a draft `products` row with dims, vendorId and sourceUrl (`packages/supabase/src/hooks/use-proposal-captures.ts:171-260`). The board's URL-unfurl path never calls it. **V/H**

## 2. Hop 2: board → schedule / proposal line ("Send to the schedule")
**UI entry points:**
- Inspector button: `apps/designer-portal/src/components/mood-board/board-schedule-inspector-action.tsx:27-95`, mounted at `board-room-inspector.tsx:455-461` only when `owner.kind==='proposal'` and the type is `product|capture`.
- Context menu: `board-room-controller.tsx:1863`, hidden unless the type is `product|capture`.
- Shell handler: `board-room-shell.tsx:629-655`.

**V/H**

**Helper:** `apps/designer-portal/src/lib/scope/board-schedule.ts:63-79` (`buildSendToScheduleArgs`) maps:
- `productId`
- `name ?? 'Board pick'`
- `quantity: 1`
- `unitPrice = priceCents ?? 0`
- `imageUrl`
- `scopeRoomId`
- `docCode` (consonant-prefix fallback)

The snapshot reader (`board-schedule-inspector-action.tsx:13-24`) reads only `type, productId, name, imageUrl, price_cents`. **V/H**

**Hook:** `useAddProposalItem` (`packages/supabase/src/hooks/use-proposals.ts:714-842`), insert at :795-820. It writes `unit_price = unit_sell_price = unitPrice`. There is no `vendor_id` parameter. **V/H**

**Table:** `proposal_items` (00014:237-275).
- `unit_price` is commented as the TRADE price and `unit_sell_price` as the CLIENT price.
- Columns include `vendor_id`, `vendor_name` and `lead_time_weeks`.
- 00066:181 adds `item_type, scope_room_id, budget_*, ffe_category`.
- There is no `source_url`, SKU or dimensions column. `custom_fields` was added in 00268.

**V/H**

**Snapshot trigger:** `a_set_proposal_item_product_snapshot_trg` (`00390_proposal_copy_immutability.sql:~100-170`) writes `client_product_snapshot` (brand, source_url, dimensions, materials, price_retail). It only does this when `product_id` is set. **V/H**

**Data lost at this hop:**
1. **`vendor_id` is never set, even for catalog products.** `consume_capture` does set it (00142:78/92), but the board path does not. **V/H**
2. **`data.vendor_name` is dropped**, because `buildSendToScheduleArgs` has no `vendorName`. **V/H**
3. **`data.source_url` is dropped** for product-less pins. There is no column for it and nothing is written to `custom_fields`. **V/H**
4. **Retail price lands in `unit_price` (trade) as well as sell**, so markup = 0 and the trade cost is wrong. **V/H**
5. **No `lead_time_weeks` or `ffe_category`.** **V/H**
6. **Duplicate risk:** the twin guard returns `undefined` when `productId==null` (`board-schedule.ts:48`). Repeated sends of a URL pin create duplicate lines. **V/H**
7. **No backlink:** the pin is never stamped with `data.proposalItemId`. A grep of the mood-board, scope and types code finds no writer. **V/M**

**Not offered at all:** `type:'image'` and `'note'` pins (photos, failed unfurls) get no send-to-schedule action. **V/H**

**Drift badge:** `computeBoardDrift` (`board-schedule.ts:96-115`) only works for pins with a `product_id`. **V/H**

## 3. Hop 3: client approval and decisions
**Board verdicts:**
- Table: `item_feedback` with a `board_item_id` anchor (00267). Hook: `useBoardItemFeedbackByBoard` / `deriveApprovedBoardItemIds`.
- An approval does not create anything downstream automatically.
- On project boards, `BoardApprovedPinsPanel` (`board-approved-pins-panel.tsx:61-120`, mounted at `board-room-shell.tsx:1291-1298`, project only) promotes approved pins, but with `disposition:'candidate'`.
- There is no equivalent approved-pin to schedule panel for proposal boards.

**V/H**

**Proposal signing** (`apps/client-portal/src/app/api/proposals/[id]/sign/route.ts`):
- Furnishings document: `execute_furnishings_authorization_with_trusted_ip` (:264).
- Trade scope: `execute_trade_scope_with_trusted_ip` (:320).
- Services agreement: `sign_design_services_agreement_with_trusted_ip` (:427).
- Legacy: `sign_proposal` (`use-proposals.ts:1828`).

**V/H**

**Furnishings authorization ("The Document" commercial lines):**
- Table: `furnishing_authorization_items` (00412:243-264). It snapshots `product_id, client_unit_price, trade_unit_cost, vendor_id, vendor_name`.
- Execution inserts `project_ffe_items` with status `'approved'` and copies `vendor_id` (00578:3867-3886).
- Creating the authorization (`create_furnishings_authorization_from_schedule`, 00445:88-127) is gated by `get_project_ffe_readiness` (00445:5-80).

**V/H**

**Readiness gate (00445:33-66).** `missingFields` includes:
- `vendor` if `vendor_id` is NULL
- `designDisposition` unless it is `'selected'`
- `clientPrice` if the price is 0 or the line total is inconsistent
- template rules from `spec_book_templates.required_field_rules.fixed`

The seeded residential template requires `["name","documentCode","room","quantity","image","selection"]` (`00380_spec_books_foundation.sql:779`):
- `selection` means `product_id IS NOT NULL`.
- `image` means `project_ffe_specs.selected_media` is non-empty.

The template rules only apply when the project has a spec book (`LIMIT 1` join). **V/H**

**Client decisions:**
- Tables: `client_decisions` / `client_decision_options` (00062:68,117, plus `product_id`, `price` and `selection_snapshot` added later).
- `_apply_client_decision_authorized` (`00666_ffe_extract_money_review_fixes.sql:570`, materialization at ≈767-820) only writes or updates `project_ffe_items` when `v_option.product_id IS NOT NULL` and the decision is non-blocking.
- It does not set `vendor_id`, and the inserted line takes the default disposition `'candidate'`.

**V/H** (the `'candidate'` default is **I/M**, from the column default in 00434:227)

## 4. Hop 4: legacy activation (proposal → project FF&E)
- **RPC:** `activate_proposal_as_project` (00435:918-933). Path: `_authorized` (00398:1670) → `_impl` (the renamed 00331 body). It then runs `_reconcile_activated_ffe_placements` (00435:903-916). **V/H**
- **Line copy** (`00331_ceremony_complete.sql:656-676`): copies `product_id, name, ffe_category, item_type, doc_code, custom_fields, quantity, unit_sell_price→unit_price_cents, unit_price→trade_price_cents, vendor_id, vendor_name, eta (start + lead_time_weeks)`. **V/H**
  - **`proposal_items.image_url` is not copied.** `project_ffe_items` has no image column (00066:256-282 plus later ADDs). Media lives in `project_ffe_specs.selected_media` / `project_ffe_media_assets`. **V/H**
  - I did not see any step that fills `selected_media` from the board image during activation. **I/M**
- **Board snapshot** (00331:930-965): `project_boards.items` JSON keeps `product_id, image_url, data` (including `source_url`). Reconcile links snapshot pins to FF&E lines only via `data.proposalItemId`, which the board never writes (Hop 2, item 7). So the activated board pins are never linked to their FF&E lines. **V/M**
- **Disposition:** activated lines do not set `design_disposition`. The column default is `'candidate'` (00434:227), and the insert trigger (00438:266-320, 00434:465-473) only fixes `assignment_scope` and `selection_thread_id`. If nothing else flips them, legacy-activated lines need triage to `'selected'` (`triage_project_ffe_items`, 00435:494) before they can go on a PO. **I/M**

## 5. Hop 4b: project-board promote (the project equivalent of send-to-schedule)
- **UI:**
  - Inspector button "Promote to project selection": `board-room-inspector.tsx:469-496`.
  - Bulk panels: `board-promote-all-panel.tsx:44-80`, `board-approved-pins-panel.tsx`.
  - All are limited to `product|capture` types.
  - Hook: `usePromoteBoardReferenceToSelection` (`packages/supabase/src/hooks/use-project-ffe-ga.ts:197-218`).

  **V/H**
- **RPC:** `promote_board_reference_to_selection` (00435:460-492) → `place_product_in_project_v2` (current impl `00666:351+`). **V/H**
  - **With a `product_id`:** the RPC sets `vendor_id`, `vendor_name`, trade price (`price_trade`, else retail) and client price (`price_retail`) from `products` (00435 ≈151-161). **V/H**
  - **Without a `product_id`:** the hook sends no `name` (`use-project-ffe-ga.ts:202-209`). The result is a line named **"Named need"** (00666:495, 00435:229) with $0 price, no vendor, no URL, no image. The placement becomes `'note'` (00435:277). **V/H**
  - **Every UI caller passes `disposition:'candidate'`.** A PO needs `'selected'`. **V/H**
- **Filling a named need with a product later:** `place_product_in_project_v2` with `placeholderSelectionId` (00435:98,186). The legacy hook `useAssignProductToFfeSlot` is a stub that always throws (`packages/supabase/src/hooks/use-procurement.ts:2200-2226`). **V/H**
- **FF&E write guard:** `guard_ffe_rpc_mutation` (00435:935-960) makes changes to price, product, disposition and PO link RPC-only. `vendor_id` / `vendor_name` are not in its list, so a direct update is allowed. **V/H**

## 6. Hop 5: purchase order
- **Table:** `purchase_orders`, with `vendor_id UUID NOT NULL REFERENCES vendors` (00148:50-66). The link back is `project_ffe_items.purchase_order_id`. **V/H**
- **RPC:** `create_purchase_order` (current wrapper 00450 → 00449:105-154 → v1 impl 00186). **V/H**
  - It requires every line to have `vendor_id = p_vendor_id`, `removed_at IS NULL` and `design_disposition='selected'` (00449:125-133).
  - The total is Σ `COALESCE(trade_price_cents, unit_price_cents, 0)` × quantity (00186:137).
- **Hooks:** `useCreatePurchaseOrder` (`use-procurement.ts:491`), `useProcurementItems` (:350), `useSendPurchaseOrder` (:1926). **V/H**
- **UI:** "Order with Assistant" on the FF&E line unfold is `disabled={!vendor}` with the tooltip "No vendor on this line yet" (`apps/designer-portal/src/components/document/line-unfold.tsx:519-527`). **V/H**
  - The OrderAssistant itself lives in `components/portal/procurement/order-assistant/index.tsx` and is scoped per vendor.
  - `poGate` (`lib/document/authorization-derivation.ts:355-385`) blocks commercial-origin lines until they are authorized.
- **`po-send` edge function** (`supabase/functions/po-send/index.ts`):
  - Renders PO lines from `project_ffe_items` plus `project_ffe_specs` (sku, material, finish, color_fabric, selected_dimensions) (:251-262). Unit price is trade, falling back to client (:401).
  - Needs `vendors.orders_email` or `contact_info.email`, otherwise it returns 422 `no_recipient` (:506-520).
  - A board pin feeds none of the spec fields, so the vendor PO has no SKU or dimensions.

  **V/H**
- **`fulfillment-po`:** admin-only, service-role (`supabase/functions/fulfillment-po/index.ts:1-15`). It works on `fulfillment_vendor_pos` / `fulfillment_order_items` (00350:92-151), which come from Stripe PaymentIntents via `fulfillment-intake` (Rail A, Patina-as-merchant). Those lines need `vendor_sku`, `unit_cost_cents` and `mapping_state='mapped'`. This is not the designer board-to-PO chain. **V/H**
- **`services/orders`** (NestJS: carts, checkout, payments, refunds, webhooks): the consumer storefront and order rail, separate from designer POs. **I/M** (I only checked the module layout)

## 7. Hop 6: payment
- **`po_payments`** (00148:77-96): a schedule built by `create_purchase_order` from the payment pattern. **V/H**
- **`create-checkout-session`** (`supabase/functions/create-checkout-session/index.ts:9-49`): `po_payment_id` only works for `is_patina_catalog` POs. A non-catalog PO is "paid outside Patina" and rejected with 422. `direct_order_id` needs `direct_orders.product_id NOT NULL` (00276:53). Settlement happens in `stripe-webhook`. **V/H**
- **Client-side money:** the furnishings-authorization deposit and invoices (`issue_agreement_draw_invoice` in the sign route, :74). **V/H**

## 8. Where an image+URL-only pin breaks or degrades

| Hop | Outcome for a pin with no `product_id` | Evidence | Conf |
|---|---|---|---|
| Unfurl | `productId`/`captureId` null; no SKU, dims, trade price or lead time | url-unfurl.ts:378-396; extract.ts:4-26 | V/H |
| Image / note pin | No schedule or promote action at all | inspector:455; controller:1863; shell:630 | V/H |
| Send to schedule | Line created, but vendor and URL dropped, retail used as trade, qty 1, no dedupe | board-schedule.ts:48,63-79; use-proposals.ts:795-820 | V/H |
| Project promote | "Named need", $0, no vendor, URL and price snapshot discarded, placement becomes a note | use-project-ffe-ga.ts:202-209; 00666:495; 00435:277 | V/H |
| Decision apply | No FF&E line materialized | 00666 ≈767 | V/H |
| Activation | Image not carried; pin not linked to its line | 00331:656-676; 00435:903-916 | V/H, link V/M |
| Readiness / authorization | Fails `vendor`, `clientPrice` (if 0), `designDisposition`, and with a spec book also `selection` and `image` | 00445:33-66; 00380:779 | V/H |
| PO | Rejected: no `vendor_id`, not `'selected'`; UI button disabled | 00449:125-133; line-unfold.tsx:522 | V/H |
| PO document | No SKU or dimensions (no `project_ffe_specs`) | po-send:251-262 | V/H |
| Patina checkout / direct order | Not possible without a catalog product and a Patina-catalog vendor | create-checkout-session:35-40; 00276:53 | V/H |

**Even catalog product pins degrade.** The proposal path never sets `vendor_id` (Hop 2, item 1), so after activation they also fail the `vendor` readiness check and the PO filter until a vendor is assigned by hand. The project-promote path does set it. **V/H**

## 9. Existing "board → schedule/order" affordances
1. **Proposal boards:** "Send to the schedule", via inspector button and context menu (Hop 2). The PRD calls it the "existing half" of board-to-spec (`docs/prds/MoodBoard/00-mood-board-prd.md:391`, O3). **V/H**
2. **Project boards:** "Promote to project selection", plus the Promote-all and Approved-pins bulk panels. **V/H**
3. **Price-drift badge** on product pins only (`computeBoardDrift`). **V/H**
4. **Board-path design intent:** the audit (`artifacts/mood-board-ux-audit-2026-08-31/synthesis.md:32-33,40,48`) names "approved pieces → purchase pipeline" and URL unfurl as "the sourcing wedge … price-true procurement spine". **V/H**
5. **Nearest reuse point for PPTX import** (relevant to the user's goal): `project-ffe-document-extract` plus `stage_project_ffe_document_extraction` / `commit_project_ffe_import` (00660/00661/00666).
   - It accepts only PDF and JPEG/PNG/WEBP (`supabase/functions/project-ffe-document-extract/lib.ts:10-21`). PPTX is not accepted.
   - `stage_project_ffe_import` source kinds: `csv|xls|xlsx|pdf` (00435 ≈616), plus `photo` from 00660.
   - Rows carry `name, quantity, roomName, category, maker, sku, unitPriceMinor, currency` as unconfirmed extracted values (lib.ts:60-77). There is no URL or image-match field.

   **V/H**

## 10. Inferences and open items
- I did not confirm whether any step flips activated legacy lines to `'selected'`. **I/M**
- I did not confirm whether activation populates `project_ffe_specs.selected_media` from product or pin images. **I/M**
- I did not open the `services/orders` internals. **I/L**
- `po-send` and `create_purchase_order` behaviour for `is_patina_catalog` vendors was taken from comments. **I/M**