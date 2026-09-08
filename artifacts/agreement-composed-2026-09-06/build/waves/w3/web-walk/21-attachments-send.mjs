import { launch, shot, dismissOverlays, HERE } from './lib.mjs';
import fs from 'node:fs';

const url = fs.readFileSync(`${HERE}/room-url.txt`, 'utf8').trim();
const { browser, ctx } = await launch({ state: `${HERE}/designer-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
page.on('response', async (r) => {
  const u = r.url();
  if (u.includes('/rest/v1/rpc/') || u.includes('/functions/v1/')) {
    const n = u.split('/').pop();
    if (/upsert_agreement_parts|send_commercial_document|proposal-send/.test(n)) {
      let b = ''; try { b = (await r.text()).slice(0, 500); } catch {}
      console.log('NET', n, r.status(), b);
    }
  }
});
const right = () =>
  page.evaluate(() => {
    const m = document.querySelector('nav[aria-label="Agreement parts"]')?.parentElement;
    return m ? m.children[2].innerText : '';
  });
const openPart = async (n) => {
  await page.locator('nav[aria-label="Agreement parts"] button', { hasText: n }).first().click();
  await page.waitForTimeout(800);
};

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(11000);
await dismissOverlays(page);

// STEP 9 — attachments strip: jurisdiction notices + lien waiver
console.log('\n=== STEP 9 · right rail ===');
console.log(await right());
const jur = await page.evaluate(() => {
  const els = Array.from(document.querySelectorAll('div,section'));
  const el = els.find((d) => d.innerText?.trim().startsWith('JURISDICTION NOTICES') || d.innerText?.trim().startsWith('Jurisdiction notices'));
  return el ? el.outerHTML.slice(0, 4000) : 'NOT FOUND';
});
console.log('\n=== jurisdiction panel html ===');
console.log(jur);
await shot(page, '21a-attachments-rail');

// (e) R39 — hide a part from the client
await openPart('Termination');
await page.locator('label', { hasText: 'Hidden from your client' }).locator('input[type="checkbox"]').check();
await page.waitForTimeout(700);
await page.getByRole('button', { name: 'Save agreement' }).click();
await page.waitForTimeout(8000);
console.log('\n=== after hiding Termination · client copy ===');
console.log((await right()).split("THE CLIENT'S COPY")[1]?.slice(0, 2500));
await shot(page, '21b-termination-hidden');
await browser.close();
