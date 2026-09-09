// Wave 3b probe. Two questions Wave 3's render script cannot answer on its own:
//  1. the 390 overflow — is it gone, and if not, what is the offender now?
//  2. console errors on a signed-in surface, measured after the session exists
//     (the sign-in navigation's own pre-auth _getUser failure is not the surface's).
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const OUT =
  '/Users/kody/Code/patina-merged/artifacts/portal-polish-build-2026-09-08/waves/w3b/renders';
const BASE = 'http://localhost:3000';
const EMAIL = 'designer@patina.dev';
const PASSWORD = 'password123';
const WELCOME_SHOWN_KEY = 'help-system.welcome-shown.first-project-walkthrough';

const out = { overflow390: {}, cleanConsole: {}, docFacts: {}, ordersFacts: {} };

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
  await page
    .getByRole('button', { name: /sign in with email|use email and password instead/i })
    .first()
    .click();
  await page.getByLabel(/email/i).first().fill(EMAIL);
  await page.getByLabel(/password/i).first().fill(PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(/\/(desk|doc|people|library|rooms|room|drafting|compose|preferences)/, {
    timeout: 90000,
  });
}

async function dismiss(page) {
  const skip = page.getByRole('button', { name: /skip for now/i });
  if (await skip.count()) {
    await skip.first().click();
    await page.waitForTimeout(900);
  }
}

const browser = await chromium.launch();
try {
  // ── 1 · the 390 overflow, isolated by DOM surgery ────────────────────────
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    await signIn(page);
    await page.goto(`${BASE}/desk`, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForSelector('[data-testid="desk-roster"]', { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await dismiss(page);

    const measure = () =>
      page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));

    out.overflow390.asShipped = await measure();

    // every element whose right edge passes the viewport, innermost first
    out.overflow390.offenders = await page.evaluate(() => {
      const hits = [];
      for (const el of document.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right > 390.5) {
          hits.push({
            tag: el.tagName,
            cls: String(el.className).slice(0, 110),
            left: Math.round(r.left),
            right: Math.round(r.right),
            width: Math.round(r.width),
            children: el.children.length,
          });
        }
      }
      return hits.slice(0, 24);
    });

    // surgery: hide the fixed bottom bar
    out.overflow390.withoutBottomNav = await page.evaluate(() => {
      const navs = [...document.querySelectorAll('nav')].filter((n) =>
        getComputedStyle(n).position === 'fixed',
      );
      navs.forEach((n) => (n.style.display = 'none'));
      const m = {
        hidden: navs.length,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      };
      navs.forEach((n) => (n.style.display = ''));
      return m;
    });

    // surgery: hide the roster (Wave 3's own control — it reached 390 this way)
    out.overflow390.withoutRoster = await page.evaluate(() => {
      const r = document.querySelector('[data-testid="desk-roster"]');
      if (!r) return null;
      r.style.display = 'none';
      const m = {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      };
      r.style.display = '';
      return m;
    });

    // surgery: hide both
    out.overflow390.withoutBoth = await page.evaluate(() => {
      const navs = [...document.querySelectorAll('nav')].filter(
        (n) => getComputedStyle(n).position === 'fixed',
      );
      const roster = document.querySelector('[data-testid="desk-roster"]');
      navs.forEach((n) => (n.style.display = 'none'));
      if (roster) roster.style.display = 'none';
      const m = {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      };
      navs.forEach((n) => (n.style.display = ''));
      if (roster) roster.style.display = '';
      return m;
    });

    // what inside the bottom bar sets its floor
    out.overflow390.bottomNavChildren = await page.evaluate(() => {
      const nav = [...document.querySelectorAll('nav')].find(
        (n) => getComputedStyle(n).position === 'fixed' && n.getBoundingClientRect().width > 390.5,
      );
      if (!nav) return null;
      const cs = getComputedStyle(nav);
      return {
        navWidth: Math.round(nav.getBoundingClientRect().width),
        position: cs.position,
        inset: `${cs.left} / ${cs.right}`,
        display: cs.display,
        minWidth: cs.minWidth,
        cls: String(nav.className).slice(0, 200),
        kids: [...nav.children].map((c) => ({
          tag: c.tagName,
          text: (c.textContent || '').trim().slice(0, 30),
          width: Math.round(c.getBoundingClientRect().width),
          cls: String(c.className).slice(0, 70),
        })),
      };
    });

    // does the roster still contribute anything past 390?
    out.overflow390.rosterMaxRight = await page.evaluate(() => {
      const r = document.querySelector('[data-testid="desk-roster"]');
      if (!r) return null;
      let worst = 0;
      let who = null;
      for (const el of r.querySelectorAll('*')) {
        const b = el.getBoundingClientRect();
        if (b.width && b.right > worst) {
          worst = b.right;
          who = el.tagName + '.' + String(el.className).slice(0, 60);
        }
      }
      return { maxRight: Math.round(worst), who };
    });

    await page.screenshot({ path: `${OUT}/desk-390x844@2x-viewport.png`, fullPage: false });
    await ctx.close();
  }

  // ── 2 · console errors on signed-in surfaces, measured after the session ──
  for (const [label, path] of [
    ['desk', '/desk'],
    ['doc', null],
    ['orders', '/desk'],
  ]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await signIn(page);
    await page.goto(`${BASE}/desk`, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(2000);
    await dismiss(page);

    let target = path;
    if (label === 'doc') {
      target = await page.evaluate(() => {
        const a = document.querySelector('[data-roster-line] a[href^="/doc/"]');
        return a ? a.getAttribute('href') : null;
      });
    }

    const errs = [];
    const pErrs = [];
    page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    page.on('pageerror', (e) => pErrs.push(e.message));

    // the session exists now — this navigation is the measured one
    await page.goto(`${BASE}${target}`, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(3500);
    await dismiss(page);

    if (label === 'orders') {
      const ledgers = page.getByRole('button', { name: /^Ledgers$/i });
      if (await ledgers.count()) {
        await ledgers.first().click();
        await page.waitForTimeout(700);
      }
      const door = page.getByRole('button', { name: /^Orders$/i });
      if (await door.count()) {
        await door.first().click();
        await page.waitForTimeout(3500);
      }
      out.ordersFacts.dialogText = await page
        .getByRole('dialog')
        .first()
        .innerText()
        .catch(() => null);
    }

    if (label === 'doc') {
      out.docFacts.url = page.url();
      out.docFacts.headings = await page
        .locator('h1, h2')
        .allInnerTexts()
        .catch(() => []);
      out.docFacts.bodyStart = (
        await page.locator('main, body').first().innerText().catch(() => '')
      ).slice(0, 700);
    }

    out.cleanConsole[label] = { url: page.url(), consoleErrors: errs, pageErrors: pErrs };
    await ctx.close();
  }
} finally {
  await browser.close();
  fs.writeFileSync(`${OUT}/probe-report.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}
