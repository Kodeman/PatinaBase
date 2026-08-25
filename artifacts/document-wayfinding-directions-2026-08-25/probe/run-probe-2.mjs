/**
 * V3 verify:repro — pass 2: targeted interaction probes.
 * Run at 1440 unless noted. Reuses login from run-probe.mjs.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = __dirname;
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:3000';

const IDS = {
  brief: 'def699b9-4ffa-4d8e-8a9f-17b3d7db84fd',
  discovery: 'd0c10000-0000-0000-0000-0000000000a1',
  direction: 'd0c10000-0000-0000-0000-0000000000b2',
  proposal_sent: 'b0000000-0000-0000-0000-000000000002',
  project_rich: '2992a486-b2bd-4139-9e51-33ed1621c59c',
  project_plain: 'b0000000-0000-0000-0000-0000000000d4',
  install: 'b0000000-0000-0000-0000-0000000000d1',
  care: 'b0000000-0000-0000-0000-0000000000d3',
};

const TEST_EMAIL = 'designer@patina.dev';
const TEST_PASSWORD = 'password123';
const WELCOME_SHOWN_KEY = 'help-system.welcome-shown.first-project-walkthrough';
const results = {};

async function hideDevOverlays(page) {
  await page.addInitScript(() => {
    const inject = () => {
      const style = document.createElement('style');
      style.setAttribute('data-e2e-hide-dev-overlays', '');
      style.textContent =
        '.tsqd-open-btn-container, .tsqd-main-panel { display: none !important; pointer-events: none !important; }';
      document.head?.appendChild(style);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
    else inject();
  });
}

async function signIn(page) {
  await page.addInitScript((key) => {
    try { window.localStorage.setItem(key, '1'); } catch {}
  }, WELCOME_SHOWN_KEY);
  await page.goto(`${BASE}/auth/signin?callbackUrl=%2Fdesk`, { timeout: 30_000, waitUntil: 'networkidle' });
  if (!page.url().includes('/auth/signin')) return;
  const disclosure = page.getByRole('button', { name: /sign in with email|use email and password instead/i });
  await disclosure.first().waitFor({ state: 'visible', timeout: 15_000 });
  await disclosure.first().click();
  const emailInput = page.getByLabel(/email/i).first();
  await emailInput.waitFor({ state: 'visible', timeout: 10_000 });
  await emailInput.fill(TEST_EMAIL);
  await page.getByLabel(/password/i).first().fill(TEST_PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(/\/(desk|doc|people|library|rooms|room|drafting|compose|preferences|unauthorized)/, { timeout: 60_000 });
}

async function gotoDoc(page, id) {
  await page.goto(`${BASE}/doc/${id}`, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForSelector('main', { timeout: 15_000 }).catch(() => {});
}

async function snap(page, name, full = true) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, `p2-${name}.png`), fullPage: full });
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await hideDevOverlays(page);
  await signIn(page);

  // ── 1. Studio books drawer -> Orders sheet ──
  await gotoDoc(page, IDS.project_rich);
  await page.getByText('Studio books', { exact: true }).click().catch((e) => (results.drawerTrigger = String(e)));
  await snap(page, 'drawer-books-menu');
  results.drawerMenuText = await page.evaluate(() => document.body.innerText).catch(() => null);
  const ordersBtn = page.getByRole('button', { name: /^Orders$/i }).or(page.getByText('Orders', { exact: true }));
  await ordersBtn.first().click().catch((e) => (results.ordersClick = String(e)));
  await snap(page, 'orders-sheet');
  results.ordersSheetText = await page.evaluate(() => document.body.innerText).catch(() => null);
  await page.keyboard.press('Escape').catch(() => {});

  // Accounts sheet (Design authority region / money region text)
  await page.getByText('Studio books', { exact: true }).click().catch(() => {});
  const acctBtn = page.getByRole('button', { name: /^Accounts$/i }).or(page.getByText('Accounts', { exact: true }));
  await acctBtn.first().click().catch((e) => (results.acctClick = String(e)));
  await snap(page, 'accounts-sheet');
  results.accountsSheetText = await page.evaluate(() => document.body.innerText).catch(() => null);
  await page.keyboard.press('Escape').catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});

  // ── 2. plans / spec-book sub-routes on project_rich vs install/care ──
  for (const [key, id] of Object.entries({ project_rich: IDS.project_rich, install: IDS.install, care: IDS.care })) {
    for (const sub of ['plans', 'spec-book']) {
      await page.goto(`${BASE}/doc/${id}/${sub}`, { waitUntil: 'networkidle', timeout: 20_000 }).catch(() => {});
      await snap(page, `route-${key}-${sub}`);
      results[`route-${key}-${sub}`] = {
        url: page.url(),
        text: (await page.evaluate(() => document.body.innerText).catch(() => '')).slice(0, 800),
      };
    }
  }

  // ── 3. Unfold Design authority + Schedule on project_rich ──
  await gotoDoc(page, IDS.project_rich);
  const unfoldButtons = page.getByRole('button', { name: /unfold/i });
  const n = await unfoldButtons.count();
  for (let i = 0; i < n; i++) {
    await unfoldButtons.nth(0).click().catch(() => {});
    await page.waitForTimeout(200);
  }
  await snap(page, 'project-rich-all-unfolded');
  results.projectRichUnfolded = await page.evaluate(() => document.body.innerText).catch(() => null);

  // ── 4. Margin rail open/closed at 1440 ──
  await gotoDoc(page, IDS.project_rich);
  results.marginCandidates = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('[aria-label], button')).filter((el) =>
      /margin/i.test(el.getAttribute('aria-label') || '') || /margin/i.test(el.textContent || ''),
    );
    return els.slice(0, 10).map((el) => ({ tag: el.tagName, aria: el.getAttribute('aria-label'), text: el.textContent?.slice(0, 60) }));
  });

  // ── 5. Recent duplicate-Aspen check: visit proposal_sent then install, then cmdk ──
  await gotoDoc(page, IDS.proposal_sent);
  await gotoDoc(page, IDS.install);
  await page.goto(`${BASE}/desk`, { waitUntil: 'networkidle' });
  await page.keyboard.press('Meta+k');
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 }).catch(() => {});
  await snap(page, 'cmdk-recent-after-aspen-nav', false);
  results.cmdkRecentText = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    return dialog ? dialog.textContent : document.body.innerText;
  }).catch(() => null);
  await page.keyboard.press('Escape').catch(() => {});

  // ── 6. Focus-return after ⌘K close ──
  await page.goto(`${BASE}/desk`, { waitUntil: 'networkidle' });
  const trigger = page.getByText('FIND ANYTHING').first();
  await trigger.click().catch(() => {});
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 }).catch(() => {});
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  results.focusReturn = await page.evaluate(() => {
    const el = document.activeElement;
    return { tag: el?.tagName, text: el?.textContent?.slice(0, 80), isBody: el === document.body };
  });

  // ── 7. Reveal 4 more folios on Desk — is the sent Aspen proposal among them? ──
  await page.goto(`${BASE}/desk`, { waitUntil: 'networkidle' });
  await page.getByText('REVEAL 4 MORE FOLIOS').click().catch((e) => (results.revealClick = String(e)));
  await snap(page, 'desk-revealed-folios');
  results.deskRevealedText = await page.evaluate(() => document.body.innerText).catch(() => null);

  // ── 8. Contrast: find live elements using clay/terracotta as text color ──
  await gotoDoc(page, IDS.install);
  results.colorScan = await page.evaluate(() => {
    const clay = 'rgb(196, 165, 123)'; // #C4A57B
    const terracotta = 'rgb(212, 160, 144)'; // #D4A090
    const out = [];
    document.querySelectorAll('body *').forEach((el) => {
      if (el.children.length > 0) return; // leaf nodes only
      const cs = getComputedStyle(el);
      const color = cs.color;
      if (color === clay || color === terracotta) {
        let bgEl = el;
        let bg = 'rgba(0, 0, 0, 0)';
        while (bgEl && (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent')) {
          bg = getComputedStyle(bgEl).backgroundColor;
          bgEl = bgEl.parentElement;
        }
        out.push({ text: el.textContent?.trim().slice(0, 60), color, bg, tag: el.tagName });
      }
    });
    return out.slice(0, 25);
  });

  // ── 9. Room lens at install (has project_rooms rows) ──
  await gotoDoc(page, IDS.install);
  results.roomLensCandidates = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button, [role="tab"], a')).filter((el) =>
      /room/i.test(el.textContent || ''),
    );
    return els.slice(0, 15).map((el) => ({ tag: el.tagName, text: el.textContent?.trim().slice(0, 60) }));
  });
  await snap(page, 'install-room-candidates');

  // ── 10. /rooms room-file route ──
  await page.goto(`${BASE}/rooms`, { waitUntil: 'networkidle', timeout: 20_000 }).catch(() => {});
  await snap(page, 'rooms-index');
  results.roomsIndexText = await page.evaluate(() => document.body.innerText).catch(() => null);

  writeFileSync(path.join(OUT, 'probe2-results.json'), JSON.stringify(results, null, 2));
  await browser.close();
  console.log('DONE p2');
})();
