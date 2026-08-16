-- ═══════════════════════════════════════════════════════════════════════════
-- 00488 — Canonical studio authority: storage platform-admin handoff
--
-- This transaction is intentionally outside ordinary migration replay.
-- storage.objects and its policies are reserved-owner objects on Supabase.
-- The adjacent manifest and the catalog gates below pin the exact nine-row
-- source/final policy tuples; this file is idempotent in either final state.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL search_path = pg_catalog, public;
SET LOCAL standard_conforming_strings = on;
SET LOCAL quote_all_identifiers = off;

-- The platform artifact is standalone, so it carries the same checked lexical
-- catalog scanner as the ordinary migration rather than relying on raw prosrc
-- regexes that can be satisfied by comments or dynamic SQL text.
-- @@GENERATED_CATALOG_LEXER@@

DO $storage_source_or_final_sentinel$
DECLARE
  source_state boolean;
  final_state boolean;
BEGIN
  IF NOT COALESCE((SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname = current_user), false) THEN
    RAISE EXCEPTION '00488 storage phase requires a platform administrator';
  END IF;

  -- @@GENERATED_STORAGE_RLS_GATE@@

  -- @@GENERATED_DYNAMIC_ROUTINE_FINAL_GATE@@

  WITH expected(
    relation_name, policy_name, command, permissive, roles,
    source_fingerprint, final_fingerprint, platform_handoff
  ) AS (VALUES
    -- @@GENERATED_STORAGE_POLICY_VALUES@@
  ), actual AS (
    SELECT expected.*, policy.oid, policy.polcmd, policy.polpermissive,
      ARRAY(
        SELECT CASE WHEN role_oid.oid = 0 THEN 'public'::text
                    ELSE role_row.rolname::text END
        FROM pg_catalog.unnest(policy.polroles) AS role_oid(oid)
        LEFT JOIN pg_catalog.pg_roles AS role_row ON role_row.oid = role_oid.oid
        ORDER BY CASE WHEN role_oid.oid = 0 THEN 'public'::text
                      ELSE role_row.rolname::text END
      ) AS actual_roles,
      pg_temp._00488_catalog_policy_fingerprint(policy.oid) AS fingerprint
    FROM expected
    LEFT JOIN pg_catalog.pg_policy AS policy
      ON policy.polrelid = pg_catalog.to_regclass(expected.relation_name)
     AND policy.polname = expected.policy_name
  )
  SELECT
    COALESCE(bool_and(
      oid IS NOT NULL AND polcmd = command::"char"
      AND polpermissive IS NOT DISTINCT FROM permissive
      AND actual_roles IS NOT DISTINCT FROM roles
      AND fingerprint = source_fingerprint
    ), false),
    COALESCE(bool_and(
      oid IS NOT NULL AND polcmd = command::"char"
      AND polpermissive IS NOT DISTINCT FROM permissive
      AND actual_roles IS NOT DISTINCT FROM roles
      AND fingerprint = final_fingerprint
    ), false)
  INTO source_state, final_state
  FROM actual;

  IF NOT source_state AND NOT final_state THEN
    RAISE EXCEPTION '00488 storage policies are neither the exact reviewed source nor exact final tuple set';
  END IF;
END;
$storage_source_or_final_sentinel$;

-- @@GENERATED_STORAGE_POLICIES@@

DO $storage_final_sentinel$
BEGIN
  -- @@GENERATED_STORAGE_RLS_GATE@@

  -- @@GENERATED_DYNAMIC_ROUTINE_FINAL_GATE@@

  IF EXISTS (
    WITH expected(
      relation_name, policy_name, command, permissive, roles,
      source_fingerprint, final_fingerprint, platform_handoff
    ) AS (VALUES
      -- @@GENERATED_STORAGE_POLICY_VALUES@@
    ), actual AS (
      SELECT expected.*, policy.oid, policy.polcmd, policy.polpermissive,
        ARRAY(
          SELECT CASE WHEN role_oid.oid = 0 THEN 'public'::text
                      ELSE role_row.rolname::text END
          FROM pg_catalog.unnest(policy.polroles) AS role_oid(oid)
          LEFT JOIN pg_catalog.pg_roles AS role_row ON role_row.oid = role_oid.oid
          ORDER BY CASE WHEN role_oid.oid = 0 THEN 'public'::text
                        ELSE role_row.rolname::text END
        ) AS actual_roles,
        pg_temp._00488_catalog_policy_fingerprint(policy.oid) AS fingerprint
      FROM expected
      LEFT JOIN pg_catalog.pg_policy AS policy
        ON policy.polrelid = pg_catalog.to_regclass(expected.relation_name)
       AND policy.polname = expected.policy_name
    )
    SELECT 1 FROM actual
    WHERE oid IS NULL OR polcmd <> command::"char"
       OR polpermissive IS DISTINCT FROM permissive
       OR actual_roles IS DISTINCT FROM roles
       OR fingerprint <> final_fingerprint
  ) OR EXISTS (
    WITH expected(policy_name) AS (VALUES
      ('Designers manage proposal folio objects'),
      ('Site request designers read immutable media'),
      ('project_ffe_working_studio_delete'),
      ('project_ffe_working_studio_insert'),
      ('project_ffe_working_studio_select'),
      ('project_ffe_working_studio_update'),
      ('proposal_mood_boards_proposal_delete'),
      ('proposal_mood_boards_proposal_insert'),
      ('proposal_mood_boards_proposal_update')
    )
    SELECT 1
    FROM pg_catalog.pg_policy AS policy
    WHERE policy.polrelid = 'storage.objects'::pg_catalog.regclass
      AND (COALESCE(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')
        || ' ' || COALESCE(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), ''))
        ~* '(^|[^a-z0-9_])_can_(read|author)_studio_snapshot[[:space:]]*\('
      AND NOT EXISTS (
        SELECT 1 FROM expected WHERE expected.policy_name = policy.polname
      )
  ) THEN
    RAISE EXCEPTION '00488 storage exact final policy/reverse-caller sentinel failed';
  END IF;
END;
$storage_final_sentinel$;

-- The platform phase is the last caller of the four compatibility helpers.
-- Revoke every named application role before dropping each identity.
DO $retire_storage_compatibility_helpers$
DECLARE
  signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public._can_author_proposal(uuid)',
    'public.is_active_studio_member(uuid)',
    'public.is_design_studio_comember(uuid)',
    'public.is_studio_comember(uuid)'
  ]
  LOOP
    IF pg_catalog.to_regprocedure(signature) IS NOT NULL THEN
      EXECUTE pg_catalog.format(
        'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role, dashboard_user, agent_reader, agent_writer, edge_catalog_reader, edge_rls_user',
        signature
      );
      EXECUTE pg_catalog.format('DROP FUNCTION %s', signature);
    END IF;
  END LOOP;
END;
$retire_storage_compatibility_helpers$;

DO $storage_global_final_sentinel$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS routine
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'public'
      AND routine.proname IN (
        '_can_author_proposal','is_active_studio_member',
        'is_design_studio_comember','is_studio_comember'
      )
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS routine
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = routine.pronamespace
    CROSS JOIN pg_catalog.unnest(ARRAY[
      '_can_author_proposal','is_active_studio_member',
      'is_design_studio_comember','is_studio_comember'
    ]::text[]) AS forbidden(helper_name)
    WHERE namespace.nspname IN ('public','app_private')
      AND (
        pg_temp._00488_call_count(routine.prosrc, forbidden.helper_name) > 0
        OR pg_temp._00488_dynamic_mentions(
          routine.prosrc, forbidden.helper_name
        )
      )
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy AS policy
    CROSS JOIN pg_catalog.unnest(ARRAY[
      '_can_author_proposal','is_active_studio_member',
      'is_design_studio_comember','is_studio_comember'
    ]::text[]) AS forbidden(helper_name)
    WHERE pg_temp._00488_call_count(
      COALESCE(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')
        || ' ' || COALESCE(
          pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), ''
        ), forbidden.helper_name
    ) > 0
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.unnest(ARRAY[
      '_can_author_proposal','is_active_studio_member',
      'is_design_studio_comember','is_studio_comember'
    ]::text[]) AS forbidden(helper_name)
    WHERE pg_temp._00488_call_count(
      pg_catalog.pg_get_viewdef(
        'public.people_directory'::pg_catalog.regclass, true
      ), forbidden.helper_name
    ) > 0
  )
  THEN
    RAISE EXCEPTION '00488 storage final global legacy-helper closure failed';
  END IF;
END;
$storage_global_final_sentinel$;

COMMIT;
