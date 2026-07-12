import { test, expect, Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Mission Control · Approval Inbox smoke (WP-1.1)
//
// Chromium-only (repo e2e trap: run with --project=chromium). Drives the
// keyboard-first review loop end to end against the seeded local queue
// (supabase/seed/agent-tasks-dev.sql), then the Leah brand-score deck. DB-level
// decision verification (review_state + agent_task_audit) is asserted separately
// via psql after this run.
// ─────────────────────────────────────────────────────────────────────────────

const ADMIN_EMAIL = 'admin@patina.dev';
const ADMIN_PASSWORD = 'password123';

async function signInAsAdmin(page: Page) {
  await page.goto('/auth/signin');
  await page.waitForLoadState('domcontentloaded');

  // Expand the email/password form and sign in with the seeded admin account.
  await page.locator('button:has-text("Sign in with email")').first().click();
  await page.waitForSelector('input[type="email"]', { timeout: 5000 });
  await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/auth/signin'), { timeout: 20000 });
}

test.describe('Mission Control — Approval Inbox', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
  });

  test('keyboard review loop: navigate, expand, reject-with-note, approve', async ({ page }) => {
    await page.goto('/mission-control');

    const inbox = page.getByTestId('approval-inbox');
    await expect(inbox).toBeVisible({ timeout: 15000 });

    const cards = page.getByTestId('approval-card');
    await expect(cards.first()).toBeVisible();
    const startCount = await cards.count();
    expect(startCount).toBeGreaterThan(1);

    // Default selection is the first row.
    await expect(cards.nth(0)).toHaveAttribute('data-selected', 'true');

    // j j → third row selected; k → second row selected.
    await page.keyboard.press('j');
    await page.keyboard.press('j');
    await expect(cards.nth(2)).toHaveAttribute('data-selected', 'true');
    await page.keyboard.press('k');
    await expect(cards.nth(1)).toHaveAttribute('data-selected', 'true');

    // Enter expands the selected row's evidence pack.
    await page.keyboard.press('Enter');
    await expect(cards.nth(1)).toHaveAttribute('data-expanded', 'true');
    await expect(cards.nth(1).getByTestId('approval-evidence')).toBeVisible();

    // Capture the id of the currently-selected row (what the keyboard acts on).
    const selectedCard = page.locator('[data-testid="approval-card"][data-selected="true"]');
    const rejectedId = await selectedCard.getAttribute('data-task-id');
    expect(rejectedId).toBeTruthy();

    // r opens the reject popover; submitting with no note is blocked.
    await page.keyboard.press('r');
    const popover = page.getByTestId('reject-note-popover');
    await expect(popover).toBeVisible();
    await expect(popover.getByTestId('reject-note-submit')).toBeDisabled();

    // Type a unique note → submit enabled → reject. Wait for the SERVER review
    // response (not just the optimistic UI removal) before asserting.
    const rejectNote = `E2E reject ${Date.now()}`;
    await popover.getByTestId('reject-note-textarea').fill(rejectNote);
    await expect(popover.getByTestId('reject-note-submit')).toBeEnabled();
    const [rejectResp] = await Promise.all([
      page.waitForResponse(
        (r) => /\/api\/admin\/agent-tasks\/.+\/review$/.test(r.url()) && r.request().method() === 'POST',
      ),
      popover.getByTestId('reject-note-submit').click(),
    ]);
    expect(rejectResp.status()).toBe(200);
    await expect(cards).toHaveCount(startCount - 1, { timeout: 10000 });

    // a on the now-selected row (focus landed on the next row) approves it —
    // again await the server response.
    await expect(cards.nth(0)).toBeVisible();
    const approvedId = await selectedCard.getAttribute('data-task-id');
    expect(approvedId).toBeTruthy();
    expect(approvedId).not.toBe(rejectedId);
    const [approveResp] = await Promise.all([
      page.waitForResponse(
        (r) => /\/api\/admin\/agent-tasks\/.+\/review$/.test(r.url()) && r.request().method() === 'POST',
      ),
      page.keyboard.press('a'),
    ]);
    expect(approveResp.status()).toBe(200);
    await expect(cards).toHaveCount(startCount - 2, { timeout: 10000 });

    // Surface the ids so the psql decision-verification step can assert them.
    console.log(`E2E_REJECTED_ID=${rejectedId}`);
    console.log(`E2E_APPROVED_ID=${approvedId}`);
    console.log(`E2E_REJECT_NOTE=${rejectNote}`);
  });

  test('Leah deck: one card per mobile viewport, score + approve advances', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/mission-control?assignee=leah');

    const deck = page.getByTestId('leah-review-deck');
    await expect(deck).toBeVisible({ timeout: 15000 });

    // Exactly one maker card is mounted at a time, with a score input.
    const card = page.getByTestId('leah-card');
    await expect(card).toHaveCount(1);
    await expect(card).toBeVisible();
    const scoreInput = page.getByTestId('leah-brand-score');
    await expect(scoreInput).toBeVisible();

    // The card fits within the viewport height (no scroll needed to reach it).
    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeLessThanOrEqual(844);

    const remainingBefore = await page.getByTestId('leah-remaining').textContent();

    const leahCardId = await card.getAttribute('data-task-id');

    // Score and approve → await the SERVER review response, then the deck advances.
    await scoreInput.fill('205');
    const [leahResp] = await Promise.all([
      page.waitForResponse(
        (r) => /\/api\/admin\/agent-tasks\/.+\/review$/.test(r.url()) && r.request().method() === 'POST',
      ),
      page.getByTestId('leah-approve').click(),
    ]);
    expect(leahResp.status()).toBe(200);

    await expect
      .poll(async () => (await page.getByTestId('leah-remaining').textContent())?.trim(), {
        timeout: 10000,
      })
      .not.toBe(remainingBefore?.trim());

    console.log(`E2E_LEAH_APPROVED_ID=${leahCardId}`);
  });
});
