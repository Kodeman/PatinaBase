-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: paint_colors catalog + palette_swatches FK
-- Description: Reference table of professional paint colors across major
--              brands (Sherwin-Williams, Benjamin Moore, Farrow & Ball,
--              Pantone TPG). Generated tsvector for full-text search.
--
--              Public SELECT policy — paint colors are a reference catalog
--              and not user-private. Writes are restricted to no one (the
--              table is seeded by the dev seed file at
--              supabase/seed/paint_colors_seed.sql; production rows would
--              come from an admin/import flow that bypasses RLS).
--
--              Also closes the palette_swatches.paint_color_id FK loop
--              that was left as a bare UUID column in 00131.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE paint_colors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand TEXT NOT NULL CHECK (brand IN ('sherwin_williams','benjamin_moore','farrow_ball','pantone_tpg')),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  hex TEXT NOT NULL CHECK (hex ~ '^#[0-9A-Fa-f]{6}$'),
  family TEXT NULL,
  lrv NUMERIC(5,2) NULL,
  search_vector tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('simple', coalesce(name,'')), 'A') ||
      setweight(to_tsvector('simple', coalesce(code,'')), 'A') ||
      setweight(to_tsvector('simple', coalesce(brand::text,'')), 'B')
    ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(brand, code)
);

CREATE INDEX idx_paint_colors_search ON paint_colors USING GIN(search_vector);
CREATE INDEX idx_paint_colors_brand_family ON paint_colors(brand, family);

-- Close the FK loop from 00131.
ALTER TABLE palette_swatches
  ADD CONSTRAINT palette_swatches_paint_color_fk
    FOREIGN KEY (paint_color_id) REFERENCES paint_colors(id) ON DELETE SET NULL;

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE paint_colors ENABLE ROW LEVEL SECURITY;

-- Public reference catalog: anyone (including anon, used by paint pickers)
-- can SELECT. No INSERT/UPDATE/DELETE policies — writes require service role.
CREATE POLICY paint_colors_select_all ON paint_colors FOR SELECT USING (true);
