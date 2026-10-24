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
    SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
    DELETE FROM public.room_scans WHERE id = 'f0180000-0000-4000-8000-000000000020';
    DELETE FROM public.projects WHERE id = '${JOB}';
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
