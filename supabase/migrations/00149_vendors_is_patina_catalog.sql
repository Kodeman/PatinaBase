-- ============================================================================
-- Migration 00149: vendors.is_patina_catalog
--
-- Adds a vendor-level flag indicating "Patina Catalog" vendors — vendors for
-- whom Patina is the merchant. POs against these vendors have payments handled
-- internally by Patina (no external vendor portal login, no deposit/balance
-- chasing for the designer). This flag drives:
--
--   1. The gold "Order via Patina" CTA on the vendor card in the By Vendor
--      view (apps/designer-portal/.../vendor-section-card.tsx), replacing the
--      standard "View orders" / "Order all" CTA for Catalog vendors.
--   2. Default behaviour for new POs created against this vendor — the
--      Order-via-Patina confirmation flow sets purchase_orders.is_patina_catalog
--      = true at creation time, which in turn drives the existing "Patina
--      handled" PaymentPill in the By Status view (PRD §7).
--
-- Implementation note: `purchase_orders.is_patina_catalog` (added in 00148) is
-- still the source of truth at the PO level — a single vendor could in theory
-- have a non-Catalog one-off PO. This vendor-level flag is purely a default /
-- detection hint for the UI.
-- ============================================================================

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS is_patina_catalog BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_vendors_is_patina_catalog
  ON vendors(is_patina_catalog)
  WHERE is_patina_catalog = true;

COMMENT ON COLUMN vendors.is_patina_catalog IS
  'When true, this vendor is part of the Patina Catalog — Patina acts as the merchant and handles deposit/balance internally. Drives the gold "Order via Patina" CTA on the By Vendor card and the default value of purchase_orders.is_patina_catalog for POs created against this vendor.';
