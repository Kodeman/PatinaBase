-- ═══════════════════════════════════════════════════════════════════════════
-- 00486 — Caller-backed public SECURITY DEFINER hardening
--
-- Lineage: exact reviewed definitions through 00484. This migration is
-- limited to the 25 canonical overloads approved by the caller-backed
-- independent challenge and the adjacent relays required to close their
-- finalizer, scope-change, SMS, and milestone-invoice authority paths.
-- It does not alter open_project_direct, create_studio_workspace, or the
-- no-literal caller lane hardened by 00485.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $preflight_roles$
DECLARE
  required_role text;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '00486 must run as postgres; got %', current_user;
  END IF;

  FOREACH required_role IN ARRAY ARRAY[
    'anon', 'authenticated', 'service_role', 'dashboard_user',
    'agent_reader', 'agent_writer', 'edge_catalog_reader', 'edge_rls_user'
  ]
  LOOP
    IF to_regrole(required_role) IS NULL THEN
      RAISE EXCEPTION '00486 required role % is missing', required_role;
    END IF;
  END LOOP;
END
$preflight_roles$;

CREATE TEMP TABLE _00486_routine_profile (
  signature text PRIMARY KEY,
  arguments text NOT NULL,
  result_type text NOT NULL,
  volatility "char" NOT NULL,
  original_config text[] NOT NULL,
  final_config text[] NOT NULL,
  original_body_sha256 text NOT NULL,
  final_body_sha256 text NOT NULL,
  original_roles text[] NOT NULL DEFAULT ARRAY[]::text[],
  final_roles text[] NOT NULL
) ON COMMIT DROP;

INSERT INTO _00486_routine_profile (
  signature, arguments, result_type, volatility,
  original_config, final_config,
  original_body_sha256, final_body_sha256, final_roles
)
VALUES
  (
    'public.activate_project_v2(jsonb)', 'input jsonb', 'uuid', 'v',
    ARRAY['search_path=public, pg_temp'],
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    '3dffe012df2379140f16d7f680c19dc3b20b3fea2981403b33689d9235fc2e8a',
    '9f0aa8cf4611f0547b9356997e477c3dcbea4ed591e7f05ef1572122618fe39f', ARRAY['authenticated']
  ),
  (
    'public.apply_scope_change(uuid)', 'p_request_id uuid', 'void', 'v',
    ARRAY['search_path=public, pg_temp'],
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    '299b2eec88629f4abb9c8ef5c62b2549bf444ee2673f30ace8266e00958fb911',
    '88cd8a50f7851f7a4857e7a0e79bafb741c20c0ddd87b6f49005aa2438c58e49', ARRAY['authenticated']
  ),
  (
    'public.claim_proposal_send_dispatch(uuid,uuid,timestamp with time zone,integer)',
    'p_dispatch_id uuid, p_proposal_id uuid, p_sent_at timestamp with time zone, p_lease_seconds integer DEFAULT 30',
    'jsonb', 'v', ARRAY['search_path=public, pg_temp'],
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    '42895ad7627e31a3452c3f8bb41a4cab3afee45165335a3647617d3b0f8f3394',
    'dc0941ea855815d760cf34277d3a86a4c7755af7df834eacb4ce628f7b9af713', ARRAY['service_role']
  ),
  (
    'public.close_project(uuid,jsonb,jsonb)',
    'p_project_id uuid, p_closure jsonb DEFAULT NULL::jsonb, p_snapshot jsonb DEFAULT NULL::jsonb',
    'public.projects', 'v', ARRAY['search_path=public, pg_temp'],
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    '44c113df92bbfe30c596e7b1304b95338dd7a66883d79051da64b65395623d84',
    '4301647c39107e143774c434436248b3fc7946bf75b7b102c0ec335bc156d5d1', ARRAY['authenticated']
  ),
  (
    'public.create_field_link(uuid)', 'p_party_id uuid',
    'TABLE(id uuid, token text)', 'v',
    ARRAY['search_path=public, extensions, pg_temp'],
    ARRAY['search_path=pg_catalog, public, extensions, pg_temp'],
    '366c25ee75a25d3303d8a316fc43ac7e6be9a3fc1e0563bed5513a1fc8bbdcb4',
    '7f6d4798893a9c22184ce5110606c9195ca92f05add06e110abebf5583e31c84', ARRAY['authenticated', 'service_role']
  ),
  (
    'public.decline_proposal(uuid,text)',
    'p_proposal_id uuid, p_reason text DEFAULT NULL::text', 'jsonb', 'v',
    ARRAY['search_path=public, pg_temp'],
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    '7ad044c0a515905f55b1cb601a869d95b9be0501c2fb28317e1e49ed45899e5c',
    'd5389723981d6d61fd4a945bc86a4e2aae4a0521b93be0fca3fb6551639143a6', ARRAY['authenticated']
  ),
  (
    'public.escalate_item_feedback_to_decision(uuid,uuid)',
    'p_feedback_id uuid, p_decision_id uuid', 'public.item_feedback', 'v',
    ARRAY['search_path=public, pg_temp'],
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    '059b9103fafdf467236077b4cbc3621cbe7f9aa7ce9bcd28121b585343fdd90a',
    '84b6f8eccb9de7e2acba05f84707b56562b01fa595a89e1ada0b5a89e6a5a0dc', ARRAY['authenticated']
  ),
  (
    'public.expire_due_client_decisions(timestamp with time zone)',
    'p_cutoff timestamp with time zone', 'TABLE(id uuid)', 'v',
    ARRAY['search_path=public, pg_temp'],
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    'c2a82a83ce52729f9abaedda1ac3031c5d425bcef209afcd1534bdd3ee7fc883',
    '6238367c240614e6c9f52222e07c726f24f201058ed2392ed757ef49794cc1f5', ARRAY['service_role']
  ),
  (
    'public.finalize_spec_book_issue(uuid)', 'p_revision_id uuid',
    'public.spec_book_revisions', 'v', ARRAY['search_path=public, pg_temp'],
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    '735b405a19ceae9279b50c992b20758a7084b4e733c9efee72a503888acb1f6b',
    'd86404d2a0eb529bc25cf48c86ad0b2e87bd91eb07d8f4d8699f2feea3b6d310', ARRAY['service_role']
  ),
  (
    'public.generate_milestone_invoice(uuid)', 'p_milestone_id uuid',
    'uuid', 'v', ARRAY['search_path=public'],
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    '49d8345cb27463e5e33c534e34ae94646b813cc4d6201f4a230799f481faa1d6',
    '3d8a4697f0971fc3d3fb55d3939080eaa36edae539e86467236e6ef9bc8be3ae', ARRAY['authenticated']
  ),
  (
    'public.get_ab_variant_stats(uuid)', 'p_campaign_id uuid',
    'TABLE(variant text, sent bigint, delivered bigint, opened bigint, clicked bigint, bounced bigint)',
    's', ARRAY['search_path=public, pg_temp'],
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    '9a80567272eb5f2da4b4b295ea8373b38e6d905f797969ad3f47f66311fd7ecd',
    'b53e8f9fcf9ba425b1093b2b85a6bac195012d39f6fe5a6b49d9fa3a94abaf97', ARRAY['authenticated']
  ),
  (
    'public.get_client_project_review_bundle(uuid)', 'p_edition_id uuid',
    'jsonb', 'v', ARRAY['search_path=public, pg_temp'],
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    '661b5863eef76cb0804f2fc02d4169b9c11a3b913d02badd0227caf29376e104',
    '894f816c2c40ea0a8d50b014cf698700455eba50fca33d4b5d6f15541c45d67d', ARRAY['authenticated']
  ),
  (
    'public.mark_proposal_viewed(uuid)', 'p_proposal_id uuid', 'jsonb', 'v',
    ARRAY['search_path=public, pg_temp'],
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    'e8e5445a1cb2e4308e31a5fb05ddb09d57e56d0cdc6156baa59eaee820ec7ab4',
    '3beeb2e41bfbd217c041ada2778b485fa5958b99474cb71cfa8d2f242e9bd5e4', ARRAY['authenticated']
  ),
  (
    'public.mint_trade_rfq_token(uuid)', 'p_rfq_id uuid',
    'TABLE(id uuid, token text)', 'v',
    ARRAY['search_path=public, extensions, pg_temp'],
    ARRAY['search_path=pg_catalog, public, extensions, pg_temp'],
    '47e838c5c19c70e5843f56a55e5f8b8c3312d8a9be8bf41faf0e6515ab84b762',
    '36486c8831b50682f397c110582e440bd069ceff48f5a783ef0d2e2b0f600c04', ARRAY['service_role']
  ),
  (
    'public.persist_proposal_send_request(uuid,uuid,text,text,text[],text[],text,boolean)',
    'p_dispatch_id uuid, p_claim_token uuid, p_request_body text, p_from text, p_to text[], p_cc text[], p_subject text, p_dry_run boolean',
    'jsonb', 'v', ARRAY['search_path=public, pg_temp'],
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    'baa5f88dcd2fdfca23ecbbd4b6b308d944194c71c5c8733f270f46b6f750c77e',
    '9363749c1c2ff219327692fa17aa910f3f8c53789e2d6c41dffcb53b2eb08ce6', ARRAY['service_role']
  ),
  (
    'public.read_proposal_send_dispatch(uuid,uuid,timestamp with time zone)',
    'p_dispatch_id uuid, p_proposal_id uuid, p_sent_at timestamp with time zone',
    'jsonb', 'v', ARRAY['search_path=public, pg_temp'],
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    '46411309a42b6bd4a4a48752b8037db10f69015bbd24843b9b544514c42f9666',
    '90185476e830e30d83fa883b8e5c19d9fe8452e7cdea9488694e6f671cee8b76', ARRAY['service_role']
  ),
  (
    'public.reassign_project_lead(uuid,uuid,uuid)',
    'p_project_id uuid, p_expected_designer_id uuid, p_new_designer_id uuid',
    'public.projects', 'v', ARRAY['search_path=public, pg_temp'],
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    '91863450160076979461b2fa4bb264e94c3f66ea7a7e1621e6ed6959e7942169',
    '31fe6ad2c1809d5abacb78c09cef814921814a1036977a7207436bfd4f08e3e9', ARRAY['authenticated']
  ),
  (
    'public.record_offline_signature(uuid,text,boolean,date)',
    'p_proposal_id uuid, p_signed_name text, p_auto_activate boolean DEFAULT true, p_start_date date DEFAULT CURRENT_DATE',
    'uuid', 'v', ARRAY['search_path=public, pg_temp'],
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    'b291ae3afdaeaa12f72918974f3d67bcad4466033fcb7eee0ed21bfe147ef94a',
    'c75acf68064717681a1d55f1eb233c45aae05b9a4bb6099c0af57bc4d4af2a35', ARRAY['authenticated']
  ),
  (
    'public.reply_to_item_feedback(uuid,text)',
    'p_feedback_id uuid, p_body text', 'public.item_feedback_events', 'v',
    ARRAY['search_path=public, pg_temp'],
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    '284fcc936b5e50f43fa3cb7ba47ab1c1de10191d57555762ff809b045ad1b711',
    '31fd570f78940073f4b22c176123630cd4f6541190248f43176072700f1994f5', ARRAY['authenticated']
  ),
  (
    'public.request_proposal_change(uuid,text)',
    'p_proposal_id uuid, p_feedback text', 'void', 'v',
    ARRAY['search_path=public, pg_temp'],
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    '3bea4aeff30e2f7ef7ce8d9f184e72df08831423f16b8b7087f8174665f63cc5',
    'a13453ffde6d1ed63523fec73b013227158f0b29d025b7ae74f6a3df798e060d', ARRAY['authenticated']
  ),
  (
    'public.review_sms_message(uuid,text,jsonb)',
    'p_message_id uuid, p_action text, p_effect jsonb DEFAULT NULL::jsonb',
    'jsonb', 'v', ARRAY['search_path=public, pg_temp'],
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    '65618f884498e0f66c8a71ca068a3c4fc10da0d119d855f2d42f14509196da05',
    '97f87c14df99dbc9a5c45c02f63274715b3a16fdc82291609bf3930cdb4e5173', ARRAY['authenticated']
  ),
  (
    'public.stamp_project_approval_reminder_delivery(uuid,uuid)',
    'p_decision_id uuid, p_decision_lead_id uuid', 'public.client_decisions', 'v',
    ARRAY['search_path=public, pg_temp'],
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    '9cfe593cefb0306ae0b4f656a56c0062ff82cf4abb0e4b7a937c5b80fd08741e',
    '5fa829cfcb44ee9c1628ba520102322b25bb0072404d87309302dc1ee93538b5', ARRAY['service_role']
  ),
  (
    'public.submit_coordination_revision(uuid,jsonb,text,text,uuid)',
    'p_item_id uuid, p_attachments jsonb DEFAULT ''[]''::jsonb, p_note text DEFAULT NULL::text, p_status text DEFAULT ''submitted''::text, p_submitted_by uuid DEFAULT NULL::uuid',
    'public.coordination_item_revisions', 'v',
    ARRAY['search_path=public, pg_temp'],
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    'f85c5907da1d98d33061deb6c050098662576db9a53333ca6153f353a7e15eb2',
    '80c7f88c6b63600a5048183071c2e7569bd22c9c504d86bef9216e178a0a3cf8', ARRAY['authenticated']
  ),
  (
    'public.sync_proposal_send_email_log(uuid)', 'p_dispatch_id uuid',
    'void', 'v', ARRAY['search_path=public, pg_temp'],
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    'c1b86d7eb3f221974e89a607e782e4c7239248d82335da1fab72b7284be4698e',
    'd243e7f184a6e8dd751335df800c8b5c4917a7aaf433d5d25c5ab5e82632966c', ARRAY['service_role']
  ),
  (
    'public.sync_proposal_send_in_app_log(uuid)', 'p_dispatch_id uuid',
    'void', 'v', ARRAY['search_path=public, pg_temp'],
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    'f6461a3ca463518cefa60d26e4cb90aaee9e05c0b57bd594716509724e3f2bc6',
    'ebb32f2da4ee004852e54c7d2d1c2eef55faef758e31a47ee0338f050c05709f', ARRAY['service_role']
  );

UPDATE _00486_routine_profile
SET original_roles = final_roles;

UPDATE _00486_routine_profile
SET original_roles = ARRAY['authenticated', 'service_role']
WHERE signature IN (
  'public.apply_scope_change(uuid)',
  'public.finalize_spec_book_issue(uuid)',
  'public.get_ab_variant_stats(uuid)',
  'public.get_client_project_review_bundle(uuid)'
);

CREATE TEMP TABLE _00486_dependency_profile (
  signature text PRIMARY KEY,
  arguments text NOT NULL,
  result_type text NOT NULL,
  language_name text NOT NULL,
  security_definer boolean NOT NULL,
  volatility "char" NOT NULL,
  original_config text[] NOT NULL,
  final_config text[] NOT NULL,
  original_body_sha256 text NOT NULL,
  final_body_sha256 text NOT NULL,
  original_roles text[] NOT NULL,
  final_roles text[] NOT NULL,
  source_required boolean NOT NULL DEFAULT true
) ON COMMIT DROP;

INSERT INTO _00486_dependency_profile VALUES
  (
    'public._finalize_spec_book_issue_00403(uuid)', 'p_revision_id uuid',
    'public.spec_book_revisions', 'plpgsql', true, 'v',
    ARRAY['search_path=public, pg_temp'],
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    '095109b82a35f52c551a203ecbf05b539180ad595644988e511c3af8841668d4',
    '095109b82a35f52c551a203ecbf05b539180ad595644988e511c3af8841668d4',
    ARRAY['service_role'], ARRAY[]::text[], true
  ),
  (
    'public._scope_change_requester_can_author(uuid,uuid)',
    'p_actor uuid, p_owner uuid', 'boolean', 'sql', true, 's',
    ARRAY['search_path=public, pg_temp'],
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    'cd16125dd79d36eea58e5bb928a41add1b11d496d2b0fd958bc51d90456fdab7',
    'cf1a32d2ab1608f8c3667b5f8320192dc274ad47d740b0609d64bc6824744e00',
    ARRAY[]::text[], ARRAY[]::text[], true
  ),
  (
    'public._scope_change_requester_can_author(uuid,uuid,uuid)',
    'p_actor uuid, p_owner uuid, p_project_id uuid', 'boolean',
    'plpgsql', true, 'v', ARRAY['search_path=pg_catalog, public, pg_temp'],
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    '5b7df65b73ce6fcdac0d66aadce7aebcffd198e2fc08b9b90c46e6e69496a946',
    '0ad79001500666469b44240b55335f5f2eb07adc967d97f43e04b34397273508',
    ARRAY[]::text[], ARRAY[]::text[], false
  ),
  (
    'public.guard_scope_change_request_integrity()', '', 'trigger',
    'plpgsql', false, 'v', ARRAY['search_path=public, pg_temp'],
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    'fd3a5657e3191045f8a93f119be4a44bf6d64b313b396850640e86765fd713b7',
    'badf9f769e014fd8128509af9e1a4fd5a59615954f82ad83e639616abaeef0aa',
    ARRAY[]::text[], ARRAY[]::text[], true
  ),
  (
    'public.send_scope_change_request(uuid,uuid)',
    'p_request_id uuid, p_project_id uuid', 'jsonb', 'plpgsql', true, 'v',
    ARRAY['search_path=public, pg_temp'],
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    '8ceedb9b9f013a2c26e1adcc27f6d3751bff9ed6428a1ed715e26bd47f5dfe0c',
    '625f109b0473c31b20f69efa634bc0f4ca80c013c5037bacb316809b5100c657',
    ARRAY['authenticated', 'service_role'],
    ARRAY['authenticated', 'service_role'], true
  ),
  (
    'public.approve_scope_change_request(uuid,uuid,text,text)',
    'p_request_id uuid, p_project_id uuid, p_approved_by_name text, p_approved_ip text DEFAULT NULL::text',
    'jsonb', 'plpgsql', true, 'v', ARRAY['search_path=public, pg_temp'],
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    'f2cc3c1caa11ed2eba469316433a873b2925354781a0c900e7e9c98470ed8cb7',
    '1a8f590887295f38fe35c4963cde5d95960398b29b59ff938b4318362f0b3e42',
    ARRAY['authenticated', 'service_role'],
    ARRAY['authenticated', 'service_role'], true
  ),
  (
    'public.accept_client_scope_change_request(uuid,uuid)',
    'p_request_id uuid, p_project_id uuid', 'jsonb', 'plpgsql', true, 'v',
    ARRAY['search_path=public, pg_temp'],
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    'd7ac29da8abcbfb065aaa1bdfab469a9fb711f25148e1c2eb5846f0e6c097258',
    '56c34a3f637393aa3fec4c7aea708db421f054ebb034092a54b35347b2af3d8a',
    ARRAY['authenticated', 'service_role'],
    ARRAY['authenticated', 'service_role'], true
  ),
  (
    'public.decline_scope_change_request(uuid,uuid,text)',
    'p_request_id uuid, p_project_id uuid, p_decline_reason text DEFAULT NULL::text',
    'jsonb', 'plpgsql', true, 'v', ARRAY['search_path=public, pg_temp'],
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    '0efdfb764f36edcf41410d0cf6a00e28b26e336b26f619ddcd9f3ed1300c177e',
    '689f31f8c7a3688bc37fd4a0b68a319d8be0cf2dc0bffffd1ab2757ecfda70f4',
    ARRAY['authenticated', 'service_role'],
    ARRAY['authenticated', 'service_role'], true
  ),
  (
    'public.cancel_scope_change_request(uuid,uuid)',
    'p_request_id uuid, p_project_id uuid', 'jsonb', 'plpgsql', true, 'v',
    ARRAY['search_path=public, pg_temp'],
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    'c8609ece811f426f95788db55e1112850182d03d88f495e78b7b88deab883ab7',
    '53b7f672ed533ab86fe96e18c8c67bd8492331fc7d2210743ce47e307febfde3',
    ARRAY['authenticated', 'service_role'],
    ARRAY['authenticated', 'service_role'], true
  ),
  (
    'public.apply_field_effect(uuid,jsonb,text,uuid)',
    'p_party_id uuid, p_effect jsonb, p_source text DEFAULT ''sms''::text, p_sms_message_id uuid DEFAULT NULL::uuid',
    'jsonb', 'plpgsql', true, 'v', ARRAY['search_path=public, pg_temp'],
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    'fdd44ab814b4ea0f710ef8f9546804b7166da6d60a90cba14610072a824f14cd',
    '04bc0150662c657c3a3b561527c1d649fc41d517252b2d33f12d51daad48052c',
    ARRAY['service_role'], ARRAY['service_role'], true
  ),
  (
    'public.draft_invoice_from_milestone(uuid)', 'p_milestone_id uuid',
    'uuid', 'plpgsql', true, 'v', ARRAY['search_path=public'],
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    '000414169a6d57ee560f901d5ad8acef1aafcaf607de21df395ec8045db60c50',
    '6a2df0b14e06aa00ad2bc90b59346c46c4b1e0cbc20ffa972b6ab63cdbeb8472',
    ARRAY['service_role'], ARRAY['service_role'], true
  ),
  (
    'public._draft_invoice_from_milestone_00486(uuid)',
    'p_milestone_id uuid', 'uuid', 'plpgsql', true, 'v',
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    '000414169a6d57ee560f901d5ad8acef1aafcaf607de21df395ec8045db60c50',
    '000414169a6d57ee560f901d5ad8acef1aafcaf607de21df395ec8045db60c50',
    ARRAY[]::text[], ARRAY[]::text[], false
  ),
  (
    'public.sync_invoice_line_milestone_latch()', '', 'trigger',
    'plpgsql', false, 'v', ARRAY['search_path=public, pg_temp'],
    ARRAY['search_path=pg_catalog, public, pg_temp'],
    '4e8568994c57300bc7eef68e408fbd6956fc474ddf272bfaf96ccbfcf3687b56',
    'fb3520a732378efe39f0e68838bcfada60cad47a1ac9c440fc3feedd1aa596b0',
    ARRAY[]::text[], ARRAY[]::text[], true
  );

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
  v_schema_token text;
  v_name_token text;
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

  FOREACH v_scan_source IN ARRAY CASE
    WHEN v_direct_source ~* '(^|[^[:alnum:]_$])execute([^[:alnum:]_$]|$)'
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

DO $caller_scan_contract$
BEGIN
  IF NOT pg_temp._00486_references_routine(
    $source$SELECT PUBLIC._DRAFT_INVOICE_FROM_MILESTONE_00486($1)$source$,
    'public', '_draft_invoice_from_milestone_00486'
  ) OR NOT pg_temp._00486_references_routine(
    $source$SELECT "public"."_draft_invoice_from_milestone_00486"($1)$source$,
    'public', '_draft_invoice_from_milestone_00486'
  ) OR NOT pg_temp._00486_references_routine(
    $source$BEGIN EXECUTE format('SELECT public._draft_invoice_from_milestone_00486(%L)', value); END$source$,
    'public', '_draft_invoice_from_milestone_00486'
  ) OR pg_temp._00486_references_routine(
    $source$SELECT "public"."_DRAFT_INVOICE_FROM_MILESTONE_00486"($1)$source$,
    'public', '_draft_invoice_from_milestone_00486'
  ) OR pg_temp._00486_references_routine(
    $source$SELECT private._draft_invoice_from_milestone_00486($1)$source$,
    'public', '_draft_invoice_from_milestone_00486'
  ) OR pg_temp._00486_references_routine(
    $source$PERFORM 'public._draft_invoice_from_milestone_00486(';$source$,
    'public', '_draft_invoice_from_milestone_00486'
  ) OR pg_temp._00486_references_routine(
    $source$-- public._draft_invoice_from_milestone_00486(
      PERFORM 1;$source$,
    'public', '_draft_invoice_from_milestone_00486'
  ) THEN
    RAISE EXCEPTION '00486 routine-reference scanner contract failed';
  END IF;
END
$caller_scan_contract$;

DO $source_profile_preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM _00486_routine_profile AS expected
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
       OR NOT (
            (
              routine.proconfig IS NOT DISTINCT FROM expected.original_config
              AND encode(
                    extensions.digest(convert_to(routine.prosrc, 'UTF8'), 'sha256'),
                    'hex'
                  ) IS NOT DISTINCT FROM expected.original_body_sha256
              AND COALESCE((
                    SELECT array_agg(
                      COALESCE(grantee.rolname, 'PUBLIC')
                      ORDER BY COALESCE(grantee.rolname, 'PUBLIC')
                    )
                    FROM aclexplode(
                      COALESCE(routine.proacl, acldefault('f', routine.proowner))
                    ) AS acl
                    LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
                    WHERE acl.privilege_type = 'EXECUTE'
                  ), ARRAY[]::text[]) IS NOT DISTINCT FROM (
                    SELECT array_agg(role_name ORDER BY role_name)
                    FROM unnest(
                      array_append(expected.original_roles, 'postgres')
                    ) AS role_name
                  )
            )
            OR (
              routine.proconfig IS NOT DISTINCT FROM expected.final_config
              AND encode(
                    extensions.digest(convert_to(routine.prosrc, 'UTF8'), 'sha256'),
                    'hex'
                  ) IS NOT DISTINCT FROM expected.final_body_sha256
              AND COALESCE((
                    SELECT array_agg(
                      COALESCE(grantee.rolname, 'PUBLIC')
                      ORDER BY COALESCE(grantee.rolname, 'PUBLIC')
                    )
                    FROM aclexplode(
                      COALESCE(routine.proacl, acldefault('f', routine.proowner))
                    ) AS acl
                    LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
                    WHERE acl.privilege_type = 'EXECUTE'
                  ), ARRAY[]::text[]) IS NOT DISTINCT FROM (
                    SELECT array_agg(role_name ORDER BY role_name)
                    FROM unnest(
                      array_append(expected.final_roles, 'postgres')
                    ) AS role_name
                  )
            )
          )
       OR EXISTS (
            SELECT 1
            FROM aclexplode(COALESCE(routine.proacl, acldefault('f', routine.proowner))) AS acl
            WHERE acl.privilege_type <> 'EXECUTE'
               OR acl.grantor <> routine.proowner
               OR acl.is_grantable
          )
  ) THEN
    RAISE EXCEPTION '00486 reviewed source profile/body/config/ACL drifted';
  END IF;
END
$source_profile_preflight$;

DO $dependency_profile_preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM _00486_dependency_profile AS expected
    LEFT JOIN pg_proc AS routine
      ON routine.oid = to_regprocedure(expected.signature)
    LEFT JOIN pg_roles AS owner ON owner.oid = routine.proowner
    LEFT JOIN pg_language AS language ON language.oid = routine.prolang
    WHERE (routine.oid IS NULL AND expected.source_required)
       OR (routine.oid IS NOT NULL AND (
          owner.rolname IS DISTINCT FROM 'postgres'
       OR language.lanname IS DISTINCT FROM expected.language_name
       OR routine.prokind IS DISTINCT FROM 'f'::"char"
       OR routine.prosecdef IS DISTINCT FROM expected.security_definer
       OR routine.proleakproof
       OR routine.proisstrict
       OR routine.proparallel IS DISTINCT FROM 'u'::"char"
       OR routine.provolatile IS DISTINCT FROM expected.volatility
       OR pg_get_function_arguments(routine.oid) IS DISTINCT FROM expected.arguments
       OR pg_get_function_result(routine.oid) IS DISTINCT FROM expected.result_type
       OR NOT (
            (
              routine.proconfig IS NOT DISTINCT FROM expected.original_config
              AND encode(
                    extensions.digest(convert_to(routine.prosrc, 'UTF8'), 'sha256'),
                    'hex'
                  ) IS NOT DISTINCT FROM expected.original_body_sha256
              AND COALESCE((
                    SELECT array_agg(
                      COALESCE(grantee.rolname, 'PUBLIC')
                      ORDER BY COALESCE(grantee.rolname, 'PUBLIC')
                    )
                    FROM aclexplode(
                      COALESCE(routine.proacl, acldefault('f', routine.proowner))
                    ) AS acl
                    LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
                    WHERE acl.privilege_type = 'EXECUTE'
                  ), ARRAY[]::text[]) IS NOT DISTINCT FROM (
                    SELECT array_agg(role_name ORDER BY role_name)
                    FROM unnest(
                      array_append(expected.original_roles, 'postgres')
                    ) AS role_name
                  )
            )
            OR (
              routine.proconfig IS NOT DISTINCT FROM expected.final_config
              AND encode(
                    extensions.digest(convert_to(routine.prosrc, 'UTF8'), 'sha256'),
                    'hex'
                  ) IS NOT DISTINCT FROM expected.final_body_sha256
              AND COALESCE((
                    SELECT array_agg(
                      COALESCE(grantee.rolname, 'PUBLIC')
                      ORDER BY COALESCE(grantee.rolname, 'PUBLIC')
                    )
                    FROM aclexplode(
                      COALESCE(routine.proacl, acldefault('f', routine.proowner))
                    ) AS acl
                    LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
                    WHERE acl.privilege_type = 'EXECUTE'
                  ), ARRAY[]::text[]) IS NOT DISTINCT FROM (
                    SELECT array_agg(role_name ORDER BY role_name)
                    FROM unnest(
                      array_append(expected.final_roles, 'postgres')
                    ) AS role_name
                  )
            )
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
       ))
  ) THEN
    RAISE EXCEPTION '00486 dependent relay profile/body/config/ACL drifted';
  END IF;
END
$dependency_profile_preflight$;

DO $withhold_direct_callers$
DECLARE
  expected _00486_routine_profile%ROWTYPE;
  app_role text;
BEGIN
  FOR expected IN SELECT * FROM _00486_routine_profile ORDER BY signature
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON FUNCTION %s FROM PUBLIC CASCADE',
      expected.signature
    );
    FOREACH app_role IN ARRAY ARRAY[
      'anon', 'authenticated', 'service_role', 'dashboard_user',
      'agent_reader', 'agent_writer', 'edge_catalog_reader', 'edge_rls_user'
    ]
    LOOP
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON FUNCTION %s FROM %I CASCADE',
        expected.signature, app_role
      );
    END LOOP;
  END LOOP;
END
$withhold_direct_callers$;

DO $withhold_dependent_relays$
DECLARE
  expected _00486_dependency_profile%ROWTYPE;
  app_role text;
BEGIN
  FOR expected IN SELECT * FROM _00486_dependency_profile ORDER BY signature
  LOOP
    IF to_regprocedure(expected.signature) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON FUNCTION %s FROM PUBLIC CASCADE',
      expected.signature
    );
    FOREACH app_role IN ARRAY ARRAY[
      'anon', 'authenticated', 'service_role', 'dashboard_user',
      'agent_reader', 'agent_writer', 'edge_catalog_reader', 'edge_rls_user'
    ]
    LOOP
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON FUNCTION %s FROM %I CASCADE',
        expected.signature, app_role
      );
    END LOOP;
  END LOOP;
END
$withhold_dependent_relays$;

REVOKE ALL PRIVILEGES ON FUNCTION
  public._finalize_spec_book_issue_00403(uuid)
  FROM PUBLIC CASCADE;
REVOKE ALL PRIVILEGES ON FUNCTION
  public._finalize_spec_book_issue_00403(uuid)
  FROM anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user CASCADE;
ALTER FUNCTION public._finalize_spec_book_issue_00403(uuid)
  SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION public._scope_change_requester_can_author(
  p_actor uuid,
  p_owner uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT p_actor IS NOT NULL
     AND p_owner IS NOT NULL
     AND p_actor = p_owner;
$$;

REVOKE ALL PRIVILEGES ON FUNCTION
  public._scope_change_requester_can_author(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;

CREATE OR REPLACE FUNCTION public._scope_change_requester_can_author(
  p_actor uuid,
  p_owner uuid,
  p_project_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_project_owner uuid;
  v_studio_id uuid;
BEGIN
  IF p_actor IS NULL OR p_owner IS NULL OR p_project_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT project.designer_id, project.studio_id
  INTO v_project_owner, v_studio_id
  FROM public.projects AS project
  WHERE project.id = p_project_id
  FOR SHARE OF project;
  IF NOT FOUND OR v_project_owner IS DISTINCT FROM p_owner THEN
    RETURN false;
  END IF;
  IF p_actor = p_owner THEN
    RETURN true;
  END IF;

  PERFORM 1
  FROM public.organizations AS organization
  WHERE organization.id = v_studio_id
    AND organization.type = 'design_studio'
    AND organization.status = 'active'
  FOR SHARE OF organization;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  PERFORM 1
  FROM public.organization_members AS membership
  WHERE membership.organization_id = v_studio_id
    AND membership.user_id = p_actor
    AND membership.status = 'active'
    AND membership.role <> 'guest'
  FOR SHARE OF membership;
  RETURN FOUND;
END;
$$;

REVOKE ALL PRIVILEGES ON FUNCTION
  public._scope_change_requester_can_author(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;

CREATE OR REPLACE FUNCTION public.guard_scope_change_request_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_authority_token text := current_setting('app.scope_change_transition', true);
  v_transition text;
  v_table_owner name;
  v_project_designer uuid;
  v_studio_id uuid;
BEGIN
  SELECT pg_get_userbyid(relation.relowner)
  INTO v_table_owner
  FROM pg_class AS relation
  WHERE relation.oid = TG_RELID;

  IF TG_OP = 'INSERT' THEN
    IF current_user IS DISTINCT FROM v_table_owner THEN
      IF current_user::text <> 'authenticated' OR auth.uid() IS NULL THEN
        RAISE EXCEPTION 'scope_change_request_direct_insert_requires_authenticated_role'
          USING ERRCODE = 'insufficient_privilege';
      END IF;

      IF NEW.requested_by IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'scope_change_request_requested_by_must_match_actor'
          USING ERRCODE = 'insufficient_privilege';
      END IF;

      IF NEW.request_origin IS DISTINCT FROM 'designer_amendment' THEN
        RAISE EXCEPTION 'scope_change_request_direct_insert_origin_forbidden'
          USING ERRCODE = 'insufficient_privilege';
      END IF;

      SELECT project.designer_id, project.studio_id
      INTO v_project_designer, v_studio_id
      FROM public.projects AS project
      WHERE project.id = NEW.project_id
      FOR SHARE OF project;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'scope_change_request_direct_insert_requires_project_studio'
          USING ERRCODE = 'insufficient_privilege';
      END IF;

      IF v_project_designer IS DISTINCT FROM auth.uid() THEN
        PERFORM 1
        FROM public.organizations AS organization
        WHERE organization.id = v_studio_id
          AND organization.type = 'design_studio'
          AND organization.status = 'active'
        FOR SHARE OF organization;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'scope_change_request_direct_insert_requires_project_studio'
            USING ERRCODE = 'insufficient_privilege';
        END IF;

        PERFORM 1
        FROM public.organization_members AS membership
        WHERE membership.organization_id = v_studio_id
          AND membership.user_id = auth.uid()
          AND membership.status = 'active'
          AND membership.role <> 'guest'
        FOR SHARE OF membership;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'scope_change_request_direct_insert_requires_project_studio'
            USING ERRCODE = 'insufficient_privilege';
        END IF;
      END IF;

    -- Only a checked owner-executed authority may create lifecycle evidence.
    -- Direct designer/studio writes can compose drafts but cannot fabricate
    -- something sent, signed, resolved, or applied.
      IF (
        NEW.status <> 'draft'
         OR NEW.sent_at IS NOT NULL
         OR NEW.viewed_at IS NOT NULL
         OR NEW.approved_at IS NOT NULL
         OR NEW.approved_by IS NOT NULL
         OR NEW.approved_by_name IS NOT NULL
         OR NEW.approved_ip IS NOT NULL
         OR NEW.declined_at IS NOT NULL
         OR NEW.decline_reason IS NOT NULL
         OR NEW.applied_at IS NOT NULL
         OR NEW.signed_pdf_url IS NOT NULL
         OR NEW.signature_metadata IS NOT NULL
        )
      THEN
        RAISE EXCEPTION 'scope_change_request_direct_inserts_must_be_clean_drafts'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Scope identity and commercial content are append-only evidence. A new
  -- intent is a new row; even a checked status authority cannot rewrite it.
  IF ROW(
    NEW.id,
    NEW.project_id,
    NEW.proposal_id,
    NEW.requested_by,
    NEW.request_origin,
    NEW.title,
    NEW.description,
    NEW.additional_ffe_budget_cents,
    NEW.additional_design_fee_cents,
    NEW.timeline_impact_weeks,
    NEW.new_total_budget_cents,
    NEW.new_rooms,
    NEW.new_ffe_items,
    NEW.co_number,
    NEW.original_spec,
    NEW.requested_change,
    NEW.affected_tasks,
    NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.id,
    OLD.project_id,
    OLD.proposal_id,
    OLD.requested_by,
    OLD.request_origin,
    OLD.title,
    OLD.description,
    OLD.additional_ffe_budget_cents,
    OLD.additional_design_fee_cents,
    OLD.timeline_impact_weeks,
    OLD.new_total_budget_cents,
    OLD.new_rooms,
    OLD.new_ffe_items,
    OLD.co_number,
    OLD.original_spec,
    OLD.requested_change,
    OLD.affected_tasks,
    OLD.created_at
  ) THEN
    RAISE EXCEPTION 'scope_change_request_business_fields_immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  -- updated_at is maintained by the pre-existing set_updated_at trigger and is
  -- intentionally absent. If no workflow field moved, there is nothing else
  -- for this guard to authorize.
  IF ROW(
    NEW.status,
    NEW.sent_at,
    NEW.viewed_at,
    NEW.approved_at,
    NEW.approved_by,
    NEW.approved_by_name,
    NEW.approved_ip,
    NEW.declined_at,
    NEW.decline_reason,
    NEW.applied_at,
    NEW.signed_pdf_url,
    NEW.signature_metadata
  ) IS NOT DISTINCT FROM ROW(
    OLD.status,
    OLD.sent_at,
    OLD.viewed_at,
    OLD.approved_at,
    OLD.approved_by,
    OLD.approved_by_name,
    OLD.approved_ip,
    OLD.declined_at,
    OLD.decline_reason,
    OLD.applied_at,
    OLD.signed_pdf_url,
    OLD.signature_metadata
  ) THEN
    RETURN NEW;
  END IF;

  IF current_user IS DISTINCT FROM v_table_owner THEN
    RAISE EXCEPTION 'scope_change_request_transition_requires_checked_authority'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Scope the marker to one transition, one request row, and this transaction.
  -- Even owner-executed nested code cannot reuse an authority on a sibling row.
  IF v_authority_token = format(
    'send:%s:%s', NEW.id, pg_catalog.txid_current()
  ) THEN
    v_transition := 'send';
  ELSIF v_authority_token = format(
    'view:%s:%s', NEW.id, pg_catalog.txid_current()
  ) THEN
    v_transition := 'view';
  ELSIF v_authority_token = format(
    'approve:%s:%s', NEW.id, pg_catalog.txid_current()
  ) THEN
    v_transition := 'approve';
  ELSIF v_authority_token = format(
    'decline:%s:%s', NEW.id, pg_catalog.txid_current()
  ) THEN
    v_transition := 'decline';
  ELSIF v_authority_token = format(
    'cancel:%s:%s', NEW.id, pg_catalog.txid_current()
  ) THEN
    v_transition := 'cancel';
  ELSIF v_authority_token = format(
    'apply:%s:%s', NEW.id, pg_catalog.txid_current()
  ) THEN
    v_transition := 'apply';
  ELSE
    RAISE EXCEPTION 'scope_change_request_transition_requires_row_scoped_authority'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  CASE v_transition
    WHEN 'send' THEN
      IF NOT (
        OLD.status = 'draft'
        AND NEW.status = 'sent'
        AND NEW.sent_at IS NOT NULL
        AND ROW(
          NEW.viewed_at,
          NEW.approved_at,
          NEW.approved_by,
          NEW.approved_by_name,
          NEW.approved_ip,
          NEW.declined_at,
          NEW.decline_reason,
          NEW.applied_at,
          NEW.signed_pdf_url,
          NEW.signature_metadata
        ) IS NOT DISTINCT FROM ROW(
          OLD.viewed_at,
          OLD.approved_at,
          OLD.approved_by,
          OLD.approved_by_name,
          OLD.approved_ip,
          OLD.declined_at,
          OLD.decline_reason,
          OLD.applied_at,
          OLD.signed_pdf_url,
          OLD.signature_metadata
        )
      ) THEN
        RAISE EXCEPTION 'scope_change_request_invalid_send_transition'
          USING ERRCODE = 'check_violation';
      END IF;

    WHEN 'view' THEN
      IF NOT (
        OLD.status = 'sent'
        AND NEW.status = 'viewed'
        AND NEW.viewed_at IS NOT NULL
        AND ROW(
          NEW.sent_at,
          NEW.approved_at,
          NEW.approved_by,
          NEW.approved_by_name,
          NEW.approved_ip,
          NEW.declined_at,
          NEW.decline_reason,
          NEW.applied_at,
          NEW.signed_pdf_url,
          NEW.signature_metadata
        ) IS NOT DISTINCT FROM ROW(
          OLD.sent_at,
          OLD.approved_at,
          OLD.approved_by,
          OLD.approved_by_name,
          OLD.approved_ip,
          OLD.declined_at,
          OLD.decline_reason,
          OLD.applied_at,
          OLD.signed_pdf_url,
          OLD.signature_metadata
        )
      ) THEN
        RAISE EXCEPTION 'scope_change_request_invalid_view_transition'
          USING ERRCODE = 'check_violation';
      END IF;

    WHEN 'approve' THEN
      IF NOT (
        OLD.status IN ('sent', 'viewed')
        AND NEW.status = 'approved'
        AND NEW.approved_at IS NOT NULL
        AND NEW.approved_by = auth.uid()
        AND btrim(COALESCE(NEW.approved_by_name, '')) <> ''
        AND ROW(
          NEW.sent_at,
          NEW.viewed_at,
          NEW.declined_at,
          NEW.decline_reason,
          NEW.applied_at,
          NEW.signed_pdf_url,
          NEW.signature_metadata
        ) IS NOT DISTINCT FROM ROW(
          OLD.sent_at,
          OLD.viewed_at,
          OLD.declined_at,
          OLD.decline_reason,
          OLD.applied_at,
          OLD.signed_pdf_url,
          OLD.signature_metadata
        )
      ) THEN
        RAISE EXCEPTION 'scope_change_request_invalid_approve_transition'
          USING ERRCODE = 'check_violation';
      END IF;

    WHEN 'decline' THEN
      IF NOT (
        OLD.status IN ('sent', 'viewed')
        AND NEW.status = 'declined'
        AND NEW.declined_at IS NOT NULL
        AND ROW(
          NEW.sent_at,
          NEW.viewed_at,
          NEW.approved_at,
          NEW.approved_by,
          NEW.approved_by_name,
          NEW.approved_ip,
          NEW.applied_at,
          NEW.signed_pdf_url,
          NEW.signature_metadata
        ) IS NOT DISTINCT FROM ROW(
          OLD.sent_at,
          OLD.viewed_at,
          OLD.approved_at,
          OLD.approved_by,
          OLD.approved_by_name,
          OLD.approved_ip,
          OLD.applied_at,
          OLD.signed_pdf_url,
          OLD.signature_metadata
        )
      ) THEN
        RAISE EXCEPTION 'scope_change_request_invalid_decline_transition'
          USING ERRCODE = 'check_violation';
      END IF;

    WHEN 'cancel' THEN
      IF NOT (
        OLD.status IN ('draft', 'sent', 'viewed')
        AND NEW.status = 'cancelled'
        AND ROW(
          NEW.sent_at,
          NEW.viewed_at,
          NEW.approved_at,
          NEW.approved_by,
          NEW.approved_by_name,
          NEW.approved_ip,
          NEW.declined_at,
          NEW.decline_reason,
          NEW.applied_at,
          NEW.signed_pdf_url,
          NEW.signature_metadata
        ) IS NOT DISTINCT FROM ROW(
          OLD.sent_at,
          OLD.viewed_at,
          OLD.approved_at,
          OLD.approved_by,
          OLD.approved_by_name,
          OLD.approved_ip,
          OLD.declined_at,
          OLD.decline_reason,
          OLD.applied_at,
          OLD.signed_pdf_url,
          OLD.signature_metadata
        )
      ) THEN
        RAISE EXCEPTION 'scope_change_request_invalid_cancel_transition'
          USING ERRCODE = 'check_violation';
      END IF;

    WHEN 'apply' THEN
      IF NOT (
        OLD.status = 'approved'
        AND NEW.status = 'approved'
        AND OLD.applied_at IS NULL
        AND NEW.applied_at IS NOT NULL
        AND ROW(
          NEW.sent_at,
          NEW.viewed_at,
          NEW.approved_at,
          NEW.approved_by,
          NEW.approved_by_name,
          NEW.approved_ip,
          NEW.declined_at,
          NEW.decline_reason,
          NEW.signed_pdf_url,
          NEW.signature_metadata
        ) IS NOT DISTINCT FROM ROW(
          OLD.sent_at,
          OLD.viewed_at,
          OLD.approved_at,
          OLD.approved_by,
          OLD.approved_by_name,
          OLD.approved_ip,
          OLD.declined_at,
          OLD.decline_reason,
          OLD.signed_pdf_url,
          OLD.signature_metadata
        )
      ) THEN
        RAISE EXCEPTION 'scope_change_request_invalid_apply_transition'
          USING ERRCODE = 'check_violation';
      END IF;
  END CASE;

  RETURN NEW;
END;
$$;


REVOKE ALL PRIVILEGES ON FUNCTION
  public.guard_scope_change_request_integrity()
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;

DROP TRIGGER IF EXISTS guard_scope_change_request_integrity
  ON public.scope_change_requests;
CREATE TRIGGER guard_scope_change_request_integrity
  BEFORE INSERT OR UPDATE ON public.scope_change_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_scope_change_request_integrity();

CREATE OR REPLACE FUNCTION public.send_scope_change_request(
  p_request_id uuid,
  p_project_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_request public.scope_change_requests%ROWTYPE;
  v_previous_transition text := current_setting(
    'app.scope_change_transition', true
  );
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'send_scope_change_request requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id
  FOR UPDATE;
  IF NOT FOUND OR NOT public._scope_change_requester_can_author(
    v_actor, v_project.designer_id, v_project.id
  ) THEN
    RAISE EXCEPTION 'send_scope_change_request: project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_project.status IN ('completed', 'archived') THEN
    RAISE EXCEPTION 'send_scope_change_request: completed_project'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_request
  FROM public.scope_change_requests
  WHERE id = p_request_id
    AND project_id = p_project_id
  FOR UPDATE;
  IF NOT FOUND
     OR v_request.status <> 'draft'
     OR v_request.request_origin IS DISTINCT FROM 'designer_amendment'
     OR NOT public._scope_change_requester_can_author(
       v_request.requested_by, v_project.designer_id, v_project.id
     )
  THEN
    RAISE EXCEPTION 'send_scope_change_request: request not found or invalid state'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config(
    'app.scope_change_transition',
    format('send:%s:%s', p_request_id, pg_catalog.txid_current()), true
  );
  UPDATE public.scope_change_requests
  SET status = 'sent', sent_at = now()
  WHERE id = p_request_id
  RETURNING * INTO v_request;
  PERFORM set_config(
    'app.scope_change_transition', COALESCE(v_previous_transition, ''), true
  );

  RETURN jsonb_build_object(
    'id', v_request.id, 'project_id', v_request.project_id,
    'status', v_request.status, 'sent_at', v_request.sent_at
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.scope_change_transition', COALESCE(v_previous_transition, ''), true
  );
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_scope_change_request(
  p_request_id uuid,
  p_project_id uuid,
  p_approved_by_name text,
  p_approved_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_request public.scope_change_requests%ROWTYPE;
  v_approved_by_name text := btrim(COALESCE(p_approved_by_name, ''));
  v_previous_transition text := current_setting(
    'app.scope_change_transition', true
  );
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'approve_scope_change_request requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_approved_by_name = '' THEN
    RAISE EXCEPTION 'approve_scope_change_request: signer name required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id
    AND client_id = v_actor
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'approve_scope_change_request: project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_request
  FROM public.scope_change_requests
  WHERE id = p_request_id
    AND project_id = p_project_id
  FOR UPDATE;
  IF NOT FOUND
     OR v_request.request_origin IS DISTINCT FROM 'designer_amendment'
     OR v_request.requested_by IS NOT DISTINCT FROM v_actor
     OR NOT public._scope_change_requester_can_author(
       v_request.requested_by, v_project.designer_id, v_project.id
     )
     OR v_request.status NOT IN ('sent', 'viewed')
  THEN
    RAISE EXCEPTION 'approve_scope_change_request: request not found or invalid state'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config(
    'app.scope_change_transition',
    format('approve:%s:%s', p_request_id, pg_catalog.txid_current()), true
  );
  UPDATE public.scope_change_requests
  SET status = 'approved',
      approved_at = now(),
      approved_by = v_actor,
      approved_by_name = v_approved_by_name,
      approved_ip = NULLIF(btrim(COALESCE(p_approved_ip, '')), '')
  WHERE id = p_request_id
  RETURNING * INTO v_request;
  PERFORM set_config(
    'app.scope_change_transition', COALESCE(v_previous_transition, ''), true
  );

  RETURN jsonb_build_object(
    'id', v_request.id, 'project_id', v_request.project_id,
    'status', v_request.status, 'approved_at', v_request.approved_at
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.scope_change_transition', COALESCE(v_previous_transition, ''), true
  );
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_client_scope_change_request(
  p_request_id uuid,
  p_project_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_project public.projects%ROWTYPE;
  v_request public.scope_change_requests%ROWTYPE;
  v_previous_transition text := current_setting(
    'app.scope_change_transition', true
  );
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'accept_client_scope_change_request requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id
  FOR UPDATE;
  IF NOT FOUND OR NOT public._scope_change_requester_can_author(
    v_actor, v_project.designer_id, v_project.id
  ) THEN
    RAISE EXCEPTION
      'accept_client_scope_change_request: project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_project.status IN ('completed', 'archived') THEN
    RAISE EXCEPTION 'accept_client_scope_change_request: completed_project'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_request
  FROM public.scope_change_requests
  WHERE id = p_request_id
    AND project_id = p_project_id
  FOR UPDATE;
  IF NOT FOUND
     OR v_request.request_origin IS DISTINCT FROM 'client_request'
     OR v_project.client_id IS NULL
     OR v_request.requested_by IS DISTINCT FROM v_project.client_id
     OR v_request.status NOT IN ('sent', 'viewed')
  THEN
    RAISE EXCEPTION
      'accept_client_scope_change_request: request not found or invalid state'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(NULLIF(btrim(profile.full_name), ''), 'Designer')
  INTO v_actor_name
  FROM public.profiles AS profile
  WHERE profile.id = v_actor;
  v_actor_name := COALESCE(v_actor_name, 'Designer');

  PERFORM set_config(
    'app.scope_change_transition',
    format('approve:%s:%s', p_request_id, pg_catalog.txid_current()), true
  );
  UPDATE public.scope_change_requests
  SET status = 'approved', approved_at = now(), approved_by = v_actor,
      approved_by_name = v_actor_name, approved_ip = NULL
  WHERE id = p_request_id
  RETURNING * INTO v_request;
  PERFORM set_config(
    'app.scope_change_transition', COALESCE(v_previous_transition, ''), true
  );

  RETURN jsonb_build_object(
    'id', v_request.id, 'project_id', v_request.project_id,
    'status', v_request.status, 'approved_at', v_request.approved_at
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.scope_change_transition', COALESCE(v_previous_transition, ''), true
  );
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_scope_change_request(
  p_request_id uuid,
  p_project_id uuid,
  p_decline_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_request public.scope_change_requests%ROWTYPE;
  v_previous_transition text := current_setting(
    'app.scope_change_transition', true
  );
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'decline_scope_change_request requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id
    AND client_id = v_actor
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'decline_scope_change_request: project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_request
  FROM public.scope_change_requests
  WHERE id = p_request_id
    AND project_id = p_project_id
  FOR UPDATE;
  IF NOT FOUND
     OR v_request.request_origin IS DISTINCT FROM 'designer_amendment'
     OR v_request.requested_by IS NOT DISTINCT FROM v_actor
     OR NOT public._scope_change_requester_can_author(
       v_request.requested_by, v_project.designer_id, v_project.id
     )
     OR v_request.status NOT IN ('sent', 'viewed')
  THEN
    RAISE EXCEPTION 'decline_scope_change_request: request not found or invalid state'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config(
    'app.scope_change_transition',
    format('decline:%s:%s', p_request_id, pg_catalog.txid_current()), true
  );
  UPDATE public.scope_change_requests
  SET status = 'declined', declined_at = now(),
      decline_reason = NULLIF(btrim(COALESCE(p_decline_reason, '')), '')
  WHERE id = p_request_id
  RETURNING * INTO v_request;
  PERFORM set_config(
    'app.scope_change_transition', COALESCE(v_previous_transition, ''), true
  );

  RETURN jsonb_build_object(
    'id', v_request.id, 'project_id', v_request.project_id,
    'status', v_request.status, 'declined_at', v_request.declined_at
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.scope_change_transition', COALESCE(v_previous_transition, ''), true
  );
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_scope_change_request(
  p_request_id uuid,
  p_project_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_request public.scope_change_requests%ROWTYPE;
  v_previous_transition text := current_setting(
    'app.scope_change_transition', true
  );
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'cancel_scope_change_request requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cancel_scope_change_request: project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_request
  FROM public.scope_change_requests
  WHERE id = p_request_id
    AND project_id = p_project_id
    AND requested_by = v_actor
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cancel_scope_change_request: request not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (
    v_project.client_id IS NOT DISTINCT FROM v_actor
    OR public._scope_change_requester_can_author(
      v_actor, v_project.designer_id, v_project.id
    )
  ) THEN
    RAISE EXCEPTION 'cancel_scope_change_request: access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_request.status NOT IN ('draft', 'sent', 'viewed') THEN
    RAISE EXCEPTION 'cancel_scope_change_request: invalid state'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config(
    'app.scope_change_transition',
    format('cancel:%s:%s', p_request_id, pg_catalog.txid_current()), true
  );
  UPDATE public.scope_change_requests
  SET status = 'cancelled'
  WHERE id = p_request_id
  RETURNING * INTO v_request;
  PERFORM set_config(
    'app.scope_change_transition', COALESCE(v_previous_transition, ''), true
  );

  RETURN jsonb_build_object(
    'id', v_request.id, 'project_id', v_request.project_id,
    'status', v_request.status
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.scope_change_transition', COALESCE(v_previous_transition, ''), true
  );
  RAISE;
END;
$$;

REVOKE ALL PRIVILEGES ON FUNCTION
  public.send_scope_change_request(uuid, uuid),
  public.approve_scope_change_request(uuid, uuid, text, text),
  public.accept_client_scope_change_request(uuid, uuid),
  public.decline_scope_change_request(uuid, uuid, text),
  public.cancel_scope_change_request(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION
  public.send_scope_change_request(uuid, uuid),
  public.approve_scope_change_request(uuid, uuid, text, text),
  public.accept_client_scope_change_request(uuid, uuid),
  public.decline_scope_change_request(uuid, uuid, text),
  public.cancel_scope_change_request(uuid, uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.activate_project_v2(input jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_project_id uuid := extensions.gen_random_uuid();
  v_caller_id uuid := auth.uid();
  v_client_id uuid;
  v_studio_id uuid;
  v_room jsonb;
  v_phase jsonb;
  v_milestone jsonb;
  v_team jsonb;
  v_team_user_id uuid;
  v_team_role text;
  v_seen_team uuid[] := ARRAY[]::uuid[];
  v_kickoff date;
  v_expected_completion date;
  v_total_weeks integer := 0;
  v_phase_running_date date;
  v_phase_idx integer := 0;
  v_room_idx integer := 0;
  v_milestone_idx integer := 0;
  v_new_phase_id uuid;
  v_previous_phase_id uuid := NULL;
  v_previous_phase_batch text := current_setting(
    'app.project_phase_batch_token', true
  );
  v_phase_batch_set boolean := false;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'project creation not permitted'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_client_id := NULLIF(input->>'client_id', '')::uuid;
  v_studio_id := NULLIF(input->>'studio_id', '')::uuid;

  PERFORM 1
  FROM public.user_roles AS user_role
  JOIN public.roles AS role_row ON role_row.id = user_role.role_id
  WHERE user_role.user_id = v_caller_id
    AND role_row.domain::text = 'designer'
  ORDER BY user_role.id
  LIMIT 1
  FOR UPDATE OF user_role, role_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project creation not permitted'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_client_id IS NOT NULL THEN
    PERFORM 1
    FROM public.designer_clients AS relationship
    WHERE relationship.designer_id = v_caller_id
      AND relationship.client_id = v_client_id
      AND relationship.status IN ('lead', 'proposal', 'active')
    ORDER BY relationship.created_at, relationship.id
    LIMIT 1
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'project creation not permitted'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  SELECT organization.id
  INTO v_studio_id
  FROM public.organizations AS organization
  JOIN public.organization_members AS membership
    ON membership.organization_id = organization.id
  WHERE (v_studio_id IS NULL OR organization.id = v_studio_id)
    AND organization.type = 'design_studio'
    AND organization.status = 'active'
    AND membership.user_id = v_caller_id
    AND membership.status = 'active'
    AND membership.role IN ('owner', 'admin', 'member')
  ORDER BY
    CASE membership.role
      WHEN 'owner' THEN 0
      WHEN 'admin' THEN 1
      ELSE 2
    END,
    membership.created_at,
    organization.id
  LIMIT 1
  FOR UPDATE OF organization, membership;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project creation not permitted'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  FOR v_team IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(input->'team', '[]'::jsonb))
  LOOP
    v_team_user_id := NULLIF(v_team->>'user_id', '')::uuid;
    v_team_role := v_team->>'role';

    IF v_team_user_id IS NULL
       OR v_team_user_id = v_caller_id
       OR v_team_user_id = ANY(v_seen_team)
       OR v_team_role IS NULL
       OR v_team_role NOT IN ('support_designer', 'bookkeeper')
    THEN
      RAISE EXCEPTION 'project creation not permitted'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    PERFORM 1
    FROM public.organization_members AS membership
    WHERE membership.organization_id = v_studio_id
      AND membership.user_id = v_team_user_id
      AND membership.status = 'active'
      AND membership.role IN ('owner', 'admin', 'member')
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'project creation not permitted'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_seen_team := array_append(v_seen_team, v_team_user_id);
  END LOOP;

  IF COALESCE(trim(input->>'name'), '') = '' THEN
    RAISE EXCEPTION 'activate_project_v2: name is required';
  END IF;

  v_kickoff := COALESCE((input->>'kickoff_date')::date, current_date);
  SELECT COALESCE(sum((phase->>'duration_weeks')::integer), 0)
  INTO v_total_weeks
  FROM jsonb_array_elements(
    COALESCE(input->'phases', '[]'::jsonb)
  ) AS phase;
  v_expected_completion := v_kickoff + (v_total_weeks * 7);

  PERFORM set_config(
    'app.project_phase_batch_token',
    format(
      'project_phase_batch:%s:%s',
      v_project_id,
      pg_catalog.txid_current()
    ),
    true
  );
  v_phase_batch_set := true;

  INSERT INTO public.projects (
    id,
    name,
    status,
    budget_cents,
    design_fee_cents,
    client_visibility_tier,
    client_id,
    designer_id,
    studio_id,
    start_date,
    target_end_date,
    created_by
  ) VALUES (
    v_project_id,
    input->>'name',
    'active',
    COALESCE((input->>'budget_total_cents')::integer, 0),
    COALESCE((input->>'design_fee_cents')::integer, 0),
    COALESCE(input->>'client_visibility_tier', 'milestone'),
    v_client_id,
    v_caller_id,
    v_studio_id,
    v_kickoff,
    v_expected_completion,
    v_caller_id
  );

  FOR v_room IN
    SELECT *
    FROM jsonb_array_elements(COALESCE(input->'rooms', '[]'::jsonb))
  LOOP
    INSERT INTO public.project_rooms (
      project_id,
      name,
      room_type,
      dimensions,
      budget_cents,
      ffe_categories,
      notes,
      sort_order
    ) VALUES (
      v_project_id,
      v_room->>'name',
      NULLIF(v_room->>'room_type', ''),
      NULLIF(v_room->>'dimensions', ''),
      COALESCE((v_room->>'budget_cents')::integer, 0),
      ARRAY(
        SELECT jsonb_array_elements_text(
          COALESCE(v_room->'ffe_categories', '[]'::jsonb)
        )
      ),
      NULLIF(v_room->>'notes', ''),
      COALESCE((v_room->>'sort_order')::integer, v_room_idx)
    );
    v_room_idx := v_room_idx + 1;
  END LOOP;

  v_phase_running_date := v_kickoff;
  FOR v_phase IN
    SELECT *
    FROM jsonb_array_elements(COALESCE(input->'phases', '[]'::jsonb))
  LOOP
    INSERT INTO public.project_phases (
      project_id,
      name,
      duration_weeks,
      fee_cents,
      gate_condition,
      start_date,
      target_end_date,
      sort_order
    ) VALUES (
      v_project_id,
      v_phase->>'name',
      COALESCE((v_phase->>'duration_weeks')::integer, 0),
      COALESCE((v_phase->>'fee_cents')::integer, 0),
      NULLIF(v_phase->>'gate_condition', ''),
      v_phase_running_date,
      v_phase_running_date +
        (COALESCE((v_phase->>'duration_weeks')::integer, 0) * 7),
      COALESCE((v_phase->>'sort_order')::integer, v_phase_idx)
    )
    RETURNING id INTO v_new_phase_id;

    IF v_previous_phase_id IS NOT NULL THEN
      UPDATE public.project_phases
      SET follows_phase_id = v_previous_phase_id
      WHERE id = v_new_phase_id
        AND project_id = v_project_id;
    END IF;

    v_previous_phase_id := v_new_phase_id;
    v_phase_running_date := v_phase_running_date +
      (COALESCE((v_phase->>'duration_weeks')::integer, 0) * 7);
    v_phase_idx := v_phase_idx + 1;
  END LOOP;

  PERFORM public._assert_project_phase_topology(
    v_project_id,
    'activate_project_v2'
  );

  FOR v_milestone IN
    SELECT *
    FROM jsonb_array_elements(COALESCE(input->'milestones', '[]'::jsonb))
  LOOP
    INSERT INTO public.project_payment_milestones (
      project_id,
      label,
      percentage,
      amount_cents,
      trigger_condition,
      sort_order
    ) VALUES (
      v_project_id,
      NULLIF(v_milestone->>'label', ''),
      COALESCE((v_milestone->>'percentage')::numeric, 0),
      COALESCE((v_milestone->>'amount_cents')::integer, 0),
      NULLIF(v_milestone->>'trigger_condition', ''),
      COALESCE((v_milestone->>'sort_order')::integer, v_milestone_idx)
    );
    v_milestone_idx := v_milestone_idx + 1;
  END LOOP;

  INSERT INTO public.project_team_members (
    project_id,
    user_id,
    role,
    assigned_by
  ) VALUES (
    v_project_id,
    v_caller_id,
    'lead_designer',
    v_caller_id
  )
  ON CONFLICT DO NOTHING;

  FOR v_team IN
    SELECT *
    FROM jsonb_array_elements(COALESCE(input->'team', '[]'::jsonb))
  LOOP
    INSERT INTO public.project_team_members (
      project_id,
      user_id,
      role,
      assigned_by
    ) VALUES (
      v_project_id,
      (v_team->>'user_id')::uuid,
      v_team->>'role',
      v_caller_id
    );
  END LOOP;

  PERFORM set_config(
    'app.project_phase_batch_token',
    COALESCE(v_previous_phase_batch, ''),
    true
  );
  v_phase_batch_set := false;
  RETURN v_project_id;
EXCEPTION WHEN OTHERS THEN
  IF v_phase_batch_set THEN
    PERFORM set_config(
      'app.project_phase_batch_token',
      COALESCE(v_previous_phase_batch, ''),
      true
    );
  END IF;
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.read_proposal_send_dispatch(
  p_dispatch_id uuid,
  p_proposal_id uuid,
  p_sent_at timestamptz
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
    RAISE EXCEPTION 'read_proposal_send_dispatch requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_dispatch
  FROM public.proposal_send_dispatches
  WHERE id = p_dispatch_id
    AND proposal_id = p_proposal_id
    AND sent_at = p_sent_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal send nonce/timestamp mismatch'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'id', v_dispatch.id,
    'proposal_id', v_dispatch.proposal_id,
    'sent_at', v_dispatch.sent_at,
    'designer_id', v_dispatch.designer_id,
    'client_id', v_dispatch.client_id,
    'delivery_state', v_dispatch.state,
    'attempt_count', v_dispatch.provider_attempt_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_proposal_send_dispatch(
  p_dispatch_id uuid,
  p_proposal_id uuid,
  p_sent_at timestamptz,
  p_lease_seconds integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_dispatch public.proposal_send_dispatches%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_lease_seconds integer := LEAST(
    60,
    GREATEST(15, COALESCE(p_lease_seconds, 30))
  );
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'claim_proposal_send_dispatch requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_dispatch_id IS NULL OR p_proposal_id IS NULL OR p_sent_at IS NULL THEN
    RAISE EXCEPTION 'dispatch id, proposal id, and sent_at are required'
      USING ERRCODE = 'not_null_violation';
  END IF;

  SELECT * INTO v_dispatch
  FROM public.proposal_send_dispatches
  WHERE id = p_dispatch_id
    AND proposal_id = p_proposal_id
    AND sent_at = p_sent_at
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal send nonce/timestamp mismatch'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_dispatch.state = 'in_flight'
     AND v_dispatch.lease_expires_at > v_now
  THEN
    RETURN jsonb_build_object(
      'claimed', false,
      'delivery_state', 'in_flight',
      'attempt_count', v_dispatch.provider_attempt_count
    );
  END IF;

  IF v_dispatch.state = 'in_flight' THEN
    UPDATE public.proposal_send_dispatches
    SET state = CASE
          WHEN provider_started_at IS NULL
            THEN COALESCE(claimed_from_state, 'pending')
          ELSE 'ambiguous'
        END,
        claim_token = NULL,
        lease_expires_at = NULL,
        claimed_from_state = NULL,
        updated_at = v_now,
        last_error = CASE
          WHEN provider_started_at IS NULL THEN last_error
          ELSE COALESCE(last_error, 'provider attempt lease expired')
        END
    WHERE id = v_dispatch.id
    RETURNING * INTO v_dispatch;
  END IF;

  IF v_dispatch.state = 'ambiguous'
     AND (
       v_dispatch.provider_attempt_count >= 3
       OR (
         v_dispatch.provider_attempt_count > 0
         AND v_dispatch.retry_deadline IS NULL
       )
       OR v_dispatch.retry_deadline <= v_now
     )
  THEN
    UPDATE public.proposal_send_dispatches
    SET state = 'unconfirmed',
        claim_token = NULL,
        lease_expires_at = NULL,
        claimed_from_state = NULL,
        last_error = COALESCE(
          last_error,
          'provider delivery could not be confirmed before retry exhaustion'
        ),
        updated_at = v_now
    WHERE id = v_dispatch.id
    RETURNING * INTO v_dispatch;

    PERFORM public._sync_proposal_send_email_log(v_dispatch.id);

    RETURN jsonb_build_object(
      'claimed', false,
      'delivery_state', v_dispatch.state,
      'attempt_count', v_dispatch.provider_attempt_count,
      'retry_exhausted', true,
      'last_error', v_dispatch.last_error
    );
  END IF;

  IF v_dispatch.state IN ('delivered', 'suppressed', 'unconfirmed') THEN
    RETURN jsonb_build_object(
      'claimed', false,
      'delivery_state', v_dispatch.state,
      'attempt_count', v_dispatch.provider_attempt_count,
      'retry_exhausted', v_dispatch.state = 'unconfirmed',
      'provider_id', v_dispatch.provider_id
    );
  END IF;

  IF v_dispatch.state = 'failed'
     AND (
       v_dispatch.provider_attempt_count >= 3
       OR (
         v_dispatch.provider_attempt_count > 0
         AND v_dispatch.retry_deadline IS NULL
       )
       OR v_dispatch.retry_deadline <= v_now
     )
  THEN
    RETURN jsonb_build_object(
      'claimed', false,
      'delivery_state', v_dispatch.state,
      'attempt_count', v_dispatch.provider_attempt_count,
      'retry_exhausted', true,
      'last_error', v_dispatch.last_error
    );
  END IF;

  UPDATE public.proposal_send_dispatches
  SET state = 'in_flight',
      claim_token = gen_random_uuid(),
      lease_expires_at = v_now + make_interval(secs => v_lease_seconds),
      claimed_from_state = v_dispatch.state,
      provider_started_at = NULL,
      updated_at = v_now
  WHERE id = v_dispatch.id
  RETURNING * INTO v_dispatch;

  RETURN jsonb_build_object(
    'claimed', true,
    'delivery_state', 'in_flight',
    'claim_token', v_dispatch.claim_token,
    'attempt_count', v_dispatch.provider_attempt_count,
    'previous_delivery_state', v_dispatch.claimed_from_state,
    'retry_deadline', v_dispatch.retry_deadline,
    'provider_idempotency_key', v_dispatch.provider_idempotency_key,
    'provider_request_body', v_dispatch.provider_request_body,
    'provider_from', v_dispatch.provider_from,
    'provider_to', v_dispatch.provider_to,
    'provider_cc', v_dispatch.provider_cc,
    'provider_subject', v_dispatch.provider_subject,
    'provider_dry_run', v_dispatch.provider_dry_run,
    'dispatch', jsonb_build_object(
      'id', v_dispatch.id,
      'proposal_id', v_dispatch.proposal_id,
      'sent_at', v_dispatch.sent_at,
      'designer_id', v_dispatch.designer_id,
      'client_id', v_dispatch.client_id,
      'project_id', v_dispatch.project_id,
      'proposal_title', v_dispatch.proposal_title,
      'personal_message', v_dispatch.personal_message,
      'cc_email', v_dispatch.cc_email,
      'valid_until', v_dispatch.valid_until,
      'total_amount', v_dispatch.total_amount,
      'recipient_email', v_dispatch.recipient_email,
      'recipient_name', v_dispatch.recipient_name,
      'designer_name', v_dispatch.designer_name,
      'sender_name', v_dispatch.sender_name,
      'studio_name', v_dispatch.studio_name,
      'studio_logo_url', v_dispatch.studio_logo_url,
      'client_portal_path', v_dispatch.client_portal_path
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.persist_proposal_send_request(
  p_dispatch_id uuid,
  p_claim_token uuid,
  p_request_body text,
  p_from text,
  p_to text[],
  p_cc text[],
  p_subject text,
  p_dry_run boolean
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
    RAISE EXCEPTION 'persist_proposal_send_request requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_request_body IS NULL OR p_request_body = ''
     OR p_from IS NULL OR btrim(p_from) = ''
     OR p_to IS NULL OR cardinality(p_to) = 0
     OR p_subject IS NULL OR btrim(p_subject) = ''
     OR p_dry_run IS NULL
  THEN
    RAISE EXCEPTION 'complete provider request fields are required'
      USING ERRCODE = 'not_null_violation';
  END IF;

  SELECT * INTO v_dispatch
  FROM public.proposal_send_dispatches
  WHERE id = p_dispatch_id
    AND claim_token = p_claim_token
    AND state = 'in_flight'
    AND lease_expires_at > clock_timestamp()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal send claim is stale or missing'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF v_dispatch.provider_request_body IS NULL THEN
    UPDATE public.proposal_send_dispatches
    SET provider_request_body = p_request_body,
        provider_from = p_from,
        provider_to = p_to,
        provider_cc = p_cc,
        provider_subject = p_subject,
        provider_dry_run = p_dry_run,
        request_persisted_at = clock_timestamp(),
        updated_at = clock_timestamp()
    WHERE id = v_dispatch.id
    RETURNING * INTO v_dispatch;
  ELSIF v_dispatch.provider_request_body IS DISTINCT FROM p_request_body
     OR v_dispatch.provider_from IS DISTINCT FROM p_from
     OR v_dispatch.provider_to IS DISTINCT FROM p_to
     OR v_dispatch.provider_cc IS DISTINCT FROM p_cc
     OR v_dispatch.provider_subject IS DISTINCT FROM p_subject
     OR v_dispatch.provider_dry_run IS DISTINCT FROM p_dry_run
  THEN
    RAISE EXCEPTION 'persisted proposal provider request is immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'body', v_dispatch.provider_request_body,
    'from', v_dispatch.provider_from,
    'to', v_dispatch.provider_to,
    'cc', v_dispatch.provider_cc,
    'subject', v_dispatch.provider_subject,
    'dry_run', v_dispatch.provider_dry_run,
    'idempotency_key', v_dispatch.provider_idempotency_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_proposal_send_email_log(p_dispatch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'sync_proposal_send_email_log requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM public._sync_proposal_send_email_log(p_dispatch_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_proposal_send_in_app_log(p_dispatch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_dispatch public.proposal_send_dispatches%ROWTYPE;
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'sync_proposal_send_in_app_log requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_dispatch
  FROM public.proposal_send_dispatches
  WHERE id = p_dispatch_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal send dispatch not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.notification_log (
    id, user_id, type, channel, status, template_id, metadata, sent_at
  ) VALUES (
    v_dispatch.in_app_log_id,
    v_dispatch.client_id,
    'proposal_sent',
    'in_app',
    'delivered',
    'proposal-sent',
    jsonb_build_object(
      'proposal_id', v_dispatch.proposal_id,
      'dispatch_id', v_dispatch.id,
      'sent_at', v_dispatch.sent_at,
      'subject', 'Proposal ready for your review',
      'message', v_dispatch.proposal_title,
      'deep_link', v_dispatch.client_portal_path
    ),
    v_dispatch.sent_at
  )
  ON CONFLICT (id) DO UPDATE SET
    metadata = EXCLUDED.metadata;
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_due_client_decisions(
  p_cutoff timestamptz
)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_previous_write_id text := current_setting(
    'app.client_decision_write_id', true
  );
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'expire_due_client_decisions is service-role only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_cutoff IS NULL THEN
    RAISE EXCEPTION 'p_cutoff is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  FOR v_id IN
    SELECT decision.id
    FROM public.client_decisions AS decision
    WHERE decision.status = 'pending'
      AND decision.approval_contract IS NULL
      AND decision.due_date IS NOT NULL
      AND decision.due_date < p_cutoff
    ORDER BY decision.id
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM set_config('app.client_decision_write_id', v_id::text, true);
    UPDATE public.client_decisions AS decision
    SET status = 'expired', updated_at = now()
    WHERE decision.id = v_id
      AND decision.status = 'pending'
      AND decision.approval_contract IS NULL;
    PERFORM set_config(
      'app.client_decision_write_id', COALESCE(v_previous_write_id, ''), true
    );
    id := v_id;
    RETURN NEXT;
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.client_decision_write_id', COALESCE(v_previous_write_id, ''), true
  );
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_spec_book_issue(p_revision_id uuid)
RETURNS public.spec_book_revisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_revision public.spec_book_revisions;
  v_expected integer;
  v_ready integer;
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'finalize_spec_book_issue requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT revision.* INTO v_revision
  FROM public.spec_book_revisions AS revision
  WHERE revision.id = p_revision_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'revision not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_revision.status = 'issued' THEN
    RETURN v_revision;
  END IF;

  v_expected := cardinality(v_revision.requested_audiences);
  SELECT count(*) INTO v_ready
  FROM public.spec_book_artifacts AS artifact
  JOIN public.project_documents AS document
    ON document.id = artifact.project_document_id
  WHERE artifact.revision_id = p_revision_id
    AND artifact.status = 'ready'
    AND artifact.audience = ANY(v_revision.requested_audiences)
    AND artifact.format = 'pdf'
    AND artifact.checksum_sha256 IS NOT NULL
    AND artifact.storage_path IS NOT NULL
    AND document.status = 'ready'
    AND document.storage_path = artifact.storage_path;

  IF v_ready <> v_expected OR (
    SELECT count(*)
    FROM public.spec_book_artifacts AS artifact
    WHERE artifact.revision_id = p_revision_id
  ) <> v_expected THEN
    RAISE EXCEPTION 'all requested artifacts must be durable before finalization'
      USING ERRCODE = 'object_not_in_prerequisite_state',
            DETAIL = jsonb_build_object(
              'expected', v_expected, 'ready', v_ready
            )::text;
  END IF;

  UPDATE public.spec_book_revisions
  SET status = 'issued', issued_at = now()
  WHERE id = p_revision_id
  RETURNING * INTO v_revision;

  RETURN v_revision;
END;
$$;

CREATE OR REPLACE FUNCTION public.mint_trade_rfq_token(p_rfq_id uuid)
RETURNS TABLE (id uuid, token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_request public.trade_rfq_requests%ROWTYPE;
  v_token text;
  v_hash text;
  v_id uuid;
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'minting a trade RFQ link requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_request FROM public.trade_rfq_requests
  WHERE trade_rfq_requests.id = p_rfq_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trade RFQ % not found', p_rfq_id
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_request.status = 'closed' THEN
    RAISE EXCEPTION 'trade RFQ % is closed and cannot be re-linked', p_rfq_id
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.trade_rfq_tokens SET status = 'revoked'
  WHERE rfq_request_id = p_rfq_id AND status = 'active';

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  INSERT INTO public.trade_rfq_tokens (
    rfq_request_id, proposal_id, party_id, token_hash, created_by
  ) VALUES (
    p_rfq_id, v_request.proposal_id, v_request.party_id, v_hash, auth.uid()
  ) RETURNING trade_rfq_tokens.id INTO v_id;

  RETURN QUERY SELECT v_id, v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_ab_variant_stats(p_campaign_id uuid)
RETURNS TABLE (
  variant text,
  sent bigint,
  delivered bigint,
  opened bigint,
  clicked bigint,
  bounced bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.campaigns AS campaign
       WHERE campaign.id = p_campaign_id
         AND (
           campaign.created_by = auth.uid()
           OR EXISTS (
             SELECT 1
             FROM public.user_roles AS user_role
             JOIN public.roles AS role
               ON role.id = user_role.role_id
             WHERE user_role.user_id = auth.uid()
               AND role.domain = 'admin'
           )
         )
     )
  THEN
    RAISE EXCEPTION 'campaign % not found or access denied', p_campaign_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(log.metadata->>'ab_variant', 'a') AS variant,
    COUNT(*) FILTER (
      WHERE log.status IN (
        'queued',
        'sending',
        'unconfirmed',
        'delivered',
        'opened',
        'clicked',
        'bounced',
        'failed'
      )
    )::bigint AS sent,
    COUNT(*) FILTER (
      WHERE log.status IN ('delivered', 'opened', 'clicked')
    )::bigint AS delivered,
    COUNT(*) FILTER (WHERE log.opened_at IS NOT NULL)::bigint AS opened,
    COUNT(*) FILTER (WHERE log.clicked_at IS NOT NULL)::bigint AS clicked,
    COUNT(*) FILTER (WHERE log.status = 'bounced')::bigint AS bounced
  FROM public.notification_log AS log
  WHERE log.metadata->>'campaign_id' = p_campaign_id::text
  GROUP BY COALESCE(log.metadata->>'ab_variant', 'a')
  ORDER BY 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_field_link(p_party_id uuid)
RETURNS TABLE (id uuid, token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_project_id uuid;
  v_token text;
  v_hash text;
  v_id uuid;
  v_calling_role text := current_setting('role', true);
BEGIN
  IF v_calling_role = 'service_role' THEN
    SELECT party.project_id INTO v_project_id
    FROM public.project_parties AS party
    WHERE party.id = p_party_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'field-link party not found or access denied'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF v_calling_role = 'authenticated' AND auth.uid() IS NOT NULL THEN
    SELECT party.project_id INTO v_project_id
    FROM public.project_parties AS party
    JOIN public.projects AS project ON project.id = party.project_id
    WHERE party.id = p_party_id
      AND project.designer_id = auth.uid();
    IF NOT FOUND THEN
      RAISE EXCEPTION 'field-link party not found or access denied'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSE
    RAISE EXCEPTION 'field-link party not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.field_link_tokens
  SET status = 'revoked'
  WHERE party_id = p_party_id
    AND project_id = v_project_id
    AND status = 'active';

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  INSERT INTO public.field_link_tokens (
    party_id, project_id, token_hash, created_by
  ) VALUES (
    p_party_id, v_project_id, v_hash, auth.uid()
  )
  RETURNING field_link_tokens.id INTO v_id;

  RETURN QUERY SELECT v_id, v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.stamp_project_approval_reminder_delivery(
  p_decision_id uuid,
  p_decision_lead_id uuid
)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_decision public.client_decisions%ROWTYPE;
  v_frozen_lead_id uuid;
  v_artifact_id uuid;
  v_previous_parent_write text := current_setting(
    'app.project_approval_decision_write_id', true
  );
  v_previous_legacy_write text := current_setting(
    'app.client_decision_write_id', true
  );
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Stage-2 reminder delivery stamp is service-role only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT decision.* INTO v_decision
  FROM public.client_decisions AS decision
  WHERE decision.id = p_decision_id
  FOR UPDATE;
  IF NOT FOUND
     OR v_decision.approval_contract IS DISTINCT FROM 'project_artifact_v1'
     OR v_decision.status IS DISTINCT FROM 'pending'
  THEN
    RAISE EXCEPTION 'pending Stage-2 decision not found'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT snapshot.decision_lead_id, artifact.id
  INTO v_frozen_lead_id, v_artifact_id
  FROM public.project_decision_authority_snapshots AS snapshot
  JOIN public.project_approval_artifacts AS artifact
    ON artifact.decision_id = snapshot.decision_id
   AND artifact.project_id = snapshot.project_id
  WHERE snapshot.decision_id = v_decision.id
    AND snapshot.project_id = v_decision.project_id;
  IF NOT FOUND
     OR v_frozen_lead_id IS DISTINCT FROM p_decision_lead_id
     OR v_artifact_id IS NULL
  THEN
    RAISE EXCEPTION
      'reminder delivery recipient does not match frozen Stage-2 evidence'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_decision.reminder_sent_at IS NULL THEN
    PERFORM set_config(
      'app.client_decision_write_id', p_decision_id::text, true
    );
    PERFORM set_config(
      'app.project_approval_decision_write_id', p_decision_id::text, true
    );
    UPDATE public.client_decisions
    SET reminder_sent_at = now(), updated_at = now()
    WHERE id = p_decision_id
    RETURNING * INTO v_decision;
  END IF;

  PERFORM set_config(
    'app.project_approval_decision_write_id',
    COALESCE(v_previous_parent_write, ''), true
  );
  PERFORM set_config(
    'app.client_decision_write_id',
    COALESCE(v_previous_legacy_write, ''), true
  );
  RETURN v_decision;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.project_approval_decision_write_id',
    COALESCE(v_previous_parent_write, ''), true
  );
  PERFORM set_config(
    'app.client_decision_write_id',
    COALESCE(v_previous_legacy_write, ''), true
  );
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_coordination_revision(
  p_item_id uuid,
  p_attachments jsonb DEFAULT '[]'::jsonb,
  p_note text DEFAULT NULL,
  p_status text DEFAULT 'submitted',
  p_submitted_by uuid DEFAULT NULL
)
RETURNS public.coordination_item_revisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_item public.client_decisions%ROWTYPE;
  v_actor uuid := auth.uid();
  v_next_rev integer;
  v_revision public.coordination_item_revisions%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'coordination item not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_item
  FROM public.client_decisions AS item
  WHERE item.id = p_item_id
    AND (
      v_actor = COALESCE(
        item.designer_id,
        (
          SELECT relationship.designer_id
          FROM public.designer_clients AS relationship
          WHERE relationship.id = item.designer_client_id
        ),
        (
          SELECT project.designer_id
          FROM public.projects AS project
          WHERE project.id = item.project_id
        )
      )
      OR (
        item.project_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.projects AS project
          JOIN public.organizations AS organization
            ON organization.id = project.studio_id
          JOIN public.organization_members AS membership
            ON membership.organization_id = organization.id
          WHERE project.id = item.project_id
            AND organization.type = 'design_studio'
            AND organization.status = 'active'
            AND membership.user_id = v_actor
            AND membership.status = 'active'
            AND membership.role <> 'guest'
        )
      )
      OR (
        item.court = 'client'
        AND item.coordination_kind IN ('selection', 'signoff')
        AND EXISTS (
          SELECT 1
          FROM public.designer_clients AS relationship
          WHERE relationship.id = item.designer_client_id
            AND relationship.client_id = v_actor
        )
      )
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'coordination item not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_item.coordination_kind <> 'submittal' THEN
    RAISE EXCEPTION 'item % is not a submittal (coordination_kind = %)',
      p_item_id, v_item.coordination_kind
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_item.status <> 'pending' THEN
    RAISE EXCEPTION 'submittal revisions require a pending item'
      USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(p_status, 'submitted') NOT IN ('submitted', 'revise_resubmit') THEN
    RAISE EXCEPTION 'revision submit status must be submitted or revise_resubmit'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(max(revision.rev_number), 0) + 1
  INTO v_next_rev
  FROM public.coordination_item_revisions AS revision
  WHERE revision.decision_id = p_item_id;

  INSERT INTO public.coordination_item_revisions (
    decision_id, rev_number, status, attachments, note, submitted_by
  ) VALUES (
    p_item_id, v_next_rev, COALESCE(p_status, 'submitted'),
    COALESCE(p_attachments, '[]'::jsonb), p_note, v_actor
  )
  RETURNING * INTO v_revision;

  UPDATE public.client_decisions
  SET updated_at = now()
  WHERE id = p_item_id;

  RETURN v_revision;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_scope_change(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_request public.scope_change_requests%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_project_id uuid;
  v_new_room jsonb;
  v_new_item jsonb;
  v_new_room_id uuid;
  v_room_ids_by_name jsonb := '{}'::jsonb;
  v_project_room_id uuid;
  v_quantity integer;
  v_unit_price_cents integer;
  v_line_total_cents integer;
  v_previous_transition text := current_setting(
    'app.scope_change_transition', true
  );
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'scope change request not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT project.* INTO v_project
  FROM public.scope_change_requests AS request
  JOIN public.projects AS project ON project.id = request.project_id
  WHERE request.id = p_request_id
  FOR UPDATE OF project;

  IF NOT FOUND OR NOT public._scope_change_requester_can_author(
    auth.uid(), v_project.designer_id, v_project.id
  ) THEN
    RAISE EXCEPTION 'scope change request not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_project_id := v_project.id;

  IF v_project.status IN ('completed', 'archived') THEN
    RAISE EXCEPTION 'apply_scope_change: completed_project'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_request
  FROM public.scope_change_requests
  WHERE id = p_request_id
    AND project_id = v_project.id
    AND status = 'approved'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Scope change request % not found or not approved', p_request_id;
  END IF;

  IF v_request.applied_at IS NOT NULL THEN
    RAISE EXCEPTION 'Scope change % already applied at %', p_request_id, v_request.applied_at;
  END IF;

  IF NOT (
    (
      v_request.request_origin = 'client_request'
      AND v_request.requested_by IS NOT DISTINCT FROM v_project.client_id
    )
    OR (
      v_request.request_origin = 'designer_amendment'
      AND public._scope_change_requester_can_author(
        v_request.requested_by,
        v_project.designer_id,
        v_project.id
      )
    )
  ) THEN
    RAISE EXCEPTION 'Scope change request % has an invalid requester', p_request_id
      USING ERRCODE = 'check_violation';
  END IF;

  FOR v_new_room IN
    SELECT *
    FROM jsonb_array_elements(COALESCE(v_request.new_rooms, '[]'::jsonb))
  LOOP
    INSERT INTO public.project_rooms (
      project_id,
      name,
      room_type,
      dimensions,
      floor_area_sqft,
      budget_cents,
      ffe_categories,
      notes
    ) VALUES (
      v_request.project_id,
      v_new_room->>'name',
      COALESCE(v_new_room->>'room_type', v_new_room->>'roomType'),
      v_new_room->>'dimensions',
      NULLIF(
        COALESCE(v_new_room->>'floor_area_sqft', v_new_room->>'floorAreaSqft'),
        ''
      )::numeric(10,2),
      COALESCE(
        NULLIF(
          COALESCE(v_new_room->>'budget_cents', v_new_room->>'budgetCents'),
          ''
        )::integer,
        0
      ),
      ARRAY(
        SELECT jsonb_array_elements_text(
          COALESCE(
            v_new_room->'ffe_categories',
            v_new_room->'ffeCategories',
            '[]'::jsonb
          )
        )
      ),
      v_new_room->>'notes'
    )
    RETURNING id INTO v_new_room_id;

    IF NULLIF(v_new_room->>'name', '') IS NOT NULL THEN
      v_room_ids_by_name := v_room_ids_by_name || jsonb_build_object(
        v_new_room->>'name',
        v_new_room_id::text
      );
    END IF;
  END LOOP;

  FOR v_new_item IN
    SELECT *
    FROM jsonb_array_elements(COALESCE(v_request.new_ffe_items, '[]'::jsonb))
  LOOP
    v_project_room_id := COALESCE(
      NULLIF(v_new_item->>'project_room_id', '')::uuid,
      NULLIF(v_new_item->>'projectRoomId', '')::uuid,
      NULLIF(
        v_room_ids_by_name->>COALESCE(
          NULLIF(v_new_item->>'roomName', ''),
          NULLIF(v_new_item->>'room_name', '')
        ),
        ''
      )::uuid
    );
    v_quantity := COALESCE(
      NULLIF(COALESCE(v_new_item->>'quantity', ''), '')::integer,
      1
    );
    v_unit_price_cents := COALESCE(
      NULLIF(
        COALESCE(v_new_item->>'unit_price_cents', v_new_item->>'unitPriceCents'),
        ''
      )::integer,
      0
    );
    v_line_total_cents := COALESCE(
      NULLIF(
        COALESCE(v_new_item->>'line_total_cents', v_new_item->>'lineTotalCents'),
        ''
      )::integer,
      v_unit_price_cents * v_quantity
    );

    INSERT INTO public.project_ffe_items (
      project_id,
      project_room_id,
      name,
      ffe_category,
      item_type,
      quantity,
      unit_price_cents,
      line_total_cents,
      vendor_name,
      notes
    ) VALUES (
      v_request.project_id,
      v_project_room_id,
      v_new_item->>'name',
      COALESCE(v_new_item->>'ffe_category', v_new_item->>'ffeCategory'),
      COALESCE(
        v_new_item->>'item_type',
        v_new_item->>'itemType',
        CASE
          WHEN v_new_item ?| ARRAY[
            'roomName', 'ffeCategory', 'itemType', 'unitPriceCents'
          ] THEN 'tbd'
          ELSE 'fixed'
        END
      ),
      v_quantity,
      v_unit_price_cents,
      v_line_total_cents,
      COALESCE(v_new_item->>'vendor_name', v_new_item->>'vendorName'),
      v_new_item->>'notes'
    );
  END LOOP;

  UPDATE public.projects
  SET budget_cents = budget_cents
        + COALESCE(v_request.additional_ffe_budget_cents, 0),
      design_fee_cents = design_fee_cents
        + COALESCE(v_request.additional_design_fee_cents, 0),
      target_end_date = target_end_date
        + (COALESCE(v_request.timeline_impact_weeks, 0) * 7),
      updated_at = now()
  WHERE id = v_request.project_id;

  PERFORM set_config(
    'app.scope_change_transition',
    format('apply:%s:%s', p_request_id, pg_catalog.txid_current()),
    true
  );
  UPDATE public.scope_change_requests
  SET applied_at = now()
  WHERE id = p_request_id;
  PERFORM set_config(
    'app.scope_change_transition', COALESCE(v_previous_transition, ''), true
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.scope_change_transition', COALESCE(v_previous_transition, ''), true
  );
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_project(
  p_project_id uuid,
  p_closure jsonb DEFAULT NULL,
  p_snapshot jsonb DEFAULT NULL
)
RETURNS public.projects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_designer uuid := auth.uid();
  v_project public.projects;
  v_effective_closure jsonb;
  v_blocker_count integer;
  v_collected_cents bigint;
  v_previous_completion_id text := current_setting(
    'app.project_completion_id', true
  );
BEGIN
  IF v_designer IS NULL THEN
    RAISE EXCEPTION 'project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id
    AND designer_id = v_designer
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_effective_closure := COALESCE(p_closure, v_project.closure_checklist);
  IF v_effective_closure IS NULL
     OR jsonb_typeof(v_effective_closure) <> 'array'
     OR EXISTS (
       SELECT 1
       FROM unnest(ARRAY[
         'walkthrough', 'punch_list', 'payment', 'photography', 'photos',
         'case_study'
       ]) AS required(key)
       WHERE NOT EXISTS (
         SELECT 1
         FROM jsonb_array_elements(v_effective_closure) AS item(value)
         WHERE item.value->>'key' = required.key
           AND item.value->'completed' = 'true'::jsonb
       )
     )
  THEN
    RAISE EXCEPTION
      'project closeout checklist must include every required item as completed'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM scope_change.id
  FROM public.scope_change_requests AS scope_change
  WHERE scope_change.project_id = p_project_id
  ORDER BY scope_change.id
  FOR UPDATE;

  SELECT count(*) INTO v_blocker_count
  FROM public.scope_change_requests AS scope_change
  WHERE scope_change.project_id = p_project_id
    AND scope_change.applied_at IS NULL
    AND scope_change.status IS DISTINCT FROM 'declined'
    AND scope_change.status IS DISTINCT FROM 'cancelled';

  IF v_blocker_count > 0 THEN
    RAISE EXCEPTION
      'project cannot close: % scope change request(s) are unresolved',
      v_blocker_count
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM decision.id
  FROM public.client_decisions AS decision
  WHERE decision.project_id = p_project_id
  ORDER BY decision.id
  FOR UPDATE;

  SELECT count(*) INTO v_blocker_count
  FROM public.client_decisions AS decision
  WHERE decision.project_id = p_project_id
    AND decision.status IS DISTINCT FROM 'responded'
    AND decision.status IS DISTINCT FROM 'expired';

  IF v_blocker_count > 0 THEN
    RAISE EXCEPTION
      'project cannot close: % coordination/decision item(s) are unresolved',
      v_blocker_count
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM phase.id
  FROM public.project_phases AS phase
  WHERE phase.project_id = p_project_id
  ORDER BY phase.id
  FOR UPDATE;

  SELECT count(*) INTO v_blocker_count
  FROM public.project_phases AS phase
  WHERE phase.project_id = p_project_id
    AND phase.status IS DISTINCT FROM 'completed';

  IF v_blocker_count > 0 THEN
    RAISE EXCEPTION
      'project cannot close: % project phase(s) are not completed',
      v_blocker_count
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.invoices
  WHERE project_id = p_project_id
  ORDER BY id
  FOR UPDATE;

  PERFORM 1
  FROM public.invoice_line_items AS line
  JOIN public.invoices AS invoice ON invoice.id = line.invoice_id
  WHERE invoice.project_id = p_project_id
  ORDER BY line.id
  FOR UPDATE OF line;

  PERFORM 1
  FROM public.project_payment_milestones
  WHERE project_id = p_project_id
  ORDER BY id
  FOR UPDATE;

  PERFORM 1
  FROM public.project_ffe_items
  WHERE project_id = p_project_id
  ORDER BY id
  FOR UPDATE;

  SELECT count(*) INTO v_blocker_count
  FROM public.project_ffe_items
  WHERE project_id = p_project_id
    AND status <> 'installed';

  IF v_blocker_count > 0 THEN
    RAISE EXCEPTION
      'project cannot close: % FF&E item(s) are not installed', v_blocker_count
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_blocker_count
  FROM public.project_ffe_items AS ffe
  WHERE ffe.project_id = p_project_id
    AND GREATEST(
      0::bigint,
      COALESCE(
        ffe.line_total_cents::bigint,
        COALESCE(ffe.quantity, 0)::bigint
          * COALESCE(ffe.unit_price_cents, 0)::bigint,
        0::bigint
      )
    ) > 0
    AND GREATEST(
      0::bigint,
      COALESCE(
        ffe.line_total_cents::bigint,
        COALESCE(ffe.quantity, 0)::bigint
          * COALESCE(ffe.unit_price_cents, 0)::bigint,
        0::bigint
      )
    ) > COALESCE((
      SELECT sum(GREATEST(line.amount_cents::bigint, 0::bigint))
      FROM public.invoice_line_items AS line
      JOIN public.invoices AS invoice ON invoice.id = line.invoice_id
      WHERE line.ffe_item_id = ffe.id
        AND invoice.project_id = p_project_id
        AND invoice.status = 'paid'
        AND invoice.amount_paid_cents >= invoice.total_cents
    ), 0::bigint);

  IF v_blocker_count > 0 THEN
    RAISE EXCEPTION
      'project cannot close: % FF&E item(s) are not fully invoiced and paid',
      v_blocker_count
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_blocker_count
  FROM public.project_payment_milestones
  WHERE project_id = p_project_id
    AND amount_cents > 0
    AND status <> 'paid';

  IF v_blocker_count > 0 THEN
    RAISE EXCEPTION
      'project cannot close: % positive payment milestone(s) are not paid',
      v_blocker_count
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_blocker_count
  FROM (
    SELECT
      invoice.id,
      invoice.status,
      invoice.amount_paid_cents,
      CASE
        WHEN count(line.id) > 0 THEN
          COALESCE(sum(line.amount_cents), 0)
          + round(COALESCE(sum(line.amount_cents), 0) * invoice.tax_rate)::bigint
        ELSE invoice.total_cents::bigint
      END AS canonical_total_cents
    FROM public.invoices AS invoice
    LEFT JOIN public.invoice_line_items AS line ON line.invoice_id = invoice.id
    WHERE invoice.project_id = p_project_id
    GROUP BY invoice.id
  ) AS invoice_truth
  WHERE invoice_truth.status <> 'void'
    AND invoice_truth.canonical_total_cents > invoice_truth.amount_paid_cents;

  IF v_blocker_count > 0 THEN
    RAISE EXCEPTION
      'project cannot close: % invoice(s) still carry a balance', v_blocker_count
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(sum(LEAST(
    invoice_truth.canonical_total_cents,
    invoice_truth.amount_paid_cents::bigint
  )), 0)
  INTO v_collected_cents
  FROM (
    SELECT
      invoice.id,
      invoice.status,
      invoice.amount_paid_cents,
      CASE
        WHEN count(line.id) > 0 THEN
          COALESCE(sum(line.amount_cents), 0)
          + round(COALESCE(sum(line.amount_cents), 0) * invoice.tax_rate)::bigint
        ELSE invoice.total_cents::bigint
      END AS canonical_total_cents
    FROM public.invoices AS invoice
    LEFT JOIN public.invoice_line_items AS line ON line.invoice_id = invoice.id
    WHERE invoice.project_id = p_project_id
    GROUP BY invoice.id
  ) AS invoice_truth
  WHERE invoice_truth.status <> 'void';

  IF COALESCE(v_project.total_amount_cents, 0) > v_collected_cents THEN
    RAISE EXCEPTION
      'project cannot close: contract total is not fully collected'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.project_completion_id', p_project_id::text, true);
  UPDATE public.projects
  SET status = 'completed',
      closure_checklist = v_effective_closure,
      portfolio_snapshot = COALESCE(p_snapshot, portfolio_snapshot),
      updated_at = now()
  WHERE id = p_project_id
  RETURNING * INTO v_project;
  PERFORM set_config(
    'app.project_completion_id', COALESCE(v_previous_completion_id, ''), true
  );

  RETURN v_project;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.project_completion_id', COALESCE(v_previous_completion_id, ''), true
  );
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_proposal_viewed(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals;
BEGIN
  IF auth.uid() IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.proposals AS proposal
       WHERE proposal.id = p_proposal_id
         AND proposal.client_id = auth.uid()
     )
  THEN
    RAISE EXCEPTION 'proposal not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_proposal := public._mark_proposal_viewed_impl(p_proposal_id);
  RETURN jsonb_build_object(
    'id', v_proposal.id,
    'status', v_proposal.status,
    'viewed_at', v_proposal.viewed_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_proposal(
  p_proposal_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals;
BEGIN
  IF auth.uid() IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.proposals AS proposal
       WHERE proposal.id = p_proposal_id
         AND proposal.client_id = auth.uid()
     )
  THEN
    RAISE EXCEPTION 'proposal not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_proposal := public._decline_proposal_impl(p_proposal_id, p_reason);
  RETURN jsonb_build_object(
    'id', v_proposal.id,
    'status', v_proposal.status,
    'declined_at', v_proposal.declined_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.escalate_item_feedback_to_decision(
  p_feedback_id uuid,
  p_decision_id uuid
)
RETURNS public.item_feedback
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_fb public.item_feedback;
  v_anchor_client_id uuid;
  v_anchor_project_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'feedback or decision not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT feedback, gate.client_id, proposal.project_id
  INTO v_fb, v_anchor_client_id, v_anchor_project_id
  FROM public.item_feedback AS feedback
  CROSS JOIN LATERAL public.item_feedback_gate(
    feedback.proposal_item_id,
    feedback.ffe_item_id,
    feedback.board_item_id
  ) AS gate
  JOIN public.proposals AS proposal ON proposal.id = gate.proposal_id
  WHERE feedback.id = p_feedback_id
    AND gate.designer_id = auth.uid()
    AND proposal.project_id IS NOT NULL
  FOR UPDATE OF feedback
  FOR SHARE OF proposal;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'feedback or decision not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM 1
  FROM public.client_decisions AS decision
  JOIN public.designer_clients AS relationship
    ON relationship.id = decision.designer_client_id
  WHERE decision.id = p_decision_id
    AND relationship.designer_id = auth.uid()
    AND relationship.client_id = v_anchor_client_id
    AND decision.project_id = v_anchor_project_id
  FOR SHARE OF decision, relationship;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'feedback or decision not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.item_feedback
  SET decision_id = p_decision_id, updated_at = now()
  WHERE id = p_feedback_id
  RETURNING * INTO v_fb;

  INSERT INTO public.item_feedback_events (feedback_id, actor, kind, body)
  VALUES (
    p_feedback_id, auth.uid(), 'replied',
    'Put to the client as a Decision.'
  );

  RETURN v_fb;
END;
$$;

DROP POLICY IF EXISTS "Designers can view line items on their invoices"
  ON public.invoice_line_items;
DROP POLICY IF EXISTS "Designers can add line items to their draft invoices"
  ON public.invoice_line_items;
DROP POLICY IF EXISTS "Designers can update line items on their draft invoices"
  ON public.invoice_line_items;
DROP POLICY IF EXISTS "Designers can delete line items on their draft invoices"
  ON public.invoice_line_items;
DROP POLICY IF EXISTS "Clients can view line items on issued invoices"
  ON public.invoice_line_items;
DROP POLICY IF EXISTS invoice_line_items_studio_select
  ON public.invoice_line_items;
DROP POLICY IF EXISTS invoice_line_items_studio_insert_draft
  ON public.invoice_line_items;
DROP POLICY IF EXISTS invoice_line_items_studio_update_draft
  ON public.invoice_line_items;
DROP POLICY IF EXISTS invoice_line_items_studio_delete_draft
  ON public.invoice_line_items;
DROP POLICY IF EXISTS invoice_line_items_exact_studio_select
  ON public.invoice_line_items;
DROP POLICY IF EXISTS invoice_line_items_exact_studio_insert_draft
  ON public.invoice_line_items;
DROP POLICY IF EXISTS invoice_line_items_exact_studio_update_draft
  ON public.invoice_line_items;
DROP POLICY IF EXISTS invoice_line_items_exact_studio_delete_draft
  ON public.invoice_line_items;
DROP POLICY IF EXISTS invoice_line_items_exact_client_select
  ON public.invoice_line_items;

CREATE POLICY invoice_line_items_exact_studio_select
ON public.invoice_line_items FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.invoices AS invoice
    JOIN public.projects AS project ON project.id = invoice.project_id
    JOIN public.organizations AS studio
      ON studio.id = project.studio_id
     AND studio.type = 'design_studio'
     AND studio.status = 'active'
    JOIN public.organization_members AS actor_membership
      ON actor_membership.organization_id = studio.id
     AND actor_membership.user_id = auth.uid()
     AND actor_membership.status = 'active'
     AND actor_membership.role <> 'guest'
    WHERE invoice.id = invoice_line_items.invoice_id
      AND invoice.client_id IS NOT DISTINCT FROM project.client_id
      AND invoice.studio_id IS NOT DISTINCT FROM project.studio_id
      AND (
        invoice.designer_id = project.designer_id
        OR EXISTS (
          SELECT 1
          FROM public.project_team_members AS historical_lead
          WHERE historical_lead.project_id = project.id
            AND historical_lead.user_id = invoice.designer_id
            AND historical_lead.role = 'previous_lead'
        )
      )
  )
);

CREATE POLICY invoice_line_items_exact_studio_insert_draft
ON public.invoice_line_items FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.invoices AS invoice
    JOIN public.projects AS project ON project.id = invoice.project_id
    JOIN public.organizations AS studio
      ON studio.id = project.studio_id
     AND studio.type = 'design_studio'
     AND studio.status = 'active'
    JOIN public.organization_members AS actor_membership
      ON actor_membership.organization_id = studio.id
     AND actor_membership.user_id = auth.uid()
     AND actor_membership.status = 'active'
     AND actor_membership.role <> 'guest'
    WHERE invoice.id = invoice_line_items.invoice_id
      AND invoice.status = 'draft'
      AND invoice.client_id IS NOT DISTINCT FROM project.client_id
      AND invoice.studio_id IS NOT DISTINCT FROM project.studio_id
      AND (
        invoice.designer_id = project.designer_id
        OR EXISTS (
          SELECT 1
          FROM public.project_team_members AS historical_lead
          WHERE historical_lead.project_id = project.id
            AND historical_lead.user_id = invoice.designer_id
            AND historical_lead.role = 'previous_lead'
        )
      )
  )
);

CREATE POLICY invoice_line_items_exact_studio_update_draft
ON public.invoice_line_items FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.invoices AS invoice
    JOIN public.projects AS project ON project.id = invoice.project_id
    JOIN public.organizations AS studio
      ON studio.id = project.studio_id
     AND studio.type = 'design_studio'
     AND studio.status = 'active'
    JOIN public.organization_members AS actor_membership
      ON actor_membership.organization_id = studio.id
     AND actor_membership.user_id = auth.uid()
     AND actor_membership.status = 'active'
     AND actor_membership.role <> 'guest'
    WHERE invoice.id = invoice_line_items.invoice_id
      AND invoice.status = 'draft'
      AND invoice.client_id IS NOT DISTINCT FROM project.client_id
      AND invoice.studio_id IS NOT DISTINCT FROM project.studio_id
      AND (
        invoice.designer_id = project.designer_id
        OR EXISTS (
          SELECT 1
          FROM public.project_team_members AS historical_lead
          WHERE historical_lead.project_id = project.id
            AND historical_lead.user_id = invoice.designer_id
            AND historical_lead.role = 'previous_lead'
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.invoices AS invoice
    JOIN public.projects AS project ON project.id = invoice.project_id
    JOIN public.organizations AS studio
      ON studio.id = project.studio_id
     AND studio.type = 'design_studio'
     AND studio.status = 'active'
    JOIN public.organization_members AS actor_membership
      ON actor_membership.organization_id = studio.id
     AND actor_membership.user_id = auth.uid()
     AND actor_membership.status = 'active'
     AND actor_membership.role <> 'guest'
    WHERE invoice.id = invoice_line_items.invoice_id
      AND invoice.status = 'draft'
      AND invoice.client_id IS NOT DISTINCT FROM project.client_id
      AND invoice.studio_id IS NOT DISTINCT FROM project.studio_id
      AND (
        invoice.designer_id = project.designer_id
        OR EXISTS (
          SELECT 1
          FROM public.project_team_members AS historical_lead
          WHERE historical_lead.project_id = project.id
            AND historical_lead.user_id = invoice.designer_id
            AND historical_lead.role = 'previous_lead'
        )
      )
  )
);

CREATE POLICY invoice_line_items_exact_studio_delete_draft
ON public.invoice_line_items FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.invoices AS invoice
    JOIN public.projects AS project ON project.id = invoice.project_id
    JOIN public.organizations AS studio
      ON studio.id = project.studio_id
     AND studio.type = 'design_studio'
     AND studio.status = 'active'
    JOIN public.organization_members AS actor_membership
      ON actor_membership.organization_id = studio.id
     AND actor_membership.user_id = auth.uid()
     AND actor_membership.status = 'active'
     AND actor_membership.role <> 'guest'
    WHERE invoice.id = invoice_line_items.invoice_id
      AND invoice.status = 'draft'
      AND invoice.client_id IS NOT DISTINCT FROM project.client_id
      AND invoice.studio_id IS NOT DISTINCT FROM project.studio_id
      AND (
        invoice.designer_id = project.designer_id
        OR EXISTS (
          SELECT 1
          FROM public.project_team_members AS historical_lead
          WHERE historical_lead.project_id = project.id
            AND historical_lead.user_id = invoice.designer_id
            AND historical_lead.role = 'previous_lead'
        )
      )
  )
);

CREATE POLICY invoice_line_items_exact_client_select
ON public.invoice_line_items FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.invoices AS invoice
    JOIN public.projects AS project ON project.id = invoice.project_id
    WHERE invoice.id = invoice_line_items.invoice_id
      AND invoice.status <> 'draft'
      AND project.client_id = auth.uid()
      AND invoice.client_id IS NOT DISTINCT FROM project.client_id
      AND invoice.studio_id IS NOT DISTINCT FROM project.studio_id
      AND (
        invoice.designer_id = project.designer_id
        OR EXISTS (
          SELECT 1
          FROM public.project_team_members AS historical_lead
          WHERE historical_lead.project_id = project.id
            AND historical_lead.user_id = invoice.designer_id
            AND historical_lead.role = 'previous_lead'
        )
      )
  )
);

DO $retire_milestone_invoice_core$
BEGIN
  IF to_regprocedure(
       'public._draft_invoice_from_milestone_00486(uuid)'
     ) IS NULL
  THEN
    ALTER FUNCTION public.draft_invoice_from_milestone(uuid)
      RENAME TO _draft_invoice_from_milestone_00486;
  END IF;
END
$retire_milestone_invoice_core$;

ALTER FUNCTION public._draft_invoice_from_milestone_00486(uuid)
  SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL PRIVILEGES ON FUNCTION
  public._draft_invoice_from_milestone_00486(uuid)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;

CREATE OR REPLACE FUNCTION public.draft_invoice_from_milestone(
  p_milestone_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_milestone public.project_payment_milestones%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_line public.invoice_line_items%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_project_id uuid;
  v_latched_invoice_id uuid;
  v_line_invoice_id uuid;
BEGIN
  SELECT milestone.project_id INTO v_project_id
  FROM public.project_payment_milestones AS milestone
  WHERE milestone.id = p_milestone_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'draft_invoice_from_milestone: milestone % not found', p_milestone_id;
  END IF;

  SELECT * INTO v_project
  FROM public.projects AS project
  WHERE project.id = v_project_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'draft_invoice_from_milestone: project % not found', v_project_id;
  END IF;

  SELECT milestone.invoice_id INTO v_latched_invoice_id
  FROM public.project_payment_milestones AS milestone
  WHERE milestone.id = p_milestone_id
    AND milestone.project_id = v_project.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'draft_invoice_from_milestone: milestone % changed projects',
      p_milestone_id USING ERRCODE = '23514';
  END IF;

  SELECT line.invoice_id INTO v_line_invoice_id
  FROM public.invoice_line_items AS line
  WHERE line.milestone_id = p_milestone_id;

  PERFORM invoice.id
  FROM public.invoices AS invoice
  WHERE invoice.project_id = v_project.id
     OR invoice.id = v_latched_invoice_id
     OR invoice.id = v_line_invoice_id
  ORDER BY invoice.id
  FOR UPDATE;

  PERFORM line.id
  FROM public.invoice_line_items AS line
  LEFT JOIN public.invoices AS invoice ON invoice.id = line.invoice_id
  WHERE invoice.project_id = v_project.id
     OR line.milestone_id = p_milestone_id
  ORDER BY line.id
  FOR UPDATE OF line;

  SELECT * INTO v_milestone
  FROM public.project_payment_milestones AS milestone
  WHERE milestone.id = p_milestone_id
  FOR UPDATE;
  IF NOT FOUND OR v_milestone.project_id IS DISTINCT FROM v_project.id THEN
    RAISE EXCEPTION
      'draft_invoice_from_milestone: milestone % changed projects',
      p_milestone_id USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_line
  FROM public.invoice_line_items AS line
  WHERE line.milestone_id = p_milestone_id;

  IF v_line.id IS NOT NULL THEN
    SELECT * INTO v_invoice
    FROM public.invoices AS invoice
    WHERE invoice.id = v_line.invoice_id;
    IF NOT FOUND
       OR v_invoice.project_id IS DISTINCT FROM v_project.id
       OR v_invoice.client_id IS DISTINCT FROM v_project.client_id
       OR v_invoice.studio_id IS DISTINCT FROM v_project.studio_id
       OR NOT (
         v_invoice.designer_id = v_project.designer_id
         OR EXISTS (
           SELECT 1
           FROM public.project_team_members AS historical_lead
           WHERE historical_lead.project_id = v_project.id
             AND historical_lead.user_id = v_invoice.designer_id
             AND historical_lead.role = 'previous_lead'
         )
       )
    THEN
      RAISE EXCEPTION
        'draft_invoice_from_milestone: invoice line identity conflicts with milestone %',
        p_milestone_id USING ERRCODE = '23514';
    END IF;
  END IF;

  IF v_milestone.invoice_id IS NOT NULL
     AND (
       v_line.id IS NULL
       OR v_milestone.invoice_id <> v_line.invoice_id
     )
  THEN
    SELECT * INTO v_invoice
    FROM public.invoices AS invoice
    WHERE invoice.id = v_milestone.invoice_id;
    IF FOUND
       AND (
         v_invoice.studio_id IS DISTINCT FROM v_project.studio_id
         OR (
           v_invoice.status <> 'void'
           AND (
             v_invoice.project_id IS DISTINCT FROM v_project.id
             OR v_invoice.client_id IS DISTINCT FROM v_project.client_id
             OR NOT (
               v_invoice.designer_id = v_project.designer_id
               OR EXISTS (
                 SELECT 1
                 FROM public.project_team_members AS historical_lead
                 WHERE historical_lead.project_id = v_project.id
                   AND historical_lead.user_id = v_invoice.designer_id
                   AND historical_lead.role = 'previous_lead'
               )
             )
           )
         )
       )
    THEN
      RAISE EXCEPTION
        'draft_invoice_from_milestone: draft invoice % is unsafe for milestone % repair',
        v_invoice.id, p_milestone_id USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN public._draft_invoice_from_milestone_00486(p_milestone_id);
END;
$$;

REVOKE ALL PRIVILEGES ON FUNCTION public.draft_invoice_from_milestone(uuid)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION public.draft_invoice_from_milestone(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.sync_invoice_line_milestone_latch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_previous_invoice public.invoices%ROWTYPE;
  v_milestone public.project_payment_milestones%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_detach boolean := false;
  v_updated integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_detach := OLD.milestone_id IS NOT NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    v_detach := OLD.milestone_id IS NOT NULL
      AND (
        OLD.milestone_id IS DISTINCT FROM NEW.milestone_id
        OR OLD.invoice_id IS DISTINCT FROM NEW.invoice_id
      );
  END IF;

  IF v_detach THEN
    IF current_user = 'authenticated' THEN
      RAISE EXCEPTION
        'invoice milestone latch: direct detach is not allowed'
        USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_previous_invoice
    FROM public.invoices
    WHERE id = OLD.invoice_id;

    SELECT milestone, project
    INTO v_milestone, v_project
    FROM public.project_payment_milestones AS milestone
    JOIN public.projects AS project ON project.id = milestone.project_id
    WHERE milestone.id = OLD.milestone_id;

    IF v_previous_invoice.id IS NULL
       OR v_milestone.id IS NULL
       OR (
         v_previous_invoice.project_id IS DISTINCT FROM v_project.id
         OR v_previous_invoice.client_id IS DISTINCT FROM v_project.client_id
         OR v_previous_invoice.studio_id IS DISTINCT FROM v_project.studio_id
         OR NOT (
           v_previous_invoice.designer_id = v_project.designer_id
           OR EXISTS (
             SELECT 1
             FROM public.project_team_members AS historical_lead
             WHERE historical_lead.project_id = v_project.id
               AND historical_lead.user_id = v_previous_invoice.designer_id
               AND historical_lead.role = 'previous_lead'
           )
         )
         OR OLD.kind IS DISTINCT FROM 'milestone'
         OR OLD.quantity IS DISTINCT FROM 1
         OR OLD.unit_amount_cents IS DISTINCT FROM v_milestone.amount_cents
         OR OLD.amount_cents IS DISTINCT FROM v_milestone.amount_cents
       )
    THEN
      RAISE EXCEPTION
        'invoice milestone latch: prior line does not match milestone %',
        OLD.milestone_id USING ERRCODE = '23514';
    END IF;

    IF v_previous_invoice.status IS DISTINCT FROM 'void'
       OR EXISTS (
         SELECT 1
         FROM public.project_payment_milestones AS milestone
         WHERE milestone.id = OLD.milestone_id
           AND milestone.invoice_id = OLD.invoice_id
       )
    THEN
      RAISE EXCEPTION
        'invoice milestone latch: cannot detach milestone % from % invoice %',
        OLD.milestone_id, v_previous_invoice.status, OLD.invoice_id
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF NEW.milestone_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = NEW.invoice_id;
  IF NOT FOUND OR v_invoice.status <> 'draft' THEN
    RAISE EXCEPTION
      'invoice milestone latch: invoice % is missing or not draft', NEW.invoice_id
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_milestone
  FROM public.project_payment_milestones
  WHERE id = NEW.milestone_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'invoice milestone latch: milestone % not found', NEW.milestone_id
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_project
  FROM public.projects
  WHERE id = v_milestone.project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'invoice milestone latch: project % not found', v_milestone.project_id
      USING ERRCODE = '23514';
  END IF;

  IF current_user = 'authenticated'
     AND NOT (
       v_project.designer_id = auth.uid()
       OR EXISTS (
         SELECT 1
         FROM public.organizations AS organization
         JOIN public.organization_members AS membership
           ON membership.organization_id = organization.id
         WHERE organization.id = v_project.studio_id
           AND organization.type = 'design_studio'
           AND organization.status = 'active'
           AND membership.user_id = auth.uid()
           AND membership.status = 'active'
           AND membership.role <> 'guest'
       )
     )
  THEN
    RAISE EXCEPTION
      'invoice milestone latch: milestone % not found or access denied',
      NEW.milestone_id USING ERRCODE = '42501';
  END IF;

  IF v_invoice.project_id IS DISTINCT FROM v_milestone.project_id
     OR v_invoice.client_id IS DISTINCT FROM v_project.client_id
     OR v_invoice.studio_id IS DISTINCT FROM v_project.studio_id
     OR NOT (
       v_invoice.designer_id = v_project.designer_id
       OR EXISTS (
         SELECT 1
         FROM public.project_team_members AS historical_lead
         WHERE historical_lead.project_id = v_project.id
           AND historical_lead.user_id = v_invoice.designer_id
           AND historical_lead.role = 'previous_lead'
       )
     )
     OR NEW.kind IS DISTINCT FROM 'milestone'
     OR NEW.quantity IS DISTINCT FROM 1
     OR NEW.unit_amount_cents IS DISTINCT FROM v_milestone.amount_cents
     OR NEW.amount_cents IS DISTINCT FROM v_milestone.amount_cents
  THEN
    RAISE EXCEPTION
      'invoice milestone latch: line % does not exactly match milestone %',
      NEW.id, NEW.milestone_id USING ERRCODE = '23514';
  END IF;

  IF v_milestone.status = 'paid' THEN
    RAISE EXCEPTION
      'invoice milestone latch: paid milestone % cannot be attached to a draft invoice',
      NEW.milestone_id USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.milestone_id IS NOT DISTINCT FROM NEW.milestone_id
     AND OLD.invoice_id IS NOT DISTINCT FROM NEW.invoice_id
     AND v_milestone.invoice_id IS NOT DISTINCT FROM NEW.invoice_id
  THEN
    RETURN NEW;
  END IF;

  IF v_milestone.invoice_id IS NOT NULL
     AND v_milestone.invoice_id <> NEW.invoice_id
  THEN
    SELECT * INTO v_previous_invoice
    FROM public.invoices
    WHERE id = v_milestone.invoice_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION
        'invoice milestone latch: existing invoice % is unavailable for milestone %',
        v_milestone.invoice_id, NEW.milestone_id USING ERRCODE = '23514';
    ELSIF v_previous_invoice.status <> 'void'
       AND (
         v_previous_invoice.status = 'draft'
         AND v_previous_invoice.project_id = v_milestone.project_id
         AND v_previous_invoice.studio_id IS NOT DISTINCT FROM
             v_project.studio_id
         AND v_previous_invoice.designer_id IS NOT DISTINCT FROM
             v_invoice.designer_id
         AND v_previous_invoice.client_id IS NOT DISTINCT FROM
             v_invoice.client_id
         AND v_previous_invoice.currency IS NOT DISTINCT FROM v_invoice.currency
         AND v_previous_invoice.subtotal_cents = v_milestone.amount_cents
         AND v_previous_invoice.tax_cents = 0
         AND v_previous_invoice.total_cents = v_milestone.amount_cents
         AND v_previous_invoice.amount_paid_cents = 0
         AND v_previous_invoice.stripe_checkout_session_id IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM public.invoice_line_items AS line
           WHERE line.invoice_id = v_previous_invoice.id
         )
         AND NOT EXISTS (
           SELECT 1 FROM public.invoice_payments AS payment
           WHERE payment.invoice_id = v_previous_invoice.id
         )
         AND NOT EXISTS (
           SELECT 1 FROM public.invoice_checkout_attempts AS attempt
           WHERE attempt.invoice_id = v_previous_invoice.id
         )
         AND NOT EXISTS (
           SELECT 1 FROM public.project_time_entries AS entry
           WHERE entry.invoice_id = v_previous_invoice.id
         )
         AND NOT EXISTS (
           SELECT 1 FROM public.designer_earnings AS earning
           WHERE earning.invoice_id = v_previous_invoice.id
         )
         AND NOT EXISTS (
           SELECT 1 FROM public.concierge_orders AS order_row
           WHERE order_row.client_invoice_id = v_previous_invoice.id
         )
       ) IS NOT TRUE
    THEN
      RAISE EXCEPTION
        'invoice milestone latch: milestone % is already latched to invoice %',
        NEW.milestone_id, v_milestone.invoice_id USING ERRCODE = '23514';
    END IF;
  END IF;

  UPDATE public.project_payment_milestones
  SET invoice_id = NEW.invoice_id, status = 'pending', due_date = NULL,
      paid_at = NULL, updated_at = now()
  WHERE id = NEW.milestone_id
    AND invoice_id IS NOT DISTINCT FROM v_milestone.invoice_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION
      'invoice milestone latch: milestone % changed concurrently',
      NEW.milestone_id USING ERRCODE = '40001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL PRIVILEGES ON FUNCTION
  public.sync_invoice_line_milestone_latch()
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
DROP TRIGGER IF EXISTS sync_invoice_line_milestone_latch_trg
  ON public.invoice_line_items;
CREATE TRIGGER sync_invoice_line_milestone_latch_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.invoice_line_items
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_invoice_line_milestone_latch();

COMMENT ON FUNCTION public.sync_invoice_line_milestone_latch() IS
  'Exact invoice/project milestone latch validation: draft attachment is canonical; authenticated direct detach is denied; owner/service detach is accepted only after void released the latch; the AFTER trigger takes no parent row locks.';

CREATE OR REPLACE FUNCTION public.generate_milestone_invoice(p_milestone_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_designer uuid;
BEGIN
  SELECT project.designer_id INTO v_designer
  FROM public.project_payment_milestones AS milestone
  JOIN public.projects AS project ON project.id = milestone.project_id
  WHERE milestone.id = p_milestone_id
    AND (
      project.designer_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.organizations AS organization
        JOIN public.organization_members AS membership
          ON membership.organization_id = organization.id
        WHERE organization.id = project.studio_id
          AND organization.type = 'design_studio'
          AND organization.status = 'active'
          AND membership.user_id = auth.uid()
          AND membership.status = 'active'
          AND membership.role <> 'guest'
      )
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'milestone not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN public.draft_invoice_from_milestone(p_milestone_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_client_project_review_bundle(p_edition_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_edition public.project_review_editions%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_studio boolean;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'review not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT edition.* INTO v_edition
  FROM public.project_review_editions AS edition
  JOIN public.projects AS project ON project.id = edition.project_id
  WHERE edition.id = p_edition_id
    AND edition.status IN ('published', 'superseded', 'finalized')
    AND (
      project.designer_id = v_actor
      OR EXISTS (
        SELECT 1
        FROM public.organizations AS organization
        JOIN public.organization_members AS membership
          ON membership.organization_id = organization.id
        WHERE organization.id = project.studio_id
          AND organization.type = 'design_studio'
          AND organization.status = 'active'
          AND membership.user_id = v_actor
          AND membership.status = 'active'
          AND membership.role <> 'guest'
      )
      OR EXISTS (
        SELECT 1
        FROM public.project_review_access AS access
        WHERE access.edition_id = edition.id
          AND access.actor_id = v_actor
          AND access.status = 'active'
          AND (access.expires_at IS NULL OR access.expires_at > now())
      )
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'review not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO STRICT v_project
  FROM public.projects
  WHERE id = v_edition.project_id;
  v_studio := v_project.designer_id = v_actor OR EXISTS (
    SELECT 1
    FROM public.organizations AS organization
    JOIN public.organization_members AS membership
      ON membership.organization_id = organization.id
    WHERE organization.id = v_project.studio_id
      AND organization.type = 'design_studio'
      AND organization.status = 'active'
      AND membership.user_id = v_actor
      AND membership.status = 'active'
      AND membership.role <> 'guest'
  );

  RETURN jsonb_build_object(
    'edition', jsonb_build_object(
      'id', v_edition.id,
      'number', v_edition.edition_number,
      'title', v_edition.title,
      'status', v_edition.status,
      'publishedAt', v_edition.published_at,
      'priceMode', v_edition.client_price_mode,
      'snapshotHash', v_edition.snapshot_hash
    ),
    'project', jsonb_build_object('id', v_project.id, 'name', v_project.name),
    'rooms', v_edition.room_snapshot,
    'boards', v_edition.board_snapshot,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', item.id,
        'selectionId', item.source_ffe_item_id,
        'threadId', item.selection_thread_id,
        'snapshot', (item.item_snapshot - 'media') || jsonb_build_object(
          'media', COALESCE((
            SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
              'id', media->>'id',
              'kind', media->>'kind',
              'checksumSha256', media->>'checksumSha256'
            )) ORDER BY media->>'kind', media->>'id')
            FROM jsonb_array_elements(item.media_manifest) AS media
          ), '[]'::jsonb)
        ),
        'contentHash', item.content_hash,
        'feedback', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', feedback.id,
            'verdict', feedback.verdict,
            'body', feedback.body,
            'createdAt', feedback.created_at
          ) ORDER BY feedback.created_at)
          FROM public.item_feedback AS feedback
          WHERE feedback.project_review_item_id = item.id
            AND (v_studio OR feedback.client_id = v_actor)
        ), '[]'::jsonb)
      ) ORDER BY item.sort_order, item.id)
      FROM public.project_review_items AS item
      WHERE item.edition_id = v_edition.id
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reply_to_item_feedback(
  p_feedback_id uuid,
  p_body text
)
RETURNS public.item_feedback_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_fb public.item_feedback;
  v_event public.item_feedback_events;
  v_text text := btrim(COALESCE(p_body, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'feedback not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_text = '' THEN
    RAISE EXCEPTION 'a reply is required' USING ERRCODE = 'check_violation';
  END IF;

  SELECT feedback.* INTO v_fb
  FROM public.item_feedback AS feedback
  WHERE feedback.id = p_feedback_id
    AND (
      feedback.client_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.item_feedback_gate(
          feedback.proposal_item_id,
          feedback.ffe_item_id,
          feedback.board_item_id
        ) AS gate
        WHERE gate.designer_id = auth.uid()
      )
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'feedback not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.item_feedback_events (feedback_id, actor, kind, body)
  VALUES (p_feedback_id, auth.uid(), 'replied', v_text)
  RETURNING * INTO v_event;

  UPDATE public.item_feedback
  SET updated_at = now()
  WHERE id = p_feedback_id;
  RETURN v_event;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_proposal_change(
  p_proposal_id uuid,
  p_feedback text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_feedback text := btrim(COALESCE(p_feedback, ''));
  v_previous_feedback_id text := current_setting(
    'app.proposal_feedback_id', true
  );
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'proposal not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_feedback = '' THEN
    RAISE EXCEPTION 'change-request feedback is required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_proposal
  FROM public.proposals
  WHERE id = p_proposal_id
    AND client_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_proposal.status NOT IN ('sent', 'viewed') THEN
    RAISE EXCEPTION 'proposal % is not open for change requests (%)',
      p_proposal_id, v_proposal.status
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.proposal_feedback_id', p_proposal_id::text, true);
  UPDATE public.proposals
  SET client_feedback = v_feedback,
      updated_at = now()
  WHERE id = p_proposal_id;
  PERFORM set_config(
    'app.proposal_feedback_id', COALESCE(v_previous_feedback_id, ''), true
  );

  INSERT INTO public.proposal_engagement (
    proposal_id, viewer_id, event_type, metadata
  ) VALUES (
    p_proposal_id, auth.uid(), 'change_requested',
    jsonb_build_object('via', 'request_proposal_change')
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.proposal_feedback_id', COALESCE(v_previous_feedback_id, ''), true
  );
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_sms_message(
  p_message_id uuid,
  p_action text,
  p_effect jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_msg public.sms_messages;
  v_conversation public.sms_conversations;
  v_party public.project_parties;
  v_party_id uuid;
  v_effect jsonb;
  v_result jsonb := '{}'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'message not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT message, conversation, party
  INTO v_msg, v_conversation, v_party
  FROM public.sms_messages AS message
  JOIN public.sms_conversations AS conversation
    ON conversation.id = message.conversation_id
  LEFT JOIN LATERAL (
    SELECT count(*) AS party_count,
           (array_agg(candidate.id ORDER BY candidate.id))[1] AS party_id
    FROM public.project_parties AS candidate
    WHERE candidate.phone_e164 = conversation.phone_e164
  ) AS phone_match
    ON message.party_id IS NULL
   AND conversation.party_id IS NULL
  JOIN public.project_parties AS party
    ON party.id = COALESCE(
      message.party_id, conversation.party_id, phone_match.party_id
    )
  JOIN public.projects AS project
    ON project.id = party.project_id
  WHERE message.id = p_message_id
    AND NOT (
      message.party_id IS NOT NULL
      AND conversation.party_id IS NOT NULL
      AND message.party_id <> conversation.party_id
    )
    AND party.phone_e164 = conversation.phone_e164
    AND (
      message.project_id IS NULL
      OR message.project_id = project.id
    )
    AND (
      conversation.active_project_id IS NULL
      OR conversation.active_project_id = project.id
    )
    AND (
      COALESCE(message.party_id, conversation.party_id) IS NOT NULL
      OR phone_match.party_count = 1
    )
    AND (
      project.designer_id = auth.uid()
      OR public.is_project_team_member(project.id, auth.uid())
    )
  FOR UPDATE OF message, conversation, project
  FOR SHARE OF party;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'message not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_party_id := v_party.id;

  IF p_action = 'apply' THEN
    v_effect := COALESCE(p_effect, v_msg.parsed_intent);
    IF v_effect IS NULL THEN
      RAISE EXCEPTION 'review_sms_message: nothing to apply (no effect or party)'
        USING ERRCODE = 'check_violation';
    END IF;
    v_result := public.apply_field_effect(
      v_party_id, v_effect, 'triage', p_message_id
    );
  ELSIF p_action <> 'dismiss' THEN
    RAISE EXCEPTION 'review_sms_message: unknown action %', p_action
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.sms_messages
  SET needs_review = false,
      reviewed_at = now(),
      reviewed_by = auth.uid()
  WHERE id = p_message_id
    AND conversation_id = v_conversation.id
    AND party_id IS NOT DISTINCT FROM v_msg.party_id
    AND project_id IS NOT DISTINCT FROM v_msg.project_id;

  RETURN jsonb_build_object('action', p_action, 'result', v_result);
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_field_effect(
  p_party_id uuid,
  p_effect jsonb,
  p_source text DEFAULT 'sms',
  p_sms_message_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_target_id uuid := NULLIF(p_effect#>>'{target,id}', '')::uuid;
  v_result jsonb;
  v_previous_decision_write_id text := current_setting(
    'app.client_decision_write_id', true
  );
BEGIN
  IF p_effect#>>'{target,kind}' = 'coordination' AND v_target_id IS NOT NULL THEN
    PERFORM set_config('app.client_decision_write_id', v_target_id::text, true);
  END IF;

  v_result := public._apply_field_effect_legacy_00399(
    p_party_id, p_effect, p_source, p_sms_message_id
  );
  PERFORM set_config(
    'app.client_decision_write_id',
    COALESCE(v_previous_decision_write_id, ''), true
  );
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.client_decision_write_id',
    COALESCE(v_previous_decision_write_id, ''), true
  );
  RAISE;
END;
$$;

REVOKE ALL PRIVILEGES ON FUNCTION
  public.apply_field_effect(uuid, jsonb, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION
  public.apply_field_effect(uuid, jsonb, text, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.reassign_project_lead(
  p_project_id uuid,
  p_expected_designer_id uuid,
  p_new_designer_id uuid
)
RETURNS public.projects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_old_relationship public.designer_clients%ROWTYPE;
  v_new_relationship_id uuid;
  v_studio_id uuid;
  v_actor_name text;
  v_decision record;
  v_previous_reassignment_id text := current_setting(
    'app.project_reassignment_id', true
  );
  v_previous_decision_write_id text := current_setting(
    'app.client_decision_write_id', true
  );
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_new_designer_id IS NULL THEN
    RAISE EXCEPTION 'a new lead designer is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_project
  FROM public.projects AS project
  WHERE project.id = p_project_id
    AND (
      project.designer_id = v_actor
      OR EXISTS (
        SELECT 1
        FROM public.organization_members AS actor_membership
        WHERE actor_membership.organization_id = project.studio_id
          AND actor_membership.user_id = v_actor
          AND actor_membership.status = 'active'
          AND actor_membership.role IN ('owner', 'admin')
      )
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_project.designer_id IS DISTINCT FROM p_expected_designer_id THEN
    RAISE EXCEPTION 'project % lead changed since it was loaded', p_project_id
      USING ERRCODE = 'serialization_failure';
  END IF;
  IF v_project.status IN ('completed', 'archived') THEN
    RAISE EXCEPTION 'terminal project lead is immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT organization.id INTO v_studio_id
  FROM public.organizations AS organization
  JOIN public.organization_members AS old_membership
    ON old_membership.organization_id = organization.id
  JOIN public.organization_members AS new_membership
    ON new_membership.organization_id = organization.id
  WHERE organization.id = v_project.studio_id
    AND old_membership.user_id = v_project.designer_id
    AND old_membership.status = 'active'
    AND old_membership.role <> 'guest'
    AND new_membership.user_id = p_new_designer_id
    AND new_membership.status = 'active'
    AND new_membership.role <> 'guest'
    AND organization.type = 'design_studio'
    AND organization.status = 'active'
    AND (
      v_actor = v_project.designer_id
      OR EXISTS (
        SELECT 1
        FROM public.organization_members AS actor_membership
        WHERE actor_membership.organization_id = organization.id
          AND actor_membership.user_id = v_actor
          AND actor_membership.status = 'active'
          AND actor_membership.role IN ('owner', 'admin')
      )
    )
  ORDER BY organization.id
  LIMIT 1;

  IF v_studio_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.profiles
       WHERE id = p_new_designer_id
         AND is_designer IS TRUE
     )
  THEN
    RAISE EXCEPTION
      'lead reassignment requires the current lead or an exact-studio owner/admin and an active designer target'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_new_designer_id = v_project.designer_id THEN
    RETURN v_project;
  END IF;

  SELECT * INTO v_old_relationship
  FROM public.designer_clients
  WHERE (
      v_project.proposal_id IS NOT NULL
      AND id = (
        SELECT proposal.designer_client_id
        FROM public.proposals AS proposal
        WHERE proposal.id = v_project.proposal_id
      )
    ) OR (
      v_project.proposal_id IS NULL
      AND designer_id = v_project.designer_id
      AND client_id = v_project.client_id
    )
  ORDER BY (status <> 'lead') DESC, created_at, id
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'project has no canonical designer-client relationship'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.designer_clients (
    designer_id, client_id, client_name, client_email, nickname,
    status, source, first_project_at, last_project_at
  ) VALUES (
    p_new_designer_id, v_project.client_id,
    v_old_relationship.client_name, v_old_relationship.client_email,
    v_old_relationship.nickname, 'active',
    COALESCE(v_old_relationship.source, 'direct'),
    COALESCE(v_old_relationship.first_project_at, now()), now()
  )
  ON CONFLICT (designer_id, client_id)
    WHERE client_id IS NOT NULL AND status <> 'lead'
  DO UPDATE SET last_project_at = now(), updated_at = now()
  RETURNING id INTO v_new_relationship_id;

  INSERT INTO public.project_team_members (
    project_id, user_id, role, assigned_by, removed_at
  ) VALUES (
    p_project_id, v_project.designer_id, 'previous_lead', v_actor, NULL
  )
  ON CONFLICT (project_id, user_id, role)
  DO UPDATE SET removed_at = NULL,
                assigned_by = EXCLUDED.assigned_by,
                updated_at = now();

  UPDATE public.project_team_members
  SET removed_at = now(), updated_at = now()
  WHERE project_id = p_project_id
    AND user_id = v_project.designer_id
    AND role = 'lead_designer'
    AND removed_at IS NULL;

  INSERT INTO public.project_team_members (
    project_id, user_id, role, assigned_by, removed_at
  ) VALUES (
    p_project_id, p_new_designer_id, 'lead_designer', v_actor, NULL
  )
  ON CONFLICT (project_id, user_id, role)
  DO UPDATE SET removed_at = NULL,
                assigned_by = EXCLUDED.assigned_by,
                updated_at = now();

  SELECT full_name INTO v_actor_name
  FROM public.profiles
  WHERE id = v_actor;

  INSERT INTO public.client_activity_log (
    designer_client_id, activity_type, title, metadata, actor_name
  ) VALUES (
    v_old_relationship.id, 'lead_reassigned', 'Lead designer reassigned',
    jsonb_build_object(
      'project_id', p_project_id,
      'old_designer_id', v_project.designer_id,
      'new_designer_id', p_new_designer_id
    ),
    COALESCE(v_actor_name, 'Unknown')
  );

  INSERT INTO public.audit_logs (
    user_id, organization_id, action, resource_type, resource_id,
    old_values, new_values, metadata
  ) VALUES (
    v_actor, v_studio_id, 'project.lead_reassigned', 'project', p_project_id,
    jsonb_build_object('designer_id', v_project.designer_id),
    jsonb_build_object('designer_id', p_new_designer_id),
    jsonb_build_object('via', 'reassign_project_lead')
  );

  PERFORM set_config('app.project_reassignment_id', p_project_id::text, true);
  UPDATE public.projects
  SET designer_id = p_new_designer_id, updated_at = now()
  WHERE id = p_project_id
  RETURNING * INTO v_project;
  PERFORM set_config(
    'app.project_reassignment_id',
    COALESCE(v_previous_reassignment_id, ''), true
  );

  FOR v_decision IN
    SELECT id
    FROM public.client_decisions
    WHERE project_id = p_project_id
      AND linked_proposal_id IS NULL
    ORDER BY id
    FOR UPDATE
  LOOP
    PERFORM set_config('app.client_decision_write_id', v_decision.id::text, true);
    UPDATE public.client_decisions
    SET designer_id = p_new_designer_id,
        designer_client_id = v_new_relationship_id,
        updated_at = now()
    WHERE id = v_decision.id;
  END LOOP;
  PERFORM set_config(
    'app.client_decision_write_id',
    COALESCE(v_previous_decision_write_id, ''), true
  );

  RETURN v_project;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.project_reassignment_id',
    COALESCE(v_previous_reassignment_id, ''), true
  );
  PERFORM set_config(
    'app.client_decision_write_id',
    COALESCE(v_previous_decision_write_id, ''), true
  );
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_offline_signature(
  p_proposal_id uuid,
  p_signed_name text,
  p_auto_activate boolean DEFAULT true,
  p_start_date date DEFAULT current_date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_decision_id uuid := gen_random_uuid();
  v_engagement_id uuid := gen_random_uuid();
  v_previous_engagement_token text := current_setting(
    'app.proposal_signature_engagement_id', true
  );
  v_previous_decision_insert_id text := current_setting(
    'app.client_decision_insert_id', true
  );
  v_previous_proposal_accept_id text := current_setting(
    'app.proposal_accept_id', true
  );
  v_signed_name text := btrim(COALESCE(p_signed_name, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'proposal not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF char_length(v_signed_name) < 2 THEN
    RAISE EXCEPTION 'a signature name of at least 2 characters is required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_proposal
  FROM public.proposals AS proposal
  WHERE proposal.id = p_proposal_id
    AND (
      proposal.designer_id = auth.uid()
      OR (
        proposal.project_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.projects AS project
          JOIN public.organizations AS organization
            ON organization.id = project.studio_id
          JOIN public.organization_members AS membership
            ON membership.organization_id = organization.id
          WHERE project.id = proposal.project_id
            AND organization.type = 'design_studio'
            AND organization.status = 'active'
            AND membership.user_id = auth.uid()
            AND membership.status = 'active'
            AND membership.role <> 'guest'
        )
      )
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_proposal.status = 'accepted' THEN
    RETURN v_proposal.project_id;
  END IF;
  IF v_proposal.status NOT IN ('sent', 'viewed', 'expired') THEN
    RAISE EXCEPTION 'proposal % is not in a recordable status (%)',
      p_proposal_id, v_proposal.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_proposal.client_id IS NULL
     OR v_proposal.designer_client_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.designer_clients AS relationship
       WHERE relationship.id = v_proposal.designer_client_id
         AND relationship.designer_id IS NOT DISTINCT FROM v_proposal.designer_id
         AND relationship.client_id IS NOT DISTINCT FROM v_proposal.client_id
     )
  THEN
    RAISE EXCEPTION 'proposal % has no exact designer↔client relationship',
      p_proposal_id
      USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM set_config('app.client_decision_insert_id', v_decision_id::text, true);
  INSERT INTO public.client_decisions (
    id, designer_client_id, designer_id, project_id, linked_proposal_id,
    title, decision_type, blocking_status, status,
    client_consent_method, client_signature, client_consented_at,
    sent_at, responded_at, selected_by
  ) VALUES (
    v_decision_id, v_proposal.designer_client_id, v_proposal.designer_id,
    v_proposal.project_id, p_proposal_id, 'Proposal approval', 'approval',
    'non_blocking', 'responded', 'paper', v_signed_name,
    now(), now(), now(), auth.uid()
  )
  ON CONFLICT (linked_proposal_id)
    WHERE decision_type = 'approval' AND linked_proposal_id IS NOT NULL
  DO NOTHING;
  PERFORM set_config(
    'app.client_decision_insert_id',
    COALESCE(v_previous_decision_insert_id, ''), true
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.client_decisions AS approval
    WHERE approval.linked_proposal_id = p_proposal_id
      AND approval.decision_type = 'approval'
      AND approval.designer_client_id = v_proposal.designer_client_id
      AND approval.designer_id = v_proposal.designer_id
  ) THEN
    RAISE EXCEPTION 'proposal approval relationship conflicts with proposal identity'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.proposal_accept_id', p_proposal_id::text, true);
  UPDATE public.proposals
  SET status = 'accepted',
      signed_at = now(),
      signed_by_name = v_signed_name,
      signed_ip = NULL,
      accepted_at = now(),
      updated_at = now()
  WHERE id = p_proposal_id
  RETURNING * INTO v_proposal;
  PERFORM set_config(
    'app.proposal_accept_id', COALESCE(v_previous_proposal_accept_id, ''), true
  );

  PERFORM set_config(
    'app.proposal_signature_engagement_id', v_engagement_id::text, true
  );
  INSERT INTO public.proposal_engagement (
    id, proposal_id, viewer_id, event_type, metadata
  ) VALUES (
    v_engagement_id, p_proposal_id, auth.uid(), 'signed_offline',
    jsonb_build_object(
      'via', 'record_offline_signature',
      'signed_by_name', v_signed_name,
      'recorded_by', auth.uid()
    )
  );
  PERFORM set_config(
    'app.proposal_signature_engagement_id',
    COALESCE(v_previous_engagement_token, ''),
    true
  );

  IF v_proposal.project_id IS NOT NULL THEN
    RETURN v_proposal.project_id;
  ELSIF p_auto_activate THEN
    RETURN public._activate_proposal_as_project_authorized(
      p_proposal_id, p_start_date
    );
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.client_decision_insert_id',
    COALESCE(v_previous_decision_insert_id, ''), true
  );
  PERFORM set_config(
    'app.proposal_accept_id', COALESCE(v_previous_proposal_accept_id, ''), true
  );
  PERFORM set_config(
    'app.proposal_signature_engagement_id',
    COALESCE(v_previous_engagement_token, ''), true
  );
  RAISE;
END;
$$;

REVOKE ALL PRIVILEGES ON FUNCTION public.activate_project_v2(jsonb)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION public.activate_project_v2(jsonb) TO authenticated;

REVOKE ALL PRIVILEGES ON FUNCTION public.apply_scope_change(uuid)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION public.apply_scope_change(uuid) TO authenticated;

REVOKE ALL PRIVILEGES ON FUNCTION
  public.claim_proposal_send_dispatch(
    uuid, uuid, timestamp with time zone, integer
  )
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION
  public.claim_proposal_send_dispatch(
    uuid, uuid, timestamp with time zone, integer
  )
  TO service_role;

REVOKE ALL PRIVILEGES ON FUNCTION public.close_project(uuid, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION public.close_project(uuid, jsonb, jsonb)
  TO authenticated;

REVOKE ALL PRIVILEGES ON FUNCTION public.create_field_link(uuid)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION public.create_field_link(uuid)
  TO authenticated, service_role;

REVOKE ALL PRIVILEGES ON FUNCTION public.decline_proposal(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION public.decline_proposal(uuid, text)
  TO authenticated;

REVOKE ALL PRIVILEGES ON FUNCTION
  public.escalate_item_feedback_to_decision(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION
  public.escalate_item_feedback_to_decision(uuid, uuid) TO authenticated;

REVOKE ALL PRIVILEGES ON FUNCTION
  public.expire_due_client_decisions(timestamp with time zone)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION
  public.expire_due_client_decisions(timestamp with time zone)
  TO service_role;

REVOKE ALL PRIVILEGES ON FUNCTION public.finalize_spec_book_issue(uuid)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION public.finalize_spec_book_issue(uuid)
  TO service_role;

REVOKE ALL PRIVILEGES ON FUNCTION public.generate_milestone_invoice(uuid)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION public.generate_milestone_invoice(uuid)
  TO authenticated;

REVOKE ALL PRIVILEGES ON FUNCTION public.get_ab_variant_stats(uuid)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION public.get_ab_variant_stats(uuid) TO authenticated;

REVOKE ALL PRIVILEGES ON FUNCTION
  public.get_client_project_review_bundle(uuid)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION public.get_client_project_review_bundle(uuid)
  TO authenticated;

REVOKE ALL PRIVILEGES ON FUNCTION public.mark_proposal_viewed(uuid)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION public.mark_proposal_viewed(uuid) TO authenticated;

REVOKE ALL PRIVILEGES ON FUNCTION public.mint_trade_rfq_token(uuid)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION public.mint_trade_rfq_token(uuid) TO service_role;

REVOKE ALL PRIVILEGES ON FUNCTION
  public.persist_proposal_send_request(
    uuid, uuid, text, text, text[], text[], text, boolean
  )
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION
  public.persist_proposal_send_request(
    uuid, uuid, text, text, text[], text[], text, boolean
  ) TO service_role;

REVOKE ALL PRIVILEGES ON FUNCTION
  public.read_proposal_send_dispatch(uuid, uuid, timestamp with time zone)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION
  public.read_proposal_send_dispatch(uuid, uuid, timestamp with time zone)
  TO service_role;

REVOKE ALL PRIVILEGES ON FUNCTION
  public.reassign_project_lead(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION public.reassign_project_lead(uuid, uuid, uuid)
  TO authenticated;

REVOKE ALL PRIVILEGES ON FUNCTION
  public.record_offline_signature(uuid, text, boolean, date)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION
  public.record_offline_signature(uuid, text, boolean, date)
  TO authenticated;

REVOKE ALL PRIVILEGES ON FUNCTION public.reply_to_item_feedback(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION public.reply_to_item_feedback(uuid, text)
  TO authenticated;

REVOKE ALL PRIVILEGES ON FUNCTION public.request_proposal_change(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION public.request_proposal_change(uuid, text)
  TO authenticated;

REVOKE ALL PRIVILEGES ON FUNCTION public.review_sms_message(uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION public.review_sms_message(uuid, text, jsonb)
  TO authenticated;

REVOKE ALL PRIVILEGES ON FUNCTION
  public.stamp_project_approval_reminder_delivery(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION
  public.stamp_project_approval_reminder_delivery(uuid, uuid) TO service_role;

REVOKE ALL PRIVILEGES ON FUNCTION
  public.submit_coordination_revision(uuid, jsonb, text, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION
  public.submit_coordination_revision(uuid, jsonb, text, text, uuid)
  TO authenticated;

REVOKE ALL PRIVILEGES ON FUNCTION public.sync_proposal_send_email_log(uuid)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION public.sync_proposal_send_email_log(uuid)
  TO service_role;

REVOKE ALL PRIVILEGES ON FUNCTION public.sync_proposal_send_in_app_log(uuid)
  FROM PUBLIC, anon, authenticated, service_role, dashboard_user,
       agent_reader, agent_writer, edge_catalog_reader, edge_rls_user;
GRANT EXECUTE ON FUNCTION public.sync_proposal_send_in_app_log(uuid)
  TO service_role;

DO $final_profile_postcondition$
BEGIN
  IF (SELECT count(*) FROM _00486_routine_profile) <> 25 THEN
    RAISE EXCEPTION '00486 exact routine set is not 25 rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _00486_routine_profile AS expected
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
       OR routine.proconfig IS DISTINCT FROM expected.final_config
       OR encode(
            extensions.digest(convert_to(routine.prosrc, 'UTF8'), 'sha256'),
            'hex'
          ) IS DISTINCT FROM expected.final_body_sha256
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
              array_append(expected.final_roles, 'postgres')
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
  ) THEN
    RAISE EXCEPTION '00486 final profile/body/config/ACL postcondition failed';
  END IF;
END
$final_profile_postcondition$;

DO $invoice_line_policy_postcondition$
BEGIN
  IF (
    SELECT count(*)
    FROM pg_policy AS policy
    WHERE policy.polrelid = 'public.invoice_line_items'::regclass
  ) <> 5 OR EXISTS (
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
  ) THEN
    RAISE EXCEPTION '00486 exact invoice-line policy set drifted';
  END IF;
END
$invoice_line_policy_postcondition$;

DO $dependency_profile_postcondition$
BEGIN
  IF (SELECT count(*) FROM _00486_dependency_profile) <> 13 THEN
    RAISE EXCEPTION '00486 exact dependent relay set is not 13 rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _00486_dependency_profile AS expected
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
       OR pg_get_function_arguments(routine.oid) IS DISTINCT FROM
          expected.arguments
       OR pg_get_function_result(routine.oid) IS DISTINCT FROM
          expected.result_type
       OR routine.proconfig IS DISTINCT FROM expected.final_config
       OR encode(
            extensions.digest(convert_to(routine.prosrc, 'UTF8'), 'sha256'),
            'hex'
          ) IS DISTINCT FROM expected.final_body_sha256
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
              array_append(expected.final_roles, 'postgres')
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
  ) THEN
    RAISE EXCEPTION '00486 dependent relay postcondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_trigger AS binding
    WHERE binding.tgfoid = to_regprocedure(
      'public.guard_scope_change_request_integrity()'
    )
      AND NOT binding.tgisinternal
  ) <> 1 OR NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS binding
    WHERE binding.tgname = 'guard_scope_change_request_integrity'
      AND binding.tgrelid = 'public.scope_change_requests'::regclass
      AND binding.tgfoid = to_regprocedure(
        'public.guard_scope_change_request_integrity()'
      )
      AND binding.tgtype = 23
      AND binding.tgenabled = 'O'
      AND NOT binding.tgisinternal
  ) THEN
    RAISE EXCEPTION '00486 scope-change integrity trigger binding drifted';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_trigger AS binding
    WHERE binding.tgfoid = to_regprocedure(
      'public.sync_invoice_line_milestone_latch()'
    )
      AND NOT binding.tgisinternal
  ) <> 1 OR NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS binding
    WHERE binding.tgname = 'sync_invoice_line_milestone_latch_trg'
      AND binding.tgrelid = 'public.invoice_line_items'::regclass
      AND binding.tgfoid = to_regprocedure(
        'public.sync_invoice_line_milestone_latch()'
      )
      AND binding.tgtype = 29
      AND binding.tgenabled = 'O'
      AND binding.tgnargs = 0
      AND octet_length(binding.tgargs) = 0
      AND binding.tgqual IS NULL
      AND binding.tgattr::text = ''
      AND NOT binding.tgisinternal
  ) THEN
    RAISE EXCEPTION '00486 invoice milestone latch trigger binding drifted';
  END IF;

  IF position(
    'FOR UPDATE' IN upper((
      SELECT routine.prosrc
      FROM pg_proc AS routine
      WHERE routine.oid = to_regprocedure(
        'public.sync_invoice_line_milestone_latch()'
      )
    ))
  ) > 0 THEN
    RAISE EXCEPTION '00486 line latch reacquired an AFTER-trigger parent lock';
  END IF;

  IF obj_description(
    to_regprocedure('public.sync_invoice_line_milestone_latch()'),
    'pg_proc'
  ) IS DISTINCT FROM
    'Exact invoice/project milestone latch validation: draft attachment is canonical; authenticated direct detach is denied; owner/service detach is accepted only after void released the latch; the AFTER trigger takes no parent row locks.'
  THEN
    RAISE EXCEPTION '00486 invoice milestone latch authority comment drifted';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc AS caller
    WHERE caller.prosecdef
      AND position(
        '_finalize_spec_book_issue_00403' IN caller.prosrc
      ) > 0
  ) THEN
    RAISE EXCEPTION '00486 retired finalizer still has a definer caller';
  END IF;

  IF (
    SELECT array_agg(caller.oid ORDER BY caller.oid)
    FROM pg_proc AS caller
    WHERE position(
      'public._scope_change_requester_can_author(' IN caller.prosrc
    ) > 0
  ) IS DISTINCT FROM (
    SELECT array_agg(signature::regprocedure::oid ORDER BY signature::regprocedure::oid)
    FROM unnest(ARRAY[
      'public.accept_client_scope_change_request(uuid,uuid)',
      'public.apply_scope_change(uuid)',
      'public.approve_scope_change_request(uuid,uuid,text,text)',
      'public.cancel_scope_change_request(uuid,uuid)',
      'public.decline_scope_change_request(uuid,uuid,text)',
      'public.send_scope_change_request(uuid,uuid)'
    ]) AS expected(signature)
  ) THEN
    RAISE EXCEPTION '00486 scope-change helper caller graph drifted';
  END IF;

  IF EXISTS (
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
      ON caller.oid = to_regprocedure(expected.signature)
    WHERE position(
      expected.call_fragment IN regexp_replace(
        caller.prosrc, '[[:space:]]+', ' ', 'g'
      )
    ) = 0
  ) THEN
    RAISE EXCEPTION '00486 scope-change caller lost exact project argument';
  END IF;

  IF (
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
    to_regprocedure('public.draft_invoice_from_milestone(uuid)')::oid
  ] THEN
    RAISE EXCEPTION '00486 milestone-invoice legacy core caller graph drifted';
  END IF;

  IF (
    SELECT array_agg(caller.oid ORDER BY caller.oid)
    FROM pg_proc AS caller
    JOIN pg_namespace AS caller_namespace
      ON caller_namespace.oid = caller.pronamespace
    WHERE caller_namespace.nspname !~ '^pg_'
      AND caller_namespace.nspname <> 'information_schema'
      AND pg_temp._00486_references_routine(
        caller.prosrc, 'public', 'draft_invoice_from_milestone'
      )
  ) IS DISTINCT FROM (
    SELECT array_agg(signature::regprocedure::oid ORDER BY signature::regprocedure::oid)
    FROM unnest(ARRAY[
      'public._activate_proposal_as_project_impl(uuid,date)',
      'public._draft_invoice_from_milestone_00486(uuid)',
      'public.draft_milestones_on_production_start()',
      'public.generate_milestone_invoice(uuid)',
      'public.settle_section_on_gate_approval()'
    ]) AS expected(signature)
  ) THEN
    RAISE EXCEPTION '00486 milestone-invoice wrapper caller graph drifted';
  END IF;

  IF (
    SELECT array_agg(caller.oid ORDER BY caller.oid)
    FROM pg_proc AS caller
    WHERE position('public.apply_field_effect(' IN caller.prosrc) > 0
  ) IS DISTINCT FROM ARRAY[
    to_regprocedure('public.review_sms_message(uuid,text,jsonb)')::oid
  ] OR (
    SELECT array_agg(caller.oid ORDER BY caller.oid)
    FROM pg_proc AS caller
    WHERE position(
      'public._apply_field_effect_legacy_00399(' IN caller.prosrc
    ) > 0
  ) IS DISTINCT FROM ARRAY[
    to_regprocedure('public.apply_field_effect(uuid,jsonb,text,uuid)')::oid
  ] THEN
    RAISE EXCEPTION '00486 SMS field-effect relay caller graph drifted';
  END IF;
END
$dependency_profile_postcondition$;

COMMIT;
