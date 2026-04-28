import { test, expect } from '../fixtures/auth';

/**
 * Client Directory Navigation
 *
 * Verifies that clicking a client row in the directory:
 *   1. Navigates to /portal/clients/<uuid>  (real anchor, not a JS click)
 *   2. The resulting page header shows the client's display name (NOT the raw UUID)
 *   3. Any breadcrumb in the SubNav chrome also shows the display name
 *
 * NOTE: The dev server must be running (`pnpm dev:designer`) and Supabase
 * must be seeded (`pnpm supabase:start && pnpm supabase db reset`) before
 * running this spec.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Matches href="/portal/clients/<uuid>" where uuid has standard hex-dash pattern
const CLIENT_UUID_HREF_RE = /^\/portal\/clients\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

test.describe('Client Directory — navigation', () => {
  test('clicking a client row navigates to the client detail page', async ({ authenticatedPage: page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await page.goto('/portal/clients', {
      waitUntil: 'networkidle',
      timeout: 60_000,
    });
    await page.waitForLoadState('networkidle', { timeout: 30_000 });

    // Confirm we're on the directory page
    await expect(page.getByRole('heading', { name: /^Clients$/i, level: 1 })).toBeVisible({ timeout: 15_000 });

    // ClientListItem now renders as <Link href="/portal/clients/{uuid}">
    // Use CSS attribute selector that only matches UUID-shaped hrefs (not /clients/new etc.)
    // We filter with a JS predicate to ensure the href is exactly a UUID path
    const allClientHrefLinks = await page.locator('a').all();
    let firstClientLink: import('@playwright/test').Locator | null = null;
    let clientId = '';

    for (const link of allClientHrefLinks) {
      const href = await link.getAttribute('href');
      if (href && CLIENT_UUID_HREF_RE.test(href)) {
        firstClientLink = link;
        clientId = href.split('/').pop() ?? '';
        break;
      }
    }

    // There should be at least one client row (seed data creates client@patina.dev)
    expect(firstClientLink).not.toBeNull();
    expect(UUID_RE.test(clientId)).toBe(true);

    // Get the display name from the aria-label (format: "<name>, link") or text content
    const ariaLabel = await firstClientLink!.getAttribute('aria-label');
    // Extract name: "Client User, link" → "Client User"
    const clientName = ariaLabel?.replace(/,\s*link$/i, '').trim() ?? '';

    // Click the link
    await firstClientLink!.click();

    // Assert URL changed to /portal/clients/<uuid>
    await page.waitForURL(`/portal/clients/${clientId}`, { timeout: 30_000 });
    expect(page.url()).toContain(`/portal/clients/${clientId}`);

    await page.waitForLoadState('networkidle', { timeout: 30_000 });

    // Page header should show the client's display name, NOT the raw UUID
    const h1 = page.getByRole('heading', { level: 1 }).first();
    await expect(h1).toBeVisible({ timeout: 15_000 });
    const h1Text = (await h1.innerText()).trim();
    expect(UUID_RE.test(h1Text)).toBe(false);
    expect(h1Text.length).toBeGreaterThan(0);

    // If we captured a name from aria-label, verify it matches the heading
    if (clientName.length > 0) {
      expect(h1Text.toLowerCase()).toContain(clientName.toLowerCase().split(' ')[0]);
    }

    // Breadcrumb in the SubNav chrome: the UUID segment should be resolved to
    // the client display name (not the title-cased UUID fragments).
    // The SubNav renders a breadcrumb link with href="/portal/clients/{uuid}" on deep pages.
    // On /portal/clients/{uuid} (top-level client page), it may or may not be a "deep" page.
    // We navigate to /portal/clients/{uuid}/messages to trigger the deep page + breadcrumb.
    await page.goto(`/portal/clients/${clientId}/messages`, {
      waitUntil: 'networkidle',
      timeout: 30_000,
    });
    await page.waitForLoadState('networkidle', { timeout: 30_000 });

    const clientBreadcrumbLink = page.locator(`a[href="/portal/clients/${clientId}"]`).first();
    const breadcrumbLinkCount = await clientBreadcrumbLink.count();
    expect(breadcrumbLinkCount, 'Expected SubNav breadcrumb link for client to be present on deep page').toBeGreaterThan(0);
    await expect(clientBreadcrumbLink).toBeVisible({ timeout: 10_000 });
    const breadcrumbText = (await clientBreadcrumbLink.innerText()).trim();
    // Must NOT be a raw UUID
    expect(UUID_RE.test(breadcrumbText)).toBe(false);
    expect(breadcrumbText.length).toBeGreaterThan(0);

    expect(pageErrors, `Unhandled page errors: ${pageErrors.map((e) => e.message).join(' | ')}`).toHaveLength(0);
  });

  test('visiting /portal/clients?add=1 auto-opens the Add Client dialog', async ({ authenticatedPage: page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await page.goto('/portal/clients?add=1', {
      waitUntil: 'networkidle',
      timeout: 60_000,
    });
    await page.waitForLoadState('networkidle', { timeout: 30_000 });

    // The page should still be the Clients directory
    await expect(page.getByRole('heading', { name: /^Clients$/i, level: 1 })).toBeVisible({ timeout: 15_000 });

    // The Add Client dialog (inline form) should be visible — identified by its <h2>Add Client</h2>
    await expect(page.getByRole('heading', { name: /^Add Client$/i, level: 2 })).toBeVisible({ timeout: 10_000 });

    expect(pageErrors, `Unhandled page errors: ${pageErrors.map((e) => e.message).join(' | ')}`).toHaveLength(0);
  });
});
