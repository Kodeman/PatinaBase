// Wave-1 integration walk — designer portal at 1440x900.
// Run: node walk.mjs  (from this directory; uses the repo-root Playwright install)
import { chromium } from '/Users/kody/Code/patina-merged/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.dirname(new URL(import.meta.url).pathname);
const BASE = 'http://localhost:3000';
const EMAIL = 'designer@patina.dev';
const PASSWORD = 'password123';

const log = [];
const labels = {};
const note = (k, v) => { log.push(`${k}: ${v}`); console.log(`${k}: ${v}`); };
const shot = async (page, name) => {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  note(name, 'captured');
};
const text = async (page, sel) => {
  const el = page.locator(sel).first();
  if (!(await el.count())) return null;
  return (await el.innerText()).trim();
};
const settle = (page, ms = 1500) => page.waitForTimeout(ms);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'light' });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);

async function step(name, fn) {
  try { await fn(); } catch (e) { note(name, `FAILED — ${String(e.message || e).split('\n')[0]}`); try { await shot(page, `${name}-FAILED`); } catch {} }
}

// login
await step('login', async () => {
  await page.goto(`${BASE}/auth/signin`, { waitUntil: 'networkidle' });
  await settle(page, 2000);
  const emailToggle = page.getByRole('button', { name: /Use email and password instead/i });
  if (await emailToggle.count()) await emailToggle.click();
  await page.locator('input[type=email]').fill(EMAIL);
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.getByRole('button', { name: /^Sign in$/i }).click();
  await page.waitForURL(/\/(desk|portal)/, { timeout: 30000 });
  await page.waitForLoadState('networkidle');
  await settle(page, 3000);
  note('login', `landed on ${page.url()}`);
});

// 01 — panel answers on the Desk (⌘K "Help…")
await step('01-desk-help-panel', async () => {
  await page.goto(`${BASE}/desk`, { waitUntil: 'networkidle' });
  await settle(page, 2500);
  await page.keyboard.press('Meta+k');
  await settle(page, 1200);
  await page.keyboard.type('Help');
  await settle(page, 1000);
  const row = page.locator('[cmdk-item], [role=option]').filter({ hasText: /^Help…/ }).first();
  await row.click();
  await settle(page, 2500);
  labels.deskHelpPanel = await text(page, '[role=dialog], [role=complementary], aside');
  labels.deskHelpPanelHasBlurb = /Every live job/.test(labels.deskHelpPanel || '');
  labels.deskHelpPanelHasKeys = /KEYS/.test(labels.deskHelpPanel || '');
  await shot(page, '01-desk-help-panel');
  await page.keyboard.press('Escape');
  await settle(page, 800);
});

// 02 — panel answers inside a Document (⌘K "Help…")
await step('02-doc-help-panel', async () => {
  await page.goto(`${BASE}/desk`, { waitUntil: 'networkidle' });
  await settle(page, 2500);
  const first = page.locator('a[href^="/doc/"]').first();
  const href = await first.getAttribute('href');
  note('02-doc-help-panel', `opening ${href}`);
  await first.click();
  await page.waitForURL(/\/doc\//, { timeout: 20000 });
  await page.waitForLoadState('networkidle');
  await settle(page, 3000);
  await page.keyboard.press('Meta+k');
  await settle(page, 1200);
  await page.keyboard.type('Help');
  await settle(page, 1000);
  const row = page.locator('[cmdk-item], [role=option]').filter({ hasText: /^Help…/ }).first();
  await row.click();
  await settle(page, 2500);
  labels.docHelpPanel = await text(page, '[role=dialog], [role=complementary], aside');
  labels.docHelpPanelHasBlurb = /One client, one paper/.test(labels.docHelpPanel || '');
  labels.docHelpPanelHasKeys = /KEYS/.test(labels.docHelpPanel || '');
  await shot(page, '02-doc-help-panel');
  await page.keyboard.press('Escape');
  await settle(page, 800);
});

// 03 — the ? sheet
await step('03-keys-sheet', async () => {
  await page.goto(`${BASE}/desk`, { waitUntil: 'networkidle' });
  await settle(page, 2500);
  await page.keyboard.press('?');
  await settle(page, 1500);
  labels.keysSheet = await text(page, '[role=dialog]');
  await shot(page, '03-keys-sheet');
  await page.keyboard.press('Escape');
  await settle(page, 800);
});

// 04 — ⌘K "keys" and "words"
await step('04-command-bar-keys', async () => {
  await page.goto(`${BASE}/desk`, { waitUntil: 'networkidle' });
  await settle(page, 2500);
  await page.keyboard.press('Meta+k');
  await settle(page, 1200);
  await page.keyboard.type('keys');
  await settle(page, 1000);
  labels.commandBarKeys = await text(page, '[cmdk-root], [role=dialog]:has(input)');
  await shot(page, '04a-command-bar-keys');
  await page.keyboard.press('Escape');
  await settle(page, 500);
});
await step('04b-command-bar-words', async () => {
  await page.keyboard.press('Meta+k');
  await settle(page, 1200);
  await page.keyboard.type('words');
  await settle(page, 1000);
  labels.commandBarWords = await text(page, '[cmdk-root], [role=dialog]:has(input)');
  await shot(page, '04b-command-bar-words');
  await page.keyboard.press('Escape');
  await settle(page, 500);
});

// 05 — walkthrough replay step 6 → CTA opens the lead sheet
await step('05-walkthrough-step6', async () => {
  await page.goto(`${BASE}/desk?tour=desk-walkthrough`, { waitUntil: 'networkidle' });
  await settle(page, 4000);
  for (let i = 1; i <= 6; i++) {
    const dlg = page.locator('[role=dialog]').filter({ hasText: new RegExp(`Step ${i} of 6`, 'i') }).first();
    await dlg.waitFor({ state: 'visible', timeout: 8000 });
    await settle(page, 1000);
    if (i === 6) {
      labels.step6Text = await dlg.innerText();
      await shot(page, '05a-walkthrough-step6');
      const cta = dlg.getByRole('button', { name: /Capture a lead|To work/i }).first();
      await cta.click();
      await settle(page, 2500);
    } else {
      const next = dlg.getByRole('button', { name: /^Next$/i }).first();
      await next.click();
      await settle(page, 1200);
    }
  }
  labels.afterStep6LeadSheet = await text(page, '[role=dialog]');
  await shot(page, '05b-after-step6-lead-sheet');
  await page.keyboard.press('Escape');
  await settle(page, 800);
});

// 06 — Help Center Featured fallback
await step('06-help-center-featured', async () => {
  await page.goto(`${BASE}/help`, { waitUntil: 'networkidle' });
  await settle(page, 3000);
  labels.helpCenterHeadings = await page.locator('h1, h2').evaluateAll(els => els.map(e => e.innerText.trim()).filter(Boolean));
  labels.helpCenterHasFallbackLine = /Featured guides arrive as they're written/.test(await page.locator('body').innerText());
  await shot(page, '06-help-center-featured');
});

// 07 — account → STUDIO checklist with six rows
await step('07-studio-checklist', async () => {
  await page.goto(`${BASE}/desk`, { waitUntil: 'networkidle' });
  await settle(page, 2500);
  await page.getByRole('button', { name: /Account and settings/i }).first().click();
  await settle(page, 2000);
  const sheet = page.locator('[role=dialog]').last();
  const studioTab = sheet.getByRole('button', { name: /^Studio$/ }).first();
  if (await studioTab.count()) {
    await studioTab.click();
    await settle(page, 2000);
  }
  labels.studioChecklist = await sheet.innerText();
  const rows = await sheet.locator('[data-checklist-row], li').count();
  labels.studioChecklistRowCount = rows;
  await shot(page, '07-studio-checklist');
  await page.keyboard.press('Escape');
  await settle(page, 800);
});

fs.writeFileSync(path.join(OUT, 'labels.json'), JSON.stringify(labels, null, 2));
fs.writeFileSync(path.join(OUT, 'walk.log'), log.join('\n') + '\n');
await browser.close();
