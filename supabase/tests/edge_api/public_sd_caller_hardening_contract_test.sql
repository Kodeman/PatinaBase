-- Caller-backed public SECURITY DEFINER hardening contract (00486).
-- Run only through:
--   ./scripts/run-public-acl-psql.sh local supabase/tests/edge_api/public_sd_caller_hardening_contract_test.sql

\set ON_ERROR_STOP on

BEGIN;

SET LOCAL plpgsql.check_asserts = on;
DO $assertion_preflight$
BEGIN
  IF current_setting('plpgsql.check_asserts') <> 'on' THEN
    RAISE EXCEPTION '00486 test requires plpgsql.check_asserts=on';
  END IF;
END
$assertion_preflight$;

CREATE TEMP TABLE _00486_expected (
  signature text PRIMARY KEY,
  arguments text NOT NULL,
  result_type text NOT NULL,
  volatility "char" NOT NULL,
  config text[] NOT NULL,
  body_sha256 text NOT NULL,
  direct_roles text[] NOT NULL,
  denied_sql text NOT NULL
) ON COMMIT DROP;

INSERT INTO _00486_expected VALUES
  (
    'public.activate_project_v2(jsonb)', 'input jsonb', 'uuid', 'v',
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    'ce52adc26b3621a5e4f108255e2b2a4501fe627e1547d33164eaf27532de8412',
    ARRAY['authenticated'],
    $call$SELECT public.activate_project_v2('{"name":"ACL denial"}'::jsonb)$call$
  ),
  (
    'public.apply_scope_change(uuid)', 'p_request_id uuid', 'void', 'v',
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    '872ca9a93970283ef59b2f47c737bc27c41107e7a37a3eddf7d36c2a12e1f22c',
    ARRAY['authenticated'],
    $call$SELECT public.apply_scope_change('48600000-0000-4000-8000-00000000ff01')$call$
  ),
  (
    'public.claim_proposal_send_dispatch(uuid,uuid,timestamp with time zone,integer)',
    'p_dispatch_id uuid, p_proposal_id uuid, p_sent_at timestamp with time zone, p_lease_seconds integer DEFAULT 30',
    'jsonb', 'v', ARRAY['search_path=pg_catalog, public, pg_temp'],
    'dc0941ea855815d760cf34277d3a86a4c7755af7df834eacb4ce628f7b9af713',
    ARRAY['service_role'],
    $call$SELECT public.claim_proposal_send_dispatch('48600000-0000-4000-8000-00000000ff02','48600000-0000-4000-8000-00000000ff03',clock_timestamp(),30)$call$
  ),
  (
    'public.close_project(uuid,jsonb,jsonb)',
    'p_project_id uuid, p_closure jsonb DEFAULT NULL::jsonb, p_snapshot jsonb DEFAULT NULL::jsonb',
    'public.projects', 'v', ARRAY['search_path=pg_catalog, public, pg_temp'],
    '221969f68e6e9ac7b1597eaca00ef05e125bfcd628e2391b0a23bdae068d06cb',
    ARRAY['authenticated'],
    $call$SELECT public.close_project('48600000-0000-4000-8000-00000000ff04',NULL,NULL)$call$
  ),
  (
    'public.create_field_link(uuid)', 'p_party_id uuid',
    'TABLE(id uuid, token text)', 'v',
    ARRAY['search_path=pg_catalog, public, extensions, pg_temp'],
    '7f6d4798893a9c22184ce5110606c9195ca92f05add06e110abebf5583e31c84',
    ARRAY['authenticated', 'service_role'],
    $call$SELECT * FROM public.create_field_link('48600000-0000-4000-8000-00000000ff05')$call$
  ),
  (
    'public.decline_proposal(uuid,text)',
    'p_proposal_id uuid, p_reason text DEFAULT NULL::text', 'jsonb', 'v',
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    'd5389723981d6d61fd4a945bc86a4e2aae4a0521b93be0fca3fb6551639143a6',
    ARRAY['authenticated'],
    $call$SELECT public.decline_proposal('48600000-0000-4000-8000-00000000ff06',NULL)$call$
  ),
  (
    'public.escalate_item_feedback_to_decision(uuid,uuid)',
    'p_feedback_id uuid, p_decision_id uuid', 'public.item_feedback', 'v',
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    '34c5639f9983cbf154c6a72ae133961038de2f3abd84b37b9fa5de68c05a06f0',
    ARRAY['authenticated'],
    $call$SELECT public.escalate_item_feedback_to_decision('48600000-0000-4000-8000-00000000ff07','48600000-0000-4000-8000-00000000ff08')$call$
  ),
  (
    'public.expire_due_client_decisions(timestamp with time zone)',
    'p_cutoff timestamp with time zone', 'TABLE(id uuid)', 'v',
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    '7b04e11e9d9636789b72ade7d905f8450ad7224c7e024f8ef06b49741c407c34',
    ARRAY['service_role'],
    $call$SELECT * FROM public.expire_due_client_decisions(clock_timestamp())$call$
  ),
  (
    'public.finalize_spec_book_issue(uuid)', 'p_revision_id uuid',
    'public.spec_book_revisions', 'v',
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    'd86404d2a0eb529bc25cf48c86ad0b2e87bd91eb07d8f4d8699f2feea3b6d310',
    ARRAY['service_role'],
    $call$SELECT public.finalize_spec_book_issue('48600000-0000-4000-8000-00000000ff09')$call$
  ),
  (
    'public.generate_milestone_invoice(uuid)', 'p_milestone_id uuid',
    'uuid', 'v', ARRAY['search_path=pg_catalog, public, pg_temp'],
    '3d8a4697f0971fc3d3fb55d3939080eaa36edae539e86467236e6ef9bc8be3ae',
    ARRAY['authenticated'],
    $call$SELECT public.generate_milestone_invoice('48600000-0000-4000-8000-00000000ff0a')$call$
  ),
  (
    'public.get_ab_variant_stats(uuid)', 'p_campaign_id uuid',
    'TABLE(variant text, sent bigint, delivered bigint, opened bigint, clicked bigint, bounced bigint)',
    's', ARRAY['search_path=pg_catalog, public, pg_temp'],
    'b53e8f9fcf9ba425b1093b2b85a6bac195012d39f6fe5a6b49d9fa3a94abaf97',
    ARRAY['authenticated'],
    $call$SELECT * FROM public.get_ab_variant_stats('48600000-0000-4000-8000-00000000ff0b')$call$
  ),
  (
    'public.get_client_project_review_bundle(uuid)', 'p_edition_id uuid',
    'jsonb', 'v', ARRAY['search_path=pg_catalog, public, pg_temp'],
    '894f816c2c40ea0a8d50b014cf698700455eba50fca33d4b5d6f15541c45d67d',
    ARRAY['authenticated'],
    $call$SELECT public.get_client_project_review_bundle('48600000-0000-4000-8000-00000000ff0c')$call$
  ),
  (
    'public.mark_proposal_viewed(uuid)', 'p_proposal_id uuid', 'jsonb', 'v',
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    '3beeb2e41bfbd217c041ada2778b485fa5958b99474cb71cfa8d2f242e9bd5e4',
    ARRAY['authenticated'],
    $call$SELECT public.mark_proposal_viewed('48600000-0000-4000-8000-00000000ff0d')$call$
  ),
  (
    'public.mint_trade_rfq_token(uuid)', 'p_rfq_id uuid',
    'TABLE(id uuid, token text)', 'v',
    ARRAY['search_path=pg_catalog, public, extensions, pg_temp'],
    '36486c8831b50682f397c110582e440bd069ceff48f5a783ef0d2e2b0f600c04',
    ARRAY['service_role'],
    $call$SELECT * FROM public.mint_trade_rfq_token('48600000-0000-4000-8000-00000000ff0e')$call$
  ),
  (
    'public.persist_proposal_send_request(uuid,uuid,text,text,text[],text[],text,boolean)',
    'p_dispatch_id uuid, p_claim_token uuid, p_request_body text, p_from text, p_to text[], p_cc text[], p_subject text, p_dry_run boolean',
    'jsonb', 'v', ARRAY['search_path=pg_catalog, public, pg_temp'],
    '9363749c1c2ff219327692fa17aa910f3f8c53789e2d6c41dffcb53b2eb08ce6',
    ARRAY['service_role'],
    $call$SELECT public.persist_proposal_send_request('48600000-0000-4000-8000-00000000ff0f','48600000-0000-4000-8000-00000000ff10','{}','sender@test.invalid',ARRAY['recipient@test.invalid'],ARRAY[]::text[],'Subject',false)$call$
  ),
  (
    'public.read_proposal_send_dispatch(uuid,uuid,timestamp with time zone)',
    'p_dispatch_id uuid, p_proposal_id uuid, p_sent_at timestamp with time zone',
    'jsonb', 'v', ARRAY['search_path=pg_catalog, public, pg_temp'],
    '90185476e830e30d83fa883b8e5c19d9fe8452e7cdea9488694e6f671cee8b76',
    ARRAY['service_role'],
    $call$SELECT public.read_proposal_send_dispatch('48600000-0000-4000-8000-00000000ff11','48600000-0000-4000-8000-00000000ff12',clock_timestamp())$call$
  ),
  (
    'public.reassign_project_lead(uuid,uuid,uuid)',
    'p_project_id uuid, p_expected_designer_id uuid, p_new_designer_id uuid',
    'public.projects', 'v', ARRAY['search_path=pg_catalog, public, pg_temp'],
    'ecd3a45f5b3fa642ffcb97a56852eb52422328a40f7de0744f875aab195f7f10',
    ARRAY['authenticated'],
    $call$SELECT public.reassign_project_lead('48600000-0000-4000-8000-00000000ff13','48600000-0000-4000-8000-00000000ff14','48600000-0000-4000-8000-00000000ff15')$call$
  ),
  (
    'public.record_offline_signature(uuid,text,boolean,date)',
    'p_proposal_id uuid, p_signed_name text, p_auto_activate boolean DEFAULT true, p_start_date date DEFAULT CURRENT_DATE',
    'uuid', 'v', ARRAY['search_path=pg_catalog, public, pg_temp'],
    '6ec4d41a86390dc6c40999fcb7b0d889a0e5c35f3405c8d585e8bf266848a61e',
    ARRAY['authenticated'],
    $call$SELECT public.record_offline_signature('48600000-0000-4000-8000-00000000ff16','Denied Signer',false,current_date)$call$
  ),
  (
    'public.reply_to_item_feedback(uuid,text)',
    'p_feedback_id uuid, p_body text', 'public.item_feedback_events', 'v',
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    '31fd570f78940073f4b22c176123630cd4f6541190248f43176072700f1994f5',
    ARRAY['authenticated'],
    $call$SELECT public.reply_to_item_feedback('48600000-0000-4000-8000-00000000ff17','Denied reply')$call$
  ),
  (
    'public.request_proposal_change(uuid,text)',
    'p_proposal_id uuid, p_feedback text', 'void', 'v',
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    '2824a784697aa0c147e1f44f9602019df40c06d24d568e361ab4dbe887a3c741',
    ARRAY['authenticated'],
    $call$SELECT public.request_proposal_change('48600000-0000-4000-8000-00000000ff18','Denied change')$call$
  ),
  (
    'public.review_sms_message(uuid,text,jsonb)',
    'p_message_id uuid, p_action text, p_effect jsonb DEFAULT NULL::jsonb',
    'jsonb', 'v', ARRAY['search_path=pg_catalog, public, pg_temp'],
    '4340299ab8650ca93c37d41ea23068de441977ebece540c454adfbc6feec365c',
    ARRAY['authenticated'],
    $call$SELECT public.review_sms_message('48600000-0000-4000-8000-00000000ff19','dismiss',NULL)$call$
  ),
  (
    'public.stamp_project_approval_reminder_delivery(uuid,uuid)',
    'p_decision_id uuid, p_decision_lead_id uuid', 'public.client_decisions', 'v',
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    '5fa829cfcb44ee9c1628ba520102322b25bb0072404d87309302dc1ee93538b5',
    ARRAY['service_role'],
    $call$SELECT public.stamp_project_approval_reminder_delivery('48600000-0000-4000-8000-00000000ff1a','48600000-0000-4000-8000-00000000ff1b')$call$
  ),
  (
    'public.submit_coordination_revision(uuid,jsonb,text,text,uuid)',
    'p_item_id uuid, p_attachments jsonb DEFAULT ''[]''::jsonb, p_note text DEFAULT NULL::text, p_status text DEFAULT ''submitted''::text, p_submitted_by uuid DEFAULT NULL::uuid',
    'public.coordination_item_revisions', 'v',
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    '80c7f88c6b63600a5048183071c2e7569bd22c9c504d86bef9216e178a0a3cf8',
    ARRAY['authenticated'],
    $call$SELECT public.submit_coordination_revision('48600000-0000-4000-8000-00000000ff1c','[]',NULL,'submitted','48600000-0000-4000-8000-00000000ff1d')$call$
  ),
  (
    'public.sync_proposal_send_email_log(uuid)', 'p_dispatch_id uuid',
    'void', 'v', ARRAY['search_path=pg_catalog, public, pg_temp'],
    'd243e7f184a6e8dd751335df800c8b5c4917a7aaf433d5d25c5ab5e82632966c',
    ARRAY['service_role'],
    $call$SELECT public.sync_proposal_send_email_log('48600000-0000-4000-8000-00000000ff1e')$call$
  ),
  (
    'public.sync_proposal_send_in_app_log(uuid)', 'p_dispatch_id uuid',
    'void', 'v', ARRAY['search_path=pg_catalog, public, pg_temp'],
    'ebb32f2da4ee004852e54c7d2d1c2eef55faef758e31a47ee0338f050c05709f',
    ARRAY['service_role'],
    $call$SELECT public.sync_proposal_send_in_app_log('48600000-0000-4000-8000-00000000ff1f')$call$
  );

DO $catalog_contract$
BEGIN
  ASSERT (SELECT count(*) = 25 FROM _00486_expected),
    '00486 test manifest must contain exactly 25 routines';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM _00486_expected AS expected
    LEFT JOIN pg_proc AS routine
      ON routine.oid = to_regprocedure(expected.signature)
    LEFT JOIN pg_roles AS owner ON owner.oid = routine.proowner
    LEFT JOIN pg_language AS language ON language.oid = routine.prolang
    WHERE routine.oid IS NULL
       OR owner.rolname IS DISTINCT FROM 'postgres'
       OR language.lanname IS DISTINCT FROM 'plpgsql'
       OR routine.prokind IS DISTINCT FROM 'f'::"char"
       OR NOT routine.prosecdef
       OR routine.proleakproof
       OR routine.proisstrict
       OR routine.proparallel IS DISTINCT FROM 'u'::"char"
       OR routine.provolatile IS DISTINCT FROM expected.volatility
       OR pg_get_function_arguments(routine.oid) IS DISTINCT FROM expected.arguments
       OR pg_get_function_result(routine.oid) IS DISTINCT FROM expected.result_type
       OR routine.proconfig IS DISTINCT FROM expected.config
       OR encode(
            extensions.digest(convert_to(routine.prosrc, 'UTF8'), 'sha256'),
            'hex'
          ) IS DISTINCT FROM expected.body_sha256
       OR COALESCE((
            SELECT array_agg(
              COALESCE(grantee.rolname, 'PUBLIC')
              ORDER BY COALESCE(grantee.rolname, 'PUBLIC')
            )
            FROM aclexplode(
              COALESCE(routine.proacl, acldefault('f', routine.proowner))
            ) AS acl
            LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
            WHERE acl.privilege_type = 'EXECUTE'
          ), ARRAY[]::text[]) IS DISTINCT FROM (
            SELECT array_agg(role_name ORDER BY role_name)
            FROM unnest(
              array_append(expected.direct_roles, 'postgres')
            ) AS role_name
          )
       OR EXISTS (
            SELECT 1
            FROM aclexplode(
              COALESCE(routine.proacl, acldefault('f', routine.proowner))
            ) AS acl
            WHERE acl.privilege_type <> 'EXECUTE'
               OR acl.grantor <> routine.proowner
               OR acl.is_grantable
          )
  ), '00486 final owner/language/kind/flags/arguments/result/body/config/ACL drifted';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM _00486_expected AS expected
    CROSS JOIN unnest(ARRAY[
      'anon', 'authenticated', 'service_role', 'dashboard_user',
      'agent_reader', 'agent_writer', 'edge_catalog_reader', 'edge_rls_user'
    ]) AS app_role(role_name)
    WHERE has_function_privilege(
            app_role.role_name, expected.signature, 'EXECUTE'
          ) IS DISTINCT FROM (app_role.role_name = ANY(expected.direct_roles))
  ), '00486 effective EXECUTE privilege drifted for an application role';
END
$catalog_contract$;

DO $dependency_catalog_contract$
DECLARE
  routine pg_proc%ROWTYPE;
BEGIN
  SELECT * INTO routine
  FROM pg_proc
  WHERE oid =
    'public._finalize_spec_book_issue_00403(uuid)'::regprocedure;
  ASSERT FOUND
     AND pg_get_userbyid(routine.proowner) = 'postgres'
     AND (SELECT lanname = 'plpgsql' FROM pg_language WHERE oid = routine.prolang)
     AND routine.prokind = 'f'::"char"
     AND routine.prosecdef
     AND NOT routine.proleakproof
     AND NOT routine.proisstrict
     AND routine.proparallel = 'u'::"char"
     AND routine.provolatile = 'v'::"char"
     AND pg_get_function_arguments(routine.oid) = 'p_revision_id uuid'
     AND pg_get_function_result(routine.oid) = 'public.spec_book_revisions'
     AND routine.proconfig = ARRAY[
       'search_path=pg_catalog, public, pg_temp'
     ]::text[]
     AND encode(
       extensions.digest(convert_to(routine.prosrc, 'UTF8'), 'sha256'), 'hex'
     ) = '095109b82a35f52c551a203ecbf05b539180ad595644988e511c3af8841668d4',
    'internal spec-book finalizer dependency profile drifted';

  ASSERT (
    SELECT array_agg(
      COALESCE(grantee.rolname, 'PUBLIC')
      ORDER BY COALESCE(grantee.rolname, 'PUBLIC')
    ) = ARRAY['postgres']::text[]
    FROM aclexplode(
      COALESCE(routine.proacl, acldefault('f', routine.proowner))
    ) AS acl
    LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
    WHERE acl.privilege_type = 'EXECUTE'
  ) AND NOT EXISTS (
    SELECT 1
    FROM aclexplode(
      COALESCE(routine.proacl, acldefault('f', routine.proowner))
    ) AS acl
    WHERE acl.privilege_type <> 'EXECUTE'
       OR acl.grantor <> routine.proowner
       OR acl.is_grantable
  ), 'internal spec-book finalizer dependency ACL is not owner-only';
END
$dependency_catalog_contract$;

DO $body_contract$
DECLARE
  body text;
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1
    FROM _00486_expected AS expected
    JOIN pg_proc AS routine ON routine.oid = expected.signature::regprocedure
    WHERE routine.prosrc ~* 'auth[.]role|auth[.]jwt|request[.]jwt'
  ), '00486 bodies must not derive authority from request role claims';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM _00486_expected AS expected
    JOIN pg_proc AS routine ON routine.oid = expected.signature::regprocedure
    WHERE 'service_role' = ANY(expected.direct_roles)
      AND expected.signature <> 'public.create_field_link(uuid)'
      AND routine.prosrc NOT LIKE '%current_setting(''role'', true)%service_role%'
  ), 'each true service path must check the active database role';

  SELECT routine.prosrc INTO body
  FROM pg_proc AS routine
  WHERE routine.oid = 'public.activate_project_v2(jsonb)'::regprocedure;
  ASSERT body LIKE '%public.user_roles%'
     AND body LIKE '%public.roles%'
     AND body LIKE '%role_row.domain::text = ''designer''%'
     AND body LIKE '%public.designer_clients%'
     AND body LIKE '%relationship.status IN (''lead'', ''proposal'', ''active'')%'
     AND body LIKE '%organization.type = ''design_studio''%'
     AND body LIKE '%organization.status = ''active''%'
     AND body LIKE '%membership.status = ''active''%'
     AND body LIKE '%membership.role IN (''owner'', ''admin'', ''member'')%'
     AND body LIKE '%v_team_role NOT IN (''support_designer'', ''bookkeeper'')%'
     AND body LIKE '%v_team_user_id = v_caller_id%'
     AND body LIKE '%v_team_user_id = ANY(v_seen_team)%'
     AND body LIKE '%v_caller_id,%lead_designer%'
     AND body NOT LIKE '%profiles.is_designer%'
     AND body NOT LIKE '%input->>''designer_id''%'
     AND body NOT LIKE '%input->>''created_by''%'
     AND body NOT LIKE '%input->>''assigned_by''%',
    'activate_project_v2 lost a canonical actor/client/studio/team binding';

  SELECT routine.prosrc INTO body
  FROM pg_proc AS routine
  WHERE routine.oid =
    'public.submit_coordination_revision(uuid,jsonb,text,text,uuid)'::regprocedure;
  ASSERT body LIKE '%v_actor uuid := auth.uid()%'
     AND body LIKE '%submitted_by%v_actor%'
     AND body NOT LIKE '%COALESCE(p_submitted_by%'
     AND body NOT LIKE '%may_resolve_coordination_item%'
     AND body NOT LIKE '%auth.role%'
     AND body NOT LIKE '%auth.jwt%',
    'submit_coordination_revision must ignore caller actor/role authority';

  SELECT routine.prosrc INTO body
  FROM pg_proc AS routine
  WHERE routine.oid =
    'public.finalize_spec_book_issue(uuid)'::regprocedure;
  ASSERT body LIKE '%public.spec_book_artifacts%'
     AND body LIKE '%public.project_documents%'
     AND body LIKE '%all requested artifacts must be durable before finalization%'
     AND body NOT LIKE '%_finalize_spec_book_issue_00403%'
     AND body NOT LIKE '%auth.jwt%'
     AND body NOT LIKE '%current_user%',
    'spec-book finalization relayed authority to the legacy claim-aware definer';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'public.apply_scope_change(uuid)',
      'public.generate_milestone_invoice(uuid)',
      'public.get_client_project_review_bundle(uuid)',
      'public.record_offline_signature(uuid,text,boolean,date)',
      'public.submit_coordination_revision(uuid,jsonb,text,text,uuid)'
    ]) AS affected(signature)
    JOIN pg_proc AS routine
      ON routine.oid = affected.signature::regprocedure
    WHERE routine.prosrc ~
      '_can_author_proposal|_can_manage_invoice_owner|is_studio_comember|is_design_studio_comember|may_resolve_coordination_item'
       OR routine.prosrc NOT LIKE '%project.studio_id%'
       OR routine.prosrc NOT LIKE '%organization.type = ''design_studio''%'
       OR routine.prosrc NOT LIKE '%organization.status = ''active''%'
       OR routine.prosrc NOT LIKE '%membership.status = ''active''%'
       OR routine.prosrc NOT LIKE '%membership.role <> ''guest''%'
  ), 'target-studio authorization regressed to generic cross-organization co-membership';
END
$body_contract$;

GRANT SELECT ON _00486_expected TO
  anon, authenticated, service_role, dashboard_user,
  agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;

CREATE OR REPLACE FUNCTION pg_temp.assert_00486_unlisted_denied(
  p_role text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  probe record;
  denied boolean;
BEGIN
  ASSERT current_setting('role', true) = p_role,
    format('role-switch probe expected %s, got %s', p_role, current_setting('role', true));

  FOR probe IN
    SELECT signature, denied_sql
    FROM _00486_expected
    WHERE NOT p_role = ANY(direct_roles)
    ORDER BY signature
  LOOP
    denied := false;
    BEGIN
      EXECUTE probe.denied_sql;
    EXCEPTION WHEN insufficient_privilege THEN
      denied := SQLERRM LIKE 'permission denied for function %';
    END;
    ASSERT denied,
      format('%s reached %s despite having no direct grant', p_role, probe.signature);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_00486_finalizer_dependency_denied()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  denied boolean := false;
BEGIN
  BEGIN
    PERFORM public._finalize_spec_book_issue_00403(
      '48600000-0000-4000-8000-00000000ff20'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    denied := SQLERRM LIKE
      'permission denied for function _finalize_spec_book_issue_00403%';
  END;
  ASSERT denied,
    'retired internal spec-book finalizer remained directly executable';
END;
$$;

GRANT EXECUTE ON FUNCTION pg_temp.assert_00486_unlisted_denied(text) TO
  anon, authenticated, service_role, dashboard_user,
  agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION
  pg_temp.assert_00486_finalizer_dependency_denied()
  TO authenticated, service_role;

SET LOCAL ROLE anon;
SELECT pg_temp.assert_00486_unlisted_denied('anon');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_00486_unlisted_denied('authenticated');
SELECT pg_temp.assert_00486_finalizer_dependency_denied();
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_00486_unlisted_denied('service_role');
SELECT pg_temp.assert_00486_finalizer_dependency_denied();
RESET ROLE;
SET LOCAL ROLE dashboard_user;
SELECT pg_temp.assert_00486_unlisted_denied('dashboard_user');
RESET ROLE;
SET LOCAL ROLE agent_reader;
SELECT pg_temp.assert_00486_unlisted_denied('agent_reader');
RESET ROLE;
SET LOCAL ROLE agent_writer;
SELECT pg_temp.assert_00486_unlisted_denied('agent_writer');
RESET ROLE;
SET LOCAL ROLE edge_catalog_reader;
SELECT pg_temp.assert_00486_unlisted_denied('edge_catalog_reader');
RESET ROLE;
SET LOCAL ROLE edge_rls_user;
SELECT pg_temp.assert_00486_unlisted_denied('edge_rls_user');
RESET ROLE;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('48600000-0000-4000-8000-000000000001', 'sd486-designer-a@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('48600000-0000-4000-8000-000000000002', 'sd486-designer-b@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('48600000-0000-4000-8000-000000000003', 'sd486-client-a@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('48600000-0000-4000-8000-000000000004', 'sd486-client-b@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('48600000-0000-4000-8000-000000000005', 'sd486-support@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('48600000-0000-4000-8000-000000000006', 'sd486-bookkeeper@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('48600000-0000-4000-8000-000000000007', 'sd486-roleless@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('48600000-0000-4000-8000-000000000008', 'sd486-inactive@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('48600000-0000-4000-8000-000000000009', 'sd486-cross-studio@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (
  id, email, full_name, is_designer, created_at, updated_at
)
VALUES
  ('48600000-0000-4000-8000-000000000001', 'sd486-designer-a@test.invalid', '00486 Designer A', true, now(), now()),
  ('48600000-0000-4000-8000-000000000002', 'sd486-designer-b@test.invalid', '00486 Designer B', true, now(), now()),
  ('48600000-0000-4000-8000-000000000003', 'sd486-client-a@test.invalid', '00486 Client A', false, now(), now()),
  ('48600000-0000-4000-8000-000000000004', 'sd486-client-b@test.invalid', '00486 Client B', false, now(), now()),
  ('48600000-0000-4000-8000-000000000005', 'sd486-support@test.invalid', '00486 Support', true, now(), now()),
  ('48600000-0000-4000-8000-000000000006', 'sd486-bookkeeper@test.invalid', '00486 Bookkeeper', false, now(), now()),
  ('48600000-0000-4000-8000-000000000007', 'sd486-roleless@test.invalid', '00486 Mutable Flag Only', true, now(), now()),
  ('48600000-0000-4000-8000-000000000008', 'sd486-inactive@test.invalid', '00486 Inactive Member', true, now(), now()),
  ('48600000-0000-4000-8000-000000000009', 'sd486-cross-studio@test.invalid', '00486 Cross Studio', false, now(), now())
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = EXCLUDED.full_name,
  is_designer = EXCLUDED.is_designer,
  updated_at = EXCLUDED.updated_at;

INSERT INTO public.user_roles (user_id, role_id)
SELECT actor_id, role_row.id
FROM unnest(ARRAY[
  '48600000-0000-4000-8000-000000000001'::uuid,
  '48600000-0000-4000-8000-000000000002'::uuid
]) AS actor(actor_id)
CROSS JOIN public.roles AS role_row
WHERE role_row.name = 'independent_designer'
ON CONFLICT DO NOTHING;

DELETE FROM public.user_roles AS user_role
USING public.roles AS role_row
WHERE user_role.user_id = '48600000-0000-4000-8000-000000000007'
  AND user_role.role_id = role_row.id
  AND role_row.domain::text = 'designer';

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('48600000-0000-4000-8000-000000000010', 'design_studio', '00486 Studio A', 'sd486-studio-a', 'active'),
  ('48600000-0000-4000-8000-000000000011', 'design_studio', '00486 Studio B', 'sd486-studio-b', 'active'),
  ('48600000-0000-4000-8000-000000000012', 'design_studio', '00486 Inactive Studio', 'sd486-studio-inactive', 'deactivated');

INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
)
VALUES
  ('48600000-0000-4000-8000-000000000020', '48600000-0000-4000-8000-000000000001', '48600000-0000-4000-8000-000000000010', 'owner', 'active', '2026-01-01'),
  ('48600000-0000-4000-8000-000000000021', '48600000-0000-4000-8000-000000000002', '48600000-0000-4000-8000-000000000010', 'member', 'active', '2026-01-02'),
  ('48600000-0000-4000-8000-000000000022', '48600000-0000-4000-8000-000000000002', '48600000-0000-4000-8000-000000000011', 'owner', 'active', '2026-01-03'),
  ('48600000-0000-4000-8000-000000000023', '48600000-0000-4000-8000-000000000005', '48600000-0000-4000-8000-000000000010', 'member', 'active', '2026-01-04'),
  ('48600000-0000-4000-8000-000000000024', '48600000-0000-4000-8000-000000000006', '48600000-0000-4000-8000-000000000010', 'member', 'active', '2026-01-05'),
  ('48600000-0000-4000-8000-000000000025', '48600000-0000-4000-8000-000000000007', '48600000-0000-4000-8000-000000000010', 'member', 'active', '2026-01-06'),
  ('48600000-0000-4000-8000-000000000026', '48600000-0000-4000-8000-000000000008', '48600000-0000-4000-8000-000000000010', 'member', 'suspended', '2026-01-07'),
  ('48600000-0000-4000-8000-000000000027', '48600000-0000-4000-8000-000000000001', '48600000-0000-4000-8000-000000000012', 'owner', 'active', '2026-01-08'),
  ('48600000-0000-4000-8000-000000000028', '48600000-0000-4000-8000-000000000009', '48600000-0000-4000-8000-000000000011', 'member', 'active', '2026-01-09'),
  ('48600000-0000-4000-8000-000000000029', '48600000-0000-4000-8000-000000000003', '48600000-0000-4000-8000-000000000010', 'guest', 'active', '2026-01-10');

INSERT INTO public.designer_clients (
  id, designer_id, client_id, client_name, status, source
)
VALUES
  ('48600000-0000-4000-8000-000000000030', '48600000-0000-4000-8000-000000000001', '48600000-0000-4000-8000-000000000003', '00486 Client A', 'active', 'direct'),
  ('48600000-0000-4000-8000-000000000031', '48600000-0000-4000-8000-000000000002', '48600000-0000-4000-8000-000000000004', '00486 Client B', 'active', 'direct');

INSERT INTO public.projects (
  id, name, designer_id, client_id, studio_id, created_by, status,
  total_amount_cents, budget_cents, design_fee_cents, target_end_date
)
VALUES
  ('48600000-0000-4000-8000-000000000040', '00486 Project A', '48600000-0000-4000-8000-000000000001', '48600000-0000-4000-8000-000000000003', '48600000-0000-4000-8000-000000000010', '48600000-0000-4000-8000-000000000001', 'active', 0, 0, 0, current_date + 30),
  ('48600000-0000-4000-8000-000000000041', '00486 Project B foreign exact-studio target', '48600000-0000-4000-8000-000000000002', '48600000-0000-4000-8000-000000000004', '48600000-0000-4000-8000-000000000011', '48600000-0000-4000-8000-000000000002', 'active', 0, 0, 0, current_date + 30),
  ('48600000-0000-4000-8000-000000000042', '00486 Close A', '48600000-0000-4000-8000-000000000001', '48600000-0000-4000-8000-000000000003', '48600000-0000-4000-8000-000000000010', '48600000-0000-4000-8000-000000000001', 'active', 0, 0, 0, current_date + 30);

INSERT INTO public.project_phases (
  id, project_id, name, phase_key, status, sort_order
)
VALUES (
  '48600000-0000-4000-8000-000000000043',
  '48600000-0000-4000-8000-000000000040',
  '00486 Design Phase A', 'design', 'in_progress', 0
);

INSERT INTO public.project_parties (
  id, project_id, party_kind, display_name, email, phone, created_by
)
VALUES
  ('48600000-0000-4000-8000-000000000050', '48600000-0000-4000-8000-000000000040', 'vendor', '00486 Party A', 'party-a@test.invalid', '5554860001', '48600000-0000-4000-8000-000000000001'),
  ('48600000-0000-4000-8000-000000000051', '48600000-0000-4000-8000-000000000041', 'vendor', '00486 Party B', 'party-b@test.invalid', '5554860002', '48600000-0000-4000-8000-000000000002');

INSERT INTO public.scope_change_requests (
  id, project_id, requested_by, request_origin, title, description, status,
  sent_at, approved_at, approved_by, approved_by_name,
  additional_ffe_budget_cents, additional_design_fee_cents,
  timeline_impact_weeks, new_rooms, new_ffe_items
)
VALUES
  ('48600000-0000-4000-8000-000000000060', '48600000-0000-4000-8000-000000000040', '48600000-0000-4000-8000-000000000001', 'designer_amendment', '00486 Apply A', 'Empty authorized change', 'approved', now(), now(), '48600000-0000-4000-8000-000000000001', '00486 Designer A', 0, 0, 0, '[]', '[]'),
  ('48600000-0000-4000-8000-000000000061', '48600000-0000-4000-8000-000000000041', '48600000-0000-4000-8000-000000000002', 'designer_amendment', '00486 Apply B', 'Foreign exact-studio change', 'approved', now(), now(), '48600000-0000-4000-8000-000000000002', '00486 Designer B', 0, 0, 0, '[]', '[]');

INSERT INTO public.project_payment_milestones (
  id, project_id, label, percentage, amount_cents, status, sort_order
)
VALUES
  ('48600000-0000-4000-8000-000000000070', '48600000-0000-4000-8000-000000000040', '00486 Milestone A', 0, 1000, 'pending', 1),
  ('48600000-0000-4000-8000-000000000071', '48600000-0000-4000-8000-000000000041', '00486 Milestone B', 0, 1000, 'pending', 1);

INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, project_id,
  title, total_amount, status, sent_at, valid_until
)
VALUES
  ('48600000-0000-4000-8000-000000000080', '48600000-0000-4000-8000-000000000001', '48600000-0000-4000-8000-000000000030', '48600000-0000-4000-8000-000000000003', NULL, '00486 View A', 0, 'sent', now(), now() + interval '30 days'),
  ('48600000-0000-4000-8000-000000000081', '48600000-0000-4000-8000-000000000001', '48600000-0000-4000-8000-000000000030', '48600000-0000-4000-8000-000000000003', NULL, '00486 Decline A', 0, 'sent', now(), now() + interval '30 days'),
  ('48600000-0000-4000-8000-000000000082', '48600000-0000-4000-8000-000000000001', '48600000-0000-4000-8000-000000000030', '48600000-0000-4000-8000-000000000003', NULL, '00486 Change A', 0, 'sent', now(), now() + interval '30 days'),
  ('48600000-0000-4000-8000-000000000083', '48600000-0000-4000-8000-000000000001', '48600000-0000-4000-8000-000000000030', '48600000-0000-4000-8000-000000000003', NULL, '00486 Offline A', 0, 'expired', now() - interval '60 days', now() - interval '30 days'),
  ('48600000-0000-4000-8000-000000000084', '48600000-0000-4000-8000-000000000002', '48600000-0000-4000-8000-000000000031', '48600000-0000-4000-8000-000000000004', '48600000-0000-4000-8000-000000000041', '00486 Foreign B', 0, 'sent', now(), now() + interval '30 days'),
  ('48600000-0000-4000-8000-000000000085', '48600000-0000-4000-8000-000000000001', '48600000-0000-4000-8000-000000000030', '48600000-0000-4000-8000-000000000003', NULL, '00486 Feedback A', 0, 'sent', now(), now() + interval '30 days');

INSERT INTO public.proposal_items (
  id, proposal_id, name, quantity, unit_price, unit_sell_price,
  line_total_cents, position
)
VALUES
  ('48600000-0000-4000-8000-000000000090', '48600000-0000-4000-8000-000000000085', '00486 Feedback Item A', 1, 0, 0, 0, 1),
  ('48600000-0000-4000-8000-000000000091', '48600000-0000-4000-8000-000000000084', '00486 Feedback Item B', 1, 0, 0, 0, 1);

INSERT INTO public.proposal_send_dispatches (
  id, proposal_id, sent_at, designer_id, client_id, project_id,
  proposal_title, valid_until, total_amount, recipient_email,
  recipient_name, designer_name, sender_name, studio_name,
  client_portal_path, provider_idempotency_key, email_log_id, in_app_log_id
)
VALUES (
  '48600000-0000-4000-8000-0000000000f0',
  '48600000-0000-4000-8000-000000000085',
  '2026-08-15T12:00:00Z',
  '48600000-0000-4000-8000-000000000001',
  '48600000-0000-4000-8000-000000000003',
  NULL,
  '00486 Feedback A',
  now() + interval '30 days',
  0,
  'sd486-client-a@test.invalid',
  '00486 Client A',
  '00486 Designer A',
  '00486 Studio A',
  '00486 Studio A',
  '/proposals/48600000-0000-4000-8000-000000000085',
  'proposal-send/48600000-0000-4000-8000-0000000000f0',
  '48600000-0000-4000-8000-0000000000f1',
  '48600000-0000-4000-8000-0000000000f2'
);

INSERT INTO public.item_feedback (
  id, proposal_item_id, client_id, verdict, body
)
VALUES
  ('48600000-0000-4000-8000-0000000000a0', '48600000-0000-4000-8000-000000000090', '48600000-0000-4000-8000-000000000003', 'comment', 'Authorized client thread'),
  ('48600000-0000-4000-8000-0000000000a1', '48600000-0000-4000-8000-000000000090', '48600000-0000-4000-8000-000000000003', 'rejected', NULL),
  ('48600000-0000-4000-8000-0000000000a2', '48600000-0000-4000-8000-000000000091', '48600000-0000-4000-8000-000000000004', 'comment', 'Foreign client thread');

INSERT INTO public.client_decisions (
  id, designer_client_id, designer_id, project_id, title,
  decision_type, coordination_kind, court, status
)
VALUES
  ('48600000-0000-4000-8000-0000000000b0', '48600000-0000-4000-8000-000000000030', '48600000-0000-4000-8000-000000000001', '48600000-0000-4000-8000-000000000040', '00486 Decision A', 'approval', 'selection', 'designer', 'pending'),
  ('48600000-0000-4000-8000-0000000000b1', '48600000-0000-4000-8000-000000000031', '48600000-0000-4000-8000-000000000002', '48600000-0000-4000-8000-000000000041', '00486 Decision B', 'approval', 'selection', 'designer', 'pending'),
  ('48600000-0000-4000-8000-0000000000b2', '48600000-0000-4000-8000-000000000030', '48600000-0000-4000-8000-000000000001', '48600000-0000-4000-8000-000000000040', '00486 Submittal A', 'approval', 'submittal', 'designer', 'pending'),
  ('48600000-0000-4000-8000-0000000000b3', '48600000-0000-4000-8000-000000000031', '48600000-0000-4000-8000-000000000002', '48600000-0000-4000-8000-000000000041', '00486 Submittal B', 'approval', 'submittal', 'designer', 'pending'),
  ('48600000-0000-4000-8000-0000000000b5', '48600000-0000-4000-8000-000000000030', '48600000-0000-4000-8000-000000000001', '48600000-0000-4000-8000-000000000040', '00486 Due Legacy Decision', 'approval', 'selection', 'designer', 'pending');

SET LOCAL session_replication_role = replica;
UPDATE public.client_decisions
SET due_date = '2000-01-01T00:00:00Z'
WHERE id = '48600000-0000-4000-8000-0000000000b5';

INSERT INTO public.client_decisions (
  id, designer_client_id, designer_id, project_id, title, due_date, phase_id,
  decision_type, decision_kind, coordination_kind, blocking_status,
  blocks_kind, court, status, approval_contract
)
VALUES (
  '48600000-0000-4000-8000-0000000000b4',
  '48600000-0000-4000-8000-000000000030',
  '48600000-0000-4000-8000-000000000001',
  '48600000-0000-4000-8000-000000000040',
  '00486 Stage-2 Reminder', now() + interval '1 day',
  '48600000-0000-4000-8000-000000000043',
  'approval', 'approval', 'signoff', 'blocks_phase', 'phase', 'client',
  'pending', 'project_artifact_v1'
);
INSERT INTO public.project_decision_authority_snapshots (
  id, decision_id, project_id, decision_lead_id, authority_revision,
  assigned_by
)
VALUES (
  '48600000-0000-4000-8000-0000000000fa',
  '48600000-0000-4000-8000-0000000000b4',
  '48600000-0000-4000-8000-000000000040',
  '48600000-0000-4000-8000-000000000003', 1,
  '48600000-0000-4000-8000-000000000001'
);
INSERT INTO public.project_approval_artifacts (
  id, decision_id, project_id, source_kind, source_id, source_version,
  artifact_hash, artifact_title, question, due_at, phase_id,
  cost_cents_delta, schedule_days_delta, lead_time_days_delta,
  source_snapshot
)
VALUES (
  '48600000-0000-4000-8000-0000000000fb',
  '48600000-0000-4000-8000-0000000000b4',
  '48600000-0000-4000-8000-000000000040', 'plan_issue',
  '48600000-0000-4000-8000-0000000000f9', 1, repeat('9', 64),
  '00486 Reminder Artifact', 'Approve the 00486 artifact?',
  now() + interval '1 day',
  '48600000-0000-4000-8000-000000000043', 0, 0, 0, '{}'::jsonb
);
SET LOCAL session_replication_role = origin;

INSERT INTO public.spec_book_templates (
  id, template_key, version, studio_id, name, page_grammar,
  audience_profiles, required_field_rules, visibility_rules, created_by
)
VALUES (
  '48600000-0000-4000-8000-0000000000f3', '00486.service-finalize', 1,
  '48600000-0000-4000-8000-000000000010', '00486 Finalize Template',
  '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
  '48600000-0000-4000-8000-000000000001'
);
INSERT INTO public.spec_books (
  id, project_id, title, template_id, default_audiences, created_by
)
VALUES (
  '48600000-0000-4000-8000-0000000000f4',
  '48600000-0000-4000-8000-000000000040', '00486 Finalize Book',
  '48600000-0000-4000-8000-0000000000f3', ARRAY['internal']::text[],
  '48600000-0000-4000-8000-000000000001'
);
INSERT INTO public.project_documents (
  id, project_id, title, doc_type, category, storage_path, status,
  uploaded_by, section_key, client_visible, size_bytes
)
VALUES (
  '48600000-0000-4000-8000-0000000000f6',
  '48600000-0000-4000-8000-000000000040', '00486 Finalized PDF',
  'pdf', 'spec', '00486/project/internal.pdf', 'ready',
  '48600000-0000-4000-8000-000000000001', 'spec-book', false, 486
);
INSERT INTO public.spec_book_revisions (
  id, spec_book_id, revision_number, idempotency_key, issue_type, status,
  requested_audiences, template_snapshot, render_snapshot,
  snapshot_checksum, created_by
)
VALUES (
  '48600000-0000-4000-8000-0000000000f5',
  '48600000-0000-4000-8000-0000000000f4', 1, '00486-service-finalize',
  'full', 'pending', ARRAY['internal']::text[], '{}'::jsonb, '{}'::jsonb,
  repeat('5', 64), '48600000-0000-4000-8000-000000000001'
);
INSERT INTO public.spec_book_artifacts (
  id, revision_id, audience, status, project_document_id, storage_path,
  checksum_sha256, size_bytes, rendered_at
)
VALUES (
  '48600000-0000-4000-8000-0000000000f7',
  '48600000-0000-4000-8000-0000000000f5', 'internal', 'ready',
  '48600000-0000-4000-8000-0000000000f6',
  '00486/project/internal.pdf', repeat('7', 64), 486, now()
);

INSERT INTO public.trade_rfq_requests (
  id, proposal_id, party_id, party_display_name, party_email, status,
  created_by
)
VALUES (
  '48600000-0000-4000-8000-0000000000f8',
  '48600000-0000-4000-8000-000000000084',
  '48600000-0000-4000-8000-000000000051', '00486 Party B',
  'party-b@test.invalid', 'draft',
  '48600000-0000-4000-8000-000000000002'
);

INSERT INTO public.project_review_editions (
  id, project_id, edition_number, title, status, snapshot_hash,
  published_at, published_by, created_by
)
VALUES
  ('48600000-0000-4000-8000-0000000000c0', '48600000-0000-4000-8000-000000000040', 1, '00486 Review A', 'published', repeat('a', 64), now(), '48600000-0000-4000-8000-000000000001', '48600000-0000-4000-8000-000000000001'),
  ('48600000-0000-4000-8000-0000000000c1', '48600000-0000-4000-8000-000000000041', 1, '00486 Review B', 'published', repeat('b', 64), now(), '48600000-0000-4000-8000-000000000002', '48600000-0000-4000-8000-000000000002');

INSERT INTO public.sms_conversations (
  id, twilio_number, phone_e164, active_project_id, state
)
VALUES
  ('48600000-0000-4000-8000-0000000000d0', '+15554860000', '+15554860001', '48600000-0000-4000-8000-000000000040', 'idle'),
  ('48600000-0000-4000-8000-0000000000d1', '+15554860000', '+15554860002', '48600000-0000-4000-8000-000000000041', 'idle');

INSERT INTO public.sms_messages (
  id, conversation_id, direction, body, project_id, needs_review
)
VALUES
  ('48600000-0000-4000-8000-0000000000d2', '48600000-0000-4000-8000-0000000000d0', 'inbound', 'Authorized review', '48600000-0000-4000-8000-000000000040', true),
  ('48600000-0000-4000-8000-0000000000d3', '48600000-0000-4000-8000-0000000000d1', 'inbound', 'Foreign review', '48600000-0000-4000-8000-000000000041', true);

INSERT INTO public.campaigns (
  id, name, subject, template_id, created_by
)
VALUES
  ('48600000-0000-4000-8000-0000000000e0', '00486 Campaign A', 'A', 'proposal-sent', '48600000-0000-4000-8000-000000000001'),
  ('48600000-0000-4000-8000-0000000000e1', '00486 Campaign B', 'B', 'proposal-sent', '48600000-0000-4000-8000-000000000002');

CREATE OR REPLACE FUNCTION pg_temp.assume_00486_actor(
  p_actor uuid,
  p_claim_role text DEFAULT 'authenticated'
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    CASE WHEN p_actor IS NULL THEN
      jsonb_build_object('role', p_claim_role)::text
    ELSE
      jsonb_build_object('sub', p_actor, 'role', p_claim_role)::text
    END,
    true
  );
  PERFORM set_config(
    'request.jwt.claim.sub', COALESCE(p_actor::text, ''), true
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.capture_00486_error(p_sql text)
RETURNS TABLE(error_state text, error_message text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
    error_state := '00000';
    error_message := NULL;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      error_state = RETURNED_SQLSTATE,
      error_message = MESSAGE_TEXT;
  END;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.count_00486_field_links()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT count(*) FROM public.field_link_tokens
$$;

CREATE OR REPLACE FUNCTION pg_temp.count_00486_party_field_links(
  p_party_id uuid
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT count(*)
  FROM public.field_link_tokens
  WHERE party_id = p_party_id
$$;

CREATE OR REPLACE FUNCTION pg_temp.count_00486_coordination_revisions(
  p_decision_id uuid
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT count(*)
  FROM public.coordination_item_revisions
  WHERE decision_id = p_decision_id
$$;

GRANT EXECUTE ON FUNCTION pg_temp.capture_00486_error(text) TO
  authenticated, service_role;
GRANT EXECUTE ON FUNCTION pg_temp.count_00486_field_links() TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.count_00486_party_field_links(uuid),
  pg_temp.count_00486_coordination_revisions(uuid) TO authenticated;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_00486_actor(NULL);
DO $missing_identity_contract$
DECLARE
  probe record;
  failure record;
BEGIN
  FOR probe IN
    SELECT signature, denied_sql
    FROM _00486_expected
    WHERE 'authenticated' = ANY(direct_roles)
    ORDER BY signature
  LOOP
    SELECT * INTO failure
    FROM pg_temp.capture_00486_error(probe.denied_sql);
    ASSERT failure.error_state = '42501'
       AND failure.error_message NOT LIKE 'permission denied for function %',
      format(
        '%s did not reject a missing verified subject inside its body: %s/%s',
        probe.signature, failure.error_state, failure.error_message
      );
  END LOOP;
END
$missing_identity_contract$;

SELECT pg_temp.assume_00486_actor(NULL, 'service_role');
SELECT pg_temp.assert_00486_unlisted_denied('authenticated');
DO $forged_service_field_link_contract$
DECLARE
  failure record;
  before_count bigint;
BEGIN
  before_count := pg_temp.count_00486_field_links();
  SELECT * INTO failure FROM pg_temp.capture_00486_error(
    $call$SELECT * FROM public.create_field_link('48600000-0000-4000-8000-000000000050')$call$
  );
  ASSERT failure.error_state = '42501'
     AND failure.error_message = 'field-link party not found or access denied',
    format('forged service claim reached field-link service branch: %s/%s', failure.error_state, failure.error_message);
  ASSERT pg_temp.count_00486_field_links() = before_count,
    'forged service claim minted a field-link token';
END
$forged_service_field_link_contract$;
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT pg_temp.assume_00486_actor(NULL, 'authenticated');
DO $service_database_role_contract$
DECLARE
  link_count bigint;
  rfq_count bigint;
  dispatch_read jsonb;
  dispatch_claim jsonb;
  persisted_request jsonb;
  finalized public.spec_book_revisions;
  finalized_retry public.spec_book_revisions;
  stamped public.client_decisions;
  stamped_retry public.client_decisions;
  expired_ids uuid[];
BEGIN
  dispatch_read := public.read_proposal_send_dispatch(
    '48600000-0000-4000-8000-0000000000f0',
    '48600000-0000-4000-8000-000000000085',
    '2026-08-15T12:00:00Z'
  );
  ASSERT dispatch_read->>'delivery_state' = 'pending',
    'service_role could not read the exact dispatch nonce/timestamp';

  dispatch_claim := public.claim_proposal_send_dispatch(
    '48600000-0000-4000-8000-0000000000f0',
    '48600000-0000-4000-8000-000000000085',
    '2026-08-15T12:00:00Z',
    30
  );
  ASSERT dispatch_claim->>'claimed' = 'true'
     AND dispatch_claim->>'claim_token' IS NOT NULL,
    'service_role could not claim the valid dispatch fixture';

  persisted_request := public.persist_proposal_send_request(
    '48600000-0000-4000-8000-0000000000f0',
    (dispatch_claim->>'claim_token')::uuid,
    '{"fixture":"00486"}',
    'sender@test.invalid',
    ARRAY['recipient@test.invalid'],
    ARRAY[]::text[],
    '00486 Subject',
    false
  );
  ASSERT persisted_request->>'body' = '{"fixture":"00486"}'
     AND persisted_request->>'subject' = '00486 Subject',
    'service_role could not persist the immutable provider request';

  PERFORM public.sync_proposal_send_email_log(
    '48600000-0000-4000-8000-0000000000f0'
  );
  PERFORM public.sync_proposal_send_in_app_log(
    '48600000-0000-4000-8000-0000000000f0'
  );
  ASSERT (
    SELECT count(*) = 2
       AND bool_and(status IN ('sending', 'delivered'))
    FROM public.notification_log
    WHERE id IN (
      '48600000-0000-4000-8000-0000000000f1',
      '48600000-0000-4000-8000-0000000000f2'
    )
  ), 'service_role could not reconcile both proposal notification logs';

  SELECT count(*) INTO link_count
  FROM public.create_field_link('48600000-0000-4000-8000-000000000050');
  ASSERT link_count = 1,
    'active service_role could not mint one exact field-link token';

  SELECT array_agg(id ORDER BY id) INTO expired_ids
  FROM public.expire_due_client_decisions('2000-01-02T00:00:00Z');
  ASSERT expired_ids = ARRAY[
    '48600000-0000-4000-8000-0000000000b5'::uuid
  ] AND (
    SELECT status = 'expired'
    FROM public.client_decisions
    WHERE id = '48600000-0000-4000-8000-0000000000b5'
  ), 'active service_role could not expire the exact due legacy decision';

  finalized := public.finalize_spec_book_issue(
    '48600000-0000-4000-8000-0000000000f5'
  );
  finalized_retry := public.finalize_spec_book_issue(
    '48600000-0000-4000-8000-0000000000f5'
  );
  ASSERT finalized.status = 'issued'
     AND finalized.issued_at IS NOT NULL
     AND finalized_retry.issued_at IS NOT DISTINCT FROM finalized.issued_at,
    'active service_role spec-book finalization was not durable and idempotent';

  SELECT count(*) INTO rfq_count
  FROM public.mint_trade_rfq_token(
    '48600000-0000-4000-8000-0000000000f8'
  );
  ASSERT rfq_count = 1 AND (
    SELECT count(*) = 1 AND bool_and(status = 'active')
    FROM public.trade_rfq_tokens
    WHERE rfq_request_id = '48600000-0000-4000-8000-0000000000f8'
  ), 'active service_role could not mint one exact trade RFQ token';

  stamped := public.stamp_project_approval_reminder_delivery(
    '48600000-0000-4000-8000-0000000000b4',
    '48600000-0000-4000-8000-000000000003'
  );
  stamped_retry := public.stamp_project_approval_reminder_delivery(
    '48600000-0000-4000-8000-0000000000b4',
    '48600000-0000-4000-8000-000000000003'
  );
  ASSERT stamped.reminder_sent_at IS NOT NULL
     AND stamped_retry.reminder_sent_at IS NOT DISTINCT FROM
       stamped.reminder_sent_at
     AND stamped_retry.updated_at IS NOT DISTINCT FROM stamped.updated_at,
    'active service_role reminder stamp was not exact and idempotent';
END
$service_database_role_contract$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_00486_actor('48600000-0000-4000-8000-000000000001');
DO $activate_project_contract$
DECLARE
  v_project_id uuid;
  v_derived_project_id uuid;
  before_count bigint;
  failure record;
  bad_team jsonb;
BEGIN
  SELECT count(*) INTO before_count FROM public.projects;
  v_project_id := public.activate_project_v2(jsonb_build_object(
    'name', '00486 Authorized Exact Graph',
    'client_id', '48600000-0000-4000-8000-000000000003',
    'studio_id', '48600000-0000-4000-8000-000000000010',
    'kickoff_date', current_date,
    'rooms', jsonb_build_array(jsonb_build_object(
      'name', 'Living Room', 'room_type', 'living_room', 'sort_order', 0
    )),
    'phases', jsonb_build_array(jsonb_build_object(
      'name', 'Design', 'duration_weeks', 1, 'sort_order', 0
    )),
    'milestones', jsonb_build_array(jsonb_build_object(
      'label', 'Deposit', 'percentage', 100, 'amount_cents', 0,
      'sort_order', 0
    )),
    'team', jsonb_build_array(
      jsonb_build_object(
        'user_id', '48600000-0000-4000-8000-000000000005',
        'role', 'support_designer'
      ),
      jsonb_build_object(
        'user_id', '48600000-0000-4000-8000-000000000006',
        'role', 'bookkeeper'
      )
    ),
    'designer_id', '48600000-0000-4000-8000-000000000002',
    'created_by', '48600000-0000-4000-8000-000000000002',
    'assigned_by', '48600000-0000-4000-8000-000000000002'
  ));

  ASSERT (SELECT count(*) = before_count + 1 FROM public.projects),
    'authorized activation did not create exactly one project';
  ASSERT (
    SELECT designer_id = '48600000-0000-4000-8000-000000000001'
       AND created_by = '48600000-0000-4000-8000-000000000001'
       AND client_id = '48600000-0000-4000-8000-000000000003'
       AND studio_id = '48600000-0000-4000-8000-000000000010'
    FROM public.projects
    WHERE id = v_project_id
  ), 'activation accepted a caller-controlled actor or wrong canonical scope';
  ASSERT (SELECT count(*) = 1 FROM public.project_rooms WHERE project_id = v_project_id),
    'authorized activation room graph drifted';
  ASSERT (SELECT count(*) = 1 FROM public.project_phases WHERE project_id = v_project_id),
    'authorized activation phase graph drifted';
  ASSERT (SELECT count(*) = 1 FROM public.project_payment_milestones WHERE project_id = v_project_id),
    'authorized activation milestone graph drifted';
  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.project_team_members AS member
    WHERE member.project_id = v_project_id
      AND member.assigned_by IS DISTINCT FROM
        '48600000-0000-4000-8000-000000000001'
  ), 'activation accepted a caller-controlled assigned_by';
  ASSERT (
    SELECT array_agg(
      (user_id::text || ':' || role::text) ORDER BY user_id, role
    ) = ARRAY[
      '48600000-0000-4000-8000-000000000001:lead_designer',
      '48600000-0000-4000-8000-000000000005:support_designer',
      '48600000-0000-4000-8000-000000000006:bookkeeper'
    ]
    FROM public.project_team_members
    WHERE project_id = v_project_id
      AND removed_at IS NULL
  ), 'activation team allowlist or caller lead derivation drifted';

  v_derived_project_id := public.activate_project_v2(jsonb_build_object(
    'name', '00486 Null Studio Compatibility',
    'client_id', '48600000-0000-4000-8000-000000000003',
    'studio_id', NULL
  ));
  ASSERT (
    SELECT studio_id = '48600000-0000-4000-8000-000000000010'
    FROM public.projects
    WHERE id = v_derived_project_id
  ), 'null studio did not resolve the deterministic active primary studio';

  SELECT * INTO failure FROM pg_temp.capture_00486_error(
    $call$SELECT public.activate_project_v2('{"name":"00486 Foreign Client","client_id":"48600000-0000-4000-8000-000000000004","studio_id":"48600000-0000-4000-8000-000000000010"}')$call$
  );
  ASSERT failure.error_state = '42501'
     AND failure.error_message = 'project creation not permitted',
    'another designer client relationship authorized activation';

  SELECT * INTO failure FROM pg_temp.capture_00486_error(
    $call$SELECT public.activate_project_v2('{"name":"00486 Foreign Studio","client_id":"48600000-0000-4000-8000-000000000003","studio_id":"48600000-0000-4000-8000-000000000011"}')$call$
  );
  ASSERT failure.error_state = '42501'
     AND failure.error_message = 'project creation not permitted',
    'shared membership with the foreign owner authorized the wrong target studio';

  SELECT * INTO failure FROM pg_temp.capture_00486_error(
    $call$SELECT public.activate_project_v2('{"name":"00486 Inactive Studio","client_id":"48600000-0000-4000-8000-000000000003","studio_id":"48600000-0000-4000-8000-000000000012"}')$call$
  );
  ASSERT failure.error_state = '42501'
     AND failure.error_message = 'project creation not permitted',
    'inactive studio authorized activation';

  FOREACH bad_team IN ARRAY ARRAY[
    jsonb_build_array(jsonb_build_object(
      'user_id', '48600000-0000-4000-8000-000000000001',
      'role', 'support_designer'
    )),
    jsonb_build_array(jsonb_build_object(
      'user_id', '48600000-0000-4000-8000-000000000009',
      'role', 'support_designer'
    )),
    jsonb_build_array(jsonb_build_object(
      'user_id', '48600000-0000-4000-8000-000000000008',
      'role', 'support_designer'
    )),
    jsonb_build_array(jsonb_build_object(
      'user_id', '48600000-0000-4000-8000-000000000005',
      'role', 'lead_designer'
    )),
    jsonb_build_array(jsonb_build_object(
      'user_id', '48600000-0000-4000-8000-000000000005',
      'role', 'previous_lead'
    )),
    jsonb_build_array(jsonb_build_object(
      'user_id', '48600000-0000-4000-8000-000000000005',
      'role', 'vendor'
    )),
    jsonb_build_array(jsonb_build_object(
      'user_id', '48600000-0000-4000-8000-000000000005',
      'role', 'client'
    )),
    jsonb_build_array(jsonb_build_object(
      'user_id', '48600000-0000-4000-8000-000000000005',
      'role', 'studio_owner'
    )),
    jsonb_build_array(jsonb_build_object(
      'user_id', '48600000-0000-4000-8000-000000000005'
    )),
    jsonb_build_array(jsonb_build_object(
      'user_id', '48600000-0000-4000-8000-000000000003',
      'role', 'support_designer'
    )),
    jsonb_build_array(
      jsonb_build_object(
        'user_id', '48600000-0000-4000-8000-000000000005',
        'role', 'support_designer'
      ),
      jsonb_build_object(
        'user_id', '48600000-0000-4000-8000-000000000005',
        'role', 'bookkeeper'
      )
    )
  ]
  LOOP
    SELECT * INTO failure FROM pg_temp.capture_00486_error(format(
      'SELECT public.activate_project_v2(%L::jsonb)',
      jsonb_build_object(
        'name', '00486 Invalid Team',
        'client_id', '48600000-0000-4000-8000-000000000003',
        'studio_id', '48600000-0000-4000-8000-000000000010',
        'team', bad_team
      )::text
    ));
    ASSERT failure.error_state = '42501'
       AND failure.error_message = 'project creation not permitted',
      format('invalid team payload was not atomically denied: %s', bad_team);
  END LOOP;
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.projects WHERE name = '00486 Invalid Team'
  ), 'invalid team payload left a partial project graph';
END
$activate_project_contract$;

RESET ROLE;
UPDATE public.designer_clients
SET status = 'nurture'
WHERE id = '48600000-0000-4000-8000-000000000030';
SET LOCAL ROLE authenticated;
DO $removed_client_relationship_contract$
DECLARE failure record;
BEGIN
  SELECT * INTO failure FROM pg_temp.capture_00486_error(
    $call$SELECT public.activate_project_v2('{"name":"00486 Removed Client","client_id":"48600000-0000-4000-8000-000000000003","studio_id":"48600000-0000-4000-8000-000000000010"}')$call$
  );
  ASSERT failure.error_state = '42501'
     AND failure.error_message = 'project creation not permitted',
    'removed client relationship remained authoritative on the next call';
END
$removed_client_relationship_contract$;
RESET ROLE;
UPDATE public.designer_clients
SET status = 'active'
WHERE id = '48600000-0000-4000-8000-000000000030';

DELETE FROM public.user_roles AS user_role
USING public.roles AS role_row
WHERE user_role.user_id = '48600000-0000-4000-8000-000000000001'
  AND user_role.role_id = role_row.id
  AND role_row.domain::text = 'designer';
SET LOCAL ROLE authenticated;
DO $removed_designer_role_contract$
DECLARE failure record;
BEGIN
  ASSERT (SELECT is_designer FROM public.profiles WHERE id = auth.uid()),
    'role-removal fixture must retain the mutable profile flag';
  SELECT * INTO failure FROM pg_temp.capture_00486_error(
    $call$SELECT public.activate_project_v2('{"name":"00486 Removed Role","client_id":"48600000-0000-4000-8000-000000000003","studio_id":"48600000-0000-4000-8000-000000000010"}')$call$
  );
  ASSERT failure.error_state = '42501'
     AND failure.error_message = 'project creation not permitted',
    'removed canonical designer role remained authoritative on the next call';
END
$removed_designer_role_contract$;
RESET ROLE;
INSERT INTO public.user_roles (user_id, role_id)
SELECT '48600000-0000-4000-8000-000000000001', id
FROM public.roles
WHERE name = 'independent_designer'
ON CONFLICT DO NOTHING;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_00486_actor('48600000-0000-4000-8000-000000000007');
DO $profile_flag_not_authority_contract$
DECLARE failure record;
BEGIN
  SELECT * INTO failure FROM pg_temp.capture_00486_error(
    $call$SELECT public.activate_project_v2('{"name":"00486 Profile Flag Only","studio_id":"48600000-0000-4000-8000-000000000010"}')$call$
  );
  ASSERT failure.error_state = '42501'
     AND failure.error_message = 'project creation not permitted',
    'profiles.is_designer substituted for live canonical eligibility';
END
$profile_flag_not_authority_contract$;

SELECT pg_temp.assume_00486_actor('48600000-0000-4000-8000-000000000001');
SELECT set_config('app.project_phase_batch_token', '00486-sentinel', true);
DO $activation_capability_cleanup_contract$
DECLARE failure record;
BEGIN
  SELECT * INTO failure FROM pg_temp.capture_00486_error(
    $call$SELECT public.activate_project_v2('{"name":"00486 Forced Phase Error","client_id":"48600000-0000-4000-8000-000000000003","studio_id":"48600000-0000-4000-8000-000000000010","rooms":[{}]}')$call$
  );
  ASSERT failure.error_state = '23502',
    format('forced post-capability failure did not reach room insert: %s/%s', failure.error_state, failure.error_message);
  ASSERT current_setting('app.project_phase_batch_token', true) = '00486-sentinel',
    'activation failure did not restore the prior transaction-local capability';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.projects WHERE name = '00486 Forced Phase Error'
  ), 'forced activation failure left a partial graph';
END
$activation_capability_cleanup_contract$;

SELECT pg_temp.assume_00486_actor('48600000-0000-4000-8000-000000000002');
DO $pooled_caller_cleanup_contract$
DECLARE v_project_id uuid;
BEGIN
  v_project_id := public.activate_project_v2(jsonb_build_object(
    'name', '00486 Pooled Caller B',
    'client_id', '48600000-0000-4000-8000-000000000004',
    'studio_id', '48600000-0000-4000-8000-000000000011'
  ));
  ASSERT current_setting('app.project_phase_batch_token', true) = '00486-sentinel',
    'the next pooled caller observed or replaced the prior capability';
  ASSERT (SELECT designer_id = auth.uid() FROM public.projects WHERE id = v_project_id),
    'the next pooled activation retained the prior caller identity';
END
$pooled_caller_cleanup_contract$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_00486_actor('48600000-0000-4000-8000-000000000001');
DO $authorized_designer_contract$
DECLARE
  v_invoice_id uuid;
  v_bundle jsonb;
  v_revision public.coordination_item_revisions;
  v_feedback public.item_feedback;
  v_sms jsonb;
  v_link_count bigint;
BEGIN
  PERFORM public.apply_scope_change('48600000-0000-4000-8000-000000000060');
  ASSERT (
    SELECT applied_at IS NOT NULL
    FROM public.scope_change_requests
    WHERE id = '48600000-0000-4000-8000-000000000060'
  ), 'exact project designer could not apply an authorized scope change';

  v_invoice_id := public.generate_milestone_invoice(
    '48600000-0000-4000-8000-000000000070'
  );
  ASSERT v_invoice_id IS NOT NULL
     AND (
       SELECT invoice_id = v_invoice_id
       FROM public.project_payment_milestones
       WHERE id = '48600000-0000-4000-8000-000000000070'
     ), 'exact project designer could not generate the milestone invoice';

  PERFORM 1 FROM public.get_ab_variant_stats(
    '48600000-0000-4000-8000-0000000000e0'
  );

  v_bundle := public.get_client_project_review_bundle(
    '48600000-0000-4000-8000-0000000000c0'
  );
  ASSERT (v_bundle#>>'{project,id}')::uuid =
    '48600000-0000-4000-8000-000000000040',
    'exact project designer could not read the review bundle';

  SELECT count(*) INTO v_link_count
  FROM public.create_field_link('48600000-0000-4000-8000-000000000050');
  ASSERT v_link_count = 1,
    'exact project designer could not mint a field link';

  v_feedback := public.escalate_item_feedback_to_decision(
    '48600000-0000-4000-8000-0000000000a1',
    '48600000-0000-4000-8000-0000000000b0'
  );
  ASSERT v_feedback.decision_id = '48600000-0000-4000-8000-0000000000b0',
    'exact feedback designer could not escalate to its decision';

  v_revision := public.submit_coordination_revision(
    '48600000-0000-4000-8000-0000000000b2',
    '[]', 'Caller-derived revision', 'submitted',
    '48600000-0000-4000-8000-000000000002'
  );
  ASSERT v_revision.submitted_by =
    '48600000-0000-4000-8000-000000000001',
    'p_submitted_by replaced auth.uid on an authorized revision';

  v_sms := public.review_sms_message(
    '48600000-0000-4000-8000-0000000000d2', 'dismiss', NULL
  );
  ASSERT v_sms->>'action' = 'dismiss'
     AND (
       SELECT reviewed_by = '48600000-0000-4000-8000-000000000001'
       FROM public.sms_messages
       WHERE id = '48600000-0000-4000-8000-0000000000d2'
     ), 'exact project designer could not review the SMS message';
END
$authorized_designer_contract$;

DO $source_hardened_cross_subject_contract$
DECLARE
  failure record;
  before_links bigint;
  before_revisions bigint;
BEGIN
  before_links := pg_temp.count_00486_party_field_links(
    '48600000-0000-4000-8000-000000000051'
  );
  SELECT * INTO failure FROM pg_temp.capture_00486_error(
    $call$SELECT * FROM public.create_field_link('48600000-0000-4000-8000-000000000051')$call$
  );
  ASSERT failure.error_state = '42501'
     AND failure.error_message = 'field-link party not found or access denied'
     AND pg_temp.count_00486_party_field_links(
       '48600000-0000-4000-8000-000000000051'
     ) = before_links,
    'authenticated field-link mint crossed the canonical project owner';

  SELECT * INTO failure FROM pg_temp.capture_00486_error(
    $call$SELECT * FROM public.get_ab_variant_stats('48600000-0000-4000-8000-0000000000e1')$call$
  );
  ASSERT failure.error_state = '42501'
     AND failure.error_message =
       'campaign 48600000-0000-4000-8000-0000000000e1 not found or access denied',
    'A/B statistics crossed the canonical campaign owner';

  before_revisions := pg_temp.count_00486_coordination_revisions(
    '48600000-0000-4000-8000-0000000000b3'
  );
  SELECT * INTO failure FROM pg_temp.capture_00486_error(
    $call$SELECT public.submit_coordination_revision('48600000-0000-4000-8000-0000000000b3','[]','Foreign','submitted','48600000-0000-4000-8000-000000000001')$call$
  );
  ASSERT failure.error_state = '42501'
     AND failure.error_message = 'coordination item not found or access denied'
     AND pg_temp.count_00486_coordination_revisions(
       '48600000-0000-4000-8000-0000000000b3'
     ) = before_revisions,
    'coordination revision crossed the target project studio';
END
$source_hardened_cross_subject_contract$;

SELECT pg_temp.assume_00486_actor(
  '48600000-0000-4000-8000-000000000002', 'service_role'
);
DO $submitted_by_spoof_contract$
DECLARE revision public.coordination_item_revisions;
BEGIN
  revision := public.submit_coordination_revision(
    '48600000-0000-4000-8000-0000000000b3',
    '[]', 'Forged claim and actor input', 'submitted',
    '48600000-0000-4000-8000-000000000001'
  );
  ASSERT revision.submitted_by =
    '48600000-0000-4000-8000-000000000002'
     AND revision.submitted_by <>
       '48600000-0000-4000-8000-000000000001',
    'forged service claim or p_submitted_by replaced auth.uid';
END
$submitted_by_spoof_contract$;

SELECT pg_temp.assume_00486_actor('48600000-0000-4000-8000-000000000003');
DO $authorized_client_contract$
DECLARE
  v_receipt jsonb;
  v_event public.item_feedback_events;
BEGIN
  v_receipt := public.mark_proposal_viewed(
    '48600000-0000-4000-8000-000000000080'
  );
  ASSERT v_receipt->>'status' = 'viewed',
    'exact proposal client could not mark the proposal viewed';

  v_receipt := public.decline_proposal(
    '48600000-0000-4000-8000-000000000081', 'Not now'
  );
  ASSERT v_receipt->>'status' = 'declined',
    'exact proposal client could not decline the proposal';

  PERFORM public.request_proposal_change(
    '48600000-0000-4000-8000-000000000082', 'Please revise'
  );
  ASSERT (
    SELECT client_feedback = 'Please revise'
    FROM public.proposals
    WHERE id = '48600000-0000-4000-8000-000000000082'
  ), 'exact proposal client could not request a change';

  v_event := public.reply_to_item_feedback(
    '48600000-0000-4000-8000-0000000000a0', 'Client follow-up'
  );
  ASSERT v_event.actor = '48600000-0000-4000-8000-000000000003'
     AND v_event.body = 'Client follow-up',
    'exact feedback client could not reply';
END
$authorized_client_contract$;

SELECT pg_temp.assume_00486_actor('48600000-0000-4000-8000-000000000001');
DO $offline_signature_contract$
DECLARE v_project_id uuid;
BEGIN
  v_project_id := public.record_offline_signature(
    '48600000-0000-4000-8000-000000000083',
    'Recorded Client', false, current_date
  );
  ASSERT v_project_id IS NULL
     AND (
       SELECT status = 'accepted'
          AND signed_by_name = 'Recorded Client'
       FROM public.proposals
       WHERE id = '48600000-0000-4000-8000-000000000083'
     ), 'exact proposal designer could not record an offline signature';
END
$offline_signature_contract$;

DO $close_project_contract$
DECLARE v_closed public.projects;
BEGIN
  v_closed := public.close_project(
    '48600000-0000-4000-8000-000000000042',
    jsonb_build_array(
      jsonb_build_object('key', 'walkthrough', 'completed', true),
      jsonb_build_object('key', 'punch_list', 'completed', true),
      jsonb_build_object('key', 'payment', 'completed', true),
      jsonb_build_object('key', 'photography', 'completed', true),
      jsonb_build_object('key', 'photos', 'completed', true),
      jsonb_build_object('key', 'case_study', 'completed', true)
    ),
    jsonb_build_object('source', '00486')
  );
  ASSERT v_closed.status = 'completed',
    'exact project designer could not close a ready project';
END
$close_project_contract$;
RESET ROLE;

CREATE TEMP TABLE _00486_enumeration_pairs (
  signature text PRIMARY KEY,
  missing_sql text NOT NULL,
  foreign_sql text NOT NULL,
  expected_message text NOT NULL
) ON COMMIT DROP;

INSERT INTO _00486_enumeration_pairs VALUES
  (
    'public.apply_scope_change(uuid)',
    $call$SELECT public.apply_scope_change('48600000-0000-4000-8000-00000000ee01')$call$,
    $call$SELECT public.apply_scope_change('48600000-0000-4000-8000-000000000061')$call$,
    'scope change request not found or access denied'
  ),
  (
    'public.close_project(uuid,jsonb,jsonb)',
    $call$SELECT public.close_project('48600000-0000-4000-8000-00000000ee02',NULL,NULL)$call$,
    $call$SELECT public.close_project('48600000-0000-4000-8000-000000000041',NULL,NULL)$call$,
    'project not found or access denied'
  ),
  (
    'public.decline_proposal(uuid,text)',
    $call$SELECT public.decline_proposal('48600000-0000-4000-8000-00000000ee03','No')$call$,
    $call$SELECT public.decline_proposal('48600000-0000-4000-8000-000000000084','No')$call$,
    'proposal not found or access denied'
  ),
  (
    'public.escalate_item_feedback_to_decision(uuid,uuid)',
    $call$SELECT public.escalate_item_feedback_to_decision('48600000-0000-4000-8000-00000000ee04','48600000-0000-4000-8000-00000000ee05')$call$,
    $call$SELECT public.escalate_item_feedback_to_decision('48600000-0000-4000-8000-0000000000a2','48600000-0000-4000-8000-0000000000b1')$call$,
    'feedback or decision not found or access denied'
  ),
  (
    'public.generate_milestone_invoice(uuid)',
    $call$SELECT public.generate_milestone_invoice('48600000-0000-4000-8000-00000000ee06')$call$,
    $call$SELECT public.generate_milestone_invoice('48600000-0000-4000-8000-000000000071')$call$,
    'milestone not found or access denied'
  ),
  (
    'public.get_client_project_review_bundle(uuid)',
    $call$SELECT public.get_client_project_review_bundle('48600000-0000-4000-8000-00000000ee07')$call$,
    $call$SELECT public.get_client_project_review_bundle('48600000-0000-4000-8000-0000000000c1')$call$,
    'review not found or access denied'
  ),
  (
    'public.mark_proposal_viewed(uuid)',
    $call$SELECT public.mark_proposal_viewed('48600000-0000-4000-8000-00000000ee08')$call$,
    $call$SELECT public.mark_proposal_viewed('48600000-0000-4000-8000-000000000084')$call$,
    'proposal not found or access denied'
  ),
  (
    'public.reassign_project_lead(uuid,uuid,uuid)',
    $call$SELECT public.reassign_project_lead('48600000-0000-4000-8000-00000000ee09','48600000-0000-4000-8000-000000000002','48600000-0000-4000-8000-000000000001')$call$,
    $call$SELECT public.reassign_project_lead('48600000-0000-4000-8000-000000000041','48600000-0000-4000-8000-000000000002','48600000-0000-4000-8000-000000000001')$call$,
    'project not found or access denied'
  ),
  (
    'public.record_offline_signature(uuid,text,boolean,date)',
    $call$SELECT public.record_offline_signature('48600000-0000-4000-8000-00000000ee0a','Missing',false,current_date)$call$,
    $call$SELECT public.record_offline_signature('48600000-0000-4000-8000-000000000084','Foreign',false,current_date)$call$,
    'proposal not found or access denied'
  ),
  (
    'public.reply_to_item_feedback(uuid,text)',
    $call$SELECT public.reply_to_item_feedback('48600000-0000-4000-8000-00000000ee0b','Reply')$call$,
    $call$SELECT public.reply_to_item_feedback('48600000-0000-4000-8000-0000000000a2','Reply')$call$,
    'feedback not found or access denied'
  ),
  (
    'public.request_proposal_change(uuid,text)',
    $call$SELECT public.request_proposal_change('48600000-0000-4000-8000-00000000ee0c','Change')$call$,
    $call$SELECT public.request_proposal_change('48600000-0000-4000-8000-000000000084','Change')$call$,
    'proposal not found or access denied'
  ),
  (
    'public.review_sms_message(uuid,text,jsonb)',
    $call$SELECT public.review_sms_message('48600000-0000-4000-8000-00000000ee0d','dismiss',NULL)$call$,
    $call$SELECT public.review_sms_message('48600000-0000-4000-8000-0000000000d3','dismiss',NULL)$call$,
    'message not found or access denied'
  );

GRANT SELECT ON _00486_enumeration_pairs TO authenticated;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_00486_actor('48600000-0000-4000-8000-000000000001');
DO $paired_enumeration_contract$
DECLARE
  probe record;
  missing_failure record;
  foreign_failure record;
BEGIN
  ASSERT (SELECT count(*) = 12 FROM _00486_enumeration_pairs),
    'paired enumeration manifest must contain exactly 12 routines';

  FOR probe IN
    SELECT * FROM _00486_enumeration_pairs ORDER BY signature
  LOOP
    SELECT * INTO missing_failure
    FROM pg_temp.capture_00486_error(probe.missing_sql);
    SELECT * INTO foreign_failure
    FROM pg_temp.capture_00486_error(probe.foreign_sql);

    ASSERT missing_failure.error_state = '42501'
       AND foreign_failure.error_state = missing_failure.error_state
       AND missing_failure.error_message = probe.expected_message
       AND foreign_failure.error_message = missing_failure.error_message,
      format(
        '%s enumerated missing vs existing-foreign: missing=%s/%s foreign=%s/%s',
        probe.signature,
        missing_failure.error_state, missing_failure.error_message,
        foreign_failure.error_state, foreign_failure.error_message
      );
  END LOOP;

END
$paired_enumeration_contract$;
RESET ROLE;

DO $paired_no_mutation_contract$
BEGIN
  ASSERT (
    SELECT applied_at IS NULL
    FROM public.scope_change_requests
    WHERE id = '48600000-0000-4000-8000-000000000061'
  ), 'foreign scope-change probe mutated its row';
  ASSERT (
    SELECT status = 'active'
    FROM public.projects
    WHERE id = '48600000-0000-4000-8000-000000000041'
  ), 'foreign project probe mutated its row';
  ASSERT (
    SELECT status = 'sent'
    FROM public.proposals
    WHERE id = '48600000-0000-4000-8000-000000000084'
  ), 'foreign proposal probes mutated their row';
  ASSERT (
    SELECT invoice_id IS NULL
    FROM public.project_payment_milestones
    WHERE id = '48600000-0000-4000-8000-000000000071'
  ), 'foreign milestone probe created an invoice';
  ASSERT (
    SELECT needs_review AND reviewed_at IS NULL AND reviewed_by IS NULL
    FROM public.sms_messages
    WHERE id = '48600000-0000-4000-8000-0000000000d3'
  ), 'foreign SMS probe mutated its row';
END
$paired_no_mutation_contract$;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"48600000-0000-4000-8000-00000000dead","role":"service_role"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '48600000-0000-4000-8000-00000000dead',
  true
);
DO $seed_transaction_local_cleanup_sentinels$
DECLARE setting_name text;
BEGIN
  FOREACH setting_name IN ARRAY ARRAY[
    'app.client_decision_insert_id',
    'app.client_decision_write_id',
    'app.project_approval_decision_write_id',
    'app.project_completion_id',
    'app.project_phase_batch_token',
    'app.project_reassignment_id',
    'app.proposal_accept_id',
    'app.proposal_feedback_id',
    'app.proposal_signature_engagement_id',
    'app.scope_change_transition'
  ]
  LOOP
    PERFORM set_config(setting_name, '00486-rollback-sentinel', true);
  END LOOP;
END
$seed_transaction_local_cleanup_sentinels$;
SET LOCAL ROLE authenticated;
ROLLBACK;

BEGIN;
SET LOCAL plpgsql.check_asserts = on;
DO $second_transaction_preflight$
DECLARE
  setting_name text;
BEGIN
  IF current_setting('plpgsql.check_asserts') <> 'on' THEN
    RAISE EXCEPTION '00486 second transaction requires plpgsql.check_asserts=on';
  END IF;
  IF current_setting('role', true) IS DISTINCT FROM 'none' THEN
    RAISE EXCEPTION '00486 prior database role leaked across rollback: %',
      current_setting('role', true);
  END IF;
  IF COALESCE(current_setting('request.jwt.claims', true), '') <> ''
     OR COALESCE(current_setting('request.jwt.claim.sub', true), '') <> ''
  THEN
    RAISE EXCEPTION '00486 prior request identity leaked across rollback';
  END IF;

  FOREACH setting_name IN ARRAY ARRAY[
    'app.client_decision_insert_id',
    'app.client_decision_write_id',
    'app.project_approval_decision_write_id',
    'app.project_completion_id',
    'app.project_phase_batch_token',
    'app.project_reassignment_id',
    'app.proposal_accept_id',
    'app.proposal_feedback_id',
    'app.proposal_signature_engagement_id',
    'app.scope_change_transition'
  ]
  LOOP
    IF COALESCE(current_setting(setting_name, true), '') <> '' THEN
      RAISE EXCEPTION '00486 capability GUC % leaked across rollback: %',
        setting_name, current_setting(setting_name, true);
    END IF;
  END LOOP;
END
$second_transaction_preflight$;

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '48600000-0000-4000-8000-00000000f001',
    'role', 'authenticated'
  )::text,
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '48600000-0000-4000-8000-00000000f001',
  true
);
SET LOCAL ROLE authenticated;
DO $successor_session_contract$
DECLARE
  setting_name text;
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'authenticated'
     OR auth.uid() IS DISTINCT FROM
       '48600000-0000-4000-8000-00000000f001'::uuid
     OR current_setting('request.jwt.claims', true)::jsonb->>'role'
        IS DISTINCT FROM 'authenticated'
  THEN
    RAISE EXCEPTION '00486 successor caller identity/role was not freshly installed';
  END IF;

  FOREACH setting_name IN ARRAY ARRAY[
    'app.client_decision_insert_id',
    'app.client_decision_write_id',
    'app.project_approval_decision_write_id',
    'app.project_completion_id',
    'app.project_phase_batch_token',
    'app.project_reassignment_id',
    'app.proposal_accept_id',
    'app.proposal_feedback_id',
    'app.proposal_signature_engagement_id',
    'app.scope_change_transition'
  ]
  LOOP
    IF COALESCE(current_setting(setting_name, true), '') <> '' THEN
      RAISE EXCEPTION '00486 successor inherited capability GUC %: %',
        setting_name, current_setting(setting_name, true);
    END IF;
  END LOOP;
END
$successor_session_contract$;
RESET ROLE;
ROLLBACK;
