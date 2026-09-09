// Wave 3c probe — two questions the render script cannot answer honestly on
// its own, both borrowed from Wave 3b's probe.mjs:
//
//  1. console errors measured AFTER the session exists, so the sign-in
//     navigation's own pre-auth `_getUser` failure is not charged to /desk
//     (the render script's filter keys on URL, and those two lines land on the
//     /desk URL during the sign-in redirect).
//  2. the NEGATIVE control for D8 item 3: an UNSELECTED `.da-score-hover` must
//     still raise to clay on hover. The specificity bump must beat hover only
//     for the selected control, not switch the hover raise off everywhere.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const OUT =
  '/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-int3c/artifacts/portal-polish-build-2026-09-08/waves/w3c/renders';
const BASE = 'http://localhost:3000';
const EMAIL = 'designer@patina.dev';
const PASSWORD = 'password123';
const WELCOME_SHOWN_KEY = 'help-system.welcome-shown.first-project-walkthrough';

const CHARCOAL = 'rgb(44, 41, 38)';
const CLAY = 'rgb(196, 165, 123)';
const AGED_OAK = 'rgb(139, 115, 85)';

const out = { cleanConsole: {}, hoverControl: {} };

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
  // ── 1 · console errors on signed-in surfaces, measured after the session ──
  for (const label of ['desk', 'doc', 'orders']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await signIn(page);
    await page.goto(`${BASE}/desk`, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(2000);
    await dismiss(page);

    let target = '/desk';
    if (label === 'doc') {
      target =
        (await page.evaluate(() => {
          const a = document.querySelector('[data-roster-line] a[href^="/doc/"]');
          return a ? a.getAttribute('href') : null;
        })) ?? '/desk';
    }

    const errs = [];
    const pErrs = [];
    page.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 240)));
    page.on('pageerror', (e) => pErrs.push(e.message.slice(0, 240)));

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
    }

    out.cleanConsole[label] = { url: page.url(), consoleErrors: errs, pageErrors: pErrs };
    await ctx.close();
  }

  // ── 2 · the negative control on the Orders ledger ────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await signIn(page);
    await page.goto(`${BASE}/desk`, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(2000);
    await dismiss(page);
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

    const unselected = page.locator('.da-score-hover:not(.da-score-on)');
    const n = await unselected.count();
    const sample = [];
    for (let i = 0; i < Math.min(n, 3); i++) {
      const el = unselected.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      const rest = await el.evaluate((node) => getComputedStyle(node, '::after').backgroundColor);
      await el.hover({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);
      const hover = await el.evaluate((node) => getComputedStyle(node, '::after').backgroundColor);
      sample.push({
        text: (await el.innerText().catch(() => '')).trim().slice(0, 32),
        rest,
        hover,
        restsAgedOak: rest === AGED_OAK,
        raisesToClay: hover === CLAY,
      });
    }
    out.hoverControl = {
      unselectedCount: n,
      selectedCount: await page.locator('.da-score-hover.da-score-on').count(),
      sample,
      legend: { CHARCOAL, CLAY, AGED_OAK },
    };
    await ctx.close();
  }
} finally {
  await browser.close();
  fs.writeFileSync(`${OUT}/probe-report.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}
