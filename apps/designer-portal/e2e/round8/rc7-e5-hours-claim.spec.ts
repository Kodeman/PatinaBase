import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth';
import { psqlRun, psqlScalar } from '../helpers/psql';

const STUDIO = 'f0180000-0000-4000-8000-000000000001';
const DESIGNER = 'f0180000-0000-4000-8000-000000000002';
const CLIENT = 'f0180000-0000-4000-8000-000000000003';
const JOB = 'e5000000-0000-4000-8000-000000000001';
const RATE = 'e5000000-0000-4000-8000-000000000002';
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

test('A19: native hours, dated rate, unresolved rate, two-tab claim and void preserve balances', async ({ authenticatedPage: first }) => {
  test.setTimeout(300_000);
  expect(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').port).toBe('55121');
  expect(psqlScalar(`SELECT count(*) FROM projects WHERE id='${JOB}';`)).toBe('0');
  expect(psqlScalar(`SELECT count(*) FROM studio_member_rates WHERE studio_id='${STUDIO}' AND user_id='${DESIGNER}';`)).toBe('0');
  psqlRun(`INSERT INTO projects(id,name,status,created_by,designer_id,client_id,studio_id)
    VALUES('${JOB}','${TITLE}','active','${DESIGNER}','${DESIGNER}','${CLIENT}','${STUDIO}');`);
  try {
    await first.reload({ waitUntil: 'domcontentloaded' });
    await logHour(first, 17, true);
    expect(psqlScalar(`SELECT billable || '|' || rate_source || '|' || coalesce(hourly_rate_cents::text,'null') || '|' || (invoice_id IS NULL) FROM project_time_entries WHERE project_id='${JOB}' AND duration_minutes=17;`)).toBe('true|none|null|true');
    await first.keyboard.press('Escape');
    psqlRun(`INSERT INTO studio_member_rates(id,studio_id,user_id,hourly_rate_cents,effective_from,created_by)
      VALUES('${RATE}','${STUDIO}','${DESIGNER}',20000,CURRENT_DATE-30,'${DESIGNER}');`);
    await logHour(first, 30, true);
    expect(psqlScalar(`SELECT t.billable || '|' || t.rate_source || '|' || t.hourly_rate_cents || '|' || t.rated_amount_cents || '|' || r.effective_from FROM project_time_entries t CROSS JOIN studio_member_rates r WHERE t.project_id='${JOB}' AND t.duration_minutes=30 AND r.id='${RATE}';`)).toMatch(/^true\|studio_member\|20000\|10000\|\d{4}-\d{2}-\d{2}$/);
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
      expect(psqlScalar(`SELECT coalesce(sum(total_cents) FILTER (WHERE status NOT IN ('draft','void')),0) || '|' ||
        coalesce(sum(amount_paid_cents) FILTER (WHERE status<>'draft'),0) || '|' ||
        coalesce(sum(greatest(total_cents-amount_paid_cents,0)) FILTER (WHERE status IN ('sent','partially_paid')),0)
        FROM invoices WHERE project_id='${JOB}';`)).toBe('0|0|0');
      const winner = await first.getByRole('dialog', { name: 'Invoice folio', exact: true }).isVisible() ? first : second;
      const loser = winner === first ? second : first;
      await expect(loser.getByRole('dialog', { name: 'Draw an invoice', exact: true })).toContainText('Nothing was billed.');
      await loser.reload({ waitUntil: 'domcontentloaded' });
      const recovered = await hoursFor(loser);
      await recovered.getByRole('combobox', { name: 'Project', exact: true }).selectOption(JOB);
      await expect(recovered.getByText('Billed', { exact: true })).toBeVisible();
      const folio = winner.getByRole('dialog', { name: 'Invoice folio', exact: true });
      await expect(folio).toBeVisible();
      await folio.getByRole('button', { name: 'Void', exact: true }).click();
      await folio.getByRole('textbox', { name: 'Void reason' }).fill('E5 fictional concurrency void');
      await folio.getByRole('button', { name: 'Void invoice', exact: true }).click();
      await expect.poll(() => psqlScalar(`SELECT status FROM invoices WHERE id='${owner}';`)).toBe('void');
      expect(psqlScalar(`SELECT count(*) FROM project_time_entries WHERE project_id='${JOB}' AND invoice_id IS NULL AND duration_minutes=30;`)).toBe('1');
      expect(psqlScalar(`SELECT count(*) FROM invoices WHERE studio_id='${STUDIO}' AND project_id='${JOB}' AND status NOT IN ('draft','void');`)).toBe('0');
      console.log('[E5 A19]', { arrived, owner, claimed: 1, invoices: 1, voidReleased: 1, issued: 0, received: 0, due: 0 });
    } finally {
      release();
      await first.context().unroute('**/rest/v1/rpc/compose_project_invoice');
      await second.close();
    }
  } finally {
    psqlRun(`BEGIN; SET LOCAL session_replication_role=replica;
      DELETE FROM invoice_line_items WHERE invoice_id IN (SELECT id FROM invoices WHERE project_id='${JOB}');
      DELETE FROM project_time_entries WHERE project_id='${JOB}';
      DELETE FROM invoices WHERE project_id='${JOB}';
      DELETE FROM studio_member_rates WHERE id='${RATE}' AND studio_id='${STUDIO}';
      SET LOCAL session_replication_role=origin;
      DELETE FROM projects WHERE id='${JOB}' AND name='${TITLE}' AND designer_id='${DESIGNER}'; COMMIT;`);
    expect(psqlScalar(`SELECT (SELECT count(*) FROM projects WHERE id='${JOB}') + (SELECT count(*) FROM invoices WHERE project_id='${JOB}');`)).toBe('0');
  }
});
