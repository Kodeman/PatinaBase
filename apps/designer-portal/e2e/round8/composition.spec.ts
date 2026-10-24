import { test, expect } from '../fixtures/auth';
import type { Page } from '@playwright/test';
import path from 'node:path';
import { mkdirSync } from 'node:fs';

const JOB = 'f0180000-0000-4000-8000-000000000010';
const desktopCopy = 'One client, one paper. The contents on the right say where this stands; the margin beneath them is where decisions, messages, and money gather. Nothing is a form — it fills as the work happens.';
const evidence = process.env.PLAYWRIGHT_OUTPUT_DIR!;

async function settled(page: Page) {
  await expect(page.locator('[data-arrival-ready]')).toHaveCount(1, { timeout: 60_000 });
  await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/, { timeout: 30_000 });
}
async function screenshot(page: Page, name: string) {
  mkdirSync(path.join(evidence, 'composition'), { recursive: true });
  await page.screenshot({ path: path.join(evidence, 'composition', `${process.env.COMPOSITION_PHASE ?? 'after'}-${name}.png`) });
}

test.describe('round-8 composition (live F01)', () => {
  test.setTimeout(180_000);
  for (const [width, fontSize] of [[1440, 68], [1180, 56.64], [1024, 49.152], [390, 40]]) {
    test(`job paper and reachable margin at ${width}`, async ({ authenticatedPage: page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/doc/${JOB}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await settled(page);
      const title = page.locator('[data-paper-cover] h1');
      await expect(title).toBeVisible();
      await screenshot(page, `job-${width}`);
      expect(await title.evaluate(node => parseFloat(getComputedStyle(node).fontSize)), 'commission display scale').toBeCloseTo(fontSize, 0);
      const contents = page.locator('[data-contents-margin]');
      if (width >= 1180) {
        const paper = page.locator('[data-document-paper]');
        const grid = paper.locator('..');
        const geometry = await grid.evaluate(node => ({ columns: getComputedStyle(node).gridTemplateColumns.split(' ').length, children: node.children.length }));
        expect(geometry, 'only paper and one shared margin column').toEqual({ columns: 2, children: 2 });
        if (width === 1440) expect((await paper.boundingBox())!.width).toBeGreaterThanOrEqual(1000);
        const margin = contents.locator('[data-margin-panel]');
        await expect(margin).toHaveAttribute('data-margin-mode', 'stacked');
        const nav = contents.getByRole('navigation');
        expect(await margin.evaluate((node, navNode) => node.getBoundingClientRect().top >= (navNode as Element).getBoundingClientRect().bottom, await nav.elementHandle())).toBe(true);
        await expect(page.locator('[data-margin-trigger]')).toHaveCount(0);
        if (width === 1440) {
          await expect(margin.getByText(desktopCopy, { exact: true })).toBeVisible();
          await expect(page.getByText(/rail on the left/)).toHaveCount(0);
        }
        await margin.scrollIntoViewIfNeeded();
        await expect(margin).toBeVisible();
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('document:open-margin')));
        expect(await margin.evaluate(node => node.contains(document.activeElement)), 'margin open request reaches its controls').toBe(true);
      } else {
        await expect(contents).toBeHidden();
        if (width === 390) {
          await page.getByRole('button', { name: 'More studio actions', exact: true }).click();
          await page.getByRole('group', { name: 'In this document', exact: true }).getByRole('button', { name: /^Margin/ }).click();
          await expect(page.getByRole('dialog', { name: 'The margin', exact: true })).toBeVisible();
        }
      }
    });
  }

  for (const [width, gap] of [[1440, 48], [1180, 24]]) {
    test(`studio spread gap at ${width}`, async ({ authenticatedPage: page }) => {
      await page.setViewportSize({ width, height: 900 });
      if (new URL(page.url()).pathname !== '/desk') await page.goto('/desk', { waitUntil: 'domcontentloaded' });
      await settled(page);
      const spread = page.locator('[data-studio-spread]');
      await expect(spread).toBeVisible();
      await screenshot(page, `studio-${width}`);
      expect(await spread.evaluate(node => parseFloat(getComputedStyle(node).columnGap)), 'mapped studio spread gap').toBe(gap);
    });
  }
});
