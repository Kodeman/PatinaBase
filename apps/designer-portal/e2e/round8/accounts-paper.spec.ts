import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth';
import { psqlRun, psqlScalar } from '../helpers/psql';

const STUDIO = 'f0180000-0000-4000-8000-000000000001';
const DESIGNER = 'f0180000-0000-4000-8000-000000000002';
const CLIENT = 'f0180000-0000-4000-8000-000000000003';
const JOB = 'f2077000-0000-4000-8000-000000000001';
const PART = 'f2077000-0000-4000-8000-000000000002';
const UNDATED = 'f2077000-0000-4000-8000-000000000003';
const DRAFT = 'f2077000-0000-4000-8000-000000000004';
const VOID = 'f2077000-0000-4000-8000-000000000005';
const PAYMENT = 'f2077000-0000-4000-8000-000000000006';
const TITLE = 'H02 fictional books job';
const IDS = [PART, UNDATED, DRAFT, VOID].map(id => `'${id}'`).join(',');
let owned = false;

test.beforeAll(() => {
  expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toMatch(/^http:\/\/127\.0\.0\.1:54321\/?$/);
  expect(psqlScalar(`SELECT count(*) FROM projects WHERE id='${JOB}';`)).toBe('0');
  expect(psqlScalar(`SELECT count(*) FROM invoices WHERE studio_id='${STUDIO}';`)).toBe('0');
  psqlRun(`BEGIN;
    INSERT INTO projects (id,name,status,created_by,designer_id,client_id,studio_id)
    VALUES ('${JOB}','${TITLE}','active','${DESIGNER}','${DESIGNER}','${CLIENT}','${STUDIO}');
    INSERT INTO invoices (id,project_id,designer_id,client_id,studio_id,invoice_number,status,total_cents,subtotal_cents,due_date,internal_notes)
    VALUES ('${PART}','${JOB}','${DESIGNER}','${CLIENT}','${STUDIO}','H02-ISSUED','sent',20000,20000,CURRENT_DATE-10,'PRIVATE COST H02 987654'),
      ('${UNDATED}','${JOB}','${DESIGNER}','${CLIENT}','${STUDIO}','H02-UNDATED','sent',4000,4000,NULL,'PRIVATE COST H02 987654'),
      ('${DRAFT}','${JOB}','${DESIGNER}','${CLIENT}','${STUDIO}',NULL,'draft',999999,999999,NULL,'PRIVATE COST H02 987654'),
      ('${VOID}','${JOB}','${DESIGNER}','${CLIENT}','${STUDIO}','H02-VOID','void',80000,80000,NULL,'PRIVATE COST H02 987654');
    INSERT INTO invoice_payments (id,invoice_id,amount_cents,method,status,received_at,recorded_by,reference)
    VALUES ('${PAYMENT}','${PART}',5000,'check','succeeded',now(),'${DESIGNER}','H02 fictional native receipt');
    COMMIT;`);
  owned = true;
});

test.afterAll(() => {
  if (!owned) return;
  psqlRun(`BEGIN;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM projects WHERE id='${JOB}' AND name='${TITLE}' AND designer_id='${DESIGNER}')
        OR EXISTS (SELECT 1 FROM invoices WHERE project_id='${JOB}' AND (id NOT IN (${IDS}) OR designer_id<>'${DESIGNER}'))
        OR EXISTS (SELECT 1 FROM invoice_payments WHERE invoice_id IN (${IDS}) AND id<>'${PAYMENT}')
      THEN RAISE EXCEPTION 'H02 fixture identity changed; refusing cleanup'; END IF;
    END $$;
    SET LOCAL session_replication_role=replica;
    DELETE FROM invoice_payments WHERE id='${PAYMENT}' AND invoice_id='${PART}';
    DELETE FROM invoices WHERE id IN (${IDS}) AND project_id='${JOB}';
    SET LOCAL session_replication_role=origin;
    DELETE FROM projects WHERE id='${JOB}';
    COMMIT;`);
  expect(psqlScalar(`SELECT (SELECT count(*) FROM projects WHERE id='${JOB}') || '|' ||
    (SELECT count(*) FROM invoices WHERE id IN (${IDS})) || '|' ||
    (SELECT count(*) FROM invoice_payments WHERE id='${PAYMENT}');`)).toBe('0|0|0');
  console.log('[H02 cleanup] project|invoice|payment=0|0|0');
});

async function openBook(page: Page) {
  await expect(page.locator('[data-studio="round8"]')).toHaveAttribute('data-arrival-ready', '', { timeout: 60_000 });
  await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/);
  let opener = page.locator('[data-studio-door="accounts"]');
  if (await opener.isVisible()) await opener.click();
  else {
    opener = page.getByRole('button', { name: 'More studio actions', exact: true });
    await opener.click();
    await page.getByRole('button', { name: 'Ledgers', exact: true }).click();
    await page.locator('[data-mobile-ledger="accounts"]').click();
  }
  const book = page.getByRole('dialog', { name: 'Studio accounts', exact: true });
  await expect(book).toBeVisible();
  return { book, opener };
}

test('issued, received and due read native invoice/payment truth; drafts remain rows, not balances', async ({ authenticatedPage: page }, info) => {
  test.setTimeout(180_000);
  const { book, opener } = await openBook(page);
  expect(psqlScalar(`SELECT status || '|' || amount_paid_cents FROM invoices WHERE id='${PART}';`)).toBe('partially_paid|5000');
  expect(psqlScalar(`SELECT sum(total_cents) FILTER (WHERE status NOT IN ('draft','void')) || '|' ||
    sum(amount_paid_cents) FILTER (WHERE status<>'draft') || '|' ||
    sum(greatest(total_cents-amount_paid_cents,0)) FILTER (WHERE status IN ('sent','partially_paid'))
    FROM invoices WHERE studio_id='${STUDIO}';`)).toBe('24000|5000|19000');
  const front = book.locator('[data-accounts-front-matter]');
  await expect(front).toContainText('$240.00 issued; $50.00 received; $190.00 due.');
  await expect(book.locator(`[data-invoice-row="${DRAFT}"]`)).toContainText('Draft');
  await expect(book).not.toContainText('PRIVATE COST H02');
  await book.getByRole('button', { name: 'Receivables', exact: true }).click();
  await expect(book.getByText('$190.00 owed', { exact: true })).toBeVisible();
  await expect(book.getByRole('button', { name: 'Send reminder', exact: true })).toBeEnabled();
  await page.screenshot({ path: info.outputPath('accounts-native-receivables.png') });
  await page.keyboard.press('Escape');
  await expect(book).not.toBeVisible();
  await expect(opener).toBeFocused();
  console.log('[H02 readback] issued|received|due=24000|5000|19000; native payment=5000; no external send');
});

test('an invoice read failure refuses the book instead of printing zero; retry restores native balances', async ({ authenticatedPage: page }) => {
  test.setTimeout(180_000);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let refusing = true;
  const matcher = '**/rest/v1/invoices?*';
  await page.route(matcher, async route => {
    await held;
    if (refusing) await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'H02 forced native read refusal' }) });
    else await route.continue();
  });
  try {
    const { book } = await openBook(page);
    await expect(book.locator('[data-accounts-front-matter]')).toHaveCount(0);
    release();
    await expect(book.getByRole('alert')).toContainText('The studio book could not be opened', { timeout: 45_000 });
    await expect(book.locator('[data-accounts-front-matter]')).toHaveCount(0);
    refusing = false;
    await book.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(book.locator('[data-accounts-front-matter]')).toContainText('$240.00 issued; $50.00 received; $190.00 due.');
  } finally {
    release();
    await page.unroute(matcher);
  }
});
