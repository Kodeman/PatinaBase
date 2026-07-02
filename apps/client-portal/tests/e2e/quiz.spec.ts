import { test, expect } from '@playwright/test';

/**
 * The Aesthete style quiz — anon walk (Wave 3A, design §7.1).
 *
 * Requires: dev server on :3002 AND the local Supabase stack (quiz RPCs from
 * 00243, match RPC from 00244, seeded catalog). Pure anon — no sign-in.
 *
 * NOTE on rate limits: submit_style_quiz allows 3 submissions/hour/session_key
 * and 10/hour/IP. localStorage is fresh per Playwright context (fresh session
 * key each run), but repeated local runs can trip the IP backstop — a
 * rate-limited run is a environment condition, not a product bug.
 */

test.describe('Style quiz → results (anonymous)', () => {
  test('/quiz serves anonymously — no auth redirect', async ({ page }) => {
    const response = await page.goto('/quiz');
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/quiz$/); // stayed put (no /auth/signin bounce)
    await expect(page.locator('[data-quiz-question]')).toBeVisible();
  });

  test('five questions → submit → results with profile, matches, and whys', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/quiz');

    // Q1 visual resonance (single)
    await page.locator('[data-quiz-option="warm_minimal"]').click();
    await page.locator('[data-quiz-next]').click();

    // Q2 lifestyle (multi)
    await page.locator('[data-quiz-option="family"]').click();
    await page.locator('[data-quiz-option="entertaining"]').click();
    await page.locator('[data-quiz-next]').click();

    // Q3 material
    await page.locator('[data-quiz-option="weathered_oak"]').click();
    await page.locator('[data-quiz-next]').click();

    // Q4 investment
    await page.locator('[data-quiz-option="heirloom"]').click();
    await page.locator('[data-quiz-next]').click();

    // Q5 catalyst → submit
    await page.locator('[data-quiz-option="new_home"]').click();
    await page.locator('[data-quiz-submit]').click();

    // Results: profile panel (from the stashed submit response)
    await expect(page).toHaveURL(/\/quiz\/results$/, { timeout: 20_000 });
    await expect(page.locator('[data-quiz-profile]')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-spectrum]')).toHaveCount(6);

    // Matches: ten cards, each with server-phrased reasons; no raw scores.
    const cards = page.locator('[data-match-card]');
    await expect(cards).toHaveCount(10, { timeout: 20_000 });
    await expect(page.locator('[data-match-reasons]').first()).toBeVisible();

    // Copy law (§10.6): the visible page never says "AI".
    const bodyText = (await page.locator('body').innerText()) ?? '';
    expect(bodyText).not.toMatch(/\bAI\b/);

    // Anonymous visitor sees the save-profile CTA (claim-on-signup handoff).
    await expect(page.locator('[data-quiz-signup-cta]')).toBeVisible();
  });

  test('/quiz/results without a session key offers the quiz', async ({ page }) => {
    await page.goto('/quiz/results');
    await expect(page.getByRole('link', { name: 'Take the quiz' })).toBeVisible();
  });
});
