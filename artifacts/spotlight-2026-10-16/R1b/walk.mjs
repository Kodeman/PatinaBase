// SQ-1114 R1b narrow re-walk (after SQ-1113) — headless Playwright on LOCAL Supabase.
// Run: node walk.mjs [group ...]. Seeds: walk-seed.mjs after `pnpm supabase:reset`, then fixtures.mjs.
// Probe JSON goes to the board verification folder (walk-lib PROBE).
import { chromium, context, BASE, shot, save, focusOf, statuses, settle, tabTo, sql } from './walk-lib.mjs';

const id = (name) => sql(`select id from projects where name='${name}' order by created_at desc limit 1`);
const P = {
  ash: id('Ashgrove Mudroom'), // bob lead, Local Dev Studio, no client, 3h rate-pending
  quill: 'f1900000-0000-4000-8000-000000000005', // Leah lead, no client
  wren: 'f1900000-0000-4000-8000-000000000003', // Leah lead, no client, no money
};
const LEAH = 'designer@patina.dev', BOB = 'cf-phase1-bob@patina.invalid', ALICE = 'cf-phase1-alice@patina.invalid';
// US-37 #5: the only personal-layer piece seeded locally (Phase One Personal Lamp) is alice's.
const results = {};
const browser = await chromium.launch();

async function open(email, url, vp = 'desk') {
  const s = await context(browser, email, vp);
  const page = await s.ctx.newPage();
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await settle(page, 9000);
  const skip = page.getByRole('button', { name: /^skip for now$/i });
  if (await skip.isVisible().catch(() => false)) { await skip.click(); await page.waitForTimeout(800); }
  return { ...s, page };
}
const topText = (page) => page.evaluate(() => {
  const d = [...document.querySelectorAll('[role=dialog]')].pop();
  return (d || document.body).innerText;
}).catch(() => '');
const dialogs = (page) => page.evaluate(() => [...document.querySelectorAll('[role=dialog]')].map((d) => {
  const r = d.getBoundingClientRect();
  return { label: d.getAttribute('aria-label') || d.querySelector('h1,h2')?.innerText?.slice(0, 60) || null, z: getComputedStyle(d.closest('[class*="z-"]') || d).zIndex, visible: r.width > 0 && r.height > 0 };
}));
// Is the element under its own centre point (i.e. actually visible, not covered)?
const hitTest = (loc) => loc.evaluate((el) => {
  el.scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], hit: top === el || el.contains(top), topTag: top?.tagName, topText: (top?.innerText || top?.getAttribute?.('aria-label') || '').trim().slice(0, 80) };
});
async function kbdOpenComposer(page, r) {
  r.tabsToAccounts = await tabTo(page, (f) => /project accounts/i.test(f.text), 200);
  await page.keyboard.press('Enter'); await page.waitForTimeout(1200);
  r.tabsToEntry = await tabTo(page, (f) => /^draft an invoice$/i.test(f.text), 60);
  await page.keyboard.press('Enter'); await page.waitForTimeout(3000);
}
async function unfoldAccounts(page) {
  const draft = page.getByRole('button', { name: /^draft an invoice$/i }).first();
  if (!(await draft.isVisible().catch(() => false))) {
    const unfold = page.getByRole('button', { name: /project accounts/i }).first();
    if (await unfold.count()) { await unfold.click(); await page.waitForTimeout(1500); }
  }
  return draft;
}
async function openComposer(page) {
  const draft = await unfoldAccounts(page);
  if (await draft.isVisible().catch(() => false)) await draft.click();
  else await page.getByRole('button', { name: /^bill \d+ uninvoiced$/i }).first().click();
  await page.waitForTimeout(3000);
}
async function run(name, fn) {
  const r = { ok: false, notes: [] };
  try { await fn(r); r.ok = r.fail ? false : true; } catch (e) { r.error = String(e).slice(0, 500); }
  results[name] = r; save(name, r);
  console.log(name, r.ok ? 'OK' : 'FAIL', r.error ?? '', JSON.stringify(r.fails ?? []));
}
const check = (r, label, cond) => { (r.checks ??= {})[label] = !!cond; if (!cond) { (r.fails ??= []).push(label); r.fail = true; } };
const pending = (project) => sql(`select count(*) from project_time_entries where project_id='${project}' and rate_source='none'`);
const rateField = (page) => page.getByRole('textbox', { name: /Hourly rate for Phase One Bob/i }).first();
const setAct = (page) => page.locator('button, a', { hasText: /^set .* rate$/i }).first();
const priceThem = (page) => page.getByRole('button', { name: /price them/i }).first();

const S = {
  // 6a: composer → Set Phase One Bob's rate. probe=true: visibility + Esc only (no save).
  async s6a(vp, { keyboard = false, probe = false } = {}) {
    const tag = `s6a-${vp}${keyboard ? '-kbd' : ''}${probe ? '-probe' : ''}`;
    await run(tag, async (r) => {
      const { page, iss, remote } = await open(LEAH, `/doc/${P.ash}`, vp);
      r.iss = iss;
      if (keyboard) await kbdOpenComposer(page, r); else await openComposer(page);
      r.group = ((await topText(page)).match(/[^\n]*waiting for a rate[^\n]*/i) || [null])[0];
      check(r, 'rate group shown before Set', r.group);
      r.png = [await shot(page, `${tag}-a-composer`)];
      if (keyboard) { r.tabsToSet = await tabTo(page, (f) => /^set .* rate$/i.test(f.text), 80); await page.keyboard.press('Enter'); }
      else await setAct(page).click();
      await page.waitForTimeout(5000);
      r.dialogsAfterSet = await dialogs(page);
      r.focusAfterSet = await focusOf(page);
      check(r, 'focus lands on the rate field', /Hourly rate for Phase One Bob/i.test(r.focusAfterSet?.aria ?? ''));
      r.fieldHit = await hitTest(rateField(page));
      check(r, 'rate field visible (elementFromPoint returns it)', r.fieldHit.hit);
      r.accountHeader = ((await topText(page)).match(/^[^\n]*(OWNER|ADMIN|MEMBER)[^\n]*/im) || [null])[0];
      r.studioShown = ((await topText(page)).match(/STUDIO \d OF \d[^\n]*/i) || [null])[0];
      r.png.push(await shot(page, `${tag}-b-account-over-composer`));
      if (!probe) {
        r.pendingBefore = pending(P.ash);
        if (keyboard) { await page.keyboard.press('Meta+a'); await page.keyboard.type('150'); }
        else await rateField(page).fill('150');
        await page.keyboard.press('Tab'); await page.waitForTimeout(3500);
        r.focusAfterSave = await focusOf(page);
        check(r, 'Tab after typing lands on Price them', /price them/i.test(r.focusAfterSave?.text ?? ''));
        r.offer = ((await topText(page)).match(/[^\n]*logged before this rate[^\n]*/i) || [null])[0];
        check(r, 'offer text present', r.offer);
        check(r, 'offer says "3 hours" (no .0)', /\b3 hours\b/.test(r.offer ?? '') && !/\d\.0 hours/.test(r.offer ?? ''));
        r.priceHit = await hitTest(priceThem(page));
        check(r, 'Price them visible (elementFromPoint)', r.priceHit.hit);
        r.png.push(await shot(page, `${tag}-c-offer`));
        if (keyboard) await page.keyboard.press('Enter'); else await priceThem(page).click();
        await page.waitForTimeout(3500);
        r.statuses = await statuses(page);
        r.pricedLine = /Priced the hours logged before this rate\./i.test(await topText(page)) || r.statuses.some((s) => /Priced the hours logged before this rate/i.test(s.text));
        check(r, '"Priced the hours logged before this rate." appears', r.pricedLine);
        r.pendingAfter = pending(P.ash);
        check(r, 'DB pending hours → 0', r.pendingAfter === '0');
        r.png.push(await shot(page, `${tag}-d-priced`));
      }
      await page.keyboard.press('Escape'); await page.waitForTimeout(1500);
      r.dialogsAfterEsc = await dialogs(page);
      r.focusAfterEsc = await focusOf(page);
      const composerText = await topText(page);
      check(r, 'Esc leaves the composer open', /draw an invoice/i.test(composerText) || r.dialogsAfterEsc.length > 0);
      check(r, 'Esc closes the Account sheet', !r.dialogsAfterEsc.some((d) => /account/i.test(d.label ?? '')));
      r.groupAfter = (composerText.match(/[^\n]*waiting for a rate[^\n]*/i) || [null])[0];
      if (probe) check(r, 'focus returns to Set after Esc', /^set .* rate$/i.test(r.focusAfterEsc?.text ?? ''));
      else check(r, "composer's rate group clears (no reload)", !r.groupAfter);
      r.png.push(await shot(page, `${tag}-e-after-esc`));
      r.remote = remote.length; check(r, 'no remote requests', remote.length === 0);
    });
  },
  // 2b: header Message act — plain member gets the ask + Copy a note, owner keeps LINK A CLIENT.
  async s2b(email, tag, vp = 'desk') {
    await run(`s2b-header-${tag}-${vp}`, async (r) => {
      const { page, iss } = await open(email, `/doc/${P.quill}`, vp);
      r.iss = iss;
      const header = await page.evaluate(() => {
        const t = document.body.innerText;
        return {
          ask: (t.match(/[^\n]*Ask [^\n]*to link one\.?[^\n]*/i) || [null])[0],
          note: (t.match(/[^\n]*Could you link a client to[^\n]*/i) || [null])[0],
          copy: [...document.querySelectorAll('button')].filter((b) => /copy a note/i.test(b.innerText)).length,
          link: [...document.querySelectorAll('button, a')].filter((b) => /^link a client$/i.test(b.innerText.trim())).map((b) => b.closest('header,[data-letterhead],nav')?.tagName ?? b.parentElement?.tagName),
          message: [...document.querySelectorAll('button, a')].filter((b) => /message the client/i.test(b.innerText)).length,
        };
      });
      Object.assign(r, header);
      if (tag === 'member') {
        check(r, 'ask "No client yet. Ask Leah Hartwell to link one."', /Ask Leah Hartwell to link one/i.test(r.ask ?? ''));
        check(r, 'Copy a note present', r.copy > 0);
        check(r, 'no LINK A CLIENT act', r.link.length === 0);
      } else {
        check(r, 'owner keeps LINK A CLIENT', r.link.length > 0);
        check(r, 'owner sees no ask', !r.ask);
      }
      // Bring the held Message into view so the PNG shows the reason.
      const msg = page.locator('button, a', { hasText: /message the client/i }).first();
      if (await msg.count()) await msg.scrollIntoViewIfNeeded();
      r.png = [await shot(page, `s2b-header-${tag}-${vp}`)];
      if (tag === 'member' && r.copy) {
        await page.locator('button', { hasText: /copy a note/i }).first().click(); await page.waitForTimeout(800);
        r.afterCopy = await statuses(page);
        r.png.push(await shot(page, `s2b-header-${tag}-${vp}-copied`));
      }
    });
  },
  // 3: Account → Studio settings directly; after a save that offers Price them, focus is on Price them.
  async s3(vp = 'desk', rate = '170') {
    await run(`s3-direct-${vp}-kbd`, async (r) => {
      const { page, iss } = await open(LEAH, `/desk?account=studio`, vp);
      r.iss = iss;
      r.headerBefore = ((await topText(page)).match(/^[^\n]*·[^\n]*(OWNER|ADMIN|MEMBER)[^\n]*/im) || [null])[0];
      for (let i = 0; i < 3 && !/Local Dev Studio\s*\n\s*LOCAL-DEV-STUDIO/i.test(await topText(page)); i++) {
        await page.locator('button, a', { hasText: /switch/i }).first().click(); await page.waitForTimeout(2500);
      }
      const t0 = await topText(page);
      r.studioShown = (t0.match(/STUDIO \d OF \d[^\n]*/i) || [null])[0];
      r.headerAfterSwitch = (t0.match(/^[^\n]*·[^\n]*(OWNER|ADMIN|MEMBER)[^\n]*/im) || [null])[0];
      r.headerHead = t0.slice(0, 300);
      check(r, 'low 4: header names Local Dev Studio after the switch', /Local Dev Studio/i.test(r.headerAfterSwitch ?? '') && !/LEAH HARTWELL · OWNER/i.test(r.headerAfterSwitch ?? ''));
      r.png = [await shot(page, `s3-direct-${vp}-a-switched`)];
      r.pendingBefore = pending(P.ash);
      const field = rateField(page);
      await field.scrollIntoViewIfNeeded(); await field.focus();
      await page.keyboard.press('Meta+a'); await page.keyboard.type(rate);
      await page.keyboard.press('Tab'); await page.waitForTimeout(3500);
      r.focusAfterSave = await focusOf(page);
      r.offer = ((await topText(page)).match(/[^\n]*logged before this rate[^\n]*/i) || [null])[0];
      check(r, 'offer raised', r.offer);
      check(r, 'focus on Price them after save (not SIGN OUT)', /price them/i.test(r.focusAfterSave?.text ?? ''));
      check(r, 'low 5: offer prints whole hours with no .0', r.offer && !/\d\.0 hours/.test(r.offer));
      r.png.push(await shot(page, `s3-direct-${vp}-b-offer-focus`));
      await page.keyboard.press('Enter'); await page.waitForTimeout(3500);
      r.priced = /Priced the hours logged before this rate\./i.test(await topText(page));
      check(r, 'Enter prices: "Priced the hours logged before this rate."', r.priced);
      r.pendingAfter = pending(P.ash);
      check(r, 'DB pending → 0', r.pendingAfter === '0');
      r.png.push(await shot(page, `s3-direct-${vp}-c-priced`));
      // Control: a save that raises no offer leaves focus where Tab put it.
      await field.focus(); await page.keyboard.press('Meta+a'); await page.keyboard.type(String(Number(rate) + 5));
      await page.keyboard.press('Tab'); await page.waitForTimeout(3500);
      r.focusAfterNoOfferSave = await focusOf(page);
      r.noOffer = !((await topText(page)).match(/logged before this rate/i));
    });
  },
  // 8a: account-band milestone draft failure → house sentence, never a code.
  async s8_milestone(vp = 'desk', mode = 'natural') {
    await run(`s8-milestone-${mode}-${vp}`, async (r) => {
      const mid = sql(`select id from project_payment_milestones where label='ZZ SQ-1114 deposit' and project_id='${P.wren}'`);
      r.milestone = mid;
      const { page, iss } = await open(LEAH, `/doc/${P.wren}`, vp);
      r.iss = iss;
      await unfoldAccounts(page);
      const gen = page.getByRole('button', { name: /^generate invoice$/i }).first();
      r.genCount = await gen.count();
      check(r, 'Generate invoice act present', r.genCount > 0);
      await gen.scrollIntoViewIfNeeded();
      r.png = [await shot(page, `s8-milestone-${mode}-${vp}-a-band`)];
      if (mode === 'vanished') sql(`delete from project_payment_milestones where id='${mid}'`);
      r.rpc = [];
      page.on('response', async (res) => { if (/generate_milestone_invoice/.test(res.url())) r.rpc.push({ status: res.status(), body: (await res.text().catch(() => '')).slice(0, 300) }); });
      await gen.click(); await page.waitForTimeout(3000);
      r.alerts = await statuses(page);
      r.note = (await page.evaluate(() => document.body.innerText.match(/[^\n]*Could not draft the invoice[^\n]*/)?.[0] ?? null));
      r.folioOpened = (await dialogs(page)).length > 0;
      r.png.push(await shot(page, `s8-milestone-${mode}-${vp}-b-after`));
      if (r.note) {
        check(r, 'note carries no code/id', !/generate_milestone_invoice|draft_invoice_from_milestone|[0-9a-f]{8}-[0-9a-f]{4}|P0001|42501|_/.test(r.note));
        if (mode === 'vanished') check(r, 'vanished milestone → "This milestone couldn\'t be found. Reload the project and try again."', /This milestone couldn.t be found\. Reload the project and try again\./.test(r.note));
      } else r.notes.push('no refusal: the RPC accepted the draft (folioOpened=' + r.folioOpened + ')');
    });
  },
  // 8b: folio send failure no_recipient. The local edge runtime is stopped, so invoice-send is answered
  // at the network edge with the function's own 422 body (index.ts:285-287). stub=false records what the
  // unreachable runtime itself shows.
  async s8_send(vp = 'desk', { stub = true, path = 'issue' } = {}) {
    const tag = `s8-send-${path}-${stub ? 'no_recipient' : 'unreachable'}-${vp}`;
    await run(tag, async (r) => {
      const inv = sql(`select id from invoices where internal_notes='ZZ SQ-1114 ${path}' limit 1`);
      r.invoice = inv;
      const { page, iss } = await open(LEAH, `/doc/${sql(`select project_id from invoices where id='${inv}'`)}`, vp);
      r.iss = iss;
      r.calls = [];
      if (stub) await page.route('**/functions/v1/invoice-send', (route) => {
        r.calls.push(route.request().method());
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
        return route.fulfill({ status: 422, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: 'no_recipient' }) });
      });
      else page.on('response', (res) => { if (/invoice-send/.test(res.url())) r.calls.push(res.status()); });
      await page.evaluate((invoiceId) => window.dispatchEvent(new CustomEvent('document:open-invoice-folio', { detail: { invoiceId } })), inv);
      await page.waitForTimeout(4000);
      r.png = [await shot(page, `${tag}-a-folio`)];
      if (path === 'issue') {
        await page.locator('button', { hasText: /^send the invoice$/i }).first().click(); await page.waitForTimeout(1200);
        r.png.push(await shot(page, `${tag}-b-panel`));
        await page.locator('button', { hasText: /^send the invoice · /i }).last().click();
      } else {
        await page.locator('button', { hasText: /^resend$/i }).first().click(); await page.waitForTimeout(1200);
        await page.locator('button', { hasText: /^resend email$/i }).last().click();
      }
      await page.waitForTimeout(5000);
      const t = await topText(page);
      r.note = (t.match(/[^\n]*Could not send[^\n]*/i) || [null])[0];
      r.addEmail = /Add their email/.test(t);
      r.status = sql(`select status||'|'||coalesce(invoice_number,'') from invoices where id='${inv}'`);
      check(r, 'a "Could not send" note shows', r.note);
      check(r, 'note carries no bare code', r.note && !/no_recipient|send_failed|invoice_not|[a-z]_[a-z]/i.test(r.note));
      if (stub) check(r, 'no_recipient → "This invoice has no client email yet. Add their email, then send it."', /This invoice has no client email yet\. Add their email, then send it\./i.test(r.note ?? ''));
      r.png.push(await shot(page, `${tag}-c-after`));
    });
  },
  // US-37 item 5: promote a personal piece to the Studio Library with lead time blank; piece facts show no lead time.
  async us37(vp = 'desk') {
    await run(`us37-promote-${vp}`, async (r) => {
      const { page, iss } = await open(ALICE, `/library`, vp);
      r.iss = iss;
      await page.locator('button, a', { hasText: /^personal · \d+$/i }).first().click(); await page.waitForTimeout(2500);
      const act = page.locator('button, a', { hasText: /^add to studio library$/i }).first();
      r.acts = await page.locator('button, a', { hasText: /^add to studio library$/i }).count();
      check(r, 'a personal piece offers Add to studio library', r.acts > 0);
      await act.scrollIntoViewIfNeeded();
      const card = await act.evaluate((el) => el.closest('li')?.innerText.split('\n').slice(0, 3).join(' | '));
      r.card = card;
      await act.click(); await page.waitForTimeout(2000);
      const sheet = page.locator('[role=dialog]').last();
      // The sheet's <label>s are not tied to their inputs (no for/id), so fields are found beside their label text.
      const field = (re) => sheet.locator('div.flex.flex-col').filter({ has: page.locator('label', { hasText: re }) }).last().locator('input, select, textarea').first();
      const fillIfEmpty = async (loc, v) => { if (await loc.count() && !(await loc.inputValue().catch(() => ''))) await loc.fill(v); };
      await fillIfEmpty(sheet.getByPlaceholder('Name'), 'ZZ Vendor Rep');
      await fillIfEmpty(sheet.getByPlaceholder('Email'), 'rep@vendor.invalid');
      await fillIfEmpty(sheet.getByPlaceholder('e.g. sofa, lighting'), 'lighting');
      await fillIfEmpty(field(/usage notes/i), 'ZZ SQ-1114 proven on two jobs');
      const studio = field(/^studio/i);
      if (await studio.count() && !(await studio.inputValue().catch(() => ''))) await studio.selectOption({ index: 1 }).catch(() => {});
      const terms = field(/payment terms/i);
      if (await terms.count() && !(await terms.inputValue().catch(() => ''))) await terms.selectOption({ index: 1 }).catch(() => {});
      const lead = field(/lead time/i);
      r.leadAccessibleName = await lead.evaluate((el) => el.labels?.[0]?.innerText ?? el.getAttribute('aria-label')).catch(() => 'ERR');
      await lead.fill('');
      r.form = await sheet.evaluate((d) => [...d.querySelectorAll('input,select,textarea')].map((i) => `${i.labels?.[0]?.innerText?.trim().slice(0, 30) ?? i.name}=${i.value}`));
      const submit = sheet.locator('button[type=submit]').first();
      r.submitDisabled = await submit.isDisabled();
      check(r, 'Promote to Studio enabled with lead time blank', !r.submitDisabled);
      r.png = [await shot(page, `us37-promote-${vp}-a-sheet-blank-lead`)];
      await submit.click(); await page.waitForTimeout(1500);
      r.toast = /Promoted to the Studio Library/.test(await page.evaluate(() => document.body.innerText));
      r.errorText = await sheet.locator('.text-sm').allInnerTexts().catch(() => []);
      check(r, 'save confirmed ("Promoted to the Studio Library")', r.toast);
      r.png.push(await shot(page, `us37-promote-${vp}-b-saved`));
      const pid = sql(`select id||'|'||coalesce(lead_time_weeks::text,'NULL')||'|'||coalesce(layer::text,'?') from products where name=${"'" + (card?.split(' | ')[0] ?? '').replace(/'/g, "''") + "'"} limit 1`);
      r.db = pid;
      check(r, 'DB: lead_time_weeks NULL on the promoted piece', /\|NULL\|/.test(pid));
      const prodId = pid.split('|')[0];
      if (prodId) {
        await page.goto(BASE + `/library/${prodId}`, { waitUntil: 'domcontentloaded' }); await settle(page, 8000);
        r.leadRowBlank = /Lead time/i.test(await page.evaluate(() => document.body.innerText.match(/[^\n]*Lead time[^\n]*/gi)?.join(' | ') ?? ''));
        r.leadLinesBlank = await page.evaluate(() => document.body.innerText.match(/[^\n]*Lead time[^\n]*/gi) ?? []);
        r.png.push(await shot(page, `us37-promote-${vp}-c-facts-blank`));
        // Zero renders blank too (1c6d0dcc6).
        sql(`update products set lead_time_weeks=0 where id='${prodId}'`);
        await page.reload({ waitUntil: 'domcontentloaded' }); await settle(page, 8000);
        r.leadLinesZero = await page.evaluate(() => document.body.innerText.match(/[^\n]*Lead time[^\n]*/gi) ?? []);
        r.png.push(await shot(page, `us37-promote-${vp}-d-facts-zero`));
        check(r, 'piece facts: no "Lead time" fact row for blank', !r.leadLinesBlank.some((l) => /lead time\s*\S*\s*\d+ weeks?/i.test(l)));
        check(r, 'piece facts: no "Lead time" fact row for 0', !r.leadLinesZero.some((l) => /0 weeks/i.test(l)));
        sql(`update products set lead_time_weeks=null where id='${prodId}'`);
      }
    });
  },
};

const want = process.argv.slice(2);
const plan = [
  ['header', () => S.s2b(BOB, 'member', 'desk')],
  ['header', () => S.s2b(BOB, 'member', 'phone')],
  ['header', () => S.s2b(LEAH, 'owner', 'desk')],
  ['probe', () => S.s6a('phone', { probe: true })],
  ['probe', () => S.s6a('desk', { probe: true })],
  ['k8', () => S.s6a('desk', { keyboard: true })],
  ['direct', () => S.s3('desk')], // run `node fixtures.mjs repend` first
  ['milestone', () => S.s8_milestone('desk', 'natural')],
  ['milestone2', () => S.s8_milestone('desk', 'vanished')],
  ['send', () => S.s8_send('desk', { stub: true, path: 'issue' })],
  ['send', () => S.s8_send('desk', { stub: true, path: 'resend' })],
  ['send', () => S.s8_send('desk', { stub: false, path: 'resend' })],
  ['us37', () => S.us37('desk')],
  ['us37b', () => S.us37('phone')],
];
for (const [group, fn] of plan) if (!want.length || want.includes(group)) await fn();
save('summary-' + (want.join('-') || 'all'), results);
await browser.close();
