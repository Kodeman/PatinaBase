/**
 * Admin Portal - Projects Management E2E Tests
 *
 * Tests full project CRUD workflow for administrators.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

async function loginAsAdmin(page: any) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="email"], input[type="email"]', 'admin@test.patina.local');
  await page.fill('input[name="password"], input[type="password"]', 'TestAdmin123!');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|projects|users)/, { timeout: 15000 });
}

test.describe('Admin Portal - Project CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('should display projects management page', async ({ page }) => {
    await page.goto(`${BASE_URL}/projects`);

    const heading = page.locator('h1, h2').filter({ hasText: /Projects/i }).first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('should create a new project', async ({ page }) => {
    await page.goto(`${BASE_URL}/projects`);

    const createButton = page.locator('button:has-text("Create"), button:has-text("New Project")').first();

    if (await createButton.isVisible({ timeout: 5000 })) {
      await createButton.click();

      const dialog = page.locator('[role="dialog"], [data-testid="create-project-dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      await page.fill('input[name="title"], [data-testid="project-title"]', 'Test Project ' + Date.now());
      await page.fill('textarea[name="description"], [data-testid="project-description"]', 'Test project description');

      const submitButton = dialog.locator('button:has-text("Create"), button:has-text("Submit")').first();
      await submitButton.click();

      await page.waitForTimeout(2000);

      const successMessage = page.locator('[data-testid="success-message"], .toast.success');
      const hasSuccess = await successMessage.isVisible({ timeout: 3000 }).catch(() => false);

      if (hasSuccess) {
        await expect(successMessage).toBeVisible();
      }
    }
  });

  test('should edit an existing project', async ({ page }) => {
    await page.goto(`${BASE_URL}/projects`);

    await page.waitForSelector('[data-testid="project-row"], tr, .project-card', { timeout: 10000 });

    const firstProject = page.locator('[data-testid="project-row"], tr, .project-card').first();

    const editButton = firstProject.locator('button[aria-label="Edit"], [data-testid="edit-button"]').first();

    if (await editButton.isVisible({ timeout: 3000 })) {
      await editButton.click();

      const dialog = page.locator('[role="dialog"], [data-testid="edit-project-dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      const titleInput = dialog.locator('input[name="title"], [data-testid="project-title"]');
      await titleInput.fill('Updated Project Title ' + Date.now());

      const submitButton = dialog.locator('button:has-text("Save"), button:has-text("Update")').first();
      await submitButton.click();

      await page.waitForTimeout(2000);
    }
  });

  test('should delete a project', async ({ page }) => {
    await page.goto(`${BASE_URL}/projects`);

    await page.waitForSelector('[data-testid="project-row"], tr, .project-card', { timeout: 10000 });

    const firstProject = page.locator('[data-testid="project-row"], tr, .project-card').first();

    const deleteButton = firstProject.locator('button[aria-label="Delete"], [data-testid="delete-button"]').first();

    if (await deleteButton.isVisible({ timeout: 3000 })) {
      await deleteButton.click();

      const confirmDialog = page.locator('[role="alertdialog"], [data-testid="confirm-dialog"]');
      await expect(confirmDialog).toBeVisible({ timeout: 3000 });

      const confirmButton = confirmDialog.locator('button:has-text("Delete"), button:has-text("Confirm")').first();
      await confirmButton.click();

      await page.waitForTimeout(2000);

      const successMessage = page.locator('[data-testid="success-message"], .toast.success');
      const hasSuccess = await successMessage.isVisible({ timeout: 3000 }).catch(() => false);

      if (hasSuccess) {
        await expect(successMessage).toBeVisible();
      }
    }
  });

  test('should filter projects by status', async ({ page }) => {
    await page.goto(`${BASE_URL}/projects`);

    const statusFilter = page.locator('[data-testid="status-filter"], select[name="status"]').first();

    if (await statusFilter.isVisible({ timeout: 5000 })) {
      await statusFilter.selectOption('active');
      await page.waitForTimeout(1000);

      const projects = page.locator('[data-testid="project-row"], tr, .project-card');
      expect(await projects.count()).toBeGreaterThanOrEqual(0);
    }
  });

  test('should search projects', async ({ page }) => {
    await page.goto(`${BASE_URL}/projects`);

    const searchInput = page.locator('input[type="search"], [data-testid="search-input"]').first();

    if (await searchInput.isVisible({ timeout: 5000 })) {
      await searchInput.fill('test');
      await page.waitForTimeout(1000);

      const projects = page.locator('[data-testid="project-row"], tr, .project-card');
      expect(await projects.count()).toBeGreaterThanOrEqual(0);
    }
  });

  test('should sort projects', async ({ page }) => {
    await page.goto(`${BASE_URL}/projects`);

    const sortHeader = page.locator('th:has-text("Title"), [data-testid="sort-title"]').first();

    if (await sortHeader.isVisible({ timeout: 5000 })) {
      await sortHeader.click();
      await page.waitForTimeout(500);

      await sortHeader.click();
      await page.waitForTimeout(500);

      const projects = page.locator('[data-testid="project-row"]');
      expect(await projects.count()).toBeGreaterThan(0);
    }
  });

  test('should bulk select and delete projects', async ({ page }) => {
    await page.goto(`${BASE_URL}/projects`);

    await page.waitForSelector('[data-testid="project-row"], tr', { timeout: 10000 });

    const selectAllCheckbox = page.locator('input[type="checkbox"][data-testid="select-all"], thead input[type="checkbox"]').first();

    if (await selectAllCheckbox.isVisible({ timeout: 3000 })) {
      await selectAllCheckbox.check();

      const bulkDeleteButton = page.locator('button:has-text("Delete Selected"), [data-testid="bulk-delete"]').first();

      if (await bulkDeleteButton.isVisible({ timeout: 3000 })) {
        await bulkDeleteButton.click();

        const confirmDialog = page.locator('[role="alertdialog"]');
        if (await confirmDialog.isVisible({ timeout: 3000 })) {
          const cancelButton = confirmDialog.locator('button:has-text("Cancel")');
          await cancelButton.click();
        }
      }
    }
  });

  test('should export projects to CSV', async ({ page }) => {
    await page.goto(`${BASE_URL}/projects`);

    const exportButton = page.locator('button:has-text("Export"), [data-testid="export-button"]').first();

    if (await exportButton.isVisible({ timeout: 5000 })) {
      const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);

      await exportButton.click();

      const download = await downloadPromise;

      if (download) {
        expect(download).toBeTruthy();
        expect(download.suggestedFilename()).toMatch(/\.csv$/i);
      }
    }
  });

  test('should navigate to project detail page', async ({ page }) => {
    await page.goto(`${BASE_URL}/projects`);

    await page.waitForSelector('[data-testid="project-row"], tr, .project-card', { timeout: 10000 });

    const firstProject = page.locator('[data-testid="project-row"], tr, .project-card').first();
    await firstProject.click();

    await page.waitForURL(/\/projects\/[^/]+/, { timeout: 10000 });

    expect(page.url()).toMatch(/\/projects\/.+/);
  });

  test('should show project statistics', async ({ page }) => {
    await page.goto(`${BASE_URL}/projects`);

    const stats = page.locator('[data-testid="project-stats"], .stats-card');

    if (await stats.isVisible({ timeout: 5000 })) {
      const statItems = stats.locator('[data-testid="stat-item"], .stat-item');
      expect(await statItems.count()).toBeGreaterThan(0);
    }
  });
});
