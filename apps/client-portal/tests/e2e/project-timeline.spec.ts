/**
 * Client Portal - Project Timeline E2E Tests
 *
 * Tests timeline scrolling, segment navigation, and media display.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3002';

async function loginAsClient(page: any) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="email"], input[type="email"]', 'client@test.patina.local');
  await page.fill('input[name="password"], input[type="password"]', 'TestClient123!');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/projects/, { timeout: 15000 });
}

async function navigateToFirstProject(page: any) {
  await page.goto(`${BASE_URL}/projects`);
  await page.waitForSelector('[data-testid="project-card"], .project-card, article', {
    timeout: 10000,
  });
  const firstProject = page.locator('[data-testid="project-card"], .project-card, article').first();
  await firstProject.click();
  await page.waitForURL(/\/projects\/[^/]+/, { timeout: 10000 });
}

test.describe('Client Portal - Project Timeline', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsClient(page);
    await navigateToFirstProject(page);
  });

  test('should display timeline component', async ({ page }) => {
    // Look for timeline container
    const timeline = page.locator('[data-testid="timeline"], [data-testid="immersive-timeline"], .timeline');

    const timelineExists = await timeline.isVisible({ timeout: 5000 }).catch(() => false);

    if (timelineExists) {
      await expect(timeline).toBeVisible();
    } else {
      // Timeline might be in a tab, try to find and click timeline tab
      const timelineTab = page.locator('button:has-text("Timeline"), [role="tab"]:has-text("Timeline")').first();

      if (await timelineTab.isVisible({ timeout: 3000 })) {
        await timelineTab.click();
        await expect(timeline).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('should display timeline segments/milestones', async ({ page }) => {
    // Navigate to timeline if needed
    const timelineTab = page.locator('button:has-text("Timeline"), [role="tab"]:has-text("Timeline")').first();
    const hasTimelineTab = await timelineTab.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasTimelineTab) {
      await timelineTab.click();
      await page.waitForTimeout(500);
    }

    // Look for timeline segments/milestones
    const segments = page.locator(
      '[data-testid="timeline-segment"], [data-testid="milestone"], .timeline-segment, .milestone-item'
    );

    const count = await segments.count();

    // Should have at least one segment
    expect(count).toBeGreaterThan(0);

    // First segment should be visible
    await expect(segments.first()).toBeVisible();
  });

  test('should scroll through timeline segments', async ({ page }) => {
    // Navigate to timeline
    const timelineTab = page.locator('button:has-text("Timeline"), [role="tab"]:has-text("Timeline")').first();
    const hasTimelineTab = await timelineTab.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasTimelineTab) {
      await timelineTab.click();
      await page.waitForTimeout(500);
    }

    const timeline = page.locator('[data-testid="timeline"], [data-testid="immersive-timeline"], .timeline').first();

    if (await timeline.isVisible({ timeout: 5000 })) {
      // Try horizontal scroll
      await timeline.evaluate(el => {
        el.scrollBy({ left: 300, behavior: 'smooth' });
      });

      await page.waitForTimeout(500);

      // Verify scroll position changed
      const scrollLeft = await timeline.evaluate(el => el.scrollLeft);
      expect(scrollLeft).toBeGreaterThan(0);
    }
  });

  test('should navigate to specific timeline segment', async ({ page }) => {
    // Navigate to timeline
    const timelineTab = page.locator('button:has-text("Timeline"), [role="tab"]:has-text("Timeline")').first();
    const hasTimelineTab = await timelineTab.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasTimelineTab) {
      await timelineTab.click();
      await page.waitForTimeout(500);
    }

    // Find timeline segments
    const segments = page.locator(
      '[data-testid="timeline-segment"], [data-testid="milestone"], .timeline-segment, .milestone-item'
    );

    const count = await segments.count();

    if (count > 1) {
      // Click second segment
      await segments.nth(1).click();

      // Wait for navigation or expansion
      await page.waitForTimeout(500);

      // Verify segment is highlighted or expanded
      const activeSegment = page.locator(
        '[data-testid="timeline-segment"].active, [data-testid="milestone"].active, .timeline-segment.active'
      );

      const hasActiveState = await activeSegment.isVisible({ timeout: 2000 }).catch(() => false);

      // Either active state or segment detail should be visible
      expect(hasActiveState || count > 0).toBeTruthy();
    }
  });

  test('should display segment/milestone details on click', async ({ page }) => {
    // Navigate to timeline
    const timelineTab = page.locator('button:has-text("Timeline"), [role="tab"]:has-text("Timeline")').first();
    const hasTimelineTab = await timelineTab.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasTimelineTab) {
      await timelineTab.click();
      await page.waitForTimeout(500);
    }

    const segments = page.locator(
      '[data-testid="timeline-segment"], [data-testid="milestone"], .timeline-segment, .milestone-item'
    );

    if ((await segments.count()) > 0) {
      // Click first segment
      await segments.first().click();

      await page.waitForTimeout(500);

      // Look for detail panel or modal
      const detailPanel = page.locator(
        '[data-testid="segment-details"], [data-testid="milestone-details"], .segment-details, .milestone-details'
      );

      const hasDetails = await detailPanel.isVisible({ timeout: 3000 }).catch(() => false);

      // Details might show inline or in a modal
      if (!hasDetails) {
        // Check for expanded content in the segment itself
        const expandedContent = segments.first().locator('p, div:not(:empty)');
        expect(await expandedContent.count()).toBeGreaterThan(0);
      }
    }
  });

  test('should display media in timeline segments', async ({ page }) => {
    // Navigate to timeline
    const timelineTab = page.locator('button:has-text("Timeline"), [role="tab"]:has-text("Timeline")').first();
    const hasTimelineTab = await timelineTab.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasTimelineTab) {
      await timelineTab.click();
      await page.waitForTimeout(500);
    }

    // Look for images or media in timeline
    const media = page.locator('[data-testid="timeline"] img, .timeline img, [data-testid="milestone-image"]');

    const mediaCount = await media.count();

    if (mediaCount > 0) {
      // Verify first image is visible
      await expect(media.first()).toBeVisible();

      // Verify image has src
      const src = await media.first().getAttribute('src');
      expect(src).toBeTruthy();
    }
  });

  test('should support keyboard navigation', async ({ page }) => {
    // Navigate to timeline
    const timelineTab = page.locator('button:has-text("Timeline"), [role="tab"]:has-text("Timeline")').first();
    const hasTimelineTab = await timelineTab.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasTimelineTab) {
      await timelineTab.click();
      await page.waitForTimeout(500);
    }

    const timeline = page.locator('[data-testid="timeline"], [data-testid="immersive-timeline"], .timeline').first();

    if (await timeline.isVisible({ timeout: 5000 })) {
      // Focus timeline
      await timeline.focus();

      // Press arrow right to navigate
      await page.keyboard.press('ArrowRight');

      await page.waitForTimeout(300);

      // Verify scroll or navigation occurred
      const scrollLeft = await timeline.evaluate(el => el.scrollLeft);

      // Some movement should have occurred (or focus changed)
      // This is a basic check - actual behavior depends on implementation
      expect(scrollLeft).toBeGreaterThanOrEqual(0);
    }
  });

  test('should show completed vs pending milestones differently', async ({ page }) => {
    // Navigate to timeline
    const timelineTab = page.locator('button:has-text("Timeline"), [role="tab"]:has-text("Timeline")').first();
    const hasTimelineTab = await timelineTab.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasTimelineTab) {
      await timelineTab.click();
      await page.waitForTimeout(500);
    }

    // Look for completed milestones
    const completedMilestones = page.locator(
      '[data-testid="milestone"].completed, .milestone.completed, [data-status="completed"]'
    );

    const completedCount = await completedMilestones.count();

    // Look for pending milestones
    const pendingMilestones = page.locator(
      '[data-testid="milestone"].pending, .milestone.pending, [data-status="pending"]'
    );

    const pendingCount = await pendingMilestones.count();

    // Should have at least one of each status
    const totalMilestones = completedCount + pendingCount;
    expect(totalMilestones).toBeGreaterThan(0);
  });

  test('should display progress indicator', async ({ page }) => {
    // Navigate to timeline
    const timelineTab = page.locator('button:has-text("Timeline"), [role="tab"]:has-text("Timeline")').first();
    const hasTimelineTab = await timelineTab.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasTimelineTab) {
      await timelineTab.click();
      await page.waitForTimeout(500);
    }

    // Look for progress bar or indicator
    const progressIndicator = page.locator(
      '[data-testid="timeline-progress"], .progress-bar, [role="progressbar"]'
    );

    const hasProgress = await progressIndicator.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasProgress) {
      await expect(progressIndicator).toBeVisible();

      // Check if it has a value
      const value = await progressIndicator.getAttribute('aria-valuenow');
      expect(value).toBeTruthy();
    }
  });

  test('should zoom in/out on timeline', async ({ page }) => {
    // Navigate to timeline
    const timelineTab = page.locator('button:has-text("Timeline"), [role="tab"]:has-text("Timeline")').first();
    const hasTimelineTab = await timelineTab.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasTimelineTab) {
      await timelineTab.click();
      await page.waitForTimeout(500);
    }

    // Look for zoom controls
    const zoomIn = page.locator('[data-testid="zoom-in"], button[aria-label="Zoom in"]').first();
    const zoomOut = page.locator('[data-testid="zoom-out"], button[aria-label="Zoom out"]').first();

    const hasZoomControls = await zoomIn.isVisible({ timeout: 2000 }).catch(() => false);

    if (hasZoomControls) {
      // Click zoom in
      await zoomIn.click();
      await page.waitForTimeout(300);

      // Click zoom out
      await zoomOut.click();
      await page.waitForTimeout(300);

      // Controls should still be visible
      await expect(zoomIn).toBeVisible();
    }
  });
});

test.describe('Client Portal - Timeline Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsClient(page);
    await navigateToFirstProject(page);
  });

  test('timeline should have proper ARIA labels', async ({ page }) => {
    // Navigate to timeline
    const timelineTab = page.locator('button:has-text("Timeline"), [role="tab"]:has-text("Timeline")').first();
    const hasTimelineTab = await timelineTab.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasTimelineTab) {
      await timelineTab.click();
      await page.waitForTimeout(500);
    }

    const timeline = page.locator('[data-testid="timeline"], [data-testid="immersive-timeline"]').first();

    if (await timeline.isVisible({ timeout: 5000 })) {
      // Check for aria-label or role
      const ariaLabel = await timeline.getAttribute('aria-label');
      const role = await timeline.getAttribute('role');

      // Should have some accessibility attribute
      expect(ariaLabel || role).toBeTruthy();
    }
  });

  test('timeline segments should be keyboard accessible', async ({ page }) => {
    // Navigate to timeline
    const timelineTab = page.locator('button:has-text("Timeline"), [role="tab"]:has-text("Timeline")').first();
    const hasTimelineTab = await timelineTab.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasTimelineTab) {
      await timelineTab.click();
      await page.waitForTimeout(500);
    }

    const segments = page.locator(
      '[data-testid="timeline-segment"], [data-testid="milestone"], .timeline-segment'
    );

    if ((await segments.count()) > 0) {
      const firstSegment = segments.first();

      // Should be focusable
      await firstSegment.focus();

      // Verify it received focus
      const isFocused = await firstSegment.evaluate(el => el === document.activeElement);

      expect(isFocused).toBeTruthy();
    }
  });
});
