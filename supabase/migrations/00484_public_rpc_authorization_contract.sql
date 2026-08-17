-- ═══════════════════════════════════════════════════════════════════════════
-- 00484 — Public RPC per-request authorization contract
--
-- Lineage:
--   role helpers       00021 / 00240
--   project helpers    00068 / 00087 / 00102 / 00217
--   org ownership      00315 / 00319
--   product search     00008 / 00056
--   decision analytics 00065
--   Agent OS writer    00297 / 00299
--
-- SECURITY DEFINER bypasses RLS. Every directly callable helper below must
-- therefore bind caller-controlled identity arguments back to auth.uid(), and
-- every search/analytics query must carry its scope predicate in SQL. The four
-- PUBLIC policies on storage.objects are owned by supabase_storage_admin and
-- are intentionally narrowed in the privileged 00483 platform-admin phase;
-- this ordinary migration changes only postgres-owned objects.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $preflight$
DECLARE
  required_role text;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '00484 must run as postgres; got %', current_user;
  END IF;

  FOREACH required_role IN ARRAY ARRAY[
    'anon', 'authenticated', 'service_role', 'dashboard_user',
    'agent_reader', 'agent_writer', 'edge_catalog_reader', 'edge_rls_user'
  ]
  LOOP
    IF to_regrole(required_role) IS NULL THEN
      RAISE EXCEPTION '00484 required role % is missing', required_role;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_policy AS policy
    JOIN pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_namespace AS schema ON schema.oid = relation.relnamespace
    WHERE to_regrole('agent_writer')::oid = ANY(policy.polroles)
      AND NOT (
        schema.nspname = 'public'
        AND relation.relname = 'agent_tasks'
        AND policy.polname IN (
          'agent_tasks_select_agent_writer',
          'agent_tasks_insert_agent_writer'
        )
      )
  ) THEN
    RAISE EXCEPTION '00484 found an unreviewed agent_writer policy';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_attribute AS attribute
    CROSS JOIN LATERAL aclexplode(attribute.attacl) AS acl
    WHERE attribute.attrelid = 'public.agent_tasks'::regclass
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND acl.grantee = to_regrole('agent_writer')::oid
  ) THEN
    RAISE EXCEPTION '00484 found an unreviewed agent_writer column grant';
  END IF;
END
$preflight$;

-- These existing routines are executable dependencies of the hardened
-- boundary. Pin their semantics before changing any policy or grant: a
-- matching name is not enough when the call chain runs as postgres.
CREATE TEMP TABLE _00484_dependency_profile (
  signature text PRIMARY KEY,
  language_name text NOT NULL,
  arguments text NOT NULL,
  result_type text NOT NULL,
  volatility "char" NOT NULL,
  security_definer boolean NOT NULL,
  original_config text[],
  final_config text[] NOT NULL,
  original_body_sha256 text NOT NULL,
  final_body_sha256 text NOT NULL
) ON COMMIT DROP;

INSERT INTO _00484_dependency_profile (
  signature, language_name, arguments, result_type, volatility, security_definer,
  original_config, final_config, original_body_sha256, final_body_sha256
)
VALUES
  (
    'public.generate_unique_org_slug(text)', 'plpgsql', 'p_name text',
    'text', 'v', true, ARRAY['search_path=public, pg_temp']::text[],
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    'afeb6cdafc8809609b01da46a3891faecd54ec5d34ed260f895d2c451b7c4036',
    'afeb6cdafc8809609b01da46a3891faecd54ec5d34ed260f895d2c451b7c4036'
  ),
  (
    'public._provision_studio(uuid,text)', 'plpgsql',
    'p_user_id uuid, p_name text', 'organizations', 'v', true,
    ARRAY['search_path=public, pg_temp']::text[],
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    'ac716f9a07315974e7a18a02b55200fe4aa571376b13082b55271bd7fec0eb4e',
    'ac716f9a07315974e7a18a02b55200fe4aa571376b13082b55271bd7fec0eb4e'
  ),
  (
    'public.create_studio_workspace(text)', 'plpgsql', 'p_name text',
    'organizations', 'v', true, ARRAY['search_path=public, pg_temp']::text[],
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    'f5507437ecd304f63b3d574243ac7220a8b0295b11d9821e75e8c2e8f3f84599',
    'f5507437ecd304f63b3d574243ac7220a8b0295b11d9821e75e8c2e8f3f84599'
  ),
  (
    'public._primary_studio_for(uuid)', 'sql', 'p_user uuid', 'uuid', 's', true,
    ARRAY['search_path=public']::text[],
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '6426ab0bd755fd1902056e687741a2c0c1b2c1cf3e1c4a332a0ec766dde266ac',
    '6426ab0bd755fd1902056e687741a2c0c1b2c1cf3e1c4a332a0ec766dde266ac'
  ),
  (
    'public.is_org_owner(uuid,uuid)', 'sql',
    '_organization_id uuid, _user_id uuid DEFAULT auth.uid()',
    'boolean', 's', true, ARRAY['search_path=public']::text[],
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '22d2aa28a5b1e69ee449c8684a3497af2eee0c5358791b0f36754f7a8cc37d10',
    '22d2aa28a5b1e69ee449c8684a3497af2eee0c5358791b0f36754f7a8cc37d10'
  ),
  (
    'public.guard_org_membership_changes()', 'plpgsql', '', 'trigger', 'v', true,
    ARRAY['search_path=public']::text[],
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    'ce30f50457c17294ecf31a5ad873050c051c3f70d97c7e96297041c226461324',
    '137fc04097baf5beba2397edd97726a6c79f26e369900a200ba4caa059ef17cc'
  ),
  (
    'public.transfer_studio_ownership(uuid,uuid)', 'plpgsql',
    'p_org_id uuid, p_new_owner uuid', 'void', 'v', true,
    ARRAY['search_path=public']::text[],
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '9f2ab07e549dfaf778c49f9c925caa84f0b5e893484cc48bfdf3fd61fe6ec824',
    'b65238ed6ff01d284daeaf0198febf8a906a5faaa3259518c6e672b01c4b1d49'
  ),
  (
    'public.agent_tasks_set_updated_at()', 'plpgsql', '', 'trigger', 'v', false,
    NULL,
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '42bbab957ef0446fcfebf4936a8fc1b27986e1a1a3ba349937141bb528507261',
    '42bbab957ef0446fcfebf4936a8fc1b27986e1a1a3ba349937141bb528507261'
  ),
  (
    'public.enforce_agent_task_transition()', 'plpgsql', '', 'trigger', 'v', false,
    NULL,
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '441ca944d5290844cda7dd76c66b559094b540006d3167acdfd7cff7bbb3db40',
    '441ca944d5290844cda7dd76c66b559094b540006d3167acdfd7cff7bbb3db40'
  ),
  (
    'public.agent_task_audit_trigger()', 'plpgsql', '', 'trigger', 'v', true,
    ARRAY['search_path=public']::text[],
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    'bf2cff90cc9ed5d4451110214bea5ad6458003b9e883e8124d1ef771b699ceb3',
    'bf2cff90cc9ed5d4451110214bea5ad6458003b9e883e8124d1ef771b699ceb3'
  ),
  (
    'public.enqueue_agent_task(text,jsonb,text,integer,text,text,uuid,text,timestamp with time zone,integer,text,text,text,uuid,numeric,jsonb,text)',
    'plpgsql',
    'p_task_type text, p_payload jsonb DEFAULT ''{}''::jsonb, p_source text DEFAULT ''manual''::text, p_priority integer DEFAULT 3, p_assignee text DEFAULT NULL::text, p_entity_type text DEFAULT NULL::text, p_entity_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text, p_run_after timestamp with time zone DEFAULT now(), p_max_attempts integer DEFAULT 5, p_on_conflict text DEFAULT ''ignore''::text, p_summary text DEFAULT ''''::text, p_status text DEFAULT ''queued''::text, p_parent_task_id uuid DEFAULT NULL::uuid, p_confidence numeric DEFAULT NULL::numeric, p_artifacts jsonb DEFAULT ''{}''::jsonb, p_actor text DEFAULT NULL::text',
    'agent_tasks', 'v', true, ARRAY['search_path=public']::text[],
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '5393c2644b9a2fc4cb289b2ac696aa6656fdb0aa4bbfba9d080905441a8a5323',
    '5393c2644b9a2fc4cb289b2ac696aa6656fdb0aa4bbfba9d080905441a8a5323'
  );

DO $dependency_preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM _00484_dependency_profile AS expected
    LEFT JOIN pg_proc AS routine
      ON routine.oid = to_regprocedure(expected.signature)
    LEFT JOIN pg_roles AS owner ON owner.oid = routine.proowner
    LEFT JOIN pg_language AS language ON language.oid = routine.prolang
    WHERE routine.oid IS NULL
      OR owner.rolname IS DISTINCT FROM 'postgres'
      OR language.lanname IS DISTINCT FROM expected.language_name
      OR routine.prokind <> 'f'
      OR routine.prosecdef IS DISTINCT FROM expected.security_definer
      OR routine.provolatile IS DISTINCT FROM expected.volatility
      OR routine.proisstrict
      OR routine.proleakproof
      OR routine.proparallel <> 'u'
      OR pg_get_function_arguments(routine.oid)
           IS DISTINCT FROM expected.arguments
      OR pg_get_function_result(routine.oid)
           IS DISTINCT FROM expected.result_type
      OR (
        routine.proconfig IS DISTINCT FROM expected.original_config
        AND routine.proconfig IS DISTINCT FROM expected.final_config
      )
      OR (
        encode(
          extensions.digest(convert_to(routine.prosrc, 'UTF8'), 'sha256'),
          'hex'
        ) IS DISTINCT FROM expected.original_body_sha256
        AND encode(
          extensions.digest(convert_to(routine.prosrc, 'UTF8'), 'sha256'),
          'hex'
        ) IS DISTINCT FROM expected.final_body_sha256
      )
  ) THEN
    RAISE EXCEPTION
      '00484 existing executable dependency profile drifted';
  END IF;

  IF EXISTS (
    WITH expected(relation_name, force_rls) AS (
      VALUES
        ('organization_members', false),
        ('project_documents', false),
        ('project_tasks', false),
        ('project_team_members', false),
        ('project_time_entries', false),
        ('projects', false)
    )
    SELECT 1
    FROM expected
    LEFT JOIN pg_class AS relation
      ON relation.relnamespace = 'public'::regnamespace
     AND relation.relname = expected.relation_name
    LEFT JOIN pg_roles AS owner ON owner.oid = relation.relowner
    WHERE relation.oid IS NULL
      OR relation.relkind <> 'r'
      OR owner.rolname IS DISTINCT FROM 'postgres'
      OR NOT relation.relrowsecurity
      OR relation.relforcerowsecurity IS DISTINCT FROM expected.force_rls
  ) THEN
    RAISE EXCEPTION '00484 protected relation RLS profile drifted';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger_row
    WHERE trigger_row.tgrelid = 'public.organization_members'::regclass
      AND trigger_row.tgname = 'guard_org_membership_changes'
      AND NOT trigger_row.tgisinternal
      AND trigger_row.tgenabled = 'O'
      AND trigger_row.tgfoid =
            to_regprocedure('public.guard_org_membership_changes()')::oid
      AND trigger_row.tgtype = 31
      AND trigger_row.tgnargs = 0
      AND trigger_row.tgqual IS NULL
      AND replace(
            regexp_replace(
              lower(pg_get_triggerdef(trigger_row.oid, false)),
              '\s+', '', 'g'
            ),
            'public.', ''
          ) =
            'createtriggerguard_org_membership_changesbeforeinsertordeleteorupdateonorganization_membersforeachrowexecutefunctionguard_org_membership_changes()'
  ) OR EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger_row
    WHERE trigger_row.tgrelid = 'public.organization_members'::regclass
      AND NOT trigger_row.tgisinternal
      AND trigger_row.tgname <> 'guard_org_membership_changes'
  ) THEN
    RAISE EXCEPTION '00484 organization membership guard trigger drifted';
  END IF;

  IF EXISTS (
    WITH expected(
      trigger_name, function_name, trigger_type, enabled_state, definition
    ) AS (
      VALUES
        (
          'trg_agent_tasks_updated_at', 'agent_tasks_set_updated_at()',
          19::smallint, 'O'::"char",
          'createtriggertrg_agent_tasks_updated_atbeforeupdateonagent_tasksforeachrowexecutefunctionagent_tasks_set_updated_at()'
        ),
        (
          'trg_agent_tasks_transition', 'enforce_agent_task_transition()',
          19::smallint, 'O'::"char",
          'createtriggertrg_agent_tasks_transitionbeforeupdateofstatusonagent_tasksforeachrowexecutefunctionenforce_agent_task_transition()'
        ),
        (
          'trg_agent_tasks_audit', 'agent_task_audit_trigger()',
          29::smallint, 'O'::"char",
          'createtriggertrg_agent_tasks_auditafterinsertordeleteorupdateonagent_tasksforeachrowexecutefunctionagent_task_audit_trigger()'
        )
    ),
    actual AS (
      SELECT
        trigger_row.tgname,
        replace(
          regexp_replace(
            lower(trigger_row.tgfoid::regprocedure::text), '\s+', '', 'g'
          ),
          'public.', ''
        ),
        trigger_row.tgtype,
        trigger_row.tgenabled,
        replace(
          regexp_replace(
            lower(pg_get_triggerdef(trigger_row.oid, false)),
            '\s+', '', 'g'
          ),
          'public.', ''
        )
      FROM pg_trigger AS trigger_row
      WHERE trigger_row.tgrelid = 'public.agent_tasks'::regclass
        AND NOT trigger_row.tgisinternal
    )
    SELECT 1 FROM (
      (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)
      UNION ALL
      (SELECT * FROM actual EXCEPT ALL SELECT * FROM expected)
    ) AS drift
  ) THEN
    RAISE EXCEPTION '00484 agent_tasks trigger manifest drifted';
  END IF;
END
$dependency_preflight$;

-- Normalize trusted paths without changing the pinned function bodies.
ALTER FUNCTION public.generate_unique_org_slug(text) RESET ALL;
ALTER FUNCTION public.generate_unique_org_slug(text)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public._provision_studio(uuid, text) RESET ALL;
ALTER FUNCTION public._provision_studio(uuid, text)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.create_studio_workspace(text) RESET ALL;
ALTER FUNCTION public.create_studio_workspace(text)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public._primary_studio_for(uuid) RESET ALL;
ALTER FUNCTION public._primary_studio_for(uuid)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.is_org_owner(uuid, uuid) RESET ALL;
ALTER FUNCTION public.is_org_owner(uuid, uuid)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.guard_org_membership_changes() RESET ALL;
ALTER FUNCTION public.guard_org_membership_changes()
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.transfer_studio_ownership(uuid, uuid) RESET ALL;
ALTER FUNCTION public.transfer_studio_ownership(uuid, uuid)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.agent_tasks_set_updated_at() RESET ALL;
ALTER FUNCTION public.agent_tasks_set_updated_at()
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.enforce_agent_task_transition() RESET ALL;
ALTER FUNCTION public.enforce_agent_task_transition()
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.agent_task_audit_trigger() RESET ALL;
ALTER FUNCTION public.agent_task_audit_trigger()
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.enqueue_agent_task(
  text, jsonb, text, integer, text, text, uuid, text,
  timestamp with time zone, integer, text, text, text, uuid, numeric, jsonb, text
) RESET ALL;
ALTER FUNCTION public.enqueue_agent_task(
  text, jsonb, text, integer, text, text, uuid, text,
  timestamp with time zone, integer, text, text, text, uuid, numeric, jsonb, text
) SET search_path = pg_catalog, public, pg_temp;

-- The owner-transition trigger is the write-side complement to the RLS
-- policies below. JWT role claims are identity input only; the privileged
-- service bypass is tied to the active database role, and membership identity
-- keys cannot be rewritten in place by any caller.
CREATE OR REPLACE FUNCTION public.guard_org_membership_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_remaining integer;
BEGIN
  IF TG_OP = 'UPDATE'
     AND (
       NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
     ) THEN
    RAISE EXCEPTION 'membership_identity_immutable';
  END IF;

  IF (TG_OP = 'INSERT' AND NEW.role = 'owner')
     OR (TG_OP = 'UPDATE' AND (OLD.role = 'owner' OR NEW.role = 'owner'))
     OR (TG_OP = 'DELETE' AND OLD.role = 'owner') THEN
    PERFORM 1
    FROM public.organizations AS organization
    WHERE organization.id = CASE
      WHEN TG_OP = 'DELETE' THEN OLD.organization_id
      ELSE NEW.organization_id
    END
    FOR UPDATE;
  END IF;

  IF current_setting('role', true) = 'service_role' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.role = 'owner' THEN
    IF NOT public.is_org_owner(NEW.organization_id, v_actor)
       AND (
         NEW.status <> 'active'
         OR EXISTS (
           SELECT 1
           FROM public.organization_members AS membership
           WHERE membership.organization_id = NEW.organization_id
         )
       ) THEN
      RAISE EXCEPTION 'owner_insert_requires_owner';
    END IF;
  END IF;

  IF OLD.role = 'owner'
     AND OLD.status = 'active'
     AND (
       TG_OP = 'DELETE'
       OR NOT (NEW.role = 'owner' AND NEW.status = 'active')
     ) THEN
    SELECT count(*)
    INTO v_remaining
    FROM public.organization_members AS membership
    WHERE membership.organization_id = OLD.organization_id
      AND membership.role = 'owner'
      AND membership.status = 'active'
      AND membership.id <> OLD.id;

    IF v_remaining = 0 THEN
      RAISE EXCEPTION 'last_owner_protected';
    END IF;
    IF NOT public.is_org_owner(OLD.organization_id, v_actor) THEN
      RAISE EXCEPTION 'owner_change_requires_owner';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.role = 'owner'
     AND NEW.status = 'active'
     AND NOT (OLD.role = 'owner' AND OLD.status = 'active')
     AND NOT public.is_org_owner(NEW.organization_id, v_actor) THEN
    RAISE EXCEPTION 'owner_promotion_requires_owner';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

COMMENT ON FUNCTION public.guard_org_membership_changes() IS
  'Protects organization ownership transitions. Membership user/org keys are immutable, first-owner bootstrap requires an otherwise empty organization, every later transition into or out of active ownership is owner-authorized, the last owner is preserved, and only the active service_role database role bypasses owner-transition checks.';

-- Authenticated table policies below cannot touch owner rows. This is the sole
-- owner-transition entry point: serialize on the organization row before any
-- membership read or mutation, then promote-before-demote under definer rights.
CREATE OR REPLACE FUNCTION public.transfer_studio_ownership(
  p_org_id uuid,
  p_new_owner uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_target_member_id uuid;
  v_affected_rows integer;
BEGIN
  PERFORM 1
  FROM public.organizations AS organization
  WHERE organization.id = p_org_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public.is_org_owner(p_org_id, v_actor) THEN
    RAISE EXCEPTION 'not_owner';
  END IF;

  IF p_new_owner IS NOT DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'target_not_active_member';
  END IF;

  SELECT membership.id
  INTO v_target_member_id
    FROM public.organization_members AS membership
    WHERE membership.organization_id = p_org_id
      AND membership.user_id = p_new_owner
      AND membership.status = 'active'
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target_not_active_member';
  END IF;

  UPDATE public.organization_members
  SET role = 'owner',
      updated_at = now()
  WHERE id = v_target_member_id
    AND organization_id = p_org_id
    AND user_id = p_new_owner
    AND status = 'active';

  GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
  IF v_affected_rows <> 1 OR NOT EXISTS (
    SELECT 1
    FROM public.organization_members AS membership
    WHERE membership.id = v_target_member_id
      AND membership.organization_id = p_org_id
      AND membership.user_id = p_new_owner
      AND membership.role = 'owner'
      AND membership.status = 'active'
  ) THEN
    RAISE EXCEPTION 'target_not_active_member';
  END IF;

  UPDATE public.organization_members
  SET role = 'admin',
      updated_at = now()
  WHERE organization_id = p_org_id
    AND user_id = v_actor
    AND status = 'active'
    AND role = 'owner';

  GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
  IF v_affected_rows <> 1 THEN
    RAISE EXCEPTION 'not_owner';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.transfer_studio_ownership(uuid, uuid) IS
  'Owner-only serialized ownership transfer. Locks the organization and exact active target membership, verifies a one-row promotion, then demotes auth.uid().';

-- Caller-supplied UUIDs are compatibility arguments, never authority.
CREATE OR REPLACE FUNCTION public.is_comms_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
     AND p_user_id IS NOT DISTINCT FROM auth.uid()
     AND EXISTS (
       SELECT 1
       FROM public.user_roles AS user_role
       JOIN public.roles AS role_row ON role_row.id = user_role.role_id
       WHERE user_role.user_id = auth.uid()
         AND role_row.domain::text = 'admin'
     );
$$;

COMMENT ON FUNCTION public.is_comms_admin(uuid) IS
  'True only when the current auth.uid() matches the compatibility UUID and holds a canonical current user_roles role in the admin domain. Legacy profiles.role is never an authorization source.';

CREATE OR REPLACE FUNCTION public.is_comms_thread_participant(
  p_thread_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
     AND p_user_id IS NOT DISTINCT FROM auth.uid()
     AND EXISTS (
       SELECT 1
       FROM public.comms_thread_participants AS participant
       WHERE participant.thread_id = p_thread_id
         AND participant.profile_id = auth.uid()
         AND participant.left_at IS NULL
     );
$$;

CREATE OR REPLACE FUNCTION public.is_coordination_party(
  _project_id uuid,
  _user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
     AND _user_id IS NOT DISTINCT FROM auth.uid()
     AND EXISTS (
       SELECT 1
       FROM public.project_parties AS party
       WHERE party.project_id = _project_id
         AND party.profile_id = auth.uid()
     );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin_or_owner(
  _organization_id uuid,
  _user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
     AND _user_id IS NOT DISTINCT FROM auth.uid()
     AND EXISTS (
       SELECT 1
       FROM public.organization_members AS membership
       WHERE membership.organization_id = _organization_id
         AND membership.user_id = auth.uid()
         AND membership.role IN ('owner', 'admin')
         AND membership.status = 'active'
     );
$$;

CREATE OR REPLACE FUNCTION public.is_project_team_member(
  _project_id uuid,
  _user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
     AND _user_id IS NOT DISTINCT FROM auth.uid()
     AND EXISTS (
       SELECT 1
       FROM public.project_team_members AS team_member
       WHERE team_member.project_id = _project_id
         AND team_member.user_id = auth.uid()
         AND team_member.removed_at IS NULL
     );
$$;

CREATE OR REPLACE FUNCTION public.user_has_role_domain(
  p_user_id uuid,
  p_domain varchar
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles AS user_role
    JOIN public.roles AS role_row ON role_row.id = user_role.role_id
    WHERE user_role.user_id = auth.uid()
      AND role_row.domain::text = p_domain
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.user_has_role(
  p_user_id uuid,
  p_role_name varchar
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles AS user_role
    JOIN public.roles AS role_row ON role_row.id = user_role.role_id
    WHERE user_role.user_id = auth.uid()
      AND role_row.name = p_role_name
  );
END;
$$;

-- These policies previously omitted TO and therefore applied to PUBLIC.
-- Recreate their complete canonical predicates so same-name policy drift cannot
-- turn a role-list narrowing into a false green.
DROP POLICY "Org admins can delete members" ON public.organization_members;
CREATE POLICY "Org admins can delete members"
  ON public.organization_members FOR DELETE TO authenticated
  USING (
    public.is_org_admin_or_owner(organization_id)
    AND role <> 'owner'
  );

DROP POLICY "Members can leave" ON public.organization_members;
CREATE POLICY "Members can leave"
  ON public.organization_members FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    AND role <> 'owner'
  );

DROP POLICY "Org admins can update members" ON public.organization_members;
CREATE POLICY "Org admins can update members"
  ON public.organization_members FOR UPDATE TO authenticated
  USING (
    public.is_org_admin_or_owner(organization_id)
    AND role <> 'owner'
  )
  WITH CHECK (
    public.is_org_admin_or_owner(organization_id)
    AND role <> 'owner'
  );

DROP POLICY "Org admins can view all members" ON public.organization_members;
CREATE POLICY "Org admins can view all members"
  ON public.organization_members FOR SELECT TO authenticated
  USING (public.is_org_admin_or_owner(organization_id));

DROP POLICY "Org owners can insert members" ON public.organization_members;
CREATE POLICY "Org owners can insert members"
  ON public.organization_members FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_admin_or_owner(organization_id)
    AND role <> 'owner'
  );

-- Organization + initial-owner creation already has an auth.uid-bound,
-- atomic SECURITY DEFINER entry point (create_studio_workspace). Raw INSERT
-- can otherwise create orphan organizations before any membership exists.
DROP POLICY IF EXISTS "Authenticated can create organization" ON public.organizations;
REVOKE INSERT ON TABLE public.organizations FROM authenticated;

DO $organization_column_acl$
DECLARE
  column_name text;
BEGIN
  FOR column_name IN
    SELECT attribute.attname
    FROM pg_attribute AS attribute
    WHERE attribute.attrelid = 'public.organizations'::regclass
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
  LOOP
    EXECUTE format(
      'REVOKE INSERT (%I) ON TABLE public.organizations '
      'FROM PUBLIC, authenticated CASCADE',
      column_name
    );
  END LOOP;
END
$organization_column_acl$;

DROP POLICY "Team can view their project documents" ON public.project_documents;
CREATE POLICY "Team can view their project documents"
  ON public.project_documents FOR SELECT TO authenticated
  USING (public.is_project_team_member(project_id));

DROP POLICY "Team can view their project tasks" ON public.project_tasks;
CREATE POLICY "Team can view their project tasks"
  ON public.project_tasks FOR SELECT TO authenticated
  USING (public.is_project_team_member(project_id));

DROP POLICY "Team members can view project membership"
  ON public.project_team_members;
CREATE POLICY "Team members can view project membership"
  ON public.project_team_members FOR SELECT TO authenticated
  USING (public.is_project_team_member(project_id));

DROP POLICY "Team can delete their own time entries"
  ON public.project_time_entries;
CREATE POLICY "Team can delete their own time entries"
  ON public.project_time_entries FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.is_project_team_member(project_id)
  );

DROP POLICY "Team can log their own time entries"
  ON public.project_time_entries;
CREATE POLICY "Team can log their own time entries"
  ON public.project_time_entries FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_project_team_member(project_id)
  );

DROP POLICY "Team can update their own time entries"
  ON public.project_time_entries;
CREATE POLICY "Team can update their own time entries"
  ON public.project_time_entries FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.is_project_team_member(project_id)
  );

DROP POLICY "Team can view their project time entries"
  ON public.project_time_entries;
CREATE POLICY "Team can view their project time entries"
  ON public.project_time_entries FOR SELECT TO authenticated
  USING (public.is_project_team_member(project_id));

DROP POLICY "Project participants can view projects" ON public.projects;
CREATE POLICY "Project participants can view projects"
  ON public.projects FOR SELECT TO authenticated
  USING (
    designer_id = auth.uid()
    OR client_id = auth.uid()
    OR public.is_project_team_member(id)
  );

-- Similarity source IDs and result rows share the public catalog predicate.
CREATE OR REPLACE FUNCTION public.find_products_similar_to(
  product_id uuid,
  match_count integer DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  name text,
  images text[],
  price_retail integer,
  similarity float
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  product_embedding public.vector(768);
  bounded_match_count integer := LEAST(
    50,
    GREATEST(0, COALESCE(match_count, 10))
  );
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  SELECT product.embedding
  INTO product_embedding
  FROM public.products AS product
  WHERE product.id = product_id
    AND product.layer = 'catalog'
    AND product.status = 'published';

  IF product_embedding IS NULL OR bounded_match_count = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    product.id,
    product.name,
    product.images,
    product.price_retail,
    1 - (product.embedding OPERATOR(public.<=>) product_embedding)
  FROM public.products AS product
  WHERE product.layer = 'catalog'
    AND product.status = 'published'
    AND product.embedding IS NOT NULL
    AND product.id <> product_id
    AND 1 - (product.embedding OPERATOR(public.<=>) product_embedding) > 0.5
  ORDER BY product.embedding OPERATOR(public.<=>) product_embedding
  LIMIT bounded_match_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.find_products_for_style(
  style_id uuid,
  match_count integer DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  name text,
  images text[],
  price_retail integer,
  similarity float
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  style_embedding public.vector(768);
  bounded_match_count integer := LEAST(
    50,
    GREATEST(0, COALESCE(match_count, 20))
  );
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  SELECT style.embedding
  INTO style_embedding
  FROM public.styles AS style
  WHERE style.id = style_id;

  IF style_embedding IS NULL OR bounded_match_count = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    product.id,
    product.name,
    product.images,
    product.price_retail,
    1 - (product.embedding OPERATOR(public.<=>) style_embedding)
  FROM public.products AS product
  WHERE product.layer = 'catalog'
    AND product.status = 'published'
    AND product.embedding IS NOT NULL
  ORDER BY product.embedding OPERATOR(public.<=>) style_embedding
  LIMIT bounded_match_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_products(
  search_query text DEFAULT NULL,
  category_filter text DEFAULT NULL,
  min_price integer DEFAULT NULL,
  max_price integer DEFAULT NULL,
  style_filter text DEFAULT NULL,
  sort_by text DEFAULT 'relevance',
  page_size integer DEFAULT 20,
  page_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  images text[],
  price_retail integer,
  materials text[],
  vendor_name text,
  style_names text[],
  relevance_score real
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  bounded_page_size integer := LEAST(
    100,
    GREATEST(0, COALESCE(page_size, 20))
  );
  bounded_page_offset integer := LEAST(
    100000,
    GREATEST(0, COALESCE(page_offset, 0))
  );
BEGIN
  IF auth.uid() IS NULL OR bounded_page_size = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    product.id,
    product.name,
    product.description,
    product.images,
    product.price_retail,
    product.materials,
    vendor.name AS vendor_name,
    COALESCE(
      array_agg(DISTINCT style.name) FILTER (WHERE style.name IS NOT NULL),
      '{}'::text[]
    ) AS style_names,
    CASE
      WHEN search_query IS NOT NULL AND search_query <> '' THEN
        ts_rank(product.search_vector, plainto_tsquery('english', search_query))
      ELSE 1.0
    END::real AS relevance_score
  FROM public.products AS product
  LEFT JOIN public.vendors AS vendor ON vendor.id = product.vendor_id
  LEFT JOIN public.product_styles AS product_style
    ON product_style.product_id = product.id
  LEFT JOIN public.styles AS style ON style.id = product_style.style_id
  WHERE product.layer = 'catalog'
    AND product.status = 'published'
    AND (
      category_filter IS NULL
      OR category_filter = ''
      OR product.category ILIKE category_filter
    )
    AND (
      search_query IS NULL
      OR search_query = ''
      OR product.search_vector @@ plainto_tsquery('english', search_query)
      OR product.name ILIKE '%' || search_query || '%'
    )
    AND (min_price IS NULL OR product.price_retail >= min_price)
    AND (max_price IS NULL OR product.price_retail <= max_price)
    AND (
      style_filter IS NULL
      OR style_filter = ''
      OR EXISTS (
        SELECT 1
        FROM public.product_styles AS filtered_product_style
        JOIN public.styles AS filtered_style
          ON filtered_style.id = filtered_product_style.style_id
        WHERE filtered_product_style.product_id = product.id
          AND filtered_style.name ILIKE style_filter
      )
    )
  GROUP BY
    product.id, product.name, product.description, product.images,
    product.price_retail, product.materials, vendor.name,
    product.search_vector, product.created_at
  ORDER BY
    CASE
      WHEN sort_by = 'relevance'
       AND search_query IS NOT NULL
       AND search_query <> ''
      THEN ts_rank(product.search_vector, plainto_tsquery('english', search_query))
    END DESC NULLS LAST,
    CASE WHEN sort_by = 'price_asc' THEN product.price_retail END ASC NULLS LAST,
    CASE WHEN sort_by = 'price_desc' THEN product.price_retail END DESC NULLS LAST,
    CASE
      WHEN sort_by = 'newest' OR sort_by = 'relevance'
      THEN extract(epoch FROM product.created_at)
    END DESC NULLS LAST
  LIMIT bounded_page_size
  OFFSET bounded_page_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_decision_analytics_by_type(
  p_designer_id uuid
)
RETURNS TABLE (
  decision_type text,
  total_count bigint,
  responded_count bigint,
  avg_response_hours numeric,
  on_time_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT
    decision.decision_type,
    count(*)::bigint AS total_count,
    count(*) FILTER (WHERE decision.status = 'responded')::bigint,
    COALESCE(
      avg(extract(epoch FROM (decision.responded_at - decision.sent_at)) / 3600)
        FILTER (
          WHERE decision.status = 'responded'
            AND decision.sent_at IS NOT NULL
            AND decision.responded_at IS NOT NULL
        ),
      0
    )::numeric AS avg_response_hours,
    count(*) FILTER (
      WHERE decision.status = 'responded'
        AND decision.due_date IS NOT NULL
        AND decision.responded_at <= decision.due_date
    )::bigint AS on_time_count
  FROM public.client_decisions AS decision
  WHERE auth.uid() IS NOT NULL
    AND p_designer_id IS NOT DISTINCT FROM auth.uid()
    AND decision.designer_id = auth.uid()
    AND decision.status <> 'draft'
  GROUP BY decision.decision_type
  ORDER BY avg_response_hours DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_decision_analytics_by_client(
  p_designer_id uuid
)
RETURNS TABLE (
  designer_client_id uuid,
  client_name text,
  total_count bigint,
  responded_count bigint,
  avg_response_hours numeric,
  on_time_rate numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT
    decision.designer_client_id,
    COALESCE(
      profile.full_name,
      relationship.client_name,
      relationship.client_email,
      'Unknown'
    ) AS client_name,
    count(*)::bigint AS total_count,
    count(*) FILTER (WHERE decision.status = 'responded')::bigint,
    COALESCE(
      avg(extract(epoch FROM (decision.responded_at - decision.sent_at)) / 3600)
        FILTER (
          WHERE decision.status = 'responded'
            AND decision.sent_at IS NOT NULL
            AND decision.responded_at IS NOT NULL
        ),
      0
    )::numeric AS avg_response_hours,
    CASE
      WHEN count(*) FILTER (
        WHERE decision.status = 'responded'
          AND decision.due_date IS NOT NULL
      ) = 0 THEN 100
      ELSE (
        count(*) FILTER (
          WHERE decision.status = 'responded'
            AND decision.due_date IS NOT NULL
            AND decision.responded_at <= decision.due_date
        )::numeric
        / count(*) FILTER (
          WHERE decision.status = 'responded'
            AND decision.due_date IS NOT NULL
        )::numeric
        * 100
      )
    END AS on_time_rate
  FROM public.client_decisions AS decision
  JOIN public.designer_clients AS relationship
    ON relationship.id = decision.designer_client_id
  LEFT JOIN public.profiles AS profile ON profile.id = relationship.client_id
  WHERE auth.uid() IS NOT NULL
    AND p_designer_id IS NOT DISTINCT FROM auth.uid()
    AND decision.designer_id = auth.uid()
    AND decision.status <> 'draft'
  GROUP BY
    decision.designer_client_id,
    profile.full_name,
    relationship.client_name,
    relationship.client_email
  ORDER BY avg_response_hours DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_decision_bottleneck_phases(
  p_designer_id uuid
)
RETURNS TABLE (
  linked_phase text,
  total_count bigint,
  overdue_count bigint,
  avg_response_hours numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT
    COALESCE(decision.linked_phase, 'Unlinked') AS linked_phase,
    count(*)::bigint AS total_count,
    count(*) FILTER (
      WHERE decision.status = 'pending'
        AND decision.due_date IS NOT NULL
        AND decision.due_date < now()
    )::bigint AS overdue_count,
    COALESCE(
      avg(extract(epoch FROM (decision.responded_at - decision.sent_at)) / 3600)
        FILTER (
          WHERE decision.status = 'responded'
            AND decision.sent_at IS NOT NULL
            AND decision.responded_at IS NOT NULL
        ),
      0
    )::numeric AS avg_response_hours
  FROM public.client_decisions AS decision
  WHERE auth.uid() IS NOT NULL
    AND p_designer_id IS NOT DISTINCT FROM auth.uid()
    AND decision.designer_id = auth.uid()
    AND decision.status <> 'draft'
  GROUP BY COALESCE(decision.linked_phase, 'Unlinked')
  ORDER BY overdue_count DESC, avg_response_hours DESC;
$$;

-- Exact direct caller contract for the thirteen protected public RPCs and the
-- existing definers on which workspace provisioning and Agent writes depend.
DO $rpc_acl$
DECLARE
  routine_oid oid;
  grantee_name text;
BEGIN
  FOREACH routine_oid IN ARRAY ARRAY[
    to_regprocedure('public.is_comms_admin(uuid)')::oid,
    to_regprocedure('public.is_comms_thread_participant(uuid,uuid)')::oid,
    to_regprocedure('public.is_coordination_party(uuid,uuid)')::oid,
    to_regprocedure('public.is_org_admin_or_owner(uuid,uuid)')::oid,
    to_regprocedure('public.is_project_team_member(uuid,uuid)')::oid,
    to_regprocedure('public.user_has_role_domain(uuid,character varying)')::oid,
    to_regprocedure('public.user_has_role(uuid,character varying)')::oid,
    to_regprocedure('public.find_products_similar_to(uuid,integer)')::oid,
    to_regprocedure('public.find_products_for_style(uuid,integer)')::oid,
    to_regprocedure('public.search_products(text,text,integer,integer,text,text,integer,integer)')::oid,
    to_regprocedure('public.get_decision_analytics_by_type(uuid)')::oid,
    to_regprocedure('public.get_decision_analytics_by_client(uuid)')::oid,
    to_regprocedure('public.get_decision_bottleneck_phases(uuid)')::oid,
    to_regprocedure('public.generate_unique_org_slug(text)')::oid,
    to_regprocedure('public._provision_studio(uuid,text)')::oid,
    to_regprocedure('public.create_studio_workspace(text)')::oid,
    to_regprocedure('public._primary_studio_for(uuid)')::oid,
    to_regprocedure('public.is_org_owner(uuid,uuid)')::oid,
    to_regprocedure('public.guard_org_membership_changes()')::oid,
    to_regprocedure('public.transfer_studio_ownership(uuid,uuid)')::oid,
    to_regprocedure('public.agent_tasks_set_updated_at()')::oid,
    to_regprocedure('public.enforce_agent_task_transition()')::oid,
    to_regprocedure('public.agent_task_audit_trigger()')::oid,
    to_regprocedure(
      'public.enqueue_agent_task(text,jsonb,text,integer,text,text,uuid,text,timestamp with time zone,integer,text,text,text,uuid,numeric,jsonb,text)'
    )::oid
  ]
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON ROUTINE %s FROM PUBLIC CASCADE',
      routine_oid::regprocedure
    );

    FOR grantee_name IN
      SELECT DISTINCT grantee.rolname
      FROM pg_proc AS routine
      CROSS JOIN LATERAL aclexplode(
        COALESCE(routine.proacl, acldefault('f', routine.proowner))
      ) AS acl
      JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
      WHERE routine.oid = routine_oid
        AND acl.grantee <> routine.proowner
        AND acl.privilege_type = 'EXECUTE'
    LOOP
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON ROUTINE %s FROM %I CASCADE',
        routine_oid::regprocedure,
        grantee_name
      );
    END LOOP;
  END LOOP;
END
$rpc_acl$;

-- Keep the exact app-role reset top-level: the generated local ACL seed
-- replays top-level GRANT/REVOKE statements after all migrations.
REVOKE ALL PRIVILEGES ON FUNCTION
  public.is_comms_admin(uuid),
  public.is_comms_thread_participant(uuid, uuid),
  public.is_coordination_party(uuid, uuid),
  public.is_org_admin_or_owner(uuid, uuid),
  public.is_project_team_member(uuid, uuid),
  public.user_has_role_domain(uuid, varchar),
  public.user_has_role(uuid, varchar),
  public.find_products_similar_to(uuid, integer),
  public.find_products_for_style(uuid, integer),
  public.search_products(text, text, integer, integer, text, text, integer, integer),
  public.get_decision_analytics_by_type(uuid),
  public.get_decision_analytics_by_client(uuid),
  public.get_decision_bottleneck_phases(uuid),
  public.generate_unique_org_slug(text),
  public._provision_studio(uuid, text),
  public.create_studio_workspace(text),
  public._primary_studio_for(uuid),
  public.is_org_owner(uuid, uuid),
  public.guard_org_membership_changes(),
  public.transfer_studio_ownership(uuid, uuid),
  public.agent_tasks_set_updated_at(),
  public.enforce_agent_task_transition(),
  public.agent_task_audit_trigger(),
  public.enqueue_agent_task(
    text, jsonb, text, integer, text, text, uuid, text,
    timestamp with time zone, integer, text, text, text, uuid, numeric, jsonb, text
  )
FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
     agent_reader, agent_writer, edge_catalog_reader, edge_rls_user
CASCADE;

GRANT EXECUTE ON FUNCTION
  public.is_comms_admin(uuid),
  public.is_comms_thread_participant(uuid, uuid),
  public.is_coordination_party(uuid, uuid),
  public.is_org_admin_or_owner(uuid, uuid),
  public.is_project_team_member(uuid, uuid),
  public.user_has_role_domain(uuid, varchar),
  public.user_has_role(uuid, varchar),
  public.find_products_similar_to(uuid, integer),
  public.find_products_for_style(uuid, integer),
  public.search_products(text, text, integer, integer, text, text, integer, integer),
  public.get_decision_analytics_by_type(uuid),
  public.get_decision_analytics_by_client(uuid),
  public.get_decision_bottleneck_phases(uuid)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_studio_workspace(text)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.transfer_studio_ownership(uuid, uuid)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_agent_task(
  text, jsonb, text, integer, text, text, uuid, text,
  timestamp with time zone, integer, text, text, text, uuid, numeric, jsonb, text
) TO service_role, agent_writer;

-- Agent writes must cross the audited definer RPC, never table RLS directly.
REVOKE ALL PRIVILEGES ON TABLE public.agent_tasks FROM agent_writer;
DROP POLICY IF EXISTS agent_tasks_select_agent_writer ON public.agent_tasks;
DROP POLICY IF EXISTS agent_tasks_insert_agent_writer ON public.agent_tasks;

DO $postconditions$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM _00484_dependency_profile AS expected
    LEFT JOIN pg_proc AS routine
      ON routine.oid = to_regprocedure(expected.signature)
    LEFT JOIN pg_roles AS owner ON owner.oid = routine.proowner
    LEFT JOIN pg_language AS language ON language.oid = routine.prolang
    WHERE routine.oid IS NULL
      OR owner.rolname IS DISTINCT FROM 'postgres'
      OR language.lanname IS DISTINCT FROM expected.language_name
      OR routine.prokind <> 'f'
      OR routine.prosecdef IS DISTINCT FROM expected.security_definer
      OR routine.provolatile IS DISTINCT FROM expected.volatility
      OR routine.proisstrict
      OR routine.proleakproof
      OR routine.proparallel <> 'u'
      OR routine.proconfig IS DISTINCT FROM expected.final_config
      OR pg_get_function_arguments(routine.oid)
           IS DISTINCT FROM expected.arguments
      OR pg_get_function_result(routine.oid)
           IS DISTINCT FROM expected.result_type
      OR encode(
           extensions.digest(convert_to(routine.prosrc, 'UTF8'), 'sha256'),
           'hex'
         ) IS DISTINCT FROM expected.final_body_sha256
  ) THEN
    RAISE EXCEPTION
      '00484 executable dependency final profile is wrong';
  END IF;

  IF EXISTS (
    WITH expected(signature, grantee, grantor, privilege_type, is_grantable) AS (
      VALUES
        (
          'public.create_studio_workspace(text)',
          'authenticated', 'postgres', 'EXECUTE', false
        ),
        (
          'public.transfer_studio_ownership(uuid,uuid)',
          'authenticated', 'postgres', 'EXECUTE', false
        ),
        (
          'public.enqueue_agent_task(text,jsonb,text,integer,text,text,uuid,text,timestamp with time zone,integer,text,text,text,uuid,numeric,jsonb,text)',
          'service_role', 'postgres', 'EXECUTE', false
        ),
        (
          'public.enqueue_agent_task(text,jsonb,text,integer,text,text,uuid,text,timestamp with time zone,integer,text,text,text,uuid,numeric,jsonb,text)',
          'agent_writer', 'postgres', 'EXECUTE', false
        )
    ),
    actual AS (
      SELECT
        profile.signature,
        CASE acl.grantee
          WHEN 0 THEN 'PUBLIC'
          ELSE grantee.rolname::text
        END AS grantee,
        grantor.rolname::text AS grantor,
        acl.privilege_type,
        acl.is_grantable
      FROM _00484_dependency_profile AS profile
      JOIN pg_proc AS routine
        ON routine.oid = to_regprocedure(profile.signature)
      CROSS JOIN LATERAL aclexplode(
        COALESCE(routine.proacl, acldefault('f', routine.proowner))
      ) AS acl
      LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
      JOIN pg_roles AS grantor ON grantor.oid = acl.grantor
      WHERE acl.grantee <> routine.proowner
    )
    SELECT 1
    FROM (
      (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)
      UNION ALL
      (SELECT * FROM actual EXCEPT ALL SELECT * FROM expected)
    ) AS drift
  ) THEN
    RAISE EXCEPTION
      '00484 executable dependency direct ACL contract is wrong';
  END IF;

  IF EXISTS (
    WITH expected(relation_name, force_rls) AS (
      VALUES
        ('organization_members', false),
        ('project_documents', false),
        ('project_tasks', false),
        ('project_team_members', false),
        ('project_time_entries', false),
        ('projects', false)
    )
    SELECT 1
    FROM expected
    LEFT JOIN pg_class AS relation
      ON relation.relnamespace = 'public'::regnamespace
     AND relation.relname = expected.relation_name
    LEFT JOIN pg_roles AS owner ON owner.oid = relation.relowner
    WHERE relation.oid IS NULL
      OR relation.relkind <> 'r'
      OR owner.rolname IS DISTINCT FROM 'postgres'
      OR NOT relation.relrowsecurity
      OR relation.relforcerowsecurity IS DISTINCT FROM expected.force_rls
  ) THEN
    RAISE EXCEPTION '00484 protected relation RLS profile is wrong';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger_row
    WHERE trigger_row.tgrelid = 'public.organization_members'::regclass
      AND trigger_row.tgname = 'guard_org_membership_changes'
      AND NOT trigger_row.tgisinternal
      AND trigger_row.tgenabled = 'O'
      AND trigger_row.tgfoid =
            to_regprocedure('public.guard_org_membership_changes()')::oid
      AND trigger_row.tgtype = 31
      AND trigger_row.tgnargs = 0
      AND trigger_row.tgqual IS NULL
      AND replace(
            regexp_replace(
              lower(pg_get_triggerdef(trigger_row.oid, false)),
              '\s+', '', 'g'
            ),
            'public.', ''
          ) =
            'createtriggerguard_org_membership_changesbeforeinsertordeleteorupdateonorganization_membersforeachrowexecutefunctionguard_org_membership_changes()'
  ) OR EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger_row
    WHERE trigger_row.tgrelid = 'public.organization_members'::regclass
      AND NOT trigger_row.tgisinternal
      AND trigger_row.tgname <> 'guard_org_membership_changes'
  ) THEN
    RAISE EXCEPTION '00484 organization membership guard trigger is wrong';
  END IF;

  IF EXISTS (
    WITH expected(
      trigger_name, function_name, trigger_type, enabled_state, definition
    ) AS (
      VALUES
        (
          'trg_agent_tasks_updated_at', 'agent_tasks_set_updated_at()',
          19::smallint, 'O'::"char",
          'createtriggertrg_agent_tasks_updated_atbeforeupdateonagent_tasksforeachrowexecutefunctionagent_tasks_set_updated_at()'
        ),
        (
          'trg_agent_tasks_transition', 'enforce_agent_task_transition()',
          19::smallint, 'O'::"char",
          'createtriggertrg_agent_tasks_transitionbeforeupdateofstatusonagent_tasksforeachrowexecutefunctionenforce_agent_task_transition()'
        ),
        (
          'trg_agent_tasks_audit', 'agent_task_audit_trigger()',
          29::smallint, 'O'::"char",
          'createtriggertrg_agent_tasks_auditafterinsertordeleteorupdateonagent_tasksforeachrowexecutefunctionagent_task_audit_trigger()'
        )
    ),
    actual AS (
      SELECT
        trigger_row.tgname,
        replace(
          regexp_replace(
            lower(trigger_row.tgfoid::regprocedure::text), '\s+', '', 'g'
          ),
          'public.', ''
        ),
        trigger_row.tgtype,
        trigger_row.tgenabled,
        replace(
          regexp_replace(
            lower(pg_get_triggerdef(trigger_row.oid, false)),
            '\s+', '', 'g'
          ),
          'public.', ''
        )
      FROM pg_trigger AS trigger_row
      WHERE trigger_row.tgrelid = 'public.agent_tasks'::regclass
        AND NOT trigger_row.tgisinternal
    )
    SELECT 1 FROM (
      (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)
      UNION ALL
      (SELECT * FROM actual EXCEPT ALL SELECT * FROM expected)
    ) AS drift
  ) THEN
    RAISE EXCEPTION '00484 agent_tasks trigger manifest is wrong';
  END IF;

  IF EXISTS (
    WITH expected(
      signature,
      language_name,
      arguments,
      result
    ) AS (
      VALUES
        (
          'public.is_comms_admin(uuid)',
          'sql',
          'p_user_id uuid',
          'boolean'
        ),
        (
          'public.is_comms_thread_participant(uuid,uuid)',
          'sql',
          'p_thread_id uuid, p_user_id uuid',
          'boolean'
        ),
        (
          'public.is_coordination_party(uuid,uuid)',
          'sql',
          '_project_id uuid, _user_id uuid DEFAULT auth.uid()',
          'boolean'
        ),
        (
          'public.is_org_admin_or_owner(uuid,uuid)',
          'sql',
          '_organization_id uuid, _user_id uuid DEFAULT auth.uid()',
          'boolean'
        ),
        (
          'public.is_project_team_member(uuid,uuid)',
          'sql',
          '_project_id uuid, _user_id uuid DEFAULT auth.uid()',
          'boolean'
        ),
        (
          'public.user_has_role_domain(uuid,character varying)',
          'plpgsql',
          'p_user_id uuid, p_domain character varying',
          'boolean'
        ),
        (
          'public.user_has_role(uuid,character varying)',
          'plpgsql',
          'p_user_id uuid, p_role_name character varying',
          'boolean'
        ),
        (
          'public.find_products_similar_to(uuid,integer)',
          'plpgsql',
          'product_id uuid, match_count integer DEFAULT 10',
          'TABLE(id uuid, name text, images text[], price_retail integer, similarity double precision)'
        ),
        (
          'public.find_products_for_style(uuid,integer)',
          'plpgsql',
          'style_id uuid, match_count integer DEFAULT 20',
          'TABLE(id uuid, name text, images text[], price_retail integer, similarity double precision)'
        ),
        (
          'public.search_products(text,text,integer,integer,text,text,integer,integer)',
          'plpgsql',
          'search_query text DEFAULT NULL::text, category_filter text DEFAULT NULL::text, min_price integer DEFAULT NULL::integer, max_price integer DEFAULT NULL::integer, style_filter text DEFAULT NULL::text, sort_by text DEFAULT ''relevance''::text, page_size integer DEFAULT 20, page_offset integer DEFAULT 0',
          'TABLE(id uuid, name text, description text, images text[], price_retail integer, materials text[], vendor_name text, style_names text[], relevance_score real)'
        ),
        (
          'public.get_decision_analytics_by_type(uuid)',
          'sql',
          'p_designer_id uuid',
          'TABLE(decision_type text, total_count bigint, responded_count bigint, avg_response_hours numeric, on_time_count bigint)'
        ),
        (
          'public.get_decision_analytics_by_client(uuid)',
          'sql',
          'p_designer_id uuid',
          'TABLE(designer_client_id uuid, client_name text, total_count bigint, responded_count bigint, avg_response_hours numeric, on_time_rate numeric)'
        ),
        (
          'public.get_decision_bottleneck_phases(uuid)',
          'sql',
          'p_designer_id uuid',
          'TABLE(linked_phase text, total_count bigint, overdue_count bigint, avg_response_hours numeric)'
        )
    )
    SELECT 1
    FROM expected
    LEFT JOIN pg_proc AS routine
      ON routine.oid = to_regprocedure(expected.signature)
    LEFT JOIN pg_roles AS owner ON owner.oid = routine.proowner
    LEFT JOIN pg_language AS language ON language.oid = routine.prolang
    WHERE routine.oid IS NULL
      OR owner.rolname <> 'postgres'
      OR language.lanname IS DISTINCT FROM expected.language_name
      OR routine.prokind <> 'f'
      OR NOT routine.prosecdef
      OR routine.provolatile <> 's'
      OR routine.proisstrict
      OR routine.proleakproof
      OR routine.proparallel <> 'u'
      OR routine.proconfig IS DISTINCT FROM
           ARRAY['search_path=pg_catalog, pg_temp']::text[]
      OR pg_get_function_arguments(routine.oid)
           IS DISTINCT FROM expected.arguments
      OR pg_get_function_result(routine.oid)
           IS DISTINCT FROM expected.result
  ) THEN
    RAISE EXCEPTION
      '00484 protected RPC signature or semantic profile is wrong';
  END IF;

  IF EXISTS (
    WITH expected(signature, body_sha256) AS (
      VALUES
        ('public.is_comms_admin(uuid)', 'a8ade1a104b235b923b441aac269fbcdf3cd8304dea103b847914a8a55a2ce60'),
        ('public.is_comms_thread_participant(uuid,uuid)', 'eddca220ab8ec903cdceb5d8f254456f62215aae2cf27ba98a11998d1b84473e'),
        ('public.is_coordination_party(uuid,uuid)', 'a43b1d51c78e0b8c78fd1240ba7ed1b1a5dff755a239731b90e36db02302fe31'),
        ('public.is_org_admin_or_owner(uuid,uuid)', 'b33e66c1ce86bde2c412bb421aa072e5ce734ad4eaff1b8b77f72a3064077df7'),
        ('public.is_project_team_member(uuid,uuid)', '9c2f7a39d9b9eeed76f984755c55482bc10d9d87ed6cbe88382531617d5784d6'),
        ('public.user_has_role_domain(uuid,character varying)', '2ab5071e7d6f9cf20520b795f0ee743ff1d5842ee5c3a6927f4e3cf3d55069b6'),
        ('public.user_has_role(uuid,character varying)', '9e235204d660b8fc33ac96dae0608e0589127fd53ec0f966417aadb3e3f3a306'),
        ('public.find_products_similar_to(uuid,integer)', '90a605e844d86d1821a183e494677b122ce9524313c7b2287db574c40c3735df'),
        ('public.find_products_for_style(uuid,integer)', '0e64506cc003d98df96bd08c7a54085638f67972b967d8d874faa1ae1de2c3ac'),
        ('public.search_products(text,text,integer,integer,text,text,integer,integer)', '52720c3492752b22cbaaef1038bea7fcf4688a95a04b21fab04c87a8fb49563b'),
        ('public.get_decision_analytics_by_type(uuid)', '5537c18d45bcbcfbd6aa216360a6e734b916f300b9d9b02bb54412e3aed2e127'),
        ('public.get_decision_analytics_by_client(uuid)', 'c730099f2415f58809526aa9019e3ee2f4c4d8a827985476f4b74dc95a8d141c'),
        ('public.get_decision_bottleneck_phases(uuid)', '2d0c1ae71420cdbfb6d7c18414f2233b72d0f0a1ccba98918eb1083035591c74')
    )
    SELECT 1
    FROM expected
    LEFT JOIN pg_proc AS routine
      ON routine.oid = to_regprocedure(expected.signature)
    WHERE routine.oid IS NULL
      OR encode(
           extensions.digest(convert_to(routine.prosrc, 'UTF8'), 'sha256'),
           'hex'
         ) IS DISTINCT FROM expected.body_sha256
  ) THEN
    RAISE EXCEPTION '00484 protected RPC body hash is wrong';
  END IF;

  IF EXISTS (
    WITH expected(signature, grantee, grantor, privilege_type, is_grantable) AS (
      SELECT signature, 'authenticated', 'postgres', 'EXECUTE', false
      FROM (VALUES
        ('public.is_comms_admin(uuid)'),
        ('public.is_comms_thread_participant(uuid,uuid)'),
        ('public.is_coordination_party(uuid,uuid)'),
        ('public.is_org_admin_or_owner(uuid,uuid)'),
        ('public.is_project_team_member(uuid,uuid)'),
        ('public.user_has_role_domain(uuid,character varying)'),
        ('public.user_has_role(uuid,character varying)'),
        ('public.find_products_similar_to(uuid,integer)'),
        ('public.find_products_for_style(uuid,integer)'),
        ('public.search_products(text,text,integer,integer,text,text,integer,integer)'),
        ('public.get_decision_analytics_by_type(uuid)'),
        ('public.get_decision_analytics_by_client(uuid)'),
        ('public.get_decision_bottleneck_phases(uuid)')
      ) AS signatures(signature)
    ),
    actual AS (
      SELECT
        expected.signature,
        CASE acl.grantee
          WHEN 0 THEN 'PUBLIC'
          ELSE grantee.rolname::text
        END AS grantee,
        grantor.rolname::text AS grantor,
        acl.privilege_type,
        acl.is_grantable
      FROM expected
      JOIN pg_proc AS routine
        ON routine.oid = to_regprocedure(expected.signature)
      CROSS JOIN LATERAL aclexplode(
        COALESCE(routine.proacl, acldefault('f', routine.proowner))
      ) AS acl
      LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
      JOIN pg_roles AS grantor ON grantor.oid = acl.grantor
      WHERE acl.grantee <> routine.proowner
    )
    SELECT 1
    FROM (
      (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)
      UNION ALL
      (SELECT * FROM actual EXCEPT ALL SELECT * FROM expected)
    ) AS drift
  ) THEN
    RAISE EXCEPTION '00484 protected RPC direct ACL is not authenticated-only';
  END IF;

  IF EXISTS (
    WITH expected(
      schema_name,
      table_name,
      policy_name,
      command,
      expected_qual,
      expected_with_check
    ) AS (
      VALUES
        ('public', 'organization_members', 'Org admins can delete members', 'd', '(is_org_admin_or_owner(organization_id) AND (role <> ''owner''::member_role))', NULL),
        ('public', 'organization_members', 'Members can leave', 'd', '((user_id = auth.uid()) AND (role <> ''owner''::member_role))', NULL),
        ('public', 'organization_members', 'Org admins can update members', 'w', '(is_org_admin_or_owner(organization_id) AND (role <> ''owner''::member_role))', '(is_org_admin_or_owner(organization_id) AND (role <> ''owner''::member_role))'),
        ('public', 'organization_members', 'Org admins can view all members', 'r', 'is_org_admin_or_owner(organization_id)', NULL),
        ('public', 'organization_members', 'Org owners can insert members', 'a', NULL, '(is_org_admin_or_owner(organization_id) AND (role <> ''owner''::member_role))'),
        ('public', 'project_documents', 'Team can view their project documents', 'r', 'is_project_team_member(project_id)', NULL),
        ('public', 'project_tasks', 'Team can view their project tasks', 'r', 'is_project_team_member(project_id)', NULL),
        ('public', 'project_team_members', 'Team members can view project membership', 'r', 'is_project_team_member(project_id)', NULL),
        ('public', 'project_time_entries', 'Team can delete their own time entries', 'd', '((user_id = auth.uid()) AND is_project_team_member(project_id))', NULL),
        ('public', 'project_time_entries', 'Team can log their own time entries', 'a', NULL, '((user_id = auth.uid()) AND is_project_team_member(project_id))'),
        ('public', 'project_time_entries', 'Team can update their own time entries', 'w', '((user_id = auth.uid()) AND is_project_team_member(project_id))', NULL),
        ('public', 'project_time_entries', 'Team can view their project time entries', 'r', 'is_project_team_member(project_id)', NULL),
        ('public', 'projects', 'Project participants can view projects', 'r', '((designer_id = auth.uid()) OR (client_id = auth.uid()) OR is_project_team_member(id))', NULL)
    )
    SELECT 1
    FROM expected
    LEFT JOIN pg_namespace AS schema ON schema.nspname = expected.schema_name
    LEFT JOIN pg_class AS relation
      ON relation.relnamespace = schema.oid
     AND relation.relname = expected.table_name
    LEFT JOIN pg_policy AS policy
      ON policy.polrelid = relation.oid
     AND policy.polname = expected.policy_name
    LEFT JOIN pg_roles AS owner ON owner.oid = relation.relowner
    WHERE policy.oid IS NULL
       OR owner.rolname IS DISTINCT FROM 'postgres'
       OR NOT policy.polpermissive
       OR policy.polcmd::text IS DISTINCT FROM expected.command
       OR policy.polroles IS DISTINCT FROM
            ARRAY[to_regrole('authenticated')::oid]
       OR replace(
            regexp_replace(
              lower(COALESCE(
                pg_get_expr(policy.polqual, policy.polrelid, false),
                '<null>'
              )),
              '\s+',
              '',
              'g'
            ),
            'public.',
            ''
          ) IS DISTINCT FROM replace(
            regexp_replace(
              lower(COALESCE(expected.expected_qual, '<null>')),
              '\s+',
              '',
              'g'
            ),
            'public.',
            ''
          )
       OR replace(
            regexp_replace(
              lower(COALESCE(
                pg_get_expr(policy.polwithcheck, policy.polrelid, false),
                '<null>'
              )),
              '\s+',
              '',
              'g'
            ),
            'public.',
            ''
          ) IS DISTINCT FROM replace(
            regexp_replace(
              lower(COALESCE(expected.expected_with_check, '<null>')),
              '\s+',
              '',
              'g'
            ),
            'public.',
            ''
          )
  ) THEN
    RAISE EXCEPTION '00484 protected policy contract is wrong';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policy AS policy
    WHERE policy.polrelid = 'public.organizations'::regclass
      AND policy.polname = 'Authenticated can create organization'
  ) OR has_table_privilege(
    'authenticated',
    'public.organizations',
    'INSERT'
  ) OR EXISTS (
    SELECT 1
    FROM pg_attribute AS attribute
    WHERE attribute.attrelid = 'public.organizations'::regclass
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND has_column_privilege(
        'authenticated',
        'public.organizations',
        attribute.attname,
        'INSERT'
      )
  ) THEN
    RAISE EXCEPTION
      '00484 raw authenticated organization creation is still enabled';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policy AS policy
    WHERE policy.polrelid = 'public.organization_members'::regclass
      AND policy.polcmd IN ('*', 'a', 'w', 'd')
      AND policy.polname NOT IN (
        'Members can leave',
        'Org admins can delete members',
        'Org admins can update members',
        'Org owners can insert members'
      )
  ) THEN
    RAISE EXCEPTION
      '00484 found an unreviewed organization_members write policy';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policy AS policy
    JOIN pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_namespace AS schema ON schema.oid = relation.relnamespace
    WHERE 0::oid = ANY(policy.polroles)
      AND EXISTS (
        SELECT 1
        FROM pg_depend AS dependency
        WHERE dependency.classid = 'pg_policy'::regclass
          AND dependency.objid = policy.oid
          AND dependency.refclassid = 'pg_proc'::regclass
          AND dependency.refobjid IN (
            to_regprocedure('public.is_comms_admin(uuid)')::oid,
            to_regprocedure(
              'public.is_comms_thread_participant(uuid,uuid)'
            )::oid,
            to_regprocedure(
              'public.is_coordination_party(uuid,uuid)'
            )::oid,
            to_regprocedure(
              'public.is_org_admin_or_owner(uuid,uuid)'
            )::oid,
            to_regprocedure(
              'public.is_project_team_member(uuid,uuid)'
            )::oid,
            to_regprocedure(
              'public.user_has_role_domain(uuid,character varying)'
            )::oid,
            to_regprocedure(
              'public.user_has_role(uuid,character varying)'
            )::oid
          )
      )
      AND NOT (
        schema.nspname = 'storage'
        AND relation.relname = 'objects'
        AND policy.polname IN (
          'Org admins manage studio logos (insert)',
          'Org admins manage studio logos (update)',
          'Org admins manage studio logos (delete)',
          'Project members can read documents'
        )
      )
  ) THEN
    RAISE EXCEPTION
      '00484 found an unreviewed PUBLIC policy using a protected helper';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class AS relation
    CROSS JOIN LATERAL aclexplode(
      COALESCE(relation.relacl, acldefault('r', relation.relowner))
    ) AS acl
    WHERE relation.oid = 'public.agent_tasks'::regclass
      AND acl.grantee = to_regrole('agent_writer')::oid
  ) OR EXISTS (
    SELECT 1
    FROM pg_attribute AS attribute
    CROSS JOIN LATERAL aclexplode(attribute.attacl) AS acl
    WHERE attribute.attrelid = 'public.agent_tasks'::regclass
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND acl.grantee = to_regrole('agent_writer')::oid
  ) OR EXISTS (
    SELECT 1
    FROM pg_policy AS policy
    WHERE to_regrole('agent_writer')::oid = ANY(policy.polroles)
  ) OR NOT has_function_privilege(
    'agent_writer',
    'public.enqueue_agent_task(text,jsonb,text,integer,text,text,uuid,text,timestamp with time zone,integer,text,text,text,uuid,numeric,jsonb,text)',
    'EXECUTE'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_proc AS routine
    CROSS JOIN LATERAL aclexplode(
      COALESCE(routine.proacl, acldefault('f', routine.proowner))
    ) AS acl
    WHERE routine.oid = to_regprocedure(
      'public.enqueue_agent_task(text,jsonb,text,integer,text,text,uuid,text,timestamp with time zone,integer,text,text,text,uuid,numeric,jsonb,text)'
    )
      AND acl.grantee = to_regrole('agent_writer')::oid
      AND acl.grantor = routine.proowner
      AND acl.privilege_type = 'EXECUTE'
      AND NOT acl.is_grantable
  ) OR 1 <> (
    SELECT count(*)
    FROM pg_proc AS routine
    CROSS JOIN LATERAL aclexplode(
      COALESCE(routine.proacl, acldefault('f', routine.proowner))
    ) AS acl
    WHERE routine.oid = to_regprocedure(
      'public.enqueue_agent_task(text,jsonb,text,integer,text,text,uuid,text,timestamp with time zone,integer,text,text,text,uuid,numeric,jsonb,text)'
    )
      AND acl.grantee = to_regrole('agent_writer')::oid
  ) THEN
    RAISE EXCEPTION '00484 agent_writer is not RPC-only';
  END IF;
END
$postconditions$;

COMMIT;
