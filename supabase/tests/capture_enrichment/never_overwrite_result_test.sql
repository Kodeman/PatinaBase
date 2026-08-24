-- ═══════════════════════════════════════════════════════════════════════════
-- capture_enrichment: record_capture_enrichment_result never-overwrite rule
-- (migration 00515) — golden-set GS-15 (empty field prefilled) / GS-16
-- (designer-entered field never overwritten) (docs/engineering/
-- capture-enrichment-golden-set.md). This is the most important test in the
-- suite: it must prove a permissive variant WOULD clobber a confirmed value.
--
-- Covers:
--   (a) GS-15 — a field_capture with category IS NULL: a suggestion for
--       'category' DOES fill the empty column.
--   (b) GS-16 — a field_capture with category already set by a "designer":
--       the SAME suggestion for 'category' does NOT change the stored
--       value; the suggestion is still recorded in
--       capture_enrichment_runs.suggestions for surfacing, just never
--       applied to the target row.
--   (c) a non-allowlisted / array-typed field (materials) is never
--       auto-applied regardless of emptiness — ledger-only suggestion.
--   (d) proposal_capture targets are NEVER mutated by this RPC at all
--       (no suggestible columns of their own in this migration's scope).
--   (e) status='failed' never applies any suggestion, even to an empty field.
--   (f) ANTI-VACUITY (the load-bearing case) — a deliberately-permissive
--       variant of the apply step (same shape, WITHOUT the
--       "IS NULL OR = ''" guard) is executed directly against case (b)'s
--       already-confirmed row and DOES clobber it, proving the guard in the
--       real function is what protects confirmed data, not some accident of
--       fixture setup. The real function is then re-run on a fresh case and
--       shown to still refuse.
--
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/capture_enrichment/never_overwrite_result_test.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '30s';

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('ce000000-0000-4000-8000-000000000020', 'ce-nofw@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('ce000000-0000-4000-8000-000000000020', 'ce-nofw@test.invalid', 'CE No-Overwrite', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ─── (a) GS-15: empty field is prefilled ───────────────────────────────────
DO $$
DECLARE
  v_target_id uuid := 'ce000000-0000-4000-8000-0000000000a1';
  v_run_id uuid;
  v_category text;
BEGIN
  INSERT INTO field_captures (id, client_capture_id, designer_id, category)
  VALUES (v_target_id, gen_random_uuid(), 'ce000000-0000-4000-8000-000000000020', NULL);

  v_run_id := public.enqueue_capture_enrichment('field_capture', v_target_id, 0);
  PERFORM public.claim_capture_enrichment_run(v_run_id, 0);
  PERFORM public.record_capture_enrichment_result(v_run_id, '{"category":"Sofa"}'::jsonb, '{}'::jsonb, 'ready');

  SELECT category INTO v_category FROM field_captures WHERE id = v_target_id;
  ASSERT v_category = 'Sofa', 'FAIL a1 (GS-15): a NULL category must be prefilled by the suggestion, got ' || COALESCE(v_category, 'NULL');

  RAISE NOTICE 'never_overwrite: case (a) GS-15 passed.';
END $$;

-- ─── (b) GS-16: designer-entered field is never overwritten ────────────────
DO $$
DECLARE
  v_target_id uuid := 'ce000000-0000-4000-8000-0000000000a2';
  v_run_id uuid;
  v_category text;
  v_suggestions jsonb;
BEGIN
  INSERT INTO field_captures (id, client_capture_id, designer_id, category)
  VALUES (v_target_id, gen_random_uuid(), 'ce000000-0000-4000-8000-000000000020', 'Armchair');

  v_run_id := public.enqueue_capture_enrichment('field_capture', v_target_id, 0);
  PERFORM public.claim_capture_enrichment_run(v_run_id, 0);
  PERFORM public.record_capture_enrichment_result(v_run_id, '{"category":"Sofa"}'::jsonb, '{}'::jsonb, 'ready');

  SELECT category INTO v_category FROM field_captures WHERE id = v_target_id;
  ASSERT v_category = 'Armchair', 'FAIL b1 (GS-16 NEVER-OVERWRITE): a designer-entered category must be byte-for-byte unchanged, got ' || COALESCE(v_category, 'NULL');

  SELECT suggestions INTO v_suggestions FROM capture_enrichment_runs WHERE id = v_run_id;
  ASSERT v_suggestions ->> 'category' = 'Sofa', 'FAIL b2: the suggestion must still be recorded on the ledger row for surfacing, even though it was not applied';

  RAISE NOTICE 'never_overwrite: case (b) GS-16 passed.';
END $$;

-- ─── (c) array-typed / non-allowlisted field is never auto-applied ─────────
DO $$
DECLARE
  v_target_id uuid := 'ce000000-0000-4000-8000-0000000000a3';
  v_run_id uuid;
  v_materials text[];
BEGIN
  INSERT INTO field_captures (id, client_capture_id, designer_id, materials)
  VALUES (v_target_id, gen_random_uuid(), 'ce000000-0000-4000-8000-000000000020', '{}');

  v_run_id := public.enqueue_capture_enrichment('field_capture', v_target_id, 0);
  PERFORM public.claim_capture_enrichment_run(v_run_id, 0);
  PERFORM public.record_capture_enrichment_result(v_run_id, '{"materials":"Oak"}'::jsonb, '{}'::jsonb, 'ready');

  SELECT materials INTO v_materials FROM field_captures WHERE id = v_target_id;
  ASSERT v_materials = '{}'::text[], 'FAIL c1: a non-allowlisted/array-typed field must never be auto-applied even when empty, got ' || v_materials::text;

  RAISE NOTICE 'never_overwrite: case (c) passed.';
END $$;

-- ─── (d) proposal_capture targets are never mutated by this RPC ───────────
DO $$
DECLARE
  v_target_id uuid := 'ce000000-0000-4000-8000-0000000000a4';
  v_run_id uuid;
  v_before record;
  v_after record;
BEGIN
  INSERT INTO proposal_captures (id, designer_id, source_url)
  VALUES (v_target_id, 'ce000000-0000-4000-8000-000000000020', 'https://example.invalid/no-mutate');

  SELECT * INTO v_before FROM proposal_captures WHERE id = v_target_id;

  v_run_id := public.enqueue_capture_enrichment('proposal_capture', v_target_id, 0);
  PERFORM public.claim_capture_enrichment_run(v_run_id, 0);
  PERFORM public.record_capture_enrichment_result(v_run_id, '{"ffe_category_slug":"seating"}'::jsonb, '{}'::jsonb, 'ready');

  SELECT * INTO v_after FROM proposal_captures WHERE id = v_target_id;
  ASSERT v_before.ffe_category_slug IS NOT DISTINCT FROM v_after.ffe_category_slug,
    'FAIL d1: proposal_captures rows must never be mutated by record_capture_enrichment_result';
  ASSERT v_before.status = v_after.status, 'FAIL d2: proposal_captures.status must be untouched';

  RAISE NOTICE 'never_overwrite: case (d) passed.';
END $$;

-- ─── (e) status='failed' applies no suggestion, even to an empty field ─────
DO $$
DECLARE
  v_target_id uuid := 'ce000000-0000-4000-8000-0000000000a5';
  v_run_id uuid;
  v_category text;
BEGIN
  INSERT INTO field_captures (id, client_capture_id, designer_id, category)
  VALUES (v_target_id, gen_random_uuid(), 'ce000000-0000-4000-8000-000000000020', NULL);

  v_run_id := public.enqueue_capture_enrichment('field_capture', v_target_id, 0);
  PERFORM public.claim_capture_enrichment_run(v_run_id, 0);
  PERFORM public.record_capture_enrichment_result(v_run_id, '{"category":"Sofa"}'::jsonb, '{}'::jsonb, 'failed');

  SELECT category INTO v_category FROM field_captures WHERE id = v_target_id;
  ASSERT v_category IS NULL, 'FAIL e1: a failed run must never apply a suggestion, even to an empty field, got ' || COALESCE(v_category, 'NULL');

  RAISE NOTICE 'never_overwrite: case (e) passed.';
END $$;

-- ─── (f) ANTI-VACUITY — the guard is what protects confirmed data ─────────
-- Re-fixture a fresh confirmed-category row (independent of case (b), which
-- already ran), then execute the SAME dynamic-UPDATE shape
-- record_capture_enrichment_result uses internally but WITHOUT the
-- "IS NULL OR = ''" guard clause. This must clobber the confirmed value,
-- proving the guard — not some fixture accident — is what protected case
-- (b)'s row. Restore is unnecessary (transaction rolls back), but we still
-- re-run the REAL function on a fresh case to show it refuses correctly
-- side-by-side with the proof that an unguarded version would not.
DO $$
DECLARE
  v_target_id uuid := 'ce000000-0000-4000-8000-0000000000a6';
  v_category_after_naive text;
  v_run_id uuid;
  v_category_via_real_fn text;
BEGIN
  INSERT INTO field_captures (id, client_capture_id, designer_id, category)
  VALUES (v_target_id, gen_random_uuid(), 'ce000000-0000-4000-8000-000000000020', 'Armchair');

  -- The permissive variant: identical dynamic UPDATE, guard clause removed.
  EXECUTE format(
    'UPDATE public.field_captures SET %1$I = $1, updated_at = now() WHERE id = $2',
    'category'
  ) USING 'Sofa', v_target_id;

  SELECT category INTO v_category_after_naive FROM field_captures WHERE id = v_target_id;
  ASSERT v_category_after_naive = 'Sofa',
    'FAIL f1 (ANTI-VACUITY — MOST IMPORTANT CHECK): a permissive record function WITHOUT the never-overwrite guard DID NOT clobber a designer-entered field as expected — this means the never-overwrite assertion in case (b) may be vacuous (e.g. the guard is a no-op for some other reason), got ' || COALESCE(v_category_after_naive, 'NULL');

  -- Now prove the REAL function, on an equivalent fresh confirmed row,
  -- refuses to do what the naive variant just did.
  UPDATE field_captures SET category = 'Armchair' WHERE id = v_target_id; -- restore before re-testing
  v_run_id := public.enqueue_capture_enrichment('field_capture', v_target_id, 1);
  PERFORM public.claim_capture_enrichment_run(v_run_id, 1);
  PERFORM public.record_capture_enrichment_result(v_run_id, '{"category":"Sofa"}'::jsonb, '{}'::jsonb, 'ready');

  SELECT category INTO v_category_via_real_fn FROM field_captures WHERE id = v_target_id;
  ASSERT v_category_via_real_fn = 'Armchair',
    'FAIL f2: the REAL record_capture_enrichment_result must refuse to overwrite the confirmed category on the same row a naive version just clobbered, got ' || COALESCE(v_category_via_real_fn, 'NULL');

  RAISE NOTICE 'never_overwrite: case (f) ANTI-VACUITY passed — the never-overwrite guard is proven load-bearing.';
END $$;

ROLLBACK;
