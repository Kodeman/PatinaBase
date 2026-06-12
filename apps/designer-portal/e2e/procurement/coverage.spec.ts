/**
 * End-to-end spec: FF&E invoice coverage round-trip (W3-T5 — 00187).
 *
 *   seed one project + vendor + three approved trade/client-priced FF&E
 *   items, with a PAID invoice billing item 1 (direct service-role inserts:
 *   invoices row status 'paid' + kind 'ffe' line — the RPCs can't be driven
 *   by adminDb because the service role has no auth.uid()) → the Order
 *   Assistant coverage gate differentiates: "2 items not covered", item 1
 *   absent from the warning panel → the board's "Invoice Items" bulk action
 *   skips the covered item with the exact toast and routes only the
 *   uncovered ids → the coverage step's "Create client invoice →" deep-links
 *   the composer with exactly the uncovered ids; a request that DOES include
 *   the covered id surfaces the "1 already-invoiced item skipped" notice →
 *   creating the draft writes kind='ffe' invoice_line_items for the two
 *   items → get_ffe_invoice_coverage (called via adminDb.rpc — SECURITY
 *   INVOKER, and the service role bypasses RLS so all rows return) now
 *   reports them 'invoiced'.
 *
 * TEST ORDER NOTE: the bulk-action test runs BEFORE the composer round-trip
 * — once the draft exists, items 2–3 are 'invoiced' and the bulk action
 * would (correctly) skip all three, leaving nothing to route.
 *
 * One serial describe block; ids shared via module closure (same convention
 * as by-status-filters.spec.ts). All DB seeding/assertions go through the
 * service-role adminDb client.
 *
 * LOCAL RUN CONSTRAINT: serial is intra-file only; for deterministic local
 * runs use --project=chromium --workers=1 to prevent cross-file parallelism
 * from interleaving DB state with other suites.
 *
 * Requires:
 *   - Local Supabase running with seed data (designer@patina.dev)
 *   - Designer portal at :3000 started with
 *     NEXT_PUBLIC_FLAG_OVERRIDES=procurement-workspace-pilot:true (the
 *     playwright webServer config sets it, but a reused server must have
 *     been started with it — NEXT_PUBLIC_ vars are inlined at start)
 *   - SUPABASE_SERVICE_ROLE_KEY in apps/designer-portal/.env.local
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth';
import { adminDb, getUserIdByEmail } from '../helpers/supabase-admin';
import { hideDevOverlays } from '../helpers/hide-dev-overlays';

// Unique names for everything we seed (prefix E2E COV / E2E-COV-* for cleanup).
const PROJECT_NAME = 'E2E COV Project';
const VENDOR_NAME = 'E2E COV Vendor';
const ITEM_1 = 'E2E COV Sofa 1'; // covered by the seeded PAID invoice
const ITEM_2 = 'E2E COV Lamp 2'; // uncovered
const ITEM_3 = 'E2E COV Rug 3'; // uncovered
const PAID_INVOICE_NUMBER = 'E2E-COV-PAID-1';

const TRADE_CENTS = 40_000;
const CLIENT_CENTS = 50_000;

// Module-level shared state (safe because describe.serial is sequential).
let designerId: string;
let projectId: string;
let vendorId: string;
let item1Id: string;
let item2Id: string;
let item3Id: string;
let paidInvoiceId: string;
let draftInvoiceId: string | undefined;

// ─── Page helpers ───────────────────────────────────────────────────────────

/** Selects all three seeded items on the FF&E board via the card checkboxes. */
async function selectAllSeededItems(page: Page) {
  for (const name of [ITEM_1, ITEM_2, ITEM_3]) {
    await page.getByRole('checkbox', { name: `Select ${name}` }).check();
  }
  await expect(page.getByRole('region', { name: 'Bulk actions' })).toContainText('3 selected');
}

/** Opens the Order Assistant for the full selection and walks to coverage. */
async function openAssistantAtCoverage(page: Page) {
  await selectAllSeededItems(page);
  await page
    .getByRole('region', { name: 'Bulk actions' })
    .getByRole('button', { name: 'Create PO', exact: true })
    .click();
  const dialog = page.getByRole('dialog', {
    name: new RegExp(`Order Assistant for ${VENDOR_NAME}`),
  });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect(dialog.getByText('3 items · $1,200 total')).toBeVisible();
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(dialog.getByText('Client payment not confirmed')).toBeVisible({
    timeout: 15_000,
  });
  return dialog;
}

test.describe.serial('procurement coverage: gate differentiation + composer round-trip', () => {
  // Hide the dev-only TanStack devtools toggle (bottom-right) so it never
  // intercepts clicks on panel-footer buttons — see hide-dev-overlays.ts.
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await hideDevOverlays(page);
  });

  test.beforeAll(async () => {
    designerId = await getUserIdByEmail('designer@patina.dev');

    // ── Project ───────────────────────────────────────────────────────────
    const { data: proj, error: projErr } = await adminDb
      .from('projects')
      .insert({
        name: PROJECT_NAME,
        designer_id: designerId,
        created_by: designerId,
        status: 'active',
        notes: 'E2E COV seed — safe to delete.',
      })
      .select('id')
      .single();
    if (projErr) throw new Error(`seed project failed: ${projErr.message}`);
    projectId = proj.id as string;

    // ── Vendor (items need vendor_id for the Create PO path) ──────────────
    const { data: vendor, error: vendorErr } = await adminDb
      .from('vendors')
      .insert({ name: VENDOR_NAME, default_payment_terms: 'fifty_fifty' })
      .select('id')
      .single();
    if (vendorErr) throw new Error(`seed vendor failed: ${vendorErr.message}`);
    vendorId = vendor.id as string;

    // ── 3 approved, dual-priced items (no PO link → no 00184 ratchet) ─────
    const baseItem = {
      project_id: projectId,
      status: 'approved',
      quantity: 1,
      unit_price_cents: CLIENT_CENTS,
      line_total_cents: CLIENT_CENTS,
      trade_price_cents: TRADE_CENTS,
      vendor_id: vendorId,
      vendor_name: VENDOR_NAME,
      item_type: 'fixed',
    };
    const { data: seeded, error: itemsErr } = await adminDb
      .from('project_ffe_items')
      .insert([
        { ...baseItem, name: ITEM_1, sort_order: 0 },
        { ...baseItem, name: ITEM_2, sort_order: 1 },
        { ...baseItem, name: ITEM_3, sort_order: 2 },
      ])
      .select('id, name');
    if (itemsErr) throw new Error(`seed project_ffe_items failed: ${itemsErr.message}`);
    const byName = new Map((seeded ?? []).map((it) => [it.name as string, it.id as string]));
    item1Id = byName.get(ITEM_1)!;
    item2Id = byName.get(ITEM_2)!;
    item3Id = byName.get(ITEM_3)!;
    if (!item1Id || !item2Id || !item3Id) throw new Error('seeded item ids missing');

    // ── PAID invoice billing item 1 ───────────────────────────────────────
    // Direct inserts (not the issue/record RPCs — those need auth.uid(),
    // which the service role lacks). Constraint obligations for a direct
    // 'paid' row: invoice_number NOT NULL (chk_invoices_number_when_issued,
    // 00182 revision) and paid_at NOT NULL (chk_invoices_paid_at_when_paid).
    // Only updated_at triggers exist on invoices, so nothing blocks this.
    const today = new Date().toISOString().slice(0, 10);
    const { data: invoice, error: invErr } = await adminDb
      .from('invoices')
      .insert({
        project_id: projectId,
        designer_id: designerId,
        invoice_number: PAID_INVOICE_NUMBER,
        status: 'paid',
        issue_date: today,
        due_date: today,
        paid_at: new Date().toISOString(),
        subtotal_cents: CLIENT_CENTS,
        tax_rate: 0,
        tax_cents: 0,
        total_cents: CLIENT_CENTS,
        amount_paid_cents: CLIENT_CENTS,
      })
      .select('id')
      .single();
    if (invErr) throw new Error(`seed paid invoice failed: ${invErr.message}`);
    paidInvoiceId = invoice.id as string;

    const { error: lineErr } = await adminDb.from('invoice_line_items').insert({
      invoice_id: paidInvoiceId,
      kind: 'ffe',
      ffe_item_id: item1Id,
      description: ITEM_1,
      quantity: 1,
      unit_amount_cents: CLIENT_CENTS,
      amount_cents: CLIENT_CENTS,
      sort_order: 0,
    });
    if (lineErr) throw new Error(`seed ffe invoice line failed: ${lineErr.message}`);
  });

  test.afterAll(async () => {
    // FK order: invoice_line_items must go before project_ffe_items — a live
    // kind='ffe' line makes the item delete fail (ON DELETE SET NULL would
    // violate chk_line_items_ffe_kind, a deliberate 00187 guard). Sweep ALL
    // invoices on the project (the seeded paid one + the test-created draft
    // + any partial-failure strays), then items → project → vendor. No
    // invoice_payments are ever created (the paid invoice is seeded directly).
    if (projectId) {
      const { data: invs } = await adminDb
        .from('invoices')
        .select('id')
        .eq('project_id', projectId);
      const invoiceIds = (invs ?? []).map((i) => i.id as string);
      if (invoiceIds.length > 0) {
        await adminDb.from('invoice_payments').delete().in('invoice_id', invoiceIds);
        await adminDb.from('invoice_line_items').delete().in('invoice_id', invoiceIds);
        await adminDb.from('invoices').delete().in('id', invoiceIds);
      }
      await adminDb.from('project_ffe_items').delete().eq('project_id', projectId);
      await adminDb.from('projects').delete().eq('id', projectId);
    }
    if (vendorId) {
      await adminDb.from('vendors').delete().eq('id', vendorId);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 1: the coverage gate differentiates paid vs uncovered items
  // ──────────────────────────────────────────────────────────────────────────
  test('coverage gate counts only uncovered items and omits the paid one', async ({
    authenticatedPage: page,
  }) => {
    // Precondition straight from the RPC the gate reads (00187).
    const { data: coverage, error } = await adminDb.rpc('get_ffe_invoice_coverage', {
      p_project_id: projectId,
    });
    if (error) throw error;
    const verdict = new Map(
      (coverage as Array<{ ffe_item_id: string; coverage: string }>).map((r) => [
        r.ffe_item_id,
        r.coverage,
      ]),
    );
    expect(verdict.get(item1Id)).toBe('paid');
    expect(verdict.get(item2Id)).toBe('uninvoiced');
    expect(verdict.get(item3Id)).toBe('uninvoiced');

    await page.goto(`/portal/projects/${projectId}/ffe`, { waitUntil: 'networkidle' });
    await expect(page.getByText(ITEM_1)).toBeVisible({ timeout: 20_000 });

    const dialog = await openAssistantAtCoverage(page);

    // 2 (not 3) uncovered; the paid item is NOT listed in the warning panel
    // (covered items get no chip and no row) while the uncovered two are,
    // each with the "Not invoiced" chip.
    await expect(
      dialog.getByText('2 items not covered by a paid client invoice'),
    ).toBeVisible();
    await expect(dialog.getByText(ITEM_1)).toHaveCount(0);
    await expect(dialog.getByText(ITEM_2)).toBeVisible();
    await expect(dialog.getByText(ITEM_3)).toBeVisible();
    await expect(dialog.getByText('Not invoiced')).toHaveCount(2);

    // Abandon the order session — this test only inspects the gate.
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('dialog', { name: /Order Assistant/ })).toHaveCount(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 2: board "Invoice Items" bulk action skips the covered item
  // ──────────────────────────────────────────────────────────────────────────
  test('Invoice Items bulk action skips the covered item and routes the rest', async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/portal/projects/${projectId}/ffe`, { waitUntil: 'networkidle' });
    await expect(page.getByText(ITEM_1)).toBeVisible({ timeout: 20_000 });

    await selectAllSeededItems(page);
    await page
      .getByRole('region', { name: 'Bulk actions' })
      .getByRole('button', { name: 'Invoice Items', exact: true })
      .click();

    // Exact skip-toast copy from ffe/page.tsx handleInvoiceItems.
    await expect(page.getByText('1 already invoiced item skipped.')).toBeVisible({
      timeout: 10_000,
    });

    // Routed to the composer with ONLY the uncovered ids.
    await page.waitForURL(/\/portal\/billing\/invoices\/new\?/, { timeout: 20_000 });
    const routedIds = (new URL(page.url()).searchParams.get('ffeItemIds') ?? '')
      .split(',')
      .filter(Boolean);
    expect(routedIds.sort()).toEqual([item2Id, item3Id].sort());
    expect(new URL(page.url()).searchParams.get('projectId')).toBe(projectId);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 3: coverage-step deep link + composer skip notice + draft round-trip
  // ──────────────────────────────────────────────────────────────────────────
  test('coverage step routes to the composer; the draft covers the two items', async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/portal/projects/${projectId}/ffe`, { waitUntil: 'networkidle' });
    await expect(page.getByText(ITEM_1)).toBeVisible({ timeout: 20_000 });

    // The gate's CTA carries only the UNCOVERED ids (covered items are never
    // re-requested), so this path shows two prefilled rows and NO skip notice.
    const dialog = await openAssistantAtCoverage(page);
    await dialog.getByRole('link', { name: /Create client invoice/ }).click();
    await page.waitForURL(/\/portal\/billing\/invoices\/new\?/, { timeout: 20_000 });
    const linkedIds = (new URL(page.url()).searchParams.get('ffeItemIds') ?? '')
      .split(',')
      .filter(Boolean);
    expect(linkedIds.sort()).toEqual([item2Id, item3Id].sort());

    await expect(page.getByText('FF&E Items')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(ITEM_2)).toBeVisible();
    await expect(page.getByText(ITEM_3)).toBeVisible();
    await expect(page.getByText(ITEM_1)).toHaveCount(0);
    await expect(page.getByText(/already-invoiced item/)).toHaveCount(0);

    // A request that DOES include the covered id (e.g. a stale link) gets
    // the composer-side partition: exact skip notice, still two billable rows.
    await page.goto(
      `/portal/billing/invoices/new?projectId=${projectId}&ffeItemIds=${item1Id},${item2Id},${item3Id}`,
      { waitUntil: 'networkidle' },
    );
    await expect(page.getByText('1 already-invoiced item skipped.')).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(ITEM_2)).toBeVisible();
    await expect(page.getByText(ITEM_3)).toBeVisible();
    // Only the two billable FF&E rows render checkboxes (no milestones or
    // unbilled time exist on this project).
    await expect(page.getByRole('checkbox')).toHaveCount(2);

    // Create the draft → redirected to the invoice detail page.
    await page.getByRole('button', { name: 'Create draft', exact: true }).click();
    await page.waitForURL(/\/portal\/billing\/invoices\/(?!new)[0-9a-f-]{36}/i, {
      timeout: 20_000,
    });
    draftInvoiceId = page.url().match(/invoices\/([0-9a-f-]{36})/i)![1];

    // DB: the draft carries exactly two kind='ffe' lines, one per uncovered
    // item, at the client unit price (00187 wire — ffe_item_id set).
    const { data: lines, error: linesErr } = await adminDb
      .from('invoice_line_items')
      .select('kind, ffe_item_id, quantity, unit_amount_cents, amount_cents')
      .eq('invoice_id', draftInvoiceId);
    if (linesErr) throw linesErr;
    expect(lines).toHaveLength(2);
    for (const line of lines!) {
      expect(line.kind).toBe('ffe');
      expect(Number(line.quantity)).toBe(1);
      expect(line.unit_amount_cents).toBe(CLIENT_CENTS);
      expect(line.amount_cents).toBe(CLIENT_CENTS);
    }
    expect(lines!.map((l) => l.ffe_item_id).sort()).toEqual([item2Id, item3Id].sort());

    const { data: draft, error: draftErr } = await adminDb
      .from('invoices')
      .select('status, project_id')
      .eq('id', draftInvoiceId)
      .single();
    if (draftErr) throw draftErr;
    expect(draft.status).toBe('draft');
    expect(draft.project_id).toBe(projectId);

    // Coverage round-trip: the RPC now reports the two items 'invoiced'
    // (draft invoice) while item 1 stays 'paid'. SECURITY INVOKER + the
    // service role bypassing RLS means adminDb.rpc returns all rows.
    const { data: coverage, error: covErr } = await adminDb.rpc('get_ffe_invoice_coverage', {
      p_project_id: projectId,
    });
    if (covErr) throw covErr;
    const rows = coverage as Array<{
      ffe_item_id: string;
      coverage: string;
      invoice_status: string | null;
      invoice_id: string | null;
    }>;
    expect(rows).toHaveLength(3);
    const byItem = new Map(rows.map((r) => [r.ffe_item_id, r]));
    expect(byItem.get(item1Id)).toMatchObject({ coverage: 'paid', invoice_id: paidInvoiceId });
    expect(byItem.get(item2Id)).toMatchObject({
      coverage: 'invoiced',
      invoice_status: 'draft',
      invoice_id: draftInvoiceId,
    });
    expect(byItem.get(item3Id)).toMatchObject({
      coverage: 'invoiced',
      invoice_status: 'draft',
      invoice_id: draftInvoiceId,
    });
  });
});
