-- ═══════════════════════════════════════════════════════════════════════════
-- 00867 — margin_notes: a tenant-first guard (SQ-1846 F1/F2, SQ-1847)
--
-- F1. is_studio_comember(owner) (00556:51-76) is true when the caller shares
--     ANY active studio with that owner. A designer seated in studios A and B
--     therefore let a member of B alone read, insert, update and delete her
--     notes on A's jobs (margin_notes_studio_read 00316:309-330, the three
--     write policies 00584:678-692).
-- F2. margin_notes_designer_all (00196:51-54) is a permissive ALL keyed on the
--     note's author alone, so any signed-in user could insert a self-authored
--     note against a foreign job, and that studio then read it in its rail.
--
-- THE REPAIR is one RESTRICTIVE FOR ALL policy. Postgres ANDs a restrictive
-- policy with the OR of the permissive ones for every command, applying USING
-- to SELECT/DELETE and to the old row of an UPDATE, and WITH CHECK to INSERT
-- and to the new row of an UPDATE. The five permissive policies keep deciding
-- WHO inside a studio may act; this one decides WHICH STUDIO the row belongs
-- to. A permissive addition could not narrow anything. is_studio_comember is
-- deliberately left alone: dozens of other tables lean on it.
--
-- THE TENANT COMES FROM THE RECORD, NEVER FROM THE CALLER (00624:966-995):
--   project_id          → projects.studio_id
--   proposal_id         → proposals.studio_id (00813)
--   designer_client_id  → designer_clients.household_id
--                         → client_households.organization_id (00632)
-- chk_margin_notes_engagement is an OR (00224:100-102), so a row may carry
-- several anchors. Each one is validated; none authorizes the row alone:
--   · every supplied anchor must resolve to a row;
--   · anchors recording two different studios are refused outright;
--   · a recorded studio admits only a caller holding an active, non-guest seat
--     in it, and only while that studio is active, except for the caller's own
--     note or the caller's own job (00556: suspension withdraws the shared
--     workspace, not a member's own rows);
--   · if ANY anchor records no studio, the row is admitted only to a caller who
--     owns EVERY anchor (projects/proposals/designer_clients.designer_id), on
--     top of the seat a recorded studio needs. No co-member, and no link
--     vouches for a studio-less anchor (SQ-1858 F3): proposals.project_id and
--     proposals.designer_client_id are written by a co-member's direct draft
--     INSERT (00401:515-517, 00387:633-674), so they prove nothing about who
--     owns the engagement. Owner pointers do not move under a co-member:
--     proposals (guard_proposal_authority), projects (00563 reassignment only).
-- The guard decides only WHICH STUDIO (or, studio-less, WHOSE); USING and
-- WITH CHECK are the same test, so an owner keeps every verb on a coauthored
-- legacy note without rewriting its author. Who may write inside the studio
-- stays with the five permissive policies.
--
-- THE DISCOVERY TENANT POINTER IS GUARDED HERE TOO (SQ-1858 F4). A
-- relationship's studio is its household's organization, but
-- designer_clients.household_id was writable by any co-member of the
-- relationship's designer (00316:39-42 designer_clients_studio_rw, 00555
-- designer standing), so a member of B alone could re-point A's relationship
-- at a B household and then write Discovery notes "in B". client_households
-- already holds ITS organization to both images (00632:287-299,
-- is_active_studio_member on USING and WITH CHECK); the pointer now gets the
-- same rule from guard_designer_client_household (BEFORE UPDATE OF
-- household_id): a signed-in caller must hold an active, non-guest seat in the
-- old household's organization (if any) and in the new one's (if any).
-- Writer trace for designer_clients.household_id (main ee9c450a5):
--   · useCreateClientHousehold (packages/supabase/src/hooks/use-households.ts
--     :543-551), the household band's "Open a household": a direct
--     authenticated UPDATE, NULL → a household it just inserted in the job's
--     studio (project_consent_org). The caller may be ANY member on the job,
--     not only the relationship's designer, so the guard asks for seats, not
--     designership. Keeps working: the caller holds a seat in that studio.
--   · ON DELETE SET NULL (00632:319-321) when a household is deleted: the
--     referential action runs as the table owner (postgres). Keeps working.
--   · No RPC, edge function, service or migration writes the column (00632's
--     add_household_member/set_household_threshold write client_households and
--     project_party_authority only). postgres (SECURITY DEFINER code, seeds,
--     migrations) and service_role (the server-side boundary, which bypasses
--     RLS on this table anyway) are not asked; no service_role writer exists
--     today.
--
-- NOTHING IS BACKFILLED OR DELETED. Rows the guard narrows are counted below
-- (a NOTICE) for evidence-based studio stamping. Typed subjects and escalation
-- are untouched. Run inside the caller's transaction: no BEGIN/COMMIT here, so
-- supabase/tests/rls/00867_margin_notes_tenant_guard.test.sql can \ir it.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.margin_note_tenant_admits(
  p_project_id         uuid,
  p_proposal_id        uuid,
  p_designer_client_id uuid,
  p_author             uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  WITH anchor AS (
    SELECT project.id IS NOT NULL AS resolved,
           project.studio_id      AS tenant,
           project.designer_id    AS owner
      FROM (SELECT p_project_id AS id) AS supplied
      LEFT JOIN public.projects AS project ON project.id = supplied.id
     WHERE supplied.id IS NOT NULL
    UNION ALL
    SELECT proposal.id IS NOT NULL, proposal.studio_id, proposal.designer_id
      FROM (SELECT p_proposal_id AS id) AS supplied
      LEFT JOIN public.proposals AS proposal ON proposal.id = supplied.id
     WHERE supplied.id IS NOT NULL
    UNION ALL
    SELECT relationship.id IS NOT NULL, household.organization_id,
           relationship.designer_id
      FROM (SELECT p_designer_client_id AS id) AS supplied
      LEFT JOIN public.designer_clients AS relationship
        ON relationship.id = supplied.id
      LEFT JOIN public.client_households AS household
        ON household.id = relationship.household_id
     WHERE supplied.id IS NOT NULL
  ),
  recorded AS (
    SELECT count(*)               AS anchors,
           bool_and(resolved)     AS resolved,
           count(DISTINCT tenant) AS tenants,
           bool_or(tenant IS NULL) AS studio_less
      FROM anchor
  )
  SELECT COALESCE(
    (SELECT r.anchors > 0 AND r.resolved AND r.tenants <= 1 FROM recorded AS r)
    AND NOT EXISTS (
      SELECT 1
        FROM anchor AS a, recorded AS r
       WHERE NOT COALESCE(
         -- A studio-less anchor anywhere on the row: every anchor is the caller's.
         (NOT r.studio_less OR a.owner = auth.uid())
         -- A recorded studio: the caller's active, non-guest seat in it.
         AND (a.tenant IS NULL OR EXISTS (
           SELECT 1
             FROM public.organization_members AS seat
             JOIN public.organizations AS studio
               ON studio.id = seat.organization_id
            WHERE seat.organization_id = a.tenant
              AND seat.user_id = auth.uid()
              AND seat.status = 'active'
              AND seat.role <> 'guest'
              AND (studio.status = 'active'
                   OR p_author = auth.uid()
                   OR a.owner = auth.uid()))),
         false)
    ),
    false);
$$;

REVOKE ALL ON FUNCTION public.margin_note_tenant_admits(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.margin_note_tenant_admits(uuid, uuid, uuid, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.margin_note_tenant_admits(uuid, uuid, uuid, uuid) IS
  'Tenant gate for margin_notes_tenant_guard (00867, SQ-1846 F1/F2). True when '
  'every supplied anchor resolves, the anchors record at most one studio, the '
  'caller holds an active non-guest seat in that studio (active studio, or her '
  'own note/job), and, if any anchor records no studio, the caller owns every '
  'anchor (no co-member, no vouching link: SQ-1858 F3). Decides tenancy only, '
  'identically for both images. Reads the record, never the caller''s studio. '
  'SECURITY DEFINER so a parent the caller cannot see reads as "not yours", '
  'not as "no studio" (00625 §1).';

DROP POLICY IF EXISTS margin_notes_tenant_guard ON public.margin_notes;
CREATE POLICY margin_notes_tenant_guard ON public.margin_notes
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (public.margin_note_tenant_admits(
    project_id, proposal_id, designer_client_id, designer_id))
  WITH CHECK (public.margin_note_tenant_admits(
    project_id, proposal_id, designer_client_id, designer_id));

COMMENT ON POLICY margin_notes_tenant_guard ON public.margin_notes IS
  'SQ-1846 F1/F2 (00867): RESTRICTIVE, so it narrows all five permissive '
  'policies (00196 designer_all, 00316 studio_read, 00584 insert/update/delete) '
  'for every verb and both UPDATE images. The row must belong, by its recorded '
  'anchors, to a studio where the caller holds an active non-guest seat; a row '
  'with any studio-less anchor is its anchors'' owner''s alone. See '
  'margin_note_tenant_admits.';

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.margin_notes TO authenticated;
GRANT ALL ON TABLE public.margin_notes TO service_role;

-- ── The Discovery tenant pointer (SQ-1858 F4) ───────────────────────────────
-- SECURITY INVOKER, because current_user is how it tells a signed-in caller
-- from database code (00813 guard_proposal_studio_stamp). The household reads
-- run under the caller's own client_households RLS, which shows a household
-- only to an active member of its studio, and the seat is asked again
-- explicitly: a household the caller cannot see is a refusal, never a pass.
CREATE OR REPLACE FUNCTION public.guard_designer_client_household()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role')
     OR NEW.household_id IS NOT DISTINCT FROM OLD.household_id THEN
    RETURN NEW;
  END IF;
  IF (OLD.household_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
          FROM public.client_households AS household
         WHERE household.id = OLD.household_id
           AND public.is_active_studio_member(household.organization_id)))
     OR (NEW.household_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
          FROM public.client_households AS household
         WHERE household.id = NEW.household_id
           AND public.is_active_studio_member(household.organization_id)))
  THEN
    RAISE EXCEPTION 'A client record moves between households only inside studios you hold a seat in.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

-- SECURITY INVOKER, so nobody holds it (as 00813's studio-stamp guard).
REVOKE ALL ON FUNCTION public.guard_designer_client_household()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.guard_designer_client_household() IS
  'SQ-1858 F4 (00867): a signed-in caller re-points designer_clients.household_id '
  'only with an active non-guest seat in the old household''s studio (if any) '
  'and the new one''s (if any), the rule client_households already holds its '
  'organization_id to (00632). postgres (SECURITY DEFINER code, seeds, ON '
  'DELETE SET NULL) and service_role are not asked.';

DROP TRIGGER IF EXISTS guard_designer_client_household_trg ON public.designer_clients;
CREATE TRIGGER guard_designer_client_household_trg
  BEFORE UPDATE OF household_id ON public.designer_clients
  FOR EACH ROW EXECUTE FUNCTION public.guard_designer_client_household();

-- ── Inventory of the rows the guard narrows (no data is changed) ───────────
DO $inventory$
DECLARE
  v_studio_less integer;
  v_mixed       integer;
  v_coauthored  integer;
  v_no_owner    integer;
  v_conflicting integer;
BEGIN
  WITH anchor AS (
    SELECT note.id, note.designer_id AS author,
           project.studio_id AS tenant, project.designer_id AS owner
      FROM public.margin_notes AS note
      JOIN public.projects AS project ON project.id = note.project_id
    UNION ALL
    SELECT note.id, note.designer_id, proposal.studio_id, proposal.designer_id
      FROM public.margin_notes AS note
      JOIN public.proposals AS proposal ON proposal.id = note.proposal_id
    UNION ALL
    SELECT note.id, note.designer_id,
           household.organization_id, relationship.designer_id
      FROM public.margin_notes AS note
      JOIN public.designer_clients AS relationship
        ON relationship.id = note.designer_client_id
      LEFT JOIN public.client_households AS household
        ON household.id = relationship.household_id
  ),
  per_note AS (
    SELECT id,
           count(DISTINCT tenant)  AS tenants,
           bool_or(tenant IS NULL) AS studio_less,
           -- exactly one anchor owner, and no anchor without one
           count(DISTINCT owner) = 1 AND bool_and(owner IS NOT NULL) AS one_owner,
           bool_and(owner IS NOT DISTINCT FROM author) AS by_owner
      FROM anchor
     GROUP BY id
  )
  SELECT count(*) FILTER (WHERE tenants = 0 AND one_owner),
         count(*) FILTER (WHERE tenants = 1 AND studio_less AND one_owner),
         count(*) FILTER (WHERE tenants <= 1 AND studio_less AND one_owner
                            AND NOT by_owner),
         count(*) FILTER (WHERE tenants <= 1 AND studio_less AND NOT one_owner),
         count(*) FILTER (WHERE tenants > 1)
    INTO v_studio_less, v_mixed, v_coauthored, v_no_owner, v_conflicting
    FROM per_note;

  RAISE NOTICE '00867 margin_notes_tenant_guard: % note(s) record no studio and '
    '% carry a studio-less anchor beside a studio''s; each is now its single '
    'anchor owner''s alone (% of them not authored by that owner). % note(s) '
    'carry studio-less anchors with no single owner and % name two studios: '
    'both are refused to every reader. No row was changed.',
    v_studio_less, v_mixed, v_coauthored, v_no_owner, v_conflicting;
END;
$inventory$;
