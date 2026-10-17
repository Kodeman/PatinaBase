// SQ-1317 R2 re-walk (copied from SQ-1047 walk.mjs) — headless Playwright on LOCAL Supabase only.
// Run: node walk.mjs <s1|s2|s3|s5> <desk|phone> [kbd]. Probe JSON → verification/SQ-1317.
// Seeds: walk-seed.mjs, then fixtures.mjs base. Probe JSON → walk-lib PROBE.
import { chromium, context, BASE, shot, save, focusOf, settle, sql } from './walk-lib.mjs';
import { spot, veils, axe, hit } from './spot-lib.mjs';
import { execSync } from 'node:child_process';

const pid = (name) => sql(`select id from projects where name='${name}' order by created_at desc limit 1`);
const P = { ash: pid('Ashgrove Mudroom'), linden: pid('Linden Attic'), juniper: pid('Juniper Row'), wren: 'f1900000-0000-4000-8000-000000000003' };
const LEAH = 'designer@patina.dev', BOB = 'cf-phase1-bob@patina.invalid';
const [scenario, vp = 'desk', kbdArg] = process.argv.slice(2);
const kbd = kbdArg === 'kbd';
const tag = `${scenario}-${vp}${kbd ? '-kbd' : ''}`;
const r = { scenario, vp, kbd, checks: {}, fails: [], notes: [], png: [], steps: [] };
const check = (label, cond) => { r.checks[label] = !!cond; if (!cond) r.fails.push(label); };
const note = (s) => r.notes.push(s);
let n = 0;
const snap = async (page, what) => { const f = await shot(page, `${tag}-${String.fromCharCode(97 + n++)}-${what}`); r.png.push(f); return f; };

const browser = await chromium.launch();
const s = await context(browser, scenario === 's2' ? BOB : LEAH, vp);
r.iss = s.iss;
const page = await s.ctx.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error' && !/posthog|preload|DevTools|favicon/i.test(m.text())) consoleErrors.push(m.text().slice(0, 200)); });

async function land(url) {
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await settle(page, 9000);
  const skip = page.getByRole('button', { name: /^skip for now$/i });
  if (await skip.isVisible().catch(() => false)) { await skip.click(); await page.waitForTimeout(800); }
}
const dialogs = () => page.evaluate(() => [...document.querySelectorAll('[role=dialog]')].filter((d) => d.getBoundingClientRect().width > 0).map((d) => d.getAttribute('aria-label') || d.querySelector('h1,h2,h3')?.innerText?.slice(0, 50) || '?'));
const btn = (re) => page.getByRole('button', { name: re }).first();

// Is focus inside the bar or a lit window?
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

// Press the held act (mouse: click; keyboard: focus it, Enter) and probe the open spotlight.
async function pressHeld(act, what, expectWindows) {
  const veilBefore = await veils(page);
  if (kbd) { await act.focus(); await page.keyboard.press('Enter'); } else await act.click({ force: true });
  await page.waitForTimeout(1800);
  const sp = await spot(page);
  const veilAfter = await veils(page);
  const step = { what, sp, veilBefore, veilAfter, focus: await focusOf(page), zone: await focusZone(), dialogs: await dialogs() };
  r.steps.push(step);
  check(`${what}: spotlight opens`, sp.open);
  if (!sp.open) return step;
  const want = vp === "phone" ? 1 : expectWindows; // ≤640px: one window at a time
  check(`${what}: ${want} window(s) lit`, sp.rings.length === want);
  check(`${what}: no shadow / drop-shadow / opacity fade`, sp.shadowsOrFades.length === 0);
  check(`${what}: scrim lives inside the act's frame`, sp.layerInsideFrame);
  check(`${what}: page veil unchanged`, JSON.stringify(veilBefore) === JSON.stringify(veilAfter));
  check(`${what}: status announces the holds`, sp.status.some((t) => /need attention|needs attention|First:/i.test(t)));
  check(`${what}: focus lands in a window or the bar`, ['window', 'bar'].includes(step.zone));
  check(`${what}: bar (reason + Next/Close) on screen`, sp.bar?.inViewport);
  step.axe = await axe(page, what);
  await snap(page, what);
  return step;
}

// Tab ×10 and Shift-Tab ×6: every stop stays in a window or the bar.
async function tabTrap(what) {
  const zones = [];
  for (let i = 0; i < 10; i++) { await page.keyboard.press('Tab'); zones.push(await focusZone()); }
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Shift+Tab'); zones.push(await focusZone()); }
  r.steps.push({ what: `${what}: tab trap`, zones });
  check(`${what}: Tab/Shift-Tab stay within windows + bar`, zones.every((z) => z === 'window' || z === 'bar'));
}

// Esc closes the spotlight, not the sheet under it; focus returns to the act.
async function escCloses(what, sheetLabel, actRe) {
  await page.keyboard.press('Escape'); await page.waitForTimeout(900);
  const sp = await spot(page), d = await dialogs(), f = await focusOf(page);
  r.steps.push({ what: `${what}: Esc`, open: sp.open, dialogs: d, focus: f });
  check(`${what}: Esc closes the spotlight`, !sp.open);
  if (sheetLabel) check(`${what}: Esc leaves the sheet open`, d.some((x) => sheetLabel.test(x)));
  if (actRe) check(`${what}: focus back on the held act`, actRe.test(f?.text ?? ''));
}

async function openComposer(ctx = {}) {
  await page.evaluate((d) => window.dispatchEvent(new CustomEvent('document:open-invoice-composer', { detail: d })), ctx);
  await page.waitForTimeout(4500);
}
const draftAct = () => page.getByRole('dialog', { name: /draw an invoice/i }).getByRole('button', { name: /^draft the invoice$/i });

const S = {
  // Client-less Ashgrove (Leah owner, bob lead): Draft → 2 windows → link a client, tick a line, live.
  async s1() {
    sql(`set session_replication_role=replica; update projects set client_id=null where id='${P.ash}'`);
    await land(`/doc/${P.ash}`);
    await openComposer({ projectId: P.ash });
    await snap(page, 'composer');
    const first = await pressHeld(draftAct(), 'draft-held', 2);
    r.windowIds = first.sp.rings?.map((w) => w.id);
    if (kbd) { await tabTrap('draft-held'); await escCloses('draft-held', /draw an invoice/i, /^draft the invoice$/i); await pressHeld(draftAct(), 'draft-held-again', 2); }
    // Fix 1: Link a client, from inside its window.
    const link = page.locator('[data-hold-spotlight-window]').first();
    void link;
    const linkAct = page.getByRole('dialog', { name: /draw an invoice/i }).getByRole('link', { name: /^link a client$/i }).or(page.getByRole('dialog', { name: /draw an invoice/i }).getByRole('button', { name: /^link a client$/i })).first();
    r.linkHit = await hit(linkAct);
    check('Link a client live under the scrim (elementFromPoint, not inert)', r.linkHit.hit && !r.linkHit.inert);
    if (kbd) { await linkAct.focus(); await page.keyboard.press('Enter'); } else await linkAct.click();
    await page.waitForTimeout(3000);
    r.afterLink = { dialogs: await dialogs(), focus: await focusOf(page), sp: await spot(page) };
    check('household sheet opens above the composer', r.afterLink.dialogs.length >= 2);
    await snap(page, 'household-over-spotlight');
    const picker = page.getByRole('dialog').last().getByRole('combobox').first();
    r.pickerHit = await hit(picker).catch((e) => ({ error: String(e).slice(0, 120) }));
    check('household picker usable above the scrim', r.pickerHit.hit);
    if (kbd) { await picker.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(800); await page.keyboard.type('Client'); await page.waitForTimeout(1200); }
    else { await picker.click(); await page.waitForTimeout(1200); }
    const option = page.getByRole('option', { name: /client user/i }).first();
    r.optionHit = await hit(option).catch((e) => ({ error: String(e).slice(0, 120) }));
    check('popover option above the scrim is on top (elementFromPoint)', r.optionHit.hit);
    await snap(page, 'picker-popover');
    if (kbd) { await option.focus().catch(() => {}); await page.keyboard.press('Enter'); } else await option.click();
    await page.waitForTimeout(3500);
    const confirm = page.getByRole('dialog').last().getByRole('button', { name: /^(link|link the household|link household|save|confirm)/i }).first();
    if (await confirm.isVisible().catch(() => false)) { r.confirmText = await confirm.innerText(); if (kbd) { await confirm.focus(); await page.keyboard.press('Enter'); } else await confirm.click(); await page.waitForTimeout(3500); }
    r.linked = sql(`select coalesce(client_id::text,'NULL') from projects where id='${P.ash}'`);
    check('DB: Ashgrove client linked', r.linked !== 'NULL');
    await snap(page, 'linked');
    if ((await dialogs()).some((x) => /household/i.test(x))) { await page.keyboard.press('Escape'); await page.waitForTimeout(1500); }
    r.afterLinkBack = { dialogs: await dialogs(), focus: await focusOf(page), zone: await focusZone(), sp: await spot(page) };
    check('after fix 1 the spotlight stays open on the 1 window left (lines)', r.afterLinkBack.sp.open && r.afterLinkBack.sp.rings.length === 1);
    // SQ-1317 s1.7: the hand-off announces the remaining hold and moves focus there.
    if (r.afterLinkBack.sp.open) {
      check('after fix 1 the remaining window is invoice-lines', r.afterLinkBack.sp.rings[0]?.id === 'invoice-lines');
      check('after fix 1 status announces the remaining hold', r.afterLinkBack.sp.status.some((t) => /line/i.test(t)));
      check('after fix 1 focus moves into the remaining window or bar', ['window', 'bar'].includes(r.afterLinkBack.zone));
      check('after fix 1 bar on screen', r.afterLinkBack.sp.bar?.inViewport);
      r.afterLinkBack.axe = await axe(page, 'after-fix-1');
    }
    await snap(page, 'after-fix-1');
    if (!r.afterLinkBack.sp.open) { note('spotlight closed after the first fix; Draft pressed again for the remaining hold'); await pressHeld(draftAct(), 'draft-held-remaining', 1); }
    // Fix 2: tick the priced bench inside the lines window.
    const bench = page.getByRole('dialog', { name: /draw an invoice/i }).getByRole('checkbox', { name: /oak entry bench/i }).or(page.getByRole('dialog', { name: /draw an invoice/i }).locator('label', { hasText: 'ZZ Oak entry bench' }).locator('input')).first();
    r.benchHit = await hit(bench);
    check('bench checkbox live inside the lines window', r.benchHit.hit && !r.benchHit.inert);
    if (kbd) { await bench.focus(); await page.keyboard.press('Space'); } else await bench.click();
    await page.waitForTimeout(2000);
    r.end = { sp: await spot(page), focus: await focusOf(page), dialogs: await dialogs() };
    check('last fix closes the spotlight', !r.end.sp.open);
    check('focus back on Draft the invoice', /^draft the invoice$/i.test(r.end.focus?.text ?? ''));
    check('Draft is no longer held', (await draftAct().getAttribute('aria-disabled')) !== 'true');
    await snap(page, 'closed-draft-ready');
  },

  // Linden (no studio) as bob: Bill an unpriced piece + his rate-pending hour → every hold at once.
  async s2() {
    const lamp = sql(`select id from project_ffe_items where project_id='${P.linden}' and name='ZZ Dormer reading lamp'`);
    await land(`/doc/${P.linden}`);
    await openComposer({ projectId: P.linden, initialFfeItemIds: [lamp] });
    await snap(page, 'composer');
    r.composerHas = await page.getByRole('dialog', { name: /draw an invoice/i }).innerText().then((t) => ({ ratePending: /rate pending/i.test(t), lamp: /Dormer reading lamp/.test(t), studioLine: (t.match(/[^\n]*studio[^\n]*/gi) || []).slice(0, 4) }));
    const st = await pressHeld(draftAct(), 'draft-held', 3);
    r.windowIds = st.sp.rings?.map((w) => w.id);
    r.barTexts = [];
    // Walk the windows with Next.
    const total = Number((st.sp.label || '').match(/OF (\d+)/i)?.[1] ?? 0);
    r.seenIds = [];
    r.barRects = [];
    for (let i = 0; i < total; i++) {
      const sp = await spot(page);
      r.seenIds.push(sp.rings?.find((w) => w.active)?.id);
      r.barRects.push(sp.bar ? { rect: sp.bar.rect, inViewport: sp.bar.inViewport } : null);
      r.barTexts.push({ label: sp.label, bar: sp.bar?.text, focus: await focusOf(page), zone: await focusZone() });
      if (i < total - 1) {
        const next = page.locator('[data-hold-spotlight-bar]').getByRole('button', { name: /^next$/i });
        if (kbd) { await next.focus(); await page.keyboard.press('Enter'); } else await next.click();
        await page.waitForTimeout(900);
        await snap(page, `next-${i + 2}`);
      }
    }
    // s2.2 rate-pending window: ruled by R193 (holds of acts only), recorded, not a check.
    r.ratePendingWindow = (r.seenIds ?? []).some((id) => /rate-pending/.test(id));
    check('no-studio window present', (r.seenIds ?? []).some((id) => /studio/.test(id)));
    check('unpriced lamp window present', (r.seenIds ?? []).some((id) => /price-line/.test(id)));
    check('Next reaches every window', new Set(r.seenIds).size === total);
    check('Next visits [ask-name-studio, price-line, invoice-lines]', JSON.stringify(r.seenIds.map((id) => String(id).split(':')[0])) === JSON.stringify(['ask-name-studio', 'price-line', 'invoice-lines']));
    check('bar on screen at every Next step', r.barRects.every((b) => b?.inViewport));
    await tabTrap('draft-held');
    await escCloses('draft-held', /draw an invoice/i, /^draft the invoice$/i);
  },

  // Studio mode (no house): Draft → household / regarding / lines windows → fill each live.
  async s3() {
    await land('/desk');
    await openComposer({});
    const forSel = page.getByRole('dialog', { name: /draw an invoice/i }).locator('select').first();
    r.forOptions = await forSel.locator('option').allInnerTexts();
    await forSel.selectOption({ label: 'the studio · no house' });
    await page.waitForTimeout(2500);
    await snap(page, 'studio-composer');
    const st = await pressHeld(draftAct(), 'draft-held', 3);
    r.windowIds = st.sp.rings?.map((w) => w.id);
    if (kbd) { await tabTrap('draft-held'); await escCloses('draft-held', /draw an invoice/i, /^draft the invoice$/i); await pressHeld(draftAct(), 'draft-held-again', 3); }
    const dlg = page.getByRole('dialog', { name: /draw an invoice/i });
    // Household: the composer's studio-mode Household picker button, live in its window.
    const hh = dlg.locator('[aria-label="Household"]').first();
    r.householdHit = await hit(hh);
    check('Household picker live in its window', r.householdHit.hit && !r.householdHit.inert);
    if (kbd) { await hh.focus(); await page.keyboard.press('Enter'); } else await hh.click();
    await page.waitForTimeout(1500);
    r.householdOpen = { dialogs: await dialogs(), focus: await focusOf(page) };
    const opt = page.getByRole('option', { name: /client user/i }).first();
    r.householdOptionHit = await hit(opt).catch((e) => ({ error: String(e).slice(0, 120) }));
    check('household popover option on top of the scrim', r.householdOptionHit.hit);
    await snap(page, 'household-popover');
    if (kbd) { await opt.focus().catch(() => {}); await page.keyboard.press('Enter'); } else await opt.click().catch((e) => note('household option: ' + String(e).slice(0, 100)));
    await page.waitForTimeout(2000);
    r.afterHousehold = (await spot(page)).rings?.map((w) => w.id);
    const regarding = dlg.getByLabel(/regarding/i).first();
    r.regardingHit = await hit(regarding).catch((e) => ({ error: String(e).slice(0, 100) }));
    r.beforeRegarding = (await spot(page)).rings?.map((w) => w.id);
    // SQ-1317 s3.4: same frame = the ring list read inside the next animation frame after input.
    r.regardingNextFrame = await regarding.evaluate((el) => new Promise((done) => {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
      el.focus();
      setter.call(el, 'ZZ SQ-1317 studio retainer');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      requestAnimationFrame(() => done([...document.querySelectorAll('[data-hold-spotlight-window]')].map((w) => w.getAttribute('data-hold-spotlight-window'))));
    }));
    await page.waitForTimeout(1200);
    r.afterRegarding = (await spot(page)).rings?.map((w) => w.id);
    check('regarding window cleared in the next frame after typing', r.beforeRegarding?.includes('regarding') && !r.regardingNextFrame.includes('regarding'));
    await snap(page, 'after-household-regarding');
    const desc = dlg.getByPlaceholder(/description/i).first();
    if (!(await desc.isVisible().catch(() => false))) await dlg.getByRole('button', { name: /^add line$/i }).click();
    await desc.fill('ZZ SQ-1047 retainer');
    await dlg.getByPlaceholder(/unit \$/i).first().fill('300');
    await page.waitForTimeout(2500);
    r.end = { sp: await spot(page), focus: await focusOf(page) };
    check('household fix removes its window', !(r.afterHousehold ?? []).includes('household'));
    check('regarding fix removes its window', !(r.afterRegarding ?? []).includes('regarding'));
    check('last fix closes the spotlight', !r.end.sp.open);
    // s3.6 focus to Draft: ruled by R193 (focus stays in a typed field), recorded, not a check.
    r.focusOnDraftAtEnd = /^draft the invoice$/i.test(r.end.focus?.text ?? '');
    await snap(page, 'closed');
  },

  // Account band milestone on Wren (no client): Generate invoice held → spotlight in the paper column.
  async s4() {
    await land(`/doc/${P.wren}`);
    let gen = btn(/^generate invoice$/i);
    if (!(await gen.count())) { const unfold = btn(/project (accounts|financials)/i); if (await unfold.count()) { await unfold.click(); await page.waitForTimeout(1500); } gen = btn(/^generate invoice$/i); }
    r.genCount = await gen.count();
    check('Generate invoice act present', r.genCount > 0);
    if (!r.genCount) return;
    await gen.scrollIntoViewIfNeeded();
    r.genHeld = await gen.getAttribute('aria-disabled');
    r.genReason = await gen.evaluate((el) => (el.getAttribute('aria-describedby') || '').split(/\s+/).map((id) => document.getElementById(id)?.innerText).filter(Boolean));
    check('Generate invoice held with a visible reason (K3)', r.genHeld === 'true' && r.genReason.length > 0);
    await snap(page, 'band-held');
    const rpc = [];
    page.on('request', (q) => { if (/generate_milestone_invoice/.test(q.url())) rpc.push(q.url()); });
    const st = await pressHeld(gen, 'generate-held', 1);
    r.windowIds = st.sp.rings?.map((w) => w.id);
    r.rpcCalls = rpc.length;
    check('held press sends no RPC', rpc.length === 0);
    await tabTrap('generate-held');
    await escCloses('generate-held', null, /^generate invoice$/i);
  },

  // Folio Send with no email → held before issue → Add their email → household sheet above folio → Send.
  async s5() {
    const inv = execSync('node fixtures.mjs draft', { cwd: new URL('.', import.meta.url).pathname, encoding: 'utf8' }).trim().split('\n').pop();
    r.invoice = inv;
    sql(`update designer_clients set client_email=null where client_name='Juniper Okafor'`);
    await land(`/doc/${P.juniper}`);
    const sendCalls = [];
    page.on('response', async (res) => { if (/functions\/v1\/invoice-send/.test(res.url()) && res.request().method() === 'POST') sendCalls.push({ status: res.status(), body: (await res.text().catch(() => '')).slice(0, 200) }); });
    await page.evaluate((invoiceId) => window.dispatchEvent(new CustomEvent('document:open-invoice-folio', { detail: { invoiceId } })), inv);
    await page.waitForTimeout(5000);
    await snap(page, 'folio');
    const send = page.getByRole('dialog').last().getByRole('button', { name: /^send the invoice$/i }).first();
    r.sendHeld = await send.getAttribute('aria-disabled');
    r.sendReason = await send.evaluate((el) => (el.getAttribute('aria-describedby') || '').split(/\s+/).map((id) => document.getElementById(id)?.innerText).filter(Boolean));
    check('Send held before issue, reason visible', r.sendHeld === 'true' && r.sendReason.some((t) => /email/i.test(t)));
    const st = await pressHeld(send, 'send-held', 1);
    r.windowIds = st.sp.rings?.map((w) => w.id);
    r.statusAfterPress = sql(`select status from invoices where id='${inv}'`);
    check('held press issues nothing (still draft)', r.statusAfterPress === 'draft');
    if (kbd) { await tabTrap('send-held'); await escCloses('send-held', /./, /^send the invoice$/i); await pressHeld(send, 'send-held-again', 1); }
    const add = page.getByRole('button', { name: /^add their email$/i }).or(page.getByRole('link', { name: /^add their email$/i })).first();
    r.addHit = await hit(add);
    check('Add their email live in the window', r.addHit.hit && !r.addHit.inert);
    if (kbd) { await add.focus(); await page.keyboard.press('Enter'); } else await add.click();
    await page.waitForTimeout(3500);
    r.afterAdd = { dialogs: await dialogs(), focus: await focusOf(page) };
    check('household sheet opens above the folio', r.afterAdd.dialogs.length >= 2);
    await snap(page, 'household-over-folio');
    const email = page.getByRole('dialog').last().getByRole('textbox', { name: /email/i }).first();
    r.emailHit = await hit(email).catch((e) => ({ error: String(e).slice(0, 120) }));
    check('email field usable above the scrim', r.emailHit.hit);
    await email.fill('juniper.sq1047@patina.invalid');
    const save = page.getByRole('dialog').last().getByRole('button', { name: /^(save|add|done|save email|add email)/i }).first();
    r.saveText = await save.innerText().catch(() => null);
    if (kbd) { await save.focus(); await page.keyboard.press('Enter'); } else await save.click();
    await page.waitForTimeout(3500);
    r.dbEmail = sql(`select coalesce(client_email,'NULL') from designer_clients where client_name='Juniper Okafor'`);
    check('DB: household email saved', r.dbEmail !== 'NULL');
    if ((await dialogs()).length >= 2) { await page.keyboard.press('Escape'); await page.waitForTimeout(1500); }
    r.afterSave = { dialogs: await dialogs(), focus: await focusOf(page), sp: await spot(page), sendHeld: await send.getAttribute('aria-disabled') };
    check('spotlight closed after the fix', !r.afterSave.sp.open);
    check('Send no longer held', r.afterSave.sendHeld !== 'true');
    await snap(page, 'send-ready');
    if (vp === 'desk' && !kbd) {
      await send.click(); await page.waitForTimeout(1500);
      await page.getByRole('dialog').last().getByRole('button', { name: /^send the invoice · \$/i }).click();
      await page.waitForTimeout(12000);
      r.sendCalls = sendCalls;
      r.statusAfterSend = sql(`select status||' '||coalesce(invoice_number,'-') from invoices where id='${inv}'`);
      r.folioText = (await page.getByRole('dialog').last().innerText().catch(() => '')).match(/[^\n]*(sent|could not send|issued)[^\n]*/gi)?.slice(0, 4);
      check('Send works: invoice-send 2xx and invoice leaves draft', sendCalls.some((c) => c.status < 300) && !/^draft/.test(r.statusAfterSend));
      await snap(page, 'sent');
    } else note('Send press left for the desk mouse run (one issue per draft).');
  },
};

try { await S[scenario](); } catch (e) { r.error = String(e).slice(0, 600); r.fails.push('error'); }
r.remote = s.remote.length;
check('0 requests to supabase.co / patina.cloud', s.remote.length === 0);
r.consoleErrors = consoleErrors.slice(0, 10);
r.ok = r.fails.length === 0;
save(tag, r);
console.log(tag, r.ok ? 'PASS' : 'FAIL', JSON.stringify(r.fails), r.error ?? '');
await browser.close();
