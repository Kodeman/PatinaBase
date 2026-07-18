-- 00375_site_request_media_maintenance.sql
-- P1 Site Request photo derivatives and retention enforcement.
--
-- Originals remain immutable evidence. Processing metadata is mutable only so
-- the service-role maintenance worker can append deterministic JPEG derivative
-- references and record an eventual retention purge. The worker removes only
-- media for closed/expired requests whose 90-day deadline has elapsed and whose
-- deliverable has never been approved into the append-only Binder.

ALTER TABLE public.site_deliverable_media
  ADD COLUMN IF NOT EXISTS derive_attempts integer NOT NULL DEFAULT 0
    CHECK (derive_attempts BETWEEN 0 AND 5),
  ADD COLUMN IF NOT EXISTS purged_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_site_deliverable_media_derive_queue
  ON public.site_deliverable_media(upload_state, derive_attempts, created_at)
  WHERE purged_at IS NULL
    AND upload_state IN ('uploaded','failed')
    AND derive_attempts < 5;

CREATE INDEX IF NOT EXISTS idx_site_deliverable_media_purged
  ON public.site_deliverable_media(purged_at)
  WHERE purged_at IS NOT NULL;

COMMENT ON COLUMN public.site_deliverable_media.derive_attempts IS
  'Bounded attempts by site-request-media-maintenance to create immutable JPEG thumbnail/preview derivatives.';
COMMENT ON COLUMN public.site_deliverable_media.purged_at IS
  'Server-confirmed deletion time for an unapproved original and its derivatives after the parent request retention deadline.';

DO $cron$
DECLARE
  v_job_id bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    SELECT jobid INTO v_job_id
    FROM cron.job
    WHERE jobname = 'site-request-media-maintenance';
    IF v_job_id IS NOT NULL THEN
      PERFORM cron.unschedule(v_job_id);
    END IF;
    PERFORM cron.schedule(
      'site-request-media-maintenance',
      '*/5 * * * *',
      $$SELECT public.invoke_edge_function('site-request-media-maintenance', '{}'::jsonb);$$
    );
  END IF;
END
$cron$;

DO $comment$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    EXECUTE $C$COMMENT ON EXTENSION pg_cron IS 'pg_cron schedules: see cron.job for the authoritative registry. Site Request P1: site-request-lifecycle every 15 minutes handles dispatch/expiry/reminders; site-request-media-maintenance every 5 minutes creates JPEG derivatives and purges unapproved evidence after its 90-day retention deadline. Earlier schedules are unchanged.'$C$;
  END IF;
END
$comment$;
