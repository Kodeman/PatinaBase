import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { ELM, ELM_EDITION, GARDEN, LAKE, LOCAL_SUPABASE, STUDIO, servePlates, settled, signInAsJune, sideboardStatusWords } from './fixtures/house-issue';

test.describe.configure({ mode: 'default', timeout: 120000 });

function platesRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/plates/')) urls.push(request.url()); });
  return urls;
}

async function menuChapters(page: Page) {
  await page.getByRole('link', { name: 'Menu', exact: true }).click();
  const links = page.getByRole('navigation', { name: 'Page index' }).locator('a[href^="#room-"]');
  const words = await links.allTextContents();
  await page.keyboard.press('Escape');
  return words;
}

async function permanentAddresses(page: Page) {
  for (const anchor of ['doorstep', 'ledger', 'letterbox', 'approvals']) {
    await page.goto(`/projects/${ELM.id}#${anchor}`);
    await expect(page.getByRole('dialog', { name: 'Invoices and approvals' })).toBeVisible();
    const drawer = page.getByRole('dialog', { name: 'Invoices and approvals' });
    if (anchor === 'approvals') await expect(drawer.locator('#approvals')).toBeInViewport();
    else await expect(drawer.locator('[data-invoice-id]').first()).toHaveAttribute('data-invoice-id', ELM.invoices[0]);
  }
  await page.keyboard.press('Escape');
  for (const anchor of ['note', 'road', 'previously', 'mat', ...ELM.rooms.map(room => `room-${room}`)]) {
    await expect(page.locator('#' + anchor)).toHaveCount(1);
  }
  const ids = await page.locator('[id^="approval-"], [id^="room-"]').evaluateAll(nodes => nodes.map(node => node.id));
  expect(new Set(ids).size).toBe(ids.length);
}

test.describe('The House Issue in Gallery', { tag: '@edition' }, () => {
  test.beforeEach(async ({ page }) => servePlates(page));

  test('a retired invoice route preserves its named invoice in the open drawer', async ({ page }) => {
    await signInAsJune(page, `/projects/${ELM.id}`);
    await settled(page);
    const id = ELM.invoices[1];
    const response = await page.request.get(`/invoices/${id}`, { maxRedirects: 0 });
    expect(response.status()).toBe(308);
    const location = new URL(response.headers().location, 'http://localhost');
    expect([location.pathname, location.searchParams.get('invoice'), location.hash]).toEqual(['/', id, '#letterbox']);
    await page.goto(`/invoices/${id}`);
    await settled(page);
    await expect(page.getByRole('dialog', { name: 'Invoices and approvals' })).toBeVisible();
    const named = page.locator(`[data-invoice-id="${id}"]`);
    await expect(named.getByTestId('invoice-details')).toBeVisible();
    await expect(named.getByRole('button', { name: /Continue to secure payment/ })).toBeVisible();
  });

  test('checkout return preserves the query, opens the drawer and consumes it once', async ({ page }) => {
    await signInAsJune(page, `/projects/${ELM.id}`);
    await settled(page);
    const address = `/projects/${ELM.id}?invoice=${ELM.invoices[0]}&checkout=success&session_id=cs_e2e_sq1917#letterbox`;
    expect((await page.request.get(address, { maxRedirects: 0 })).status()).toBe(200);
    await page.goto(address);
    await settled(page);
    await expect(page.getByRole('dialog', { name: 'Invoices and approvals' })).toBeVisible();
    await expect(page.getByTestId('letterbox-receipt')).toBeVisible();
    await expect.poll(() => new URL(page.url()).hash).toBe('#letterbox');
    await expect.poll(() => new URL(page.url()).searchParams.get('checkout')).toBeNull();
  });

  test('a house without eligible photography arrives on paint, not stock or a plan', async ({ page }) => {
    const requests = platesRequests(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAsJune(page, `/projects/${LAKE.id}`);
    await settled(page);
    const arrival = page.getByRole('figure').first();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(LAKE.name);
    await expect(arrival.getByRole('img', { name: /Paint for the house|waiting for photographs/ })).toBeVisible();
    await expect(arrival.locator('picture')).toHaveCount(0);
    expect(requests).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test('a missing picture is honest paint and a pictureless piece remains named', async ({ page }) => {
    await page.unroute('**/plates/**');
    await page.route('**/plates/**', route => route.fulfill({ status: 503, body: 'No local plate binding' }));
    await signInAsJune(page, `/projects/${ELM.id}`);
    await settled(page);
    await expect(page.getByRole('figure').first().getByRole('img', { name: /Paint for the house|waiting for photographs/ })).toBeVisible();
    await page.getByRole('link', { name: /Every piece in the Living room/i }).click();
    const drawer = page.getByRole('dialog', { name: /Every piece/i });
    await expect(drawer.getByRole('listitem').filter({ hasText: ELM.sofa }).getByText(ELM.sofa, { exact: true }).first()).toBeVisible();
    await expect(drawer.getByRole('listitem').filter({ hasText: ELM.sideboard })).toContainText(await sideboardStatusWords());
  });

  test('permanent addresses stay unique and resolve without a flag', async ({ page }) => {
    await signInAsJune(page, `/projects/${ELM.id}`);
    await settled(page);
    await permanentAddresses(page);
  });

  test('reduced motion leaves the arrival and chapter photographs still', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await signInAsJune(page, `/projects/${ELM.id}`);
    await settled(page);
    const figures = page.getByRole('figure');
    expect(await figures.count()).toBeGreaterThan(0);
    const transforms = await figures.evaluateAll(nodes => nodes.map(node => getComputedStyle(node).transform));
    expect(transforms.every(transform => transform === 'none')).toBe(true);
  });

  test('the studio undo restores Phase 1 while keeping Gallery and its addresses', async ({ page }) => {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(key, 'Export the LOCAL key for fixture restoration').toBeTruthy();
    const admin = createClient(LOCAL_SUPABASE.url, key!, { auth: { persistSession: false } });
    const { data: edition, error } = await admin.from('client_editions').select('status,approved_at').eq('id', ELM_EDITION.id).single();
    expect(error).toBeNull();
    expect(edition!.status).toBe('approved');
    await signInAsJune(page, `/projects/${ELM.id}`);
    await settled(page);
    // The legacy headline is too long for the band; its approved words stay in Menu.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(ELM.name);
    expect(await menuChapters(page)).toEqual(expect.arrayContaining([ELM_EDITION.headlines.room]));
    await expect(page.getByTestId('edition-notice')).toHaveText(ELM_EDITION.notice);
    const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' }).format(new Date(edition!.approved_at));
    await expect(page.getByTestId('edition-line')).toHaveText(`Edition 2 · approved by the studio · ${day}`);
    const studio = createClient(LOCAL_SUPABASE.url, LOCAL_SUPABASE.anon, { auth: { persistSession: false } });
    expect((await studio.auth.signInWithPassword(STUDIO)).error).toBeNull();
    try {
      expect((await studio.rpc('undo_client_edition', { p_edition_id: ELM_EDITION.id })).error).toBeNull();
      await page.reload();
      await settled(page);
      await expect(page.getByTestId('edition-notice')).toHaveCount(0);
      await expect(page.getByTestId('edition-line')).toHaveCount(0);
      expect(await menuChapters(page)).not.toContain(ELM_EDITION.headlines.room);
      await permanentAddresses(page);
    } finally {
      expect((await admin.from('client_editions').update({ status: 'approved', superseded_at: null, superseded_by: null }).eq('id', ELM_EDITION.id)).error).toBeNull();
      await studio.auth.signOut();
    }
  });

  test('undo of a plates-only edition restores the prior edition, notice and scoped pictures', async ({ page }) => {
    const publishedId = 'b0000000-0000-0000-0000-0000000e2b02';
    const priorId = 'b0000000-0000-0000-0000-0000000e2b01';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(key).toBeTruthy();
    const admin = createClient(LOCAL_SUPABASE.url, key!, { auth: { persistSession: false } });
    const { data: rows, error } = await admin.from('client_editions').select('id,status,kind,auto_published,approved_at,superseded_at,superseded_by').in('id', [publishedId, priorId]);
    expect(error).toBeNull();
    const published = rows!.find(row => row.id === publishedId)!;
    const prior = rows!.find(row => row.id === priorId)!;
    expect(published).toMatchObject({ status: 'approved', kind: 'plates_only', auto_published: true });
    expect(prior).toMatchObject({ status: 'superseded', superseded_by: publishedId });
    const requests = platesRequests(page);
    await signInAsJune(page, `/projects/${GARDEN.id}`);
    await settled(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your oak tallboy');
    await expect(page.locator('#note').getByTestId('edition-notice')).toHaveText('The page now opens on your finished tallboy. Everything else is where it was.');
    await expect(page.locator('#note').getByTestId('note-body')).toHaveCount(0);
    const words = await menuChapters(page);
    const studio = createClient(LOCAL_SUPABASE.url, LOCAL_SUPABASE.anon, { auth: { persistSession: false } });
    expect((await studio.auth.signInWithPassword(STUDIO)).error).toBeNull();
    try {
      expect((await studio.rpc('undo_client_edition', { p_edition_id: publishedId })).error).toBeNull();
      requests.length = 0;
      await page.reload();
      await settled(page);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your oak tallboy');
      await expect(page.getByTestId('edition-notice')).toHaveText('The page opens on your tallboy, on the workshop bench.');
      const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' }).format(new Date(prior.approved_at));
      await expect(page.getByTestId('edition-line')).toHaveText(`Edition 1 · approved by the studio · ${day}`);
      expect(await menuChapters(page)).toEqual(words);
      // Any eligible chapter photograph must use the restored authority's scope.
      for (const request of requests) expect(request).toContain(`/plates/${priorId}/`);
    } finally {
      expect((await admin.from('client_editions').update({ status: 'superseded', superseded_at: prior.superseded_at, superseded_by: publishedId }).eq('id', priorId)).error).toBeNull();
      expect((await admin.from('client_editions').update({ status: 'approved', superseded_at: null, superseded_by: null }).eq('id', publishedId)).error).toBeNull();
      await studio.auth.signOut();
    }
  });
});
