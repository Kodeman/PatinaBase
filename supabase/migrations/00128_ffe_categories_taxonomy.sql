-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: FF&E categories taxonomy + legacy notes migration
-- Description: Replaces ad-hoc FF&E category strings (and the
--              [allowance]/[tbd] markers shoved into proposal_items.notes)
--              with a proper taxonomy table.
--
--              Three scopes share one table:
--                - System rows  : is_system = true,  designer_id IS NULL,
--                                 proposal_id IS NULL
--                - Designer rows: designer_id  IS NOT NULL,
--                                 proposal_id IS NULL
--                - Proposal rows: proposal_id  IS NOT NULL
--
--              `migrate_legacy_ffe_notes()` is a SECURITY DEFINER RPC that
--              walks proposal_items.notes for legacy markers and rewrites
--              them onto the proper item_type / budget_min_cents /
--              budget_max_cents columns. Idempotent: a second call is a
--              no-op because the markers are stripped on the first pass.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ffe_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL,
  label TEXT NOT NULL,
  parent_id UUID NULL REFERENCES ffe_categories(id) ON DELETE SET NULL,
  is_system BOOLEAN NOT NULL DEFAULT false,
  designer_id UUID NULL REFERENCES profiles(id) ON DELETE CASCADE,
  proposal_id UUID NULL REFERENCES proposals(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  icon TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Exactly one scope per row.
  CONSTRAINT ffe_categories_scope_chk CHECK (
    (is_system = true  AND designer_id IS NULL AND proposal_id IS NULL)
    OR (is_system = false AND designer_id IS NOT NULL AND proposal_id IS NULL)
    OR (is_system = false AND proposal_id IS NOT NULL)
  )
);

-- Unique slug per scope.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ffe_categories_designer_slug
  ON ffe_categories(designer_id, slug)
  WHERE designer_id IS NOT NULL AND proposal_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ffe_categories_proposal_slug
  ON ffe_categories(proposal_id, slug)
  WHERE proposal_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ffe_categories_system_slug
  ON ffe_categories(slug)
  WHERE is_system = true;

CREATE INDEX IF NOT EXISTS idx_ffe_categories_designer
  ON ffe_categories(designer_id) WHERE designer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ffe_categories_proposal
  ON ffe_categories(proposal_id) WHERE proposal_id IS NOT NULL;

-- updated_at trigger (uses the existing helper function from older migrations)
CREATE TRIGGER trg_ffe_categories_updated_at
  BEFORE UPDATE ON ffe_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE ffe_categories ENABLE ROW LEVEL SECURITY;

-- SELECT: system rows are visible to all authed users; private rows only
-- to their owner (designer or proposal owner).
CREATE POLICY "ffe_categories_select"
  ON ffe_categories FOR SELECT
  USING (
    is_system = true
    OR designer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = ffe_categories.proposal_id
        AND p.designer_id = auth.uid()
    )
  );

-- INSERT: system rows can never be created via RLS-bound clients.
-- Designer- or proposal-scoped rows must match the caller.
CREATE POLICY "ffe_categories_insert"
  ON ffe_categories FOR INSERT
  WITH CHECK (
    is_system = false
    AND (
      (designer_id = auth.uid() AND proposal_id IS NULL)
      OR EXISTS (
        SELECT 1 FROM proposals p
        WHERE p.id = ffe_categories.proposal_id
          AND p.designer_id = auth.uid()
      )
    )
  );

-- UPDATE: never allow modifying a system row; otherwise must own the scope
-- both before and after the update.
CREATE POLICY "ffe_categories_update"
  ON ffe_categories FOR UPDATE
  USING (
    is_system = false
    AND (
      designer_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM proposals p
        WHERE p.id = ffe_categories.proposal_id
          AND p.designer_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    is_system = false
    AND (
      (designer_id = auth.uid() AND proposal_id IS NULL)
      OR EXISTS (
        SELECT 1 FROM proposals p
        WHERE p.id = ffe_categories.proposal_id
          AND p.designer_id = auth.uid()
      )
    )
  );

-- DELETE: same ownership rules; system rows are immutable through clients.
CREATE POLICY "ffe_categories_delete"
  ON ffe_categories FOR DELETE
  USING (
    is_system = false
    AND (
      designer_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM proposals p
        WHERE p.id = ffe_categories.proposal_id
          AND p.designer_id = auth.uid()
      )
    )
  );

-- ─── System taxonomy seed ───────────────────────────────────────────────────
-- Lucide icon names verified against lucide-react@0.544.0.
INSERT INTO ffe_categories (slug, label, is_system, sort_order, icon) VALUES
  ('seating',           'Seating',            true,  10, 'armchair'),
  ('tables',            'Tables',             true,  20, 'table'),
  ('lighting',          'Lighting',           true,  30, 'lamp'),
  ('storage',           'Storage',            true,  40, 'archive'),
  ('soft_goods',        'Soft Goods',         true,  50, 'layers'),
  ('window_treatments', 'Window Treatments',  true,  60, 'blinds'),
  ('rugs',              'Rugs',               true,  70, 'square-asterisk'),
  ('art',               'Art',                true,  80, 'image'),
  ('accessories',       'Accessories',        true,  90, 'gem'),
  ('outdoor',           'Outdoor',            true, 100, 'tree-pine'),
  ('hardware',          'Hardware',           true, 110, 'wrench'),
  ('plumbing_fixtures', 'Plumbing Fixtures',  true, 120, 'droplet'),
  ('appliances',        'Appliances',         true, 130, 'microwave')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- migrate_legacy_ffe_notes()
--
-- Walks proposal_items where notes still carry the legacy markers
-- "[allowance] range: $X-$Y" or "[tbd]" and rewrites onto the
-- structured columns. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION migrate_legacy_ffe_notes()
  RETURNS INTEGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_row RECORD;
  v_min_dollars NUMERIC;
  v_max_dollars NUMERIC;
  v_clean_notes TEXT;
  v_match TEXT[];
  v_total INTEGER := 0;
BEGIN
  -- Allowance rows. Tolerate "[allowance]" with or without the
  -- "range:" prefix and with or without surrounding whitespace.
  FOR v_row IN
    SELECT id, notes
      FROM proposal_items
     WHERE notes ILIKE '[allowance]%'
  LOOP
    -- Try the "range: $X-$Y" shape first.
    v_match := regexp_match(v_row.notes, '\$([0-9]+(?:\.[0-9]+)?)\s*-\s*\$?([0-9]+(?:\.[0-9]+)?)');
    IF v_match IS NOT NULL THEN
      v_min_dollars := v_match[1]::NUMERIC;
      v_max_dollars := v_match[2]::NUMERIC;
    ELSE
      v_min_dollars := NULL;
      v_max_dollars := NULL;
    END IF;

    -- Strip the marker + optional "range: $X-$Y" trailer.
    v_clean_notes := regexp_replace(v_row.notes, '^\s*\[allowance\]\s*(range:\s*)?\$?[0-9.]*\s*-?\s*\$?[0-9.]*\s*', '', 'i');
    v_clean_notes := NULLIF(btrim(v_clean_notes), '');

    UPDATE proposal_items
       SET item_type = 'allowance',
           budget_min_cents = CASE WHEN v_min_dollars IS NOT NULL
                                   THEN ROUND(v_min_dollars * 100)::INTEGER
                                   ELSE budget_min_cents END,
           budget_max_cents = CASE WHEN v_max_dollars IS NOT NULL
                                   THEN ROUND(v_max_dollars * 100)::INTEGER
                                   ELSE budget_max_cents END,
           notes = v_clean_notes
     WHERE id = v_row.id;

    v_total := v_total + 1;
  END LOOP;

  -- TBD rows.
  FOR v_row IN
    SELECT id, notes
      FROM proposal_items
     WHERE notes ILIKE '[tbd]%'
  LOOP
    v_clean_notes := regexp_replace(v_row.notes, '^\s*\[tbd\]\s*', '', 'i');
    v_clean_notes := NULLIF(btrim(v_clean_notes), '');

    UPDATE proposal_items
       SET item_type = 'tbd',
           notes = v_clean_notes
     WHERE id = v_row.id;

    v_total := v_total + 1;
  END LOOP;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION migrate_legacy_ffe_notes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION migrate_legacy_ffe_notes() TO service_role;

-- Run the cleanup once at deploy time. Subsequent calls are no-ops because
-- the markers are stripped on the first pass.
SELECT migrate_legacy_ffe_notes();
