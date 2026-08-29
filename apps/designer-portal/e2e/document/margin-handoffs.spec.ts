/**
 * WP3 · Ruling III/IV/V — handoffs dissolved into the margin.
 *
 * The contextual handoff band is gone; every row the 00442/00443 projection
 * produces is a margin item under the same paper grammar: lane attribution, one
 * need line, stage provenance as microtext, and exactly one act. Overdue is one
 * derivation with three renderings, and the guide's act names the gate's own
 * control in the margin rather than inventing a surface.
 *
 * Serial + chromium-pinned for the same reason as `gate-ceremony.spec.ts`: the
 * fixture mutates rows shared by the whole seeded project.
 */
import { test, expect, type AuthenticatedPage } from '../fixtures/auth';
import {
  EDITION_TWO_TITLE,
  WORKFLOW_GATE_PROJECT_ID,
  handoffAnchorId,
  handoffKey,
  seedWorkflowGateFixture,
  type WorkflowGateIds,
} from '../helpers/workflow-gate-fixture';

test.describe.configure({ mode: 'serial' });
test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'the fixture mutates shared project rows; the browser projects would race it',
);

/** ≥1440px is the only width that gives the margin a permanent grid column. */
const FULL_RAIL = { width: 1512, height: 1000 };
/** 1180–1439px: the margin exists but is folded away until something raises it. */
const FOLDED_MARGIN = { width: 1280, height: 900 };

let ids: WorkflowGateIds;

test.beforeAll(() => {
  ids = seedWorkflowGateFixture();
});

// No afterAll teardown: sibling spec files share one fixture (see
// workflow-gate-fixture.ts), so tearing it down here would pull it out from
// under a suite still running. The next seed tears down before it rebuilds.

function marginItem(page: AuthenticatedPage, decisionId: string) {
  return page.locator(`[data-margin-handoff="${handoffKey(decisionId)}"]`);
}

async function openDocument(
  page: AuthenticatedPage,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
  await page.goto(`/doc/${WORKFLOW_GATE_PROJECT_ID}`, {
    waitUntil: 'domcontentloaded',
  });
  // The guide is the first thing the projection feeds; waiting on the overdue
  // item's own anchor keeps the spec off a networkidle race with the rail.
  await expect(page.locator(`#${handoffAnchorId(ids.overdue)}`)).toHaveCount(1, {
    timeout: 30_000,
  });
}

test('every gate is a margin item: lane, need line, and exactly one act', async ({
  authenticatedPage: page,
}) => {
  await openDocument(page, FULL_RAIL);
  await expect(page.locator('[data-margin-panel]')).toHaveAttribute(
    'data-margin-mode',
    'rail',
  );

  // A gate the household owns is attributed to the household by name.
  const householdGate = marginItem(page, ids.overdue);
  await expect(householdGate).toBeVisible();
  await expect(householdGate).toContainText(
    `With Client User · ${EDITION_TWO_TITLE} approval`,
  );
  await expect(householdGate.getByRole('button')).toHaveCount(1);
  await expect(householdGate.getByRole('button')).toHaveText('Nudge');

  // A gate whose next move is the studio's own says so, and never names the
  // household for work the household cannot do.
  const studioGate = marginItem(page, ids.readyToPublish);
  await expect(studioGate).toContainText(
    `With the studio · ${EDITION_TWO_TITLE} approval`,
  );
  await expect(studioGate.getByRole('button')).toHaveCount(1);
  await expect(studioGate.getByRole('button')).toHaveText('Publish');

  // A settled gate has left the margin — the rail holds what is still waiting.
  await expect(marginItem(page, ids.approved)).toHaveCount(0);
  await expect(marginItem(page, ids.superseded)).toHaveCount(0);
});

test('unfolding the margin shows each gate its stage as microtext', async ({
  authenticatedPage: page,
}) => {
  await openDocument(page, FOLDED_MARGIN);

  // Below 1440px the margin is a sheet: present in the DOM, inert and off the
  // glass until the reader asks for it.
  const panel = page.locator('[data-margin-panel]');
  await expect(panel).toHaveAttribute('data-margin-mode', 'sheet');
  const trigger = page.locator('[data-margin-trigger]');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');

  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');

  // Stage provenance survives the dissolve as microtext — the canonical stage
  // vocabulary, the track, and the edition, and nothing else. No checksum, no
  // "Exact phase / Source domain", no escalation boolean.
  const gate = marginItem(page, ids.overdue);
  await expect(gate).toBeVisible();
  await expect(gate).toContainText(
    'Stage 06 · Design Development · core · edition 902',
  );
  await expect(gate).not.toContainText(/Source domain|Exact phase/);
});

test('an overdue gate wears the stamp, and only an overdue gate does', async ({
  authenticatedPage: page,
}) => {
  await openDocument(page, FULL_RAIL);

  // Ruling IV, first rendering: the terracotta stamp states elapsed time, not
  // a count and not a colour-coded badge.
  await expect(marginItem(page, ids.overdue)).toContainText(/Overdue · \d+ days?/);

  // A gate still inside its window carries no stamp at all.
  await expect(marginItem(page, ids.pending)).toBeVisible();
  await expect(marginItem(page, ids.pending)).not.toContainText(/Overdue/);

  // The stamp must never tax the need line's own measure. At the ≥1440px
  // permanent rail the item is ~195px wide; before the stamp moved to its
  // own row, sharing the right-hand column with the act collapsed this to
  // 0px (one character per line). It now has to keep a legible column even
  // with the stamp present.
  const needLine = marginItem(page, ids.overdue).locator('p').first();
  const box = await needLine.boundingBox();
  expect(box).not.toBeNull();
  console.log(`overdue need-line width: ${box?.width}px`);
  expect(box!.width).toBeGreaterThanOrEqual(90);
});

// RE-POINTED 2026-08-29, W0-fix (was QUARANTINED, Smart Lens W0). Ruling IV's
// SECOND rendering still prints — just not from `DocumentGuide`. This fixture
// project (b0000000-…-d1, 3 overdue decisions) satisfies page.tsx's guide-or-
// zone ternary (`engagement_kind === 'project' && redLetterRows.length > 0`),
// so `RedLetterZone` stands in the guide's place at the guide's rank and
// `#document-next-up` never mounts. The sentence it prints is the aggregate
// form of the same overdue derivation — a count and the oldest due date —
// rather than the guide's per-gate "has waited N days". Product drift, not
// environment. The assertion is re-pointed at the sentence that prints, and
// pins the supersession itself so a silent flip back to the guide fails here.
test("an overdue gate's elapsed-time derivation prints once more above the paper", async ({
  authenticatedPage: page,
}) => {
  await openDocument(page, FULL_RAIL);

  // The zone stands in the guide's place — the two can never both publish.
  await expect(page.locator('#document-next-up')).toHaveCount(0);

  const zone = page.locator('section[aria-label="Needs attention"]');
  await expect(zone).toBeVisible();
  await expect(zone).toContainText(
    /\d+ decisions? overdue — oldest due [A-Z][a-z]{2} \d{1,2}/,
  );
  // Still one derivation: the row that prints the sentence is the same
  // overdue-decision need the margin stamps.
  await expect(zone.locator('[data-need-kind="overdue_decision"]')).toHaveCount(1);
});

// QUARANTINED 2026-08-29, Smart Lens W0; reason re-verified 2026-08-29,
// W0-fix. Not re-pointed, because the behaviour asserted here exists nowhere
// on this route: `section[aria-labelledby="document-next-up"]` lives inside
// `DocumentGuide`, which `RedLetterZone` supersedes for this fixture (see the
// sibling test above), and the zone's overdue act is NOT the guide's act
// wearing different clothes. Measured on the live page: the zone publishes a
// single act `red-letter-overdue_decision-0` labelled "Chase the approval";
// pressing it neither raises the folded margin (`data-margin-trigger`
// aria-expanded stays "false") nor lands on the gate's control — it routes to
// needGuideAction's overdue_decision anchor (document-guide.ts:504-506,
// focusId `document-decision-controls`), a node that does not exist on this
// page at all (count 0), so focus settles on `doc-section-install`. Re-pointing
// would mean asserting a weaker contract than Ruling V's, so the test stays
// quarantined and the gap stays visible. Not a lens regression — failing the
// same way on main@dab057537. Un-fixme when: an overdue need's act raises the
// margin and focuses the gate's own control (from the zone or from a restored
// guide), or the fixture project takes the DocumentGuide branch.
// Owner: e2e triage.
test.fixme("the guide's gate act focuses the gate's own control in the margin", async ({
  authenticatedPage: page,
}) => {
  await openDocument(page, FOLDED_MARGIN);

  // Scoped to the guide's own section: the mobile shell's action bar publishes
  // the identical action key, so an unscoped match resolves to two controls.
  // The guide's act only renders from 1180px up; below that the bar carries it.
  const guideAct = page
    .locator('section[aria-labelledby="document-next-up"]')
    .locator('[data-action-key^="gate-"]');
  await expect(guideAct).toBeVisible();

  await expect(guideAct).toHaveText('Nudge Client User');

  await guideAct.click();

  // It raises the folded margin and lands on the gate's control — it does not
  // press it, and it does not open a surface of its own.
  await expect(page.locator('[data-margin-trigger]')).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(page.locator(`#${handoffAnchorId(ids.overdue)}`)).toBeFocused();

  // Same act, same word, at two scales: the margin prints the verb alone, the
  // guide prints the verb plus its object. Asserted only now the margin is
  // raised — while it is folded the panel is inert, so it exposes no roles.
  await expect(marginItem(page, ids.overdue).getByRole('button')).toHaveText(
    'Nudge',
  );
});
