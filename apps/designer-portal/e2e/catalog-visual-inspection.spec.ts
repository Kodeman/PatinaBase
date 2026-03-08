import { test, expect } from '@playwright/test';

/**
 * Visual Inspection Test - Takes screenshots and documents current state
 */

test.describe('Catalog Visual Inspection', () => {
  test('Capture catalog page state with screenshots', async ({ page }) => {
    console.log('\n=== VISUAL INSPECTION TEST ===\n');

    // Step 1: Navigate to catalog
    console.log('Step 1: Navigating to catalog page...');
    await page.goto('http://localhost:3000/catalog');
    await page.waitForTimeout(3000);

    // Take screenshot of initial page
    await page.screenshot({ path: 'test-results/01-catalog-initial.png', fullPage: true });
    console.log('✓ Screenshot saved: 01-catalog-initial.png');

    // Check current URL (might have redirected)
    const currentUrl = page.url();
    console.log(`Current URL: ${currentUrl}`);

    // Check page title
    const h1 = await page.locator('h1').first().textContent().catch(() => 'No H1 found');
    console.log(`Page H1: ${h1}`);

    // Check for sign-in page
    const isSignInPage = currentUrl.includes('/auth/signin') || currentUrl.includes('/signin') || h1?.includes('Sign');
    console.log(`Is Sign-In Page: ${isSignInPage}`);

    if (isSignInPage) {
      console.log('\n⚠️  REDIRECT DETECTED: User not authenticated');
      console.log('The catalog page requires authentication.');
      console.log('Attempting to sign in...\n');

      // Try to find email and password fields
      const emailInput = page.locator('input[name="email"], input[type="email"]').first();
      const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
      const submitButton = page.locator('button[type="submit"]').first();

      const hasEmailField = await emailInput.count() > 0;
      const hasPasswordField = await passwordInput.count() > 0;
      const hasSubmitButton = await submitButton.count() > 0;

      console.log(`Email field found: ${hasEmailField}`);
      console.log(`Password field found: ${hasPasswordField}`);
      console.log(`Submit button found: ${hasSubmitButton}`);

      if (hasEmailField && hasPasswordField && hasSubmitButton) {
        // Try demo credentials
        await emailInput.fill('designer@patina.com');
        await passwordInput.fill('password123');
        await page.screenshot({ path: 'test-results/02-signin-filled.png' });
        console.log('✓ Screenshot saved: 02-signin-filled.png');

        await submitButton.click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'test-results/03-after-signin.png', fullPage: true });
        console.log('✓ Screenshot saved: 03-after-signin.png');

        // Check if we're now on the catalog page
        const newUrl = page.url();
        console.log(`New URL after sign-in: ${newUrl}`);

        if (newUrl.includes('/catalog')) {
          console.log('✓ Successfully authenticated and redirected to catalog');
        } else {
          console.log('⚠️  Sign-in completed but not redirected to catalog');
        }
      }
    }

    // Wait for page to stabilize
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-results/04-catalog-final.png', fullPage: true });
    console.log('✓ Screenshot saved: 04-catalog-final.png');

    // Analyze page structure
    console.log('\n=== PAGE STRUCTURE ANALYSIS ===\n');

    // Count various elements
    const buttons = await page.locator('button').count();
    const links = await page.locator('a').count();
    const images = await page.locator('img').count();
    const inputs = await page.locator('input').count();
    const cards = await page.locator('[class*="card"]').count();

    console.log(`Buttons: ${buttons}`);
    console.log(`Links: ${links}`);
    console.log(`Images: ${images}`);
    console.log(`Input fields: ${inputs}`);
    console.log(`Card elements: ${cards}`);

    // Check for specific catalog features
    console.log('\n=== CATALOG FEATURES CHECK ===\n');

    const searchBar = await page.locator('input[placeholder*="Search"]').count();
    const filterButton = await page.locator('button:has-text("Filter")').count();
    const createButton = await page.locator('button:has-text("Create")').count();
    const productCards = await page.locator('[class*="product"], [class*="Product"]').count();

    console.log(`Search bar: ${searchBar > 0 ? '✓ Found' : '✗ Not found'}`);
    console.log(`Filter button: ${filterButton > 0 ? '✓ Found' : '✗ Not found'}`);
    console.log(`Create button: ${createButton > 0 ? '✓ Found' : '✗ Not found'}`);
    console.log(`Product cards: ${productCards > 0 ? `✓ Found (${productCards})` : '✗ Not found'}`);

    // Check for error messages
    const alerts = await page.locator('[role="alert"]').count();
    if (alerts > 0) {
      console.log('\n⚠️  ALERTS FOUND:');
      for (let i = 0; i < alerts; i++) {
        const alertText = await page.locator('[role="alert"]').nth(i).textContent();
        console.log(`  Alert ${i + 1}: ${alertText}`);
      }
    }

    // Check console errors
    const consoleMessages: { type: string; text: string }[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        consoleMessages.push({ type: msg.type(), text: msg.text() });
      }
    });

    await page.reload();
    await page.waitForTimeout(2000);

    if (consoleMessages.length > 0) {
      console.log('\n⚠️  CONSOLE MESSAGES:');
      consoleMessages.forEach((msg, i) => {
        console.log(`  [${msg.type}] ${msg.text}`);
      });
    }

    console.log('\n=== INSPECTION COMPLETE ===');
    console.log('Check test-results/ directory for screenshots\n');
  });

  test('Test categories page', async ({ page }) => {
    console.log('\n=== CATEGORIES PAGE TEST ===\n');

    await page.goto('http://localhost:3000/catalog/categories');
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'test-results/05-categories-page.png', fullPage: true });
    console.log('✓ Screenshot saved: 05-categories-page.png');

    const currentUrl = page.url();
    console.log(`Current URL: ${currentUrl}`);

    const h2 = await page.locator('h2').first().textContent().catch(() => 'No H2 found');
    console.log(`Page H2: ${h2}`);

    // Check for categories
    const categoryElements = await page.locator('[class*="category"], [class*="Category"]').count();
    console.log(`Category elements found: ${categoryElements}`);

    // Check for loading states
    const loading = await page.locator('text=/Loading/i').count();
    const error = await page.locator('text=/Error/i, text=/Failed/i').count();

    console.log(`Loading indicators: ${loading}`);
    console.log(`Error messages: ${error}`);

    if (error > 0) {
      const errorTexts = await page.locator('text=/Error/i, text=/Failed/i').allTextContents();
      console.log('Error messages:', errorTexts);
    }
  });
});
