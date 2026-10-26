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
    await page.getByRole('group', { name: 'In this document', exact: true }).getByRole('button', { name: /^Margin/ }).click();
    await page.locator('[data-margin-row]').filter({ hasText: 'N02 fictional observation' }).getByRole('button').first().click();
  } else {
    const toggle = page.getByRole('complementary', { name: 'In the margin', exact: true })
      .getByRole('button', { name: 'Note N02 fictional observation ABOUT THE WHOLE JOB', exact: true });
    await toggle.click({ timeout: 30_000 });
  }
  await expect(page.getByLabel('Note context')).toBeVisible();
}

test('mocked contextual Field payload returns to the recorded room and actual amendment trigger', async ({ authenticatedPage: page }, info) => {
  test.setTimeout(240_000);
  const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  expect(api.hostname).toBe('127.0.0.1');
  let visible = true;
  // Local API doubles exercise the mounted reader without applying inactive
  // 00874 to the shared DB. F01 and all other reads use the live local stack.
  const items = `${api.origin}/rest/v1/margin_items*`;
  const notes = `${api.origin}/rest/v1/margin_notes*`;
  await page.route(items, route => route.fulfill({ json: [{
    kind: 'note', item_id: NOTE, project_id: JOB, proposal_id: null,
    anchor_kind: 'letterhead', anchor_id: null, state: 'open',
    title: 'N02 fictional observation', detail: '', ts: '2026-10-26T00:00:00Z',
    payload: { body: 'Fictional private Field observation', author_name: 'Fictional observer',
      field_capture_id: 'f2066000-0000-4000-8000-000000000002', capture_visible: visible,
      project_room_id: ROOM, has_audio: false, photo_paths: [] },
  }] }));
  await page.route(notes, route => route.fulfill({ json: [{
    id: NOTE, project_id: JOB, subject_kind: 'plan_print', subject_id: 'recorded-print-only',
  }] }));
  try {
    await openNote(page);
    const context = page.getByLabel('Note context');
    await expect(context).toContainText('plan print · recorded-print-only');
    await expect(context.locator('dt').filter({ hasText: /^Issue$/ }).locator('xpath=following-sibling::dd[1]')).toHaveText('Not recorded');
    await expect(page.getByText('Atomic escalation is unavailable.', { exact: true })).toBeVisible();
    const shell = await page.locator('[data-document-shell]').elementHandle();
    const amendment = page.getByRole('button', { name: '→ Amendment', exact: true });
    // WebKit clicks need not focus a button: do not pre-focus this trigger.
    await amendment.click();
    await expect(page.getByRole('dialog').filter({ has: page.locator('[data-overlay-amendment]') })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(amendment).toBeFocused();
    expect(await shell!.evaluate(node => node === document.querySelector('[data-document-shell]'))).toBe(true);
    await page.screenshot({ path: info.outputPath('context-return.png') });
    await page.getByRole('link', { name: `Return to room · ${ROOM}`, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`room=${ROOM}`));
    await expect(page.locator('[data-testid="build-room"][data-build-room-embedded="true"]')).toBeVisible({ timeout: 30_000 });

    // A new read changes the visible metadata, never a private-capture lookup.
    visible = false;
    await openNote(page);
    await expect(page.getByText('The capture is unavailable to you.', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Return to room/ })).toHaveCount(0);
    await expect(page.getByLabel('Note context')).toContainText('recorded-print-only');
    await page.screenshot({ path: info.outputPath('capture-unavailable.png') });
  } finally {
    await page.unroute(items);
    await page.unroute(notes);
  }
});
