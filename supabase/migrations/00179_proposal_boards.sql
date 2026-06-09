-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: proposal_boards + proposal_board_items + project_boards
-- Description: Mood-board foundations (Wave 1). A proposal can have one or
--              more freeform boards (e.g. "Whole Home" + per-room boards),
--              each composed of positioned items (products, captures,
--              images, palettes, notes, room scans).
--
--              `project_boards` is the post-activation snapshot table,
--              mirroring the project_palettes JSONB-embed precedent (00140):
--              items are denormalized into a JSONB array since the
--              activated-project use case is read-mostly. The activation
--              RPC is NOT modified here — board carry-over into
--              activate_proposal_as_project() lands in a later wave.
--
--              Storage: NO new bucket. Board image uploads reuse the
--              existing `proposal-mood-boards` bucket (created in 00131,
--              public-read, designer-write keyed on the first path segment
--              being the proposal id). Upload path convention for board
--              images:
--
--                {proposalId}/boards/{boardId}/{uuid}.{ext}
--
--              The 00131 storage policies already authorize this path shape
--              because (storage.foldername(name))[1] = proposalId.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── proposal_boards ─────────────────────────────────────────────────────────

CREATE TABLE proposal_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  scope_room_id UUID NULL REFERENCES proposal_scope_rooms(id) ON DELETE SET NULL,
  cover_image_url TEXT NULL,
  canvas_width INTEGER NOT NULL DEFAULT 1200,
  canvas_height INTEGER NOT NULL DEFAULT 800,
  background_color TEXT NOT NULL DEFAULT '#FAF8F5',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_proposal_boards_proposal ON proposal_boards(proposal_id);

CREATE TRIGGER trg_proposal_boards_updated_at
  BEFORE UPDATE ON proposal_boards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── proposal_board_items ────────────────────────────────────────────────────

CREATE TABLE proposal_board_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES proposal_boards(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('product','capture','image','palette','note','room_scan')),
  x NUMERIC NOT NULL DEFAULT 0,
  y NUMERIC NOT NULL DEFAULT 0,
  width NUMERIC NOT NULL DEFAULT 240,
  height NUMERIC NULL,
  z_index INTEGER NOT NULL DEFAULT 0,
  rotation NUMERIC NOT NULL DEFAULT 0,
  locked BOOLEAN NOT NULL DEFAULT false,
  product_id UUID NULL REFERENCES products(id) ON DELETE SET NULL,
  capture_id UUID NULL REFERENCES proposal_captures(id) ON DELETE SET NULL,
  palette_id UUID NULL REFERENCES proposal_palettes(id) ON DELETE SET NULL,
  image_url TEXT NULL,
  content TEXT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_proposal_board_items_board ON proposal_board_items(board_id);

CREATE TRIGGER trg_proposal_board_items_updated_at
  BEFORE UPDATE ON proposal_board_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── project_boards (post-activation snapshot, items embedded as JSONB) ──────

CREATE TABLE project_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- Soft back-reference to the source proposal board (no FK so the snapshot
  -- survives proposal deletion), mirroring project_palettes.source_palette_id
  -- intent without the SET NULL churn.
  source_board_id UUID NULL,
  name TEXT NOT NULL,
  project_room_id UUID NULL REFERENCES project_rooms(id) ON DELETE SET NULL,
  cover_image_url TEXT NULL,
  canvas_width INTEGER NOT NULL DEFAULT 1200,
  canvas_height INTEGER NOT NULL DEFAULT 800,
  background_color TEXT NOT NULL DEFAULT '#FAF8F5',
  -- Items denormalized as a JSONB array of
  --   {type, x, y, width, height, z_index, rotation, locked,
  --    product_id, image_url, content, data}
  -- mirroring the project_palettes.swatches embed (00140).
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_project_boards_project ON project_boards(project_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE proposal_boards      ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_board_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_boards       ENABLE ROW LEVEL SECURITY;

-- proposal_boards: designer of the parent proposal owns the row.
CREATE POLICY "Designers manage their proposal boards"
  ON proposal_boards FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = proposal_boards.proposal_id
        AND p.designer_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = proposal_boards.proposal_id
        AND p.designer_id = auth.uid()
    )
  );

-- Clients on a non-draft proposal can see (read-only) the boards.
CREATE POLICY "Clients can view non-draft proposal boards"
  ON proposal_boards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = proposal_boards.proposal_id
        AND p.client_id = auth.uid()
        AND p.status != 'draft'
    )
  );

-- proposal_board_items: same shape via the parent proposal_boards.
CREATE POLICY "Designers manage items on their boards"
  ON proposal_board_items FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM proposal_boards pb
      JOIN proposals p ON p.id = pb.proposal_id
      WHERE pb.id = proposal_board_items.board_id
        AND p.designer_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM proposal_boards pb
      JOIN proposals p ON p.id = pb.proposal_id
      WHERE pb.id = proposal_board_items.board_id
        AND p.designer_id = auth.uid()
    )
  );

CREATE POLICY "Clients can view items on non-draft proposal boards"
  ON proposal_board_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM proposal_boards pb
      JOIN proposals p ON p.id = pb.proposal_id
      WHERE pb.id = proposal_board_items.board_id
        AND p.client_id = auth.uid()
        AND p.status != 'draft'
    )
  );

-- project_boards: mirror the project_palettes policy (00140) — designer,
-- client, or active team member of the parent project. The projects-table
-- RLS itself was scoped in 00168 to the same participant set, so this
-- EXISTS resolves consistently for every role that can see the project.
CREATE POLICY "Inherit project access for boards"
  ON project_boards FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_boards.project_id
        AND (
          p.designer_id = auth.uid()
          OR p.client_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM project_team_members ptm
            WHERE ptm.project_id = p.id
              AND ptm.user_id = auth.uid()
              AND ptm.removed_at IS NULL
          )
        )
    )
  );
