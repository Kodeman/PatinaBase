/**
 * WP3 · Ruling VIII / M8 — the household's half of the gate ceremony.
 *
 * The same six-part anatomy the studio authors, read at client scale, plus the
 * two stamps that mark a settled gate: the mocha seal for an approved gate and
 * the gold HOLD for one the household chose to keep open. M8's own note is that
 * a holding gate must never read as a soft approval, so the hold is drawn as
 * loud as the seal — this proves both render, and that the outcome the client
 * chose is the outcome recorded.
 *
 * Serial, and the response test answers a gate this suite mints for itself.
 * The shared fixture is reused across spec files and across runs, so settling
 * one of ITS gates would fold a ceremony another suite reads — and would leave
 * this suite nothing to answer the second time it ran.
 */
import { test, expect, type Page } from '@playwright/test';
import {
  mintRespondableGate,
  seedWorkflowGateFixture,
  type WorkflowGateIds,
} from './helpers/workflow-gate-fixture';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

let ids: WorkflowGateIds;

let respondable: string;

test.beforeAll(() => {
  ids = seedWorkflowGateFixture();
  respondable = mintRespondableGate('client-gate-ceremony');
});

// No afterAll teardown: sibling spec files share one fixture (see
// workflow-gate-fixture.ts), so tearing it down here would pull it out from
// under a suite still running. The next seed tears down before it rebuilds.

/**
 * Signs in as the seeded household. The golden-hour restyle made sign-in
 * email-first: filling the email and submitting without opening this disclosure
 * sends a six-digit passcode instead of accepting a password.
 */
async function signInAsClient(page: Page): Promise<void> {
  await page.goto('/auth/signin', { waitUntil: 'networkidle' });
  const disclosure = page.getByRole('button', {
    name: /sign in with email|use email and password instead/i,
  });
  await disclosure.first().waitFor({ state: 'visible', timeout: 30_000 });
  await disclosure.first().click();
  await page.getByLabel(/email/i).first().fill('client@patina.dev');
  await page.getByLabel(/password/i).first().fill('password123');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/auth/signin'), {
    timeout: 60_000,
  });
}

async function openDecision(page: Page, decisionId: string): Promise<void> {
  await page.goto(`/decisions/${decisionId}`);
  await expect(page.getByTestId('project-approval-review')).toBeVisible({
    timeout: 60_000,
  });
}

test('the household meets the same six-part gate, at client scale', async ({
  page,
}) => {
  await signInAsClient(page);
  await openDecision(page, ids.pending);

  const anatomy = page.getByTestId('gate-anatomy');
  await expect(anatomy).toBeVisible();
  for (const part of [
    'anatomy-artifact',
    'anatomy-question',
    'anatomy-scope',
    'anatomy-impact',
    'anatomy-authority',
    'anatomy-confirmation',
  ]) {
    await expect(anatomy.getByTestId(part)).toBeVisible();
  }

  // The artifact is exact and says so, and the checksum is on the paper — this
  // is the half of the ceremony that makes "exactly as shown" a claim the
  // household can check rather than a promise.
  await expect(page.getByTestId('immutability-sentence')).toHaveText(
    'You are approving edition 901, exactly as shown.',
  );
  await expect(page.getByTestId('artifact-checksum')).toHaveText(/^[0-9a-f]{64}$/);

  // Three outcomes, no more, and comments are named as not being one of them.
  await expect(
    page.locator('input[name="project-approval-outcome"]'),
  ).toHaveCount(3);
  await expect(page.getByTestId('anatomy-confirmation')).toContainText(
    'comments do not submit an outcome',
  );
});

test('holding a gate for discussion stamps it HELD, never approved', async ({
  page,
}) => {
  await signInAsClient(page);
  await openDecision(page, respondable);

  await page
    .locator('input[name="project-approval-outcome"][value="needs_discussion"]')
    .check();
  await page.getByRole('button', { name: /submit response/i }).click();

  const held = page.getByTestId('held-for-discussion');
  await expect(held).toBeVisible({ timeout: 30_000 });

  // The stamp is the hold variant, not the seal — the two are deliberately
  // drawn equally loud, so the variant is the only thing separating them.
  await expect(held.locator('[data-gate-stamp-variant]')).toHaveAttribute(
    'data-gate-stamp-variant',
    'hold',
  );
  await expect(held).toContainText('Held for discussion');
  await expect(held).toContainText('Recorded outcome: Held for discussion');

  // A held gate is not an approved one.
  await expect(page.getByTestId('approval-seal')).toHaveCount(0);

  // The gate has settled, so the confirmation fieldset withdraws.
  await expect(page.getByTestId('anatomy-confirmation')).toHaveCount(0);
});

test('an approved gate carries the seal', async ({ page }) => {
  await signInAsClient(page);
  await openDecision(page, ids.approved);

  const seal = page.getByTestId('approval-seal');
  await expect(seal).toBeVisible();
  await expect(seal.locator('[data-gate-stamp-variant]')).toHaveAttribute(
    'data-gate-stamp-variant',
    'seal',
  );
  await expect(seal).toContainText('Recorded outcome: Approved');
  await expect(page.getByTestId('held-for-discussion')).toHaveCount(0);
});
