/**
 * Evidence shots for The Smart Lens proposal (2026-08-28).
 *
 * Ported from artifacts/document-wayfinding-directions-2026-08-25/research/
 * wayfinding-shots.mjs, keeping:
 *   (a) login, ported from e2e/fixtures/auth.ts (the disclosure-button flow,
 *       landing on /desk).
 *   (b) hide-dev-overlays init script, ported from
 *       e2e/helpers/hide-dev-overlays.ts.
 *   (c) the help-system.welcome-shown.first-project-walkthrough localStorage
 *       seed, set before every navigation via addInitScript.
 *   (d) the SHOT_W / SHOT_H / SHOT_PREFIX env interface and the shot()/
 *       clipShot() helpers.
 *
 * Deltas for this program:
 *   - OUT points at this program's shots/ directory.
 *   - Doc ids are read from research/state-ladder.json (rungs.rich.doc_id,
 *     rungs.prework.doc_id) instead of the wayfinding ladder's states — a
 *     missing file or missing key throws a clear error rather than falling
 *     back to a hardcoded id.
 *   - The shot list is this program's: four viewport shots per doc (s0-s3)
 *     plus a set of element clips at 1440/1280/390, and one reduced-motion
 *     shot. See the section comments below for exactly what each captures.
 *   - clipShot() no longer takes a fallback full-viewport screenshot when its
 *     selector cannot be found — a miss is recorded in `failed` (and belongs
 *     in the ledger) instead of a placeholder PNG.
 *
 * Run three passes from apps/designer-portal:
 *   SHOT_W=1440 SHOT_H=900 SHOT_PREFIX=w1440- node <this file>
 *   SHOT_W=1280 SHOT_H=900 SHOT_PREFIX=w1280- node <this file>
 *   SHOT_W=390  SHOT_H=844 SHOT_PREFIX=m390-  node <this file>
 */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const OUT = '/Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28/shots/';
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:3000';
const done = [];
const failed = [];
/** Expected, non-error skips (e.g. a doc that genuinely has no FF&E region
 *  head) — belongs in the ledger as a skip, not a failure. */
const skipped = [];

const W = Number(process.env.SHOT_W) || 1440;
const H = Number(process.env.SHOT_H) || 900;
const PREFIX = process.env.SHOT_PREFIX || '';
const MOBILE = W < 700;

// ── State ladder (resolved doc ids) ──
// This program's ladder is keyed by rung, not by ladder stage name — a rich
// specimen and a pre-work specimen, per the plan (source/plan.md). Both keys
// are required; a missing file or a missing key throws immediately rather
// than silently shooting the wrong document.
let LADDER;
try {
  LADDER = JSON.parse(readFileSync(path.join(__dirname, 'state-ladder.json'), 'utf8'));
} catch (e) {
  throw new Error(
    'research/state-ladder.json could not be read (expected keys rungs.rich.doc_id, ' +
    'rungs.prework.doc_id): ' + e.message,
  );
}
const RUNGS = (LADDER && LADDER.rungs) || {};
for (const key of ['rich', 'prework']) {
  if (!RUNGS[key] || !RUNGS[key].doc_id) {
    throw new Error(`research/state-ladder.json is missing rungs.${key}.doc_id`);
  }
}
const DOCS = { rich: RUNGS.rich.doc_id, prework: RUNGS.prework.doc_id };

const TEST_EMAIL = process.env.DESIGNER_E2E_EMAIL ?? 'designer@patina.dev';
const TEST_PASSWORD = process.env.DESIGNER_E2E_PASSWORD ?? 'password123';
const WELCOME_SHOWN_KEY = 'help-system.welcome-shown.first-project-walkthrough';

// ── hide-dev-overlays (ported from e2e/helpers/hide-dev-overlays.ts) ──
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

/**
 * Clip-capture: screenshot just the bounding box of a locator, padded.
 * A miss (no bounding box / selector not found) is recorded in `failed` —
 * it belongs in the shot ledger, not as a placeholder PNG. Never writes a
 * fallback full-viewport screenshot on failure.
 */
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
    console.log(`✗ ${name} — ${e.message?.split('\n')[0]} (no placeholder written)`);
  }
};

/** Run fn against doc `id`, recording any thrown error (from gotoDoc or fn) as a failure. */
const withDoc = async (id, fn) => {
  try {
    await gotoDoc(id);
    await fn();
  } catch (e) {
    const msg = e.message?.split('\n')[0] ?? String(e);
    failed.push(msg);
    console.log(`✗ ${msg}`);
  }
};

const gotoDoc = async (id) => {
  await page.goto(`${BASE}/doc/${id}`, { waitUntil: 'domcontentloaded', timeout: 40_000 });
  await page.waitForSelector('[data-document-shell]', { timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  // FIX (C1, 2026-08-28): `page.goto` to a URL matching the page's CURRENT
  // url does not reliably reset scroll to 0 (Chromium/Next scroll
  // restoration) — confirmed by direct measurement: scrolling to 2000,
  // then re-`goto`-ing the identical `/doc/<id>` URL, left scrollY at 1106,
  // not 0. Every caller of gotoDoc computes its own scroll target explicitly
  // right after this returns, so forcing a clean top here is always safe —
  // and it closes a real bug: 'ticket-unfolded' (a later `withDoc(DOCS.rich,
  // ...)` re-visiting the same rich doc URL) was inheriting the scrolled-past
  // -the-FF&E-region position left by the 'spine-running-index-mid' block two
  // steps earlier. `[data-job-ticket]` is `position: sticky`, so
  // clipShot's own `scrollIntoViewIfNeeded()` treated it as already visible
  // and never corrected the scroll — the ticket stayed pinned/collapsed and
  // the shot captured the wrong (folded) state.
  await page.evaluate(() => window.scrollTo(0, 0));
};

const waitFonts = async (p = page) => {
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(400);
};

/**
 * Land the FF&E region head just under the sticky seam.
 *
 * FIX (C1, 2026-08-28): the original approach called Playwright's
 * `locator.scrollIntoViewIfNeeded()` on `[data-region-head="ffe"]` itself —
 * that API only guarantees the element is *somewhere* in the viewport
 * (nearest-edge semantics), not aligned to the top, so the head could land
 * anywhere. It then subtracted the seam height from scrollY
 * (`scrollBy(0, -seam)`), which scrolls UP — moving the head further DOWN the
 * viewport, away from the top, the opposite of what "seam-adjusted" needs.
 * Measured: head landed at top=124.6px pre-adjustment, top=188.6px after
 * (worse).
 *
 * The app already solves exactly this with CSS: `[data-index-region="ffe"]`
 * (the FF&E region's root, the ancestor of `[data-region-head="ffe"]`) has
 * `scroll-margin-top: max(var(--doc-seam-height, 0px), 4rem)` (globals.css),
 * the same rule the real in-app spine/running-index navigation
 * (`scrollToRegion`) relies on. A forced `scrollIntoView({ block: 'start' })`
 * on that region root honors the scroll-margin and lands the head ~70-80px
 * from the top — comfortably inside the 120px budget. Measured after the fix:
 * head top=77.8px.
 */
const scrollFfeHeadToTop = async () => {
  await page.evaluate(() => {
    const region =
      document.querySelector('[data-index-region="ffe"]') ||
      document.querySelector('[data-region-head="ffe"]');
    if (!region) throw new Error('[data-index-region="ffe"] not found');
    region.scrollIntoView({ block: 'start', behavior: 'instant' });
  });
};

await signIn(page);

// ════════════════════════════════════════════════════════════════
// Per-doc viewport ladder: s0 (top) / s1 (past the letterhead) /
// s2 (FF&E region head, seam-adjusted) / s3 (foot) — for rich and prework.
// ════════════════════════════════════════════════════════════════
for (const [docKey, docId] of Object.entries(DOCS)) {
  await shot(`${docKey}-s0`, async () => {
    await gotoDoc(docId);
    await page.evaluate(() => window.scrollTo(0, 0));
    await waitFonts();
  });

  await shot(`${docKey}-s1`, async () => {
    await gotoDoc(docId);
    const letterhead = page.locator('#document-project-status');
    await letterhead.waitFor({ timeout: 15_000 });
    await page.evaluate(() => {
      const el = document.querySelector('#document-project-status');
      if (!el) throw new Error('letterhead #document-project-status not found');
      const bottom = el.getBoundingClientRect().bottom;
      window.scrollTo(0, bottom + window.scrollY + 1);
    });
    await waitFonts();
    const bottom = await page.evaluate(() => {
      const el = document.querySelector('#document-project-status');
      return el ? el.getBoundingClientRect().bottom : null;
    });
    if (bottom === null || bottom >= 0) {
      throw new Error(`letterhead did not clear the top after scroll (bottom=${bottom})`);
    }
  });

  // s2 is only meaningful on a doc that actually renders an FF&E region head
  // (a "project"-stage doc). The prework specimen is a "proposal"-stage doc
  // and — confirmed by probing the live DOM — renders no
  // [data-region-head="ffe"] / [data-index-region="ffe"] at all. That is an
  // expected absence per this program's brief, not an error: skip fast (a
  // short existence probe, not the shot's own 15s waitFor) and record it in
  // `skipped`, not `failed`. No placeholder PNG is written.
  await gotoDoc(docId);
  const hasFfeHead = await page
    .locator('[data-region-head="ffe"]')
    .first()
    .isVisible({ timeout: 3_000 })
    .catch(() => false);
  if (!hasFfeHead) {
    skipped.push(`${docKey}-s2: no [data-region-head="ffe"] on this doc (expected for a proposal-stage doc)`);
    console.log(`⊘ ${docKey}-s2 — skipped, no [data-region-head="ffe"] on this doc`);
  } else {
    await shot(`${docKey}-s2`, async () => {
      await gotoDoc(docId);
      const head = page.locator('[data-region-head="ffe"]');
      await head.waitFor({ timeout: 15_000 });
      await scrollFfeHeadToTop();
      await waitFonts();
      const top = await page.evaluate(() => {
        const el = document.querySelector('[data-region-head="ffe"]');
        return el ? el.getBoundingClientRect().top : null;
      });
      if (top === null || Math.abs(top) > 120) {
        throw new Error(`[data-region-head="ffe"] not within 120px of the top after seam adjustment (top=${top})`);
      }
    });
  }

  await shot(`${docKey}-s3`, async () => {
    await gotoDoc(docId);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await waitFonts();
  });
}

// ════════════════════════════════════════════════════════════════
// 1440 ONLY — element clips
// ════════════════════════════════════════════════════════════════
if (W === 1440) {
  await withDoc(DOCS.rich, async () => {
    await clipShot('spine-full', page.locator('[data-document-spine]'));
  });

  await withDoc(DOCS.rich, async () => {
    // "at s2" — the FF&E region head brought to the top, seam-adjusted.
    const head = page.locator('[data-region-head="ffe"]');
    await head.waitFor({ timeout: 15_000 });
    await scrollFfeHeadToTop();
    await waitFonts();
    await clipShot('spine-running-index-mid', page.locator('[data-document-spine]'));
  });

  await withDoc(DOCS.rich, async () => {
    // FIX (C1, 2026-08-28): hardened against an observed flake — one run
    // captured this ticket mid-hydration (data-unfolded not yet "true",
    // `rows` not yet populated), yielding a ~50px sliver instead of the
    // 8-row unfolded ticket. Explicitly wait for the attribute the component
    // itself publishes (job-ticket.tsx) before clipping.
    await page.locator('[data-job-ticket]').first().waitFor({ timeout: 15_000 });
    await page
      .waitForFunction(
        () => document.querySelector('[data-job-ticket]')?.getAttribute('data-unfolded') === 'true',
        { timeout: 10_000 },
      )
      .catch(() => {});
    await clipShot('ticket-unfolded', page.locator('[data-job-ticket]'));
  });

  await withDoc(DOCS.rich, async () => {
    // FIX (C1, 2026-08-28): scrolling to the letterhead's own bottom is NOT
    // enough to collapse the ticket. job-ticket.tsx pins (and folds to its
    // two-line seam form) only once its OWN sentinel —
    // `#doc-ticket-sentinel`, rendered immediately above the ticket in the
    // tree, well below the letterhead — leaves the viewport (its
    // IntersectionObserver, threshold 0). Measured: after scrolling to
    // letterhead.bottom+1 the sentinel sat at top=17px (still intersecting),
    // `data-pinned` stayed unset, and the ticket stayed in its unfolded
    // 8-row form — this "ticket-seam" shot was capturing the WRONG state
    // (unfolded, not the seam). Scroll past the sentinel itself instead.
    // `state: 'attached'`, not the default 'visible' — the sentinel is an
    // empty `aria-hidden` div with no content, so it has zero rendered area
    // and Playwright's default visibility heuristic never considers it
    // visible even though it is very much present and doing its job.
    const sentinelId = 'doc-ticket-sentinel';
    await page.waitForSelector(`#${sentinelId}`, { state: 'attached', timeout: 15_000 });
    await page.evaluate((id) => {
      const sentinel = document.getElementById(id);
      if (!sentinel) throw new Error('ticket sentinel not found');
      window.scrollBy(0, sentinel.getBoundingClientRect().top + 5);
    }, sentinelId);
    await waitFonts();
    await page.waitForFunction(
      () => document.querySelector('[data-job-ticket]')?.getAttribute('data-pinned') === 'true',
      { timeout: 10_000 },
    );
    await clipShot('ticket-seam', page.locator('[data-job-ticket]'));
  });

  await withDoc(DOCS.rich, async () => {
    const status = page.locator('#document-project-status');
    await status.waitFor({ timeout: 15_000 });
    const phasesToggle = status.getByRole('button', { name: /phases/i });
    if (await phasesToggle.first().isVisible().catch(() => false)) {
      await phasesToggle.first().click();
      await page.waitForTimeout(400);
    }
    await clipShot('letterhead-vitals-phases-open', status);
  });

  await withDoc(DOCS.rich, async () => {
    await clipShot('margin-rail', page.locator('[data-margin-panel]'));
  });

  await withDoc(DOCS.rich, async () => {
    await clipShot('region-head-ffe', page.locator('[data-region-head="ffe"]'));
  });

  await withDoc(DOCS.rich, async () => {
    await clipShot('fold-seam-folded', page.locator('[data-fold-seam]').first());
  });

  await withDoc(DOCS.rich, async () => {
    let target = page.locator('[aria-label="Needs attention"]');
    if (!(await target.first().isVisible().catch(() => false))) {
      target = page.locator('section[aria-labelledby="document-next-up"]');
    }
    await clipShot('guide-or-red-letter', target);
  });

  await withDoc(DOCS.rich, async () => {
    await clipShot('instruments-row', page.locator('[aria-label="Document letterhead actions"]'));
  });
}

// ════════════════════════════════════════════════════════════════
// 1280 ONLY — element clips
// ════════════════════════════════════════════════════════════════
if (W === 1280) {
  await withDoc(DOCS.rich, async () => {
    await clipShot('spine-glyph-rail', page.locator('[data-document-spine]'));
  });

  await withDoc(DOCS.rich, async () => {
    await clipShot('margin-tab-closed', page.locator('[data-margin-trigger]'));
  });

  await withDoc(DOCS.rich, async () => {
    const trigger = page.locator('[data-margin-trigger]');
    await trigger.waitFor({ timeout: 15_000 });
    await trigger.click();
    await page.waitForTimeout(400);
    await clipShot('margin-sheet-open', page.locator('[data-margin-panel]'));
  });
}

// ════════════════════════════════════════════════════════════════
// 390 ONLY — element clips
// ════════════════════════════════════════════════════════════════
if (W === 390) {
  await withDoc(DOCS.rich, async () => {
    await clipShot('mobile-bar', page.locator('[data-testid="mobile-bar"]'));
  });

  await withDoc(DOCS.rich, async () => {
    const bar = page.locator('[data-testid="mobile-bar"]');
    await bar.waitFor({ timeout: 15_000 });
    const control = bar.getByRole('button', { name: /open sections|sections/i });
    await control.first().click();
    await page.waitForTimeout(500);
    await clipShot('mobile-spine-sheet', page.locator('[role="dialog"]'));
  });

  await withDoc(DOCS.rich, async () => {
    // FIX (C1, 2026-08-28): `[data-margin-chip]` does not exist anywhere in
    // the app — MobileMarginChips (src/components/document/mobile/
    // mobile-margin-chips.tsx) renders its chips as plain <button>s inside a
    // <div className="... min-[980px]:hidden"> with no distinguishing data
    // attribute. That unique Tailwind class fragment is the only stable
    // handle; confirmed live (rich doc, 390px) it renders exactly one such
    // container with 5 chip children. An XPath contains(@class, ...) check
    // sidesteps needing to escape the class's brackets/colon for a CSS
    // selector.
    await clipShot(
      'mobile-margin-chips',
      page.locator('xpath=//div[contains(@class, "min-[980px]:hidden")]//button[1]'),
    );
  });
}

// ════════════════════════════════════════════════════════════════
// Reduced motion — one shot, always 1440x900 regardless of the pass's own
// W/H, taken in its own context so it never disturbs the shared `page`.
// ════════════════════════════════════════════════════════════════
if (W === 1440) {
  const reducedCtx = await browser.newContext({
    viewport: { width: 1440, height: H },
    reducedMotion: 'reduce',
  });
  const reducedPage = await reducedCtx.newPage();
  await hideDevOverlays(reducedPage);
  reducedPage.setDefaultTimeout(20_000);
  try {
    await signIn(reducedPage);
    await reducedPage.goto(`${BASE}/doc/${DOCS.rich}`, { waitUntil: 'domcontentloaded', timeout: 40_000 });
    await reducedPage.waitForSelector('[data-document-shell]', { timeout: 30_000 });
    await reducedPage.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    const letterhead = reducedPage.locator('#document-project-status');
    await letterhead.waitFor({ timeout: 15_000 });
    await reducedPage.evaluate(() => {
      const el = document.querySelector('#document-project-status');
      if (!el) throw new Error('letterhead #document-project-status not found');
      const bottom = el.getBoundingClientRect().bottom;
      window.scrollTo(0, bottom + window.scrollY + 1);
    });
    await waitFonts(reducedPage);
    const bottom = await reducedPage.evaluate(() => {
      const el = document.querySelector('#document-project-status');
      return el ? el.getBoundingClientRect().bottom : null;
    });
    if (bottom === null || bottom >= 0) {
      throw new Error(`reduced-motion letterhead assert failed (bottom=${bottom})`);
    }
    await reducedPage.screenshot({ path: `${OUT}w1440-rich-s1-reduced.png` });
    done.push('w1440-rich-s1-reduced');
    console.log('✓ w1440-rich-s1-reduced');
  } catch (e) {
    const msg = e.message?.split('\n')[0] ?? String(e);
    failed.push(`w1440-rich-s1-reduced: ${msg}`);
    console.log(`✗ w1440-rich-s1-reduced — ${msg}`);
  }
  await reducedCtx.close();
}

console.log(`\nDONE (${PREFIX || 'no-prefix'}): ${done.length} shots → ${OUT}`);
if (skipped.length) console.log(`SKIPPED (${skipped.length}):\n  ` + skipped.join('\n  '));
if (failed.length) console.log(`NOTE (${failed.length}):\n  ` + failed.join('\n  '));
await browser.close();
