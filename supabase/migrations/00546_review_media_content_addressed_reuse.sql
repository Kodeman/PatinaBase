-- ═══════════════════════════════════════════════════════════════════════════
-- 00546 — Review-derivative reuse is content-addressed, not source-addressed
-- Lineage: public.prepare_project_review_media_asset — 00454 → 00546 (this file)
--          public.apply_board_room_state — 00411 → 00435 → 00445 → 00449 →
--            00454 → 00457 → 00546 (this file; grep confirms 00457 is head)
--          public.board_media_reference_has_live_source — 00462 → 00473 →
--            00546 (this file; grep confirms 00473 is head)
--
-- THE BUG (D6, board-paths audit 2026-08-31). Prod logs on Strata
-- (function_edge_logs + postgres_logs, 2026-08-31 16:58 and 17:02 UTC) show the
-- `project-review-media` edge function returning POST 500 twice, each preceded
-- by exactly this pair of Postgres log lines:
--
--   duplicate key value violates unique constraint "bucketid_objname"
--   review derivative registration does not match verified stored bytes
--
-- Root cause: `apps/designer-portal/.../board-cover-lifecycle.ts` calls its
-- `write()` on room exit with `force=true`, which re-renders and re-uploads
-- the board cover unconditionally even when nothing changed since the last
-- write. `generateAndUploadMoodBoardCover` mints a brand-new random path
-- (`.../cover-<uuid>.png`) EVERY call, so two forced writes for an unchanged
-- board produce two DIFFERENT working-media source rows
-- (`project_ffe_media_assets`, one per call) whose BYTES are identical —
-- same checksum, same size, same content type.
--
-- `prepare_project_review_media_asset`'s derivative path is content-addressed
-- (`<project>/prepared/<kind>/<checksum>.<ext>` — see
-- supabase/functions/project-review-media/lib.ts `derivativePath()`), so both
-- calls target the SAME `project_review_media_assets` row via
-- `ON CONFLICT (storage_bucket, storage_path) DO NOTHING`. The edge function
-- already treats this as an expected, tolerable race — its `uploadIfAbsent`
-- comment says a duplicate storage upload is fine because "the mandatory
-- download/hash verification below decides whether it is safe to reuse,
-- regardless of the provider's conflict shape" — but this RPC's reuse
-- comparison did not extend the same tolerance: it required the SECOND
-- call's `source_asset_id` to equal the FIRST call's, which can never hold
-- when the two calls came from two distinct (but byte-identical) source
-- uploads. That mismatch raised 'review derivative registration does not
-- match verified stored bytes' (ERRCODE data_exception), which the edge
-- function surfaces as HTTP 500 `{error: "registration_failed"}` — the
-- "Edge Function returned a non-2xx status code" the client console-warns.
--
-- THE FIX. The row is already keyed 1:1 with its content (checksum + size +
-- content_type + derivative_kind + width + height, all still compared below).
-- Two source uploads with identical verified bytes describe the exact same
-- prepared derivative; the specific working-media row that most recently
-- produced it is lineage, not an identity component. Drop
-- `v_asset.source_asset_id IS DISTINCT FROM v_source.id` from the mismatch
-- guard so a second content-identical prepare call reuses the first
-- derivative instead of raising. Every other equality (project_id,
-- checksum, size, content_type, derivative_kind, width, height) is
-- unchanged, so a genuine byte-mismatch under the same path still raises
-- exactly as before (see the existing negative case in
-- supabase/tests/ffe/service_boundaries_test.sql).
--
-- SECOND FIX, same incident. `apply_board_room_state` (00457, current head)
-- carries the identical assumption one level up: when a project board state
-- patch names both `coverImageUrl` and `coverReviewMediaAssetId`, it demands
-- the derivative's OWN `source_asset_id` resolve to a `project_ffe_media_assets`
-- row whose `storage_path` equals the CURRENT `coverImageUrl`. That again
-- requires the exact source upload that first won the derivative's dedup race
-- to be the one this call happens to name — false whenever a later,
-- byte-identical `coverImageUrl` (a fresh forced-write path, same rendered
-- PNG) reuses an existing derivative. Left unfixed, this would just move the
-- 500 one call later: `prepareProjectReviewMedia` would now succeed, but the
-- immediately following `applyBoardState` would raise 'board cover derivative
-- does not match its stable working path'. The derivative's `checksum_sha256`
-- already equals its source's `checksum_sha256` byte-for-byte (review-media
-- preparation copies working bytes verbatim, per registerPreparedArgs in
-- supabase/functions/project-review-media/lib.ts — no transform occurs), so
-- the guard is restated on CONTENT identity: the named `coverImageUrl` must be
-- a registered working asset for this project whose checksum matches the
-- named derivative's checksum, rather than requiring it be the exact row the
-- derivative happens to store as `source_asset_id`.
--
-- THIRD FIX, same lineage gap, found on adversarial review.
-- `board_media_reference_has_live_source` (00473, current head) recognizes an
-- FF&E-sourced cover's live source via the identical rejected identity:
-- `derivative.source_asset_id = ffe_source.id` where `ffe_source.storage_path
-- = v_path` (the reference actually being checked). For an FF&E-sourced cover
-- that dedup'd onto an existing derivative (D6's exact scenario — a second,
-- byte-identical working-media upload under a fresh path), `v_path` names the
-- SECOND source row, but the derivative's persisted `source_asset_id` still
-- points at the FIRST — so this function would wrongly return false and any
-- caller relying on it to admit a legitimately-shared FF&E cover reference
-- (it backs privacy/read-authorization checks; contrast the write-side guards
-- above) would raise the exact failure class D6 set out to eliminate, just on
-- the read path instead of the write path. Restated on the same content match:
-- `derivative.project_id = ffe_source.project_id AND derivative.checksum_sha256
-- = ffe_source.checksum_sha256`, project_id ownership resolution unchanged.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.prepare_project_review_media_asset(
  p_project_id uuid,
  p_actor_id uuid,
  p_source_bucket text,
  p_source_path text,
  p_source_checksum text,
  p_source_size bigint,
  p_content_type text,
  p_derivative_bucket text,
  p_derivative_path text,
  p_derivative_checksum text,
  p_derivative_size bigint,
  p_derivative_kind text,
  p_width integer,
  p_height integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_source public.project_ffe_media_assets%ROWTYPE;
  v_asset public.project_review_media_assets%ROWTYPE;
  v_derivative_content_type text;
  v_inserted integer;
  v_reused boolean := false;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR SHARE;
  IF NOT FOUND OR NOT public._ffe_is_studio_actor(v_project.designer_id, p_actor_id) THEN
    RAISE EXCEPTION 'project review media actor is not authorized'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_source_bucket <> 'project-ffe-working'
     OR p_derivative_bucket <> 'project-review-media'
     OR p_source_path NOT LIKE p_project_id::text || '/%'
     OR p_derivative_path NOT LIKE p_project_id::text || '/%'
     OR p_source_path LIKE '%..%' OR p_derivative_path LIKE '%..%'
     OR p_source_path LIKE '%\%' OR p_derivative_path LIKE '%\%'
     OR p_source_checksum !~ '^[0-9a-f]{64}$'
     OR p_derivative_checksum !~ '^[0-9a-f]{64}$'
     OR position(p_derivative_checksum IN p_derivative_path) = 0
     OR p_source_size < 0 OR p_derivative_size <= 0
     OR p_content_type NOT IN ('application/pdf','image/jpeg','image/png','image/webp')
     OR p_derivative_kind NOT IN ('thumbnail','display','print')
     OR p_width IS NULL OR p_width <= 0 OR p_height IS NULL OR p_height <= 0
  THEN
    RAISE EXCEPTION 'invalid project review media registration envelope'
      USING ERRCODE = 'check_violation';
  END IF;
  v_derivative_content_type := CASE
    WHEN lower(p_derivative_path) LIKE '%.webp' THEN 'image/webp'
    WHEN lower(p_derivative_path) LIKE '%.png' THEN 'image/png'
    WHEN lower(p_derivative_path) LIKE '%.jpg' OR lower(p_derivative_path) LIKE '%.jpeg' THEN 'image/jpeg'
  END;
  IF v_derivative_content_type IS NULL THEN
    RAISE EXCEPTION 'review derivative path must end in webp, png, jpg, or jpeg'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_source FROM public.project_ffe_media_assets
  WHERE storage_bucket = p_source_bucket AND storage_path = p_source_path FOR UPDATE;
  IF NOT FOUND OR v_source.project_id IS DISTINCT FROM p_project_id
     OR v_source.checksum_sha256 IS DISTINCT FROM p_source_checksum
     OR v_source.size_bytes IS DISTINCT FROM p_source_size
     OR v_source.content_type IS DISTINCT FROM p_content_type THEN
    RAISE EXCEPTION 'working media registration does not match verified stored bytes'
      USING ERRCODE = 'data_exception';
  END IF;

  INSERT INTO public.project_review_media_assets(
    project_id, source_asset_id, storage_bucket, storage_path, derivative_kind,
    checksum_sha256, size_bytes, content_type, width, height, prepared_by
  ) VALUES (
    p_project_id, v_source.id, p_derivative_bucket, p_derivative_path, p_derivative_kind,
    p_derivative_checksum, p_derivative_size, v_derivative_content_type,
    p_width, p_height, p_actor_id
  ) ON CONFLICT (storage_bucket, storage_path) DO NOTHING
  RETURNING * INTO v_asset;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    v_reused := true;
    SELECT * INTO STRICT v_asset FROM public.project_review_media_assets
    WHERE storage_bucket = p_derivative_bucket AND storage_path = p_derivative_path FOR UPDATE;
    -- Reuse is decided by CONTENT identity, not by which working-media upload
    -- produced it: two distinct source rows can carry byte-identical bytes
    -- (e.g. two forced board-cover writes for an unchanged board), and both
    -- legitimately resolve to the same prepared derivative. source_asset_id
    -- is lineage (which upload happened to win the race), not part of the
    -- derivative's identity, so it is deliberately excluded from this guard.
    IF v_asset.project_id IS DISTINCT FROM p_project_id
       OR v_asset.derivative_kind IS DISTINCT FROM p_derivative_kind
       OR v_asset.checksum_sha256 IS DISTINCT FROM p_derivative_checksum
       OR v_asset.size_bytes IS DISTINCT FROM p_derivative_size
       OR v_asset.content_type IS DISTINCT FROM v_derivative_content_type
       OR v_asset.width IS DISTINCT FROM p_width OR v_asset.height IS DISTINCT FROM p_height THEN
      RAISE EXCEPTION 'review derivative registration does not match verified stored bytes'
        USING ERRCODE = 'data_exception';
    END IF;
  END IF;
  -- 'sourceAssetId' stays bound to THIS call's own v_source.id (not the
  -- persisted row's stored lineage, which may belong to an earlier,
  -- byte-identical call under the reuse branch above): the edge function's
  -- parsePreparedDerivative compares this field against the source it just
  -- authorized for the current request, so echoing anything else would trade
  -- today's false 'registration_failed' 500 for a false 'invalid_prepared_asset'
  -- 502 on every reuse.
  RETURN jsonb_build_object(
    'assetId', v_asset.id, 'sourceAssetId', v_source.id, 'projectId', p_project_id,
    'bucket', v_asset.storage_bucket, 'path', v_asset.storage_path,
    'checksumSha256', v_asset.checksum_sha256, 'sizeBytes', v_asset.size_bytes,
    'contentType', v_asset.content_type, 'derivativeKind', v_asset.derivative_kind,
    'width', v_asset.width, 'height', v_asset.height, 'reused', v_reused
  );
END;
$$;

-- Unchanged from 00454: EXECUTE stays service_role-only. Re-stated for clarity
-- since CREATE OR REPLACE does not reset grants, but a bare re-grant here is
-- idempotent and costs nothing.
REVOKE ALL ON FUNCTION public.prepare_project_review_media_asset(
  uuid, uuid, text, text, text, bigint, text, text, text, text,
  bigint, text, integer, integer
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.prepare_project_review_media_asset(
  uuid, uuid, text, text, text, bigint, text, text, text, text,
  bigint, text, integer, integer
) TO service_role;

-- Body copied verbatim from 00457 (current head); only the EXISTS guard's
-- JOIN condition changes (source.id = derivative.source_asset_id →
-- source.project_id/checksum match), per the header above. No rename: the
-- underlying state-application impl (_apply_board_room_state_00456_impl) is
-- untouched, so this CREATE OR REPLACE only swaps the wrapper's validation.
CREATE OR REPLACE FUNCTION public.apply_board_room_state(
  p_board_id uuid,
  p_owner_kind text,
  p_owner_id uuid,
  p_state jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_state jsonb := COALESCE(p_state, '{}'::jsonb);
  v_has_cover_path boolean := v_state ? 'coverImageUrl';
  v_has_cover_asset boolean := v_state ? 'coverReviewMediaAssetId';
  v_cover_path text;
  v_cover_asset uuid;
  v_existing_path text;
  v_existing_asset uuid;
BEGIN
  IF p_owner_kind = 'project' THEN
    PERFORM public._ffe_require_studio_project(p_owner_id);
    SELECT cover_image_url, cover_review_media_asset_id
    INTO v_existing_path, v_existing_asset
    FROM public.proposal_boards
    WHERE id = p_board_id AND project_id = p_owner_id AND proposal_id IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'project board unavailable'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NOT v_has_cover_path AND NOT v_has_cover_asset THEN
      v_state := v_state || jsonb_build_object(
        'coverImageUrl', v_existing_path,
        'coverReviewMediaAssetId', v_existing_asset
      );
    ELSIF NOT v_has_cover_path THEN
      RAISE EXCEPTION 'cover derivative cannot change without coverImageUrl'
        USING ERRCODE = 'check_violation';
    ELSE
      v_cover_path := NULLIF(btrim(v_state->>'coverImageUrl'), '');
      IF v_cover_path IS NULL THEN
        v_state := v_state || jsonb_build_object(
          'coverImageUrl', NULL,
          'coverReviewMediaAssetId', NULL
        );
      ELSE
        IF NOT v_has_cover_asset
           OR v_state->>'coverReviewMediaAssetId' !~* '^[0-9a-f-]{36}$' THEN
          RAISE EXCEPTION 'project board cover requires its prepared review derivative'
            USING ERRCODE = 'check_violation';
        END IF;
        v_cover_asset := (v_state->>'coverReviewMediaAssetId')::uuid;
        -- CONTENT-addressed match (see header): the named coverImageUrl must
        -- be a real working asset for this project whose bytes equal the
        -- named derivative's bytes, not necessarily the exact source row the
        -- derivative was first prepared from.
        IF NOT EXISTS (
          SELECT 1 FROM public.project_review_media_assets derivative
          JOIN public.project_ffe_media_assets source
            ON source.project_id = derivative.project_id
           AND source.checksum_sha256 = derivative.checksum_sha256
          WHERE derivative.id = v_cover_asset AND derivative.project_id = p_owner_id
            AND source.project_id = p_owner_id AND source.storage_path = v_cover_path
        ) THEN
          RAISE EXCEPTION 'board cover derivative does not match its stable working path'
            USING ERRCODE = 'integrity_constraint_violation';
        END IF;
      END IF;
    END IF;
  END IF;

  PERFORM public._apply_board_room_state_00456_impl(
    p_board_id, p_owner_kind, p_owner_id, v_state
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_board_room_state(uuid, text, uuid, jsonb)
  FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.apply_board_room_state(uuid, text, uuid, jsonb)
  TO authenticated;

-- Body copied verbatim from 00473 (current head); only the FF&E-lane EXISTS
-- guard's JOIN condition changes (source_asset_id identity → project +
-- checksum content match), per the header above. Every other branch (the
-- proposal `boards`/`palettes` lanes, the empty/external-media short-circuit,
-- the p_target_designer/p_target_studio XOR guard) is untouched.
CREATE OR REPLACE FUNCTION public.board_media_reference_has_live_source(
  p_reference text,
  p_target_designer uuid DEFAULT NULL,
  p_target_studio uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE
  v_path text := public.board_storage_reference_path(p_reference);
  v_parts text[];
BEGIN
  -- Empty and external HTTPS media never crosses this private bucket boundary.
  IF v_path IS NULL THEN
    RETURN true;
  END IF;
  IF num_nonnulls(p_target_designer, p_target_studio) <> 1 THEN
    RETURN false;
  END IF;

  -- FF&E lane (00457): a project board cover names the working source asset,
  -- never the derivative. Its folder shape is `<project_id>/…`, which carries no
  -- 'boards'/'palettes' segment, so it is settled before the segment branches.
  -- CONTENT-addressed match (see header): a derivative shares this source's
  -- bytes when it shares its project and checksum, regardless of which
  -- specific working-media upload the derivative's own source_asset_id points
  -- at (00546 — byte-identical uploads under two different paths dedup onto
  -- one derivative row).
  IF EXISTS (
    SELECT 1
    FROM public.project_ffe_media_assets AS ffe_source
    JOIN public.project_review_media_assets AS derivative
      ON derivative.project_id = ffe_source.project_id
     AND derivative.checksum_sha256 = ffe_source.checksum_sha256
    JOIN public.projects AS source_project
      ON source_project.id = ffe_source.project_id
    WHERE ffe_source.storage_path = v_path
      AND public.board_media_owners_share_studio(
        source_project.designer_id, p_target_designer, p_target_studio
      )
  ) THEN
    RETURN true;
  END IF;

  v_parts := storage.foldername(v_path);
  IF array_length(v_parts, 1) < 3 THEN
    RETURN false;
  END IF;

  IF v_parts[2] = 'boards' AND EXISTS (
    SELECT 1
    FROM public.proposal_boards AS source_board
    LEFT JOIN public.proposals AS source_proposal
      ON source_proposal.id = source_board.proposal_id
    LEFT JOIN public.projects AS source_project
      ON source_project.id = source_board.project_id
    LEFT JOIN public.profiles AS media_owner
      ON media_owner.id::text = v_parts[1]
    WHERE source_board.id::text = v_parts[3]
      AND (
        v_parts[1] = COALESCE(
          source_board.proposal_id, source_board.project_id
        )::text
        OR public.board_media_owners_share_studio(
          media_owner.id,
          COALESCE(source_proposal.designer_id, source_project.designer_id),
          NULL
        )
      )
      AND public.board_media_owners_share_studio(
        COALESCE(source_proposal.designer_id, source_project.designer_id),
        p_target_designer,
        p_target_studio
      )
  ) THEN
    RETURN true;
  END IF;

  IF v_parts[2] = 'palettes' AND EXISTS (
    SELECT 1
    FROM public.proposals AS source_proposal
    WHERE source_proposal.id::text = v_parts[1]
      AND public.board_media_owners_share_studio(
        source_proposal.designer_id, p_target_designer, p_target_studio
      )
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- Same lockdown 00473 applied: reachable only through the definer guards.
REVOKE ALL ON FUNCTION public.board_media_reference_has_live_source(text, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
