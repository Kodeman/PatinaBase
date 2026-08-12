/**
 * WP3 · R2/M2 — the approval gate as a six-part boundary ceremony.
 *
 * The unit suites cover the anatomy component in isolation; this proves the
 * ceremony against the real `get_project_decision_reviews` projection, mounted
 * in the open Document, for every lifecycle state a gate can be in.
 *
 * Serial + chromium-pinned: the fixture mutates rows shared by the whole
 * seeded project, and Playwright's three browser projects would otherwise run
 * `beforeAll` concurrently and rotate the decision ids out from under each
 * other mid-spec.
 */
import { test, expect } from '../fixtures/auth';
import {
  EDITION_ONE_TITLE,
  WORKFLOW_GATE_PROJECT_ID,
  seedWorkflowGateFixture,
  type WorkflowGateIds,
} from '../helpers/workflow-gate-fixture';

test.describe.configure({ mode: 'serial' });
test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'the fixture mutates shared project rows; the browser projects would race it',
);

let ids: WorkflowGateIds;

test.beforeAll(() => {
  ids = seedWorkflowGateFixture();
});

// No afterAll teardown: sibling spec files share one fixture (see
// workflow-gate-fixture.ts), so tearing it down here would pull it out from
// under a suite still running. The next seed tears down before it rebuilds.

/** The Approval record row for a decision, once the projection has answered. */
function approvalRow(page: import('@playwright/test').Page, decisionId: string) {
  return page.locator(`#project-approval-${decisionId}`);
}

async function openDocument(page: import('@playwright/test').Page) {
  await page.setViewportSize({ width: 1512, height: 1000 });
  await page.goto(`/doc/${WORKFLOW_GATE_PROJECT_ID}`, {
    waitUntil: 'domcontentloaded',
  });
  // The record is the ceremony's own mount; waiting on it rather than on
  // networkidle keeps the spec off the race the projection loses.
  await expect(
    page.getByRole('heading', { name: 'Approval record' }),
  ).toBeVisible({ timeout: 30_000 });
}

test('an unsettled gate stands as six named parts, in order', async ({
  authenticatedPage: page,
}) => {
  await openDocument(page);

  const row = approvalRow(page, ids.pending);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row).toHaveAttribute('data-gate-state', 'open');

  const ceremony = row.locator('[data-gate-ceremony]');
  await expect(ceremony).toHaveAttribute(
    'aria-label',
    `${EDITION_ONE_TITLE} gate`,
  );

  // Order is the anatomy: M2 separates the parts by sequence rather than by a
  // label column, so a reshuffle is a real regression even if every part is
  // still present.
  const parts = await row
    .locator('[data-gate-part]')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-gate-part')),
    );
  expect(parts).toEqual([
    'artifact',
    'question',
    'scope',
    'impact',
    'authority',
    'confirmation',
  ]);

  // Each part keeps an accessible name, so the anatomy survives into AT even
  // though the paper carries no label column.
  for (const name of [
    'Artifact',
    'Question',
    'Scope',
    'Impact',
    'Authority',
    'Confirmation',
  ]) {
    await expect(row.getByRole('group', { name, exact: true })).toBeVisible();
  }

  // The parts say what the projection says.
  await expect(row).toContainText('Edition 901 · frozen at publish · proof');
  await expect(row).toContainText(
    'Approve the issued Design Development plan set?',
  );
  await expect(row).toContainText(
    'Bound to Design Development — the sole phase this decision releases.',
  );
  await expect(row).toContainText('Review 1 of 1 confirmed');
});

test('publish is locked until the review is confirmed, and a published gate reads as sent', async ({
  authenticatedPage: page,
}) => {
  await openDocument(page);

  // Draft, review outstanding — the act is offered but refused, and the paper
  // says why rather than leaving a dead button.
  const draft = approvalRow(page, ids.draft);
  await expect(draft).toHaveAttribute('data-gate-state', 'open');
  await expect(draft).toContainText('once published');
  await expect(draft).toContainText(
    'Publish unlocks after every frozen reviewer has confirmed the exact artifact.',
  );
  await expect(
    draft.locator('[data-action-key="publish-project-approval"]'),
  ).toBeDisabled();

  // Draft, review complete — the same act, now available.
  const ready = approvalRow(page, ids.readyToPublish);
  await expect(
    ready.locator('[data-action-key="publish-project-approval"]'),
  ).toBeEnabled();
  await expect(ready).toContainText('Review 1 of 1 confirmed');

  // Published — the confirmation part switches from "once published" to the
  // sent-and-due reading, and publish is gone.
  const pending = approvalRow(page, ids.pending);
  await expect(pending).toContainText(/Published .+ · due /);
  await expect(
    pending.locator('[data-action-key="publish-project-approval"]'),
  ).toHaveCount(0);
});

test('an approved gate seals: the ceremony folds and the APPROVED stamp stands', async ({
  authenticatedPage: page,
}) => {
  await openDocument(page);

  const row = approvalRow(page, ids.approved);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row).toHaveAttribute('data-gate-state', 'sealed');

  // Sealed means folded: the six-part anatomy is withdrawn from the glass.
  await expect(row.locator('[data-gate-ceremony]')).toHaveCount(0);
  await expect(row.locator('[data-gate-part]')).toHaveCount(0);

  // The seal states the outcome and the day it settled, and the edition that
  // settled stays on the paper.
  await expect(row.getByText(/^Approved · /)).toBeVisible();
  await expect(row).toContainText('Edition 901 · frozen at publish · proof');

  // A settled gate is no longer the live leaf.
  await expect(row).toHaveAttribute(
    'data-project-approval-current-leaf',
    'false',
  );
});

test('a sealed successor links back to the edition it superseded', async ({
  authenticatedPage: page,
}) => {
  await openDocument(page);

  const successor = approvalRow(page, ids.successor);
  await expect(successor).toBeVisible({ timeout: 30_000 });
  await expect(successor).toHaveAttribute('data-gate-state', 'sealed');

  // The link names the edition, not the decision id — "Edition 901" is the
  // superseded artifact's version.
  const link = successor.getByRole('button', {
    name: /Edition 901 superseded/,
  });
  await expect(link).toBeVisible();

  await link.click();

  // It moves the reader to the superseded row rather than opening a surface of
  // its own.
  await expect(approvalRow(page, ids.superseded)).toBeFocused();
  await expect(approvalRow(page, ids.superseded)).toHaveAttribute(
    'data-gate-state',
    'sealed',
  );
  await expect(
    approvalRow(page, ids.superseded).getByText(/^Superseded · /),
  ).toBeVisible();
});
