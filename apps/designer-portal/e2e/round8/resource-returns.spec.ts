import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth';
import { psqlRun, psqlScalar } from '../helpers/psql';

const JOB = 'f0180000-0000-4000-8000-000000000010';
const STUDIO = 'f0180000-0000-4000-8000-000000000001';
const DESIGNER = 'f0180000-0000-4000-8000-000000000002';
const PREFIX = 'f1979000-0000-4000-8000-';
const invoice = (n: number) => PREFIX + String(n).padStart(12, '0');
const notice = (n: number) => PREFIX + String(100 + n).padStart(12, '0');
let owned = false;

test.beforeAll(() => {
  expect(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname).toBe('127.0.0.1');
  expect(psqlScalar(`SELECT count(*) FROM projects WHERE id='${JOB}' AND studio_id='${STUDIO}' AND designer_id='${DESIGNER}';`)).toBe('1');
  expect(psqlScalar(`SELECT (SELECT count(*) FROM invoices WHERE id::text LIKE '${PREFIX}%') + (SELECT count(*) FROM notification_log WHERE id::text LIKE '${PREFIX}%');`)).toBe('0');
  psqlRun(`BEGIN;
    INSERT INTO invoices (id, project_id, designer_id, studio_id, invoice_number, title, status)
    SELECT ('${PREFIX}' || lpad(n::text,12,'0'))::uuid, '${JOB}', '${DESIGNER}', '${STUDIO}', 'A04-' || n, 'A04 fictional invoice', 'draft' FROM generate_series(1,24) n;
    INSERT INTO notification_log (id, user_id, type, channel, status, metadata, created_at)
    SELECT ('${PREFIX}' || lpad((100+n)::text,12,'0'))::uuid, '${DESIGNER}', 'a04_local_notice', 'in_app', 'sent',
      jsonb_build_object('title','A04 fictional notice ' || n,'message','Local return fixture','project_id','${JOB}'), now() - n * interval '1 minute' FROM generate_series(1,24) n;
    COMMIT;`);
  owned = true;
  console.log('[A04 fixture]', psqlScalar(`SELECT (SELECT count(*) FROM invoices WHERE id::text LIKE '${PREFIX}%') || '|' || (SELECT count(*) FROM notification_log WHERE id::text LIKE '${PREFIX}%');`));
});

test.afterAll(() => {
  if (!owned) return;
  psqlRun(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM invoices WHERE id::text LIKE '${PREFIX}%' AND (project_id IS DISTINCT FROM '${JOB}'::uuid OR designer_id<>'${DESIGNER}' OR title IS DISTINCT FROM 'A04 fictional invoice'))
      OR EXISTS (SELECT 1 FROM notification_log WHERE id::text LIKE '${PREFIX}%' AND (user_id IS DISTINCT FROM '${DESIGNER}'::uuid OR type<>'a04_local_notice'))
    THEN RAISE EXCEPTION 'A04 fixture identity changed; refusing cleanup'; END IF;
    DELETE FROM invoices WHERE id::text LIKE '${PREFIX}%';
    DELETE FROM notification_log WHERE id::text LIKE '${PREFIX}%';
  END $$;`);
  expect(psqlScalar(`SELECT (SELECT count(*) FROM invoices WHERE id::text LIKE '${PREFIX}%') + (SELECT count(*) FROM notification_log WHERE id::text LIKE '${PREFIX}%');`)).toBe('0');
  console.log('[A04 cleanup] invoice+notice=0');
});

async function settledStudio(page: Page) {
  await expect(page.locator('[data-studio="round8"]')).toHaveAttribute('data-arrival-ready', '', { timeout: 60_000 });
  await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/);
}

async function palette(page: Page, query: string) {
  await page.locator('#studio-find').fill(query);
  await page.getByRole('search').getByRole('button', { name: 'Find', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Studio search', exact: true })).toHaveValue(query);
}

async function openResource(page: Page, key: string, query: string) {
  const door = page.locator(`[data-studio-door="${key}"]`);
  if (await door.isVisible()) await door.click();
  else {
    await palette(page, query);
    await page.getByRole('option').filter({ hasText: key === 'accounts' ? 'Studio accounts' : 'Studio inbox' }).first().click();
  }
}

async function studioReturn(page: Page) {
  await expect(page.locator('[data-document-shell]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/);
  await page.locator('[data-job-head-return]').click();
  await expect(page).toHaveURL(/\/desk$/);
  await settledStudio(page);
}

async function scrollPosition(page: Page, selector: string, top?: number) {
  return page.locator(selector).evaluate((node, desired) => {
    const root = node.closest<HTMLElement>('[data-doc-sheet-scroll-region]') ?? node.querySelector<HTMLElement>('.cmd-scroll') ?? node as HTMLElement;
    if (desired !== undefined) root.scrollTop = desired;
    return root.scrollTop;
  }, top);
}

test('search restores query, result focus and list scroll once; utilities remain reachable', async ({ authenticatedPage: page }, info) => {
  test.setTimeout(240_000);
  await settledStudio(page);
  const name = psqlScalar(`SELECT name FROM projects WHERE id='${JOB}';`);
  await palette(page, name);
  const result = page.locator(`[data-studio-search-key="doc:${JOB}"]`).first();
  await expect(result).toBeVisible({ timeout: 30_000 });
  await result.focus();
  const top = await scrollPosition(page, '.cmd-sheet', 25);
  await result.press('Enter');
  await expect(page).toHaveURL(`/doc/${JOB}`, { timeout: 60_000 });
  await studioReturn(page);
  await expect(page.getByRole('combobox', { name: 'Studio search', exact: true })).toHaveValue(name);
  await expect(result).toBeFocused();
  await expect.poll(() => scrollPosition(page, '.cmd-sheet')).toBe(top);
  await page.screenshot({ path: info.outputPath('search-return.png') });
  await page.keyboard.press('Escape');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await settledStudio(page);
  await expect(page.getByRole('combobox', { name: 'Studio search', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Your account/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Help', exact: true }).first()).toHaveAttribute('href', '/help');
  await page.locator('[data-studio-masthead]').getByRole('button', { name: 'Hours', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Timesheets', exact: true })).toBeVisible();
});

test('book returns to the exact invoice row, scroll and folio without a write', async ({ authenticatedPage: page }, info) => {
  test.setTimeout(240_000);
  await settledStudio(page);
  const writes: string[] = [];
  page.on('request', r => {
    const path = new URL(r.url()).pathname;
    // Native folio reads use POST RPCs; neither read is a write or replay.
    if (['/rest/v1/rpc/get_ffe_invoice_coverage', '/rest/v1/rpc/get_invoice_link'].includes(path)) return;
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(r.method()) && /invoices|invoice_line_items|\/rpc\/.*invoice/.test(path)) writes.push(r.url());
  });
  await openResource(page, 'accounts', 'accounts');
  const sheet = page.getByRole('dialog', { name: 'Studio accounts', exact: true });
  await expect(sheet).toBeVisible();
  const row = page.locator(`[data-invoice-row="${invoice(20)}"]`);
  const act = row.locator('[data-action-key="open-invoice-document"]');
  await act.scrollIntoViewIfNeeded();
  await act.focus();
  const top = await scrollPosition(page, '[data-invoice-row="' + invoice(20) + '"]');
  expect(top).toBeGreaterThan(0);
  await act.press('Enter');
  await expect(page).toHaveURL(`/doc/${JOB}`, { timeout: 60_000 });
  await studioReturn(page);
  await expect(sheet).toBeVisible();
  await expect(act).toBeFocused();
  await expect.poll(() => scrollPosition(page, '[data-invoice-row="' + invoice(20) + '"]')).toBe(top);
  await expect(sheet.getByRole('button', { name: 'Ledger', exact: true })).toHaveAttribute('aria-current', 'page');
  await row.locator('[data-invoice-folio-opener]').click();
  const folio = page.locator(`[data-accounts-folio="${invoice(20)}"]`);
  await expect(folio).toBeVisible();
  await folio.locator('[data-action-key="open-invoice-document"]').click();
  await expect(page).toHaveURL(`/doc/${JOB}`, { timeout: 60_000 });
  await studioReturn(page);
  await expect(folio).toBeVisible();
  await expect(folio.locator('[data-action-key="open-invoice-document"]')).toBeFocused();
  await page.screenshot({ path: info.outputPath('book-folio-return.png') });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await settledStudio(page);
  await expect(sheet).toHaveCount(0);
  expect(writes).toEqual([]);
  expect(psqlScalar(`SELECT count(*) FROM invoices WHERE id::text LIKE '${PREFIX}%' AND status='draft';`)).toBe('24');
});

test('Post activity returns to its exact job-linked record without replaying mark-read', async ({ authenticatedPage: page }, info) => {
  test.setTimeout(240_000);
  await settledStudio(page);
  let markReads = 0;
  page.on('request', r => { if (r.url().includes('/api/inbox/mark-read') && r.method() === 'POST') markReads++; });
  await openResource(page, 'the-post', 'inbox');
  const sheet = page.getByRole('dialog', { name: 'Studio inbox', exact: true });
  const row = page.locator(`[data-studio-post-key="inbox:${notice(20)}"]`);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.scrollIntoViewIfNeeded();
  await row.focus();
  const top = await scrollPosition(page, '[data-overlay-post]');
  expect(top).toBeGreaterThan(0);
  await row.press('Enter');
  await expect(page).toHaveURL(`/doc/${JOB}`, { timeout: 60_000 });
  await expect.poll(() => psqlScalar(`SELECT metadata->>'read_at' IS NOT NULL FROM notification_log WHERE id='${notice(20)}';`)).toBe('t');
  const readAt = psqlScalar(`SELECT metadata->>'read_at' FROM notification_log WHERE id='${notice(20)}';`);
  await studioReturn(page);
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Activity log', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(row).toBeFocused();
  await expect.poll(() => scrollPosition(page, '[data-overlay-post]')).toBe(top);
  await page.screenshot({ path: info.outputPath('post-return.png') });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await settledStudio(page);
  await expect(sheet).toHaveCount(0);
  expect(markReads).toBe(1);
  expect(psqlScalar(`SELECT metadata->>'read_at' FROM notification_log WHERE id='${notice(20)}';`)).toBe(readAt);
});
