import { readFileSync } from 'node:fs';
import { open, signIn, openHouse, shot, t, IDS, BASE } from './lib-r2.mjs';

const AXE = readFileSync(
  '/Users/kody/Code/patina-merged/node_modules/.pnpm/axe-core@4.11.1/node_modules/axe-core/axe.min.js',
  'utf8',
);

function ratio(fg, bg) {
  const lum = (c) => {
    const [r, g, b] = c.match(/\d+/g).slice(0, 3).map((v) => {
      const s = Number(v) / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const a = lum(fg), b = lum(bg);
  return ((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2);
}

const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);

async function axe(label) {
  await page.addScriptTag({ content: AXE });
  const res = await page.evaluate(async () => {
    const r = await window.axe.run(document, { resultTypes: ['violations'] });
    return r.violations.map((v) => ({
      id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help,
      sample: v.nodes.slice(0, 4).map((n) => ({
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
await page.waitForTimeout(3500);
await axe('doorstep (asks + records)');
await shot(page, '16-axe-doorstep', false);

// W3W-R1-01 · the revision act's ink
const ink = await page.evaluate(() => {
  const out = { forwards: [], navActs: [], tokens: {}, ground: null };
  document.querySelectorAll('[data-testid="approval-receipt-forward"]').forEach((e) => {
    out.forwards.push({
      text: e.innerText.trim(), color: getComputedStyle(e).color,
      size: getComputedStyle(e).fontSize,
      clay: /clay/.test((e.className || '').toString()),
      cls: (e.className || '').toString().slice(0, 150),
    });
  });
  document.querySelectorAll('[data-testid="approval-revisions"] a, [data-testid="approval-revisions"] button').forEach((e) => {
    out.navActs.push({
      text: e.innerText.trim(), color: getComputedStyle(e).color,
      size: getComputedStyle(e).fontSize,
      clay: /clay/.test((e.className || '').toString()),
      href: e.getAttribute('href'),
    });
  });
  const cs = getComputedStyle(document.documentElement);
  for (const v of ['--text-muted', '--text-body', '--color-clay', '--color-mocha', '--text-faint'])
    out.tokens[v] = cs.getPropertyValue(v).trim();
  out.ground = getComputedStyle(document.body).backgroundColor;
  return out;
});
console.log('\n===== W3W-R1-01 · the revision act ink');
console.log(JSON.stringify(ink, null, 1));
for (const a of [...ink.forwards, ...ink.navActs]) {
  console.log(`   "${a.text}" ${a.color} on ${ink.ground} → ${ratio(a.color, ink.ground)}:1 @ ${a.size}`);
}

// W3W-R1-03 · discussion landmark labels
const lms = await page.evaluate(() =>
  [...document.querySelectorAll('[data-testid="approval-discussion"]')].map((e) => ({
    label: e.getAttribute('aria-label'),
    owner: e.closest('[id^="approval-"]')?.id ?? null,
  }))
);
console.log('\n===== W3W-R1-03 · discussion landmark labels');
lms.forEach((l) => console.log(`   ${l.owner}\n     ${l.label}`));
console.log('   unique labels:', new Set(lms.map((l) => l.label)).size, 'of', lms.length);

// vocabulary sweep
const vocab = await page.evaluate(() => {
  const txt = document.body.innerText;
  const terms = ['gate', 'gates', 'task', 'tasks', 'overdue', 'dashboard', 'AI', 'Declined',
    'declined', 'decline', 'confetti', 'badge', 'click_through', 'electronic_signature',
    'portal_clickthrough', 'right_away', 'weekly_sunday', 'daily_digest', 'undone', 'reopened',
    'reversed', 'void'];
  const out = {};
  for (const w of terms) {
    const m = txt.match(new RegExp(`\\b${w}\\b`, 'g'));
    out[w] = m ? m.length : 0;
  }
  const chips = [...document.querySelectorAll('span,div,p,em,strong')]
    .filter((e) => e.children.length === 0 && /^\(?\d{1,3}\)?$/.test((e.innerText || '').trim()))
    .slice(0, 12)
    .map((e) => `${e.tagName}.${(e.className || '').toString().slice(0, 60)} = "${e.innerText.trim()}"`);
  const gateCtx = [];
  const re = /\bgates?\b/gi; let m;
  while ((m = re.exec(txt)) && gateCtx.length < 8)
    gateCtx.push(txt.slice(Math.max(0, m.index - 80), m.index + 80).replace(/\s+/g, ' '));
  return { out, emoji: (txt.match(/\p{Extended_Pictographic}/gu) || []).length, chips, gateCtx };
});
console.log('\n===== VOCABULARY (doorstep innerText)');
console.log(JSON.stringify(vocab.out));
console.log('emoji:', vocab.emoji, '| numeric-only chips:', JSON.stringify(vocab.chips));
vocab.gateCtx.forEach((c) => console.log('   …' + c + '…'));

// keep-a-copy acts on the doorstep
const keeps = await page.evaluate(() => ({
  onReceipts: [...document.querySelectorAll('[data-testid="doorstep-approval-receipt"]')].map((e) => ({
    id: e.closest('[id^="approval-"]')?.id ?? null,
    keep: [...e.querySelectorAll('a')].filter((a) => /keep a copy/i.test(a.innerText)).map((a) => ({
      href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel'),
    })),
  })),
  doorGate: document.querySelectorAll('[data-testid="door-gate"]').length,
  doorReceipt: document.querySelectorAll('[data-testid="door-receipt"]').length,
  doorKeep: document.querySelectorAll('[data-testid="door-keep-a-copy"]').length,
  anyKeep: [...document.querySelectorAll('a')].filter((a) => /keep a copy/i.test(a.innerText)).length,
}));
console.log('\n===== KEEP A COPY on the doorstep');
console.log(JSON.stringify(keeps, null, 1));

await shot(page, '05-doorstep-1280', true);
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(800);
await shot(page, '21-doorstep-390', false);
await page.setViewportSize({ width: 1280, height: 1100 });

// record page axe
await page.goto(`${BASE}/decisions/${IDS.predecessor}/record`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4500);
await axe('record page /decisions/<id>/record');
await shot(page, '17-axe-record', false);
const rv = await page.evaluate(() => {
  const txt = document.body.innerText;
  const terms = ['gate', 'task', 'overdue', 'dashboard', 'AI', 'Declined', 'declined',
    'click_through', 'electronic_signature'];
  const out = {};
  for (const w of terms) { const m = txt.match(new RegExp(`\\b${w}\\b`, 'g')); out[w] = m ? m.length : 0; }
  return { out, emoji: (txt.match(/\p{Extended_Pictographic}/gu) || []).length };
});
console.log('\n===== VOCABULARY (record page)', JSON.stringify(rv));

await browser.close();
