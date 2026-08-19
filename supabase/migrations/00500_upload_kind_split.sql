-- ═══════════════════════════════════════════════════════════════════════════
-- 00500 — upload-intent interface: split bundleArchive from keyframesArchive
--         (Rendered Room v2 · small lane)
--
-- Band: 00500 is drawn from the 00498–00502 band that
-- docs/engineering/migration-number-reservations.md reserves for Rendered
-- Room v2's W2-onward work.
--
-- ─── Why this file exists ───────────────────────────────────────────────────
-- 00498/00499's `create_media_upload_intent` allowlist (`c_kinds`) is the
-- schema-v3 capture bundle's kind vocabulary, mirroring
-- services/scan-pipeline/src/patina_scan_worker/keys.py's KIND_TO_URL_COLUMN
-- + KIND_TO_FOLDER tables — which in turn mirror Patina Field's
-- `ScanUploadDescriptor.all` (apps/mobile/Capture/.../SiteScan/
-- ScanUploadDescriptor.swift). Today that vocabulary has 16 kinds and no
-- entry for the CLIENT app's own `bundleArchive` (a whole-bundle zip) — only
-- Field's `keyframesArchive` (keyframes.tar).
--
-- In the LEGACY Supabase Storage layout the two collide: keys.py's
-- KIND_TO_FOLDER maps `keyframesArchive` to folder `bundle` / column
-- `scan_bundle_url`, and the client app's own legacy routing
-- (ArtifactUploader.swift `routing(for:)`) maps `.bundleArchive` to that
-- SAME folder/column — a quirk of the legacy per-kind-folder layout, where
-- one folder happened to serve two apps' different artifacts. That
-- collision is a known one and dies at cutover: the upload-intent registry
-- keys by `scan_originals/{scanId}/{artifactKind}/{filename}` — the kind
-- name IS a key segment, so `bundleArchive` and `keyframesArchive` land at
-- two distinct registry keys with zero chance of conflation, the moment
-- both are named in the allowlist.
--
-- Ruled fix (this migration): the interface treats them as TWO DISTINCT
-- kinds. `bundleArchive` joins `c_kinds` alongside `keyframesArchive` — nothing
-- else about the function changes. Mirrored in
-- infra/edge-api-worker/src/media-uploads.ts (`UPLOAD_ARTIFACT_KINDS`) and the
-- Patina client's `MediaUploadIntentClient.ArtifactKind` /
-- `ScanUploadShadowLeg.uploadKind(for:)` in the same lane.
--
-- Lineage: `create_media_upload_intent` is 00498 → 00499 → 00500 (graft is
-- 00499's body verbatim, `c_kinds` extended by one entry). No other function
-- in this file's scope references the kind allowlist:
-- `confirm_media_upload` and `register_media_object` do not validate
-- `artifact_kind` at all.
--
-- CREATE OR REPLACE on an unchanged signature preserves the function's ACL,
-- so 00498's/00499's GRANT/REVOKE for `create_media_upload_intent` still
-- stand and are not restated here.
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
