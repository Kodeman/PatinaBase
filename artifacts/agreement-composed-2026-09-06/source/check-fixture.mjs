// Recomputes both fixtures (Okonkwo — design services; Halvorsen — turnkey design-build)
// from source/fixtures.json inputs and checks every derived figure against the expected
// values recorded there. Then, if ../proposal.html exists, asserts every formatted figure
// string (e.g. "$22,200", "18%", "$84,134") appears at least once in the document.
// Run: node source/check-fixture.mjs   ->   prints the figure table, then PASS/FAIL.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(readFileSync(path.join(here, 'fixtures.json'), 'utf8'));
const proposalPath = path.join(here, '..', 'proposal.html');

const fail = [];
const table = []; // { fixture, label, formatted }

function eq(label, got, want) {
  if (got !== want) fail.push(`${label}: got ${got}, want ${want}`);
}

function formatMoney(cents) {
  const whole = cents % 100 === 0;
  const dollars = cents / 100;
  return (
    '$' +
    dollars.toLocaleString('en-US', {
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    })
  );
}

function formatPercent(n) {
  return `${n}%`;
}

function formatRate(cents) {
  return `${formatMoney(cents)}/h`;
}

function formatHours(n) {
  return `${n} hours`;
}

function record(fixture, label, formatted) {
  table.push({ fixture, label, formatted });
  return formatted;
}

// ---------------------------------------------------------------------------
// Okonkwo — pure design services
// ---------------------------------------------------------------------------
const ok = fixtures.okonkwo;

record(ok.house, 'Studio', ok.studio);
record(ok.house, 'Engagement', ok.engagementType);

const feeByRoleCents = {};
for (const line of ok.rateCard) {
  record(ok.house, `${line.role} rate`, formatRate(line.rateCentsPerHour));
  record(ok.house, `${line.role} planning hours`, formatHours(line.planningHours));
  feeByRoleCents[line.role] = line.rateCentsPerHour * line.planningHours;
  eq(`okonkwo ${line.role} fee`, feeByRoleCents[line.role], ok.expected.feeByRoleCents[line.role]);
  record(ok.house, `${line.role} fee`, formatMoney(feeByRoleCents[line.role]));
}

const feeEstimateTotalCents = Object.values(feeByRoleCents).reduce((s, c) => s + c, 0);
eq('okonkwo fee estimate total', feeEstimateTotalCents, ok.expected.feeEstimateTotalCents);
record(ok.house, 'Fee estimate total', formatMoney(feeEstimateTotalCents));

record(ok.house, 'Retainer', formatMoney(ok.retainerCents));
record(ok.house, 'Design authorization ceiling', formatMoney(ok.designAuthorizationCeilingCents));

const headroomUnderCeilingCents = ok.designAuthorizationCeilingCents - feeEstimateTotalCents;
eq('okonkwo headroom under ceiling', headroomUnderCeilingCents, ok.expected.headroomUnderCeilingCents);
record(ok.house, 'Headroom under ceiling', formatMoney(headroomUnderCeilingCents));

record(ok.house, 'Furnishings deposit', formatPercent(ok.furnishingsDepositPct));
record(ok.house, 'Billing cadence', ok.billingCadence);
record(ok.house, 'Month one billed', formatMoney(ok.monthOneBilledCents));

const firstInvoiceDueCents = ok.monthOneBilledCents - ok.retainerCents;
eq('okonkwo first invoice due', firstInvoiceDueCents, ok.expected.firstInvoiceDueCents);
record(ok.house, 'First invoice due (after retainer credit)', formatMoney(firstInvoiceDueCents));

record(ok.house, 'Furnishings wave', formatMoney(ok.furnishingsWaveCents));
const furnishingsDepositCents = Math.round((ok.furnishingsWaveCents * ok.furnishingsDepositPct) / 100);
eq('okonkwo furnishings deposit', furnishingsDepositCents, ok.expected.furnishingsDepositCents);
record(ok.house, 'Furnishings deposit due', formatMoney(furnishingsDepositCents));

// ---------------------------------------------------------------------------
// Halvorsen — turnkey design-build, cost-plus 18% with GMP
// ---------------------------------------------------------------------------
const hv = fixtures.halvorsen;

record(hv.house, 'Engagement', hv.engagementType);
for (const line of hv.costBasisLines) {
  record(hv.house, line.label, formatMoney(line.basisCents));
}
record(hv.house, 'Design fee (flat, separate)', formatMoney(hv.designFeeCents));
record(hv.house, 'Cost-plus fee', formatPercent(hv.feePct));
record(hv.house, 'Retainage', formatPercent(hv.retainagePct));

const costBasisCents = hv.costBasisLines.reduce((s, l) => s + l.basisCents, 0);
eq('halvorsen cost basis', costBasisCents, hv.expected.costBasisCents);
record(hv.house, 'Cost basis', formatMoney(costBasisCents));

const feeCents = Math.round((costBasisCents * hv.feePct) / 100);
eq('halvorsen fee', feeCents, hv.expected.feeCents);
record(hv.house, 'Fee', formatMoney(feeCents));

const gmpCents = Math.round(costBasisCents * (1 + hv.feePct / 100));
eq('halvorsen GMP', gmpCents, hv.expected.gmpCents);
eq('halvorsen GMP = cost basis + fee', costBasisCents + feeCents, gmpCents);
record(hv.house, 'GMP', formatMoney(gmpCents));

let scheduleOfValuesTotalCents = 0;
for (const line of hv.costBasisLines) {
  const pricedCents = Math.round(line.basisCents * (1 + hv.feePct / 100));
  eq(`halvorsen schedule of values — ${line.id}`, pricedCents, hv.expected.scheduleOfValuesCents[line.id]);
  record(hv.house, `${line.label} (schedule of values)`, formatMoney(pricedCents));
  scheduleOfValuesTotalCents += pricedCents;
}
eq('halvorsen schedule of values total', scheduleOfValuesTotalCents, hv.expected.scheduleOfValuesTotalCents);
eq('halvorsen schedule of values total = GMP', scheduleOfValuesTotalCents, gmpCents);
record(hv.house, 'Schedule of values total', formatMoney(scheduleOfValuesTotalCents));

let drawsGrossTotalCents = 0;
let drawsNetTotalCents = 0;
let retainageCumulativeCents = 0;
for (const draw of hv.draws) {
  record(hv.house, `${draw.label} draw`, formatPercent(draw.pct));

  const grossCents = Math.round((gmpCents * draw.pct) / 100);
  eq(`halvorsen ${draw.id} gross`, grossCents, hv.expected.drawsGrossCents[draw.id]);
  record(hv.house, `${draw.label} — gross`, formatMoney(grossCents));
  drawsGrossTotalCents += grossCents;

  let retainageCents = 0;
  if (draw.retainageApplies) {
    retainageCents = Math.round((grossCents * hv.retainagePct) / 100);
    eq(`halvorsen ${draw.id} retainage held`, retainageCents, hv.expected.retainageHeldCents[draw.id]);
    record(hv.house, `${draw.label} — retainage held`, formatMoney(retainageCents));

    retainageCumulativeCents += retainageCents;
    eq(`halvorsen ${draw.id} retainage cumulative`, retainageCumulativeCents, hv.expected.retainageCumulativeCents[draw.id]);
    record(hv.house, `${draw.label} — retainage cumulative`, formatMoney(retainageCumulativeCents));
  } else {
    record(hv.house, `${draw.label} — retainage held`, formatMoney(0));
  }

  const netCents = grossCents - retainageCents;
  eq(`halvorsen ${draw.id} net`, netCents, hv.expected.drawsNetCents[draw.id]);
  record(hv.house, `${draw.label} — net paid`, formatMoney(netCents));
  drawsNetTotalCents += netCents;
}
eq('halvorsen draws gross total', drawsGrossTotalCents, hv.expected.drawsGrossTotalCents);
eq('halvorsen draws gross total = GMP', drawsGrossTotalCents, gmpCents);

eq('halvorsen retainage total', retainageCumulativeCents, hv.expected.retainageTotalCents);
record(hv.house, 'Total retainage withheld', formatMoney(retainageCumulativeCents));

const finalRetainageReleaseCents = retainageCumulativeCents;
eq('halvorsen final retainage release', finalRetainageReleaseCents, hv.expected.finalRetainageReleaseCents);
record(hv.house, 'Final retainage release', formatMoney(finalRetainageReleaseCents));

const totalPaidCents = drawsNetTotalCents + finalRetainageReleaseCents;
eq('halvorsen total paid', totalPaidCents, hv.expected.totalPaidCents);
eq('halvorsen total paid = GMP', totalPaidCents, gmpCents);
record(hv.house, 'Total paid (all draws + final release)', formatMoney(totalPaidCents));

// ---------------------------------------------------------------------------
// Print the figure table, then fail fast if any recomputation drifted.
// ---------------------------------------------------------------------------
const fixtureWidth = Math.max(...table.map((r) => r.fixture.length));
const labelWidth = Math.max(...table.map((r) => r.label.length));
for (const row of table) {
  console.log(`${row.fixture.padEnd(fixtureWidth)}  ${row.label.padEnd(labelWidth)}  ${row.formatted}`);
}
console.log('');

if (fail.length) {
  console.error(fail.join('\n'));
  process.exit(1);
}
console.log(`fixture math ok (${table.length} figures)`);

// ---------------------------------------------------------------------------
// If the document exists, every formatted figure must appear in it at least once.
// ---------------------------------------------------------------------------
if (!existsSync(proposalPath)) {
  console.log('proposal.html not present — figures only');
  process.exit(0);
}

const html = readFileSync(proposalPath, 'utf8');
const missing = table.filter((row) => !html.includes(row.formatted));

if (missing.length) {
  console.error('\nfigures missing from proposal.html:');
  for (const row of missing) {
    console.error(`  ${row.fixture} — ${row.label}: ${row.formatted}`);
  }
  process.exit(1);
}

console.log(`all ${table.length} figures present in proposal.html`);
