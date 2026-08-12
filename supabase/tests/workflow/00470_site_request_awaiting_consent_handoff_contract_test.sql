-- Fixture-backed awaiting-consent contextual handoff contract (00470).
\set ON_ERROR_STOP on

BEGIN;

DO $structure$
DECLARE
  v_definition text := pg_get_functiondef(
    'public.get_project_contextual_handoffs(uuid)'::regprocedure
  );
BEGIN
  ASSERT pg_get_function_arguments(
    'public.get_project_contextual_handoffs(uuid)'::regprocedure
  ) = 'p_project_id uuid',
    'contextual handoff RPC argument name/signature drifted';
  ASSERT v_definition LIKE '%STABLE%'
     AND v_definition LIKE '%SECURITY DEFINER%'
     AND v_definition LIKE '%search_path TO ''public'', ''pg_temp''%'
     AND v_definition !~* '\m(insert|update|delete|merge|call)\M',
    'contextual projection/read-only contract drifted';

  ASSERT has_function_privilege(
    'authenticated', 'public.get_project_contextual_handoffs(uuid)', 'EXECUTE'
  ), 'authenticated studio actors cannot call contextual handoffs';
  ASSERT NOT has_function_privilege(
    'anon', 'public.get_project_contextual_handoffs(uuid)', 'EXECUTE'
  ) AND NOT has_function_privilege(
    'service_role', 'public.get_project_contextual_handoffs(uuid)', 'EXECUTE'
  ), 'anon/service received a contextual handoff execution rail';
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
) VALUES (
  'a4420000-0000-4000-8000-000000000001',
  'awaiting-consent-owner@test.invalid', '', now(), now(), now(),
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
);

INSERT INTO public.profiles (id, email, full_name, is_designer)
VALUES (
  'a4420000-0000-4000-8000-000000000001',
  'awaiting-consent-owner@test.invalid', 'Awaiting Consent Owner', true
)
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    is_designer = EXCLUDED.is_designer;

INSERT INTO public.projects (id, name, designer_id, created_by, status)
VALUES (
  'a4421000-0000-4000-8000-000000000001',
  'Awaiting Consent Handoff Project',
  'a4420000-0000-4000-8000-000000000001',
  'a4420000-0000-4000-8000-000000000001',
  'active'
);

INSERT INTO public.project_rooms (id, project_id, name, sort_order)
VALUES (
  'a4422000-0000-4000-8000-000000000001',
  'a4421000-0000-4000-8000-000000000001', 'Kitchen', 0
);

INSERT INTO public.project_parties (
  id, project_id, party_kind, display_name, phone, trade, sms_consent_status
) VALUES (
  'a4423000-0000-4000-8000-000000000001',
  'a4421000-0000-4000-8000-000000000001',
  'gc', 'Frozen Consent Party', '3125550142',
  'General contractor', 'not_asked'
);

CREATE TEMP TABLE handoff_442_fixture (
  request_id uuid PRIMARY KEY,
  consent_outbox_id uuid,
  waiting_fingerprint jsonb,
  sent_fingerprint jsonb
);
GRANT SELECT, INSERT, UPDATE ON handoff_442_fixture
  TO authenticated, service_role;

SELECT pg_temp.assume_actor('a4420000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
DO $canonical_send$
DECLARE
  v_request_id uuid;
  v_dispatch jsonb;
BEGIN
  v_request_id := public.site_request_create_draft(
    'a4421000-0000-4000-8000-000000000001',
    'a4423000-0000-4000-8000-000000000001',
    now() + interval '2 days',
    'before cabinet installation',
    'Contains internal request text that must not be projected.',
    jsonb_build_array(jsonb_build_object(
      'client_item_id', 'a4424000-0000-4000-8000-000000000001',
      'sort_order', 0,
      'kit_code', 'K-01',
      'title', 'Safe measurement title',
      'guidance', 'Private guidance must remain hidden.',
      'room_id', 'a4422000-0000-4000-8000-000000000001'
    ))
  );

  v_dispatch := public.site_request_send(v_request_id);
  ASSERT v_dispatch->>'status' = 'awaiting_consent'
     AND (v_dispatch->>'needs_consent')::boolean,
    'canonical send did not enter awaiting_consent';
  ASSERT v_dispatch->>'token' IS NULL,
    'awaiting-consent canonical send minted a raw token';

  INSERT INTO handoff_442_fixture(request_id) VALUES (v_request_id);
END
$canonical_send$;
RESET ROLE;

DO $canonical_evidence$
DECLARE
  v_request_id uuid := (SELECT request_id FROM handoff_442_fixture);
BEGIN
  ASSERT (
    SELECT status = 'awaiting_consent'
       AND consent_status_snapshot = 'pending'
       AND assignee_name_snapshot = 'Frozen Consent Party'
    FROM public.site_requests
    WHERE id = v_request_id
  ), 'canonical send did not freeze the awaiting-consent request evidence';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.site_request_access WHERE request_id = v_request_id
  ), 'awaiting-consent request installed guest access';
  ASSERT (
    SELECT sms_consent_status = 'pending'
    FROM public.project_parties
    WHERE id = 'a4423000-0000-4000-8000-000000000001'
  ), 'canonical send did not request consent from the exact party';

  -- Production reaches this state by the passage of time. Pin it directly so
  -- the contract proves consent-wait is never classified overdue.
  SET LOCAL session_replication_role = replica;
  UPDATE public.site_requests
  SET due_at = '2000-01-02 03:04:05+00'::timestamptz
  WHERE id = v_request_id;
  SET LOCAL session_replication_role = origin;

  UPDATE handoff_442_fixture
  SET waiting_fingerprint = jsonb_build_object(
    'request', (
      SELECT to_jsonb(request)
      FROM public.site_requests AS request WHERE request.id = v_request_id
    ),
    'events', (
      SELECT count(*) FROM public.site_request_events WHERE request_id = v_request_id
    ),
    'outbox', (
      SELECT count(*) FROM public.site_request_dispatch_outbox WHERE request_id = v_request_id
    ),
    'access', (
      SELECT count(*) FROM public.site_request_access WHERE request_id = v_request_id
    )
  );
END
$canonical_evidence$;

SELECT pg_temp.assume_actor('a4420000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
DO $waiting_projection$
DECLARE
  v_request_id uuid := (SELECT request_id FROM handoff_442_fixture);
  v_result jsonb := public.get_project_contextual_handoffs(
    'a4421000-0000-4000-8000-000000000001'
  );
  v_item jsonb;
BEGIN
  ASSERT (
    SELECT count(*) = 1
    FROM jsonb_array_elements(v_result) AS item(value)
    WHERE value->>'sourceKind' = 'site_request'
      AND value->>'sourceId' = v_request_id::text
  ), 'awaiting-consent request must appear exactly once';

  SELECT value INTO v_item
  FROM jsonb_array_elements(v_result) AS item(value)
  WHERE value->>'sourceKind' = 'site_request'
    AND value->>'sourceId' = v_request_id::text;

  ASSERT v_item @> jsonb_build_object(
      'sourceKind', 'site_request',
      'sourceState', 'awaiting_consent',
      'canonicalStageKey', 'contract_administration',
      'stageAttribution', 'source_domain',
      'expectedResponse', 'provide_sms_consent',
      'actionKind', 'open_site_request',
      'isOverdue', false
    )
     AND v_item->'phaseId' = 'null'::jsonb
     AND v_item->'workflowTrack' = 'null'::jsonb
     AND v_item#>>'{responsibility,sender,kind}' = 'studio'
     AND v_item#>>'{responsibility,recipient,kind}' = 'site_party'
     AND v_item#>>'{responsibility,recipient,label}' = 'Frozen Consent Party'
     AND v_item#>>'{responsibility,currentOwner,kind}' = 'site_party'
     AND (v_item->>'dueAt')::timestamptz =
         '2000-01-02 03:04:05+00'::timestamptz,
    'awaiting-consent routing/stage/due semantics are wrong';

  ASSERT v_item::text NOT ILIKE '%3125550142%'
     AND v_item::text NOT ILIKE '%internal request text%'
     AND v_item::text NOT ILIKE '%private guidance%'
     AND v_item::text NOT ILIKE '%token%'
     AND v_item::text NOT ILIKE '%url%'
     AND v_item::text NOT ILIKE '%consent_status_snapshot%',
    'awaiting-consent projection leaked private request/consent evidence';
END
$waiting_projection$;
RESET ROLE;

DO $waiting_nonmutation$
DECLARE
  v_request_id uuid := (SELECT request_id FROM handoff_442_fixture);
  v_after jsonb;
BEGIN
  v_after := jsonb_build_object(
    'request', (
      SELECT to_jsonb(request)
      FROM public.site_requests AS request WHERE request.id = v_request_id
    ),
    'events', (
      SELECT count(*) FROM public.site_request_events WHERE request_id = v_request_id
    ),
    'outbox', (
      SELECT count(*) FROM public.site_request_dispatch_outbox WHERE request_id = v_request_id
    ),
    'access', (
      SELECT count(*) FROM public.site_request_access WHERE request_id = v_request_id
    )
  );
  ASSERT v_after = (SELECT waiting_fingerprint FROM handoff_442_fixture),
    'awaiting-consent projection mutated request/dispatch evidence';
END
$waiting_nonmutation$;

-- Move the same source through the canonical consent/provider rails. The read
-- model must replace the waiting state with one sent item, never duplicate it.
UPDATE public.project_parties
SET sms_consent_status = 'granted', sms_consented_at = now()
WHERE id = 'a4423000-0000-4000-8000-000000000001';

UPDATE handoff_442_fixture
SET consent_outbox_id = (
  SELECT id
  FROM public.site_request_dispatch_outbox
  WHERE request_id = handoff_442_fixture.request_id
    AND action = 'consent-granted'
    AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1
);

DO $consent_outbox$
BEGIN
  ASSERT (SELECT consent_outbox_id IS NOT NULL FROM handoff_442_fixture),
    'canonical consent grant did not enqueue durable dispatch';
END
$consent_outbox$;

SET LOCAL ROLE service_role;
DO $service_dispatch$
DECLARE
  v_outbox_id uuid := (SELECT consent_outbox_id FROM handoff_442_fixture);
BEGIN
  PERFORM public.site_request_claim_dispatch(v_outbox_id, now());
  PERFORM public.site_request_complete_dispatch(
    v_outbox_id, 'sent', 'sms-00443', NULL, now()
  );
END
$service_dispatch$;
RESET ROLE;

DO $sent_fingerprint$
DECLARE
  v_request_id uuid := (SELECT request_id FROM handoff_442_fixture);
BEGIN
  ASSERT (
    SELECT status = 'sent' FROM public.site_requests WHERE id = v_request_id
  ), 'canonical consent/provider completion did not transition request to sent';

  UPDATE handoff_442_fixture
  SET sent_fingerprint = jsonb_build_object(
    'requestUpdated', (
      SELECT updated_at FROM public.site_requests WHERE id = v_request_id
    ),
    'events', (
      SELECT count(*) FROM public.site_request_events WHERE request_id = v_request_id
    ),
    'outbox', (
      SELECT count(*) FROM public.site_request_dispatch_outbox WHERE request_id = v_request_id
    ),
    'access', (
      SELECT count(*) FROM public.site_request_access WHERE request_id = v_request_id
    )
  );
END
$sent_fingerprint$;

SELECT pg_temp.assume_actor('a4420000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
DO $sent_projection$
DECLARE
  v_request_id uuid := (SELECT request_id FROM handoff_442_fixture);
  v_result jsonb := public.get_project_contextual_handoffs(
    'a4421000-0000-4000-8000-000000000001'
  );
  v_item jsonb;
BEGIN
  ASSERT (
    SELECT count(*) = 1
    FROM jsonb_array_elements(v_result) AS item(value)
    WHERE value->>'sourceKind' = 'site_request'
      AND value->>'sourceId' = v_request_id::text
  ), 'sent request must replace awaiting-consent exactly once';

  SELECT value INTO v_item
  FROM jsonb_array_elements(v_result) AS item(value)
  WHERE value->>'sourceKind' = 'site_request'
    AND value->>'sourceId' = v_request_id::text;
  ASSERT v_item->>'sourceState' = 'sent'
     AND v_item->>'actionKind' = 'open_site_request'
     AND (v_item->>'isOverdue')::boolean,
    'later sent route/due semantics drifted';
END
$sent_projection$;
RESET ROLE;

DO $sent_nonmutation$
DECLARE
  v_request_id uuid := (SELECT request_id FROM handoff_442_fixture);
  v_after jsonb;
BEGIN
  v_after := jsonb_build_object(
    'requestUpdated', (
      SELECT updated_at FROM public.site_requests WHERE id = v_request_id
    ),
    'events', (
      SELECT count(*) FROM public.site_request_events WHERE request_id = v_request_id
    ),
    'outbox', (
      SELECT count(*) FROM public.site_request_dispatch_outbox WHERE request_id = v_request_id
    ),
    'access', (
      SELECT count(*) FROM public.site_request_access WHERE request_id = v_request_id
    )
  );
  ASSERT v_after = (SELECT sent_fingerprint FROM handoff_442_fixture),
    'sent projection mutated request/dispatch evidence';
END
$sent_nonmutation$;

ROLLBACK;
