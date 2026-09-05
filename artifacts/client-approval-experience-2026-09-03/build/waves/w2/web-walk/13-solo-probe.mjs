import { open, shot, t, BASE } from './lib.mjs';
const SH = '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r1';
const PROJECT = 'b0000000-0000-0000-0000-00000000c0d1';
const { browser, page } = await open({ width: 1280, height: 1100 });
await page.goto(`${BASE}/auth/signin`, { waitUntil: 'domcontentloaded' });
const disc = page.getByRole('button', { name: /use email and password instead/i }).first();
const pw = page.getByLabel(/password/i).first();
for (let i = 0; i < 20; i++) { try { await disc.click(); await pw.waitFor({ state: 'visible', timeout: 3000 }); break; } catch {} }
await page.getByLabel(/email/i).first().fill('client-solo@patina.dev');
await pw.fill('password123');
await page.getByRole('button', { name: /^sign in$/i }).click();
await page.waitForURL((u) => !u.pathname.includes('/auth/signin'), { timeout: 60000 });
await page.goto(`${BASE}/projects/${PROJECT}`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('doorplate').first().waitFor({ state: 'visible', timeout: 60000 });
for (let i = 0; i < 360; i++) { if ((await page.getByTestId('threshold-hold').count()) === 0) break; await page.waitForTimeout(250); }
await shot(page, '13-solo-doorstep');
for (const id of ['door-way','door-leaf','door-summary','door-receipt','door-lines','door-hint','wall-gate','scope-change-ask','previously-line','doorstep-approval']) {
  const n = await page.locator(`[data-testid="${id}"]`).count();
  if (n) console.log(`${id}: ${n}`);
}
const dw = page.locator('[data-testid="door-way"]').first();
if (await dw.count()) { console.log('--- DOOR ---'); console.log(t(await dw.innerText()).slice(0, 1400)); }
await browser.close();
