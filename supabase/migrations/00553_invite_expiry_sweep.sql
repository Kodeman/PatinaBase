-- ═══════════════════════════════════════════════════════════════════════════
-- 00553 — daily sweep of long-dead studio invites
--
-- workspace-member-invite commits an organization_members row at
-- status='invited' with a 7-day invitation_expires_at before it attempts the
-- email. A membership that is never accepted therefore sits 'invited'
-- forever, keeps its slot in the unique (user_id, organization_id) index, and
-- keeps appearing on the studio roster.
--
-- This sweep flips rows whose invite expired more than 30 days ago (i.e. ~37
-- days after it was issued) to 'removed' — the same terminal state an admin
-- revoking an invite produces, so nothing downstream needs a new case. The
-- 30-day grace past expiry is deliberate: re-inviting inside that window
-- refreshes the SAME row (the upsert in workspace-member-invite), so a
-- tighter sweep would race an ordinary re-invite.
--
-- Plain SQL in the cron body — no RPC, no edge function, nothing to grant.
-- Every relation is schema-qualified because pg_cron runs the body under the
-- scheduling role's search_path, not this migration's.
--
-- Registration follows the guarded (re)schedule idiom of 00491/00501:
-- unschedule-if-exists, then schedule, so a replay is a no-op.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-stale-workspace-invites-daily') THEN
    PERFORM cron.unschedule('expire-stale-workspace-invites-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'expire-stale-workspace-invites-daily',
  '40 7 * * *',
  $$UPDATE public.organization_members
       SET status = 'removed',
           updated_at = now()
     WHERE status = 'invited'
       AND invitation_expires_at IS NOT NULL
       AND invitation_expires_at < now() - interval '30 days';$$
);

-- Best-effort registry comment (pg_cron is owned by supabase_admin on
-- self-hosted, so a postgres-run migration may lack privilege; cron.job is
-- the authoritative registry regardless — same guard as 00181/00491/00501).
DO $$ BEGIN
  EXECUTE $C$COMMENT ON EXTENSION pg_cron IS 'pg_cron schedules: see cron.job for the authoritative registry. Studio onboarding (00553): expire-stale-workspace-invites-daily at 07:40 UTC -> plain SQL flipping organization_members rows stuck at invited with invitation_expires_at older than 30 days to removed. Rendered Room v2 (00491): dispatch-scan-modal-sweep every 5 minutes. Rendered Room v2 (00501): expire-stale-upload-intents-daily at 07:15 UTC -> public.expire_stale_upload_intents() directly (no edge function), transitioning stale pending upload-interface media_objects rows to expired. Room View, Agent OS, BOH, Field Site Request, Mood Board, invoice/decision reminders, and earlier schedules are unchanged (see prior registry text / cron.job).'$C$;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
