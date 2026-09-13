/**
 * The Hours sheet — the doorway that opens it, and the HT-8 scope lens at the
 * three widths (1440 / 1024 / 390).
 *
 * LOCAL STACK ONLY. Seeds nothing: the seeded designer is the owner of a
 * `design_studio` (`organization_members.role = 'owner'`), which is the whole
 * precondition for the lens, and the sheet's own zero state is a legitimate
 * reading of an empty week. Nothing here closes or starts a timer — the
 * `00177:37-41` one-running-timer index is per user GLOBALLY and e2e actors
 * collide (plan §3).
 *
 * What only a browser can say, and this pins:
 *  · `/desk?sheet=hours` opens the Hours book. `sheet` is an alias of `book` in
 *    the doorway; before it, the live founding-cohort CTA landed on a bare Desk
 *    because an unknown param is ignored in silence.
 *  · The lens survives to 390 — it wraps rather than clipping or scrolling the
 *    page sideways — and each word keeps its 44px hit at every width.
 *  · W3: the ⌘K "Log time" verb is reachable with NOTHING in hand, and the
 *    form it opens carries the date field and the billable control. Nothing
 *    here SUBMITS one — the file's no-seed, no-write posture holds, and the
 *    write path is pinned by the jest specs and by
 *    supabase/tests/billing/time_log_rpc_test.sql.
 */
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth';

const COLD = 30_000;

/**
 * The Desk Walkthrough's welcome modal is a real `<dialog>`: while it is open
 * the rest of the page is inert and aria-hidden, so NOTHING inside the Hours
 * sheet is reachable — the lens renders and the reads still fail. Its
 * suppression is a server-side tour record (`profiles.help_state`), not the
 * localStorage marker `e2e/fixtures/auth.ts` pre-sets, so a freshly seeded
 * designer is offered it. Decline it before reading the sheet; after the first
 * test in this serial file the record is written and it never returns, which is
 * why the click is allowed to find nothing.
 */
async function declineDeskWalkthrough(page: Page): Promise<void> {
  await page
    .getByRole('dialog', { name: 'This is your Desk' })
    .getByRole('button', { name: 'Skip for now' })
    .click({ timeout: 10_000 })
    .catch(() => undefined);
}

/** The three widths the house sheet is read at. */
const WIDTHS = [
  { label: '1440', width: 1440, height: 1000 },
  { label: '1024', width: 1024, height: 900 },
  { label: '390', width: 390, height: 844 },
] as const;

test.describe.configure({ mode: 'serial' });
// One seeded actor: the three browser projects would sign in as the same
// designer and race each other's session.
test.skip(({ browserName }) => browserName !== 'chromium', 'single seeded actor');

test('the sheet doorway opens the Hours book', async ({
  authenticatedPage: page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/desk?sheet=hours', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('dialog', { name: 'Hours' })).toBeVisible({
    timeout: COLD,
  });
  await declineDeskWalkthrough(page);
  // The doorway is a one-shot instruction: once carried out the address reads
  // `/desk` again, so a refresh shows the Desk's own state.
  await expect.poll(() => new URL(page.url()).search).toBe('');
});

for (const { label, width, height } of WIDTHS) {
  test(`the scope lens reads at ${label}`, async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/desk?sheet=hours', { waitUntil: 'domcontentloaded' });

    const sheet = page.getByRole('dialog', { name: 'Hours' });
    await expect(sheet).toBeVisible({ timeout: COLD });
    await declineDeskWalkthrough(page);

    // HT-8 — the admin's instrument. Two words with nothing in hand: her own
    // hours and the studio's. No tab bar, no leaderboard.
    const lens = sheet.getByRole('group', { name: 'Hours scope' });
    await expect(lens).toBeVisible({ timeout: COLD });
    await expect(lens.getByRole('button', { name: 'mine' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect(lens.getByRole('button', { name: 'the studio' })).toBeVisible();

    // Every word keeps the 44px floor, at every width.
    const words = lens.getByRole('button');
    for (const word of await words.all()) {
      const box = await word.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }

    // The sheet never scrolls the page sideways — the lens wraps instead.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test('the studio scope answers with a total above its buckets', async ({
  authenticatedPage: page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/desk?sheet=hours', { waitUntil: 'domcontentloaded' });

  const sheet = page.getByRole('dialog', { name: 'Hours' });
  await expect(sheet).toBeVisible({ timeout: COLD });
  await declineDeskWalkthrough(page);

  await sheet.getByRole('button', { name: 'the studio' }).click();

  // HT-30 — the total is the front matter of the rows; HT-36 — the buckets are
  // cut five ways and carry no free text.
  await expect(
    sheet.getByRole('group', { name: 'Group hours' }),
  ).toBeVisible({ timeout: COLD });
  await expect(sheet.getByRole('button', { name: 'by person' })).toHaveAttribute(
    'aria-current',
    'true',
  );
  // The entries are one act away, never the default reading.
  await expect(sheet.getByRole('button', { name: 'The entries' })).toBeVisible();
});

test('the ⌘K "Log time" verb opens a dated form with nothing in hand (W3)', async ({
  authenticatedPage: page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/desk', { waitUntil: 'domcontentloaded' });
  await declineDeskWalkthrough(page);

  await page.keyboard.press('Meta+k');
  const palette = page.getByRole('dialog', { name: 'Command bar' });
  await expect(palette).toBeVisible({ timeout: COLD });

  // "This surface" is where an in-hand-gated verb would live; with nothing
  // open it is absent, and Log time is still offered under Begin.
  await expect(
    palette.getByRole('group', { name: 'This surface' }),
  ).toHaveCount(0);
  const verb = palette
    .getByRole('group', { name: 'Begin' })
    .getByRole('option', { name: /Log time/ });
  await expect(verb).toBeVisible();
  await verb.click();

  const form = page.getByRole('dialog', { name: 'Log time' });
  await expect(form).toBeVisible({ timeout: COLD });
  // HT-13's date field, HT-11's control, HT-24's honest activity default.
  await expect(form.getByLabel('Date')).toBeVisible();
  await expect(
    form.getByRole('button', { name: /billable/i }),
  ).toBeVisible();
  await expect(form.getByRole('combobox', { name: 'Activity' })).toHaveValue('');

  // Nothing is written: close it again.
  await page.keyboard.press('Escape');
  await expect(form).toHaveCount(0);
});

test('the bare t key opens the same form (W3)', async ({
  authenticatedPage: page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/desk', { waitUntil: 'domcontentloaded' });
  await declineDeskWalkthrough(page);

  // Focus must be on the page body, not in a field — the binding's own guard.
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('t');

  await expect(page.getByRole('dialog', { name: 'Log time' })).toBeVisible({
    timeout: COLD,
  });
  await page.keyboard.press('Escape');
});
