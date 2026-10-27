import { test, expect } from '../fixtures/auth';

const JOB = 'f0180000-0000-4000-8000-000000000010';
const NOTE = 'f0180000-0000-4000-8000-000000000030';

for (const [width, height] of [[1180, 800], [1440, 900], [1920, 1080]]) {
  test(`focused margin note clears the measured Studio drawer at ${width}x${height}`, async ({ authenticatedPage: page }, testInfo) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height });
    await page.goto(`/doc/${JOB}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await expect(page.locator('[data-arrival-ready]')).toHaveCount(1, { timeout: 60_000 });
    await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/, { timeout: 30_000 });
    await expect(page.locator('[data-paper-renderer="round8"]')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    const drawer = page.getByRole('navigation', { name: 'Studio drawer', exact: true });
    const note = page.locator(`[data-margin-panel] #margin-item-${NOTE}`);
    await expect(note).toBeEnabled();
    await note.evaluate(node => {
      node.focus({ preventScroll: true });
      node.scrollIntoView({ block: 'end', behavior: 'instant' });
    });
    await expect(note).toBeFocused();
    const geometry = await note.evaluate(node => {
      const box = node.getBoundingClientRect();
      const dock = document.querySelector('[aria-label="Studio drawer"]')!.getBoundingClientRect();
      const contents = node.closest('[data-contents-margin]')!;
      return {
        note: box.toJSON(), drawer: dock.toJSON(),
        publishedHeight: getComputedStyle(document.documentElement).getPropertyValue('--doc-drawer-height'),
        windowPadding: getComputedStyle(document.documentElement).scrollPaddingBottom,
        contents: contents.getBoundingClientRect().toJSON(),
        contentsPadding: getComputedStyle(contents).scrollPaddingBottom,
        hit: document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('button') === node,
      };
    });
    console.log(`[drawer-clearance ${width}x${height}]`, JSON.stringify(geometry));
    await testInfo.attach('clearance.json', { body: JSON.stringify(geometry, null, 2), contentType: 'application/json' });
    await page.screenshot({ path: testInfo.outputPath('focused-note.png') });
    expect.soft(geometry.note.bottom, 'focused note bottom stays above the drawer top').toBeLessThanOrEqual(geometry.drawer.top);
    expect(geometry.hit, 'focused note centre hits the note control itself').toBe(true);
    await expect(drawer).toBeVisible();
  });
}
