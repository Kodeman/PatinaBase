-- ═══════════════════════════════════════════════════════════════════════════
-- 00489 — Media registry kernel (Rendered Room v2 · W0 foundations)
--
-- Numbering note: 00481–00486 exist only on branch `phase1-close/staging-ready`
-- (PR #28, still open) and are NOT present in this worktree's migration
-- history. 00487/00488 are reserved by that same program. 00489 is this
-- program's floor — the next free number on THIS branch's ledger (local head
-- was 00480 at authoring time). At merge/integration this file may need
-- renumbering per patina-db-migrations step 8 if 00481–00488 land first.
--
-- Scope: the Phase-2 media registry's scan-scoped kernel — id/version, bucket
-- + key, checksum/etag/mime/size, access class, lifecycle state, provenance —
-- plus the two room_files columns (`artifacts`, `verify`) that let a Room
-- File version point at registry rows instead of storing URLs directly. This
-- table is SCAN-SCOPED and MUTABLE UNTIL A SECOND CONSUMER ADOPTS IT (plan
-- §3 W0) — the pilot (this pipeline) owns its schema until then.
--
-- Also mints the two NOLOGIN capability roles this program uses everywhere
-- (`scan_worker`, `scan_reader`), ahead of 00490's RPC/view surface that
-- grants to them — kept in this file (not 00490) so 00489's own write RPCs
-- can GRANT EXECUTE to scan_worker without a forward reference. The
-- password-bearing LOGIN roles are provisioned OUT OF BAND (00490 documents
-- the exact commands) and never enter a migration.
--
-- RLS: media_objects delegates SELECT to the caller's own row security on
-- room_scans — the same shape as room_scan_geometry (00337): the EXISTS
-- subquery runs under the CALLER's RLS on room_scans, so owner /
-- designer-association / studio-co-member access all compose automatically.
-- No INSERT/UPDATE policy exists for end users; all writes are through the
-- SECURITY DEFINER RPCs below, granted only to scan_worker.
--
-- Adds GRANT/REVOKE and a new table → regenerate seed/00-legacy-grants.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 0. Capability roles (NOLOGIN group roles; LOGIN provisioned out of band) ─
-- Mirrors the 00481 `edge_catalog_reader`/`edge_rls_user` shape at reduced
-- ceremony — this program has no pre-existing SUPERUSER/membership hazard to
-- reconcile, so the idempotent create-or-reconcile below is sufficient.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'scan_worker') THEN
    CREATE ROLE scan_worker
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOLOGIN NOREPLICATION NOBYPASSRLS;
  ELSE
    ALTER ROLE scan_worker
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOLOGIN NOREPLICATION NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'scan_reader') THEN
    CREATE ROLE scan_reader
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOLOGIN NOREPLICATION NOBYPASSRLS;
  ELSE
    ALTER ROLE scan_reader
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOLOGIN NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

COMMENT ON ROLE scan_worker IS
  '00489/00490: NOLOGIN/NOBYPASSRLS capability role for the Modal-hosted scan pipeline stages (verify/splat/renders). Holds EXECUTE on narrow SECURITY DEFINER wrappers only — no direct table grants. Environment LOGIN (scan_worker_login) is out of band; see 00490 header.';
COMMENT ON ROLE scan_reader IS
  '00489/00490: NOLOGIN/NOBYPASSRLS capability role for the future scan media read path (W2). Holds SELECT on the scan_media_read security-barrier view only. Environment LOGIN is out of band.';

-- ─── 1. media_objects — the Phase-2 registry kernel (scan-scoped) ───────────
CREATE TABLE IF NOT EXISTS public.media_objects (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version        int  NOT NULL DEFAULT 1,

  bucket         text NOT NULL,
  object_key     text NOT NULL,

  sha256         text,
  etag           text,
  mime           text,
  size_bytes     bigint,

  access_class   text NOT NULL
                   CHECK (access_class IN ('authenticated_project', 'released_deliverable')),
  lifecycle_state text NOT NULL DEFAULT 'pending'
                   CHECK (lifecycle_state IN ('pending', 'stored', 'verified', 'deleted')),

  provenance     jsonb NOT NULL DEFAULT '{}'::jsonb,

  owner_user_id  uuid,
  scan_id        uuid REFERENCES public.room_scans(id) ON DELETE SET NULL,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT media_objects_bucket_key_uniq UNIQUE (bucket, object_key)
);

COMMENT ON TABLE public.media_objects IS
  '00489: Phase-2 media registry kernel, scan-scoped. Canonical rows for R2-resident scan pipeline artifacts — never a signed/public URL. Mutable schema until a second consumer adopts it (plan §3 W0). Written only via register_media_object / mark_media_object_state (SECURITY DEFINER, scan_worker only).';
COMMENT ON COLUMN public.media_objects.access_class IS
  'Phase-2 access-class matrix, W0 subset: authenticated_project (scan media) or released_deliverable (Room File deliverables). See plan §2 R4.';
COMMENT ON COLUMN public.media_objects.scan_id IS
  'Binds this object to a room_scans row for RLS delegation. NULL rows are invisible to end users (fail closed) until a future wave defines unscoped-object access.';

CREATE INDEX IF NOT EXISTS idx_media_objects_scan_id
  ON public.media_objects (scan_id) WHERE scan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_media_objects_owner
  ON public.media_objects (owner_user_id) WHERE owner_user_id IS NOT NULL;

-- ─── RLS: read delegates to the scan's own visibility (00337 shape) ─────────
ALTER TABLE public.media_objects ENABLE ROW LEVEL SECURITY;

-- The EXISTS subquery runs under the CALLER's row security on room_scans, so
-- owner / designer-association / studio-co-member access all compose here —
-- this is NOT the mood-board bug class: it does not merely prove the scan
-- exists, it proves the CALLER can see that scan under room_scans' own RLS.
-- scan_id IS NULL rows are excluded — fail closed, no unscoped-object policy.
DROP POLICY IF EXISTS media_objects_select ON public.media_objects;
CREATE POLICY media_objects_select ON public.media_objects
  FOR SELECT TO authenticated
  USING (
    scan_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.room_scans rs WHERE rs.id = media_objects.scan_id)
  );

-- No INSERT/UPDATE/DELETE policy — writes are through the DEFINER RPCs only.
GRANT SELECT ON public.media_objects TO authenticated;
GRANT ALL    ON public.media_objects TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- register_media_object — upsert on (bucket, object_key); returns id.
-- A fresh key inserts version 1. A re-registration of the same key bumps the
-- version (new generation of the same object slot) and resets
-- lifecycle_state to 'pending' — the confirm step (mark_media_object_state)
-- is what proves the new generation actually landed.
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

REVOKE ALL   ON FUNCTION public.register_media_object(text, text, text, text, text, text, bigint, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.register_media_object(text, text, text, text, text, text, bigint, uuid, uuid, jsonb) TO scan_worker;

-- ═══════════════════════════════════════════════════════════════════════════
-- mark_media_object_state — advance lifecycle_state; optionally land the
-- checksum/etag/size the confirm step observed.
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
BEGIN
  IF p_state NOT IN ('pending', 'stored', 'verified', 'deleted') THEN
    RAISE EXCEPTION 'mark_media_object_state: invalid p_state %', p_state;
  END IF;

  UPDATE public.media_objects SET
    lifecycle_state = p_state,
    sha256          = coalesce(p_sha256, sha256),
    etag            = coalesce(p_etag, etag),
    size_bytes      = coalesce(p_size, size_bytes),
    updated_at      = now()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'mark_media_object_state: media object % not found', p_id;
  END IF;
END;
$$;

REVOKE ALL   ON FUNCTION public.mark_media_object_state(uuid, text, text, text, bigint) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.mark_media_object_state(uuid, text, text, text, bigint) TO scan_worker;

-- ═══════════════════════════════════════════════════════════════════════════
-- room_files: canonical home for new versioned artifacts (artifact kind →
-- {object_id, version} in media_objects) and verify-stage output.
-- room_scans.model_url_gltf stays legacy until the W3 originals cutover.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.room_files
  ADD COLUMN IF NOT EXISTS artifacts jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS verify    jsonb;

COMMENT ON COLUMN public.room_files.artifacts IS
  '00489: artifact kind -> {object_id, version} pointing at public.media_objects. The ruled canonical home for new versioned artifacts (mesh GLB, .spz splat, renders); room_scans.model_url_gltf stays legacy until the W3 originals cutover (plan §2 R4).';
COMMENT ON COLUMN public.room_files.verify IS
  '00489: verify-stage output (residuals, QA notes) landed by the Modal CPU-only verify stage via scan_worker_update_room_file (00490). NULL until the stage has run for this room_files version.';
