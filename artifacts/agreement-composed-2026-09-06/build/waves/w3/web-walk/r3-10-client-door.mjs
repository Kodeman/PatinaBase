import { launch, shot, shot390, textOf, CLIENT, HERE } from './lib3.mjs';

const { browser, ctx } = await launch({ state: `${HERE}/r3-client-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
await page.goto(`${CLIENT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);
console.log('=== THE DOOR ===');
const t = await textOf(page);
console.log(t.slice(0, 3000));
await shot(page, 'r3-10a-door');
await shot390(page, 'r3-10b-door-390');

// "Ask a question" — R30 carried
console.log('\ndoor offers "Ask a question":', /Ask a question/i.test(t));

// read the whole paper
const readAll = page.getByRole('button', { name: /Read (it |the )?in full|Read in full/i }).first();
if (await readAll.count()) {
  await readAll.click();
} else {
  const alt = page.getByText(/read (it )?in full/i).first();
  if (await alt.count()) await alt.click();
}
await page.waitForTimeout(4000);
await shot(page, 'r3-10c-read-in-full');
console.log('\n=== THE PAPER, IN FULL ===');
console.log((await textOf(page)).slice(0, 9000));
await browser.close();
