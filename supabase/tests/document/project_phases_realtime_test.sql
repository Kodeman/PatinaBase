-- project_phases canonical Realtime publication regression (00396)
-- Run after 00396 lands:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 -f supabase/tests/document/project_phases_realtime_test.sql

BEGIN;

SELECT plan(1);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'project_phases'
  ),
  'public.project_phases is published through supabase_realtime'
);

SELECT * FROM finish();

ROLLBACK;
