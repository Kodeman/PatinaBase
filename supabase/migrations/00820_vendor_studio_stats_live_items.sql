-- ═══════════════════════════════════════════════════════════════════════════
-- 00820 — Count only live studio catalog items in vendor statistics
-- Lineage: 00159 v_vendor_studio_stats → 00815 caller-scoped view
-- Reconciles: excludes soft-deleted and merged studio products from the
--             studio_item_count, matching live catalog readers.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.v_vendor_studio_stats
WITH (security_barrier = true) AS
WITH studio_items AS (
  SELECT
    p.vendor_id,
    p.studio_id,
    COUNT(*) FILTER (WHERE p.deleted_at IS NULL AND p.merged_into_id IS NULL)::INTEGER AS item_count,
    array_agg(p.id) AS product_ids
  FROM products p
  WHERE p.layer = 'studio'
    AND p.vendor_id IS NOT NULL
    AND p.studio_id IS NOT NULL
  GROUP BY p.vendor_id, p.studio_id
),
projects_used AS (
  -- Distinct projects (in the studio) that touch any of the vendor's
  -- studio-layer items. Combines project_products + project_ffe_items.
  SELECT
    p.vendor_id,
    p.studio_id,
    COUNT(DISTINCT proj.id)::INTEGER AS project_count
  FROM products p
  JOIN projects proj
    ON proj.studio_id = p.studio_id
   AND (
     EXISTS (
       SELECT 1 FROM project_products pp
        WHERE pp.product_id = p.id AND pp.project_id = proj.id
     )
     OR EXISTS (
       SELECT 1 FROM project_ffe_items pf
        WHERE pf.product_id = p.id AND pf.project_id = proj.id
     )
   )
  WHERE p.layer = 'studio'
    AND p.vendor_id IS NOT NULL
    AND p.studio_id IS NOT NULL
  GROUP BY p.vendor_id, p.studio_id
),
lifetime AS (
  SELECT
    po.vendor_id,
    proj.studio_id,
    SUM(po.total_cents)::BIGINT AS value_cents
  FROM purchase_orders po
  JOIN projects proj ON proj.id = po.project_id
  WHERE po.status <> 'cancelled'
    AND proj.studio_id IS NOT NULL
  GROUP BY po.vendor_id, proj.studio_id
),
damages AS (
  SELECT
    po.vendor_id,
    proj.studio_id,
    COUNT(*)::INTEGER AS unresolved_count
  FROM damage_claims dc
  JOIN receiving_inspections ri ON ri.id = dc.receiving_inspection_id
  JOIN purchase_orders po       ON po.id = ri.purchase_order_id
  JOIN projects proj            ON proj.id = po.project_id
  WHERE dc.state IN ('drafted', 'vendor_notified')
    AND proj.studio_id IS NOT NULL
  GROUP BY po.vendor_id, proj.studio_id
)
SELECT
  si.vendor_id,
  si.studio_id,
  si.item_count                                AS studio_item_count,
  COALESCE(pu.project_count, 0)                AS projects_used_count,
  COALESCE(lt.value_cents,   0)::BIGINT        AS lifetime_value_cents,
  COALESCE(dm.unresolved_count, 0)             AS unresolved_damage_count
FROM studio_items si
LEFT JOIN projects_used pu USING (vendor_id, studio_id)
LEFT JOIN lifetime      lt USING (vendor_id, studio_id)
LEFT JOIN damages       dm USING (vendor_id, studio_id)
WHERE public.is_active_org_member(si.studio_id);

COMMENT ON VIEW public.v_vendor_studio_stats IS
  'Per (vendor, studio) aggregate used by the NominateToCatalogModal VendorContextBlock (PRD §5.5). Owner-rights view (it does not inherit RLS): it returns only studios where the caller holds an active, non-guest seat (is_active_org_member), with each figure counted across all of that studio''s projects (00815). anon has no access.';

REVOKE ALL ON public.v_promotion_candidates,
              public.v_vendor_studio_stats
  FROM anon;
