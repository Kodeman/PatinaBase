# Aesthete Engine (Taste / Designer-Taught Intelligence) — Consolidated PRD

## 1. Header

**Area**: Aesthete Engine — Patina's taste/matching system (quiz → recommendations, designer teaching/judgment, house-taste curation, ⌘K "ask the Engine").

**Per-sub-feature status:**

| Sub-feature | Status |
|---|---|
| Client style quiz → top-10 matches (pure SQL hot path) | Shipped (build-complete; DB tier on prod, app tier not) |
| Product embedding ingestion (text + image → 768-d vectors) | Shipped in code — Partial in prod (worker not deployed, so pipeline is dark) |
| Product DNA draft-fill (Claude Haiku/Sonnet) | Shipped in code — Partial in prod (parks without `ANTHROPIC_API_KEY` under the right env name) |
| Designer teaching / judgment surfaces (`/judgments`, `/your-eye`) | Shipped in code — Partial in prod (no edge fn / worker to drive nightly refit yet) |
| Nightly Bradley–Terry taste refit + house-taste curation | Shipped in code — Partial (no real judgments/House Hundred yet; runs on synthetic seed only) |
| ⌘K / librarian "ask the Engine" | Shipped in code — Partial in prod (edge fn `aesthete-ask` not yet deployed) |
| Guardrail drift audits | Shipped in code — Partial (green locally; two-consecutive-weeks-in-prod soak not yet run) |
| Why-phrase breadth (`why_phrase_alts`) | Planned — staged in 00251 but deliberately not wired |
| Phase-2 learned style projection (ridge regressions, CAV slider-nudge, 768→64 projection) | Planned |
| `product_relationships` (F8: pairs_with/clashes_with/etc.) | Planned |
| Typesense/keyword-facet search | Planned (deferred behind FTS+trgm seam) |
| iOS native AE UI | Planned (iOS keeps only frozen legacy shims; no net-new UI) |

**Last reconciled:** 2026-07-06

**Source docs:**
- `docs/prds/AE/aesthete-engine-product-brief.md`
- `docs/prds/AE/aesthete-engine-system-design.md`
- `docs/prds/AE/aesthete-engine-delivery-plan.md`
- `docs/prds/AE/aesthete-engine-delivery-log.md`
- `docs/prds/AE/aesthete-engine-runbook.md`
- `docs/prds/AE/aesthete-engine-prod-readiness.md`
- `docs/prds/AE/aesthete-engine-salvage.md`
- `docs/prds/AE/aesthete-engine-deck.html`
- `docs/prds/AE/aesthete-engine-system-design-deck.html`
- `docs/specs/Redesign/patina-aesthete-engine-design.html`

## 2. Overview

The Aesthete Engine is Patina's taste/matching system: one shared 768-dimensional aesthetic space in which products, clients, designers, and "the house" are all points, so a quiz answer, a product photo, a designer's portfolio, and a ⌘K ask can all be compared with a single cosine-similarity operation. Its headline deliverable is the "quiz → top-10 recommendations with an honest, human 'why'" loop.

**Primary users:**
- **Prospective clients** — a pre-auth style quiz on the client portal that produces immediate, explained product matches.
- **Designers** — a teaching/judgment surface (pairwise comparisons, signature-bias editing) that feeds a per-designer taste model, plus a ⌘K/librarian "ask the Engine" bar in the designer portal that answers as presence, never as a standalone page (per The Document's product law R31/R38).
- **The house lead** — curates "house taste" (a consensus aesthetic point used to warp match scoring toward Patina's editorial point of view).

**Where it lives:** Architecturally the engine IS the database. The client-facing hot path (quiz → matches) is pure SQL with zero inference calls at request time. One net-new stateless Python/ONNX inference worker (`services/aesthete-inference`) handles embeddings and taste-refit math at ingestion/nightly time, off the request path. Five Deno edge functions on the pg_cron bridge orchestrate the machine work (embedding drain, DNA drafting, nightly refit, drift audit, ⌘K ask). Copy law is enforced server-side: match reasons render from a `why_phrases` table, and all surfaces say "Designer-Taught Intelligence," never "AI." The program was built by an agent-team across 6 waves (0–5) and is build-complete on main; the database tier is deployed to prod, the app tier (worker + edge fns + portal redeploy) is not.

## 3. As-Built Architecture

### Where it lives

- **Inference worker** — `services/aesthete-inference/` (FastAPI + ONNX int8, nomic-embed-text-v1.5 + nomic-embed-vision-v1.5, both 768-d, aligned). Key files: `app/main.py` (routes), `app/embedder.py`, `app/images.py`, `app/fit.py` (Bradley–Terry MAP taste refit), `app/schemas.py`, `app/config.py` (refuses to start without `INFERENCE_TOKEN`). Stateless, no DB, internal-only, Bearer auth. Tests in `tests/` (golden-cosine, backpressure, prefixes, fit). `Dockerfile` is multi-stage (stage 1 downloads ~1 GB HF models + int8-quantizes; never built end-to-end).
- **Edge functions** (Deno) — `supabase/functions/aesthete-embed-worker/`, `supabase/functions/aesthete-dna-draft/`, `supabase/functions/aesthete-ask/`, `supabase/functions/aesthete-nightly/`, `supabase/functions/aesthete-drift-audit/` (each has `index.ts` + a pure `lib.ts` + Deno tests). `aesthete-dna-draft/` additionally has `claude.ts` + `db.ts` + fixtures; `aesthete-nightly/` adds `fit-client.ts`; `aesthete-embed-worker/` adds `portfolio.test.ts`.
- **Quiz package** — `packages/aesthete-quiz/` with `src/core/` (questions, quiz-machine, session-key, wire-client — plain-fetch PostgREST, errors) and `src/react/` (components, provider, `use-style-quiz`). Ships a `WIRE-CONTRACT.md` for the external marketing repo. Has no `supabase-js` dependency by design (must be consumable from the marketing repo).
- **Data-access hooks** — `packages/supabase/src/hooks/use-aesthete-taste.ts` (`useDueTasteProbes`, `useJudgmentPool`, `useMyJudgmentCount`, `useSubmitTasteJudgment`, `useSubmitTasteCorrection`, `useMyTasteProfile`, `useMySignatureBiases`, `useUpdateMyBiases`, `useMyStyleConfidence`, plus pure helpers `buildJudgmentDeck` / `nudgeBiasStrength`); `use-product-dna.ts` (`useProductDnaDraft`, `resolveSpectrumPrefill`, `summarizeDraftFacts`); `use-engine-ask.ts` (`useEngineAsk` → invokes `aesthete-ask`). All registered in `packages/supabase/src/hooks/index.ts`.
- **Domain types** — `packages/types/src/aesthete.ts`, `packages/types/src/style-profile.ts`, `packages/types/src/teaching.ts`.
- **Migrations** — `supabase/migrations/00239`–`00251` (13 files; see Section 4).

### Runtime flow (as built)

1. **Quiz → matches (pure SQL, no inference at request time):** client portal `/quiz` (via `@patina/aesthete-quiz`) calls `submit_style_quiz` (SECURITY DEFINER, anon+auth) → `_compute_quiz_profile()` computes the six-spectrum profile and assembles the dense client vector in-DB from `quiz_option_loadings.image_embedding` + `style_centroids` (renormalizes onto available halves, NULL when none) → writes `quiz_sessions` + versioned `client_style_profiles`. The results view calls `get_aesthete_matches` (the full 10-term §10 pipeline: hard category filter → ANN candidates over the HNSW index → spectrum/material/budget/function/context/taste/behavioral scoring warped by the house-blend dial → deterministic 8+2 MMR exploration → per-term "why" rendered from `why_phrases`). Logs `match_events` (rows with `source='engine_ask'` carry NO query text — only latency + result-count).
2. **Ingestion:** a product-insert trigger enqueues `aesthete_jobs`; `aesthete-embed-worker` (cron every 1 min) drains the queue → calls the worker's `/embed/text` + `/embed/image` → upserts `products.embedding` (plain text) + `products.aesthete_vector` (0.65·mean(images) + 0.35·caption, fused) + `products.style_caption`. `aesthete-dna-draft` (cron every 2 min) drains draft jobs → Claude (Haiku bulk → Sonnet escalate) structured output → `product_dna_drafts` (never the canonical spectrum row); parks `{parked:true}` when `ANTHROPIC_API_KEY` is absent.
3. **Designer teaching/learning:** pre-existing `/portal/teaching/{,quick,deep,validate,product/[id]}` plus net-new `/your-eye` ("Your Eye" signature biases) and `/judgments` (pairwise deck with injected probes). Judgments append to `taste_judgments`; corrections append to `taste_corrections`. `aesthete-nightly` (cron 02:30) orchestrates the per-designer Bradley–Terry refit (worker `/fit/taste`) → `apply_taste_refit` writes θ over the 94-d interpretable basis + snapshots → reliability + confidence map → `refresh_designer_teaching_stats` → house draft → centroids/starvation-decay. A separate `aesthete-house-portfolio` cron (03:15) recomputes portfolio geometric-median centroids, seeds house from validated catalog, derives signature biases, and matches designers to clients.
4. **⌘K / librarian ask:** `components/portal/command-palette.tsx`, `components/document/rooms/library/librarian-bar.tsx`, `components/document/engine/engine-results.tsx` → `useEngineAsk` → `aesthete-ask` edge fn embeds the ask text (1.5 s timeout → FTS fallback, "the Engine is resting"), calls `aesthete_ask_knn` (00247) / `get_aesthete_matches`. Ask text is never persisted. There is no standalone engine page (product law R31/R38).
5. **Guardrails:** `aesthete-drift-audit` (cron Sun 04:00) runs `run_aesthete_drift_audit` → 4 checks → writes `aesthete_audit` + PostHog. `aesthete-jobs-janitor` (every 10 min) resurrects stale-running jobs.

### Legacy pieces retired / re-pointed

- The old `services/aesthete-engine` Python service was deleted (Wave 0C; salvage notes in `aesthete-engine-salvage.md`). Dead `use-embeddings.ts` hooks were removed.
- `apps/designer-portal/src/app/api/search/search/similar/route.ts` was re-pointed to `find_products_similar_to` (pgvector) with a category fallback.

## 4. Data Model

All Aesthete Engine schema lives in `public`. Migrations landed as **00239–00251** (renumbered up from the design doc's original 00236–00243 because The Document consumed 00236–00238 concurrently at barrier G0 — see Section 7 for the drift note).

**00239 `aesthete_space`** — re-types `products.aesthete_vector` from `vector(1536)` → `vector(768)` (`USING NULL`, discards the empty column); adds `products.style_caption`, `aesthete_vector_at`, `aesthete_model_version`; adds IMMUTABLE vector helpers `vec_scale` / `vec_lerp` / `vec_normalize` (uses `vector_norm()`, not `l2_norm()`); adds an HNSW-else-ivfflat partial index on `layer='catalog' AND status='published'`; recreates the three 00157 views (`v_aesthete_personal_input` / `_studio_input` / `_catalog_input`) verbatim. Hard-asserts pgvector ≥ 0.5.0 (fails fast and rolls back on old pgvector).

**00240 `product_dna`** — `product_dna` (1:1 with products; typed columns for F1–F9 DNA axes + `confidence`/`attr_source` jsonb maps + `dna_version`), `product_dna_drafts` (raw Claude output, `UNIQUE(product_id, prompt_version)`), `dna_vocab` (soft vocabulary, data-driven not CHECK-constrained); adds `product_style_spectrum.source` (`'manual'|'validated'`) + `.confidence` jsonb (ML never writes this table — the canonical spectrum is always designer-written); adds `user_has_role_domain()` helper.

**00241 `aesthete_jobs`** — `aesthete_jobs` (outbox: `embed_text`/`embed_fused`/`dna_draft`/`portfolio_embed`/`centroid`; `dedupe_key` UNIQUE; resurrect-on-conflict), `aesthete_spend_ledger` (Claude cost governor), `aesthete_audit`; RPCs `claim_aesthete_jobs` / `complete_aesthete_job` (`FOR UPDATE SKIP LOCKED`); enqueue triggers on product insert + DNA/spectrum edit (re-embed); crons `aesthete-embed` (1 min) + `aesthete-dna-draft` (2 min).

**00242 `aesthete_taste_foundation`** (1121 lines) — `designer_taste_profiles` (taste_vector, portfolio_centroid, θ real[], reliability, retired_at), `designer_taste_snapshots`, `designer_style_confidence` (generated weight), `taste_judgments`, `taste_corrections`, `designer_portfolio_items`, `house_taste` (versioned, `ux_house_active` partial unique on `status='active'`), `signature_biases`, `bias_templates`, `taste_rules`, `style_centroids`, `taste_probe_queue` (4% GUC-tunable). `is_aesthete_lead()`, `v_house_taste_public` view. RPCs: `submit_taste_judgment`, `submit_taste_correction`, `update_my_biases`, `export_designer_taste`, `retire_designer_taste`, `compute_house_taste_draft`, `activate_house_taste`, `refresh_style_centroids`.

**00243 `aesthete_client_quiz`** (993 lines) — `client_style_profiles` (nullable `user_id` until claimed, session_key bearer capability, `style_vector` nullable by design), `quiz_option_loadings` (22-row seed; `image_embedding vector(768)`), `quiz_rate_limits`; adds `client_profiles.user_id` + partial unique. RPCs: `_compute_quiz_profile`, `submit_style_quiz`, `claim_quiz_session`, `aesthete_quiz_janitor` + cron. RLS note: dropped the 00001 "allow all" `quiz_sessions` policy (anon could read every session); anon writes now happen only via the SECURITY DEFINER RPC, never direct table reads.

**00244 `aesthete_match_rpc`** (1730 lines) — `match_weight_profiles`, `why_phrases` (26 copy-law-verified seed rows), `match_events`; a dozen `_aesthete_*` scoring helpers; `get_aesthete_matches` (SECURITY DEFINER, GRANT anon+auth, canonical-else-draft spectrum read), `aesthete_search` (FTS+trgm Typesense seam), `aesthete_dev_demo_seed`.

**00245 `aesthete_behavior_stats`** — `product_behavior_stats` matview (F10 derived, Laplace-smoothed save-rate) + refresh fn + cron at 03:20.

**00246 `aesthete_quiz_bridge`** — `process_style_quiz` + `get_recommendations` (frozen iOS contracts from 00067, bodies shimmed onto the new engine, signatures string-asserted byte-compatible).

**00247 `aesthete_ask_knn`** — `aesthete_ask_knn(vector, jsonb)` SECURITY INVOKER kNN for ⌘K.

**00248 `aesthete_nightly`** (734 lines) — `get_taste_refit_designers`, `get_taste_refit_payload`, `apply_taste_refit`, `preview_taste_update` (bounded online step), reliability inputs/apply, `refresh_designer_teaching_stats`, `apply_starvation_decay`, `refresh_style_centroids` (redefined); cron 02:30.

**00249 `aesthete_house_portfolio`** (1022 lines) — portfolio embed trigger, `_aesthete_geometric_median` (Weiszfeld), `recompute_portfolio_centroid`, `seed_house_from_validated_catalog` (draft-only fallback), `derive_signature_biases` (never touches confirmed/edited/muted biases), `match_designers_for_client`, `aesthete_house_portfolio_nightly`; cron 03:15.

**00250 `aesthete_audit_jobs`** — redefines `claim_aesthete_jobs` (+`claimed_at`), adds `ask_embed_cache` UNLOGGED table (Redis-from-edge deviation), `aesthete_jobs_janitor`, `run_aesthete_drift_audit`; crons `jobs-janitor` (10 min) + `drift-audit` (Sun 04:00).

**00251 `aesthete_why_phrases_breadth`** — `why_phrase_alts` table + `_ae_pick_why_phrase` selector, STAGED but deliberately NOT wired into `get_aesthete_matches` (documented as a 3-line follow-up). ⚠ See Section 7.

## 5. API / Edge / Service Surface

### Edge functions (Deno; all JWT-protected/service-role, deployed via `scripts/deploy-edge-functions.sh`)

- **`aesthete-embed-worker`** — cron every 1 min (00241). Drains embed jobs → worker `/embed/*` → upserts vectors. Needs `INFERENCE_URL`, `INFERENCE_TOKEN`.
- **`aesthete-dna-draft`** — cron every 2 min (00241). Claude Haiku→Sonnet DNA draft-fill + spend governor. Needs `ANTHROPIC_API_KEY` (absent → parks, never crashes).
- **`aesthete-nightly`** — cron 02:30 (00248). Orchestrates per-designer taste refit via worker `/fit/taste`. Needs `INFERENCE_URL`/`INFERENCE_TOKEN` (absent → watermark-only).
- **`aesthete-drift-audit`** — cron Sun 04:00 (00250). §13 guardrail checks → `aesthete_audit` + PostHog (`POSTHOG_KEY` optional).
- **`aesthete-ask`** — caller-JWT invoked from ⌘K/librarian. Embeds ask text (1.5 s → FTS fallback), calls kNN. Ask text never persisted.
- **`emergence-recommend`** — ⚠ PRE-EXISTING/legacy, NOT part of Aesthete Engine and NOT rewired: still reads `user_style_signals` + `product_styles`, bypassing the new engine entirely. See Section 7.

### Inference worker (`services/aesthete-inference`, FastAPI)

- `GET /healthz` (open) → status/model_version/text_dim/image_dim/warmed.
- `POST /embed/text`, `POST /embed/image` (Bearer, batch ≤ 16).
- `POST /fit/taste`, `POST /fit/taste/backtest` (Bearer; stateless Bradley–Terry MAP refit — added Wave 4A, beyond the design's §3.2 topology which listed only embed/healthz). ⚠ See Section 7.

### SQL RPCs (PostgREST — the real client-facing API)

- **Anon+auth:** `submit_style_quiz`, `get_aesthete_matches`, `get_recommendations` (iOS), `process_style_quiz` (iOS), `aesthete_search`.
- **Auth:** `claim_quiz_session`, `submit_taste_judgment`, `submit_taste_correction`, `update_my_biases`, `export_designer_taste`.
- **Service-role/lead:** `claim_aesthete_jobs`, `complete_aesthete_job`, `compute_house_taste_draft`, `activate_house_taste`, `retire_designer_taste`, plus all nightly/refit/audit functions.

### Next.js API routes

The Aesthete Engine has essentially none of its own — the quiz calls PostgREST directly via the package wire-client, and hooks call `supabase.functions.invoke`/`.rpc`. The one touched route is `apps/designer-portal/src/app/api/search/search/similar/route.ts` (re-pointed to `find_products_similar_to`).

## 6. UI Surfaces

### Client portal (pre-auth, public)

- `apps/client-portal/src/app/quiz/page.tsx` + `quiz-flow.tsx` — the five-question style quiz, built entirely on `@patina/aesthete-quiz/react` (`useStyleQuiz`, state machine, session-key). `/quiz` is allowlisted in `apps/client-portal/src/middleware.ts` `isPublicPage`.
- `apps/client-portal/src/app/quiz/results/page.tsx` + `results-view.tsx` — top-10 matches with a per-item "why" and the six-spectrum profile.
- Claim-on-signup binds the anon session to the auth user via `claim_quiz_session`.
- E2E coverage: `apps/client-portal/tests/e2e/quiz.spec.ts`.

### Designer portal (teaching + engine)

- `apps/designer-portal/src/app/(portal)/portal/teaching/` — `page.tsx`, `quick/`, `deep/`, `validate/`, `product/[id]/` (pre-existing teaching), plus net-new:
  - `judgments/page.tsx` — pairwise side-by-side judgment deck with injected probes (`useDueTasteProbes`, `useJudgmentPool`, `useSubmitTasteJudgment`, `buildJudgmentDeck`).
  - `your-eye/page.tsx` — "Your Eye" v1: named, editable signature biases (`useMySignatureBiases`, `useMyTasteProfile`, `useUpdateMyBiases`).
  - `_components/engine-first-read.tsx`, `_components/correction-picker.tsx`, `_lib/correction-chips.ts` — DNA draft prefill ("the Engine's first read") + correction chips.
- **⌘K / librarian "ask the Engine":** `components/portal/command-palette.tsx`, `components/document/rooms/library/librarian-bar.tsx`, `components/document/engine/engine-results.tsx` — a vector-upgraded ask via `useEngineAsk`; degrades to FTS ("the Engine is resting"). No standalone engine page, chat surface, or history view (product law R31/R38).

### iOS / extension

- No net-new AE UI. iOS keeps the frozen `process_style_quiz`/`get_recommendations` contracts (shimmed onto the new engine); the `AestheteEngineService.swift` stub still references the deleted FastAPI service (harmless, retire later). Chrome extension: none.

## 7. Reconciliation & Gaps

- ⚠ **Migration numbering drift.** The system-design §5 DDL section headers cite 00236–00243 (§5.1=00236, §5.2=00237, §5.3=00240, §5.4=00239, §5.5="00238, 00241, 00242"), but the code actually landed as a clean, different mapping — space=00239, product_dna=00240, jobs/spend/audit=00241, taste=00242, quiz=00243, match=00244, behavior=00245, quiz-bridge=00246, ask-knn=00247, nightly=00248, house/portfolio=00249, audit-jobs=00250, why-breadth=00251. The v1.0.1 amendment banner in the design doc notes the shift, but the body section headers were never corrected.
- ⚠ **Inference worker endpoints undocumented in the design.** System-design §3.2 topology lists the worker as `/embed/text`, `/embed/image`, `/healthz` only. The shipped worker (`services/aesthete-inference/app/main.py`) also serves `POST /fit/taste` and `POST /fit/taste/backtest` (Bradley–Terry MAP taste refit + backtest, added Wave 4A). Only the prod-readiness doc's §3 reflects the real endpoint list.
- ⚠ **Why-phrase breadth staged but not wired.** 00251 shipped `why_phrase_alts` + `_ae_pick_why_phrase`, but they are deliberately NOT wired into `get_aesthete_matches`. Served match reasons still draw only from the 26 base `why_phrases` rows, so exploit rows repeat a dominant phrase ("Sits right where your taste settles"). The design implies phrase variety; reality is a staged, unwired follow-up.
- ⚠ **`emergence-recommend` never migrated to the new engine.** It still reads legacy `user_style_signals` + `product_styles`, contradicting the design's central claim of "one shared aesthetic space" for all recommendation surfaces. The design deleted the old Python service and re-pointed `/api/search/similar`, but this parallel live recommendation function bypasses `get_aesthete_matches` entirely.
- ⚠ **Ask-embed cache deviates from spec.** Design §12.3 specified a Redis ask-embed cache; the build uses an UNLOGGED Postgres `ask_embed_cache` table (00250) because there is no Redis-from-edge seam in the repo. Documented deviation, but the design text still says Redis.
- ⚠ **House-blend dial has no real consensus yet.** On prod today the house has no consensus θ (no real judgments / no House Hundred), so the dial reads a validated-catalog centroid / neutral θ rather than a curated house taste. The "meaningful dial" the design centers on is structurally present but not yet populated with real data.
- ⚠ **Stale counts in root docs.** CLAUDE.md / root docs cite stale counts ("52 migrations", "33+ edge functions"); the repo actually has 252 migration files (tip 00254) and 39 edge functions. The AE program left these as out-of-scope (noted in the Wave-0 log).
- ⚠ **Functions-container env name mismatches on prod.** Edge functions read `ANTHROPIC_API_KEY`/`POSTHOG_KEY`, but the prod functions container currently has `CLAUDE_API_KEY`/`POSTHOG_API_KEY` instead; `INFERENCE_URL`/`INFERENCE_TOKEN` are absent entirely. Must be fixed at deploy time — and note Coolify env PATCH does not re-render the on-disk `.env` (the same gotcha behind the 14-day email outage).
- ⚠ **Typesense/keyword-facet search deferred.** No Typesense/Qdrant/OpenSearch exists anywhere; `aesthete_search` (FTS+trgm) is the seam it will eventually plug into.
- ⚠ **iOS stub references a deleted service.** `AestheteEngineService.swift` still points at the deleted FastAPI service (harmless stale reference; retire later — iOS otherwise only uses the frozen `process_style_quiz`/`get_recommendations` shims).
- ⚠ **Guardrail-audit soak incomplete.** Drift audits are proven "green two consecutive local runs" and idempotent (DoD gate G4), but the DoD's "two consecutive weeks in prod" is a post-deploy soak that has not yet run (app tier isn't deployed).
- ⚠ **No closed learning loop on `match_events` yet.** The table accumulates the learning/observability substrate, but nothing currently consumes it for online ranking adjustment beyond the nightly per-designer refit.

## 8. Forward Roadmap / Open Requirements

| Item | Priority |
|---|---|
| Deploy the app tier: build + stand up the inference worker on Coolify (`INFERENCE_TOKEN`, internal network alias), rebuild the edge-runtime image with the 5 AE fns + `proposal-nudge`, fix the `ANTHROPIC_API_KEY`/`POSTHOG_KEY`/`INFERENCE_*` env names on the functions container, and redeploy the client `/quiz` portal — per `aesthete-engine-runbook.md`. | P0 |
| Provision `ANTHROPIC_API_KEY` under the correct var name so `aesthete-dna-draft` stops parking and DNA draft-fill goes live. | P0 |
| Run the designer validation sprint + curate the House Hundred so house θ becomes a real consensus and the dial reads a curated house taste (unblocks the ≥500-validated-products DoD). | P1 |
| Embed real quiz imagery (room 2×2s, texture macros) into `quiz_option_loadings.image_embedding` so client `style_vector`s leave the text-render fallback. | P1 |
| Wire why-phrase variety into served output (the staged 00251 `_ae_pick_why_phrase` — a 3-line swap in a reviewed `get_aesthete_matches` revision). | P1 |
| Rewire or retire the legacy `emergence-recommend` edge fn onto `get_aesthete_matches` so all recommendation surfaces share one aesthetic space. | P2 |
| Phase-2 learned style projection (ridge spectrum regressions, CAV slider-nudge, 768→64 style projection) once ≥1,000 validated spectrum rows exist; add `product_relationships` (F8). | P2 |
| Complete the two-consecutive-weeks-in-prod guardrail-audit soak and stand up an ask-embed Redis cache seam to replace the UNLOGGED table. | P2 |

## 9. Status & Deploy

**Build status:** Build-complete on `main` (Waves 0–5 all merged; program held at main by Kody 2026-07-02, then the database tier was deployed).

**Prod database tier:** DEPLOYED 2026-07-02 (recent commit `cb15fb37`): migrations 00230–00254 applied to prod (prod tip was 00229 → now 00254, 252 applied total), which shipped Aesthete Engine 00239–00251 plus 12 non-AE riders (proposal-watch 00230/00231, iOS field-capture 00232–00235, The Document 00236–00238/00252/00253/00254). Applied via `sudo docker exec … psql -U supabase_admin` (the pooler tunnel fails with 42501 because upstream runs as non-owner `postgres` — a DB-rebuild artifact; future prod migrations must run as `supabase_admin` via docker-exec).

**Verified live on prod:** anon `submit_style_quiz` → real six-spectrum profile; `get_aesthete_matches`, `aesthete_vector vector(768)`, and the HNSW ANN index all present. The pure-SQL quiz→matches money path is live (matches return empty until the catalog carries embeddings/spectrums, which needs the worker + teaching). pgvector on prod confirmed at 0.7.0 (HNSW built, not ivfflat).

**App tier NOT deployed:** the inference worker (needs `INFERENCE_TOKEN` + its first-ever image build), the 5 AE edge functions + `proposal-nudge` (need edge-runtime rebuild + functions-container recreate), and the client `/quiz` redeploy are all outstanding. AE crons currently fire on schedule and 404 harmlessly against the undeployed functions.

**Local stack:** full gate green through G4 + 00251 (12 SQL suites, 6 edge-function suites, worker pytest, 26/26 TS, walk anon-quiz→top-10 in ~86 ms).

## 10. Superseded Sources

This consolidated PRD replaces the following documents as the system of record for the Aesthete Engine:

- `docs/prds/AE/aesthete-engine-product-brief.md`
- `docs/prds/AE/aesthete-engine-system-design.md`
- `docs/prds/AE/aesthete-engine-delivery-plan.md`
- `docs/prds/AE/aesthete-engine-salvage.md`
- `docs/specs/Redesign/patina-aesthete-engine-design.html`

The following related documents remain live and are **not** superseded by this PRD — they cover deploy/runbook and package-level operational detail this consolidated PRD does not replace:

- `docs/prds/AE/aesthete-engine-runbook.md`
- `docs/prds/AE/aesthete-engine-prod-readiness.md`
- `docs/prds/AE/aesthete-engine-delivery-log.md`
- `services/aesthete-inference/README.md`
- `packages/aesthete-quiz/WIRE-CONTRACT.md`
