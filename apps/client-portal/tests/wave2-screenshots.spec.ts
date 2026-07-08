import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';

// Screenshot pass for Schedule & Boards Wave 2 · Track C (client surfaces).
// Saves into docs/design/the-document/screenshots/schedule-boards-wave2/.
// LOCAL stack only.

const LOCAL_URL = 'http://127.0.0.1:54321';
const SERVICE_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const PROPOSAL_ID = 'b0000000-0000-0000-0000-000000000002';
const SHOT_DIR = '../../docs/design/the-document/screenshots/schedule-boards-wave2';

const admin = createClient(LOCAL_URL, SERVICE_JWT, { auth: { persistSession: false } });

test('guest share page — desktop + mobile', async ({ page }) => {
  const token = randomBytes(32).toString('hex');
  const token_hash = createHash('sha256').update(token).digest('hex');
  await admin.from('document_shares').insert({
    proposal_id: PROPOSAL_ID,
    token_hash,
    label: 'screenshot',
    status: 'active',
    visibility: {
      pricing: false,
      roomBudgets: false,
      paymentSchedule: true,
      supplierIdentity: false,
      sourceUrls: false,
      itemDetails: true,
      leadTimes: true,
      feedbackEnabled: false,
    },
  });

  await page.setViewportSize({ width: 1280, height: 1400 });
  await page.goto(`/share/${token}`);
  await expect(page.getByRole('heading', { name: /Aspen Loft/ })).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOT_DIR}/2-guest-share-desktop.png`, fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/share/${token}`);
  await expect(page.getByRole('heading', { name: /Aspen Loft/ })).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOT_DIR}/2-guest-share-mobile.png`, fullPage: true });
});

test('client proposal with verdict acts + chips — desktop + mobile', async ({ page }) => {
  // Sign in as the seed client (password123).
  await page.setViewportSize({ width: 1280, height: 1600 });
  await page.goto('/auth/signin');
  // The form is behind a "Sign in with email" reveal (OAuth-first screen).
  const revealEmail = page.getByRole('button', { name: /sign in with email/i });
  if (await revealEmail.count()) await revealEmail.first().click();
  await page.locator('input[type="email"]').first().fill('client@patina.dev', { timeout: 15000 });
  await page.locator('input[type="password"]').first().fill('password123');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((url) => !url.pathname.includes('/auth/signin'), { timeout: 30000 });

  await page.goto(`/proposals/${PROPOSAL_ID}`);
  await expect(page.getByText('Product Selections')).toBeVisible({ timeout: 20000 });

  // Approve a line to show an "Approved" chip alongside the existing flagged one.
  const rug = page.locator('li', { hasText: 'Hand-knotted wool rug' });
  const approve = rug.getByRole('button', { name: /Approve/i });
  if (await approve.count()) {
    await approve.first().click();
    await expect(rug.getByText(/Approved/i)).toBeVisible({ timeout: 10000 });
  }
  await page.waitForTimeout(800);

  // Clip to the Selections section for a tight, legible shot.
  const selections = page.locator('section', { hasText: 'Product Selections' }).first();
  await selections.scrollIntoViewIfNeeded();
  await selections.screenshot({ path: `${SHOT_DIR}/1-client-verdicts-desktop.png` });

  await page.setViewportSize({ width: 390, height: 1200 });
  await page.goto(`/proposals/${PROPOSAL_ID}`);
  await expect(page.getByText('Product Selections')).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(800);
  const selMobile = page.locator('section', { hasText: 'Product Selections' }).first();
  await selMobile.scrollIntoViewIfNeeded();
  await selMobile.screenshot({ path: `${SHOT_DIR}/1-client-verdicts-mobile.png` });
});
