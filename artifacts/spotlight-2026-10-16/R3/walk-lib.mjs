// SQ-1055 R3 walk helpers (copied from SQ-1323/SQ-1047/SQ-1114). LOCAL Supabase only: refuses any non-127.0.0.1 API or JWT issuer.
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

export const WT = '/Users/kody/.claude/sidequest/worktrees/patina-merged-5f06cee3/agent-a1962bb001289c8d8';
export const OUT = path.join(WT, 'artifacts/spotlight-2026-10-16/R3');
export const PROBE = '/Users/kody/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-1055';
export const BASE = 'http://localhost:3040';
const require = createRequire(WT + '/packages/supabase/package.json');
const { createClient } = require('@supabase/supabase-js');
export const { chromium } = createRequire(WT + '/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/package.json')('playwright');

export const env = Object.fromEntries(
  execSync('supabase status -o env', { cwd: WT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    .split('\n').filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }),
);
if (!env.API_URL.startsWith('http://127.0.0.1:')) throw new Error('not local: ' + env.API_URL);
const PG = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
export const sql = (q) => execSync(`psql "${PG}" -v ON_ERROR_STOP=1 -Atc ${JSON.stringify(q)}`, { encoding: 'utf8' }).trim();
fs.mkdirSync(PROBE, { recursive: true });

export const VIEWPORTS = { desk: { width: 1400, height: 900 }, phone: { width: 390, height: 844 } };

// Signs in through GoTrue and hands the browser the same cookie @supabase/ssr writes.
export async function context(browser, email, vp = 'desk') {
  const c = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: 'password123' });
  if (error) throw error;
  const iss = JSON.parse(Buffer.from(data.session.access_token.split('.')[1], 'base64url')).iss;
  if (iss !== 'http://127.0.0.1:54321/auth/v1') throw new Error('JWT iss not local: ' + iss);
  const value = 'base64-' + Buffer.from(JSON.stringify(data.session)).toString('base64url');
  const name = 'sb-bkvcixdmuyejfzcijpdg-auth-token';
  const chunks = value.length <= 3180 ? [[name, value]] : value.match(/.{1,3180}/g).map((v, i) => [`${name}.${i}`, v]);
  const ctx = await browser.newContext({
    viewport: VIEWPORTS[vp], deviceScaleFactor: vp === 'phone' ? 2 : 1, reducedMotion: 'reduce',
  });
  await ctx.addCookies(chunks.map(([n, v]) => ({ name: n, value: v, domain: 'localhost', path: '/', sameSite: 'Lax' })));
  const remote = [];
  ctx.on('request', (r) => { if (/supabase\.co|patina\.cloud/.test(r.url())) remote.push(r.url()); });
  return { ctx, iss, userId: data.user.id, remote };
}

export async function shot(page, name) {
  const file = path.join(OUT, name + '.png');
  await page.screenshot({ path: file });
  // Downscale only: sips -Z also enlarges a 1400px capture to 1600.
  const dims = execSync(`sips -g pixelWidth -g pixelHeight "${file}"`, { encoding: 'utf8' }).match(/\d+$/gm).map(Number);
  if (Math.max(...dims) > 1600) execSync(`sips -Z 1600 "${file}"`, { stdio: 'ignore' });
  return name + '.png';
}

export function save(name, obj) {
  fs.writeFileSync(path.join(PROBE, name + '.json'), JSON.stringify(obj, null, 1));
}

// What the keyboard is on, in words.
export const focusOf = (page) => page.evaluate(() => {
  const el = document.activeElement;
  if (!el) return null;
  return { tag: el.tagName, text: (el.innerText || el.value || '').trim().slice(0, 90), aria: el.getAttribute('aria-label'), describedby: el.getAttribute('aria-describedby') };
});

export const statuses = (page) => page.evaluate(() =>
  [...document.querySelectorAll('[role=status],[role=alert]')].map((n) => ({ role: n.getAttribute('role'), id: n.id, text: n.innerText.trim().slice(0, 200) })).filter((s) => s.text));

export const textHas = (page, re) => page.evaluate((src) => new RegExp(src).test(document.body.innerText), re.source);

export async function settle(page, ms = 1500) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(ms);
}

// Tabs until predicate(focus) holds; returns the number of presses or -1.
export async function tabTo(page, pred, max = 120, key = 'Tab') {
  for (let i = 1; i <= max; i++) {
    await page.keyboard.press(key);
    const f = await focusOf(page);
    if (f && pred(f)) return i;
  }
  return -1;
}
