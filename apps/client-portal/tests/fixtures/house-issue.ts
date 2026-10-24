import path from 'node:path';

import { expect, type Page } from '@playwright/test';

/**
 * supabase/seed/client_house_issue_fixture.sql — June Brennan's three houses at
 * Birchwood Studio. Read-only for every spec but one: the edition spec undoes
 * Elm's Edition 2 as the studio and puts it back before it ends.
 */
export const JUNE = { email: 'june.brennan@patina.dev', password: 'password123' } as const;

export const ELM = {
  id: 'b0000000-0000-0000-0000-0000000e1a01',
  name: 'Elm Street House',
  rooms: [
    'b0000000-0000-0000-0000-0000000e1b01',
    'b0000000-0000-0000-0000-0000000e1b02',
    'b0000000-0000-0000-0000-0000000e1b03',
  ],
  sideboard: 'Walnut sideboard',
  sofa: 'Linen sofa',
  /** Invoice 1 ($600, past due) leads the letterbox; invoice 3 does not. */
  invoices: ['b0000000-0000-0000-0000-0000000e1a11', 'b0000000-0000-0000-0000-0000000e1a13'],
} as const;

/**
 * Elm Street House's approved Edition 2 (the fixture's editions block). Its
 * hero is the sideboard's workshop picture, captioned by the edition; the
 * caption's "whose" is the studio because the house keeps makers off.
 */
export const ELM_EDITION = {
  id: 'b0000000-0000-0000-0000-0000000e2a02',
  seq: 2,
  notice:
    'The page now opens on your sideboard; the workshop sent photographs on 15 October. Everything else is where it was.',
  /** Sixty characters, the composer's ceiling: the worst case the fold must hold (R-v2-2). */
  coverHeadline: 'Your walnut sideboard is planed and waiting on the workbench',
  captionWhat: 'Walnut top, planed',
  headlines: {
    key: 'Three rooms, and the light between them',
    room: 'Walnut, linen and a lot of light',
    road: 'Planed this week, shipped in the new year',
  },
} as const;

/** Elm's plates are scoped to its approved edition, or to the house itself without one. */
export const ELM_PLATE_SCOPE = new RegExp(`/plates/(${ELM.id}|${ELM_EDITION.id})/`);

/** The studio lead on every fixture house: undo is hers to do (can_buy_for_project). */
export const STUDIO = { email: 'designer@patina.dev', password: 'password123' } as const;

export const LOCAL_SUPABASE = {
  url: 'http://127.0.0.1:54321',
  anon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
} as const;

export const LAKE = {
  id: 'b0000000-0000-0000-0000-0000000e1a02',
  name: 'Lake Cottage',
} as const;

/** One portrait photograph, 1100 × 1900: the portrait hero. */
export const GARDEN = {
  id: 'b0000000-0000-0000-0000-0000000e1a03',
  name: 'Garden Flat',
  sha: 'e1a0000000000000000000000000000000000000000000000000000000007a11',
} as const;

/*
 * The ids the house answers to: the external contract the retired routes
 * (src/lib/retired-routes.ts), the middleware, the till's return and the mail
 * all point at. Elm Street House draws every one of them exactly once, but
 * for those in ELM_UNDRAWN.
 */
export const ANCHORS = [
  'doorstep',
  'ledger',
  'letterbox',
  'approvals',
  'key',
  'road',
  'mat',
  'mat-papers',
  'note',
  'previously',
  'changed',
  'door',
] as const;

/**
 * Elm's one agreement is executed, so no door stands on it: `#door` is drawn
 * only while a paper waits for, or has just taken, her name. The House Issue's
 * door is pinned in jest (threshold.test.tsx, "standing row 2").
 */
export const ELM_UNDRAWN: readonly string[] = ['door'];

/** Entity anchors, one per ask or room, each by its own id. */
export const ANCHOR_PATTERNS = ['approval-', 'room-'] as const;

/** Committed stand-ins for plate bytes: the plate route has no PLATES binding under `next dev`. */
const PLATE_FIXTURES = {
  landscape: path.join(__dirname, 'plate-landscape.png'),
  portrait: path.join(__dirname, 'plate-portrait.png'),
} as const;

/** Serve every plate: Garden Flat's portrait from the portrait PNG, every other from the landscape. */
export async function servePlates(page: Page): Promise<void> {
  await page.route('**/plates/**', (route) =>
    route.fulfill({
      path: route.request().url().includes(GARDEN.sha) ? PLATE_FIXTURES.portrait : PLATE_FIXTURES.landscape,
    }),
  );
}

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
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60000 });
  await expect(page.getByTestId('threshold-hold')).toHaveCount(0, { timeout: 60000 });
  await expect(page.getByRole('link', { name: 'Menu', exact: true })).toBeVisible({ timeout: 60000 });
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
