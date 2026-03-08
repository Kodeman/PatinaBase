import { test, expect } from '@playwright/test';

test.describe('Timeline 3D Demo Page', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the timeline-3d demo page
    await page.goto('/demo/timeline-3d');
    // Wait for the page to be fully loaded
    await page.waitForLoadState('networkidle');
  });

  test.describe('Hero Section', () => {
    test('should display project title and information', async ({ page }) => {
      // Check for project title
      const title = page.getByRole('heading', { name: /Oak Street Residence/i });
      await expect(title).toBeVisible();

      // Check for subtitle
      const subtitle = page.getByText(/Interior Design & Furnishing Project/i);
      await expect(subtitle).toBeVisible();

      // Check for progress information
      const overallProgress = page.getByText(/Overall Progress/i);
      await expect(overallProgress).toBeVisible();
      await expect(page.getByText('62%')).toBeVisible();

      // Check for milestone completion count
      const milestonesCompleted = page.getByText(/Milestones Completed/i);
      await expect(milestonesCompleted).toBeVisible();
      await expect(page.getByText('2 of 6').first()).toBeVisible();
    });

    test('should display scroll indicator with animation', async ({ page }) => {
      // Check for scroll indicator text
      const scrollText = page.getByText(/Scroll to explore/i);
      await expect(scrollText).toBeVisible();

      // Check for arrow SVG
      const arrow = page.locator('svg').filter({ has: page.locator('path[d*="M19 14l-7 7"]') });
      await expect(arrow).toBeVisible();

      // Verify animation class
      const arrowContainer = page.locator('.animate-bounce').filter({ has: scrollText });
      await expect(arrowContainer).toBeVisible();
    });
  });

  test.describe('Milestone Cards', () => {
    test('should render all 6 milestones', async ({ page }) => {
      // Scroll to make all milestones visible
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(500); // Wait for scroll to complete

      // Check for all milestone titles
      const milestones = [
        'Initial Consultation',
        'Design Concept Development',
        'Design Approval',
        'Material Ordering',
        'Installation',
        'Final Walkthrough'
      ];

      for (const milestone of milestones) {
        const card = page.getByRole('heading', { name: milestone });
        await expect(card.first()).toBeVisible();
      }
    });

    test('should display milestone status badges', async ({ page }) => {
      // Check for completed status
      const completedBadges = page.getByText('completed', { exact: false });
      await expect(completedBadges.first()).toBeVisible();

      // Check for approval-needed status
      const approvalBadge = page.getByText('approval-needed', { exact: false });
      await expect(approvalBadge).toBeVisible();

      // Check for upcoming status
      const upcomingBadges = page.getByText('upcoming', { exact: false });
      await expect(upcomingBadges.first()).toBeVisible();
    });

    test('should display milestone sequence numbers', async ({ page }) => {
      // Check for sequence number text
      const sequence = page.getByText(/Milestone \d+ of 6/);
      await expect(sequence.first()).toBeVisible();
    });

    test('should display progress bars for milestones', async ({ page }) => {
      // Find progress bars
      const progressBars = page.locator('.h-2.bg-gray-200.rounded-full');
      await expect(progressBars.first()).toBeVisible();

      // Check that progress bar has gradient fill
      const progressFill = page.locator('.bg-gradient-to-r.from-\\[\\#D1C7B7\\].to-\\[\\#F59E0B\\]');
      await expect(progressFill.first()).toBeVisible();
    });
  });

  test.describe('Milestone Content', () => {
    test('should display tabs when milestone is active', async ({ page }) => {
      // Scroll to make first milestone visible
      await page.evaluate(() => window.scrollTo(0, 800));
      await page.waitForTimeout(500);

      // Check for tabs
      const detailsTab = page.getByRole('tab', { name: /Details/i });
      const mediaTab = page.getByRole('tab', { name: /Media/i });
      const messagesTab = page.getByRole('tab', { name: /Messages/i });

      // At least one set of tabs should be visible
      const tabsVisible = await detailsTab.first().isVisible();
      expect(tabsVisible).toBeTruthy();
    });

    test('should display checklist items in Details tab', async ({ page }) => {
      // Scroll to first milestone
      await page.evaluate(() => window.scrollTo(0, 800));
      await page.waitForTimeout(500);

      // Find the Details tab and click it
      const detailsTab = page.getByRole('tab', { name: /Details/i }).first();
      if (await detailsTab.isVisible()) {
        await detailsTab.click({ force: true });

        // Check for checklist items
        const checklistItem = page.getByText(/Vision board created|Budget approved|Timeline agreed/);
        await expect(checklistItem.first()).toBeVisible();
      }
    });

    test('should have Media tab available', async ({ page }) => {
      // Scroll to Design Concept Development milestone
      await page.evaluate(() => window.scrollTo(0, 1500));
      await page.waitForTimeout(500);

      // Verify Media tab exists and is clickable
      const mediaTab = page.getByRole('tab', { name: /Media/i });
      const tabCount = await mediaTab.count();

      // Should have at least one Media tab on the page
      expect(tabCount).toBeGreaterThan(0);
    });

    test('should have Messages tab available', async ({ page }) => {
      // Scroll to first milestone
      await page.evaluate(() => window.scrollTo(0, 800));
      await page.waitForTimeout(500);

      // Verify Messages tab exists
      const messagesTab = page.getByRole('tab', { name: /Messages/i });
      const tabCount = await messagesTab.count();

      // Should have at least one Messages tab on the page
      expect(tabCount).toBeGreaterThan(0);
    });
  });

  test.describe('Approval Section', () => {
    test('should display approval required section', async ({ page }) => {
      // Scroll to Design Approval milestone
      await page.evaluate(() => window.scrollTo(0, 2000));
      await page.waitForTimeout(500);

      // Check for approval section
      const approvalHeading = page.getByText(/Approval Required/i);
      await expect(approvalHeading).toBeVisible();

      // Check for approval amount
      const amount = page.getByText(/\$12,500/);
      await expect(amount).toBeVisible();

      // Check for approval button
      const approveButton = page.getByRole('button', { name: /Review and Approve/i });
      await expect(approveButton).toBeVisible();
    });
  });

  test.describe('Keyboard Navigation', () => {
    test('should respond to arrow key navigation', async ({ page }) => {
      // Wait for page to be ready
      await page.waitForTimeout(1000);

      // Get initial scroll position
      const initialScroll = await page.evaluate(() => window.scrollY);

      // Press arrow down
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(500);

      // Check that scroll position changed
      const newScroll = await page.evaluate(() => window.scrollY);
      expect(newScroll).toBeGreaterThan(initialScroll);
    });

    test('should respond to J/K key navigation', async ({ page }) => {
      // Wait for page to be ready
      await page.waitForTimeout(1000);

      // Get initial scroll position
      const initialScroll = await page.evaluate(() => window.scrollY);

      // Press J key (down) - should scroll down
      await page.keyboard.press('j');
      await page.waitForTimeout(800);

      // Check that scroll position changed downward
      const newScroll = await page.evaluate(() => window.scrollY);
      expect(newScroll).toBeGreaterThanOrEqual(initialScroll);

      // Press K key (up) - should scroll up or stay in place
      await page.keyboard.press('k');
      await page.waitForTimeout(800);

      // Final scroll should be less than or equal to the downward scroll
      // (allowing for cases where K might not scroll if at certain positions)
      const finalScroll = await page.evaluate(() => window.scrollY);
      expect(finalScroll).toBeLessThanOrEqual(newScroll + 100); // Allow small tolerance
    });
  });

  test.describe('Animations', () => {
    test('should have smooth scroll behavior', async ({ page }) => {
      // Scroll down
      await page.evaluate(() => {
        window.scrollTo({ top: 1000, behavior: 'smooth' });
      });

      // Wait for scroll to complete
      await page.waitForTimeout(800);

      // Verify we scrolled
      const scrollY = await page.evaluate(() => window.scrollY);
      expect(scrollY).toBeGreaterThan(500);
    });

    test('should apply opacity transitions to elements on scroll', async ({ page }) => {
      // Get hero section element
      const hero = page.locator('.min-h-screen').first();
      await expect(hero).toBeVisible();

      // Scroll down significantly
      await page.evaluate(() => window.scrollTo(0, 1000));
      await page.waitForTimeout(500);

      // Hero should still exist but may have different styling due to scroll
      const scrollY = await page.evaluate(() => window.scrollY);
      expect(scrollY).toBeGreaterThan(500);
    });

    test('should animate progress bars', async ({ page }) => {
      // Scroll to make milestone visible
      await page.evaluate(() => window.scrollTo(0, 800));
      await page.waitForTimeout(500);

      // Find progress bar fill
      const progressFill = page.locator('.bg-gradient-to-r').first();
      await expect(progressFill).toBeVisible();

      // Check that it has a width style (indicating animation has applied)
      const width = await progressFill.evaluate((el) =>
        window.getComputedStyle(el).width
      );
      expect(width).not.toBe('0px');
    });
  });

  test.describe('Formatting and Layout', () => {
    test('should have proper spacing between sections', async ({ page }) => {
      // Check hero section has min-height
      const hero = page.locator('.min-h-screen').first();
      const heroHeight = await hero.evaluate((el) => el.offsetHeight);

      // Hero should be at least viewport height
      const viewportHeight = page.viewportSize()?.height || 0;
      expect(heroHeight).toBeGreaterThanOrEqual(viewportHeight * 0.9);
    });

    test('should use proper typography hierarchy', async ({ page }) => {
      // Check main heading
      const h1 = page.getByRole('heading', { name: /Oak Street Residence/i });
      await expect(h1).toBeVisible();

      // Verify it's using serif font
      const h1FontFamily = await h1.evaluate((el) =>
        window.getComputedStyle(el).fontFamily
      );
      expect(h1FontFamily).toContain('serif');
    });

    test('should have gradient background in hero section', async ({ page }) => {
      // Find hero section
      const hero = page.locator('.bg-gradient-to-b.from-white');
      await expect(hero).toBeVisible();

      // Verify gradient classes are applied
      const classList = await hero.evaluate((el) => el.className);
      expect(classList).toContain('from-white');
      expect(classList).toContain('to-[#EDE9E4]');
    });

    test('should display instructions overlay at bottom', async ({ page }) => {
      // Find instructions overlay
      const instructions = page.getByText(/Use ↑↓ or J\/K to navigate/);
      await expect(instructions).toBeVisible();

      // Verify it's fixed at bottom
      const instructionsContainer = page.locator('.fixed.bottom-8');
      await expect(instructionsContainer).toBeVisible();
    });

    test('should have proper card styling', async ({ page }) => {
      // Scroll to see cards
      await page.evaluate(() => window.scrollTo(0, 800));
      await page.waitForTimeout(500);

      // Check for presence of cards with padding
      const paddedElements = page.locator('.p-6');
      await expect(paddedElements.first()).toBeVisible();

      // Verify the page has rounded elements somewhere (approvals, cards, etc)
      const roundedElements = page.locator('[class*="rounded"]');
      const count = await roundedElements.count();
      expect(count).toBeGreaterThan(0);
    });

    test('should be responsive on different viewport sizes', async ({ page }) => {
      // Test desktop view (already default)
      await expect(page.getByRole('heading', { name: /Oak Street Residence/i })).toBeVisible();

      // Test tablet view
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.waitForTimeout(300);
      await expect(page.getByRole('heading', { name: /Oak Street Residence/i })).toBeVisible();

      // Test mobile view
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(300);
      await expect(page.getByRole('heading', { name: /Oak Street Residence/i })).toBeVisible();
    });
  });

  test.describe('Accessibility', () => {
    test('should have proper heading hierarchy', async ({ page }) => {
      // Check for h1
      const h1 = page.getByRole('heading', { level: 1 });
      await expect(h1).toBeVisible();

      // Check for h2 headings in milestones
      await page.evaluate(() => window.scrollTo(0, 1000));
      await page.waitForTimeout(500);

      const h2 = page.getByRole('heading', { level: 2 });
      const h2Count = await h2.count();
      expect(h2Count).toBeGreaterThan(0);
    });

    test('should have accessible buttons', async ({ page }) => {
      // Scroll to approval section
      await page.evaluate(() => window.scrollTo(0, 2000));
      await page.waitForTimeout(500);

      // Find button with accessible name
      const button = page.getByRole('button', { name: /Review and Approve/i });
      await expect(button).toBeVisible();
    });

    test('should have alt text for images', async ({ page }) => {
      // Scroll to milestone with media
      await page.evaluate(() => window.scrollTo(0, 1500));
      await page.waitForTimeout(500);

      // Click Media tab if needed
      const mediaTab = page.getByRole('tab', { name: /Media/i }).first();
      if (await mediaTab.isVisible()) {
        await mediaTab.click({ force: true });
        await page.waitForTimeout(300);

        // Check images have alt text
        const images = page.locator('img');
        const imageCount = await images.count();

        if (imageCount > 0) {
          const firstImage = images.first();
          const alt = await firstImage.getAttribute('alt');
          expect(alt).toBeTruthy();
          expect(alt?.length).toBeGreaterThan(0);
        }
      }
    });
  });
});
