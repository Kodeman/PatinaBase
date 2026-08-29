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

/**
 * The act at the right of a roster line: the job's own need act where it has
 * one, `Open the job` where it has none (B2's Desk roster — the same act on
 * every job, width and section).
 */
const ROSTER_ACTION =
  /Open the job|Review decisions|Send reminder|Open the project|Follow up|Revise proposal|Review flagged lines|Continue the introduction|Review the claim|Inspect the delivery|Resolve the schedule|Open the task|Review the purchase order|Follow up with the maker|Review and send/;

test.describe.configure({ mode: 'serial' });

/**
 * Each of these two tests walks five routes, and under `next dev` every one of
 * them cold-compiles on first visit. Playwright's DEFAULT expect timeout is
 * 5s — playwright.config.ts lifts the per-TEST budget to 60s but sets no
 * `expect.timeout` — so the first assertion after a navigation is racing a
 * compile, and whichever route happens to be cold on a given run is the one
 * that fails. That is why the reported failures moved between regions from run
 * to run. The waits that immediately follow a `goto` therefore carry a
 * cold-compile budget; the box measurements below them keep the default,
 * because by then the element has already been found.
 */
const COLD = 30_000;

/**
 * The Scored Ink (I107): the visible instrument is a scored word (~26px), so
 * the 44px floor is carried by the invisible halo the primitive renders last.
 * The action itself must still be visible; the halo is what the finger hits.
 */
async function expectMinTarget(
  action: ReturnType<AuthenticatedPage['locator']>,
) {
  await expect(action).toBeVisible({ timeout: COLD });
  // Halo-or-self: a DocumentAction carries its 44px floor on the invisible
  // [data-action-hit] halo, but non-DocumentAction targets (the desk folio
  // card stamps data-action-variant="primary" on its whole ~200px surface)
  // have no halo, so fall back to measuring the action element itself.
  const halo = action.locator('[data-action-hit]');
  const haloCount = await halo.count();
  const target = haloCount >= 1 ? halo : action;
  await expect
    .poll(async () => {
      const box = await target.boundingBox();
      return box?.height ?? 0;
    })
    .toBeGreaterThanOrEqual(44);
  await expect
    .poll(async () => {
      const box = await target.boundingBox();
      return box?.width ?? 0;
    })
    .toBeGreaterThanOrEqual(44);
}

/** Mobile-bar actions carry their own 44px row as well as Scored Ink's halo. */
async function expectMinRow(
  action: ReturnType<AuthenticatedPage['locator']>,
  pixels: number,
) {
  await expect(action).toBeVisible({ timeout: COLD });
  await expect
    .poll(async () => {
      const box = await action.boundingBox();
      return box?.height ?? 0;
    })
    .toBeGreaterThanOrEqual(pixels);
  await expect
    .poll(async () => {
      const box = await action.boundingBox();
      return box?.width ?? 0;
    })
    .toBeGreaterThanOrEqual(44);
}

async function expectInlinePrimary(
  page: AuthenticatedPage,
  regionKey: string,
  label: string | RegExp,
) {
  const group = page
    .locator(`[role="group"][data-action-region="${regionKey}"]`)
    .first();
  await expect(group).toBeVisible({ timeout: COLD });
  const primaries = group.locator('[data-action-variant="primary"]');
  await expect(primaries).toHaveCount(1, { timeout: COLD });
  const primary = primaries.first();
  await expect(primary).toContainText(label, { timeout: COLD });
  await expectMinTarget(primary);
  return primary;
}

/**
 * A head whose sole act is a quiet doorway rather than a leader. The action
 * REGION contract is identical — role=group + data-action-region on the same
 * element, one act, a 44px target — but no primary is claimed, because the
 * ruling that retired the act left nothing to elect. Asserting `toHaveCount(0)`
 * on the leader variants keeps C7 honest in both directions: a head that must
 * not lead cannot quietly grow a leader back.
 */
async function expectInlineQuietAct(
  page: AuthenticatedPage,
  regionKey: string,
  actionKey: string,
  label: string | RegExp,
) {
  const group = page
    .locator(`[role="group"][data-action-region="${regionKey}"]`)
    .first();
  await expect(group).toBeVisible({ timeout: COLD });
  const act = group.locator(`[data-action-key="${actionKey}"]`);
  await expect(act).toHaveCount(1, { timeout: COLD });
  await expect(
    group.locator(
      '[data-action-variant="primary"], [data-action-variant="inked"]',
    ),
  ).toHaveCount(0);
  await expect(act).toContainText(label);
  await expectMinTarget(act);
  return act;
}

async function expectMobileBar(
  page: AuthenticatedPage,
  actionKey: string,
  label: string | RegExp,
) {
  const bar = page.getByTestId('mobile-bar');
  await expect(bar).toBeVisible({ timeout: COLD });
  await expect(page.locator('[data-mobile-edge-owner]')).toHaveCount(1);
  await expect(bar).toHaveAttribute('data-mobile-edge-owner', 'document-bar');
  const action = bar.locator(`[data-action-key="${actionKey}"]`);
  await expect(action).toHaveCount(1, { timeout: COLD });
  await expect(action).toContainText(label, { timeout: COLD });
  await expectMinRow(action, 44);
}

test.describe('Inked Instruments action visibility', () => {
  test('desktop surfaces expose one legible primary per region', async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto('/desk', { waitUntil: 'domcontentloaded' });
    await expectInlinePrimary(page, 'desk-head', 'Capture a lead');
    await expect(page.getByTestId('mobile-bar')).toBeHidden();

    // B2 — the four-up folio grid is ONE roster of every live job now, grouped
    // by stage. Its acts are one region, and that region elects no leader: the
    // Desk's single inked act is the head's `Capture a lead`, asserted above.
    // C7 is kept honest in both directions — a roster that grew a leader back
    // would put two primaries on one screen.
    const roster = page.getByTestId('desk-roster');
    await expect(roster).toBeVisible({ timeout: COLD });
    const rosterActs = page.locator(
      '[role="group"][data-action-region="every-job"]',
    );
    await expect(rosterActs).toHaveCount(1, { timeout: COLD });
    await expect(
      rosterActs.locator(
        '[data-action-variant="primary"], [data-action-variant="inked"]',
      ),
    ).toHaveCount(0);

    // One line per job, under a stage heading, and every line carries its own
    // act at a real 44px target.
    await expect(roster.locator('h3').first()).toBeVisible({ timeout: COLD });
    const firstLine = roster.locator('[data-roster-line]').first();
    await expect(firstLine).toBeVisible({ timeout: COLD });
    const rosterAction = firstLine.locator('[data-action-key^="roster-"]');
    await expect(rosterAction).toHaveCount(1, { timeout: COLD });
    await expect(rosterAction).toContainText(ROSTER_ACTION, { timeout: COLD });
    await expectMinTarget(rosterAction);

    await page.goto(`/doc/${SENT_PROPOSAL_ID}`, {
      waitUntil: 'domcontentloaded',
    });
    await expectInlinePrimary(page, 'proposal-watch-actions', 'Mark signed');

    await page.goto('/library', { waitUntil: 'domcontentloaded' });
    await expectInlinePrimary(page, 'room-head', 'Capture');

    await page.goto('/people', { waitUntil: 'domcontentloaded' });
    await expectInlinePrimary(page, 'room-head', 'Add person');

    // The Drafting Room claims no primary, and has not since f74e20b88
    // ("legacy send retirement"): a project-bound furnishing draft now reaches
    // the client as a named authorization released from the schedule, so this
    // Room stays for facet editing only (drafting-room.tsx:360-372) and its
    // sole head act is the quiet `Share…` doorway
    // (proposal-share-instrument.tsx:50-56, a tertiary). This line asserted
    // `/^Send/` against markup that stopped rendering it two waves earlier —
    // the ACT moved by ruling; role=group and data-action-region never did,
    // which is why the assertion below still queries the same region.
    await page.goto(`/drafting/${DRAFT_PROPOSAL_ID}`, {
      waitUntil: 'domcontentloaded',
    });
    await expectInlineQuietAct(page, 'room-head', 'share-proposal', 'Share');
  });

  // QUARANTINED 2026-08-29, Smart Lens W0. Reason: the Desk no longer
  // registers a mobile-dock primary action for capture-lead — confirmed by
  // the codebase's own regression witness,
  // `src/app/(document)/desk/page.test.tsx`'s "Desk — capture-lead affordance
  // (A9)" describe block: "registers no mobile-dock primary action; the
  // header CTA is the only on-screen 'Capture a lead'"
  // (`expect(useMobilePrimaryAction).not.toHaveBeenCalled()`). mobile-bar
  // falls back to its documented "In hand / Today" glance instead. A real,
  // already-shipped product/ruling change (A9), not a fixture or ordering
  // issue — out of this wave's fix scope. Not a lens regression — failing the
  // same way on main@dab057537. Un-fixme when: this assertion is replaced
  // with a check for the "In hand / Today" glance mobile-bar shows in
  // capture-lead's place. Owner: e2e triage.
  test.fixme(
    '390px desk mobile bar promotes capture-lead (retired by A9)',
    async ({ authenticatedPage: page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width: 390, height: 844 });

      await page.goto('/desk', { waitUntil: 'domcontentloaded' });
      await expectMobileBar(page, 'capture-lead', 'Capture a lead');

      // Regression: the first client-journey form must remain usable without
      // sideways scrolling at the smallest supported phone width.
      await page
        .getByTestId('mobile-action-dock')
        .locator('[data-action-key="capture-lead"]')
        .click();
      const captureLeadSheet = page.getByRole('dialog', {
        name: 'Capture a lead',
      });
      await expect(captureLeadSheet).toBeVisible({ timeout: COLD });
      for (const field of [
        captureLeadSheet.getByLabel('Contact'),
        captureLeadSheet.getByLabel('The project (one line)'),
      ]) {
        await expect
          .poll(async () => {
            const box = await field.boundingBox();
            return box !== null && box.x >= 0 && box.x + box.width <= 390;
          })
          .toBe(true);
      }
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        )
        .toBe(true);
      await captureLeadSheet.getByRole('button', { name: 'Close sheet' }).click();
      await expect(captureLeadSheet).toBeHidden();
    },
  );

  test('390px surfaces place context, primary, and More in one edge owner', async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto(`/doc/${SENT_PROPOSAL_ID}`, {
      waitUntil: 'domcontentloaded',
    });
    await expectMobileBar(page, 'mark-proposal-signed', 'Mark signed');

    await page.goto('/library', { waitUntil: 'domcontentloaded' });
    await expectMobileBar(page, 'capture-piece', 'Capture');

    await page.goto('/people', { waitUntil: 'domcontentloaded' });
    await expectMobileBar(page, 'add-person', 'Add person');

    // The Drafting Room is deliberately absent from this walk. Since f74e20b88
    // it registers `useMobilePrimaryAction(null)` — no act is promoted to the
    // edge — and its one doorway is published into More as a SECONDARY
    // (proposal-share-instrument.tsx:17-24). This step asserted a
    // `send-proposal` primary the same ruling retired. The mobile contract that
    // replaced it is held at unit level by drafting-room.test.tsx's "publishes
    // Share to mobile More even at 0% when Send is absent".
  });
});
