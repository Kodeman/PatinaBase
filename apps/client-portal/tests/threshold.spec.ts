import { test, expect, type Page } from '@playwright/test';

/**
 * The Threshold (spec §7) — the homeowner's project page as ONE chrome-less
 * page, driven against the LOCAL stack and the solo-client fixture that
 * supabase/seed/the-client-page.sql lays on `client-solo@patina.dev`.
 *
 * That client owns exactly one house on purpose. The chrome gate and the route
 * collapse both stand down for a client with two or more projects — the
 * Threshold is one project's story, and a client with several keeps the header
 * because it is the only project switcher there is. This file therefore seeds
 * NOTHING and parks NOTHING: it reads the fixture as the seed laid it, so it
 * can run beside every other spec without moving the ground under them.
 *
 * Every figure asserted below is one the seed put in the database, not a number
 * copied out of the mockup — the unit suite's five facts come from its own
 * fixture and are deliberately different.
 *
 * Runs only under `--project=threshold`, against the flag-overridden server on
 * :3102 (playwright.config.ts). The default project ignores this file.
 */

const PROJECT_ID = 'b0000000-0000-0000-0000-00000000c0d1';

/* ── The five facts, read off the seed ──────────────────────────────────────
   1 · Authorization No. 1, signed — the FROZEN client figure on
       furnishing_authorization_items (812000c), never the studio's live
       project_ffe_items row (780000c)                          → $8,120
   2 · the maker whose finished work waits: trade_scope_terms
       .party_display_name                                      → Marta Voss
   3 · the joinery held back until she accepts it: the trade scope's
       client_price_cents (298000c)                             → $2,980
   4 · invoice INV-2026-0301, sent and unpaid: 406000c due 2026-09-11
   ────────────────────────────────────────────────────────────────────────── */
const AUTHORIZATION_TOTAL = '$8,120';
const LIVE_WORKING_FIGURE = '$7,800';
const MAKER = 'Marta Voss';
const HELD_DRAW = '$2,980';
const INVOICE_BALANCE = '$4,060';
const INVOICE_DUE_DAY = 'September 11';

const STANDING_NOTE_BODY =
  'The shelving is up and oiled. Look at it when you can, and if it reads right I will have Marta move on to the hall.';

/** Rooms the drawing must key, in the order the seed gives them. */
const SEEDED_ROOMS = ['Study', 'Hall', 'Stair'];

/**
 * Signs in as the seeded solo household. The golden-hour restyle made sign-in
 * email-first: the password leg sits behind a disclosure, and submitting
 * without opening it sends a six-digit passcode instead. Same shape as
 * tests/gate-ceremony.spec.ts.
 */
async function signInAsClient(page: Page): Promise<void> {
  await page.goto('/auth/signin');
  const disclosure = page.getByRole('button', {
    name: /sign in with email|use email and password instead/i,
  });
  await disclosure.first().waitFor({ state: 'visible', timeout: 60_000 });
  await disclosure.first().click();
  await page.getByLabel(/email/i).first().fill('client-solo@patina.dev');
  await page.getByLabel(/password/i).first().fill('password123');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/auth/signin'), {
    timeout: 60_000,
  });
}

async function openTheHouse(page: Page): Promise<void> {
  await page.goto(`/projects/${PROJECT_ID}`);
  await expect(page.getByTestId('doorplate')).toBeVisible({ timeout: 60_000 });
}

test.describe.configure({ timeout: 180_000 });

test.describe('The Threshold — the client page', () => {
  test('opens chrome-less, with the house named on the doorplate', async ({ page }) => {
    await signInAsClient(page);
    await openTheHouse(page);

    // The global client header is gone entirely. It carries no single testid,
    // so this asserts on the whole family it renders — nav links, the more
    // menu, the user menu — every one of them absent.
    await expect(page.locator('[data-testid^="header-"]')).toHaveCount(0);

    await expect(page.getByTestId('doorplate-title')).toHaveText('Cedar Lane Study');
  });

  test('prints the five facts the seed put in the house', async ({ page }) => {
    await signInAsClient(page);
    await openTheHouse(page);

    const body = page.locator('body');

    // 1 · what she authorized, at the figure she put her name to — and never
    //     the studio's live working row.
    await expect(body).toContainText(AUTHORIZATION_TOTAL);
    await expect(body).not.toContainText(LIVE_WORKING_FIGURE);
    // 2 · the maker whose finished work is waiting on her word
    await expect(body).toContainText(MAKER);
    // 3 · the draw held back until she accepts it
    await expect(body).toContainText(HELD_DRAW);
    // 4 · the balance, and the day it falls due
    await expect(page.getByTestId('letterbox-body')).toContainText(INVOICE_BALANCE);
    await expect(page.getByTestId('letterbox-body')).toContainText(INVOICE_DUE_DAY);
    // 5 · the chapter the house stands in, named on the doorplate
    await expect(page.getByTestId('doorplate-sub')).not.toBeEmpty();
  });

  test('draws the key with one link per seeded room', async ({ page }) => {
    await signInAsClient(page);
    await openTheHouse(page);

    const key = page.locator('svg[role="group"]');
    await expect(key).toHaveCount(1);

    for (const room of SEEDED_ROOMS) {
      await expect(key.locator('a[href^="#room-"]', { hasText: room })).toHaveCount(1);
    }
    // One anchor per room, and no more.
    await expect(key.locator('a[href^="#room-"]')).toHaveCount(SEEDED_ROOMS.length);
  });

  test('stands the standing note on the page, in the designer’s own words', async ({
    page,
  }) => {
    await signInAsClient(page);
    await openTheHouse(page);

    await expect(page.getByTestId('note-body')).toHaveText(STANDING_NOTE_BODY);
  });

  test('collapses /invoices onto the letterbox on the one project page', async ({
    page,
  }) => {
    await signInAsClient(page);
    await page.goto('/invoices');

    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 30_000 })
      .toBe(`/projects/${PROJECT_ID}`);
    await expect.poll(() => new URL(page.url()).hash).toBe('#letterbox');
    await expect(page.getByTestId('letterbox')).toBeVisible();
  });
});
