/**
 * W3b — put-down lands the roster row (US-14, CONTRACT §5; nav.ts
 * `writeFromDoc` / arrival-mount.tsx's `pl-from-doc` MutationObserver).
 *
 * Putting a Document down onto the Desk (a client navigation from
 * `/doc/{id}` to `/desk`) writes `pl-from-doc`; once the Desk is
 * `[data-arrival="desk"][data-arrival-ready]`, arrival-mount.tsx calls
 * `document.getElementById('roster-line-{id}')?.scrollIntoView({block:
 * 'center'})` one animation frame later. `scrollIntoView` leaves no DOM
 * marker of its own, so this spec stubs `Element.prototype.scrollIntoView`
 * (via `addInitScript`, before any app script runs) to record which element
 * it was called on.
 *
 * The row lands only when the Desk's own entry ends declined (CONTRACT §4c(g)):
 * a Desk that plays owns the viewport. So the spec lets the Desk brief once
 * first; the put-down's soft entry then declines `desk-shown` and the row lands.
 *
 * The spine's "Put down document" link only renders `min-[1180px]:block`
 * (desktop) — this spec runs on `chromium`/`webkit` only.
 */
import { test, expect } from '../fixtures/auth';
import { seedWorkflowGateFixture, WORKFLOW_GATE_PROJECT_ID } from '../helpers/workflow-gate-fixture';
import { ARRIVAL_PROJECT_ID, armE2EOptIn, installArrivalInstruments, settleDeskWalkthrough, CARD_SELECTOR } from './helpers';

test.describe('Put-down lands the roster row', () => {
  test.beforeAll(() => {
    seedWorkflowGateFixture();
    settleDeskWalkthrough();
  });

  test('putting the Document down scrolls its roster row into view', async ({
    authenticatedPage: page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === 'mobile-chrome',
      'the spine "Put down document" link is desktop-only (min-[1180px]:block)',
    );
    await armE2EOptIn(page);
    await installArrivalInstruments(page);
    await page.addInitScript(() => {
      const calls: string[] = [];
      (window as unknown as { __scrollIntoViewCalls: string[] }).__scrollIntoViewCalls = calls;
      const orig = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function scrollIntoViewSpy(
        this: Element,
        ...args: Parameters<typeof orig>
      ) {
        calls.push(this.id || this.tagName);
        return orig.apply(this, args);
      };
    });

    // The Desk briefs once a visit: spend it here so the put-down below declines `desk-shown`.
    await page.goto('/desk', { waitUntil: 'domcontentloaded' });
    await expect(page.locator(CARD_SELECTOR).first()).toBeVisible({ timeout: 20_000 });
    await page.locator('.arr-skip').click();
    await expect(page.locator(CARD_SELECTOR)).toHaveCount(0);

    await page.goto(`/doc/${ARRIVAL_PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator(CARD_SELECTOR).first()).toBeVisible({ timeout: 20_000 });
    await page.locator('.arr-skip').click();
    await expect(page.locator(CARD_SELECTOR)).toHaveCount(0);

    await page.getByRole('link', { name: 'Put down document' }).click();
    await page.waitForURL(/\/desk$/);

    await page.waitForFunction(
      (rowId) =>
        ((window as unknown as { __scrollIntoViewCalls?: string[] }).__scrollIntoViewCalls ?? []).includes(
          rowId,
        ),
      `roster-line-${WORKFLOW_GATE_PROJECT_ID}`,
      { timeout: 20_000 },
    );

    const calls = await page.evaluate(
      () => (window as unknown as { __scrollIntoViewCalls?: string[] }).__scrollIntoViewCalls ?? [],
    );
    expect(calls).toContain(`roster-line-${WORKFLOW_GATE_PROJECT_ID}`);

    const row = page.locator(`#roster-line-${WORKFLOW_GATE_PROJECT_ID}`);
    await expect(row).toBeVisible();
  });
});
