/** (c) Vocabulary grep of RENDERED text on both portals. */
import fs from 'node:fs';
import { browser, ctx, HERE } from './lib.mjs';

const COMMON = [
  ['column name', /\b(part_key|proposal_id|client_visible|billing_ceiling_cents|retainer_amount_cents|billing_cadence|furnishings_deposit_percent|source_template_key|source_part_id|document_kind|commercial_state|rate_card|per_phase|percent_of_cost|cost_plus|day_rate|pricing_basis|studio_agreement_defaults|proposal_agreement_parts|proposal_service_terms|proposal_service_rates)\b/g],
  ['variant', /\bvariants?\b/gi],
  ['clause library', /clause librar/gi],
  ['contract builder', /contract builder/gi],
  ['AI', /(^|[^A-Za-z])AI([^A-Za-z]|$)/g],
];
const HOMEOWNER = [
  ['gate', /\bgates?\b/gi],
  ['task', /\btasks?\b/gi],
  ['dashboard', /\bdashboards?\b/gi],
  ['overdue', /\boverdue\b/gi],
];
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu;

function scan(label, text, rules) {
  const hits = [];
  for (const [name, re] of rules) {
    for (const m of text.matchAll(re)) {
      const i = Math.max(0, m.index - 60);
      hits.push(`${name}: …${text.slice(i, m.index + m[0].length + 60).replace(/\s+/g, ' ')}…`);
    }
  }
  for (const m of text.matchAll(EMOJI)) {
    const i = Math.max(0, m.index - 50);
    hits.push(`emoji ${m[0]}: …${text.slice(i, m.index + 50).replace(/\s+/g, ' ')}…`);
  }
  console.log(`\n=== ${label} — ${hits.length} hit(s) ===`);
  for (const h of [...new Set(hits)]) console.log('  ' + h);
}

const b = await browser();

// Designer surfaces
{
  const c = await ctx(b, { storageState: `${HERE}/state-designer.json` });
  const page = await c.newPage();
  const pages = [
    ['designer /desk', 'http://localhost:3000/desk', null],
    ['designer Contract Room (composed)', `http://localhost:3000/drafting/${process.argv[2]}`, 'nav[aria-label="Agreement parts"] li'],
  ];
  for (const [label, url, waitFor] of pages) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    if (waitFor) { for (let i = 0; i < 60; i++) { if (await page.locator(waitFor).count()) break; await page.waitForTimeout(2000); } }
    await page.waitForTimeout(7000);
    const t = await page.evaluate(() => document.body.innerText);
    fs.writeFileSync(`${HERE}/vocab-${label.replace(/\W+/g, '-')}.txt`, t);
    scan(label, t, COMMON);
  }
  // The composer's own sub-surfaces
  await page.getByRole('button', { name: /Preview client copy/i }).click();
  await page.waitForTimeout(2500);
  let t = await page.evaluate(() => document.body.innerText);
  scan('designer · client-copy preview', t, COMMON);
  await page.keyboard.press('Escape'); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /\+ Add a part/ }).click();
  await page.waitForTimeout(1200);
  t = await page.evaluate(() => document.body.innerText);
  scan('designer · Add a part menu', t, COMMON);
  await c.close();
}

// Homeowner surfaces
{
  const c = await ctx(b, { storageState: `${HERE}/state-client.json` });
  const page = await c.newPage();
  for (const [label, url] of [
    ['homeowner /', 'http://localhost:3002/'],
    ['homeowner Aspen (composed, door open)', 'http://localhost:3002/projects/b0000000-0000-0000-0000-0000000000d1'],
  ]) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(15000);
    const read = page.getByRole('button', { name: /READ IT IN FULL/i });
    if (await read.count()) { await read.first().click(); await page.waitForTimeout(3500); }
    const t = await page.evaluate(() => document.body.innerText);
    fs.writeFileSync(`${HERE}/vocab-${label.replace(/\W+/g, '-')}.txt`, t);
    scan(label, t, [...COMMON, ...HOMEOWNER]);
  }
  await c.close();
}
await b.close();
