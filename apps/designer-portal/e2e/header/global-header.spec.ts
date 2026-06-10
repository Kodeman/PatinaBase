/**
 * End-to-end spec: global header rework
 *
 *   account-only avatar menu (Profile/Settings/Sign out + status, no
 *   business links) → status persists through the availability backend
 *   (00183: DB assert + reload) → + New quick-create routes → header
 *   timer: idle icon → start on seeded project → chip → stop → entry in
 *   project_time_entries → idle icon returns.
 *
 * One serial describe block; ids shared via module closure (same convention
 * as billing/invoices.spec.ts). DB seeding/assertions via service-role adminDb.
 *
 * Requires:
 *   - Local Supabase running with seed data (designer@patina.dev)
 *   - Designer portal at :3000
 *   - SUPABASE_SERVICE_ROLE_KEY in apps/designer-portal/.env.local
 */

import { test, expect } from '../fixtures/auth';
import { adminDb, getUserIdByEmail } from '../helpers/supabase-admin';

const PROJECT_NAME = 'QA Header Timer Project (e2e)';

let designerId: string;
let projectId: string;

test.describe.serial('global header: account menu, status persistence, quick create, timer', () => {
  // Single-actor suite: availability status lives on the shared designer
  // profile row and a user can have only ONE running timer (partial unique
  // index) — the three browser projects run in parallel as the same user and
  // would race each other. Chromium only.
  test.skip(({ browserName }) => browserName !== 'chromium', 'single-actor suite — chromium only');

  test.beforeAll(async () => {
    designerId = await getUserIdByEmail('designer@patina.dev');

    const { data: project, error } = await adminDb
      .from('projects')
      .insert({
        name: PROJECT_NAME,
        created_by: designerId,
        designer_id: designerId,
        status: 'active',
        current_phase: 'concept',
        budget_cents: 0,
        start_date: '2026-06-01',
      })
      .select('id')
      .single();
    if (error) throw new Error(`seed project failed: ${error.message}`);
    projectId = project.id as string;
  });

  test.afterAll(async () => {
    // Time entries cascade from the project? They FK the project; remove
    // explicitly first to be safe, then the project, then reset status.
    await adminDb.from('project_time_entries').delete().eq('project_id', projectId);
    await adminDb.from('projects').delete().eq('id', projectId);
    await adminDb
      .from('profiles')
      .update({ availability_status: 'online' })
      .eq('id', designerId);
  });

  test('avatar menu is account-only', async ({ authenticatedPage: page }) => {
    await page.goto('/portal');
    await page.getByRole('button', { name: 'Account menu' }).click();

    await expect(page.getByRole('menuitem', { name: 'Profile' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Settings' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Availability status' })).toBeVisible();

    // Business/duplicate links must be gone from the menu.
    await expect(page.getByRole('menuitem', { name: 'Earnings' })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: 'Portfolio' })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: 'Help & Resources' })).toHaveCount(0);
  });

  test('status persists to the DB and survives reload', async ({ authenticatedPage: page }) => {
    await page.goto('/portal');
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('radio', { name: 'Busy' }).click();

    // DB write lands.
    await expect
      .poll(async () => {
        const { data } = await adminDb
          .from('profiles')
          .select('availability_status')
          .eq('id', designerId)
          .single();
        return data?.availability_status;
      })
      .toBe('busy');

    // The old useState implementation reset on refresh — the core regression.
    await page.reload();
    await page.getByRole('button', { name: 'Account menu' }).click();
    await expect(page.getByRole('radio', { name: 'Busy' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  test('+ New menu routes to create flows', async ({ authenticatedPage: page }) => {
    await page.goto('/portal');
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await page.getByRole('menuitem', { name: 'New Invoice' }).click();
    await page.waitForURL(/\/portal\/billing\/invoices\/new/);

    // New Decision opens the picker on the decisions page via ?new=1.
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await page.getByRole('menuitem', { name: 'New Decision' }).click();
    await page.waitForURL(/\/portal\/decisions\?new=1/);
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });
  });

  test('header timer: start → chip → stop → logged entry → idle again', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/portal');

    // Idle: timer icon present.
    const startButton = page.getByRole('button', { name: 'Start timer' });
    await expect(startButton).toBeVisible();
    await startButton.click();

    await page.getByRole('textbox', { name: 'Search projects' }).fill('QA Header Timer');
    await page.getByRole('option', { name: new RegExp(PROJECT_NAME.slice(0, 20)) }).click();

    // Running: chip replaces the icon.
    const chip = page.getByRole('button', { name: /timer running on .*click to stop/i });
    await expect(chip).toBeVisible({ timeout: 15_000 });
    await expect(startButton).toHaveCount(0);

    // Stop through the chip's dialog.
    await chip.click();
    await page.getByRole('button', { name: /^stop/i }).click();

    // Entry lands in the DB with a duration.
    await expect
      .poll(async () => {
        const { data } = await adminDb
          .from('project_time_entries')
          .select('duration_minutes')
          .eq('project_id', projectId)
          .not('duration_minutes', 'is', null);
        return data?.length ?? 0;
      })
      .toBeGreaterThan(0);

    // Idle icon returns.
    await expect(page.getByRole('button', { name: 'Start timer' })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('command palette Business group contains Portfolio', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/portal');
    // The header search button opens the same palette as ⌘K. Its accessible
    // name is the visible kbd hint ("⌘K") — the search icon is decorative.
    // CommandDialog renders a plain overlay div (no dialog role), so target
    // the palette by its distinctive input placeholder.
    await page.getByTitle('Search (⌘K)').click();
    const paletteInput = page.getByPlaceholder('Search projects, products, clients, decisions...');
    await expect(paletteInput).toBeVisible();
    await paletteInput.fill('portfolio');
    await expect(page.getByText('Portfolio')).toBeVisible();
  });
});
