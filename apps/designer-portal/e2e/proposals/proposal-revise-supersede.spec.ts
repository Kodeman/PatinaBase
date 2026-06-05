/**
 * End-to-end spec: the revise → supersede pipeline (00176).
 *
 * Covers the previously dead-ended "edit a sent proposal" path:
 *   create + link client → seed FULL scope (every child table) → send v1 →
 *   client views v1 → designer clicks Revise on the tracking page (the old
 *   "Edit Proposal" bounce bug) → revision summary → Open Editor creates a
 *   draft v2 via the atomic clone_proposal RPC (asserting EVERY child table
 *   cloned) → send v2 (send_proposal RPC supersedes v1: sent/viewed →
 *   'revised') → v1 vanishes from the client's pending list and its sign API
 *   returns 409 → client signs v2 → designer activates v2 as a project.
 *
 * Mirrors proposal-client-sign.spec.ts: same auth fixture, client-portal
 * sign-in helper, service-role seeding, KEEP_TEST_PROPOSAL convention, and
 * isolated browser contexts for client steps (the :3000/:3002 localhost
 * Supabase cookie collision).
 *
 * Requires:
 *   - Local Supabase running with seed data + migration 00176 applied
 *   - Designer portal at :3000, client portal at :3002
 *   - SUPABASE_SERVICE_ROLE_KEY in apps/designer-portal/.env.local
 */

import { test, expect } from '../fixtures/auth';
import {
  adminDb,
  countByProposal,
  countByProject,
  countDeliverablesByProposal,
  countGatesByProposal,
  countSwatchesByProposal,
  deleteProposalCascade,
  getDesignerClient,
  getProjectByProposal,
  getProposal,
  getProposalVersions,
  insertAllowanceItem,
  insertChangeOrderTerms,
  insertExclusion,
  insertPaymentMilestone,
  insertPalette,
  insertPhaseDeliverable,
  insertPhaseGate,
  insertProposalPhase,
  insertScopeRoom,
  insertSwatch,
  insertTeamMember,
  setDesignerClientStatus,
  setProposalTotals,
} from '../helpers/supabase-admin';

// Deterministic dev-seed UUIDs — see supabase/seed/dev-accounts.sql.
const DEV_DESIGNER_ID = 'a0000000-0000-0000-0000-000000000004';
const DEV_CLIENT_ID = 'a0000000-0000-0000-0000-000000000005';

const CLIENT_BASE_URL = process.env.CLIENT_PORTAL_URL ?? 'http://localhost:3002';
const CLIENT_EMAIL = process.env.CLIENT_E2E_EMAIL ?? 'client@patina.dev';
const CLIENT_PASSWORD = process.env.CLIENT_E2E_PASSWORD ?? 'password123';

// Scope money (CENTS) — mirrors proposal-client-sign.spec.ts.
const ALLOWANCE_MIN_CENTS = 400_000;
const ALLOWANCE_MAX_CENTS = 600_000;
const ALLOWANCE_MID_CENTS = Math.round((ALLOWANCE_MIN_CENTS + ALLOWANCE_MAX_CENTS) / 2);
const PHASE_FEE_CENTS = 250_000;
const TOTAL_CENTS = ALLOWANCE_MID_CENTS + PHASE_FEE_CENTS;

// Tables countable by proposal_id directly (clone-completeness assertion set).
const PROPOSAL_CHILD_TABLES = [
  'proposal_sections',
  'proposal_items',
  'proposal_scope_rooms',
  'proposal_phases',
  'proposal_payment_milestones',
  'proposal_exclusions',
  'proposal_change_order_terms',
  'proposal_team_members',
  'proposal_palettes',
] as const;

// Module-level shared state (safe because describe.serial is sequential).
let v1Id: string;
let v2Id: string;

async function signInClientPortal(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(`${CLIENT_BASE_URL}/auth/signin?callbackUrl=%2Fproposals`, {
    timeout: 30_000,
    waitUntil: 'networkidle',
  });

  if (!page.url().includes('/auth/signin')) return;

  const disclosure = page.getByRole('button', { name: /sign in with email/i });
  await disclosure.waitFor({ state: 'visible', timeout: 15_000 });
  await disclosure.click();

  const emailInput = page.getByLabel(/email address/i).first();
  await emailInput.waitFor({ state: 'visible', timeout: 10_000 });
  await emailInput.fill(CLIENT_EMAIL);

  const passwordInput = page.getByLabel(/password/i).first();
  await passwordInput.fill(CLIENT_PASSWORD);

  await page.getByRole('button', { name: /^sign in$/i }).click();

  await page.waitForURL(
    /\/(proposals|projects|today|inbox|messages|decisions|orders|scans|account|preferences)/,
    { timeout: 60_000 },
  );
}

test.describe.serial('proposal revise → supersede → sign v2 → activate', () => {
  // ────────────────────────────────────────────────────────────────────────
  // Step 1: Create v1 from template with a linked client
  // ────────────────────────────────────────────────────────────────────────
  test('create v1 from template with linked client', async ({ authenticatedPage: page }) => {
    test.setTimeout(90_000);
    await page.goto('/portal/proposals/new', { waitUntil: 'networkidle' });

    const firstTemplate = page.getByTestId('proposal-template-card').first();
    await firstTemplate.waitFor({ state: 'visible', timeout: 20_000 });
    await firstTemplate.click();

    await page.getByTestId('client-picker-trigger').click();
    const search = page.getByTestId('client-picker-search');
    await search.waitFor({ state: 'visible', timeout: 10_000 });
    await search.fill('client');

    const clientOption = page.getByTestId(`client-picker-option-${DEV_CLIENT_ID}`);
    await clientOption.waitFor({ state: 'visible', timeout: 10_000 });
    await clientOption.click();

    const createBtn = page.getByRole('button', { name: /create proposal/i });
    await createBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await createBtn.click();

    await page.waitForURL(/\/portal\/proposals\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    v1Id = page.url().match(/\/portal\/proposals\/([0-9a-f-]{36})$/)![1];

    const proposal = await getProposal(v1Id);
    expect(proposal.status).toBe('draft');
    expect(proposal.client_id).toBe(DEV_CLIENT_ID);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 2: Seed EVERY child-table type so the clone-completeness assertion
  // in Step 5 is meaningful for all 12 tables (not vacuously 0 === 0).
  // ────────────────────────────────────────────────────────────────────────
  test('seed full scope across all child tables', async () => {
    const room = await insertScopeRoom({
      proposalId: v1Id,
      name: 'Living Room',
      roomType: 'living_room',
      budgetCents: ALLOWANCE_MID_CENTS,
      sortOrder: 0,
    });

    await insertAllowanceItem({
      proposalId: v1Id,
      name: 'Seating allowance',
      budgetMinCents: ALLOWANCE_MIN_CENTS,
      budgetMaxCents: ALLOWANCE_MAX_CENTS,
      ffeCategory: 'seating',
      scopeRoomId: room.id,
      position: 0,
    });

    const phase = await insertProposalPhase({
      proposalId: v1Id,
      name: 'Design & Procurement',
      feeCents: PHASE_FEE_CENTS,
      durationWeeks: 4,
      phaseKey: 'design',
      sortOrder: 0,
    });
    await insertPhaseDeliverable({ phaseId: phase.id, label: 'Concept boards' });
    await insertPhaseGate({ phaseId: phase.id, gateKind: 'client_signature' });

    for (const m of [
      { label: 'Engagement deposit', percentage: 40, sortOrder: 0, trigger: 'On signing' },
      { label: 'Procurement', percentage: 35, sortOrder: 1, trigger: 'Order placement' },
      { label: 'Final installation', percentage: 25, sortOrder: 2, trigger: 'On completion' },
    ]) {
      await insertPaymentMilestone({
        proposalId: v1Id,
        label: m.label,
        percentage: m.percentage,
        amountCents: Math.round((TOTAL_CENTS * m.percentage) / 100),
        triggerCondition: m.trigger,
        phaseId: phase.id,
        sortOrder: m.sortOrder,
      });
    }

    await insertExclusion({ proposalId: v1Id, description: 'No structural work' });
    await insertChangeOrderTerms({
      proposalId: v1Id,
      processDescription: 'Written approval required for scope changes.',
      hourlyRateCents: 15_000,
    });
    await insertTeamMember({ proposalId: v1Id, userId: DEV_CLIENT_ID, role: 'client' });

    const palette = await insertPalette({
      proposalId: v1Id,
      name: 'Warm clay',
      scopeRoomId: room.id,
      isPrimary: true,
    });
    await insertSwatch({ paletteId: palette.id, hex: '#C47C5C', name: 'Clay' });

    await setProposalTotals(v1Id, {
      subtotalCents: TOTAL_CENTS,
      totalAmountCents: TOTAL_CENTS,
    });

    // Sanity: every directly-countable child table has rows.
    for (const table of PROPOSAL_CHILD_TABLES) {
      expect(
        await countByProposal(table, v1Id),
        `${table} should have seeded rows`,
      ).toBeGreaterThanOrEqual(1);
    }
    expect(await countDeliverablesByProposal(v1Id)).toBe(1);
    expect(await countGatesByProposal(v1Id)).toBe(1);
    expect(await countSwatchesByProposal(v1Id)).toBe(1);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 3: Send v1 via the send page UI
  // ────────────────────────────────────────────────────────────────────────
  test('send v1', async ({ authenticatedPage: page }) => {
    await page.goto(`/portal/proposals/${v1Id}/send`, { waitUntil: 'networkidle' });

    await page.getByRole('button', { name: /send to a different address/i }).click();
    const recipientInput = page.locator('#proposal-send-recipient');
    await recipientInput.waitFor({ state: 'visible', timeout: 10_000 });
    await recipientInput.fill(CLIENT_EMAIL);

    const sendBtn = page.getByRole('button', { name: /send proposal/i });
    await expect(sendBtn).toBeEnabled();
    await sendBtn.click();

    await page.waitForURL((url) => !url.pathname.includes('/send'), { timeout: 30_000 });

    const sent = await getProposal(v1Id);
    expect(sent.status).toBe('sent');
    expect(sent.sent_at).not.toBeNull();
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 4: Client views v1 (proves v1 is client-visible BEFORE supersede,
  // and flips it to 'viewed' so the supersede covers the viewed→revised arm)
  // ────────────────────────────────────────────────────────────────────────
  test('client views v1', async ({ authenticatedPage: _designerPage, browser }) => {
    test.setTimeout(120_000);
    const clientContext = await browser.newContext({ storageState: undefined });
    const clientPage = await clientContext.newPage();

    try {
      await signInClientPortal(clientPage);
      await clientPage.goto(`${CLIENT_BASE_URL}/proposals/${v1Id}`, {
        waitUntil: 'networkidle',
        timeout: 30_000,
      });

      const titleHeading = clientPage.locator('h1').first();
      await titleHeading.waitFor({ state: 'visible', timeout: 20_000 });

      // The sent→viewed transition is async client-side; poll briefly.
      await expect
        .poll(async () => (await getProposal(v1Id)).status, { timeout: 10_000 })
        .toBe('viewed');
    } finally {
      await clientContext.close();
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 5: Designer revises v1 — THE original bug path. Tracking page's
  // action must land on /revise (not bounce back), and Open Editor must
  // produce a fully-cloned draft v2.
  // ────────────────────────────────────────────────────────────────────────
  test('designer revises v1 → fully-cloned draft v2', async ({ authenticatedPage: page }) => {
    test.setTimeout(120_000);

    await page.goto(`/portal/proposals/${v1Id}/tracking`, { waitUntil: 'networkidle' });

    const reviseBtn = page.getByRole('button', { name: /^revise$/i });
    await reviseBtn.waitFor({ state: 'visible', timeout: 15_000 });
    await reviseBtn.click();

    // Regression guard for the reported bug: we land on /revise and STAY there
    // (the old "Edit Proposal" button bounced editor → tracking).
    await page.waitForURL(new RegExp(`/portal/proposals/${v1Id}/revise$`), {
      timeout: 30_000,
    });
    await expect(page.getByRole('heading', { name: /revise proposal/i })).toBeVisible({
      timeout: 15_000,
    });

    // v1 is now status='revised' (pulled from client actionability).
    await expect
      .poll(async () => (await getProposal(v1Id)).status, { timeout: 10_000 })
      .toBe('revised');

    await page
      .getByPlaceholder(/describe what changed/i)
      .fill('Swapped seating allowance for client-requested alternates.');

    await page.getByRole('button', { name: /open editor/i }).click();

    // Lands on the NEW draft's editor (a different uuid).
    await page.waitForURL(
      (url) =>
        /\/portal\/proposals\/[0-9a-f-]{36}$/.test(url.pathname) &&
        !url.pathname.includes(v1Id),
      { timeout: 30_000 },
    );
    v2Id = page.url().match(/\/portal\/proposals\/([0-9a-f-]{36})$/)![1];

    // ── Header assertions ──
    const v2 = await getProposal(v2Id);
    expect(v2.status).toBe('draft');
    expect(v2.version).toBe(2);
    expect(v2.parent_proposal_id).toBe(v1Id);
    expect(v2.client_id, 'clone carries the client link').toBe(DEV_CLIENT_ID);
    expect(v2.project_id, 'a fresh draft is never pre-linked to a project').toBeNull();
    expect(v2.revision_summary).toContain('Swapped seating allowance');
    expect(v2.sent_at).toBeNull();
    expect(v2.total_amount).toBe(TOTAL_CENTS);

    // ── Clone completeness: EVERY child table copied (the old TS clone only
    // copied sections + items, silently dropping the other nine) ──
    for (const table of PROPOSAL_CHILD_TABLES) {
      const srcCount = await countByProposal(table, v1Id);
      const newCount = await countByProposal(table, v2Id);
      expect(newCount, `${table}: clone count must match source`).toBe(srcCount);
      expect(newCount, `${table}: clone must be non-empty`).toBeGreaterThanOrEqual(1);
    }
    expect(await countDeliverablesByProposal(v2Id), 'phase deliverables cloned').toBe(1);
    expect(await countGatesByProposal(v2Id), 'phase gates cloned').toBe(1);
    expect(await countSwatchesByProposal(v2Id), 'palette swatches cloned').toBe(1);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 6: Send v2 — send_proposal must atomically supersede v1.
  // Reset v1 to 'viewed' first so the supersede assertion is NOT vacuous
  // (the Revise click already set it to 'revised').
  // ────────────────────────────────────────────────────────────────────────
  test('send v2 supersedes v1 (viewed → revised)', async ({ authenticatedPage: page }) => {
    await adminDb.from('proposals').update({ status: 'viewed' }).eq('id', v1Id);
    expect((await getProposal(v1Id)).status).toBe('viewed');

    await page.goto(`/portal/proposals/${v2Id}/send`, { waitUntil: 'networkidle' });

    await page.getByRole('button', { name: /send to a different address/i }).click();
    const recipientInput = page.locator('#proposal-send-recipient');
    await recipientInput.waitFor({ state: 'visible', timeout: 10_000 });
    await recipientInput.fill(CLIENT_EMAIL);

    const sendBtn = page.getByRole('button', { name: /send proposal/i });
    await expect(sendBtn).toBeEnabled();
    await sendBtn.click();

    await page.waitForURL((url) => !url.pathname.includes('/send'), { timeout: 30_000 });

    // The RPC's two updates are one transaction: v2 sent, v1 superseded.
    const v2 = await getProposal(v2Id);
    expect(v2.status).toBe('sent');
    expect(v2.sent_at).not.toBeNull();

    const v1 = await getProposal(v1Id);
    expect(v1.status, 'sending v2 must supersede the viewed v1').toBe('revised');

    const chain = await getProposalVersions(v1Id);
    expect(chain.map((v) => `${v.version}:${v.status}`)).toEqual(['1:revised', '2:sent']);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 7: The stale version is dead to the client — hidden from the
  // pending list, and the sign API returns 409.
  // ────────────────────────────────────────────────────────────────────────
  test('client cannot see or sign superseded v1', async ({
    authenticatedPage: _designerPage,
    browser,
  }) => {
    test.setTimeout(120_000);
    const clientContext = await browser.newContext({ storageState: undefined });
    const clientPage = await clientContext.newPage();

    try {
      await signInClientPortal(clientPage);

      await clientPage.goto(`${CLIENT_BASE_URL}/proposals`, {
        waitUntil: 'networkidle',
        timeout: 30_000,
      });

      // v2 is pending; v1 (revised) is in NO bucket — fully hidden.
      await expect(
        clientPage.locator(`a[href*="${v2Id}"]`).first(),
        'v2 should appear in the client proposals list',
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        clientPage.locator(`a[href*="${v1Id}"]`),
        'superseded v1 must be hidden from the client list',
      ).toHaveCount(0);

      // Sign API hard-rejects the stale version (status 'revised' ∉ sent/viewed).
      const res = await clientPage.request.post(
        `${CLIENT_BASE_URL}/api/proposals/${v1Id}/sign`,
        { data: { signedByName: 'Test Client' } },
      );
      expect(res.status(), 'stale-version sign attempt must 409').toBe(409);
      expect((await res.json()).error).toBe('not_signable');

      // v1 untouched by the attempt.
      const v1 = await getProposal(v1Id);
      expect(v1.status).toBe('revised');
      expect(v1.signed_at).toBeNull();
    } finally {
      await clientContext.close();
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 8: Client signs v2
  // ────────────────────────────────────────────────────────────────────────
  test('client signs v2', async ({ authenticatedPage: _designerPage, browser }) => {
    test.setTimeout(120_000);
    const clientContext = await browser.newContext({ storageState: undefined });
    const clientPage = await clientContext.newPage();

    try {
      await signInClientPortal(clientPage);

      await clientPage.goto(`${CLIENT_BASE_URL}/proposals/${v2Id}/sign`, {
        waitUntil: 'networkidle',
        timeout: 30_000,
      });

      const nameInput = clientPage.locator('#signed-name');
      await nameInput.waitFor({ state: 'visible', timeout: 20_000 });
      await nameInput.fill('Test Client');

      await clientPage.locator('input[type="checkbox"]').first().check();
      await clientPage.getByRole('button', { name: /sign and accept/i }).click();

      await clientPage.waitForURL(
        (url) => url.pathname.includes(`/proposals/${v2Id}`) && !url.pathname.endsWith('/sign'),
        { timeout: 30_000 },
      );

      const signed = await getProposal(v2Id);
      expect(signed.status).toBe('accepted');
      expect(signed.signed_at).not.toBeNull();
      expect(signed.signed_by_name).toBe('Test Client');

      // The accepted v2 must NOT be downgraded by anything; v1 stays revised.
      expect((await getProposal(v1Id)).status).toBe('revised');
    } finally {
      await clientContext.close();
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 9: Designer activates v2 as a live project
  // ────────────────────────────────────────────────────────────────────────
  test('designer activates v2 as a project', async ({ authenticatedPage: page }) => {
    test.setTimeout(120_000);

    // Reset so the post-activation 'active' assertion is a real guard.
    await setDesignerClientStatus(DEV_DESIGNER_ID, DEV_CLIENT_ID, 'proposal');

    await page.goto(`/portal/proposals/${v2Id}/signed`, { waitUntil: 'networkidle' });

    const activateBtn = page.getByRole('button', { name: /activate project/i });
    await activateBtn.waitFor({ state: 'visible', timeout: 15_000 });
    await activateBtn.click();

    await page.waitForURL(/\/portal\/projects\/[0-9a-f-]{36}/, { timeout: 45_000 });

    const activated = await getProposal(v2Id);
    expect(activated.project_id).not.toBeNull();

    const project = await getProjectByProposal(v2Id);
    expect(project).not.toBeNull();
    expect(project!.status).toBe('active');
    expect(project!.created_by).toBe(DEV_DESIGNER_ID);
    expect(project!.budget_cents).toBe(ALLOWANCE_MID_CENTS);
    expect(project!.design_fee_cents).toBe(PHASE_FEE_CENTS);
    expect(project!.total_amount_cents).toBe(TOTAL_CENTS);

    expect(await countByProject('project_rooms', project!.id)).toBeGreaterThanOrEqual(1);
    expect(await countByProject('project_ffe_items', project!.id)).toBeGreaterThanOrEqual(1);
    expect(await countByProject('project_phases', project!.id)).toBeGreaterThanOrEqual(1);
    expect(
      await countByProject('project_payment_milestones', project!.id),
    ).toBeGreaterThanOrEqual(3);

    const dc = await getDesignerClient(DEV_DESIGNER_ID, DEV_CLIENT_ID);
    expect(dc!.status).toBe('active');

    // v1 stays a superseded archive entry — never activated, never signed.
    const v1 = await getProposal(v1Id);
    expect(v1.status).toBe('revised');
    expect(v1.project_id).toBeNull();
  });

  // ────────────────────────────────────────────────────────────────────────
  // Cleanup
  // ────────────────────────────────────────────────────────────────────────
  test.afterAll(async () => {
    if (process.env.KEEP_TEST_PROPOSAL === 'true') {
      // eslint-disable-next-line no-console
      console.log(`[KEEP_TEST_PROPOSAL] preserving chain: v1=${v1Id} v2=${v2Id}`);
      return;
    }

    await setDesignerClientStatus(DEV_DESIGNER_ID, DEV_CLIENT_ID, 'active').catch(() => {
      /* best-effort */
    });

    // Delete the project first (proposals.project_id is ON DELETE SET NULL),
    // then v2 BEFORE v1 — parent_proposal_id has no ON DELETE rule, so the
    // child must go first.
    if (v2Id) {
      const project = await getProjectByProposal(v2Id).catch(() => null);
      if (project) {
        const { error } = await adminDb.from('projects').delete().eq('id', project.id);
        if (error) console.error('[revise-supersede] project cleanup failed:', error);
      }
      await deleteProposalCascade(v2Id).catch((err) => {
        console.error('[revise-supersede] v2 cleanup failed:', err);
      });
    }
    if (v1Id) {
      await deleteProposalCascade(v1Id).catch((err) => {
        console.error('[revise-supersede] v1 cleanup failed:', err);
      });
    }
  });
});
