/**
 * End-to-end spec: Procurement → By Status per-item pipeline (W1-T8)
 *
 *   seed two projects + one vendor + two POs (in_production / shipped) with
 *   po_payments (due / pending) and FF&E items linked to each PO (the 00184
 *   `aaa_ffe_ratchet_to_po_stage` trigger advances the items from 'approved'
 *   to the PO's stage at INSERT) → per-item rows render in their stage
 *   buckets → Project facet narrows rows → Payment 'due' facet narrows to
 *   the PO with the due payment → ?projectId= deep link pre-applies the
 *   Project facet → By Vendor loads without the QBO Forbidden toast
 *   (regression for the eager preview query, fixed in 6673f17a).
 *
 * One serial describe block; ids shared via module closure (same convention
 * as billing/invoices.spec.ts). All DB seeding/assertions go through the
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

// Unique names for everything we seed (prefix E2E BSF / E2E-BSF-* for cleanup).
const PROJECT_A_NAME = 'E2E BSF Project A';
const PROJECT_B_NAME = 'E2E BSF Project B';
const VENDOR_NAME = 'E2E BSF Vendor';
const PO_A_NUMBER = 'E2E-BSF-PO-A';
const PO_B_NUMBER = 'E2E-BSF-PO-B';
const ITEM_A1 = 'E2E BSF Credenza A1';
const ITEM_A2 = 'E2E BSF Armchair A2';
const ITEM_B1 = 'E2E BSF Sofa B1';
const ITEM_B2 = 'E2E BSF Sconce B2';

// Module-level shared state (safe because describe.serial is sequential).
let designerId: string;
let projectAId: string;
let projectBId: string;
let vendorId: string;
let poAId: string;
let poBId: string;

// ─── Page helpers ───────────────────────────────────────────────────────────

/**
 * Flow-chart stage button ("{count} {label}"). The count changes as filters
 * apply, so match on the trailing label only.
 */
function stageButton(page: Page, label: string) {
  return page.getByRole('button', { name: new RegExp(`^\\d+\\s*${label}$`, 'i') });
}

/** Opens the FacetedFilterPopover and returns the popover dialog locator. */
async function openFilters(page: Page) {
  await page.getByRole('button', { name: /^filters/i }).click();
  // The popover renders role="dialog" with a Reset action; scope to it so
  // facet pill clicks can't hit a same-named element elsewhere on the page.
  const dialog = page.getByRole('dialog').filter({ hasText: 'Reset' });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  return dialog;
}

test.describe.serial('procurement by-status: per-item buckets + filters + toast regression', () => {
  test.beforeAll(async () => {
    designerId = await getUserIdByEmail('designer@patina.dev');

    // Two active projects owned by the seeded designer (client link is not
    // required for the procurement views).
    const { data: projA, error: projAErr } = await adminDb
      .from('projects')
      .insert({
        name: PROJECT_A_NAME,
        designer_id: designerId,
        created_by: designerId,
        status: 'active',
        notes: 'E2E BSF seed — safe to delete.',
      })
      .select('id')
      .single();
    if (projAErr) throw new Error(`seed project A failed: ${projAErr.message}`);
    projectAId = projA.id as string;

    const { data: projB, error: projBErr } = await adminDb
      .from('projects')
      .insert({
        name: PROJECT_B_NAME,
        designer_id: designerId,
        created_by: designerId,
        status: 'active',
        notes: 'E2E BSF seed — safe to delete.',
      })
      .select('id')
      .single();
    if (projBErr) throw new Error(`seed project B failed: ${projBErr.message}`);
    projectBId = projB.id as string;

    // One vendor shared by both POs (vendors are globally readable).
    const { data: vendor, error: vendorErr } = await adminDb
      .from('vendors')
      .insert({ name: VENDOR_NAME, default_payment_terms: 'fifty_fifty' })
      .select('id')
      .single();
    if (vendorErr) throw new Error(`seed vendor failed: ${vendorErr.message}`);
    vendorId = vendor.id as string;

    // PO A: in_production against project A. Inserted with its final status
    // (no UPDATE) so trigger B (00184 cascade) does not fire here — the item
    // ratchet happens via trigger A at item-INSERT time below.
    const { data: poA, error: poAErr } = await adminDb
      .from('purchase_orders')
      .insert({
        designer_id: designerId,
        project_id: projectAId,
        vendor_id: vendorId,
        vendor_po_number: PO_A_NUMBER,
        payment_pattern: 'fifty_fifty',
        total_cents: 200_000,
        status: 'in_production',
      })
      .select('id')
      .single();
    if (poAErr) throw new Error(`seed PO A failed: ${poAErr.message}`);
    poAId = poA.id as string;

    // PO B: shipped against project B.
    const { data: poB, error: poBErr } = await adminDb
      .from('purchase_orders')
      .insert({
        designer_id: designerId,
        project_id: projectBId,
        vendor_id: vendorId,
        vendor_po_number: PO_B_NUMBER,
        payment_pattern: 'net_30',
        total_cents: 125_000,
        status: 'shipped',
      })
      .select('id')
      .single();
    if (poBErr) throw new Error(`seed PO B failed: ${poBErr.message}`);
    poBId = poB.id as string;

    // Payments inserted directly: PO A carries the 'due' deposit (its rows'
    // headline payment state → Due), PO B a 'pending' balance (→ Pending).
    // net_30 + shipped with a pending balance fires no 00184 flip (triggers
    // B/D only react to UPDATEs and split patterns).
    const { error: payErr } = await adminDb.from('po_payments').insert([
      {
        purchase_order_id: poAId,
        kind: 'deposit',
        amount_cents: 100_000,
        state: 'due',
        due_date: new Date().toISOString().slice(0, 10),
        sort_order: 0,
      },
      {
        purchase_order_id: poBId,
        kind: 'balance',
        amount_cents: 125_000,
        state: 'pending',
        sort_order: 0,
      },
    ]);
    if (payErr) throw new Error(`seed po_payments failed: ${payErr.message}`);

    // FF&E items linked to the POs at INSERT. Initial status 'approved' —
    // the 00184 BEFORE-INSERT ratchet (aaa_ffe_ratchet_to_po_stage) advances
    // A's items to 'production' and B's to 'shipped'; asserted in test 1.
    const { error: itemsErr } = await adminDb.from('project_ffe_items').insert([
      {
        project_id: projectAId,
        purchase_order_id: poAId,
        name: ITEM_A1,
        status: 'approved',
        quantity: 1,
        unit_price_cents: 120_000,
        line_total_cents: 120_000,
        sort_order: 0,
      },
      {
        project_id: projectAId,
        purchase_order_id: poAId,
        name: ITEM_A2,
        status: 'approved',
        quantity: 1,
        unit_price_cents: 80_000,
        line_total_cents: 80_000,
        sort_order: 1,
      },
      {
        project_id: projectBId,
        purchase_order_id: poBId,
        name: ITEM_B1,
        status: 'approved',
        quantity: 1,
        unit_price_cents: 95_000,
        line_total_cents: 95_000,
        sort_order: 0,
      },
      {
        project_id: projectBId,
        purchase_order_id: poBId,
        name: ITEM_B2,
        status: 'approved',
        quantity: 1,
        unit_price_cents: 30_000,
        line_total_cents: 30_000,
        sort_order: 1,
      },
    ]);
    if (itemsErr) throw new Error(`seed project_ffe_items failed: ${itemsErr.message}`);
  });

  test.afterAll(async () => {
    // FK order: items first (purchase_order_id is SET NULL on PO delete, but
    // explicit beats implicit), then POs (po_payments + any
    // procurement_notifications CASCADE off them; purchase_orders.project_id
    // is ON DELETE RESTRICT so POs must go before projects), then projects,
    // then the vendor (vendor_id is RESTRICT too). No receiving inspections
    // are created in this suite.
    if (projectAId || projectBId) {
      await adminDb
        .from('project_ffe_items')
        .delete()
        .in('project_id', [projectAId, projectBId].filter(Boolean));
    }
    if (poAId || poBId) {
      const poIds = [poAId, poBId].filter(Boolean);
      await adminDb.from('po_payments').delete().in('purchase_order_id', poIds);
      await adminDb.from('purchase_orders').delete().in('id', poIds);
    }
    if (projectAId || projectBId) {
      await adminDb
        .from('projects')
        .delete()
        .in('id', [projectAId, projectBId].filter(Boolean));
    }
    if (vendorId) {
      await adminDb.from('vendors').delete().eq('id', vendorId);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 1: per-item rows render in their (trigger-ratcheted) stage buckets
  // ──────────────────────────────────────────────────────────────────────────
  test('renders seeded items in their stage buckets', async ({
    authenticatedPage: page,
  }) => {
    // DB: the 00184 ratchet moved the items from 'approved' to the PO stage.
    const { data: seeded, error } = await adminDb
      .from('project_ffe_items')
      .select('name, status, project_id')
      .in('project_id', [projectAId, projectBId]);
    if (error) throw error;
    expect(seeded).toHaveLength(4);
    for (const item of seeded!) {
      expect(
        item.status,
        `${item.name} should be ratcheted to its PO's stage`,
      ).toBe(item.project_id === projectAId ? 'production' : 'shipped');
    }

    await page.goto('/portal/procurement/by-status', { waitUntil: 'networkidle' });

    // Production is the default-open stage — project A's items are the rows.
    await expect(page.getByText(ITEM_A1)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(ITEM_A2)).toBeVisible();
    await expect(page.getByText(PO_A_NUMBER).first()).toBeVisible();
    await expect(page.getByText(VENDOR_NAME).first()).toBeVisible();
    // Project B's items live in the Shipped bucket, not here.
    await expect(page.getByText(ITEM_B1)).toHaveCount(0, { timeout: 10_000 });

    // Switch buckets via the flow-chart stage button.
    await stageButton(page, 'Shipped').click();
    await expect(page.getByText(ITEM_B1)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(ITEM_B2)).toBeVisible();
    await expect(page.getByText(PO_B_NUMBER).first()).toBeVisible();
    await expect(page.getByText(ITEM_A1)).toHaveCount(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 2: Project facet narrows rows
  // ──────────────────────────────────────────────────────────────────────────
  test('project facet filter hides the other project items', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/portal/procurement/by-status', { waitUntil: 'networkidle' });

    // Precondition: B's item is visible in the Shipped bucket unfiltered.
    await stageButton(page, 'Shipped').click();
    await expect(page.getByText(ITEM_B1)).toBeVisible({ timeout: 20_000 });

    // Apply Project = A.
    const dialog = await openFilters(page);
    await dialog.getByRole('button', { name: PROJECT_A_NAME }).click();

    // B's items vanish from the (still-active) Shipped bucket…
    await expect(page.getByText(ITEM_B1)).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByText(ITEM_B2)).toHaveCount(0);

    // …and the Project facet stays in sync with ?projectId= (deep-linkable).
    await expect(page).toHaveURL(new RegExp(`projectId=${projectAId}`));

    // A's items remain, in the Production bucket. (Clicking the stage button
    // is an outside-mousedown, which also dismisses the popover.)
    await stageButton(page, 'Production').click();
    await expect(page.getByText(ITEM_A1)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(ITEM_A2)).toBeVisible();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 3: Payment facet 'due' narrows to the PO with the due payment
  // ──────────────────────────────────────────────────────────────────────────
  test('payment facet "due" keeps only items on the PO with a due payment', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/portal/procurement/by-status', { waitUntil: 'networkidle' });

    // Precondition: B's item (headline payment: Pending) visible unfiltered.
    await stageButton(page, 'Shipped').click();
    await expect(page.getByText(ITEM_B1)).toBeVisible({ timeout: 20_000 });

    // Apply Payment = Due.
    const dialog = await openFilters(page);
    await dialog.getByRole('button', { name: 'Due', exact: true }).click();

    // PO B's items (pending balance) are filtered out…
    await expect(page.getByText(ITEM_B1)).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByText(ITEM_B2)).toHaveCount(0);

    // …while PO A's items (due deposit) survive in the Production bucket.
    await stageButton(page, 'Production').click();
    await expect(page.getByText(ITEM_A1)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(ITEM_A2)).toBeVisible();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 4: ?projectId= deep link pre-applies the Project facet
  // ──────────────────────────────────────────────────────────────────────────
  test('?projectId= deep link pre-applies the project filter', async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/portal/procurement/by-status?projectId=${projectAId}`, {
      waitUntil: 'networkidle',
    });

    // A's items render (Production default bucket)…
    await expect(page.getByText(ITEM_A1)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(ITEM_A2)).toBeVisible();

    // …the Filters trigger shows one active selection…
    await expect(page.getByRole('button', { name: /^filters/i })).toContainText('1');

    // …and B's items are absent even in their own (Shipped) bucket.
    await stageButton(page, 'Shipped').click();
    await expect(page.getByText(ITEM_B1)).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByText(ITEM_B2)).toHaveCount(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 5: By Vendor loads with no Forbidden toast (QBO eager-query
  // regression, fixed in use-procurement useQboExportPreview opts.enabled)
  // ──────────────────────────────────────────────────────────────────────────
  test('by-vendor renders without a Forbidden toast or eager QBO call', async ({
    authenticatedPage: page,
  }) => {
    const forbiddenConsole: string[] = [];
    page.on('console', (msg) => {
      if (/forbidden/i.test(msg.text())) forbiddenConsole.push(msg.text());
    });
    // The regression was the closed QBO modal's preview query firing the
    // edge function on page load for non-owners — it must not fire at all.
    const qboRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/functions/v1/qbo-export')) qboRequests.push(req.url());
    });

    await page.goto('/portal/procurement/by-vendor', { waitUntil: 'networkidle' });

    // Content loaded: header + our seeded vendor's card.
    await expect(page.getByRole('heading', { name: 'By Vendor' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(VENDOR_NAME).first()).toBeVisible({ timeout: 20_000 });

    // No toast of any kind (the design-system Toaster portals into the Radix
    // viewport, a labelled region whose <ol> holds one <li> per open toast),
    // and specifically no Forbidden text anywhere.
    await expect(
      page.getByRole('region', { name: /notifications/i }).getByRole('listitem'),
    ).toHaveCount(0);
    await expect(page.getByText(/forbidden/i)).toHaveCount(0);

    expect(qboRequests, 'QBO preview must not fire eagerly on page load').toEqual([]);
    expect(forbiddenConsole, 'no console output mentioning Forbidden').toEqual([]);
  });
});
