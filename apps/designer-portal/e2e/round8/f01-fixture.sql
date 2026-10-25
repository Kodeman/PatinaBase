-- F01 / SQ-1814: FICTIONAL local-only full-service job, not client data.
-- Stable IDs (query the rows in specs; RPC-generated line IDs are not stable):
-- studio   f0180000-0000-4000-8000-000000000001
-- designer f0180000-0000-4000-8000-000000000002 (f01-designer@test.invalid)
-- outsider f0180000-0000-4000-8000-000000000003 (f01-outsider@test.invalid)
-- job      f0180000-0000-4000-8000-000000000010
-- living   f0180000-0000-4000-8000-000000000011 (36 lines)
-- dining   f0180000-0000-4000-8000-000000000012 (24 lines)
-- bedroom  f0180000-0000-4000-8000-000000000013 (20 lines)
-- scan     f0180000-0000-4000-8000-000000000020
-- note     f0180000-0000-4000-8000-000000000030
-- next act f0180000-0000-4000-8000-000000000040
-- Both fictional actors use password123, the existing local e2e password.
-- Extends pieces-fixture.sql's transaction / own-job teardown / authenticated
-- batch_create_named_project_needs pattern; never includes or deletes its job.
-- Later commerce/thread fixtures extend this baseline; no fake PO or signature.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
SELECT '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated',
       email, extensions.crypt('password123', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('full_name', name), now(), now(), '', '', '', ''
FROM (VALUES
  ('f0180000-0000-4000-8000-000000000002'::uuid, 'f01-designer@test.invalid', 'F01 Fictional Designer'),
  ('f0180000-0000-4000-8000-000000000003'::uuid, 'f01-outsider@test.invalid', 'F01 Fictional Outsider')
) AS actors(id, email, name)
ON CONFLICT (id) DO UPDATE SET encrypted_password = EXCLUDED.encrypted_password,
  email_confirmed_at = EXCLUDED.email_confirmed_at;

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
SELECT id, id, id::text, jsonb_build_object('sub', id, 'email', email), 'email', now(), now()
FROM auth.users WHERE id IN ('f0180000-0000-4000-8000-000000000002', 'f0180000-0000-4000-8000-000000000003')
ON CONFLICT (provider_id, provider) DO UPDATE SET identity_data = EXCLUDED.identity_data;

INSERT INTO public.profiles (id, email, full_name, display_name, role, is_designer)
SELECT id, email, raw_user_meta_data->>'full_name', raw_user_meta_data->>'full_name', 'designer', true
FROM auth.users WHERE id IN ('f0180000-0000-4000-8000-000000000002', 'f0180000-0000-4000-8000-000000000003')
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name,
  display_name = EXCLUDED.display_name, role = EXCLUDED.role, is_designer = true;

-- Match the native "Skip for now" state read by HelpStateProvider.
UPDATE public.profiles
SET help_state = jsonb_set(
  coalesce(help_state, '{}'::jsonb), '{tours}',
  coalesce(help_state->'tours', '{}'::jsonb)
    || '{"desk-walkthrough":{"abandoned":true,"atStep":0}}'::jsonb
)
WHERE id = 'f0180000-0000-4000-8000-000000000002';

INSERT INTO public.user_roles (user_id, role_id)
SELECT p.id, r.id FROM public.profiles p CROSS JOIN public.roles r
WHERE p.id IN ('f0180000-0000-4000-8000-000000000002', 'f0180000-0000-4000-8000-000000000003')
  AND r.name = 'independent_designer'
ON CONFLICT (user_id, role_id) DO NOTHING;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('f0180000-0000-4000-8000-000000000001', 'design_studio', 'F01 Fictional Studio', 'f01-fictional-studio', 'active')
ON CONFLICT (id) DO UPDATE SET status = 'active';
INSERT INTO public.organization_members (organization_id, user_id, role, status, joined_at)
SELECT 'f0180000-0000-4000-8000-000000000001', 'f0180000-0000-4000-8000-000000000002', 'owner', 'active', now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.organization_members
  WHERE organization_id = 'f0180000-0000-4000-8000-000000000001'
    AND user_id = 'f0180000-0000-4000-8000-000000000002'
    AND role = 'owner' AND status = 'active'
)
ON CONFLICT (user_id, organization_id) DO UPDATE SET role = 'owner', status = 'active';

-- Profile provisioning creates a personal studio before the explicit F01 seat.
-- Keep one active seat so native proposal inserts can derive the F01 studio.
-- Retain the inactive membership for the fixture teardown's owned-org lookup.
SET LOCAL request.jwt.claims = '{"role":"service_role"}';
UPDATE public.organization_members AS member
SET status = 'removed'
FROM public.organizations AS org
WHERE member.organization_id = org.id
  AND member.user_id = 'f0180000-0000-4000-8000-000000000002'
  AND member.role = 'owner' AND member.status = 'active'
  AND org.type = 'design_studio' AND org.name = 'F01 Fictional Designer'
  AND org.id <> 'f0180000-0000-4000-8000-000000000001'
  AND NOT EXISTS (
    SELECT 1 FROM public.organization_members AS other
    WHERE other.organization_id = org.id AND other.user_id <> member.user_id
  );
SET LOCAL request.jwt.claims = '{}';
DO $$ BEGIN
  IF (SELECT array_agg(organization_id ORDER BY organization_id)
      FROM public.organization_members
      WHERE user_id = 'f0180000-0000-4000-8000-000000000002' AND status = 'active')
    IS DISTINCT FROM ARRAY['f0180000-0000-4000-8000-000000000001'::uuid]
  THEN RAISE EXCEPTION 'F01 requires exactly one active seat in F01 Fictional Studio';
  END IF;
END $$;

-- Only this fixture's owned job and scan are rebuilt. No shared-stack reset.
DELETE FROM public.room_scans WHERE id = 'f0180000-0000-4000-8000-000000000020';
DELETE FROM public.projects WHERE id = 'f0180000-0000-4000-8000-000000000010';
INSERT INTO public.projects (id, name, status, created_by, designer_id, studio_id, notes)
VALUES ('f0180000-0000-4000-8000-000000000010', 'F01 Fictional Full-Service House', 'active',
  'f0180000-0000-4000-8000-000000000002', 'f0180000-0000-4000-8000-000000000002',
  'f0180000-0000-4000-8000-000000000001',
  'Fictional full-service whole-home commission. Local test data only. No signed agreement or purchase authority is asserted.');

-- Native whole-home phases describe full-service scope without fabricating an
-- executed proposal. Provenance is copied from the existing system template.
INSERT INTO public.project_phases (project_id, name, phase_key, sort_order, duration_weeks,
  canonical_stage_key, workflow_track, source_template_slug, source_template_version)
SELECT 'f0180000-0000-4000-8000-000000000010', phase->>'name', phase->>'phase_key',
  (phase->>'sort_order')::int, (phase->>'duration_weeks')::int,
  phase->>'canonical_stage_key', phase->>'workflow_track', template.slug, template.version
FROM public.phase_templates template CROSS JOIN LATERAL jsonb_array_elements(template.phases) phase
WHERE template.slug = 'whole_home' AND template.is_system;

INSERT INTO public.project_rooms (id, project_id, name, sort_order) VALUES
  ('f0180000-0000-4000-8000-000000000011', 'f0180000-0000-4000-8000-000000000010', 'Living Room', 0),
  ('f0180000-0000-4000-8000-000000000012', 'f0180000-0000-4000-8000-000000000010', 'Dining Room', 1),
  ('f0180000-0000-4000-8000-000000000013', 'f0180000-0000-4000-8000-000000000010', 'Bedroom', 2);

SELECT set_config('request.jwt.claims', json_build_object(
  'sub', 'f0180000-0000-4000-8000-000000000002', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT public.batch_create_named_project_needs(jsonb_build_object(
  'projectId', 'f0180000-0000-4000-8000-000000000010', 'roomId', rooms.id,
  'assignmentScope', 'room', 'idempotencyKey', 'f01-' || rooms.id || '-' || gen_random_uuid(),
  'lines', (SELECT jsonb_agg(jsonb_build_object(
    'name', 'F01 ' || rooms.name || ' selection ' || lpad(n::text, 2, '0'),
    'quantity', 1, 'unit', 'each', 'roughCents', 10000 + n * 100) ORDER BY n)
    FROM generate_series(1, CASE rooms.sort_order WHEN 0 THEN 36 WHEN 1 THEN 24 ELSE 20 END) n)))
FROM public.project_rooms rooms WHERE project_id = 'f0180000-0000-4000-8000-000000000010';
RESET ROLE;

INSERT INTO public.room_scans (id, user_id, project_id, project_room_id, name, status, scanned_at, processed_at, dimensions)
VALUES ('f0180000-0000-4000-8000-000000000020', 'f0180000-0000-4000-8000-000000000002',
  'f0180000-0000-4000-8000-000000000010', 'f0180000-0000-4000-8000-000000000011',
  'F01 Fictional Living Room Survey — not installed', 'ready', now(), now(),
  '{"width":5.2,"length":6.4,"height":2.7,"unit":"m"}');

INSERT INTO public.margin_notes (id, project_id, designer_id, body, anchor_kind, anchor_id)
SELECT 'f0180000-0000-4000-8000-000000000030', project_id, 'f0180000-0000-4000-8000-000000000002',
  'Fictional private note: confirm this selection against the living-room survey.', 'line', id
FROM public.project_ffe_items WHERE project_id = 'f0180000-0000-4000-8000-000000000010'
  AND name = 'F01 Living Room selection 01';

-- desk_read -> deriveDeskNeedList -> deriveDaySheet reads a genuine due task.
INSERT INTO public.project_tasks (id, project_id, title, status, due_date, section_key, owner, created_by)
VALUES ('f0180000-0000-4000-8000-000000000040', 'f0180000-0000-4000-8000-000000000010',
  'F01 review living-room selections', 'todo', current_date, 'project', 'designer',
  'f0180000-0000-4000-8000-000000000002');
COMMIT;
