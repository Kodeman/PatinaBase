import { createServerClient } from '@supabase/ssr';
import { SUPABASE_AUTH_STORAGE_KEY } from '@patina/supabase';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth';
import { psqlScalar } from '../helpers/psql';

const JOB = 'f0180000-0000-4000-8000-000000000010';
const ROOM = 'f0180000-0000-4000-8000-000000000011';
const UNKNOWN = 'f0180000-0000-4000-8000-000000000099';
const openRead = '**/rest/v1/rpc/document_open';
const specWrite = '**/rest/v1/project_ffe_specs*';

async function settled(page: Page) {
  await expect(page.locator('[data-arrival-ready]')).toHaveCount(1, { timeout: 60_000 });
  await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/, { timeout: 30_000 });
}
async function openJob(page: Page, search = '') {
  await page.goto(`/doc/${JOB}${search}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await settled(page);
}
function currentLine() {
  return psqlScalar(`SELECT id FROM project_ffe_items WHERE project_id='${JOB}' AND project_room_id='${ROOM}' AND name='F01 Living Room selection 01' AND removed_at IS NULL;`);
}
async function editFinish(page: Page) {
  const line = currentLine();
  expect(line).toMatch(/^[0-9a-f-]{36}$/);
  await openJob(page, `?unfold=pieces&lens=spec&room=${ROOM}&line=${line}`);
  const pane = page.getByTestId('spec-fields-pane');
  const finish = pane.getByRole('textbox', { name: 'Finish' });
  await expect(finish).toBeVisible({ timeout: 30_000 });
  return { line, pane, finish };
}
async function switchToOutsider(page: Page) {
  const api = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  expect(new URL(api).hostname).toBe('127.0.0.1');
  const jar: Array<{ name: string; value: string }> = [];
  const client = createServerClient(api, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { storageKey: SUPABASE_AUTH_STORAGE_KEY },
    cookies: { getAll: () => [], setAll: (cookies) => { jar.push(...cookies); } },
  });
  const { error } = await client.auth.signInWithPassword({ email: 'f01-outsider@test.invalid', password: 'password123' });
  expect(error).toBeNull();
  expect(jar.length).toBeGreaterThan(0);
  await page.context().clearCookies({ name: /^sb-.*-auth-token/ });
  await page.context().addCookies(jar.map(({ name, value }) => ({ name, value, url: new URL(page.url()).origin })));
  // Exercise the existing shared-cookie recheck, not a reload with an empty cache.
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
}

test.describe('WP-01.11 truthful states (live F01 with named fault injection)', () => {
  test.setTimeout(180_000);

  test('authenticated fixture yields a settled studio before direct job entry', async ({ authenticatedPage: page }) => {
    // No polling here: readiness is the fixture's postcondition, not work the
    // next navigation may interrupt after receiving the authenticated page.
    expect(await page.locator('[data-arrival-ready]').count(), 'authenticated landing is already settled').toBe(1);
    expect(await page.locator('html').getAttribute('class') ?? '', 'authenticated arrival has released interaction').not.toMatch(/\barr-(?:pre|on|press)\b/);
    await openJob(page);
    await expect(page.locator('[data-document-shell]')).toBeVisible();
  });

  test('studio read failure is not an empty studio and retry recovers', async ({ authenticatedPage: page }) => {
    await settled(page);
    await page.route('**/rest/v1/rpc/desk_read', route => route.fulfill({ status: 503, json: { message: 'Read unavailable' } }));
    await page.reload({ waitUntil: 'domcontentloaded' });
    const failure = page.getByTestId('desk-error-state');
    await expect(failure).toContainText("Your studio overview couldn't load.", { timeout: 60_000 });
    await expect(page.getByText('No project files yet.', { exact: false })).toHaveCount(0);
    await expect(page.locator('[data-studio-job]')).toHaveCount(0);
    await page.unroute('**/rest/v1/rpc/desk_read');
    await failure.getByRole('button', { name: 'Try again' }).click();
    await expect(failure).toHaveCount(0);
    await settled(page);
    await expect(page.getByRole('link').filter({ hasText: 'F01 Fictional Full-Service House' }).first()).toBeVisible();
  });

  test('loading reserves geometry; failed identity read announces retry without cached chapters', async ({ authenticatedPage: page }) => {
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route(openRead, async route => { await held; await route.fulfill({ status: 503, json: { message: 'Read unavailable' } }); });
    try {
      await page.goto(`/doc/${JOB}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      const loading = page.getByRole('main', { name: 'Loading document' });
      await expect(loading).toHaveAttribute('aria-busy', 'true');
      expect(await loading.evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(800);
      await expect(page.getByRole('status').filter({ hasText: 'Picking up the document' })).toBeVisible();
    } finally { release(); }
    await expect(page.getByRole('alert').filter({ hasText: 'The read failed' })).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-paper-chapter]')).toHaveCount(0);
    await page.unroute(openRead);
    await page.getByRole('button', { name: 'Try again' }).click();
    await settled(page);
    await expect(page.locator('[data-document-shell]')).toBeVisible();
  });

  test('missing and genuinely forbidden identity share the nondisclosing recovery state', async ({ authenticatedPage: page }) => {
    await page.goto(`/doc/${UNKNOWN}`, { waitUntil: 'domcontentloaded' });
    const unavailable = page.getByRole('heading', { name: 'This document is not available.' });
    await expect(unavailable).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('link', { name: 'Back to Studio' })).toBeVisible();
    await switchToOutsider(page);
    await page.goto(`/doc/${JOB}`, { waitUntil: 'domcontentloaded' });
    await expect(unavailable).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-document-shell]')).toHaveCount(0);
    await expect(page.getByText('F01 Fictional Full-Service House', { exact: true })).toHaveCount(0);
  });

  test('redirected identity replaces the alias with the canonical job', async ({ authenticatedPage: page }) => {
    await page.route(openRead, route => route.request().postDataJSON().p_id === UNKNOWN
      ? route.fulfill({ json: { kind: 'redirect', projectId: JOB } }) : route.continue());
    await page.goto(`/doc/${UNKNOWN}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(new RegExp(`/doc/${JOB}$`), { timeout: 60_000 });
    await settled(page);
    await expect(page.locator('[data-document-shell]')).toBeVisible();
  });

  for (const status of [401, 403]) {
    test(`${status} mid-edit retains draft, focus and inline refusal; no false save or toast`, async ({ authenticatedPage: page }) => {
      const { line, pane, finish } = await editFinish(page);
      const before = psqlScalar(`SELECT finish FROM project_ffe_specs WHERE ffe_item_id='${line}';`);
      await page.route(specWrite, route => route.request().method() === 'PATCH'
        ? route.fulfill({ status, json: { code: status === 401 ? 'PGRST301' : '42501', message: status === 401 ? 'Session expired. Sign in again before retrying.' : 'Permission denied. Ask the studio to restore access.' } }) : route.continue());
      const draft = `Unsaved ${status} finish`;
      await finish.fill(draft);
      await finish.press('Enter');
      await expect(pane.getByRole('alert')).toBeVisible();
      await expect(finish).toHaveValue(draft);
      await expect(finish).toBeFocused();
      expect(psqlScalar(`SELECT finish FROM project_ffe_specs WHERE ffe_item_id='${line}';`)).toBe(before);
      await expect(page.locator('[data-radix-toast-viewport] [data-state="open"]')).toHaveCount(0);
      if (status === 403) {
        await switchToOutsider(page);
        await expect(pane).toHaveCount(0, { timeout: 60_000 });
        await expect(page.getByRole('heading', { name: 'This document is not available.' })).toBeVisible({ timeout: 60_000 });
        await expect(page.locator(`input[value="${draft}"]`)).toHaveCount(0);
        await expect(page.getByText('F01 Fictional Full-Service House', { exact: true })).toHaveCount(0);
      }
    });
  }
});
