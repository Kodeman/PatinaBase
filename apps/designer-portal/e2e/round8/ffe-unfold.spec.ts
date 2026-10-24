import { test, expect } from '../fixtures/auth';
import type { Locator, Page } from '@playwright/test';
import { psqlScalar } from '../helpers/psql';

/**
 * WP-01.6 — under the round-8 renderer, "Edit room selections" (the room's
 * Build room door, `work-this-room`) unfolds the embedded Build room inside
 * the FF&E chapter: the address is pushed, the paper is not remounted, and
 * Esc, Back and Forward fold and unfold it in place. The old
 * `/doc/[id]/pieces` address keeps resolving. SQ-1891: a Spec address opens
 * its named line, and a failed save holds the sheet open until it lands.
 */

// F01's full-service job and its living room (f01-fixture.sql).
const JOB = 'f0180000-0000-4000-8000-000000000010';
const LIVING = 'f0180000-0000-4000-8000-000000000011';

async function openJob(page: Page, search = '') {
  // Leave the dev server's page first so no HMR client reloads the tab while
  // /doc/[id] compiles (paper-frame.spec.ts).
  await page.goto('about:blank');
  await page.goto(`/doc/${JOB}${search}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await expect(page.locator('[data-document-shell]')).toBeVisible({ timeout: 60_000 });
  // Story log #34 — server-rendered under the override: wait for the arrival
  // to settle before the first press.
  await expect(page.locator('[data-document-shell][data-arrival-ready]')).toHaveCount(1, {
    timeout: 60_000,
  });
  await expect(page.locator('html')).not.toHaveClass(/\barr-(pre|on|press)\b/, { timeout: 30_000 });
}

/** Holds the shell node, so a remount is caught rather than missed. */
async function holdShell(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __r8Shell?: Element | null }).__r8Shell =
      document.querySelector('[data-document-shell]');
  });
}

async function sameShell(page: Page) {
  return page.evaluate(() => {
    const held = (window as unknown as { __r8Shell?: Element | null }).__r8Shell;
    return !!held && held.isConnected && held === document.querySelector('[data-document-shell]');
  });
}

function unfoldParams(page: Page) {
  const params = new URL(page.url()).searchParams;
  return { unfold: params.get('unfold'), lens: params.get('lens'), room: params.get('room') };
}

/** Opens the living room on the FF&E chapter and returns its door. */
async function livingRoomDoor(page: Page): Promise<Locator> {
  const chapter = page.locator('[data-paper-chapter="ffe"]');
  await expect(chapter).toBeAttached({ timeout: 30_000 });
  // The Pieces region stays quiet (its head alone) until the reader comes to
  // it: the contents entry brings her there; below 1180px she scrolls.
  const entry = page
    .getByRole('navigation', { name: 'Job contents', exact: true })
    .locator('[data-contents-entry="ffe"]');
  if (await entry.isVisible()) await entry.click();
  else await page.locator('#ffe-chapter-heading').scrollIntoViewIfNeeded();
  const room = chapter.locator(`[data-pieces-room="${LIVING}"]`);
  await expect(room).toBeAttached({ timeout: 30_000 });
  await room.scrollIntoViewIfNeeded();
  const toggle = room.getByRole('button', { name: /Living Room/ });
  await expect(toggle).toBeVisible({ timeout: 30_000 });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  const door = room.getByRole('link', { name: /Edit room selections/ });
  await expect(door).toBeVisible();
  return door;
}

const instrument = (page: Page) =>
  page.locator('[data-paper-chapter="ffe"] [data-unfold-instrument="pieces"]');

test.describe('WP-01.6 inline FF&E unfold (F01)', () => {
  test('the room door unfolds the Build room in place; Esc folds it back to the door', async ({
    authenticatedPage: page,
  }) => {
    await openJob(page);
    await holdShell(page);
    const door = await livingRoomDoor(page);
    // The old route is still the link's address, for a new tab.
    await expect(door).toHaveAttribute('href', `/doc/${JOB}/pieces?lens=rough&room=${LIVING}`);

    await door.focus();
    await page.keyboard.press('Enter');

    await expect(instrument(page)).toBeVisible({ timeout: 30_000 });
    expect(new URL(page.url()).pathname, 'no route change').toBe(`/doc/${JOB}`);
    expect(unfoldParams(page)).toEqual({ unfold: 'pieces', lens: 'rough', room: LIVING });
    // The embedded sheet, not the route's: a named section, never <main>.
    await expect(instrument(page).locator('[data-build-room-title]')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('main [data-build-room-title]')).toHaveCount(1);
    await expect(page.locator('main main')).toHaveCount(0);
    // The host lands on the room it was opened for.
    const heading = instrument(page).locator(`[data-room-heading="${LIVING}"]`);
    await expect(heading).toBeFocused({ timeout: 30_000 });
    await expect(heading).toBeInViewport();
    await test.info().attach('unfolded-living-room', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    // The chapter's own body is held, hidden, under the unfold.
    await expect(page.locator('[data-ffe-chapter-body]')).toBeHidden();
    expect(await sameShell(page), 'the paper was not remounted').toBe(true);

    await page.keyboard.press('Escape');

    await expect(instrument(page)).toHaveCount(0);
    expect(unfoldParams(page).unfold).toBeNull();
    await expect(door, 'focus returns to the control that opened it').toBeFocused({ timeout: 10_000 });
    await expect(page.locator(`[data-pieces-room="${LIVING}"]`)).toBeInViewport();
    expect(await sameShell(page), 'the paper was not remounted').toBe(true);
  });

  test('Back folds the unfold away and Forward unfolds it again', async ({ authenticatedPage: page }) => {
    await openJob(page);
    await holdShell(page);
    const door = await livingRoomDoor(page);
    await door.click();
    await expect(instrument(page)).toBeVisible({ timeout: 30_000 });
    expect(unfoldParams(page).unfold).toBe('pieces');

    await page.goBack();
    await expect(instrument(page)).toHaveCount(0);
    expect(unfoldParams(page).unfold).toBeNull();
    expect(new URL(page.url()).pathname).toBe(`/doc/${JOB}`);
    await expect(page.locator('[data-ffe-chapter-body]')).toBeVisible();

    await page.goForward();
    await expect(instrument(page)).toBeVisible({ timeout: 30_000 });
    expect(unfoldParams(page)).toEqual({ unfold: 'pieces', lens: 'rough', room: LIVING });

    await page.goBack();
    await expect(instrument(page)).toHaveCount(0);
    expect(await sameShell(page), 'history walked the unfold without a remount').toBe(true);
  });

  test('a reload on the unfold address reopens it, and the /pieces route still resolves', async ({
    authenticatedPage: page,
  }) => {
    await openJob(page, `?unfold=pieces&lens=rough&room=${LIVING}`);
    await expect(instrument(page)).toBeVisible({ timeout: 30_000 });
    await expect(instrument(page).locator(`[data-room-heading="${LIVING}"]`)).toBeFocused({
      timeout: 30_000,
    });
    // Nothing was pushed: "Return to the room" replaces the address away and
    // lands on the room, not on a page before it.
    await instrument(page).getByRole('button', { name: /Return to the room/ }).click();
    await expect(instrument(page)).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe(`/doc/${JOB}`);
    expect(unfoldParams(page).unfold).toBeNull();

    await page.goto(`/doc/${JOB}/pieces?lens=rough&room=${LIVING}`, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });
    // The route's own sheet, not the paper: its rooms stand in its <main>.
    await expect(page.locator('[data-build-room-title]')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-document-paper]')).toHaveCount(0);
    await expect(page.locator('[data-unfold-instrument]')).toHaveCount(0);
    await expect(page.locator(`main [data-room-heading="${LIVING}"]`)).toBeVisible({ timeout: 30_000 });
  });

  // SQ-1891 F1 — `line=` names a Spec line that is not the lens's first
  // unfinished one; the unfold opens and focuses that line.
  test('a Spec address opens and focuses the line it names', async ({ authenticatedPage: page }) => {
    const line = livingLineId('F01 Living Room selection 07');
    await openJob(page, `?unfold=pieces&lens=spec&room=${LIVING}&line=${line}`);
    await expect(instrument(page)).toBeVisible({ timeout: 30_000 });
    const row = instrument(page).locator(`[data-line-id="${line}"] button`);
    await expect(row).toHaveAttribute('aria-current', 'true', { timeout: 30_000 });
    await expect(row).toBeFocused({ timeout: 30_000 });
    await expect(instrument(page).getByTestId('spec-fields-pane')).toContainText(
      'F01 Living Room selection 07',
    );
    await expect(instrument(page).locator('[data-line-id] button[aria-current="true"]')).toHaveCount(1);
    await test.info().attach('spec-line-landing', { body: await page.screenshot(), contentType: 'image/png' });
  });

  // SQ-1891 F3, SQ-1894 — a failed save holds Return to the room: the sheet
  // stays open on the field, with its alert and the typed value. Return only
  // holds, never replays; leaving the field (pressing Return does) is its own
  // retry of the value it shows, and once that lands the sheet folds away.
  test('a failed Spec save keeps the sheet open until a retry lands', async ({ authenticatedPage: page }) => {
    const line = livingLineId('F01 Living Room selection 09');
    const typed = `Forced-failure finish ${Date.now()}`;
    await openJob(page, `?unfold=pieces&lens=spec&room=${LIVING}&line=${line}`);
    const pane = instrument(page).getByTestId('spec-fields-pane');
    await expect(pane).toContainText('F01 Living Room selection 09', { timeout: 30_000 });
    const finish = pane.getByRole('textbox', { name: 'Finish' });
    // The Spec pane has no width in the unfold yet (its 520px + 1fr grid in a
    // ~540px sheet; SQ-1889 owns that layout), so the field is driven without
    // Playwright's visibility check and its pane is read, not looked at.
    await expect(finish).toBeAttached({ timeout: 30_000 });

    const specWrite = (url: URL) => url.pathname.endsWith('/rest/v1/project_ffe_specs');
    let refused = 0;
    await page.route(specWrite, (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      refused += 1;
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'XX000', message: 'Forced failure (SQ-1891 e2e)' }),
      });
    });

    await finish.fill(typed, { force: true });
    const returnToRoom = instrument(page).getByRole('button', { name: /Return to the room/ });
    await returnToRoom.click();

    await expect(instrument(page).getByText(/Your changes are not saved yet/)).toBeVisible({
      timeout: 30_000,
    });
    expect(refused, 'the blur save reached the server once; the hold wrote nothing').toBe(1);
    await expect(instrument(page)).toBeVisible();
    expect(unfoldParams(page).unfold).toBe('pieces');
    await expect(pane.getByRole('alert')).toContainText(/Forced failure|not saved/);
    await expect(finish).toHaveValue(typed);
    await expect(finish).toHaveAttribute('aria-invalid', 'true');
    await expect(finish, 'the hold focuses the unsaved field').toBeFocused();
    await test.info().attach('spec-save-refused', { body: await page.screenshot(), contentType: 'image/png' });

    await page.unroute(specWrite);
    await returnToRoom.click();
    await expect(instrument(page)).toHaveCount(0, { timeout: 30_000 });
    expect(unfoldParams(page).unfold).toBeNull();
    expect(
      psqlScalar(`SELECT finish FROM public.project_ffe_specs WHERE ffe_item_id = '${line}';`),
      'the retry wrote the typed value',
    ).toBe(typed);
  });
});

/** RPC-made line ids are not stable (f01-fixture.sql): read one by name. */
function livingLineId(name: string): string {
  const id = psqlScalar(`
    SELECT id FROM public.project_ffe_items
    WHERE project_id = '${JOB}' AND project_room_id = '${LIVING}'
      AND name = '${name}' AND removed_at IS NULL;
  `);
  expect(id, `F01 line "${name}"`).toMatch(/^[0-9a-f-]{36}$/);
  return id;
}
