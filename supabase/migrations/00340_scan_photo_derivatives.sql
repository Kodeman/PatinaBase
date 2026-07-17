-- ═══════════════════════════════════════════════════════════════════════════
-- 00340 — Room View HEIC→JPEG derivative lane bookkeeping + sweep cron
--
-- Sibling to 00338's GLB lane, for the photo derivative lane (I78, blessed
-- code-only). Every room_scan_images row lands as image/heic — undecodable in
-- Chrome/Firefox — and iOS never uploads the thumbnail it builds locally, so
-- thumbnail_url is NULL on every prod row. The derive-scan-photo-media edge
-- function (the writer here) drives aesthete-inference /convert/heic-to-jpeg to
-- turn each HEIC into a 512px thumbnail + a 1600px preview, uploads both to
-- photo_derivatives/{uid}/{seg3}/{stem}_{size}.jpg in the room-scans bucket
-- (00287-compatible pathing), and stamps thumbnail_url + preview_url.
--
-- Three pieces:
--
--   1. Derivative bookkeeping on public.room_scan_images:
--        • derive_attempts — bumped on each failed derive; the sweep skips a
--          row once it reaches 5 (terminal park).
--        • derive_error    — last failure reason (truncated), for triage.
--        • preview_url     — public URL of the 1600px JPEG preview (the 512px
--          thumbnail lands on the existing thumbnail_url column).
--
--   2. Partial index backing the sweep predicate (pending HEIC rows only), so
--      the every-5-minutes sweep never scans the full table.
--
--   3. Guarded sweep cron, room-scan-photo-derivative-sweep */5 * * * * ->
--      derive-scan-photo-media, through public.invoke_edge_function (00258
--      Vault-backed cron->edge bridge, service-role Bearer). The edge function
--      is a no-op when its work set is empty, so an early cron (before the
--      function is deployed) is harmless.
--
-- Additive only. No new GRANT/REVOKE: the three columns are added to an existing
-- table and inherit its table-level privileges, so the legacy-grants seed
-- (seed/00-legacy-grants.sql) does NOT need regenerating.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Derivative bookkeeping columns (additive) ──────────────────────────
ALTER TABLE public.room_scan_images
  ADD COLUMN IF NOT EXISTS derive_attempts int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS derive_error    text,
  ADD COLUMN IF NOT EXISTS preview_url     text;

COMMENT ON COLUMN public.room_scan_images.derive_attempts IS
  'Room View (00340): failed HEIC->JPEG derive attempts. derive-scan-photo-media bumps this on failure and the sweep parks the row at 5.';
COMMENT ON COLUMN public.room_scan_images.derive_error IS
  'Room View (00340): last HEIC->JPEG derive failure reason (truncated), for triage.';
COMMENT ON COLUMN public.room_scan_images.preview_url IS
  'Room View (00340): public URL of the 1600px JPEG preview written by derive-scan-photo-media (thumbnail_url carries the 512px thumb). Portal signs at read (I79).';

-- ─── 2. Partial index backing the sweep predicate ──────────────────────────
-- Sweep = thumbnail_url IS NULL AND mime_type='image/heic' AND derive_attempts < 5,
-- created_at asc. The index covers the two static predicates + order column;
-- derive_attempts is left to a cheap filter (only 0..5 values).
CREATE INDEX IF NOT EXISTS idx_room_scan_images_derive_pending
  ON public.room_scan_images (created_at)
  WHERE thumbnail_url IS NULL AND mime_type = 'image/heic';

-- ─── 3. Sweep cron ─────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Guarded (re)schedule: unschedule any prior job of the same name first, then
-- reschedule. Cron bodies schema-qualify every relation (pg_cron runs under the
-- scheduling role's search_path, not this migration's).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'room-scan-photo-derivative-sweep') THEN
    PERFORM cron.unschedule('room-scan-photo-derivative-sweep');
  END IF;
END $$;

SELECT cron.schedule(
  'room-scan-photo-derivative-sweep',
  '*/5 * * * *',
  $$SELECT public.invoke_edge_function('derive-scan-photo-media', '{}'::jsonb);$$
);

-- Best-effort registry comment (00300/00304/00307/00308/00338 idiom — pg_cron is
-- owned by supabase_admin on self-hosted, so a postgres-run migration may lack
-- privilege; cron.job is the authoritative registry). Carries 00338's text (the
-- newest) and adds the Room View photo derivative sweep.
DO $$ BEGIN
  EXECUTE $C$COMMENT ON EXTENSION pg_cron IS 'pg_cron schedules: see cron.job for the full registry. Agent OS: agent-queue-groom (every 6h at :23, 00300), stripe-event-processor (every 5m, 00304), catalog-normalizer (00307), concierge-discrepancy-daily (10:15 UTC, 00308). Room View: room-scan-parse-sweep (every 10m, 00338 -> parse-room-scan: lands 00337 geometry), room-scan-glb-sweep (every 15m, 00338 -> convert-room-scan-glb: USDZ->GLB archival, stamps room_scans.model_url_gltf; history in job_runs), room-scan-photo-derivative-sweep (every 5m, 00340 -> derive-scan-photo-media: HEIC->JPEG 512 thumb + 1600 preview, stamps room_scan_images.thumbnail_url/preview_url; history in job_runs). Aesthete engine + earlier crons unchanged (see prior registry text / cron.job).'$C$;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
