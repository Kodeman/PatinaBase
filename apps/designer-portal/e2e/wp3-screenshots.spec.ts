/**
 * WP3 screenshot pass — designer surfaces.
 *
 * The workstream charter asks every new surface for a desktop (≥1280px) and a
 * mobile (~390px) reading. Shots land in
 * docs/design/workflow-alignment/screenshots/wp3/.
 *
 * LOCAL STACK ONLY — it seeds the shared workflow-gate fixture.
 * Not a gate: this spec produces artifacts. The assertions here exist only to
 * make sure a shot is never taken of a half-rendered surface.
 */
import { test, expect, type AuthenticatedPage } from './fixtures/auth';
import {
  WORKFLOW_GATE_PROJECT_ID,
  handoffAnchorId,
  handoffKey,
  seedWorkflowGateFixture,
  type WorkflowGateIds,
} from './helpers/workflow-gate-fixture';
import { psqlRun } from './helpers/psql';

const SHOT_DIR = '../../docs/design/workflow-alignment/screenshots/wp3';
const DESKTOP = { width: 1512, height: 1000 };
const FOLDED_MARGIN = { width: 1280, height: 900 };
const MOBILE = { width: 390, height: 844 };

test.describe.configure({ mode: 'serial' });
test.skip(({ browserName }) => browserName !== 'chromium', 'screenshot pass');

let ids: WorkflowGateIds;

test.beforeAll(() => {
  ids = seedWorkflowGateFixture();
  // The Desk Walkthrough's welcome modal renders over the Desk and would stand
  // in front of the folio and the Pulse sentence. The auth fixture's
  // localStorage flag only covers the help-system's own key; the Desk gate
  // reads the persisted profile record, so it has to be settled in the
  // database. Written over psql rather than help-state.ts's admin client,
  // which needs a service-role key this run does not carry.
  psqlRun(
    `UPDATE public.profiles
        SET help_state = '{"tours": {"desk-walkthrough": {"completed": true}}}'::jsonb
      WHERE id = 'a0000000-0000-0000-0000-000000000004'::uuid`,
  );
});

// No afterAll teardown: sibling spec files share one fixture (see
// workflow-gate-fixture.ts), so tearing it down here would pull it out from
// under a suite still running. The next seed tears down before it rebuilds.

async function openDocument(
  page: AuthenticatedPage,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
  await page.goto(`/doc/${WORKFLOW_GATE_PROJECT_ID}`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(
    page.getByRole('heading', { name: 'Approval record' }),
  ).toBeVisible({ timeout: 30_000 });
}

test('section stage line, in the open Project row', async ({
  authenticatedPage: page,
}) => {
  for (const [name, viewport] of [
    ['desktop', DESKTOP],
    ['mobile', MOBILE],
  ] as const) {
    await openDocument(page, viewport);
    const stageLine = page.locator('[data-section-stage-line]');
    await expect(stageLine).toContainText('Design Development');
    await expect(stageLine.locator('[data-workflow-track]')).toHaveCount(2);
    await stageLine.scrollIntoViewIfNeeded();
    await stageLine.screenshot({
      path: `${SHOT_DIR}/section-stage-line-${name}.png`,
    });
  }
});

test('gate ceremony — authoring, read, and sealed', async ({
  authenticatedPage: page,
}) => {
  for (const [name, viewport] of [
    ['desktop', DESKTOP],
    ['mobile', MOBILE],
  ] as const) {
    await openDocument(page, viewport);

    // Authoring: the composer wears the same six parts as fieldsets.
    const compose = page.locator('[data-action-key="compose-project-approval"]');
    await compose.scrollIntoViewIfNeeded();
    await compose.click();
    const composer = page.locator('form:has([data-gate-part="artifact"])');
    await expect(composer).toBeVisible();
    await expect(composer.locator('[data-gate-part]')).toHaveCount(6);
    await composer.screenshot({
      path: `${SHOT_DIR}/gate-ceremony-authoring-${name}.png`,
    });
    await compose.click();

    // Read: an unsettled gate, unfolded.
    const read = page.locator(`#project-approval-${ids.pending}`);
    await read.scrollIntoViewIfNeeded();
    await expect(read).toHaveAttribute('data-gate-state', 'open');
    await read.screenshot({
      path: `${SHOT_DIR}/gate-ceremony-read-${name}.png`,
    });

    // Sealed: the approved gate, folded, wearing its stamp.
    const sealed = page.locator(`#project-approval-${ids.approved}`);
    await sealed.scrollIntoViewIfNeeded();
    await expect(sealed).toHaveAttribute('data-gate-state', 'sealed');
    await sealed.screenshot({
      path: `${SHOT_DIR}/gate-ceremony-sealed-${name}.png`,
    });
  }
});

/**
 * Element screenshots of a margin item come out unreadable: the rail is a
 * sticky, `overflow-y-auto` column, and Playwright's scroll-and-capture relays
 * the item out to one character per line. Clipping the item's own box out of a
 * viewport shot captures what a reader actually sees.
 */
async function shootRegion(
  page: AuthenticatedPage,
  locator: ReturnType<AuthenticatedPage['locator']>,
  file: string,
  pad = 8,
) {
  // The rail is its own scroll container, so the item can sit below the fold
  // even while the page itself is at the top.
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error(`no bounding box for ${file}`);
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('no viewport');
  const x = Math.max(0, Math.min(box.x - pad, viewport.width - 1));
  const y = Math.max(0, Math.min(box.y - pad, viewport.height - 1));
  await page.screenshot({
    path: `${SHOT_DIR}/${file}`,
    clip: {
      x,
      y,
      width: Math.min(box.width + pad * 2, viewport.width - x),
      height: Math.min(box.height + pad * 2, viewport.height - y),
    },
  });
}

test('margin handoff — folded, unfolded, and overdue', async ({
  authenticatedPage: page,
}) => {
  // Desktop, permanent rail: the item's folded face and its overdue stamp.
  await openDocument(page, DESKTOP);
  const overdue = page.locator(
    `[data-margin-handoff="${handoffKey(ids.overdue)}"]`,
  );
  await expect(overdue).toContainText(/Overdue · \d+ days?/);
  // Kept deliberately: at ≥1440px the rail's grid column is ~232px, and the
  // item's `grid-cols-[minmax(0,1fr)_auto]` right column — the overdue stamp
  // and the act, both shrink-0 — takes the whole width, starving the need line
  // to 0px so it wraps one character per line. This shot is the evidence.
  await shootRegion(page, overdue, 'margin-handoff-overdue-1440-collapsed.png');

  const studioGate = page.locator(
    `[data-margin-handoff="${handoffKey(ids.readyToPublish)}"]`,
  );
  await expect(studioGate).toBeVisible();
  await shootRegion(page, studioGate, 'margin-handoff-folded-desktop.png');

  // The whole rail, so the folded items read as a stack rather than one card.
  await shootRegion(
    page,
    page.locator('[data-margin-panel]'),
    'margin-rail-desktop.png',
    0,
  );

  // 1280px: the margin is folded away and unfolds on request.
  await openDocument(page, FOLDED_MARGIN);
  await expect(page.locator('[data-margin-panel]')).toHaveAttribute(
    'data-margin-mode',
    'sheet',
  );
  await page.screenshot({
    path: `${SHOT_DIR}/margin-handoff-folded-1280.png`,
  });
  await page.locator('[data-margin-trigger]').click();
  await expect(page.locator(`#${handoffAnchorId(ids.overdue)}`)).toBeVisible();
  await page.screenshot({
    path: `${SHOT_DIR}/margin-handoff-unfolded-1280.png`,
  });
  // The 360px sheet is the widest the overdue item ever gets, so this is the
  // one reading of it that is actually legible.
  await shootRegion(
    page,
    page.locator(`[data-margin-handoff="${handoffKey(ids.overdue)}"]`),
    'margin-handoff-overdue-desktop.png',
  );

  // 390px: the rail does not exist; the margin rides as letterhead chips.
  await openDocument(page, MOBILE);
  await expect(page.getByText(/With Client User ·/).first()).toBeVisible();
  await page.screenshot({
    path: `${SHOT_DIR}/margin-handoff-chips-mobile.png`,
  });
});

test('Desk folio and the one Pulse sentence', async ({
  authenticatedPage: page,
}) => {
  for (const [name, viewport] of [
    ['desktop', DESKTOP],
    ['mobile', MOBILE],
  ] as const) {
    await page.setViewportSize(viewport);
    await page.goto('/desk', { waitUntil: 'domcontentloaded' });

    const folios = page.locator('[data-tour-anchor="desk-folio"]');
    await expect(folios.first()).toBeVisible({ timeout: 30_000 });
    await folios.first().scrollIntoViewIfNeeded();
    await folios.first().screenshot({
      path: `${SHOT_DIR}/desk-folio-${name}.png`,
    });

    // Ruling VI: exactly one aggregate sentence, and it states gates only.
    const pulse = page.getByTestId('studio-pulse-gate-sentence');
    await expect(pulse).toBeVisible({ timeout: 30_000 });
    await expect(pulse).toHaveCount(1);
    const pulseSection = page.locator('section:has(#studio-pulse)').last();
    await pulseSection.scrollIntoViewIfNeeded();
    await pulseSection.screenshot({
      path: `${SHOT_DIR}/desk-pulse-sentence-${name}.png`,
    });
  }
});
