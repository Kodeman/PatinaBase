import { test, expect } from '../fixtures/auth';
import type { Page } from '@playwright/test';
import { psqlScalar } from '../helpers/psql';

const JOB = 'f0180000-0000-4000-8000-000000000010';
const ROOM = 'f0180000-0000-4000-8000-000000000011';
const NAME = 'F01 Living Room selection 36';

async function openJob(page: Page, search = '') {
  await page.goto('about:blank');
  await page.goto(`/doc/${JOB}${search}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await expect(page.locator('[data-document-shell][data-arrival-ready]')).toHaveCount(1, { timeout: 60_000 });
  await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/, { timeout: 30_000 });
}

test('whole-schedule reading survives room filtering and native Rough-in/Price operations', async ({ authenticatedPage: page }) => {
  test.setTimeout(180_000);
  const total = psqlScalar(`SELECT count(*) FROM public.project_ffe_items WHERE project_id='${JOB}' AND removed_at IS NULL`);
  expect(total).toBe('80');
  await openJob(page, `?unfold=pieces&lens=rough&room=${ROOM}`);
  const build = page.getByTestId('build-room');
  await expect(build).toBeVisible({ timeout: 60_000 });
  await expect(build.locator('[data-line-query]')).toContainText(`Whole schedule · ${total} lines · 1 page`);
  await expect(build.getByRole('heading', { name: 'Preliminary selections', exact: true })).toBeVisible();
  await build.getByRole('button', { name: `Acts for ${NAME}`, exact: true }).click();
  await build.getByRole('menuitem', { name: 'Move to room…', exact: true }).click();
  await expect(build.getByRole('menu', { name: 'Move to room', exact: true })).toContainText('Dining Room');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await build.getByRole('group', { name: 'Schedule view' }).getByRole('button', { name: 'Pricing', exact: true }).click();
  await expect(build.getByRole('heading', { name: 'Pricing', exact: true })).toBeVisible();
  await build.getByRole('button', { name: `Acts for ${NAME}`, exact: true }).click();
  await build.getByRole('menuitem', { name: 'Make it an allowance', exact: true }).click();
  const allowance = build.getByRole('form', { name: `Make ${NAME} an allowance` });
  await expect(allowance).toBeVisible();
  await expect(allowance.getByRole('button', { name: 'Set as allowance', exact: true })).toBeVisible();
  // Doorway preservation only: no mutation or unrelated purchasing authority is exercised.
  expect(psqlScalar(`SELECT count(*) FROM public.project_ffe_items WHERE project_id='${JOB}' AND project_room_id='${ROOM}' AND removed_at IS NULL`)).toBe('36');
});

test('selection-change chooser returns to More after a real click and custom-piece entry remains native', async ({ authenticatedPage: page }) => {
  test.setTimeout(180_000);
  await openJob(page);
  const chapter = page.locator('[data-paper-chapter="ffe"]');
  await page.locator('#ffe-chapter-heading').scrollIntoViewIfNeeded();
  const more = chapter.getByRole('button', { name: /^More/ });
  await more.click();
  // Deliberately move focus away: WebKit click/tap must not supply the return target.
  await page.locator('#ffe-chapter-heading').evaluate((heading) => {
    heading.setAttribute('tabindex', '-1');
    (heading as HTMLElement).focus();
  });
  await chapter.getByRole('button', { name: 'Record a selection change', exact: true }).click();
  const chooser = page.getByRole('dialog', { name: 'Record a change', exact: true });
  await expect(chooser).toBeVisible();
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Escape');
  await expect(chooser).not.toBeVisible();
  await expect(more).toBeFocused();
  await chapter.getByRole('button', { name: 'Add items', exact: true }).click();
  const add = page.getByRole('dialog', { name: 'Add to the job', exact: true });
  await expect(add).toBeVisible();
  await add.getByRole('button', { name: /A custom piece/ }).click();
  const line = page.getByRole('dialog', { name: 'The line, as it will be bought', exact: true });
  await expect(line).toBeVisible();
  await expect(line.getByRole('textbox', { name: /name/i }).first()).toBeVisible();
  await page.keyboard.press('Escape');
});
