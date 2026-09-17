// Briefing-pack screenshot run — designer portal at 1440x900 (Playwright fallback;
// the Claude-in-Chrome window was stuck at a 1028px viewport, below the 1180px
// Studio Drawer breakpoint). Run from apps/designer-portal so `playwright` resolves:
//   cd apps/designer-portal && node <this file>
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

// 01 — sign in page
await step('01-signin', async () => {
  await page.goto(`${BASE}/auth/signin`, { waitUntil: 'networkidle' });
  await settle(page, 2500);
  await shot(page, '01-signin');
});

// login
await step('login', async () => {
  await page.getByRole('button', { name: /Use email and password instead/i }).click();
  await page.locator('input[type=email]').fill(EMAIL);
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.getByRole('button', { name: /^Sign in$/i }).click();
  await page.waitForURL(/\/(desk|portal)/, { timeout: 30000 });
  await page.waitForLoadState('networkidle');
  await settle(page, 3000);
  note('login', `landed on ${page.url()}`);
});

// 02 — desk (welcome modal if any)
await step('02-desk', async () => {
  if (!page.url().includes('/desk')) await page.goto(`${BASE}/desk`, { waitUntil: 'networkidle' });
  await settle(page, 2500);
  const modal = page.locator('[role=dialog]').filter({ hasText: /This is your Desk|walkthrough|Explore/i }).first();
  if (await modal.count() && await modal.isVisible()) {
    await shot(page, '02a-welcome-modal');
    labels.welcomeModal = await modal.innerText();
    const skip = modal.getByRole('button', { name: /skip|explore|not now/i }).first();
    if (await skip.count()) await skip.click();
    await settle(page, 1000);
  } else note('02a-welcome-modal', 'no welcome modal appeared (existing-designer path: quiet margin-note instead)');
  await shot(page, '02-desk');
  labels.deskMarginNote = await text(page, 'text=/This is your Desk/');
  labels.drawer = await text(page, 'nav[aria-label="Studio drawer"]');
  labels.drawerButtons = await page.locator('nav[aria-label="Studio drawer"] button, nav[aria-label="Studio drawer"] a').evaluateAll(els => els.map(e => ({ text: e.innerText.replace(/\s+/g, ' ').trim(), aria: e.getAttribute('aria-label'), href: e.getAttribute('href') })));
});

// 03 — walkthrough
await step('03-walkthrough', async () => {
  await page.goto(`${BASE}/desk?tour=desk-walkthrough`, { waitUntil: 'networkidle' });
  await settle(page, 4000);
  labels.tourSteps = [];
  for (let i = 1; i <= 6; i++) {
    const dlg = page.locator('[role=dialog]').filter({ hasText: new RegExp(`Step ${i} of 6`, 'i') }).first();
    await dlg.waitFor({ state: 'visible', timeout: 8000 });
    await settle(page, 1200);
    const box = await dlg.boundingBox();
    labels.tourSteps.push({ step: i, text: await dlg.innerText(), box });
    if (box && (box.y < 0 || box.y + box.height > 900 || box.x < 0)) note(`03-walkthrough-step-${i}`, `coachmark partly/fully off-viewport at ${JSON.stringify(box)}`);
    await shot(page, `03-walkthrough-step-${i}`);
    const next = dlg.getByRole('button', { name: i < 6 ? /^Next$/i : /To work|Done/i }).first();
    await next.click();
    await settle(page, 1500);
  }
});

// 04 — command bar
await step('04-command-bar', async () => {
  await page.goto(`${BASE}/desk`, { waitUntil: 'networkidle' });
  await settle(page, 2500);
  await page.keyboard.press('Meta+k');
  await settle(page, 1500);
  labels.commandBarEmpty = await text(page, '[cmdk-root], [role=dialog]:has(input)');
  await shot(page, '04-command-bar');
  await page.keyboard.type('invoice');
  await settle(page, 1500);
  labels.commandBarInvoice = await text(page, '[cmdk-root], [role=dialog]:has(input)');
  await shot(page, '04b-command-bar-invoice');
  await page.keyboard.press('Escape');
  await settle(page, 800);
});

// 05 — studio drawer
await step('05-studio-drawer', async () => {
  const drawer = page.locator('nav[aria-label="Studio drawer"]');
  await drawer.waitFor({ state: 'visible' });
  await page.mouse.move(720, 870);
  await settle(page, 800);
  await shot(page, '05-studio-drawer');
  const box = await drawer.boundingBox();
  await page.screenshot({ path: path.join(OUT, '05b-studio-drawer-crop.png'), clip: { x: 0, y: Math.max(0, box.y - 20), width: 1440, height: Math.min(900 - box.y + 20, box.height + 20) } });
});

// 06 — account / studio setup
await step('06-account-studio-setup', async () => {
  await page.getByRole('button', { name: /Account and settings/i }).first().click();
  await settle(page, 2000);
  const sheet = page.locator('[role=dialog]').last();
  labels.accountSheetTabs = await sheet.locator('button, a').evaluateAll(els => els.map(e => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean));
  const studioTab = sheet.getByRole('button', { name: /^Studio$/ }).first();
  if (await studioTab.count()) {
    await studioTab.click();
    await settle(page, 2000);
    note('06-account-studio-setup', 'Studio page opened');
  } else {
    note('06-account-studio-setup', 'no "Studio" page in the Account sheet (flag studio-workspaces off?) — captured the Account sheet as opened');
  }
  labels.accountSheet = await sheet.innerText();
  await shot(page, '06-account-studio-setup');
  await page.keyboard.press('Escape');
  await settle(page, 800);
});

// 07 — help center
await step('07-help-center', async () => {
  await page.goto(`${BASE}/help`, { waitUntil: 'networkidle' });
  await settle(page, 3000);
  labels.helpCenterHeadings = await page.locator('h1, h2').evaluateAll(els => els.map(e => e.innerText.trim()).filter(Boolean));
  await shot(page, '07-help-center');
});

// 08 — contextual help panel via ⌘K "Help…"
await step('08-help-panel', async () => {
  await page.goto(`${BASE}/desk`, { waitUntil: 'networkidle' });
  await settle(page, 2500);
  await page.keyboard.press('Meta+k');
  await settle(page, 1200);
  await page.keyboard.type('Help');
  await settle(page, 1000);
  const row = page.locator('[cmdk-item], [role=option]').filter({ hasText: /^Help…/ }).first();
  await row.click();
  await settle(page, 2500);
  labels.helpPanel = await text(page, '[role=dialog], [role=complementary], aside');
  await shot(page, '08-help-panel');
  await page.keyboard.press('Escape');
  await settle(page, 800);
});

// 09 — document + spine
await step('09-document', async () => {
  await page.goto(`${BASE}/desk`, { waitUntil: 'networkidle' });
  await settle(page, 2500);
  const first = page.locator('a[href^="/doc/"]').first();
  const href = await first.getAttribute('href');
  note('09-document', `opening ${href}`);
  await first.click();
  await page.waitForURL(/\/doc\//, { timeout: 20000 });
  await page.waitForLoadState('networkidle');
  await settle(page, 4000);
  await shot(page, '09-document');
  const spine = page.locator('nav[aria-label="Document spine"]').first();
  if (await spine.count()) {
    const box = await spine.boundingBox();
    if (box) await page.mouse.move(box.x + box.width / 2, box.y + Math.min(200, box.height / 2));
    await settle(page, 1000);
    labels.spine = await spine.innerText();
    labels.spineItems = await spine.locator('a, button').evaluateAll(els => els.map(e => ({ text: e.innerText.replace(/\s+/g, ' ').trim(), aria: e.getAttribute('aria-label'), href: e.getAttribute('href') })));
  } else note('09b-document-spine', 'nav[aria-label="Document spine"] not found on this document');
  await shot(page, '09b-document-spine');
});

// 10–14
for (const [name, url] of [['10-library', '/library'], ['11-people', '/people'], ['14-scans', '/rooms']]) {
  await step(name, async () => {
    await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle' });
    await settle(page, 3000);
    labels[name] = { title: await page.title(), h1: await page.locator('h1').evaluateAll(els => els.map(e => e.innerText.trim())) };
    await shot(page, name);
  });
}

await step('12-orders-sheet', async () => {
  await page.goto(`${BASE}/desk`, { waitUntil: 'networkidle' });
  await settle(page, 2500);
  await page.locator('nav[aria-label="Studio drawer"]').getByRole('button', { name: /^Orders/ }).first().click();
  await settle(page, 3000);
  labels.ordersSheet = (await text(page, '[role=dialog]'))?.slice(0, 1500);
  await shot(page, '12-orders-sheet');
  await page.keyboard.press('Escape');
  await settle(page, 800);
});

await step('13-the-post', async () => {
  await page.locator('nav[aria-label="Studio drawer"]').getByRole('button', { name: /^The Post/ }).first().click();
  await settle(page, 3000);
  labels.thePost = (await text(page, '[role=dialog]'))?.slice(0, 1500);
  await shot(page, '13-the-post');
  await page.keyboard.press('Escape');
});

fs.writeFileSync(path.join(OUT, 'labels.json'), JSON.stringify(labels, null, 2));
fs.writeFileSync(path.join(OUT, 'shoot.log'), log.join('\n') + '\n');
await browser.close();
