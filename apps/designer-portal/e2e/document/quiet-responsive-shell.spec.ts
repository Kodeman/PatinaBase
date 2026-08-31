import { test, expect, type AuthenticatedPage } from '../fixtures/auth';
import { adminDb } from '../helpers/supabase-admin';
import { quiet, scrollTo, settle } from '../helpers/lens';
import { psqlRun, psqlScalar } from '../helpers/psql';

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

/** A project-kind spread — the only documents whose spine ever carried the two
 *  blocks B1 subtracted, and the ones the band's line 1 has facts for. A FIXED
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
  // `mode: 'serial'` shares ONE page across every case, so a case began at
  // whatever width the previous one left behind — `:204` inherited 1440 from
  // `:174` and then resized twice inside itself. Every case sets its own width
  // as its first act (`openProject` / `openDocument` / an explicit
  // `setViewportSize`), so resetting to the narrow baseline here costs nothing
  // and makes each case's own first resize the only one it depends on.
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

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
    browserName,
  }) => {
    // W4-L4 webkit allowance (e2e-baseline.md W3-int, triage (b)): WebKit
    // lays out with a 9px classic scrollbar and evaluates media queries
    // against the LAYOUT viewport — measured live at a 1440 viewport,
    // `docClientWidth` reads 1431 in webkit against 1440 in chromium. At the
    // 1024 viewport this test switches to below, the same 9px puts the
    // client width at 1015, so `bulkBox.x + bulkBox.width <= 1009` is a
    // coin-toss on the scrollbar gutter, not a claim this wave's lens
    // touches (neither the band, the ladder nor the paper). Reproduced on
    // `document-lens/integration@e6da8bd76` with its own dev server before
    // this wave existed — pre-existing and environmental.
    test.skip(
      browserName === 'webkit',
      'WebKit scrollbar gutter: 1024 viewport measures a 1015px client width in webkit (9px scrollbar) vs 1024 in chromium, so bulkBox.x+width<=1009 is a coin toss unrelated to the lens (e2e-baseline.md W3-int)',
    );
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

  // ── B1 — the spine's subtraction, and what replaced it. This is the canary
  // for the wave: the rooms and the shelves left the rail for the paper at
  // every width, first as the ticket's rows and now (R127 Wave 3) as the
  // band's two lines above the paper and the ladder's stops inside the rail. ──
  test('1440px leaves the spine one block and puts the map on the paper', async ({
    authenticatedPage: page,
  }) => {
    await openProject(page, 1440);

    const spine = page.locator('[data-document-spine]');
    await expect(spine).toBeVisible();
    // W2 — the running index became the LADDER, and the ladder is the rail's
    // one block under its own accessible name.
    await expect(
      spine.locator('nav[aria-label="This paper"]'),
    ).toBeVisible({ timeout: 20_000 });
    // The two blocks B1 deleted are gone from the rail — headings first,
    // because those are what a reader would still see if either survived.
    await expect(spine.getByText(/^\s*Rooms\s*$/i)).toHaveCount(0);
    await expect(spine.getByText(/The shelves/i)).toHaveCount(0);
    // ...and the old heading the index carried before it was renamed.
    await expect(spine.getByText(/In this document/i)).toHaveCount(0);

    // R127 Wave 3 (W3-L5): the ticket's eight rows are gone and the BAND took
    // the position — two lines, one declared height, no rows. The claim this
    // keeps is the wave's own: the map is on the PAPER, not in the rail.
    const band = page.locator('[data-lens-band]');
    await expect(band).toBeVisible();
    await expect(band.locator('[data-lens-line="1"]')).toHaveCount(1);
    await expect(band.locator('[data-lens-line="2"]')).toHaveCount(1);
    await expect(page.locator('[data-ticket-row]')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test('the band carries the map at 1280 and 390, where the spine never did', async ({
    authenticatedPage: page,
  }) => {
    await openProject(page, 1280);
    // The 390 half of this case reaches the mobile bar's sections door, which
    // renders only once the page has PUBLISHED its active document. `settle()`
    // answers for the lens, not for that: run late in a long basket the door
    // was not there yet, and the same code passes alone every time. D-B28's
    // ruled precondition.
    await quiet(page);
    const band = page.locator('[data-lens-band]');
    await expect(band).toBeVisible();
    await expect(band.locator('[data-lens-line="1"]')).toHaveCount(1);
    await expect(band.locator('[data-lens-line="2"]')).toHaveCount(1);
    await expectNoHorizontalOverflow(page);

    // 390 — the band NEVER unfolds. The ticket rested as a seam here and gave
    // its eight rows back on an ask; the band has no fold, no seam and no ask
    // at any width (§4), so its two lines and its declared 56px are what the
    // reader gets. The document's index at this width is D13's sections sheet,
    // reached from the mobile bar — the one door, and it still opens.
    await page.setViewportSize({ width: 390, height: 844 });
    await settle(page);
    await expect(band).toBeVisible();
    await expect(band.locator('[data-lens-line="1"]')).toHaveCount(1);
    await expect(band.locator('[data-lens-line="2"]')).toHaveCount(1);
    await expect(
      band.getByRole('button', { name: /Unfold/i }),
    ).toHaveCount(0);
    await expect(band).not.toHaveAttribute('data-unfolded', 'true');
    // W4-N-05 / D-B35 — the LAYOUT box, not `boundingBox()`. The band is
    // `position: sticky`, and Playwright's quads come out of the compositor
    // carrying its fractional sticky offset (55.7204 at 1280) while
    // `getBoundingClientRect().height` is exactly 56 in both engines at every
    // width. `lens-band-height.spec.ts` measures the same way, for the same
    // reason: the box was right and the instrument was not.
    const bandLayoutHeight = () =>
      band.evaluate((el) => el.getBoundingClientRect().height);
    await expect.poll(bandLayoutHeight).toBe(56);

    // Scrolled, the band is still 56px and still un-unfoldable.
    await scrollTo(page, 800);
    await expect.poll(bandLayoutHeight).toBe(56);

    // The bar is re-laid out by the 1440 -> 390 resize AND by the scroll that
    // follows it, and on webkit inside the full basket the second of those was
    // still in flight when the door was first looked for (it passed alone and
    // failed in the basket, 2 runs of 3). One more settle, and a timeout that
    // is a wait rather than a race.
    await settle(page);

    // By its stable hook, not by its name: OD-11/A-01 puts the current stop
    // INTO the accessible name, so the name changes on every crossing and a
    // name-based locator races the scroll it is measuring.
    const sectionsDoor = page
      .getByRole('navigation', { name: 'Document bar' })
      .locator('[data-sections-door]');
    await expect(sectionsDoor).toBeVisible({ timeout: 15_000 });
    await sectionsDoor.click();
    await expect(
      page.getByRole('dialog', { name: /Sections of this document/i }),
    ).toBeVisible();
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
      .toBeGreaterThanOrEqual(135);
    await expect
      .poll(async () => (await spine.boundingBox())?.width ?? 1000)
      .toBeLessThanOrEqual(137);

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
    browserName,
  }) => {
    // W4-L4 webkit allowance (e2e-baseline.md W3-int, triage (b)): the same
    // 9px classic scrollbar puts webkit's layout viewport at a measured
    // 1431px against a 1440 viewport, so `min-[1440px]` never matches in
    // webkit — the shell stays on the 1180-1439 tier and the spine measures
    // 136px where this test wants >= 199. Reproduced on
    // `document-lens/integration@e6da8bd76` before this wave existed;
    // neither the band, the ladder nor the paper are implicated.
    test.skip(
      browserName === 'webkit',
      'WebKit scrollbar gutter: a 1440 viewport measures a 1431px layout viewport in webkit (9px scrollbar), so min-[1440px] never matches and the spine stays at the 136px tier (e2e-baseline.md W3-int)',
    );
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

  // ── OD-12 / C-7 landing clearance — W0-L1's tripwire, retargeted (W3-L5) ──
  // The ticket's PINNED seam used to MEASURE itself and publish
  // `--doc-seam-height`, and every `[data-index-region]` root read that back as
  // its own `scroll-margin-top`. R127 deletes the measurement: the band's
  // height is DECLARED (`--doc-band-height: 56px`) and the landing clearance is
  // declared with it (`--doc-landing-clear: calc(band + 1rem)`), so a jump
  // lands at a constant rather than at whatever the seam happened to measure.
  // Nothing publishes `--doc-seam-height` any more, and this case asserts that
  // too: a stale publisher would put the old number back into the same rule.
  test('at 1440, a running-index jump to Money lands clear of the band, at the declared 72px', async ({
    authenticatedPage: page,
  }) => {
    // PROJECT_ID (b0000000-…-d4, the seeded project-kind spread already used
    // above by openProject/the band tests in this file) is what actually
    // prints the Money region: b0000000-…-d1 was checked and mounts only
    // Client approvals + Pieces, its active_section is not the project
    // spread — jumping to "Money" would time out finding the button.
    await openProject(page, 1440);
    // The QUIET s0 (D-B28's ruled precondition, and the origin `lens-density`,
    // `lens-cls` and `lens-rail-budget` already take). The landing is polled
    // against a smooth scroll, so a paper still growing under it lands the
    // Money root somewhere else: run late in a long basket this read 153.98
    // off the declared 72, and passes alone every time.
    await quiet(page);

    const band = page.locator('[data-lens-band]');
    await expect(band).toBeVisible();

    // The seam that measured itself is gone, and so is the property it wrote.
    expect(
      await page
        .locator('[data-document-shell]')
        .evaluate((el) =>
          getComputedStyle(el).getPropertyValue('--doc-seam-height').trim(),
        ),
    ).toBe('');

    // 56 + 16. The token is a `calc()`, and `getPropertyValue` on an
    // unregistered custom property hands back the UNRESOLVED string
    // ("calc(56px + 16px)"), which `parseFloat` reads as NaN — so the length
    // is measured through a probe that actually lays the token out. (W3-L5
    // wrote the `parseFloat` form against a band that did not exist yet in its
    // lane, so this assertion had never run until integration.) The gap arm is
    // an absolute 16px rather than `1rem` because this route's root is 18px
    // (W1's measurement note): `1rem` computed to 74.
    const landingClear = await page
      .locator('[data-document-shell]')
      .evaluate((el) => {
        const probe = document.createElement('div');
        probe.style.cssText =
          'position:absolute;visibility:hidden;pointer-events:none;height:var(--doc-landing-clear)';
        el.appendChild(probe);
        const height = probe.getBoundingClientRect().height;
        probe.remove();
        return height;
      });
    expect(Math.abs(landingClear - 72)).toBeLessThanOrEqual(4);

    // Scroll the letterhead and the band's sentinel out of view, so the band
    // is pinned and the landing has something to clear.
    await scrollTo(page, 2000);
    await expect(band).toHaveAttribute('data-lens-open', 'false');

    // W2 — the running index is the LADDER: a `nav` named `This paper`,
    // one button per stop.
    const ladder = page.getByRole('navigation', { name: 'This paper' });
    await ladder.getByRole('button', { name: /^Money/i }).click();

    // The Money region ROOT (`[data-index-region="money"]`) is what
    // `globals.css`'s `scroll-margin-top: var(--doc-landing-clear)` targets.
    // `RegionHead`'s own `regionKey` for Money is "money-head" (an inner
    // element, past RegionRule's own ~6px) — the region root, not that inner
    // head, is the paper's actual landing target and the one that carries this
    // clearance contract.
    await expect
      .poll(
        async () => {
          // Scoped to the paper: the ladder's own row carries the same
          // attribute (C-4), and the landing contract is the region root's.
          const box = await page
            .locator('[data-document-paper] [data-index-region="money"]')
            .boundingBox();
          if (!box) return Number.POSITIVE_INFINITY;
          return Math.abs(box.y - 72);
        },
        { timeout: 15_000 },
      )
      .toBeLessThanOrEqual(4);
  });

  // ── OD-4 — find-in-page under `content-visibility: auto` (W4-L4) ──
  // `[data-passed]` roots get `content-visibility: auto` behind an
  // `@supports` gate (globals.css, this wave); the browser's own
  // find-in-page/`window.find()` must still reach that content and scroll it
  // into view — that is the ENTIRE reason OD-4 spends `contain-intrinsic-
  // size` rather than something cheaper like `display: none` on a passed
  // region. Runs chromium + webkit (task-impact, "the find-in-page gate").
  //
  // EXPECTED RED until W4-L1/L2/L3 attach the density observer: no
  // `[data-index-region]` carries `data-passed` yet, so the first assertion
  // below fails for that reason alone — not yet a content-visibility/find-
  // in-page defect. The pre-agreed fallback (record as an "OD-4 fallback
  // candidate" in `e2e-baseline.md` and `test.fixme` this case) applies ONLY
  // once `data-passed` exists and THIS test still fails on webkit for a
  // content-visibility reason — that has not happened yet, so it is not
  // applied here; see `e2e-baseline.md` for the note owed to whoever wires
  // Wave 4's density observer next.
  test('find-in-page reaches a passed region’s content (OD-4)', async ({
    authenticatedPage: page,
  }) => {
    await openProject(page, 1440);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await settle(page);

    const passedCount = await page
      .locator('[data-document-paper] [data-index-region][data-passed]')
      .count();
    expect(
      passedCount,
      'OD-4: no [data-index-region] carries data-passed after scrolling to the foot — ' +
        'expected until the density observer (W4-L1/L2/L3) attaches it',
    ).toBeGreaterThan(0);

    const approvalsPassed = await page
      .locator('[data-document-paper] [data-index-region="approvals"]')
      .first()
      .getAttribute('data-passed');
    expect(
      approvalsPassed,
      'the approvals region (mounted first, scrolled well past) never gains data-passed',
    ).not.toBeNull();

    // The needle lives once, in the approvals region's full body
    // (`project-approval-document.tsx`), on every project-kind document.
    const NEEDLE = 'published budget checkpoint';
    const found = await page.evaluate((needle) => window.find(needle), NEEDLE);
    expect(
      found,
      `window.find("${NEEDLE}") returned false — content skipped by content-visibility:auto must still be reachable by find-in-page (OD-4)`,
    ).toBe(true);

    const inView = await page.evaluate(() => {
      const el = document.querySelector(
        '[data-document-paper] [data-index-region="approvals"]',
      );
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < window.innerHeight;
    });
    expect(inView, 'window.find matched but the match did not scroll into view').toBe(true);
  });
});

/**
 * D-B47 — the paper's foot clears the bar that is actually there.
 *
 * The lead measured the bar at 93px at 390 (three lines in the left zone plus
 * an act whose label wraps by ruling) against a 72px inset, so the paper's last
 * ~21px — and a landed foot control's focus ring — sat under it. The bar now
 * publishes its own box on `html`, and both the shell's inset and the scroll
 * padding read it.
 */
test.describe('the mobile bar publishes its height (D-B47)', () => {
  test('at 390 the scroll padding is the bar\u2019s own box, and the last stop clears it', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/doc/${PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-document-shell]')).toBeVisible({
      timeout: 30_000,
    });
    await settle(page);

    const bar = page.locator('[data-testid="mobile-bar"]');
    await expect(bar).toBeVisible();
    const barHeight = (await bar.boundingBox())?.height ?? 0;
    expect(barHeight, 'the bar has no box at 390').toBeGreaterThanOrEqual(72);

    const padding = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom),
    );
    expect(
      Math.abs(padding - barHeight),
      `scroll-padding-bottom ${padding} vs the bar's ${barHeight}`,
    ).toBeLessThanOrEqual(1);

    // At the foot of the paper the last stop is not underneath the bar. The
    // foot MOVES on the way there — every region the walk opens grows the
    // paper below her (L-4) — so the end is chased until it stops receding.
    let previousHeight = -1;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const height = await page.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        return document.documentElement.scrollHeight;
      });
      await settle(page);
      if (height === previousHeight) break;
      previousHeight = height;
    }
    const clears = await page.evaluate(() => {
      const roots = Array.from(
        document.querySelectorAll('[data-document-paper] [data-index-region]'),
      );
      const last = roots[roots.length - 1] as HTMLElement | undefined;
      if (!last) return null;
      const barEl = document.querySelector('[data-testid="mobile-bar"]');
      const barTop = barEl
        ? barEl.getBoundingClientRect().top
        : window.innerHeight;
      return { bottom: last.getBoundingClientRect().bottom, barTop };
    });
    expect(clears, 'no region roots on this paper').not.toBeNull();
    expect(
      clears!.bottom,
      `the last root ends at ${clears!.bottom}, the bar starts at ${clears!.barTop}`,
    ).toBeLessThanOrEqual(clears!.barTop + 1);
  });

  test('at 1440 the bar publishes nothing and the inset is what it always was', async ({
    authenticatedPage: page,
  }) => {
    await openProject(page, 1440);
    await settle(page);

    const published = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue('--doc-mobile-bar-height'),
    );
    expect(published, 'the desktop widths must not carry the bar token').toBe('');
  });
});

/**
 * D-B54 — the thumb edge has ONE owner, and it is never nobody.
 *
 * Kody saw no navigation at all on prod at 390. `MobileBar` yielded the edge
 * on a bare `offer`, while `LogStrip` refused to paint an offer belonging to a
 * project other than the one in hand — so opening a document while a timer ran
 * on ANOTHER project left both null. Every mobile-edge assertion in this suite
 * (and in `action-visibility`, `quiet-focus`, `quiet-release-contracts`) runs
 * on a cold, single-document session, where `offer` is always null: the state
 * the designer is in the moment he has been working was never once executed.
 *
 * This is that state, and — W7-C3 — the spec PROVES the state stood rather
 * than assuming it. A no-offer session satisfies "bar visible, one edge
 * owner" too, so two further facts are asserted at the same moment:
 *
 *   · the seeded `…d1` row was CHAINED OUT (`duration_minutes IS NOT NULL`),
 *     which is the offer being created, read straight out of Postgres; and
 *   · the log strip is ABSENT, which is that offer being refused.
 *
 * Together they mean "an offer stood and the strip would not paint it" — the
 * exact condition under which the old bar disappeared. A control case follows:
 * with the timer on THIS project the strip's own rule is the other way, the
 * offer owns the edge, and the bar yields.
 */
const OTHER_PROJECT_ID = 'b0000000-0000-0000-0000-0000000000d1';
const LONG_PAPER_PROJECT_ID = 'b0000000-0000-0000-0000-0000000000d5';
const DESIGNER_ID = 'a0000000-0000-0000-0000-000000000004'; // designer@patina.dev

/**
 * W7-C4 — a FIXED id per row, so teardown only ever removes what this file
 * inserted. The first draft DELETED every open timer for the shared
 * `designer@patina.dev`, which under `fullyParallel: true` would destroy a row
 * a concurrent spec had just opened.
 *
 * Full isolation is not reachable here and the schema is why:
 * `uniq_project_time_entries_running_timer` is a UNIQUE index on `user_id`
 * over open rows, so this designer can hold exactly ONE running timer at a
 * time — an insert cannot proceed while any other open row exists. The
 * fixture therefore CLOSES a pre-existing open row (stamping it the way
 * `hold()` itself would) instead of deleting it: the other spec's data
 * survives as a logged entry, the unique index is freed, and nothing this
 * file did not create is ever destroyed. A dedicated designer would be the
 * complete answer; that needs a second auth fixture and its own seeded
 * documents, which is more than D-B54's falsifier is worth.
 */
const SEEDED_ENTRY_ID = 'e7000000-0000-0000-0000-0000000000d1';
const CONTROL_ENTRY_ID = 'e7000000-0000-0000-0000-0000000000d5';

/** Free the per-user unique index without deleting anyone's row. One minute,
 *  the smallest the `duration_minutes > 0` check constraint allows. */
const closeForeignOpenTimers = () =>
  psqlRun(
    `UPDATE project_time_entries
        SET duration_minutes = 1
      WHERE user_id = '${DESIGNER_ID}'::uuid
        AND duration_minutes IS NULL
        AND id NOT IN ('${SEEDED_ENTRY_ID}'::uuid, '${CONTROL_ENTRY_ID}'::uuid)`,
  );

const seedTimer = (entryId: string, projectId: string) => {
  closeForeignOpenTimers();
  psqlRun(
    `INSERT INTO project_time_entries
       (id, project_id, user_id, started_at, duration_minutes, source, activity)
     VALUES ('${entryId}'::uuid, '${projectId}'::uuid, '${DESIGNER_ID}'::uuid,
             now() - interval '20 minutes', NULL, 'timer_manual', 'design')`,
  );
};

/** `''` when the row is gone, `'open'` while it still runs, `'closed'` once
 *  `hold()` has chained it out — the offer's own proof, read from Postgres. */
const timerState = (entryId: string) =>
  psqlScalar(
    `SELECT CASE WHEN duration_minutes IS NULL THEN 'open' ELSE 'closed' END
       FROM project_time_entries WHERE id = '${entryId}'::uuid`,
  );

/** Only ever this file's own rows, by id. */
const dropSeeded = () =>
  psqlRun(
    `DELETE FROM project_time_entries
      WHERE id IN ('${SEEDED_ENTRY_ID}'::uuid, '${CONTROL_ENTRY_ID}'::uuid)`,
  );

test.describe('D-B54 · who owns the thumb edge when an offer stands', () => {
  test.afterEach(() => {
    // This fixture's own rows go; the timer `hold()` opened on the paper under
    // test is CLOSED, not deleted — same rule as the setup (W7-C4).
    dropSeeded();
    closeForeignOpenTimers();
  });

  test('a CROSS-project offer does not take the edge — the bar still prints at 390', async ({
    authenticatedPage: page,
  }) => {
    dropSeeded();
    seedTimer(SEEDED_ENTRY_ID, OTHER_PROJECT_ID);
    expect(timerState(SEEDED_ENTRY_ID), 'the fixture did not seed').toBe('open');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/doc/${LONG_PAPER_PROJECT_ID}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.locator('[data-document-shell]')).toBeVisible({
      timeout: 30_000,
    });
    await settle(page);

    // (1) The offer STOOD: `hold()` chained the foreign timer out. Without
    // this the test is green on a no-offer session and measures nothing.
    await expect
      .poll(() => timerState(SEEDED_ENTRY_ID), {
        timeout: 20_000,
        message: 'the foreign timer was never chained out — no offer stood',
      })
      .toBe('closed');

    // (2) The strip REFUSED it — the other half of the state that used to
    // leave the phone with no bottom chrome at all.
    await expect(
      page.locator('[data-mobile-edge-owner="log-offer"]'),
    ).toHaveCount(0);
    await expect(
      page.getByRole('region', { name: 'Log time offer' }),
    ).toHaveCount(0);

    // (3) And so the bar keeps the edge, alone, publishing its box.
    await expect(page.getByTestId('mobile-bar')).toBeVisible();
    await expect(page.locator('[data-mobile-edge-owner]')).toHaveCount(1);
    const published = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue('--doc-mobile-bar-height'),
    );
    expect(
      published,
      'the bar must publish its box — an unset token means no bottom chrome at all',
    ).not.toBe('');
    await expectNoHorizontalOverflow(page);
  });

  test('the control: a SAME-project timer is adopted, so no offer stands and the bar prints', async ({
    authenticatedPage: page,
  }) => {
    // The other arm of the one variable. `hold()` adopts a timer already on
    // the document in hand (`timer?.project_id === doc.projectId → return`),
    // so no offer is created at all — and the bar prints for the ordinary
    // reason, not the cross-project one. Read together with the case above,
    // this pins the seeded row as the variable that moves the outcome.
    dropSeeded();
    seedTimer(CONTROL_ENTRY_ID, LONG_PAPER_PROJECT_ID);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/doc/${LONG_PAPER_PROJECT_ID}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.locator('[data-document-shell]')).toBeVisible({
      timeout: 30_000,
    });
    await settle(page);

    expect(
      timerState(CONTROL_ENTRY_ID),
      'a timer on the document in hand is adopted, never chained out',
    ).toBe('open');
    await expect(page.getByTestId('mobile-bar')).toBeVisible();
    await expect(page.locator('[data-mobile-edge-owner]')).toHaveCount(1);
  });
});
