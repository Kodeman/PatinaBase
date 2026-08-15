# Aesthete Engine — Deploy & Operations Runbook

**Audience:** the operator deploying the Aesthete Engine to production (Coolify + self-hosted Supabase).
**Companion docs:** design contract `aesthete-engine-system-design.md` · program `aesthete-engine-delivery-plan.md` · barrier history `aesthete-engine-delivery-log.md` · worker `services/aesthete-inference/README.md` · marketing wire `packages/aesthete-quiz/WIRE-CONTRACT.md`.
**Status at authoring (Wave 5A, 2026-07-02):** everything below is BUILT and green on the local stack through barrier G4 + migration 00251. **Nothing is on prod yet** — this document is the go/no-go checklist and the deploy procedure. The deploy itself is human-gated (Kody).

> **House law — order of operations:** migrations **before** apps, always. A portal or edge fn that reaches for a table/RPC that isn't there yet fails closed. Deploy order is fixed:
> **① migrations (00239–00251) → ② edge functions → ③ inference worker → ④ portals → ⑤ post-deploy smoke.**

---

## 0. Pre-flight (design risk #1 — do this first)

Verify prod pgvector before anything else. The design needs only `>= 0.5.0`; exact-scan scoring is viable at MVP scale, and HNSW-else-ivfflat is handled in 00239.

```bash
# on the prod DB (SSH + docker exec, or psql over the tunnel)
psql -c "SELECT extversion FROM pg_extension WHERE extname = 'vector';"
```

- `>= 0.8.0` → HNSW index lands as written.
- `0.5.x–0.7.x` → 00239's `HNSW-else-ivfflat` block falls back to ivfflat automatically; no change needed.
- absent / `< 0.5.0` → **stop**; bump the Postgres image (scheduled maintenance, off the critical path) before deploying.

Also confirm the two cron GUCs are set (see §2) — a stale `service_role_key` GUC silently breaks every cron→edge call (this exact failure cost the email system 14+ days; see `project_email_system_audit_2026_05_12`).

---

## 1. Migrations (step ①)

Thirteen migrations make up the engine. They are **append-only and numbered**; apply in order. All are idempotent-on-reset and were verified green on a fresh `supabase db reset` through G4 (+ 00251 verified by transactional apply).

| # | File | Contents |
|---|---|---|
| 00239 | `aesthete_space` | pgvector assert; `aesthete_vector` → 768; vec helpers; HNSW-else-ivfflat; 00157 views recreated verbatim |
| 00240 | `product_dna` | `product_dna` + drafts + `dna_vocab` seed + spectrum columns + RLS |
| 00241 | `aesthete_jobs` | job outbox + claim RPCs + product/DNA triggers + embed/draft crons + **catalog backfill enqueue** |
| 00242 | `aesthete_taste_foundation` | §5.4 taste tables + RLS; export/retire + house-curation RPCs; `style_centroids`; house v0 slot |
| 00243 | `aesthete_client_quiz` | `client_style_profiles` + `submit_style_quiz` + `claim_quiz_session` + `quiz_option_loadings` seed + rate limits + janitor + quiz_sessions RLS fix |
| 00244 | `aesthete_match_rpc` | `match_weight_profiles` (+v1) + `why_phrases` (+seed) + `get_aesthete_matches` + `aesthete_search` + `get_recommendations` shim + `match_events` |
| 00245 | `aesthete_behavior_stats` | `product_behavior_stats` matview + nightly refresh cron |
| 00246 | `aesthete_quiz_bridge` | `process_style_quiz` internals → `_compute_quiz_profile()` (iOS-frozen signature) |
| 00247 | `aesthete_ask_knn` | invoker kNN helper for `aesthete-ask` |
| 00248 | `aesthete_nightly` | taste refit + `preview_taste_update` + nightly cron 02:30 |
| 00249 | `aesthete_house_portfolio` | portfolio bucket + embed drain + geometric-median centroid + house fallback + `derive_signature_biases` + `match_designers_for_client` + 03:15 cron |
| 00250 | `aesthete_audit_jobs` | `aesthete-drift-audit` + stale-jobs janitor + `ask_embed_cache` + audit/janitor crons |
| 00251 | `aesthete_why_phrases_breadth` | `why_phrase_alts` + `_ae_pick_why_phrase` (staged copy breadth — see §7) |

**How to apply on prod:** the project's normal migration path (`supabase db push`, or the Coolify DB-migration job). Confirm the pre-deploy DB is at the last non-aesthete migration and no numbering collided with a concurrent program (The Document tracks have consumed numbers before — re-check `supabase_migrations.schema_migrations` before pushing).

**Crons register themselves** inside these migrations via the guarded `pg_cron → invoke_edge_function` idiom (00081): locally the GUCs are unset so `invoke_edge_function` WARNs and no-ops; on prod they fire once §2's GUCs are set.

---

## 2. Environment variables & secrets (the full inventory)

Three surfaces need config: the **edge-function runtime**, the **inference worker**, and the **Postgres cron GUCs**. Keep `INFERENCE_TOKEN` identical between the worker and the edge fns.

### 2a. Edge-function runtime (`supabase secrets set …`, or Coolify env on the functions container)

| Var | Required? | Notes |
|---|---|---|
| `SUPABASE_URL` | auto | injected by the edge runtime |
| `SUPABASE_ANON_KEY` | auto | injected |
| `SUPABASE_SERVICE_ROLE_KEY` | auto | injected; the crons call in as service-role |
| `INFERENCE_URL` | **yes** | internal worker URL — `http://aesthete-inference:8000` (Coolify internal network) |
| `INFERENCE_TOKEN` | **yes** | bearer for the worker; **must match** the worker's `INFERENCE_TOKEN` |
| `ANTHROPIC_API_KEY` | for drafts | **HUMAN-GATED / unprovisioned.** `aesthete-dna-draft` parks its queue gracefully without it (no crash) — drafts simply don't fill until it's set |
| `DAILY_BUDGET_USD` | optional | `aesthete-dna-draft` spend guard; parks the draft queue at the cap. Defaults inside the fn if unset |
| `POSTHOG_KEY` | optional | `phc_…` project key; **absent ⇒ log-only fallback** (events degrade to Logflare lines, never fail a cron) |
| `POSTHOG_HOST` | optional | default `https://us.i.posthog.com` |

### 2b. Inference worker (Coolify service env — see `services/aesthete-inference/README.md`)

| Var | Default | Notes |
|---|---|---|
| `INFERENCE_TOKEN` | — | **required; the worker refuses to start without it.** Match §2a |
| `MODELS_DIR` | `/models` (in image) | weights are baked into the image |
| `INFERENCE_MAX_CONCURRENCY` | `8` | returns 429 past this depth → edge fns back off + re-enqueue |
| `ORT_INTRA_OP_THREADS` | `2` | match the CPU limit |
| `IMAGE_FETCH_TIMEOUT_S` | `10` | per-URL httpx timeout |
| `IMAGE_MAX_BYTES` | `15728640` (15 MB) | content-length + streamed-body cap |
| `TEXT_MAX_TOKENS` | `2048` | tokenizer truncation |

### 2c. Postgres cron GUCs (the cron→edge bridge — 00081)

`invoke_edge_function` reads these; **if either is missing or stale, every aesthete cron silently no-ops** (this is the email-system failure mode — `project_email_system_audit_2026_05_12`, `project_email_prod_deploy_gotchas`). Set once, and **re-verify after any service-role key rotation**:

```sql
ALTER DATABASE postgres SET app.settings.supabase_url      = 'https://api.patina.cloud';
ALTER DATABASE postgres SET app.settings.service_role_key  = '<SERVICE_ROLE_KEY>';
-- verify (must both return non-empty):
SELECT current_setting('app.settings.supabase_url', true),
       current_setting('app.settings.service_role_key', true);
```

---

## 3. Edge functions (step ②)

Five functions, all JWT-protected/service-role (already registered in `scripts/deploy-edge-functions.sh`'s `JWT_PROTECTED` array — no `config.toml` `verify_jwt` override needed):

- `aesthete-embed-worker` — drains embed jobs → inference worker → upserts vectors
- `aesthete-dna-draft` — drains draft jobs → Claude → `product_dna_drafts` (parks without `ANTHROPIC_API_KEY`)
- `aesthete-ask` — ⌘K / librarian: embed ask (1.5 s → FTS fallback), match; **never persists ask text**
- `aesthete-nightly` — 02:30 taste refit + house draft + stats writers + centroids/matview
- `aesthete-drift-audit` — weekly guardrail audits → `aesthete_audit` + PostHog

```bash
# deploy all five (also deploys the email/engagement fns in the same arrays):
./scripts/deploy-edge-functions.sh aesthete
# requires: supabase CLI + an active project link (supabase link)
```

The shared helper `supabase/functions/_shared/aesthete*.ts` deploys with each function (bundled). Deploy the worker (§4) **before** the first embed cron fires, or the embed batch just re-enqueues (harmless, drains on recovery).

---

## 4. Inference worker (step ③) — Coolify service

The worker is a tiny FastAPI/ONNX service (`services/aesthete-inference`), stateless, **no DB access**, internal Docker network only.

> **Environment note carried from Wave 1:** the multi-stage `docker build` was **environment-blocked locally** (Docker Desktop VM egress wedged — Hub + ECR probes hung; `FROM python:3.12-slim` DeadlineExceeded). The image was never built locally. **Wave 5B / this deploy re-runs `docker build` on the Coolify host** (its own network) — that is the first real image build. Evidence + the deferral note are in the worker README.

Coolify service definition:
- **Build:** `services/aesthete-inference/Dockerfile` (stage 1 downloads + ONNX-exports both nomic v1.5 models with int8 quant; stage 2 `python:3.12-slim` + runtime deps + baked `/models`). Image ~0.5–1 GB.
- **Sizing (design §12.1):** `mem_limit 2g`, `cpus 2.0`, single uvicorn worker, `ORT_INTRA_OP_THREADS=2`.
- **Env:** `INFERENCE_TOKEN` (required; = §2a's), plus the §2b table.
- **Internal URL:** `http://aesthete-inference:8000` — this is exactly what the edge fns' `INFERENCE_URL` must be.
- **Health:** `GET /healthz` (open, no auth) → `{status, model_version, text_dim:768, image_dim:768, warmed:true}`. `model_version` is currently `nomic-v1.5-onnx-int8-r1`.

Post-deploy worker check:
```bash
# from inside the Coolify network (e.g. exec into an app container):
curl -s http://aesthete-inference:8000/healthz
curl -s -X POST http://aesthete-inference:8000/embed/text \
  -H "Authorization: Bearer $INFERENCE_TOKEN" -H 'Content-Type: application/json' \
  -d '{"inputs":[{"id":"t1","text":"warm oak sideboard","kind":"query"}]}'
```

---

## 5. Cron registry

All aesthete crons register via the guarded `cron.schedule(... invoke_edge_function ...)` / local-fn idiom in the migrations. After deploy, confirm with `SELECT jobname, schedule FROM cron.job WHERE jobname LIKE 'aesthete-%';`.

| Cron | Schedule | Target | Migration |
|---|---|---|---|
| `aesthete-embed` | `* * * * *` (every min) | `aesthete-embed-worker` edge fn | 00241 |
| `aesthete-dna-draft` | `*/2 * * * *` (every 2 min) | `aesthete-dna-draft` edge fn | 00241 |
| `aesthete-nightly` | `30 2 * * *` (02:30) | `aesthete-nightly` edge fn | 00248 |
| `aesthete-house-portfolio` | `15 3 * * *` (03:15) | `aesthete_house_portfolio_nightly()` **(local SQL fn, not an edge fn)** | 00249 |
| `aesthete-behavior-stats` | `20 3 * * *` (03:20) | matview refresh (local SQL) | 00245 |
| `aesthete-quiz-janitor` | `45 3 * * *` (03:45) | quiz-session janitor (local SQL) | 00243 |
| `aesthete-jobs-janitor` | `*/10 * * * *` (every 10 min) | stale-`running` jobs → pending (local SQL) | 00250 |
| `aesthete-drift-audit` | `0 4 * * 0` (Sun 04:00) | `aesthete-drift-audit` edge fn | 00250 |

Every batch is re-entrant and small — nothing relies on one long invocation (pg_net's 60 s window, design risk #9).

---

## 6. Backfill (the catalog vectors)

Nothing extra to run: **00241 enqueues embed jobs for the entire published catalog on apply** (existing products predate the triggers). Once the worker (§4) is up and `aesthete-embed` is firing, the queue drains automatically — a ~5k-product image backfill is ≈ 1.5–2 h single-worker; run the initial drain off-peak (design §12.3, risk #2). Watch progress:

```sql
SELECT kind, status, count(*) FROM aesthete_jobs GROUP BY 1,2 ORDER BY 1,2;
-- embedding coverage:
SELECT count(*) FILTER (WHERE aesthete_vector IS NOT NULL)::float / count(*) FROM products WHERE status = 'published';
```

DNA drafts (`aesthete-dna-draft`) will park until `ANTHROPIC_API_KEY` is set — expected, not an error.

---

## 7. The why-phrase breadth layer (00251) — staged, not yet wired

00251 ships `why_phrase_alts` + `_ae_pick_why_phrase(term, band, seed)`: a deterministic-rotation copy library that fixes the G3 monotony flag ("Sits right where your taste settles" dominated). **It is deliberately NOT wired into `get_aesthete_matches` yet** — 00244's match RPC is a frozen, byte-compatible contract and Wave 5A is additive/tidy with no runtime-logic change. The served copy is therefore **unchanged** by this deploy.

**To activate the breadth** (a future, reviewed match-RPC revision owned by 2A): swap the three `SELECT wp.template INTO v_phrase FROM why_phrases …` statements in `get_aesthete_matches` for:
```sql
v_phrase := _ae_pick_why_phrase(rr.nterm, v_band, r.opid::text);
```
The selector falls back to `why_phrases` for any `(term, band)` without alternates, so it is a safe 1:1 drop-in. The determinism suite (`match_rpc_test.sql`) and the copy-law grep both continue to pass by construction; `why_phrases_breadth_test.sql` proves the rotation is deterministic-per-seed and varied across seeds.

---

## 8. Post-deploy smoke (step ⑤)

The demo path is pure SQL — it works the moment migrations land (before the worker drains vectors, matches fall back to spectrum-only scoring).

```bash
BASE=https://api.patina.cloud
ANON=<NEXT_PUBLIC_SUPABASE_ANON_KEY>

# 1. anon quiz → profile
SESSION=$(uuidgen)
curl -s -X POST "$BASE/rest/v1/rpc/submit_style_quiz" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H 'Content-Type: application/json' \
  -d "{\"p_session_key\":\"$SESSION\",\"p_answers\":{ /* §7.1 answers */ },\"p_timings\":{},\"p_source\":\"smoke\",\"p_attribution\":{}}"

# 2. anon quiz → top-10 matches with whys
curl -s -X POST "$BASE/rest/v1/rpc/get_aesthete_matches" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H 'Content-Type: application/json' \
  -d "{\"p_session_key\":\"$SESSION\",\"p_limit\":10}"
```

Assert: profile carries six spectrums; matches return ≤10 rows each with a `why` payload (≤3 reasons, ≥1 concrete, no digits, no "AI"), `is_exploration` on the last 2 slots. Latency budget: quiz→results **p95 < 1 s end-to-end** (§12.3). Then a Chrome walk of the client-portal `/quiz` and the designer ⌘K.

---

## 9. Rollback

The engine is **additive**: it re-types one empty column (00239) and adds new tables/RPCs/crons. **Nothing before the vector backfill is destructive** — no existing data is dropped or rewritten, the five 00008 similarity RPCs and the `v_aesthete_*_input` views are recreated byte-identical, and `process_style_quiz`/`get_recommendations` keep frozen signatures (iOS ships nothing).

- **Fast disable (no migration rollback):** unschedule the crons and stop the worker — the engine goes quiet, portals degrade gracefully (quiz path is pure SQL and unaffected; ⌘K falls back to FTS with "the Engine is resting"):
  ```sql
  SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname LIKE 'aesthete-%';
  ```
- **Edge fn rollback:** redeploy the prior function versions (or delete the five — the crons then no-op-WARN).
- **Per-migration rollback:** each migration is self-contained; drop from the top down (00251 → 00239). The only irreversible step is 00239's `aesthete_vector` re-type (1536→768) — but the column was empty (design §16), so re-typing back is likewise free.
- **Worker rollback:** weights are baked/content-addressed (`model_version`) — redeploy the prior image tag for an atomic rollback.

---

## 10. Marketing-repo integration

The external **PatinaWebsite (marketing) repo** does not share this monorepo. Its integration contract is **`packages/aesthete-quiz/WIRE-CONTRACT.md`** — the canonical, version-pinned description of the two anon PostgREST RPCs (`submit_style_quiz`, `claim_quiz_session`), headers, request/response shapes (§7.1), and the `{BASE}` origins (prod `https://api.patina.cloud`). The `@patina/aesthete-quiz` package (`/core` plain-fetch client + `/react`) is convenience on top of that contract. Hand the marketing team that one file; nothing else in this repo is required to embed the quiz.

---

## 11. Definition of Done — §15.3 sweep

Each §15.3 MVP-cut criterion mapped to its evidence. **DONE** = proven on the local stack (barrier log ref); **DEFERRED** = human-gated or explicitly a post-MVP / prod-soak item per the program's HITL table.

| # | §15.3 criterion | Status | Evidence / note |
|---|---|---|---|
| 1 | Anon quiz green on host | **DONE (local)** | G1 anon wire proof over Kong; G2 `walk` anon quiz→profile→top-10 in 86 ms |
| 2 | Authed quiz green on both hosts | **PARTIAL / DEFERRED** | client-portal `/quiz` + claim-on-signup shipped (G3); iOS ships nothing (frozen shim). Real prod both-host validation = post-deploy |
| 3 | Match RPC with whys / exploration / budget-bell | **DONE** | G2 — full §10 pipeline in 00244; deterministic 8+2 exploration; budget log-bell; 26 copy-law-verified why phrases (+ breadth staged, 00251) |
| 4 | ≥ 500 designer-validated products w/ vectors + spectrums | **DEFERRED (human)** | needs the designer validation sprint + House Hundred; demo seed is **synthetic, clearly flagged** (G2/G3). Learning bars proven on synthetic (G4) |
| 5 | iOS `process_style_quiz` / `get_recommendations` byte-compatible | **DONE (compat)** / soak DEFERRED | G2 — both contracts byte-compatible, signatures string-asserted vs 00067 (`shim_contract_test.sql`). Parity soak = weeks 19–22 |
| 6 | Teaching prefill live | **DONE** | G3 — teaching prefill from drafts + judgments UI + probe loop |
| 7 | Taste tables + export/retire shipped | **DONE** | G1 — 00242 taste foundation, export/retire RPCs, RLS suite |
| 8 | Dial live and defaulted house-leaning | **DONE** | G2 θ-blend dial (NULL-degradation); G4 dial-unlock verdict TRUE (θ_D beats θ_H) |
| 9 | All SQL suites pass on fresh reset | **DONE** | G4 — db 11 suites on bare reset; + `why_phrases_breadth_test.sql` (12). Baseline = bare reset; demo seed applies after (4 suites made seed-robust) |
| 10 | Inference-down drill (quiz unaffected, ⌘K → FTS) | **DONE** | G4 — `scripts/aesthete-drill.sh` 6/6; degradation ladder proven |
| 11 | Guardrail audits green two consecutive weeks | **PARTIAL / DEFERRED** | two consecutive local **runs** green + idempotent (G4); two consecutive **weeks in prod** = post-deploy soak |

### Human-gated dependencies still open (program HITL table)

| Item | Owner | Current placeholder |
|---|---|---|
| `ANTHROPIC_API_KEY` (dna-draft) | Kody | mocked-API tests green; draft queue parks gracefully; real smoke deferred |
| House Hundred curation + 1-hr calibration | Lead | validated-catalog centroid fallback (00249); house stays pre-consensus/neutral-θ |
| Real designer validation + judgments | designers | synthetic demo seed (flagged); learning bars proven on synthetic (G4) |
| Quiz imagery (room 2×2s, texture macros) | Kody/content | placeholder images; loadings independent; embeddings recomputed on real content |
| Prod deploy go | Kody | this runbook's human gate |

---

*Deploy order is the whole game: migrations 00239–00251, then edge fns, then the worker, then portals, then smoke. Everything additive; nothing pre-backfill destructive; the quiz path is pure SQL and never depends on the worker.*
