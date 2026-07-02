# Aesthete Engine — Delivery Log

Program: `aesthete-engine-delivery-plan.md` · Contract: `aesthete-engine-system-design.md` (v1.0)
One entry per wave barrier: what merged, gate results, decisions/deviations, flags for Kody.

---

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
