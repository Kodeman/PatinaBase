-- ═══════════════════════════════════════════════════════════════════════════
-- 00376 — Field Capture P2 · Present-Layer additive schema (deck SC-11)
--
-- WHAT THIS IS
--   The P2-M1 gate's schema half (field-capture-p2-package.md Part D.2). P2
--   ("Presence") lands the Present Layer — a dense measurable mesh + a photoreal
--   splat walkthrough — on top of P1's True Layer. This migration is ADDITIVE
--   ONLY: it widens two CHECKs and appends columns; it modifies no existing
--   behavior and drops no data.
--
--   1. room_file_measurements.source  CHECK  'anchor'|'parametric'  → + 'mesh'
--        Dense-fusion evidence (Part A′(c), R-d). 00341 already anticipated this
--        in its column comment ("P2 widens the CHECK to add mesh"). tolerance_class
--        is unchanged — mesh evidence tightens 'measured'; 'verified' still
--        requires an anchor (rfm_anchor_source_shape holds untouched).
--   2. scan_pipeline_events.stage  CHECK  + 'refine','fuse','splat','present'
--        The new GPU/present phases (Part A′(a/b/d) + the Present lifecycle).
--        event stays free-form — new instrumentation needs no migration.
--   3. room_files Present-Layer columns (append-only deliverable, R-f; mirrors
--        the P1 `drawings jsonb` precedent). One room_files version carries BOTH
--        layers — True (svg/pdf/dxf/drawings) and Present (dense_mesh/measure_mesh/
--        splat/present) — so drawings can be 'generated' while the splat still
--        trains. present_status is the Present lifecycle, INDEPENDENT of status
--        (the True/drawings lifecycle). A retroactive re-solve (R114.3) of an
--        existing scan still mints v+1 per R-f; the version allocator (00370) and
--        UNIQUE(scan_id, version) are unchanged — the P2 chain just enqueues more
--        stages against the reserved version.
--
-- IDEMPOTENT + catalog-guarded (the 00373 idiom): every clause is a no-op on an
-- already-final schema — CHECK widenings DROP-IF-EXISTS then re-ADD the identical
-- widened form; column adds are ADD COLUMN IF NOT EXISTS. Reruns are safe.
--
-- NO GRANT/REVOKE changes: CHECK edits touch no ACL, and column adds inherit the
-- room_files table grants. The legacy-grants seed is therefore UNAFFECTED by this
-- file (00377, which adds a view + GRANT, regenerates it).
--
-- Numbering: local + Remote (Strata) ledger head 00375 at write time (00373
-- field-capture parity, 00374/00375 field-site-request); 00376 verified free
-- across main + all branches. LOCAL-ONLY at authoring — P2-M1 review gates the
-- prod push (no db push in this session).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. room_file_measurements.source → add 'mesh' ──────────────────────────
-- Auto-named inline column CHECK from 00341 (verified on the live catalog:
-- pg_constraint conname = room_file_measurements_source_check).
ALTER TABLE public.room_file_measurements
  DROP CONSTRAINT IF EXISTS room_file_measurements_source_check;
ALTER TABLE public.room_file_measurements
  ADD  CONSTRAINT room_file_measurements_source_check
  CHECK (source IN ('anchor', 'parametric', 'mesh'));

COMMENT ON COLUMN public.room_file_measurements.source IS
  'Provenance of the number: anchor = grounded on a typed anchor; parametric = from the corrected RoomPlan graph; mesh = re-measured against the P2 dense fused mesh (00376, R-d/R114.3). Mesh evidence tightens ''measured''; ''verified'' still requires an anchor (rfm_anchor_source_shape).';

-- ─── 2. scan_pipeline_events.stage → add refine/fuse/splat/present ───────────
ALTER TABLE public.scan_pipeline_events
  DROP CONSTRAINT IF EXISTS scan_pipeline_events_stage_check;
ALTER TABLE public.scan_pipeline_events
  ADD  CONSTRAINT scan_pipeline_events_stage_check
  CHECK (stage IN (
    'capture', 'upload', 'ingest', 'solve', 'drawing', 'delivery',   -- P1 (00341)
    'refine',  'fuse',   'splat',  'present'                          -- P2 (00376)
  ));

COMMENT ON COLUMN public.scan_pipeline_events.stage IS
  'Coarse pipeline phase. P1 (00341): capture→upload→ingest→solve→drawing→delivery. P2 (00376): refine (SfM/BA), fuse (TSDF dense mesh), splat (3DGS training), present (Present-Layer lifecycle). event carries the specific name within the stage; detail carries the structured payload.';

-- ─── 3. room_files Present-Layer columns (append-only deliverable, R-f) ──────
ALTER TABLE public.room_files
  ADD COLUMN IF NOT EXISTS dense_mesh_url   text,          -- measurement-grade fused mesh (server/derived pointer)
  ADD COLUMN IF NOT EXISTS measure_mesh_url text,          -- decimated glb the browser raycasts against (click-to-measure)
  ADD COLUMN IF NOT EXISTS splat_url        text,          -- the SPZ walkthrough asset
  ADD COLUMN IF NOT EXISTS present          jsonb NOT NULL DEFAULT '{}'::jsonb,  -- Present-Layer manifest
  ADD COLUMN IF NOT EXISTS presented_at     timestamptz,
  ADD COLUMN IF NOT EXISTS present_status   text;          -- Present lifecycle, INDEPENDENT of status (True-Layer)

-- present_status lifecycle CHECK — named + guarded so the widened form is a no-op
-- on rerun (the column may already carry it from a prior apply).
ALTER TABLE public.room_files
  DROP CONSTRAINT IF EXISTS room_files_present_status_check;
ALTER TABLE public.room_files
  ADD  CONSTRAINT room_files_present_status_check
  CHECK (present_status IS NULL OR present_status IN
    ('pending', 'refining', 'fusing', 'training', 'ready', 'error'));

COMMENT ON COLUMN public.room_files.dense_mesh_url IS
  'Present Layer (00376): storage pointer to the measurement-grade dense fused mesh (TSDF, item 5). Server/derived; the measurement source of truth, not shipped to the browser.';
COMMENT ON COLUMN public.room_files.measure_mesh_url IS
  'Present Layer (00376): storage pointer to the decimated web mesh (measure_mesh.glb) — the invisible three.js raycast target for click-to-measure (item 9). The splat is never a measurement surface.';
COMMENT ON COLUMN public.room_files.splat_url IS
  'Present Layer (00376): storage pointer to the SPZ 3D-Gaussian-splat walkthrough asset (item 7). What she sees; never measured against.';
COMMENT ON COLUMN public.room_files.present IS
  'Present-Layer manifest (00376): { splat_format, gaussian_count, train_seconds, vram_peak_mb, mesh_vertices, refine_engine, sfm_residual_pct, masked_frames, splat_bytes, mesh_bytes }. Free-form so new telemetry needs no migration. NOT NULL DEFAULT ''{}'' — a P1-only version carries an empty manifest.';
COMMENT ON COLUMN public.room_files.present_status IS
  'Present-Layer lifecycle, INDEPENDENT of status (the True-Layer/drawings lifecycle): NULL (no Present Layer yet) → pending → refining → fusing → training → ready | error. Drawings can be ''generated'' while the splat is still training.';
COMMENT ON COLUMN public.room_files.presented_at IS
  'Present Layer (00376): when present_status reached ''ready''.';
