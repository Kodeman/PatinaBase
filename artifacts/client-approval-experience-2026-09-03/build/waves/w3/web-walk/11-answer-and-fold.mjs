import { open, signIn, openHouse, shot, t, holdPress, IDS, BASE } from './lib.mjs';
const { browser, page } = await open({ width: 1280, height: 1400 });
await signIn(page);
await openHouse(page);
await page.waitForTimeout(2500);

// answer G2 (pending, no deltas) with APPROVE so a 4th record exists
const ask = page.locator(`#approval-${IDS.g2pending}`);
await ask.scrollIntoViewIfNeeded();
await ask.getByRole('button', { name: /^approve$/i }).first().click();
await page.waitForTimeout(1200);
const name = ask.locator('input').first();
await name.fill('Client User');
await page.waitForTimeout(400);
const submit = ask.getByRole('button', { name: /submit|approve/i }).last();
console.log('submit label:', t(await submit.innerText()));
await holdPress(page, submit, 1500);
await page.waitForTimeout(4000);
console.log('\nask after answer:', t(await ask.innerText()).slice(0, 700));
const keep = ask.getByRole('link', { name: /keep a copy/i });
console.log('keep-a-copy beside the ask stamp:', await keep.count(), await keep.count() ? await keep.first().getAttribute('href') : '');
await shot(page, '13-ask-answered-keep-a-copy', false);

// reload, read the records order
await openHouse(page);
await page.waitForTimeout(2500);
const order = await page.evaluate(() => {
  const sec = document.querySelector('[data-testid="approval-records"]');
  const shown = [...sec.querySelectorAll('[data-testid="doorstep-approval-receipt"]')].map(
    (e) => ({ id: (e.id || e.querySelector('[id^="approval-"]')?.id || '').replace('approval-',''), text: (e.innerText||'').replace(/\s+/g,' ').trim().slice(0,80) }));
  const anchors = [...sec.querySelectorAll('[id^="approval-"]')].map(e=>e.id);
  return { shown, anchors, fold: !!sec.innerText.match(/Read the earlier approvals/i) };
});
console.log('\nrecords shown:', JSON.stringify(order, null, 1));
await browser.close();
