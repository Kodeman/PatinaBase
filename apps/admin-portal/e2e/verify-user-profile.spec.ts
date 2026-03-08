import { test, expect } from '@playwright/test';

// Use direct port to bypass NGINX - the 502 errors are NGINX-related, not auth-related
const BASE_URL = 'http://localhost:3001';

test('Admin portal should show user profile when logged in', async ({ page }) => {
  // Capture console logs
  const consoleLogs: string[] = [];
  page.on('console', msg => consoleLogs.push('[' + msg.type() + '] ' + msg.text()));

  // Step 1: Go to signin page
  console.log('Step 1: Navigating to signin page...');
  await page.goto(`${BASE_URL}/auth/signin`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Take screenshot of signin page
  await page.screenshot({ path: '/tmp/admin-01-signin.png', fullPage: true });
  console.log('Screenshot: /tmp/admin-01-signin.png');

  // Step 2: Use Dev Accounts dropdown to sign in
  console.log('Step 2: Looking for Dev Accounts dropdown...');

  // Click on the Dev Accounts dropdown
  const devAccountsButton = page.locator('text=Dev Accounts');
  if (await devAccountsButton.count() > 0) {
    await devAccountsButton.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/tmp/admin-02-dev-accounts-open.png', fullPage: true });

    // Click the Sign In button next to Admin User (use exact locator from Playwright suggestion)
    const adminSignInButton = page.locator('div').filter({ hasText: /^Admin Useradminadmin@patina\.devSign In$/ }).getByRole('button');
    await adminSignInButton.click();
    console.log('Clicked Admin User Sign In button');

    // Wait for navigation - be more patient
    await page.waitForURL('**/dashboard**', { timeout: 15000 }).catch(() => {
      console.log('Did not redirect to dashboard after dev login');
    });

    // Give the session time to stabilize
    await page.waitForTimeout(3000);
  } else {
    // Fallback: fill in form manually
    console.log('No Dev Accounts dropdown, trying form...');
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    const passwordInput = page.locator('input[type="password"], input[name="password"]');

    if (await emailInput.count() > 0) {
      await emailInput.fill('admin@patina.com');
      await passwordInput.fill('admin123');
      await page.locator('button[type="submit"], button:has-text("Sign In")').click();
      await page.waitForTimeout(3000);
    }
  }

  await page.screenshot({ path: '/tmp/admin-03-after-signin.png', fullPage: true });
  console.log('Screenshot: /tmp/admin-03-after-signin.png');
  console.log('Current URL:', page.url());

  // Step 3: Navigate to users page (admin portal has no /dashboard route)
  console.log('Step 3: Navigating to users page...');
  await page.goto(`${BASE_URL}/users`, { waitUntil: 'networkidle' });

  // Wait for session to be fully established
  await page.waitForTimeout(2000);

  // Force a page refresh to re-establish session
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  await page.screenshot({ path: '/tmp/admin-04-users.png', fullPage: true });
  console.log('Screenshot: /tmp/admin-04-users.png');
  console.log('Final URL:', page.url());

  // Step 4: Check for user profile elements in header
  console.log('Step 4: Looking for user profile elements...');

  // Look for the header
  const header = page.locator('header');
  const headerCount = await header.count();
  console.log('Headers found: ' + headerCount);

  // Look for user status menu with user name - the component shows "Admin User" in the header
  // The button has format: "AU Status: online Admin User admin"
  const userStatusButton = await page.locator('button:has-text("Admin User")').count();
  const userMenuWithOnline = await page.locator('button:has-text("online")').count();
  const userInitialsAU = await page.locator('text=AU').first().count();

  console.log('User status button with Admin User: ' + userStatusButton);
  console.log('User menu with online status: ' + userMenuWithOnline);
  console.log('User initials AU found: ' + userInitialsAU);

  // Also check for the old selectors for backwards compatibility
  const avatarElements = await page.locator('[class*="avatar"]').count();
  const userMenuButton = await page.locator('button:has([class*="avatar"])').count();

  console.log('Avatar elements (class): ' + avatarElements);
  console.log('User menu buttons (class): ' + userMenuButton);

  // Take a close-up of the header
  if (headerCount > 0) {
    await page.screenshot({
      path: '/tmp/admin-05-header-closeup.png',
      clip: { x: 0, y: 0, width: 1920, height: 100 }
    });
    console.log('Screenshot: /tmp/admin-05-header-closeup.png');
  }

  // Print relevant console logs
  const sessionLogs = consoleLogs.filter(log =>
    log.includes('session') || log.includes('Session') || log.includes('auth') || log.includes('user')
  );
  if (sessionLogs.length > 0) {
    console.log('\nSession-related console logs:');
    sessionLogs.forEach(log => console.log('  ' + log));
  }

  // Final assertion - check if we're on users page and have user profile
  const isOnUsersPage = page.url().includes('/users');
  // User profile is visible if we can see the user status button or avatar elements
  const hasUserProfile = userStatusButton > 0 || userMenuWithOnline > 0 || userInitialsAU > 0 || avatarElements > 0;

  console.log('\nOn users page: ' + isOnUsersPage);
  console.log('User profile visible: ' + hasUserProfile);

  expect(isOnUsersPage, 'Should be on users page').toBe(true);
  expect(hasUserProfile, 'User profile should be visible in header').toBe(true);
});
