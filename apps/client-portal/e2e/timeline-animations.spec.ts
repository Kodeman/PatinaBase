import { test, expect } from '@playwright/test';

test.describe('Timeline Scroll Animations', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a project page with timeline
    await page.goto('/projects/test-project');
  });

  test('header should fade out on scroll', async ({ page }) => {
    // Find the progress indicator (header)
    const progressIndicator = page.locator('[role="progressbar"]').first();

    // Initially should be fully visible
    await expect(progressIndicator).toBeVisible();
    const initialOpacity = await progressIndicator.evaluate((el) =>
      window.getComputedStyle(el).opacity
    );
    expect(parseFloat(initialOpacity)).toBe(1);

    // Scroll down 200px
    await page.evaluate(() => window.scrollTo(0, 200));
    await page.waitForTimeout(400); // Wait for animation

    // Should be faded out
    const scrolledOpacity = await progressIndicator.evaluate((el) =>
      window.getComputedStyle(el).opacity
    );
    expect(parseFloat(scrolledOpacity)).toBeLessThan(1);
  });

  test('background overlay should appear on scroll', async ({ page }) => {
    // Look for the background overlay
    const overlay = page.locator('.fixed.inset-0.pointer-events-none.z-0');

    // Initially should have low opacity
    const initialOpacity = await overlay.evaluate((el) =>
      window.getComputedStyle(el).opacity
    );
    expect(parseFloat(initialOpacity)).toBe(0);

    // Scroll down significantly
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(400); // Wait for animation

    // Overlay should be more visible
    const scrolledOpacity = await overlay.evaluate((el) =>
      window.getComputedStyle(el).opacity
    );
    expect(parseFloat(scrolledOpacity)).toBeGreaterThan(0);
  });

  test('timeline cards should animate on viewport entry', async ({ page }) => {
    // Get timeline segment cards
    const cards = page.locator('[data-segment-id]');
    const firstCard = cards.first();
    const lastCard = cards.last();

    // First card should be visible and animated
    await expect(firstCard).toBeVisible();
    const firstCardOpacity = await firstCard.evaluate((el) =>
      window.getComputedStyle(el).opacity
    );
    expect(parseFloat(firstCardOpacity)).toBe(1);

    // Last card might be below viewport, should be hidden
    const lastCardBounds = await lastCard.boundingBox();
    const viewport = page.viewportSize();

    if (lastCardBounds && viewport && lastCardBounds.y > viewport.height) {
      const lastCardOpacity = await lastCard.evaluate((el) =>
        window.getComputedStyle(el).opacity
      );
      expect(parseFloat(lastCardOpacity)).toBe(0);

      // Scroll to last card
      await lastCard.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400); // Wait for animation

      // Should now be visible
      const scrolledOpacity = await lastCard.evaluate((el) =>
        window.getComputedStyle(el).opacity
      );
      expect(parseFloat(scrolledOpacity)).toBe(1);
    }
  });

  test('expansion animations should work for expandable segments', async ({ page }) => {
    // Find an expandable segment
    const expandableSegment = page.locator('[data-segment-id]').filter({
      has: page.locator('button[aria-label*="expand"]')
    }).first();

    if (await expandableSegment.count() > 0) {
      const expandButton = expandableSegment.locator('button[aria-label*="expand"]');
      const expandableContent = expandableSegment.locator('[data-expanded-content]');

      // Initially collapsed
      await expect(expandableContent).toBeHidden();

      // Click to expand
      await expandButton.click();
      await page.waitForTimeout(400); // Wait for animation

      // Should be expanded
      await expect(expandableContent).toBeVisible();

      // Icon should be rotated
      const iconRotation = await expandButton.locator('svg').evaluate((el) =>
        window.getComputedStyle(el).transform
      );
      expect(iconRotation).toContain('rotate');
    }
  });

  test('stagger delays should be applied to multiple cards', async ({ page }) => {
    const cards = page.locator('[data-segment-id]');
    const cardCount = await cards.count();

    if (cardCount >= 2) {
      const firstCardDelay = await cards.first().evaluate((el) =>
        window.getComputedStyle(el).transitionDelay
      );
      const secondCardDelay = await cards.nth(1).evaluate((el) =>
        window.getComputedStyle(el).transitionDelay
      );

      // Parse delays (e.g., "0ms", "50ms")
      const firstDelay = parseFloat(firstCardDelay);
      const secondDelay = parseFloat(secondCardDelay);

      // Second card should have a higher delay
      expect(secondDelay).toBeGreaterThan(firstDelay);
    }
  });
});