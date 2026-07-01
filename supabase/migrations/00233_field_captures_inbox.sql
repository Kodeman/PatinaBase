-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 00233: field_captures — Patina Field Capture inbox
--
-- The server-side landing table for the "Patina Field Capture" iOS app. Each
-- row is one capture made in the field (a tagged product, photos, a voice
-- note, a barcode, a venue pin). The phone syncs the row up (offline-first,
-- keyed by a client-generated client_capture_id for idempotent retry), then
-- the designer either keeps it in an inbox for later triage or commits it
-- straight into their personal Library as a draft product.
--
-- Mirrors the proposal_captures (00130) inbox pattern: RLS confines a row to
-- its owning designer; a BEFORE INSERT/UPDATE guard trigger rejects routing
-- to a project / room / org the designer doesn't own or belong to; the
-- commit/route/dismiss state machine lives in RPCs (00235), not in the app.
--
-- Upload-pipeline columns (artifacts_sha256, upload_progress, media manifest)
-- mirror room_scans (00082) so the phone's resumable uploader can patch
-- artifact hashes and progress as media arrives in the capture-media bucket
-- (00234).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS field_captures (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Idempotency key generated on-device; one logical capture maps to exactly
  -- one row no matter how many times the phone retries the sync.
  client_capture_id        UUID NOT NULL UNIQUE,

  designer_id              UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id          UUID NULL REFERENCES organizations(id) ON DELETE SET NULL,

  -- Lifecycle: queued (media still uploading) → synced (row landed) →
  -- inbox (kept for triage) | saved (committed to a product) | dismissed.
  status                   TEXT NOT NULL DEFAULT 'synced'
    CHECK (status IN ('queued', 'synced', 'inbox', 'saved', 'dismissed')),

  -- Where the designer intends this to go. 'library' = create a draft product
  -- now; 'inbox' = hold for later.
  destination              TEXT NOT NULL DEFAULT 'inbox'
    CHECK (destination IN ('library', 'inbox')),

  product_id               UUID NULL REFERENCES products(id) ON DELETE SET NULL,
  committed_at             TIMESTAMPTZ,

  -- ─── Captured content (the "tag") ──────────────────────────────────────
  title                    TEXT,
  notes                    TEXT,
  category                 TEXT,
  subcategory              TEXT,
  dimensions               JSONB,
  materials                TEXT[] DEFAULT '{}',
  colors                   TEXT[] DEFAULT '{}',
  style_tags               TEXT[] DEFAULT '{}',
  material_tags            TEXT[] DEFAULT '{}',
  finish                   TEXT,
  vendor_name              TEXT,
  vendor_id                UUID NULL REFERENCES vendors(id) ON DELETE SET NULL,
  sku                      TEXT,
  price_trade_cents        INTEGER,
  price_retail_cents       INTEGER,
  barcode_value            TEXT,
  barcode_symbology        TEXT,
  catalog_match_product_id UUID NULL REFERENCES products(id) ON DELETE SET NULL,

  -- ─── Voice note ────────────────────────────────────────────────────────
  voice_audio_path         TEXT,
  voice_transcript         TEXT,
  voice_partial_transcript TEXT,
  voice_duration_seconds   NUMERIC,

  -- ─── Photos / media ────────────────────────────────────────────────────
  photos                   JSONB NOT NULL DEFAULT '[]',
  primary_photo_path       TEXT,
  thumbnail_url            TEXT,

  -- ─── Inference + provenance ────────────────────────────────────────────
  provenance               JSONB NOT NULL DEFAULT '{}',
  guesses                  JSONB NOT NULL DEFAULT '{}',

  -- ─── Where it was captured ─────────────────────────────────────────────
  captured_lat             DOUBLE PRECISION,
  captured_lng             DOUBLE PRECISION,
  captured_accuracy_m      NUMERIC,
  venue_label              TEXT,
  venue_place_id           TEXT,
  captured_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  captured_timezone        TEXT,

  -- ─── Optional project routing ──────────────────────────────────────────
  project_id               UUID NULL REFERENCES projects(id) ON DELETE SET NULL,
  project_room_id          UUID NULL REFERENCES project_rooms(id) ON DELETE SET NULL,
  shelf                    TEXT,

  -- ─── Resumable upload pipeline (mirrors room_scans / 00082) ────────────
  media_manifest_url       TEXT,
  artifacts_sha256         JSONB NOT NULL DEFAULT '{}',
  upload_progress          SMALLINT NOT NULL DEFAULT 0
    CHECK (upload_progress BETWEEN 0 AND 100),
  upload_completed_at      TIMESTAMPTZ,
  upload_error             TEXT,

  -- ─── Audit / envelope ──────────────────────────────────────────────────
  raw_payload              JSONB NOT NULL DEFAULT '{}',
  device_model             TEXT,
  os_version               TEXT,
  app_version              TEXT,
  capture_schema_version   INTEGER NOT NULL DEFAULT 1,
  synced_at                TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_field_captures_designer_status
  ON field_captures(designer_id, status);

CREATE INDEX IF NOT EXISTS idx_field_captures_org_inbox
  ON field_captures(organization_id, status)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_field_captures_project
  ON field_captures(project_id)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_field_captures_product
  ON field_captures(product_id)
  WHERE product_id IS NOT NULL;

-- ─── updated_at trigger (helper from 00014) ────────────────────────────────
CREATE TRIGGER trg_field_captures_updated_at
  BEFORE UPDATE ON field_captures
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ─── products.field_capture_id FK (table now exists) ───────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_field_capture_id_fkey'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_field_capture_id_fkey
        FOREIGN KEY (field_capture_id)
        REFERENCES field_captures(id)
        ON DELETE SET NULL;
  END IF;
END$$;

-- ─── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE field_captures ENABLE ROW LEVEL SECURITY;

-- Owner: full control over their own captures.
CREATE POLICY field_captures_owner_select
  ON field_captures FOR SELECT
  USING (designer_id = auth.uid());

CREATE POLICY field_captures_owner_insert
  ON field_captures FOR INSERT
  WITH CHECK (designer_id = auth.uid());

CREATE POLICY field_captures_owner_update
  ON field_captures FOR UPDATE
  USING (designer_id = auth.uid())
  WITH CHECK (designer_id = auth.uid());

CREATE POLICY field_captures_owner_delete
  ON field_captures FOR DELETE
  USING (designer_id = auth.uid());

-- Studio co-visibility: active members of the org can read org-scoped rows
-- that are sitting in the shared inbox (status='inbox'). They cannot mutate
-- another member's capture — only read it (drag into a shared library, etc.).
CREATE POLICY field_captures_org_inbox_select
  ON field_captures FOR SELECT
  USING (
    status = 'inbox'
    AND organization_id IS NOT NULL
    AND organization_id IN (
      SELECT om.organization_id
      FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

-- ─── Routing guard ─────────────────────────────────────────────────────────
-- Mirrors proposal_captures_guard_proposal_owner (00130). Even with RLS on
-- field_captures, a designer must not route a capture to a project they don't
-- own, a room outside that project, or an org they're not an active member
-- of. SECURITY INVOKER (default for trigger funcs) — the membership / project
-- lookups run under the caller's RLS, so a non-owned project is simply
-- invisible and trips the "does not exist or not visible" branch.
CREATE OR REPLACE FUNCTION field_captures_guard_routing()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_proj_designer UUID;
  v_proj_created  UUID;
  v_room_project  UUID;
BEGIN
  -- Project ownership.
  IF NEW.project_id IS NOT NULL THEN
    SELECT designer_id, created_by
      INTO v_proj_designer, v_proj_created
      FROM projects
     WHERE id = NEW.project_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'field_captures: project_id % does not exist or is not visible', NEW.project_id;
    END IF;

    IF v_proj_designer IS DISTINCT FROM NEW.designer_id
       AND v_proj_created IS DISTINCT FROM NEW.designer_id THEN
      RAISE EXCEPTION 'field_captures: cannot route capture to a project owned by a different designer';
    END IF;
  END IF;

  -- Room must belong to the routed project.
  IF NEW.project_room_id IS NOT NULL THEN
    SELECT project_id INTO v_room_project
      FROM project_rooms
     WHERE id = NEW.project_room_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'field_captures: project_room_id % does not exist or is not visible', NEW.project_room_id;
    END IF;

    IF NEW.project_id IS NOT NULL AND v_room_project IS DISTINCT FROM NEW.project_id THEN
      RAISE EXCEPTION 'field_captures: project_room_id % does not belong to project_id %',
        NEW.project_room_id, NEW.project_id;
    END IF;
  END IF;

  -- Org scope must be an org the designer actively belongs to.
  IF NEW.organization_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
        FROM organization_members om
       WHERE om.organization_id = NEW.organization_id
         AND om.user_id = NEW.designer_id
         AND om.status = 'active'
    ) THEN
      RAISE EXCEPTION 'field_captures: designer is not an active member of organization %', NEW.organization_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_field_captures_guard_insert
  BEFORE INSERT ON field_captures
  FOR EACH ROW EXECUTE FUNCTION field_captures_guard_routing();

CREATE TRIGGER trg_field_captures_guard_update
  BEFORE UPDATE ON field_captures
  FOR EACH ROW EXECUTE FUNCTION field_captures_guard_routing();

COMMENT ON TABLE field_captures IS
  'Server-side inbox for the Patina Field Capture iOS app. One row per field capture, idempotent on client_capture_id. State machine (commit/route/dismiss) lives in 00235 RPCs.';

COMMIT;
