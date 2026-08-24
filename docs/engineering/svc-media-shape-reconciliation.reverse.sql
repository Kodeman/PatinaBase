-- ═══════════════════════════════════════════════════════════════════════════
-- REVERSE of 00521 — svc_media shape reconciliation (snake_case → Prisma-default)
--
-- Pre-staged rollback for the coordinated migrate-then-deploy window. Renames the
-- snake_case svc_media shape produced by 00521 BACK to prod's original
-- Prisma-DEFAULT casing (PascalCase tables/enum-types, camelCase columns,
-- Prisma-generated index/constraint names), so the previously-deployed media
-- image (whose committed/generated client may query the Prisma-default shape)
-- can serve again.
--
-- NOT in supabase/migrations/ on purpose: it must never be auto-applied by
-- `supabase db reset`. Apply manually against prod ONLY inside the coordinated
-- rollback, immediately followed by redeploying the previous media image.
--   psql "$STRATA_DIRECT_URL" -v ON_ERROR_STOP=1 -f this-file.sql
--
-- Same catalog-resolving + idempotent discipline as 00521: each rename fires
-- only when the snake_case object exists AND the Prisma target does not, so it
-- is a NO-OP on any environment already in Prisma shape and safe to re-run.
--
-- This file is ALSO the reshaping tool the fixture proof uses to turn a
-- snake_case local svc_media into the prod Prisma shape before exercising 00521
-- (reverse then forward = identity). See
-- docs/engineering/svc-media-shape-reconciliation-plan.md.
--
-- NOTE: the index/constraint target names below are prod's ACTUAL current names
-- (captured read-only from Strata), which are Prisma-auto-generated and differ
-- from a mechanical camelCase transform of the 00053 names. This reverse is
-- name-exact against the audited prod catalog.
-- ═══════════════════════════════════════════════════════════════════════════

DO $reverse$
DECLARE
  r          record;
  v_rel      regclass;
  v_tbl_txt  text;
BEGIN
  IF to_regnamespace('svc_media') IS NULL THEN
    RAISE NOTICE 'reverse-00521: svc_media schema absent; nothing to reverse.';
    RETURN;
  END IF;

  -- ── Tables first (so column renames below resolve either name) is NOT needed;
  --    columns are resolved dynamically. Order here mirrors 00521 in reverse but
  --    every step is independently guarded, so order is not load-bearing. ──

  -- ── Enum TYPES (snake_case → PascalCase) ───────────────────────────────────
  FOR r IN
    SELECT * FROM (VALUES
      ('asset_kind',        'AssetKind'),
      ('asset_role',        'AssetRole'),
      ('asset_status',      'AssetStatus'),
      ('scan_status',       'ScanStatus'),
      ('rendition_format',  'RenditionFormat'),
      ('rendition_purpose', 'RenditionPurpose'),
      ('job_type',          'JobType'),
      ('job_state',         'JobState'),
      ('upload_status',     'UploadStatus')
    ) AS m(old_name, new_name)
  LOOP
    IF to_regtype('svc_media.' || quote_ident(r.old_name)) IS NOT NULL
       AND to_regtype('svc_media.' || quote_ident(r.new_name)) IS NULL THEN
      EXECUTE format('ALTER TYPE svc_media.%I RENAME TO %I', r.old_name, r.new_name);
    END IF;
  END LOOP;

  -- ── Columns (snake_case → camelCase) ───────────────────────────────────────
  FOR r IN
    SELECT * FROM (VALUES
      ('MediaAsset','media_assets','product_id','productId'),
      ('MediaAsset','media_assets','variant_id','variantId'),
      ('MediaAsset','media_assets','raw_key','rawKey'),
      ('MediaAsset','media_assets','size_bytes','sizeBytes'),
      ('MediaAsset','media_assets','mime_type','mimeType'),
      ('MediaAsset','media_assets','lqip_key','lqipKey'),
      ('MediaAsset','media_assets','qc_issues','qcIssues'),
      ('MediaAsset','media_assets','qc_score','qcScore'),
      ('MediaAsset','media_assets','scan_status','scanStatus'),
      ('MediaAsset','media_assets','scan_result','scanResult'),
      ('MediaAsset','media_assets','is_public','isPublic'),
      ('MediaAsset','media_assets','view_count','viewCount'),
      ('MediaAsset','media_assets','download_count','downloadCount'),
      ('MediaAsset','media_assets','sort_order','sortOrder'),
      ('MediaAsset','media_assets','uploaded_by','uploadedBy'),
      ('MediaAsset','media_assets','created_at','createdAt'),
      ('MediaAsset','media_assets','updated_at','updatedAt'),
      ('AssetRendition','asset_renditions','asset_id','assetId'),
      ('AssetRendition','asset_renditions','size_bytes','sizeBytes'),
      ('AssetRendition','asset_renditions','created_at','createdAt'),
      ('ThreeDAsset','three_d_assets','asset_id','assetId'),
      ('ThreeDAsset','three_d_assets','glb_key','glbKey'),
      ('ThreeDAsset','three_d_assets','usdz_key','usdzKey'),
      ('ThreeDAsset','three_d_assets','tri_count','triCount'),
      ('ThreeDAsset','three_d_assets','node_count','nodeCount'),
      ('ThreeDAsset','three_d_assets','material_count','materialCount'),
      ('ThreeDAsset','three_d_assets','texture_count','textureCount'),
      ('ThreeDAsset','three_d_assets','width_m','widthM'),
      ('ThreeDAsset','three_d_assets','height_m','heightM'),
      ('ThreeDAsset','three_d_assets','depth_m','depthM'),
      ('ThreeDAsset','three_d_assets','volume_m3','volumeM3'),
      ('ThreeDAsset','three_d_assets','ar_ready','arReady'),
      ('ThreeDAsset','three_d_assets','ar_checks','arChecks'),
      ('ThreeDAsset','three_d_assets','qc_issues','qcIssues'),
      ('ThreeDAsset','three_d_assets','draw_calls','drawCalls'),
      ('ThreeDAsset','three_d_assets','perf_budget','perfBudget'),
      ('ThreeDAsset','three_d_assets','created_at','createdAt'),
      ('ThreeDAsset','three_d_assets','updated_at','updatedAt'),
      ('ProcessJob','process_jobs','asset_id','assetId'),
      ('ProcessJob','process_jobs','max_retries','maxRetries'),
      ('ProcessJob','process_jobs','error_code','errorCode'),
      ('ProcessJob','process_jobs','queued_at','queuedAt'),
      ('ProcessJob','process_jobs','started_at','startedAt'),
      ('ProcessJob','process_jobs','finished_at','finishedAt'),
      ('ProcessJob','process_jobs','worker_id','workerId'),
      ('UploadSession','upload_sessions','asset_id','assetId'),
      ('UploadSession','upload_sessions','file_size','fileSize'),
      ('UploadSession','upload_sessions','mime_type','mimeType'),
      ('UploadSession','upload_sessions','par_url','parUrl'),
      ('UploadSession','upload_sessions','target_key','targetKey'),
      ('UploadSession','upload_sessions','expires_at','expiresAt'),
      ('UploadSession','upload_sessions','uploaded_at','uploadedAt'),
      ('UploadSession','upload_sessions','user_id','userId'),
      ('UploadSession','upload_sessions','product_id','productId'),
      ('UploadSession','upload_sessions','variant_id','variantId'),
      ('UploadSession','upload_sessions','idempotency_key','idempotencyKey'),
      ('UploadSession','upload_sessions','created_at','createdAt'),
      ('UploadSession','upload_sessions','updated_at','updatedAt'),
      ('LicenseRecord','license_records','asset_ids','assetIds'),
      ('LicenseRecord','license_records','license_type','licenseType'),
      ('LicenseRecord','license_records','source_vendor','sourceVendor'),
      ('LicenseRecord','license_records','source_vendor_id','sourceVendorId'),
      ('LicenseRecord','license_records','usage_scope','usageScope'),
      ('LicenseRecord','license_records','expires_at','expiresAt'),
      ('LicenseRecord','license_records','proof_doc_key','proofDocKey'),
      ('LicenseRecord','license_records','alerts_sent','alertsSent'),
      ('LicenseRecord','license_records','created_by','createdBy'),
      ('LicenseRecord','license_records','created_at','createdAt'),
      ('LicenseRecord','license_records','updated_at','updatedAt'),
      ('outbox_events','outbox_events','created_at','createdAt'),
      ('outbox_events','outbox_events','published_at','publishedAt'),
      ('outbox_events','outbox_events','retry_count','retryCount'),
      ('outbox_events','outbox_events','last_error','lastError')
    ) AS m(prisma_tbl, snake_tbl, old_col, new_col)
  LOOP
    v_rel := COALESCE(
      to_regclass('svc_media.' || quote_ident(r.prisma_tbl)),
      to_regclass('svc_media.' || quote_ident(r.snake_tbl))
    );
    CONTINUE WHEN v_rel IS NULL;
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

  -- ── Plain indexes (snake_case → Prisma-default) ────────────────────────────
  FOR r IN
    SELECT * FROM (VALUES
      ('idx_media_product',        'MediaAsset_productId_idx'),
      ('idx_media_variant',        'MediaAsset_variantId_idx'),
      ('idx_media_kind_status',    'MediaAsset_kind_status_idx'),
      ('idx_media_phash',          'MediaAsset_phash_idx'),
      ('idx_media_created',        'MediaAsset_createdAt_idx'),
      ('idx_media_uploaded_by',    'MediaAsset_uploadedBy_idx'),
      ('idx_renditions_asset',     'AssetRendition_assetId_idx'),
      ('idx_renditions_purpose',   'AssetRendition_purpose_idx'),
      ('idx_jobs_asset_state',     'ProcessJob_assetId_state_idx'),
      ('idx_jobs_type_state',      'ProcessJob_type_state_idx'),
      ('idx_jobs_state_queued',    'ProcessJob_state_queuedAt_idx'),
      ('idx_jobs_worker',          'ProcessJob_workerId_idx'),
      ('idx_uploads_user',         'UploadSession_userId_idx'),
      ('idx_uploads_status',       'UploadSession_status_idx'),
      ('idx_uploads_expires',      'UploadSession_expiresAt_idx'),
      ('idx_licenses_expires',     'LicenseRecord_expiresAt_idx'),
      ('idx_licenses_type',        'LicenseRecord_licenseType_idx'),
      ('idx_outbox_created',       'outbox_events_createdAt_idx'),
      ('idx_outbox_type_published','outbox_events_type_published_idx')
    ) AS m(old_name, new_name)
  LOOP
    IF to_regclass('svc_media.' || quote_ident(r.old_name)) IS NOT NULL
       AND to_regclass('svc_media.' || quote_ident(r.new_name)) IS NULL THEN
      EXECUTE format('ALTER INDEX svc_media.%I RENAME TO %I', r.old_name, r.new_name);
    END IF;
  END LOOP;

  -- ── PK / FK constraints (snake_case → Prisma-default) ──────────────────────
  FOR r IN
    SELECT * FROM (VALUES
      ('media_assets_pkey',              'MediaAsset_pkey'),
      ('asset_renditions_pkey',          'AssetRendition_pkey'),
      ('asset_renditions_asset_id_fkey', 'AssetRendition_assetId_fkey'),
      ('three_d_assets_pkey',            'ThreeDAsset_pkey'),
      ('three_d_assets_asset_id_fkey',   'ThreeDAsset_assetId_fkey'),
      ('process_jobs_pkey',              'ProcessJob_pkey'),
      ('process_jobs_asset_id_fkey',     'ProcessJob_assetId_fkey'),
      ('upload_sessions_pkey',           'UploadSession_pkey'),
      ('license_records_pkey',           'LicenseRecord_pkey')
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

  -- ── Unique keys (constraint-OR-index bearer; snake_case → Prisma-default) ──
  FOR r IN
    SELECT * FROM (VALUES
      ('media_assets_raw_key_key',            'MediaAsset_rawKey_key'),
      ('asset_renditions_key_key',            'AssetRendition_key_key'),
      ('three_d_assets_asset_id_key',         'ThreeDAsset_assetId_key'),
      ('upload_sessions_target_key_key',      'UploadSession_targetKey_key'),
      ('upload_sessions_idempotency_key_key', 'UploadSession_idempotencyKey_key')
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

  -- ── Tables (snake_case → PascalCase) ───────────────────────────────────────
  FOR r IN
    SELECT * FROM (VALUES
      ('media_assets',     'MediaAsset'),
      ('asset_renditions', 'AssetRendition'),
      ('three_d_assets',   'ThreeDAsset'),
      ('process_jobs',     'ProcessJob'),
      ('upload_sessions',  'UploadSession'),
      ('license_records',  'LicenseRecord')
    ) AS m(old_name, new_name)
  LOOP
    IF to_regclass('svc_media.' || quote_ident(r.old_name)) IS NOT NULL
       AND to_regclass('svc_media.' || quote_ident(r.new_name)) IS NULL THEN
      EXECUTE format('ALTER TABLE svc_media.%I RENAME TO %I', r.old_name, r.new_name);
    END IF;
  END LOOP;
END
$reverse$;
