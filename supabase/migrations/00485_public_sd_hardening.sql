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
    '83ce7c6fc8abb7ed5f48e4c12055d1a05d425d3bd2476f0dbb6c0b41c02b850b', ARRAY['authenticated']::text[],
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
    'b20d24b78c8169b238cfb2357c9ecde725d584098a340dad50b91ed78ebefeeb', ARRAY['authenticated']::text[],
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
    '0ed300c4553b9abe69011c31c11ea3598128d0222fa6c69cc76f51b9e24b3f81', ARRAY['authenticated', 'service_role']::text[],
    ARRAY[]::text[]
  ),
  (
    'public.set_project_studio_id()',
    '00317_projects_studio_id_maintenance.sql', 'plpgsql', '',
    'trigger', 'v', ARRAY['search_path=public']::text[],
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '04b921692fd72c03a2137e413c76d997435bafb3c29d2506e8b3fa14d8f6ce20',
    '48d694002b2a847d338623fea532187d7b1a85af38165db09578c066aac458a3', ARRAY['authenticated', 'service_role']::text[],
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
    'cdadc449f368eb12d56d0006e3ccb81d752bdc3388f783e4cd1a6b414923bb84',
    ARRAY[]::text[], ARRAY[]::text[]
  ),
  (
    'public._execute_trade_scope_authorized(uuid,text,uuid,text)',
    'plpgsql',
    'p_proposal_id uuid, p_signed_name text, p_client_id uuid, p_trusted_signed_ip text DEFAULT NULL::text',
    'jsonb', 'v', ARRAY['search_path=public, pg_temp']::text[],
    ARRAY['search_path=pg_catalog, public, pg_temp']::text[],
    '152b51f7bcd3b7a17a6f88967da0fef1648d95f46eea58334ed2ce2a2f917f5c',
    '3f8d36043d9d38c275fa802690205a67104add2654eb818a08d5bf7bcdb85a36',
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
    '798a148aff056c85b03abfac11f0f5f6cfba0800136b668fbbc31fbe7ca6318f',
    ARRAY[]::text[], ARRAY[]::text[]
  );

UPDATE _00485_dependency_profile
SET original_security_definer = false,
    final_security_definer = false
WHERE signature = 'public.guard_commercial_signature_insert()';

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
             '7ef09b2c21c929069960e460641c268093575c205c7d114675c1dc56962f2789'
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
             ARRAY['studio_id','designer_id','client_id','proposal_id'],
             attname
           ))
         FROM pg_attribute
         WHERE attrelid = 'public.projects'::regclass
           AND attname = ANY(
             ARRAY['studio_id','designer_id','client_id','proposal_id']
           )),
        NULL::text, 0::oid,
        'createtriggerset_project_studio_idbeforeinsertorupdateofstudio_id,designer_id,client_id,proposal_idonprojectsforeachrowexecutefunctionset_project_studio_id()'::text
      ),
      (
        'public.invoices'::text, 'set_invoice_studio_id'::text,
        'public.set_invoice_studio_id()'::text, 'O'::"char", false,
        23::smallint, 0::smallint, ''::text,
        (SELECT string_agg(attnum::text, ' ' ORDER BY array_position(
           ARRAY['studio_id','designer_id','client_id','project_id'], attname))
         FROM pg_attribute
         WHERE attrelid = 'public.invoices'::regclass
           AND attname = ANY(
             ARRAY['studio_id','designer_id','client_id','project_id']
           )),
        NULL::text, 0::oid,
        'createtriggerset_invoice_studio_idbeforeinsertorupdateofstudio_id,designer_id,client_id,project_idoninvoicesforeachrowexecutefunctionset_invoice_studio_id()'::text
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
             OR NOT public._can_author_proposal(v_proposal.designer_id)
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
         OR NOT public._can_author_proposal(v_proposal.designer_id)
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
  v_postgres_migration boolean :=
    session_user = 'postgres' AND v_active_role IN ('none', 'postgres');
BEGIN
  IF NEW.studio_id IS NULL AND NEW.designer_id IS NOT NULL THEN
    NEW.studio_id := public._primary_studio_for(NEW.designer_id);
  END IF;

  -- Only a true migration session may preserve a legacy ownerless NULL tuple.
  IF v_postgres_migration
     AND NEW.designer_id IS NULL
     AND NEW.studio_id IS NULL
  THEN
    RETURN NEW;
  END IF;

  IF NEW.designer_id IS NULL
     OR NEW.studio_id IS NULL
     OR (
       NEW.proposal_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM public.proposals AS proposal
         WHERE proposal.id = NEW.proposal_id
           AND proposal.designer_id = NEW.designer_id
           AND proposal.client_id = NEW.client_id
           AND (
             proposal.project_id IS NULL
             OR proposal.project_id = NEW.id
           )
       )
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.organizations AS studio
       JOIN public.organization_members AS lead_membership
         ON lead_membership.organization_id = studio.id
       WHERE studio.id = NEW.studio_id
         AND studio.type = 'design_studio'
         AND studio.status = 'active'
         AND lead_membership.user_id = NEW.designer_id
         AND lead_membership.status = 'active'
         AND lead_membership.role <> 'guest'
     )
  THEN
    RAISE EXCEPTION 'studio_id_not_designer_studio';
  END IF;

  IF v_active_role = 'authenticated' THEN
    IF current_user IS DISTINCT FROM 'postgres' OR v_actor IS NULL THEN
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.organization_members AS actor_membership
      WHERE actor_membership.organization_id = NEW.studio_id
        AND actor_membership.user_id = v_actor
        AND actor_membership.status = 'active'
        AND actor_membership.role <> 'guest'
    ) THEN
      RETURN NEW;
    END IF;

    SELECT * INTO v_proposal
    FROM public.proposals AS proposal
    WHERE proposal.id = NEW.proposal_id
    FOR SHARE;
    IF NOT FOUND
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
  v_commercial_document_id text :=
    current_setting('app.commercial_document_id', true);
  v_postgres_migration boolean :=
    session_user = 'postgres' AND v_active_role IN ('none', 'postgres');
BEGIN
  IF NEW.studio_id IS NULL THEN
    SELECT project.studio_id INTO NEW.studio_id
    FROM public.projects AS project
    WHERE project.id = NEW.project_id;
  END IF;

  IF NEW.project_id IS NULL
     OR NEW.designer_id IS NULL
     OR NEW.studio_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.projects AS project
       JOIN public.organizations AS studio ON studio.id = project.studio_id
       JOIN public.organization_members AS lead_membership
         ON lead_membership.organization_id = project.studio_id
       WHERE project.id = NEW.project_id
         AND project.status = 'active'
         AND project.designer_id = NEW.designer_id
         AND project.client_id = NEW.client_id
         AND project.studio_id = NEW.studio_id
         AND studio.type = 'design_studio'
         AND studio.status = 'active'
         AND lead_membership.user_id = NEW.designer_id
         AND lead_membership.status = 'active'
         AND lead_membership.role <> 'guest'
     )
  THEN
    RAISE EXCEPTION 'studio_id_not_designer_studio';
  END IF;

  IF v_active_role = 'authenticated' THEN
    IF current_user IS DISTINCT FROM 'postgres' OR v_actor IS NULL THEN
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.organization_members AS actor_membership
      WHERE actor_membership.organization_id = NEW.studio_id
        AND actor_membership.user_id = v_actor
        AND actor_membership.status = 'active'
        AND actor_membership.role <> 'guest'
    ) THEN
      RETURN NEW;
    END IF;

    IF v_actor IS DISTINCT FROM NEW.client_id
       OR NULLIF(v_commercial_document_id, '') IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM public.project_commercial_documents AS document
         JOIN public.proposals AS proposal
           ON proposal.id = document.proposal_id
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
           AND proposal.designer_id = NEW.designer_id
           AND proposal.client_id = NEW.client_id
           AND proposal.commercial_state = 'executed'
       )
    THEN
      RAISE EXCEPTION 'studio_id_not_designer_studio';
    END IF;
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
  BEFORE INSERT OR UPDATE OF studio_id, designer_id, client_id, proposal_id
  ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_project_studio_id();

DROP TRIGGER IF EXISTS set_invoice_studio_id ON public.invoices;
CREATE TRIGGER set_invoice_studio_id
  BEFORE INSERT OR UPDATE OF studio_id, designer_id, client_id, project_id
  ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_invoice_studio_id();

COMMENT ON FUNCTION public.set_project_studio_id() IS
  'Invoker trigger deriving studio_id before validation. Every tuple requires an active design-studio and active non-guest lead. An authenticated owner-core call requires either an active non-guest actor in that exact studio or the exact client plus the transaction-bound accepted-proposal activation capability; direct authenticated DML fails. service_role may omit auth.uid but cannot bypass tuple validity. Only a true postgres migration may retain a legacy NULL designer_id/NULL studio_id tuple.';

COMMENT ON FUNCTION public.set_invoice_studio_id() IS
  'Invoker trigger deriving studio_id from the invoice project before validation. Every tuple requires exact active project/designer/client/studio equality, an active design-studio, and active non-guest lead. An authenticated owner-core call requires either an active non-guest actor in that exact studio or the exact client plus an exact transaction-bound commercial-document capability; direct authenticated DML fails. service_role and postgres may omit auth.uid but cannot bypass tuple validity.';

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
  v_project_id uuid := NULLIF(p_request->>'projectId', '')::uuid;
  v_actor uuid := auth.uid();
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
  'Publishes a project review only after a non-enumerating authorization read proves an active project/studio tuple and the real actor is the lead or an active non-guest member of that exact project studio; board/media reads occur afterward.';

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
  v_anchor_count integer;
  v_line_count integer;
  v_subtotal bigint;
  v_tax integer;
  v_number integer;
  v_due date;
  v_studio_id uuid;
BEGIN
  SELECT invoice, project
  INTO v_invoice, v_project
  FROM public.invoices AS invoice
  JOIN public.projects AS project ON project.id = invoice.project_id
  WHERE invoice.id = p_invoice_id
  FOR UPDATE OF project, invoice;

  IF NOT FOUND OR p_actor_id IS NULL THEN
    RAISE EXCEPTION
      'issue_invoice: invoice not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  WITH anchors AS (
    SELECT DISTINCT document.id, document.proposal_id, anchor.anchor_kind
    FROM public.invoice_line_items AS line
    CROSS JOIN LATERAL (VALUES
      ('furnishings_authorization'::text,
       NULLIF(line.metadata->>'commercialDocumentId', '')),
      ('trade_scope'::text,
       NULLIF(line.metadata->>'tradeScopeDocumentId', ''))
    ) AS anchor(anchor_kind, document_id_text)
    JOIN public.project_commercial_documents AS document
      ON document.id::text = anchor.document_id_text
     AND document.document_kind = anchor.anchor_kind
    WHERE line.invoice_id = p_invoice_id
  )
  SELECT count(*) INTO v_anchor_count FROM anchors;

  IF v_anchor_count <> 1 THEN
    RAISE EXCEPTION
      'issue_invoice: invoice not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT document, proposal
  INTO v_document, v_proposal
  FROM public.project_commercial_documents AS document
  JOIN public.proposals AS proposal ON proposal.id = document.proposal_id
  WHERE EXISTS (
      SELECT 1
      FROM public.invoice_line_items AS line
      WHERE line.invoice_id = p_invoice_id
        AND (
          (
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
    AND proposal.designer_id = v_project.designer_id
    AND proposal.client_id = v_project.client_id
    AND v_invoice.project_id = v_project.id
    AND v_invoice.designer_id = proposal.designer_id
    AND v_invoice.client_id = proposal.client_id
    AND v_invoice.studio_id = v_project.studio_id
  FOR UPDATE OF document, proposal;

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
  'Owner-only invoice issuance core. Resolves exactly one furnishings/trade commercial anchor from invoice-line metadata, locks and validates exact invoice/project/proposal/document identities plus the canonical active studio tuple (commercial proposals intentionally may retain NULL project_id), then accepts only the exact client or an active non-guest actor in that exact studio.';

REVOKE ALL PRIVILEGES ON FUNCTION
  app_private.issue_invoice_for_actor(uuid, date, uuid)
FROM PUBLIC, anon, authenticated, service_role;

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
BEGIN
  IF v_actor IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION
      'furnishings execution requires an authenticated client and legal name'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_proposal
  FROM public.proposals
  WHERE id = p_proposal_id
  FOR UPDATE;
  IF NOT FOUND
     OR v_proposal.client_id IS DISTINCT FROM v_actor
     OR v_proposal.document_kind <> 'furnishings_authorization'
  THEN
    RAISE EXCEPTION
      'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_document
  FROM public.project_commercial_documents
  WHERE proposal_id = p_proposal_id
  FOR UPDATE;
  IF v_document.id IS NULL THEN
    RAISE EXCEPTION 'furnishings authorization has no project binding'
      USING ERRCODE = 'check_violation';
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
        v_document.project_id, v_proposal.designer_id, v_proposal.client_id,
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
  'Owner-only client furnishings execution core. Preserves the explicit verified client actor and delegates any deposit invoice issuance to the relational app_private core without rewriting request JWT claims.';

REVOKE ALL PRIVILEGES ON FUNCTION
  public._execute_furnishings_authorization_authorized(
    uuid, text, uuid, text
  )
FROM PUBLIC, anon, authenticated, service_role;

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
BEGIN
  IF v_actor IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION
      'trade scope execution requires an authenticated client and legal name'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_proposal
  FROM public.proposals
  WHERE id = p_proposal_id
  FOR UPDATE;
  IF NOT FOUND
     OR v_proposal.client_id IS DISTINCT FROM v_actor
     OR v_proposal.document_kind <> 'trade_scope'
  THEN
    RAISE EXCEPTION 'trade scope % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_document
  FROM public.project_commercial_documents
  WHERE proposal_id = p_proposal_id
  FOR UPDATE;
  IF v_document.id IS NULL THEN
    RAISE EXCEPTION 'trade scope has no project binding'
      USING ERRCODE = 'check_violation';
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
      v_document.project_id, v_proposal.designer_id, v_proposal.client_id,
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
  'Owner-only client trade-scope execution core. Preserves the explicit verified client actor and delegates deposit invoice issuance to the relational app_private core without rewriting request JWT claims.';

REVOKE ALL PRIVILEGES ON FUNCTION
  public._execute_trade_scope_authorized(uuid, text, uuid, text)
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
  v_project public.projects%ROWTYPE;
  v_terms public.trade_scope_terms%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_invoice_id uuid;
  v_unpaid integer;
  v_previous_draw text :=
    current_setting('app.trade_draw_invoice_id', true);
  v_previous_commercial text :=
    current_setting('app.commercial_document_id', true);
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'trade scope draw not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT draw, proposal, document, project
  INTO v_draw, v_proposal, v_document, v_project
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
    AND proposal.designer_id = project.designer_id
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
    )
  FOR UPDATE OF draw, proposal, document, project;
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
    v_document.project_id, v_proposal.designer_id, v_proposal.client_id,
    'draft', COALESCE(v_terms.currency, 'USD'),
    v_draw.amount_cents, 0, 0, v_draw.amount_cents,
    'Trade scope draw · ' || v_draw.label
  )
  RETURNING * INTO v_invoice;
  PERFORM set_config(
    'app.commercial_document_id', COALESCE(v_previous_commercial, ''), true
  );
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
    'app.commercial_document_id', COALESCE(v_previous_commercial, ''), true
  );
  PERFORM set_config(
    'app.trade_draw_invoice_id', COALESCE(v_previous_draw, ''), true
  );
  RAISE;
END;
$$;

COMMENT ON FUNCTION public.issue_trade_draw_invoice(uuid) IS
  'Issues one trade-scope draw only after the initial locked read proves the real caller is the lead or an active non-guest member of the exact canonical project studio; invoice issuance retains that actor through the owner-only relational core.';

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
  public._execute_furnishings_authorization_authorized(
    uuid, text, uuid, text
  ),
  public._execute_trade_scope_authorized(uuid, text, uuid, text),
  public._prepare_spec_book_issue_00403(
    uuid, text[], text, text, uuid, text, jsonb
  ),
  public._publish_project_review_00448_impl(jsonb),
  public.guard_commercial_signature_insert(),
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

  IF (SELECT count(*) FROM _00485_dependency_profile) <> 5 THEN
    RAISE EXCEPTION '00485 dependency manifest must contain exactly five rows';
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
             '7ef09b2c21c929069960e460641c268093575c205c7d114675c1dc56962f2789'
      )
  ) OR to_regprocedure(
    'app_private.issue_invoice_for_actor(uuid,date,uuid)'
  ) IS NULL THEN
    RAISE EXCEPTION '00485 private invoice core profile is wrong';
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
               ARRAY['studio_id','designer_id','client_id','proposal_id'],
               attname
             ))
           FROM pg_attribute
           WHERE attrelid = 'public.projects'::regclass
             AND attname = ANY(
               ARRAY['studio_id','designer_id','client_id','proposal_id']
             )),
          NULL::text, 0::oid,
          'createtriggerset_project_studio_idbeforeinsertorupdateofstudio_id,designer_id,client_id,proposal_idonprojectsforeachrowexecutefunctionset_project_studio_id()'::text
        ),
        (
          'public.invoices'::text, 'set_invoice_studio_id'::text,
          'public.set_invoice_studio_id()'::text, 'O'::"char", false,
          23::smallint, 0::smallint, ''::text,
          (SELECT string_agg(attnum::text, ' ' ORDER BY array_position(
             ARRAY['studio_id','designer_id','client_id','project_id'],
             attname))
           FROM pg_attribute
           WHERE attrelid = 'public.invoices'::regclass
             AND attname = ANY(
               ARRAY['studio_id','designer_id','client_id','project_id']
             )),
          NULL::text, 0::oid,
          'createtriggerset_invoice_studio_idbeforeinsertorupdateofstudio_id,designer_id,client_id,project_idoninvoicesforeachrowexecutefunctionset_invoice_studio_id()'::text
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
        'public._execute_trade_scope_authorized(uuid,text,uuid,text)'
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

  IF EXISTS (
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
  ) THEN
    RAISE EXCEPTION '00485 private invoice core caller universe is wrong';
  END IF;

  IF EXISTS (
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
      (
        'public.issue_trade_draw_invoice(uuid)',
        '''tradeScopeDocumentId'''
      )
    ) AS expected(signature, metadata_key)
    JOIN pg_proc AS routine
      ON routine.oid = to_regprocedure(expected.signature)
    WHERE position(expected.metadata_key IN routine.prosrc) = 0
  ) THEN
    RAISE EXCEPTION '00485 invoice core caller metadata anchor is missing';
  END IF;
END
$postconditions$;

COMMIT;
