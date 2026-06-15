-- ═══════════════════════════════════════════════════════════════════════════
-- 00212 — project_parties (Track 5 · Project Coordination, R46)
--
-- The coordination grain needs a notion of the OTHER courts on a project: the
-- GC, the vendors, a client-rep, an "other" stakeholder. The prototype demos
-- these as TRACKED courts the designer records moves on behalf of — they do NOT
-- log in for v1 (R46). A real login later is a flag flip (set profile_id), not a
-- migration: profile_id is NULLABLE and additive.
--
-- A party is the durable identity a coordination item's court points at
-- (00213.court_party_id) and a task's owner points at (00215.owner_party_id).
-- It optionally back-links a vendors row (vendor_id) so a vendor-court submittal
-- threads through the same vendor the PO already names, and optionally a profiles
-- row (profile_id) once that party has a real login.
--
-- RLS (mirrors the project-team posture of is_project_team_member, 00087):
--   · the project's designer (projects.designer_id = auth.uid()) MANAGES (ALL).
--   · any project team member reads (is_project_team_member).
--   · a party with a real login (profile_id = auth.uid()) reads its own
--     project's rows (so a future logged-in GC sees its court).
--
-- Additive only (D7): CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- Nothing existing is dropped or retyped. Lands FIRST in the Track-5 set so the
-- FKs in 00213 (court_party_id) and 00215 (owner_party_id) resolve.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.project_parties (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  party_kind    TEXT NOT NULL
                  CHECK (party_kind IN ('gc', 'vendor', 'client_rep', 'other')),
  display_name  TEXT NOT NULL,
  company_name  TEXT,
  email         TEXT,
  phone         TEXT,
  -- Soft back-links: a coordination party MAY be a known vendor or a real login.
  -- ON DELETE SET NULL — deleting the vendor/profile must not vaporize the party
  -- (its court history on items/tasks survives as a tracked, login-less court).
  vendor_id     UUID REFERENCES public.vendors(id)  ON DELETE SET NULL,
  profile_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.project_parties IS
  'Track 5 coordination courts (R46): GC / vendor / client_rep / other parties '
  'on a project. profile_id NULLABLE — v1 parties do NOT log in; the designer '
  'records their move via resolve_coordination_item. Setting profile_id later '
  'gives that party a real login (a flag flip, not a migration). vendor_id soft- '
  'links a known vendor; both back-links ON DELETE SET NULL so item/task court '
  'history survives.';

COMMENT ON COLUMN public.project_parties.profile_id IS
  'NULLABLE. NULL = a tracked, login-less court (the designer acts on its behalf, '
  'R46). Set to a real auth user later to grant that party portal access.';

CREATE INDEX IF NOT EXISTS idx_project_parties_project
  ON public.project_parties(project_id);

-- The party-self read path (00217) scans by profile_id; only logged-in parties
-- need it, so the index is partial.
CREATE INDEX IF NOT EXISTS idx_project_parties_profile
  ON public.project_parties(profile_id)
  WHERE profile_id IS NOT NULL;

-- updated_at touch (reuse the project-wide helper from 00014).
DROP TRIGGER IF EXISTS set_updated_at_project_parties ON public.project_parties;
CREATE TRIGGER set_updated_at_project_parties
  BEFORE UPDATE ON public.project_parties
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.project_parties ENABLE ROW LEVEL SECURITY;

-- Designer of the project MANAGES (select/insert/update/delete). Keyed on
-- projects.designer_id = auth.uid() (the same owner gate the rest of the
-- project-scoped tables use).
DROP POLICY IF EXISTS project_parties_designer_all ON public.project_parties;
CREATE POLICY project_parties_designer_all
  ON public.project_parties FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_parties.project_id
        AND p.designer_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_parties.project_id
        AND p.designer_id = auth.uid()
    )
  );

-- Any project team member READS (via the SECURITY DEFINER helper, 00087 — no
-- recursion). Covers co-designers / staff added to the project team.
DROP POLICY IF EXISTS project_parties_team_select ON public.project_parties;
CREATE POLICY project_parties_team_select
  ON public.project_parties FOR SELECT
  TO authenticated
  USING (public.is_project_team_member(project_id));

-- A party with a real login READS its OWN row (future logged-in GC / vendor /
-- client-rep). No write — acts funnel through the resolve RPC. The broader
-- "a logged-in party sees ALL co-courts on its project" read is granted
-- non-recursively in 00217 via the SECURITY DEFINER is_coordination_party()
-- helper; doing it here with a self-EXISTS on project_parties would recurse the
-- policy infinitely (42P17), which breaks every embed of project_parties.
DROP POLICY IF EXISTS project_parties_self_select ON public.project_parties;
CREATE POLICY project_parties_self_select
  ON public.project_parties FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_parties TO authenticated;
GRANT ALL ON public.project_parties TO service_role;
