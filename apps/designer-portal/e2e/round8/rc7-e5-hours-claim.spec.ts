import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth';
import { psqlRun, psqlScalar } from '../helpers/psql';

const STUDIO = 'f0180000-0000-4000-8000-000000000001';
const DESIGNER = 'f0180000-0000-4000-8000-000000000002';
const CLIENT = 'f0180000-0000-4000-8000-000000000003';
const JOB = 'e5000000-0000-4000-8000-000000000001';
const RATE = 'e5000000-0000-4000-8000-000000000002';
const RATE_OLD = 'e5000000-0000-4000-8000-000000000003';
const RATE_FUTURE = 'e5000000-0000-4000-8000-000000000004';
const ISSUED = 'e5000000-0000-4000-8000-000000000005';
const PAYMENT = 'e5000000-0000-4000-8000-000000000006';
const TITLE = 'E5 fictional claim job';

test.setTimeout(300_000);

async function hoursFor(page: Page) {
  await expect(page.locator('[data-studio="round8"]')).toHaveAttribute('data-arrival-ready', '', { timeout: 60_000 });
  await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/);
  await page.locator('[data-studio-masthead]').getByRole('button', { name: 'Hours', exact: true }).click();
  const hours = page.getByRole('dialog', { name: 'Timesheets', exact: true });
  await expect(hours).toBeVisible();
  return hours;
}

async function logHour(page: Page, minutes: number, billable: boolean) {
  const hours = await hoursFor(page);
  await hours.getByRole('combobox', { name: 'Project', exact: true }).selectOption(JOB);
  await hours.getByRole('spinbutton', { name: 'Minutes', exact: true }).fill(String(minutes));
  if (billable) await hours.getByRole('button', { name: 'Non-billable — press to make billable', exact: true }).click();
  await hours.getByRole('button', { name: 'Log time', exact: true }).click();
  await expect.poll(() => psqlScalar(`SELECT count(*) FROM project_time_entries WHERE project_id='${JOB}' AND duration_minutes=${minutes};`)).toBe('1');
  return hours;
}

async function bookTotals(page: Page) {
  await expect(page.locator('[data-studio="round8"]')).toHaveAttribute('data-arrival-ready', '', { timeout: 60_000 });
  await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/);
  const door = page.locator('[data-studio-door="accounts"]');
  if (await door.isVisible()) {
    await door.click();
  } else {
    await page.getByRole('button', { name: 'More studio actions', exact: true }).click();
    await page.getByRole('button', { name: 'Ledgers', exact: true }).click();
    await page.locator('[data-mobile-ledger="accounts"]').click();
  }
  const book = page.getByRole('dialog', { name: 'Studio accounts', exact: true });
  await expect(book.locator('[data-accounts-front-matter]')).toContainText('$200.00 issued; $50.00 received; $150.00 due.');
  await page.keyboard.press('Escape');
  await expect(book).not.toBeVisible();
}

test('A19: native hours, dated rate, unresolved rate, two-tab claim and void preserve balances', async ({ authenticatedPage: first }) => {
  test.setTimeout(300_000);
  expect(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').port).toBe('55121');
  expect(new URL(process.env.SUPABASE_DB_URL ?? '').hostname).toBe('127.0.0.1');
  expect(new URL(process.env.SUPABASE_DB_URL ?? '').port).toBe('55122');
  expect(psqlScalar(`SELECT count(*) FROM projects WHERE id='${JOB}';`)).toBe('0');
  expect(psqlScalar(`SELECT count(*) FROM studio_member_rates WHERE studio_id='${STUDIO}' AND user_id='${DESIGNER}';`)).toBe('0');
  expect(psqlScalar(`SELECT count(*) FROM invoices WHERE studio_id='${STUDIO}';`)).toBe('0');
  psqlRun(`BEGIN;
    INSERT INTO projects(id,name,status,created_by,designer_id,client_id,studio_id)
    VALUES('${JOB}','${TITLE}','active','${DESIGNER}','${DESIGNER}','${CLIENT}','${STUDIO}');
    INSERT INTO invoices(id,project_id,designer_id,client_id,studio_id,invoice_number,status,total_cents,subtotal_cents,due_date)
    VALUES('${ISSUED}','${JOB}','${DESIGNER}','${CLIENT}','${STUDIO}','E5-ISSUED','sent',20000,20000,CURRENT_DATE+10);
    INSERT INTO invoice_payments(id,invoice_id,amount_cents,method,status,received_at,recorded_by)
    VALUES('${PAYMENT}','${ISSUED}',5000,'check','succeeded',now(),'${DESIGNER}');
    COMMIT;`);
  try {
    await first.reload({ waitUntil: 'domcontentloaded' });
    expect(psqlScalar(`SELECT status || '|' || amount_paid_cents FROM invoices WHERE id='${ISSUED}';`)).toBe('partially_paid|5000');
    await bookTotals(first);
    await logHour(first, 17, true);
    expect(psqlScalar(`SELECT billable || '|' || rate_source || '|' || coalesce(hourly_rate_cents::text,'null') || '|' || (invoice_id IS NULL) FROM project_time_entries WHERE project_id='${JOB}' AND duration_minutes=17;`)).toBe('true|none|null|true');
    await first.keyboard.press('Escape');
    psqlRun(`INSERT INTO studio_member_rates(id,studio_id,user_id,hourly_rate_cents,effective_from,created_by)
      VALUES('${RATE_OLD}','${STUDIO}','${DESIGNER}',12000,CURRENT_DATE-90,'${DESIGNER}');
      INSERT INTO studio_member_rates(id,studio_id,user_id,hourly_rate_cents,effective_from,created_by)
      VALUES('${RATE}','${STUDIO}','${DESIGNER}',20000,CURRENT_DATE-30,'${DESIGNER}');
      INSERT INTO studio_member_rates(id,studio_id,user_id,hourly_rate_cents,effective_from,created_by)
      VALUES('${RATE_FUTURE}','${STUDIO}','${DESIGNER}',50000,CURRENT_DATE+2,'${DESIGNER}');`);
    expect(psqlScalar(`SELECT string_agg(hourly_rate_cents::text,',' ORDER BY effective_from) FROM studio_member_rates WHERE id IN ('${RATE_OLD}','${RATE}','${RATE_FUTURE}');`)).toBe('12000,20000,50000');
    await logHour(first, 30, true);
    expect(psqlScalar(`SELECT t.billable || '|' || t.rate_source || '|' || t.hourly_rate_cents || '|' || t.rated_amount_cents FROM project_time_entries t WHERE t.project_id='${JOB}' AND t.duration_minutes=30;`)).toBe('true|studio_member|20000|10000');
    await first.keyboard.press('Escape');
    await logHour(first, 47, false);
    expect(psqlScalar(`SELECT billable || '|' || (invoice_id IS NULL) FROM project_time_entries WHERE project_id='${JOB}' AND duration_minutes=47;`)).toBe('false|true');
    await first.keyboard.press('Escape');

    const second = await first.context().newPage();
    await second.goto('/desk', { waitUntil: 'domcontentloaded' });
    const a = await hoursFor(first);
    const b = await hoursFor(second);
    await a.getByRole('combobox', { name: 'Project', exact: true }).selectOption(JOB);
    await b.getByRole('combobox', { name: 'Project', exact: true }).selectOption(JOB);
    await a.getByRole('button', { name: 'Draft time invoice', exact: true }).click();
    await b.getByRole('button', { name: 'Draft time invoice', exact: true }).click();
    const composerA = first.getByRole('dialog', { name: 'Draw an invoice', exact: true });
    const composerB = second.getByRole('dialog', { name: 'Draw an invoice', exact: true });
    await expect(composerA.getByRole('button', { name: 'Draft the invoice', exact: true })).toBeEnabled();
    await expect(composerB.getByRole('button', { name: 'Draft the invoice', exact: true })).toBeEnabled();

    let arrived = 0;
    let release!: () => void;
    const both = new Promise<void>(resolve => { release = resolve; });
    await first.context().route('**/rest/v1/rpc/compose_project_invoice', async route => {
      arrived += 1;
      if (arrived === 2) release();
      await both;
      await route.continue();
    });
    try {
      await Promise.all([
        composerA.getByRole('button', { name: 'Draft the invoice', exact: true }).click(),
        composerB.getByRole('button', { name: 'Draft the invoice', exact: true }).click(),
      ]);
      await expect.poll(() => arrived).toBe(2);
      await expect.poll(() => psqlScalar(`SELECT count(*) FROM invoices WHERE project_id='${JOB}' AND status='draft';`)).toBe('1');
      const owner = psqlScalar(`SELECT invoice_id FROM project_time_entries WHERE project_id='${JOB}' AND duration_minutes=30;`);
      expect(owner).toMatch(/^[0-9a-f-]{36}$/);
      expect(psqlScalar(`SELECT count(*) FROM invoices WHERE id='${owner}' AND status='draft';`)).toBe('1');
      expect(psqlScalar(`SELECT count(*) FROM project_time_entries WHERE project_id='${JOB}' AND duration_minutes=47 AND invoice_id IS NULL;`)).toBe('1');
      expect(psqlScalar(`SELECT count(*) FROM project_time_entries WHERE project_id='${JOB}' AND rate_source='none' AND invoice_id IS NOT NULL;`)).toBe('0');
      const folioA = first.getByRole('dialog', { name: 'Invoice folio', exact: true });
      const folioB = second.getByRole('dialog', { name: 'Invoice folio', exact: true });
      await expect.poll(async () => await folioA.isVisible() || await folioB.isVisible()).toBe(true);
      const winner = await folioA.isVisible() ? first : second;
      const loser = winner === first ? second : first;
      await expect(loser.getByRole('dialog', { name: 'Draw an invoice', exact: true })).toContainText('Some of these hours were just billed on another invoice. Nothing was billed.');
      expect(psqlScalar(`SELECT count(*) FROM invoices WHERE project_id='${JOB}' AND status='draft';`)).toBe('1');
      await loser.reload({ waitUntil: 'domcontentloaded' });
      const recovered = await hoursFor(loser);
      await recovered.getByRole('combobox', { name: 'Project', exact: true }).selectOption(JOB);
      await expect(recovered.getByText('Billed', { exact: true })).toBeVisible();
      await loser.keyboard.press('Escape');
      await bookTotals(loser);
      const folio = winner.getByRole('dialog', { name: 'Invoice folio', exact: true });
      await expect(folio).toBeVisible();
      await folio.getByRole('button', { name: 'Void', exact: true }).click();
      await folio.getByRole('textbox', { name: 'Void reason' }).fill('E5 fictional concurrency void');
      await folio.getByRole('button', { name: 'Void invoice', exact: true }).click();
      await expect.poll(() => psqlScalar(`SELECT status FROM invoices WHERE id='${owner}';`)).toBe('void');
      expect(psqlScalar(`SELECT count(*) FROM project_time_entries WHERE project_id='${JOB}' AND invoice_id IS NULL AND duration_minutes=30;`)).toBe('1');
      expect(psqlScalar(`SELECT count(*) FROM invoices WHERE studio_id='${STUDIO}' AND project_id='${JOB}' AND status NOT IN ('draft','void');`)).toBe('1');
      console.log('[E5 A19]', { arrived, owner, claimed: 1, drafts: 1, voidReleased: 1, issued: 20000, received: 5000, due: 15000 });
    } finally {
      release();
      await first.context().unroute('**/rest/v1/rpc/compose_project_invoice');
      await second.close();
    }
  } finally {
    const invoiceIds = psqlScalar(`SELECT string_agg(quote_literal(id::text),',') FROM invoices WHERE project_id='${JOB}';`);
    psqlRun(`BEGIN; SET LOCAL session_replication_role=replica;
      DELETE FROM invoice_payments WHERE invoice_id IN (SELECT id FROM invoices WHERE project_id='${JOB}');
      DELETE FROM invoice_line_items WHERE invoice_id IN (SELECT id FROM invoices WHERE project_id='${JOB}');
      DELETE FROM project_time_entries WHERE project_id='${JOB}';
      DELETE FROM invoices WHERE project_id='${JOB}';
      DELETE FROM studio_member_rates WHERE id IN ('${RATE_OLD}','${RATE}','${RATE_FUTURE}') AND studio_id='${STUDIO}';
      SET LOCAL session_replication_role=origin;
      DELETE FROM projects WHERE id='${JOB}' AND name='${TITLE}' AND designer_id='${DESIGNER}'; COMMIT;`);
    expect(psqlScalar(`SELECT (SELECT count(*) FROM projects WHERE id='${JOB}') || '|' ||
      (SELECT count(*) FROM invoices WHERE project_id='${JOB}') || '|' ||
      (SELECT count(*) FROM invoice_payments WHERE invoice_id IN (${invoiceIds})) || '|' ||
      (SELECT count(*) FROM invoice_line_items WHERE invoice_id IN (${invoiceIds})) || '|' ||
      (SELECT count(*) FROM project_time_entries WHERE project_id='${JOB}') || '|' ||
      (SELECT count(*) FROM studio_member_rates WHERE id IN ('${RATE_OLD}','${RATE}','${RATE_FUTURE}'));`)).toBe('0|0|0|0|0|0');
  }
});
