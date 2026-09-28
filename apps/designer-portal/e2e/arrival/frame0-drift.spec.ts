/**
 * W3b — frame-0 drift never fires on seeded routes (US-14, CONTRACT §5;
 * engine.ts `begin()` — `if (!verifyFrame0(b)) return end('declined',
 * 'drift', false)`, guarding against the brief's frame-0 measurement having
 * gone stale by the time the run actually starts). On a normal, un-shifting
 * seeded page this must never fire — proven here on both surfaces by reading
 * the ended event's own `cause` rather than assuming a play.
 */
import { test, expect } from '../fixtures/auth';
import { seedWorkflowGateFixture } from '../helpers/workflow-gate-fixture';
import { ARRIVAL_PROJECT_ID, armE2EOptIn, installArrivalInstruments, arrivalEndedEvents, settleDeskWalkthrough, CARD_SELECTOR, SKIP_SELECTOR } from './helpers';

test.describe('Frame-0 drift', () => {
  test.beforeAll(() => {
    seedWorkflowGateFixture();
    settleDeskWalkthrough();
  });

  test('a hard Desk entry never declines drift', async ({ authenticatedPage: page }) => {
    await armE2EOptIn(page);
    await installArrivalInstruments(page);
    await page.goto('/desk', { waitUntil: 'domcontentloaded' });
    await expect(page.locator(CARD_SELECTOR)).toBeVisible({ timeout: 20_000 });
    await page.locator(SKIP_SELECTOR).click();

    const events = await arrivalEndedEvents(page);
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) expect(e.cause).not.toBe('drift');
    expect(events.at(-1)).toMatchObject({ surface: 'desk', how: 'skip' });
  });

  test('a hard Document entry never declines drift', async ({ authenticatedPage: page }) => {
    await armE2EOptIn(page);
    await installArrivalInstruments(page);
    await page.goto(`/doc/${ARRIVAL_PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator(CARD_SELECTOR).first()).toBeVisible({ timeout: 20_000 });
    await page.locator(SKIP_SELECTOR).click();

    const events = await arrivalEndedEvents(page);
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) expect(e.cause).not.toBe('drift');
    expect(events.at(-1)).toMatchObject({ surface: 'document', how: 'skip' });
  });
});
