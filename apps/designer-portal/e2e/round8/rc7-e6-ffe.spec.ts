import { test, expect } from '../fixtures/auth';
import { psqlRun, psqlScalar } from '../helpers/psql';

const JOB = 'f0180000-0000-4000-8000-000000000010';
const ROOM = 'f0180000-0000-4000-8000-000000000011';
const NAME = 'F01 Living Room selection 01';

const finishOf = (id: string) => psqlScalar(`SELECT coalesce(finish, '') FROM project_ffe_specs WHERE ffe_item_id='${id}';`);

// DEFECT RC7-E6-3: use-spec-books.ts:373 tells the editor to refresh; spec-fields-pane.tsx:695 neither refetches the peer version nor shows its value alongside the local draft.
test.fixme('A06 stale FF&E save refetches the peer, retains the typed draft and retries once', async ({ authenticatedPage: page }) => {
  test.setTimeout(300_000);
  expect(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).port).toBe('61121');
  expect(new URL(process.env.SUPABASE_DB_URL!).port).toBe('61122');
  const line = psqlScalar(`SELECT id FROM project_ffe_items WHERE project_id='${JOB}' AND project_room_id='${ROOM}' AND name='${NAME}' AND removed_at IS NULL;`);
  expect(line).toMatch(/^[0-9a-f-]{36}$/);
  expect(psqlScalar(`SELECT count(*) FROM project_ffe_items WHERE project_id='${JOB}' AND removed_at IS NULL;`)).toBe('80');
  expect(psqlScalar(`SELECT count(*) FROM project_ffe_items WHERE project_room_id='${ROOM}' AND removed_at IS NULL;`)).toBe('36');
  const original = finishOf(line);

  await page.goto(`/doc/${JOB}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await expect(page.locator('[data-document-shell][data-arrival-ready]')).toHaveCount(1, { timeout: 60_000 });
  if ((page.viewportSize()?.width ?? 1440) < 1180) {
    await page.locator('[data-sections-door]').click();
    await page.getByRole('dialog', { name: 'Sections of this document' }).getByRole('button', { name: /^FF&E/ }).click();
  } else {
    await page.getByRole('navigation', { name: 'Job contents' }).locator('[data-contents-entry="ffe"]').click();
  }
  const room = page.locator(`[data-pieces-room="${ROOM}"]`);
  await room.scrollIntoViewIfNeeded();
  const toggle = room.getByRole('button', { name: /Living Room/ });
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await room.getByRole('link', { name: /Edit room selections/ }).click();
  const instrument = page.locator('[data-unfold-instrument="pieces"]');
  await expect(instrument).toBeVisible();
  await instrument.getByRole('button', { name: 'Specifications' }).click();
  await instrument.locator(`[data-line-id="${line}"] > button`).click();
  const pane = instrument.getByTestId('spec-fields-pane');
  const finish = pane.getByRole('textbox', { name: 'Finish' });
  await expect(finish).toHaveValue(original);
  let writes = 0;
  page.on('request', request => {
    if (request.method() === 'PATCH' && new URL(request.url()).pathname.endsWith('/rest/v1/project_ffe_specs')) writes++;
  });

  // A second writer advances this exact fictional row while the first editor is open.
  psqlRun(`UPDATE project_ffe_specs SET finish='E6 peer finish' WHERE ffe_item_id='${line}' AND EXISTS (SELECT 1 FROM project_ffe_items WHERE id='${line}' AND project_id='${JOB}');`);
  expect(finishOf(line)).toBe('E6 peer finish');
  await finish.fill('E6 stale attempt');
  await finish.press('Enter');
  await expect(pane.getByRole('alert')).toContainText(/changed in another session/);
  await expect(finish).toHaveValue('E6 stale attempt');
  await expect(finish).toBeFocused();
  expect(finishOf(line)).toBe('E6 peer finish');

  await expect(pane.getByRole('alert')).toContainText('E6 peer finish');
  await expect(finish).toHaveValue('E6 stale attempt');
  await expect(finish).toBeFocused();
  await finish.press('Enter');
  await expect.poll(() => finishOf(line)).toBe('E6 stale attempt');
  expect(writes).toBe(2);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-unfold-instrument="pieces"]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-unfold-instrument="pieces"]').getByTestId('spec-fields-pane').getByRole('textbox', { name: 'Finish' })).toHaveValue('E6 stale attempt');
  expect(finishOf(line)).toBe('E6 stale attempt');
  expect(writes, 'reload cannot replay either write').toBe(2);
});
