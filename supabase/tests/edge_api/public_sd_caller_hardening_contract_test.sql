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

CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION pg_temp._00486_references_routine(
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
          substr(v_name_token, 2, length(v_name_token) - 2), '""', '"'
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
          substr(v_schema_token, 2, length(v_schema_token) - 2), '""', '"'
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
    '9f0aa8cf4611f0547b9356997e477c3dcbea4ed591e7f05ef1572122618fe39f',
    ARRAY['authenticated'],
    $call$SELECT public.activate_project_v2('{"name":"ACL denial"}'::jsonb)$call$
  ),
  (
    'public.apply_scope_change(uuid)', 'p_request_id uuid', 'void', 'v',
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    '88cd8a50f7851f7a4857e7a0e79bafb741c20c0ddd87b6f49005aa2438c58e49',
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
    '4301647c39107e143774c434436248b3fc7946bf75b7b102c0ec335bc156d5d1',
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
    '84b6f8eccb9de7e2acba05f84707b56562b01fa595a89e1ada0b5a89e6a5a0dc',
    ARRAY['authenticated'],
    $call$SELECT public.escalate_item_feedback_to_decision('48600000-0000-4000-8000-00000000ff07','48600000-0000-4000-8000-00000000ff08')$call$
  ),
  (
    'public.expire_due_client_decisions(timestamp with time zone)',
    'p_cutoff timestamp with time zone', 'TABLE(id uuid)', 'v',
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    '6238367c240614e6c9f52222e07c726f24f201058ed2392ed757ef49794cc1f5',
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
    '31fe6ad2c1809d5abacb78c09cef814921814a1036977a7207436bfd4f08e3e9',
    ARRAY['authenticated'],
    $call$SELECT public.reassign_project_lead('48600000-0000-4000-8000-00000000ff13','48600000-0000-4000-8000-00000000ff14','48600000-0000-4000-8000-00000000ff15')$call$
  ),
  (
    'public.record_offline_signature(uuid,text,boolean,date)',
    'p_proposal_id uuid, p_signed_name text, p_auto_activate boolean DEFAULT true, p_start_date date DEFAULT CURRENT_DATE',
    'uuid', 'v', ARRAY['search_path=pg_catalog, public, pg_temp'],
    'c75acf68064717681a1d55f1eb233c45aae05b9a4bb6099c0af57bc4d4af2a35',
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
    'a13453ffde6d1ed63523fec73b013227158f0b29d025b7ae74f6a3df798e060d',
    ARRAY['authenticated'],
    $call$SELECT public.request_proposal_change('48600000-0000-4000-8000-00000000ff18','Denied change')$call$
  ),
  (
    'public.review_sms_message(uuid,text,jsonb)',
    'p_message_id uuid, p_action text, p_effect jsonb DEFAULT NULL::jsonb',
    'jsonb', 'v', ARRAY['search_path=pg_catalog, public, pg_temp'],
    '97f87c14df99dbc9a5c45c02f63274715b3a16fdc82291609bf3930cdb4e5173',
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

CREATE TEMP TABLE _00486_dependencies (
  signature text PRIMARY KEY,
  arguments text NOT NULL,
  result_type text NOT NULL,
  language_name text NOT NULL,
  security_definer boolean NOT NULL,
  volatility "char" NOT NULL,
  body_sha256 text NOT NULL,
  direct_roles text[] NOT NULL
) ON COMMIT DROP;

INSERT INTO _00486_dependencies VALUES
  ('public._finalize_spec_book_issue_00403(uuid)', 'p_revision_id uuid',
   'public.spec_book_revisions', 'plpgsql', true, 'v',
   '095109b82a35f52c551a203ecbf05b539180ad595644988e511c3af8841668d4',
   ARRAY[]::text[]),
  ('public._scope_change_requester_can_author(uuid,uuid)',
   'p_actor uuid, p_owner uuid', 'boolean', 'sql', true, 's',
   'cf1a32d2ab1608f8c3667b5f8320192dc274ad47d740b0609d64bc6824744e00',
   ARRAY[]::text[]),
  ('public._scope_change_requester_can_author(uuid,uuid,uuid)',
   'p_actor uuid, p_owner uuid, p_project_id uuid', 'boolean', 'plpgsql', true, 'v',
   '0ad79001500666469b44240b55335f5f2eb07adc967d97f43e04b34397273508',
   ARRAY[]::text[]),
  ('public.guard_scope_change_request_integrity()', '', 'trigger',
   'plpgsql', false, 'v',
   'f21792bc771560f38df42bd33300615dcc0625d43020b6707706470889aa8403',
   ARRAY[]::text[]),
  ('public.send_scope_change_request(uuid,uuid)',
   'p_request_id uuid, p_project_id uuid', 'jsonb', 'plpgsql', true, 'v',
   '625f109b0473c31b20f69efa634bc0f4ca80c013c5037bacb316809b5100c657',
   ARRAY['authenticated', 'service_role']),
  ('public.approve_scope_change_request(uuid,uuid,text,text)',
   'p_request_id uuid, p_project_id uuid, p_approved_by_name text, p_approved_ip text DEFAULT NULL::text',
   'jsonb', 'plpgsql', true, 'v',
   '1a8f590887295f38fe35c4963cde5d95960398b29b59ff938b4318362f0b3e42',
   ARRAY['authenticated', 'service_role']),
  ('public.accept_client_scope_change_request(uuid,uuid)',
   'p_request_id uuid, p_project_id uuid', 'jsonb', 'plpgsql', true, 'v',
   '56c34a3f637393aa3fec4c7aea708db421f054ebb034092a54b35347b2af3d8a',
   ARRAY['authenticated', 'service_role']),
  ('public.decline_scope_change_request(uuid,uuid,text)',
   'p_request_id uuid, p_project_id uuid, p_decline_reason text DEFAULT NULL::text',
   'jsonb', 'plpgsql', true, 'v',
   '689f31f8c7a3688bc37fd4a0b68a319d8be0cf2dc0bffffd1ab2757ecfda70f4',
   ARRAY['authenticated', 'service_role']),
  ('public.cancel_scope_change_request(uuid,uuid)',
   'p_request_id uuid, p_project_id uuid', 'jsonb', 'plpgsql', true, 'v',
   '53b7f672ed533ab86fe96e18c8c67bd8492331fc7d2210743ce47e307febfde3',
   ARRAY['authenticated', 'service_role']),
  ('public.apply_field_effect(uuid,jsonb,text,uuid)',
   'p_party_id uuid, p_effect jsonb, p_source text DEFAULT ''sms''::text, p_sms_message_id uuid DEFAULT NULL::uuid',
   'jsonb', 'plpgsql', true, 'v',
   '04bc0150662c657c3a3b561527c1d649fc41d517252b2d33f12d51daad48052c',
   ARRAY['service_role']),
  ('public.draft_invoice_from_milestone(uuid)', 'p_milestone_id uuid',
   'uuid', 'plpgsql', true, 'v',
   '6a2df0b14e06aa00ad2bc90b59346c46c4b1e0cbc20ffa972b6ab63cdbeb8472',
   ARRAY['service_role']),
  ('public._draft_invoice_from_milestone_00486(uuid)', 'p_milestone_id uuid',
   'uuid', 'plpgsql', true, 'v',
   '000414169a6d57ee560f901d5ad8acef1aafcaf607de21df395ec8045db60c50',
   ARRAY[]::text[]),
  ('public.sync_invoice_line_milestone_latch()', '', 'trigger',
   'plpgsql', false, 'v',
   'fb3520a732378efe39f0e68838bcfada60cad47a1ac9c440fc3feedd1aa596b0',
   ARRAY[]::text[]);

DO $dependency_catalog_contract$
BEGIN
  ASSERT (SELECT count(*) = 13 FROM _00486_dependencies),
    '00486 dependency manifest must contain exactly 13 routines';
  ASSERT NOT EXISTS (
    SELECT 1
    FROM _00486_dependencies AS expected
    LEFT JOIN pg_proc AS routine
      ON routine.oid = to_regprocedure(expected.signature)
    LEFT JOIN pg_roles AS owner ON owner.oid = routine.proowner
    LEFT JOIN pg_language AS language ON language.oid = routine.prolang
    WHERE routine.oid IS NULL
       OR owner.rolname IS DISTINCT FROM 'postgres'
       OR language.lanname IS DISTINCT FROM expected.language_name
       OR routine.prokind IS DISTINCT FROM 'f'::"char"
       OR routine.prosecdef IS DISTINCT FROM expected.security_definer
       OR routine.proleakproof
       OR routine.proisstrict
       OR routine.proparallel IS DISTINCT FROM 'u'::"char"
       OR routine.provolatile IS DISTINCT FROM expected.volatility
       OR pg_get_function_arguments(routine.oid) IS DISTINCT FROM expected.arguments
       OR pg_get_function_result(routine.oid) IS DISTINCT FROM expected.result_type
       OR routine.proconfig IS DISTINCT FROM
          ARRAY['search_path=pg_catalog, public, pg_temp']::text[]
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
  ), '00486 dependent routine profile/body/config/ACL drifted';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM _00486_dependencies AS expected
    CROSS JOIN unnest(ARRAY[
      'anon', 'authenticated', 'service_role', 'dashboard_user',
      'agent_reader', 'agent_writer', 'edge_catalog_reader', 'edge_rls_user'
    ]) AS app_role(role_name)
    WHERE has_function_privilege(
      app_role.role_name, expected.signature, 'EXECUTE'
    ) IS DISTINCT FROM (app_role.role_name = ANY(expected.direct_roles))
  ), '00486 dependent effective EXECUTE privileges drifted';

  ASSERT (
    SELECT count(*) = 1
    FROM pg_trigger AS binding
    WHERE binding.tgfoid =
      'public.guard_scope_change_request_integrity()'::regprocedure
      AND NOT binding.tgisinternal
  ) AND EXISTS (
    SELECT 1
    FROM pg_trigger AS binding
    WHERE binding.tgfoid =
      'public.guard_scope_change_request_integrity()'::regprocedure
      AND binding.tgname = 'guard_scope_change_request_integrity'
      AND binding.tgrelid = 'public.scope_change_requests'::regclass
      AND binding.tgtype = 23
      AND binding.tgenabled = 'O'
      AND NOT binding.tgisinternal
  ), 'scope-change guard binding drifted';

  ASSERT (
    SELECT count(*) = 1
    FROM pg_trigger AS binding
    WHERE binding.tgfoid =
      'public.sync_invoice_line_milestone_latch()'::regprocedure
      AND binding.tgname = 'sync_invoice_line_milestone_latch_trg'
      AND binding.tgrelid = 'public.invoice_line_items'::regclass
      AND binding.tgtype = 29
      AND binding.tgenabled = 'O'
      AND binding.tgnargs = 0
      AND octet_length(binding.tgargs) = 0
      AND binding.tgqual IS NULL
      AND binding.tgattr::text = ''
      AND NOT binding.tgisinternal
  ), 'invoice milestone latch binding drifted';

  ASSERT position(
    'FOR UPDATE' IN upper((
      SELECT routine.prosrc
      FROM pg_proc AS routine
      WHERE routine.oid =
        'public.sync_invoice_line_milestone_latch()'::regprocedure
    ))
  ) = 0, 'invoice-line AFTER trigger reacquired a parent row lock';

  ASSERT obj_description(
    'public.sync_invoice_line_milestone_latch()'::regprocedure,
    'pg_proc'
  ) =
    'Exact invoice/project milestone latch validation: draft attachment is canonical; authenticated direct detach is denied; owner/service detach is accepted only after void released the latch; the AFTER trigger takes no parent row locks.',
    'invoice milestone latch authority comment drifted';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_proc AS caller
    WHERE caller.prosecdef
      AND position('_finalize_spec_book_issue_00403' IN caller.prosrc) > 0
  ), 'retired finalizer retained a SECURITY DEFINER caller';

  ASSERT (
    SELECT array_agg(caller.oid ORDER BY caller.oid)
    FROM pg_proc AS caller
    WHERE position(
      'public._scope_change_requester_can_author(' IN caller.prosrc
    ) > 0
  ) IS NOT DISTINCT FROM (
    SELECT array_agg(signature::regprocedure::oid ORDER BY signature::regprocedure::oid)
    FROM unnest(ARRAY[
      'public.accept_client_scope_change_request(uuid,uuid)',
      'public.apply_scope_change(uuid)',
      'public.approve_scope_change_request(uuid,uuid,text,text)',
      'public.cancel_scope_change_request(uuid,uuid)',
      'public.decline_scope_change_request(uuid,uuid,text)',
      'public.send_scope_change_request(uuid,uuid)'
    ]) AS expected(signature)
  ), 'scope-change helper caller graph drifted';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM (VALUES
      ('public.send_scope_change_request(uuid,uuid)',
       'public._scope_change_requester_can_author( v_actor, v_project.designer_id, v_project.id )'),
      ('public.approve_scope_change_request(uuid,uuid,text,text)',
       'public._scope_change_requester_can_author( v_request.requested_by, v_project.designer_id, v_project.id )'),
      ('public.accept_client_scope_change_request(uuid,uuid)',
       'public._scope_change_requester_can_author( v_actor, v_project.designer_id, v_project.id )'),
      ('public.decline_scope_change_request(uuid,uuid,text)',
       'public._scope_change_requester_can_author( v_request.requested_by, v_project.designer_id, v_project.id )'),
      ('public.cancel_scope_change_request(uuid,uuid)',
       'public._scope_change_requester_can_author( v_actor, v_project.designer_id, v_project.id )'),
      ('public.apply_scope_change(uuid)',
       'public._scope_change_requester_can_author( auth.uid(), v_project.designer_id, v_project.id )'),
      ('public.apply_scope_change(uuid)',
       'public._scope_change_requester_can_author( v_request.requested_by, v_project.designer_id, v_project.id )')
    ) AS expected(signature, call_fragment)
    JOIN pg_proc AS caller
      ON caller.oid = expected.signature::regprocedure
    WHERE position(
      expected.call_fragment IN regexp_replace(
        caller.prosrc, '[[:space:]]+', ' ', 'g'
      )
    ) = 0
  ), 'scope-change caller lost the exact project helper argument';

  ASSERT pg_temp._00486_references_routine(
      'SELECT PUBLIC._DRAFT_INVOICE_FROM_MILESTONE_00486($1)',
      'public', '_draft_invoice_from_milestone_00486'
    ) AND pg_temp._00486_references_routine(
      'SELECT "public"."_draft_invoice_from_milestone_00486"($1)',
      'public', '_draft_invoice_from_milestone_00486'
    ) AND pg_temp._00486_references_routine(
      $source$BEGIN EXECUTE format('SELECT public._draft_invoice_from_milestone_00486(%L)', value); END$source$,
      'public', '_draft_invoice_from_milestone_00486'
    ) AND pg_temp._00486_references_routine(
      $source$BEGIN EXECUTE format('SELECT %I.%I($1)', 'public', '_draft_invoice_from_milestone_00486'); END$source$,
      'public', '_draft_invoice_from_milestone_00486'
    ) AND pg_temp._00486_references_routine(
      $source$BEGIN EXECUTE format('%s%s', '_draft_invoice_from_', 'milestone_00486'); END$source$,
      'public', '_draft_invoice_from_milestone_00486'
    ) AND pg_temp._00486_references_routine(
      $source$BEGIN EXECUTE 'SELECT public._draft_invoice_from_' || 'milestone_00486($1)'; END$source$,
      'public', '_draft_invoice_from_milestone_00486'
    ) AND NOT pg_temp._00486_references_routine(
      'SELECT "public"."_DRAFT_INVOICE_FROM_MILESTONE_00486"($1)',
      'public', '_draft_invoice_from_milestone_00486'
    ) AND NOT pg_temp._00486_references_routine(
      'SELECT other._draft_invoice_from_milestone_00486($1)',
      'public', '_draft_invoice_from_milestone_00486'
    ) AND NOT pg_temp._00486_references_routine(
      $source$PERFORM 'public._draft_invoice_from_milestone_00486(';$source$,
      'public', '_draft_invoice_from_milestone_00486'
    ), 'milestone core scanner lost case, quoting, dynamic SQL, or literal boundaries';

  ASSERT pg_temp._00486_references_routine(
      'SELECT PUBLIC.DRAFT_INVOICE_FROM_MILESTONE($1)',
      'public', 'draft_invoice_from_milestone'
    ) AND pg_temp._00486_references_routine(
      'SELECT "public"."draft_invoice_from_milestone"($1)',
      'public', 'draft_invoice_from_milestone'
    ) AND NOT pg_temp._00486_references_routine(
      'SELECT "public"."DRAFT_INVOICE_FROM_MILESTONE"($1)',
      'public', 'draft_invoice_from_milestone'
    ) AND NOT pg_temp._00486_references_routine(
      'SELECT other.draft_invoice_from_milestone($1)',
      'public', 'draft_invoice_from_milestone'
    ), 'milestone wrapper scanner lost case, quoting, or schema boundaries';

  ASSERT (
    SELECT array_agg(caller.oid ORDER BY caller.oid)
    FROM pg_proc AS caller
    JOIN pg_namespace AS caller_namespace
      ON caller_namespace.oid = caller.pronamespace
    WHERE caller_namespace.nspname !~ '^pg_'
      AND caller_namespace.nspname <> 'information_schema'
      AND pg_temp._00486_references_routine(
        caller.prosrc, 'public', '_draft_invoice_from_milestone_00486'
      )
  ) IS NOT DISTINCT FROM ARRAY[
    'public.draft_invoice_from_milestone(uuid)'::regprocedure::oid
  ], 'milestone-invoice legacy core caller graph drifted';

  ASSERT (
    SELECT array_agg(caller.oid ORDER BY caller.oid)
    FROM pg_proc AS caller
    JOIN pg_namespace AS caller_namespace
      ON caller_namespace.oid = caller.pronamespace
    WHERE caller_namespace.nspname !~ '^pg_'
      AND caller_namespace.nspname <> 'information_schema'
      AND pg_temp._00486_references_routine(
        caller.prosrc, 'public', 'draft_invoice_from_milestone'
      )
  ) IS NOT DISTINCT FROM (
    SELECT array_agg(signature::regprocedure::oid ORDER BY signature::regprocedure::oid)
    FROM unnest(ARRAY[
      'public._activate_proposal_as_project_impl(uuid,date)',
      'public._draft_invoice_from_milestone_00486(uuid)',
      'public.draft_milestones_on_production_start()',
      'public.generate_milestone_invoice(uuid)',
      'public.settle_section_on_gate_approval()'
    ]) AS expected(signature)
  ), 'milestone-invoice wrapper caller graph drifted';

  ASSERT (
    SELECT array_agg(caller.oid ORDER BY caller.oid)
    FROM pg_proc AS caller
    WHERE position('public.apply_field_effect(' IN caller.prosrc) > 0
  ) IS NOT DISTINCT FROM ARRAY[
    'public.review_sms_message(uuid,text,jsonb)'::regprocedure::oid
  ] AND (
    SELECT array_agg(caller.oid ORDER BY caller.oid)
    FROM pg_proc AS caller
    WHERE position(
      'public._apply_field_effect_legacy_00399(' IN caller.prosrc
    ) > 0
  ) IS NOT DISTINCT FROM ARRAY[
    'public.apply_field_effect(uuid,jsonb,text,uuid)'::regprocedure::oid
  ], 'SMS field-effect relay caller graph drifted';
END
$dependency_catalog_contract$;

CREATE TEMP TABLE _00486_lock_order_dependencies (
  signature text PRIMARY KEY,
  arguments text NOT NULL,
  result_type text NOT NULL,
  security_definer boolean NOT NULL,
  body_sha256 text NOT NULL,
  direct_roles text[] NOT NULL
) ON COMMIT DROP;

INSERT INTO _00486_lock_order_dependencies VALUES
  (
    'public.apply_client_decision(uuid,uuid,text,text,text,integer)',
    'p_decision_id uuid, p_selected_option_id uuid, p_client_consent_method text DEFAULT NULL::text, p_client_signature text DEFAULT NULL::text, p_client_note text DEFAULT NULL::text, p_quantity integer DEFAULT NULL::integer',
    'public.client_decisions', true,
    'e0f920c2c9fdc5cf02f7575e009890fc3f86c96223bbca7f6a804ee6c21a066e',
    ARRAY['authenticated']
  ),
  (
    'public.po_status_cascade_to_items()', '', 'trigger', true,
    '29a59ba5a0a33bb1253d52541539283ea4eca70b13ca33f52a98d0b199ba9ffe',
    ARRAY[]::text[]
  ),
  (
    'public.draft_milestones_on_production_start()', '', 'trigger', true,
    '9c3de79a28db81dc37ab42d0f05eb9557995887220d39bed97ea0fa058f90011',
    ARRAY[]::text[]
  ),
  (
    'public.guard_ffe_production_transition()', '', 'trigger', false,
    '6c2c1082d6fcd2a94654431a766c4a1f717e70de8f55426c7190c6b2e9becc31',
    ARRAY[]::text[]
  );

DO $lock_order_catalog_contract$
BEGIN
  ASSERT (SELECT count(*) = 4 FROM _00486_lock_order_dependencies),
    '00486 lock-order dependency manifest must contain exactly four routines';
  ASSERT NOT EXISTS (
    SELECT 1
    FROM _00486_lock_order_dependencies AS expected
    LEFT JOIN pg_proc AS routine
      ON routine.oid = to_regprocedure(expected.signature)
    LEFT JOIN pg_roles AS owner ON owner.oid = routine.proowner
    LEFT JOIN pg_language AS language ON language.oid = routine.prolang
    WHERE routine.oid IS NULL
       OR owner.rolname IS DISTINCT FROM 'postgres'
       OR language.lanname IS DISTINCT FROM 'plpgsql'
       OR routine.prokind IS DISTINCT FROM 'f'::"char"
       OR routine.prosecdef IS DISTINCT FROM expected.security_definer
       OR routine.proleakproof
       OR routine.proisstrict
       OR routine.proparallel IS DISTINCT FROM 'u'::"char"
       OR routine.provolatile IS DISTINCT FROM 'v'::"char"
       OR pg_get_function_arguments(routine.oid) IS DISTINCT FROM
          expected.arguments
       OR pg_get_function_result(routine.oid) IS DISTINCT FROM
          expected.result_type
       OR routine.proconfig IS DISTINCT FROM
          ARRAY['search_path=pg_catalog, public, pg_temp']::text[]
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
            FROM unnest(array_append(expected.direct_roles, 'postgres'))
              AS role_name
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
  ), '00486 lock-order routine profile/body/config/ACL drifted';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM _00486_lock_order_dependencies AS expected
    CROSS JOIN unnest(ARRAY[
      'anon', 'authenticated', 'service_role', 'dashboard_user',
      'agent_reader', 'agent_writer', 'edge_catalog_reader', 'edge_rls_user'
    ]) AS app_role(role_name)
    WHERE has_function_privilege(
      app_role.role_name, expected.signature, 'EXECUTE'
    ) IS DISTINCT FROM (app_role.role_name = ANY(expected.direct_roles))
  ), '00486 lock-order effective EXECUTE privileges drifted';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM (VALUES
      (
        'public.po_status_cascade_to_items()'::regprocedure,
        'public.purchase_orders'::regclass,
        'trg_po_status_cascade_to_items', 17::smallint, true
      ),
      (
        'public.guard_ffe_production_transition()'::regprocedure,
        'public.project_ffe_items'::regclass,
        'guard_ffe_production_transition_trg', 19::smallint, false
      ),
      (
        'public.draft_milestones_on_production_start()'::regprocedure,
        'public.project_ffe_items'::regclass,
        'draft_milestones_on_production_start_trg', 17::smallint, false
      )
    ) AS expected(function_oid, relation_oid, trigger_name, trigger_type, has_when)
    LEFT JOIN pg_trigger AS binding
      ON binding.tgfoid = expected.function_oid
     AND binding.tgrelid = expected.relation_oid
     AND binding.tgname = expected.trigger_name
     AND NOT binding.tgisinternal
    WHERE binding.oid IS NULL
       OR binding.tgtype <> expected.trigger_type
       OR binding.tgenabled <> 'O'
       OR binding.tgnargs <> 0
       OR octet_length(binding.tgargs) <> 0
       OR (binding.tgqual IS NOT NULL) IS DISTINCT FROM expected.has_when
       OR binding.tgattr::text IS DISTINCT FROM (
            SELECT attribute.attnum::text
            FROM pg_attribute AS attribute
            WHERE attribute.attrelid = expected.relation_oid
              AND attribute.attname = 'status'
              AND NOT attribute.attisdropped
          )
       OR (
            expected.has_when
            AND pg_get_expr(binding.tgqual, binding.tgrelid)
                IS DISTINCT FROM '(old.status IS DISTINCT FROM new.status)'
          )
  ), '00486 lock-order trigger binding drifted';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM _00486_lock_order_dependencies AS expected
    JOIN pg_trigger AS binding
      ON binding.tgfoid = expected.signature::regprocedure
     AND NOT binding.tgisinternal
    WHERE expected.result_type = 'trigger'
    GROUP BY expected.signature
    HAVING count(*) <> 1
  ), '00486 lock-order trigger acquired an extra binding';

  ASSERT (
    SELECT array_agg(caller.oid ORDER BY caller.oid)
    FROM pg_proc AS caller
    JOIN pg_namespace AS caller_namespace
      ON caller_namespace.oid = caller.pronamespace
    WHERE caller_namespace.nspname !~ '^pg_'
      AND caller_namespace.nspname <> 'information_schema'
      AND position('app.ffe_production_transition' IN caller.prosrc) > 0
  ) IS NOT DISTINCT FROM (
    SELECT array_agg(signature::regprocedure::oid ORDER BY signature::regprocedure::oid)
    FROM unnest(ARRAY[
      'public.guard_ffe_production_transition()',
      'public.po_status_cascade_to_items()'
    ]) AS expected(signature)
  ), '00486 production authority caller graph drifted';
END
$lock_order_catalog_contract$;

CREATE FUNCTION public._00486_dynamic_format_probe()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $probe$
BEGIN
  EXECUTE format(
    'SELECT %I.%I($1)', 'public', '_draft_invoice_from_milestone_00486'
  ) USING NULL::uuid;
END;
$probe$;

CREATE FUNCTION public._00486_dynamic_argument_probe()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $probe$
BEGIN
  EXECUTE format(
    '%s%s', '_draft_invoice_from_', 'milestone_00486'
  );
END;
$probe$;

CREATE FUNCTION public._00486_dynamic_concat_probe()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $probe$
BEGIN
  EXECUTE 'SELECT public._draft_invoice_from_'
    || 'milestone_00486($1)' USING NULL::uuid;
END;
$probe$;

REVOKE ALL PRIVILEGES ON FUNCTION
  public._00486_dynamic_format_probe(),
  public._00486_dynamic_argument_probe(),
  public._00486_dynamic_concat_probe()
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;

DO $dynamic_catalog_negative_contract$
BEGIN
  ASSERT (
    SELECT array_agg(caller.oid ORDER BY caller.oid)
    FROM pg_proc AS caller
    WHERE caller.oid = ANY(ARRAY[
      'public._00486_dynamic_format_probe()'::regprocedure::oid,
      'public._00486_dynamic_argument_probe()'::regprocedure::oid,
      'public._00486_dynamic_concat_probe()'::regprocedure::oid
    ])
      AND pg_temp._00486_references_routine(
        caller.prosrc, 'public', '_draft_invoice_from_milestone_00486'
      )
  ) IS NOT DISTINCT FROM (
    SELECT array_agg(probe_oid ORDER BY probe_oid)
    FROM unnest(ARRAY[
      'public._00486_dynamic_format_probe()'::regprocedure::oid,
      'public._00486_dynamic_argument_probe()'::regprocedure::oid,
      'public._00486_dynamic_concat_probe()'::regprocedure::oid
    ]) AS expected(probe_oid)
  ), 'dynamic SQL catalog callers escaped the private-core anti-join';

  ASSERT (
    SELECT array_agg(caller.oid ORDER BY caller.oid)
    FROM pg_proc AS caller
    JOIN pg_namespace AS caller_namespace
      ON caller_namespace.oid = caller.pronamespace
    WHERE caller_namespace.nspname !~ '^pg_'
      AND caller_namespace.nspname <> 'information_schema'
      AND pg_temp._00486_references_routine(
        caller.prosrc, 'public', '_draft_invoice_from_milestone_00486'
      )
  ) IS DISTINCT FROM ARRAY[
    'public.draft_invoice_from_milestone(uuid)'::regprocedure::oid
  ], 'dynamic SQL catalog callers did not fail the exact anti-join';
END
$dynamic_catalog_negative_contract$;

DROP FUNCTION public._00486_dynamic_format_probe();
DROP FUNCTION public._00486_dynamic_argument_probe();
DROP FUNCTION public._00486_dynamic_concat_probe();

DO $invoice_line_policy_contract$
BEGIN
  ASSERT (
    SELECT count(*) = 5
    FROM pg_policy AS policy
    WHERE policy.polrelid = 'public.invoice_line_items'::regclass
  ), 'invoice-line RLS retained a permissive legacy policy';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM (VALUES
      ('invoice_line_items_exact_studio_select', 'r'::"char", true, false),
      ('invoice_line_items_exact_studio_insert_draft', 'a'::"char", false, true),
      ('invoice_line_items_exact_studio_update_draft', 'w'::"char", true, true),
      ('invoice_line_items_exact_studio_delete_draft', 'd'::"char", true, false),
      ('invoice_line_items_exact_client_select', 'r'::"char", true, false)
    ) AS expected(policy_name, command, has_qual, has_check)
    LEFT JOIN pg_policy AS policy
      ON policy.polrelid = 'public.invoice_line_items'::regclass
     AND policy.polname = expected.policy_name
    WHERE policy.oid IS NULL
       OR NOT policy.polpermissive
       OR policy.polcmd IS DISTINCT FROM expected.command
       OR policy.polroles IS DISTINCT FROM
          ARRAY['authenticated'::regrole::oid]
       OR (policy.polqual IS NOT NULL) IS DISTINCT FROM expected.has_qual
       OR (policy.polwithcheck IS NOT NULL) IS DISTINCT FROM expected.has_check
  ), 'invoice-line exact policy catalog contract drifted';
END
$invoice_line_policy_contract$;

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
     AND body NOT LIKE '%input->>''assigned_by''%'
     AND position('IF v_caller_id IS NULL' IN body) <
         position('v_client_id := NULLIF(input->>''client_id''' IN body)
     AND position('IF v_caller_id IS NULL' IN body) <
         position('v_studio_id := NULLIF(input->>''studio_id''' IN body),
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

  ASSERT NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'public.send_scope_change_request(uuid,uuid)',
      'public.approve_scope_change_request(uuid,uuid,text,text)',
      'public.accept_client_scope_change_request(uuid,uuid)',
      'public.decline_scope_change_request(uuid,uuid,text)',
      'public.cancel_scope_change_request(uuid,uuid)'
    ]) AS affected(signature)
    JOIN pg_proc AS routine
      ON routine.oid = affected.signature::regprocedure
    WHERE routine.prosrc ~ '_can_author_proposal|is_studio_comember'
       OR routine.prosrc NOT LIKE
          '%_scope_change_requester_can_author(%project%'
  ), 'a scope-change direct lifecycle path lost exact project authority';

  SELECT routine.prosrc INTO body
  FROM pg_proc AS routine
  WHERE routine.oid =
    'public.guard_scope_change_request_integrity()'::regprocedure;
  ASSERT body LIKE '%current_user::text <> ''authenticated''%'
     AND body LIKE '%auth.uid() IS NULL%'
     AND body LIKE '%NEW.requested_by IS DISTINCT FROM auth.uid()%'
     AND body LIKE '%project.id = NEW.project_id%'
     AND body LIKE '%organization.id = v_studio_id%'
     AND body LIKE '%organization.type = ''design_studio''%'
     AND body LIKE '%organization.status = ''active''%'
     AND body LIKE '%membership.organization_id = v_studio_id%'
     AND body LIKE '%membership.user_id = auth.uid()%'
     AND body LIKE '%membership.status = ''active''%'
     AND body LIKE '%membership.role <> ''guest''%'
     AND body LIKE '%v_project_status IN (''completed'', ''archived'')%'
     AND body LIKE '%scope_change_request_direct_insert_requires_open_project%'
     AND position('FOR SHARE OF project' IN body) > 0
     AND position('FOR SHARE OF organization' IN body) >
         position('FOR SHARE OF project' IN body)
     AND position('FOR SHARE OF membership' IN body) >
         position('FOR SHARE OF organization' IN body)
     AND body NOT LIKE '%_scope_change_requester_can_author(%',
    'scope-change direct INSERT guard lost active caller/project-studio binding';

  SELECT routine.prosrc INTO body
  FROM pg_proc AS routine
  WHERE routine.oid =
    'public.apply_client_decision(uuid,uuid,text,text,text,integer)'::regprocedure;
  ASSERT position('SELECT decision.project_id INTO v_project_id' IN body) > 0
     AND position('relationship.client_id = v_actor' IN body) >
         position('SELECT decision.project_id INTO v_project_id' IN body)
     AND position('relationship.client_id = v_actor' IN body) <
         position('FOR UPDATE OF project' IN body)
     AND position('FOR UPDATE OF project' IN body) >
         position('SELECT decision.project_id INTO v_project_id' IN body)
     AND position('FOR UPDATE OF decision' IN body) >
         position('FOR UPDATE OF project' IN body)
     AND body LIKE '%v_locked_project_id IS DISTINCT FROM v_project_id%'
     AND body NOT LIKE '%request.jwt%'
     AND body NOT LIKE '%auth.jwt%',
    'apply_client_decision lost project-before-decision lock order';

  SELECT routine.prosrc INTO body
  FROM pg_proc AS routine
  WHERE routine.oid = 'public.po_status_cascade_to_items()'::regprocedure;
  ASSERT position('FOR UPDATE OF project' IN body) > 0
     AND position('FOR UPDATE OF project' IN body) <
         position('UPDATE public.project_ffe_items' IN body)
     AND body LIKE '%project.status = ''active''%'
     AND body LIKE '%app.ffe_production_transition%'
     AND body LIKE '%app.ffe_mutation_rpc%'
     AND body LIKE '%EXCEPTION WHEN OTHERS%'
     AND body NOT LIKE '%request.jwt%'
     AND body NOT LIKE '%auth.jwt%',
    'PO production cascade lost project-first capability routing';

  SELECT routine.prosrc INTO body
  FROM pg_proc AS routine
  WHERE routine.oid =
    'public.guard_ffe_production_transition()'::regprocedure;
  ASSERT body LIKE '%current_user <> ''postgres''%'
     AND body LIKE '%pg_trigger_depth() < 2%'
     AND body LIKE '%pg_catalog.txid_current()%'
     AND body LIKE '%purchase_order.status = ''in_production''%'
     AND body LIKE '%v_po_project_id IS DISTINCT FROM NEW.project_id%',
    'FFE production guard lost nested exact PO/project/transaction authority';

  SELECT routine.prosrc INTO body
  FROM pg_proc AS routine
  WHERE routine.oid =
    'public._scope_change_requester_can_author(uuid,uuid,uuid)'::regprocedure;
  ASSERT body LIKE '%project.id = p_project_id%'
     AND body LIKE '%organization.id = v_studio_id%'
     AND body LIKE '%organization.type = ''design_studio''%'
     AND body LIKE '%organization.status = ''active''%'
     AND body LIKE '%membership.organization_id = v_studio_id%'
     AND body LIKE '%membership.status = ''active''%'
     AND body LIKE '%membership.role <> ''guest''%'
     AND position('FOR SHARE OF project' IN body) > 0
     AND position('FOR SHARE OF organization' IN body) >
         position('FOR SHARE OF project' IN body)
     AND position('FOR SHARE OF membership' IN body) >
         position('FOR SHARE OF organization' IN body),
    'scope-change helper is not bound to the exact canonical project studio';

  SELECT routine.prosrc INTO body
  FROM pg_proc AS routine
  WHERE routine.oid =
    'public._scope_change_requester_can_author(uuid,uuid)'::regprocedure;
  ASSERT body LIKE '%p_actor = p_owner%'
     AND body NOT LIKE '%organization_members%',
    'legacy two-argument scope helper still grants shared-studio authority';

  SELECT routine.prosrc INTO body
  FROM pg_proc AS routine
  WHERE routine.oid =
    'public.draft_invoice_from_milestone(uuid)'::regprocedure;
  ASSERT body LIKE '%_draft_invoice_from_milestone_00486%'
     AND body LIKE '%project_team_members AS historical_lead%'
     AND body LIKE
       '%v_invoice.studio_id IS DISTINCT FROM v_project.studio_id%'
     AND position('FOR UPDATE' IN body) > 0
     AND position('SELECT * INTO v_project' IN body) <
         position('PERFORM invoice.id' IN body)
     AND position('PERFORM invoice.id' IN body) <
         position('PERFORM line.id' IN body)
     AND position('PERFORM line.id' IN body) <
         position('SELECT * INTO v_milestone' IN body)
     AND body NOT LIKE '%_can_manage_invoice_owner%',
    'milestone invoice wrapper lost canonical identity or lock order';

  ASSERT (
    SELECT routine.prosrc LIKE '%public.draft_invoice_from_milestone(%'
    FROM pg_proc AS routine
    WHERE routine.oid =
      'public._draft_invoice_from_milestone_00486(uuid)'::regprocedure
  ) AND (
    SELECT routine.prosrc LIKE '%public.draft_invoice_from_milestone(%'
    FROM pg_proc AS routine
    WHERE routine.oid =
      'public.generate_milestone_invoice(uuid)'::regprocedure
  ), 'milestone-invoice wrapper/core caller chain drifted';

  SELECT routine.prosrc INTO body
  FROM pg_proc AS routine
  WHERE routine.oid =
    'public.sync_invoice_line_milestone_latch()'::regprocedure;
  ASSERT body LIKE '%organization.id = v_project.studio_id%'
     AND body LIKE '%membership.user_id = auth.uid()%'
     AND body LIKE '%current_user = ''authenticated''%'
     AND body LIKE '%project_team_members AS historical_lead%'
     AND body LIKE
       '%v_invoice.studio_id IS DISTINCT FROM v_project.studio_id%'
     AND body LIKE '%v_previous_invoice.status IS DISTINCT FROM ''void''%'
     AND body LIKE '%milestone.invoice_id = OLD.invoice_id%'
     AND body NOT LIKE '%current_setting(''role'', true) = ''authenticated''%'
     AND body NOT LIKE '%FOR UPDATE%'
     AND body NOT LIKE '%owner_membership%'
     AND body NOT LIKE '%_can_manage_invoice_owner%',
    'invoice milestone latch lost effective-role, canonical, or lock-order guard';

  SELECT routine.prosrc INTO body
  FROM pg_proc AS routine
  WHERE routine.oid =
    'public.escalate_item_feedback_to_decision(uuid,uuid)'::regprocedure;
  ASSERT body LIKE '%gate.client_id%'
     AND body LIKE '%proposal.project_id%'
     AND body LIKE '%relationship.client_id = v_anchor_client_id%'
     AND body LIKE '%decision.project_id = v_anchor_project_id%'
     AND body LIKE '%FOR UPDATE OF feedback%'
     AND body LIKE '%FOR SHARE OF proposal%',
    'feedback escalation is not bound to its exact client and project anchor';

  SELECT routine.prosrc INTO body
  FROM pg_proc AS routine
  WHERE routine.oid = 'public.review_sms_message(uuid,text,jsonb)'::regprocedure;
  ASSERT body LIKE '%message.party_id%'
     AND body LIKE '%conversation.party_id%'
     AND body LIKE '%message.project_id%'
     AND body LIKE '%conversation.active_project_id%'
     AND body LIKE '%phone_match.party_count = 1%'
     AND body LIKE '%FOR UPDATE OF message, conversation, project%'
     AND body LIKE '%FOR SHARE OF party%'
     AND position('project.designer_id = auth.uid()' IN body) > 0
     AND position('project.designer_id = auth.uid()' IN body) <
       position('FOR UPDATE OF message, conversation, project' IN body)
     AND (
       length(body) - length(replace(body, 'FOR UPDATE', ''))
     ) / length('FOR UPDATE') = 1
     AND body LIKE '%v_party_id, v_effect%'
     AND body NOT LIKE '%LIMIT 1%',
    'SMS review locks before proving one authorized party/project/message tuple';

  SELECT routine.prosrc INTO body
  FROM pg_proc AS routine
  WHERE routine.oid =
    'public.apply_field_effect(uuid,jsonb,text,uuid)'::regprocedure;
  ASSERT body LIKE '%v_previous_decision_write_id%'
     AND body LIKE '%EXCEPTION WHEN OTHERS%'
     AND body NOT LIKE '%set_config(''app.client_decision_write_id'', '''', true)%',
    'field-effect relay does not restore the caller transaction capability';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM (VALUES
      ('public.activate_project_v2(jsonb)',
       'app.project_phase_batch_token'),
      ('public.accept_client_scope_change_request(uuid,uuid)',
       'app.scope_change_transition'),
      ('public.apply_field_effect(uuid,jsonb,text,uuid)',
       'app.client_decision_write_id'),
      ('public.apply_scope_change(uuid)', 'app.scope_change_transition'),
      ('public.approve_scope_change_request(uuid,uuid,text,text)',
       'app.scope_change_transition'),
      ('public.cancel_scope_change_request(uuid,uuid)',
       'app.scope_change_transition'),
      ('public.close_project(uuid,jsonb,jsonb)', 'app.project_completion_id'),
      ('public.decline_scope_change_request(uuid,uuid,text)',
       'app.scope_change_transition'),
      ('public.expire_due_client_decisions(timestamp with time zone)',
       'app.client_decision_write_id'),
      ('public.reassign_project_lead(uuid,uuid,uuid)',
       'app.client_decision_write_id'),
      ('public.reassign_project_lead(uuid,uuid,uuid)',
       'app.project_reassignment_id'),
      ('public.record_offline_signature(uuid,text,boolean,date)',
       'app.client_decision_insert_id'),
      ('public.record_offline_signature(uuid,text,boolean,date)',
       'app.proposal_accept_id'),
      ('public.record_offline_signature(uuid,text,boolean,date)',
       'app.proposal_signature_engagement_id'),
      ('public.request_proposal_change(uuid,text)',
       'app.proposal_feedback_id'),
      ('public.send_scope_change_request(uuid,uuid)',
       'app.scope_change_transition'),
      ('public.stamp_project_approval_reminder_delivery(uuid,uuid)',
       'app.client_decision_write_id'),
      ('public.stamp_project_approval_reminder_delivery(uuid,uuid)',
       'app.project_approval_decision_write_id')
    ) AS expected(signature, setting_name)
    JOIN pg_proc AS routine
      ON routine.oid = expected.signature::regprocedure
    WHERE routine.prosrc NOT LIKE '%EXCEPTION WHEN OTHERS%'
       OR routine.prosrc NOT LIKE '%COALESCE(v_previous%'
       OR (
         length(routine.prosrc) - length(
           replace(routine.prosrc, expected.setting_name, '')
         )
       ) / length(expected.setting_name) < 4
  ), 'a capability-setting routine lost exact success/error restoration';
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
  TO anon, authenticated, service_role, dashboard_user,
     agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;

SET LOCAL ROLE anon;
SELECT pg_temp.assert_00486_unlisted_denied('anon');
SELECT pg_temp.assert_00486_finalizer_dependency_denied();
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
SELECT pg_temp.assert_00486_finalizer_dependency_denied();
RESET ROLE;
SET LOCAL ROLE agent_reader;
SELECT pg_temp.assert_00486_unlisted_denied('agent_reader');
SELECT pg_temp.assert_00486_finalizer_dependency_denied();
RESET ROLE;
SET LOCAL ROLE agent_writer;
SELECT pg_temp.assert_00486_unlisted_denied('agent_writer');
SELECT pg_temp.assert_00486_finalizer_dependency_denied();
RESET ROLE;
SET LOCAL ROLE edge_catalog_reader;
SELECT pg_temp.assert_00486_unlisted_denied('edge_catalog_reader');
SELECT pg_temp.assert_00486_finalizer_dependency_denied();
RESET ROLE;
SET LOCAL ROLE edge_rls_user;
SELECT pg_temp.assert_00486_unlisted_denied('edge_rls_user');
SELECT pg_temp.assert_00486_finalizer_dependency_denied();
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
  ('48600000-0000-4000-8000-000000000031', '48600000-0000-4000-8000-000000000002', '48600000-0000-4000-8000-000000000004', '00486 Client B', 'active', 'direct'),
  ('48600000-0000-4000-8000-000000000032', '48600000-0000-4000-8000-000000000001', '48600000-0000-4000-8000-000000000004', '00486 Client B / Designer A', 'active', 'direct');

INSERT INTO public.projects (
  id, name, designer_id, client_id, studio_id, created_by, status,
  total_amount_cents, budget_cents, design_fee_cents, target_end_date
)
VALUES
  ('48600000-0000-4000-8000-000000000040', '00486 Project A', '48600000-0000-4000-8000-000000000001', '48600000-0000-4000-8000-000000000003', '48600000-0000-4000-8000-000000000010', '48600000-0000-4000-8000-000000000001', 'active', 0, 0, 0, current_date + 30),
  ('48600000-0000-4000-8000-000000000041', '00486 Project B foreign exact-studio target', '48600000-0000-4000-8000-000000000002', '48600000-0000-4000-8000-000000000004', '48600000-0000-4000-8000-000000000011', '48600000-0000-4000-8000-000000000002', 'active', 0, 0, 0, current_date + 30),
  ('48600000-0000-4000-8000-000000000042', '00486 Close A', '48600000-0000-4000-8000-000000000001', '48600000-0000-4000-8000-000000000003', '48600000-0000-4000-8000-000000000010', '48600000-0000-4000-8000-000000000001', 'active', 0, 0, 0, current_date + 30),
  ('48600000-0000-4000-8000-000000000044', '00486 Same designer wrong client/project', '48600000-0000-4000-8000-000000000001', '48600000-0000-4000-8000-000000000004', '48600000-0000-4000-8000-000000000010', '48600000-0000-4000-8000-000000000001', 'active', 0, 0, 0, current_date + 30);

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
  ('48600000-0000-4000-8000-000000000051', '48600000-0000-4000-8000-000000000041', 'vendor', '00486 Party B', 'party-b@test.invalid', '5554860002', '48600000-0000-4000-8000-000000000002'),
  ('48600000-0000-4000-8000-000000000052', '48600000-0000-4000-8000-000000000040', 'vendor', '00486 Ambiguous Party A', 'party-amb-a@test.invalid', '5554860003', '48600000-0000-4000-8000-000000000001'),
  ('48600000-0000-4000-8000-000000000053', '48600000-0000-4000-8000-000000000041', 'vendor', '00486 Ambiguous Party B', 'party-amb-b@test.invalid', '5554860003', '48600000-0000-4000-8000-000000000002');

INSERT INTO public.project_tasks (id, project_id, title, status)
VALUES
  ('48600000-0000-4000-8000-000000000054', '48600000-0000-4000-8000-000000000040', '00486 SMS task A', 'todo'),
  ('48600000-0000-4000-8000-000000000055', '48600000-0000-4000-8000-000000000041', '00486 SMS task B', 'todo');

INSERT INTO public.scope_change_requests (
  id, project_id, requested_by, request_origin, title, description, status,
  sent_at, approved_at, approved_by, approved_by_name,
  additional_ffe_budget_cents, additional_design_fee_cents,
  timeline_impact_weeks, new_rooms, new_ffe_items
)
VALUES
  ('48600000-0000-4000-8000-000000000060', '48600000-0000-4000-8000-000000000040', '48600000-0000-4000-8000-000000000001', 'designer_amendment', '00486 Apply A', 'Empty authorized change', 'approved', now(), now(), '48600000-0000-4000-8000-000000000001', '00486 Designer A', 0, 0, 0, '[]', '[]'),
  ('48600000-0000-4000-8000-000000000061', '48600000-0000-4000-8000-000000000041', '48600000-0000-4000-8000-000000000002', 'designer_amendment', '00486 Apply B', 'Foreign exact-studio change', 'approved', now(), now(), '48600000-0000-4000-8000-000000000002', '00486 Designer B', 0, 0, 0, '[]', '[]'),
  ('48600000-0000-4000-8000-000000000062', '48600000-0000-4000-8000-000000000041', '48600000-0000-4000-8000-000000000002', 'designer_amendment', '00486 Send B', 'Exact owner draft', 'draft', NULL, NULL, NULL, NULL, 0, 0, 0, '[]', '[]'),
  ('48600000-0000-4000-8000-000000000063', '48600000-0000-4000-8000-000000000041', '48600000-0000-4000-8000-000000000001', 'designer_amendment', '00486 Hostile send B', 'Cross-studio author draft', 'draft', NULL, NULL, NULL, NULL, 0, 0, 0, '[]', '[]'),
  ('48600000-0000-4000-8000-000000000064', '48600000-0000-4000-8000-000000000041', '48600000-0000-4000-8000-000000000001', 'designer_amendment', '00486 Hostile approve B', 'Cross-studio author sent request', 'sent', now(), NULL, NULL, NULL, 0, 0, 0, '[]', '[]'),
  ('48600000-0000-4000-8000-000000000065', '48600000-0000-4000-8000-000000000041', '48600000-0000-4000-8000-000000000004', 'client_request', '00486 Hostile accept B', 'Cross-studio accept target', 'sent', now(), NULL, NULL, NULL, 0, 0, 0, '[]', '[]'),
  ('48600000-0000-4000-8000-000000000066', '48600000-0000-4000-8000-000000000041', '48600000-0000-4000-8000-000000000001', 'designer_amendment', '00486 Hostile apply B', 'Cross-studio author approved request', 'approved', now(), now(), '48600000-0000-4000-8000-000000000004', '00486 Client B', 0, 0, 0, '[]', '[]'),
  ('48600000-0000-4000-8000-000000000069', '48600000-0000-4000-8000-000000000041', '48600000-0000-4000-8000-000000000002', 'designer_amendment', '00486 Decline B', 'Exact owner sent request', 'sent', now(), NULL, NULL, NULL, 0, 0, 0, '[]', '[]'),
  ('48600000-0000-4000-8000-00000000006a', '48600000-0000-4000-8000-000000000041', '48600000-0000-4000-8000-000000000002', 'designer_amendment', '00486 Cancel B', 'Exact owner draft request', 'draft', NULL, NULL, NULL, NULL, 0, 0, 0, '[]', '[]');

INSERT INTO public.project_payment_milestones (
  id, project_id, label, percentage, amount_cents, status, sort_order
)
VALUES
  ('48600000-0000-4000-8000-000000000070', '48600000-0000-4000-8000-000000000040', '00486 Milestone A', 0, 1000, 'pending', 1),
  ('48600000-0000-4000-8000-000000000071', '48600000-0000-4000-8000-000000000041', '00486 Milestone B hostile latch', 0, 1000, 'pending', 1),
  ('48600000-0000-4000-8000-000000000072', '48600000-0000-4000-8000-000000000041', '00486 Milestone B direct latch', 0, 1000, 'pending', 2),
  ('48600000-0000-4000-8000-000000000076', '48600000-0000-4000-8000-000000000040', '00486 Canonical latch', 0, 1200, 'pending', 2),
  ('48600000-0000-4000-8000-000000000088', '48600000-0000-4000-8000-000000000040', '00486 Decision settlement', 0, 1300, 'pending', 3);

UPDATE public.project_payment_milestones
SET trigger_kind = 'on_section_settled', trigger_section_key = 'brief'
WHERE id = '48600000-0000-4000-8000-000000000088';

SET LOCAL session_replication_role = replica;
INSERT INTO public.invoices (
  id, project_id, designer_id, client_id, studio_id, status,
  subtotal_cents, tax_cents, total_cents, amount_paid_cents, memo
)
VALUES
  ('48600000-0000-4000-8000-000000000073', '48600000-0000-4000-8000-000000000041', '48600000-0000-4000-8000-000000000001', '48600000-0000-4000-8000-000000000004', '48600000-0000-4000-8000-000000000010', 'draft', 1000, 0, 1000, 0, '00486 hostile pre-latch'),
  ('48600000-0000-4000-8000-000000000074', '48600000-0000-4000-8000-000000000041', '48600000-0000-4000-8000-000000000001', '48600000-0000-4000-8000-000000000004', '48600000-0000-4000-8000-000000000010', 'draft', 1000, 0, 1000, 0, '00486 hostile direct latch');

UPDATE public.project_payment_milestones
SET invoice_id = '48600000-0000-4000-8000-000000000073'
WHERE id = '48600000-0000-4000-8000-000000000071';
SET LOCAL session_replication_role = origin;

INSERT INTO public.invoices (
  id, project_id, designer_id, client_id, studio_id, status,
  subtotal_cents, tax_cents, total_cents, amount_paid_cents, memo
)
VALUES (
  '48600000-0000-4000-8000-000000000077',
  '48600000-0000-4000-8000-000000000040',
  '48600000-0000-4000-8000-000000000001',
  '48600000-0000-4000-8000-000000000003',
  '48600000-0000-4000-8000-000000000010',
  'draft', 1200, 0, 1200, 0, '00486 canonical line policy fixture'
);

INSERT INTO public.invoice_line_items (
  id, invoice_id, kind, milestone_id, description,
  quantity, unit_amount_cents, amount_cents, metadata, sort_order
)
VALUES (
  '48600000-0000-4000-8000-000000000078',
  '48600000-0000-4000-8000-000000000077', 'milestone',
  '48600000-0000-4000-8000-000000000076',
  '00486 canonical milestone line', 1, 1200, 1200, '{}'::jsonb, 0
);

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
  ('48600000-0000-4000-8000-000000000085', '48600000-0000-4000-8000-000000000001', '48600000-0000-4000-8000-000000000030', '48600000-0000-4000-8000-000000000003', '48600000-0000-4000-8000-000000000040', '00486 Feedback A', 0, 'sent', now(), now() + interval '30 days'),
  ('48600000-0000-4000-8000-000000000086', '48600000-0000-4000-8000-000000000001', '48600000-0000-4000-8000-000000000030', '48600000-0000-4000-8000-000000000003', NULL, '00486 Signing Deposit', 2500, 'sent', now(), now() + interval '30 days');

SET LOCAL session_replication_role = replica;
INSERT INTO public.proposal_payment_milestones (
  id, proposal_id, label, percentage, amount_cents,
  trigger_condition, sort_order
)
VALUES (
  '48600000-0000-4000-8000-000000000087',
  '48600000-0000-4000-8000-000000000086',
  '00486 Signing Deposit', 100, 2500, 'on signing', 0
);
SET LOCAL session_replication_role = origin;

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
  ('48600000-0000-4000-8000-0000000000b5', '48600000-0000-4000-8000-000000000030', '48600000-0000-4000-8000-000000000001', '48600000-0000-4000-8000-000000000040', '00486 Due Legacy Decision', 'approval', 'selection', 'designer', 'pending'),
  ('48600000-0000-4000-8000-0000000000b6', '48600000-0000-4000-8000-000000000032', '48600000-0000-4000-8000-000000000001', '48600000-0000-4000-8000-000000000044', '00486 Same designer mismatch', 'approval', 'selection', 'designer', 'pending');

SET LOCAL session_replication_role = replica;
INSERT INTO public.client_decisions (
  id, designer_client_id, designer_id, project_id, title,
  decision_type, decision_kind, coordination_kind, court, section_key,
  blocking_status, status, sent_at
)
VALUES (
  '48600000-0000-4000-8000-000000000089',
  '48600000-0000-4000-8000-000000000030',
  '48600000-0000-4000-8000-000000000001',
  '48600000-0000-4000-8000-000000000040',
  '00486 Client Settlement', 'approval', 'approval', 'selection',
  'client', 'brief', 'non_blocking', 'pending', now()
);
INSERT INTO public.client_decision_options (
  id, decision_id, name, approves, selected, sort_order
)
VALUES (
  '48600000-0000-4000-8000-000000000092',
  '48600000-0000-4000-8000-000000000089',
  'Approve settlement', true, false, 0
);

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
  id, twilio_number, phone_e164, party_id, active_project_id, state
)
VALUES
  ('48600000-0000-4000-8000-0000000000d0', '+15554860000', '+15554860001', '48600000-0000-4000-8000-000000000050', '48600000-0000-4000-8000-000000000040', 'idle'),
  ('48600000-0000-4000-8000-0000000000d1', '+15554860000', '+15554860002', '48600000-0000-4000-8000-000000000051', '48600000-0000-4000-8000-000000000041', 'idle'),
  ('48600000-0000-4000-8000-0000000000d5', '+15554860000', '+15554860003', NULL, '48600000-0000-4000-8000-000000000040', 'idle');

INSERT INTO public.sms_messages (
  id, conversation_id, direction, body, party_id, project_id,
  parsed_intent, needs_review
)
VALUES
  ('48600000-0000-4000-8000-0000000000d2', '48600000-0000-4000-8000-0000000000d0', 'inbound', 'Authorized review', '48600000-0000-4000-8000-000000000050', '48600000-0000-4000-8000-000000000040', '{"type":"mark_done","target":{"kind":"task","id":"48600000-0000-4000-8000-000000000054"}}', true),
  ('48600000-0000-4000-8000-0000000000d3', '48600000-0000-4000-8000-0000000000d1', 'inbound', 'Foreign review', '48600000-0000-4000-8000-000000000051', '48600000-0000-4000-8000-000000000041', NULL, true),
  ('48600000-0000-4000-8000-0000000000d4', '48600000-0000-4000-8000-0000000000d0', 'inbound', 'Cross-project forged tuple', '48600000-0000-4000-8000-000000000051', '48600000-0000-4000-8000-000000000040', '{"type":"mark_done","target":{"kind":"task","id":"48600000-0000-4000-8000-000000000055"}}', true),
  ('48600000-0000-4000-8000-0000000000d6', '48600000-0000-4000-8000-0000000000d5', 'inbound', 'Ambiguous phone tuple', NULL, '48600000-0000-4000-8000-000000000040', NULL, true);

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

CREATE OR REPLACE FUNCTION pg_temp.count_00486_project_trigger_lines(
  p_project_id uuid,
  p_trigger_kind text
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT count(*)
  FROM public.invoices AS invoice
  JOIN public.invoice_line_items AS line ON line.invoice_id = invoice.id
  JOIN public.project_payment_milestones AS milestone
    ON milestone.id = line.milestone_id
  WHERE invoice.project_id = p_project_id
    AND milestone.trigger_kind = p_trigger_kind
    AND milestone.invoice_id = invoice.id
    AND line.kind = 'milestone'
$$;

CREATE OR REPLACE FUNCTION pg_temp.count_00486_milestone_lines(
  p_milestone_id uuid
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT count(*)
  FROM public.invoice_line_items AS line
  JOIN public.project_payment_milestones AS milestone
    ON milestone.id = line.milestone_id
  WHERE milestone.id = p_milestone_id
    AND milestone.invoice_id = line.invoice_id
    AND line.kind = 'milestone'
$$;

GRANT EXECUTE ON FUNCTION pg_temp.capture_00486_error(text) TO
  authenticated, service_role;
GRANT EXECUTE ON FUNCTION pg_temp.count_00486_field_links() TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.count_00486_party_field_links(uuid),
  pg_temp.count_00486_coordination_revisions(uuid),
  pg_temp.count_00486_project_trigger_lines(uuid, text),
  pg_temp.count_00486_milestone_lines(uuid) TO authenticated;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_00486_actor('48600000-0000-4000-8000-000000000001');
DO $exact_invoice_line_policy_contract$
DECLARE
  affected integer;
  failure record;
BEGIN
  UPDATE public.invoice_line_items
  SET description = '00486 canonical exact-studio edit'
  WHERE id = '48600000-0000-4000-8000-000000000078';
  GET DIAGNOSTICS affected = ROW_COUNT;
  ASSERT affected = 1,
    'exact-studio designer could not edit its canonical draft line';

  SELECT * INTO failure FROM pg_temp.capture_00486_error(
    $call$UPDATE public.invoice_line_items
      SET milestone_id = NULL
      WHERE id = '48600000-0000-4000-8000-000000000078'$call$
  );
  ASSERT failure.error_state = '42501'
     AND failure.error_message =
       'invoice milestone latch: direct detach is not allowed',
    'effective authenticated current_user did not deny direct detach';
END
$exact_invoice_line_policy_contract$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_00486_actor('48600000-0000-4000-8000-000000000009');
DO $cross_studio_invoice_line_policy_contract$
DECLARE
  affected integer;
BEGIN
  UPDATE public.invoice_line_items
  SET milestone_id = NULL
  WHERE id = '48600000-0000-4000-8000-000000000078';
  GET DIAGNOSTICS affected = ROW_COUNT;
  ASSERT affected = 0,
    'Studio-B-only actor reached Studio-A milestone detach';

  DELETE FROM public.invoice_line_items
  WHERE id = '48600000-0000-4000-8000-000000000078';
  GET DIAGNOSTICS affected = ROW_COUNT;
  ASSERT affected = 0,
    'Studio-B-only actor reached Studio-A line delete';
END
$cross_studio_invoice_line_policy_contract$;
RESET ROLE;

DO $invoice_line_denial_residue_contract$
BEGIN
  ASSERT (
    SELECT milestone_id = '48600000-0000-4000-8000-000000000076'
       AND description = '00486 canonical exact-studio edit'
    FROM public.invoice_line_items
    WHERE id = '48600000-0000-4000-8000-000000000078'
  ) AND (
    SELECT invoice_id = '48600000-0000-4000-8000-000000000077'
    FROM public.project_payment_milestones
    WHERE id = '48600000-0000-4000-8000-000000000076'
  ), 'invoice-line detach/delete denials left residue';
END
$invoice_line_denial_residue_contract$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_00486_actor('48600000-0000-4000-8000-000000000001');
DO $owner_void_releases_latch_contract$
DECLARE
  voided public.invoices;
BEGIN
  voided := public.void_invoice(
    '48600000-0000-4000-8000-000000000077', '00486 real void path'
  );
  ASSERT voided.status = 'void'
     AND (
       SELECT milestone_id IS NULL AND kind = 'adhoc'
       FROM public.invoice_line_items
       WHERE id = '48600000-0000-4000-8000-000000000078'
     ) AND (
       SELECT invoice_id IS NULL AND status = 'pending'
       FROM public.project_payment_milestones
       WHERE id = '48600000-0000-4000-8000-000000000076'
     ), 'real void path did not release the latch before line detach';
END
$owner_void_releases_latch_contract$;
RESET ROLE;

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

DO $unauthenticated_malformed_activation_contract$
DECLARE
  failure record;
BEGIN
  SELECT * INTO failure FROM pg_temp.capture_00486_error(
    $call$SELECT public.activate_project_v2(
      '{"name":"Malformed unauthenticated","client_id":"not-a-uuid","studio_id":"also-not-a-uuid"}'::jsonb
    )$call$
  );
  ASSERT failure.error_state = '42501'
     AND failure.error_message = 'project creation not permitted',
    'malformed UUID input was parsed before unauthenticated identity denial';
END
$unauthenticated_malformed_activation_contract$;

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

  PERFORM set_config(
    'app.client_decision_write_id', '00486-expire-sentinel', true
  );
  SELECT array_agg(id ORDER BY id) INTO expired_ids
  FROM public.expire_due_client_decisions('2000-01-02T00:00:00Z');
  ASSERT expired_ids = ARRAY[
    '48600000-0000-4000-8000-0000000000b5'::uuid
  ] AND (
    SELECT status = 'expired'
    FROM public.client_decisions
    WHERE id = '48600000-0000-4000-8000-0000000000b5'
  ), 'active service_role could not expire the exact due legacy decision';
  ASSERT current_setting('app.client_decision_write_id', true) =
      '00486-expire-sentinel',
    'expire_due_client_decisions did not restore its prior capability';

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

  PERFORM set_config(
    'app.client_decision_write_id', '00486-stamp-legacy-sentinel', true
  );
  PERFORM set_config(
    'app.project_approval_decision_write_id',
    '00486-stamp-parent-sentinel', true
  );
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
  ASSERT current_setting('app.client_decision_write_id', true) =
      '00486-stamp-legacy-sentinel'
     AND current_setting('app.project_approval_decision_write_id', true) =
      '00486-stamp-parent-sentinel',
    'reminder stamp did not restore both prior capabilities';
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
  PERFORM set_config(
    'app.project_phase_batch_token', '00486-activate-success-sentinel', true
  );
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
  ASSERT current_setting('app.project_phase_batch_token', true) =
      '00486-activate-success-sentinel',
    'activate_project_v2 did not restore its prior capability on success';

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
  ASSERT current_setting('app.project_phase_batch_token', true) =
      '00486-activate-success-sentinel',
    'null-studio activation did not restore its prior capability';

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
  failure record;
BEGIN
  PERFORM set_config(
    'app.scope_change_transition', '00486-apply-sentinel', true
  );
  PERFORM public.apply_scope_change('48600000-0000-4000-8000-000000000060');
  ASSERT (
    SELECT applied_at IS NOT NULL
    FROM public.scope_change_requests
    WHERE id = '48600000-0000-4000-8000-000000000060'
  ), 'exact project designer could not apply an authorized scope change';
  ASSERT current_setting('app.scope_change_transition', true) =
      '00486-apply-sentinel',
    'apply_scope_change did not restore its prior capability';

  v_invoice_id := public.generate_milestone_invoice(
    '48600000-0000-4000-8000-000000000070'
  );
  ASSERT v_invoice_id IS NOT NULL
     AND (
       SELECT invoice_id = v_invoice_id
       FROM public.project_payment_milestones
       WHERE id = '48600000-0000-4000-8000-000000000070'
     ) AND (
       SELECT count(*) = 1
       FROM public.invoice_line_items
       WHERE invoice_id = v_invoice_id
         AND milestone_id = '48600000-0000-4000-8000-000000000070'
     ), 'exact project designer did not reach the real invoice core/idempotency body';

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

  SELECT * INTO failure FROM pg_temp.capture_00486_error(
    $call$SELECT public.escalate_item_feedback_to_decision(
      '48600000-0000-4000-8000-0000000000a1',
      '48600000-0000-4000-8000-0000000000b6'
    )$call$
  );
  ASSERT failure.error_state = '42501'
     AND failure.error_message = 'feedback or decision not found or access denied'
     AND (
       SELECT decision_id IS NULL
       FROM public.item_feedback
       WHERE id = '48600000-0000-4000-8000-0000000000a1'
     ), 'same-designer A/B client-project mismatch remained authoritative';

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

  PERFORM set_config(
    'app.client_decision_write_id', '00486-sms-apply-sentinel', true
  );
  v_sms := public.review_sms_message(
    '48600000-0000-4000-8000-0000000000d2', 'apply', NULL
  );
  ASSERT v_sms->>'action' = 'apply'
     AND (
       SELECT reviewed_by = '48600000-0000-4000-8000-000000000001'
          AND applied_effect IS NOT NULL
       FROM public.sms_messages
       WHERE id = '48600000-0000-4000-8000-0000000000d2'
     ) AND (
       SELECT status = 'done'
       FROM public.project_tasks
       WHERE id = '48600000-0000-4000-8000-000000000054'
     ), 'exact project/party SMS apply did not mutate the real target';
  ASSERT current_setting('app.client_decision_write_id', true) =
      '00486-sms-apply-sentinel',
    'SMS apply relay did not restore the prior decision-write capability';

  SELECT * INTO failure FROM pg_temp.capture_00486_error(
    $call$SELECT public.review_sms_message(
      '48600000-0000-4000-8000-0000000000d4', 'apply', NULL
    )$call$
  );
  ASSERT failure.error_state = '42501'
     AND failure.error_message = 'message not found or access denied'
     AND (
       SELECT status = 'todo'
       FROM public.project_tasks
       WHERE id = '48600000-0000-4000-8000-000000000055'
     ) AND (
       SELECT needs_review AND reviewed_at IS NULL AND reviewed_by IS NULL
       FROM public.sms_messages
       WHERE id = '48600000-0000-4000-8000-0000000000d4'
     ), 'cross-project SMS party/message tuple mutated a foreign task';

  SELECT * INTO failure FROM pg_temp.capture_00486_error(
    $call$SELECT public.review_sms_message(
      '48600000-0000-4000-8000-0000000000d6', 'dismiss', NULL
    )$call$
  );
  ASSERT failure.error_state = '42501'
     AND failure.error_message = 'message not found or access denied'
     AND (
       SELECT needs_review AND reviewed_at IS NULL AND reviewed_by IS NULL
       FROM public.sms_messages
       WHERE id = '48600000-0000-4000-8000-0000000000d6'
     ),
    'ambiguous SMS phone resolved to an arbitrary party';
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

  INSERT INTO public.scope_change_requests (
    id, project_id, requested_by, request_origin, title, description, status
  ) VALUES (
    '48600000-0000-4000-8000-000000000067',
    '48600000-0000-4000-8000-000000000040',
    '48600000-0000-4000-8000-000000000001',
    'designer_amendment', '00486 authorized direct insert',
    'browser-equivalent exact project studio draft', 'draft'
  );
  ASSERT (
    SELECT requested_by = auth.uid()
       AND project_id = '48600000-0000-4000-8000-000000000040'
       AND status = 'draft'
    FROM public.scope_change_requests
    WHERE id = '48600000-0000-4000-8000-000000000067'
  ), 'authorized browser-equivalent direct scope draft insert failed';

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

  SELECT * INTO failure FROM pg_temp.capture_00486_error(
    $call$INSERT INTO public.scope_change_requests (
      id, project_id, requested_by, request_origin, title, description, status
    ) VALUES (
      '48600000-0000-4000-8000-000000000068',
      '48600000-0000-4000-8000-000000000041',
      '48600000-0000-4000-8000-000000000001',
      'designer_amendment', '00486 hostile direct insert',
      'shared other studio only', 'draft'
    )$call$
  );
  ASSERT failure.error_state = '42501'
     AND NOT EXISTS (
       SELECT 1 FROM public.scope_change_requests
       WHERE id = '48600000-0000-4000-8000-000000000068'
     ), 'direct scope insert crossed the canonical project studio';

  SELECT * INTO failure FROM pg_temp.capture_00486_error(
    $call$SELECT public.send_scope_change_request(
      '48600000-0000-4000-8000-000000000063',
      '48600000-0000-4000-8000-000000000041'
    )$call$
  );
  ASSERT failure.error_state = '42501'
     AND (
       SELECT status = 'draft'
       FROM public.scope_change_requests
       WHERE id = '48600000-0000-4000-8000-000000000063'
     ), 'scope send crossed the canonical project studio';

  SELECT * INTO failure FROM pg_temp.capture_00486_error(
    $call$SELECT public.accept_client_scope_change_request(
      '48600000-0000-4000-8000-000000000065',
      '48600000-0000-4000-8000-000000000041'
    )$call$
  );
  ASSERT failure.error_state = '42501'
     AND (
       SELECT status = 'sent'
       FROM public.scope_change_requests
       WHERE id = '48600000-0000-4000-8000-000000000065'
     ), 'client-request accept crossed the canonical project studio';
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

DO $exact_project_b_scope_and_invoice_contract$
DECLARE
  failure record;
BEGIN
  PERFORM set_config(
    'app.scope_change_transition', '00486-send-sentinel', true
  );
  PERFORM public.send_scope_change_request(
    '48600000-0000-4000-8000-000000000062',
    '48600000-0000-4000-8000-000000000041'
  );
  ASSERT current_setting('app.scope_change_transition', true) =
      '00486-send-sentinel'
     AND (
       SELECT status = 'sent'
       FROM public.scope_change_requests
       WHERE id = '48600000-0000-4000-8000-000000000062'
     ), 'scope send did not preserve exact-project behavior and prior capability';

  PERFORM set_config(
    'app.scope_change_transition', '00486-accept-sentinel', true
  );
  PERFORM public.accept_client_scope_change_request(
    '48600000-0000-4000-8000-000000000065',
    '48600000-0000-4000-8000-000000000041'
  );
  ASSERT current_setting('app.scope_change_transition', true) =
      '00486-accept-sentinel'
     AND (
       SELECT status = 'approved'
       FROM public.scope_change_requests
       WHERE id = '48600000-0000-4000-8000-000000000065'
     ), 'client-request accept did not restore its prior capability';

  PERFORM set_config(
    'app.scope_change_transition', '00486-cancel-sentinel', true
  );
  PERFORM public.cancel_scope_change_request(
    '48600000-0000-4000-8000-00000000006a',
    '48600000-0000-4000-8000-000000000041'
  );
  ASSERT current_setting('app.scope_change_transition', true) =
      '00486-cancel-sentinel'
     AND (
       SELECT status = 'cancelled'
       FROM public.scope_change_requests
       WHERE id = '48600000-0000-4000-8000-00000000006a'
     ), 'scope cancellation did not restore its prior capability';

  SELECT * INTO failure FROM pg_temp.capture_00486_error(
    $call$SELECT public.apply_scope_change(
      '48600000-0000-4000-8000-000000000066'
    )$call$
  );
  ASSERT failure.error_state = '23514'
     AND (
       SELECT applied_at IS NULL
       FROM public.scope_change_requests
       WHERE id = '48600000-0000-4000-8000-000000000066'
     ), 'hostile cross-studio preexisting requester reached scope apply';

  ASSERT (
    SELECT count(*) = 2
       AND bool_and(invoice.studio_id =
         '48600000-0000-4000-8000-000000000010')
       AND bool_and(invoice.studio_id IS DISTINCT FROM project.studio_id)
    FROM public.invoices AS invoice
    JOIN public.projects AS project ON project.id = invoice.project_id
    WHERE invoice.id IN (
      '48600000-0000-4000-8000-000000000073',
      '48600000-0000-4000-8000-000000000074'
    )
  ), 'hostile invoice fixtures did not retain a cross-studio snapshot';

  SELECT * INTO failure FROM pg_temp.capture_00486_error(
    $call$SELECT public.generate_milestone_invoice(
      '48600000-0000-4000-8000-000000000071'
    )$call$
  );
  ASSERT failure.error_state = '23514'
     AND (
       SELECT invoice_id = '48600000-0000-4000-8000-000000000073'
       FROM public.project_payment_milestones
       WHERE id = '48600000-0000-4000-8000-000000000071'
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.invoice_line_items
       WHERE milestone_id = '48600000-0000-4000-8000-000000000071'
     ), 'hostile pre-latched invoice crossed the exact project studio';

  SELECT * INTO failure FROM pg_temp.capture_00486_error(
    $call$INSERT INTO public.invoice_line_items (
      id, invoice_id, kind, milestone_id, description,
      quantity, unit_amount_cents, amount_cents, metadata, sort_order
    ) VALUES (
      '48600000-0000-4000-8000-000000000075',
      '48600000-0000-4000-8000-000000000074', 'milestone',
      '48600000-0000-4000-8000-000000000072',
      '00486 hostile direct latch', 1, 1000, 1000, '{}'::jsonb, 0
    )$call$
  );
  ASSERT failure.error_state = '23514'
     AND NOT EXISTS (
       SELECT 1 FROM public.invoice_line_items
       WHERE id = '48600000-0000-4000-8000-000000000075'
     ), 'direct milestone latch accepted a cross-studio invoice designer';
END
$exact_project_b_scope_and_invoice_contract$;

SELECT pg_temp.assume_00486_actor('48600000-0000-4000-8000-000000000004');
DO $exact_project_b_client_scope_contract$
DECLARE failure record;
BEGIN
  SELECT * INTO failure FROM pg_temp.capture_00486_error(
    $call$SELECT public.approve_scope_change_request(
      '48600000-0000-4000-8000-000000000064',
      '48600000-0000-4000-8000-000000000041', '00486 Client B', NULL
    )$call$
  );
  ASSERT failure.error_state = '23514'
     AND (
       SELECT status = 'sent'
       FROM public.scope_change_requests
       WHERE id = '48600000-0000-4000-8000-000000000064'
     ), 'client approval accepted a cross-studio request author';

  PERFORM set_config(
    'app.scope_change_transition', '00486-approve-sentinel', true
  );
  PERFORM public.approve_scope_change_request(
    '48600000-0000-4000-8000-000000000062',
    '48600000-0000-4000-8000-000000000041', '00486 Client B', NULL
  );
  ASSERT current_setting('app.scope_change_transition', true) =
      '00486-approve-sentinel'
     AND (
       SELECT status = 'approved'
       FROM public.scope_change_requests
       WHERE id = '48600000-0000-4000-8000-000000000062'
     ), 'scope approval did not restore its prior capability';

  PERFORM set_config(
    'app.scope_change_transition', '00486-decline-sentinel', true
  );
  PERFORM public.decline_scope_change_request(
    '48600000-0000-4000-8000-000000000069',
    '48600000-0000-4000-8000-000000000041', 'No'
  );
  ASSERT current_setting('app.scope_change_transition', true) =
      '00486-decline-sentinel'
     AND (
       SELECT status = 'declined'
       FROM public.scope_change_requests
       WHERE id = '48600000-0000-4000-8000-000000000069'
     ), 'scope decline did not restore its prior capability';
END
$exact_project_b_client_scope_contract$;

SELECT pg_temp.assume_00486_actor('48600000-0000-4000-8000-000000000003');
DO $authorized_client_contract$
DECLARE
  v_receipt jsonb;
  v_decision public.client_decisions;
  v_project_id uuid;
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

  PERFORM set_config(
    'app.proposal_feedback_id', '00486-request-change-sentinel', true
  );
  PERFORM public.request_proposal_change(
    '48600000-0000-4000-8000-000000000082', 'Please revise'
  );
  ASSERT (
    SELECT client_feedback = 'Please revise'
    FROM public.proposals
    WHERE id = '48600000-0000-4000-8000-000000000082'
  ), 'exact proposal client could not request a change';
  ASSERT current_setting('app.proposal_feedback_id', true) =
      '00486-request-change-sentinel',
    'request_proposal_change did not restore its prior capability';

  v_event := public.reply_to_item_feedback(
    '48600000-0000-4000-8000-0000000000a0', 'Client follow-up'
  );
  ASSERT v_event.actor = '48600000-0000-4000-8000-000000000003'
     AND v_event.body = 'Client follow-up',
    'exact feedback client could not reply';

  v_receipt := public.sign_proposal(
    '48600000-0000-4000-8000-000000000086', '00486 Client A'
  );
  v_project_id := (v_receipt->>'project_id')::uuid;
  ASSERT v_receipt->>'status' = 'accepted'
     AND v_project_id IS NOT NULL
     AND pg_temp.count_00486_project_trigger_lines(
       v_project_id, 'on_signing'
     ) = 1,
    'real sign_proposal path did not draft and latch its kickoff deposit';

  v_decision := public.apply_client_decision(
    '48600000-0000-4000-8000-000000000089',
    '48600000-0000-4000-8000-000000000092',
    'click_through', NULL, 'Approved in 00486', 1
  );
  ASSERT v_decision.status = 'responded'
     AND pg_temp.count_00486_milestone_lines(
       '48600000-0000-4000-8000-000000000088'
     ) = 1,
    'real client-decision settlement did not draft and latch its invoice';
END
$authorized_client_contract$;

SELECT pg_temp.assume_00486_actor('48600000-0000-4000-8000-000000000001');
DO $offline_signature_contract$
DECLARE v_project_id uuid;
BEGIN
  PERFORM set_config(
    'app.client_decision_insert_id', '00486-offline-decision-sentinel', true
  );
  PERFORM set_config(
    'app.proposal_accept_id', '00486-offline-accept-sentinel', true
  );
  PERFORM set_config(
    'app.proposal_signature_engagement_id',
    '00486-offline-engagement-sentinel', true
  );
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
  ASSERT current_setting('app.client_decision_insert_id', true) =
      '00486-offline-decision-sentinel'
     AND current_setting('app.proposal_accept_id', true) =
      '00486-offline-accept-sentinel'
     AND current_setting('app.proposal_signature_engagement_id', true) =
      '00486-offline-engagement-sentinel',
    'record_offline_signature did not restore all prior capabilities';
END
$offline_signature_contract$;

DO $reassign_capability_restore_contract$
DECLARE v_project public.projects;
BEGIN
  PERFORM set_config(
    'app.project_reassignment_id', '00486-reassign-sentinel', true
  );
  PERFORM set_config(
    'app.client_decision_write_id', '00486-reassign-decision-sentinel', true
  );
  v_project := public.reassign_project_lead(
    '48600000-0000-4000-8000-000000000044',
    '48600000-0000-4000-8000-000000000001',
    '48600000-0000-4000-8000-000000000005'
  );
  ASSERT v_project.designer_id = '48600000-0000-4000-8000-000000000005'
     AND current_setting('app.project_reassignment_id', true) =
      '00486-reassign-sentinel'
     AND current_setting('app.client_decision_write_id', true) =
      '00486-reassign-decision-sentinel',
    'reassign_project_lead did not restore both prior capabilities';
END
$reassign_capability_restore_contract$;

DO $close_project_contract$
DECLARE v_closed public.projects;
BEGIN
  PERFORM set_config(
    'app.project_completion_id', '00486-close-sentinel', true
  );
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
  ASSERT v_closed.status = 'completed'
     AND current_setting('app.project_completion_id', true) =
      '00486-close-sentinel',
    'close_project did not preserve success behavior and prior capability';
END
$close_project_contract$;

DO $completed_project_scope_insert_contract$
DECLARE
  failure record;
BEGIN
  SELECT * INTO failure FROM pg_temp.capture_00486_error(
    $call$INSERT INTO public.scope_change_requests (
      id, project_id, requested_by, request_origin, title, description, status
    ) VALUES (
      '48600000-0000-4000-8000-00000000006b',
      '48600000-0000-4000-8000-000000000042',
      '48600000-0000-4000-8000-000000000001',
      'designer_amendment', '00486 completed project draft',
      'must not persist', 'draft'
    )$call$
  );
  ASSERT failure.error_state = '23514'
     AND failure.error_message =
       'scope_change_request_direct_insert_requires_open_project'
     AND NOT EXISTS (
       SELECT 1 FROM public.scope_change_requests
       WHERE id = '48600000-0000-4000-8000-00000000006b'
     ), 'completed project accepted a direct scope-change draft';
END
$completed_project_scope_insert_contract$;
RESET ROLE;

DO $scope_membership_revocation_race$
DECLARE
  v_conninfo text := format(
    'hostaddr=%s port=%s dbname=postgres user=postgres password=postgres',
    inet_server_addr(), inet_server_port()
  );
  v_revoker_pid integer;
  v_waiting boolean := false;
  v_attempt integer;
  v_status text;
  v_error text;
BEGIN
  PERFORM extensions.dblink_connect('scope486_setup', v_conninfo);
  PERFORM extensions.dblink_exec(
    'scope486_setup', 'SET session_replication_role = replica'
  );
  PERFORM extensions.dblink_exec(
    'scope486_setup',
    $cleanup$
      DELETE FROM public.scope_change_requests
      WHERE id IN (
        '48690000-0000-4000-8000-000000000060',
        '48690000-0000-4000-8000-000000000061'
      );
      DELETE FROM public.projects
      WHERE id = '48690000-0000-4000-8000-000000000040';
      DELETE FROM public.organization_members
      WHERE id IN (
        '48690000-0000-4000-8000-000000000020',
        '48690000-0000-4000-8000-000000000021'
      );
      DELETE FROM public.organizations
      WHERE id = '48690000-0000-4000-8000-000000000010';
    $cleanup$
  );
  PERFORM extensions.dblink_exec(
    'scope486_setup',
    $setup$
      INSERT INTO public.organizations (id, type, name, slug, status)
      VALUES (
        '48690000-0000-4000-8000-000000000010', 'design_studio',
        '00486 Scope Race Studio', 'sd486-scope-race', 'active'
      );
      INSERT INTO public.organization_members (
        id, user_id, organization_id, role, status, joined_at
      ) VALUES
        (
          '48690000-0000-4000-8000-000000000020',
          '48690000-0000-4000-8000-000000000001',
          '48690000-0000-4000-8000-000000000010',
          'owner', 'active', now()
        ),
        (
          '48690000-0000-4000-8000-000000000021',
          '48690000-0000-4000-8000-000000000002',
          '48690000-0000-4000-8000-000000000010',
          'member', 'active', now()
        );
      INSERT INTO public.projects (
        id, name, designer_id, client_id, studio_id, created_by, status,
        total_amount_cents, budget_cents, design_fee_cents, target_end_date
      ) VALUES (
        '48690000-0000-4000-8000-000000000040',
        '00486 Scope Membership Race',
        '48690000-0000-4000-8000-000000000001', NULL,
        '48690000-0000-4000-8000-000000000010',
        '48690000-0000-4000-8000-000000000001', 'active',
        0, 0, 0, current_date + 30
      );
      INSERT INTO public.scope_change_requests (
        id, project_id, requested_by, request_origin,
        title, description, status
      ) VALUES
        (
          '48690000-0000-4000-8000-000000000060',
          '48690000-0000-4000-8000-000000000040',
          '48690000-0000-4000-8000-000000000002',
          'designer_amendment', '00486 race send', 'first draft', 'draft'
        ),
        (
          '48690000-0000-4000-8000-000000000061',
          '48690000-0000-4000-8000-000000000040',
          '48690000-0000-4000-8000-000000000002',
          'designer_amendment', '00486 post-revocation send',
          'second draft', 'draft'
        );
    $setup$
  );
  PERFORM extensions.dblink_exec(
    'scope486_setup', 'SET session_replication_role = origin'
  );

  PERFORM extensions.dblink_connect('scope486_sender', v_conninfo);
  PERFORM extensions.dblink_connect('scope486_revoker', v_conninfo);
  PERFORM extensions.dblink_exec(
    'scope486_sender',
    $session$
      BEGIN;
      SET LOCAL ROLE authenticated;
      SET LOCAL request.jwt.claims =
        '{"sub":"48690000-0000-4000-8000-000000000002","role":"authenticated"}';
      SET LOCAL request.jwt.claim.sub =
        '48690000-0000-4000-8000-000000000002';
    $session$
  );
  PERFORM sent.receipt
  FROM extensions.dblink(
    'scope486_sender',
    $send$SELECT public.send_scope_change_request(
      '48690000-0000-4000-8000-000000000060',
      '48690000-0000-4000-8000-000000000040'
    )::text$send$
  ) AS sent(receipt text);

  SELECT remote.pid INTO v_revoker_pid
  FROM extensions.dblink(
    'scope486_revoker', 'SELECT pg_backend_pid()'
  ) AS remote(pid integer);
  PERFORM extensions.dblink_send_query(
    'scope486_revoker',
    $revoke$UPDATE public.organization_members
      SET status = 'suspended'
      WHERE id = '48690000-0000-4000-8000-000000000021'$revoke$
  );
  FOR v_attempt IN 1..40 LOOP
    SELECT activity.wait_event_type = 'Lock'
    INTO v_waiting
    FROM pg_stat_activity AS activity
    WHERE activity.pid = v_revoker_pid;
    EXIT WHEN COALESCE(v_waiting, false);
    PERFORM pg_sleep(0.025);
  END LOOP;
  ASSERT COALESCE(v_waiting, false)
     AND extensions.dblink_is_busy('scope486_revoker') = 1,
    'membership revoker did not wait behind scope-change authority locks';

  PERFORM extensions.dblink_exec('scope486_sender', 'COMMIT');
  SELECT result.status INTO v_status
  FROM extensions.dblink_get_result('scope486_revoker', false)
    AS result(status text);
  ASSERT v_status = 'UPDATE 1',
    format('membership revocation did not complete after sender commit: %L', v_status);

  PERFORM extensions.dblink_exec(
    'scope486_sender',
    $session$
      BEGIN;
      SET LOCAL ROLE authenticated;
      SET LOCAL request.jwt.claims =
        '{"sub":"48690000-0000-4000-8000-000000000002","role":"authenticated"}';
      SET LOCAL request.jwt.claim.sub =
        '48690000-0000-4000-8000-000000000002';
    $session$
  );
  PERFORM extensions.dblink_send_query(
    'scope486_sender',
    $send$SELECT public.send_scope_change_request(
      '48690000-0000-4000-8000-000000000061',
      '48690000-0000-4000-8000-000000000040'
    )::text$send$
  );
  PERFORM denied.receipt
  FROM extensions.dblink_get_result('scope486_sender', false)
    AS denied(receipt text);
  v_error := extensions.dblink_error_message('scope486_sender');
  ASSERT position(
    'send_scope_change_request: project not found or access denied' IN v_error
  ) > 0, format('next call after membership revocation was not denied: %L', v_error);
  PERFORM extensions.dblink_exec('scope486_sender', 'ROLLBACK');

  ASSERT (
    SELECT status = 'sent'
    FROM public.scope_change_requests
    WHERE id = '48690000-0000-4000-8000-000000000060'
  ) AND (
    SELECT status = 'draft'
    FROM public.scope_change_requests
    WHERE id = '48690000-0000-4000-8000-000000000061'
  ) AND (
    SELECT status = 'suspended'
    FROM public.organization_members
    WHERE id = '48690000-0000-4000-8000-000000000021'
  ), 'scope-change revocation race left an invalid committed state';

  PERFORM extensions.dblink_disconnect('scope486_revoker');
  PERFORM extensions.dblink_disconnect('scope486_sender');
  PERFORM extensions.dblink_exec(
    'scope486_setup', 'SET session_replication_role = replica'
  );
  PERFORM extensions.dblink_exec('scope486_setup', $cleanup$
    DELETE FROM public.scope_change_requests
    WHERE id IN (
      '48690000-0000-4000-8000-000000000060',
      '48690000-0000-4000-8000-000000000061'
    );
    DELETE FROM public.projects
    WHERE id = '48690000-0000-4000-8000-000000000040';
    DELETE FROM public.organization_members
    WHERE id IN (
      '48690000-0000-4000-8000-000000000020',
      '48690000-0000-4000-8000-000000000021'
    );
    DELETE FROM public.organizations
    WHERE id = '48690000-0000-4000-8000-000000000010';
  $cleanup$);
  PERFORM extensions.dblink_exec(
    'scope486_setup', 'SET session_replication_role = origin'
  );
  PERFORM extensions.dblink_disconnect('scope486_setup');
END
$scope_membership_revocation_race$;

DO $invoice_lock_order_contract$
DECLARE
  v_conninfo text := format(
    'hostaddr=%s port=%s dbname=postgres user=postgres password=postgres',
    inet_server_addr(), inet_server_port()
  );
  v_generate_pid integer;
  v_waiting boolean := false;
  v_attempt integer;
  v_invoice_id uuid;
  v_detach_error text;
  v_void_status text;
  v_consistent boolean;
BEGIN
  PERFORM extensions.dblink_connect('invoice486_setup', v_conninfo);
  PERFORM extensions.dblink_exec(
    'invoice486_setup', 'SET session_replication_role = replica'
  );
  PERFORM extensions.dblink_exec('invoice486_setup', $cleanup$
    DELETE FROM public.invoice_line_items
    WHERE invoice_id IN (
      SELECT id FROM public.invoices
      WHERE project_id = '48680000-0000-4000-8000-000000000040'
    );
    DELETE FROM public.invoices
    WHERE project_id = '48680000-0000-4000-8000-000000000040';
    DELETE FROM public.project_payment_milestones
    WHERE project_id = '48680000-0000-4000-8000-000000000040';
    DELETE FROM public.projects
    WHERE id = '48680000-0000-4000-8000-000000000040';
    DELETE FROM public.user_roles
    WHERE user_id = '48680000-0000-4000-8000-000000000001';
    DELETE FROM public.organization_members
    WHERE id = '48680000-0000-4000-8000-000000000020';
    DELETE FROM public.organizations
    WHERE id = '48680000-0000-4000-8000-000000000010';
  $cleanup$);
  PERFORM extensions.dblink_exec('invoice486_setup', $setup$
    INSERT INTO public.organizations (id, type, name, slug, status)
    VALUES (
      '48680000-0000-4000-8000-000000000010', 'design_studio',
      '00486 Invoice Lock Studio', 'sd486-invoice-lock', 'active'
    );
    INSERT INTO public.organization_members (
      id, user_id, organization_id, role, status, joined_at
    ) VALUES (
      '48680000-0000-4000-8000-000000000020',
      '48680000-0000-4000-8000-000000000001',
      '48680000-0000-4000-8000-000000000010',
      'owner', 'active', now()
    );
    INSERT INTO public.user_roles (user_id, role_id)
    SELECT '48680000-0000-4000-8000-000000000001', role_row.id
    FROM public.roles AS role_row
    WHERE role_row.name = 'independent_designer';
    INSERT INTO public.projects (
      id, name, designer_id, client_id, studio_id, created_by, status,
      total_amount_cents, budget_cents, design_fee_cents, target_end_date
    ) VALUES (
      '48680000-0000-4000-8000-000000000040',
      '00486 Invoice Lock Project',
      '48680000-0000-4000-8000-000000000001', NULL,
      '48680000-0000-4000-8000-000000000010',
      '48680000-0000-4000-8000-000000000001', 'active',
      0, 0, 0, current_date + 30
    );
    INSERT INTO public.project_payment_milestones (
      id, project_id, label, percentage, amount_cents, status, sort_order
    ) VALUES (
      '48680000-0000-4000-8000-000000000070',
      '48680000-0000-4000-8000-000000000040',
      '00486 Lock-Order Milestone', 0, 1400, 'pending', 0
    );
  $setup$);
  PERFORM extensions.dblink_exec(
    'invoice486_setup', 'SET session_replication_role = origin'
  );

  PERFORM extensions.dblink_connect('invoice486_close', v_conninfo);
  PERFORM extensions.dblink_connect('invoice486_generate', v_conninfo);
  PERFORM extensions.dblink_exec('invoice486_close', $session$
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims =
      '{"sub":"48680000-0000-4000-8000-000000000001","role":"authenticated"}';
    SET LOCAL request.jwt.claim.sub =
      '48680000-0000-4000-8000-000000000001';
    SET LOCAL lock_timeout = '5s';
    DO $remote$
    BEGIN
      PERFORM 1 FROM public.projects
      WHERE id = '48680000-0000-4000-8000-000000000040'
      FOR UPDATE;
    END
    $remote$;
  $session$);
  PERFORM extensions.dblink_exec('invoice486_generate', $session$
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims =
      '{"sub":"48680000-0000-4000-8000-000000000001","role":"authenticated"}';
    SET LOCAL request.jwt.claim.sub =
      '48680000-0000-4000-8000-000000000001';
    SET LOCAL lock_timeout = '5s';
  $session$);
  SELECT remote.pid INTO v_generate_pid
  FROM extensions.dblink(
    'invoice486_generate', 'SELECT pg_backend_pid()'
  ) AS remote(pid integer);
  PERFORM extensions.dblink_send_query(
    'invoice486_generate',
    $generate$SELECT public.generate_milestone_invoice(
      '48680000-0000-4000-8000-000000000070'
    )$generate$
  );
  FOR v_attempt IN 1..40 LOOP
    SELECT activity.wait_event_type = 'Lock'
    INTO v_waiting
    FROM pg_stat_activity AS activity
    WHERE activity.pid = v_generate_pid;
    EXIT WHEN COALESCE(v_waiting, false);
    PERFORM pg_sleep(0.025);
  END LOOP;
  ASSERT COALESCE(v_waiting, false)
     AND extensions.dblink_is_busy('invoice486_generate') = 1,
    'milestone generator did not wait first on the project lock';

  PERFORM extensions.dblink_exec('invoice486_close', $close$
    DO $remote$
    BEGIN
      BEGIN
        PERFORM public.close_project(
          '48680000-0000-4000-8000-000000000040',
          '[{"key":"walkthrough","completed":true},{"key":"punch_list","completed":true},{"key":"payment","completed":true},{"key":"photography","completed":true},{"key":"photos","completed":true},{"key":"case_study","completed":true}]'::jsonb,
          '{}'::jsonb
        );
        RAISE EXCEPTION 'close unexpectedly succeeded';
      EXCEPTION WHEN check_violation THEN
        IF position('positive payment milestone' IN SQLERRM) = 0 THEN
          RAISE;
        END IF;
      END;
    END
    $remote$;
    COMMIT;
  $close$);
  SELECT generated.invoice_id INTO v_invoice_id
  FROM extensions.dblink_get_result('invoice486_generate', false)
    AS generated(invoice_id uuid);
  ASSERT v_invoice_id IS NOT NULL,
    format(
      'close/generate ordering did not complete the generator: %L',
      extensions.dblink_error_message('invoice486_generate')
    );
  PERFORM extensions.dblink_exec('invoice486_generate', 'COMMIT');
  PERFORM extensions.dblink_disconnect('invoice486_generate');
  PERFORM extensions.dblink_disconnect('invoice486_close');

  PERFORM extensions.dblink_connect('invoice486_void', v_conninfo);
  PERFORM extensions.dblink_connect('invoice486_detach', v_conninfo);
  PERFORM extensions.dblink_exec(
    'invoice486_void',
    format($session$
      BEGIN;
      SET LOCAL ROLE authenticated;
      SET LOCAL request.jwt.claims =
        '{"sub":"48680000-0000-4000-8000-000000000001","role":"authenticated"}';
      SET LOCAL request.jwt.claim.sub =
        '48680000-0000-4000-8000-000000000001';
      SET LOCAL lock_timeout = '5s';
      DO $remote$
      BEGIN
        PERFORM 1 FROM public.invoices WHERE id = %L::uuid FOR UPDATE;
      END
      $remote$;
    $session$, v_invoice_id)
  );
  PERFORM extensions.dblink_exec('invoice486_detach', $session$
    BEGIN;
    SET LOCAL ROLE service_role;
    SET LOCAL lock_timeout = '5s';
  $session$);
  PERFORM extensions.dblink_send_query(
    'invoice486_detach',
    format(
      'UPDATE public.invoice_line_items SET milestone_id = NULL WHERE invoice_id = %L::uuid RETURNING id',
      v_invoice_id
    )
  );
  FOR v_attempt IN 1..40 LOOP
    EXIT WHEN extensions.dblink_is_busy('invoice486_detach') = 0;
    PERFORM pg_sleep(0.025);
  END LOOP;
  ASSERT extensions.dblink_is_busy('invoice486_detach') = 0,
    'line detach waited on the invoice parent from an AFTER trigger';
  PERFORM denied.id
  FROM extensions.dblink_get_result('invoice486_detach', false)
    AS denied(id uuid);
  v_detach_error := extensions.dblink_error_message('invoice486_detach');
  ASSERT position(
    'cannot detach milestone' IN v_detach_error
  ) > 0, format('draft detach returned the wrong fixed denial: %L', v_detach_error);
  PERFORM extensions.dblink_exec('invoice486_detach', 'ROLLBACK');

  SELECT voided.status INTO v_void_status
  FROM extensions.dblink(
    'invoice486_void',
    format(
      'SELECT (public.void_invoice(%L::uuid, %L)).status::text',
      v_invoice_id, '00486 dblink void'
    )
  ) AS voided(status text);
  ASSERT v_void_status = 'void',
    'real void path failed after a concurrent rejected detach';
  PERFORM extensions.dblink_exec('invoice486_void', 'COMMIT');
  PERFORM extensions.dblink_disconnect('invoice486_detach');
  PERFORM extensions.dblink_disconnect('invoice486_void');

  SELECT checked.consistent INTO v_consistent
  FROM extensions.dblink(
    'invoice486_setup',
    format($check$
      SELECT
        (SELECT status = 'void' FROM public.invoices WHERE id = %L::uuid)
        AND (SELECT milestone_id IS NULL AND kind = 'adhoc'
             FROM public.invoice_line_items WHERE invoice_id = %L::uuid)
        AND (SELECT invoice_id IS NULL AND status = 'pending'
             FROM public.project_payment_milestones
             WHERE id = '48680000-0000-4000-8000-000000000070')
    $check$, v_invoice_id, v_invoice_id)
  ) AS checked(consistent boolean);
  ASSERT v_consistent,
    'void/detach lock-order probe left an inconsistent latch graph';

  PERFORM extensions.dblink_exec(
    'invoice486_setup', 'SET session_replication_role = replica'
  );
  PERFORM extensions.dblink_exec('invoice486_setup', $cleanup$
    DELETE FROM public.invoice_line_items
    WHERE invoice_id IN (
      SELECT id FROM public.invoices
      WHERE project_id = '48680000-0000-4000-8000-000000000040'
    );
    DELETE FROM public.invoices
    WHERE project_id = '48680000-0000-4000-8000-000000000040';
    DELETE FROM public.project_payment_milestones
    WHERE project_id = '48680000-0000-4000-8000-000000000040';
    DELETE FROM public.projects
    WHERE id = '48680000-0000-4000-8000-000000000040';
    DELETE FROM public.user_roles
    WHERE user_id = '48680000-0000-4000-8000-000000000001';
    DELETE FROM public.organization_members
    WHERE id = '48680000-0000-4000-8000-000000000020';
    DELETE FROM public.organizations
    WHERE id = '48680000-0000-4000-8000-000000000010';
  $cleanup$);
  PERFORM extensions.dblink_exec(
    'invoice486_setup', 'SET session_replication_role = origin'
  );
  PERFORM extensions.dblink_disconnect('invoice486_setup');
END
$invoice_lock_order_contract$;

DO $decision_production_scope_close_races$
DECLARE
  v_conninfo text := format(
    'hostaddr=%s port=%s dbname=postgres user=postgres password=postgres',
    inet_server_addr(), inet_server_port()
  );
  v_worker_pid integer;
  v_waiting boolean;
  v_attempt integer;
  v_status text;
  v_error text;
  v_consistent boolean;
BEGIN
  PERFORM extensions.dblink_connect('order486_setup', v_conninfo);
  PERFORM extensions.dblink_exec(
    'order486_setup', 'SET session_replication_role = replica'
  );
  PERFORM extensions.dblink_exec('order486_setup', $cleanup$
    DELETE FROM public.notification_log
    WHERE metadata->>'project_id' LIKE '48660000-0000-4000-8000-%';
    DELETE FROM public.decision_notifications
    WHERE decision_id = '48660000-0000-4000-8000-000000000080';
    DELETE FROM public.decision_events
    WHERE decision_id = '48660000-0000-4000-8000-000000000080';
    DELETE FROM public.invoice_line_items
    WHERE invoice_id IN (
      SELECT id FROM public.invoices
      WHERE project_id::text LIKE '48660000-0000-4000-8000-%'
    );
    DELETE FROM public.invoices
    WHERE project_id::text LIKE '48660000-0000-4000-8000-%';
    DELETE FROM public.client_decision_options
    WHERE decision_id = '48660000-0000-4000-8000-000000000080';
    DELETE FROM public.client_decisions
    WHERE id = '48660000-0000-4000-8000-000000000080';
    DELETE FROM public.scope_change_requests
    WHERE project_id = '48660000-0000-4000-8000-000000000043';
    DELETE FROM public.project_payment_milestones
    WHERE project_id::text LIKE '48660000-0000-4000-8000-%';
    DELETE FROM public.project_ffe_items
    WHERE project_id = '48660000-0000-4000-8000-000000000042';
    DELETE FROM public.project_ffe_selection_threads
    WHERE project_id = '48660000-0000-4000-8000-000000000042';
    DELETE FROM public.purchase_orders
    WHERE project_id = '48660000-0000-4000-8000-000000000042';
    DELETE FROM public.projects
    WHERE id IN (
      '48660000-0000-4000-8000-000000000041',
      '48660000-0000-4000-8000-000000000042',
      '48660000-0000-4000-8000-000000000043'
    );
    DELETE FROM public.designer_clients
    WHERE id = '48660000-0000-4000-8000-000000000030';
    DELETE FROM public.user_roles
    WHERE user_id = '48660000-0000-4000-8000-000000000001';
    DELETE FROM public.organization_members
    WHERE id = '48660000-0000-4000-8000-000000000020';
    DELETE FROM public.organizations
    WHERE id = '48660000-0000-4000-8000-000000000010';
    DELETE FROM public.vendors
    WHERE id = '48660000-0000-4000-8000-000000000050';
    DELETE FROM public.profiles
    WHERE id IN (
      '48660000-0000-4000-8000-000000000001',
      '48660000-0000-4000-8000-000000000003'
    );
    DELETE FROM auth.users
    WHERE id IN (
      '48660000-0000-4000-8000-000000000001',
      '48660000-0000-4000-8000-000000000003'
    );
  $cleanup$);
  PERFORM extensions.dblink_exec('order486_setup', $setup$
    INSERT INTO auth.users (
      id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
      instance_id, aud, role
    ) VALUES
      (
        '48660000-0000-4000-8000-000000000001',
        'sd486-order-designer@test.invalid', '', now(), now(), now(),
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated'
      ),
      (
        '48660000-0000-4000-8000-000000000003',
        'sd486-order-client@test.invalid', '', now(), now(), now(),
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated'
      );
    INSERT INTO public.profiles (
      id, email, full_name, is_designer, created_at, updated_at
    ) VALUES
      (
        '48660000-0000-4000-8000-000000000001',
        'sd486-order-designer@test.invalid', '00486 Order Designer',
        true, now(), now()
      ),
      (
        '48660000-0000-4000-8000-000000000003',
        'sd486-order-client@test.invalid', '00486 Order Client',
        false, now(), now()
      );
    INSERT INTO public.organizations (id, type, name, slug, status)
    VALUES (
      '48660000-0000-4000-8000-000000000010', 'design_studio',
      '00486 Order Studio', 'sd486-order-studio', 'active'
    );
    INSERT INTO public.organization_members (
      id, user_id, organization_id, role, status, joined_at
    ) VALUES (
      '48660000-0000-4000-8000-000000000020',
      '48660000-0000-4000-8000-000000000001',
      '48660000-0000-4000-8000-000000000010',
      'owner', 'active', now()
    );
    INSERT INTO public.user_roles (user_id, role_id)
    SELECT '48660000-0000-4000-8000-000000000001', role_row.id
    FROM public.roles AS role_row
    WHERE role_row.name = 'independent_designer';
    INSERT INTO public.designer_clients (
      id, designer_id, client_id, client_name, status, source
    ) VALUES (
      '48660000-0000-4000-8000-000000000030',
      '48660000-0000-4000-8000-000000000001',
      '48660000-0000-4000-8000-000000000003',
      '00486 Order Client', 'active', 'direct'
    );
    INSERT INTO public.projects (
      id, name, designer_id, client_id, studio_id, created_by, status,
      total_amount_cents, budget_cents, design_fee_cents, target_end_date
    ) VALUES
      (
        '48660000-0000-4000-8000-000000000041',
        '00486 Decision Close Race',
        '48660000-0000-4000-8000-000000000001',
        '48660000-0000-4000-8000-000000000003',
        '48660000-0000-4000-8000-000000000010',
        '48660000-0000-4000-8000-000000000001',
        'active', 0, 0, 0, current_date + 30
      ),
      (
        '48660000-0000-4000-8000-000000000042',
        '00486 Production Close Race',
        '48660000-0000-4000-8000-000000000001',
        '48660000-0000-4000-8000-000000000003',
        '48660000-0000-4000-8000-000000000010',
        '48660000-0000-4000-8000-000000000001',
        'active', 0, 0, 0, current_date + 30
      ),
      (
        '48660000-0000-4000-8000-000000000043',
        '00486 Scope Close Race',
        '48660000-0000-4000-8000-000000000001', NULL,
        '48660000-0000-4000-8000-000000000010',
        '48660000-0000-4000-8000-000000000001',
        'active', 0, 0, 0, current_date + 30
      );
    INSERT INTO public.client_decisions (
      id, designer_client_id, designer_id, project_id, title,
      decision_type, decision_kind, coordination_kind, court, section_key,
      blocking_status, status, sent_at
    ) VALUES (
      '48660000-0000-4000-8000-000000000080',
      '48660000-0000-4000-8000-000000000030',
      '48660000-0000-4000-8000-000000000001',
      '48660000-0000-4000-8000-000000000041',
      '00486 Final Approval Race', 'approval', 'approval', 'selection',
      'client', 'brief', 'non_blocking', 'pending', now()
    );
    INSERT INTO public.client_decision_options (
      id, decision_id, name, approves, selected, sort_order
    ) VALUES (
      '48660000-0000-4000-8000-000000000081',
      '48660000-0000-4000-8000-000000000080',
      'Approve final race', true, false, 0
    );
    INSERT INTO public.project_payment_milestones (
      id, project_id, label, percentage, amount_cents, status, sort_order,
      trigger_kind, trigger_section_key
    ) VALUES
      (
        '48660000-0000-4000-8000-000000000070',
        '48660000-0000-4000-8000-000000000041',
        '00486 Decision Race Milestone', 0, 1300, 'pending', 0,
        'on_section_settled', 'brief'
      ),
      (
        '48660000-0000-4000-8000-000000000071',
        '48660000-0000-4000-8000-000000000042',
        '00486 Production Race Milestone', 0, 1500, 'pending', 0,
        'on_production_start', NULL
      );
    INSERT INTO public.vendors (id, name)
    VALUES (
      '48660000-0000-4000-8000-000000000050', '00486 Order Vendor'
    );
    INSERT INTO public.purchase_orders (
      id, designer_id, project_id, vendor_id, payment_pattern,
      total_cents, status, created_by
    ) VALUES (
      '48660000-0000-4000-8000-000000000060',
      '48660000-0000-4000-8000-000000000001',
      '48660000-0000-4000-8000-000000000042',
      '48660000-0000-4000-8000-000000000050',
      'full_upfront', 1500, 'confirmed',
      '48660000-0000-4000-8000-000000000001'
    );
    INSERT INTO public.project_ffe_selection_threads (
      id, project_id, primary_ffe_item_id, created_by
    ) VALUES (
      '48660000-0000-4000-8000-000000000090',
      '48660000-0000-4000-8000-000000000042', NULL,
      '48660000-0000-4000-8000-000000000001'
    );
    INSERT INTO public.project_ffe_items (
      id, project_id, name, status, quantity, unit_price_cents,
      line_total_cents, vendor_id, vendor_name, purchase_order_id,
      selection_thread_id, design_disposition, assignment_scope
    ) VALUES (
      '48660000-0000-4000-8000-000000000091',
      '48660000-0000-4000-8000-000000000042',
      '00486 Production Race Item', 'approved', 1, 1500, 1500,
      '48660000-0000-4000-8000-000000000050', '00486 Order Vendor',
      '48660000-0000-4000-8000-000000000060',
      '48660000-0000-4000-8000-000000000090',
      'selected', 'unassigned'
    );
    UPDATE public.project_ffe_selection_threads
    SET primary_ffe_item_id = '48660000-0000-4000-8000-000000000091'
    WHERE id = '48660000-0000-4000-8000-000000000090';
  $setup$);
  PERFORM extensions.dblink_exec(
    'order486_setup', 'SET session_replication_role = origin'
  );

  PERFORM extensions.dblink_connect('order486_direct_ffe', v_conninfo);
  PERFORM extensions.dblink_exec('order486_direct_ffe', $session$
    BEGIN;
    SET LOCAL ROLE service_role;
    DO $remote$
    BEGIN
      PERFORM set_config(
        'app.ffe_production_transition',
        format(
          '%s:%s:%s',
          '48660000-0000-4000-8000-000000000060',
          '48660000-0000-4000-8000-000000000042',
          pg_catalog.txid_current()
        ), true
      );
    END
    $remote$;
  $session$);
  v_status := extensions.dblink_exec('order486_direct_ffe', $direct$
    UPDATE public.project_ffe_items SET status = 'production'
    WHERE id = '48660000-0000-4000-8000-000000000091'
  $direct$, false);
  v_error := extensions.dblink_error_message('order486_direct_ffe');
  ASSERT position(
    'project_ffe_production_transition_requires_project_first_authority'
    IN v_error
  ) > 0, format('forged direct production capability was not denied: %L', v_error);
  PERFORM extensions.dblink_exec('order486_direct_ffe', 'ROLLBACK');
  PERFORM extensions.dblink_disconnect('order486_direct_ffe');
  SELECT checked.consistent INTO v_consistent
  FROM extensions.dblink('order486_setup', $check$
    SELECT status = 'approved'
    FROM public.project_ffe_items
    WHERE id = '48660000-0000-4000-8000-000000000091'
  $check$) AS checked(consistent boolean);
  ASSERT v_consistent, 'forged direct production transition left residue';

  -- Final client approval waits on the project before it can lock the decision.
  PERFORM extensions.dblink_connect('order486_close_decision', v_conninfo);
  PERFORM extensions.dblink_connect('order486_apply', v_conninfo);
  PERFORM extensions.dblink_exec('order486_close_decision', $session$
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims =
      '{"sub":"48660000-0000-4000-8000-000000000001","role":"authenticated"}';
    SET LOCAL request.jwt.claim.sub =
      '48660000-0000-4000-8000-000000000001';
    SET LOCAL lock_timeout = '5s';
    DO $remote$
    BEGIN
      PERFORM 1 FROM public.projects
      WHERE id = '48660000-0000-4000-8000-000000000041' FOR UPDATE;
    END
    $remote$;
  $session$);
  PERFORM extensions.dblink_connect('order486_foreign_apply', v_conninfo);
  PERFORM extensions.dblink_exec('order486_foreign_apply', $session$
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims =
      '{"sub":"48660000-0000-4000-8000-000000000001","role":"authenticated"}';
    SET LOCAL request.jwt.claim.sub =
      '48660000-0000-4000-8000-000000000001';
    SET LOCAL lock_timeout = '200ms';
  $session$);
  v_status := extensions.dblink_exec('order486_foreign_apply', $foreign$
    SELECT public.apply_client_decision(
      '48660000-0000-4000-8000-000000000080',
      '48660000-0000-4000-8000-000000000081'
    )
  $foreign$, false);
  v_error := extensions.dblink_error_message('order486_foreign_apply');
  ASSERT position('only the addressed client may apply this decision' IN v_error) > 0
     AND position('lock timeout' IN v_error) = 0,
    format('foreign decision lookup contended on the project: %L', v_error);
  PERFORM extensions.dblink_exec('order486_foreign_apply', 'ROLLBACK');
  PERFORM extensions.dblink_exec('order486_foreign_apply', $session$
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims =
      '{"sub":"48660000-0000-4000-8000-000000000001","role":"authenticated"}';
    SET LOCAL request.jwt.claim.sub =
      '48660000-0000-4000-8000-000000000001';
    SET LOCAL lock_timeout = '200ms';
  $session$);
  v_status := extensions.dblink_exec('order486_foreign_apply', $missing$
    SELECT public.apply_client_decision(
      '48660000-0000-4000-8000-00000000008f',
      '48660000-0000-4000-8000-000000000081'
    )
  $missing$, false);
  v_error := extensions.dblink_error_message('order486_foreign_apply');
  ASSERT position('only the addressed client may apply this decision' IN v_error) > 0
     AND position('lock timeout' IN v_error) = 0,
    format('missing decision did not share the fixed no-lock denial: %L', v_error);
  PERFORM extensions.dblink_exec('order486_foreign_apply', 'ROLLBACK');
  PERFORM extensions.dblink_disconnect('order486_foreign_apply');
  PERFORM extensions.dblink_exec('order486_apply', $session$
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims =
      '{"sub":"48660000-0000-4000-8000-000000000003","role":"authenticated"}';
    SET LOCAL request.jwt.claim.sub =
      '48660000-0000-4000-8000-000000000003';
    SET LOCAL lock_timeout = '5s';
  $session$);
  SELECT remote.pid INTO v_worker_pid
  FROM extensions.dblink('order486_apply', 'SELECT pg_backend_pid()')
    AS remote(pid integer);
  PERFORM extensions.dblink_send_query('order486_apply', $apply$
    SELECT (public.apply_client_decision(
      '48660000-0000-4000-8000-000000000080',
      '48660000-0000-4000-8000-000000000081',
      'click_through', NULL, '00486 race approval', 1
    )).status::text
  $apply$);
  v_waiting := false;
  FOR v_attempt IN 1..40 LOOP
    SELECT activity.wait_event_type = 'Lock' INTO v_waiting
    FROM pg_stat_activity AS activity WHERE activity.pid = v_worker_pid;
    EXIT WHEN COALESCE(v_waiting, false);
    PERFORM pg_sleep(0.025);
  END LOOP;
  ASSERT COALESCE(v_waiting, false),
    'final client approval did not wait first on the project lock';
  PERFORM extensions.dblink_exec('order486_close_decision', $close$
    DO $remote$
    BEGIN
      BEGIN
        PERFORM public.close_project(
          '48660000-0000-4000-8000-000000000041',
          '[{"key":"walkthrough","completed":true},{"key":"punch_list","completed":true},{"key":"payment","completed":true},{"key":"photography","completed":true},{"key":"photos","completed":true},{"key":"case_study","completed":true}]'::jsonb,
          '{}'::jsonb
        );
        RAISE EXCEPTION 'close unexpectedly succeeded';
      EXCEPTION WHEN check_violation THEN
        IF position('coordination/decision' IN SQLERRM) = 0 THEN RAISE; END IF;
      END;
    END
    $remote$;
    COMMIT;
  $close$);
  SELECT applied.status INTO v_status
  FROM extensions.dblink_get_result('order486_apply', false)
    AS applied(status text);
  v_error := extensions.dblink_error_message('order486_apply');
  ASSERT v_status = 'responded' AND position('deadlock detected' IN v_error) = 0,
    format('decision/close race failed: %L/%L', v_status, v_error);
  PERFORM extensions.dblink_exec('order486_apply', 'COMMIT');
  PERFORM extensions.dblink_disconnect('order486_apply');
  PERFORM extensions.dblink_disconnect('order486_close_decision');
  SELECT checked.consistent INTO v_consistent
  FROM extensions.dblink('order486_setup', $check$
    SELECT
      (SELECT status = 'responded' FROM public.client_decisions
       WHERE id = '48660000-0000-4000-8000-000000000080')
      AND (SELECT invoice_id IS NOT NULL FROM public.project_payment_milestones
           WHERE id = '48660000-0000-4000-8000-000000000070')
      AND (SELECT count(*) = 1 FROM public.invoice_line_items
           WHERE milestone_id = '48660000-0000-4000-8000-000000000070')
  $check$) AS checked(consistent boolean);
  ASSERT v_consistent, 'decision/close race left noncanonical settlement state';

  -- The real PO cascade owns project→FFE order before production auto-drafting.
  PERFORM extensions.dblink_connect('order486_close_production', v_conninfo);
  PERFORM extensions.dblink_connect('order486_production', v_conninfo);
  PERFORM extensions.dblink_exec('order486_close_production', $session$
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims =
      '{"sub":"48660000-0000-4000-8000-000000000001","role":"authenticated"}';
    SET LOCAL request.jwt.claim.sub =
      '48660000-0000-4000-8000-000000000001';
    SET LOCAL lock_timeout = '5s';
    DO $remote$
    BEGIN
      PERFORM 1 FROM public.projects
      WHERE id = '48660000-0000-4000-8000-000000000042' FOR UPDATE;
    END
    $remote$;
  $session$);
  PERFORM extensions.dblink_exec(
    'order486_production', 'BEGIN; SET LOCAL lock_timeout = ''5s'''
  );
  SELECT remote.pid INTO v_worker_pid
  FROM extensions.dblink('order486_production', 'SELECT pg_backend_pid()')
    AS remote(pid integer);
  PERFORM extensions.dblink_send_query('order486_production', $production$
    UPDATE public.purchase_orders SET status = 'in_production'
    WHERE id = '48660000-0000-4000-8000-000000000060'
    RETURNING status
  $production$);
  v_waiting := false;
  FOR v_attempt IN 1..40 LOOP
    SELECT activity.wait_event_type = 'Lock' INTO v_waiting
    FROM pg_stat_activity AS activity WHERE activity.pid = v_worker_pid;
    EXIT WHEN COALESCE(v_waiting, false);
    PERFORM pg_sleep(0.025);
  END LOOP;
  ASSERT COALESCE(v_waiting, false),
    'production transition did not wait first on the project lock';
  PERFORM extensions.dblink_exec('order486_close_production', $close$
    DO $remote$
    BEGIN
      BEGIN
        PERFORM public.close_project(
          '48660000-0000-4000-8000-000000000042',
          '[{"key":"walkthrough","completed":true},{"key":"punch_list","completed":true},{"key":"payment","completed":true},{"key":"photography","completed":true},{"key":"photos","completed":true},{"key":"case_study","completed":true}]'::jsonb,
          '{}'::jsonb
        );
        RAISE EXCEPTION 'close unexpectedly succeeded';
      EXCEPTION WHEN check_violation THEN
        IF position('FF&E item' IN SQLERRM) = 0 THEN RAISE; END IF;
      END;
    END
    $remote$;
    COMMIT;
  $close$);
  SELECT transitioned.status INTO v_status
  FROM extensions.dblink_get_result('order486_production', false)
    AS transitioned(status text);
  v_error := extensions.dblink_error_message('order486_production');
  ASSERT v_status = 'in_production'
     AND position('deadlock detected' IN v_error) = 0,
    format('production/close race failed: %L/%L', v_status, v_error);
  PERFORM extensions.dblink_exec('order486_production', 'COMMIT');
  PERFORM extensions.dblink_disconnect('order486_production');
  PERFORM extensions.dblink_disconnect('order486_close_production');
  SELECT checked.consistent INTO v_consistent
  FROM extensions.dblink('order486_setup', $check$
    SELECT
      (SELECT status = 'production' FROM public.project_ffe_items
       WHERE id = '48660000-0000-4000-8000-000000000091')
      AND (SELECT invoice_id IS NOT NULL FROM public.project_payment_milestones
           WHERE id = '48660000-0000-4000-8000-000000000071')
      AND (SELECT count(*) = 1 FROM public.invoice_line_items
           WHERE milestone_id = '48660000-0000-4000-8000-000000000071')
  $check$) AS checked(consistent boolean);
  ASSERT v_consistent, 'production/close race left noncanonical invoice state';

  -- A direct draft waits behind close, then sees the completed project.
  PERFORM extensions.dblink_connect('order486_close_scope', v_conninfo);
  PERFORM extensions.dblink_connect('order486_scope_insert', v_conninfo);
  PERFORM extensions.dblink_exec('order486_close_scope', $session$
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims =
      '{"sub":"48660000-0000-4000-8000-000000000001","role":"authenticated"}';
    SET LOCAL request.jwt.claim.sub =
      '48660000-0000-4000-8000-000000000001';
    SET LOCAL lock_timeout = '5s';
    DO $remote$
    BEGIN
      PERFORM 1 FROM public.projects
      WHERE id = '48660000-0000-4000-8000-000000000043' FOR UPDATE;
    END
    $remote$;
  $session$);
  PERFORM extensions.dblink_exec('order486_scope_insert', $session$
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims =
      '{"sub":"48660000-0000-4000-8000-000000000001","role":"authenticated"}';
    SET LOCAL request.jwt.claim.sub =
      '48660000-0000-4000-8000-000000000001';
    SET LOCAL lock_timeout = '5s';
  $session$);
  SELECT remote.pid INTO v_worker_pid
  FROM extensions.dblink('order486_scope_insert', 'SELECT pg_backend_pid()')
    AS remote(pid integer);
  PERFORM extensions.dblink_send_query('order486_scope_insert', $insert$
    INSERT INTO public.scope_change_requests (
      id, project_id, requested_by, request_origin, title, description, status
    ) VALUES (
      '48660000-0000-4000-8000-0000000000a0',
      '48660000-0000-4000-8000-000000000043',
      '48660000-0000-4000-8000-000000000001',
      'designer_amendment', '00486 close race draft', 'must roll back', 'draft'
    ) RETURNING id
  $insert$);
  v_waiting := false;
  FOR v_attempt IN 1..40 LOOP
    SELECT activity.wait_event_type = 'Lock' INTO v_waiting
    FROM pg_stat_activity AS activity WHERE activity.pid = v_worker_pid;
    EXIT WHEN COALESCE(v_waiting, false);
    PERFORM pg_sleep(0.025);
  END LOOP;
  ASSERT COALESCE(v_waiting, false),
    'scope draft did not wait behind the canonical project lock';
  PERFORM extensions.dblink_exec('order486_close_scope', $close$
    DO $remote$
    BEGIN
      PERFORM public.close_project(
        '48660000-0000-4000-8000-000000000043',
        '[{"key":"walkthrough","completed":true},{"key":"punch_list","completed":true},{"key":"payment","completed":true},{"key":"photography","completed":true},{"key":"photos","completed":true},{"key":"case_study","completed":true}]'::jsonb,
        '{}'::jsonb
      );
    END
    $remote$;
    COMMIT;
  $close$);
  PERFORM denied.id
  FROM extensions.dblink_get_result('order486_scope_insert', false)
    AS denied(id uuid);
  v_error := extensions.dblink_error_message('order486_scope_insert');
  ASSERT position(
    'scope_change_request_direct_insert_requires_open_project' IN v_error
  ) > 0 AND position('deadlock detected' IN v_error) = 0,
    format('close/scope-insert race returned the wrong denial: %L', v_error);
  PERFORM extensions.dblink_exec('order486_scope_insert', 'ROLLBACK');
  PERFORM extensions.dblink_disconnect('order486_scope_insert');
  PERFORM extensions.dblink_disconnect('order486_close_scope');
  SELECT checked.consistent INTO v_consistent
  FROM extensions.dblink('order486_setup', $check$
    SELECT
      (SELECT status = 'completed' FROM public.projects
       WHERE id = '48660000-0000-4000-8000-000000000043')
      AND NOT EXISTS (
        SELECT 1 FROM public.scope_change_requests
        WHERE id = '48660000-0000-4000-8000-0000000000a0'
      )
  $check$) AS checked(consistent boolean);
  ASSERT v_consistent, 'close/scope-insert race left a terminal-project draft';

  PERFORM extensions.dblink_exec(
    'order486_setup', 'SET session_replication_role = replica'
  );
  PERFORM extensions.dblink_exec('order486_setup', $cleanup$
    DELETE FROM public.notification_log
    WHERE metadata->>'project_id' LIKE '48660000-0000-4000-8000-%';
    DELETE FROM public.decision_notifications
    WHERE decision_id = '48660000-0000-4000-8000-000000000080';
    DELETE FROM public.decision_events
    WHERE decision_id = '48660000-0000-4000-8000-000000000080';
    DELETE FROM public.invoice_line_items
    WHERE invoice_id IN (
      SELECT id FROM public.invoices
      WHERE project_id::text LIKE '48660000-0000-4000-8000-%'
    );
    DELETE FROM public.invoices
    WHERE project_id::text LIKE '48660000-0000-4000-8000-%';
    DELETE FROM public.client_decision_options
    WHERE decision_id = '48660000-0000-4000-8000-000000000080';
    DELETE FROM public.client_decisions
    WHERE id = '48660000-0000-4000-8000-000000000080';
    DELETE FROM public.scope_change_requests
    WHERE project_id = '48660000-0000-4000-8000-000000000043';
    DELETE FROM public.project_payment_milestones
    WHERE project_id::text LIKE '48660000-0000-4000-8000-%';
    DELETE FROM public.project_ffe_items
    WHERE project_id = '48660000-0000-4000-8000-000000000042';
    DELETE FROM public.project_ffe_selection_threads
    WHERE project_id = '48660000-0000-4000-8000-000000000042';
    DELETE FROM public.purchase_orders
    WHERE project_id = '48660000-0000-4000-8000-000000000042';
    DELETE FROM public.projects
    WHERE id IN (
      '48660000-0000-4000-8000-000000000041',
      '48660000-0000-4000-8000-000000000042',
      '48660000-0000-4000-8000-000000000043'
    );
    DELETE FROM public.designer_clients
    WHERE id = '48660000-0000-4000-8000-000000000030';
    DELETE FROM public.user_roles
    WHERE user_id = '48660000-0000-4000-8000-000000000001';
    DELETE FROM public.organization_members
    WHERE id = '48660000-0000-4000-8000-000000000020';
    DELETE FROM public.organizations
    WHERE id = '48660000-0000-4000-8000-000000000010';
    DELETE FROM public.vendors
    WHERE id = '48660000-0000-4000-8000-000000000050';
    DELETE FROM public.profiles
    WHERE id IN (
      '48660000-0000-4000-8000-000000000001',
      '48660000-0000-4000-8000-000000000003'
    );
    DELETE FROM auth.users
    WHERE id IN (
      '48660000-0000-4000-8000-000000000001',
      '48660000-0000-4000-8000-000000000003'
    );
  $cleanup$);
  PERFORM extensions.dblink_exec(
    'order486_setup', 'SET session_replication_role = origin'
  );
  PERFORM extensions.dblink_disconnect('order486_setup');
END
$decision_production_scope_close_races$;

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
    SELECT invoice_id = '48600000-0000-4000-8000-000000000073'
    FROM public.project_payment_milestones
    WHERE id = '48600000-0000-4000-8000-000000000071'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.invoice_line_items
    WHERE milestone_id = '48600000-0000-4000-8000-000000000071'
  ), 'foreign milestone probe changed the hostile latch or created a line';
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
