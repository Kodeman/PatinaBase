// US-34 perf gate (SQ-1002): request-count probes the lab rows do not carry.
//   node probe.mjs kinds <waterfall.json>...   tally Supabase request kinds in lab.mjs waterfall files
//                                               (baseline/traces/local-*-waterfall.json and after/)
//   STATE=... node probe.mjs spa                F3: hover a Desk card, then click; F4: Document -> pieces
//                                               (unthrottled; counts requests started after the click)
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const KINDS = ['document_state', 'rpc/desk_read', 'rpc/document_open', 'project_ffe_items', 'auth/v1/user', 'outbound_drafts', 'project_tasks', 'projects'];
const kindOf = (u) => { const p = u.split('?')[0]; return KINDS.find((k) => p.endsWith(`/${k}`)); };

function tally(urls) {
  const sb = urls.filter((u) => /^(SB|http:\/\/127\.0\.0\.1:54321)/.test(u) && !u.includes('/realtime/'));
  const out = { supabaseRequests: sb.length };
  for (const k of KINDS) out[k] = sb.filter((u) => kindOf(u) === k).length;
  return out;
}

const [mode, ...files] = process.argv.slice(2);
if (mode === 'kinds') {
  const out = {};
  for (const f of files) {
    const t = JSON.parse(fs.readFileSync(f, 'utf8'));
    out[path.relative(root, f)] = { route: t.route, ...tally(t.requests.map((r) => r.u)) };
  }
  console.log(JSON.stringify(out, null, 1));
} else if (mode === 'spa') {
  const require = createRequire(path.join(root, 'apps/designer-portal/package.json'));
  const { chromium } = require('@playwright/test');
  const BASE = process.env.BASE || 'http://localhost:3000';
  const DOC = process.env.DOC || 'b0000000-0000-0000-0000-00000000c0d1';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: process.env.STATE });
  const page = await ctx.newPage();
  await page.addInitScript('try { window.sessionStorage.setItem("pl-arrive-e2e", "1"); } catch (e) {}');
  const reqs = [];
  page.on('request', (r) => reqs.push({ u: r.url(), t: Date.now() }));
  const after = (t0) => tally(reqs.filter((q) => q.t >= t0).map((q) => q.u));
  const quiet = async (ms = 3000) => { let n = -1; while (n !== reqs.length) { n = reqs.length; await sleep(ms); } };
  const result = {};
  // F3: hover, let the intent prefetch run, then click.
  await page.goto(`${BASE}/desk`); await page.waitForSelector('a[href^="/doc/"]', { timeout: 60000 }); await quiet();
  const card = page.locator(`a[href="/doc/${DOC}"]`).first();
  const link = (await card.count()) ? card : page.locator('a[href^="/doc/"]').first();
  const tHover = Date.now(); await link.hover(); await quiet(2000);
  result.F3_hover = after(tHover);
  const tClick = Date.now(); await link.click(); await page.waitForURL(/\/doc\//, { timeout: 30000 }); await quiet();
  result.F3_afterClick = after(tClick);
  // F4: Document -> its pieces route by a client navigation, if a link to it exists.
  await page.goto(`${BASE}/doc/${DOC}`); await page.waitForSelector('h1', { timeout: 60000 }); await quiet();
  const pieces = page.locator(`a[href="/doc/${DOC}/pieces"]`).first();
  if (await pieces.count()) {
    const t = Date.now(); await pieces.click(); await page.waitForURL(/\/pieces$/, { timeout: 30000 }); await quiet();
    result.F4_piecesSpa = { via: 'link', ...after(t) };
  } else {
    const t = Date.now(); await page.evaluate((u) => window.next?.router?.push(u), `/doc/${DOC}/pieces`); await page.waitForURL(/\/pieces$/, { timeout: 30000 }); await quiet();
    result.F4_piecesSpa = { via: 'router.push', ...after(t) };
  }
  await browser.close();
  console.log(JSON.stringify(result, null, 1));
} else {
  console.error('usage: node probe.mjs kinds <files...> | spa');
  process.exit(2);
}
