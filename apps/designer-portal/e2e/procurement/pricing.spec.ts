/**
 * End-to-end spec: FF&E dual pricing (W2-T4 — migration 00185).
 *
 *   seed one project + three FF&E items (fixed w/ trade+markup, fixed w/o
 *   trade, allowance w/ trade) → owner-only "Margin $X" card labels render
 *   on fixed+trade items ONLY → the drawer pricing editor derives the client
 *   price from trade × (1 + markup/100), and Save persists
 *   trade_price_cents / markup_percent / unit_price_cents with line_total
 *   recomputed (qty × client) → the project Financials panel shows the
 *   owner-gated Margin row "$X (Y% of client total)" with the
 *   "(n of m items have trade cost)" qualifier for partial coverage →
 *   revoking studio_owner hides every margin surface on a fresh load.
 *
 * One serial describe block; ids shared via module closure (same convention
 * as by-status-filters.spec.ts). All DB seeding/assertions go through the
 * service-role adminDb client.
 *
 * ROLE SNAPSHOT/RESTORE: useIsStudioOwner gates every margin surface, and a
 * dev DB may legitimately already carry a manual studio_owner grant for
 * designer@patina.dev (it does at the time of writing — granted for visual
 * QA). beforeAll SNAPSHOTS whether the grant exists, ensures it for tests
 * 1–3, test 4 revokes/re-grants around its non-owner assertions, and
 * afterAll restores the exact snapshotted state (deletes the grant ONLY if
 * it wasn't there before).
 *
 * LOCAL RUN CONSTRAINT: serial is intra-file only; for deterministic local
 * runs use --project=chromium --workers=1 to prevent cross-file parallelism
 * from interleaving DB state with other suites. (Test 4 flips a USER-level
 * role, which would also blind concurrently running owner-gated suites.)
 *
 * Requires:
 *   - Local Supabase running with seed data (designer@patina.dev)
 *   - Designer portal at :3000 (playwright webServer config; a reused server
 *     must have been started with NEXT_PUBLIC_FLAG_OVERRIDES set — see
 *     by-status-filters.spec.ts)
 *   - SUPABASE_SERVICE_ROLE_KEY in apps/designer-portal/.env.local
 */

import { test, expect } from '../fixtures/auth';
import { adminDb, getUserIdByEmail } from '../helpers/supabase-admin';

// Unique names for everything we seed (prefix E2E PRC for cleanup).
const PROJECT_NAME = 'E2E PRC Project';
const ITEM_A = 'E2E PRC Sofa A'; // fixed, trade + markup set
const ITEM_B = 'E2E PRC Lamp B'; // fixed, NO trade (NULL/NULL)
const ITEM_C = 'E2E PRC Rug Allowance C'; // allowance, trade set

// Module-level shared state (safe because describe.serial is sequential).
let designerId: string;
let projectId: string;
let itemAId: string;
let itemBId: string;
let itemCId: string;
let studioOwnerRoleId: string;
let hadStudioOwnerBefore: boolean;

// ─── Expected-value helpers ─────────────────────────────────────────────────
// Replicas of the production formatters (ffe/page.tsx + financials-panel.tsx)
// so the spec computes expected strings from actual DB state instead of
// hand-waving at hard-coded UI text.

function formatDollars(cents: number): string {
  return `$${((cents || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function formatSignedDollars(cents: number): string {
  return cents < 0 ? `-${formatDollars(Math.abs(cents))}` : formatDollars(cents);
}

interface PricingRow {
  trade_price_cents: number | null;
  quantity: number | null;
  line_total_cents: number | null;
}

/** Mirrors useProjectFinancials' margin rollup (trade-priced subset only). */
function computeMarginRollup(rows: PricingRow[]) {
  let marginCents = 0;
  let tradeTotalCents = 0;
  let itemsWithTradeCount = 0;
  for (const row of rows) {
    if (row.trade_price_cents === null || row.trade_price_cents === undefined) continue;
    const tradeLine = row.trade_price_cents * (row.quantity ?? 1);
    tradeTotalCents += tradeLine;
    marginCents += (row.line_total_cents || 0) - tradeLine;
    itemsWithTradeCount += 1;
  }
  return { marginCents, tradeTotalCents, itemsWithTradeCount, totalItemCount: rows.length };
}

/** Mirrors financials-panel.tsx marginValueLabel. */
function expectedMarginValueLabel(marginCents: number, tradeTotalCents: number): string {
  const clientTotalCents = marginCents + tradeTotalCents;
  if (clientTotalCents <= 0) return formatSignedDollars(marginCents);
  const pct = Math.round((marginCents / clientTotalCents) * 100);
  return `${formatSignedDollars(marginCents)} (${pct}% of client total)`;
}

async function fetchSeededPricingRows(): Promise<PricingRow[]> {
  const { data, error } = await adminDb
    .from('project_ffe_items')
    .select('name, trade_price_cents, quantity, line_total_cents')
    .eq('project_id', projectId);
  if (error) throw error;
  return data ?? [];
}

// Idempotent grant/revoke against the UNIQUE (user_id, role_id) constraint.
async function grantStudioOwner(): Promise<void> {
  const { error } = await adminDb
    .from('user_roles')
    .upsert(
      { user_id: designerId, role_id: studioOwnerRoleId },
      { onConflict: 'user_id,role_id', ignoreDuplicates: true },
    );
  if (error) throw new Error(`grant studio_owner failed: ${error.message}`);
}

async function revokeStudioOwner(): Promise<void> {
  const { error } = await adminDb
    .from('user_roles')
    .delete()
    .eq('user_id', designerId)
    .eq('role_id', studioOwnerRoleId);
  if (error) throw new Error(`revoke studio_owner failed: ${error.message}`);
}

test.describe.serial('ffe dual pricing: card margins + drawer editor + financials row + owner gating', () => {
  test.beforeAll(async () => {
    designerId = await getUserIdByEmail('designer@patina.dev');

    // ── Role snapshot, then ensure granted for tests 1–3 ──────────────────
    const { data: role, error: roleErr } = await adminDb
      .from('roles')
      .select('id')
      .eq('name', 'studio_owner')
      .single();
    if (roleErr || !role) {
      throw new Error(`studio_owner role lookup failed: ${roleErr?.message ?? 'not found'}`);
    }
    studioOwnerRoleId = role.id as string;

    const { data: existingGrant, error: grantReadErr } = await adminDb
      .from('user_roles')
      .select('id')
      .eq('user_id', designerId)
      .eq('role_id', studioOwnerRoleId)
      .maybeSingle();
    if (grantReadErr) throw new Error(`role snapshot failed: ${grantReadErr.message}`);
    hadStudioOwnerBefore = !!existingGrant;
    await grantStudioOwner();

    // ── Project ───────────────────────────────────────────────────────────
    const { data: proj, error: projErr } = await adminDb
      .from('projects')
      .insert({
        name: PROJECT_NAME,
        designer_id: designerId,
        created_by: designerId,
        status: 'active',
        notes: 'E2E PRC seed — safe to delete.',
      })
      .select('id')
      .single();
    if (projErr) throw new Error(`seed project failed: ${projErr.message}`);
    projectId = proj.id as string;

    // ── FF&E items (status 'specified'; no PO link → no 00184 ratchet) ────
    //  A: fixed WITH trade+markup. client $1,000 × qty 2 = $2,000 line;
    //     trade $800 × 2 = $1,600 → margin 40_000¢ = $400.
    //  B: fixed WITHOUT trade (NULL/NULL) — the drawer-save target.
    //  C: allowance WITH trade set — card margin label must still be absent
    //     (allowance line totals are budget midpoints, not unit × qty).
    const { data: seededItems, error: itemsErr } = await adminDb
      .from('project_ffe_items')
      .insert([
        {
          project_id: projectId,
          name: ITEM_A,
          item_type: 'fixed',
          status: 'specified',
          quantity: 2,
          unit_price_cents: 100_000,
          trade_price_cents: 80_000,
          markup_percent: 25,
          line_total_cents: 200_000,
          sort_order: 0,
        },
        {
          project_id: projectId,
          name: ITEM_B,
          item_type: 'fixed',
          status: 'specified',
          quantity: 1,
          unit_price_cents: 45_000,
          trade_price_cents: null,
          markup_percent: null,
          line_total_cents: 45_000,
          sort_order: 1,
        },
        {
          project_id: projectId,
          name: ITEM_C,
          item_type: 'allowance',
          status: 'specified',
          quantity: 1,
          unit_price_cents: 0,
          trade_price_cents: 20_000,
          markup_percent: null,
          line_total_cents: 150_000, // budget midpoint
          budget_min_cents: 100_000,
          budget_max_cents: 200_000,
          sort_order: 2,
        },
      ])
      .select('id, name');
    if (itemsErr) throw new Error(`seed project_ffe_items failed: ${itemsErr.message}`);
    const byName = new Map((seededItems ?? []).map((it) => [it.name as string, it.id as string]));
    itemAId = byName.get(ITEM_A)!;
    itemBId = byName.get(ITEM_B)!;
    itemCId = byName.get(ITEM_C)!;
    if (!itemAId || !itemBId || !itemCId) throw new Error('seeded item ids missing');
  });

  test.afterAll(async () => {
    // Items first (no FK forces it, but explicit beats implicit), then the
    // project — zero 'E2E PRC%' residue.
    if (projectId) {
      await adminDb.from('project_ffe_items').delete().eq('project_id', projectId);
      await adminDb.from('projects').delete().eq('id', projectId);
    }
    // Restore the role EXACTLY as snapshotted. Re-granting (not just deleting
    // when absent before) also repairs the state if test 4 failed between its
    // revoke and re-grant.
    if (designerId && studioOwnerRoleId) {
      if (hadStudioOwnerBefore) {
        await grantStudioOwner();
      } else {
        await revokeStudioOwner();
      }
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 1: card "Margin $X" labels — owner + fixed + trade set ONLY
  // ──────────────────────────────────────────────────────────────────────────
  test('card margin labels render on fixed items with trade cost only', async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/portal/projects/${projectId}/ffe`, { waitUntil: 'networkidle' });

    // Board loaded — all three seeded cards visible.
    await expect(page.getByText(ITEM_A)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(ITEM_B)).toBeVisible();
    await expect(page.getByText(ITEM_C)).toBeVisible();

    // Item A: margin = line_total − trade × qty = 200_000 − 80_000×2
    //       = 40_000¢ → label "Margin $400" (formatSignedDollars, no decimals).
    // The label appears after the async roles query resolves isStudioOwner.
    await expect(page.getByText('Margin $400', { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    // …and it is the ONLY margin label on the board: B has no trade cost and
    // C is an allowance (midpoint line total — margin formula meaningless).
    // Card labels are "Margin $X" (no colon — the drawer readout uses one).
    await expect(page.getByText(/^Margin \$/)).toHaveCount(1);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 2: drawer editor — client derivation + Save persists dual pricing
  // ──────────────────────────────────────────────────────────────────────────
  test('drawer pricing editor derives client price and saves to the DB', async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/portal/projects/${projectId}/ffe`, { waitUntil: 'networkidle' });
    await expect(page.getByText(ITEM_B)).toBeVisible({ timeout: 20_000 });

    // Open item B's drawer (card click navigates to ?item=<id>).
    await page.getByText(ITEM_B).click();
    await expect(page.getByText('Item Detail')).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(new RegExp(`item=${itemBId}`));

    // Seeded state: trade/markup empty (NULL), client $450.
    const tradeInput = page.getByLabel('Trade price', { exact: true });
    const markupInput = page.getByLabel('Markup percent', { exact: true });
    const clientInput = page.getByLabel('Client price', { exact: true });
    await expect(tradeInput).toHaveValue('');
    await expect(clientInput).toHaveValue('450');

    // Type Trade 500 → no derivation yet (markup still empty)…
    await tradeInput.fill('500');
    await expect(clientInput).toHaveValue('450');
    // …then Markup 20 → client auto-derives 500 × 1.20 = 600.
    await markupInput.fill('20');
    await expect(clientInput).toHaveValue('600');

    // Owner margin readout: (600 − 500) × qty 1 = $100; 100/600 → 17%.
    await expect(page.getByText('Margin: $100 · 17%')).toBeVisible();

    // Save → success toast (mutation awaited before the toast fires, so the
    // DB write is committed once it shows).
    await page.getByRole('button', { name: 'Save pricing' }).click();
    await expect(page.getByText('Pricing updated')).toBeVisible({ timeout: 10_000 });

    // DB: trade 50_000¢, markup 20, client 60_000¢, line_total recomputed
    // qty(1) × 60_000.
    const { data: row, error } = await adminDb
      .from('project_ffe_items')
      .select('trade_price_cents, markup_percent, unit_price_cents, line_total_cents, quantity')
      .eq('id', itemBId)
      .single();
    if (error) throw error;
    expect(row.trade_price_cents).toBe(50_000);
    expect(Number(row.markup_percent)).toBe(20);
    expect(row.unit_price_cents).toBe(60_000);
    expect(row.quantity).toBe(1);
    expect(row.line_total_cents).toBe(60_000);

    // UI reflects the save: B is now trade-priced, so its card (behind the
    // drawer) gains "Margin $100" after the invalidation refetch — and the
    // Save button disarms (payload no longer dirty).
    await expect(page.getByText('Margin $100', { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('button', { name: 'Save pricing' })).toBeDisabled();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 3: financials Margin row — total + "(n of m items have trade cost)"
  // ──────────────────────────────────────────────────────────────────────────
  test('financials panel shows the margin row with the coverage qualifier', async ({
    authenticatedPage: page,
  }) => {
    // Post-save state (test 2 gave B a trade cost): ALL THREE items are now
    // trade-priced, so compute from actual DB rows:
    //   A: 200_000 − 160_000 = 40_000   B: 60_000 − 50_000 = 10_000
    //   C: 150_000 −  20_000 = 130_000  (allowance rows DO roll up here)
    //   margin 180_000¢, trade 230_000¢ → "$1,800 (44% of client total)"
    const fullRows = await fetchSeededPricingRows();
    expect(fullRows).toHaveLength(3);
    const full = computeMarginRollup(fullRows);
    expect(full.itemsWithTradeCount).toBe(3); // a, b, c all have trade post test 2
    const fullLabel = expectedMarginValueLabel(full.marginCents, full.tradeTotalCents);
    expect(fullLabel).toBe('$1,800 (44% of client total)');

    await page.goto(`/portal/projects/${projectId}`, { waitUntil: 'networkidle' });
    await expect(page.getByText('Margin', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(fullLabel)).toBeVisible();
    // Full coverage (3 of 3) → the qualifier must NOT render.
    await expect(page.getByText(/items have trade cost/)).toHaveCount(0);

    // Partial coverage: clear the allowance item's trade cost (2 of 3) and
    // reload — a fresh document resets the React Query cache, so the roles +
    // financials queries refetch (no staleTime to wait out).
    const { error: clearErr } = await adminDb
      .from('project_ffe_items')
      .update({ trade_price_cents: null, markup_percent: null })
      .eq('id', itemCId);
    if (clearErr) throw clearErr;

    const partialRows = await fetchSeededPricingRows();
    const partial = computeMarginRollup(partialRows);
    expect(partial.itemsWithTradeCount).toBe(2);
    const partialLabel = expectedMarginValueLabel(partial.marginCents, partial.tradeTotalCents);
    // A 40_000 + B 10_000 = 50_000¢ margin over 210_000¢ trade → 50/260 ≈ 19%.
    expect(partialLabel).toBe('$500 (19% of client total)');

    await page.goto(`/portal/projects/${projectId}`, { waitUntil: 'networkidle' });
    await expect(page.getByText('Margin', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(partialLabel)).toBeVisible();
    await expect(page.getByText('(2 of 3 items have trade cost)')).toBeVisible();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 4: non-owner — every margin surface hidden (not disabled)
  // ──────────────────────────────────────────────────────────────────────────
  test('revoking studio_owner hides margin labels on a fresh load', async ({
    authenticatedPage: page,
  }) => {
    await revokeStudioOwner();
    try {
      // Fresh full page load (goto → new document → new QueryClient), so
      // useUserRoles refetches and useIsStudioOwner resolves false.
      await page.goto(`/portal/projects/${projectId}/ffe`, { waitUntil: 'networkidle' });

      // Board fully rendered: card A with its line total is up…
      await expect(page.getByText(ITEM_A)).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText('$2,000').first()).toBeVisible();

      // …but no card carries a margin label (A and B still have trade costs
      // in the DB — the labels are owner-gated, hidden not disabled).
      await expect(page.getByText(/^Margin \$/)).toHaveCount(0);

      // The financials Margin row disappears for non-owners too.
      await page.goto(`/portal/projects/${projectId}`, { waitUntil: 'networkidle' });
      await expect(page.getByRole('heading', { name: 'Financials' })).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByText('Margin', { exact: true })).toHaveCount(0);
      await expect(page.getByText(/items have trade cost/)).toHaveCount(0);
    } finally {
      // Back to the granted state tests 1–3 ran under; afterAll then restores
      // the original snapshot (which may or may not include the grant).
      await grantStudioOwner();
    }
  });
});
