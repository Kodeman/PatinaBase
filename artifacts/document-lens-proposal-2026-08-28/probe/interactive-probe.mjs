/**
 * PR1 — interactive probe for "The Document" (rich project doc), Smart Lens
 * proposal program (2026-08-28). Records BEHAVIOUR (not just static shots):
 * ticket fold/pin, scroll-spy, region fold, Esc/⌘K chain, hover wash, margin
 * sheet at 1280, mobile Sections sheet at 390, CLS across a scripted scroll,
 * and the spine timer/presence line over 65s.
 *
 * Run from apps/designer-portal so @playwright/test resolves:
 *   node ../../artifacts/document-lens-proposal-2026-08-28/probe/interactive-probe.mjs
 *
 * NO app edits. Writes only under artifacts/document-lens-proposal-2026-08-28/probe/.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const P = path.resolve(__dirname, '..');
const OUT = path.join(P, 'probe');
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:3000';
const LADDER = JSON.parse(
  readFileSync(path.join(P, 'research', 'state-ladder.json'), 'utf8'),
);
const RICH_ID = LADDER.rungs.rich.doc_id;

const TEST_EMAIL = process.env.DESIGNER_E2E_EMAIL ?? 'designer@patina.dev';
const TEST_PASSWORD = process.env.DESIGNER_E2E_PASSWORD ?? 'password123';
const WELCOME_SHOWN_KEY = 'help-system.welcome-shown.first-project-walkthrough';

const results = {};
const commandsRun = [];

function record(name, value) {
  results[name] = value;
}

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

async function installClsObserver(page) {
  await page.addInitScript(() => {
    window.__clsEntries = [];
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const sources = (entry.sources || []).slice(0, 3).map((s) => {
            const n = s.node;
            return n
              ? `${n.tagName || ''}${n.className ? '.' + String(n.className).split(' ').join('.') : ''}${
                  n.textContent ? ' "' + n.textContent.trim().slice(0, 40) + '"' : ''
                }`
              : '(no node)';
          });
          window.__clsEntries.push({
            value: entry.value,
            hadRecentInput: entry.hadRecentInput,
            startTime: entry.startTime,
            sources,
          });
        }
      });
      observer.observe({ type: 'layout-shift', buffered: true });
    } catch (e) {
      window.__clsObserverError = String(e);
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

async function gotoDoc(page, id) {
  await page.goto(`${BASE}/doc/${id}`, { waitUntil: 'domcontentloaded', timeout: 40_000 });
  await page.waitForSelector('[data-document-shell]', { timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  // Welcome modal (help-system) is Supabase-backed for a signed-in designer;
  // the localStorage key does not reliably suppress it (see wayfinding
  // harness comment). Dismiss it directly if it appears.
  const overlay = page.locator('[data-testid="welcome-modal-overlay"]');
  if (await overlay.isVisible({ timeout: 2000 }).catch(() => false)) {
    await page.getByRole('button', { name: 'Skip for now' }).click().catch(() => {});
    await overlay.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`  ✓ screenshot ${name}.png`);
}

// ── ITEM 3 — region fold (Money region: data-region-head="money-head",
//     FoldSeam headingId "money-region-heading") ──
// IMPORTANT: `[data-fold-seam]` is not unique — the Schedule region
// (schedule-rule-region.tsx) can already be folded at rest, so a bare
// `document.querySelector('[data-fold-seam]')` after folding Money would
// silently grab Schedule's pre-existing seam instead. Every seam lookup
// below is scoped to `[data-fold-seam="money-region-heading"]`.
const MONEY_HEADING_ID = 'money-region-heading';
const MONEY_BODY_ID = 'money-region-body';
const MONEY_SEAM_SEL = `[data-fold-seam="${MONEY_HEADING_ID}"]`;

async function runItem3(page) {
  const moneyResult = { attempted: true };
  try {
    const moneyHead = page.locator('[data-region-head="money-head"]');
    await moneyHead.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const preExistingSeams = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-fold-seam]')).map((s) => s.getAttribute('data-fold-seam')),
    );
    // Focus a control inside the region body before folding.
    const bodyControl = page.locator(`#${MONEY_BODY_ID} button, #${MONEY_BODY_ID} a`).first();
    const hasBodyControl = (await bodyControl.count()) > 0;
    if (hasBodyControl) await bodyControl.focus().catch(() => {});
    const beforeFocus = await page.evaluate(() => ({
      tag: document.activeElement?.tagName,
      name: document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim().slice(0, 40),
    }));
    const foldBtn2 = moneyHead.locator('button:has-text("Fold")');
    const hasFold = (await foldBtn2.count()) > 0;
    if (!hasFold) {
      moneyResult.hasFold = false;
      moneyResult.note =
        'No Fold control found on the money region head — could not exercise region fold on this region.';
      return moneyResult;
    }
    await foldBtn2.first().click();
    await page.waitForTimeout(350); // fold-settle animation is 300ms
    const bodyGone = await page.evaluate((id) => document.getElementById(id) === null, MONEY_BODY_ID);
    const afterFocus = await page.evaluate(() => ({
      tag: document.activeElement?.tagName,
      name: document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim().slice(0, 60),
    }));
    const seam = await page.evaluate((sel) => {
      const s = document.querySelector(sel);
      return s ? { height: s.getBoundingClientRect().height, text: s.textContent?.trim() } : null;
    }, MONEY_SEAM_SEL);
    await shot(page, '06-region-folded');
    // Compare the seam's styles to the region's own empty-state paragraph
    // (an italic <p> inside a data-index-region root), if one is present
    // elsewhere on the paper.
    const emptyStateStyle = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('[data-index-region] .italic')).find((n) => n.tagName === 'P');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { text: el.textContent?.trim().slice(0, 80), fontStyle: cs.fontStyle, fontSize: cs.fontSize, color: cs.color };
    });
    const seamStyle = await page.evaluate((sel) => {
      const s = document.querySelector(sel);
      if (!s) return null;
      const cs = getComputedStyle(s);
      return { fontStyle: cs.fontStyle, fontSize: cs.fontSize, color: cs.color };
    }, MONEY_SEAM_SEL);
    const moneySeamLocator = page.locator(MONEY_SEAM_SEL);
    const hasUnfold = (await moneySeamLocator.count()) > 0;
    let focusAfterUnfold = null;
    if (hasUnfold) {
      await moneySeamLocator.first().click();
      await page.waitForTimeout(200);
      focusAfterUnfold = await page.evaluate(() => ({
        tag: document.activeElement?.tagName,
        id: document.activeElement?.id,
        name: document.activeElement?.textContent?.trim().slice(0, 60),
      }));
    }
    Object.assign(moneyResult, {
      preExistingSeams,
      hasBodyControl,
      beforeFocus,
      bodyUnmounted: bodyGone,
      afterFocus,
      seam,
      seamStyle,
      emptyStateStyle,
      focusAfterUnfold,
    });
  } catch (e) {
    moneyResult.error = String(e.message || e);
  }
  return moneyResult;
}

// ════════════════════════════════════════════════════════════════
// PHASE A3 — standalone, lightweight: re-run item 3 alone (avoids repeating
// the full phase A run, including its 65s timer wait).
// ════════════════════════════════════════════════════════════════
async function phaseA3(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await hideDevOverlays(page);
  page.setDefaultTimeout(20_000);
  await signIn(page);
  await gotoDoc(page, RICH_ID);
  await page.waitForTimeout(300);
  record('item3_region_fold', await runItem3(page));
  await context.close();
}

// ════════════════════════════════════════════════════════════════
// PHASE A — 1440×900, normal motion: items 1, 2, 3, 4, 5, 8(normal), 9
// ════════════════════════════════════════════════════════════════
async function phaseA(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await installClsObserver(context.pages()[0] ?? (await context.newPage()));
  const page = context.pages()[0] ?? (await context.newPage());
  await hideDevOverlays(page);
  page.setDefaultTimeout(20_000);

  await signIn(page);
  await gotoDoc(page, RICH_ID);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  // ── ITEM 1 + 2 + 8(normal): one scroll pass, 0 → foot, 40px steps ──
  const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const viewportH = 900;
  const maxY = scrollHeight - viewportH;
  console.log(`document scrollHeight=${scrollHeight}, maxY=${maxY}`);

  const ticketSteps = [];
  const spineTransitions = [];
  let prevPinned = null;
  let prevActiveSet = null;
  let pinScrollY = null;
  let foldScrollY = null;
  let animationSamples = null;
  let ticketShotTaken = false;
  let foldedShotTaken = false;
  let prevRegionHeadDocY = null;
  const jumps = [];

  for (let y = 0; y <= maxY + 40; y += 40) {
    const clampedY = Math.min(y, maxY);
    await page.evaluate((yy) => window.scrollTo(0, yy), clampedY);
    await page.waitForTimeout(50);

    const step = await page.evaluate(() => {
      const ticket = document.querySelector('[data-job-ticket]');
      const firstHead = document.querySelector('[data-region-head]');
      const seamHeight = getComputedStyle(document.documentElement).getPropertyValue('--doc-seam-height').trim();
      const spineGroup = document.querySelector('[data-document-spine] [role="group"][aria-labelledby="doc-running-index-label"]');
      const currentButtons = spineGroup
        ? Array.from(spineGroup.querySelectorAll('button[aria-current]')).map((b) => ({
            current: b.getAttribute('aria-current'),
            label: b.querySelector('span')?.textContent ?? '',
          }))
        : [];
      const tRect = ticket ? ticket.getBoundingClientRect() : null;
      const hRect = firstHead ? firstHead.getBoundingClientRect() : null;
      return {
        scrollY: window.scrollY,
        pinned: ticket?.getAttribute('data-pinned') === 'true',
        unfolded: ticket?.getAttribute('data-unfolded') === 'true',
        ticketTop: tRect ? tRect.top : null,
        ticketHeight: tRect ? tRect.height : null,
        seamHeight,
        firstRegionHeadKey: firstHead?.getAttribute('data-region-head') ?? null,
        firstRegionHeadY: hRect ? hRect.top : null,
        currentButtons,
      };
    });

    ticketSteps.push(step);

    // Region-head document-space Y (viewport top + scrollY) to detect jumps
    // beyond the intentional 40px scroll delta.
    if (step.firstRegionHeadY !== null) {
      const docY = step.firstRegionHeadY + step.scrollY;
      if (prevRegionHeadDocY !== null && Math.abs(docY - prevRegionHeadDocY) > 2) {
        jumps.push({ atScrollY: step.scrollY, deltaDocY: docY - prevRegionHeadDocY });
      }
      prevRegionHeadDocY = docY;
    }

    // Pin/fold threshold detection + animation sampling.
    if (prevPinned === false && step.pinned === true) {
      pinScrollY = step.scrollY;
      foldScrollY = step.scrollY; // unfolded flips false in the same render per source read
      if (!ticketShotTaken) {
        await shot(page, '01-ticket-at-pin');
        ticketShotTaken = true;
      }
      // Sample ticket height every 16ms for 400ms at this fixed scroll position.
      animationSamples = await page.evaluate(async () => {
        const el = document.querySelector('[data-job-ticket]');
        const samples = [];
        const start = performance.now();
        return await new Promise((resolve) => {
          function tick() {
            const now = performance.now();
            samples.push({ t: Math.round(now - start), h: el ? el.getBoundingClientRect().height : null });
            if (now - start < 400) {
              setTimeout(tick, 16);
            } else {
              resolve(samples);
            }
          }
          tick();
        });
      });
      if (!foldedShotTaken) {
        await shot(page, '02-ticket-pinned-folded');
        foldedShotTaken = true;
      }
    }
    prevPinned = step.pinned;

    // Scroll-spy transitions.
    const activeSet = step.currentButtons.filter((b) => b.current === 'true').map((b) => b.label).join(',');
    if (prevActiveSet !== null && activeSet !== prevActiveSet) {
      spineTransitions.push({
        scrollY: step.scrollY,
        from: prevActiveSet,
        to: activeSet,
        regionHeadY: step.firstRegionHeadY,
      });
      if (spineTransitions.length === 1) {
        await shot(page, '05-scroll-spy-mid');
      }
    }
    prevActiveSet = activeSet;
  }

  record('item1_ticket', {
    initialTicketHeightAtScroll0: ticketSteps[0]?.ticketHeight ?? null,
    pinScrollY,
    foldScrollY,
    jumps,
    animationSamples,
    stepsSampled: ticketSteps.length,
    lastStep: ticketSteps[ticketSteps.length - 1],
  });

  record('item2_scrollspy', {
    transitions: spineTransitions,
    totalSteps: ticketSteps.length,
  });

  // ── ITEM 8 (normal motion) — CLS total from the scroll pass just done ──
  const clsNormal = await page.evaluate(() => window.__clsEntries || []);
  const clsNormalTotal = clsNormal
    .filter((e) => !e.hadRecentInput)
    .reduce((sum, e) => sum + e.value, 0);
  const clsNormalTop3 = [...clsNormal]
    .filter((e) => !e.hadRecentInput)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);
  record('item8_cls_normal', { total: clsNormalTotal, top3: clsNormalTop3, entryCount: clsNormal.length });

  // ── ITEM 1 (cont.) — click Unfold while pinned; record seam + layout shift ──
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  // Re-scroll to the pin point.
  await page.evaluate((yy) => window.scrollTo(0, yy), pinScrollY ?? 200);
  await page.waitForTimeout(150);

  const beforeUnfold = await page.evaluate(() => {
    const firstHead = document.querySelector('[data-region-head]');
    return {
      seamHeight: getComputedStyle(document.documentElement).getPropertyValue('--doc-seam-height').trim(),
      firstRegionHeadY: firstHead ? firstHead.getBoundingClientRect().top : null,
    };
  });
  const unfoldBtn = page.locator('[data-job-ticket] button:has-text("Unfold")');
  let unfoldClicked = false;
  if (await unfoldBtn.count()) {
    await unfoldBtn.first().click();
    unfoldClicked = true;
    await page.waitForTimeout(150);
  }
  const afterUnfold = await page.evaluate(() => {
    const firstHead = document.querySelector('[data-region-head]');
    const ticket = document.querySelector('[data-job-ticket]');
    return {
      seamHeight: getComputedStyle(document.documentElement).getPropertyValue('--doc-seam-height').trim(),
      firstRegionHeadY: firstHead ? firstHead.getBoundingClientRect().top : null,
      unfolded: ticket?.getAttribute('data-unfolded'),
      pinned: ticket?.getAttribute('data-pinned'),
    };
  });
  await shot(page, '03-ticket-pinned-unfolded');
  record('item1_unfold_click', { unfoldClicked, beforeUnfold, afterUnfold });

  // Fold it back for cleanliness.
  const foldBtn = page.locator('[data-job-ticket] button:has-text("Fold")');
  if (await foldBtn.count()) await foldBtn.first().click().catch(() => {});
  await page.waitForTimeout(150);

  // ── ITEM 2 (cont.) — click each running-index entry, record landing + lock ──
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  const spineGroupSel = '[data-document-spine] [role="group"][aria-labelledby="doc-running-index-label"]';
  const entryButtons = page.locator(`${spineGroupSel} button`);
  const entryCount = await entryButtons.count();
  const jumpResults = [];
  for (let i = 0; i < entryCount; i++) {
    const btn = entryButtons.nth(i);
    const label = await btn.locator('span').first().textContent().catch(() => null);
    await btn.click().catch(() => {});
    await page.waitForTimeout(50);
    const immediateCurrents = await page.evaluate((sel) => {
      return Array.from(document.querySelectorAll(`${sel} button`)).map((b) => b.getAttribute('aria-current'));
    }, spineGroupSel);
    await page.waitForTimeout(750); // past the 700ms lock
    const settled = await page.evaluate((sel) => {
      const buttons = Array.from(document.querySelectorAll(`${sel} button`));
      const activeIdx = buttons.findIndex((b) => b.getAttribute('aria-current') === 'true');
      const activeHead = document.querySelector('[data-region-head]');
      return {
        currents: buttons.map((b) => b.getAttribute('aria-current')),
        activeIdx,
      };
    }, spineGroupSel);
    jumpResults.push({ index: i, label, immediateCurrents, settledCurrents: settled.currents });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
  }
  record('item2_jump_clicks', { entryCount, jumpResults });

  // ── ITEM 3 — region fold ──
  record('item3_region_fold', await runItem3(page));

  // ── ITEM 4 — Esc chain + ⌘K ──
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  const escResult = {};
  // Esc at rest.
  const urlBefore = page.url();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const urlAfterEscAtRest = page.url();
  escResult.escAtRest = { urlBefore, urlAfterEscAtRest, navigatedAway: urlAfterEscAtRest !== urlBefore };
  // Go back to the doc for the ⌘K test.
  if (escResult.escAtRest.navigatedAway) {
    await gotoDoc(page, RICH_ID);
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  const preCmdKFocused = await page.evaluate(() => document.activeElement?.tagName);
  await page.keyboard.down('Meta');
  await page.keyboard.press('k');
  await page.keyboard.up('Meta');
  await page.waitForTimeout(250);
  const dialog = page.locator('[role="dialog"][aria-label="Command bar"]');
  const dialogVisible = await dialog.isVisible().catch(() => false);
  let dialogRect = null;
  let dialogMaxHeight = null;
  if (dialogVisible) {
    dialogRect = await dialog.boundingBox();
    dialogMaxHeight = await page.evaluate(() => {
      const resultsBox = document.querySelector('[role="dialog"][aria-label="Command bar"] .overflow-y-auto');
      return resultsBox ? getComputedStyle(resultsBox).maxHeight : null;
    });
    await page.keyboard.type('money');
    await page.waitForTimeout(300);
    const groupsText = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"][aria-label="Command bar"]');
      return d ? d.innerText.split('\n').filter(Boolean).slice(0, 30) : [];
    });
    await shot(page, '07-cmdk-open');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    const dialogGoneAfterEsc = !(await dialog.isVisible().catch(() => false));
    const focusAfterCmdKClose = await page.evaluate(() => document.activeElement?.tagName);
    escResult.cmdK = {
      opened: true,
      dialogRect,
      dialogMaxHeight,
      groupsTextSample: groupsText,
      dialogGoneAfterEsc,
      preCmdKFocused,
      focusAfterCmdKClose,
      focusReturnedToPrior: focusAfterCmdKClose === preCmdKFocused,
    };
  } else {
    escResult.cmdK = { opened: false, note: '⌘K dialog did not open' };
  }
  record('item4_esc_cmdk', escResult);

  // ── ITEM 5 — hover wash on an FF&E line ──
  const washResult = {};
  try {
    await page.evaluate(() => window.scrollTo(0, 0));
    const ffeRegion = page.locator('[data-index-region="ffe"]');
    await ffeRegion.scrollIntoViewIfNeeded().catch(() => {});
    const washRow = page.locator('.has-wash').first();
    const hasWashRow = (await washRow.count()) > 0;
    if (hasWashRow) {
      await washRow.scrollIntoViewIfNeeded();
      const box = await washRow.boundingBox();
      // Normal motion sweep sample.
      await page.mouse.move(box.x + 5, box.y + box.height / 2);
      const samples = await page.evaluate(async () => {
        const el = document.querySelector('.has-wash .row-wash');
        const out = [];
        const start = performance.now();
        return await new Promise((resolve) => {
          function tick() {
            const now = performance.now();
            const cs = el ? getComputedStyle(el) : null;
            out.push({ t: Math.round(now - start), clipPath: cs?.clipPath, bg: cs?.backgroundColor });
            if (now - start < 400) setTimeout(tick, 16);
            else resolve(out);
          }
          tick();
        });
      });
      washResult.normalMotionSamples = samples;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(220);
      washResult.resolvedBg = await page.evaluate(() => {
        const el = document.querySelector('.has-wash .row-wash');
        return el ? getComputedStyle(el).backgroundColor : null;
      });
      await page.mouse.move(0, 0);
    } else {
      washResult.note = 'No .has-wash row found in view — could not exercise hover wash on this document/viewport.';
    }
  } catch (e) {
    washResult.error = String(e.message || e);
  }
  record('item5_hover_wash_normal', washResult);

  // ── ITEM 9 — timer/presence at t=0 ──
  const t0 = await page.evaluate(() => {
    const presence = document.querySelector('[data-document-spine] p.mt-2');
    const timer = document.querySelector('[data-full-spine-timer] p.font-mono');
    return {
      presenceText: presence ? presence.textContent?.trim() : null,
      timerText: timer ? timer.textContent?.trim() : null,
      timerPresent: Boolean(document.querySelector('[data-full-spine-timer]')),
    };
  });
  record('item9_timer_t0', t0);
  console.log('waiting 65s for the t=65s timer sample…');
  await page.waitForTimeout(65_000);
  const t65 = await page.evaluate(() => {
    const presence = document.querySelector('[data-document-spine] p.mt-2');
    const timer = document.querySelector('[data-full-spine-timer] p.font-mono');
    return {
      presenceText: presence ? presence.textContent?.trim() : null,
      timerText: timer ? timer.textContent?.trim() : null,
      timerPresent: Boolean(document.querySelector('[data-full-spine-timer]')),
    };
  });
  record('item9_timer_t65', t65);

  await context.close();
}

// ════════════════════════════════════════════════════════════════
// PHASE A2 — 1440×900, reduced motion: item 8 (reduced) + item 5 (reduced)
// ════════════════════════════════════════════════════════════════
async function phaseAReduced(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await installClsObserver(page);
  await hideDevOverlays(page);
  page.setDefaultTimeout(20_000);

  await signIn(page);
  await gotoDoc(page, RICH_ID);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const maxY = scrollHeight - 900;
  for (let y = 0; y <= maxY + 40; y += 40) {
    const clampedY = Math.min(y, maxY);
    await page.evaluate((yy) => window.scrollTo(0, yy), clampedY);
    await page.waitForTimeout(50);
  }
  const clsReduced = await page.evaluate(() => window.__clsEntries || []);
  const clsReducedTotal = clsReduced.filter((e) => !e.hadRecentInput).reduce((s, e) => s + e.value, 0);
  const clsReducedTop3 = [...clsReduced]
    .filter((e) => !e.hadRecentInput)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);
  record('item8_cls_reduced', { total: clsReducedTotal, top3: clsReducedTop3, entryCount: clsReduced.length });

  // Hover wash under reduced motion — should be a still tint, no sweep.
  const washReduced = {};
  try {
    await page.evaluate(() => window.scrollTo(0, 0));
    const washRow = page.locator('.has-wash').first();
    if (await washRow.count()) {
      await washRow.scrollIntoViewIfNeeded();
      const box = await washRow.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(50);
      washReduced.immediateStyle = await page.evaluate(() => {
        const el = document.querySelector('.has-wash .row-wash');
        const cs = el ? getComputedStyle(el) : null;
        return cs ? { clipPath: cs.clipPath, bg: cs.backgroundColor, transition: cs.transition } : null;
      });
    } else {
      washReduced.note = 'No .has-wash row found — could not exercise reduced-motion hover wash.';
    }
  } catch (e) {
    washReduced.error = String(e.message || e);
  }
  record('item5_hover_wash_reduced', washReduced);

  await context.close();
}

// ════════════════════════════════════════════════════════════════
// PHASE B — 1280×900: item 6, margin sheet
// ════════════════════════════════════════════════════════════════
async function phaseB(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await hideDevOverlays(page);
  page.setDefaultTimeout(20_000);

  await signIn(page);
  await gotoDoc(page, RICH_ID);
  await page.waitForTimeout(300);

  const marginResult = {};
  try {
    const firstHeadBefore = await page.evaluate(() => {
      const h = document.querySelector('[data-region-head]');
      return h ? h.getBoundingClientRect().top : null;
    });
    const trigger = page.locator('[data-margin-trigger]');
    const triggerVisible = await trigger.isVisible().catch(() => false);
    marginResult.triggerVisible = triggerVisible;
    if (triggerVisible) {
      await trigger.click();
      await page.waitForTimeout(300);
      const panel = page.locator('[data-margin-panel]');
      const rect = await panel.boundingBox();
      const mode = await panel.getAttribute('data-margin-mode');
      await shot(page, '08-margin-sheet-1280');
      const firstHeadAfter = await page.evaluate(() => {
        const h = document.querySelector('[data-region-head]');
        return h ? h.getBoundingClientRect().top : null;
      });
      const preEscFocused = await page.evaluate(() => document.activeElement?.tagName);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
      const panelHiddenAfterEsc = await page.evaluate(() => {
        const p = document.querySelector('[data-margin-panel]');
        return p ? p.getAttribute('aria-hidden') === 'true' || getComputedStyle(p).transform.includes('translateX') : true;
      });
      const focusAfterEsc = await page.evaluate(() => document.activeElement?.getAttribute?.('data-margin-trigger') !== null && document.activeElement?.hasAttribute?.('data-margin-trigger'));
      Object.assign(marginResult, {
        rect,
        mode,
        firstHeadBefore,
        firstHeadAfter,
        reflowed: firstHeadBefore !== null && firstHeadAfter !== null && Math.abs(firstHeadBefore - firstHeadAfter) > 1,
        panelHiddenAfterEsc,
        preEscFocused,
        focusReturnedToTrigger: focusAfterEsc,
      });
    } else {
      marginResult.note = '[data-margin-trigger] not visible at 1280×900 — could not exercise the margin sheet.';
    }
  } catch (e) {
    marginResult.error = String(e.message || e);
  }
  record('item6_margin_1280', marginResult);

  await context.close();
}

// ════════════════════════════════════════════════════════════════
// PHASE C — 390×844: item 7, mobile Sections sheet
// ════════════════════════════════════════════════════════════════
async function phaseC(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await hideDevOverlays(page);
  page.setDefaultTimeout(20_000);

  await signIn(page);
  await gotoDoc(page, RICH_ID);
  await page.waitForSelector('[data-testid="mobile-bar"]', { timeout: 15_000 });
  await page.waitForTimeout(300);

  const mobileResult = {};
  try {
    const barRectBefore = await page.locator('[data-testid="mobile-bar"]').boundingBox();
    // Scoped to .document-route-shell, not :root (globals.css) — read off
    // that ancestor, not documentElement.
    const bottomInset = await page.evaluate(() => {
      const shell = document.querySelector('.document-route-shell') ?? document.documentElement;
      return getComputedStyle(shell).getPropertyValue('--doc-shell-bottom-inset').trim();
    });
    // Open the Sections sheet — the mobile bar's "Open sections" button.
    const sectionsBtn = page.locator('[data-testid="mobile-bar"] button[aria-label^="Open sections"]');
    const hasSectionsBtn = (await sectionsBtn.count()) > 0;
    if (hasSectionsBtn) {
      const bodyOverflowBefore = await page.evaluate(() => getComputedStyle(document.body).overflow);
      await sectionsBtn.click();
      await page.waitForTimeout(350);
      const sheet = page.locator('[data-mobile-sheet-kind="spine"]');
      const sheetVisible = await sheet.isVisible().catch(() => false);
      let rect = null;
      let rowCount = null;
      let bodyOverflowDuring = null;
      if (sheetVisible) {
        rect = await sheet.boundingBox();
        rowCount = await page.evaluate(() => document.querySelectorAll('[data-mobile-sheet-kind="spine"] li').length);
        bodyOverflowDuring = await page.evaluate(() => getComputedStyle(document.body).overflow);
      }
      await shot(page, '09-mobile-sections-sheet');
      Object.assign(mobileResult, {
        hasSectionsBtn,
        sheetVisible,
        rect,
        rowCount,
        bodyOverflowBefore,
        bodyOverflowDuring,
        scrollLocked: bodyOverflowDuring === 'hidden',
      });
      // Close it — Escape (the Sheet component's own key handler), not the
      // scrim click: the scrim is full-viewport but the panel (bottom 80%)
      // stacks visually over most of it, so a default center-point click on
      // the scrim locator lands on the panel instead and is intercepted.
      try {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        const sheetGone = !(await sheet.isVisible().catch(() => false));
        const bodyOverflowAfter = await page.evaluate(() => getComputedStyle(document.body).overflow);
        Object.assign(mobileResult, { sheetGone, bodyOverflowAfter });
      } catch (e) {
        mobileResult.closeError = String(e.message || e);
      }
    } else {
      mobileResult.hasSectionsBtn = false;
      mobileResult.note = 'Open-sections button not found on the mobile bar.';
    }
    const barRectAfter = await page.locator('[data-testid="mobile-bar"]').boundingBox();
    Object.assign(mobileResult, { barRectBefore, barRectAfter, bottomInset });
  } catch (e) {
    mobileResult.error = String(e.message || e);
  }
  record('item7_mobile_390', mobileResult);

  await context.close();
}

// ════════════════════════════════════════════════════════════════
// CLI: `node interactive-probe.mjs [a|areduced|b|c ...]` runs only the named
// phases (space-separated), merging into any existing results.json rather
// than overwriting it. With no args, runs all four phases fresh.
async function main() {
  const requested = process.argv.slice(2);
  const runAll = requested.length === 0;
  const want = (name) => runAll || requested.includes(name);

  if (!runAll) {
    try {
      Object.assign(results, JSON.parse(readFileSync(path.join(OUT, 'results.json'), 'utf8')));
    } catch {
      /* no prior results.json — fine */
    }
  }

  const browser = await chromium.launch();
  try {
    if (want('a')) await phaseA(browser);
    if (want('a3')) await phaseA3(browser);
    if (want('areduced')) await phaseAReduced(browser);
    if (want('b')) await phaseB(browser);
    if (want('c')) await phaseC(browser);
  } finally {
    await browser.close();
  }

  writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  console.log('\nWrote', path.join(OUT, 'results.json'));
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error('FATAL', e);
  writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  process.exit(1);
});
