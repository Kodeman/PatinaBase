-- ═══════════════════════════════════════════════════════════════════════════
-- Design request pipeline tests (migrations 00285–00289)
--
-- Covers:
--   1. Assigned submit → lead 'new' + junction (one primary) + active/full
--      associations for the designer + in-app notification row.
--   2. Pool submit → designer_id NULL, no associations; visible in
--      open_design_requests to both designers; invisible to a non-designer
--      (authenticated) and to anon; view exposes no homeowner-identity columns.
--   3. Validation error slugs (each RAISE EXCEPTION path).
--   4. Idempotent replay on (homeowner_id, client_request_id).
--   5. Claim race: A wins; B → already_claimed; A re-claim → already_yours;
--      non-designer → not_designer; unknown id → request_not_found.
--   6. Post-claim RLS: A reads lead/junction/scans/room_scan_images; B cannot.
--   7. Storage policy (00287): objects laid out under scan-id AND under legacy
--      room-id 3rd path segment are both readable by A post-claim, neither by B.
--   8. document_state: pool lead absent pre-claim; Shape C for A post-claim.
--   9. Auto-resolve (ruling #2): a client with EXACTLY ONE active
--      designer_clients relationship submits with NULL designer → assigned.
--  10. Homeowner lead RLS (00014): homeowner reads own lead, another does not.
--  11. Client status notification (00289): a designer flipping an app-originated
--      lead (client_request_id set) to 'accepted' inserts exactly one homeowner
--      in-app row carrying entity_type='design_request'.
--  12. Legacy lead flip (00289): a status flip on a lead with client_request_id
--      NULL inserts no homeowner notification (keeps 00288 reconciles silent).
--
-- How to run:
--   scripts/run-supabase-sql-test.sh supabase/tests/rls/design_requests_test.sql
--
-- Transaction-wrapped + ROLLBACK — rerunnable, no side effects.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('de000000-0000-4000-8000-000000000001', 'dr-client@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('de000000-0000-4000-8000-000000000002', 'dr-desa@test.invalid',     '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('de000000-0000-4000-8000-000000000003', 'dr-desb@test.invalid',     '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('de000000-0000-4000-8000-000000000004', 'dr-nondesigner@test.invalid','', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('de000000-0000-4000-8000-000000000005', 'dr-soloclient@test.invalid','', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, role, is_designer, city, state, zip)
VALUES
  ('de000000-0000-4000-8000-000000000001', 'dr-client@test.invalid',     'DR Client',    'homeowner', false, 'Austin',  'TX', '78701'),
  ('de000000-0000-4000-8000-000000000002', 'dr-desa@test.invalid',       'DR Designer A','designer',  true,  NULL, NULL, NULL),
  ('de000000-0000-4000-8000-000000000003', 'dr-desb@test.invalid',       'DR Designer B','designer',  true,  NULL, NULL, NULL),
  ('de000000-0000-4000-8000-000000000004', 'dr-nondesigner@test.invalid','DR NonDesigner','homeowner',false, NULL, NULL, NULL),
  ('de000000-0000-4000-8000-000000000005', 'dr-soloclient@test.invalid', 'DR SoloClient','homeowner', false, 'Dallas', 'TX', '75201')
ON CONFLICT (id) DO UPDATE SET is_designer = EXCLUDED.is_designer, city = EXCLUDED.city, state = EXCLUDED.state, zip = EXCLUDED.zip;

-- Solo client has EXACTLY ONE active designer_clients relationship → Designer A.
INSERT INTO designer_clients (id, designer_id, client_id, status)
VALUES ('de000000-0000-4000-8000-0000000000c1',
        'de000000-0000-4000-8000-000000000002',
        'de000000-0000-4000-8000-000000000005', 'active');

-- A room owned by the client, so sc_room can carry a legacy room_id (case 7).
INSERT INTO rooms (id, user_id, name, type)
VALUES ('de000000-0000-4000-8000-0000000000a1',
        'de000000-0000-4000-8000-000000000001', 'DR Living Room', 'living_room');

-- Scans. All owned by the client except sc_sc (owned by the solo client).
INSERT INTO room_scans (id, user_id, name, status, room_type, floor_area, thumbnail_url, room_id)
VALUES
  ('de000000-0000-4000-8000-0000000000f1','de000000-0000-4000-8000-000000000001','sc_a1',    'ready',      'living_room', 240.5, 'https://thumb/f1.jpg', NULL),
  ('de000000-0000-4000-8000-0000000000f2','de000000-0000-4000-8000-000000000001','sc_a2',    'ready',      'bedroom',     150.0, 'https://thumb/f2.jpg', NULL),
  ('de000000-0000-4000-8000-0000000000f3','de000000-0000-4000-8000-000000000001','sc_pool',  'ready',      'kitchen',     180.0, 'https://thumb/f3.jpg', NULL),
  ('de000000-0000-4000-8000-0000000000f4','de000000-0000-4000-8000-000000000001','sc_proc',  'processing', 'office',      100.0, NULL,                   NULL),
  ('de000000-0000-4000-8000-0000000000f5','de000000-0000-4000-8000-000000000001','sc_idem',  'ready',      'den',          90.0, 'https://thumb/f5.jpg', NULL),
  ('de000000-0000-4000-8000-0000000000f6','de000000-0000-4000-8000-000000000001','sc_claim1','ready',      'living_room', 300.0, 'https://thumb/f6.jpg', NULL),
  ('de000000-0000-4000-8000-0000000000f7','de000000-0000-4000-8000-000000000001','sc_room',  'ready',      'living_room', 300.0, 'https://thumb/f7.jpg', 'de000000-0000-4000-8000-0000000000a1'),
  ('de000000-0000-4000-8000-0000000000f8','de000000-0000-4000-8000-000000000001','sc_doc',   'ready',      'kitchen',     170.0, 'https://thumb/f8.jpg', NULL),
  ('de000000-0000-4000-8000-0000000000f9','de000000-0000-4000-8000-000000000005','sc_sc',    'ready',      'living_room', 200.0, 'https://thumb/f9.jpg', NULL);

-- Images for the claimed scan (case 6 read check).
INSERT INTO room_scan_images (id, scan_id, role, image_url, captured_at)
VALUES ('de000000-0000-4000-8000-0000000000e1','de000000-0000-4000-8000-0000000000f6','hero','https://img/f6-hero.jpg', NOW());

-- Storage objects for case 7 (scan-id layout + legacy room-id layout).
-- name = {artifactType}/{userId}/{scanId or roomId}/{file}
INSERT INTO storage.objects (id, bucket_id, name)
VALUES
  ('de000000-0000-4000-8000-0000000000d1', 'room-scans',
   'usdz/de000000-0000-4000-8000-000000000001/de000000-0000-4000-8000-0000000000f6/scan.usdz'),
  ('de000000-0000-4000-8000-0000000000d2', 'room-scans',
   'usdz/de000000-0000-4000-8000-000000000001/de000000-0000-4000-8000-0000000000a1/scan.usdz');

-- ─── helpers ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS VOID AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO anon, authenticated;

-- Cross-block state (lead ids created inside DO blocks).
CREATE TEMP TABLE pg_temp_state (k text PRIMARY KEY, v uuid) ON COMMIT DROP;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 1 — assigned submit
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_res     jsonb;
  v_lead    uuid;
  v_count   integer;
  v_primary integer;
BEGIN
  PERFORM pg_temp.assume_user('de000000-0000-4000-8000-000000000001');
  v_res := public.submit_design_request(
    ARRAY['de000000-0000-4000-8000-0000000000f1',
          'de000000-0000-4000-8000-0000000000f2']::uuid[],
    'full_room',
    p_designer_id => 'de000000-0000-4000-8000-000000000002');
  PERFORM pg_temp.reset_role();

  v_lead := (v_res->>'lead_id')::uuid;
  INSERT INTO pg_temp_state VALUES ('lead1', v_lead);

  ASSERT (v_res->>'status') = 'new',                'FAIL 1a: status new, got ' || COALESCE(v_res->>'status','NULL');
  ASSERT (v_res->>'designer_id') = 'de000000-0000-4000-8000-000000000002', 'FAIL 1b: designer assigned';
  ASSERT (v_res->>'pooled')::boolean = false,       'FAIL 1c: not pooled';
  ASSERT (v_res->>'idempotent_replay')::boolean = false, 'FAIL 1d: not a replay';

  ASSERT (SELECT status = 'new' AND designer_id = 'de000000-0000-4000-8000-000000000002'
            AND room_scan_id = 'de000000-0000-4000-8000-0000000000f1'
          FROM leads WHERE id = v_lead),           'FAIL 1e: lead row shape (status/designer/primary)';

  SELECT count(*) INTO v_count FROM lead_room_scans WHERE lead_id = v_lead;
  ASSERT v_count = 2,                               'FAIL 1f: expected 2 junction rows, got ' || v_count;

  SELECT count(*) INTO v_primary FROM lead_room_scans WHERE lead_id = v_lead AND is_primary;
  ASSERT v_primary = 1,                             'FAIL 1g: exactly one primary, got ' || v_primary;
  ASSERT (SELECT is_primary FROM lead_room_scans WHERE lead_id = v_lead AND scan_id = 'de000000-0000-4000-8000-0000000000f1'),
                                                    'FAIL 1h: first scan is the primary';

  SELECT count(*) INTO v_count FROM room_scan_associations
   WHERE lead_id = v_lead AND designer_id = 'de000000-0000-4000-8000-000000000002'
     AND status = 'active' AND access_level = 'full';
  ASSERT v_count = 2,                               'FAIL 1i: expected 2 active/full associations, got ' || v_count;

  SELECT count(*) INTO v_count FROM notification_log
   WHERE user_id = 'de000000-0000-4000-8000-000000000002' AND type = 'design_request_received';
  ASSERT v_count = 1,                               'FAIL 1j: expected 1 designer notification, got ' || v_count;

  RAISE NOTICE 'design_requests: case 1 (assigned submit) passed.';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 2 — pool submit + pool visibility
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_res   jsonb;
  v_lead  uuid;
  v_count integer;
BEGIN
  PERFORM pg_temp.assume_user('de000000-0000-4000-8000-000000000001');
  v_res := public.submit_design_request(
    ARRAY['de000000-0000-4000-8000-0000000000f3']::uuid[], 'consultation');
  PERFORM pg_temp.reset_role();

  v_lead := (v_res->>'lead_id')::uuid;
  INSERT INTO pg_temp_state VALUES ('lead2', v_lead);

  ASSERT (v_res->>'designer_id') IS NULL,      'FAIL 2a: pool submit must leave designer NULL';
  ASSERT (v_res->>'pooled')::boolean = true,   'FAIL 2b: pooled=true';
  ASSERT (SELECT count(*) FROM room_scan_associations WHERE lead_id = v_lead) = 0,
                                               'FAIL 2c: no associations minted for a pool submit';

  -- visible to designer A
  PERFORM pg_temp.assume_user('de000000-0000-4000-8000-000000000002');
  SELECT count(*) INTO v_count FROM open_design_requests WHERE id = v_lead;
  ASSERT v_count = 1,                          'FAIL 2d: pool request visible to designer A, got ' || v_count;
  -- and its metadata (scan_count + location + public thumbnail flow through)
  ASSERT (SELECT scan_count = 1 AND location_city = 'Austin' AND thumbnail_url = 'https://thumb/f3.jpg'
          FROM open_design_requests WHERE id = v_lead),
                                               'FAIL 2e: pool card metadata (scan_count/city/thumb)';
  PERFORM pg_temp.reset_role();

  -- visible to designer B
  PERFORM pg_temp.assume_user('de000000-0000-4000-8000-000000000003');
  SELECT count(*) INTO v_count FROM open_design_requests WHERE id = v_lead;
  ASSERT v_count = 1,                          'FAIL 2f: pool request visible to designer B, got ' || v_count;
  PERFORM pg_temp.reset_role();

  -- invisible to the client (authenticated, not a designer)
  PERFORM pg_temp.assume_user('de000000-0000-4000-8000-000000000001');
  SELECT count(*) INTO v_count FROM open_design_requests WHERE id = v_lead;
  ASSERT v_count = 0,                          'FAIL 2g: pool request must be invisible to the client, got ' || v_count;
  PERFORM pg_temp.reset_role();

  -- invisible to a non-designer authenticated user
  PERFORM pg_temp.assume_user('de000000-0000-4000-8000-000000000004');
  SELECT count(*) INTO v_count FROM open_design_requests WHERE id = v_lead;
  ASSERT v_count = 0,                          'FAIL 2h: pool request must be invisible to a non-designer, got ' || v_count;
  PERFORM pg_temp.reset_role();

  -- invisible to anon (no grant → treat insufficient_privilege as invisible)
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '', true);
    EXECUTE 'SET LOCAL ROLE anon';
    EXECUTE 'SELECT count(*) FROM open_design_requests WHERE id = $1' INTO v_count USING v_lead;
  EXCEPTION WHEN insufficient_privilege THEN
    v_count := 0;
  END;
  EXECUTE 'RESET ROLE';
  ASSERT v_count = 0,                          'FAIL 2i: pool request must be invisible to anon, got ' || v_count;

  -- structural: the view exposes no homeowner-identity columns
  ASSERT (SELECT count(*) FROM information_schema.columns
           WHERE table_name = 'open_design_requests'
             AND column_name IN ('homeowner_id','client_profile_id','client_name','email','full_name')) = 0,
                                               'FAIL 2j: pool view must not expose homeowner identity';

  RAISE NOTICE 'design_requests: case 2 (pool submit + visibility) passed.';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 3 — validation error slugs
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_err text;
BEGIN
  -- not_authenticated (cleared claims → auth.uid() NULL)
  PERFORM pg_temp.reset_role();
  BEGIN
    PERFORM public.submit_design_request(ARRAY['de000000-0000-4000-8000-0000000000f1']::uuid[], 'full_room');
    v_err := '<none>';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  ASSERT v_err = 'not_authenticated', 'FAIL 3a: expected not_authenticated, got ' || v_err;

  PERFORM pg_temp.assume_user('de000000-0000-4000-8000-000000000001');

  -- no_scans
  BEGIN
    PERFORM public.submit_design_request(ARRAY[]::uuid[], 'full_room');
    v_err := '<none>';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  ASSERT v_err = 'no_scans', 'FAIL 3b: expected no_scans, got ' || v_err;

  -- primary_not_in_set
  BEGIN
    PERFORM public.submit_design_request(
      ARRAY['de000000-0000-4000-8000-0000000000f1']::uuid[], 'full_room',
      p_primary_scan_id => 'de000000-0000-4000-8000-0000000000f2');
    v_err := '<none>';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  ASSERT v_err = 'primary_not_in_set', 'FAIL 3c: expected primary_not_in_set, got ' || v_err;

  -- invalid_project_type
  BEGIN
    PERFORM public.submit_design_request(ARRAY['de000000-0000-4000-8000-0000000000f1']::uuid[], 'bogus_type');
    v_err := '<none>';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  ASSERT v_err = 'invalid_project_type', 'FAIL 3d: expected invalid_project_type, got ' || v_err;

  -- scan_not_found_or_not_owned (scan owned by the solo client)
  BEGIN
    PERFORM public.submit_design_request(ARRAY['de000000-0000-4000-8000-0000000000f9']::uuid[], 'full_room');
    v_err := '<none>';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  ASSERT v_err = 'scan_not_found_or_not_owned', 'FAIL 3e: expected scan_not_found_or_not_owned, got ' || v_err;

  -- scan_not_ready (processing scan)
  BEGIN
    PERFORM public.submit_design_request(ARRAY['de000000-0000-4000-8000-0000000000f4']::uuid[], 'full_room');
    v_err := '<none>';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  ASSERT v_err = 'scan_not_ready', 'FAIL 3f: expected scan_not_ready, got ' || v_err;

  -- designer_not_found (non-designer profile passed as designer)
  BEGIN
    PERFORM public.submit_design_request(
      ARRAY['de000000-0000-4000-8000-0000000000f1']::uuid[], 'full_room',
      p_designer_id => 'de000000-0000-4000-8000-000000000004');
    v_err := '<none>';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  ASSERT v_err = 'designer_not_found', 'FAIL 3g: expected designer_not_found, got ' || v_err;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE 'design_requests: case 3 (validation slugs) passed.';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 4 — idempotent replay
--
-- Covers the sequential replay-probe path. The CONCURRENT double-submit window
-- (two in-flight calls both missing the probe, loser hitting 23505 on
-- uq_leads_homeowner_client_request) is handled by the unique_violation →
-- replay conversion inside submit_design_request, but a single-session psql
-- script cannot simulate two concurrent transactions — that branch is covered
-- by construction (see the EXCEPTION block in 00285), not by this suite.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_r1 jsonb;
  v_r2 jsonb;
  v_key uuid := 'de000000-0000-4000-8000-00000000c0de';
BEGIN
  PERFORM pg_temp.assume_user('de000000-0000-4000-8000-000000000001');
  v_r1 := public.submit_design_request(
    ARRAY['de000000-0000-4000-8000-0000000000f5']::uuid[], 'staging',
    p_client_request_id => v_key);
  v_r2 := public.submit_design_request(
    ARRAY['de000000-0000-4000-8000-0000000000f5']::uuid[], 'staging',
    p_client_request_id => v_key);
  PERFORM pg_temp.reset_role();

  ASSERT (v_r1->>'idempotent_replay')::boolean = false, 'FAIL 4a: first call is not a replay';
  ASSERT (v_r2->>'idempotent_replay')::boolean = true,  'FAIL 4b: second call is a replay';
  ASSERT (v_r1->>'lead_id') = (v_r2->>'lead_id'),       'FAIL 4c: replay returns the same lead_id';
  ASSERT (SELECT count(*) FROM leads WHERE homeowner_id = 'de000000-0000-4000-8000-000000000001'
            AND client_request_id = v_key) = 1,          'FAIL 4d: exactly one lead for the idempotency key';

  RAISE NOTICE 'design_requests: case 4 (idempotent replay) passed.';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 5 — claim race
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_res  jsonb;
  v_lead uuid;
  v_err  text;
BEGIN
  -- pool lead containing sc_claim1 (scan-id layout) + sc_room (legacy room-id)
  PERFORM pg_temp.assume_user('de000000-0000-4000-8000-000000000001');
  v_res := public.submit_design_request(
    ARRAY['de000000-0000-4000-8000-0000000000f6',
          'de000000-0000-4000-8000-0000000000f7']::uuid[], 'full_room');
  PERFORM pg_temp.reset_role();
  v_lead := (v_res->>'lead_id')::uuid;
  INSERT INTO pg_temp_state VALUES ('lead5', v_lead);
  ASSERT (v_res->>'pooled')::boolean = true, 'FAIL 5a: lead5 should be pooled';

  -- A wins
  PERFORM pg_temp.assume_user('de000000-0000-4000-8000-000000000002');
  v_res := public.claim_design_request(v_lead);
  PERFORM pg_temp.reset_role();
  ASSERT (v_res->>'designer_id') = 'de000000-0000-4000-8000-000000000002', 'FAIL 5b: A should win the claim';
  ASSERT (v_res->>'already_yours')::boolean = false, 'FAIL 5c: A''s win is a fresh claim';
  ASSERT (SELECT designer_id = 'de000000-0000-4000-8000-000000000002' FROM leads WHERE id = v_lead),
                                             'FAIL 5d: lead.designer_id persisted to A';
  ASSERT (SELECT count(*) FROM room_scan_associations
            WHERE lead_id = v_lead AND designer_id = 'de000000-0000-4000-8000-000000000002'
              AND status = 'active' AND access_level = 'full') = 2,
                                             'FAIL 5e: claim mints 2 active/full associations';
  ASSERT (SELECT count(*) FROM notification_log WHERE type = 'design_request_claimed'
            AND user_id = 'de000000-0000-4000-8000-000000000001') = 1,
                                             'FAIL 5f: homeowner claimed-notification written';
  ASSERT (SELECT count(*) FROM notification_log WHERE type = 'design_request_claim_confirmed'
            AND user_id = 'de000000-0000-4000-8000-000000000002') = 1,
                                             'FAIL 5g: designer claim-confirm notification written';

  -- B loses
  PERFORM pg_temp.assume_user('de000000-0000-4000-8000-000000000003');
  BEGIN
    v_res := public.claim_design_request(v_lead);
    v_err := '<none>';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  PERFORM pg_temp.reset_role();
  ASSERT v_err = 'already_claimed', 'FAIL 5h: B should get already_claimed, got ' || v_err;

  -- A re-claims → already_yours
  PERFORM pg_temp.assume_user('de000000-0000-4000-8000-000000000002');
  v_res := public.claim_design_request(v_lead);
  PERFORM pg_temp.reset_role();
  ASSERT (v_res->>'already_yours')::boolean = true, 'FAIL 5i: A re-claim → already_yours';

  -- non-designer cannot claim
  PERFORM pg_temp.assume_user('de000000-0000-4000-8000-000000000004');
  BEGIN
    v_res := public.claim_design_request(v_lead);
    v_err := '<none>';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  PERFORM pg_temp.reset_role();
  ASSERT v_err = 'not_designer', 'FAIL 5j: non-designer → not_designer, got ' || v_err;

  -- unknown lead → request_not_found
  PERFORM pg_temp.assume_user('de000000-0000-4000-8000-000000000002');
  BEGIN
    v_res := public.claim_design_request('de000000-0000-4000-8000-0000dead0000');
    v_err := '<none>';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  PERFORM pg_temp.reset_role();
  ASSERT v_err = 'request_not_found', 'FAIL 5k: unknown id → request_not_found, got ' || v_err;

  RAISE NOTICE 'design_requests: case 5 (claim race) passed.';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 6 — post-claim RLS (A reads, B cannot)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_lead uuid;
BEGIN
  SELECT v INTO v_lead FROM pg_temp_state WHERE k = 'lead5';

  -- Designer A (claimed the lead)
  PERFORM pg_temp.assume_user('de000000-0000-4000-8000-000000000002');
  ASSERT (SELECT count(*) FROM leads WHERE id = v_lead) = 1,                          'FAIL 6a: A reads the lead';
  ASSERT (SELECT count(*) FROM lead_room_scans WHERE lead_id = v_lead) = 2,           'FAIL 6b: A reads the junction';
  ASSERT (SELECT count(*) FROM room_scans WHERE id IN
            ('de000000-0000-4000-8000-0000000000f6','de000000-0000-4000-8000-0000000000f7')) = 2,
                                                                                       'FAIL 6c: A reads both scans';
  ASSERT (SELECT count(*) FROM room_scan_images WHERE scan_id = 'de000000-0000-4000-8000-0000000000f6') = 1,
                                                                                       'FAIL 6d: A reads the scan images';
  PERFORM pg_temp.reset_role();

  -- Designer B (never claimed, no association, no designer_clients link)
  PERFORM pg_temp.assume_user('de000000-0000-4000-8000-000000000003');
  ASSERT (SELECT count(*) FROM leads WHERE id = v_lead) = 0,                          'FAIL 6e: B must not read the lead';
  ASSERT (SELECT count(*) FROM lead_room_scans WHERE lead_id = v_lead) = 0,           'FAIL 6f: B must not read the junction';
  ASSERT (SELECT count(*) FROM room_scans WHERE id = 'de000000-0000-4000-8000-0000000000f6') = 0,
                                                                                       'FAIL 6g: B must not read the scan';
  ASSERT (SELECT count(*) FROM room_scan_images WHERE scan_id = 'de000000-0000-4000-8000-0000000000f6') = 0,
                                                                                       'FAIL 6h: B must not read the scan images';
  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'design_requests: case 6 (post-claim RLS) passed.';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 7 — storage policy: scan-id AND legacy room-id layouts
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  -- Designer A (has active/full associations on both scans post-claim)
  PERFORM pg_temp.assume_user('de000000-0000-4000-8000-000000000002');
  ASSERT (SELECT count(*) FROM storage.objects WHERE id = 'de000000-0000-4000-8000-0000000000d1') = 1,
                                          'FAIL 7a: A reads the scan-id-laid object';
  ASSERT (SELECT count(*) FROM storage.objects WHERE id = 'de000000-0000-4000-8000-0000000000d2') = 1,
                                          'FAIL 7b: A reads the legacy room-id-laid object';
  PERFORM pg_temp.reset_role();

  -- Designer B (no association) reads neither
  PERFORM pg_temp.assume_user('de000000-0000-4000-8000-000000000003');
  ASSERT (SELECT count(*) FROM storage.objects WHERE id = 'de000000-0000-4000-8000-0000000000d1') = 0,
                                          'FAIL 7c: B must not read the scan-id object';
  ASSERT (SELECT count(*) FROM storage.objects WHERE id = 'de000000-0000-4000-8000-0000000000d2') = 0,
                                          'FAIL 7d: B must not read the room-id object';
  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'design_requests: case 7 (storage policy) passed.';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 8 — document_state: pool absent pre-claim; Shape C for A post-claim
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_res  jsonb;
  v_lead uuid;
BEGIN
  PERFORM pg_temp.assume_user('de000000-0000-4000-8000-000000000001');
  v_res := public.submit_design_request(
    ARRAY['de000000-0000-4000-8000-0000000000f8']::uuid[], 'full_room');
  PERFORM pg_temp.reset_role();
  v_lead := (v_res->>'lead_id')::uuid;

  -- pre-claim: absent from A's document_state (designer NULL → Shape C excludes + RLS blocks)
  PERFORM pg_temp.assume_user('de000000-0000-4000-8000-000000000002');
  ASSERT (SELECT count(*) FROM document_state WHERE lead_id = v_lead) = 0,
                                          'FAIL 8a: pool lead absent from document_state pre-claim';
  PERFORM pg_temp.reset_role();

  -- claim it
  PERFORM pg_temp.assume_user('de000000-0000-4000-8000-000000000002');
  PERFORM public.claim_design_request(v_lead);
  -- post-claim: present as a Shape C row for A
  ASSERT (SELECT count(*) FROM document_state
            WHERE lead_id = v_lead AND designer_id = 'de000000-0000-4000-8000-000000000002') = 1,
                                          'FAIL 8b: claimed lead present in A''s document_state';
  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'design_requests: case 8 (document_state) passed.';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 9 — auto-resolve (exactly one active designer_clients relationship)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_res jsonb;
BEGIN
  PERFORM pg_temp.assume_user('de000000-0000-4000-8000-000000000005'); -- solo client → Designer A
  v_res := public.submit_design_request(
    ARRAY['de000000-0000-4000-8000-0000000000f9']::uuid[], 'full_room');
  PERFORM pg_temp.reset_role();

  ASSERT (v_res->>'designer_id') = 'de000000-0000-4000-8000-000000000002',
                                          'FAIL 9a: auto-resolved to the single active designer';
  ASSERT (v_res->>'pooled')::boolean = false, 'FAIL 9b: auto-resolved request is not pooled';
  ASSERT (SELECT count(*) FROM room_scan_associations
            WHERE lead_id = (v_res->>'lead_id')::uuid
              AND designer_id = 'de000000-0000-4000-8000-000000000002' AND status = 'active') = 1,
                                          'FAIL 9c: auto-resolved request mints the association';

  RAISE NOTICE 'design_requests: case 9 (auto-resolve) passed.';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 10 — homeowner lead RLS (00014): own lead visible, others' not
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_lead  uuid;
  v_count integer;
BEGIN
  SELECT v INTO v_lead FROM pg_temp_state WHERE k = 'lead1';  -- homeowner 000001's lead

  -- Owner homeowner reads its own lead.
  PERFORM pg_temp.assume_user('de000000-0000-4000-8000-000000000001');
  SELECT count(*) INTO v_count FROM leads WHERE id = v_lead;
  ASSERT v_count = 1, 'FAIL 10a: homeowner must read own lead, got ' || v_count;
  PERFORM pg_temp.reset_role();

  -- A different homeowner (non-designer, not the owner) sees zero rows.
  PERFORM pg_temp.assume_user('de000000-0000-4000-8000-000000000004');
  SELECT count(*) INTO v_count FROM leads WHERE id = v_lead;
  ASSERT v_count = 0, 'FAIL 10b: another homeowner must not read the lead, got ' || v_count;
  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'design_requests: case 10 (homeowner lead RLS) passed.';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 11 — client status notification (00289): app-originated 'accepted' flip
--
-- The UPDATE is performed by the AUTHENTICATED designer (auth.uid() = designer_id
-- passes the leads UPDATE policy). That user could NOT insert into notification_log
-- directly (00041 policy: WITH CHECK auth.uid() IS NULL) — so a single homeowner
-- row appearing proves the SECURITY DEFINER trigger escalation worked.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_lead  uuid := 'de000000-0000-4000-8000-0000000000b1';
  v_key   uuid := 'de000000-0000-4000-8000-0000000000c2';
  v_count integer;
BEGIN
  -- App-originated lead: client_request_id set, designer assigned so the designer
  -- can flip status through RLS. Inserted as superuser (fixtures bypass RLS).
  INSERT INTO leads (id, homeowner_id, designer_id, project_type, status, client_request_id)
  VALUES (v_lead,
          'de000000-0000-4000-8000-000000000001',
          'de000000-0000-4000-8000-000000000002',
          'full_room', 'new', v_key);

  -- Designer A accepts via a direct UPDATE (as the portal PostgREST path does).
  PERFORM pg_temp.assume_user('de000000-0000-4000-8000-000000000002');
  UPDATE leads SET status = 'accepted' WHERE id = v_lead;
  PERFORM pg_temp.reset_role();

  -- Exactly one homeowner in-app row, typed + tagged for client tap-through.
  SELECT count(*) INTO v_count
  FROM notification_log
  WHERE user_id = 'de000000-0000-4000-8000-000000000001'
    AND type = 'design_request_accepted'
    AND channel = 'in_app'
    AND (metadata->>'lead_id') = v_lead::text;
  ASSERT v_count = 1, 'FAIL 11a: expected exactly one homeowner accepted-notification, got ' || v_count;

  ASSERT (SELECT metadata->>'entity_type' = 'design_request'
            AND metadata->>'entity_id' = v_lead::text
          FROM notification_log
          WHERE user_id = 'de000000-0000-4000-8000-000000000001'
            AND type = 'design_request_accepted'
            AND (metadata->>'lead_id') = v_lead::text),
    'FAIL 11b: notification metadata must carry entity_type/entity_id for routing';

  RAISE NOTICE 'design_requests: case 11 (client status notification) passed.';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 12 — legacy lead flip (00289): client_request_id NULL → no notification
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_lead  uuid := 'de000000-0000-4000-8000-0000000000b2';
  v_count integer;
BEGIN
  -- Legacy/portal lead: no client_request_id. Designer assigned so we can flip.
  INSERT INTO leads (id, homeowner_id, designer_id, project_type, status, client_request_id)
  VALUES (v_lead,
          'de000000-0000-4000-8000-000000000001',
          'de000000-0000-4000-8000-000000000002',
          'full_room', 'new', NULL);

  PERFORM pg_temp.assume_user('de000000-0000-4000-8000-000000000002');
  UPDATE leads SET status = 'accepted' WHERE id = v_lead;
  PERFORM pg_temp.reset_role();

  SELECT count(*) INTO v_count
  FROM notification_log
  WHERE (metadata->>'lead_id') = v_lead::text;
  ASSERT v_count = 0, 'FAIL 12a: legacy-lead flip must insert no notification, got ' || v_count;

  RAISE NOTICE 'design_requests: case 12 (legacy flip silent) passed.';
  RAISE NOTICE 'All design_requests assertions passed.';
END $$;

ROLLBACK;
