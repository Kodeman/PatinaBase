-- ═══════════════════════════════════════════════════════════════════════════
-- 00303 — Agent OS: Cowork intake bridge state + cron (WP-1.5)
--
-- public.bridge_state is a tiny durable cursor table for the Cowork → agent_tasks
-- intake bridge (supabase/functions/cowork-intake-bridge). One row per bridge
-- (today just 'cowork_ops_inbox'). It persists the Microsoft Graph delta token
-- so restarts resume without reprocessing, plus a last-run status/error surface
-- the Run Log (00300 job_runs) and ops can read. Writes are service-role only
-- (the bridge edge fn); admins may SELECT it (admin-domain RLS, 00297 idiom).
--
-- The bridge is invoked every 30 min by pg_cron via the 00081/00258
-- invoke_edge_function bridge (which POSTs an apikey + service-role Bearer, so
-- the edge fn keeps verify_jwt = true). Until Kody runs the Entra checklist
-- (docs/agent-os/entra-bridge-setup.md), the edge fn is credential-gated: with
-- no MSGRAPH_* secrets it records last_status='skipped_no_creds' and returns
-- 200 — a graceful no-op, not an error.
--
-- Idempotent DDL throughout (IF NOT EXISTS, DROP POLICY IF EXISTS, guarded cron,
-- ON CONFLICT DO NOTHING seed) so this file re-applies cleanly.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. bridge_state — the delta cursor + last-run surface ──────────────────
CREATE TABLE IF NOT EXISTS public.bridge_state (
  bridge          text PRIMARY KEY,
  delta_link      text,
  last_run_at     timestamptz,
  last_status     text CHECK (last_status IS NULL OR last_status IN ('ok','skipped_no_creds','error','rate_limited')),
  last_error      text,
  items_processed int NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.bridge_state IS
  'Agent OS (00303): per-bridge cursor for the Cowork intake bridge. Holds the Microsoft Graph delta_link (resumes without reprocessing) plus last_run_at/last_status/last_error/items_processed. Written only by the cowork-intake-bridge edge fn (service_role); admin-domain SELECT via RLS.';

-- ─── 2. RLS — admin-domain reads; writes via service_role only ──────────────
ALTER TABLE public.bridge_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bridge_state_select_admin ON public.bridge_state;
CREATE POLICY bridge_state_select_admin
  ON public.bridge_state FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
        AND r.domain = 'admin'
    )
  );

-- No INSERT/UPDATE/DELETE policy: the bridge writes as service_role (bypasses
-- RLS). Post-flip explicit grant for the admin SELECT above.
GRANT SELECT ON public.bridge_state TO authenticated;

-- ─── 3. Seed the single bridge row ──────────────────────────────────────────
INSERT INTO public.bridge_state (bridge, last_status)
VALUES ('cowork_ops_inbox', NULL)
ON CONFLICT (bridge) DO NOTHING;

-- ─── 4. pg_cron — invoke the bridge every 30 minutes ────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cowork-intake-bridge') THEN
    PERFORM cron.unschedule('cowork-intake-bridge');
  END IF;
END $$;

SELECT cron.schedule(
  'cowork-intake-bridge',
  '*/30 * * * *',
  $$SELECT public.invoke_edge_function('cowork-intake-bridge', '{}'::jsonb);$$
);

-- Best-effort registry comment (00189/00250/00300 idiom — pg_cron is owned by
-- supabase_admin on self-hosted, so a postgres-run migration may lack privilege;
-- cron.job is the authoritative registry). Carries forward 00300's text and
-- adds the intake bridge.
DO $$ BEGIN
  EXECUTE $C$COMMENT ON EXTENSION pg_cron IS 'pg_cron schedules: see cron.job for the full registry. Agent OS: agent-queue-groom (every 6h at :23, 00300 -> groom_agent_tasks), cowork-intake-bridge (every 30 min, 00303 -> invoke_edge_function cowork-intake-bridge: sweeps the SharePoint Ops Inbox into agent_tasks; credential-gated until Entra setup). Aesthete engine: aesthete-embed (1 min), aesthete-dna-draft (2 min), aesthete-behavior-stats (03:20), aesthete-quiz-janitor (03:45), aesthete-jobs-janitor (10 min, 00250), aesthete-drift-audit (Sun 04:00, 00250). Earlier: decision-reminders-daily, expire-decisions-daily, invoice-reminders-daily, po-payments-due-daily, delivery-this-week-weekly, review-requests, proposal, digest, A/B winner, margin pulse crons, notification-digest-daily (00278), field-daily (00284).'$C$;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
