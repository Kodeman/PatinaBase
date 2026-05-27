-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 00152: Three-Layer Product Catalog
--
-- Restructures the single-catalog products table into a three-layer
-- architecture: Personal Library → Studio Library → Patina Catalog. Layer
-- visibility is enforced by RLS, not application code. Promotion between
-- layers is an UPDATE (IDs stable), tracked in promotion_audit_log. Vendor
-- nomination from Studio Library into the Catalog flows through
-- vendor_nominations with a server-validated state machine (state machine
-- itself lands in a Sprint 3 migration; this one only creates the table
-- and base constraints).
--
-- Source of truth: docs/prds/patina-three-layer-catalog-engineering-handoff.md
--
-- Codebase deltas from the PRD:
--   • Studio identity reuses `organizations` + `organization_members` (no
--     new `studios` / `studio_members` tables). `products.studio_id`
--     references `organizations(id)`, mirroring `projects.studio_id` from
--     migration 00084.
--   • member_role enum is ('owner', 'admin', 'member', 'guest'). PRD
--     owner/designer/editor/viewer ↦ owner/admin/member/guest. Layer 2
--     UPDATE = any non-guest member.
--   • No `patina_admin` JWT claim exists; we gate Catalog UPDATE on
--     user_has_role(auth.uid(), 'super_admin') (function from 00021).
--   • No `vendor_payment_terms` table; `products.payment_terms` reuses the
--     `purchase_order_payment_pattern` enum from 00148, matching the
--     Procurement Workspace's own vendor.default_payment_terms column.
--   • catalog_equivalent_id is added now (used by S3.8 Studio→Catalog
--     linking) so Sprint 3 doesn't need a second schema change.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── Products: layer column + Layer 2/3 fields ─────────────────────────────

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS layer TEXT,
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS studio_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS promoted_from_id UUID REFERENCES products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS promoted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vendor_contact JSONB,
  ADD COLUMN IF NOT EXISTS payment_terms purchase_order_payment_pattern,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS subcategory TEXT,
  ADD COLUMN IF NOT EXISTS usage_notes TEXT,
  ADD COLUMN IF NOT EXISTS lead_time_weeks INTEGER,
  ADD COLUMN IF NOT EXISTS style_tags TEXT[],
  ADD COLUMN IF NOT EXISTS material_tags TEXT[],
  ADD COLUMN IF NOT EXISTS aesthete_vector vector(1536),
  ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(4, 2),
  ADD COLUMN IF NOT EXISTS patina_managed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS catalog_equivalent_id UUID REFERENCES products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merged_into_id UUID REFERENCES products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Backfill all existing rows to layer='catalog' BEFORE applying the NOT NULL
-- + CHECK constraints. Per PRD §13.4, existing Patina catalog data migrates
-- as patina_managed=true. owner_user_id stays NULL (catalog has no owner);
-- studio_id stays NULL (catalog is Patina-managed, not studio-managed).
UPDATE products
SET layer = 'catalog',
    patina_managed = TRUE
WHERE layer IS NULL;

-- Lock in NOT NULL + CHECK on the layer column. No DEFAULT — the trigger
-- below normalizes legacy INSERTs to layer='catalog' so existing app code
-- (admin portal catalog wizard, bulk import, etc.) keeps working through
-- Sprint 1 / 2 while individual callsites are migrated to be explicit.
ALTER TABLE products
  ALTER COLUMN layer SET NOT NULL;

ALTER TABLE products
  ADD CONSTRAINT products_layer_check
    CHECK (layer IN ('personal', 'studio', 'catalog'));

-- Layer-specific required fields.
-- personal: owner_user_id MUST be set.
ALTER TABLE products
  ADD CONSTRAINT products_personal_requires_owner
    CHECK (layer != 'personal' OR owner_user_id IS NOT NULL);

-- studio: studio_id + the Layer 2 metadata bundle MUST be set.
-- (Promotion mutation in S2.5 validates these before issuing the UPDATE;
--  CHECK is the safety net.)
ALTER TABLE products
  ADD CONSTRAINT products_studio_requires_metadata
    CHECK (
      layer != 'studio'
      OR (
        studio_id        IS NOT NULL
        AND vendor_contact   IS NOT NULL
        AND lead_time_weeks  IS NOT NULL
        AND payment_terms    IS NOT NULL
        AND category         IS NOT NULL
        AND usage_notes      IS NOT NULL
      )
    );

-- catalog: patina_managed must be true. studio_id may be NULL (Patina runs
-- the catalog; the studio_id column is for studio-managed items).
ALTER TABLE products
  ADD CONSTRAINT products_catalog_requires_management
    CHECK (layer != 'catalog' OR patina_managed = TRUE);

-- Indexes (PRD §4.1). idx_products_embedding already exists from 00001.
CREATE INDEX IF NOT EXISTS idx_products_layer    ON products(layer);
CREATE INDEX IF NOT EXISTS idx_products_owner    ON products(owner_user_id) WHERE layer = 'personal';
CREATE INDEX IF NOT EXISTS idx_products_studio   ON products(studio_id)     WHERE layer IN ('studio', 'catalog');
CREATE INDEX IF NOT EXISTS idx_products_promoted ON products(promoted_from_id) WHERE promoted_from_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_catalog_equivalent
  ON products(catalog_equivalent_id) WHERE catalog_equivalent_id IS NOT NULL;

COMMENT ON COLUMN products.layer IS
  'Visibility layer: personal (private to owner_user_id), studio (shared within studio_id organization), or catalog (Patina-managed, visible to all authenticated). Enforced by RLS; never filter in application code.';
COMMENT ON COLUMN products.owner_user_id IS
  'Authoritative owner for layer=personal items. Distinct from captured_by, which is historical attribution (the user who first ran the capture). On promotion to studio, owner_user_id is cleared; on demotion, the demoting user becomes the new owner.';
COMMENT ON COLUMN products.studio_id IS
  'Organization (a design_studio per organizations.type) that owns this product when layer=studio. NULL for personal and (typically) catalog items.';
COMMENT ON COLUMN products.payment_terms IS
  'Reuses purchase_order_payment_pattern from 00148 — keeps Studio Library promotion data consistent with the Procurement Workspace order flow.';

-- ─── Soft-landing trigger for layer-unaware INSERTs ────────────────────────
--
-- Existing INSERT callsites (admin portal catalog routes, bulk import, the
-- extension's current background.ts, dev seed) don't know about layer /
-- owner_user_id / patina_managed. This trigger normalizes:
--   1. Missing layer  → 'catalog' (preserves historic single-catalog behavior)
--   2. layer='catalog' + patina_managed=false → set patina_managed=true
--      (matches the catalog_requires_management CHECK)
--   3. layer='personal' + owner_user_id=null + captured_by set
--      → owner_user_id := captured_by (matches personal_requires_owner)
--
-- The trigger is intentionally PERMISSIVE — explicit callers always win.
-- Sprint 1 task S1.5 makes the capture pipeline explicit (layer='personal',
-- owner_user_id set). Once every callsite is layer-aware, this trigger can
-- be simplified to just step (2) and eventually removed.
CREATE OR REPLACE FUNCTION products_normalize_layer_defaults()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.layer IS NULL THEN
    NEW.layer := 'catalog';
  END IF;

  IF NEW.layer = 'catalog' AND NEW.patina_managed IS DISTINCT FROM TRUE THEN
    NEW.patina_managed := TRUE;
  END IF;

  IF NEW.layer = 'personal'
     AND NEW.owner_user_id IS NULL
     AND NEW.captured_by IS NOT NULL THEN
    NEW.owner_user_id := NEW.captured_by;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_normalize_layer_defaults_trigger
  BEFORE INSERT ON products
  FOR EACH ROW
  EXECUTE FUNCTION products_normalize_layer_defaults();

COMMENT ON FUNCTION products_normalize_layer_defaults() IS
  'Transitional trigger that normalizes layer/owner/patina_managed defaults for INSERTs from layer-unaware code paths. See migration 00152 header. Remove once all INSERT callsites are explicit (post Sprint 2).';

-- ─── Vendors: nomination + trade-context fields ────────────────────────────

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS preferred_contact JSONB,
  ADD COLUMN IF NOT EXISTS trade_account_established_at DATE,
  ADD COLUMN IF NOT EXISTS nomination_status TEXT,
  ADD COLUMN IF NOT EXISTS nominated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS nominated_at TIMESTAMPTZ;

ALTER TABLE vendors
  ADD CONSTRAINT vendors_nomination_status_check
    CHECK (
      nomination_status IS NULL
      OR nomination_status IN ('none', 'submitted', 'under_review', 'contacted', 'onboarding', 'live', 'declined')
    );

-- Case-insensitive lookup index for vendor resolution on capture. The
-- UNIQUE variant (race-safe ON CONFLICT) lands in the Sprint 2 migration
-- that also de-duplicates the existing seed/production website data —
-- making it unique here would block the dev seed which uses a shared
-- placeholder domain across many vendor rows.
CREATE INDEX IF NOT EXISTS idx_vendors_website_lower
  ON vendors(lower(website))
  WHERE website IS NOT NULL;

-- ─── promotion_audit_log ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS promotion_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  from_layer      TEXT NOT NULL CHECK (from_layer IN ('personal', 'studio', 'catalog')),
  to_layer        TEXT NOT NULL CHECK (to_layer   IN ('personal', 'studio', 'catalog')),
  actor_user_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action_type     TEXT NOT NULL CHECK (action_type IN ('promote', 'demote', 'merge', 'undo')),
  merged_into_id  UUID REFERENCES products(id) ON DELETE SET NULL,
  field_snapshot  JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_promotion_audit_product ON promotion_audit_log(product_id);
CREATE INDEX idx_promotion_audit_recent  ON promotion_audit_log(created_at DESC);

COMMENT ON TABLE promotion_audit_log IS
  'Append-only record of every layer transition. field_snapshot stores the row state at transition time so undo (PRD §6.5) can reconstruct.';

-- ─── vendor_nominations ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vendor_nominations (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id                   UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  studio_id                   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nominated_by_user_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,

  -- nomination content
  manufacturer_contact        JSONB NOT NULL, -- { name, email }
  recommendation_note         TEXT  NOT NULL,
  fit_signals                 TEXT[],

  -- state machine
  status                      TEXT NOT NULL DEFAULT 'submitted'
                              CHECK (status IN ('submitted', 'under_review', 'contacted', 'onboarding', 'live', 'declined')),
  status_updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status_updated_by           UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- state-specific data
  patina_outreach_sent_at     TIMESTAMPTZ,
  patina_outreach_summary     TEXT,
  manufacturer_responded_at   TIMESTAMPTZ,
  decline_reason              TEXT,
  catalog_live_at             TIMESTAMPTZ,

  -- renomination tracking
  previous_nomination_id      UUID REFERENCES vendor_nominations(id) ON DELETE SET NULL,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nominations_vendor ON vendor_nominations(vendor_id);
CREATE INDEX idx_nominations_status ON vendor_nominations(status);
CREATE INDEX idx_nominations_studio ON vendor_nominations(studio_id);

CREATE TRIGGER update_vendor_nominations_updated_at
  BEFORE UPDATE ON vendor_nominations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE vendor_nominations IS
  'Designer-initiated requests to onboard a vendor into the Patina Catalog. Status transitions are gated by a trigger added in the Sprint 3 migration; v1 only stores the rows.';

-- ─── Row Level Security on products: replace existing policies ─────────────
--
-- The legacy products policies (00001, 00002, 00003) granted broad
-- authenticated read/write and anon read. The three-layer model needs
-- layer-aware policies. Drop the old ones explicitly so the new ones are
-- the only path.

DROP POLICY IF EXISTS "Authenticated users can read products"        ON products;
DROP POLICY IF EXISTS "Authenticated users can insert own products"  ON products;
DROP POLICY IF EXISTS "Users can update own products"                ON products;
DROP POLICY IF EXISTS "Users can delete own products"                ON products;
DROP POLICY IF EXISTS "Allow authenticated access to products"       ON products;
DROP POLICY IF EXISTS "Allow anon read access to products"           ON products;

-- ── SELECT ────────────────────────────────────────────────────────────────
-- Personal: only the owner. Studio: any active org member. Catalog: any
-- authenticated user. Anon: catalog only (preserves marketing-site reads).
CREATE POLICY products_personal_select ON products
  FOR SELECT
  TO authenticated
  USING (layer = 'personal' AND owner_user_id = auth.uid());

CREATE POLICY products_studio_select ON products
  FOR SELECT
  TO authenticated
  USING (
    layer = 'studio'
    AND studio_id IN (
      SELECT om.organization_id
      FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY products_catalog_select_authenticated ON products
  FOR SELECT
  TO authenticated
  USING (layer = 'catalog');

CREATE POLICY products_catalog_select_anon ON products
  FOR SELECT
  TO anon
  USING (layer = 'catalog');

-- ── INSERT ────────────────────────────────────────────────────────────────
-- Personal: any authenticated user, must own the row. Studio: any non-guest
-- member of the target studio. Catalog: super_admin only.
CREATE POLICY products_personal_insert ON products
  FOR INSERT
  TO authenticated
  WITH CHECK (
    layer = 'personal'
    AND owner_user_id = auth.uid()
  );

CREATE POLICY products_studio_insert ON products
  FOR INSERT
  TO authenticated
  WITH CHECK (
    layer = 'studio'
    AND studio_id IN (
      SELECT om.organization_id
      FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin', 'member')
    )
  );

CREATE POLICY products_catalog_insert ON products
  FOR INSERT
  TO authenticated
  WITH CHECK (
    layer = 'catalog'
    AND user_has_role(auth.uid(), 'super_admin')
  );

-- ── UPDATE ────────────────────────────────────────────────────────────────
-- Personal: owner only, and only while it stays personal OR while promoting
--   into a studio they belong to (the promotion mutation handles owner
--   clearing). Catch-all USING is owner_user_id = auth.uid() OR
--   (the row is moving into a studio the user belongs to).
-- Studio: any non-guest member of the studio.
-- Catalog: super_admin only.
CREATE POLICY products_personal_update ON products
  FOR UPDATE
  TO authenticated
  USING (layer = 'personal' AND owner_user_id = auth.uid())
  WITH CHECK (
    -- After-state: still personal (edit) OR being promoted to a studio the
    -- caller is a non-guest member of (promotion path).
    (layer = 'personal' AND owner_user_id = auth.uid())
    OR (
      layer = 'studio'
      AND studio_id IN (
        SELECT om.organization_id
        FROM organization_members om
        WHERE om.user_id = auth.uid()
          AND om.status = 'active'
          AND om.role IN ('owner', 'admin', 'member')
      )
    )
  );

CREATE POLICY products_studio_update ON products
  FOR UPDATE
  TO authenticated
  USING (
    layer = 'studio'
    AND studio_id IN (
      SELECT om.organization_id
      FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin', 'member')
    )
  )
  WITH CHECK (
    -- After-state: stays in studio (edit), demotes to personal owned by the
    -- caller (demotion path), or escalates to catalog by a super_admin.
    (
      layer = 'studio'
      AND studio_id IN (
        SELECT om.organization_id
        FROM organization_members om
        WHERE om.user_id = auth.uid()
          AND om.status = 'active'
          AND om.role IN ('owner', 'admin', 'member')
      )
    )
    OR (layer = 'personal' AND owner_user_id = auth.uid())
    OR (layer = 'catalog' AND user_has_role(auth.uid(), 'super_admin'))
  );

CREATE POLICY products_catalog_update ON products
  FOR UPDATE
  TO authenticated
  USING (layer = 'catalog' AND user_has_role(auth.uid(), 'super_admin'))
  WITH CHECK (user_has_role(auth.uid(), 'super_admin'));

-- ── DELETE ────────────────────────────────────────────────────────────────
-- Hard delete is rare; soft-delete via deleted_at is the standard. Allow
-- hard delete only on personal (by owner) and catalog (by super_admin).
-- Studio deletes go through demotion or a soft-delete update.
CREATE POLICY products_personal_delete ON products
  FOR DELETE
  TO authenticated
  USING (layer = 'personal' AND owner_user_id = auth.uid());

CREATE POLICY products_catalog_delete ON products
  FOR DELETE
  TO authenticated
  USING (layer = 'catalog' AND user_has_role(auth.uid(), 'super_admin'));

-- ─── RLS on promotion_audit_log + vendor_nominations ──────────────────────

ALTER TABLE promotion_audit_log  ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_nominations   ENABLE ROW LEVEL SECURITY;

-- promotion_audit_log: visible to anyone who could see the underlying
-- product, and writable only by the system (service_role) — the promotion
-- mutation will run with elevated rights through RPCs in Sprint 2.
CREATE POLICY promotion_audit_select ON promotion_audit_log
  FOR SELECT
  TO authenticated
  USING (
    product_id IN (SELECT id FROM products) -- relies on products RLS to filter
  );

CREATE POLICY promotion_audit_service_write ON promotion_audit_log
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- vendor_nominations: studio members can see their own; super_admin can see
-- all. INSERT is studio owners only (per PRD §5.4 NominateToCatalogModal
-- access control). UPDATE only by super_admin (state machine in Sprint 3).
CREATE POLICY vendor_nominations_select ON vendor_nominations
  FOR SELECT
  TO authenticated
  USING (
    user_has_role(auth.uid(), 'super_admin')
    OR studio_id IN (
      SELECT om.organization_id
      FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY vendor_nominations_insert ON vendor_nominations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    nominated_by_user_id = auth.uid()
    AND studio_id IN (
      SELECT om.organization_id
      FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role = 'owner' -- PRD: studio owners only
    )
  );

CREATE POLICY vendor_nominations_admin_update ON vendor_nominations
  FOR UPDATE
  TO authenticated
  USING (user_has_role(auth.uid(), 'super_admin'))
  WITH CHECK (user_has_role(auth.uid(), 'super_admin'));

-- ─── Validate backfill ────────────────────────────────────────────────────
-- Belt-and-suspenders: any row that doesn't satisfy the new constraints
-- should be flagged before we commit.
DO $$
DECLARE
  bad_row_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO bad_row_count
  FROM products
  WHERE
    (layer = 'personal' AND owner_user_id IS NULL)
    OR (layer = 'studio'  AND (studio_id IS NULL OR vendor_contact IS NULL OR lead_time_weeks IS NULL OR payment_terms IS NULL OR category IS NULL OR usage_notes IS NULL))
    OR (layer = 'catalog' AND patina_managed = FALSE);

  IF bad_row_count > 0 THEN
    RAISE EXCEPTION 'Migration 00152 backfill validation failed: % product rows violate layer-specific constraints', bad_row_count;
  END IF;
END$$;

COMMIT;
