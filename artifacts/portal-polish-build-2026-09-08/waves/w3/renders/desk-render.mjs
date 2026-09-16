import { chromium } from '@playwright/test';
import fs from 'node:fs';

const OUT = '/Users/kody/Code/patina-merged/artifacts/portal-polish-build-2026-09-08/waves/w3/renders';
const BASE = 'http://localhost:3000';
const EMAIL = 'designer@patina.dev';
const PASSWORD = 'password123';
const WELCOME_SHOWN_KEY = 'help-system.welcome-shown.first-project-walkthrough';

const VIEWPORTS = [
  { name: '1440x900', width: 1440, height: 900, dsf: 1 },
  { name: '1280x800', width: 1280, height: 800, dsf: 1 },
  { name: '390x844@2x', width: 390, height: 844, dsf: 2, mobile: true },
];

const report = { consoleErrors: [], pageErrors: [], shots: [], overflow: [], facts: {} };

function watch(page, tag) {
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // Only the signed-in Desk is under test; the pre-auth sign-in page's own
    // "Not authenticated" probe is a separate, pre-existing surface.
    if (!page.url().includes('/desk')) return;
    report.consoleErrors.push(`[${tag}] ${m.text()}`);
  });
  page.on('pageerror', (e) => {
    if (!page.url().includes('/desk')) return;
    report.pageErrors.push(`[${tag}] ${e.message}`);
  });
}

async function signIn(page) {
  await page.addInitScript((k) => { try { localStorage.setItem(k, '1'); } catch {} }, WELCOME_SHOWN_KEY);
  await page.goto(`${BASE}/auth/signin?callbackUrl=%2Fdesk`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (!page.url().includes('/auth/signin')) return;
  const disclosure = page.getByRole('button', { name: /sign in with email|use email and password instead/i });
  await disclosure.first().waitFor({ state: 'visible', timeout: 20000 });
  await disclosure.first().click();
  await page.getByLabel(/email/i).first().fill(EMAIL);
  await page.getByLabel(/password/i).first().fill(PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(/\/(desk|doc|people|library|rooms|room|drafting|compose|preferences|unauthorized)/, { timeout: 90000 });
}

async function overflowCheck(page, label) {
  const m = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  report.overflow.push({ label, ...m, ok: m.scrollWidth <= m.clientWidth });
  return m;
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
    // The desk walkthrough offer opens a dialog that aria-hides the shell; it
    // is pre-existing chrome, not what this wave renders.
    const skip = page.getByRole('button', { name: /skip for now/i });
    if (await skip.count()) {
      await skip.first().click();
      await page.waitForTimeout(1200);
      report.facts.walkthroughDismissed = true;
    }
    await overflowCheck(page, `${vp.name} /desk`);
    const f = `${OUT}/desk-${vp.name}.png`;
    await page.screenshot({ path: f, fullPage: true });
    report.shots.push(f);

    if (vp.name === '1440x900') {
      report.facts.heading = await page.locator('#every-job').first().innerText().catch(() => null);
      report.facts.overdueLine = await page.locator('[data-testid="desk-roster"] p').first().innerText().catch(() => null);
      report.facts.dayLinePresent = await page.locator('[data-desk-day-line]').count();
      report.facts.dayLines = await page.locator('[data-day-line]').allInnerTexts().catch(() => []);
      report.facts.rosterRows = await page.locator('[data-roster-line]').count();
      report.facts.stagePlates = await page.locator('[data-stage-tab]').allInnerTexts().catch(() => []);
      report.facts.boardsRail = await page.locator('text=/^Boards$/').count();
      report.facts.recentBoardsStrip = await page.locator('text=/Recent boards/').count();
      report.facts.wideGrid = await page.evaluate(() => {
        for (const el of document.querySelectorAll('div')) {
          const g = getComputedStyle(el).gridTemplateColumns;
          if (g && g.endsWith('260px')) return g;
        }
        return null;
      });
      report.facts.hasShadow = await page.evaluate(() => {
        for (const el of document.querySelectorAll('*')) {
          const s = getComputedStyle(el).boxShadow;
          if (s && s !== 'none') return el.tagName + '.' + el.className;
        }
        return null;
      });

      // facet 1
      const needs = page.locator('[data-action-key="roster-facet-needs-me"]');
      report.facts.facetNeedsMePresent = await needs.count();
      if (await needs.count()) {
        await needs.first().click();
        await page.waitForTimeout(1500);
        report.facts.afterNeedsMe = {
          heading: await page.locator('#every-job').first().innerText(),
          pressed: await needs.first().getAttribute('aria-pressed'),
          rows: await page.locator('[data-roster-line]').count(),
          emptySentence: await page.locator('[data-roster-facet-empty]').innerText().catch(() => null),
        };
        await overflowCheck(page, '1440x900 /desk needs-me');
        await page.screenshot({ path: `${OUT}/desk-1440x900-facet-needs-me.png`, fullPage: true });
        report.shots.push(`${OUT}/desk-1440x900-facet-needs-me.png`);
        await needs.first().click();
        await page.waitForTimeout(1500);
      }
      // facet 2
      const byPerson = page.locator('[data-action-key="roster-facet-by-person"]');
      report.facts.facetByPersonPresent = await byPerson.count();
      if (await byPerson.count()) {
        await byPerson.first().click();
        await page.waitForTimeout(1500);
        report.facts.afterByPerson = {
          heading: await page.locator('#every-job').first().innerText(),
          pressed: await byPerson.first().getAttribute('aria-pressed'),
          personPlates: await page.locator('[data-person-plate]').allInnerTexts(),
          rows: await page.locator('[data-roster-line]').count(),
        };
        await overflowCheck(page, '1440x900 /desk by-person');
        await page.screenshot({ path: `${OUT}/desk-1440x900-facet-by-person.png`, fullPage: true });
        report.shots.push(`${OUT}/desk-1440x900-facet-by-person.png`);
      }
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  fs.writeFileSync(`${OUT}/render-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
