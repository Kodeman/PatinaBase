-- ═══════════════════════════════════════════════════════════════════════════
-- 00488 — Canonical studio authority closure
--
-- Provenance: the immutable review queue at
-- supabase/acl/canonical-studio-authority-review.json (SHA-256
-- 7d4a3de8ef879787abc2df50e3d3801ffa128ff1f41e58194ddb3b00f79deab7).
-- It is a reviewed input, never a runtime catalog allow-list.
--
-- Composition: moving 00484 → frozen 00485 → frozen 00486 → provisional
-- 00487.  This migration owns the 00488 canonical-studio delta only.  The
-- ordinary phase deliberately does not alter storage.objects; its nine exact
-- replacements live in the separately reviewed platform-admin artifact.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL search_path = pg_catalog, public;
SET LOCAL standard_conforming_strings = on;
SET LOCAL quote_all_identifiers = off;

-- Source-or-final proof is generated from the reviewed 378-row queue.  It
-- executes before the first persistent catalog/data mutation.
-- @@GENERATED_PREFLIGHT@@

-- ── Immutable resource-studio snapshots ───────────────────────────────────

ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS studio_id uuid;
ALTER TABLE public.designer_clients ADD COLUMN IF NOT EXISTS studio_id uuid;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS studio_id uuid;
ALTER TABLE public.client_decisions ADD COLUMN IF NOT EXISTS studio_id uuid;
ALTER TABLE public.saved_vendors ADD COLUMN IF NOT EXISTS studio_id uuid;
ALTER TABLE public.phase_templates ADD COLUMN IF NOT EXISTS studio_id uuid;

DO $snapshot_foreign_keys$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT * FROM (VALUES
      ('proposals', 'proposals_studio_id_fkey'),
      ('designer_clients', 'designer_clients_studio_id_fkey'),
      ('leads', 'leads_studio_id_fkey'),
      ('client_decisions', 'client_decisions_studio_id_fkey'),
      ('saved_vendors', 'saved_vendors_studio_id_fkey'),
      ('phase_templates', 'phase_templates_studio_id_fkey')
    ) AS expected(table_name, constraint_name)
  LOOP
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I',
      target.table_name,
      target.constraint_name
    );
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (studio_id) REFERENCES public.organizations(id) ON DELETE RESTRICT NOT VALID',
      target.table_name,
      target.constraint_name
    );
  END LOOP;
END;
$snapshot_foreign_keys$;

DROP INDEX IF EXISTS public.proposals_studio_id_idx;
CREATE INDEX proposals_studio_id_idx ON public.proposals(studio_id);
DROP INDEX IF EXISTS public.designer_clients_studio_id_idx;
CREATE INDEX designer_clients_studio_id_idx ON public.designer_clients(studio_id);
DROP INDEX IF EXISTS public.leads_studio_id_idx;
CREATE INDEX leads_studio_id_idx ON public.leads(studio_id);
DROP INDEX IF EXISTS public.client_decisions_studio_id_idx;
CREATE INDEX client_decisions_studio_id_idx ON public.client_decisions(studio_id);
DROP INDEX IF EXISTS public.saved_vendors_studio_id_idx;
CREATE INDEX saved_vendors_studio_id_idx ON public.saved_vendors(studio_id);
DROP INDEX IF EXISTS public.phase_templates_studio_id_idx;
CREATE INDEX phase_templates_studio_id_idx ON public.phase_templates(studio_id);

-- Historical NULL snapshots are never inferred from current membership state.
-- Exact candidates below come only from immutable project or already-persisted
-- snapshot facts.  Unlinked/ambiguous legacy rows deliberately remain NULL and
-- therefore retain exact-owner/client access only.

-- Reject every contradictory already-frozen parent/snapshot tuple before the
-- first data UPDATE. The transaction never rewrites a conflicting non-NULL
-- historical snapshot into a state that merely looks canonical afterwards.
DO $snapshot_mismatch_preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.proposals AS proposal
    LEFT JOIN public.projects AS project ON project.id = proposal.project_id
    LEFT JOIN public.designer_clients AS relationship
      ON relationship.id = proposal.designer_client_id
    WHERE (proposal.project_id IS NOT NULL
           AND project.id IS NULL)
       OR (project.id IS NOT NULL
           AND proposal.studio_id IS NOT NULL
           AND proposal.studio_id IS DISTINCT FROM project.studio_id)
       OR (project.id IS NOT NULL
           AND relationship.studio_id IS NOT NULL
           AND relationship.studio_id IS DISTINCT FROM project.studio_id)
       OR (proposal.studio_id IS NOT NULL
           AND relationship.studio_id IS NOT NULL
           AND proposal.studio_id IS DISTINCT FROM relationship.studio_id)
  ) THEN
    RAISE EXCEPTION '00488 proposal project/relationship studio mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.client_decisions AS decision
    LEFT JOIN public.projects AS project ON project.id = decision.project_id
    LEFT JOIN public.designer_clients AS relationship
      ON relationship.id = decision.designer_client_id
    WHERE (decision.project_id IS NOT NULL AND project.id IS NULL)
       OR relationship.id IS NULL
       OR (project.id IS NOT NULL AND decision.studio_id IS NOT NULL
           AND decision.studio_id IS DISTINCT FROM project.studio_id)
       OR (project.id IS NOT NULL AND relationship.studio_id IS NOT NULL
           AND relationship.studio_id IS DISTINCT FROM project.studio_id)
       OR (decision.studio_id IS NOT NULL
           AND relationship.studio_id IS NOT NULL
           AND decision.studio_id IS DISTINCT FROM relationship.studio_id)
  ) THEN
    RAISE EXCEPTION '00488 decision project/relationship studio mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.designer_clients AS relationship
    JOIN public.leads AS lead ON lead.id = relationship.lead_id
    WHERE relationship.studio_id IS NOT NULL
      AND lead.studio_id IS NOT NULL
      AND relationship.studio_id IS DISTINCT FROM lead.studio_id
  ) THEN
    RAISE EXCEPTION '00488 relationship/lead studio mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.phase_templates AS template
    LEFT JOIN public.organizations AS studio ON studio.id = template.studio_id
    WHERE (template.is_system AND template.studio_id IS NOT NULL)
       OR (NOT template.is_system AND template.studio_id IS NOT NULL
           AND (template.designer_id IS NULL OR studio.type IS DISTINCT FROM 'design_studio'))
  ) THEN
    RAISE EXCEPTION '00488 phase-template studio snapshot is invalid';
  END IF;

  -- A relationship may be referenced by several exact parents, but those
  -- parents must all name one studio.  Never silently leave the relationship
  -- NULL when immutable project/lead facts disagree.
  IF EXISTS (
    WITH exact_candidates(relationship_id, studio_id) AS (
      SELECT proposal.designer_client_id, project.studio_id
      FROM public.proposals AS proposal
      JOIN public.projects AS project ON project.id = proposal.project_id
      WHERE proposal.designer_client_id IS NOT NULL
        AND project.studio_id IS NOT NULL
      UNION ALL
      SELECT decision.designer_client_id, project.studio_id
      FROM public.client_decisions AS decision
      JOIN public.projects AS project ON project.id = decision.project_id
      WHERE project.studio_id IS NOT NULL
      UNION ALL
      SELECT relationship.id, lead.studio_id
      FROM public.designer_clients AS relationship
      JOIN public.leads AS lead ON lead.id = relationship.lead_id
      WHERE lead.studio_id IS NOT NULL
    )
    SELECT 1
    FROM exact_candidates
    GROUP BY relationship_id
    HAVING count(DISTINCT studio_id) > 1
  ) THEN
    RAISE EXCEPTION '00488 relationship has conflicting exact studio parents';
  END IF;

  IF EXISTS (
    WITH exact_candidates(relationship_id, studio_id) AS (
      SELECT proposal.designer_client_id, project.studio_id
      FROM public.proposals AS proposal
      JOIN public.projects AS project ON project.id = proposal.project_id
      WHERE proposal.designer_client_id IS NOT NULL
        AND project.studio_id IS NOT NULL
      UNION ALL
      SELECT decision.designer_client_id, project.studio_id
      FROM public.client_decisions AS decision
      JOIN public.projects AS project ON project.id = decision.project_id
      WHERE project.studio_id IS NOT NULL
      UNION ALL
      SELECT relationship.id, lead.studio_id
      FROM public.designer_clients AS relationship
      JOIN public.leads AS lead ON lead.id = relationship.lead_id
      WHERE lead.studio_id IS NOT NULL
    ), resolved_relationship AS (
      SELECT relationship_id, min(studio_id::text)::uuid AS studio_id
      FROM exact_candidates
      GROUP BY relationship_id
      HAVING count(DISTINCT studio_id) = 1
    ), lead_candidates(lead_id, studio_id) AS (
      SELECT relationship.lead_id,
             COALESCE(relationship.studio_id, resolved_relationship.studio_id)
      FROM public.designer_clients AS relationship
      LEFT JOIN resolved_relationship
        ON resolved_relationship.relationship_id = relationship.id
      WHERE relationship.lead_id IS NOT NULL
        AND COALESCE(
          relationship.studio_id, resolved_relationship.studio_id
        ) IS NOT NULL
    )
    SELECT 1
    FROM lead_candidates
    GROUP BY lead_id
    HAVING count(DISTINCT studio_id) > 1
  ) THEN
    RAISE EXCEPTION '00488 lead has conflicting exact relationship studios';
  END IF;
END;
$snapshot_mismatch_preflight$;

WITH exact_candidates AS (
  SELECT relationship.id, project.studio_id
  FROM public.designer_clients AS relationship
  JOIN public.proposals AS proposal ON proposal.designer_client_id = relationship.id
  JOIN public.projects AS project ON project.id = proposal.project_id
  WHERE project.studio_id IS NOT NULL
  UNION ALL
  SELECT relationship.id, project.studio_id
  FROM public.designer_clients AS relationship
  JOIN public.client_decisions AS decision
    ON decision.designer_client_id = relationship.id
  JOIN public.projects AS project ON project.id = decision.project_id
  WHERE project.studio_id IS NOT NULL
  UNION ALL
  SELECT relationship.id, lead.studio_id
  FROM public.designer_clients AS relationship
  JOIN public.leads AS lead ON lead.id = relationship.lead_id
  WHERE lead.studio_id IS NOT NULL
), unique_candidates AS (
  SELECT id, min(studio_id::text)::uuid AS studio_id
  FROM exact_candidates
  GROUP BY id
  HAVING count(DISTINCT studio_id) = 1
)
UPDATE public.designer_clients AS relationship
SET studio_id = candidate.studio_id
FROM unique_candidates AS candidate
WHERE relationship.id = candidate.id
  AND relationship.studio_id IS NULL;

WITH unique_candidates AS (
  SELECT relationship.lead_id AS id,
         min(relationship.studio_id::text)::uuid AS studio_id
  FROM public.designer_clients AS relationship
  WHERE relationship.lead_id IS NOT NULL
    AND relationship.studio_id IS NOT NULL
  GROUP BY relationship.lead_id
  HAVING count(DISTINCT relationship.studio_id) = 1
)
UPDATE public.leads AS lead
SET studio_id = candidate.studio_id
FROM unique_candidates AS candidate
WHERE lead.id = candidate.id
  AND lead.studio_id IS NULL;

UPDATE public.designer_clients AS relationship
SET studio_id = lead.studio_id
FROM public.leads AS lead
WHERE relationship.lead_id = lead.id
  AND relationship.studio_id IS NULL
  AND lead.studio_id IS NOT NULL;

UPDATE public.proposals AS proposal
SET studio_id = project.studio_id
FROM public.projects AS project
WHERE proposal.studio_id IS NULL
  AND project.id = proposal.project_id
  AND project.studio_id IS NOT NULL;

UPDATE public.proposals AS proposal
SET studio_id = relationship.studio_id
FROM public.designer_clients AS relationship
WHERE proposal.studio_id IS NULL
  AND relationship.id = proposal.designer_client_id
  AND relationship.studio_id IS NOT NULL;

UPDATE public.client_decisions AS decision
SET studio_id = project.studio_id
FROM public.projects AS project
WHERE decision.studio_id IS NULL
  AND project.id = decision.project_id
  AND project.studio_id IS NOT NULL;

UPDATE public.client_decisions AS decision
SET studio_id = relationship.studio_id
FROM public.designer_clients AS relationship
WHERE decision.studio_id IS NULL
  AND relationship.id = decision.designer_client_id
  AND relationship.studio_id IS NOT NULL;

DO $snapshot_exact_data_postflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.proposals AS proposal
    LEFT JOIN public.projects AS project ON project.id = proposal.project_id
    LEFT JOIN public.designer_clients AS relationship
      ON relationship.id = proposal.designer_client_id
    WHERE (proposal.project_id IS NOT NULL AND (
             project.id IS NULL
             OR proposal.studio_id IS DISTINCT FROM project.studio_id
           ))
       OR (proposal.designer_client_id IS NOT NULL AND (
             relationship.id IS NULL
             OR proposal.studio_id IS DISTINCT FROM relationship.studio_id
           ))
  ) OR EXISTS (
    SELECT 1
    FROM public.client_decisions AS decision
    LEFT JOIN public.projects AS project ON project.id = decision.project_id
    LEFT JOIN public.designer_clients AS relationship
      ON relationship.id = decision.designer_client_id
    WHERE (decision.project_id IS NOT NULL AND (
             project.id IS NULL
             OR decision.studio_id IS DISTINCT FROM project.studio_id
           ))
       OR relationship.id IS NULL
       OR decision.studio_id IS DISTINCT FROM relationship.studio_id
  ) OR EXISTS (
    SELECT 1
    FROM public.designer_clients AS relationship
    JOIN public.leads AS lead ON lead.id = relationship.lead_id
    WHERE relationship.studio_id IS DISTINCT FROM lead.studio_id
      AND (relationship.studio_id IS NOT NULL OR lead.studio_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION '00488 exact parent/snapshot data postflight failed';
  END IF;
END;
$snapshot_exact_data_postflight$;

-- A designer/client pair can have one canonical non-lead relationship in each
-- exact studio.  Historical NULL snapshots retain the former pair uniqueness
-- without being assigned to a current workspace.
DROP INDEX IF EXISTS public.idx_designer_clients_unique_profile;
CREATE UNIQUE INDEX idx_designer_clients_unique_profile
  ON public.designer_clients(studio_id, designer_id, client_id)
  WHERE studio_id IS NOT NULL AND client_id IS NOT NULL AND status <> 'lead';
DROP INDEX IF EXISTS public.idx_designer_clients_unique_profile_legacy_null_studio;
CREATE UNIQUE INDEX idx_designer_clients_unique_profile_legacy_null_studio
  ON public.designer_clients(designer_id, client_id)
  WHERE studio_id IS NULL AND client_id IS NOT NULL AND status <> 'lead';

DROP INDEX IF EXISTS public.idx_designer_clients_unique_email;
CREATE UNIQUE INDEX idx_designer_clients_unique_email
  ON public.designer_clients(studio_id, designer_id, client_email)
  WHERE studio_id IS NOT NULL AND client_email IS NOT NULL AND client_id IS NULL;
DROP INDEX IF EXISTS public.idx_designer_clients_unique_email_legacy_null_studio;
CREATE UNIQUE INDEX idx_designer_clients_unique_email_legacy_null_studio
  ON public.designer_clients(designer_id, client_email)
  WHERE studio_id IS NULL AND client_email IS NOT NULL AND client_id IS NULL;

ALTER TABLE public.saved_vendors
  DROP CONSTRAINT IF EXISTS saved_vendors_designer_id_vendor_id_key;
DROP INDEX IF EXISTS public.saved_vendors_studio_designer_vendor_key;
CREATE UNIQUE INDEX saved_vendors_studio_designer_vendor_key
  ON public.saved_vendors(studio_id, designer_id, vendor_id)
  WHERE studio_id IS NOT NULL;
DROP INDEX IF EXISTS public.saved_vendors_designer_vendor_legacy_null_studio_key;
CREATE UNIQUE INDEX saved_vendors_designer_vendor_legacy_null_studio_key
  ON public.saved_vendors(designer_id, vendor_id)
  WHERE studio_id IS NULL;

-- ── Exact membership and revocation-safe authoring capabilities ───────────

CREATE OR REPLACE FUNCTION public._can_read_studio_snapshot(
  p_studio_id uuid,
  p_exact_owner uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $can_read_studio_snapshot$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN p_studio_id IS NULL THEN auth.uid() IS NOT DISTINCT FROM p_exact_owner
    ELSE EXISTS (
      SELECT 1
      FROM public.organization_members AS membership
      JOIN public.organizations AS studio ON studio.id = membership.organization_id
      WHERE membership.user_id = auth.uid()
        AND membership.organization_id = p_studio_id
        AND membership.status = 'active'
        AND membership.role <> 'guest'
        AND studio.type = 'design_studio'
        AND studio.status = 'active'
    )
  END;
$can_read_studio_snapshot$;

-- Within the authority tier the lock order is deterministic: designer-domain
-- role rows, the target user's matching user_role rows, their exact
-- membership, then the exact organization.  Callers that have a canonical
-- project/root must lock that root before entering this tier and may lock
-- children only after it.  FOR SHARE blocks every relevant revocation/update
-- until the authoring statement commits without taking unnecessarily strong
-- row locks.
CREATE OR REPLACE FUNCTION public._lock_designer_studio_authority(
  p_studio_id uuid,
  p_designer_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $lock_designer_studio_authority$
DECLARE
  locked_id uuid;
  has_designer_role boolean := false;
  has_membership boolean := false;
  has_studio boolean := false;
BEGIN
  IF p_designer_id IS NULL THEN
    RETURN false;
  END IF;

  FOR locked_id IN
    SELECT role_row.id
    FROM public.roles AS role_row
    WHERE role_row.domain = 'designer'
    ORDER BY role_row.id
    FOR SHARE
  LOOP
    NULL;
  END LOOP;

  FOR locked_id IN
    SELECT user_role.id
    FROM public.user_roles AS user_role
    JOIN public.roles AS role_row ON role_row.id = user_role.role_id
    WHERE user_role.user_id = p_designer_id
      AND role_row.domain = 'designer'
    ORDER BY user_role.role_id, user_role.id
    FOR SHARE OF user_role
  LOOP
    has_designer_role := true;
  END LOOP;

  IF NOT has_designer_role THEN
    RETURN false;
  END IF;
  IF p_studio_id IS NULL THEN
    RETURN true;
  END IF;

  FOR locked_id IN
    SELECT membership.id
    FROM public.organization_members AS membership
    WHERE membership.user_id = p_designer_id
      AND membership.organization_id = p_studio_id
      AND membership.status = 'active'
      AND membership.role <> 'guest'
    ORDER BY membership.id
    FOR SHARE
  LOOP
    has_membership := true;
  END LOOP;

  IF NOT has_membership THEN
    RETURN false;
  END IF;

  FOR locked_id IN
    SELECT studio.id
    FROM public.organizations AS studio
    WHERE studio.id = p_studio_id
      AND studio.type = 'design_studio'
      AND studio.status = 'active'
    ORDER BY studio.id
    FOR SHARE
  LOOP
    has_studio := true;
  END LOOP;

  RETURN has_studio;
END;
$lock_designer_studio_authority$;

CREATE OR REPLACE FUNCTION public._can_author_studio_snapshot(
  p_studio_id uuid,
  p_exact_owner uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $can_author_studio_snapshot$
DECLARE
  actor uuid := auth.uid();
BEGIN
  RETURN actor IS NOT NULL
    AND (p_studio_id IS NOT NULL OR actor IS NOT DISTINCT FROM p_exact_owner)
    AND public._lock_designer_studio_authority(p_studio_id, actor);
END;
$can_author_studio_snapshot$;

-- The legacy owner-keyed helpers fail closed to exact-owner compatibility.
-- They remain temporarily because reserved-owner storage policies are changed
-- only by the platform-admin phase.  No ordinary policy/routine/view below
-- retains a dependency on them.
CREATE OR REPLACE FUNCTION public.is_studio_comember(p_owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$ SELECT auth.uid() IS NOT NULL AND auth.uid() IS NOT DISTINCT FROM p_owner $$;

CREATE OR REPLACE FUNCTION public.is_design_studio_comember(p_owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND auth.uid() IS NOT DISTINCT FROM p_owner
    AND EXISTS (
      SELECT 1 FROM public.user_roles AS user_role
      JOIN public.roles AS role_row ON role_row.id = user_role.role_id
      WHERE user_role.user_id = auth.uid() AND role_row.domain = 'designer'
    )
$$;

CREATE OR REPLACE FUNCTION public._can_author_proposal(p_owner uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $can_author_proposal_compat$
BEGIN
  RETURN auth.uid() IS NOT NULL
    AND auth.uid() IS NOT DISTINCT FROM p_owner
    AND public._lock_designer_studio_authority(NULL, p_owner);
END;
$can_author_proposal_compat$;

CREATE OR REPLACE FUNCTION public.is_active_studio_member(p_organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$ SELECT public._can_read_studio_snapshot(p_organization_id, NULL) $$;

REVOKE EXECUTE ON FUNCTION public._can_read_studio_snapshot(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION public._can_read_studio_snapshot(uuid,uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public._lock_designer_studio_authority(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
REVOKE EXECUTE ON FUNCTION public._can_author_studio_snapshot(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION public._can_author_studio_snapshot(uuid,uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public._can_author_proposal(uuid)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
REVOKE EXECUTE ON FUNCTION public.is_studio_comember(uuid)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION public.is_studio_comember(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_design_studio_comember(uuid)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION public.is_design_studio_comember(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_active_studio_member(uuid)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION public.is_active_studio_member(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_canonical_studio_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $guard_canonical_studio_snapshot$
DECLARE
  expected_studio uuid;
  second_studio uuid;
  has_expected_parent boolean := false;
  has_second_parent boolean := false;
  owner_id uuid;
  app_actor uuid := auth.uid();
  active_role text := COALESCE(
    NULLIF(pg_catalog.current_setting('role', true), ''), 'none'
  );
  postgres_owner_mode boolean :=
    session_user = 'postgres'
    AND active_role IN ('none', 'postgres');
  claim_studio_text text := NULLIF(
    pg_catalog.current_setting('app.canonical_lead_claim_studio_id', true), ''
  );
  claim_transition boolean := false;
  first_authority_user uuid;
  second_authority_user uuid;
  intake_relationship_id uuid;
  actor_bound_by_intake_relationship boolean := false;
BEGIN
  -- A row-level UPDATE already owns its snapshot target. Parent reads retain
  -- FOR SHARE strength so non-key studio/owner changes conflict, but use
  -- NOWAIT to break the inherent target -> parent order against canonical
  -- root -> authority -> child workflows. The direct writer fails bounded
  -- with lock_not_available instead of participating in a deadlock cycle.
  -- The one nullable-write exception is an immutable homeowner intake.  Its
  -- later assignment is possible only inside the explicit workspace claim
  -- RPC: the already-locked lead row reaches this trigger with designer_id
  -- changing first-wins, and the trigger freezes the scoped studio token in
  -- the same UPDATE.  No arbitrary NULL -> studio UPDATE is admitted.
  IF TG_OP = 'UPDATE'
     AND TG_TABLE_NAME = 'leads'
     AND OLD.studio_id IS NULL
     AND NEW.studio_id IS NULL
     AND OLD.designer_id IS NULL
     AND NEW.designer_id IS NOT NULL
     AND OLD.homeowner_id IS NOT NULL
     AND OLD.client_request_id IS NOT NULL
     AND OLD.status = 'new'
     AND NEW.homeowner_id IS NOT DISTINCT FROM OLD.homeowner_id
     AND NEW.status = 'new'
     AND app_actor IS NOT NULL
     AND NEW.designer_id IS NOT DISTINCT FROM app_actor
     AND pg_catalog.current_setting('app.canonical_lead_claim_id', true)
           IS NOT DISTINCT FROM OLD.id::text
     AND claim_studio_text IS NOT NULL
     AND (pg_catalog.to_jsonb(NEW) - ARRAY['designer_id','studio_id','updated_at']::text[])
           IS NOT DISTINCT FROM
         (pg_catalog.to_jsonb(OLD) - ARRAY['designer_id','studio_id','updated_at']::text[])
  THEN
    NEW.studio_id := claim_studio_text::uuid;
    claim_transition := true;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.studio_id IS DISTINCT FROM OLD.studio_id
     AND NOT claim_transition
  THEN
    RAISE EXCEPTION 'studio_snapshot_immutable' USING ERRCODE = 'check_violation';
  END IF;

  CASE TG_TABLE_NAME
    WHEN 'proposals' THEN
      owner_id := NEW.designer_id;
      IF NEW.project_id IS NOT NULL THEN
        SELECT project.studio_id INTO expected_studio
        FROM public.projects AS project WHERE project.id = NEW.project_id
        FOR SHARE NOWAIT;
        has_expected_parent := FOUND;
      END IF;
      IF NEW.designer_client_id IS NOT NULL THEN
        SELECT relationship.studio_id INTO second_studio
        FROM public.designer_clients AS relationship
        WHERE relationship.id = NEW.designer_client_id
        FOR SHARE NOWAIT;
        has_second_parent := FOUND;
      END IF;
    WHEN 'designer_clients' THEN
      owner_id := NEW.designer_id;
      IF NEW.lead_id IS NOT NULL THEN
        SELECT lead.studio_id INTO expected_studio
        FROM public.leads AS lead WHERE lead.id = NEW.lead_id
        FOR SHARE NOWAIT;
        has_expected_parent := FOUND;
      END IF;
    WHEN 'leads' THEN
      owner_id := NEW.designer_id;
      IF TG_OP = 'INSERT'
         AND owner_id IS NOT NULL
         AND app_actor IS NOT NULL
         AND NEW.homeowner_id IS NOT DISTINCT FROM app_actor
         AND NEW.client_request_id IS NOT NULL
         AND NEW.studio_id IS NOT NULL
      THEN
        -- Assigned homeowner intake is the one authenticated non-designer
        -- writer. Bind it to the exact active relationship tuple that supplied
        -- the snapshot; the studio-aware uniqueness index makes this a single
        -- immutable capability, never a first/current-membership choice.
        SELECT relationship.id INTO intake_relationship_id
        FROM public.designer_clients AS relationship
        WHERE relationship.designer_id = owner_id
          AND relationship.client_id = app_actor
          AND relationship.studio_id = NEW.studio_id
          AND relationship.status = 'active'
        FOR SHARE NOWAIT;
        actor_bound_by_intake_relationship := FOUND;
      END IF;
    WHEN 'client_decisions' THEN
      owner_id := NEW.designer_id;
      IF NEW.project_id IS NOT NULL THEN
        SELECT project.studio_id INTO expected_studio
        FROM public.projects AS project WHERE project.id = NEW.project_id
        FOR SHARE NOWAIT;
        has_expected_parent := FOUND;
      END IF;
      SELECT relationship.studio_id INTO second_studio
      FROM public.designer_clients AS relationship
      WHERE relationship.id = NEW.designer_client_id
      FOR SHARE NOWAIT;
      has_second_parent := FOUND;
    WHEN 'saved_vendors' THEN
      owner_id := NEW.designer_id;
    WHEN 'phase_templates' THEN
      IF NEW.is_system THEN
        IF NEW.studio_id IS NOT NULL THEN
          RAISE EXCEPTION 'system_template_has_no_studio' USING ERRCODE = 'check_violation';
        END IF;
        IF postgres_owner_mode OR (app_actor IS NULL AND active_role = 'service_role') THEN
          RETURN NEW;
        END IF;
        RAISE EXCEPTION 'studio_snapshot_not_authorized' USING ERRCODE = 'insufficient_privilege';
      END IF;
      owner_id := NEW.designer_id;
    ELSE
      RAISE EXCEPTION 'unsupported studio snapshot table %', TG_TABLE_NAME;
  END CASE;

  IF has_expected_parent
     AND has_second_parent
     AND expected_studio IS DISTINCT FROM second_studio
  THEN
    RAISE EXCEPTION 'studio_snapshot_parent_mismatch' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT has_expected_parent AND has_second_parent THEN
    expected_studio := second_studio;
  END IF;
  IF TG_OP = 'INSERT'
     AND NEW.studio_id IS NULL
     AND (has_expected_parent OR has_second_parent)
     AND expected_studio IS NOT NULL
  THEN
    -- Compatibility for exact-parent writers: the trigger freezes the same
    -- already-immutable project/relationship/lead fact supplied by the row.
    NEW.studio_id := expected_studio;
  END IF;
  IF (has_expected_parent OR has_second_parent)
     AND NEW.studio_id IS DISTINCT FROM expected_studio
  THEN
    RAISE EXCEPTION 'studio_snapshot_parent_mismatch' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.studio_id IS NULL THEN
    IF postgres_owner_mode THEN
      RETURN NEW;
    END IF;
    IF TG_OP = 'INSERT'
       AND TG_TABLE_NAME = 'leads'
       AND owner_id IS NULL
       AND NEW.homeowner_id IS NOT NULL
       AND NEW.homeowner_id IS NOT DISTINCT FROM app_actor
       AND NEW.client_request_id IS NOT NULL
       AND NEW.status = 'new'
    THEN
      RETURN NEW;
    END IF;
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'studio_snapshot_required' USING ERRCODE = 'check_violation';
    END IF;
    IF app_actor IS NULL
       OR app_actor IS DISTINCT FROM owner_id
       OR NOT public._lock_designer_studio_authority(NULL, owner_id)
    THEN
      RAISE EXCEPTION 'studio_snapshot_not_authorized' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  -- A trusted service may write for a target designer, but it cannot make an
  -- invalid owner/studio tuple valid.  Every non-NULL tuple locks and rechecks
  -- the stamped owner.  An authenticated actor distinct from that owner is
  -- checked too; UUID order prevents two cross-owner writes from acquiring
  -- the same authority rows in inverse order.
  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'studio_snapshot_not_authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF app_actor IS NULL THEN
    IF active_role IS DISTINCT FROM 'service_role' AND NOT postgres_owner_mode THEN
      RAISE EXCEPTION 'studio_snapshot_not_authorized' USING ERRCODE = 'insufficient_privilege';
    END IF;
    first_authority_user := owner_id;
  ELSIF actor_bound_by_intake_relationship THEN
    first_authority_user := owner_id;
  ELSE
    first_authority_user := CASE
      WHEN owner_id < app_actor THEN owner_id ELSE app_actor
    END;
    second_authority_user := CASE
      WHEN owner_id < app_actor THEN app_actor ELSE owner_id
    END;
  END IF;

  IF NOT public._lock_designer_studio_authority(
    NEW.studio_id, first_authority_user
  ) OR (
    second_authority_user IS DISTINCT FROM first_authority_user
    AND NOT public._lock_designer_studio_authority(
      NEW.studio_id, second_authority_user
    )
  ) THEN
    RAISE EXCEPTION 'studio_snapshot_not_authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$guard_canonical_studio_snapshot$;

REVOKE EXECUTE ON FUNCTION public.guard_canonical_studio_snapshot()
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;

DO $snapshot_triggers$
DECLARE
  target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'proposals', 'designer_clients', 'leads', 'client_decisions',
    'saved_vendors', 'phase_templates'
  ]
  LOOP
    EXECUTE pg_catalog.format(
      'DROP TRIGGER IF EXISTS guard_canonical_studio_snapshot ON public.%I', target
    );
    EXECUTE pg_catalog.format(
      'CREATE TRIGGER guard_canonical_studio_snapshot BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_canonical_studio_snapshot()',
      target
    );
  END LOOP;
END;
$snapshot_triggers$;

-- ── Quarantined intake -> explicit-workspace claim contract ─────────────

DO $retire_heuristic_lead_claim_signatures$
BEGIN
  IF pg_catalog.to_regprocedure(
       'public._claim_design_request_00488_core(uuid)'
     ) IS NULL
  THEN
    ALTER FUNCTION public.claim_design_request(uuid)
      RENAME TO _claim_design_request_00488_core;
  END IF;
  IF pg_catalog.to_regprocedure(
       'public._accept_design_request_00488_core(uuid)'
     ) IS NULL
  THEN
    ALTER FUNCTION public.accept_design_request(uuid)
      RENAME TO _accept_design_request_00488_core;
  END IF;
END;
$retire_heuristic_lead_claim_signatures$;

REVOKE EXECUTE ON FUNCTION public._claim_design_request_00488_core(uuid)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
REVOKE EXECUTE ON FUNCTION public._accept_design_request_00488_core(uuid)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;

-- The renamed compatibility cores preserve their reviewed first-wins and
-- arrival side effects, but no longer consult profiles.is_designer.  Their
-- only zero-grant callers are the exact-workspace wrappers below, which lock
-- and recheck the designer-domain role before entering either core.
-- @@GENERATED_COMPATIBILITY_CORES@@

-- One independently profiled legacy invoice core is source-dynamic and still
-- calls the owner-keyed helper.  The explicit invoice wrapper already locks
-- and authorizes the canonical invoice root, so 00488 replaces that redundant
-- check and its optional-table EXECUTE with a zero-grant static core.
-- @@GENERATED_DYNAMIC_INVOICE_CORE@@

CREATE OR REPLACE FUNCTION public._prepare_canonical_lead_claim(
  p_lead_id uuid,
  p_studio_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $prepare_canonical_lead_claim$
DECLARE
  actor uuid := auth.uid();
  target public.leads;
BEGIN
  IF actor IS NULL OR p_studio_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated_or_workspace_missing'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Canonical root precedes authority.  The legacy core's first-wins UPDATE
  -- runs while this row lock remains held; its BEFORE trigger freezes the
  -- already-validated studio in that same statement.
  SELECT lead.* INTO target
  FROM public.leads AS lead
  WHERE lead.id = p_lead_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found' USING DETAIL = p_lead_id::text;
  END IF;

  IF NOT public._can_author_studio_snapshot(p_studio_id, actor) THEN
    RAISE EXCEPTION 'not_designer' USING DETAIL = actor::text;
  END IF;

  IF target.designer_id IS NULL THEN
    IF target.studio_id IS NOT NULL
       OR target.homeowner_id IS NULL
       OR target.client_request_id IS NULL
       OR target.status <> 'new'
    THEN
      RAISE EXCEPTION 'request_not_claimable' USING DETAIL = p_lead_id::text;
    END IF;
  ELSIF target.designer_id IS DISTINCT FROM actor
        OR target.studio_id IS DISTINCT FROM p_studio_id
  THEN
    RAISE EXCEPTION 'already_claimed' USING DETAIL = p_lead_id::text;
  END IF;

  PERFORM pg_catalog.set_config(
    'app.canonical_lead_claim_id', p_lead_id::text, true
  );
  PERFORM pg_catalog.set_config(
    'app.canonical_lead_claim_studio_id', p_studio_id::text, true
  );
END;
$prepare_canonical_lead_claim$;

REVOKE EXECUTE ON FUNCTION public._prepare_canonical_lead_claim(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;

CREATE OR REPLACE FUNCTION public.claim_design_request(
  p_lead_id uuid,
  p_studio_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $claim_design_request_workspace$
DECLARE
  result jsonb;
BEGIN
  PERFORM public._prepare_canonical_lead_claim(p_lead_id, p_studio_id);
  BEGIN
    result := public._claim_design_request_00488_core(p_lead_id);
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_catalog.set_config('app.canonical_lead_claim_id', '', true);
    PERFORM pg_catalog.set_config('app.canonical_lead_claim_studio_id', '', true);
    RAISE;
  END;
  PERFORM pg_catalog.set_config('app.canonical_lead_claim_id', '', true);
  PERFORM pg_catalog.set_config('app.canonical_lead_claim_studio_id', '', true);
  RETURN result;
END;
$claim_design_request_workspace$;

REVOKE EXECUTE ON FUNCTION public.claim_design_request(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION public.claim_design_request(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_design_request(
  p_lead_id uuid,
  p_studio_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $accept_design_request_workspace$
DECLARE
  result jsonb;
BEGIN
  PERFORM public._prepare_canonical_lead_claim(p_lead_id, p_studio_id);
  BEGIN
    result := public._accept_design_request_00488_core(p_lead_id);
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_catalog.set_config('app.canonical_lead_claim_id', '', true);
    PERFORM pg_catalog.set_config('app.canonical_lead_claim_studio_id', '', true);
    RAISE;
  END;
  PERFORM pg_catalog.set_config('app.canonical_lead_claim_id', '', true);
  PERFORM pg_catalog.set_config('app.canonical_lead_claim_studio_id', '', true);
  RETURN result;
END;
$accept_design_request_workspace$;

REVOKE EXECUTE ON FUNCTION public.accept_design_request(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION public.accept_design_request(uuid,uuid) TO authenticated;

-- ── Explicit direct-project workspace contract ────────────────────────────

DROP FUNCTION IF EXISTS public.open_project_direct(text,uuid,integer,integer,date,uuid);

CREATE OR REPLACE FUNCTION public.open_project_direct(
  p_title text,
  p_studio_id uuid,
  p_designer_client_id uuid DEFAULT NULL,
  p_budget_min_cents integer DEFAULT NULL,
  p_budget_max_cents integer DEFAULT NULL,
  p_start_date date DEFAULT CURRENT_DATE,
  p_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $open_project_direct$
DECLARE
  actor uuid := auth.uid();
  project_id uuid := COALESCE(p_id, gen_random_uuid());
  project_title text := pg_catalog.btrim(COALESCE(p_title, ''));
  relationship public.designer_clients;
  existing_project public.projects;
  client_id uuid;
  collision_retry boolean := false;
BEGIN
  IF actor IS NULL OR p_studio_id IS NULL THEN
    RAISE EXCEPTION 'open_project_not_authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF project_title = '' THEN
    RAISE EXCEPTION 'a project title is required' USING ERRCODE = 'check_violation';
  END IF;
  IF p_budget_min_cents IS NOT NULL AND p_budget_max_cents IS NOT NULL
     AND p_budget_min_cents > p_budget_max_cents
  THEN
    RAISE EXCEPTION 'budget band minimum exceeds its maximum' USING ERRCODE = 'check_violation';
  END IF;

  -- Canonical roots/capabilities are locked before authority. A direct
  -- relationship UPDATE already owns that target row before its snapshot
  -- trigger locks authority, so this path must bind the relationship before
  -- taking the same authority locks. A missing p_id has no project row to
  -- lock and is handled by the conflict retry below.
  IF p_id IS NOT NULL THEN
    SELECT candidate.* INTO existing_project
    FROM public.projects AS candidate WHERE candidate.id = p_id
    FOR SHARE;
  END IF;

  IF existing_project.id IS NOT NULL THEN
    IF p_designer_client_id IS NOT NULL THEN
      SELECT candidate.* INTO relationship
      FROM public.designer_clients AS candidate
      WHERE candidate.id = p_designer_client_id
        AND candidate.studio_id = p_studio_id
        AND candidate.designer_id = actor
        AND candidate.status IN ('lead', 'proposal', 'prospect', 'active')
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'open_project_not_authorized'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      client_id := relationship.client_id;
    END IF;
    IF NOT public._can_author_studio_snapshot(p_studio_id, actor) THEN
      RAISE EXCEPTION 'open_project_not_authorized'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF existing_project.studio_id IS DISTINCT FROM p_studio_id
       OR existing_project.designer_id IS DISTINCT FROM actor
       OR existing_project.client_id IS DISTINCT FROM client_id
       OR (relationship.id IS NOT NULL AND relationship.status <> 'active')
    THEN
      RAISE EXCEPTION 'open_project_not_authorized' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN existing_project.id;
  END IF;

  -- The absent-root branch keeps relationship -> authority order. If a
  -- concurrent insert wins the project id, roll back that subtransaction so
  -- both relationship and authority locks are released before the retry
  -- takes project -> relationship -> authority.
  BEGIN
    IF p_designer_client_id IS NOT NULL THEN
      SELECT candidate.* INTO relationship
      FROM public.designer_clients AS candidate
      WHERE candidate.id = p_designer_client_id
        AND candidate.studio_id = p_studio_id
        AND candidate.designer_id = actor
        AND candidate.status IN ('lead', 'proposal', 'prospect', 'active')
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'open_project_not_authorized'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      client_id := relationship.client_id;
    END IF;
    IF NOT public._can_author_studio_snapshot(p_studio_id, actor) THEN
      RAISE EXCEPTION 'open_project_not_authorized'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    INSERT INTO public.projects (
      id, name, status, designer_id, client_id, created_by, studio_id,
      proposal_id, start_date, budget_min, budget_max
    ) VALUES (
      project_id, project_title, 'active', actor, client_id, actor, p_studio_id,
      NULL, p_start_date, p_budget_min_cents, p_budget_max_cents
    ) ON CONFLICT (id) DO NOTHING;
    IF NOT FOUND THEN
      RAISE serialization_failure USING MESSAGE = 'open_project_collision_retry';
    END IF;
  EXCEPTION WHEN serialization_failure THEN
    collision_retry := true;
  END;

  IF collision_retry THEN
    relationship := NULL;
    client_id := NULL;
    SELECT candidate.* INTO existing_project
    FROM public.projects AS candidate WHERE candidate.id = project_id
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'open_project_not_authorized'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_designer_client_id IS NOT NULL THEN
      SELECT candidate.* INTO relationship
      FROM public.designer_clients AS candidate
      WHERE candidate.id = p_designer_client_id
        AND candidate.studio_id = p_studio_id
        AND candidate.designer_id = actor
        AND candidate.status IN ('lead', 'proposal', 'prospect', 'active')
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'open_project_not_authorized'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      client_id := relationship.client_id;
    END IF;
    IF NOT public._can_author_studio_snapshot(p_studio_id, actor)
       OR existing_project.studio_id IS DISTINCT FROM p_studio_id
       OR existing_project.designer_id IS DISTINCT FROM actor
       OR existing_project.client_id IS DISTINCT FROM client_id
       OR (relationship.id IS NOT NULL AND relationship.status <> 'active')
    THEN
      RAISE EXCEPTION 'open_project_not_authorized' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN existing_project.id;
  END IF;

  IF relationship.id IS NOT NULL AND relationship.status IN ('lead', 'proposal', 'prospect') THEN
    UPDATE public.designer_clients AS candidate
    SET status = 'active', updated_at = now()
    WHERE candidate.id = relationship.id
      AND candidate.studio_id = p_studio_id;
  END IF;
  RETURN project_id;
END;
$open_project_direct$;

REVOKE EXECUTE ON FUNCTION public.open_project_direct(text,uuid,uuid,integer,integer,date,uuid)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION public.open_project_direct(text,uuid,uuid,integer,integer,date,uuid)
  TO authenticated;

-- A client profile is not an authority capability: the same client may have
-- one relationship in each studio.  Bind document identity to the selected
-- relationship and the already-locked document studio, with no pair/recency
-- fallback.  The former three-argument PostgREST signature is retired.
DROP FUNCTION IF EXISTS public.set_document_client(text,uuid,uuid);

CREATE OR REPLACE FUNCTION public.set_document_client(
  p_engagement_kind text,
  p_target_id uuid,
  p_client_id uuid,
  p_designer_client_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $set_document_client_workspace$
DECLARE
  actor uuid := auth.uid();
  target_designer uuid;
  target_studio uuid;
  current_designer_client_id uuid;
  proposal_status text;
  relationship public.designer_clients%ROWTYPE;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'set_document_client requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_engagement_kind NOT IN ('project', 'proposal') THEN
    RAISE EXCEPTION 'unknown engagement kind %', p_engagement_kind
      USING ERRCODE = 'check_violation';
  END IF;

  -- Lock the document root, then its exact relationship capability, before
  -- authority. This agrees with direct relationship UPDATEs, whose target
  -- row is inherently locked before the snapshot trigger enters authority.
  IF p_engagement_kind = 'project' THEN
    SELECT project.designer_id, project.studio_id
    INTO target_designer, target_studio
    FROM public.projects AS project
    WHERE project.id = p_target_id
    FOR UPDATE;
  ELSE
    SELECT proposal.designer_id, proposal.studio_id,
           proposal.designer_client_id, proposal.status
    INTO target_designer, target_studio,
         current_designer_client_id, proposal_status
    FROM public.proposals AS proposal
    WHERE proposal.id = p_target_id
    FOR UPDATE;
  END IF;

  IF NOT FOUND
     OR target_designer IS DISTINCT FROM actor
     OR target_studio IS NULL
  THEN
    RAISE EXCEPTION 'no % owned by you with id %', p_engagement_kind, p_target_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_engagement_kind = 'proposal' AND proposal_status <> 'draft' THEN
    RAISE EXCEPTION 'proposal client identity may only change while draft'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_client_id IS NULL THEN
    IF p_designer_client_id IS NOT NULL THEN
      RAISE EXCEPTION 'relationship must be null when client is null'
        USING ERRCODE = 'check_violation';
    END IF;
    relationship := NULL;
  ELSE
    IF p_designer_client_id IS NULL THEN
      RAISE EXCEPTION 'an exact client relationship is required'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT candidate.* INTO relationship
    FROM public.designer_clients AS candidate
    WHERE candidate.id = p_designer_client_id
      AND candidate.designer_id = target_designer
      AND candidate.client_id = p_client_id
      AND candidate.studio_id = target_studio
      AND candidate.status IN ('lead', 'proposal', 'prospect', 'active')
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'client relationship does not belong to this workspace'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF NOT public._can_author_studio_snapshot(target_studio, actor) THEN
    RAISE EXCEPTION 'no % owned by you with id %', p_engagement_kind, p_target_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_engagement_kind = 'project' THEN
    PERFORM pg_catalog.set_config('app.project_identity_id', p_target_id::text, true);
    BEGIN
      UPDATE public.projects
      SET client_id = p_client_id, updated_at = now()
      WHERE id = p_target_id;
    EXCEPTION WHEN OTHERS THEN
      PERFORM pg_catalog.set_config('app.project_identity_id', '', true);
      RAISE;
    END;
    PERFORM pg_catalog.set_config('app.project_identity_id', '', true);
  ELSE
    PERFORM pg_catalog.set_config('app.proposal_identity_id', p_target_id::text, true);
    BEGIN
      UPDATE public.proposals
      SET client_id = p_client_id,
          designer_client_id = p_designer_client_id,
          updated_at = now()
      WHERE id = p_target_id;
    EXCEPTION WHEN OTHERS THEN
      PERFORM pg_catalog.set_config('app.proposal_identity_id', '', true);
      RAISE;
    END;
    PERFORM pg_catalog.set_config('app.proposal_identity_id', '', true);
  END IF;

  IF relationship.id IS NOT NULL THEN
    IF p_engagement_kind = 'project'
       AND relationship.status IN ('lead', 'proposal', 'prospect')
    THEN
      UPDATE public.designer_clients
      SET status = 'active', updated_at = now()
      WHERE id = relationship.id AND studio_id = target_studio;
    ELSIF p_engagement_kind = 'proposal'
          AND relationship.status = 'lead'
          AND NOT EXISTS (
            SELECT 1
            FROM public.designer_clients AS canonical
            WHERE canonical.studio_id = target_studio
              AND canonical.designer_id = target_designer
              AND canonical.client_id = p_client_id
              AND canonical.id <> relationship.id
              AND canonical.status <> 'lead'
          )
    THEN
      UPDATE public.designer_clients
      SET status = 'proposal', updated_at = now()
      WHERE id = relationship.id AND studio_id = target_studio;
    END IF;
  END IF;
END;
$set_document_client_workspace$;

REVOKE EXECUTE ON FUNCTION public.set_document_client(text,uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION public.set_document_client(text,uuid,uuid,uuid)
  TO authenticated;

-- The owner-UUID dispatch contract is replaced in-place: the UUID now names
-- the proposal resource.  The edge caller is changed in the same patch.
-- PostgreSQL does not permit CREATE OR REPLACE to rename an input argument;
-- the source caller/dependency preflight proves this signature has no catalog
-- dependents before the exact drop/recreate boundary.
DROP FUNCTION public.can_dispatch_proposal_send(uuid);
CREATE FUNCTION public.can_dispatch_proposal_send(p_proposal_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.proposals AS proposal
    WHERE proposal.id = p_proposal_id
      AND public._can_read_studio_snapshot(proposal.studio_id, proposal.designer_id)
  )
$$;

REVOKE EXECUTE ON FUNCTION public.can_dispatch_proposal_send(uuid)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION public.can_dispatch_proposal_send(uuid) TO authenticated;

-- ── Every reviewed routine body (direct bodies rewritten; transitive bodies
-- re-emitted byte-for-byte so the final body/profile manifest is complete). ─

-- Live writer routines outside the reviewed helper-dependent queue are
-- re-emitted here when the new snapshot schema changes their write contract.
-- @@GENERATED_WRITER_ROUTINES@@

-- @@GENERATED_ROUTINES@@

REVOKE EXECUTE ON FUNCTION public._can_manage_invoice_owner(uuid)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
DROP FUNCTION IF EXISTS public._can_manage_invoice_owner(uuid);

-- ── Branchwise people directory ───────────────────────────────────────────

CREATE OR REPLACE VIEW public.people_directory
WITH (security_invoker = true) AS
SELECT
  dc.id AS person_id, 'client'::text AS role,
  COALESCE(dc.client_name, profile.full_name, profile.display_name, dc.client_email, 'Unnamed client') AS display_name,
  COALESCE(dc.client_email, profile.email) AS email, profile.phone,
  dc.client_id AS profile_id, NULL::uuid AS project_id, dc.designer_id,
  dc.status AS status_raw,
  COALESCE(dc.last_contacted_at, dc.last_project_at, dc.updated_at) AS last_touch_at,
  jsonb_build_object(
    'total_projects', dc.total_projects, 'total_revenue', dc.total_revenue,
    'last_project_at', dc.last_project_at, 'last_contacted_at', dc.last_contacted_at,
    'first_project_at', dc.first_project_at, 'style_tags', dc.style_tags,
    'source', dc.source, 'satisfaction_score', dc.satisfaction_score,
    'nickname', dc.nickname, 'location', dc.location, 'lead_id', dc.lead_id
  ) || public.designer_client_send_evidence(dc.id, dc.designer_id, dc.client_id) AS meta,
  CASE WHEN dc.designer_id = auth.uid() THEN 'mine' ELSE 'studio' END::text AS scope
FROM public.designer_clients AS dc
LEFT JOIN public.profiles AS profile ON profile.id = dc.client_id
WHERE public._can_read_studio_snapshot(dc.studio_id, dc.designer_id)

UNION ALL

SELECT lead.id, 'lead',
  COALESCE(lead.contact_name, homeowner.full_name, homeowner.display_name, lead.contact_email, 'New lead'),
  COALESCE(lead.contact_email, homeowner.email), homeowner.phone, lead.homeowner_id,
  NULL::uuid, lead.designer_id, lead.status,
  COALESCE(lead.contacted_at, lead.created_at),
  jsonb_build_object(
    'project_type', lead.project_type, 'project_description', lead.project_description,
    'budget_range', lead.budget_range, 'timeline', lead.timeline,
    'match_score', lead.match_score, 'location_city', lead.location_city,
    'location_state', lead.location_state, 'response_deadline', lead.response_deadline,
    'created_at', lead.created_at
  ),
  CASE WHEN lead.designer_id = auth.uid() THEN 'mine' ELSE 'studio' END::text
FROM public.leads AS lead
LEFT JOIN public.profiles AS homeowner ON homeowner.id = lead.homeowner_id
WHERE public._can_read_studio_snapshot(lead.studio_id, lead.designer_id)
  AND lead.status NOT IN ('accepted', 'declined', 'expired')

UNION ALL

SELECT vendor.id, 'maker', vendor.name,
  COALESCE(vendor.orders_email, vendor.trade_account_email), NULL::text,
  vendor.contact_profile_id, NULL::uuid, auth.uid(), vendor.nomination_status,
  vendor.updated_at,
  jsonb_build_object(
    'primary_category', vendor.primary_category, 'lead_times', vendor.lead_times,
    'default_payment_terms', vendor.default_payment_terms,
    'founding_circle', vendor.founding_circle, 'made_in', vendor.made_in,
    'trade_terms', vendor.trade_terms, 'is_patina_catalog', vendor.is_patina_catalog,
    'review_count', vendor.review_count, 'designer_rating_avg', vendor.designer_rating_avg
  ),
  CASE WHEN EXISTS (
    SELECT 1 FROM public.saved_vendors AS mine
    WHERE mine.vendor_id = vendor.id AND mine.designer_id = auth.uid()
  ) THEN 'mine' ELSE 'studio' END::text
FROM public.vendors AS vendor
WHERE vendor.id IN (
  SELECT saved.vendor_id
  FROM public.saved_vendors AS saved
  WHERE public._can_read_studio_snapshot(saved.studio_id, saved.designer_id)
  UNION
  SELECT party.vendor_id
  FROM public.project_parties AS party
  JOIN public.projects AS project ON project.id = party.project_id
  WHERE party.vendor_id IS NOT NULL
    AND public._can_read_studio_snapshot(project.studio_id, project.designer_id)
)

UNION ALL

SELECT party.id, party.party_kind, party.display_name, party.email, party.phone,
  party.profile_id, party.project_id, auth.uid(), party.sms_consent_status,
  party.updated_at,
  jsonb_build_object(
    'company_name', party.company_name, 'vendor_id', party.vendor_id,
    'project_name', project.name, 'party_kind', party.party_kind,
    'trade', party.trade, 'phone_e164', party.phone_e164,
    'sms_consent_status', party.sms_consent_status,
    'sms_consented_at', party.sms_consented_at, 'sms_opt_out_at', party.sms_opt_out_at,
    'show_to_client', party.show_to_client, 'studio_contact_id', party.studio_contact_id
  ),
  CASE WHEN project.designer_id = auth.uid()
         OR project.lead_designer_id = auth.uid()
         OR project.created_by = auth.uid()
       THEN 'mine' ELSE 'studio' END::text
FROM public.project_parties AS party
JOIN public.projects AS project ON project.id = party.project_id
WHERE party.party_kind IN ('gc', 'sub', 'installer', 'receiver', 'architect', 'photographer', 'stager')
  AND public._can_read_studio_snapshot(project.studio_id, project.designer_id)

UNION ALL

SELECT team.id, 'team',
  COALESCE(profile.full_name, profile.display_name, profile.email, 'Teammate'),
  profile.email, profile.phone, team.user_id, team.project_id, auth.uid(),
  team.role, team.assigned_at,
  jsonb_build_object(
    'role', team.role, 'project_name', team.project_name,
    'job_title', team.job_title, 'staff_role', team.staff_role
  ),
  CASE WHEN team.is_mine THEN 'mine' ELSE 'studio' END::text
FROM (
  SELECT DISTINCT ON (member.user_id)
    member.id, member.user_id, member.role, member.project_id, member.assigned_at,
    project.name AS project_name, organization_member.job_title,
    organization_member.staff_role,
    (project.designer_id = auth.uid() OR project.lead_designer_id = auth.uid()
      OR project.created_by = auth.uid()) AS is_mine
  FROM public.project_team_members AS member
  JOIN public.projects AS project ON project.id = member.project_id
  LEFT JOIN public.organization_members AS organization_member
    ON organization_member.user_id = member.user_id
   AND organization_member.organization_id = project.studio_id
   AND organization_member.status = 'active'
  WHERE member.removed_at IS NULL
    AND member.user_id <> auth.uid()
    AND member.role IN ('lead_designer', 'support_designer', 'bookkeeper', 'previous_lead')
    AND public._can_read_studio_snapshot(project.studio_id, project.designer_id)
  ORDER BY member.user_id, member.assigned_at DESC
) AS team
LEFT JOIN public.profiles AS profile ON profile.id = team.user_id

UNION ALL

SELECT contact.id, 'contact', COALESCE(contact.full_name, contact.company_name),
  contact.email, contact.phone, contact.profile_id, NULL::uuid, contact.created_by,
  CASE WHEN contact.archived_at IS NULL THEN 'active' ELSE 'archived' END::text,
  contact.updated_at,
  jsonb_build_object(
    'contact_kind', contact.contact_kind, 'entity_kind', contact.entity_kind,
    'company_name', contact.company_name, 'company_id', contact.company_id,
    'specialties', contact.specialties, 'vendor_id', contact.vendor_id,
    'organization_id', contact.organization_id, 'archived_at', contact.archived_at
  ),
  CASE WHEN contact.created_by = auth.uid() THEN 'mine' ELSE 'studio' END::text
FROM public.studio_contacts AS contact
WHERE public._can_read_studio_snapshot(contact.organization_id, contact.created_by);

-- ── Every ordinary permissive leg is replaced atomically by name. ─────────

-- @@GENERATED_POLICIES@@

-- ── Snapshot constraints validate after exact-only backfill.  NULL remains
-- intentional owner/client-only history, never a guessed studio. ───────────

ALTER TABLE public.proposals VALIDATE CONSTRAINT proposals_studio_id_fkey;
ALTER TABLE public.designer_clients VALIDATE CONSTRAINT designer_clients_studio_id_fkey;
ALTER TABLE public.leads VALIDATE CONSTRAINT leads_studio_id_fkey;
ALTER TABLE public.client_decisions VALIDATE CONSTRAINT client_decisions_studio_id_fkey;
ALTER TABLE public.saved_vendors VALIDATE CONSTRAINT saved_vendors_studio_id_fkey;
ALTER TABLE public.phase_templates VALIDATE CONSTRAINT phase_templates_studio_id_fkey;

COMMENT ON COLUMN public.proposals.studio_id IS
  'Immutable canonical studio snapshot. Linked proposals must equal projects.studio_id; historical NULL rows remain exact-owner/client only.';
COMMENT ON COLUMN public.designer_clients.studio_id IS
  'Immutable studio snapshot for this exact designer-client engagement; historical ambiguity remains NULL and owner/client only.';
COMMENT ON COLUMN public.leads.studio_id IS
  'Immutable studio snapshot from an explicit author workspace, one exact active relationship, or an atomic claim; unassigned or historically ambiguous rows remain NULL.';
COMMENT ON COLUMN public.client_decisions.studio_id IS
  'Immutable decision studio snapshot; project and relationship parents must agree when both exist.';
COMMENT ON COLUMN public.saved_vendors.studio_id IS
  'Immutable studio roster snapshot; ambiguous historical saves remain exact-owner only.';
COMMENT ON COLUMN public.phase_templates.studio_id IS
  'Immutable studio snapshot for custom templates; system templates and ambiguous historical custom templates remain NULL.';

-- The legacy-grant generator consumes these top-level statements.  Keep final
-- app ACLs here, not hidden inside a DO block.
-- @@GENERATED_DCL@@

-- Exact catalog/caller/dependency closure for every reviewed row.
-- @@GENERATED_POSTFLIGHT@@

COMMIT;
