-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: patch invoke_edge_function to send both apikey + Authorization
-- Description: The self-hosted Kong gateway (at http://kong:8000) applies the
--              key-auth plugin which looks for the `apikey` header. Edge
--              Runtime with VERIFY_JWT=true separately checks
--              `Authorization: Bearer <jwt>`. Migration 00079 sent only the
--              Bearer header, which would pass edge-runtime JWT verification
--              but be rejected by Kong. This redefines invoke_edge_function
--              to send both headers so traffic succeeds end-to-end.
--
-- Idempotent: CREATE OR REPLACE FUNCTION. No re-scheduling needed; existing
-- pg_cron jobs continue using the same function signature.
-- ═══════════════════════════════════════════════════════════════════════════

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
      'apikey', v_key,
      'Authorization', 'Bearer ' || v_key
    ),
    body := body,
    timeout_milliseconds := 60000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;
