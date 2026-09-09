// Wave 3c — does the standing concept-render plate actually PAINT?
//
// The round-trip's first screenshot showed the <img>'s alt text rather than the
// image. That is the difference between "the private bucket's signed URL works"
// and "the client-facing plate is broken", so it is measured rather than
// assumed: upload, then read the element's naturalWidth (0 = never decoded) and
// fetch the signed src directly for its status.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const OUT =
  '/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-int3c/artifacts/portal-polish-build-2026-09-08/waves/w3c/renders';
const BASE = 'http://localhost:3000';
const EMAIL = 'designer@patina.dev';
const PASSWORD = 'password123';
const WELCOME_SHOWN_KEY = 'help-system.welcome-shown.first-project-walkthrough';
const PROJECT_ID = 'b0000000-0000-0000-0000-0000000000d1';
const ROOM_ID = 'b0000000-0000-0000-0000-0000000d2c0b';

const out = {};
// BYPASS_CSP=1 runs the identical pass with the page's CSP switched off. If the
// plate paints then and only then, CSP is the whole cause — and the blocking
// directive is the one that exists only because this is a PRODUCTION build
// pointed at a LOCAL http Supabase (next.config.js:95-97 allows
// http://127.0.0.1:* under NODE_ENV=development only).
const bypassCSP = process.env.BYPASS_CSP === '1';
out.bypassCSP = bypassCSP;
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 }, bypassCSP });
  const page = await ctx.newPage();
  const failed = [];
  page.on('requestfailed', (r) => failed.push(`${r.url().slice(0, 160)} :: ${r.failure()?.errorText}`));

  await page.addInitScript((k) => {
    try {
      localStorage.setItem(k, '1');
    } catch {}
  }, WELCOME_SHOWN_KEY);
  await page.goto(`${BASE}/auth/signin?callbackUrl=%2Fdesk`, { waitUntil: 'domcontentloaded' });
  await page
    .getByRole('button', { name: /sign in with email|use email and password instead/i })
    .first()
    .click();
  await page.getByLabel(/email/i).first().fill(EMAIL);
  await page.getByLabel(/password/i).first().fill(PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(/\/(desk|doc)/, { timeout: 90000 });

  await page.goto(`${BASE}/doc/${PROJECT_ID}`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(3000);
  const skip = page.getByRole('button', { name: /skip for now/i });
  if (await skip.count()) {
    await skip.first().click();
    await page.waitForTimeout(900);
  }

  let room = page.locator(`[data-concept-render-room="${ROOM_ID}"]`);
  if ((await room.count()) === 0) {
    const unfold = page.getByRole('button', { name: /pieces|ff&e|furnishings/i });
    for (let i = 0; i < (await unfold.count()); i++) {
      await unfold.nth(i).click().catch(() => {});
      await page.waitForTimeout(1200);
      if ((await room.count()) > 0) break;
    }
  }
  await room.first().scrollIntoViewIfNeeded();

  const add = room.first().getByRole('button', { name: /add a concept render/i });
  await add.waitFor({ state: 'visible', timeout: 30000 });
  await add.click();
  await page.waitForTimeout(600);
  await room.first().locator('input[type="file"]').setInputFiles(`${OUT}/plate-probe.png`);
  await room.first().getByLabel(/^caption$/i).fill('plate probe');
  await room.first().getByRole('button', { name: /^upload$/i }).click();
  await room
    .first()
    .getByRole('button', { name: /^remove$/i })
    .waitFor({ state: 'visible', timeout: 60000 });

  // give the signed URL a generous window to decode
  await page.waitForTimeout(6000);

  out.img = await room.first().locator('img').first().evaluate((el) => ({
    src: el.currentSrc || el.src,
    complete: el.complete,
    naturalWidth: el.naturalWidth,
    naturalHeight: el.naturalHeight,
  }));

  // fetch the signed URL from inside the page, with the session's own cookies
  out.fetchStatus = await page.evaluate(async (src) => {
    try {
      const r = await fetch(src);
      return { status: r.status, type: r.headers.get('content-type'), bytes: (await r.blob()).size };
    } catch (e) {
      return { error: String(e) };
    }
  }, out.img.src);

  out.requestFailures = failed.filter((f) => f.includes('room-renders') || f.includes('storage'));

  await room.first().screenshot({ path: `${OUT}/concept-render-standing${bypassCSP ? '-nocsp' : ''}.png` });

  // put the room back the way the seed had it
  await room.first().getByRole('button', { name: /^remove$/i }).click();
  await room
    .first()
    .getByRole('button', { name: /add a concept render/i })
    .waitFor({ state: 'visible', timeout: 60000 });

  await ctx.close();
} finally {
  await browser.close();
  fs.writeFileSync(`${OUT}/plate-probe${bypassCSP ? '-nocsp' : ''}.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}
