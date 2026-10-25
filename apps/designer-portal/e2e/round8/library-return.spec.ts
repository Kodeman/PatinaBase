import { test, expect } from '../fixtures/auth';
import { psqlRun, psqlScalar } from '../helpers/psql';

const DESIGNER = 'f0180000-0000-4000-8000-000000000002';
const PREFIX = 'f2007000-0000-4000-8000-';
const NAME = 'C04b Fictional return chair';
const count = () => psqlScalar(`SELECT count(*) FROM products WHERE id::text LIKE '${PREFIX}%';`);

test.describe('Library internal return', () => {
  test.setTimeout(180_000);
  test('filter search opener scroll and native Back/Forward survive a piece visit', async ({ authenticatedPage: page }, testInfo) => {
    expect(count()).toBe('0');
    try {
      psqlRun(`INSERT INTO products(id,name,layer,owner_user_id,captured_by,captured_at,status,created_at)
        SELECT ('${PREFIX}'||lpad(n::text,12,'0'))::uuid, '${NAME} '||n, 'personal', '${DESIGNER}', '${DESIGNER}', now(), 'published', now()+n*interval '1 second' FROM generate_series(1,10) n;`);
      expect(count()).toBe('10');
      await expect(page.locator('[data-studio="round8"]')).toHaveAttribute('data-arrival-ready', '', { timeout: 60_000 });
      await page.goto('/library', { waitUntil: 'domcontentloaded' });
      const room = page.locator('[data-library-room]');
      await expect(room).toHaveAttribute('data-paper-renderer', 'round8', { timeout: 60_000 });
      await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/);
      const historyLength = await page.evaluate(() => history.length);
      await expect(async () => {
        const all = room.getByRole('tab', { name: /^All shelves/ });
        await all.focus();
        await all.press('ArrowRight');
        await expect(room.locator('[data-library-lens="personal"]')).toHaveAttribute('aria-selected', 'true');
      }).toPass({ timeout: 30_000 });
      await room.getByRole('button', { name: 'Fixed specification', exact: true }).click();
      await room.getByRole('searchbox').fill(NAME);
      await expect(room.locator('[data-library-exact-results]')).toContainText(NAME);
      const libraryUrl = new URL(page.url());
      expect(libraryUrl.searchParams.get('shelf')).toBe('personal');
      expect(libraryUrl.searchParams.get('capability')).toBe('standard');
      expect(libraryUrl.searchParams.get('q')).toBe(NAME);
      expect(await page.evaluate(() => history.length)).toBe(historyLength);
      await room.getByRole('button', { name: /^Show all \d+ pieces$/ }).click();
      const opener = page.locator(`#library-piece-${PREFIX}000000000001-reference`);
      await opener.scrollIntoViewIfNeeded();
      await opener.focus();
      const top = await opener.evaluate(el => el.getBoundingClientRect().top);
      await opener.press('Enter');
      await expect(page).toHaveURL(new RegExp(`/library/${PREFIX}000000000001\\?`), { timeout: 60_000 });
      const back = page.locator('[data-room-header-line]').getByRole('button', { name: /Resource library/ });
      await expect(back).toBeVisible({ timeout: 60_000 });
      await back.click();
      await expect(page).toHaveURL(libraryUrl.href);
      await expect(opener).toBeFocused({ timeout: 10_000 });
      await expect(room.locator('[data-library-lens="personal"]')).toHaveAttribute('aria-selected', 'true');
      await expect(room.getByRole('button', { name: 'Fixed specification', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(room.getByRole('searchbox')).toHaveValue(NAME);
      await expect.poll(() => opener.evaluate((el, originalTop) => Math.abs(el.getBoundingClientRect().top - originalTop), top)).toBeLessThan(3);
      await page.screenshot({ path: testInfo.outputPath('library-return.png'), fullPage: true });
      await opener.press('Enter');
      await expect(page).toHaveURL(new RegExp(`/library/${PREFIX}000000000001\\?`), { timeout: 60_000 });
      await page.goBack();
      await expect(page).toHaveURL(libraryUrl.href);
      await expect(opener).toBeFocused({ timeout: 10_000 });
      await page.goForward();
      await expect(page).toHaveURL(new RegExp(`/library/${PREFIX}000000000001\\?`), { timeout: 60_000 });
      await page.goBack();
      await expect(page).toHaveURL(libraryUrl.href);
      await expect(room.getByRole('searchbox')).toHaveValue(NAME);
      await expect(room.getByRole('button', { name: 'Fold the shelf', exact: true })).toHaveAttribute('aria-expanded', 'true');
      await expect(opener).toBeFocused({ timeout: 10_000 });
      // Exercise Next's URL synchronization AFTER the custom entry marker write.
      await room.getByRole('searchbox').fill(NAME + ' 1');
      await expect(room.locator('[data-library-exact-results]')).toContainText(NAME + ' 1');
      await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe(NAME + ' 1');
      await room.getByRole('searchbox').fill(NAME);
      await expect(room.locator('[data-library-exact-results]')).toContainText(NAME);
      await page.goto('/desk', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('[data-studio="round8"]')).toHaveAttribute('data-arrival-ready', '', { timeout: 60_000 });
      await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/);
      // A fixture link supplies the exact filtered address (the native Studio
      // door has no filters). This is a fresh browser navigation, not a return.
      await page.evaluate((href) => {
        const link = document.createElement('a'); link.href = href;
        link.textContent = 'Fresh filtered Library'; link.id = 'fresh-filtered-library';
        document.body.append(link);
      }, libraryUrl.href);
      await page.locator('#fresh-filtered-library').click();
      await expect(room).toHaveAttribute('data-paper-renderer', 'round8', { timeout: 60_000 });
      await expect(page).toHaveURL(libraryUrl.href);
      await expect(room.locator('[data-library-exact-results]')).toContainText(NAME);
      await expect(room.getByRole('button', { name: /^Show all \d+ pieces$/ })).toBeVisible();
      await expect(opener).not.toBeFocused();
      expect(await page.evaluate(() => history.state?.patinaLibraryEntry)).toBeUndefined();
      console.log('[C04b native readback]', JSON.stringify({ products: count(), filters: libraryUrl.search, history: 'replace-only filters; piece Back/Forward', viewport: page.viewportSize() }));
    } finally {
      psqlRun(`DO $$ BEGIN ASSERT NOT EXISTS (SELECT 1 FROM products WHERE id::text LIKE '${PREFIX}%' AND (owner_user_id IS DISTINCT FROM '${DESIGNER}' OR name NOT LIKE '${NAME}%')), 'refuse foreign C04b product'; END $$; DELETE FROM products WHERE id::text LIKE '${PREFIX}%' AND owner_user_id='${DESIGNER}' AND name LIKE '${NAME}%';`);
      expect(count()).toBe('0');
    }
  });
});
