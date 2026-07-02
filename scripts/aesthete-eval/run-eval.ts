/**
 * Aesthete Engine — evaluation harness (Wave 3D).
 *
 * Contract: scripts/aesthete-eval/run-eval.md (frozen in Wave 0A) and design
 * doc §14 (docs/prds/AE/aesthete-engine-system-design.md). Invoke through the
 * wrapper — `bash scripts/aesthete-eval/run-eval.sh <suite> [--json] [--out <dir>]`
 * — or directly:
 *
 *   deno run --allow-net --allow-env --allow-read --allow-write \
 *     scripts/aesthete-eval/run-eval.ts <personas|g1|g2|backtest|replay|all> [--json] [--out <dir>]
 *
 * The `personas` suite is the §14.7 MECHANICAL bar (runnable today against a
 * local stack with the demo seed applied):
 *   • zero category errors — a category-constrained call per persona
 *     (personas.json `eval.category_probe`); every card must match;
 *   • zero budget violations — price_retail ≤ 1.25 × budget max_cents (the
 *     §10.4 perception ceiling the RPC enforces); cards in (max, 1.25·max]
 *     are reported informationally as honest stretches;
 *   • every card carries ≥ 1 why reason AND ≥ 1 CONCRETE reason
 *     (material_color | budget | function | context | patina — §10.6);
 *   • copy law on every phrase — never "AI", never digits;
 *   • exploration rows exactly 2 at limit 10 / ratio 0.2 (§10.5);
 *   • latency: every quiz→top-10 walk < WALK_BUDGET_MS AND p95 over the
 *     pooled match-call samples < WALK_BUDGET_MS (default 2000, §14.7.iv).
 *     NOTE: the in-DB quiz rate backstop allows 10 submits/IP/hour — the
 *     harness submits once per persona and widens the p95 pool with repeated
 *     match calls (EVAL_MATCH_SAMPLES per persona, default 4) instead of
 *     re-submitting.
 *
 * Panel-judgment items (love ≥ 3, kill ≤ 2, "wouldn't have thought of it",
 * why coherence, the dial visibly changing the set) are HUMAN work — the
 * harness prints them as a checklist with the persona top-10 sheets and never
 * scores them (§14.3: labels come from designers, not this repo).
 *
 * g1/g2 run when the designer-labeled fixtures exist (golden/*.json — built
 * from the CSV templates in golden/ during the week-4 sprint) and SKIP with
 * instructions otherwise. backtest/replay land with Wave 4A's /fit/taste and
 * logged realized-outcome data respectively.
 */

// ─── types ───────────────────────────────────────────────────────────────────

interface PersonaEval {
  category_probe?: string;
}

interface Persona {
  name: string;
  description: string;
  answers: Record<string, unknown>;
  expected?: Record<string, unknown>;
  eval?: PersonaEval;
}

interface MatchRow {
  product_id: string;
  rank: number;
  score: number;
  confidence: number;
  is_exploration: boolean;
  why: {
    top_reasons?: { term: string; phrase: string; contribution: number }[];
    cautions?: { term: string; phrase: string }[];
    stretch_axis?: string | null;
    [k: string]: unknown;
  };
}

interface ProductLite {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  price_retail: number | null;
}

interface Check {
  bar: string;
  pass: boolean;
  detail: string;
}

interface PersonaResult {
  name: string;
  sessionKey: string;
  quizMs: number;
  matchMs: number;
  walkMs: number;
  probeMs: number;
  extraMatchMs: number[];
  budget: { min_cents: number | null; max_cents: number | null; label: string | null };
  rows: MatchRow[];
  probeRows: MatchRow[];
  products: Map<string, ProductLite>;
  checks: Check[];
  stretches: string[]; // informational: cards in (max, 1.25·max]
}

// §10.6 concrete terms (material/dimension/price-grade reasons).
const CONCRETE_TERMS = new Set(['material_color', 'budget', 'function', 'context', 'patina']);

// ─── env / config ────────────────────────────────────────────────────────────

const REST_URL = (Deno.env.get('SUPABASE_REST_URL') ?? 'http://localhost:54321').replace(/\/$/, '');
const WALK_BUDGET_MS = Number(Deno.env.get('WALK_BUDGET_MS') ?? 2000) || 2000;
const MATCH_SAMPLES = Math.max(0, Number(Deno.env.get('EVAL_MATCH_SAMPLES') ?? 4) || 4);
// Standard local-dev demo anon key (same fallback as scripts/aesthete-gate.sh).
const DEMO_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

function scriptDir(): string {
  return new URL('.', import.meta.url).pathname;
}

async function resolveAnonKey(): Promise<string> {
  const fromEnv = Deno.env.get('SUPABASE_ANON_KEY');
  if (fromEnv) return fromEnv;
  // `supabase status -o env` (run-eval.md environment contract).
  try {
    const cmd = new Deno.Command('supabase', {
      args: ['status', '-o', 'env'],
      cwd: `${scriptDir()}/../../supabase`,
      stdout: 'piped',
      stderr: 'null',
    });
    const out = new TextDecoder().decode((await cmd.output()).stdout);
    const m = out.match(/^(?:SUPABASE_)?ANON_KEY="?([^"\n]+)"?/m);
    if (m) return m[1];
  } catch {
    /* supabase CLI unavailable — fall through */
  }
  return DEMO_ANON_KEY;
}

// ─── REST helpers ────────────────────────────────────────────────────────────

async function rpc(
  anon: string,
  fn: string,
  body: Record<string, unknown>,
): Promise<{ ms: number; status: number; json: unknown }> {
  const t0 = performance.now();
  const res = await fetch(`${REST_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { ms: performance.now() - t0, status: res.status, json };
}

async function fetchProducts(anon: string, ids: string[]): Promise<Map<string, ProductLite>> {
  const map = new Map<string, ProductLite>();
  if (ids.length === 0) return map;
  const res = await fetch(
    `${REST_URL}/rest/v1/products?id=in.(${ids.join(',')})&select=id,name,brand,category,price_retail`,
    { headers: { apikey: anon, Authorization: `Bearer ${anon}` } },
  );
  if (!res.ok) return map;
  for (const p of (await res.json()) as ProductLite[]) map.set(p.id, p);
  return map;
}

function p95(samples: number[]): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)];
}

function money(cents: number | null | undefined): string {
  return cents == null ? '—' : `$${(cents / 100).toLocaleString('en-US')}`;
}

// ─── the personas suite (§14.3 mechanical cut + §14.7) ───────────────────────

function checkWhys(rows: MatchRow[], checks: Check[], label: string) {
  const noReason: number[] = [];
  const noConcrete: number[] = [];
  const copyViolations: string[] = [];
  rows.forEach((r) => {
    const reasons = r.why?.top_reasons ?? [];
    if (reasons.length === 0) noReason.push(r.rank);
    if (!reasons.some((x) => CONCRETE_TERMS.has(x.term))) noConcrete.push(r.rank);
    for (const x of [...reasons, ...(r.why?.cautions ?? [])]) {
      // copy law (§2.1/§14.7.iii): never "AI", never numbers/scores in copy.
      if (/\bAI\b/i.test(x.phrase) || /\d/.test(x.phrase)) {
        copyViolations.push(`rank ${r.rank}: "${x.phrase}"`);
      }
    }
  });
  checks.push({
    bar: `${label}: every card ≥1 why reason`,
    pass: noReason.length === 0,
    detail: noReason.length === 0 ? `${rows.length}/${rows.length} carded` : `missing on ranks ${noReason.join(', ')}`,
  });
  checks.push({
    bar: `${label}: every card ≥1 CONCRETE reason`,
    pass: noConcrete.length === 0,
    detail: noConcrete.length === 0
      ? 'material/budget/function/context/patina present on every card'
      : `no concrete term on ranks ${noConcrete.join(', ')}`,
  });
  checks.push({
    bar: `${label}: copy law (no "AI", no digits)`,
    pass: copyViolations.length === 0,
    detail: copyViolations.length === 0 ? 'all phrases clean' : copyViolations.join(' · '),
  });
}

async function runPersona(anon: string, persona: Persona): Promise<PersonaResult> {
  const sessionKey = crypto.randomUUID();
  const checks: Check[] = [];

  // 1 — submit_style_quiz (fresh session key, §7.1)
  const quiz = await rpc(anon, 'submit_style_quiz', {
    p_session_key: sessionKey,
    p_answers: persona.answers,
    p_timings: {},
    p_source: 'web',
    p_attribution: { utm_source: 'aesthete-eval' },
  });
  if (quiz.status !== 200) {
    const msg = JSON.stringify(quiz.json).slice(0, 200);
    const rateLimited = /too many submissions/i.test(msg);
    checks.push({
      bar: 'quiz submit',
      pass: false,
      detail: rateLimited
        ? `in-DB rate backstop tripped (10 submits/IP/hour, §7.1) — NOT an engine failure. Wait for the next hour window, or in LOCAL DEV: docker exec supabase_db_supabase psql -U postgres -d postgres -c 'DELETE FROM quiz_rate_limits;'`
        : `HTTP ${quiz.status}: ${msg}`,
    });
    return {
      name: persona.name, sessionKey, quizMs: quiz.ms, matchMs: 0, walkMs: quiz.ms, probeMs: 0,
      extraMatchMs: [], budget: { min_cents: null, max_cents: null, label: null },
      rows: [], probeRows: [], products: new Map(), checks, stretches: [],
    };
  }
  const profile = (Array.isArray(quiz.json) ? quiz.json[0] : quiz.json) as Record<string, unknown>;
  const spectrums = (profile?.spectrums ?? {}) as Record<string, unknown>;
  const sixOk = ['warmth', 'complexity', 'formality', 'timelessness', 'boldness', 'craftsmanship']
    .every((k) => typeof spectrums[k] === 'number');
  checks.push({
    bar: 'quiz → six-spectrum profile',
    pass: sixOk,
    detail: sixOk ? 'all six spectrums present' : `got keys: ${Object.keys(spectrums).join(',')}`,
  });
  const budgetRaw = (profile?.budget ?? {}) as Record<string, unknown>;
  const budget = {
    min_cents: (budgetRaw.min_cents as number | null) ?? null,
    max_cents: (budgetRaw.max_cents as number | null) ?? null,
    label: (budgetRaw.label as string | null) ?? null,
  };

  // 2 — get_aesthete_matches top-10
  const match = await rpc(anon, 'get_aesthete_matches', { p_session_key: sessionKey, p_limit: 10 });
  const rows = (match.status === 200 && Array.isArray(match.json) ? match.json : []) as MatchRow[];
  checks.push({
    bar: 'top-10 returned',
    pass: match.status === 200 && rows.length === 10,
    detail: match.status === 200
      ? `${rows.length} rows`
      : `HTTP ${match.status}: ${JSON.stringify(match.json).slice(0, 200)}`,
  });

  // exploration rows exactly 2 (limit 10 · ratio 0.2 → deterministic 8+2, §10.5)
  const explore = rows.filter((r) => r.is_exploration).length;
  checks.push({
    bar: 'exploration rows exactly 2',
    pass: explore === 2,
    detail: `${explore} exploration rows at limit 10 / ratio 0.2`,
  });

  // whys + copy law
  checkWhys(rows, checks, 'top-10');

  // budget violations (price ≤ the §10.4 perception ceiling 1.25·max)
  const products = await fetchProducts(anon, rows.map((r) => r.product_id));
  const stretches: string[] = [];
  if (budget.max_cents != null) {
    const violations: string[] = [];
    for (const r of rows) {
      const p = products.get(r.product_id);
      if (!p || p.price_retail == null) continue; // missing data never violates (§10.2)
      if (p.price_retail > 1.25 * budget.max_cents) {
        violations.push(`${p.name} ${money(p.price_retail)} > 1.25×${money(budget.max_cents)}`);
      } else if (p.price_retail > budget.max_cents) {
        stretches.push(`${p.name} ${money(p.price_retail)} (band max ${money(budget.max_cents)})`);
      }
    }
    checks.push({
      bar: 'zero budget violations',
      pass: violations.length === 0,
      detail: violations.length === 0
        ? `all prices ≤ 1.25× ${budget.label} max${stretches.length ? ` (${stretches.length} honest stretch${stretches.length > 1 ? 'es' : ''} in the 1.25× band)` : ''}`
        : violations.join(' · '),
    });
  } else {
    checks.push({
      bar: 'zero budget violations',
      pass: true,
      detail: `no budget ceiling (${budget.label ?? 'null band'}) — must NOT filter by price; ${rows.length} cards returned`,
    });
  }

  // 3 — category probe (zero category errors, mechanical cut)
  const probeCat = persona.eval?.category_probe;
  let probeRows: MatchRow[] = [];
  let probeMs = 0;
  if (probeCat) {
    const probe = await rpc(anon, 'get_aesthete_matches', {
      p_session_key: sessionKey,
      p_limit: 10,
      p_category: probeCat,
    });
    probeMs = probe.ms;
    probeRows = (probe.status === 200 && Array.isArray(probe.json) ? probe.json : []) as MatchRow[];
    const probeProducts = await fetchProducts(anon, probeRows.map((r) => r.product_id));
    const wrong = probeRows.filter((r) => probeProducts.get(r.product_id)?.category !== probeCat);
    checks.push({
      bar: `zero category errors (probe: ${probeCat})`,
      pass: probe.status === 200 && probeRows.length >= 1 && wrong.length === 0,
      detail: probe.status !== 200
        ? `HTTP ${probe.status}`
        : wrong.length === 0
          ? `${probeRows.length}/${probeRows.length} cards are ${probeCat}`
          : `${wrong.length} card(s) leaked another category: ${wrong.map((w) => probeProducts.get(w.product_id)?.category ?? '?').join(',')}`,
    });
    for (const [id, p] of probeProducts) if (!products.has(id)) products.set(id, p);
  }

  // 4 — extra match samples to widen the latency pool (see header re rate limit)
  const extraMatchMs: number[] = [];
  for (let i = 0; i < MATCH_SAMPLES; i++) {
    const s = await rpc(anon, 'get_aesthete_matches', { p_session_key: sessionKey, p_limit: 10 });
    if (s.status === 200) extraMatchMs.push(s.ms);
  }

  return {
    name: persona.name, sessionKey,
    quizMs: quiz.ms, matchMs: match.ms, walkMs: quiz.ms + match.ms, probeMs, extraMatchMs,
    budget, rows, probeRows, products, checks, stretches,
  };
}

function personaSheet(r: PersonaResult): string {
  const lines: string[] = [];
  lines.push(`### ${r.name} — top 10 (${r.budget.label ?? 'no band'}${r.budget.max_cents ? `, max ${money(r.budget.max_cents)}` : ''})`);
  lines.push('');
  lines.push('| # | piece | category | price | explore | top reason |');
  lines.push('|---|-------|----------|-------|---------|------------|');
  for (const row of r.rows) {
    const p = r.products.get(row.product_id);
    const reason = row.why?.top_reasons?.[0]?.phrase ?? '—';
    lines.push(
      `| ${row.rank} | ${p?.name ?? row.product_id} | ${p?.category ?? '?'} | ${money(p?.price_retail)} | ${row.is_exploration ? `↗ ${row.why?.stretch_axis ?? ''}` : ''} | ${reason} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

async function suitePersonas(anon: string, outDir: string | null): Promise<{ pass: boolean; report: string; json: unknown }> {
  const personasPath = `${scriptDir()}personas.json`;
  const personas = (JSON.parse(await Deno.readTextFile(personasPath)) as { personas: Persona[] }).personas;

  const results: PersonaResult[] = [];
  for (const p of personas) results.push(await runPersona(anon, p));

  // latency bars (§14.7.iv)
  const walkSamples = results.map((r) => r.walkMs);
  const matchPool = results.flatMap((r) => [r.matchMs, r.probeMs, ...r.extraMatchMs].filter((x) => x > 0));
  const latencyChecks: Check[] = [
    {
      bar: `every quiz→top-10 walk < ${WALK_BUDGET_MS} ms`,
      pass: walkSamples.every((x) => x < WALK_BUDGET_MS),
      detail: `walks: ${walkSamples.map((x) => Math.round(x)).join(' / ')} ms`,
    },
    {
      bar: `p95(match calls) < ${WALK_BUDGET_MS} ms`,
      pass: p95(matchPool) < WALK_BUDGET_MS,
      detail: `p95 ${Math.round(p95(matchPool))} ms over ${matchPool.length} samples`,
    },
  ];

  const allChecks = [...results.flatMap((r) => r.checks.map((c) => ({ ...c, bar: `[${r.name}] ${c.bar}` }))), ...latencyChecks];
  const pass = allChecks.every((c) => c.pass);

  const lines: string[] = [];
  lines.push('## Suite: personas — §14.7 mechanical bars');
  lines.push('');
  lines.push(`Stack: ${REST_URL} · budget ${WALK_BUDGET_MS} ms · ${MATCH_SAMPLES} extra match samples/persona`);
  lines.push('');
  lines.push('| bar | result | detail |');
  lines.push('|-----|--------|--------|');
  for (const c of allChecks) lines.push(`| ${c.bar} | ${c.pass ? '✅ PASS' : '❌ FAIL'} | ${c.detail} |`);
  lines.push('');
  lines.push(`**Mechanical verdict: ${pass ? 'GREEN' : 'RED'}** (${allChecks.filter((c) => c.pass).length}/${allChecks.length} bars)`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Persona top-10 sheets (for the designer panel)');
  lines.push('');
  for (const r of results) lines.push(personaSheet(r));
  lines.push('---');
  lines.push('');
  lines.push('## HUMAN PANEL CHECKLIST — not machine-scored (§14.3 / §14.7)');
  lines.push('');
  lines.push('Per persona top-10 above, the designer panel marks:');
  lines.push('');
  lines.push('- [ ] love ≥ 3 of 10');
  lines.push('- [ ] kill ≤ 2 of 10');
  lines.push('- [ ] ≥ 1 "wouldn\'t have thought of it, but yes" (check the ↗ exploration rows first)');
  lines.push('- [ ] every card\'s why reads coherent (not just present)');
  lines.push('- [ ] ≥ 6/10 panel-endorsed (§14.7.ii)');
  lines.push('- [ ] the dial visibly changes the set — house vs one seeded designer portfolio vector');
  lines.push('      (§14.7.v; requires Wave 4A/4B taste + portfolio vectors — cold-start dial is inert by design)');
  lines.push('');

  const json = {
    suite: 'personas',
    pass,
    budget_ms: WALK_BUDGET_MS,
    checks: allChecks,
    personas: results.map((r) => ({
      name: r.name,
      session_key: r.sessionKey,
      quiz_ms: Math.round(r.quizMs),
      match_ms: Math.round(r.matchMs),
      walk_ms: Math.round(r.walkMs),
      budget: r.budget,
      stretches: r.stretches,
      top10: r.rows.map((row) => ({
        rank: row.rank,
        product_id: row.product_id,
        name: r.products.get(row.product_id)?.name ?? null,
        category: r.products.get(row.product_id)?.category ?? null,
        price_retail: r.products.get(row.product_id)?.price_retail ?? null,
        is_exploration: row.is_exploration,
        why: row.why,
      })),
    })),
  };

  if (outDir) {
    await Deno.mkdir(outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await Deno.writeTextFile(`${outDir}/personas-${stamp}.json`, JSON.stringify(json, null, 2));
    await Deno.writeTextFile(`${outDir}/personas-${stamp}.md`, lines.join('\n'));
  }

  return { pass, report: lines.join('\n'), json };
}

// ─── G1 — spectrum golden set (§14.1) ────────────────────────────────────────
// Runs only when designers have produced golden/g1-spectrums.json from the CSV
// template (never synthesized here). Human ceiling first: Krippendorff's α
// (interval) per dimension; then model MAE vs the designer mean + archetype
// top-1/top-2.

const DIMS = ['warmth', 'complexity', 'formality', 'timelessness', 'boldness', 'craftsmanship'] as const;

interface G1Row {
  product_id: string;
  designer: string;
  scores: Record<string, number>;
  archetype_primary?: string;
  archetype_secondary?: string;
}

/** Krippendorff's α for interval data over one dimension's {unit → values}. */
function krippendorffAlphaInterval(units: number[][]): number | null {
  const usable = units.filter((u) => u.length >= 2);
  if (usable.length === 0) return null;
  let dObs = 0, nPairs = 0;
  const all: number[] = [];
  for (const u of usable) {
    for (let i = 0; i < u.length; i++) {
      for (let j = i + 1; j < u.length; j++) {
        dObs += (u[i] - u[j]) ** 2;
        nPairs++;
      }
    }
    all.push(...u);
  }
  let dExp = 0, ePairs = 0;
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      dExp += (all[i] - all[j]) ** 2;
      ePairs++;
    }
  }
  if (nPairs === 0 || ePairs === 0 || dExp === 0) return null;
  return 1 - (dObs / nPairs) / (dExp / ePairs);
}

async function suiteG1(anon: string): Promise<{ pass: boolean; report: string; skipped?: boolean }> {
  const path = `${scriptDir()}golden/g1-spectrums.json`;
  let rows: G1Row[];
  try {
    rows = JSON.parse(await Deno.readTextFile(path));
  } catch {
    return {
      pass: true,
      skipped: true,
      report: [
        '## Suite: g1 — SKIP',
        '',
        `No designer labels yet at \`${path}\`.`,
        'The G1 golden set is DESIGNER OUTPUT from the week-4 validation sprint — fill',
        '`golden/g1-spectrums.template.csv` (2–3 designers × 150 products), convert to JSON',
        'per the README, and re-run. This harness never synthesizes ground truth.',
        '',
      ].join('\n'),
    };
  }

  // group per product
  const byProduct = new Map<string, G1Row[]>();
  for (const r of rows) {
    byProduct.set(r.product_id, [...(byProduct.get(r.product_id) ?? []), r]);
  }

  // model spectrums from the DB (canonical product_style_spectrum via REST)
  const ids = [...byProduct.keys()];
  const res = await fetch(
    `${REST_URL}/rest/v1/product_style_spectrum?product_id=in.(${ids.join(',')})&select=product_id,${DIMS.join(',')}`,
    { headers: { apikey: anon, Authorization: `Bearer ${anon}` } },
  );
  const model = new Map<string, Record<string, number>>(
    ((await res.json()) as Record<string, unknown>[]).map((r) => [r.product_id as string, r as Record<string, number>]),
  );

  const lines = ['## Suite: g1 — spectrum golden set', '', '| dimension | Krippendorff α | model MAE | bar |', '|---|---|---|---|'];
  let pass = true;
  for (const dim of DIMS) {
    const units = [...byProduct.values()].map((g) => g.map((r) => r.scores[dim]).filter((x) => typeof x === 'number'));
    const alpha = krippendorffAlphaInterval(units);
    // MAE vs designer mean, only over products the model has
    const errs: number[] = [];
    for (const [pid, g] of byProduct) {
      const vals = g.map((r) => r.scores[dim]).filter((x) => typeof x === 'number');
      const m = model.get(pid)?.[dim];
      if (vals.length === 0 || typeof m !== 'number') continue;
      errs.push(Math.abs(m - vals.reduce((a, b) => a + b, 0) / vals.length));
    }
    const mae = errs.length ? errs.reduce((a, b) => a + b, 0) / errs.length : null;
    const alphaLow = alpha != null && alpha < 0.6;
    const maeOk = mae != null && mae <= 0.2;
    if (!alphaLow && !maeOk) pass = false; // α<0.6 ⇒ fix anchors before blaming the model (§14.1)
    lines.push(
      `| ${dim} | ${alpha?.toFixed(3) ?? 'n/a'}${alphaLow ? ' ⚠ fix anchors first' : ''} | ${mae?.toFixed(3) ?? 'n/a'} (n=${errs.length}) | ${alphaLow ? '⏸ anchor fix' : maeOk ? '✅ ≤0.20' : '❌ >0.20'} |`,
    );
  }
  lines.push('', `**G1 verdict: ${pass ? 'GREEN' : 'RED'}** (archetype top-1/top-2 requires archetype labels in the fixture)`, '');
  return { pass, report: lines.join('\n') };
}

// ─── G2 — neighborhood golden set (§14.2) ────────────────────────────────────

interface G2Seed {
  seed_product_id: string;
  candidates: { product_id: string; is_closest_5: boolean }[];
}

function parseVector(s: string | null): number[] | null {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

async function suiteG2(anon: string): Promise<{ pass: boolean; report: string; skipped?: boolean }> {
  const path = `${scriptDir()}golden/g2-neighborhoods.json`;
  let seeds: G2Seed[];
  try {
    seeds = JSON.parse(await Deno.readTextFile(path));
  } catch {
    return {
      pass: true,
      skipped: true,
      report: [
        '## Suite: g2 — SKIP',
        '',
        `No designer picks yet at \`${path}\`.`,
        'The G2 set is DESIGNER OUTPUT (30 seeds × "closest 5 of 20") — fill',
        '`golden/g2-neighborhoods.template.csv`, convert per the README, and re-run.',
        '',
      ].join('\n'),
    };
  }

  const allIds = [...new Set(seeds.flatMap((s) => [s.seed_product_id, ...s.candidates.map((c) => c.product_id)]))];
  const res = await fetch(
    `${REST_URL}/rest/v1/products?id=in.(${allIds.join(',')})&select=id,category,aesthete_vector`,
    { headers: { apikey: anon, Authorization: `Bearer ${anon}` } },
  );
  const vecs = new Map<string, { category: string | null; v: number[] | null }>(
    ((await res.json()) as { id: string; category: string | null; aesthete_vector: string | null }[]).map((r) => [
      r.id,
      { category: r.category, v: parseVector(r.aesthete_vector) },
    ]),
  );

  const cos = (a: number[], b: number[]) => {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
  };

  const precisions: number[] = [];
  for (const s of seeds) {
    const sv = vecs.get(s.seed_product_id)?.v;
    if (!sv) continue;
    const ranked = s.candidates
      .map((c) => ({ ...c, sim: vecs.get(c.product_id)?.v ? cos(sv, vecs.get(c.product_id)!.v!) : -2 }))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 5);
    precisions.push(ranked.filter((c) => c.is_closest_5).length / 5);
  }
  const p = precisions.length ? precisions.reduce((a, b) => a + b, 0) / precisions.length : 0;
  const pass = p >= 0.5;
  return {
    pass,
    report: [
      '## Suite: g2 — neighborhood golden set',
      '',
      `Embedding kNN precision@5 = **${p.toFixed(3)}** over ${precisions.length} scoreable seeds (bar ≥ 0.5) → ${pass ? '✅' : '❌'}`,
      '(category-leak tracking activates with the Phase-2 style projection A/B)',
      '',
    ].join('\n'),
  };
}

// ─── main ────────────────────────────────────────────────────────────────────

const SUITES = ['personas', 'g1', 'g2', 'backtest', 'replay', 'all'] as const;

async function main() {
  const args = [...Deno.args];
  const jsonMode = args.includes('--json');
  const outIdx = args.indexOf('--out');
  const outDir = outIdx >= 0 ? args[outIdx + 1] : Deno.env.get('AESTHETE_EVAL_OUT') ?? `${scriptDir()}out`;
  const suite = (args.find((a) => !a.startsWith('--') && a !== outDir) ?? 'all') as (typeof SUITES)[number];
  if (!SUITES.includes(suite)) {
    console.error(`unknown suite "${suite}" — expected one of: ${SUITES.join(' | ')}`);
    Deno.exit(2);
  }

  const anon = await resolveAnonKey();

  // reachability probe (same posture as aesthete-gate.sh: unreachable = hard fail here,
  // because the harness is explicitly a measurement run)
  try {
    const probe = await fetch(`${REST_URL}/rest/v1/`, { headers: { apikey: anon } });
    if (!probe.ok) throw new Error(`HTTP ${probe.status}`);
    await probe.body?.cancel();
  } catch (e) {
    console.error(`Supabase not reachable at ${REST_URL} (${e instanceof Error ? e.message : e}) — pnpm supabase:start`);
    Deno.exit(2);
  }

  const sections: string[] = [
    '# Aesthete Engine — eval report',
    '',
    `Run: ${new Date().toISOString()} · suite: ${suite} · stack: ${REST_URL}`,
    '',
  ];
  let anyFail = false;
  let personasJson: unknown = null;

  if (suite === 'personas' || suite === 'all') {
    const r = await suitePersonas(anon, outDir);
    sections.push(r.report);
    personasJson = r.json;
    if (!r.pass) anyFail = true;
  }
  if (suite === 'g1' || suite === 'all') {
    const r = await suiteG1(anon);
    sections.push(r.report);
    if (!r.pass) anyFail = true;
  }
  if (suite === 'g2' || suite === 'all') {
    const r = await suiteG2(anon);
    sections.push(r.report);
    if (!r.pass) anyFail = true;
  }
  if (suite === 'backtest' || suite === 'all') {
    sections.push('## Suite: backtest — SKIP\n\nθ chronological backtest (§14.4) lands with Wave 4A\'s worker `/fit/taste`; the demo seed already provides tagged synthetic judgments as dry-run fuel.\n');
  }
  if (suite === 'replay' || suite === 'all') {
    sections.push('## Suite: replay — SKIP\n\nOffline replay (§14.5) needs logged `match_events` with realized saves/purchases — post-launch data, not seedable.\n');
  }

  if (jsonMode && personasJson) {
    console.log(JSON.stringify(personasJson, null, 2));
  } else {
    console.log(sections.join('\n'));
  }
  Deno.exit(anyFail ? 1 : 0);
}

if (import.meta.main) await main();
