// SQ-1060 R1 walk — headless Playwright on LOCAL Supabase. Run: node walk.mjs [scenario ...]
// Seeds: walk-seed.mjs (after `pnpm supabase:reset`). Probe JSON goes to the board verification folder.
import { chromium, context, BASE, shot, save, focusOf, statuses, settle, tabTo, sql } from './walk-lib.mjs';

const P = {
  ash: 'fb7c206e-d322-493e-a0b3-9c6cd8df5907', // bob lead, Local Dev Studio, no client, 3h rate-pending
  linden: 'f4d2d9a8-5ace-4850-b676-e94067df782e', // bob lead, studio NULL, client linked
  fern: '5f9706e2-486e-4f25-8525-9a866295ceab', // alice (solo owner) stamped, 2h rate-pending
  oldMill: '35030cfb-7319-4bb9-9213-804eb3bee059', // alice legacy NULL studio
  quill: 'f1900000-0000-4000-8000-000000000005', // Leah lead, no client, FF&E only
  harrow: 'f1900000-0000-4000-8000-000000000002', // Leah lead, no client, one unbilled hour
  wren: 'f1900000-0000-4000-8000-000000000003', // Leah lead, no client, no money
};
const LEAH = 'designer@patina.dev', BOB = 'cf-phase1-bob@patina.invalid', ALICE = 'cf-phase1-alice@patina.invalid';
const results = {};
const browser = await chromium.launch();

async function open(email, url, vp = 'desk') {
  const s = await context(browser, email, vp);
  const page = await s.ctx.newPage();
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await settle(page, 9000);
  // The Desk tour invitation sits over /desk for a first visit; set it aside like a returning designer.
  const skip = page.getByRole('button', { name: /^skip for now$/i });
  if (await skip.isVisible().catch(() => false)) { await skip.click(); await page.waitForTimeout(800); }
  return { ...s, page };
}
const folio = (page) => page.locator('[data-spotlight-frame]').last();
// The open sheet's text (dialog first); innerText carries CSS uppercase, so match with /i.
const folioText = (page) => page.evaluate(() => {
  const d = [...document.querySelectorAll('[role=dialog]')].pop();
  return (d || document.body).innerText;
}).catch(() => '');
// Keyboard-only doorway: Tab to the folded "Project accounts" band, Enter, then Tab to Draft an invoice.
async function kbdOpenComposer(page, r) {
  r.tabsToAccounts = await tabTo(page, (f) => /project accounts/i.test(f.text), 200);
  await page.keyboard.press('Enter'); await page.waitForTimeout(1200);
  r.tabsToEntry = await tabTo(page, (f) => /^draft an invoice$/i.test(f.text), 60);
  await page.keyboard.press('Enter'); await page.waitForTimeout(3000);
  r.focusOnOpen = await focusOf(page);
}
// The composer's doorway is the accounts band's "Draft an invoice", which sits folded under
// "Project accounts … UNFOLD"; "Bill N uninvoiced" (FF&E) is the fallback doorway.
async function openComposer(page) {
  const draft = page.getByRole('button', { name: /^draft an invoice$/i }).first();
  if (!(await draft.isVisible().catch(() => false))) {
    const unfold = page.getByRole('button', { name: /project accounts/i }).first();
    if (await unfold.count()) { await unfold.click(); await page.waitForTimeout(1200); }
  }
  if (await draft.isVisible().catch(() => false)) await draft.click();
  else await page.getByRole('button', { name: /^bill \d+ uninvoiced$/i }).first().click();
  await page.waitForTimeout(3000);
}
const draftAct = (page) => page.getByRole('button', { name: /draft the invoice/i }).first();
async function heldState(page) {
  return page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /draft the invoice/i.test(x.innerText));
    if (!b) return null;
    const d = b.getAttribute('aria-describedby');
    const desc = d ? document.getElementById(d) : null;
    return { ariaDisabled: b.getAttribute('aria-disabled'), describedby: d, describedText: desc?.innerText.trim() ?? null, describedRole: desc?.getAttribute('role') ?? null };
  });
}
async function cueVisible(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { tag: el.tagName, text: (el.innerText || '').trim().slice(0, 80), cue: el.hasAttribute('data-held-focus-cue'), outline: `${cs.outlineStyle} ${cs.outlineWidth}` };
  });
}
async function run(name, fn) {
  const r = { ok: false, notes: [] };
  try { await fn(r); r.ok = r.fail ? false : true; } catch (e) { r.error = String(e).slice(0, 400); }
  results[name] = r; save(name, r);
  console.log(name, r.ok ? 'OK' : 'FAIL', r.error ?? '', JSON.stringify(r.notes));
}

const S = {
  // Plain member (bob) on Leah's project: "Ask Leah Hartwell to link one" + Copy a note; held Draft lands on the ask line.
  async s2_member_ask(vp = 'desk', keyboard = false) {
    await run(`s2-member-ask-${vp}${keyboard ? '-kbd' : ''}`, async (r) => {
      const { page, iss, remote } = await open(BOB, `/doc/${P.quill}`, vp);
      r.iss = iss; r.remote = remote.length;
      if (keyboard) await kbdOpenComposer(page, r);
      else await openComposer(page);
      const t = await folioText(page);
      r.consequence = (t.match(/[^\n]*has no client yet[^\n]*/i) || [null])[0];
      r.copyNote = /Copy a note/i.test(t); r.linkAct = /link a client/i.test(t.replace(/Ask [^\n]*link one/, ''));
      r.before = await heldState(page);
      r.png = [await shot(page, `s2-member-ask-${vp}${keyboard ? '-kbd' : ''}-a`)];
      if (keyboard) {
        r.tabsToDraft = await tabTo(page, (f) => /draft the invoice/i.test(f.text), 80);
        await page.keyboard.press('Enter');
      } else await draftAct(page).click({ force: true });
      await page.waitForTimeout(800);
      r.focus = await cueVisible(page); r.after = await heldState(page); r.statuses = await statuses(page);
      r.png.push(await shot(page, `s2-member-ask-${vp}${keyboard ? '-kbd' : ''}-b`));
      if (!/Ask Leah Hartwell to link one/i.test(r.consequence ?? '') || !r.copyNote) r.fail = true;
    });
  },
  // Studio owner who is not the lead (Leah on bob's Ashgrove) links a client from the composer.
  async s1_owner_links(vp = 'desk', keyboard = false) {
    await run(`s1-owner-links-${vp}${keyboard ? '-kbd' : ''}`, async (r) => {
      const { page, iss } = await open(LEAH, `/doc/${P.ash}`, vp);
      r.iss = iss;
      await openComposer(page);
      const t = await folioText(page);
      r.consequence = (t.match(/[^\n]*has no client yet[^\n]*/i) || [null])[0];
      r.before = await heldState(page);
      await draftAct(page).click({ force: true }); await page.waitForTimeout(800);
      r.afterPress = await cueVisible(page); r.after = await heldState(page);
      r.png = [await shot(page, `s1-owner-links-${vp}-a-held`)];
      if (keyboard) await page.keyboard.press('Enter'); else await page.getByRole('link', { name: /link a client/i }).last().click();
      await page.waitForTimeout(2000);
      r.urlAfterOpen = page.url();
      r.png.push(await shot(page, `s1-owner-links-${vp}-b-sheet`));
      r.sheetText = (await folioText(page)).slice(0, 400);
      await page.getByText(/^link a household…$/i).last().click(); await page.waitForTimeout(800);
      await page.keyboard.type('Client User'); await page.waitForTimeout(1500);
      r.options = await page.getByRole('option').allInnerTexts().catch(() => []);
      r.png.push(await shot(page, `s1-owner-links-${vp}-c-picker`));
      await page.keyboard.press('Enter'); await page.waitForTimeout(2500);
      r.dbClient = sql(`select coalesce(client_id::text,'NULL') from projects where id='${P.ash}'`);
      await page.keyboard.press('Escape'); await page.waitForTimeout(1200);
      r.focusAfterReturn = await focusOf(page); r.held = await heldState(page);
      r.png.push(await shot(page, `s1-owner-links-${vp}-d-returned`));
      if (r.dbClient === 'NULL') r.fail = true;
    });
  },
  // K8: plain member sees Ask <owner> + Copy a note; owner sees the rate group and Set act.
  async s6_rate_group(email, tag, vp = 'desk') {
    await run(`s6-rate-group-${tag}-${vp}`, async (r) => {
      const { page, iss } = await open(email, `/doc/${P.ash}`, vp);
      r.iss = iss; await openComposer(page);
      const t = await folioText(page);
      r.group = (t.match(/[^\n]*waiting for a rate[^\n]*/i) || [null])[0];
      r.ask = (t.match(/Ask [^\n]*set a rate[^\n]*/i) || [null])[0];
      r.setAct = (t.match(/Set [^\n]*rate/i) || [null])[0];
      r.copyNote = /Copy a note/i.test(t);
      r.png = [await shot(page, `s6-rate-group-${tag}-${vp}`)];
    });
  },
  // K8: owner sets bob's rate on the studio page, then Price them.
  async s6_price_them(email, member, project, tag, rate, vp = 'desk', keyboard = false) {
    await run(`s6-price-them-${tag}-${vp}${keyboard ? '-kbd' : ''}`, async (r) => {
      const { page, iss } = await open(email, `/desk?account=studio`, vp);
      r.iss = iss; await page.waitForTimeout(2500);
      const field = page.getByRole('textbox', { name: new RegExp(`Hourly rate for ${member}`, 'i') }).first();
      r.pendingBefore = sql(`select count(*) from project_time_entries where project_id='${project}' and rate_source='none'`);
      await field.scrollIntoViewIfNeeded(); await field.click(); await field.fill(String(rate));
      await page.keyboard.press('Tab'); await page.waitForTimeout(2500);
      const t = await page.evaluate(() => document.body.innerText);
      r.offer = (t.match(/[^\n]*hours were logged before this rate[^\n]*/) || [null])[0];
      r.png = [await shot(page, `s6-price-them-${tag}-${vp}-a-offer`)];
      if (keyboard) {
        const n = await tabTo(page, (f) => /price them/i.test(f.text), 15); r.tabsToPrice = n; await page.keyboard.press('Enter');
      } else await page.getByRole('button', { name: /price them/i }).click();
      await page.waitForTimeout(2500);
      r.statuses = await statuses(page);
      r.pendingAfter = sql(`select count(*) from project_time_entries where project_id='${project}' and rate_source='none'`);
      r.png.push(await shot(page, `s6-price-them-${tag}-${vp}-b-priced`));
      if (!r.offer || r.pendingAfter !== '0') r.fail = true;
    });
  },
  // K8 as Leah herself (owner of Local Dev Studio + her own workspace): composer → Set Phase One Bob's
  // rate → account page → rate → Price them → back to the composer, whose rate group clears.
  async s6_leah_k8(vp = 'desk', keyboard = true) {
    await run(`s6-leah-k8-${vp}${keyboard ? '-kbd' : ''}`, async (r) => {
      const { page, iss } = await open(LEAH, `/doc/${P.ash}`, vp);
      r.iss = iss;
      if (keyboard) await kbdOpenComposer(page, r); else await openComposer(page);
      r.group = ((await folioText(page)).match(/[^\n]*waiting for a rate[^\n]*/i) || [null])[0];
      r.png = [await shot(page, `s6-leah-k8-${vp}-a-composer`)];
      if (keyboard) { r.tabsToSet = await tabTo(page, (f) => /^set .* rate$/i.test(f.text), 80); await page.keyboard.press('Enter'); }
      else await page.locator('button, a', { hasText: /^set .* rate$/i }).first().click();
      await page.waitForTimeout(6000);
      r.urlAfterSet = page.url(); r.focusAfterSet = await focusOf(page);
      r.png.push(await shot(page, `s6-leah-k8-${vp}-b-account`));
      const field = page.getByRole('textbox', { name: /Hourly rate for Phase One Bob/i }).first();
      r.fieldFound = await field.count();
      r.pendingBefore = sql(`select count(*) from project_time_entries where project_id='${P.ash}' and rate_source='none'`);
      if (keyboard && r.focusAfterSet?.aria && /Phase One Bob/i.test(r.focusAfterSet.aria)) r.landedOnField = true;
      await field.scrollIntoViewIfNeeded(); await field.focus(); await field.fill('150');
      await page.keyboard.press('Tab'); await page.waitForTimeout(3000);
      const t = await page.evaluate(() => document.body.innerText);
      r.offer = (t.match(/[^\n]*logged before this rate[^\n]*/i) || [null])[0];
      r.statusesAfterSave = await statuses(page);
      r.png.push(await shot(page, `s6-leah-k8-${vp}-c-offer`));
      if (keyboard) { r.tabsToPrice = await tabTo(page, (f) => /price them/i.test(f.text), 20); await page.keyboard.press('Enter'); }
      else await page.getByRole('button', { name: /price them/i }).click();
      await page.waitForTimeout(3000);
      r.statuses = await statuses(page);
      r.pendingAfter = sql(`select count(*) from project_time_entries where project_id='${P.ash}' and rate_source='none'`);
      r.priced = sql(`select string_agg(rate_source||':'||coalesce(hourly_rate_cents::text,'?')||':'||coalesce(rated_amount_cents::text,'?'), ',') from project_time_entries where project_id='${P.ash}'`).slice(0, 200);
      r.png.push(await shot(page, `s6-leah-k8-${vp}-d-priced`));
      await page.goto(BASE + `/doc/${P.ash}`, { waitUntil: 'domcontentloaded' }); await settle(page, 9000);
      await openComposer(page);
      const t2 = await folioText(page);
      r.groupAfter = (t2.match(/[^\n]*waiting for a rate[^\n]*/i) || [null])[0];
      r.unbilledAfter = (t2.match(/UNBILLED TIME[\s\S]{0,300}/i) || [null])[0];
      r.png.push(await shot(page, `s6-leah-k8-${vp}-e-composer-cleared`));
      if (!r.offer || r.pendingAfter !== '0' || r.groupAfter) r.fail = true;
    });
  },
  // K8 by the Account page's own doorway (the composer's Set opens it under the composer, see report):
  // Studio settings → switch to Local Dev Studio → bob's rate → Price them → composer group clears.
  async s6_leah_k8_direct(vp = 'desk', keyboard = true, rate = '160') {
    await run(`s6-leah-k8-direct-${vp}${keyboard ? '-kbd' : ''}`, async (r) => {
      const { page, iss } = await open(LEAH, `/desk?account=studio`, vp);
      r.iss = iss;
      for (let i = 0; i < 3 && !/Local Dev Studio\s*\n\s*LOCAL-DEV-STUDIO/i.test(await folioText(page)); i++) {
        await page.locator('button, a', { hasText: /switch/i }).first().click(); await page.waitForTimeout(2500);
      }
      r.studioShown = ((await folioText(page)).match(/STUDIO \d OF \d[^\n]*/i) || [null])[0];
      const field = page.getByRole('textbox', { name: /Hourly rate for Phase One Bob/i }).first();
      await field.scrollIntoViewIfNeeded();
      r.png = [await shot(page, `s6-leah-k8-direct-${vp}-a-rates`)];
      r.pendingBefore = sql(`select count(*) from project_time_entries where project_id='${P.ash}' and rate_source='none'`);
      if (keyboard) { await field.focus(); await page.keyboard.press('Meta+a'); await page.keyboard.type(rate); }
      else await field.fill(rate);
      await page.keyboard.press('Tab'); await page.waitForTimeout(3000);
      const t = await folioText(page);
      r.offer = (t.match(/[^\n]*logged before this rate[^\n]*/i) || [null])[0];
      r.focusAfterSave = await focusOf(page);
      r.png.push(await shot(page, `s6-leah-k8-direct-${vp}-b-offer`));
      if (keyboard) {
        r.tabsToPrice = await tabTo(page, (f) => /price them/i.test(f.text), 200);
        if (r.tabsToPrice < 0) r.shiftTabsToPrice = await tabTo(page, (f) => /price them/i.test(f.text), 25, 'Shift+Tab');
        await page.keyboard.press('Enter');
      } else await page.getByRole('button', { name: /price them/i }).click();
      await page.waitForTimeout(3000);
      r.statuses = await statuses(page);
      r.after = ((await folioText(page)).match(/[^\n]*(Priced the hours|logged before this rate|could not|can.t)[^\n]*/gi) || []).slice(0, 4);
      r.pendingAfter = sql(`select count(*) from project_time_entries where project_id='${P.ash}' and rate_source='none'`);
      r.priced = sql(`select string_agg(rate_source||':'||coalesce(hourly_rate_cents::text,'?')||':'||coalesce(rated_amount_cents::text,'?'), ',') from project_time_entries where project_id='${P.ash}'`);
      r.png.push(await shot(page, `s6-leah-k8-direct-${vp}-c-priced`));
      await page.goto(BASE + `/doc/${P.ash}`, { waitUntil: 'domcontentloaded' }); await settle(page, 9000);
      await openComposer(page);
      const t2 = await folioText(page);
      r.groupAfter = (t2.match(/[^\n]*waiting for a rate[^\n]*/i) || [null])[0];
      r.unbilledAfter = (t2.match(/UNBILLED TIME[\s\S]{0,260}/i) || [null])[0];
      r.png.push(await shot(page, `s6-leah-k8-direct-${vp}-d-composer`));
      if (!r.offer || r.pendingAfter !== '0' || r.groupAfter) r.fail = true;
    });
  },
  // K5 header: a plain member sees the Message act's "Link a client" repair; what does it open?
  async s2_member_header(vp = 'desk') {
    await run(`s2-member-header-${vp}`, async (r) => {
      const { page } = await open(BOB, `/doc/${P.quill}`, vp);
      const act = page.getByRole('button', { name: /^link a client$/i }).first();
      r.headerAct = await act.count();
      if (!r.headerAct) return;
      await act.click(); await page.waitForTimeout(2500);
      r.after = (await folioText(page)).slice(0, 700); r.url = page.url();
      r.png = [await shot(page, `s2-member-header-${vp}`)];
    });
  },
  // K9 picker: two-studio designer vs one-studio designer.
  async s3_picker(email, tag, vp = 'desk', create = null) {
    await run(`s3-picker-${tag}-${vp}`, async (r) => {
      const { page, iss } = await open(email, `/desk`, vp);
      r.iss = iss;
      await page.keyboard.press('Meta+k'); await page.waitForTimeout(800);
      await page.keyboard.type('Create a project file'); await page.waitForTimeout(800); await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
      const studio = page.getByRole('combobox', { name: /studio/i });
      r.picker = await studio.count();
      r.options = r.picker ? await studio.locator('option').allInnerTexts() : [];
      r.png = [await shot(page, `s3-picker-${tag}-${vp}`)];
      if (create) {
        await page.getByRole('textbox', { name: /project title/i }).fill(create.title);
        if (r.picker) await studio.selectOption({ label: create.studio });
        await page.getByRole('button', { name: /^open the project|^open project|^create/i }).last().click();
        await page.waitForTimeout(3500);
        r.db = sql(`select p.name||'|'||coalesce(o.name,'NULL') from projects p left join organizations o on o.id=p.studio_id where p.name='${create.title}'`);
        r.png.push(await shot(page, `s3-picker-${tag}-${vp}-created`));
      }
    });
  },
  // K12: owner names the studio on an employee's NULL-studio project via the inline confirm.
  async s5_name_studio(vp = 'desk', keyboard = false) {
    await run(`s5-name-studio-${vp}${keyboard ? '-kbd' : ''}`, async (r) => {
      const { page, iss } = await open(LEAH, `/doc/${P.linden}`, vp);
      r.iss = iss; await openComposer(page);
      const t = await folioText(page);
      r.consequence = (t.match(/[^\n]*tied to[^\n]*/) || [null])[0];
      r.png = [await shot(page, `s5-name-studio-${vp}-a`)];
      await page.getByRole('button', { name: /^name studio$/i }).click(); await page.waitForTimeout(700);
      r.confirm = (await folioText(page)).match(/Name [^\n]*can.t be undone\./)?.[0] ?? null;
      r.focusOnConfirm = await focusOf(page);
      r.png.push(await shot(page, `s5-name-studio-${vp}-b-confirm`));
      if (keyboard) await page.keyboard.press('Enter'); else await page.locator('[role=group][aria-label="Confirm naming the studio"] button').first().click();
      await page.waitForTimeout(2500);
      r.db = sql(`select coalesce(o.name,'NULL') from projects p left join organizations o on o.id=p.studio_id where p.id='${P.linden}'`);
      r.statuses = await statuses(page); r.after = (await folioText(page)).slice(0, 600);
      r.png.push(await shot(page, `s5-name-studio-${vp}-c-named`));
    });
  },
  // Solo owner on a legacy NULL-studio project: the support path, not Name studio (R173 / decision #3).
  async s5_solo_legacy(vp = 'desk') {
    await run(`s5-solo-legacy-${vp}`, async (r) => {
      const { page, iss } = await open(ALICE, `/doc/${P.oldMill}`, vp);
      r.iss = iss; await openComposer(page);
      const t = await folioText(page);
      r.consequence = (t.match(/[^\n]*(tied to|studio)[^\n]*/) || [null])[0];
      r.support = /hello@patina\.cloud/.test(t); r.nameStudio = /Name studio/i.test(t); r.copyAddress = /Copy the address/i.test(t);
      r.png = [await shot(page, `s5-solo-legacy-${vp}`)];
    });
  },
  // K6 band: no-client row rises once money exists; cold-load jump check on Harrow (one hour) vs Wren (no money).
  async s7_band(project, tag, vp = 'desk') {
    await run(`s7-band-${tag}-${vp}`, async (r) => {
      const s = await context(browser, LEAH, vp);
      const page = await s.ctx.newPage();
      const frames = [];
      await page.goto(BASE + `/doc/${project}`, { waitUntil: 'commit', timeout: 180000 });
      for (let i = 0; i < 100; i++) {
        const snap = await page.evaluate(() => (document.body?.innerText.match(/[^\n]*(No client linked|Link a client before you bill this job|Nothing ordered yet|Release the next room|Open the pieces|Check what.s arriving|All open|\+\d+ more)[^\n]*/gi) || []).join(' | ')).catch(() => '');
        if (!frames.length || frames[frames.length - 1].snap !== snap) {
          frames.push({ t: i * 250, snap });
          if (frames.length <= 4 && snap) await shot(page, `s7-band-${tag}-${vp}-load${frames.length}`);
        }
        await page.waitForTimeout(250);
      }
      r.frames = frames;
      const more = page.locator('button, a', { hasText: /^\+\d+ more$|^all open · \d+$/i }).first();
      if (await more.count()) { await more.click(); await page.waitForTimeout(2500); }
      r.setup = await page.evaluate(() => (([...document.querySelectorAll('[role=dialog]')].pop() || document.body).innerText.match(/[^\n]*(client|budget|target|studio)[^\n]*/gi) || []).slice(0, 12));
      r.png = [await shot(page, `s7-band-${tag}-${vp}-setup`)];
    });
  },
  // SQ-1030 lows on the composer at 390/1400: TOTAL inside panel, scrim to the bottom, dedupe, ?sheet consumed, focus cue.
  async s9_lows(vp) {
    await run(`s9-lows-${vp}`, async (r) => {
      const { page } = await open(LEAH, `/doc/${P.quill}`, vp);
      await openComposer(page);
      r.geometry = await page.evaluate(() => {
        const frame = [...document.querySelectorAll('[role=dialog]')].pop();
        const fr = frame?.getBoundingClientRect();
        const total = [...frame.querySelectorAll('*')].filter((n) => /^total/i.test(n.innerText?.trim() ?? '') && n.children.length < 4).pop();
        const tr = total?.getBoundingClientRect();
        const bd = document.querySelector('.paper-folio-backdrop')?.getBoundingClientRect();
        const xs = [...frame.querySelectorAll('button')].filter((b) => /remove/i.test(b.getAttribute('aria-label') ?? '')).map((b) => Math.round(b.getBoundingClientRect().right));
        return { frameLeft: fr && Math.round(fr.left), frameRight: fr && Math.round(fr.right), frameScroll: frame && [frame.scrollWidth, frame.clientWidth], totalRight: tr && Math.round(tr.right), backdrop: bd && [Math.round(bd.top), Math.round(bd.bottom)], vh: innerHeight, docScroll: document.documentElement.scrollWidth, removeRights: xs };
      });
      r.png = [await shot(page, `s9-lows-${vp}-composer`)];
    });
  },
};

const want = process.argv.slice(2);
const plan = [
  ['band', () => S.s7_band(P.ash, 'ash-hours', 'desk')],
  ['band', () => S.s7_band(P.wren, 'wren-nomoney', 'desk')],
  ['band', () => S.s7_band(P.ash, 'ash-hours', 'phone')],
  ['member', () => S.s2_member_ask('desk')],
  ['member', () => S.s2_member_ask('phone')],
  ['member', () => S.s2_member_ask('desk', true)],
  ['rate', () => S.s6_rate_group(BOB, 'member', 'desk')],
  ['rate', () => S.s6_rate_group(LEAH, 'owner', 'desk')],
  ['rate', () => S.s6_rate_group(LEAH, 'owner', 'phone')],
  ['header', () => S.s2_member_header('desk')],
  ['k8', () => S.s6_leah_k8('desk', true)],
  ['k8d', () => S.s6_leah_k8_direct('desk', true, '170')],
  ['price', () => S.s6_rate_group(LEAH, 'owner-after', 'desk')],
  ['solo', () => S.s5_solo_legacy('desk')],
  ['solo', () => S.s6_price_them(ALICE, 'Phase One Alice', P.fern, 'alice-self', 120, 'phone')],
  ['picker', () => S.s3_picker(LEAH, 'two-studio', 'desk')],
  ['picker', () => S.s3_picker(LEAH, 'two-studio', 'phone')],
  ['picker', () => S.s3_picker(BOB, 'one-studio', 'desk')],
  ['name', () => S.s5_name_studio('desk', true)],
  ['create', () => S.s3_picker(LEAH, 'two-studio-create', 'desk', { title: 'Quarry Shed', studio: 'Local Dev Studio' })],
  ['create', () => S.s3_picker(BOB, 'one-studio-create', 'desk', { title: 'Bramble Loft' })],
  ['band0', async () => S.s7_band(sql("select id from projects where name='Quarry Shed'"), 'quarry-nomoney', 'desk')],
  ['lows', () => S.s9_lows('phone')],
  ['lows', () => S.s9_lows('desk')],
  ['link', () => S.s1_owner_links('desk')],
];
for (const [group, fn] of plan) if (!want.length || want.includes(group)) await fn();
save('summary-' + (want.join('-') || 'all'), results);
await browser.close();
