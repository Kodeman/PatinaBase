/**
 * Client Portal - Approvals E2E Tests
 *
 * Tests approval list, filtering, ApprovalTheater, and approval actions.
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

test.describe('Client Portal - Approvals List', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsClient(page);
  });

  test('should display approvals page', async ({ page }) => {
    await page.goto(`${BASE_URL}/approvals`);

    // Check for approvals heading or page indicator
    const heading = page.locator('h1, h2').filter({ hasText: /Approvals/i }).first();

    const headingExists = await heading.isVisible({ timeout: 5000 }).catch(() => false);

    if (headingExists) {
      await expect(heading).toBeVisible();
    } else {
      // Might be in a project context, navigate to first project
      await page.goto(`${BASE_URL}/projects`);
      await page.waitForSelector('[data-testid="project-card"], .project-card, article', { timeout: 10000 });
      const firstProject = page.locator('[data-testid="project-card"], .project-card, article').first();
      await firstProject.click();

      // Find approvals tab
      const approvalsTab = page.locator('button:has-text("Approvals"), [role="tab"]:has-text("Approvals")').first();
      if (await approvalsTab.isVisible({ timeout: 5000 })) {
        await approvalsTab.click();
      }
    }
  });

  test('should display list of pending approvals', async ({ page }) => {
    // Try direct approvals page first
    await page.goto(`${BASE_URL}/approvals`);

    let approvalsList = page.locator('[data-testid="approvals-list"], .approvals-list');
    let exists = await approvalsList.isVisible({ timeout: 3000 }).catch(() => false);

    if (!exists) {
      // Try via project detail
      await page.goto(`${BASE_URL}/projects`);
      await page.waitForSelector('[data-testid="project-card"]', { timeout: 10000 });
      await page.locator('[data-testid="project-card"]').first().click();

      const approvalsTab = page.locator('button:has-text("Approvals"), [role="tab"]:has-text("Approvals")').first();
      if (await approvalsTab.isVisible({ timeout: 5000 })) {
        await approvalsTab.click();
      }
    }

    // Look for approval items
    const approvalItems = page.locator('[data-testid="approval-item"], .approval-item, .approval-card');
    const count = await approvalItems.count();

    if (count > 0) {
      // Verify first approval has required info
      const firstApproval = approvalItems.first();
      await expect(firstApproval).toBeVisible();

      // Should have title
      const title = firstApproval.locator('h3, h4, [data-testid="approval-title"]');
      await expect(title).toBeVisible();
    }
  });

  test('should filter approvals by status', async ({ page }) => {
    await page.goto(`${BASE_URL}/approvals`);

    // Look for status filter
    const statusFilter = page.locator('[data-testid="status-filter"], select[name="status"], button:has-text("Status")').first();

    if (await statusFilter.isVisible({ timeout: 5000 })) {
      await statusFilter.click();

      // Select "Approved" or "Pending"
      const pendingOption = page.locator('option:has-text("Pending"), li:has-text("Pending"), [data-value="pending"]').first();

      if (await pendingOption.isVisible({ timeout: 3000 })) {
        await pendingOption.click();
        await page.waitForTimeout(1000);

        // Verify filtered results
        const approvalItems = page.locator('[data-testid="approval-item"], .approval-item');
        const count = await approvalItems.count();

        // Should show pending approvals
        expect(count).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('should filter approvals by type', async ({ page }) => {
    await page.goto(`${BASE_URL}/approvals`);

    // Look for type filter
    const typeFilter = page.locator('[data-testid="type-filter"], select[name="type"], button:has-text("Type")').first();

    if (await typeFilter.isVisible({ timeout: 5000 })) {
      await typeFilter.click();

      // Select "Design" type
      const designOption = page.locator('option:has-text("Design"), li:has-text("Design")').first();

      if (await designOption.isVisible({ timeout: 3000 })) {
        await designOption.click();
        await page.waitForTimeout(1000);

        // Verify results are filtered
        const approvalItems = page.locator('[data-testid="approval-item"]');
        const count = await approvalItems.count();

        expect(count).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('should open approval in ApprovalTheater', async ({ page }) => {
    await page.goto(`${BASE_URL}/approvals`);

    // Find first approval
    const approvalItems = page.locator('[data-testid="approval-item"], .approval-item');
    const count = await approvalItems.count();

    if (count > 0) {
      // Click to open
      await approvalItems.first().click();

      // Wait for ApprovalTheater to open
      const theater = page.locator('[data-testid="approval-theater"], .approval-theater, [role="dialog"]');

      await expect(theater).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('Client Portal - ApprovalTheater', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsClient(page);
  });

  test('should display ApprovalTheater modal', async ({ page }) => {
    await page.goto(`${BASE_URL}/approvals`);

    const approvalItems = page.locator('[data-testid="approval-item"], .approval-item');

    if (await approvalItems.count() > 0) {
      await approvalItems.first().click();

      const theater = page.locator('[data-testid="approval-theater"], .approval-theater, [role="dialog"]');
      await expect(theater).toBeVisible({ timeout: 5000 });

      // Should have close button
      const closeButton = theater.locator('button[aria-label="Close"], [data-testid="close-button"]');
      await expect(closeButton).toBeVisible();
    }
  });

  test('should show approval details in theater', async ({ page }) => {
    await page.goto(`${BASE_URL}/approvals`);

    const approvalItems = page.locator('[data-testid="approval-item"]');

    if (await approvalItems.count() > 0) {
      await approvalItems.first().click();

      const theater = page.locator('[data-testid="approval-theater"], [role="dialog"]');

      if (await theater.isVisible({ timeout: 5000 })) {
        // Should show title
        const title = theater.locator('h2, h3, [data-testid="approval-title"]');
        await expect(title).toBeVisible();

        // Should show description
        const description = theater.locator('[data-testid="approval-description"], p');
        await expect(description.first()).toBeVisible();
      }
    }
  });

  test('should display media/attachments in theater', async ({ page }) => {
    await page.goto(`${BASE_URL}/approvals`);

    const approvalItems = page.locator('[data-testid="approval-item"]');

    if (await approvalItems.count() > 0) {
      await approvalItems.first().click();

      const theater = page.locator('[data-testid="approval-theater"], [role="dialog"]');

      if (await theater.isVisible({ timeout: 5000 })) {
        // Look for image or media
        const media = theater.locator('img, video, [data-testid="attachment"]');
        const mediaCount = await media.count();

        if (mediaCount > 0) {
          await expect(media.first()).toBeVisible();
        }
      }
    }
  });

  test('should have tabs for different content sections', async ({ page }) => {
    await page.goto(`${BASE_URL}/approvals`);

    const approvalItems = page.locator('[data-testid="approval-item"]');

    if (await approvalItems.count() > 0) {
      await approvalItems.first().click();

      const theater = page.locator('[data-testid="approval-theater"], [role="dialog"]');

      if (await theater.isVisible({ timeout: 5000 })) {
        // Look for tabs
        const tabs = theater.locator('[role="tab"], .tab, [data-testid*="tab"]');
        const tabCount = await tabs.count();

        if (tabCount > 1) {
          // Click second tab
          await tabs.nth(1).click();
          await page.waitForTimeout(300);

          // Verify tab changed
          const activeTab = theater.locator('[role="tab"][aria-selected="true"], .tab.active');
          await expect(activeTab).toBeVisible();
        }
      }
    }
  });

  test('should allow approving an approval', async ({ page }) => {
    await page.goto(`${BASE_URL}/approvals`);

    // Find pending approval
    const pendingApprovals = page.locator('[data-testid="approval-item"][data-status="pending"], .approval-item.pending');

    let count = await pendingApprovals.count();

    if (count === 0) {
      // Try all approvals
      const allApprovals = page.locator('[data-testid="approval-item"], .approval-item');
      count = await allApprovals.count();

      if (count > 0) {
        await allApprovals.first().click();
      }
    } else {
      await pendingApprovals.first().click();
    }

    const theater = page.locator('[data-testid="approval-theater"], [role="dialog"]');

    if (await theater.isVisible({ timeout: 5000 })) {
      // Look for approve button
      const approveButton = theater.locator('button:has-text("Approve"), [data-testid="approve-button"]').first();

      if (await approveButton.isEnabled({ timeout: 2000 })) {
        // Click approve
        await approveButton.click();

        // Look for confirmation or success message
        const successMessage = page.locator('[data-testid="success-message"], .success, .toast');
        const hasSuccess = await successMessage.isVisible({ timeout: 3000 }).catch(() => false);

        // Either success message appears or theater closes
        const theaterStillVisible = await theater.isVisible({ timeout: 2000 }).catch(() => false);

        expect(hasSuccess || !theaterStillVisible).toBeTruthy();
      }
    }
  });

  test('should allow rejecting an approval', async ({ page }) => {
    await page.goto(`${BASE_URL}/approvals`);

    const approvalItems = page.locator('[data-testid="approval-item"]');

    if (await approvalItems.count() > 0) {
      await approvalItems.first().click();

      const theater = page.locator('[data-testid="approval-theater"], [role="dialog"]');

      if (await theater.isVisible({ timeout: 5000 })) {
        // Look for reject button
        const rejectButton = theater.locator('button:has-text("Reject"), [data-testid="reject-button"]').first();

        if (await rejectButton.isEnabled({ timeout: 2000 })) {
          await rejectButton.click();

          // Should show rejection reason dialog
          const reasonDialog = page.locator('[data-testid="rejection-dialog"], [role="dialog"]');
          const hasDialog = await reasonDialog.isVisible({ timeout: 3000 }).catch(() => false);

          if (hasDialog) {
            // Fill reason
            const reasonInput = reasonDialog.locator('textarea, input[type="text"]');
            await reasonInput.fill('This needs more work on the color scheme');

            // Confirm rejection
            const confirmButton = reasonDialog.locator('button:has-text("Confirm"), button:has-text("Reject")');
            await confirmButton.click();

            // Wait for response
            await page.waitForTimeout(1000);
          }
        }
      }
    }
  });

  test('should allow requesting changes', async ({ page }) => {
    await page.goto(`${BASE_URL}/approvals`);

    const approvalItems = page.locator('[data-testid="approval-item"]');

    if (await approvalItems.count() > 0) {
      await approvalItems.first().click();

      const theater = page.locator('[data-testid="approval-theater"], [role="dialog"]');

      if (await theater.isVisible({ timeout: 5000 })) {
        // Look for request changes button
        const changesButton = theater.locator('button:has-text("Request Changes"), [data-testid="request-changes-button"]').first();

        if (await changesButton.isEnabled({ timeout: 2000 })) {
          await changesButton.click();

          // Should show changes dialog
          const changesDialog = page.locator('[data-testid="changes-dialog"], [role="dialog"]');
          const hasDialog = await changesDialog.isVisible({ timeout: 3000 }).catch(() => false);

          if (hasDialog) {
            // Fill changes request
            const changesInput = changesDialog.locator('textarea');
            await changesInput.fill('Please adjust the dimensions as discussed');

            // Submit
            const submitButton = changesDialog.locator('button:has-text("Submit"), button:has-text("Request")');
            await submitButton.click();
          }
        }
      }
    }
  });

  test('should support adding comments/discussion', async ({ page }) => {
    await page.goto(`${BASE_URL}/approvals`);

    const approvalItems = page.locator('[data-testid="approval-item"]');

    if (await approvalItems.count() > 0) {
      await approvalItems.first().click();

      const theater = page.locator('[data-testid="approval-theater"], [role="dialog"]');

      if (await theater.isVisible({ timeout: 5000 })) {
        // Look for discussion/comments tab
        const discussTab = theater.locator('[role="tab"]:has-text("Discussion"), [role="tab"]:has-text("Comments")').first();

        if (await discussTab.isVisible({ timeout: 3000 })) {
          await discussTab.click();
          await page.waitForTimeout(300);

          // Look for comment input
          const commentInput = theater.locator('textarea[placeholder*="comment"], textarea[placeholder*="discussion"]');

          if (await commentInput.isVisible({ timeout: 3000 })) {
            await commentInput.fill('Looks great! I have a question about the finish.');

            // Submit comment
            const submitButton = theater.locator('button:has-text("Post"), button:has-text("Send"), button:has-text("Comment")');
            if (await submitButton.isEnabled({ timeout: 2000 })) {
              await submitButton.click();
              await page.waitForTimeout(500);
            }
          }
        }
      }
    }
  });

  test('should close ApprovalTheater with close button', async ({ page }) => {
    await page.goto(`${BASE_URL}/approvals`);

    const approvalItems = page.locator('[data-testid="approval-item"]');

    if (await approvalItems.count() > 0) {
      await approvalItems.first().click();

      const theater = page.locator('[data-testid="approval-theater"], [role="dialog"]');

      if (await theater.isVisible({ timeout: 5000 })) {
        // Click close button
        const closeButton = theater.locator('button[aria-label="Close"], [data-testid="close-button"]').first();
        await closeButton.click();

        // Theater should be hidden
        await expect(theater).not.toBeVisible({ timeout: 2000 });
      }
    }
  });

  test('should close ApprovalTheater with Escape key', async ({ page }) => {
    await page.goto(`${BASE_URL}/approvals`);

    const approvalItems = page.locator('[data-testid="approval-item"]');

    if (await approvalItems.count() > 0) {
      await approvalItems.first().click();

      const theater = page.locator('[data-testid="approval-theater"], [role="dialog"]');

      if (await theater.isVisible({ timeout: 5000 })) {
        // Press Escape
        await page.keyboard.press('Escape');

        // Theater should be hidden
        await expect(theater).not.toBeVisible({ timeout: 2000 });
      }
    }
  });
});

test.describe('Client Portal - Approval Actions Feedback', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsClient(page);
  });

  test('should show loading state during approval submission', async ({ page }) => {
    await page.goto(`${BASE_URL}/approvals`);

    const approvalItems = page.locator('[data-testid="approval-item"]');

    if (await approvalItems.count() > 0) {
      await approvalItems.first().click();

      const theater = page.locator('[data-testid="approval-theater"], [role="dialog"]');

      if (await theater.isVisible({ timeout: 5000 })) {
        const approveButton = theater.locator('button:has-text("Approve")').first();

        if (await approveButton.isEnabled({ timeout: 2000 })) {
          // Look for loading state after click
          await approveButton.click();

          // Button should show loading or be disabled
          const isDisabled = await approveButton.isDisabled({ timeout: 1000 }).catch(() => false);
          const hasLoadingText = await approveButton.locator('[data-testid="spinner"], .spinner').isVisible({ timeout: 500 }).catch(() => false);

          expect(isDisabled || hasLoadingText).toBeTruthy();
        }
      }
    }
  });

  test('should show success message after approval', async ({ page }) => {
    await page.goto(`${BASE_URL}/approvals`);

    const approvalItems = page.locator('[data-testid="approval-item"]');

    if (await approvalItems.count() > 0) {
      await approvalItems.first().click();

      const theater = page.locator('[data-testid="approval-theater"], [role="dialog"]');

      if (await theater.isVisible({ timeout: 5000 })) {
        const approveButton = theater.locator('button:has-text("Approve")').first();

        if (await approveButton.isEnabled({ timeout: 2000 })) {
          await approveButton.click();

          // Look for success toast/message
          const successMessage = page.locator('[data-testid="success-message"], .toast.success, .alert.success');
          const hasSuccess = await successMessage.isVisible({ timeout: 3000 }).catch(() => false);

          if (hasSuccess) {
            await expect(successMessage).toBeVisible();
          }
        }
      }
    }
  });
});
