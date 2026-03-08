import { test, expect } from '@playwright/test';

test.describe('Project Timeline', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a project timeline page
    await page.goto('/projects/test-project-1/timeline');
  });

  test('should fade header on scroll', async ({ page }) => {
    // Get initial header opacity
    const header = page.locator('.timeline-header');
    await expect(header).toHaveCSS('opacity', '1');

    // Scroll down
    await page.evaluate(() => window.scrollBy(0, 200));

    // Check header has faded
    await expect(header).toHaveCSS('opacity', '0');
  });

  test('should animate milestone cards into view', async ({ page }) => {
    // Initially cards should be hidden
    const firstCard = page.locator('.milestone-card').first();
    await expect(firstCard).toHaveClass(/milestone-card--hidden/);

    // Scroll to bring card into view
    await firstCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400); // Wait for animation

    // Card should now be visible
    await expect(firstCard).toHaveClass(/milestone-card--visible/);
  });

  test('should expand milestone details on click', async ({ page }) => {
    const expandButton = page.locator('.milestone-expand-button').first();
    const details = page.locator('.milestone-details').first();

    // Initially collapsed
    await expect(expandButton).toHaveAttribute('aria-expanded', 'false');
    await expect(details).toHaveClass(/milestone-details--collapsed/);

    // Click to expand
    await expandButton.click();

    // Should be expanded
    await expect(expandButton).toHaveAttribute('aria-expanded', 'true');
    await expect(details).toHaveClass(/milestone-details--expanded/);
  });

  test('should respect reduced motion preference', async ({ page, browserName }) => {
    // Skip this test in webkit as it doesn't support emulateMedia well
    if (browserName === 'webkit') {
      test.skip();
    }

    // Enable reduced motion
    await page.emulateMedia({ reducedMotion: 'reduce' });

    await page.reload();

    // Cards should be immediately visible without animation
    const firstCard = page.locator('.milestone-card').first();
    await expect(firstCard).toHaveClass(/milestone-card--no-motion/);
  });

  test('should show loading skeleton while data loads', async ({ page }) => {
    // Navigate to a slow-loading timeline
    await page.goto('/projects/test-project-slow/timeline');

    // Should show skeleton
    await expect(page.locator('.timeline-skeleton')).toBeVisible();

    // Wait for content to load
    await page.waitForSelector('.timeline-container', { timeout: 5000 });

    // Skeleton should be gone
    await expect(page.locator('.timeline-skeleton')).not.toBeVisible();
  });
});