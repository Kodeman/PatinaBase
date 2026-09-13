import { expect } from '@playwright/test';
import { test } from '../fixtures/auth';
import { adminDb } from '../helpers/supabase-admin';

/**
 * THE CALL SHEET, AGAINST THE OKONKWO SEED — Leah's tasks 3 and 6.
 *
 *   3. "Who has site access on Okonkwo right now" — key holder, gate control,
 *      hours, and who was told last, from ONE screen, one click from the sheet.
 *   6. "Everyone on Okonkwo by role, this week" — the roster opens already
 *      banded by the window: this week, later, bidding, done.
 *
 * Reads the `people_crm_dev.sql` fixture (supabase/seed): the Okonkwo residence
 * with its seats, its authority grants and its site access card, on
 * designer@patina.dev's studio. It does NOT create a project — a fixture this
 * rich is the point of the seed.
 *
 * The one write it makes is "Log who was told", and it asserts the write where
 * it lands: `project_site_access_cards.told_refs`, through the service role,
 * with expect.poll rather than a networkidle guess.
 *
 * Chromium-pinned: this mutates one row for one shared seeded designer, and
 * Playwright's three browser projects run in parallel as the same user.
 */
test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'single-actor: the three browser projects would race the same seeded designer',
);

const OKONKWO = 'd0e00000-0000-0000-0000-00000000000a';

async function openTheCallSheet(page: import('@playwright/test').Page) {
  await page.goto(`/doc/${OKONKWO}`, { waitUntil: 'domcontentloaded' });
  const instrument = page.locator('[data-action-key="open-call-sheet"]');
  await expect(instrument).toBeVisible({ timeout: 30_000 });
  await instrument.click();
  await expect(page.getByText('Call sheet · Okonkwo residence')).toBeVisible();
  // QA-R2-6: the sheet's heading is static markup, but every read behind it is
  // `enabled: open` — the roster, the authority grants, the consent org and the
  // site access card all START when the sheet opens. On a cold page that round
  // trip outruns the default 5s expect budget, so the bands are gated on
  // themselves here rather than each assertion racing the fetch.
  await expect(page.locator('[data-roster-band]').first()).toBeVisible({
    timeout: 30_000,
  });
}

test('task 6 — the roster opens already banded by the window', async ({
  authenticatedPage: page,
}) => {
  await openTheCallSheet(page);

  // The four window bands, plus the two the sheet's own sides carry. Build &
  // supply is retired and must not reappear.
  for (const heading of [
    'Studio side',
    'Client side',
    'On the job · this week',
    'On the job · later',
  ]) {
    await expect(page.getByText(heading, { exact: true })).toBeVisible();
  }
  await expect(page.getByText('Build & supply')).toHaveCount(0);

  // The bands print in the sheet's order.
  const bands = page.locator('[data-roster-band]');
  await expect(bands.first()).toHaveAttribute('data-roster-band', 'studioSide');

  // A live window reads this week; a window that opens in November reads later.
  const thisWeek = page.locator('[data-roster-band="this_week"]');
  const later = page.locator('[data-roster-band="later"]');
  await expect(thisWeek).toContainText('Dana Kowalski');
  await expect(later).toContainText('Pete Rusk');

  // The vitals count the window, not the whole book.
  await expect(page.locator('[data-call-sheet-vitals]')).toContainText(
    'on the job this week',
  );

  // A seat the studio may not text says so on the collapsed row (R-T), and the
  // held paper says so in words, never as a badge (PR-h).
  await expect(later.locator('[data-opted-out-note]').first()).toContainText('Opted out');
  await expect(thisWeek.locator('[data-held-clause]').first()).toContainText(
    'Northgate Electric',
  );

  // The word Remove appears nowhere on the sheet.
  await expect(page.getByRole('button', { name: /^Remove$/ })).toHaveCount(0);
});

test('task 3 — who has site access right now, one click from the sheet', async ({
  authenticatedPage: page,
}) => {
  await openTheCallSheet(page);

  // The card is folded to one line at the head (R-U).
  const line = page.locator('[data-site-access-line]');
  await expect(line).toContainText('Key held by Ngozi Eze');
  await expect(line).toContainText('controls the gate');

  await page.getByRole('button', { name: 'Open the site access card' }).click();
  await expect(page.getByText('Site access · Okonkwo residence')).toBeVisible();

  // Studio only, and it says so.
  await expect(
    page.getByText('Studio only. This card never reaches a client page.'),
  ).toBeVisible();

  // Who to call first — each line its own tel: target.
  const firstCall = page.locator('a[data-tel-link]').first();
  await expect(firstCall).toContainText('Luis Ochoa');
  await expect(firstCall).toHaveAttribute('href', /^tel:\+/);

  // The way in, with NO code anywhere on the card (PR-r).
  await expect(page.locator('[data-way-in]')).toContainText(
    'The code is held off Patina',
  );
  await expect(page.getByLabel(/code/i)).toHaveCount(0);

  // The hours, the receiving note, and who was told last.
  await expect(page.getByText(/Weekdays 07:00 to 17:00/)).toBeVisible();
  await expect(page.getByText(/receives deliveries/)).toBeVisible();
  await expect(page.locator('[data-who-was-told]')).toContainText('Told:');
});

test('task 3 — logging who was told writes the notice', async ({
  authenticatedPage: page,
}) => {
  const before = await adminDb
    .from('project_site_access_cards')
    .select('told_refs')
    .eq('project_id', OKONKWO)
    .single();
  if (before.error) throw before.error;
  const wasTold = (before.data?.told_refs ?? []) as string[];

  await openTheCallSheet(page);
  await page.getByRole('button', { name: 'Open the site access card' }).click();
  await expect(page.getByText('Site access · Okonkwo residence')).toBeVisible();

  const act = page.getByRole('button', { name: 'Log who was told' });
  await expect(act).toHaveAttribute('aria-expanded', 'false');
  await act.click();
  await expect(act).toHaveAttribute('aria-expanded', 'true');

  const firstName = page.getByRole('checkbox').first();
  await expect(firstName).toBeVisible();
  await firstName.click();
  await page.getByRole('button', { name: 'Save this note' }).click();

  await expect
    .poll(
      async () => {
        const { data, error } = await adminDb
          .from('project_site_access_cards')
          .select('told_refs')
          .eq('project_id', OKONKWO)
          .single();
        if (error) throw error;
        return ((data?.told_refs ?? []) as string[]).length;
      },
      { timeout: 20_000 },
    )
    .toBeGreaterThan(wasTold.length);
});
