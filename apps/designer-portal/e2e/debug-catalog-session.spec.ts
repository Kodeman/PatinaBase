import { test, expect } from '@playwright/test';

// Test credentials - using dev-credentials provider
const TEST_USER = {
  email: 'designer@patina.local',
  password: 'password123',
};

test.describe('Debug Catalog Session', () => {
  test('should debug session and permissions on catalog page', async ({ page }) => {
    // Enable console logging
    page.on('console', (msg) => {
      console.log(`BROWSER CONSOLE [${msg.type()}]:`, msg.text());
    });

    // Navigate to sign in page
    await page.goto('http://localhost:3000/auth/signin');
    await page.waitForLoadState('networkidle');

    // Fill in login form
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);

    // Click sign in button
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard (login successful)
    await page.waitForTimeout(3000);

    // Navigate to catalog
    await page.goto('http://localhost:3000/catalog');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Inject script to check session and permissions
    const debugInfo = await page.evaluate(() => {
      // Get all buttons
      const allButtons = Array.from(document.querySelectorAll('button'));
      const buttonTexts = allButtons.map(b => b.textContent?.trim() || '');

      // Get product cards
      const productCards = document.querySelectorAll('.group');

      return {
        totalButtons: allButtons.length,
        buttonTexts: buttonTexts.slice(0, 20), // First 20 buttons
        editButtons: buttonTexts.filter(t => t.toLowerCase().includes('edit')),
        productCardCount: productCards.length,
        hasEditButtonInDOM: allButtons.some(b => b.textContent?.includes('Edit')),
        url: window.location.href,
      };
    });

    console.log('\n=== DEBUG INFO ===');
    console.log('URL:', debugInfo.url);
    console.log('Total buttons found:', debugInfo.totalButtons);
    console.log('Product cards found:', debugInfo.productCardCount);
    console.log('Edit buttons found:', debugInfo.editButtons.length);
    console.log('Has Edit button in DOM:', debugInfo.hasEditButtonInDOM);
    console.log('First 20 button texts:', debugInfo.buttonTexts);

    // Take screenshot
    await page.screenshot({ path: 'test-results/debug-catalog-session.png', fullPage: true });

    // Wait to see what happens
    await page.waitForTimeout(5000);
  });
});
