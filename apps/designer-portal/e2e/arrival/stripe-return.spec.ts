/**
 * W3b — the Stripe Checkout return doorway (US-14, CONTRACT §5 "Stripe return
 * `?book=orders&checkout=success` declines and its sheet opens";
 * desk-doorway.tsx).
 *
 * `/desk?book=orders&po=…&checkout=success&session_id=…` is BOTH a doorway
 * (desk-doorway.tsx opens the Orders ledger sheet) and a filled-query entry
 * (gate.ts declines any entry with `search` filled, cause `'query'`, checked
 * before token/webdriver/anything else). The doorway's strip back to `/desk`
 * is a same-pathname replace, so it is never a second arrival entry.
 *
 * The address is deliberately not asserted: under Next 16.2.10 a hard load of
 * `/desk?<any query>` seeds the router's `/desk` route-cache entry with that
 * query as its canonical URL, so every later same-path replace (the doorway's
 * strip included) commits the old query. That reproduces with ArrivalMount and
 * ArrivalRoute removed from the layout (arrival-lane.md §T.1) — a Desk-doorway
 * defect outside the arrival.
 */
import { test, expect } from '../fixtures/auth';
import { seedWorkflowGateFixture } from '../helpers/workflow-gate-fixture';
import { armE2EOptIn, installArrivalInstruments, arrivalEndedEvents, settleDeskWalkthrough, CARD_SELECTOR } from './helpers';

test.describe('Stripe Checkout return doorway', () => {
  test.beforeAll(() => {
    seedWorkflowGateFixture();
    settleDeskWalkthrough();
  });

  test('a Stripe return declines the arrival and opens the Orders sheet', async ({
    authenticatedPage: page,
  }) => {
    await armE2EOptIn(page);
    await installArrivalInstruments(page);

    await page.goto('/desk?book=orders&po=PO-W3B-TEST&checkout=success&session_id=cs_test_w3b', {
      waitUntil: 'domcontentloaded',
    });

    // The Orders ledger sheet opens (studio-drawer.tsx's `document:open-ledger`
    // listener → a DocSheet, `role="dialog"`, titled "Orders").
    const sheet = page.locator('[role="dialog"]').filter({ has: page.locator('[data-doc-sheet-title]') });
    await expect(sheet).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-doc-sheet-title]').first()).toHaveText(/orders/i);

    // Exactly one Desk entry, declined on its query; no card ever mounts.
    await page.waitForTimeout(1_000);
    const deskEvents = (await arrivalEndedEvents(page)).filter((e) => e.surface === 'desk');
    expect(deskEvents).toEqual([{ surface: 'desk', how: 'declined', cause: 'query' }]);
    await expect(page.locator(CARD_SELECTOR)).toHaveCount(0);
  });
});
