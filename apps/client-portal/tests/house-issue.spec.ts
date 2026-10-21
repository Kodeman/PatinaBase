import { test, expect, type Page } from '@playwright/test';

import { ANCHORS, ELM, LAKE, MEASURE, box, settled, signInAsJune } from './fixtures/house-issue';

/**
 * The House Issue (US-49 Phase 1), with `client-edition-page` forced on by
 * NEXT_PUBLIC_FLAG_OVERRIDES on the `edition` project's server (:3102).
 *
 * Locally the plate route has no PLATES binding (`next dev` is not a Worker)
 * and answers 503, so every photograph falls back to its drawn silhouette
 * with "Picture did not load." — asserted below, never hidden.
 */

test.describe.configure({ timeout: 180_000 });

function platesRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/plates/')) urls.push(request.url());
  });
  return urls;
}

/** Every element wider than the viewport, by tag and class, for the report. */
async function wider(page: Page, limit: number): Promise<string[]> {
  return page.evaluate((max) => {
    const over: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const r = el.getBoundingClientRect();
      if (r.width > max + 0.5 || r.right > max + 0.5) over.push(`${el.tagName.toLowerCase()}.${String(el.getAttribute('class') ?? '').slice(0, 60)}`);
    }
    return over;
  }, limit);
}

test.describe('The House Issue', { tag: '@edition' }, () => {
  test('390: hero, three standing rows above the fold, the link row, then the doorstep', async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAsJune(page, '/');
    await expect(page.getByTestId('doorplate-title')).toHaveText(ELM.name, { timeout: 60000 });
    await settled(page);

    // The hero: a figure whose caption is exactly what · whose · when. Its
    // plate cannot be served locally, so it stands drawn and says so.
    const hero = page.locator('[data-testid="house-issue-hero"] figure.ed-hero');
    await expect(hero).toBeVisible();
    await expect(hero.locator('figcaption [data-caption-field]')).toHaveCount(3);
    await expect(hero.locator('.plate-note')).toHaveText('Picture did not load.', { timeout: 30000 });
    await expect(hero.locator('figcaption [data-caption-field]')).toHaveCount(3);

    const rows = [1, 2, 3];
    const [first, , third] = await Promise.all(rows.map((n) => box(page, `[data-standing-row="${n}"]`)));
    const doorstep = await box(page, '#doorstep');
    const ledgerRow = await box(page, '[data-testid="landmark-ledger"]');
    const heroBox = await box(page, '[data-testid="house-issue-hero"] figure.ed-hero');
    info.annotations.push({
      type: 'measured-390',
      description: `hero ${heroBox.top.toFixed(0)}–${heroBox.bottom.toFixed(0)} w${heroBox.width.toFixed(0)}; rows ${[first, third].map((b) => `${b.top.toFixed(0)}–${b.bottom.toFixed(0)}`).join(' … ')}; link row ${ledgerRow.top.toFixed(0)}; #doorstep ${doorstep.top.toFixed(0)}`,
    });
    console.log(`[measured-390] ${info.annotations.at(-1)!.description}`);
    expect(first.top).toBeLessThanOrEqual(620);
    expect(third.bottom).toBeLessThanOrEqual(780);
    expect(ledgerRow.top).toBeGreaterThanOrEqual(third.bottom);
    expect(doorstep.top).toBeGreaterThan(third.bottom);

    // The standing rows are sentences: the past-due amount first, in the act's fill.
    await expect(page.locator('[data-standing-row="1"]')).toHaveText('$600.00 was due on 25 September.');
    await expect(page.locator('[data-standing-row="1"]')).toHaveAttribute('data-act', 'amount');
    await expect(page.locator('[data-standing-row="3"]')).toHaveText('Six invoices are open, $1,375.00 in all.');

    // Nothing wider than the phone.
    expect(await wider(page, 390)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

    // Words, never a measure; never "AI".
    for (const text of await page.locator('.ed-chapter-head, .ed-standing').allInnerTexts()) {
      expect(text).not.toMatch(MEASURE);
    }
    expect(await page.locator('body').innerText()).not.toMatch(/\bAI\b/);

    // The first Tab stop is the skip link, and it lands on the house.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return { testid: el?.getAttribute('data-testid'), href: el?.getAttribute('href'), text: el?.textContent?.trim() };
    });
    console.log(`[first-tab] ${JSON.stringify(focused)}`);
    expect(focused).toEqual({ testid: 'house-issue-skip', href: '#doorstep', text: 'Skip to the project' });
  });

  test('1440: the hero bleeds the full width at most 648 tall, rows within 880', async ({ page }, info) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInAsJune(page, `/projects/${ELM.id}`);
    await settled(page);
    const frame = '[data-testid="house-issue-hero"] figure.ed-hero > .ed-plate__frame';
    await expect(page.locator(frame)).toBeVisible();
    const hero = await box(page, frame);
    const rows = await Promise.all([1, 2, 3].map((n) => box(page, `[data-standing-row="${n}"]`)));
    info.annotations.push({
      type: 'measured-1440',
      description: `hero frame ${hero.width.toFixed(0)}×${hero.height.toFixed(0)} at ${hero.top.toFixed(0)}; rows ${rows.map((r) => `${r.top.toFixed(0)}–${r.bottom.toFixed(0)}`).join(', ')}`,
    });
    console.log(`[measured-1440] ${info.annotations.at(-1)!.description}`);
    expect(Math.abs(hero.width - 1440)).toBeLessThanOrEqual(1);
    expect(hero.height).toBeLessThanOrEqual(648);
    for (const row of rows) expect(row.bottom).toBeLessThanOrEqual(880);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  });

  test('the hero preload is in the server HTML', async ({ page }) => {
    await signInAsJune(page, `/projects/${ELM.id}`);
    await settled(page);
    const html = await (await page.request.get(`/projects/${ELM.id}`)).text();
    const preloads = html.match(/<link[^>]+rel="preload"[^>]+as="image"[^>]*>/g) ?? [];
    const hero = preloads.filter((tag) => tag.includes(`/plates/${ELM.id}/`));
    expect(hero.length).toBeGreaterThan(0);
    for (const tag of hero) {
      expect(tag).toMatch(/imageSrcSet="|imagesrcset="/i);
      expect(tag).toMatch(/fetchPriority="high"|fetchpriority="high"/i);
    }
  });

  test('a piece with no plate is drawn, and asks the plate route for nothing', async ({ page }) => {
    const plates = platesRequests(page);
    await signInAsJune(page, `/projects/${ELM.id}`);
    await settled(page);
    const pieces = page.locator('ul[aria-label^="Pieces"] > li');
    const sofa = pieces.filter({ hasText: ELM.sofa });
    await expect(sofa.locator('[data-plate="silhouette"]')).toBeVisible();
    await expect(sofa.locator('img, source')).toHaveCount(0);
    // The sideboard's plate exists but cannot be served here: it falls back too.
    const sideboard = pieces.filter({ hasText: ELM.sideboard });
    await expect(sideboard.locator('.plate-note')).toHaveText('Picture did not load.', { timeout: 30000 });
    // Every plate request named a plate the house holds; none was for the sofa.
    expect(plates.length).toBeGreaterThan(0);
    for (const url of plates) expect(url).toContain(`/plates/${ELM.id}/`);
    for (const id of ANCHORS) await expect(page.locator(`[id="${id}"]`), `#${id}`).toHaveCount(1);
  });

  test('the drawn cover: a house with no plate opens on its plan, with no plate request at all', async ({ page }) => {
    const plates = platesRequests(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAsJune(page, `/projects/${LAKE.id}`);
    await expect(page.getByTestId('doorplate-title')).toHaveText(LAKE.name, { timeout: 60000 });
    await settled(page);
    await expect(page.getByTestId('house-issue-cover')).toBeVisible();
    await expect(page.getByTestId('house-issue-cover').locator('.ed-chapter-head')).toContainText('01');
    await expect(page.getByTestId('house-issue-hero')).toHaveCount(0);
    await expect(page.locator('link[rel="preload"][as="image"]')).toHaveCount(0);
    for (const text of await page.locator('.ed-chapter-head, .ed-standing').allInnerTexts()) {
      expect(text).not.toMatch(MEASURE);
    }
    expect(await wider(page, 390)).toEqual([]);
    expect(plates).toEqual([]);
  });

  test('reduced motion: no revealed child is ever moved', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await signInAsJune(page, `/projects/${ELM.id}`);
    await settled(page);
    await expect(page.locator('.ed-reveal').first()).toBeAttached();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.evaluate(() => window.scrollTo(0, 0));
    const transforms = await page
      .locator('.ed-reveal > *')
      .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).transform));
    expect(transforms.length).toBeGreaterThan(0);
    expect(transforms.filter((t) => t !== 'none')).toEqual([]);
  });
});
