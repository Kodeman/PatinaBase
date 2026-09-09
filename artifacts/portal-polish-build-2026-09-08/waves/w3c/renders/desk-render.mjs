// Wave 3c render pass. Reuses Wave 3b's script (waves/w3b/renders/desk-render.mjs)
// for sign-in, the walkthrough dismissal, the console/page-error filter and the
// overflow probe, and adds the three things this wave has to prove:
//
//   1. /desk at 1440 and at 390 (390/390 must still hold after D8's date change)
//   2. the project document page at 1440 — the roster/document date idiom is now
//      "11 September", never "Sep 11" (D8 item 2, PP-2)
//   3. the Orders ledger's selected LEDGER tab stays CHARCOAL while the pointer
//      is on it (D8 item 3 — .da-score-hover.da-score-on::after)
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const OUT =
  '/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-int3c/artifacts/portal-polish-build-2026-09-08/waves/w3c/renders';
const BASE = 'http://localhost:3000';
const EMAIL = 'designer@patina.dev';
const PASSWORD = 'password123';
const WELCOME_SHOWN_KEY = 'help-system.welcome-shown.first-project-walkthrough';

const VIEWPORTS = [
  { name: '1440x900', width: 1440, height: 900, dsf: 1 },
  { name: '390x844@2x', width: 390, height: 844, dsf: 2, mobile: true },
];

const report = { consoleErrors: [], pageErrors: [], shots: [], overflow: [], facts: {} };

function watch(page, tag) {
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (page.url().includes('/auth/signin')) return;
    report.consoleErrors.push(`[${tag}] ${page.url()} ${m.text()}`);
  });
  page.on('pageerror', (e) => {
    if (page.url().includes('/auth/signin')) return;
    report.pageErrors.push(`[${tag}] ${page.url()} ${e.message}`);
  });
}

async function signIn(page) {
  await page.addInitScript((k) => {
    try {
      localStorage.setItem(k, '1');
    } catch {}
  }, WELCOME_SHOWN_KEY);
  await page.goto(`${BASE}/auth/signin?callbackUrl=%2Fdesk`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  if (!page.url().includes('/auth/signin')) return;
  const disclosure = page.getByRole('button', {
    name: /sign in with email|use email and password instead/i,
  });
  await disclosure.first().waitFor({ state: 'visible', timeout: 20000 });
  await disclosure.first().click();
  await page.getByLabel(/email/i).first().fill(EMAIL);
  await page.getByLabel(/password/i).first().fill(PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(
    /\/(desk|doc|people|library|rooms|room|drafting|compose|preferences|unauthorized)/,
    { timeout: 90000 },
  );
}

async function overflowCheck(page, label) {
  const m = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  report.overflow.push({ label, ...m, ok: m.scrollWidth <= m.clientWidth });
  return m;
}

async function dismissWalkthrough(page) {
  const skip = page.getByRole('button', { name: /skip for now/i });
  if (await skip.count()) {
    await skip.first().click();
    await page.waitForTimeout(1000);
    return true;
  }
  return false;
}

/** Every "Mon DD" short-month literal still printed on this surface. D8's PP-2
 *  claim is that the roster row and the document page carry none. */
async function shortMonthSweep(page, surface) {
  const hits = await page.evaluate(() => {
    const SHORT = /\b(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\b\.?\s+\d{1,2}\b/;
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const t = (n.textContent || '').trim();
      if (t && SHORT.test(t)) out.push(t.slice(0, 90));
      if (out.length >= 25) break;
    }
    return out;
  });
  const dayMonth = await page.evaluate(() => {
    const DM = /\b\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\b/;
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const t = (n.textContent || '').trim();
      if (t && DM.test(t)) out.push(t.slice(0, 90));
      if (out.length >= 15) break;
    }
    return out;
  });
  report.facts[`dates_${surface}`] = { shortMonthHits: hits, dayMonthHits: dayMonth };
}

/** D8 item 3 — the selected tab must NOT go clay under the pointer. */
async function selectedBeatsHover(page, surface) {
  const read = async (label) =>
    page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('.da-score-hover.da-score-on')) {
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) continue;
        const cs = getComputedStyle(el, '::after');
        out.push({
          text: (el.textContent || '').trim().slice(0, 40),
          color: cs.backgroundColor,
          height: cs.height,
        });
        if (out.length >= 6) break;
      }
      return out;
    });

  const rest = await read('rest');
  const sel = page.locator('.da-score-hover.da-score-on');
  let hovered = [];
  if (await sel.count()) {
    await sel.first().hover({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    hovered = await read('hover');
  }
  report.facts[`selectedBeatsHover_${surface}`] = {
    count: await sel.count(),
    rest,
    hovered,
    // charcoal = rgb(44, 41, 38); clay = rgb(196, 165, 123)
    charcoalWhileHovered: hovered.length
      ? hovered[0].color === 'rgb(44, 41, 38)'
      : null,
  };
}

const browser = await chromium.launch();
try {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.dsf,
      isMobile: !!vp.mobile,
      hasTouch: !!vp.mobile,
    });
    const page = await ctx.newPage();
    watch(page, vp.name);
    await signIn(page);
    await page.goto(`${BASE}/desk`, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForSelector('[data-testid="desk-roster"]', { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2500);
    if (await dismissWalkthrough(page)) report.facts.walkthroughDismissed = true;

    await overflowCheck(page, `${vp.name} /desk`);
    const f = `${OUT}/desk-${vp.name}.png`;
    await page.screenshot({ path: f, fullPage: true });
    report.shots.push(f);
    await shortMonthSweep(page, `desk-${vp.name}`);

    if (vp.name === '390x844@2x') {
      report.facts.widestElement = await page.evaluate(() => {
        let worst = null;
        for (const el of document.querySelectorAll('*')) {
          const r = el.getBoundingClientRect();
          if (!worst || r.right > worst.right) {
            worst = {
              right: Math.round(r.right),
              tag: el.tagName,
              cls: String(el.className).slice(0, 80),
            };
          }
        }
        return worst;
      });
      await page.screenshot({ path: `${OUT}/desk-390x844@2x-viewport.png`, fullPage: false });
    }

    if (vp.name === '1440x900') {
      report.facts.greeting = await page
        .locator('[data-desk-greeting], header')
        .first()
        .innerText()
        .catch(() => null);
      report.facts.dayLines = await page
        .locator('[data-desk-day-line]')
        .allInnerTexts()
        .catch(() => []);
      report.facts.rosterLines = await page
        .locator('[data-roster-line]')
        .allInnerTexts()
        .catch(() => []);
      report.facts.hasShadow = await page.evaluate(() => {
        const hits = [];
        for (const el of document.querySelectorAll('*')) {
          const s = getComputedStyle(el).boxShadow;
          if (s && s !== 'none')
            hits.push(el.tagName + '.' + String(el.className).slice(0, 60) + ' → ' + s);
          if (hits.length >= 8) break;
        }
        return hits;
      });

      // ── the project document page ───────────────────────────────────────
      const docHref = await page.evaluate(() => {
        const a = document.querySelector('[data-roster-line] a[href^="/doc/"]');
        return a ? a.getAttribute('href') : null;
      });
      report.facts.docHref = docHref;
      if (docHref) {
        await page.goto(`${BASE}${docHref}`, { waitUntil: 'networkidle', timeout: 90000 });
        await page.waitForTimeout(3000);
        await dismissWalkthrough(page);
        await overflowCheck(page, `${vp.name} ${docHref}`);
        const g = `${OUT}/doc-1440x900.png`;
        await page.screenshot({ path: g, fullPage: true });
        report.shots.push(g);
        await shortMonthSweep(page, 'doc-1440x900');
        await selectedBeatsHover(page, 'doc');
      }

      // ── the Orders ledger ───────────────────────────────────────────────
      await page.goto(`${BASE}/desk`, { waitUntil: 'networkidle', timeout: 90000 });
      await page.waitForTimeout(2000);
      await dismissWalkthrough(page);
      const ledgers = page.getByRole('button', { name: /^Ledgers$/i });
      if (await ledgers.count()) {
        await ledgers.first().click();
        await page.waitForTimeout(800);
      }
      const ordersDoor = page.getByRole('button', { name: /^Orders$/i });
      report.facts.ordersDoorFound = await ordersDoor.count();
      if (await ordersDoor.count()) {
        await ordersDoor.first().click();
        await page.waitForTimeout(3500);
        await overflowCheck(page, `${vp.name} orders ledger`);
        // hover the selected LEDGER tab and read its rule while hovered
        await selectedBeatsHover(page, 'orders');
        const h = `${OUT}/orders-ledger-1440x900.png`;
        await page.screenshot({ path: h, fullPage: false });
        report.shots.push(h);
        await shortMonthSweep(page, 'orders-1440x900');
      }
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  fs.writeFileSync(`${OUT}/render-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
