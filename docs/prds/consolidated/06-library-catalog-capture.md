# Library, Catalog & Product Capture — Consolidated PRD

## 1. Header

**Area**: Library, Catalog & Product Capture — the three-layer product model (My Library / Studio Library / Patina Catalog) plus the capture pipeline (Chrome extension, in-portal capture, native iOS Field Capture) and the promotion/nomination workflows that move items and vendors up the layers.

**Per-sub-feature status**:

| Sub-feature | Status |
|---|---|
| Three-layer catalog schema + RLS (personal/studio/catalog) | Shipped |
| Classic portal Library UI (`/portal/library/*`) | Shipped |
| The Document Library Room + The Piece (`/library`, `/library/[id]`) | Shipped |
| Promote-to-Studio (single + bulk) | Shipped |
| Demote-to-Personal (7-day undo) | Partial — RPC + hook exist, no UI entry point |
| Nominate-to-Catalog | Partial — modal ships, owner-gating is RLS-only, no UI guard |
| Nomination admin state machine (`/admin/nominations`) | Shipped |
| Nomination lifecycle notifications (in-app + email) | Planned — explicitly deferred at the DB layer |
| Manufacturer Portal onboarding → catalog product creation | Planned — scaffold only |
| Studio→Catalog auto-link on nomination "live" | Partial — trigger + RPC exist, unreachable end-to-end without Manufacturer Portal |
| Chrome extension product capture | Shipped |
| Chrome extension vendor-only capture, trade pricing, offline queue | Removed in extension 0.3.0 (capture-launch, 2026-08-29): offline queue had no producer, OCR had no bundled assets, trade pricing had no account-linking path |
| In-portal manual add / CSV import | Shipped (CSV import unverified on prod) |
| iOS Field Capture app | Partial — validation-build only, backend migrations shipped, app not merged/not on prod |
| Aesthete-vector-driven catalog match/sort | Planned — column re-typed, scoring not live |
| Founding Circle catalog tab | Partial — column + tab exist, unseeded in prod |

**Last reconciled**: 2026-07-06

**Source docs**:
- `docs/prds/patina-three-layer-catalog-engineering-handoff.md`
- `docs/prds/patina-three-layer-product-catalog.html`
- `docs/prds/patina-promotion-modals-deep-design.html`
- `docs/specs/_active/product-capture.md`
- `docs/implementation/product-capture/progress.md`
- `docs/implementation/product-capture/manual-test-matrix.md`
- `docs/design/Chrome ext/patina-extension-ux-flow.html`
- `docs/qa/prod-capture-library-proposals/REPORT.md`

---

## 2. Overview

Library, Catalog & Product Capture is the product-sourcing spine of Patina. It is built around a **three-layer product model**:

- **My Library** (`layer='personal'`) — private to the designer who captured the item.
- **Studio Library** (`layer='studio'`) — shared within an organization once a proven personal item is promoted.
- **Patina Catalog** (`layer='catalog'`) — Patina-managed/public products, either seeded directly or reached via a vendor nomination pipeline.

This is paired with the **capture pipeline** that feeds the bottom of the funnel — the Chrome extension (product-page scraping), in-portal URL-paste/manual entry, and a native iOS Field Capture app — and the **promotion/nomination workflows** that move individual items (personal → studio) and vendors (studio-sourced vendor → nominated → live in the Catalog) up the layers.

**Primary users**:
- **Interior designers** — capture products while browsing vendor sites or in the field, browse/search across the three layers, promote proven items into their studio's shared library, and nominate makers they trust into the Patina Catalog.
- **Patina ops / super_admin** — drive vendor nominations through a state machine from the Admin Portal (submitted → under_review → contacted → onboarding → live, or → declined).

**Where it lives**: the Designer Portal's "Products" zone. The area is backed by a single `products` table with RLS-enforced layer visibility, and its components/hooks are shared between the classic portal navigation (`(portal)/portal/library/*`, `(portal)/portal/catalog/*`) and the newer "The Document" room-based shell (`(document)/library`, `(document)/library/[id]`), which is now the default surface via the `the-document-pilot` flag. Admin-side nomination management lives in the Admin Portal. Capture also has a dedicated presence in the Chrome extension (Plasmo) and, natively, in a standalone iOS app.

---

## 3. As-Built Architecture

### Two coexisting UI surfaces (both read the same layer model)

**1. Classic portal** (`apps/designer-portal/src/app/(portal)/portal/`)
- `library/layout.tsx` — page header + cross-layer search box.
- `library/page.tsx` — redirects to the last-selected layer via `localStorage['library_last_layer']` (default `personal`).
- Per-layer views:
  - `library/personal/page.tsx` — renders `components/products/layer-view.tsx` with +Add/Import CTAs.
  - `library/studio/page.tsx` — By-Vendor/By-Category grouping.
  - `library/catalog/page.tsx` — 4 tabs: Browse / For your active projects / Founding Circle / Teach the Engine.
  - `library/search/page.tsx` — grouped cross-layer results.
- Sub-nav layer picker: `components/portal/library-layer-nav.tsx` (special-cased in `SubNav`, `LayerIcon` + live counts from `useLayerCounts`).
- Product detail/edit/create/import + collections/categories under `(portal)/portal/catalog/*`; `catalog/page.tsx` now just `redirect('/portal/library/personal')`. Library cards open the **old** detail at `/portal/catalog/[id]/page.tsx`.

**2. "The Document" room shell** (`apps/designer-portal/src/app/(document)/`, now the default via `the-document-pilot`)
- `library/page.tsx` → `components/document/rooms/library/library-room.tsx` (three shelves + librarian bar + capture/import/deep-analysis sheets).
- `library/[id]/page.tsx` → `components/document/rooms/piece/piece-room.tsx` ("The Piece", R40 — full-bleed view+edit of one item, self-saving facets, layer/permission-aware). Cards route to `/library/[id]` (`library-card.tsx:77`).

### Shared component + data layers

- **`@patina/catalog-ui`** (`packages/catalog-ui/src`): `LayerIcon`, `LayerChip`, `StrataMark`, `ProductCard`, `PromotionToast`, `NominationStatusBanner`, `VendorContextBlock`, `PrefilledInput`/`PrefilledChip`, plus a `product-detail/*` component set (hero-gallery, product-identity, specifications, maker-story, designer-intelligence, inline-editable, edit-mode-bar).
- **`@patina/supabase` hooks**: `use-layer-products`, `use-cross-layer-search`, `use-promotion-candidates`, `use-promote-to-studio` (also exposes demote), `use-nominate-vendor`, `use-vendor-studio-stats`, `use-admin-nominations`, `use-capture-product`, `use-library-pilot-flag` (deprecated gate). Write paths: `mutations/capture-product.ts` (unified `captureProduct` → `layer='personal'`), `mutations/promotion.ts`, `mutations/nomination.ts`, `lib/vendors.ts` (`resolveVendor` find-or-create).
- **Promotion/nomination modals** (`components/products/`): `promotion/promote-to-studio-modal.tsx`, `promotion/bulk-promote-to-studio-modal.tsx` (mounted via `promotion-banner.tsx`), `nomination/nominate-to-catalog-modal.tsx`, `promotion-banner.tsx`. `layer-view.tsx` mounts the single-item promote modal + banner (personal only); both room shells reuse the same modals.

### Capture surfaces

- **Chrome extension** (`apps/extension`, Plasmo) — fully re-architected into a reducer/effects state machine (`src/state/`), `panel/`, `screens/`, `overlays/`. Extraction modules (`src/lib/extraction/`): `vendor`, `retailer`, `manufacturer`, `price`, `images`, `dimensions`, `materials`, `metadata`, `color-finish`; `ocr.ts`, `mode-detection.ts` (product vs vendor page). `lib/payloads.ts::buildProductInsertPayload` writes `layer:'personal'`, `owner_user_id`, `retailer_id`, `vendor_id`. Also: vendor-only capture (`VendorCaptureForm`/`VendorInlineForm`/`VendorSelector`), portal-cookie session adoption (`lib/portal-cookie.ts`), QR auth, duplicate detection (`lib/product-similarity.ts`), and "send as decision/FFE/proposal" targeting.
- **In-portal web capture**: `captureProduct` mutation is the single write path; the document Library's `capture-sheet.tsx` exposes URL-paste + named manual entry. `catalog/new` (manual add) and `catalog/import` (3-step CSV wizard) live under the classic catalog subtree.
- **iOS Field Capture**: a separate native app (branch `capture/foundation`) writing through the `field_captures` inbox + commit RPCs (migrations 00232–00235); rows land as `capture_source='field_capture'` personal products.

---

## 4. Data Model

### Core three-layer schema

- **00011** `add_retailer_id` — `products.retailer_id → vendors(id)` (manufacturer=`vendor_id`, retailer=`retailer_id`).
- **00152** `three_layer_catalog` (the heart) — adds:
  - `products.layer` (NOT NULL, CHECK in `personal|studio|catalog`)
  - `owner_user_id`, `studio_id`, `promoted_from_id/at/by`
  - `vendor_contact`, `payment_terms`, `category`, `subcategory`, `usage_notes`, `lead_time_weeks`, `style_tags`, `material_tags`
  - `aesthete_vector vector(1536)`, `commission_rate`, `patina_managed`, `catalog_equivalent_id`, `merged_into_id`, `deleted_at`
  - Backfills legacy rows to `catalog` + `patina_managed`.
  - CHECK constraints: `products_personal_requires_owner`, `products_studio_requires_metadata`, `products_catalog_requires_management`.
  - `products_normalize_layer_defaults` BEFORE-INSERT trigger (soft-lands layer-unaware inserts).
  - Full RLS replace: personal (`owner_user_id=auth.uid()`), studio (active `organization_members`), catalog (any authenticated; anon read), with per-op INSERT/UPDATE/DELETE policies.
  - Adds vendors nomination columns.
  - Creates **`promotion_audit_log`** and **`vendor_nominations`** tables + their RLS.
- **00153** `v_promotion_candidates` view — personal items with `vendor_id`, ≥2 distinct projects (`project_products` ∪ `project_ffe_items`), ≥1 non-draft/non-cancelled PO. SECURITY INVOKER (RLS-filtered).
- **00154** RPCs `promote_to_studio(...)`, `demote_to_personal(...)`, helper `is_product_in_active_use(...)` — SECURITY DEFINER, manual auth, write `promotion_audit_log` with pre-transition `field_snapshot`; demote records `undo` within 7 days else `demote`, blocks when in active use.
- **00156** `vendors.website` case-insensitive UNIQUE index (race-safe `resolveVendor`).
- **00158** nomination state machine: `nomination_transition_is_legal` + BEFORE-UPDATE trigger (submitted→under_review→contacted→onboarding→live, any→declined; live/declined terminal) + AFTER trigger denormalizing to `vendors.nomination_status`. **Notifications explicitly deferred.**
- **00159** `v_vendor_studio_stats` (per vendor×studio: item count, projects used, lifetime PO value, unresolved damage) — powers `VendorContextBlock` signal strength.
- **00160** `set_nomination_status(...)` admin RPC (super_admin-gated).
- **00161** `link_studio_to_catalog_for_vendor(vendor_id)` + trigger firing on nomination→`live` (idempotent name+vendor match).
- **00163** `vendors.founding_circle` boolean + partial index (curated in prod, not seeded).
- **00149** `vendors.is_patina_catalog` (procurement "Order via Patina" default).
- **00172** decision↔product linkage (`client_decision_options.product_id`, `client_decisions.room_id`).

### Capture-origin + Aesthete overlays

- **00232** `products.capture_source` (`web_extension|portal|field_capture|manual|import`), `capture_provenance` jsonb, `field_capture_id`.
- **00233** `field_captures` inbox + FK + RLS.
- **00234** capture-media storage bucket.
- **00235** `commit_field_capture` / `route_field_capture` / `dismiss_field_capture` / `mark_capture_upload_complete` / `merge_capture_artifact_sha256` RPCs.
- **00239** `aesthete_space` — **re-types `products.aesthete_vector` from vector(1536) → vector(768)** (canonical fused style space); adds `style_caption`, `aesthete_vector_at`, `aesthete_model_version`.
- **00240** `product_dna`.

### RLS notes

- Layer visibility is enforced per-row: personal (owner-only), studio (active `organization_members` of the owning org), catalog (any authenticated; anon read).
- Studio identity reuses **`organizations` + `organization_members`** — there is **no** `studios`/`studio_members` table.
- Catalog INSERT/UPDATE is gated on `user_has_role(auth.uid(),'super_admin')` (function from 00021), not a JWT claim.
- Promotion/demotion/nomination RPCs are SECURITY DEFINER with manual internal auth checks; the promotion-candidates and vendor-studio-stats views are SECURITY INVOKER so they inherit caller RLS.
- Field-capture RPCs (00235) are SECURITY INVOKER.

---

## 5. API / Edge / Service Surface

### Database RPCs (Postgres functions, SECURITY DEFINER unless noted)

| RPC | Signature / Returns | Migration |
|---|---|---|
| `promote_to_studio` | `(p_product_id, p_studio_id, p_vendor_contact, p_payment_terms, p_category, p_usage_notes, p_lead_time_weeks, p_subcategory)` → uuid | 00154 |
| `demote_to_personal` | `(p_product_id)` → uuid | 00154 |
| `is_product_in_active_use` | `(p_product_id)` → bool (STABLE) | 00154 |
| `set_nomination_status` | `(p_nomination_id, p_to_status, ...)` — super_admin admin entry point | 00160 |
| `nomination_transition_is_legal` | `(p_from, p_to)` → bool (IMMUTABLE) | 00158 |
| `link_studio_to_catalog_for_vendor` | `(vendor_id)` → int | 00161 |
| `commit_field_capture` | SECURITY INVOKER | 00235 |
| `route_field_capture` | SECURITY INVOKER | 00235 |
| `dismiss_field_capture` | SECURITY INVOKER | 00235 |
| `mark_capture_upload_complete` | SECURITY INVOKER | 00235 |
| `merge_capture_artifact_sha256` | SECURITY INVOKER | 00235 |

### Views

- `v_promotion_candidates` (00153) — SECURITY INVOKER / RLS-filtered.
- `v_vendor_studio_stats` (00159) — SECURITY INVOKER / RLS-filtered.

### Next.js API routes

- `catalogApi` (`@/lib/api-client`) → `/api/catalog/products` (list) and `updateProduct(id, …)` used by the classic product detail/edit page. Capture writes and layer queries go **direct via supabase-js** (no dedicated capture edge function exists).

### Edge functions

- **None** specific to capture/library/catalog. Capture is client→Postgres (extension/portal via supabase-js; iOS via the 00235 RPCs).

---

## 6. UI Surfaces

### Designer portal — classic (`(portal)/portal/`)

- `/portal/library` → redirect to last layer.
- `/portal/library/personal`, `/portal/library/studio`, `/portal/library/catalog`, `/portal/library/search`.
- `/portal/catalog` → redirect to `/portal/library/personal`.
- `/portal/catalog/[id]` (detail), `/portal/catalog/[id]/edit`.
- `/portal/catalog/new` (manual add), `/portal/catalog/import` (CSV wizard).
- `/portal/catalog/collections[/new,/[id],/[id]/edit]`, `/portal/catalog/categories`.

### Designer portal — The Document (`(document)/`, default)

- `/library` (LibraryRoom, three shelves).
- `/library/[id]` (The Piece — view+edit one item).
- `/compose` (author a new piece).

### Promotion / nomination overlays (mounted in both shells)

- Promote-to-Studio (single + bulk).
- Promotion Banner (candidate count → bulk review).
- Promotion Toast.
- Nominate-to-Catalog modal/sheet.
- Nomination Status Banner.
- Vendor Context Block.

### Admin portal

- `/(dashboard)/nominations` — the nomination state-machine tool (`useAdminNominations` + `useSetNominationStatus`), status filter + guided next-step transitions.

### Chrome extension (Plasmo side panel)

- Extract → Record/Snapshot screens, Vendor screen (vendor-only capture), commit bar.
- Overlays for account/project-create/decision/image-select/recent-captures/settings.

### iOS

- Patina Field Capture app (camera-first, 32 screens) → `field_captures` inbox → commit to personal Library.

### Manufacturer portal

- `apps/manufacturer-portal` exists but is a ~2-page scaffold (onboarding flow not built).

---

## 7. Reconciliation & Gaps

### Spec-vs-reality drift

- ⚠ Studio identity: PRD/handoff §4.3 specify `studios` + `studio_members` tables; code reuses `organizations` + `organization_members` (00152 documents the swap). `products.studio_id → organizations(id)`.
- ⚠ Roles: PRD uses owner/designer/editor/viewer; code uses the `member_role` enum owner/admin/member/guest (Layer-2 edit = any non-guest).
- ⚠ Catalog authority: PRD specs a `patina_admin` JWT claim; code gates catalog INSERT/UPDATE on `user_has_role(auth.uid(),'super_admin')` (function from 00021).
- ⚠ Payment terms: PRD specs a `vendor_payment_terms` table + `payment_terms_id` FK; code reuses the `purchase_order_payment_pattern` enum as `products.payment_terms` (00152).
- ⚠ Vector dimension: handoff §4.1 specs `aesthete_vector vector(1536)`; 00152 created it at 1536 but 00239 re-typed the (empty) column to vector(768) — the handoff dimension is stale.
- ⚠ Package namespace: handoff says components live in `@strata/products` and extension is `@strata/extension`; actual is `@patina/catalog-ui` (+ portal-local `components/products/*`) and `@patina/*` throughout. ✓ Extension CLAUDE.md fixed 2026-08-29: `@strata/extension` references removed, spec path points to `docs/specs/_active/product-capture.md`.
- ⚠ `product-capture.md` lists `00011_add_retailer_id.sql` under "Files to Create" as future work; that migration already shipped long ago at 00011, and the vendor/retailer/mode-detection/trade-pricing/inline-vendor features it specs are largely built. Spec header still reads Status: Active / Completed: —.
- ⚠ Extension `progress.md` is stale: it lists `ProductCaptureForm.tsx` (no longer exists) and marks vendor inline creation / duplicate detection / offline queue as "Pending" — vendor inline creation + duplicate detection are built, offline queue removed in 0.3.0 (capture-launch, 2026-08-29); the extension was re-architected into a reducer/panel/screens state machine.
- ⚠ Two divergent product-detail surfaces coexist: classic library cards open the old `/portal/catalog/[id]` detail, while the Piece (R40, view+edit) is only reachable in document mode at `/library/[id]`. They do not share a route.
- ⚠ QA `REPORT.md` (2026-06-04) still describes the three-layer Library as pilot-gated on prod with `/portal/catalog` as the live experience; that gate was removed 2026-06-09 and `/portal/catalog` now redirects into `/portal/library/personal`.
- ⚠ Mobile capture: PRD `<MobileCapture>` is a mobile *web* photo/voice flow; what shipped is a separate **native iOS** Field Capture app (00232–00235). No mobile-web camera-capture component exists in the portals; the document CaptureSheet only does URL-paste + manual entry.
- ⚠ Manufacturer Portal: handoff §7.5 assumes a working `apps/manufacturer-portal` that creates catalog products tagged with `nomination_id` and auto-transitions nominations to "live"; the app is a near-empty scaffold, so this handoff step is unbuilt.

### Known bugs / TODOs

- ⚠ Nomination notifications/emails do **not** fire. 00158 explicitly defers the in-app+email fan-out; there are zero nomination references in `packages/notifications` or edge functions. PRD §6.6 per-transition notifications and the S3.7 manufacturer-outreach email are unbuilt — nominations advance silently.
- ⚠ Manufacturer onboarding + Studio→Catalog auto-link is effectively a no-op: `link_studio_to_catalog_for_vendor` + the on-'live' trigger exist (00161) but nothing creates the catalog products for a vendor (manufacturer-portal unbuilt), so nominations cannot actually reach a live catalog outcome end-to-end.
- ⚠ Demotion (Studio→Personal) has a working RPC + hook (`demote_to_personal`, `use-promote-to-studio`) but **no UI entry point** in either the LayerView grids or the Piece room — a designer cannot trigger the 7-day undo / demote from the app.
- ⚠ Studio LayerView deferred features (per `studio/page.tsx` comments): sort-by-usage-count and per-vendor stat rows are not built; "By Vendor" grouping falls back to a free-text `brand` string rather than the vendor record.
- ⚠ Catalog tabs are partial: `Founding Circle` column exists (00163) but is unseeded in prod so the tab renders an honest-empty/"not yet wired" state; "For your active projects" is a category/style-tag heuristic, not Aesthete-vector driven; Aesthete match scores render "—" and Aesthete-sort on Browse is deferred until the engine scores.
- ⚠ Promotion candidacy ignores unresolved damage claims — the "ordered without unresolved damage" rule from PRD §6.1 is deferred in 00153.
- ⚠ `NominateToCatalogModal` is not UI-gated to studio owners (PRD §5.4 requires owner-only): the modal opens for any member and the RLS INSERT (`role='owner'`) is the only enforcement, so a non-owner sees the form then hits a DB error.
- ⚠ iOS Field Capture is validation-build only — real OAuth/sync deferred; branch `capture/foundation` pushed, not merged, app not on prod (though its backend migrations 00232–00235 are).
- ⚠ CSV import and product image upload were never verified on prod (QA tooling boundary); the import wizard renders but the end-to-end path is unproven.
- ⚠ Last-selected-layer persistence is device-local (`localStorage`) only; server/account-level persistence intentionally deferred.
- ⚠ PostHog capture/promotion/nomination analytics dashboards (handoff §10.5) are unconfirmed; the extension has `lib/analytics.ts` but the six required dashboards are not evidenced in-repo.

---

## 8. Forward Roadmap / Open Requirements

| Item | Priority |
|---|---|
| Wire nomination lifecycle notifications (in-app + email to studio on each transition; manufacturer outreach on "contacted") — the pipeline currently dead-ends silently. | P0 |
| Converge the two product-detail surfaces (classic `/portal/catalog/[id]` vs the Piece `/library/[id]`) onto one canonical view+edit to stop divergence as The Document becomes the only shell. | P0 |
| Build the Manufacturer Portal onboarding flow so nominations can actually reach "live" and Studio→Catalog linking (00161) fires against real catalog products. | P1 |
| Surface a Demote / 7-day-undo entry point in the UI (RPC + hook already exist). | P1 |
| Finish Studio LayerView: usage-count sort, per-vendor stat rows, real vendor grouping; add the damage-claim exclusion to promotion candidacy (00153 TODO). | P1 |
| Gate `NominateToCatalogModal` to studio owners in the UI (currently RLS-only). | P2 |
| Seed Founding Circle vendors in prod and light up Aesthete-driven catalog sort + match scores once the AE engine scores products. | P2 |
| Retire/refresh stale docs: update the QA report's pilot-gate note; fold `product-capture.md` + extension UX flow into the as-built PRD; decide whether mobile-web capture is superseded by the iOS Field Capture app. | P2 |

---

## 9. Status & Deploy

**Three-layer catalog + capture (00011, 00149, 00152–00163, 00172)**: on main and on prod. The three-layer Library graduated for all orgs on 2026-06-09 (the `useLibraryPilotEnabled` DB gate was removed; `/portal/catalog` redirects to `/portal/library/personal`). Capture writes `layer='personal'` from the extension, portal URL-paste, and manual add.

**The Document Library/Piece**: The Piece (R40, `/library/[id]`) merged to main and shipped to prod on 2026-06-24 (no migration; prod already ≥00229). The Document shell is the default surface via `the-document-pilot`.

**Field-capture backend (00232–00235) + Aesthete space (00239–00240)**: part of the migration tier (00230–00254) recently deployed + verified on prod (per the aesthete tier-1 deploy). The **iOS Field Capture app itself** (branch `capture/foundation`) is validation-build only and NOT merged / not on prod.

**Manufacturer Portal**: scaffold only — not a deployable onboarding flow.

**Nomination notifications**: not implemented, so nothing to deploy on that leg.

---

## 10. Superseded Sources

- `docs/prds/patina-three-layer-catalog-engineering-handoff.md`
- `docs/prds/patina-three-layer-product-catalog.html`
- `docs/prds/patina-promotion-modals-deep-design.html`
- `docs/specs/_active/product-capture.md`
- `docs/implementation/product-capture/progress.md`
- `docs/design/Chrome ext/patina-extension-ux-flow.html`
