import { open, signIn, openHouse, shot, t, IDS, axe } from './lib-r3.mjs';

const { browser, page } = await open({ height: 1400 });
await signIn(page);

/* Everything behind the fold, so every card is on the page. */
await openHouse(page, `#approval-${IDS.successor}`);
await page.waitForTimeout(1200);

const anchored = await page.evaluate(() =>
  Array.from(document.querySelectorAll('[id^="approval-"]')).map((el) => el.id),
);
console.log('== anchored approvals ==\n ', JSON.stringify(anchored, null, 1));

/* ── P-27: one act along the thread, and it points FORWARD ────────────────── */
for (const [id, label] of [
  [IDS.predecessor, 'PREDECESSOR (answered, superseded)'],
  [IDS.successor, 'SUCCESSOR / leaf (pending)'],
]) {
  const card = page.locator(`#approval-${id}`);
  const acts = await card
    .getByTestId('approval-revisions')
    .evaluate((el) =>
      Array.from(el.querySelectorAll('a')).map((a) => ({
        label: a.textContent.replace(/\s+/g, ' ').trim(),
        href: a.getAttribute('href'),
      })),
    )
    .catch(() => 'no approval-revisions element');
  console.log(`\n== ${label} · ${id} ==`);
  console.log('  approval-revisions:', JSON.stringify(acts));
  const cont = t(await card.getByTestId('approval-continuation').innerText().catch(() => ''));
  const changed = t(await card.getByTestId('approval-changed-since').innerText().catch(() => ''));
  console.log('  continuation:', cont || '(none)');
  console.log('  changed-since:', changed ? changed.replace(/\n/g, ' | ') : '(none)');
}

await shot(page, '10-successor-thread');

/* ── the past-due date line ───────────────────────────────────────────────── */
const pastDue = page.locator(`#approval-${IDS.g6overdue}`);
await pastDue.scrollIntoViewIfNeeded();
const dueLines = await page.evaluate(() =>
  Array.from(document.querySelectorAll('[data-testid="approval-due-line"]')).map((el) => ({
    card: el.closest('[id^="approval-"]')?.id ?? null,
    text: el.textContent.replace(/\s+/g, ' ').trim(),
    color: getComputedStyle(el).color,
  })),
);
console.log('\n== every approval-due-line on the doorstep ==');
for (const d of dueLines) console.log(` ${d.card} → "${d.text}"  ${d.color}`);
console.log(
  '  past-due card snooze block count:',
  await pastDue.getByTestId('approval-snooze').count(),
  '· past-due sentence:',
  t(await pastDue.getByTestId('approval-snooze-past-due').innerText().catch(() => '(none)')),
);
await shot(page, '11-past-due-date-line');

/* ── axe on the settled doorstep ──────────────────────────────────────────── */
const a = await axe(page);
console.log('\n== axe · the doorstep ==');
for (const v of a.violations) console.log(`  [${v.impact}] ${v.id} ${v.nodes.length} nodes — ${v.help}`);
console.log('  violation types:', a.violations.length);
await shot(page, '12-axe-doorstep');

/* ── vocabulary sweep ─────────────────────────────────────────────────────── */
const text = await page.evaluate(() => document.body.innerText);
const words = [
  'gate', 'gates', 'task', 'tasks', 'overdue', 'dashboard', ' AI ',
  'Declined', 'declined', 'confetti', 'badge', 'undone', 'reopened',
  'reversed', 'void', 'right_away', 'weekly_sunday', 'daily_digest',
  'click_through', 'electronic_signature', 'portal_clickthrough', 'Re-engagement',
];
const counts = Object.fromEntries(
  words.map((w) => [w.trim(), (text.match(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length]),
);
console.log('\n== vocabulary on the doorstep ==\n ', JSON.stringify(counts));
const emoji = (text.match(/\p{Extended_Pictographic}/gu) || []).length;
const numericChips = await page.evaluate(() =>
  Array.from(document.querySelectorAll('span,div,p,em,strong'))
    .filter((el) => el.children.length === 0 && /^\(?\d+\)?$/.test(el.textContent.trim()))
    .map((el) => el.textContent.trim()),
);
console.log('  emoji:', emoji, '· numeric-only leaves:', JSON.stringify(numericChips));

/* every use of "gate", in context, so a fixture string is told from a product one */
const gateBits = (text.match(/.{0,60}gate.{0,60}/gi) || []).map((s) => s.replace(/\s+/g, ' '));
if (gateBits.length) console.log('  "gate" in context:', JSON.stringify(gateBits, null, 1));

await browser.close();
