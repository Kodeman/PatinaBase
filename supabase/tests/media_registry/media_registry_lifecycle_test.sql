-- ═══════════════════════════════════════════════════════════════════════════
-- media_registry write-once identity + forward-only lifecycle + legal hold
-- (migration 00494)
--
-- Covers:
--   (a) register_media_entry write-once identity: a re-register of the SAME
--       (bucket, object_key, version) with a DIFFERENT sha256 is refused
--       (P0430); the same sha256, or filling a previously-NULL sha256,
--       succeeds and does not bump identity.
--   (b) lifecycle forward-only: pending -> stored -> verified succeeds;
--       verified -> stored (backward) is refused; restating the current
--       state is a no-op, not an error.
--   (c) legal_hold blocks the move to 'deleted'; lifting the hold allows it.
--   (d) 'deleted' is terminal — no move out of it, even via mark_media_entry_state.
--   (e) ANTI-VACUITY — the lifecycle trigger is temporarily DISABLED to prove
--       the illegal moves in (b)/(c)/(d) would otherwise succeed (i.e. the
--       assertions are not vacuously true), then it is re-enabled and the
--       refusals are re-confirmed.
--
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/media_registry/media_registry_lifecycle_test.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '30s';

-- ─── (a) register_media_entry write-once identity on sha256 ────────────────
DO $$
DECLARE
  v_id_1 uuid;
  v_id_2 uuid;
  v_id_3 uuid;
  v_raised boolean := false;
  v_sha256 text;
BEGIN
  -- fresh identity, no sha256 yet
  v_id_1 := public.register_media_entry(
    p_bucket => 'patina-originals', p_bucket_class => 'originals',
    p_object_key => 'lc-test/write-once.jpg', p_access_class => 'authenticated_project'
  );

  -- filling a NULL sha256: succeeds, same row.
  v_id_2 := public.register_media_entry(
    p_bucket => 'patina-originals', p_bucket_class => 'originals',
    p_object_key => 'lc-test/write-once.jpg', p_access_class => 'authenticated_project',
    p_sha256 => 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  );
  ASSERT v_id_2 = v_id_1, 'FAIL a1: filling a NULL sha256 must resolve to the SAME identity, got a different id';

  SELECT sha256 INTO v_sha256 FROM public.media_registry WHERE id = v_id_1;
  ASSERT v_sha256 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'FAIL a2: sha256 must have been set to the filled value, got ' || COALESCE(v_sha256, 'NULL');

  -- restating the SAME sha256: succeeds, still the same row.
  v_id_3 := public.register_media_entry(
    p_bucket => 'patina-originals', p_bucket_class => 'originals',
    p_object_key => 'lc-test/write-once.jpg', p_access_class => 'authenticated_project',
    p_sha256 => 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  );
  ASSERT v_id_3 = v_id_1, 'FAIL a3: restating the same sha256 must resolve to the SAME identity';

  -- a DIFFERENT sha256 under the same identity: refused (P0430).
  BEGIN
    PERFORM public.register_media_entry(
      p_bucket => 'patina-originals', p_bucket_class => 'originals',
      p_object_key => 'lc-test/write-once.jpg', p_access_class => 'authenticated_project',
      p_sha256 => 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'P0430' THEN v_raised := true; ELSE RAISE; END IF;
  END;
  ASSERT v_raised, 'FAIL a4 (WRITE-ONCE): a different sha256 under the same (bucket, object_key, version) must be refused';

  SELECT sha256 INTO v_sha256 FROM public.media_registry WHERE id = v_id_1;
  ASSERT v_sha256 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'FAIL a5: the refused re-register must not have mutated the stored sha256, got ' || COALESCE(v_sha256, 'NULL');

  RAISE NOTICE 'media_registry_lifecycle: case (a) passed.';
END $$;

-- ─── (b) forward-only lifecycle: pending -> stored -> verified; verified -> stored refused ─
DO $$
DECLARE
  v_id uuid;
  v_state text;
  v_raised boolean := false;
BEGIN
  v_id := public.register_media_entry(
    p_bucket => 'patina-processed', p_bucket_class => 'artifacts',
    p_object_key => 'lc-test/forward-only.jpg', p_access_class => 'authenticated_project'
  );

  SELECT lifecycle_state INTO v_state FROM public.media_registry WHERE id = v_id;
  ASSERT v_state = 'pending', 'FAIL b1: a fresh registration must start pending, got ' || v_state;

  PERFORM public.mark_media_entry_state(v_id, 'stored');
  SELECT lifecycle_state INTO v_state FROM public.media_registry WHERE id = v_id;
  ASSERT v_state = 'stored', 'FAIL b2: pending -> stored must succeed, got ' || v_state;

  -- restating 'stored' is a no-op, not an error.
  PERFORM public.mark_media_entry_state(v_id, 'stored');
  SELECT lifecycle_state INTO v_state FROM public.media_registry WHERE id = v_id;
  ASSERT v_state = 'stored', 'FAIL b3: restating the current state must be a no-op, got ' || v_state;

  PERFORM public.mark_media_entry_state(v_id, 'verified');
  SELECT lifecycle_state INTO v_state FROM public.media_registry WHERE id = v_id;
  ASSERT v_state = 'verified', 'FAIL b4: stored -> verified must succeed, got ' || v_state;

  -- verified -> stored: BACKWARD, must be refused.
  BEGIN
    PERFORM public.mark_media_entry_state(v_id, 'stored');
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'P0422' THEN v_raised := true; ELSE RAISE; END IF;
  END;
  ASSERT v_raised, 'FAIL b5 (FORWARD-ONLY): verified -> stored must be refused';

  SELECT lifecycle_state INTO v_state FROM public.media_registry WHERE id = v_id;
  ASSERT v_state = 'verified', 'FAIL b6: the refused backward move must not have changed lifecycle_state, got ' || v_state;

  RAISE NOTICE 'media_registry_lifecycle: case (b) passed.';
END $$;

-- ─── (c) legal_hold blocks deletion; lifting it allows deletion ────────────
DO $$
DECLARE
  v_id uuid;
  v_state text;
  v_hold boolean;
  v_raised boolean := false;
BEGIN
  v_id := public.register_media_entry(
    p_bucket => 'patina-processed', p_bucket_class => 'artifacts',
    p_object_key => 'lc-test/legal-hold.jpg', p_access_class => 'authenticated_project'
  );
  PERFORM public.mark_media_entry_state(v_id, 'stored');
  PERFORM public.mark_media_entry_legal_hold(v_id, true, 'litigation hold — test fixture');

  SELECT legal_hold INTO v_hold FROM public.media_registry WHERE id = v_id;
  ASSERT v_hold, 'FAIL c1: legal_hold must be set true';

  BEGIN
    PERFORM public.mark_media_entry_state(v_id, 'deleted');
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'P0421' THEN v_raised := true; ELSE RAISE; END IF;
  END;
  ASSERT v_raised, 'FAIL c2 (LEGAL HOLD): deletion must be refused while legal_hold is true';

  SELECT lifecycle_state INTO v_state FROM public.media_registry WHERE id = v_id;
  ASSERT v_state = 'stored', 'FAIL c3: the refused deletion must not have changed lifecycle_state, got ' || v_state;

  -- lift the hold, deletion now succeeds
  PERFORM public.mark_media_entry_legal_hold(v_id, false);
  PERFORM public.mark_media_entry_state(v_id, 'deleted');
  SELECT lifecycle_state INTO v_state FROM public.media_registry WHERE id = v_id;
  ASSERT v_state = 'deleted', 'FAIL c4: deletion must succeed once the hold is lifted, got ' || v_state;

  RAISE NOTICE 'media_registry_lifecycle: case (c) passed.';
END $$;

-- ─── (d) 'deleted' is terminal ──────────────────────────────────────────────
DO $$
DECLARE
  v_id uuid;
  v_state text;
  v_raised boolean := false;
BEGIN
  v_id := public.register_media_entry(
    p_bucket => 'patina-processed', p_bucket_class => 'artifacts',
    p_object_key => 'lc-test/terminal.jpg', p_access_class => 'authenticated_project'
  );
  PERFORM public.mark_media_entry_state(v_id, 'deleted');

  BEGIN
    PERFORM public.mark_media_entry_state(v_id, 'pending');
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'P0420' THEN v_raised := true; ELSE RAISE; END IF;
  END;
  ASSERT v_raised, 'FAIL d1 (TERMINAL): deleted -> pending must be refused';

  SELECT lifecycle_state INTO v_state FROM public.media_registry WHERE id = v_id;
  ASSERT v_state = 'deleted', 'FAIL d2: deleted must remain deleted, got ' || v_state;

  RAISE NOTICE 'media_registry_lifecycle: case (d) passed.';
END $$;

-- ─── (e) ANTI-VACUITY — disable the trigger, prove the illegal moves in
--         (b)/(c)/(d) would otherwise succeed, then re-enable and re-confirm ─
DO $$
DECLARE
  v_id    uuid;
  v_state text;
  v_hold  boolean;
BEGIN
  v_id := public.register_media_entry(
    p_bucket => 'patina-processed', p_bucket_class => 'artifacts',
    p_object_key => 'lc-test/anti-vacuity.jpg', p_access_class => 'authenticated_project'
  );
  PERFORM public.mark_media_entry_state(v_id, 'verified');
  PERFORM public.mark_media_entry_legal_hold(v_id, true, 'anti-vacuity fixture');

  ALTER TABLE public.media_registry DISABLE TRIGGER media_registry_guard_lifecycle_transition_trg;

  -- With the guard OFF: a backward move (verified -> pending) succeeds...
  UPDATE public.media_registry SET lifecycle_state = 'pending' WHERE id = v_id;
  SELECT lifecycle_state INTO v_state FROM public.media_registry WHERE id = v_id;
  ASSERT v_state = 'pending',
    'FAIL e1 (ANTI-VACUITY SETUP BROKEN): with the trigger disabled, a backward move must succeed — if it does not, case (b)''s refusal proves nothing, got ' || v_state;

  -- ...and deletion under an active legal hold ALSO succeeds.
  UPDATE public.media_registry SET lifecycle_state = 'deleted' WHERE id = v_id;
  SELECT lifecycle_state, legal_hold INTO v_state, v_hold FROM public.media_registry WHERE id = v_id;
  ASSERT v_state = 'deleted' AND v_hold,
    'FAIL e2 (ANTI-VACUITY SETUP BROKEN): with the trigger disabled, deletion under legal_hold must succeed — if it does not, case (c)''s refusal proves nothing';

  ALTER TABLE public.media_registry ENABLE TRIGGER media_registry_guard_lifecycle_transition_trg;

  -- Re-enabled: the same backward move on a FRESH row is refused again.
  DECLARE
    v_id2 uuid;
    v_raised boolean := false;
  BEGIN
    v_id2 := public.register_media_entry(
      p_bucket => 'patina-processed', p_bucket_class => 'artifacts',
      p_object_key => 'lc-test/anti-vacuity-2.jpg', p_access_class => 'authenticated_project'
    );
    PERFORM public.mark_media_entry_state(v_id2, 'verified');
    BEGIN
      PERFORM public.mark_media_entry_state(v_id2, 'pending');
    EXCEPTION WHEN OTHERS THEN
      IF SQLSTATE = 'P0422' THEN v_raised := true; ELSE RAISE; END IF;
    END;
    ASSERT v_raised, 'FAIL e3: re-enabling the trigger must restore the forward-only refusal';
  END;

  RAISE NOTICE 'media_registry_lifecycle: case (e) ANTI-VACUITY passed — the guard trigger is load-bearing.';
END $$;

ROLLBACK;
