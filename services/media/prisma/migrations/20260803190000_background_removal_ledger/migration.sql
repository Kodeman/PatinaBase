-- Durable background-removal reservation/idempotency/quota ledger.
-- The media service connects with ?schema=svc_media; schema qualification is
-- explicit here so `prisma migrate deploy` is safe regardless of search_path.

CREATE TYPE svc_media.background_removal_status AS ENUM (
  'RESERVED',
  'SUCCEEDED',
  'FAILED_RELEASED',
  'FAILED_CHARGED'
);

CREATE TYPE svc_media.background_removal_outcome AS ENUM (
  'SUCCEEDED',
  'SOURCE_REJECTED',
  'VENDOR_FAILED',
  'STORAGE_FAILED',
  'INTERNAL_FAILED'
);

CREATE TABLE svc_media.background_removal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quota_owner_id UUID NOT NULL,
  studio_id UUID NULL,
  requested_by UUID NOT NULL,
  board_id UUID NOT NULL,
  item_id UUID NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  status svc_media.background_removal_status NOT NULL DEFAULT 'RESERVED',
  outcome svc_media.background_removal_outcome NULL,
  studio_period_start DATE NOT NULL,
  global_period_start DATE NOT NULL,
  studio_limit INTEGER NOT NULL CHECK (studio_limit > 0),
  global_limit INTEGER NOT NULL CHECK (global_limit > 0),
  reservation_expires_at TIMESTAMPTZ NOT NULL,
  original_url TEXT NULL,
  cutout_url TEXT NULL,
  credits_used NUMERIC(10, 4) NOT NULL DEFAULT 0 CHECK (credits_used >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ NULL,
  CONSTRAINT background_removal_requests_quota_owner_idempotency_key
    UNIQUE (quota_owner_id, idempotency_key)
);

CREATE INDEX background_removal_requests_studio_quota_idx
  ON svc_media.background_removal_requests (quota_owner_id, studio_period_start, status);

CREATE INDEX background_removal_requests_global_quota_idx
  ON svc_media.background_removal_requests (global_period_start, status);

CREATE INDEX background_removal_requests_target_idx
  ON svc_media.background_removal_requests (board_id, item_id);

CREATE OR REPLACE FUNCTION svc_media.set_background_removal_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_background_removal_requests_updated_at
  BEFORE UPDATE ON svc_media.background_removal_requests
  FOR EACH ROW EXECUTE FUNCTION svc_media.set_background_removal_updated_at();
