-- ═══════════════════════════════════════════════════════════════════════════
-- capture_enrichment: proposal-capture producer double-submit (migration 00516)
--
-- commit_proposal_capture (00516) is the new SECURITY DEFINER RPC backing
-- both the Chrome extension (effects.ts saveToInbox / background.ts queue
-- drain) and the designer-portal URL-paste (AddFromUrl). Unlike
-- commit_field_capture, proposal_captures' normal resting statuses ('inbox'/
-- 'assigned') are NOT terminal, so the ON CONFLICT ... WHERE guard alone
-- cannot prevent a second product mint on retry — this test specifically
-- proves the `v_capture.product_id IS NULL` guard does that job.
--
-- Covers:
--   (a) first commit creates exactly one proposal_captures row, one product,
--       one product_styles row (when style_ids given), one enrichment run.
--   (b) DOUBLE-SUBMIT — retrying with the SAME client_capture_id (and the
--       same payload) must NOT create a second proposal_captures row, a
--       second product, a second product_styles row, or a second
--       enrichment run; the RPC returns the same capture_id/product_id.
--   (c) ANTI-VACUITY — a capture consumed after its first commit (status
--       moved to 'consumed', proposal_captures' terminal state) makes a
--       retry a true no-op per the ON CONFLICT WHERE guard, proving that
--       guard is load-bearing and not merely masked by the product_id
--       check in (b).
--   (d) GS-01-adjacent — the golden-set's "one run" contract also holds when
--       proposal_id/scope_room_id/ffe_category_slug ARE fully supplied
--       (status='assigned' path), not just the bare 'inbox' path.
--
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/capture_enrichment/producer_double_submit_proposal_capture_test.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '30s';

-- ─── helpers (mirrors supabase/tests/aesthete/match_rpc_test.sql) ──────────
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS VOID AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- ─── fixtures ────────────────────────────────────────────────────────────────
SET LOCAL ROLE postgres;

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('ca000000-0000-4000-8000-000000000001', 'ca-designer-a@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('ca000000-0000-4000-8000-000000000001', 'ca-designer-a@test.invalid', 'CA Designer A', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO styles (id, name)
VALUES ('ca000000-0000-4000-8000-0000000005e1', 'Coastal CP Test')
ON CONFLICT (id) DO NOTHING;

RESET ROLE;

-- ─── (a)+(b) double submit, inbox path, with a style assignment ────────────
DO $$
DECLARE
  v_designer_id UUID := 'ca000000-0000-4000-8000-000000000001';
  v_client_capture_id UUID := 'ca000000-0000-4000-8000-0000000000c1';
  v_payload JSONB := jsonb_build_object(
    'name', 'Coastal armchair',
    'sourceUrl', 'https://example.invalid/armchair',
    'priceRetailCents', 129900,
    'captureSource', 'web_extension'
  );
  v_style_ids UUID[] := ARRAY['ca000000-0000-4000-8000-0000000005e1']::UUID[];
  v_result_1 JSONB;
  v_result_2 JSONB;
  v_capture_count INT;
  v_product_count INT;
  v_style_count INT;
  v_run_count INT;
  v_capture_row_id UUID;
BEGIN
  PERFORM pg_temp.assume_user(v_designer_id);
  v_result_1 := commit_proposal_capture(v_client_capture_id, v_payload, v_style_ids);
  PERFORM pg_temp.reset_role();

  ASSERT (v_result_1->>'created')::boolean IS TRUE, 'FAIL a0: first commit must report created=true';
  ASSERT (v_result_1->>'status') = 'inbox', 'FAIL a1: bare (no targeting) commit must land status=inbox, got ' || (v_result_1->>'status');

  SET LOCAL ROLE postgres;
  SELECT count(*) INTO v_capture_count FROM proposal_captures WHERE client_capture_id = v_client_capture_id;
  ASSERT v_capture_count = 1, 'FAIL a2: expected exactly one proposal_captures row after first commit, got ' || v_capture_count;

  SELECT id INTO v_capture_row_id FROM proposal_captures WHERE client_capture_id = v_client_capture_id;

  SELECT count(*) INTO v_product_count FROM products WHERE id = (v_result_1->>'product_id')::uuid;
  ASSERT v_product_count = 1, 'FAIL a3: expected exactly one product after first commit, got ' || v_product_count;

  SELECT count(*) INTO v_style_count FROM product_styles WHERE product_id = (v_result_1->>'product_id')::uuid;
  ASSERT v_style_count = 1, 'FAIL a4: expected exactly one product_styles row, got ' || v_style_count;

  SELECT count(*) INTO v_run_count FROM capture_enrichment_runs
   WHERE target_type = 'proposal_capture' AND target_id = v_capture_row_id;
  ASSERT v_run_count = 1, 'FAIL a5: expected exactly one enrichment run after first commit, got ' || v_run_count;
  RESET ROLE;

  -- ─── Retry with the SAME client_capture_id + SAME payload + SAME styles ──
  PERFORM pg_temp.assume_user(v_designer_id);
  v_result_2 := commit_proposal_capture(v_client_capture_id, v_payload, v_style_ids);
  PERFORM pg_temp.reset_role();

  ASSERT (v_result_2->>'created')::boolean IS FALSE, 'FAIL b0 (DOUBLE-SUBMIT): retry must report created=false';
  ASSERT (v_result_2->>'capture_id') = (v_result_1->>'capture_id'), 'FAIL b1: retry must return the SAME capture_id';
  ASSERT (v_result_2->>'product_id') = (v_result_1->>'product_id'), 'FAIL b2: retry must return the SAME product_id';

  SET LOCAL ROLE postgres;
  SELECT count(*) INTO v_capture_count FROM proposal_captures WHERE client_capture_id = v_client_capture_id;
  ASSERT v_capture_count = 1, 'FAIL b3 (DOUBLE-SUBMIT): retry must not create a second proposal_captures row, got ' || v_capture_count;

  SELECT count(*) INTO v_product_count FROM products WHERE id = (v_result_1->>'product_id')::uuid;
  ASSERT v_product_count = 1, 'FAIL b4 (DOUBLE-SUBMIT): retry must not create a second product, got ' || v_product_count;

  SELECT count(*) INTO v_product_count FROM products
   WHERE source_url = 'https://example.invalid/armchair' AND owner_user_id = v_designer_id;
  ASSERT v_product_count = 1, 'FAIL b5 (DOUBLE-SUBMIT): only one product total must exist for this source_url/owner, got ' || v_product_count;

  SELECT count(*) INTO v_style_count FROM product_styles WHERE product_id = (v_result_1->>'product_id')::uuid;
  ASSERT v_style_count = 1, 'FAIL b6 (DOUBLE-SUBMIT): retry must not duplicate product_styles, got ' || v_style_count;

  SELECT count(*) INTO v_run_count FROM capture_enrichment_runs
   WHERE target_type = 'proposal_capture' AND target_id = v_capture_row_id;
  ASSERT v_run_count = 1, 'FAIL b7 (DOUBLE-SUBMIT): retry must not create a second enrichment run, got ' || v_run_count;
  RESET ROLE;

  RAISE NOTICE 'producer_double_submit (proposal_capture): case (a)+(b) passed. capture_id=%, product_id=%',
    v_result_1->>'capture_id', v_result_1->>'product_id';
END $$;

-- ─── (c) ANTI-VACUITY — consumed capture makes a retry a true terminal
-- no-op (the ON CONFLICT ... WHERE guard), independent of the product_id
-- guard proven in (b). ────────────────────────────────────────────────────
DO $$
DECLARE
  v_designer_id UUID := 'ca000000-0000-4000-8000-000000000001';
  v_client_capture_id UUID := 'ca000000-0000-4000-8000-0000000000c2';
  v_payload JSONB := jsonb_build_object(
    'name', 'Teak bench',
    'sourceUrl', 'https://example.invalid/bench'
  );
  v_result_1 JSONB;
  v_result_2 JSONB;
  v_capture_row_id UUID;
  v_run_count INT;
BEGIN
  PERFORM pg_temp.assume_user(v_designer_id);
  v_result_1 := commit_proposal_capture(v_client_capture_id, v_payload);
  PERFORM pg_temp.reset_role();

  v_capture_row_id := (v_result_1->>'capture_id')::uuid;

  SET LOCAL ROLE postgres;
  UPDATE proposal_captures SET status = 'consumed', consumed_at = NOW() WHERE id = v_capture_row_id;
  RESET ROLE;

  PERFORM pg_temp.assume_user(v_designer_id);
  v_result_2 := commit_proposal_capture(v_client_capture_id, v_payload);
  PERFORM pg_temp.reset_role();

  ASSERT (v_result_2->>'status') = 'consumed', 'FAIL c1 (ANTI-VACUITY): retry against a consumed capture must return status=consumed unchanged, got ' || (v_result_2->>'status');
  ASSERT (v_result_2->>'created')::boolean IS FALSE, 'FAIL c2: retry against a terminal capture must report created=false';
  ASSERT (v_result_2->>'product_id') = (v_result_1->>'product_id'), 'FAIL c3: retry against a terminal capture must not touch product_id';

  SET LOCAL ROLE postgres;
  SELECT count(*) INTO v_run_count FROM capture_enrichment_runs
   WHERE target_type = 'proposal_capture' AND target_id = v_capture_row_id;
  ASSERT v_run_count = 1, 'FAIL c4: a terminal-capture retry must not enqueue a second run, got ' || v_run_count;
  RESET ROLE;

  RAISE NOTICE 'producer_double_submit (proposal_capture): ANTI-VACUITY case (c) passed — the consumed/dismissed guard is load-bearing.';
END $$;

-- ─── (d) fully-targeted (status='assigned') path also collapses to one run ─
DO $$
DECLARE
  v_designer_id UUID := 'ca000000-0000-4000-8000-000000000001';
  v_client_capture_id UUID := 'ca000000-0000-4000-8000-0000000000c3';
  v_payload JSONB := jsonb_build_object(
    'name', 'Rattan mirror',
    'sourceUrl', 'https://example.invalid/mirror'
  );
  v_proposal_id UUID;
  v_scope_room_id UUID;
  v_result_1 JSONB;
  v_result_2 JSONB;
  v_run_count INT;
BEGIN
  SET LOCAL ROLE postgres;
  v_proposal_id := 'ca000000-0000-4000-8000-0000000000f1';
  v_scope_room_id := 'ca000000-0000-4000-8000-0000000000f2';

  INSERT INTO proposals (id, designer_id, title, status)
  VALUES (v_proposal_id, v_designer_id, 'CA producer double-submit fixture proposal', 'draft');

  INSERT INTO proposal_scope_rooms (id, proposal_id, name)
  VALUES (v_scope_room_id, v_proposal_id, 'Living Room');
  RESET ROLE;

  PERFORM pg_temp.assume_user(v_designer_id);
  v_result_1 := commit_proposal_capture(v_client_capture_id, v_payload, '{}'::uuid[], v_proposal_id, v_scope_room_id, 'seating');
  PERFORM pg_temp.reset_role();

  ASSERT (v_result_1->>'status') = 'assigned', 'FAIL d1: fully-targeted commit must land status=assigned, got ' || (v_result_1->>'status');

  PERFORM pg_temp.assume_user(v_designer_id);
  v_result_2 := commit_proposal_capture(v_client_capture_id, v_payload, '{}'::uuid[], v_proposal_id, v_scope_room_id, 'seating');
  PERFORM pg_temp.reset_role();

  ASSERT (v_result_2->>'product_id') = (v_result_1->>'product_id'), 'FAIL d2 (DOUBLE-SUBMIT): assigned-path retry must not mint a second product';

  SET LOCAL ROLE postgres;
  SELECT count(*) INTO v_run_count FROM capture_enrichment_runs
   WHERE target_type = 'proposal_capture' AND target_id = (v_result_1->>'capture_id')::uuid;
  ASSERT v_run_count = 1, 'FAIL d3: assigned-path double-submit must still collapse to one enrichment run, got ' || v_run_count;
  RESET ROLE;

  RAISE NOTICE 'producer_double_submit (proposal_capture): case (d) passed — assigned-status path is also double-submit-safe.';
END $$;

RESET ROLE;
ROLLBACK;
