import { open, signIn, openHouse, shot, t, IDS, BASE } from './lib.mjs';
const { browser, page } = await open({ width: 1280, height: 1400 });
await signIn(page);
await openHouse(page);
await page.waitForTimeout(2000);

// Previously lines
const lines = await page.locator('[data-testid="previously-line"]').all();
console.log('previously lines:', lines.length);
for (const l of lines) console.log('  ', t(await l.innerText()).slice(0, 140));

// open the signed trade scope by address
await page.goto(`${BASE}/projects/b0000000-0000-0000-0000-0000000000d1?proposal=${IDS.signedProposal}#door`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
const ids = await page.evaluate(() => [...new Set([...document.querySelectorAll('[data-testid]')].map(e=>e.getAttribute('data-testid')))].filter(x=>/door|receipt|keep/i.test(x)));
console.log('\ndoor testids after ?proposal=:', JSON.stringify(ids));
for (const id of ['door-gate','door-receipt','door-keep-a-copy']) {
  const loc = page.locator(`[data-testid="${id}"]`);
  const n = await loc.count();
  console.log(` ${id}: ${n}`, n ? '::' + t(await loc.first().innerText()).slice(0,200) : '');
}
const keeps = await page.getByRole('link', { name: /keep a copy/i }).all();
console.log('keep-a-copy links on this view:', keeps.length);
for (const k of keeps) console.log('   ->', await k.getAttribute('href'));
await shot(page, '07-door-signed-receipt', true);
await browser.close();
