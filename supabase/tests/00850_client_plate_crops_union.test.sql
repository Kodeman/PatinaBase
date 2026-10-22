-- 00850 — stale same-framing settlements retain every source-kind crop.
-- Run: psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--   -v ON_ERROR_STOP=1 -f supabase/tests/00850_client_plate_crops_union.test.sql
-- All fixture writes and RPC calls roll back; finish(true) fails psql on a red.
BEGIN;
SET LOCAL statement_timeout = '30s';
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(10);
SELECT is((SELECT count(*)::int FROM pg_proc WHERE pronamespace = 'public'::regnamespace
           AND proname = 'record_client_plate_asset'), 1,
          'signature: exactly one settlement function remains');
SELECT ok(to_regprocedure('public.record_client_plate_asset(uuid,uuid,jsonb)') IS NULL
          AND to_regprocedure('public.record_client_plate_asset(uuid,uuid,jsonb,jsonb)') IS NOT NULL
          AND NOT has_function_privilege('anon', 'public.record_client_plate_asset(uuid,uuid,jsonb,jsonb)', 'EXECUTE')
          AND NOT has_function_privilege('authenticated', 'public.record_client_plate_asset(uuid,uuid,jsonb,jsonb)', 'EXECUTE')
          AND has_function_privilege('service_role', 'public.record_client_plate_asset(uuid,uuid,jsonb,jsonb)', 'EXECUTE'),
          'signature: old overload absent and new signature keeps service-role-only grants');

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('85000000-0000-4000-8000-0000000000a1', 'us49-850-owner@test.invalid',  '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('85000000-0000-4000-8000-0000000000a2', 'us49-850-client@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('85000000-0000-4000-8000-0000000000a1', 'us49-850-owner@test.invalid',  'US49 850 Owner',  true,  now(), now()),
  ('85000000-0000-4000-8000-0000000000a2', 'us49-850-client@test.invalid', 'US49 850 Client', false, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, is_designer = EXCLUDED.is_designer;
INSERT INTO public.organizations (id, type, name, slug, address)
VALUES ('85000000-0000-4000-8000-0000000000f1', 'design_studio', 'US49 850 Studio', 'us49-850-studio-test',
        '{"city": "Hudson"}'::jsonb);
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('85000000-0000-4000-8000-0000000000e1', '85000000-0000-4000-8000-0000000000a1',
        '85000000-0000-4000-8000-0000000000f1', 'owner', 'active', now());
INSERT INTO public.projects (id, name, designer_id, client_id, created_by, studio_id, status, show_makers)
SELECT ('85000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'US49 850 House ' || n,
       '85000000-0000-4000-8000-0000000000a1', '85000000-0000-4000-8000-0000000000a2',
       '85000000-0000-4000-8000-0000000000a1', '85000000-0000-4000-8000-0000000000f1', 'active', false
FROM generate_series(1, 1) AS n;


-- The copy lane's actual JSON shape is keyed by crop name, not source kind.
-- These responses share framing, bytes and project, but came from maker/board.
CREATE TEMP TABLE payloads AS SELECT
  '{"wide":{"rect":[0,0,1600,1000],"widths":[800],"rev":"11111111111111111111111111111111"}}'::jsonb AS maker,
  '{"board":{"rect":[0,0,1600,1200],"widths":[800],"rev":"11111111111111111111111111111111"}}'::jsonb AS board;

CREATE FUNCTION pg_temp.settle(p_sha text, p_kind text, p_crops jsonb,
  p_framing jsonb DEFAULT '{"focal":null,"subjectBox":null}'::jsonb)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_request uuid := gen_random_uuid();
  v_token uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.client_plate_requests
    (id, project_id, source_kind, source_ref, source_url, status, lease_token, lease_expires_at)
  VALUES (v_request, '85000000-0000-4000-8000-000000000001', p_kind,
          jsonb_build_object('table', CASE WHEN p_kind = 'board' THEN 'project_boards'
                                         ELSE 'project_ffe_item_images' END, 'id', v_request),
          'https://img.test/plate.jpg', 'leased', v_token, now() + interval '10 minutes');
  RETURN public.record_client_plate_asset(v_request, v_token,
    jsonb_build_object('sha256', p_sha, 'originalKey',
      'plates/85000000-0000-4000-8000-000000000001/' || p_sha || '/original.jpg',
      'source_kind', p_kind, 'width', 1600, 'height', 1200, 'crops', p_crops), p_framing);
END;
$$;

SELECT pg_temp.settle(repeat('a',64), 'maker', maker) FROM payloads;
SELECT pg_temp.settle(repeat('a',64), 'board', maker || board) FROM payloads;
SELECT is((SELECT crops FROM public.client_plate_assets WHERE project_id = '85000000-0000-4000-8000-000000000001' AND sha256 = repeat('a',64)),
          (SELECT maker || board FROM payloads),
          'union: maker-only then union keeps both crops and their rev stamps');

SELECT pg_temp.settle(repeat('b',64), 'board', maker || board) FROM payloads;
SELECT pg_temp.settle(repeat('b',64), 'maker', maker) FROM payloads;
SELECT is((SELECT crops FROM public.client_plate_assets WHERE project_id = '85000000-0000-4000-8000-000000000001' AND sha256 = repeat('b',64)),
          (SELECT maker || board FROM payloads),
          'union: union then stale maker-only keeps both crops and their rev stamps');
SELECT ok((SELECT count(*) = 4 AND bool_and(status = 'done' AND asset_id IS NOT NULL AND lease_token IS NULL)
           FROM public.client_plate_requests WHERE project_id = '85000000-0000-4000-8000-000000000001'),
          'union: both sources in both orders finish done and reference their deduplicated asset');

-- A designer changes the asset after the old response was already in flight.
UPDATE public.client_plate_assets SET focal = '{0.7,0.4}', subject_box = '{0.2,0.1,0.6,0.8}'
WHERE project_id = '85000000-0000-4000-8000-000000000001' AND sha256 = repeat('b',64);
CREATE TEMP TABLE recrop AS SELECT
  '{"wide":{"rect":[100,0,1500,1000],"widths":[800,1200],"rev":"22222222222222222222222222222222"}}'::jsonb AS crops,
  '{"focal":[0.7,0.4],"subjectBox":[0.2,0.1,0.6,0.8]}'::jsonb AS framing;
SELECT pg_temp.settle(repeat('b',64), 'maker', crops, framing) FROM recrop;
SELECT is((SELECT crops FROM public.client_plate_assets WHERE project_id = '85000000-0000-4000-8000-000000000001' AND sha256 = repeat('b',64)),
          (SELECT recrop.crops || payloads.board FROM recrop, payloads),
          'framing: a current-framing recrop replaces carried names and keeps missing names');
SELECT pg_temp.settle(repeat('b',64), 'board', maker ||
  '{"sheet":{"rect":[0,0,1600,1200],"widths":[800],"rev":"11111111111111111111111111111111"}}'::jsonb) FROM payloads;
SELECT is((SELECT crops -> 'wide' FROM public.client_plate_assets WHERE project_id = '85000000-0000-4000-8000-000000000001' AND sha256 = repeat('b',64)),
          (SELECT crops -> 'wide' FROM recrop),
          'framing: an old-framing response after a recrop never overwrites an existing name');
SELECT is((SELECT crops -> 'sheet' ->> 'rev' FROM public.client_plate_assets WHERE project_id = '85000000-0000-4000-8000-000000000001' AND sha256 = repeat('b',64)),
          '11111111111111111111111111111111',
          'framing: an old-framing response adds absent names with their original rev');
CREATE TEMP TABLE before_legacy AS SELECT crops FROM public.client_plate_assets
WHERE project_id = '85000000-0000-4000-8000-000000000001' AND sha256 = repeat('b',64);
-- Deliberately invoke the public RPC with THREE arguments, as the old edge does.
INSERT INTO public.client_plate_requests(id,project_id,source_kind,source_ref,source_url,status,lease_token,lease_expires_at)
VALUES ('85000000-0000-4000-8000-000000000101','85000000-0000-4000-8000-000000000001','maker',
        '{"table":"project_ffe_item_images","id":"legacy"}','https://img.test/legacy.jpg','leased',
        '85000000-0000-4000-8000-000000000102',now()+interval '10 minutes');
SELECT public.record_client_plate_asset('85000000-0000-4000-8000-000000000101','85000000-0000-4000-8000-000000000102',
  jsonb_build_object('sha256',repeat('b',64),'originalKey',
    'plates/85000000-0000-4000-8000-000000000001/'||repeat('b',64)||'/original.jpg',
    'width',1600,'height',1200,'crops', maker ||
    '{"pair":{"rect":[0,0,800,1000],"widths":[800]}}'::jsonb)) FROM payloads;
SELECT is((SELECT crops FROM public.client_plate_assets WHERE project_id = '85000000-0000-4000-8000-000000000001' AND sha256 = repeat('b',64)),
          (SELECT crops || '{"pair":{"rect":[0,0,800,1000],"widths":[800]}}'::jsonb FROM before_legacy),
          'rollout: a three-argument null-snapshot call only adds absent crop names');

-- Same closed-job transition used by the 00848 plate regression.
SELECT set_config('app.project_completion_id', '85000000-0000-4000-8000-000000000001', true);
UPDATE public.projects SET status = 'completed' WHERE id = '85000000-0000-4000-8000-000000000001';
SELECT set_config('app.project_completion_id', '', true);
CREATE TEMP TABLE before_closed AS
SELECT to_jsonb(asset) AS row FROM public.client_plate_assets AS asset
WHERE project_id = '85000000-0000-4000-8000-000000000001' AND sha256 = repeat('b',64);
SELECT pg_temp.settle(repeat('b',64), 'board', '{"sheet":{"rect":[0,0,1600,1200],"widths":[1200],"rev":"22222222222222222222222222222222"}}');
SELECT is((SELECT to_jsonb(asset) FROM public.client_plate_assets AS asset
           WHERE project_id = '85000000-0000-4000-8000-000000000001' AND sha256 = repeat('b',64)),
          (SELECT row FROM before_closed),
          'closed: a late union response keeps the entire existing asset row byte-for-byte');

SELECT * FROM finish(true);
ROLLBACK;
