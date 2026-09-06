import { open, signIn, openHouse, shot, t, holdPress, IDS } from './lib-r3.mjs';

/* Two answers, recorded by the browser: a RETURN (press-and-hold, no name) and
   an APPROVE (typed legal name + press-and-hold). Both are regression legs,
   and the Return is also the only way to mint the click_through row the
   Record of Decision's "Confirmed by press-and-hold." needs. */

const { browser, page } = await open({ height: 1400 });
await signIn(page);

async function answer(id, act, { note, name } = {}) {
  await openHouse(page, '');
  await page.waitForTimeout(2000);
  const card = page.locator(`#approval-${id}`);
  await card.scrollIntoViewIfNeeded();
  await card.getByTestId('approval-acts').waitFor({ state: 'visible', timeout: 30000 });
  await card.getByRole('button', { name: new RegExp(`^${act}$`, 'i') }).click();
  await page.waitForTimeout(700);
  const confirm = card.getByTestId('approval-confirm-outcome');
  console.log(`\n== ${act} on ${id} ==`);
  console.log('  consequence:', t(await card.getByTestId('approval-consequence').innerText()));

  if (note) {
    await card.getByTestId('approval-change-note').fill(note);
    console.log('  change-note help:', t(await card.getByTestId('approval-change-note-help').innerText()));
  }
  const submit = confirm.getByRole('button', { name: /submit response/i });
  if (name) {
    console.log('  signature line present:', await card.getByTestId('approval-signature').count());
    console.log('  submit disabled before the name:', await submit.isDisabled());
    await card.getByTestId('approval-signature').fill(name);
    await page.waitForTimeout(400);
    console.log('  submit disabled after the name:', await submit.isDisabled());
    await shot(page, `22-approve-signature-${id.slice(0, 8)}`);
  }

  /* a tap is not enough — the act is held */
  await submit.click();
  await page.waitForTimeout(1200);
  console.log('  after a plain click, still asking:', (await confirm.count()) > 0);

  await holdPress(page, submit, 1800);
  await page.waitForTimeout(4000);
  const settled = t(await card.innerText());
  console.log('  card after the hold:', settled.replace(/\n/g, ' | ').slice(0, 460));
  await shot(page, `23-answered-${id.slice(0, 8)}`);
}

await answer(IDS.fifth, 'Approve', { name: 'Client User' });

await browser.close();
