-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: pg_cron schedules for edge function workers
-- Description: Installs recurring jobs that invoke campaign-scheduler,
--              automation-processor, and the 3 engagement check functions.
--              Uses pg_net for the HTTP POST to the Supabase Functions URL.
--
-- Requirements (set per-environment via Supabase dashboard SQL editor or
-- `supabase secrets set`):
--   - app.settings.supabase_url          (e.g. https://api.patina.cloud)
--   - app.settings.service_role_key      (same value as SUPABASE_SERVICE_ROLE_KEY)
--
-- These are also required by migration 00042_lead_notification_triggers.sql.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ─── Helper: invoke an Edge Function with a POST ──────────────────────────
-- Uses the same pattern as 00042; keeps all cron bodies small.

CREATE OR REPLACE FUNCTION invoke_edge_function(fn_name TEXT, body JSONB DEFAULT '{}'::jsonb)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url TEXT;
  v_key TEXT;
  v_request_id BIGINT;
BEGIN
  v_url := current_setting('app.settings.supabase_url', true);
  v_key := current_setting('app.settings.service_role_key', true);

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'invoke_edge_function: missing app.settings.supabase_url or service_role_key; skipping %', fn_name;
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := v_url || '/functions/v1/' || fn_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := body,
    timeout_milliseconds := 60000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

-- ─── Unschedule any prior versions (idempotent) ───────────────────────────

DO $$
BEGIN
  PERFORM cron.unschedule('campaign-scheduler');
  PERFORM cron.unschedule('automation-processor');
  PERFORM cron.unschedule('price-drop-check');
  PERFORM cron.unschedule('lead-expiration-check');
  PERFORM cron.unschedule('back-in-stock-check');
EXCEPTION WHEN OTHERS THEN
  -- unschedule() throws if the job doesn't exist; that's fine on first install.
  NULL;
END;
$$;

-- ─── Schedules ────────────────────────────────────────────────────────────

-- Campaign scheduler: fires every 5 minutes to pick up `scheduled` campaigns.
SELECT cron.schedule(
  'campaign-scheduler',
  '*/5 * * * *',
  $$SELECT invoke_edge_function('campaign-scheduler');$$
);

-- Automation processor: fires every 5 minutes to advance drip sequences.
SELECT cron.schedule(
  'automation-processor',
  '*/5 * * * *',
  $$SELECT invoke_edge_function('automation-processor');$$
);

-- Price drop check: hourly. Scans wishlists for items that dropped in price.
SELECT cron.schedule(
  'price-drop-check',
  '0 * * * *',
  $$SELECT invoke_edge_function('price-drop-check');$$
);

-- Lead expiration check: hourly. Finds leads about to expire and notifies.
SELECT cron.schedule(
  'lead-expiration-check',
  '0 * * * *',
  $$SELECT invoke_edge_function('lead-expiration-check');$$
);

-- Back-in-stock check: hourly. Finds previously out-of-stock items now live.
SELECT cron.schedule(
  'back-in-stock-check',
  '0 * * * *',
  $$SELECT invoke_edge_function('back-in-stock-check');$$
);

-- ─── RLS: only superusers see cron.job rows ───────────────────────────────
-- pg_cron manages its own tables. Nothing to configure here; access is
-- already restricted to superuser / postgres roles.
