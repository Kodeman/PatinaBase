/**
 * Evidence capture for "The Document — Life" flatness review (2026-08-28).
 *
 * Ported from artifacts/document-wayfinding-directions-2026-08-25/research/wayfinding-shots.mjs,
 * re-verified against the CURRENT codebase (2026-08-28):
 *   (a) login ported from apps/designer-portal/e2e/fixtures/auth.ts (unchanged).
 *   (b) hide-dev-overlays init script (TanStack Query devtools can swallow clicks in dev).
 *   (c) shot(name, fn, {full}) — fullPage:true for route shots, viewport for clips.
 *   (d) clipShot(name, locator, pad) — bounding-box crop, clamped to the viewport.
 *   (e) ids come from THIS program's research/state-ladder.json (rungs.*), not hardcoded.
 *   (f) OUT = this program's shots/ dir.
 *   (g) width-conditional shot lists via SHOT_W/SHOT_H/SHOT_PREFIX env vars.
 *
 * Run from apps/designer-portal so @playwright/test resolves:
 *   SHOT_W=1440 SHOT_H=900 SHOT_PREFIX=w1440- node <this file>
 *   SHOT_W=390  SHOT_H=844 SHOT_PREFIX=m390-  node <this file>
 */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const OUT = '/Users/kody/Code/patina-merged/artifacts/document-life-directions-2026-08-28/shots/';
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:3000';
const done = [];
const failed = [];

const W = Number(process.env.SHOT_W) || 1440;
const H = Number(process.env.SHOT_H) || 900;
const PREFIX = process.env.SHOT_PREFIX || '';
const MOBILE = W < 700;

// ── State ladder ──
const LADDER = JSON.parse(
  readFileSync(path.join(__dirname, 'state-ladder.json'), 'utf8'),
);
const R = LADDER.rungs;

const TEST_EMAIL = process.env.DESIGNER_E2E_EMAIL ?? 'designer@patina.dev';
const TEST_PASSWORD = process.env.DESIGNER_E2E_PASSWORD ?? 'password123';
const WELCOME_SHOWN_KEY = 'help-system.welcome-shown.first-project-walkthrough';

// ── hide-dev-overlays ──
async function hideDevOverlays(page) {
  await page.addInitScript(() => {
    const inject = () => {
      const style = document.createElement('style');
      style.setAttribute('data-e2e-hide-dev-overlays', '');
      style.textContent =
        '.tsqd-open-btn-container, .tsqd-main-panel { display: none !important; pointer-events: none !important; }';
      document.head?.appendChild(style);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', inject);
    } else {
      inject();
    }
  });
}

// ── auth (ported from e2e/fixtures/auth.ts) ──
async function signIn(page) {
  await page.addInitScript((key) => {
    try {
      window.localStorage.setItem(key, '1');
    } catch {
      /* ignore */
    }
  }, WELCOME_SHOWN_KEY);

  const maxAttempts = 3;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await page.goto(`${BASE}/auth/signin?callbackUrl=%2Fdesk`, {
        timeout: 30_000,
        waitUntil: 'networkidle',
      });
      if (!page.url().includes('/auth/signin')) return;

      const disclosure = page.getByRole('button', {
        name: /sign in with email|use email and password instead/i,
      });
      await disclosure.first().waitFor({ state: 'visible', timeout: 15_000 });
      await disclosure.first().click();

      const emailInput = page.getByLabel(/email/i).first();
      await emailInput.waitFor({ state: 'visible', timeout: 10_000 });
      await emailInput.fill(TEST_EMAIL);

      const passwordInput = page.getByLabel(/password/i).first();
      await passwordInput.fill(TEST_PASSWORD);

      await page.getByRole('button', { name: /^sign in$/i }).click();

      await page.waitForURL(
        /\/(desk|doc|people|library|rooms|room|drafting|compose|preferences|unauthorized)/,
        { timeout: 60_000 },
      );
      console.log('✓ signed in as', TEST_EMAIL);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) await page.waitForTimeout(500);
    }
  }
  throw new Error(`Authentication failed after ${maxAttempts} attempts: ${lastError?.message ?? 'unknown'}`);
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: W, height: H },
  isMobile: MOBILE,
  hasTouch: MOBILE,
  deviceScaleFactor: MOBILE ? 2 : 1,
});
const page = await context.newPage();
await hideDevOverlays(page);
page.setDefaultTimeout(20_000);

const shot = async (name, fn, { full = false } = {}) => {
  try {
    await fn();
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${OUT}${PREFIX}${name}.png`, fullPage: full });
    done.push(name);
    console.log(`✓ ${name}`);
  } catch (e) {
    failed.push(`${name}: ${e.message?.split('\n')[0]}`);
    console.log(`✗ ${name} — ${e.message?.split('\n')[0]}`);
    try {
      await page.screenshot({ path: `${OUT}${PREFIX}${name}.png`, fullPage: full });
    } catch {}
  }
};

/** Clip-capture: screenshot just the bounding box of a locator, padded. */
const clipShot = async (name, locator, pad = 16) => {
  try {
    await locator.first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const box = await locator.first().boundingBox();
    if (!box) throw new Error('locator has no bounding box (not visible)');
    const x = Math.max(0, Math.round(box.x) - pad);
    const y = Math.max(0, Math.round(box.y) - pad);
    const width = Math.min(W - x, Math.round(box.width) + pad * 2);
    const height = Math.min(H - y, Math.round(box.height) + pad * 2);
    await page.screenshot({ path: `${OUT}${PREFIX}${name}.png`, clip: { x, y, width, height } });
    done.push(name);
    console.log(`✓ ${name}`);
  } catch (e) {
    failed.push(`${name}: ${e.message?.split('\n')[0]}`);
    console.log(`✗ ${name} — ${e.message?.split('\n')[0]}`);
    try {
      await page.screenshot({ path: `${OUT}${PREFIX}${name}.png`, fullPage: false });
    } catch {}
  }
};

const gotoDoc = async (id) => {
  await page.goto(`${BASE}/doc/${id}`, { waitUntil: 'domcontentloaded', timeout: 40_000 });
  await page.waitForSelector('[data-document-shell]', { timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
};

const dismissWelcomeModal = async () => {
  // The pre-set localStorage key (help-system.tour.desk-walkthrough) does NOT
  // reliably suppress this: `getTourState` reads through whatever backend is
  // installed, and for a signed-in designer that's a Supabase-backed adapter
  // (see packages/help-system/src/proactive/TourController/tourState.ts doc
  // comment), not localStorage. Discovered live — "This is your Desk" covered
  // the roster on the first capture pass. Dismiss it directly instead.
  const overlay = page.locator('[data-testid="welcome-modal-overlay"]');
  if (await overlay.isVisible({ timeout: 2000 }).catch(() => false)) {
    await page.getByRole('button', { name: 'Skip for now' }).click();
    await overlay.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }
};

const gotoDesk = async () => {
  await page.goto(`${BASE}/desk`, { waitUntil: 'domcontentloaded', timeout: 40_000 });
  await page.waitForSelector('[aria-label="Desk actions"]', { timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  await dismissWelcomeModal();
};

await signIn(page);

// ════════════════════════════════════════════════════════════════
// ALL WIDTHS, fullPage — the 6 route shots + desk
// ════════════════════════════════════════════════════════════════
await shot('desk', async () => { await gotoDesk(); }, { full: true });
await shot('doc-project-rich', async () => { await gotoDoc(R.project_rich.id); }, { full: true });
await shot('doc-project-plain', async () => { await gotoDoc(R.project_plain.id); }, { full: true });
await shot('doc-proposal-sent', async () => { await gotoDoc(R.proposal_sent.id); }, { full: true });
await shot('doc-install', async () => { await gotoDoc(R.install.id); }, { full: true });
await shot('doc-brief', async () => { await gotoDoc(R.brief.id); }, { full: true });

// ════════════════════════════════════════════════════════════════
// 1440 ONLY — room routes, clips, ledger sheet
// ════════════════════════════════════════════════════════════════
if (W === 1440) {
  await shot('room-library', async () => {
    await page.goto(`${BASE}/library`, { waitUntil: 'domcontentloaded', timeout: 40_000 });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  }, { full: true });

  await shot('room-people', async () => {
    await page.goto(`${BASE}/people`, { waitUntil: 'domcontentloaded', timeout: 40_000 });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  }, { full: true });

  await shot('ledger-sheet-orders', async () => {
    await gotoDesk();
    await page.evaluate(() => {
      // Detail field is `name`, not `key` (studio-drawer.tsx's onOpen
      // destructures `detail.name`) — ported fix from the wayfinding harness.
      window.dispatchEvent(
        new CustomEvent('document:open-ledger', { detail: { name: 'orders' } }),
      );
    });
    await page.waitForSelector('[role="dialog"]', { timeout: 10_000 });
    await page.waitForTimeout(500);
  });

  // ── clip: desk-roster-rows ──
  // Locator: [data-testid="desk-roster"] (desk-roster.tsx:104) — the roster
  // container (aria-labelledby="every-job"), confirmed by source read.
  try {
    await gotoDesk();
    const roster = page.locator('[data-testid="desk-roster"]');
    await roster.waitFor({ timeout: 15_000 });
    await clipShot('desk-roster-rows', roster, 16);
  } catch (e) {
    failed.push(`desk-roster-rows: ${e.message?.split('\n')[0]}`);
    console.log(`✗ desk-roster-rows — ${e.message?.split('\n')[0]}`);
    try { await page.screenshot({ path: `${OUT}${PREFIX}desk-roster-rows.png`, fullPage: false }); } catch {}
  }

  // ── clip: spine-detail ──
  // Locator: [data-document-spine] (doc-spine.tsx:40), on doc-project-rich.
  try {
    await gotoDoc(R.project_rich.id);
    const spine = page.locator('[data-document-spine]');
    await spine.waitFor({ timeout: 15_000 });
    await clipShot('spine-detail', spine, 16);
  } catch (e) {
    failed.push(`spine-detail: ${e.message?.split('\n')[0]}`);
    console.log(`✗ spine-detail — ${e.message?.split('\n')[0]}`);
    try { await page.screenshot({ path: `${OUT}${PREFIX}spine-detail.png`, fullPage: false }); } catch {}
  }

  // ── clip: drawer-strip ──
  // Locator: [aria-label="Studio drawer"] (studio-drawer.tsx:287), on desk.
  try {
    await gotoDesk();
    const strip = page.locator('[aria-label="Studio drawer"]');
    await strip.waitFor({ timeout: 15_000 });
    await clipShot('drawer-strip', strip, 8);
  } catch (e) {
    failed.push(`drawer-strip: ${e.message?.split('\n')[0]}`);
    console.log(`✗ drawer-strip — ${e.message?.split('\n')[0]}`);
    try { await page.screenshot({ path: `${OUT}${PREFIX}drawer-strip.png`, fullPage: false }); } catch {}
  }

  // ── clip: ffe-lines ──
  // Locator: #project-ffe (ffe-section.tsx:1122, the FFESectionBody's outer
  // <section id="project-ffe">), on doc-project-rich.
  try {
    await gotoDoc(R.project_rich.id);
    const ffe = page.locator('#project-ffe');
    await ffe.waitFor({ timeout: 15_000 });
    await clipShot('ffe-lines', ffe, 16);
  } catch (e) {
    failed.push(`ffe-lines: ${e.message?.split('\n')[0]}`);
    console.log(`✗ ffe-lines — ${e.message?.split('\n')[0]}`);
    try { await page.screenshot({ path: `${OUT}${PREFIX}ffe-lines.png`, fullPage: false }); } catch {}
  }

  // ── clip: margin-rail ──
  // Locator: [data-margin-panel] (margin-rail.tsx:256), on doc-project-rich.
  try {
    await gotoDoc(R.project_rich.id);
    const margin = page.locator('[data-margin-panel]');
    await margin.waitFor({ timeout: 15_000 });
    await clipShot('margin-rail', margin, 16);
  } catch (e) {
    failed.push(`margin-rail: ${e.message?.split('\n')[0]}`);
    console.log(`✗ margin-rail — ${e.message?.split('\n')[0]}`);
    try { await page.screenshot({ path: `${OUT}${PREFIX}margin-rail.png`, fullPage: false }); } catch {}
  }

  // ── clip: status-chips — CONFIRMED UNREACHABLE with current fixture data ──
  // `StatusChip` (status-chip.tsx) is imported ONLY by plan-room / spec-book /
  // light-table-card / drafting-room components (grep-confirmed across the
  // whole app: `grep -rl "from '.*status-chip'"`). Two independent psql
  // checks close off every place it could render:
  //   1. `plan_sheets`/`plan_transmittals` both have 0 rows on this DB — the
  //      Plan room shelf on every ladder document renders its "No drawings
  //      filed yet" empty state (plan-room-set.tsx's StatusChip usages are
  //      all inside the drawing-log/current-set views, never the empty
  //      state).
  //   2. drafting-room.tsx's own StatusChip (line ~294) is gated on
  //      `spec` being truthy, sourced from a proposal_item's product spec —
  //      but `proposal_items` has exactly ONE proposal with any rows at all
  //      (`b0...002`, the sent Aspen Loft proposal, 5 items) and NONE of
  //      those 5 (or any other proposal_items row on this DB) has a
  //      `product_id` set. Every draft/direction proposal (including
  //      `d0c10000-...-b2`, tried live below) has 0 items.
  // A live probe on /drafting/d0c10000-0000-0000-0000-0000000000b2 (the
  // "Elena Marlowe" direction draft used elsewhere in this ladder)
  // independently confirms this: the StatusChip dot selector
  // (`span[aria-hidden].h-1\.5.w-1\.5.rounded-full`) matches exactly ONE
  // element on that page — a `<svg class="lucide ...">` notification-bell
  // icon in the header (coincidental class collision on `rounded-full`, NOT
  // a StatusChip). No raw data write was made to force a reachable case
  // (forbidden — business-table write). Per the brief's "never silently
  // skip" instruction: falls back to a full-page shot of the Drafting Room
  // (the closest real surface StatusChip ships in) so there is still a
  // documented artifact, marked FAILED/unreachable in the ledger rather than
  // mis-labeled as verified content.
  const DRAFTING_ID = 'd0c10000-0000-0000-0000-0000000000b2'; // "Elena Marlowe — Living Room Direction" draft, ad hoc probe target for this one clip only — not a ladder rung
  try {
    await page.goto(`${BASE}/drafting/${DRAFTING_ID}`, { waitUntil: 'domcontentloaded', timeout: 40_000 });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    const dot = page.locator('span[aria-hidden].h-1\\.5.w-1\\.5.rounded-full');
    const dotCount = await dot.count();
    throw new Error(
      `no reachable StatusChip instance in current fixture data (plan_sheets=0 rows, proposal_items.product_id all null); ` +
      `probe on /drafting/${DRAFTING_ID} found dotCount=${dotCount} matches for the chip-dot selector, none a real StatusChip (see harness comment)`,
    );
  } catch (e) {
    failed.push(`status-chips: ${e.message?.split('\n')[0]}`);
    console.log(`✗ status-chips — ${e.message?.split('\n')[0]}`);
    try { await page.screenshot({ path: `${OUT}${PREFIX}status-chips.png`, fullPage: true }); } catch {}
  }
}

// ════════════════════════════════════════════════════════════════
// 390 ONLY
// ════════════════════════════════════════════════════════════════
if (W === 390) {
  await shot('mobile-bar', async () => {
    await gotoDoc(R.project_rich.id);
    await page.waitForSelector('[data-testid="mobile-bar"]', { timeout: 15_000 });
  });
}

console.log(`\nDONE (${PREFIX || 'no-prefix'}): ${done.length} shots → ${OUT}`);
if (failed.length) console.log(`NOTE (${failed.length}):\n  ` + failed.join('\n  '));
await browser.close();
