# Aesthete Engine — evaluation harness

Skeleton laid down in **Wave 0A**; the runnable harness landed in **Wave 3D**.
Contract: `docs/prds/AE/aesthete-engine-system-design.md` §14 (evaluation
framework) and §14.7 (the week-6 demo bar). The labeled sets are built as a
by-product of the week-4 designer validation sprint — this directory holds the
harness, the fixtures, and the bars; it never invents ground truth.

## Quick start

```bash
# seed the local stack first (idempotent):
docker exec -i supabase_db_supabase psql -U postgres -d postgres \
  < scripts/aesthete-demo-seed.sql

# the §14.7 mechanical bars + persona sheets + human panel checklist:
bash scripts/aesthete-eval/run-eval.sh personas

# everything (g1/g2 SKIP until designer labels exist; backtest/replay Wave 4A+):
bash scripts/aesthete-eval/run-eval.sh all
```

Markdown report to stdout; per-run JSON + persona top-10 sheets to `out/`
(gitignored); non-zero exit on any missed mechanical bar. Env knobs in
`run-eval.md` (`SUPABASE_REST_URL`, `SUPABASE_ANON_KEY`, `WALK_BUDGET_MS`,
`EVAL_MATCH_SAMPLES`, `AESTHETE_EVAL_OUT`).

> ⚠ The quiz's in-DB rate backstop (§7.1) allows **10 submits/IP/hour** and
> each harness run submits 4 (one per persona) — so at most two runs per hour
> share a window with any `aesthete-gate.sh walk` calls. On a trip the report
> says so explicitly (it is not an engine failure); local-dev unblock:
> `docker exec supabase_db_supabase psql -U postgres -d postgres -c 'DELETE FROM quiz_rate_limits;'`.

## What lives here

| File | Role |
|---|---|
| `README.md` | this document — the suites and their bars |
| `personas.json` | the 4 fixed quiz→rec personas (§14.3) + per-persona `eval` knobs (category probe) |
| `run-eval.md` | the frozen invocation surface |
| `run-eval.sh` / `run-eval.ts` | the harness (bash dispatcher → deno implementation) |
| `golden/g1-spectrums.template.csv` | labeling sheet for the G1 sprint (see below) |
| `golden/g2-neighborhoods.template.csv` | labeling sheet for the G2 sprint (see below) |
| `golden/g1-spectrums.json` | *(week-4 output)* G1 spectrum golden set — 150 products × 2–3 designer scores |
| `golden/g2-neighborhoods.json` | *(week-4 output)* G2 neighborhood set — 30 seeds × "closest 5 of 20" picks |
| `out/` | per-run reports (gitignored) |

## The designer labeling sprint (week 4) — how to produce the golden sets

**G1 (spectrums).** Duplicate `golden/g1-spectrums.template.csv` per designer
(or share one sheet with a `designer` column, as shipped). 150 products — a
superset of the calibration anchors — each scored INDEPENDENTLY by 2–3
designers on the six spectrums in [-1, +1], plus primary/secondary archetype
names from the `styles` taxonomy. No conferring; disagreement is signal
(Krippendorff's α is measured before the model is). Convert to
`golden/g1-spectrums.json` as an array of
`{product_id, designer, scores: {warmth, …}, archetype_primary, archetype_secondary}`.

**G2 (neighborhoods).** For each of 30 seed products, the sheet lists 20
candidates; each designer marks EXACTLY 5 as `is_closest_5=1` ("closest in
feel", not same category). Convert to `golden/g2-neighborhoods.json` as
`[{seed_product_id, candidates: [{product_id, is_closest_5}]}]` (one entry per
seed per designer, or majority-merged — note which in the PR).

CSV→JSON conversion is deliberately manual/scripted-at-sprint-time: the person
converting must eyeball the labels once. The harness refuses to run G1/G2
without these files — it never synthesizes ground truth.

## The suites (design §14)

### G1 — spectrum golden set (§14.1)
150 products independently scored by 2–3 designers (a superset of the
calibration anchors). **Measure the human ceiling first**: Krippendorff's α
(interval) per dimension; any dimension with α < 0.6 gets its definition and
anchors fixed before any model is blamed.

Model bars, vs the designer mean:
- MAE ≤ **0.20** per dimension (six spectrums: warmth, complexity, formality,
  timelessness, boldness, craftsmanship)
- archetype top-1 ≥ **70%**, top-2 ≥ **90%**

### G2 — neighborhood golden set (§14.2)
30 seed products; designers mark the "closest 5 of 20". Embedding kNN
**precision@5 ≥ 0.5**. Also tracks the **category-leak metric** — the fraction
of unconstrained top-10 neighbors sharing style archetype vs merely sharing
category — before/after the Phase-2 style projection; the projection ships only
if it improves leak without hurting precision.

### Persona panel — quiz→rec (§14.3)
4 fixed personas (each designer channels a real past client; see
`personas.json`) plus free-form runs. Per top-10:
- love ≥ **3**, kill ≤ **2**
- **zero** category errors, **zero** budget violations
- ≥ **1** "wouldn't have thought of it, but yes"
- every card's `why` judged coherent

### Taste-vector sanity — "does Ana's vector predict Ana" (§14.4)
Chronological backtest: fit θ on judgments < t, score judgments > t. Bars:
pairwise accuracy ≥ **0.65 @ 100** judgments, ≥ **0.72 @ 300** (chance = 0.5).
**Ablation gate:** θ_D must beat θ_H on the designer's own held-out judgments
by ≥ 5 points or their dial's high stop stays locked. This number *is* ρ_D —
eval and product share one metric.

### Offline replay (§14.5)
`match_events` rows (scores + per-term contributions + exploration flags)
replayed under candidate weight vectors; NDCG against realized saves/purchases
plus a rank-overlap diff. Weight changes ship only on a non-regressing replay
+ a panel spot-check. No MLflow — a notebook and a table.

### Ops dashboards (§14.6)
Embedding coverage %, draft-confidence histogram, calibration MAE trend,
explore-slot/exploit save-rate ratio (healthy band **0.4–0.8**), max designer
share in θ_H ≤ **0.35**, quiz p95.

## The week-6 demo bar (§14.7)

Quiz → top-10 with, across all 4 personas:
1. **zero** category errors and **zero** budget violations;
2. ≥ **6/10** panel-endorsed;
3. a plain-language `why` on every card passing copy law (never "AI", never
   numbers/scores in copy);
4. **p95 quiz→results < 2 s** on the all-SQL path (this is the same budget
   `scripts/aesthete-gate.sh walk` asserts);
5. the dial visibly changes the set (house vs one seeded designer portfolio
   vector).

## Placeholders / open until later waves

- `personas.json` answers use the option keys documented in design §7.1/§7.2.
  The full option vocabulary (notably `lifestyle` and `catalyst` beyond
  `new_home`) is finalized by the Wave-1B `quiz_option_loadings` seed — update
  personas then if keys are added.
- Expected style leanings are directional placeholders until the week-4
  calibration; the persona panel's love/kill labels come from designers, not
  this repo.
