/**
 * W3b — Document surface plays (US-14, CONTRACT §5).
 *
 *  - a warm soft entry (Desk → Document via a claim card) plays with a token
 *  - T3 live: every card part's text is a substring of the page's own visible
 *    text once the card has rested (both routes — the Desk half lives in
 *    play-desk.spec.ts's hard-entry test via a shared assertion helper here)
 *  - the lens headline on every project: where the band prints its short
 *    (label) form it carries `data-arr-long` and the card's headline is that
 *    long sentence; where it prints a sentence it carries none and the card's
 *    headline is the page's own (CONTRACT §4a, §4c(j))
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
  dwellOnCard,
  watchReads,
  CARD_SELECTOR,
  SKIP_SELECTOR,
} from './helpers';

/** Every content text node the engine mounted under `.arr-card`/`.arr-card-fix`
 *  while the card is up (T3's own falsifier operand) — T3 (engine-spec.md:73)
 *  is about lines drawn from the brief's own `select()` output (headline,
 *  place, f1/f2/f3, job/slug), which the page must also print. `.arr-cue` is
 *  excluded: its text is a fixed UI instruction ("Click, scroll or press any
 *  key to open the page" / "Tap or scroll…", engine-spec.md:107), never
 *  content the real page renders. */
async function captureCardTexts(page: Page): Promise<string[]> {
  return page.$$eval(
    '.arr-card [data-arr]:not(.arr-cue), .arr-card-fix [data-arr]:not(.arr-cue)',
    (els) =>
      els
        .map((e) => (e.textContent ?? '').trim())
        .filter((t) => t.length > 0),
  );
}

/** T3 preview rule (engine-spec.md:73, ORC:582-589): "every card line, split
 *  on ` · ` and `X: y`, must appear in the page's own text" — not the whole
 *  joined line as one substring. A card line like "Aspen Loft Refresh ·
 *  Installation" is the card's own `place` join of two independently-live
 *  parts; the page's rendered text joins them differently (e.g. with an
 *  intervening client-name link), so each part is checked on its own.
 *  T7 (ORC:612-619) separately requires the card's own headline/facts to end
 *  with a period — a card-only voice decoration, not part of the underlying
 *  `select()` label the page renders. `desk-derivation.ts`'s need label (e.g.
 *  `${n} decisions overdue — oldest due ${day}`) carries no terminal
 *  punctuation; the card appends the period per T7, so a trailing "." is
 *  stripped from each part before the page-substring check — otherwise T3
 *  would fail on the period alone, on a page that is genuinely rendering the
 *  same underlying fact. */
const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim();
/** brief.ts `period()`: the card's terminal period when the page printed none (T7). */
const period = (s: string): string => (s === '' || /[.!?…]["'”’)\]]*$/.test(s) ? s : `${s}.`);

/** The lens band's headline sentence (lens-band.tsx), the carrier of `data-arr-long`. */
const LENS_HEADLINE = '[data-lens-sentence][data-part~="headline"]';

function splitCardLine(text: string): string[] {
  return text
    .split(/ · |: /)
    .map((part) => part.trim().replace(/\.$/, ''))
    .filter((part) => part.length > 0);
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
    let cardTexts = await captureCardTexts(page);
    expect(cardTexts.length).toBeGreaterThan(0);

    // D2 (CONTRACT §2, §4a, §4c(j)): where the band prints its short (label) form at rest it
    // carries the long sentence in `data-arr-long`, and the card headline is that sentence
    // (period(collapse(...)), brief.ts) rather than the page's words. Wherever it is absent the
    // headline is held to the page like every other line.
    const longForm = await page.evaluate(
      (sel) => document.querySelector(sel)?.getAttribute('data-arr-long') ?? null,
      LENS_HEADLINE,
    );
    if (longForm !== null) {
      const cardHeadline = collapse((await page.locator('.arr-h').first().textContent()) ?? '');
      expect(cardHeadline).toBe(period(collapse(longForm)));
      const skipped = cardTexts.indexOf(cardHeadline);
      expect(skipped).toBeGreaterThanOrEqual(0);
      cardTexts = cardTexts.filter((_, i) => i !== skipped);
    }

    await page.locator(SKIP_SELECTOR).click();
    await expect(page.locator(CARD_SELECTOR)).toHaveCount(0);

    const bodyText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    for (const text of cardTexts) {
      for (const part of splitCardLine(text.replace(/\s+/g, ' '))) {
        expect(bodyText, `card line "${text}" part "${part}" must be a live substring of the rested page`).toContain(
          part,
        );
      }
    }

    const events = await arrivalEndedEvents(page);
    const played = events.find((e) => e.surface === 'document' && e.how === 'skip');
    expect(played).toBeTruthy();
  });

  test('the lens headline: data-arr-long only on the short form, and the card reads it; else the page sentence', async ({
    authenticatedPage: page,
  }) => {
    await armE2EOptIn(page);
    await installArrivalInstruments(page);
    await page.goto(`/doc/${ARRIVAL_PROJECT_ID}`, { waitUntil: 'domcontentloaded' });

    const headline = page.locator(LENS_HEADLINE);
    await expect(headline).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(CARD_SELECTOR).first()).toBeVisible({ timeout: 20_000 });

    const longForm = await headline.getAttribute('data-arr-long');
    const printedForm = collapse((await headline.textContent()) ?? '');
    const form = await page.locator('[data-lens-line="2"]').getAttribute('data-lens-line2-form');
    const cardHeadline = collapse((await page.locator('.arr-h').first().textContent()) ?? '');
    expect(cardHeadline.length).toBeGreaterThan(0);

    if (longForm !== null) {
      expect(form, 'data-arr-long rides only on the short (label) form').toBe('short');
      expect(cardHeadline).toBe(period(collapse(longForm)));
    } else {
      expect(form).not.toBe('short');
      expect(cardHeadline).toBe(period(printedForm));
    }

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
    const reads = watchReads(page);

    await page.goto(`/doc/${ARRIVAL_PROJECT_ID}`, { waitUntil: 'domcontentloaded' });

    // CONTRACT §4b: a slow read declines `hidden`/`late` (the ordinary page)
    // rather than cutting a played run — it does NOT guarantee the card
    // shows on every cold load. The falsifier is "never drift/mutation", not
    // "always plays" (play-desk.spec.ts's staggered-reads test asserts the
    // Desk side of this same rule the same way).
    const cardOrRest = await Promise.race([
      page
        .locator(CARD_SELECTOR)
        .first()
        .waitFor({ state: 'visible', timeout: 20_000 })
        .then(() => 'played' as const),
      page
        .waitForFunction(
          () =>
            (window as unknown as { __arrivalEndedEvents?: unknown[] }).__arrivalEndedEvents
              ?.length,
          undefined,
          { timeout: 20_000 },
        )
        .then(() => 'ended' as const)
        .catch(() => 'neither' as const),
    ]);
    expect(cardOrRest).not.toBe('neither');
    if (cardOrRest === 'played') {
      // The card dwells before the Skip: a delayed answer printing into the root would cut it
      // `how: 'mutation'`, which an instant Skip would hide.
      const held = await dwellOnCard(page, reads);
      expect(held, `the card through the dwell: ${JSON.stringify(await arrivalEndedEvents(page))}`).toBe(true);
      await page.locator(SKIP_SELECTOR).click();
      await expect(page.locator(CARD_SELECTOR)).toHaveCount(0);
      // 'mutation' is an EndHow, never a cause: a played run a late commit cut
      // short ends how:'mutation', so the played path must end on the Skip.
      await expect
        .poll(async () =>
          (await arrivalEndedEvents(page)).filter((e) => e.surface === 'document').at(-1)?.how,
        )
        .toBe('skip');
    }

    const events = await arrivalEndedEvents(page);
    const docEvents = events.filter((e) => e.surface === 'document');
    expect(docEvents.length).toBeGreaterThan(0);
    for (const e of docEvents) {
      expect(e.how).not.toBe('mutation');
      expect(e.cause).not.toBe('drift');
      if (e.how === 'declined') {
        expect(['hidden', 'late']).toContain(e.cause);
      }
    }
  });
});
