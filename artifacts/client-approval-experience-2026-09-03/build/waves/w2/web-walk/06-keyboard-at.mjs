import { open, signIn, openHouse, t, askBy } from './lib.mjs';
const SH = '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r1';
const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
await openHouse(page);

async function arm(question, outcome, name) {
  const ask = askBy(page, question);
  await ask.scrollIntoViewIfNeeded();
  const acts = ask.locator('[data-testid="approval-acts"]');
  await acts.getByRole('button', { name: new RegExp(`^${outcome}$`, 'i') }).click();
  await page.waitForTimeout(400);
  if (name) {
    await ask.locator('[data-testid="approval-signature"]').first().fill(name);
    await page.waitForTimeout(200);
  }
  return { ask, submit: acts.getByRole('button', { name: /submit response/i }).first() };
}
const stamp = async (ask) => t(await ask.locator('[data-testid="approval-stamp"]').first().textContent().catch(() => '(none)'));

// ---- keyboard Enter hold, on WEBK ----
{
  const { ask, submit } = await arm('Approve the stair rail profile?', 'APPROVE', 'Client User');
  await submit.focus();
  console.log('KB focused:', await submit.evaluate((el) => el === document.activeElement));
  await page.keyboard.down('Enter');
  await page.waitForTimeout(300);
  console.log('KB 300ms hold-state:', await submit.getAttribute('data-hold-state'));
  await page.waitForTimeout(1100);
  await page.keyboard.up('Enter');
  await page.waitForTimeout(2800);
  console.log('KB RESULT stamp:', await stamp(ask));
  await ask.screenshot({ path: `${SH}/07-keyboard-enter-approved.png` });
}

// ---- synthetic AT click, on WEBS ----
{
  const { ask, submit } = await arm('Approve the entry tile layout?', 'APPROVE', 'Client User');
  // a real quick pointer tap: must NOT submit
  const b = await submit.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up();
  await page.waitForTimeout(400);
  console.log('AT after quick tap        :', await stamp(ask));
  // synthetic click INSIDE the pointer tail: must be refused
  await submit.evaluate((el) => el.click());
  await page.waitForTimeout(1200);
  console.log('AT synthetic in tail      :', await stamp(ask));
  // synthetic click AFTER the tail: must be taken
  await page.waitForTimeout(900);
  await submit.evaluate((el) => el.click());
  await page.waitForTimeout(2800);
  console.log('AT synthetic after tail   :', await stamp(ask));
  await ask.screenshot({ path: `${SH}/08-assistive-click-approved.png` });
}
await browser.close();
