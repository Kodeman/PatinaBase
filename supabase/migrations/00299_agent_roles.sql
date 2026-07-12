-- ═══════════════════════════════════════════════════════════════════════════
-- 00299 — Agent OS: least-privilege agent roles (agent_reader / agent_writer)
--
-- Two NOLOGIN, cluster-level Postgres roles agent code SETs into for
-- server-side DB access, instead of ever holding the service_role key:
--   agent_reader — broad SELECT only. Preferred grant is the built-in
--     pg_read_all_data (PG14+); Supabase Cloud may deny GRANTing it to a
--     freshly-created role, so the grant is wrapped and falls back to an
--     explicit public-schema SELECT + a matching ALTER DEFAULT PRIVILEGES so
--     future tables stay readable without a follow-up migration. NOTE:
--     pg_read_all_data does NOT carry BYPASSRLS — agent_reader still goes
--     through RLS like any other non-owner role; "succeeds" in the reader
--     test means the SELECT doesn't error, not that every row is visible.
--   agent_writer — the sole write surface is enqueue_agent_task (00297);
--     no UPDATE/DELETE grants exist anywhere, and none are added by design —
--     every other queue mutation (claim/complete/review/requeue/cancel)
--     stays service_role-only. agent_writer also gets baseline SELECT/INSERT
--     on agent_tasks itself for symmetry with the RPC's return value, but the
--     RPC is SECURITY DEFINER so the table grant is not load-bearing.
--
-- Both roles are cluster-level and OUTLIVE `supabase db reset` (which
-- recreates the database, not the cluster) — every CREATE ROLE below is
-- guarded by a pg_roles existence check so re-running this migration (reset,
-- or a second `db push`) is a no-op the second time. GRANT/ALTER ROLE are
-- naturally idempotent and re-run unguarded.
--
-- Neither role can log in directly (NOLOGIN) — see docs/agent-os/
-- agent-roles-runbook.md for the SET ROLE server-side usage pattern, the
-- PostgREST JWT-claim fallback sketch, and the out-of-band Strata LOGIN
-- enablement procedure (adds a password via the SQL editor, outside git).
--
-- The advisory ALTER ROLE ... SET default_transaction_read_only on
-- agent_reader is defense-in-depth only, wrapped for the same Cloud-grant
-- uncertainty (00258 precedent: Supabase Cloud denies ALTER DATABASE/ROLE
-- ... SET for CUSTOM GUCs; this is a BUILT-IN GUC on a role we own, which
-- should work but is unverified against Strata) — the real enforcement is
-- that agent_reader is never granted a single write privilege.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. CREATE ROLE — guarded, cluster-level, idempotent across resets ──────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_reader') THEN
    CREATE ROLE agent_reader NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_writer') THEN
    CREATE ROLE agent_writer NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOLOGIN;
  END IF;
END $$;

-- ─── 2. agent_reader — broad read, zero write ───────────────────────────────
-- Preferred: the built-in pg_read_all_data role. Falls back to explicit
-- public-schema SELECT + ALTER DEFAULT PRIVILEGES if Cloud denies the GRANT.
--
-- WITH INHERIT TRUE (PG16+ per-membership grant option; both local and
-- Strata confirmed on PG17.6) is required here: agent_reader is created
-- NOINHERIT for defense-in-depth against any OTHER future membership, and
-- since PG16 a role's own rolinherit attribute is only the DEFAULT applied
-- to a GRANT ROLE that doesn't specify WITH INHERIT — so a bare
-- `GRANT pg_read_all_data TO agent_reader` on a NOINHERIT role grants
-- membership WITHOUT automatically activating it, and every SELECT under
-- `SET ROLE agent_reader` fails with "permission denied" despite the
-- membership existing (confirmed empirically against this exact migration
-- before this override was added). WITH INHERIT TRUE overrides the default
-- for this one membership only; agent_reader stays NOINHERIT everywhere else.
DO $$
BEGIN
  GRANT pg_read_all_data TO agent_reader WITH INHERIT TRUE;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'agent_roles (00299): GRANT pg_read_all_data TO agent_reader was denied — falling back to explicit public-schema SELECT grants. Verify on Strata per docs/agent-os/agent-roles-runbook.md checklist item 1.';
  GRANT USAGE ON SCHEMA public TO agent_reader;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO agent_reader;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO agent_reader;
END $$;

-- Advisory only — real enforcement is the absence of any write grant above.
DO $$
BEGIN
  ALTER ROLE agent_reader SET default_transaction_read_only = on;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'agent_roles (00299): ALTER ROLE agent_reader SET default_transaction_read_only was denied — advisory guard only, real enforcement is zero write grants. Verify on Strata per docs/agent-os/agent-roles-runbook.md checklist item 2.';
END $$;

-- ─── 3. agent_writer — enqueue-only write surface ───────────────────────────
-- No UPDATE/DELETE grants anywhere; no sequence grants needed (uuid PKs).
GRANT USAGE ON SCHEMA public TO agent_writer;
GRANT SELECT, INSERT ON public.agent_tasks TO agent_writer;
GRANT EXECUTE ON FUNCTION public.enqueue_agent_task(text, jsonb, text, int, text, text, uuid, text, timestamptz, int, text, text, text, uuid, numeric, jsonb, text) TO agent_writer;

-- 00297 deliberately ships agent_tasks with NO INSERT/UPDATE/DELETE RLS
-- policies at all (comment: "writes go through the SECURITY DEFINER RPCs...
-- or service_role, both of which bypass RLS") — a table GRANT alone is not
-- enough to let a non-bypassing role write; RLS still says no. agent_writer
-- is a genuine non-bypassing role (not service_role), so it needs its own
-- narrowly-scoped policies — TO agent_writer only, never authenticated/anon
-- — for the SELECT/INSERT grant above to do anything. The SELECT policy also
-- makes `INSERT ... RETURNING` work: Postgres filters RETURNING through the
-- table's SELECT policy, so without this an insert would silently succeed
-- but return zero rows.
--
-- The INSERT policy's WITH CHECK deliberately mirrors enqueue_agent_task's
-- p_status gate (queued | awaiting_review — awaiting_review must stay
-- allowed, it is the intake-bridge landing status) and additionally pins
-- review_state and completed_at to NULL. This is load-bearing, not
-- decorative: 00297's state-machine trigger is BEFORE UPDATE OF status ONLY
-- — it does not constrain INSERTs at all — so a permissive WITH CHECK (true)
-- would let an agent_writer session INSERT a row born status='approved' (or
-- 'done', or carrying a forged review_state), minting a self-approved task
-- that downstream executors would treat as having passed human review. This
-- policy is what closes that hole for the raw-INSERT path; the RPC path was
-- already gated by its own p_status validation.
DROP POLICY IF EXISTS agent_tasks_select_agent_writer ON public.agent_tasks;
CREATE POLICY agent_tasks_select_agent_writer
  ON public.agent_tasks FOR SELECT TO agent_writer
  USING (true);

DROP POLICY IF EXISTS agent_tasks_insert_agent_writer ON public.agent_tasks;
CREATE POLICY agent_tasks_insert_agent_writer
  ON public.agent_tasks FOR INSERT TO agent_writer
  WITH CHECK (
    status IN ('queued','awaiting_review')
    AND review_state IS NULL
    AND completed_at IS NULL
  );

-- ─── 4. SET ROLE enablement ──────────────────────────────────────────────────
-- Lets a `postgres`-connected session (or, on Strata, service_role — see
-- runbook) `SET ROLE agent_reader` / `SET ROLE agent_writer` without a
-- direct LOGIN on either NOLOGIN role.
GRANT agent_reader TO postgres;
GRANT agent_writer TO postgres;

-- ─── 5. Documentation pointers ──────────────────────────────────────────────
COMMENT ON ROLE agent_reader IS
  'Agent OS (00299): NOLOGIN, broad-SELECT role for server-side agent read access (pg_read_all_data, or the explicit-grant fallback — does NOT bypass RLS). SET ROLE only; no direct login. Runbook: docs/agent-os/agent-roles-runbook.md.';
COMMENT ON ROLE agent_writer IS
  'Agent OS (00299): NOLOGIN role whose only write surface is EXECUTE on enqueue_agent_task (00297) — no UPDATE/DELETE anywhere. SET ROLE only; no direct login. Runbook: docs/agent-os/agent-roles-runbook.md.';
