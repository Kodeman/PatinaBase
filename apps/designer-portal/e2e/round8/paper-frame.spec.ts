import { test, expect } from '../fixtures/auth';
import type { Page } from '@playwright/test';
import { PROJECT_PAPER_ORDER } from '../../src/lib/document/document-index';
import { ROUND8_INDEX_KEYS } from '../../src/lib/document/round8-paper-order';

// F01's full-service job (f01-fixture.sql).
const JOB = 'f0180000-0000-4000-8000-000000000010';

async function openJob(page: Page) {
  // The first next dev compile of /doc/[id] is slow.
  await page.goto(`/doc/${JOB}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await expect(page.locator('[data-document-shell]')).toBeVisible({ timeout: 60_000 });
}

const attrs = (page: Page, selector: string, name: string) =>
  page.locator(selector).evaluateAll(
    (els, attr) => els.map((el) => el.getAttribute(attr as string)),
    name,
  );

test.describe('WP-01.5 round-8 paper frame (F01)', () => {
  test('renderer on: one continuous paper with the mounted chapters in order', async ({ authenticatedPage: page }) => {
    await openJob(page);

    await expect(page.locator('[data-paper-renderer="round8"]')).toHaveCount(1);
    await expect(page.locator('[data-document-shell]')).toHaveCount(1);
    await expect(page.locator('main[data-document-paper][data-spotlight-frame]')).toHaveCount(1);
    // The legacy one-spread composition is not on the round-8 paper.
    await expect(page.locator('[data-active-section]')).toHaveCount(0);
    await expect(page.locator('[data-paper-chapter="ffe"]')).toBeAttached({ timeout: 30_000 });

    const chapters = await attrs(page, '[data-paper-chapter]', 'data-paper-chapter');
    expect(chapters, 'F01 carries approvals, pieces, money and the record').toEqual(
      expect.arrayContaining(['approvals', 'schedule', 'ffe', 'financials', 'record']),
    );
    expect(chapters, 'chapters stand in ROUND8_PAPER_ORDER').toEqual(
      ROUND8_INDEX_KEYS.filter((key) => chapters.includes(key)),
    );
    // Every chapter sits in the one paper, never in a second frame.
    await expect(page.locator('main[data-document-paper] [data-paper-chapter]')).toHaveCount(chapters.length);
  });

  test('the contents margin names exactly the mounted chapters', async ({ authenticatedPage: page }) => {
    test.skip((page.viewportSize()?.width ?? 1440) < 1180, 'the contents margin stands from 1180px');
    await openJob(page);
    await expect(page.locator('[data-paper-chapter="ffe"]')).toBeAttached({ timeout: 30_000 });

    const nav = page.getByRole('navigation', { name: 'Job contents', exact: true });
    await expect(nav).toBeVisible();
    const chapters = await attrs(page, '[data-paper-chapter]', 'data-paper-chapter');
    await expect
      .poll(() => nav.locator('[data-contents-entry]').evaluateAll((els) => els.map((el) => el.getAttribute('data-contents-entry'))))
      .toEqual(chapters);
  });

  test('a contents press scrolls to the chapter and moves focus to its heading', async ({ authenticatedPage: page }) => {
    test.skip((page.viewportSize()?.width ?? 1440) < 1180, 'the contents margin stands from 1180px');
    await openJob(page);
    const nav = page.getByRole('navigation', { name: 'Job contents', exact: true });
    const entry = nav.locator('[data-contents-entry="ffe"]');
    await expect(entry).toBeVisible({ timeout: 30_000 });

    // Keyboard focus first: the entry's focus ring is inset, so it is drawn
    // inside the margin column rather than clipped at its edge (SQ-1875).
    await entry.focus();
    const ring = await entry.evaluate((el) => {
      const style = getComputedStyle(el);
      const width = parseFloat(style.outlineWidth) || 0;
      const offset = parseFloat(style.outlineOffset) || 0;
      const r = el.getBoundingClientRect();
      const a = el.closest('aside')!.getBoundingClientRect();
      const grow = width + offset;
      return {
        visible: el.matches(':focus-visible') && style.outlineStyle !== 'none' && width > 0,
        inside:
          r.left - grow >= a.left - 0.5 &&
          r.right + grow <= a.right + 0.5 &&
          r.top - grow >= a.top - 0.5 &&
          r.bottom + grow <= a.bottom + 0.5,
        offset,
      };
    });
    expect(ring.visible, 'the focused entry draws its ring').toBe(true);
    expect(ring.offset, 'the ring is inset').toBeLessThan(0);
    expect(ring.inside, "the focused entry's outline sits inside the aside").toBe(true);

    await entry.press('Enter');
    const heading = page.locator('#ffe-chapter-heading');
    await expect(heading).toBeFocused({ timeout: 10_000 });
    await expect(heading).toBeInViewport();
    await expect(page.locator('[data-document-shell]')).toHaveAttribute('data-reading-index', 'ffe', {
      timeout: 10_000,
    });
  });

  test('renderer override off: the legacy paper @renderer-off', async ({ authenticatedPage: page }) => {
    await openJob(page);
    await expect(page.getByRole('navigation', { name: 'This paper', exact: true })).toBeVisible({ timeout: 30_000 });

    // A stale round-8 compile fails here rather than passing quietly.
    await expect(page.locator('[data-paper-renderer]')).toHaveCount(0);
    await expect(page.locator('[data-paper-chapter]')).toHaveCount(0);
    await expect(page.locator('[data-active-section]')).toHaveCount(1);
    const regions = await page
      .locator('main[data-document-paper] [data-index-region]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-index-region')));
    const legacy = PROJECT_PAPER_ORDER.map((region) => region.key as string);
    const mounted = legacy.filter((key) => regions.includes(key));
    expect(mounted, 'F01 prints the legacy project regions').toEqual(
      expect.arrayContaining(['approvals', 'schedule', 'ffe', 'record']),
    );
    expect(
      regions.filter((key): key is string => key !== null && legacy.includes(key)),
      'regions stand in PROJECT_PAPER_ORDER',
    ).toEqual(mounted);
  });
});
