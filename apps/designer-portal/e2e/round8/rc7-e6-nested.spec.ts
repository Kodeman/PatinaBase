import { test, expect } from '../fixtures/auth';
import type { Page } from '@playwright/test';
import { psqlScalar } from '../helpers/psql';

const JOB = 'f0180000-0000-4000-8000-000000000010';
const ROOM = 'f0180000-0000-4000-8000-000000000011';

async function openOrders(page: Page) {
  await page.keyboard.press('ControlOrMeta+k');
  const palette = page.getByRole('dialog', { name: 'Studio search' });
  await palette.getByRole('combobox', { name: 'Studio search' }).fill('orders');
  await palette.getByRole('option', { name: 'Purchase orders ledger g o', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Purchase orders' })).toBeVisible();
}

async function sameShell(page: Page) {
  return page.evaluate(() => {
    const held = (window as unknown as { __e6Shell?: Element }).__e6Shell;
    return !!held && held.isConnected && held === document.querySelector('[data-document-shell]');
  });
}

async function sameEditor(page: Page) {
  return page.evaluate(() => {
    const held = window as unknown as { __e6Instrument?: Element; __e6Finish?: Element };
    return !!held.__e6Instrument && held.__e6Instrument.isConnected &&
      held.__e6Instrument === document.querySelector('[data-unfold-instrument="pieces"]') &&
      !!held.__e6Finish && held.__e6Finish.isConnected &&
      held.__e6Finish === held.__e6Instrument.querySelector('[data-testid="spec-fields-pane"] [aria-label="Finish"]');
  });
}

test('A02 job, ledger and edited line instrument remain one mounted context with no replay', async ({ authenticatedPage: page }) => {
  test.setTimeout(300_000);
  expect(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).port).toBe('61121');
  expect(new URL(process.env.SUPABASE_DB_URL!).port).toBe('61122');
  const line = psqlScalar(`SELECT id FROM project_ffe_items WHERE project_id='${JOB}' AND project_room_id='${ROOM}' AND name='F01 Living Room selection 02' AND removed_at IS NULL;`);
  expect(line).toMatch(/^[0-9a-f-]{36}$/);
  const original = psqlScalar(`SELECT coalesce(finish,'') FROM project_ffe_specs WHERE ffe_item_id='${line}';`);
  const versionOf = () => Number(psqlScalar(`SELECT row_version FROM project_ffe_specs WHERE ffe_item_id='${line}';`));
  const draft = `E6 mounted draft ${Date.now()}`;
  const timeBefore = psqlScalar(`SELECT count(*) FROM project_time_entries WHERE project_id='${JOB}';`);

  await page.goto(`/doc/${JOB}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await expect(page.locator('[data-document-shell][data-arrival-ready]')).toHaveCount(1, { timeout: 60_000 });
  await page.evaluate(() => {
    (window as unknown as { __e6Shell?: Element }).__e6Shell = document.querySelector('[data-document-shell]')!;
  });
  await openOrders(page);
  expect(await sameShell(page)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Purchase orders' })).toHaveCount(0);

  if ((page.viewportSize()?.width ?? 1440) < 1180) {
    await page.locator('[data-sections-door]').click();
    await page.getByRole('dialog', { name: 'Sections of this document' }).getByRole('button', { name: /^FF&E/ }).click();
  } else {
    await page.getByRole('navigation', { name: 'Job contents' }).locator('[data-contents-entry="ffe"]').click();
  }
  const room = page.locator(`[data-pieces-room="${ROOM}"]`);
  await expect(room).toBeVisible({ timeout: 60_000 });
  await room.scrollIntoViewIfNeeded();
  const toggle = room.getByRole('button', { name: /Living Room/ });
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await room.getByRole('link', { name: /Edit room selections/ }).click();
  const instrument = page.locator('[data-unfold-instrument="pieces"]');
  await expect(instrument).toHaveCount(1);
  await instrument.getByRole('button', { name: 'Specifications' }).click();
  await instrument.locator(`[data-line-id="${line}"] > button`).click();
  const finish = instrument.getByTestId('spec-fields-pane').getByRole('textbox', { name: 'Finish' });
  await expect(finish).toHaveValue(original);
  const versionBefore = versionOf();
  await page.evaluate(() => {
    const held = window as unknown as { __e6Instrument?: Element; __e6Finish?: Element };
    held.__e6Instrument = document.querySelector('[data-unfold-instrument="pieces"]')!;
    held.__e6Finish = held.__e6Instrument.querySelector('[data-testid="spec-fields-pane"] [aria-label="Finish"]')!;
  });
  expect(await sameEditor(page)).toBe(true);
  let writes = 0;
  page.on('request', request => {
    if (request.method() === 'PATCH' && new URL(request.url()).pathname.endsWith('/rest/v1/project_ffe_specs')) writes++;
  });
  await finish.fill(draft);
  expect(await sameShell(page)).toBe(true);
  expect(await sameEditor(page)).toBe(true);

  await openOrders(page);
  await expect(instrument).toHaveCount(1);
  expect(await sameShell(page)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Purchase orders' })).toHaveCount(0);
  expect(await sameEditor(page)).toBe(true);
  await expect(finish).toHaveValue(draft);
  await expect.poll(() => psqlScalar(`SELECT coalesce(finish,'') FROM project_ffe_specs WHERE ffe_item_id='${line}';`)).toBe(draft);
  await expect.poll(versionOf).toBe(versionBefore + 1);
  await expect(page.locator('[data-document-shell]')).toHaveCount(1);
  await expect(instrument).toHaveCount(1);
  expect(await sameShell(page)).toBe(true);
  expect(await sameEditor(page)).toBe(true);
  expect(writes, 'the nested ledger cannot replay the Finish save').toBe(1);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-document-shell][data-arrival-ready]')).toHaveCount(1, { timeout: 60_000 });
  expect(versionOf(), 'reload cannot replay the Finish save').toBe(versionBefore + 1);
  expect(writes, 'reload cannot replay the Finish PATCH').toBe(1);
  expect(psqlScalar(`SELECT count(*) FROM project_time_entries WHERE project_id='${JOB}';`)).toBe(timeBefore);
});
