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

    test('touch/keyboard fit, conflict recovery, reload and mounted Return/Back hold', async ({ authenticatedPage: page }, testInfo) => {
      const line = psqlScalar(`SELECT id FROM public.project_ffe_items WHERE project_id='${JOB}' AND project_room_id='${ROOM}' AND name='F01 Living Room selection 01' AND removed_at IS NULL;`);
      expect(line).toMatch(/^[0-9a-f-]{36}$/);
      await page.goto(`/doc/${JOB}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await expect(page.locator('[data-arrival-ready]')).toHaveCount(1, { timeout: 60_000 });
      await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/);
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

      for (const method of ['Return', 'Back'] as const) {
        pane = await openLine(page, line);
        finish = pane.getByRole('textbox', { name: 'Finish' });
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
        try {
          await finish.fill(saved);
          await finish.press('Enter');
          await expect.poll(() => started).toBe(true);
          if (method === 'Return') {
            await instrument(page).getByRole('button', { name: /Return to the room/ }).tap();
          } else {
            // Same-route traversal is the guaranteed Navigation API hold.
            await page.evaluate(() => history.back());
          }
          await expect(instrument(page), `${method} waits for the mounted row writer`).toHaveAttribute('data-unfold-state', 'saving');
          await expect(instrument(page)).toBeVisible();
          await expect(finish).toHaveValue(saved);
        } finally { release(); }
        await expect.poll(() => finishOf(line)).toBe(saved);
        await expect(instrument(page), `${method} completes after acknowledgement`).toHaveCount(0);
        await page.unroute(specWrite);
      }

      await page.goto(`/doc/${JOB}?unfold=pieces&lens=spec&room=${ROOM}&line=00000000-0000-4000-8000-000000000099`, { waitUntil: 'domcontentloaded' });
      await expect(instrument(page).locator('[data-spec-line-missing]')).toHaveText('That line is no longer in this room.');
      await expect(instrument(page).getByTestId('spec-fields-pane')).toBeVisible();
      // Noncancelable cross-route exits/no Navigation API remain WP-11 residuals.
    });
  });
}
