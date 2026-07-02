# Aesthete Engine — Delivery Log

Program: `aesthete-engine-delivery-plan.md` · Contract: `aesthete-engine-system-design.md` (v1.0)
One entry per wave barrier: what merged, gate results, decisions/deviations, flags for Kody.

---

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
