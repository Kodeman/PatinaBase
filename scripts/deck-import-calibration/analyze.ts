/// <reference lib="deno.ns" />
// SQ-362 calibration · step 6: metrics and threshold choice (no DB, no network).
//
//   deno run -A scripts/deck-import-calibration/analyze.ts > tables.md
//
// Reads $CAL_DIR/{catalog,queries,results,pairing,embed}.json (calibrate.ts)
// and prints the REPORT tables as Markdown; writes $CAL_DIR/metrics.json.
// Only anonymized numbers and retailer domains leave this script.
//
// Targets (ticket): strong precision ≥ 0.98 (T1 exact cosine, T1 dHash,
// pairing), likely precision ≥ 0.85 (T2 image-only). Precision is counted per
// shown candidate for strong tiers (every strong row must be right) and on the
// top hit for likely (only the top hit can be likely). Recall is over the
// positive queries. Each pick also needs the target to hold at every stricter
// setting on the grid, so a lucky dip in the curve is never chosen. Where the
// tier fires often enough (likely, pairing) the Wilson 95% lower bound must
// meet the target; T1 strong rows are too few for that (a bound of 0.98 needs
// ~190 straight hits), so there the point precision must.

const HOME = Deno.env.get('HOME') ?? '.';
const CAL_DIR = Deno.env.get('CAL_DIR') ?? `${HOME}/patina-deck-samples/calibration`;
const STRONG = 0.98;
const LIKELY = 0.85;
const SHOWN = 3;
const MIN_FIRED = 30;
const OLD = { likely: 0.85, margin: 0.03, exact: 0.95, hamming: 6, pairTau: 0.8, pairMargin: 0.05, pageAgrees: 0.8 };

interface Hit {
  product_id: string;
  rank: number;
}
interface R {
  qid: string;
  kind: string;
  domain: string;
  positive: boolean;
  target: string | null;
  image: Hit[];
  fused: Hit[];
  phash: { distance: number; product_id: string }[];
}
const readJson = async <T>(name: string): Promise<T> => JSON.parse(await Deno.readTextFile(`${CAL_DIR}/${name}`));
const allResults = await readJson<R[]>('results.json');
// Queries of products the embed worker could not index are not scored.
const unindexed = allResults.filter((r) => r.kind.startsWith('unindexed_'));
const results = allResults.filter((r) => !r.kind.startsWith('unindexed_'));
const pairingData = await readJson<{
  slides: number;
  pairing: { tau: number; margin: number; assigned: number; correct: number; possible: number }[];
  pageAgree: { kind: string; sim: number }[];
}>('pairing.json');
const catalog = await readJson<{ domain: string; role: string }[]>('catalog.json');
const embed = await readJson<Record<string, number>>('embed.json');

const positives = results.filter((r) => r.positive);
const negatives = results.filter((r) => !r.positive);
const keptTargets = new Set(results.flatMap((r) => r.phash.map((p) => p.product_id)));

const pct = (n: number, d: number) => (d ? (100 * n / d).toFixed(1) : '—');
const f3 = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '—');
function wilsonLow(k: number, n: number, z = 1.96): number {
  if (!n) return NaN;
  const p = k / n;
  const den = 1 + z * z / n;
  return (p + z * z / (2 * n) - z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / den;
}
function quantiles(xs: number[]): string {
  if (!xs.length) return '— (n=0)';
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
  return `${f3(q(0.05))} / ${f3(q(0.25))} / ${f3(q(0.5))} / ${f3(q(0.75))} / ${f3(q(0.95))} (n=${s.length})`;
}
const top = (hits: Hit[]) => hits[0]?.rank ?? 0;
const marginOf = (hits: Hit[]) => (hits[0]?.rank ?? 0) - (hits[1]?.rank ?? 0);
const recallAt = (rs: R[], pick: (r: R) => Hit[], k: number) =>
  rs.filter((r) => pick(r).slice(0, k).some((h) => h.product_id === r.target)).length;

// ── T1 exact cosine ─────────────────────────────────────────────────────────
function exactAt(tau: number, rs = results) {
  let shown = 0, right = 0, recalled = 0;
  for (const r of rs) {
    const strong = r.image.filter((h) => h.rank >= tau).slice(0, SHOWN);
    shown += strong.length;
    const ok = strong.filter((h) => h.product_id === r.target).length;
    right += ok;
    if (ok) recalled++;
  }
  return { tau, shown, right, recalled, precision: shown ? right / shown : NaN };
}
// ── T1 dHash ────────────────────────────────────────────────────────────────
function hashAt(d: number, rs = results) {
  let shown = 0, right = 0, recalled = 0;
  for (const r of rs) {
    const hits = r.phash.filter((p) => p.distance <= d).slice(0, SHOWN);
    shown += hits.length;
    const ok = hits.filter((p) => p.product_id === r.target).length;
    right += ok;
    if (ok) recalled++;
  }
  return { d, shown, right, recalled, precision: shown ? right / shown : NaN };
}
// ── T2 likely (top hit only) ────────────────────────────────────────────────
function likelyAt(tau: number, margin: number, rs: R[], pick: (r: R) => Hit[]) {
  let fired = 0, right = 0;
  for (const r of rs) {
    const hits = pick(r);
    if (!hits.length || top(hits) < tau || marginOf(hits) < margin) continue;
    fired++;
    if (hits[0].product_id === r.target) right++;
  }
  return { tau, margin, fired, right, precision: fired ? right / fired : NaN };
}

const range = (a: number, b: number, step: number) =>
  Array.from({ length: Math.round((b - a) / step) + 1 }, (_, i) => Math.round((a + i * step) * 1000) / 1000);

// Pick τ_exact: the lowest τ whose precision, and every stricter τ's, meets STRONG.
const exactGrid = range(0.8, 0.995, 0.005).map((t) => exactAt(t));
let tauExact = 0.995;
for (let i = exactGrid.length - 1; i >= 0; i--) {
  const g = exactGrid[i];
  if (g.shown === 0 || g.precision >= STRONG) tauExact = g.tau;
  else break;
}
// Pick Hamming: the largest d whose precision, and every smaller d's, meets STRONG.
const hashGrid = range(0, 16, 1).map((d) => hashAt(d));
let hamming = 0;
for (const g of hashGrid) {
  if (g.shown === 0 || g.precision >= STRONG) hamming = g.d;
  else break;
}
// T2 runs only where T1 found nothing strong.
const noStrong = (tau: number, d: number) =>
  results.filter((r) => !r.image.some((h) => h.rank >= tau) && !r.phash.some((p) => p.distance <= d));
const t2Pop = noStrong(tauExact, hamming);
const likelyGrid = range(0.6, 0.98, 0.01).flatMap((t) =>
  range(0, 0.15, 0.005).map((m) => likelyAt(t, m, t2Pop, (r) => r.image))
);
const holds = (t: number, m: number) =>
  likelyGrid.filter((g) => g.tau >= t && g.margin >= m && g.fired > 0).every((g) => g.precision >= LIKELY || g.fired < 10);
// Likely fires hundreds of times, enough to ask that the 95% lower bound (not
// just the point estimate) meets the target.
const likelyPick = likelyGrid
  .filter((g) => g.fired >= MIN_FIRED && wilsonLow(g.right, g.fired) >= LIKELY && holds(g.tau, g.margin))
  .sort((a, b) => b.right - a.right || b.tau - a.tau || b.margin - a.margin)[0] ?? null;
const tauLikely = likelyPick?.tau ?? OLD.likely;
const tauMargin = likelyPick?.margin ?? OLD.margin;

// Fused, judged on its own (products with no picture rows fall back to it).
const fusedGrid = range(0.6, 0.98, 0.01).flatMap((t) =>
  range(0, 0.15, 0.005).map((m) => likelyAt(t, m, results, (r) => r.fused))
);
const fusedAtPick = likelyAt(tauLikely, tauMargin, results, (r) => r.fused);
const fusedBest = fusedGrid.filter((g) => g.fired >= MIN_FIRED).sort((a, b) => b.precision - a.precision || b.right - a.right)[0];
const fusedCanLikely = fusedGrid.filter((g) => g.fired >= MIN_FIRED && g.precision >= LIKELY)
  .sort((a, b) => b.right - a.right)[0] ?? null;

// Pairing: the most recall at STRONG precision, held at every stricter setting.
const pairGrid = pairingData.pairing.map((p) => ({ ...p, precision: p.assigned ? p.correct / p.assigned : NaN }));
const pairHolds = (t: number, m: number) =>
  pairGrid.filter((g) => g.tau >= t && g.margin >= m && g.assigned > 0).every((g) => g.precision >= STRONG);
// Over a thousand assignments: the 95% lower bound must meet the target.
const pairPick = pairGrid
  .filter((g) => g.assigned >= MIN_FIRED && wilsonLow(g.correct, g.assigned) >= STRONG && pairHolds(g.tau, g.margin))
  .sort((a, b) => b.correct - a.correct || b.tau - a.tau || b.margin - a.margin)[0] ?? null;
const pairOld = pairGrid.find((g) => g.tau === OLD.pairTau && g.margin === OLD.pairMargin);

// The whole cascade at a threshold set: T1 exact | dHash → strong; else T2 likely.
function cascade(t: { exact: number; hamming: number; likely: number; margin: number }, rs: R[]) {
  let strong = 0, strongRight = 0, likely = 0, likelyRight = 0, abstain = 0;
  for (const r of rs) {
    const strongHits = new Map<string, true>();
    for (const p of r.phash) if (p.distance <= t.hamming) strongHits.set(p.product_id, true);
    for (const h of r.image) if (h.rank >= t.exact) strongHits.set(h.product_id, true);
    const shown = [...strongHits.keys()].slice(0, SHOWN);
    if (shown.length) {
      strong += shown.length;
      strongRight += shown.filter((id) => id === r.target).length;
      continue;
    }
    if (r.image.length && top(r.image) >= t.likely && marginOf(r.image) >= t.margin) {
      likely++;
      if (r.image[0].product_id === r.target) likelyRight++;
      continue;
    }
    abstain++;
  }
  return { strong, strongRight, likely, likelyRight, abstain, n: rs.length };
}
const NEW = { exact: tauExact, hamming, likely: tauLikely, margin: tauMargin };
const OLDT = { exact: OLD.exact, hamming: OLD.hamming, likely: OLD.likely, margin: OLD.margin };

// ── print ───────────────────────────────────────────────────────────────────
const out: string[] = [];
const p = (s = '') => out.push(s);
const kinds = [...new Set(results.map((r) => r.kind))].sort();
const domains = [...new Set(catalog.map((c) => c.domain))].sort();

p('### Set');
p();
p(`Catalog: ${catalog.filter((c) => c.role === 'catalog').length} products seeded; ${catalog.filter((c) => c.role === 'negative').length} held out as negatives. Embed worker: ${JSON.stringify(embed)}.`);
p(`Queries: ${results.length} scored (${positives.length} positive, ${negatives.length} negative); ${unindexed.length} more belong to products the worker could not index and are not scored. Kept-crop stand-ins for dHash: ${keptTargets.size}. Simulated slides for pairing: ${pairingData.slides}.`);
p();
p('| Domain | Catalog | Held out | Queries |');
p('|---|---:|---:|---:|');
for (const d of domains) {
  p(`| ${d} | ${catalog.filter((c) => c.domain === d && c.role === 'catalog').length} | ${catalog.filter((c) => c.domain === d && c.role === 'negative').length} | ${results.filter((r) => r.domain === d).length} |`);
}
p();
p('| Query kind | n |');
p('|---|---:|');
for (const k of kinds) p(`| ${k} | ${results.filter((r) => r.kind === k).length} |`);
p();
p('### Recall (positives)');
p();
p('| Tier | Kind | n | R@1 | R@5 |');
p('|---|---|---:|---:|---:|');
for (const [tier, pick] of [['T2 image-only', (r: R) => r.image], ['T2 fused', (r: R) => r.fused]] as const) {
  for (const k of ['all', ...kinds.filter((x) => !x.startsWith('negative'))]) {
    const rs = k === 'all' ? positives : positives.filter((r) => r.kind === k);
    p(`| ${tier} | ${k} | ${rs.length} | ${pct(recallAt(rs, pick, 1), rs.length)}% | ${pct(recallAt(rs, pick, 5), rs.length)}% |`);
  }
}
const hashPop = positives.filter((r) => keptTargets.has(r.target!));
const hashR1 = hashPop.filter((r) => r.phash[0]?.product_id === r.target).length;
const hashR5 = hashPop.filter((r) => r.phash.slice(0, 5).some((h) => h.product_id === r.target)).length;
p(`| T1 dHash (nearest kept crop) | queries whose product has a kept crop | ${hashPop.length} | ${pct(hashR1, hashPop.length)}% | ${pct(hashR5, hashPop.length)}% |`);
const samePic = hashPop.filter((r) => r.kind === 'same_picture');
p(`| T1 dHash | same_picture only | ${samePic.length} | ${pct(samePic.filter((r) => r.phash[0]?.product_id === r.target).length, samePic.length)}% | ${pct(samePic.filter((r) => r.phash.slice(0, 5).some((h) => h.product_id === r.target)).length, samePic.length)}% |`);
p();
p('### Score and margin distributions (p5 / p25 / p50 / p75 / p95)');
p();
p('| Tier | Population | top-1 score | margin (top1 − top2) |');
p('|---|---|---|---|');
for (const [tier, pick] of [['image-only', (r: R) => r.image], ['fused', (r: R) => r.fused]] as const) {
  const right = positives.filter((r) => pick(r)[0]?.product_id === r.target);
  const wrong = positives.filter((r) => pick(r)[0] && pick(r)[0].product_id !== r.target);
  p(`| ${tier} | top-1 correct | ${quantiles(right.map((r) => top(pick(r))))} | ${quantiles(right.map((r) => marginOf(pick(r))))} |`);
  p(`| ${tier} | top-1 wrong (positives) | ${quantiles(wrong.map((r) => top(pick(r))))} | ${quantiles(wrong.map((r) => marginOf(pick(r))))} |`);
  p(`| ${tier} | negatives | ${quantiles(negatives.map((r) => top(pick(r))))} | ${quantiles(negatives.map((r) => marginOf(pick(r))))} |`);
}
for (const k of kinds.filter((x) => !x.startsWith('negative'))) {
  const rs = positives.filter((r) => r.kind === k && r.image[0]?.product_id === r.target);
  p(`| image-only | top-1 correct, ${k} | ${quantiles(rs.map((r) => top(r.image)))} | ${quantiles(rs.map((r) => marginOf(r.image)))} |`);
}
p(`| dHash | true pair (same picture vs its kept crop) | ${quantiles(samePic.map((r) => r.phash.find((h) => h.product_id === r.target)?.distance ?? 64))} | — |`);
p(`| dHash | nearest wrong kept crop, all queries | ${quantiles(results.map((r) => r.phash.find((h) => h.product_id !== r.target)?.distance ?? 64))} | — |`);
p();
p('### T1 exact cosine: precision per strong row');
p();
p('| τ_exact | strong rows | right | precision | Wilson 95% low | queries recalled |');
p('|---:|---:|---:|---:|---:|---:|');
for (const g of exactGrid.filter((g) => g.tau >= 0.85 && (Math.round(g.tau * 1000) % 10 === 0 || g.tau === tauExact))) {
  p(`| ${g.tau}${g.tau === tauExact ? ' ←' : ''} | ${g.shown} | ${g.right} | ${f3(g.precision)} | ${f3(wilsonLow(g.right, g.shown))} | ${g.recalled} / ${positives.length} |`);
}
p();
p('### T1 dHash: precision per strong row');
p();
p('| Hamming ≤ | strong rows | right | precision | Wilson 95% low | queries recalled |');
p('|---:|---:|---:|---:|---:|---:|');
for (const g of hashGrid) {
  p(`| ${g.d}${g.d === hamming ? ' ←' : ''} | ${g.shown} | ${g.right} | ${f3(g.precision)} | ${f3(wilsonLow(g.right, g.shown))} | ${g.recalled} / ${hashPop.length} |`);
}
p();
p(`### T2 image-only "likely" (population: ${t2Pop.length} queries with nothing strong at τ_exact=${tauExact}, Hamming ≤${hamming})`);
p();
p('| τ_likely | τ_margin | fired | right | precision | Wilson 95% low |');
p('|---:|---:|---:|---:|---:|---:|');
const show = (g: ReturnType<typeof likelyAt>, mark = '') =>
  p(`| ${g.tau}${mark} | ${g.margin} | ${g.fired} | ${g.right} | ${f3(g.precision)} | ${f3(wilsonLow(g.right, g.fired))} |`);
show(likelyAt(OLD.likely, OLD.margin, t2Pop, (r) => r.image), ' (placeholder)');
if (likelyPick) show(likelyPick, ' ←');
for (const t of [0.7, 0.75, 0.8, 0.85, 0.9]) for (const m of [0, 0.02, 0.05, 0.1]) show(likelyAt(t, m, t2Pop, (r) => r.image));
p();
p('### T2 fused, judged alone');
p();
p(`At the chosen τ_likely/τ_margin: fired ${fusedAtPick.fired}, precision ${f3(fusedAtPick.precision)}. Best precision on the grid (≥${MIN_FIRED} fired): ${fusedBest ? `${f3(fusedBest.precision)} at τ=${fusedBest.tau}, margin ${fusedBest.margin} (${fusedBest.fired} fired)` : '—'}. Reaches ${LIKELY}: ${fusedCanLikely ? `yes, at τ=${fusedCanLikely.tau}, margin ${fusedCanLikely.margin} (${fusedCanLikely.fired} fired, ${fusedCanLikely.right} right)` : 'no'}.`);
p();
p('### Pairing (pairing.ts pairByLook on simulated slides)');
p();
p('| τ_pair | τ_pair_margin | assigned | right | precision | Wilson 95% low | recall |');
p('|---:|---:|---:|---:|---:|---:|---:|');
const showPair = (g: typeof pairGrid[number] | undefined, mark = '') => {
  if (g) {
    p(`| ${g.tau}${mark} | ${g.margin} | ${g.assigned} | ${g.correct} | ${f3(g.precision)} | ${f3(wilsonLow(g.correct, g.assigned))} | ${pct(g.correct, g.possible)}% |`);
  }
};
showPair(pairOld, ' (placeholder)');
showPair(pairPick ?? undefined, ' ←');
for (const t of [0.6, 0.7, 0.75, 0.8, 0.85, 0.9]) for (const m of [0, 0.05, 0.1]) showPair(pairGrid.find((g) => g.tau === t && g.margin === m));
p();
p('### og:image look-check (informational: true pairs, page photo vs crop)');
p();
p('| Kind | similarity p5 / p25 / p50 / p75 / p95 | below τ_look 0.8 |');
p('|---|---|---:|');
for (const k of [...new Set(pairingData.pageAgree.map((a) => a.kind))].sort()) {
  const xs = pairingData.pageAgree.filter((a) => a.kind === k).map((a) => a.sim);
  p(`| ${k} | ${quantiles(xs)} | ${pct(xs.filter((x) => x < OLD.pageAgrees).length, xs.length)}% |`);
}
p();
p('### The cascade, old placeholders vs chosen');
p();
p('| Set | Population | strong rows (right) | strong precision | likely (right) | likely precision | abstain |');
p('|---|---|---:|---:|---:|---:|---:|');
for (const [name, t] of [['placeholder', OLDT], ['chosen', NEW]] as const) {
  for (const [pop, rs] of [['positives', positives], ['negatives', negatives]] as const) {
    const c = cascade(t, rs);
    p(`| ${name} | ${pop} (${c.n}) | ${c.strong} (${c.strongRight}) | ${f3(c.strongRight / c.strong)} | ${c.likely} (${c.likelyRight}) | ${f3(c.likelyRight / c.likely)} | ${pct(c.abstain, c.n)}% |`);
  }
}
p();
p(`Chosen: τ_exact=${tauExact}, Hamming ≤${hamming}, τ_likely=${tauLikely}, τ_margin=${tauMargin}, τ_pair=${pairPick?.tau ?? '—'}, τ_pair_margin=${pairPick?.margin ?? '—'}. likelyPick found: ${likelyPick != null}.`);
console.log(out.join('\n'));
await Deno.writeTextFile(`${CAL_DIR}/metrics.json`, JSON.stringify({
  chosen: { ...NEW, pairTau: pairPick?.tau ?? null, pairMargin: pairPick?.margin ?? null },
  likelyPick, pairPick, fusedAtPick, fusedBest, fusedCanLikely,
  cascade: { placeholder: { positives: cascade(OLDT, positives), negatives: cascade(OLDT, negatives) },
    chosen: { positives: cascade(NEW, positives), negatives: cascade(NEW, negatives) } },
}, null, 1));
