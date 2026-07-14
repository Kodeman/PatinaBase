-- ═══════════════════════════════════════════════════════════════════════════
-- 00317 — projects.studio_id maintenance (trigger + backfill)
--
-- projects.studio_id (00084) is set on the manual create path (projects/new)
-- and by activate_project_v2 (00086), but activate_proposal_as_project (head
-- 00279) does NOT set it → proposal-activated projects have NULL studio_id.
-- Close every path with a BEFORE INSERT OR UPDATE OF studio_id trigger: when
-- studio_id is unset on INSERT, default it to the lead designer's primary
-- studio; when a value IS supplied by a user-context write, VALIDATE that the
-- lead designer belongs to that studio (else RAISE studio_id_not_designer_studio)
-- so a crafted write can't point a project at a foreign org — the anon brand
-- resolver (00320) would otherwise render that org's name/logo to clients.
-- Backfill existing NULL rows.
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
  IF NEW.studio_id IS NOT NULL THEN
    -- A user-context write (portal/RPC under an authenticated JWT) may only
    -- point a project at a studio the lead designer actually belongs to.
    -- Without this, a crafted insert/update could aim studio_id at ANY org and
    -- the anon brand resolver (00320) would render that foreign org's name/logo
    -- to clients. Service-role edge writes and migration/backfill contexts
    -- (auth.uid() NULL) bypass so replays and server paths keep working.
    IF (select auth.uid()) IS NOT NULL
       AND COALESCE(auth.jwt() ->> 'role', '') <> 'service_role'
       AND NOT EXISTS (
         SELECT 1 FROM organization_members om
         WHERE om.organization_id = NEW.studio_id
           AND om.user_id         = NEW.designer_id
           AND om.status          = 'active'
       ) THEN
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    END IF;
  ELSIF TG_OP = 'INSERT' AND NEW.designer_id IS NOT NULL THEN
    NEW.studio_id := public._primary_studio_for(NEW.designer_id);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_project_studio_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_project_studio_id() TO authenticated, service_role;

DROP TRIGGER IF EXISTS set_project_studio_id ON public.projects;
CREATE TRIGGER set_project_studio_id
  BEFORE INSERT OR UPDATE OF studio_id ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_project_studio_id();

-- Backfill pre-existing rows (proposal-activated projects, mostly).
UPDATE public.projects
SET studio_id = public._primary_studio_for(designer_id)
WHERE studio_id IS NULL AND designer_id IS NOT NULL;

COMMENT ON FUNCTION public.set_project_studio_id() IS
  'BEFORE INSERT OR UPDATE OF studio_id on projects: default studio_id to the lead designer''s primary studio when unset (INSERT), and validate that a user-supplied studio_id is one the lead designer belongs to (else studio_id_not_designer_studio). Service-role/migration contexts (auth.uid() NULL) bypass validation.';
