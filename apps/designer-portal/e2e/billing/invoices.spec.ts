/**
 * End-to-end spec: invoice lifecycle (00178 money core)
 *
 *   seed project + payment milestone → composer preselect via
 *   ?projectId=&milestoneId= → add ad-hoc line → create draft → detail →
 *   Issue & Send (edge-fn email intercepted; issue_invoice RPC effects
 *   asserted in DB) → record full manual payment (check) → Paid in UI +
 *   milestone paid + designer_earnings row in DB → Void guard (no Void
 *   action on a paid invoice).
 *
 * One serial describe block; ids shared via module closure (same convention
 * as proposal-build.spec.ts). All DB seeding/assertions go through the
 * service-role adminDb client.
 *
 * Requires:
 *   - Local Supabase running with seed data (designer@patina.dev, client@patina.dev)
 *   - Designer portal at :3000
 *   - SUPABASE_SERVICE_ROLE_KEY in apps/designer-portal/.env.local
 */

import { test, expect } from '../fixtures/auth';
import { adminDb, getUserIdByEmail } from '../helpers/supabase-admin';

// Money (CENTS).
const MILESTONE_AMOUNT_CENTS = 250_000; // $2,500 design-fee deposit
const ADHOC_UNIT_DOLLARS = '150'; // $150 consultation line
const ADHOC_AMOUNT_CENTS = 15_000;
const TOTAL_CENTS = MILESTONE_AMOUNT_CENTS + ADHOC_AMOUNT_CENTS; // tax rate 0

const MILESTONE_LABEL = 'QA Design fee deposit (e2e)';
const ADHOC_DESCRIPTION = 'QA Design consultation (e2e)';

// Module-level shared state (safe because describe.serial is sequential).
let designerId: string;
let projectId: string;
let milestoneId: string;
let invoiceId: string;

async function getInvoice(id: string) {
  const { data, error } = await adminDb.from('invoices').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

async function getMilestone(id: string) {
  const { data, error } = await adminDb
    .from('project_payment_milestones')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

test.describe.serial('invoice lifecycle: draft → issue → paid → void guard', () => {
  test.beforeAll(async () => {
    designerId = await getUserIdByEmail('designer@patina.dev');
    const clientId = await getUserIdByEmail('client@patina.dev');

    // Active project owned by the signed-in designer (the composer's project
    // dropdown only lists status active/planning).
    const { data: project, error: projErr } = await adminDb
      .from('projects')
      .insert({
        name: 'QA Invoicing Project (e2e)',
        created_by: designerId,
        designer_id: designerId,
        client_id: clientId,
        status: 'active',
        current_phase: 'concept',
        budget_cents: 0,
        design_fee_cents: 500_000,
        total_amount_cents: 500_000,
        start_date: '2026-06-01',
      })
      .select('id')
      .single();
    if (projErr) throw new Error(`seed project failed: ${projErr.message}`);
    projectId = project.id as string;

    // One unbilled milestone (status pending → composer treats it as billable).
    const { data: milestone, error: msErr } = await adminDb
      .from('project_payment_milestones')
      .insert({
        project_id: projectId,
        label: MILESTONE_LABEL,
        percentage: 50,
        amount_cents: MILESTONE_AMOUNT_CENTS,
        status: 'pending',
        sort_order: 0,
      })
      .select('id')
      .single();
    if (msErr) throw new Error(`seed milestone failed: ${msErr.message}`);
    milestoneId = milestone.id as string;
  });

  test.afterAll(async () => {
    // Earnings rows survive invoice deletion (FK SET NULL) — remove them
    // explicitly, then drop the project: invoices, line items, payments, and
    // milestones all CASCADE off it. invoice_counters is per-designer and
    // intentionally left alone (numbers are never reused).
    if (projectId) {
      await adminDb.from('designer_earnings').delete().eq('project_id', projectId);
      await adminDb.from('projects').delete().eq('id', projectId);
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 1: Composer — milestone preselect + ad-hoc line → create draft
  // ────────────────────────────────────────────────────────────────────────
  test('composer preselects the milestone and creates a draft', async ({
    authenticatedPage: page,
  }) => {
    await page.goto(
      `/portal/billing/invoices/new?projectId=${projectId}&milestoneId=${milestoneId}`,
      { waitUntil: 'networkidle' },
    );

    await expect(page.getByText('New Invoice').first()).toBeVisible({ timeout: 20_000 });

    // ?projectId= lands in the project <select>.
    const projectSelect = page.locator('select').first();
    await expect(projectSelect).toHaveValue(projectId, { timeout: 15_000 });

    // ?milestoneId= pre-checks the milestone row.
    const milestoneRow = page.locator('label', { hasText: MILESTONE_LABEL });
    await expect(milestoneRow).toBeVisible({ timeout: 15_000 });
    await expect(milestoneRow.locator('input[type="checkbox"]')).toBeChecked();

    // Ad-hoc line (the composer renders one empty row by default).
    await page.getByPlaceholder(/description \(e\.g\. design consultation\)/i).fill(ADHOC_DESCRIPTION);
    await page.getByPlaceholder(/^qty$/i).fill('1');
    await page.getByPlaceholder(/unit price/i).fill(ADHOC_UNIT_DOLLARS);

    // Client-side total = milestone + ad-hoc at 0% tax.
    await expect(page.getByText('$2,650.00').first()).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /create draft/i }).click();

    // Composer pushes to the new draft's detail page.
    await page.waitForURL(/\/portal\/billing\/invoices\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    const match = page.url().match(/\/portal\/billing\/invoices\/([0-9a-f-]{36})$/);
    expect(match, 'detail URL should contain the invoice UUID').not.toBeNull();
    invoiceId = match![1];

    // DB: draft header + both lines, advisory totals stamped.
    const invoice = await getInvoice(invoiceId);
    expect(invoice.status).toBe('draft');
    expect(invoice.project_id).toBe(projectId);
    expect(invoice.invoice_number, 'drafts are unnumbered').toBeNull();
    expect(invoice.subtotal_cents).toBe(TOTAL_CENTS);
    expect(invoice.total_cents).toBe(TOTAL_CENTS);

    const { data: lines, error } = await adminDb
      .from('invoice_line_items')
      .select('kind, milestone_id, description, amount_cents')
      .eq('invoice_id', invoiceId);
    if (error) throw error;
    expect(lines).toHaveLength(2);
    const milestoneLine = lines!.find((l) => l.kind === 'milestone');
    const adhocLine = lines!.find((l) => l.kind === 'adhoc');
    expect(milestoneLine?.milestone_id).toBe(milestoneId);
    expect(milestoneLine?.amount_cents).toBe(MILESTONE_AMOUNT_CENTS);
    expect(adhocLine?.description).toBe(ADHOC_DESCRIPTION);
    expect(adhocLine?.amount_cents).toBe(ADHOC_AMOUNT_CENTS);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 2: Issue & Send — issue_invoice RPC effects, email intercepted
  // ────────────────────────────────────────────────────────────────────────
  test('Issue & Send assigns the number and flips the milestone outstanding', async ({
    authenticatedPage: page,
  }) => {
    // The detail page calls the issue_invoice RPC first, THEN the invoice-send
    // edge function. We only assert the RPC's DB effects, so stub the edge
    // function — no Resend/edge runtime needed locally, and a send failure
    // wouldn't roll the issue back anyway.
    await page.route('**/functions/v1/invoice-send', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          invoiceId,
          recipient: 'client@patina.dev',
          emailSent: false,
          suppressed: true,
        }),
      }),
    );

    await page.goto(`/portal/billing/invoices/${invoiceId}`, { waitUntil: 'networkidle' });

    await page.getByRole('button', { name: /issue & send/i }).click();

    // SendDialog confirmation (optional personal note left empty).
    const sendDialog = page
      .locator('div.fixed', { has: page.getByRole('heading', { name: /issue & send/i }) })
      .first();
    await expect(sendDialog).toBeVisible({ timeout: 10_000 });
    await sendDialog.getByRole('button', { name: /issue & send/i }).click();

    // DB: poll for the issue_invoice effects rather than trusting networkidle
    // (RPC + invalidations race quiescence).
    await expect
      .poll(async () => (await getInvoice(invoiceId)).status, {
        message: 'invoice should be sent after issue',
        timeout: 15_000,
      })
      .toBe('sent');

    const issued = await getInvoice(invoiceId);
    expect(issued.invoice_number, 'sequential number assigned').toMatch(/^INV-\d{4,}$/);
    expect(issued.issue_date, 'issue_date stamped').not.toBeNull();
    expect(issued.due_date, 'due_date stamped from payment terms').not.toBeNull();
    expect(issued.sent_at, 'sent_at stamped').not.toBeNull();
    // Totals are recomputed server-side from lines at issue time.
    expect(issued.subtotal_cents).toBe(TOTAL_CENTS);
    expect(issued.total_cents).toBe(TOTAL_CENTS);
    expect(issued.amount_paid_cents).toBe(0);

    // Linked pending milestone → outstanding with the invoice due date.
    const milestone = await getMilestone(milestoneId);
    expect(milestone.status).toBe('outstanding');
    expect(milestone.due_date).toBe(issued.due_date);

    // UI reflects the issued state.
    await expect(page.getByText(issued.invoice_number as string).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: /record payment/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 3: Record full manual payment → Paid + earnings + milestone paid
  // ────────────────────────────────────────────────────────────────────────
  test('recording a full check payment marks the invoice paid', async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/portal/billing/invoices/${invoiceId}`, { waitUntil: 'networkidle' });

    await page.getByRole('button', { name: /record payment/i }).first().click();

    const modal = page
      .locator('div.fixed', { has: page.getByRole('heading', { name: /record payment/i }) })
      .first();
    await expect(modal).toBeVisible({ timeout: 10_000 });

    // Full remaining balance, paid by check.
    await modal.getByPlaceholder(/^\d+\.\d{2}$/).fill((TOTAL_CENTS / 100).toFixed(2));
    await modal.locator('select').selectOption('check');
    await modal.getByPlaceholder(/check # \/ wire confirmation/i).fill('QA check #1042');
    await modal.getByRole('button', { name: /record payment/i }).click();

    // DB: the record_invoice_payment RPC + AFTER trigger apply rollup, status,
    // milestone, and earnings effects atomically.
    await expect
      .poll(async () => (await getInvoice(invoiceId)).status, {
        message: 'invoice should be paid after a full payment',
        timeout: 15_000,
      })
      .toBe('paid');

    const paid = await getInvoice(invoiceId);
    expect(paid.amount_paid_cents).toBe(TOTAL_CENTS);
    expect(paid.paid_at, 'paid_at stamped').not.toBeNull();

    // Payment row: succeeded check with our reference.
    const { data: payments, error: payErr } = await adminDb
      .from('invoice_payments')
      .select('amount_cents, method, status, reference')
      .eq('invoice_id', invoiceId);
    if (payErr) throw payErr;
    expect(payments).toHaveLength(1);
    expect(payments![0]).toMatchObject({
      amount_cents: TOTAL_CENTS,
      method: 'check',
      status: 'succeeded',
      reference: 'QA check #1042',
    });

    // Milestone paid through this invoice.
    const milestone = await getMilestone(milestoneId);
    expect(milestone.status).toBe('paid');
    expect(milestone.paid_at, 'milestone paid_at stamped').not.toBeNull();

    // One designer_earnings row anchored on the payment (manual method → paid).
    const { data: earnings, error: earnErr } = await adminDb
      .from('designer_earnings')
      .select('designer_id, source_type, gross_amount, net_amount, status, invoice_id')
      .eq('invoice_id', invoiceId);
    if (earnErr) throw earnErr;
    expect(earnings, 'exactly one earnings row per succeeded payment').toHaveLength(1);
    expect(earnings![0]).toMatchObject({
      designer_id: designerId,
      source_type: 'design_fee',
      gross_amount: TOTAL_CENTS,
      net_amount: TOTAL_CENTS,
      status: 'paid',
      invoice_id: invoiceId,
    });

    // UI: status badge reads Paid; the modal closed and the record-payment
    // action is gone (no longer sent/partially_paid).
    await expect(modal).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: /record payment/i })).toHaveCount(0, {
      timeout: 15_000,
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 4: Void guard — a collected invoice exposes no Void action
  // ────────────────────────────────────────────────────────────────────────
  test('a paid invoice has no Void action', async ({ authenticatedPage: page }) => {
    await page.goto(`/portal/billing/invoices/${invoiceId}`, { waitUntil: 'networkidle' });

    // Anchor on the issued number so we know the detail rendered before
    // asserting the absence of Void.
    const invoice = await getInvoice(invoiceId);
    await expect(page.getByText(invoice.invoice_number as string).first()).toBeVisible({
      timeout: 20_000,
    });

    await expect(page.getByRole('button', { name: /^void$/i })).toHaveCount(0);

    // And the DB state is final: still paid, milestone still paid.
    expect(invoice.status).toBe('paid');
    expect((await getMilestone(milestoneId)).status).toBe('paid');
  });
});
