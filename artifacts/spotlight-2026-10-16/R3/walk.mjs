// SQ-1055 R3 walk — headless Playwright on LOCAL Supabase only (walk-lib refuses non-127.0.0.1 API / JWT iss).
// Run: node walk.mjs <site> <desk|phone> [kbd]. Sites live in sites.mjs. Probe JSON → verification/SQ-1055.
// Probes are the SQ-1047 R2 set (spot-lib.mjs); the press/Tab/Esc helpers follow SQ-1047's walk.mjs.
import { chromium, context, BASE, shot, save, focusOf, settle } from './walk-lib.mjs';
import { spot, veils, axe, hit } from './spot-lib.mjs';
import { SITES } from './sites.mjs';

const [site, vp = 'desk', kbdArg] = process.argv.slice(2);
const S = SITES[site];
if (!S) throw new Error('unknown site ' + site + '; have ' + Object.keys(SITES).join(','));
const kbd = kbdArg === 'kbd';
const tag = `${site}-${vp}${kbd ? '-kbd' : ''}`;
const r = { site, vp, kbd, checks: {}, fails: [], notes: [], png: [], steps: [] };
const check = (label, cond) => { r.checks[label] = !!cond; if (!cond) r.fails.push(label); };
const note = (s) => r.notes.push(s);
let n = 0;
const snap = async (page, what) => { const f = await shot(page, `${tag}-${String.fromCharCode(97 + n++)}-${what}`); r.png.push(f); return f; };

const browser = await chromium.launch();
const s = await context(browser, S.user ?? 'designer@patina.dev', vp);
r.iss = s.iss;
const page = await s.ctx.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error' && !/posthog|preload|DevTools|favicon|hydrat/i.test(m.text())) consoleErrors.push(m.text().slice(0, 200)); });

const dialogs = () => page.evaluate(() => [...document.querySelectorAll('[role=dialog]')].filter((d) => d.getBoundingClientRect().width > 0).map((d) => d.getAttribute('aria-label') || d.querySelector('h1,h2,h3')?.innerText?.slice(0, 50) || '?'));
const focusZone = () => page.evaluate(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return 'body';
  if (el.closest('[data-hold-spotlight-bar]')) return 'bar';
  const layer = document.querySelector('[data-hold-spotlight]');
  if (!layer) return 'no-spotlight';
  const fr = el.getBoundingClientRect();
  const cx = fr.left + fr.width / 2, cy = fr.top + fr.height / 2;
  const inRing = [...layer.querySelectorAll('[data-hold-spotlight-window]')].some((w) => { const b = w.getBoundingClientRect(); return cx >= b.left - 2 && cx <= b.right + 2 && cy >= b.top - 2 && cy <= b.bottom + 2; });
  if (inRing) return 'window';
  if (el.closest('[inert]')) return 'INERT';
  if (!layer.closest('[data-spotlight-frame]')?.contains(el)) return 'outside-frame';
  return 'frame-unlit';
});
// Where each window sits relative to the element it should light (its hold target).
const targets = (sels) => page.evaluate((sels) => {
  const rings = [...document.querySelectorAll('[data-hold-spotlight-window]')].map((w) => w.getBoundingClientRect());
  return sels.map((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { sel, found: false };
    const b = el.getBoundingClientRect();
    const covered = rings.some((w) => b.left >= w.left - 12 && b.right <= w.right + 12 && b.top >= w.top - 12 && b.bottom <= w.bottom + 12);
    return { sel, found: true, rect: [b.left, b.top, b.width, b.height].map(Math.round), covered };
  });
}, sels);

const ctx = {
  page, vp, kbd, note, check, snap, dialogs, hit, focusOf,
  async land(url) {
    await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await settle(page, 8000);
    const skip = page.getByRole('button', { name: /^skip for now$/i });
    if (await skip.isVisible().catch(() => false)) { await skip.click(); await page.waitForTimeout(800); }
  },
  btn: (re, root = page) => root.getByRole('button', { name: re }).filter({ visible: true }).first(),
  async press(act, what, expectWindows, targetSels = []) {
    const veilBefore = await veils(page);
    await act.scrollIntoViewIfNeeded().catch(() => {});
    if (kbd) { await act.focus(); await page.keyboard.press('Enter'); } else {
      // A held act is aria-disabled, not disabled, so a real click works; it lets Playwright scroll the act clear of fixed foot chrome.
      const ok = await act.click({ timeout: 8000 }).then(() => true).catch(() => false);
      if (!ok) { note(`${what}: plain click refused (act covered); forced`); await act.click({ force: true }); }
    }
    await page.waitForTimeout(1600);
    const sp = await spot(page);
    const veilAfter = await veils(page);
    const step = { what, sp, veilBefore, veilAfter, focus: await focusOf(page), zone: await focusZone(), dialogs: await dialogs() };
    r.steps.push(step);
    check(`${what}: spotlight opens`, sp.open);
    if (!sp.open) { await snap(page, what + '-NOT-OPEN'); return step; }
    const want = vp === 'phone' ? 1 : expectWindows;
    check(`${what}: ${want} window(s) lit`, sp.rings.length === want);
    check(`${what}: no shadow / drop-shadow / opacity fade`, sp.shadowsOrFades.length === 0);
    check(`${what}: scrim inside the act's frame`, sp.layerInsideFrame);
    check(`${what}: page veil unchanged`, JSON.stringify(veilBefore) === JSON.stringify(veilAfter));
    check(`${what}: status announces`, sp.status.some((t) => t.length > 8));
    check(`${what}: focus in a window or the bar`, ['window', 'bar'].includes(step.zone));
    check(`${what}: bar on screen`, !!sp.bar?.inViewport);
    if (vp === 'phone' && sp.bar) check(`${what}: bar docks to the bottom`, sp.bar.rect[1] + sp.bar.rect[3] >= 844 * 0.6);
    if (targetSels.length) {
      step.targets = await targets(targetSels);
      // At 390 only the active window is drawn, so only the first target must be covered.
      const must = vp === 'phone' ? step.targets.slice(0, 1) : step.targets;
      check(`${what}: windows land on their targets`, must.every((t) => t.found && t.covered));
    }
    step.axe = await axe(page, what);
    r.axe = [...(r.axe ?? []), { what, count: step.axe.count, ids: step.axe.violations.map((v) => `${v.id}(${v.impact},${v.n})`) }];
    await snap(page, what);
    return step;
  },
  async tabTrap(what) {
    const zones = [];
    for (let i = 0; i < 10; i++) { await page.keyboard.press('Tab'); zones.push(await focusZone()); }
    for (let i = 0; i < 6; i++) { await page.keyboard.press('Shift+Tab'); zones.push(await focusZone()); }
    r.steps.push({ what: `${what}: tab trap`, zones });
    check(`${what}: Tab/Shift-Tab stay within windows + bar`, zones.every((z) => z === 'window' || z === 'bar'));
  },
  async esc(what, sheetRe, actRe) {
    const before = await dialogs();
    await page.keyboard.press('Escape'); await page.waitForTimeout(900);
    const sp = await spot(page), d = await dialogs(), f = await focusOf(page);
    r.steps.push({ what: `${what}: Esc`, open: sp.open, before, dialogs: d, focus: f });
    check(`${what}: Esc closes the spotlight`, !sp.open);
    // The sheet(s) under the spotlight must all still be open: the dialog list is unchanged by the first Esc.
    check(`${what}: Esc leaves the sheet/dialogs open`, JSON.stringify(before) === JSON.stringify(d));
    if (actRe) check(`${what}: focus back on the held act`, actRe.test(f?.text ?? '') || actRe.test(f?.aria ?? ''));
  },
  // Reach a field (keyboard: Tab from where focus is; mouse: click) and type into it.
  async fixByTyping(loc, text) {
    if (kbd) {
      let i = 0;
      for (; i < 30 && !(await loc.evaluate((el) => el === document.activeElement || el.contains(document.activeElement)).catch(() => false)); i++) await page.keyboard.press('Tab');
      note(`Tab presses to the fix field: ${i}`);
      check('keyboard reaches the fix inside the spotlight', i < 30);
    } else await loc.click();
    await page.keyboard.type(text);
    await page.waitForTimeout(1200);
  },
  spot: () => spot(page),
  focusZone,
};

try {
  await S.run(ctx);
} catch (e) {
  r.error = String(e?.stack ?? e).slice(0, 600);
  r.fails.push('harness error: ' + String(e?.message ?? e).slice(0, 160));
  await snap(page, 'error').catch(() => {});
}
r.consoleErrors = consoleErrors.slice(0, 8);
r.remote = s.remote.length;
check('no request to supabase.co / patina.cloud', s.remote.length === 0);
save(tag, r);
console.log(JSON.stringify({ tag, iss: r.iss, fails: r.fails, notes: r.notes, axe: r.axe, png: r.png, windows: r.steps.filter((x) => x.sp).map((x) => [x.what, x.sp.rings?.map((w) => w.id), x.zone, x.sp.bar?.rect, x.sp.status?.[0]?.slice(0, 90)]), error: r.error }, null, 0));
await browser.close();
