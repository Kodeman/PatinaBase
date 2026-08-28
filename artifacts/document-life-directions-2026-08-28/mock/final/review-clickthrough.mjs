/* Adversarial review click-through. Throwaway probe; not part of the deliverable.
   node ../../artifacts/.../mock/final/review-clickthrough.mjs   (run from apps/designer-portal) */
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = 'file://' + path.join(here, 'index.html');
const OUT = path.join(here, 'review-shots');
fs.mkdirSync(OUT, { recursive: true });

const log = [];
const say = (...a) => { const s = a.join(' '); log.push(s); console.log(s); };

/* ---- contrast helpers ---- */
const lin = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const lum = ([r, g, b]) => 0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const parse = s => { const m = String(s).match(/-?[\d.]+/g); return m ? m.slice(0, 3).map(Number) : null; };
const over = (fg, bg, alpha) => fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1560, height: 1000 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();

  /* (11) external requests */
  const external = [];
  page.on('request', r => { if (!r.url().startsWith('file:')) external.push(r.url()); });
  const consoleErrs = [];
  page.on('pageerror', e => consoleErrs.push(String(e)));

  await page.goto(FILE);
  await page.waitForFunction(() => window.__mockReady === true);
  await page.waitForTimeout(700);

  /* ============ 1. DESK ============ */
  say('\n=== (1) DESK — roster lines and stage groups ===');
  const desk = await page.evaluate(() => {
    const s = document.getElementById('screen-desk');
    const groups = [...s.querySelectorAll('.stage-group')].map(g => ({
      head: g.querySelector('.stage-head').textContent.trim(),
      lines: g.querySelectorAll('.job-line').length,
      bg: getComputedStyle(g).backgroundColor,
      tab: getComputedStyle(g.querySelector('.stage-head')).backgroundColor,
      h: Math.round(g.getBoundingClientRect().height),
    }));
    return {
      totalLines: s.querySelectorAll('.job-line').length,
      rosterHead: s.querySelector('.sect-head').textContent.trim(),
      groups,
    };
  });
  say('roster head :', desk.rosterHead);
  say('job lines   :', desk.totalLines);
  say('groups      :', desk.groups.length);
  desk.groups.forEach(g => say(`  ${g.head.padEnd(16)} lines=${g.lines}  h=${g.h}px  stock=${g.bg}  tab=${g.tab}`));
  await page.screenshot({ path: path.join(OUT, '01-desk.png') });

  /* ============ 2. OPEN THE DOCUMENT ============ */
  say('\n=== (2) DESK -> DOCUMENT (Vandersteen) ===');
  await page.click('button.job-name[data-open-doc]');
  const mid = await page.evaluate(() => {
    const shell = document.querySelector('#screen-doc .doc-shell');
    const anims = shell.getAnimations().map(a => ({
      name: a.animationName || (a.effect && a.effect.getTiming && 'transition'),
      dur: a.effect.getTiming().duration, state: a.playState,
    }));
    const cs = getComputedStyle(shell);
    return { anims, opacity: cs.opacity, transform: cs.transform, animName: cs.animationName, animDur: cs.animationDuration };
  });
  say('doc-shell running animations:', JSON.stringify(mid.anims));
  say('mid-transition opacity/transform:', mid.opacity, '/', mid.transform);
  say('computed animation:', mid.animName, mid.animDur);
  await page.waitForTimeout(600);
  const docState = await page.evaluate(() => {
    const col = document.getElementById('doc-col');
    const band = document.querySelector('#screen-doc .band');
    return {
      screenOn: document.getElementById('screen-doc').classList.contains('is-on'),
      sheetBg: getComputedStyle(col).backgroundColor,
      bandBg: getComputedStyle(band).backgroundColor,
      bandCount: document.querySelectorAll('#screen-doc .band').length,
      bandRect: (r => ({ x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height) }))(band.getBoundingClientRect()),
      colRect: (r => ({ x: Math.round(r.x), w: Math.round(r.width) }))(col.getBoundingClientRect()),
      thumbs: [...document.querySelectorAll('#screen-doc .thumb')].map(t => ({
        linked: !t.classList.contains('is-unlinked'),
        size: Math.round(t.getBoundingClientRect().width) + 'x' + Math.round(t.getBoundingClientRect().height),
        img: getComputedStyle(t).backgroundImage.slice(0, 24),
      })),
      stamps: [...document.querySelectorAll('#screen-doc .stamp')].map(s => ({
        word: s.textContent.trim(), inked: s.classList.contains('is-inked'),
        fill: getComputedStyle(s.querySelector('.stamp-fill')).backgroundColor,
        ink: getComputedStyle(s).color,
        scale: getComputedStyle(s.querySelector('.stamp-fill')).transform,
      })),
      spineBg: getComputedStyle(document.querySelector('#screen-doc .spine')).backgroundColor,
      marginBg: getComputedStyle(document.querySelector('#screen-doc .margin')).backgroundColor,
    };
  });
  say('document on          :', docState.screenOn);
  say('sheet background     :', docState.sheetBg, '(expect rgb(252,250,246) = #FCFAF6 -- ONE untinted sheet)');
  say('letterhead block bg  :', docState.bandCount, docState.bandBg, '(expect rgba(0, 0, 0, 0) -- no charcoal band)', 'rect', JSON.stringify(docState.bandRect), 'col', JSON.stringify(docState.colRect));
  say('spine / margin rail  :', docState.spineBg, '/', docState.marginBg);
  say('thumbs               :', docState.thumbs.length, 'total —', docState.thumbs.filter(t => t.linked).length, 'linked,', docState.thumbs.filter(t => !t.linked).length, 'slots');
  docState.thumbs.forEach((t, i) => say(`  thumb ${i}: ${t.size} linked=${t.linked} ${t.img}`));
  say('stamps:');
  docState.stamps.forEach(s => say(`  "${s.word}" inked=${s.inked} ink=${s.ink} fill=${s.fill} fillTransform=${s.scale}`));
  await page.screenshot({ path: path.join(OUT, '02-document.png') });

  /* ============ 3. FOLD / UNFOLD ============ */
  say('\n=== (3) UNFOLD Client approvals / FOLD Schedule ===');
  const foldH = id => page.evaluate(i => {
    const b = document.querySelector('#' + i + ' .fold-body');
    return { h: Math.round(b.getBoundingClientRect().height), rows: getComputedStyle(b).gridTemplateRows, op: getComputedStyle(b).opacity };
  }, id);
  const foldWord = id => page.evaluate(i => document.querySelector('#' + i + ' [data-fold-word]').textContent.trim(), id);
  const foldFont = id => page.evaluate(i => { const e = document.querySelector('#' + i + ' [data-fold-word]'); const c = getComputedStyle(e); return c.fontFamily.split(',')[0] + ' / ' + c.textTransform + ' / ' + c.fontSize; }, id);
  say('approvals before:', JSON.stringify(await foldH('fold-approvals')), 'word=', await foldWord('fold-approvals'), 'type=', await foldFont('fold-approvals'));
  await page.click('#fold-approvals .seam');
  await page.waitForTimeout(450);
  say('approvals after :', JSON.stringify(await foldH('fold-approvals')), 'word=', await foldWord('fold-approvals'),
    'aria=', await page.getAttribute('#fold-approvals .seam', 'aria-expanded'));
  say('schedule before :', JSON.stringify(await foldH('fold-schedule')), 'word=', await foldWord('fold-schedule'), 'type=', await foldFont('fold-schedule'));
  await page.click('#fold-schedule [data-fold]');
  await page.waitForTimeout(450);
  say('schedule after  :', JSON.stringify(await foldH('fold-schedule')), 'word=', await foldWord('fold-schedule'),
    'aria=', await page.getAttribute('#fold-schedule [data-fold]', 'aria-expanded'));
  /* restore */
  await page.click('#fold-schedule [data-fold]'); await page.waitForTimeout(400);

  /* ============ 4. MARGIN CHIP ============ */
  say('\n=== (4) margin chip -> anchored line ===');
  for (const chip of ['money', 'time']) {
    await page.click(`.margin-chip[data-chip="${chip}"]`);
    await page.waitForTimeout(400);
    const r = await page.evaluate(c => {
      const ch = document.querySelector(`.margin-chip[data-chip="${c}"]`);
      const t = document.getElementById(ch.getAttribute('data-target'));
      return {
        chipBg: getComputedStyle(ch).backgroundColor, chipActive: ch.classList.contains('is-active'),
        target: ch.getAttribute('data-target'), targetBg: getComputedStyle(t).backgroundColor,
        anchored: t.classList.contains('is-anchored'), trans: getComputedStyle(t).transitionProperty,
        inView: (b => b.top > 0 && b.bottom < window.innerHeight)(t.getBoundingClientRect()),
      };
    }, chip);
    say(`chip "${chip}" ->`, JSON.stringify(r));
  }
  await page.screenshot({ path: path.join(OUT, '03-chip-anchored.png') });

  /* ============ 5. PUT DOWN ============ */
  say('\n=== (5) PUT DOWN -> desk ===');
  await page.click('[data-put-down]');
  await page.waitForTimeout(60);
  /* R16: the roster must NOT re-settle on a PUT DOWN */
  const replay = await page.evaluate(() => ({
    running: [...document.querySelectorAll('#screen-desk .job-line')]
      .flatMap(l => l.getAnimations().map(a => (a.animationName || 'transition') + ':' + a.playState)),
    reInked: [...document.querySelectorAll('#screen-doc .stamp-fill')]
      .flatMap(s => s.getAnimations().map(a => a.playState)),
  }));
  say('roster animations running right after PUT DOWN:', replay.running.length, JSON.stringify(replay.running.slice(0, 4)));
  await page.waitForTimeout(500);
  say('desk on:', await page.evaluate(() => document.getElementById('screen-desk').classList.contains('is-on')));
  /* and re-entering the document must not re-ink the stamps */
  await page.click('button.job-name[data-open-doc]'); await page.waitForTimeout(60);
  const reInk = await page.evaluate(() => [...document.querySelectorAll('#screen-doc .stamp-fill')]
    .flatMap(s => s.getAnimations().map(a => (a.transitionProperty || a.animationName) + ':' + a.playState)));
  say('stamp-fill animations running on RE-ENTRY to the document:', reInk.length, JSON.stringify(reInk.slice(0, 4)));
  await page.click('[data-put-down]'); await page.waitForTimeout(400);

  /* ============ 6. DRAWER LEDGERS -> ORDERS SHEET -> ESC ============ */
  say('\n=== (6) Ledgers ^ -> Orders sheet -> Esc ===');
  await page.click('#screen-desk .drawer [data-open-sheet]');
  await page.waitForTimeout(500);
  const sheet = await page.evaluate(() => {
    const w = document.getElementById('ledger');
    const s = w.querySelector('.ledger-sheet');
    return {
      open: w.classList.contains('is-open'), aria: w.getAttribute('aria-hidden'),
      transform: getComputedStyle(s).transform, opacity: getComputedStyle(s).opacity,
      focusInside: s.contains(document.activeElement), active: document.activeElement.textContent.trim().slice(0, 30),
      rows: [...w.querySelectorAll('.ledger-row')].map(r => ({
        key: r.querySelector('.ledger-po').textContent.trim(),
        thumb: (t => t ? (t.classList.contains('is-unlinked') ? 'SLOT' : 'photo') + ' ' + Math.round(t.getBoundingClientRect().width) + 'px' : 'none')(r.querySelector('.thumb')),
        stamp: r.querySelector('.stamp') ? r.querySelector('.stamp').textContent.trim() : null,
        lines: Math.round(r.getBoundingClientRect().height),
      })),
    };
  });
  say('sheet:', JSON.stringify({ open: sheet.open, aria: sheet.aria, transform: sheet.transform, opacity: sheet.opacity, focusMovedIntoDialog: sheet.focusInside, activeElement: sheet.active }));
  sheet.rows.forEach(r => say('  row:', JSON.stringify(r)));
  await page.screenshot({ path: path.join(OUT, '04-orders-sheet.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  say('after Esc — open:', await page.evaluate(() => document.getElementById('ledger').classList.contains('is-open')));

  /* ============ 7. TAB / FOCUS RING -- in BOTH the desk and the document ==== */
  const focusWalk = async (label) => {
    say(`\n=== (7) Tab through the first 15 focusables -- ${label} ===`);
    await page.evaluate(() => { document.activeElement && document.activeElement.blur(); });
    await page.click('body', { position: { x: 3, y: 3 } });
    const seen = [];
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      const f = await page.evaluate(() => {
        const e = document.activeElement;
        if (!e || e === document.body) return null;
        const c = getComputedStyle(e);
        const inFrame = !!e.closest('#frame');
        const visible = !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
        return {
          text: (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 34),
          cls: e.className.slice(0, 30), inFrame, visible,
          outline: c.outlineWidth + ' ' + c.outlineStyle + ' ' + c.outlineColor,
          offset: c.outlineOffset, boxShadow: c.boxShadow,
        };
      });
      if (!f) { seen.push({ text: '(body)', ring: false }); continue; }
      const ring = f.outline !== '0px none rgb(0, 0, 0)' && !/none/.test(f.outline) && parseFloat(f.outline) > 0;
      seen.push({ ...f, ring });
      say(`  ${String(i + 1).padStart(2)}. ring=${ring ? 'YES' : 'no '} inFrame=${f.inFrame} vis=${f.visible} outline="${f.outline}" off=${f.offset}  "${f.text}"`);
    }
    say(`  visible ring on ${seen.filter(s => s.ring).length} of 15 (${label})`);
    const t = await page.evaluate(() => {
      const all = [...document.querySelectorAll('#frame button')];
      return { markup: all.length, reachable: all.filter(b => b.offsetParent !== null).length };
    });
    say(`  buttons inside #frame (markup): ${t.markup} | reachable in this state: ${t.reachable}`);
    return seen;
  };
  await page.click('.devbtn[data-go="desk"]'); await page.waitForTimeout(350);
  await focusWalk('DESK state');
  await page.screenshot({ path: path.join(OUT, '05-focus.png') });
  await page.click('.devbtn[data-go="doc"]'); await page.waitForTimeout(500);
  await focusWalk('DOCUMENT state');
  await page.screenshot({ path: path.join(OUT, '05-focus-doc.png') });

  /* ============ 10. BOX SHADOW SWEEP ============ */
  say('\n=== (10) computed boxShadow sweep (visible elements only) ===');
  const sweep = async label => {
    const r = await page.evaluate(() => [...document.querySelectorAll('#frame *')]
      .filter(e => e.offsetParent !== null || e.tagName === 'BODY')
      .map(e => ({ sel: e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0], bs: getComputedStyle(e).boxShadow }))
      .filter(x => x.bs && x.bs !== 'none'));
    say(`  ${label}: ${r.length} element(s) with a shadow`, JSON.stringify(r));
    return r.length;
  };
  await page.click('.devbtn[data-go="desk"]'); await page.waitForTimeout(300);
  const nDesk = await sweep('desk');
  /* the sheet opened FROM THE DESK -- the two margin chips are not rendered */
  await page.click('.devbtn[data-go="sheet"]'); await page.waitForTimeout(500);
  const nSheetDesk = await sweep('orders sheet (opened from the DESK)');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.click('.devbtn[data-go="doc"]'); await page.waitForTimeout(500);
  const nDoc = await sweep('document');
  /* the sheet opened FROM THE DOCUMENT -- the chips stay under the scrim */
  await page.click('.devbtn[data-go="sheet"]'); await page.waitForTimeout(500);
  const nSheetDoc = await sweep('orders sheet (opened from the DOCUMENT)');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  say(`  expected desk 1 / sheet-from-desk 2 / document 3 / sheet-from-document 4  ->  got ${nDesk} / ${nSheetDesk} / ${nDoc} / ${nSheetDoc}`);

  /* ============ 13. CONTRAST SAMPLES ============ */
  say('\n=== (13) sampled text/ground contrast from computed styles ===');
  await page.click('.devbtn[data-go="doc"]'); await page.waitForTimeout(400);
  /* make sure Client approvals is OPEN (so its two stamps are on the page) and
     that the money chip is the active anchor (so an .ffe-row.is-anchored exists) */
  if (!(await page.evaluate(() => document.getElementById('fold-approvals').classList.contains('is-open')))) {
    await page.click('#fold-approvals .seam'); await page.waitForTimeout(450);
  }
  await page.click('.margin-chip[data-chip="money"]'); await page.waitForTimeout(400);
  const samples = await page.evaluate(() => {
    const g = e => getComputedStyle(e);
    /* the ground a text actually sits on: walk up compositing every translucent
       background until an opaque one is reached. The red-letter zone is a .12
       terracotta wash over the charcoal band, so neither its own rgba() nor the
       band underneath it is the answer on its own. */
    const effBg = (el) => {
      const px = c => (String(c).match(/[\d.]+/g) || []).map(Number);
      const layers = [];
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        const c = px(g(n).backgroundColor);
        if (c.length < 3) continue;
        const a = c.length === 4 ? c[3] : 1;
        if (a <= 0) continue;
        layers.push([c[0], c[1], c[2], a]);
        if (a >= 1) break;
      }
      let out = [255, 255, 255];
      for (let i = layers.length - 1; i >= 0; i--) {
        const L = layers[i];
        out = [0, 1, 2].map(k => L[3] * L[k] + (1 - L[3]) * out[k]);
      }
      return 'rgb(' + out.map(v => Math.round(v)).join(', ') + ')';
    };
    const pick = (label, sel, groundSel) => {
      const e = document.querySelector(sel); if (!e) return { label, miss: sel };
      const b = groundSel ? document.querySelector(groundSel) : e;
      if (!b) return { label, miss: groundSel };
      return { label, fg: g(e).color, bg: effBg(b), size: g(e).fontSize, weight: g(e).fontWeight };
    };
    return [
      pick('tab label — BRIEF white on tab', '#screen-desk .mv-brief .stage-head'),
      pick('tab label — DISCOVERY white on tab', '#screen-desk .mv-discovery .stage-head'),
      pick('tab label — DIRECTION white on tab', '#screen-desk .mv-direction .stage-head'),
      pick('tab label — PROPOSAL white on tab', '#screen-desk .mv-proposal .stage-head'),
      pick('tab label — PROJECT white on tab', '#screen-desk .mv-project .stage-head'),
      pick('tab label — INSTALL white on tab', '#screen-desk .mv-install .stage-head'),
      pick('roster — job name on the cream ground', '#screen-desk .mv-brief .job-name', '#screen-desk .mv-brief'),
      pick('roster — job need on the cream ground', '#screen-desk .mv-brief .job-need', '#screen-desk .mv-brief'),
      pick('roster — job need, Project group', '#screen-desk .mv-project .job-need', '#screen-desk .mv-project'),
      pick('roster — OVERDUE line, Project group', '#screen-desk .mv-project .job-overdue', '#screen-desk .mv-project'),
      pick('roster — OPEN THE JOB act, Install group', '#screen-desk .mv-install .act', '#screen-desk .mv-install'),
      pick('desk ground — roster lede', '#screen-desk .roster-lede', '#screen-desk .desk'),
      pick('desk ground — whisper (italic)', '#screen-desk .whisper', '#screen-desk .desk'),
      pick('letterhead — instrument value on paper', '#screen-doc .instr-value', '.band'),
      pick('letterhead — instrument label (muted)', '#screen-doc .instr-label', '.band'),
      pick('the sheet — seam summary', '#screen-doc .seam-summary', '#doc-col'),
      pick('letterhead — title on paper', '.lh-title', '.band'),
      pick('letterhead — vital label (muted)', '.band .vital', '.band'),
      pick('red letter on paper — label (terracotta-ink)', '.rl-label', '.red-letter'),
      pick('red letter on paper — the sentence', '.rl-text', '.red-letter'),
      pick('red letter on paper — REVIEW DECISIONS act', '.band .act', '.red-letter'),
      pick('rail — spine ACTIVE (clay-ink)', '.spine-active-sub', '.spine'),
      pick('rail — spine ACTIVE label (primary)', '.spine-active-label', '.spine'),
      pick('rail — running index name', '.ri-name', '.spine'),
      pick('rail — running index value', '.ri-value', '.spine'),
      pick('rail — ON THIS PAPER label', '.spine .ri-label', '.spine'),
      pick('rail — PUT DOWN act', '.spine-put-down', '.spine'),
      pick('rail — spine note (JUST YOU)', '.spine-note', '.spine'),
      pick('rail — margin whisper (italic)', '.margin .whisper', '.margin'),
      pick('rail — IN THE MARGIN head', '.margin .sect-head', '.margin'),
      pick('rail — + NOTE act', '.margin .sect-head .act', '.margin'),
      pick('chip — eyebrow', '.margin-chip .mc-eyebrow', '.margin-chip'),
      pick('chip — line', '.margin-chip .mc-line', '.margin-chip'),
      pick('chip — sub (faint)', '.margin-chip .mc-sub', '.margin-chip'),
      pick('chip active — eyebrow on anchor fill', '.margin-chip.is-active .mc-eyebrow', '.margin-chip.is-active'),
      pick('chip active — line on anchor fill', '.margin-chip.is-active .mc-line', '.margin-chip.is-active'),
      pick('chip active — sub on anchor fill', '.margin-chip.is-active .mc-sub', '.margin-chip.is-active'),
      pick('anchored row — ffe vendor on anchor fill', '.ffe-row.is-anchored .ffe-vendor', '.ffe-row.is-anchored'),
      pick('stamp ORDERED word on its fill', '#screen-doc .stamp-ordered .stamp-word', '#screen-doc .stamp-ordered .stamp-fill'),
      pick('stamp DECISION DUE word on its fill', '#screen-doc .stamp-decision .stamp-word', '#screen-doc .stamp-decision .stamp-fill'),
      pick('stamp DAMAGED word on its fill', '#screen-doc .stamp-damaged .stamp-word', '#screen-doc .stamp-damaged .stamp-fill'),
      pick('sheet (untinted) — ledger state', '.ledger-state', '.ledger-sheet'),
      pick('sheet (untinted) — ledger when (faint)', '.ledger-when', '.ledger-sheet'),
    ];
  });
  let sampleFails = 0;
  for (const s of samples) {
    if (s.miss) { sampleFails++; say('  MISSING', s.label, s.miss); continue; }
    const fg = parse(s.fg), bg = parse(s.bg);
    if (!fg || !bg) { sampleFails++; say('  ?', s.label, s.fg, s.bg); continue; }
    const r = ratio(fg, bg);
    if (r < 4.5) sampleFails++;
    say(`  ${r >= 4.5 ? 'PASS' : 'FAIL'} ${r.toFixed(2).padStart(6)}  ${s.label}  fg=${s.fg} bg=rgb(${bg.map(Math.round).join(',')}) ${s.size}/${s.weight}`);
  }
  say(`  — ${samples.length - sampleFails} of ${samples.length} sampled pairs pass — ${sampleFails} short of 4.5:1`);
  /* stamp fill separation vs the sheet it sits on */
  const sep = await page.evaluate(() => {
    const sheet = getComputedStyle(document.getElementById('doc-col')).backgroundColor;
    const paper = getComputedStyle(document.querySelector('.ledger-sheet')).backgroundColor;
    const out = {};
    for (const k of ['ordered', 'decision', 'damaged']) {
      const e = document.querySelector('#screen-doc .stamp-' + k + ' .stamp-fill');
      if (e) out[k] = getComputedStyle(e).backgroundColor;
    }
    return { sheet, paper, out };
  });
  say('  --- stamp fill separation ---');
  for (const [k, v] of Object.entries(sep.out)) {
    say(`  ${k.padEnd(9)} fill ${v} vs Project sheet ${sep.sheet} = ${ratio(parse(v), parse(sep.sheet)).toFixed(3)}:1  |  vs untinted paper ${sep.paper} = ${ratio(parse(v), parse(sep.paper)).toFixed(3)}:1`);
  }
  /* how far apart are the four fills FROM EACH OTHER, and the anchor wash */
  const anchorFill = await page.evaluate(() => {
    const e = document.querySelector('.margin-chip.is-active') || document.querySelector('.is-anchored');
    return e ? getComputedStyle(e).backgroundColor : null;
  });
  if (anchorFill) say(`  ${'anchor'.padEnd(9)} fill ${anchorFill} vs Project sheet ${sep.sheet} = ${ratio(parse(anchorFill), parse(sep.sheet)).toFixed(3)}:1`);
  say('  --- fill vs fill (do two stamp kinds separate by VALUE?) ---');
  const fills = Object.entries(sep.out).concat(anchorFill ? [['anchor', anchorFill]] : []);
  for (let i = 0; i < fills.length; i++) {
    for (let j = i + 1; j < fills.length; j++) {
      say(`  ${fills[i][0]} vs ${fills[j][0]} = ${ratio(parse(fills[i][1]), parse(fills[j][1])).toFixed(3)}:1`);
    }
  }
  const borders = await page.evaluate(() => {
    const o = {};
    for (const k of ['ordered', 'decision', 'damaged']) {
      const e = document.querySelector('#screen-doc .stamp-' + k);
      if (e) o[k] = getComputedStyle(e).borderTopColor + ' / word ' + getComputedStyle(e.querySelector('.stamp-word')).color;
    }
    return o;
  });
  say('  --- stamp border / word colour ---');
  for (const [k, v] of Object.entries(borders)) say(`  ${k.padEnd(9)} border ${v}`);
  const railVsSheet = await page.evaluate(() => ({
    rail: getComputedStyle(document.querySelector('#screen-doc .spine')).backgroundColor,
    sheet: getComputedStyle(document.getElementById('doc-col')).backgroundColor,
    desk: getComputedStyle(document.querySelector('#screen-desk .desk')).backgroundColor,
  }));
  say(`  rail ${railVsSheet.rail} vs sheet ${railVsSheet.sheet} = ${ratio(parse(railVsSheet.rail), parse(railVsSheet.sheet)).toFixed(3)}:1`);
  /* the six movement stocks are gone (Revision 2026-08-28). What the six stage
     pigments carry now is the tab plate and the hover wash. */
  const washes = await page.evaluate(() => {
    const names = ['brief', 'discovery', 'direction', 'proposal', 'project', 'install'];
    const out = [];
    for (const n of names) {
      const g = document.querySelector('#screen-desk .mv-' + n);
      const w = g && g.querySelector('.row-wash');
      out.push([n, getComputedStyle(g.querySelector('.stage-head')).backgroundColor,
        w ? getComputedStyle(w).backgroundColor : null,
        getComputedStyle(document.querySelector('#screen-desk .desk')).backgroundColor,
        getComputedStyle(g).backgroundColor]);
    }
    return out;
  });
  const compose = (rgba, ground) => { const c = parse(rgba); const a = (String(rgba).match(/-?[\d.]+/g) || []).map(Number); const al = a.length === 4 ? a[3] : 1; return over(c, parse(ground), al); };
  say('  --- the six stage pigments: the tab plate, and the wash they open on hover ---');
  washes.forEach(([n, tab, wash, ground, groupBg]) => {
    const c = compose(wash, ground);
    say(`  ${n.padEnd(10)} tab ${tab}  group background ${groupBg}  wash ${wash} -> rgb(${c.map(Math.round).join(',')})  vs ground ${ratio(c, parse(ground)).toFixed(3)}:1`);
  });

  /* ============ 14. THE HOVER WASH ============================================
     Kody's ruling: a warm wash sweeps the row from the pointer. Two things have
     to be true and neither can be read off the stylesheet alone -- every text on
     a WASHED row still clears 4.5:1 against the composited ground, and the wash
     actually animates (clip-path grows) on hover, then goes instant under
     prefers-reduced-motion. */
  say('\n=== (14) the hover wash -- composited ground, and the sweep ===');

  const washProbe = async (label, gotoState, rowSel, textSels) => {
    await gotoState();
    const box = await page.locator(rowSel).first().boundingBox();
    const mid = { x: box.x + box.width * 0.30, y: box.y + box.height / 2 };
    /* t0: the pointer lands, the clip circle is still opening */
    await page.mouse.move(mid.x, mid.y);
    await page.mouse.move(mid.x + 2, mid.y + 1);
    const t0 = await page.evaluate(sel => getComputedStyle(document.querySelector(sel + ' .row-wash')).clipPath, rowSel);
    await page.waitForTimeout(340);
    const out = await page.evaluate(({ rowSel, textSels }) => {
      const px = c => (String(c).match(/-?[\d.]+/g) || []).map(Number);
      const row = document.querySelector(rowSel);
      const wash = row.querySelector('.row-wash');
      const cs = getComputedStyle(wash);
      /* the opaque ground the row sits on, composited up the ancestor chain */
      const effBg = (el) => {
        const layers = [];
        for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
          const c = px(getComputedStyle(n).backgroundColor);
          if (c.length < 3) continue;
          const a = c.length === 4 ? c[3] : 1;
          if (a <= 0) continue;
          layers.push([c[0], c[1], c[2], a]);
          if (a >= 1) break;
        }
        let o = [255, 255, 255];
        for (let i = layers.length - 1; i >= 0; i--) { const L = layers[i]; o = [0, 1, 2].map(k => L[3] * L[k] + (1 - L[3]) * o[k]); }
        return o;
      };
      /* from the ROW itself, not its parent: an anchored FF&E line wears
         --fill-anchor-tint, and the wash lands on top of that, not on the sheet */
      const ground = effBg(row);
      const w = px(cs.backgroundColor);
      const a = w.length === 4 ? w[3] : 1;
      const composited = [0, 1, 2].map(k => w[k] * a + ground[k] * (1 - a));
      const st = row.querySelector('.stamp');
      return {
        clip: cs.clipPath, dur: cs.transitionDuration, wash: cs.backgroundColor,
        ground: 'rgb(' + ground.map(v => Math.round(v)).join(', ') + ')',
        composited: 'rgb(' + composited.map(v => Math.round(v)).join(', ') + ')',
        score: (() => { const b = row.querySelector('button.job-name'); if (!b) return null; const c = getComputedStyle(b, '::after'); return c.backgroundColor + ' ' + c.transform; })(),
        geometry: (r => Math.round(r.width) + 'x' + Math.round(r.height))(row.getBoundingClientRect()),
        texts: textSels.map(sel => { const e = row.querySelector(sel); return e ? { sel, fg: getComputedStyle(e).color, size: getComputedStyle(e).fontSize, text: e.textContent.trim().replace(/\s+/g, ' ').slice(0, 30) } : { sel, miss: true }; }),
        stamp: st ? { word: st.textContent.trim(), fg: getComputedStyle(st.querySelector('.stamp-word')).color, fill: getComputedStyle(st.querySelector('.stamp-fill')).backgroundColor } : null,
      };
    }, { rowSel, textSels });
    say(`  -- ${label} --`);
    say(`  wash ${out.wash} over ground ${out.ground}  ->  ${out.composited}   (row ${out.geometry}, unchanged by the wash)`);
    say(`  clip-path at t0 ${t0}  ->  after 340ms ${out.clip}   ${t0 !== out.clip ? 'SWEPT' : 'NO CHANGE'}   transition ${out.dur}`);
    if (out.score) say(`  the name's score: ${out.score}`);
    let bad = 0;
    for (const t of out.texts) {
      if (t.miss) { bad++; say('  MISSING ' + t.sel); continue; }
      const r = ratio(parse(t.fg), parse(out.composited));
      if (r < 4.5) bad++;
      say(`  ${r >= 4.5 ? 'PASS' : 'FAIL'} ${r.toFixed(2).padStart(6)}  ${t.sel.padEnd(14)} ${t.fg} ${t.size}  "${t.text}"`);
    }
    if (out.stamp) {
      const r = ratio(parse(out.stamp.fg), parse(out.stamp.fill));
      if (r < 4.5) bad++;
      say(`  ${r >= 4.5 ? 'PASS' : 'FAIL'} ${r.toFixed(2).padStart(6)}  stamp word    "${out.stamp.word}" ${out.stamp.fg} on its own opaque fill ${out.stamp.fill}`);
    }
    say(`  -> ${bad} text(s) short of 4.5:1 on the washed row`);
    await page.mouse.move(4, 4);
    await page.waitForTimeout(320);
    return { swept: t0 !== out.clip, bad };
  };

  const wDesk = await washProbe('ROSTER, the Vandersteen line (Project pigment)',
    async () => {
      await page.click('.devbtn[data-go="desk"]'); await page.waitForTimeout(350);
      await page.evaluate(() => { const s = document.querySelector('#screen-desk .scroll'); s.scrollTop = document.querySelector('#screen-desk .mv-project').offsetTop - 300; });
      await page.waitForTimeout(250);
    },
    '#screen-desk .mv-project .job-line',
    ['.job-name', '.job-need', '.job-overdue', '.act']);

  const wFfe = await washProbe('FF&E, the ordered dining set (clay, the line has a state)',
    async () => {
      await page.click('.devbtn[data-go="doc"]'); await page.waitForTimeout(500);
      /* item (13) left the MONEY chip anchoring #ffe-po; move the anchor off it
         so this reading is the wash on the plain sheet */
      await page.click('.margin-chip[data-chip="time"]'); await page.waitForTimeout(400);
      await page.evaluate(() => { const c = document.getElementById('doc-col'); c.scrollTop = document.getElementById('fold-pieces').offsetTop - 24; });
      await page.waitForTimeout(250);
    },
    '#ffe-po', ['.ffe-name', '.ffe-vendor', '.ffe-price']);

  const wFfeDamaged = await washProbe('FF&E, the damaged console (terracotta)',
    async () => { await page.waitForTimeout(150); },
    '.ffe-row.st-damaged', ['.ffe-name', '.ffe-vendor', '.ffe-price']);

  const wFfeDecision = await washProbe('FF&E, the Hartland wool rug (golden hour, the deepest state pigment to reach)',
    async () => { await page.waitForTimeout(150); },
    '.ffe-row.st-decision', ['.ffe-name', '.ffe-vendor', '.ffe-price']);

  /* the worst case the page can build: the wash ON TOP OF the anchor fill */
  const wFfeAnchored = await washProbe('FF&E, the dining set ANCHORED and hovered (wash over --fill-anchor-tint)',
    async () => {
      await page.click('.margin-chip[data-chip="money"]'); await page.waitForTimeout(400);
      await page.evaluate(() => { const c = document.getElementById('doc-col'); c.scrollTop = document.getElementById('fold-pieces').offsetTop - 24; });
      await page.waitForTimeout(250);
    },
    '#ffe-po', ['.ffe-name', '.ffe-vendor', '.ffe-price']);

  /* keyboard focus takes the same wash, statically */
  await page.evaluate(() => document.querySelector('#screen-doc .ffe-row.st-decision .row-wash') && null);
  const focusWash = await page.evaluate(() => {
    const b = document.querySelector('#screen-desk .mv-project .job-line button.job-name');
    return b ? 'roster name is focusable' : 'no focusable name';
  });
  say(`  ${focusWash}`);
  await page.click('.devbtn[data-go="desk"]'); await page.waitForTimeout(350);
  await page.evaluate(() => { const s = document.querySelector('#screen-desk .scroll'); s.scrollTop = document.querySelector('#screen-desk .mv-project').offsetTop - 300; });
  await page.waitForTimeout(200);
  /* a REAL Tab, so :focus-visible applies: land on the act of the line above,
     then step forward onto the Vandersteen name */
  await page.evaluate(() => {
    const acts = document.querySelectorAll('#screen-desk .mv-proposal .job-line .act');
    acts[acts.length - 1].focus();
  });
  await page.keyboard.press('Tab');
  await page.waitForTimeout(60);
  const kb = await page.evaluate(() => {
    const row = document.querySelector('#screen-desk .mv-project .job-line');
    const c = getComputedStyle(row.querySelector('.row-wash'));
    const b = document.activeElement;
    const bc = getComputedStyle(b);
    return { clip: c.clipPath, dur: c.transitionDuration, outline: bc.outlineWidth + ' ' + bc.outlineStyle + ' ' + bc.outlineColor };
  });
  say(`  keyboard focus on the name: wash clip ${kb.clip} (instant, transition ${kb.dur}) + focus ring "${kb.outline}"`);
  say(`  => swept: roster ${wDesk.swept} / ordered ${wFfe.swept} / damaged ${wFfeDamaged.swept} / decision ${wFfeDecision.swept} / anchored ${wFfeAnchored.swept}; ` +
      `${wDesk.bad + wFfe.bad + wFfeDamaged.bad + wFfeDecision.bad + wFfeAnchored.bad} washed-row text(s) short of 4.5:1`);

  /* ============ 12. HORIZONTAL OVERFLOW @1440 ============ */
  say('\n=== (12) horizontal overflow ===');
  const ovf = () => page.evaluate(() => {
    const f = document.getElementById('frame');
    const bad = [...f.querySelectorAll('*')].filter(e => e.offsetParent !== null &&
      e.getBoundingClientRect().right > f.getBoundingClientRect().right + 1)
      .map(e => e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0]);
    return {
      frameScroll: f.scrollWidth + '/' + f.clientWidth,
      docBody: document.documentElement.scrollWidth + '/' + document.documentElement.clientWidth,
      scrollers: [...f.querySelectorAll('*')].filter(e => e.offsetParent !== null && e.scrollWidth > e.clientWidth + 1)
        .map(e => e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0] + ' ' + e.scrollWidth + '>' + e.clientWidth),
      pastRightEdge: [...new Set(bad)].slice(0, 12),
    };
  });
  for (const st of ['desk', 'doc']) { await page.click(`.devbtn[data-go="${st}"]`); await page.waitForTimeout(350); say(` @1440 ${st}:`, JSON.stringify(await ovf())); }
  await page.click('.devbtn[data-go="sheet"]'); await page.waitForTimeout(350); say(' @1440 sheet:', JSON.stringify(await ovf()));
  await page.keyboard.press('Escape');

  /* ============ 9. 390 ============ */
  say('\n=== (9) 390 toggle ===');
  await page.click('.devbtn[data-go="m390"]'); await page.waitForTimeout(500);
  say(' @390:', JSON.stringify(await ovf()));
  const m = await page.evaluate(() => {
    const s = document.getElementById('screen-m390');
    return {
      head: s.querySelector('.sect-head').textContent.trim(),
      whispers: [...s.querySelectorAll('.whisper')].map(w => w.textContent.trim().slice(0, 46)),
      lines: s.querySelectorAll('.job-line').length,
      bar: [...s.querySelectorAll('.mb-item')].map(i => i.textContent.trim()),
      barBg: getComputedStyle(s.querySelector('.mobile-bar')).backgroundColor,
      smallestAct: Math.min(...[...s.querySelectorAll('.act')].map(a => Math.round(a.getBoundingClientRect().height))),
    };
  });
  say(' 390 roster head :', m.head);
  say(' 390 whispers    :', JSON.stringify(m.whispers));
  say(' 390 job lines   :', m.lines, '| mobile bar', JSON.stringify(m.bar), m.barBg);
  say(' 390 smallest act hit height:', m.smallestAct + 'px');
  await page.screenshot({ path: path.join(OUT, '06-390.png') });

  /* ============ 11. requests ============ */
  say('\n=== (11) non-file: requests ===');
  say(' external requests:', external.length, JSON.stringify(external));
  say(' page errors:', consoleErrs.length, JSON.stringify(consoleErrs));

  await ctx.close();

  /* ============ 8. REDUCED MOTION ============ */
  say('\n=== (8) prefers-reduced-motion: reduce ===');
  const ctx2 = await browser.newContext({ viewport: { width: 1560, height: 1000 }, reducedMotion: 'reduce' });
  const p2 = await ctx2.newPage();
  await p2.goto(FILE);
  await p2.waitForFunction(() => window.__mockReady === true);
  await p2.waitForTimeout(400);
  const rm = await p2.evaluate(() => {
    const q = (sel, label) => { const e = document.querySelector(sel); if (!e) return { label, miss: sel }; const c = getComputedStyle(e); return { label, animation: c.animationName + ' ' + c.animationDuration, transition: c.transitionProperty + ' ' + c.transitionDuration }; };
    return {
      matched: matchMedia('(prefers-reduced-motion: reduce)').matches,
      rosterVisible: [...document.querySelectorAll('#screen-desk .job-line')].every(l => getComputedStyle(l).opacity === '1' && getComputedStyle(l).transform === 'none'),
      probes: [q('.doc-breath', 'spine breath'), q('#screen-doc .doc-shell', 'doc raise'), q('#screen-desk .job-line', 'roster settle'),
      q('.fold-body', 'fold'), q('.ledger-sheet', 'ledger slide'), q('.stamp-fill', 'stamp ink'), q('.margin-chip', 'chip'),
      q('.ffe-row', 'ffe row'), q('.act', 'act'), q('.act .da-pool', 'ink pool'), q('button.job-name', 'job name'), q('.frame', 'frame')],
      anyRunning: document.getAnimations().map(a => (a.animationName || 'transition') + ':' + a.effect.getTiming().duration),
      /* EVERY element in the frame: any non-zero animation or transition duration? */
      nonZero: [...document.querySelectorAll('#frame *')].map(e => {
        const c = getComputedStyle(e);
        const bad = [];
        (c.animationDuration || '').split(',').forEach(d => { if (parseFloat(d) > 0) bad.push('anim ' + d.trim() + ' (' + c.animationName + ')'); });
        (c.transitionDuration || '').split(',').forEach(d => { if (parseFloat(d) > 0) bad.push('trans ' + d.trim() + ' (' + c.transitionProperty + ')'); });
        return bad.length ? e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0] + ' -> ' + bad.join(' | ') : null;
      }).filter(Boolean),
      total: document.querySelectorAll('#frame *').length,
    };
  });
  say(' media matched:', rm.matched, '| roster lines at rest & visible:', rm.rosterVisible);
  say(' elements in #frame with ANY non-zero duration:', rm.nonZero.length, 'of', rm.total, JSON.stringify(rm.nonZero.slice(0, 8)));
  rm.probes.forEach(p => p.miss ? say('  MISSING', p.label) : say(`  ${p.label.padEnd(14)} animation=${p.animation}  transition=${p.transition}`));
  await p2.click('button.job-name[data-open-doc]');
  await p2.waitForTimeout(60);
  const rm2 = await p2.evaluate(() => ({
    running: document.getAnimations().map(a => (a.animationName || 'transition') + ':' + a.effect.getTiming().duration),
    docOpacity: getComputedStyle(document.querySelector('#screen-doc .doc-shell')).opacity,
  }));
  say(' after opening the document under reduce — running animations:', JSON.stringify(rm2.running), 'opacity', rm2.docOpacity);
  await p2.click('#fold-approvals .seam');
  await p2.waitForTimeout(30);
  const rm3 = await p2.evaluate(() => ({ running: document.getAnimations().length, h: Math.round(document.querySelector('#fold-approvals .fold-body').getBoundingClientRect().height) }));
  say(' after unfolding under reduce — running animations:', rm3.running, '| fold height immediately:', rm3.h + 'px');
  /* the wash under reduce: flat 6% tint, applied instantly, no sweep */
  await p2.click('.devbtn[data-go="desk"]');
  await p2.waitForTimeout(300);
  await p2.evaluate(() => { const s = document.querySelector('#screen-desk .scroll'); s.scrollTop = document.querySelector('#screen-desk .mv-project').offsetTop - 300; });
  await p2.waitForTimeout(200);
  const rmRowBox = await p2.locator('#screen-desk .mv-project .job-line').first().boundingBox();
  await p2.mouse.move(rmRowBox.x + rmRowBox.width * 0.3, rmRowBox.y + rmRowBox.height / 2);
  await p2.mouse.move(rmRowBox.x + rmRowBox.width * 0.3 + 2, rmRowBox.y + rmRowBox.height / 2 + 1);
  const rmWash0 = await p2.evaluate(() => { const c = getComputedStyle(document.querySelector('#screen-desk .mv-project .job-line .row-wash')); return { clip: c.clipPath, bg: c.backgroundColor, dur: c.transitionDuration, anims: document.getAnimations().length }; });
  await p2.waitForTimeout(320);
  const rmWash1 = await p2.evaluate(() => getComputedStyle(document.querySelector('#screen-desk .mv-project .job-line .row-wash')).clipPath);
  say(' hover wash under reduce -- immediately:', JSON.stringify(rmWash0));
  say(' hover wash under reduce -- after 320ms clip:', rmWash1, rmWash0.clip === rmWash1 ? '(INSTANT: no sweep)' : '(CHANGED -- it swept)');
  await p2.screenshot({ path: path.join(OUT, '07-reduced-motion.png') });

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'probe-log.txt'), log.join('\n'));
  console.log('\nlog -> review-shots/probe-log.txt');
}
main().catch(e => { console.error(e); process.exit(1); });
