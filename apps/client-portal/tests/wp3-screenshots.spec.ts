/**
 * WP3 screenshot pass — the household's gate ceremony (Ruling VIII / M8).
 *
 * Shots land in docs/design/workflow-alignment/screenshots/wp3/ at the
 * charter's two readings: desktop (≥1280px) and mobile (~390px).
 *
 * LOCAL STACK ONLY — it seeds the shared workflow-gate fixture.
 */
import { test, expect, type Page } from '@playwright/test';
import {
  mintRespondableGate,
  seedWorkflowGateFixture,
  type WorkflowGateIds,
} from './helpers/workflow-gate-fixture';

const SHOT_DIR = '../../docs/design/workflow-alignment/screenshots/wp3';
const DESKTOP = { width: 1280, height: 1000 };
const MOBILE = { width: 390, height: 844 };

test.describe.configure({ mode: 'serial', timeout: 180_000 });

let ids: WorkflowGateIds;

/** One gate per pass: each pass answers its own, so the spec re-runs cleanly. */
let respondable: Record<'desktop' | 'mobile', string>;

test.beforeAll(() => {
  ids = seedWorkflowGateFixture();
  respondable = {
    desktop: mintRespondableGate('client-shots-desktop'),
    mobile: mintRespondableGate('client-shots-mobile'),
  };
});

// No afterAll teardown: sibling spec files share one fixture (see
// workflow-gate-fixture.ts), so tearing it down here would pull it out from
// under a suite still running. The next seed tears down before it rebuilds.

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

test('client gate ceremony — anatomy, confirmation, and the HELD stamp', async ({
  page,
}) => {
  await signInAsClient(page);

  for (const [name, viewport] of [
    ['desktop', DESKTOP],
    ['mobile', MOBILE],
  ] as const) {
    await page.setViewportSize(viewport);

    // The six-part anatomy, unanswered. Each pass shoots a gate minted for it,
    // so the response below never folds a gate another spec reads.
    const gate = respondable[name];
    await openDecision(page, gate);
    const anatomy = page.getByTestId('gate-anatomy');
    await expect(anatomy.getByTestId('anatomy-artifact')).toBeVisible();
    await anatomy.screenshot({
      path: `${SHOT_DIR}/client-ceremony-anatomy-${name}.png`,
    });

    // The confirmation part: three outcomes and one scored act.
    const confirmation = page.getByTestId('anatomy-confirmation');
    await confirmation.scrollIntoViewIfNeeded();
    await confirmation.screenshot({
      path: `${SHOT_DIR}/client-ceremony-confirm-${name}.png`,
    });

    // Hold it for discussion, and photograph the stamp that marks a gate the
    // household deliberately kept open.
    await page
      .locator(
        'input[name="project-approval-outcome"][value="needs_discussion"]',
      )
      .check();
    await page.getByRole('button', { name: /submit response/i }).click();
    const held = page.getByTestId('held-for-discussion');
    await expect(held).toBeVisible({ timeout: 30_000 });
    await held.scrollIntoViewIfNeeded();
    await held.screenshot({
      path: `${SHOT_DIR}/client-ceremony-held-stamp-${name}.png`,
    });
  }

  // The seal, for the pair the deck draws side by side.
  await page.setViewportSize(DESKTOP);
  await openDecision(page, ids.approved);
  const seal = page.getByTestId('approval-seal');
  await expect(seal).toBeVisible();
  await seal.screenshot({
    path: `${SHOT_DIR}/client-ceremony-seal-desktop.png`,
  });
});
