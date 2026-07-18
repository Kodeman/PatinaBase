-- ═══════════════════════════════════════════════════════════════════════════
-- 00372 — Field Capture P1 · scan-pipeline telemetry query surface (item 13)
--
-- The "minimal query surface" the item-13 AC calls for: two READ-ONLY views over
-- the append-only scan_pipeline_events (00341) + agent_tasks (00297) + room_files
-- / room_file_measurements (00341) so ops can read a scan's run timeline and a
-- deliverable's tolerance distribution without bespoke SQL each time.
--
--   • scan_pipeline_runs           — per scan: stage durations, wall time,
--                                     current room_file version/status, the last
--                                     scan_pipeline.* task's status/attempts/error.
--   • scan_tolerance_distribution  — per room_file: measurement counts + p50/p95
--                                     tolerance_mm by tolerance_class.
--
-- Admin-domain read, HOUSE STYLE for a VIEW: the underlying event/file/measurement
-- tables carry DELEGATED-read RLS (owner/designer/studio via room_scans — 00341),
-- which is NOT admin visibility. So these views are SECURITY DEFINER
-- (security_invoker = false → they read the underlying rows as the view owner,
-- bypassing the delegated RLS) and self-gate to admins in the WHERE via the exact
-- admin-domain EXISTS idiom used by agent_tasks/job_runs (00297/00300). auth.uid()
-- still resolves to the CALLING user inside a definer view (it reads the JWT
-- claim), so a non-admin caller sees zero rows; a service-role caller (no
-- auth.uid()) also sees zero — these are admin-console reads, not worker reads.
--
-- Migration numbering: head was 00371 at write time (00370 scan-pipeline + BOH's
-- 00371_fulfillment_create_vendor from a parallel session); 00372 is the next
-- clear number. Adds GRANTs → the legacy-grants seed is regenerated alongside.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. scan_pipeline_runs — per-scan run summary ───────────────────────────
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
  t.last_error
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
  'Item-13 telemetry surface (00372): per-scan run summary — stage durations (ms), wall time, latest room_file version/status/tolerance, and the last scan_pipeline.* task status/attempts/error. SECURITY DEFINER + admin-domain WHERE gate (house idiom over delegated-RLS event tables).';

-- ─── 2. scan_tolerance_distribution — per-deliverable tolerance stats ────────
CREATE OR REPLACE VIEW public.scan_tolerance_distribution
WITH (security_invoker = false) AS
SELECT
  m.room_file_id,
  m.scan_id,
  m.tolerance_class,
  count(*)                                                              AS measurement_count,
  count(m.tolerance_mm)                                                 AS with_tolerance,
  percentile_cont(0.5)  WITHIN GROUP (ORDER BY m.tolerance_mm)          AS p50_tolerance_mm,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY m.tolerance_mm)          AS p95_tolerance_mm,
  min(m.tolerance_mm)                                                   AS min_tolerance_mm,
  max(m.tolerance_mm)                                                   AS max_tolerance_mm
FROM public.room_file_measurements m
WHERE EXISTS (
    SELECT 1
      FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
     WHERE ur.user_id = auth.uid()
       AND r.domain = 'admin'
  )
GROUP BY m.room_file_id, m.scan_id, m.tolerance_class;

COMMENT ON VIEW public.scan_tolerance_distribution IS
  'Item-13 telemetry surface (00372): per room_file tolerance distribution — measurement counts + p50/p95/min/max tolerance_mm by tolerance_class (verified/measured/estimated). percentile_cont ignores NULL (RoomPlan-invented) tolerances. SECURITY DEFINER + admin-domain WHERE gate.';

-- ─── 3. Grants — admin-console reads (authenticated; gated in the view body) ─
GRANT SELECT ON public.scan_pipeline_runs          TO authenticated;
GRANT SELECT ON public.scan_tolerance_distribution TO authenticated;
