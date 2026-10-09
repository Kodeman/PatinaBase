-- ═══════════════════════════════════════════════════════════════════════════
-- 00761 · Pieces: room finishes integrity on project_palettes
-- (US-21 T-58a, SQ-694 — follow-up to the T-58 W6 review, SQ-664 F7/F8)
--
-- F7. A project_palettes row with scope_room_id set must name a room of its
--     own project. The 00140/00316 studio WITH CHECK only tests project_id,
--     so a studio could insert a finishes row naming another project's room
--     (an integrity gap, not a leak — nothing reads it back cross-tenant). A
--     CHECK constraint can't run the cross-table subquery this needs, so this
--     is a BEFORE INSERT OR UPDATE trigger raising 23514 (check_violation).
--     The activation path (_activate_proposal_as_project_impl, base 00606)
--     already remaps scope_room_id through v_scope_room_map to a room of the
--     *new* project before the INSERT, so it still passes.
--
-- F8. Hard-deleting a project_rooms row left its room-scoped project_palettes
--     row behind with scope_room_id set to NULL (FK ON DELETE SET NULL),
--     turning it into an unseen project-wide palette instead of removing it.
--     Chosen fix: change the FK to ON DELETE CASCADE. A BEFORE DELETE trigger
--     was the other option, but the FK edit is the smaller change and leaves
--     00760's plain unique index (project_palettes_one_per_room) and its
--     "Inherit project access for palettes" SELECT policy untouched — neither
--     names the FK's delete action. No grant, no type, and no other FK on
--     project_palettes changes.
--
-- Lineage: project_palettes + scope_room_id FK (00140:16-24); unique index +
-- client-read policy (00760); activation room remap (00606 body of
-- _activate_proposal_as_project_impl, carried since 00331/00167).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── F7. scope_room_id must name a room of the same project ─────────────────
CREATE OR REPLACE FUNCTION public.project_palettes_room_same_project()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.scope_room_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.project_rooms r
    WHERE r.id = NEW.scope_room_id AND r.project_id = NEW.project_id
  ) THEN
    RAISE EXCEPTION 'project_palettes: scope_room_id % does not belong to project %',
      NEW.scope_room_id, NEW.project_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_palettes_room_same_project ON public.project_palettes;
CREATE TRIGGER project_palettes_room_same_project
  BEFORE INSERT OR UPDATE OF scope_room_id, project_id ON public.project_palettes
  FOR EACH ROW
  EXECUTE FUNCTION public.project_palettes_room_same_project();

-- ── F8. A deleted room takes its finishes with it ───────────────────────────
ALTER TABLE public.project_palettes
  DROP CONSTRAINT IF EXISTS project_palettes_scope_room_id_fkey;
ALTER TABLE public.project_palettes
  ADD CONSTRAINT project_palettes_scope_room_id_fkey
  FOREIGN KEY (scope_room_id) REFERENCES public.project_rooms(id) ON DELETE CASCADE;

COMMENT ON TRIGGER project_palettes_room_same_project ON public.project_palettes IS
  'F7 (00761): scope_room_id must name a room of the same project_id, raises 23514.';
