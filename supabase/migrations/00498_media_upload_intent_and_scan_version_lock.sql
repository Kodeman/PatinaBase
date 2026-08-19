-- ═══════════════════════════════════════════════════════════════════════════
-- 00498 — Phase-2 upload intent (scan originals) + the room-file version lock
--         (Rendered Room v2 · W3-A)
--
-- Band: this file draws from 00498–00502, the band
-- docs/engineering/migration-number-reservations.md reserves for Rendered
-- Room v2's W2-onward work. 00494–00497 belong to Phase 2's own backfill
-- program and are NOT touched here.
--
-- ─── What this file carries ─────────────────────────────────────────────────
--   1. public.caller_can_access_room_scan(uuid) — the ONE mirror of
--      room_scans' three permissive SELECT policies, so a SECURITY DEFINER
--      body can ask "can THIS caller see this scan?" (see the long note below
--      on why a definer body cannot simply re-run RLS).
--   2. public.create_media_upload_intent(...) — the registry INSERT behind
--      `POST /v1/media/uploads` on the edge-api Worker.
--   3. public.confirm_media_upload(...) — the pending → stored transition
--      behind `POST /v1/media/uploads/:uploadId/confirm`.
--   4. The per-scan advisory lock that closes 00492's documented residual, on
--      BOTH sides of the room-file version race: a BEFORE INSERT trigger on
--      room_files (the reserve path) and a PERFORM inside
--      scan_worker_update_room_file (the merge path).
--
-- ─── Lineage ────────────────────────────────────────────────────────────────
--   media_objects, register_media_object, mark_media_object_state    00489
--   scan_worker_update_room_file    00490 → 00492 → 00498 (this file)
--     (`grep -rln "CREATE OR REPLACE FUNCTION[^(]*scan_worker_update_room_file"
--       supabase/migrations/*.sql | sort | tail -1` → 00492; its body is
--       reproduced VERBATIM below with one PERFORM grafted in.)
--   room_scans SELECT policies mirrored by caller_can_access_room_scan:
--     "Users can manage their room scans"        00014 (FOR ALL, owner)
--     "Designers can view authorized room scans" 00020 (owner / designer_clients / association)
--     "room_scans_studio_designer_read"          00316 (studio co-member)
--
-- ─── WHY A MIRROR, AND WHY IT IS TESTED RATHER THAN TRUSTED ─────────────────
-- The scan read path (R5) needs no mirror: the Worker opens ONE
-- `SET LOCAL ROLE authenticated` transaction and lets the caller's own RLS
-- answer. The write path cannot do only that — `authenticated` holds no INSERT
-- or UPDATE on media_objects (00489 negative space), so the write must run
-- through SECURITY DEFINER, and inside a definer body `current_user` is the
-- function owner. PostgreSQL offers no way to evaluate another role's row
-- security from there: `SET ROLE` is refused inside SECURITY DEFINER, and a
-- SECURITY INVOKER helper called from a definer body still runs as the
-- definer. So the caller-binding predicate has to be written out.
--
-- Written-out predicates are exactly how the mood-board exposure happened, so
-- this one is not trusted — it is GATED. The Worker performs its own
-- caller's-own-RLS visibility read on room_scans inside the authenticated
-- transaction before it calls either RPC (two independent gates, one of them
-- the real policy), and
-- supabase/tests/scan_pipeline/scan_roles_conformance_test.sql asserts
-- EQUIVALENCE: for owner / designer-client / active-association / co-member /
-- unrelated fixtures, this function's answer must equal what
-- `SELECT ... FROM room_scans` returns under `SET LOCAL ROLE authenticated`
-- for that same user. A future policy change this mirror does not track fails
-- that test rather than opening a hole quietly.
--
-- ─── ERRCODES (worker mapping) ──────────────────────────────────────────────
--   P0410  the caller cannot see the scan / object   → 404 (never 403: a 403
--          would confirm the row exists — the mood-board bug class)
--   P0411  an argument is malformed                  → 400
--   P0412  observed bytes disagree with declared     → 409, row stays pending
--   P0413  the object is not in a confirmable state  → 409
-- P0403/P0404 stay reserved for 00490/00492's lease and stale-version gates.
--
-- Adds GRANT/REVOKE and new functions → regenerate seed/00-legacy-grants.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. caller_can_access_room_scan — the mirrored visibility predicate
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.caller_can_access_room_scan(p_scan_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  -- No JWT subject means no leg below can match anyway; refusing here keeps
  -- the intent explicit rather than incidental.
  IF v_caller IS NULL OR p_scan_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.room_scans rs
     WHERE rs.id = p_scan_id
       AND (
         -- 00014 "Users can manage their room scans" (FOR ALL) and the owner
         -- leg 00020 restates.
         rs.user_id = v_caller
         -- 00020, designer-client relationship.
         OR EXISTS (
           SELECT 1 FROM public.designer_clients dc
            WHERE dc.designer_id = v_caller
              AND dc.client_id = rs.user_id
         )
         -- 00020, live scan association.
         OR EXISTS (
           SELECT 1 FROM public.room_scan_associations rsa
            WHERE rsa.scan_id = rs.id
              AND rsa.designer_id = v_caller
              AND rsa.status = 'active'
              AND (rsa.expires_at IS NULL OR rsa.expires_at > now())
         )
         -- 00316 "room_scans_studio_designer_read", studio co-member of a
         -- designer who holds the client relationship.
         OR EXISTS (
           SELECT 1 FROM public.designer_clients dc
            WHERE dc.client_id = rs.user_id
              AND public.is_studio_comember(dc.designer_id)
         )
       )
  );
END;
$$;

COMMENT ON FUNCTION public.caller_can_access_room_scan(uuid) IS
  '00498: mirrors room_scans'' three permissive SELECT policies (00014 owner, 00020 designer-client/association, 00316 studio co-member) so a SECURITY DEFINER write path can bind the caller. A definer body cannot re-run the caller''s RLS (SET ROLE is refused there), so this predicate is gated by an equivalence assertion in supabase/tests/scan_pipeline/scan_roles_conformance_test.sql rather than trusted.';

-- Nothing calls this from outside a definer body, and inside one the owner's
-- privilege applies — so no role needs EXECUTE.
REVOKE ALL ON FUNCTION public.caller_can_access_room_scan(uuid)
  FROM PUBLIC, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. create_media_upload_intent — the idempotent upload intent
--
-- Key shape is REGISTRY-KEYED and carries no authorization of its own:
--   scan_originals/{scan_id}/{artifact_kind}/{filename}
-- The registry row plus media_objects' RLS delegation to room_scans are what
-- decide who may read the bytes back. That is the deliberate break from the
-- legacy `{userId}/{roomId}/…` Supabase Storage layout, whose path segments
-- WERE the authorization — the pattern DELIVERY-PLAN W3 forbids carrying into
-- R2.
--
-- Idempotency, exactly: the same (scan, kind, filename, declared sha256) while
-- the row is still `pending` returns the SAME registry id, unchanged. A
-- different declared checksum for the same key is a new generation of that
-- slot (version bumps, declared fields are restated, lifecycle stays pending).
-- Once the object is `stored`/`verified`, re-issuing an intent for the same key
-- is refused unless the declared checksum matches what actually landed, in
-- which case the existing row is returned so a client retrying after a
-- successful confirm gets a stable answer instead of a new slot.
--
-- Why this does not call 00489's register_media_object: that RPC resets any
-- existing row to `pending` on conflict, which would let an intent silently
-- un-store confirmed bytes. The guards above are the difference, so the INSERT
-- is written out here.
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
  -- KIND_TO_URL_COLUMN + KIND_TO_FOLDER tables. A closed set: an unknown kind
  -- is a malformed request, not a new folder.
  c_kinds constant text[] := ARRAY[
    'anchors', 'bundleManifest', 'capturedRoomJson', 'coverageHeatmap',
    'depthArchive', 'depthIndex', 'heroFrame', 'keyframeIndex',
    'keyframeSummary', 'keyframesArchive', 'mesh', 'photosManifest',
    'scorecard', 'thumbnail', 'usdz', 'worldMap'
  ];
  -- R2's single-PUT ceiling. A larger object needs multipart, which this
  -- interface does not issue — refuse it here rather than mint a URL that
  -- cannot work.
  c_max_size constant bigint := 5368709120;
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
  IF p_bucket IS NULL OR p_bucket !~ '^patina-(staging-)?media-originals-us$' THEN
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
      -- Already landed. Only an exact restatement of what is there is
      -- tolerated; anything else would be an overwrite of confirmed bytes.
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
  '00498: the registry INSERT behind POST /v1/media/uploads. Caller-bound through caller_can_access_room_scan; key is scan_originals/{scan}/{kind}/{filename} and carries no authorization of its own. Idempotent on (scan, kind, filename, declared sha256) while pending.';

REVOKE ALL ON FUNCTION public.create_media_upload_intent(uuid, text, text, text, text, bigint, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_media_upload_intent(uuid, text, text, text, text, bigint, text)
  TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. confirm_media_upload — pending → stored, against what R2 actually holds
--
-- The Worker HEADs the object with the same SigV4 credentials that signed the
-- PUT and passes the OBSERVED size/etag (and checksum, when R2 returns one)
-- here. This function re-derives nothing from the caller: it compares the
-- observed values against what the intent DECLARED, and only a match advances
-- the lifecycle. A mismatch leaves the row `pending` — the object stays
-- unservable (the scan read path signs only `stored`/`verified`) and the
-- client can retry the PUT without re-issuing an intent.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.confirm_media_upload(
  p_object_id uuid,
  p_sha256    text,
  p_etag      text,
  p_size      bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row           public.media_objects;
  v_declared_sha  text;
  v_declared_size bigint;
  v_verified_by   text;
BEGIN
  IF p_object_id IS NULL THEN
    RAISE EXCEPTION 'confirm_media_upload: p_object_id is required'
      USING ERRCODE = 'P0411';
  END IF;
  IF p_size IS NULL OR p_size < 0 THEN
    RAISE EXCEPTION 'confirm_media_upload: observed size is out of range'
      USING ERRCODE = 'P0411';
  END IF;
  IF p_sha256 IS NOT NULL AND p_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'confirm_media_upload: observed sha256 must be 64 lowercase hex characters'
      USING ERRCODE = 'P0411';
  END IF;

  SELECT * INTO v_row FROM public.media_objects WHERE id = p_object_id FOR UPDATE;

  -- Absent, unscoped, and invisible collapse to ONE errcode the Worker turns
  -- into ONE 404. Telling them apart would confirm the row exists.
  IF NOT FOUND OR v_row.scan_id IS NULL
     OR NOT public.caller_can_access_room_scan(v_row.scan_id) THEN
    RAISE EXCEPTION 'confirm_media_upload: object is not visible to this caller'
      USING ERRCODE = 'P0410';
  END IF;

  IF v_row.lifecycle_state = 'deleted' THEN
    RAISE EXCEPTION 'confirm_media_upload: object is deleted'
      USING ERRCODE = 'P0413';
  END IF;

  IF v_row.lifecycle_state <> 'pending' THEN
    -- A retried confirm after a successful one must be idempotent, not an
    -- error: the client cannot tell a lost response from a lost upload. Only
    -- an exact restatement qualifies — different bytes for an already-stored
    -- object is a real conflict.
    IF v_row.sha256 IS NOT DISTINCT FROM p_sha256
       AND v_row.size_bytes IS NOT DISTINCT FROM p_size THEN
      RETURN jsonb_build_object(
        'object_id',       v_row.id,
        'lifecycle_state', v_row.lifecycle_state,
        'sha256',          v_row.sha256,
        'etag',            v_row.etag,
        'size_bytes',      v_row.size_bytes,
        'changed',         false
      );
    END IF;
    RAISE EXCEPTION 'confirm_media_upload: object is already % and cannot be re-confirmed', v_row.lifecycle_state
      USING ERRCODE = 'P0413';
  END IF;

  v_declared_sha  := v_row.provenance ->> 'declared_sha256';
  v_declared_size := (v_row.provenance ->> 'declared_size')::bigint;

  IF v_declared_sha IS NULL OR v_declared_size IS NULL THEN
    RAISE EXCEPTION 'confirm_media_upload: object carries no declared checksum/size'
      USING ERRCODE = 'P0413';
  END IF;

  IF p_size IS DISTINCT FROM v_declared_size THEN
    RAISE EXCEPTION 'confirm_media_upload: observed size % does not match declared %', p_size, v_declared_size
      USING ERRCODE = 'P0412';
  END IF;

  IF p_sha256 IS NOT NULL AND p_sha256 IS DISTINCT FROM v_declared_sha THEN
    RAISE EXCEPTION 'confirm_media_upload: observed checksum does not match declared'
      USING ERRCODE = 'P0412';
  END IF;

  -- How the checksum was actually established, recorded rather than implied.
  -- `r2_head` means R2 returned the SHA-256 it holds. `put_condition` means it
  -- did not, and the assurance is the signed `x-amz-checksum-sha256` the
  -- presigned PUT required — weaker, and the provenance says so.
  v_verified_by := CASE WHEN p_sha256 IS NULL THEN 'put_condition' ELSE 'r2_head' END;

  UPDATE public.media_objects SET
    lifecycle_state = 'stored',
    sha256          = coalesce(p_sha256, v_declared_sha),
    etag            = coalesce(p_etag, etag),
    size_bytes      = p_size,
    provenance      = coalesce(provenance, '{}'::jsonb) || jsonb_build_object(
      'sha256_verified_by', v_verified_by,
      'confirmed_at',       now()
    ),
    updated_at      = now()
   WHERE id = v_row.id
   RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'object_id',       v_row.id,
    'lifecycle_state', v_row.lifecycle_state,
    'sha256',          v_row.sha256,
    'etag',            v_row.etag,
    'size_bytes',      v_row.size_bytes,
    'changed',         true
  );
END;
$$;

COMMENT ON FUNCTION public.confirm_media_upload(uuid, text, text, bigint) IS
  '00498: the pending -> stored transition behind POST /v1/media/uploads/:id/confirm. Caller-bound through caller_can_access_room_scan; advances only on an observed/declared match (P0412 otherwise, row stays pending). A retried confirm restating the same bytes is idempotent.';

REVOKE ALL ON FUNCTION public.confirm_media_upload(uuid, text, text, bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_media_upload(uuid, text, text, bigint)
  TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. The per-scan advisory lock — closing 00492's insert-side residual
--
-- 00492's header states the residual exactly: `scan_worker_update_room_file`
-- reads max(version) under a FOR UPDATE on the target row, but FOR UPDATE
-- cannot lock a row that does not exist yet, so an insert of version N+1
-- landing between that read and the transaction's commit is invisible to it.
-- Closing it needs BOTH sides to serialize on something the scan owns.
--
-- Both sides now take `pg_advisory_xact_lock(498, hashtext(scan_id::text))`.
-- 498 is this migration's number used as a lock namespace, so the key cannot
-- collide with another program's advisory lock on the same hash.
--
-- The INSERT side is a TRIGGER rather than an RPC because the reserve path is
-- not a function: services/scan-pipeline/src/patina_scan_worker/db.py's
-- `reserve_room_file` is a PostgREST upsert straight onto the table
-- (`room_files?on_conflict=scan_id,version`). A trigger covers it without
-- touching a service on its own deploy cycle — and covers every other insert
-- path at the same time, which an RPC would not.
--
-- No deadlock: the insert side takes only the advisory lock and then writes a
-- NEW row; the merge side holds a row lock on an EXISTING room_files row and
-- then waits for the advisory lock. Neither waits on a resource the other
-- holds, so there is no cycle.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.room_files_scan_version_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- A room_files row with no scan has no sibling version set to serialize
  -- within — the same exemption 00492 makes for the monotonicity check.
  IF NEW.scan_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(498, hashtext(NEW.scan_id::text));
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.room_files_scan_version_lock() IS
  '00498: BEFORE INSERT on room_files — takes pg_advisory_xact_lock(498, hashtext(scan_id)) so the version-INSERT path serializes against scan_worker_update_room_file''s max(version) read. Closes the insert-side residual 00492 documented and deferred to W3.';

REVOKE ALL ON FUNCTION public.room_files_scan_version_lock()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_room_files_scan_version_lock ON public.room_files;
CREATE TRIGGER trg_room_files_scan_version_lock
  BEFORE INSERT ON public.room_files
  FOR EACH ROW EXECUTE FUNCTION public.room_files_scan_version_lock();

-- ═══════════════════════════════════════════════════════════════════════════
-- scan_worker_update_room_file — 00492's body VERBATIM, with the merge side of
-- the advisory lock grafted in ahead of the max(version) read.
--
-- Grants deliberately NOT restated: CREATE OR REPLACE on an UNCHANGED
-- signature preserves the ACL, so 00490's REVOKE/GRANT still stands and
-- seed/00-legacy-grants.sql needs no row for this function (00492 made the
-- same call for the same reason).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.scan_worker_update_room_file(
  p_task_id      uuid,
  p_lease_owner  text,
  p_room_file_id uuid,
  p_verify       jsonb DEFAULT NULL,
  p_artifacts    jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_task              public.agent_tasks;
  v_payload_rf        text;
  v_payload_scan      text;
  v_room_file_scan    uuid;
  v_room_file_version integer;
  v_max_version       integer;
BEGIN
  IF p_verify IS NOT NULL AND jsonb_typeof(p_verify) <> 'object' THEN
    RAISE EXCEPTION 'scan_worker_update_room_file: p_verify must be a jsonb object, got %',
      jsonb_typeof(p_verify);
  END IF;
  IF p_artifacts IS NOT NULL AND jsonb_typeof(p_artifacts) <> 'object' THEN
    RAISE EXCEPTION 'scan_worker_update_room_file: p_artifacts must be a jsonb object, got %',
      jsonb_typeof(p_artifacts);
  END IF;

  SELECT * INTO v_task FROM public.agent_tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'scan_worker_update_room_file: task % not found', p_task_id;
  END IF;
  IF v_task.task_type NOT LIKE 'scan_pipeline.%' THEN
    RAISE EXCEPTION
      'scan_worker_update_room_file: task % is task_type % — outside the scan_pipeline.%% namespace',
      p_task_id, v_task.task_type;
  END IF;
  IF p_lease_owner IS NULL OR btrim(p_lease_owner) = ''
     OR v_task.locked_by IS DISTINCT FROM p_lease_owner THEN
    RAISE EXCEPTION 'scan_worker_update_room_file: task % is not held by this lease', p_task_id
      USING ERRCODE = 'P0403';
  END IF;

  -- FOR UPDATE on the target row: the version check and the merge share one
  -- lock, so nothing can modify THIS row between them.
  SELECT rf.scan_id, rf.version INTO v_room_file_scan, v_room_file_version
    FROM public.room_files rf WHERE rf.id = p_room_file_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'scan_worker_update_room_file: room_files % not found', p_room_file_id;
  END IF;

  v_payload_rf   := v_task.payload ->> 'roomFileId';
  v_payload_scan := v_task.payload ->> 'scanId';

  IF v_payload_rf IS NOT NULL THEN
    IF v_payload_rf <> p_room_file_id::text THEN
      RAISE EXCEPTION
        'scan_worker_update_room_file: task % is not dispatched for room file %',
        p_task_id, p_room_file_id;
    END IF;
  ELSIF v_payload_scan IS NOT NULL THEN
    IF v_room_file_scan IS NULL OR v_payload_scan <> v_room_file_scan::text THEN
      RAISE EXCEPTION
        'scan_worker_update_room_file: task % is not dispatched for room file %''s scan',
        p_task_id, p_room_file_id;
    END IF;
  ELSE
    RAISE EXCEPTION
      'scan_worker_update_room_file: task % payload names neither roomFileId nor scanId',
      p_task_id;
  END IF;

  -- ─── 00492: version monotonicity ──────────────────────────────────────────
  -- The target must still be the NEWEST room file for its scan. A room_files
  -- row with a NULL scan_id has no sibling set to be newest within, so it is
  -- exempt rather than refused — refusing it would break a legitimate write on
  -- a technicality of a nullable column.
  IF v_room_file_scan IS NOT NULL THEN
    -- ─── 00498: the merge side of the per-scan lock ─────────────────────────
    -- Taken BEFORE the max() read, so an in-flight reserve of version N+1
    -- (which takes the same lock in its BEFORE INSERT trigger) either has
    -- already committed and is visible to this read, or waits until this
    -- transaction commits. That is the microsecond window 00492 measured and
    -- deferred to W3; it is closed.
    PERFORM pg_advisory_xact_lock(498, hashtext(v_room_file_scan::text));

    SELECT max(rf.version) INTO v_max_version
      FROM public.room_files rf WHERE rf.scan_id = v_room_file_scan;
    IF v_max_version IS NOT NULL AND v_room_file_version < v_max_version THEN
      RAISE EXCEPTION
        'scan_worker_update_room_file: room file % is version % but scan % is at version % — superseded',
        p_room_file_id, v_room_file_version, v_room_file_scan, v_max_version
        USING ERRCODE = 'P0404';
    END IF;
  END IF;

  UPDATE public.room_files SET
    verify     = CASE WHEN p_verify    IS NULL THEN verify
                       ELSE coalesce(verify, '{}'::jsonb) || p_verify END,
    artifacts  = CASE WHEN p_artifacts IS NULL THEN artifacts
                       ELSE artifacts || p_artifacts END,
    updated_at = now()
  WHERE id = p_room_file_id;
END;
$$;

COMMENT ON FUNCTION public.scan_worker_update_room_file(uuid, text, uuid, jsonb, jsonb) IS
  '00490 + 00492 + 00498: merge verify/artifacts onto ONE room_files row as the scan_worker role. Four gates: task_type namespace, lease ownership (P0403), task<->room-file binding, and version monotonicity (P0404). 00498 adds pg_advisory_xact_lock(498, hashtext(scan_id)) ahead of the max(version) read, matched by a BEFORE INSERT trigger on room_files, closing the insert-side race 00492 documented. Both P0403 and P0404 mean "exit clean, write nothing, never fail_task".';
