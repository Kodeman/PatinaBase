import { open, signIn, openHouse, shot, t } from './lib.mjs';

const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
await openHouse(page);

const asks = page.locator('[data-testid="doorstep-approval"]');
const n = await asks.count();
console.log(`doorstep approvals: ${n}\n`);
for (let i = 0; i < n; i++) {
  const a = asks.nth(i);
  const plate = t(await a.locator('[data-testid="approval-plate-title"]').first().innerText().catch(() => '?'));
  const q = t(await a.locator('[data-testid="approval-question"]').first().innerText().catch(() => '?')).slice(0, 46);
  const imm = await a.locator('[data-testid="immutability-sentence"]').count();
  const immTxt = imm ? t(await a.locator('[data-testid="immutability-sentence"]').first().innerText()) : '—';
  const acts = await a.locator('[data-testid="approval-acts"] button').count();
  const actLabels = [];
  for (let j = 0; j < acts; j++) actLabels.push(t(await a.locator('[data-testid="approval-acts"] button').nth(j).innerText()));
  const stamp = await a.locator('[data-testid="approval-stamp"]').count();
  const stampTxt = stamp ? t(await a.locator('[data-testid="approval-stamp"]').first().innerText()) : '—';
  const review = await a.locator('[data-testid="approval-review-count"]').count();
  const reviewTxt = review ? t(await a.locator('[data-testid="approval-review-count"]').first().innerText()) : '—';
  console.log(`[${i}] ${q}`);
  console.log(`     acts=[${actLabels.join(', ')}]  stamp=${stampTxt}`);
  console.log(`     review=${reviewTxt}`);
  console.log(`     immut=${immTxt}`);
}
await browser.close();
