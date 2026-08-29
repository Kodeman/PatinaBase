/* MR2 second claims probe: visuals + margin ordering + hover-only census. Prober-owned. */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, 'review-shots');
const URL_ = 'file://' + path.join(here, 'index.html');
const L = []; const say = s => { console.log(s); L.push(s); };

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1560, height: 1000 }, deviceScaleFactor: 1 });
await p.goto(URL_);
await p.waitForFunction(() => window.__mockReady === true, { timeout: 20000 });
await p.evaluate(() => window.__lensSettled && window.__lensSettled());
await p.waitForTimeout(400);

/* rail segment full text at s0 */
say('\n--- rail segments, full text @ s0 ---');
const rail = await p.evaluate(() => {
  const r = document.querySelector('#rail-1440');
  return [...r.querySelectorAll('.seg')].map(s => {
    const n = s.querySelector('.seg-name'); const sl = s.querySelector('.seg-slot');
    const vis = e => { if (!e) return null; const c = getComputedStyle(e); const b = e.getBoundingClientRect(); return (b.width > 0 && b.height > 0 && c.visibility !== 'hidden' && c.opacity !== '0'); };
    return { go: s.getAttribute('data-go') || s.dataset.region || s.getAttribute('data-seg') || [...s.attributes].map(a => a.name + '=' + a.value).join(','),
      full: s.textContent.replace(/\s+/g, ' ').trim(),
      name: n ? n.textContent.trim() : null, nameVis: vis(n), nameH: n ? Math.round(n.getBoundingClientRect().height) : null,
      slot: sl ? sl.textContent.replace(/\s+/g, ' ').trim() : null, slotVis: vis(sl) };
  });
});
rail.forEach((s, i) => say('  ' + i + ' [' + s.go + '] full="' + s.full + '" name="' + s.name + '"(vis=' + s.nameVis + ',h=' + s.nameH + ') slot="' + s.slot + '"(vis=' + s.slotVis + ')'));

/* margin group ordering with money as the reading index */
say('\n--- RF-03 margin group order, index=money ---');
for (const target of ['approvals', 'ffe', 'money']) {
  await p.evaluate(t => {
    const btns = [...document.querySelectorAll('#rail-1440 .seg')];
    const hit = btns.find(x => (x.getAttribute('data-go') || x.getAttribute('data-target') || x.dataset.region || x.textContent).toLowerCase().includes(t === 'ffe' ? 'pieces' : t));
    if (hit) hit.click();
  }, target);
  await p.waitForTimeout(900);
  const g = await p.evaluate(() => {
    const col = document.querySelector('#frame-1440 aside.margin');
    const idx = document.querySelector('#frame-1440').getAttribute('data-reading-index');
    const heads = [...col.querySelectorAll('*')].filter(e => e.children.length <= 1 && /^(BESIDE|THE WHOLE JOB|NOTHING)/.test(e.textContent.replace(/\s+/g, ' ').trim()) && e.getBoundingClientRect().height > 0).map(e => e.tagName.toLowerCase() + '.' + e.className + ' :: "' + e.textContent.replace(/\s+/g, ' ').trim().slice(0, 50) + '"');
    return { idx, heads: [...new Set(heads)] };
  });
  say('  index=' + g.idx + '  group heads in order: ' + JSON.stringify(g.heads));
}

/* hover-only census (SC5 / C.10) */
say('\n--- SC5 hover-only affordances ---');
const hover = await p.evaluate(() => {
  const out = [];
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
    const walk = rs => { for (const r of rs) {
      if (r.cssRules) { walk(r.cssRules); continue; }
      const sel = r.selectorText || '';
      if (!/:hover/.test(sel)) continue;
      const txt = r.style && r.style.cssText || '';
      if (/(^|;|\s)(display|visibility|opacity|content)\s*:/.test(txt)) {
        const noFocus = !/:focus/.test(sel);
        if (noFocus) out.push(sel.slice(0, 120) + ' { ' + txt.slice(0, 100) + ' }');
      }
    } };
    walk(rules);
  }
  return out;
});
say('  :hover rules that reveal (display/visibility/opacity/content) without a :focus twin: ' + hover.length);
hover.slice(0, 12).forEach(h => say('    ' + h));

/* screenshots */
await p.evaluate(() => { document.querySelector('[data-go="rest"]').click(); });
await p.waitForTimeout(700);
const f1440 = await p.$('#frame-1440'); if (f1440) await f1440.screenshot({ path: path.join(OUT, 'c-1440-rest.png') });
await p.evaluate(() => { document.querySelector('[data-go="ffe"]').click(); });
await p.waitForTimeout(900);
if (f1440) await f1440.screenshot({ path: path.join(OUT, 'c-1440-ffe.png') });
const f390 = await p.$('#frame-390'); if (f390) await f390.screenshot({ path: path.join(OUT, 'c-390-bar.png') });
const f1280 = await p.$('#frame-1280'); if (f1280) await f1280.screenshot({ path: path.join(OUT, 'c-1280.png') });

/* the mobile bar's visible SECTIONS text at 390 s0 */
say('\n--- RF-04 mobile bar visible text @ 390 s0 ---');
const mb = await p.evaluate(() => {
  const f = document.querySelector('#frame-390'); f.scrollTop = 0;
  const bar = f.querySelector('.mobile-bar');
  const vis = e => { const c = getComputedStyle(e); const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && c.opacity !== '0' && c.display !== 'none'; };
  const items = [...bar.querySelectorAll('*')].filter(e => e.children.length === 0 && e.textContent.trim() && vis(e)).map(e => e.tagName.toLowerCase() + '.' + e.className + ' "' + e.textContent.replace(/\s+/g, ' ').trim() + '"');
  return { idx: f.getAttribute('data-reading-index'), barIdx: bar.getAttribute('data-reading-index'), visibleLeaves: items };
});
say('  ' + JSON.stringify(mb, null, 1));

/* FF&E thumb census across the whole file */
say('\n--- RF-01 thumb census, whole document ---');
const th = await p.evaluate(() => {
  const all = [...document.querySelectorAll('.thumb')];
  const real = all.filter(t => (getComputedStyle(t).backgroundImage || '').includes('data:image/jpeg'));
  const perFrame = {};
  ['frame-1440', 'frame-1280', 'frame-390'].forEach(id => {
    const f = document.getElementById(id);
    const t = [...f.querySelectorAll('.thumb')];
    perFrame[id] = { total: t.length, real: t.filter(x => (getComputedStyle(x).backgroundImage || '').includes('data:image/jpeg')).length,
      catalog: t.filter(x => x.classList.contains('is-catalog')).length };
  });
  const srcs = new Set(real.map(t => getComputedStyle(t).backgroundImage.slice(0, 400)));
  return { total: all.length, real: real.length, distinctImages: srcs.size, perFrame };
});
say('  ' + JSON.stringify(th));

fs.writeFileSync(path.join(OUT, 'claims2-log.txt'), L.join('\n'));
await b.close();
