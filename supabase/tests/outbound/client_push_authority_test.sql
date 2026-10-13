-- SQ-904: client push authority persists on the notification row.
-- Run with: supabase test db supabase/tests/outbound/client_push_authority_test.sql
BEGIN;
SELECT plan(2);

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('d9040000-0000-4000-8000-000000000001', 'push-designer@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d9040000-0000-4000-8000-000000000002', 'push-client@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('d9040000-0000-4000-8000-000000000001', 'push-designer@test.invalid', 'Push Designer', true, now(), now()),
  ('d9040000-0000-4000-8000-000000000002', 'push-client@test.invalid', 'Push Client', false, now(), now())
ON CONFLICT (id) DO UPDATE SET is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('d9040000-0000-4000-8000-000000000003', 'design_studio', 'Push Authority Studio', 'push-authority-test', 'active');

INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('d9040000-0000-4000-8000-000000000004', 'd9040000-0000-4000-8000-000000000001', 'd9040000-0000-4000-8000-000000000003', 'owner', 'active', now());

INSERT INTO public.designer_clients (id, designer_id, client_id, client_name, client_email, status, source)
VALUES ('d9040000-0000-4000-8000-000000000005', 'd9040000-0000-4000-8000-000000000001', 'd9040000-0000-4000-8000-000000000002', 'Push Client', 'push-client@test.invalid', 'active', 'direct');

SELECT lives_ok($q$SELECT public.notify_client_attention(
  p_user_id => 'd9040000-0000-4000-8000-000000000002',
  p_entity_type => 'invoice',
  p_entity_id => 'd9040000-0000-4000-8000-000000000006',
  p_title => 'An invoice is ready',
  p_body => 'Push authority test',
  p_metadata => '{}'::jsonb,
  p_authority => '{"kind":"designer","userId":"d9040000-0000-4000-8000-000000000001"}'::jsonb
)$q$, 'notify_client_attention accepts and records an authority');

SELECT is(
  (SELECT send_authority FROM public.notification_log
    WHERE user_id = 'd9040000-0000-4000-8000-000000000002'
      AND channel = 'push'
      AND metadata->>'entity_id' = 'd9040000-0000-4000-8000-000000000006'),
  '{"kind":"designer","userId":"d9040000-0000-4000-8000-000000000001"}'::jsonb,
  'push row persists its send authority'
);

SELECT * FROM finish();
ROLLBACK;
