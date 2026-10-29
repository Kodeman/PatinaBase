import { psqlRun, psqlScalar } from '../helpers/psql';
import { round8Stack } from './owned-stack';

const JOB = 'f0180000-0000-4000-8000-000000000010';
const ACTORS = ['f0180000-0000-4000-8000-000000000002', 'f0180000-0000-4000-8000-000000000003'];
const RETAINED =
  'round8 teardown: F01 rows retained — executed agreements are immutable by design; ' +
  'discard this owned stack (supabase stop --no-backup) before reusing it';

// On an owned stack (disposable) the actor delete is best-effort: a journey that
// executed an F01 agreement leaves rows the database refuses to delete
// (guard_proposal_copy_immutability 00390, last_owner_protected 00319, or a
// foreign key from the executed edition). The PL/pgSQL exception block is the
// savepoint: only those refusals roll back to it, anything else still fails.
// A deliberate shared-stack run (ROUND8_ALLOW_SHARED_DB=1) stays strict.
function deleteActorsSql(strict: boolean): string {
  const remove = `DELETE FROM auth.users WHERE id IN ('${ACTORS[0]}', '${ACTORS[1]}');`;
  if (strict) return remove;
  return `DO $$ BEGIN
      ${remove}
    EXCEPTION
      WHEN foreign_key_violation THEN NULL;
      WHEN check_violation OR raise_exception THEN
        IF SQLERRM NOT IN ('non-draft proposals are immutable editions and cannot be deleted',
                           'last_owner_protected') THEN
          RAISE;
        END IF;
    END $$;`;
}

export default async function globalTeardown(): Promise<void> {
  round8Stack('F01 teardown');
  const strict = process.env.ROUND8_ALLOW_SHARED_DB === '1';

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
      WHERE organization_id IN (
        SELECT o.id FROM public.organizations o
        WHERE o.id IN (
          SELECT organization_id FROM public.organization_members
          WHERE user_id IN ('${ACTORS[0]}', '${ACTORS[1]}')
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.organization_members m
          WHERE m.organization_id = o.id
            AND m.user_id NOT IN ('${ACTORS[0]}', '${ACTORS[1]}')
        )
      )
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
    ${deleteActorsSql(strict)}
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
  if (psqlScalar(`SELECT count(*)::text FROM auth.users WHERE id IN ('${ACTORS[0]}', '${ACTORS[1]}');`) !== '0') {
    console.warn(RETAINED);
  }
}

function expectF01JobRemoved(): void {
  const remaining = psqlScalar(`SELECT count(*)::text FROM public.projects WHERE id = '${JOB}';`);
  if (remaining !== '0') {
    throw new Error(`F01 teardown left ${remaining} project row(s) for ${JOB}.`);
  }
}
