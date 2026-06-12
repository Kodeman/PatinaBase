/**
 * End-to-end spec: W5-T2 expediting surfaces — By Status overdue / no-ack
 * flags + date columns, acknowledgment clearing the no-ack flag, and the
 * Calendar unscheduled-shipment banner → Set ETA → grid event (W5-T3).
 *
 *   seed one project + one vendor + three POs covering the flag matrix:
 *     PO-A — confirmed_eta 5 days PAST, sent 3 days ago, never acknowledged,
 *            one linked item at 'production' → BOTH flags (overdue + no ack)
 *     PO-B — shipped with NO confirmed_eta, acknowledged → the Calendar
 *            "no delivery date" banner row (invisible to the grid until an
 *            ETA exists)
 *     PO-C — confirmed_eta 10 days out, sent 1 HOUR ago, unacknowledged,
 *            one linked item ratcheted to 'production' → NO flags (the
 *            48-hour no-ack window hasn't elapsed; the ETA isn't past)
 *   → By Status renders the flags + Ordered/Ack date columns truthfully →
 *   logging the vendor acknowledgment via the By Vendor popover clears the
 *   no-ack flag (overdue survives — the ETA is still past) → the Calendar
 *   banner lists PO-B, Set ETA opens the quick-edit drawer, saving a date
 *   empties the banner AND drops the delivery event into the grid.
 *
 * Seeding notes:
 *   - NO po_payments rows are seeded — deliberately. The By Status payment
 *     column must tolerate a PO with zero payment rows (pickHeadlinePayment
 *     returns null → the row renders the quiet "—" placeholder, asserted in
 *     test 1). If these rows ever crash instead, that's a real regression.
 *   - PO-A is seeded as status 'in_production' — the brief's original
 *     intent. This spec originally had to seed it 'draft' because the ONLY
 *     acknowledgment affordance (the By Vendor popover) rendered for draft
 *     POs only, backed by log_po_acknowledgment (00186) which hard-refused
 *     any status outside draft/confirmed — a PO advanced past 'confirmed'
 *     without an ack showed a no-ack flag no UI could clear. That gap is
 *     CLOSED: 00190 accepts any non-cancelled status (stamping
 *     acknowledged_at WITHOUT moving the status — only draft → confirmed
 *     ever transitions) and the popover now renders for any unacknowledged,
 *     non-cancelled, non-Patina-Catalog PO. Test 2 exercises exactly this
 *     late-ack path end-to-end.
 *   - PO-A's item is seeded directly at 'production': the 00184 Trigger A
 *     ratchet only ever advances (in_production maps to 'production',
 *     rank 4 — an equal-rank no-op), so the seeded status survives the
 *     link. PO-C's item is seeded 'approved' and ratcheted to 'production'
 *     by the trigger (asserted in test 1).
 *   - All POs carry sent_at so the By Vendor card renders no send popovers
 *     (no po-send / functions-serve dependency anywhere in this spec).
 *
 * One serial describe block; ids shared via module closure (same convention
 * as by-status-filters.spec.ts). All DB seeding/assertions go through the
 * service-role adminDb client.
 *
 * LOCAL RUN CONSTRAINT: serial is intra-file only; for deterministic local
 * runs use --project=chromium --workers=1 to prevent cross-file parallelism
 * from interleaving DB state with other suites. Test 3 additionally assumes
 * the dev-seed POs are the only other shipped POs (they all carry ETAs, so
 * the banner count is exactly 1).
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

// Unique names for everything we seed (prefix E2E EXP / E2E-EXP-* for cleanup).
const PROJECT_NAME = 'E2E EXP Project';
const VENDOR_NAME = 'E2E EXP Vendor';
const PO_A_NUMBER = 'E2E-EXP-PO-A';
const PO_B_NUMBER = 'E2E-EXP-PO-B';
const PO_C_NUMBER = 'E2E-EXP-PO-C';
const ITEM_A = 'E2E EXP Pendant A';
const ITEM_C = 'E2E EXP Console C';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Module-level shared state (safe because describe.serial is sequential).
let designerId: string;
let projectId: string;
let vendorId: string;
let poAId: string;
let poBId: string;
let poCId: string;
let poACreatedAt: string;
/** PO-A's seeded sent_at — pinned so the no-ack title assertion can't drift. */
let poASentAt: string;
/** PO-A's seeded (past) ETA — asserted unchanged through the ack in test 2. */
let etaPastIso: string;

// ─── Date helpers ───────────────────────────────────────────────────────────

/**
 * LOCAL-date ISO (YYYY-MM-DD) offset by n days. confirmed_eta is a DATE and
 * the By Status overdue flag compares it against the LOCAL today
 * (todayIso() in by-status/page.tsx, per fix 5b2cdee0) — so the seeded
 * dates must be derived in local time too, or a UTC-midnight seed could
 * straddle the comparison near midnight.
 */
function localDateIso(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * DAY_MS);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Timestamptz ISO n hours in the past (for sent_at / acknowledged_at). */
function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * HOUR_MS).toISOString();
}

/** Short date label matching the page formatters ("Jun 12"). */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Page helpers ───────────────────────────────────────────────────────────

/**
 * A By Status per-item row, located by ItemStatusRow's grid template class
 * (unique to that component) narrowed to the row containing the item name.
 * Coupled to the page's layout class on purpose — `.filter({ hasText })`
 * alone would also keep any grid ancestor of the row.
 */
function itemRow(page: Page, itemName: string) {
  return page
    .locator('div[class*="grid-cols-[2fr_1.2fr_90px_1fr_96px]"]')
    .filter({ hasText: itemName });
}

test.describe.serial('procurement expediting: flags + ack-clear + unscheduled banner', () => {
  // The dev-only TanStack devtools toggle floats over the bottom-right corner
  // where the ETA drawer puts its "Save new ETA" button — hide it before each
  // test's navigation.
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await hideDevOverlays(page);
  });

  test.beforeAll(async () => {
    designerId = await getUserIdByEmail('designer@patina.dev');
    etaPastIso = localDateIso(-5);
    poASentAt = hoursAgoIso(3 * 24);

    // ── Project ───────────────────────────────────────────────────────────
    const { data: proj, error: projErr } = await adminDb
      .from('projects')
      .insert({
        name: PROJECT_NAME,
        designer_id: designerId,
        created_by: designerId,
        status: 'active',
        notes: 'E2E EXP seed — safe to delete.',
      })
      .select('id')
      .single();
    if (projErr) throw new Error(`seed project failed: ${projErr.message}`);
    projectId = proj.id as string;

    // ── Vendor (external; no orders_email — the send paths are untouched
    //    here, all POs carry sent_at so no send popover ever renders) ───────
    const { data: vendor, error: vendorErr } = await adminDb
      .from('vendors')
      .insert({ name: VENDOR_NAME, default_payment_terms: 'net_30' })
      .select('id')
      .single();
    if (vendorErr) throw new Error(`seed vendor failed: ${vendorErr.message}`);
    vendorId = vendor.id as string;

    // ── POs (inserted with final status — no UPDATE, so 00184 Trigger B
    //    never fires during seeding) ────────────────────────────────────────

    // PO-A: in production, ETA 5 days past, sent 3 days ago, never
    // acknowledged → BOTH flags. Test 2 acks it in-flight via the By Vendor
    // popover (reachable past draft since 00190 — see header).
    const { data: poA, error: poAErr } = await adminDb
      .from('purchase_orders')
      .insert({
        designer_id: designerId,
        project_id: projectId,
        vendor_id: vendorId,
        vendor_po_number: PO_A_NUMBER,
        payment_pattern: 'net_30',
        total_cents: 150_000,
        status: 'in_production',
        confirmed_eta: etaPastIso,
        sent_at: poASentAt,
      })
      .select('id, created_at')
      .single();
    if (poAErr) throw new Error(`seed PO A failed: ${poAErr.message}`);
    poAId = poA.id as string;
    poACreatedAt = poA.created_at as string;

    // PO-B: shipped, NO confirmed_eta, acknowledged → the Calendar banner
    // row. No linked items (the banner + delivery_events view read POs
    // directly; ffe_item_count 0 renders the bare vendor-name pill).
    const { data: poB, error: poBErr } = await adminDb
      .from('purchase_orders')
      .insert({
        designer_id: designerId,
        project_id: projectId,
        vendor_id: vendorId,
        vendor_po_number: PO_B_NUMBER,
        payment_pattern: 'net_30',
        total_cents: 98_000,
        status: 'shipped',
        confirmed_eta: null,
        sent_at: hoursAgoIso(4 * 24),
        acknowledged_at: hoursAgoIso(2 * 24),
      })
      .select('id')
      .single();
    if (poBErr) throw new Error(`seed PO B failed: ${poBErr.message}`);
    poBId = poB.id as string;

    // PO-C: in production, ETA 10 days out, sent 1 hour ago, unacknowledged
    // → NO flags (48h not elapsed, ETA not past).
    const { data: poC, error: poCErr } = await adminDb
      .from('purchase_orders')
      .insert({
        designer_id: designerId,
        project_id: projectId,
        vendor_id: vendorId,
        vendor_po_number: PO_C_NUMBER,
        payment_pattern: 'net_30',
        total_cents: 75_000,
        status: 'in_production',
        confirmed_eta: localDateIso(10),
        sent_at: hoursAgoIso(1),
      })
      .select('id')
      .single();
    if (poCErr) throw new Error(`seed PO C failed: ${poCErr.message}`);
    poCId = poC.id as string;

    // ── Items. NO po_payments anywhere — test 1 asserts the payment column
    //    tolerates zero rows ("—"). A: seeded at 'production' directly (the
    //    in_production PO's Trigger-A target is also 'production' — an
    //    equal-rank no-op, so the status survives). C: seeded 'approved' —
    //    Trigger A ratchets it to 'production' (asserted in test 1).
    const { error: itemsErr } = await adminDb.from('project_ffe_items').insert([
      {
        project_id: projectId,
        purchase_order_id: poAId,
        name: ITEM_A,
        status: 'production',
        quantity: 1,
        unit_price_cents: 150_000,
        line_total_cents: 150_000,
        sort_order: 0,
      },
      {
        project_id: projectId,
        purchase_order_id: poCId,
        name: ITEM_C,
        status: 'approved',
        quantity: 1,
        unit_price_cents: 75_000,
        line_total_cents: 75_000,
        sort_order: 1,
      },
    ]);
    if (itemsErr) throw new Error(`seed project_ffe_items failed: ${itemsErr.message}`);
  });

  test.afterAll(async () => {
    // FK order: items first, then po_payments → purchase_orders (none are
    // seeded but the ack/ETA paths must never have created any — delete
    // defensively; procurement_notifications CASCADE off POs;
    // purchase_orders.project_id is RESTRICT so POs go before the project),
    // then the project, then the vendor (RESTRICT too). No receiving
    // inspections, invoices, or storage objects exist in this suite. Zero
    // 'E2E EXP%' residue.
    if (projectId) {
      await adminDb.from('project_ffe_items').delete().eq('project_id', projectId);
    }
    const poIds = [poAId, poBId, poCId].filter(Boolean);
    if (poIds.length > 0) {
      await adminDb.from('po_payments').delete().in('purchase_order_id', poIds);
      await adminDb.from('purchase_orders').delete().in('id', poIds);
    }
    if (projectId) {
      await adminDb.from('projects').delete().eq('id', projectId);
    }
    if (vendorId) {
      await adminDb.from('vendors').delete().eq('id', vendorId);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 1: By Status — flag matrix + date columns + zero-payment tolerance
  // ──────────────────────────────────────────────────────────────────────────
  test('overdue + no-ack flags and date columns render truthfully per row', async ({
    authenticatedPage: page,
  }) => {
    // DB preamble: Trigger A ratcheted C's item up to the PO stage, and left
    // A's status alone (in_production maps to 'production' — equal rank).
    const { data: seeded, error } = await adminDb
      .from('project_ffe_items')
      .select('name, status')
      .eq('project_id', projectId);
    if (error) throw error;
    expect(seeded).toHaveLength(2);
    for (const item of seeded!) {
      expect(item.status, `${item.name} should sit at 'production'`).toBe('production');
    }

    await page.goto('/portal/procurement/by-status', { waitUntil: 'networkidle' });

    // Production is the default-open stage — both seeded items are rows.
    const rowA = itemRow(page, ITEM_A);
    const rowC = itemRow(page, ITEM_C);
    await expect(rowA).toBeVisible({ timeout: 20_000 });
    await expect(rowC).toBeVisible();

    // ── PO-A's row: terracotta overdue flag (ETA past, item undelivered;
    // the flag absorbs the countdown badge) + golden-hour no-ack flag
    // (sent 72h ago > the 48h threshold, acknowledged_at NULL).
    await expect(rowA.getByText('overdue', { exact: true })).toBeVisible();
    await expect(
      rowA.getByTitle(/has passed and this item is not delivered/),
    ).toBeVisible();
    await expect(rowA.getByText('no ack', { exact: true })).toBeVisible();
    await expect(
      rowA.getByTitle(
        `Sent ${shortDate(poASentAt)} — no vendor acknowledgment after 48 hours. Consider following up.`,
      ),
    ).toBeVisible();

    // ── PO-C's row: neither flag (48h window not elapsed; ETA in the
    // future). The countdown badge may render — flags must not.
    await expect(rowC.getByText('overdue', { exact: true })).toHaveCount(0);
    await expect(rowC.getByText('no ack', { exact: true })).toHaveCount(0);

    // ── W5-T2 date columns (md+, visible at the 1280px default viewport):
    // Ordered = the PO's creation date; Ack = "—" while unacknowledged.
    const orderedCell = rowA.getByTitle(
      `Purchase order created ${shortDate(poACreatedAt)}`,
    );
    await expect(orderedCell).toBeVisible();
    await expect(orderedCell).toContainText(shortDate(poACreatedAt));
    const ackCell = rowA.getByTitle('Vendor has not acknowledged this order yet');
    await expect(ackCell).toBeVisible();
    await expect(ackCell).toContainText('—');

    // ── Zero-payment tolerance: no po_payments rows exist for these POs —
    // pickHeadlinePayment returns null and the payment column renders the
    // quiet "—" placeholder instead of crashing the row.
    await expect(rowA.getByText('—').first()).toBeVisible();
    await expect(rowC.getByText('—').first()).toBeVisible();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 2: acknowledgment via the By Vendor popover clears the no-ack flag
  // ──────────────────────────────────────────────────────────────────────────
  test('logging acknowledgment clears the no-ack flag; overdue remains', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/portal/procurement/by-vendor', { waitUntil: 'networkidle' });

    // Our vendor's card. Since 00190 the popover renders for EVERY
    // unacknowledged, non-cancelled PO — PO-A and PO-C (both in_production,
    // unacked) each carry a trigger; PO-B already shows its "Ack {date}"
    // meta. Scope the click to PO-A's row (the border-b row div is the
    // only div in the card carrying the PO number — same class-coupled
    // locator convention as itemRow above).
    const card = page.locator('section').filter({ hasText: VENDOR_NAME });
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card.getByRole('button', { name: 'Log acknowledgment' })).toHaveCount(2);
    const poARow = card
      .locator('div[class*="border-b"]')
      .filter({ hasText: PO_A_NUMBER });
    const ackTrigger = poARow.getByRole('button', { name: 'Log acknowledgment' });
    await expect(ackTrigger).toHaveCount(1);
    await ackTrigger.click();

    // Confirm with the inputs untouched: the popover prefills PO # and ETA
    // from the row, so the RPC coalesce writes back the same (still past)
    // ETA — the overdue flag must survive the acknowledgment.
    const popover = page.getByRole('dialog', { name: 'Log vendor acknowledgment' });
    await expect(popover).toBeVisible({ timeout: 10_000 });
    await popover.getByRole('button', { name: 'Confirm acknowledgment' }).click();
    await expect(page.getByText('Acknowledgment logged.')).toBeVisible({
      timeout: 10_000,
    });

    // DB: ack stamped, status UNMOVED (00190 — a late ack never advances or
    // regresses the lifecycle; only draft → confirmed transitions), ETA
    // preserved. The same-status UPDATE never fires the 00184 Trigger B
    // cascade, so the item's 'production' status is untouched too.
    const { data: po, error: poErr } = await adminDb
      .from('purchase_orders')
      .select('status, acknowledged_at, confirmed_eta')
      .eq('id', poAId)
      .single();
    if (poErr) throw poErr;
    expect(po.status).toBe('in_production');
    expect(po.acknowledged_at).not.toBeNull();
    expect(po.confirmed_eta).toBe(etaPastIso);
    const { data: item, error: itemErr } = await adminDb
      .from('project_ffe_items')
      .select('status')
      .eq('purchase_order_id', poAId)
      .single();
    if (itemErr) throw itemErr;
    expect(item.status).toBe('production');

    // By Status reloaded: no-ack gone, overdue still flying, and the Ack
    // date column now carries the stamp.
    await page.goto('/portal/procurement/by-status', { waitUntil: 'networkidle' });
    const rowA = itemRow(page, ITEM_A);
    await expect(rowA).toBeVisible({ timeout: 20_000 });
    await expect(rowA.getByText('overdue', { exact: true })).toBeVisible();
    await expect(rowA.getByText('no ack', { exact: true })).toHaveCount(0);
    await expect(
      rowA.getByTitle(
        `Vendor acknowledged ${shortDate(po.acknowledged_at as string)}`,
      ),
    ).toContainText(shortDate(po.acknowledged_at as string));
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 3: Calendar — unscheduled-shipment banner → Set ETA → grid event
  // ──────────────────────────────────────────────────────────────────────────
  test('unscheduled banner lists the shipped PO; Set ETA schedules it into the grid', async ({
    authenticatedPage: page,
  }) => {
    const tomorrowIso = localDateIso(1);

    await page.goto('/portal/procurement/calendar', { waitUntil: 'networkidle' });

    // Banner: PO-B is the only shipped PO without a confirmed_eta (every
    // dev-seed shipped PO carries one), so the count is exactly 1.
    const bannerHeading = page.getByRole('heading', {
      name: '1 shipped order has no delivery date',
    });
    await expect(bannerHeading).toBeVisible({ timeout: 20_000 });
    const banner = page.locator('section').filter({ has: bannerHeading });
    await expect(banner.getByText(VENDOR_NAME)).toBeVisible();
    await expect(banner.getByText(PO_B_NUMBER)).toBeVisible();
    await expect(banner.getByText(PROJECT_NAME)).toBeVisible();

    // The grid has no event for THIS PO yet (its event_date is NULL — the
    // pill we assert after the save, titled "{project} · {tomorrow}", must
    // not exist). PO-C's future ETA puts its own pill on the grid already,
    // so the vendor name itself is not unique to the banner.
    await expect(page.getByTitle(`${PROJECT_NAME} · ${tomorrowIso}`)).toHaveCount(0);

    // Set ETA → quick-edit drawer (same EtaQuickEditDrawer as By Status).
    await banner.getByRole('button', { name: 'Set ETA' }).click();
    const drawer = page.getByRole('dialog', {
      name: `Update ETA for PO ${PO_B_NUMBER}`,
    });
    await expect(drawer).toBeVisible({ timeout: 10_000 });
    await drawer.getByLabel('New ETA').fill(tomorrowIso);
    await drawer.getByRole('button', { name: 'Save new ETA' }).click();

    // Toast prefix only — the drawer's long-date label renders the bare
    // YYYY-MM-DD through the local timezone, so the displayed day can sit
    // one off from the ISO string; the DB assertion below owns the value.
    await expect(
      page.getByText(new RegExp(`ETA updated for PO ${PO_B_NUMBER}`)),
    ).toBeVisible({ timeout: 15_000 });

    const { data: poB, error: poBErr } = await adminDb
      .from('purchase_orders')
      .select('confirmed_eta, status')
      .eq('id', poBId)
      .single();
    if (poBErr) throw poBErr;
    expect(poB.confirmed_eta).toBe(tomorrowIso);
    expect(poB.status).toBe('shipped'); // ETA edit never touches status

    // The mutation invalidates ['purchase-orders'] AND ['delivery-calendar']:
    // the banner empties (PO-B was its only row, so the whole section
    // unmounts)…
    await expect(
      page.getByRole('heading', { name: /shipped order.* no delivery date/ }),
    ).toHaveCount(0, { timeout: 15_000 });

    // …and the grid gains the delivery event: a sage pill titled
    // "{project} · {event_date}" whose text is the vendor name (no linked
    // items → no "· N items" suffix; not received → no ✓ prefix).
    const pill = page.getByTitle(`${PROJECT_NAME} · ${tomorrowIso}`);
    await expect(pill).toBeVisible({ timeout: 15_000 });
    await expect(pill).toHaveText(VENDOR_NAME);
  });
});
