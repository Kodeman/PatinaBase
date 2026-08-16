-- Real-Postgres contract tests for migration 00485.
-- Run after a clean reset and the privileged local platform runner:
--   ./scripts/run-public-acl-psql.sh local \
--     supabase/tests/edge_api/public_sd_hardening_contract_test.sql
-- Test-only helper replacements and every fixture are transaction-local.

\set ON_ERROR_STOP on

BEGIN;

SET LOCAL plpgsql.check_asserts = on;
SET LOCAL statement_timeout = '60s';

DO $assertion_preflight$
BEGIN
  IF current_setting('plpgsql.check_asserts') <> 'on' THEN
    RAISE EXCEPTION '00485 test requires plpgsql.check_asserts=on';
  END IF;
END
$assertion_preflight$;

CREATE TEMP TABLE _00485_expected_public (
  signature text PRIMARY KEY,
  arguments text NOT NULL,
  result_type text NOT NULL,
  final_config text[] NOT NULL,
  body_sha256 text NOT NULL,
  direct_roles text[] NOT NULL
) ON COMMIT DROP;

INSERT INTO _00485_expected_public (
  signature, arguments, result_type, final_config, body_sha256, direct_roles
)
VALUES
  (
    'public.accept_trade_scope_with_trusted_ip(uuid,text,uuid,text)',
    'p_proposal_id uuid, p_signed_name text, p_client_id uuid, p_signed_ip text DEFAULT NULL::text',
    'jsonb', ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '66c3128ffcfcea9b9f43c3a5b7db7b003fcd0189af3ee26a15e71d69139ead4f',
    ARRAY['service_role']::text[]
  ),
  (
    'public.begin_proposal_send_provider_attempt(uuid,uuid)',
    'p_dispatch_id uuid, p_claim_token uuid', 'jsonb',
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    'd397dff1554e3900ae88a36c03f99fc0de8dfed0f3756b454c908d7a7c758427',
    ARRAY['service_role']::text[]
  ),
  (
    'public.complete_proposal_send_dispatch(uuid,uuid,text,text,text)',
    'p_dispatch_id uuid, p_claim_token uuid, p_delivery_state text, p_provider_id text DEFAULT NULL::text, p_error text DEFAULT NULL::text',
    'jsonb', ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '3c4c0ad27c8ff731bd9195ba231c55d7e2d89e7c0fb106303457cc26591fc46f',
    ARRAY['service_role']::text[]
  ),
  (
    'public.consume_board_unfurl_quota(uuid)',
    'p_user_id uuid DEFAULT NULL::uuid', 'jsonb',
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '310624681b340da2ef06a057a03f2d43962a3d19f0bffa35f5722ff4cc1eb992',
    ARRAY['service_role']::text[]
  ),
  (
    'public.execute_furnishings_authorization_with_trusted_ip(uuid,text,uuid,text)',
    'p_proposal_id uuid, p_signed_name text, p_client_id uuid, p_signed_ip text DEFAULT NULL::text',
    'jsonb', ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '2caebad912c73b5d4a80c91a9e1608c2fdc8b9e6d020839ca04ff84f58ee4283',
    ARRAY['service_role']::text[]
  ),
  (
    'public.execute_trade_scope_with_trusted_ip(uuid,text,uuid,text)',
    'p_proposal_id uuid, p_signed_name text, p_client_id uuid, p_signed_ip text DEFAULT NULL::text',
    'jsonb', ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '83b0a7f5a54c33a80c3e9333603f3c4391cfa0f1913feb21ed1c1bb645017a12',
    ARRAY['service_role']::text[]
  ),
  (
    'public.issue_trade_draw_invoice(uuid)', 'p_draw_id uuid', 'jsonb',
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    'b63830994f1173424a3a798a8d969fbeae946c5eb5d97bd3b3cbaaf51d8b8aa9',
    ARRAY['authenticated']::text[]
  ),
  (
    'public.notify_decision_overdue(uuid)', 'p_decision_id uuid', 'uuid',
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    'f3ef2f42fa4667fce41e01342d0cea6df256f9df50940f32ce65e6c46fd64030',
    ARRAY['service_role']::text[]
  ),
  (
    'public.notify_decision_required(uuid)', 'p_decision_id uuid', 'uuid',
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    'f785ab8588cc55a693a146984a71319e7afe9e27cbfee1154fc08d4b9c68156e',
    ARRAY['service_role']::text[]
  ),
  (
    'public.notify_decision_resolved(uuid)', 'p_decision_id uuid', 'uuid',
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '6e0a32a2fbc1a57d7c4da7fca2d108d2b813923ec58ec731a132a66d36958483',
    ARRAY['service_role']::text[]
  ),
  (
    'public.prepare_spec_book_issue(uuid,text[],text,text,uuid,text,jsonb)',
    'p_spec_book_id uuid, p_audiences text[], p_issue_type text, p_reason text, p_base_revision_id uuid, p_idempotency_key text, p_warning_acknowledgements jsonb DEFAULT ''[]''::jsonb',
    'jsonb', ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '1b63dbc14bcdcc8a7a5b19e7375bf80d117159429b87d2cc5048a2ace9242b4b',
    ARRAY['authenticated']::text[]
  ),
  (
    'public.publish_project_review(jsonb)', 'p_request jsonb', 'jsonb',
    ARRAY['search_path=pg_catalog, public, extensions, pg_temp']::text[],
    'b20d24b78c8169b238cfb2357c9ecde725d584098a340dad50b91ed78ebefeeb',
    ARRAY['authenticated']::text[]
  ),
  (
    'public.release_proposal_send_dispatch(uuid,uuid,text)',
    'p_dispatch_id uuid, p_claim_token uuid, p_error text', 'jsonb',
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    'c42006d734dd3c577ac4282ed6e18ec1a3b371e3ce25c13395d993b451c0c547',
    ARRAY['service_role']::text[]
  ),
  (
    'public.set_invoice_studio_id()', '', 'trigger',
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    'd7652d832a55cd066c0e3f1d12572a4a387447f99a70af1f0d88b4fed258954a',
    ARRAY[]::text[]
  ),
  (
    'public.set_project_studio_id()', '', 'trigger',
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '8597fc772be15ef6201f66aae03744aebb6844c01237694d208b13f2741ee1da',
    ARRAY[]::text[]
  ),
  (
    'public.sign_design_services_agreement_with_trusted_ip(uuid,text,uuid,text)',
    'p_proposal_id uuid, p_signed_name text, p_client_id uuid, p_signed_ip text DEFAULT NULL::text',
    'jsonb', ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '6c615ca417d594865e1f0772ee862c312e7a398d037c141366c8a1b97fd6f17d',
    ARRAY['service_role']::text[]
  ),
  (
    'public.suppress_proposal_send_dispatch(uuid,uuid,text)',
    'p_dispatch_id uuid, p_claim_token uuid, p_reason text', 'jsonb',
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '8656a0f6a7ce43fa1cada96876b37f570e7cc583408f7eab3d3e453990be7d26',
    ARRAY['service_role']::text[]
  );

DO $public_catalog_contract$
BEGIN
  ASSERT (SELECT count(*) FROM _00485_expected_public) = 17,
    'the public hardening manifest must contain exactly 17 rows';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM _00485_expected_public AS expected
    LEFT JOIN pg_proc AS routine
      ON routine.oid = to_regprocedure(expected.signature)
    LEFT JOIN pg_roles AS owner ON owner.oid = routine.proowner
    LEFT JOIN pg_language AS language ON language.oid = routine.prolang
    WHERE routine.oid IS NULL
      OR owner.rolname IS DISTINCT FROM 'postgres'
      OR language.lanname IS DISTINCT FROM 'plpgsql'
      OR routine.prokind <> 'f'
      OR NOT routine.prosecdef
      OR routine.provolatile <> 'v'
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
  ), 'a public 00485 identity, semantic profile, or body hash drifted';

  ASSERT NOT EXISTS (
    WITH expected_acl AS (
      SELECT
        expected.signature,
        role_name AS grantee,
        'postgres'::text AS grantor,
        'EXECUTE'::text AS privilege_type,
        false AS is_grantable
      FROM _00485_expected_public AS expected
      CROSS JOIN LATERAL unnest(expected.direct_roles) AS role_name
    ),
    actual_acl AS (
      SELECT
        expected.signature,
        CASE acl.grantee
          WHEN 0 THEN 'PUBLIC'
          ELSE grantee.rolname::text
        END AS grantee,
        grantor.rolname::text AS grantor,
        acl.privilege_type,
        acl.is_grantable
      FROM _00485_expected_public AS expected
      JOIN pg_proc AS routine
        ON routine.oid = to_regprocedure(expected.signature)
      CROSS JOIN LATERAL aclexplode(
        COALESCE(routine.proacl, acldefault('f', routine.proowner))
      ) AS acl
      LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
      LEFT JOIN pg_roles AS grantor ON grantor.oid = acl.grantor
      WHERE acl.grantee <> routine.proowner
    )
    SELECT 1
    FROM (
      (SELECT * FROM expected_acl EXCEPT ALL SELECT * FROM actual_acl)
      UNION ALL
      (SELECT * FROM actual_acl EXCEPT ALL SELECT * FROM expected_acl)
    ) AS drift
  ), 'a public 00485 direct ACL tuple drifted';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM _00485_expected_public AS expected
    JOIN pg_proc AS routine
      ON routine.oid = to_regprocedure(expected.signature)
    CROSS JOIN LATERAL aclexplode(
      COALESCE(routine.proacl, acldefault('f', routine.proowner))
    ) AS acl
    LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
    LEFT JOIN pg_roles AS grantor ON grantor.oid = acl.grantor
    WHERE acl.grantee <> routine.proowner
      AND acl.privilege_type = 'EXECUTE'
      AND (
        CASE acl.grantee
          WHEN 0 THEN 'PUBLIC'
          ELSE grantee.rolname::text
        END <> ALL(expected.direct_roles)
        OR grantor.rolname IS DISTINCT FROM 'postgres'
        OR acl.is_grantable
      )
  ), 'an unreviewed public 00485 direct EXECUTE tuple exists';
END
$public_catalog_contract$;

CREATE TEMP TABLE _00485_expected_dependency (
  signature text PRIMARY KEY,
  arguments text NOT NULL,
  result_type text NOT NULL,
  final_config text[] NOT NULL,
  body_sha256 text NOT NULL
) ON COMMIT DROP;

INSERT INTO _00485_expected_dependency (
  signature, arguments, result_type, final_config, body_sha256
)
VALUES
  (
    'app_private.issue_invoice_for_actor(uuid,date,uuid)',
    'p_invoice_id uuid, p_due_date date, p_actor_id uuid', 'invoices',
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '855d1e914495ee4c6e8c0e9550478190945fc11940750fad7e0ee7b2aab763c4'
  ),
  (
    'public._execute_furnishings_authorization_authorized(uuid,text,uuid,text)',
    'p_proposal_id uuid, p_signed_name text, p_client_id uuid, p_trusted_signed_ip text DEFAULT NULL::text',
    'jsonb', ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    'cdadc449f368eb12d56d0006e3ccb81d752bdc3388f783e4cd1a6b414923bb84'
  ),
  (
    'public._execute_trade_scope_authorized(uuid,text,uuid,text)',
    'p_proposal_id uuid, p_signed_name text, p_client_id uuid, p_trusted_signed_ip text DEFAULT NULL::text',
    'jsonb', ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '3f8d36043d9d38c275fa802690205a67104add2654eb818a08d5bf7bcdb85a36'
  ),
  (
    'public._prepare_spec_book_issue_00403(uuid,text[],text,text,uuid,text,jsonb)',
    'p_spec_book_id uuid, p_audiences text[], p_issue_type text, p_reason text, p_base_revision_id uuid, p_idempotency_key text, p_warning_acknowledgements jsonb DEFAULT ''[]''::jsonb',
    'jsonb',
    ARRAY['search_path=pg_catalog, public, extensions, pg_temp']::text[],
    '8a06f30204b11f3f3e2551b74944988031d6b776edde0423fcb176f6d963586b'
  ),
  (
    'public._publish_project_review_00448_impl(jsonb)',
    'p_request jsonb', 'jsonb',
    ARRAY['search_path=pg_catalog, public, extensions, pg_temp']::text[],
    '0c3b935559ff383878d7c36f4057378663f52c5825088335c7e62f6c5412295e'
  );

DO $private_dependency_contract$
BEGIN
  ASSERT (SELECT count(*) FROM _00485_expected_dependency) = 5,
    'the 00485 dependency manifest must contain exactly five rows';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM _00485_expected_dependency AS expected
    LEFT JOIN pg_proc AS routine
      ON routine.oid = to_regprocedure(expected.signature)
    LEFT JOIN pg_roles AS owner ON owner.oid = routine.proowner
    LEFT JOIN pg_language AS language ON language.oid = routine.prolang
    WHERE routine.oid IS NULL
      OR owner.rolname IS DISTINCT FROM 'postgres'
      OR language.lanname IS DISTINCT FROM 'plpgsql'
      OR routine.prokind <> 'f'
      OR NOT routine.prosecdef
      OR routine.provolatile <> 'v'
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
  ), 'an owner-only 00485 dependency profile drifted';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM _00485_expected_dependency AS expected
    JOIN pg_proc AS routine
      ON routine.oid = to_regprocedure(expected.signature)
    CROSS JOIN LATERAL aclexplode(
      COALESCE(routine.proacl, acldefault('f', routine.proowner))
    ) AS acl
    WHERE acl.grantee <> routine.proowner
  ), 'an owner-only 00485 dependency has a nonowner ACL row';

  ASSERT NOT EXISTS (
    WITH expected(caller_signature) AS (
      VALUES
        ('public.issue_trade_draw_invoice(uuid)'::text),
        ('public._execute_furnishings_authorization_authorized(uuid,text,uuid,text)'::text),
        ('public._execute_trade_scope_authorized(uuid,text,uuid,text)'::text)
    ),
    actual AS (
      SELECT
        namespace.nspname || '.' || routine.proname || '(' ||
          pg_get_function_identity_arguments(routine.oid) || ')' AS caller_signature
      FROM pg_proc AS routine
      JOIN pg_namespace AS namespace ON namespace.oid = routine.pronamespace
      WHERE namespace.nspname <> 'information_schema'
        AND namespace.nspname NOT LIKE 'pg_%'
        AND position(
          'app_private.issue_invoice_for_actor(' IN routine.prosrc
        ) > 0
    )
    SELECT 1
    FROM (
      (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)
      UNION ALL
      (SELECT * FROM actual EXCEPT ALL SELECT * FROM expected)
    ) AS drift
  ), 'the private invoice core global caller universe drifted';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM (VALUES
      (
        'public._execute_furnishings_authorization_authorized(uuid,text,uuid,text)',
        '''commercialDocumentId'''
      ),
      (
        'public._execute_trade_scope_authorized(uuid,text,uuid,text)',
        '''tradeScopeDocumentId'''
      ),
      ('public.issue_trade_draw_invoice(uuid)', '''tradeScopeDocumentId''')
    ) AS expected(signature, metadata_key)
    JOIN pg_proc AS routine
      ON routine.oid = to_regprocedure(expected.signature)
    WHERE position(expected.metadata_key IN routine.prosrc) = 0
  ), 'an invoice-core caller does not persist its exact metadata anchor';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_proc AS routine
    WHERE routine.oid IN (
      to_regprocedure(
        'public._accept_trade_scope_authorized(uuid,text,uuid)'
      ),
      to_regprocedure(
        'public._sign_design_services_agreement_authorized(uuid,text,uuid,text)'
      )
    )
      AND (
        position('issue_invoice(' IN routine.prosrc) > 0
        OR position('request.jwt.claims' IN routine.prosrc) > 0
      )
  ), 'sign/accept siblings unexpectedly issue invoices or rewrite claims';
END
$private_dependency_contract$;

DO $trigger_binding_contract$
BEGIN
  ASSERT NOT EXISTS (
    WITH expected AS (
      SELECT *
      FROM (VALUES
        (
          'public.projects'::text, 'set_project_studio_id'::text,
          'public.set_project_studio_id()'::text, 'O'::"char", false,
          23::smallint, 0::smallint, ''::text,
          (SELECT string_agg(attnum::text, ' ' ORDER BY
             array_position(ARRAY['studio_id','designer_id'], attname))
           FROM pg_attribute
           WHERE attrelid = 'public.projects'::regclass
             AND attname = ANY(ARRAY['studio_id','designer_id'])),
          NULL::text, 0::oid,
          'createtriggerset_project_studio_idbeforeinsertorupdateofstudio_id,designer_idonprojectsforeachrowexecutefunctionset_project_studio_id()'::text
        ),
        (
          'public.invoices'::text, 'set_invoice_studio_id'::text,
          'public.set_invoice_studio_id()'::text, 'O'::"char", false,
          23::smallint, 0::smallint, ''::text,
          (SELECT string_agg(attnum::text, ' ' ORDER BY array_position(
             ARRAY['studio_id','designer_id','project_id'], attname))
           FROM pg_attribute
           WHERE attrelid = 'public.invoices'::regclass
             AND attname = ANY(
               ARRAY['studio_id','designer_id','project_id']
             )),
          NULL::text, 0::oid,
          'createtriggerset_invoice_studio_idbeforeinsertorupdateofstudio_id,designer_id,project_idoninvoicesforeachrowexecutefunctionset_invoice_studio_id()'::text
        )
      ) AS fixture(
        relation_name, trigger_name, function_signature, enabled, is_internal,
        trigger_type, argument_count, arguments_hex, trigger_columns,
        when_expression, parent_trigger, definition
      )
    ),
    actual AS (
      SELECT
        relation_namespace.nspname || '.' || relation.relname,
        trigger_row.tgname,
        function_namespace.nspname || '.' || routine.proname || '(' ||
          pg_get_function_identity_arguments(routine.oid) || ')',
        trigger_row.tgenabled,
        trigger_row.tgisinternal,
        trigger_row.tgtype,
        trigger_row.tgnargs,
        encode(trigger_row.tgargs, 'hex'),
        trigger_row.tgattr::text,
        pg_get_expr(trigger_row.tgqual, trigger_row.tgrelid, true),
        trigger_row.tgparentid,
        replace(
          regexp_replace(
            lower(pg_get_triggerdef(trigger_row.oid, false)), '\s+', '', 'g'
          ),
          'public.', ''
        )
      FROM pg_trigger AS trigger_row
      JOIN pg_class AS relation ON relation.oid = trigger_row.tgrelid
      JOIN pg_namespace AS relation_namespace
        ON relation_namespace.oid = relation.relnamespace
      JOIN pg_proc AS routine ON routine.oid = trigger_row.tgfoid
      JOIN pg_namespace AS function_namespace
        ON function_namespace.oid = routine.pronamespace
      WHERE trigger_row.tgfoid IN (
        to_regprocedure('public.set_project_studio_id()')::oid,
        to_regprocedure('public.set_invoice_studio_id()')::oid
      )
    )
    SELECT 1
    FROM (
      (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)
      UNION ALL
      (SELECT * FROM actual EXCEPT ALL SELECT * FROM expected)
    ) AS drift
  ), 'the complete studio-stamp trigger binding universe drifted';
END
$trigger_binding_contract$;

CREATE OR REPLACE FUNCTION pg_temp.assume_actor(
  p_actor uuid,
  p_claim_role text DEFAULT 'authenticated',
  p_extra jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    (jsonb_build_object('sub', p_actor, 'role', p_claim_role) || p_extra)::text,
    true
  );
  PERFORM set_config('request.jwt.claim.sub', p_actor::text, true);
  PERFORM set_config('request.jwt.claim.role', p_claim_role, true);
END;
$$;

GRANT EXECUTE ON FUNCTION pg_temp.assume_actor(uuid, text, jsonb)
  TO authenticated, service_role;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  (
    'd4850000-0000-4000-8000-000000000001',
    'sd-owner@test.invalid', '', now(), now(), now(),
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated'
  ),
  (
    'd4850000-0000-4000-8000-000000000002',
    'sd-member@test.invalid', '', now(), now(), now(),
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated'
  ),
  (
    'd4850000-0000-4000-8000-000000000003',
    'sd-outsider@test.invalid', '', now(), now(), now(),
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated'
  ),
  (
    'd4850000-0000-4000-8000-000000000004',
    'sd-client@test.invalid', '', now(), now(), now(),
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated'
  );

INSERT INTO public.profiles (
  id, email, full_name, is_designer, created_at, updated_at
)
VALUES
  (
    'd4850000-0000-4000-8000-000000000001',
    'sd-owner@test.invalid', 'SD Owner', true, now(), now()
  ),
  (
    'd4850000-0000-4000-8000-000000000002',
    'sd-member@test.invalid', 'SD Member', true, now(), now()
  ),
  (
    'd4850000-0000-4000-8000-000000000003',
    'sd-outsider@test.invalid', 'SD Outsider', true, now(), now()
  ),
  (
    'd4850000-0000-4000-8000-000000000004',
    'sd-client@test.invalid', 'SD Client', false, now(), now()
  )
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  (
    'd4851000-0000-4000-8000-000000000001',
    'design_studio', 'SD Contract Studio', 'sd-contract-studio-d485', 'active'
  ),
  (
    'd4851000-0000-4000-8000-000000000002',
    'design_studio', 'SD Foreign Studio', 'sd-foreign-studio-d485', 'active'
  );

INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
)
VALUES
  (
    'd4851100-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000001',
    'd4851000-0000-4000-8000-000000000001',
    'owner', 'active', now()
  ),
  (
    'd4851100-0000-4000-8000-000000000002',
    'd4850000-0000-4000-8000-000000000002',
    'd4851000-0000-4000-8000-000000000001',
    'member', 'active', now()
  ),
  (
    'd4851100-0000-4000-8000-000000000003',
    'd4850000-0000-4000-8000-000000000001',
    'd4851000-0000-4000-8000-000000000002',
    'owner', 'active', now()
  );

INSERT INTO public.projects (
  id, name, designer_id, client_id, created_by, studio_id
)
VALUES
  (
    'd4852000-0000-4000-8000-000000000001', 'SD Trade Project One',
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    'd4850000-0000-4000-8000-000000000001',
    'd4851000-0000-4000-8000-000000000001'
  ),
  (
    'd4852000-0000-4000-8000-000000000002', 'SD Trade Project Two',
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    'd4850000-0000-4000-8000-000000000001',
    'd4851000-0000-4000-8000-000000000002'
  ),
  (
    'd4852000-0000-4000-8000-000000000003', 'SD Spec Project',
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    'd4850000-0000-4000-8000-000000000001',
    'd4851000-0000-4000-8000-000000000001'
  ),
  (
    'd4852000-0000-4000-8000-000000000004', 'SD Review Project',
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    'd4850000-0000-4000-8000-000000000001',
    'd4851000-0000-4000-8000-000000000001'
  ),
  (
    'd4852000-0000-4000-8000-000000000005', 'SD Foreign Spec Project',
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    'd4850000-0000-4000-8000-000000000001',
    'd4851000-0000-4000-8000-000000000002'
  ),
  (
    'd4852000-0000-4000-8000-000000000006', 'SD Foreign Review Project',
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    'd4850000-0000-4000-8000-000000000001',
    'd4851000-0000-4000-8000-000000000002'
  ),
  (
    'd4852000-0000-4000-8000-000000000007', 'SD Furnish Execute Project',
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    'd4850000-0000-4000-8000-000000000001',
    'd4851000-0000-4000-8000-000000000001'
  ),
  (
    'd4852000-0000-4000-8000-000000000008', 'SD Trade Execute Project',
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    'd4850000-0000-4000-8000-000000000001',
    'd4851000-0000-4000-8000-000000000001'
  );

INSERT INTO public.proposals (
  id, project_id, designer_id, client_id, title, status,
  document_kind, commercial_state, total_amount, deposit_percent
)
VALUES
  (
    'd4853000-0000-4000-8000-000000000001',
    'd4852000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    'SD Trade Scope One', 'draft', 'trade_scope', 'executed', 10000, 0
  ),
  (
    'd4853000-0000-4000-8000-000000000002',
    'd4852000-0000-4000-8000-000000000002',
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    'SD Trade Scope Two', 'draft', 'trade_scope', 'executed', 12000, 0
  ),
  (
    'd4853000-0000-4000-8000-000000000020',
    'd4852000-0000-4000-8000-000000000007',
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    'SD Furnish Origin', 'accepted', 'design_services', 'executed', 0, 0
  ),
  (
    'd4853000-0000-4000-8000-000000000021',
    'd4852000-0000-4000-8000-000000000007',
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    'SD Furnish Authorization', 'sent',
    'furnishings_authorization', 'sent', 10000, 25
  ),
  (
    'd4853000-0000-4000-8000-000000000022',
    'd4852000-0000-4000-8000-000000000008',
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    'SD Trade Origin', 'accepted', 'design_services', 'executed', 0, 0
  ),
  (
    'd4853000-0000-4000-8000-000000000023',
    'd4852000-0000-4000-8000-000000000008',
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    'SD Trade Execution', 'sent', 'trade_scope', 'sent', 15000, 0
  );

INSERT INTO public.project_budget_versions (
  id, project_id, version, status, low_total_cents,
  target_total_cents, high_total_cents, created_by
)
VALUES (
  'd4853300-0000-4000-8000-000000000001',
  'd4852000-0000-4000-8000-000000000007',
  1, 'draft', 10000, 10000, 10000,
  'd4850000-0000-4000-8000-000000000001'
);

INSERT INTO public.project_budget_checkpoints (
  id, project_id, budget_version_id, checkpoint_code, status,
  snapshot_fingerprint, published_by, acknowledged_by, acknowledged_at
)
VALUES (
  'd4853310-0000-4000-8000-000000000001',
  'd4852000-0000-4000-8000-000000000007',
  'd4853300-0000-4000-8000-000000000001',
  'sd-00485-checkpoint', 'acknowledged',
  public._budget_version_fingerprint(
    'd4853300-0000-4000-8000-000000000001'
  ),
  'd4850000-0000-4000-8000-000000000001',
  'd4850000-0000-4000-8000-000000000004', now()
);

INSERT INTO public.project_commercial_documents (
  id, project_id, proposal_id, document_kind, wave_name,
  budget_checkpoint_id, is_origin, executed_at, created_by
)
VALUES
  (
    'd4853100-0000-4000-8000-000000000001',
    'd4852000-0000-4000-8000-000000000001',
    'd4853000-0000-4000-8000-000000000001',
    'trade_scope', NULL, NULL, false, now(),
    'd4850000-0000-4000-8000-000000000001'
  ),
  (
    'd4853100-0000-4000-8000-000000000002',
    'd4852000-0000-4000-8000-000000000002',
    'd4853000-0000-4000-8000-000000000002',
    'trade_scope', NULL, NULL, false, now(),
    'd4850000-0000-4000-8000-000000000001'
  ),
  (
    'd4853100-0000-4000-8000-000000000020',
    'd4852000-0000-4000-8000-000000000007',
    'd4853000-0000-4000-8000-000000000020',
    'design_services', NULL, NULL, true, now(),
    'd4850000-0000-4000-8000-000000000001'
  ),
  (
    'd4853100-0000-4000-8000-000000000021',
    'd4852000-0000-4000-8000-000000000007',
    'd4853000-0000-4000-8000-000000000021',
    'furnishings_authorization', 'SD Furnish Wave',
    'd4853310-0000-4000-8000-000000000001', false, NULL,
    'd4850000-0000-4000-8000-000000000001'
  ),
  (
    'd4853100-0000-4000-8000-000000000022',
    'd4852000-0000-4000-8000-000000000008',
    'd4853000-0000-4000-8000-000000000022',
    'design_services', NULL, NULL, true, now(),
    'd4850000-0000-4000-8000-000000000001'
  ),
  (
    'd4853100-0000-4000-8000-000000000023',
    'd4852000-0000-4000-8000-000000000008',
    'd4853000-0000-4000-8000-000000000023',
    'trade_scope', NULL, NULL, false, NULL,
    'd4850000-0000-4000-8000-000000000001'
  );

INSERT INTO public.trade_scope_terms (
  proposal_id, client_price_cents, currency, progress_state
)
VALUES
  ('d4853000-0000-4000-8000-000000000001', 10000, 'USD', 'none'),
  ('d4853000-0000-4000-8000-000000000002', 12000, 'USD', 'none'),
  ('d4853000-0000-4000-8000-000000000023', 15000, 'USD', 'none');

INSERT INTO public.trade_scope_draws (
  id, proposal_id, label, amount_cents, sort_order, gates_on_acceptance
)
VALUES
  (
    'd4853200-0000-4000-8000-000000000001',
    'd4853000-0000-4000-8000-000000000001',
    'Trade draw one', 10000, 0, false
  ),
  (
    'd4853200-0000-4000-8000-000000000002',
    'd4853000-0000-4000-8000-000000000002',
    'Trade draw two', 12000, 0, false
  ),
  (
    'd4853200-0000-4000-8000-000000000023',
    'd4853000-0000-4000-8000-000000000023',
    'Trade execution deposit', 15000, 0, false
  );

INSERT INTO public.spec_book_templates (
  id, template_key, version, name, page_grammar, audience_profiles,
  required_field_rules, visibility_rules, created_by
)
VALUES (
  'd4854000-0000-4000-8000-000000000001',
  'sd-contract-template', 1, 'SD Contract Template',
  '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
  'd4850000-0000-4000-8000-000000000001'
);

INSERT INTO public.spec_books (
  id, project_id, title, template_id, created_by
)
VALUES
  (
    'd4854100-0000-4000-8000-000000000001',
    'd4852000-0000-4000-8000-000000000003',
    'SD Contract Spec Book',
    'd4854000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000001'
  ),
  (
    'd4854100-0000-4000-8000-000000000002',
    'd4852000-0000-4000-8000-000000000005',
    'SD Foreign Spec Book',
    'd4854000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000001'
  );

INSERT INTO public.proposal_boards (
  id, proposal_id, project_id, name, cover_image_url
)
VALUES (
  'd4854200-0000-4000-8000-000000000001', NULL,
  'd4852000-0000-4000-8000-000000000004',
  'SD Unsafe Media Board', 'private/unprepared-reference.jpg'
);

INSERT INTO public.proposals (
  id, project_id, designer_id, client_id, title, status, total_amount
)
SELECT
  fixture.proposal_id,
  'd4852000-0000-4000-8000-000000000001',
  'd4850000-0000-4000-8000-000000000001',
  'd4850000-0000-4000-8000-000000000004',
  fixture.title,
  'sent',
  10000
FROM (VALUES
  ('d4853000-0000-4000-8000-000000000010'::uuid, 'SD Dispatch Begin'),
  ('d4853000-0000-4000-8000-000000000011'::uuid, 'SD Dispatch Suppress'),
  ('d4853000-0000-4000-8000-000000000012'::uuid, 'SD Dispatch Release')
) AS fixture(proposal_id, title);

INSERT INTO public.proposal_send_dispatches (
  id, proposal_id, sent_at, designer_id, client_id, project_id,
  proposal_title, total_amount, recipient_email, recipient_name,
  designer_name, sender_name, client_portal_path,
  state, claim_token, lease_expires_at, claimed_from_state,
  provider_idempotency_key, email_log_id, in_app_log_id,
  provider_request_body, provider_from, provider_to, provider_subject,
  provider_dry_run, request_persisted_at, provider_attempt_count
)
VALUES
  (
    'd4855000-0000-4000-8000-000000000001',
    'd4853000-0000-4000-8000-000000000010', now(),
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    'd4852000-0000-4000-8000-000000000001',
    'SD Dispatch Begin', 10000, 'sd-client@test.invalid', 'SD Client',
    'SD Owner', 'SD Contract Studio', '/proposals/d485-begin',
    'in_flight', 'd4855100-0000-4000-8000-000000000001',
    now() + interval '5 minutes', 'pending',
    'proposal-send/d485-begin',
    'd4855200-0000-4000-8000-000000000001',
    'd4855300-0000-4000-8000-000000000001',
    '{"subject":"SD begin"}', 'SD <hello@patina.cloud>',
    ARRAY['sd-client@test.invalid'], 'SD begin', false, now(), 0
  ),
  (
    'd4855000-0000-4000-8000-000000000002',
    'd4853000-0000-4000-8000-000000000011', now(),
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    'd4852000-0000-4000-8000-000000000001',
    'SD Dispatch Suppress', 10000, 'sd-client@test.invalid', 'SD Client',
    'SD Owner', 'SD Contract Studio', '/proposals/d485-suppress',
    'in_flight', 'd4855100-0000-4000-8000-000000000002',
    now() + interval '5 minutes', 'pending',
    'proposal-send/d485-suppress',
    'd4855200-0000-4000-8000-000000000002',
    'd4855300-0000-4000-8000-000000000002',
    NULL, NULL, NULL, NULL, NULL, NULL, 0
  ),
  (
    'd4855000-0000-4000-8000-000000000003',
    'd4853000-0000-4000-8000-000000000012', now(),
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    'd4852000-0000-4000-8000-000000000001',
    'SD Dispatch Release', 10000, 'sd-client@test.invalid', 'SD Client',
    'SD Owner', 'SD Contract Studio', '/proposals/d485-release',
    'in_flight', 'd4855100-0000-4000-8000-000000000003',
    now() + interval '5 minutes', 'failed',
    'proposal-send/d485-release',
    'd4855200-0000-4000-8000-000000000003',
    'd4855300-0000-4000-8000-000000000003',
    NULL, NULL, NULL, NULL, NULL, NULL, 0
  );

-- Unrelated downstream cores are replaced transaction-locally. The two
-- commercial execution cores remain real so nested invoice authority and
-- request-context behavior are exercised end to end.
CREATE OR REPLACE FUNCTION public._accept_trade_scope_authorized(
  p_proposal_id uuid, p_signed_name text, p_client_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_signed_name = 'force-error' THEN
    RAISE EXCEPTION 'forced trusted acceptance error'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_proposal_id <> 'd4853000-0000-4000-8000-000000000001'
     OR p_client_id <> 'd4850000-0000-4000-8000-000000000004'
  THEN
    RAISE EXCEPTION 'trade scope not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN jsonb_build_object(
    'proposalId', p_proposal_id, 'actorId', p_client_id,
    'signedName', p_signed_name
  );
END;
$$;

CREATE OR REPLACE FUNCTION public._sign_design_services_agreement_authorized(
  p_proposal_id uuid, p_signed_name text, p_client_id uuid, p_signed_ip text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_signed_name = 'force-error' THEN
    RAISE EXCEPTION 'forced trusted design-services error'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_client_id <> 'd4850000-0000-4000-8000-000000000004'
     OR current_setting('app.commercial_signature_capability', true)
          NOT LIKE 'commercial_signature:' || p_proposal_id::text ||
                   ':sign_design_services_agreement:%'
  THEN
    RAISE EXCEPTION 'design services not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN jsonb_build_object(
    'proposalId', p_proposal_id, 'actorId', p_client_id,
    'signedIp', p_signed_ip
  );
END;
$$;

CREATE OR REPLACE FUNCTION public._enqueue_decision_notification(
  p_decision_id uuid,
  p_kind public.decision_notification_kind
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_decision_id <> 'd4856000-0000-4000-8000-000000000001' THEN
    RAISE EXCEPTION 'decision not found' USING ERRCODE = 'no_data_found';
  END IF;
  RETURN CASE p_kind
    WHEN 'decision_required' THEN 'd4856100-0000-4000-8000-000000000001'::uuid
    WHEN 'decision_overdue' THEN 'd4856100-0000-4000-8000-000000000002'::uuid
    WHEN 'decision_resolved' THEN 'd4856100-0000-4000-8000-000000000003'::uuid
    ELSE NULL
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public._prepare_spec_book_issue_00403(
  p_spec_book_id uuid,
  p_audiences text[],
  p_issue_type text,
  p_reason text,
  p_base_revision_id uuid,
  p_idempotency_key text,
  p_warning_acknowledgements jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_spec_book_id <> 'd4854100-0000-4000-8000-000000000001' THEN
    RAISE EXCEPTION 'spec book not found' USING ERRCODE = 'no_data_found';
  END IF;
  RETURN jsonb_build_object(
    'specBookId', p_spec_book_id,
    'actorId', auth.uid(),
    'idempotencyKey', p_idempotency_key,
    'audiences', p_audiences
  );
END;
$$;

CREATE OR REPLACE FUNCTION public._publish_project_review_00448_impl(
  p_request jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
BEGIN
  IF p_request->>'title' = 'force-error' THEN
    RAISE EXCEPTION 'forced review publication error'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN jsonb_build_object(
    'projectId', p_request->>'projectId',
    'editionId', NULL,
    'published', true
  );
END;
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000002',
  'service_role',
  jsonb_build_object(
    'actor_id', 'd4850000-0000-4000-8000-000000000004',
    'organization_id', 'd4851000-0000-4000-8000-000000000001'
  )
);

DO $forged_service_claim_denials$
BEGIN
  BEGIN
    PERFORM public.accept_trade_scope_with_trusted_ip(
      gen_random_uuid(), 'Forged', gen_random_uuid(), NULL
    );
    RAISE EXCEPTION 'authenticated called trusted trade acceptance';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.begin_proposal_send_provider_attempt(
      gen_random_uuid(), gen_random_uuid()
    );
    RAISE EXCEPTION 'authenticated called provider begin';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.complete_proposal_send_dispatch(
      gen_random_uuid(), gen_random_uuid(), 'failed', NULL, NULL
    );
    RAISE EXCEPTION 'authenticated called provider complete';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.consume_board_unfurl_quota(gen_random_uuid());
    RAISE EXCEPTION 'authenticated consumed service-only quota';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.execute_furnishings_authorization_with_trusted_ip(
      gen_random_uuid(), 'Forged', gen_random_uuid(), NULL
    );
    RAISE EXCEPTION 'authenticated called trusted furnishings execution';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.execute_trade_scope_with_trusted_ip(
      gen_random_uuid(), 'Forged', gen_random_uuid(), NULL
    );
    RAISE EXCEPTION 'authenticated called trusted trade execution';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.notify_decision_overdue(gen_random_uuid());
    RAISE EXCEPTION 'authenticated called overdue notification';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.notify_decision_required(gen_random_uuid());
    RAISE EXCEPTION 'authenticated called required notification';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.notify_decision_resolved(gen_random_uuid());
    RAISE EXCEPTION 'authenticated called resolved notification';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.release_proposal_send_dispatch(
      gen_random_uuid(), gen_random_uuid(), 'forged'
    );
    RAISE EXCEPTION 'authenticated called dispatch release';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.sign_design_services_agreement_with_trusted_ip(
      gen_random_uuid(), 'Forged', gen_random_uuid(), NULL
    );
    RAISE EXCEPTION 'authenticated called trusted design signing';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.suppress_proposal_send_dispatch(
      gen_random_uuid(), gen_random_uuid(), 'forged'
    );
    RAISE EXCEPTION 'authenticated called dispatch suppression';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$forged_service_claim_denials$;

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000003', 'authenticated'
);
SELECT set_config('app.commercial_signature_capability', 'sd-sentinel', true);

DO $service_role_success_and_retry$
DECLARE
  claims_before text := current_setting('request.jwt.claims', true);
  first_result jsonb;
  retry_result jsonb;
  notification_id uuid;
BEGIN
  first_result := public.accept_trade_scope_with_trusted_ip(
    'd4853000-0000-4000-8000-000000000001', 'SD Client',
    'd4850000-0000-4000-8000-000000000004', '203.0.113.10'
  );
  retry_result := public.accept_trade_scope_with_trusted_ip(
    'd4853000-0000-4000-8000-000000000001', 'SD Client',
    'd4850000-0000-4000-8000-000000000004', '203.0.113.10'
  );
  ASSERT first_result = retry_result
     AND first_result->>'actorId' =
           'd4850000-0000-4000-8000-000000000004',
    'trusted acceptance did not pass the verified actor idempotently';
  ASSERT current_setting('request.jwt.claims', true) = claims_before,
    'trusted acceptance rewrote caller claims';

  first_result := public.sign_design_services_agreement_with_trusted_ip(
    'd4853000-0000-4000-8000-000000000001', 'SD Client',
    'd4850000-0000-4000-8000-000000000004', '203.0.113.11'
  );
  retry_result := public.sign_design_services_agreement_with_trusted_ip(
    'd4853000-0000-4000-8000-000000000001', 'SD Client',
    'd4850000-0000-4000-8000-000000000004', '203.0.113.11'
  );
  ASSERT first_result = retry_result
     AND first_result->>'actorId' =
           'd4850000-0000-4000-8000-000000000004',
    'trusted design signing did not pass the verified actor idempotently';
  ASSERT current_setting('app.commercial_signature_capability', true) =
           'sd-sentinel',
    'trusted design signing leaked its capability';

  first_result := public.execute_furnishings_authorization_with_trusted_ip(
    'd4853000-0000-4000-8000-000000000021', 'SD Client',
    'd4850000-0000-4000-8000-000000000004', '203.0.113.12'
  );
  retry_result := public.execute_furnishings_authorization_with_trusted_ip(
    'd4853000-0000-4000-8000-000000000021', 'SD Client',
    'd4850000-0000-4000-8000-000000000004', '203.0.113.12'
  );
  ASSERT (first_result->>'newlyExecuted')::boolean
     AND NOT (retry_result->>'newlyExecuted')::boolean
     AND first_result->>'depositInvoiceId' =
           retry_result->>'depositInvoiceId'
     AND (
       SELECT invoice.status = 'sent'
          AND invoice.client_id =
                'd4850000-0000-4000-8000-000000000004'
          AND invoice.project_id =
                'd4852000-0000-4000-8000-000000000007'
          AND invoice.studio_id =
                'd4851000-0000-4000-8000-000000000001'
       FROM public.invoices AS invoice
       WHERE invoice.id = (first_result->>'depositInvoiceId')::uuid
     ), 'real furnishings execution did not issue the exact relational invoice';
  ASSERT current_setting('app.commercial_signature_capability', true) =
           'sd-sentinel',
    'trusted furnishings leaked its capability';

  first_result := public.execute_trade_scope_with_trusted_ip(
    'd4853000-0000-4000-8000-000000000023', 'SD Client',
    'd4850000-0000-4000-8000-000000000004', '203.0.113.13'
  );
  retry_result := public.execute_trade_scope_with_trusted_ip(
    'd4853000-0000-4000-8000-000000000023', 'SD Client',
    'd4850000-0000-4000-8000-000000000004', '203.0.113.13'
  );
  ASSERT (first_result->>'newlyExecuted')::boolean
     AND NOT (retry_result->>'newlyExecuted')::boolean
     AND first_result->>'depositInvoiceId' =
           retry_result->>'depositInvoiceId'
     AND (
       SELECT invoice.status = 'sent'
          AND invoice.client_id =
                'd4850000-0000-4000-8000-000000000004'
          AND invoice.project_id =
                'd4852000-0000-4000-8000-000000000008'
          AND invoice.studio_id =
                'd4851000-0000-4000-8000-000000000001'
       FROM public.invoices AS invoice
       WHERE invoice.id = (first_result->>'depositInvoiceId')::uuid
     ), 'real trade execution did not issue the exact relational invoice';
  ASSERT current_setting('app.commercial_signature_capability', true) =
           'sd-sentinel',
    'trusted trade execution leaked its capability';
  ASSERT current_setting('request.jwt.claims', true) = claims_before,
    'a trusted commercial boundary rewrote caller claims';

  notification_id := public.notify_decision_required(
    'd4856000-0000-4000-8000-000000000001'
  );
  ASSERT notification_id = public.notify_decision_required(
    'd4856000-0000-4000-8000-000000000001'
  ), 'required notification retry was not idempotent';
  notification_id := public.notify_decision_overdue(
    'd4856000-0000-4000-8000-000000000001'
  );
  ASSERT notification_id = public.notify_decision_overdue(
    'd4856000-0000-4000-8000-000000000001'
  ), 'overdue notification retry was not idempotent';
  notification_id := public.notify_decision_resolved(
    'd4856000-0000-4000-8000-000000000001'
  );
  ASSERT notification_id = public.notify_decision_resolved(
    'd4856000-0000-4000-8000-000000000001'
  ), 'resolved notification retry was not idempotent';

  BEGIN
    PERFORM public.notify_decision_required(gen_random_uuid());
    RAISE EXCEPTION 'missing decision notification succeeded';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  BEGIN
    PERFORM public.notify_decision_overdue(gen_random_uuid());
    RAISE EXCEPTION 'missing overdue notification succeeded';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  BEGIN
    PERFORM public.notify_decision_resolved(gen_random_uuid());
    RAISE EXCEPTION 'missing resolved notification succeeded';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;

  first_result := public.consume_board_unfurl_quota(
    'd4850000-0000-4000-8000-000000000004'
  );
  retry_result := public.consume_board_unfurl_quota(
    'd4850000-0000-4000-8000-000000000004'
  );
  ASSERT (first_result->>'allowed')::boolean
     AND (retry_result->>'allowed')::boolean,
    'service quota calls did not bind the explicit verified user';
  BEGIN
    PERFORM public.consume_board_unfurl_quota(NULL::uuid);
    RAISE EXCEPTION 'NULL service quota subject succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    PERFORM public.begin_proposal_send_provider_attempt(
      'd4855000-0000-4000-8000-000000000001',
      'd4855199-0000-4000-8000-000000000099'
    );
    RAISE EXCEPTION 'wrong provider claim token reached the dispatch';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;
  first_result := public.begin_proposal_send_provider_attempt(
    'd4855000-0000-4000-8000-000000000001',
    'd4855100-0000-4000-8000-000000000001'
  );
  retry_result := public.begin_proposal_send_provider_attempt(
    'd4855000-0000-4000-8000-000000000001',
    'd4855100-0000-4000-8000-000000000001'
  );
  ASSERT (first_result->>'attempt_count')::integer = 1
     AND (retry_result->>'attempt_count')::integer = 2,
    'provider retry did not retain the exact live claim';
  first_result := public.complete_proposal_send_dispatch(
    'd4855000-0000-4000-8000-000000000001',
    'd4855100-0000-4000-8000-000000000001',
    'delivered', 'provider-d485', NULL
  );
  ASSERT first_result->>'delivery_state' = 'delivered',
    'provider completion did not commit the claimed terminal state';
  BEGIN
    PERFORM public.complete_proposal_send_dispatch(
      'd4855000-0000-4000-8000-000000000001',
      'd4855100-0000-4000-8000-000000000001',
      'delivered', 'provider-d485', NULL
    );
    RAISE EXCEPTION 'stale completion replay mutated the dispatch';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;

  first_result := public.suppress_proposal_send_dispatch(
    'd4855000-0000-4000-8000-000000000002',
    'd4855100-0000-4000-8000-000000000002', 'reviewed suppression'
  );
  ASSERT first_result->>'delivery_state' = 'suppressed',
    'pre-provider suppression did not commit';
  BEGIN
    PERFORM public.suppress_proposal_send_dispatch(
      'd4855000-0000-4000-8000-000000000002',
      'd4855100-0000-4000-8000-000000000002', 'replay'
    );
    RAISE EXCEPTION 'stale suppression replay mutated the dispatch';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;

  first_result := public.release_proposal_send_dispatch(
    'd4855000-0000-4000-8000-000000000003',
    'd4855100-0000-4000-8000-000000000003', 'pre-provider failure'
  );
  ASSERT first_result->>'delivery_state' = 'failed',
    'pre-provider release did not restore the claimed state';
  BEGIN
    PERFORM public.release_proposal_send_dispatch(
      'd4855000-0000-4000-8000-000000000003',
      'd4855100-0000-4000-8000-000000000003', 'replay'
    );
    RAISE EXCEPTION 'stale release replay mutated the dispatch';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;

  BEGIN
    PERFORM public.accept_trade_scope_with_trusted_ip(
      'd4853000-0000-4000-8000-000000000001', 'Bad actor',
      'd4850000-0000-4000-8000-000000000003', NULL
    );
    RAISE EXCEPTION 'cross-project trusted actor succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.sign_design_services_agreement_with_trusted_ip(
      'd4853000-0000-4000-8000-000000000001', 'Bad actor',
      'd4850000-0000-4000-8000-000000000003', NULL
    );
    RAISE EXCEPTION 'cross-project trusted design actor succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.execute_furnishings_authorization_with_trusted_ip(
      'd4853000-0000-4000-8000-000000000021', 'Bad actor',
      'd4850000-0000-4000-8000-000000000003', NULL
    );
    RAISE EXCEPTION 'cross-project trusted furnishings actor succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.execute_trade_scope_with_trusted_ip(
      'd4853000-0000-4000-8000-000000000023', 'Bad actor',
      'd4850000-0000-4000-8000-000000000003', NULL
    );
    RAISE EXCEPTION 'cross-project trusted trade actor succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.accept_trade_scope_with_trusted_ip(
      'd4853000-0000-4000-8000-000000000001', 'force-error',
      'd4850000-0000-4000-8000-000000000004', NULL
    );
    RAISE EXCEPTION 'forced trusted acceptance error did not fire';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  ASSERT current_setting('request.jwt.claims', true) = claims_before,
    'trusted acceptance error rewrote caller claims';

  BEGIN
    PERFORM public.sign_design_services_agreement_with_trusted_ip(
      'd4853000-0000-4000-8000-000000000001', 'force-error',
      'd4850000-0000-4000-8000-000000000004', NULL
    );
    RAISE EXCEPTION 'forced trusted design error did not fire';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  ASSERT current_setting('app.commercial_signature_capability', true) =
           'sd-sentinel',
    'trusted design error leaked its capability';
  ASSERT current_setting('request.jwt.claims', true) = claims_before,
    'trusted design error rewrote caller claims';

  BEGIN
    PERFORM public.execute_furnishings_authorization_with_trusted_ip(
      'd4853000-0000-4000-8000-000000000021', 'force-error',
      'd4850000-0000-4000-8000-000000000004', NULL
    );
    RAISE EXCEPTION 'forced trusted furnishings error did not fire';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.execute_trade_scope_with_trusted_ip(
      'd4853000-0000-4000-8000-000000000023', 'force-error',
      'd4850000-0000-4000-8000-000000000004', NULL
    );
    RAISE EXCEPTION 'forced trusted trade error did not fire';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  ASSERT current_setting('app.commercial_signature_capability', true) =
           'sd-sentinel',
    'trusted execution error leaked its capability';
  ASSERT current_setting('request.jwt.claims', true) = claims_before,
    'trusted execution error rewrote caller claims';
END
$service_role_success_and_retry$;

RESET ROLE;

DO $service_mutation_results$
BEGIN
  ASSERT 2 = (
    SELECT count(*)
    FROM public.board_unfurl_usage
    WHERE user_id = 'd4850000-0000-4000-8000-000000000004'
  ), 'quota usage escaped the explicit verified user';
  ASSERT (
    SELECT state = 'delivered'
       AND claim_token IS NULL
       AND provider_id = 'provider-d485'
       AND provider_attempt_count = 2
    FROM public.proposal_send_dispatches
    WHERE id = 'd4855000-0000-4000-8000-000000000001'
  ), 'provider completion state drifted';
  ASSERT (
    SELECT state = 'suppressed' AND claim_token IS NULL
    FROM public.proposal_send_dispatches
    WHERE id = 'd4855000-0000-4000-8000-000000000002'
  ), 'suppression state drifted';
  ASSERT (
    SELECT state = 'failed' AND claim_token IS NULL
    FROM public.proposal_send_dispatches
    WHERE id = 'd4855000-0000-4000-8000-000000000003'
  ), 'release state drifted';
END
$service_mutation_results$;

INSERT INTO public.invoices (
  id, project_id, designer_id, client_id, studio_id,
  status, currency, subtotal_cents, total_cents
)
VALUES
  (
    'd4857000-0000-4000-8000-000000000070',
    'd4852000-0000-4000-8000-000000000007',
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    'd4851000-0000-4000-8000-000000000001',
    'draft', 'USD', 100, 100
  ),
  (
    'd4857000-0000-4000-8000-000000000071',
    'd4852000-0000-4000-8000-000000000007',
    'd4850000-0000-4000-8000-000000000001',
    'd4850000-0000-4000-8000-000000000004',
    'd4851000-0000-4000-8000-000000000001',
    'draft', 'USD', 100, 100
  );

INSERT INTO public.invoice_line_items (
  invoice_id, kind, description, quantity,
  unit_amount_cents, amount_cents, metadata
)
VALUES
  (
    'd4857000-0000-4000-8000-000000000070', 'adhoc',
    'Ordinary unrelated line', 1, 100, 100, '{}'::jsonb
  ),
  (
    'd4857000-0000-4000-8000-000000000071', 'adhoc',
    'Ambiguous commercial anchors', 1, 100, 100,
    jsonb_build_object(
      'commercialDocumentId', 'd4853100-0000-4000-8000-000000000021',
      'tradeScopeDocumentId', 'd4853100-0000-4000-8000-000000000023'
    )
  );

DO $invoice_core_anchor_denials$
DECLARE
  ordinary_error text;
  ambiguous_error text;
BEGIN
  BEGIN
    PERFORM app_private.issue_invoice_for_actor(
      'd4857000-0000-4000-8000-000000000070', current_date,
      'd4850000-0000-4000-8000-000000000004'
    );
    RAISE EXCEPTION 'ordinary adhoc invoice reached the commercial core';
  EXCEPTION WHEN insufficient_privilege THEN
    ordinary_error := SQLERRM;
  END;

  BEGIN
    PERFORM app_private.issue_invoice_for_actor(
      'd4857000-0000-4000-8000-000000000071', current_date,
      'd4850000-0000-4000-8000-000000000004'
    );
    RAISE EXCEPTION 'ambiguous invoice anchors reached issuance';
  EXCEPTION WHEN insufficient_privilege THEN
    ambiguous_error := SQLERRM;
  END;

  ASSERT ordinary_error = ambiguous_error
     AND ordinary_error = 'issue_invoice: invoice not found or access denied',
    'invoice core anchor denials are not fixed and non-enumerating';
END
$invoice_core_anchor_denials$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000002', 'authenticated'
);
SELECT set_config('app.trade_draw_invoice_id', 'draw-sentinel', true);

DO $trade_draw_comember_success$
DECLARE
  result jsonb;
BEGIN
  result := public.issue_trade_draw_invoice(
    'd4853200-0000-4000-8000-000000000001'
  );
  ASSERT result->>'invoiceStatus' = 'sent'
     AND result->>'drawId' = 'd4853200-0000-4000-8000-000000000001',
    'active studio co-member did not issue the exact trade draw';
  ASSERT current_setting('app.trade_draw_invoice_id', true) = 'draw-sentinel',
    'successful trade draw issuance leaked its row capability';
  ASSERT auth.uid() = 'd4850000-0000-4000-8000-000000000002',
    'trade draw issuance replaced the real caller';

  BEGIN
    PERFORM app_private.issue_invoice_for_actor(
      (result->>'invoiceId')::uuid, current_date,
      'd4850000-0000-4000-8000-000000000002'
    );
    RAISE EXCEPTION 'authenticated called the owner-only invoice core';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$trade_draw_comember_success$;

RESET ROLE;

DO $trade_draw_success_state$
BEGIN
  ASSERT (
    SELECT invoice.designer_id =
             'd4850000-0000-4000-8000-000000000001'
       AND invoice.project_id =
             'd4852000-0000-4000-8000-000000000001'
       AND invoice.status = 'sent'
       AND invoice.subtotal_cents = 10000
       AND invoice.total_cents = 10000
    FROM public.trade_scope_draws AS draw
    JOIN public.invoices AS invoice ON invoice.id = draw.invoice_id
    WHERE draw.id = 'd4853200-0000-4000-8000-000000000001'
  ), 'trade invoice ownership or money invariants drifted';
  ASSERT 1 = (
    SELECT count(*)
    FROM public.trade_scope_draws AS draw
    JOIN public.invoice_line_items AS line
      ON line.invoice_id = draw.invoice_id
    WHERE draw.id = 'd4853200-0000-4000-8000-000000000001'
      AND line.metadata->>'drawId' = draw.id::text
      AND line.metadata->>'kind' = 'trade_draw'
  ), 'trade draw invoice did not retain its reviewed provenance';
END
$trade_draw_success_state$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000002', 'authenticated'
);

DO $trade_draw_wrong_canonical_studio_denial$
BEGIN
  BEGIN
    PERFORM public.issue_trade_draw_invoice(
      'd4853200-0000-4000-8000-000000000002'
    );
    RAISE EXCEPTION
      'shared-studio member issued a draw from another canonical studio';
  EXCEPTION WHEN insufficient_privilege THEN
    ASSERT SQLERRM = 'trade scope draw not found or access denied';
  END;
END
$trade_draw_wrong_canonical_studio_denial$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000003',
  'service_role',
  jsonb_build_object(
    'actor_id', 'd4850000-0000-4000-8000-000000000001',
    'user_id', 'd4850000-0000-4000-8000-000000000001',
    'organization_id', 'd4851000-0000-4000-8000-000000000001'
  )
);

DO $trade_draw_outsider_denial$
DECLARE
  inaccessible_error text;
  nonexistent_error text;
BEGIN
  BEGIN
    PERFORM public.issue_trade_draw_invoice(
      'd4853200-0000-4000-8000-000000000002'
    );
    RAISE EXCEPTION 'outsider issued a trade draw with forged claims';
  EXCEPTION WHEN insufficient_privilege THEN
    inaccessible_error := SQLERRM;
  END;
  BEGIN
    PERFORM public.issue_trade_draw_invoice(
      'd4853299-0000-4000-8000-000000000099'
    );
    RAISE EXCEPTION 'outsider enumerated a nonexistent trade draw';
  EXCEPTION WHEN insufficient_privilege THEN
    nonexistent_error := SQLERRM;
  END;
  ASSERT inaccessible_error = nonexistent_error
     AND inaccessible_error = 'trade scope draw not found or access denied',
    'trade draw denial distinguishes inaccessible and nonexistent rows';
END
$trade_draw_outsider_denial$;

RESET ROLE;

UPDATE public.organization_members
SET status = 'removed'
WHERE id = 'd4851100-0000-4000-8000-000000000002';

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000002', 'authenticated'
);

DO $trade_draw_inactive_denial$
BEGIN
  BEGIN
    PERFORM public.issue_trade_draw_invoice(
      'd4853200-0000-4000-8000-000000000001'
    );
    RAISE EXCEPTION 'inactive studio member issued a trade draw';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$trade_draw_inactive_denial$;

RESET ROLE;

DO $trade_draw_denial_state$
BEGIN
  ASSERT (
    SELECT invoice_id IS NULL
    FROM public.trade_scope_draws
    WHERE id = 'd4853200-0000-4000-8000-000000000002'
  ), 'denied trade draw call stamped an invoice';
  ASSERT 0 = (
    SELECT count(*)
    FROM public.invoices
    WHERE project_id = 'd4852000-0000-4000-8000-000000000002'
  ), 'denied trade draw call leaked or created an invoice';
END
$trade_draw_denial_state$;

UPDATE public.organization_members
SET status = 'active'
WHERE id = 'd4851100-0000-4000-8000-000000000002';

CREATE OR REPLACE FUNCTION pg_temp.force_trade_draw_update_error()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'forced trade draw update error'
    USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER d485_force_trade_draw_update_error
BEFORE UPDATE ON public.trade_scope_draws
FOR EACH ROW
WHEN (NEW.id = 'd4853200-0000-4000-8000-000000000002'::uuid)
EXECUTE FUNCTION pg_temp.force_trade_draw_update_error();

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000001', 'authenticated'
);
SELECT set_config('app.trade_draw_invoice_id', 'draw-error-sentinel', true);

DO $trade_draw_forced_error_restore$
BEGIN
  BEGIN
    PERFORM public.issue_trade_draw_invoice(
      'd4853200-0000-4000-8000-000000000002'
    );
    RAISE EXCEPTION 'forced trade draw update error did not fire';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  ASSERT current_setting('app.trade_draw_invoice_id', true) =
           'draw-error-sentinel',
    'trade draw error leaked its row capability';
  ASSERT auth.uid() = 'd4850000-0000-4000-8000-000000000001',
    'trade draw error changed the real caller';
END
$trade_draw_forced_error_restore$;

RESET ROLE;

DO $trade_draw_error_rollback$
BEGIN
  ASSERT (
    SELECT invoice_id IS NULL
    FROM public.trade_scope_draws
    WHERE id = 'd4853200-0000-4000-8000-000000000002'
  ), 'failed trade draw update left its invoice link';
  ASSERT 0 = (
    SELECT count(*)
    FROM public.invoices
    WHERE project_id = 'd4852000-0000-4000-8000-000000000002'
  ), 'failed trade draw update did not roll back its invoice';
END
$trade_draw_error_rollback$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000002', 'authenticated'
);

DO $spec_book_member_success$
DECLARE
  first_result jsonb;
  retry_result jsonb;
BEGIN
  first_result := public.prepare_spec_book_issue(
    'd4854100-0000-4000-8000-000000000001', ARRAY['client'],
    'full', NULL, NULL, 'sd-spec-idempotency', '[]'::jsonb
  );
  retry_result := public.prepare_spec_book_issue(
    'd4854100-0000-4000-8000-000000000001', ARRAY['client'],
    'full', NULL, NULL, 'sd-spec-idempotency', '[]'::jsonb
  );
  ASSERT first_result = retry_result
     AND first_result->>'actorId' =
           'd4850000-0000-4000-8000-000000000002',
    'spec issue did not bind the current active studio member idempotently';

  BEGIN
    PERFORM public.prepare_spec_book_issue(
      'd4854100-0000-4000-8000-000000000002', ARRAY['client'],
      'full', NULL, NULL, 'sd-spec-wrong-studio', '[]'::jsonb
    );
    RAISE EXCEPTION
      'shared-studio member prepared a book from another canonical studio';
  EXCEPTION WHEN insufficient_privilege THEN
    ASSERT SQLERRM = 'spec book not found or not accessible';
  END;
END
$spec_book_member_success$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000003',
  'service_role',
  jsonb_build_object(
    'actor_id', 'd4850000-0000-4000-8000-000000000001',
    'organization_id', 'd4851000-0000-4000-8000-000000000001'
  )
);

DO $spec_book_outsider_denial$
DECLARE
  inaccessible_error text;
  nonexistent_error text;
BEGIN
  BEGIN
    PERFORM public.prepare_spec_book_issue(
      'd4854100-0000-4000-8000-000000000001', ARRAY['client'],
      'full', NULL, NULL, 'sd-spec-outsider', '[]'::jsonb
    );
    RAISE EXCEPTION 'outsider prepared a spec issue with forged claims';
  EXCEPTION WHEN insufficient_privilege THEN
    inaccessible_error := SQLERRM;
  END;
  BEGIN
    PERFORM public.prepare_spec_book_issue(
      'd4854199-0000-4000-8000-000000000099', ARRAY['client'],
      'full', NULL, NULL, 'sd-spec-nonexistent', '[]'::jsonb
    );
    RAISE EXCEPTION 'outsider enumerated a nonexistent spec book';
  EXCEPTION WHEN insufficient_privilege THEN
    nonexistent_error := SQLERRM;
  END;
  ASSERT inaccessible_error = nonexistent_error
     AND inaccessible_error = 'spec book not found or not accessible',
    'spec issue denial distinguishes inaccessible and nonexistent books';
END
$spec_book_outsider_denial$;

RESET ROLE;
UPDATE public.organization_members
SET status = 'removed'
WHERE id = 'd4851100-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000002', 'authenticated'
);

DO $spec_book_inactive_denial$
BEGIN
  BEGIN
    PERFORM public.prepare_spec_book_issue(
      'd4854100-0000-4000-8000-000000000001', ARRAY['client'],
      'full', NULL, NULL, 'sd-spec-inactive', '[]'::jsonb
    );
    RAISE EXCEPTION 'inactive member prepared a spec issue';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$spec_book_inactive_denial$;

RESET ROLE;
UPDATE public.organization_members
SET status = 'active'
WHERE id = 'd4851100-0000-4000-8000-000000000002';

SET LOCAL ROLE service_role;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000001', 'service_role'
);
DO $spec_book_service_acl_denial$
BEGIN
  BEGIN
    PERFORM public.prepare_spec_book_issue(
      'd4854100-0000-4000-8000-000000000001', ARRAY['client'],
      'full', NULL, NULL, 'sd-spec-service', '[]'::jsonb
    );
    RAISE EXCEPTION 'service role retained direct spec-issue EXECUTE';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public._prepare_spec_book_issue_00403(
      'd4854100-0000-4000-8000-000000000001', ARRAY['client'],
      'full', NULL, NULL, 'sd-spec-private-service', '[]'::jsonb
    );
    RAISE EXCEPTION 'service role retained direct private spec-core EXECUTE';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$spec_book_service_acl_denial$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000002', 'authenticated'
);
SELECT set_config('app.project_review_publish', 'review-sentinel', true);

DO $review_publish_authorized_contract$
DECLARE
  result jsonb;
BEGIN
  result := public.publish_project_review(jsonb_build_object(
    'projectId', 'd4852000-0000-4000-8000-000000000004',
    'title', 'SD Safe Review',
    'clientPriceMode', 'hide',
    'boardIds', '[]'::jsonb,
    'items', '[]'::jsonb
  ));
  ASSERT (result->>'published')::boolean,
    'authorized studio member did not reach review publication';
  ASSERT current_setting('app.project_review_publish', true) =
           'review-sentinel',
    'successful review publication leaked its capability';

  BEGIN
    PERFORM public.publish_project_review(jsonb_build_object(
      'projectId', 'd4852000-0000-4000-8000-000000000006',
      'title', 'SD Wrong Studio Review',
      'clientPriceMode', 'hide',
      'boardIds', '[]'::jsonb,
      'items', '[]'::jsonb
    ));
    RAISE EXCEPTION
      'shared-studio member published another canonical studio project';
  EXCEPTION WHEN insufficient_privilege THEN
    ASSERT SQLERRM = 'project not found or access denied';
  END;

  BEGIN
    PERFORM public.publish_project_review(jsonb_build_object(
      'projectId', 'd4852000-0000-4000-8000-000000000004',
      'title', 'force-error',
      'clientPriceMode', 'hide',
      'boardIds', '[]'::jsonb,
      'items', '[]'::jsonb
    ));
    RAISE EXCEPTION 'forced review publication error did not fire';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  ASSERT current_setting('app.project_review_publish', true) =
           'review-sentinel',
    'review publication error leaked its capability';

  BEGIN
    PERFORM public.publish_project_review(jsonb_build_object(
      'projectId', 'd4852000-0000-4000-8000-000000000004',
      'title', 'SD Invalid Media Review',
      'clientPriceMode', 'hide',
      'boardIds', jsonb_build_array(
        'd4854200-0000-4000-8000-000000000001'
      ),
      'items', '[]'::jsonb
    ));
    RAISE EXCEPTION 'authorized invalid media escaped detailed validation';
  EXCEPTION WHEN integrity_constraint_violation THEN NULL;
  END;
END
$review_publish_authorized_contract$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000003',
  'service_role',
  jsonb_build_object(
    'actor_id', 'd4850000-0000-4000-8000-000000000001',
    'organization_id', 'd4851000-0000-4000-8000-000000000001'
  )
);

DO $review_publish_non_enumeration$
DECLARE
  inaccessible_error text;
  nonexistent_error text;
BEGIN
  BEGIN
    PERFORM public.publish_project_review(jsonb_build_object(
      'projectId', 'd4852000-0000-4000-8000-000000000004',
      'title', 'SD Inaccessible Review',
      'clientPriceMode', 'hide',
      'boardIds', jsonb_build_array(
        'd4854200-0000-4000-8000-000000000001'
      ),
      'items', '[]'::jsonb
    ));
    RAISE EXCEPTION 'outsider published an inaccessible project';
  EXCEPTION WHEN insufficient_privilege THEN
    inaccessible_error := SQLERRM;
  END;

  BEGIN
    PERFORM public.publish_project_review(jsonb_build_object(
      'projectId', 'd4852999-0000-4000-8000-000000000099',
      'title', 'SD Nonexistent Review',
      'clientPriceMode', 'hide',
      'boardIds', jsonb_build_array(
        'd4854200-0000-4000-8000-000000000001'
      ),
      'items', '[]'::jsonb
    ));
    RAISE EXCEPTION 'outsider published a nonexistent project';
  EXCEPTION WHEN insufficient_privilege THEN
    nonexistent_error := SQLERRM;
  END;

  ASSERT inaccessible_error = nonexistent_error
     AND inaccessible_error = 'project not found or access denied',
    'review publication leaked project or media existence before authorization';
END
$review_publish_non_enumeration$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_actor(
  'd4850000-0000-4000-8000-000000000002',
  'service_role',
  jsonb_build_object(
    'organization_id', 'd4851000-0000-4000-8000-000000000002'
  )
);

DO $authenticated_trigger_claim_denials$
BEGIN
  BEGIN
    INSERT INTO public.projects (
      id, name, designer_id, client_id, created_by, studio_id
    ) VALUES (
      'd4852000-0000-4000-8000-000000000090',
      'Forged Foreign Studio Project',
      'd4850000-0000-4000-8000-000000000001',
      'd4850000-0000-4000-8000-000000000004',
      'd4850000-0000-4000-8000-000000000001',
      'd4851000-0000-4000-8000-000000000002'
    );
    RAISE EXCEPTION 'forged claim stamped a foreign project studio';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'studio_id_not_designer_studio';
  END;

  BEGIN
    INSERT INTO public.invoices (
      id, project_id, designer_id, client_id, studio_id,
      status, currency, subtotal_cents, total_cents
    ) VALUES (
      'd4857000-0000-4000-8000-000000000090',
      'd4852000-0000-4000-8000-000000000002',
      'd4850000-0000-4000-8000-000000000001',
      'd4850000-0000-4000-8000-000000000004',
      'd4851000-0000-4000-8000-000000000002',
      'draft', 'USD', 0, 0
    );
    RAISE EXCEPTION 'forged claim stamped a foreign invoice studio';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'studio_id_not_designer_studio';
  END;
END
$authenticated_trigger_claim_denials$;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'service_role', true);

DO $authenticated_trigger_null_uid_denials$
BEGIN
  BEGIN
    INSERT INTO public.projects (
      id, name, designer_id, client_id, created_by, studio_id
    ) VALUES (
      'd4852000-0000-4000-8000-000000000088',
      'NULL Actor Project Stamp',
      'd4850000-0000-4000-8000-000000000001',
      'd4850000-0000-4000-8000-000000000004',
      'd4850000-0000-4000-8000-000000000001',
      'd4851000-0000-4000-8000-000000000001'
    );
    RAISE EXCEPTION 'NULL authenticated actor stamped a project studio';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'studio_id_not_designer_studio';
  END;

  BEGIN
    INSERT INTO public.invoices (
      id, project_id, designer_id, client_id, studio_id,
      status, currency, subtotal_cents, total_cents
    ) VALUES (
      'd4857000-0000-4000-8000-000000000088',
      'd4852000-0000-4000-8000-000000000001',
      'd4850000-0000-4000-8000-000000000001',
      'd4850000-0000-4000-8000-000000000004',
      'd4851000-0000-4000-8000-000000000001',
      'draft', 'USD', 0, 0
    );
    RAISE EXCEPTION 'NULL authenticated actor stamped an invoice studio';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'studio_id_not_designer_studio';
  END;
END
$authenticated_trigger_null_uid_denials$;

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '', true);
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', '', true);

INSERT INTO public.projects (
  id, name, designer_id, client_id, created_by, studio_id
)
VALUES (
  'd4852000-0000-4000-8000-000000000091',
  'Service Exact Studio Project',
  'd4850000-0000-4000-8000-000000000001',
  'd4850000-0000-4000-8000-000000000004',
  'd4850000-0000-4000-8000-000000000001',
  'd4851000-0000-4000-8000-000000000001'
);

INSERT INTO public.invoices (
  id, project_id, designer_id, client_id, studio_id,
  status, currency, subtotal_cents, total_cents
)
VALUES (
  'd4857000-0000-4000-8000-000000000091',
  'd4852000-0000-4000-8000-000000000091',
  'd4850000-0000-4000-8000-000000000001',
  'd4850000-0000-4000-8000-000000000004',
  NULL,
  'draft', 'USD', 0, 0
);

DO $service_trigger_tuple_contract$
BEGIN
  BEGIN
    INSERT INTO public.projects (
      id, name, designer_id, client_id, created_by, studio_id
    ) VALUES (
      'd4852000-0000-4000-8000-000000000092',
      'Service Null Derived Project',
      'd4850000-0000-4000-8000-000000000003',
      'd4850000-0000-4000-8000-000000000004',
      'd4850000-0000-4000-8000-000000000003',
      NULL
    );
    RAISE EXCEPTION 'service role retained an invalid NULL-derived project tuple';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'studio_id_not_designer_studio';
  END;

  BEGIN
    INSERT INTO public.invoices (
      id, project_id, designer_id, client_id, studio_id,
      status, currency, subtotal_cents, total_cents
    ) VALUES (
      'd4857000-0000-4000-8000-000000000092',
      'd4852000-0000-4000-8000-000000000002',
      'd4850000-0000-4000-8000-000000000002',
      'd4850000-0000-4000-8000-000000000004',
      NULL, 'draft', 'USD', 0, 0
    );
    RAISE EXCEPTION 'service role retained a cross-studio derived invoice tuple';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'studio_id_not_designer_studio';
  END;

  BEGIN
    UPDATE public.projects
    SET designer_id = 'd4850000-0000-4000-8000-000000000002'
    WHERE id = 'd4852000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'designer ownership update crossed the canonical studio';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'studio_id_not_designer_studio';
  END;

  BEGIN
    UPDATE public.invoices
    SET project_id = 'd4852000-0000-4000-8000-000000000002'
    WHERE id = 'd4857000-0000-4000-8000-000000000091';
    RAISE EXCEPTION 'invoice project ownership update crossed studios';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'studio_id_not_designer_studio';
  END;

  BEGIN
    UPDATE public.invoices
    SET designer_id = 'd4850000-0000-4000-8000-000000000002'
    WHERE id = 'd4857000-0000-4000-8000-000000000091';
    RAISE EXCEPTION 'invoice designer ownership update escaped its project';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'studio_id_not_designer_studio';
  END;
END
$service_trigger_tuple_contract$;

RESET ROLE;

DO $service_trigger_success$
BEGIN
  ASSERT (
    SELECT studio_id = 'd4851000-0000-4000-8000-000000000001'
    FROM public.projects
    WHERE id = 'd4852000-0000-4000-8000-000000000091'
  ), 'service role could not retain an exact project tuple without auth.uid';
  ASSERT (
    SELECT studio_id = 'd4851000-0000-4000-8000-000000000001'
    FROM public.invoices
    WHERE id = 'd4857000-0000-4000-8000-000000000091'
  ), 'service role could not derive and validate the exact invoice studio';
  ASSERT NOT has_function_privilege(
    'service_role', 'public.set_project_studio_id()', 'EXECUTE'
  ) AND NOT has_function_privilege(
    'service_role', 'public.set_invoice_studio_id()', 'EXECUTE'
  ), 'service trigger writes gained direct trigger EXECUTE';
END
$service_trigger_success$;

ROLLBACK;

-- A pooled successor transaction must not inherit any transaction-local
-- authority minted by a successful or failed request above.
BEGIN;
SET LOCAL plpgsql.check_asserts = on;
DO $pooled_successor_contract$
BEGIN
  ASSERT current_setting('plpgsql.check_asserts') = 'on',
    'pooled successor disabled plpgsql assertions';
  ASSERT COALESCE(
    NULLIF(current_setting('app.commercial_signature_capability', true), ''),
    ''
  ) = '', 'pooled successor inherited a commercial signature capability';
  ASSERT COALESCE(
    NULLIF(current_setting('app.trade_draw_invoice_id', true), ''), ''
  ) = '', 'pooled successor inherited a trade draw capability';
  ASSERT COALESCE(
    NULLIF(current_setting('app.project_review_publish', true), ''), ''
  ) = '', 'pooled successor inherited a review publication capability';
  ASSERT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), ''), ''
  ) = '', 'pooled successor inherited request JWT claims';
  ASSERT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''), ''
  ) = '', 'pooled successor inherited the scalar JWT subject';
  ASSERT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''), ''
  ) = '', 'pooled successor inherited the scalar JWT role';
  ASSERT COALESCE(current_setting('role', true), 'none') = 'none',
    'pooled successor inherited an application database role';
END
$pooled_successor_contract$;
ROLLBACK;
