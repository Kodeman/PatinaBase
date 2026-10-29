import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth';
import { psqlScalar } from '../helpers/psql';

const JOB = 'f0180000-0000-4000-8000-000000000010';
const ROOM = 'f0180000-0000-4000-8000-000000000011';
const NAME = 'F01 Living Room selection 01';

const finishOf = (id: string) => psqlScalar(`SELECT coalesce(finish, '') FROM project_ffe_specs WHERE ffe_item_id='${id}';`);

async function openLine(page: Page, line: string) {
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
  return instrument.getByTestId('spec-fields-pane');
}

// DEFECT RC7-E6-3: use-spec-books.ts:373 tells the editor to refresh; spec-fields-pane.tsx:695 neither refetches the peer version nor shows its value alongside the local draft.
test.fixme('A06 stale FF&E save refetches the peer, retains the typed draft and retries once', async ({ authenticatedPage: page, browser }) => {
  test.setTimeout(300_000);
  expect(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).port).toBe('61121');
  expect(new URL(process.env.SUPABASE_DB_URL!).port).toBe('61122');
  const line = psqlScalar(`SELECT id FROM project_ffe_items WHERE project_id='${JOB}' AND project_room_id='${ROOM}' AND name='${NAME}' AND removed_at IS NULL;`);
  expect(line).toMatch(/^[0-9a-f-]{36}$/);
  expect(psqlScalar(`SELECT count(*) FROM project_ffe_items WHERE project_id='${JOB}' AND removed_at IS NULL;`)).toBe('80');
  expect(psqlScalar(`SELECT count(*) FROM project_ffe_items WHERE project_room_id='${ROOM}' AND removed_at IS NULL;`)).toBe('36');
  const original = finishOf(line);
  const specId = psqlScalar(`SELECT id FROM project_ffe_specs WHERE ffe_item_id='${line}';`);
  const peerVersion = Number(psqlScalar(`SELECT row_version FROM project_ffe_specs WHERE id='${specId}';`));
  const pane = await openLine(page, line);
  const finish = pane.getByRole('textbox', { name: 'Finish' });
  await expect(finish).toHaveValue(original);
  let writes = 0;
  page.on('request', request => {
    if (request.method() === 'PATCH' && new URL(request.url()).pathname.endsWith('/rest/v1/project_ffe_specs')) writes++;
  });

  const peer = await browser.newContext();
  try {
    const api = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const login = await peer.request.post(`${api}/auth/v1/token?grant_type=password`, {
      headers: { apikey: key },
      data: { email: process.env.DESIGNER_E2E_EMAIL ?? 'designer@patina.dev', password: process.env.DESIGNER_E2E_PASSWORD ?? 'password123' },
    });
    expect(login.ok(), 'second context signs in as the designer').toBe(true);
    const { access_token } = await login.json() as { access_token: string };
    const updated = await peer.request.patch(`${api}/rest/v1/project_ffe_specs?id=eq.${specId}&row_version=eq.${peerVersion}`, {
      headers: { apikey: key, Authorization: `Bearer ${access_token}`, Prefer: 'return=representation' },
      data: { finish: 'E6 peer finish' },
    });
    expect(updated.status(), 'peer designer updates the stale row through REST').toBe(200);
    expect((await updated.json() as { row_version: number }[])[0]?.row_version).toBe(peerVersion + 1);
  } finally {
    await peer.close();
  }
  expect(finishOf(line)).toBe('E6 peer finish');
  await finish.fill('E6 stale attempt');
  await finish.press('Enter');
  const alert = pane.getByRole('alert');
  await expect(alert).toContainText(/Finish changed in another session to "E6 peer finish"\. Save again to replace it\./);
  await expect(alert).not.toContainText(/Refresh/);
  await expect(finish).toHaveValue('E6 stale attempt');
  await expect(finish).toBeFocused();
  expect(finishOf(line)).toBe('E6 peer finish');

  await finish.press('Enter');
  await expect.poll(() => finishOf(line)).toBe('E6 stale attempt');
  expect(writes).toBe(2);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const reopened = await openLine(page, line);
  await expect(reopened.getByRole('textbox', { name: 'Finish' })).toHaveValue('E6 stale attempt');
  expect(finishOf(line)).toBe('E6 stale attempt');
  expect(writes, 'reload cannot replay either write').toBe(2);
});
