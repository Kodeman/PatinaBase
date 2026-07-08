-- 00272_project_owned_boards.sql
-- Track S² · B8 (Schedule & Boards Wave 3): boards past signing.
--
-- A signed proposal's boards are frozen into project_boards (00180 — a read-only
-- JSONB snapshot, no editor anywhere). B8 lets the designer CONTINUE a board on
-- the activated project: a live, editable board that is owned by the PROJECT,
-- not a proposal. The record snapshot stays frozen; the new board is a fresh
-- working surface.
--
-- The editable board table is the SAME table (proposal_boards + its items) — the
-- editor, hooks, and shared render already speak it. We only add an ALTERNATE
-- OWNER, mirroring the 00252 precedent that gave project_documents a proposal_id
-- leg with a widened owner CHECK + parallel RLS legs. Here:
--
--   1. proposal_boards.project_id (nullable) — the project anchor.
--   2. proposal_id relaxed to NULL, and an exactly-one-of owner CHECK
--      (num_nonnulls(proposal_id, project_id) = 1). Every existing row has
--      proposal_id set / project_id NULL, so all pass; the CHECK only forbids a
--      future orphan or double-owner.
--   3. Designer-manage + client-read RLS legs for the PROJECT owner, on both
--      proposal_boards and proposal_board_items (the existing legs key on the
--      proposal owner and go false when proposal_id IS NULL, so they neither
--      cover nor conflict with project-owned rows).
--   4. A storage-write leg on the shared proposal-mood-boards bucket keyed on a
--      PROJECT id first path segment, so the editor can upload images on a
--      project-owned board ({projectId}/boards/{boardId}/…). The bucket is
--      public-read (00131), so no client read leg is needed.
--
-- clone_proposal is DELIBERATELY NOT redefined — see the proof at the bottom.
-- The actual "continue this board" copy RPC lands additively in 00273.
--
-- Additive + idempotent (IF EXISTS / IF NOT EXISTS / DROP-then-CREATE) so the
-- integration review can re-run it. Nothing existing is touched.

-- ─── 1. Alternate owner column + relaxed owner presence ──────────────────────

ALTER TABLE public.proposal_boards
  ADD COLUMN IF NOT EXISTS project_id UUID NULL REFERENCES public.projects(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.proposal_boards.project_id IS
  'B8: alternate owner. A live, editable board that belongs to an activated PROJECT (proposal_id NULL) — spun up from the frozen project_boards snapshot by continue_board_in_project (00273). Exactly one of proposal_id / project_id is non-null (chk_proposal_boards_owner).';

ALTER TABLE public.proposal_boards
  ALTER COLUMN proposal_id DROP NOT NULL;

-- Exactly one owner. Existing rows (proposal_id set, project_id NULL) all pass.
ALTER TABLE public.proposal_boards
  DROP CONSTRAINT IF EXISTS chk_proposal_boards_owner;
ALTER TABLE public.proposal_boards
  ADD CONSTRAINT chk_proposal_boards_owner
  CHECK (num_nonnulls(proposal_id, project_id) = 1);

CREATE INDEX IF NOT EXISTS idx_proposal_boards_project
  ON public.proposal_boards(project_id)
  WHERE project_id IS NOT NULL;

-- ─── 2. RLS legs — proposal_boards (project owner) ───────────────────────────
-- Additive. The existing "Designers manage their proposal boards" /
-- "Clients can view non-draft proposal boards" legs test proposal_id and go
-- false for project-owned rows, so these grant the ONLY access to those rows.

DROP POLICY IF EXISTS "Designers manage their project boards" ON public.proposal_boards;
CREATE POLICY "Designers manage their project boards"
  ON public.proposal_boards FOR ALL
  USING (
    project_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = proposal_boards.project_id
        AND p.designer_id = auth.uid()
    )
  )
  WITH CHECK (
    project_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = proposal_boards.project_id
        AND p.designer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Clients view their project boards" ON public.proposal_boards;
CREATE POLICY "Clients view their project boards"
  ON public.proposal_boards FOR SELECT
  USING (
    project_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = proposal_boards.project_id
        AND p.client_id = auth.uid()
    )
  );

-- ─── 3. RLS legs — proposal_board_items (project owner) ──────────────────────
-- The existing item legs JOIN proposals ON proposals.id = pb.proposal_id, which
-- yields nothing when pb.proposal_id IS NULL. These add the project-owner path.

DROP POLICY IF EXISTS "Designers manage items on their project boards" ON public.proposal_board_items;
CREATE POLICY "Designers manage items on their project boards"
  ON public.proposal_board_items FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.proposal_boards pb
      JOIN public.projects p ON p.id = pb.project_id
      WHERE pb.id = proposal_board_items.board_id
        AND pb.project_id IS NOT NULL
        AND p.designer_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.proposal_boards pb
      JOIN public.projects p ON p.id = pb.project_id
      WHERE pb.id = proposal_board_items.board_id
        AND pb.project_id IS NOT NULL
        AND p.designer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Clients view items on their project boards" ON public.proposal_board_items;
CREATE POLICY "Clients view items on their project boards"
  ON public.proposal_board_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.proposal_boards pb
      JOIN public.projects p ON p.id = pb.project_id
      WHERE pb.id = proposal_board_items.board_id
        AND pb.project_id IS NOT NULL
        AND p.client_id = auth.uid()
    )
  );

-- ─── 4. Storage: project-id-keyed write leg on proposal-mood-boards ──────────
-- Mirrors 00131's designer-write policies (public.proposals leg) but keyed on a
-- PROJECT the caller designs. First path segment = projectId for project-owned
-- board uploads ({projectId}/boards/{boardId}/…). Reads stay public (00131
-- "Proposal mood boards are publicly readable"). A UUID lives in exactly one of
-- the proposals / projects id spaces, so this never collides with the 00131 leg.

DROP POLICY IF EXISTS "Designers can upload project board images" ON storage.objects;
CREATE POLICY "Designers can upload project board images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'proposal-mood-boards'
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND p.designer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Designers can replace project board images" ON storage.objects;
CREATE POLICY "Designers can replace project board images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'proposal-mood-boards'
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND p.designer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Designers can delete project board images" ON storage.objects;
CREATE POLICY "Designers can delete project board images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'proposal-mood-boards'
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND p.designer_id = auth.uid()
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- clone_proposal — NOT redefined (proof)
-- ═══════════════════════════════════════════════════════════════════════════
-- The TRUE latest clone_proposal body is 00269 (00176 → 00260 boards carry →
-- 00264 sections/status → 00269 custom_fields). It copies proposal-owned boards
-- with exactly two board-touching statements, BOTH filtered on the proposal
-- owner:
--
--   FOR v_board IN
--     SELECT * FROM proposal_boards WHERE proposal_id = p_source_id ...
--
--   INSERT INTO proposal_board_items (...)
--   SELECT ... FROM proposal_board_items bi
--   JOIN proposal_boards pb ON pb.id = bi.board_id
--   WHERE pb.proposal_id = p_source_id AND v_board_map ? bi.board_id::text;
--
-- A project-owned board has proposal_id IS NULL, so `proposal_id = p_source_id`
-- and `pb.proposal_id = p_source_id` evaluate to NULL (never TRUE) for those
-- rows — they are ALREADY excluded from both the header loop and the items copy.
-- The new-board INSERT lists explicit columns and never sets project_id, so a
-- clone always writes proposal_id = v_new_id / project_id NULL → satisfies
-- chk_proposal_boards_owner. Therefore a revision/duplicate correctly clones
-- ONLY the proposal's own boards and never the project-owned ones, with no
-- change to the function. No redefinition (and thus no byte-diff) is required.
