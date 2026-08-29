import { test, expect, type AuthenticatedPage } from '../fixtures/auth';
import { adminDb } from '../helpers/supabase-admin';

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


test.describe.configure({ mode: 'serial' });

async function openDocument(page: AuthenticatedPage, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/doc/${SENT_PROPOSAL_ID}`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.locator('[data-document-shell]')).toBeVisible();
}

/** A project-kind spread — the only documents that print the ticket, and the
 *  only ones whose spine ever carried the two blocks B1 subtracted. A FIXED
 *  seed UUID, not one of the DB-generated project ids: those change on every
 *  `supabase:reset` and a spec pinned to one rots silently. */
const PROJECT_ID = 'b0000000-0000-0000-0000-0000000000d4';

async function openProject(page: AuthenticatedPage, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/doc/${PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-document-shell]')).toBeVisible({ timeout: 30_000 });
}

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

/** The bulk-actions test needs a draft with SCHEDULE LINES to select, and the
 *  seeded draft carries none (`proposal_items` is empty for it). The test
 *  therefore lays its own two lines down and takes them away again, rather
 *  than depending on a shared seed staying a particular shape — the same
 *  posture as the plan room's throwaway project. */
const BULK_FIXTURE_MARK = 'quiet-responsive-shell fixture';

test.describe('Quiet Work responsive document shell', () => {
  test.beforeAll(async () => {
    const { error } = await adminDb.from('proposal_items').insert([
      {
        proposal_id: DRAFT_PROPOSAL_ID,
        name: 'Walnut sectional sofa',
        description: BULK_FIXTURE_MARK,
        quantity: 1,
        unit_price: 650000,
        unit_sell_price: 650000,
        line_total_cents: 650000,
        vendor_name: 'Lawson',
        position: 0,
      },
      {
        proposal_id: DRAFT_PROPOSAL_ID,
        name: 'Hand-knotted wool rug',
        description: BULK_FIXTURE_MARK,
        quantity: 1,
        unit_price: 420000,
        unit_sell_price: 420000,
        line_total_cents: 420000,
        vendor_name: 'Beni Ourain Co.',
        position: 1,
      },
    ]);
    if (error) throw new Error(`could not seed the drafting fixture lines: ${error.message}`);
  });

  test.afterAll(async () => {
    await adminDb
      .from('proposal_items')
      .delete()
      .eq('proposal_id', DRAFT_PROPOSAL_ID)
      .eq('description', BULK_FIXTURE_MARK);
  });

  test('keeps drafting bulk actions above persistent bottom chrome', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/drafting/${DRAFT_PROPOSAL_ID}`, {
      waitUntil: 'domcontentloaded',
    });
    const ffeFacet = page.getByRole('button', { name: /^FF&E / });
    await expect(async () => {
      if ((await ffeFacet.getAttribute('aria-expanded')) !== 'true') {
        await ffeFacet.click();
      }
      await expect(ffeFacet).toHaveAttribute('aria-expanded', 'true', {
        timeout: 1_000,
      });
    }).toPass({ timeout: 10_000 });

    const firstScheduleItem = page
      .getByRole('checkbox', { name: /^Select / })
      .first();
    await expect(firstScheduleItem).toBeVisible();
    await firstScheduleItem.check();

    const bulkActions = page.getByRole('region', { name: 'Bulk actions' });
    const studioDrawer = page.getByRole('navigation', {
      name: 'Studio drawer',
    });
    await expect(bulkActions).toBeVisible();
    await expect(studioDrawer).toBeVisible();
    await expect
      .poll(async () => {
        const [bulkBox, drawerBox] = await Promise.all([
          bulkActions.boundingBox(),
          studioDrawer.boundingBox(),
        ]);
        return !!bulkBox && !!drawerBox
          ? bulkBox.y + bulkBox.height <= drawerBox.y
          : false;
      })
      .toBe(true);

    await page.setViewportSize({ width: 1024, height: 900 });
    const mobileBar = page.getByTestId('mobile-bar');
    await expect(mobileBar).toBeVisible();
    await expect(studioDrawer).toBeHidden();
    await expect
      .poll(async () => {
        const [bulkBox, mobileBox] = await Promise.all([
          bulkActions.boundingBox(),
          mobileBar.boundingBox(),
        ]);
        return !!bulkBox && !!mobileBox
          ? bulkBox.y + bulkBox.height <= mobileBox.y &&
              bulkBox.x >= 15 &&
              bulkBox.x + bulkBox.width <= 1009
          : false;
      })
      .toBe(true);
  });

  // ── B1 — the spine's subtraction, and the ticket that replaced it. This is
  // the canary for the wave: the rooms and the shelves left the rail and
  // became the ticket's rows on the paper, at every width. ──
  test('1440px leaves the spine one block and puts the map on the paper', async ({
    authenticatedPage: page,
  }) => {
    await openProject(page, 1440);

    const spine = page.locator('[data-document-spine]');
    await expect(spine).toBeVisible();
    // The running index survives as the spine's ONE block, under its own name.
    await expect(spine.getByText(/On this paper/i)).toBeVisible({ timeout: 20_000 });
    // The two blocks B1 deleted are gone from the rail — headings first,
    // because those are what a reader would still see if either survived.
    await expect(spine.getByText(/^\s*Rooms\s*$/i)).toHaveCount(0);
    await expect(spine.getByText(/The shelves/i)).toHaveCount(0);
    // ...and the old heading the index carried before it was renamed.
    await expect(spine.getByText(/In this document/i)).toHaveCount(0);

    const ticket = page.locator('[data-job-ticket]');
    await expect(ticket).toBeVisible();
    await expect(ticket.locator('[data-ticket-row]')).toHaveCount(8);
    await expectNoHorizontalOverflow(page);
  });

  test('the ticket carries the map at 1280 and 390, where the spine never did', async ({
    authenticatedPage: page,
  }) => {
    await openProject(page, 1280);
    const ticket = page.locator('[data-job-ticket]');
    await expect(ticket).toBeVisible();
    await expect(ticket.locator('[data-ticket-row]')).toHaveCount(8);
    await expectNoHorizontalOverflow(page);

    // 390 — the ticket opens at rest AS the seam, and unfolds to the eight
    // rows on the reader's ask.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(ticket).toBeVisible();
    await expect(ticket).not.toHaveAttribute('data-unfolded', 'true');
    await ticket.getByRole('button', { name: /Unfold/i }).click();
    await expect(ticket).toHaveAttribute('data-unfolded', 'true');
    await expect(ticket.locator('[data-ticket-row]')).toHaveCount(8);
    await expectNoHorizontalOverflow(page);
  });

  test('1024px protects one paper canvas and one mobile edge', async ({
    authenticatedPage: page,
  }) => {
    await openDocument(page, 1024);

    await expect(page.getByTestId('mobile-bar')).toBeVisible();
    await expect(page.locator('[data-mobile-edge-owner]')).toHaveCount(1);
    await expect(page.locator('[data-document-spine]')).toBeHidden();
    await expect(page.locator('[data-margin-trigger]')).toBeHidden();
    await expect(page.locator('[data-margin-panel]')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    await expectNoHorizontalOverflow(page);
  });

  test('1280px uses the compact spine and an on-demand margin', async ({
    authenticatedPage: page,
  }) => {
    await openDocument(page, 1280);

    await expect(page.getByTestId('mobile-bar')).toBeHidden();
    const spine = page.locator('[data-document-spine]');
    await expect(spine).toBeVisible();
    await expect
      .poll(async () => (await spine.boundingBox())?.width ?? 0)
      .toBeGreaterThanOrEqual(55);
    await expect
      .poll(async () => (await spine.boundingBox())?.width ?? 1000)
      .toBeLessThanOrEqual(57);

    const trigger = page.locator('[data-margin-trigger]');
    await expect(trigger).toBeVisible();
    await trigger.click();
    const margin = page.locator('[data-margin-panel]');
    await expect(margin).toHaveAttribute('role', 'dialog');
    await expect(margin).toHaveAttribute('data-margin-mode', 'sheet');
    await expect(page.locator('[data-margin-close]')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(margin).toHaveAttribute('aria-hidden', 'true');
    await expect(trigger).toBeFocused();
    await expectNoHorizontalOverflow(page);
  });

  test('1440px restores the full labelled spine and settled margin rail', async ({
    authenticatedPage: page,
  }) => {
    await openDocument(page, 1440);

    await expect(page.getByTestId('mobile-bar')).toBeHidden();
    const spine = page.locator('[data-document-spine]');
    await expect(spine).toBeVisible();
    await expect
      .poll(async () => (await spine.boundingBox())?.width ?? 0)
      .toBeGreaterThanOrEqual(199);
    await expect(page.locator('[data-margin-trigger]')).toBeHidden();
    const margin = page.locator('[data-margin-panel]');
    await expect(margin).toBeVisible();
    await expect(margin).toHaveAttribute('data-margin-mode', 'rail');
    await expect(margin).toHaveAttribute('aria-hidden', 'false');
    await expectNoHorizontalOverflow(page);
  });

  // ── OD-4/OD-12 landing clearance — W0-L1 tripwire ──
  // The ticket's PINNED seam publishes `--doc-seam-height`
  // (job-ticket.tsx), and every `[data-index-region]` root reads it back as
  // its own `scroll-margin-top` (globals.css), so a running-index jump lands
  // clear of the pinned ticket rather than under it. This is TODAY's
  // clearance. OD-12/the W3 ladder rewrite retargets this to a fixed
  // `--doc-landing-clear` (72px) instead of the ticket's own measured
  // height — when that lands, this assertion's right-hand side becomes the
  // fixed token instead of the seam-height custom property.
  test('at 1440, a running-index jump to Money lands clear of the pinned ticket seam', async ({
    authenticatedPage: page,
  }) => {
    // PROJECT_ID (b0000000-…-d4, the seeded project-kind spread already used
    // above by openProject/the ticket tests in this file) is what actually
    // prints the Money region: b0000000-…-d1 was checked and mounts only
    // Client approvals + Pieces, its active_section is not the project
    // spread — jumping to "Money" would time out finding the button.
    await openProject(page, 1440);

    const ticket = page.locator('[data-job-ticket]');
    await expect(ticket).toBeVisible();

    // Scroll the letterhead and the ticket's own sentinel out of view so the
    // ticket pins and folds, publishing --doc-seam-height.
    await page.evaluate(() => window.scrollTo(0, 2000));
    await expect(ticket).toHaveAttribute('data-pinned', 'true');
    await expect
      .poll(() =>
        page
          .locator('[data-document-shell]')
          .evaluate(
            (el) =>
              parseFloat(getComputedStyle(el).getPropertyValue('--doc-seam-height')) || 0,
          ),
      )
      .toBeGreaterThan(0);

    const runningIndex = page.getByRole('group', { name: 'On this paper' });
    await runningIndex.getByRole('button', { name: /^Money/i }).click();

    // The Money region ROOT (`[data-index-region="money"]`) is what
    // `globals.css`'s `scroll-margin-top: var(--doc-seam-height, 0px)`
    // targets, and it lands within a sub-pixel of the seam height (verified
    // against the live DOM). `RegionHead`'s own `regionKey` for Money is
    // "money-head" (an inner element, past RegionRule's own ~6px) — the
    // region root, not that inner head, is the paper's actual landing
    // target and the one that carries this clearance contract.
    await expect
      .poll(
        async () => {
          const box = await page.locator('[data-index-region="money"]').boundingBox();
          if (!box) return Number.POSITIVE_INFINITY;
          const seamHeight = await page
            .locator('[data-document-shell]')
            .evaluate(
              (el) =>
                parseFloat(getComputedStyle(el).getPropertyValue('--doc-seam-height')) || 0,
            );
          return Math.abs(box.y - seamHeight);
        },
        { timeout: 15_000 },
      )
      .toBeLessThanOrEqual(4);
  });
});
