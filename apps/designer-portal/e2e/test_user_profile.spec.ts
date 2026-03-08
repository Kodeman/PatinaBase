import { test, expect } from '@playwright/test';

// Use the configured NEXTAUTH_URL domain
const BASE_URL = 'http://designer.nordicheat.org';

test('login and inspect user profile in header', async ({ page }) => {
  // Enable console logging
  page.on('console', msg => console.log(`CONSOLE [${msg.type()}]: ${msg.text()}`));

  console.log('=== Step 1: Navigate to sign-in page ===');
  await page.goto(`${BASE_URL}/auth/signin`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: '/tmp/01_signin_page.png', fullPage: true });
  console.log(`Current URL: ${page.url()}`);

  console.log('=== Step 2: Fill login form ===');

  // Wait for the AuthForm to be visible
  await page.waitForSelector('input[type="email"], input[name="email"]');

  // Find and fill email field
  const emailField = page.locator('input[type="email"], input[name="email"]');
  await emailField.fill('designer@patina.dev');
  console.log('Filled email field');

  // Find and fill password field
  const passwordField = page.locator('input[type="password"], input[name="password"]');
  await passwordField.fill('password123');
  console.log('Filled password field');

  await page.screenshot({ path: '/tmp/02_credentials_filled.png', fullPage: true });

  console.log('=== Step 3: Submit form ===');
  // Click sign in button
  const submitButton = page.locator('button[type="submit"]');
  await submitButton.click();
  console.log('Clicked sign in button');

  // Wait for navigation or form to process
  await page.waitForTimeout(3000);  // Wait for auth to complete

  await page.screenshot({ path: '/tmp/03_after_submit.png', fullPage: true });
  console.log(`After submit URL: ${page.url()}`);

  // Wait for any redirect
  await page.waitForLoadState('networkidle');

  console.log('=== Step 4: Check final state ===');
  await page.screenshot({ path: '/tmp/04_final_state.png', fullPage: true });
  console.log(`Final URL: ${page.url()}`);

  // Check session
  console.log('\n=== Step 5: Check session data ===');
  const sessionResponse = await page.request.get(`${BASE_URL}/api/auth/session`);
  const sessionData = await sessionResponse.json();
  console.log(`Session data:\n${JSON.stringify(sessionData, null, 2)}`);

  // Go to projects page to check header
  console.log('\n=== Step 6: Check projects page header ===');
  await page.goto(`${BASE_URL}/projects`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/05_projects.png', fullPage: true });
  console.log(`Projects URL: ${page.url()}`);

  // Inspect header
  const header = page.locator('header');
  if (await header.count() > 0) {
    const headerHtml = await header.first().innerHTML();
    console.log(`\nHeader HTML:\n${headerHtml.substring(0, 3000)}`);
  }

  // Look for user menu elements
  const allButtons = await page.locator('header button').all();
  console.log(`\nHeader buttons: ${allButtons.length}`);
  for (let i = 0; i < allButtons.length; i++) {
    const text = await allButtons[i].innerText();
    const ariaLabel = await allButtons[i].getAttribute('aria-label');
    console.log(`  Button ${i}: text="${text}", aria-label="${ariaLabel}"`);
  }

  // Check for avatar specifically
  const avatar = page.locator('header [class*="avatar"], header [class*="Avatar"]');
  console.log(`\nAvatar elements in header: ${await avatar.count()}`);

  // Check for any elements with user-related classes
  const userElements = page.locator('header [class*="user"], header [class*="User"]');
  console.log(`User-related elements in header: ${await userElements.count()}`);

  // Debug: Check if the whole page has the user menu anywhere
  const pageUserMenu = page.locator('[class*="UserStatusMenu"], [data-testid*="user"]');
  console.log(`UserStatusMenu anywhere on page: ${await pageUserMenu.count()}`);

  // Check what's after the notification bell
  const headerRightDiv = page.locator('header > div:last-child');
  if (await headerRightDiv.count() > 0) {
    const rightDivHtml = await headerRightDiv.innerHTML();
    console.log(`\nRight div HTML:\n${rightDivHtml}`);
  }

  console.log('\nScreenshots saved to /tmp/');
});
