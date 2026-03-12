-- Migration: Create media service schema
-- Source: services/media/prisma/schema.prisma

BEGIN;

CREATE SCHEMA IF NOT EXISTS svc_media;
SET search_path TO svc_media;

-- Enums
CREATE TYPE svc_media.asset_kind AS ENUM ('IMAGE', 'MODEL3D');
CREATE TYPE svc_media.asset_role AS ENUM ('HERO', 'ANGLE', 'LIFESTYLE', 'DETAIL', 'AR_PREVIEW', 'TEXTURE', 'OTHER');
CREATE TYPE svc_media.asset_status AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'BLOCKED', 'QUARANTINED');
CREATE TYPE svc_media.scan_status AS ENUM ('PENDING', 'SCANNING', 'CLEAN', 'INFECTED', 'ERROR');
CREATE TYPE svc_media.rendition_format AS ENUM ('JPEG', 'PNG', 'WEBP', 'AVIF');
CREATE TYPE svc_media.rendition_purpose AS ENUM ('THUMB', 'WEB', 'RETINA', 'PREVIEW', 'ORIGINAL');
CREATE TYPE svc_media.job_type AS ENUM ('IMAGE_PROCESS', 'IMAGE_TRANSFORM', 'MODEL3D_CONVERT', 'MODEL3D_OPTIMIZE', 'SNAPSHOT_GENERATE', 'VIRUS_SCAN', 'METADATA_EXTRACT', 'ASSET_DELETE', 'BULK_DELETE', 'BULK_COPY', 'CLEANUP_ORPHANED');
CREATE TYPE svc_media.job_state AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'RETRY', 'CANCELED');
CREATE TYPE svc_media.upload_status AS ENUM ('PENDING', 'UPLOADED', 'FAILED', 'EXPIRED');

-- Media Assets
CREATE TABLE IF NOT EXISTS media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind svc_media.asset_kind NOT NULL,
  product_id TEXT,
  variant_id TEXT,
  role svc_media.asset_role,
  raw_key TEXT UNIQUE NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  status svc_media.asset_status NOT NULL DEFAULT 'PENDING',
  width INT,
  height INT,
  format TEXT,
  size_bytes INT,
  mime_type TEXT,
  phash VARCHAR(64),
  palette JSONB,
  blurhash VARCHAR(100),
  lqip_key TEXT,
  license JSONB,
  qc_issues JSONB,
  qc_score DOUBLE PRECISION DEFAULT 0,
  scan_status svc_media.scan_status NOT NULL DEFAULT 'PENDING',
  scan_result JSONB,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  permissions JSONB,
  view_count INT NOT NULL DEFAULT 0,
  download_count INT NOT NULL DEFAULT 0,
  tags TEXT[] DEFAULT '{}',
  sort_order INT NOT NULL DEFAULT 0,
  uploaded_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_media_product ON media_assets(product_id);
CREATE INDEX IF NOT EXISTS idx_media_variant ON media_assets(variant_id);
CREATE INDEX IF NOT EXISTS idx_media_kind_status ON media_assets(kind, status);
CREATE INDEX IF NOT EXISTS idx_media_phash ON media_assets(phash);
CREATE INDEX IF NOT EXISTS idx_media_created ON media_assets(created_at);
CREATE INDEX IF NOT EXISTS idx_media_uploaded_by ON media_assets(uploaded_by);

-- Asset Renditions
CREATE TABLE IF NOT EXISTS asset_renditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  key TEXT UNIQUE NOT NULL,
  width INT,
  height INT,
  format svc_media.rendition_format NOT NULL,
  size_bytes INT,
  purpose svc_media.rendition_purpose NOT NULL,
  transform JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_renditions_asset ON asset_renditions(asset_id);
CREATE INDEX IF NOT EXISTS idx_renditions_purpose ON asset_renditions(purpose);

-- 3D Asset Metadata
CREATE TABLE IF NOT EXISTS three_d_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID UNIQUE NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  glb_key TEXT,
  usdz_key TEXT,
  tri_count INT,
  node_count INT,
  material_count INT,
  texture_count INT,
  width_m DOUBLE PRECISION,
  height_m DOUBLE PRECISION,
  depth_m DOUBLE PRECISION,
  volume_m3 DOUBLE PRECISION,
  lods JSONB,
  materials JSONB,
  textures JSONB,
  ar_ready BOOLEAN NOT NULL DEFAULT FALSE,
  ar_checks JSONB,
  snapshots JSONB,
  qc_issues JSONB,
  draw_calls INT,
  perf_budget JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Process Jobs
CREATE TABLE IF NOT EXISTS process_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  type svc_media.job_type NOT NULL,
  state svc_media.job_state NOT NULL DEFAULT 'QUEUED',
  priority INT NOT NULL DEFAULT 0,
  attempts INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 3,
  error TEXT,
  error_code TEXT,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  meta JSONB,
  result JSONB,
  worker_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_asset_state ON process_jobs(asset_id, state);
CREATE INDEX IF NOT EXISTS idx_jobs_type_state ON process_jobs(type, state);
CREATE INDEX IF NOT EXISTS idx_jobs_state_queued ON process_jobs(state, queued_at);
CREATE INDEX IF NOT EXISTS idx_jobs_worker ON process_jobs(worker_id);

-- Upload Sessions
CREATE TABLE IF NOT EXISTS upload_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id TEXT,
  filename TEXT NOT NULL,
  file_size INT,
  mime_type TEXT NOT NULL,
  kind svc_media.asset_kind NOT NULL,
  par_url TEXT NOT NULL,
  target_key TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status svc_media.upload_status NOT NULL DEFAULT 'PENDING',
  uploaded_at TIMESTAMPTZ,
  user_id TEXT NOT NULL,
  product_id TEXT,
  variant_id TEXT,
  role svc_media.asset_role,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_uploads_user ON upload_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_uploads_status ON upload_sessions(status);
CREATE INDEX IF NOT EXISTS idx_uploads_expires ON upload_sessions(expires_at);

-- License Records
CREATE TABLE IF NOT EXISTS license_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_ids TEXT[] NOT NULL,
  license_type TEXT NOT NULL,
  source_vendor TEXT,
  source_vendor_id TEXT,
  attribution TEXT,
  usage_scope TEXT[] DEFAULT '{}',
  territory TEXT,
  expires_at TIMESTAMPTZ,
  proof_doc_key TEXT,
  alerts_sent JSONB,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_licenses_expires ON license_records(expires_at);
CREATE INDEX IF NOT EXISTS idx_licenses_type ON license_records(license_type);

-- Outbox Events
CREATE TABLE IF NOT EXISTS outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  headers JSONB,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  retry_count INT NOT NULL DEFAULT 0,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_outbox_type_published ON outbox_events(type, published);
CREATE INDEX IF NOT EXISTS idx_outbox_created ON outbox_events(created_at);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION svc_media.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['media_assets', 'three_d_assets', 'upload_sessions', 'license_records'])
  LOOP
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON svc_media.%I FOR EACH ROW EXECUTE FUNCTION svc_media.set_updated_at()', tbl);
  END LOOP;
END $$;

COMMIT;

RESET search_path;
