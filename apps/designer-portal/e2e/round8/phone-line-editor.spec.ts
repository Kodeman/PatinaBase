import { test, expect } from '../fixtures/auth';
import type { Page } from '@playwright/test';
import { psqlRun, psqlScalar } from '../helpers/psql';

const JOB = 'f0180000-0000-4000-8000-000000000010';
const ROOM = 'f0180000-0000-4000-8000-000000000011';
const instrument = (page: Page) => page.locator('[data-unfold-instrument="pieces"]');
const specWrite = (url: URL) => url.pathname.endsWith('/rest/v1/project_ffe_specs');
const finishOf = (line: string) => psqlScalar(`SELECT coalesce(finish, '') FROM public.project_ffe_specs WHERE ffe_item_id='${line}';`);

async function openLine(page: Page, line: string) {
  const chapter = page.locator('[data-paper-chapter="ffe"]');
  await chapter.scrollIntoViewIfNeeded();
  await expect(chapter).toHaveAttribute('data-density', 'full');
  const room = chapter.locator(`[data-pieces-room="${ROOM}"]`);
  const toggle = room.getByRole('button', { name: 'Living Room', exact: true });
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await room.getByRole('link', { name: /Edit room selections/ }).click();
  const sheet = instrument(page);
  await expect(sheet).toBeVisible();
  const spec = sheet.getByRole('button', { name: 'Specifications' });
  await spec.focus();
  await spec.press('Enter');
  const row = sheet.locator(`[data-line-id="${line}"] > button`);
  await row.tap();
  const pane = sheet.getByTestId('spec-fields-pane');
  await expect(pane.getByRole('heading', { level: 2 })).toBeFocused();
  await expect(pane.getByRole('textbox', { name: 'Finish' })).toBeVisible();
  return pane;
}

for (const width of [320, 390]) {
  test.describe(`C03 fitted phone editor at ${width}`, () => {
    test.use({ viewport: { width, height: 844 }, hasTouch: true });
    test.setTimeout(240_000);

    if (width === 390) test('superseded pending refusal notifies once by line name without taking the newer line', async ({ authenticatedPage: page }) => {
      await page.addInitScript(() => Object.defineProperty(window, 'navigation', { configurable: true, value: undefined }));
      const lineA = psqlScalar(`SELECT id FROM public.project_ffe_items WHERE project_id='${JOB}' AND project_room_id='${ROOM}' AND name='F01 Living Room selection 02' AND removed_at IS NULL;`);
      const lineB = psqlScalar(`SELECT id FROM public.project_ffe_items WHERE project_id='${JOB}' AND project_room_id='${ROOM}' AND name='F01 Living Room selection 03' AND removed_at IS NULL;`);
      expect(lineA).toMatch(/^[0-9a-f-]{36}$/);
      expect(lineB).toMatch(/^[0-9a-f-]{36}$/);
      await page.goto(`/doc/${JOB}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await expect(page.locator('[data-arrival-ready]')).toHaveCount(1, { timeout: 60_000 });
      await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/);
      const older = await openLine(page, lineA);
      const original = finishOf(lineA);
      let release = () => {};
      const gate = new Promise<void>(resolve => { release = resolve; });
      let started = false;
      let writes = 0;
      await page.route(specWrite, async route => {
        if (route.request().method() !== 'PATCH') return route.continue();
        started = true;
        writes++;
        await gate;
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'SQ-2024 superseded refusal' }) });
      });
      try {
        const finish = older.getByRole('textbox', { name: 'Finish' });
        await finish.fill('Superseded linen');
        await finish.press('Enter');
        await expect.poll(() => started).toBe(true);
        await page.evaluate(() => history.back());
        await expect(instrument(page)).toHaveCount(0);
        await expect(page.locator('[data-unfold-retained]')).toHaveCount(1);
        const newer = await openLine(page, lineB);
        const newerHeading = newer.getByRole('heading', { level: 2 });
        await expect(newerHeading).toBeFocused();
        release();
        const notifications = page.getByRole('region', { name: 'Notifications (F8)' });
        const notification = notifications.getByText("Your change to F01 Living Room selection 02 wasn't saved.", { exact: true });
        await expect(notification).toBeVisible();
        await expect(notification).toHaveCount(1);
        await expect(page.locator('[data-unfold-retained]')).toHaveCount(0);
        await expect(newerHeading).toBeFocused();
        await expect(instrument(page)).toBeVisible();
        expect(new URL(page.url()).searchParams.get('line')).toBe(lineB);
        expect(finishOf(lineA), 'refusal leaves the acknowledged row unchanged').toBe(original);
        expect(writes, 'one user act issues one write and one notification').toBe(1);
      } finally {
        release();
        await page.unroute(specWrite);
      }
    });

    for (const destination of ['inline', 'off-job', 'returned'] as const) {
      const leaveJob = destination !== 'inline';
      test(`absent API late refusal ${destination === 'returned' ? 'toasts once after returning to the same job' : leaveJob ? 'uses the existing off-job error surface' : 'recovers the draft and focused alert'}`, async ({ authenticatedPage: page }, testInfo) => {
        await page.addInitScript(() => Object.defineProperty(window, 'navigation', { configurable: true, value: undefined }));
        const line = psqlScalar(`SELECT id FROM public.project_ffe_items WHERE project_id='${JOB}' AND project_room_id='${ROOM}' AND name='F01 Living Room selection 02' AND removed_at IS NULL;`);
        expect(line).toMatch(/^[0-9a-f-]{36}$/);
        await page.goto(`/doc/${JOB}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
        await expect(page.locator('[data-arrival-ready]')).toHaveCount(1, { timeout: 60_000 });
        await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/);
        const pane = await openLine(page, line);
        const finish = pane.getByRole('textbox', { name: 'Finish' });
        const original = finishOf(line);
        const draft = `Absent API ${testInfo.project.name} ${width} ${leaveJob ? 'off-job' : 'recovery'}`;
        let release = () => {};
        const gate = new Promise<void>(resolve => { release = resolve; });
        let writes = 0;
        page.on('request', request => {
          if (request.method() === 'PATCH' && specWrite(new URL(request.url()))) writes++;
        });
        let started = false;
        await page.route(specWrite, async route => {
          if (route.request().method() !== 'PATCH') return route.continue();
          started = true;
          await gate;
          await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'SQ-2015 late refusal' }) });
        });
        try {
          await finish.fill(draft);
          await finish.press('Enter');
          await expect.poll(() => started).toBe(true);
          await page.evaluate(() => history.back());
          await expect(instrument(page)).toHaveCount(0);
          const retained = page.locator('[data-unfold-retained]');
          await expect(retained).toHaveCount(1);
          await expect(retained).toHaveAttribute('hidden', '');
          await expect(retained).toHaveAttribute('inert', '');
          await expect(retained).toBeHidden();
          if (leaveJob) {
            await page.evaluate(() => (window as unknown as { next: { router: { push: (url: string) => void } } }).next.router.push('/desk'));
            await expect(page).toHaveURL(/\/desk(?:\?|$)/);
            await expect(page.locator('[data-studio="round8"]')).toHaveAttribute('data-arrival-ready', '');
            await expect(retained).toHaveCount(0);
            if (destination === 'returned') {
              await page.evaluate(job => (window as unknown as { next: { router: { push: (url: string) => void } } }).next.router.push(`/doc/${job}`), JOB);
              await expect(page).toHaveURL(new RegExp(`/doc/${JOB}(?:\\?|$)`));
              await expect(page.locator('[data-arrival-ready]')).toHaveCount(1, { timeout: 60_000 });
              await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/);
              await expect(instrument(page)).toHaveCount(0);
            }
          }
        } finally { release(); }
        if (leaveJob) {
          await expect(page.getByRole('region', { name: 'Notifications (F8)' }).getByText('SQ-2015 late refusal', { exact: true }), 'existing MutationCache → showErrorToast tells the designer').toBeVisible();
          await expect(page.getByRole('region', { name: 'Notifications (F8)' }).getByText('SQ-2015 late refusal', { exact: true })).toHaveCount(1);
          await expect(instrument(page)).toHaveCount(0);
          expect(finishOf(line)).toBe(original);
          expect(writes).toBe(1);
        } else {
          await expect(instrument(page)).toBeVisible();
          await expect(pane).toHaveCount(1);
          await expect(finish).toHaveValue(draft);
          await expect(pane.getByRole('alert')).toBeVisible();
          await expect(pane.getByRole('alert')).toBeFocused();
          expect(finishOf(line)).toBe(original);
          expect(writes).toBe(1);
          await page.unroute(specWrite);
          await finish.press('Enter');
          await expect.poll(() => finishOf(line)).toBe(draft);
          await expect(finish).not.toHaveAttribute('aria-invalid', 'true');
          expect(writes).toBe(2);
          await page.reload({ waitUntil: 'domcontentloaded' });
          await expect(instrument(page).getByRole('textbox', { name: 'Finish' })).toHaveValue(draft);
          expect(writes, 'reload never replays a recovered draft').toBe(2);
        }
        await page.unroute(specWrite);
      });
    }

    test('touch/keyboard fit, conflict recovery, reload and mounted Return/Back hold', async ({ authenticatedPage: page }, testInfo) => {
      const line = psqlScalar(`SELECT id FROM public.project_ffe_items WHERE project_id='${JOB}' AND project_room_id='${ROOM}' AND name='F01 Living Room selection 01' AND removed_at IS NULL;`);
      expect(line).toMatch(/^[0-9a-f-]{36}$/);
      await page.goto(`/doc/${JOB}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await expect(page.locator('[data-arrival-ready]')).toHaveCount(1, { timeout: 60_000 });
      await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/);
      const hasNavigation = await page.evaluate(() => 'navigation' in window);
      await testInfo.attach('navigation-capability', {
        body: Buffer.from(JSON.stringify({ project: testInfo.project.name, navigation: hasNavigation })),
        contentType: 'application/json',
      });
      const opener = page.locator(`[data-pieces-room="${ROOM}"]`).getByRole('link', { name: /Edit room selections/ });
      let writes = 0;
      page.on('request', request => {
        if (request.method() === 'PATCH' && specWrite(new URL(request.url()))) writes++;
      });
      let pane = await openLine(page, line);
      let finish = pane.getByRole('textbox', { name: 'Finish' });
      const geometry = await pane.evaluate(node => {
        const input = node.querySelector<HTMLInputElement>('input[aria-label="Finish"]')!;
        const image = node.querySelector<HTMLElement>('[data-testid="spec-image-drop"]')!;
        const scrolling = document.scrollingElement!;
        const scrollTraps: string[] = [];
        for (let ancestor = node.parentElement; ancestor && ancestor !== scrolling; ancestor = ancestor.parentElement) {
          if (/^(auto|scroll)$/.test(getComputedStyle(ancestor).overflowY) && ancestor.scrollHeight > ancestor.clientHeight + 1) {
            scrollTraps.push(ancestor.tagName);
          }
        }
        return {
          target: input.getBoundingClientRect().height,
          paneWidth: node.clientWidth, paneScroll: node.scrollWidth,
          image: image.getBoundingClientRect().width,
          widest: Math.max(...Array.from(node.querySelectorAll('*'), element => element.getBoundingClientRect().width)),
          scrollTraps,
          labelSize: getComputedStyle(node.querySelector('[role="group"][aria-label="Finish"] > span')!).fontSize,
          pageWidth: scrolling.clientWidth, pageScroll: scrolling.scrollWidth,
        };
      });
      expect(geometry.target, 'fitted text controls have 44px touch targets').toBeGreaterThanOrEqual(44);
      expect(geometry.labelSize, 'painted operational labels meet the 12px floor').toBe('12px');
      expect(geometry.paneScroll, 'editor content fits rather than hiding overflow').toBeLessThanOrEqual(geometry.paneWidth + 1);
      expect(geometry.image).toBeLessThanOrEqual(geometry.paneWidth);
      expect(geometry.widest).toBeLessThanOrEqual(geometry.pageWidth);
      expect(geometry.pageScroll).toBeLessThanOrEqual(geometry.pageWidth);
      // Lead C03 ruling: containment is horizontal on continuous paper (R8-02).
      // The page owns vertical scroll; a nested overflowing body is a phone scroll trap.
      expect(geometry.scrollTraps).toEqual([]);
      await finish.focus();
      await expect(finish).toBeFocused();
      await expect.poll(() => finish.evaluate(input => {
        const rect = input.getBoundingClientRect();
        const viewport = window.visualViewport;
        const top = viewport?.offsetTop ?? 0;
        const left = viewport?.offsetLeft ?? 0;
        return rect.top >= top - 1 && rect.bottom <= top + (viewport?.height ?? innerHeight) + 1 &&
          rect.left >= left - 1 && rect.right <= left + (viewport?.width ?? innerWidth) + 1;
      }), { message: 'focused field is inside the visual viewport' }).toBe(true);
      await testInfo.attach(`editor-${width}`, { body: await page.screenshot(), contentType: 'image/png' });

      const original = finishOf(line);
      const draft = `Phone draft ${width}`;
      await page.route(specWrite, route => route.request().method() === 'PATCH'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'C03 forced refusal', code: 'XX000' }) })
        : route.continue());
      await finish.fill(draft);
      await finish.press('Enter');
      await expect(pane.getByRole('alert')).toHaveText('The field was not saved.');
      await expect(finish).toHaveValue(draft);
      await expect(finish).toBeFocused();
      await instrument(page).getByRole('button', { name: /Return to the room/ }).tap();
      await expect(instrument(page)).toBeVisible();
      await expect(finish).toBeFocused();
      await expect(finish).toHaveValue(draft);
      expect(finishOf(line), 'refused drafts never reach the row').toBe(original);
      await page.unroute(specWrite);

      // The peer advances the actual local row, not a mocked conflict response.
      psqlRun(`UPDATE public.project_ffe_specs SET finish='C03 peer finish' WHERE ffe_item_id='${line}' AND EXISTS (SELECT 1 FROM public.project_ffe_items WHERE id='${line}' AND project_id='${JOB}');`);
      await finish.press('Enter');
      await expect(pane.getByRole('alert')).toContainText(/changed in another session/);
      await expect(finish).toHaveValue(draft);
      await expect(finish).toBeFocused();
      expect(finishOf(line)).toBe('C03 peer finish');
      await finish.fill(original);
      await finish.press('Enter');
      await expect(finish).not.toHaveAttribute('aria-invalid', 'true');
      const beforeReload = writes;
      await page.reload({ waitUntil: 'domcontentloaded' });
      pane = instrument(page).getByTestId('spec-fields-pane');
      finish = pane.getByRole('textbox', { name: 'Finish' });
      await expect(finish).toHaveValue('C03 peer finish', { timeout: 60_000 });
      expect(writes, 'reloading the stable line never replays a write').toBe(beforeReload);
      await expect.poll(() => new URL(page.url()).searchParams.get('line')).toBe(line);
      await instrument(page).getByRole('button', { name: /Return to the room/ }).click();
      await expect(instrument(page)).toHaveCount(0);

      let staleNavigation = false;
      for (const method of ['Return', 'Back'] as const) {
        pane = await openLine(page, line);
        finish = pane.getByRole('textbox', { name: 'Finish' });
        const capability = await page.evaluate(() => {
          const navigation = (window as unknown as { navigation?: { currentEntry?: { url: string } } }).navigation;
          return { url: location.href, entryUrl: navigation?.currentEntry?.url ?? null };
        });
        const usableNavigation = capability.entryUrl === capability.url;
        staleNavigation ||= capability.entryUrl !== null && !usableNavigation;
        await testInfo.attach(`${method}-navigation-${width}`, { body: Buffer.from(JSON.stringify(capability)), contentType: 'application/json' });
        let release = () => {};
        const gate = new Promise<void>(resolve => { release = resolve; });
        let started = false;
        await page.route(specWrite, async route => {
          if (route.request().method() !== 'PATCH') return route.continue();
          started = true;
          await gate;
          await route.continue();
        });
        const saved = `${method} saved ${width}`;
        let writesBeforeAcknowledgement = writes;
        try {
          await finish.fill(saved);
          await finish.press('Enter');
          await expect.poll(() => started).toBe(true);
          writesBeforeAcknowledgement = writes;
          if (method === 'Return') {
            await instrument(page).getByRole('button', { name: /Return to the room/ }).tap();
          } else {
            // Observe the browser-owned route identity before Back changes location.
            let signal: unknown = null;
            await page.exposeBinding('__sq2009SameRoute', (_source, value: unknown) => { signal = value; });
            await page.evaluate(() => {
              const w = window as unknown as { navigation?: EventTarget; __sq2009SameRoute: (value: unknown) => Promise<void> };
              const observe = (event: Event) => {
                const traversal = event as Event & { navigationType: string; destination: { url: string } };
                if (traversal.navigationType !== 'traverse') return;
                void w.__sq2009SameRoute({ destinationPathname: new URL(traversal.destination.url).pathname, locationPathname: location.pathname });
                w.navigation?.removeEventListener('navigate', observe);
              };
              w.navigation?.addEventListener('navigate', observe);
              history.back();
            });
            await expect.poll(() => signal).not.toBeNull();
            await testInfo.attach('same-route-destination', { body: Buffer.from(JSON.stringify(signal)), contentType: 'application/json' });
          }
          if (method === 'Back' && !usableNavigation) {
            testInfo.annotations.push({ type: 'residual', description: 'Stale or absent Navigation API: Back folds before acknowledgement (legacy no-API parity, SQ-2009 lead ruling)' });
            await expect(instrument(page), 'unusable Navigation API Back folds before acknowledgement').toHaveCount(0);
            await expect(opener).toBeFocused();
          } else {
            await expect(instrument(page), `${method} waits for the mounted row writer`).toHaveAttribute('data-unfold-state', 'saving');
            await expect(instrument(page)).toBeVisible();
            await expect(finish).toHaveValue(saved);
          }
        } finally { release(); }
        await expect.poll(() => finishOf(line)).toBe(saved);
        await expect(instrument(page), `${method} completes after acknowledgement`).toHaveCount(0);
        expect(writes, `${method} never duplicates or replays the save`).toBe(writesBeforeAcknowledgement);
        await expect(opener, `${method} returns focus to the room opener`).toBeFocused();
        expect(new URL(page.url()).searchParams.has('unfold'), 'the closed sheet leaves no unfold address').toBe(false);
        await page.unroute(specWrite);
        if (method === 'Back' && !usableNavigation) {
          const acknowledgedWrites = writes;
          await page.reload({ waitUntil: 'domcontentloaded' });
          await expect(page.locator('[data-arrival-ready]')).toHaveCount(1);
          await expect(instrument(page)).toHaveCount(0);
          expect(finishOf(line)).toBe(saved);
          expect(writes, 'reload after an early fold never replays the acknowledged save').toBe(acknowledgedWrites);
        }
      }

      if (staleNavigation) {
        pane = await openLine(page, line);
        finish = pane.getByRole('textbox', { name: 'Finish' });
        const acknowledged = finishOf(line);
        const abandoned = `Late refusal ${width}`;
        let release = () => {};
        const gate = new Promise<void>(resolve => { release = resolve; });
        let started = false;
        await page.route(specWrite, async route => {
          if (route.request().method() !== 'PATCH') return route.continue();
          started = true;
          await gate;
          await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'SQ-2009 late refusal', code: 'XX000' }) });
        });
        const refused = page.waitForResponse(response => response.request().method() === 'PATCH' && specWrite(new URL(response.url())) && response.status() === 500);
        const handled = page.waitForEvent('console', message => message.type() === 'error' && message.text().includes('Error:') && message.text().includes('SQ-2009 late refusal'));
        try {
          await finish.fill(abandoned);
          await finish.press('Enter');
          await expect.poll(() => started).toBe(true);
          await page.evaluate(() => history.back());
          await expect(instrument(page), 'stale API permits Back before a later refusal').toHaveCount(0);
          await expect(opener).toBeFocused();
        } finally { release(); }
        await refused;
        await handled;
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        await page.unroute(specWrite);
        expect(finishOf(line), 'late refusal never changes the acknowledged row').toBe(acknowledged);
        await expect(instrument(page), 'late refusal resurfaces the same sheet').toBeVisible();
        await expect(finish).toHaveValue(abandoned);
        await expect(pane.getByRole('alert')).toBeVisible();
        await expect(pane.getByRole('alert'), 'recovery focuses its inline alert').toBeFocused();
        expect(new URL(page.url()).searchParams.get('line')).toBe(line);
        await finish.press('Enter');
        await expect.poll(() => finishOf(line)).toBe(abandoned);
        await expect(finish).not.toHaveAttribute('aria-invalid', 'true');
        const recoveredWrites = writes;
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(instrument(page).getByRole('textbox', { name: 'Finish' })).toHaveValue(abandoned);
        expect(writes, 'reload never replays the recovered write').toBe(recoveredWrites);
      }

      await page.goto(`/doc/${JOB}?unfold=pieces&lens=spec&room=${ROOM}&line=00000000-0000-4000-8000-000000000099`, { waitUntil: 'domcontentloaded' });
      await expect(instrument(page).locator('[data-spec-line-missing]')).toHaveText('That line is no longer in this room.');
      await expect(instrument(page).getByTestId('spec-fields-pane')).toBeVisible();
      // Noncancelable cross-route exits/no Navigation API remain WP-11 residuals.
    });
  });
}
