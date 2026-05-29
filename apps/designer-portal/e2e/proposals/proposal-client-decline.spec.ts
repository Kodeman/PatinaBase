/**
 * End-to-end spec: client declines a sent proposal.
 *
 * Reuses the seeded "sent" fixture proposal (b0000000-…0002), which is already
 * linked to client@patina.dev. As the client we open it, click the decline
 * trigger, fill a reason, confirm, then assert the proposal moved to
 * 'declined' with declined_at + decline_reason persisted. The fixture is
 * restored to 'sent' in afterAll so the suite is re-runnable.
 *
 * Mirrors proposal-build.spec.ts / proposal-client-sign.spec.ts: same auth
 * fixture import, the same client-portal sign-in helper, the same
 * supabase-admin DB-assertion approach.
 *
 * Requires:
 *   - Local Supabase running with seed data (designer@patina.dev, client@patina.dev,
 *     and the seeded proposals from supabase/seed/proposals.sql)
 *   - Client portal at :3002
 *   - SUPABASE_SERVICE_ROLE_KEY in apps/designer-portal/.env.local
 */

import { test, expect } from '../fixtures/auth';
import {
  getProposal,
  getUserIdByEmail,
  resetProposalToSent,
  setProposalClient,
} from '../helpers/supabase-admin';

// Seeded "sent" fixture proposal — see supabase/seed/proposals.sql (v_sent).
const SENT_PROPOSAL_ID = 'b0000000-0000-0000-0000-000000000002';

const CLIENT_BASE_URL = process.env.CLIENT_PORTAL_URL ?? 'http://localhost:3002';
const CLIENT_EMAIL = process.env.CLIENT_E2E_EMAIL ?? 'client@patina.dev';
const CLIENT_PASSWORD = process.env.CLIENT_E2E_PASSWORD ?? 'password123';

const DECLINE_REASON = `Budget exceeds our cap right now — ${Date.now()}`;

// --------------------------------------------------------------------------
// Helper: sign in the client portal (verbatim from proposal-build.spec.ts)
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

test.describe.serial('proposal client decline', () => {
  // Ensure the seeded fixture is in a clean 'sent' state, linked to the client,
  // before the decline run (the suite may run after other specs mutate it).
  test.beforeAll(async () => {
    const clientUserId = await getUserIdByEmail(CLIENT_EMAIL);
    await setProposalClient(SENT_PROPOSAL_ID, clientUserId);
    await resetProposalToSent(SENT_PROPOSAL_ID);
  });

  test('client declines with a reason', async ({
    authenticatedPage: _designerPage,
    browser,
  }) => {
    test.setTimeout(120_000);

    const clientContext = await browser.newContext({ storageState: undefined });
    const clientPage = await clientContext.newPage();

    try {
      await signInClientPortal(clientPage);

      await clientPage.goto(`${CLIENT_BASE_URL}/proposals/${SENT_PROPOSAL_ID}`, {
        waitUntil: 'networkidle',
        timeout: 30_000,
      });

      // The decline trigger only renders when the proposal is actionable
      // (status sent/viewed and not past expiry). The fixture satisfies this.
      const declineTrigger = clientPage.getByTestId('proposal-decline-trigger');
      await declineTrigger.waitFor({ state: 'visible', timeout: 20_000 });
      await declineTrigger.click();

      // Fill the reason in the decline dialog and confirm.
      const reasonInput = clientPage.getByTestId('proposal-decline-reason');
      await reasonInput.waitFor({ state: 'visible', timeout: 10_000 });
      await reasonInput.fill(DECLINE_REASON);

      await clientPage.getByTestId('proposal-decline-confirm').click();

      // The dialog closes on success; wait for the in-flight mutation to settle.
      await clientPage.waitForLoadState('networkidle');
      // The page re-renders the "You declined this proposal" banner.
      await expect(
        clientPage.getByText(/you declined this proposal/i).first(),
      ).toBeVisible({ timeout: 15_000 });

      // ── DB assertions ──
      const declined = await getProposal(SENT_PROPOSAL_ID);
      expect(declined.status, `expected 'declined', got '${declined.status}'`).toBe('declined');
      expect(declined.declined_at, 'declined_at should be set').not.toBeNull();
      expect(declined.decline_reason, 'decline_reason should match the typed reason').toBe(
        DECLINE_REASON,
      );
    } finally {
      await clientContext.close();
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // Cleanup: restore the shared seed fixture to 'sent' so re-runs (and other
  // specs that depend on this fixture) start clean.
  // ────────────────────────────────────────────────────────────────────────
  test.afterAll(async () => {
    await resetProposalToSent(SENT_PROPOSAL_ID).catch((err) => {
      console.error('[proposal-client-decline] afterAll restore failed:', err);
    });
  });
});
