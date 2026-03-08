import { test, expect } from '@playwright/test';

/**
 * Page Structure Validation Tests
 * Ensures pages have proper structure and key elements
 */

test.describe('Page Structure Validation', () => {
  test('Homepage has proper structure', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Check basic HTML structure
    const htmlTag = await page.locator('html').count();
    expect(htmlTag).toBe(1);

    const bodyTag = await page.locator('body').count();
    expect(bodyTag).toBe(1);

    // Check that page has some content
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(0);

    console.log(`Homepage body text length: ${bodyText!.length} characters`);
  });

  test('Sign In page has form elements', async ({ page }) => {
    await page.goto('/auth/signin');
    await page.waitForLoadState('domcontentloaded');

    const bodyText = await page.locator('body').textContent();
    expect(bodyText).toBeTruthy();

    // Check for common signin elements
    const hasInputs = await page.locator('input').count();
    const hasButtons = await page.locator('button').count();

    console.log(`\nSign In Page Structure:`);
    console.log(`  - Input fields: ${hasInputs}`);
    console.log(`  - Buttons: ${hasButtons}`);
    console.log(`  - Body text length: ${bodyText!.length} characters`);

    // Should have at least some interactive elements
    expect(hasInputs + hasButtons).toBeGreaterThan(0);
  });

  test('Protected pages redirect to signin', async ({ page }) => {
    const protectedRoutes = [
      '/dashboard',
      '/users',
      '/catalog',
      '/settings',
    ];

    for (const route of protectedRoutes) {
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');

      const currentUrl = page.url();
      expect(currentUrl).toContain('/auth/signin');
      console.log(`${route} → ${currentUrl} ✓`);
    }
  });

  test('Check for Next.js hydration', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    // Check if React is loaded
    const hasReact = await page.evaluate(() => {
      return typeof (window as any).React !== 'undefined' ||
             typeof (window as any).__NEXT_DATA__ !== 'undefined';
    });

    console.log(`Next.js data available: ${hasReact}`);

    // Check for Next.js scripts
    const scripts = await page.locator('script').count();
    console.log(`Total script tags: ${scripts}`);

    expect(scripts).toBeGreaterThan(0);
  });

  test('Verify meta tags and SEO elements', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const title = await page.title();
    console.log(`\nPage Title: "${title}"`);

    const metaTags = await page.locator('meta').count();
    console.log(`Meta tags: ${metaTags}`);

    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(0);
  });

  test('Check for CSS and styling', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Check for style tags or link tags (CSS)
    const styleTags = await page.locator('style').count();
    const linkTags = await page.locator('link[rel="stylesheet"]').count();

    console.log(`\nStyling Elements:`);
    console.log(`  - Style tags: ${styleTags}`);
    console.log(`  - CSS link tags: ${linkTags}`);

    // Next.js typically uses styled-jsx or has at least some CSS
    expect(styleTags + linkTags).toBeGreaterThan(0);
  });

  test('Verify no 404 errors on main routes', async ({ page }) => {
    const routes = ['/', '/auth/signin', '/auth/error'];

    for (const route of routes) {
      const response = await page.goto(route);
      const status = response?.status();

      console.log(`${route} - Status: ${status}`);

      expect(status).toBeLessThan(404);
    }
  });

  test('Check response headers', async ({ page }) => {
    const response = await page.goto('/');
    const headers = response?.headers();

    console.log(`\nResponse Headers:`);
    console.log(`  - content-type: ${headers?.['content-type']}`);
    console.log(`  - x-powered-by: ${headers?.['x-powered-by']}`);

    expect(headers?.['content-type']).toContain('text/html');
  });
});
