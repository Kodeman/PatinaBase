import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// Designer-side screenshot pass for Schedule & Boards Wave 2 · Track C.
// LOCAL stack only.

const LOCAL_URL = 'http://127.0.0.1:54321';
const SERVICE_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const PROPOSAL_ID = 'b0000000-0000-0000-0000-000000000002';
const SHOT_DIR = '../../docs/design/the-document/screenshots/schedule-boards-wave2';
const admin = createClient(LOCAL_URL, SERVICE_JWT, { auth: { persistSession: false } });

async function signInDesigner(page: import('@playwright/test').Page) {
  await page.goto('/auth/signin');
  const reveal = page.getByRole('button', { name: /sign in with email/i });
  if (await reveal.count()) await reveal.first().click();
  await page.locator('input[type="email"]').first().fill('designer@patina.dev', { timeout: 15000 });
  await page.locator('input[type="password"]').first().fill('password123');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/auth/signin'), { timeout: 30000 });
}

test('designer share sheet', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInDesigner(page);
  await page.goto(`/doc/${PROPOSAL_ID}`);
  await page.waitForTimeout(2500);
  // The ProposalShareInstrument renders a "Share…" instrument in the InstrumentRow.
  const shareBtn = page.getByRole('button', { name: /share/i });
  await expect(shareBtn.first()).toBeVisible({ timeout: 20000 });
  await shareBtn.first().click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOT_DIR}/3-designer-share-sheet.png`, fullPage: false });
});

test('drafting: verdict chips + line unfold (doc code + lead time)', async ({ page }) => {
  // Reach the drafting room by putting the proposal back into draft; verdicts on
  // its lines (created while it was sent) persist. Restore afterward.
  await admin.from('proposals').update({ status: 'draft' }).eq('id', PROPOSAL_ID);
  try {
    await page.setViewportSize({ width: 1280, height: 1400 });
    await signInDesigner(page);
    await page.goto(`/doc/${PROPOSAL_ID}`);
    await page.waitForTimeout(2500);
    // Enter the Drafting Room, where the FF&E schedule (with verdict chips) lives.
    const enter = page.getByRole('button', { name: /open the drafting room/i })
      .or(page.getByText(/edit in the drafting room/i));
    if (await enter.count()) {
      await enter.first().click();
      await page.waitForTimeout(4000);
    }
    // Expand the FF&E facet — the schedule rows (with verdict chips) live inside.
    const ffe = page.getByText(/pieces scheduled/i).first();
    if (await ffe.count()) {
      await ffe.click();
      await page.getByText('Walnut sectional sofa').first().waitFor({ timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(2000);
    }
    // Verdict chips ride on the schedule rows.
    await page.screenshot({ path: `${SHOT_DIR}/4-designer-verdict-chips.png`, fullPage: true });

    // Open the flagged card's unfold (the interactive card, not the collapsed
    // summary row) to show the feedback thread + doc code + lead time.
    const sofaCards = page.getByText('Walnut sectional sofa');
    const cardCount = await sofaCards.count();
    if (cardCount > 1) {
      await sofaCards.nth(cardCount - 1).click();
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${SHOT_DIR}/5a-designer-line-unfold.png`, fullPage: true });
    }
  } finally {
    await admin.from('proposals').update({ status: 'sent' }).eq('id', PROPOSAL_ID);
  }
});
