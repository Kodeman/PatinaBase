import { test, expect } from '../fixtures/auth';
import { psqlRun, psqlScalar } from '../helpers/psql';

const JOB = 'f0180000-0000-4000-8000-000000000010';

// DEFECT RC7-E6-1: middleware.ts:24-29 drops the role read's { error } result and redirects to /unauthorized.
// Contract: the shell gate fails open on a failed role read (as it already does on a throw or a missing
// service key); RLS stays the data boundary. Fix 28e9e624d is not on this base, so the reproducer stays fixme.
test.fixme('temporary role-read refusal cannot redirect the designer to Wrong portal', async ({ authenticatedPage: page }) => {
  test.setTimeout(120_000);
  expect(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).port).toBe('61121');
  expect(new URL(process.env.SUPABASE_DB_URL!).port).toBe('61122');
  expect(psqlScalar(`SELECT current_setting('rc7.e6_stack', true);`)).toBe('patina-rc7-e6');
  expect(psqlScalar(`SELECT has_table_privilege('service_role','public.user_roles','SELECT')`)).toBe('t');
  psqlRun(`DO $$ BEGIN
    IF current_setting('rc7.e6_stack', true) IS DISTINCT FROM 'patina-rc7-e6' THEN RAISE EXCEPTION 'not the E6 owned stack'; END IF;
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
