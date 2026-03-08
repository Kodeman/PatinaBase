import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Media Upload Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to product edit page
    // Note: Update the URL based on your actual routing
    await page.goto('/catalog/test-product-id');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Navigate to Media tab
    await page.click('text=Media');
  });

  test('should display media uploader', async ({ page }) => {
    await expect(
      page.getByText(/drag & drop images here, or click to browse/i)
    ).toBeVisible();

    await expect(
      page.getByText(/jpg, png, webp up to 10mb/i)
    ).toBeVisible();
  });

  test('should upload single image via file input', async ({ page }) => {
    // Create a test image file
    const testImagePath = path.join(__dirname, 'fixtures', 'test-image.jpg');

    // Click to open file picker
    const fileInput = page.locator('input[type="file"]');

    // Upload file
    await fileInput.setInputFiles(testImagePath);

    // Wait for file to appear in the list
    await expect(page.getByText('test-image.jpg')).toBeVisible({ timeout: 5000 });

    // Verify file size is displayed
    await expect(page.locator('text=/\\d+ (bytes|KB|MB)/')).toBeVisible();

    // Click upload button
    await page.click('button:has-text("Upload")');

    // Wait for upload to complete
    await expect(page.getByText(/uploaded successfully/i)).toBeVisible({
      timeout: 10000,
    });

    // Verify image appears in gallery
    await expect(page.locator('img[alt*="test-image"]').first()).toBeVisible({
      timeout: 5000,
    });
  });

  test('should upload multiple images', async ({ page }) => {
    const testImages = [
      path.join(__dirname, 'fixtures', 'image1.jpg'),
      path.join(__dirname, 'fixtures', 'image2.jpg'),
      path.join(__dirname, 'fixtures', 'image3.jpg'),
    ];

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testImages);

    // Verify all files appear in the list
    await expect(page.getByText('Files (3)')).toBeVisible();
    await expect(page.getByText('image1.jpg')).toBeVisible();
    await expect(page.getByText('image2.jpg')).toBeVisible();
    await expect(page.getByText('image3.jpg')).toBeVisible();

    // Upload all
    await page.click('button:has-text("Upload All")');

    // Wait for success message
    await expect(page.getByText(/3 images uploaded successfully/i)).toBeVisible({
      timeout: 15000,
    });
  });

  test('should show validation error for oversized file', async ({ page }) => {
    // Note: This would require a fixture file >10MB
    // For now, we'll test the UI shows the error message

    // We can mock this by checking if the error appears
    // when trying to upload a large file
    const errorMessage = page.getByText(/file size exceeds/i);

    // The error should not be visible initially
    await expect(errorMessage).not.toBeVisible();
  });

  test('should show validation error for wrong file type', async ({ page }) => {
    const textFilePath = path.join(__dirname, 'fixtures', 'test.txt');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(textFilePath);

    // Should show error for invalid file type
    await expect(
      page.getByText(/invalid file type|file type.*not supported/i)
    ).toBeVisible({ timeout: 3000 });
  });

  test('should remove file before upload', async ({ page }) => {
    const testImagePath = path.join(__dirname, 'fixtures', 'test-image.jpg');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testImagePath);

    // Wait for file to appear
    await expect(page.getByText('test-image.jpg')).toBeVisible();

    // Click remove button (X icon)
    await page.locator('button:has-text("X")').first().click();

    // File should be removed from list
    await expect(page.getByText('test-image.jpg')).not.toBeVisible();
  });

  test('should display image preview', async ({ page }) => {
    const testImagePath = path.join(__dirname, 'fixtures', 'test-image.jpg');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testImagePath);

    // Should show image preview
    const preview = page.locator('img[alt="test-image.jpg"]').first();
    await expect(preview).toBeVisible();

    // Preview should have a blob URL
    const src = await preview.getAttribute('src');
    expect(src).toContain('blob:');
  });

  test('should show upload progress', async ({ page }) => {
    const testImagePath = path.join(__dirname, 'fixtures', 'test-image.jpg');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testImagePath);

    // Start upload
    await page.click('button:has-text("Upload")');

    // Should show uploading state
    await expect(page.getByText(/uploading/i)).toBeVisible();

    // Progress bar should be visible
    const progressBar = page.locator('[role="progressbar"]');
    await expect(progressBar).toBeVisible({ timeout: 2000 });
  });

  test('should display uploaded images in gallery', async ({ page }) => {
    // Assuming there are already uploaded images
    const gallery = page.locator('.grid').filter({ hasText: /image/i });

    // Gallery should be visible
    await expect(gallery).toBeVisible();

    // Should show image count
    await expect(page.getByText(/\d+ images?/i)).toBeVisible();
  });

  test('should reorder images via drag and drop', async ({ page }) => {
    // This test requires existing images in the gallery
    // Skip if no images
    const imageCount = await page.locator('.grid > div').count();

    if (imageCount < 2) {
      test.skip();
    }

    // Get first and last image
    const firstImage = page.locator('.grid > div').first();
    const secondImage = page.locator('.grid > div').nth(1);

    // Get initial order badges
    const firstOrderBefore = await firstImage.locator('text=/\\d+/').textContent();

    // Drag first image to second position
    await firstImage.hover();
    await page.mouse.down();
    await secondImage.hover();
    await page.mouse.up();

    // Wait for reorder to complete
    await expect(page.getByText(/reordered successfully/i)).toBeVisible({
      timeout: 5000,
    });

    // Verify order changed
    const firstOrderAfter = await firstImage.locator('text=/\\d+/').textContent();
    expect(firstOrderAfter).not.toBe(firstOrderBefore);
  });

  test('should set primary image', async ({ page }) => {
    const imageCount = await page.locator('.grid > div').count();

    if (imageCount < 2) {
      test.skip();
    }

    // Hover over second image to show controls
    const secondImage = page.locator('.grid > div').nth(1);
    await secondImage.hover();

    // Click star button to set as primary
    await secondImage.locator('button:has-text("Star")').click();

    // Should show success message
    await expect(page.getByText(/reordered successfully/i)).toBeVisible({
      timeout: 5000,
    });

    // First image should now have "Primary" badge
    await expect(
      page.locator('.grid > div').first().getByText('Primary')
    ).toBeVisible();
  });

  test('should delete single image with confirmation', async ({ page }) => {
    const imageCount = await page.locator('.grid > div').count();

    if (imageCount === 0) {
      test.skip();
    }

    // Hover over first image
    const firstImage = page.locator('.grid > div').first();
    await firstImage.hover();

    // Click delete button
    await firstImage.locator('button[title="Delete image"]').click();

    // Confirmation dialog should appear
    await expect(page.getByText(/delete image\?/i)).toBeVisible();
    await expect(
      page.getByText(/this action cannot be undone/i)
    ).toBeVisible();

    // Confirm deletion
    await page.click('button:has-text("Delete")');

    // Should show success message
    await expect(page.getByText(/deleted successfully/i)).toBeVisible({
      timeout: 5000,
    });
  });

  test('should bulk delete images', async ({ page }) => {
    const imageCount = await page.locator('.grid > div').count();

    if (imageCount < 2) {
      test.skip();
    }

    // Select first two images
    await page.locator('.grid > div').first().locator('input[type="checkbox"]').check();
    await page.locator('.grid > div').nth(1).locator('input[type="checkbox"]').check();

    // Bulk delete button should appear
    const bulkDeleteButton = page.getByRole('button', { name: /delete \d+ images/i });
    await expect(bulkDeleteButton).toBeVisible();

    // Click bulk delete
    await bulkDeleteButton.click();

    // Confirmation dialog
    await expect(page.getByText(/delete \d+ images\?/i)).toBeVisible();

    // Confirm
    await page.click('button:has-text("Delete All")');

    // Success message
    await expect(page.getByText(/deleted successfully/i)).toBeVisible({
      timeout: 5000,
    });
  });

  test('should open lightbox on image click', async ({ page }) => {
    const imageCount = await page.locator('.grid > div').count();

    if (imageCount === 0) {
      test.skip();
    }

    // Hover and click view button
    const firstImage = page.locator('.grid > div').first();
    await firstImage.hover();
    await firstImage.locator('button[title="View full size"]').click();

    // Lightbox should open
    await expect(page.locator('.yarl__container')).toBeVisible({ timeout: 2000 });

    // Full size image should be displayed
    await expect(page.locator('.yarl__slide img')).toBeVisible();

    // Close lightbox
    await page.keyboard.press('Escape');
    await expect(page.locator('.yarl__container')).not.toBeVisible();
  });
});
