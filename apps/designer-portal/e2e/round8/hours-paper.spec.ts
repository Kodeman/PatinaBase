import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth';
import { psqlRun, psqlScalar } from '../helpers/psql';

const STUDIO = 'f0180000-0000-4000-8000-000000000001';
const DESIGNER = 'f0180000-0000-4000-8000-000000000002';
const CLIENT = 'f0180000-0000-4000-8000-000000000003';
const JOB = 'f2068000-0000-4000-8000-000000000001';
const RATE = 'f2068000-0000-4000-8000-000000000002';
const TITLE = 'H01 fictional Hours job';
let owned = false;

test.beforeAll(() => {
  expect(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname).toBe('127.0.0.1');
  expect(psqlScalar(`SELECT count(*) FROM projects WHERE id='${JOB}';`)).toBe('0');
  expect(psqlScalar(`SELECT count(*) FROM studio_member_rates WHERE studio_id='${STUDIO}';`)).toBe('0');
  psqlRun(`BEGIN;
    INSERT INTO projects (id,name,status,created_by,designer_id,client_id,studio_id)
    VALUES ('${JOB}','${TITLE}','active','${DESIGNER}','${DESIGNER}','${CLIENT}','${STUDIO}');
    INSERT INTO studio_member_rates (id,studio_id,user_id,hourly_rate_cents,effective_from,created_by)
    VALUES ('${RATE}','${STUDIO}','${DESIGNER}',20000,CURRENT_DATE-30,'${DESIGNER}');
    COMMIT;`);
  owned = true;
});

test.afterAll(() => {
  if (!owned) return;
  psqlRun(`BEGIN;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM projects WHERE id='${JOB}' AND name='${TITLE}' AND designer_id='${DESIGNER}')
        OR EXISTS (SELECT 1 FROM project_time_entries WHERE project_id='${JOB}' AND user_id<>'${DESIGNER}')
        OR EXISTS (SELECT 1 FROM invoices WHERE project_id='${JOB}' AND designer_id<>'${DESIGNER}')
      THEN RAISE EXCEPTION 'H01 fixture identity changed; refusing cleanup'; END IF;
    END $$;
    SET LOCAL session_replication_role=replica;
    DELETE FROM invoice_line_items WHERE invoice_id IN (SELECT id FROM invoices WHERE project_id='${JOB}');
    DELETE FROM project_time_entries WHERE project_id='${JOB}';
    DELETE FROM invoices WHERE project_id='${JOB}';
    DELETE FROM studio_member_rates WHERE id='${RATE}' AND studio_id='${STUDIO}' AND user_id='${DESIGNER}';
    SET LOCAL session_replication_role=origin;
    DELETE FROM projects WHERE id='${JOB}';
    COMMIT;`);
  expect(psqlScalar(`SELECT (SELECT count(*) FROM projects WHERE id='${JOB}') || '|' ||
    (SELECT count(*) FROM project_time_entries WHERE project_id='${JOB}') || '|' ||
    (SELECT count(*) FROM invoices WHERE project_id='${JOB}') || '|' ||
    (SELECT count(*) FROM studio_member_rates WHERE id='${RATE}');`)).toBe('0|0|0|0');
  console.log('[H01 cleanup] project|time|invoice|rate=0|0|0|0');
});

async function openHours(page: Page) {
  await expect(page.locator('[data-studio="round8"]')).toHaveAttribute('data-arrival-ready', '', { timeout: 60_000 });
  await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/);
  await page.locator('[data-studio-masthead]').getByRole('button', { name: 'Hours', exact: true }).click();
  const hours = page.getByRole('dialog', { name: 'Timesheets', exact: true });
  await expect(hours).toBeVisible();
  return hours;
}

test('own-week loading and refusal never become an empty week; native retry restores the read', async ({ authenticatedPage: page }) => {
  test.setTimeout(180_000);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let refusing = true;
  const matcher = '**/rest/v1/project_time_entries?*';
  await page.route(matcher, async route => {
    if (!new URL(route.request().url()).searchParams.has('started_at')) return route.continue();
    await held;
    if (refusing) await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'H01 forced read refusal' }) });
    else await route.continue();
  });
  try {
    const hours = await openHours(page);
    await expect(hours.getByText('Reading your hours…', { exact: true })).toBeVisible();
    await expect(hours.getByText('No time entries yet', { exact: true })).toHaveCount(0);
    await expect(hours.getByText(/Today ·/)).toHaveCount(0);
    await expect(hours.getByRole('button', { name: 'Bill week → Accounts' })).toBeDisabled();
    release();
    await expect(hours.getByText('Your hours could not be read.', { exact: false })).toBeVisible({ timeout: 45_000 });
    await expect(hours.getByText('No time entries yet', { exact: true })).toHaveCount(0);
    refusing = false;
    await hours.getByRole('button', { name: 'Read your hours again' }).click();
    await expect(hours.getByText('Your hours could not be read.', { exact: false })).toHaveCount(0);
    await expect(hours.getByText(/Today ·/)).toBeVisible();
  } finally {
    release();
    await page.unroute(matcher);
  }
});

test('manual capture uses server rate provenance; drafting claims once and void releases the same hour', async ({ authenticatedPage: page }, info) => {
  test.setTimeout(240_000);
  const hours = await openHours(page);
  await hours.getByRole('combobox', { name: 'Project', exact: true }).selectOption(JOB);
  await hours.getByRole('spinbutton', { name: 'Minutes', exact: true }).fill('30');
  await hours.getByRole('button', { name: 'Non-billable — press to make billable', exact: true }).click();
  const log = hours.getByRole('button', { name: 'Log time', exact: true });
  await expect(log).toBeEnabled();
  await log.click();
  await expect.poll(() => psqlScalar(`SELECT count(*) FROM project_time_entries WHERE project_id='${JOB}' AND user_id='${DESIGNER}' AND duration_minutes=30 AND source='manual_entry';`)).toBe('1');
  expect(psqlScalar(`SELECT hourly_rate_cents || '|' || rate_source || '|' || rated_amount_cents || '|' || billable FROM project_time_entries WHERE project_id='${JOB}';`)).toBe('20000|studio_member|10000|true');
  const mountedHours = page.getByRole('dialog', { name: 'Timesheets', exact: true, includeHidden: true });
  const row = mountedHours.getByRole('listitem', { includeHidden: true }).filter({ hasText: TITLE });
  await expect(row).toContainText('Studio rate · $200/hr · $100');
  await hours.getByRole('button', { name: 'Draft time invoice', exact: true }).click();
  const composer = page.getByRole('dialog', { name: 'Draw an invoice', exact: true });
  await expect(composer).toBeVisible();
  await composer.getByRole('button', { name: 'Draft the invoice', exact: true }).click();
  await expect.poll(() => psqlScalar(`SELECT count(*) FROM project_time_entries t JOIN invoices i ON i.id=t.invoice_id WHERE t.project_id='${JOB}' AND i.status='draft';`)).toBe('1');
  const invoiceId = psqlScalar(`SELECT invoice_id FROM project_time_entries WHERE project_id='${JOB}';`);
  expect(psqlScalar(`SELECT count(*) FROM invoices WHERE project_id='${JOB}';`)).toBe('1');
  const folio = page.getByRole('dialog', { name: 'Invoice folio', exact: true });
  await expect(folio).toBeVisible();
  await expect(row.getByText('Billed', { exact: true })).toBeAttached();
  await expect(mountedHours.getByText('unbilled · all time', { exact: true })).toHaveCount(0);
  await folio.getByRole('button', { name: 'Void', exact: true }).click();
  await folio.getByRole('textbox', { name: 'Void reason' }).fill('H01 fictional local lifecycle check');
  await folio.getByRole('button', { name: 'Void invoice', exact: true }).click();
  await expect.poll(() => psqlScalar(`SELECT status FROM invoices WHERE id='${invoiceId}';`)).toBe('void');
  expect(psqlScalar(`SELECT count(*) FROM project_time_entries WHERE project_id='${JOB}' AND invoice_id IS NULL AND rated_amount_cents=10000;`)).toBe('1');
  await expect(row.getByText('Billed', { exact: true })).toHaveCount(0);
  await expect(mountedHours.getByText('unbilled · all time', { exact: true })).toBeAttached();
  await expect(mountedHours.getByText('$100 · 30 min', { exact: true })).toBeAttached();
  console.log('[H01 native readback]', { invoiceId, rate: 20000, amount: 10000, state: 'void', released: 1 });
  await page.screenshot({ path: info.outputPath('hours-void-release.png') });
});
