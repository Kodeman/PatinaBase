-- ═══════════════════════════════════════════════════════════════════════════
-- 00495 — Phase 2 media upload intents (Cloudflare/media backfill program · B-W2)
--
-- Band: drawn from 00494–00497 (docs/engineering/migration-number-reservations.md).
--
-- NAMING NOTE: 00498_media_upload_intent_and_scan_version_lock.sql (Rendered
-- Room v2, W3-A) already defines bare-named `create_media_upload_intent` /
-- `confirm_media_upload` against the media_objects kernel, later redefined by
-- 00499. Those names are taken on this ledger. This file's RPCs are
-- deliberately suffixed `_v2` — create_media_upload_intent_v2 /
-- confirm_media_upload_intent_v2 — to avoid colliding with that program's
-- objects. They are unrelated functions against an unrelated table
-- (media_upload_intents here vs 00498/00499's inline intent handling against
-- media_objects); the `_v2` suffix is purely a naming-collision dodge, not a
-- version relationship between the two.
--
-- Peer-proven fact (infra/edge-api-worker/OPERATIONS.md "What the R2 probe
-- established", cited here because it motivates this file's shape): R2 DOES
-- enforce x-amz-checksum-sha256 on a single-part presigned PUT — a wrong-byte
-- PUT against a correct signed checksum gets BadDigest and the object is
-- never created. That means the presign flow can push checksum enforcement
-- into the PUT itself; this table's declared_sha256 is what gets signed into
-- that presigned request, and confirm_media_upload_intent_v2's job is to
-- prove the caller's claim about what landed still matches what was signed
-- for, not to re-derive trust R2's own enforcement already provides.
--
-- Extends the brief's column list with access_class, subject_type, subject_id
-- — not in the original enumeration, added because confirm_media_upload_
-- intent_v2 writes through to media_registry (00494), whose access_class is
-- NOT NULL and whose RLS dispatches on subject_type/subject_id. Capturing
-- them at intent-CREATION time (rather than accepting them again at confirm
-- time) keeps the security-relevant decision — what this object is allowed to
-- become visible to, once registered — pinned to the moment a service_role
-- caller opened the intent, not re-decidable by whatever calls confirm.
--
-- RLS: enabled, deliberately with ZERO policies. This table has no per-user
-- read path yet — reads happen through the RPCs' return values (an intent id,
-- a registry id) or via service_role, which bypasses RLS entirely. "Zero
-- policies" is fail-closed for `authenticated`, not an oversight: even if a
-- future migration's GRANT accidentally reached authenticated, no policy
-- would admit a single row.
--
-- Adds GRANT/REVOKE and a new table → regenerate seed/00-legacy-grants.sql.
--
-- ─── Adversarial review fix-forwards (in-place edit — unapplied anywhere) ───
--   W-4  confirm_media_upload_intent_v2 now rejects a confirm whose
--        expires_at has already passed (P0445). DISCOVERED WHILE FIXING:
--        the natural-looking "UPDATE status='expired' THEN RAISE EXCEPTION"
--        cannot actually persist that update — PL/pgSQL's EXCEPTION blocks
--        establish an implicit SAVEPOINT, and ANY caller that catches this
--        function's exception (a BEGIN/EXCEPTION wrapper, or a PostgREST/
--        RPC transaction that aborts on error) rolls back everything the
--        function did since entry, including its own "mark expired" write —
--        there is no way to make one write in this function durable across
--        an exception raised from the SAME function without an autonomous-
--        transaction mechanism (dblink/pg_background), which is out of
--        scope here. So this refuses (P0445) WITHOUT attempting to persist
--        'expired' — every retry against a lapsed intent gets P0445 again,
--        which is itself a safe, idempotent refusal. Actually persisting
--        'expired' status is the reaper cron's job, deferred to a later
--        wave (as already noted) — that cron runs in its OWN transaction,
--        so its UPDATE is not subject to this constraint.
--   W-5  idempotency was scoped to idempotency_key ALONE — a different
--        actor reusing the same key string received the FIRST actor's
--        intent id (a cross-actor handoff of upload authorization). The
--        unique constraint is now (actor, idempotency_key), and the replay
--        comparison now checks the FULL declared payload (all 11 fields:
--        actor, bucket, bucket_class, object_key, access_class,
--        declared_sha256, declared_mime, declared_size_bytes, subject_type,
--        subject_id, expires_at) instead of 5.
--   W-6  same advisory-lock race as 00494 §3 (FOR UPDATE locks nothing when
--        no row exists yet) applies here too — extended proactively for
--        consistency, keyed on (actor, idempotency_key).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. media_upload_intents ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.media_upload_intents (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor                 uuid NOT NULL,

  bucket                text NOT NULL,
  bucket_class          text NOT NULL
                          CHECK (bucket_class IN ('originals', 'artifacts')),
  object_key            text NOT NULL,
  access_class          text NOT NULL
                          CHECK (access_class IN (
                            'public_catalog', 'authenticated_project', 'guest_share',
                            'released_deliverable', 'third_party_source'
                          )),
  subject_type          text,
  subject_id            uuid,

  declared_sha256       text NOT NULL,
  declared_mime         text,
  declared_size_bytes   bigint,

  status                text NOT NULL DEFAULT 'intent'
                          CHECK (status IN ('intent', 'confirmed', 'expired', 'failed')),
  registry_id           uuid REFERENCES public.media_registry(id),

  idempotency_key       text NOT NULL,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  confirmed_at          timestamptz,
  expires_at            timestamptz,

  -- W-5: scoped to (actor, idempotency_key), NOT idempotency_key alone —
  -- an idempotency key is only a promise within ONE actor's own retries,
  -- never a shared namespace across actors.
  CONSTRAINT media_upload_intents_actor_idempotency_key_uniq UNIQUE (actor, idempotency_key)
);

COMMENT ON TABLE public.media_upload_intents IS
  '00495: Phase 2 upload-intent ledger for public.media_registry (00494). Unrelated to 00498/00499''s inline intent handling against public.media_objects (Rendered Room v2 scan kernel). Written only via create_media_upload_intent_v2 / confirm_media_upload_intent_v2 (SECURITY DEFINER, service_role only).';
COMMENT ON COLUMN public.media_upload_intents.declared_sha256 IS
  '00495: the checksum signed into the presigned PUT this intent authorizes. confirm_media_upload_intent_v2 refuses to confirm unless its own p_sha256 argument matches this value exactly.';
COMMENT ON COLUMN public.media_upload_intents.status IS
  '00495: forward-only via media_upload_intents_guard_status_transition. intent -> {confirmed | expired | failed}; the latter three are terminal.';

CREATE INDEX IF NOT EXISTS idx_media_upload_intents_actor ON public.media_upload_intents (actor);
CREATE INDEX IF NOT EXISTS idx_media_upload_intents_status ON public.media_upload_intents (status);
CREATE INDEX IF NOT EXISTS idx_media_upload_intents_registry_id
  ON public.media_upload_intents (registry_id) WHERE registry_id IS NOT NULL;

-- ─── RLS: enabled, zero policies (fail-closed; see header) ─────────────────
ALTER TABLE public.media_upload_intents ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.media_upload_intents TO service_role;
REVOKE ALL ON public.media_upload_intents FROM anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Status guard trigger — forward-only; confirmed/expired/failed terminal.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.media_upload_intents_guard_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;   -- restating the current status is idempotent, not an error
  END IF;

  IF OLD.status IN ('confirmed', 'expired', 'failed') THEN
    RAISE EXCEPTION
      'media_upload_intents: % is terminal (%); refused move to %',
      OLD.id, OLD.status, NEW.status
      USING ERRCODE = 'P0440';
  END IF;

  -- OLD.status = 'intent' here (the only non-terminal state); any move to
  -- 'confirmed' | 'expired' | 'failed' is a legitimate forward transition.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS media_upload_intents_guard_status_transition_trg ON public.media_upload_intents;
CREATE TRIGGER media_upload_intents_guard_status_transition_trg
  BEFORE UPDATE OF status ON public.media_upload_intents
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION public.media_upload_intents_guard_status_transition();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. create_media_upload_intent_v2 — idempotent on idempotency_key. A retried
--    create with the same key AND the same declared payload replays the
--    existing intent id; the same key with a different payload is refused.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.create_media_upload_intent_v2(
  p_actor               uuid,
  p_bucket              text,
  p_bucket_class        text,
  p_object_key          text,
  p_access_class        text,
  p_declared_sha256     text,
  p_idempotency_key     text,
  p_declared_mime       text        DEFAULT NULL,
  p_declared_size_bytes bigint      DEFAULT NULL,
  p_subject_type        text        DEFAULT NULL,
  p_subject_id          uuid        DEFAULT NULL,
  p_expires_at          timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id       uuid;
  v_existing public.media_upload_intents;
BEGIN
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'create_media_upload_intent_v2: p_actor is required';
  END IF;
  IF p_bucket IS NULL OR btrim(p_bucket) = '' THEN
    RAISE EXCEPTION 'create_media_upload_intent_v2: p_bucket must be non-empty';
  END IF;
  IF p_bucket_class NOT IN ('originals', 'artifacts') THEN
    RAISE EXCEPTION 'create_media_upload_intent_v2: invalid p_bucket_class %', p_bucket_class;
  END IF;
  IF p_object_key IS NULL OR btrim(p_object_key) = '' THEN
    RAISE EXCEPTION 'create_media_upload_intent_v2: p_object_key must be non-empty';
  END IF;
  IF p_access_class NOT IN (
    'public_catalog', 'authenticated_project', 'guest_share',
    'released_deliverable', 'third_party_source'
  ) THEN
    RAISE EXCEPTION 'create_media_upload_intent_v2: invalid p_access_class %', p_access_class;
  END IF;
  IF p_declared_sha256 IS NULL OR btrim(p_declared_sha256) = '' THEN
    RAISE EXCEPTION 'create_media_upload_intent_v2: p_declared_sha256 must be non-empty';
  END IF;
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'create_media_upload_intent_v2: p_idempotency_key must be non-empty';
  END IF;

  -- W-6 (extended from 00494 §3 for consistency): lock the (actor,
  -- idempotency_key) identity BEFORE the SELECT so two concurrent creates
  -- with the same key from the same actor cannot both take the INSERT
  -- branch below.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_actor::text || '/' || p_idempotency_key, 0)
  );

  -- W-5: scoped to (actor, idempotency_key) — a DIFFERENT actor reusing this
  -- exact key string finds NOTHING here (NOT FOUND) and falls through to a
  -- brand-new INSERT of their OWN intent, never the other actor's.
  SELECT * INTO v_existing
    FROM public.media_upload_intents
   WHERE actor = p_actor AND idempotency_key = p_idempotency_key
     FOR UPDATE;

  IF FOUND THEN
    -- W-5: compares the FULL declared payload (all 11 fields), not just 5 —
    -- a replay must match EVERY field the caller declared, not merely the
    -- five checked before this fix, or a caller could "replay" into a
    -- different subject_type/subject_id/expires_at than what was actually
    -- declared for the returned intent id.
    IF v_existing.actor = p_actor
       AND v_existing.bucket = p_bucket
       AND v_existing.bucket_class = p_bucket_class
       AND v_existing.object_key = p_object_key
       AND v_existing.access_class = p_access_class
       AND v_existing.declared_sha256 = p_declared_sha256
       AND v_existing.declared_mime IS NOT DISTINCT FROM p_declared_mime
       AND v_existing.declared_size_bytes IS NOT DISTINCT FROM p_declared_size_bytes
       AND v_existing.subject_type IS NOT DISTINCT FROM p_subject_type
       AND v_existing.subject_id IS NOT DISTINCT FROM p_subject_id
       AND v_existing.expires_at IS NOT DISTINCT FROM p_expires_at
    THEN
      RETURN v_existing.id;   -- idempotent replay
    END IF;

    RAISE EXCEPTION
      'create_media_upload_intent_v2: idempotency_key % already used by actor % with different parameters',
      p_idempotency_key, p_actor
      USING ERRCODE = 'P0441';
  END IF;

  INSERT INTO public.media_upload_intents (
    actor, bucket, bucket_class, object_key, access_class,
    subject_type, subject_id, declared_sha256, declared_mime, declared_size_bytes,
    idempotency_key, expires_at
  ) VALUES (
    p_actor, p_bucket, p_bucket_class, p_object_key, p_access_class,
    p_subject_type, p_subject_id, p_declared_sha256, p_declared_mime, p_declared_size_bytes,
    p_idempotency_key, p_expires_at
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_media_upload_intent_v2(
  uuid, text, text, text, text, text, text, text, bigint, text, uuid, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_media_upload_intent_v2(
  uuid, text, text, text, text, text, text, text, bigint, text, uuid, timestamptz
) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. confirm_media_upload_intent_v2 — verifies p_sha256 matches the intent's
--    declared_sha256 (P0443 on mismatch), writes through to media_registry
--    landing 'stored' first, then 'verified' only when the caller supplies
--    an R2-observed checksum match (p_r2_verified).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.confirm_media_upload_intent_v2(
  p_intent_id            uuid,
  p_sha256               text,
  p_etag                 text    DEFAULT NULL,
  p_observed_mime        text    DEFAULT NULL,
  p_observed_size_bytes  bigint  DEFAULT NULL,
  p_r2_verified          boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_intent      public.media_upload_intents;
  v_registry_id uuid;
BEGIN
  IF p_sha256 IS NULL OR btrim(p_sha256) = '' THEN
    RAISE EXCEPTION 'confirm_media_upload_intent_v2: p_sha256 must be non-empty';
  END IF;

  SELECT * INTO v_intent
    FROM public.media_upload_intents
   WHERE id = p_intent_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'confirm_media_upload_intent_v2: intent % not found', p_intent_id
      USING ERRCODE = 'P0442';
  END IF;

  IF v_intent.status = 'confirmed' THEN
    IF v_intent.declared_sha256 IS DISTINCT FROM p_sha256 THEN
      RAISE EXCEPTION
        'confirm_media_upload_intent_v2: intent % already confirmed with a different sha256',
        p_intent_id
        USING ERRCODE = 'P0443';
    END IF;
    RETURN v_intent.registry_id;   -- idempotent replay
  END IF;

  IF v_intent.status <> 'intent' THEN
    RAISE EXCEPTION
      'confirm_media_upload_intent_v2: intent % is % — cannot confirm',
      p_intent_id, v_intent.status
      USING ERRCODE = 'P0444';
  END IF;

  -- W-4: a still-'intent' row whose expires_at has already passed is
  -- refused (P0445). Deliberately does NOT also UPDATE status='expired'
  -- here — see the header note: that write cannot survive this function
  -- raising, in ANY caller that catches the exception (which is effectively
  -- every realistic caller, since a raised exception aborts the enclosing
  -- transaction). Persisting 'expired' is the reaper cron's job (deferred).
  IF v_intent.expires_at IS NOT NULL AND v_intent.expires_at < now() THEN
    RAISE EXCEPTION
      'confirm_media_upload_intent_v2: intent % expired at % — cannot confirm',
      p_intent_id, v_intent.expires_at
      USING ERRCODE = 'P0445';
  END IF;

  -- The one check this RPC exists to make: the bytes the caller is vouching
  -- for now must be the SAME bytes the intent declared up front.
  IF v_intent.declared_sha256 IS DISTINCT FROM p_sha256 THEN
    RAISE EXCEPTION
      'confirm_media_upload_intent_v2: sha256 mismatch for intent % (declared %, observed %)',
      p_intent_id, v_intent.declared_sha256, p_sha256
      USING ERRCODE = 'P0443';
  END IF;

  v_registry_id := public.register_media_entry(
    p_bucket              => v_intent.bucket,
    p_bucket_class        => v_intent.bucket_class,
    p_object_key          => v_intent.object_key,
    p_access_class        => v_intent.access_class,
    p_version             => 1,
    p_sha256              => p_sha256,
    p_etag                => p_etag,
    p_declared_mime       => v_intent.declared_mime,
    p_declared_size_bytes => v_intent.declared_size_bytes,
    p_subject_type        => v_intent.subject_type,
    p_subject_id          => v_intent.subject_id,
    p_provenance          => jsonb_build_object('upload_intent_id', v_intent.id),
    p_created_by          => v_intent.actor
  );

  -- Always land 'stored' first — a confirm proves the bytes exist at the
  -- declared key, nothing more. 'verified' is a STRONGER assertion the
  -- caller only earns by supplying the R2 HEAD checksum match.
  PERFORM public.mark_media_entry_state(
    v_registry_id, 'stored', p_observed_mime, p_observed_size_bytes, p_etag
  );
  IF p_r2_verified THEN
    PERFORM public.mark_media_entry_state(
      v_registry_id, 'verified', p_observed_mime, p_observed_size_bytes, p_etag
    );
  END IF;

  UPDATE public.media_upload_intents SET
    status       = 'confirmed',
    registry_id  = v_registry_id,
    confirmed_at = now(),
    updated_at   = now()
  WHERE id = p_intent_id;

  RETURN v_registry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_media_upload_intent_v2(uuid, text, text, text, bigint, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_media_upload_intent_v2(uuid, text, text, text, bigint, boolean)
  TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Verify-block — the default-priv trap (see 00494 §6 for the same rationale).
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_fn  text;
  v_oid oid;
  v_fns text[] := ARRAY['create_media_upload_intent_v2', 'confirm_media_upload_intent_v2'];
BEGIN
  FOREACH v_fn IN ARRAY v_fns LOOP
    SELECT p.oid INTO v_oid FROM pg_proc p
     WHERE p.proname = v_fn AND p.pronamespace = 'public'::regnamespace;
    IF v_oid IS NULL THEN
      RAISE EXCEPTION '00495 verify: function % not found', v_fn;
    END IF;
    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION '00495 verify: anon must not hold EXECUTE on %', v_fn;
    END IF;
    IF has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION '00495 verify: authenticated must not hold EXECUTE on %', v_fn;
    END IF;
    IF NOT has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION '00495 verify: service_role must hold EXECUTE on %', v_fn;
    END IF;
  END LOOP;

  IF has_table_privilege('anon', 'public.media_upload_intents', 'SELECT') THEN
    RAISE EXCEPTION '00495 verify: anon must not hold SELECT on media_upload_intents';
  END IF;
  IF has_table_privilege('authenticated', 'public.media_upload_intents', 'SELECT') THEN
    RAISE EXCEPTION '00495 verify: authenticated must not hold SELECT on media_upload_intents (service_role-only for now)';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.media_upload_intents', 'INSERT') THEN
    RAISE EXCEPTION '00495 verify: service_role must hold INSERT on media_upload_intents';
  END IF;
END $$;
