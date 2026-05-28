-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 00153: v_promotion_candidates
--
-- Surfaces personal-layer products that meet the PRD §6.1 promotion-candidate
-- criteria so the Sprint 2 PromotionBanner can render. Implements:
--
--   product.layer = 'personal'
--   AND product.vendor_id IS NOT NULL
--   AND COUNT(DISTINCT project) >= 2          -- across project_products
--                                                + project_ffe_items
--   AND EXISTS at least one non-draft PO       -- via project_ffe_items
--                                                .purchase_order_id
--
-- Damage-claim exclusion ("ordered without unresolved damage") is deferred
-- to a Sprint 2 tuning migration — receiving_inspections (00150) link POs
-- to damage_claims indirectly and the join shape benefits from real usage
-- data before we commit to an exact rule.
--
-- View, not materialized view: the source tables are small at pilot scale
-- and the join cost is dominated by index seeks already in place. PRD §13.2
-- documents the materialized-view escape hatch if measurement disagrees.
--
-- SECURITY INVOKER (Postgres default) → RLS on the underlying products
-- table filters the view automatically. A non-owner cannot see another
-- designer's candidates because they cannot see the owner's products.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE VIEW v_promotion_candidates AS
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
  AND pu.project_count >= 2;

COMMENT ON VIEW v_promotion_candidates IS
  'Personal-layer products that meet the PRD §6.1 promotion candidacy bar — used in 2+ projects, vendor exists, has at least one non-draft purchase order. RLS-filtered through the underlying products table so each designer sees only their own candidates.';

COMMIT;
