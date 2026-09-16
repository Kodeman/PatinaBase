// Wave 3b render pass. Reuses Wave 3's script (waves/w3/renders/desk-render.mjs)
// verbatim for sign-in, the walkthrough dismissal, the console/page-error filter
// and the overflow probe; adds the two surfaces this wave owes — a project
// document page and the Orders ledger at 1440 — and re-measures the 390 overflow.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const OUT =
  '/Users/kody/Code/patina-merged/artifacts/portal-polish-build-2026-09-08/waves/w3b/renders';
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
    // Only signed-in app surfaces are under test; the pre-auth sign-in page's own
    // "Not authenticated" probe is a separate, pre-existing surface.
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

// The rest rule the wave has to prove: .da-score-hover::after must be visible at
// rest (aged oak, no scaleX(0)) and raise to clay on hover.
async function scoreHoverProbe(page, surface) {
  const rows = await page.evaluate(() => {
    const seen = [];
    for (const el of document.querySelectorAll('.da-score-hover')) {
      const cs = getComputedStyle(el, '::after');
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      seen.push({
        text: (el.textContent || '').trim().slice(0, 48),
        tag: el.tagName,
        restColor: cs.backgroundColor,
        restHeight: cs.height,
        transform: cs.transform,
        content: cs.content,
      });
      if (seen.length >= 12) break;
    }
    return seen;
  });
  const hovered = [];
  const els = page.locator('.da-score-hover');
  const n = Math.min(await els.count(), 2);
  for (let i = 0; i < n; i++) {
    const el = els.nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;
    await el.hover({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    hovered.push(
      await el.evaluate((node) => {
        const cs = getComputedStyle(node, '::after');
        return {
          text: (node.textContent || '').trim().slice(0, 48),
          hoverColor: cs.backgroundColor,
          hoverHeight: cs.height,
        };
      }),
    );
  }
  report.facts[`scoreHover_${surface}`] = { total: await els.count(), rest: rows, hovered };
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
    // Reload /desk after the session exists, so the pre-auth fetch errors of the
    // sign-in navigation cannot be attributed to the Desk.
    await page.goto(`${BASE}/desk`, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForSelector('[data-testid="desk-roster"]', { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2500);
    if (await dismissWalkthrough(page)) report.facts.walkthroughDismissed = true;

    await overflowCheck(page, `${vp.name} /desk`);
    const f = `${OUT}/desk-${vp.name}.png`;
    await page.screenshot({ path: f, fullPage: true });
    report.shots.push(f);

    if (vp.name === '390x844@2x') {
      // The measurement this wave exists to move: 437/390 before D7.
      report.facts.mobileRosterNames = await page.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll('[data-roster-name]')) {
          const r = el.getBoundingClientRect();
          out.push({
            text: (el.textContent || '').trim().slice(0, 48),
            right: Math.round(r.right),
            width: Math.round(r.width),
            classes: el.className,
          });
          if (out.length >= 6) break;
        }
        return out;
      });
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
    }

    if (vp.name === '1440x900') {
      report.facts.heading = await page
        .locator('#every-job')
        .first()
        .innerText()
        .catch(() => null);
      report.facts.greeting = await page
        .locator('[data-desk-greeting], header')
        .first()
        .innerText()
        .catch(() => null);
      report.facts.dayLines = await page
        .locator('[data-desk-day-line]')
        .allInnerTexts()
        .catch(() => []);
      report.facts.rosterRows = await page.locator('[data-roster-line]').count();
      report.facts.hasShadow = await page.evaluate(() => {
        const hits = [];
        for (const el of document.querySelectorAll('*')) {
          const s = getComputedStyle(el).boxShadow;
          if (s && s !== 'none') hits.push(el.tagName + '.' + String(el.className).slice(0, 60) + ' → ' + s);
          if (hits.length >= 6) break;
        }
        return hits;
      });
      await scoreHoverProbe(page, 'desk');

      // ── the project document page ────────────────────────────────────────
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
        report.facts.docTitle = await page.title();
        report.facts.docH1 = await page
          .locator('h1')
          .first()
          .innerText()
          .catch(() => null);
        await scoreHoverProbe(page, 'doc');
      }

      // ── the Orders ledger ────────────────────────────────────────────────
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
        const h = `${OUT}/orders-ledger-1440x900.png`;
        await page.screenshot({ path: h, fullPage: false });
        report.shots.push(h);
        report.facts.ordersHeading = await page
          .getByRole('dialog')
          .first()
          .locator('h2, h1')
          .first()
          .innerText()
          .catch(() => null);
        await scoreHoverProbe(page, 'orders');
      }
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  fs.writeFileSync(`${OUT}/render-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
