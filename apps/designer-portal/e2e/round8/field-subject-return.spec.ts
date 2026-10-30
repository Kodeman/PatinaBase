import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth';

const JOB = 'f0180000-0000-4000-8000-000000000010';
const ROOM = 'f0180000-0000-4000-8000-000000000011';
const NOTE = 'f2066000-0000-4000-8000-000000000001';

async function openNote(page: Page) {
  await page.goto(`/doc/${JOB}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await expect(page.locator('[data-document-shell]')).toHaveAttribute('data-arrival-ready', '', { timeout: 60_000 });
  await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/);
  if ((page.viewportSize()?.width ?? 1440) < 1180) {
    await page.getByRole('button', { name: 'More studio actions', exact: true }).click();
    const marginDoor = page.getByRole('group', { name: 'In this document', exact: true }).getByRole('button', { name: /^Margin/ });
    await expect(marginDoor).toBeVisible({ timeout: 30_000 });
    await marginDoor.click();
    const noteDoor = page.locator('[data-margin-row]').filter({ hasText: 'N02 fictional observation' }).getByRole('button').first();
    await expect(noteDoor).toBeVisible({ timeout: 30_000 });
    await noteDoor.click();
  } else {
    const noteDoor = page.getByRole('complementary', { name: /^(?:In the margin|Margin)$/ })
      .getByRole('button', { name: 'Note N02 fictional observation ABOUT THE WHOLE JOB', exact: true });
    await expect(noteDoor).toBeVisible({ timeout: 30_000 });
    await noteDoor.click();
  }
  await expect(page.getByLabel('Note context')).toBeVisible();
}

async function mockedNote(page: Page, state: { visible: boolean; refused: boolean }) {
  const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  expect(api.hostname).toBe('127.0.0.1');
  // Only note reads are mocked: inactive 00874 is not applied to the shared DB.
  await page.route(`${api.origin}/rest/v1/margin_items*`, route => route.fulfill({ json: [{
    kind: 'note', item_id: NOTE, project_id: JOB, proposal_id: null,
    anchor_kind: 'letterhead', anchor_id: null, state: 'open',
    title: 'N02 fictional observation', detail: '', ts: '2026-10-26T00:00:00Z',
    payload: { body: 'Fictional private Field observation', author_name: 'Fictional observer',
      field_capture_id: 'f2066000-0000-4000-8000-000000000002', capture_visible: state.visible,
      project_room_id: ROOM, has_audio: false, photo_paths: [] },
  }] }));
  await page.route(`${api.origin}/rest/v1/margin_notes*`, route => state.refused
    ? route.fulfill({ status: 503, json: { message: 'Fictional metadata refusal' } })
    : route.fulfill({ json: [{ id: NOTE, project_id: JOB, subject_kind: 'plan_print', subject_id: 'recorded-print-only', subject_print_label: 'Living Room plan — issued 02' }] }));
}

test('metadata refusal keeps the mounted note and announces unavailable context, not an empty margin', async ({ authenticatedPage: page }) => {
  test.setTimeout(240_000);
  await mockedNote(page, { visible: true, refused: true });
  await openNote(page);
  await expect(page.getByRole('status').filter({ hasText: 'Note context is unavailable' })).toBeVisible();
  await expect(page.getByText('Fictional private Field observation', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Note context')).not.toContainText('recorded-print-only');
});

test('mocked contextual Field payload returns through the native room owner and actual amendment trigger', async ({ authenticatedPage: page }, info) => {
  test.setTimeout(240_000);
  const state = { visible: true, refused: false };
  await mockedNote(page, state);
  await openNote(page);
  const context = page.getByLabel('Note context');
  await expect(context.locator('dt').filter({ hasText: /^Subject$/ }).locator('xpath=following-sibling::dd[1]')).toHaveText('Print · Living Room plan — issued 02');
  await expect(context.locator('dt').filter({ hasText: /^Print$/ }).locator('xpath=following-sibling::dd[1]')).toHaveText('Living Room plan — issued 02');
  await expect(context).not.toContainText('recorded-print-only');
  await expect(context.locator('dt').filter({ hasText: /^Issue$/ }).locator('xpath=following-sibling::dd[1]')).toHaveText('Not recorded');
  const shell = await page.locator('[data-document-shell]').elementHandle();
  const amendment = page.getByRole('button', { name: '→ Amendment', exact: true });
  await amendment.click();
  await expect(page.getByRole('dialog').filter({ has: page.locator('[data-overlay-amendment]') })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(amendment).toBeFocused();
  const roomDoor = page.getByRole('link', { name: `Return to room · ${ROOM}`, exact: true });
  await roomDoor.click();
  await expect(page).toHaveURL(new RegExp(`room=${ROOM}`));
  const room = page.locator('[data-testid="build-room"][data-build-room-embedded="true"]');
  await expect(room).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  const heading = room.locator('h1, h2').first();
  await heading.scrollIntoViewIfNeeded();
  await expect.poll(() => heading.evaluate(node => {
    const rect = node.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hit === node || node.contains(hit);
  })).toBe(true);
  await page.keyboard.press('Escape');
  await expect(room).toHaveCount(0);
  if ((page.viewportSize()?.width ?? 1440) >= 1180) await expect(roomDoor).toBeFocused();
  expect(await shell!.evaluate(node => node === document.querySelector('[data-document-shell]'))).toBe(true);
  await page.screenshot({ path: info.outputPath('room-return.png') });

  state.visible = false;
  await openNote(page);
  await expect(page.getByText('The capture is unavailable to you.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Return to room/ })).toHaveCount(0);
  await expect(page.getByLabel('Note context')).toContainText('recorded-print-only');
});

test('@renderer-off note room return lands on the existing pieces route', async ({ authenticatedPage: page }) => {
  test.setTimeout(240_000);
  await mockedNote(page, { visible: true, refused: false });
  await openNote(page);
  await page.getByRole('link', { name: `Return to room · ${ROOM}`, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/doc/${JOB}/pieces\\?lens=spec&room=${ROOM}`));
  await expect(page.getByTestId('build-room')).toBeVisible({ timeout: 60_000 });
});
