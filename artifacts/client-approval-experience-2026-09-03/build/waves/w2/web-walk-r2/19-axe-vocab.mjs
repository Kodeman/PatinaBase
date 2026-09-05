import { open, signIn, openHouse, t, askBy } from './lib.mjs';
const SH = '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r2';
const AXE = '/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-integration/node_modules/.pnpm/axe-core@4.11.1/node_modules/axe-core/axe.min.js';
const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
await openHouse(page);
const ask = askBy(page, 'study bookcase depth');
await ask.scrollIntoViewIfNeeded();
await ask.locator('[data-testid="approval-acts"] button').filter({ hasText: 'APPROVE' }).first().click();
await page.waitForTimeout(600);
await ask.screenshot({ path: `${SH}/19-axe-subject-ask.png` });
await page.addScriptTag({ path: AXE });
const res = await page.evaluate(async () => await window.axe.run(document, { resultTypes: ['violations'] }));
console.log('VIOLATIONS:', res.violations.length);
for (const v of res.violations) {
  console.log(`\n[${v.impact}] ${v.id} — ${v.nodes.length} nodes\n  ${v.help}`);
  for (const n of v.nodes.slice(0, 4)) console.log('   •', n.target.join(' '), '|', (n.failureSummary || '').replace(/\s+/g, ' ').slice(0, 170));
}
// how many failing nodes sit inside one approval?
const inside = await page.evaluate((targets) => {
  const scope = document.querySelectorAll('[data-testid="doorstep-approval"]');
  let n = 0;
  for (const sel of targets) { try { const el = document.querySelector(sel); if (el) for (const s of scope) if (s.contains(el)) { n++; break; } } catch {} }
  return n;
}, res.violations.flatMap((v) => v.nodes.map((n) => n.target.join(' '))));
console.log('\nfailing nodes inside a doorstep-approval:', inside);

// muted token, measured
const tok = await page.evaluate(() => {
  const cs = getComputedStyle(document.documentElement);
  return { muted: cs.getPropertyValue('--text-muted').trim(), oakInk: cs.getPropertyValue('--color-oak-ink').trim(), agedOak: cs.getPropertyValue('--color-aged-oak').trim(), bg: getComputedStyle(document.body).backgroundColor };
});
console.log('tokens:', JSON.stringify(tok));

// ── vocabulary sweep ──
const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
const words = ['gate', 'gates', 'task', 'tasks', 'overdue', 'dashboard', ' AI ', 'Declined', 'declined', 'badge', 'confetti'];
for (const w of words) {
  const re = new RegExp(w.trim() === 'AI' ? '\\bAI\\b' : `\\b${w.trim()}\\b`, 'gi');
  const hits = body.match(re) || [];
  if (hits.length) {
    const ctx = [...body.matchAll(re)].slice(0, 4).map((m) => body.slice(Math.max(0, m.index - 45), m.index + 45));
    console.log(`  ${w.trim()}: ${hits.length} — ${JSON.stringify(ctx)}`);
  } else console.log(`  ${w.trim()}: clean`);
}
const emoji = body.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || [];
console.log('  emoji:', emoji.length ? JSON.stringify(emoji) : 'none');
console.log('  RETURNED present:', /RETURNED/.test(body), '| Returned prose:', /\bReturned\b/.test(body));
await browser.close();
