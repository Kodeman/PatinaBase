// Recomputes the Lindqvist fixture from the spine (source/proposal.md section 6).
// Trade prices and the stated client prices are the only inputs; everything else is derived.
// Run: node source/check-math.mjs   ->   prints "math ok" or throws.

const fail = [];
function eq(label, got, want) {
  const g = Math.round(got * 1000) / 1000;
  const w = Math.round(want * 1000) / 1000;
  if (g !== w) fail.push(`${label}: got ${g}, want ${w}`);
}

// ---- the six lines: trade each, quantity ----
const lines = [
  { code: 'SO-01', tradeEach: 6400, qty: 1 },
  { code: 'CH-01', tradeEach: 1850, qty: 2 },
  { code: 'CT-01', tradeEach: 2200, qty: 1 },
  { code: 'LT-01', tradeEach: 640, qty: 1 },
  { code: 'RG-01', tradeEach: 2900, qty: 1 },
  { code: 'ST-01', tradeEach: 520, qty: 2 },
];
const tradeLine = Object.fromEntries(lines.map((l) => [l.code, l.tradeEach * l.qty]));
const tradeTotal = lines.reduce((s, l) => s + l.tradeEach * l.qty, 0);
eq('trade total', tradeTotal, 16880);

// ---- uniform 35% on cost, client unit rounded to the nearest $5 ----
const round5 = (n) => Math.round(n / 5) * 5;
const uniformUnit = Object.fromEntries(lines.map((l) => [l.code, round5(l.tradeEach * 1.35)]));
eq('SO-01 uniform unit', uniformUnit['SO-01'], 8640);
eq('CH-01 uniform unit', uniformUnit['CH-01'], 2500);
eq('CT-01 uniform unit', uniformUnit['CT-01'], 2970);
eq('LT-01 uniform unit', uniformUnit['LT-01'], 865);
eq('RG-01 uniform unit', uniformUnit['RG-01'], 3915);
eq('ST-01 uniform unit', uniformUnit['ST-01'], 700);

const uniformLine = Object.fromEntries(lines.map((l) => [l.code, uniformUnit[l.code] * l.qty]));
const uniformTotal = lines.reduce((s, l) => s + uniformLine[l.code], 0);
eq('uniform client total', uniformTotal, 22790);
eq('uniform margin', uniformTotal - tradeTotal, 5910);
eq('uniform blended markup on cost %', ((uniformTotal - tradeTotal) / tradeTotal) * 100, 35.012);
eq('uniform margin on price %', ((uniformTotal - tradeTotal) / uniformTotal) * 100, 25.932);

// ---- the Blend: sofa taken to $7,900; the $740 spreads over the unlocked lines ----
const blendLine = {
  'SO-01': 7900,
  'CH-01': 5360, // 2,680 each
  'CT-01': 3185,
  'LT-01': 930,
  'RG-01': 3915, // locked at published retail
  'ST-01': 1500, // 750 each
};
const sofaDrop = blendLine['SO-01'] - uniformLine['SO-01'];
eq('sofa delta', sofaDrop, -740);

// proportional target over unlocked trade, before the $5 rounding and the lamp remainder
const unlockedTrade = tradeLine['CH-01'] + tradeLine['CT-01'] + tradeLine['LT-01'] + tradeLine['ST-01'];
eq('unlocked trade', unlockedTrade, 7580);
const share = (code) => (tradeLine[code] / unlockedTrade) * 740;
for (const code of ['CH-01', 'CT-01', 'LT-01', 'ST-01']) {
  const stated = blendLine[code] - uniformLine[code];
  const target = share(code);
  if (Math.abs(stated - target) > 5) fail.push(`${code} spread ${stated} is more than $5 from the proportional target ${target.toFixed(2)}`);
}

const deltas = Object.fromEntries(Object.keys(blendLine).map((c) => [c, blendLine[c] - uniformLine[c]]));
eq('CH-01 delta', deltas['CH-01'], 360);
eq('CT-01 delta', deltas['CT-01'], 215);
eq('LT-01 delta', deltas['LT-01'], 65);
eq('ST-01 delta', deltas['ST-01'], 100);
eq('RG-01 delta', deltas['RG-01'], 0);
eq('deltas sum to zero', Object.values(deltas).reduce((s, d) => s + d, 0), 0);

const blendTotal = Object.values(blendLine).reduce((s, v) => s + v, 0);
eq('blend client total holds', blendTotal, 22790);
eq('blend margin', blendTotal - tradeTotal, 5910);
eq('blend blended markup on cost %', ((blendTotal - tradeTotal) / tradeTotal) * 100, 35.012);

// per-line markup on cost after the Blend
const markup = (code) => (blendLine[code] / tradeLine[code] - 1) * 100;
eq('SO-01 markup %', markup('SO-01'), 23.438);
eq('CH-01 markup %', markup('CH-01'), 44.865);
eq('CT-01 markup %', markup('CT-01'), 44.773);
eq('LT-01 markup %', markup('LT-01'), 45.313);
eq('ST-01 markup %', markup('ST-01'), 44.231);
eq('RG-01 markup %', markup('RG-01'), 35);

// the sofa trips the 25% floor, measured as margin on price
const sofaMargin = blendLine['SO-01'] - tradeLine['SO-01'];
eq('SO-01 line margin', sofaMargin, 1500);
eq('SO-01 margin on price %', (sofaMargin / blendLine['SO-01']) * 100, 18.987);
if (!((sofaMargin / blendLine['SO-01']) * 100 < 25)) fail.push('SO-01 should trip the 25% floor');

// ---- the authorization: four lines released ----
const released = ['SO-01', 'CH-01', 'CT-01', 'RG-01'];
const authSubtotal = released.reduce((s, c) => s + blendLine[c], 0);
eq('authorization subtotal', authSubtotal, 20360);
eq('deposit at 50%', authSubtotal * 0.5, 10180);
eq('balance on delivery', authSubtotal - authSubtotal * 0.5, 10180);
const authTrade = released.reduce((s, c) => s + tradeLine[c], 0);
eq('authorization trade', authTrade, 15200);
eq('authorization margin', authSubtotal - authTrade, 5160);
eq('authorization margin on price %', ((authSubtotal - authTrade) / authSubtotal) * 100, 25.344);

// ---- price history: CT-01 re-verified, trade rises, client price unchanged ----
const ctNewTrade = 2310;
eq('CT-01 old markup %', markup('CT-01'), 44.773);
eq('CT-01 new markup %', (blendLine['CT-01'] / ctNewTrade - 1) * 100, 37.879);
eq('CT-01 trade rise %', (ctNewTrade / tradeLine['CT-01'] - 1) * 100, 5);

if (fail.length) {
  console.error(fail.join('\n'));
  process.exit(1);
}
console.log('math ok');
