-- ═══════════════════════════════════════════════════════════════════════════
-- 00317 — projects.studio_id maintenance (trigger + backfill)
--
-- projects.studio_id (00084) is set on the manual create path (projects/new)
-- and by activate_project_v2 (00086), but activate_proposal_as_project (head
-- 00279) does NOT set it → proposal-activated projects have NULL studio_id.
-- Close every path with a BEFORE INSERT trigger defaulting to the lead
-- designer's primary studio, then backfill existing NULL rows.
--
-- studio_id is NOT an RLS gate in this design (RLS uses is_studio_comember on
-- designer_id) — it feeds brand resolution (00320) and the per-studio invoice
-- counter (00318). Decoupling RLS from studio_id completeness keeps visibility
-- correct even where a legacy path left studio_id NULL.
--
-- MUST run before 00318 (the invoice studio_id backfill reads projects.studio_id).
-- Adds no GRANT/REVOKE.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_project_studio_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.studio_id IS NULL AND NEW.designer_id IS NOT NULL THEN
    NEW.studio_id := public._primary_studio_for(NEW.designer_id);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_project_studio_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_project_studio_id() TO authenticated, service_role;

DROP TRIGGER IF EXISTS set_project_studio_id ON public.projects;
CREATE TRIGGER set_project_studio_id
  BEFORE INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_project_studio_id();

-- Backfill pre-existing rows (proposal-activated projects, mostly).
UPDATE public.projects
SET studio_id = public._primary_studio_for(designer_id)
WHERE studio_id IS NULL AND designer_id IS NOT NULL;

COMMENT ON FUNCTION public.set_project_studio_id() IS
  'BEFORE INSERT on projects: default studio_id to the lead designer''s primary studio when unset. Path-agnostic backstop (activate_proposal_as_project omits it).';
