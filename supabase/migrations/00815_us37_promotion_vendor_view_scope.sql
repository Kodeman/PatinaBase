-- ═══════════════════════════════════════════════════════════════════════════
-- 00815 — Scope v_promotion_candidates and v_vendor_studio_stats to the caller
-- Finding: Astra SQ-1257 (inherited from 00153/00159). Both views run with
-- their owner's rights (no security_invoker), so they bypass RLS, and the
-- legacy grants left them readable by anon and every signed-in user: anyone
-- could list every designer's personal pieces and every studio's vendor
-- spend and damage counts. Their header comments promised RLS that never
-- applied.
--
-- Fix: keep owner rights and put the caller's entitlement in the view, then
-- take anon off both.
--   v_promotion_candidates  only the caller's own pieces (owner_user_id).
--   v_vendor_studio_stats   only studios where the caller holds an active,
--                           non-guest seat (is_active_org_member, 00556).
-- security_barrier keeps a caller's own filters from being evaluated ahead
-- of that predicate.
--
-- Why not security_invoker: both views report facts about a piece or a
-- studio, but invoker RLS bounds every input row by the caller's own sight
-- lines, so the facts silently shrink:
--   * project_products is readable only by the job's creator, so a piece on
--     a job the designer leads but did not create drops out of
--     project_count, and the piece can fall below the bar of two jobs.
--   * projects is readable by its lead, team, client and the lead's
--     co-members, not by studio seat, so a studio job whose lead holds no
--     seat any more drops out of projects_used_count, lifetime_value_cents
--     and unresolved_damage_count for the studio's own members.
-- The columns are unchanged, so the generated types are unchanged.
-- Rollback: re-run the 00153 and 00159 view bodies, then
--   GRANT ALL ON public.v_promotion_candidates, public.v_vendor_studio_stats
--   TO anon;
-- ═══════════════════════════════════════════════════════════════════════════

-- 00153 body, verbatim, plus the owner predicate.
CREATE OR REPLACE VIEW public.v_promotion_candidates
WITH (security_barrier = true) AS
WITH project_usage AS (
  -- Distinct projects each product appears in across both linkage paths.
  -- COUNT(DISTINCT) is safe even when a product is in both tables for the
  -- same project — UNION dedupes the (product_id, project_id) pair.
  SELECT product_id, COUNT(DISTINCT project_id) AS project_count
  FROM (
    SELECT product_id, project_id
      FROM project_products
     WHERE product_id IS NOT NULL
    UNION
    SELECT product_id, project_id
      FROM project_ffe_items
     WHERE product_id IS NOT NULL
  ) AS combined
  GROUP BY product_id
),
order_history AS (
  -- Has at least one FFE item linked to a non-draft, non-cancelled PO.
  -- "Successful order" per PRD §6.1 is loose for v1 — a PO that moved past
  -- draft and wasn't cancelled is treated as proof the vendor relationship
  -- transacted, which is what the promotion banner is really gating on.
  SELECT DISTINCT pf.product_id
    FROM project_ffe_items pf
    JOIN purchase_orders po ON po.id = pf.purchase_order_id
   WHERE pf.product_id IS NOT NULL
     AND po.status NOT IN ('draft', 'cancelled')
)
SELECT
  p.id                          AS product_id,
  p.name,
  p.owner_user_id,
  p.vendor_id,
  pu.project_count,
  TRUE                          AS has_order_history
FROM products p
JOIN project_usage  pu ON pu.product_id = p.id
JOIN order_history  oh ON oh.product_id = p.id
WHERE p.layer = 'personal'
  AND p.vendor_id IS NOT NULL
  AND pu.project_count >= 2
  AND p.owner_user_id = (SELECT auth.uid());

COMMENT ON VIEW public.v_promotion_candidates IS
  'Personal-layer products that meet the PRD §6.1 promotion candidacy bar — used in 2+ projects, vendor exists, has at least one non-draft purchase order. Owner-rights view (it does not inherit RLS): it returns only the caller''s own products (owner_user_id = auth.uid()), counted across every project (00815). anon has no access.';

-- 00159 body, verbatim, plus the seat predicate.
CREATE OR REPLACE VIEW public.v_vendor_studio_stats
WITH (security_barrier = true) AS
WITH studio_items AS (
  SELECT
    p.vendor_id,
    p.studio_id,
    COUNT(*)::INTEGER AS item_count,
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
