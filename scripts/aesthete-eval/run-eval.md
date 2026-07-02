# Running the Aesthete eval harness

> **Status: specification.** The runnable harness lands in **Wave 3D** (see
> `docs/prds/AE/aesthete-engine-delivery-plan.md`). This file freezes the
> invocation surface so Wave 3D implements to it rather than inventing one.

## Invocation (Wave 3D implements this)

```bash
# From the repo root, against the local stack (supabase db reset + demo seed applied):
bash scripts/aesthete-eval/run-eval.sh <suite> [--json] [--out <dir>]
```

| Suite | What it runs | Bar (design §14) |
|---|---|---|
| `personas` | POSTs each `personas.json` persona through `submit_style_quiz` → `get_aesthete_matches`, checks category/budget violations + why coverage, emits the top-10 per persona for panel review | 0 category errors, 0 budget violations, ≥ 1 match with `why` per card, p95 < 2 s (§14.7) |
| `g1` | scores `golden/g1-spectrums.json` products against `product_dna` spectrums + archetypes | MAE ≤ 0.20/dim; top-1 ≥ 70%, top-2 ≥ 90%; reports Krippendorff's α first |
| `g2` | kNN over product vectors vs `golden/g2-neighborhoods.json` picks | precision@5 ≥ 0.5; category-leak tracked |
| `backtest` | chronological θ refit on `taste_judgments` (< t train, > t score) via the worker's `/fit/taste` | pairwise ≥ 0.65 @ 100, ≥ 0.72 @ 300; θ_D − θ_H ablation ≥ 5 pts |
| `replay` | re-ranks logged `match_events` under candidate weight profiles | non-regressing NDCG + rank-overlap diff |
| `all` | everything above, summary table, non-zero exit on any missed bar | — |

## Environment

- `SUPABASE_REST_URL` (default `http://localhost:54321`) and
  `SUPABASE_ANON_KEY` — same resolution as `scripts/aesthete-gate.sh`
  (`supabase status -o env`, falling back to the standard local demo key).
- `AESTHETE_EVAL_OUT` (default `scripts/aesthete-eval/out/`, gitignored) —
  per-run JSON + the persona top-10 sheets handed to the designer panel.
- Suites `g1`/`g2`/`backtest` need the demo seed loaded first:

```bash
docker exec -i supabase_db_supabase psql -U postgres -d postgres \
  < scripts/aesthete-demo-seed.sql
```

## Relationship to the gate

`scripts/aesthete-gate.sh walk` is the *smoke* cut of the `personas` suite
(one persona, shape + latency assertions only). The eval harness is the
*measurement* cut — it produces numbers against the §14 bars and is run at
wave barriers G2+ and before the week-6 demo. The gate stays fast and binary;
the harness is allowed to be slow and numeric.

## Until Wave 3D

Only `personas.json` and this spec exist. The golden-set fixtures are produced
by the week-4 designer validation sprint (G1/G2 labels are designer output,
never synthesized), and `run-eval.sh` + `out/` reporting land with Wave 3D.
