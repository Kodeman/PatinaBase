# Layer 1 → 2 → 3 Promotion Flow — Deferred to v1.1

**Status:** Deferred from procurement-workspace v1 / Sprint 3 / Wave 3.3
**Owner candidate:** TBD (cross-functional — needs data, RLS, UI, audit)
**PRD reference:** `docs/prds/patina-procurement-workspace-v1.html` §12 Phase 3
**Engineering spec (already written):** `docs/prds/patina-three-layer-catalog-engineering-handoff.md` (1352 lines, authoritative)
**Sprint 3 W3.3 brief:** authorized Path C deferral if recon shows the slice is larger than v1 scope allows.

---

## 1. Why deferred (recon summary)

The Sprint 3 W3.1 architect dossier (`docs/handoffs/procurement-workspace-wave-3.1-architect-dossier.md` §5 "Layer promotion scope clarification", lines 740–746) flagged that admin-portal-side Layer promotion is out of v1 designer-portal scope. Recon during Wave 3.3 confirmed why a clean Path A/B slice is **not** feasible inside Sprint 3:

### What exists today

- **`products` table:** has `status TEXT` (`draft / in_review / published / deprecated / archived`, defaulted to `published` after migration 00129) and `captured_by UUID` (auth.users). **No `layer`, `owner_user_id`, `studio_id`, `nominated_for_catalog`, `promoted_from_id`, `promoted_at`, `promoted_by` columns.**
- **`vendors.is_patina_catalog BOOLEAN`** (00149) — the Patina Catalog concept is currently a *vendor-level* flag, not a per-product layer.
- **`pipeline_vendors`** (00076) — separate from `vendors`. A vendor promotion pipeline already exists for B2B onboarding (discovery → live), but no equivalent for products.
- **`user_roles` + `roles.domain = 'studio_owner'`** (referenced in 00148) — the studio-owner role exists as a flat scalar role. **No `studios` or `studio_members` table exists.**
- **Admin portal:** has `/admin/catalog` (product CRUD, bulk import, dialogs) and `/admin/pipeline` (vendor pipeline). No layer/promotion surface.

### What the three-layer engineering handoff demands

Per `docs/prds/patina-three-layer-catalog-engineering-handoff.md`, a real implementation requires (non-exhaustive):

1. **Schema (§4.1):**
   - New `products.layer TEXT NOT NULL DEFAULT 'personal' CHECK (layer IN ('personal','studio','catalog'))`.
   - New columns: `owner_user_id`, `studio_id`, `promoted_from_id`, `promoted_at`, `promoted_by`, `vendor_contact JSONB`, `payment_terms_id`, `category`, `subcategory`, `usage_notes`, `style_tags`, `material_tags`, `aesthete_vector vector(1536)`, `commission_rate`, `patina_managed`.
   - Three CHECK constraints (`personal_requires_owner`, `studio_requires_metadata`, `catalog_requires_management`).
   - Backfill strategy for ~existing `products` rows (which layer do they land on?).

2. **New supporting tables (§4.3):**
   - `studios` (does not exist).
   - `studio_members` (does not exist).
   - `promotion_audit_log` (does not exist).
   - `vendor_nominations` (does not exist).
   - `vendor_payment_terms` (referenced by FK, may or may not exist under that name).

3. **RLS replacement (§4.2):**
   - Current `products` RLS policies are public-read / authenticated-write. The three-layer model replaces them with three new policies tied to `auth.uid()`, `studio_id`, and a `current_studio_id()` SQL function. **This is a wholesale RLS rewrite, not an extension** — every place in the codebase that reads from `products` must be re-audited.

4. **UI components (§5, ~10 components):**
   - `<LayerIcon />`, `<LayerChip />`, `<ProductsZone />`, `<LayerView />`, `<ProductCard />`
   - `<DestinationPicker />` (capture-side)
   - `<PromoteToStudioModal />`, `<BulkPromoteToStudioModal />`, `<NominateToCatalogModal />`, `<NominationPostSubmitModal />`
   - `<PromotionBanner />`, `<PromotionToast />`, `<NominationStatusBanner />`, `<VendorContextBlock />`
   - `<PrefilledInput />`, `<PrefilledChip />`

5. **Promotion logic (§6):**
   - Candidate eligibility checks (Personal → Studio).
   - Pre-population from vendor/category/usage context (must satisfy the "pre-populate aggressively" principle).
   - Promotion mutation (with audit log row).
   - Bulk promotion.
   - **Demotion (Studio → Personal)** — required for the "system is undoable" principle.
   - **Nomination state machine** (`pending → under_review → accepted | rejected | needs_more_info`), including renomination.

6. **Integration impacts (§7):**
   - Procurement Workspace: every By-Vendor / By-Status / Calendar query that reads `products` must respect layer-scoped RLS.
   - Aesthete Engine: training data source switches per layer.
   - Project FF&E: slot assignment must enforce layer access.
   - Capture pipeline: `captured_by` → `owner_user_id` migration, plus default `layer = 'personal'` write path.
   - Manufacturer Portal handoff: a v2 surface that nominations eventually flow into.

### Why this can't be a single Sprint 3 slice

The brief's Path B (a single boolean or smallint column) would be a **lie shaped like progress**. A `products.layer` enum without:

- the `studios` table (Layer 2 visibility scope is undefined),
- the RLS replacement (everyone keeps seeing everything regardless of column value),
- the promotion audit log (the "system is undoable" principle is violated by default),
- and the promotion modals with pre-populated vendor context (Principle 2 violated),

…produces something that **looks like Layer 1→2→3 promotion** but provides none of the actual guarantees. Worse, designers who see "Promote to Studio" in the UI would reasonably assume the studio-sharing semantics work. They wouldn't.

The Wave 3.1 architect explicitly recommended deferring this to a follow-on migration **after** the team decides on the studio model (`docs/handoffs/procurement-workspace-wave-3.1-architect-dossier.md` line 746):

> The data architect recommendation: **do not add a Layer 2→3 column in migration 00151**. Leave it to Wave 3.3's Integration Engineer to verify whether `products.status` already covers this or if a new boolean is needed, then add it in a follow-on migration if required. This is explicitly deferred from the data layer dossier to avoid blocking on a decision that belongs in the product domain.

Wave 3.3 IE2 verified: `products.status` does **not** cover the Layer concept. Adding a boolean now would not be a follow-on; it would be premature. **Defer cleanly to v1.1.**

### What v1 *does* cover (closes the PRD bullet partially)

The architect dossier (lines 742–745) notes that the *designer-facing* halves of Layers 1 and 2 are already partially live in v1 via different surfaces:

- **Layer 1 captures** are simply rows in `products` written by `captured_by = auth.uid()` from the Chrome extension and iOS capture surfaces. They are visible to the capturing designer via the existing capture / library views.
- **Layer 1 → "Layer 2" for designer use** is operationally equivalent to **assigning a captured product to an FF&E slot** via `useAssignProductToFfeSlot` (added in Sprint 3 Wave 3.3 IE1). The designer "promotes" an unvetted capture by actively placing it in a project room.

The pieces that are deferred to v1.1 are the **admin-portal-side curation surface** and the **studio-shared library + Patina catalog nomination workflow** — neither of which Leah or the 2 pilot designers need on day one of the procurement-workspace pilot.

---

## 2. Minimum acceptable v1.1 slice

When v1.1 picks this up, the smallest deliverable that satisfies the PRD bullet without being a lie is:

### v1.1.A — Schema + RLS foundation (1 migration, blocks all UI)

1. **00152 (or later):** add the `studios` and `studio_members` tables. Backfill: every designer with `roles.domain IN ('designer','studio_owner')` gets a one-person studio with themselves as `owner`. (This is the precondition for any layer semantics to have meaning — without it, Layer 2 is identical to Layer 1.)
2. **00153:** add the layer column + supporting columns to `products`, with backfill rule "every existing product → `layer = 'personal'`, `owner_user_id = captured_by` (with fallback for null `captured_by`)".
3. **00154:** replace `products` RLS policies with the three-layer set from the engineering handoff §4.2. **This is the breaking change** — every consumer must be re-tested.
4. **00155:** add `promotion_audit_log` and `vendor_nominations`.

### v1.1.B — Admin promotion surface (after foundation lands)

- `/admin/catalog/promotions` route (or `/admin/products/promote` as the brief hinted). Two tabs:
  - **Studio nominations:** Layer-2 products flagged by their owning studio for Patina Catalog inclusion. Admin reviews → accepts/rejects with reason.
  - **Catalog candidates:** Patina-admin-curated suggestions to nominate from across the platform.
- Reuses the `vendor-table.tsx` pattern from `apps/admin-portal/src/components/pipeline/` (sortable, filterable, stage-tagged).
- New hook: `useNominationQueue()`, `useAcceptNomination()`, `useRejectNomination()`.

### v1.1.C — Designer promotion surface (separate sprint)

- `<PromoteToStudioModal />` (handoff §5.4) wired into the designer-portal product detail view.
- `<NominateToCatalogModal />` wired into the studio library product detail.
- Audit toast + undo (7-day window per Principle 5).

### v1.1.D — Aesthete / catalog ingestion (deferred further)

Layer 3 catalog entries that result from accepted nominations must complete a manufacturer-portal onboarding flow. That work has its own engineering plan and is not blocking v1.1.A–C.

---

## 3. What ships in Sprint 3 Wave 3.3 IE2

A single **deferral stub** in the admin portal at `/admin/catalog/promotions`:
- Renders a `PageHeader` + a centered `EmptyState` titled "Layer promotion · Coming in v1.1".
- Body copy links to this document.
- Visible only to admins (lives inside the `(dashboard)` shell, which already gates).
- Zero new dependencies, zero new hooks, zero schema changes, zero RLS changes.

The stub exists so that:
- The PRD §12 Phase 3 bullet ("Layer 1 → Layer 2 promotion flow · Layer 2 → Layer 3 nomination flow") has a discoverable surface in the admin portal that points at the work, rather than being a silent omission.
- Anyone clicking through the admin navigation looking for the promotion flow finds a clear, dated promise of where it lands.

---

## 4. Verification (Wave 3.3 IE2)

- `pnpm --filter @patina/supabase type-check` → exits 0 (no supabase changes).
- `pnpm --filter @patina/admin-portal type-check` → unchanged baseline (1 pre-existing error in `@patina/help-system/StrataInfoIcon` re: missing `StrataMark` export — unrelated to this work).
- No new migrations.
- No new hooks.
- No RLS changes.

---

## 5. References

- PRD: `docs/prds/patina-procurement-workspace-v1.html` §12 Phase 3
- Engineering spec: `docs/prds/patina-three-layer-catalog-engineering-handoff.md`
- W3.1 architect dossier (scope clarification): `docs/handoffs/procurement-workspace-wave-3.1-architect-dossier.md` §5 "Layer promotion scope clarification"
- Existing pipeline pattern to mimic: `apps/admin-portal/src/components/pipeline/vendor-table.tsx`
- Studio-owner role definition: `supabase/migrations/00148_procurement_workspace_v1.sql` lines 141, 173, 182–190
- Patina Catalog vendor flag: `supabase/migrations/00149_vendors_is_patina_catalog.sql`
