import { expect, type Locator, type Page } from '@playwright/test';
import { test as authenticatedTest } from '../fixtures/auth';

const JOB = 'f0180000-0000-4000-8000-000000000010';
const HEIGHT = 800;
const ZOOMED_WIDTHS = [640, 720, 960];

async function fullyInsideViewport(page: Page, control: Locator) {
  await control.focus();
  await expect(control).toBeFocused();
  await expect(control).toBeVisible();
  await expect.poll(async () => {
    const box = await control.boundingBox();
    if (!box) return false;
    const hit = await control.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return target === element || element.contains(target);
    });
    const viewport = page.viewportSize();
    if (!viewport) return false;
    return box.x >= 0 && box.y >= 0
      && box.x + box.width <= viewport.width
      && box.y + box.height <= viewport.height && hit;
  }).toBe(true);
}

for (const width of ZOOMED_WIDTHS) {
  authenticatedTest.describe(`round-eight paper at ${width}px CSS width (200% zoom)`, () => {
    authenticatedTest.use({ viewport: { width, height: HEIGHT }, deviceScaleFactor: 2 });
    authenticatedTest.setTimeout(180_000);

    for (const route of ['/desk', `/doc/${JOB}`]) {
      authenticatedTest(`${route} keeps its focused skip link fully visible`, async ({ authenticatedPage: page }) => {
        await page.goto('about:blank');
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('[data-paper-renderer="round8"]')).toBeVisible({ timeout: 60_000 });
        await fullyInsideViewport(page, page.getByRole('link', { name: 'Skip to main content' }));
      });
    }

    authenticatedTest('the job drawer keeps Account and settings fully visible', async ({ authenticatedPage: page }) => {
      await page.goto('about:blank');
      await page.goto(`/doc/${JOB}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('[data-document-shell][data-paper-renderer="round8"]')).toBeVisible({ timeout: 60_000 });
      await page.getByRole('button', { name: 'More studio actions' }).click();
      await page.getByRole('button', { name: 'Ledgers', exact: true }).click();
      await fullyInsideViewport(page, page.getByRole('button', { name: 'Account and settings' }));
    });
  });
}
