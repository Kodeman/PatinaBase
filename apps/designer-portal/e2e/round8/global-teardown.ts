import { psqlRun, psqlScalar } from '../helpers/psql';
import { round8Stack } from './owned-stack';

const JOB = 'f0180000-0000-4000-8000-000000000010';
const STUDIO = 'f0180000-0000-4000-8000-000000000001';
const ACTORS = ['f0180000-0000-4000-8000-000000000002', 'f0180000-0000-4000-8000-000000000003'];

export default async function globalTeardown(): Promise<void> {
  round8Stack('F01 teardown');

  // Remove the F01 studio (with every seat on it, including ones other round-8
  // fixtures add) and each actor's personal organization, but never another
  // organization that has a member outside this fictional fixture.
  psqlRun(`
    BEGIN;
    CREATE TEMP TABLE f01_issues ON COMMIT DROP AS
      SELECT id FROM public.plan_issues WHERE project_id = '${JOB}';
    CREATE TEMP TABLE f01_sheets ON COMMIT DROP AS
      SELECT id FROM public.plan_sheets WHERE project_id = '${JOB}';
    CREATE TEMP TABLE f01_prints ON COMMIT DROP AS
      SELECT id, project_document_id FROM public.plan_prints
      WHERE sheet_id IN (SELECT id FROM f01_sheets);
    CREATE TEMP TABLE f01_transmittals ON COMMIT DROP AS
      SELECT id FROM public.plan_transmittals
      WHERE project_id = '${JOB}' OR issue_id IN (SELECT id FROM f01_issues);

    -- Filed plan evidence is immutable and its current-print cycle is RESTRICT.
    -- Bypass those guards only for this local fictional job's captured chain.
    SET LOCAL session_replication_role = replica;
    DELETE FROM public.plan_transmittal_tokens
      WHERE project_id = '${JOB}' OR transmittal_id IN (SELECT id FROM f01_transmittals);
    DELETE FROM public.plan_transmittals WHERE id IN (SELECT id FROM f01_transmittals);
    DELETE FROM public.plan_issue_prints
      WHERE issue_id IN (SELECT id FROM f01_issues) OR sheet_id IN (SELECT id FROM f01_sheets);
    DELETE FROM public.plan_issues WHERE id IN (SELECT id FROM f01_issues);
    DELETE FROM public.plan_prints WHERE id IN (SELECT id FROM f01_prints);
    DELETE FROM public.plan_print_batches WHERE project_id = '${JOB}';
    DELETE FROM public.plan_sheets WHERE id IN (SELECT id FROM f01_sheets);
    DELETE FROM public.project_documents WHERE id IN (SELECT project_document_id FROM f01_prints);
    SET LOCAL session_replication_role = origin;

    -- Journeys execute agreements on F01 rows, and an executed edition is
    -- immutable (guard_proposal_copy_immutability, 00390), so a plain
    -- auth.users cascade cannot remove them. Emulate the cascade without row
    -- triggers instead, from the F01 fixture roots only: the job, the studio,
    -- the actors and their actor-only personal organizations.
    --   CASCADE           -> collected (recursively) and deleted;
    --   SET NULL/DEFAULT  -> referencing rows outside the set are updated;
    --   NO ACTION/RESTRICT-> any referencing row outside the set refuses.
    -- Rows are keyed by primary key (whole row when a table has none). The
    -- closure checks before COMMIT roll the purge back rather than leave an
    -- orphan. Precondition: an owned stack with no concurrent writers (round-8
    -- runs one worker, and teardown runs after every test).
    SET LOCAL lock_timeout = '5s';
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM auth.users u WHERE u.id IN ('${ACTORS[0]}', '${ACTORS[1]}')
                 AND u.email IS DISTINCT FROM CASE u.id WHEN '${ACTORS[0]}' THEN 'f01-designer@test.invalid'
                                                       ELSE 'f01-outsider@test.invalid' END)
         OR EXISTS (SELECT 1 FROM public.organizations WHERE id = '${STUDIO}'
                    AND slug IS DISTINCT FROM 'f01-fictional-studio')
         OR EXISTS (SELECT 1 FROM public.projects WHERE id = '${JOB}'
                    AND name IS DISTINCT FROM 'F01 Fictional Full-Service House') THEN
        RAISE EXCEPTION 'F01 teardown: a root id is not the F01 fixture row; refusing';
      END IF;
    END $$;
    CREATE TEMP TABLE f01_orgs ON COMMIT DROP AS
      SELECT o.id FROM public.organizations o
      WHERE o.id = '${STUDIO}'
         OR (o.id IN (
              SELECT organization_id FROM public.organization_members
              WHERE user_id IN ('${ACTORS[0]}', '${ACTORS[1]}'))
            AND NOT EXISTS (
              SELECT 1 FROM public.organization_members m
              WHERE m.organization_id = o.id
                AND m.user_id NOT IN ('${ACTORS[0]}', '${ACTORS[1]}')));

    CREATE TEMP TABLE f01_doomed (rel regclass, pk jsonb, row_data jsonb, depth int, root boolean,
      PRIMARY KEY (rel, pk)) ON COMMIT DROP;
    -- SQL expression for a row's key: its primary key, else the whole row.
    CREATE FUNCTION pg_temp.f01_key(rel regclass, tbl text) RETURNS text LANGUAGE sql STABLE AS $f$
      SELECT COALESCE(
        (SELECT 'jsonb_build_object(' || string_agg(format('%L, %I.%I', a.attname, tbl, a.attname), ', ' ORDER BY k.ord) || ')'
         FROM pg_index i
         CROSS JOIN LATERAL unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
         WHERE i.indrelid = rel AND i.indisprimary),
        format('to_jsonb(%I.*)', tbl))
    $f$;
    -- Join condition child(c) -> parent(p) for one foreign key.
    CREATE FUNCTION pg_temp.f01_join(con oid) RETURNS text LANGUAGE sql STABLE AS $f$
      SELECT string_agg(format('c.%I = p.%I', ca.attname, pa.attname), ' AND ')
      FROM pg_constraint k
      CROSS JOIN LATERAL unnest(k.conkey, k.confkey) AS u(child, parent)
      JOIN pg_attribute ca ON ca.attrelid = k.conrelid AND ca.attnum = u.child
      JOIN pg_attribute pa ON pa.attrelid = k.confrelid AND pa.attnum = u.parent
      WHERE k.oid = con
    $f$;
    -- The referenced key of one foreign key, read from a live child row (c) or
    -- from a collected parent's saved row (d.row_data).
    CREATE FUNCTION pg_temp.f01_fkey(con oid, side text) RETURNS text LANGUAGE sql STABLE AS $f$
      SELECT 'jsonb_build_object(' || string_agg(CASE side
          WHEN 'child' THEN format('%L, to_jsonb(c.%I)', pa.attname, ca.attname)
          ELSE format('%L, d.row_data -> %L', pa.attname, pa.attname) END, ', ') || ')'
      FROM pg_constraint k
      CROSS JOIN LATERAL unnest(k.conkey, k.confkey) AS u(child, parent)
      JOIN pg_attribute ca ON ca.attrelid = k.conrelid AND ca.attnum = u.child
      JOIN pg_attribute pa ON pa.attrelid = k.confrelid AND pa.attnum = u.parent
      WHERE k.oid = con
    $f$;
    CREATE FUNCTION pg_temp.f01_root(rel regclass, cond text) RETURNS void LANGUAGE plpgsql AS $f$
    BEGIN
      EXECUTE format('INSERT INTO f01_doomed SELECT %L::regclass, %s, to_jsonb(t.*), 0, true FROM %s t WHERE %s
          ON CONFLICT DO NOTHING', rel, pg_temp.f01_key(rel, 't'), rel, cond);
    END $f$;
    SELECT pg_temp.f01_root('auth.users', $q$id IN ('${ACTORS[0]}', '${ACTORS[1]}')$q$);
    SELECT pg_temp.f01_root('public.organizations', 'id IN (SELECT id FROM f01_orgs)');
    SELECT pg_temp.f01_root('public.projects', $q$id = '${JOB}'$q$);

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
          SELECT k.oid, k.conrelid::regclass AS child, k.confrelid::regclass AS parent
          FROM pg_constraint k
          WHERE k.contype = 'f' AND k.conparentid = 0 AND k.confdeltype = 'c'
            AND k.confrelid IN (SELECT DISTINCT rel FROM f01_doomed WHERE depth = d)
        LOOP
          EXECUTE format('INSERT INTO f01_doomed SELECT %L::regclass, %s, to_jsonb(c.*), %s, false
              FROM %s c JOIN %s p ON %s
              WHERE %s IN (SELECT pk FROM f01_doomed WHERE rel = %L::regclass AND depth = %s)
              ON CONFLICT DO NOTHING',
            fk.child, pg_temp.f01_key(fk.child, 'c'), d + 1, fk.child, fk.parent, pg_temp.f01_join(fk.oid),
            pg_temp.f01_key(fk.parent, 'p'), fk.parent, d);
          GET DIAGNOSTICS n = ROW_COUNT;
          added := added + n;
        END LOOP;
        EXIT WHEN added = 0;
        d := d + 1;
        IF d > 25 THEN RAISE EXCEPTION 'F01 teardown: the cascade walk did not settle'; END IF;
      END LOOP;
    END $$;

    DO $$
    DECLARE
      fk record;
      n bigint;
      assignments text;
    BEGIN
      FOR fk IN
        SELECT k.oid, k.conname, k.conrelid::regclass AS child, k.confrelid::regclass AS parent, k.confdeltype,
               COALESCE(k.confdelsetcols, k.conkey) AS setcols
        FROM pg_constraint k
        WHERE k.contype = 'f' AND k.conparentid = 0 AND k.confdeltype <> 'c'
          AND k.confrelid IN (SELECT DISTINCT rel FROM f01_doomed)
      LOOP
        IF fk.confdeltype IN ('a', 'r') THEN
          EXECUTE format('SELECT count(*) FROM %s c JOIN %s p ON %s
              WHERE %s IN (SELECT pk FROM f01_doomed WHERE rel = %L::regclass)
                AND %s NOT IN (SELECT pk FROM f01_doomed WHERE rel = %L::regclass)',
            fk.child, fk.parent, pg_temp.f01_join(fk.oid), pg_temp.f01_key(fk.parent, 'p'), fk.parent,
            pg_temp.f01_key(fk.child, 'c'), fk.child) INTO n;
          IF n > 0 THEN
            RAISE EXCEPTION 'F01 teardown: % row(s) of % outside the fixture reference it through %; refusing',
              n, fk.child, fk.conname;
          END IF;
        ELSE
          SELECT string_agg(format('%I = %s', a.attname, CASE fk.confdeltype WHEN 'n' THEN 'NULL' ELSE 'DEFAULT' END), ', ')
            INTO assignments
          FROM unnest(fk.setcols) AS s(attnum)
          JOIN pg_attribute a ON a.attrelid = fk.child AND a.attnum = s.attnum;
          EXECUTE format('UPDATE %s c SET %s FROM %s p WHERE %s
              AND %s IN (SELECT pk FROM f01_doomed WHERE rel = %L::regclass)
              AND %s NOT IN (SELECT pk FROM f01_doomed WHERE rel = %L::regclass)',
            fk.child, assignments, fk.parent, pg_temp.f01_join(fk.oid), pg_temp.f01_key(fk.parent, 'p'), fk.parent,
            pg_temp.f01_key(fk.child, 'c'), fk.child);
        END IF;
      END LOOP;
    END $$;

    -- Delete the collected dependents without row triggers. The roots, and the
    -- auth.* rows that cascade from them, go through the ordinary deletes below.
    SET LOCAL session_replication_role = replica;
    DO $$
    DECLARE r record;
    BEGIN
      FOR r IN
        SELECT DISTINCT x.rel FROM f01_doomed x
        JOIN pg_class k ON k.oid = x.rel JOIN pg_namespace s ON s.oid = k.relnamespace
        WHERE NOT x.root AND s.nspname <> 'auth'
      LOOP
        EXECUTE format('DELETE FROM %s t WHERE %s IN (SELECT pk FROM f01_doomed WHERE rel = %L::regclass AND NOT root)',
          r.rel, pg_temp.f01_key(r.rel, 't'), r.rel);
      END LOOP;
    END $$;
    SET LOCAL session_replication_role = origin;

    SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
    DELETE FROM public.room_scans WHERE id = 'f0180000-0000-4000-8000-000000000020';
    DELETE FROM public.projects WHERE id = '${JOB}';
    DELETE FROM public.audit_logs
      WHERE organization_id IN (SELECT id FROM f01_orgs)
         OR user_id IN ('${ACTORS[0]}', '${ACTORS[1]}');
    SET LOCAL ROLE service_role;
    DELETE FROM public.organizations WHERE id IN (SELECT id FROM f01_orgs);
    RESET ROLE;
    DELETE FROM auth.users WHERE id IN ('${ACTORS[0]}', '${ACTORS[1]}');

    -- Closure: every collected row is gone, and no row anywhere still
    -- references a deleted key through any foreign key.
    DO $$
    DECLARE
      r record;
      fk record;
      n bigint;
    BEGIN
      FOR r IN SELECT DISTINCT rel FROM f01_doomed LOOP
        EXECUTE format('SELECT count(*) FROM %s t WHERE %s IN (SELECT pk FROM f01_doomed WHERE rel = %L::regclass)',
          r.rel, pg_temp.f01_key(r.rel, 't'), r.rel) INTO n;
        IF n > 0 THEN
          RAISE EXCEPTION 'F01 teardown: % collected row(s) of % survived; rolling back', n, r.rel;
        END IF;
      END LOOP;
      FOR fk IN
        SELECT k.oid, k.conname, k.conrelid::regclass AS child, k.confrelid::regclass AS parent
        FROM pg_constraint k
        WHERE k.contype = 'f' AND k.conparentid = 0
          AND k.confrelid IN (SELECT DISTINCT rel FROM f01_doomed)
      LOOP
        EXECUTE format('SELECT count(*) FROM %s c WHERE %s IN (
            SELECT %s FROM f01_doomed d WHERE d.rel = %L::regclass)',
          fk.child, pg_temp.f01_fkey(fk.oid, 'child'), pg_temp.f01_fkey(fk.oid, 'parent'), fk.parent) INTO n;
        IF n > 0 THEN
          RAISE EXCEPTION 'F01 teardown: % row(s) of % reference a deleted key through %; rolling back',
            n, fk.child, fk.conname;
        END IF;
      END LOOP;
    END $$;
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM public.plan_prints p
        WHERE NOT EXISTS (SELECT 1 FROM public.project_documents d WHERE d.id = p.project_document_id)
          OR NOT EXISTS (SELECT 1 FROM public.plan_sheets s WHERE s.id = p.sheet_id)
          OR NOT EXISTS (SELECT 1 FROM public.plan_print_batches b WHERE b.id = p.batch_id)
      ) OR EXISTS (
        SELECT 1 FROM public.plan_sheets s
        WHERE s.current_print_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.plan_prints p WHERE p.id = s.current_print_id)
      ) OR EXISTS (
        SELECT 1 FROM public.plan_issue_prints ip
        WHERE NOT EXISTS (SELECT 1 FROM public.plan_issues i WHERE i.id = ip.issue_id)
          OR NOT EXISTS (SELECT 1 FROM public.plan_prints p WHERE p.id = ip.print_id)
          OR NOT EXISTS (SELECT 1 FROM public.plan_sheets s WHERE s.id = ip.sheet_id)
      ) OR EXISTS (
        SELECT 1 FROM public.plan_transmittals t
        WHERE NOT EXISTS (SELECT 1 FROM public.plan_issues i WHERE i.id = t.issue_id)
      ) OR EXISTS (
        SELECT 1 FROM public.plan_transmittal_tokens k
        WHERE NOT EXISTS (SELECT 1 FROM public.plan_transmittals t WHERE t.id = k.transmittal_id)
      ) OR EXISTS (
        SELECT 1 FROM public.plan_issues i
        WHERE i.prior_issue_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.plan_issues p WHERE p.id = i.prior_issue_id)
      ) OR EXISTS (SELECT 1 FROM public.projects WHERE id = '${JOB}') THEN
        RAISE EXCEPTION 'F01 cleanup left a dangling plan reference or project; rolling back';
      END IF;
    END $$;
    COMMIT;
  `);

  expectF01JobRemoved();
}

function expectF01JobRemoved(): void {
  const remaining = psqlScalar(`SELECT count(*)::text FROM public.projects WHERE id = '${JOB}';`);
  if (remaining !== '0') {
    throw new Error(`F01 teardown left ${remaining} project row(s) for ${JOB}.`);
  }
}
