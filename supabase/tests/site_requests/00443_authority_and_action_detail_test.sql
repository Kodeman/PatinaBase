-- Site Request exact-studio authority and action-detail contract (00443).
\set ON_ERROR_STOP on

BEGIN;

DO $structure$
DECLARE
  v_detail_definition text := pg_get_functiondef(
    'public.get_site_request_action_detail(uuid,uuid)'::regprocedure
  );
  v_authority_definition text := pg_get_functiondef(
    'public._site_request_designer_authorized(uuid)'::regprocedure
  );
  v_close_definition text := pg_get_functiondef(
    'public.site_request_close(uuid)'::regprocedure
  );
  v_policy_count integer;
BEGIN
  ASSERT pg_get_function_arguments(
    'public.get_site_request_action_detail(uuid,uuid)'::regprocedure
  ) = 'p_project_id uuid, p_request_id uuid',
    'action-detail RPC argument names/signature drifted';
  ASSERT pg_get_function_result(
    'public.get_site_request_action_detail(uuid,uuid)'::regprocedure
  ) = 'jsonb', 'action-detail RPC return type drifted';
  ASSERT v_detail_definition LIKE '%STABLE%'
     AND v_detail_definition LIKE '%SECURITY DEFINER%'
     AND v_detail_definition LIKE '%search_path TO ''public'', ''pg_temp''%'
     AND v_detail_definition LIKE '%is_design_studio_comember%'
     AND v_detail_definition LIKE '%site_request_item_versions%'
     AND v_detail_definition LIKE '%site_deliverables%'
     AND v_detail_definition LIKE '%project_rooms%'
     AND v_detail_definition !~* '\m(insert|update|delete|merge|call)\M',
    'action-detail RPC lost its read-only/exact-authority contract';
  ASSERT v_detail_definition NOT LIKE '%site_request_access%'
     AND v_detail_definition NOT LIKE '%site_request_events%'
     AND v_detail_definition NOT LIKE '%site_deliverable_media%'
     AND v_detail_definition NOT LIKE '%assignee_phone_snapshot%'
     AND v_detail_definition NOT LIKE '%configuration%'
     AND v_detail_definition NOT LIKE '%payload%',
    'action-detail RPC references a private Site Request rail';

  ASSERT has_function_privilege(
    'authenticated',
    'public.get_site_request_action_detail(uuid,uuid)',
    'EXECUTE'
  ), 'authenticated exact-studio actors cannot call action detail';
  ASSERT NOT has_function_privilege(
    'anon', 'public.get_site_request_action_detail(uuid,uuid)', 'EXECUTE'
  ) AND NOT has_function_privilege(
    'service_role', 'public.get_site_request_action_detail(uuid,uuid)', 'EXECUTE'
  ), 'anon/service received the authenticated action-detail rail';

  ASSERT v_authority_definition LIKE '%SECURITY DEFINER%'
     AND v_authority_definition LIKE '%search_path TO ''public'', ''pg_temp''%'
     AND v_authority_definition LIKE '%is_design_studio_comember%'
     AND v_authority_definition NOT LIKE '%is_studio_comember(%',
    'Site Request writer authority is not exact-design-studio scoped';
  ASSERT NOT has_function_privilege(
    'authenticated', 'public._site_request_designer_authorized(uuid)', 'EXECUTE'
  ) AND NOT has_function_privilege(
    'service_role', 'public._site_request_designer_authorized(uuid)', 'EXECUTE'
  ), 'private Site Request authority helper is callable directly';

  ASSERT pg_get_function_arguments(
    'public.site_request_nudge(uuid,text)'::regprocedure
  ) = 'p_request_id uuid, p_note text DEFAULT NULL::text'
     AND pg_get_function_arguments(
       'public.site_request_approve_item(uuid,uuid,uuid)'::regprocedure
     ) = 'p_item_id uuid, p_deliverable_id uuid, p_room_id uuid DEFAULT NULL::uuid'
     AND pg_get_function_arguments(
       'public.site_request_redo_item(uuid,text)'::regprocedure
     ) = 'p_item_id uuid, p_note text'
     AND pg_get_function_arguments(
       'public.site_request_close(uuid)'::regprocedure
     ) = 'p_request_id uuid',
    'installed Site Request mutation argument names/signatures drifted';
  ASSERT v_close_definition LIKE '%FOR UPDATE%'
     AND v_close_definition LIKE '%status <> ''completed''%'
     AND v_close_definition LIKE '%_site_request_designer_authorized%',
    'close no longer locks and enforces exact completed state';

  SELECT count(*) INTO v_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND policyname IN (
      'site_requests_designer_read',
      'site_request_items_designer_read',
      'site_request_versions_designer_read',
      'site_deliverables_designer_read'
    )
    AND qual LIKE '%is_design_studio_comember%'
    AND qual NOT LIKE '%is_studio_comember(%';
  ASSERT v_policy_count = 4,
    'all four raw Site Request read policies must use exact studio authority';
END
$structure$;

CREATE OR REPLACE FUNCTION pg_temp.assume_actor(p_actor uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', p_actor::text,
      'role', 'authenticated',
      'aal', 'aal1'
    )::text,
    true
  );
END;
$$;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('a4430000-0000-4000-8000-000000000001', 'site-authority-owner@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4430000-0000-4000-8000-000000000002', 'site-authority-studio-peer@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4430000-0000-4000-8000-000000000003', 'site-authority-contractor@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4430000-0000-4000-8000-000000000004', 'site-authority-manufacturer@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4430000-0000-4000-8000-000000000005', 'site-authority-foreign@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer)
VALUES
  ('a4430000-0000-4000-8000-000000000001', 'site-authority-owner@test.invalid', 'Site Authority Owner', true),
  ('a4430000-0000-4000-8000-000000000002', 'site-authority-studio-peer@test.invalid', 'Site Authority Studio Peer', true),
  ('a4430000-0000-4000-8000-000000000003', 'site-authority-contractor@test.invalid', 'Contractor Org Peer', false),
  ('a4430000-0000-4000-8000-000000000004', 'site-authority-manufacturer@test.invalid', 'Manufacturer Org Peer', false),
  ('a4430000-0000-4000-8000-000000000005', 'site-authority-foreign@test.invalid', 'Foreign Actor', false)
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('a4431000-0000-4000-8000-000000000001', 'design_studio', '00443 Design Studio', 'site-authority-design-studio', 'active'),
  ('a4431000-0000-4000-8000-000000000002', 'contractor', '00443 Contractor', 'site-authority-contractor', 'active'),
  ('a4431000-0000-4000-8000-000000000003', 'manufacturer', '00443 Manufacturer', 'site-authority-manufacturer', 'active');

INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
) VALUES
  ('a4431100-0000-4000-8000-000000000001', 'a4430000-0000-4000-8000-000000000001', 'a4431000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('a4431100-0000-4000-8000-000000000002', 'a4430000-0000-4000-8000-000000000002', 'a4431000-0000-4000-8000-000000000001', 'member', 'active', now()),
  ('a4431100-0000-4000-8000-000000000003', 'a4430000-0000-4000-8000-000000000001', 'a4431000-0000-4000-8000-000000000002', 'owner', 'active', now()),
  ('a4431100-0000-4000-8000-000000000004', 'a4430000-0000-4000-8000-000000000003', 'a4431000-0000-4000-8000-000000000002', 'member', 'active', now()),
  ('a4431100-0000-4000-8000-000000000005', 'a4430000-0000-4000-8000-000000000001', 'a4431000-0000-4000-8000-000000000003', 'owner', 'active', now()),
  ('a4431100-0000-4000-8000-000000000006', 'a4430000-0000-4000-8000-000000000004', 'a4431000-0000-4000-8000-000000000003', 'member', 'active', now());

INSERT INTO public.projects (
  id, name, designer_id, created_by, studio_id, status
) VALUES (
  'a4432000-0000-4000-8000-000000000001',
  '00443 Site Request Authority Project',
  'a4430000-0000-4000-8000-000000000001',
  'a4430000-0000-4000-8000-000000000001',
  'a4431000-0000-4000-8000-000000000001',
  'active'
);

INSERT INTO public.project_rooms (id, project_id, name, sort_order)
VALUES
  ('a4432100-0000-4000-8000-000000000001', 'a4432000-0000-4000-8000-000000000001', 'Kitchen', 0),
  ('a4432100-0000-4000-8000-000000000002', 'a4432000-0000-4000-8000-000000000001', 'Living Room', 1);

INSERT INTO public.project_parties (
  id, project_id, party_kind, display_name, phone, trade, sms_consent_status,
  sms_consented_at
) VALUES (
  'a4432200-0000-4000-8000-000000000001',
  'a4432000-0000-4000-8000-000000000001',
  'gc', 'Private 00443 Field Party', '3125550443',
  'General contractor', 'granted', now()
);

CREATE TEMP TABLE site_request_443_fixture (
  request_id uuid PRIMARY KEY,
  item_id uuid NOT NULL,
  version_id uuid NOT NULL,
  over_cap_request_id uuid NOT NULL,
  incoherent_request_id uuid NOT NULL,
  first_deliverable_id uuid,
  second_deliverable_id uuid,
  token_hash text NOT NULL
);
GRANT SELECT, INSERT, UPDATE ON site_request_443_fixture
  TO authenticated, service_role;

SELECT pg_temp.assume_actor('a4430000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
DO $mobile_create_send$
DECLARE
  v_request_id uuid;
  v_item_id uuid;
  v_version_id uuid;
  v_over_cap_request_id uuid;
  v_incoherent_request_id uuid;
  v_over_cap_items jsonb;
  v_dispatch jsonb;
BEGIN
  v_request_id := public.site_request_create_draft(
    'a4432000-0000-4000-8000-000000000001',
    'a4432200-0000-4000-8000-000000000001',
    now() + interval '3 days',
    'before site verification',
    'Private request note must never enter action detail.',
    jsonb_build_array(jsonb_build_object(
      'client_item_id', 'a4432300-0000-4000-8000-000000000001',
      'sort_order', 0,
      'kit_code', 'K-01',
      'title', 'Roomless opening measurement',
      'guidance', 'Private field guidance must remain hidden.',
      'room_id', NULL,
      'configuration', jsonb_build_object('privateInternal', 'do-not-project')
    ))
  );
  SELECT item.id, item.current_version_id
  INTO v_item_id, v_version_id
  FROM public.site_request_items AS item
  WHERE item.request_id = v_request_id;

  v_dispatch := public.site_request_send(v_request_id);
  ASSERT v_dispatch->>'action' = 'send'
     AND NOT (v_dispatch->>'needs_consent')::boolean,
    'canonical mobile send did not enqueue an exact granted-consent dispatch';

  SELECT jsonb_agg(
    jsonb_build_object(
      'client_item_id', gen_random_uuid(),
      'sort_order', ordinal - 1,
      'kit_code', 'K-01',
      'title', 'Bounded detail item ' || ordinal,
      'room_id', NULL
    ) ORDER BY ordinal
  )
  INTO v_over_cap_items
  FROM generate_series(1, 101) AS ordinal;
  v_over_cap_request_id := public.site_request_create_draft(
    'a4432000-0000-4000-8000-000000000001',
    'a4432200-0000-4000-8000-000000000001',
    now() + interval '4 days', NULL, NULL, v_over_cap_items
  );
  v_incoherent_request_id := public.site_request_create_draft(
    'a4432000-0000-4000-8000-000000000001',
    'a4432200-0000-4000-8000-000000000001',
    now() + interval '4 days', NULL, NULL,
    jsonb_build_array(jsonb_build_object(
      'client_item_id', 'a4432300-0000-4000-8000-000000000099',
      'sort_order', 0,
      'kit_code', 'K-01',
      'title', 'Incoherent current version',
      'room_id', NULL
    ))
  );

  INSERT INTO site_request_443_fixture(
    request_id, item_id, version_id, over_cap_request_id,
    incoherent_request_id, token_hash
  ) VALUES (
    v_request_id, v_item_id, v_version_id, v_over_cap_request_id,
    v_incoherent_request_id, 'pending'
  );
END
$mobile_create_send$;
RESET ROLE;

-- These two rows model defensive read-time failures that canonical writers
-- prevent: an over-cap source and a mismatched current-version pointer.
SET LOCAL session_replication_role = replica;
UPDATE public.site_requests
SET status = 'sent'
WHERE id IN (
  SELECT over_cap_request_id FROM site_request_443_fixture
  UNION ALL
  SELECT incoherent_request_id FROM site_request_443_fixture
);
UPDATE public.site_request_items
SET current_version_number = current_version_number + 1
WHERE request_id = (
  SELECT incoherent_request_id FROM site_request_443_fixture
);
SET LOCAL session_replication_role = origin;

SET LOCAL ROLE service_role;
DO $service_dispatch_and_guest_delivery$
DECLARE
  v_outbox_id uuid;
  v_claim jsonb;
  v_token text;
  v_token_hash text;
  v_delivery jsonb;
BEGIN
  SELECT outbox.id INTO v_outbox_id
  FROM public.site_request_dispatch_outbox AS outbox
  WHERE outbox.request_id = (SELECT request_id FROM site_request_443_fixture)
    AND outbox.action = 'send'
    AND outbox.status = 'pending';
  v_claim := public.site_request_claim_dispatch(v_outbox_id, now());
  v_token := v_claim->>'token';
  v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');
  PERFORM public.site_request_complete_dispatch(
    v_outbox_id, 'sent', 'sms-00443-send', NULL, now()
  );
  ASSERT public.site_request_guest_bootstrap(v_token_hash) IS NOT NULL,
    'service/guest bootstrap path broke before action-detail review';

  v_delivery := public.site_request_guest_deliver(
    v_token_hash,
    (SELECT version_id FROM site_request_443_fixture),
    'a4432400-0000-4000-8000-000000000001',
    '{"unit_input":"metric","privatePayload":"do-not-project"}'::jsonb,
    '[{"label":"A · floor → sill","value_mm":910},{"label":"B · sill → head","value_mm":1210},{"label":"C · run length","value_mm":1810}]'::jsonb,
    'Private Captured By',
    now()
  );
  UPDATE site_request_443_fixture
  SET token_hash = v_token_hash,
      first_deliverable_id = (v_delivery->>'deliverable_id')::uuid;
END
$service_dispatch_and_guest_delivery$;
RESET ROLE;

CREATE OR REPLACE FUNCTION pg_temp.assert_nonstudio_denied(p_actor uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_request_id uuid := (SELECT request_id FROM site_request_443_fixture);
  v_item_id uuid := (SELECT item_id FROM site_request_443_fixture);
  v_deliverable_id uuid := (
    SELECT first_deliverable_id FROM site_request_443_fixture
  );
  v_detail jsonb;
  v_raised boolean;
BEGIN
  PERFORM pg_temp.assume_actor(p_actor);

  ASSERT (SELECT count(*) FROM public.site_requests WHERE id = v_request_id) = 0,
    'non-design organization peer read raw site_requests';
  ASSERT (SELECT count(*) FROM public.site_request_items WHERE request_id = v_request_id) = 0,
    'non-design organization peer read raw site_request_items';
  ASSERT (
    SELECT count(*)
    FROM public.site_request_item_versions
    WHERE id = (SELECT version_id FROM site_request_443_fixture)
  ) = 0, 'non-design organization peer read raw item versions';
  ASSERT (
    SELECT count(*) FROM public.site_deliverables WHERE id = v_deliverable_id
  ) = 0, 'non-design organization peer read raw deliverables';
  ASSERT public.get_project_contextual_handoffs(
    'a4432000-0000-4000-8000-000000000001'
  ) = '[]'::jsonb,
    'non-design organization peer received contextual Site Request list';

  v_detail := public.get_site_request_action_detail(
    'a4432000-0000-4000-8000-000000000001', v_request_id
  );
  ASSERT v_detail = jsonb_build_object(
    'projectId', 'a4432000-0000-4000-8000-000000000001'::uuid,
    'requestId', v_request_id,
    'coherent', false,
    'items', '[]'::jsonb,
    'rooms', '[]'::jsonb
  ), 'unauthorized action detail must be existence-safe and empty';

  v_raised := false;
  BEGIN
    PERFORM public.site_request_nudge(v_request_id, 'forged nudge');
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'non-design organization peer nudged the request';

  v_raised := false;
  BEGIN
    PERFORM public.site_request_approve_item(
      v_item_id, v_deliverable_id,
      'a4432100-0000-4000-8000-000000000001'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'non-design organization peer approved an item';

  v_raised := false;
  BEGIN
    PERFORM public.site_request_redo_item(v_item_id, 'forged redo');
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'non-design organization peer reopened an item';

  v_raised := false;
  BEGIN
    PERFORM public.site_request_close(v_request_id);
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'non-design organization peer closed a request';
END;
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_nonstudio_denied(
  'a4430000-0000-4000-8000-000000000003'
);
SELECT pg_temp.assert_nonstudio_denied(
  'a4430000-0000-4000-8000-000000000004'
);
RESET ROLE;

SELECT pg_temp.assume_actor('a4430000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
DO $studio_detail_and_mutations$
DECLARE
  v_request_id uuid := (SELECT request_id FROM site_request_443_fixture);
  v_item_id uuid := (SELECT item_id FROM site_request_443_fixture);
  v_first_delivery uuid := (
    SELECT first_deliverable_id FROM site_request_443_fixture
  );
  v_detail jsonb;
  v_nudge jsonb;
  v_raised boolean;
BEGIN
  ASSERT (SELECT count(*) FROM public.site_requests WHERE id = v_request_id) = 1
     AND (SELECT count(*) FROM public.site_request_items WHERE request_id = v_request_id) = 1
     AND (
       SELECT count(*) FROM public.site_request_item_versions
       WHERE id = (SELECT version_id FROM site_request_443_fixture)
     ) = 1
     AND (SELECT count(*) FROM public.site_deliverables WHERE id = v_first_delivery) = 1,
    'exact design-studio co-member lost raw read compatibility';

  v_detail := public.get_site_request_action_detail(
    'a4432000-0000-4000-8000-000000000001', v_request_id
  );
  ASSERT (v_detail->>'coherent')::boolean
     AND v_detail->>'projectId' = 'a4432000-0000-4000-8000-000000000001'
     AND v_detail->>'requestId' = v_request_id::text
     AND jsonb_array_length(v_detail->'items') = 1
     AND jsonb_array_length(v_detail->'rooms') = 2
     AND v_detail#>>'{items,0,title}' = 'Roomless opening measurement'
     AND v_detail#>>'{items,0,kitCode}' = 'K-01'
     AND (v_detail#>>'{items,0,version}')::integer = 1
     AND v_detail#>'{items,0,roomId}' = 'null'::jsonb
     AND v_detail#>>'{items,0,status}' = 'delivered'
     AND v_detail#>>'{items,0,deliverableId}' = v_first_delivery::text,
    'exact action detail did not preserve coherent roomless current delivery';
  ASSERT v_detail#>>'{rooms,0,id}' = 'a4432100-0000-4000-8000-000000000001'
     AND v_detail#>>'{rooms,0,name}' = 'Kitchen'
     AND v_detail#>>'{rooms,1,id}' = 'a4432100-0000-4000-8000-000000000002'
     AND v_detail#>>'{rooms,1,name}' = 'Living Room'
     AND (
       SELECT count(*) FROM jsonb_object_keys(v_detail#>'{rooms,0}')
     ) = 2
     AND (
       SELECT count(*) FROM jsonb_object_keys(v_detail#>'{rooms,1}')
     ) = 2,
    'action detail leaked or misordered same-project room choices';
  ASSERT v_detail::text NOT ILIKE '%3125550443%'
     AND v_detail::text NOT ILIKE '%private 00443 field party%'
     AND v_detail::text NOT ILIKE '%private request note%'
     AND v_detail::text NOT ILIKE '%private field guidance%'
     AND v_detail::text NOT ILIKE '%privateinternal%'
     AND v_detail::text NOT ILIKE '%privatepayload%'
     AND v_detail::text NOT ILIKE '%private captured by%'
     AND v_detail::text NOT ILIKE '%token%'
     AND v_detail::text NOT ILIKE '%media%'
     AND v_detail::text NOT ILIKE '%configuration%'
     AND v_detail::text NOT ILIKE '%payload%',
    'action detail leaked contacts or private request/delivery evidence';

  ASSERT public.get_site_request_action_detail(
    'a4432000-0000-4000-8000-000000000099', v_request_id
  ) = jsonb_build_object(
    'projectId', 'a4432000-0000-4000-8000-000000000099'::uuid,
    'requestId', v_request_id,
    'coherent', false,
    'items', '[]'::jsonb,
    'rooms', '[]'::jsonb
  ), 'wrong-project detail must fail closed without revealing request existence';

  ASSERT public.get_site_request_action_detail(
    'a4432000-0000-4000-8000-000000000001',
    (SELECT over_cap_request_id FROM site_request_443_fixture)
  ) @> jsonb_build_object(
    'coherent', false, 'items', '[]'::jsonb, 'rooms', '[]'::jsonb
  ), 'over-cap action detail did not fail closed';
  ASSERT public.get_site_request_action_detail(
    'a4432000-0000-4000-8000-000000000001',
    (SELECT incoherent_request_id FROM site_request_443_fixture)
  ) @> jsonb_build_object(
    'coherent', false, 'items', '[]'::jsonb, 'rooms', '[]'::jsonb
  ), 'mismatched current-version detail did not fail closed';

  v_nudge := public.site_request_nudge(
    v_request_id, 'Exact studio peer nudge.'
  );
  ASSERT v_nudge->>'action' = 'nudge'
     AND v_nudge->>'outbox_id' IS NOT NULL,
    'exact studio co-member could not nudge';

  PERFORM public.site_request_approve_item(
    v_item_id, v_first_delivery,
    'a4432100-0000-4000-8000-000000000001'
  );
  ASSERT (
    SELECT status = 'completed' FROM public.site_requests WHERE id = v_request_id
  ), 'exact studio co-member could not approve to completion';

  PERFORM public.site_request_redo_item(
    v_item_id, 'Production-reachable stale close race.'
  );
  ASSERT (
    SELECT status = 'in_progress' FROM public.site_requests WHERE id = v_request_id
  ), 'exact studio co-member could not reopen approved evidence';

  v_raised := false;
  BEGIN
    PERFORM public.site_request_close(v_request_id);
  EXCEPTION WHEN SQLSTATE '55000' THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'stale completed UI state closed an in-progress request';
  ASSERT (
    SELECT status = 'in_progress' FROM public.site_requests WHERE id = v_request_id
  ), 'failed stale close mutated the reopened request';
END
$studio_detail_and_mutations$;
RESET ROLE;

SET LOCAL ROLE service_role;
DO $guest_redelivery$
DECLARE
  v_delivery jsonb;
BEGIN
  v_delivery := public.site_request_guest_deliver(
    (SELECT token_hash FROM site_request_443_fixture),
    (SELECT version_id FROM site_request_443_fixture),
    'a4432400-0000-4000-8000-000000000002',
    '{"unit_input":"metric"}'::jsonb,
    '[{"label":"A · floor → sill","value_mm":911},{"label":"B · sill → head","value_mm":1211},{"label":"C · run length","value_mm":1811}]'::jsonb,
    'Private Captured By Again',
    now()
  );
  UPDATE site_request_443_fixture
  SET second_deliverable_id = (v_delivery->>'deliverable_id')::uuid;
END
$guest_redelivery$;
RESET ROLE;

SELECT pg_temp.assume_actor('a4430000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
DO $studio_complete_close$
DECLARE
  v_request_id uuid := (SELECT request_id FROM site_request_443_fixture);
  v_detail jsonb;
  v_result jsonb;
BEGIN
  v_detail := public.get_site_request_action_detail(
    'a4432000-0000-4000-8000-000000000001', v_request_id
  );
  ASSERT v_detail#>>'{items,0,deliverableId}' = (
    SELECT second_deliverable_id::text FROM site_request_443_fixture
  ), 'action detail did not choose the latest exact-current-version delivery';

  PERFORM public.site_request_approve_item(
    (SELECT item_id FROM site_request_443_fixture),
    (SELECT second_deliverable_id FROM site_request_443_fixture),
    'a4432100-0000-4000-8000-000000000002'
  );
  v_result := public.site_request_close(v_request_id);
  ASSERT v_result->>'status' = 'closed'
     AND (SELECT status = 'closed' FROM public.site_requests WHERE id = v_request_id),
    'exact design-studio co-member could not close a completed request';
END
$studio_complete_close$;
RESET ROLE;

ROLLBACK;
