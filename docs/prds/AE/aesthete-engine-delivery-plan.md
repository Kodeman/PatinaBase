# Aesthete Engine — Agent-Team Delivery Program (operating doc)

**Status:** ACTIVE · kicked off 2026-07-01
**Build contract:** `docs/prds/AE/aesthete-engine-system-design.md` (v1.0, on main `3d53d831`) — agents build to its sections and do not re-litigate architecture; deviations return as flagged questions and, when accepted, get folded into the design doc.
**Scope (confirmed):** full program — everything in design §15 including Phase-2 taste learning, house consensus, ⌘K upgrade, client↔designer surfaces, guardrail audits, eval harness. Prod deploy included, **human-gated**.
**Program shape:** borrowed from `docs/code-review/patina-ios-parallel-delivery-plan.md` — file territories + a serialized spine + worktree→main fast-merge + a committed gate script + wave barriers. Here the spine is `supabase/migrations/`.
**Live log:** `docs/prds/AE/aesthete-engine-delivery-log.md` (barrier entries, decisions, deviations, flags for Kody).

---

## Operating model

- **Conductor** = the orchestrating session: spawns agents, pre-commits shared scaffolding, merges at barriers, runs gates on main, commits/pushes, keeps the delivery log.
- **Agents** work in isolated git worktrees on branches `aesthete/w{N}-{territory}`. No agent commits to main. Conductor fast-merges at wave barriers in fixed order: **migrations → services → edge fns → packages → apps**.
- **Agent briefs** contain: (a) the design-doc §§ for the territory, (b) the exact file territory + contention rules below, (c) DoD + the gate tier(s) that must pass in the worktree before handoff.
- **Local-DB coordination:** only ONE agent per wave may run `supabase db reset` freely (the migration owner). Everyone else develops against the post-reset state or uses transactions; the conductor runs the full gate at the barrier.

### Contention rules (load-bearing)

1. `supabase/migrations/` — **the spine.** Migration files parallelize ONLY when numbers are pre-assigned, files are disjoint, and neither references the other's objects; otherwise serial. (Wave 1: 00239 ∥ 00240 is safe; 00241 waits for both.)
2. `packages/supabase/src/hooks/index.ts` (append-only barrel, ~76 hooks; vitest in `__tests__/`) — all new hooks for a wave batched into ONE agent; conductor resolves the export list on merge.
3. **Domain types:** extend the existing `packages/types/src/aesthete.ts` / `style-profile.ts` / `teaching.ts`. Never create parallel type homes; `@patina/shared` is not for domain types.
4. `supabase/functions/_shared/` — extended only by the FIRST edge agent of a wave; later edge agents rebase. Edge-fn test convention: pure `lib.ts` + `deno test <fn>/index.test.ts` (std@0.168.0 asserts).
5. **Conductor single-touch files** (agents list required entries in their handoff, never edit): `pnpm-workspace.yaml`, `turbo.json`, root `package.json`, `supabase/config.toml` (`[functions.*]`; `[db.seed] sql_paths` — a new seed file MUST be appended to the ordered array or it silently never runs), `scripts/deploy-edge-functions.sh` (JWT_PROTECTED / NO_JWT arrays; all five new fns are JWT-protected/service-role — default `verify_jwt=true`, no config.toml entry needed).
6. `CLAUDE.md` / stale-doc fixes — Wave 0C only.
7. Wave-3 portal territories are directory-disjoint with ONE file-level exception inside `components/document/rooms/library/`: **3B owns `deep-analysis-sheet.tsx` + `library-foot.tsx`; 3C owns `librarian-bar.tsx`.** Any other file shared across territories = mis-partition → conductor re-partitions; nobody hand-merges.
8. New crons follow the proven local-safe idiom: guarded unschedule → `cron.schedule` with a **string** body calling `public.invoke_edge_function(...)` (GUC-guarded, warns + no-ops locally — see 00081/00092/00189).

### The gate — `scripts/aesthete-gate.sh` (built in Wave 0A; template: `scripts/decision-gate.sh`)

| Tier | Runs |
|---|---|
| `db` | `supabase db reset` + every `supabase/tests/aesthete/*.sql` via `docker exec -i supabase_db_supabase psql -U postgres -d postgres -v ON_ERROR_STOP=1 < file` (suite convention: single transaction, plpgsql `ASSERT`, final `ROLLBACK`, `-- How to run:` header) |
| `edge` | `deno test` over `supabase/functions/aesthete-*/` |
| `worker` | `pytest` in `services/aesthete-inference` + golden-cosine regression |
| `ts` | `pnpm turbo type-check` + affected builds |
| `walk` | seeded curl-level e2e: anon quiz → `get_aesthete_matches` assertions + latency budget (§12.3) |
| `all` | everything above |

Tiers skip-with-notice when their target doesn't exist yet (so the gate is green from Wave 0 onward). Agents run their tier(s) pre-handoff; the conductor re-runs on main at every barrier.

### Barrier ritual

merge (fixed order) → full gate on main → conventional commit `feat(aesthete): wave N — …` → push → append the delivery log (decisions, deviations, flags) → update auto-memory.

---

## Wave plan (17 territories, 6 waves, 3–4 concurrent agents)

### Wave 0 — Gate + foundation spine

| Agent | Territory | Builds (design §§) | DoD |
|---|---|---|---|
| **0A** | `scripts/` | `aesthete-gate.sh` (6 tiers, skip-with-notice) + `scripts/aesthete-eval/` skeleton + `scripts/aesthete-demo-seed.sql` skeleton | gate green on current tree (non-db tiers; db tier verified by conductor) |
| **0B** | `supabase/migrations/` + `supabase/tests/aesthete/` | **00236** space re-type→768 + vec helpers + HNSW-else-ivfflat + 00157 views recreated verbatim (§5.1); **00237** product_dna + drafts + vocab + spectrum columns + RLS (§5.2); **00238** aesthete_jobs + triggers + claim RPCs + crons (§5.5) + SQL suites | `db` tier green; view-contract check |
| **0C** | deletions + docs | write `docs/prds/AE/aesthete-engine-salvage.md` (weights, MMR, rule predicates, score_breakdown shape — verbatim from the old service) → `git rm services/aesthete-engine`; delete `use-embeddings.ts` + call sites + barrel exports; `/api/search/similar` → `find_similar_products` stub; fix stale CLAUDE.md ×2 + supabase/CLAUDE.md (§16) | greps prove zero references; `ts` green |

**Barrier G0:** merge 0B → 0C → 0A · full gate · commit+push.

### Wave 1 — Taste + quiz spine ∥ inference worker

| Agent | Territory | Builds | DoD |
|---|---|---|---|
| **1A** | migration **00239** | §5.4 taste tables + RLS + export/retire + house curation RPCs + `style_centroids` + house-v0 seed slot | `db` green; RLS suite (own/lead/anon denials) |
| **1B** | migration **00240** | `client_style_profiles`, `submit_style_quiz` + `_compute_quiz_profile()`, `claim_quiz_session`, `quiz_option_loadings` seed (§7.2), rate limits, janitor, quiz_sessions RLS fix (§5.3, §7) | anon curl → full profile JSON |
| **1C** | `services/aesthete-inference/` (new) | §12.1 complete: ONNX export build, FastAPI /embed/text /embed/image /healthz, task-prefix client, int8, 429 backpressure, pytest + golden-cosine, Dockerfile. No package.json (Python services are pnpm/turbo-invisible by design; Docker is the build path) | `worker` green; container builds; p50 recorded |

**Barrier G1:** conductor workspace single-touch · quiz curl demo · db reset through 00240.

### Wave 2 — The match + pipelines (**the demo wave**)

| Agent | Territory | Builds | DoD |
|---|---|---|---|
| **2A** *(xhigh)* | migrations **00241–00243** | `get_aesthete_matches` (§10 complete: filters, ANN, 10-term scoring, θ_blend dial, MMR, exploration slots, why payload, match_events), `aesthete_search` seam, weights + why_phrases seeds, `get_recommendations` shim, 00242 matview, 00243 quiz bridge; **deterministic ranking SQL suite** | `db` green; iOS contract test green |
| **2B** | `_shared/aesthete*` + `aesthete-embed-worker/` | shared edge helper (claim/complete, worker client, backoff) + embed drain fn + deno tests; live local embed of seed catalog through 1C's worker | seed products carry vectors; `edge` green |
| **2C** | `aesthete-dna-draft/` | §6.2–6.3: Claude structured-output draft-fill (Haiku→Sonnet escalation), spend ledger, triage; deno tests on golden fixtures (mocked API); real smoke behind env flag | drafts land on seed data |
| **2D** | `packages/aesthete-quiz/` (new) | §3.2#16: /core (questions, types, plain-fetch PostgREST wire client) + /react + tests + `WIRE-CONTRACT.md` | package tests green; contract = §7.1 verbatim |

**Barrier G2 — THE DEMO GATE:** seed → embed → draft → synthetic-validated batch → anon quiz → **top-10 with whys** · latency budgets (§12.3) · `walk` tier codified · §14.7 bar via eval skeleton.

### Wave 3 — Surfaces (disjoint portal territories)

| Agent | Territory | Builds | DoD |
|---|---|---|---|
| **3A** | `apps/client-portal/` | pre-auth `/quiz` + results with whys (2D package + `@patina/design-system`); **allowlist `/quiz` in `src/middleware.ts` `isPublicPage`**; claim-on-signup (§7.1) | Chrome walk: anon quiz → results |
| **3B** | designer-portal `teaching/`, `components/document/people/`, library sheets (`deep-analysis-sheet.tsx`, `library-foot.tsx`) + the wave's hooks batch in `packages/supabase` | teaching prefill from drafts (§5.2); judgments UI + submit RPCs + probe injection; "Your Eye" v1 (§8.5 display) | teaching walk; judgments append; de-gamified copy |
| **3C** | `aesthete-ask` edge fn + `components/document/engine/`, `command-palette.tsx`, `librarian-bar.tsx` | ⌘K/librarian vector upgrade, 1.5 s FTS fallback, "the Engine is resting"; never persists ask text (R31/R38) | ⌘K walk; grep proves no ask-text persistence |
| **3D** | `scripts/aesthete-demo-seed.sql` + `scripts/aesthete-eval/` + PostHog | full demo seed (products, drafts, validated subset, judgments, portfolio); eval harness (G1/G2 scaffolding, 4 personas, §14.7 assertions); PostHog funnel + server events (§12.4) | harness runs; events visible |

**Barrier G3:** live Chrome walks both portals · copy-law grep ("AI" in user-facing strings = fail) · latency re-check.

### Wave 4 — Learning + ops

| Agent | Territory | Builds | DoD |
|---|---|---|---|
| **4A** *(xhigh)* | worker `/fit/taste` + `aesthete-nightly/` | BT MAP refit (§8.2; **refinement: refit math = stateless `/fit/taste` on the Python worker, nightly edge fn orchestrates**), online preview RPC, snapshots, ρ + confidence map + stats writers (§8.3–8.4), backtest emission | nightly dry-run on synthetic judgments → θ + snapshots + backtest; stats populated |
| **4B** | house + portfolio + biases | house draft/activate + curation ops; portfolio ingestion (bucket → embed → geometric median); bias derivation + naming (§8.5, §9.1); `match_designers_for_client` | house v1 computed; biases proposed w/ evidence |
| **4C** | audits + resilience | `aesthete-drift-audit` (§13 checks → aesthete_audit + PostHog); inference-down drill; 20 rps load sanity; Redis ask-cache | audits write rows; drill passes; p95 recorded |

**Barrier G4:** nightly + audits green two consecutive local runs.

### Wave 5 — Hardening + prod (human-gated)

| Agent | Territory | Builds | DoD |
|---|---|---|---|
| **5A** | cleanup + docs | §15.3 DoD sweep; hardcoded style lists → DB taxonomy; `aesthete-engine-runbook.md` (deploy order, env vars, Coolify worker def, rollback); marketing-repo packet | DoD checklist green |
| **5B** | prod prep | prod pgvector extversion check (design risk #1); Coolify def for the worker; edge-fn deploy list; migration plan 00236–00243 (**migrations before apps**) | prod-readiness report |

**HUMAN GATE (Kody): go/no-go** → conductor deploys migrations → edge fns → worker → portals → prod smoke walk → ledger entry.

---

## Human-in-the-loop dependencies (program proceeds with placeholders; flagged in the log)

| Item | Owner | Placeholder until then |
|---|---|---|
| `ANTHROPIC_API_KEY` for dna-draft | Kody | mocked-API tests; real smoke deferred |
| Quiz imagery (room 2×2s, texture macros) | Kody/content | placeholder images; loadings independent; embeddings recomputed on real content |
| House Hundred curation + 1-hr calibration | Lead | validated-catalog centroid + hand-set spectrums (design risk #12 fallback) |
| Real designer validation + judgments | designers | clearly-flagged synthetic demo seed; learning bars proven on synthetic |
| Prod deploy go | Kody | Wave-5 human gate |

## Mechanics

17 territories / 6 waves / 3–4 concurrent worktree agents ≈ one working session per wave, ~5–7 sessions wall-clock. Agents 2A and 4A run at highest effort (deepest artifacts: the match RPC, the taste refit). The conductor reviews every diff before merge.
