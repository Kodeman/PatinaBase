/**
 * End-to-end spec: proposal create + client-link → seed scope → send → client
 * view → client sign → designer activate.
 *
 * Extends the coverage of proposal-build.spec.ts to the NEW client-linking UI
 * (ClientPicker on the New Proposal page) and the full client-side
 * view/sign/activation lifecycle. Scope (allowance item, phase, milestones) is
 * seeded via the service-role helpers rather than driven through the fragile
 * FF&E builder; everything client-facing (link picker, view, sign) and the
 * activation are driven through the real UI.
 *
 * Mirrors proposal-build.spec.ts: same auth fixture, same client-portal
 * sign-in helper, same DB-assertion approach via supabase-admin, same
 * KEEP_TEST_PROPOSAL cleanup convention.
 *
 * Requires:
 *   - Local Supabase running with seed data (designer@patina.dev, client@patina.dev)
 *   - Designer portal at :3000, client portal at :3002
 *   - SUPABASE_SERVICE_ROLE_KEY in apps/designer-portal/.env.local
 */

import { test, expect } from '../fixtures/auth';
import {
  adminDb,
  countByProject,
  deleteProposalCascade,
  getDesignerClient,
  getEngagementSignedRow,
  getPaymentMilestones,
  getProjectByProposal,
  getProposal,
  insertAllowanceItem,
  insertPaymentMilestone,
  insertProposalPhase,
  insertScopeRoom,
  setDesignerClientStatus,
  setProposalTotals,
} from '../helpers/supabase-admin';

// Deterministic dev-seed UUIDs — see supabase/seed/dev-accounts.sql.
const DEV_DESIGNER_ID = 'a0000000-0000-0000-0000-000000000004';
const DEV_CLIENT_ID = 'a0000000-0000-0000-0000-000000000005';

// --------------------------------------------------------------------------
// Client portal auth constants (mirrors proposal-build.spec.ts internals)
// --------------------------------------------------------------------------
const CLIENT_BASE_URL = process.env.CLIENT_PORTAL_URL ?? 'http://localhost:3002';
const CLIENT_EMAIL = process.env.CLIENT_E2E_EMAIL ?? 'client@patina.dev';
const CLIENT_PASSWORD = process.env.CLIENT_E2E_PASSWORD ?? 'password123';

// Scope money (CENTS). FF&E allowance midpoint + design phase fee. The
// "Estimated Total" includes the design phase fee, so total = midpoint + fee.
const ALLOWANCE_MIN_CENTS = 400_000; // $4,000
const ALLOWANCE_MAX_CENTS = 600_000; // $6,000
const ALLOWANCE_MID_CENTS = Math.round((ALLOWANCE_MIN_CENTS + ALLOWANCE_MAX_CENTS) / 2); // $5,000
const PHASE_FEE_CENTS = 250_000; // $2,500
const TOTAL_CENTS = ALLOWANCE_MID_CENTS + PHASE_FEE_CENTS; // $7,500

// --------------------------------------------------------------------------
// Module-level shared state (safe because describe.serial is sequential)
// --------------------------------------------------------------------------
let proposalId: string;
const milestoneSpecs = [
  { label: 'Engagement deposit', percentage: 40, sortOrder: 0, trigger: 'On signing' },
  { label: 'Procurement', percentage: 35, sortOrder: 1, trigger: 'Order placement' },
  { label: 'Final installation', percentage: 25, sortOrder: 2, trigger: 'On completion' },
];

// --------------------------------------------------------------------------
// Helper: wait for a network mutation to settle (mirrors build spec)
// --------------------------------------------------------------------------
async function waitForMutation(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForLoadState('networkidle');
}

// --------------------------------------------------------------------------
// Helper: sign in the client portal inside an isolated browser context
// (verbatim from proposal-build.spec.ts — same disclosure-form flow)
// --------------------------------------------------------------------------
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

// ==========================================================================
// Suite
// ==========================================================================

test.describe.serial('proposal client-link → send → view → sign → activate', () => {
  // ────────────────────────────────────────────────────────────────────────
  // Step 1: Create proposal from template WITH a linked client (new UI)
  // ────────────────────────────────────────────────────────────────────────
  test('create from template with linked client', async ({ authenticatedPage: page }) => {
    test.setTimeout(90_000);
    await page.goto('/portal/proposals/new', { waitUntil: 'networkidle' });

    // Select the first template (TemplateCard renders a clickable rounded div).
    const firstTemplate = page
      .locator('[class*="cursor-pointer"][class*="rounded-md"]')
      .first();
    await firstTemplate.waitFor({ state: 'visible', timeout: 20_000 });
    await firstTemplate.click();

    // ── Link the client via the new ClientPicker (the regression target) ──
    await page.getByTestId('client-picker-trigger').click();

    const search = page.getByTestId('client-picker-search');
    await search.waitFor({ state: 'visible', timeout: 10_000 });
    // Narrow the list so the seeded client@patina.dev option surfaces.
    await search.fill('client');

    const clientOption = page.getByTestId(`client-picker-option-${DEV_CLIENT_ID}`);
    await clientOption.waitFor({ state: 'visible', timeout: 10_000 });
    await clientOption.click();

    // The picker closes and the trigger now shows the selected client's label.
    await expect(page.getByTestId('client-picker-trigger')).not.toContainText(
      /no linked client/i,
    );

    // Create the proposal.
    const createBtn = page.getByRole('button', { name: /create proposal/i });
    await createBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await createBtn.click();

    await page.waitForURL(/\/portal\/proposals\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    const match = page.url().match(/\/portal\/proposals\/([0-9a-f-]{36})$/);
    expect(match, 'URL should contain a UUID').not.toBeNull();
    proposalId = match![1];

    // ── Core regression guard: the linked client persisted to client_id ──
    const proposal = await getProposal(proposalId);
    expect(proposal.status).toBe('draft');
    expect(
      proposal.client_id,
      'proposals.client_id must equal the linked client (gates client RLS visibility)',
    ).toBe(DEV_CLIENT_ID);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 2: Seed scope via service-role helpers
  //   ≥1 allowance item (budget min/max), ≥1 phase with fee, ≥2 milestones,
  //   then set proposals.total_amount = allowance midpoint + phase fee.
  // ────────────────────────────────────────────────────────────────────────
  test('seed scope (allowance item, phase, milestones, total)', async () => {
    const room = await insertScopeRoom({
      proposalId,
      name: 'Living Room',
      roomType: 'living_room',
      budgetCents: ALLOWANCE_MID_CENTS,
      sortOrder: 0,
    });

    const allowance = await insertAllowanceItem({
      proposalId,
      name: 'Seating allowance',
      budgetMinCents: ALLOWANCE_MIN_CENTS,
      budgetMaxCents: ALLOWANCE_MAX_CENTS,
      ffeCategory: 'seating',
      scopeRoomId: room.id,
      position: 0,
    });
    expect(allowance.item_type).toBe('allowance');
    expect(allowance.line_total_cents, 'allowance line_total = midpoint (non-$0)').toBe(
      ALLOWANCE_MID_CENTS,
    );

    const phase = await insertProposalPhase({
      proposalId,
      name: 'Design & Procurement',
      feeCents: PHASE_FEE_CENTS,
      durationWeeks: 4,
      phaseKey: 'design',
      sortOrder: 0,
    });

    for (const m of milestoneSpecs) {
      await insertPaymentMilestone({
        proposalId,
        label: m.label,
        percentage: m.percentage,
        amountCents: Math.round((TOTAL_CENTS * m.percentage) / 100),
        triggerCondition: m.trigger,
        phaseId: phase.id,
        sortOrder: m.sortOrder,
      });
    }

    await setProposalTotals(proposalId, {
      subtotalCents: TOTAL_CENTS,
      totalAmountCents: TOTAL_CENTS,
    });

    // DB sanity: rows landed, total set.
    const milestones = await getPaymentMilestones(proposalId);
    expect(milestones.length, 'expected ≥2 payment milestones').toBeGreaterThanOrEqual(2);
    const proposal = await getProposal(proposalId);
    expect(proposal.total_amount).toBe(TOTAL_CENTS);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 3: Send via the /send UI (gated until a client is linked — it is)
  // ────────────────────────────────────────────────────────────────────────
  test('send the proposal (send is gated on a linked client)', async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/portal/proposals/${proposalId}/send`, { waitUntil: 'networkidle' });

    // The "Link a client to send" warning must NOT appear — we linked one.
    await expect(page.getByText(/link a client to send/i)).toHaveCount(0);

    // The Send button is enabled only when client_id is set AND recipientEmail
    // is non-empty. recipientEmail pre-fills from the linked client's email,
    // but to be deterministic we expand the alternate-address field and fill it.
    await page.getByRole('button', { name: /send to a different address/i }).click();
    const recipientInput = page.getByPlaceholder('client@email.com');
    await recipientInput.waitFor({ state: 'visible', timeout: 10_000 });
    await recipientInput.fill(CLIENT_EMAIL);

    await page
      .getByPlaceholder(/write a personal note/i)
      .fill('Here is your proposal — review and sign when ready.');

    const sendBtn = page.getByRole('button', { name: /send proposal/i });
    await expect(sendBtn).toBeEnabled();
    await sendBtn.click();

    await page.waitForURL((url) => !url.pathname.includes('/send'), { timeout: 30_000 });

    const sent = await getProposal(proposalId);
    expect(sent.status, `proposal status is ${sent.status}, expected 'sent'`).toBe('sent');
    expect(sent.sent_at, 'sent_at should be set after send').not.toBeNull();
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 4: Client opens the proposal — assert REAL milestone labels /
  // percentages render (not a hardcoded 30/40/30) and the allowance range shows.
  // ────────────────────────────────────────────────────────────────────────
  test('client views proposal: real milestones + allowance range render', async ({
    authenticatedPage: _designerPage,
    browser,
  }) => {
    test.setTimeout(120_000);

    const clientContext = await browser.newContext({ storageState: undefined });
    const clientPage = await clientContext.newPage();

    try {
      await signInClientPortal(clientPage);

      await clientPage.goto(`${CLIENT_BASE_URL}/proposals/${proposalId}`, {
        waitUntil: 'networkidle',
        timeout: 30_000,
      });

      // Document title heading renders.
      const titleHeading = clientPage.locator('h1').first();
      await titleHeading.waitFor({ state: 'visible', timeout: 20_000 });
      await expect(titleHeading).toBeVisible();

      // The Investment section's body text must be visible to assert against.
      const investmentSection = clientPage.locator('[data-section-type="investment"]');
      await investmentSection.scrollIntoViewIfNeeded();
      await expect(investmentSection).toBeVisible({ timeout: 15_000 });

      // ── Real payment milestone labels + percentages ──
      // PaymentScheduleBlock renders each as "<label> … (<pct>%)" and NEVER
      // falls back to 30/40/30. Assert our seeded labels + percentages appear.
      for (const m of milestoneSpecs) {
        await expect(
          investmentSection.getByText(m.label, { exact: false }).first(),
          `milestone label "${m.label}" should render in the client document`,
        ).toBeVisible();
        await expect(
          investmentSection.getByText(`(${m.percentage}%)`).first(),
          `milestone percentage "${m.percentage}%" should render (not hardcoded 30/40/30)`,
        ).toBeVisible();
      }

      // Negative guard: none of the seeded percentages are 30/40/30, so a
      // hardcoded split would surface those labels. Confirm they're absent.
      await expect(investmentSection.getByText('(30%)')).toHaveCount(0);

      // ── Allowance line shows a range / non-$0 amount ──
      // LineItemsBlock renders "Allowance: $4,000–$6,000" under the name and
      // the line amount as the midpoint ($5,000).
      await expect(
        investmentSection.getByText(/allowance:\s*\$4,000/i).first(),
        'allowance budget range should render',
      ).toBeVisible();
      await expect(
        investmentSection.getByText('$5,000').first(),
        'allowance line amount (midpoint) should render non-$0',
      ).toBeVisible();

      // Flipping to 'viewed' is async; give it a moment then assert.
      await clientPage.waitForTimeout(800);
      const viewed = await getProposal(proposalId);
      expect(['viewed', 'sent']).toContain(viewed.status);
    } finally {
      await clientContext.close();
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 5: Client signs the proposal
  // ────────────────────────────────────────────────────────────────────────
  test('client signs proposal', async ({ authenticatedPage: _designerPage, browser }) => {
    test.setTimeout(120_000);
    const clientContext = await browser.newContext({ storageState: undefined });
    const clientPage = await clientContext.newPage();

    try {
      await signInClientPortal(clientPage);

      await clientPage.goto(`${CLIENT_BASE_URL}/proposals/${proposalId}/sign`, {
        waitUntil: 'networkidle',
        timeout: 30_000,
      });

      const nameInput = clientPage.locator('#signed-name');
      await nameInput.waitFor({ state: 'visible', timeout: 20_000 });
      await nameInput.fill('Test Client');

      const agreementCheckbox = clientPage.locator('input[type="checkbox"]').first();
      await agreementCheckbox.check();

      await clientPage.getByRole('button', { name: /sign and accept/i }).click();

      await clientPage.waitForURL(
        (url) =>
          url.pathname.includes(`/proposals/${proposalId}`) && !url.pathname.endsWith('/sign'),
        { timeout: 30_000 },
      );

      // DB assertions
      const signed = await getProposal(proposalId);
      expect(signed.status, `proposal status is ${signed.status}, expected 'accepted'`).toBe(
        'accepted',
      );
      expect(signed.accepted_at, 'accepted_at should be set').not.toBeNull();
      expect(signed.signed_at, 'signed_at should be set').not.toBeNull();
      expect(signed.signed_by_name).toBe('Test Client');

      // A proposal_engagement 'signed' row exists.
      const signedEvents = await getEngagementSignedRow(proposalId);
      expect(signedEvents.length, "expected a 'signed' engagement row").toBeGreaterThanOrEqual(
        1,
      );
      expect(signedEvents[0].viewer_id).toBe(DEV_CLIENT_ID);
    } finally {
      await clientContext.close();
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 6: Designer activates the signed proposal as a live project
  // ────────────────────────────────────────────────────────────────────────
  test('designer activates project', async ({ authenticatedPage: page }) => {
    test.setTimeout(120_000);

    // The activation RPC only promotes designer_clients.status from
    // ('lead','proposal'). The seed sets it to 'active', which would make the
    // post-activation 'active' assertion vacuous. Put it back to 'proposal'
    // first so the assertion is a real regression guard.
    await setDesignerClientStatus(DEV_DESIGNER_ID, DEV_CLIENT_ID, 'proposal');

    await page.goto(`/portal/proposals/${proposalId}/signed`, { waitUntil: 'networkidle' });

    // Click "Activate Project →" — the CTA shown while project_id is null.
    const activateBtn = page.getByRole('button', { name: /activate project/i });
    await activateBtn.waitFor({ state: 'visible', timeout: 15_000 });
    await activateBtn.click();

    // On success the page navigates to /portal/projects/{projectId}.
    await page.waitForURL(/\/portal\/projects\/[0-9a-f-]{36}/, { timeout: 45_000 });
    await waitForMutation(page);

    // ── DB assertions ──
    const activated = await getProposal(proposalId);
    expect(activated.project_id, 'proposals.project_id should be set after activation').not.toBeNull();

    const project = await getProjectByProposal(proposalId);
    expect(project, 'a projects row should exist for the proposal').not.toBeNull();
    expect(project!.id).toBe(activated.project_id);
    expect(project!.status).toBe('active');
    // created_by must be the designer (the 00167 fix).
    expect(
      project!.created_by,
      'projects.created_by must equal the designer id (00167 regression guard)',
    ).toBe(DEV_DESIGNER_ID);
    // Money columns populated from the proposal scope.
    expect(project!.budget_cents, 'budget_cents = Σ FF&E line_total').toBe(ALLOWANCE_MID_CENTS);
    expect(project!.design_fee_cents, 'design_fee_cents = Σ phase fees').toBe(PHASE_FEE_CENTS);
    expect(project!.total_amount_cents, 'total_amount_cents = proposal total').toBe(TOTAL_CENTS);

    // Child tables created from the proposal scope.
    expect(await countByProject('project_rooms', project!.id)).toBeGreaterThanOrEqual(1);
    expect(await countByProject('project_ffe_items', project!.id)).toBeGreaterThanOrEqual(1);
    expect(await countByProject('project_phases', project!.id)).toBeGreaterThanOrEqual(1);
    expect(
      await countByProject('project_payment_milestones', project!.id),
    ).toBeGreaterThanOrEqual(milestoneSpecs.length);

    // designer_clients flipped to 'active'.
    const dc = await getDesignerClient(DEV_DESIGNER_ID, DEV_CLIENT_ID);
    expect(dc, 'designer_clients row should exist').not.toBeNull();
    expect(dc!.status, "designer_clients.status should be 'active' after activation").toBe(
      'active',
    );
  });

  // ────────────────────────────────────────────────────────────────────────
  // Cleanup (mirrors proposal-build.spec.ts KEEP_TEST_PROPOSAL convention)
  // ────────────────────────────────────────────────────────────────────────
  test.afterAll(async () => {
    if (process.env.KEEP_TEST_PROPOSAL === 'true') {
      // eslint-disable-next-line no-console
      console.log(`[KEEP_TEST_PROPOSAL] preserving proposal: ${proposalId}`);
      return;
    }

    // Restore the seeded designer↔client status so re-runs start clean.
    await setDesignerClientStatus(DEV_DESIGNER_ID, DEV_CLIENT_ID, 'active').catch(() => {
      /* best-effort */
    });

    if (proposalId) {
      // Activation back-links proposals.project_id and creates a projects row.
      // Delete the project first (its FK to the proposal is ON DELETE depending
      // on schema), then cascade-delete the proposal.
      const project = await getProjectByProposal(proposalId).catch(() => null);
      if (project) {
        // projects.proposal_id is ON DELETE SET NULL, so deleting the proposal
        // would orphan the project. Delete the project first (its child tables
        // cascade); proposals.project_id is ON DELETE SET NULL so it clears.
        const { error } = await adminDb.from('projects').delete().eq('id', project.id);
        if (error) console.error('[proposal-client-sign] project cleanup failed:', error);
      }
      await deleteProposalCascade(proposalId).catch((err) => {
        console.error('[proposal-client-sign] afterAll cleanup failed:', err);
      });
    }
  });
});
