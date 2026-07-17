-- ═══════════════════════════════════════════════════════════════════════════
-- 00341 — Field Capture P1 schema ("The Instrument")
--
-- The additive data spine for the Field Capture P1 build package
-- (docs/design/field-capture/field-capture-p1-package.md, Part B item 2) and
-- the capture-bundle-spec-v1 (docs/design/field-capture/capture-bundle-spec-v1.md).
--
-- Reconciliation rulings this migration follows (see the spec's "Blessed
-- decisions" + DECISIONS I84):
--   R-a  NO new rooms/scans/capture_bundles/assets tables. rooms + room_scans
--        exist and are live; bundle state already rides room_scans columns
--        (bundle_manifest_url, artifacts_sha256, upload_progress,
--        scan_schema_version — 00077/00082). Everything new FKs room_scans(id).
--   R-b  Additive only. Nothing existing is ALTERed. Four new tables:
--          • public.scan_anchors            — typed ground-truth anchors
--          • public.room_files              — versioned deliverable (append-only)
--          • public.room_file_measurements  — per-dimension tolerance provenance
--          • public.scan_pipeline_events    — end-to-end telemetry stream
--        Named to fit the live namespace: the package's
--        anchors/measurements/room_files/pipeline_events would have collided
--        with pipeline_stage_events (00305) and media_assets (svc_media); the
--        scan_*/room_* family is the house pattern (00077/00082/00337).
--   R-d  House enum style: text + CHECK, never native pg enums. Measurement
--        provenance: source CHECK IN ('anchor','parametric') — P2 widens to
--        'mesh'; tolerance_mm; tolerance_class CHECK IN
--        ('verified','measured','estimated'); verified_by; verified_at.
--   R-e  Bundle supersets the live v3 ScanManifest. Field writes
--        room_scans.scan_schema_version = 3 (a VALUE — the column exists,
--        no DDL here). Same room-scans bucket (private, 500 MB, path
--        {artifactType}/{userId}/{scanId}/… per 00077/00287), no new bucket.
--   R-f  room_files is append-only: one row per generation, UNIQUE(scan_id,
--        version), never UPDATE-in-place of a deliverable (proposal-revision
--        precedent). A row's URL columns are filled forward as the SVG/PDF/DXF
--        of THAT version render (item 11); a re-scan/re-solve mints a new row.
--   R-g  UNVERIFIED semantics (R108.5): a session may close with < 3 anchors;
--        the manifest carries the flag; room_files.unverified + certificate
--        record it; every measurement then wears the widest tolerance_class.
--   R-h  Units: model space = meters (ARKit world frame); DB-stored values =
--        integer millimetres; drawings render ft-in. Anchor endpoints are the
--        raw tapped taps in model coordinates.
--
-- RLS: reads delegate to the scan's own row security on public.room_scans
-- (owner / designer-association / studio-co-member all compose automatically —
-- 00014/00020/00316), exactly as 00337 does. scan_anchors additionally takes
-- owner writes (device posts its captured anchors, mirroring room_scan_images
-- 00082). room_files / room_file_measurements / scan_pipeline_events are
-- server-generated: SELECT via delegation, writes service-role only (no
-- INSERT/UPDATE/DELETE policy). Ingestion RPCs arrive with item 9 — this
-- migration is plain tables + RLS only.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- scan_anchors — typed ground-truth anchors (device-captured input)
--
-- One row per anchor a designer tapped on the live model and typed a tape/laser
-- value for (R-h, R1 typed-only). endpoint_a/endpoint_b are the two taps in
-- model space (metres, ARKit world frame); measured_value_mm is the typed
-- ground truth in integer millimetres. model_span_m is the captured tap-to-tap
-- distance, denormalized so the server anchor-solve (item 10) can compute the
-- scale residual without re-reading the bundle.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.scan_anchors (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id           uuid NOT NULL REFERENCES public.room_scans(id) ON DELETE CASCADE,

  -- Device-stable id for idempotent re-upload (mirrors the resumable-upload
  -- idempotency theme: field_captures.client_capture_id, 00233).
  client_anchor_id  uuid NOT NULL,

  anchor_index      integer,                        -- capture order within the session
  label             text,                           -- e.g. 'north wall run', 'ceiling height'

  -- What the anchor measures. Extensible via the CHECK (P2 may add corner/diag).
  span_kind         text NOT NULL DEFAULT 'span'
                      CHECK (span_kind IN ('span','height')),

  -- Entry transport. R1: typed only in P1; DISTO BLE waits for field evidence.
  entry_method      text NOT NULL DEFAULT 'typed'
                      CHECK (entry_method IN ('typed')),

  -- Tapped endpoints in model space (metres, ARKit world frame): {x,y,z}.
  endpoint_a        jsonb NOT NULL,
  endpoint_b        jsonb NOT NULL,

  model_span_m      numeric,                         -- captured tap-to-tap distance, metres (denormalized)
  measured_value_mm integer NOT NULL,                -- typed ground-truth value, integer mm

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT scan_anchors_client_uniq UNIQUE (scan_id, client_anchor_id),
  CONSTRAINT scan_anchors_value_positive CHECK (measured_value_mm > 0)
);

COMMENT ON TABLE public.scan_anchors IS
  'Field Capture typed ground-truth anchors — two taps on the live model + a typed tape/laser value. Device-captured input; owner-writable, delegated read. Endpoints are model-space metres; measured_value_mm is integer millimetres (R-h).';
COMMENT ON COLUMN public.scan_anchors.client_anchor_id IS
  'Device-stable UUID; idempotency key so a resumed upload upserts (scan_id, client_anchor_id) rather than duplicating.';
COMMENT ON COLUMN public.scan_anchors.endpoint_a IS
  '{x,y,z} first tap in model space (metres, ARKit world frame).';
COMMENT ON COLUMN public.scan_anchors.endpoint_b IS
  '{x,y,z} second tap in model space (metres, ARKit world frame).';
COMMENT ON COLUMN public.scan_anchors.model_span_m IS
  'Captured tap-to-tap distance in metres. Denormalized so the anchor-solve can compute scale residual (measured_value_mm vs model span) without re-reading the bundle.';
COMMENT ON COLUMN public.scan_anchors.measured_value_mm IS
  'Typed ground-truth value in integer millimetres (R-h). The accuracy contract is this value, not the transport (R1).';
COMMENT ON COLUMN public.scan_anchors.entry_method IS
  'Anchor entry transport. P1 ships typed only (R1); the CHECK widens for DISTO BLE in P2.';

CREATE INDEX IF NOT EXISTS idx_scan_anchors_scan
  ON public.scan_anchors (scan_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- room_files — versioned deliverable (append-only, R-f)
--
-- One row per generation of a room's drawing set + accuracy certificate. A
-- re-scan or re-solve mints a new (scan_id, version) row; a deliverable is
-- never UPDATE-in-place (proposal-revision precedent). URL columns fill forward
-- as the SVG/PDF/DXF of THIS version render (item 11). unverified + certificate
-- carry the UNVERIFIED stamp (R-g).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.room_files (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id           uuid NOT NULL REFERENCES public.room_scans(id) ON DELETE CASCADE,

  version           integer NOT NULL,               -- monotonic per scan; new generation = new row

  -- UNVERIFIED semantics (R-g / R108.5).
  unverified        boolean NOT NULL DEFAULT false,
  anchor_count      integer NOT NULL DEFAULT 0,      -- anchors used by the solve for this version

  -- Accuracy certificate: anchors used, per-dimension residuals, class per
  -- dimension, solve inputs. Emitted by the anchor-solve (item 10).
  certificate       jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Broadest (worst) tolerance class across this version's measurements — a
  -- rollup for list surfaces / the title-block badge.
  tolerance_class   text CHECK (tolerance_class IN ('verified','measured','estimated')),

  -- Generated deliverables (item 11 fills these; nullable until rendered).
  svg_url           text,
  pdf_url           text,
  dxf_url           text,

  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','generated','error')),
  generation_error  text,
  generated_at      timestamptz,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT room_files_scan_version_uniq UNIQUE (scan_id, version)
);

COMMENT ON TABLE public.room_files IS
  'Versioned Room File deliverable — one row per generation of a scan''s drawing set + accuracy certificate. Append-only (R-f): a re-scan/re-solve mints a new (scan_id, version); a deliverable is never UPDATE-in-place. Server-generated: delegated read, service-role write only.';
COMMENT ON COLUMN public.room_files.version IS
  'Monotonic version per scan. New generation = new row (never overwrite); UNIQUE(scan_id, version).';
COMMENT ON COLUMN public.room_files.unverified IS
  'True when the session closed with < 3 anchors (R-g). Prints in the drawing title block; forces every measurement to the widest tolerance_class.';
COMMENT ON COLUMN public.room_files.certificate IS
  'Accuracy certificate JSONB: anchors used, per-dimension residuals, tolerance class per dimension, solve inputs. Emitted by the anchor-solve (item 10).';
COMMENT ON COLUMN public.room_files.tolerance_class IS
  'Broadest (worst) tolerance class across this version''s measurements — rollup for list badges / the title block.';

CREATE INDEX IF NOT EXISTS idx_room_files_scan
  ON public.room_files (scan_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- room_file_measurements — per-dimension tolerance provenance (R-d)
--
-- One row per published dimension of a room_files version. Carries where the
-- number came from (source), how tight it is (tolerance_mm + tolerance_class),
-- and — when anchor-derived — which anchor grounded it. scan_id is denormalized
-- (mirrors room_scan_geometry_elements 00337) so RLS delegates straight to
-- room_scans. Server-computed output of the anchor-solve: append-only,
-- service-role write only.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.room_file_measurements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_file_id    uuid NOT NULL REFERENCES public.room_files(id) ON DELETE CASCADE,
  scan_id         uuid NOT NULL REFERENCES public.room_scans(id) ON DELETE CASCADE,  -- denormalized for RLS delegation

  label           text,                              -- 'north wall length', 'ceiling height'
  element_ref     jsonb,                             -- optional pointer to a geometry element {kind, apple_id}

  value_mm        integer NOT NULL,                  -- corrected dimension, integer mm (R-h)

  -- Provenance (R-d). P2 widens the source CHECK to add 'mesh'.
  source          text NOT NULL CHECK (source IN ('anchor','parametric')),
  tolerance_mm    integer,                           -- +/- tolerance, integer mm
  tolerance_class text NOT NULL
                    CHECK (tolerance_class IN ('verified','measured','estimated')),

  anchor_id       uuid REFERENCES public.scan_anchors(id) ON DELETE SET NULL,        -- set when source='anchor'
  verified_by     uuid REFERENCES public.profiles(id)     ON DELETE SET NULL,
  verified_at     timestamptz,

  created_at      timestamptz NOT NULL DEFAULT now(),

  -- an anchor-sourced measurement must name its anchor, AND a 'verified'
  -- tolerance_class must be grounded by an anchor regardless of source —
  -- both halves are DB-enforced, not just convention (M1 review fix).
  CONSTRAINT rfm_anchor_source_shape CHECK (
    (source <> 'anchor' OR anchor_id IS NOT NULL)
    AND (tolerance_class <> 'verified' OR anchor_id IS NOT NULL)
  )
);

COMMENT ON TABLE public.room_file_measurements IS
  'Per-dimension tolerance provenance for a room_files version. source anchor|parametric (P2 adds mesh); tolerance_mm + tolerance_class verified|measured|estimated (R-d). value_mm is integer millimetres (R-h). Server-computed: delegated read, service-role write only.';
COMMENT ON COLUMN public.room_file_measurements.scan_id IS
  'Denormalized from room_files.scan_id (mirrors room_scan_geometry_elements) so RLS delegates straight to room_scans. Maintained by the service-role writer only.';
COMMENT ON COLUMN public.room_file_measurements.source IS
  'Provenance of the number: anchor = grounded on a typed anchor; parametric = from the corrected RoomPlan graph. P2 widens the CHECK to add mesh.';
COMMENT ON COLUMN public.room_file_measurements.tolerance_class IS
  'verified (anchor-grounded) | measured (parametric, in-tolerance) | estimated (sloped ceilings, no-anchor spans, UNVERIFIED). The widest class wins when unverified.';

CREATE INDEX IF NOT EXISTS idx_rfm_room_file
  ON public.room_file_measurements (room_file_id);
CREATE INDEX IF NOT EXISTS idx_rfm_scan
  ON public.room_file_measurements (scan_id);
CREATE INDEX IF NOT EXISTS idx_rfm_anchor
  ON public.room_file_measurements (anchor_id)
  WHERE anchor_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- scan_pipeline_events — end-to-end telemetry stream (item 13)
--
-- Append-only event log spanning capture → upload → ingest → solve → drawing →
-- delivery (capture metrics, upload/job timings, tolerance distribution). stage
-- is the coarse phase (CHECK); event is a free-form name within the stage so
-- new instrumentation needs no migration. Server-emitted: delegated read,
-- service-role write only.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.scan_pipeline_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id       uuid NOT NULL REFERENCES public.room_scans(id) ON DELETE CASCADE,
  room_file_id  uuid REFERENCES public.room_files(id) ON DELETE SET NULL,  -- when the event pertains to a generation

  stage         text NOT NULL
                  CHECK (stage IN ('capture','upload','ingest','solve','drawing','delivery')),
  event         text NOT NULL,                       -- free-form event name within the stage
  status        text NOT NULL DEFAULT 'info'
                  CHECK (status IN ('started','succeeded','failed','info')),

  duration_ms   integer,
  detail        jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.scan_pipeline_events IS
  'Append-only Field Capture telemetry: capture → upload → ingest → solve → drawing → delivery. stage is the coarse phase (CHECK); event is free-form within the stage so new instrumentation needs no migration. Server-emitted: delegated read, service-role write only.';
COMMENT ON COLUMN public.scan_pipeline_events.stage IS
  'Coarse pipeline phase. event carries the specific name within the stage; detail carries the structured payload (metrics, timings, tolerance distribution).';

CREATE INDEX IF NOT EXISTS idx_scan_pipeline_events_scan
  ON public.scan_pipeline_events (scan_id, created_at);
CREATE INDEX IF NOT EXISTS idx_scan_pipeline_events_room_file
  ON public.scan_pipeline_events (room_file_id)
  WHERE room_file_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- updated_at triggers (helper update_updated_at from 00001) for the two mutable
-- tables. Measurements + pipeline events are append-only (created_at only).
-- ═══════════════════════════════════════════════════════════════════════════
DROP TRIGGER IF EXISTS trg_scan_anchors_updated_at ON public.scan_anchors;
CREATE TRIGGER trg_scan_anchors_updated_at
  BEFORE UPDATE ON public.scan_anchors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_room_files_updated_at ON public.room_files;
CREATE TRIGGER trg_room_files_updated_at
  BEFORE UPDATE ON public.room_files
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS — reads delegate to the scan's own visibility on room_scans (00337
-- pattern: the EXISTS subquery runs under the caller's row security, so owner /
-- designer-association / studio-co-member all compose). scan_anchors also takes
-- owner writes (device posts its anchors, mirroring room_scan_images 00082).
-- The other three are server-generated — no write policy (service-role bypasses
-- RLS).
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.scan_anchors            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_files              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_file_measurements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_pipeline_events    ENABLE ROW LEVEL SECURITY;

-- ─── scan_anchors: delegated read + owner write ────────────────────────────
DROP POLICY IF EXISTS scan_anchors_select ON public.scan_anchors;
CREATE POLICY scan_anchors_select ON public.scan_anchors
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.room_scans rs WHERE rs.id = scan_id));

DROP POLICY IF EXISTS scan_anchors_owner_insert ON public.scan_anchors;
CREATE POLICY scan_anchors_owner_insert ON public.scan_anchors
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.room_scans rs
    WHERE rs.id = scan_id AND rs.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS scan_anchors_owner_update ON public.scan_anchors;
CREATE POLICY scan_anchors_owner_update ON public.scan_anchors
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.room_scans rs
    WHERE rs.id = scan_id AND rs.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.room_scans rs
    WHERE rs.id = scan_id AND rs.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS scan_anchors_owner_delete ON public.scan_anchors;
CREATE POLICY scan_anchors_owner_delete ON public.scan_anchors
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.room_scans rs
    WHERE rs.id = scan_id AND rs.user_id = auth.uid()
  ));

-- ─── room_files: delegated read; service-role write only ───────────────────
DROP POLICY IF EXISTS room_files_select ON public.room_files;
CREATE POLICY room_files_select ON public.room_files
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.room_scans rs WHERE rs.id = scan_id));

-- ─── room_file_measurements: delegated read; service-role write only ───────
DROP POLICY IF EXISTS room_file_measurements_select ON public.room_file_measurements;
CREATE POLICY room_file_measurements_select ON public.room_file_measurements
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.room_scans rs WHERE rs.id = scan_id));

-- ─── scan_pipeline_events: delegated read; service-role write only ─────────
DROP POLICY IF EXISTS scan_pipeline_events_select ON public.scan_pipeline_events;
CREATE POLICY scan_pipeline_events_select ON public.scan_pipeline_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.room_scans rs WHERE rs.id = scan_id));

-- ═══════════════════════════════════════════════════════════════════════════
-- Grants (post-2026-05-30 flip: grant callers' access explicitly — never rely
-- on creation-time defaults). scan_anchors gets owner CRUD; the server-
-- generated three get read only. service_role gets ALL (writes bypass RLS).
-- ═══════════════════════════════════════════════════════════════════════════
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scan_anchors           TO authenticated;
GRANT SELECT                          ON public.room_files             TO authenticated;
GRANT SELECT                          ON public.room_file_measurements TO authenticated;
GRANT SELECT                          ON public.scan_pipeline_events   TO authenticated;

GRANT ALL ON public.scan_anchors           TO service_role;
GRANT ALL ON public.room_files             TO service_role;
GRANT ALL ON public.room_file_measurements TO service_role;
GRANT ALL ON public.scan_pipeline_events   TO service_role;
