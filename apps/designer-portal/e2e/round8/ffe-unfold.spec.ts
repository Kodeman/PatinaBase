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
    await page.screenshot({ path: test.info().outputPath(`legacy-pieces-${page.viewportSize()!.width}.png`) });
  });

  test('embedded Spec layout fits the paper column at 1180, 1440 and 1920', async ({
    authenticatedPage: page,
  }) => {
    const line = livingLineId('F01 Living Room selection 07');
    for (const width of [1180, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await openJob(page, `?unfold=pieces&lens=spec&room=${LIVING}&line=${line}`);
      const sheet = instrument(page).getByTestId('build-room');
      const pane = sheet.getByTestId('spec-fields-pane');
      const finish = pane.getByRole('textbox', { name: 'Finish' });
      await expect(pane).toBeVisible({ timeout: 30_000 });
      await expect(finish).toBeVisible();
      await finish.scrollIntoViewIfNeeded();
      const geometry = await sheet.evaluate((root) => {
        const bounds = root.getBoundingClientRect();
        const field = root.querySelector<HTMLInputElement>('[aria-label="Finish"]')!;
        const fieldBounds = field.getBoundingClientRect();
        return {
          containerType: getComputedStyle(root).containerType,
          sheetWidth: bounds.width,
          fieldWidth: fieldBounds.width,
          fieldInside: fieldBounds.left >= bounds.left && fieldBounds.right <= bounds.right,
          railVisible: getComputedStyle(root.querySelector('nav[aria-label="Rooms"]')!).display !== 'none',
          headFits: root.querySelector('header')!.scrollWidth <= bounds.width + 1,
        };
      });
      expect(geometry.containerType).toBe('inline-size');
      expect(geometry.fieldWidth, `usable Finish field at viewport ${width}`).toBeGreaterThan(200);
      expect(geometry.fieldInside, `Finish stays in the paper at viewport ${width}`).toBe(true);
      expect(geometry.headFits, `schedule views wrap inside the paper at viewport ${width}`).toBe(true);
      expect(geometry.railVisible).toBe(geometry.sheetWidth >= 1180);
      await page.screenshot({ path: test.info().outputPath(`embedded-spec-${width}.png`) });
    }
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
    await expect(pane).toBeVisible({ timeout: 30_000 });
    await expect(finish).toBeVisible({ timeout: 30_000 });

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

    await finish.fill(typed);
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

  // SQ-1897 F1 — Back holds like Return: with a failed Spec save, Back puts
  // the unfold's address back, says why and focuses the field. Nothing is
  // replayed; once a save lands, Return folds the sheet away.
  test('Back with a failed Spec save keeps the sheet open on the field', async ({
    authenticatedPage: page,
  }) => {
    const line = livingLineId('F01 Living Room selection 08');
    const typed = `Back-held finish ${Date.now()}`;
    await openJob(page);
    await holdShell(page);
    await (await livingRoomDoor(page)).click();
    await expect(instrument(page)).toBeVisible({ timeout: 30_000 });
    await instrument(page)
      .getByRole('group', { name: 'Schedule view' })
      .getByRole('button', { name: 'Specifications' })
      .click();
    const row = instrument(page).locator(`[data-line-id="${line}"] button`);
    await row.click();
    const pane = instrument(page).getByTestId('spec-fields-pane');
    await expect(pane).toContainText('F01 Living Room selection 08', { timeout: 30_000 });
    const finish = pane.getByRole('textbox', { name: 'Finish' });
    await expect(finish).toBeVisible({ timeout: 30_000 });

    const specWrite = (url: URL) => url.pathname.endsWith('/rest/v1/project_ffe_specs');
    let refused = 0;
    await page.route(specWrite, (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      refused += 1;
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'XX000', message: 'Forced failure (SQ-1897 e2e)' }),
      });
    });
    await finish.fill(typed);
    await finish.evaluate((el: HTMLElement) => el.blur());
    await expect(pane.getByRole('alert')).toContainText(/Forced failure|not saved/, { timeout: 30_000 });
    await expect(finish).toHaveAttribute('aria-invalid', 'true');
    const length = await page.evaluate(() => history.length);

    await pressBack(page);
    await expect(instrument(page).getByText(/Your changes are not saved yet/)).toBeVisible({
      timeout: 30_000,
    });
    await expect(instrument(page)).toBeVisible();
    await expect(pane.getByRole('alert')).toContainText(/Forced failure|not saved/);
    await expect(finish).toHaveAttribute('aria-invalid', 'true');
    expect(await page.evaluate(() => history.length), 'a held Back grows no history').toBe(length);
    expect(unfoldParams(page).unfold).toBe('pieces');
    expect(new URL(page.url()).searchParams.get('line')).toBe(line);
    await expect(finish).toHaveValue(typed);
    await expect(finish, 'Back focuses the unsaved field').toBeFocused();
    expect(refused, 'Back wrote nothing; only the blur save reached the server').toBe(1);
    expect(await sameShell(page), 'Back held the unfold without a remount').toBe(true);
    await test.info().attach('spec-back-held', { body: await page.screenshot(), contentType: 'image/png' });

    await page.unroute(specWrite);
    await instrument(page).getByRole('button', { name: /Return to the room/ }).click();
    await expect(instrument(page)).toHaveCount(0, { timeout: 30_000 });
    expect(unfoldParams(page).unfold).toBeNull();
    expect(
      psqlScalar(`SELECT finish FROM public.project_ffe_specs WHERE ffe_item_id = '${line}';`),
      'the retry wrote the typed value',
    ).toBe(typed);
  });

  // Story log #40 — Back is held exactly like Return: a Back taken while the
  // save is still in flight waits on it; when it fails, the sheet stays open
  // on the marked field.
  test('Back over a pending Spec save that then fails stays open on the field', async ({
    authenticatedPage: page,
  }) => {
    const line = livingLineId('F01 Living Room selection 10');
    const typed = `Pending-Back finish ${Date.now()}`;
    await openJob(page);
    await holdShell(page);
    await (await livingRoomDoor(page)).click();
    await expect(instrument(page)).toBeVisible({ timeout: 30_000 });
    await instrument(page)
      .getByRole('group', { name: 'Schedule view' })
      .getByRole('button', { name: 'Specifications' })
      .click();
    await instrument(page).locator(`[data-line-id="${line}"] button`).click();
    const pane = instrument(page).getByTestId('spec-fields-pane');
    await expect(pane).toContainText('F01 Living Room selection 10', { timeout: 30_000 });
    const finish = pane.getByRole('textbox', { name: 'Finish' });
    await expect(finish).toBeVisible({ timeout: 30_000 });

    const specWrite = (url: URL) => url.pathname.endsWith('/rest/v1/project_ffe_specs');
    let sent = 0;
    let answer: () => void = () => {};
    const answered = new Promise<void>((resolve) => (answer = resolve));
    await page.route(specWrite, async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      sent += 1;
      await answered;
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'XX000', message: 'Forced failure (SQ-1900 e2e)' }),
      });
    });
    await finish.fill(typed);
    await finish.evaluate((el: HTMLElement) => el.blur());
    await expect.poll(() => sent, { timeout: 30_000 }).toBe(1);
    const length = await page.evaluate(() => history.length);

    await pressBack(page);
    await expect(instrument(page)).toBeVisible();
    expect(unfoldParams(page).unfold, 'a pending save holds Back').toBe('pieces');
    answer();
    await expect(instrument(page).getByText(/Your changes are not saved yet/)).toBeVisible({
      timeout: 30_000,
    });
    await expect(pane.getByRole('alert')).toContainText(/Forced failure|not saved/);
    await expect(finish).toHaveAttribute('aria-invalid', 'true');
    await expect(finish).toHaveValue(typed);
    await expect(finish, 'the failed save focuses its field').toBeFocused();
    expect(unfoldParams(page).unfold).toBe('pieces');
    expect(new URL(page.url()).searchParams.get('line')).toBe(line);
    expect(await page.evaluate(() => history.length), 'a held Back grows no history').toBe(length);
    expect(sent, 'Back replayed nothing').toBe(1);
    expect(await sameShell(page), 'Back held the unfold without a remount').toBe(true);
    await test.info().attach('spec-pending-back-failed', { body: await page.screenshot(), contentType: 'image/png' });

    await page.unroute(specWrite);
    await instrument(page).getByRole('button', { name: /Return to the room/ }).click();
    await expect(instrument(page)).toHaveCount(0, { timeout: 30_000 });
    expect(
      psqlScalar(`SELECT finish FROM public.project_ffe_specs WHERE ffe_item_id = '${line}';`),
      'the retry wrote the typed value',
    ).toBe(typed);
  });

  // Story log #40 — the unfold is the document's first entry (a client
  // navigation from the desk straight to its address): Back would leave the
  // document, and over a failed save it is held there all the same. Once the
  // save lands, the same Back goes on to the desk, once, without looping.
  // Next's popstate listener would unmount the sheet first, so the Back is
  // cancelled at its Navigation API `navigate` event. (`window.next.router`
  // is Next's debugging handle; it reaches this entry without a full page
  // load, across which only the beforeunload guard can ask.)
  for (const resume of [false, true]) {
    test(resume
      ? 'Back to the desk over a failed Spec save is held, then goes on to the desk once it lands'
      : 'Back to the desk over a failed Spec save is held', async ({
      authenticatedPage: page,
      browserName,
    }) => {
      if (resume) {
        test.skip(
          browserName !== 'chromium',
          'Story logs #42/#44: WebKit second-traversal observation unresolved under Playwright. Real-device Safari check owed at WP-11.',
        );
      }
      /**
       * Story logs #41/#42/#44 guarantee this cross-route hold only where the Back's
       * `navigate` event is cancelable. Outside Chromium (where activation is
       * granted below, so it must hold) a Back the browser makes
       * non-cancelable is the named residual: skip on that observed fact.
       */
      let traversals = 0;
      const backHeldWhereCancelable = async () => {
        const binding = `__sq1904Cancelable${++traversals}`;
        let cancelable: unknown = null;
        // Keep the observation outside the document the traversal may replace.
        await page.exposeBinding(binding, (_source, value: unknown) => {
          cancelable = value;
        });
        await page.evaluate((binding) => {
          const w = window as unknown as {
            navigation?: EventTarget;
            [key: string]: unknown;
          };
          const desk = new URL('/desk', window.location.href).href;
          const observe = (event: Event) => {
            const traversal = event as Event & {
              navigationType: string;
              destination: { url: string };
            };
            if (traversal.navigationType !== 'traverse' || traversal.destination.url !== desk) return;
            void (w[binding] as (value: boolean) => Promise<void>)(event.cancelable);
            w.navigation?.removeEventListener('navigate', observe);
          };
          w.navigation?.addEventListener('navigate', observe);
        }, binding);
        await pressBack(page);
        await expect.poll(
          () => typeof cancelable,
          { timeout: 10_000, message: 'the matching desk traverse must report boolean cancelable' },
        ).toBe('boolean');
        await test.info().attach('back-navigate-cancelable', {
          body: `${browserName}: ${String(cancelable)}`,
          contentType: 'text/plain',
        });
        if (browserName === 'chromium') {
          expect(cancelable, 'Chromium desk Back must be cancelable').toBe(true);
        }
        test.skip(
          cancelable === false,
          `Story logs #41/#42/#44: this ${browserName} cross-route Back observed cancelable=false, so it cannot be held (accepted residual).`,
        );
      };
      const line = livingLineId('F01 Living Room selection 11');
      const typed = `Desk-held finish ${Date.now()}`;
      await openJob(page); // compiles /doc before the client navigation below
      await page.goto('about:blank');
      await page.goto('/desk', { waitUntil: 'domcontentloaded' });
      const studio = page.locator('[data-studio="round8"]');
      // Hydrated and settled (studio.spec.ts), so Next's router is in place.
      await expect(studio).toHaveAttribute('data-arrival-ready', '', { timeout: 60_000 });
      const address = `/doc/${JOB}?unfold=pieces&lens=spec&room=${LIVING}&line=${line}`;
      await page.evaluate((href) => {
        (window as unknown as { next: { router: { push(href: string): void } } }).next.router.push(href);
      }, address);
      await expect(instrument(page)).toBeVisible({ timeout: 60_000 });
      await holdShell(page);
      const pane = instrument(page).getByTestId('spec-fields-pane');
      await expect(pane).toContainText('F01 Living Room selection 11', { timeout: 30_000 });
      const finish = pane.getByRole('textbox', { name: 'Finish' });
      await expect(finish).toBeVisible({ timeout: 30_000 });

      const specWrite = (url: URL) => url.pathname.endsWith('/rest/v1/project_ffe_specs');
      let refused = 0;
      await page.route(specWrite, (route) => {
        if (route.request().method() !== 'PATCH') return route.continue();
        refused += 1;
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'XX000', message: 'Forced failure (SQ-1900 e2e)' }),
        });
      });
      await finish.fill(typed);
      // A real keystroke in the field: the activation a cancelable Back needs.
      // Story log #41 guarantees this cross-route hold only with activation.
      await finish.press('End');
      await finish.evaluate((el: HTMLElement) => el.blur());
      await expect(finish).toHaveAttribute('aria-invalid', 'true', { timeout: 30_000 });
      const length = await page.evaluate(() => history.length);
      const documentBefore = await page.evaluate(() => {
        const w = window as unknown as {
          __sq1904Document?: Document;
          navigation?: { currentEntry?: { key: string; id: string; url: string } };
        };
        w.__sq1904Document = document;
        const entry = w.navigation?.currentEntry;
        return { key: entry?.key, id: entry?.id, url: entry?.url };
      });

      await backHeldWhereCancelable();
      await expect(instrument(page).getByText(/Your changes are not saved yet/)).toBeVisible({
        timeout: 30_000,
      });
      expect(new URL(page.url()).pathname, 'Back did not leave the document').toBe(`/doc/${JOB}`);
      expect(unfoldParams(page).unfold).toBe('pieces');
      expect(new URL(page.url()).searchParams.get('line')).toBe(line);
      await expect(pane.getByRole('alert')).toContainText(/Forced failure|not saved/);
      await expect(finish).toHaveAttribute('aria-invalid', 'true');
      await expect(finish).toHaveValue(typed);
      await expect(finish, 'Back focuses the unsaved field').toBeFocused();
      expect(await sameShell(page), 'Back held the unfold without a remount').toBe(true);
      expect(await page.evaluate(() => history.length), 'a held Back grows no history').toBe(length);
      await test.info().attach('spec-desk-back-held', { body: await page.screenshot(), contentType: 'image/png' });
      if (!resume) return;

      // The retry is held in flight, so the next Back waits on it.
      await page.unroute(specWrite);
      let retried = 0;
      let land: () => void = () => {};
      const landed = new Promise<void>((resolve) => (land = resolve));
      await page.route(specWrite, async (route) => {
        if (route.request().method() !== 'PATCH') return route.continue();
        retried += 1;
        await landed;
        return route.continue();
      });
      // A cancelled Back spends the activation; she is back in the field. A
      // second Back without it is #41's named residual, so it is re-granted.
      await finish.press('End');
      await finish.evaluate((el: HTMLElement) => el.blur());
      await expect.poll(() => retried, { timeout: 30_000 }).toBe(1);
      await backHeldWhereCancelable();
      await expect(instrument(page)).toBeVisible();
      expect(new URL(page.url()).pathname, 'a pending save holds Back too').toBe(`/doc/${JOB}`);
      expect(unfoldParams(page).unfold).toBe('pieces');
      expect(await page.evaluate(() => history.length)).toBe(length);
      land();
      await expect(page).toHaveURL(/\/desk(\?|$)/, { timeout: 30_000 });
      await expect(studio).toBeVisible({ timeout: 30_000 });
      const documentAfter = await page.evaluate(() => {
        const w = window as unknown as {
          __sq1904Document?: Document;
          navigation?: { currentEntry?: { key: string; id: string; url: string } };
        };
        const entry = w.navigation?.currentEntry;
        return { sameDocument: w.__sq1904Document === document, key: entry?.key, id: entry?.id, url: entry?.url };
      });
      await test.info().attach('desk-traversal-document', {
        body: JSON.stringify({ before: documentBefore, after: documentAfter }),
        contentType: 'application/json',
      });
      expect(await page.evaluate(() => history.length), 'the Back went on without a loop').toBe(length);
      expect(retried, 'the held Back replayed nothing').toBe(1);
      expect(
        psqlScalar(`SELECT finish FROM public.project_ffe_specs WHERE ffe_item_id = '${line}';`),
        'the retry wrote the typed value',
      ).toBe(typed);
      await page.unroute(specWrite);
    });
  }
});

/**
 * The browser's Back button. A Back the sheet holds never commits, so
 * `page.goBack()` would wait on it until its timeout; this asks for the
 * previous entry and returns, and the caller asserts where it ends up.
 * Chromium takes it the way the toolbar does (CDP); elsewhere, with no CDP,
 * the page asks for it itself.
 */
async function pressBack(page: Page) {
  if (page.context().browser()?.browserType().name() !== 'chromium') {
    await page.evaluate(() => {
      history.back();
    });
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  const { currentIndex, entries } = await cdp.send('Page.getNavigationHistory');
  await cdp.send('Page.navigateToHistoryEntry', { entryId: entries[currentIndex - 1].id });
  await cdp.detach();
}

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
