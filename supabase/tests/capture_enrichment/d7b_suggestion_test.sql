-- ═══════════════════════════════════════════════════════════════════════════
-- capture_enrichment: ruling D7b (migration 00664). Enrichment's vendor/SKU
-- is a suggestion that needs confirming, never a value on the capture.
--
-- Covers:
--   (a) A 'ready' run suggesting vendor_name + sku for a capture whose columns
--       are empty leaves both columns NULL/empty. The same call still prefills
--       category (anti-vacuity: the apply loop ran for that row and chose to
--       skip vendor/SKU, which proves the NULLs are not an artifact of a
--       loop that never executed).
--   (b) The suggestion is recorded on capture_enrichment_runs.suggestions,
--       and the capture's owner can read it as `authenticated` (RLS 00514),
--       so a surface can show it as a suggestion to confirm.
--   (c) A designer-typed vendor_name/sku is byte-for-byte unchanged.
--   (d) The designer confirms by writing through commit_field_capture's
--       tag.vendorName/tag.sku. That value lands, and a later run suggesting a
--       different vendor leaves it unchanged.
--   (e) The ACL is unchanged: service_role only.
--
-- Run: bash supabase/tests/capture_enrichment/d7b-suggestion.test.sh
-- One transaction, rolled back.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '30s';

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('ce000000-0000-4000-8000-0000000007b0', 'ce-d7b@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('ce000000-0000-4000-8000-0000000007b0', 'ce-d7b@test.invalid', 'CE D7b', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ─── (a) + (b) empty vendor/SKU stay empty; the suggestion stays on the ledger
DO $$
DECLARE
  v_target_id uuid := 'ce000000-0000-4000-8000-0000000007b1';
  v_run_id uuid;
  v_row record;
  v_suggestions jsonb;
BEGIN
  INSERT INTO field_captures (id, client_capture_id, designer_id, category, vendor_name, sku)
  VALUES (v_target_id, gen_random_uuid(), 'ce000000-0000-4000-8000-0000000007b0', NULL, NULL, '');

  v_run_id := public.enqueue_capture_enrichment('field_capture', v_target_id, 0);
  PERFORM public.claim_capture_enrichment_run(v_run_id, 0);
  PERFORM public.record_capture_enrichment_result(
    v_run_id,
    '{"category":"Sofa","vendor_name":"Holloway & Co.","sku":"HC-1042"}'::jsonb,
    '{}'::jsonb,
    'ready');

  SELECT category, vendor_name, sku INTO v_row FROM field_captures WHERE id = v_target_id;
  ASSERT v_row.category = 'Sofa',
    'FAIL a1 (anti-vacuity): category must still be prefilled by the same call, got ' || COALESCE(v_row.category, 'NULL');
  ASSERT v_row.vendor_name IS NULL,
    'FAIL a2 (D7b): a suggested vendor_name must never be written onto the capture, got ' || COALESCE(v_row.vendor_name, 'NULL');
  ASSERT v_row.sku = '',
    'FAIL a3 (D7b): a suggested sku must never be written onto the capture, got ' || COALESCE(v_row.sku, 'NULL');

  SELECT suggestions INTO v_suggestions FROM capture_enrichment_runs WHERE id = v_run_id;
  ASSERT v_suggestions ->> 'vendor_name' = 'Holloway & Co.' AND v_suggestions ->> 'sku' = 'HC-1042',
    'FAIL b1: the vendor/SKU suggestion must be kept on the ledger, got ' || v_suggestions::text;

  RAISE NOTICE 'd7b: case (a) passed. Suggested vendor/SKU not written, category still prefilled.';
END $$;

-- (b) the owner reads the suggestion through RLS as authenticated.
SELECT set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
         json_build_object('sub', 'ce000000-0000-4000-8000-0000000007b0', 'role', 'authenticated')::text, true);

DO $$
DECLARE
  v_suggestions jsonb;
BEGIN
  SELECT r.suggestions INTO v_suggestions
    FROM capture_enrichment_runs r
   WHERE r.target_type = 'field_capture'
     AND r.target_id = 'ce000000-0000-4000-8000-0000000007b1';
  ASSERT v_suggestions ->> 'vendor_name' = 'Holloway & Co.',
    'FAIL b2: the capture owner must be able to read the vendor suggestion as authenticated, got ' || COALESCE(v_suggestions::text, 'no row');
  RAISE NOTICE 'd7b: case (b) passed. The owner can read the suggestion.';
END $$;

SELECT set_config('role', 'postgres', true), set_config('request.jwt.claims', NULL, true);

-- ─── (c) designer-typed vendor/SKU is untouched ─────────────────────────────
DO $$
DECLARE
  v_target_id uuid := 'ce000000-0000-4000-8000-0000000007b2';
  v_run_id uuid;
  v_row record;
BEGIN
  INSERT INTO field_captures (id, client_capture_id, designer_id, vendor_name, sku)
  VALUES (v_target_id, gen_random_uuid(), 'ce000000-0000-4000-8000-0000000007b0', 'Cedar & Twine', 'CT-7');

  v_run_id := public.enqueue_capture_enrichment('field_capture', v_target_id, 0);
  PERFORM public.claim_capture_enrichment_run(v_run_id, 0);
  PERFORM public.record_capture_enrichment_result(
    v_run_id, '{"vendor_name":"Holloway & Co.","sku":"HC-1042"}'::jsonb, '{}'::jsonb, 'ready');

  SELECT vendor_name, sku INTO v_row FROM field_captures WHERE id = v_target_id;
  ASSERT v_row.vendor_name = 'Cedar & Twine' AND v_row.sku = 'CT-7',
    'FAIL c1: a designer-typed vendor/SKU must be unchanged, got ' || COALESCE(v_row.vendor_name, 'NULL') || ' / ' || COALESCE(v_row.sku, 'NULL');

  RAISE NOTICE 'd7b: case (c) passed. Designer-typed vendor/SKU unchanged.';
END $$;

-- ─── (d) confirmation is the designer's own write through commit_field_capture
SELECT set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
         json_build_object('sub', 'ce000000-0000-4000-8000-0000000007b0', 'role', 'authenticated')::text, true);

DO $$
DECLARE
  v_client_id uuid := 'ce000000-0000-4000-8000-0000000007b3';
  v_result jsonb;
BEGIN
  v_result := public.commit_field_capture(
    v_client_id,
    'inbox',
    jsonb_build_object('tag', jsonb_build_object('vendorName', 'Holloway & Co.', 'sku', 'HC-1042')));
  RAISE NOTICE 'd7b: commit_field_capture returned %', v_result;
END $$;

SELECT set_config('role', 'postgres', true), set_config('request.jwt.claims', NULL, true);

DO $$
DECLARE
  v_target_id uuid;
  v_run_id uuid;
  v_revision integer;
  v_row record;
BEGIN
  SELECT id, vendor_name, sku INTO v_row
    FROM field_captures WHERE client_capture_id = 'ce000000-0000-4000-8000-0000000007b3';
  ASSERT v_row.id IS NOT NULL, 'FAIL d0: commit_field_capture must create the capture';
  ASSERT v_row.vendor_name = 'Holloway & Co.' AND v_row.sku = 'HC-1042',
    'FAIL d1: the designer''s confirmed tag.vendorName/tag.sku must land on the capture, got '
      || COALESCE(v_row.vendor_name, 'NULL') || ' / ' || COALESCE(v_row.sku, 'NULL');
  v_target_id := v_row.id;

  -- The commit enqueued a run for this revision. Claim it and record a
  -- conflicting suggestion.
  SELECT id, content_revision INTO v_run_id, v_revision
    FROM capture_enrichment_runs
   WHERE target_type = 'field_capture' AND target_id = v_target_id
   ORDER BY content_revision DESC LIMIT 1;
  ASSERT v_run_id IS NOT NULL, 'FAIL d2: commit_field_capture must enqueue an enrichment run';
  PERFORM public.claim_capture_enrichment_run(v_run_id, v_revision);
  PERFORM public.record_capture_enrichment_result(
    v_run_id, '{"vendor_name":"Other Maker","sku":"OM-1"}'::jsonb, '{}'::jsonb, 'ready');

  SELECT vendor_name, sku INTO v_row FROM field_captures WHERE id = v_target_id;
  ASSERT v_row.vendor_name = 'Holloway & Co.' AND v_row.sku = 'HC-1042',
    'FAIL d3: a later suggestion must leave the confirmed vendor/SKU unchanged, got '
      || COALESCE(v_row.vendor_name, 'NULL') || ' / ' || COALESCE(v_row.sku, 'NULL');

  RAISE NOTICE 'd7b: case (d) passed. The confirmed value lands; a later suggestion leaves it unchanged.';
END $$;

-- ─── (e) ACL unchanged ──────────────────────────────────────────────────────
DO $$
BEGIN
  ASSERT NOT has_function_privilege('anon', 'public.record_capture_enrichment_result(uuid, jsonb, jsonb, text)', 'EXECUTE'),
    'FAIL e1: anon must not have EXECUTE';
  ASSERT NOT has_function_privilege('authenticated', 'public.record_capture_enrichment_result(uuid, jsonb, jsonb, text)', 'EXECUTE'),
    'FAIL e2: authenticated must not have EXECUTE';
  ASSERT has_function_privilege('service_role', 'public.record_capture_enrichment_result(uuid, jsonb, jsonb, text)', 'EXECUTE'),
    'FAIL e3: service_role must have EXECUTE';
  RAISE NOTICE 'd7b: case (e) passed. ACL unchanged.';
END $$;

ROLLBACK;
