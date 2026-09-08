import { launch, shot, textOf, CLIENT, HERE } from './lib2.mjs';

const { browser, ctx } = await launch({ state: `${HERE}/r2-client-state.json` });
const page = await ctx.newPage();
await page.goto(`${CLIENT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(10000);

// every link and button on the door, so the keepsake route (if any) is visible
const acts = await page.evaluate(() =>
  Array.from(document.querySelectorAll('a,button')).map((e) => ({
    tag: e.tagName,
    href: e.getAttribute('href'),
    text: (e.innerText || '').replace(/\n/g, ' ').trim().slice(0, 60),
  })).filter((e) => e.text),
);
console.log('DOOR ACTS:', JSON.stringify(acts, null, 0));

// the Previously entry
const prev = page.getByText('Design-build agreement · Client User', { exact: false }).first();
if (await prev.count()) {
  await prev.click();
  await page.waitForTimeout(5000);
  const t = await textOf(page);
  console.log('\nafter clicking Previously — url:', page.url().replace(CLIENT, ''));
  console.log('shows the agreement body:', /GUARANTEED MAXIMUM PRICE/i.test(t));
  console.log(t.slice(0, 1200));
  await shot(page, 'rb-32-previously-clicked');
}
await browser.close();
