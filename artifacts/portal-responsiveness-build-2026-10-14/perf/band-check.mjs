// US-34 perf gate (SQ-1002): does the band-level `saving…` (components/feedback/saving-band.tsx,
// fixed top-right) cover the money text at the right of the lens band ([data-lens-right-flush])?
// Carried from N12a (SQ-995). Runs at 1440x900 and 390x844, unthrottled, on the P6 fixture task
// (LOCAL Supabase only, created and deleted by the F17 fixtures). Two states per viewport:
//   saving  - the task PATCH is held 6 s in the browser, so the band passes 400 ms and says `saving…`
//   offline - the context goes offline before the tick, so the band says the offline line
// For each state it records the text rects of both elements (Range over their text nodes) and their
// intersection, and (SQ-1012) whether the words are visible. Exit 1 unless the verdict is `clear`.
// Screenshots go to SHOTS (default: the board's verification dir, never the repo).
//
//   STATE=<storageState.json> [BASE=http://localhost:3000] [SHOTS=<dir>] node band-check.mjs > band-check.json
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const fx = await import(path.join(root, 'artifacts/portal-responsiveness-2026-10-14/baseline/harness/fixtures.mjs'));
const require = createRequire(path.join(root, 'apps/designer-portal/package.json'));
const { chromium } = require('@playwright/test');

const BASE = process.env.BASE || 'http://localhost:3000';
const STATE = process.env.STATE;
const SHOTS = process.env.SHOTS;
if (!STATE) throw new Error('STATE (storageState path) is required');
const VIEW = { 1440: { width: 1440, height: 900 }, 390: { width: 390, height: 844 } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// SQ-1012: the band's words can print in the fixed corner ([data-saving-band]) or, on the
// Document, on the lens band's own status line ([data-band-status]); the visible one is measured. Each
// is checked per line box against EVERY text line in [data-lens-band] (line 1, its right slot,
// line 2 and its lead/door), not only the right slot: SQ-1002's offline line also covered line 2.
// `wordsVisible` is whether the words' own element is what paints at the centre of their text
// (elementFromPoint), so a word hidden under another surface fails: SQ-1002's "clear" verdict was
// overlap-only, and at 1440 its `saving…` sat unseen under the right rail.
//
// Text rect of an element's rendered text (a Range over its contents), not its box: the band's <p>
// is a full-height flex box, so its box always meets the lens band; only the glyphs can cover text.
const MEASURE = () => {
  const lineRects = (el) => {
    const r = document.createRange(); r.selectNodeContents(el);
    return [...r.getClientRects()].filter((x) => x.width > 0 && x.height > 0);
  };
  const meet = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const words = [...document.querySelectorAll('[data-saving-band], [data-band-status]')]
    .find((el) => (el.textContent || '').trim() && el.checkVisibility());
  const lens = document.querySelector('[data-lens-band]');
  let lensTextOverlapPx2 = 0; const coveredLensText = [];
  let wordsVisible = null;
  if (words) {
    const wr = lineRects(words);
    if (lens) {
      const walker = document.createTreeWalker(lens, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent.trim() || words.contains(n) || !n.parentElement.checkVisibility() || n.parentElement.closest('.sr-only')) continue;
        const r = document.createRange(); r.selectNodeContents(n);
        const hit = [...r.getClientRects()].reduce((s, t) => s + wr.reduce((u, w) => u + meet(t, w), 0), 0);
        if (hit > 0) { lensTextOverlapPx2 += hit; coveredLensText.push(n.textContent.trim().slice(0, 40)); }
      }
    }
    // The corner is `pointer-events: none`, which hit-testing skips; lift it for the probe only.
    const was = words.style.pointerEvents; words.style.pointerEvents = 'auto';
    wordsVisible = wr.every((w) => { const at = document.elementFromPoint((w.left + w.right) / 2, (w.top + w.bottom) / 2); return !!at && words.contains(at); });
    words.style.pointerEvents = was;
  }
  return { ...MEASURE_SLOT(), wordsAt: words ? (words.hasAttribute('data-band-status') ? 'lens-band line' : 'fixed corner') : null,
    wordsText: words?.textContent ?? null, wordsRect: words ? textRect(words) : null, wordsVisible,
    lensTextOverlapPx2: Math.round(lensTextOverlapPx2), coveredLensText };
  function textRect(el) {
    const rects = lineRects(el);
    if (!rects.length) return null;
    const box = { left: Math.min(...rects.map((x) => x.left)), top: Math.min(...rects.map((x) => x.top)),
      right: Math.max(...rects.map((x) => x.right)), bottom: Math.max(...rects.map((x) => x.bottom)) };
    return Object.fromEntries(Object.entries(box).map(([k, v]) => [k, Math.round(v * 10) / 10]));
  }
  // SQ-1002's original measure: the fixed corner's text against the right slot's.
  function MEASURE_SLOT() {
  const textRect = (el) => {
    if (!el || !(el.textContent || '').trim()) return null;
    const r = document.createRange(); r.selectNodeContents(el);
    const rects = [...r.getClientRects()].filter((x) => x.width > 0 && x.height > 0);
    if (!rects.length) return null;
    const box = { left: Math.min(...rects.map((x) => x.left)), top: Math.min(...rects.map((x) => x.top)),
      right: Math.max(...rects.map((x) => x.right)), bottom: Math.max(...rects.map((x) => x.bottom)) };
    return Object.fromEntries(Object.entries(box).map(([k, v]) => [k, Math.round(v * 10) / 10]));
  };
  const band = document.querySelector('[data-saving-band]');
  const money = [...document.querySelectorAll('[data-lens-right-flush]')].find((el) => el.checkVisibility());
  const b = textRect(band); const m = textRect(money);
  const overlap = b && m ? Math.max(0, Math.min(b.right, m.right) - Math.max(b.left, m.left)) * Math.max(0, Math.min(b.bottom, m.bottom) - Math.max(b.top, m.top)) : 0;
  return { bandState: band?.getAttribute('data-saving-band') ?? null, bandText: band?.textContent ?? null, bandRect: b,
    moneyText: money?.textContent?.trim() ?? null, moneyRect: m, overlapPx2: Math.round(overlap),
    horizontalGapPx: b && m ? Math.round((b.left - m.right) * 10) / 10 : null };
  }
};

async function check(browser, vp, mode) {
  return fx.withFixture('P6', async ({ title }) => {
    // The 390 Document does not mount the fixture task's work block, so every check presses the
    // tick at 1440 and, for 390, resizes the page while the write is still pending. The band is
    // position:fixed and the lens band re-lays out on resize, so the measured geometry is 390's.
    const ctx = await browser.newContext({ viewport: VIEW[1440], storageState: STATE });
    try {
      const page = await ctx.newPage();
      await page.goto(`${BASE}/doc/${fx.PROJECT}`, { waitUntil: 'domcontentloaded' });
      const undone = page.locator(`button[aria-label='Mark "${title}" done']`);
      await undone.waitFor({ state: 'attached', timeout: 60000 });
      const visible = await undone.isVisible();
      if (visible) await undone.scrollIntoViewIfNeeded();
      await sleep(1500);
      if (mode === 'saving') {
        await page.route(/\/rest\/v1\/project_tasks/, async (route) => {
          if (route.request().method() === 'PATCH') await sleep(6000);
          await route.continue();
        });
      } else {
        await ctx.setOffline(true);
      }
      if (visible) await undone.click(); else await undone.evaluate((el) => el.click());
      // `attached`: offline on the Document the corner holds its state but yields the words (SQ-1012).
      await page.waitForSelector(`[data-saving-band="${mode}"]`, { state: 'attached', timeout: 8000 });
      if (vp !== 1440) { await page.setViewportSize(VIEW[vp]); await sleep(600); }
      const stillShown = await page.locator(`[data-saving-band="${mode}"]`).count();
      if (!stillShown) throw new Error(`band left ${mode} before the ${vp} measure`);
      await sleep(100);
      const m = await page.evaluate(MEASURE);
      if (SHOTS) {
        fs.mkdirSync(SHOTS, { recursive: true });
        await page.screenshot({ path: path.join(SHOTS, `band-${vp}-${mode}.png`), clip: { x: 0, y: 0, width: VIEW[vp].width, height: 120 } });
      }
      if (mode === 'offline') await ctx.setOffline(false);
      await page.waitForSelector('[data-saving-band="quiet"]', { state: 'attached', timeout: 20000 }).catch(() => {});
      return { viewport: vp, mode, tickVisible: visible, ...m };
    } finally { await ctx.close(); }
  });
}

const browser = await chromium.launch({ headless: true });
const rows = [];
try {
  for (const vp of [1440, 390]) for (const mode of ['saving', 'offline']) {
    try { rows.push(await check(browser, vp, mode)); } catch (e) { rows.push({ viewport: vp, mode, error: String(e.message || e).slice(0, 600) }); }
  }
} finally { await browser.close(); }
const covered = rows.filter((r) => r.overlapPx2 > 0 || r.lensTextOverlapPx2 > 0);
const hidden = rows.filter((r) => r.wordsVisible !== true);
const verdict = rows.some((r) => r.error) ? 'incomplete' : covered.length ? 'covers-lens-text' : hidden.length ? 'words-hidden' : 'clear';
console.log(JSON.stringify({ base: BASE, rows, covered: covered.length, hidden: hidden.length, verdict }, null, 1));
process.exitCode = verdict === 'clear' ? 0 : 1;
