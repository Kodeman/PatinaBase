import { test, expect } from '../fixtures/auth';

/**
 * Client messaging thread — Playwright e2e
 *
 * Prerequisites:
 *   - `pnpm dev:designer` (or `pnpm dev`) is running on localhost:3000
 *   - Local Supabase is up with seed data applied
 *     (`supabase/seed/messages.sql` must be applied — `pnpm supabase db reset` applies all seeds)
 *
 * Primary test designer_client_id:
 *   f2c46a9a-b525-4e3c-872e-f5289ecc3bdc  (designer@patina.dev ↔ client@patina.dev)
 */

const DESIGNER_CLIENT_ID = 'f2c46a9a-b525-4e3c-872e-f5289ecc3bdc';
const THREAD_URL = `/portal/clients/${DESIGNER_CLIENT_ID}/messages`;

// Run tests serially — each needs a fresh auth session and they share the dev
// server; running all four in parallel overloads the sign-in flow (networkidle
// stalls when 4 browsers all hit /auth/signin simultaneously).
test.describe.configure({ mode: 'serial' });

test.describe('Client message thread', () => {
  // Auth setup (sign-in UI flow) can take up to ~45 s; bump the per-test timeout.
  test.setTimeout(90_000);

  test('renders seeded messages with date dividers and bubbles', async ({ authenticatedPage: page }) => {
    await page.goto(THREAD_URL, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 20_000 });

    // At least one date divider should be visible — seeded messages span multiple days
    const dateDividers = page.locator('text=/April|Today|Yesterday/');
    await expect(dateDividers.first()).toBeVisible({ timeout: 10_000 });

    // Empty-state copy must NOT be shown
    await expect(page.getByText('No messages yet. Start the conversation below.')).not.toBeVisible();

    // At least one message bubble body text (seeded designer opening message)
    await expect(
      page.getByText(/I'm thrilled to be working on the Aspen Loft/i)
    ).toBeVisible({ timeout: 10_000 });
  });

  test('quick-reply chip pre-fills compose input', async ({ authenticatedPage: page }) => {
    await page.goto(THREAD_URL, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 20_000 });

    // Click the "Schedule visit" quick-reply chip
    const chip = page.getByRole('button', { name: 'Schedule visit' });
    await expect(chip).toBeVisible({ timeout: 10_000 });
    await chip.click();

    // Compose input should now contain the chip text
    const composeInput = page.getByPlaceholder('Type a message…');
    await expect(composeInput).toHaveValue('Schedule visit', { timeout: 5_000 });
  });

  test('send a message — new bubble appears in thread', async ({ authenticatedPage: page }) => {
    await page.goto(THREAD_URL, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 20_000 });

    // Use a unique string so re-runs don't confuse each other
    const uniqueText = `e2e-test-${Date.now()}`;

    const composeInput = page.getByPlaceholder('Type a message…');
    await composeInput.fill(uniqueText);
    await expect(composeInput).toHaveValue(uniqueText);

    await page.getByRole('button', { name: 'Send', exact: true }).click();

    // Input should clear after successful send
    await expect(composeInput).toHaveValue('', { timeout: 5_000 });

    // The new message text should appear as a bubble in the thread
    await expect(page.getByText(uniqueText)).toBeVisible({ timeout: 10_000 });
  });

  test('inbox click-through navigates to thread', async ({ authenticatedPage: page }) => {
    await page.goto('/portal/messages', { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 20_000 });

    // The inbox should list at least one conversation row (Client User)
    const conversationRow = page.getByText('Client User').first();
    await expect(conversationRow).toBeVisible({ timeout: 10_000 });

    // Click the row — the entire div has an onClick handler routing to the thread
    await conversationRow.click();

    // URL should transition to /portal/clients/{uuid}/messages
    await page.waitForURL(/\/portal\/clients\/[0-9a-f-]+\/messages/, { timeout: 10_000 });

    const currentUrl = page.url();
    expect(currentUrl).toMatch(/\/portal\/clients\/[0-9a-f-]+\/messages/);
  });
});
