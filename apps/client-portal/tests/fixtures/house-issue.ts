import { expect, type Page } from '@playwright/test';

/**
 * supabase/seed/client_house_issue_fixture.sql — June Brennan's two houses at
 * Birchwood Studio. Read-only for every spec: nothing here writes.
 */
export const JUNE = { email: 'june.brennan@patina.dev', password: 'password123' } as const;

export const ELM = {
  id: 'b0000000-0000-0000-0000-0000000e1a01',
  name: 'Elm Street House',
  livingRoom: 'b0000000-0000-0000-0000-0000000e1b01',
  sideboard: 'Walnut sideboard',
  sofa: 'Linen sofa',
} as const;

export const LAKE = {
  id: 'b0000000-0000-0000-0000-0000000e1a02',
  name: 'Lake Cottage',
} as const;

/** The anchors the house answers to (external contract: retired routes, middleware, mail). */
export const ANCHORS = ['doorstep', 'ledger', 'letterbox', 'approvals', 'key', 'road', 'mat'] as const;

/** A count against a total, or a percentage: never in a chapter head or a standing row (V9). */
export const MEASURE = /\b\d+\s*\/\s*\d+\b|\d+%/;

export async function signInAsJune(page: Page, path: string): Promise<void> {
  await page.goto(`/auth/signin?callbackUrl=${encodeURIComponent(path)}`);
  const password = page.getByLabel(/password/i).first();
  await expect(async () => {
    if (!(await password.isVisible())) {
      await page
        .getByRole('button', { name: /sign in with email|use (?:email and )?password instead|use a password instead/i })
        .first()
        .click();
    }
    await expect(password).toBeVisible({ timeout: 5000 });
  }).toPass({ timeout: 60000 });
  await page.getByLabel(/email/i).first().fill(JUNE.email);
  await password.fill(JUNE.password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/auth/signin'), { timeout: 60000 });
}

/** The house has spoken: the hold is gone and the three standing rows carry sentences. */
export async function settled(page: Page): Promise<void> {
  await expect(page.getByTestId('doorplate')).toBeVisible({ timeout: 60000 });
  await expect(page.getByTestId('threshold-hold')).toHaveCount(0, { timeout: 60000 });
  await expect(page.locator('[data-standing-row]')).toHaveCount(3, { timeout: 60000 });
}

export interface Box {
  top: number;
  bottom: number;
  width: number;
  height: number;
}

/** Document-relative geometry (scroll-independent). */
export async function box(page: Page, selector: string): Promise<Box> {
  const found = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY, width: r.width, height: r.height };
  }, selector);
  expect(found, `no element for ${selector}`).not.toBeNull();
  return found!;
}
