-- ═══════════════════════════════════════════════════════════════════════════
-- 00521 — svc_media shape reconciliation (Prisma-default casing → snake_case)
--
-- Intent: rename prod's Prisma-DEFAULT-shaped svc_media objects
--   (PascalCase tables "MediaAsset"…, camelCase columns "rawKey"…, PascalCase
--   enum TYPES "AssetKind"…) to the snake_case SQL shape declared by
--   services/media/prisma/schema.prisma's @map/@@map directives and created by
--   supabase/migrations/00053_svc_media_schema.sql. This UNFREEZES the prod
--   media-service deploy: a Prisma Client regenerated from source (which the
--   Dockerfile.cf build always does) queries snake_case relation/column/enum
--   names and would 42P01/42703 against prod's current PascalCase/camelCase
--   shape. See docs/engineering/svc-media-shape-reconciliation-plan.md.
--
-- Lineage: prod svc_media was shaped by an early Prisma push from a schema
--   revision that predated the @map directives (Prisma-default names), while
--   00053 (= the Prisma migrate baseline 20260803180000_existing_schema_baseline,
--   byte-identical) created the snake_case shape that LOCAL/CI/staging carry.
--   Ledger rows 00052–00054 record svc_* creation but never shaped prod's
--   svc_media to the mapped names.
--
-- Design: catalog-resolving DDL (the 00493 / fixed-00482 pattern). Every rename
--   fires ONLY when the Prisma-shaped object exists AND the snake_case target
--   does not — so this is a live rename on prod's shape and a pure NO-OP on
--   local/CI/staging (already snake_case) and on any re-run (idempotent).
--
-- Scope: NAMES ONLY. This does NOT alter column data types (prod `id` is text /
--   local is uuid; prod timestamps are timestamp(3) / local is timestamptz),
--   does NOT convert prod's bare unique INDEXES into UNIQUE CONSTRAINTS, and does
--   NOT add the updated_at triggers local carries. Those are pre-existing,
--   non-casing divergences the Prisma Client tolerates at runtime; they are
--   documented as residuals in the plan and are out of scope for the deploy
--   unfreeze.
--
-- Cross-dependency (verified safe): the only public object that reads svc_media
--   by name — public.record_project_ffe_receipt_batch — is already fully
--   catalog-resolving (COALESCE(to_regclass('svc_media."MediaAsset"'),
--   to_regclass('svc_media.media_assets')) + lower(replace(attname,'_',''))
--   column resolution) and survives this rename with no change.
--
-- Rollback: docs/engineering/svc-media-shape-reconciliation.reverse.sql
--   (snake_case → Prisma-default). Pre-staged for the coordinated window.
-- ═══════════════════════════════════════════════════════════════════════════

DO $reconcile$
DECLARE
  r          record;
  v_rel      regclass;
  v_tbl_txt  text;
BEGIN
  -- Fast exit if svc_media does not exist at all (defensive; 00053 creates it).
  IF to_regnamespace('svc_media') IS NULL THEN
    RAISE NOTICE '00521: svc_media schema absent; nothing to reconcile.';
    RETURN;
  END IF;

  -- ── Section A — enum TYPES (Prisma PascalCase → snake_case) ────────────────
  FOR r IN
    SELECT * FROM (VALUES
      ('AssetKind',        'asset_kind'),
      ('AssetRole',        'asset_role'),
      ('AssetStatus',      'asset_status'),
      ('ScanStatus',       'scan_status'),
      ('RenditionFormat',  'rendition_format'),
      ('RenditionPurpose', 'rendition_purpose'),
      ('JobType',          'job_type'),
      ('JobState',         'job_state'),
      ('UploadStatus',     'upload_status')
    ) AS m(old_name, new_name)
  LOOP
    IF to_regtype('svc_media.' || quote_ident(r.old_name)) IS NOT NULL
       AND to_regtype('svc_media.' || quote_ident(r.new_name)) IS NULL THEN
      EXECUTE format('ALTER TYPE svc_media.%I RENAME TO %I', r.old_name, r.new_name);
    END IF;
  END LOOP;

  -- ── Section B — columns (camelCase → snake_case) ───────────────────────────
  -- The table is resolved by its CURRENT name (Prisma or snake), so this fires
  -- correctly whether or not Section F below has already renamed the table.
  FOR r IN
    SELECT * FROM (VALUES
      -- MediaAsset / media_assets
      ('MediaAsset','media_assets','productId','product_id'),
      ('MediaAsset','media_assets','variantId','variant_id'),
      ('MediaAsset','media_assets','rawKey','raw_key'),
      ('MediaAsset','media_assets','sizeBytes','size_bytes'),
      ('MediaAsset','media_assets','mimeType','mime_type'),
      ('MediaAsset','media_assets','lqipKey','lqip_key'),
      ('MediaAsset','media_assets','qcIssues','qc_issues'),
      ('MediaAsset','media_assets','qcScore','qc_score'),
      ('MediaAsset','media_assets','scanStatus','scan_status'),
      ('MediaAsset','media_assets','scanResult','scan_result'),
      ('MediaAsset','media_assets','isPublic','is_public'),
      ('MediaAsset','media_assets','viewCount','view_count'),
      ('MediaAsset','media_assets','downloadCount','download_count'),
      ('MediaAsset','media_assets','sortOrder','sort_order'),
      ('MediaAsset','media_assets','uploadedBy','uploaded_by'),
      ('MediaAsset','media_assets','createdAt','created_at'),
      ('MediaAsset','media_assets','updatedAt','updated_at'),
      -- AssetRendition / asset_renditions
      ('AssetRendition','asset_renditions','assetId','asset_id'),
      ('AssetRendition','asset_renditions','sizeBytes','size_bytes'),
      ('AssetRendition','asset_renditions','createdAt','created_at'),
      -- ThreeDAsset / three_d_assets
      ('ThreeDAsset','three_d_assets','assetId','asset_id'),
      ('ThreeDAsset','three_d_assets','glbKey','glb_key'),
      ('ThreeDAsset','three_d_assets','usdzKey','usdz_key'),
      ('ThreeDAsset','three_d_assets','triCount','tri_count'),
      ('ThreeDAsset','three_d_assets','nodeCount','node_count'),
      ('ThreeDAsset','three_d_assets','materialCount','material_count'),
      ('ThreeDAsset','three_d_assets','textureCount','texture_count'),
      ('ThreeDAsset','three_d_assets','widthM','width_m'),
      ('ThreeDAsset','three_d_assets','heightM','height_m'),
      ('ThreeDAsset','three_d_assets','depthM','depth_m'),
      ('ThreeDAsset','three_d_assets','volumeM3','volume_m3'),
      ('ThreeDAsset','three_d_assets','arReady','ar_ready'),
      ('ThreeDAsset','three_d_assets','arChecks','ar_checks'),
      ('ThreeDAsset','three_d_assets','qcIssues','qc_issues'),
      ('ThreeDAsset','three_d_assets','drawCalls','draw_calls'),
      ('ThreeDAsset','three_d_assets','perfBudget','perf_budget'),
      ('ThreeDAsset','three_d_assets','createdAt','created_at'),
      ('ThreeDAsset','three_d_assets','updatedAt','updated_at'),
      -- ProcessJob / process_jobs
      ('ProcessJob','process_jobs','assetId','asset_id'),
      ('ProcessJob','process_jobs','maxRetries','max_retries'),
      ('ProcessJob','process_jobs','errorCode','error_code'),
      ('ProcessJob','process_jobs','queuedAt','queued_at'),
      ('ProcessJob','process_jobs','startedAt','started_at'),
      ('ProcessJob','process_jobs','finishedAt','finished_at'),
      ('ProcessJob','process_jobs','workerId','worker_id'),
      -- UploadSession / upload_sessions
      ('UploadSession','upload_sessions','assetId','asset_id'),
      ('UploadSession','upload_sessions','fileSize','file_size'),
      ('UploadSession','upload_sessions','mimeType','mime_type'),
      ('UploadSession','upload_sessions','parUrl','par_url'),
      ('UploadSession','upload_sessions','targetKey','target_key'),
      ('UploadSession','upload_sessions','expiresAt','expires_at'),
      ('UploadSession','upload_sessions','uploadedAt','uploaded_at'),
      ('UploadSession','upload_sessions','userId','user_id'),
      ('UploadSession','upload_sessions','productId','product_id'),
      ('UploadSession','upload_sessions','variantId','variant_id'),
      ('UploadSession','upload_sessions','idempotencyKey','idempotency_key'),
      ('UploadSession','upload_sessions','createdAt','created_at'),
      ('UploadSession','upload_sessions','updatedAt','updated_at'),
      -- LicenseRecord / license_records
      ('LicenseRecord','license_records','assetIds','asset_ids'),
      ('LicenseRecord','license_records','licenseType','license_type'),
      ('LicenseRecord','license_records','sourceVendor','source_vendor'),
      ('LicenseRecord','license_records','sourceVendorId','source_vendor_id'),
      ('LicenseRecord','license_records','usageScope','usage_scope'),
      ('LicenseRecord','license_records','expiresAt','expires_at'),
      ('LicenseRecord','license_records','proofDocKey','proof_doc_key'),
      ('LicenseRecord','license_records','alertsSent','alerts_sent'),
      ('LicenseRecord','license_records','createdBy','created_by'),
      ('LicenseRecord','license_records','createdAt','created_at'),
      ('LicenseRecord','license_records','updatedAt','updated_at'),
      -- outbox_events (table already snake; only columns camelCase)
      ('outbox_events','outbox_events','createdAt','created_at'),
      ('outbox_events','outbox_events','publishedAt','published_at'),
      ('outbox_events','outbox_events','retryCount','retry_count'),
      ('outbox_events','outbox_events','lastError','last_error')
    ) AS m(prisma_tbl, snake_tbl, old_col, new_col)
  LOOP
    v_rel := COALESCE(
      to_regclass('svc_media.' || quote_ident(r.prisma_tbl)),
      to_regclass('svc_media.' || quote_ident(r.snake_tbl))
    );
    CONTINUE WHEN v_rel IS NULL;
    -- rename only when the camelCase column is present and the snake target is not
    IF EXISTS (
         SELECT 1 FROM pg_attribute
         WHERE attrelid = v_rel AND attname = r.old_col AND attnum > 0 AND NOT attisdropped
       )
       AND NOT EXISTS (
         SELECT 1 FROM pg_attribute
         WHERE attrelid = v_rel AND attname = r.new_col AND attnum > 0 AND NOT attisdropped
       ) THEN
      EXECUTE format('ALTER TABLE %s RENAME COLUMN %I TO %I', v_rel::text, r.old_col, r.new_col);
    END IF;
  END LOOP;

  -- ── Section C — plain (non-unique, non-constraint) indexes ─────────────────
  FOR r IN
    SELECT * FROM (VALUES
      ('MediaAsset_productId_idx',        'idx_media_product'),
      ('MediaAsset_variantId_idx',        'idx_media_variant'),
      ('MediaAsset_kind_status_idx',      'idx_media_kind_status'),
      ('MediaAsset_phash_idx',            'idx_media_phash'),
      ('MediaAsset_createdAt_idx',        'idx_media_created'),
      ('MediaAsset_uploadedBy_idx',       'idx_media_uploaded_by'),
      ('AssetRendition_assetId_idx',      'idx_renditions_asset'),
      ('AssetRendition_purpose_idx',      'idx_renditions_purpose'),
      ('ProcessJob_assetId_state_idx',    'idx_jobs_asset_state'),
      ('ProcessJob_type_state_idx',       'idx_jobs_type_state'),
      ('ProcessJob_state_queuedAt_idx',   'idx_jobs_state_queued'),
      ('ProcessJob_workerId_idx',         'idx_jobs_worker'),
      ('UploadSession_userId_idx',        'idx_uploads_user'),
      ('UploadSession_status_idx',        'idx_uploads_status'),
      ('UploadSession_expiresAt_idx',     'idx_uploads_expires'),
      ('LicenseRecord_expiresAt_idx',     'idx_licenses_expires'),
      ('LicenseRecord_licenseType_idx',   'idx_licenses_type'),
      ('outbox_events_createdAt_idx',     'idx_outbox_created'),
      ('outbox_events_type_published_idx','idx_outbox_type_published')
    ) AS m(old_name, new_name)
  LOOP
    IF to_regclass('svc_media.' || quote_ident(r.old_name)) IS NOT NULL
       AND to_regclass('svc_media.' || quote_ident(r.new_name)) IS NULL THEN
      EXECUTE format('ALTER INDEX svc_media.%I RENAME TO %I', r.old_name, r.new_name);
    END IF;
  END LOOP;

  -- ── Section D — PK / FK constraints ────────────────────────────────────────
  -- Resolve the owning table from the constraint itself (conrelid), so the
  -- current table name (Prisma or snake) is irrelevant.
  FOR r IN
    SELECT * FROM (VALUES
      ('MediaAsset_pkey',              'media_assets_pkey'),
      ('AssetRendition_pkey',          'asset_renditions_pkey'),
      ('AssetRendition_assetId_fkey',  'asset_renditions_asset_id_fkey'),
      ('ThreeDAsset_pkey',             'three_d_assets_pkey'),
      ('ThreeDAsset_assetId_fkey',     'three_d_assets_asset_id_fkey'),
      ('ProcessJob_pkey',              'process_jobs_pkey'),
      ('ProcessJob_assetId_fkey',      'process_jobs_asset_id_fkey'),
      ('UploadSession_pkey',           'upload_sessions_pkey'),
      ('LicenseRecord_pkey',           'license_records_pkey')
    ) AS m(old_name, new_name)
  LOOP
    IF EXISTS (SELECT 1 FROM pg_constraint
               WHERE connamespace = 'svc_media'::regnamespace AND conname = r.old_name)
       AND NOT EXISTS (SELECT 1 FROM pg_constraint
               WHERE connamespace = 'svc_media'::regnamespace AND conname = r.new_name) THEN
      SELECT conrelid::regclass::text INTO v_tbl_txt
      FROM pg_constraint
      WHERE connamespace = 'svc_media'::regnamespace AND conname = r.old_name;
      EXECUTE format('ALTER TABLE %s RENAME CONSTRAINT %I TO %I', v_tbl_txt, r.old_name, r.new_name);
    END IF;
  END LOOP;

  -- ── Section E — unique keys (constraint-OR-index bearer) ───────────────────
  -- On prod these are bare UNIQUE INDEXES (rename via ALTER INDEX). On a
  -- local-derived fixture they are UNIQUE CONSTRAINTS (rename via RENAME
  -- CONSTRAINT, which carries the backing index name along). Handle whichever
  -- object currently bears the Prisma name.
  FOR r IN
    SELECT * FROM (VALUES
      ('MediaAsset_rawKey_key',            'media_assets_raw_key_key'),
      ('AssetRendition_key_key',           'asset_renditions_key_key'),
      ('ThreeDAsset_assetId_key',          'three_d_assets_asset_id_key'),
      ('UploadSession_targetKey_key',      'upload_sessions_target_key_key'),
      ('UploadSession_idempotencyKey_key', 'upload_sessions_idempotency_key_key')
    ) AS m(old_name, new_name)
  LOOP
    IF EXISTS (SELECT 1 FROM pg_constraint
               WHERE connamespace = 'svc_media'::regnamespace AND conname = r.old_name)
       AND NOT EXISTS (SELECT 1 FROM pg_constraint
               WHERE connamespace = 'svc_media'::regnamespace AND conname = r.new_name) THEN
      SELECT conrelid::regclass::text INTO v_tbl_txt
      FROM pg_constraint
      WHERE connamespace = 'svc_media'::regnamespace AND conname = r.old_name;
      EXECUTE format('ALTER TABLE %s RENAME CONSTRAINT %I TO %I', v_tbl_txt, r.old_name, r.new_name);
    ELSIF to_regclass('svc_media.' || quote_ident(r.old_name)) IS NOT NULL
          AND to_regclass('svc_media.' || quote_ident(r.new_name)) IS NULL THEN
      EXECUTE format('ALTER INDEX svc_media.%I RENAME TO %I', r.old_name, r.new_name);
    END IF;
  END LOOP;

  -- ── Section F — tables ─────────────────────────────────────────────────────
  FOR r IN
    SELECT * FROM (VALUES
      ('MediaAsset',     'media_assets'),
      ('AssetRendition', 'asset_renditions'),
      ('ThreeDAsset',    'three_d_assets'),
      ('ProcessJob',     'process_jobs'),
      ('UploadSession',  'upload_sessions'),
      ('LicenseRecord',  'license_records')
    ) AS m(old_name, new_name)
  LOOP
    IF to_regclass('svc_media.' || quote_ident(r.old_name)) IS NOT NULL
       AND to_regclass('svc_media.' || quote_ident(r.new_name)) IS NULL THEN
      EXECUTE format('ALTER TABLE svc_media.%I RENAME TO %I', r.old_name, r.new_name);
    END IF;
  END LOOP;
END
$reconcile$;

-- ── Verify-block postconditions ──────────────────────────────────────────────
-- Assert the snake_case shape exists and no Prisma-shaped remnant survives.
-- These run on every environment; on local/CI/staging they simply confirm the
-- already-snake_case shape. They FAIL LOUD if a rename was left half-applied.
DO $verify$
DECLARE
  v_missing text;
  v_remnant text;
BEGIN
  -- required snake_case tables
  SELECT string_agg(t, ', ') INTO v_missing
  FROM unnest(ARRAY[
    'media_assets','asset_renditions','three_d_assets','process_jobs',
    'upload_sessions','license_records','outbox_events'
  ]) AS t
  WHERE to_regclass('svc_media.' || t) IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION '00521 postcondition failed: missing snake_case svc_media tables: %', v_missing;
  END IF;

  -- required snake_case enum types
  SELECT string_agg(t, ', ') INTO v_missing
  FROM unnest(ARRAY[
    'asset_kind','asset_role','asset_status','scan_status','rendition_format',
    'rendition_purpose','job_type','job_state','upload_status'
  ]) AS t
  WHERE to_regtype('svc_media.' || t) IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION '00521 postcondition failed: missing snake_case svc_media enum types: %', v_missing;
  END IF;

  -- no Prisma-shaped table remnant
  SELECT string_agg(t, ', ') INTO v_remnant
  FROM unnest(ARRAY[
    'MediaAsset','AssetRendition','ThreeDAsset','ProcessJob',
    'UploadSession','LicenseRecord'
  ]) AS t
  WHERE to_regclass('svc_media.' || quote_ident(t)) IS NOT NULL;
  IF v_remnant IS NOT NULL THEN
    RAISE EXCEPTION '00521 postcondition failed: Prisma-shaped svc_media tables still present: %', v_remnant;
  END IF;

  -- no Prisma-shaped enum-type remnant
  SELECT string_agg(t, ', ') INTO v_remnant
  FROM unnest(ARRAY[
    'AssetKind','AssetRole','AssetStatus','ScanStatus','RenditionFormat',
    'RenditionPurpose','JobType','JobState','UploadStatus'
  ]) AS t
  WHERE to_regtype('svc_media.' || quote_ident(t)) IS NOT NULL;
  IF v_remnant IS NOT NULL THEN
    RAISE EXCEPTION '00521 postcondition failed: Prisma-shaped svc_media enum types still present: %', v_remnant;
  END IF;

  -- representative column check: the columns the regenerated Prisma Client queries
  IF to_regclass('svc_media.media_assets') IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM pg_attribute
       WHERE attrelid = 'svc_media.media_assets'::regclass
         AND attname IN ('raw_key','scan_status','created_at') AND NOT attisdropped
       HAVING count(*) = 3
     ) THEN
    RAISE EXCEPTION '00521 postcondition failed: media_assets is missing snake_case raw_key/scan_status/created_at';
  END IF;

  RAISE NOTICE '00521: svc_media snake_case shape verified.';
END
$verify$;
