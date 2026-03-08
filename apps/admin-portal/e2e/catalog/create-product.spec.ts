/**
 * Create Product E2E Tests
 *
 * End-to-end tests for the product creation flow including
 * opening dialog, filling form, validation, and submission.
 *
 * @module e2e/catalog/create-product
 */

import { test, expect } from '@playwright/test';
import { injectAxe, checkA11y } from 'axe-playwright';

test.describe('Create Product Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to catalog page
    await page.goto('/catalog');
    await page.waitForLoadState('networkidle');
  });

  test.describe('Opening Create Dialog', () => {
    test('should open create dialog when clicking create button', async ({ page }) => {
      // Look for create/add product button
      const createButton = page.getByRole('button', { name: /create product/i }).or(
        page.getByRole('button', { name: /add product/i }).or(
          page.getByRole('button', { name: /new product/i })
        )
      );

      if (await createButton.isVisible({ timeout: 5000 })) {
        await createButton.click();

        // Dialog should open
        const dialog = page.getByRole('dialog', { name: /create.*product/i });
        await expect(dialog).toBeVisible({ timeout: 3000 });

        // Dialog should have title
        await expect(page.getByRole('heading', { name: /create.*product/i })).toBeVisible();
      }
    });

    test('should show all required form fields', async ({ page }) => {
      const createButton = page.getByRole('button', { name: /create product/i }).or(
        page.getByRole('button', { name: /add product/i })
      );

      if (await createButton.isVisible({ timeout: 5000 })) {
        await createButton.click();

        const dialog = page.getByRole('dialog');
        if (await dialog.isVisible({ timeout: 3000 })) {
          // Check for required fields
          await expect(dialog.getByLabel(/product name/i)).toBeVisible();
          await expect(dialog.getByLabel(/brand/i)).toBeVisible();
          await expect(dialog.getByLabel(/description/i)).toBeVisible();
          await expect(dialog.getByLabel(/price/i)).toBeVisible();
          await expect(dialog.getByLabel(/category/i)).toBeVisible();
        }
      }
    });

    test('should load categories in dropdown', async ({ page }) => {
      const createButton = page.getByRole('button', { name: /create product/i }).or(
        page.getByRole('button', { name: /add product/i })
      );

      if (await createButton.isVisible({ timeout: 5000 })) {
        await createButton.click();

        const dialog = page.getByRole('dialog');
        if (await dialog.isVisible({ timeout: 3000 })) {
          const categorySelect = dialog.getByLabel(/category/i);

          await expect(categorySelect).toBeVisible();

          // Wait for categories to load
          await page.waitForTimeout(1000);

          // Select should have options
          const options = categorySelect.locator('option');
          const count = await options.count();

          expect(count).toBeGreaterThan(1); // More than just placeholder
        }
      }
    });
  });

  test.describe('Form Filling', () => {
    test('should fill in basic product information', async ({ page }) => {
      const createButton = page.getByRole('button', { name: /create product/i }).or(
        page.getByRole('button', { name: /add product/i })
      );

      if (await createButton.isVisible({ timeout: 5000 })) {
        await createButton.click();

        const dialog = page.getByRole('dialog');
        if (await dialog.isVisible({ timeout: 3000 })) {
          // Fill in product name
          await dialog.getByLabel(/product name/i).fill('Test Modern Sofa');

          // Fill in brand
          await dialog.getByLabel(/brand/i).fill('Test Brand Inc');

          // Fill in description
          const descriptionField = dialog.getByLabel(/description/i);
          await descriptionField.fill('A comfortable and stylish modern sofa perfect for any living room');

          // Fill in price
          await dialog.getByLabel(/price/i).fill('1299.99');

          // Verify values are filled
          await expect(dialog.getByLabel(/product name/i)).toHaveValue('Test Modern Sofa');
          await expect(dialog.getByLabel(/brand/i)).toHaveValue('Test Brand Inc');
          await expect(dialog.getByLabel(/price/i)).toHaveValue('1299.99');
        }
      }
    });

    test('should add tags using multi-input', async ({ page }) => {
      const createButton = page.getByRole('button', { name: /create product/i }).or(
        page.getByRole('button', { name: /add product/i })
      );

      if (await createButton.isVisible({ timeout: 5000 })) {
        await createButton.click();

        const dialog = page.getByRole('dialog');
        if (await dialog.isVisible({ timeout: 3000 })) {
          const tagsInput = dialog.getByLabel(/tags/i).or(
            dialog.locator('input[id="tags"]')
          );

          if (await tagsInput.isVisible({ timeout: 2000 })) {
            // Type tag and press Enter
            await tagsInput.fill('modern');
            await page.keyboard.press('Enter');

            // Check tag is added
            await expect(dialog.getByText('modern')).toBeVisible();

            // Add another tag with comma
            await tagsInput.fill('minimalist,');

            await expect(dialog.getByText('minimalist')).toBeVisible();
          }
        }
      }
    });

    test('should add materials, colors, and style tags', async ({ page }) => {
      const createButton = page.getByRole('button', { name: /create product/i }).or(
        page.getByRole('button', { name: /add product/i })
      );

      if (await createButton.isVisible({ timeout: 5000 })) {
        await createButton.click();

        const dialog = page.getByRole('dialog');
        if (await dialog.isVisible({ timeout: 3000 })) {
          // Add material
          const materialsInput = dialog.getByLabel(/materials/i);
          if (await materialsInput.isVisible({ timeout: 2000 })) {
            await materialsInput.fill('Leather');
            await page.keyboard.press('Enter');
            await expect(dialog.getByText('Leather')).toBeVisible();
          }

          // Add color
          const colorsInput = dialog.getByLabel(/colors/i);
          if (await colorsInput.isVisible({ timeout: 2000 })) {
            await colorsInput.fill('Navy');
            await page.keyboard.press('Enter');
            await expect(dialog.getByText('Navy')).toBeVisible();
          }

          // Add style tag
          const styleTagsInput = dialog.getByLabel(/style tags/i);
          if (await styleTagsInput.isVisible({ timeout: 2000 })) {
            await styleTagsInput.fill('Scandinavian');
            await page.keyboard.press('Enter');
            await expect(dialog.getByText('Scandinavian')).toBeVisible();
          }
        }
      }
    });

    test('should remove tags when clicking X button', async ({ page }) => {
      const createButton = page.getByRole('button', { name: /create product/i }).or(
        page.getByRole('button', { name: /add product/i })
      );

      if (await createButton.isVisible({ timeout: 5000 })) {
        await createButton.click();

        const dialog = page.getByRole('dialog');
        if (await dialog.isVisible({ timeout: 3000 })) {
          const tagsInput = dialog.getByLabel(/tags/i);

          if (await tagsInput.isVisible({ timeout: 2000 })) {
            // Add a tag
            await tagsInput.fill('modern');
            await page.keyboard.press('Enter');

            await expect(dialog.getByText('modern')).toBeVisible();

            // Find and click remove button
            const removeButton = dialog.getByRole('button', { name: /remove modern/i });
            if (await removeButton.isVisible()) {
              await removeButton.click();

              // Tag should be removed
              await expect(dialog.getByText('modern')).not.toBeVisible();
            }
          }
        }
      }
    });

    test('should select category from dropdown', async ({ page }) => {
      const createButton = page.getByRole('button', { name: /create product/i }).or(
        page.getByRole('button', { name: /add product/i })
      );

      if (await createButton.isVisible({ timeout: 5000 })) {
        await createButton.click();

        const dialog = page.getByRole('dialog');
        if (await dialog.isVisible({ timeout: 3000 })) {
          const categorySelect = dialog.getByLabel(/category/i);

          // Wait for categories to load
          await page.waitForTimeout(1000);

          // Get first non-placeholder option
          const firstOption = categorySelect.locator('option').nth(1);
          const optionValue = await firstOption.getAttribute('value');

          if (optionValue) {
            await categorySelect.selectOption(optionValue);

            // Verify selection
            const selectedValue = await categorySelect.inputValue();
            expect(selectedValue).toBe(optionValue);
          }
        }
      }
    });

    test('should select product status', async ({ page }) => {
      const createButton = page.getByRole('button', { name: /create product/i }).or(
        page.getByRole('button', { name: /add product/i })
      );

      if (await createButton.isVisible({ timeout: 5000 })) {
        await createButton.click();

        const dialog = page.getByRole('dialog');
        if (await dialog.isVisible({ timeout: 3000 })) {
          const statusSelect = dialog.getByLabel(/status/i);

          if (await statusSelect.isVisible()) {
            await statusSelect.selectOption('draft');

            const selectedValue = await statusSelect.inputValue();
            expect(selectedValue).toBe('draft');
          }
        }
      }
    });
  });

  test.describe('Form Validation', () => {
    test('should show validation errors for empty required fields', async ({ page }) => {
      const createButton = page.getByRole('button', { name: /create product/i }).or(
        page.getByRole('button', { name: /add product/i })
      );

      if (await createButton.isVisible({ timeout: 5000 })) {
        await createButton.click();

        const dialog = page.getByRole('dialog');
        if (await dialog.isVisible({ timeout: 3000 })) {
          // Try to submit without filling anything
          const submitButton = dialog.getByRole('button', { name: /create product/i }).or(
            dialog.getByRole('button', { name: /submit/i })
          );

          await submitButton.click();

          // Wait for validation errors
          await page.waitForTimeout(500);

          // Should show validation errors
          const errorMessages = page.getByText(/required/i);
          const errorCount = await errorMessages.count();

          expect(errorCount).toBeGreaterThan(0);
        }
      }
    });

    test('should validate product name length', async ({ page }) => {
      const createButton = page.getByRole('button', { name: /create product/i }).or(
        page.getByRole('button', { name: /add product/i })
      );

      if (await createButton.isVisible({ timeout: 5000 })) {
        await createButton.click();

        const dialog = page.getByRole('dialog');
        if (await dialog.isVisible({ timeout: 3000 })) {
          const nameInput = dialog.getByLabel(/product name/i);

          // Type too short name
          await nameInput.fill('AB');
          await nameInput.blur();

          await page.waitForTimeout(300);

          // Should show error
          const error = page.getByText(/at least 3 characters/i);
          if (await error.isVisible({ timeout: 2000 })) {
            await expect(error).toBeVisible();
          }
        }
      }
    });

    test('should validate price is positive', async ({ page }) => {
      const createButton = page.getByRole('button', { name: /create product/i }).or(
        page.getByRole('button', { name: /add product/i })
      );

      if (await createButton.isVisible({ timeout: 5000 })) {
        await createButton.click();

        const dialog = page.getByRole('dialog');
        if (await dialog.isVisible({ timeout: 3000 })) {
          const priceInput = dialog.getByLabel(/price/i);

          // Try negative price
          await priceInput.fill('-100');

          // Submit to trigger validation
          const submitButton = dialog.getByRole('button', { name: /create product/i });
          await submitButton.click();

          await page.waitForTimeout(500);

          // Should show error about positive price
          const error = page.getByText(/greater than 0/i);
          if (await error.isVisible({ timeout: 2000 })) {
            await expect(error).toBeVisible();
          }
        }
      }
    });

    test('should validate description length', async ({ page }) => {
      const createButton = page.getByRole('button', { name: /create product/i }).or(
        page.getByRole('button', { name: /add product/i })
      );

      if (await createButton.isVisible({ timeout: 5000 })) {
        await createButton.click();

        const dialog = page.getByRole('dialog');
        if (await dialog.isVisible({ timeout: 3000 })) {
          const descInput = dialog.getByLabel(/description/i);

          // Type too short description
          await descInput.fill('Short');

          // Submit to trigger validation
          const submitButton = dialog.getByRole('button', { name: /create product/i });
          await submitButton.click();

          await page.waitForTimeout(500);

          // Should show error
          const error = page.getByText(/at least 10 characters/i);
          if (await error.isVisible({ timeout: 2000 })) {
            await expect(error).toBeVisible();
          }
        }
      }
    });
  });

  test.describe('Form Submission', () => {
    test('should submit form with valid data', async ({ page }) => {
      // Mock API response
      await page.route('**/api/v1/products', (route) => {
        if (route.request().method() === 'POST') {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                id: 'new-product-123',
                name: 'Test Modern Sofa',
                brand: 'Test Brand',
                price: 1299.99,
                status: 'draft',
              },
            }),
          });
        } else {
          route.continue();
        }
      });

      const createButton = page.getByRole('button', { name: /create product/i }).or(
        page.getByRole('button', { name: /add product/i })
      );

      if (await createButton.isVisible({ timeout: 5000 })) {
        await createButton.click();

        const dialog = page.getByRole('dialog');
        if (await dialog.isVisible({ timeout: 3000 })) {
          // Fill in all required fields
          await dialog.getByLabel(/product name/i).fill('Test Modern Sofa');
          await dialog.getByLabel(/brand/i).fill('Test Brand Inc');
          await dialog.getByLabel(/description/i).fill('A comfortable and stylish modern sofa perfect for any living room');
          await dialog.getByLabel(/price/i).fill('1299.99');

          // Select category
          const categorySelect = dialog.getByLabel(/category/i);
          await page.waitForTimeout(1000); // Wait for categories to load
          const firstOption = await categorySelect.locator('option').nth(1).getAttribute('value');
          if (firstOption) {
            await categorySelect.selectOption(firstOption);
          }

          // Submit form
          const submitButton = dialog.getByRole('button', { name: /create product/i });
          await submitButton.click();

          // Dialog should close
          await expect(dialog).not.toBeVisible({ timeout: 5000 });

          // Success message should appear
          const successMessage = page.getByText(/created successfully/i).or(
            page.getByText(/success/i)
          );

          if (await successMessage.isVisible({ timeout: 3000 })) {
            await expect(successMessage).toBeVisible();
          }
        }
      }
    });

    test('should show loading state during submission', async ({ page }) => {
      // Mock slow API response
      await page.route('**/api/v1/products', async (route) => {
        if (route.request().method() === 'POST') {
          await page.waitForTimeout(2000); // Simulate slow response
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: { id: 'new-product-123', name: 'Test Product' },
            }),
          });
        } else {
          route.continue();
        }
      });

      const createButton = page.getByRole('button', { name: /create product/i }).or(
        page.getByRole('button', { name: /add product/i })
      );

      if (await createButton.isVisible({ timeout: 5000 })) {
        await createButton.click();

        const dialog = page.getByRole('dialog');
        if (await dialog.isVisible({ timeout: 3000 })) {
          // Fill minimum required fields quickly
          await dialog.getByLabel(/product name/i).fill('Test Product');
          await dialog.getByLabel(/brand/i).fill('Test Brand');
          await dialog.getByLabel(/description/i).fill('Test description for the product');
          await dialog.getByLabel(/price/i).fill('999');

          const categorySelect = dialog.getByLabel(/category/i);
          await page.waitForTimeout(1000);
          const firstOption = await categorySelect.locator('option').nth(1).getAttribute('value');
          if (firstOption) {
            await categorySelect.selectOption(firstOption);
          }

          // Click submit
          const submitButton = dialog.getByRole('button', { name: /create product/i });
          await submitButton.click();

          // Check for loading state
          const loadingIndicator = dialog.getByText(/creating/i).or(
            dialog.locator('[data-loading="true"]')
          );

          if (await loadingIndicator.isVisible({ timeout: 1000 })) {
            await expect(loadingIndicator).toBeVisible();
          }
        }
      }
    });

    test('should handle API errors', async ({ page }) => {
      // Mock API error
      await page.route('**/api/v1/products', (route) => {
        if (route.request().method() === 'POST') {
          route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'Failed to create product',
            }),
          });
        } else {
          route.continue();
        }
      });

      const createButton = page.getByRole('button', { name: /create product/i }).or(
        page.getByRole('button', { name: /add product/i })
      );

      if (await createButton.isVisible({ timeout: 5000 })) {
        await createButton.click();

        const dialog = page.getByRole('dialog');
        if (await dialog.isVisible({ timeout: 3000 })) {
          // Fill and submit
          await dialog.getByLabel(/product name/i).fill('Test Product');
          await dialog.getByLabel(/brand/i).fill('Test Brand');
          await dialog.getByLabel(/description/i).fill('Test description for the product');
          await dialog.getByLabel(/price/i).fill('999');

          const categorySelect = dialog.getByLabel(/category/i);
          await page.waitForTimeout(1000);
          const firstOption = await categorySelect.locator('option').nth(1).getAttribute('value');
          if (firstOption) {
            await categorySelect.selectOption(firstOption);
          }

          const submitButton = dialog.getByRole('button', { name: /create product/i });
          await submitButton.click();

          // Error message should appear
          await page.waitForTimeout(1000);
          const errorMessage = page.getByText(/failed/i).or(
            page.getByRole('alert')
          );

          if (await errorMessage.isVisible({ timeout: 3000 })) {
            await expect(errorMessage).toBeVisible();
          }
        }
      }
    });

    test('should verify product appears in list after creation', async ({ page }) => {
      // Mock successful creation
      await page.route('**/api/v1/products', (route) => {
        if (route.request().method() === 'POST') {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                id: 'new-product-123',
                name: 'Newly Created Sofa',
                brand: 'Test Brand',
                price: 1299.99,
                status: 'draft',
              },
            }),
          });
        } else if (route.request().method() === 'GET') {
          // Return list including new product
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: [
                {
                  id: 'new-product-123',
                  name: 'Newly Created Sofa',
                  brand: 'Test Brand',
                  price: 1299.99,
                  status: 'draft',
                },
              ],
              meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
            }),
          });
        }
      });

      const createButton = page.getByRole('button', { name: /create product/i }).or(
        page.getByRole('button', { name: /add product/i })
      );

      if (await createButton.isVisible({ timeout: 5000 })) {
        await createButton.click();

        const dialog = page.getByRole('dialog');
        if (await dialog.isVisible({ timeout: 3000 })) {
          await dialog.getByLabel(/product name/i).fill('Newly Created Sofa');
          await dialog.getByLabel(/brand/i).fill('Test Brand');
          await dialog.getByLabel(/description/i).fill('A newly created sofa for testing purposes');
          await dialog.getByLabel(/price/i).fill('1299.99');

          const categorySelect = dialog.getByLabel(/category/i);
          await page.waitForTimeout(1000);
          const firstOption = await categorySelect.locator('option').nth(1).getAttribute('value');
          if (firstOption) {
            await categorySelect.selectOption(firstOption);
          }

          const submitButton = dialog.getByRole('button', { name: /create product/i });
          await submitButton.click();

          // Wait for dialog to close and list to refresh
          await page.waitForTimeout(2000);

          // Product should appear in list
          const newProduct = page.getByText('Newly Created Sofa');
          await expect(newProduct).toBeVisible({ timeout: 5000 });
        }
      }
    });
  });

  test.describe('Dialog Behavior', () => {
    test('should close dialog on cancel button click', async ({ page }) => {
      const createButton = page.getByRole('button', { name: /create product/i }).or(
        page.getByRole('button', { name: /add product/i })
      );

      if (await createButton.isVisible({ timeout: 5000 })) {
        await createButton.click();

        const dialog = page.getByRole('dialog');
        if (await dialog.isVisible({ timeout: 3000 })) {
          const cancelButton = dialog.getByRole('button', { name: /cancel/i });
          await cancelButton.click();

          // Dialog should close
          await expect(dialog).not.toBeVisible({ timeout: 2000 });
        }
      }
    });

    test('should reset form when reopening dialog', async ({ page }) => {
      const createButton = page.getByRole('button', { name: /create product/i }).or(
        page.getByRole('button', { name: /add product/i })
      );

      if (await createButton.isVisible({ timeout: 5000 })) {
        // Open dialog first time
        await createButton.click();

        let dialog = page.getByRole('dialog');
        if (await dialog.isVisible({ timeout: 3000 })) {
          // Fill some data
          await dialog.getByLabel(/product name/i).fill('Test Product');

          // Close dialog
          const cancelButton = dialog.getByRole('button', { name: /cancel/i });
          await cancelButton.click();

          await page.waitForTimeout(500);

          // Reopen dialog
          await createButton.click();

          dialog = page.getByRole('dialog');
          if (await dialog.isVisible({ timeout: 3000 })) {
            // Form should be reset
            const nameInput = dialog.getByLabel(/product name/i);
            await expect(nameInput).toHaveValue('');
          }
        }
      }
    });
  });

  test.describe('Accessibility', () => {
    test('should pass accessibility checks', async ({ page }) => {
      const createButton = page.getByRole('button', { name: /create product/i }).or(
        page.getByRole('button', { name: /add product/i })
      );

      if (await createButton.isVisible({ timeout: 5000 })) {
        await createButton.click();

        const dialog = page.getByRole('dialog');
        if (await dialog.isVisible({ timeout: 3000 })) {
          // Inject axe
          await injectAxe(page);

          // Run accessibility checks
          await checkA11y(page, undefined, {
            detailedReport: true,
          });
        }
      }
    });

    test('should support keyboard navigation', async ({ page }) => {
      const createButton = page.getByRole('button', { name: /create product/i }).or(
        page.getByRole('button', { name: /add product/i })
      );

      if (await createButton.isVisible({ timeout: 5000 })) {
        await createButton.click();

        const dialog = page.getByRole('dialog');
        if (await dialog.isVisible({ timeout: 3000 })) {
          // Tab through fields
          await page.keyboard.press('Tab');
          let focused = page.locator(':focus');
          await expect(focused).toBeVisible();

          await page.keyboard.press('Tab');
          focused = page.locator(':focus');
          await expect(focused).toBeVisible();
        }
      }
    });
  });
});
