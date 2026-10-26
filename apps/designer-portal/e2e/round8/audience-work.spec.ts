import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth';
import { psqlRun, psqlScalar } from '../helpers/psql';

const JOB = 'f0180000-0000-4000-8000-000000000010';
const DESIGNER = 'f0180000-0000-4000-8000-000000000002';

async function openComposer(page: Page) {
  await page.goto(`/doc/${JOB}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await expect(page.locator('[data-document-shell]')).toHaveAttribute('data-arrival-ready', '', { timeout: 60_000 });
  await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/);
  if ((page.viewportSize()?.width ?? 1440) < 1180) {
    await page.getByRole('button', { name: 'More studio actions', exact: true }).click();
    await page.getByRole('group', { name: 'In this document', exact: true }).getByRole('button', { name: /^Margin/ }).click();
  }
  await page.getByRole('button', { name: '+ Decision', exact: true }).click();
  const composer = page.getByRole('dialog', { name: 'New decision', exact: true });
  await expect(composer).toBeVisible();
  return composer;
}

test('explicit audience keeps Private out of client_decisions; Shared saves a native unsent draft only on Save', async ({ authenticatedPage: page }, info) => {
  test.setTimeout(240_000);
  expect(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname).toBe('127.0.0.1');
  const title = `N03 fictional audience ${info.project.name}`;
  const owned = `project_id='${JOB}' AND title='${title}'`;
  expect(psqlScalar(`SELECT count(*) FROM client_decisions WHERE ${owned};`)).toBe('0');
  let creates = 0;
  let externalSends = 0;
  page.on('request', request => {
    if (request.url().includes('/rest/v1/rpc/create_client_decision')) creates++;
  });
  const sendRoute = '**/functions/v1/*';
  await page.route(sendRoute, route => {
    externalSends++;
    return route.fulfill({ status: 503, json: { message: 'N03 never permits an external send' } });
  });
  const before = psqlScalar(`SELECT count(*) FROM client_decisions WHERE project_id='${JOB}';`);
  try {
    const composer = await openComposer(page);
    await composer.locator('textarea').first().fill(title);
    const privateChoice = composer.getByRole('radio', { name: 'Private — studio only', exact: true });
    const sharedChoice = composer.getByRole('radio', { name: 'Shared — client and project parties', exact: true });
    await expect(privateChoice).not.toBeChecked();
    await expect(sharedChoice).not.toBeChecked();
    await expect(composer.getByRole('button', { name: 'Save as draft', exact: true })).toBeDisabled();
    await expect(composer.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled();
    await privateChoice.check();
    await expect(composer.getByText(/Use the existing private note in the margin/)).toBeVisible();
    await expect(composer.getByRole('button', { name: 'Save as draft', exact: true })).toHaveCount(0);
    await expect(composer.getByRole('button', { name: 'Publish', exact: true })).toHaveCount(0);
    expect(creates).toBe(0);
    expect(psqlScalar(`SELECT count(*) FROM client_decisions WHERE project_id='${JOB}';`)).toBe(before);
    await sharedChoice.check();
    await expect(composer.getByText(/The client and project parties can see this, including saved drafts/)).toBeVisible();
    expect(creates).toBe(0);
    await page.screenshot({ path: info.outputPath('shared-audience.png') });
    await composer.getByRole('button', { name: 'Save as draft', exact: true }).click();
    await expect.poll(() => psqlScalar(`SELECT count(*) FROM client_decisions WHERE ${owned} AND status='draft' AND sent_at IS NULL;`)).toBe('1');
    await expect(composer).toHaveCount(0);
    expect(creates).toBe(1);
    expect(externalSends).toBe(0);
    console.log('[N03 readback] Private creates=0; Shared draft=1, sent_at=NULL, external sends=0');
  } finally {
    try {
      psqlRun(`BEGIN;
        DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM client_decisions WHERE ${owned} AND designer_id IS DISTINCT FROM '${DESIGNER}')
          THEN RAISE EXCEPTION 'N03 decision fixture ownership changed'; END IF;
        END $$;
        SET LOCAL session_replication_role=replica;
        DELETE FROM client_decision_options WHERE decision_id IN (SELECT id FROM client_decisions WHERE ${owned});
        DELETE FROM client_decisions WHERE ${owned};
        COMMIT;`);
      expect(psqlScalar(`SELECT count(*) FROM client_decisions WHERE ${owned};`)).toBe('0');
    } finally {
      await page.unroute(sendRoute);
    }
  }
});
