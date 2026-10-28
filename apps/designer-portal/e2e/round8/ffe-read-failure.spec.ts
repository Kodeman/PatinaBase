import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth';

/**
 * SQ-2269 — WP-01.11 truthful states for a failing section read. A persistent
 * 500 on every FF&E-items read is a settled (failed) read: the paper still
 * arrives inside the arrival timeout, and the FF&E section answers with its
 * own inline error and Retry while the rest of the paper stays usable. The
 * fault is lifted before Retry, so the press is shown to read again.
 */

// F01's full-service job (f01-fixture.sql).
const JOB = 'f0180000-0000-4000-8000-000000000010';
const ffeRead = '**/rest/v1/project_ffe_items?*';

/** Every GET of the FF&E items answers 500 until unrouted; writes pass through. */
async function failFfeReads(page: Page) {
  const failed = { count: 0 };
  await page.route(ffeRead, (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    failed.count += 1;
    return route.fulfill({
      status: 500,
      json: { code: 'XX000', message: 'Forced FF&E read failure (SQ-2269 e2e)', details: null, hint: null },
    });
  });
  return failed;
}

for (const legacy of [false, true]) {
  test(`a persistent FF&E read 500 still lands the paper with an inline, retryable FF&E error${legacy ? ' @renderer-off' : ''}`, async ({ authenticatedPage: page }) => {
    test.setTimeout(180_000);
    const failed = await failFfeReads(page);
    // Leave the dev server's page first so no HMR client reloads the tab while
    // /doc/[id] compiles (paper-frame.spec.ts).
    await page.goto('about:blank');
    await page.goto(`/doc/${JOB}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });

    // The arrival timeout the round-8 suite holds every landing to (states.spec.ts `settled`).
    await expect(page.locator('[data-document-shell][data-arrival-ready]')).toHaveCount(1, { timeout: 60_000 });
    await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/, { timeout: 30_000 });
    expect(failed.count, 'the FF&E read was actually refused before the paper landed').toBeGreaterThan(0);
    await expect(page.getByText('Loading the document.')).toHaveCount(0);
    await expect(page.getByRole('main', { name: 'Loading document' })).toHaveCount(0);

    // The rest of the paper is usable: the job's own title is printed.
    await expect(page.getByText('F01 Fictional Full-Service House', { exact: true }).first()).toBeVisible();

    // The FF&E section degrades in place: its inline error and Retry.
    await page.getByRole('heading', { name: 'Pieces & purchasing' }).first().scrollIntoViewIfNeeded();
    const alert = page.getByRole('alert').filter({ hasText: 'The FF&E schedule could not be read.' });
    await expect(alert).toBeVisible({ timeout: 30_000 });
    const retry = alert.locator('xpath=..').getByRole('button', { name: 'Try again' });
    await expect(retry).toBeVisible();

    // Lift the fault: Retry reads again and the inline error clears.
    await page.unroute(ffeRead);
    await retry.click();
    await expect(alert).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator('[data-document-shell]')).toBeVisible();
  });
}
