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
  final_roles text[] NOT NULL,
  original_security_definer boolean NOT NULL DEFAULT true,
  final_security_definer boolean NOT NULL DEFAULT true
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
    '1ece28644a5acc17ac7f474e0cc1f4ad149d92e0024859acca8396abf794a21e', ARRAY['authenticated']::text[],
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
    '1b63dbc14bcdcc8a7a5b19e7375bf80d117159429b87d2cc5048a2ace9242b4b', ARRAY['authenticated', 'service_role']::text[],
    ARRAY['authenticated']::text[]
  ),
  (
    'public.publish_project_review(jsonb)',
    '00449_ffe_final_direct_probe_fixes.sql', 'plpgsql',
    'p_request jsonb', 'jsonb', 'v',
    ARRAY['search_path=public, extensions, pg_temp']::text[],
    ARRAY['search_path=pg_catalog, public, extensions, pg_temp']::text[],
    'ce4e7ba2e0911edd394cab4963746e0e8e6b2e24951fa19cf640781fc8c5dfee',
    'd5770d33ce7d1572603f020ff63c05c7d8b7f1f27f573cc97d816becd2dfe22b', ARRAY['authenticated']::text[],
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
    'a091eb39e882302c77b85e378234753b6cc3125578cb2e3318bd249bf7cf57b1', ARRAY['authenticated', 'service_role']::text[],
    ARRAY[]::text[]
  ),
  (
    'public.set_project_studio_id()',
    '00317_projects_studio_id_maintenance.sql', 'plpgsql', '',
    'trigger', 'v', ARRAY['search_path=public']::text[],
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '04b921692fd72c03a2137e413c76d997435bafb3c29d2506e8b3fa14d8f6ce20',
    'fe66293d1fc39149dba2abc85d6ecd7b948f786e53f7e4e5746a65b69e82028d', ARRAY['authenticated', 'service_role']::text[],
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

UPDATE _00485_profile
SET final_security_definer = false
WHERE signature IN (
  'public.set_invoice_studio_id()',
  'public.set_project_studio_id()'
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
          routine.prosecdef IS NOT DISTINCT FROM
            expected.original_security_definer
          AND
          routine.proconfig IS NOT DISTINCT FROM expected.original_config
          AND body.body_sha256 = expected.original_body_sha256
        )
        OR (
          routine.prosecdef IS NOT DISTINCT FROM
            expected.final_security_definer
          AND
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
        routine.prosecdef IS NOT DISTINCT FROM
            expected.original_security_definer
          AND routine.proconfig IS NOT DISTINCT FROM expected.original_config
          AND encode(
                extensions.digest(
                  convert_to(routine.prosrc, 'UTF8'), 'sha256'
                ),
                'hex'
              ) = expected.original_body_sha256 AS is_source,
        routine.prosecdef IS NOT DISTINCT FROM expected.final_security_definer
          AND routine.proconfig IS NOT DISTINCT FROM expected.final_config
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

CREATE TEMP TABLE _00485_dependency_profile (
  signature text PRIMARY KEY,
  language_name text NOT NULL,
  arguments text NOT NULL,
  result_type text NOT NULL,
  volatility "char" NOT NULL,
  original_config text[] NOT NULL,
  final_config text[] NOT NULL,
  original_body_sha256 text NOT NULL,
  final_body_sha256 text NOT NULL,
  original_roles text[] NOT NULL,
  final_roles text[] NOT NULL,
  original_security_definer boolean NOT NULL DEFAULT true,
  final_security_definer boolean NOT NULL DEFAULT true
) ON COMMIT DROP;

INSERT INTO _00485_dependency_profile (
  signature, language_name, arguments, result_type, volatility,
  original_config, final_config, original_body_sha256, final_body_sha256,
  original_roles, final_roles
)
VALUES
  (
    'public._execute_furnishings_authorization_authorized(uuid,text,uuid,text)',
    'plpgsql',
    'p_proposal_id uuid, p_signed_name text, p_client_id uuid, p_trusted_signed_ip text DEFAULT NULL::text',
    'jsonb', 'v', ARRAY['search_path=public, pg_temp']::text[],
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '29b7bfc55982372d2bb3b00739d2d243683af11e89d99525cabe06c699fda984',
    'd1ea9e357d5f1c685677365601abaff4c96cf83f6006ab8c3479f1d745487293',
    ARRAY[]::text[], ARRAY[]::text[]
  ),
  (
    'public._execute_trade_scope_authorized(uuid,text,uuid,text)',
    'plpgsql',
    'p_proposal_id uuid, p_signed_name text, p_client_id uuid, p_trusted_signed_ip text DEFAULT NULL::text',
    'jsonb', 'v', ARRAY['search_path=public, pg_temp']::text[],
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '152b51f7bcd3b7a17a6f88967da0fef1648d95f46eea58334ed2ce2a2f917f5c',
    '02f9aab1ace96f0e439dee937ecd50e5b0b58a8366c732caafe66d70e1b25dd8',
    ARRAY[]::text[], ARRAY[]::text[]
  ),
  (
    'public._countersign_design_services_agreement_impl(uuid,text,jsonb)',
    'plpgsql',
    'p_proposal_id uuid, p_signer_name text, p_disclosed_impact jsonb DEFAULT NULL::jsonb',
    'jsonb', 'v', ARRAY['search_path=public, pg_temp']::text[],
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '6df1c093ae444e862cedefe230136e00771adbe426a14a96752f125307382111',
    '1d0db8c0c2e123121a24d4c2ade04d507e42399a708b2e598c199559cd46a89e',
    ARRAY[]::text[], ARRAY[]::text[]
  ),
  (
    'public._execute_furnishings_authorization_on_paper_authorized(uuid,text,date,uuid,uuid,jsonb)',
    'plpgsql',
    'p_proposal_id uuid, p_signed_name text, p_paper_signed_on date, p_recorded_by uuid, p_scan_document_id uuid DEFAULT NULL::uuid, p_disclosed_impact jsonb DEFAULT NULL::jsonb',
    'jsonb', 'v', ARRAY['search_path=public, pg_temp']::text[],
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '25695d6936c992df270877af7e6b464cff5c7805318c58c4a63f334761c25aa2',
    '81d54e2f271e78c1c901c6cec0b1d763cffecb87ce7d5c20990dddd789b3e432',
    ARRAY[]::text[], ARRAY[]::text[]
  ),
  (
    'public._execute_trade_scope_on_paper_authorized(uuid,text,date,uuid,uuid)',
    'plpgsql',
    'p_proposal_id uuid, p_signed_name text, p_paper_signed_on date, p_recorded_by uuid, p_scan_document_id uuid DEFAULT NULL::uuid',
    'jsonb', 'v', ARRAY['search_path=public, pg_temp']::text[],
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '41a78dd3007d8cc529c8b439750a6d94191787ba89e06a254eec0df49f4cf261',
    '99c9545b3b59638bab7a034d62e743d32eb36bfe31b8a18f070f325fc69d0626',
    ARRAY[]::text[], ARRAY[]::text[]
  ),
  (
    'public._prepare_spec_book_issue_00403(uuid,text[],text,text,uuid,text,jsonb)',
    'plpgsql',
    'p_spec_book_id uuid, p_audiences text[], p_issue_type text, p_reason text, p_base_revision_id uuid, p_idempotency_key text, p_warning_acknowledgements jsonb DEFAULT ''[]''::jsonb',
    'jsonb', 'v',
    ARRAY['search_path=public, extensions, pg_temp']::text[],
    ARRAY['search_path=pg_catalog, public, extensions, pg_temp']::text[],
    '8a06f30204b11f3f3e2551b74944988031d6b776edde0423fcb176f6d963586b',
    '8a06f30204b11f3f3e2551b74944988031d6b776edde0423fcb176f6d963586b',
    ARRAY['service_role']::text[], ARRAY[]::text[]
  ),
  (
    'public._publish_project_review_00448_impl(jsonb)',
    'plpgsql', 'p_request jsonb', 'jsonb', 'v',
    ARRAY['search_path=public, extensions, pg_temp']::text[],
    ARRAY['search_path=pg_catalog, public, extensions, pg_temp']::text[],
    '0c3b935559ff383878d7c36f4057378663f52c5825088335c7e62f6c5412295e',
    '0c3b935559ff383878d7c36f4057378663f52c5825088335c7e62f6c5412295e',
    ARRAY[]::text[], ARRAY[]::text[]
  ),
  (
    'public.guard_commercial_signature_insert()',
    'plpgsql', '', 'trigger', 'v',
    ARRAY['search_path=public, pg_temp']::text[],
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '7154e333a59d4f2215a3bc3537bc2bfa066daab950eb5c1ddf958562f369f345',
    'cebd8924bd0de977fc47b137c77df7945906eb4955acf70fdb41f386eb04f255',
    ARRAY[]::text[], ARRAY[]::text[]
  );

UPDATE _00485_dependency_profile
SET original_security_definer = false,
    final_security_definer = false
WHERE signature = 'public.guard_commercial_signature_insert()';

CREATE OR REPLACE FUNCTION pg_temp._00485_references_routine(
  p_source text,
  p_schema text,
  p_name text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $caller_scan$
DECLARE
  v_without_comments text;
  v_direct_source text;
  v_scan_source text;
  v_match text[];
  v_literal_match text[];
  v_literal_stream text := '';
  v_schema_token text;
  v_name_token text;
  v_has_execute boolean;
BEGIN
  v_without_comments := regexp_replace(
    regexp_replace(
      COALESCE(p_source, ''),
      $block_comment$/\*([^*]|\*+[^*/])*\*+/$block_comment$,
      ' ',
      'g'
    ),
    $line_comment$--[^\r\n]*$line_comment$,
    ' ',
    'g'
  );
  v_direct_source := regexp_replace(
    v_without_comments,
    $quoted_text$'([^']|'')*'$quoted_text$,
    ' ',
    'g'
  );
  v_has_execute := v_direct_source
    ~* '(^|[^[:alnum:]_$])execute([^[:alnum:]_$]|$)';

  IF v_has_execute THEN
    FOR v_literal_match IN
      SELECT matches.match_row
      FROM regexp_matches(
        v_without_comments,
        $quoted_literal$'((?:[^']|'')*)'$quoted_literal$,
        'g'
      ) AS matches(match_row)
    LOOP
      v_literal_stream := v_literal_stream
        || replace(v_literal_match[1], '''''', '''');
    END LOOP;

    -- Dynamic formatting and concatenation may not leave a callable token.
    -- Treat any reviewed target reconstructed from EXECUTE literals as a call.
    IF position(lower(p_name) IN lower(v_literal_stream)) > 0 THEN
      RETURN true;
    END IF;
  END IF;

  FOREACH v_scan_source IN ARRAY CASE
    WHEN v_has_execute
      THEN ARRAY[v_direct_source, v_without_comments]
    ELSE ARRAY[v_direct_source]
  END
  LOOP
    FOR v_match IN
      SELECT matches.match_row
      FROM regexp_matches(
        v_scan_source,
        $routine_token$(?:
          ("(?:[^"]|"")*"|[[:alpha:]_][[:alnum:]_$]*)
          [[:space:]]*\.[[:space:]]*
        )?
        ("(?:[^"]|"")*"|[[:alpha:]_][[:alnum:]_$]*)
        [[:space:]]*\($routine_token$,
        'gx'
      ) AS matches(match_row)
    LOOP
      v_schema_token := v_match[1];
      v_name_token := v_match[2];

      IF v_name_token IS NULL THEN
        CONTINUE;
      END IF;

      IF left(v_name_token, 1) = '"' THEN
        v_name_token := replace(
          substr(v_name_token, 2, length(v_name_token) - 2),
          '""',
          '"'
        );
        IF v_name_token IS DISTINCT FROM p_name THEN
          CONTINUE;
        END IF;
      ELSIF lower(v_name_token) IS DISTINCT FROM lower(p_name) THEN
        CONTINUE;
      END IF;

      IF v_schema_token IS NULL THEN
        RETURN true;
      ELSIF left(v_schema_token, 1) = '"' THEN
        v_schema_token := replace(
          substr(v_schema_token, 2, length(v_schema_token) - 2),
          '""',
          '"'
        );
        IF v_schema_token IS NOT DISTINCT FROM p_schema THEN
          RETURN true;
        END IF;
      ELSIF lower(v_schema_token) IS NOT DISTINCT FROM lower(p_schema) THEN
        RETURN true;
      END IF;
    END LOOP;
  END LOOP;

  RETURN false;
END;
$caller_scan$;

DO $invoice_caller_scan_contract$
BEGIN
  IF NOT pg_temp._00485_references_routine(
    $source$SELECT APP_PRIVATE.ISSUE_INVOICE_FOR_ACTOR($1)$source$,
    'app_private', 'issue_invoice_for_actor'
  ) OR NOT pg_temp._00485_references_routine(
    $source$SELECT "app_private"."issue_invoice_for_actor"($1)$source$,
    'app_private', 'issue_invoice_for_actor'
  ) OR NOT pg_temp._00485_references_routine(
    $source$BEGIN EXECUTE format('SELECT public.issue_invoice_for_actor(%L)', value); END$source$,
    'app_private', 'issue_invoice_for_actor'
  ) OR NOT pg_temp._00485_references_routine(
    $source$BEGIN EXECUTE format('SELECT %I.%I($1)', 'app_private', 'issue_invoice_for_actor'); END$source$,
    'app_private', 'issue_invoice_for_actor'
  ) OR NOT pg_temp._00485_references_routine(
    $source$BEGIN EXECUTE format('%s%s', 'issue_invoice_', 'for_actor'); END$source$,
    'app_private', 'issue_invoice_for_actor'
  ) OR NOT pg_temp._00485_references_routine(
    $source$BEGIN EXECUTE 'SELECT app_private.issue_invoice_' || 'for_actor($1)'; END$source$,
    'app_private', 'issue_invoice_for_actor'
  ) OR pg_temp._00485_references_routine(
    $source$SELECT "app_private"."ISSUE_INVOICE_FOR_ACTOR"($1)$source$,
    'app_private', 'issue_invoice_for_actor'
  ) OR pg_temp._00485_references_routine(
    $source$SELECT public.issue_invoice_for_actor($1)$source$,
    'app_private', 'issue_invoice_for_actor'
  ) OR pg_temp._00485_references_routine(
    $source$PERFORM 'public.issue_invoice_for_actor(';$source$,
    'app_private', 'issue_invoice_for_actor'
  ) OR pg_temp._00485_references_routine(
    $source$-- public.issue_invoice_for_actor(
      PERFORM 1;$source$,
    'app_private', 'issue_invoice_for_actor'
  ) THEN
    RAISE EXCEPTION '00485 routine-reference scanner contract failed';
  END IF;
END
$invoice_caller_scan_contract$;

DO $dependency_preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM _00485_dependency_profile AS expected
    LEFT JOIN pg_proc AS routine
      ON routine.oid = to_regprocedure(expected.signature)
    LEFT JOIN pg_roles AS owner ON owner.oid = routine.proowner
    LEFT JOIN pg_language AS language ON language.oid = routine.prolang
    WHERE routine.oid IS NULL
      OR owner.rolname IS DISTINCT FROM 'postgres'
      OR language.lanname IS DISTINCT FROM expected.language_name
      OR routine.prokind <> 'f'
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
          routine.prosecdef IS NOT DISTINCT FROM
            expected.original_security_definer
          AND
          routine.proconfig IS NOT DISTINCT FROM expected.original_config
          AND encode(
                extensions.digest(
                  convert_to(routine.prosrc, 'UTF8'), 'sha256'
                ), 'hex'
              ) = expected.original_body_sha256
        )
        OR (
          routine.prosecdef IS NOT DISTINCT FROM
            expected.final_security_definer
          AND
          routine.proconfig IS NOT DISTINCT FROM expected.final_config
          AND encode(
                extensions.digest(
                  convert_to(routine.prosrc, 'UTF8'), 'sha256'
                ), 'hex'
              ) = expected.final_body_sha256
        )
      )
  ) THEN
    RAISE EXCEPTION '00485 dependency source/final profile drifted';
  END IF;

  IF EXISTS (
    WITH profile_state AS (
      SELECT
        expected.signature,
        routine.prosecdef IS NOT DISTINCT FROM
            expected.original_security_definer
          AND routine.proconfig IS NOT DISTINCT FROM expected.original_config
          AND encode(
                extensions.digest(
                  convert_to(routine.prosrc, 'UTF8'), 'sha256'
                ), 'hex'
              ) = expected.original_body_sha256 AS is_source,
        routine.prosecdef IS NOT DISTINCT FROM expected.final_security_definer
          AND routine.proconfig IS NOT DISTINCT FROM expected.final_config
          AND encode(
                extensions.digest(
                  convert_to(routine.prosrc, 'UTF8'), 'sha256'
                ), 'hex'
              ) = expected.final_body_sha256 AS is_final
      FROM _00485_dependency_profile AS expected
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
      FROM _00485_dependency_profile AS expected
      JOIN pg_proc AS routine
        ON routine.oid = to_regprocedure(expected.signature)
      CROSS JOIN LATERAL aclexplode(
        COALESCE(routine.proacl, acldefault('f', routine.proowner))
      ) AS acl
      LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
      LEFT JOIN pg_roles AS grantor ON grantor.oid = acl.grantor
      WHERE acl.grantee <> routine.proowner
    ),
    source_acl AS (
      SELECT
        expected.signature,
        role_name AS grantee,
        'postgres'::text AS grantor,
        'EXECUTE'::text AS privilege_type,
        false AS is_grantable
      FROM _00485_dependency_profile AS expected
      CROSS JOIN LATERAL unnest(expected.original_roles) AS role_name
    ),
    final_acl AS (
      SELECT
        expected.signature,
        role_name AS grantee,
        'postgres'::text AS grantor,
        'EXECUTE'::text AS privilege_type,
        false AS is_grantable
      FROM _00485_dependency_profile AS expected
      CROSS JOIN LATERAL unnest(expected.final_roles) AS role_name
    ),
    acl_state AS (
      SELECT
        expected.signature,
        NOT EXISTS (
          (SELECT grantee, grantor, privilege_type, is_grantable
           FROM actual_acl WHERE signature = expected.signature
           EXCEPT ALL
           SELECT grantee, grantor, privilege_type, is_grantable
           FROM source_acl WHERE signature = expected.signature)
          UNION ALL
          (SELECT grantee, grantor, privilege_type, is_grantable
           FROM source_acl WHERE signature = expected.signature
           EXCEPT ALL
           SELECT grantee, grantor, privilege_type, is_grantable
           FROM actual_acl WHERE signature = expected.signature)
        ) AS is_source,
        NOT EXISTS (
          (SELECT grantee, grantor, privilege_type, is_grantable
           FROM actual_acl WHERE signature = expected.signature
           EXCEPT ALL
           SELECT grantee, grantor, privilege_type, is_grantable
           FROM final_acl WHERE signature = expected.signature)
          UNION ALL
          (SELECT grantee, grantor, privilege_type, is_grantable
           FROM final_acl WHERE signature = expected.signature
           EXCEPT ALL
           SELECT grantee, grantor, privilege_type, is_grantable
           FROM actual_acl WHERE signature = expected.signature)
        ) AS is_final
      FROM _00485_dependency_profile AS expected
    )
    SELECT 1
    FROM profile_state
    JOIN acl_state USING (signature)
    WHERE NOT (
      (profile_state.is_source AND acl_state.is_source)
      OR (profile_state.is_final AND acl_state.is_final)
    )
  ) THEN
    RAISE EXCEPTION '00485 dependency profile and ACL states are incoherent';
  END IF;
END
$dependency_preflight$;

DO $private_core_preflight$
DECLARE
  core_oid oid := to_regprocedure(
    'app_private.issue_invoice_for_actor(uuid,date,uuid)'
  );
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc AS routine
    JOIN pg_namespace AS namespace ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'app_private'
      AND routine.proname = 'issue_invoice_for_actor'
      AND routine.oid IS DISTINCT FROM core_oid
  ) THEN
    RAISE EXCEPTION '00485 unexpected private invoice core overload exists';
  END IF;

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
        OR routine.proretset
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
           ) <> ALL(ARRAY[
             '56b8797bfcf3244bb9a1693be3d7ad1b9f6e886edd7307c8c54b9ce7a7f8481e',
             'bdf903ba6445367c7f18551859a0a14aeaa2f0dfbec95d4304110e39b537c727'
           ]::text[])
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

DO $atomic_draft_preflight$
DECLARE
  routine_oid oid := to_regprocedure(
    'public.create_draft_invoice(uuid,uuid,uuid,uuid,numeric,integer,text,text,jsonb)'
  );
BEGIN
  IF routine_oid IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM pg_proc AS routine
      JOIN pg_namespace AS namespace ON namespace.oid = routine.pronamespace
      WHERE namespace.nspname = 'public'
        AND routine.proname = 'create_draft_invoice'
    ) THEN
      RAISE EXCEPTION '00485 unexpected create_draft_invoice overload exists';
    END IF;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc AS routine
    JOIN pg_roles AS owner ON owner.oid = routine.proowner
    JOIN pg_language AS language ON language.oid = routine.prolang
    WHERE routine.oid = routine_oid
      AND (
        owner.rolname IS DISTINCT FROM 'postgres'
        OR language.lanname IS DISTINCT FROM 'plpgsql'
        OR routine.prokind <> 'f'
        OR routine.proretset
        OR NOT routine.prosecdef
        OR routine.provolatile <> 'v'
        OR routine.proisstrict
        OR routine.proleakproof
        OR routine.proparallel <> 'u'
        OR routine.proconfig IS DISTINCT FROM
             ARRAY['search_path=pg_catalog, public, pg_temp']::text[]
        OR pg_get_function_arguments(routine.oid) IS DISTINCT FROM
             'p_project_id uuid, p_expected_designer_id uuid, p_expected_client_id uuid, p_expected_studio_id uuid, p_tax_rate numeric DEFAULT 0, p_payment_terms_days integer DEFAULT 15, p_memo text DEFAULT NULL::text, p_internal_notes text DEFAULT NULL::text, p_lines jsonb DEFAULT ''[]''::jsonb'
        OR pg_get_function_result(routine.oid) IS DISTINCT FROM 'invoices'
        OR encode(
             extensions.digest(
               convert_to(routine.prosrc, 'UTF8'), 'sha256'
             ), 'hex'
           ) IS DISTINCT FROM '600c435c99acbb850b3b6a0f7f190aa62aa330e8281659b803abd38ef6c347c6'
        OR octet_length(convert_to(routine.prosrc, 'UTF8'))
             IS DISTINCT FROM 11492
      )
  ) THEN
    RAISE EXCEPTION '00485 existing atomic draft profile drifted';
  END IF;

  IF 1 <> (
    SELECT count(*)
    FROM pg_proc AS routine
    JOIN pg_namespace AS namespace ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'public'
      AND routine.proname = 'create_draft_invoice'
  ) OR EXISTS (
    WITH actual AS (
      SELECT
        CASE acl.grantee
          WHEN 0 THEN 'PUBLIC'
          ELSE grantee.rolname::text
        END AS grantee,
        grantor.rolname::text AS grantor,
        acl.privilege_type,
        acl.is_grantable
      FROM pg_proc AS routine
      CROSS JOIN LATERAL aclexplode(
        COALESCE(routine.proacl, acldefault('f', routine.proowner))
      ) AS acl
      LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
      LEFT JOIN pg_roles AS grantor ON grantor.oid = acl.grantor
      WHERE routine.oid = routine_oid
        AND acl.grantee <> routine.proowner
    ),
    expected AS (
      SELECT 'authenticated'::text AS grantee, 'postgres'::text AS grantor,
             'EXECUTE'::text AS privilege_type, false AS is_grantable
    )
    SELECT 1
    FROM (
      (SELECT * FROM actual EXCEPT ALL SELECT * FROM expected)
      UNION ALL
      (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)
    ) AS drift
  ) THEN
    RAISE EXCEPTION '00485 existing atomic draft ACL/overload drifted';
  END IF;
END
$atomic_draft_preflight$;

DO $trigger_binding_preflight$
DECLARE
  source_ok boolean;
  final_ok boolean;
BEGIN
  WITH actual AS (
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
      to_regprocedure('public.set_invoice_studio_id()')::oid,
      to_regprocedure('public.guard_commercial_signature_insert()')::oid
    )
  ),
  source_expected AS (
    SELECT *
    FROM (VALUES
      (
        'public.projects'::text, 'set_project_studio_id'::text,
        'public.set_project_studio_id()'::text, 'O'::"char", false,
        23::smallint, 0::smallint, ''::text,
        (SELECT attnum::text FROM pg_attribute
         WHERE attrelid = 'public.projects'::regclass
           AND attname = 'studio_id'),
        NULL::text, 0::oid,
        'createtriggerset_project_studio_idbeforeinsertorupdateofstudio_idonprojectsforeachrowexecutefunctionset_project_studio_id()'::text
      ),
      (
        'public.invoices'::text, 'set_invoice_studio_id'::text,
        'public.set_invoice_studio_id()'::text, 'O'::"char", false,
        23::smallint, 0::smallint, ''::text,
        (SELECT attnum::text FROM pg_attribute
         WHERE attrelid = 'public.invoices'::regclass
           AND attname = 'studio_id'),
        NULL::text, 0::oid,
        'createtriggerset_invoice_studio_idbeforeinsertorupdateofstudio_idoninvoicesforeachrowexecutefunctionset_invoice_studio_id()'::text
      ),
      (
        'public.commercial_document_signatures'::text,
        'a_guard_commercial_signature_insert_trg'::text,
        'public.guard_commercial_signature_insert()'::text,
        'O'::"char", false, 7::smallint, 0::smallint, ''::text, ''::text,
        NULL::text, 0::oid,
        'createtriggera_guard_commercial_signature_insert_trgbeforeinsertoncommercial_document_signaturesforeachrowexecutefunctionguard_commercial_signature_insert()'::text
      )
    ) AS expected(
      relation_name, trigger_name, function_signature, enabled, is_internal,
      trigger_type, argument_count, arguments_hex, trigger_columns,
      when_expression, parent_trigger, definition
    )
  ),
  final_expected AS (
    SELECT *
    FROM (VALUES
      (
        'public.projects'::text, 'set_project_studio_id'::text,
        'public.set_project_studio_id()'::text, 'O'::"char", false,
        23::smallint, 0::smallint, ''::text,
        (SELECT string_agg(attnum::text, ' ' ORDER BY
           array_position(
             ARRAY[
               'id','studio_id','designer_id','client_id','proposal_id',
               'created_by','created_at'
             ],
             attname
           ))
         FROM pg_attribute
         WHERE attrelid = 'public.projects'::regclass
           AND attname = ANY(
             ARRAY[
               'id','studio_id','designer_id','client_id','proposal_id',
               'created_by','created_at'
             ]
           )),
        NULL::text, 0::oid,
        'createtriggerset_project_studio_idbeforeinsertorupdateofid,studio_id,designer_id,client_id,proposal_id,created_by,created_atonprojectsforeachrowexecutefunctionset_project_studio_id()'::text
      ),
      (
        'public.invoices'::text, 'set_invoice_studio_id'::text,
        'public.set_invoice_studio_id()'::text, 'O'::"char", false,
        23::smallint, 0::smallint, ''::text,
        (SELECT string_agg(attnum::text, ' ' ORDER BY array_position(
           ARRAY[
             'id','studio_id','designer_id','client_id','project_id','status',
             'invoice_number','issue_date','due_date','payment_terms_days',
             'currency','subtotal_cents','tax_rate','tax_cents','total_cents',
             'amount_paid_cents','memo','internal_notes','sent_at','paid_at',
             'voided_at','void_reason','stripe_checkout_session_id',
             'reminder_count','last_reminder_at','ar_flagged_at',
             'ar_last_chased_at','created_at','updated_at'
           ], attname))
         FROM pg_attribute
         WHERE attrelid = 'public.invoices'::regclass
           AND attname = ANY(
             ARRAY[
               'id','studio_id','designer_id','client_id','project_id','status',
               'invoice_number','issue_date','due_date','payment_terms_days',
               'currency','subtotal_cents','tax_rate','tax_cents','total_cents',
               'amount_paid_cents','memo','internal_notes','sent_at','paid_at',
               'voided_at','void_reason','stripe_checkout_session_id',
               'reminder_count','last_reminder_at','ar_flagged_at',
               'ar_last_chased_at','created_at','updated_at'
             ]
           )),
        NULL::text, 0::oid,
        'createtriggerset_invoice_studio_idbeforeinsertorupdateofid,studio_id,designer_id,client_id,project_id,status,invoice_number,issue_date,due_date,payment_terms_days,currency,subtotal_cents,tax_rate,tax_cents,total_cents,amount_paid_cents,memo,internal_notes,sent_at,paid_at,voided_at,void_reason,stripe_checkout_session_id,reminder_count,last_reminder_at,ar_flagged_at,ar_last_chased_at,created_at,updated_atoninvoicesforeachrowexecutefunctionset_invoice_studio_id()'::text
      ),
      (
        'public.commercial_document_signatures'::text,
        'a_guard_commercial_signature_insert_trg'::text,
        'public.guard_commercial_signature_insert()'::text,
        'O'::"char", false, 7::smallint, 0::smallint, ''::text, ''::text,
        NULL::text, 0::oid,
        'createtriggera_guard_commercial_signature_insert_trgbeforeinsertoncommercial_document_signaturesforeachrowexecutefunctionguard_commercial_signature_insert()'::text
      )
    ) AS expected(
      relation_name, trigger_name, function_signature, enabled, is_internal,
      trigger_type, argument_count, arguments_hex, trigger_columns,
      when_expression, parent_trigger, definition
    )
  )
  SELECT
    NOT EXISTS (
      (SELECT * FROM source_expected EXCEPT ALL SELECT * FROM actual)
      UNION ALL
      (SELECT * FROM actual EXCEPT ALL SELECT * FROM source_expected)
    ),
    NOT EXISTS (
      (SELECT * FROM final_expected EXCEPT ALL SELECT * FROM actual)
      UNION ALL
      (SELECT * FROM actual EXCEPT ALL SELECT * FROM final_expected)
    )
  INTO source_ok, final_ok;

  IF NOT (source_ok OR final_ok) THEN
    RAISE EXCEPTION '00485 source/final studio trigger binding drifted';
  END IF;

  IF source_ok AND (
    EXISTS (
      SELECT 1
      FROM _00485_profile AS expected
      JOIN pg_proc AS routine
        ON routine.oid = to_regprocedure(expected.signature)
      WHERE expected.signature IN (
        'public.set_project_studio_id()', 'public.set_invoice_studio_id()'
      )
        AND NOT (
          routine.prosecdef IS NOT DISTINCT FROM
            expected.original_security_definer
          AND routine.proconfig IS NOT DISTINCT FROM expected.original_config
          AND encode(
                extensions.digest(
                  convert_to(routine.prosrc, 'UTF8'), 'sha256'
                ), 'hex'
              ) = expected.original_body_sha256
        )
    )
    OR EXISTS (
      SELECT 1
      FROM _00485_dependency_profile AS expected
      JOIN pg_proc AS routine
        ON routine.oid = to_regprocedure(expected.signature)
      WHERE expected.signature = 'public.guard_commercial_signature_insert()'
        AND NOT (
          routine.prosecdef IS NOT DISTINCT FROM
            expected.original_security_definer
          AND routine.proconfig IS NOT DISTINCT FROM expected.original_config
          AND encode(
                extensions.digest(
                  convert_to(routine.prosrc, 'UTF8'), 'sha256'
                ), 'hex'
              ) = expected.original_body_sha256
        )
    )
  ) THEN
    RAISE EXCEPTION '00485 source trigger body/binding states are incoherent';
  END IF;

  IF final_ok AND (
    EXISTS (
      SELECT 1
      FROM _00485_profile AS expected
      JOIN pg_proc AS routine
        ON routine.oid = to_regprocedure(expected.signature)
      WHERE expected.signature IN (
        'public.set_project_studio_id()', 'public.set_invoice_studio_id()'
      )
        AND NOT (
          routine.prosecdef IS NOT DISTINCT FROM
            expected.final_security_definer
          AND routine.proconfig IS NOT DISTINCT FROM expected.final_config
          AND encode(
                extensions.digest(
                  convert_to(routine.prosrc, 'UTF8'), 'sha256'
                ), 'hex'
              ) = expected.final_body_sha256
        )
    )
    OR EXISTS (
      SELECT 1
      FROM _00485_dependency_profile AS expected
      JOIN pg_proc AS routine
        ON routine.oid = to_regprocedure(expected.signature)
      WHERE expected.signature = 'public.guard_commercial_signature_insert()'
        AND NOT (
          routine.prosecdef IS NOT DISTINCT FROM
            expected.final_security_definer
          AND routine.proconfig IS NOT DISTINCT FROM expected.final_config
          AND encode(
                extensions.digest(
                  convert_to(routine.prosrc, 'UTF8'), 'sha256'
                ), 'hex'
              ) = expected.final_body_sha256
        )
    )
  ) THEN
    RAISE EXCEPTION '00485 final trigger body/binding states are incoherent';
  END IF;
END
$trigger_binding_preflight$;

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
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'spec book not found or not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM 1
  FROM public.spec_books AS book
  JOIN public.projects AS project ON project.id = book.project_id
  JOIN public.organizations AS studio ON studio.id = project.studio_id
  WHERE book.id = p_spec_book_id
    AND project.status = 'active'
    AND studio.type = 'design_studio'
    AND studio.status = 'active'
    AND EXISTS (
      SELECT 1
      FROM public.organization_members AS lead_membership
      WHERE lead_membership.organization_id = project.studio_id
        AND lead_membership.user_id = project.designer_id
        AND lead_membership.status = 'active'
        AND lead_membership.role <> 'guest'
    )
    AND (
      project.designer_id = v_actor
      OR EXISTS (
        SELECT 1
        FROM public.organization_members AS actor_membership
        WHERE actor_membership.organization_id = project.studio_id
          AND actor_membership.user_id = v_actor
          AND actor_membership.status = 'active'
          AND actor_membership.role <> 'guest'
      )
    )
  FOR SHARE OF book, project, studio;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'spec book not found or not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN public._prepare_spec_book_issue_00403(
    p_spec_book_id, p_audiences, p_issue_type, p_reason,
    p_base_revision_id, p_idempotency_key, p_warning_acknowledgements
  );
END;
$$;

COMMENT ON FUNCTION public.prepare_spec_book_issue(
  uuid, text[], text, text, uuid, text, jsonb
) IS
  'Authenticated boundary for the owner-only canonical preparation core. The book project must be active in an active design-studio, and the real actor must be the lead designer or an active non-guest member of that exact project studio.';

CREATE OR REPLACE FUNCTION public.guard_commercial_signature_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_via text := COALESCE(NEW.metadata->>'via', '');
  v_expected_capability text;
  v_active_role text := COALESCE(current_setting('role', true), 'none');
  v_exact_project_actor boolean := false;
  v_unique_origin_actor boolean := false;
  v_postgres_migration boolean :=
    session_user = 'postgres' AND v_active_role IN ('none', 'postgres');
BEGIN
  -- An invoker trigger sees postgres only while a reviewed owner core is active.
  IF current_user IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION
      'commercial signatures are inserted only by canonical signing RPCs'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_postgres_migration THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_proposal
  FROM public.proposals
  WHERE id = NEW.proposal_id;

  IF FOUND AND v_active_role = 'authenticated' AND auth.uid() IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.project_commercial_documents AS document
      JOIN public.projects AS project ON project.id = document.project_id
      JOIN public.organizations AS studio ON studio.id = project.studio_id
      JOIN public.organization_members AS actor_membership
        ON actor_membership.organization_id = project.studio_id
       AND actor_membership.user_id = auth.uid()
      JOIN public.organization_members AS lead_membership
        ON lead_membership.organization_id = project.studio_id
       AND lead_membership.user_id = project.designer_id
      JOIN public.user_roles AS user_role
        ON user_role.user_id = project.designer_id
      JOIN public.roles AS role ON role.id = user_role.role_id
      WHERE document.proposal_id = v_proposal.id
        AND document.document_kind = v_proposal.document_kind
        AND (
          v_proposal.project_id IS NULL
          OR v_proposal.project_id = project.id
        )
        AND project.client_id = v_proposal.client_id
        AND project.status = 'active'
        AND studio.type = 'design_studio'
        AND studio.status = 'active'
        AND actor_membership.status = 'active'
        AND actor_membership.role <> 'guest'
        AND lead_membership.status = 'active'
        AND lead_membership.role <> 'guest'
        AND role.domain = 'designer'
    ) INTO v_exact_project_actor;

    SELECT v_proposal.document_kind = 'design_services'
       AND v_proposal.project_id IS NULL
       AND NOT EXISTS (
         SELECT 1
         FROM public.project_commercial_documents AS document
         WHERE document.proposal_id = v_proposal.id
       )
       AND EXISTS (
         SELECT 1
         FROM public.user_roles AS user_role
         JOIN public.roles AS role ON role.id = user_role.role_id
         WHERE user_role.user_id = v_proposal.designer_id
           AND role.domain = 'designer'
       )
       AND 1 = (
         SELECT count(DISTINCT studio.id)
         FROM public.organizations AS studio
         JOIN public.organization_members AS lead_membership
           ON lead_membership.organization_id = studio.id
          AND lead_membership.user_id = v_proposal.designer_id
         JOIN public.organization_members AS actor_membership
           ON actor_membership.organization_id = studio.id
          AND actor_membership.user_id = auth.uid()
         WHERE studio.type = 'design_studio'
           AND studio.status = 'active'
           AND lead_membership.status = 'active'
           AND lead_membership.role <> 'guest'
           AND actor_membership.status = 'active'
           AND actor_membership.role <> 'guest'
       )
    INTO v_unique_origin_actor;
  END IF;
  v_expected_capability := format(
    'commercial_signature:%s:%s:%s',
    NEW.proposal_id, v_via, pg_catalog.txid_current()
  );

  IF NOT FOUND
     OR NEW.party_role NOT IN ('client', 'studio')
     OR current_setting('app.commercial_signature_capability', true)
          IS DISTINCT FROM v_expected_capability
     OR NEW.evidence_fingerprint IS DISTINCT FROM
          public._commercial_document_fingerprint(NEW.proposal_id)
     OR (
       NEW.party_role = 'client'
       AND (
         v_proposal.client_id IS NULL
         OR NEW.signer_user_id IS DISTINCT FROM v_proposal.client_id
         OR v_proposal.commercial_state <> 'sent'
         OR v_via NOT IN (
           'sign_design_services_agreement',
           'record_paper_client_signature',
           'execute_furnishings_authorization',
           'execute_furnishings_authorization_on_paper',
           'execute_trade_scope',
           'execute_trade_scope_on_paper'
         )
         OR NOT (
           (
             v_via IN (
               'sign_design_services_agreement',
               'record_paper_client_signature'
             )
             AND v_proposal.document_kind IN (
               'design_services', 'service_addendum'
             )
           )
           OR (
             v_via IN (
               'execute_furnishings_authorization',
               'execute_furnishings_authorization_on_paper'
             )
             AND v_proposal.document_kind = 'furnishings_authorization'
           )
           OR (
             v_via IN (
               'execute_trade_scope', 'execute_trade_scope_on_paper'
             )
             AND v_proposal.document_kind = 'trade_scope'
           )
         )
         OR (
           v_via IN (
             'sign_design_services_agreement',
             'execute_furnishings_authorization',
             'execute_trade_scope'
           )
           AND NOT (
             (
               v_active_role = 'authenticated'
               AND auth.uid() IS NOT NULL
               AND auth.uid() IS NOT DISTINCT FROM NEW.signer_user_id
             )
             OR (
               v_active_role = 'service_role'
               AND NEW.signer_user_id IS NOT DISTINCT FROM
                     v_proposal.client_id
             )
           )
         )
         OR (
           v_via IN (
             'record_paper_client_signature',
             'execute_furnishings_authorization_on_paper',
             'execute_trade_scope_on_paper'
           )
           AND (
             v_active_role <> 'authenticated'
             OR auth.uid() IS NULL
             OR NOT (
               v_exact_project_actor
               OR (
                 v_via = 'record_paper_client_signature'
                 AND v_unique_origin_actor
               )
             )
             OR NEW.signed_ip IS NOT NULL
             OR COALESCE(
                  (NEW.metadata->>'executedOnPaper')::boolean, false
                ) IS NOT TRUE
             OR NEW.metadata->>'recordedBy'
                  IS DISTINCT FROM auth.uid()::text
             OR NULLIF(NEW.metadata->>'paperSignedOn', '') IS NULL
           )
         )
       )
     )
     OR (
       NEW.party_role = 'studio'
       AND (
         v_active_role <> 'authenticated'
         OR v_proposal.commercial_state <> 'client_signed'
         OR NOT (v_exact_project_actor OR v_unique_origin_actor)
         OR NEW.signer_user_id IS DISTINCT FROM auth.uid()
         OR v_via <> 'countersign_design_services_agreement'
       )
     )
  THEN
    RAISE EXCEPTION
      'commercial signature does not match canonical signer/state/evidence'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

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
  -- designer authority tuple. Zero or multiple candidates remain NULL and
  -- fail closed below. The selected tuple is then locked in canonical order.
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
      AND EXISTS (
        SELECT 1
        FROM public.user_roles AS user_role
        JOIN public.roles AS role ON role.id = user_role.role_id
        WHERE user_role.user_id = NEW.designer_id
          AND role.domain = 'designer'
      );

    IF v_candidate_studio_count = 1 THEN
      NEW.studio_id := v_candidate_studio_id;
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
  v_lead_has_designer_role := FOUND;

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

CREATE OR REPLACE FUNCTION public.set_invoice_studio_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_active_role text := COALESCE(current_setting('role', true), 'none');
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_commercial_document_id text :=
    current_setting('app.commercial_document_id', true);
  v_capability_row_id uuid;
  v_capability_count integer;
  v_actor_is_member boolean := false;
  v_immutable_update boolean := false;
  v_postgres_migration boolean :=
    session_user = 'postgres' AND v_active_role IN ('none', 'postgres');
BEGIN
  -- Financial machine transitions remain replayable after later authority
  -- revocation. UPDATE never reparents an invoice, and its historical parent
  -- checks stay non-locking to preserve project -> invoice lock order.
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.designer_id IS DISTINCT FROM OLD.designer_id
       OR NEW.client_id IS DISTINCT FROM OLD.client_id
       OR NEW.studio_id IS DISTINCT FROM OLD.studio_id
    THEN
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    END IF;

    v_immutable_update := true;

    SELECT project.* INTO v_project
    FROM public.projects AS project
    WHERE project.id = NEW.project_id
      AND project.client_id IS NOT DISTINCT FROM NEW.client_id
      AND project.studio_id = NEW.studio_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    END IF;

    IF v_project.designer_id IS DISTINCT FROM NEW.designer_id THEN
      PERFORM historical_lead.id
      FROM public.project_team_members AS historical_lead
      WHERE historical_lead.project_id = NEW.project_id
        AND historical_lead.user_id = NEW.designer_id
        AND historical_lead.role = 'previous_lead'
      ORDER BY historical_lead.id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'studio_id_not_designer_studio';
      END IF;
    END IF;

    IF v_active_role = 'service_role' OR v_postgres_migration THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NOT v_immutable_update THEN
    -- Authorization-qualified discovery precedes the canonical root lock.
    -- A direct actor must already belong to the exact active project studio;
    -- an owner-executed client path must present its exact transaction-bound
    -- commercial, activation, or decision capability. Neither path first
    -- reads or contends on a foreign project selected only by caller input.
    IF v_postgres_migration OR v_active_role = 'service_role' THEN
      SELECT project.* INTO v_project
      FROM public.projects AS project
      WHERE project.id = NEW.project_id;
    ELSIF v_active_role = 'authenticated' THEN
      IF v_actor IS NULL THEN
        RAISE EXCEPTION 'studio_id_not_designer_studio';
      ELSIF current_user = 'authenticated' THEN
        SELECT project.* INTO v_project
        FROM public.projects AS project
        JOIN public.organization_members AS actor_membership
          ON actor_membership.organization_id = project.studio_id
         AND actor_membership.user_id = v_actor
        JOIN public.organizations AS studio
          ON studio.id = actor_membership.organization_id
        WHERE project.id = NEW.project_id
          AND actor_membership.status = 'active'
          AND actor_membership.role <> 'guest'
          AND studio.type = 'design_studio'
          AND studio.status = 'active';
      ELSIF current_user = 'postgres' THEN
        SELECT project.* INTO v_project
        FROM public.projects AS project
        WHERE project.id = NEW.project_id
          AND (
            EXISTS (
              SELECT 1
              FROM public.organization_members AS actor_membership
              JOIN public.organizations AS studio
                ON studio.id = actor_membership.organization_id
              WHERE actor_membership.organization_id = project.studio_id
                AND actor_membership.user_id = v_actor
                AND actor_membership.status = 'active'
                AND actor_membership.role <> 'guest'
                AND studio.type = 'design_studio'
                AND studio.status = 'active'
            )
            OR (
              project.client_id = v_actor
              AND (
                EXISTS (
                  SELECT 1
                  FROM public.project_commercial_documents AS document
                  JOIN public.proposals AS proposal
                    ON proposal.id = document.proposal_id
                  JOIN public.designer_clients AS relationship
                    ON relationship.id = proposal.designer_client_id
                  WHERE document.project_id = project.id
                    AND document.proposal_id::text =
                          v_commercial_document_id
                    AND document.document_kind IN (
                      'design_services', 'service_addendum',
                      'furnishings_authorization', 'trade_scope'
                    )
                    AND proposal.document_kind = document.document_kind
                    AND (
                      proposal.project_id IS NULL
                      OR proposal.project_id = project.id
                    )
                    AND proposal.client_id = project.client_id
                    AND relationship.designer_id = proposal.designer_id
                    AND relationship.client_id = proposal.client_id
                    AND proposal.commercial_state = 'executed'
                )
                OR EXISTS (
                  SELECT 1
                  FROM public.proposals AS proposal
                  JOIN public.designer_clients AS relationship
                    ON relationship.id = proposal.designer_client_id
                  WHERE proposal.id = project.proposal_id
                    AND proposal.id::text = current_setting(
                      'app.proposal_activation_id', true
                    )
                    AND proposal.client_id = project.client_id
                    AND proposal.designer_id = project.designer_id
                    AND proposal.status = 'accepted'
                    AND (
                      proposal.project_id IS NULL
                      OR proposal.project_id = project.id
                    )
                    AND relationship.designer_id = proposal.designer_id
                    AND relationship.client_id = proposal.client_id
                )
                OR EXISTS (
                  SELECT 1
                  FROM public.client_decisions AS decision
                  JOIN public.designer_clients AS relationship
                    ON relationship.id = decision.designer_client_id
                  WHERE decision.id::text = current_setting(
                    'app.client_decision_write_id', true
                  )
                    AND decision.project_id = project.id
                    AND decision.designer_id = project.designer_id
                    AND decision.decision_kind = 'approval'
                    AND decision.coordination_kind = 'selection'
                    AND decision.court = 'client'
                    AND decision.status = 'responded'
                    AND relationship.designer_id = project.designer_id
                    AND relationship.client_id = project.client_id
                )
              )
            )
          );
      ELSE
        RAISE EXCEPTION 'studio_id_not_designer_studio';
      END IF;
    ELSE
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    END IF;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    END IF;

    NEW.studio_id := COALESCE(NEW.studio_id, v_project.studio_id);
    NEW.designer_id := COALESCE(NEW.designer_id, v_project.designer_id);
    NEW.client_id := COALESCE(NEW.client_id, v_project.client_id);

    -- Legacy fixtures and owner maintenance may omit live authority rows, but
    -- only a true postgres/no-SET-ROLE session receives this bounded bypass.
    IF v_postgres_migration THEN
      RETURN NEW;
    END IF;

    SELECT project.* INTO v_project
    FROM public.projects AS project
    WHERE project.id = NEW.project_id
      AND project.designer_id = NEW.designer_id
      AND project.client_id IS NOT DISTINCT FROM NEW.client_id
      AND project.studio_id = NEW.studio_id
      AND project.status = 'active'
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    END IF;

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
    IF NOT FOUND THEN
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    END IF;

    PERFORM membership.id
    FROM public.organization_members AS membership
    WHERE membership.organization_id = NEW.studio_id
      AND membership.user_id = ANY(ARRAY[NEW.designer_id, v_actor]::uuid[])
    ORDER BY membership.user_id, membership.id
    FOR SHARE;

    PERFORM studio.id
    FROM public.organizations AS studio
    WHERE studio.id = NEW.studio_id
    ORDER BY studio.id
    FOR SHARE;

    SELECT project.* INTO v_project
    FROM public.projects AS project
    JOIN public.organizations AS studio ON studio.id = project.studio_id
    JOIN public.organization_members AS lead_membership
      ON lead_membership.organization_id = project.studio_id
     AND lead_membership.user_id = project.designer_id
    WHERE project.id = NEW.project_id
      AND project.designer_id = NEW.designer_id
      AND project.client_id IS NOT DISTINCT FROM NEW.client_id
      AND project.studio_id = NEW.studio_id
      AND project.status = 'active'
      AND studio.type = 'design_studio'
      AND studio.status = 'active'
      AND lead_membership.status = 'active'
      AND lead_membership.role <> 'guest';

    IF NEW.project_id IS NULL
       OR NEW.designer_id IS NULL
       OR NEW.studio_id IS NULL
       OR NOT FOUND
    THEN
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    END IF;

  END IF;

  IF v_active_role = 'authenticated' THEN
    IF v_actor IS NULL THEN
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.organizations AS actor_studio
      WHERE actor_studio.id = NEW.studio_id
        AND actor_studio.type = 'design_studio'
        AND actor_studio.status = 'active'
    ) THEN
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    END IF;

    v_actor_is_member := EXISTS (
      SELECT 1
    FROM public.organization_members AS actor_membership
    JOIN public.organizations AS actor_studio
      ON actor_studio.id = actor_membership.organization_id
    WHERE actor_membership.organization_id = NEW.studio_id
      AND actor_membership.user_id = v_actor
      AND actor_membership.status = 'active'
      AND actor_membership.role <> 'guest'
      AND actor_studio.type = 'design_studio'
      AND actor_studio.status = 'active'
    );

    IF current_user = 'authenticated' THEN
      IF v_actor_is_member
         AND v_project.designer_id IS NOT DISTINCT FROM NEW.designer_id
         AND EXISTS (
           SELECT 1
           FROM public.organization_members AS lead_membership
           WHERE lead_membership.organization_id = NEW.studio_id
             AND lead_membership.user_id = NEW.designer_id
             AND lead_membership.status = 'active'
             AND lead_membership.role <> 'guest'
         )
         AND EXISTS (
           SELECT 1
           FROM public.user_roles AS user_role
           JOIN public.roles AS role ON role.id = user_role.role_id
           WHERE user_role.user_id = NEW.designer_id
             AND role.domain = 'designer'
         )
         AND NEW.status = 'draft'
         AND NEW.invoice_number IS NULL
         AND NEW.issue_date IS NULL
         AND NEW.sent_at IS NULL
         AND NEW.paid_at IS NULL
         AND NEW.voided_at IS NULL
         AND NEW.void_reason IS NULL
         AND NEW.stripe_checkout_session_id IS NULL
         AND NEW.amount_paid_cents = 0
         AND NEW.reminder_count = 0
         AND NEW.last_reminder_at IS NULL
         AND NEW.ar_flagged_at IS NULL
         AND NEW.ar_last_chased_at IS NULL
         AND (
           TG_OP = 'INSERT'
           OR (
             NEW.project_id IS NOT DISTINCT FROM OLD.project_id
             AND NEW.designer_id IS NOT DISTINCT FROM OLD.designer_id
             AND NEW.client_id IS NOT DISTINCT FROM OLD.client_id
             AND NEW.studio_id IS NOT DISTINCT FROM OLD.studio_id
             AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
             AND NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at
           )
         )
      THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    ELSIF current_user IS DISTINCT FROM 'postgres' THEN
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    END IF;

    IF v_actor_is_member THEN
      RETURN NEW;
    END IF;

    IF v_actor IS DISTINCT FROM NEW.client_id THEN
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    END IF;

    PERFORM 1
    FROM public.project_commercial_documents AS document
    JOIN public.proposals AS proposal
      ON proposal.id = document.proposal_id
    JOIN public.designer_clients AS author_relationship
      ON author_relationship.id = proposal.designer_client_id
    WHERE document.proposal_id::text = v_commercial_document_id
      AND document.project_id = NEW.project_id
      AND document.document_kind IN (
        'design_services', 'service_addendum',
        'furnishings_authorization', 'trade_scope'
      )
      AND proposal.document_kind = document.document_kind
      AND (
        proposal.project_id IS NULL
        OR proposal.project_id = NEW.project_id
      )
      AND proposal.client_id = NEW.client_id
      AND author_relationship.designer_id = proposal.designer_id
      AND author_relationship.client_id = proposal.client_id
      AND proposal.commercial_state = 'executed'
    FOR SHARE OF document, proposal, author_relationship;
    IF FOUND THEN
      RETURN NEW;
    END IF;

    SELECT locked.id, count(*) OVER ()
    INTO v_capability_row_id, v_capability_count
    FROM (
      SELECT milestone.id
      FROM public.project_payment_milestones AS milestone
      JOIN public.proposals AS proposal
        ON proposal.id = v_project.proposal_id
      JOIN public.designer_clients AS relationship
        ON relationship.id = proposal.designer_client_id
      WHERE proposal.id::text =
              current_setting('app.proposal_activation_id', true)
        AND proposal.client_id = v_actor
        AND proposal.designer_id = v_project.designer_id
        AND proposal.status = 'accepted'
        AND (
          proposal.project_id IS NULL
          OR proposal.project_id = v_project.id
        )
        AND relationship.designer_id = proposal.designer_id
        AND relationship.client_id = proposal.client_id
        AND milestone.project_id = v_project.id
        AND milestone.trigger_kind = 'on_signing'
        AND milestone.invoice_id IS NULL
        AND milestone.label || ' — payment milestone' = NEW.memo
        AND milestone.amount_cents = NEW.subtotal_cents
        AND NEW.tax_cents = 0
        AND milestone.amount_cents = NEW.total_cents
      FOR UPDATE OF milestone
      FOR SHARE OF proposal, relationship
    ) AS locked
    LIMIT 1;
    IF FOUND AND v_capability_count = 1 THEN
      RETURN NEW;
    END IF;

    SELECT locked.id, count(*) OVER ()
    INTO v_capability_row_id, v_capability_count
    FROM (
      SELECT milestone.id
      FROM public.client_decisions AS decision
      JOIN public.designer_clients AS relationship
        ON relationship.id = decision.designer_client_id
      JOIN public.client_decision_options AS option
        ON option.decision_id = decision.id
      JOIN public.project_payment_milestones AS milestone
        ON milestone.project_id = decision.project_id
       AND milestone.trigger_kind = 'on_section_settled'
       AND milestone.trigger_section_key = decision.section_key
      WHERE decision.id::text =
              current_setting('app.client_decision_write_id', true)
        AND decision.project_id = v_project.id
        AND decision.designer_id = v_project.designer_id
        AND decision.decision_kind = 'approval'
        AND decision.coordination_kind = 'selection'
        AND decision.court = 'client'
        AND decision.status = 'responded'
        AND relationship.designer_id = v_project.designer_id
        AND relationship.client_id = v_actor
        AND option.selected
        AND option.approves
        AND milestone.invoice_id IS NULL
        AND milestone.label || ' — payment milestone' = NEW.memo
        AND milestone.amount_cents = NEW.subtotal_cents
        AND NEW.tax_cents = 0
        AND milestone.amount_cents = NEW.total_cents
      FOR UPDATE OF milestone
      FOR SHARE OF decision, relationship, option
    ) AS locked
    LIMIT 1;
    IF FOUND AND v_capability_count = 1 THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'studio_id_not_designer_studio';
  ELSIF v_active_role <> 'service_role' AND NOT v_postgres_migration THEN
    RAISE EXCEPTION 'studio_id_not_designer_studio';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS a_guard_commercial_signature_insert_trg
  ON public.commercial_document_signatures;
CREATE TRIGGER a_guard_commercial_signature_insert_trg
  BEFORE INSERT ON public.commercial_document_signatures
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_commercial_signature_insert();

DROP TRIGGER IF EXISTS set_project_studio_id ON public.projects;
CREATE TRIGGER set_project_studio_id
  BEFORE INSERT OR UPDATE OF
    id, studio_id, designer_id, client_id, proposal_id, created_by, created_at
  ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_project_studio_id();

DROP TRIGGER IF EXISTS set_invoice_studio_id ON public.invoices;
-- This name sorts before set_invoices_updated_at. UPDATE OF updated_at catches
-- explicit caller writes; the sibling BEFORE trigger's NEW assignment recurses nowhere.
CREATE TRIGGER set_invoice_studio_id
  BEFORE INSERT OR UPDATE OF
    id, studio_id, designer_id, client_id, project_id, status, invoice_number,
    issue_date, due_date, payment_terms_days, currency, subtotal_cents,
    tax_rate, tax_cents, total_cents, amount_paid_cents, memo, internal_notes,
    sent_at, paid_at, voided_at, void_reason, stripe_checkout_session_id,
    reminder_count, last_reminder_at, ar_flagged_at, ar_last_chased_at,
    created_at, updated_at
  ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_invoice_studio_id();

COMMENT ON FUNCTION public.set_project_studio_id() IS
  'Invoker trigger derives a missing studio only when the designer has a live designer-domain role and exactly one active non-guest membership in an active design studio, then locks and revalidates the selected authority tuple; zero or ambiguity fails closed for app/service callers. Project id, created_at, and created_by are immutable on UPDATE. Every app/service tuple requires the locked current live lead and exact actor/capability rules; proposal authorship remains immutable history across the exact reassignment path. A true postgres/no-SET-ROLE fixture or owner-maintenance session returns only after best-effort derivation and UPDATE immutability checks.';

COMMENT ON FUNCTION public.set_invoice_studio_id() IS
  'Invoker trigger authorizes project discovery before locking or deriving a missing invoice designer/client/studio from its canonical project. App/service inserts bind the current active non-guest project lead with a live designer-domain role, exact client, and active design studio; UPDATE cannot change invoice identity or its project/client/designer/studio tuple. Direct authenticated DML is limited to clean drafts by an exact-studio actor. Immutable machine updates require current-lead or previous_lead provenance. Authenticated owner cores require an exact-studio actor or exact client capability; service may reconcile exact historical tuples. A true postgres/no-SET-ROLE fixture or owner-maintenance session returns only after best-effort derivation and UPDATE immutability checks.';

ALTER FUNCTION public._prepare_spec_book_issue_00403(
  uuid, text[], text, text, uuid, text, jsonb
)
SET search_path = pg_catalog, public, extensions, pg_temp;

ALTER FUNCTION public._publish_project_review_00448_impl(jsonb)
SET search_path = pg_catalog, public, extensions, pg_temp;

CREATE OR REPLACE FUNCTION public.publish_project_review(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project_id uuid;
  v_project_id_text text := NULLIF(p_request->>'projectId', '');
  v_result jsonb;
  v_edition_id uuid;
  v_boards jsonb;
  v_hash text;
  v_previous_publish text :=
    current_setting('app.project_review_publish', true);
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  BEGIN
    v_project_id := v_project_id_text::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END;
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM 1
  FROM public.projects AS project
  JOIN public.organizations AS studio ON studio.id = project.studio_id
  WHERE project.id = v_project_id
    AND project.status = 'active'
    AND studio.type = 'design_studio'
    AND studio.status = 'active'
    AND EXISTS (
      SELECT 1
      FROM public.organization_members AS lead_membership
      WHERE lead_membership.organization_id = project.studio_id
        AND lead_membership.user_id = project.designer_id
        AND lead_membership.status = 'active'
        AND lead_membership.role <> 'guest'
    )
    AND (
      project.designer_id = v_actor
      OR EXISTS (
        SELECT 1
        FROM public.organization_members AS actor_membership
        WHERE actor_membership.organization_id = project.studio_id
          AND actor_membership.user_id = v_actor
          AND actor_membership.status = 'active'
          AND actor_membership.role <> 'guest'
      )
    )
  FOR SHARE OF project, studio;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

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

COMMENT ON FUNCTION public.publish_project_review(jsonb) IS
  'Publishes a project review only after an actor check, fixed-denial project-id parsing, and a non-enumerating authorization read prove an active project/studio tuple and the real actor is the lead or an active non-guest member of that exact project studio; board/media reads occur afterward.';

CREATE OR REPLACE FUNCTION public.create_draft_invoice(
  p_project_id uuid,
  p_expected_designer_id uuid,
  p_expected_client_id uuid,
  p_expected_studio_id uuid,
  p_tax_rate numeric DEFAULT 0,
  p_payment_terms_days integer DEFAULT 15,
  p_memo text DEFAULT NULL,
  p_internal_notes text DEFAULT NULL,
  p_lines jsonb DEFAULT '[]'::jsonb
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_active_role text := COALESCE(current_setting('role', true), 'none');
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_subtotal integer := 0;
  v_tax integer := 0;
  v_expected_refs integer := 0;
  v_locked_refs integer := 0;
BEGIN
  IF v_active_role <> 'authenticated' OR v_actor IS NULL THEN
    RAISE EXCEPTION 'invoice project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Discover only an exact-studio row the actor can already reach. Authority
  -- rows are locked below in the repository-wide revocation order.
  SELECT project.* INTO v_project
  FROM public.projects AS project
  JOIN public.organizations AS studio ON studio.id = project.studio_id
  JOIN public.organization_members AS actor_membership
    ON actor_membership.organization_id = project.studio_id
   AND actor_membership.user_id = v_actor
  JOIN public.organization_members AS lead_membership
    ON lead_membership.organization_id = project.studio_id
   AND lead_membership.user_id = project.designer_id
  JOIN public.user_roles AS user_role
    ON user_role.user_id = project.designer_id
  JOIN public.roles AS role ON role.id = user_role.role_id
  WHERE project.id = p_project_id
    AND project.designer_id = p_expected_designer_id
    AND project.client_id = p_expected_client_id
    AND project.studio_id = p_expected_studio_id
    AND project.status = 'active'
    AND studio.type = 'design_studio'
    AND studio.status = 'active'
    AND actor_membership.status = 'active'
    AND actor_membership.role <> 'guest'
    AND lead_membership.status = 'active'
    AND lead_membership.role <> 'guest'
    AND role.domain = 'designer'
  ORDER BY role.id, user_role.id
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT project.* INTO v_project
  FROM public.projects AS project
  WHERE project.id = p_project_id
    AND project.designer_id = p_expected_designer_id
    AND project.client_id = p_expected_client_id
    AND project.studio_id = p_expected_studio_id
    AND project.status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM role.id
  FROM public.roles AS role
  WHERE role.domain = 'designer'
  ORDER BY role.id
  FOR SHARE;

  PERFORM user_role.id
  FROM public.user_roles AS user_role
  JOIN public.roles AS role ON role.id = user_role.role_id
  WHERE user_role.user_id = p_expected_designer_id
    AND role.domain = 'designer'
  ORDER BY user_role.role_id, user_role.id
  FOR SHARE OF user_role;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM membership.id
  FROM public.organization_members AS membership
  WHERE membership.organization_id = p_expected_studio_id
    AND membership.user_id = ANY(ARRAY[
      p_expected_designer_id, v_actor
    ]::uuid[])
  ORDER BY membership.user_id, membership.id
  FOR SHARE;

  PERFORM studio.id
  FROM public.organizations AS studio
  WHERE studio.id = p_expected_studio_id
  ORDER BY studio.id
  FOR SHARE;

  IF NOT EXISTS (
       SELECT 1
       FROM public.organizations AS studio
       WHERE studio.id = p_expected_studio_id
         AND studio.type = 'design_studio'
         AND studio.status = 'active'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.organization_members AS membership
       WHERE membership.organization_id = p_expected_studio_id
         AND membership.user_id = v_actor
         AND membership.status = 'active'
         AND membership.role <> 'guest'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.organization_members AS membership
       WHERE membership.organization_id = p_expected_studio_id
         AND membership.user_id = p_expected_designer_id
         AND membership.status = 'active'
         AND membership.role <> 'guest'
     )
  THEN
    RAISE EXCEPTION 'invoice project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_lines IS NULL
     OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) > 200
     OR octet_length(p_lines::text) > 262144
     OR p_tax_rate IS NULL
     OR p_tax_rate < 0
     OR p_tax_rate > 1
     OR p_payment_terms_days IS NULL
     OR p_payment_terms_days < 0
     OR p_payment_terms_days > 365
     OR char_length(COALESCE(p_memo, '')) > 10000
     OR char_length(COALESCE(p_internal_notes, '')) > 10000
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(p_lines) AS element(value)
       WHERE jsonb_typeof(element.value) <> 'object'
          OR EXISTS (
            SELECT 1
            FROM jsonb_object_keys(element.value) AS key(name)
            WHERE key.name <> ALL(ARRAY[
              'kind', 'milestone_id', 'ffe_item_id', 'description',
              'quantity', 'unit_amount_cents', 'metadata', 'sort_order'
            ]::text[])
          )
          OR jsonb_typeof(COALESCE(element.value->'metadata', '{}'::jsonb))
               <> 'object'
          OR COALESCE(element.value->'metadata', '{}'::jsonb) ?| ARRAY[
            'commercialDocumentId', 'tradeScopeDocumentId',
            'tradeScopeId', 'drawId'
          ]::text[]
     )
  THEN
    RAISE EXCEPTION 'invalid draft invoice payload'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_lines) AS line(
      kind text,
      milestone_id uuid,
      ffe_item_id uuid,
      description text,
      quantity numeric,
      unit_amount_cents integer,
      metadata jsonb,
      sort_order integer
    )
    WHERE line.kind IS NULL
       OR line.kind NOT IN ('milestone', 'time', 'adhoc', 'ffe')
       OR NULLIF(btrim(line.description), '') IS NULL
       OR char_length(line.description) > 2000
       OR line.quantity IS NULL
       OR line.quantity <= 0
       OR line.quantity > 100000
       OR line.unit_amount_cents IS NULL
       OR line.unit_amount_cents < 0
       OR line.unit_amount_cents > 1000000000
       OR line.sort_order IS NULL
       OR line.sort_order < 0
       OR line.sort_order > 1000000
       OR (
         line.milestone_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
           FROM public.project_payment_milestones AS milestone
           WHERE milestone.id = line.milestone_id
             AND milestone.project_id = v_project.id
             AND milestone.invoice_id IS NULL
             AND line.kind = 'milestone'
             AND line.quantity = 1
             AND line.unit_amount_cents = milestone.amount_cents
         )
       )
       OR (
         line.kind = 'milestone'
         AND (line.milestone_id IS NULL OR line.ffe_item_id IS NOT NULL)
       )
       OR (
         line.kind = 'ffe'
         AND (line.ffe_item_id IS NULL OR line.milestone_id IS NOT NULL)
       )
       OR (
         line.kind IN ('time', 'adhoc')
         AND (line.milestone_id IS NOT NULL OR line.ffe_item_id IS NOT NULL)
       )
       OR (
         line.ffe_item_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
           FROM public.project_ffe_items AS item
           WHERE item.id = line.ffe_item_id
             AND item.project_id = v_project.id
         )
       )
  ) THEN
    RAISE EXCEPTION 'invalid draft invoice payload'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_lines) AS line(milestone_id uuid)
    WHERE line.milestone_id IS NOT NULL
    GROUP BY line.milestone_id
    HAVING count(*) <> 1
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_lines) AS line(ffe_item_id uuid)
    WHERE line.ffe_item_id IS NOT NULL
    GROUP BY line.ffe_item_id
    HAVING count(*) <> 1
  ) THEN
    RAISE EXCEPTION 'invalid draft invoice payload'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Milestones are mutable invoice latches. Lock distinct IDs in sorted
  -- UPDATE order before inserting a header or line so two composers cannot
  -- share-lock then deadlock while the line trigger advances the same latch.
  SELECT count(DISTINCT line.milestone_id) INTO v_expected_refs
  FROM jsonb_to_recordset(p_lines) AS line(milestone_id uuid)
  WHERE line.milestone_id IS NOT NULL;
  PERFORM milestone.id
  FROM (
    SELECT DISTINCT line.milestone_id, line.kind, line.quantity,
           line.unit_amount_cents
    FROM jsonb_to_recordset(p_lines) AS line(
      milestone_id uuid,
      kind text,
      quantity numeric,
      unit_amount_cents integer
    )
    WHERE line.milestone_id IS NOT NULL
  ) AS line
  JOIN public.project_payment_milestones AS milestone
    ON milestone.id = line.milestone_id
   AND milestone.project_id = v_project.id
   AND line.kind = 'milestone'
   AND line.quantity = 1
   AND line.unit_amount_cents = milestone.amount_cents
   AND milestone.invoice_id IS NULL
  ORDER BY milestone.id
  FOR UPDATE OF milestone;
  GET DIAGNOSTICS v_locked_refs = ROW_COUNT;
  IF v_locked_refs <> v_expected_refs THEN
    RAISE EXCEPTION 'invalid draft invoice payload'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(DISTINCT line.ffe_item_id) INTO v_expected_refs
  FROM jsonb_to_recordset(p_lines) AS line(ffe_item_id uuid)
  WHERE line.ffe_item_id IS NOT NULL;
  PERFORM item.id
  FROM jsonb_to_recordset(p_lines) AS line(ffe_item_id uuid)
  JOIN public.project_ffe_items AS item
    ON item.id = line.ffe_item_id
   AND item.project_id = v_project.id
  WHERE line.ffe_item_id IS NOT NULL
  ORDER BY item.id
  FOR SHARE OF item;
  GET DIAGNOSTICS v_locked_refs = ROW_COUNT;
  IF v_locked_refs <> v_expected_refs THEN
    RAISE EXCEPTION 'invalid draft invoice payload'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(sum(
    round(line.quantity * line.unit_amount_cents)::integer
  ), 0)::integer
  INTO v_subtotal
  FROM jsonb_to_recordset(p_lines) AS line(
    quantity numeric,
    unit_amount_cents integer
  );
  v_tax := round(v_subtotal * p_tax_rate)::integer;

  INSERT INTO public.invoices (
    project_id, designer_id, client_id, studio_id, status, currency,
    subtotal_cents, tax_rate, tax_cents, total_cents,
    payment_terms_days, memo, internal_notes
  ) VALUES (
    v_project.id, v_project.designer_id, v_project.client_id,
    v_project.studio_id, 'draft', 'USD', v_subtotal, p_tax_rate,
    v_tax, v_subtotal + v_tax, p_payment_terms_days,
    NULLIF(p_memo, ''), NULLIF(p_internal_notes, '')
  )
  RETURNING * INTO v_invoice;

  INSERT INTO public.invoice_line_items (
    invoice_id, kind, milestone_id, ffe_item_id, description, quantity,
    unit_amount_cents, amount_cents, metadata, sort_order
  )
  SELECT
    v_invoice.id, line.kind, line.milestone_id, line.ffe_item_id,
    btrim(line.description), line.quantity, line.unit_amount_cents,
    round(line.quantity * line.unit_amount_cents)::integer,
    COALESCE(line.metadata, '{}'::jsonb), line.sort_order
  FROM jsonb_to_recordset(p_lines) AS line(
    kind text,
    milestone_id uuid,
    ffe_item_id uuid,
    description text,
    quantity numeric,
    unit_amount_cents integer,
    metadata jsonb,
    sort_order integer
  )
  ORDER BY line.sort_order;

  SELECT * INTO STRICT v_invoice
  FROM public.invoices AS invoice
  WHERE invoice.id = v_invoice.id;
  RETURN v_invoice;
END;
$$;

COMMENT ON FUNCTION public.create_draft_invoice(
  uuid, uuid, uuid, uuid, numeric, integer, text, text, jsonb
) IS
  'Atomic authenticated invoice-composer boundary. It locks the canonical project before authority rows, then locks distinct milestone latches for update and FF&E references for share in sorted order. It revalidates the expected active project/designer/client/studio tuple and exact-studio actor, bounds and allowlists line JSON, rejects foreign child references and reserved commercial anchors, and owns invoice identity, state, totals, timestamps, header insertion, and every initial line in one transaction.';

REVOKE ALL PRIVILEGES ON FUNCTION public.create_draft_invoice(
  uuid, uuid, uuid, uuid, numeric, integer, text, text, jsonb
)
FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
  agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION public.create_draft_invoice(
  uuid, uuid, uuid, uuid, numeric, integer, text, text, jsonb
) TO authenticated;

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
  v_project public.projects%ROWTYPE;
  v_proposal public.proposals%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
  v_document_id uuid;
  v_proposal_id uuid;
  v_anchor_count integer;
  v_line_count integer;
  v_subtotal bigint;
  v_tax integer;
  v_number integer;
  v_due date;
  v_studio_id uuid;
  -- plpgsql forbids a row variable in a multi-item INTO list, so the paired
  -- composites land in one record and are unpacked below.
  v_admitted record;
BEGIN
  -- Discover only an invoice whose canonical project tuple already admits the
  -- explicit actor; no foreign project or invoice row is locked on denial.
  SELECT invoice, project
  INTO v_admitted
  FROM public.invoices AS invoice
  JOIN public.projects AS project ON project.id = invoice.project_id
  WHERE invoice.id = p_invoice_id
    AND invoice.designer_id = project.designer_id
    AND invoice.client_id = project.client_id
    AND invoice.studio_id = project.studio_id
    AND p_actor_id IS NOT NULL
    AND (
      p_actor_id = invoice.client_id
      OR p_actor_id = project.designer_id
      OR EXISTS (
        SELECT 1
        FROM public.organization_members AS actor_membership
        WHERE actor_membership.organization_id = project.studio_id
          AND actor_membership.user_id = p_actor_id
          AND actor_membership.status = 'active'
          AND actor_membership.role <> 'guest'
      )
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'issue_invoice: invoice not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_invoice := v_admitted.invoice;
  v_project := v_admitted.project;

  SELECT project.* INTO v_project
  FROM public.projects AS project
  WHERE project.id = v_project.id
    AND project.designer_id = v_project.designer_id
    AND project.client_id = v_project.client_id
    AND project.studio_id = v_project.studio_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'issue_invoice: invoice not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM role.id
  FROM public.roles AS role
  WHERE role.domain = 'designer'
  ORDER BY role.id
  FOR SHARE;

  PERFORM user_role.id
  FROM public.user_roles AS user_role
  JOIN public.roles AS role ON role.id = user_role.role_id
  WHERE user_role.user_id = v_project.designer_id
    AND role.domain = 'designer'
  ORDER BY user_role.role_id, user_role.id
  FOR SHARE OF user_role;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'issue_invoice: invoice not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM membership.id
  FROM public.organization_members AS membership
  WHERE membership.organization_id = v_project.studio_id
    AND membership.user_id = ANY(ARRAY[
      v_project.designer_id, p_actor_id
    ]::uuid[])
  ORDER BY membership.user_id, membership.id
  FOR SHARE;

  PERFORM studio.id
  FROM public.organizations AS studio
  WHERE studio.id = v_project.studio_id
  ORDER BY studio.id
  FOR SHARE;

  SELECT invoice.* INTO v_invoice
  FROM public.invoices AS invoice
  WHERE invoice.id = p_invoice_id
    AND invoice.project_id = v_project.id
    AND invoice.designer_id = v_project.designer_id
    AND invoice.client_id = v_project.client_id
    AND invoice.studio_id = v_project.studio_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'issue_invoice: invoice not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM line.id
  FROM public.invoice_line_items AS line
  WHERE line.invoice_id = p_invoice_id
  ORDER BY line.id
  FOR SHARE;

  WITH anchors AS (
    SELECT DISTINCT document.id, document.proposal_id, document.document_kind
    FROM public.invoice_line_items AS line
    JOIN public.project_commercial_documents AS document
      ON (
        document.document_kind IN ('design_services', 'service_addendum')
        AND line.metadata->>'kind' = 'design_services_retainer'
        AND document.id::text =
              NULLIF(line.metadata->>'commercialDocumentId', '')
      )
      OR (
        document.document_kind = 'furnishings_authorization'
        AND document.id::text =
              NULLIF(line.metadata->>'commercialDocumentId', '')
      )
      OR (
        document.document_kind = 'trade_scope'
        AND document.id::text =
              NULLIF(line.metadata->>'tradeScopeDocumentId', '')
      )
    WHERE line.invoice_id = p_invoice_id
  )
  SELECT count(*) INTO v_anchor_count FROM anchors;

  IF v_anchor_count <> 1 THEN
    RAISE EXCEPTION
      'issue_invoice: invoice not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT document.id, document.proposal_id
  INTO v_document_id, v_proposal_id
  FROM public.project_commercial_documents AS document
  JOIN public.proposals AS proposal ON proposal.id = document.proposal_id
  JOIN public.designer_clients AS author_relationship
    ON author_relationship.id = proposal.designer_client_id
  WHERE EXISTS (
      SELECT 1
      FROM public.invoice_line_items AS line
      WHERE line.invoice_id = p_invoice_id
        AND (
          (
            document.document_kind IN (
              'design_services', 'service_addendum'
            )
            AND line.metadata->>'kind' = 'design_services_retainer'
            AND document.id::text =
                  NULLIF(line.metadata->>'commercialDocumentId', '')
          )
          OR (
            document.document_kind = 'furnishings_authorization'
            AND document.id::text =
                  NULLIF(line.metadata->>'commercialDocumentId', '')
          )
          OR (
            document.document_kind = 'trade_scope'
            AND document.id::text =
                  NULLIF(line.metadata->>'tradeScopeDocumentId', '')
          )
        )
    )
    AND document.project_id = v_project.id
    AND (
      proposal.project_id IS NULL
      OR proposal.project_id = v_project.id
    )
    AND proposal.document_kind = document.document_kind
    AND proposal.client_id = v_project.client_id
    AND author_relationship.designer_id = proposal.designer_id
    AND author_relationship.client_id = proposal.client_id
    AND v_invoice.project_id = v_project.id
    AND v_invoice.designer_id = v_project.designer_id
    AND v_invoice.client_id = proposal.client_id
    AND v_invoice.studio_id = v_project.studio_id;

  IF FOUND THEN
    SELECT document.* INTO v_document
    FROM public.project_commercial_documents AS document
    WHERE document.id = v_document_id
      AND document.project_id = v_project.id
    FOR UPDATE;

    SELECT proposal.* INTO v_proposal
    FROM public.proposals AS proposal
    WHERE proposal.id = v_proposal_id
      AND proposal.client_id = v_project.client_id
      AND (proposal.project_id IS NULL OR proposal.project_id = v_project.id)
      AND proposal.document_kind = v_document.document_kind
    FOR UPDATE;

    PERFORM author_relationship.id
    FROM public.designer_clients AS author_relationship
    WHERE author_relationship.id = v_proposal.designer_client_id
      AND author_relationship.designer_id = v_proposal.designer_id
      AND author_relationship.client_id = v_proposal.client_id
    FOR SHARE;
  END IF;

  IF NOT FOUND
     OR v_project.status <> 'active'
     OR NOT EXISTS (
       SELECT 1
       FROM public.organizations AS studio
       JOIN public.organization_members AS lead_membership
         ON lead_membership.organization_id = studio.id
       WHERE studio.id = v_project.studio_id
         AND studio.type = 'design_studio'
         AND studio.status = 'active'
         AND lead_membership.user_id = v_project.designer_id
         AND lead_membership.status = 'active'
         AND lead_membership.role <> 'guest'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.user_roles AS user_role
       JOIN public.roles AS role ON role.id = user_role.role_id
       WHERE user_role.user_id = v_project.designer_id
         AND role.domain = 'designer'
     )
     OR NOT (
       p_actor_id = v_proposal.client_id
       OR p_actor_id = v_project.designer_id
       OR EXISTS (
         SELECT 1
         FROM public.organization_members AS actor_membership
         WHERE actor_membership.organization_id = v_project.studio_id
           AND actor_membership.user_id = p_actor_id
           AND actor_membership.status = 'active'
           AND actor_membership.role <> 'guest'
       )
     )
  THEN
    RAISE EXCEPTION
      'issue_invoice: invoice not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
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

  v_studio_id := v_project.studio_id;
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

COMMENT ON FUNCTION app_private.issue_invoice_for_actor(uuid, date, uuid) IS
  'Owner-only invoice issuance core. Resolves exactly one design-retainer, furnishings, or trade commercial anchor from invoice-line metadata; locks and validates the exact invoice/project/document/client tuple, the current active non-guest project lead with a live designer-domain role, and immutable proposal-author relationship history (commercial proposals intentionally may retain NULL project_id); then accepts only the exact client or an active non-guest actor in that exact studio.';

REVOKE ALL PRIVILEGES ON FUNCTION
  app_private.issue_invoice_for_actor(uuid, date, uuid)
FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
  agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;

CREATE OR REPLACE FUNCTION public._countersign_design_services_agreement_impl(
  p_proposal_id uuid,
  p_signer_name text,
  p_disclosed_impact jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_proposal public.proposals%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_authority_studio_id uuid;
  v_client_signature public.commercial_document_signatures%ROWTYPE;
  v_studio_signature public.commercial_document_signatures%ROWTYPE;
  v_terms public.proposal_service_terms%ROWTYPE;
  v_fingerprint text;
  v_project_id uuid;
  v_document_id uuid;
  v_authority_id uuid;
  v_retainer_invoice_id uuid;
  v_authorized_cents bigint := 0;
  v_pending_entry record;
  v_newly_executed boolean := false;
  v_name text := btrim(COALESCE(p_signer_name, ''));
  v_previous_accept text := current_setting('app.proposal_accept_id', true);
  v_previous_commercial text := current_setting('app.commercial_document_id', true);
  v_anchor_phase_id uuid;   -- 00475
  -- plpgsql forbids a row variable in a multi-item INTO list, so the paired
  -- composites land in one record and are unpacked below.
  v_row_4180 record;
  v_row_4359 record;
BEGIN
  IF v_actor IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'studio countersign requires an authenticated signer and legal name'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT proposal.* INTO v_proposal
  FROM public.proposals AS proposal
  WHERE proposal.id = p_proposal_id
    AND proposal.client_id IS NOT NULL
    AND proposal.document_kind IN ('design_services', 'service_addendum')
    AND (
      EXISTS (
        SELECT 1
        FROM public.project_commercial_documents AS document
        JOIN public.projects AS project ON project.id = document.project_id
        JOIN public.organizations AS studio ON studio.id = project.studio_id
        JOIN public.organization_members AS actor_membership
          ON actor_membership.organization_id = project.studio_id
         AND actor_membership.user_id = v_actor
        JOIN public.organization_members AS lead_membership
          ON lead_membership.organization_id = project.studio_id
         AND lead_membership.user_id = project.designer_id
        JOIN public.user_roles AS user_role
          ON user_role.user_id = project.designer_id
        JOIN public.roles AS role ON role.id = user_role.role_id
        WHERE document.proposal_id = proposal.id
          AND document.document_kind = proposal.document_kind
          AND (proposal.project_id IS NULL OR proposal.project_id = project.id)
          AND project.client_id = proposal.client_id
          AND project.status = 'active'
          AND studio.type = 'design_studio'
          AND studio.status = 'active'
          AND actor_membership.status = 'active'
          AND actor_membership.role <> 'guest'
          AND lead_membership.status = 'active'
          AND lead_membership.role <> 'guest'
          AND role.domain = 'designer'
      )
      OR (
        proposal.document_kind = 'design_services'
        AND proposal.project_id IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.project_commercial_documents AS bound_document
          WHERE bound_document.proposal_id = proposal.id
        )
        AND EXISTS (
          SELECT 1
          FROM public.user_roles AS user_role
          JOIN public.roles AS role ON role.id = user_role.role_id
          WHERE user_role.user_id = proposal.designer_id
            AND role.domain = 'designer'
        )
        AND 1 = (
          SELECT count(DISTINCT studio.id)
          FROM public.organizations AS studio
          JOIN public.organization_members AS lead_membership
            ON lead_membership.organization_id = studio.id
           AND lead_membership.user_id = proposal.designer_id
          JOIN public.organization_members AS actor_membership
            ON actor_membership.organization_id = studio.id
           AND actor_membership.user_id = v_actor
          WHERE studio.type = 'design_studio'
            AND studio.status = 'active'
            AND lead_membership.status = 'active'
            AND lead_membership.role <> 'guest'
            AND actor_membership.status = 'active'
            AND actor_membership.role <> 'guest'
        )
      )
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'design services agreement % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT document.id, document.project_id, project
  INTO v_row_4180
  FROM public.project_commercial_documents AS document
  JOIN public.projects AS project ON project.id = document.project_id
  JOIN public.organizations AS studio ON studio.id = project.studio_id
  JOIN public.organization_members AS actor_membership
    ON actor_membership.organization_id = project.studio_id
   AND actor_membership.user_id = v_actor
  JOIN public.organization_members AS lead_membership
    ON lead_membership.organization_id = project.studio_id
   AND lead_membership.user_id = project.designer_id
  WHERE document.proposal_id = p_proposal_id
    AND document.document_kind = v_proposal.document_kind
    AND (v_proposal.project_id IS NULL OR v_proposal.project_id = project.id)
    AND project.client_id = v_proposal.client_id
    AND project.status = 'active'
    AND studio.type = 'design_studio'
    AND studio.status = 'active'
    AND actor_membership.status = 'active'
    AND actor_membership.role <> 'guest'
    AND lead_membership.status = 'active'
    AND lead_membership.role <> 'guest';

  v_document_id := v_row_4180.id;
  v_project_id := v_row_4180.project_id;
  v_project := v_row_4180.project;

  IF FOUND THEN
    SELECT project.* INTO v_project
    FROM public.projects AS project
    WHERE project.id = v_project_id
      AND project.client_id = v_proposal.client_id
      AND project.designer_id = v_project.designer_id
      AND project.studio_id = v_project.studio_id
      AND project.status = 'active'
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'design services agreement % not found or access denied', p_proposal_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_authority_studio_id := v_project.studio_id;
  ELSE
    SELECT (array_agg(DISTINCT studio.id ORDER BY studio.id))[1]
    INTO v_authority_studio_id
    FROM public.organizations AS studio
    JOIN public.organization_members AS lead_membership
      ON lead_membership.organization_id = studio.id
     AND lead_membership.user_id = v_proposal.designer_id
    JOIN public.organization_members AS actor_membership
      ON actor_membership.organization_id = studio.id
     AND actor_membership.user_id = v_actor
    WHERE studio.type = 'design_studio'
      AND studio.status = 'active'
      AND lead_membership.status = 'active'
      AND lead_membership.role <> 'guest'
      AND actor_membership.status = 'active'
      AND actor_membership.role <> 'guest';
  END IF;

  SELECT proposal.* INTO v_proposal
  FROM public.proposals AS proposal
  WHERE proposal.id = p_proposal_id
    AND proposal.client_id IS NOT NULL
    AND proposal.document_kind IN ('design_services', 'service_addendum')
    AND (
      v_project_id IS NULL
      OR proposal.project_id IS NULL
      OR proposal.project_id = v_project_id
    )
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'design services agreement % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_document_id IS NOT NULL THEN
    PERFORM document.id
    FROM public.project_commercial_documents AS document
    WHERE document.id = v_document_id
      AND document.proposal_id = v_proposal.id
      AND document.project_id = v_project_id
      AND document.document_kind = v_proposal.document_kind
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'design services agreement % not found or access denied', p_proposal_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  PERFORM role.id
  FROM public.roles AS role
  WHERE role.domain = 'designer'
  ORDER BY role.id
  FOR SHARE;

  PERFORM user_role.id
  FROM public.user_roles AS user_role
  JOIN public.roles AS role ON role.id = user_role.role_id
  WHERE user_role.user_id = COALESCE(v_project.designer_id, v_proposal.designer_id)
    AND role.domain = 'designer'
  ORDER BY user_role.role_id, user_role.id
  FOR SHARE OF user_role;
  IF v_authority_studio_id IS NULL OR NOT FOUND THEN
    RAISE EXCEPTION 'design services agreement % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM membership.id
  FROM public.organization_members AS membership
  WHERE membership.organization_id = v_authority_studio_id
    AND membership.user_id = ANY(ARRAY[
      COALESCE(v_project.designer_id, v_proposal.designer_id), v_actor
    ]::uuid[])
  ORDER BY membership.user_id, membership.id
  FOR SHARE;

  PERFORM studio.id
  FROM public.organizations AS studio
  WHERE studio.id = v_authority_studio_id
  ORDER BY studio.id
  FOR SHARE;

  IF NOT EXISTS (
       SELECT 1 FROM public.organizations AS studio
       WHERE studio.id = v_authority_studio_id
         AND studio.type = 'design_studio'
         AND studio.status = 'active'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.organization_members AS membership
       WHERE membership.organization_id = v_authority_studio_id
         AND membership.user_id = COALESCE(
           v_project.designer_id, v_proposal.designer_id
         )
         AND membership.status = 'active'
         AND membership.role <> 'guest'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.organization_members AS membership
       WHERE membership.organization_id = v_authority_studio_id
         AND membership.user_id = v_actor
         AND membership.status = 'active'
         AND membership.role <> 'guest'
     )
     OR (
       v_project_id IS NULL
       AND 1 <> (
         SELECT count(DISTINCT membership.organization_id)
         FROM public.organization_members AS membership
         JOIN public.organizations AS studio
           ON studio.id = membership.organization_id
         WHERE membership.user_id = v_proposal.designer_id
           AND membership.status = 'active'
           AND membership.role <> 'guest'
           AND studio.type = 'design_studio'
           AND studio.status = 'active'
       )
     )
  THEN
    RAISE EXCEPTION 'design services agreement % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_client_signature FROM public.commercial_document_signatures
  WHERE proposal_id = p_proposal_id AND party_role = 'client' FOR SHARE;
  v_fingerprint := public._commercial_document_fingerprint(p_proposal_id);
  IF v_client_signature.id IS NULL
     OR v_client_signature.signer_user_id IS DISTINCT FROM v_proposal.client_id
     OR v_client_signature.evidence_fingerprint IS DISTINCT FROM v_fingerprint
  THEN
    RAISE EXCEPTION 'studio countersign requires the exact current client consent fingerprint'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_proposal.commercial_state = 'executed' THEN
    SELECT document.id AS document_id, document.project_id AS project_id,
           authority.id AS authority_id,
           authority.retainer_invoice_id AS retainer_invoice_id,
           project AS project_row
    INTO v_row_4359
    FROM public.project_commercial_documents AS document
    JOIN public.projects AS project ON project.id = document.project_id
    JOIN public.project_billing_authorities AS authority
      ON authority.commercial_document_id = document.id
    WHERE document.proposal_id = p_proposal_id;

    v_document_id := v_row_4359.document_id;
    v_project_id := v_row_4359.project_id;
    v_authority_id := v_row_4359.authority_id;
    v_retainer_invoice_id := v_row_4359.retainer_invoice_id;
    v_project := v_row_4359.project_row;

    SELECT * INTO v_studio_signature FROM public.commercial_document_signatures
    WHERE proposal_id = p_proposal_id AND party_role = 'studio';
    IF v_document_id IS NULL OR v_studio_signature.id IS NULL
       OR v_studio_signature.evidence_fingerprint IS DISTINCT FROM v_fingerprint
    THEN
      RAISE EXCEPTION 'executed agreement has incomplete authority topology'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF v_proposal.commercial_state = 'client_signed' THEN
    IF EXISTS (SELECT 1 FROM public.proposal_items i WHERE i.proposal_id = p_proposal_id) THEN
      RAISE EXCEPTION 'design services agreement must not carry furnishing items'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO STRICT v_terms FROM public.proposal_service_terms
    WHERE proposal_id = p_proposal_id;

    INSERT INTO public.commercial_document_signatures (
      proposal_id, party_role, signer_user_id, signed_name,
      evidence_fingerprint, metadata
    ) VALUES (
      p_proposal_id, 'studio', v_actor, v_name, v_fingerprint,
      jsonb_build_object('via', 'countersign_design_services_agreement')
    ) RETURNING * INTO v_studio_signature;

    PERFORM set_config('app.proposal_accept_id', p_proposal_id::text, true);
    PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
    UPDATE public.proposals SET
      status = 'accepted', commercial_state = 'executed',
      signed_at = v_client_signature.signed_at,
      signed_by_name = v_client_signature.signed_name,
      -- 00414: signed_ip is NOT mirrored onto proposals (see the execution
      -- rail above and the column grant at the foot of this file). The
      -- client signature row keeps the IP; public.proposals does not.
      accepted_at = v_studio_signature.signed_at,
      updated_at = now()
    WHERE id = p_proposal_id;

    IF v_proposal.document_kind = 'design_services' THEN
      -- Current private bridge is the 00398 wrapper around the long-lived
      -- 00331 implementation. It preserves every project/proposal guard.
      v_project_id := public._activate_proposal_as_project_authorized(
        p_proposal_id, current_date
      );
      SELECT project.* INTO STRICT v_project
      FROM public.projects AS project
      WHERE project.id = v_project_id
      FOR SHARE;
      INSERT INTO public.project_commercial_documents (
        project_id, proposal_id, document_kind, is_origin, executed_at, created_by
      ) VALUES (
        v_project_id, p_proposal_id, 'design_services', true,
        v_studio_signature.signed_at, v_actor
      ) RETURNING id INTO v_document_id;

      -- 00475 (R109 ceremony class): execution IS the engagement start.
      -- Anchors the first main-lane phase to the day authority took effect.
      -- Only the origin agreement anchors — an addendum re-executes billing
      -- authority, not the engagement.
      v_anchor_phase_id := public._schedule_engagement_start_phase(v_project_id);
      IF v_anchor_phase_id IS NOT NULL THEN
        PERFORM public._commit_schedule_edit_authorized(
          v_project_id,
          jsonb_build_array(jsonb_build_object(
            'kind', 'phase-anchor',
            'phase_id', v_anchor_phase_id,
            'anchor_date', to_char(current_date, 'YYYY-MM-DD'),
            'source_ref', p_proposal_id
          )),
          'Design services agreement executed',
          p_disclosed_impact,
          'ceremony:design-services-executed'
        );
      END IF;
    ELSE
      SELECT document.id, document.project_id
      INTO v_document_id, v_project_id
      FROM public.project_commercial_documents AS document
      WHERE document.proposal_id = p_proposal_id
        AND document.document_kind = 'service_addendum';
      SELECT project.* INTO v_project
      FROM public.projects AS project
      WHERE project.id = v_project_id
      FOR UPDATE;
      PERFORM document.id
      FROM public.project_commercial_documents AS document
      WHERE document.id = v_document_id
        AND document.project_id = v_project_id
      FOR UPDATE;
      IF v_document_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.project_commercial_documents origin
        JOIN public.proposals origin_proposal ON origin_proposal.id = origin.proposal_id
        WHERE origin.project_id = v_project_id AND origin.is_origin
          AND origin_proposal.commercial_state = 'executed'
      ) THEN
        RAISE EXCEPTION 'service addendum has no executed project origin'
          USING ERRCODE = 'check_violation';
      END IF;
      -- Different addenda lock different proposal rows. Serialize their
      -- authority replacement on the shared project before ending/inserting
      -- the one active authority enforced by the partial unique index.
      PERFORM 1 FROM public.projects
      WHERE id = v_project_id
      FOR UPDATE;
      UPDATE public.project_commercial_documents
      SET executed_at = v_studio_signature.signed_at
      WHERE id = v_document_id;
      UPDATE public.project_billing_authorities
      SET status = 'superseded', ended_at = v_studio_signature.signed_at
      WHERE project_id = v_project_id AND status = 'active';
    END IF;

    IF v_terms.retainer_amount_cents > 0 THEN
      INSERT INTO public.invoices (
        project_id, designer_id, client_id, status, currency,
        subtotal_cents, tax_rate, tax_cents, total_cents, memo
      ) VALUES (
        v_project_id, v_project.designer_id, v_proposal.client_id, 'draft', 'USD',
        v_terms.retainer_amount_cents, 0, 0, v_terms.retainer_amount_cents,
        'Design services retainer · ' || v_proposal.title
      ) RETURNING id INTO v_retainer_invoice_id;
      INSERT INTO public.invoice_line_items (
        invoice_id, kind, description, quantity, unit_amount_cents,
        amount_cents, metadata
      ) VALUES (
        v_retainer_invoice_id, 'adhoc', 'Design services retainer', 1,
        v_terms.retainer_amount_cents, v_terms.retainer_amount_cents,
        jsonb_build_object('commercialDocumentId', v_document_id, 'kind', 'design_services_retainer')
      );
      PERFORM app_private.issue_invoice_for_actor(
        v_retainer_invoice_id, current_date, v_actor
      );
    END IF;

    INSERT INTO public.project_billing_authorities (
      project_id, commercial_document_id, source_proposal_id,
      billing_ceiling_cents, retainer_amount_cents, retainer_activation_policy,
      billing_cadence, retainer_invoice_id, effective_at
    ) VALUES (
      v_project_id, v_document_id, p_proposal_id,
      v_terms.billing_ceiling_cents, v_terms.retainer_amount_cents,
      v_terms.retainer_activation_policy, v_terms.billing_cadence, v_retainer_invoice_id,
      v_studio_signature.signed_at
    ) RETURNING id INTO v_authority_id;

    INSERT INTO public.project_billing_authority_rates (
      billing_authority_id, source_rate_id, version, role_name, hourly_rate_cents
    ) SELECT v_authority_id, r.id, r.version, r.role_name, r.hourly_rate_cents
      FROM public.proposal_service_rates r
      WHERE r.proposal_id = p_proposal_id
      ORDER BY r.version, r.sort_order, r.role_name;

    IF v_proposal.document_kind = 'service_addendum' THEN
      SELECT COALESCE(sum(entry.rated_amount_cents), 0)
      INTO v_authorized_cents
      FROM public.project_time_entries entry
      WHERE entry.project_id = v_project_id
        AND entry.billing_state = 'authorized'
        AND entry.billable AND entry.duration_minutes IS NOT NULL;

      -- A replacement ceiling is cumulative across the project. Promote only
      -- the oldest already-rated pending work that now fits; its historical
      -- authority/rate/amount snapshots never change.
      FOR v_pending_entry IN
        SELECT entry.id, entry.rated_amount_cents
        FROM public.project_time_entries entry
        JOIN public.project_billing_authorities prior_authority
          ON prior_authority.id = entry.billing_authority_id
        WHERE entry.project_id = v_project_id
          AND entry.billing_state = 'pending_authorization'
          AND entry.billable AND entry.duration_minutes IS NOT NULL
          AND entry.rated_amount_cents IS NOT NULL
          AND entry.authority_rate_id IS NOT NULL
          AND entry.billing_authority_id <> v_authority_id
          AND (
            prior_authority.retainer_activation_policy = 'immediate'
            OR prior_authority.retainer_amount_cents = 0
            OR EXISTS (
              SELECT 1 FROM public.invoices paid_retainer
              WHERE paid_retainer.id = prior_authority.retainer_invoice_id
                AND paid_retainer.status = 'paid'
                AND paid_retainer.amount_paid_cents >= paid_retainer.total_cents
            )
          )
        ORDER BY entry.started_at, entry.id
        FOR UPDATE OF entry
      LOOP
        IF v_authorized_cents + v_pending_entry.rated_amount_cents
           <= v_terms.billing_ceiling_cents THEN
          UPDATE public.project_time_entries
          SET billing_state = 'authorized', updated_at = now()
          WHERE id = v_pending_entry.id;
          v_authorized_cents := v_authorized_cents + v_pending_entry.rated_amount_cents;
        END IF;
      END LOOP;
    END IF;

    PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
    PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
    v_newly_executed := true;
  ELSE
    RAISE EXCEPTION 'design services agreement % is not ready to countersign (%)',
      p_proposal_id, COALESCE(v_proposal.commercial_state, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'agreementId', p_proposal_id,
    'proposalId', p_proposal_id,
    'commercialState', 'executed',
    'projectId', v_project_id,
    'billingAuthorityId', v_authority_id,
    'retainerInvoiceId', v_retainer_invoice_id,
    'newlyExecuted', v_newly_executed
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  RAISE;
END;
$$;

COMMENT ON FUNCTION public._countersign_design_services_agreement_impl(
  uuid, text, jsonb
) IS
  'Owner-only countersign core. It preserves immutable proposal authorship, binds addenda to their exact active project/studio/current live designer lead, requires an unbound origin agreement to resolve exactly one active design studio, and issues any retainer through the explicit-actor relational core using the locked current project lead without rewriting JWT claims.';

REVOKE ALL PRIVILEGES ON FUNCTION
  public._countersign_design_services_agreement_impl(uuid, text, jsonb)
FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
  agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;

CREATE OR REPLACE FUNCTION public._execute_furnishings_authorization_on_paper_authorized(
  p_proposal_id uuid,
  p_signed_name text,
  p_paper_signed_on date,
  p_recorded_by uuid,
  p_scan_document_id uuid DEFAULT NULL,
  p_disclosed_impact jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  -- 00425 DELTA 1 (actor). v_actor is the SIGNER everywhere below, and the
  -- signer is still the client — they are the one who signed, on paper. It is
  -- resolved from the row rather than passed in, because the caller is the
  -- studio. v_recorder is who is doing the recording.
  v_actor uuid;
  v_recorder uuid := p_recorded_by;
  v_proposal public.proposals%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_signature public.commercial_document_signatures%ROWTYPE;
  v_name text := btrim(COALESCE(p_signed_name, ''));
  v_fingerprint text;
  v_deposit_cents integer;
  v_deposit_invoice_id uuid;
  v_applied_ids uuid[] := '{}'::uuid[];
  v_linked_ids uuid[] := '{}'::uuid[];
  v_newly boolean := false;
  v_previous_accept text := current_setting('app.proposal_accept_id', true);
  v_previous_commercial text := current_setting('app.commercial_document_id', true);
  v_anchor_phase_id uuid;   -- 00475
  -- plpgsql forbids a row variable in a multi-item INTO list, so the paired
  -- composites land in one record and are unpacked below.
  v_row_4630 record;
BEGIN
  IF v_recorder IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'recording a paper furnishings execution requires an authenticated studio author and legal name'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT proposal, document, project
  INTO v_row_4630
  FROM public.proposals AS proposal
  JOIN public.project_commercial_documents AS document
    ON document.proposal_id = proposal.id
   AND document.document_kind = 'furnishings_authorization'
  JOIN public.projects AS project ON project.id = document.project_id
  JOIN public.designer_clients AS relationship
    ON relationship.id = proposal.designer_client_id
  JOIN public.organizations AS studio ON studio.id = project.studio_id
  JOIN public.organization_members AS recorder_membership
    ON recorder_membership.organization_id = project.studio_id
   AND recorder_membership.user_id = v_recorder
  JOIN public.organization_members AS lead_membership
    ON lead_membership.organization_id = project.studio_id
   AND lead_membership.user_id = project.designer_id
  WHERE proposal.id = p_proposal_id
    AND proposal.client_id IS NOT NULL
    AND proposal.document_kind = 'furnishings_authorization'
    AND (proposal.project_id IS NULL OR proposal.project_id = project.id)
    AND relationship.designer_id = proposal.designer_id
    AND relationship.client_id = proposal.client_id
    AND project.client_id = proposal.client_id
    AND project.status = 'active'
    AND studio.type = 'design_studio'
    AND studio.status = 'active'
    AND recorder_membership.status = 'active'
    AND recorder_membership.role <> 'guest'
    AND lead_membership.status = 'active'
    AND lead_membership.role <> 'guest';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_proposal := v_row_4630.proposal;
  v_document := v_row_4630.document;
  v_project := v_row_4630.project;

  SELECT project.* INTO v_project
  FROM public.projects AS project
  WHERE project.id = v_document.project_id
    AND project.client_id = v_proposal.client_id
    AND project.designer_id = v_project.designer_id
    AND project.studio_id = v_project.studio_id
    AND project.status = 'active'
  FOR UPDATE;

  PERFORM role.id
  FROM public.roles AS role
  WHERE role.domain = 'designer'
  ORDER BY role.id
  FOR SHARE;

  PERFORM user_role.id
  FROM public.user_roles AS user_role
  JOIN public.roles AS role ON role.id = user_role.role_id
  WHERE user_role.user_id = v_project.designer_id
    AND role.domain = 'designer'
  ORDER BY user_role.role_id, user_role.id
  FOR SHARE OF user_role;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM membership.id
  FROM public.organization_members AS membership
  WHERE membership.organization_id = v_project.studio_id
    AND membership.user_id = ANY(ARRAY[
      v_project.designer_id, v_recorder
    ]::uuid[])
  ORDER BY membership.user_id, membership.id
  FOR SHARE;

  PERFORM studio.id
  FROM public.organizations AS studio
  WHERE studio.id = v_project.studio_id
  ORDER BY studio.id
  FOR SHARE;

  IF NOT EXISTS (
       SELECT 1 FROM public.organizations AS studio
       WHERE studio.id = v_project.studio_id
         AND studio.type = 'design_studio'
         AND studio.status = 'active'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.organization_members AS membership
       WHERE membership.organization_id = v_project.studio_id
         AND membership.user_id = v_project.designer_id
         AND membership.status = 'active'
         AND membership.role <> 'guest'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.organization_members AS membership
       WHERE membership.organization_id = v_project.studio_id
         AND membership.user_id = v_recorder
         AND membership.status = 'active'
         AND membership.role <> 'guest'
     )
  THEN
    RAISE EXCEPTION 'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT proposal.* INTO v_proposal
  FROM public.proposals AS proposal
  WHERE proposal.id = p_proposal_id
    AND proposal.document_kind = 'furnishings_authorization'
    AND proposal.client_id = v_project.client_id
    AND (proposal.project_id IS NULL OR proposal.project_id = v_project.id)
  FOR UPDATE;

  SELECT document.* INTO v_document
  FROM public.project_commercial_documents AS document
  WHERE document.id = v_document.id
    AND document.proposal_id = v_proposal.id
    AND document.project_id = v_project.id
    AND document.document_kind = 'furnishings_authorization'
  FOR UPDATE;

  PERFORM relationship.id
  FROM public.designer_clients AS relationship
  WHERE relationship.id = v_proposal.designer_client_id
    AND relationship.designer_id = v_proposal.designer_id
    AND relationship.client_id = v_proposal.client_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_actor := v_proposal.client_id;
  -- 00425 DELTA 4 (expiry). The client rail refuses an expired authorization
  -- here, because in the portal the link IS the offer. The paper rail does not:
  -- the client already signed, on the date the record carries, and a lapsed
  -- link is not a reason to throw that away. record_paper_client_signature and
  -- record_offline_signature (00399) have never had this guard either.
  IF NOT EXISTS (
    SELECT 1 FROM public.project_budget_checkpoints c
    WHERE c.id = v_document.budget_checkpoint_id
      AND c.project_id = v_document.project_id
      AND c.status IN ('acknowledged', 'overridden')
      AND c.snapshot_fingerprint = public._budget_version_fingerprint(c.budget_version_id)
  ) THEN
    RAISE EXCEPTION 'furnishings authorization checkpoint is missing or invalid'
      USING ERRCODE = 'check_violation';
  END IF;
  -- 00414: defense in depth. create_furnishings_authorization proved the
  -- executed design-services origin when the wave was minted; re-assert it at
  -- the moment authority is actually exercised, so a wave in flight cannot
  -- outlive the origin that authorized it. Applies to the executed retry too:
  -- the retry path re-derives applied item ids and must not answer for a
  -- project whose origin has been unbound.
  IF NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    JOIN public.proposals p ON p.id = d.proposal_id
    WHERE d.project_id = v_document.project_id AND d.is_origin
      AND d.document_kind = 'design_services' AND p.commercial_state = 'executed'
  ) THEN
    RAISE EXCEPTION 'project % has no executed design-services origin', v_document.project_id
      USING ERRCODE = 'check_violation';
  END IF;
  v_fingerprint := public._commercial_document_fingerprint(p_proposal_id);
  v_deposit_cents := round(
    COALESCE(v_proposal.total_amount, 0)::numeric
    * COALESCE(v_proposal.deposit_percent, 0)::numeric / 100
  )::integer;
  SELECT * INTO v_signature FROM public.commercial_document_signatures
  WHERE proposal_id = p_proposal_id AND party_role = 'client' FOR UPDATE;

  IF v_proposal.commercial_state = 'executed' THEN
    IF v_signature.id IS NULL OR v_signature.signer_user_id IS DISTINCT FROM v_actor
       OR v_signature.signed_name IS DISTINCT FROM v_name
       OR v_signature.evidence_fingerprint IS DISTINCT FROM v_fingerprint
    THEN
      RAISE EXCEPTION 'furnishings signature retry conflicts with immutable evidence'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT COALESCE(array_agg(i.id ORDER BY i.id), '{}'::uuid[]) INTO v_applied_ids
    FROM public.project_ffe_items i
    WHERE i.source_commercial_document_id = v_document.id;
  ELSIF v_proposal.commercial_state = 'sent' THEN
    IF v_signature.id IS NOT NULL THEN
      RAISE EXCEPTION 'furnishings signature topology conflicts with document state'
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.commercial_document_signatures (
      proposal_id, party_role, signer_user_id, signed_name, signed_ip,
      evidence_fingerprint, metadata
    ) VALUES (
      p_proposal_id, 'client', v_actor, v_name,
      -- 00425 DELTA 2 (signed_ip) and DELTA 3 (metadata). No IP, because no
      -- browser: the paper tell. The metadata builder validates the paper date
      -- and the scan pointer before it returns.
      NULL, v_fingerprint,
      public._paper_signature_metadata(
        p_proposal_id, 'execute_furnishings_authorization_on_paper',
        p_paper_signed_on, v_recorder, p_scan_document_id
      )
    ) RETURNING * INTO v_signature;

    PERFORM set_config('app.proposal_accept_id', p_proposal_id::text, true);
    PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
    -- 00414: signed_ip is NOT mirrored onto proposals. The column grant on
    -- commercial_document_signatures takes the signing IP away from studio
    -- readers; mirroring it onto public.proposals — which stays fully
    -- SELECT-granted to authenticated and row-visible to every design-studio
    -- co-member (00401 proposals_design_studio_select) — would hand the same
    -- value back one table over. The signature row is the evidence of record.
    UPDATE public.proposals SET
      status = 'accepted', commercial_state = 'executed',
      signed_at = v_signature.signed_at, signed_by_name = v_name,
      accepted_at = v_signature.signed_at, updated_at = now()
    WHERE id = p_proposal_id;

    -- (a) Legacy provenance: a proposal-sourced snapshot still MINTS its line.
    WITH inserted AS (
      INSERT INTO public.project_ffe_items (
        project_id, source_proposal_item_id, product_id, name, ffe_category,
        item_type, status, quantity, unit_price_cents, trade_price_cents,
        markup_percent, line_total_cents, vendor_id, vendor_name, sort_order,
        source_commercial_document_id, source_authorization_item_id, custom_fields
      ) SELECT
        v_document.project_id, a.source_proposal_item_id, a.product_id, a.name,
        a.category, a.item_type, 'approved', a.quantity,
        a.client_unit_price_cents, a.trade_unit_cost_cents, a.markup_percent,
        a.client_line_total_cents, a.vendor_id, a.vendor_name, a.sort_order,
        v_document.id, a.id, COALESCE(a.snapshot->'customFields', '{}'::jsonb)
      FROM public.furnishing_authorization_items a
      WHERE a.commercial_document_id = v_document.id
        AND a.source_proposal_item_id IS NOT NULL
      ORDER BY a.sort_order, a.id
      RETURNING id
    ) SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[]) INTO v_applied_ids
      FROM inserted;

    -- (b) 00422 provenance: a schedule-sourced snapshot LINKS the line it froze.
    -- The status ratchet uses the 00184 rank helper so a line already further
    -- along (ordered, shipped…) is never dragged back to 'approved'.
    WITH linked AS (
      UPDATE public.project_ffe_items i SET
        source_commercial_document_id = v_document.id,
        source_authorization_item_id = a.id,
        status = CASE
          WHEN public.ffe_status_rank(i.status) < public.ffe_status_rank('approved')
            THEN 'approved' ELSE i.status END,
        updated_at = now()
      FROM public.furnishing_authorization_items a
      WHERE a.commercial_document_id = v_document.id
        AND a.source_ffe_item_id IS NOT NULL
        AND i.id = a.source_ffe_item_id
      RETURNING i.id
    ) SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[]) INTO v_linked_ids
      FROM linked;
    -- Sorted, not concatenated: the executed-retry branch above re-derives this
    -- list with array_agg(... ORDER BY i.id), so a caller comparing a first
    -- execution against its own retry must see the same order, not two
    -- provenance groups in insertion order.
    SELECT COALESCE(array_agg(applied ORDER BY applied), '{}'::uuid[])
    INTO v_applied_ids
    FROM unnest(v_applied_ids || v_linked_ids) AS applied;

    IF v_deposit_cents > 0 THEN
      INSERT INTO public.invoices (
        project_id, designer_id, client_id, status, currency,
        subtotal_cents, tax_rate, tax_cents, total_cents, memo
      ) VALUES (
        v_document.project_id, v_project.designer_id, v_proposal.client_id,
        'draft', 'USD', v_deposit_cents, 0, 0, v_deposit_cents,
        'Furnishings deposit · ' || v_document.wave_name
      ) RETURNING id INTO v_deposit_invoice_id;
      INSERT INTO public.invoice_line_items (
        invoice_id, kind, description, quantity, unit_amount_cents,
        amount_cents, metadata
      ) VALUES (
        v_deposit_invoice_id, 'adhoc', 'Furnishings authorization deposit', 1,
        v_deposit_cents, v_deposit_cents,
        jsonb_build_object('commercialDocumentId', v_document.id, 'kind', 'furnishings_deposit')
      );
      PERFORM app_private.issue_invoice_for_actor(
        v_deposit_invoice_id, current_date, v_recorder
      );
    END IF;
    UPDATE public.project_commercial_documents SET
      executed_at = v_signature.signed_at,
      deposit_invoice_id = v_deposit_invoice_id
    WHERE id = v_document.id;

    -- 00475 (R109 ceremony class): the studio records this act, so the sheet
    -- states the impact and the anchor hardens. The date is the day the client
    -- signed the paper original, not the day it was recorded. A NULL impact
    -- still downgrades to a proposal (R110).
    v_anchor_phase_id := public._schedule_thread_phase(v_document.project_id);
    IF v_anchor_phase_id IS NOT NULL THEN
      PERFORM public._commit_schedule_edit_authorized(
        v_document.project_id,
        jsonb_build_array(jsonb_build_object(
          'kind', 'phase-anchor',
          'phase_id', v_anchor_phase_id,
          'anchor_date', to_char(
            COALESCE(p_paper_signed_on, v_signature.signed_at::date), 'YYYY-MM-DD'),
          'source_ref', p_proposal_id
        )),
        'Furnishings authorization executed',
        p_disclosed_impact,
        'ceremony:furnishings-authorization-executed'
      );
    END IF;

    PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
    PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
    v_newly := true;
  ELSE
    RAISE EXCEPTION 'furnishings authorization % is not executable from %',
      p_proposal_id, COALESCE(v_proposal.commercial_state, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'projectId', v_document.project_id,
    'documentId', v_document.id,
    'checkpointId', v_document.budget_checkpoint_id,
    'appliedItemIds', to_jsonb(v_applied_ids),
    'depositInvoiceId', COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id),
    'depositRequiredCents', COALESCE((SELECT i.total_cents
      FROM public.invoices i
      WHERE i.id = COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)), v_deposit_cents),
    'deposit_required_cents', COALESCE((SELECT i.total_cents
      FROM public.invoices i
      WHERE i.id = COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)), v_deposit_cents),
    'depositPaidCents', COALESCE((SELECT i.amount_paid_cents
      FROM public.invoices i
      WHERE i.id = COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)), 0),
    'deposit_paid_cents', COALESCE((SELECT i.amount_paid_cents
      FROM public.invoices i
      WHERE i.id = COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)), 0),
    'newlyExecuted', v_newly
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  RAISE;
END;
$$;

COMMENT ON FUNCTION public._execute_furnishings_authorization_on_paper_authorized(
  uuid, text, date, uuid, uuid, jsonb
) IS
  'Owner-only paper furnishings core. It binds the recorder, historical proposal author, exact active document project/studio, and current live designer lead before any legal-state mutation; deposit issuance uses the current lead and explicit real recorder without rewriting JWT claims.';

REVOKE ALL PRIVILEGES ON FUNCTION
  public._execute_furnishings_authorization_on_paper_authorized(
    uuid, text, date, uuid, uuid, jsonb
  )
FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
  agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;

CREATE OR REPLACE FUNCTION public._execute_trade_scope_on_paper_authorized(
  p_proposal_id uuid,
  p_signed_name text,
  p_paper_signed_on date,
  p_recorded_by uuid,
  p_scan_document_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  -- 00425 DELTA 1 (actor). v_actor is the SIGNER everywhere below, and the
  -- signer is still the client — they are the one who signed, on paper. It is
  -- resolved from the row rather than passed in, because the caller is the
  -- studio. v_recorder is who is doing the recording.
  v_actor uuid;
  v_recorder uuid := p_recorded_by;
  v_proposal public.proposals%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_signature public.commercial_document_signatures%ROWTYPE;
  v_terms public.trade_scope_terms%ROWTYPE;
  v_draw public.trade_scope_draws%ROWTYPE;
  v_name text := btrim(COALESCE(p_signed_name, ''));
  v_fingerprint text;
  v_deposit_invoice_id uuid;
  v_newly boolean := false;
  v_previous_accept text := current_setting('app.proposal_accept_id', true);
  v_previous_commercial text := current_setting('app.commercial_document_id', true);
  v_previous_draw text := current_setting('app.trade_draw_invoice_id', true);
  -- plpgsql forbids a row variable in a multi-item INTO list, so the paired
  -- composites land in one record and are unpacked below.
  v_row_5021 record;
BEGIN
  IF v_recorder IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'recording a paper trade scope execution requires an authenticated studio author and legal name'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT proposal, document, project
  INTO v_row_5021
  FROM public.proposals AS proposal
  JOIN public.project_commercial_documents AS document
    ON document.proposal_id = proposal.id
   AND document.document_kind = 'trade_scope'
  JOIN public.projects AS project ON project.id = document.project_id
  JOIN public.designer_clients AS relationship
    ON relationship.id = proposal.designer_client_id
  JOIN public.organizations AS studio ON studio.id = project.studio_id
  JOIN public.organization_members AS recorder_membership
    ON recorder_membership.organization_id = project.studio_id
   AND recorder_membership.user_id = v_recorder
  JOIN public.organization_members AS lead_membership
    ON lead_membership.organization_id = project.studio_id
   AND lead_membership.user_id = project.designer_id
  WHERE proposal.id = p_proposal_id
    AND proposal.client_id IS NOT NULL
    AND proposal.document_kind = 'trade_scope'
    AND (proposal.project_id IS NULL OR proposal.project_id = project.id)
    AND relationship.designer_id = proposal.designer_id
    AND relationship.client_id = proposal.client_id
    AND project.client_id = proposal.client_id
    AND project.status = 'active'
    AND studio.type = 'design_studio'
    AND studio.status = 'active'
    AND recorder_membership.status = 'active'
    AND recorder_membership.role <> 'guest'
    AND lead_membership.status = 'active'
    AND lead_membership.role <> 'guest';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trade scope % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_proposal := v_row_5021.proposal;
  v_document := v_row_5021.document;
  v_project := v_row_5021.project;

  SELECT project.* INTO v_project
  FROM public.projects AS project
  WHERE project.id = v_document.project_id
    AND project.client_id = v_proposal.client_id
    AND project.designer_id = v_project.designer_id
    AND project.studio_id = v_project.studio_id
    AND project.status = 'active'
  FOR UPDATE;

  PERFORM role.id
  FROM public.roles AS role
  WHERE role.domain = 'designer'
  ORDER BY role.id
  FOR SHARE;

  PERFORM user_role.id
  FROM public.user_roles AS user_role
  JOIN public.roles AS role ON role.id = user_role.role_id
  WHERE user_role.user_id = v_project.designer_id
    AND role.domain = 'designer'
  ORDER BY user_role.role_id, user_role.id
  FOR SHARE OF user_role;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trade scope % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM membership.id
  FROM public.organization_members AS membership
  WHERE membership.organization_id = v_project.studio_id
    AND membership.user_id = ANY(ARRAY[
      v_project.designer_id, v_recorder
    ]::uuid[])
  ORDER BY membership.user_id, membership.id
  FOR SHARE;

  PERFORM studio.id
  FROM public.organizations AS studio
  WHERE studio.id = v_project.studio_id
  ORDER BY studio.id
  FOR SHARE;

  IF NOT EXISTS (
       SELECT 1 FROM public.organizations AS studio
       WHERE studio.id = v_project.studio_id
         AND studio.type = 'design_studio'
         AND studio.status = 'active'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.organization_members AS membership
       WHERE membership.organization_id = v_project.studio_id
         AND membership.user_id = v_project.designer_id
         AND membership.status = 'active'
         AND membership.role <> 'guest'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.organization_members AS membership
       WHERE membership.organization_id = v_project.studio_id
         AND membership.user_id = v_recorder
         AND membership.status = 'active'
         AND membership.role <> 'guest'
     )
  THEN
    RAISE EXCEPTION 'trade scope % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT proposal.* INTO v_proposal
  FROM public.proposals AS proposal
  WHERE proposal.id = p_proposal_id
    AND proposal.document_kind = 'trade_scope'
    AND proposal.client_id = v_project.client_id
    AND (proposal.project_id IS NULL OR proposal.project_id = v_project.id)
  FOR UPDATE;

  SELECT document.* INTO v_document
  FROM public.project_commercial_documents AS document
  WHERE document.id = v_document.id
    AND document.proposal_id = v_proposal.id
    AND document.project_id = v_project.id
    AND document.document_kind = 'trade_scope'
  FOR UPDATE;

  PERFORM relationship.id
  FROM public.designer_clients AS relationship
  WHERE relationship.id = v_proposal.designer_client_id
    AND relationship.designer_id = v_proposal.designer_id
    AND relationship.client_id = v_proposal.client_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trade scope % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_actor := v_proposal.client_id;
  -- 00425 DELTA 4 (expiry). Gone, for the reason the furnishings twin states:
  -- papers are not time-boxed, and the client rail's own expiry refusal is
  -- untouched and still tested.
  -- Defense in depth, exactly as the furnishings rail does it: the origin proved
  -- at authoring must still be there when the authority is exercised.
  IF NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    JOIN public.proposals p ON p.id = d.proposal_id
    WHERE d.project_id = v_document.project_id AND d.is_origin
      AND d.document_kind = 'design_services' AND p.commercial_state = 'executed'
  ) THEN
    RAISE EXCEPTION 'project % has no executed design-services origin', v_document.project_id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_terms FROM public.trade_scope_terms WHERE proposal_id = p_proposal_id;
  v_fingerprint := public._commercial_document_fingerprint(p_proposal_id);
  SELECT * INTO v_signature FROM public.commercial_document_signatures
  WHERE proposal_id = p_proposal_id AND party_role = 'client' FOR UPDATE;

  IF v_proposal.commercial_state = 'executed' THEN
    IF v_signature.id IS NULL OR v_signature.signer_user_id IS DISTINCT FROM v_actor
       OR v_signature.signed_name IS DISTINCT FROM v_name
       OR v_signature.evidence_fingerprint IS DISTINCT FROM v_fingerprint
    THEN
      RAISE EXCEPTION 'trade scope signature retry conflicts with immutable evidence'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF v_proposal.commercial_state = 'sent' THEN
    IF v_signature.id IS NOT NULL THEN
      RAISE EXCEPTION 'trade scope signature topology conflicts with document state'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO v_draw FROM public.trade_scope_draws
    WHERE proposal_id = p_proposal_id ORDER BY sort_order, id LIMIT 1 FOR UPDATE;
    IF v_draw.id IS NULL THEN
      RAISE EXCEPTION 'trade scope has no draw schedule to bill'
        USING ERRCODE = 'check_violation';
    END IF;
    -- Belt to the send seam's braces. The send gate refuses a schedule whose
    -- first draw gates on acceptance, so this should be unreachable — but the
    -- draw about to be billed unconditionally, at signature, is the last place
    -- to notice that it says it is due on acceptance. issue_trade_draw_invoice
    -- makes the same assertion at its own seam; this rail should not be the one
    -- place a gated draw can be billed without the gate.
    IF v_draw.gates_on_acceptance THEN
      RAISE EXCEPTION 'the trade scope deposit draw gates on acceptance and cannot be billed at signature'
        USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.commercial_document_signatures (
      proposal_id, party_role, signer_user_id, signed_name, signed_ip,
      evidence_fingerprint, metadata
    ) VALUES (
      p_proposal_id, 'client', v_actor, v_name,
      -- 00425 DELTA 2 (signed_ip) and DELTA 3 (metadata). No IP, because no
      -- browser: the paper tell. The metadata builder validates the paper date
      -- and the scan pointer before it returns.
      NULL, v_fingerprint,
      public._paper_signature_metadata(
        p_proposal_id, 'execute_trade_scope_on_paper',
        p_paper_signed_on, v_recorder, p_scan_document_id
      )
    ) RETURNING * INTO v_signature;

    PERFORM set_config('app.proposal_accept_id', p_proposal_id::text, true);
    PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
    UPDATE public.proposals SET
      status = 'accepted', commercial_state = 'executed',
      signed_at = v_signature.signed_at, signed_by_name = v_name,
      accepted_at = v_signature.signed_at, updated_at = now()
    WHERE id = p_proposal_id;

    -- Draw one is the deposit. It is issued unconditionally: the whole point of
    -- a draw schedule is that the first draw is what puts the trade to work.
    INSERT INTO public.invoices (
      project_id, designer_id, client_id, status, currency,
      subtotal_cents, tax_rate, tax_cents, total_cents, memo
    ) VALUES (
      v_document.project_id, v_project.designer_id, v_proposal.client_id,
      'draft', COALESCE(v_terms.currency, 'USD'),
      v_draw.amount_cents, 0, 0, v_draw.amount_cents,
      'Trade scope deposit · ' || v_draw.label
    ) RETURNING id INTO v_deposit_invoice_id;
    INSERT INTO public.invoice_line_items (
      invoice_id, kind, description, quantity, unit_amount_cents,
      amount_cents, metadata
    ) VALUES (
      v_deposit_invoice_id, 'adhoc', v_draw.label, 1,
      v_draw.amount_cents, v_draw.amount_cents,
      jsonb_build_object(
        'tradeScopeId', p_proposal_id,
        'tradeScopeDocumentId', v_document.id,
        'drawId', v_draw.id,
        'kind', 'trade_draw'
      )
    );
    PERFORM app_private.issue_invoice_for_actor(
      v_deposit_invoice_id, current_date, v_recorder
    );

    UPDATE public.project_commercial_documents SET
      executed_at = v_signature.signed_at,
      deposit_invoice_id = v_deposit_invoice_id
    WHERE id = v_document.id;

    PERFORM set_config('app.trade_draw_invoice_id', v_draw.id::text, true);
    UPDATE public.trade_scope_draws SET invoice_id = v_deposit_invoice_id
    WHERE id = v_draw.id;
    PERFORM set_config('app.trade_draw_invoice_id', COALESCE(v_previous_draw, ''), true);

    -- 00424 DELTA — the work is awarded, so the asking is over.
    PERFORM public._close_trade_rfqs_for_scope(p_proposal_id);

    PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
    PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
    v_newly := true;
  ELSE
    RAISE EXCEPTION 'trade scope % is not executable from %',
      p_proposal_id, COALESCE(v_proposal.commercial_state, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_document FROM public.project_commercial_documents
  WHERE id = v_document.id;

  RETURN jsonb_build_object(
    'proposalId', p_proposal_id,
    'projectId', v_document.project_id,
    'documentId', v_document.id,
    'commercialState', 'executed',
    'progressState', COALESCE((SELECT t.progress_state FROM public.trade_scope_terms t
      WHERE t.proposal_id = p_proposal_id), 'none'),
    'depositInvoiceId', v_document.deposit_invoice_id,
    'depositRequiredCents', (SELECT i.total_cents FROM public.invoices i
      WHERE i.id = v_document.deposit_invoice_id),
    'depositPaidCents', COALESCE((SELECT i.amount_paid_cents FROM public.invoices i
      WHERE i.id = v_document.deposit_invoice_id), 0),
    'newlyExecuted', v_newly
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  PERFORM set_config('app.trade_draw_invoice_id', COALESCE(v_previous_draw, ''), true);
  RAISE;
END;
$$;

COMMENT ON FUNCTION public._execute_trade_scope_on_paper_authorized(
  uuid, text, date, uuid, uuid
) IS
  'Owner-only paper trade core. It binds the recorder, historical proposal author, exact active document project/studio, and current live designer lead before any legal-state mutation; deposit issuance uses the current lead and explicit real recorder without rewriting JWT claims.';

REVOKE ALL PRIVILEGES ON FUNCTION
  public._execute_trade_scope_on_paper_authorized(
    uuid, text, date, uuid, uuid
  )
FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
  agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;

CREATE OR REPLACE FUNCTION public._execute_furnishings_authorization_authorized(
  p_proposal_id uuid,
  p_signed_name text,
  p_client_id uuid,
  p_trusted_signed_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor uuid := p_client_id;
  v_proposal public.proposals%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_signature public.commercial_document_signatures%ROWTYPE;
  v_name text := btrim(COALESCE(p_signed_name, ''));
  v_fingerprint text;
  v_deposit_cents integer;
  v_deposit_invoice_id uuid;
  v_applied_ids uuid[] := '{}'::uuid[];
  v_linked_ids uuid[] := '{}'::uuid[];
  v_newly boolean := false;
  v_previous_accept text :=
    current_setting('app.proposal_accept_id', true);
  v_previous_commercial text :=
    current_setting('app.commercial_document_id', true);
  v_anchor_phase_id uuid;
  -- plpgsql forbids a row variable in a multi-item INTO list, so the paired
  -- composites land in one record and are unpacked below.
  v_row_5356 record;
BEGIN
  IF v_actor IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION
      'furnishings execution requires an authenticated client and legal name'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_proposal
  FROM public.proposals
  WHERE id = p_proposal_id
    AND client_id = v_actor
    AND document_kind = 'furnishings_authorization';
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT document, project INTO v_row_5356
  FROM public.project_commercial_documents AS document
  JOIN public.projects AS project ON project.id = document.project_id
  WHERE document.proposal_id = p_proposal_id
    AND document.document_kind = 'furnishings_authorization'
    AND project.client_id = v_actor
    AND project.status = 'active'
    AND (
      v_proposal.project_id IS NULL
      OR v_proposal.project_id = project.id
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_document := v_row_5356.document;
  v_project := v_row_5356.project;

  SELECT project.* INTO v_project
  FROM public.projects AS project
  WHERE project.id = v_document.project_id
    AND project.client_id = v_actor
    AND project.designer_id = v_project.designer_id
    AND project.studio_id = v_project.studio_id
    AND project.status = 'active'
  FOR UPDATE;

  PERFORM role.id
  FROM public.roles AS role
  WHERE role.domain = 'designer'
  ORDER BY role.id
  FOR SHARE;

  PERFORM user_role.id
  FROM public.user_roles AS user_role
  JOIN public.roles AS role ON role.id = user_role.role_id
  WHERE user_role.user_id = v_project.designer_id
    AND role.domain = 'designer'
  ORDER BY user_role.role_id, user_role.id
  FOR SHARE OF user_role;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM lead_membership.id
  FROM public.organization_members AS lead_membership
  WHERE lead_membership.organization_id = v_project.studio_id
    AND lead_membership.user_id = v_project.designer_id
  ORDER BY lead_membership.id
  FOR SHARE;

  PERFORM studio.id
  FROM public.organizations AS studio
  WHERE studio.id = v_project.studio_id
  ORDER BY studio.id
  FOR SHARE;

  IF NOT EXISTS (
       SELECT 1 FROM public.organizations AS studio
       WHERE studio.id = v_project.studio_id
         AND studio.type = 'design_studio'
         AND studio.status = 'active'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.organization_members AS lead_membership
       WHERE lead_membership.organization_id = v_project.studio_id
         AND lead_membership.user_id = v_project.designer_id
         AND lead_membership.status = 'active'
         AND lead_membership.role <> 'guest'
     )
  THEN
    RAISE EXCEPTION
      'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT proposal.* INTO v_proposal
  FROM public.proposals AS proposal
  WHERE proposal.id = p_proposal_id
    AND proposal.client_id = v_actor
    AND proposal.document_kind = 'furnishings_authorization'
    AND (proposal.project_id IS NULL OR proposal.project_id = v_project.id)
  FOR UPDATE;

  SELECT document.* INTO v_document
  FROM public.project_commercial_documents AS document
  WHERE document.id = v_document.id
    AND document.proposal_id = v_proposal.id
    AND document.project_id = v_project.id
    AND document.document_kind = 'furnishings_authorization'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_proposal.commercial_state <> 'executed'
     AND v_proposal.valid_until IS NOT NULL
     AND v_proposal.valid_until < now()
  THEN
    RAISE EXCEPTION 'furnishings authorization % has expired', p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.project_budget_checkpoints AS checkpoint
    WHERE checkpoint.id = v_document.budget_checkpoint_id
      AND checkpoint.project_id = v_document.project_id
      AND checkpoint.status IN ('acknowledged', 'overridden')
      AND checkpoint.snapshot_fingerprint =
            public._budget_version_fingerprint(checkpoint.budget_version_id)
  ) THEN
    RAISE EXCEPTION
      'furnishings authorization checkpoint is missing or invalid'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.project_commercial_documents AS origin_document
    JOIN public.proposals AS origin_proposal
      ON origin_proposal.id = origin_document.proposal_id
    WHERE origin_document.project_id = v_document.project_id
      AND origin_document.is_origin
      AND origin_document.document_kind = 'design_services'
      AND origin_proposal.commercial_state = 'executed'
  ) THEN
    RAISE EXCEPTION 'project % has no executed design-services origin',
      v_document.project_id
      USING ERRCODE = 'check_violation';
  END IF;

  v_fingerprint := public._commercial_document_fingerprint(p_proposal_id);
  v_deposit_cents := round(
    COALESCE(v_proposal.total_amount, 0)::numeric
    * COALESCE(v_proposal.deposit_percent, 0)::numeric / 100
  )::integer;

  SELECT * INTO v_signature
  FROM public.commercial_document_signatures
  WHERE proposal_id = p_proposal_id
    AND party_role = 'client'
  FOR UPDATE;

  IF v_proposal.commercial_state = 'executed' THEN
    IF v_signature.id IS NULL
       OR v_signature.signer_user_id IS DISTINCT FROM v_actor
       OR v_signature.signed_name IS DISTINCT FROM v_name
       OR v_signature.evidence_fingerprint IS DISTINCT FROM v_fingerprint
    THEN
      RAISE EXCEPTION
        'furnishings signature retry conflicts with immutable evidence'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT COALESCE(array_agg(item.id ORDER BY item.id), '{}'::uuid[])
    INTO v_applied_ids
    FROM public.project_ffe_items AS item
    WHERE item.source_commercial_document_id = v_document.id;
  ELSIF v_proposal.commercial_state = 'sent' THEN
    IF v_signature.id IS NOT NULL THEN
      RAISE EXCEPTION
        'furnishings signature topology conflicts with document state'
        USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.commercial_document_signatures (
      proposal_id, party_role, signer_user_id, signed_name, signed_ip,
      evidence_fingerprint, metadata
    ) VALUES (
      p_proposal_id, 'client', v_actor, v_name,
      NULLIF(btrim(COALESCE(p_trusted_signed_ip, '')), ''), v_fingerprint,
      jsonb_build_object('via', 'execute_furnishings_authorization')
    )
    RETURNING * INTO v_signature;

    PERFORM set_config('app.proposal_accept_id', p_proposal_id::text, true);
    PERFORM set_config(
      'app.commercial_document_id', p_proposal_id::text, true
    );

    UPDATE public.proposals
    SET status = 'accepted',
        commercial_state = 'executed',
        signed_at = v_signature.signed_at,
        signed_by_name = v_name,
        accepted_at = v_signature.signed_at,
        updated_at = now()
    WHERE id = p_proposal_id;

    WITH inserted AS (
      INSERT INTO public.project_ffe_items (
        project_id, source_proposal_item_id, product_id, name, ffe_category,
        item_type, status, quantity, unit_price_cents, trade_price_cents,
        markup_percent, line_total_cents, vendor_id, vendor_name, sort_order,
        source_commercial_document_id, source_authorization_item_id,
        custom_fields
      )
      SELECT
        v_document.project_id, item.source_proposal_item_id, item.product_id,
        item.name, item.category, item.item_type, 'approved', item.quantity,
        item.client_unit_price_cents, item.trade_unit_cost_cents,
        item.markup_percent, item.client_line_total_cents, item.vendor_id,
        item.vendor_name, item.sort_order, v_document.id, item.id,
        COALESCE(item.snapshot->'customFields', '{}'::jsonb)
      FROM public.furnishing_authorization_items AS item
      WHERE item.commercial_document_id = v_document.id
        AND item.source_proposal_item_id IS NOT NULL
      ORDER BY item.sort_order, item.id
      RETURNING id
    )
    SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[])
    INTO v_applied_ids
    FROM inserted;

    WITH linked AS (
      UPDATE public.project_ffe_items AS project_item
      SET source_commercial_document_id = v_document.id,
          source_authorization_item_id = item.id,
          status = CASE
            WHEN public.ffe_status_rank(project_item.status) <
                 public.ffe_status_rank('approved')
              THEN 'approved'
            ELSE project_item.status
          END,
          updated_at = now()
      FROM public.furnishing_authorization_items AS item
      WHERE item.commercial_document_id = v_document.id
        AND item.source_ffe_item_id IS NOT NULL
        AND project_item.id = item.source_ffe_item_id
      RETURNING project_item.id
    )
    SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[])
    INTO v_linked_ids
    FROM linked;

    SELECT COALESCE(array_agg(applied ORDER BY applied), '{}'::uuid[])
    INTO v_applied_ids
    FROM unnest(v_applied_ids || v_linked_ids) AS applied;

    IF v_deposit_cents > 0 THEN
      INSERT INTO public.invoices (
        project_id, designer_id, client_id, status, currency,
        subtotal_cents, tax_rate, tax_cents, total_cents, memo
      ) VALUES (
        v_document.project_id, v_project.designer_id, v_proposal.client_id,
        'draft', 'USD', v_deposit_cents, 0, 0, v_deposit_cents,
        'Furnishings deposit · ' || v_document.wave_name
      )
      RETURNING id INTO v_deposit_invoice_id;

      INSERT INTO public.invoice_line_items (
        invoice_id, kind, description, quantity, unit_amount_cents,
        amount_cents, metadata
      ) VALUES (
        v_deposit_invoice_id, 'adhoc',
        'Furnishings authorization deposit', 1,
        v_deposit_cents, v_deposit_cents,
        jsonb_build_object(
          'commercialDocumentId', v_document.id,
          'kind', 'furnishings_deposit'
        )
      );

      PERFORM app_private.issue_invoice_for_actor(
        v_deposit_invoice_id, current_date, v_actor
      );
    END IF;

    UPDATE public.project_commercial_documents
    SET executed_at = v_signature.signed_at,
        deposit_invoice_id = v_deposit_invoice_id
    WHERE id = v_document.id;

    v_anchor_phase_id := public._schedule_thread_phase(v_document.project_id);
    IF v_anchor_phase_id IS NOT NULL THEN
      PERFORM public._commit_schedule_edit_authorized(
        v_document.project_id,
        jsonb_build_array(jsonb_build_object(
          'kind', 'phase-anchor',
          'phase_id', v_anchor_phase_id,
          'anchor_date', to_char(v_signature.signed_at::date, 'YYYY-MM-DD'),
          'source_ref', p_proposal_id
        )),
        'Furnishings authorization executed',
        NULL,
        'ceremony:furnishings-authorization-executed'
      );
    END IF;

    PERFORM set_config(
      'app.proposal_accept_id', COALESCE(v_previous_accept, ''), true
    );
    PERFORM set_config(
      'app.commercial_document_id', COALESCE(v_previous_commercial, ''), true
    );
    v_newly := true;
  ELSE
    RAISE EXCEPTION 'furnishings authorization % is not executable from %',
      p_proposal_id, COALESCE(v_proposal.commercial_state, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'projectId', v_document.project_id,
    'documentId', v_document.id,
    'checkpointId', v_document.budget_checkpoint_id,
    'appliedItemIds', to_jsonb(v_applied_ids),
    'depositInvoiceId',
      COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id),
    'depositRequiredCents', COALESCE((
      SELECT invoice.total_cents
      FROM public.invoices AS invoice
      WHERE invoice.id =
            COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)
    ), v_deposit_cents),
    'deposit_required_cents', COALESCE((
      SELECT invoice.total_cents
      FROM public.invoices AS invoice
      WHERE invoice.id =
            COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)
    ), v_deposit_cents),
    'depositPaidCents', COALESCE((
      SELECT invoice.amount_paid_cents
      FROM public.invoices AS invoice
      WHERE invoice.id =
            COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)
    ), 0),
    'deposit_paid_cents', COALESCE((
      SELECT invoice.amount_paid_cents
      FROM public.invoices AS invoice
      WHERE invoice.id =
            COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)
    ), 0),
    'newlyExecuted', v_newly
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.proposal_accept_id', COALESCE(v_previous_accept, ''), true
  );
  PERFORM set_config(
    'app.commercial_document_id', COALESCE(v_previous_commercial, ''), true
  );
  RAISE;
END;
$$;

COMMENT ON FUNCTION public._execute_furnishings_authorization_authorized(
  uuid, text, uuid, text
) IS
  'Owner-only client furnishings execution core. Its first locked proposal read binds the exact actor client and furnishings kind without locking foreign rows; the canonical project supplies the current invoice lead while proposal authorship remains historical. Deposit issuance delegates to the relational app_private core without rewriting request JWT claims.';

REVOKE ALL PRIVILEGES ON FUNCTION
  public._execute_furnishings_authorization_authorized(
    uuid, text, uuid, text
  )
FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
  agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;

CREATE OR REPLACE FUNCTION public._execute_trade_scope_authorized(
  p_proposal_id uuid,
  p_signed_name text,
  p_client_id uuid,
  p_trusted_signed_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor uuid := p_client_id;
  v_proposal public.proposals%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_signature public.commercial_document_signatures%ROWTYPE;
  v_terms public.trade_scope_terms%ROWTYPE;
  v_draw public.trade_scope_draws%ROWTYPE;
  v_name text := btrim(COALESCE(p_signed_name, ''));
  v_fingerprint text;
  v_deposit_invoice_id uuid;
  v_newly boolean := false;
  v_previous_accept text :=
    current_setting('app.proposal_accept_id', true);
  v_previous_commercial text :=
    current_setting('app.commercial_document_id', true);
  v_previous_draw text :=
    current_setting('app.trade_draw_invoice_id', true);
  -- plpgsql forbids a row variable in a multi-item INTO list, so the paired
  -- composites land in one record and are unpacked below.
  v_row_5764 record;
BEGIN
  IF v_actor IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION
      'trade scope execution requires an authenticated client and legal name'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_proposal
  FROM public.proposals
  WHERE id = p_proposal_id
    AND client_id = v_actor
    AND document_kind = 'trade_scope';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trade scope % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT document, project INTO v_row_5764
  FROM public.project_commercial_documents AS document
  JOIN public.projects AS project ON project.id = document.project_id
  WHERE document.proposal_id = p_proposal_id
    AND document.document_kind = 'trade_scope'
    AND project.client_id = v_actor
    AND project.status = 'active'
    AND (
      v_proposal.project_id IS NULL
      OR v_proposal.project_id = project.id
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trade scope % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_document := v_row_5764.document;
  v_project := v_row_5764.project;

  SELECT project.* INTO v_project
  FROM public.projects AS project
  WHERE project.id = v_document.project_id
    AND project.client_id = v_actor
    AND project.designer_id = v_project.designer_id
    AND project.studio_id = v_project.studio_id
    AND project.status = 'active'
  FOR UPDATE;

  PERFORM role.id
  FROM public.roles AS role
  WHERE role.domain = 'designer'
  ORDER BY role.id
  FOR SHARE;

  PERFORM user_role.id
  FROM public.user_roles AS user_role
  JOIN public.roles AS role ON role.id = user_role.role_id
  WHERE user_role.user_id = v_project.designer_id
    AND role.domain = 'designer'
  ORDER BY user_role.role_id, user_role.id
  FOR SHARE OF user_role;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trade scope % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM lead_membership.id
  FROM public.organization_members AS lead_membership
  WHERE lead_membership.organization_id = v_project.studio_id
    AND lead_membership.user_id = v_project.designer_id
  ORDER BY lead_membership.id
  FOR SHARE;

  PERFORM studio.id
  FROM public.organizations AS studio
  WHERE studio.id = v_project.studio_id
  ORDER BY studio.id
  FOR SHARE;

  IF NOT EXISTS (
       SELECT 1 FROM public.organizations AS studio
       WHERE studio.id = v_project.studio_id
         AND studio.type = 'design_studio'
         AND studio.status = 'active'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.organization_members AS lead_membership
       WHERE lead_membership.organization_id = v_project.studio_id
         AND lead_membership.user_id = v_project.designer_id
         AND lead_membership.status = 'active'
         AND lead_membership.role <> 'guest'
     )
  THEN
    RAISE EXCEPTION 'trade scope % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT proposal.* INTO v_proposal
  FROM public.proposals AS proposal
  WHERE proposal.id = p_proposal_id
    AND proposal.client_id = v_actor
    AND proposal.document_kind = 'trade_scope'
    AND (proposal.project_id IS NULL OR proposal.project_id = v_project.id)
  FOR UPDATE;

  SELECT document.* INTO v_document
  FROM public.project_commercial_documents AS document
  WHERE document.id = v_document.id
    AND document.proposal_id = v_proposal.id
    AND document.project_id = v_project.id
    AND document.document_kind = 'trade_scope'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trade scope % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_proposal.commercial_state <> 'executed'
     AND v_proposal.valid_until IS NOT NULL
     AND v_proposal.valid_until < now()
  THEN
    RAISE EXCEPTION 'trade scope % has expired', p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.project_commercial_documents AS origin_document
    JOIN public.proposals AS origin_proposal
      ON origin_proposal.id = origin_document.proposal_id
    WHERE origin_document.project_id = v_document.project_id
      AND origin_document.is_origin
      AND origin_document.document_kind = 'design_services'
      AND origin_proposal.commercial_state = 'executed'
  ) THEN
    RAISE EXCEPTION 'project % has no executed design-services origin',
      v_document.project_id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_terms
  FROM public.trade_scope_terms
  WHERE proposal_id = p_proposal_id;
  v_fingerprint := public._commercial_document_fingerprint(p_proposal_id);

  SELECT * INTO v_signature
  FROM public.commercial_document_signatures
  WHERE proposal_id = p_proposal_id
    AND party_role = 'client'
  FOR UPDATE;

  IF v_proposal.commercial_state = 'executed' THEN
    IF v_signature.id IS NULL
       OR v_signature.signer_user_id IS DISTINCT FROM v_actor
       OR v_signature.signed_name IS DISTINCT FROM v_name
       OR v_signature.evidence_fingerprint IS DISTINCT FROM v_fingerprint
    THEN
      RAISE EXCEPTION
        'trade scope signature retry conflicts with immutable evidence'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF v_proposal.commercial_state = 'sent' THEN
    IF v_signature.id IS NOT NULL THEN
      RAISE EXCEPTION 'trade scope signature topology conflicts with document state'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO v_draw
    FROM public.trade_scope_draws
    WHERE proposal_id = p_proposal_id
    ORDER BY sort_order, id
    LIMIT 1
    FOR UPDATE;
    IF v_draw.id IS NULL THEN
      RAISE EXCEPTION 'trade scope has no draw schedule to bill'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_draw.gates_on_acceptance THEN
      RAISE EXCEPTION
        'the trade scope deposit draw gates on acceptance and cannot be billed at signature'
        USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.commercial_document_signatures (
      proposal_id, party_role, signer_user_id, signed_name, signed_ip,
      evidence_fingerprint, metadata
    ) VALUES (
      p_proposal_id, 'client', v_actor, v_name,
      NULLIF(btrim(COALESCE(p_trusted_signed_ip, '')), ''), v_fingerprint,
      jsonb_build_object('via', 'execute_trade_scope')
    )
    RETURNING * INTO v_signature;

    PERFORM set_config('app.proposal_accept_id', p_proposal_id::text, true);
    PERFORM set_config(
      'app.commercial_document_id', p_proposal_id::text, true
    );
    UPDATE public.proposals
    SET status = 'accepted',
        commercial_state = 'executed',
        signed_at = v_signature.signed_at,
        signed_by_name = v_name,
        accepted_at = v_signature.signed_at,
        updated_at = now()
    WHERE id = p_proposal_id;

    INSERT INTO public.invoices (
      project_id, designer_id, client_id, status, currency,
      subtotal_cents, tax_rate, tax_cents, total_cents, memo
    ) VALUES (
      v_document.project_id, v_project.designer_id, v_proposal.client_id,
      'draft', COALESCE(v_terms.currency, 'USD'),
      v_draw.amount_cents, 0, 0, v_draw.amount_cents,
      'Trade scope deposit · ' || v_draw.label
    )
    RETURNING id INTO v_deposit_invoice_id;

    INSERT INTO public.invoice_line_items (
      invoice_id, kind, description, quantity, unit_amount_cents,
      amount_cents, metadata
    ) VALUES (
      v_deposit_invoice_id, 'adhoc', v_draw.label, 1,
      v_draw.amount_cents, v_draw.amount_cents,
      jsonb_build_object(
        'tradeScopeId', p_proposal_id,
        'tradeScopeDocumentId', v_document.id,
        'drawId', v_draw.id,
        'kind', 'trade_draw'
      )
    );

    PERFORM app_private.issue_invoice_for_actor(
      v_deposit_invoice_id, current_date, v_actor
    );

    UPDATE public.project_commercial_documents
    SET executed_at = v_signature.signed_at,
        deposit_invoice_id = v_deposit_invoice_id
    WHERE id = v_document.id;

    PERFORM set_config('app.trade_draw_invoice_id', v_draw.id::text, true);
    UPDATE public.trade_scope_draws
    SET invoice_id = v_deposit_invoice_id
    WHERE id = v_draw.id;
    PERFORM set_config(
      'app.trade_draw_invoice_id', COALESCE(v_previous_draw, ''), true
    );

    PERFORM public._close_trade_rfqs_for_scope(p_proposal_id);

    PERFORM set_config(
      'app.proposal_accept_id', COALESCE(v_previous_accept, ''), true
    );
    PERFORM set_config(
      'app.commercial_document_id', COALESCE(v_previous_commercial, ''), true
    );
    v_newly := true;
  ELSE
    RAISE EXCEPTION 'trade scope % is not executable from %',
      p_proposal_id, COALESCE(v_proposal.commercial_state, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_document
  FROM public.project_commercial_documents
  WHERE id = v_document.id;

  RETURN jsonb_build_object(
    'proposalId', p_proposal_id,
    'projectId', v_document.project_id,
    'documentId', v_document.id,
    'commercialState', 'executed',
    'progressState', COALESCE((
      SELECT terms.progress_state
      FROM public.trade_scope_terms AS terms
      WHERE terms.proposal_id = p_proposal_id
    ), 'none'),
    'depositInvoiceId', v_document.deposit_invoice_id,
    'depositRequiredCents', (
      SELECT invoice.total_cents
      FROM public.invoices AS invoice
      WHERE invoice.id = v_document.deposit_invoice_id
    ),
    'depositPaidCents', COALESCE((
      SELECT invoice.amount_paid_cents
      FROM public.invoices AS invoice
      WHERE invoice.id = v_document.deposit_invoice_id
    ), 0),
    'newlyExecuted', v_newly
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.proposal_accept_id', COALESCE(v_previous_accept, ''), true
  );
  PERFORM set_config(
    'app.commercial_document_id', COALESCE(v_previous_commercial, ''), true
  );
  PERFORM set_config(
    'app.trade_draw_invoice_id', COALESCE(v_previous_draw, ''), true
  );
  RAISE;
END;
$$;

COMMENT ON FUNCTION public._execute_trade_scope_authorized(
  uuid, text, uuid, text
) IS
  'Owner-only client trade-scope execution core. Its first locked proposal read binds the exact actor client and trade kind without locking foreign rows; the canonical project supplies the current invoice lead while proposal authorship remains historical. Deposit issuance delegates to the relational app_private core without rewriting request JWT claims.';

REVOKE ALL PRIVILEGES ON FUNCTION
  public._execute_trade_scope_authorized(uuid, text, uuid, text)
FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
  agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;

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
  v_project public.projects%ROWTYPE;
  v_terms public.trade_scope_terms%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_invoice_id uuid;
  v_unpaid integer;
  v_previous_draw text :=
    current_setting('app.trade_draw_invoice_id', true);
  v_previous_commercial text :=
    current_setting('app.commercial_document_id', true);
  -- plpgsql forbids a row variable in a multi-item INTO list, so the paired
  -- composites land in one record and are unpacked below.
  v_row_6082 record;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'trade scope draw not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT draw, proposal, document, project
  INTO v_row_6082
  FROM public.trade_scope_draws AS draw
  JOIN public.proposals AS proposal ON proposal.id = draw.proposal_id
  JOIN public.project_commercial_documents AS document
    ON document.proposal_id = proposal.id
  JOIN public.projects AS project ON project.id = document.project_id
  JOIN public.organizations AS studio ON studio.id = project.studio_id
  WHERE draw.id = p_draw_id
    AND proposal.document_kind = 'trade_scope'
    AND document.document_kind = 'trade_scope'
    AND (proposal.project_id IS NULL OR proposal.project_id = project.id)
    AND proposal.client_id = project.client_id
    AND project.status = 'active'
    AND studio.type = 'design_studio'
    AND studio.status = 'active'
    AND EXISTS (
      SELECT 1
      FROM public.organization_members AS lead_membership
      WHERE lead_membership.organization_id = project.studio_id
        AND lead_membership.user_id = project.designer_id
        AND lead_membership.status = 'active'
        AND lead_membership.role <> 'guest'
    )
    AND EXISTS (
      SELECT 1
      FROM public.user_roles AS user_role
      JOIN public.roles AS role ON role.id = user_role.role_id
      WHERE user_role.user_id = project.designer_id
        AND role.domain = 'designer'
    )
    AND (
      v_actor = project.designer_id
      OR EXISTS (
        SELECT 1
        FROM public.organization_members AS actor_membership
        WHERE actor_membership.organization_id = project.studio_id
          AND actor_membership.user_id = v_actor
          AND actor_membership.status = 'active'
          AND actor_membership.role <> 'guest'
      )
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trade scope draw not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_draw := v_row_6082.draw;
  v_proposal := v_row_6082.proposal;
  v_document := v_row_6082.document;
  v_project := v_row_6082.project;

  SELECT project.* INTO v_project
  FROM public.projects AS project
  WHERE project.id = v_document.project_id
    AND project.designer_id = v_project.designer_id
    AND project.client_id = v_proposal.client_id
    AND project.studio_id = v_project.studio_id
    AND project.status = 'active'
  FOR UPDATE;

  PERFORM role.id
  FROM public.roles AS role
  WHERE role.domain = 'designer'
  ORDER BY role.id
  FOR SHARE;

  PERFORM user_role.id
  FROM public.user_roles AS user_role
  JOIN public.roles AS role ON role.id = user_role.role_id
  WHERE user_role.user_id = v_project.designer_id
    AND role.domain = 'designer'
  ORDER BY user_role.role_id, user_role.id
  FOR SHARE OF user_role;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trade scope draw not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM membership.id
  FROM public.organization_members AS membership
  WHERE membership.organization_id = v_project.studio_id
    AND membership.user_id = ANY(ARRAY[
      v_project.designer_id, v_actor
    ]::uuid[])
  ORDER BY membership.user_id, membership.id
  FOR SHARE;

  PERFORM studio.id
  FROM public.organizations AS studio
  WHERE studio.id = v_project.studio_id
  ORDER BY studio.id
  FOR SHARE;

  IF NOT EXISTS (
       SELECT 1 FROM public.organizations AS studio
       WHERE studio.id = v_project.studio_id
         AND studio.type = 'design_studio'
         AND studio.status = 'active'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.organization_members AS membership
       WHERE membership.organization_id = v_project.studio_id
         AND membership.user_id = v_project.designer_id
         AND membership.status = 'active'
         AND membership.role <> 'guest'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.organization_members AS membership
       WHERE membership.organization_id = v_project.studio_id
         AND membership.user_id = v_actor
         AND membership.status = 'active'
         AND membership.role <> 'guest'
     )
  THEN
    RAISE EXCEPTION 'trade scope draw not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT proposal.* INTO v_proposal
  FROM public.proposals AS proposal
  WHERE proposal.id = v_proposal.id
    AND proposal.client_id = v_project.client_id
    AND proposal.document_kind = 'trade_scope'
    AND (proposal.project_id IS NULL OR proposal.project_id = v_project.id)
  FOR UPDATE;

  SELECT document.* INTO v_document
  FROM public.project_commercial_documents AS document
  WHERE document.id = v_document.id
    AND document.proposal_id = v_proposal.id
    AND document.project_id = v_project.id
    AND document.document_kind = 'trade_scope'
  FOR UPDATE;

  SELECT draw.* INTO v_draw
  FROM public.trade_scope_draws AS draw
  WHERE draw.id = p_draw_id
    AND draw.proposal_id = v_proposal.id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trade scope draw not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_proposal.commercial_state IS DISTINCT FROM 'executed'
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

  PERFORM set_config(
    'app.commercial_document_id', v_proposal.id::text, true
  );
  INSERT INTO public.invoices (
    project_id, designer_id, client_id, status, currency,
    subtotal_cents, tax_rate, tax_cents, total_cents, memo
  ) VALUES (
    v_document.project_id, v_project.designer_id, v_proposal.client_id,
    'draft', COALESCE(v_terms.currency, 'USD'),
    v_draw.amount_cents, 0, 0, v_draw.amount_cents,
    'Trade scope draw · ' || v_draw.label
  )
  RETURNING * INTO v_invoice;
  PERFORM set_config(
    'app.commercial_document_id', COALESCE(v_previous_commercial, ''), true
  );
  v_invoice_id := v_invoice.id;

  IF v_invoice.designer_id IS DISTINCT FROM v_project.designer_id
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
    'app.commercial_document_id', COALESCE(v_previous_commercial, ''), true
  );
  PERFORM set_config(
    'app.trade_draw_invoice_id', COALESCE(v_previous_draw, ''), true
  );
  RAISE;
END;
$$;

COMMENT ON FUNCTION public.issue_trade_draw_invoice(uuid) IS
  'Issues one trade-scope draw only after the initial locked read proves the real caller is the current lead or an active non-guest member of the exact canonical project studio. The invoice binds the current project lead while proposal authorship remains historical, and issuance retains the actor through the owner-only relational core.';

DO $normalize_acl$
DECLARE
  routine_oid oid;
  grantee_name text;
BEGIN
  FOR routine_oid IN
    SELECT to_regprocedure(signature)::oid FROM _00485_profile
    UNION ALL
    SELECT to_regprocedure(signature)::oid
    FROM _00485_dependency_profile
    UNION ALL
    SELECT to_regprocedure(
      'app_private.issue_invoice_for_actor(uuid,date,uuid)'
    )::oid
    UNION ALL
    SELECT to_regprocedure(
      'public.create_draft_invoice(uuid,uuid,uuid,uuid,numeric,integer,text,text,jsonb)'
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
FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
  agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;

REVOKE ALL PRIVILEGES ON FUNCTION
  public._countersign_design_services_agreement_impl(uuid, text, jsonb),
  public._execute_furnishings_authorization_authorized(
    uuid, text, uuid, text
  ),
  public._execute_furnishings_authorization_on_paper_authorized(
    uuid, text, date, uuid, uuid, jsonb
  ),
  public._execute_trade_scope_authorized(uuid, text, uuid, text),
  public._execute_trade_scope_on_paper_authorized(
    uuid, text, date, uuid, uuid
  ),
  public._prepare_spec_book_issue_00403(
    uuid, text[], text, text, uuid, text, jsonb
  ),
  public._publish_project_review_00448_impl(jsonb),
  public.guard_commercial_signature_insert(),
  app_private.issue_invoice_for_actor(uuid, date, uuid)
FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
  agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;

REVOKE ALL PRIVILEGES ON FUNCTION public.create_draft_invoice(
  uuid, uuid, uuid, uuid, numeric, integer, text, text, jsonb
)
FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
  agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION public.create_draft_invoice(
  uuid, uuid, uuid, uuid, numeric, integer, text, text, jsonb
) TO authenticated;

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

  IF (SELECT count(*) FROM _00485_dependency_profile) <> 8 THEN
    RAISE EXCEPTION '00485 dependency manifest must contain exactly eight rows';
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
      OR routine.prosecdef IS DISTINCT FROM
           expected.final_security_definer
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
    FROM _00485_dependency_profile AS expected
    LEFT JOIN pg_proc AS routine
      ON routine.oid = to_regprocedure(expected.signature)
    LEFT JOIN pg_roles AS owner ON owner.oid = routine.proowner
    LEFT JOIN pg_language AS language ON language.oid = routine.prolang
    WHERE routine.oid IS NULL
      OR owner.rolname IS DISTINCT FROM 'postgres'
      OR language.lanname IS DISTINCT FROM expected.language_name
      OR routine.prokind <> 'f'
      OR routine.prosecdef IS DISTINCT FROM
           expected.final_security_definer
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
    RAISE EXCEPTION '00485 final dependency semantic/body profile is wrong';
  END IF;

  IF EXISTS (
    WITH expected_acl AS (
      SELECT
        expected.signature,
        role_name AS grantee,
        'postgres'::text AS grantor,
        'EXECUTE'::text AS privilege_type,
        false AS is_grantable
      FROM _00485_dependency_profile AS expected
      CROSS JOIN LATERAL unnest(expected.final_roles) AS role_name
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
      FROM _00485_dependency_profile AS expected
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
  ) THEN
    RAISE EXCEPTION '00485 final dependency direct ACL contract is wrong';
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

  IF 1 <> (
    SELECT count(*)
    FROM pg_proc AS routine
    JOIN pg_namespace AS namespace ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'app_private'
      AND routine.proname = 'issue_invoice_for_actor'
  ) OR EXISTS (
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
        OR routine.proretset
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
             'bdf903ba6445367c7f18551859a0a14aeaa2f0dfbec95d4304110e39b537c727'
      )
  ) OR to_regprocedure(
    'app_private.issue_invoice_for_actor(uuid,date,uuid)'
  ) IS NULL THEN
    RAISE EXCEPTION '00485 private invoice core profile is wrong';
  END IF;

  IF 1 <> (
    SELECT count(*)
    FROM pg_proc AS routine
    JOIN pg_namespace AS namespace ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'public'
      AND routine.proname = 'create_draft_invoice'
  ) OR EXISTS (
    SELECT 1
    FROM pg_proc AS routine
    JOIN pg_roles AS owner ON owner.oid = routine.proowner
    JOIN pg_language AS language ON language.oid = routine.prolang
    WHERE routine.oid = to_regprocedure(
      'public.create_draft_invoice(uuid,uuid,uuid,uuid,numeric,integer,text,text,jsonb)'
    )
      AND (
        owner.rolname IS DISTINCT FROM 'postgres'
        OR language.lanname IS DISTINCT FROM 'plpgsql'
        OR routine.prokind <> 'f'
        OR routine.proretset
        OR NOT routine.prosecdef
        OR routine.provolatile <> 'v'
        OR routine.proisstrict
        OR routine.proleakproof
        OR routine.proparallel <> 'u'
        OR routine.proconfig IS DISTINCT FROM
             ARRAY['search_path=pg_catalog, public, pg_temp']::text[]
        OR pg_get_function_arguments(routine.oid) IS DISTINCT FROM
             'p_project_id uuid, p_expected_designer_id uuid, p_expected_client_id uuid, p_expected_studio_id uuid, p_tax_rate numeric DEFAULT 0, p_payment_terms_days integer DEFAULT 15, p_memo text DEFAULT NULL::text, p_internal_notes text DEFAULT NULL::text, p_lines jsonb DEFAULT ''[]''::jsonb'
        OR pg_get_function_result(routine.oid) IS DISTINCT FROM 'invoices'
        OR encode(
             extensions.digest(
               convert_to(routine.prosrc, 'UTF8'), 'sha256'
             ), 'hex'
           ) IS DISTINCT FROM '600c435c99acbb850b3b6a0f7f190aa62aa330e8281659b803abd38ef6c347c6'
        OR octet_length(convert_to(routine.prosrc, 'UTF8'))
             IS DISTINCT FROM 11492
      )
  ) OR EXISTS (
    WITH actual AS (
      SELECT
        CASE acl.grantee
          WHEN 0 THEN 'PUBLIC'
          ELSE grantee.rolname::text
        END AS grantee,
        grantor.rolname::text AS grantor,
        acl.privilege_type,
        acl.is_grantable
      FROM pg_proc AS routine
      CROSS JOIN LATERAL aclexplode(
        COALESCE(routine.proacl, acldefault('f', routine.proowner))
      ) AS acl
      LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
      LEFT JOIN pg_roles AS grantor ON grantor.oid = acl.grantor
      WHERE routine.oid = to_regprocedure(
        'public.create_draft_invoice(uuid,uuid,uuid,uuid,numeric,integer,text,text,jsonb)'
      )
        AND acl.grantee <> routine.proowner
    ),
    expected AS (
      SELECT 'authenticated'::text AS grantee, 'postgres'::text AS grantor,
             'EXECUTE'::text AS privilege_type, false AS is_grantable
    )
    SELECT 1
    FROM (
      (SELECT * FROM actual EXCEPT ALL SELECT * FROM expected)
      UNION ALL
      (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)
    ) AS drift
  ) THEN
    RAISE EXCEPTION '00485 atomic draft profile/ACL/overload is wrong';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc AS caller
    JOIN pg_namespace AS namespace ON namespace.oid = caller.pronamespace
    WHERE namespace.nspname <> 'information_schema'
      AND namespace.nspname NOT LIKE 'pg_%'
      AND pg_temp._00485_references_routine(
        caller.prosrc, 'public', 'create_draft_invoice'
      )
  ) THEN
    RAISE EXCEPTION '00485 atomic draft database caller universe is not empty';
  END IF;

  IF EXISTS (
    WITH expected AS (
      SELECT *
      FROM (VALUES
        (
          'public.projects'::text, 'set_project_studio_id'::text,
          'public.set_project_studio_id()'::text, 'O'::"char", false,
          23::smallint, 0::smallint, ''::text,
          (SELECT string_agg(attnum::text, ' ' ORDER BY
             array_position(
               ARRAY[
                 'id','studio_id','designer_id','client_id','proposal_id',
                 'created_by','created_at'
               ],
               attname
             ))
           FROM pg_attribute
           WHERE attrelid = 'public.projects'::regclass
             AND attname = ANY(
               ARRAY[
                 'id','studio_id','designer_id','client_id','proposal_id',
                 'created_by','created_at'
               ]
             )),
          NULL::text, 0::oid,
          'createtriggerset_project_studio_idbeforeinsertorupdateofid,studio_id,designer_id,client_id,proposal_id,created_by,created_atonprojectsforeachrowexecutefunctionset_project_studio_id()'::text
        ),
        (
          'public.invoices'::text, 'set_invoice_studio_id'::text,
          'public.set_invoice_studio_id()'::text, 'O'::"char", false,
          23::smallint, 0::smallint, ''::text,
          (SELECT string_agg(attnum::text, ' ' ORDER BY array_position(
             ARRAY[
               'id','studio_id','designer_id','client_id','project_id','status',
               'invoice_number','issue_date','due_date','payment_terms_days',
               'currency','subtotal_cents','tax_rate','tax_cents','total_cents',
               'amount_paid_cents','memo','internal_notes','sent_at','paid_at',
               'voided_at','void_reason','stripe_checkout_session_id',
               'reminder_count','last_reminder_at','ar_flagged_at',
               'ar_last_chased_at','created_at','updated_at'
             ], attname))
           FROM pg_attribute
           WHERE attrelid = 'public.invoices'::regclass
             AND attname = ANY(
               ARRAY[
                 'id','studio_id','designer_id','client_id','project_id',
                 'status','invoice_number','issue_date','due_date',
                 'payment_terms_days','currency','subtotal_cents','tax_rate',
                 'tax_cents','total_cents','amount_paid_cents','memo',
                 'internal_notes','sent_at','paid_at','voided_at','void_reason',
                 'stripe_checkout_session_id','reminder_count',
                 'last_reminder_at','ar_flagged_at','ar_last_chased_at',
                 'created_at','updated_at'
               ]
             )),
          NULL::text, 0::oid,
          'createtriggerset_invoice_studio_idbeforeinsertorupdateofid,studio_id,designer_id,client_id,project_id,status,invoice_number,issue_date,due_date,payment_terms_days,currency,subtotal_cents,tax_rate,tax_cents,total_cents,amount_paid_cents,memo,internal_notes,sent_at,paid_at,voided_at,void_reason,stripe_checkout_session_id,reminder_count,last_reminder_at,ar_flagged_at,ar_last_chased_at,created_at,updated_atoninvoicesforeachrowexecutefunctionset_invoice_studio_id()'::text
        ),
        (
          'public.commercial_document_signatures'::text,
          'a_guard_commercial_signature_insert_trg'::text,
          'public.guard_commercial_signature_insert()'::text,
          'O'::"char", false, 7::smallint, 0::smallint, ''::text, ''::text,
          NULL::text, 0::oid,
          'createtriggera_guard_commercial_signature_insert_trgbeforeinsertoncommercial_document_signaturesforeachrowexecutefunctionguard_commercial_signature_insert()'::text
        )
      ) AS fixture(
        relation_name, trigger_name, function_signature, enabled, is_internal,
        trigger_type, argument_count, arguments_hex, trigger_columns,
        when_expression, parent_trigger, definition
      )
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
        to_regprocedure('public.set_invoice_studio_id()')::oid,
        to_regprocedure('public.guard_commercial_signature_insert()')::oid
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
      to_regprocedure('public.issue_trade_draw_invoice(uuid)'),
      to_regprocedure(
        'public._execute_furnishings_authorization_authorized(uuid,text,uuid,text)'
      ),
      to_regprocedure(
        'public._execute_furnishings_authorization_on_paper_authorized(uuid,text,date,uuid,uuid,jsonb)'
      ),
      to_regprocedure(
        'public._execute_trade_scope_authorized(uuid,text,uuid,text)'
      ),
      to_regprocedure(
        'public._execute_trade_scope_on_paper_authorized(uuid,text,date,uuid,uuid)'
      ),
      to_regprocedure(
        'public._countersign_design_services_agreement_impl(uuid,text,jsonb)'
      )
    )
      AND position('request.jwt.claims' IN routine.prosrc) > 0
  ) THEN
    RAISE EXCEPTION '00485 hardened actor boundary rewrites JWT claims';
  END IF;

  IF (
    SELECT position(
      'FROM public.projects AS project'
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
        routine.prosecdef
        OR position('current_setting(''role'', true)' IN routine.prosrc) = 0
        OR position('session_user = ''postgres''' IN routine.prosrc) = 0
        OR position('current_user IS DISTINCT FROM ''postgres'''
                    IN routine.prosrc) = 0
        OR position('studio.type = ''design_studio''' IN routine.prosrc) = 0
        OR position('studio.status = ''active''' IN routine.prosrc) = 0
        OR position('actor_membership.organization_id = NEW.studio_id'
                    IN routine.prosrc) = 0
        OR position('auth.jwt()' IN routine.prosrc) > 0
      )
  ) THEN
    RAISE EXCEPTION '00485 trigger authority contract is wrong';
  END IF;

  IF EXISTS (
    WITH expected(signature, root_is_inherent) AS (
      VALUES
        ('public.set_project_studio_id()'::text, true),
        ('public.set_invoice_studio_id()'::text, false),
        ('public.create_draft_invoice(uuid,uuid,uuid,uuid,numeric,integer,text,text,jsonb)'::text, false),
        ('app_private.issue_invoice_for_actor(uuid,date,uuid)'::text, false),
        ('public._countersign_design_services_agreement_impl(uuid,text,jsonb)'::text, false),
        ('public._execute_furnishings_authorization_authorized(uuid,text,uuid,text)'::text, false),
        ('public._execute_furnishings_authorization_on_paper_authorized(uuid,text,date,uuid,uuid,jsonb)'::text, false),
        ('public._execute_trade_scope_authorized(uuid,text,uuid,text)'::text, false),
        ('public._execute_trade_scope_on_paper_authorized(uuid,text,date,uuid,uuid)'::text, false),
        ('public.issue_trade_draw_invoice(uuid)'::text, false)
    ),
    positions AS (
      SELECT expected.*,
        LEAST(
          NULLIF(position('FOR SHARE;' IN routine.prosrc), 0),
          NULLIF(position('FOR UPDATE;' IN routine.prosrc), 0)
        ) AS root_lock_position,
        position('PERFORM role.id' IN routine.prosrc) AS role_position,
        position('PERFORM user_role.id' IN routine.prosrc) AS user_role_position,
        LEAST(
          NULLIF(position('PERFORM membership.id' IN routine.prosrc), 0),
          NULLIF(position('PERFORM lead_membership.id' IN routine.prosrc), 0)
        ) AS membership_position,
        position('PERFORM studio.id' IN routine.prosrc) AS studio_position
      FROM expected
      JOIN pg_proc AS routine
        ON routine.oid = to_regprocedure(expected.signature)
    )
    SELECT 1
    FROM positions
    WHERE role_position = 0
       OR user_role_position = 0
       OR membership_position IS NULL
       OR studio_position = 0
       OR NOT (
         role_position < user_role_position
         AND user_role_position < membership_position
         AND membership_position < studio_position
       )
       OR (
         NOT root_is_inherent
         AND (
           root_lock_position IS NULL
           OR NOT (root_lock_position < role_position)
         )
       )
  ) OR (
    SELECT NOT (
      position(
        'FOR UPDATE OF milestone;'
        IN routine.prosrc
      ) < position('FOR SHARE OF item;' IN routine.prosrc)
      AND position('PERFORM studio.id' IN routine.prosrc)
            < position('FOR UPDATE OF milestone;' IN routine.prosrc)
    )
    FROM pg_proc AS routine
    WHERE routine.oid = to_regprocedure(
      'public.create_draft_invoice(uuid,uuid,uuid,uuid,numeric,integer,text,text,jsonb)'
    )
  ) THEN
    RAISE EXCEPTION '00485 canonical root/authority/child lock order drifted';
  END IF;

  IF position(
       'app.proposal_activation_id'
       IN (SELECT routine.prosrc FROM pg_proc AS routine
           WHERE routine.oid =
             to_regprocedure('public.set_project_studio_id()'))
     ) = 0
     OR position(
       'app.commercial_document_id'
       IN (SELECT routine.prosrc FROM pg_proc AS routine
           WHERE routine.oid =
             to_regprocedure('public.set_invoice_studio_id()'))
     ) = 0
  THEN
    RAISE EXCEPTION '00485 trigger row capability is missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc AS routine
    WHERE routine.oid =
      to_regprocedure('public.guard_commercial_signature_insert()')
      AND (
        routine.prosecdef
        OR position('current_user IS DISTINCT FROM ''postgres'''
                    IN routine.prosrc) = 0
        OR position('v_active_role = ''service_role''' IN routine.prosrc) = 0
        OR position('app.commercial_signature_capability'
                    IN routine.prosrc) = 0
        OR position('pg_catalog.txid_current()' IN routine.prosrc) = 0
        OR position('auth.jwt()' IN routine.prosrc) > 0
        OR position('request.jwt.claims' IN routine.prosrc) > 0
      )
  ) THEN
    RAISE EXCEPTION '00485 commercial signature guard authority is wrong';
  END IF;

  IF EXISTS (
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
  ) THEN
    RAISE EXCEPTION '00485 sign/accept sibling invoice audit drifted';
  END IF;

  -- Compared as oids: pg_get_function_identity_arguments renders argument
  -- names, so a hand-built signature string never matches these literals.
  IF EXISTS (
    WITH expected(caller_oid) AS (
      VALUES
        (to_regprocedure('public.issue_trade_draw_invoice(uuid)')::oid),
        (to_regprocedure('public._countersign_design_services_agreement_impl(uuid,text,jsonb)')::oid),
        (to_regprocedure('public._execute_furnishings_authorization_authorized(uuid,text,uuid,text)')::oid),
        (to_regprocedure('public._execute_furnishings_authorization_on_paper_authorized(uuid,text,date,uuid,uuid,jsonb)')::oid),
        (to_regprocedure('public._execute_trade_scope_authorized(uuid,text,uuid,text)')::oid),
        (to_regprocedure('public._execute_trade_scope_on_paper_authorized(uuid,text,date,uuid,uuid)')::oid)
    ),
    actual AS (
      SELECT routine.oid AS caller_oid
      FROM pg_proc AS routine
      JOIN pg_namespace AS namespace ON namespace.oid = routine.pronamespace
      WHERE namespace.nspname <> 'information_schema'
        AND namespace.nspname NOT LIKE 'pg_%'
        AND pg_temp._00485_references_routine(
          routine.prosrc, 'app_private', 'issue_invoice_for_actor'
        )
    )
    SELECT 1
    FROM (
      (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)
      UNION ALL
      (SELECT * FROM actual EXCEPT ALL SELECT * FROM expected)
    ) AS drift
  ) THEN
    RAISE EXCEPTION '00485 private invoice core caller universe is wrong';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      (
        'public._execute_furnishings_authorization_authorized(uuid,text,uuid,text)',
        '''commercialDocumentId''',
        'app_private.issue_invoice_for_actor( v_deposit_invoice_id, current_date, v_actor )'
      ),
      (
        'public._execute_furnishings_authorization_on_paper_authorized(uuid,text,date,uuid,uuid,jsonb)',
        '''commercialDocumentId''',
        'app_private.issue_invoice_for_actor( v_deposit_invoice_id, current_date, v_recorder )'
      ),
      (
        'public._execute_trade_scope_authorized(uuid,text,uuid,text)',
        '''tradeScopeDocumentId''',
        'app_private.issue_invoice_for_actor( v_deposit_invoice_id, current_date, v_actor )'
      ),
      (
        'public._execute_trade_scope_on_paper_authorized(uuid,text,date,uuid,uuid)',
        '''tradeScopeDocumentId''',
        'app_private.issue_invoice_for_actor( v_deposit_invoice_id, current_date, v_recorder )'
      ),
      (
        'public._countersign_design_services_agreement_impl(uuid,text,jsonb)',
        '''commercialDocumentId''',
        'app_private.issue_invoice_for_actor( v_retainer_invoice_id, current_date, v_actor )'
      ),
      (
        'public.issue_trade_draw_invoice(uuid)',
        '''tradeScopeDocumentId''',
        'app_private.issue_invoice_for_actor( v_invoice_id, current_date, v_actor )'
      )
    ) AS expected(signature, metadata_key, call_fragment)
    JOIN pg_proc AS routine
      ON routine.oid = to_regprocedure(expected.signature)
    WHERE position(expected.metadata_key IN routine.prosrc) = 0
       OR position(
         expected.call_fragment IN regexp_replace(
           routine.prosrc, '[[:space:]]+', ' ', 'g'
         )
       ) = 0
  ) THEN
    RAISE EXCEPTION '00485 invoice core caller metadata/actor contract is wrong';
  END IF;
END
$postconditions$;

COMMIT;
