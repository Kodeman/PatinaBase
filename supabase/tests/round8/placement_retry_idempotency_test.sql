-- SQ-2013 / A05, X09: a lost placement response must be safely retryable.
-- Reproduces SQ-1985's configured Library request shape without its fixtures.
-- Run: psql -X -v ON_ERROR_STOP=1 postgresql://postgres:postgres@127.0.0.1:54322/postgres -f <this file>
-- Expected RED on 00828/00809: identical configured placement retry must succeed.
-- No migration is applied. Everything, including successful placement, rolls back
-- (also on assertion failure, when psql disconnects with ON_ERROR_STOP).
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES (
  'f2013000-0000-4000-8000-000000000001', 'sq2013@test.invalid', '', now(), now(), now(),
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
);
INSERT INTO public.profiles (id, email, full_name)
VALUES ('f2013000-0000-4000-8000-000000000001', 'sq2013@test.invalid', 'SQ2013 Designer')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organizations (id, type, name, slug)
VALUES ('f2013000-0000-4000-8000-000000000002', 'design_studio', 'SQ2013 Studio', 'sq2013-studio');
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES (
  'f2013000-0000-4000-8000-000000000003', 'f2013000-0000-4000-8000-000000000001',
  'f2013000-0000-4000-8000-000000000002', 'owner', 'active', now()
);
INSERT INTO public.projects (id, name, designer_id, created_by, studio_id, status)
VALUES (
  'f2013000-0000-4000-8000-000000000010', 'SQ2013 House',
  'f2013000-0000-4000-8000-000000000001', 'f2013000-0000-4000-8000-000000000001',
  'f2013000-0000-4000-8000-000000000002', 'active'
);
INSERT INTO public.project_rooms (id, project_id, name, sort_order)
VALUES ('f2013000-0000-4000-8000-000000000011', 'f2013000-0000-4000-8000-000000000010', 'Living room', 0);
INSERT INTO public.products (
  id, name, captured_at, layer, owner_user_id, price_trade, price_retail
) VALUES (
  'f2013000-0000-4000-8000-000000000020', 'SQ2013 Fictional Material Chair', now(), 'personal',
  'f2013000-0000-4000-8000-000000000001', 80000, 120000
);
INSERT INTO public.product_configurations (
  id, product_id, owner_user_id, studio_id, project_id, version, schema_revision,
  evaluation, snapshot, snapshot_hash, is_complete, is_valid
) VALUES (
  'f2013000-0000-4000-8000-000000000021', 'f2013000-0000-4000-8000-000000000020',
  'f2013000-0000-4000-8000-000000000001', 'f2013000-0000-4000-8000-000000000002',
  'f2013000-0000-4000-8000-000000000010', 1, 1,
  '{}'::jsonb, '{"selections": []}'::jsonb, repeat('a', 64), true, true
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f2013000-0000-4000-8000-000000000001","role":"authenticated"}';
SET LOCAL request.jwt.claim.sub = 'f2013000-0000-4000-8000-000000000001';

DO $$
DECLARE
  v_request constant jsonb := '{
    "projectId":"f2013000-0000-4000-8000-000000000010",
    "productId":"f2013000-0000-4000-8000-000000000020",
    "name":"SQ2013 Fictional Material Chair",
    "itemType":"fixed",
    "assignmentScope":"room",
    "roomId":"f2013000-0000-4000-8000-000000000011",
    "boardId":null,
    "disposition":"candidate",
    "duplicateMode":"reuse",
    "configurationId":"f2013000-0000-4000-8000-000000000021",
    "roleConfigurationIdentity":"default",
    "source":"engine",
    "idempotencyKey":"sq2013-configured-retry"
  }'::jsonb;
  v_first jsonb;
  v_retry jsonb;
  v_retry_state text;
  v_retry_error text;
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.project_ffe_items
    WHERE project_id = (v_request->>'projectId')::uuid
  ), 'SQ2013: placement starts with no project selections';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.project_ffe_command_idempotency
    WHERE actor_id = auth.uid() AND idempotency_key = v_request->>'idempotencyKey'
  ), 'SQ2013: placement starts with no idempotency receipt';

  v_first := public.place_product_in_project_v2(v_request);
  ASSERT v_first->>'outcome' = 'created', 'SQ2013: first configured placement creates a selection';
  ASSERT EXISTS (
    SELECT 1 FROM public.project_ffe_specs spec
    JOIN public.project_ffe_items item ON item.id = spec.ffe_item_id
    WHERE item.id = (v_first->>'selectionId')::uuid
      AND item.project_id = (v_request->>'projectId')::uuid
      AND item.project_room_id = (v_request->>'roomId')::uuid
      AND item.product_id = (v_request->>'productId')::uuid
      AND item.design_disposition = 'candidate'
      AND spec.configuration_id = (v_request->>'configurationId')::uuid
  ), 'SQ2013: first placement persists the actual configuration, room, product and candidate disposition';
  RAISE NOTICE 'PASS SQ2013: first configured placement and binding readback';

  -- Both calls receive the SAME immutable jsonb value. Simulates a response
  -- lost after the first command completed; no client-side request mutation.
  BEGIN
    v_retry := public.place_product_in_project_v2(v_request);
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_retry_state = RETURNED_SQLSTATE, v_retry_error = MESSAGE_TEXT;
  END;
  ASSERT v_retry_state IS NULL,
    format('SQ2013: identical configured placement retry must succeed; got %s: %s', v_retry_state, v_retry_error);
  ASSERT v_retry = v_first, 'SQ2013: identical retry returns the original placement response';
  ASSERT (SELECT count(*) = 1 FROM public.project_ffe_items
          WHERE project_id = (v_request->>'projectId')::uuid),
    'SQ2013: identical retry does not duplicate the selection';
  ASSERT (SELECT count(*) = 1 FROM public.project_ffe_command_idempotency
          WHERE actor_id = auth.uid() AND idempotency_key = v_request->>'idempotencyKey'),
    'SQ2013: identical retry retains one command receipt';
  RAISE NOTICE 'PASS SQ2013: identical configured placement retry';
END;
$$;
RESET ROLE;
ROLLBACK;
