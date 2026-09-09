/**
 * R143 — the Desk in two halves.
 *
 * LOCAL STACK ONLY. Seeds the shared workflow-gate fixture, whose `overdue`
 * gate is the past-due decision that gives the seeded studio a job with a
 * claim on its hand.
 */
import { test, expect } from '../fixtures/auth';
import { seedWorkflowGateFixture } from '../helpers/workflow-gate-fixture';
import { psqlRun } from '../helpers/psql';

const COLD = 30_000;

test.describe.configure({ mode: 'serial' });
// Single actor on a shared studio row: the three browser projects would run as
// the same seeded designer and race each other.
test.skip(({ browserName }) => browserName !== 'chromium', 'single seeded actor');

// Synchronous by design — seedWorkflowGateFixture returns ids, not a promise.
test.beforeAll(() => {
  seedWorkflowGateFixture();
  // The Desk Walkthrough's welcome modal is a Radix dialog: while it is open
  // the body carries pointer-events:none and its overlay owns every
  // elementFromPoint on the page, so the D10 hit test below would measure the
  // overlay rather than the card. The auth fixture's localStorage flag only
  // covers the help-system's own key; the Desk gate reads the persisted
  // profile record, so it has to be settled in the database — the same psql
  // write wp3-screenshots.spec.ts makes, for the same reason.
  psqlRun(
    `UPDATE public.profiles
        SET help_state = '{"tours": {"desk-walkthrough": {"completed": true}}}'::jsonb
      WHERE id = 'a0000000-0000-0000-0000-000000000004'::uuid`,
  );
});

test('a job with a claim takes a card; a quiet job takes a ledger row', async ({
  authenticatedPage: page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/desk', { waitUntil: 'domcontentloaded' });

  const roster = page.getByTestId('desk-roster');
  await expect(roster).toBeVisible({ timeout: COLD });

  const cards = roster.locator('[data-claim-card]');
  const rows = roster.locator('[data-ledger-row]');
  await expect(cards.first()).toBeVisible({ timeout: COLD });
  await expect(rows.first()).toBeVisible({ timeout: COLD });

  // No job is in both halves.
  const cardIds = await cards.evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-claim-card')),
  );
  const rowIds = await rows.evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-ledger-row')),
  );
  expect(cardIds.filter((id) => rowIds.includes(id))).toEqual([]);

  // The grid is where the day's line's more-link lands.
  await expect(page.locator('#desk-claims')).toHaveCount(1);

  // Every card carries exactly one act, named for its job.
  const firstAct = cards.first().locator('[data-action-key^="roster-"]');
  await expect(firstAct).toHaveCount(1);
  expect(await firstAct.getAttribute('aria-label')).toMatch(/ — .+$/);

  // The act's 44px floor rides the invisible halo the primitive renders last.
  await expect
    .poll(async () =>
      (await firstAct.locator('[data-action-hit]').boundingBox())?.height ?? 0,
    )
    .toBeGreaterThanOrEqual(44);

  // The at-rest half announces its count — a quantity of WORK, the one count
  // this surface permits.
  await expect(roster.locator('[data-desk-rest-head]')).toHaveText(
    /^At rest · \d+ jobs?$/,
  );

  // Nothing folds on first paint, in either half.
  await expect(roster.locator('[aria-expanded]')).toHaveCount(0);
  await expect(roster.locator('[hidden]')).toHaveCount(0);
});

test('D10 — the whole upper block is the card’s link zone', async ({
  authenticatedPage: page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/desk', { waitUntil: 'domcontentloaded' });

  const card = page.getByTestId('desk-roster').locator('[data-claim-card]').first();
  await expect(card).toBeVisible({ timeout: COLD });

  // The block is at least 88px — the sub-44px name link is the defect the card
  // exists to fix.
  const upper = card.locator('.desk-claim-upper');
  await expect
    .poll(async () => (await upper.boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(88);

  // A click landing on the person line reaches the name link, not the span:
  // the custody row and person line are pointer-events:none by ruling.
  const hitIsTheLink = await card.evaluate((el) => {
    const person = el.querySelector('[data-register="person"]') as HTMLElement | null;
    const link = el.querySelector('[data-roster-name]');
    if (!person || !link) return false;
    const box = person.getBoundingClientRect();
    const hit = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2,
    );
    return hit === link || !!hit?.closest('[data-roster-name]');
  });
  expect(hitIsTheLink).toBe(true);

  // The sentence below the block keeps its pointer events and stays
  // selectable — that is the half of the trade-off R143 preserves.
  const sentenceIsItself = await card.evaluate((el) => {
    const sentence = el.querySelector('[data-register="sentence"]') as HTMLElement | null;
    if (!sentence) return false;
    const box = sentence.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + 8, box.top + box.height / 2);
    return !hit?.closest('[data-roster-name]');
  });
  expect(sentenceIsItself).toBe(true);
});

test('Only what needs me hides the ledger and leaves the cards', async ({
  authenticatedPage: page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/desk', { waitUntil: 'domcontentloaded' });

  const roster = page.getByTestId('desk-roster');
  await expect(roster.locator('[data-ledger-row]').first()).toBeVisible({
    timeout: COLD,
  });
  const cardsBefore = await roster.locator('[data-claim-card]').count();

  await roster.getByRole('button', { name: 'Only what needs me' }).click();

  await expect(roster.locator('[data-ledger-row]')).toHaveCount(0);
  await expect(roster.locator('[data-claim-card]')).toHaveCount(cardsBefore);
  // IX18 — the label never changes with state; aria-pressed carries it.
  await expect(
    roster.getByRole('button', { name: 'Only what needs me' }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('the Desk does not scroll sideways at 390', async ({
  authenticatedPage: page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/desk', { waitUntil: 'domcontentloaded' });

  const roster = page.getByTestId('desk-roster');
  await expect(roster.locator('[data-claim-card]').first()).toBeVisible({
    timeout: COLD,
  });

  // One column below 640: three columns at 390 is a 98px card, into which a
  // Playfair name cannot wrap without truncating, and truncation is banned.
  const widths = await roster
    .locator('[data-claim-card]')
    .evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().width)),
    );
  expect(new Set(widths).size).toBe(1);
  expect(widths[0]).toBeGreaterThan(280);

  await expect
    .poll(async () =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
});
