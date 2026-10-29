-- RC-7 lane e2: remove the FICTIONAL jobs rc7-e2-fixture.sql composed (and the
-- RC2 job A consumer-journey-fixture.sql composed) once the journey is done.
--
-- Why: the journeys execute agreements, so the F01 designer owns non-draft
-- proposals. playwright.round8.config.ts's global teardown deletes the F01
-- auth users, and that cascade is refused by guard_proposal_copy_immutability
-- (00390) - correctly, since an executed edition is immutable. This cleanup
-- runs first (test.afterAll), on the owned cluster only.
--
-- Scope: projects of the F01 designer whose client is one of the RC2/RC7
-- fictional actors, plus every row that references them, transitively, by
-- foreign key. The walk refuses if it would reach an account, profile,
-- organization, card or household row. Deletion runs transaction-local in
-- replica mode (the evidence ledgers refuse DELETE by trigger), as the other
-- round8 cleanups do.
--
--   psql -X -v ON_ERROR_STOP=1 -v owned_server_addr=... -v owned_system_id=... <owned db url> -f rc7-e2-cleanup.sql
\set ON_ERROR_STOP on

BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';
SELECT set_config('rc2.owned_system_id', :'owned_system_id', true),
       set_config('rc2.owned_server_addr', :'owned_server_addr', true) \gset
DO $$ BEGIN
  IF (SELECT system_identifier::text FROM pg_control_system()) IS DISTINCT FROM current_setting('rc2.owned_system_id')
     OR host(inet_server_addr()) IS DISTINCT FROM current_setting('rc2.owned_server_addr') THEN
    RAISE EXCEPTION 'refusing the rc7-e2 cleanup outside the owned local database container';
  END IF;
END $$;

CREATE TEMP TABLE rc7_doomed (rel regclass, rid tid, depth int, PRIMARY KEY (rel, rid)) ON COMMIT DROP;
INSERT INTO rc7_doomed
SELECT 'public.projects'::regclass, ctid, 0 FROM public.projects
WHERE designer_id = 'f0180000-0000-4000-8000-000000000002'
  AND client_id IN ('c2c20000-0000-4000-8000-000000000005', 'c2c20000-0000-4000-8000-000000000006',
    'c2c20000-0000-4000-8000-000000000008', 'c2c20000-0000-4000-8000-000000000009',
    'c2c20000-0000-4000-8000-00000000000a', 'c2c20000-0000-4000-8000-00000000000b');

DO $$
DECLARE
  d int := 0;
  added bigint;
  n bigint;
  fk record;
BEGIN
  LOOP
    added := 0;
    FOR fk IN
      SELECT c.conrelid, c.confrelid,
        (SELECT string_agg(format('c.%I = p.%I', ca.attname, pa.attname), ' AND ')
           FROM unnest(c.conkey, c.confkey) AS k(child, parent)
           JOIN pg_attribute ca ON ca.attrelid = c.conrelid AND ca.attnum = k.child
           JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = k.parent) AS cond
      FROM pg_constraint c
      WHERE c.contype = 'f' AND c.confrelid IN (SELECT DISTINCT rel FROM rc7_doomed WHERE depth = d)
    LOOP
      EXECUTE format('INSERT INTO rc7_doomed SELECT %L::regclass, c.ctid, %s FROM %s c JOIN %s p ON %s
          WHERE p.ctid = ANY (ARRAY(SELECT rid FROM rc7_doomed WHERE rel = %L::regclass AND depth = %s))
          ON CONFLICT DO NOTHING',
        fk.conrelid, d + 1, fk.conrelid::regclass, fk.confrelid::regclass, fk.cond, fk.confrelid, d);
      GET DIAGNOSTICS n = ROW_COUNT;
      added := added + n;
    END LOOP;
    EXIT WHEN added = 0;
    d := d + 1;
    IF d > 25 THEN RAISE EXCEPTION 'rc7-e2 cleanup: the reference walk did not settle'; END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM rc7_doomed x JOIN pg_class k ON k.oid = x.rel JOIN pg_namespace s ON s.oid = k.relnamespace
             WHERE s.nspname <> 'public' OR k.relkind <> 'r'
                OR x.rel IN ('public.profiles'::regclass, 'public.organizations'::regclass,
                  'public.organization_members'::regclass, 'public.studio_contacts'::regclass,
                  'public.client_households'::regclass)) THEN
    RAISE EXCEPTION 'rc7-e2 cleanup: the walk reached % - refusing',
      (SELECT string_agg(DISTINCT x.rel::text, ', ') FROM rc7_doomed x JOIN pg_class k ON k.oid = x.rel
       JOIN pg_namespace s ON s.oid = k.relnamespace
       WHERE s.nspname <> 'public' OR k.relkind <> 'r'
          OR x.rel IN ('public.profiles'::regclass, 'public.organizations'::regclass,
            'public.organization_members'::regclass, 'public.studio_contacts'::regclass,
            'public.client_households'::regclass));
  END IF;
END $$;

SET LOCAL session_replication_role = replica;
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT rel, array_agg(rid) AS rids FROM rc7_doomed GROUP BY rel LOOP
    EXECUTE format('DELETE FROM %s WHERE ctid = ANY (%L::tid[])', r.rel, r.rids);
  END LOOP;
END $$;
-- consumer-journey-fixture.sql seats the RC2 studio member (-07) on the F01
-- studio; while that seat stands the teardown keeps the studio and the
-- designer is its last owner (last_owner_protected). The fixture re-seats it.
DELETE FROM public.organization_members
WHERE organization_id = 'f0180000-0000-4000-8000-000000000001' AND user_id = 'c2c20000-0000-4000-8000-000000000007';
SET LOCAL session_replication_role = origin;

SELECT json_build_object(
  'tables', (SELECT count(DISTINCT rel) FROM rc7_doomed),
  'rows', (SELECT count(*) FROM rc7_doomed),
  'projects', (SELECT count(*) FROM rc7_doomed WHERE rel = 'public.projects'::regclass),
  'f01NonDraftProposals', (SELECT count(*) FROM public.proposals
    WHERE designer_id = 'f0180000-0000-4000-8000-000000000002' AND status <> 'draft'));
COMMIT;
