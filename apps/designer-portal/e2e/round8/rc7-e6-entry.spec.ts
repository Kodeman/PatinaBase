import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth';
import { psqlRun, psqlScalar } from '../helpers/psql';

const JOB = 'f0180000-0000-4000-8000-000000000010';
const ORDER = 'f6110000-0000-4000-8000-000000000101';
const NOTICE = 'f6110000-0000-4000-8000-000000000102';
const VENDOR = 'f6110000-0000-4000-8000-000000000103';
let seeded = false;

function readback() {
  return psqlScalar(`SELECT (SELECT status || '|' || coalesce(sent_at::text,'unsent') FROM purchase_orders WHERE id='${ORDER}') || '|' ||
    (SELECT coalesce(metadata->>'read_at','unread') FROM notification_log WHERE id='${NOTICE}');`);
}

async function settled(page: Page) {
  await expect(page.locator('[data-studio="round8"]')).toHaveAttribute('data-arrival-ready', '', { timeout: 60_000 });
  await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/);
}

async function returnToStudio(page: Page) {
  await expect(page).toHaveURL(new RegExp(`/doc/${JOB}(?:\\?|$)`), { timeout: 60_000 });
  await expect(page.locator('[data-job-head]')).toContainText('F01 Fictional Full-Service House', { timeout: 60_000 });
  await page.locator('[data-job-head-return]').click();
  await settled(page);
}

async function search(page: Page, query: string) {
  await page.locator('#studio-find').fill(query);
  await page.getByRole('search').getByRole('button', { name: 'Find', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Studio search' })).toHaveValue(query);
}

test.describe('RC7 E6 exact job entry matrix on live rows', () => {
  test.setTimeout(300_000);
  test.beforeAll(() => {
    expect(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).port).toBe('61121');
    expect(new URL(process.env.SUPABASE_DB_URL!).port).toBe('61122');
    expect(psqlScalar(`SELECT current_setting('rc7.e6_stack', true);`)).toBe('patina-rc7-e6');
    psqlRun(readFileSync(path.join(__dirname, 'rc7-e6-entry-fixture.sql'), 'utf8'));
    seeded = true;
    expect(readback()).toBe('draft|unsent|unread');
  });
  test.afterAll(() => {
    if (!seeded) return;
    psqlRun(`BEGIN; DO $$ BEGIN
      IF current_setting('rc7.e6_stack', true) IS DISTINCT FROM 'patina-rc7-e6'
        OR NOT EXISTS (SELECT 1 FROM purchase_orders WHERE id='${ORDER}' AND project_id='${JOB}' AND po_number='E6-DRAFT' AND status='draft' AND sent_at IS NULL)
        OR NOT EXISTS (SELECT 1 FROM notification_log WHERE id='${NOTICE}' AND type='e6_local_notice')
      THEN RAISE EXCEPTION 'E6 fixture changed unexpectedly; refusing cleanup'; END IF;
    END $$;
    DELETE FROM purchase_orders WHERE id='${ORDER}';
    DELETE FROM notification_log WHERE id='${NOTICE}';
    DELETE FROM vendors WHERE id='${VENDOR}' AND name='E6 Fictional Maker'; COMMIT;`);
    expect(psqlScalar(`SELECT (SELECT count(*) FROM purchase_orders WHERE id='${ORDER}') + (SELECT count(*) FROM notification_log WHERE id='${NOTICE}') + (SELECT count(*) FROM vendors WHERE id='${VENDOR}');`)).toBe('0');
  });

  test('next act, search and correspondence return to their exact opener without replay', async ({ authenticatedPage: page }) => {
    await settled(page);
    const before = readback();
    const attention = page.locator('[data-studio-attention-item]').filter({ hasText: 'F01 Fictional Full-Service House' }).first();
    const next = attention.getByRole('link').first();
    await next.scrollIntoViewIfNeeded();
    await next.focus();
    const attentionTop = await next.evaluate(node => node.getBoundingClientRect().top);
    await next.press('Enter');
    await returnToStudio(page);
    await expect(next).toBeFocused();
    await expect.poll(() => next.evaluate((node, top) => Math.abs(node.getBoundingClientRect().top - top), attentionTop)).toBeLessThan(4);
    expect(readback()).toBe(before);

    const name = psqlScalar(`SELECT name FROM projects WHERE id='${JOB}';`);
    await search(page, name);
    const result = page.locator(`[data-studio-search-key="doc:${JOB}"]`).first();
    await result.focus();
    const resultTop = await result.evaluate(node => node.getBoundingClientRect().top);
    await result.press('Enter');
    await returnToStudio(page);
    await expect(page.getByRole('combobox', { name: 'Studio search' })).toHaveValue(name);
    await expect(result).toBeFocused();
    await expect.poll(() => result.evaluate((node, top) => Math.abs(node.getBoundingClientRect().top - top), resultTop)).toBeLessThan(4);
    expect(readback()).toBe(before);

    await page.keyboard.press('Escape');
    await page.locator('[data-studio-door="the-post"]').click();
    const post = page.getByRole('dialog', { name: 'Studio inbox' });
    const notice = post.locator(`[data-studio-post-key="inbox:${NOTICE}"]`);
    await notice.scrollIntoViewIfNeeded();
    await notice.focus();
    const noticeTop = await notice.evaluate(node => node.closest<HTMLElement>('[data-doc-sheet-scroll-region]')!.scrollTop);
    await notice.press('Enter');
    await expect.poll(() => readback().endsWith('|unread'), { timeout: 30_000 }).toBe(false);
    const marked = readback();
    await returnToStudio(page);
    await expect(post).toBeVisible();
    await expect(post.getByRole('button', { name: 'Activity log' })).toHaveAttribute('aria-current', 'page');
    await expect(notice).toBeFocused();
    await expect.poll(() => notice.evaluate(node => node.closest<HTMLElement>('[data-doc-sheet-scroll-region]')!.scrollTop)).toBe(noticeTop);
    expect(readback()).toBe(marked);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await settled(page);
    await expect(post).toHaveCount(0);
    expect(readback()).toBe(marked);
  });

  // RC7-E6-2 fixed by e5fba0bb3/2116982a4: Orders records a return marker for its opener.
  test('order entry returns to the exact order row, scroll and focus without replay', async ({ authenticatedPage: page }) => {
    await settled(page);
    const before = readback();
    await page.keyboard.press('ControlOrMeta+k');
    const palette = page.getByRole('dialog', { name: 'Studio search' });
    await palette.getByRole('combobox', { name: 'Studio search' }).fill('orders');
    await palette.getByRole('option', { name: 'Purchase orders ledger g o', exact: true }).click();
    const ledger = page.getByRole('dialog', { name: 'Purchase orders' });
    const order = ledger.locator('[data-orders-po-row]').filter({ hasText: 'E6-DRAFT' });
    const opener = order.getByRole('button', { name: 'open document →' });
    await opener.scrollIntoViewIfNeeded();
    await opener.focus();
    const orderTop = await opener.evaluate(node => node.closest<HTMLElement>('[data-doc-sheet-scroll-region]')!.scrollTop);
    await opener.press('Enter');
    await returnToStudio(page);
    await expect(ledger).toBeVisible();
    await expect(opener).toBeFocused();
    await expect.poll(() => opener.evaluate(node => node.closest<HTMLElement>('[data-doc-sheet-scroll-region]')!.scrollTop)).toBe(orderTop);
    expect(readback()).toBe(before);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await settled(page);
    expect(readback()).toBe(before);
  });
});
