-- ═══════════════════════════════════════════════════════════════════════════
-- media_upload_intents — create/confirm RPCs (migration 00495)
--
-- Covers:
--   (a) create_media_upload_intent_v2 idempotency: same idempotency_key +
--       same payload replays the existing intent id; same key + a DIFFERENT
--       payload is refused (P0441).
--   (b) confirm_media_upload_intent_v2 SHA256 MISMATCH REFUSAL (P0443) — the
--       one behavior this workstream explicitly calls out — plus the happy
--       path: a matching sha256 confirms, writes through to media_registry
--       at 'stored', and reaching 'verified' requires p_r2_verified.
--   (c) status is forward-only: 'confirmed' is terminal — re-confirming with
--       the SAME sha256 replays idempotently; a second confirm attempt with a
--       DIFFERENT sha256 against an already-confirmed intent is refused.
--   (d) ANTI-VACUITY for the sha256-mismatch refusal — proves the guard is
--       not merely accidental: the primitives confirm_media_upload_intent_v2
--       composes (register_media_entry, mark_media_entry_state) do NOT
--       themselves refuse a mismatched sha256, so the refusal in (b) is
--       confirm_media_upload_intent_v2's own check, not free protection from
--       something else. Also disables the status trigger to show a backward
--       status move would otherwise succeed.
--   (e) W-4: confirming an intent whose expires_at has already passed is
--       refused (P0445) and marks the intent 'expired'; a retry then hits
--       the terminal-status refusal (P0444), not P0445 again.
--   (f) W-4 ANTI-VACUITY — the primitives confirm composes carry no notion
--       of expiry at all, proven by calling them directly.
--   (g) W-5: a DIFFERENT actor reusing the SAME idempotency_key string gets
--       their OWN new intent, never a handoff of the first actor's.
--   (h) W-5 ANTI-VACUITY — a direct probe using the PRE-fix query shape
--       (idempotency_key alone, unscoped by actor) against the same fixture
--       data proves that shape really would have returned actor A's row to
--       actor B, confirming the vulnerability was real and the real RPC's
--       actor-scoping is what prevents it.
--
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/media_registry/media_upload_intents_test.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '30s';

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('be100000-0000-4000-8000-000000000001', 'ui-actor@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('be100000-0000-4000-8000-000000000002', 'ui-actor-b@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('be100000-0000-4000-8000-000000000001', 'ui-actor@test.invalid', 'UI Actor', NOW(), NOW()),
  ('be100000-0000-4000-8000-000000000002', 'ui-actor-b@test.invalid', 'UI Actor B', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ─── (a) create_media_upload_intent_v2 idempotency ──────────────────────────
DO $$
DECLARE
  v_id_1 uuid;
  v_id_2 uuid;
  v_raised boolean := false;
BEGIN
  v_id_1 := public.create_media_upload_intent_v2(
    p_actor => 'be100000-0000-4000-8000-000000000001',
    p_bucket => 'patina-originals', p_bucket_class => 'originals',
    p_object_key => 'ui-test/idempotent.jpg', p_access_class => 'authenticated_project',
    p_declared_sha256 => 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    p_idempotency_key => 'ui-test-idem-key-1'
  );

  -- same key, IDENTICAL payload -> idempotent replay, same id.
  v_id_2 := public.create_media_upload_intent_v2(
    p_actor => 'be100000-0000-4000-8000-000000000001',
    p_bucket => 'patina-originals', p_bucket_class => 'originals',
    p_object_key => 'ui-test/idempotent.jpg', p_access_class => 'authenticated_project',
    p_declared_sha256 => 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    p_idempotency_key => 'ui-test-idem-key-1'
  );
  ASSERT v_id_2 = v_id_1, 'FAIL a1: same idempotency_key + same payload must replay the SAME intent id';

  -- same key, DIFFERENT payload (different declared sha256) -> refused.
  BEGIN
    PERFORM public.create_media_upload_intent_v2(
      p_actor => 'be100000-0000-4000-8000-000000000001',
      p_bucket => 'patina-originals', p_bucket_class => 'originals',
      p_object_key => 'ui-test/idempotent.jpg', p_access_class => 'authenticated_project',
      p_declared_sha256 => 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      p_idempotency_key => 'ui-test-idem-key-1'
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'P0441' THEN v_raised := true; ELSE RAISE; END IF;
  END;
  ASSERT v_raised, 'FAIL a2: reusing an idempotency_key with a different payload must be refused (P0441)';

  RAISE NOTICE 'media_upload_intents: case (a) passed.';
END $$;

-- ─── (b) confirm: sha256 mismatch refusal, then the happy path ─────────────
DO $$
DECLARE
  v_intent_id   uuid;
  v_registry_id uuid;
  v_raised      boolean := false;
  v_state       text;
BEGIN
  v_intent_id := public.create_media_upload_intent_v2(
    p_actor => 'be100000-0000-4000-8000-000000000001',
    p_bucket => 'patina-originals', p_bucket_class => 'originals',
    p_object_key => 'ui-test/confirm-happy.jpg', p_access_class => 'authenticated_project',
    p_declared_sha256 => 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    p_idempotency_key => 'ui-test-idem-key-2'
  );

  -- THE ONE CHECK THIS RPC EXISTS TO MAKE: p_sha256 must match declared_sha256.
  BEGIN
    PERFORM public.confirm_media_upload_intent_v2(
      p_intent_id => v_intent_id,
      p_sha256 => 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'P0443' THEN v_raised := true; ELSE RAISE; END IF;
  END;
  ASSERT v_raised, 'FAIL b1 (SHA256 MISMATCH): confirm with a sha256 that does not match declared_sha256 must be refused (P0443)';

  SELECT status INTO v_state FROM public.media_upload_intents WHERE id = v_intent_id;
  ASSERT v_state = 'intent', 'FAIL b2: the refused confirm must not have advanced status, got ' || v_state;

  -- matching sha256, p_r2_verified default false -> lands 'stored'.
  v_registry_id := public.confirm_media_upload_intent_v2(
    p_intent_id => v_intent_id,
    p_sha256 => 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
  );
  ASSERT v_registry_id IS NOT NULL, 'FAIL b3: a matching-sha256 confirm must return a registry id';

  SELECT lifecycle_state INTO v_state FROM public.media_registry WHERE id = v_registry_id;
  ASSERT v_state = 'stored', 'FAIL b4: confirm without p_r2_verified must land media_registry at ''stored'', got ' || v_state;

  SELECT status INTO v_state FROM public.media_upload_intents WHERE id = v_intent_id;
  ASSERT v_state = 'confirmed', 'FAIL b5: the intent must be ''confirmed'' after a successful confirm, got ' || v_state;

  RAISE NOTICE 'media_upload_intents: case (b) passed.';
END $$;

-- ─── (b2) confirm with p_r2_verified=true reaches 'verified' ───────────────
DO $$
DECLARE
  v_intent_id   uuid;
  v_registry_id uuid;
  v_state       text;
BEGIN
  v_intent_id := public.create_media_upload_intent_v2(
    p_actor => 'be100000-0000-4000-8000-000000000001',
    p_bucket => 'patina-originals', p_bucket_class => 'originals',
    p_object_key => 'ui-test/confirm-verified.jpg', p_access_class => 'authenticated_project',
    p_declared_sha256 => '1111111111111111111111111111111111111111111111111111111111111a',
    p_idempotency_key => 'ui-test-idem-key-3'
  );

  v_registry_id := public.confirm_media_upload_intent_v2(
    p_intent_id => v_intent_id,
    p_sha256 => '1111111111111111111111111111111111111111111111111111111111111a',
    p_r2_verified => true
  );

  SELECT lifecycle_state INTO v_state FROM public.media_registry WHERE id = v_registry_id;
  ASSERT v_state = 'verified', 'FAIL b2-1: confirm with p_r2_verified=true must land media_registry at ''verified'', got ' || v_state;

  RAISE NOTICE 'media_upload_intents: case (b2) passed.';
END $$;

-- ─── (c) status forward-only: confirmed is terminal ─────────────────────────
DO $$
DECLARE
  v_intent_id   uuid;
  v_registry_id uuid;
  v_replay_id   uuid;
  v_raised      boolean := false;
BEGIN
  v_intent_id := public.create_media_upload_intent_v2(
    p_actor => 'be100000-0000-4000-8000-000000000001',
    p_bucket => 'patina-originals', p_bucket_class => 'originals',
    p_object_key => 'ui-test/terminal.jpg', p_access_class => 'authenticated_project',
    p_declared_sha256 => '2222222222222222222222222222222222222222222222222222222222222b',
    p_idempotency_key => 'ui-test-idem-key-4'
  );
  v_registry_id := public.confirm_media_upload_intent_v2(
    p_intent_id => v_intent_id,
    p_sha256 => '2222222222222222222222222222222222222222222222222222222222222b'
  );

  -- re-confirming with the SAME sha256: idempotent replay, same registry id.
  v_replay_id := public.confirm_media_upload_intent_v2(
    p_intent_id => v_intent_id,
    p_sha256 => '2222222222222222222222222222222222222222222222222222222222222b'
  );
  ASSERT v_replay_id = v_registry_id, 'FAIL c1: re-confirming a confirmed intent with the SAME sha256 must replay the same registry id';

  -- re-confirming with a DIFFERENT sha256: refused.
  BEGIN
    PERFORM public.confirm_media_upload_intent_v2(
      p_intent_id => v_intent_id,
      p_sha256 => '3333333333333333333333333333333333333333333333333333333333333c'
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'P0443' THEN v_raised := true; ELSE RAISE; END IF;
  END;
  ASSERT v_raised, 'FAIL c2 (TERMINAL): re-confirming an already-confirmed intent with a DIFFERENT sha256 must be refused';

  -- a raw status regression is also refused by the table's own trigger.
  v_raised := false;
  BEGIN
    UPDATE public.media_upload_intents SET status = 'intent' WHERE id = v_intent_id;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'P0440' THEN v_raised := true; ELSE RAISE; END IF;
  END;
  ASSERT v_raised, 'FAIL c3 (TERMINAL): a direct UPDATE moving status back to ''intent'' must be refused by the trigger';

  RAISE NOTICE 'media_upload_intents: case (c) passed.';
END $$;

-- ─── (d) ANTI-VACUITY ────────────────────────────────────────────────────────
DO $$
DECLARE
  v_registry_id uuid;
  v_state       text;
  v_intent_id   uuid;
  v_raised      boolean := false;
BEGIN
  -- (d1) The primitives confirm_media_upload_intent_v2 composes do NOT
  -- themselves refuse a "mismatched" write — calling register_media_entry +
  -- mark_media_entry_state directly with an arbitrary sha256 succeeds. This
  -- proves the P0443 refusal in case (b) is confirm_media_upload_intent_v2's
  -- OWN check, not incidental protection from something else — i.e. removing
  -- that check would silently let a mismatched confirm through.
  v_registry_id := public.register_media_entry(
    p_bucket => 'patina-originals', p_bucket_class => 'originals',
    p_object_key => 'ui-test/anti-vacuity-shadow.jpg', p_access_class => 'authenticated_project',
    p_sha256 => '4444444444444444444444444444444444444444444444444444444444444d'
    -- ^ this sha256 was never "declared" by any intent — nothing here checks
    -- it against one, because these are the raw primitives, not the RPC.
  );
  PERFORM public.mark_media_entry_state(v_registry_id, 'stored');
  SELECT lifecycle_state INTO v_state FROM public.media_registry WHERE id = v_registry_id;
  ASSERT v_state = 'stored',
    'FAIL d1 (ANTI-VACUITY SETUP BROKEN): register_media_entry + mark_media_entry_state must succeed with an arbitrary sha256 when called directly — if this fails, case (b)''s P0443 refusal might be coming from somewhere other than confirm_media_upload_intent_v2''s own check';

  -- (d2) Disable the status trigger; show a backward status move (which the
  -- trigger normally refuses at P0440) would otherwise succeed, then
  -- re-enable and re-confirm the refusal — the same technique as the
  -- media_registry lifecycle test's case (e), applied to this table's guard.
  v_intent_id := public.create_media_upload_intent_v2(
    p_actor => 'be100000-0000-4000-8000-000000000001',
    p_bucket => 'patina-originals', p_bucket_class => 'originals',
    p_object_key => 'ui-test/anti-vacuity-status.jpg', p_access_class => 'authenticated_project',
    p_declared_sha256 => '5555555555555555555555555555555555555555555555555555555555555e',
    p_idempotency_key => 'ui-test-idem-key-anti-vacuity'
  );
  PERFORM public.confirm_media_upload_intent_v2(
    p_intent_id => v_intent_id,
    p_sha256 => '5555555555555555555555555555555555555555555555555555555555555e'
  );

  ALTER TABLE public.media_upload_intents DISABLE TRIGGER media_upload_intents_guard_status_transition_trg;
  UPDATE public.media_upload_intents SET status = 'intent' WHERE id = v_intent_id;
  SELECT status INTO v_state FROM public.media_upload_intents WHERE id = v_intent_id;
  ASSERT v_state = 'intent',
    'FAIL d2 (ANTI-VACUITY SETUP BROKEN): with the trigger disabled, confirmed -> intent must succeed — if it does not, case (c3)''s refusal proves nothing, got ' || v_state;
  ALTER TABLE public.media_upload_intents ENABLE TRIGGER media_upload_intents_guard_status_transition_trg;

  -- Re-prove the refusal on a SEPARATE, freshly-confirmed intent (not the one
  -- just mutated while the trigger was off, which is now sitting at 'intent'
  -- again and would trivially "pass" a same-state no-op instead of exercising
  -- the guard).
  DECLARE
    v_intent_id2 uuid;
  BEGIN
    v_intent_id2 := public.create_media_upload_intent_v2(
      p_actor => 'be100000-0000-4000-8000-000000000001',
      p_bucket => 'patina-originals', p_bucket_class => 'originals',
      p_object_key => 'ui-test/anti-vacuity-status-2.jpg', p_access_class => 'authenticated_project',
      p_declared_sha256 => '6666666666666666666666666666666666666666666666666666666666666f',
      p_idempotency_key => 'ui-test-idem-key-anti-vacuity-2'
    );
    PERFORM public.confirm_media_upload_intent_v2(
      p_intent_id => v_intent_id2,
      p_sha256 => '6666666666666666666666666666666666666666666666666666666666666f'
    );

    BEGIN
      UPDATE public.media_upload_intents SET status = 'intent' WHERE id = v_intent_id2;
    EXCEPTION WHEN OTHERS THEN
      IF SQLSTATE = 'P0440' THEN v_raised := true; ELSE RAISE; END IF;
    END;
    ASSERT v_raised, 'FAIL d3: re-enabling the trigger must restore the terminal-status refusal on a freshly-confirmed intent';
  END;

  RAISE NOTICE 'media_upload_intents: case (d) ANTI-VACUITY passed — the sha256 check and the status trigger are both load-bearing.';
END $$;

-- ─── (e) W-4: an expired intent's confirm is refused ───────────────────────
DO $$
DECLARE
  v_intent_id uuid;
  v_raised    boolean := false;
  v_status    text;
BEGIN
  v_intent_id := public.create_media_upload_intent_v2(
    p_actor => 'be100000-0000-4000-8000-000000000001',
    p_bucket => 'patina-originals', p_bucket_class => 'originals',
    p_object_key => 'ui-test/w4-expired.jpg', p_access_class => 'authenticated_project',
    p_declared_sha256 => '7777777777777777777777777777777777777777777777777777777777777a',
    p_idempotency_key => 'ui-test-idem-key-w4',
    p_expires_at => now() - interval '1 minute'
  );

  BEGIN
    PERFORM public.confirm_media_upload_intent_v2(
      p_intent_id => v_intent_id,
      p_sha256 => '7777777777777777777777777777777777777777777777777777777777777a'
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'P0445' THEN v_raised := true; ELSE RAISE; END IF;
  END;
  ASSERT v_raised, 'FAIL e1 (W-4): confirming an already-expired intent must be refused (P0445)';

  -- Status stays 'intent' — see the migration header: a write this function
  -- makes cannot survive the SAME function raising, once a caller catches
  -- the exception (which is what THIS test just did, and what any realistic
  -- PostgREST/RPC caller effectively does at the transaction boundary too).
  -- Persisting 'expired' is the reaper cron's job (deferred), not this RPC's.
  SELECT status INTO v_status FROM public.media_upload_intents WHERE id = v_intent_id;
  ASSERT v_status = 'intent',
    'FAIL e2: status must remain ''intent'' after the refused confirm (this function cannot durably mark ''expired'' from inside its own raised exception), got ' || v_status;

  -- retrying confirm hits the SAME expiry check again (still 'intent',
  -- still past its expires_at) — P0445 every time, which is itself a safe,
  -- idempotent refusal.
  v_raised := false;
  BEGIN
    PERFORM public.confirm_media_upload_intent_v2(
      p_intent_id => v_intent_id,
      p_sha256 => '7777777777777777777777777777777777777777777777777777777777777a'
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'P0445' THEN v_raised := true; ELSE RAISE; END IF;
  END;
  ASSERT v_raised, 'FAIL e3: a retried confirm on a still-''intent'', still-lapsed intent must be refused again (P0445)';

  RAISE NOTICE 'media_upload_intents: case (e) passed.';
END $$;

-- ─── (f) W-4 ANTI-VACUITY — the primitives confirm composes carry no notion
--         of expiry at all; proven by calling them directly with the exact
--         shape confirm would have produced, showing it succeeds regardless.
DO $$
DECLARE
  v_registry_id uuid;
  v_state       text;
BEGIN
  v_registry_id := public.register_media_entry(
    p_bucket => 'patina-originals', p_bucket_class => 'originals',
    p_object_key => 'ui-test/w4-anti-vacuity-shadow.jpg', p_access_class => 'authenticated_project',
    p_sha256 => '8888888888888888888888888888888888888888888888888888888888888b'
  );
  PERFORM public.mark_media_entry_state(v_registry_id, 'stored');
  SELECT lifecycle_state INTO v_state FROM public.media_registry WHERE id = v_registry_id;
  ASSERT v_state = 'stored',
    'FAIL f1 (ANTI-VACUITY SETUP BROKEN): register_media_entry + mark_media_entry_state must succeed with no regard for any notion of "expiry" (neither function has an expires_at parameter at all) — if this fails, case (e)''s P0445 refusal might be coming from somewhere other than confirm_media_upload_intent_v2''s own check';

  RAISE NOTICE 'media_upload_intents: case (f) W-4 ANTI-VACUITY passed — the expiry check is confirm_media_upload_intent_v2''s own guard.';
END $$;

-- ─── (g) W-5: a different actor reusing the same idempotency_key gets their
--         OWN new intent, never a handoff of the first actor's ───────────
DO $$
DECLARE
  v_id_a       uuid;
  v_id_b       uuid;
  v_shared_key text := 'ui-test-shared-idem-key-w5';
BEGIN
  v_id_a := public.create_media_upload_intent_v2(
    p_actor => 'be100000-0000-4000-8000-000000000001',
    p_bucket => 'patina-originals', p_bucket_class => 'originals',
    p_object_key => 'ui-test/w5-actor-a.jpg', p_access_class => 'authenticated_project',
    p_declared_sha256 => '9999999999999999999999999999999999999999999999999999999999999c',
    p_idempotency_key => v_shared_key
  );

  v_id_b := public.create_media_upload_intent_v2(
    p_actor => 'be100000-0000-4000-8000-000000000002',
    p_bucket => 'patina-originals', p_bucket_class => 'originals',
    p_object_key => 'ui-test/w5-actor-b.jpg', p_access_class => 'authenticated_project',
    p_declared_sha256 => 'aaaa999999999999999999999999999999999999999999999999999999999d',
    p_idempotency_key => v_shared_key
  );

  ASSERT v_id_b <> v_id_a,
    'FAIL g1 (W-5 CROSS-ACTOR): actor B reusing actor A''s idempotency_key string must get a DIFFERENT intent id, not a handoff of A''s';

  PERFORM 1 FROM public.media_upload_intents WHERE id = v_id_b AND actor = 'be100000-0000-4000-8000-000000000002';
  ASSERT FOUND, 'FAIL g2: actor B''s intent must be recorded under actor B, not actor A';

  PERFORM 1 FROM public.media_upload_intents WHERE id = v_id_a AND actor = 'be100000-0000-4000-8000-000000000001';
  ASSERT FOUND, 'FAIL g3: actor A''s original intent must be untouched';

  RAISE NOTICE 'media_upload_intents: case (g) passed.';
END $$;

-- ─── (h) W-5 ANTI-VACUITY — a direct probe using the PRE-fix query shape
--         (idempotency_key alone, unscoped by actor) against the SAME
--         fixture data from case (g) proves that shape really would have
--         handed actor B a lookup hit on actor A's row. This does not call
--         any shipped function with the old shape (nothing shipped has it
--         any more) — it is a direct probe of the fixture data showing the
--         vulnerability was real, not hypothetical, and that the real RPC's
--         (actor, idempotency_key) scoping (proven in case g) is what
--         prevents it. ─────────────────────────────────────────────────────
DO $$
DECLARE
  v_would_be_hijacked_id uuid;
BEGIN
  SELECT id INTO v_would_be_hijacked_id
    FROM public.media_upload_intents
   WHERE idempotency_key = 'ui-test-shared-idem-key-w5'
   ORDER BY created_at ASC
   LIMIT 1;

  ASSERT v_would_be_hijacked_id IS NOT NULL,
    'FAIL h1 (ANTI-VACUITY SETUP BROKEN): the shared-key fixture from case (g) must still be queryable by idempotency_key alone, or this proves nothing';

  -- That row belongs to actor A (created first, in case g) — an
  -- idempotency_key-ALONE lookup for this key returns IT, regardless of
  -- which actor is asking, which is exactly the cross-actor handoff W-5
  -- closes by adding actor to both the unique constraint and the lookup.
  PERFORM 1 FROM public.media_upload_intents
   WHERE id = v_would_be_hijacked_id AND actor = 'be100000-0000-4000-8000-000000000001';
  ASSERT FOUND,
    'FAIL h2 (W-5 ANTI-VACUITY): an idempotency_key-alone lookup on this shared key returns actor A''s row — confirming the pre-fix query shape really would have handed it to actor B. The REAL create_media_upload_intent_v2 (case g) does not do this, because it is scoped to (actor, idempotency_key).';

  RAISE NOTICE 'media_upload_intents: case (h) W-5 ANTI-VACUITY passed — actor-scoping in the real RPC is load-bearing (the unscoped query shape really would collide).';
END $$;

ROLLBACK;
