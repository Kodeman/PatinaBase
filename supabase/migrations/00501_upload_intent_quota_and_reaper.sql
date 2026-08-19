-- ═══════════════════════════════════════════════════════════════════════════
-- 00501 — upload-intent quota + stale-intent reaper (Rendered Room v2 · W4)
--         Closes security-review finding 11: no quota, no per-scan slot cap,
--         no reclamation of orphaned upload intents on the Phase-2 upload
--         interface.
--
-- Band: 00501 is drawn from the 00498–00502 band that
-- docs/engineering/migration-number-reservations.md reserves for Rendered
-- Room v2's W2-onward work. 00502 is this program's last free number.
--
-- ─── What this file carries ─────────────────────────────────────────────────
--   1. A per-scan cap of 24 concurrently-`pending` upload intents on
--      create_media_upload_intent — the schema-v3 bundle has <=16 kinds, so 24
--      gives filename-variant headroom without opening an unbounded sink. A
--      caller who trips it gets a dedicated errcode the Worker maps to 429.
--   2. expire_stale_upload_intents(p_ttl) — a reaper that transitions stale
--      `pending` upload-interface rows (identified by 00499's provenance
--      discriminator, NEVER by touching pipeline-registered rows) to a new
--      terminal lifecycle state, `expired`, past a TTL (default 48h). Scheduled
--      daily via pg_cron, called directly (no edge function — this is a pure
--      SQL sweep).
--   3. `expired` joins the lifecycle_state CHECK, forward-only and terminal
--      like `deleted`: mark_media_object_state refuses to move a row away from
--      either terminal state, so a stale or replayed call cannot resurrect an
--      expired intent.
--   4. public.expired_upload_originals — a read-only seam view over expired
--      rows' (bucket, object_key). R2 orphan-object DELETION is OUT OF SCOPE
--      here (it needs the write credential, which this migration has no
--      business holding) — this view is what a FUTURE cleanup job reads to
--      find what to delete. Not granted to any role a request can reach.
--
-- ─── Lineage ────────────────────────────────────────────────────────────────
--   create_media_upload_intent   00498 → 00499 → 00500 → 00501 (this file)
--     (`grep -rln "CREATE OR REPLACE FUNCTION[^(]*create_media_upload_intent"
--       supabase/migrations/*.sql | sort | tail -1` → 00500; its body is
--       reproduced VERBATIM below with the cap grafted in.)
--   mark_media_object_state      00489 → 00501 (this file)
--     (grep confirms 00489 is the only prior definition; body reproduced
--       verbatim below with 'expired' added to the terminal-state handling.)
--   confirm_media_upload is UNCHANGED — its existing "lifecycle_state <>
--     'pending'" branch (00498/00499) already answers an expired row with
--     P0413 (state mismatch, no code to graft), because an expired row's
--     sha256 is always NULL (it was never confirmed) and confirm_media_upload
--     requires a non-null observed size, so the idempotent-restate check can
--     never match. Proven, not merely argued, by conformance test 17b below.
--
-- ─── ERRCODES (worker mapping) ──────────────────────────────────────────────
--   P0416  scan already holds the max pending upload intents  → 429
-- Continuing the 00498/00499 block: P0410 → 404, P0411 → 400, P0412/P0413 →
-- 409, P0414/P0415 are pipeline-door-only (00499). P0403/P0404 stay reserved
-- for 00490/00492's lease and stale-version gates.
--
-- Adds a GRANT/REVOKE'd function and view → regenerate seed/00-legacy-grants.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. lifecycle_state — add 'expired', DROP-then-ADD idempotent-widen idiom
--    (00490's scan_pipeline_events_stage_check precedent). The unnamed inline
--    CHECK from 00489 auto-named as media_objects_lifecycle_state_check
--    (Postgres's <table>_<column>_check convention for an unnamed single-
--    column CHECK).
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.media_objects
  DROP CONSTRAINT IF EXISTS media_objects_lifecycle_state_check;
ALTER TABLE public.media_objects
  ADD CONSTRAINT media_objects_lifecycle_state_check
  CHECK (lifecycle_state IN ('pending', 'stored', 'verified', 'deleted', 'expired'));

COMMENT ON COLUMN public.media_objects.lifecycle_state IS
  '00489 + 00501: pending -> stored -> verified is forward-only; deleted and expired are both terminal and reachable from any non-terminal state, but not from EACH OTHER or back out. expired is set only by expire_stale_upload_intents (00501), never by mark_media_object_state directly, and only for stale pending upload-interface rows.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. create_media_upload_intent — 00500's body verbatim, plus a per-scan cap
--    on concurrently-pending intents.
--
-- The cap is checked ONLY on the path that mints a genuinely NEW registry row
-- (the final INSERT below). Neither of the other two return paths — the
-- idempotent restate, or the new-generation version bump on an already-pending
-- slot — changes how many pending rows this scan holds, so gating them too
-- would refuse a client that is correctly retrying or re-declaring, not one
-- that is minting new capability.
--
-- pg_advisory_xact_lock(501, hashtext(scan_id)) serializes concurrent intent
-- creation for ONE scan (matching 00498's pg_advisory_xact_lock(498, ...)
-- namespacing idiom — 501 is this migration's number, so the key cannot
-- collide with another program's advisory lock on the same hash) so two
-- concurrent requests cannot both read the pending count under the cap and
-- both insert past it.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.create_media_upload_intent(
  p_scan_id         uuid,
  p_artifact_kind   text,
  p_filename        text,
  p_bucket          text,
  p_declared_sha256 text,
  p_declared_size   bigint,
  p_declared_mime   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  -- The schema-v3 capture bundle's artifact kinds (ArtifactKind.rawValue), as
  -- pinned by services/scan-pipeline/src/patina_scan_worker/keys.py's
  -- KIND_TO_URL_COLUMN + KIND_TO_FOLDER tables, PLUS the Patina client's own
  -- `bundleArchive` (00500) — a whole-bundle zip that shares the legacy
  -- Supabase Storage `bundle` folder / `scan_bundle_url` column with Field's
  -- `keyframesArchive` but is a semantically distinct artifact. The
  -- registry key is `scan_originals/{scanId}/{artifactKind}/{filename}`, so
  -- naming both kinds here gives each its own key — the legacy-layout
  -- collision does not follow it in. A closed set: an unknown kind is a
  -- malformed request, not a new folder.
  c_kinds constant text[] := ARRAY[
    'anchors', 'bundleArchive', 'bundleManifest', 'capturedRoomJson',
    'coverageHeatmap', 'depthArchive', 'depthIndex', 'heroFrame',
    'keyframeIndex', 'keyframeSummary', 'keyframesArchive', 'mesh',
    'photosManifest', 'scorecard', 'thumbnail', 'usdz', 'worldMap'
  ];
  -- R2's single-PUT ceiling. A larger object needs multipart, which this
  -- interface does not issue — refuse it here rather than mint a URL that
  -- cannot work.
  c_max_size constant bigint := 5368709120;
  -- 00501: the schema-v3 bundle has <=16 kinds; 24 gives filename-variant
  -- headroom (a client retrying under a differently-named file, or a kind
  -- issued more than once) without leaving the slot count effectively
  -- unbounded. Finding 11 of the security review: this cap did not exist.
  c_max_pending_intents constant int := 24;
  v_caller   uuid := auth.uid();
  v_key      text;
  v_existing public.media_objects;
  v_id       uuid;
  v_version  int;
  v_state    text;
BEGIN
  -- ─── argument shape ───────────────────────────────────────────────────────
  IF p_scan_id IS NULL THEN
    RAISE EXCEPTION 'create_media_upload_intent: p_scan_id is required'
      USING ERRCODE = 'P0411';
  END IF;
  IF p_artifact_kind IS NULL OR NOT (p_artifact_kind = ANY (c_kinds)) THEN
    RAISE EXCEPTION 'create_media_upload_intent: unknown artifact kind'
      USING ERRCODE = 'P0411';
  END IF;
  -- One path segment, no traversal, no separator, no leading dot. The key is
  -- built from these three values, so this is what keeps the key shape honest.
  IF p_filename IS NULL
     OR p_filename !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'
     OR p_filename LIKE '%..%' THEN
    RAISE EXCEPTION 'create_media_upload_intent: filename is not a safe single segment'
      USING ERRCODE = 'P0411';
  END IF;
  -- The originals bucket for SOME environment. Pinning the shape here means a
  -- caller reaching this RPC directly (PostgREST, not the Worker) still cannot
  -- register a row against the artifacts bucket and shadow a pipeline output.
  -- 00499: the pattern itself now lives in ONE place (is_originals_bucket), so
  -- the intent side and the confirm side cannot drift apart.
  IF NOT public.is_originals_bucket(p_bucket) THEN
    RAISE EXCEPTION 'create_media_upload_intent: bucket is not an originals bucket'
      USING ERRCODE = 'P0411';
  END IF;
  IF p_declared_sha256 IS NULL OR p_declared_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'create_media_upload_intent: declared sha256 must be 64 lowercase hex characters'
      USING ERRCODE = 'P0411';
  END IF;
  IF p_declared_size IS NULL OR p_declared_size <= 0 OR p_declared_size > c_max_size THEN
    RAISE EXCEPTION 'create_media_upload_intent: declared size is out of range'
      USING ERRCODE = 'P0411';
  END IF;
  IF p_declared_mime IS NULL
     OR p_declared_mime !~ '^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$' THEN
    RAISE EXCEPTION 'create_media_upload_intent: declared mime is malformed'
      USING ERRCODE = 'P0411';
  END IF;

  -- ─── caller binding ───────────────────────────────────────────────────────
  IF NOT public.caller_can_access_room_scan(p_scan_id) THEN
    RAISE EXCEPTION 'create_media_upload_intent: scan is not visible to this caller'
      USING ERRCODE = 'P0410';
  END IF;

  -- ─── 00501: per-scan serialization ahead of the cap read below ────────────
  PERFORM pg_advisory_xact_lock(501, hashtext(p_scan_id::text));

  v_key := 'scan_originals/' || p_scan_id::text || '/' || p_artifact_kind || '/' || p_filename;

  -- FOR UPDATE holds the slot across the decision and the write, so two
  -- concurrent intents for one key cannot both mint a generation.
  SELECT * INTO v_existing
    FROM public.media_objects
   WHERE bucket = p_bucket AND object_key = v_key
     FOR UPDATE;

  IF FOUND THEN
    -- Another scan already owns this key: impossible through the key shape
    -- above, but a registry row is the tenancy boundary, so it is checked
    -- rather than assumed.
    IF v_existing.scan_id IS DISTINCT FROM p_scan_id THEN
      RAISE EXCEPTION 'create_media_upload_intent: key is bound to another scan'
        USING ERRCODE = 'P0410';
    END IF;

    IF v_existing.lifecycle_state = 'deleted' THEN
      RAISE EXCEPTION 'create_media_upload_intent: object is deleted'
        USING ERRCODE = 'P0413';
    END IF;

    IF v_existing.lifecycle_state <> 'pending' THEN
      -- Already landed (or expired — see the header note: confirm_media_upload
      -- already refuses that case, and a fresh intent for an expired slot is
      -- deliberately treated the same as any other non-pending restate here,
      -- so the caller gets one consistent "already <state>" answer). Only an
      -- exact restatement of what is there is tolerated; anything else would
      -- be an overwrite of confirmed bytes.
      IF v_existing.sha256 IS NOT DISTINCT FROM p_declared_sha256 THEN
        RETURN jsonb_build_object(
          'object_id',       v_existing.id,
          'bucket',          v_existing.bucket,
          'object_key',      v_existing.object_key,
          'version',         v_existing.version,
          'lifecycle_state', v_existing.lifecycle_state,
          'created',         false
        );
      END IF;
      RAISE EXCEPTION 'create_media_upload_intent: object is already %', v_existing.lifecycle_state
        USING ERRCODE = 'P0413';
    END IF;

    IF v_existing.provenance ->> 'declared_sha256' IS NOT DISTINCT FROM p_declared_sha256
       AND (v_existing.provenance ->> 'declared_size')::bigint IS NOT DISTINCT FROM p_declared_size THEN
      -- The idempotent case: the same intent, returned unchanged.
      RETURN jsonb_build_object(
        'object_id',       v_existing.id,
        'bucket',          v_existing.bucket,
        'object_key',      v_existing.object_key,
        'version',         v_existing.version,
        'lifecycle_state', v_existing.lifecycle_state,
        'created',         false
      );
    END IF;

    -- A different declared checksum for a still-pending slot: new generation.
    UPDATE public.media_objects SET
      version    = version + 1,
      mime       = p_declared_mime,
      provenance = coalesce(provenance, '{}'::jsonb) || jsonb_build_object(
        'source',          'media_upload_intent',
        'artifact_kind',   p_artifact_kind,
        'declared_sha256', p_declared_sha256,
        'declared_size',   p_declared_size,
        'declared_mime',   p_declared_mime
      ),
      updated_at = now()
     WHERE id = v_existing.id
     RETURNING id, version, lifecycle_state INTO v_id, v_version, v_state;

    RETURN jsonb_build_object(
      'object_id',       v_id,
      'bucket',          p_bucket,
      'object_key',      v_key,
      'version',         v_version,
      'lifecycle_state', v_state,
      'created',         false
    );
  END IF;

  -- ─── 00501: the per-scan pending-intent cap ────────────────────────────────
  -- Only reached for a genuinely NEW key — every branch above that touches an
  -- EXISTING slot has already returned. Finding 11: unbounded, this let one
  -- caller mint arbitrarily many pending registry rows (and arbitrarily many
  -- thirty-minute signed R2 PUT capabilities) against a single scan.
  IF (
    SELECT count(*) FROM public.media_objects mo
     WHERE mo.scan_id = p_scan_id AND mo.lifecycle_state = 'pending'
  ) >= c_max_pending_intents THEN
    RAISE EXCEPTION
      'create_media_upload_intent: scan % already holds % pending upload intents (max %)',
      p_scan_id, c_max_pending_intents, c_max_pending_intents
      USING ERRCODE = 'P0416';
  END IF;

  INSERT INTO public.media_objects (
    bucket, object_key, mime, access_class, lifecycle_state,
    provenance, owner_user_id, scan_id
  ) VALUES (
    p_bucket, v_key, p_declared_mime, 'authenticated_project', 'pending',
    jsonb_build_object(
      'source',          'media_upload_intent',
      'artifact_kind',   p_artifact_kind,
      'declared_sha256', p_declared_sha256,
      'declared_size',   p_declared_size,
      'declared_mime',   p_declared_mime
    ),
    v_caller, p_scan_id
  )
  RETURNING id, version, lifecycle_state INTO v_id, v_version, v_state;

  RETURN jsonb_build_object(
    'object_id',       v_id,
    'bucket',          p_bucket,
    'object_key',      v_key,
    'version',         v_version,
    'lifecycle_state', v_state,
    'created',         true
  );
END;
$$;

COMMENT ON FUNCTION public.create_media_upload_intent(uuid, text, text, text, text, bigint, text) IS
  '00498 + 00499 + 00500 + 00501: the registry INSERT behind POST /v1/media/uploads. Caller-bound through caller_can_access_room_scan; key is scan_originals/{scan}/{kind}/{filename} and carries no authorization of its own. Idempotent on (scan, kind, filename, declared sha256) while pending. 00501 caps a scan at 24 concurrently-pending intents (P0416, Worker maps to 429) and serializes the check with pg_advisory_xact_lock(501, hashtext(scan_id)).';

-- CREATE OR REPLACE on an unchanged signature preserves the ACL — 00498's
-- authenticated-only GRANT still stands and is not restated here.

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. mark_media_object_state — 00489's body verbatim, plus 'expired' folded
--    into the terminal-state handling ('expired' joins 'deleted': reachable
--    from any non-terminal state, refuses to be left once entered). No
--    caller of this function ever passes p_state = 'expired' today (the
--    reaper below writes the column directly, as the function owner, rather
--    than through this scan_worker-only RPC) — this is defense in depth, so a
--    future caller cannot resurrect an expired row through a state this
--    function did not know to protect.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.mark_media_object_state(
  p_id       uuid,
  p_state    text,
  p_sha256   text   DEFAULT NULL,
  p_etag     text   DEFAULT NULL,
  p_size     bigint DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current text;
  v_rank    constant jsonb := '{"pending":0,"stored":1,"verified":2}'::jsonb;
BEGIN
  IF p_state NOT IN ('pending', 'stored', 'verified', 'deleted', 'expired') THEN
    RAISE EXCEPTION 'mark_media_object_state: invalid p_state %', p_state;
  END IF;

  SELECT lifecycle_state INTO v_current
    FROM public.media_objects WHERE id = p_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'mark_media_object_state: media object % not found', p_id;
  END IF;

  IF v_current <> p_state THEN
    IF v_current IN ('deleted', 'expired') THEN
      RAISE EXCEPTION
        'mark_media_object_state: % is %; % is terminal (refused move to %)',
        p_id, v_current, v_current, p_state;
    ELSIF p_state NOT IN ('deleted', 'expired')
      AND (v_rank ->> p_state)::int < (v_rank ->> v_current)::int THEN
      RAISE EXCEPTION
        'mark_media_object_state: lifecycle_state is forward-only (refused % -> %)',
        v_current, p_state;
    END IF;
  END IF;

  UPDATE public.media_objects SET
    lifecycle_state = p_state,
    sha256          = coalesce(p_sha256, sha256),
    etag            = coalesce(p_etag, etag),
    size_bytes      = coalesce(p_size, size_bytes),
    updated_at      = now()
  WHERE id = p_id;
END;
$$;

COMMENT ON FUNCTION public.mark_media_object_state(uuid, text, text, text, bigint) IS
  '00489 + 00501: advance media_objects.lifecycle_state. Forward-only pending -> stored -> verified; deleted and expired (00501) are each reachable from any non-terminal state and are BOTH terminal — refused to be left once entered, so a stale or replayed call cannot resurrect a deleted OR an expired row.';

-- CREATE OR REPLACE on an unchanged signature preserves the ACL — 00489's
-- scan_worker-only GRANT still stands and is not restated here.

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. expire_stale_upload_intents — the stale-intent reaper.
--
-- Scope, exactly: `pending` rows, older than p_ttl (by created_at — the row's
-- own age, not when it was last touched), whose provenance names the upload
-- interface as their source. That last predicate is 00499's discriminator
-- (`provenance ->> 'source' = 'media_upload_intent'`) — the SAME one
-- register_media_object's P0415 guard uses to tell an upload-interface row
-- apart from a pipeline ARTIFACT row, so this reaper and that guard cannot
-- drift on what counts as "ours to touch". A pipeline row (register_media_object)
-- never carries that provenance key, so it is never a candidate here, no
-- matter how long it sits pending — the scan-pipeline's own retry/backoff
-- semantics own that lifecycle, not this reaper.
--
-- Runs as the function owner (SECURITY DEFINER), so it needs no scan_worker
-- or scan_reader grant — the only caller is pg_cron, which runs the scheduled
-- SQL as the role that scheduled it (the migration-apply role, i.e. the same
-- role that owns this function), and ownership carries implicit EXECUTE
-- regardless of the REVOKE below. Nobody else needs it: not a portal (no HTTP
-- route calls this), not scan_worker (the pipeline never expires an upload-
-- interface row), not an end user (nothing here is caller-bound — deliberately,
-- since the sweep runs cluster-wide, across every scan).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.expire_stale_upload_intents(
  p_ttl interval DEFAULT '48 hours'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.media_objects
     SET lifecycle_state = 'expired',
         updated_at      = now()
   WHERE lifecycle_state = 'pending'
     AND provenance ->> 'source' = 'media_upload_intent'
     AND created_at < now() - p_ttl;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.expire_stale_upload_intents(interval) IS
  '00501: the stale-intent reaper (security-review finding 11). Transitions pending upload-interface media_objects rows (provenance ->> ''source'' = ''media_upload_intent'', 00499''s discriminator) older than p_ttl (default 48h, by created_at) to the terminal expired state. Never touches a pipeline-registered (register_media_object) row, no matter how long it sits pending. Returns the count expired. Scheduled daily via pg_cron (expire-stale-upload-intents-daily), calling this RPC directly — no edge function. R2 orphan-object deletion is OUT OF SCOPE (needs the write credential); public.expired_upload_originals is the seam a future cleanup job reads.';

REVOKE ALL ON FUNCTION public.expire_stale_upload_intents(interval)
  FROM PUBLIC, anon, authenticated, scan_worker, scan_reader;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. expired_upload_originals — the documented seam for a FUTURE R2
--    orphan-object cleanup job. This migration does not delete anything from
--    R2 (it has no business holding the write credential); it only makes
--    "what got expired" queryable in one place instead of forcing that future
--    job to reconstruct the reaper's own predicate.
--
--    security_invoker = false (the scan_media_read/00490 pattern): the
--    cleanup job this seam anticipates runs cluster-wide, across every scan —
--    the same reason expire_stale_upload_intents itself is not caller-bound.
--    Not granted to any role a request can reach; when the cleanup job is
--    built, grant SELECT to whatever role runs it (service_role today, or a
--    narrower dedicated role if one is minted).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.expired_upload_originals
WITH (security_barrier = true, security_invoker = false)
AS
SELECT
  mo.id,
  mo.bucket,
  mo.object_key,
  mo.scan_id,
  mo.size_bytes,
  mo.updated_at AS expired_at
FROM public.media_objects mo
WHERE mo.lifecycle_state = 'expired';

COMMENT ON VIEW public.expired_upload_originals IS
  '00501: read-only seam over expired upload-interface media_objects rows (bucket, object_key, expired_at) for a FUTURE R2 orphan-object cleanup job. That job is OUT OF SCOPE here (needs the write credential) — this view exists so it does not have to reconstruct expire_stale_upload_intents'' own predicate. Not granted to any role a request can reach.';

REVOKE ALL ON public.expired_upload_originals FROM PUBLIC, anon, authenticated, scan_worker, scan_reader;
GRANT SELECT ON public.expired_upload_originals TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. pg_cron — daily sweep, calling the RPC directly (SQL, no edge function).
--    Guarded (re)schedule idiom, exactly as 00491.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-stale-upload-intents-daily') THEN
    PERFORM cron.unschedule('expire-stale-upload-intents-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'expire-stale-upload-intents-daily',
  '15 7 * * *',
  $$SELECT public.expire_stale_upload_intents();$$
);

-- Best-effort registry comment (pg_cron is owned by supabase_admin on
-- self-hosted, so a postgres-run migration may lack privilege; cron.job is
-- the authoritative registry regardless — same guard as 00181/00491).
DO $$ BEGIN
  EXECUTE $C$COMMENT ON EXTENSION pg_cron IS 'pg_cron schedules: see cron.job for the authoritative registry. Rendered Room v2 (00491): dispatch-scan-modal-sweep every 5 minutes. Rendered Room v2 (00501): expire-stale-upload-intents-daily at 07:15 UTC -> public.expire_stale_upload_intents() directly (no edge function), transitioning stale pending upload-interface media_objects rows to expired. Room View, Agent OS, BOH, Field Site Request, Mood Board, invoice/decision reminders, and earlier schedules are unchanged (see prior registry text / cron.job).'$C$;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
