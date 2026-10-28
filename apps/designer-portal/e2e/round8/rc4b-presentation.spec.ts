import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth';

// RC-4b (SQ-2336) — the compact next-act band now names the task (N2). The
// schedule glance and jumped-to landings stand under the declared
// --doc-band-height, so the named line must stay one row. Also: the
// phase "···" menu and the ghost "Name a phase" underline stay inside a 320
// viewport, and the current Studio room reads in moss.

const JOB = '/doc/f0180000-0000-4000-8000-000000000010';
const PHONE = [390, 320];

async function settled(page: Page, path: string, selector: string) {
  await page.goto('about:blank');
  await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await expect(page.locator(selector)).toHaveAttribute('data-arrival-ready', '', { timeout: 60_000 });
  await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/, { timeout: 30_000 });
}

/** The schedule chapter opens folded; unfold its dates so the phases mount. */
async function openSchedule(page: Page) {
  await page.getByRole('button', { name: /Schedule dates/ }).click();
  const ghost = page.locator('input[aria-label="Name a phase"]');
  await expect(ghost).toBeAttached({ timeout: 30_000 });
  await ghost.scrollIntoViewIfNeeded();
  return ghost;
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: test.info().outputPath(`${name}.png`) });
}

for (const width of PHONE) {
  test(`job band stays within its declared height and clears the schedule glance at ${width}`, async ({ authenticatedPage: page }, info) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width, height: page.viewportSize()?.height ?? 844 });
    await settled(page, JOB, '[data-document-shell]');
    const band = page.locator('[data-lens-band]');
    await expect(band).toBeVisible();

    const bandAtRest = await band.evaluate((element) => {
      const declared = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--doc-band-height'));
      const line = (n: number) => element.querySelector(`[data-lens-line="${n}"]`)?.getBoundingClientRect().height ?? 0;
      return {
        height: element.getBoundingClientRect().height,
        declared,
        line1: line(1),
        line2: line(2),
        sentence: element.querySelector('[data-lens-sentence]')?.textContent?.trim() ?? '',
      };
    });
    await band.scrollIntoViewIfNeeded();
    await shot(page, `band-${width}`);
    console.log('[rc4b-band-rest]', JSON.stringify({ width, project: info.project.name, bandAtRest }));

    expect(bandAtRest.sentence, 'the compact band still names the task (N2)').toContain('F01 review living-room selections');
    // Line 2 holds one 15px/1.3 sentence row; N2 adds no row to the band.
    expect(bandAtRest.line2, 'the named next act stays one row').toBeLessThanOrEqual(15 * 1.3 + 1);
    // Where the eyebrow (line 1) is one row, the band is the declared 56px plus
    // at most the sub-pixel rounding of its 1px rule. At 320 the eyebrow wraps
    // on the base renderer too (US-28 S7, never ellipsised): recorded, not
    // asserted here.
    if (bandAtRest.line1 < 20) {
      expect(bandAtRest.height, 'band within --doc-band-height').toBeLessThan(bandAtRest.declared + 1);
    }

    // Where the job prints a schedule glance (it needs project dates), scroll
    // the strip past so the glance pins under the band, and check it clears.
    const rule = page.locator('section[aria-label="Schedule rule"]');
    if ((await rule.count()) === 0) {
      info.annotations.push({ type: 'rc4b-glance', description: 'no schedule glance on this job (no project dates)' });
      console.log('[rc4b-glance]', JSON.stringify({ width, project: info.project.name, glance: 'absent' }));
      return;
    }
    await rule.evaluate((section) => {
      const sentinel = section.previousElementSibling as HTMLElement;
      sentinel.scrollIntoView({ block: 'start' });
      window.scrollBy(0, 40);
    }, undefined, { timeout: 10_000 });
    const glance = page.locator('section[aria-label="Schedule rule"] > div');
    await expect(glance).toBeVisible({ timeout: 10_000 });
    const pinned = await page.evaluate(() => {
      const bandRect = document.querySelector('[data-lens-band]')!.getBoundingClientRect();
      const glanceRect = document.querySelector('section[aria-label="Schedule rule"] > div')!.getBoundingClientRect();
      return { bandBottom: bandRect.bottom, glanceTop: glanceRect.top };
    });
    await shot(page, `glance-${width}`);
    console.log('[rc4b-glance]', JSON.stringify({ width, project: info.project.name, pinned }));
    expect(pinned.bandBottom, 'pinned glance starts at or below the band').toBeLessThanOrEqual(pinned.glanceTop + 1);
  });
}

test('phase menus and the ghost phase underline stay inside a 320 viewport', async ({ authenticatedPage: page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 320, height: page.viewportSize()?.height ?? 844 });
  await settled(page, JOB, '[data-document-shell]');
  await openSchedule(page);
  await page.locator('[data-schedule-phase]').last().scrollIntoViewIfNeeded();
  await shot(page, 'phases-320');
  const edges = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    menus: Array.from(document.querySelectorAll('[data-schedule-phase] .doc-row-verbs'))
      .map((element) => element.getBoundingClientRect().right),
    ghost: document.querySelector('input[aria-label="Name a phase"]')?.getBoundingClientRect().right ?? null,
  }));
  console.log('[rc4b-phase-320]', JSON.stringify(edges));
  expect(edges.menus.length).toBeGreaterThan(0);
  for (const right of edges.menus) expect(right, 'phase menu inside the viewport').toBeLessThanOrEqual(edges.viewport);
  expect(edges.ghost).not.toBeNull();
  expect(edges.ghost!, 'ghost phase underline inside the viewport').toBeLessThanOrEqual(edges.viewport);
});

test('the ghost phase underline keeps its intrinsic width on desktop paper', async ({ authenticatedPage: page }, info) => {
  test.skip(info.project.name !== 'chromium', 'desktop width only');
  test.setTimeout(240_000);
  await settled(page, JOB, '[data-document-shell]');
  const ghost = await openSchedule(page);
  await shot(page, 'ghost-1440');
  const widths = await ghost.evaluate((input) => ({
    input: input.getBoundingClientRect().width,
    column: (input.parentElement as HTMLElement).getBoundingClientRect().width,
  }));
  console.log('[rc4b-ghost-1440]', JSON.stringify(widths));
  expect(widths.input).toBeGreaterThanOrEqual(280);
  expect(widths.input, 'not stretched to the full column').toBeLessThan(widths.column);
});

for (const width of PHONE) {
  test(`the current Studio room reads in moss at ${width}`, async ({ authenticatedPage: page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width, height: page.viewportSize()?.height ?? 844 });
    await settled(page, '/desk', '[data-studio="round8"]');
    const current = page.locator('[data-studio-door][aria-current="page"]');
    await expect(current).toBeVisible();
    await expect(current).toHaveCSS('color', 'rgb(62, 81, 69)');
    await expect(current).toHaveCSS('font-weight', '600');
    await shot(page, `desk-current-${width}`);
  });
}
