import { test, expect } from '../fixtures/auth';
import { psqlScalar } from '../helpers/psql';

const JOB = 'f0180000-0000-4000-8000-000000000010';
const ROOM = 'f0180000-0000-4000-8000-000000000011';

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
      // Inherited absolute row menus may exceed the Body scroller on phone.
      // Record the actual geometry; this presentation slice does not repair it.
      const geometry = await menu.getByRole('menuitem').last().evaluate((node) => {
        const r = node.getBoundingClientRect();
        let visibleBottom = innerHeight;
        for (let parent = node.parentElement; parent; parent = parent.parentElement) {
          if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowY)) {
            visibleBottom = Math.min(visibleBottom, parent.getBoundingClientRect().bottom);
          }
        }
        return { bottom: r.bottom, visibleBottom, clipped: r.bottom > visibleBottom };
      });
      await info.attach('rough-move-menu-disposition', { body: JSON.stringify({ ...geometry, disposition: 'Inherited menu positioning unchanged; not claimed fixed.' }), contentType: 'application/json' });
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
