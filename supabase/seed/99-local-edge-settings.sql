-- 99-local-edge-settings.sql — LOCAL-ONLY (Arrival Arc Wave 2, I65 find 6)
--
-- public.invoke_edge_function (00258) silently no-ops when
-- app.settings.supabase_url / app.settings.service_role_key are unset — on
-- prod they live in Vault; locally NOTHING seeded them, so every cron/trigger/
-- RPC → edge-function bridge was a silent no-op in dev (I65). This seed stores
-- them in the LOCAL stack's Vault, exactly the mechanism app_setting() reads
-- first on prod. (ALTER DATABASE ... SET app.settings.* was tried and fails
-- 42501 here just as on Cloud — the seed role isn't superuser.)
--
-- Values are the Supabase CLI's standard local development stack constants:
--   · the URL is Kong's DOCKER-INTERNAL address (supabase_kong_<project_id>,
--     project_id = "supabase" in config.toml). pg_net runs inside the postgres
--     container, where 127.0.0.1:54321 is NOT Kong — connectivity verified
--     with an in-container probe (HTTP 200).
--   · the service_role key is an HS256 JWT signed with the CLI's standard
--     local JWT secret ("super-secret-jwt-token-with-at-least-32-…"), NOT the
--     ES256 demo key `supabase status` prints: the local edge runtime's
--     verify_jwt only validates HS256 against that secret (the ES256 key
--     401s at the runtime — verified live), while Kong passes either. Public
--     demo material; grants nothing outside this machine's dev stack.
--
-- Seed files run ONLY on local `supabase db reset` (config.toml [db.seed]);
-- prod never executes them. Delete-then-create keeps resets idempotent
-- (vault.create_secret would otherwise stack duplicate names). Exception-
-- guarded: a stack without Vault degrades to the pre-seed no-op with a
-- warning, never a failed reset.

DO $$
BEGIN
  DELETE FROM vault.secrets
   WHERE name IN ('app.settings.supabase_url', 'app.settings.service_role_key');

  PERFORM vault.create_secret(
    'http://supabase_kong_supabase:8000',
    'app.settings.supabase_url'
  );

  PERFORM vault.create_secret(
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MjA5OTU3MzI4NX0.nOrj2itxbSUKwo8vF4pqol4eTmvKx6cmtAk_Iaag23g',
    'app.settings.service_role_key'
  );

  RAISE NOTICE '99-local-edge-settings: vault-seeded app.settings.supabase_url + service_role_key (local dev only)';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '99-local-edge-settings: vault unavailable (%) — invoke_edge_function stays a silent no-op locally', sqlerrm;
END $$;
