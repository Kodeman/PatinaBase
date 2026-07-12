-- ═══════════════════════════════════════════════════════════════════════════
-- 00306 — Agent OS: Catalog Normalizer staging (WP-2.4)
--
-- Vendor feed ingestion staging area. There is no vendor_feeds table (verified
-- by audit) — the admin /feeds page today enqueues legacy cowork_tasks
-- (task_type='feed_sync') against pipeline_vendors, and pipeline_vendors
-- already carries feed_url/feed_frequency/data_format/last_feed_sync_at
-- (00076). This migration adds the catalog-normalizer's OWN staging tables
-- (catalog_feed_batches/catalog_feed_items) rather than repurposing either —
-- cowork_tasks is frozen (00298) and pipeline_vendors is Cowork-scored vendor
-- discovery, a different lifecycle than "a file was uploaded, normalize it."
-- The normalizer enqueues into the ONE Agent OS queue (agent_tasks, 00297) —
-- no parallel queue.
--
-- Shape:
--   catalog_feed_batches — one row per uploaded/synced feed file. vendor_id
--     links to the catalog-side public.vendors (00001; products.vendor_id
--     FK target); pipeline_vendor_id optionally links to the Cowork-scored
--     pipeline_vendors (00076) when the feed came from a scouted vendor.
--     UNIQUE(vendor_id, content_hash) makes a re-upload of the identical file
--     a no-op (ON CONFLICT DO NOTHING at the insert callsite).
--   catalog_feed_items — one row per source row in the batch. raw is the
--     as-parsed row; normalized/confidence/field_confidence/diff are filled
--     by the normalizer edge function. UNIQUE(batch_id, source_row_hash)
--     makes re-normalizing an already-processed batch idempotent (ON CONFLICT
--     DO NOTHING; the edge function additionally skips any row whose hash is
--     already present regardless of status — see catalog-normalizer/core.ts).
--
-- products gains four normalizer-authored columns (vendor_sku, finishes,
-- freight_class, pricing_tiers) plus a partial unique index so the same
-- vendor SKU can't land twice in the managed catalog layer — catalog-only,
-- scoped by the CHECK below so personal/studio products (no vendor_sku
-- discipline) are unaffected.
--
-- promotion_audit_log (00152) gains a fifth action_type value,
-- 'catalog_commit', for the gated commit route (apps/admin-portal
-- .../api/admin/catalog/commit-batch) to record per-product write-backs.
-- The existing vocabulary (promote/demote/merge/undo) is about layer
-- transitions on an existing product; a normalizer commit is neither — it's
-- either a first arrival directly into catalog or a field-level refresh of
-- an already-catalog row, so it gets its own value rather than being
-- shoehorned into 'promote'/'merge'. This is a plain CHECK constraint (not an
-- enum type), so widening it in this same migration and using the new value
-- immediately (in application code, not SQL in this file) is safe — no
-- ALTER TYPE ADD VALUE transaction restriction applies.
--
-- RLS/grants follow the 00297/00300 idiom: admin-domain SELECT via the
-- user_roles/roles join, GRANT SELECT TO authenticated, no INSERT/UPDATE/
-- DELETE policy — all writes are service-role (the edge function + the
-- admin-portal API routes, both using the service-role client).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. products — normalizer-authored columns ──────────────────────────────
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS vendor_sku    text,
  ADD COLUMN IF NOT EXISTS finishes      text[],
  ADD COLUMN IF NOT EXISTS freight_class text,
  ADD COLUMN IF NOT EXISTS pricing_tiers jsonb;

COMMENT ON COLUMN public.products.vendor_sku IS
  'Vendor-assigned SKU/part number, as normalized from a catalog feed (00306). Unique per (vendor_id, vendor_sku) within layer=catalog — see idx_products_vendor_sku_catalog.';
COMMENT ON COLUMN public.products.finishes IS
  'Finish vocabulary matches (e.g. "walnut veneer", "brushed brass"), distinct from materials (raw material). Populated by the catalog normalizer (00306) or manual catalog entry.';
COMMENT ON COLUMN public.products.freight_class IS
  'NMFC-style freight class bucket (e.g. "class-70"), heuristically derived from weight/dimensions by the catalog normalizer (00306). Advisory, not a shipping-carrier lookup.';
COMMENT ON COLUMN public.products.pricing_tiers IS
  'Optional quantity/trade pricing tiers as parsed from a vendor feed, e.g. [{"min_qty":1,"price_cents":129900},{"min_qty":10,"price_cents":119900}]. NULL when the source feed carries only a single price.';

-- One vendor SKU maps to one catalog product. Personal/studio products don't
-- carry vendor SKU discipline, so this is scoped to layer='catalog' and only
-- fires when vendor_sku is actually set (a feed row that never resolves a SKU
-- falls back to source_url dedupe in the commit route, not this index).
DROP INDEX IF EXISTS idx_products_vendor_sku_catalog;
CREATE UNIQUE INDEX idx_products_vendor_sku_catalog
  ON public.products (vendor_id, vendor_sku)
  WHERE vendor_sku IS NOT NULL AND layer = 'catalog';

-- ─── 2. promotion_audit_log — widen action_type for normalizer commits ──────
ALTER TABLE public.promotion_audit_log
  DROP CONSTRAINT IF EXISTS promotion_audit_log_action_type_check;
ALTER TABLE public.promotion_audit_log
  ADD CONSTRAINT promotion_audit_log_action_type_check
    CHECK (action_type IN ('promote', 'demote', 'merge', 'undo', 'catalog_commit'));

-- ─── 3. catalog_feed_batches ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.catalog_feed_batches (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id          uuid NOT NULL REFERENCES public.vendors(id),
  pipeline_vendor_id uuid REFERENCES public.pipeline_vendors(id),
  source             text NOT NULL CHECK (source IN ('upload', 'url', 'cowork_bridge')),
  storage_path       text NOT NULL,
  content_hash       text NOT NULL,
  status             text NOT NULL DEFAULT 'received'
                       CHECK (status IN ('received', 'normalizing', 'normalized', 'awaiting_approval', 'committing', 'committed', 'failed')),
  row_count          int,
  auto_count         int,
  review_count       int,
  error              text,
  commit_task_id     uuid REFERENCES public.agent_tasks(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_catalog_feed_batches_status
  ON public.catalog_feed_batches (status, created_at);
CREATE INDEX IF NOT EXISTS idx_catalog_feed_batches_vendor
  ON public.catalog_feed_batches (vendor_id, created_at DESC);

COMMENT ON TABLE public.catalog_feed_batches IS
  'One row per uploaded/synced vendor catalog feed (00306). content_hash + UNIQUE(vendor_id, content_hash) makes a byte-identical re-upload a no-op. Normalized by supabase/functions/catalog-normalizer; committed via apps/admin-portal .../api/admin/catalog/commit-batch after the batch commit_task_id agent_tasks row is approved.';

CREATE OR REPLACE FUNCTION public.catalog_feed_batches_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_catalog_feed_batches_updated_at ON public.catalog_feed_batches;
CREATE TRIGGER trg_catalog_feed_batches_updated_at
  BEFORE UPDATE ON public.catalog_feed_batches
  FOR EACH ROW EXECUTE FUNCTION public.catalog_feed_batches_set_updated_at();

-- ─── 4. catalog_feed_items ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.catalog_feed_items (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id             uuid NOT NULL REFERENCES public.catalog_feed_batches(id) ON DELETE CASCADE,
  row_index            int NOT NULL,
  source_row_hash      text NOT NULL,
  raw                  jsonb NOT NULL,
  normalized           jsonb,
  confidence           numeric(3,2) CHECK (confidence IS NULL OR (confidence BETWEEN 0 AND 1)),
  field_confidence     jsonb,
  match_product_id     uuid REFERENCES public.products(id),
  action               text CHECK (action IS NULL OR action IN ('create', 'update', 'skip')),
  diff                 jsonb,
  status               text NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'normalized', 'auto_committed', 'review_queued', 'approved_committed', 'rejected', 'skipped', 'error')),
  committed_product_id uuid REFERENCES public.products(id),
  error                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, source_row_hash)
);

CREATE INDEX IF NOT EXISTS idx_catalog_feed_items_batch
  ON public.catalog_feed_items (batch_id, row_index);
CREATE INDEX IF NOT EXISTS idx_catalog_feed_items_status
  ON public.catalog_feed_items (status) WHERE status IN ('normalized', 'review_queued');
CREATE INDEX IF NOT EXISTS idx_catalog_feed_items_match
  ON public.catalog_feed_items (match_product_id) WHERE match_product_id IS NOT NULL;

COMMENT ON TABLE public.catalog_feed_items IS
  'One row per source row in a catalog_feed_batches file (00306). normalized/confidence/field_confidence are written by the deterministic parsers + inference classification in supabase/functions/catalog-normalizer/normalize-row.ts. Rows with confidence >= 0.9 are auto-commit eligible; below that they route to a catalog_review agent_tasks row (entity_type=''catalog_feed_item'').';

-- ─── 5. RLS — admin-domain SELECT; writes are service-role only ─────────────
ALTER TABLE public.catalog_feed_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_feed_items   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalog_feed_batches_select_admin ON public.catalog_feed_batches;
CREATE POLICY catalog_feed_batches_select_admin
  ON public.catalog_feed_batches FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
        AND r.domain = 'admin'
    )
  );

DROP POLICY IF EXISTS catalog_feed_items_select_admin ON public.catalog_feed_items;
CREATE POLICY catalog_feed_items_select_admin
  ON public.catalog_feed_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
        AND r.domain = 'admin'
    )
  );

-- No INSERT/UPDATE/DELETE policy: the edge function and admin-portal API
-- routes both write with the service-role client, which bypasses RLS.
GRANT SELECT ON public.catalog_feed_batches TO authenticated;
GRANT SELECT ON public.catalog_feed_items   TO authenticated;

-- ─── 6. Storage bucket — catalog-feeds (private) ────────────────────────────
-- Files land at {vendor_id}/{batch_id}.{ext}. Both the upload route and the
-- normalizer use the service-role client (bypasses storage RLS), so these
-- policies are belt-and-braces for any future browser-direct admin access,
-- matching the feedback-screenshots precedent (00256).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'catalog-feeds',
  'catalog-feeds',
  false,
  26214400,  -- 25 MB per feed file
  ARRAY['text/csv', 'application/json', 'application/vnd.ms-excel', 'text/plain']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Admin domain reads catalog feeds" ON storage.objects;
CREATE POLICY "Admin domain reads catalog feeds"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'catalog-feeds'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
        AND r.domain = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admin domain uploads catalog feeds" ON storage.objects;
CREATE POLICY "Admin domain uploads catalog feeds"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'catalog-feeds'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
        AND r.domain = 'admin'
    )
  );
