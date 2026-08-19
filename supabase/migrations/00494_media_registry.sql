-- ═══════════════════════════════════════════════════════════════════════════
-- 00494 — Phase 2 media registry (Cloudflare/media backfill program · B-W2)
--
-- Band: drawn from 00494–00497, reserved for Phase 2 in
-- docs/engineering/migration-number-reservations.md. That doc is updated in
-- the same commit as this file per its own discipline rule 5.
--
-- KODY RULED: this table is a NEW, fully separate registry from the Rendered
-- Room v2 scan pipeline's media_objects kernel (00489). Nothing here
-- references public.media_objects, public.room_scans, public.room_files,
-- scan_worker, scan_reader, or any other object that program owns, and
-- nothing in this file is svc_* — the registry is public-schema-only per the
-- workstream's hard rule.
--
-- Scope: public.media_registry — the general-purpose media registry for the
-- Phase 2 media service (portal uploads, catalog imagery, deliverables,
-- third-party sourced assets). Identity is (bucket, object_key, version):
-- unlike 00489's upsert-and-bump-version shape, a caller here states the
-- version it means to write, and re-stating the same (bucket, object_key,
-- version) is a write-once identity — see register_media_entry's write-once
-- checks below. The forward-only lifecycle state machine and the
-- write-once-identity discipline are the same SHAPE 00489 uses
-- (pending -> stored -> verified, deleted terminal, restating the current
-- state is idempotent) but implemented independently here — no shared
-- function, trigger, or table with that program's objects.
--
-- RLS: subject-arm dispatch, fail-closed. SELECT is granted to `authenticated`
-- and then narrowed by a policy that only admits a row when subject_type is
-- one of exactly two known arms and the underlying domain row is visible to
-- the CALLER under that domain table's own RLS (the 00337/00489 delegation
-- shape — the EXISTS runs under the caller's row security, not a bare
-- existence check, so it cannot repeat the mood-board existence-only bug
-- class). A NULL subject_type/subject_id, or a subject_type that is not one
-- of the two arms below, resolves to invisible — there is no catch-all
-- "public" branch. Future arms are added by widening the policy in a later
-- migration, never by loosening this one's default.
--
-- Writes: no INSERT/UPDATE/DELETE policy exists. All writes go through the
-- three SECURITY DEFINER RPCs below, granted to service_role only — portals
-- reach this table through the media service, not directly.
--
-- Adds GRANT/REVOKE and a new table → regenerate seed/00-legacy-grants.sql.
--
-- ─── Adversarial review fix-forwards (in-place edit — unapplied anywhere) ───
--   W-1  legal_hold/retention_until now block a HARD DELETE too (new BEFORE
--        DELETE trigger, §2b) and retention_until now blocks the soft
--        →'deleted' transition the same way legal_hold already did (§2).
--        gc_marked_at/gc_confirmed_at stay unused until B-W7 (GC wave).
--   W-2  legal_hold/legal_hold_reason carved out of service_role's column-
--        level UPDATE grant (§5b) — only mark_media_entry_legal_hold (a
--        SECURITY DEFINER RPC, unaffected by this REVOKE since it runs as
--        the function owner) may flip them; a direct UPDATE outside that
--        RPC now fails ACL, not merely convention.
--   W-3  DECIDED: subject_type/subject_id are now fixed at FIRST
--        registration, full stop — a later register_media_entry call may
--        only restate them exactly (including NULL=NULL), never fill them
--        from NULL. The alternative (documenting fill-from-NULL as an
--        accepted service_role-only retro-publication primitive) was
--        rejected: nothing about this registry's use case needs a NULL-
--        subject row to be retro-bindable, and the capability is a live
--        "retro-publish a NULL-subject row onto any published product"
--        primitive for as long as it exists. See §3.
--   W-6  register_media_entry's FOR UPDATE locked nothing when no row
--        existed yet, so two concurrent first-registrations of the same
--        identity could both take the INSERT branch and the loser got a
--        raw 23505 instead of a P0430-shaped refusal. Fixed with
--        pg_advisory_xact_lock keyed on the (bucket, object_key, version)
--        identity, acquired BEFORE the SELECT (§3).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. media_registry ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.media_registry (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version               int  NOT NULL DEFAULT 1,

  bucket                text NOT NULL,
  bucket_class          text NOT NULL
                          CHECK (bucket_class IN ('originals', 'artifacts')),
  object_key            text NOT NULL,

  sha256                text,
  etag                  text,
  declared_mime         text,
  observed_mime         text,
  declared_size_bytes   bigint,
  observed_size_bytes   bigint,
  width                 int,
  height                int,

  access_class          text NOT NULL
                          CHECK (access_class IN (
                            'public_catalog', 'authenticated_project', 'guest_share',
                            'released_deliverable', 'third_party_source'
                          )),
  lifecycle_state       text NOT NULL DEFAULT 'pending'
                          CHECK (lifecycle_state IN ('pending', 'stored', 'verified', 'deleted')),

  legal_hold            boolean NOT NULL DEFAULT false,
  legal_hold_reason     text,
  retention_until       timestamptz,

  -- Subject dispatch key for RLS below. Deliberately NOT a CHECK-constrained
  -- enum: new arms are added by widening the policy, and an unrecognized
  -- value here already resolves to invisible by construction — a CHECK
  -- constraint would only add a migration in the way of that widening.
  subject_type          text,
  subject_id            uuid,

  provenance            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            uuid,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  gc_marked_at          timestamptz,
  gc_confirmed_at       timestamptz,
  deleted_at            timestamptz,

  CONSTRAINT media_registry_bucket_key_version_uniq UNIQUE (bucket, object_key, version)
);

COMMENT ON TABLE public.media_registry IS
  '00494: Phase 2 general-purpose media registry. Separate from public.media_objects (00489, Rendered Room v2 scan-scoped kernel) — no shared objects. Written only via register_media_entry / mark_media_entry_state / mark_media_entry_legal_hold (SECURITY DEFINER, service_role only).';
COMMENT ON COLUMN public.media_registry.subject_type IS
  '00494: RLS dispatch key. Exactly two arms recognized today: ''project'' and ''product'' (see media_registry_select). NULL or any other value is invisible to authenticated callers by construction, not by an explicit deny branch.';
COMMENT ON COLUMN public.media_registry.legal_hold IS
  '00494: when true, the lifecycle transition trigger refuses any move to ''deleted'' regardless of caller. Set only via mark_media_entry_legal_hold.';

CREATE INDEX IF NOT EXISTS idx_media_registry_subject
  ON public.media_registry (subject_type, subject_id) WHERE subject_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_media_registry_lifecycle_state
  ON public.media_registry (lifecycle_state);
CREATE INDEX IF NOT EXISTS idx_media_registry_legal_hold
  ON public.media_registry (id) WHERE legal_hold;

-- ─── RLS: subject-arm dispatch, fail-closed ─────────────────────────────────
ALTER TABLE public.media_registry ENABLE ROW LEVEL SECURITY;

-- Each EXISTS subquery runs under the CALLER's own row security on the
-- domain table (projects / products) — it proves the caller can actually see
-- that row, not merely that the row exists. subject_type='project' delegates
-- to projects' own RLS (00168/00316: participant, lead designer, or studio
-- co-member). subject_type='product' mirrors edge_catalog_products' (00481)
-- predicate: layer='catalog' AND status='published' — the same "approved
-- public catalog projection" boundary, so a media_registry row bound to an
-- unpublished or personal-library product stays invisible even though
-- `products` itself has broader RLS than that view exposes.
DROP POLICY IF EXISTS media_registry_select ON public.media_registry;
CREATE POLICY media_registry_select ON public.media_registry
  FOR SELECT TO authenticated
  USING (
    (
      subject_type = 'project'
      AND subject_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = media_registry.subject_id)
    )
    OR (
      subject_type = 'product'
      AND subject_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.products p
         WHERE p.id = media_registry.subject_id
           AND p.layer = 'catalog'
           AND p.status = 'published'
      )
    )
  );

-- No INSERT/UPDATE/DELETE policy — writes are through the DEFINER RPCs only.
GRANT SELECT ON public.media_registry TO authenticated;
GRANT ALL    ON public.media_registry TO service_role;

-- Explicit negative space, written as REVOKEs rather than assumed from
-- creation-time defaults (Supabase flipped those 2026-05-30) so prod
-- (pre-flip, legacy-granted) and a fresh local stack land on the same
-- posture. anon reaches nothing; authenticated reaches SELECT and only
-- SELECT — the RLS policy above is the real filter, this GRANT surface is
-- the boundary it filters within.
REVOKE ALL ON public.media_registry FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.media_registry FROM authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Lifecycle guard trigger — forward-only, legal-hold blocks deletion.
--
-- Lives on the table (BEFORE UPDATE), not only in the RPC below, so the
-- invariant holds for every writer including a direct service_role UPDATE —
-- the same "guard on the table, not only in the door" shape 00489 uses for
-- media_objects (independent implementation; no shared function).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.media_registry_guard_lifecycle_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_rank CONSTANT jsonb := '{"pending":0,"stored":1,"verified":2}'::jsonb;
BEGIN
  IF NEW.lifecycle_state = OLD.lifecycle_state THEN
    RETURN NEW;   -- restating the current state is idempotent, not an error
  END IF;

  IF OLD.lifecycle_state = 'deleted' THEN
    RAISE EXCEPTION
      'media_registry: % is deleted; deleted is terminal (refused move to %)',
      OLD.id, NEW.lifecycle_state
      USING ERRCODE = 'P0420';
  END IF;

  IF NEW.lifecycle_state = 'deleted' THEN
    IF OLD.legal_hold THEN
      RAISE EXCEPTION
        'media_registry: % is under legal hold (%); deletion refused',
        OLD.id, COALESCE(OLD.legal_hold_reason, 'no reason recorded')
        USING ERRCODE = 'P0421';
    END IF;
    -- W-1: retention_until is a second, independent hold — a row can be
    -- under retention without ever having been legal_hold'd (e.g. a
    -- released_deliverable with a compliance retention window).
    IF OLD.retention_until IS NOT NULL AND OLD.retention_until > now() THEN
      RAISE EXCEPTION
        'media_registry: % is under retention until %; deletion refused',
        OLD.id, OLD.retention_until
        USING ERRCODE = 'P0425';
    END IF;
    RETURN NEW;   -- deleted is reachable from any non-deleted state once hold/retention clear
  END IF;

  IF NOT (v_rank ? OLD.lifecycle_state) OR NOT (v_rank ? NEW.lifecycle_state) THEN
    RAISE EXCEPTION
      'media_registry: unrecognized lifecycle_state in transition % -> %',
      OLD.lifecycle_state, NEW.lifecycle_state;
  END IF;

  IF (v_rank ->> NEW.lifecycle_state)::int < (v_rank ->> OLD.lifecycle_state)::int THEN
    RAISE EXCEPTION
      'media_registry: lifecycle_state is forward-only (refused % -> %)',
      OLD.lifecycle_state, NEW.lifecycle_state
      USING ERRCODE = 'P0422';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS media_registry_guard_lifecycle_transition_trg ON public.media_registry;
CREATE TRIGGER media_registry_guard_lifecycle_transition_trg
  BEFORE UPDATE OF lifecycle_state ON public.media_registry
  FOR EACH ROW
  WHEN (NEW.lifecycle_state IS DISTINCT FROM OLD.lifecycle_state)
  EXECUTE FUNCTION public.media_registry_guard_lifecycle_transition();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2b. Hard-delete guard (W-1) — legal_hold/retention_until must survive a
--     real SQL DELETE, not only the soft →'deleted' lifecycle transition
--     the trigger above covers. Without this, legal_hold only protected the
--     RPC path; a service_role connection running a bare DELETE bypassed it
--     entirely (service_role holds DELETE via the blanket GRANT ALL below).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.media_registry_guard_hard_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.legal_hold THEN
    RAISE EXCEPTION
      'media_registry: % is under legal hold (%); hard DELETE refused',
      OLD.id, COALESCE(OLD.legal_hold_reason, 'no reason recorded')
      USING ERRCODE = 'P0423';
  END IF;
  IF OLD.retention_until IS NOT NULL AND OLD.retention_until > now() THEN
    RAISE EXCEPTION
      'media_registry: % is under retention until %; hard DELETE refused',
      OLD.id, OLD.retention_until
      USING ERRCODE = 'P0424';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS media_registry_guard_hard_delete_trg ON public.media_registry;
CREATE TRIGGER media_registry_guard_hard_delete_trg
  BEFORE DELETE ON public.media_registry
  FOR EACH ROW
  EXECUTE FUNCTION public.media_registry_guard_hard_delete();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. register_media_entry — write-once identity on (bucket, object_key,
--    version). A fresh identity inserts at lifecycle_state='pending'. A
--    re-register of the SAME identity may only fill a NULL field or restate
--    an already-set one — it can never silently swap sha256, bucket_class,
--    access_class, subject_type, or subject_id for a different value.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.register_media_entry(
  p_bucket              text,
  p_bucket_class        text,
  p_object_key          text,
  p_access_class        text,
  p_version             int     DEFAULT 1,
  p_sha256              text    DEFAULT NULL,
  p_etag                text    DEFAULT NULL,
  p_declared_mime       text    DEFAULT NULL,
  p_declared_size_bytes bigint  DEFAULT NULL,
  p_width               int     DEFAULT NULL,
  p_height              int     DEFAULT NULL,
  p_subject_type        text    DEFAULT NULL,
  p_subject_id          uuid    DEFAULT NULL,
  p_provenance          jsonb   DEFAULT '{}'::jsonb,
  p_created_by          uuid    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id       uuid;
  v_existing public.media_registry;
BEGIN
  IF p_bucket IS NULL OR btrim(p_bucket) = '' THEN
    RAISE EXCEPTION 'register_media_entry: p_bucket must be non-empty';
  END IF;
  IF p_bucket_class NOT IN ('originals', 'artifacts') THEN
    RAISE EXCEPTION 'register_media_entry: invalid p_bucket_class %', p_bucket_class;
  END IF;
  IF p_object_key IS NULL OR btrim(p_object_key) = '' THEN
    RAISE EXCEPTION 'register_media_entry: p_object_key must be non-empty';
  END IF;
  IF p_access_class NOT IN (
    'public_catalog', 'authenticated_project', 'guest_share',
    'released_deliverable', 'third_party_source'
  ) THEN
    RAISE EXCEPTION 'register_media_entry: invalid p_access_class %', p_access_class;
  END IF;
  IF p_version IS NULL OR p_version < 1 THEN
    RAISE EXCEPTION 'register_media_entry: p_version must be >= 1';
  END IF;

  -- W-6: an advisory lock keyed on the identity, acquired BEFORE the SELECT,
  -- serializes ALL concurrent register_media_entry calls for this identity —
  -- including the case where no row exists yet, which a bare `FOR UPDATE`
  -- cannot lock (there is no row to lock). Without this, two concurrent
  -- first-registrations of the same (bucket, object_key, version) could both
  -- reach the INSERT below; the loser got a raw 23505 unique_violation
  -- instead of this function's own P0430-shaped refusal.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_bucket || '/' || p_object_key || '/' || p_version::text, 0)
  );

  SELECT * INTO v_existing
    FROM public.media_registry
   WHERE bucket = p_bucket AND object_key = p_object_key AND version = p_version
     FOR UPDATE;

  IF FOUND THEN
    IF v_existing.sha256 IS NOT NULL AND p_sha256 IS NOT NULL
       AND v_existing.sha256 IS DISTINCT FROM p_sha256 THEN
      RAISE EXCEPTION
        'register_media_entry: sha256 is write-once for %/%  v%  (already %, refusing %)',
        p_bucket, p_object_key, p_version, v_existing.sha256, p_sha256
        USING ERRCODE = 'P0430';
    END IF;
    IF v_existing.bucket_class IS DISTINCT FROM p_bucket_class THEN
      RAISE EXCEPTION
        'register_media_entry: bucket_class is write-once for %/%  v%  (already %, refusing %)',
        p_bucket, p_object_key, p_version, v_existing.bucket_class, p_bucket_class
        USING ERRCODE = 'P0430';
    END IF;
    IF v_existing.access_class IS DISTINCT FROM p_access_class THEN
      RAISE EXCEPTION
        'register_media_entry: access_class is write-once for %/%  v%  (already %, refusing %)',
        p_bucket, p_object_key, p_version, v_existing.access_class, p_access_class
        USING ERRCODE = 'P0430';
    END IF;
    -- W-3 (DECIDED — see header): subject_type/subject_id are fixed at
    -- FIRST registration. A later call may only restate them EXACTLY,
    -- including NULL=NULL — filling them in from NULL is refused, not
    -- silently allowed. Without this, whoever holds the register_media_entry
    -- door (service_role) could take a NULL-subject row registered for one
    -- purpose and retro-bind it onto ANY published product or visible
    -- project after the fact, moving it into media_registry_select's
    -- visible set with no record that the binding happened later than
    -- creation.
    IF v_existing.subject_type IS DISTINCT FROM p_subject_type
       OR v_existing.subject_id IS DISTINCT FROM p_subject_id THEN
      RAISE EXCEPTION
        'register_media_entry: subject_type/subject_id are fixed at first registration for %/%  v%  (already %/%, refusing %/%)',
        p_bucket, p_object_key, p_version,
        v_existing.subject_type, v_existing.subject_id, p_subject_type, p_subject_id
        USING ERRCODE = 'P0430';
    END IF;

    UPDATE public.media_registry SET
      sha256              = COALESCE(v_existing.sha256, p_sha256),
      etag                = COALESCE(p_etag, v_existing.etag),
      declared_mime       = COALESCE(p_declared_mime, v_existing.declared_mime),
      declared_size_bytes = COALESCE(p_declared_size_bytes, v_existing.declared_size_bytes),
      width               = COALESCE(p_width, v_existing.width),
      height              = COALESCE(p_height, v_existing.height),
      provenance          = COALESCE(v_existing.provenance, '{}'::jsonb) || COALESCE(p_provenance, '{}'::jsonb),
      created_by          = COALESCE(v_existing.created_by, p_created_by),
      updated_at          = now()
    WHERE id = v_existing.id
    RETURNING id INTO v_id;

    RETURN v_id;
  END IF;

  INSERT INTO public.media_registry (
    bucket, bucket_class, object_key, version,
    sha256, etag, declared_mime, declared_size_bytes, width, height,
    access_class, lifecycle_state, subject_type, subject_id, provenance, created_by
  ) VALUES (
    p_bucket, p_bucket_class, p_object_key, p_version,
    p_sha256, p_etag, p_declared_mime, p_declared_size_bytes, p_width, p_height,
    p_access_class, 'pending', p_subject_type, p_subject_id, COALESCE(p_provenance, '{}'::jsonb), p_created_by
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_media_entry(
  text, text, text, text, int, text, text, text, bigint, int, int, text, uuid, jsonb, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_media_entry(
  text, text, text, text, int, text, text, text, bigint, int, int, text, uuid, jsonb, uuid
) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. mark_media_entry_state — advance lifecycle_state; optionally land the
--    checksum/mime/size the confirm step observed. The forward-only /
--    legal-hold guard lives on the trigger above, not re-validated here.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.mark_media_entry_state(
  p_id                   uuid,
  p_state                text,
  p_observed_mime        text   DEFAULT NULL,
  p_observed_size_bytes  bigint DEFAULT NULL,
  p_etag                 text   DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current text;
BEGIN
  IF p_state NOT IN ('pending', 'stored', 'verified', 'deleted') THEN
    RAISE EXCEPTION 'mark_media_entry_state: invalid p_state %', p_state;
  END IF;

  SELECT lifecycle_state INTO v_current
    FROM public.media_registry WHERE id = p_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'mark_media_entry_state: media_registry entry % not found', p_id;
  END IF;

  UPDATE public.media_registry SET
    lifecycle_state      = p_state,
    observed_mime        = COALESCE(p_observed_mime, observed_mime),
    observed_size_bytes  = COALESCE(p_observed_size_bytes, observed_size_bytes),
    etag                 = COALESCE(p_etag, etag),
    deleted_at           = CASE WHEN p_state = 'deleted' THEN now() ELSE deleted_at END,
    updated_at           = now()
  WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_media_entry_state(uuid, text, text, bigint, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_media_entry_state(uuid, text, text, bigint, text)
  TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. mark_media_entry_legal_hold — the only door that may set legal_hold.
--    Placing a hold requires a reason; lifting one clears it.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.mark_media_entry_legal_hold(
  p_id     uuid,
  p_hold   boolean,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_hold IS NULL THEN
    RAISE EXCEPTION 'mark_media_entry_legal_hold: p_hold must not be NULL';
  END IF;
  IF p_hold AND (p_reason IS NULL OR btrim(p_reason) = '') THEN
    RAISE EXCEPTION 'mark_media_entry_legal_hold: p_reason is required when placing a hold';
  END IF;

  UPDATE public.media_registry SET
    legal_hold        = p_hold,
    legal_hold_reason = CASE WHEN p_hold THEN p_reason ELSE NULL END,
    updated_at        = now()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'mark_media_entry_legal_hold: media_registry entry % not found', p_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_media_entry_legal_hold(uuid, boolean, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_media_entry_legal_hold(uuid, boolean, text)
  TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5b. W-2 — column-privilege approach: legal_hold/legal_hold_reason are
--     carved OUT of service_role's UPDATE grant. mark_media_entry_legal_hold
--     is SECURITY DEFINER and runs as the function OWNER, so this REVOKE
--     does not affect it — the RPC keeps working. What it blocks is a
--     service_role-authenticated caller running a bare
--     `UPDATE media_registry SET legal_hold = false ...` outside the RPC
--     (skipping the reason-required-when-holding check and leaving no
--     record of who lifted it, beyond whatever `updated_at` shows).
--
-- REVOKE UPDATE (whole table) then re-GRANT on every OTHER column is the
-- only way to narrow a table-level grant to column granularity in Postgres
-- — a bare `REVOKE UPDATE (col) ON t FROM role` cannot carve a hole out of
-- an existing table-level grant.
-- ═══════════════════════════════════════════════════════════════════════════
REVOKE UPDATE ON public.media_registry FROM service_role;
GRANT UPDATE (
  version, bucket, bucket_class, object_key,
  sha256, etag, declared_mime, observed_mime, declared_size_bytes, observed_size_bytes,
  width, height, access_class, lifecycle_state, retention_until,
  subject_type, subject_id, provenance, created_by,
  created_at, updated_at, gc_marked_at, gc_confirmed_at, deleted_at
) ON public.media_registry TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Verify-block — the default-priv trap. Supabase's 2026-05-30 grant-flip
--    means a fresh local stack and prod can disagree about creation-time
--    grants; this block fails the migration transaction itself rather than
--    trusting the REVOKE/GRANT statements above ran the way they read.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_fn  text;
  v_oid oid;
  v_fns text[] := ARRAY['register_media_entry', 'mark_media_entry_state', 'mark_media_entry_legal_hold'];
BEGIN
  FOREACH v_fn IN ARRAY v_fns LOOP
    SELECT p.oid INTO v_oid FROM pg_proc p
     WHERE p.proname = v_fn AND p.pronamespace = 'public'::regnamespace;
    IF v_oid IS NULL THEN
      RAISE EXCEPTION '00494 verify: function % not found', v_fn;
    END IF;
    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION '00494 verify: anon must not hold EXECUTE on %', v_fn;
    END IF;
    IF has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION '00494 verify: authenticated must not hold EXECUTE on %', v_fn;
    END IF;
    IF NOT has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION '00494 verify: service_role must hold EXECUTE on %', v_fn;
    END IF;
  END LOOP;

  IF has_table_privilege('anon', 'public.media_registry', 'SELECT') THEN
    RAISE EXCEPTION '00494 verify: anon must not hold SELECT on media_registry';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.media_registry', 'SELECT') THEN
    RAISE EXCEPTION '00494 verify: authenticated must hold SELECT on media_registry';
  END IF;
  IF has_table_privilege('authenticated', 'public.media_registry', 'INSERT')
     OR has_table_privilege('authenticated', 'public.media_registry', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.media_registry', 'DELETE') THEN
    RAISE EXCEPTION '00494 verify: authenticated must not hold write privileges on media_registry';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.media_registry', 'INSERT') THEN
    RAISE EXCEPTION '00494 verify: service_role must hold INSERT on media_registry';
  END IF;

  -- W-2: service_role must NOT hold column-level UPDATE on legal_hold /
  -- legal_hold_reason — only mark_media_entry_legal_hold's SECURITY DEFINER
  -- may touch them.
  IF has_column_privilege('service_role', 'public.media_registry', 'legal_hold', 'UPDATE') THEN
    RAISE EXCEPTION '00494 verify: service_role must not hold column UPDATE on media_registry.legal_hold';
  END IF;
  IF has_column_privilege('service_role', 'public.media_registry', 'legal_hold_reason', 'UPDATE') THEN
    RAISE EXCEPTION '00494 verify: service_role must not hold column UPDATE on media_registry.legal_hold_reason';
  END IF;
  -- ...but every other column must still be updatable, or the RPCs above
  -- (register_media_entry / mark_media_entry_state, both called as their
  -- SECURITY DEFINER owner, but still worth confirming the ACL narrowing
  -- above did not overshoot) would have nothing to write through as a
  -- direct service_role UPDATE either, silently changing this table's
  -- operational contract.
  IF NOT has_column_privilege('service_role', 'public.media_registry', 'lifecycle_state', 'UPDATE') THEN
    RAISE EXCEPTION '00494 verify: service_role must still hold column UPDATE on media_registry.lifecycle_state';
  END IF;
  IF NOT has_column_privilege('service_role', 'public.media_registry', 'retention_until', 'UPDATE') THEN
    RAISE EXCEPTION '00494 verify: service_role must still hold column UPDATE on media_registry.retention_until';
  END IF;
END $$;
