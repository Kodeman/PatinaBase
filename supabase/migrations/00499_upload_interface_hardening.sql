-- ═══════════════════════════════════════════════════════════════════════════
-- 00499 — W3-A hardening: one originals-bucket pattern, a confirm that cannot
--         be pointed at the artifacts bucket, and a registry door that cannot
--         un-say a confirm (Rendered Room v2 · W3-A review closure)
--
-- Band: 00499 is drawn from the 00498–00502 band that
-- docs/engineering/migration-number-reservations.md reserves for Rendered
-- Room v2's W2-onward work. 00494–00497 stay with Phase 2's backfill program.
--
-- ─── Why this file exists ───────────────────────────────────────────────────
-- A security review of the W3-A upload interface (00498 + infra/edge-api-worker)
-- left findings this file closes on the database side. Findings 2/4/5/6/10/18
-- are closed in the Worker and its conformance test, not here.
--
--   finding 12  confirm_media_upload accepted ANY registry row the caller could
--               see, including one naming the ARTIFACTS bucket — so a row that
--               shadowed a pipeline output could be walked through confirm and
--               have the Worker HEAD it with the WRITE credential. The bucket
--               is now pinned, as P0410 (the same 404 an invisible row gets).
--   finding 13  register_media_object (the pipeline's door, scan_worker-only)
--               could register a scan_originals/ key and could reset a
--               'stored'/'verified' row to 'pending' — un-saying a confirm.
--               Both are refused, with dedicated errcodes.
--   finding 14  confirm_media_upload persisted p_etag unvalidated. Bounded.
--   finding 16  the originals-bucket regex was a bare literal whose relationship
--               to the deployed bucket names was invisible; a bucket rename
--               would have failed closed with no clue why, and 00499 was about
--               to add a SECOND copy of it. There is now exactly one, named,
--               commented, and used by both sides.
--
-- ─── The probe behind the confirm changes ───────────────────────────────────
-- 00498 hedged: it recorded `sha256_verified_by = 'put_condition'` for the case
-- where R2 returned no checksum on HEAD, treating the signed
-- x-amz-checksum-sha256 condition as a weaker fallback assurance. Whether that
-- condition was enforced AT ALL was never measured. It has now been measured,
-- against staging R2, from Modal, with the Worker's own canonical request shape
-- (2026-08-19; OPERATIONS.md "What the R2 probe established"):
--
--   * correct bytes + correct signed checksum        -> 200, object created
--   * WRONG bytes + the same signed checksum,
--     identical content-length                       -> 400 BadDigest,
--                                                       object NEVER created
--   * HEAD with x-amz-checksum-mode: ENABLED         -> returns the digest
--   * sending a checksum header other than the
--     signed one                                     -> 403 SignatureDoesNotMatch
--
-- So the condition IS enforced, and R2 DOES report the stored digest. That
-- makes 'put_condition' unreachable for anything that came through the
-- presigned PUT: a confirm carrying no observed checksum is evidence the bytes
-- did not come through it. 00499 therefore REQUIRES the observed checksum and
-- records only 'r2_head'.
--
-- ─── ERRCODES ───────────────────────────────────────────────────────────────
-- Continuing 00498's block. P0410 -> 404, P0411 -> 400, P0412/P0413 -> 409.
--   P0414  a reserved key prefix was offered to register_media_object
--   P0415  register_media_object was asked to un-store a confirmed object
-- P0414/P0415 are raised only at the pipeline's door, which no HTTP route
-- fronts, so they need no Worker mapping.
--
-- CREATE OR REPLACE on unchanged signatures preserves each function's ACL, so
-- 00498's and 00489's GRANT/REVOKE still stand and are not restated. The one
-- NEW function (is_originals_bucket) needs a seed/00-legacy-grants.sql row.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. is_originals_bucket — the ONE originals-bucket pattern
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.is_originals_bucket(p_bucket text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT p_bucket IS NOT NULL
     AND p_bucket ~ '^patina-(staging-)?media-originals-us$';
$$;

COMMENT ON FUNCTION public.is_originals_bucket(text) IS
  '00499: the single originals-bucket pattern, shared by create_media_upload_intent and confirm_media_upload. RENAME HAZARD: this literal must track infra/edge-api-worker/wrangler.jsonc''s SCAN_R2_ORIGINALS_BUCKET in EVERY environment (patina-staging-media-originals-us on staging, patina-media-originals-us on production). Renaming a bucket without editing this pattern fails the upload interface CLOSED — every intent 400s with "bucket is not an originals bucket" — which is the safe direction but gives no clue where to look, so the two are named together here.';

-- The pattern is a shape check callable from inside definer bodies; nothing
-- outside them needs it, and it discloses the bucket naming scheme.
REVOKE ALL ON FUNCTION public.is_originals_bucket(text) FROM PUBLIC, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. create_media_upload_intent — 00498's body VERBATIM, with the bucket
--    literal replaced by the shared helper (finding 16).
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. confirm_media_upload — 00498's body VERBATIM, with the originals-bucket
--    pin (finding 12), the etag shape bound (finding 14), and the observed
--    checksum made mandatory on the probe's evidence.
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
  -- 00499: the observed checksum is REQUIRED, where 00498 tolerated NULL.
  -- The 2026-08-19 probe (OPERATIONS.md "What the R2 probe established") showed
  -- staging R2 both ENFORCES the signed x-amz-checksum-sha256 condition and
  -- REPORTS the stored digest on a checksum-mode HEAD. So an object that
  -- arrived through the presigned PUT always has one, and a confirm carrying no
  -- observed checksum is evidence the bytes did NOT come through that path —
  -- which is exactly the case that must not be waved through.
  IF p_sha256 IS NULL OR p_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'confirm_media_upload: observed sha256 must be 64 lowercase hex characters'
      USING ERRCODE = 'P0411';
  END IF;
  -- 00499: an etag is opaque but not arbitrary — it is persisted on the row and
  -- read back by clients. R2 returns a quoted 32-hex MD5 for a single PUT and
  -- appends `-N` for a multipart object; bounding the shape keeps an unbounded
  -- or structured value out of the registry. (The probe's PUT returned
  -- `"42b77b73ef4fc03c78c853ca8d0353ee"` — quoted, 32 hex.)
  IF p_etag IS NOT NULL AND p_etag !~ '^"?[0-9a-fA-F]{32}(-[0-9]{1,5})?"?$' THEN
    RAISE EXCEPTION 'confirm_media_upload: observed etag is malformed'
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

  -- 00499: pin the bucket. This RPC exists only for objects the upload
  -- interface minted, and those are ALWAYS in an originals bucket. Without this
  -- a registry row naming the ARTIFACTS bucket could be walked through confirm
  -- — the Worker would HEAD a pipeline output with the write credential and
  -- land its checksum on a row the caller can see. Refused as P0410 so it is
  -- the same 404 an invisible row gets: this route has no opinion to leak about
  -- objects that are not its own.
  IF NOT public.is_originals_bucket(v_row.bucket) THEN
    RAISE EXCEPTION 'confirm_media_upload: object is not an upload-interface object'
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

  IF p_sha256 IS DISTINCT FROM v_declared_sha THEN
    RAISE EXCEPTION 'confirm_media_upload: observed checksum does not match declared'
      USING ERRCODE = 'P0412';
  END IF;

  -- How the checksum was actually established, recorded rather than implied.
  -- 00499 retires the `put_condition` value: it meant "R2 returned no checksum,
  -- so the signed PUT condition is the only assurance", and the probe showed
  -- that state is unreachable for an object that came through the presigned
  -- PUT. A confirm now either carries R2's own digest or is refused above, so
  -- the only honest value left is `r2_head`.
  v_verified_by := 'r2_head';

  UPDATE public.media_objects SET
    lifecycle_state = 'stored',
    sha256          = p_sha256,
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. register_media_object — 00489's body VERBATIM, with the reserved-prefix
--    refusal and the un-store refusal grafted in (finding 13).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.register_media_object(
  p_bucket       text,
  p_object_key   text,
  p_access_class text,
  p_sha256       text    DEFAULT NULL,
  p_etag         text    DEFAULT NULL,
  p_mime         text    DEFAULT NULL,
  p_size_bytes   bigint  DEFAULT NULL,
  p_scan_id      uuid    DEFAULT NULL,
  p_owner_user_id uuid   DEFAULT NULL,
  p_provenance   jsonb   DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_existing public.media_objects;
BEGIN
  IF p_bucket IS NULL OR btrim(p_bucket) = '' THEN
    RAISE EXCEPTION 'register_media_object: p_bucket must be non-empty';
  END IF;
  IF p_object_key IS NULL OR btrim(p_object_key) = '' THEN
    RAISE EXCEPTION 'register_media_object: p_object_key must be non-empty';
  END IF;
  IF p_access_class NOT IN ('authenticated_project', 'released_deliverable') THEN
    RAISE EXCEPTION 'register_media_object: invalid p_access_class %', p_access_class;
  END IF;

  -- ─── 00499: scan_originals/ is the upload interface's namespace ────────────
  -- This RPC is the PIPELINE's registry door (granted to scan_worker alone). The
  -- upload interface has its own door, create_media_upload_intent, with its own
  -- caller binding and its own idempotency rules. Nothing legitimate registers a
  -- scan_originals/ key through here — verified by grep: every caller
  -- (services/scan-modal/src/scan_modal/jobs/{splat,renders}_job.py) builds
  -- ARTIFACT keys, and no producer of a scan_originals/ key exists outside the
  -- Worker. Refusing the prefix keeps a compromised or buggy pipeline from
  -- minting, repointing, or un-storing a user's uploaded original.
  IF starts_with(p_object_key, 'scan_originals/') THEN
    RAISE EXCEPTION
      'register_media_object: scan_originals/ is the upload interface''s namespace (use create_media_upload_intent)'
      USING ERRCODE = 'P0414';
  END IF;

  -- Identity fields are write-once. (bucket, object_key) is the row's natural
  -- key, so a re-registration is a NEW GENERATION OF THE SAME OBJECT — never a
  -- chance to repoint that object at a different scan, owner, or access class.
  -- Without this a worker (or anything that ever reaches this RPC) could take
  -- an existing key and silently move another tenant's registry row under its
  -- own scan, which is the whole tenancy boundary media_objects_select rests
  -- on. An update may only FILL A NULL or RESTATE THE SAME VALUE.
  -- FOR UPDATE holds the row for the upsert below, so two concurrent
  -- registrations of the same key cannot both pass this check.
  SELECT * INTO v_existing
    FROM public.media_objects
   WHERE bucket = p_bucket AND object_key = p_object_key
     FOR UPDATE;

  IF FOUND THEN
    IF p_scan_id IS NOT NULL AND v_existing.scan_id IS NOT NULL
       AND p_scan_id IS DISTINCT FROM v_existing.scan_id THEN
      RAISE EXCEPTION
        'register_media_object: scan_id is write-once (% is already bound to scan %)',
        p_object_key, v_existing.scan_id;
    END IF;
    IF p_owner_user_id IS NOT NULL AND v_existing.owner_user_id IS NOT NULL
       AND p_owner_user_id IS DISTINCT FROM v_existing.owner_user_id THEN
      RAISE EXCEPTION
        'register_media_object: owner_user_id is write-once (% is already owned)',
        p_object_key;
    END IF;
    IF p_access_class IS NOT NULL AND v_existing.access_class IS NOT NULL
       AND p_access_class IS DISTINCT FROM v_existing.access_class THEN
      RAISE EXCEPTION
        'register_media_object: access_class is write-once (% is already %)',
        p_object_key, v_existing.access_class;
    END IF;

    -- ─── 00499: this RPC may not UN-SAY a confirm ───────────────────────────
    -- The ON CONFLICT below resets lifecycle_state to 'pending'. For the
    -- pipeline that is correct and load-bearing: its stages are
    -- register -> PUT -> mark_media_object_state('stored') (renders_job.py's
    -- own comment says the row must exist before the bytes do), the keys are
    -- deterministic per room-file version, and a retried stage therefore
    -- re-registers a row that is already 'stored'. A blanket downgrade refusal
    -- would break that retry, so it is deliberately NOT taken.
    --
    -- What IS refused is a downgrade that would erase an ASSERTION no pipeline
    -- stage ever makes:
    --   * 'verified' — nothing in services/scan-modal ever marks it, so no
    --     legitimate caller can be re-registering over one.
    --   * any 'stored'/'verified' row the UPLOAD INTERFACE minted, identified by
    --     its provenance rather than by its key. The prefix guard above already
    --     covers today's key shape; keying this one on provenance means the two
    --     locks fail independently, so a future change to the key layout cannot
    --     quietly open both.
    IF v_existing.lifecycle_state IN ('stored', 'verified')
       AND (v_existing.lifecycle_state = 'verified'
            OR v_existing.provenance ->> 'source' = 'media_upload_intent') THEN
      RAISE EXCEPTION
        'register_media_object: refusing to reset % from % to pending',
        p_object_key, v_existing.lifecycle_state
        USING ERRCODE = 'P0415';
    END IF;
  END IF;

  INSERT INTO public.media_objects AS m (
    bucket, object_key, sha256, etag, mime, size_bytes,
    access_class, lifecycle_state, provenance, owner_user_id, scan_id
  ) VALUES (
    p_bucket, p_object_key, p_sha256, p_etag, p_mime, p_size_bytes,
    p_access_class, 'pending', coalesce(p_provenance, '{}'::jsonb), p_owner_user_id, p_scan_id
  )
  ON CONFLICT (bucket, object_key) DO UPDATE SET
    version         = m.version + 1,
    sha256          = coalesce(EXCLUDED.sha256, m.sha256),
    etag            = coalesce(EXCLUDED.etag, m.etag),
    mime            = coalesce(EXCLUDED.mime, m.mime),
    size_bytes      = coalesce(EXCLUDED.size_bytes, m.size_bytes),
    access_class    = EXCLUDED.access_class,
    lifecycle_state = 'pending',
    provenance      = coalesce(EXCLUDED.provenance, m.provenance),
    owner_user_id   = coalesce(EXCLUDED.owner_user_id, m.owner_user_id),
    scan_id         = coalesce(EXCLUDED.scan_id, m.scan_id),
    updated_at      = now()
  RETURNING m.id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.confirm_media_upload(uuid, text, text, bigint) IS
  '00498 + 00499: the pending -> stored transition behind POST /v1/media/uploads/:id/confirm. Caller-bound through caller_can_access_room_scan and pinned to an originals bucket (P0410 otherwise). Advances only on an observed/declared match (P0412 otherwise, row stays pending). 00499 requires the R2-observed sha256 — the 2026-08-19 probe proved R2 both enforces the signed PUT checksum and reports it on HEAD, so a confirm without one did not come through the presigned PUT — and bounds the etag shape.';

COMMENT ON FUNCTION public.register_media_object(text, text, text, text, text, text, bigint, uuid, uuid, jsonb) IS
  '00489 + 00499: the pipeline''s registry door (scan_worker only). Identity fields are write-once. 00499 refuses the scan_originals/ prefix (P0414 — that namespace belongs to create_media_upload_intent) and refuses to reset a verified row, or any upload-interface row, back to pending (P0415). The pipeline''s own register -> PUT -> mark(stored) retry, which legitimately re-registers a stored ARTIFACT, is deliberately still allowed.';
