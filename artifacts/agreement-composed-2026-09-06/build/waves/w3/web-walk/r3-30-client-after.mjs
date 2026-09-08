import { launch, shot, shot390, textOf, CLIENT, DESIGNER, HERE } from './lib3.mjs';

const PR = 'edf7b496-4d74-4485-b47d-66b1f101a84f';

const { browser, ctx } = await launch({ state: `${HERE}/r3-client-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
await page.goto(`${CLIENT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(10000);
const t = await textOf(page);
console.log('=== THE DOOR, EXECUTED ===');
console.log(t.slice(0, 3200));
await shot(page, 'r3-30a-door-executed');
await shot390(page, 'r3-30b-door-executed-390');
console.log('\ndoor names Rough-in:', /Rough-in/i.test(t));
console.log('door names $23,978:', /23,978/.test(t));
console.log('door names a waiver:', /waiver/i.test(t));
console.log('door names the deposit invoice:', /8,413/.test(t));

// THE PAPERS, IN FULL — is the executed instrument readable?
await page.getByText('THE PAPERS, IN FULL', { exact: false }).first().click();
await page.waitForTimeout(5000);
await shot(page, 'r3-30c-papers-in-full');
const tp = await textOf(page);
console.log('\n=== THE PAPERS, IN FULL (executed) ===');
console.log(tp.slice(0, 2500));
const routes = await page.evaluate(() => ({
  anchors: Array.from(document.querySelectorAll('a')).map((a) => `${(a.innerText || '').trim().slice(0, 40)} -> ${a.getAttribute('href')}`),
  buttons: Array.from(document.querySelectorAll('button')).map((b) => (b.innerText || '').trim().slice(0, 40)).filter(Boolean),
}));
console.log('ANCHORS:', JSON.stringify(routes.anchors, null, 0).slice(0, 1800));
console.log('BUTTONS:', JSON.stringify(routes.buttons, null, 0).slice(0, 1200));

// the studio's project Money region (R52 · does the adopted deposit show?)
const d = await launch({ state: `${HERE}/r3-designer-state.json` });
const dp = await d.ctx.newPage();
await dp.goto(`${DESIGNER}/doc/${PR}`, { waitUntil: 'domcontentloaded' });
await dp.waitForTimeout(15000);
const td = await textOf(dp);
const money = td.split('THE MONEY')[1]?.slice(0, 1500) ?? '(no money region)';
console.log('\n=== PROJECT · MONEY ===');
console.log(money);
console.log('names INV-0001 (adopted deposit):', /INV-0001|Deposit at signing/.test(td));
console.log('names INV-0002 (Rough-in):', /INV-0002|Rough-in/.test(td));
await shot(dp, 'r3-30d-project-money');
await d.browser.close();
await browser.close();
