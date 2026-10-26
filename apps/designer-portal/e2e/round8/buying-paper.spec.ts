import { test, expect } from '../fixtures/auth';
import type { Page } from '@playwright/test';
import { psqlRun, psqlScalar } from '../helpers/psql';

const JOB = 'f0180000-0000-4000-8000-000000000010';
const DESIGNER = 'f0180000-0000-4000-8000-000000000002';
const PREFIX = 'f0670000-0000-4000-8000-';
const id = (n: number) => `${PREFIX}${String(n).padStart(12, '0')}`;

function cleanup() {
  psqlRun(`BEGIN; SET LOCAL statement_timeout = '5s';
    DELETE FROM public.purchase_orders WHERE id IN ('${id(101)}', '${id(102)}')
      AND project_id = '${JOB}' AND designer_id = '${DESIGNER}';
    DELETE FROM public.vendors WHERE id IN ('${id(1)}', '${id(2)}')
      AND name = 'P01 Fictional Same-name Maker'; COMMIT;`);
  expect(psqlScalar(`SELECT
    (SELECT count(*) FROM public.purchase_orders WHERE id::text LIKE '${PREFIX}%') +
    (SELECT count(*) FROM public.vendors WHERE id::text LIKE '${PREFIX}%');`), 'P01 fixture residue').toBe('0');
}

function seed() {
  expect(psqlScalar(`SELECT
    (SELECT count(*) FROM public.purchase_orders WHERE id::text LIKE '${PREFIX}%') +
    (SELECT count(*) FROM public.vendors WHERE id::text LIKE '${PREFIX}%');`), 'P01 namespace starts empty').toBe('0');
  psqlRun(`BEGIN; SET LOCAL statement_timeout = '5s';
    INSERT INTO public.vendors(id, name) VALUES
      ('${id(1)}', 'P01 Fictional Same-name Maker'), ('${id(2)}', 'P01 Fictional Same-name Maker');
    INSERT INTO public.purchase_orders(id, designer_id, project_id, vendor_id, payment_pattern, po_number, status, sent_at)
    SELECT '${id(101)}', '${DESIGNER}', '${JOB}', '${id(1)}',
      enum_first(NULL::public.purchase_order_payment_pattern), 'P01-DRAFT', 'draft', NULL
    UNION ALL SELECT '${id(102)}', '${DESIGNER}', '${JOB}', '${id(2)}',
      enum_first(NULL::public.purchase_order_payment_pattern), 'P01-SENT', 'confirmed', now();
    COMMIT;`);
}

async function openOrders(page: Page) {
  await expect(page.locator('[data-arrival-ready]')).toHaveCount(1, { timeout: 60_000 });
  await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/, { timeout: 30_000 });
  await page.keyboard.press('ControlOrMeta+k');
  const palette = page.getByRole('dialog', { name: 'Studio search' });
  await expect(palette).toBeVisible();
  await palette.getByRole('textbox').fill('orders');
  await palette.getByText('Orders', { exact: true }).click();
  const ledger = page.getByRole('dialog', { name: 'Purchase orders' });
  await expect(ledger).toBeVisible();
  return ledger;
}

test.describe('P01 native buying paper', () => {
  test.setTimeout(180_000);

  test('same-name makers stay separate; saved is not sent; paper and preview return to the actual pointer opener', async ({ authenticatedPage: page }) => {
    seed();
    try {
      expect(psqlScalar(`SELECT count(DISTINCT vendor_id) FROM public.purchase_orders
        WHERE id IN ('${id(101)}', '${id(102)}') AND project_id = '${JOB}';`), 'native fixture has two distinct makers').toBe('2');
      const ledger = await openOrders(page);
      const draft = ledger.locator('[data-orders-po-row]').filter({ hasText: 'P01-DRAFT' });
      const sent = ledger.locator('[data-orders-po-row]').filter({ hasText: 'P01-SENT' });
      await expect(draft).toContainText('not sent');
      await expect(sent).toContainText('sent');
      const draftGroup = draft.locator('xpath=ancestor::section[1]');
      const sentGroup = sent.locator('xpath=ancestor::section[1]');
      await expect(draftGroup).toContainText('P01 Fictional Same-name Maker');
      await expect(sentGroup).toContainText('P01 Fictional Same-name Maker');
      await expect(draftGroup.locator('[data-orders-po-row]')).toHaveCount(1);
      await expect(sentGroup.locator('[data-orders-po-row]')).toHaveCount(1);

      const paperOpener = draft.getByRole('button', { name: 'Send →', exact: true });
      // Remove pre-focus: Safari pointer clicks do not necessarily focus buttons.
      await ledger.evaluate((node) => { node.tabIndex = -1; node.focus(); });
      await paperOpener.dispatchEvent('click');
      const paper = page.getByRole('dialog', { name: 'Purchase order P01-DRAFT', exact: true });
      await expect(paper).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(paper).toHaveCount(0);
      await expect(paperOpener, 'order paper restores the event currentTarget, not pre-focus').toBeFocused();

      const previewOpener = sent.getByRole('button', { name: 'Resend', exact: true });
      await ledger.evaluate((node) => node.focus());
      await previewOpener.dispatchEvent('click');
      const preview = page.getByRole('dialog', { name: 'Purchase order preview', exact: true });
      await expect(preview).toBeVisible();
      await expect(preview).toHaveAttribute('aria-modal', 'true');
      await page.keyboard.press('Escape');
      await expect(preview).toHaveCount(0);
      await expect(previewOpener, 'PDF preview restores its exact row opener').toBeFocused();
      await expect(ledger).toBeVisible();
      expect(psqlScalar(`SELECT count(*) FROM public.purchase_orders WHERE id = '${id(101)}' AND sent_at IS NULL AND status = 'draft';`), 'opening saved paper did not send it').toBe('1');
    } finally {
      cleanup();
    }
  });

  test('an unavailable register is not an empty book and can retry the native read', async ({ authenticatedPage: page }) => {
    const route = '**/rest/v1/purchase_orders?*';
    let fail = true;
    await page.route(route, async (request) => {
      if (fail) await request.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'P01 deliberate read failure' }) });
      else await request.continue();
    });
    try {
      const ledger = await openOrders(page);
      const alert = ledger.getByRole('alert');
      await expect(alert).toContainText('The purchase orders could not be read.', { timeout: 30_000 });
      await expect(ledger).not.toContainText('No purchase orders');
      fail = false;
      await alert.getByRole('button', { name: 'Read the orders again' }).click();
      await expect(alert).toHaveCount(0, { timeout: 30_000 });
      await expect(ledger.locator('[data-orders-register]')).toBeVisible();
    } finally {
      await page.unroute(route);
    }
  });
});
