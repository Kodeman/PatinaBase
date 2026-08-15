-- Field Site Request P1 adversarial database contract (00374).
--
-- Run:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 -f supabase/tests/site_requests/security_and_lifecycle_test.sql

BEGIN;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('f3730000-0000-4000-8000-000000000001', 'site-designer@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('f3730000-0000-4000-8000-000000000002', 'site-outsider@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('f3730000-0000-4000-8000-000000000001', 'site-designer@test.invalid', 'Site Designer', now(), now()),
  ('f3730000-0000-4000-8000-000000000002', 'site-outsider@test.invalid', 'Foreign Designer', now(), now())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

INSERT INTO public.projects (id, name, designer_id, created_by)
VALUES
  ('f3730000-0000-4000-8000-000000000101', 'Site Project', 'f3730000-0000-4000-8000-000000000001', 'f3730000-0000-4000-8000-000000000001'),
  ('f3730000-0000-4000-8000-000000000102', 'Foreign Project', 'f3730000-0000-4000-8000-000000000002', 'f3730000-0000-4000-8000-000000000002');

INSERT INTO public.project_rooms (id, project_id, name, sort_order)
VALUES
  ('f3730000-0000-4000-8000-000000000201', 'f3730000-0000-4000-8000-000000000101', 'Kitchen', 0),
  ('f3730000-0000-4000-8000-000000000202', 'f3730000-0000-4000-8000-000000000101', 'Living Room', 1),
  ('f3730000-0000-4000-8000-000000000203', 'f3730000-0000-4000-8000-000000000102', 'Foreign Room', 0);

INSERT INTO public.project_parties (
  id, project_id, party_kind, display_name, phone, trade, sms_consent_status
)
VALUES
  ('f3730000-0000-4000-8000-000000000301', 'f3730000-0000-4000-8000-000000000101', 'gc', 'Casey Contractor', '3125550101', 'General contractor', 'not_asked'),
  ('f3730000-0000-4000-8000-000000000302', 'f3730000-0000-4000-8000-000000000102', 'gc', 'Foreign Contractor', '3125550102', 'General contractor', 'granted');

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assume_user_role(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.reset_user_role()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$;

GRANT EXECUTE ON FUNCTION pg_temp.reset_user_role() TO authenticated;

DO $$
DECLARE
  v_request_id uuid;
  v_foreign_request_id uuid;
  v_foreign_version uuid;
  v_item_measure uuid;
  v_item_photo uuid;
  v_version_measure uuid;
  v_version_photo uuid;
  v_dispatch jsonb;
  v_dispatch_retry jsonb;
  v_token text;
  v_old_token_hash text;
  v_token_hash text;
  v_access_id uuid;
  v_outbox_id uuid;
  v_notification_outbox_id uuid;
  v_upload jsonb;
  v_media_id uuid;
  v_object_path text;
  v_delivery_measure jsonb;
  v_delivery_photo jsonb;
  v_delivery_redo jsonb;
  v_entry_one uuid;
  v_entry_two uuid;
  v_count integer;
  v_raised boolean;
  v_lifecycle jsonb;
BEGIN
  -- ACL contract: guests have no table path, and guest RPCs are service-only.
  ASSERT NOT has_table_privilege('anon', 'public.site_requests', 'SELECT'),
    'anon must not read site_requests';
  ASSERT NOT has_table_privilege('authenticated', 'public.site_requests', 'INSERT'),
    'authenticated must mutate through RPCs';
  ASSERT NOT has_function_privilege('anon', 'public.site_request_guest_bootstrap(text)', 'EXECUTE'),
    'anon must not execute guest bootstrap directly';
  ASSERT NOT has_function_privilege('authenticated', 'public.site_request_guest_bootstrap(text)', 'EXECUTE'),
    'authenticated must not execute service guest bootstrap';
  ASSERT has_function_privilege('service_role', 'public.site_request_guest_bootstrap(text)', 'EXECUTE'),
    'service_role must execute guest bootstrap';
  ASSERT NOT has_table_privilege(
    'authenticated', 'public.site_request_dispatch_outbox', 'SELECT'
  ), 'designer must not browse internal dispatch retry state';
  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'site_request_dispatch_outbox'
      AND column_name ~ '(token|body|url)'
  ), 'dispatch outbox must persist identifiers and safe retry state, never raw messages/tokens';
  ASSERT public._site_request_safe_provider_message_id('SM_safe-123') = 'SM_safe-123',
    'provider message ids must preserve a narrow safe identifier';
  ASSERT public._site_request_safe_provider_message_id(
    'https://client.patina.cloud/field/sr_must_not_persist'
  ) IS NULL, 'provider message ids must reject URLs';

  -- Draft creation snapshots stable item identities and immutable revisions.
  PERFORM pg_temp.assume_user('f3730000-0000-4000-8000-000000000001');
  v_request_id := public.site_request_create_draft(
    'f3730000-0000-4000-8000-000000000101',
    'f3730000-0000-4000-8000-000000000301',
    now() + interval '3 days',
    'before drywall',
    'Please capture in daylight.',
    jsonb_build_array(
      jsonb_build_object(
        'client_item_id','f3730000-0000-4000-8000-000000000401',
        'sort_order',0,'kit_code','K-01','title','Window rough opening',
        'guidance','Width then height.',
        'room_id','f3730000-0000-4000-8000-000000000201',
        'configuration',jsonb_build_object('precision','1/16in')
      ),
      jsonb_build_object(
        'client_item_id','f3730000-0000-4000-8000-000000000402',
        'sort_order',1,'kit_code','K-02','title','Outlet detail photos',
        'room_id','f3730000-0000-4000-8000-000000000202',
        'configuration','{}'::jsonb
      )
    )
  );
  SELECT id, current_version_id INTO v_item_measure, v_version_measure
  FROM public.site_request_items WHERE request_id = v_request_id AND sort_order = 0;
  SELECT id, current_version_id INTO v_item_photo, v_version_photo
  FROM public.site_request_items WHERE request_id = v_request_id AND sort_order = 1;
  ASSERT (
    SELECT jsonb_array_length(configuration->'dimensions') = 3
       AND configuration->>'precision' = '1/16in'
    FROM public.site_request_item_versions
    WHERE id = v_version_measure
  ), 'K-01 must merge its versioned built-in checklist with caller overrides';
  ASSERT (
    SELECT jsonb_array_length(kit->'configuration'->'shots') = 4
    FROM jsonb_array_elements(public.site_request_builtin_kits()) AS kit
    WHERE kit->>'code' = 'K-02'
  ), 'K-02 must publish its versioned four-shot checklist';

  PERFORM public.site_request_revise_item(
    v_item_measure, 'K-01', 'Window rough opening revised',
    'Width, height, and proof photo.',
    'f3730000-0000-4000-8000-000000000201',
    '{"precision":"1/16in","proof_required":true}'::jsonb
  );
  SELECT current_version_id INTO v_version_measure
  FROM public.site_request_items WHERE id = v_item_measure;
  ASSERT (
    SELECT jsonb_array_length(configuration->'dimensions') = 3
       AND configuration->>'proof_required' = 'true'
    FROM public.site_request_item_versions
    WHERE id = v_version_measure
  ), 'revision must retain built-in checklist defaults and apply overrides';
  SELECT count(*) INTO v_count
  FROM public.site_request_item_versions WHERE item_id = v_item_measure;
  ASSERT v_count = 2, 'revision must append, not overwrite';

  v_raised := false;
  BEGIN
    UPDATE public.site_request_item_versions SET title = 'mutated' WHERE id = v_version_measure;
  EXCEPTION WHEN SQLSTATE '55000' THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'item versions must reject update';

  -- Foreign-project room is rejected atomically.
  v_raised := false;
  BEGIN
    PERFORM public.site_request_revise_item(
      v_item_measure, 'K-01', 'Bad room', NULL,
      'f3730000-0000-4000-8000-000000000203', '{}'::jsonb
    );
  EXCEPTION WHEN check_violation THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'foreign-project room must be rejected';
  SELECT count(*) INTO v_count
  FROM public.site_request_item_versions WHERE item_id = v_item_measure;
  ASSERT v_count = 2, 'failed revision must leave history unchanged';

  -- A foreign designer can create their own request but cannot see this one.
  PERFORM pg_temp.assume_user('f3730000-0000-4000-8000-000000000002');
  v_foreign_request_id := public.site_request_create_draft(
    'f3730000-0000-4000-8000-000000000102',
    'f3730000-0000-4000-8000-000000000302',
    now() + interval '4 days',
    NULL, NULL,
    jsonb_build_array(jsonb_build_object(
      'client_item_id','f3730000-0000-4000-8000-000000000403',
      'sort_order',0,'kit_code','K-01','title','Foreign measurement',
      'room_id','f3730000-0000-4000-8000-000000000203'
    ))
  );
  SELECT current_version_id INTO v_foreign_version
  FROM public.site_request_items
  WHERE request_id = v_foreign_request_id AND sort_order = 0;

  PERFORM pg_temp.assume_user_role('f3730000-0000-4000-8000-000000000002');
  SELECT count(*) INTO v_count FROM public.site_requests WHERE id = v_request_id;
  ASSERT v_count = 0, 'foreign designer RLS must hide request';
  PERFORM pg_temp.reset_user_role();

  -- not_asked -> pending; awaiting_consent must mint no access token.
  PERFORM pg_temp.assume_user('f3730000-0000-4000-8000-000000000001');
  v_dispatch := public.site_request_send(v_request_id);
  ASSERT v_dispatch->>'status' = 'awaiting_consent', 'send must await consent';
  ASSERT (v_dispatch->>'needs_consent')::boolean, 'send must flag needs_consent';
  ASSERT v_dispatch->>'token' IS NULL, 'awaiting consent must not mint token';
  SELECT count(*) INTO v_count FROM public.site_request_access WHERE request_id = v_request_id;
  ASSERT v_count = 0, 'awaiting consent must install no access';
  ASSERT (
    SELECT sms_consent_status = 'pending'
    FROM public.project_parties WHERE id = 'f3730000-0000-4000-8000-000000000301'
  ), 'send must transition not_asked consent to pending';

  -- Consent grant transactionally creates identifier-only durable work before
  -- its best-effort pg_net wake-up. Even when Edge never handles that wake-up,
  -- the lifecycle sweep can discover the row; only claim mints a raw token.
  RESET ROLE;
  UPDATE public.project_parties
  SET sms_consent_status = 'granted', sms_consented_at = now()
  WHERE id = 'f3730000-0000-4000-8000-000000000301';

  SELECT id INTO v_outbox_id
  FROM public.site_request_dispatch_outbox
  WHERE request_id = v_request_id
    AND action = 'consent-granted'
    AND status = 'pending';
  ASSERT v_outbox_id IS NOT NULL,
    'consent transaction must enqueue durable dispatch before pg_net delivery';
  ASSERT (
    SELECT status = 'awaiting_consent'
    FROM public.site_requests WHERE id = v_request_id
  ), 'request must await provider acknowledgement, not the consent trigger';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.site_request_access WHERE request_id = v_request_id
  ), 'consent enqueue must not mint or persist guest access';
  ASSERT v_outbox_id = ANY(ARRAY(
    SELECT pending_id
    FROM public.site_request_pending_dispatches(now(), 25) pending_id
  )), 'lifecycle sweep must recover consent work after an Edge/pg_net miss';

  v_dispatch := public.site_request_claim_dispatch(v_outbox_id, now());
  v_token := v_dispatch->>'token';
  v_access_id := (v_dispatch->>'access_id')::uuid;
  v_old_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');
  ASSERT v_token ~ '^sr_[A-Za-z0-9_-]{43}$',
    'claimed dispatch must mint a distinguishable sr_ token';
  ASSERT public.site_request_guest_bootstrap(v_old_token_hash) IS NULL,
    'unacknowledged pending token must not bootstrap';

  -- Provider failure remains retryable, revokes the unacknowledged token, and
  -- a later sweep remints without persisting either raw value.
  PERFORM public.site_request_complete_dispatch(
    v_outbox_id, 'retry', NULL,
    'https://client.patina.cloud/field/sr_must_not_persist', now()
  );
  ASSERT (
    SELECT last_error = 'dispatch_error'
    FROM public.site_request_dispatch_outbox WHERE id = v_outbox_id
  ), 'provider errors must be reduced to a safe retry code';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.site_request_events
    WHERE request_id = v_request_id
      AND payload::text LIKE '%sr_must_not_persist%'
  ), 'raw provider errors must not persist in activity events';
  UPDATE public.site_request_dispatch_outbox SET available_at = now()
  WHERE id = v_outbox_id;
  v_dispatch_retry := public.site_request_claim_dispatch(v_outbox_id, now());
  ASSERT v_dispatch_retry->>'token' IS NOT NULL,
    'unacknowledged retry must remint a recoverable token';
  ASSERT (v_dispatch_retry->>'access_id')::uuid <> v_access_id,
    'retry must install a new access row';
  ASSERT public.site_request_guest_bootstrap(v_old_token_hash) IS NULL,
    'retry must revoke old token';
  v_token := v_dispatch_retry->>'token';
  v_access_id := (v_dispatch_retry->>'access_id')::uuid;
  v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  v_dispatch := public.site_request_complete_dispatch(
    v_outbox_id, 'sent', 'sms-site-001', NULL, now()
  );
  ASSERT public.site_request_guest_bootstrap(v_token_hash) IS NOT NULL,
    'provider-acknowledged token must bootstrap';
  v_dispatch_retry := public.site_request_complete_dispatch(
    v_outbox_id, 'sent', 'sms-site-001', NULL, now()
  );
  ASSERT (v_dispatch_retry->>'idempotent')::boolean,
    'dispatch completion must be idempotent';

  -- Narrow DTO excludes project/Binder browsing and includes request items.
  v_dispatch_retry := public.site_request_guest_bootstrap(v_token_hash);
  ASSERT v_dispatch_retry#>>'{request,id}' = v_request_id::text,
    'bootstrap must return exact request';
  ASSERT jsonb_array_length(v_dispatch_retry->'items') = 2,
    'bootstrap must expose exact request item count';
  ASSERT NOT (v_dispatch_retry ? 'binder'), 'guest DTO must not expose Binder';

  v_raised := false;
  BEGIN
    PERFORM public.site_request_guest_deliver(
      v_token_hash, v_foreign_version,
      'f3730000-0000-4000-8000-000000000504',
      '{}'::jsonb, '[{"label":"width","value_mm":500}]'::jsonb,
      'Stolen Token', '2026-07-17 14:00:00+00'
    );
  EXCEPTION WHEN no_data_found THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'valid token must not mutate a foreign request item version';

  -- K-02 signed-upload metadata, real Storage receipt, then delivery.
  v_upload := public.site_request_guest_create_upload(
    v_token_hash, v_version_photo,
    'f3730000-0000-4000-8000-000000000501',
    '../outlet photo.jpg', 'image/jpeg',
    repeat('a', 64), 4
  );
  v_media_id := (v_upload->>'media_id')::uuid;
  v_object_path := v_upload->>'object_path';
  ASSERT v_object_path LIKE v_request_id::text || '/' || v_version_photo::text || '/%',
    'object path must be request/item-version scoped';
  ASSERT position('..' in v_object_path) = 0, 'object path must sanitize traversal';

  INSERT INTO storage.objects (bucket_id, name, metadata)
  VALUES ('site-requests', v_object_path, '{"size":4}'::jsonb);
  PERFORM public.site_request_guest_ack_upload(
    v_token_hash, v_media_id, 'etag-001', 4
  );
  v_raised := false;
  BEGIN
    PERFORM public.site_request_guest_deliver(
      v_token_hash, v_version_photo,
      'f3730000-0000-4000-8000-000000000501',
      jsonb_build_object('shots', jsonb_build_array(
        jsonb_build_object(
          'id','wide_context','label','Wide context','status','captured',
          'media_id',v_media_id
        )
      )), '[]'::jsonb,
      'Casey Contractor', '2026-07-17 15:00:00+00'
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'K-02 must reject an incomplete configured shot list';
  v_delivery_photo := public.site_request_guest_deliver(
    v_token_hash, v_version_photo,
    'f3730000-0000-4000-8000-000000000501',
    jsonb_build_object('shots', jsonb_build_array(
      jsonb_build_object(
        'id','wide_context','label','Wide context','status','captured',
        'media_id',v_media_id
      ),
      jsonb_build_object(
        'id','straight_on','label','Straight on','status','skipped',
        'skip_note','The wall was blocked by stored millwork.'
      ),
      jsonb_build_object(
        'id','left_return','label','Left return','status','skipped',
        'skip_note','The left return was not installed yet.'
      ),
      jsonb_build_object(
        'id','detail','label','Close detail','status','skipped',
        'skip_note','The finish detail was covered for protection.'
      )
    )), '[]'::jsonb,
    'Casey Contractor', '2026-07-17 15:00:00+00'
  );
  ASSERT v_delivery_photo->>'item_status' = 'delivered',
    'photo item must deliver after receipt';

  -- K-01 delivery stores integer mm and is idempotent by client attempt UUID.
  v_raised := false;
  BEGIN
    PERFORM public.site_request_guest_deliver(
      v_token_hash, v_version_measure,
      'f3730000-0000-4000-8000-000000000502',
      '{"unit_input":"inches-sixteenths"}'::jsonb,
      '[{"label":"wrong","value_mm":914}]'::jsonb,
      'Casey Contractor', '2026-07-17 15:05:00+00'
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'K-01 must reject missing or mislabeled configured dimensions';
  v_delivery_measure := public.site_request_guest_deliver(
    v_token_hash, v_version_measure,
    'f3730000-0000-4000-8000-000000000502',
    '{"unit_input":"inches-sixteenths"}'::jsonb,
    '[{"label":"A · floor → sill","value_mm":914},{"label":"B · sill → head","value_mm":1219},{"label":"C · run length","value_mm":1800}]'::jsonb,
    'Casey Contractor', '2026-07-17 15:05:00+00'
  );
  v_dispatch_retry := public.site_request_guest_deliver(
    v_token_hash, v_version_measure,
    'f3730000-0000-4000-8000-000000000502',
    '{"unit_input":"inches-sixteenths"}'::jsonb,
    '[{"label":"A · floor → sill","value_mm":914},{"label":"B · sill → head","value_mm":1219},{"label":"C · run length","value_mm":1800}]'::jsonb,
    'Casey Contractor', '2026-07-17 15:05:00+00'
  );
  ASSERT (v_dispatch_retry->>'idempotent')::boolean,
    'duplicate delivery must be idempotent';
  SELECT count(*) INTO v_count
  FROM public.site_deliverables
  WHERE item_version_id = v_version_measure
    AND client_attempt_id = 'f3730000-0000-4000-8000-000000000502';
  ASSERT v_count = 1, 'idempotency must create one deliverable';
  SELECT count(*) INTO v_count
  FROM public.site_deliverable_dimensions
  WHERE deliverable_id = (v_delivery_measure->>'deliverable_id')::uuid;
  ASSERT v_count = 3, 'idempotency must not duplicate dimensions';

  SELECT id INTO v_notification_outbox_id
  FROM public.site_request_delivery_notification_outbox
  WHERE request_id = v_request_id AND status = 'pending';
  ASSERT v_notification_outbox_id IS NOT NULL,
    'non-idempotent delivery must enqueue a designer notification';
  ASSERT (
    SELECT cardinality(deliverable_ids) = 2
    FROM public.site_request_delivery_notification_outbox
    WHERE id = v_notification_outbox_id
  ), 'deliveries in the short window must batch into one request notification';
  ASSERT (
    SELECT count(*) = 1
    FROM public.site_request_delivery_notification_outbox
    WHERE request_id = v_request_id
  ), 'idempotent redelivery must not duplicate the notification outbox';
  v_dispatch := public.site_request_claim_delivery_notification(
    v_notification_outbox_id, now() + interval '3 minutes'
  );
  ASSERT v_dispatch->>'user_id' = 'f3730000-0000-4000-8000-000000000001',
    'batched delivery notification must target the request creator';
  ASSERT (v_dispatch->>'deliverable_count')::integer = 2,
    'batched notification must report the exact new delivery count';
  ASSERT NOT (v_dispatch::text LIKE '%Casey Contractor%'),
    'push notification context must remain privacy-safe';
  PERFORM public.site_request_complete_delivery_notification(
    v_notification_outbox_id, false, 'apns_not_configured', now() + interval '3 minutes'
  );
  ASSERT (
    SELECT status = 'pending' AND last_error = 'apns_not_configured'
    FROM public.site_request_delivery_notification_outbox
    WHERE id = v_notification_outbox_id
  ), 'notification failure must be recorded and remain retryable';

  -- Atomic approval: invalid foreign room inserts no Binder row.
  PERFORM pg_temp.assume_user('f3730000-0000-4000-8000-000000000001');
  v_raised := false;
  BEGIN
    PERFORM public.site_request_approve_item(
      v_item_measure,
      (v_delivery_measure->>'deliverable_id')::uuid,
      'f3730000-0000-4000-8000-000000000203'
    );
  EXCEPTION WHEN check_violation THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'approval must reject foreign room';
  SELECT count(*) INTO v_count FROM public.site_binder_entries
  WHERE deliverable_id = (v_delivery_measure->>'deliverable_id')::uuid;
  ASSERT v_count = 0, 'failed approval must insert no Binder entry';

  v_dispatch := public.site_request_approve_item(
    v_item_measure,
    (v_delivery_measure->>'deliverable_id')::uuid,
    'f3730000-0000-4000-8000-000000000201'
  );
  v_entry_one := (v_dispatch->>'binder_entry_id')::uuid;
  v_dispatch_retry := public.site_request_approve_item(
    v_item_measure,
    (v_delivery_measure->>'deliverable_id')::uuid,
    'f3730000-0000-4000-8000-000000000201'
  );
  ASSERT (v_dispatch_retry->>'idempotent')::boolean,
    'duplicate approval must be idempotent';
  SELECT count(*) INTO v_count FROM public.site_binder_entries
  WHERE deliverable_id = (v_delivery_measure->>'deliverable_id')::uuid;
  ASSERT v_count = 1, 'approval must create exactly one Binder entry';

  -- Redo reopens only the selected item and preserves exact note/old attempts.
  PERFORM public.site_request_redo_item(v_item_measure, 'Tape edge was hidden — measure again.');
  ASSERT (
    SELECT status = 'redo_requested'
       AND redo_note = 'Tape edge was hidden — measure again.'
    FROM public.site_request_items WHERE id = v_item_measure
  ), 'redo note must be verbatim';
  ASSERT (
    SELECT status = 'delivered' FROM public.site_request_items WHERE id = v_item_photo
  ), 'redo must not reopen sibling item';
  SELECT count(*) INTO v_count FROM public.site_deliverables WHERE item_id = v_item_measure;
  ASSERT v_count = 1, 'redo must preserve prior attempt';

  v_delivery_redo := public.site_request_guest_deliver(
    v_token_hash, v_version_measure,
    'f3730000-0000-4000-8000-000000000503',
    '{"unit_input":"metric"}'::jsonb,
    '[{"label":"A · floor → sill","value_mm":916},{"label":"B · sill → head","value_mm":1220},{"label":"C · run length","value_mm":1802}]'::jsonb,
    'Casey Contractor', '2026-07-17 16:00:00+00'
  );
  v_dispatch := public.site_request_approve_item(
    v_item_measure,
    (v_delivery_redo->>'deliverable_id')::uuid,
    'f3730000-0000-4000-8000-000000000201'
  );
  v_entry_two := (v_dispatch->>'binder_entry_id')::uuid;
  ASSERT (
    SELECT supersedes_entry_id = v_entry_one
    FROM public.site_binder_entries WHERE id = v_entry_two
  ), 'new approval must supersede prior current entry';
  SELECT count(*) INTO v_count FROM public.site_binder_entries WHERE item_id = v_item_measure;
  ASSERT v_count = 2, 'Binder must retain superseded history';
  SELECT count(*) INTO v_count FROM public.site_binder_current WHERE item_id = v_item_measure;
  ASSERT v_count = 1, 'derived Binder current must expose one current entry';

  v_raised := false;
  BEGIN
    DELETE FROM public.site_binder_entries WHERE id = v_entry_one;
  EXCEPTION WHEN SQLSTATE '55000' THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'Binder history must reject delete';

  -- Media that retention already removed can never be approved into Binder.
  RESET ROLE;
  UPDATE public.site_deliverable_media
  SET deleted_at = now()
  WHERE id = v_media_id;
  PERFORM pg_temp.assume_user('f3730000-0000-4000-8000-000000000001');
  v_raised := false;
  BEGIN
    PERFORM public.site_request_approve_item(
      v_item_photo,
      (v_delivery_photo->>'deliverable_id')::uuid,
      'f3730000-0000-4000-8000-000000000202'
    );
  EXCEPTION WHEN SQLSTATE '55000' THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'approval must reject already-purged media evidence';
  RESET ROLE;
  UPDATE public.site_deliverable_media
  SET deleted_at = NULL
  WHERE id = v_media_id;
  PERFORM pg_temp.assume_user('f3730000-0000-4000-8000-000000000001');

  -- One nudge per calendar day.
  v_dispatch := public.site_request_nudge(v_request_id, 'Checking in.');
  v_outbox_id := (v_dispatch->>'outbox_id')::uuid;
  ASSERT (
    SELECT last_nudged_at IS NULL FROM public.site_requests WHERE id = v_request_id
  ), 'nudge timestamp must not finalize before provider acceptance';
  v_raised := false;
  BEGIN
    PERFORM public.site_request_nudge(v_request_id, 'Again.');
  EXCEPTION WHEN SQLSTATE '55000' THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'nudge must enforce one per day';
  SELECT count(*) INTO v_count FROM public.site_request_events
  WHERE request_id = v_request_id AND event_type = 'nudge_requested';
  ASSERT v_count = 1, 'nudge retry must not duplicate event';
  v_dispatch := public.site_request_claim_dispatch(v_outbox_id, now());
  PERFORM public.site_request_complete_dispatch(
    v_outbox_id, 'sent', 'sms-nudge-001', NULL, now()
  );
  ASSERT (
    SELECT last_nudged_at IS NOT NULL FROM public.site_requests WHERE id = v_request_id
  ), 'successful nudge must finalize exactly after provider acceptance';

  -- Once-only due reminder.
  RESET ROLE;
  UPDATE public.site_requests
  SET due_at = now() + interval '1 hour', due_reminder_sent_at = NULL
  WHERE id = v_request_id;
  v_lifecycle := public.site_request_process_lifecycle(now());
  ASSERT jsonb_array_length(v_lifecycle->'due_reminders') = 1,
    'first lifecycle pass must yield one due reminder';
  v_lifecycle := public.site_request_process_lifecycle(now());
  ASSERT jsonb_array_length(v_lifecycle->'due_reminders') = 0,
    'second lifecycle pass must not duplicate due reminder';
  SELECT count(*) INTO v_count FROM public.site_request_events
  WHERE request_id = v_request_id AND event_type = 'due_reminder_ready';
  ASSERT v_count = 1, 'due reminder event must be once-only';
  ASSERT (
    SELECT due_reminder_sent_at IS NULL FROM public.site_requests WHERE id = v_request_id
  ), 'due reminder must not finalize before provider acceptance';
  SELECT id INTO v_outbox_id
  FROM public.site_request_dispatch_outbox
  WHERE request_id = v_request_id AND action = 'due-reminder';
  v_dispatch := public.site_request_claim_dispatch(v_outbox_id, now());
  PERFORM public.site_request_complete_dispatch(
    v_outbox_id, 'sent', 'sms-due-001', NULL, now()
  );
  ASSERT (
    SELECT due_reminder_sent_at IS NOT NULL FROM public.site_requests WHERE id = v_request_id
  ), 'due reminder finalizes only after provider acceptance';

  -- Manual revocation kills token; resend installs a fresh one.
  PERFORM pg_temp.assume_user('f3730000-0000-4000-8000-000000000001');
  PERFORM public.site_request_revoke_access(v_request_id, 'security test');
  ASSERT public.site_request_guest_bootstrap(v_token_hash) IS NULL,
    'revoked token must not bootstrap';
  v_dispatch := public.site_request_resend(v_request_id, now() + interval '2 days');
  v_outbox_id := (v_dispatch->>'outbox_id')::uuid;
  ASSERT v_dispatch->>'token' IS NULL,
    'resend preparation must persist identifiers only';
  v_dispatch := public.site_request_claim_dispatch(v_outbox_id, now());
  v_token := v_dispatch->>'token';
  v_access_id := (v_dispatch->>'access_id')::uuid;
  v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');
  RESET ROLE;
  PERFORM public.site_request_complete_dispatch(
    v_outbox_id, 'sent', 'sms-site-002', NULL, now()
  );

  -- Expiry processing closes request, expires access, and preserves 90-day retention.
  UPDATE public.site_requests SET expires_at = now() - interval '1 minute'
  WHERE id = v_request_id;
  v_lifecycle := public.site_request_process_lifecycle(now());
  ASSERT (v_lifecycle->>'expired_count')::integer = 1,
    'lifecycle must expire request';
  ASSERT public.site_request_guest_bootstrap(v_token_hash) IS NULL,
    'expired request token must not bootstrap';
  ASSERT (
    SELECT status = 'expired'
       AND unapproved_media_delete_after >= now() + interval '89 days'
    FROM public.site_requests WHERE id = v_request_id
  ), 'expiry must establish 90-day unapproved media retention';
  UPDATE public.site_requests
  SET unapproved_media_delete_after = now() - interval '1 minute'
  WHERE id = v_request_id;
  ASSERT EXISTS (
    SELECT 1
    FROM public.site_request_unapproved_media_cleanup_candidates(now(), 100) c
    WHERE c.media_id = v_media_id
      AND c.bucket_id = 'site-requests'
      AND c.object_path = v_object_path
  ), 'cleanup must expose exact unapproved immutable Storage candidates after day 90';
  ASSERT (
    SELECT upload_state <> 'deleted'
    FROM public.site_deliverable_media WHERE id = v_media_id
  ), 'candidate enumeration must never fake Storage deletion';
  PERFORM pg_temp.assume_user('f3730000-0000-4000-8000-000000000001');
  v_raised := false;
  BEGIN
    PERFORM public.site_request_approve_item(
      v_item_photo,
      (v_delivery_photo->>'deliverable_id')::uuid,
      'f3730000-0000-4000-8000-000000000202'
    );
  EXCEPTION WHEN SQLSTATE '55000' THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'expired requests must reject new Binder approvals';
  RESET ROLE;

  -- Event sequence is gap-free and append-only for this request.
  ASSERT NOT EXISTS (
    SELECT 1
    FROM (
      SELECT sequence_no, row_number() OVER (ORDER BY sequence_no) AS expected
      FROM public.site_request_events WHERE request_id = v_request_id
    ) ordered_events
    WHERE sequence_no <> expected
  ), 'event sequence must be ordered and gap-free';
  v_raised := false;
  BEGIN
    UPDATE public.site_request_events SET payload = '{}'::jsonb
    WHERE request_id = v_request_id;
  EXCEPTION WHEN SQLSTATE '55000' THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'events must reject updates';

  RAISE NOTICE 'site_requests: schema, RLS/ACL, consent, guest, upload, delivery, approval, redo, lifecycle assertions passed';
END;
$$;

ROLLBACK;
