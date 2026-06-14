/**
 * Track 3 review screenshots (R41 F1) — the desktop (≥1280) set for each new
 * surface: the Library Room (+ the "Taught today" foot, F3), inline Quick Tags
 * and the Deep Analysis paper sheet, Capture, the Promote paper RoomSheet (F4),
 * the Engine ask-and-place, the Accounts book three pages + the Desk receivable,
 * the Aesthete fold (the twinned Pledge with the provisional commons number, F2),
 * and the Composing Page (partial + near-complete).
 *
 *   node scripts/the-document-track3-shots.mjs
 *
 * Requires: the designer-portal dev server on :3000 with the the-document-pilot
 * flag on, migrations through 00209, and `scripts/the-document-track3-demo-earnings.sql`
 * run (seeds the Via-Patina commissions, the My Library piece, and the overdue
 * receivable for designer@patina.dev). Each shot is isolated so one fragile
 * interaction never drops the set.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = new URL('../../../docs/design/the-document/screenshots/track-3/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:3000';
const done = [], failed = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(20_000);

const shot = async (name, fn) => {
  try {
    await fn();
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${OUT}${name}.png`, fullPage: false });
    done.push(name);
    console.log(`✓ ${name}`);
  } catch (e) {
    failed.push(`${name}: ${e.message?.split('\n')[0]}`);
    console.log(`✗ ${name} — ${e.message?.split('\n')[0]}`);
    try { await page.screenshot({ path: `${OUT}${name}.png`, fullPage: false }); } catch {}
  }
};
const lib = async () => {
  await page.goto(`${BASE}/library`);
  await page.waitForSelector('input[aria-label="Ask the librarian"]', { timeout: 30_000 });
  await page.waitForSelector('text=/Patina Catalog/', { timeout: 15_000 });
};

// ── Sign in (fresh Playwright browser — no shared session) ──
await page.goto(`${BASE}/auth/signin`);
try { await page.click('text=/sign in with email/i', { timeout: 8000 }); } catch {}
try { await page.waitForSelector('input[type="password"]', { timeout: 8000 }); }
catch { try { await page.click('[data-testid="auth-mode-toggle"]'); } catch {}; await page.waitForSelector('input[type="password"]', { timeout: 8000 }); }
await page.fill('input[type="email"]', 'designer@patina.dev');
await page.fill('input[type="password"]', 'password123');
await page.click('button[type="submit"]');
await page.waitForURL('**/portal**', { timeout: 60_000 });
console.log('✓ signed in as designer@patina.dev');

// ════════ THE LIBRARY ROOM ════════
await shot('library-room', async () => {
  await lib();
  await page.waitForSelector('text=/My Library/', { timeout: 15_000 });
});

// Inline Quick Tags — open Teach, pick a real archetype chip (teaches a piece → "Taught today")
await shot('library-quick-tags', async () => {
  await page.locator('button:has-text("Teach →")').first().click();
  await page.waitForSelector('text=/What is its character\\?/', { timeout: 10_000 });
  await page.locator('button:has-text("Warm Modern")').first().click();
  await page.waitForTimeout(300);
});
await shot('library-quick-tags-saved', async () => {
  await page.locator('button:has-text("Save teaching")').first().click();
  await page.waitForTimeout(1500); // assign + invalidation
});

// The foot — "Taught today" reads the day (F3). The foot is the last element, so
// it can't scroll to center; capture a full-width (≥1280) clipped strip so the
// count is legible. Handled outside shot() because it self-captures via clip.
try {
  await lib();
  await page.waitForSelector('text=/Taught today/', { timeout: 20_000 });
  for (let i = 0; i < 40; i++) {
    const v = await page.evaluate(() => {
      const s = [...document.querySelectorAll('span')].find((n) => n.textContent?.trim() === 'Taught today');
      return s?.previousElementSibling?.textContent?.trim() ?? '';
    });
    if (v && v !== '—') break;
    await page.waitForTimeout(500);
  }
  const box = await page.evaluate(() => {
    const s = [...document.querySelectorAll('span')].find((n) => n.textContent?.trim() === 'Taught today');
    const foot = s?.closest('div');
    foot?.scrollIntoView({ block: 'center' });
    const r = foot?.getBoundingClientRect();
    return r ? { y: r.y, h: r.height } : null;
  });
  await page.waitForTimeout(400);
  const top = Math.max(0, Math.round(box.y) - 90);
  await page.screenshot({ path: `${OUT}library-foot.png`, clip: { x: 0, y: top, width: 1440, height: Math.min(900 - top, Math.round(box.h) + 180) } });
  done.push('library-foot');
  console.log('✓ library-foot');
} catch (e) {
  failed.push(`library-foot: ${e.message?.split('\n')[0]}`);
  console.log(`✗ library-foot — ${e.message?.split('\n')[0]}`);
}

// Deep Analysis — open Teach first (the link lives inside the Quick Tags panel), then the paper sheet
await shot('library-deep-analysis', async () => {
  await lib();
  await page.locator('button:has-text("Teach →")').first().click();
  await page.waitForSelector('text=/What is its character\\?/', { timeout: 10_000 });
  await page.locator('button:has-text("Deep analysis →")').first().click();
  await page.waitForSelector('[role="dialog"][aria-label*="Deep analysis"]', { timeout: 12_000 });
});
await page.keyboard.press('Escape').catch(() => {});

// Capture — the paper sheet (fields scoped INSIDE the dialog, not the librarian bar behind it)
await shot('library-capture-sheet', async () => {
  await lib();
  await page.locator('button:has-text("Capture")').first().click();
  await page.waitForSelector('[role="dialog"][aria-label="Capture into My Library"]', { timeout: 12_000 });
  const dlg = '[role="dialog"][aria-label="Capture into My Library"]';
  await page.locator(`${dlg} input[type="url"]`).fill('https://example.com/heirloom-oak-sideboard');
  await page.locator(`${dlg} input[type="text"]`).fill('Heirloom Oak Sideboard');
});
await page.keyboard.press('Escape').catch(() => {});

// Promote — the paper RoomSheet re-skin (F4); needs a My Library piece (seeded by the demo SQL)
await shot('library-promote-sheet', async () => {
  await lib();
  await page.waitForSelector('text=/My Library/', { timeout: 20_000 });
  const promote = page.locator('button:has-text("Promote ↑")').first();
  await promote.waitFor({ timeout: 12_000 });
  await promote.scrollIntoViewIfNeeded();
  await promote.click();
  await page.waitForSelector('[role="dialog"][aria-label="Promote to Studio Library"]', { timeout: 12_000 });
});
await page.keyboard.press('Escape').catch(() => {});

// ════════ THE ENGINE (⌘K ask-and-place) ════════
await shot('engine-ask', async () => {
  await lib();
  await page.keyboard.press('Meta+k');
  await page.waitForSelector('[role="dialog"][aria-label="Command bar"]', { timeout: 10_000 });
  await page.fill('input[aria-label="Find anything, or ask the Engine"]', 'credenza');
  await page.locator('button:has-text("Ask the Engine")').first().click();
  await page.waitForSelector('button:has-text("Place →")', { timeout: 25_000 });
  await page.waitForTimeout(400);
});
await shot('engine-placed', async () => {
  const dialog = page.locator('[role="dialog"][aria-label="Command bar"]');
  await page.locator('text=Place into').locator('xpath=following-sibling::button[1]').click({ timeout: 8000 }).catch(() => {});
  await dialog.locator('button:has-text("Place →")').first().click();
  await page.waitForSelector('text=/placed ✓/', { timeout: 12_000 });
});
await page.keyboard.press('Escape').catch(() => {});

// ════════ THE ACCOUNTS BOOK (a Drawer sheet opened by the open-ledger event) ════════
const openAccounts = async (pageKey) => {
  await lib();
  await page.evaluate(
    (pk) => window.dispatchEvent(new CustomEvent('document:open-ledger', { detail: { name: 'accounts', context: { page: pk } } })),
    pageKey,
  );
  await page.waitForSelector('text=/Studio eyes only/', { timeout: 12_000 });
};
await shot('accounts-ledger', async () => { await openAccounts('ledger'); });
await shot('accounts-receivables', async () => { await openAccounts('receivables'); await page.waitForTimeout(500); });
// The Aesthete fold (F2) — the twinned Pledge with the provisional commons number
await shot('aesthete-fold', async () => {
  await openAccounts('earnings');
  await page.waitForSelector('text=/given to the commons/', { timeout: 8000 });
  await page.evaluate(() => {
    const s = [...document.querySelectorAll('*')].find((n) => n.children.length === 0 && n.textContent?.trim() === 'given to the commons');
    s?.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(500);
});

// ════════ THE DESK (the overdue receivable need) ════════
await shot('desk-receivable', async () => {
  await page.goto(`${BASE}/desk`);
  await page.waitForSelector('text=/NEEDS YOUR HAND/', { timeout: 30_000 });
  await page.waitForTimeout(800);
});

// ════════ THE COMPOSING PAGE (partial + near-complete; Strata Mark the only progress) ════════
await shot('compose-partial', async () => {
  await page.goto(`${BASE}/compose`);
  await page.waitForSelector('text=/composed/', { timeout: 30_000 });
  await page.fill('input[placeholder="e.g. Heirloom Oak Dining Table"]', 'Linnea Sideboard');
  await page.fill('input[placeholder="Nordic Atelier"]', 'Verellen');
  await page.waitForTimeout(500);
});
await shot('compose-near-complete', async () => {
  for (const s of ['The piece', 'Commerce', 'Style & character']) {
    await page.locator(`button:has-text("${s}")`).first().click().catch(() => {});
    await page.waitForTimeout(250);
  }
  const fills = [
    ['input[placeholder=\'72"\']', '64'], ['input[placeholder=\'38"\']', '20'], ['input[placeholder=\'30"\']', '34'],
    ['input[placeholder="solid white oak, hand-rubbed oil"]', 'solid white oak, hand-rubbed oil'],
    ['input[placeholder="3360"]', '3360'], ['input[placeholder="4200"]', '4200'], ['input[placeholder="11"]', '11'],
  ];
  for (const [sel, val] of fills) await page.fill(sel, val).catch(() => {});
  await page.locator('button:has-text("Warm Modern")').first().click().catch(() => {});
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
});

console.log(`\nDONE: ${done.length} shots → ${OUT}`);
if (failed.length) console.log(`NOTE (${failed.length}):\n  ` + failed.join('\n  '));
await browser.close();
