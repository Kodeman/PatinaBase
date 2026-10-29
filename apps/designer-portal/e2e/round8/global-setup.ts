import { readFileSync } from 'node:fs';
import type { FullConfig } from '@playwright/test';
import { warmAuthenticatedRoutes } from '../helpers/warm-authenticated-routes';
import path from 'node:path';
import { psqlRun, psqlScalar } from '../helpers/psql';
import { round8Stack } from './owned-stack';

export default async function globalSetup(config: FullConfig): Promise<void> {
  // Validate before any psql write.
  round8Stack('F01 fixture load');
  // f01-fixture.sql reloads idempotently over retained F01 actors, but a prior
  // run's executed F01 agreements cannot be deleted (00390), so they would sit
  // in this run's F01 reads. Such a stack is spent; start a fresh one.
  const executed = psqlScalar(`
    SELECT count(*) FROM public.proposals
    WHERE designer_id IN ('f0180000-0000-4000-8000-000000000002', 'f0180000-0000-4000-8000-000000000003')
      AND status <> 'draft';
  `);
  if (executed !== '0') {
    throw new Error(
      `F01 fixture load: ${executed} executed F01 agreement(s) retained from an earlier run. ` +
        'Start a fresh owned stack (supabase stop --no-backup, then supabase start) before rerunning round-8.',
    );
  }
  psqlRun(readFileSync(path.join(__dirname, 'f01-fixture.sql'), 'utf8'));
  // The auth fixture reads these in its worker, after globalSetup has finished.
  process.env.DESIGNER_E2E_EMAIL = psqlScalar(
    "SELECT email FROM auth.users WHERE id = 'f0180000-0000-4000-8000-000000000002';",
  );
  process.env.DESIGNER_E2E_PASSWORD = 'password123';
  console.log('[F01 readback]', psqlScalar(`
    SELECT json_build_object('job', p.id, 'studio', p.studio_id,
      'lines', (SELECT count(*) FROM public.project_ffe_items WHERE project_id = p.id AND removed_at IS NULL),
      'living', (SELECT count(*) FROM public.project_ffe_items WHERE project_id = p.id AND project_room_id = 'f0180000-0000-4000-8000-000000000011' AND removed_at IS NULL))
    FROM public.projects p WHERE p.id = 'f0180000-0000-4000-8000-000000000010';
  `));

  // Cold next-dev compilation can full-reload the active Desk while WebKit is
  // navigating away. Compile the entries before any browser owns an HMR
  // connection; the tests still perform their real reads and arrivals.
  const document = '/doc/f0180000-0000-4000-8000-000000000010';
  await warmAuthenticatedRoutes(config, ['/desk', document, `${document}/pieces`, '/library']);
}
