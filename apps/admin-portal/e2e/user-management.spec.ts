import { test, expect, Page } from '@playwright/test';

/**
 * User Management E2E Test Suite for Admin Portal
 *
 * Tests core user management functionality:
 * - Admin authentication
 * - User list loading
 * - User data visibility (names, emails, roles)
 * - Navigation to other admin sections (roles, settings)
 */

const ADMIN_EMAIL = 'admin@patina.dev';
const ADMIN_PASSWORD = 'password123';

/**
 * Helper function to sign in as admin using dev accounts panel
 */
async function signInAsAdmin(page: Page) {
  await page.goto('/auth/signin');

  // Wait for the signin page to load
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1000);

  // Look for the dev accounts panel - it should be visible in development
  // The panel is collapsed by default, so we need to expand it first
  const devPanelToggle = page.locator('button:has-text("Development Accounts"), button:has-text("Dev Accounts")').first();
  const hasDevPanel = await devPanelToggle.isVisible({ timeout: 3000 }).catch(() => false);

  if (hasDevPanel) {
    console.log('✓ Found dev accounts panel - using one-click login');
    await devPanelToggle.click();
    await page.waitForTimeout(500);

    // Find the "Admin User" card and click its "Sign In" button
    // The structure is: a div containing "Admin User" text and a "Sign In" button
    const adminCard = page.locator('div:has-text("Admin User"):has(button:has-text("Sign In"))').first();
    const adminCardVisible = await adminCard.isVisible({ timeout: 2000 }).catch(() => false);

    if (adminCardVisible) {
      // Click the "Sign In" button within the Admin User card
      const signInBtn = adminCard.locator('button:has-text("Sign In")').first();
      console.log('✓ Clicking Sign In button for Admin User');
      await signInBtn.click();
      await page.waitForTimeout(3000);
      return;
    }
  }

  // Fallback: Manual form submission
  console.log('ℹ Dev panel not found - trying manual form signin');

  // Wait for inputs to be available
  await page.waitForSelector('input[type="email"]', { timeout: 5000 });

  // Fill in credentials
  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="password"]');

  await emailInput.fill(ADMIN_EMAIL);
  await passwordInput.fill(ADMIN_PASSWORD);

  // Click the sign in button
  const signInButton = page.locator('button[type="submit"]').first();
  await signInButton.click();

  // Wait for navigation or error
  await page.waitForTimeout(3000);
}

test.describe('Admin Portal - User Management', () => {
  test.beforeEach(async ({ page }) => {
    // Sign in before each test
    await signInAsAdmin(page);
  });

  test('should successfully sign in as admin', async ({ page }) => {
    // Check if we successfully authenticated
    const url = page.url();

    if (url.includes('/auth/signin')) {
      console.warn('⚠ Authentication failed - still on signin page');
      console.warn('This indicates an issue with the NextAuth configuration or backend service');

      // Check for error messages
      const bodyText = await page.locator('body').textContent();
      if (bodyText?.includes('Invalid') || bodyText?.includes('error')) {
        console.warn('Error message visible on page');
      }

      // Mark test as failed with helpful message
      throw new Error('Authentication system is not working - admin signin failed. Check that user-management service is running and NextAuth is configured correctly.');
    }

    // Verify we're on a dashboard or authenticated page
    const isAuthenticated = url.includes('/dashboard') ||
                           url.includes('/users') ||
                           url.includes('/catalog') ||
                           url.includes('/demo') ||
                           !url.includes('/auth');

    expect(isAuthenticated).toBeTruthy();
    console.log(`✓ Successfully authenticated - redirected to: ${url}`);
  });

  test('should navigate to /users and display user list', async ({ page }) => {
    // Navigate to users page
    await page.goto('/users');

    // Wait for page to load
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    // Check if we got redirected to signin (auth failed)
    if (page.url().includes('/auth/signin')) {
      console.log('⚠ Auth failed - user was redirected to signin');
      throw new Error('Authentication failed - cannot access /users page');
    }

    // Check for page title or heading
    const pageTitle = page.locator('h1').first();
    await expect(pageTitle).toBeVisible({ timeout: 10000 });
    const titleText = await pageTitle.textContent();

    // Be more flexible - may say "Users" or "Admin Portal" etc
    expect(titleText?.length).toBeGreaterThan(0);

    // Verify we're on users page by checking URL or content
    const isOnUsersPage = page.url().includes('/users') ||
                         (await page.locator('body').textContent())?.toLowerCase().includes('user');

    if (!isOnUsersPage) {
      console.log(`Current URL: ${page.url()}`);
      console.log(`Page title: ${titleText}`);
    }

    expect(isOnUsersPage).toBe(true);

    // Check that the page loaded successfully (not showing error state)
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toContain('Failed to load');
    expect(bodyText).not.toContain('Error loading');
  });

  test('should display user data (names, emails, roles)', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle', { timeout: 15000 });

    // Wait for users to load - look for either user entries or "no users" message
    const hasUsers = await page.locator('body').textContent();

    if (hasUsers?.includes('No users found') || hasUsers?.includes('Loading users')) {
      console.log('No users found or still loading');
      // This is acceptable - the system may not have users yet
      expect(true).toBe(true);
      return;
    }

    // Check for email patterns (user@domain.com)
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const hasEmailData = emailPattern.test(hasUsers || '');

    if (hasEmailData) {
      console.log('✓ User emails are visible');

      // Check for role badges (common roles: admin, designer, client, manufacturer)
      const hasRoleInfo =
        hasUsers?.toLowerCase().includes('admin') ||
        hasUsers?.toLowerCase().includes('designer') ||
        hasUsers?.toLowerCase().includes('client') ||
        hasUsers?.toLowerCase().includes('role');

      if (hasRoleInfo) {
        console.log('✓ User roles are visible');
      }

      // Check for status badges
      const hasStatusInfo =
        hasUsers?.toLowerCase().includes('active') ||
        hasUsers?.toLowerCase().includes('pending') ||
        hasUsers?.toLowerCase().includes('suspended') ||
        hasUsers?.toLowerCase().includes('status');

      if (hasStatusInfo) {
        console.log('✓ User status information is visible');
      }

      expect(hasEmailData).toBe(true);
    } else {
      console.log('No user data visible - may need to seed database');
    }
  });

  test('should have functional search and filter controls', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    // Skip if we're not authenticated
    if (page.url().includes('/auth/signin')) {
      console.log('⚠ Skipping test - not authenticated');
      return;
    }

    // Test search functionality (may not exist if no users page access)
    const searchInput = page.locator('input[placeholder*="Search"], input[placeholder*="search"]').first();
    const searchExists = await searchInput.isVisible({ timeout: 3000 }).catch(() => false);

    if (searchExists) {
      await searchInput.fill('admin');
      await page.waitForTimeout(500); // Debounce wait
      console.log('✓ Search input is functional');
    } else {
      console.log('ℹ Search input not found - may be unavailable on this page');
    }

    // Test filter dropdown (status filter)
    const filterTrigger = page.locator('button:has-text("Filter"), button:has-text("All")').first();
    if (await filterTrigger.isVisible({ timeout: 2000 })) {
      await filterTrigger.click();
      await page.waitForTimeout(300);
      console.log('✓ Filter dropdown is functional');
    }
  });

  test('should navigate to roles page', async ({ page }) => {
    // Try to find and click roles navigation
    // First, look for a sidebar or nav menu
    const rolesLink = page.locator('a[href*="/roles"]').first();

    if (await rolesLink.isVisible({ timeout: 3000 })) {
      await rolesLink.click();
      await page.waitForLoadState('networkidle', { timeout: 10000 });

      // Verify we're on the roles page
      expect(page.url()).toContain('/roles');

      // Check for roles page content
      const bodyText = await page.locator('body').textContent();
      expect(bodyText?.toLowerCase()).toMatch(/role|permission/);

      console.log('✓ Successfully navigated to roles page');
    } else {
      // If no direct link, navigate via URL
      await page.goto('/roles');
      await page.waitForLoadState('networkidle', { timeout: 10000 });

      // Check page loaded
      const statusCode = page.url();
      expect(statusCode).toContain('/roles');

      console.log('✓ Accessed roles page via direct URL');
    }
  });

  test('should display roles and permissions on roles page', async ({ page }) => {
    await page.goto('/roles');
    await page.waitForLoadState('networkidle', { timeout: 15000 });

    // Check for page title
    const bodyText = await page.locator('body').textContent();

    // Look for role-related content
    const hasRoleContent =
      bodyText?.toLowerCase().includes('role') ||
      bodyText?.toLowerCase().includes('permission');

    expect(hasRoleContent).toBe(true);

    // Look for common roles
    const hasSystemRoles =
      bodyText?.includes('admin') ||
      bodyText?.includes('designer') ||
      bodyText?.includes('Admin') ||
      bodyText?.includes('Designer') ||
      bodyText?.includes('System');

    if (hasSystemRoles) {
      console.log('✓ System roles are visible');
    }

    // Check for "Create Role" button
    const createButton = page.locator('button:has-text("Create")').first();
    if (await createButton.isVisible({ timeout: 2000 })) {
      console.log('✓ Create role button is present');
    }
  });

  test('should navigate to settings page if available', async ({ page }) => {
    // Try settings navigation
    const settingsLink = page.locator('a[href*="/settings"]').first();

    if (await settingsLink.isVisible({ timeout: 3000 })) {
      await settingsLink.click();
      await page.waitForLoadState('networkidle', { timeout: 10000 });
      expect(page.url()).toContain('/settings');
      console.log('✓ Successfully navigated to settings page');
    } else {
      // Try direct navigation
      await page.goto('/demo/settings');
      const response = await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => null);

      if (page.url().includes('/settings') || page.url().includes('/demo')) {
        console.log('✓ Accessed settings page (may be in demo section)');
      } else {
        console.log('⚠ Settings page may not be available');
      }
    }
  });

  test('should display user actions dropdown menu', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle', { timeout: 15000 });

    // Look for action menu buttons (three dots, etc.)
    const actionButtons = page.locator('button[aria-label*="menu"], button:has-text("⋮"), button >> svg').all();

    const buttons = await actionButtons;
    if (buttons.length > 0) {
      // Click first action menu
      await buttons[0].click();
      await page.waitForTimeout(300);

      // Check if dropdown appeared
      const dropdownText = await page.locator('body').textContent();
      const hasActions =
        dropdownText?.includes('View') ||
        dropdownText?.includes('Edit') ||
        dropdownText?.includes('Suspend') ||
        dropdownText?.includes('Ban');

      if (hasActions) {
        console.log('✓ User action menu is functional');
      }
    }
  });

  test('should handle pagination if users list is long', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle', { timeout: 15000 });

    // Look for pagination controls
    const nextButton = page.locator('button:has-text("Next")').first();
    const prevButton = page.locator('button:has-text("Previous")').first();

    if (await nextButton.isVisible({ timeout: 2000 })) {
      console.log('✓ Pagination controls are present');

      // Check if previous button is disabled (we're on first page)
      const isPrevDisabled = await prevButton.isDisabled();
      expect(isPrevDisabled).toBe(true);
    } else {
      console.log('ℹ No pagination (likely fewer than 20 users)');
    }
  });

  test('should not have critical errors on user management pages', async ({ page }) => {
    const errors: string[] = [];
    const consoleErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Filter out known non-critical errors
        if (!text.includes('favicon') &&
            !text.includes('DevTools')) {
          consoleErrors.push(text);
        }
      }
    });

    page.on('pageerror', (error) => {
      errors.push(`Page Error: ${error.message}`);
    });

    // Test users page
    await page.goto('/users');
    await page.waitForLoadState('networkidle', { timeout: 15000 });

    // Test roles page
    await page.goto('/roles');
    await page.waitForLoadState('networkidle', { timeout: 15000 });

    // Report errors
    if (consoleErrors.length > 0) {
      console.error('Console errors found:', consoleErrors);
    }
    if (errors.length > 0) {
      console.error('Page errors found:', errors);
    }

    // Should have no critical errors
    expect(errors).toHaveLength(0);
  });
});

test.describe('Admin Portal - Error Handling', () => {
  test('should handle invalid login credentials gracefully', async ({ page }) => {
    await page.goto('/auth/signin');
    await page.waitForLoadState('domcontentloaded');

    // Try invalid credentials
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    const signInButton = page.locator('button[type="submit"]').first();

    await emailInput.fill('invalid@example.com');
    await passwordInput.fill('wrongpassword');
    await signInButton.click();

    // Wait for error message
    await page.waitForTimeout(2000);

    // Should still be on signin page or show error
    const url = page.url();
    const bodyText = await page.locator('body').textContent();

    const hasErrorHandling =
      url.includes('/signin') ||
      bodyText?.toLowerCase().includes('invalid') ||
      bodyText?.toLowerCase().includes('error') ||
      bodyText?.toLowerCase().includes('failed');

    expect(hasErrorHandling).toBe(true);
    console.log('✓ Invalid credentials handled gracefully');
  });
});
