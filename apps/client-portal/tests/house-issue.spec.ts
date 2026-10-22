import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import {
  ANCHORS,
  ANCHOR_PATTERNS,
  ELM,
  ELM_EDITION,
  ELM_PLATE_SCOPE,
  ELM_UNDRAWN,
  GARDEN,
  LAKE,
  LOCAL_SUPABASE,
  MEASURE,
  STUDIO,
  box,
  servePlates,
  settled,
  signInAsJune,
} from './fixtures/house-issue';

/**
 * The House Issue (US-49 Phase 1), with `client-edition-page` forced on by
 * NEXT_PUBLIC_FLAG_OVERRIDES on the `edition` project's server (:3102).
 *
 * Locally the plate route has no PLATES binding (`next dev` is not a Worker)
 * and answers 503, so every photograph falls back to its drawn silhouette
 * with "Picture did not load." — asserted below, never hidden.
 */

/*
 * One worker reads this file, in order: the last test undoes Elm's Edition 2
 * and puts it back, and the fold tests above pin that edition's sixty-character
 * headline, so no test here may read Elm while it is undone.
 */
test.describe.configure({ mode: 'default', timeout: 180_000 });

/** The composer's ceiling, and Elm's Edition 2 cover headline. */
const LONGEST_HEADLINE = ELM_EDITION.coverHeadline;

function platesRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/plates/')) urls.push(request.url());
  });
  return urls;
}

/** Every contract anchor once; every entity anchor unique, and every link to one lands. */
async function expectAnchors(page: Page): Promise<void> {
  const named = [...ANCHORS, ...ELM.rooms.map((room) => `room-${room}`)];
  const counts = await page.evaluate(
    (ids) => Object.fromEntries(ids.map((id) => [id, document.querySelectorAll(`[id="${id}"]`).length])),
    named,
  );
  expect(counts).toEqual(Object.fromEntries(named.map((id) => [id, ELM_UNDRAWN.includes(id) ? 0 : 1])));
  const ids = await page
    .locator(ANCHOR_PATTERNS.map((prefix) => `[id^="${prefix}"]`).join(', '))
    .evaluateAll((nodes) => nodes.map((node) => node.id));
  expect(ids.length - new Set(ids).size, `duplicate entity ids in ${ids.join(' ')}`).toBe(0);
  const hrefs = await page
    .locator(ANCHOR_PATTERNS.map((prefix) => `a[href^="#${prefix}"]`).join(', '))
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href') ?? ''));
  for (const href of new Set(hrefs)) await expect(page.locator(`[id="${href.slice(1)}"]`), href).toHaveCount(1);
}

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

/** Viewport geometry of the first match. */
async function rect(page: Page, selector: string): Promise<Rect> {
  const found = await page.locator(selector).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
  });
  return found;
}

const HERO = '[data-testid="house-issue-hero"] figure.ed-hero';

/** The hero's picture decoded: served, not the drawn fallback. */
async function heroLoaded(page: Page): Promise<string> {
  const img = page.locator(`${HERO} img.ed-plate__img`);
  await expect(img).toBeVisible({ timeout: 30000 });
  await expect
    .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), { timeout: 30000 })
    .toBe(true);
  await expect(page.locator(`${HERO} .plate-note`)).toHaveCount(0);
  return img.evaluate((el: HTMLImageElement) => el.currentSrc);
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
    // The worst case: Edition 2's headline is sixty characters, whole, and the fold below still holds.
    expect(LONGEST_HEADLINE).toHaveLength(60);
    await expect(hero.locator('h2')).toHaveText(LONGEST_HEADLINE);
    await expect(hero.locator('figcaption [data-caption-field]')).toHaveCount(3);
    await expect(hero.locator('.plate-note')).toHaveText('Picture did not load.', { timeout: 30000 });
    await expect(hero.locator('figcaption [data-caption-field]')).toHaveCount(3);

    const rows = [1, 2, 3];
    const [first, , third] = await Promise.all(rows.map((n) => box(page, `[data-standing-row="${n}"]`)));
    const doorstep = await box(page, '#doorstep');
    const ledgerRow = await box(page, '[data-testid="landmark-ledger"]');
    const heroBox = await box(page, '[data-testid="house-issue-hero"] figure.ed-hero');
    const title = await box(page, '[data-testid="house-issue-hero"] h2');
    info.annotations.push({
      type: 'measured-390',
      description: `hero ${heroBox.top.toFixed(0)}–${heroBox.bottom.toFixed(0)} w${heroBox.width.toFixed(0)}; headline ${title.width.toFixed(0)}×${title.height.toFixed(0)}; rows ${[first, third].map((b) => `${b.top.toFixed(0)}–${b.bottom.toFixed(0)}`).join(' … ')}; link row ${ledgerRow.top.toFixed(0)}; #doorstep ${doorstep.top.toFixed(0)}`,
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

    // PLAN §2: no skip link; the first Tab stop is standing row 1.
    await expect(page.getByText('Skip to the project')).toHaveCount(0);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return { row: el?.getAttribute('data-standing-row'), href: el?.getAttribute('href'), text: el?.textContent?.trim() };
    });
    console.log(`[first-tab] ${JSON.stringify(focused)}`);
    expect(focused).toEqual({ row: '1', href: '#letterbox', text: '$600.00 was due on 25 September.' });
  });

  test('1440: the hero bleeds the full width at most 648 tall, rows within 880', async ({ page }, info) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInAsJune(page, `/projects/${ELM.id}`);
    await settled(page);
    const frame = '[data-testid="house-issue-hero"] figure.ed-hero > .ed-plate__frame';
    await expect(page.locator(frame)).toBeVisible();
    await expect(page.locator('[data-testid="house-issue-hero"] h2')).toHaveText(LONGEST_HEADLINE);
    const hero = await box(page, frame);
    const title = await box(page, '[data-testid="house-issue-hero"] h2');
    const rows = await Promise.all([1, 2, 3].map((n) => box(page, `[data-standing-row="${n}"]`)));
    info.annotations.push({
      type: 'measured-1440',
      description: `hero frame ${hero.width.toFixed(0)}×${hero.height.toFixed(0)} at ${hero.top.toFixed(0)}; headline ${title.width.toFixed(0)}×${title.height.toFixed(0)}; rows ${rows.map((r) => `${r.top.toFixed(0)}–${r.bottom.toFixed(0)}`).join(', ')}`,
    });
    console.log(`[measured-1440] ${info.annotations.at(-1)!.description}`);
    expect(Math.abs(hero.width - 1440)).toBeLessThanOrEqual(1);
    expect(hero.height).toBeLessThanOrEqual(648);
    // R-v2-2: the standing rows' TOP is within 880 page-relative (fails above 900).
    for (const row of rows) expect(row.top).toBeLessThanOrEqual(880);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  });

  test('the hero preload is in the server HTML', async ({ page }) => {
    await signInAsJune(page, `/projects/${ELM.id}`);
    await settled(page);
    const html = await (await page.request.get(`/projects/${ELM.id}`)).text();
    const preloads = html.match(/<link[^>]+rel="preload"[^>]+as="image"[^>]*>/g) ?? [];
    const hero = preloads.filter((tag) => ELM_PLATE_SCOPE.test(tag));
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
    // A piece plate is lazy: it asks for its picture as it nears the screen.
    await sideboard.scrollIntoViewIfNeeded();
    await expect(sideboard.locator('.plate-note')).toHaveText('Picture did not load.', { timeout: 30000 });
    // Every plate request named a plate the house holds; none was for the sofa.
    expect(plates.length).toBeGreaterThan(0);
    for (const url of plates) expect(url).toMatch(ELM_PLATE_SCOPE);
    await expectAnchors(page);
  });

  test('a retired route lands on its anchor, carrying the entity it named', async ({ page }) => {
    await signInAsJune(page, `/projects/${ELM.id}`);
    await settled(page);
    const named = ELM.invoices[1];
    const fold = await page.request.get(`/invoices/${named}`, { maxRedirects: 0 });
    expect(fold.status()).toBe(308);
    const location = new URL(fold.headers()['location'] ?? '', 'http://localhost');
    expect([location.pathname, location.searchParams.get('invoice'), location.hash]).toEqual(['/', named, '#letterbox']);

    await page.goto(`/invoices/${named}`);
    await settled(page);
    await expect.poll(() => new URL(page.url()).hash).toBe('#letterbox');
    await expect(page.locator('[id="letterbox"]')).toHaveCount(1);
    // The letter the address named stands in the slot, not the one due first.
    const slot = page.locator('#letterbox [data-testid="spine-toll"]');
    await expect(slot).toBeVisible({ timeout: 30000 });
    await expect(slot).toHaveAttribute('data-invoice-id', named);
  });

  test('the till’s return resolves #letterbox, its query read on arrival', async ({ page }) => {
    await signInAsJune(page, `/projects/${ELM.id}`);
    await settled(page);
    const address = `/projects/${ELM.id}?invoice=${ELM.invoices[0]}&checkout=success&session_id=cs_e2e_sq1614#letterbox`;
    // Served where it was sent: no hop drops the query on the way in.
    const served = await page.request.get(address, { maxRedirects: 0 });
    expect(served.status()).toBe(200);

    await page.goto(address);
    await settled(page);
    // The receipt is the letterbox reading `?invoice=` and `?checkout=` off the address.
    await expect(page.getByTestId('letterbox-receipt')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('[id="letterbox"]')).toHaveCount(1);
    await expect(page.locator('#letterbox')).toBeInViewport({ timeout: 30000 });
    await expect.poll(() => new URL(page.url()).hash).toBe('#letterbox');
    // Read once, then struck out: a refresh never replays the return.
    await expect.poll(() => new URL(page.url()).searchParams.get('checkout')).toBeNull();
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

/*
 * The plate route has no PLATES binding under `next dev`, so every case above
 * meets the drawn fallback. These serve committed stand-in bytes instead and
 * measure the hero as a reader sees it: a decoded photograph, in its layout.
 */
test.describe('The House Issue, its pictures served', { tag: '@edition' }, () => {
  test.beforeEach(async ({ page }) => servePlates(page));

  test('1440: a landscape hero bleeds the full width, at most 648 tall', async ({ page }, info) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInAsJune(page, `/projects/${ELM.id}`);
    await settled(page);
    await expect(page.locator(HERO)).toHaveClass(/\bed-hero--bleed\b/);
    const src = await heroLoaded(page);
    const img = await rect(page, `${HERO} img.ed-plate__img`);
    info.annotations.push({
      type: 'measured-1440-bleed',
      description: `hero ${img.width.toFixed(1)}×${img.height.toFixed(1)} at x ${img.left.toFixed(1)}; ${src}`,
    });
    console.log(`[measured-1440-bleed] ${info.annotations.at(-1)!.description}`);
    expect(src).toContain('/wide-');
    expect(Math.abs(img.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(img.width - 1440)).toBeLessThanOrEqual(1);
    expect(img.height).toBeLessThanOrEqual(648);
    expect(await wider(page, 1440)).toEqual([]);
  });

  test('1440: a portrait hero stands inside the measure at 4:5, five-twelfths wide', async ({ page }, info) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInAsJune(page, `/projects/${GARDEN.id}`);
    await expect(page.getByTestId('doorplate-title')).toHaveText(GARDEN.name, { timeout: 60000 });
    await settled(page);
    await expect(page.locator(HERO)).toHaveClass(/\bed-hero--portrait\b/);
    const src = await heroLoaded(page);
    const measure = await rect(page, '[data-testid="house-issue-hero"]');
    const img = await rect(page, `${HERO} img.ed-plate__img`);
    const tab = await rect(page, '[data-testid="house-issue-hero"] .ed-tab');
    info.annotations.push({
      type: 'measured-1440-portrait',
      description: `hero ${img.width.toFixed(1)}×${img.height.toFixed(1)} at x ${img.left.toFixed(1)} in a ${measure.width.toFixed(0)} measure at x ${measure.left.toFixed(0)}; tab x ${tab.left.toFixed(0)}–${tab.right.toFixed(0)}; ${src}`,
    });
    console.log(`[measured-1440-portrait] ${info.annotations.at(-1)!.description}`);
    expect(src).toContain('/tall-');
    expect(measure.width).toBeLessThan(1440);
    expect(img.left).toBeGreaterThanOrEqual(measure.left - 0.5);
    expect(img.right).toBeLessThanOrEqual(measure.right + 0.5);
    expect(Math.abs(img.width - (measure.width * 5) / 12)).toBeLessThanOrEqual(1);
    expect(Math.abs(img.height / img.width - 5 / 4)).toBeLessThanOrEqual(0.01);
    expect(img.height).toBeLessThanOrEqual(648);
    // The paper tab reads beside the picture, never under it.
    expect(tab.left).toBeGreaterThanOrEqual(img.right);
    expect(tab.right).toBeLessThanOrEqual(measure.right + 0.5);
  });

  for (const house of [ELM, GARDEN]) {
    test(`390×400: ${house.name}'s hero holds 72svh, its tab and rows in reach`, async ({ page }, info) => {
      await page.setViewportSize({ width: 390, height: 400 });
      await signInAsJune(page, `/projects/${house.id}`);
      await expect(page.getByTestId('doorplate-title')).toHaveText(house.name, { timeout: 60000 });
      await settled(page);
      const src = await heroLoaded(page);
      const img = await rect(page, `${HERO} img.ed-plate__img`);
      const tab = page.locator('[data-testid="house-issue-hero"] .ed-tab');
      await tab.scrollIntoViewIfNeeded();
      await expect(tab).toBeVisible();
      const tabBox = await rect(page, '[data-testid="house-issue-hero"] .ed-tab');
      const rows = await Promise.all([1, 2, 3].map((n) => rect(page, `[data-standing-row="${n}"]`)));
      const type = `measured-390x400-${house === ELM ? 'bleed' : 'portrait'}`;
      info.annotations.push({
        type,
        description: `hero ${img.width.toFixed(1)}×${img.height.toFixed(1)}; tab x ${tabBox.left.toFixed(0)}–${tabBox.right.toFixed(0)}; rows ${rows.map((r) => r.height.toFixed(0)).join('/')} tall; ${src}`,
      });
      console.log(`[${type}] ${info.annotations.at(-1)!.description}`);
      expect(src).toContain('/cover_phone-');
      expect(Math.abs(img.width - 390)).toBeLessThanOrEqual(1);
      expect(img.height).toBeLessThanOrEqual(288.5);
      expect(tabBox.left).toBeGreaterThanOrEqual(0);
      expect(tabBox.right).toBeLessThanOrEqual(390);
      for (const row of rows) {
        expect(row.height).toBeGreaterThanOrEqual(44);
        expect(row.left).toBeGreaterThanOrEqual(0);
        expect(row.right).toBeLessThanOrEqual(390);
      }
      expect(await wider(page, 390)).toEqual([]);
      // A row is a working control on this screen, not just drawn on it.
      const link = page.locator('a[data-standing-row]').first();
      if ((await link.count()) > 0) {
        const href = (await link.getAttribute('href')) ?? '';
        await link.scrollIntoViewIfNeeded();
        await link.click();
        await expect.poll(() => new URL(page.url()).hash).toBe(href);
        await expect(page.locator(`[id="${href.slice(1)}"]`)).toBeInViewport();
      }
    });
  }
});

/**
 * US-49 Phase 2: Elm's approved Edition 2 (the fixture's editions block) is
 * what June reads. The studio then undoes it, and the page falls back to the
 * Phase 1 composition. One test, so no other worker reads a half-undone house;
 * every other Elm test accepts either plate scope (ELM_PLATE_SCOPE).
 */
test.describe('The House Issue, as the studio approved it', { tag: '@edition' }, () => {
  test.beforeEach(async ({ page }) => servePlates(page));

  test('Edition 2 opens the page; undone by the studio, the page is Phase 1 again', async ({ page }) => {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(serviceKey, 'Export the LOCAL service key to put the edition back').toBeTruthy();
    const admin = createClient(LOCAL_SUPABASE.url, serviceKey!, { auth: { persistSession: false } });
    const { data: row, error: rowError } = await admin
      .from('client_editions')
      .select('status, approved_at')
      .eq('id', ELM_EDITION.id)
      .single();
    expect(rowError, 'the fixture editions block has not been seeded').toBeNull();
    expect(row!.status).toBe('approved');

    const headlines = () => page.locator('.ed-tab__title, .ed-chapter-head__title').allTextContents();
    const plates = platesRequests(page);
    await signInAsJune(page, `/projects/${ELM.id}`);
    await settled(page);

    // The hero and its words are the edition's: a caption it wrote, a headline it composed.
    const hero = page.getByTestId('house-issue-hero');
    await expect(hero.locator('h2')).toHaveText(ELM_EDITION.coverHeadline);
    await expect(hero.locator('figcaption [data-caption-field="what"]')).toHaveText(ELM_EDITION.captionWhat);
    await expect(hero.locator('figcaption [data-caption-field]')).toHaveCount(3);
    await heroLoaded(page);
    expect(await headlines()).toEqual(expect.arrayContaining(Object.values(ELM_EDITION.headlines)));
    expect(plates.some((url) => url.includes(`/plates/${ELM_EDITION.id}/`))).toBe(true);

    // Maren's notice opens the letter; Earlier names the edition, who approved it and the day.
    const notice = page.getByTestId('edition-notice');
    await expect(notice).toHaveText(ELM_EDITION.notice);
    expect(await page.locator('#note blockquote').evaluate((el) => el.firstElementChild?.getAttribute('data-testid'))).toBe(
      'edition-notice',
    );
    const day = await page.evaluate(
      (iso) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' }).format(new Date(iso)),
      row!.approved_at as string,
    );
    await expect(page.locator('#previously').getByTestId('edition-line')).toHaveText(
      `Edition ${ELM_EDITION.seq} · approved by the studio · ${day}`,
    );
    await expectAnchors(page);

    // The studio's undo, signed in as the studio (undo is never service_role's).
    const studio = createClient(LOCAL_SUPABASE.url, LOCAL_SUPABASE.anon, { auth: { persistSession: false } });
    const signedIn = await studio.auth.signInWithPassword(STUDIO);
    expect(signedIn.error).toBeNull();
    try {
      const undone = await studio.rpc('undo_client_edition', { p_edition_id: ELM_EDITION.id });
      expect(undone.error).toBeNull();

      await page.reload();
      await settled(page);
      await expect(page.getByTestId('house-issue-head')).toBeVisible();
      await expect(page.getByTestId('edition-notice')).toHaveCount(0);
      await expect(page.getByTestId('edition-line')).toHaveCount(0);
      const phase1 = await headlines();
      expect(phase1.length).toBeGreaterThan(0);
      for (const words of [ELM_EDITION.coverHeadline, ...Object.values(ELM_EDITION.headlines)]) {
        expect(phase1).not.toContain(words);
      }
      await expectAnchors(page);
    } finally {
      // Put Edition 2 back for the next run: fixture housekeeping, not a studio act.
      await studio.auth.signOut();
      const restored = await admin
        .from('client_editions')
        .update({ status: 'approved', superseded_at: null, superseded_by: null })
        .eq('id', ELM_EDITION.id);
      expect(restored.error).toBeNull();
    }
  });
});
