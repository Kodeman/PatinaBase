/**
 * End-to-end spec: Order Assistant full order flow + acknowledgment +
 * blocked-by-decision guards (W3-T5).
 *
 *   seed one project + one external vendor + three approved trade-priced
 *   FF&E items (+ one decision-blocked fourth item, NO invoices) → the
 *   persistent "Create PO" header button auto-targets the three unblocked
 *   items → review (trade total) → coverage soft gate (all uncovered,
 *   golden-hour warning, "Proceed anyway") → details (sidemark prefilled
 *   from generateSidemark, edited; vendor PO#; fifty_fifty default) →
 *   submit → created confirmation → DB: draft PO with the server-computed
 *   TRADE total + sidemark, two pending po_payments (deposit floor(total/2)
 *   + balance), all three items linked AND ratcheted to 'ordered' (00184
 *   Trigger A) → By Vendor "Log acknowledgment" popover → confirmed PO with
 *   acknowledged_at + "Ack {date}" row meta → blocked-item guards: the
 *   bulk-bar path drops the blocked item with a toast and never opens the
 *   assistant, the persistent path finds nothing orderable, and the 00186
 *   RPC hard-refuses the blocked item when called AS THE DESIGNER (real
 *   password-grant session — adminDb can't exercise this guard because the
 *   service role has no auth.uid() and fails the authentication check
 *   before reaching the blocked check).
 *
 * One serial describe block; ids shared via module closure (same convention
 * as by-status-filters.spec.ts). All DB seeding/assertions go through the
 * service-role adminDb client except the deliberate designer-session RPC
 * call in test 3.
 *
 * LOCAL RUN CONSTRAINT: serial is intra-file only; for deterministic local
 * runs use --project=chromium --workers=1 to prevent cross-file parallelism
 * from interleaving DB state with other suites.
 *
 * Requires:
 *   - Local Supabase running with seed data (designer@patina.dev, who must
 *     have at least one designer_clients row — seeded by
 *     supabase/seed/designer-clients.sql — for the blocked decision's FK)
 *   - Designer portal at :3000 started with
 *     NEXT_PUBLIC_FLAG_OVERRIDES=procurement-workspace-pilot:true (the
 *     playwright webServer config sets it, but a reused server must have
 *     been started with it — NEXT_PUBLIC_ vars are inlined at start)
 *   - SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_ANON_KEY in
 *     apps/designer-portal/.env.local
 */

import { createClient } from '@supabase/supabase-js';
import { test, expect } from '../fixtures/auth';
import { adminDb, getUserIdByEmail } from '../helpers/supabase-admin';
import { hideDevOverlays } from '../helpers/hide-dev-overlays';

// Unique names for everything we seed (prefix E2E OF / E2E-OF-* for cleanup).
const PROJECT_NAME = 'E2E OF Project';
const VENDOR_NAME = 'E2E OF Vendor';
const ITEM_1 = 'E2E OF Credenza 1';
const ITEM_2 = 'E2E OF Armchair 2';
const ITEM_3 = 'E2E OF Sconce 3';
const BLOCKED_ITEM = 'E2E OF Blocked Console 4';
const DECISION_TITLE = 'E2E OF Blocked Decision';
const EDITED_SIDEMARK = 'E2E-OF-SM';
const VENDOR_PO_NUMBER = 'E2E-OF-001';

// Trade 40000 / client 50000, qty 1 each → server TRADE total 3 × 40000.
const TRADE_CENTS = 40_000;
const CLIENT_CENTS = 50_000;
const EXPECTED_TOTAL_CENTS = 3 * TRADE_CENTS; // 120_000 → "$1,200"

// Module-level shared state (safe because describe.serial is sequential).
let designerId: string;
let projectId: string;
let vendorId: string;
let decisionId: string;
let itemIds: string[] = []; // the three orderable items, board sort order
let blockedItemId: string;
let poId: string;
/** Sidemark values generateSidemark could prefill (one per active org). */
let sidemarkCandidates: string[] = [];

// ─── generateSidemark replicas ──────────────────────────────────────────────
// Mirrors src/components/portal/procurement/order-assistant/sidemark.ts so
// the spec predicts the prefill from actual DB state (org name) instead of
// hard-coding "LDS-E2EOFPRO". Items are seeded room-less, so the room
// segment is always omitted; no client name is in the assistant's props, so
// the middle segment is the compacted project name.

function words(input: string): string[] {
  return input.split(/[^A-Za-z0-9]+/).filter(Boolean);
}

function initialsOrPrefix(input: string | null | undefined, max: number): string {
  if (!input) return '';
  const ws = words(input);
  if (ws.length === 0) return '';
  if (ws.length >= 2) {
    return ws.slice(0, max).map((w) => w[0]).join('').toUpperCase();
  }
  return ws[0].slice(0, max).toUpperCase();
}

function compactName(input: string | null | undefined, max: number): string {
  if (!input) return '';
  return input.replace(/[^A-Za-z0-9]+/g, '').slice(0, max).toUpperCase();
}

function expectedSidemark(studioName: string | undefined): string {
  const studio = initialsOrPrefix(studioName, 3);
  const middle = compactName(PROJECT_NAME, 8); // 'E2EOFPRO'
  return [studio, middle].filter(Boolean).join('-');
}

/** Short date label matching vendor-section-card's formatDate ("Jun 11"). */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

test.describe.serial('procurement order flow: create PO + acknowledgment + blocked guards', () => {
  // The dev-only TanStack devtools toggle floats over the bottom-right corner
  // where the Order Assistant footer puts its primary button — hide it before
  // each test's navigation so narrow buttons ("Done") stay clickable.
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await hideDevOverlays(page);
  });

  test.beforeAll(async () => {
    designerId = await getUserIdByEmail('designer@patina.dev');

    // ── Sidemark prediction inputs: the designer's active orgs ─────────────
    // useOrganizations() feeds orgs[0].name into generateSidemark; with the
    // single seeded 'Local Dev Studio' org this is deterministic, but we
    // accept any active org's derivation to stay robust on drifted dev DBs.
    const { data: memberships, error: orgErr } = await adminDb
      .from('organization_members')
      .select('status, organizations(name)')
      .eq('user_id', designerId)
      .eq('status', 'active');
    if (orgErr) throw new Error(`org membership lookup failed: ${orgErr.message}`);
    const orgNames = (memberships ?? [])
      .map((m) => (m.organizations as { name?: string } | null)?.name)
      .filter((n): n is string => !!n);
    sidemarkCandidates =
      orgNames.length > 0
        ? Array.from(new Set(orgNames.map((n) => expectedSidemark(n))))
        : [expectedSidemark(undefined)];

    // ── Project ───────────────────────────────────────────────────────────
    const { data: proj, error: projErr } = await adminDb
      .from('projects')
      .insert({
        name: PROJECT_NAME,
        designer_id: designerId,
        created_by: designerId,
        status: 'active',
        notes: 'E2E OF seed — safe to delete.',
      })
      .select('id')
      .single();
    if (projErr) throw new Error(`seed project failed: ${projErr.message}`);
    projectId = proj.id as string;

    // ── Vendor (external — NOT Patina catalog; fifty_fifty default terms
    //    drive the assistant's payment-pattern prefill) ─────────────────────
    const { data: vendor, error: vendorErr } = await adminDb
      .from('vendors')
      .insert({ name: VENDOR_NAME, default_payment_terms: 'fifty_fifty' })
      .select('id')
      .single();
    if (vendorErr) throw new Error(`seed vendor failed: ${vendorErr.message}`);
    vendorId = vendor.id as string;

    // ── Blocked decision (FK target for blocked_by_decision_id) ───────────
    // client_decisions.designer_client_id is NOT NULL → reuse the seeded
    // designer↔client pair rather than fabricating profiles. The 00171
    // status guard / event triggers are UPDATE-only, so a plain 'pending'
    // INSERT is safe.
    const { data: dc, error: dcErr } = await adminDb
      .from('designer_clients')
      .select('id')
      .eq('designer_id', designerId)
      .limit(1)
      .maybeSingle();
    if (dcErr || !dc) {
      throw new Error(
        `designer_clients row for designer@patina.dev not found (seed designer-clients.sql required): ${dcErr?.message ?? 'no rows'}`,
      );
    }
    const { data: decision, error: decisionErr } = await adminDb
      .from('client_decisions')
      .insert({
        designer_client_id: dc.id as string,
        project_id: projectId,
        title: DECISION_TITLE,
        status: 'pending',
      })
      .select('id')
      .single();
    if (decisionErr) throw new Error(`seed decision failed: ${decisionErr.message}`);
    decisionId = decision.id as string;

    // ── FF&E items: 3 orderable + 1 decision-blocked, all 'approved' with
    //    a vendor link (startGeneratePOs requires vendor_id) and dual
    //    pricing. NO invoices are seeded — the coverage soft gate must show
    //    all three as uncovered. No purchase_order_id → no 00184 ratchet.
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
        {
          ...baseItem,
          name: BLOCKED_ITEM,
          sort_order: 3,
          blocked: true,
          blocked_by_decision_id: decisionId,
          blocked_reason: 'E2E OF — awaiting client decision.',
        },
      ])
      .select('id, name');
    if (itemsErr) throw new Error(`seed project_ffe_items failed: ${itemsErr.message}`);
    const byName = new Map((seeded ?? []).map((it) => [it.name as string, it.id as string]));
    itemIds = [ITEM_1, ITEM_2, ITEM_3].map((n) => byName.get(n)!);
    blockedItemId = byName.get(BLOCKED_ITEM)!;
    if (itemIds.some((id) => !id) || !blockedItemId) throw new Error('seeded item ids missing');
  });

  test.afterAll(async () => {
    // FK order: items first (frees blocked_by_decision_id + the PO link),
    // then po_payments → purchase_orders (procurement_notifications CASCADE
    // off POs; purchase_orders.project_id is RESTRICT so POs go before the
    // project), then the decision, the project, and the vendor. No invoices
    // exist in this suite, so item deletes can't trip the 00187 ffe-line
    // guard. Zero 'E2E OF%' residue.
    if (projectId) {
      await adminDb.from('project_ffe_items').delete().eq('project_id', projectId);
      const { data: pos } = await adminDb
        .from('purchase_orders')
        .select('id')
        .eq('project_id', projectId);
      const poIds = (pos ?? []).map((p) => p.id as string);
      if (poIds.length > 0) {
        await adminDb.from('po_payments').delete().in('purchase_order_id', poIds);
        await adminDb.from('purchase_orders').delete().in('id', poIds);
      }
    }
    if (decisionId) {
      await adminDb.from('client_decisions').delete().eq('id', decisionId);
    }
    if (projectId) {
      await adminDb.from('projects').delete().eq('id', projectId);
    }
    if (vendorId) {
      await adminDb.from('vendors').delete().eq('id', vendorId);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 1: persistent Create PO → review → soft gate → details → created
  // ──────────────────────────────────────────────────────────────────────────
  test('full order flow from the board via the persistent Create PO button', async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/portal/projects/${projectId}/ffe`, { waitUntil: 'networkidle' });
    await expect(page.getByText(ITEM_1)).toBeVisible({ timeout: 20_000 });

    // Persistent header entry with NOTHING selected — auto-targets every
    // approved, unordered, UNBLOCKED item. Four approved items exist; the
    // decision-blocked one must be excluded by the auto-target.
    await page.getByRole('button', { name: 'Create PO', exact: true }).click();

    const dialog = page.getByRole('dialog', {
      name: new RegExp(`Order Assistant for ${VENDOR_NAME}`),
    });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // ── Review step: 3 items, vendor TRADE total $1,200 (never client $1,500)
    await expect(dialog).toContainText('Step 1 of 3 · Review items');
    await expect(dialog.getByText('3 items · $1,200 total')).toBeVisible();
    await expect(dialog.getByText(ITEM_1)).toBeVisible();
    await expect(dialog.getByText(ITEM_2)).toBeVisible();
    await expect(dialog.getByText(ITEM_3)).toBeVisible();
    await expect(dialog.getByText(BLOCKED_ITEM)).toHaveCount(0);

    await dialog.getByRole('button', { name: 'Continue', exact: true }).click();

    // ── Coverage step: NO invoices seeded → all three uncovered. The
    // golden-hour soft gate renders the count copy + one "Not invoiced"
    // chip per item, and the primary action flips to "Proceed anyway".
    await expect(dialog.getByText('Client payment not confirmed')).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      dialog.getByText('3 items not covered by a paid client invoice'),
    ).toBeVisible();
    await expect(dialog.getByText('Not invoiced')).toHaveCount(3);

    await dialog.getByRole('button', { name: 'Proceed anyway', exact: true }).click();

    // ── Details step: sidemark prefilled by generateSidemark from the org
    // name + project name (no client name in scope; room-less items omit the
    // room segment). The org name loads async, so wait for the final value.
    await expect(dialog).toContainText('Step 3 of 3 · Order details');
    const sidemarkInput = dialog.getByLabel('Shipment sidemark');
    await expect
      .poll(async () => sidemarkInput.inputValue(), { timeout: 15_000 })
      .toMatch(new RegExp(`^(${sidemarkCandidates.join('|')})$`));

    // Edit the sidemark + record the vendor's PO number; fifty_fifty stays
    // (the vendor default) with its floor(total/2) deposit prefill.
    await sidemarkInput.fill(EDITED_SIDEMARK);
    await dialog.getByLabel('Vendor PO #').fill(VENDOR_PO_NUMBER);
    await expect(dialog.getByLabel('Deposit amount')).toHaveValue('600.00');

    await dialog.getByRole('button', { name: 'Confirm 3 ordered', exact: true }).click();

    // ── Created confirmation, then Done closes the panel.
    await expect(dialog.getByText('Purchase order created')).toBeVisible({
      timeout: 15_000,
    });
    await expect(dialog.getByText(`Vendor PO ${VENDOR_PO_NUMBER}`)).toBeVisible();
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByRole('dialog', { name: /Order Assistant/ })).toHaveCount(0);

    // ── DB: draft header with server-computed TRADE total + sidemark.
    const { data: po, error: poErr } = await adminDb
      .from('purchase_orders')
      .select('id, status, total_cents, sidemark, vendor_po_number, payment_pattern, is_patina_catalog, vendor_id')
      .eq('project_id', projectId)
      .eq('vendor_po_number', VENDOR_PO_NUMBER)
      .single();
    if (poErr) throw poErr;
    poId = po.id as string;
    expect(po.status).toBe('draft');
    expect(po.total_cents).toBe(EXPECTED_TOTAL_CENTS);
    expect(po.sidemark).toBe(EDITED_SIDEMARK);
    expect(po.payment_pattern).toBe('fifty_fifty');
    expect(po.is_patina_catalog).toBe(false);
    expect(po.vendor_id).toBe(vendorId);

    // ── DB: fifty_fifty payment rows — deposit floor(total/2) + balance,
    // both 'pending' (no due dates supplied; Trigger B/D flips come later
    // in the lifecycle, not at create).
    const { data: payments, error: payErr } = await adminDb
      .from('po_payments')
      .select('kind, amount_cents, state, due_date, sort_order')
      .eq('purchase_order_id', poId)
      .order('sort_order', { ascending: true });
    if (payErr) throw payErr;
    expect(payments).toHaveLength(2);
    expect(payments![0]).toMatchObject({
      kind: 'deposit',
      amount_cents: EXPECTED_TOTAL_CENTS / 2,
      state: 'pending',
      due_date: null,
      sort_order: 0,
    });
    expect(payments![1]).toMatchObject({
      kind: 'balance',
      amount_cents: EXPECTED_TOTAL_CENTS / 2,
      state: 'pending',
      sort_order: 1,
    });

    // ── DB: all three items linked AND ratcheted to 'ordered' (00184
    // Trigger A fires on the RPC's link UPDATE); the blocked item untouched.
    const { data: items, error: itemsErr } = await adminDb
      .from('project_ffe_items')
      .select('id, status, purchase_order_id')
      .eq('project_id', projectId);
    if (itemsErr) throw itemsErr;
    for (const id of itemIds) {
      const row = items!.find((it) => it.id === id);
      expect(row?.purchase_order_id, `item ${id} linked to the PO`).toBe(poId);
      expect(row?.status, `item ${id} ratcheted to ordered`).toBe('ordered');
    }
    const blockedRow = items!.find((it) => it.id === blockedItemId);
    expect(blockedRow?.purchase_order_id).toBeNull();
    expect(blockedRow?.status).toBe('approved');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 2: By Vendor → Log acknowledgment → confirmed + Ack meta
  // ──────────────────────────────────────────────────────────────────────────
  test('logging vendor acknowledgment confirms the PO and stamps acknowledged_at', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/portal/procurement/by-vendor', { waitUntil: 'networkidle' });

    // Our vendor's card (other dev-seed vendors render their own cards).
    const card = page.locator('section').filter({ hasText: VENDOR_NAME });
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card.getByText(PROJECT_NAME)).toBeVisible();

    // Draft PO row → acknowledgment popover → confirm. The ack date is
    // stamped server-side (NOW(), idempotent); PO#/ETA inputs stay blank to
    // preserve the stored values.
    await card.getByRole('button', { name: 'Log acknowledgment' }).click();
    const popover = page.getByRole('dialog', { name: 'Log vendor acknowledgment' });
    await expect(popover).toBeVisible({ timeout: 10_000 });
    await popover.getByRole('button', { name: 'Confirm acknowledgment' }).click();

    await expect(page.getByText('Acknowledgment logged — PO confirmed.')).toBeVisible({
      timeout: 10_000,
    });

    // DB: acknowledged_at stamped + draft → confirmed; vendor_po_number
    // preserved (blank popover input coalesces to the stored value).
    const { data: po, error } = await adminDb
      .from('purchase_orders')
      .select('status, acknowledged_at, vendor_po_number')
      .eq('id', poId)
      .single();
    if (error) throw error;
    expect(po.status).toBe('confirmed');
    expect(po.acknowledged_at).not.toBeNull();
    expect(po.vendor_po_number).toBe(VENDOR_PO_NUMBER);

    // Row meta now shows "Ack {date}" (computed from the DB stamp so a
    // midnight rollover can't make the expectation drift), and the
    // log-acknowledgment trigger is gone (the PO is no longer draft).
    await expect(card.getByText(`Ack ${shortDate(po.acknowledged_at as string)}`)).toBeVisible({
      timeout: 10_000,
    });
    await expect(card.getByRole('button', { name: 'Log acknowledgment' })).toHaveCount(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 3: blocked-by-decision guards — UI drop + server-side RPC refusal
  // ──────────────────────────────────────────────────────────────────────────
  // The board pre-filters decision-blocked items BEFORE the Order Assistant
  // ever opens (startGeneratePOs drops them with a toast), so the assistant's
  // BlockedByDecisionInline is unreachable from this surface — the reachable
  // UI assertions are the bulk-path drop toast + the persistent button
  // finding nothing orderable. The 00186 server-side guard is then exercised
  // directly AS THE DESIGNER via a password-grant session (adminDb cannot:
  // the service role has no auth.uid(), so the RPC rejects it as
  // unauthenticated before the blocked check is reached).
  test('blocked item is dropped from every order path and refused by the RPC', async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/portal/projects/${projectId}/ffe`, { waitUntil: 'networkidle' });
    await expect(page.getByText(BLOCKED_ITEM)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('⚠ Blocked — pending decision')).toBeVisible();

    // Bulk path: explicitly selecting the blocked item and creating a PO
    // drops it with the skip toast and never opens the assistant.
    await page.getByRole('checkbox', { name: `Select ${BLOCKED_ITEM}` }).check();
    const bulkBar = page.getByRole('region', { name: 'Bulk actions' });
    await expect(bulkBar).toBeVisible();
    await bulkBar.getByRole('button', { name: 'Create PO', exact: true }).click();
    await expect(
      page.getByText('1 item skipped — blocked pending a client decision.'),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('dialog', { name: /Order Assistant/ })).toHaveCount(0);

    // Persistent path: with the selection cleared, the auto-target finds no
    // approved+unordered+unblocked item (1–3 are ordered; 4 is blocked).
    await bulkBar.getByRole('button', { name: 'Clear', exact: true }).click();
    await page.getByRole('button', { name: 'Create PO', exact: true }).click();
    await expect(
      page.getByText('No approved, unordered items to order — approve items first.'),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('dialog', { name: /Order Assistant/ })).toHaveCount(0);

    // Server-side guard (00186): call create_purchase_order as the real
    // designer with the blocked item — the RPC must hard-refuse.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!anonKey) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY missing from .env.local');
    const designerDb = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInErr } = await designerDb.auth.signInWithPassword({
      email: process.env.DESIGNER_E2E_EMAIL ?? 'designer@patina.dev',
      password: process.env.DESIGNER_E2E_PASSWORD ?? 'password123',
    });
    if (signInErr) throw new Error(`designer sign-in failed: ${signInErr.message}`);
    try {
      const { error: rpcErr } = await designerDb.rpc('create_purchase_order', {
        p_project_id: projectId,
        p_vendor_id: vendorId,
        p_payment_pattern: 'net_30',
        p_ffe_item_ids: [blockedItemId],
      });
      expect(rpcErr, 'RPC must refuse decision-blocked items').not.toBeNull();
      expect(rpcErr!.message).toMatch(/blocked pending a client decision/);
    } finally {
      // local scope: don't revoke the auth fixture's refresh tokens globally.
      await designerDb.auth.signOut({ scope: 'local' });
    }

    // DB: the refusal left no trace — the blocked item is still unordered
    // and the vendor still has exactly the one PO from test 1.
    const { data: blockedRow, error: rowErr } = await adminDb
      .from('project_ffe_items')
      .select('status, purchase_order_id')
      .eq('id', blockedItemId)
      .single();
    if (rowErr) throw rowErr;
    expect(blockedRow.status).toBe('approved');
    expect(blockedRow.purchase_order_id).toBeNull();

    const { count, error: countErr } = await adminDb
      .from('purchase_orders')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId);
    if (countErr) throw countErr;
    expect(count).toBe(1);
  });
});
