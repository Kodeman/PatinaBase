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

    -- Journeys execute agreements on F01-owned jobs, and an executed edition is
    -- immutable (guard_proposal_copy_immutability, 00390), so the auth.users
    -- cascade below cannot remove them. Purge every project of the F01 studio
    -- or actors, and every proposal of the actors, with all rows that reference
    -- them transitively by foreign key (the RC7-E2 cleanup walk). Refuse if the
    -- walk would reach an account, organization, contact or household row.
    CREATE TEMP TABLE f01_doomed (rel regclass, rid tid, depth int, PRIMARY KEY (rel, rid)) ON COMMIT DROP;
    INSERT INTO f01_doomed
      SELECT 'public.projects'::regclass, ctid, 0 FROM public.projects
      WHERE id = '${JOB}' OR studio_id = '${STUDIO}'
         OR designer_id IN ('${ACTORS[0]}', '${ACTORS[1]}');
    INSERT INTO f01_doomed
      SELECT 'public.proposals'::regclass, ctid, 0 FROM public.proposals
      WHERE designer_id IN ('${ACTORS[0]}', '${ACTORS[1]}');
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
          WHERE c.contype = 'f' AND c.confrelid IN (SELECT DISTINCT rel FROM f01_doomed WHERE depth = d)
        LOOP
          EXECUTE format('INSERT INTO f01_doomed SELECT %L::regclass, c.ctid, %s FROM %s c JOIN %s p ON %s
              WHERE p.ctid = ANY (ARRAY(SELECT rid FROM f01_doomed WHERE rel = %L::regclass AND depth = %s))
              ON CONFLICT DO NOTHING',
            fk.conrelid, d + 1, fk.conrelid::regclass, fk.confrelid::regclass, fk.cond, fk.confrelid, d);
          GET DIAGNOSTICS n = ROW_COUNT;
          added := added + n;
        END LOOP;
        EXIT WHEN added = 0;
        d := d + 1;
        IF d > 25 THEN RAISE EXCEPTION 'F01 teardown: the reference walk did not settle'; END IF;
      END LOOP;
      IF EXISTS (SELECT 1 FROM f01_doomed x JOIN pg_class k ON k.oid = x.rel JOIN pg_namespace s ON s.oid = k.relnamespace
                 WHERE s.nspname <> 'public' OR k.relkind <> 'r'
                    OR x.rel IN ('public.profiles'::regclass, 'public.organizations'::regclass,
                      'public.organization_members'::regclass, 'public.studio_contacts'::regclass,
                      'public.client_households'::regclass)) THEN
        RAISE EXCEPTION 'F01 teardown: the reference walk reached % - refusing',
          (SELECT string_agg(DISTINCT x.rel::text, ', ') FROM f01_doomed x JOIN pg_class k ON k.oid = x.rel
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
      FOR r IN SELECT rel, array_agg(rid) AS rids FROM f01_doomed GROUP BY rel LOOP
        EXECUTE format('DELETE FROM %s WHERE ctid = ANY (%L::tid[])', r.rel, r.rids);
      END LOOP;
    END $$;
    SET LOCAL session_replication_role = origin;

    SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
    DELETE FROM public.room_scans WHERE id = 'f0180000-0000-4000-8000-000000000020';
    DELETE FROM public.projects WHERE id = '${JOB}';
    DELETE FROM public.audit_logs
      WHERE organization_id IN (
        SELECT o.id FROM public.organizations o
        WHERE o.id = '${STUDIO}'
          OR (o.id IN (
            SELECT organization_id FROM public.organization_members
            WHERE user_id IN ('${ACTORS[0]}', '${ACTORS[1]}')
          )
          AND NOT EXISTS (
            SELECT 1 FROM public.organization_members m
            WHERE m.organization_id = o.id
              AND m.user_id NOT IN ('${ACTORS[0]}', '${ACTORS[1]}')
          ))
      )
        OR user_id IN ('${ACTORS[0]}', '${ACTORS[1]}');
    SET LOCAL ROLE service_role;
    DELETE FROM public.organizations o
    WHERE o.id = '${STUDIO}'
      OR (o.id IN (
        SELECT organization_id FROM public.organization_members
        WHERE user_id IN ('${ACTORS[0]}', '${ACTORS[1]}')
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.organization_members m
        WHERE m.organization_id = o.id
          AND m.user_id NOT IN ('${ACTORS[0]}', '${ACTORS[1]}')
      ));
    RESET ROLE;
    DELETE FROM auth.users WHERE id IN ('${ACTORS[0]}', '${ACTORS[1]}');
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
