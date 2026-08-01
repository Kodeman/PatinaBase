-- ═══════════════════════════════════════════════════════════════════════════
-- 00396 — Publish project phase truth to authenticated client timelines
--
-- Designer handoffs now advance public.project_phases atomically in Postgres.
-- The client timeline still listened only to a legacy private broadcast path,
-- so those canonical writes could remain stale until a full page refresh.
--
-- Add the existing RLS-protected table to Supabase Realtime's Postgres Changes
-- publication. Client subscriptions filter by project_id; the table's 00066
-- client SELECT policy remains the authorization boundary.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'project_phases'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_phases;
  END IF;
EXCEPTION
  -- The catalog precheck makes normal replay idempotent. Only tolerate the
  -- narrow race where another session adds the same membership after it.
  -- A missing supabase_realtime publication must fail the migration loudly.
  WHEN duplicate_object THEN NULL;
END;
$$;
