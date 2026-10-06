# Current state — item intake, catalog vs. out of catalog (planning sweep, 2026-10-05)

Seed brief for R2. Read-only sweep of the main checkout. Verify against code before citing it.

Headline: six ways an item reaches a job's FF&E list, and three structural gaps.
- (a) An off-catalog line with only a free-text vendor can't become a PO.
- (b) No designer surface edits SKU, finish or dimensions on a line, and the price/vendor edit hooks throw "RPC-only".
- (c) Workroom, samples/memos, CFA, reimbursables, card purchases and a receiving warehouse are not modeled.

## 1. Catalog / Library
- `products` (`00001_initial_schema.sql`): `source_url` NOT NULL; retail/trade cents; dimensions JSONB; optional `vendor_id`. `00152_three_layer_catalog.sql` adds lead time, terms, vendor contact, category, and the layers personal/studio/patina (`layer`, `owner_user_id`, `studio_id`), with promotion logged in `promotion_audit_log`.
- Configuration: `00403_product_configuration_foundation.sql` (option groups, variants, configurations). `00413_configuration_com_and_decision_selection.sql` adds COM/COL as a configuration option.
- Library room: `apps/designer-portal/src/app/(document)/library/page.tsx`. Picker: `apps/designer-portal/src/components/portal/proposals/product-picker-modal.tsx` with tabs Catalog / Library / Captures / Quick-create draft (name, brand, URL, price).
- The add sheet is `apps/designer-portal/src/components/document/schedule/add-to-project-sheet.tsx` ("Add a line"). Options: Start a board / Browse the Library / Paste a product link / Name a need / Import a schedule. Import is a dead end: "not available in this build". The routing step covers room/throughout/unassigned, design status, an optional board, and a duplicate policy (reuse/separate/hold), then calls `place_product_in_project_v2` (`packages/supabase/src/hooks/use-project-ffe-ga.ts`).
- Fields copied onto the line (`00435_ffe_ga_rpc_boundaries.sql` ~222): name, category, quantity, trade price, retail as unit price, vendor id/name. **SKU, finish and dimensions are not copied.** The spec row gets routing info only.
- "Add-sheet kind clarity" turned out to be the People add-person sheet (`components/document/people/directory/add-person-sheet.tsx`). Its "maker" kind is the only place a designer creates a vendor (name, specialty, orders email, website).

## 2. Out of catalog
- **Name a need** (`add-line-sheet.tsx`, `create_named_project_need`): name + quantity only. Saved as a `tbd` candidate with no vendor, price or image.
- **Chrome extension** (`apps/extension/src/lib/payloads.ts`, `src/state/effects.ts`, `src/lib/spec-book-placement.ts`):
  - Captures name, description, URL, up to 10 images, retail price, SKU, materials, colors, finish, dimensions incl. clearance, and a note.
  - Vendor is resolved in `packages/supabase/src/lib/vendors.ts`: website → name → stub.
  - Five save destinations.
  - Does not capture quantity, trade price, lead time or COM. Trade pricing was removed in 0.3.0.
- **Bring in a Deck (US-15)**:
  - Data and functions: `00676_board_deck_imports.sql`, `supabase/functions/board-deck-import-resolve/`, `board-web-match/` (needs the Google Vision key).
  - UI: `components/mood-board/board-deck-import-sheet.tsx`, `board-deck-import-ledger.tsx`, `board-find-this-piece.tsx`, `board-promote-all-panel.tsx`.
  - Flags: `board-deck-import`, `board-web-match`.
  - Flow: keep → product → a separate promote step ("Put N pieces on the schedule").
- **iOS Field** (`apps/mobile/Capture/CaptureKit/CaptureKit/Domain/Piece.swift`, `SupabaseCaptureGateway.swift`):
  - Captures title, maker as free text, SKU, colorway/material/finish, trade + retail, URL, photos, measurements, voice note, scanned codes and a catalog match.
  - Saves via `commit_field_capture` / `route_field_capture` (`00530`), then `place_product_in_project`.
- **Schedule/document import**: the backend exists (`00434` staging, `stage_project_ffe_document_extraction`, `commit_project_ffe_import` up to `00661`, fn `project-ffe-document-extract`). **No portal UI calls it.**

## 3. `project_ffe_items` (00066 + ~14 alters)
- `status`: specified → quoted → approved → ordered → production → shipped → delivered → installed (procurement only).
- Orthogonal axes from 00434: `design_disposition` (candidate/selected/alternate/not_selected/superseded), `placement_kind` (room/throughout/unassigned), `item_type` (fixed/allowance/tbd).
- Pricing: `unit_price_cents`, `total_price_cents`, budget min/max, `trade_price_cents` + `markup_percent` (00185), `currency_code` (00661).
- Vendor: free-text `vendor_name` + `vendor_id` **with no FK**.
- Also: `po_number`, `eta_date`, `is_blocked` + reason, notes, `added_via`, `doc_code`, `custom_fields` JSONB, provenance links.
- Spec fields live in `project_ffe_specs` (00380): sku, finish, material, color_fabric, dimensions, location, trade/install/care notes, media.
- **Not on the line:** lead time, sidemark, ship-to, COM yardage, purchaser / paid-by.
- Mutation lockdown: `guard_ffe_rpc_mutation` (00435 ~935) forces price/status/qty/room/product changes through RPCs. The portal's vendor-reassign and pricing hooks throw "RPC-only" (`packages/supabase/src/hooks/use-project-v2.ts` ~287–355). **No designer-facing price/markup RPC was found.**

## 4. Vendors
- `vendors` is global, with no studio scope, and any authenticated user can insert (00058). Fields: `trade_terms`, `contact_info`, `orders_email` (00188), `default_payment_terms` (00148), `is_patina_catalog` (00149).
- Trade accounts: `designer_vendor_accounts` (00009) is per designer, not per studio. Holds account #, tier, rep, YTD.
- Studio rolodex `studio_contacts` (00417) gives each studio a private card per shared vendor.
- `vendor_profiles` (00350) covers Patina-as-merchant only: PO method, PO email, terms, deposit %, lead time, blind ship, claims window, freight.

## 5. Exists vs. absent
- **Exists:**
  - `purchase_orders` (vendor_id required, sidemark 00186, ship-to text 00188) and the sidemark generator `components/portal/procurement/order-assistant/sidemark.ts`.
  - Receiving inspections + damage claims (00150; iOS `Features/Receiving/`; portal `orders-book-receiving.tsx` with a "warehouse-day queue").
  - A "receiver" job role (00281).
  - COM/COL only inside the configuration model (00413).
  - Freight only on the merchant ledger (00352/00360).
- **Absent:**
  - CFA: 0 hits.
  - Reimbursables: 0.
  - Card/retail purchases: 0.
  - Samples/memos: no table.
  - Workroom: rolodex label only, no work order and no COM fabric shipment linking fabric to a workroom.
  - Receiving warehouse: no entity; ship-to is text.
  - Antiques/one-offs: no model, so a flea-market piece needs a made-up vendor record.
  - Freight/crating/delivery: no cost lines on studio POs.
