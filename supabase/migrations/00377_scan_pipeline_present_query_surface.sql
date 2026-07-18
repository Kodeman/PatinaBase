-- ═══════════════════════════════════════════════════════════════════════════
-- 00377 — Field Capture P2 · Present-Layer query surface (Part D.3, item 11)
--
-- WHAT THIS IS
--   The P2 telemetry surface: extends the item-13 read views (00372) to span the
--   new GPU/present stages, and adds a per-deliverable Present-Layer stats view
--   for the GPU-budget + artifact-size distribution (B.2 / R114.2).
--
--   1. scan_pipeline_runs  (CREATE OR REPLACE, 00372 → 00377)
--        + refine_ms / fuse_ms / splat_ms  (from refine.succeeded / fuse.succeeded
--          / splat.succeeded events, same idiom as ingest_ms/solve_ms)
--        + present_status  (the latest room_file's Present lifecycle)
--        New columns are APPENDED at the end of the SELECT — CREATE OR REPLACE VIEW
--        forbids reordering/removing/retyping existing output columns.
--   2. scan_present_stats  (new)
--        Per room_file: Gaussian count, train seconds, VRAM peak, mesh vertices,
--        refine engine, SfM residual, masked frames, and SPZ+mesh byte sizes —
--        all read from the room_files.present manifest (00376) + present_status.
--        Byte sizes ride the manifest (present->>'splat_bytes'/'mesh_bytes') so no
--        column churn; the GPU-budget cap (R114.2) is read off this surface.
--
-- HOUSE STYLE, unchanged from 00372: the underlying tables carry DELEGATED-read
-- RLS (owner/designer/studio via room_scans), which is NOT admin visibility. So
-- both views are SECURITY DEFINER (security_invoker = false) and self-gate to
-- admins in the WHERE via the exact admin-domain EXISTS idiom (00297/00300).
-- auth.uid() resolves to the CALLING user inside a definer view, so a non-admin
-- caller sees zero rows and a service-role caller (no auth.uid()) also sees zero.
--
-- GRANTS: scan_present_stats is new → GRANT SELECT TO authenticated (gated in the
-- body). Adding a GRANT means the legacy-grants seed is regenerated alongside
-- (scripts/generate-legacy-grants.py), as 00372 did. scan_pipeline_runs keeps its
-- 00372 grant across CREATE OR REPLACE; re-affirmed here for explicitness.
--
-- Numbering: ledger head 00375 at write time; 00376 (present schema) precedes this
-- so room_files.present/present_status and the widened event stage exist before
-- these views read them. LOCAL-ONLY at authoring — P2-M1 review gates the push.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. scan_pipeline_runs — + refine/fuse/splat durations + present_status ──
CREATE OR REPLACE VIEW public.scan_pipeline_runs
WITH (security_invoker = false) AS
SELECT
  rs.id                          AS scan_id,
  rs.user_id,
  rs.name                        AS scan_name,
  rs.status                      AS scan_status,
  rf.id                          AS room_file_id,
  rf.version                     AS room_file_version,
  rf.status                      AS room_file_status,
  rf.unverified,
  rf.tolerance_class,
  rf.anchor_count,
  ev.ingest_ms,
  ev.solve_ms,
  ev.drawing_ms,
  ev.first_event_at,
  ev.last_event_at,
  EXTRACT(EPOCH FROM (ev.last_event_at - ev.first_event_at))::int AS wall_seconds,
  ev.event_count,
  ev.failed_events,
  t.task_type                    AS last_task_type,
  t.status                       AS last_task_status,
  t.attempts                     AS last_task_attempts,
  t.last_error,
  -- ── P2 additions (appended — CREATE OR REPLACE VIEW is append-only) ──
  ev.refine_ms,
  ev.fuse_ms,
  ev.splat_ms,
  rf.present_status
FROM public.room_scans rs
LEFT JOIN LATERAL (
  SELECT rf2.*
    FROM public.room_files rf2
   WHERE rf2.scan_id = rs.id
   ORDER BY rf2.version DESC
   LIMIT 1
) rf ON true
LEFT JOIN LATERAL (
  SELECT
    max(e.duration_ms) FILTER (WHERE e.event = 'ingest.succeeded')   AS ingest_ms,
    max(e.duration_ms) FILTER (WHERE e.event = 'solve.succeeded')    AS solve_ms,
    max(e.duration_ms) FILTER (WHERE e.event = 'delivery.published') AS drawing_ms,
    max(e.duration_ms) FILTER (WHERE e.event = 'refine.succeeded')   AS refine_ms,
    max(e.duration_ms) FILTER (WHERE e.event = 'fuse.succeeded')     AS fuse_ms,
    max(e.duration_ms) FILTER (WHERE e.event = 'splat.succeeded')    AS splat_ms,
    min(e.created_at)                                                AS first_event_at,
    max(e.created_at)                                                AS last_event_at,
    count(*)                                                         AS event_count,
    count(*) FILTER (WHERE e.status = 'failed')                      AS failed_events
  FROM public.scan_pipeline_events e
  WHERE e.scan_id = rs.id
) ev ON true
LEFT JOIN LATERAL (
  SELECT at.task_type, at.status, at.attempts, at.last_error
    FROM public.agent_tasks at
   WHERE at.entity_id = rs.id
     AND at.task_type LIKE 'scan_pipeline.%'
   ORDER BY at.created_at DESC
   LIMIT 1
) t ON true
WHERE ev.first_event_at IS NOT NULL      -- only scans with pipeline activity
  AND EXISTS (
    SELECT 1
      FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
     WHERE ur.user_id = auth.uid()
       AND r.domain = 'admin'
  );

COMMENT ON VIEW public.scan_pipeline_runs IS
  'Telemetry surface (00372 → 00377): per-scan run summary — stage durations (ingest/solve/drawing + P2 refine/fuse/splat ms), wall time, latest room_file version/status/tolerance/present_status, and the last scan_pipeline.* task status/attempts/error. SECURITY DEFINER + admin-domain WHERE gate (house idiom over delegated-RLS event tables).';

-- ─── 2. scan_present_stats — per-deliverable Present-Layer stats (item 11) ───
-- Cast-robustness note (P2-M1 review, no DDL change): the numeric columns below
-- cast present->>'key' (jsonb text) to bigint/numeric/int. An ABSENT key yields
-- SQL NULL → NULL::type is safe (missing stat reads NULL). The load-bearing
-- assumption is that the WORKER writes each of these as a JSON NUMBER, so ->>
-- returns clean numeric text; a malformed value (empty string or non-numeric)
-- would raise on cast and dark-fail the WHOLE view for every row. The worker
-- (10.2–10.5 telemetry) is the sole writer and emits numbers, so this holds as a
-- contract. If a future writer could emit '' / non-numeric, wrap each cast as
-- NULLIF(present->>'key','')::type (or a guarded cast) so one bad manifest value
-- can never blank the telemetry surface for all deliverables. Flagged, not fixed
-- (would be a DDL change; the current writer makes it unnecessary).
CREATE OR REPLACE VIEW public.scan_present_stats
WITH (security_invoker = false) AS
SELECT
  rf.id                                        AS room_file_id,
  rf.scan_id,
  rf.version,
  rf.present_status,
  rf.presented_at,
  (rf.present ->> 'splat_format')              AS splat_format,
  (rf.present ->> 'refine_engine')             AS refine_engine,
  (rf.present ->> 'gaussian_count')::bigint    AS gaussian_count,
  (rf.present ->> 'train_seconds')::numeric    AS train_seconds,
  (rf.present ->> 'vram_peak_mb')::numeric     AS vram_peak_mb,
  (rf.present ->> 'mesh_vertices')::bigint     AS mesh_vertices,
  (rf.present ->> 'sfm_residual_pct')::numeric AS sfm_residual_pct,
  (rf.present ->> 'masked_frames')::int        AS masked_frames,
  (rf.present ->> 'splat_bytes')::bigint       AS splat_bytes,
  (rf.present ->> 'mesh_bytes')::bigint        AS mesh_bytes,
  (rf.splat_url        IS NOT NULL)            AS has_splat,
  (rf.dense_mesh_url   IS NOT NULL)            AS has_dense_mesh,
  (rf.measure_mesh_url IS NOT NULL)            AS has_measure_mesh
FROM public.room_files rf
WHERE rf.present_status IS NOT NULL           -- only versions that entered the Present lifecycle
  AND EXISTS (
    SELECT 1
      FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
     WHERE ur.user_id = auth.uid()
       AND r.domain = 'admin'
  );

COMMENT ON VIEW public.scan_present_stats IS
  'Telemetry surface (00377): per room_file Present-Layer stats — gaussian_count, train_seconds, vram_peak_mb, mesh_vertices, sfm_residual_pct, masked_frames, SPZ+mesh byte sizes (all read off the room_files.present manifest, 00376), plus present_status/presented_at and artifact-presence flags. The GPU-budget (B.2/R114.2 ≤10-min, amber ~20-min) reads here. SECURITY DEFINER + admin-domain WHERE gate.';

-- ─── 3. Grants — admin-console reads (authenticated; gated in the view body) ─
GRANT SELECT ON public.scan_pipeline_runs   TO authenticated;   -- re-affirm across CREATE OR REPLACE
GRANT SELECT ON public.scan_present_stats   TO authenticated;   -- new → legacy-grants seed regenerated
