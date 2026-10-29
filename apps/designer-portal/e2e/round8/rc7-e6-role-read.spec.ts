import { test, expect } from '../fixtures/auth';
import { psqlRun, psqlScalar } from '../helpers/psql';

const JOB = 'f0180000-0000-4000-8000-000000000010';

// DEFECT RC7-e6-1: a refused role read is misreported as a forbidden account.
test.fixme('temporary role-read refusal cannot redirect the designer to Wrong portal', async ({ authenticatedPage: page }) => {
  test.setTimeout(120_000);
  expect(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).port).toBe('61121');
  expect(new URL(process.env.SUPABASE_DB_URL!).port).toBe('61122');
  expect(psqlScalar(`SELECT has_table_privilege('service_role','public.user_roles','SELECT')`)).toBe('t');
  psqlRun('REVOKE SELECT ON public.user_roles FROM service_role;');
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
