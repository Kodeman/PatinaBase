/**
 * End-to-end spec: time tracking → billing pull-through (00177 + 00178)
 *
 *   seed project with a $200/h change-order rate → /portal/projects/[id]/time
 *   → Log time dialog (2h) → entry + unbilled rollups in UI/DB → second entry
 *   seeded via admin → /portal/time studio report shows the project rollup →
 *   invoice composer ?projectId= lists the unbilled entries → Select all →
 *   ONE kind='time' line (qty 1, unit = amount = summed view amounts,
 *   metadata carries entry ids + minutes) → entries claimed (invoice_id
 *   stamped) → Void draft → entries released back to the unbilled pool.
 *
 * One serial describe block; ids shared via module closure (same convention
 * as billing/invoices.spec.ts). All DB seeding/assertions go through the
 * service-role adminDb client.
 *
 * Requires:
 *   - Local Supabase running with seed data (designer@patina.dev, client@patina.dev)
 *   - Designer portal at :3000
 *   - SUPABASE_SERVICE_ROLE_KEY in apps/designer-portal/.env.local
 */

import { test, expect } from '../fixtures/auth';
import { adminDb, getUserIdByEmail } from '../helpers/supabase-admin';

// Rates / money (CENTS). The project-level change-order rate ($200/h) is what
// the project_unbilled_time view resolves for entries with no snapshot —
// project-scoped, so it can't bleed into other specs the way a profile
// default rate would.
const HOURLY_RATE_CENTS = 20_000;
const UI_ENTRY_MINUTES = 120; // "2h" typed into the Log Time dialog
const SEEDED_ENTRY_MINUTES = 90;
const UI_ENTRY_AMOUNT_CENTS = 40_000; // 2h × $200
const TOTAL_MINUTES = UI_ENTRY_MINUTES + SEEDED_ENTRY_MINUTES; // 210 → "3h 30m"
const TOTAL_AMOUNT_CENTS = 70_000; // 3.5h × $200

const UI_ENTRY_NOTES = 'QA Sourcing fabrics (e2e)';
const SEEDED_ENTRY_NOTES = 'QA Site visit (e2e)';
const PROJECT_NAME = 'QA Time Tracking Project (e2e)';

// Module-level shared state (safe because describe.serial is sequential).
let designerId: string;
let projectId: string;
let uiEntryId: string;
let seededEntryId: string;
let invoiceId: string;

async function getProjectEntries() {
  const { data, error } = await adminDb
    .from('project_time_entries')
    .select('id, duration_minutes, billable, invoice_id, hourly_rate_cents, notes')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function getInvoice(id: string) {
  const { data, error } = await adminDb.from('invoices').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

test.describe.serial('time tracking: log → studio report → bill → void release', () => {
  test.beforeAll(async () => {
    designerId = await getUserIdByEmail('designer@patina.dev');
    const clientId = await getUserIdByEmail('client@patina.dev');

    const { data: project, error: projErr } = await adminDb
      .from('projects')
      .insert({
        name: PROJECT_NAME,
        created_by: designerId,
        designer_id: designerId,
        client_id: clientId,
        status: 'active',
        current_phase: 'concept',
        budget_cents: 0,
        design_fee_cents: 500_000,
        total_amount_cents: 500_000,
        start_date: '2026-06-01',
        // The unbilled view resolves: entry snapshot → this rate → profile
        // default → 0. No snapshot on our entries, so this is the rate.
        change_order_terms: { hourly_rate_cents: HOURLY_RATE_CENTS },
      })
      .select('id')
      .single();
    if (projErr) throw new Error(`seed project failed: ${projErr.message}`);
    projectId = project.id as string;
  });

  test.afterAll(async () => {
    if (!projectId) return;
    // The 00177 guard trigger forbids deleting invoiced entries, and a project
    // CASCADE can reach an entry before its invoice — detach explicitly, then
    // delete entries, then the project (invoices CASCADE off it). Earnings
    // rows would survive invoice deletion (FK SET NULL) — none exist here
    // (nothing was paid), but the delete is harmless insurance.
    await adminDb
      .from('project_time_entries')
      .update({ invoice_id: null })
      .eq('project_id', projectId);
    await adminDb.from('project_time_entries').delete().eq('project_id', projectId);
    await adminDb.from('designer_earnings').delete().eq('project_id', projectId);
    await adminDb.from('projects').delete().eq('id', projectId);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 1: Log time from the project time page
  // ────────────────────────────────────────────────────────────────────────
  test('Log Time dialog records an entry and the unbilled rollups price it', async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/portal/projects/${projectId}/time`, { waitUntil: 'networkidle' });

    await expect(page.getByRole('button', { name: /log time/i }).first()).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole('button', { name: /log time/i }).first().click();

    // LogTimeDialog: duration parser accepts "2h"; date defaults to today.
    const dialog = page
      .locator('div.fixed', { has: page.getByRole('heading', { name: /log time/i }) })
      .first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.getByPlaceholder(/1:30, 1\.5h, or 90m/i).fill('2h');
    await dialog.getByPlaceholder(/what did you work on\?/i).fill(UI_ENTRY_NOTES);
    await dialog.getByRole('button', { name: /log time/i }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    // DB: one completed billable entry, un-invoiced, no rate snapshot (manual
    // entries inherit the project rate at read time via the view).
    await expect
      .poll(async () => (await getProjectEntries()).length, {
        message: 'time entry row should land',
        timeout: 15_000,
      })
      .toBe(1);
    const [entry] = await getProjectEntries();
    expect(entry.duration_minutes).toBe(UI_ENTRY_MINUTES);
    expect(entry.billable).toBe(true);
    expect(entry.invoice_id).toBeNull();
    uiEntryId = entry.id as string;

    // UI: ledger row + unbilled value metric ($400 = 2h × $200).
    await expect(page.getByText(UI_ENTRY_NOTES).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Unbilled', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('$400.00').first()).toBeVisible({ timeout: 15_000 });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 2: Studio report rolls the project up
  // ────────────────────────────────────────────────────────────────────────
  test('the studio time report shows the project rollup with unbilled value', async ({
    authenticatedPage: page,
  }) => {
    // Second entry seeded directly (this week, so the default "This Week"
    // period catches it) — the bill step pulls both.
    const startedAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: seeded, error } = await adminDb
      .from('project_time_entries')
      .insert({
        project_id: projectId,
        user_id: designerId,
        started_at: startedAt,
        duration_minutes: SEEDED_ENTRY_MINUTES,
        notes: SEEDED_ENTRY_NOTES,
        billable: true,
      })
      .select('id')
      .single();
    if (error) throw new Error(`seed time entry failed: ${error.message}`);
    seededEntryId = seeded.id as string;

    await page.goto('/portal/time', { waitUntil: 'networkidle' });

    // Project row links to the project's time ledger and prices the unbilled
    // balance ($700 = 3.5h × $200).
    const projectRow = page
      .getByTestId('studio-time-project-row')
      .filter({ hasText: PROJECT_NAME });
    await expect(projectRow).toBeVisible({ timeout: 20_000 });
    await expect(projectRow.getByText('$700.00')).toBeVisible();
    await expect(projectRow.getByRole('link', { name: /bill time/i })).toBeVisible();

    // Cross-link companion: Earnings.
    await expect(page.getByRole('link', { name: /earnings/i }).first()).toBeVisible();
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 3: Composer pulls unbilled time into ONE kind='time' line + claims
  // ────────────────────────────────────────────────────────────────────────
  test('billing unbilled time creates one time line and claims the entries', async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/portal/billing/invoices/new?projectId=${projectId}`, {
      waitUntil: 'networkidle',
    });

    await expect(page.getByText('Unbilled Time').first()).toBeVisible({ timeout: 20_000 });

    // Both unbilled entries listed; Select all checks them.
    await expect(page.getByText(UI_ENTRY_NOTES)).toBeVisible();
    await expect(page.getByText(SEEDED_ENTRY_NOTES)).toBeVisible();
    await page.getByRole('button', { name: /select all/i }).click();

    // Single rolled-up line advertised before create: 3h 30m → $700.
    await expect(page.getByText(/billing 3h 30m as one line/i)).toBeVisible();
    await expect(page.getByText('$700.00').first()).toBeVisible();

    await page.getByRole('button', { name: /create draft/i }).click();
    await page.waitForURL(/\/portal\/billing\/invoices\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    invoiceId = page.url().match(/\/portal\/billing\/invoices\/([0-9a-f-]{36})$/)![1];

    // DB: exactly one line — kind='time', qty 1, unit = amount = summed view
    // amounts (no weighted-rate re-rounding), provenance in metadata.
    const { data: lines, error } = await adminDb
      .from('invoice_line_items')
      .select('kind, quantity, unit_amount_cents, amount_cents, description, metadata')
      .eq('invoice_id', invoiceId);
    if (error) throw error;
    expect(lines).toHaveLength(1);
    const line = lines![0];
    expect(line.kind).toBe('time');
    expect(Number(line.quantity)).toBe(1);
    expect(line.unit_amount_cents).toBe(TOTAL_AMOUNT_CENTS);
    expect(line.amount_cents).toBe(TOTAL_AMOUNT_CENTS);
    expect(line.description).toMatch(/Design services — 3h 30m \(2 entries\)/);
    expect(line.metadata.total_minutes).toBe(TOTAL_MINUTES);
    expect([...(line.metadata.time_entry_ids as string[])].sort()).toEqual(
      [uiEntryId, seededEntryId].sort(),
    );

    // Entries claimed: invoice_id stamped on both (the 00177 trigger now
    // locks their priced columns).
    await expect
      .poll(
        async () =>
          (await getProjectEntries()).filter((e) => e.invoice_id === invoiceId).length,
        { message: 'both entries should be claimed by the draft', timeout: 15_000 },
      )
      .toBe(2);

    // Detail page annotates the time line with the logged hours.
    await expect(page.getByText(/logged time · 3h 30m/i)).toBeVisible({ timeout: 15_000 });

    // Draft totals match the line (0% tax).
    const invoice = await getInvoice(invoiceId);
    expect(invoice.status).toBe('draft');
    expect(invoice.subtotal_cents).toBe(TOTAL_AMOUNT_CENTS);
    expect(invoice.total_cents).toBe(TOTAL_AMOUNT_CENTS);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 4: Void releases the claimed entries back to the unbilled pool
  // ────────────────────────────────────────────────────────────────────────
  test('voiding the draft releases the time entries', async ({ authenticatedPage: page }) => {
    await page.goto(`/portal/billing/invoices/${invoiceId}`, { waitUntil: 'networkidle' });

    await page.getByRole('button', { name: /^void$/i }).click();
    const voidDialog = page
      .locator('div.fixed', { has: page.getByRole('heading', { name: /^void/i }) })
      .first();
    await expect(voidDialog).toBeVisible({ timeout: 10_000 });
    await voidDialog.getByPlaceholder(/reason \(required\)/i).fill('QA release check (e2e)');
    await voidDialog.getByRole('button', { name: /void invoice/i }).click();

    // void_invoice RPC: invoice void + every attached entry released.
    await expect
      .poll(async () => (await getInvoice(invoiceId)).status, {
        message: 'invoice should be void',
        timeout: 15_000,
      })
      .toBe('void');
    const entries = await getProjectEntries();
    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      expect(entry.invoice_id, 'entry released back to unbilled').toBeNull();
    }

    // And the composer would offer them again: the unbilled view re-resolves
    // both rows at the project rate.
    const { data: unbilled, error } = await adminDb
      .from('project_unbilled_time')
      .select('id, amount_cents')
      .eq('project_id', projectId);
    if (error) throw error;
    expect(unbilled).toHaveLength(2);
    expect(unbilled!.reduce((sum, row) => sum + row.amount_cents, 0)).toBe(TOTAL_AMOUNT_CENTS);
  });
});
