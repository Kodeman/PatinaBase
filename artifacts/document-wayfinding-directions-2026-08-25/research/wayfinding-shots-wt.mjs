/**
 * E2 evidence:shots-flag-on — The Document Wayfinding Review (2026-08-25).
 *
 * Copied from wayfinding-shots.mjs (E1, flag OFF) and cut down to the
 * Worktable (flag `worktable`) capture list only. Login/hide-overlays/shot
 * helpers are unchanged. Uses the SAME corrected ids E1 found (the local DB
 * was reseeded between E0 and E1; re-verified via psql at E2 shot-time that
 * no further reseed happened — same ids still resolve to the same
 * active_section/proposal_status rows).
 *
 * Run three passes from apps/designer-portal:
 *   SHOT_W=1440 SHOT_H=1400 SHOT_PREFIX=wt- node <this file>
 *   SHOT_W=1280 SHOT_H=1400 SHOT_PREFIX=wt- node <this file>
 *   SHOT_W=390  SHOT_H=844  SHOT_PREFIX=wt- node <this file>
 */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const OUT = '/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/shots/';
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:3000';
const done = [];
const failed = [];

const W = Number(process.env.SHOT_W) || 1440;
const H = Number(process.env.SHOT_H) || 900;
const PREFIX = process.env.SHOT_PREFIX || 'wt-';
const MOBILE = W < 700;

const LADDER = JSON.parse(
  readFileSync(path.join(__dirname, 'state-ladder.json'), 'utf8'),
);
const S = LADDER.states;
// Same corrections E1 made (psql-reverified at E2 shot-time — still current):
S.brief = { ...S.brief, id: 'def699b9-4ffa-4d8e-8a9f-17b3d7db84fd' };
S.project_rich = { ...S.project_rich, id: '2992a486-b2bd-4139-9e51-33ed1621c59c' };

const TEST_EMAIL = process.env.DESIGNER_E2E_EMAIL ?? 'designer@patina.dev';
const TEST_PASSWORD = process.env.DESIGNER_E2E_PASSWORD ?? 'password123';
const WELCOME_SHOWN_KEY = 'help-system.welcome-shown.first-project-walkthrough';

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

const clipShot = async (name, locator, pad = 24) => {
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

await signIn(page);

// ── Flag-live proof: wait for the frame's data-table attribute on the first doc ──
// (deriveTable maps active_section='brief' → 'intake'.)
await shot(`flag-proof-intake-${W}`, async () => {
  await gotoDoc(S.brief.id);
  await page.waitForSelector('[data-table="intake"]', { timeout: 15_000 });
}, { full: false });

// ════════════════════════════════════════════════════════════════
// ALL WIDTHS, fullPage — one per table
// ════════════════════════════════════════════════════════════════
await shot(`intake-${W}`, async () => {
  await gotoDoc(S.brief.id);
  await page.waitForSelector('[data-table="intake"]', { timeout: 15_000 });
}, { full: true });

await shot(`speccing-${W}`, async () => {
  await gotoDoc(S.direction.id);
  await page.waitForSelector('[data-table="speccing"]', { timeout: 15_000 });
}, { full: true });

await shot(`finalize-${W}`, async () => {
  await gotoDoc(S.proposal_sent.id);
  await page.waitForSelector('[data-table="finalize"]', { timeout: 15_000 });
}, { full: true });

await shot(`delivery-project-${W}`, async () => {
  await gotoDoc(S.project_rich.id);
  await page.waitForSelector('[data-table="delivery"][data-table-setting="procurement"]', { timeout: 15_000 });
}, { full: true });

await shot(`delivery-install-${W}`, async () => {
  await gotoDoc(S.install.id);
  await page.waitForSelector('[data-table="delivery"][data-table-setting="install"]', { timeout: 15_000 });
}, { full: true });

await shot(`delivery-care-${W}`, async () => {
  await gotoDoc(S.care.id);
  await page.waitForSelector('[data-table="delivery"][data-table-setting="procurement"]', { timeout: 15_000 });
}, { full: true });

// ════════════════════════════════════════════════════════════════
// 1440 ONLY — viewport/clipped detail shots
// ════════════════════════════════════════════════════════════════
if (W === 1440) {
  // NOTE: IntakeSpreadHeader deliberately renders ONLY on the discovery
  // spread of Table I, not on brief (BriefSection already prints the same
  // three facts there — see the component's own doc comment). Using
  // discovery, not brief, for this shot.
  try {
    await gotoDoc(S.discovery.id);
    await page.waitForSelector('[data-intake-spread-header]', { timeout: 15_000 });
    await clipShot('wt-intake-head', page.locator('[data-intake-spread-header]'));
  } catch (e) {
    failed.push(`wt-intake-head: ${e.message?.split('\n')[0]}`);
    console.log(`✗ wt-intake-head — ${e.message?.split('\n')[0]}`);
    try { await page.screenshot({ path: `${OUT}${PREFIX}wt-intake-head.png` }); } catch {}
  }

  try {
    await gotoDoc(S.direction.id);
    await page.waitForSelector('[data-table="speccing"]', { timeout: 15_000 });
    // The Speccing table's tools: rooms rail, scheme, boards strip, library reach-in —
    // all mount as direct children of the [data-table="speccing"] frame div.
    await clipShot('wt-speccing-tools', page.locator('[data-table="speccing"]'));
  } catch (e) {
    failed.push(`wt-speccing-tools: ${e.message?.split('\n')[0]}`);
    console.log(`✗ wt-speccing-tools — ${e.message?.split('\n')[0]}`);
    try { await page.screenshot({ path: `${OUT}${PREFIX}wt-speccing-tools.png` }); } catch {}
  }

  try {
    await gotoDoc(S.proposal_sent.id);
    await page.waitForSelector('[data-finalize-head]', { timeout: 15_000 });
    await clipShot('wt-finalize-head', page.locator('[data-finalize-head]'));
  } catch (e) {
    failed.push(`wt-finalize-head: ${e.message?.split('\n')[0]}`);
    console.log(`✗ wt-finalize-head — ${e.message?.split('\n')[0]}`);
    try { await page.screenshot({ path: `${OUT}${PREFIX}wt-finalize-head.png` }); } catch {}
  }

  try {
    // ReleaseLift only mounts when `releaseOffered` (a runtime flip inside
    // FFESection, not reachable without a state change per the brief). Try
    // it first; if absent, fall back to the money region head alone — still
    // "the money seam" the brief asks for, honestly labeled as partial.
    await gotoDoc(S.project_rich.id);
    // MoneyRegion folds under a FoldSeam by default (E1 harness notes §7) —
    // unfold it so `aria-label="Money"` actually exists in the DOM.
    const foldTrigger = page.locator('[data-fold-seam="money-region-heading"]');
    if (await foldTrigger.count().catch(() => 0) > 0) {
      await foldTrigger.first().scrollIntoViewIfNeeded();
      await foldTrigger.first().click().catch(() => {});
      await page.waitForTimeout(400);
    }
    await page.waitForSelector('[aria-label="Money"]', { timeout: 15_000 }).catch(() => {});
    const lift = page.locator('[data-release-lift]');
    const liftCount = await lift.count().catch(() => 0);
    if (liftCount > 0) {
      console.log('wt-delivery-head: release lift IS naturally present');
      await clipShot('wt-delivery-head', lift);
    } else {
      console.log('wt-delivery-head: release lift NOT naturally present (releaseOffered stays false) — capturing money seam only');
      const money = page.locator('[aria-label="Money"]');
      await clipShot('wt-delivery-head', money);
    }
  } catch (e) {
    failed.push(`wt-delivery-head: ${e.message?.split('\n')[0]}`);
    console.log(`✗ wt-delivery-head — ${e.message?.split('\n')[0]}`);
    try { await page.screenshot({ path: `${OUT}${PREFIX}wt-delivery-head.png` }); } catch {}
  }

  // "table is ready to turn" line — do NOT mutate state to force it.
  // Just check whether it appears naturally on any of the 6 ladder docs.
  for (const [label, id] of [
    ['brief', S.brief.id],
    ['discovery', S.discovery.id],
    ['direction', S.direction.id],
    ['proposal_sent', S.proposal_sent.id],
    ['project_rich', S.project_rich.id],
    ['install', S.install.id],
    ['care', S.care.id],
  ]) {
    await gotoDoc(id);
    const turnLine = page.locator('[data-table-turn]');
    const count = await turnLine.count().catch(() => 0);
    console.log(`turn-line-check ${label}: ${count > 0 ? 'PRESENT' : 'absent'}`);
  }
}

// ════════════════════════════════════════════════════════════════
// 390 ONLY, fullPage
// ════════════════════════════════════════════════════════════════
if (W === 390) {
  await shot('wt-delivery-project-390', async () => {
    await gotoDoc(S.project_rich.id);
    await page.waitForSelector('[data-table="delivery"]', { timeout: 15_000 });
  }, { full: true });

  await shot('wt-speccing-390', async () => {
    await gotoDoc(S.direction.id);
    await page.waitForSelector('[data-table="speccing"]', { timeout: 15_000 });
  }, { full: true });
}

console.log(`\nDONE (${PREFIX || 'no-prefix'}): ${done.length} shots → ${OUT}`);
if (failed.length) console.log(`NOTE (${failed.length}):\n  ` + failed.join('\n  '));
await browser.close();
