# R2 — Item intake: catalog vs. out-of-catalog

Role: product/data analyst, catalog vs. out-of-catalog intake. Repo: `/Users/kody/Code/patina-merged`, main checkout, `main` @ `4207b8e2d` (worktrees ignored). Read-only — no edits, no DB, no deploys. Evidence is code-only (no live portal walk, per ruling).

Ruling flags carried through, never resolved here: **V1** (margin pocket — maker trade discount vs. studio markup) and **pricing-mechanics R1–R11** (`artifacts/pricing-mechanics-2026-09-05`) are OPEN. Every place they bear on intake is marked "ruling needed," not answered.

Confidence key: **High** = read the exact code/SQL this memo cites. **Medium** = read adjacent code and inferred the behavior, or relied on the seed brief without re-deriving it myself. **Low** = brief-only, unverified this pass.

---

## 0. Headline

Nine intake paths feed `project_ffe_items`, but they fan into only **two real write mechanisms**: `place_product_in_project_v2` (catalog-shaped: a `product_id` exists or is minted first) and `create_named_project_need` (a thin wrapper around the same RPC with no product at all). Every path's field survival is a function of (a) whether it produces a `product_id` and (b) whether that product row itself carries the attribute — because **`project_ffe_specs` is always inserted empty** (`ffe_item_id`, `routing_source` only) regardless of path, and the portal's spec book reads SKU/finish/material/color/dimensions through a three-tier fallback (project override → FF&E line → **product master**) rather than ever copying them onto the line at intake time. [High]

The single most consequential, concrete finding: **iOS Field capture collects the richest attribute set of any intake path (trade price, SKU, finish, colorway, material, measurements) and then loses most of it at the capture→product mint step** — `commit_field_capture`'s library branch inserts only `name, layer, owner_user_id, captured_by, captured_at, status, capture_source, field_capture_id, capture_provenance, category, subcategory, vendor_id, price_retail, images` into `products` (`supabase/migrations/00530_field_capture_notes_and_routing.sql:666-674`). SKU, finish, materials, colors, dimensions and trade price are captured on `field_captures` (`:391-392`) but never written onto the `products` row that becomes the project line, so they vanish — unless and until a human re-enters them by hand later in the Piece/product editor. [High] The Chrome extension does **not** have this gap: its product insert carries sku/finish/materials/colors/dimensions directly (`apps/extension/src/lib/payloads.ts:60-97`). [High] Trade price is a different, uniform gap: the extension removed it in 0.3.0 (payload has no trade-price field at all) [High, confirmed by absence in `payloads.ts`], and "paste a product link" quick-create explicitly nulls it (`product-picker-modal.tsx:710`, `priceTradeCents: null, // drafts carry no trade cost`) [High].

Structural gaps the brief named and I confirmed in code:
- **(a) An off-catalog line with only a free-text vendor can't become a PO.** `project_ffe_items.vendor_id` has no FK (`supabase/migrations/00066_proposal_project_flow_v2.sql:273`, bare `UUID`) [High], but `purchase_orders.vendor_id` is `NOT NULL REFERENCES vendors(id)` (`supabase/migrations/00148_procurement_workspace_v1.sql:54`) [High], and `create_purchase_order` only accepts lines where `item.vendor_id = p_vendor_id` (`supabase/migrations/00435_ffe_ga_rpc_boundaries.sql:894`) [High] — a line with `vendor_id IS NULL` can never match and is permanently un-PO-able until someone attaches a real vendor record.
- **(b) No designer surface edits SKU, finish or dimensions on the FF&E line itself** — but the Spec Book workspace *does* edit them on the companion `project_ffe_specs` row (`useUpdateProjectFfeSpec`, `packages/supabase/src/hooks/use-spec-books.ts:334-373`; wired into `apps/designer-portal/src/components/document/spec-books/spec-book-workspace.tsx:264,361-362`) [High]. This is a **correction to the seed brief**, which stated flatly that no surface edits these fields — the surface exists, it's just a different room (Spec Book, not the FF&E line unfold) than where price/vendor edits live. Price and vendor **are** genuinely RPC-only with no live caller: `useBulkReassignFfeVendor` and `useUpdateFFEItemPricing` both throw `'...RPC-only...'` unconditionally before touching data (`packages/supabase/src/hooks/use-project-v2.ts:287-298,329-336`) [High].
- **(c) Workroom, samples/memos, CFA, reimbursables, card purchases, and a receiving warehouse are not modeled.** Confirmed by grep: zero migration hits for `workroom` (table), `CFA`, `reimbursable`, "retail on card," or "sample/memo" as a schema object [High]. COM/COL exists, but only inside the product-configuration model (§4 below), not as a general line attribute.

---

## 1. The nine intake paths

### 1.1 Library / Catalog picker
`apps/designer-portal/src/components/portal/proposals/product-picker-modal.tsx` — tabs Catalog / Library / Captures / Quick-create draft. [Medium — read the Quick-create and pricing-field logic directly; did not fully trace the Catalog/Library tabs' own list-rendering code.] Resolves to a `productId`, handed to `usePlaceProductInProjectV2` (`packages/supabase/src/hooks/use-project-ffe-ga.ts:178-185`) [High].

### 1.2 Add-a-line sheet → "Browse the Library" / "Paste a product link" / "Name a need"
`apps/designer-portal/src/components/document/schedule/add-to-project-sheet.tsx` is the entry sheet ("Add a line"), offering: Start a board, Browse the Library, **Paste a product link**, Name a need, Import a schedule (dead end — "not available in this build," per brief [Low, not re-verified this pass]). "Paste a product link" routes into the product picker's Captures tab (`add-to-project-sheet.tsx:270`, `setPickerInitialTab('captures')`) [High] — i.e., it is *not* a separate intake mechanism, it's a doorway into the same Quick-create-draft flow described in §1.1/§2.3.

"Name a need" is a genuinely separate, lighter sheet: `add-line-sheet.tsx` → `useCreateNamedProjectNeed` → `create_named_project_need` RPC, which is `place_product_in_project_v2(p_request - 'productId' || {duplicateMode: 'create'})` (`supabase/migrations/00435_ffe_ga_rpc_boundaries.sql:332-334`) [High]. Fields sent: `name`, `quantity`, `itemType: 'tbd'`, `assignmentScope`, `roomId`, `disposition: 'candidate'` (`add-line-sheet.tsx:50-63`) [High]. No vendor, price, image, or SKU field exists anywhere on this sheet.

### 1.3 Chrome extension clip
`apps/extension/src/lib/payloads.ts:buildProductInsertPayload` (lines 52-101) inserts directly into `products` with: `name, description, source_url, images (≤10), price_retail, sku, materials, colors, finish, available_colors, dimensions (width/height/depth/seatHeight/seatDepth/seatWidth/armHeight/backHeight/legHeight/clearance/unit), capture_source: 'web_extension', capture_provenance, retailer_id` [High]. Vendor is resolved separately (`packages/supabase/src/lib/vendors.ts`, per brief, [Low — not re-read this pass]) by website → name → stub. **No trade price field anywhere in the payload** [High, by absence]. Placement into the project uses `placementV2Request`/`placementRpcPayload` (`apps/extension/src/lib/spec-book-placement.ts:183-229`) → `place_product_in_project_v2`, same copy rules as §2 below [High].

### 1.4 Bring in a Deck (US-15, shipped 2026-10-05)
`supabase/migrations/00676_board_deck_imports.sql` + resolve/web-match edge functions. `board_deck_import_items` holds `extracted` (what the slide said), `candidates` (what the resolver found, ≤5), and `chosen_product_id` — state machine `pending→found/not_found→kept/reference/removed` [High]. Vendor resolution is a SQL port of the extension's `resolveVendor`: website by domain → exact name match → mint `(name, website)` stub, `website = 'https://<domain>'` (`:251-301`) [High]. The resolved/kept item becomes a `product_id`, then a **separate promote step** ("Put N pieces on the schedule") runs the same `place_product_in_project_v2` path [Medium — the promote-step UI itself (`board-promote-all-panel.tsx`) wasn't re-read this pass, but the RPC target is the same one traced throughout this memo]. So a deck-imported product carries whatever the resolver/candidate populated on `products` (name, image, possibly SKU per `found_by='sku'`/`'words'` candidate types, `:475-482`) — same product-row-dependent survival as §2.

### 1.5 iOS Field capture
`apps/mobile/Capture/CaptureKit/CaptureKit/Domain/Piece.swift:36-83` — richest capture of any path: `title, maker (vendor free text), sku, colorway, materialNote, finish, priceTradeCents, priceRetailCents, currencyCode, sourceURL, note, materials[], colors[], styleTags[], photos[], measurements[], voiceTranscript, scannedCodes[], catalogMatchRemoteId` [High]. Sync path: `SupabaseCaptureGateway.swift:56` calls `commit_field_capture`, then separately `:103` calls `place_product_in_project` [High]. As stated in §0, `commit_field_capture`'s library-mint branch drops sku/finish/materials/colors/dimensions/trade-price (`00530:666-674`) [High] — **this is the one path where the capture-time data is demonstrably richer than what survives onto the catalog layer**, let alone onto the project line.

### 1.6 Spec book
`apps/designer-portal/src/components/document/spec-books/spec-book-workspace.tsx` is not an intake path for *new* items — it's where SKU/finish/material/color/dimensions/location/notes get **added after the fact** to an existing line, via `useUpdateProjectFfeSpec` writing to `project_ffe_specs` [High]. Column-level grant confirms this is intentionally open to `authenticated`, not RPC-gated, unlike price/vendor/qty: `GRANT UPDATE (sku,finish,material,color_fabric,selected_dimensions,exact_location,client_notes,trade_notes,install_notes,care_notes,warranty_notes,selected_media,source_verifications,na_declarations,field_provenance,routing_source,updated_by,updated_at) ON public.project_ffe_specs TO authenticated` (`00435_ffe_ga_rpc_boundaries.sql:984-985`) [High]. This is the mechanism that backfills what no intake path captures.

### 1.7 Proposal activation
A signed proposal's lines become `project_ffe_items` via `activate_proposal_as_project` → (renamed in 00390) `_activate_proposal_as_project_impl`, body last substantively changed at `supabase/migrations/00331_ceremony_complete.sql:520+` [Medium — traced the rename chain and confirmed the live body's location; did not re-read the full ~300-line INSERT this pass]. Two migration titles are strong, specific evidence of field carry: `00185_ffe_dual_pricing.sql` (trade + retail dual pricing carried) and `00199_activation_carry_vendor_id.sql`, whose own comment states the prior behavior copied `vendor_name` only and this migration added `vendor_id` "so the Order Assistant could not mount on activated, not-yet-ordered lines anywhere in the portal" [High, migration header is explicit]. Lead time converts to a point-in-time ETA, not a durable field: `proposal_items.lead_time_weeks → project_ffe_items.eta_date` at activation (`00140_proposal_project_richer_carry.sql:189-190`, carried forward through `00141`/`00142`) [High] — i.e., lead time is consumed once and discarded, not stored as its own column on the line (there is no `lead_time` column on `project_ffe_items` or `project_ffe_specs` at all — confirmed by its absence from both tables' DDL across the files read for §2).

### 1.8 "Import a schedule" (named in Add-a-line sheet, dead UI)
Backend exists — `stage_project_ffe_document_extraction`, `commit_project_ffe_import` (through `00661`), edge function `project-ffe-document-extract` — but **no portal UI calls it** [Low — relied on brief; did not independently re-verify the UI absence, though the add-to-project-sheet.tsx read in §1.2 is consistent with it being a listed-but-dead option].

---

## 2. What `place_product_in_project_v2` actually copies (the common funnel for 1.1, 1.2-paste-link, 1.3, 1.4, 1.5)

Three branches, all in `supabase/migrations/00435_ffe_ga_rpc_boundaries.sql:86-301`:

**New-line INSERT branch (`:224-241`)** — columns populated: `project_id, project_room_id, product_id, name, ffe_category, quantity, trade_price_cents, unit_price_cents, line_total_cents, vendor_id, vendor_name, added_via, sort_order, selection_thread_id, design_disposition, assignment_scope`. Pricing: `trade_price_cents = COALESCE(product.price_trade, product.price_retail, 0)`; `unit_price_cents = COALESCE(product.price_retail, product.price_trade, 0)` (`:201-204`, mirrored at `:234-236`). [High]

**Fill-a-placeholder branch (`:196-206`)** — same vendor/price copy rule, plus `name`, `ffe_category`, room, scope, disposition. [High]

**NOT copied in either branch, from the product row onto the line, by any path**: `sku`, `finish`, `material`, `color`, `dimensions`, lead time. These stay on `products` and, immediately after, `project_ffe_specs` is inserted with only `(ffe_item_id, routing_source)` (`supabase/migrations/00380_spec_books_foundation.sql:565-570`, trigger `trg_spec_book_attach_ffe_line`) [High]. A designer or client only ever sees them through the Spec Book's read-time fallback, `resolveSpecValue` (`apps/designer-portal/src/lib/spec-books/model.ts:203-253`): project override → `item[field]` (FF&E line, which doesn't carry them either) → **`product_master`** (the linked product's own column) → custom field → nothing [High]. So: **field survives for display iff the product row has it, for exactly as long as `product_id` stays linked** — it is never durably copied onto the thing a PO or a client-portal snapshot reads independently of the live product.

---

## 3. Field-survival matrix

Columns: does the field reach `project_ffe_items`/`project_ffe_specs` at the moment of intake (not counting a later manual Spec Book edit)? "via product" = not copied onto the line, but visible through the product-master fallback for as long as the linked product carries it.

| Field | Library/Catalog (1.1) | Name a need (1.2) | Paste link / Quick-create (1.2/2.3) | Extension clip (1.3) | Deck promote (1.4) | iOS Field (1.5) | Proposal activation (1.7) |
|---|---|---|---|---|---|---|---|
| Vendor (id, FK'd) | ✅ copied | ❌ none | ❌ stub/none (brand text only) | via product (resolved vendor) | via product (resolved/stub vendor) | via product (`maker` free text → resolved?) [Medium] | ✅ copied (00199) |
| Vendor name (free text) | ✅ | ❌ | ✅ (brand) | ✅ | ✅ | ✅ | ✅ |
| SKU | via product | ❌ | ❌ (not captured) | **via product** (captured + kept) | via product (`found_by='sku'/'words'`) | **❌ lost at mint** (captured on `field_captures`, dropped from `products` insert) | — [Low, not traced] |
| Finish | via product | ❌ | ❌ | **via product** | via product (if resolver found it) | **❌ lost at mint** | — |
| Material | via product | ❌ | ❌ | **via product** | via product | **❌ lost at mint** | — |
| Color/fabric | via product | ❌ | ❌ | **via product** | via product | **❌ lost at mint** | — |
| Dimensions | via product | ❌ | ❌ | **via product** | via product (candidate-dependent) | **❌ lost at mint** | — |
| COM/COL flag | n/a outside configuration model (§4) | n/a | n/a | n/a | n/a | n/a | n/a |
| Lead time | on product only, never line | ❌ | ❌ | on product only | on product only | captured, lost at mint | **consumed once → `eta_date`, then discarded** |
| Trade price | ✅ copied from product | ❌ (no product) | **explicit null** (`product-picker-modal.tsx:710`) | **❌ removed in 0.3.0** | via product (if resolver priced it) | captured richly, lost at mint (product insert has no trade column) | ✅ (00185 dual pricing) |
| Client/retail price | ✅ | ❌ | ✅ (unfurled or typed) | ✅ | via product | ✅ (`price_retail` carried into product insert) | ✅ |
| Quantity | ✅ (request field) | ✅ | ✅ (defaults to 1) | ✅ | ✅ | ✅ | ✅ |
| Room | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (`placementRoomId`) | ✅ |
| Image | ✅ | ❌ | ✅ (if unfurled) | ✅ (≤10) | ✅ | ✅ (photos, but only non-duplicate `publicUrl`s survive to the product, `00530:659-662`) | ✅ (per brief) |
| Source URL | ✅ (on product) | ❌ | ✅ | ✅ | ✅ (slide/link) | ✅ (captured; survival onto product not traced) | — |

Everything in this matrix is **High confidence for the "Library/Catalog," "Name a need," "Paste link," "Extension," and "iOS Field" columns' SKU/finish/material/color/dimensions/trade-price rows** (directly read code cited above). The "Deck promote" and "Proposal activation" columns are **Medium** where marked — the RPC target and the propagation *mechanism* are confirmed, but I did not re-trace every resolver/activation branch field-by-field this pass.

---

## 4. Out-of-catalog cases: exists / partial / absent

| Case | Status | Evidence |
|---|---|---|
| **Workroom / drapery / upholstery with COM fabric** | **Partial.** COM/COL exists only inside the product-configuration model, not as a general line attribute: `product_option_values.allows_com`, `product_configurations.com_details: {optionValueId, fabricName, mill, pattern, yardage, railroaded, shipTo, sidemark, secondLeadTimeWeeks, notes}` (`supabase/migrations/00413_configuration_com_and_decision_selection.sql:45-71`) [High]. The fabric gets denormalized onto `project_ffe_specs.color_fabric` by three "specification writers" (`:1473-1474,1621-1622`) [High] — so a *configured* line can carry a vendor-readable fabric line, but there is no freestanding "workroom" entity, no work order, and no COM-fabric-shipment-to-workroom linkage. A plain workroom relationship is rolodex-label-only (per brief, [Low, not re-verified: `studio_contacts`/vendor "specialty" field]). | `00413` |
| **Antiques / one-offs / auction** | **Absent as a model.** No distinct entity; must be forced through the same `vendors` table (any authenticated insert, see below) and a one-off `product` row. No provenance/condition/auction-house fields found. | grep: 0 hits for `antique`, `auction`, `one-off` as schema objects [High] |
| **Retail-on-card purchases** | **Absent.** No card/payment-method column anywhere on `project_ffe_items`, `purchase_orders`, or a reimbursement table. | grep: 0 hits for `card` as a purchase concept in migrations outside Stripe webhook plumbing [Medium — grepped broadly, did not exhaustively rule out a buried column] |
| **Samples & memos** | **Absent.** No `samples` or `memos` table; no `item_type` value for "sample" (`item_type` is `fixed/allowance/tbd` only, `00434`) [High, enum confirmed by brief's naming convention and consistent with 00434's three-value CHECK pattern seen elsewhere — Medium on the exhaustive enum check itself]. |
| **Freight / crating / receiver fees** | **Exists, but only on the Patina-as-merchant ledger — not on a studio-issued PO to an arbitrary vendor.** `vendor_profiles` (Patina-catalog vendors only) carries `lead_time_days, blind_ship, claims_window_days, freight_arrangement` (`supabase/migrations/00350_fulfillment_core.sql:54-59`) and the fulfillment ledger has `freight_charged_cents`/`freight_cost_cents` with full T3/T6 freight-true-up posting logic (`00350:81,134`; `00352_fulfillment_ledger.sql:148,181`; `00360_fulfillment_ledger_templates.sql` throughout) [High]. `purchase_orders` (the studio-to-any-vendor table) has no freight/crating column at all — `total_cents` only (`00148_procurement_workspace_v1.sql:50-65`) [High, confirmed by absence: grepped every `ALTER TABLE ... purchase_orders` migration for `freight|crating|receiver_fee` and found none]. |
| **Reimbursables** | **Absent.** Zero schema hits for `reimburs*`. [High, by absence] |
| **Ad-hoc vendors with no record** | **Exists, cheaply, by design — and loosely.** `vendors` RLS: any `authenticated` user can `INSERT`; only admins can `UPDATE`/`DELETE` (`supabase/migrations/00058_tighten_rls_policies.sql:22-43`, comment: "needed during product capture") [High]. No studio scoping on the table itself — it's a shared global rolodex a studio can pollute freely. The People "Add-sheet" ("maker" kind) is the one designer-facing vendor-creation form: name, specialty, orders email, website (`apps/designer-portal/src/components/document/people/directory/add-person-sheet.tsx`, per brief [Low, not re-read this pass]). |
| **Studio-scoped vendors & trade accounts** | **Partial, split across three non-unified tables.** `designer_vendor_accounts` (`00009`) is per-**designer**, not per-studio [Medium, per brief naming + table name pattern, not re-read full DDL this pass]. `studio_contacts` (`00417`) gives each studio a private card over a *shared* global vendor row. `vendor_profiles` (`00350`) is Patina-as-merchant only (PO method/email, terms, deposit %, lead time, blind ship, claims window, freight) and does not apply to a studio's own out-of-catalog vendors at all. There is no single "this studio's trade account with this vendor" row that a PO or price negotiation could hang off of. |

---

## 5. Vision test (per request, applied, not resolved)

Running the intake surfaces through the VISION.md test (surface / studio moment / stream / promise):

- **Surface**: every intake path above lands inside The Document (FF&E line, spec book) or its doorways (Add-a-line sheet, extension, iOS Field, deck import) — none creates a parallel surface. Consistent with "Document first."
- **Studio moment**: each path maps to a real buying moment (spotting a piece live, pricing a workroom need, importing a mood-board deck a client sent back). None of this is engagement-shaped; nothing here nudges a designer to open the app more.
- **Stream**: the margin-pocket question (V1) bears directly on §2's trade/retail copy rule — `trade_price_cents`/`unit_price_cents` are the two numbers that determine margin on *every* product-backed line, and the rule that populates them (`COALESCE(price_trade, price_retail, 0)` / `COALESCE(price_retail, price_trade, 0)`) is mechanical, pre-V1-ruling. **Ruling needed**: whether that COALESCE is the intended margin mechanics once V1 and pricing-mechanics R1–R11 land, or whether it needs to change per-path (e.g., should an ad-hoc/no-catalog line even get a markup at all, given it has no `price_trade` to COALESCE from?). I did not find any code that special-cases out-of-catalog margin — there's no trade cost to mark up, so `trade_price_cents` is simply `NULL`/`0` on every out-of-catalog line (confirmed: the INSERT branch at `00435:234-236` sets `trade_price_cents` conditionally `CASE WHEN v_product_id IS NULL THEN NULL ELSE ...`), meaning **out-of-catalog lines structurally cannot carry a margin number today** — this is squarely a V1/R1-R11 ruling-needed zone, not a bug to fix unilaterally.
- **Promise**: the Spec Book's deliberate separation of RPC-gated fields (price, vendor, qty, status) from directly-grantable fields (sku, finish, material, dims, notes) reads as an intentional "the studio won't notice us micromanaging the money, but can freely annotate the facts" design — consistent with the promise, not incidental.

No proposal in this memo resolves V1 or R1–R11; both stay flagged "ruling needed" wherever they touch intake.

---

## 6. What I did not verify this pass (explicit gaps)

- Full field-by-field trace of the deck-import promote UI (`board-promote-all-panel.tsx`, `board-find-this-piece.tsx`) and the proposal-activation INSERT body beyond the lead-time/vendor-id/dual-pricing migration evidence cited.
- The exact "five save destinations" the brief attributes to the extension, and the People add-sheet's maker-vendor form fields — taken from the brief at Low confidence, not re-read.
- Whether any later migration after 00435 changed the `place_product_in_project_v2` copy set (I checked for a redefinition and found none newer than 00435 in this repo state, but did not exhaustively diff every migration from 00436 onward for an unrelated `CREATE OR REPLACE` touching the same function name under a different file).
- Live behavior (flags, RLS in practice, actual Studio data) — explicitly out of scope per ruling (code-only evidence).

---

**Files/paths most load-bearing for this memo** (for follow-up reads):
- `supabase/migrations/00435_ffe_ga_rpc_boundaries.sql` (the common funnel)
- `supabase/migrations/00380_spec_books_foundation.sql` (empty-spec-row trigger)
- `supabase/migrations/00530_field_capture_notes_and_routing.sql` (iOS field-capture field loss)
- `supabase/migrations/00676_board_deck_imports.sql` (deck import + vendor resolver)
- `supabase/migrations/00148_procurement_workspace_v1.sql`, `00186`, `00188` (purchase_orders shape)
- `supabase/migrations/00413_configuration_com_and_decision_selection.sql` (COM/COL)
- `supabase/migrations/00350_fulfillment_core.sql`, `00352`, `00360` (freight on the merchant ledger only)
- `supabase/migrations/00058_tighten_rls_policies.sql` (vendor insert-anyone RLS)
- `apps/designer-portal/src/lib/spec-books/model.ts` (`resolveSpecValue` fallback chain)
- `packages/supabase/src/hooks/use-project-v2.ts` (RPC-only price/vendor stubs)
- `apps/extension/src/lib/payloads.ts`, `apps/mobile/Capture/CaptureKit/CaptureKit/Domain/Piece.swift`
