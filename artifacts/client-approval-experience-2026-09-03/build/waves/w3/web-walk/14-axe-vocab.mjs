import { readFileSync } from 'node:fs';
import { open, signIn, openHouse, shot, t, IDS, BASE } from './lib.mjs';
const AXE = readFileSync('/Users/kody/Code/patina-merged/node_modules/.pnpm/axe-core@4.11.1/node_modules/axe-core/axe.min.js', 'utf8');

const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);

async function axe(label) {
  await page.addScriptTag({ content: AXE });
  const res = await page.evaluate(async () => {
    const r = await window.axe.run(document, { resultTypes: ['violations'] });
    return r.violations.map((v) => ({
      id: v.id, impact: v.impact, nodes: v.nodes.length,
      help: v.help,
      sample: v.nodes.slice(0, 3).map((n) => ({
        target: n.target.join(' '),
        msg: (n.any[0]?.message || n.all[0]?.message || '').slice(0, 200),
      })),
    }));
  });
  console.log(`\n===== axe @ ${label} — ${res.length} violation type(s)`);
  for (const v of res) {
    console.log(`  [${v.impact}] ${v.id}  ${v.nodes} node(s) — ${v.help}`);
    for (const s of v.sample) console.log(`      ${s.target}\n        ${s.msg}`);
  }
  return res;
}

await openHouse(page);
await page.waitForTimeout(3000);
await axe('doorstep (asks + records)');
await shot(page, '16-axe-doorstep', false);

// vocabulary sweep over rendered text
const vocab = await page.evaluate(() => {
  const txt = document.body.innerText;
  const terms = ['gate','gates','task','tasks','overdue','dashboard','AI','Declined','declined','decline','confetti','badge','click_through','electronic_signature','portal_clickthrough','right_away','weekly_sunday','daily_digest'];
  const out = {};
  for (const w of terms) {
    const re = new RegExp(`\\b${w}\\b`, 'g');
    const m = txt.match(re);
    out[w] = m ? m.length : 0;
  }
  const emoji = txt.match(/\p{Extended_Pictographic}/gu);
  // numeric chips: short elements whose whole text is a bare integer or (N)
  const chips = [...document.querySelectorAll('span,div,p,em,strong')]
    .filter((e) => e.children.length === 0 && /^\(?\d{1,3}\)?$/.test((e.innerText||'').trim()))
    .slice(0, 12)
    .map((e) => `${e.tagName}.${(e.className||'').toString().slice(0,60)} = "${e.innerText.trim()}"`);
  // context of "gate" hits
  const gateCtx = [];
  const re = /\bgates?\b/gi; let m;
  while ((m = re.exec(txt)) && gateCtx.length < 8) gateCtx.push(txt.slice(Math.max(0,m.index-70), m.index+70).replace(/\s+/g,' '));
  return { out, emoji: emoji ? emoji.length : 0, chips, gateCtx };
});
console.log('\n===== VOCABULARY (doorstep innerText)');
console.log(JSON.stringify(vocab.out));
console.log('emoji:', vocab.emoji);
console.log('numeric-only chips:', JSON.stringify(vocab.chips, null, 1));
console.log('"gate" contexts:'); vocab.gateCtx.forEach((c) => console.log('   …' + c + '…'));

// record page
await page.goto(`${BASE}/decisions/${IDS.predecessor}/record`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
await axe('record page /decisions/<id>/record');
await shot(page, '17-axe-record', false);
const rv = await page.evaluate(() => {
  const txt = document.body.innerText;
  const terms = ['gate','task','overdue','dashboard','AI','Declined','declined','click_through','electronic_signature','paper'];
  const out = {}; for (const w of terms) { const m = txt.match(new RegExp(`\\b${w}\\b`,'g')); out[w]=m?m.length:0; }
  return { out, emoji: (txt.match(/\p{Extended_Pictographic}/gu)||[]).length, text: txt.replace(/\s+/g,' ').trim() };
});
console.log('\n===== VOCABULARY (record page)');
console.log(JSON.stringify(rv.out), 'emoji:', rv.emoji);
await browser.close();
