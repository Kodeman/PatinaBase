import { test, expect, type AuthenticatedPage } from '../fixtures/auth';

const SENT_PROPOSAL_ID = 'b0000000-0000-0000-0000-000000000002';
/**
 * The Drafting Room is for DRAFTS. `draftingEditability` (lib/document/
 * drafting-editability.ts) evicts any proposal whose `status !== 'draft'` to
 * `/doc/<id>` — "already been issued. Returning to its read-only document" —
 * which is R42/R43's own rule, not a defect. Every `/drafting/…` step below
 * therefore drives the seeded DRAFT; `/doc/…` steps keep the sent proposal,
 * whose read-only document is what they are actually about.
 */
const DRAFT_PROPOSAL_ID = 'd0c10000-0000-0000-0000-0000000000b2';


async function expectNoHorizontalOverflow(page: AuthenticatedPage) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
}

test.describe('Quiet Work focused rooms', () => {
  test('Library keeps one omnibox, one shelf, and one secondary add entrance', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/library', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    await expect(page.locator('[data-library-omnibox]')).toHaveCount(1);
    await expect(page.locator('[data-library-lens]')).toHaveCount(3);
    await expect(page.locator('[data-library-shelf]')).toHaveCount(1);
    await expect(page.locator('[data-library-shelf]')).toHaveAttribute(
      'data-library-shelf',
      'personal',
    );

    await page.getByRole('tab', { name: /Studio/ }).click();
    await expect(page.locator('[data-library-shelf]')).toHaveAttribute(
      'data-library-shelf',
      'studio',
    );

    const add = page.locator('[data-library-add-trigger]');
    await add.click();
    const options = page.locator('[data-library-add-options]');
    await expect(options).toBeVisible();
    await expect(options.getByRole('button', { name: 'Compose a piece' })).toBeVisible();
    await expect(options.getByRole('button', { name: 'Import a list' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(options).toBeHidden();
    await expect(add).toBeFocused();

    await expect(page.locator('[data-mobile-edge-owner]')).toHaveCount(1);
    await expectNoHorizontalOverflow(page);
  });

  test('Drafting keeps one facet in hand and stages client copy by width', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/drafting/${DRAFT_PROPOSAL_ID}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForLoadState('networkidle');

    await expect
      .poll(() => page.locator('button[aria-expanded="true"]:visible').count())
      .toBeGreaterThanOrEqual(1);
    const payments = page.getByRole('button', { name: /Payment schedule/i }).first();
    await payments.click();
    await expect(payments).toHaveAttribute('aria-expanded', 'true');

    const preview = page.getByRole('button', {
      name: 'Preview client edition',
    });
    await expect(preview).toBeVisible();
    await preview.click();
    const dialog = page.getByRole('dialog', { name: 'Client edition preview' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(preview).toBeFocused();
    await expectNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(preview).toBeHidden();
    await expect(page.getByText("The client's copy · live")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  // US-28 (Kody, 2026-10-13) — Studio contacts keeps no index or view
  // selector in the room; its three sub-rooms open from More at their own
  // `?view=` address, and a room's views are underline words.
  test('People keeps no index in the room; its sub-rooms open from More', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/people', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    const main = page.locator('[data-people-main-panel]');
    await expect(main).toHaveAttribute('data-people-current-view', 'directory');
    await expect(page.locator('[data-people-view-group]')).toHaveCount(0);
    await page.getByRole('button', { name: 'More studio actions' }).click();
    const rooms = page.getByRole('group', { name: 'From Studio contacts' });
    await expect(rooms.getByRole('link')).toHaveCount(3);
    await rooms.getByRole('link', { name: /Client relations/ }).click();
    await expect(page).toHaveURL(/\/people\?view=threads/);
    await expect(main).toHaveAttribute('data-people-sub-room', 'client-relations');
    await page
      .locator('[data-people-sub-room-filters]')
      .getByRole('button', { name: 'Client reviews' })
      .click();
    await expect(main).toHaveAttribute('data-people-current-view', 'reviews');
    await expectNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/people', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Ledgers' }).click();
    await page
      .getByRole('group', { name: 'From Studio contacts' })
      .getByRole('button', { name: 'The Engine' })
      .click();
    await expect(page).toHaveURL(/\/people\?view=nurture/);
    await expect(main).toHaveAttribute('data-people-sub-room', 'the-engine');
    await expectNoHorizontalOverflow(page);
  });
});
