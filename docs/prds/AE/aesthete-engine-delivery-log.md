# Aesthete Engine — Delivery Log

Program: `aesthete-engine-delivery-plan.md` · Contract: `aesthete-engine-system-design.md` (v1.0)
One entry per wave barrier: what merged, gate results, decisions/deviations, flags for Kody.

---

## 2026-07-02 — Barrier G3 (Wave 3 complete): the surfaces

**Merged** (3A → 3C → 3D → 3B): client-portal **/quiz + results** (package-driven, playwright-specced, claim path proven; middleware allowlist) · **aesthete-ask** + ⌘K/librarian vector upgrade (RRF blend, 1.5 s → FTS degrade, no-ask-text proven in DB; migration **00247** invoker kNN — taken unreserved, no collision) · **demo seed + eval harness** (34/34 mechanical bars, idempotent seed ×3, dead seed URL fixed, PostHog client+server events w/ fallbacks) · **teaching prefill + judgments + Your Eye v1** (probe loop proven live; prefill marker retires on canonical save; corrections chips; de-gamified — removed a legacy daily-goal meter; hooks batch + barrel resolved with 3C's append).

**Barrier verification:** db 8/8 suites on bare reset · edge 3 suites · worker · ts 24/24 · walk 83 ms · eval personas green · copy-law grep clean on all Wave-3 surfaces. Live walks: 3A (client, + committed playwright) and 3B (designer, incl. probe/prefill/Your-Eye loops) walked their surfaces against the live stack; conductor visual pass folded into Wave-5 hardening.

**Decisions/incidents:** ① Gate ordering rule ratified: **db suites certify the bare reset baseline; demo seed applies after** (4 suites still carry absolute-count assertions that break on a seeded DB — seed-robustness sweep assigned to 4C). ② Barrel conflict resolved keeping both 3B+3C blocks. ③ `_shared` edge tests sit outside the gate's glob — fold into edge tier (4C/5A). ④ Why-phrase library is thin on exploit rows ("Sits right where your taste settles" dominates) — phrase-breadth pass owed (5A). ⑤ Local-stack contention bit agents mid-walk twice (concurrent resets) — future waves keep single-DB-owner discipline.

**Rolled forward:** ANTHROPIC_API_KEY still unprovisioned · stale-running jobs janitor (4C) · portfolio embeddings + Your-Eye real data (4A/4B) · `SpectrumValues` type home inconsistency (@patina/shared vs types — 5A tidy) · optional nav entries for judgments/your-eye (Kody call).

## 2026-07-02 — Barrier G2: THE DEMO GATE (Wave 2 complete) ★

**FULL GATE GREEN — all five tiers PASS.** `walk`: anon quiz → six-spectrum profile → **top-10 matches with whys in 86 ms** (budget 2000 ms). Match RPC p95 12 ms over 20 calls. The brief's week-6 milestone is live on the local stack, end to end.

**Merged** (2D → 2B → 2C → 2A): `@patina/aesthete-quiz` + `WIRE-CONTRACT.md` (46 tests; live smoke; marketing-repo handover ready) · `_shared/aesthete.ts` + `aesthete-embed-worker` (43 deno tests; **live-drained the seed catalog through the real ONNX worker — 12/12 products carry embedding + fused aesthete_vector + style_caption**; backoff/trigger-resurrect proven live) · `aesthete-dna-draft` (22 tests; spend governor + park-on-no-key verified live; drafts structurally cannot touch canonical spectrums) · **00244–00246**: `get_aesthete_matches` (full §10 pipeline: canonical-else-draft spectrums, θ-blend dial w/ NULL degradation, budget log-bell, MMR, deterministic 8+2 exploration, 26 copy-law-verified why phrases, match_events by-shape no-ask-text), `aesthete_search` seam, behavior-stats matview, **both iOS contracts byte-compatible** (signatures string-asserted vs 00067) + deterministic ranking suite. Demo seed registered in config.toml (conductor single-touch) + both edge fns in the deploy script.

**Decisions:** 2A's property-fix to 0B's RLS assertion approved · 2C keeps its own port seams instead of _shared (same RPC contract; consolidation optional later) · `supabase/functions/deno.json` (2B) is the edge-tier config — gate patched.

**Fold into design doc (v1.0.3, owed):** T_taste weight×w_eff reading + both-NULL drop-and-renormalize; T_behavioral affine calibration (/0.2); exploration-pool fallback below rank 20; φ archetype ordering contract = `styles.display_order NULLS LAST, name` (**4A refit MUST match**); shim strictness on unknown option keys.

**Rolled-forward to-dos:** stale-`running` jobs janitor (→ 4C) · `material_compatibility` vocab is a guess + table empty (→ 3D seed or 4B) · dead seed image URL products.sql:12 (→ 3D) · 2B's local-networking notes (host LAN IP not host.docker.internal; worker on :8321; HS256 JWT for functions-serve curl; ONE `functions serve` at a time) (→ 3C/3D briefs) · turbo type-check ^build ordering (→ 5A) · ANTHROPIC_API_KEY still unprovisioned (2C parks gracefully).

## 2026-07-02 — Barrier G1 (Wave 1 complete) + Wave 2 rolling start

**Merged** (1A → 1B → 1D → 1C): **00242** taste foundation (all §5.4 tables, RLS, judgment/correction/export/retire/house RPCs, `taste_probe_queue` 4% GUC-tunable probes, provisional ACTIVE house v0) · **00243** client quiz (client_style_profiles, 22-row loadings seed, `submit_style_quiz`/`claim_quiz_session`, quiz_sessions RLS fix, 00242's deferred FKs, janitor cron) — **anon wire proof green over Kong** (quiz → full six-spectrum profile) · **1D repo-health**: whole-repo type-check baseline **fully burned down, 24/24 green** (email @types/react→19, shared vitest, api-routes fixes incl. a provably-broken zero-caller compose chain, design-system/extension/client-portal) — baseline file now a green marker · **1C** `services/aesthete-inference` (ONNX int8 nomic pair, 22 tests incl. 4 golden vs committed vectors, p50 8.7 ms text / 66 ms image, 429 backpressure, worker gate tier PASS).

**Incidents & decisions:**
1. **Gitignore swallowed an agent file** — client-portal ignores `src/**/*.d.ts`; 1D's hand-written fiber shim never got committed. Conductor recovered it from the worktree + allowlisted `src/types/*.d.ts`. New agent-brief rule: verify `git status --ignored` on your territory before handoff.
2. **Docker build environment-blocked** — Docker Desktop VM egress wedged (Hub AND ECR probes hang; host network fine; `FROM python:3.12-slim` DeadlineExceeded). Worker image build **deferred to Wave 5B** (Coolify host builds with its own network). Evidence in the worker README. NOTE: restarting Docker Desktop would fix it but kills the local Supabase mid-program — only do it between waves if needed.
3. One transient design-system type-check flake observed post-merge (passed on direct + full re-run) — likely the committed compiled test artifacts 1D flagged; **cleanup owed** (delete `*.test.jsx`/`*.jsx.map`/`*.d.ts.map` from design-system src/, Wave 5A).
4. Deviations folded into design doc as **v1.0.2** (additive §7.1 response keys, client_profiles.user_id, probe queue, retired_at, catalyst vocab, NULL-tolerant client vectors).
5. **Wave 2 rolled early**: 2A (match RPC) + 2D (quiz package) launched before 1C landed — no dependency on the worker. 2B/2C follow G1.

**Flags for Kody (rolled forward):** ANTHROPIC_API_KEY needed for 2C's real-API smoke · @supabase/ssr version bump owed (1D shipped a documented type-cast workaround in packages/supabase/src/server.ts) · 1D fixed a silently-broken designer-lead query (client-portal) — leads now carry real locations; revert one hunk of `0cccbe5b` if unwanted · interactions.product_id NOT NULL vs room-level events — schema relaxation owed (flagged by 1D, fold into a future aesthete migration).

## 2026-07-01 — Barrier G0 (Wave 0 complete)

**Merged** (order 0B → 0C → 0A): foundation migrations **00239–00241** + 3 SQL suites (`supabase/tests/aesthete/`) · legacy `services/aesthete-engine` deleted (salvage in `aesthete-engine-salvage.md`) + dead `use-embeddings` hooks removed (zero call sites existed) + `/api/search/similar` re-pointed at `find_products_similar_to` with category fallback + stale CLAUDE.md fixes · `scripts/aesthete-gate.sh` (6 tiers) + eval/demo skeletons.

**Incidents & decisions:**
1. **Concurrent-program collision.** The Document tracks 7–8 landed on main mid-wave, consuming migration numbers 00236–00238 → aesthete spine renumbered to 00239–00241 at merge; **00242–00246 reserved on main as no-op placeholders** (replaced in place by owning waves; must be real before any prod deploy). New rule: conductors re-fetch + re-check numbering at every fork/barrier. Kody paused The Document session for this barrier.
2. **Pre-existing red type-check baseline.** Whole-repo `turbo type-check` fails 7 tasks on main (email React-18-types-under-19 cascading into both portals; shared missing vitest devDep; api-routes/design-system/extension own-src errors). Gate `ts` tier converted to **baseline-delta** (`scripts/aesthete-ts-baseline.txt`); burn-down is outside AE scope. All Wave-0 territories verified zero NEW errors.
3. **Design doc → v1.0.1** (contract kept truthful): §5.1 helper bodies corrected (real-cast lerp, `vector_norm`), jobs dedupe = resurrect-on-conflict, §15.4 renumbered.

**Verified at barrier:** `supabase db reset` green through 00246 (reservations no-op) · all 3 aesthete SQL suites pass · view contract byte-identical (0157 vs 00239 recreation) · HNSW landed locally (pgvector 0.8.0) · 36 jobs auto-enqueued for 12 seed products via trigger · gate `all` = PASS/SKIP only.

**Deferred flags:** iOS `AestheteEngineService.swift` stub references the deleted FastAPI service (retire in a later wave; harmless) · client-portal feed route stale comment (Wave 3A) · root CLAUDE.md stale counts ("52 migrations"/"35 hooks") left as-is (out of scope) · 0A personas use placeholder `catalyst` vocab until 00243's loadings land.

## 2026-07-01 — Program kickoff

- Operating doc committed; Wave 0 launched (0A gate script · 0B migrations 00236–00238 · 0C deletion sweep).
- **Open flags for Kody:** ① `ANTHROPIC_API_KEY` needed before Wave 2C real-API smoke (mocked until then). ② Quiz imagery + House Hundred curation can land any time; placeholders in use. ③ Prod pgvector version still unverified (checked in Wave 5B; design tolerates either index path).
