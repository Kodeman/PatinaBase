-- ═══════════════════════════════════════════════════════════════════════════
-- Fixture proof for migration 00521 (svc_media shape reconciliation)
--
-- Runs entirely inside ONE transaction that ROLLBACKs, leaving zero residue on
-- the local database. Proves, in order:
--   1. REVERSE reshapes a snake_case local svc_media into prod's EXACT Prisma
--      casing (PascalCase tables/enum-types, camelCase columns, Prisma index/
--      constraint names) — mirroring the audited Strata catalog. The 5 unique
--      keys are then converted from CONSTRAINTS to bare unique INDEXES so the
--      fixture matches prod's actual structure and exercises 00521's
--      index-rename branch (the real prod path).
--   2. FORWARD 00521 renames everything back to snake_case; every object is
--      snake_case and no Prisma-shaped remnant survives.
--   3. IDEMPOTENCE: a second FORWARD run is a clean no-op.
--   4. REPRESENTATIVE QUERIES the regenerated Prisma Client emits (snake_case
--      column/table/enum references) resolve against the reconciled shape.
--
-- Usage (local only):
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/svc_media/shape_reconciliation_fixture_proof.sql
--   (SUPABASE_DB_URL local default: postgresql://postgres:postgres@127.0.0.1:54322/postgres)
--
-- NOTE ON PATHS: this script \i's the migration and its reverse by
-- repo-relative path; run it from the repo root (psql resolves \i relative to
-- the current working directory).
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
BEGIN;

-- ── Precondition: local starts snake_case ────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('svc_media.media_assets') IS NULL
     OR to_regclass('svc_media."MediaAsset"') IS NOT NULL THEN
    RAISE EXCEPTION 'FIXTURE PRECONDITION FAILED: local svc_media is not in the expected snake_case baseline';
  END IF;
  RAISE NOTICE 'STEP 0 ok: local svc_media is snake_case baseline.';
END $$;

-- Snapshot the baseline object inventory for a round-trip identity check later.
CREATE TEMP TABLE _fx_baseline ON COMMIT DROP AS
SELECT 'table'::text AS kind, c.relname AS name
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'svc_media' AND c.relkind IN ('r','i')
UNION ALL
SELECT 'type', t.typname
FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'svc_media' AND t.typtype = 'e'
UNION ALL
SELECT 'column', c.relname || '.' || a.attname
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
WHERE n.nspname = 'svc_media' AND c.relkind = 'r';

-- ── STEP 1 — reshape local → prod Prisma casing (the reverse migration) ───────
\i docs/engineering/svc-media-shape-reconciliation.reverse.sql

-- Convert the 5 unique-key CONSTRAINTS (local origin) into bare unique INDEXES
-- so the fixture faithfully matches prod (where they are bare indexes) and
-- 00521's Section-E index branch is exercised. Names are already the Prisma
-- names after the reverse step above.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('MediaAsset_rawKey_key',            'MediaAsset',    'rawKey'),
      ('AssetRendition_key_key',           'AssetRendition','key'),
      ('ThreeDAsset_assetId_key',          'ThreeDAsset',   'assetId'),
      ('UploadSession_targetKey_key',      'UploadSession', 'targetKey'),
      ('UploadSession_idempotencyKey_key', 'UploadSession', 'idempotencyKey')
    ) AS m(con_name, tbl, col)
  LOOP
    IF EXISTS (SELECT 1 FROM pg_constraint
               WHERE connamespace = 'svc_media'::regnamespace AND conname = r.con_name) THEN
      EXECUTE format('ALTER TABLE svc_media.%I DROP CONSTRAINT %I', r.tbl, r.con_name);
      EXECUTE format('CREATE UNIQUE INDEX %I ON svc_media.%I (%I)', r.con_name, r.tbl, r.col);
    END IF;
  END LOOP;
END $$;

-- Assert we are now in prod Prisma shape.
DO $$
BEGIN
  IF to_regclass('svc_media."MediaAsset"') IS NULL
     OR to_regclass('svc_media.media_assets') IS NOT NULL THEN
    RAISE EXCEPTION 'STEP 1 FAILED: reverse did not produce PascalCase tables';
  END IF;
  IF to_regtype('svc_media."AssetKind"') IS NULL
     OR to_regtype('svc_media.asset_kind') IS NOT NULL THEN
    RAISE EXCEPTION 'STEP 1 FAILED: reverse did not produce PascalCase enum types';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute
                 WHERE attrelid = 'svc_media."MediaAsset"'::regclass
                   AND attname = 'rawKey' AND NOT attisdropped) THEN
    RAISE EXCEPTION 'STEP 1 FAILED: reverse did not produce camelCase columns (rawKey absent)';
  END IF;
  -- unique keys are now bare indexes, not constraints (prod-faithful)
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE connamespace = 'svc_media'::regnamespace AND conname = 'MediaAsset_rawKey_key') THEN
    RAISE EXCEPTION 'STEP 1 FAILED: MediaAsset_rawKey_key is still a constraint, expected bare index';
  END IF;
  IF to_regclass('svc_media."MediaAsset_rawKey_key"') IS NULL THEN
    RAISE EXCEPTION 'STEP 1 FAILED: MediaAsset_rawKey_key bare unique index missing';
  END IF;
  RAISE NOTICE 'STEP 1 ok: local svc_media reshaped to prod Prisma casing (bare unique indexes).';
END $$;

-- ── STEP 2 — forward 00521 renames back to snake_case ─────────────────────────
\i supabase/migrations/00521_svc_media_shape_reconciliation.sql

DO $$
DECLARE
  v_bad text;
BEGIN
  -- no Prisma-shaped remnant of any kind (tables, types, columns, indexes, constraints)
  SELECT string_agg(x, ', ') INTO v_bad FROM (
    SELECT c.relname AS x FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='svc_media' AND c.relname ~ '[A-Z]'
    UNION ALL
    SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='svc_media' AND t.typtype='e' AND t.typname ~ '[A-Z]'
    UNION ALL
    SELECT c.relname||'.'||a.attname
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    WHERE n.nspname='svc_media' AND c.relkind='r' AND a.attname ~ '[A-Z]'
    UNION ALL
    SELECT con.conname FROM pg_constraint con
    WHERE con.connamespace='svc_media'::regnamespace AND con.conname ~ '[A-Z]'
  ) q;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'STEP 2 FAILED: Prisma-shaped (upper-case) svc_media objects remain: %', v_bad;
  END IF;
  RAISE NOTICE 'STEP 2 ok: 00521 produced a fully snake_case svc_media (zero upper-case objects).';
END $$;

-- Round-trip identity: the reconciled object inventory equals the baseline.
DO $$
DECLARE
  v_diff text;
BEGIN
  WITH cur AS (
    SELECT 'table'::text AS kind, c.relname AS name
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='svc_media' AND c.relkind IN ('r','i')
    UNION ALL
    SELECT 'type', t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='svc_media' AND t.typtype='e'
    UNION ALL
    SELECT 'column', c.relname||'.'||a.attname
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    WHERE n.nspname='svc_media' AND c.relkind='r'
  )
  SELECT string_agg(kind||':'||name||' ('||src||')', ', ') INTO v_diff FROM (
    SELECT kind, name, 'only in baseline' AS src FROM _fx_baseline
    EXCEPT ALL SELECT kind, name, 'only in baseline' FROM cur
    UNION ALL
    SELECT kind, name, 'only after round-trip' AS src FROM cur
    EXCEPT ALL SELECT kind, name, 'only after round-trip' FROM _fx_baseline
  ) d;
  IF v_diff IS NOT NULL THEN
    RAISE EXCEPTION 'STEP 2 ROUND-TRIP MISMATCH (reverse→forward is not identity on names): %', v_diff;
  END IF;
  RAISE NOTICE 'STEP 2 ok: reverse→forward round-trips to the exact baseline object inventory.';
END $$;

-- ── STEP 3 — idempotence: a second forward run is a clean no-op ───────────────
\i supabase/migrations/00521_svc_media_shape_reconciliation.sql
DO $$
BEGIN
  RAISE NOTICE 'STEP 3 ok: second 00521 run completed without error (idempotent no-op).';
END $$;

-- ── STEP 4 — representative Prisma-Client query shapes resolve ────────────────
-- Column/table/enum references matching what the regenerated snake_case client
-- emits (schema selected via ?schema=svc_media). Resolution (not row content)
-- is what we assert.
DO $$
DECLARE
  v_id text;
BEGIN
  -- read path: findMany-shaped projection incl. the later-added project_id
  PERFORM id, raw_key, scan_status, size_bytes, mime_type, created_at, updated_at, project_id
  FROM svc_media.media_assets WHERE status = 'READY'::svc_media.asset_status LIMIT 1;

  -- join path: renditions → assets on the renamed FK column
  PERFORM r.id, r.asset_id, r.size_bytes, a.raw_key
  FROM svc_media.asset_renditions r
  JOIN svc_media.media_assets a ON a.id = r.asset_id LIMIT 1;

  -- 3D + jobs + uploads + licenses column resolution
  PERFORM asset_id, glb_key, tri_count, width_m, ar_ready FROM svc_media.three_d_assets LIMIT 1;
  PERFORM asset_id, max_retries, queued_at, worker_id FROM svc_media.process_jobs LIMIT 1;
  PERFORM target_key, idempotency_key, expires_at, user_id FROM svc_media.upload_sessions LIMIT 1;
  PERFORM asset_ids, license_type, proof_doc_key, created_by FROM svc_media.license_records LIMIT 1;

  -- outbox column resolution (camelCase → snake reconciled)
  PERFORM id, created_at, published_at, retry_count, last_error FROM svc_media.outbox_events LIMIT 1;

  -- write path: insert resolves snake columns + enum values, then rolls back
  INSERT INTO svc_media.media_assets (kind, raw_key, scan_status, status)
  VALUES ('IMAGE'::svc_media.asset_kind, '_fx_probe_key_', 'CLEAN'::svc_media.scan_status,
          'READY'::svc_media.asset_status)
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'STEP 4 FAILED: insert into reconciled media_assets did not return an id';
  END IF;

  RAISE NOTICE 'STEP 4 ok: representative snake_case read/join/write query shapes resolve.';
END $$;

DO $$ BEGIN RAISE NOTICE '✅ ALL STEPS PASSED — 00521 forward/reverse/idempotence/query-resolution proven.'; END $$;

ROLLBACK;
