import { test, expect } from '../fixtures/auth';
import { psqlRun, psqlScalar } from '../helpers/psql';
import { rc7OwnedStackSql } from './owned-stack';

const JOB = 'f0180000-0000-4000-8000-000000000010';

// RC7-E6-1 fixed by 28e9e624d: middleware.ts no longer drops the role read's { error } result.
// Contract: the shell gate fails open on a failed role read (as it already does on a throw or a missing
// service key); RLS stays the data boundary.
test('temporary role-read refusal cannot redirect the designer to Wrong portal', async ({ authenticatedPage: page }) => {
  test.setTimeout(120_000);
  psqlRun(rc7OwnedStackSql('E6 role-read'));
  expect(psqlScalar(`SELECT has_table_privilege('service_role','public.user_roles','SELECT')`)).toBe('t');
  psqlRun(`${rc7OwnedStackSql('E6 role-read')}DO $$ BEGIN
    REVOKE SELECT ON public.user_roles FROM service_role;
  END $$;`);
  try {
    expect(psqlScalar(`SELECT has_table_privilege('service_role','public.user_roles','SELECT')`)).toBe('f');
    await page.goto(`/doc/${JOB}`, { waitUntil: 'domcontentloaded' });
    await expect(page).not.toHaveURL(/\/unauthorized(?:\?|$)/);
    await expect(page.locator('[data-document-shell]')).toBeVisible({ timeout: 60_000 });
  } finally {
    psqlRun('GRANT SELECT ON public.user_roles TO service_role;');
    expect(psqlScalar(`SELECT has_table_privilege('service_role','public.user_roles','SELECT')`)).toBe('t');
  }
});
