import { test, expect, type AuthenticatedPage } from '../fixtures/auth';

const SENT_PROPOSAL_ID = 'b0000000-0000-0000-0000-000000000002';
const FOLIO_ACTION =
  /Review decisions|Send reminder|Open the project|Follow up|Revise proposal|Review flagged lines|Continue the introduction|Review the claim|Inspect the delivery|Resolve the schedule|Open the task|Review the purchase order|Follow up with the maker|Review and send/;

test.describe.configure({ mode: 'serial' });

/**
 * The Scored Ink (I107): the visible instrument is a scored word (~26px), so
 * the 44px floor is carried by the invisible halo the primitive renders last.
 * The action itself must still be visible; the halo is what the finger hits.
 */
async function expectMinTarget(
  action: ReturnType<AuthenticatedPage['locator']>,
) {
  await expect(action).toBeVisible();
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

/**
 * The mobile dock passes `min-h-12 w-full`, so its own row — not the halo —
 * must stay at least 48px tall.
 */
async function expectMinRow(
  action: ReturnType<AuthenticatedPage['locator']>,
  pixels: number,
) {
  await expect(action).toBeVisible();
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
  await expect(group).toBeVisible();
  const primaries = group.locator('[data-action-variant="primary"]');
  await expect(primaries).toHaveCount(1);
  const primary = primaries.first();
  await expect(primary).toContainText(label);
  await expectMinTarget(primary);
  return primary;
}

async function expectMobileDock(
  page: AuthenticatedPage,
  actionKey: string,
  label: string | RegExp,
) {
  const dock = page.getByTestId('mobile-action-dock');
  await expect(dock).toBeVisible();
  const action = dock.locator(`[data-action-key="${actionKey}"]`);
  await expect(action).toHaveCount(1);
  await expect(action).toContainText(label);
  await expectMinRow(action, 48);
}

test.describe('Inked Instruments action visibility', () => {
  test('desktop surfaces expose one legible primary per region', async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto('/desk', { waitUntil: 'domcontentloaded' });
    await expectInlinePrimary(page, 'desk-head', 'Capture a lead');
    await expect(page.getByTestId('mobile-action-dock')).toBeHidden();

    const folioAction = page
      .locator(
        '[data-tour-anchor="desk-folio"] [data-action-region="needs-your-hand"][data-action-variant="primary"]',
      )
      .first();
    await expect(folioAction).toBeVisible();
    await expect(folioAction).toContainText(FOLIO_ACTION);
    await expectMinTarget(folioAction);

    await page.goto(`/doc/${SENT_PROPOSAL_ID}`, {
      waitUntil: 'domcontentloaded',
    });
    await expectInlinePrimary(page, 'proposal-watch-actions', 'Mark signed');

    await page.goto('/library', { waitUntil: 'domcontentloaded' });
    await expectInlinePrimary(page, 'room-head', 'Capture');

    await page.goto('/people', { waitUntil: 'domcontentloaded' });
    await expectInlinePrimary(page, 'room-head', 'Add person');

    await page.goto(`/drafting/${SENT_PROPOSAL_ID}`, {
      waitUntil: 'domcontentloaded',
    });
    await expectInlinePrimary(page, 'room-head', /^Send/);
  });

  test('390px surfaces mirror the active primary in a separate dock', async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto('/desk', { waitUntil: 'domcontentloaded' });
    await expectMobileDock(page, 'capture-lead', 'Capture a lead');
    await expect(
      page.getByTestId('mobile-action-dock-clearance'),
    ).toBeVisible();

    await page.goto(`/doc/${SENT_PROPOSAL_ID}`, {
      waitUntil: 'domcontentloaded',
    });
    await expectMobileDock(page, 'mark-proposal-signed', 'Mark signed');

    await page.goto('/library', { waitUntil: 'domcontentloaded' });
    await expectMobileDock(page, 'capture-piece', 'Capture');

    await page.goto('/people', { waitUntil: 'domcontentloaded' });
    await expectMobileDock(page, 'add-person', 'Add person');

    await page.goto(`/drafting/${SENT_PROPOSAL_ID}`, {
      waitUntil: 'domcontentloaded',
    });
    await expectMobileDock(page, 'send-proposal', /^Send/);
  });
});
