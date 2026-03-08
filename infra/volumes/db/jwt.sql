-- =============================================================================
-- SUPABASE JWT FUNCTIONS
-- Functions for JWT token generation and verification
-- =============================================================================

-- Extension for cryptographic functions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- pgjwt extension for JWT handling
CREATE EXTENSION IF NOT EXISTS pgjwt;

-- Function to get JWT secret from app settings
CREATE OR REPLACE FUNCTION auth.jwt_secret()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    current_setting('app.settings.jwt_secret', true),
    current_setting('pgrst.jwt_secret', true)
  )
$$;

-- Function to get JWT expiry
CREATE OR REPLACE FUNCTION auth.jwt_exp()
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    current_setting('app.settings.jwt_exp', true),
    '3600'
  )::integer
$$;
