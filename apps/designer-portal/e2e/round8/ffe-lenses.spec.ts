import type { Locator } from '@playwright/test';
import { test, expect } from '../fixtures/auth';
import { psqlScalar } from '../helpers/psql';

const JOB = 'f0180000-0000-4000-8000-000000000010';
const ROOM = 'f0180000-0000-4000-8000-000000000011';

async function expectMenuAboveRail(items: Locator) {
  await expect(items.first()).toBeVisible();
  for (const item of await items.all()) {
    await expect.poll(() => item.evaluate((node) => {
      const r = node.getBoundingClientRect();
      const rail = document.querySelector('[data-testid="mobile-bar"]');
      const railRect = rail?.getBoundingClientRect();
      const bottom = railRect?.height ? railRect.top : innerHeight;
      let clipBottom = bottom;
      let clipTop = 0;
      for (let parent = node.parentElement; parent; parent = parent.parentElement) {
        if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowY)) {
          const clip = parent.getBoundingClientRect();
          clipBottom = Math.min(clipBottom, clip.bottom);
          clipTop = Math.max(clipTop, clip.top);
        }
      }
      const visible = r.bottom <= clipBottom && r.top >= clipTop && r.left >= 0 && r.right <= innerWidth
        && node.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
      return visible ? 'visible' : JSON.stringify({
        label: node.textContent,
        rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right },
        clipTop, clipBottom,
      });
    }, { timeout: 5000 }), { message: 'Menu item fully visible above the bottom rail' }).toBe('visible');
  }
}

test.describe('phone Rough-in acts', () => {
  test.use({ hasTouch: true });
  for (const legacy of [false, true]) {
    test(`every parent and Move action is visible and activatable${legacy ? ' @renderer-off' : ''}`, async ({ authenticatedPage: page }, info) => {
      test.setTimeout(240_000);
      await page.setViewportSize({ width: info.project.name === 'webkit-iphone' ? 390 : 320, height: 664 });
      await page.goto(legacy ? `/doc/${JOB}/pieces?lens=rough&room=${ROOM}` : `/doc/${JOB}?unfold=pieces&lens=rough&room=${ROOM}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      const sheet = page.getByTestId('build-room');
      await expect(sheet).toBeVisible({ timeout: 60_000 });
      if (!legacy) await expect(page.locator('[data-arrival-ready]')).toHaveCount(1, { timeout: 60_000 });
      await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/, { timeout: 30_000 });
      const name = 'F01 Living Room selection 36';
      const acts = () => sheet.getByRole('button', { name: `Acts for ${name}`, exact: true });
      const rowRoom = () => psqlScalar(`SELECT project_room_id FROM public.project_ffe_items WHERE project_id='${JOB}' AND name='${name}' AND removed_at IS NULL`);
      for (const keyboard of [true, false]) {
        const activate = async (item: Locator) => {
          if (keyboard) { await item.focus(); await page.keyboard.press('Enter'); }
          else await item.tap();
        };
        const openActs = async () => {
          const trigger = acts();
          await trigger.focus();
          await trigger.evaluate((button) => {
            const body = button.closest('[data-drafting-stock]')!.querySelector('main, section[aria-labelledby]')!;
            const rail = document.querySelector('[data-testid="mobile-bar"]')!.getBoundingClientRect();
            const bottom = Math.min(body.getBoundingClientRect().bottom, rail.top);
            body.scrollTop += button.getBoundingClientRect().bottom - bottom + 8;
          });
          if (keyboard) await page.keyboard.press('Enter');
          else await trigger.tap();
        };
        for (const action of ['Fill with a product', 'Also place in…', 'Remove']) {
          await openActs();
          await expectMenuAboveRail(page.getByRole('menuitem'));
          await activate(page.getByRole('menuitem', { name: action, exact: true }));
          if (action === 'Remove') {
            await expect.poll(() => rowRoom()).toBe('');
            await activate(sheet.getByRole('button', { name: 'Undo', exact: true }));
            await expect.poll(() => rowRoom()).toBe(ROOM);
            await expect(acts()).toBeVisible();
          } else {
            const tool = sheet.locator(`[data-rough-in-tool="${action.startsWith('Fill') ? 'fill' : 'alsoPlace'}"]`);
            await expect(tool).toBeVisible();
            await activate(tool.getByRole('button', { name: 'Close', exact: true }));
          }
        }
        for (const room of ['Living Room', 'Dining Room', 'Bedroom']) {
          await openActs();
          await activate(page.getByRole('menuitem', { name: 'Move to room…', exact: true }));
          await expectMenuAboveRail(page.getByRole('menuitem'));
          const menu = page.getByRole('menu', { name: 'Move to room', exact: true });
          await activate(menu.getByRole('menuitem', { name: room === 'Living Room' ? /Living Room/ : room, exact: true }));
          if (room === 'Living Room') {
            await expect(menu).toHaveCount(0);
            await page.keyboard.press('Escape');
          } else {
            const target = room === 'Dining Room' ? 'f0180000-0000-4000-8000-000000000012' : 'f0180000-0000-4000-8000-000000000013';
            await expect.poll(() => rowRoom()).toBe(target);
            await expect(sheet.getByRole('region', { name: room, exact: true }).getByRole('button', { name: `Acts for ${name}`, exact: true })).toBeVisible();
            await expect(acts()).toBeFocused();
            await openActs();
            await activate(page.getByRole('menuitem', { name: 'Move to room…', exact: true }));
            await activate(page.getByRole('menu', { name: 'Move to room', exact: true }).getByRole('menuitem', { name: 'Living Room', exact: true }));
            await expect.poll(() => rowRoom()).toBe(ROOM);
            await expect(acts()).toBeFocused();
          }
        }
      }
      await page.screenshot({ path: info.outputPath('phone-menu-actions.png') });
      expect(rowRoom()).toBe(ROOM);
    });

    test(`short viewport contains and scrolls the expanded menu${legacy ? ' @renderer-off' : ''}`, async ({ authenticatedPage: page }, info) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width: info.project.name === 'webkit-iphone' ? 390 : 320, height: 664 });
      await page.goto(legacy ? `/doc/${JOB}/pieces?lens=rough&room=${ROOM}` : `/doc/${JOB}?unfold=pieces&lens=rough&room=${ROOM}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      const sheet = page.getByTestId('build-room');
      await expect(sheet).toBeVisible({ timeout: 60_000 });
      if (!legacy) await expect(page.locator('[data-arrival-ready]')).toHaveCount(1, { timeout: 60_000 });
      await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/, { timeout: 30_000 });
      const trigger = sheet.getByRole('button', { name: 'Acts for F01 Living Room selection 36', exact: true });
      await trigger.click();
      await page.getByRole('menuitem', { name: 'Move to room…', exact: true }).click();
      await page.setViewportSize({ width: info.project.name === 'webkit-iphone' ? 390 : 320, height: 320 });
      const menu = page.getByRole('menu', { name: 'Acts for F01 Living Room selection 36', exact: true });
      await expect.poll(() => menu.evaluate((node) => {
        const r = node.getBoundingClientRect();
        const viewport = window.visualViewport!;
        const rail = document.querySelector('[data-testid="mobile-bar"]')!.getBoundingClientRect();
        const fits = r.top >= viewport.offsetTop && r.bottom <= Math.min(viewport.offsetTop + viewport.height, rail.top);
        const scrolls = node.scrollHeight > node.clientHeight;
        return fits && scrolls ? 'fits-and-scrolls' : JSON.stringify({
          fits, scrolls, top: r.top, bottom: r.bottom, railTop: rail.top,
          viewportTop: viewport.offsetTop, viewportHeight: viewport.height,
          scrollHeight: node.scrollHeight, clientHeight: node.clientHeight,
        });
      }), { message: 'Expanded menu fits the short visual viewport above the rail and scrolls internally' }).toBe('fits-and-scrolls');
      for (const item of await menu.getByRole('menuitem').all()) {
        await item.focus();
        await expectMenuAboveRail(item);
      }
      const here = menu.getByRole('menuitem', { name: /Living Room/ });
      await here.scrollIntoViewIfNeeded();
      await here.tap();
      await expect(page.getByRole('menu', { name: 'Move to room', exact: true })).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
      await page.screenshot({ path: info.outputPath('short-viewport-menu.png') });
    });
  }
});

const readings = [
  { lens: 'rough', button: 'Preliminary selections', title: 'Preliminary selections' },
  { lens: 'price', button: 'Pricing', title: 'Pricing the room' },
  { lens: 'release', button: 'Purchasing authorization', title: 'Purchasing authorization' },
  { lens: 'finishes', button: 'Finish schedule', title: 'Room finishes' },
] as const;

test('four specialized lenses retain the room and native instruments', async ({ authenticatedPage: page }, info) => {
  test.setTimeout(240_000);
  expect(psqlScalar(`SELECT count(*) FROM public.project_ffe_items WHERE project_id='${JOB}' AND removed_at IS NULL`)).toBe('80');
  expect(psqlScalar(`SELECT count(*) FROM public.project_ffe_items WHERE project_id='${JOB}' AND project_room_id='${ROOM}' AND removed_at IS NULL`)).toBe('36');

  await page.goto(`/doc/${JOB}?unfold=pieces&lens=rough&room=${ROOM}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await expect(page.locator('[data-arrival-ready]')).toHaveCount(1, { timeout: 60_000 });
  await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/, { timeout: 30_000 });
  const sheet = page.locator('[data-build-room-embedded="true"]');
  await expect(sheet).toBeVisible();
  const views = sheet.getByRole('group', { name: 'Schedule view' });
  await expect(views.getByRole('button')).toHaveCount(5);
  const shell = await page.locator('[data-document-shell]').elementHandle();

  for (const reading of readings) {
    await views.getByRole('button', { name: reading.button, exact: true }).click();
    const header = sheet.locator(`[data-round8-lens="${reading.lens}"]`);
    await expect(header).toBeVisible();
    // Assert the painted text, not a sized wrapper.
    await expect(header.getByRole('heading', { name: reading.title, exact: true })).toHaveCSS('font-size', '24px');
    expect(new URL(page.url()).searchParams.get('room')).toBe(ROOM);
    expect(new URL(page.url()).searchParams.get('lens')).toBe(reading.lens);
    expect(await shell!.evaluate((node) => node === document.querySelector('[data-document-shell]'))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (reading.lens === 'rough') {
      const acts = sheet.getByRole('button', { name: 'Acts for F01 Living Room selection 36', exact: true });
      await acts.click();
      await sheet.getByRole('menuitem', { name: 'Move to room…', exact: true }).click();
      const menu = sheet.getByRole('menu', { name: 'Move to room', exact: true });
      await expect(menu).toBeAttached();
      await expect(menu.getByRole('menuitem')).toHaveCount(3);
      await expect(menu).toContainText('Dining Room');
      await expect(menu).toContainText('Bedroom');
      await expectMenuAboveRail(page.getByRole('menuitem'));
      await page.screenshot({ path: info.outputPath('rough-move-menu.png') });
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
    }
    if (reading.lens === 'price') {
      await expect(sheet.locator('[data-price-lens]')).toContainText('Released client values stay fixed');
      await expect(sheet.locator('[data-price-room]')).toHaveCount(1);
    }
    if (reading.lens === 'release') {
      await expect(sheet.getByRole('table', { name: 'Release', exact: true })).toBeVisible();
      await expect(sheet.getByTestId('release-lens')).toContainText('Preparing a draft does not send it');
    }
    if (reading.lens === 'finishes') {
      await expect(sheet.getByRole('table', { name: 'Living Room · Finishes' })).toBeVisible();
      await expect(sheet.getByRole('link', { name: 'Print the paint and finish schedule' })).toHaveAttribute('href', `/doc/${JOB}/pieces/finishes/print?room=${ROOM}`);
    }
    await header.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`${reading.lens}.png`) });
  }
  expect(psqlScalar(`SELECT count(*) FROM public.project_ffe_items WHERE project_id='${JOB}' AND project_room_id='${ROOM}' AND removed_at IS NULL`)).toBe('36');
});
