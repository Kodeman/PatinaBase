-- =============================================================================
-- SUPABASE REALTIME
-- Schema and configuration for real-time subscriptions
-- =============================================================================

-- Create realtime schema
CREATE SCHEMA IF NOT EXISTS _realtime;
GRANT USAGE ON SCHEMA _realtime TO postgres, anon, authenticated, service_role;

-- Realtime messages table (if needed for custom implementations)
CREATE TABLE IF NOT EXISTS _realtime.messages (
  id bigserial PRIMARY KEY,
  topic text NOT NULL,
  extension text NOT NULL,
  payload jsonb,
  event text,
  private boolean DEFAULT false,
  updated_at timestamp with time zone DEFAULT now(),
  inserted_at timestamp with time zone DEFAULT now()
);

ALTER TABLE _realtime.messages ENABLE ROW LEVEL SECURITY;

-- Index for performance
CREATE INDEX IF NOT EXISTS messages_topic_idx ON _realtime.messages (topic);

-- Grant permissions
GRANT ALL ON _realtime.messages TO postgres;
GRANT SELECT ON _realtime.messages TO anon, authenticated, service_role;

-- Realtime subscription tracking (for connection management)
CREATE TABLE IF NOT EXISTS _realtime.subscription (
  id bigserial PRIMARY KEY,
  subscription_id uuid NOT NULL,
  entity regclass NOT NULL,
  filters jsonb DEFAULT '[]'::jsonb,
  claims jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE _realtime.subscription ENABLE ROW LEVEL SECURITY;

-- Function to broadcast changes
CREATE OR REPLACE FUNCTION _realtime.broadcast_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM pg_notify(
    'realtime:broadcast',
    json_build_object(
      'schema', TG_TABLE_SCHEMA,
      'table', TG_TABLE_NAME,
      'type', TG_OP,
      'record', CASE
        WHEN TG_OP = 'DELETE' THEN row_to_json(OLD)
        ELSE row_to_json(NEW)
      END,
      'old_record', CASE
        WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD)
        ELSE NULL
      END
    )::text
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
