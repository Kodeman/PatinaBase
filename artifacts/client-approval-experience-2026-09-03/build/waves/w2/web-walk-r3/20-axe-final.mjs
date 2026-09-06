import { open, signIn, openHouse, t, askBy } from './lib.mjs';
const SH = '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r3';
const AXE = '/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-integration/node_modules/.pnpm/axe-core@4.11.1/node_modules/axe-core/axe.min.js';
const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
await openHouse(page);
const ask = askBy(page, 'stair hall sconces');
await ask.scrollIntoViewIfNeeded();
await ask.locator('[data-testid="approval-acts"] button').filter({ hasText: 'APPROVE' }).first().click();
await page.waitForTimeout(400);
await ask.locator('[data-testid="approval-signature"]').first().fill('Client User');
await page.waitForTimeout(400);
await ask.screenshot({ path: `${SH}/20-axe-subject-open-approval.png` });
await page.addScriptTag({ path: AXE });
const res = await page.evaluate(async () => await window.axe.run(document, { resultTypes: ['violations'] }));
console.log('VIOLATIONS:', res.violations.length);
const scoped = await page.evaluate((vs) => {
  const out = [];
  for (const v of vs) {
    const nodes = v.nodes.map((sel) => {
      let el = null; try { el = document.querySelector(sel); } catch {}
      return { sel, inApproval: !!el?.closest('[data-testid="doorstep-approval"]'), inDoor: !!el?.closest('[data-threshold-unit="door"]') };
    });
    out.push({ id: v.id, impact: v.impact, total: nodes.length,
      inApproval: nodes.filter((n) => n.inApproval).length,
      inDoor: nodes.filter((n) => n.inDoor).length,
      elsewhere: nodes.filter((n) => !n.inApproval && !n.inDoor).length });
  }
  return out;
}, res.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target.join(' ')) })));
for (const v of scoped) console.log(`  [${v.impact}] ${v.id}: ${v.total} nodes — inApproval=${v.inApproval} inDoor=${v.inDoor} elsewhere=${v.elsewhere}`);
const serious = scoped.filter((v) => v.impact === 'serious' || v.impact === 'critical');
console.log('\nSERIOUS/CRITICAL contrast nodes INSIDE a doorstep-approval:',
  serious.filter((v) => v.id === 'color-contrast').reduce((a, v) => a + v.inApproval, 0));
for (const v of res.violations) {
  console.log(`\n[${v.impact}] ${v.id} — ${v.help}`);
  for (const n of v.nodes.slice(0, 3)) console.log('   •', n.target.join(' ').slice(0, 120), '|', (n.failureSummary || '').replace(/\s+/g, ' ').slice(0, 150));
}
console.log('\nmakers-mark nodes on the whole doorstep:', await page.locator('[data-testid="approval-makers-mark"]').count());
console.log('plates:', await page.locator('[data-testid="approval-plate"]').count());
await browser.close();
