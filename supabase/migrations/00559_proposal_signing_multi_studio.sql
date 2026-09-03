-- ═══════════════════════════════════════════════════════════════════════════
-- 00559 — Proposal signing must resolve a studio, not count memberships
--
-- Lineage: set_project_studio_id 00317 → 00511 → 00559.
-- Reconciles: 00511's discovery narrowing, which reverted 00317's deterministic
--             `_primary_studio_for` default to "exactly one candidate or NULL".
--
-- THE DEFECT (First Flight finding L07-01, blocker).
-- projects.studio_id is stamped by the BEFORE INSERT trigger, because
-- _activate_proposal_as_project_impl inserts the project without one. 00317
-- defaulted the missing value to _primary_studio_for(designer) — owner-role
-- first, then earliest joined. 00511 replaced that with a count: exactly one
-- active non-guest membership in an active design_studio, or NEW.studio_id
-- stays NULL and the guard two hundred lines below raises
-- `studio_id_not_designer_studio`. Its own comment says so: "Zero or multiple
-- candidates remain NULL and fail closed below."
--
-- So a designer in TWO active studios has a client who cannot sign. Measured
-- on the local stack against the seeded designer (a0000000-…-0004), who is an
-- active owner of both `Leah Hartwell` and `Local Dev Studio`:
--
--   candidate_studios = 2
--   sign_proposal('b0000000-…-0002','Client User')
--     → P0001 studio_id_not_designer_studio
--   … then, with the second studio suspended so the count is 1, the identical
--     call → {"status":"accepted","project_id":"…","newly_signed":true}
--
-- On glass the iOS sheet prints "We couldn't record your signature. Nothing
-- has been signed." and proposals.status stays 'sent'. The same ambiguity is
-- why every seeded project for that designer carries studio_id NULL, which
-- also starves the anon brand resolver (00320) and the per-studio invoice
-- counter (00318).
--
-- THE FIX, and its exact blast radius.
-- Zero candidates still fails closed. One candidate is still taken. Only the
-- ambiguous case changes, and only for a project INSERT that is inside the
-- validated activation bridge — proposal-backed, client-bearing, and carrying
-- the transaction-local `app.proposal_activation_id` capability that
-- _activate_proposal_as_project_authorized (00398) issues and that this very
-- trigger already trusts as the client-activation token. Every other caller
-- (direct authenticated INSERT, a service write that did not come through the
-- bridge, any UPDATE) keeps 00511's fail-closed behaviour unchanged.
--
-- In that one case the studio is RESOLVED from the proposal's own
-- designer↔client relationship instead of being refused for being plural:
-- among the candidates — which still must satisfy every predicate 00511
-- required, so no studio the lead designer does not actively belong to can
-- ever be selected — prefer the studio that already hosts a project for this
-- exact (designer_id, client_id) pair, which is the designer_clients
-- relationship the trigger has already verified the proposal points at; then
-- fall back to 00317's rule, owner-role first and earliest joined, with
-- organization_id as a final total order so the answer is deterministic.
--
-- The read is a plain SELECT: no FOR SHARE/FOR UPDATE, so the canonical
-- roles → user_roles → memberships → organization lock order below is
-- untouched. The trigger stays SECURITY INVOKER; in the activation bridge the
-- invoker is the DEFINER owner (postgres) and public.projects is neither
-- force-RLS nor foreign to it, so the preference cannot read a partial set.
--
-- Grants: none added. CREATE OR REPLACE preserves the ACL, and 00511 left this
-- function with no EXECUTE for anyone (a trigger function does not need it —
-- Postgres checks EXECUTE at CREATE TRIGGER time). The DO block at the end
-- ASSERTS that locked-down state rather than re-granting it, so this migration
-- adds no GRANT/REVOKE and supabase/seed/00-legacy-grants.sql needs no regen.
--
-- No schema change: no new column, no new function, no new trigger. Trigger
-- functions are not emitted into packages/supabase/src/database.types.ts, so
-- generated types do not move.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $preflight$
BEGIN
  IF to_regprocedure('public.set_project_studio_id()') IS NULL THEN
    RAISE EXCEPTION '00559 requires public.set_project_studio_id() (00317/00511)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.projects'::regclass
      AND tgname = 'set_project_studio_id'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION '00559 requires the set_project_studio_id trigger on public.projects';
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.set_project_studio_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_active_role text := COALESCE(current_setting('role', true), 'none');
  v_actor uuid := auth.uid();
  v_proposal public.proposals%ROWTYPE;
  v_reassignment boolean := false;
  v_candidate_studio_id uuid;
  v_candidate_studio_count integer := 0;
  v_lead_has_designer_role boolean := false;
  v_actor_is_member boolean := false;
  v_actor_is_admin boolean := false;
  v_old_lead_is_member boolean := false;
  v_postgres_migration boolean :=
    session_user = 'postgres' AND v_active_role IN ('none', 'postgres');
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
    THEN
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    END IF;

    v_reassignment :=
      NEW.designer_id IS DISTINCT FROM OLD.designer_id
      AND current_user = 'postgres'
      AND v_active_role = 'authenticated'
      AND v_actor IS NOT NULL
      AND current_setting('app.project_reassignment_id', true)
            IS NOT DISTINCT FROM NEW.id::text
      AND NEW.studio_id IS NOT DISTINCT FROM OLD.studio_id
      AND NEW.client_id IS NOT DISTINCT FROM OLD.client_id
      AND NEW.proposal_id IS NOT DISTINCT FROM OLD.proposal_id;

    IF NEW.designer_id IS DISTINCT FROM OLD.designer_id
       AND NOT v_reassignment
    THEN
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    END IF;
  END IF;

  -- Qualify active authenticated callers before candidate discovery or any
  -- authority lock. Direct INSERT may only describe the actor; owner-executed
  -- paths must already prove exact-studio membership or the exact activation
  -- capability whose client is creating this project.
  IF v_active_role = 'authenticated' THEN
    IF v_actor IS NULL THEN
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    ELSIF current_user = 'authenticated' THEN
      IF TG_OP <> 'INSERT'
         OR NEW.designer_id IS DISTINCT FROM v_actor
         OR NEW.created_by IS DISTINCT FROM v_actor
         OR NEW.client_id IS NOT NULL
         OR NEW.proposal_id IS NOT NULL
         OR (
           NEW.studio_id IS NOT NULL
           AND NOT EXISTS (
             SELECT 1
             FROM public.organization_members AS membership
             JOIN public.organizations AS studio
               ON studio.id = membership.organization_id
             WHERE membership.organization_id = NEW.studio_id
               AND membership.user_id = v_actor
               AND membership.status = 'active'
               AND membership.role <> 'guest'
               AND studio.type = 'design_studio'
               AND studio.status = 'active'
           )
         )
      THEN
        RAISE EXCEPTION 'studio_id_not_designer_studio';
      END IF;
    ELSIF current_user = 'postgres' THEN
      IF NOT v_reassignment
         AND NOT EXISTS (
           SELECT 1
           FROM public.organization_members AS actor_membership
           JOIN public.organization_members AS lead_membership
             ON lead_membership.organization_id =
                  actor_membership.organization_id
            AND lead_membership.user_id = NEW.designer_id
           JOIN public.organizations AS studio
             ON studio.id = actor_membership.organization_id
           WHERE actor_membership.user_id = v_actor
             AND actor_membership.status = 'active'
             AND actor_membership.role <> 'guest'
             AND lead_membership.status = 'active'
             AND lead_membership.role <> 'guest'
             AND studio.type = 'design_studio'
             AND studio.status = 'active'
             AND (
               NEW.studio_id IS NULL
               OR studio.id = NEW.studio_id
             )
         )
         AND NOT EXISTS (
           SELECT 1
           FROM public.proposals AS proposal
           JOIN public.designer_clients AS relationship
             ON relationship.id = proposal.designer_client_id
           WHERE proposal.id = NEW.proposal_id
             AND proposal.id::text = current_setting(
               'app.proposal_activation_id', true
             )
             AND proposal.designer_id = NEW.designer_id
             AND proposal.client_id = NEW.client_id
             AND proposal.client_id = v_actor
             AND proposal.status = 'accepted'
             AND proposal.project_id IS NULL
             AND relationship.designer_id = proposal.designer_id
             AND relationship.client_id = proposal.client_id
         )
      THEN
        RAISE EXCEPTION 'studio_id_not_designer_studio';
      END IF;
    ELSE
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    END IF;
  ELSIF v_active_role <> 'service_role' AND NOT v_postgres_migration THEN
    RAISE EXCEPTION 'studio_id_not_designer_studio';
  END IF;

  -- A missing studio is discovered without locks only from the exact live
  -- designer authority tuple. Zero candidates remain NULL and fail closed
  -- below. The selected tuple is then locked in canonical order.
  IF NEW.studio_id IS NULL AND NEW.designer_id IS NOT NULL THEN
    SELECT count(DISTINCT membership.organization_id),
           (array_agg(
              DISTINCT membership.organization_id
              ORDER BY membership.organization_id
            ))[1]
    INTO v_candidate_studio_count, v_candidate_studio_id
    FROM public.organization_members AS membership
    JOIN public.organizations AS studio
      ON studio.id = membership.organization_id
    WHERE membership.user_id = NEW.designer_id
      AND membership.status = 'active'
      AND membership.role <> 'guest'
      AND studio.type = 'design_studio'
      AND studio.status = 'active'
      AND public.has_designer_domain_role(NEW.designer_id);

    IF v_candidate_studio_count = 1 THEN
      NEW.studio_id := v_candidate_studio_id;
    ELSIF v_candidate_studio_count > 1
          AND TG_OP = 'INSERT'
          AND NEW.proposal_id IS NOT NULL
          AND NEW.client_id IS NOT NULL
          AND current_setting('app.proposal_activation_id', true)
                IS NOT DISTINCT FROM NEW.proposal_id::text
    THEN
      -- 00559. Ambiguity used to fail closed here, which made a proposal
      -- unsignable for every client of a designer in two active studios
      -- (L07-01). Inside the activation bridge the proposal names its own
      -- relationship, so resolve rather than refuse: same candidate set, so
      -- no studio the lead designer does not actively belong to can be
      -- selected; prefer one that already holds a project for this exact
      -- designer-client pair (the designer_clients relationship the proposal
      -- is checked against below), then 00317's order. organization_id last
      -- makes the answer total. No row lock is taken, so the canonical
      -- acquisition order that follows is unchanged.
      SELECT membership.organization_id
      INTO NEW.studio_id
      FROM public.organization_members AS membership
      JOIN public.organizations AS studio
        ON studio.id = membership.organization_id
      WHERE membership.user_id = NEW.designer_id
        AND membership.status = 'active'
        AND membership.role <> 'guest'
        AND studio.type = 'design_studio'
        AND studio.status = 'active'
        AND public.has_designer_domain_role(NEW.designer_id)
      ORDER BY
        EXISTS (
          SELECT 1
          FROM public.projects AS sibling
          WHERE sibling.studio_id = membership.organization_id
            AND sibling.designer_id = NEW.designer_id
            AND sibling.client_id = NEW.client_id
        ) DESC,
        (membership.role = 'owner') DESC,
        membership.joined_at NULLS LAST,
        membership.created_at,
        membership.organization_id
      LIMIT 1;
    END IF;
  END IF;

  -- The project target is already row-locked for UPDATE. Authority rows then
  -- follow roles -> user_roles -> memberships -> organization. Each relation
  -- has its own statement so planner join order cannot invert acquisition.
  PERFORM role.id
  FROM public.roles AS role
  WHERE role.domain = 'designer'
  ORDER BY role.id
  FOR SHARE;

  PERFORM user_role.id
  FROM public.user_roles AS user_role
  JOIN public.roles AS role ON role.id = user_role.role_id
  WHERE user_role.user_id = NEW.designer_id
    AND role.domain = 'designer'
  ORDER BY user_role.role_id, user_role.id
  FOR SHARE OF user_role;
  -- FOUND here is the caller's RLS-filtered view; the authority answer is the
  -- DEFINER helper's. The statement above stays for its lock and its place in
  -- the canonical roles -> user_roles -> membership -> studio order.
  v_lead_has_designer_role := public.has_designer_domain_role(NEW.designer_id);

  PERFORM membership.id
  FROM public.organization_members AS membership
  WHERE membership.organization_id = NEW.studio_id
    AND membership.user_id = ANY(ARRAY[
      NEW.designer_id,
      CASE WHEN v_reassignment THEN OLD.designer_id END,
      v_actor
    ]::uuid[])
  ORDER BY membership.user_id, membership.id
  FOR SHARE;

  PERFORM studio.id
  FROM public.organizations AS studio
  WHERE studio.id = NEW.studio_id
  ORDER BY studio.id
  FOR SHARE;

  -- A true migration session gets a bounded fixture/owner bypass only after
  -- the same best-effort canonical derivation and UPDATE immutability checks.
  IF v_postgres_migration THEN
    RETURN NEW;
  END IF;

  IF NOT v_lead_has_designer_role
     OR NEW.designer_id IS NULL
     OR NEW.studio_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.organizations AS studio
       WHERE studio.id = NEW.studio_id
         AND studio.type = 'design_studio'
         AND studio.status = 'active'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.organization_members AS lead_membership
       WHERE lead_membership.organization_id = NEW.studio_id
         AND lead_membership.user_id = NEW.designer_id
         AND lead_membership.status = 'active'
         AND lead_membership.role <> 'guest'
     )
  THEN
    RAISE EXCEPTION 'studio_id_not_designer_studio';
  END IF;

  v_actor_is_member := EXISTS (
    SELECT 1
    FROM public.organization_members AS actor_membership
    WHERE actor_membership.organization_id = NEW.studio_id
      AND actor_membership.user_id = v_actor
      AND actor_membership.status = 'active'
      AND actor_membership.role <> 'guest'
  );
  v_actor_is_admin := EXISTS (
    SELECT 1
    FROM public.organization_members AS actor_membership
    WHERE actor_membership.organization_id = NEW.studio_id
      AND actor_membership.user_id = v_actor
      AND actor_membership.status = 'active'
      AND actor_membership.role IN ('owner', 'admin')
  );
  v_old_lead_is_member := NOT v_reassignment OR EXISTS (
    SELECT 1
    FROM public.organization_members AS old_lead_membership
    WHERE old_lead_membership.organization_id = NEW.studio_id
      AND old_lead_membership.user_id = OLD.designer_id
      AND old_lead_membership.status = 'active'
      AND old_lead_membership.role <> 'guest'
  );

  IF NOT v_old_lead_is_member THEN
    RAISE EXCEPTION 'studio_id_not_designer_studio';
  END IF;

  IF NEW.proposal_id IS NOT NULL THEN
    SELECT proposal.* INTO v_proposal
    FROM public.proposals AS proposal
    WHERE proposal.id = NEW.proposal_id
      AND proposal.client_id = NEW.client_id
      AND (proposal.project_id IS NULL OR proposal.project_id = NEW.id)
      AND (
        TG_OP = 'UPDATE'
        OR proposal.designer_id = NEW.designer_id
      )
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    END IF;

    PERFORM relationship.id
    FROM public.designer_clients AS relationship
    WHERE relationship.id = v_proposal.designer_client_id
      AND relationship.designer_id = v_proposal.designer_id
      AND relationship.client_id = v_proposal.client_id
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    END IF;
  END IF;

  IF v_active_role = 'authenticated' THEN
    IF v_actor IS NULL THEN
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    END IF;

    IF current_user = 'authenticated' THEN
      IF TG_OP = 'INSERT'
         AND NEW.designer_id = v_actor
         AND NEW.created_by = v_actor
         AND NEW.client_id IS NULL
         AND NEW.proposal_id IS NULL
      THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    ELSIF current_user IS DISTINCT FROM 'postgres' THEN
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    END IF;

    IF v_reassignment THEN
      IF (v_actor = OLD.designer_id AND v_actor_is_member)
         OR v_actor_is_admin
      THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    END IF;

    IF v_actor_is_member THEN
      RETURN NEW;
    END IF;

    IF v_proposal.id IS NULL
       OR current_setting('app.proposal_activation_id', true)
            IS DISTINCT FROM NEW.proposal_id::text
       OR v_actor IS DISTINCT FROM NEW.client_id
       OR v_proposal.client_id IS DISTINCT FROM NEW.client_id
       OR v_proposal.designer_id IS DISTINCT FROM NEW.designer_id
       OR v_proposal.status IS DISTINCT FROM 'accepted'
       OR v_proposal.project_id IS NOT NULL
    THEN
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    END IF;
  ELSIF v_active_role <> 'service_role' AND NOT v_postgres_migration THEN
    RAISE EXCEPTION 'studio_id_not_designer_studio';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_project_studio_id() IS
  'Invoker trigger derives a missing studio only when the designer has a live designer-domain role and an active non-guest membership in an active design studio, then locks and revalidates the selected authority tuple; zero candidates fails closed, and ambiguity fails closed for every caller except a proposal-backed INSERT inside the exact app.proposal_activation_id bridge, where the studio is resolved from the proposal''s own designer-client relationship (a studio already hosting a project for that pair) and then the 00317 order — owner first, earliest joined, organization_id last (00559). Project id, created_at, and created_by are immutable on UPDATE. Every app/service tuple requires the locked current live lead and exact actor/capability rules; proposal authorship remains immutable history across the exact reassignment path. A true postgres/no-SET-ROLE fixture or owner-maintenance session returns only after best-effort derivation and UPDATE immutability checks.';

-- Grant hygiene, asserted rather than re-granted. 00511 left this function
-- with EXECUTE for its owner alone ({postgres=X/postgres}); a trigger function
-- needs no EXECUTE at fire time (Postgres checks it at CREATE TRIGGER), and
-- CREATE OR REPLACE above preserved the ACL. Asserting keeps this migration
-- free of GRANT/REVOKE, so supabase/seed/00-legacy-grants.sql needs no regen.
-- A PUBLIC grant would light all three roles below, so this covers PUBLIC too.
DO $acl$
DECLARE
  v_holders text;
BEGIN
  SELECT string_agg(r, ', ' ORDER BY r)
  INTO v_holders
  FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r
  WHERE to_regrole(r) IS NOT NULL
    AND has_function_privilege(r, 'public.set_project_studio_id()', 'EXECUTE');

  IF v_holders IS NOT NULL THEN
    RAISE EXCEPTION
      '00559: public.set_project_studio_id() must hold no EXECUTE for app roles (00511 revoked it); found: %',
      v_holders;
  END IF;
END
$acl$;

COMMIT;
