import { test, expect } from '../fixtures/auth';
import type { Page } from '@playwright/test';
import { psqlScalar } from '../helpers/psql';

const JOB = 'f0180000-0000-4000-8000-000000000010';
const LIVING = 'f0180000-0000-4000-8000-000000000011';
const SCAN = 'f0180000-0000-4000-8000-000000000020';
const LINE_NAME = 'F01 Living Room selection 01';

function lineId() {
  const id = psqlScalar(`
    SELECT id FROM public.project_ffe_items
    WHERE project_id = '${JOB}' AND project_room_id = '${LIVING}'
      AND name = '${LINE_NAME}' AND removed_at IS NULL;
  `);
  expect(id, 'the F01 living-room line exists').toMatch(/^[0-9a-f-]{36}$/);
  return id;
}

async function settled(page: Page) {
  await expect(page.locator('[data-arrival-ready]')).toHaveCount(1, { timeout: 60_000 });
  await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/, { timeout: 30_000 });
}

async function openStudio(page: Page) {
  await page.goto('/desk', { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const studio = page.locator('[data-studio="round8"]');
  await expect(studio, 'round-8 studio is mounted').toBeVisible({ timeout: 60_000 });
  await expect(studio, 'the studio reads have settled').toHaveAttribute('data-arrival-ready', '', {
    timeout: 60_000,
  });
  await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/, { timeout: 30_000 });
  return studio;
}

async function openJob(page: Page, search: string) {
  await page.goto('about:blank');
  await page.goto(`/doc/${JOB}${search}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const shell = page.locator('[data-document-shell]');
  await expect(shell).toBeVisible({ timeout: 60_000 });
  await settled(page);
  return shell;
}

const instrument = (page: Page) =>
  page.locator('[data-paper-chapter="ffe"] [data-unfold-instrument="pieces"]');

const specLineControl = (page: Page, line: string) =>
  instrument(page).getByTestId('spec-lens').locator(`[data-line-id="${line}"] > button`);

function captureDocumentOpen(page: Page) {
  const reads: Array<{ row?: { engagement_id?: string; project_id?: string }; ids?: { project_id?: string }; kind?: string }> = [];
  page.on('response', async (response) => {
    if (!response.url().includes('/rest/v1/rpc/document_open')) return;
    try {
      const body = await response.json();
      if (body && !Array.isArray(body)) reads.push(body);
    } catch {
      // An unrelated or non-JSON response is not a document_open result.
    }
  });
  return reads;
}

test.describe('WP-01.9 first vertical slice (F01)', () => {
  test.setTimeout(240_000);

  test('studio → exact living-room line → save and recover → room → studio', async ({ authenticatedPage: page }) => {
    const line = lineId();
    const before = psqlScalar(`
      SELECT json_build_object('item', i.id, 'spec', s.id, 'version', s.row_version, 'finish', s.finish)::text
      FROM public.project_ffe_items i JOIN public.project_ffe_specs s ON s.ffe_item_id = i.id
      WHERE i.id = '${line}';
    `);
    expect(before, 'F01 line has its existing spec row').toBeTruthy();
    const beforeRow = JSON.parse(before) as { item: string; spec: string; version: number; finish: string | null };

    await page.setViewportSize({ width: 1440, height: 900 });
    const studio = await openStudio(page);
    const attention = page.locator('[data-studio-attention-item]').filter({ hasText: 'F01 Fictional Full-Service House' }).first();
    const opener = attention.getByRole('link').first();
    await expect(opener, 'F01 next act is present in the studio').toBeVisible({ timeout: 30_000 });
    const openerId = await opener.getAttribute('id');
    expect(openerId, 'the originating attention action has a stable focus id').toMatch(/^studio-attention-/);
    await opener.focus();
    const documentOpens = captureDocumentOpen(page);
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(new RegExp(`/doc/${JOB}(?:\\?|$)`), { timeout: 60_000 });
    const shell = page.locator('[data-document-shell]');
    await expect(shell).toBeVisible({ timeout: 60_000 });
    await settled(page);
    await expect.poll(() => documentOpens.length, { message: 'the real document_open resolver ran' }).toBeGreaterThan(0);
    expect(documentOpens.at(-1), 'document_open resolves this URL to the fixture project').toMatchObject({
      kind: 'engagement',
      ids: { project_id: JOB },
    });

    const currentLine = new URL(page.url()).searchParams.get('ffeItemId');
    if (currentLine) expect(currentLine, 'studio next act lands on the exact F01 line').toBe(line);
    const landing = new URL(page.url()).searchParams.get('land');
    if (landing) expect(landing, 'studio one-shot landing identifies the exact F01 line').toContain(line);
    await expect.poll(() => new URL(page.url()).searchParams.has('land'), { message: 'one-shot landing is consumed' }).toBe(false);

    const evidence = page.locator(`[data-survey-scan="${SCAN}"]`);
    await expect(evidence, 'the linked F01 living-room scan is shown in Design').toBeAttached({ timeout: 30_000 });
    await expect(evidence).toContainText('Survey, not installed');
    await evidence.scrollIntoViewIfNeeded();
    const ffeChapter = page.locator('[data-paper-chapter="ffe"]');
    await ffeChapter.scrollIntoViewIfNeeded();
    await expect(ffeChapter, 'the reader brought FF&E into the lens frame').toHaveAttribute('data-density', 'full');
    await expect(page.locator('[data-document-shell]')).toHaveAttribute('data-lens-settled', 'true');

    // Keep an object reference to the shell: identity, not selector count, proves no remount.
    await shell.evaluate((node) => {
      (window as Window & { __firstSliceShell?: Element }).__firstSliceShell = node;
    });
    const room = page.locator(`[data-paper-chapter="ffe"] [data-pieces-room="${LIVING}"]`);
    await expect(room).toBeAttached({ timeout: 30_000 });
    await room.scrollIntoViewIfNeeded();
    const roomToggle = room.getByRole('button', { name: /Living Room/ });
    if ((await roomToggle.getAttribute('aria-expanded')) !== 'true') await roomToggle.focus().then(() => page.keyboard.press('Enter'));
    const roomDoor = room.getByRole('link', { name: /Edit room selections/ });
    await expect(roomDoor).toBeVisible();
    await roomDoor.focus();
    await page.keyboard.press('Enter');
    await expect(instrument(page)).toBeVisible({ timeout: 30_000 });
    expect(new URL(page.url()).pathname, 'unfold stays on the job route').toBe(`/doc/${JOB}`);
    expect(new URL(page.url()).searchParams.get('unfold')).toBe('pieces');
    expect(new URL(page.url()).searchParams.get('room')).toBe(LIVING);
    const specTab = instrument(page).getByRole('button', { name: 'Specifications' });
    await specTab.focus();
    await page.keyboard.press('Enter');
    await expect(specTab).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => new URL(page.url()).searchParams.get('lens')).toBe('spec');
    const lineControl = specLineControl(page, line);
    await lineControl.focus();
    await page.keyboard.press('Enter');
    await expect(lineControl).toHaveAttribute('aria-current', 'true', {
      timeout: 30_000,
    });
    await expect(lineControl).toBeFocused({ timeout: 30_000 });
    await expect.poll(() => new URL(page.url()).searchParams.get('line')).toBe(line);
    await expect
      .poll(() => page.evaluate(() => {
        const prior = (window as Window & { __firstSliceShell?: Element }).__firstSliceShell;
        return Boolean(prior && prior.isConnected && prior === document.querySelector('[data-document-shell]'));
      }), { message: 'the same document shell survives the unfold' })
      .toBe(true);

    await page.goBack();
    await expect(instrument(page), 'Back folds the sheet without leaving the job').toHaveCount(0, { timeout: 30_000 });
    await page.goForward();
    await expect(instrument(page), 'Forward restores the same unfold').toBeVisible({ timeout: 30_000 });
    await expect(specLineControl(page, line)).toBeFocused({ timeout: 30_000 });
    expect(await page.evaluate(() => {
      const prior = (window as Window & { __firstSliceShell?: Element }).__firstSliceShell;
      return Boolean(prior && prior.isConnected && prior === document.querySelector('[data-document-shell]'));
    }), 'Back and Forward do not remount the paper').toBe(true);

    const pane = instrument(page).getByTestId('spec-fields-pane');
    await expect(pane).toContainText(LINE_NAME, { timeout: 30_000 });
    const finish = pane.getByRole('textbox', { name: 'Finish' });
    await expect(finish).toBeVisible({ timeout: 30_000 });
    const failed = `Retry finish ${Date.now()}`;
    const specWrite = (url: URL) => url.pathname.endsWith('/rest/v1/project_ffe_specs');
    let refused = 0;
    let writeRequests = 0;
    page.on('request', (request) => {
      if (request.method() === 'PATCH' && specWrite(new URL(request.url()))) writeRequests += 1;
    });
    await page.route(specWrite, (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      refused += 1;
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'Forced failure (SQ-1829)' }) });
    });
    await finish.fill(failed);
    await finish.press('Enter');
    await expect(pane.getByRole('alert')).toContainText(/Forced failure|not saved/, { timeout: 30_000 });
    await expect(finish).toHaveValue(failed);
    await expect(finish).toBeFocused();
    await expect(page.locator('[data-radix-toast-viewport] [data-state="open"]')).toHaveCount(0);
    expect(refused, 'exactly the failed save was intercepted').toBe(1);
    await test.info().attach('first-slice-save-failed-1440', { body: await page.screenshot(), contentType: 'image/png' });

    await page.unroute(specWrite);
    await instrument(page).getByRole('button', { name: /Return to the room/ }).focus();
    await page.keyboard.press('Enter');
    await expect(instrument(page)).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator(`[data-paper-chapter="ffe"] [data-pieces-room="${LIVING}"]`)).toBeInViewport();
    const after = psqlScalar(`
      SELECT json_build_object('item', i.id, 'spec', s.id, 'version', s.row_version, 'finish', s.finish)::text
      FROM public.project_ffe_items i JOIN public.project_ffe_specs s ON s.ffe_item_id = i.id
      WHERE i.id = '${line}';
    `);
    const afterRow = JSON.parse(after) as typeof beforeRow;
    expect(afterRow.item, 'the line identity is unchanged').toBe(beforeRow.item);
    expect(afterRow.spec, 'the spec identity is unchanged').toBe(beforeRow.spec);
    expect(afterRow.finish, 'the retried finish is persisted').toBe(failed);
    expect(afterRow.version, 'the saved row version advances').toBeGreaterThan(beforeRow.version);
    const writesBeforeReload = writeRequests;
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
    await expect(instrument(page), 'reload reopens the unfolding address').toBeVisible({ timeout: 60_000 });
    await settled(page);
    await expect(instrument(page).getByTestId('spec-fields-pane').getByRole('textbox', { name: 'Finish' })).toHaveValue(failed);
    expect(writeRequests, 'reload reopens the sheet without replaying a save').toBe(writesBeforeReload);
    expect(
      psqlScalar(`SELECT row_version::text FROM public.project_ffe_specs WHERE ffe_item_id = '${line}';`),
      'the reload did not mutate the row version',
    ).toBe(String(afterRow.version));

    const peer = await page.context().newPage();
    await openJob(peer, `?unfold=pieces&lens=spec&room=${LIVING}&line=${line}`);
    const peerFinish = instrument(peer).getByTestId('spec-fields-pane').getByRole('textbox', { name: 'Finish' });
    const peerValue = `Second-page finish ${Date.now()}`;
    await peerFinish.fill(peerValue);
    await peerFinish.press('Tab');
    await expect.poll(() => psqlScalar(`SELECT finish FROM public.project_ffe_specs WHERE ffe_item_id = '${line}';`), {
      message: 'the second page saves against its current row version',
    }).toBe(peerValue);
    const staleValue = `Stale page finish ${Date.now()}`;
    await finish.fill(staleValue);
    await finish.press('Tab');
    await expect(pane.getByRole('alert')).toContainText(/changed in another session|refresh before saving|version/i, {
      timeout: 30_000,
    });
    expect(
      psqlScalar(`SELECT finish FROM public.project_ffe_specs WHERE ffe_item_id = '${line}';`),
      'the stale page cannot overwrite the second page value',
    ).toBe(peerValue);
    await test.info().attach('first-slice-stale-version-conflict-1440', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await peer.close();
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
    await expect(instrument(page).getByTestId('spec-fields-pane').getByRole('textbox', { name: 'Finish' })).toHaveValue(peerValue, {
      timeout: 60_000,
    });
    await settled(page);

    // Return to the studio using the real job-head return authority, keyboard only.
    const studioReturn = page.getByRole('link', { name: /Studio/ }).first();
    await studioReturn.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/desk(?:\?|$)/, { timeout: 60_000 });
    await expect(studio).toBeVisible({ timeout: 60_000 });
    await expect(page.locator(`[id="${openerId}"]`)).toBeFocused({ timeout: 30_000 });
    await test.info().attach('first-slice-returned-1440', { body: await page.screenshot(), contentType: 'image/png' });
  });

  test('phone keeps the survey, living-room unfold and exact line reachable by keyboard', async ({ authenticatedPage: page }) => {
    const line = lineId();
    await page.setViewportSize({ width: 390, height: 844 });
    await openStudio(page);
    const opener = page
      .locator('[data-studio-attention-item]')
      .filter({ hasText: 'F01 Fictional Full-Service House' })
      .first()
      .getByRole('link')
      .first();
    await expect(opener).toBeVisible({ timeout: 30_000 });
    await opener.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-document-shell]')).toBeVisible({ timeout: 60_000 });
    await settled(page);
    const evidence = page.locator(`[data-survey-scan="${SCAN}"]`);
    await expect(evidence).toBeAttached({ timeout: 30_000 });
    await expect(evidence).toContainText('Survey, not installed');
    const ffeChapter = page.locator('[data-paper-chapter="ffe"]');
    await ffeChapter.scrollIntoViewIfNeeded();
    await expect(ffeChapter, 'the reader brought FF&E into the lens frame').toHaveAttribute('data-density', 'full');
    await expect(page.locator('[data-document-shell]')).toHaveAttribute('data-lens-settled', 'true');
    const room = page.locator(`[data-paper-chapter="ffe"] [data-pieces-room="${LIVING}"]`);
    await expect(room).toBeAttached({ timeout: 30_000 });
    await room.scrollIntoViewIfNeeded();
    const roomToggle = room.getByRole('button', { name: /Living Room/ });
    if ((await roomToggle.getAttribute('aria-expanded')) !== 'true') {
      await roomToggle.focus();
      await page.keyboard.press('Enter');
    }
    const door = room.getByRole('link', { name: /Edit room selections/ });
    await door.focus();
    await page.keyboard.press('Enter');
    await expect(instrument(page)).toBeVisible({ timeout: 30_000 });
    const specTab = instrument(page).getByRole('button', { name: 'Specifications' });
    await specTab.focus();
    await page.keyboard.press('Enter');
    await expect(specTab).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => new URL(page.url()).searchParams.get('lens')).toBe('spec');
    const lineControl = specLineControl(page, line);
    await lineControl.focus();
    await page.keyboard.press('Enter');
    await expect(lineControl).toHaveAttribute('aria-current', 'true', {
      timeout: 30_000,
    });
    await expect(instrument(page).getByTestId('spec-fields-pane').getByRole('heading').first()).toBeFocused({ timeout: 30_000 });
    await expect.poll(() => new URL(page.url()).searchParams.get('line')).toBe(line);
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.viewport, 'the phone viewport is 390 CSS pixels').toBe(390);
    expect(dimensions.content, 'the first slice has no horizontal page overflow').toBeLessThanOrEqual(390);
    await test.info().attach('first-slice-phone-390', { body: await page.screenshot(), contentType: 'image/png' });
  });

  test('the same fixture rows resolve with the renderer off @renderer-off', async ({ authenticatedPage: page }) => {
    const line = lineId();
    const offStart = psqlScalar(`SELECT id || ':' || row_version::text || ':' || coalesce(finish, '') FROM public.project_ffe_specs WHERE ffe_item_id = '${line}';`);
    await page.goto('about:blank');
    await page.goto(`/doc/${JOB}?ffeItemId=${line}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await expect(page.locator('[data-document-shell]')).toBeVisible({ timeout: 60_000 });
    await settled(page);
    await expect(page.locator('[data-paper-renderer]')).toHaveCount(0);
    await expect(page.locator('[data-active-section]')).toHaveCount(1);
    const offEnd = psqlScalar(`SELECT id || ':' || row_version::text || ':' || coalesce(finish, '') FROM public.project_ffe_specs WHERE ffe_item_id = '${line}';`);
    expect(offEnd, 'renderer off reads the same fixture spec without a mutation').toBe(offStart);
    await test.info().attach('first-slice-renderer-off-1440', { body: await page.screenshot(), contentType: 'image/png' });
  });
});
