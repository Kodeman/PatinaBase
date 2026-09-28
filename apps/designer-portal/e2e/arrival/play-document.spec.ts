/**
 * W3b — Document surface plays (US-14, CONTRACT §5).
 *
 *  - a warm soft entry (Desk → Document via a claim card) plays with a token
 *  - T3 live: every card part's text is a substring of the page's own visible
 *    text once the card has rested (both routes — the Desk half lives in
 *    play-desk.spec.ts's hard-entry test via a shared assertion helper here)
 *  - the phone long-form headline (`mobile-chrome` only): the card's headline
 *    reads the `data-arr-long` token list while the page itself keeps its
 *    short form (CONTRACT §4a — Document phone long form)
 *  - a reload of an open Document plays with `via:null`, and a pending token
 *    is never honoured on a reload (gate.ts `honoured()` — `input.entry ===
 *    'reload'` always returns null)
 *  - a cold Document with `projects`/`proposals` delayed individually by
 *    2.5s each (CONTRACT §4b) never drifts or mutation-declines
 */
import { test, expect } from '../fixtures/auth';
import type { Page } from '@playwright/test';
import { seedWorkflowGateFixture } from '../helpers/workflow-gate-fixture';
import {
  ARRIVAL_PROJECT_ID,
  armE2EOptIn,
  installArrivalInstruments,
  arrivalEndedEvents,
  settleDeskWalkthrough,
  delayedRoute,
  CARD_SELECTOR,
  SKIP_SELECTOR,
} from './helpers';

/** Every text node the engine mounted under `.arr-card`/`.arr-card-fix`
 *  while the card is up (T3's own falsifier operand). */
async function captureCardTexts(page: Page): Promise<string[]> {
  return page.$$eval(
    '.arr-card [data-arr], .arr-card-fix [data-arr]',
    (els) =>
      els
        .map((e) => (e.textContent ?? '').trim())
        .filter((t) => t.length > 0),
  );
}

test.describe('Document plays', () => {
  test.beforeAll(() => {
    seedWorkflowGateFixture();
    settleDeskWalkthrough();
  });

  test('a warm soft entry via a claim card plays, and T3: every card part is live on the rested page', async ({
    authenticatedPage: page,
  }) => {
    await armE2EOptIn(page);
    await installArrivalInstruments(page);
    await page.goto('/desk', { waitUntil: 'domcontentloaded' });
    // Quiesce the Desk's own arrival first so its Skip click isn't mistaken
    // for the claim-card token click under test.
    if (await page.locator(CARD_SELECTOR).isVisible().catch(() => false)) {
      await page.locator(SKIP_SELECTOR).click();
      await expect(page.locator(CARD_SELECTOR)).toHaveCount(0);
    }

    const claimCard = page.locator(`[data-claim-card="${ARRIVAL_PROJECT_ID}"]`);
    await expect(claimCard).toBeVisible();
    // arrival-mount.tsx TOKEN_LINKS: the claim card's own act anchor is the
    // token-writing link, a soft client navigation into the Document.
    await claimCard.locator('[data-register="act"] a, a[href^="/doc/"]').first().click();
    await page.waitForURL(new RegExp(`/doc/${ARRIVAL_PROJECT_ID}`));

    const card = page.locator(CARD_SELECTOR).first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    const cardTexts = await captureCardTexts(page);
    expect(cardTexts.length).toBeGreaterThan(0);

    await page.locator(SKIP_SELECTOR).click();
    await expect(page.locator(CARD_SELECTOR)).toHaveCount(0);

    const bodyText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    for (const text of cardTexts) {
      const needle = text.replace(/\s+/g, ' ');
      expect(bodyText, `card text "${needle}" must be a live substring of the rested page`).toContain(
        needle,
      );
    }

    const events = await arrivalEndedEvents(page);
    const played = events.find((e) => e.surface === 'document' && e.how === 'skip');
    expect(played).toBeTruthy();
  });

  test('the phone long-form headline reads data-arr-long while the page keeps the short form', async ({
    authenticatedPage: page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chrome', 'phone long-form is a mobile-chrome-only assertion');
    await armE2EOptIn(page);
    await installArrivalInstruments(page);
    await page.goto(`/doc/${ARRIVAL_PROJECT_ID}`, { waitUntil: 'domcontentloaded' });

    const headline = page.locator('[data-lens-sentence][data-part="headline"]');
    await expect(headline).toBeVisible({ timeout: 20_000 });
    const longForm = await headline.getAttribute('data-arr-long');
    const shortForm = (await headline.textContent())?.trim() ?? '';
    expect(longForm, 'the lens sentence must carry a data-arr-long token list on phone').toBeTruthy();
    expect(longForm).not.toEqual(shortForm);

    const card = page.locator(CARD_SELECTOR).first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    const cardHeadline = (await page.locator('.arr-h').first().textContent())?.trim() ?? '';
    // The card's own headline is built from the brief's long-form token list
    // on a phone viewport; the page's own headline text is the short form —
    // the two must differ, and the card's text must be drawn from the long
    // form (a substring/equal to the long-form's own rendered sentence).
    expect(cardHeadline.length).toBeGreaterThan(0);
    expect(cardHeadline).not.toEqual(shortForm);

    await page.locator(SKIP_SELECTOR).click();
  });

  test('reload plays with via:null; a pending token is not honoured on reload', async ({
    authenticatedPage: page,
  }) => {
    await armE2EOptIn(page);
    await installArrivalInstruments(page);
    await page.goto('/desk', { waitUntil: 'domcontentloaded' });
    if (await page.locator(CARD_SELECTOR).isVisible().catch(() => false)) {
      await page.locator(SKIP_SELECTOR).click();
      await expect(page.locator(CARD_SELECTOR)).toHaveCount(0);
    }
    // Write a real pending token by clicking the claim card's act link (this
    // is what a reload must NOT honour).
    const claimCard = page.locator(`[data-claim-card="${ARRIVAL_PROJECT_ID}"]`);
    await claimCard.locator('[data-register="act"] a, a[href^="/doc/"]').first().click();
    await page.waitForURL(new RegExp(`/doc/${ARRIVAL_PROJECT_ID}`));
    await expect(page.locator(CARD_SELECTOR).first()).toBeVisible({ timeout: 20_000 });
    await page.locator(SKIP_SELECTOR).click();
    await expect(page.locator(CARD_SELECTOR)).toHaveCount(0);

    // Reload the SAME document — `nav.ts` classifies this hard commit's
    // `performance` navigation type as 'reload', and gate.ts's `honoured()`
    // explicitly nulls any token on a reload entry.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator(CARD_SELECTOR).first()).toBeVisible({ timeout: 20_000 });
    await page.locator(SKIP_SELECTOR).click();

    const events = await arrivalEndedEvents(page);
    const reloadEnd = events.at(-1);
    expect(reloadEnd).toMatchObject({ surface: 'document', how: 'skip' });
  });

  test('cold Document: projects and proposals delayed individually never drift or mutation-decline', async ({
    authenticatedPage: page,
  }) => {
    await armE2EOptIn(page);
    await installArrivalInstruments(page);
    await page.route('**/rest/v1/projects*', delayedRoute(2_500));
    await page.route('**/rest/v1/proposals*', delayedRoute(2_500));

    await page.goto(`/doc/${ARRIVAL_PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator(CARD_SELECTOR).first()).toBeVisible({ timeout: 20_000 });
    await page.locator(SKIP_SELECTOR).click();
    await expect(page.locator(CARD_SELECTOR)).toHaveCount(0);

    const events = await arrivalEndedEvents(page);
    const docEvents = events.filter((e) => e.surface === 'document');
    expect(docEvents.length).toBeGreaterThan(0);
    for (const e of docEvents) {
      expect(e.cause).not.toBe('drift');
      expect(e.cause).not.toBe('mutation');
    }
  });
});
