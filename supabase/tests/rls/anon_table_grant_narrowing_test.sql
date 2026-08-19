-- ═══════════════════════════════════════════════════════════════════════════
-- anon table-grant narrowing on four public tables (00483 residue → 00510)
--
-- Before 00510, prod and a fully-seeded local stack both carried:
--
--   organizations      anon=arwdDxtm  authenticated=rwdDxtm
--   project_ffe_items  anon=arwdDxtm  authenticated=rm
--   project_phases     anon=arwdDxtm  authenticated=rdDxtm
--   purchase_orders    anon=arwdDxtm  authenticated=rDxtm
--
-- i.e. the UNAUTHENTICATED role held strictly more table privilege than the
-- authenticated one on all four. These are pre-flip legacy grants that 00483's
-- sweep did not reach. RLS blocked the DML regardless, so this is depth, not a
-- live hole — but a grant that no caller may use is a grant waiting for a
-- policy mistake.
--
-- 00510 revokes INSERT, UPDATE, DELETE, REFERENCES, TRIGGER and TRUNCATE from
-- anon on exactly these four. SELECT is deliberately untouched: authenticated
-- holds SELECT on all four, so the mirrored posture is "SELECT stays".
--
-- This file asserts the FINISHED-stack ACL state. The migration's own DO block
-- cannot: during `supabase db reset` the ACLs are still mid-replay, and the
-- legacy grants are reconstructed afterwards by supabase/seed/00-legacy-grants.sql.
--
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/rls/anon_table_grant_narrowing_test.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '30s';

DO $$
DECLARE
  v_table text;
  v_priv  text;
  v_tables text[] := ARRAY[
    'public.project_ffe_items',
    'public.organizations',
    'public.project_phases',
    'public.purchase_orders'
  ];
  v_revoked text[] := ARRAY[
    'INSERT', 'UPDATE', 'DELETE', 'REFERENCES', 'TRIGGER', 'TRUNCATE'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    FOREACH v_priv IN ARRAY v_revoked LOOP
      ASSERT NOT has_table_privilege('anon'::name, v_table::regclass, v_priv),
        format('anon must not hold %s on %s', v_priv, v_table);
    END LOOP;

    -- SELECT is the mirrored posture, not collateral damage.
    ASSERT has_table_privilege('authenticated'::name, v_table::regclass, 'SELECT'),
      format('authenticated must still hold SELECT on %s', v_table);
    ASSERT has_table_privilege('anon'::name, v_table::regclass, 'SELECT'),
      format('anon SELECT on %s must be left as-is by 00510', v_table);

    -- service_role is the server-side principal; narrowing anon must not have
    -- touched it.
    ASSERT has_table_privilege('service_role'::name, v_table::regclass, 'SELECT'),
      format('service_role must still read %s', v_table);
  END LOOP;
END $$;

-- anon must not out-rank authenticated on ANY of the six on these tables.
DO $$
DECLARE
  v_table text;
  v_priv  text;
  v_tables text[] := ARRAY[
    'public.project_ffe_items',
    'public.organizations',
    'public.project_phases',
    'public.purchase_orders'
  ];
  v_privs text[] := ARRAY[
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'REFERENCES', 'TRIGGER', 'TRUNCATE'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    FOREACH v_priv IN ARRAY v_privs LOOP
      ASSERT NOT (
        has_table_privilege('anon'::name, v_table::regclass, v_priv)
        AND NOT has_table_privilege('authenticated'::name, v_table::regclass, v_priv)
      ), format('anon holds %s on %s while authenticated does not', v_priv, v_table);
    END LOOP;
  END LOOP;
END $$;

ROLLBACK;
