/**
 * W3b — the Stripe Checkout return doorway (US-14, CONTRACT §5;
 * desk-doorway.tsx).
 *
 * `/desk?book=orders&po=…&checkout=success&session_id=…` is BOTH a doorway
 * (desk-doorway.tsx opens the Orders ledger sheet) and a filled-query entry
 * (gate.ts declines any entry with `search` filled, cause `'query'`, checked
 * before token/webdriver/anything else). The doorway then strips the address
 * to `/desk` via `suppressNextArrival` + `router.replace` — a second, already
 * -suppressed entry — so across the whole round trip the arrival never
 * plays, and it plays at most once the ordinary way afterward.
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

    // The address is stripped back to /desk (doorway hygiene) — assert this
    // AFTER the sheet is confirmed open, since the strip's router.replace is
    // what the second, suppressed entry rides on.
    await expect(page).toHaveURL(/\/desk(\?.*)?$/);
    await page.waitForURL((url) => !url.search.includes('checkout'), { timeout: 5_000 });

    // The whole round trip — the doorway's own filled-query entry AND the
    // stripped, suppressed replace that follows it — must never have played
    // an arrival. Give the suppressed replace's own effect pass time to
    // settle before reading the final tally.
    await page.waitForTimeout(1_000);
    const events = await arrivalEndedEvents(page);
    for (const e of events) {
      expect(e.how).not.toBe('settled');
      if (e.surface === 'desk') {
        expect(e.how).toBe('declined');
      }
    }
    await expect(page.locator(CARD_SELECTOR)).toHaveCount(0);
  });
});
