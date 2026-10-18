// SQ-1055 R3 site registry: how to reach each held act, what it should light, how to fix one hold live.
const LEAH = 'designer@patina.dev';
const tx = (page, re) => page.locator('button,a,[role=button]', { hasText: re }).filter({ visible: true }).first();
const dlg = (page) => page.locator('[role=dialog]').filter({ visible: true }).last();
const inFutureISO = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
const typeDate = async (loc, iso) => { const [y, m, d] = iso.split('-'); await loc.click(); await loc.pressSequentially(`${m}${d}${y}`); };
const ringCount = async (c) => (await c.spot()).rings?.length ?? 0;
const bar = (c, re) => c.page.locator('[data-hold-spotlight-bar] button', { hasText: re }).first();
const CHEN = '01801bc2-983f-4dcb-971f-552667fe6316', OLSEN = 'dcb624f6-7022-4158-a7ac-8945c4bc892f', OKONKWO = 'd0e00000-0000-0000-0000-00000000000a';
// Clear a pre-filled field (select-all + delete) so its hold appears.
const clear = async (loc) => { await loc.click(); await loc.press('ControlOrMeta+a'); await loc.press('Backspace'); };

// Generic: open, press, (kbd: tab trap), Esc check, re-press, optional live fix.
async function standard(c, { open, act, windows, sheetRe, actRe, targets = [], fix, afterFix = 0 }) {
  await open(c);
  await c.snap(c.page, 'reason-visible');
  await c.press(act(c), 'held', windows, targets);
  if (c.kbd) await c.tabTrap('held');
  await c.esc('held', sheetRe, actRe);
  if (fix) {
    await c.press(act(c), 'held-again', windows, targets);
    await fix(c);
    const left = await ringCount(c);
    c.check(`fix: windows drop to ${afterFix}, live`, left === afterFix);
    c.note(`after fix: ${left} window(s)`);
    await c.snap(c.page, 'after-fix');
  }
}

export const SITES = {
  // Shard 1 · set-aside-sheet.tsx — Desk "UNTIL…" → SET ASIDE held on day + reason (2 holds).
  's1-setaside': {
    user: LEAH,
    async run(c) {
      await c.land('/desk');
      await tx(c.page, /^until/i).click();
      await c.page.waitForTimeout(1800);
      const act = tx(dlg(c.page), /^set aside$/i);
      await c.snap(c.page, 'sheet-reason-visible');
      await c.press(act, 'held', 2);
      if (c.kbd) { await c.tabTrap('held'); }
      await c.esc('held', /./, /set aside/i);
      await c.press(act, 'held-again', 2);
      // Fix the reason from inside its window (keyboard run Tabs to it); the count must drop live.
      // At 390 one window shows at a time: step to the second with the bar's Next first.
      if (c.vp === 'phone') { await bar(c, /^next$/i).click(); await c.page.waitForTimeout(900); }
      await c.fixByTyping(dlg(c.page).getByLabel(/waiting on/i).first(), 'the maker confirming the ship date');
      const left = await ringCount(c);
      c.check('fix reason: windows drop to 1, live', left === 1);
      c.note(`after reason fix: ${left} window(s)`);
      await c.snap(c.page, 'after-fix');
    },
  },
  // Shard 1 · act-draft.tsx — Desk "FOLLOW UP" (proposal follow-up) → clear Subject + message → 2 holds.
  's1-chase': {
    user: LEAH,
    run: (c) => standard(c, {
      async open(c) {
        await c.land('/desk');
        // Seed reach: the Desk's PO chase line ("Follow up with the maker") navigates to the project, so the
        // walk uses the proposal follow-up ActDraft, which has only a Note → its body hold alone.
        await tx(c.page, /^follow up$/i).click(); await c.page.waitForTimeout(2000);
        const subj = dlg(c.page).locator('input[type=text],input:not([type])').filter({ visible: true });
        if (await subj.count()) await clear(subj.first()); else c.note('no Subject field on this sheet');
        await clear(dlg(c.page).locator('textarea').first());
        await c.page.waitForTimeout(600);
      },
      act: (c) => dlg(c.page).locator('button', { hasText: /^(send|save)/i }).last(),
      windows: 1, sheetRe: /./, actRe: /send|save/i,
      async fix(c) { await c.fixByTyping(dlg(c.page).locator('textarea').first(), 'Checking in on the proposal.'); },
      afterFix: 0,
    }),
  },
  // Shard 1 · record-payment-sheet.tsx — Desk "RECORD PAYMENT" (Chen, WS-188) → clear the amount → holdFix window.
  's1-payment': {
    user: LEAH,
    run: (c) => standard(c, {
      async open(c) {
        await c.land('/desk');
        await tx(c.page, /^record payment$/i).click(); await c.page.waitForTimeout(2000);
        await clear(dlg(c.page).locator('input[inputmode=decimal],input[inputmode=numeric],input[type=text]').first());
        await c.page.waitForTimeout(600);
      },
      act: (c) => dlg(c.page).locator('button', { hasText: /^record/i }).last(),
      windows: 1, sheetRe: /./, actRe: /record/i,
      async fix(c) { await c.fixByTyping(dlg(c.page).locator('input[inputmode=decimal],input[inputmode=numeric],input[type=text]').first(), '100'); },
      afterFix: 0,
    }),
  },
  // Shard 3 · letterhead-instruments.tsx — Olsen (no client): MESSAGE THE CLIENT held, holdFix = Link a client. Paper frame.
  's3-letterhead': {
    user: LEAH,
    run: (c) => standard(c, {
      async open(c) { await c.land(`/doc/${OLSEN}`); },
      act: (c) => tx(c.page, /^message the client$/i),
      windows: 1, sheetRe: null, actRe: /message the client/i,
    }),
  },
  // Shard 5 · household-band.tsx — Okonkwo call sheet → OPEN A HOUSEHOLD / Add a household member → "Add to the household" held (no person).
  's5-household': {
    user: LEAH,
    run: (c) => standard(c, {
      async open(c) {
        await c.land(`/doc/${OKONKWO}?sheet=call`);
        const add = c.page.locator('[data-add-household-member]').filter({ visible: true }).first();
        if (await add.count()) await add.click(); else await tx(c.page, /^open a household$/i).click();
        await c.page.waitForTimeout(1800);
        if (!(await tx(c.page, /^add to the household$/i).count())) { await tx(c.page, /add a household member/i).click().catch(() => {}); await c.page.waitForTimeout(1500); }
      },
      act: (c) => tx(c.page, /^add to the household$/i),
      windows: 1, sheetRe: /project directory/i, actRe: /add to the household/i,
    }),
  },
  // Shard 5 · notice-log.tsx — Okonkwo call sheet → OPEN SITE ACCESS DETAILS → LOG WHO WAS TOLD → "Save this note" held (nobody picked), holdFix = picker.
  's5-noticelog': {
    user: LEAH,
    run: (c) => standard(c, {
      async open(c) {
        await c.land(`/doc/${OKONKWO}?sheet=call`);
        await tx(c.page, /^open site access details$/i).click(); await c.page.waitForTimeout(2000);
        await tx(c.page, /log who was told/i).click(); await c.page.waitForTimeout(1800);
      },
      act: (c) => tx(c.page, /^save this note$/i),
      windows: 1, sheetRe: /site access/i, actRe: /save this note/i,
      async fix(c) {
        const box = c.page.getByRole('checkbox', { name: /sam rowe/i }).first();
        if (c.kbd) { await box.focus(); await c.page.keyboard.press('Space'); } else await box.check({ force: true });
        await c.page.waitForTimeout(1200);
      },
      afterFix: 0,
    }),
  },
  // Default one-window (SQ-1048) · person-profile.tsx — /people → Adaeze Okonkwo → SEND TEXT MESSAGE held (no consent). RoomShell frame.
  'd-sendtext': {
    user: LEAH,
    run: (c) => standard(c, {
      async open(c) { await c.land('/people'); await tx(c.page, /^adaeze okonkwo$/i).click(); await c.page.waitForTimeout(2500); },
      act: (c) => tx(c.page, /^send text message$/i),
      windows: 1, sheetRe: null, actRe: /send text message/i,
    }),
  },
  // Default one-window · reach-access.tsx — same card, MINT ACCESS held.
  'd-mintaccess': {
    user: LEAH,
    run: (c) => standard(c, {
      async open(c) { await c.land('/people'); await tx(c.page, /^adaeze okonkwo$/i).click(); await c.page.waitForTimeout(2500); },
      act: (c) => tx(c.page, /^mint access$/i),
      windows: 1, sheetRe: null, actRe: /mint access/i,
    }),
  },
  // Default one-window · the paper — Olsen → Pieces: PREPARE PURCHASING AUTHORIZATION held ("No selections are ready…").
  'd-purchauth': {
    user: LEAH,
    run: (c) => standard(c, {
      // The section rail is hidden at 390; the act is reached by scrolling the paper there.
      async open(c) { await c.land(`/doc/${OLSEN}`); await tx(c.page, /^pieces/i).click({ timeout: 5000 }).catch(() => c.note('no Pieces rail link (phone)')); await c.page.waitForTimeout(2000); },
      act: (c) => tx(c.page, /^prepare purchasing authorization$/i),
      windows: 1, sheetRe: null, actRe: /purchasing authorization/i,
    }),
  },
  // Shard 4 · paperwork-link-act.tsx — /people → COMPANIES → Marrow & Sons → Mint a paperwork link → "a day I name" → Open the door held (holdFix = day).
  's4-paperwork': {
    user: LEAH,
    run: (c) => standard(c, {
      async open(c) {
        await c.land('/people');
        await tx(c.page, /^companies$/i).click(); await c.page.waitForTimeout(1500);
        await tx(c.page, /^marrow & sons$/i).click(); await c.page.waitForTimeout(2500);
        await tx(c.page, /mint a paperwork link/i).click(); await c.page.waitForTimeout(1500);
        await c.page.getByLabel(/a day i name/i).first().check({ force: true }); await c.page.waitForTimeout(800);
      },
      act: (c) => tx(c.page, /^open the door$/i),
      windows: 1, sheetRe: null, actRe: /open the door/i,
    }),
  },
  // Shard 3 · send-sheet.tsx — Tanaka proposal → EMAIL DELIVERY → a bad CC → "Send proposal" held (cc hold window).
  's3-send': {
    user: LEAH,
    run: (c) => standard(c, {
      async open(c) {
        await c.land('/doc/f1900000-0000-4000-8000-000000000053');
        await tx(c.page, /^email delivery$/i).click(); await c.page.waitForTimeout(2000);
        const cc = dlg(c.page).getByLabel(/^cc/i).first();
        await cc.click(); await c.page.keyboard.type('not-an-address'); await c.page.keyboard.press('Tab'); await c.page.waitForTimeout(800);
      },
      act: (c) => dlg(c.page).locator('button', { hasText: /^send proposal$/i }).last(),
      windows: 1, sheetRe: /send proposal/i, actRe: /send proposal/i,
    }),
  },
  // Shard 2 · agreement-composer.tsx — Varga House design-services agreement in the drafting room (RoomShell frame).
  's2-agreement': {
    user: LEAH,
    run: (c) => standard(c, {
      async open(c) { await c.land('/drafting/f1900000-0000-4000-8000-0000000000a2'); await c.page.waitForTimeout(3000); },
      act: (c) => tx(c.page, /^send the (agreement|proposal)/i),
      windows: 1, sheetRe: null, actRe: /send the/i,
    }),
  },
  // Shard 2 · ack-check.tsx — Purchase orders register → first "no ack" PO → Log order acknowledgment → two bad numbers → 2 holds.
  's2-ack': {
    user: LEAH,
    run: (c) => standard(c, {
      async open(c) {
        await c.land('/desk');
        await tx(c.page, /^purchase orders/i).click(); await c.page.waitForTimeout(2500);
        await c.page.locator('[role=dialog] tr, [role=dialog] [role=row]', { hasText: /no ack|not acknowledged|awaiting ack/i }).filter({ visible: true }).first().click().catch(() => {});
        await c.page.waitForTimeout(2500);
        await tx(c.page, /log order acknowledg/i).click(); await c.page.waitForTimeout(1800);
        const inputs = c.page.locator('[data-spotlight-frame] input[inputmode=decimal], [data-spotlight-frame] input[inputmode=numeric]').filter({ visible: true });
        for (let i = 0; i < 2; i++) { const el = inputs.nth(i); await el.click(); await el.press('ControlOrMeta+a'); await c.page.keyboard.type('abc'); }
        await c.page.keyboard.press('Tab'); await c.page.waitForTimeout(800);
      },
      act: (c) => tx(c.page, /^(everything agrees|log it)/i),
      windows: 2, sheetRe: /./, actRe: /log it|everything agrees/i,
    }),
  },
  // Desk tour (SQ-1054) — /desk?tour=desk-walkthrough, six steps in teach mode.
  'tour': {
    user: LEAH,
    async run(c) {
      await c.land('/desk?tour=desk-walkthrough');
      await c.page.waitForTimeout(1500);
      for (let i = 1; i <= 6; i++) {
        const sp = await c.spot();
        const zone = await c.focusZone();
        c.check(`step ${i}: spotlight open`, sp.open);
        if (!sp.open) { await c.snap(c.page, `step-${i}-NOT-OPEN`); break; }
        c.check(`step ${i}: bar says Step ${i} of 6`, new RegExp(`step\\s*${i}\\s*of\\s*6`, 'i').test(sp.bar?.text ?? ''));
        c.check(`step ${i}: no shadow / fade`, sp.shadowsOrFades.length === 0);
        c.check(`step ${i}: bar on screen`, !!sp.bar?.inViewport);
        c.check(`step ${i}: focus in the bar or a window`, ['bar', 'window'].includes(zone));
        if (c.vp === 'phone' && sp.bar) c.check(`step ${i}: bar docks to the bottom`, sp.bar.rect[1] + sp.bar.rect[3] >= 844 * 0.6);
        c.note(`step ${i}: windows=${sp.rings.length} bar="${(sp.bar?.text ?? '').slice(0, 70)}" status="${(sp.status[0] ?? '').slice(0, 70)}"`);
        if (i === 1 || i === 4 || i === 6) { const a = await (await import('./spot-lib.mjs')).axe(c.page, `step-${i}`); c.note(`axe step ${i}: ${a.count} [${a.violations.map((v) => v.id).join(',')}]`); }
        await c.snap(c.page, `step-${i}`);
        if (i === 2 && c.kbd) await c.tabTrap(`step ${i}`);
        if (i < 6) {
          if (c.kbd) { await c.page.locator('[data-spotlight-primary]').focus(); await c.page.keyboard.press('Enter'); }
          else await bar(c, /^next$/i).click();
          await c.page.waitForTimeout(1300);
        }
      }
      // Esc ends the tour (no sheet under it); the desk stays.
      await c.page.keyboard.press('Escape'); await c.page.waitForTimeout(900);
      c.check('Esc closes the tour spotlight', !(await c.spot()).open);
      c.check('desk still there after Esc', /good (morning|afternoon|evening)/i.test(await c.page.evaluate(() => document.body.innerText)));
    },
  },
};
