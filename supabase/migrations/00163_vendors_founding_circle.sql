-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 00163: vendors.founding_circle flag (PROD-13)
--
-- Identifies "Founding Circle" makers for the Library → Founding Circle tab.
-- The column was referenced by the UI but never existed; add it (default false)
-- and seed a small curated set in dev so the tab has data to render.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS founding_circle BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.vendors.founding_circle IS
  'PROD-13: true for Founding Circle makers surfaced in the Library Founding Circle tab.';

-- Partial index — the tab only ever queries the (small) true subset.
CREATE INDEX IF NOT EXISTS idx_vendors_founding_circle
  ON public.vendors(founding_circle) WHERE founding_circle;

-- NOTE: which vendors are Founding Circle is curated business data, not schema,
-- so it is intentionally NOT seeded here (a migration runs in prod). Flag
-- vendors via admin/ops or dev seed. The Library Founding Circle tab renders an
-- honest empty state until vendors are flagged + linked to catalog products.
