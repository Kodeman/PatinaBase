import { psqlRun, psqlScalar } from '../helpers/psql';

const JOB = 'f0180000-0000-4000-8000-000000000010';
const ACTORS = ['f0180000-0000-4000-8000-000000000002', 'f0180000-0000-4000-8000-000000000003'];

export default async function globalTeardown(): Promise<void> {
  const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
  const db = new URL(process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres');
  if (api.hostname !== '127.0.0.1' || db.hostname !== '127.0.0.1') {
    throw new Error('F01 teardown requires Supabase and Postgres on 127.0.0.1; refusing fixture cleanup.');
  }

  // Remove the F01 studio and each actor's personal organization, but never
  // an organization that has a member outside this fictional fixture.
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

    SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
    DELETE FROM public.room_scans WHERE id = 'f0180000-0000-4000-8000-000000000020';
    DELETE FROM public.projects WHERE id = '${JOB}';
    DELETE FROM public.audit_logs
      WHERE organization_id = 'f0180000-0000-4000-8000-000000000001'
        OR user_id IN ('${ACTORS[0]}', '${ACTORS[1]}');
    SET LOCAL ROLE service_role;
    DELETE FROM public.organizations o
    WHERE o.id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id IN ('${ACTORS[0]}', '${ACTORS[1]}')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.organization_id = o.id
        AND m.user_id NOT IN ('${ACTORS[0]}', '${ACTORS[1]}')
    );
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
