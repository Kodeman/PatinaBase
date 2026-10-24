import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth';

const JOB = 'f0180000-0000-4000-8000-000000000010';
const LIVING = 'f0180000-0000-4000-8000-000000000011';
const WIDTHS = [320, 390, 768, 1024, 1179, 1180, 1181, 1439, 1440, 1441, 1920];

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
  await page.keyboard.press('Shift');
  await expect(control).toBeFocused();
  await expect.poll(() => control.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    return rect.left >= 0 && rect.right <= innerWidth + 1 && y > 0 && y < innerHeight
      && !!hit && (element === hit || element.contains(hit))
      && getComputedStyle(element).outlineStyle !== 'none';
  }), { message: 'keyboard focus is painted and not covered by the head or bottom edge' }).toBe(true);
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
  const toggle = room.getByRole('button', { name: /Living Room/ });
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

  test('studio stacks imagery first, reflows the register and yields compact navigation', async ({ authenticatedPage: page }) => {
    await settled(page, '/desk', '[data-studio="round8"]');
    for (const width of WIDTHS) {
      await test.step(`${width}px studio`, async () => {
        await page.setViewportSize({ width, height: 900 });
        const nav = page.getByRole('navigation', { name: 'Studio', exact: true });
        if (width < 1180) {
          await expect(nav).toBeHidden();
          await page.getByRole('button', { name: 'More studio actions', exact: true }).click();
          await expect(page.getByRole('group', { name: 'More studio actions', exact: true })
            .getByRole('button', { name: 'Ledgers', exact: true })).toBeVisible();
          await page.keyboard.press('Escape');
        } else await expect(nav).toBeVisible();
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
