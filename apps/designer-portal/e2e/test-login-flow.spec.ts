import { test, expect } from '@playwright/test';

test.describe('Login Flow Test', () => {
  test('should successfully login and access catalog with Edit buttons', async ({ page }) => {
    // Enable verbose console logging
    page.on('console', (msg) => {
      console.log(`BROWSER [${msg.type()}]:`, msg.text());
    });

    // Log all requests
    page.on('request', (request) => {
      if (request.url().includes('auth') || request.url().includes('signin')) {
        console.log(`REQUEST: ${request.method()} ${request.url()}`);
      }
    });

    // Log all responses
    page.on('response', async (response) => {
      if (response.url().includes('auth') || response.url().includes('signin')) {
        console.log(`RESPONSE: ${response.status()} ${response.url()}`);
        if (response.status() >= 400) {
          try {
            const body = await response.text();
            console.log(`ERROR BODY:`, body);
          } catch (e) {
            console.log('Could not read response body');
          }
        }
      }
    });

    console.log('\n=== STEP 1: Navigate to signin page ===');
    await page.goto('http://localhost:3000/auth/signin');
    await page.waitForLoadState('networkidle');

    // Take screenshot of signin page
    await page.screenshot({ path: 'test-results/login-01-signin-page.png', fullPage: true });
    console.log('Signin page loaded');

    console.log('\n=== STEP 2: Fill login form ===');
    await page.fill('input[name="email"]', 'designer@patina.local');
    await page.fill('input[name="password"]', 'password123');

    // Take screenshot before submitting
    await page.screenshot({ path: 'test-results/login-02-form-filled.png', fullPage: true });
    console.log('Form filled');

    console.log('\n=== STEP 3: Submit login form ===');
    await page.click('button[type="submit"]');

    // Wait and see what happens
    await page.waitForTimeout(5000);

    // Take screenshot after submission
    await page.screenshot({ path: 'test-results/login-03-after-submit.png', fullPage: true });
    console.log('Current URL:', page.url());

    // Check if we're redirected
    if (page.url().includes('/auth/signin')) {
      console.log('⚠️  Still on signin page - login may have failed');

      // Check for error messages
      const errorMessages = await page.locator('[role="alert"], .error, .text-red-500, .text-destructive').allTextContents();
      console.log('Error messages on page:', errorMessages);
    } else if (page.url().includes('/dashboard') || page.url().includes('/catalog')) {
      console.log('✅ Redirected successfully to:', page.url());
    }

    console.log('\n=== STEP 4: Navigate to catalog ===');
    await page.goto('http://localhost:3000/catalog');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-results/login-04-catalog-page.png', fullPage: true });

    console.log('\n=== STEP 5: Check for Edit buttons ===');
    // Wait for product cards
    await page.waitForSelector('.group', { timeout: 10000 });

    const editButtons = await page.getByRole('button', { name: /edit/i }).count();
    const viewButtons = await page.getByRole('button', { name: /view/i }).count();
    const addButtons = await page.getByRole('button', { name: /add/i }).count();

    console.log(`Found buttons: Edit=${editButtons}, View=${viewButtons}, Add=${addButtons}`);

    if (editButtons > 0) {
      console.log('✅ SUCCESS: Edit buttons are visible!');

      // Click first edit button
      await page.getByRole('button', { name: /edit/i }).first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      await page.screenshot({ path: 'test-results/login-05-edit-page.png', fullPage: true });
      console.log('Edit page URL:', page.url());

      // Check for tabs
      const tabs = ['Details', 'Media', 'Pricing', 'Inventory', 'SEO', 'Validation'];
      for (const tabName of tabs) {
        const hasTab = await page.getByRole('tab', { name: tabName }).count() > 0;
        console.log(`  ${hasTab ? '✅' : '❌'} ${tabName} tab`);
      }
    } else {
      console.log('❌ FAILURE: No Edit buttons found');

      // Debug info
      const allButtons = await page.locator('button').allTextContents();
      console.log('All button texts (first 30):', allButtons.slice(0, 30));
    }
  });
});
