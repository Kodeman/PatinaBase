-- Real-Postgres contract tests for migration 00484.
-- Run after a clean reset and the privileged 00483 local platform runner:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -X -v ON_ERROR_STOP=1 \
--     -f supabase/tests/edge_api/public_rpc_authorization_contract_test.sql
-- All fixtures and Agent OS writes are rolled back.

\set ON_ERROR_STOP on

BEGIN;

SET LOCAL plpgsql.check_asserts = on;
DO $assertion_preflight$
BEGIN
  IF current_setting('plpgsql.check_asserts') <> 'on' THEN
    RAISE EXCEPTION '00484 test requires plpgsql.check_asserts=on';
  END IF;
END
$assertion_preflight$;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  (
    'c4840000-0000-4000-8000-000000000001',
    'rpc-contract-actor@test.invalid', '', now(), now(), now(),
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
  ),
  (
    'c4840000-0000-4000-8000-000000000002',
    'rpc-contract-other@test.invalid', '', now(), now(), now(),
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
  ),
  (
    'c4840000-0000-4000-8000-000000000003',
    'rpc-contract-legacy-role@test.invalid', '', now(), now(), now(),
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
  ),
  (
    'c4840000-0000-4000-8000-000000000004',
    'rpc-contract-unrelated@test.invalid', '', now(), now(), now(),
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
  );

INSERT INTO public.profiles (
  id, email, full_name, role, created_at, updated_at
)
VALUES
  (
    'c4840000-0000-4000-8000-000000000001',
    'rpc-contract-actor@test.invalid', 'RPC Contract Actor',
    'designer', now(), now()
  ),
  (
    'c4840000-0000-4000-8000-000000000002',
    'rpc-contract-other@test.invalid', 'RPC Contract Other',
    'designer', now(), now()
  ),
  (
    'c4840000-0000-4000-8000-000000000003',
    'rpc-contract-legacy-role@test.invalid', 'RPC Contract Legacy Role',
    'admin', now(), now()
  ),
  (
    'c4840000-0000-4000-8000-000000000004',
    'rpc-contract-unrelated@test.invalid', 'RPC Contract Unrelated',
    'designer', now(), now()
  )
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role;

-- handle_new_user assigns app_user; remove it so the legacy-role fixture has
-- no canonical role of any kind.
DELETE FROM public.user_roles
WHERE user_id = 'c4840000-0000-4000-8000-000000000003';

INSERT INTO public.user_roles (user_id, role_id)
SELECT fixture.user_id, role_row.id
FROM (
  VALUES
    ('c4840000-0000-4000-8000-000000000001'::uuid, 'super_admin'),
    ('c4840000-0000-4000-8000-000000000002'::uuid, 'super_admin')
) AS fixture(user_id, role_name)
JOIN public.roles AS role_row ON role_row.name = fixture.role_name
ON CONFLICT (user_id, role_id) DO NOTHING;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  (
    'c4840000-0000-4000-8000-000000000010',
    'design_studio', 'RPC Contract Studio',
    'rpc-contract-studio-c484', 'active'
  ),
  (
    'c4840000-0000-4000-8000-000000000011',
    'design_studio', 'RPC Contract Other Studio',
    'rpc-contract-other-studio-c484', 'active'
  ),
  (
    'c4840000-0000-4000-8000-000000000013',
    'design_studio', 'RPC Contract Ownerless Studio',
    'rpc-contract-ownerless-studio-c484', 'active'
  );

INSERT INTO public.organization_members (
  user_id, organization_id, role, status, joined_at
)
VALUES
  (
    'c4840000-0000-4000-8000-000000000002',
    'c4840000-0000-4000-8000-000000000010',
    'owner', 'active', now()
  ),
  (
    'c4840000-0000-4000-8000-000000000001',
    'c4840000-0000-4000-8000-000000000010',
    'admin', 'active', now()
  ),
  (
    'c4840000-0000-4000-8000-000000000004',
    'c4840000-0000-4000-8000-000000000011',
    'owner', 'active', now()
  );

INSERT INTO public.projects (id, name, designer_id, created_by, studio_id)
VALUES
  (
    'c4840000-0000-4000-8000-000000000020',
    'RPC Contract Project',
    'c4840000-0000-4000-8000-000000000001',
    'c4840000-0000-4000-8000-000000000001',
    'c4840000-0000-4000-8000-000000000010'
  ),
  (
    'c4840000-0000-4000-8000-000000000060',
    'RPC Contract Other Project',
    'c4840000-0000-4000-8000-000000000004',
    'c4840000-0000-4000-8000-000000000004',
    'c4840000-0000-4000-8000-000000000011'
  );

-- The project trigger is a real nested caller of the now-internal
-- _primary_studio_for helper; direct app EXECUTE is not required.
INSERT INTO public.projects (id, name, designer_id, created_by)
VALUES (
  'c4840000-0000-4000-8000-000000000061',
  'RPC Contract Primary Studio Trigger Project',
  'c4840000-0000-4000-8000-000000000001',
  'c4840000-0000-4000-8000-000000000001'
);

DO $primary_studio_nested_contract$
BEGIN
  ASSERT (
    SELECT project.studio_id
    FROM public.projects AS project
    WHERE project.id = 'c4840000-0000-4000-8000-000000000061'
  ) = 'c4840000-0000-4000-8000-000000000010'::uuid,
    'the trusted project trigger lost its internal primary-studio lookup';
END
$primary_studio_nested_contract$;

-- A nonempty ownerless organization is a recovery case, not first-owner
-- bootstrap. Only the real service_role database role may recover it.
INSERT INTO public.organization_members (
  user_id, organization_id, role, status, joined_at
)
VALUES (
  'c4840000-0000-4000-8000-000000000001',
  'c4840000-0000-4000-8000-000000000013',
  'admin', 'active', now()
);

INSERT INTO public.project_team_members (
  project_id, user_id, role, assigned_by
)
VALUES
  (
    'c4840000-0000-4000-8000-000000000020',
    'c4840000-0000-4000-8000-000000000001',
    'lead_designer',
    'c4840000-0000-4000-8000-000000000001'
  ),
  (
    'c4840000-0000-4000-8000-000000000020',
    'c4840000-0000-4000-8000-000000000002',
    'support_designer',
    'c4840000-0000-4000-8000-000000000001'
  ),
  (
    'c4840000-0000-4000-8000-000000000060',
    'c4840000-0000-4000-8000-000000000004',
    'lead_designer',
    'c4840000-0000-4000-8000-000000000004'
  );

INSERT INTO public.project_documents (id, project_id, title, uploaded_by)
VALUES
  (
    'c4840000-0000-4000-8000-000000000070',
    'c4840000-0000-4000-8000-000000000020',
    'RPC Contract Actor Document',
    'c4840000-0000-4000-8000-000000000001'
  ),
  (
    'c4840000-0000-4000-8000-000000000071',
    'c4840000-0000-4000-8000-000000000060',
    'RPC Contract Other Document',
    'c4840000-0000-4000-8000-000000000004'
  );

INSERT INTO public.project_tasks (id, project_id, title)
VALUES
  (
    'c4840000-0000-4000-8000-000000000072',
    'c4840000-0000-4000-8000-000000000020',
    'RPC Contract Actor Task'
  ),
  (
    'c4840000-0000-4000-8000-000000000073',
    'c4840000-0000-4000-8000-000000000060',
    'RPC Contract Other Task'
  );

INSERT INTO public.project_time_entries (
  id, project_id, user_id, duration_minutes, notes
)
VALUES
  (
    'c4840000-0000-4000-8000-000000000074',
    'c4840000-0000-4000-8000-000000000020',
    'c4840000-0000-4000-8000-000000000001',
    30,
    'RPC Contract Actor Time'
  ),
  (
    'c4840000-0000-4000-8000-000000000075',
    'c4840000-0000-4000-8000-000000000060',
    'c4840000-0000-4000-8000-000000000004',
    30,
    'RPC Contract Other Time'
  );

INSERT INTO public.project_parties (
  id, project_id, party_kind, display_name, profile_id, created_by
)
VALUES
  (
    'c4840000-0000-4000-8000-000000000021',
    'c4840000-0000-4000-8000-000000000020',
    'other', 'RPC Contract Actor Party',
    'c4840000-0000-4000-8000-000000000001',
    'c4840000-0000-4000-8000-000000000001'
  ),
  (
    'c4840000-0000-4000-8000-000000000022',
    'c4840000-0000-4000-8000-000000000020',
    'other', 'RPC Contract Other Party',
    'c4840000-0000-4000-8000-000000000002',
    'c4840000-0000-4000-8000-000000000001'
  );

INSERT INTO public.comms_threads (id, kind, title, created_by)
VALUES (
  'c4840000-0000-4000-8000-000000000030',
  'direct', 'RPC Contract Thread',
  'c4840000-0000-4000-8000-000000000001'
);

INSERT INTO public.comms_thread_participants (
  thread_id, profile_id, role
)
VALUES
  (
    'c4840000-0000-4000-8000-000000000030',
    'c4840000-0000-4000-8000-000000000001', 'admin'
  ),
  (
    'c4840000-0000-4000-8000-000000000030',
    'c4840000-0000-4000-8000-000000000002', 'admin'
  );

INSERT INTO public.styles (id, name, embedding)
VALUES (
  'c4840000-0000-4000-8000-000000000040',
  'RPC Contract Style C484',
  array_fill(0.1::real, ARRAY[768])::public.vector
);

INSERT INTO public.products (
  id, name, source_url, captured_by, captured_at, layer, patina_managed,
  status, category, price_retail, embedding
)
VALUES
  (
    'c4840000-0000-4000-8000-000000000041',
    'CF484Scope Published Source',
    'https://test.invalid/c484/catalog-source',
    'c4840000-0000-4000-8000-000000000001', now(),
    'catalog', true, 'published', 'cf484-source', 10000,
    array_fill(0.1::real, ARRAY[768])::public.vector
  ),
  (
    'c4840000-0000-4000-8000-000000000042',
    'CF484Scope Published Result',
    'https://test.invalid/c484/catalog-result',
    'c4840000-0000-4000-8000-000000000001', now(),
    'catalog', true, 'published', 'cf484-reviewed', 12000,
    array_fill(0.1::real, ARRAY[768])::public.vector
  ),
  (
    'c4840000-0000-4000-8000-000000000044',
    'CF484Scope Draft Catalog',
    'https://test.invalid/c484/catalog-draft',
    'c4840000-0000-4000-8000-000000000001', now(),
    'catalog', true, 'draft', 'cf484-reviewed', 14000,
    array_fill(0.1::real, ARRAY[768])::public.vector
  );

INSERT INTO public.products (
  id, name, source_url, captured_by, captured_at, layer, owner_user_id,
  status, category, price_retail, embedding
)
VALUES (
  'c4840000-0000-4000-8000-000000000043',
  'CF484Scope Personal Product',
  'https://test.invalid/c484/personal',
  'c4840000-0000-4000-8000-000000000002', now(),
  'personal', 'c4840000-0000-4000-8000-000000000002',
  'published', 'cf484-reviewed', 13000,
  array_fill(0.1::real, ARRAY[768])::public.vector
);

-- More than every reviewed result cap, with lower similarity than the two
-- explicit catalog fixtures so default-limit compatibility remains stable.
INSERT INTO public.products (
  id, name, source_url, captured_by, captured_at, layer, patina_managed,
  status, category, price_retail, embedding
)
SELECT
  (
    'c4841000-0000-4000-8000-'
    || lpad(fixture_number::text, 12, '0')
  )::uuid,
  'CF484Scope Generated ' || fixture_number::text,
  'https://test.invalid/c484/generated/' || fixture_number::text,
  'c4840000-0000-4000-8000-000000000001'::uuid,
  now(),
  'catalog',
  true,
  'published',
  'cf484-generated',
  15000 + fixture_number,
  array_cat(
    array_fill(0.1::real, ARRAY[384]),
    array_fill(0.0::real, ARRAY[384])
  )::public.vector
FROM generate_series(1, 120) AS generated(fixture_number);

INSERT INTO public.designer_clients (id, designer_id, client_id, status)
VALUES
  (
    'c4840000-0000-4000-8000-000000000050',
    'c4840000-0000-4000-8000-000000000001',
    'c4840000-0000-4000-8000-000000000002', 'active'
  ),
  (
    'c4840000-0000-4000-8000-000000000051',
    'c4840000-0000-4000-8000-000000000002',
    'c4840000-0000-4000-8000-000000000001', 'active'
  );

INSERT INTO public.client_decisions (
  id, designer_client_id, designer_id, title, decision_type,
  blocking_status, linked_phase, status, due_date, sent_at
)
VALUES
  (
    'c4840000-0000-4000-8000-000000000052',
    'c4840000-0000-4000-8000-000000000050',
    'c4840000-0000-4000-8000-000000000001',
    'RPC Contract Actor Decision', 'product', 'non_blocking',
    'Design', 'pending', now() - interval '1 day', now() - interval '2 days'
  ),
  (
    'c4840000-0000-4000-8000-000000000053',
    'c4840000-0000-4000-8000-000000000051',
    'c4840000-0000-4000-8000-000000000002',
    'RPC Contract Other Decision', 'material', 'non_blocking',
    'Procurement', 'pending', now() - interval '1 day', now() - interval '2 days'
  );

DO $policy_and_acl_contract$
BEGIN
  ASSERT NOT EXISTS (
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
  ), 'a protected RPC signature or semantic profile drifted';

  ASSERT NOT EXISTS (
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
  ), 'a reviewed postgres-owned policy contract drifted';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_policy AS policy
    WHERE policy.polrelid = 'public.organizations'::regclass
      AND policy.polname = 'Authenticated can create organization'
  ), 'raw authenticated organization creation policy still exists';

  ASSERT NOT has_table_privilege(
    'authenticated', 'public.organizations', 'INSERT'
  ), 'authenticated retained raw organizations INSERT';

  ASSERT NOT EXISTS (
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
  ), 'authenticated retained a raw organizations column INSERT';

  ASSERT NOT EXISTS (
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
  ), 'an unreviewed organization_members write policy exists';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_policy AS policy
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
  ), 'a protected helper still has a PUBLIC policy dependency';

  ASSERT NOT EXISTS (
    WITH expected(policy_name) AS (
      VALUES
        ('Org admins manage studio logos (insert)'),
        ('Org admins manage studio logos (update)'),
        ('Org admins manage studio logos (delete)'),
        ('Project members can read documents')
    )
    SELECT 1
    FROM expected
    LEFT JOIN pg_namespace AS schema ON schema.nspname = 'storage'
    LEFT JOIN pg_class AS relation
      ON relation.relnamespace = schema.oid
     AND relation.relname = 'objects'
    LEFT JOIN pg_policy AS policy
      ON policy.polrelid = relation.oid
     AND policy.polname = expected.policy_name
    WHERE policy.oid IS NULL
       OR policy.polroles IS DISTINCT FROM
            ARRAY[to_regrole('authenticated')::oid]
  ), 'a privileged Storage policy is not authenticated-only';

  ASSERT NOT EXISTS (
    WITH expected(signature) AS (
      VALUES
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
    )
    SELECT 1
    FROM expected
    WHERE NOT has_function_privilege(
            'authenticated', expected.signature, 'EXECUTE'
          )
       OR has_function_privilege('anon', expected.signature, 'EXECUTE')
       OR has_function_privilege('service_role', expected.signature, 'EXECUTE')
       OR has_function_privilege('agent_writer', expected.signature, 'EXECUTE')
  ), 'a protected RPC has an incorrect effective app caller';

  ASSERT NOT EXISTS (
    WITH expected(signature) AS (
      VALUES
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
    )
    SELECT 1
    FROM expected
    JOIN pg_proc AS routine
      ON routine.oid = to_regprocedure(expected.signature)
    CROSS JOIN LATERAL aclexplode(
      COALESCE(routine.proacl, acldefault('f', routine.proowner))
    ) AS acl
    LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
    WHERE acl.grantee <> routine.proowner
      AND (
        grantee.rolname IS DISTINCT FROM 'authenticated'
        OR acl.privilege_type <> 'EXECUTE'
        OR acl.is_grantable
      )
  ), 'a protected RPC has an unexpected direct non-owner ACL';

  ASSERT NOT EXISTS (
    WITH expected(signature) AS (
      VALUES
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
    )
    SELECT 1
    FROM expected
    JOIN pg_proc AS routine
      ON routine.oid = to_regprocedure(expected.signature)
    WHERE NOT EXISTS (
      SELECT 1
      FROM aclexplode(
        COALESCE(routine.proacl, acldefault('f', routine.proowner))
      ) AS acl
      WHERE acl.grantee = to_regrole('authenticated')::oid
        AND acl.grantor = routine.proowner
        AND acl.privilege_type = 'EXECUTE'
        AND NOT acl.is_grantable
    )
  ), 'a protected RPC is missing its plain authenticated direct grant';

  ASSERT position(
    'LEAST(100000,GREATEST(0,COALESCE(page_offset,0)))' IN
    regexp_replace(
      (
        SELECT routine.prosrc
        FROM pg_proc AS routine
        WHERE routine.oid = to_regprocedure(
          'public.search_products(text,text,integer,integer,text,text,integer,integer)'
        )
      ),
      '\s+',
      '',
      'g'
    )
  ) > 0, 'text-search upper offset bound drifted';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_class AS relation
    CROSS JOIN LATERAL aclexplode(
      COALESCE(relation.relacl, acldefault('r', relation.relowner))
    ) AS acl
    WHERE relation.oid = 'public.agent_tasks'::regclass
      AND acl.grantee = to_regrole('agent_writer')::oid
  ), 'agent_writer still has a direct agent_tasks relation grant';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_policy AS policy
    WHERE to_regrole('agent_writer')::oid = ANY(policy.polroles)
  ), 'agent_writer still has a table policy';

  ASSERT has_function_privilege(
    'agent_writer',
    'public.enqueue_agent_task(text,jsonb,text,integer,text,text,uuid,text,timestamp with time zone,integer,text,text,text,uuid,numeric,jsonb,text)',
    'EXECUTE'
  ), 'agent_writer lost enqueue_agent_task';

  ASSERT EXISTS (
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
  ), 'agent_writer enqueue grant is missing or grantable';

  ASSERT 1 = (
    SELECT count(*)
    FROM pg_proc AS routine
    CROSS JOIN LATERAL aclexplode(
      COALESCE(routine.proacl, acldefault('f', routine.proowner))
    ) AS acl
    WHERE routine.oid = to_regprocedure(
      'public.enqueue_agent_task(text,jsonb,text,integer,text,text,uuid,text,timestamp with time zone,integer,text,text,text,uuid,numeric,jsonb,text)'
    )
      AND acl.grantee = to_regrole('agent_writer')::oid
  ), 'agent_writer enqueue ACL has an extra grantor or privilege row';
END
$policy_and_acl_contract$;

DO $dependent_catalog_contract$
BEGIN
  ASSERT NOT EXISTS (
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
  ), 'a protected RPC body hash drifted';

  ASSERT NOT EXISTS (
    WITH expected(
      signature, language_name, arguments, result_type, volatility,
      security_definer, final_config, body_sha256
    ) AS (
      VALUES
        ('public.generate_unique_org_slug(text)', 'plpgsql', 'p_name text', 'text', 'v', true, ARRAY['search_path=pg_catalog, public, pg_temp']::text[], 'afeb6cdafc8809609b01da46a3891faecd54ec5d34ed260f895d2c451b7c4036'),
        ('public._provision_studio(uuid,text)', 'plpgsql', 'p_user_id uuid, p_name text', 'organizations', 'v', true, ARRAY['search_path=pg_catalog, public, pg_temp']::text[], 'ac716f9a07315974e7a18a02b55200fe4aa571376b13082b55271bd7fec0eb4e'),
        ('public.create_studio_workspace(text)', 'plpgsql', 'p_name text', 'organizations', 'v', true, ARRAY['search_path=pg_catalog, public, pg_temp']::text[], 'f5507437ecd304f63b3d574243ac7220a8b0295b11d9821e75e8c2e8f3f84599'),
        ('public._primary_studio_for(uuid)', 'sql', 'p_user uuid', 'uuid', 's', true, ARRAY['search_path=pg_catalog, public, pg_temp']::text[], '6426ab0bd755fd1902056e687741a2c0c1b2c1cf3e1c4a332a0ec766dde266ac'),
        ('public.is_org_owner(uuid,uuid)', 'sql', '_organization_id uuid, _user_id uuid DEFAULT auth.uid()', 'boolean', 's', true, ARRAY['search_path=pg_catalog, public, pg_temp']::text[], '22d2aa28a5b1e69ee449c8684a3497af2eee0c5358791b0f36754f7a8cc37d10'),
        ('public.guard_org_membership_changes()', 'plpgsql', '', 'trigger', 'v', true, ARRAY['search_path=pg_catalog, public, pg_temp']::text[], '137fc04097baf5beba2397edd97726a6c79f26e369900a200ba4caa059ef17cc'),
        ('public.transfer_studio_ownership(uuid,uuid)', 'plpgsql', 'p_org_id uuid, p_new_owner uuid', 'void', 'v', true, ARRAY['search_path=pg_catalog, public, pg_temp']::text[], 'b65238ed6ff01d284daeaf0198febf8a906a5faaa3259518c6e672b01c4b1d49'),
        ('public.agent_tasks_set_updated_at()', 'plpgsql', '', 'trigger', 'v', false, ARRAY['search_path=pg_catalog, public, pg_temp']::text[], '42bbab957ef0446fcfebf4936a8fc1b27986e1a1a3ba349937141bb528507261'),
        ('public.enforce_agent_task_transition()', 'plpgsql', '', 'trigger', 'v', false, ARRAY['search_path=pg_catalog, public, pg_temp']::text[], '441ca944d5290844cda7dd76c66b559094b540006d3167acdfd7cff7bbb3db40'),
        ('public.agent_task_audit_trigger()', 'plpgsql', '', 'trigger', 'v', true, ARRAY['search_path=pg_catalog, public, pg_temp']::text[], 'bf2cff90cc9ed5d4451110214bea5ad6458003b9e883e8124d1ef771b699ceb3'),
        ('public.enqueue_agent_task(text,jsonb,text,integer,text,text,uuid,text,timestamp with time zone,integer,text,text,text,uuid,numeric,jsonb,text)', 'plpgsql', 'p_task_type text, p_payload jsonb DEFAULT ''{}''::jsonb, p_source text DEFAULT ''manual''::text, p_priority integer DEFAULT 3, p_assignee text DEFAULT NULL::text, p_entity_type text DEFAULT NULL::text, p_entity_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text, p_run_after timestamp with time zone DEFAULT now(), p_max_attempts integer DEFAULT 5, p_on_conflict text DEFAULT ''ignore''::text, p_summary text DEFAULT ''''::text, p_status text DEFAULT ''queued''::text, p_parent_task_id uuid DEFAULT NULL::uuid, p_confidence numeric DEFAULT NULL::numeric, p_artifacts jsonb DEFAULT ''{}''::jsonb, p_actor text DEFAULT NULL::text', 'agent_tasks', 'v', true, ARRAY['search_path=pg_catalog, public, pg_temp']::text[], '5393c2644b9a2fc4cb289b2ac696aa6656fdb0aa4bbfba9d080905441a8a5323')
    )
    SELECT 1
    FROM expected
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
         ) IS DISTINCT FROM expected.body_sha256
  ), 'an executable dependency semantic/body profile drifted';

  ASSERT NOT EXISTS (
    WITH profile(signature) AS (
      VALUES
        ('public.generate_unique_org_slug(text)'),
        ('public._provision_studio(uuid,text)'),
        ('public.create_studio_workspace(text)'),
        ('public._primary_studio_for(uuid)'),
        ('public.is_org_owner(uuid,uuid)'),
        ('public.guard_org_membership_changes()'),
        ('public.transfer_studio_ownership(uuid,uuid)'),
        ('public.agent_tasks_set_updated_at()'),
        ('public.enforce_agent_task_transition()'),
        ('public.agent_task_audit_trigger()'),
        ('public.enqueue_agent_task(text,jsonb,text,integer,text,text,uuid,text,timestamp with time zone,integer,text,text,text,uuid,numeric,jsonb,text)')
    ),
    expected(signature, grantee, grantor, privilege_type, is_grantable) AS (
      VALUES
        ('public.create_studio_workspace(text)', 'authenticated', 'postgres', 'EXECUTE', false),
        ('public.transfer_studio_ownership(uuid,uuid)', 'authenticated', 'postgres', 'EXECUTE', false),
        ('public.enqueue_agent_task(text,jsonb,text,integer,text,text,uuid,text,timestamp with time zone,integer,text,text,text,uuid,numeric,jsonb,text)', 'service_role', 'postgres', 'EXECUTE', false),
        ('public.enqueue_agent_task(text,jsonb,text,integer,text,text,uuid,text,timestamp with time zone,integer,text,text,text,uuid,numeric,jsonb,text)', 'agent_writer', 'postgres', 'EXECUTE', false)
    ),
    actual AS (
      SELECT
        profile.signature,
        CASE acl.grantee WHEN 0 THEN 'PUBLIC' ELSE grantee.rolname::text END,
        grantor.rolname::text,
        acl.privilege_type,
        acl.is_grantable
      FROM profile
      JOIN pg_proc AS routine
        ON routine.oid = to_regprocedure(profile.signature)
      CROSS JOIN LATERAL aclexplode(
        COALESCE(routine.proacl, acldefault('f', routine.proowner))
      ) AS acl
      LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
      JOIN pg_roles AS grantor ON grantor.oid = acl.grantor
      WHERE acl.grantee <> routine.proowner
    )
    SELECT 1 FROM (
      (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)
      UNION ALL
      (SELECT * FROM actual EXCEPT ALL SELECT * FROM expected)
    ) AS drift
  ), 'an executable dependency direct ACL drifted';

  ASSERT NOT EXISTS (
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
  ), 'a protected relation RLS state drifted';

  ASSERT 1 = (
    SELECT count(*)
    FROM pg_trigger AS trigger_row
    WHERE trigger_row.tgrelid = 'public.organization_members'::regclass
      AND NOT trigger_row.tgisinternal
      AND trigger_row.tgname = 'guard_org_membership_changes'
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
  ), 'the exact sole organization membership guard trigger drifted';

  ASSERT 1 = (
    SELECT count(*)
    FROM pg_trigger AS trigger_row
    WHERE trigger_row.tgrelid = 'public.organization_members'::regclass
      AND NOT trigger_row.tgisinternal
  ), 'an unexpected organization membership trigger exists';

  ASSERT NOT EXISTS (
    WITH expected(
      trigger_name, function_name, trigger_type, enabled_state, definition
    ) AS (
      VALUES
        ('trg_agent_tasks_updated_at', 'agent_tasks_set_updated_at()', 19::smallint, 'O'::"char", 'createtriggertrg_agent_tasks_updated_atbeforeupdateonagent_tasksforeachrowexecutefunctionagent_tasks_set_updated_at()'),
        ('trg_agent_tasks_transition', 'enforce_agent_task_transition()', 19::smallint, 'O'::"char", 'createtriggertrg_agent_tasks_transitionbeforeupdateofstatusonagent_tasksforeachrowexecutefunctionenforce_agent_task_transition()'),
        ('trg_agent_tasks_audit', 'agent_task_audit_trigger()', 29::smallint, 'O'::"char", 'createtriggertrg_agent_tasks_auditafterinsertordeleteorupdateonagent_tasksforeachrowexecutefunctionagent_task_audit_trigger()')
    ),
    actual AS (
      SELECT
        trigger_row.tgname,
        replace(regexp_replace(lower(trigger_row.tgfoid::regprocedure::text), '\s+', '', 'g'), 'public.', ''),
        trigger_row.tgtype,
        trigger_row.tgenabled,
        replace(regexp_replace(lower(pg_get_triggerdef(trigger_row.oid, false)), '\s+', '', 'g'), 'public.', '')
      FROM pg_trigger AS trigger_row
      WHERE trigger_row.tgrelid = 'public.agent_tasks'::regclass
        AND NOT trigger_row.tgisinternal
    )
    SELECT 1 FROM (
      (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)
      UNION ALL
      (SELECT * FROM actual EXCEPT ALL SELECT * FROM expected)
    ) AS drift
  ), 'the complete agent_tasks trigger manifest drifted';
END
$dependent_catalog_contract$;

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'c4840000-0000-4000-8000-000000000001',
    'role', 'authenticated'
  )::text,
  true
);
SET LOCAL ROLE authenticated;

DO $identity_binding_contract$
DECLARE
  actor_id constant uuid := 'c4840000-0000-4000-8000-000000000001';
  other_id constant uuid := 'c4840000-0000-4000-8000-000000000002';
  org_id constant uuid := 'c4840000-0000-4000-8000-000000000010';
  project_id constant uuid := 'c4840000-0000-4000-8000-000000000020';
  thread_id constant uuid := 'c4840000-0000-4000-8000-000000000030';
BEGIN
  ASSERT public.is_comms_admin(actor_id),
    'the current admin must retain comms-admin access';
  ASSERT NOT public.is_comms_admin(other_id),
    'a foreign admin UUID must not override auth.uid';

  ASSERT public.is_comms_thread_participant(thread_id, actor_id),
    'the current participant must retain thread access';
  ASSERT NOT public.is_comms_thread_participant(thread_id, other_id),
    'a foreign participant UUID must not override auth.uid';

  ASSERT public.is_coordination_party(project_id, actor_id),
    'the current coordination party must retain access';
  ASSERT public.is_coordination_party(project_id),
    'the coordination-party auth.uid default must retain access';
  ASSERT NOT public.is_coordination_party(project_id, other_id),
    'a foreign coordination-party UUID must not override auth.uid';

  ASSERT public.is_org_admin_or_owner(org_id, actor_id),
    'the current org admin must retain access';
  ASSERT public.is_org_admin_or_owner(org_id),
    'the org-membership auth.uid default must retain access';
  ASSERT NOT public.is_org_admin_or_owner(org_id, other_id),
    'a foreign org owner UUID must not override auth.uid';

  ASSERT public.is_project_team_member(project_id, actor_id),
    'the current team member must retain access';
  ASSERT public.is_project_team_member(project_id),
    'the project-membership auth.uid default must retain access';
  ASSERT NOT public.is_project_team_member(project_id, other_id),
    'a foreign team-member UUID must not override auth.uid';

  ASSERT public.user_has_role_domain(actor_id, 'admin'),
    'the current role-domain membership must retain access';
  ASSERT NOT public.user_has_role_domain(other_id, 'admin'),
    'a foreign role-domain UUID must not override auth.uid';

  ASSERT public.user_has_role(actor_id, 'super_admin'),
    'the current named role must retain access';
  ASSERT NOT public.user_has_role(other_id, 'super_admin'),
    'a foreign named-role UUID must not override auth.uid';

  BEGIN
    PERFORM public._primary_studio_for(other_id);
    RAISE EXCEPTION
      'authenticated directly executed the internal primary-studio helper';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.is_org_owner(org_id, other_id);
    RAISE EXCEPTION
      'authenticated directly executed the internal ownership helper';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$identity_binding_contract$;

-- A pooled session must observe canonical role and membership changes on the
-- very next call; no JWT metadata or connection-local cache may outlive them.
RESET ROLE;
DELETE FROM public.user_roles AS user_role
USING public.roles AS role_row
WHERE user_role.role_id = role_row.id
  AND user_role.user_id = 'c4840000-0000-4000-8000-000000000001'
  AND role_row.name = 'super_admin';

SET LOCAL ROLE authenticated;
DO $role_revocation_freshness_contract$
BEGIN
  ASSERT NOT public.is_comms_admin(
    'c4840000-0000-4000-8000-000000000001'
  ), 'a canonical role revocation was not visible on the next call';
  ASSERT NOT public.user_has_role(
    'c4840000-0000-4000-8000-000000000001', 'super_admin'
  ), 'a revoked canonical role remained visible on the pooled session';
END
$role_revocation_freshness_contract$;

RESET ROLE;
INSERT INTO public.user_roles (user_id, role_id)
SELECT
  'c4840000-0000-4000-8000-000000000001'::uuid,
  role_row.id
FROM public.roles AS role_row
WHERE role_row.name = 'super_admin';

UPDATE public.organization_members
SET status = 'suspended'
WHERE organization_id = 'c4840000-0000-4000-8000-000000000010'
  AND user_id = 'c4840000-0000-4000-8000-000000000001';

SET LOCAL ROLE authenticated;
DO $membership_revocation_freshness_contract$
BEGIN
  ASSERT public.is_comms_admin(
    'c4840000-0000-4000-8000-000000000001'
  ), 'a restored canonical role was not visible on the next call';
  ASSERT NOT public.is_org_admin_or_owner(
    'c4840000-0000-4000-8000-000000000010',
    'c4840000-0000-4000-8000-000000000001'
  ), 'an inactive membership remained authorized on the next call';
END
$membership_revocation_freshness_contract$;

RESET ROLE;
UPDATE public.organization_members
SET status = 'active'
WHERE organization_id = 'c4840000-0000-4000-8000-000000000010'
  AND user_id = 'c4840000-0000-4000-8000-000000000001';

SET LOCAL ROLE authenticated;
DO $membership_restore_freshness_contract$
BEGIN
  ASSERT public.is_org_admin_or_owner(
    'c4840000-0000-4000-8000-000000000010',
    'c4840000-0000-4000-8000-000000000001'
  ), 'a restored active membership was not visible on the next call';
END
$membership_restore_freshness_contract$;

DO $rls_object_scope_contract$
DECLARE
  affected_rows integer;
  created_studio public.organizations;
BEGIN
  SELECT *
  INTO created_studio
  FROM public.create_studio_workspace(
    'RPC Contract Created Studio C484'
  );
  ASSERT EXISTS (
    SELECT 1
    FROM public.organization_members AS membership
    WHERE membership.organization_id = created_studio.id
      AND membership.user_id =
            'c4840000-0000-4000-8000-000000000001'
      AND membership.role = 'owner'
      AND membership.status = 'active'
  ), 'the canonical workspace RPC did not create its bound owner';

  BEGIN
    PERFORM public.create_studio_workspace('   ');
    RAISE EXCEPTION 'the workspace RPC accepted a blank name';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'invalid_name' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    INSERT INTO public.organizations (id, type, name, slug, status)
    VALUES (
      'c4840000-0000-4000-8000-000000000012',
      'design_studio',
      'Unauthorized Raw Studio',
      'unauthorized-raw-studio-c484',
      'active'
    );
    RAISE EXCEPTION 'raw authenticated organization INSERT succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  INSERT INTO public.organization_members (
    user_id, organization_id, role, status, joined_at
  ) VALUES (
    'c4840000-0000-4000-8000-000000000003',
    'c4840000-0000-4000-8000-000000000010',
    'member', 'active', now()
  );
  ASSERT EXISTS (
    SELECT 1
    FROM public.organization_members AS membership
    WHERE membership.organization_id =
            'c4840000-0000-4000-8000-000000000010'
      AND membership.user_id =
            'c4840000-0000-4000-8000-000000000003'
  ), 'a current org admin could not add an ordinary member';

  UPDATE public.organization_members
  SET status = 'suspended'
  WHERE organization_id = 'c4840000-0000-4000-8000-000000000010'
    AND user_id = 'c4840000-0000-4000-8000-000000000003';
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  ASSERT affected_rows = 1,
    'a current org admin could not update an ordinary member';
  ASSERT EXISTS (
    SELECT 1
    FROM public.organization_members AS membership
    WHERE membership.organization_id =
            'c4840000-0000-4000-8000-000000000010'
      AND membership.user_id =
            'c4840000-0000-4000-8000-000000000003'
      AND membership.status = 'suspended'
  ), 'the same-organization member update did not persist';

  DELETE FROM public.organization_members
  WHERE organization_id = 'c4840000-0000-4000-8000-000000000010'
    AND user_id = 'c4840000-0000-4000-8000-000000000003';
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  ASSERT affected_rows = 1,
    'a current org admin could not delete an ordinary member';
  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.organization_members AS membership
    WHERE membership.organization_id =
            'c4840000-0000-4000-8000-000000000010'
      AND membership.user_id =
            'c4840000-0000-4000-8000-000000000003'
  ), 'the same-organization member delete did not persist';

  BEGIN
    UPDATE public.organization_members
    SET role = 'owner'
    WHERE organization_id = 'c4840000-0000-4000-8000-000000000010'
      AND user_id = 'c4840000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'an organization admin self-promoted to owner';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.organization_members (
      user_id, organization_id, role, status, joined_at
    ) VALUES (
      'c4840000-0000-4000-8000-000000000004',
      'c4840000-0000-4000-8000-000000000010',
      'owner', 'active', now()
    );
    RAISE EXCEPTION 'an organization admin inserted a confederate owner';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  UPDATE public.organization_members
  SET user_id = 'c4840000-0000-4000-8000-000000000004'
  WHERE organization_id = 'c4840000-0000-4000-8000-000000000010'
    AND user_id = 'c4840000-0000-4000-8000-000000000002';
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  ASSERT affected_rows = 0,
    'an organization admin could update an existing owner row';

  UPDATE public.organization_members
  SET organization_id = created_studio.id
  WHERE organization_id = 'c4840000-0000-4000-8000-000000000010'
    AND user_id = 'c4840000-0000-4000-8000-000000000002';
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  ASSERT affected_rows = 0,
    'an organization admin could move an existing owner row';

  ASSERT EXISTS (
    SELECT 1
    FROM public.organization_members AS membership
    WHERE membership.organization_id =
            'c4840000-0000-4000-8000-000000000010'
      AND membership.user_id =
            'c4840000-0000-4000-8000-000000000002'
      AND membership.role = 'owner'
      AND membership.status = 'active'
  ), 'owner identity mutation changed the canonical active owner';

  BEGIN
    UPDATE public.organization_members
    SET role = 'owner'
    WHERE organization_id = 'c4840000-0000-4000-8000-000000000013'
      AND user_id = 'c4840000-0000-4000-8000-000000000001';
    RAISE EXCEPTION
      'an active admin claimed an ownerless nonempty organization';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.organization_members (
      user_id, organization_id, role, status, joined_at
    ) VALUES (
      'c4840000-0000-4000-8000-000000000003',
      'c4840000-0000-4000-8000-000000000013',
      'owner', 'active', now()
    );
    RAISE EXCEPTION
      'an active admin inserted an owner into an ownerless nonempty org';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  ASSERT EXISTS (
    SELECT 1
    FROM public.organization_members AS membership
    WHERE membership.organization_id =
            'c4840000-0000-4000-8000-000000000013'
      AND membership.user_id =
            'c4840000-0000-4000-8000-000000000001'
      AND membership.role = 'admin'
      AND membership.status = 'active'
  ), 'ownerless-organization denial changed its existing admin';
  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.organization_members AS membership
    WHERE membership.organization_id =
            'c4840000-0000-4000-8000-000000000013'
      AND membership.role = 'owner'
  ), 'authenticated access created an owner in a nonempty ownerless org';

  BEGIN
    INSERT INTO public.organization_members (
      user_id, organization_id, role, status, joined_at
    ) VALUES (
      'c4840000-0000-4000-8000-000000000001',
      'c4840000-0000-4000-8000-000000000011',
      'owner', 'active', now()
    );
    RAISE EXCEPTION
      'an authenticated nonmember self-inserted as a foreign org owner';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  ASSERT EXISTS (
    SELECT 1
    FROM public.organization_members AS membership
    WHERE membership.organization_id =
            'c4840000-0000-4000-8000-000000000010'
      AND membership.user_id =
            'c4840000-0000-4000-8000-000000000002'
  ), 'an org admin lost same-organization member visibility';
  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.organization_members AS membership
    WHERE membership.organization_id =
            'c4840000-0000-4000-8000-000000000011'
  ), 'an org admin saw another organization membership';

  ASSERT EXISTS (
    SELECT 1
    FROM public.projects AS project
    WHERE project.id = 'c4840000-0000-4000-8000-000000000020'
  ), 'a project participant lost its project';
  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.projects AS project
    WHERE project.id = 'c4840000-0000-4000-8000-000000000060'
  ), 'a project participant saw another project';

  ASSERT EXISTS (
    SELECT 1
    FROM public.project_team_members AS team_member
    WHERE team_member.project_id =
            'c4840000-0000-4000-8000-000000000020'
      AND team_member.user_id =
            'c4840000-0000-4000-8000-000000000002'
  ), 'a team member lost same-project membership visibility';
  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.project_team_members AS team_member
    WHERE team_member.project_id =
            'c4840000-0000-4000-8000-000000000060'
  ), 'a team member saw another project membership';

  ASSERT EXISTS (
    SELECT 1
    FROM public.project_documents AS document
    WHERE document.id = 'c4840000-0000-4000-8000-000000000070'
  ), 'a team member lost its project document';
  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.project_documents AS document
    WHERE document.id = 'c4840000-0000-4000-8000-000000000071'
  ), 'a team member saw another project document';

  ASSERT EXISTS (
    SELECT 1
    FROM public.project_tasks AS task
    WHERE task.id = 'c4840000-0000-4000-8000-000000000072'
  ), 'a team member lost its project task';
  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.project_tasks AS task
    WHERE task.id = 'c4840000-0000-4000-8000-000000000073'
  ), 'a team member saw another project task';

  ASSERT EXISTS (
    SELECT 1
    FROM public.project_time_entries AS time_entry
    WHERE time_entry.id = 'c4840000-0000-4000-8000-000000000074'
  ), 'a team member lost its project time entry';
  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.project_time_entries AS time_entry
    WHERE time_entry.id = 'c4840000-0000-4000-8000-000000000075'
  ), 'a team member saw another project time entry';

  INSERT INTO public.project_time_entries (
    id, project_id, user_id, duration_minutes, notes
  ) VALUES (
    'c4840000-0000-4000-8000-000000000077',
    'c4840000-0000-4000-8000-000000000020',
    'c4840000-0000-4000-8000-000000000001',
    45,
    'authorized insert'
  );
  ASSERT EXISTS (
    SELECT 1
    FROM public.project_time_entries AS time_entry
    WHERE time_entry.id = 'c4840000-0000-4000-8000-000000000077'
      AND time_entry.duration_minutes = 45
  ), 'a team member could not insert its own project time entry';

  UPDATE public.project_time_entries
  SET duration_minutes = 60,
      notes = 'authorized update'
  WHERE id = 'c4840000-0000-4000-8000-000000000077';
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  ASSERT affected_rows = 1,
    'a team member could not update its own project time entry';
  ASSERT EXISTS (
    SELECT 1
    FROM public.project_time_entries AS time_entry
    WHERE time_entry.id = 'c4840000-0000-4000-8000-000000000077'
      AND time_entry.duration_minutes = 60
      AND time_entry.notes = 'authorized update'
  ), 'the same-project time-entry update did not persist';

  DELETE FROM public.project_time_entries
  WHERE id = 'c4840000-0000-4000-8000-000000000077';
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  ASSERT affected_rows = 1,
    'a team member could not delete its own project time entry';
  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.project_time_entries AS time_entry
    WHERE time_entry.id = 'c4840000-0000-4000-8000-000000000077'
  ), 'the same-project time-entry delete did not persist';

  BEGIN
    UPDATE public.organization_members
    SET joined_at = joined_at
    WHERE organization_id = 'c4840000-0000-4000-8000-000000000011'
      AND user_id = 'c4840000-0000-4000-8000-000000000004';
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    ASSERT affected_rows = 0,
      'an org admin updated another organization membership';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    DELETE FROM public.organization_members
    WHERE organization_id = 'c4840000-0000-4000-8000-000000000011'
      AND user_id = 'c4840000-0000-4000-8000-000000000004';
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    ASSERT affected_rows = 0,
      'an org admin deleted another organization membership';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    UPDATE public.project_time_entries
    SET notes = 'unauthorized update'
    WHERE id = 'c4840000-0000-4000-8000-000000000075';
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    ASSERT affected_rows = 0,
      'a team member updated another project time entry';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    DELETE FROM public.project_time_entries
    WHERE id = 'c4840000-0000-4000-8000-000000000075';
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    ASSERT affected_rows = 0,
      'a team member deleted another project time entry';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.project_time_entries (
      id, project_id, user_id, duration_minutes, notes
    ) VALUES (
      'c4840000-0000-4000-8000-000000000076',
      'c4840000-0000-4000-8000-000000000060',
      'c4840000-0000-4000-8000-000000000001',
      30,
      'unauthorized insert'
    );
    RAISE EXCEPTION
      'a team member inserted time into another project';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$rls_object_scope_contract$;

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'c4840000-0000-4000-8000-000000000002',
    'role', 'authenticated'
  )::text,
  true
);
SET LOCAL ROLE authenticated;

DO $active_owner_transition_contract$
BEGIN
  BEGIN
    PERFORM public.transfer_studio_ownership(
      'c4840000-0000-4000-8000-000000000010',
      'c4840000-0000-4000-8000-000000000002'
    );
    RAISE EXCEPTION 'a sole owner transferred ownership to itself';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'target_not_active_member' THEN
        RAISE;
      END IF;
  END;

  INSERT INTO public.organization_members (
    user_id, organization_id, role, status, joined_at
  ) VALUES (
    'c4840000-0000-4000-8000-000000000003',
    'c4840000-0000-4000-8000-000000000010',
    'member', 'active', now()
  );

  PERFORM public.transfer_studio_ownership(
    'c4840000-0000-4000-8000-000000000010',
    'c4840000-0000-4000-8000-000000000003'
  );
  ASSERT EXISTS (
    SELECT 1
    FROM public.organization_members AS membership
    WHERE membership.organization_id =
            'c4840000-0000-4000-8000-000000000010'
      AND membership.user_id =
            'c4840000-0000-4000-8000-000000000003'
      AND membership.role = 'owner'
      AND membership.status = 'active'
  ), 'the serialized transfer RPC did not promote its active target';
  ASSERT EXISTS (
    SELECT 1
    FROM public.organization_members AS membership
    WHERE membership.organization_id =
            'c4840000-0000-4000-8000-000000000010'
      AND membership.user_id =
            'c4840000-0000-4000-8000-000000000002'
      AND membership.role = 'admin'
      AND membership.status = 'active'
  ), 'the serialized transfer RPC did not demote its caller';
END
$active_owner_transition_contract$;

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'c4840000-0000-4000-8000-000000000003',
    'role', 'authenticated'
  )::text,
  true
);
SET LOCAL ROLE authenticated;

SELECT public.transfer_studio_ownership(
  'c4840000-0000-4000-8000-000000000010',
  'c4840000-0000-4000-8000-000000000002'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'c4840000-0000-4000-8000-000000000002',
    'role', 'authenticated'
  )::text,
  true
);
SET LOCAL ROLE authenticated;

DO $direct_owner_write_denial_contract$
DECLARE
  affected_rows integer;
BEGIN
  UPDATE public.organization_members
  SET role = 'admin'
  WHERE organization_id = 'c4840000-0000-4000-8000-000000000010'
    AND user_id = 'c4840000-0000-4000-8000-000000000002';
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  ASSERT affected_rows = 0,
    'authenticated directly updated an active owner row';

  DELETE FROM public.organization_members
  WHERE organization_id = 'c4840000-0000-4000-8000-000000000010'
    AND user_id = 'c4840000-0000-4000-8000-000000000002';
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  ASSERT affected_rows = 0,
    'authenticated directly deleted an active owner row';

  ASSERT EXISTS (
    SELECT 1
    FROM public.organization_members AS membership
    WHERE membership.organization_id =
            'c4840000-0000-4000-8000-000000000010'
      AND membership.user_id =
            'c4840000-0000-4000-8000-000000000002'
      AND membership.role = 'owner'
      AND membership.status = 'active'
  ), 'the round-trip serialized transfer did not restore the original owner';

  DELETE FROM public.organization_members
  WHERE organization_id = 'c4840000-0000-4000-8000-000000000010'
    AND user_id = 'c4840000-0000-4000-8000-000000000003';
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  ASSERT affected_rows = 1,
    'the current owner could not delete a non-owner member';
END
$direct_owner_write_denial_contract$;

RESET ROLE;

DO $owner_guard_defense_in_depth_contract$
BEGIN
  BEGIN
    INSERT INTO public.organization_members (
      user_id, organization_id, role, status, joined_at
    ) VALUES (
      'c4840000-0000-4000-8000-000000000003',
      'c4840000-0000-4000-8000-000000000013',
      'owner', 'active', now()
    );
    RAISE EXCEPTION
      'the guard treated a nonempty ownerless org as first-owner bootstrap';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'owner_insert_requires_owner' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    UPDATE public.organization_members
    SET role = 'admin'
    WHERE organization_id = 'c4840000-0000-4000-8000-000000000010'
      AND user_id = 'c4840000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'the guard allowed deletion of the final active owner';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'last_owner_protected' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    UPDATE public.organization_members
    SET user_id = 'c4840000-0000-4000-8000-000000000004'
    WHERE organization_id = 'c4840000-0000-4000-8000-000000000010'
      AND user_id = 'c4840000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'the guard allowed an owner user_id rewrite';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'membership_identity_immutable' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    UPDATE public.organization_members
    SET organization_id = 'c4840000-0000-4000-8000-000000000013'
    WHERE organization_id = 'c4840000-0000-4000-8000-000000000010'
      AND user_id = 'c4840000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'the guard allowed an owner organization_id rewrite';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'membership_identity_immutable' THEN
        RAISE;
      END IF;
  END;
END
$owner_guard_defense_in_depth_contract$;

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'c4840000-0000-4000-8000-000000000001',
    'role', 'service_role'
  )::text,
  true
);
SET LOCAL ROLE service_role;

DO $database_service_recovery_contract$
BEGIN
  BEGIN
    UPDATE public.organization_members
    SET user_id = 'c4840000-0000-4000-8000-000000000004'
    WHERE organization_id = 'c4840000-0000-4000-8000-000000000010'
      AND user_id = 'c4840000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'service_role bypassed membership identity immutability';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'membership_identity_immutable' THEN
        RAISE;
      END IF;
  END;

  UPDATE public.organization_members
  SET role = 'owner'
  WHERE organization_id = 'c4840000-0000-4000-8000-000000000013'
    AND user_id = 'c4840000-0000-4000-8000-000000000001';
  ASSERT EXISTS (
    SELECT 1
    FROM public.organization_members AS membership
    WHERE membership.organization_id =
            'c4840000-0000-4000-8000-000000000013'
      AND membership.user_id =
            'c4840000-0000-4000-8000-000000000001'
      AND membership.role = 'owner'
      AND membership.status = 'active'
  ), 'the real service_role could not recover an ownerless organization';

  UPDATE public.organization_members
  SET role = 'admin'
  WHERE organization_id = 'c4840000-0000-4000-8000-000000000013'
    AND user_id = 'c4840000-0000-4000-8000-000000000001';
END
$database_service_recovery_contract$;

INSERT INTO public.organization_members (
  user_id, organization_id, role, status, joined_at
) VALUES (
  'c4840000-0000-4000-8000-000000000004',
  'c4840000-0000-4000-8000-000000000010',
  'owner', 'suspended', now()
);

RESET ROLE;
-- A forged JWT role claim does not activate the service bypass. The actual
-- database role remains authenticated for this transition attempt.
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'c4840000-0000-4000-8000-000000000001',
    'role', 'service_role'
  )::text,
  true
);
SET LOCAL ROLE authenticated;

DO $forged_service_role_denial_contract$
DECLARE
  affected_rows integer;
BEGIN
  UPDATE public.organization_members
  SET status = 'active'
  WHERE organization_id = 'c4840000-0000-4000-8000-000000000010'
    AND user_id = 'c4840000-0000-4000-8000-000000000004';
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  ASSERT affected_rows = 0,
    'a forged service_role JWT reached an owner-row transition';

  ASSERT EXISTS (
    SELECT 1
    FROM public.organization_members AS membership
    WHERE membership.organization_id =
            'c4840000-0000-4000-8000-000000000010'
      AND membership.user_id =
            'c4840000-0000-4000-8000-000000000004'
      AND membership.role = 'owner'
      AND membership.status = 'suspended'
  ), 'the denied owner reactivation changed membership state';
END
$forged_service_role_denial_contract$;

RESET ROLE;
SET LOCAL ROLE service_role;

UPDATE public.organization_members
SET status = 'active'
WHERE organization_id = 'c4840000-0000-4000-8000-000000000010'
  AND user_id = 'c4840000-0000-4000-8000-000000000004';

DO $database_service_role_contract$
BEGIN
  ASSERT EXISTS (
    SELECT 1
    FROM public.organization_members AS membership
    WHERE membership.organization_id =
            'c4840000-0000-4000-8000-000000000010'
      AND membership.user_id =
            'c4840000-0000-4000-8000-000000000004'
      AND membership.role = 'owner'
      AND membership.status = 'active'
  ), 'the active service_role database role lost its reviewed bypass';
END
$database_service_role_contract$;

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'c4840000-0000-4000-8000-000000000002',
    'role', 'authenticated'
  )::text,
  true
);
SET LOCAL ROLE authenticated;

DO $multi_owner_self_transfer_denial_contract$
BEGIN
  BEGIN
    PERFORM public.transfer_studio_ownership(
      'c4840000-0000-4000-8000-000000000010',
      'c4840000-0000-4000-8000-000000000002'
    );
    RAISE EXCEPTION 'an owner transferred ownership to itself in a multi-owner studio';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'target_not_active_member' THEN
        RAISE;
      END IF;
  END;
END
$multi_owner_self_transfer_denial_contract$;

RESET ROLE;
SET LOCAL ROLE service_role;

DELETE FROM public.organization_members
WHERE organization_id = 'c4840000-0000-4000-8000-000000000010'
  AND user_id = 'c4840000-0000-4000-8000-000000000004';

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'c4840000-0000-4000-8000-000000000003',
    'role', 'authenticated',
    'userId', 'c4840000-0000-4000-8000-000000000001',
    'actor', 'c4840000-0000-4000-8000-000000000001',
    'organization_id', 'c4840000-0000-4000-8000-000000000010',
    'roles', jsonb_build_array('super_admin'),
    'permissions', jsonb_build_array('comms.admin.all'),
    'app_metadata', jsonb_build_object(
      'roles', jsonb_build_array('super_admin'),
      'permissions', jsonb_build_array('comms.admin.all')
    )
  )::text,
  true
);
SET LOCAL ROLE authenticated;

DO $legacy_role_denial_contract$
BEGIN
  ASSERT NOT public.is_comms_admin(
    'c4840000-0000-4000-8000-000000000003'
  ), 'legacy profiles.role must not confer comms-admin authority';
END
$legacy_role_denial_contract$;

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'c4840000-0000-4000-8000-000000000001',
    'role', 'authenticated'
  )::text,
  true
);
SET LOCAL ROLE authenticated;

DO $product_scope_contract$
BEGIN
  ASSERT EXISTS (
    SELECT 1
    FROM public.find_products_similar_to(
      'c4840000-0000-4000-8000-000000000041', 1000
    ) AS match
    WHERE match.id = 'c4840000-0000-4000-8000-000000000042'
  ), 'published catalog similarity result is missing';

  ASSERT 50 = (
    SELECT count(*)
    FROM public.find_products_similar_to(
      'c4840000-0000-4000-8000-000000000041', 1000
    )
  ), 'similarity result count is not capped at 50';

  ASSERT EXISTS (
    SELECT 1
    FROM public.find_products_similar_to(
      'c4840000-0000-4000-8000-000000000041'
    ) AS match
    WHERE match.id = 'c4840000-0000-4000-8000-000000000042'
  ), 'default similarity limit no longer returns a catalog result';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.find_products_similar_to(
      'c4840000-0000-4000-8000-000000000041', 1000
    ) AS match
    WHERE match.id IN (
      'c4840000-0000-4000-8000-000000000043',
      'c4840000-0000-4000-8000-000000000044'
    )
  ), 'similarity results leaked a private or unpublished product';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.find_products_similar_to(
      'c4840000-0000-4000-8000-000000000043', 50
    )
  ), 'a personal product was accepted as a similarity source';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.find_products_similar_to(
      'c4840000-0000-4000-8000-000000000044', 50
    )
  ), 'an unpublished product was accepted as a similarity source';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.find_products_similar_to(
      'c4840000-0000-4000-8000-000000000041', -1
    )
  ), 'negative similarity limits must be bounded to zero';

  ASSERT EXISTS (
    SELECT 1
    FROM public.find_products_for_style(
      'c4840000-0000-4000-8000-000000000040', 1000
    ) AS match
    WHERE match.id = 'c4840000-0000-4000-8000-000000000042'
  ), 'published catalog style result is missing';

  ASSERT 50 = (
    SELECT count(*)
    FROM public.find_products_for_style(
      'c4840000-0000-4000-8000-000000000040', 1000
    )
  ), 'style result count is not capped at 50';

  ASSERT EXISTS (
    SELECT 1
    FROM public.find_products_for_style(
      'c4840000-0000-4000-8000-000000000040'
    ) AS match
    WHERE match.id = 'c4840000-0000-4000-8000-000000000042'
  ), 'default style limit no longer returns a catalog result';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.find_products_for_style(
      'c4840000-0000-4000-8000-000000000040', 1000
    ) AS match
    WHERE match.id IN (
      'c4840000-0000-4000-8000-000000000043',
      'c4840000-0000-4000-8000-000000000044'
    )
  ), 'style results leaked a private or unpublished product';

  ASSERT EXISTS (
    SELECT 1
    FROM public.search_products(
      'CF484Scope Published Result',
      NULL, NULL, NULL, NULL, 'relevance', 1000, -1
    ) AS match
    WHERE match.id = 'c4840000-0000-4000-8000-000000000042'
  ), 'published catalog text-search result is missing';

  ASSERT EXISTS (
    SELECT 1
    FROM public.search_products(
      search_query => 'CF484Scope Published Result'
    ) AS match
    WHERE match.id = 'c4840000-0000-4000-8000-000000000042'
  ), 'default text-search arguments no longer return a catalog result';

  ASSERT EXISTS (
    SELECT 1
    FROM public.search_products(
      search_query => 'CF484Scope Published Result',
      category_filter => 'cf484-reviewed'
    ) AS match
    WHERE match.id = 'c4840000-0000-4000-8000-000000000042'
  ), 'category filter rejected a matching catalog category';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.search_products(
      search_query => 'CF484Scope Published Result',
      category_filter => 'cf484-other'
    )
  ), 'category filter did not exclude a different catalog category';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.search_products(
      'CF484Scope Personal Product',
      NULL, NULL, NULL, NULL, 'relevance', 1000, -1
    )
  ), 'text search leaked a private product';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.search_products(
      'CF484Scope Draft Catalog',
      NULL, NULL, NULL, NULL, 'relevance', 1000, -1
    )
  ), 'text search leaked a private or unpublished product';

  ASSERT 100 = (
    SELECT count(*)
    FROM public.search_products(
      'CF484Scope', NULL, NULL, NULL, NULL, 'relevance', 1000, -1
    )
  ), 'text-search result count is not capped at 100';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.search_products(
      'CF484Scope', NULL, NULL, NULL, NULL, 'relevance', -1, 0
    )
  ), 'negative text-search limits must be bounded to zero';
END
$product_scope_contract$;

DO $decision_subject_contract$
DECLARE
  actor_id constant uuid := 'c4840000-0000-4000-8000-000000000001';
  other_id constant uuid := 'c4840000-0000-4000-8000-000000000002';
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM public.get_decision_analytics_by_type(actor_id)
  ), 'current designer type analytics are missing';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.get_decision_analytics_by_type(other_id)
  ), 'foreign designer type analytics leaked';

  ASSERT EXISTS (
    SELECT 1 FROM public.get_decision_analytics_by_client(actor_id)
  ), 'current designer client analytics are missing';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.get_decision_analytics_by_client(other_id)
  ), 'foreign designer client analytics leaked';

  ASSERT EXISTS (
    SELECT 1 FROM public.get_decision_bottleneck_phases(actor_id)
  ), 'current designer phase analytics are missing';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.get_decision_bottleneck_phases(other_id)
  ), 'foreign designer phase analytics leaked';
END
$decision_subject_contract$;

RESET ROLE;
SELECT set_config('request.jwt.claims', '{}', true);
SET LOCAL ROLE authenticated;

DO $missing_identity_contract$
BEGIN
  BEGIN
    PERFORM public.create_studio_workspace(
      'Missing Identity Workspace C484'
    );
    RAISE EXCEPTION 'the workspace RPC accepted a missing auth.uid';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'not_authenticated' THEN
        RAISE;
      END IF;
  END;

  ASSERT NOT public.is_comms_admin(
    'c4840000-0000-4000-8000-000000000001'
  ), 'a missing subject must fail closed';
  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.get_decision_analytics_by_type(
      'c4840000-0000-4000-8000-000000000001'
    )
  ), 'analytics must fail closed without auth.uid';
  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.find_products_similar_to(
      'c4840000-0000-4000-8000-000000000041'
    )
  ), 'product similarity must fail closed without auth.uid';
  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.find_products_for_style(
      'c4840000-0000-4000-8000-000000000040'
    )
  ), 'style search must fail closed without auth.uid';
  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.search_products(search_query => 'CF484Scope')
  ), 'text search must fail closed without auth.uid';
END
$missing_identity_contract$;

RESET ROLE;

DO $missing_identity_workspace_rollback_contract$
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.organizations AS organization
    WHERE organization.name = 'Missing Identity Workspace C484'
  ), 'the missing-identity workspace call persisted an organization';
  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.organization_members AS membership
    JOIN public.organizations AS organization
      ON organization.id = membership.organization_id
    WHERE organization.name = 'Missing Identity Workspace C484'
  ), 'the missing-identity workspace call persisted a membership';
END
$missing_identity_workspace_rollback_contract$;

SET LOCAL ROLE agent_writer;

SELECT (
  public.enqueue_agent_task(
    p_task_type => 'cf484.authorization_contract',
    p_payload => '{"rollback_safe":true}'::jsonb,
    p_idempotency_key => 'cf484-agent-writer-rpc-only',
    p_actor => 'cf484-contract-test'
  )
).id AS agent_task_id;

RESET ROLE;

DO $agent_rpc_contract$
BEGIN
  ASSERT EXISTS (
    SELECT 1
    FROM public.agent_tasks AS task
    WHERE task.idempotency_key = 'cf484-agent-writer-rpc-only'
      AND task.task_type = 'cf484.authorization_contract'
  ), 'agent_writer could not enqueue through the audited RPC';

  ASSERT EXISTS (
    SELECT 1
    FROM public.agent_task_audit AS audit
    JOIN public.agent_tasks AS task ON task.id = audit.task_id
    WHERE task.idempotency_key = 'cf484-agent-writer-rpc-only'
      AND audit.op = 'INSERT'
      AND audit.actor = 'cf484-contract-test'
  ), 'the Agent OS RPC did not retain its audit actor';

  ASSERT NOT has_table_privilege(
    'agent_writer', 'public.agent_tasks', 'SELECT'
  ), 'agent_writer regained agent_tasks SELECT';
  ASSERT NOT has_table_privilege(
    'agent_writer', 'public.agent_tasks', 'INSERT'
  ), 'agent_writer regained agent_tasks INSERT';
END
$agent_rpc_contract$;

ROLLBACK;
