-- ═══════════════════════════════════════════════════════════════════════════
-- 00814 — Aesthete owner-rights view privilege regression
-- Run after migrations through 00814 with `supabase test db`.
-- Negative control: against the pre-00814 schema the anon/authenticated
-- assertions below fail because those roles retain SELECT on the views.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
SELECT plan(9);

SELECT ok(
  NOT has_table_privilege('anon', 'public.v_aesthete_personal_input', 'SELECT'),
  'anon cannot SELECT personal Aesthete input'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.v_aesthete_studio_input', 'SELECT'),
  'anon cannot SELECT studio Aesthete input'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.v_aesthete_catalog_input', 'SELECT'),
  'anon cannot SELECT catalog Aesthete input'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.v_aesthete_personal_input', 'SELECT'),
  'authenticated cannot SELECT personal Aesthete input'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.v_aesthete_studio_input', 'SELECT'),
  'authenticated cannot SELECT studio Aesthete input'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.v_aesthete_catalog_input', 'SELECT'),
  'authenticated cannot SELECT catalog Aesthete input'
);
SELECT ok(
  has_table_privilege('service_role', 'public.v_aesthete_personal_input', 'SELECT'),
  'service_role retains SELECT on personal Aesthete input'
);
SELECT ok(
  has_table_privilege('service_role', 'public.v_aesthete_studio_input', 'SELECT'),
  'service_role retains SELECT on studio Aesthete input'
);
SELECT ok(
  has_table_privilege('service_role', 'public.v_aesthete_catalog_input', 'SELECT'),
  'service_role retains SELECT on catalog Aesthete input'
);

SELECT * FROM finish();
ROLLBACK;
