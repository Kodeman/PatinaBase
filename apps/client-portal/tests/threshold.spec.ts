import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * The Threshold (spec §7) — the homeowner's project page as ONE chrome-less
 * page, driven against the LOCAL stack and the fixtures the seeds lay down:
 * `supabase/seed/the-client-page.sql` for the solo household on
 * `client-solo@patina.dev`, and `dev-accounts.sql` + its neighbours for the
 * three-house client on `client@patina.dev`.
 *
 * The solo client owns exactly one house on purpose — not because the surface
 * differs by project count (it no longer does: every client gets the
 * chrome-less house, and the mat names her other houses), but because the
 * figures below are that fixture's. This file seeds NOTHING and parks
 * NOTHING: it reads the fixtures as the seeds laid them, so it can run beside
 * every other spec without moving the ground under them. The one exception is
 * the write-back, which adds a letter to a thread and says so where it does it.
 *
 * Every figure asserted below is one the seed put in the database, not a number
 * copied out of the mockup — the unit suite's five facts come from its own
 * fixture and are deliberately different.
 *
 * Wave 2 collapsed the two-server split: the `threshold` flag is gone, no code
 * reads it, and this file now runs in the single default project against the
 * one server on :3002 (playwright.config.ts).
 */

const PROJECT_ID = 'b0000000-0000-0000-0000-00000000c0d1';
/** Aspen Loft Refresh — the three-house client's house that carries a thread. */
const MULTI_PROJECT_ID = 'b0000000-0000-0000-0000-0000000000d1';
/** Every other house `client@patina.dev` keeps, so the mat's count is exact. */
const MULTI_OTHER_HOUSE_COUNT = 2;

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
 * Signs in as a seeded household. The golden-hour restyle made sign-in
 * email-first: the password leg sits behind a disclosure, and submitting
 * without opening it sends a six-digit passcode instead. Same shape as
 * tests/gate-ceremony.spec.ts.
 */
/**
 * Press an act until the thing it opens is actually there. Every section of
 * the Threshold is server-rendered before React attaches, so a click that
 * lands in that window is swallowed with no error at all — the button is
 * painted, the handler is not yet on it. This is the one honest way to drive
 * an unfold from outside the app.
 */
async function pressUntilOpen(act: Locator, opened: Locator): Promise<void> {
  await expect(async () => {
    await act.waitFor({ state: 'visible', timeout: 30_000 });
    await act.click();
    await opened.waitFor({ state: 'visible', timeout: 5_000 });
  }).toPass({ timeout: 120_000 });
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/auth/signin', { waitUntil: 'domcontentloaded' });

  // The disclosure is server-rendered before React attaches to it, so a click
  // that lands early is swallowed silently — the button is there, the handler
  // is not. Press it until the password leg it controls actually opens.
  const disclosure = page
    .getByRole('button', {
      name: /sign in with email|use email and password instead/i,
    })
    .first();
  const password = page.getByLabel(/password/i).first();
  await expect(async () => {
    await disclosure.waitFor({ state: 'visible', timeout: 30_000 });
    await disclosure.click();
    await password.waitFor({ state: 'visible', timeout: 5_000 });
  }).toPass({ timeout: 120_000 });

  await page.getByLabel(/email/i).first().fill(email);
  await password.fill('password123');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  // `domcontentloaded`, not `load`: the dev server holds connections open past
  // the document, so a `load` that never fires is not a signal. Every caller
  // waits on a rendered testid next, which is the real settling point.
  await page.waitForURL((url) => !url.pathname.includes('/auth/signin'), {
    timeout: 60_000,
    waitUntil: 'domcontentloaded',
  });
}

async function signInAsClient(page: Page): Promise<void> {
  await signIn(page, 'client-solo@patina.dev');
}

/**
 * Wait for the settle gate to let go. `threshold.tsx` holds the whole house —
 * everything below the doorplate — behind `threshold-hold` until the papers,
 * the goods, the ledger, the rooms AND the letter have all answered, because
 * "Nothing in the letterbox" is an assertion and not a blank. A doorplate on
 * screen is therefore NOT the page; the absence of the hold is.
 */
async function settle(page: Page): Promise<void> {
  await expect(page.getByTestId('doorplate')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('threshold-hold')).toHaveCount(0, { timeout: 90_000 });
}

async function openTheHouse(page: Page): Promise<void> {
  await page.goto(`/projects/${PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
  await settle(page);
}

/** The header carries no single testid, so absence is asserted on the family. */
async function expectNoHeader(page: Page): Promise<void> {
  await expect(page.locator('[data-testid^="header-"]')).toHaveCount(0);
}

test.describe.configure({ timeout: 180_000 });

test.describe('The Threshold — the client page', () => {
  test('opens chrome-less, with the house named on the doorplate', async ({ page }) => {
    await signInAsClient(page);
    await openTheHouse(page);

    // The global client header is gone entirely. It carries no single testid,
    // so this asserts on the whole family it renders — nav links, the more
    // menu, the user menu — every one of them absent.
    await expectNoHeader(page);

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

  /* ── Wave 2: the front door ─────────────────────────────────────────────── */

  test('lands the solo client on “/” — her one house, and no header over it', async ({
    page,
  }) => {
    await signInAsClient(page);

    // CLIENT_AUTH_DESTINATION is `/` now, so sign-in lands here without a hop
    // through the retired list. `/` is unmapped, so nothing collapses it away.
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 60_000 }).toBe('/');
    await settle(page);
    await expect(page.getByTestId('doorplate-title')).toHaveText('Cedar Lane Study');
    await expectNoHeader(page);
    // The same one page, whole: the letterbox and the mat are on `/`, not
    // behind a route.
    await expect(page.getByTestId('letterbox')).toBeVisible();
    await expect(page.getByTestId('mat')).toBeVisible();
  });

  test('names the other houses on the mat for a client who keeps several', async ({
    page,
  }) => {
    await signIn(page, 'client@patina.dev');

    await expect.poll(() => new URL(page.url()).pathname, { timeout: 60_000 }).toBe('/');
    await settle(page);
    await expect(page.getByTestId('doorplate-title')).not.toBeEmpty();
    await expectNoHeader(page);

    // The doorplate names the house she is standing in; the mat names the rest.
    const others = page.getByTestId('mat-other-houses');
    await expect(others).toBeVisible();
    await expect(others.getByRole('heading', { name: 'Your other houses' })).toBeVisible();
    await expect(others.locator('a[href^="/projects/"]')).toHaveCount(
      MULTI_OTHER_HOUSE_COUNT,
    );
    // Read as lines, never as acts — and never the house she is already in.
    const standingIn = new URL(page.url()).pathname;
    for (const href of await others.locator('a').evaluateAll((links) =>
      links.map((link) => link.getAttribute('href')),
    )) {
      expect(href).not.toBe(standingIn);
    }
  });

  /* ── Wave 2: the acts, in place ─────────────────────────────────────────── */

  test('stands the acceptance ask on the wall, with its act ready', async ({ page }) => {
    await signInAsClient(page);
    await openTheHouse(page);

    // The seed carries no project-approval review for either client (checked
    // against list_my_project_decision_reviews on the reset stack), so the
    // doorstep's ApprovalAsk has nothing to answer and correctly renders
    // nothing. The ask this fixture DOES stand is the maker's finished work,
    // held at the wall until she puts her name to it — the same shape, the same
    // ceremony, and the only one an e2e can reach on this data.
    //
    // The act is asserted READY, not pressed: accepting is irreversible, and it
    // would take HELD_DRAW off the page for every later run of the spec above.
    await expect(page.getByTestId('doorstep-approval')).toHaveCount(0);

    const name = page.getByTestId('accept-trade-scope-name');
    await expect(name).toBeVisible();
    const accept = page.getByRole('button', { name: /accept the finished work/i });
    await expect(accept).toBeVisible();
    await expect(accept).toBeEnabled();
    await expect(page.getByTestId('wall-hint')).toContainText('Type your full name to accept');
  });

  test('settling the balance reaches the checkout start and returns to the letterbox', async ({
    page,
  }) => {
    await signInAsClient(page);
    await openTheHouse(page);

    // The till is mocked at the edge-function boundary: a real Stripe session
    // is not this suite's to claim, and the return URL is the contract worth
    // proving. The receipt shape is create-checkout-session's own
    // (parseInvoiceCheckoutReceipt refuses anything less).
    const checkoutCalls: string[] = [];
    await page.route('**/functions/v1/create-checkout-session', async (route) => {
      checkoutCalls.push(route.request().postData() ?? '');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          url: '/?checkout=success&invoice=b0000000-0000-0000-0000-00000000cc01',
          amount_cents: 406000,
          currency: 'usd',
          checkout_attempt_id: 'cka_e2e',
          payment_id: 'pay_e2e',
          session_id: 'cs_e2e',
          reused: false,
          surcharge_cents: 0,
          payment_method: 'us_bank_account',
        }),
      });
    });

    // The toll is the letter inside the envelope: the act only exists once the
    // letterbox is unfolded, which is the client's own first move.
    const settle = page.getByRole('button', { name: /settle the balance/i });
    await pressUntilOpen(
      page.getByTestId('letterbox').getByRole('button', { name: /open the letterbox/i }),
      settle,
    );
    await expect(settle).toBeEnabled({ timeout: 30_000 });
    await settle.click();

    // The act reached the checkout start, carrying the letter it means to pay.
    await expect.poll(() => checkoutCalls.length, { timeout: 30_000 }).toBe(1);
    expect(checkoutCalls[0]).toContain('b0000000-0000-0000-0000-00000000cc01');

    // And the till handed the browser back to this same address, where the
    // letterbox reads `?checkout=` once and says its one sentence.
    await expect(page.getByTestId('letterbox-receipt')).toBeVisible({ timeout: 30_000 });
    // The address is struck out on the way in — a refresh must never replay it.
    await expect
      .poll(() => new URL(page.url()).searchParams.get('checkout'), { timeout: 30_000 })
      .toBeNull();
  });

  test('writes back to the note, in place', async ({ page }) => {
    // The solo fixture has no comms thread, so WriteBack correctly renders
    // nothing there. Aspen Loft is the seeded house that carries one.
    //
    // MUTATES: this adds one letter to that thread. It is additive, it is the
    // only write in this file, and it is on the three-house client's house
    // rather than the solo fixture the assertions above read.
    await signIn(page, 'client@patina.dev');
    await page.goto(`/projects/${MULTI_PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
    await settle(page);

    const writeBack = page.getByTestId('write-back');
    await expect(writeBack).toBeVisible({ timeout: 60_000 });
    const body = page.getByTestId('write-back-body');
    await pressUntilOpen(writeBack.getByRole('button', { name: /write back/i }), body);
    await body.fill(`Read it, thank you. (e2e ${Date.now()})`);
    await page.getByRole('button', { name: /send it/i }).click();

    // The pen goes down and the house stamps the day — no route change, no
    // header, no error in red.
    await expect(page.getByTestId('write-back-receipt')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('write-back-refused')).toHaveCount(0);
    await expect(body).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe(`/projects/${MULTI_PROJECT_ID}`);
  });

  test('opens the papers as a sheet laid in the page, not a route', async ({ page }) => {
    await signInAsClient(page);
    await openTheHouse(page);

    const before = page.url();
    const sheet = page.getByTestId('papers-sheet');
    await pressUntilOpen(
      page.getByTestId('mat-papers').getByRole('button', { name: /the papers, in full/i }),
      sheet,
    );
    await expect(sheet).toHaveAttribute('role', 'dialog');
    // The seed's three executed instruments are the papers this house holds.
    await expect(page.getByTestId('papers-sheet-instruments')).toBeVisible();
    // Nothing left the page.
    expect(page.url()).toBe(before);
    await expectNoHeader(page);

    // Dismissed by the same tab that opened it (Esc closes; the page stays).
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe(`/projects/${PROJECT_ID}`);
  });

  /* ── Wave 2: the retired routes ─────────────────────────────────────────── */

  test('answers the retired routes with a 308 to the page anchor', async ({ page }) => {
    await signInAsClient(page);

    // `page.request` carries this context's cookies, so these are the signed-in
    // answers. maxRedirects:0 reads the redirect itself rather than its target.
    // The whole map, at the served-response level. The unit tests in
    // `src/__tests__/middleware.test.ts` cover the same table against the
    // module; this is the half that would catch a matcher, basePath or build
    // change that stops the middleware running at all.
    for (const [path, anchor] of [
      ['/today', '#doorstep'],
      ['/decisions', '#doorstep'],
      ['/reviews', '#doorstep'],
      ['/proposals', '#door'],
      ['/invoices', '#letterbox'],
      ['/budget', '#ledger'],
      ['/documents', '#mat-papers'],
      ['/orders', '#road'],
      ['/messages', '#note'],
      ['/inbox', '#note'],
      ['/account', '#mat'],
      ['/settings/notifications', '#mat'],
      ['/projects', ''],
    ] as const) {
      const response = await page.request.get(path, { maxRedirects: 0 });
      expect(response.status(), `${path} should be a permanent redirect`).toBe(308);
      const location = response.headers()['location'] ?? '';
      expect(new URL(location, 'http://localhost').pathname, `${path} → /`).toBe('/');
      if (anchor) {
        expect(location, `${path} keeps its anchor`).toContain(anchor);
      }
      // The fold carries this homeowner's refreshed session cookies, so it may
      // never be held by a shared cache.
      expect(
        response.headers()['cache-control'] ?? '',
        `${path} is privately cached`,
      ).toContain('private');
    }
  });

  // The `request` fixture is its own context with its own cookie jar and no
  // storageState, so this is the signed-out answer even inside a file whose
  // other tests sign in.
  test('answers /preferences/unsubscribe with no session at all', async ({ request }) => {
    // A recipient clicking out of an email usually has no session. Until the
    // cutover this page sat behind the sign-in wall, which put a wall in front
    // of an outcome page for an action already taken.
    const response = await request.get('/preferences/unsubscribe', { maxRedirects: 0 });
    expect(response.status(), 'no sign-in wall on the outcome page').toBe(200);
  });

  test('collapses /invoices onto the letterbox on the one page', async ({ page }) => {
    await signInAsClient(page);
    await page.goto('/invoices', { waitUntil: 'domcontentloaded' });

    // The middleware's 308 lands on `/` — the client's active house, rendered
    // in place — with the letterbox named in the fragment.
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 30_000 }).toBe('/');
    await expect.poll(() => new URL(page.url()).hash).toBe('#letterbox');
    await settle(page);
    await expect(page.getByTestId('letterbox')).toBeVisible();
    await expectNoHeader(page);
  });
});
