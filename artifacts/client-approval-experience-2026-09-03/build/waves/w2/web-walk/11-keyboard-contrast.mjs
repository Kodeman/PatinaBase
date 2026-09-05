import { open, signIn, openHouse, askBy } from './lib.mjs';
const SH = '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r1';
const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
await openHouse(page);
const ask = askBy(page, 'Approve the hall runner width?');
await ask.scrollIntoViewIfNeeded();
const acts = ask.locator('[data-testid="approval-acts"]');
await acts.getByRole('button', { name: /^HOLD$/i }).click();
await page.waitForTimeout(500);
const submit = acts.getByRole('button', { name: /submit response/i }).first();
await submit.focus();

const read = async (label) => {
  const r = await submit.evaluate((el) => {
    const pool = el.querySelector('.da-pool');
    const word = el.querySelector('.da-word') || el;
    return {
      state: el.getAttribute('data-hold-state'),
      active: el.matches(':active'),
      wordColor: getComputedStyle(word).color,
      poolBg: getComputedStyle(pool).backgroundColor,
      clip: getComputedStyle(pool).clipPath,
    };
  });
  console.log(label, JSON.stringify(r));
  return r;
};

await read('before hold      :');
await page.keyboard.down('Enter');
await page.waitForTimeout(500);
const mid = await read('mid keyboard hold:');
await submit.screenshot({ path: `${SH}/11-keyboard-hold-midfill.png` });
await page.keyboard.up('Enter');
await page.waitForTimeout(2500);
console.log('stamps:', await ask.locator('[data-testid="approval-stamp"]').count());

// contrast ratio helper
const lum = (c) => { const [r,g,b] = c.match(/\d+(\.\d+)?/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);}); return 0.2126*r+0.7152*g+0.0722*b; };
const L1 = lum(mid.wordColor), L2 = lum(mid.poolBg);
console.log('word/pool contrast ratio during keyboard hold:', (((Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05))).toFixed(2));
await browser.close();
