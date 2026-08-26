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

/** Mobile-bar actions carry their own 44px row as well as Scored Ink's halo. */
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

async function expectMobileBar(
  page: AuthenticatedPage,
  actionKey: string,
  label: string | RegExp,
) {
  const bar = page.getByTestId('mobile-bar');
  await expect(bar).toBeVisible();
  await expect(page.locator('[data-mobile-edge-owner]')).toHaveCount(1);
  await expect(bar).toHaveAttribute('data-mobile-edge-owner', 'document-bar');
  const action = bar.locator(`[data-action-key="${actionKey}"]`);
  await expect(action).toHaveCount(1);
  await expect(action).toContainText(label);
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

    const folioAction = page
      .locator(
        '[data-tour-anchor="desk-folio"] [data-action-region="needs-your-hand"][data-action-variant="primary"]',
      )
      .first();
    await expect(folioAction).toBeVisible();
    // A1 follow-up: the pick-up Link is now a full-bleed sibling BEHIND
    // FolderFace, so the action label prints there, not inside this Link —
    // its own textContent is empty. The primary's legible name is carried
    // instead by aria-label (folder-card.tsx), so assert the accessible
    // name rather than textContent; the "one legible primary per region"
    // intent is unchanged, only where the label lives.
    await expect(folioAction).toHaveAccessibleName(FOLIO_ACTION);
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

  test('390px surfaces place context, primary, and More in one edge owner', async ({
    authenticatedPage: page,
  }) => {
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
    await expect(captureLeadSheet).toBeVisible();
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

    await page.goto(`/doc/${SENT_PROPOSAL_ID}`, {
      waitUntil: 'domcontentloaded',
    });
    await expectMobileBar(page, 'mark-proposal-signed', 'Mark signed');

    await page.goto('/library', { waitUntil: 'domcontentloaded' });
    await expectMobileBar(page, 'capture-piece', 'Capture');

    await page.goto('/people', { waitUntil: 'domcontentloaded' });
    await expectMobileBar(page, 'add-person', 'Add person');

    await page.goto(`/drafting/${SENT_PROPOSAL_ID}`, {
      waitUntil: 'domcontentloaded',
    });
    await expectMobileBar(page, 'send-proposal', /^Send/);
  });
});
