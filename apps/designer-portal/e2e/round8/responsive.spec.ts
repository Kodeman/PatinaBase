import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth';

const JOB = 'f0180000-0000-4000-8000-000000000010';
const LIVING = 'f0180000-0000-4000-8000-000000000011';
const LIBRARY_HEADING = 'A library with a point of view.';
const WIDTHS = [320, 390, 599, 600, 601, 768, 1024, 1179, 1180, 1181, 1439, 1440, 1441, 1920];

async function settled(page: Page, path: string, selector: string) {
  await page.goto('about:blank');
  await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await expect(page.locator(selector)).toHaveAttribute('data-arrival-ready', '', { timeout: 60_000 });
  await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/, { timeout: 30_000 });
}

async function noPageOverflow(page: Page) {
  expect(await page.evaluate(() => Math.max(document.body.scrollWidth, document.documentElement.scrollWidth)
    - document.documentElement.clientWidth), 'no horizontal page scroll').toBeLessThanOrEqual(1);
}

async function unobscured(page: Page, control: Locator) {
  await control.scrollIntoViewIfNeeded();
  await control.focus();
  // Safari's full-control tab order uses Option+Tab. Plain Tab skips links,
  // and a later programmatic focus does not inherit :focus-visible there.
  const option = page.context().browser()?.browserType().name() === 'webkit' ? 'Alt+' : '';
  await page.keyboard.press(`${option}Shift+Tab`);
  await page.keyboard.press(`${option}Tab`);
  await expect(control).toBeFocused();
  await expect.poll(() => control.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    return {
      withinViewport: rect.left >= 0 && rect.right <= innerWidth + 1 && y > 0 && y < innerHeight,
      uncovered: !!hit && (element === hit || element.contains(hit)),
      ringPainted: getComputedStyle(element).outlineStyle !== 'none',
    };
  }), { message: 'keyboard focus is painted and not covered by the head or bottom edge' }).toEqual({
    withinViewport: true, uncovered: true, ringPainted: true,
  });
}

async function keyboardActivate(page: Page, control: Locator) {
  const tab = page.context().browser()?.browserType().name() === 'webkit' ? 'Alt+Tab' : 'Tab';
  // Traverse from the reader's current place: no focus(), click() or scroll rescue.
  for (let step = 0; step < 60 && !await control.evaluate((element) => element === document.activeElement); step++) {
    await page.keyboard.press(tab);
  }
  await expect(control, 'the compact destination is reachable through native tab order').toBeFocused();
  await page.keyboard.press('Enter');
}

async function keyboardCommand(page: Page, query: string, label: string) {
  await keyboardActivate(page, page.getByRole('button', { name: 'More studio actions', exact: true }));
  const menu = page.getByRole('group', { name: 'More studio actions', exact: true });
  await keyboardActivate(page, menu.getByRole('button', { name: /^Find anything/ }));
  const search = page.getByRole('dialog', { name: 'Studio search', exact: true });
  const input = search.getByRole('combobox', { name: 'Studio search', exact: true });
  await expect(input).toBeFocused();
  await page.keyboard.type(query);
  const row = search.getByRole('option').filter({ has: page.getByText(label, { exact: true }) });
  await expect(row).toBeVisible();
  const id = await row.getAttribute('id');
  expect(id, 'registry result has a keyboard selection identity').toBeTruthy();
  const count = await search.getByRole('option').count();
  for (let step = 0; step < count && await input.getAttribute('aria-activedescendant') !== id; step++) {
    await page.keyboard.press('ArrowDown');
  }
  await expect(input).toHaveAttribute('aria-activedescendant', id!);
  await expect(row).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(search).toHaveCount(0);
}

async function selectFfe(page: Page, width: number) {
  const margin = page.locator('[data-contents-margin]');
  if (width >= 1180) {
    await expect(margin).toBeVisible();
    await margin.locator('[data-contents-entry="ffe"]').click();
  } else {
    await expect(margin).toBeHidden();
    const door = page.locator('[data-sections-door]');
    await unobscured(page, door);
    await page.keyboard.press('Enter');
    const sheet = page.getByRole('dialog', { name: 'Sections of this document', exact: true });
    await expect(sheet).toBeVisible();
    // These are round-8 chapter words, not the legacy spread's region ladder.
    await expect(sheet.getByRole('button', { name: /^Design$/ })).toBeVisible();
    await sheet.getByRole('button', { name: /^FF&E/ }).click();
    await expect(sheet).toHaveCount(0);
  }
  await expect(page.locator('#ffe-chapter-heading')).toBeFocused({ timeout: 10_000 });
}

async function unfoldAndReturn(page: Page, reducedMotion = false) {
  const room = page.locator(`[data-paper-chapter="ffe"] [data-pieces-room="${LIVING}"]`);
  await room.scrollIntoViewIfNeeded();
  const toggle = room.getByRole('button', { name: 'Living Room', exact: true });
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  const door = room.getByRole('link', { name: /Edit room selections/ });
  await unobscured(page, door);
  await page.keyboard.press('Enter');
  const instrument = page.locator('[data-unfold-instrument="pieces"]');
  await expect(instrument).toBeVisible({ timeout: 30_000 });
  if (reducedMotion) {
    expect(await instrument.evaluate((element) => element.getAnimations().length),
      'reduced motion unfolds immediately without an instrument animation').toBe(0);
  }
  await expect(instrument.locator(`[data-room-heading="${LIVING}"]`)).toBeFocused({ timeout: 30_000 });
  const body = instrument.locator('[data-build-room-embedded="true"] > div > section');
  await expect(body).toHaveAttribute('aria-labelledby', /.+/);
  expect(await body.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= innerWidth + 1
      && getComputedStyle(element).overflowX === 'auto';
  }), 'dense work scrolls in its labelled region, not behind the page clip').toBe(true);
  await noPageOverflow(page);
  await page.keyboard.press('Escape');
  await expect(instrument).toHaveCount(0);
  await expect(door).toBeFocused({ timeout: 10_000 });
  await unobscured(page, door);
}

test.describe('WP-01.10 responsive studio and job paper (live F01)', () => {
  test.setTimeout(300_000);

  // `next dev` floats its dev-tools badge at the bottom-left; at 320px it sits
  // over the centre of the dock's contents door, which "uncovered" would count.
  // Production renders no <nextjs-portal>, so hiding it hides nothing real.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = 'nextjs-portal { display: none !important; }';
        document.head.appendChild(style);
      });
    });
  });

  // SQ-2302: the phone keeps the Studio doors in the masthead (wrapped under
  // it); More and Find stay a second way in, and these tests walk that way.
  test.describe('phone compact destinations at 390px', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    test('keyboard opens Studio accounts through More and Ledgers', async ({ authenticatedPage: page }) => {
      await settled(page, '/desk', '[data-studio="round8"]');
      await expect(page.getByRole('navigation', { name: 'Studio', exact: true })).toBeVisible();
      await keyboardActivate(page, page.getByRole('button', { name: 'More studio actions', exact: true }));
      await keyboardActivate(page, page.getByRole('group', { name: 'More studio actions', exact: true })
        .getByRole('button', { name: 'Ledgers', exact: true }));
      const ledgers = page.getByRole('dialog', { name: 'Ledgers', exact: true });
      await expect(ledgers).toBeVisible();
      await keyboardActivate(page, ledgers.getByRole('button', { name: 'Studio accounts', exact: true }));
      await expect(page.getByRole('dialog', { name: 'Studio accounts', exact: true })).toBeVisible({ timeout: 30_000 });
      await expect(page).toHaveURL(/\/desk(\?|$)/);
    });

    // Round-8 Library and People print their own h1 (round8-library-editorial.tsx,
    // people-room.tsx; library-resources and people-resources specs). The legacy
    // name shows only before the round-8 view mounts; the registry row keeps it.
    for (const [destination, query, label, path, heading] of [
      ['Library', 'library', 'Resource library', '/library', LIBRARY_HEADING],
      ['People', 'people', 'Studio contacts', '/people', 'People'],
      ['Measured rooms', 'measured rooms', 'Measured rooms', '/rooms', 'Measured rooms'],
      ['Correspondence', 'inbox', 'Studio inbox', '/desk', 'Studio inbox'],
    ] as const) {
      test(`keyboard Find reaches ${destination} through its registry row`, async ({ authenticatedPage: page }) => {
        await settled(page, '/desk', '[data-studio="round8"]');
        await expect(page.getByRole('navigation', { name: 'Studio', exact: true })).toBeVisible();
        await keyboardCommand(page, query, label);
        await expect(page).toHaveURL(new RegExp(`${path}(\\?|$)`), { timeout: 60_000 });
        const landmark = destination === 'Correspondence'
          ? page.getByRole('dialog', { name: heading, exact: true })
          : page.getByRole('heading', { name: heading, exact: true, level: 1 });
        await expect(landmark).toBeVisible({ timeout: 60_000 });
      });
    }

    test('touch reaches Library through More and Find', async ({ authenticatedPage: page }) => {
      await settled(page, '/desk', '[data-studio="round8"]');
      await expect(page.getByRole('navigation', { name: 'Studio', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'More studio actions', exact: true }).tap();
      await page.getByRole('group', { name: 'More studio actions', exact: true })
        .getByRole('button', { name: /^Find anything/ }).tap();
      const search = page.getByRole('dialog', { name: 'Studio search', exact: true });
      const input = search.getByRole('combobox', { name: 'Studio search', exact: true });
      await input.tap();
      await input.fill('library');
      await search.getByRole('option').filter({ has: page.getByText('Resource library', { exact: true }) }).tap();
      await expect(search).toHaveCount(0);
      await expect(page).toHaveURL(/\/library(\?|$)/, { timeout: 60_000 });
      await expect(page.getByRole('heading', { name: LIBRARY_HEADING, exact: true, level: 1 }))
        .toBeVisible({ timeout: 60_000 });
    });
  });

  test('studio stacks imagery first, reflows the register and yields compact navigation', async ({ authenticatedPage: page }) => {
    await settled(page, '/desk', '[data-studio="round8"]');
    for (const width of WIDTHS) {
      await test.step(`${width}px studio`, async () => {
        await page.setViewportSize({ width, height: 900 });
        const nav = page.getByRole('navigation', { name: 'Studio', exact: true });
        await expect(nav).toBeVisible();
        if (width < 1180) {
          await page.getByRole('button', { name: 'More studio actions', exact: true }).click();
          await expect(page.getByRole('group', { name: 'More studio actions', exact: true })
            .getByRole('button', { name: 'Ledgers', exact: true })).toBeVisible();
          await page.keyboard.press('Escape');
        }
        await expect(page.locator('[data-studio-register-row]').first()).toBeVisible();
        const spread = page.locator('[data-studio-spread]');
        expect(await spread.evaluate((element) => {
          const [picture, attention] = Array.from(element.children).map((child) => child.getBoundingClientRect());
          return innerWidth >= 1180 || picture.bottom <= attention.top;
        }), 'imagery precedes attention at compact widths').toBe(true);
        await unobscured(page, page.getByRole('searchbox', { name: 'Find a job, person, product or record' }));
        await noPageOverflow(page);
        await page.screenshot({ path: test.info().outputPath(`studio-${width}.png`) });
      });
    }
  });

  test('contents, return and dense unfold stay reachable across every production boundary', async ({ authenticatedPage: page }) => {
    await settled(page, `/doc/${JOB}`, '[data-document-shell]');
    const shell = await page.locator('[data-document-shell]').elementHandle();
    for (const width of WIDTHS) {
      await test.step(`${width}px job`, async () => {
        await page.setViewportSize({ width, height: 900 });
        await unobscured(page, page.locator('[data-job-head-return]'));
        await selectFfe(page, width);
        await unfoldAndReturn(page);
        expect(await shell!.evaluate((element) => element.isConnected), 'same paper remains mounted').toBe(true);
        await noPageOverflow(page);
        await page.screenshot({ path: test.info().outputPath(`job-${width}.png`) });
      });
    }
  });

  test('200% layout reflow at 1280 and reduced-motion unfold retain the same controls', async ({ authenticatedPage: page }) => {
    // Browser zoom halves the CSS layout viewport: 1280 physical px at 200%
    // is 640 CSS px. deviceScaleFactor or CSS zoom alone would not test reflow.
    await page.setViewportSize({ width: 640, height: 450 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await settled(page, '/desk', '[data-studio="round8"]');
    await noPageOverflow(page);
    await unobscured(page, page.getByRole('searchbox', { name: 'Find a job, person, product or record' }));
    await settled(page, `/doc/${JOB}`, '[data-document-shell]');
    await selectFfe(page, 640);
    await unfoldAndReturn(page, true);
    await page.screenshot({ path: test.info().outputPath('reflow-200-percent.png') });
  });
});
