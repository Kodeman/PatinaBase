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
--   · an anchor that records no studio may ride a scoped row only for its own
--     designer of record, or when a scoped anchor on the same row has that
--     same designer AND the two are one engagement by a recorded link:
--     proposals.project_id, projects.proposal_id or proposals.designer_client_id
--     (a job's unstamped proposal stays usable; a stranger's record, or an
--     unrelated record of the same designer, cannot be masked by a scoped one);
--   · a row with no recorded studio at all is its anchors' owner's alone. No
--     co-member.
-- The guard decides only WHICH STUDIO; USING and WITH CHECK are the same test,
-- so an owner keeps every verb on a coauthored legacy note without rewriting
-- its author. Who may write inside the studio stays with the five policies.
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
    SELECT 'project'::text        AS kind,
           project.id IS NOT NULL AS resolved,
           project.studio_id      AS tenant,
           project.designer_id    AS owner
      FROM (SELECT p_project_id AS id) AS supplied
      LEFT JOIN public.projects AS project ON project.id = supplied.id
     WHERE supplied.id IS NOT NULL
    UNION ALL
    SELECT 'proposal', proposal.id IS NOT NULL, proposal.studio_id,
           proposal.designer_id
      FROM (SELECT p_proposal_id AS id) AS supplied
      LEFT JOIN public.proposals AS proposal ON proposal.id = supplied.id
     WHERE supplied.id IS NOT NULL
    UNION ALL
    SELECT 'relationship', relationship.id IS NOT NULL,
           household.organization_id, relationship.designer_id
      FROM (SELECT p_designer_client_id AS id) AS supplied
      LEFT JOIN public.designer_clients AS relationship
        ON relationship.id = supplied.id
      LEFT JOIN public.client_households AS household
        ON household.id = relationship.household_id
     WHERE supplied.id IS NOT NULL
  ),
  recorded AS (
    SELECT count(*) AS anchors,
           bool_and(resolved) AS resolved,
           count(DISTINCT tenant) AS tenants
      FROM anchor
  ),
  -- The pairs of supplied anchors that are one engagement by a recorded link.
  lineage (near, far) AS (
    SELECT 'project', 'proposal'
     WHERE EXISTS (SELECT 1 FROM public.proposals AS proposal
                    WHERE proposal.id = p_proposal_id
                      AND proposal.project_id = p_project_id)
        OR EXISTS (SELECT 1 FROM public.projects AS project
                    WHERE project.id = p_project_id
                      AND project.proposal_id = p_proposal_id)
    UNION ALL
    SELECT 'proposal', 'relationship'
     WHERE EXISTS (SELECT 1 FROM public.proposals AS proposal
                    WHERE proposal.id = p_proposal_id
                      AND proposal.designer_client_id = p_designer_client_id)
  )
  SELECT COALESCE(
    (SELECT r.anchors > 0 AND r.resolved AND r.tenants <= 1 FROM recorded AS r)
    AND NOT EXISTS (
      SELECT 1
        FROM anchor AS a
       WHERE NOT COALESCE(
         CASE
           WHEN a.tenant IS NOT NULL THEN EXISTS (
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
                     OR a.owner = auth.uid()))
           WHEN (SELECT r.tenants FROM recorded AS r) = 1 THEN
             a.owner = auth.uid()
             OR EXISTS (SELECT 1
                          FROM anchor AS scoped
                          JOIN lineage AS link
                            ON (link.near = scoped.kind AND link.far = a.kind)
                            OR (link.near = a.kind AND link.far = scoped.kind)
                         WHERE scoped.tenant IS NOT NULL
                           AND scoped.owner = a.owner)
           ELSE
             a.owner = auth.uid()
         END,
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
  'own note/job), and any studio-less anchor is the caller''s or shares its '
  'designer and a recorded link (proposals.project_id, projects.proposal_id, '
  'proposals.designer_client_id) with a scoped anchor on the row. A row '
  'recording no studio is its anchors'' owner''s alone. Decides tenancy only, '
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
  'anchors, to a studio where the caller holds an active non-guest seat; a '
  'studio-less legacy row is its owner''s alone. See margin_note_tenant_admits.';

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.margin_notes TO authenticated;
GRANT ALL ON TABLE public.margin_notes TO service_role;

-- ── Inventory of the rows the guard narrows (no data is changed) ───────────
DO $inventory$
DECLARE
  v_unscoped    integer;
  v_coauthored  integer;
  v_conflicting integer;
  v_unvouched   integer;
BEGIN
  WITH anchor AS (
    SELECT note.id, 'project'::text AS kind, note.designer_id AS author,
           project.studio_id AS tenant, project.designer_id AS owner
      FROM public.margin_notes AS note
      JOIN public.projects AS project ON project.id = note.project_id
    UNION ALL
    SELECT note.id, 'proposal', note.designer_id, proposal.studio_id,
           proposal.designer_id
      FROM public.margin_notes AS note
      JOIN public.proposals AS proposal ON proposal.id = note.proposal_id
    UNION ALL
    SELECT note.id, 'relationship', note.designer_id,
           household.organization_id, relationship.designer_id
      FROM public.margin_notes AS note
      JOIN public.designer_clients AS relationship
        ON relationship.id = note.designer_client_id
      LEFT JOIN public.client_households AS household
        ON household.id = relationship.household_id
  ),
  lineage AS (
    SELECT note.id, 'project'::text AS near, 'proposal'::text AS far
      FROM public.margin_notes AS note
     WHERE EXISTS (SELECT 1 FROM public.proposals AS proposal
                    WHERE proposal.id = note.proposal_id
                      AND proposal.project_id = note.project_id)
        OR EXISTS (SELECT 1 FROM public.projects AS project
                    WHERE project.id = note.project_id
                      AND project.proposal_id = note.proposal_id)
    UNION ALL
    SELECT note.id, 'proposal', 'relationship'
      FROM public.margin_notes AS note
     WHERE EXISTS (SELECT 1 FROM public.proposals AS proposal
                    WHERE proposal.id = note.proposal_id
                      AND proposal.designer_client_id = note.designer_client_id)
  ),
  per_note AS (
    SELECT id,
           count(DISTINCT tenant) AS tenants,
           bool_or(owner IS DISTINCT FROM author) AS foreign_owner,
           bool_or(tenant IS NULL
                   AND NOT EXISTS (
                     SELECT 1
                       FROM anchor AS scoped
                       JOIN lineage AS link
                         ON link.id = scoped.id
                        AND ((link.near = scoped.kind AND link.far = anchor.kind)
                          OR (link.near = anchor.kind AND link.far = scoped.kind))
                      WHERE scoped.id = anchor.id
                        AND scoped.tenant IS NOT NULL
                        AND scoped.owner = anchor.owner))
             AS unvouched
      FROM anchor
     GROUP BY id
  )
  SELECT count(*) FILTER (WHERE tenants = 0),
         count(*) FILTER (WHERE tenants = 0 AND foreign_owner),
         count(*) FILTER (WHERE tenants > 1),
         count(*) FILTER (WHERE tenants = 1 AND unvouched)
    INTO v_unscoped, v_coauthored, v_conflicting, v_unvouched
    FROM per_note;

  RAISE NOTICE '00867 margin_notes_tenant_guard: % note(s) record no studio '
    '(owner-only from now on; % of them not authored by an anchor owner), '
    '% name two studios (refused to every reader), % carry a studio-less anchor '
    'with no same-designer scoped anchor linked to it (its owner only). No row '
    'was changed.',
    v_unscoped, v_coauthored, v_conflicting, v_unvouched;
END;
$inventory$;
