-- =============================================================================
-- SUPABASE WEBHOOKS
-- Database triggers and functions for webhook notifications
-- =============================================================================

-- Create supabase_functions schema
CREATE SCHEMA IF NOT EXISTS supabase_functions;
GRANT USAGE ON SCHEMA supabase_functions TO postgres, anon, authenticated, service_role;

-- HTTP Extension (for making HTTP requests from PostgreSQL)
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

-- pg_net Extension (async HTTP requests)
-- Note: pg_net may not be available in all PostgreSQL images
-- CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Webhook helper function
CREATE OR REPLACE FUNCTION supabase_functions.http_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = supabase_functions
AS $$
DECLARE
  request_id bigint;
  payload jsonb;
  url text;
  headers jsonb := '{"Content-Type": "application/json"}'::jsonb;
BEGIN
  -- Build the payload
  payload := jsonb_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA,
    'record', CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD) ELSE row_to_json(NEW) END,
    'old_record', CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END
  );

  -- Return appropriately
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
