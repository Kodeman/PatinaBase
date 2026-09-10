-- PatinaWebsite: persist the existing POST /api/contact payload.
-- Intended target: the owner-confirmed hosted Supabase Cloud project Strata,
-- project reference bkvcixdmuyejfzcijpdg,
-- https://bkvcixdmuyejfzcijpdg.supabase.co.
-- Earlier repository instructions naming a self-hosted API were superseded
-- by the owner's database correction on 10 September 2026.
--
-- Execution status belongs in docs/launch/living-study/DEPLOYMENT-RECORD.md.
-- No existing website migration directory was present, so this file establishes
-- the conventional supabase/migrations path for this additive website change.
-- The cross-platform schema owner may import it into its migration history.
--
-- Apply through the authorized Supabase apply_migration connection or the SQL
-- editor for this confirmed project. Check the project reference before applying.
-- Connection credentials belong in the operator's existing secure environment,
-- never in this file, command arguments, or the application bundle.
--
-- CREATE TABLE intentionally has no IF NOT EXISTS: if another deployment has
-- created this relation, stop for a schema review rather than changing its ACLs.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE public.contact_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    email text NOT NULL,
    reason text NOT NULL DEFAULT 'general',
    message text NOT NULL,
    posthog_distinct_id text,
    user_agent text,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT contact_messages_name_nonempty CHECK (btrim(name) <> ''),
    CONSTRAINT contact_messages_email_nonempty CHECK (btrim(email) <> ''),
    CONSTRAINT contact_messages_message_nonempty CHECK (btrim(message) <> '')
);

CREATE INDEX contact_messages_created_at_idx
    ON public.contact_messages (created_at DESC);

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

-- Contact text and sender details are private. Supabase installations can grant
-- default table privileges to API roles, so explicitly remove inherited object
-- grants on this newly created table before granting the server's minimum needs.
REVOKE ALL PRIVILEGES ON TABLE public.contact_messages
    FROM PUBLIC, anon, authenticated, service_role;

-- The API performs INSERT; SELECT supports controlled service-side verification
-- and the private operational inbox. No public/authenticated RLS policies are
-- created. The standard Supabase service_role uses BYPASSRLS; a database owner
-- retains management access. No sequence grants are needed for UUID identifiers.
GRANT INSERT, SELECT ON TABLE public.contact_messages TO service_role;

COMMENT ON TABLE public.contact_messages IS
    'Private website contact submissions. Access through the server API and authorized database administration only.';
COMMENT ON COLUMN public.contact_messages.posthog_distinct_id IS
    'Optional client analytics identity supplied with the contact request; not a public lookup key.';

-- Refresh PostgREST metadata after this transaction commits.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- Read-only verification after application (no contact rows need to be read):
--
-- SELECT c.relname, c.relrowsecurity
-- FROM pg_class AS c
-- JOIN pg_namespace AS n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public' AND c.relname = 'contact_messages';
--
-- SELECT grantee, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public' AND table_name = 'contact_messages'
-- ORDER BY grantee, privilege_type;
--
-- SELECT rolname, rolbypassrls
-- FROM pg_roles WHERE rolname = 'service_role';
--
-- SELECT policyname, roles, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'contact_messages';
--
-- Expected: RLS enabled; service_role can INSERT/SELECT and has BYPASSRLS;
-- anon/authenticated have no table grants; there are no public policies.
-- Refresh the service-role PostgREST OpenAPI document to verify the new columns.
-- Do not drop the table as a routine rollback after contacts have been received:
-- reverting application code can leave this additive table in place safely.
