import { launch, shot, textOf, CLIENT, HERE } from './lib2.mjs';

const { browser, ctx } = await launch({ state: `${HERE}/r2-client-state.json` });
const page = await ctx.newPage();
await page.goto(`${CLIENT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(11000);
const t = await textOf(page);
console.log('=== THE DOOR (a second, price-hidden paper waits) ===');
console.log(t.slice(0, 2600));
await shot(page, 'rb-36a-door-priceless');
const rf = page.getByText(/read (it )?in full/i).first();
if (await rf.count()) {
  await rf.click();
  await page.waitForTimeout(5000);
  const tf = await textOf(page);
  const i = tf.lastIndexOf("DESIGN-BUILD AGREEMENT");
  console.log('\n=== THE PRICE-HIDDEN PAPER, IN FULL ===');
  console.log(tf.slice(i, i + 3500));
  console.log('\npaper names a GMP:', /GUARANTEED MAXIMUM/i.test(tf));
  console.log('paper names $84,134:', tf.includes('84,134'));
  await shot(page, 'rb-36b-paper-priceless');
}
await browser.close();
