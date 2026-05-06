-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: proposal_palettes + palette_swatches
-- Description: Color palette tables for the Proposal Builder. A proposal
--              can have one or more palettes (e.g. "Whole Home" + per-room
--              palettes), each with a set of swatches. Swatches optionally
--              link to a paint_colors catalog entry (added in 00132) for
--              brand+code provenance.
--
--              `is_primary` is enforced unique-per-proposal via a partial
--              unique index. `paint_color_id` is added here as a nullable
--              UUID; the FK to paint_colors is added in 00132 once the
--              catalog table exists.
--
--              Storage: a `proposal-mood-boards` bucket is created so
--              designers can upload an inspiration image and run the
--              ImagePaletteExtractor against it.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── proposal_palettes ───────────────────────────────────────────────────────

CREATE TABLE proposal_palettes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  scope_room_id UUID NULL REFERENCES proposal_scope_rooms(id) ON DELETE SET NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  source_image_url TEXT NULL,
  notes TEXT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_proposal_palettes_proposal ON proposal_palettes(proposal_id);

-- Exactly one is_primary palette per proposal.
CREATE UNIQUE INDEX idx_proposal_palettes_one_primary
  ON proposal_palettes(proposal_id) WHERE is_primary;

CREATE TRIGGER trg_proposal_palettes_updated_at
  BEFORE UPDATE ON proposal_palettes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── palette_swatches ────────────────────────────────────────────────────────

CREATE TABLE palette_swatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  palette_id UUID NOT NULL REFERENCES proposal_palettes(id) ON DELETE CASCADE,
  hex TEXT NOT NULL CHECK (hex ~ '^#[0-9A-Fa-f]{6}$'),
  name TEXT NULL,
  role TEXT NULL CHECK (role IN ('foundation','wall','accent','trim','ceiling','floor','metal','textile','other')),
  paint_color_id UUID NULL,  -- FK declared in 00132 once paint_colors exists
  brand TEXT NULL,
  brand_code TEXT NULL,
  source_pixel JSONB NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_palette_swatches_palette ON palette_swatches(palette_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE proposal_palettes ENABLE ROW LEVEL SECURITY;
ALTER TABLE palette_swatches  ENABLE ROW LEVEL SECURITY;

-- proposal_palettes: designer of the parent proposal owns the row.
CREATE POLICY "Designers manage their proposal palettes"
  ON proposal_palettes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = proposal_palettes.proposal_id
        AND p.designer_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = proposal_palettes.proposal_id
        AND p.designer_id = auth.uid()
    )
  );

-- Clients on a non-draft proposal can see (read-only) the palettes.
CREATE POLICY "Clients can view non-draft proposal palettes"
  ON proposal_palettes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = proposal_palettes.proposal_id
        AND p.client_id = auth.uid()
        AND p.status != 'draft'
    )
  );

-- palette_swatches: same shape via the parent proposal_palettes.
CREATE POLICY "Designers manage swatches on their palettes"
  ON palette_swatches FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM proposal_palettes pp
      JOIN proposals p ON p.id = pp.proposal_id
      WHERE pp.id = palette_swatches.palette_id
        AND p.designer_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM proposal_palettes pp
      JOIN proposals p ON p.id = pp.proposal_id
      WHERE pp.id = palette_swatches.palette_id
        AND p.designer_id = auth.uid()
    )
  );

CREATE POLICY "Clients can view swatches on non-draft proposal palettes"
  ON palette_swatches FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM proposal_palettes pp
      JOIN proposals p ON p.id = pp.proposal_id
      WHERE pp.id = palette_swatches.palette_id
        AND p.client_id = auth.uid()
        AND p.status != 'draft'
    )
  );

-- ─── Storage bucket: proposal-mood-boards ────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'proposal-mood-boards',
  'proposal-mood-boards',
  true,
  20971520, -- 20MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Proposal mood boards are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'proposal-mood-boards');

CREATE POLICY "Designers can upload proposal mood boards"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'proposal-mood-boards'
    AND EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND p.designer_id = auth.uid()
    )
  );

CREATE POLICY "Designers can replace their proposal mood boards"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'proposal-mood-boards'
    AND EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND p.designer_id = auth.uid()
    )
  );

CREATE POLICY "Designers can delete their proposal mood boards"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'proposal-mood-boards'
    AND EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND p.designer_id = auth.uid()
    )
  );
