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

/** The seeded designer every fixture in this file writes as. */
const SEEDED_DESIGNER = 'a0000000-0000-0000-0000-000000000004';
/** The two fixture boards, seeded in beforeAll and deleted in afterAll. */
const BOARD_IDS = [
  'cb000000-0000-4000-8000-0000000000a1',
  'cb000000-0000-4000-8000-0000000000a2',
] as const;

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
      WHERE id = '${SEEDED_DESIGNER}'::uuid`,
  );
  // The seeds carry no `proposal_boards` rows, and RecentBoardsStrip renders
  // nothing at all against an empty query — so the placement assertion below
  // would pass vacuously without these. Both hang off the seeded studio's own
  // DRAFT proposals: `guard_proposal_child_draft_only` refuses a board on a
  // sent or accepted one. Their titles are ordinary studio words because
  // wp3-screenshots photographs this Desk. Removed again in afterAll — left
  // behind, they turn up in every later spec's boards strip.
  psqlRun(
    `INSERT INTO public.proposal_boards (id, proposal_id, name, status, updated_at)
     SELECT v.id, v.proposal_id, v.name, 'active', v.updated_at
       FROM (VALUES
         ('${BOARD_IDS[0]}'::uuid,
          'b3900000-0000-4000-8000-000000000001'::uuid,
          'Palette study', now()),
         ('${BOARD_IDS[1]}'::uuid,
          'b3900000-0000-4000-8000-000000000002'::uuid,
          'Living room board', now() - interval '1 day')
       ) AS v(id, proposal_id, name, updated_at)
       JOIN public.proposals p
         ON p.id = v.proposal_id
        AND p.designer_id = '${SEEDED_DESIGNER}'::uuid
     ON CONFLICT (id) DO NOTHING`,
  );
});

test.afterAll(() => {
  psqlRun(
    `DELETE FROM public.proposal_boards
      WHERE id IN ('${BOARD_IDS[0]}'::uuid, '${BOARD_IDS[1]}'::uuid)`,
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
  // The head goes with its half — a count of nothing is still a count.
  await expect(roster.locator('[data-desk-rest-head]')).toHaveCount(0);
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

test('the ledger keeps its sentence column, and its act is never clipped', async ({
  authenticatedPage: page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/desk', { waitUntil: 'domcontentloaded' });

  const roster = page.getByTestId('desk-roster');
  await expect(roster.locator('[data-ledger-row]').first()).toBeVisible({
    timeout: COLD,
  });

  // The sentence track has a floor: it degrades by collapsing the row, never
  // by breaking "Nothing needs your hand." one character to a line.
  const sentences = await roster
    .locator('[data-ledger-cell="sentence"]')
    .evaluateAll((els) =>
      els.map((el) => {
        const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
        return {
          width: el.getBoundingClientRect().width,
          lines: Math.round(el.getBoundingClientRect().height / lineHeight),
        };
      }),
    );
  expect(sentences.length).toBeGreaterThan(0);
  for (const { width, lines } of sentences) {
    expect(width).toBeGreaterThanOrEqual(200);
    expect(lines).toBeLessThanOrEqual(3);
  }

  // "Open the job" is 113px wide; a 96px fixed track clipped it to "OPEN THE J"
  // under the row's own overflow:hidden.
  const acts = await roster
    .locator('[data-ledger-cell="act"]')
    .evaluateAll((els) =>
      els.map((el) => ({ scrollW: el.scrollWidth, clientW: el.clientWidth })),
    );
  expect(acts.length).toBeGreaterThan(0);
  for (const { scrollW, clientW } of acts) {
    expect(scrollW).toBeLessThanOrEqual(clientW);
  }
});

test('the boards strip sits below the roster, and the Desk keeps its full width', async ({
  authenticatedPage: page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/desk', { waitUntil: 'domcontentloaded' });

  const roster = page.getByTestId('desk-roster');
  const lastRow = roster.locator('[data-ledger-row]').last();
  await expect(lastRow).toBeVisible({ timeout: COLD });

  const strip = page.locator('section[aria-labelledby="recent-mood-boards"]');
  await expect(strip).toHaveCount(1);
  // The rail variant is gone: there is no second, compact copy anywhere.
  await expect(
    page.locator('section[aria-labelledby="recent-mood-boards-compact"]'),
  ).toHaveCount(0);

  const placement = await page.evaluate(() => {
    const roster = document.querySelector(
      '[data-testid="desk-roster"]',
    ) as HTMLElement;
    const rows = Array.from(
      document.querySelectorAll('[data-ledger-row]'),
    ) as HTMLElement[];
    const strip = document.querySelector(
      'section[aria-labelledby="recent-mood-boards"]',
    ) as HTMLElement;
    const main = document.querySelector('main') as HTMLElement;
    const mainStyle = getComputedStyle(main);
    const contentWidth =
      main.getBoundingClientRect().width -
      parseFloat(mainStyle.paddingLeft) -
      parseFloat(mainStyle.paddingRight);
    return {
      stripTop: strip.getBoundingClientRect().top + window.scrollY,
      lastRowBottom:
        rows[rows.length - 1].getBoundingClientRect().bottom + window.scrollY,
      rosterWidth: roster.getBoundingClientRect().width,
      contentWidth,
    };
  });

  expect(placement.stripTop).toBeGreaterThan(placement.lastRowBottom);
  // Full width of the desk — not the ~55% a 260px rail plus its gap left behind.
  expect(placement.rosterWidth).toBeCloseTo(placement.contentWidth, 0);
});
