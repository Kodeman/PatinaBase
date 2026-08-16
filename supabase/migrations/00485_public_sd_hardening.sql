-- ═══════════════════════════════════════════════════════════════════════════
-- 00485 — Public SECURITY DEFINER hardening
--
-- Lineage:
--   studio stamp triggers ................. 00317 / 00318
--   proposal-send provider transitions ... 00388
--   decision notification boundaries ..... 00399
--   specification issue boundary ......... 00403
--   board-unfurl quota .................... 00410
--   trade-scope acts and draw billing ..... 00423 / 00424 / 00475
--   review publication .................... 00435 → 00447 → 00449
--   trusted-IP commercial wrappers ........ 00462
--
-- A SECURITY DEFINER observes its owner as current_user. The role selected on
-- the connection remains in the role GUC, so privileged server branches bind
-- to current_setting('role', true), never caller-writable JWT role claims.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $preflight$
DECLARE
  required_role text;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '00485 must run as postgres; got %', current_user;
  END IF;

  FOREACH required_role IN ARRAY ARRAY[
    'anon', 'authenticated', 'service_role'
  ]
  LOOP
    IF to_regrole(required_role) IS NULL THEN
      RAISE EXCEPTION '00485 required role % is missing', required_role;
    END IF;
  END LOOP;

  IF to_regnamespace('app_private') IS NULL THEN
    RAISE EXCEPTION '00485 requires the app_private schema';
  END IF;
END
$preflight$;

CREATE TEMP TABLE _00485_profile (
  signature text PRIMARY KEY,
  source_file text NOT NULL,
  language_name text NOT NULL,
  arguments text NOT NULL,
  result_type text NOT NULL,
  volatility "char" NOT NULL,
  original_config text[] NOT NULL,
  final_config text[] NOT NULL,
  original_body_sha256 text NOT NULL,
  final_body_sha256 text NOT NULL,
  original_roles text[] NOT NULL,
  final_roles text[] NOT NULL
) ON COMMIT DROP;

INSERT INTO _00485_profile (
  signature, source_file, language_name, arguments, result_type, volatility,
  original_config, final_config, original_body_sha256, final_body_sha256,
  original_roles, final_roles
)
VALUES
  (
    'public.accept_trade_scope_with_trusted_ip(uuid,text,uuid,text)',
    '00423_trade_scope_instrument.sql', 'plpgsql',
    'p_proposal_id uuid, p_signed_name text, p_client_id uuid, p_signed_ip text DEFAULT NULL::text',
    'jsonb', 'v', ARRAY['search_path=public, pg_temp']::text[],
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    'dd649b835ad9cfa4e4c0cc9ec0a81ff562d34f31585ef89e18ed7415380cfde7',
    '66c3128ffcfcea9b9f43c3a5b7db7b003fcd0189af3ee26a15e71d69139ead4f', ARRAY['service_role']::text[],
    ARRAY['service_role']::text[]
  ),
  (
    'public.begin_proposal_send_provider_attempt(uuid,uuid)',
    '00388_proposal_send_dispatch_guard.sql', 'plpgsql',
    'p_dispatch_id uuid, p_claim_token uuid', 'jsonb', 'v',
    ARRAY['search_path=public, pg_temp']::text[],
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '478b0a4c6d05d62b90b2f66ce65fe20417586fc17c3842ea08dc8b8defeafceb',
    'd397dff1554e3900ae88a36c03f99fc0de8dfed0f3756b454c908d7a7c758427', ARRAY['service_role']::text[],
    ARRAY['service_role']::text[]
  ),
  (
    'public.complete_proposal_send_dispatch(uuid,uuid,text,text,text)',
    '00388_proposal_send_dispatch_guard.sql', 'plpgsql',
    'p_dispatch_id uuid, p_claim_token uuid, p_delivery_state text, p_provider_id text DEFAULT NULL::text, p_error text DEFAULT NULL::text',
    'jsonb', 'v', ARRAY['search_path=public, pg_temp']::text[],
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '37d06b312c2370dc13587ef23af5975642077b680587ec81f306f31961c9921c',
    '3c4c0ad27c8ff731bd9195ba231c55d7e2d89e7c0fb106303457cc26591fc46f', ARRAY['service_role']::text[],
    ARRAY['service_role']::text[]
  ),
  (
    'public.consume_board_unfurl_quota(uuid)',
    '00410_board_asset_maintenance.sql', 'plpgsql',
    'p_user_id uuid DEFAULT NULL::uuid', 'jsonb', 'v',
    ARRAY['search_path=public, pg_temp']::text[],
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    'bd31f96e99658d61f5bee138e3a8df2315f15826ff9a26b22e9d490a41090b86',
    '310624681b340da2ef06a057a03f2d43962a3d19f0bffa35f5722ff4cc1eb992', ARRAY['authenticated', 'service_role']::text[],
    ARRAY['service_role']::text[]
  ),
  (
    'public.execute_furnishings_authorization_with_trusted_ip(uuid,text,uuid,text)',
    '00462_workflow_privacy_authority.sql', 'plpgsql',
    'p_proposal_id uuid, p_signed_name text, p_client_id uuid, p_signed_ip text DEFAULT NULL::text',
    'jsonb', 'v', ARRAY['search_path=public, pg_temp']::text[],
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '21a82fcc2da6fa6773b2f694ee3ce8aecbbb0da92ade04e66cf33ed4a2f6b936',
    '2caebad912c73b5d4a80c91a9e1608c2fdc8b9e6d020839ca04ff84f58ee4283', ARRAY['service_role']::text[],
    ARRAY['service_role']::text[]
  ),
  (
    'public.execute_trade_scope_with_trusted_ip(uuid,text,uuid,text)',
    '00462_workflow_privacy_authority.sql', 'plpgsql',
    'p_proposal_id uuid, p_signed_name text, p_client_id uuid, p_signed_ip text DEFAULT NULL::text',
    'jsonb', 'v', ARRAY['search_path=public, pg_temp']::text[],
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '84d93133726bcdd5224929d0fca21eaffbd4ff39791d237692ffb2e77b470b51',
    '83b0a7f5a54c33a80c3e9333603f3c4391cfa0f1913feb21ed1c1bb645017a12', ARRAY['service_role']::text[],
    ARRAY['service_role']::text[]
  ),
  (
    'public.issue_trade_draw_invoice(uuid)',
    '00423_trade_scope_instrument.sql', 'plpgsql', 'p_draw_id uuid',
    'jsonb', 'v', ARRAY['search_path=public, pg_temp']::text[],
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    'ee7d6f4269b453e04d1fb9ab3f9a039893d2312dc62a71632e14f05230ce9caa',
    'a0ae45909cb9297e38f0a99b72a0581a52686bccc44235866c1543b100b51ebb', ARRAY['authenticated']::text[],
    ARRAY['authenticated']::text[]
  ),
  (
    'public.notify_decision_overdue(uuid)',
    '00399_journey_authority_integrity.sql', 'plpgsql',
    'p_decision_id uuid', 'uuid', 'v',
    ARRAY['search_path=public, pg_temp']::text[],
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '0f9d44eb89fabae23bb1f76b43932fec4f7361ff43cdde8ad98a0e58c422654d',
    'f3ef2f42fa4667fce41e01342d0cea6df256f9df50940f32ce65e6c46fd64030', ARRAY['service_role']::text[],
    ARRAY['service_role']::text[]
  ),
  (
    'public.notify_decision_required(uuid)',
    '00399_journey_authority_integrity.sql', 'plpgsql',
    'p_decision_id uuid', 'uuid', 'v',
    ARRAY['search_path=public, pg_temp']::text[],
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '468028399c8dac0e22f86792b0e0d53dc21c6cde19f9da7fb4aca99a4fb579bf',
    'f785ab8588cc55a693a146984a71319e7afe9e27cbfee1154fc08d4b9c68156e', ARRAY['authenticated', 'service_role']::text[],
    ARRAY['service_role']::text[]
  ),
  (
    'public.notify_decision_resolved(uuid)',
    '00399_journey_authority_integrity.sql', 'plpgsql',
    'p_decision_id uuid', 'uuid', 'v',
    ARRAY['search_path=public, pg_temp']::text[],
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '093496787e6722ef6c66aac2ba06181c81ce4c8b08c216a158a4c0ee8dbe837d',
    '6e0a32a2fbc1a57d7c4da7fca2d108d2b813923ec58ec731a132a66d36958483', ARRAY['authenticated', 'service_role']::text[],
    ARRAY['service_role']::text[]
  ),
  (
    'public.prepare_spec_book_issue(uuid,text[],text,text,uuid,text,jsonb)',
    '00403_product_configuration_foundation.sql', 'plpgsql',
    'p_spec_book_id uuid, p_audiences text[], p_issue_type text, p_reason text, p_base_revision_id uuid, p_idempotency_key text, p_warning_acknowledgements jsonb DEFAULT ''[]''::jsonb',
    'jsonb', 'v', ARRAY['search_path=public, pg_temp']::text[],
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '93b5139ac2d585c9ca306c232f46c87a116a8f77ea4aa174c0707c64569ed26a',
    '9db7632d6d2c5e9f655f6a5e8e7729d7a88995c35c59e9264b56dc0e50a07ad0', ARRAY['authenticated', 'service_role']::text[],
    ARRAY['authenticated']::text[]
  ),
  (
    'public.publish_project_review(jsonb)',
    '00449_ffe_final_direct_probe_fixes.sql', 'plpgsql',
    'p_request jsonb', 'jsonb', 'v',
    ARRAY['search_path=public, extensions, pg_temp']::text[],
    ARRAY['search_path=pg_catalog, public, extensions, pg_temp']::text[],
    'ce4e7ba2e0911edd394cab4963746e0e8e6b2e24951fa19cf640781fc8c5dfee',
    'e597174717ea8b7663a9fb78d9ff34b98a886263c051f501687045d1c11b6744', ARRAY['authenticated']::text[],
    ARRAY['authenticated']::text[]
  ),
  (
    'public.release_proposal_send_dispatch(uuid,uuid,text)',
    '00388_proposal_send_dispatch_guard.sql', 'plpgsql',
    'p_dispatch_id uuid, p_claim_token uuid, p_error text', 'jsonb', 'v',
    ARRAY['search_path=public, pg_temp']::text[],
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    'a7064a73dd0e2b4c299297f57c1187f6695cc20d2ecb4398a4d146ac8c077a46',
    'c42006d734dd3c577ac4282ed6e18ec1a3b371e3ce25c13395d993b451c0c547', ARRAY['service_role']::text[],
    ARRAY['service_role']::text[]
  ),
  (
    'public.set_invoice_studio_id()',
    '00318_studio_invoice_numbering_and_ops.sql', 'plpgsql', '',
    'trigger', 'v', ARRAY['search_path=public']::text[],
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '53c95a7cbfb04102ddd662fc0d0d63fd33474c3e3e3c51e9c23ce6263bf3a474',
    '209b6ded25eae8464931b26f8112db309f6937561cee0c16d786870759e65e3c', ARRAY['authenticated', 'service_role']::text[],
    ARRAY[]::text[]
  ),
  (
    'public.set_project_studio_id()',
    '00317_projects_studio_id_maintenance.sql', 'plpgsql', '',
    'trigger', 'v', ARRAY['search_path=public']::text[],
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '04b921692fd72c03a2137e413c76d997435bafb3c29d2506e8b3fa14d8f6ce20',
    '8c14190278562ee8ba47eecdcfc3cb322a04e4130ee66930ae085bc52609d936', ARRAY['authenticated', 'service_role']::text[],
    ARRAY[]::text[]
  ),
  (
    'public.sign_design_services_agreement_with_trusted_ip(uuid,text,uuid,text)',
    '00462_workflow_privacy_authority.sql', 'plpgsql',
    'p_proposal_id uuid, p_signed_name text, p_client_id uuid, p_signed_ip text DEFAULT NULL::text',
    'jsonb', 'v', ARRAY['search_path=public, pg_temp']::text[],
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '4933f896889c9a8f0287f3ecff31e5135b00e91c4248cd8c7239f55b36441511',
    '6c615ca417d594865e1f0772ee862c312e7a398d037c141366c8a1b97fd6f17d', ARRAY['service_role']::text[],
    ARRAY['service_role']::text[]
  ),
  (
    'public.suppress_proposal_send_dispatch(uuid,uuid,text)',
    '00388_proposal_send_dispatch_guard.sql', 'plpgsql',
    'p_dispatch_id uuid, p_claim_token uuid, p_reason text', 'jsonb', 'v',
    ARRAY['search_path=public, pg_temp']::text[],
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '0e4e9f0ef116f4df2e77f84304359bf724182f624641e5c3940448eee2726ba9',
    '8656a0f6a7ce43fa1cada96876b37f570e7cc583408f7eab3d3e453990be7d26', ARRAY['service_role']::text[],
    ARRAY['service_role']::text[]
  );

DO $profile_preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM _00485_profile AS expected
    LEFT JOIN pg_proc AS routine
      ON routine.oid = to_regprocedure(expected.signature)
    LEFT JOIN pg_roles AS owner ON owner.oid = routine.proowner
    LEFT JOIN pg_language AS language ON language.oid = routine.prolang
    CROSS JOIN LATERAL (
      SELECT encode(
        extensions.digest(convert_to(routine.prosrc, 'UTF8'), 'sha256'),
        'hex'
      ) AS body_sha256
    ) AS body
    WHERE routine.oid IS NULL
      OR owner.rolname IS DISTINCT FROM 'postgres'
      OR language.lanname IS DISTINCT FROM expected.language_name
      OR routine.prokind <> 'f'
      OR NOT routine.prosecdef
      OR routine.provolatile IS DISTINCT FROM expected.volatility
      OR routine.proisstrict
      OR routine.proleakproof
      OR routine.proparallel <> 'u'
      OR pg_get_function_arguments(routine.oid)
           IS DISTINCT FROM expected.arguments
      OR pg_get_function_result(routine.oid)
           IS DISTINCT FROM expected.result_type
      OR NOT (
        (
          routine.proconfig IS NOT DISTINCT FROM expected.original_config
          AND body.body_sha256 = expected.original_body_sha256
        )
        OR (
          routine.proconfig IS NOT DISTINCT FROM expected.final_config
          AND body.body_sha256 = expected.final_body_sha256
        )
      )
  ) THEN
    RAISE EXCEPTION '00485 reviewed source/final routine profile drifted';
  END IF;

  IF EXISTS (
    WITH actual AS (
      SELECT
        expected.signature,
        CASE acl.grantee
          WHEN 0 THEN 'PUBLIC'
          ELSE grantee.rolname::text
        END AS grantee,
        grantor.rolname::text AS grantor,
        acl.privilege_type,
        acl.is_grantable
      FROM _00485_profile AS expected
      JOIN pg_proc AS routine
        ON routine.oid = to_regprocedure(expected.signature)
      CROSS JOIN LATERAL aclexplode(
        COALESCE(routine.proacl, acldefault('f', routine.proowner))
      ) AS acl
      LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
      LEFT JOIN pg_roles AS grantor ON grantor.oid = acl.grantor
      WHERE acl.grantee <> routine.proowner
    ),
    original_expected AS (
      SELECT
        profile.signature,
        role_name AS grantee,
        'postgres'::text AS grantor,
        'EXECUTE'::text AS privilege_type,
        false AS is_grantable
      FROM _00485_profile AS profile
      CROSS JOIN LATERAL unnest(profile.original_roles) AS role_name
    ),
    final_expected AS (
      SELECT
        profile.signature,
        role_name AS grantee,
        'postgres'::text AS grantor,
        'EXECUTE'::text AS privilege_type,
        false AS is_grantable
      FROM _00485_profile AS profile
      CROSS JOIN LATERAL unnest(profile.final_roles) AS role_name
    )
    SELECT 1
    FROM _00485_profile AS profile
    WHERE EXISTS (
      (SELECT grantee, grantor, privilege_type, is_grantable
       FROM actual WHERE signature = profile.signature
       EXCEPT ALL
       SELECT grantee, grantor, privilege_type, is_grantable
       FROM original_expected WHERE signature = profile.signature)
      UNION ALL
      (SELECT grantee, grantor, privilege_type, is_grantable
       FROM original_expected WHERE signature = profile.signature
       EXCEPT ALL
       SELECT grantee, grantor, privilege_type, is_grantable
       FROM actual WHERE signature = profile.signature)
    )
      AND EXISTS (
        (SELECT grantee, grantor, privilege_type, is_grantable
         FROM actual WHERE signature = profile.signature
         EXCEPT ALL
         SELECT grantee, grantor, privilege_type, is_grantable
         FROM final_expected WHERE signature = profile.signature)
        UNION ALL
        (SELECT grantee, grantor, privilege_type, is_grantable
         FROM final_expected WHERE signature = profile.signature
         EXCEPT ALL
         SELECT grantee, grantor, privilege_type, is_grantable
         FROM actual WHERE signature = profile.signature)
      )
  ) THEN
    RAISE EXCEPTION '00485 reviewed source/final direct ACL drifted';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _00485_profile AS profile
    JOIN pg_proc AS routine
      ON routine.oid = to_regprocedure(profile.signature)
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
        END <> ALL(profile.original_roles || profile.final_roles)
        OR grantor.rolname IS DISTINCT FROM 'postgres'
        OR acl.is_grantable
      )
  ) THEN
    RAISE EXCEPTION '00485 unreviewed source/final direct EXECUTE row exists';
  END IF;

  IF EXISTS (
    WITH profile_state AS (
      SELECT
        expected.signature,
        routine.proconfig IS NOT DISTINCT FROM expected.original_config
          AND encode(
                extensions.digest(
                  convert_to(routine.prosrc, 'UTF8'), 'sha256'
                ),
                'hex'
              ) = expected.original_body_sha256 AS is_source,
        routine.proconfig IS NOT DISTINCT FROM expected.final_config
          AND encode(
                extensions.digest(
                  convert_to(routine.prosrc, 'UTF8'), 'sha256'
                ),
                'hex'
              ) = expected.final_body_sha256 AS is_final
      FROM _00485_profile AS expected
      JOIN pg_proc AS routine
        ON routine.oid = to_regprocedure(expected.signature)
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
      FROM _00485_profile AS expected
      JOIN pg_proc AS routine
        ON routine.oid = to_regprocedure(expected.signature)
      CROSS JOIN LATERAL aclexplode(
        COALESCE(routine.proacl, acldefault('f', routine.proowner))
      ) AS acl
      LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
      LEFT JOIN pg_roles AS grantor ON grantor.oid = acl.grantor
      WHERE acl.grantee <> routine.proowner
    ),
    original_expected_acl AS (
      SELECT
        profile.signature,
        role_name AS grantee,
        'postgres'::text AS grantor,
        'EXECUTE'::text AS privilege_type,
        false AS is_grantable
      FROM _00485_profile AS profile
      CROSS JOIN LATERAL unnest(profile.original_roles) AS role_name
    ),
    final_expected_acl AS (
      SELECT
        profile.signature,
        role_name AS grantee,
        'postgres'::text AS grantor,
        'EXECUTE'::text AS privilege_type,
        false AS is_grantable
      FROM _00485_profile AS profile
      CROSS JOIN LATERAL unnest(profile.final_roles) AS role_name
    ),
    acl_state AS (
      SELECT
        profile.signature,
        NOT EXISTS (
          (SELECT grantee, grantor, privilege_type, is_grantable
           FROM actual_acl WHERE signature = profile.signature
           EXCEPT ALL
           SELECT grantee, grantor, privilege_type, is_grantable
           FROM original_expected_acl WHERE signature = profile.signature)
          UNION ALL
          (SELECT grantee, grantor, privilege_type, is_grantable
           FROM original_expected_acl WHERE signature = profile.signature
           EXCEPT ALL
           SELECT grantee, grantor, privilege_type, is_grantable
           FROM actual_acl WHERE signature = profile.signature)
        ) AS is_source,
        NOT EXISTS (
          (SELECT grantee, grantor, privilege_type, is_grantable
           FROM actual_acl WHERE signature = profile.signature
           EXCEPT ALL
           SELECT grantee, grantor, privilege_type, is_grantable
           FROM final_expected_acl WHERE signature = profile.signature)
          UNION ALL
          (SELECT grantee, grantor, privilege_type, is_grantable
           FROM final_expected_acl WHERE signature = profile.signature
           EXCEPT ALL
           SELECT grantee, grantor, privilege_type, is_grantable
           FROM actual_acl WHERE signature = profile.signature)
        ) AS is_final
      FROM _00485_profile AS profile
    )
    SELECT 1
    FROM profile_state
    JOIN acl_state USING (signature)
    WHERE NOT (
      (profile_state.is_source AND acl_state.is_source)
      OR (profile_state.is_final AND acl_state.is_final)
    )
  ) THEN
    RAISE EXCEPTION '00485 routine profile and ACL states are incoherent';
  END IF;
END
$profile_preflight$;

DO $private_core_preflight$
DECLARE
  core_oid oid := to_regprocedure(
    'app_private.issue_invoice_for_actor(uuid,date,uuid)'
  );
BEGIN
  IF core_oid IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc AS routine
    JOIN pg_roles AS owner ON owner.oid = routine.proowner
    JOIN pg_language AS language ON language.oid = routine.prolang
    WHERE routine.oid = core_oid
      AND (
        owner.rolname IS DISTINCT FROM 'postgres'
        OR language.lanname IS DISTINCT FROM 'plpgsql'
        OR routine.prokind <> 'f'
        OR NOT routine.prosecdef
        OR routine.provolatile <> 'v'
        OR routine.proisstrict
        OR routine.proleakproof
        OR routine.proparallel <> 'u'
        OR routine.proconfig IS DISTINCT FROM
             ARRAY['search_path=pg_catalog, public, pg_temp']::text[]
        OR pg_get_function_arguments(routine.oid) IS DISTINCT FROM
             'p_invoice_id uuid, p_due_date date, p_actor_id uuid'
        OR pg_get_function_result(routine.oid) IS DISTINCT FROM 'invoices'
        OR encode(
             extensions.digest(
               convert_to(routine.prosrc, 'UTF8'), 'sha256'
             ),
             'hex'
           ) IS DISTINCT FROM
             '1bb33e50769432c5ecd3f08328da152008e0d328a47167c4a059cafc31c3d3e4'
      )
  ) THEN
    RAISE EXCEPTION '00485 existing private invoice core profile drifted';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc AS routine
    CROSS JOIN LATERAL aclexplode(
      COALESCE(routine.proacl, acldefault('f', routine.proowner))
    ) AS acl
    WHERE routine.oid = core_oid
      AND acl.grantee <> routine.proowner
  ) THEN
    RAISE EXCEPTION '00485 existing private invoice core ACL drifted';
  END IF;
END
$private_core_preflight$;

CREATE OR REPLACE FUNCTION public.begin_proposal_send_provider_attempt(
  p_dispatch_id uuid,
  p_claim_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_dispatch public.proposal_send_dispatches%ROWTYPE;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'begin_proposal_send_provider_attempt requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_dispatch
  FROM public.proposal_send_dispatches
  WHERE id = p_dispatch_id
    AND claim_token = p_claim_token
    AND state = 'in_flight'
    AND lease_expires_at > v_now
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal send claim is stale or missing'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF v_dispatch.provider_request_body IS NULL THEN
    RAISE EXCEPTION 'provider request must be persisted before provider start'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF v_dispatch.provider_attempt_count >= 3
     OR (
       v_dispatch.retry_deadline IS NOT NULL
       AND v_dispatch.retry_deadline <= v_now
     )
  THEN
    RAISE EXCEPTION 'proposal send retry window is exhausted'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  UPDATE public.proposal_send_dispatches
  SET provider_attempt_count = provider_attempt_count + 1,
      provider_started_at = v_now,
      retry_deadline = COALESCE(retry_deadline, v_now + interval '23 hours'),
      last_error = NULL,
      updated_at = v_now
  WHERE id = v_dispatch.id
  RETURNING * INTO v_dispatch;

  RETURN jsonb_build_object(
    'attempt_count', v_dispatch.provider_attempt_count,
    'retry_deadline', v_dispatch.retry_deadline
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_proposal_send_dispatch(
  p_dispatch_id uuid,
  p_claim_token uuid,
  p_delivery_state text,
  p_provider_id text DEFAULT NULL,
  p_error text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_dispatch public.proposal_send_dispatches%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_final_state text;
  v_retry_exhausted boolean;
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'complete_proposal_send_dispatch requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_delivery_state NOT IN (
    'delivered', 'failed', 'ambiguous', 'unconfirmed'
  ) THEN
    RAISE EXCEPTION 'invalid provider completion state %', p_delivery_state
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_dispatch
  FROM public.proposal_send_dispatches
  WHERE id = p_dispatch_id
    AND claim_token = p_claim_token
    AND state = 'in_flight'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal send claim is stale or missing'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF p_delivery_state = 'unconfirmed'
     AND (
       v_dispatch.claimed_from_state IS DISTINCT FROM 'ambiguous'
       OR v_dispatch.provider_started_at IS NOT NULL
     )
  THEN
    RAISE EXCEPTION
      'unconfirmed is only valid for a suppressed replay of prior ambiguity'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF p_delivery_state IN ('delivered', 'failed', 'ambiguous')
     AND v_dispatch.provider_started_at IS NULL
  THEN
    RAISE EXCEPTION 'provider completion requires a started provider attempt'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  v_final_state := CASE
    WHEN p_delivery_state = 'ambiguous'
      AND (
        v_dispatch.provider_attempt_count >= 3
        OR (
          v_dispatch.provider_attempt_count > 0
          AND v_dispatch.retry_deadline IS NULL
        )
        OR v_dispatch.retry_deadline <= v_now
      )
      THEN 'unconfirmed'
    ELSE p_delivery_state
  END;

  UPDATE public.proposal_send_dispatches
  SET state = v_final_state,
      claim_token = NULL,
      lease_expires_at = NULL,
      claimed_from_state = NULL,
      delivered_at = CASE
        WHEN v_final_state = 'delivered' THEN v_now
        ELSE NULL
      END,
      provider_id = CASE
        WHEN v_final_state = 'delivered' THEN p_provider_id
        ELSE provider_id
      END,
      last_error = CASE
        WHEN v_final_state = 'delivered' THEN NULL
        ELSE left(COALESCE(p_error, v_final_state), 2000)
      END,
      updated_at = v_now
  WHERE id = v_dispatch.id
  RETURNING * INTO v_dispatch;

  v_retry_exhausted := v_dispatch.state = 'unconfirmed'
    OR (
      v_dispatch.state = 'failed'
      AND (
        v_dispatch.provider_attempt_count >= 3
        OR (
          v_dispatch.provider_attempt_count > 0
          AND v_dispatch.retry_deadline IS NULL
        )
        OR v_dispatch.retry_deadline <= v_now
      )
    );

  IF v_dispatch.state = 'unconfirmed' THEN
    PERFORM public._sync_proposal_send_email_log(v_dispatch.id);
  END IF;

  RETURN jsonb_build_object(
    'delivery_state', v_dispatch.state,
    'attempt_count', v_dispatch.provider_attempt_count,
    'retry_deadline', v_dispatch.retry_deadline,
    'retry_exhausted', v_retry_exhausted,
    'provider_id', v_dispatch.provider_id,
    'last_error', v_dispatch.last_error
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.suppress_proposal_send_dispatch(
  p_dispatch_id uuid,
  p_claim_token uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_dispatch public.proposal_send_dispatches%ROWTYPE;
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'suppress_proposal_send_dispatch requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.proposal_send_dispatches
  SET state = 'suppressed',
      claim_token = NULL,
      lease_expires_at = NULL,
      claimed_from_state = NULL,
      last_error = left(COALESCE(p_reason, 'suppressed'), 2000),
      updated_at = clock_timestamp()
  WHERE id = p_dispatch_id
    AND claim_token = p_claim_token
    AND state = 'in_flight'
    AND claimed_from_state IN ('pending', 'failed')
    AND provider_started_at IS NULL
  RETURNING * INTO v_dispatch;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'only a pending or definitively failed pre-provider claim may suppress'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  RETURN jsonb_build_object(
    'delivery_state', v_dispatch.state,
    'attempt_count', v_dispatch.provider_attempt_count,
    'last_error', v_dispatch.last_error
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.release_proposal_send_dispatch(
  p_dispatch_id uuid,
  p_claim_token uuid,
  p_error text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_dispatch public.proposal_send_dispatches%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_restore_state text;
  v_retry_exhausted boolean;
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'release_proposal_send_dispatch requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_dispatch
  FROM public.proposal_send_dispatches
  WHERE id = p_dispatch_id
    AND claim_token = p_claim_token
    AND state = 'in_flight'
    AND provider_started_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'only a current pre-provider claim may be released'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  v_restore_state := v_dispatch.claimed_from_state;
  IF v_restore_state = 'ambiguous'
     AND (
       v_dispatch.provider_attempt_count >= 3
       OR (
         v_dispatch.provider_attempt_count > 0
         AND v_dispatch.retry_deadline IS NULL
       )
       OR v_dispatch.retry_deadline <= v_now
     )
  THEN
    v_restore_state := 'unconfirmed';
  END IF;

  UPDATE public.proposal_send_dispatches
  SET state = v_restore_state,
      claim_token = NULL,
      lease_expires_at = NULL,
      claimed_from_state = NULL,
      provider_started_at = NULL,
      last_error = left(COALESCE(p_error, 'pre-provider failure'), 2000),
      updated_at = v_now
  WHERE id = v_dispatch.id
  RETURNING * INTO v_dispatch;

  v_retry_exhausted := v_dispatch.state = 'unconfirmed'
    OR (
      v_dispatch.state = 'failed'
      AND (
        v_dispatch.provider_attempt_count >= 3
        OR (
          v_dispatch.provider_attempt_count > 0
          AND v_dispatch.retry_deadline IS NULL
        )
        OR v_dispatch.retry_deadline <= v_now
      )
    );

  IF v_dispatch.state = 'unconfirmed' THEN
    PERFORM public._sync_proposal_send_email_log(v_dispatch.id);
  END IF;

  RETURN jsonb_build_object(
    'delivery_state', v_dispatch.state,
    'attempt_count', v_dispatch.provider_attempt_count,
    'retry_exhausted', v_retry_exhausted,
    'last_error', v_dispatch.last_error
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_decision_required(p_decision_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'notify_decision_required is service-role only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public._enqueue_decision_notification(
    p_decision_id, 'decision_required'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_decision_overdue(p_decision_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'notify_decision_overdue is service-role only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public._enqueue_decision_notification(
    p_decision_id, 'decision_overdue'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_decision_resolved(p_decision_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'notify_decision_resolved is service-role only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public._enqueue_decision_notification(
    p_decision_id, 'decision_resolved'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_board_unfurl_quota(
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user_id uuid := p_user_id;
  v_now timestamptz := clock_timestamp();
  v_day_start timestamptz;
  v_day_reset timestamptz;
  v_short_count integer;
  v_day_count integer;
  v_retry_after integer;
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'consume_board_unfurl_quota requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unfurl user is required'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('board-unfurl:' || v_user_id::text, 0)
  );

  v_day_start := (
    date_trunc('day', v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
  );
  v_day_reset := (
    (date_trunc('day', v_now AT TIME ZONE 'UTC') + interval '1 day')
      AT TIME ZONE 'UTC'
  );

  DELETE FROM public.board_unfurl_usage
  WHERE user_id = v_user_id
    AND consumed_at < v_now - interval '25 hours';

  SELECT count(*)::integer,
         COALESCE(
           ceil(extract(epoch FROM (
             min(consumed_at) + interval '10 minutes' - v_now
           )))::integer,
           0
         )
  INTO v_short_count, v_retry_after
  FROM public.board_unfurl_usage
  WHERE user_id = v_user_id
    AND consumed_at > v_now - interval '10 minutes';

  SELECT count(*)::integer
  INTO v_day_count
  FROM public.board_unfurl_usage
  WHERE user_id = v_user_id
    AND consumed_at >= v_day_start;

  IF v_short_count >= 10 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'ten_minute_limit',
      'limit', 10,
      'remaining', 0,
      'retry_after_seconds', GREATEST(v_retry_after, 1),
      'reset_at', v_now + make_interval(
        secs => GREATEST(v_retry_after, 1)
      )
    );
  END IF;

  IF v_day_count >= 100 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'daily_limit',
      'limit', 100,
      'remaining', 0,
      'retry_after_seconds', GREATEST(
        ceil(extract(epoch FROM (v_day_reset - v_now)))::integer,
        1
      ),
      'reset_at', v_day_reset
    );
  END IF;

  INSERT INTO public.board_unfurl_usage(user_id, consumed_at)
  VALUES (v_user_id, v_now);

  RETURN jsonb_build_object(
    'allowed', true,
    'reason', NULL,
    'limit', jsonb_build_object('ten_minutes', 10, 'day', 100),
    'remaining', jsonb_build_object(
      'ten_minutes', 9 - v_short_count,
      'day', 99 - v_day_count
    ),
    'retry_after_seconds', 0,
    'reset_at', v_day_reset
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_trade_scope_with_trusted_ip(
  p_proposal_id uuid,
  p_signed_name text,
  p_client_id uuid,
  p_signed_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'trusted-IP trade scope acceptance requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN public._accept_trade_scope_authorized(
    p_proposal_id, p_signed_name, p_client_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sign_design_services_agreement_with_trusted_ip(
  p_proposal_id uuid,
  p_signed_name text,
  p_client_id uuid,
  p_signed_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_previous_capability text :=
    current_setting('app.commercial_signature_capability', true);
  v_result jsonb;
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'trusted-IP design-services signing requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM set_config(
    'app.commercial_signature_capability',
    format(
      'commercial_signature:%s:%s:%s', p_proposal_id,
      'sign_design_services_agreement', pg_catalog.txid_current()
    ),
    true
  );
  v_result := public._sign_design_services_agreement_authorized(
    p_proposal_id, p_signed_name, p_client_id, p_signed_ip
  );
  PERFORM set_config(
    'app.commercial_signature_capability',
    COALESCE(v_previous_capability, ''),
    true
  );
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.commercial_signature_capability',
    COALESCE(v_previous_capability, ''),
    true
  );
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_furnishings_authorization_with_trusted_ip(
  p_proposal_id uuid,
  p_signed_name text,
  p_client_id uuid,
  p_signed_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_previous_capability text :=
    current_setting('app.commercial_signature_capability', true);
  v_result jsonb;
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'trusted-IP furnishings execution requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM set_config(
    'app.commercial_signature_capability',
    format(
      'commercial_signature:%s:%s:%s', p_proposal_id,
      'execute_furnishings_authorization', pg_catalog.txid_current()
    ),
    true
  );
  v_result := public._execute_furnishings_authorization_authorized(
    p_proposal_id, p_signed_name, p_client_id, p_signed_ip
  );
  PERFORM set_config(
    'app.commercial_signature_capability',
    COALESCE(v_previous_capability, ''),
    true
  );
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.commercial_signature_capability',
    COALESCE(v_previous_capability, ''),
    true
  );
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_trade_scope_with_trusted_ip(
  p_proposal_id uuid,
  p_signed_name text,
  p_client_id uuid,
  p_signed_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_previous_capability text :=
    current_setting('app.commercial_signature_capability', true);
  v_result jsonb;
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'trusted-IP trade scope execution requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM set_config(
    'app.commercial_signature_capability',
    format(
      'commercial_signature:%s:%s:%s', p_proposal_id,
      'execute_trade_scope', pg_catalog.txid_current()
    ),
    true
  );
  v_result := public._execute_trade_scope_authorized(
    p_proposal_id, p_signed_name, p_client_id, p_signed_ip
  );
  PERFORM set_config(
    'app.commercial_signature_capability',
    COALESCE(v_previous_capability, ''),
    true
  );
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.commercial_signature_capability',
    COALESCE(v_previous_capability, ''),
    true
  );
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_spec_book_issue(
  p_spec_book_id uuid,
  p_audiences text[],
  p_issue_type text,
  p_reason text,
  p_base_revision_id uuid,
  p_idempotency_key text,
  p_warning_acknowledgements jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_designer_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'spec book not found or not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT project.designer_id INTO v_designer_id
  FROM public.spec_books AS book
  JOIN public.projects AS project ON project.id = book.project_id
  WHERE book.id = p_spec_book_id;

  IF NOT public.is_design_studio_comember(v_designer_id) THEN
    RAISE EXCEPTION 'spec book not found or not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN public._prepare_spec_book_issue_00403(
    p_spec_book_id, p_audiences, p_issue_type, p_reason,
    p_base_revision_id, p_idempotency_key, p_warning_acknowledgements
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_project_studio_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_active_role text := COALESCE(current_setting('role', true), 'none');
  v_trusted_writer boolean :=
    v_active_role = 'service_role'
    OR (
      session_user = 'postgres'
      AND v_active_role IN ('none', 'postgres')
    );
BEGIN
  IF NOT v_trusted_writer AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'studio_id_not_designer_studio';
  END IF;

  IF NEW.studio_id IS NOT NULL THEN
    IF NOT v_trusted_writer
       AND NOT EXISTS (
         SELECT 1
         FROM public.organization_members AS membership
         WHERE membership.organization_id = NEW.studio_id
           AND membership.user_id = NEW.designer_id
           AND membership.status = 'active'
       )
    THEN
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    END IF;
  ELSIF TG_OP = 'INSERT' AND NEW.designer_id IS NOT NULL THEN
    NEW.studio_id := public._primary_studio_for(NEW.designer_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_invoice_studio_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_active_role text := COALESCE(current_setting('role', true), 'none');
  v_trusted_writer boolean :=
    v_active_role = 'service_role'
    OR (
      session_user = 'postgres'
      AND v_active_role IN ('none', 'postgres')
    );
BEGIN
  IF NOT v_trusted_writer AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'studio_id_not_designer_studio';
  END IF;

  IF NEW.studio_id IS NOT NULL THEN
    IF NOT v_trusted_writer
       AND NOT EXISTS (
         SELECT 1
         FROM public.organization_members AS membership
         WHERE membership.organization_id = NEW.studio_id
           AND membership.user_id = NEW.designer_id
           AND membership.status = 'active'
       )
    THEN
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    NEW.studio_id := COALESCE(
      (
        SELECT project.studio_id
        FROM public.projects AS project
        WHERE project.id = NEW.project_id
      ),
      public._primary_studio_for(NEW.designer_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_project_review(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_project_id uuid := NULLIF(p_request->>'projectId', '')::uuid;
  v_result jsonb;
  v_edition_id uuid;
  v_boards jsonb;
  v_hash text;
  v_previous_publish text :=
    current_setting('app.project_review_publish', true);
BEGIN
  PERFORM public._ffe_require_studio_project(v_project_id);

  IF EXISTS (
    SELECT 1
    FROM public.proposal_boards AS board
    WHERE board.project_id = v_project_id
      AND board.id IN (
        SELECT value::uuid
        FROM jsonb_array_elements_text(
          COALESCE(p_request->'boardIds', '[]'::jsonb)
        )
      )
      AND (
        (
          board.cover_image_url IS NOT NULL
          AND board.cover_review_media_asset_id IS NULL
        )
        OR EXISTS (
          SELECT 1
          FROM public.proposal_board_items AS placement
          WHERE placement.board_id = board.id
            AND placement.project_ffe_item_id IS NULL
            AND placement.type IN ('image', 'room_scan')
            AND placement.image_url IS NOT NULL
            AND placement.review_media_asset_id IS NULL
        )
      )
  ) THEN
    RAISE EXCEPTION
      'visual board references and covers require prepared review derivatives'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  v_result := public._publish_project_review_00448_impl(p_request);
  v_edition_id := (v_result->>'editionId')::uuid;

  INSERT INTO public.project_review_board_media_assets(
    edition_id, board_id, placement_id, media_role, asset_id, derivative_kind,
    storage_bucket, storage_path, checksum_sha256, size_bytes, content_type
  )
  SELECT
    v_edition_id, board.id, NULL, 'cover', asset.id,
    asset.derivative_kind, asset.storage_bucket, asset.storage_path,
    asset.checksum_sha256, asset.size_bytes, asset.content_type
  FROM public.proposal_boards AS board
  JOIN public.project_review_media_assets AS asset
    ON asset.id = board.cover_review_media_asset_id
  WHERE board.project_id = v_project_id
    AND board.id IN (
      SELECT value::uuid
      FROM jsonb_array_elements_text(
        COALESCE(p_request->'boardIds', '[]'::jsonb)
      )
    );

  INSERT INTO public.project_review_board_media_assets(
    edition_id, board_id, placement_id, media_role, asset_id, derivative_kind,
    storage_bucket, storage_path, checksum_sha256, size_bytes, content_type
  )
  SELECT
    v_edition_id, board.id, placement.id, 'reference', asset.id,
    asset.derivative_kind, asset.storage_bucket, asset.storage_path,
    asset.checksum_sha256, asset.size_bytes, asset.content_type
  FROM public.proposal_boards AS board
  JOIN public.proposal_board_items AS placement
    ON placement.board_id = board.id
  JOIN public.project_review_media_assets AS asset
    ON asset.id = placement.review_media_asset_id
  WHERE board.project_id = v_project_id
    AND board.id IN (
      SELECT value::uuid
      FROM jsonb_array_elements_text(
        COALESCE(p_request->'boardIds', '[]'::jsonb)
      )
    );

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', board.id,
    'name', board.name,
    'roomId', board.project_room_id,
    'canvasWidth', board.canvas_width,
    'canvasHeight', board.canvas_height,
    'backgroundColor', board.background_color,
    'sections', board.sections,
    'coverMedia', CASE
      WHEN cover.asset_id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'assetId', cover.asset_id,
        'checksumSha256', cover.checksum_sha256,
        'kind', cover.derivative_kind
      )
    END,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', placement.id,
        'type', placement.type,
        'selectionId', placement.project_ffe_item_id,
        'productId', placement.product_id,
        'captureId', placement.capture_id,
        'paletteId', placement.palette_id,
        'content', placement.content,
        'x', placement.x,
        'y', placement.y,
        'width', placement.width,
        'height', placement.height,
        'zIndex', placement.z_index,
        'rotation', placement.rotation,
        'locked', placement.locked,
        'sectionId', COALESCE(
          placement.data->>'sectionId', placement.data->>'section_id'
        ),
        'renderMedia', CASE
          WHEN frozen.asset_id IS NULL THEN NULL
          ELSE jsonb_build_object(
            'assetId', frozen.asset_id,
            'checksumSha256', frozen.checksum_sha256,
            'kind', frozen.derivative_kind
          )
        END
      )) ORDER BY placement.z_index, placement.id)
      FROM public.proposal_board_items AS placement
      LEFT JOIN public.project_review_board_media_assets AS frozen
        ON frozen.edition_id = v_edition_id
       AND frozen.placement_id = placement.id
      WHERE placement.board_id = board.id
    ), '[]'::jsonb)
  ) ORDER BY board.sort_order, board.id), '[]'::jsonb)
  INTO v_boards
  FROM public.proposal_boards AS board
  LEFT JOIN public.project_review_board_media_assets AS cover
    ON cover.edition_id = v_edition_id
   AND cover.board_id = board.id
   AND cover.media_role = 'cover'
  WHERE board.project_id = v_project_id
    AND board.id IN (
      SELECT value::uuid
      FROM jsonb_array_elements_text(
        COALESCE(p_request->'boardIds', '[]'::jsonb)
      )
    );

  SELECT encode(extensions.digest(jsonb_build_object(
    'editionId', edition.id,
    'rooms', edition.room_snapshot,
    'boards', v_boards,
    'items', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', item.id, 'hash', item.content_hash
      ) ORDER BY item.sort_order, item.id)
      FROM public.project_review_items AS item
      WHERE item.edition_id = edition.id
    )
  )::text, 'sha256'), 'hex')
  INTO v_hash
  FROM public.project_review_editions AS edition
  WHERE edition.id = v_edition_id;

  PERFORM set_config('app.project_review_publish', 'on', true);
  UPDATE public.project_review_editions
  SET board_snapshot = v_boards,
      snapshot_hash = v_hash,
      updated_at = now()
  WHERE id = v_edition_id;
  PERFORM set_config(
    'app.project_review_publish', COALESCE(v_previous_publish, ''), true
  );

  RETURN v_result || jsonb_build_object('snapshotHash', v_hash);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.project_review_publish', COALESCE(v_previous_publish, ''), true
  );
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.issue_invoice_for_actor(
  p_invoice_id uuid,
  p_due_date date,
  p_actor_id uuid
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_line_count integer;
  v_subtotal bigint;
  v_tax integer;
  v_number integer;
  v_due date;
  v_studio_id uuid;
BEGIN
  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND
     OR p_actor_id IS NULL
     OR NOT (
       v_invoice.designer_id = p_actor_id
       OR EXISTS (
         SELECT 1
         FROM public.organization_members AS actor_membership
         JOIN public.organization_members AS owner_membership
           ON owner_membership.organization_id =
                actor_membership.organization_id
         JOIN public.organizations AS organization
           ON organization.id = actor_membership.organization_id
         WHERE actor_membership.user_id = p_actor_id
           AND actor_membership.status = 'active'
           AND actor_membership.role <> 'guest'
           AND owner_membership.user_id = v_invoice.designer_id
           AND owner_membership.status = 'active'
           AND owner_membership.role <> 'guest'
           AND organization.type = 'design_studio'
           AND organization.status = 'active'
       )
     )
  THEN
    RAISE EXCEPTION
      'issue_invoice: invoice % not found or access denied', p_invoice_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.project_time_entries AS time_entry
    WHERE time_entry.invoice_id = p_invoice_id
      AND time_entry.billing_state <> 'authorized'
  ) THEN
    RAISE EXCEPTION
      'issue_invoice: linked time includes entries pending authorization or nonbillable'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.project_time_entries AS time_entry
    JOIN public.project_billing_authorities AS authority
      ON authority.id = time_entry.billing_authority_id
    WHERE time_entry.invoice_id = p_invoice_id
      AND authority.retainer_activation_policy = 'retainer_paid'
      AND NOT EXISTS (
        SELECT 1
        FROM public.invoices AS retainer
        WHERE retainer.id = authority.retainer_invoice_id
          AND retainer.status = 'paid'
          AND retainer.amount_paid_cents >= retainer.total_cents
      )
  ) THEN
    RAISE EXCEPTION
      'issue_invoice: signed retainer invoice must be paid first'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_invoice.status <> 'draft' THEN
    RAISE EXCEPTION
      'issue_invoice: invoice % is %, expected draft',
      p_invoice_id, v_invoice.status;
  END IF;

  SELECT count(*) INTO v_line_count
  FROM public.invoice_line_items
  WHERE invoice_id = p_invoice_id;
  IF v_line_count = 0 THEN
    RAISE EXCEPTION
      'issue_invoice: invoice % has no line items', p_invoice_id;
  END IF;

  PERFORM 1
  FROM public.invoice_line_items AS line
  JOIN public.project_payment_milestones AS milestone
    ON milestone.id = line.milestone_id
  WHERE line.invoice_id = p_invoice_id
    AND (
      milestone.status = 'paid'
      OR EXISTS (
        SELECT 1
        FROM public.invoice_line_items AS other_line
        JOIN public.invoices AS other_invoice
          ON other_invoice.id = other_line.invoice_id
        WHERE other_line.milestone_id = line.milestone_id
          AND other_line.invoice_id <> p_invoice_id
          AND other_invoice.status IN (
            'draft', 'sent', 'partially_paid', 'paid'
          )
      )
    );
  IF FOUND THEN
    RAISE EXCEPTION
      'issue_invoice: a linked milestone is already paid or billed on another invoice';
  END IF;

  v_studio_id := v_invoice.studio_id;
  IF v_studio_id IS NOT NULL THEN
    INSERT INTO public.studio_invoice_counters(studio_id)
    VALUES (v_studio_id)
    ON CONFLICT (studio_id)
      DO UPDATE
      SET next_number = public.studio_invoice_counters.next_number + 1
    RETURNING next_number INTO v_number;
  ELSE
    INSERT INTO public.invoice_counters(designer_id)
    VALUES (v_invoice.designer_id)
    ON CONFLICT (designer_id)
      DO UPDATE
      SET next_number = public.invoice_counters.next_number + 1
    RETURNING next_number INTO v_number;
  END IF;

  SELECT COALESCE(sum(amount_cents), 0) INTO v_subtotal
  FROM public.invoice_line_items
  WHERE invoice_id = p_invoice_id;
  v_tax := round(v_subtotal * v_invoice.tax_rate)::integer;
  v_due := COALESCE(
    p_due_date, current_date + v_invoice.payment_terms_days
  );

  UPDATE public.invoices
  SET status = 'sent',
      invoice_number = 'INV-' || lpad(v_number::text, 4, '0'),
      issue_date = current_date,
      due_date = v_due,
      subtotal_cents = v_subtotal::integer,
      tax_cents = v_tax,
      total_cents = v_subtotal::integer + v_tax,
      sent_at = now(),
      updated_at = now()
  WHERE id = p_invoice_id
  RETURNING * INTO v_invoice;

  UPDATE public.project_payment_milestones AS milestone
  SET status = 'outstanding',
      due_date = v_due,
      updated_at = now()
  FROM public.invoice_line_items AS line
  WHERE line.invoice_id = p_invoice_id
    AND line.milestone_id = milestone.id
    AND milestone.status = 'pending';

  RETURN v_invoice;
END;
$$;

REVOKE ALL PRIVILEGES ON FUNCTION
  app_private.issue_invoice_for_actor(uuid, date, uuid)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.issue_trade_draw_invoice(p_draw_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_draw public.trade_scope_draws%ROWTYPE;
  v_proposal public.proposals%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
  v_terms public.trade_scope_terms%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_invoice_id uuid;
  v_unpaid integer;
  v_previous_draw text :=
    current_setting('app.trade_draw_invoice_id', true);
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION
      'trade scope draw % not found or access denied', p_draw_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_draw
  FROM public.trade_scope_draws
  WHERE id = p_draw_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'trade scope draw % not found or access denied', p_draw_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_proposal
  FROM public.proposals
  WHERE id = v_draw.proposal_id
  FOR UPDATE;
  IF NOT FOUND
     OR v_proposal.document_kind <> 'trade_scope'
     OR NOT public._can_author_proposal(v_proposal.designer_id)
  THEN
    RAISE EXCEPTION
      'trade scope draw % not found or access denied', p_draw_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_document
  FROM public.project_commercial_documents
  WHERE proposal_id = v_draw.proposal_id
  FOR UPDATE;
  IF NOT FOUND
     OR v_proposal.commercial_state IS DISTINCT FROM 'executed'
     OR v_document.executed_at IS NULL
  THEN
    RAISE EXCEPTION
      'a trade scope must be executed before a draw can be billed'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_draw.invoice_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.invoices AS invoice
    WHERE invoice.id = v_draw.invoice_id
      AND invoice.status <> 'void'
  ) THEN
    RAISE EXCEPTION
      'trade scope draw "%" is already billed on a live invoice',
      v_draw.label
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_unpaid
  FROM public.trade_scope_draws AS prior_draw
  LEFT JOIN public.invoices AS prior_invoice
    ON prior_invoice.id = prior_draw.invoice_id
  WHERE prior_draw.proposal_id = v_draw.proposal_id
    AND prior_draw.sort_order < v_draw.sort_order
    AND (
      prior_draw.invoice_id IS NULL
      OR prior_invoice.status IS DISTINCT FROM 'paid'
      OR prior_invoice.amount_paid_cents < prior_invoice.total_cents
    );
  IF v_unpaid > 0 THEN
    RAISE EXCEPTION
      'earlier trade scope draws must be issued and paid before this one'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_terms
  FROM public.trade_scope_terms
  WHERE proposal_id = v_draw.proposal_id
  FOR UPDATE;
  IF v_draw.gates_on_acceptance
     AND v_terms.progress_state IS DISTINCT FROM 'accepted'
  THEN
    RAISE EXCEPTION
      'the acceptance-gated trade scope draw is billable only after the client accepts the work'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.invoices (
    project_id, designer_id, client_id, status, currency,
    subtotal_cents, tax_rate, tax_cents, total_cents, memo
  ) VALUES (
    v_document.project_id, v_proposal.designer_id, v_proposal.client_id,
    'draft', COALESCE(v_terms.currency, 'USD'),
    v_draw.amount_cents, 0, 0, v_draw.amount_cents,
    'Trade scope draw · ' || v_draw.label
  )
  RETURNING * INTO v_invoice;
  v_invoice_id := v_invoice.id;

  IF v_invoice.designer_id IS DISTINCT FROM v_proposal.designer_id
     OR v_invoice.project_id IS DISTINCT FROM v_document.project_id
  THEN
    RAISE EXCEPTION
      'trade scope draw invoice ownership drifted'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  INSERT INTO public.invoice_line_items (
    invoice_id, kind, description, quantity, unit_amount_cents,
    amount_cents, metadata
  ) VALUES (
    v_invoice_id, 'adhoc', v_draw.label, 1,
    v_draw.amount_cents, v_draw.amount_cents,
    jsonb_build_object(
      'tradeScopeId', v_draw.proposal_id,
      'tradeScopeDocumentId', v_document.id,
      'drawId', v_draw.id,
      'kind', 'trade_draw'
    )
  );

  PERFORM app_private.issue_invoice_for_actor(
    v_invoice_id, current_date, v_actor
  );

  PERFORM set_config('app.trade_draw_invoice_id', v_draw.id::text, true);
  UPDATE public.trade_scope_draws
  SET invoice_id = v_invoice_id
  WHERE id = v_draw.id
  RETURNING * INTO v_draw;
  PERFORM set_config(
    'app.trade_draw_invoice_id', COALESCE(v_previous_draw, ''), true
  );

  IF v_draw.id = (
    SELECT candidate.id
    FROM public.trade_scope_draws AS candidate
    WHERE candidate.proposal_id = v_draw.proposal_id
    ORDER BY candidate.sort_order, candidate.id
    LIMIT 1
  ) THEN
    UPDATE public.project_commercial_documents
    SET deposit_invoice_id = v_invoice_id
    WHERE id = v_document.id;
  END IF;

  RETURN jsonb_build_object(
    'drawId', v_draw.id,
    'proposalId', v_draw.proposal_id,
    'documentId', v_document.id,
    'label', v_draw.label,
    'amountCents', v_draw.amount_cents,
    'sortOrder', v_draw.sort_order,
    'gatesOnAcceptance', v_draw.gates_on_acceptance,
    'invoiceId', v_invoice_id,
    'invoiceStatus', (
      SELECT invoice.status
      FROM public.invoices AS invoice
      WHERE invoice.id = v_invoice_id
    )
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.trade_draw_invoice_id', COALESCE(v_previous_draw, ''), true
  );
  RAISE;
END;
$$;

DO $normalize_acl$
DECLARE
  routine_oid oid;
  grantee_name text;
BEGIN
  FOR routine_oid IN
    SELECT to_regprocedure(signature)::oid FROM _00485_profile
    UNION ALL
    SELECT to_regprocedure(
      'app_private.issue_invoice_for_actor(uuid,date,uuid)'
    )::oid
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
$normalize_acl$;

REVOKE ALL PRIVILEGES ON FUNCTION
  public.accept_trade_scope_with_trusted_ip(uuid, text, uuid, text),
  public.begin_proposal_send_provider_attempt(uuid, uuid),
  public.complete_proposal_send_dispatch(uuid, uuid, text, text, text),
  public.consume_board_unfurl_quota(uuid),
  public.execute_furnishings_authorization_with_trusted_ip(
    uuid, text, uuid, text
  ),
  public.execute_trade_scope_with_trusted_ip(uuid, text, uuid, text),
  public.issue_trade_draw_invoice(uuid),
  public.notify_decision_overdue(uuid),
  public.notify_decision_required(uuid),
  public.notify_decision_resolved(uuid),
  public.prepare_spec_book_issue(
    uuid, text[], text, text, uuid, text, jsonb
  ),
  public.publish_project_review(jsonb),
  public.release_proposal_send_dispatch(uuid, uuid, text),
  public.set_invoice_studio_id(),
  public.set_project_studio_id(),
  public.sign_design_services_agreement_with_trusted_ip(
    uuid, text, uuid, text
  ),
  public.suppress_proposal_send_dispatch(uuid, uuid, text)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL PRIVILEGES ON FUNCTION
  app_private.issue_invoice_for_actor(uuid, date, uuid)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.accept_trade_scope_with_trusted_ip(uuid, text, uuid, text),
  public.begin_proposal_send_provider_attempt(uuid, uuid),
  public.complete_proposal_send_dispatch(uuid, uuid, text, text, text),
  public.consume_board_unfurl_quota(uuid),
  public.execute_furnishings_authorization_with_trusted_ip(
    uuid, text, uuid, text
  ),
  public.execute_trade_scope_with_trusted_ip(uuid, text, uuid, text),
  public.notify_decision_overdue(uuid),
  public.notify_decision_required(uuid),
  public.notify_decision_resolved(uuid),
  public.release_proposal_send_dispatch(uuid, uuid, text),
  public.sign_design_services_agreement_with_trusted_ip(
    uuid, text, uuid, text
  ),
  public.suppress_proposal_send_dispatch(uuid, uuid, text)
TO service_role;

GRANT EXECUTE ON FUNCTION
  public.issue_trade_draw_invoice(uuid),
  public.prepare_spec_book_issue(
    uuid, text[], text, text, uuid, text, jsonb
  ),
  public.publish_project_review(jsonb)
TO authenticated;

DO $postconditions$
BEGIN
  IF (SELECT count(*) FROM _00485_profile) <> 17 THEN
    RAISE EXCEPTION '00485 routine manifest must contain exactly 17 rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _00485_profile AS expected
    LEFT JOIN pg_proc AS routine
      ON routine.oid = to_regprocedure(expected.signature)
    LEFT JOIN pg_roles AS owner ON owner.oid = routine.proowner
    LEFT JOIN pg_language AS language ON language.oid = routine.prolang
    WHERE routine.oid IS NULL
      OR owner.rolname IS DISTINCT FROM 'postgres'
      OR language.lanname IS DISTINCT FROM expected.language_name
      OR routine.prokind <> 'f'
      OR NOT routine.prosecdef
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
    RAISE EXCEPTION '00485 final routine semantic/body profile is wrong';
  END IF;

  IF EXISTS (
    WITH expected_acl AS (
      SELECT
        profile.signature,
        role_name AS grantee,
        'postgres'::text AS grantor,
        'EXECUTE'::text AS privilege_type,
        false AS is_grantable
      FROM _00485_profile AS profile
      CROSS JOIN LATERAL unnest(profile.final_roles) AS role_name
    ),
    actual_acl AS (
      SELECT
        profile.signature,
        CASE acl.grantee
          WHEN 0 THEN 'PUBLIC'
          ELSE grantee.rolname::text
        END AS grantee,
        grantor.rolname::text AS grantor,
        acl.privilege_type,
        acl.is_grantable
      FROM _00485_profile AS profile
      JOIN pg_proc AS routine
        ON routine.oid = to_regprocedure(profile.signature)
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
  ) THEN
    RAISE EXCEPTION '00485 final direct ACL contract is wrong';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _00485_profile AS profile
    JOIN pg_proc AS routine
      ON routine.oid = to_regprocedure(profile.signature)
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
        END <> ALL(profile.final_roles)
        OR grantor.rolname IS DISTINCT FROM 'postgres'
        OR acl.is_grantable
      )
  ) THEN
    RAISE EXCEPTION '00485 unreviewed final direct EXECUTE row exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc AS routine
    CROSS JOIN LATERAL aclexplode(
      COALESCE(routine.proacl, acldefault('f', routine.proowner))
    ) AS acl
    WHERE routine.oid = to_regprocedure(
      'app_private.issue_invoice_for_actor(uuid,date,uuid)'
    )
      AND acl.grantee <> routine.proowner
  ) THEN
    RAISE EXCEPTION '00485 private invoice core has a nonowner ACL row';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc AS routine
    JOIN pg_roles AS owner ON owner.oid = routine.proowner
    JOIN pg_language AS language ON language.oid = routine.prolang
    WHERE routine.oid = to_regprocedure(
      'app_private.issue_invoice_for_actor(uuid,date,uuid)'
    )
      AND (
        owner.rolname IS DISTINCT FROM 'postgres'
        OR language.lanname IS DISTINCT FROM 'plpgsql'
        OR routine.prokind <> 'f'
        OR NOT routine.prosecdef
        OR routine.provolatile <> 'v'
        OR routine.proisstrict
        OR routine.proleakproof
        OR routine.proparallel <> 'u'
        OR routine.proconfig IS DISTINCT FROM
             ARRAY['search_path=pg_catalog, public, pg_temp']::text[]
        OR pg_get_function_arguments(routine.oid) IS DISTINCT FROM
             'p_invoice_id uuid, p_due_date date, p_actor_id uuid'
        OR pg_get_function_result(routine.oid) IS DISTINCT FROM 'invoices'
        OR encode(
             extensions.digest(
               convert_to(routine.prosrc, 'UTF8'), 'sha256'
             ),
             'hex'
           ) IS DISTINCT FROM
             '1bb33e50769432c5ecd3f08328da152008e0d328a47167c4a059cafc31c3d3e4'
      )
  ) OR to_regprocedure(
    'app_private.issue_invoice_for_actor(uuid,date,uuid)'
  ) IS NULL THEN
    RAISE EXCEPTION '00485 private invoice core profile is wrong';
  END IF;

  IF EXISTS (
    WITH expected AS (
      SELECT
        fixture.relation_name,
        fixture.trigger_name,
        fixture.function_signature,
        'O'::"char" AS enabled,
        false AS is_internal,
        23::smallint AS trigger_type,
        0::smallint AS argument_count,
        ''::text AS arguments_hex,
        attribute.attnum::text AS trigger_columns,
        NULL::text AS when_expression,
        0::oid AS parent_trigger,
        fixture.definition
      FROM (VALUES
        (
          'public.projects',
          'set_project_studio_id',
          'public.set_project_studio_id()',
          'createtriggerset_project_studio_idbeforeinsertorupdateofstudio_idonprojectsforeachrowexecutefunctionset_project_studio_id()'
        ),
        (
          'public.invoices',
          'set_invoice_studio_id',
          'public.set_invoice_studio_id()',
          'createtriggerset_invoice_studio_idbeforeinsertorupdateofstudio_idoninvoicesforeachrowexecutefunctionset_invoice_studio_id()'
        )
      ) AS fixture(
        relation_name, trigger_name, function_signature, definition
      )
      JOIN pg_attribute AS attribute
        ON attribute.attrelid = fixture.relation_name::regclass
       AND attribute.attname = 'studio_id'
       AND attribute.attnum > 0
       AND NOT attribute.attisdropped
    ),
    actual AS (
      SELECT
        relation_namespace.nspname || '.' || relation.relname AS relation_name,
        trigger_row.tgname AS trigger_name,
        function_namespace.nspname || '.' || routine.proname || '(' ||
          pg_get_function_identity_arguments(routine.oid) || ')' AS function_signature,
        trigger_row.tgenabled AS enabled,
        trigger_row.tgisinternal AS is_internal,
        trigger_row.tgtype AS trigger_type,
        trigger_row.tgnargs AS argument_count,
        encode(trigger_row.tgargs, 'hex') AS arguments_hex,
        trigger_row.tgattr::text AS trigger_columns,
        pg_get_expr(
          trigger_row.tgqual, trigger_row.tgrelid, true
        ) AS when_expression,
        trigger_row.tgparentid AS parent_trigger,
        replace(
          regexp_replace(
            lower(pg_get_triggerdef(trigger_row.oid, false)), '\s+', '', 'g'
          ),
          'public.', ''
        ) AS definition
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
  ) THEN
    RAISE EXCEPTION '00485 retained trigger caller contract is wrong';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _00485_profile AS expected
    JOIN pg_proc AS routine
      ON routine.oid = to_regprocedure(expected.signature)
    WHERE expected.final_roles = ARRAY['service_role']::text[]
      AND (
        position('current_setting(''role'', true)' IN routine.prosrc) = 0
        OR position('auth.role()' IN routine.prosrc) > 0
        OR position('auth.jwt()' IN routine.prosrc) > 0
      )
  ) THEN
    RAISE EXCEPTION '00485 service boundary authority is claim-derived';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc AS routine
    WHERE routine.oid IN (
      to_regprocedure(
        'public.accept_trade_scope_with_trusted_ip(uuid,text,uuid,text)'
      ),
      to_regprocedure(
        'public.execute_furnishings_authorization_with_trusted_ip(uuid,text,uuid,text)'
      ),
      to_regprocedure(
        'public.execute_trade_scope_with_trusted_ip(uuid,text,uuid,text)'
      ),
      to_regprocedure(
        'public.sign_design_services_agreement_with_trusted_ip(uuid,text,uuid,text)'
      ),
      to_regprocedure('public.issue_trade_draw_invoice(uuid)')
    )
      AND position('request.jwt.claims' IN routine.prosrc) > 0
  ) THEN
    RAISE EXCEPTION '00485 hardened actor boundary rewrites JWT claims';
  END IF;

  IF (
    SELECT position(
      'PERFORM public._ffe_require_studio_project(v_project_id)'
      IN routine.prosrc
    ) < position('FROM public.proposal_boards' IN routine.prosrc)
    FROM pg_proc AS routine
    WHERE routine.oid = to_regprocedure(
      'public.publish_project_review(jsonb)'
    )
  ) IS NOT TRUE THEN
    RAISE EXCEPTION '00485 review publication reads before authorization';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc AS routine
    WHERE routine.oid IN (
      to_regprocedure('public.set_invoice_studio_id()'),
      to_regprocedure('public.set_project_studio_id()')
    )
      AND (
        position('current_setting(''role'', true)' IN routine.prosrc) = 0
        OR position('session_user = ''postgres''' IN routine.prosrc) = 0
        OR position('auth.uid() IS NULL' IN routine.prosrc) = 0
        OR position('auth.jwt()' IN routine.prosrc) > 0
      )
  ) THEN
    RAISE EXCEPTION '00485 trigger authority contract is wrong';
  END IF;
END
$postconditions$;

COMMIT;
