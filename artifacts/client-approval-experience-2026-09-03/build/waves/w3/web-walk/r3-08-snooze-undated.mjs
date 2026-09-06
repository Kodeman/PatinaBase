import { open, signIn, openHouse, shot, t, IDS } from './lib-r3.mjs';

/* 1 · the standing hold survives a cold load (`W3W-R1-02`, re-verified)
   2 · "When it's due" is not offered on an approval with no date.

   `project_approval_artifacts.due_at` is NOT NULL, so no such row can be
   seeded; the leg is walked by nulling `dueAt` in the PROJECTION RESPONSE on
   its way to the browser. The component under test is the shipped one — only
   the row it is handed is shaped by the harness. */

const { browser, page } = await open({ height: 1400 });
await signIn(page);

await openHouse(page, '');
await page.waitForTimeout(2000);
const card = page.locator(`#approval-${IDS.successor}`);
await card.scrollIntoViewIfNeeded();
const sn = card.getByTestId('approval-snooze');
console.log('== cold load, with kind=never / snoozed_until=infinity standing ==');
console.log('  said count:', await card.getByTestId('approval-snooze-said').count());
console.log('  said:', t(await card.getByTestId('approval-snooze-said').first().innerText().catch(() => '(none)')));
await shot(page, '20-snooze-survives-reload');

/* ── the undated ask ──────────────────────────────────────────────────────── */
await page.route('**/rest/v1/rpc/list_my_project_decision_reviews', async (route) => {
  const res = await route.fetch();
  const body = await res.json();
  const rows = Array.isArray(body) ? body : body?.rows ?? body;
  let touched = 0;
  const strip = (r) => {
    if (r && typeof r === 'object' && r.decisionId === '644b3058-78c3-4f36-aa2d-c11992940ff5') {
      touched += 1;
      return { ...r, dueAt: null, isOverdue: false };
    }
    return r;
  };
  const next = Array.isArray(rows) ? rows.map(strip) : rows;
  console.log('  [route] nulled dueAt on', touched, 'row(s)');
  await route.fulfill({ response: res, json: next });
});

await openHouse(page, '');
await page.waitForTimeout(2500);
console.log('  cards on the page:', JSON.stringify(await page.evaluate(() =>
  Array.from(document.querySelectorAll('[id^="approval-"]')).map((e) => e.id).filter((i) => /^approval-(record-)?[0-9a-f]{8}-/.test(i)))));
console.log('  "Hall lantern" anywhere in the body:', await page.evaluate(() => document.body.innerText.includes('Hall lantern')));
const undated = page.locator(`#approval-${IDS.fifth}`);
if (await undated.count() === 0) { await shot(page, '21-undated-card-absent', true); await browser.close(); process.exit(0); }
await undated.scrollIntoViewIfNeeded();
const acts = await undated
  .getByTestId('approval-snooze')
  .evaluate((el) => Array.from(el.querySelectorAll('button')).map((b) => b.textContent.replace(/\s+/g, ' ').trim()));
console.log('\n== Remind me, on an UNDATED approval ==');
console.log('  acts:', JSON.stringify(acts));
console.log('  due-line nodes on that card:', await undated.getByTestId('approval-due-line').count());
console.log('  card text:', t(await undated.innerText()).slice(0, 420));
await shot(page, '21-undated-no-when-its-due');

await browser.close();
