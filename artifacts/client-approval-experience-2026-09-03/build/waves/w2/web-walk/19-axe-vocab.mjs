import { readFileSync } from 'node:fs';
import { open, signIn, openHouse, t, askBy } from './lib.mjs';
const SH = '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r1';
const AXE = readFileSync('/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-integration/node_modules/.pnpm/axe-core@4.11.1/node_modules/axe-core/axe.min.js', 'utf8');

const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
await openHouse(page);

// an OPEN approval must be on the doorstep, with its acts armed
const ask = askBy(page, 'Approve the pantry shelving run?');
await ask.scrollIntoViewIfNeeded();
await ask.locator('[data-testid="approval-acts"]').getByRole('button', { name: /^APPROVE$/i }).click();
await page.waitForTimeout(600);
console.log('open approval acts armed, signature present:', await ask.locator('[data-testid="approval-signature"]').count());
await ask.screenshot({ path: `${SH}/20-axe-subject-ask.png` });

await page.addScriptTag({ content: AXE });
const res = await page.evaluate(async () => {
  const r = await window.axe.run(document, { resultTypes: ['violations'] });
  return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help,
    nodes: v.nodes.slice(0, 4).map((n) => ({ target: n.target.join(' '), summary: (n.failureSummary || '').replace(/\s+/g, ' ').slice(0, 220) })), total: v.nodes.length }));
});
console.log('\n=== AXE VIOLATIONS (whole doorstep, open approval) ===', res.length);
for (const v of res) {
  console.log(`\n[${v.impact}] ${v.id} — ${v.help}  (${v.total} node${v.total === 1 ? '' : 's'})`);
  for (const n of v.nodes) console.log('   ·', n.target, '\n     ', n.summary);
}

// scoped to the approval alone
const scoped = await page.evaluate(async () => {
  const r = await window.axe.run('[data-testid="doorstep-approval"]', { resultTypes: ['violations'] });
  return r.violations.map((v) => `${v.impact}/${v.id} x${v.nodes.length}`);
});
console.log('\n=== AXE scoped to doorstep-approval ===', JSON.stringify(scoped));

// ---- vocabulary sweep of RENDERED text ----
const text = await page.evaluate(() => document.body.innerText);
const words = ['gate', 'gates', 'task', 'tasks', 'overdue', 'dashboard', 'AI', 'Declined', 'declined', 'confetti', 'badge'];
console.log('\n=== VOCABULARY SWEEP (rendered text) ===');
for (const w of words) {
  const re = new RegExp(`\\b${w}\\b`, 'g');
  const hits = text.match(re);
  if (!hits) { console.log(`  ${w.padEnd(10)} : clean`); continue; }
  const ctx = [];
  let m; const re2 = new RegExp(`.{0,60}\\b${w}\\b.{0,60}`, 'g');
  while ((m = re2.exec(text)) && ctx.length < 4) ctx.push(m[0].replace(/\s+/g, ' '));
  console.log(`  ${w.padEnd(10)} : ${hits.length} HIT(S)`);
  ctx.forEach((c) => console.log('       …' + c + '…'));
}
console.log('\nemoji present:', /[\u{1F300}-\u{1FAFF}\u{2700}-\u{27BF}]/u.test(text));
await browser.close();
