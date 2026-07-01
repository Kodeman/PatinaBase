# The Aesthete Engine™ — System Design

*The complete engineering design for Patina's taste engine: one shared aesthetic space for products, clients, and designers, built Supabase-first on the infrastructure Patina actually runs.*

---

**Status:** v1.0 — designed for review
**Owner:** Kody / Patina Engineering
**Last updated:** 2026-07-01
**Designs to:** `aesthete-engine-product-brief.md` (2026-07-01) + `aesthete-engine-deck.html`
**Supersedes:** `docs/specs/Redesign/patina-aesthete-engine-design.html` (March 2026 UX design) and the deferred `services/aesthete-engine` Python service (Dec 2025) — see §16 Reconciliation
**Companion:** `aesthete-engine-system-design-deck.html` (presentation form)

---

## 1. Executive summary

The brief asks for three profiles in one shared aesthetic space, a designer taste vector with a house-blend dial, vision-drafted Product DNA confirmed by designers, and a week-6 demo of *quiz → top 10 with an honest "why."* This document specifies exactly how that gets built on Patina's real stack: **the engine is the database.**

The five decisions that shape everything else:

1. **One 768-dimension shared space** using the `nomic-embed-text-v1.5` + `nomic-embed-vision-v1.5` aligned pair (Apache-2.0, CPU-viable). Text and images land in the *same* space, which is what lets a quiz answer, a product photo, a designer's portfolio, and a librarian ask all be compared with one cosine. It also keeps every existing `vector(768)` column and all five 00008 similarity RPCs intact.
2. **The client-facing hot path is pure SQL.** Quiz → top-10 makes *zero* inference calls: quiz imagery is pre-embedded offline, the client vector is assembled in-database from anchors, and matching is one `SECURITY DEFINER` RPC. The inference worker being down is a non-event for the demo path.
3. **Taste is learned over an interpretable basis, not raw embeddings.** A designer produces hundreds of judgments, not millions — so the taste model is a Bradley–Terry preference weighting over ~94 interpretable features (spectrums, archetypes, materials, patina, plus a 64-d compressed embedding block). This is what makes "Your Eye" *readable*, the dial *meaningful*, and deviation-from-house *free* (it's literally `θ_D − θ_H`).
4. **Interpretable scores and embeddings never fight.** Embeddings are immutable model outputs; designer edits flow through a deterministic style-caption re-embed, and the six spectrums are their own scoring channel — a slider nudge changes matches immediately, no vector surgery.
5. **One new runtime piece.** A slim, stateless ONNX inference worker (`services/aesthete-inference`) for embeddings at *ingestion* time. Everything else is Postgres (pgvector + RPCs), Deno edge functions on the existing pg_cron bridge, and one shared quiz package. The old Python service is deleted; the Typesense of the brief is deferred behind a search seam (locked decision).

What ships in the MVP maps 1:1 to the brief's ⭐ list, and weeks 0–6 are specified to the week in §15. The compounding asset — every designer action does double duty — is implemented as five concrete learning loops over tables that already exist (`interactions`, `teaching_*`) plus four new append-only stores (`taste_judgments`, `taste_corrections`, `designer_portfolio_items`, `match_events`).

**How to read this document.** §2–3 establish constraints and topology. §4 defines the aesthetic space (the math everything shares). §5 is the data model. §6–10 walk the four subsystems (ingestion, client profile, designer taste, matching). §11–14 cover loops, ops, guardrails, and evaluation. §15 is the rollout; §16 reconciles every existing artifact; §17 risks; §18 is the API reference.

---

## 2. Design tenets & constraints

### 2.1 Product law (non-negotiable, supersedes the brief where they conflict)

These were ratified in The Document program (shipped June 2026) and bind every designer-facing surface this engine feeds:

| Law | Ruling | Engine consequence |
|---|---|---|
| **Engine as presence, not place** | R31/R38 | No standalone engine page/chat/history. The engine answers through ⌘K and the Library Room librarian bar. Ask text is **never persisted** — `aesthete-ask` logs latency and result-count only. |
| **De-gamified** | R32/R37 | `designer_teaching_stats.badges` stays populated but unsurfaced. No streaks, goals, or scores on designer surfaces. Teaching impact surfaces as **earnings** (the 25% Pledge, `pledge.ts`) — untouched by this design. |
| **"Designer-Taught Intelligence," never "AI"** | copy law | Enforced *server-side*: all match reasons render from the `why_phrases` table, one string source for web + iOS. Draft-fill surfaces say "the Engine's first read," never a model name. |
| **Style DNA is derived, no parallel store** | R58 | Client margin notes / contraindications become columns on `designer_clients`, not a new profile table. The client style *vector* is new state (nothing derivable exists), but display-layer DNA stays derivation. |

### 2.2 Infrastructure reality (verified 2026-07-01)

- **Single Coolify host, no GPU.** Self-hosted Supabase (Postgres 15, Kong, GoTrue, PostgREST, Deno edge-runtime), Redis 7 (256 MB cap), MinIO; prod media on Cloudflare R2. Postgres tuning: `shared_buffers=512MB`, `work_mem=32MB`, `max_connections=100`.
- **pgvector installed** (local dev 0.8.0; **prod version unverified** — week-0 checklist item; the design requires ≥ 0.5.0 for `sum(vector)` and vector↔array casts, and works with either HNSW or ivfflat).
- **No Typesense, Qdrant, or OpenSearch exists anywhere.** The brief's "keyword/facet on Typesense" is aspirational; locked decision: Postgres FTS (`search_vector` tsvector + pg_trgm, already live) for MVP, behind a single `aesthete_search()` seam Typesense can replace in Phase 2 without touching callers.
- **Sanctioned backend pattern:** no new NestJS services; Deno edge functions (33 exist) + pg_cron → `invoke_edge_function()` (00081) for scheduling. One narrow exception granted: the stateless Python inference worker, because ONNX vision inference is not a thing the edge runtime can do.
- **Scale honesty:** products 10³–10⁴, clients 10³, designers 10¹, judgments 10³–10⁴. 768-d vectors ≈ 3 KB; the whole vector working set fits in `shared_buffers`. Design for these numbers, keep seams for 10× growth.

### 2.3 What already exists (build on, don't duplicate)

The codebase is further along than the brief assumes:

- **The six spectrums are already a shipped table** — `product_style_spectrum` (00005) with exactly `warmth, complexity, formality, timelessness, boldness, craftsmanship` REAL CHECK −1..1, plus `spectrum_calibration_products` anchors. Unpopulated, but the teaching UI's 6-slider deep-analysis editor already writes it.
- **The teaching system is live**: `teaching_queue` (auto-seeded by trigger on product insert), `teaching_sessions` (modes embedded/quick_tags/deep_analysis/validation), `teaching_validations` (confirm/adjust/flag), `product_styles` (`source` manual|ml_predicted|validated), `designer_teaching_stats`, and the portal routes `/portal/teaching/{,quick,deep,validate,product/[id]}`.
- **A quiz → recommendations path already serves iOS** (00067): `process_style_quiz` (authenticated) + `get_recommendations` (anon-granted). Signatures are **frozen contracts**; internals become shims over the new engine.
- **A behavioral stream already flows**: `interactions` (view/save/skip/ar_place/dwell/share) → `engagement_events` trigger.
- **Three-layer catalog law** (00152): `products.layer` personal|studio|catalog with RLS; engine read-contract views `v_aesthete_*_input` (00157) — preserved verbatim.
- **Anon-write wire contract precedent**: the waitlist pattern (RLS `auth.uid() IS NULL`, anon can cause rows, never read tables) — the marketing site already uses it.

---

## 3. System overview

### 3.1 Topology

```
                        ┌─────────────────────────────────────────────────────┐
                        │              Supabase Postgres (the engine)          │
  marketing site ──anon─▶ submit_style_quiz ─┐                                │
  client-portal ──authed▶ claim_quiz_session │  client_style_profiles         │
  iOS ────────────authed▶ process_style_quiz*│  quiz_sessions                 │
                        │                    ▼                                │
  quiz results ───anon──▶ get_aesthete_matches ◀── match_weight_profiles      │
  iOS ────────anon/auth─▶ get_recommendations*    why_phrases · house_taste   │
                        │        │                designer_taste_profiles     │
  designer ⌘K ──JWT─────▶ (via aesthete-ask)      product_dna · spectrums     │
  teaching UI ──authed──▶ submit_taste_judgment   taste_judgments             │
                        │                         aesthete_jobs (outbox)      │
                        │  pg_cron ── invoke_edge_function ──▶ edge fns       │
                        └───────┬─────────────────────┬───────────────────────┘
                                │ service-role        │ service-role
                    ┌───────────▼──────────┐ ┌────────▼─────────┐
                    │ aesthete-embed-worker│ │ aesthete-dna-draft│──▶ Claude API
                    │ aesthete-nightly     │ │ (Haiku 4.5 bulk, │    (draft-fill)
                    │ aesthete-drift-audit │ │  Sonnet escalate) │
                    └───────────┬──────────┘ └──────────────────┘
                                │ bearer INFERENCE_TOKEN
                    ┌───────────▼──────────────────┐
                    │ services/aesthete-inference   │  stateless FastAPI + ONNX int8
                    │ POST /embed/text /embed/image │  nomic text+vision v1.5 @768
                    └───────────────────────────────┘
        * frozen signature, body shimmed onto the new engine
```

### 3.2 Runtime inventory

| # | Piece | Kind | Responsibility |
|---|---|---|---|
| 1 | `submit_style_quiz` | SQL RPC (anon+auth) | Validate 5 answers, compute profile via `_compute_quiz_profile()`, derive client vector in-DB, write `quiz_sessions` + `client_style_profiles`, return profile |
| 2 | `claim_quiz_session` | SQL RPC (auth) | Bind an anon session to `auth.uid()` on signup; bridge `user_style_signals` for iOS |
| 3 | `get_aesthete_matches` | SQL RPC (anon+auth) | The match: filters → ANN candidates → 10-term scoring warped by the dial → exploration slots → per-term "why"; logs `match_events` |
| 4 | `aesthete_search` | SQL fn | Keyword/facet entry point (FTS + trgm today) — **the Typesense seam** |
| 5 | `process_style_quiz` / `get_recommendations` | SQL RPCs | **Frozen iOS contracts**; bodies delegate to shared internals / #3 |
| 6 | `submit_taste_judgment` / `submit_taste_correction` | SQL RPCs (auth) | Append pairwise judgments / directional corrections |
| 7 | `claim_aesthete_jobs` / `complete_aesthete_job` | SQL RPCs (service-role) | `FOR UPDATE SKIP LOCKED` queue claim/complete |
| 8 | `export_designer_taste` / `retire_designer_taste` | SQL RPCs (owner/admin) | Taste portability + departure guardrail (ships week 0) |
| 9 | `compute_house_taste_draft` / `activate_house_taste` | SQL RPCs (lead) | House versioning + curation ops |
| 10 | `aesthete-embed-worker` | Edge fn (cron 1 min) | Drain embed jobs → inference worker → upsert vectors |
| 11 | `aesthete-dna-draft` | Edge fn (cron 2 min) | Drain draft jobs → Claude structured output → draft rows → teaching queue |
| 12 | `aesthete-nightly` | Edge fn (cron 02:30) | Taste refit → house draft → stats writers → matview refresh |
| 13 | `aesthete-drift-audit` | Edge fn (cron weekly) | Guardrail audits → `aesthete_audit` + PostHog |
| 14 | `aesthete-ask` | Edge fn (caller JWT) | ⌘K / librarian: embed ask text (1.5 s timeout → FTS fallback), call #3/#4. Ask text never persisted |
| 15 | `services/aesthete-inference` | FastAPI worker | `/embed/text`, `/embed/image` (batch ≤ 16), `/healthz`. Stateless, no DB, internal-only |
| 16 | `packages/aesthete-quiz` | Shared package | `/core` (questions, types, plain-fetch PostgREST client — no supabase-js dep) + `/react` components; consumed by client-portal and the external marketing repo |

---

## 4. The aesthetic space

### 4.1 Representation: every entity is one aesthetic point

Products, clients, designers, and the house each carry the same shape:

```
A = ( v,  s,  c,  a,  m,  β )
      │   │   │   │   │   └─ budget posture (clients only — never a taste feature)
      │   │   │   │   └───── material affinities {wood: 0.8, metal: 0.2, …}
      │   │   │   └───────── archetype weights over the 12 seeded styles (00006)
      │   │   └───────────── per-dimension confidence ∈ [0,1]^6
      │   └───────────────── six spectrums ∈ [−1,1]^6  (warmth, complexity, formality,
      │                       timelessness, boldness, craftsmanship — the shipped table)
      └───────────────────── unit dense vector ∈ S^767 (nomic v1.5 space)
```

All cross-entity comparison is either cosine on `v` or confidence-weighted distance on `s`. The 12-archetype taxonomy in the `styles` table is the single enum source for `a` — the same taxonomy fixes the portal's hardcoded style lists (§16).

### 4.2 Embedding model decision

**`nomic-embed-text-v1.5` (137 M) + `nomic-embed-vision-v1.5` (~92 M ViT-B/16), both 768-d, aligned, Apache-2.0.**

Why this pair and not the obvious alternatives:

| Candidate | Verdict | One-line reason |
|---|---|---|
| **nomic v1.5 pair** | ✅ chosen | Only option whose *text* tower is a real document encoder (8192-token context) — quiz profiles, provenance stories, and captions embed properly; aligned with its vision tower; keeps every `vector(768)` column and 00008 RPC; Matryoshka truncation gives free 64/128-d compressed views |
| SigLIP-2 base | ❌ | Better raw image↔text retrieval, but a 64-token alt-text text tower — can't embed documents; would force a second text model + cross-space bridge |
| OpenCLIP ViT-L/14 | ❌ | 1–2.5 s/image on CPU; kills ingest throughput on a shared host |
| jina-clip-v2 | ❌ | CC-BY-NC weights — license fails |
| MobileCLIP / TinyCLIP | ❌ | 512-d (breaks columns), weak text towers |
| Fine-tuning any backbone | ❌ | No GPU, and < 5k labels is projection-head territory, not fine-tune territory (see §4.5) |

**Runtime: one ONNX worker for both halves.** Both models run int8-quantized under onnxruntime in `services/aesthete-inference`. Ollama was considered for the text half (it was the dead `use-embeddings.ts` hooks' intent) and rejected: it cannot serve the vision half, and two inference runtimes for one aligned pair is ops waste. Expected CPU latency (2 cores, int8): **~200–350 ms per image**, **~30–80 ms per short text**. A 5k-product backfill ≈ 1.5–2 h single-worker, run off-peak.

**Task prefixes are load-bearing.** nomic v1.5 requires them: `search_document:` for products/portfolio/captions, `search_query:` for quiz-profile/ask text. Mixed prefixes silently degrade similarity — the prefix lives in one shared embedding client (worker-side), never at call sites.

### 4.3 How each entity's vector is produced

**Products** — fused, image-weighted:

```
v_p = normalize( 0.65 · mean(v_img_1..3)  +  0.35 · v_caption )
```

- Up to 3 primary product images (skip lifestyle/render shots when detectable), each unit-normalized before averaging.
- `v_caption` embeds a **templated style caption** built deterministically from DNA fields — `"{silhouette} {category} in {materials}, {finish} finish, {palette_family}, {mood_keywords}, {ambiance}"` — *not* the raw retailer description (SEO noise and brand names pull vectors into wrong neighborhoods). The caption is stored on the product (`style_caption`) so the fused vector is reproducible.
- `products.aesthete_vector` (re-typed to `vector(768)`) holds the fused style vector — this is what matching uses.
- `products.embedding` (existing 768 column) gets populated too, with the plain text embedding of name+description — this brings the five 00008 similarity RPCs and semantic search alive for free. Same model, same pipeline, one extra enqueue. Two columns, one space, different content.

**Clients** — assembled in SQL from precomputed anchors (the pure-SQL hot path):

```
v_client = normalize( 0.5 · mean(v_chosen_quiz_images)  +  0.5 · Σ_j a_j · centroid_j )
```

Quiz imagery (the 2×2 room photos, texture macros) is embedded **offline when the quiz content ships**; each option row in `quiz_option_loadings` references its precomputed embedding. `centroid_j` = per-archetype centroids of validated products, materialized nightly into `style_centroids`. Result: quiz submission is a lookup + vector arithmetic — no model in the loop. (Fallback when quiz-image embeddings are missing: embed a text rendering of the profile — lossier, kept as degraded mode.)

**Designers** — portfolio-seeded, judgment-refined:

- Seed `v_D0` = **geometric median** of portfolio-image embeddings (median, not mean: one badly lit photo shouldn't drag the centroid).
- Ongoing `v_D` = EMA over judgment winners: `v_D ← normalize(0.97·v_D + 0.03·v_winner)`, initialized from `v_D0`.
- The dense `v_D` is used for ANN query tinting and client↔designer similarity; the *learned taste* lives in θ (§8), not here.

**House** — see §9. MVP: geometric median of a lead-curated exemplar collection.

### 4.4 The category-dominance problem

CLIP-family cosine is dominated by *what an object is*, not *how it reads stylistically* — a walnut MCM credenza sits nearer a chrome-glass credenza than a walnut dining table. Three mitigations, layered:

1. **MVP — category-conditioned matching**: candidate generation and ranking always run inside the requested category/function (hard filter), so within-set cosine differences carry mostly style. Neutralizes ~80% of the problem.
2. **MVP — the fused caption** injects material/mood/finish semantics the image tower under-weights.
3. **Phase 2 — learned style projection**: once ≥ 1,000 designer-validated `product_style_spectrum` rows exist, fit six ridge regressions ŝ_k = d_kᵀv + b_k (embedding → spectrum). Two artifacts fall out: (i) the **d_k are concept-activation directions** — the only legitimate way to implement "slider nudge re-biases the vector" (`v ← normalize(v + η·Δs_k·d̂_k)`, η ≈ 0.15, ‖Δv‖ ≤ 0.2); (ii) stacking [d_1…d_6] + top archetype LDA directions yields a **768→64 style projection** stored as a compact style vector that amplifies style axes and suppresses category axes. Ships only if it improves the category-leak metric (§14) without hurting neighborhood precision.

### 4.5 Sync rules between the two representations

The brief demands scores and vectors "kept in sync." The rules:

- **Embeddings are immutable model outputs.** Nothing ever arithmetically edits a stored embedding (before Phase-2 CAV directions exist, there is no defensible "warmth direction" to nudge along; after, nudges are bounded and reproducible).
- **Designer edits flow through the caption.** A spectrum/DNA edit regenerates the deterministic style caption → enqueues a re-embed → refreshed fused vector. Provenance intact, drift impossible.
- **Spectrums are their own scoring channel** (T_spectrum, §10). A slider edit changes match results *immediately*, before the re-embed lands. The interpretable layer is never hostage to the embedding pipeline.
- **The vision model proposes, the designer disposes**: Claude drafts surface as scores (`ml_predicted`, low confidence); confirmation flips source and raises confidence; the canonical spectrum row is designer-written, always.

---

## 5. Data model

Everything below ships as migrations **00236–00243** (repo is at 00235). DDL here is authoritative for shape; implementation may add comments/grants. RLS in §5.6; migration sequence + backward-compat in §15.4.

### 5.1 The space: vector columns, helpers, indexes (00236)

```sql
-- 1. Prerequisite: pgvector ≥ 0.5.0 (sum(vector) aggregate, vector↔real[] casts)
ALTER EXTENSION vector UPDATE;
DO $$ BEGIN
  IF (SELECT extversion FROM pg_extension WHERE extname='vector') < '0.5.0' THEN
    RAISE EXCEPTION 'aesthete engine requires pgvector >= 0.5.0';
  END IF;
END $$;

-- 2. Re-type the empty 1536 column into the canonical space; preserve the 00157 view contract
DROP VIEW IF EXISTS v_aesthete_personal_input, v_aesthete_studio_input, v_aesthete_catalog_input;
ALTER TABLE products
  ALTER COLUMN aesthete_vector TYPE vector(768) USING NULL;
-- (recreate all three 00157 views verbatim — same names, same columns)

ALTER TABLE products
  ADD COLUMN style_caption text,                    -- deterministic caption the fused vector used
  ADD COLUMN aesthete_vector_at timestamptz,        -- staleness watermark
  ADD COLUMN aesthete_model_version text;           -- e.g. 'nomic-v1.5-onnx-int8-r1'

-- 3. Vector helpers (IMMUTABLE; pgvector has no scalar-multiply operator)
CREATE FUNCTION vec_scale(v vector, k real) RETURNS vector AS $$
  SELECT (SELECT array_agg(x * k) FROM unnest(v::real[]) AS x)::vector
$$ LANGUAGE sql IMMUTABLE;
CREATE FUNCTION vec_lerp(a vector, b vector, w real) RETURNS vector AS $$
  SELECT vec_scale(a, w) + vec_scale(b, 1 - w)
$$ LANGUAGE sql IMMUTABLE;
CREATE FUNCTION vec_normalize(v vector) RETURNS vector AS $$
  SELECT CASE WHEN l2_norm(v) = 0 THEN v
              ELSE vec_scale(v, (1.0 / l2_norm(v))::real) END
$$ LANGUAGE sql IMMUTABLE;

-- 4. ANN index: HNSW preferred, ivfflat fallback, partial on the catalog layer
DO $$ BEGIN
  BEGIN
    EXECUTE 'CREATE INDEX idx_products_aesthete_hnsw ON products
             USING hnsw (aesthete_vector vector_cosine_ops) WITH (m=16, ef_construction=64)
             WHERE layer = ''catalog'' AND status = ''published''';
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'CREATE INDEX idx_products_aesthete_ivf ON products
             USING ivfflat (aesthete_vector vector_cosine_ops) WITH (lists=50)
             WHERE layer = ''catalog'' AND status = ''published''';
  END;
END $$;
```

Index notes: partial on catalog only — personal/studio layers are small per-owner sets where a sequential scan wins, and filtered ANN on older pgvector loses recall. The match RPC sets `SET LOCAL hnsw.ef_search = 100` / `ivfflat.probes = 10`. At ≤ 50k products, exact scan is an acceptable degraded mode — index type never blocks launch.

### 5.2 Product DNA (00237)

One 1:1 table: typed columns for every axis the scorer touches, jsonb for narrative, and per-attribute confidence/source as jsonb maps keyed by column name. (Rejected: EAV — join fan-out in the hot path; all-jsonb — no CHECKs on scoring axes; columns-on-products — wrong write cadence and an already-wide RLS-hot table.)

```sql
CREATE TABLE product_dna (
  product_id uuid PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  -- F1 identity & provenance ⭐ (net-new only; name/brand/category live on products)
  era text, origin_country text, originating_designer text, collection text,
  provenance_story text, edition text,
  -- F2 form & silhouette ⭐ (partial)
  line_quality real CHECK (line_quality BETWEEN -1 AND 1),   -- rectilinear ↔ curvilinear
  visual_scale real CHECK (visual_scale BETWEEN -1 AND 1),   -- airy ↔ commanding
  negative_space real CHECK (negative_space BETWEEN -1 AND 1),
  silhouette text, leg_style text, arm_profile text, back_profile text,
  symmetry text, proportion_notes text,
  -- F3 material & construction ⭐ (materials[]/finish stay on products)
  joinery text, surface_texture text,
  solidity real CHECK (solidity BETWEEN -1 AND 1),
  craftsmanship_tier real CHECK (craftsmanship_tier BETWEEN 0 AND 1),
  maintenance_reality jsonb DEFAULT '{}',                    -- {pets:"caution", kids:"fine", notes}
  -- F4 color & finish ⭐
  dominant_color text, accent_colors text[], palette_family text,
  color_value real CHECK (color_value BETWEEN -1 AND 1),
  color_saturation real CHECK (color_saturation BETWEEN 0 AND 1),
  color_temperature real CHECK (color_temperature BETWEEN -1 AND 1),
  sheen real CHECK (sheen BETWEEN 0 AND 1),
  pattern_density real CHECK (pattern_density BETWEEN 0 AND 1),
  color_histogram jsonb,
  -- F5 patina & aging — the signature dimension, first-class typed
  patina_potential real CHECK (patina_potential BETWEEN 0 AND 1),
  material_honesty real CHECK (material_honesty BETWEEN 0 AND 1),
  character_trajectory text,
  -- F6 style signature ⭐ — spectrums live in product_style_spectrum; archetypes in product_styles
  mood_keywords text[] DEFAULT '{}', ambiance text,
  -- F7 function & ergonomics ⭐ (partial)
  primary_function text,
  comfort real CHECK (comfort BETWEEN 0 AND 1),
  flexibility real CHECK (flexibility BETWEEN 0 AND 1),
  durability_for text[] DEFAULT '{}',                        -- {'kids','pets','high_traffic'}
  -- F8 context ○ — jsonb until the room composer ships
  context jsonb DEFAULT '{}',
  -- F9 commercial ⭐ (partial; price on products)
  price_tier text, value_story text, lead_time_days int, sustainability text[] DEFAULT '{}',
  -- per-attribute confidence & provenance, keyed by column name
  confidence jsonb NOT NULL DEFAULT '{}',    -- {"patina_potential": 0.85, ...}
  attr_source jsonb NOT NULL DEFAULT '{}',   -- {"patina_potential": "ml_predicted"|"designer"|"validated"}
  dna_version int NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);

CREATE TABLE product_dna_drafts (             -- raw Claude output; never the canonical row
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  draft jsonb NOT NULL,                       -- full structured output (§6.3 schema)
  model text NOT NULL, prompt_version text NOT NULL,
  overall_confidence real, created_at timestamptz DEFAULT now(),
  UNIQUE (product_id, prompt_version)
);

CREATE TABLE dna_vocab (                      -- soft vocabulary for text attributes
  family text NOT NULL, attribute text NOT NULL, value text NOT NULL,
  label text, sort int DEFAULT 0, PRIMARY KEY (attribute, value)
);
```

- **F10 (learned & behavioral) is never stored in DNA** — it is derived (`product_behavior_stats` matview §5.5 + existing `product_appeal_signals`).
- Vocab is data, not CHECKs — vocabulary evolves weekly during teaching ramp-up; ingest must never block on a new arm profile.
- **F8 relationships** (Phase 2): `product_relationships(product_id, related_product_id, relation CHECK IN ('pairs_with','clashes_with','same_set','alternative'), strength real, note text, created_by, UNIQUE(product_id, related_product_id, relation))`.

**Spectrum reuse** — `product_style_spectrum` stays canonical and designer-owned; additive columns only:

```sql
ALTER TABLE product_style_spectrum
  ADD COLUMN source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','validated')),
  ADD COLUMN confidence jsonb NOT NULL DEFAULT '{}';   -- per-dimension {"warmth": 0.9, ...}
```

ML never writes this table. Draft spectrums live inside `product_dna_drafts.draft`; the teaching UI prefills its sliders from the draft; a designer save writes the canonical row (`source='manual'`, confidence 0.7) and peer validation upgrades it (`'validated'`, 0.95). The scorer reads **canonical-else-draft**: an untaught product matches using its draft spectrums at the model's stated confidence, so the whole catalog is matchable from week 4 while designers work through the queue.

### 5.3 Client profiles & quiz (00240)

```sql
CREATE TABLE client_style_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,   -- NULL until claimed
  session_key uuid NOT NULL,                                   -- client-held anon capability
  quiz_session_id uuid REFERENCES quiz_sessions(id),
  source text NOT NULL DEFAULT 'quiz' CHECK (source IN ('quiz','deep_dive','derived','behavioral')),
  style_vector vector(768),
  warmth real CHECK (warmth BETWEEN -1 AND 1), complexity real CHECK (complexity BETWEEN -1 AND 1),
  formality real CHECK (formality BETWEEN -1 AND 1), timelessness real CHECK (timelessness BETWEEN -1 AND 1),
  boldness real CHECK (boldness BETWEEN -1 AND 1), craftsmanship real CHECK (craftsmanship BETWEEN -1 AND 1),
  spectrum_confidence jsonb NOT NULL DEFAULT '{}',             -- per-dimension c_k
  archetype_weights jsonb NOT NULL DEFAULT '{}',               -- {style_id: weight}
  archetype_primary uuid REFERENCES styles(id),
  budget jsonb NOT NULL DEFAULT '{}',    -- {min_cents, max_cents, label, value_orientation, quality_vs_quantity}
  material_affinities jsonb DEFAULT '{}', functional_priorities jsonb DEFAULT '{}',
  patina_affinity real DEFAULT 0,
  confidence real DEFAULT 0.5,
  is_current boolean NOT NULL DEFAULT true, version int NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX ux_csp_current ON client_style_profiles(session_key) WHERE is_current;
CREATE INDEX idx_csp_user ON client_style_profiles(user_id) WHERE user_id IS NOT NULL;

CREATE TABLE quiz_option_loadings (            -- calibration is an UPDATE, not a migration
  question_key text NOT NULL,                  -- 'visual_resonance' | 'lifestyle' | 'material' | 'investment' | 'catalyst'
  option_key text NOT NULL,
  question_weight real NOT NULL DEFAULT 1.0,
  spectrum_deltas jsonb NOT NULL DEFAULT '{}', -- {"warmth": +0.6, "complexity": -0.5, ...}
  archetype_loadings jsonb DEFAULT '{}',       -- {style_id: weight}
  material_loadings jsonb DEFAULT '{}',
  budget jsonb, other jsonb DEFAULT '{}',      -- patina_affinity, priorities, catalyst class
  image_embedding vector(768),                 -- pre-embedded quiz imagery (NULL for non-visual options)
  PRIMARY KEY (question_key, option_key)
);

CREATE TABLE quiz_rate_limits (
  ip_hash text NOT NULL, window_start timestamptz NOT NULL, n int NOT NULL DEFAULT 1,
  PRIMARY KEY (ip_hash, window_start)
);
```

Rejected: one polymorphic `aesthetic_profiles(subject_type, subject_id, …)` for products/clients/designers/house — elegant on a whiteboard; RLS becomes a CASE-per-subject minefield and FK integrity dies. Shared *shape by convention*, separate tables per subject.

`user_style_signals` (iOS legacy, 0..1 scale) is kept and bridged (`(x+1)/2`) on claim — never extended.

### 5.4 Designer taste & house (00239)

```sql
CREATE TABLE designer_taste_profiles (
  designer_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  taste_vector vector(768),                    -- v_D (EMA over judgment winners)
  portfolio_centroid vector(768),              -- v_D0, never decays
  theta real[] ,                               -- θ_D over the 94-d interpretable basis (§8.1)
  warmth real, complexity real, formality real, timelessness real, boldness real, craftsmanship real,
  confidence_map jsonb NOT NULL DEFAULT '{}',  -- {style_id: {score, n, label}}
  reliability real NOT NULL DEFAULT 0.15 CHECK (reliability BETWEEN 0 AND 1),
  deviation_from_house jsonb DEFAULT '{}',
  sources jsonb NOT NULL DEFAULT '{}',         -- {portfolio_items, judgments, corrections, rules}
  judgments_processed_at timestamptz,          -- nightly-refit watermark
  drift_flag boolean DEFAULT false,
  version int NOT NULL DEFAULT 1, updated_at timestamptz DEFAULT now()
);

CREATE TABLE designer_taste_snapshots (        -- append-only history: audit + export substrate
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  designer_id uuid NOT NULL, version int NOT NULL,
  taste_vector vector(768), theta real[], spectrums jsonb, reliability real, sources jsonb,
  created_at timestamptz DEFAULT now(), UNIQUE (designer_id, version)
);

CREATE TABLE designer_style_confidence (       -- the confidence map, relational for the hot-path join
  designer_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  style_id uuid REFERENCES styles(id) ON DELETE CASCADE,
  level text NOT NULL CHECK (level IN ('learning','advanced','expert')),
  weight real GENERATED ALWAYS AS
    (CASE level WHEN 'expert' THEN 1.0 WHEN 'advanced' THEN 0.7 ELSE 0.4 END) STORED,
  judgment_count int DEFAULT 0, updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (designer_id, style_id)
);

CREATE TABLE taste_judgments (                 -- the primary fuel; append-only
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  designer_id uuid NOT NULL REFERENCES auth.users(id),
  product_a uuid NOT NULL REFERENCES products(id),
  product_b uuid NOT NULL REFERENCES products(id),
  choice text NOT NULL CHECK (choice IN ('a','b','neither','both')),
  context text NOT NULL DEFAULT 'self' CHECK (context IN ('self','client','house')),
  client_profile_id uuid REFERENCES client_style_profiles(id),
  kind text NOT NULL DEFAULT 'judgment' CHECK (kind IN ('judgment','probe','rule_pseudo')),
  session_id uuid REFERENCES teaching_sessions(id),
  latency_ms int, created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_tj_designer_time ON taste_judgments(designer_id, created_at);

CREATE TABLE taste_corrections (               -- directional overrides; append-only
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  designer_id uuid NOT NULL REFERENCES auth.users(id),
  subject text NOT NULL CHECK (subject IN ('match','dna','spectrum')),
  product_id uuid REFERENCES products(id),
  replacement_product_id uuid REFERENCES products(id),        -- correction-with-replacement
  client_profile_id uuid REFERENCES client_style_profiles(id),
  direction jsonb NOT NULL DEFAULT '{}',       -- {"warmth": -0.3, "boldness": -0.2}
  free_text text,
  surface text CHECK (surface IN ('engine_ask','teaching','companion','library')),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE designer_portfolio_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  designer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path text NOT NULL,                  -- private bucket, capture-media pattern
  caption text, embedding vector(768),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','embedded','failed')),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE house_taste (                     -- versioned rows; exactly one active
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version int NOT NULL UNIQUE,
  taste_vector vector(768) NOT NULL,
  theta real[],
  warmth real, complexity real, formality real, timelessness real, boldness real, craftsmanship real,
  curated_overrides jsonb DEFAULT '{}',        -- {"warmth": {"op":"pin","value":0.55}, "boldness":{"op":"protect"}}
  computed_from jsonb NOT NULL DEFAULT '{}',   -- {designer_id: {weight}} snapshot, or {collection: "house-hundred"}
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','retired')),
  curated_by uuid, notes text, created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX ux_house_active ON house_taste((1)) WHERE status = 'active';

CREATE TABLE signature_biases (                -- "Your Eye": named, editable, never written back into θ
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  designer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_group text NOT NULL,                 -- e.g. 'warmth', 'archetype:modern_industrial', 'material:metal'
  direction text NOT NULL CHECK (direction IN ('+','-')),
  learned_strength real, displayed_strength real,
  name text NOT NULL, description text,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','confirmed','edited','muted')),
  evidence jsonb DEFAULT '{}',                 -- exemplar product ids, correction citations
  version int NOT NULL DEFAULT 1, updated_at timestamptz DEFAULT now()
);
CREATE TABLE bias_templates (
  pattern text PRIMARY KEY,                    -- 'warmth+ ∧ material:metal'
  name text NOT NULL, description text
);

CREATE TABLE taste_rules (                     -- rule builder ⭐; predicate schema harvested from the old service
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_scope text NOT NULL CHECK (owner_scope IN ('designer','house')),
  designer_id uuid REFERENCES auth.users(id),
  scope text NOT NULL DEFAULT 'global' CHECK (scope IN ('global','category','style')),
  scope_value text,
  predicate jsonb NOT NULL,                    -- {"all": [{"attr":"complexity","gte":0.5}]}
  action text NOT NULL CHECK (action IN ('boost','bury','block')),
  magnitude real DEFAULT 0.1 CHECK (magnitude BETWEEN 0 AND 0.5),
  status text NOT NULL DEFAULT 'active', created_at timestamptz DEFAULT now(),
  CHECK ((owner_scope = 'designer') = (designer_id IS NOT NULL))
);

CREATE TABLE style_centroids (                 -- archetype anchors for in-DB client seeding
  style_id uuid PRIMARY KEY REFERENCES styles(id) ON DELETE CASCADE,
  centroid vector(768) NOT NULL,
  n_products int NOT NULL, computed_at timestamptz DEFAULT now()
);
```

### 5.5 Engine operations tables (00238, 00241, 00242)

```sql
CREATE TABLE aesthete_jobs (                   -- one outbox for all machine work
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('embed_text','embed_fused','dna_draft','portfolio_embed','centroid')),
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  payload jsonb DEFAULT '{}',
  dedupe_key text UNIQUE,                      -- e.g. product_id || ':embed:' || model_version
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed')),
  attempts int NOT NULL DEFAULT 0, run_after timestamptz DEFAULT now(), last_error text,
  created_at timestamptz DEFAULT now(), completed_at timestamptz
);
CREATE INDEX idx_jobs_claim ON aesthete_jobs(kind, run_after) WHERE status = 'pending';

CREATE TABLE match_weight_profiles (
  name text NOT NULL, version int NOT NULL,
  weights jsonb NOT NULL,                      -- §10.3 term weights
  is_active boolean NOT NULL DEFAULT false, notes text, created_at timestamptz DEFAULT now(),
  PRIMARY KEY (name, version)
);

CREATE TABLE why_phrases (                     -- server-side reason rendering; copy law lives here
  term text NOT NULL, band text NOT NULL,      -- band: contribution range or condition key
  template text NOT NULL,                      -- "The kind of oak that only gets better"
  sort int DEFAULT 0, PRIMARY KEY (term, band)
);

CREATE TABLE match_events (                    -- every match call; the observability + learning substrate
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_key uuid, user_id uuid, designer_id uuid,
  source text NOT NULL,                        -- 'quiz' | 'engine_ask' | 'ios' | 'client_portal'
  context jsonb DEFAULT '{}',
  w real, w_effective real, house_version int, weights_version int,
  results jsonb NOT NULL,                      -- [{product_id, score, terms:{...}, is_exploration}]
  latency_ms int, created_at timestamptz DEFAULT now()
);
-- law: source='engine_ask' rows carry NO query text — latency + result count only

CREATE TABLE aesthete_audit (                  -- weekly guardrail results
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  week date NOT NULL, check_name text NOT NULL, passed boolean NOT NULL,
  detail jsonb DEFAULT '{}', created_at timestamptz DEFAULT now(),
  UNIQUE (week, check_name)
);

CREATE TABLE aesthete_spend_ledger (           -- Claude cost governor
  day date PRIMARY KEY, input_tokens bigint DEFAULT 0, output_tokens bigint DEFAULT 0,
  cache_read_tokens bigint DEFAULT 0, usd numeric(8,2) DEFAULT 0, products int DEFAULT 0
);

CREATE MATERIALIZED VIEW product_behavior_stats AS   -- F10, derived (Loop 1/4 substrate)
SELECT product_id,
       count(*) FILTER (WHERE event_type = 'view')  AS views,
       count(*) FILTER (WHERE event_type = 'save')  AS saves,
       count(*) FILTER (WHERE event_type = 'skip')  AS skips,
       (count(*) FILTER (WHERE event_type = 'save') + 2.0)
         / (count(*) FILTER (WHERE event_type = 'view') + 20.0) AS smoothed_save_rate
FROM interactions GROUP BY product_id;
-- UNIQUE index on product_id; REFRESH CONCURRENTLY nightly
```

Laplace smoothing on save-rate means unseen products inherit the prior — the behavioral term can never bury a new piece (anti-runaway guardrail, structural).

### 5.6 RLS design

Conventions reused: product-child tables inherit product visibility via `EXISTS (SELECT 1 FROM products p WHERE p.id = product_id)` (the subquery runs as the querying role, so three-layer law applies transitively); admin via the existing role join; service role bypasses RLS for job writers.

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `product_dna`, `product_relationships` | product-visibility EXISTS | designer/admin | designer/admin | admin |
| `product_dna_drafts` | designer/admin | none (job) | none | admin |
| `dna_vocab`, `match_weight_profiles`, `why_phrases`, `quiz_option_loadings` | authenticated (config data) | admin | admin | admin |
| `client_style_profiles` | own rows; assigned designer via `designer_clients` join; **no anon SELECT** (anon reads only via RPC responses — prevents enumeration) | RPC-only | RPC-only | own |
| `designer_taste_profiles`, `_snapshots` | own; lead/admin | none (job) | biases via RPC only | none |
| `designer_style_confidence` | own; lead/admin | job/RPC | none | none |
| `taste_judgments`, `taste_corrections` | own; admin | `WITH CHECK (designer_id = auth.uid())` | none (append-only) | none |
| `designer_portfolio_items` | own; admin | own | own (caption) | own |
| `house_taste` | authenticated — spectrum coords + version; **raw vector redacted via view**; no anon policy (cold-start reads happen inside the DEFINER match RPC) | lead RPC | lead RPC | none |
| `taste_rules` | own + house rules to authenticated | own / lead for house scope | own | own |
| `aesthete_jobs`, `quiz_rate_limits`, `match_events`, `aesthete_audit`, `aesthete_spend_ledger` | admin | triggers/DEFINER fns | none | none |

SECURITY DEFINER hygiene: every new RPC pins `search_path = public`; `get_aesthete_matches` applies layer visibility *internally* (anon ⇒ `layer='catalog'` only) since DEFINER bypasses RLS. Week-0 audit item: verify `v_aesthete_catalog_input`'s `commission_rate` exposure excludes anon grants.

---

## 6. Ingestion & enrichment pipeline

### 6.1 Flow

```
capture (extension / iOS field capture / manual add / URL paste)
   └─▶ products INSERT (layer='personal', images[], source_url, …)      [existing paths, unchanged]
         ├─ trigger → teaching_queue                                     [existing 00005 trigger]
         └─ trigger → aesthete_jobs: embed_text + embed_fused + dna_draft
               ├─ pg_cron (1 min) → aesthete-embed-worker → inference worker
               │     └─ UPSERT products.embedding / aesthete_vector (+model version, watermark)
               └─ pg_cron (2 min) → aesthete-dna-draft → Claude API
                     └─ product_dna_drafts + product_styles(source='ml_predicted')
                           └─ teaching UI prefills sliders from the draft
                                 └─ designer confirms → canonical spectrum + DNA, source flips
```

Products re-enqueue on `UPDATE OF images, description` and on DNA/spectrum edits (caption re-embed). Dedupe via `dedupe_key = product_id || ':' || kind || ':' || model_or_prompt_version`. All batches are re-entrant and sized to finish well inside the 60 s pg_net window (embed: 16 images ≈ 5–10 s; draft: 4 products, 2-way concurrency).

Image sourcing note: extension captures store *external retailer URLs*; iOS field captures store public `capture-media` URLs. The embed worker and Claude both fetch these directly for MVP — routing product images through the `services/media` renditions pipeline is a Phase-2 nicety, not a dependency (flagged in §16).

### 6.2 Claude draft-fill: model + cost

- **Bulk:** `claude-haiku-4-5` ($1/$5 per MTok). **Escalation:** `claude-sonnet-5` when Haiku's `overall_confidence < 0.6`, on schema violation, or on archetype disagreement with retailer text. **Offline calibration grading** (monthly): `claude-opus-4-8`.
- Per product: 3 images ≈ 4,800 tok (~1092 px max edge) + ~1.2k prompt + ~10k **cached** system prefix (reads at 0.1×) + ~1k output. Haiku ≈ **$0.011–0.013/product**; blended with ~15% Sonnet escalation ≈ **$0.015**. Backfill via the **Batches API (50% off)** ≈ $0.008/product ⇒ a 5k catalog ≈ **$40–75 one-time**, then pennies per day at capture cadence.
- **Spend governor:** `aesthete_spend_ledger` accrues tokens/cost per day; the draft worker checks the daily budget before claiming and parks the queue when exceeded. Cost telemetry → PostHog.

### 6.3 Prompt architecture & output contract

System prompt = stable cached prefix: role ("furniture analyst for an interior design studio"), the six spectrum definitions with pole anchors verbatim from the brief, the 12 archetype names + descriptions + `visual_markers` from the `styles` table (single enum source), then **4–6 few-shot calibration turns** — anchor products from `spectrum_calibration_products` as image + gold-score exemplars. The anchors are the cross-product score-consistency mechanism: without them, per-image scores are internally coherent but mutually incomparable. Volatile per-product content (images, retailer text, price) sits after the cache breakpoint. Structured outputs (JSON schema) so responses never need repair.

Output schema (excerpted; families → §5.2 columns):

```jsonc
{ "identity":  { "era": "…", "origin": null, "provenance_candidate": "…", "conf": 0.6 },
  "form":      { "silhouette": "…", "line_quality": -0.4, "leg_style": "tapered", "conf": {…} },
  "material":  { "primary": "walnut", "finish": "natural oil", "craftsmanship_tier": 0.7, "conf": {…} },
  "color":     { "dominant_hex": "#6B4F3A", "palette_family": "warm earth", "temperature": 0.6, "conf": 0.8 },
  "patina":    { "potential": 0.8, "material_honesty": 0.9, "trajectory": "oak silvers", "conf": 0.7 },
  "style":     { "primary_archetype": "warm_modern", "secondary": [{"archetype":"japandi","weight":0.4}],
                 "spectrums": { "warmth": 0.6, "complexity": -0.4, … },
                 "spectrum_conf": {…}, "mood_keywords": ["grounded","quiet"], "ambiance": "Refined Casual" },
  "function":  { "primary_use": "…", "durability_for": ["kids"], "conf": 0.7 },
  "context":   { "min_room_feel": "…", "conf": 0.4 },
  "commercial":{ "price_tier_estimate": "mid_premium", "value_story_draft": "…", "conf": 0.5 },
  "overall_confidence": 0.72, "uncertainties": ["arm profile occluded"] }
```

**Triage into the teaching queue:** `overall_confidence ≥ 0.75` → quick-validate modes; 0.5–0.75 → normal pending; `< 0.5`, refusal, schema failure, or ambiguous/multi-object imagery → `requires_deep_analysis = true` with priority bump. API failure: 2 retries with backoff, then the product stays in the queue and the designer starts blank — today's behavior, no regression.

**Calibration maintenance:** monthly re-score of 20 held-out anchors; per-dimension MAE > 0.25 → revise anchors/prompt (bump `prompt_version`). Once ≥ 100 designer-validated pairs exist: weekly per-dimension affine post-correction `ŝ′ = a_k·ŝ + b_k` fit against validated scores.

---

## 7. The Client Style Profile

### 7.1 The quiz wire contract (canonical external interface)

**A SECURITY DEFINER RPC over PostgREST — not an edge function.** Precedent (`process_style_quiz`, waitlist), zero extra hops, and it is *automatically identical* from the external marketing repo and the client-portal: both call the same endpoint with the same anon key. The shared `packages/aesthete-quiz` package is convenience; **the wire contract is the interface**:

```http
POST /rest/v1/rpc/submit_style_quiz            apikey: <anon>   (or Bearer <jwt>)
{
  "p_session_key": "c1f0…",                    -- client-generated uuidv4, persisted in localStorage
  "p_source": "marketing_site",                -- 'marketing_site' | 'client_portal' | 'ios'
  "p_answers": {
    "visual_resonance": "warm_minimal",
    "lifestyle": ["family", "entertaining"],
    "material": "weathered_oak",
    "investment": "heirloom",
    "catalyst": "new_home"
  },
  "p_timings": { "q1_ms": 4200, … },
  "p_attribution": { "utm_source": "…", "posthog_distinct_id": "…" }
}
→ 200
{
  "profile_id": "…", "session_key": "…",
  "archetype":  { "primary": "Warm Modern", "secondary": "Japandi", "confidence": 0.78 },
  "spectrums":  { "warmth": 0.6, "complexity": -0.45, "formality": -0.2,
                  "timelessness": 0.5, "boldness": -0.25, "craftsmanship": 0.55 },
  "budget":     { "label": "Heirloom", "min_cents": 500000, "max_cents": 1500000, "value_orientation": 0.7 },
  "material_affinities": { "wood": 0.9, "fabric": 0.4, "metal": 0.1 },
  "catalyst":   "new_home"
}
```

The caller then requests matches with the same capability: `POST /rest/v1/rpc/get_aesthete_matches {"p_session_key": "…", "p_limit": 10}`. The session key is a bearer capability — unknown keys 404; anon can *cause* rows, never read tables.

**Abuse posture:** Cloudflare in front of Kong is the real wall; in-DB backstop = `quiz_rate_limits` checked inside the RPC from the `x-forwarded-for` header (10 submissions/IP/hour, fail-open if absent); `UNIQUE(session_key) WHERE is_current` makes re-submission an update, not a flood; a pg_cron janitor purges unclaimed anon rows > 90 days. No CAPTCHA at launch (funnel friction); Cloudflare Turnstile is a one-day retrofit at the marketing site if abuse appears. Learning loops only consume sessions with downstream engagement, so junk sessions can't poison anything.

**Merge on signup:** `claim_quiz_session(p_session_key)` (authenticated): binds `user_id = auth.uid()` on `quiz_sessions` + `client_style_profiles` where NULL; upserts `client_profiles.quiz_responses`/`style_preferences`; bridges `user_style_signals` for iOS (scale map `(x+1)/2`); stamps `conversion_event = 'signup'`. Idempotent; refuses keys already claimed by another user.

### 7.2 Profile computation (quiz v2)

The existing `process_style_quiz` hand-rolls a CASE mapping to four 0–1 signals. Quiz v2 replaces the mechanism while preserving the contract: **loadings are data** (`quiz_option_loadings`), shared internals `_compute_quiz_profile()` serve both RPCs, and the output is the full six-spectrum profile.

- **Spectrums:** `s_client = clip( Σ_options question_weight · spectrum_deltas(option), −1, 1 )` with question weights Q1 (rooms) = 1.0, Q3 (texture) = 0.7, Q2 (lifestyle) = 0.3, Q4 (investment) = 0.3, Q5 (catalyst) = 0 — Q5 measures readiness/urgency/scope (the lead tell), not aesthetics.
- **Per-dimension confidence:** `c_k = min(1, Σ |δ_k| · question_weight)` — a dimension the quiz barely touches (timelessness) gets low confidence and correspondingly low weight in matching. This is the honest version of "profile confidence."
- **Archetype weights** accumulate from option loadings; primary = argmax; secondary = runner-up.
- **Budget:** Q4 → `{min_cents, max_cents, label, value_orientation ω ∈ [−1,1]}` (starter −0.6 … heirloom +0.7; "discuss" → null range, ω +0.2, flagged as a lead signal).
- **Patina affinity:** loaded by Q3 material choices (weathered oak +0.4, aged leather +0.5) — feeds the T_patina term.
- **Dense vector** — assembled in SQL, zero inference (§4.3): chosen quiz-image embeddings (pre-computed in `quiz_option_loadings.image_embedding`) blended 50/50 with archetype centroids from `style_centroids`.

Initial loadings ship as seed data (calibrated in week 2, tuned by UPDATE thereafter). Excerpt:

| Option | warmth | complexity | formality | timeless | boldness | craft | archetypes / other |
|---|---|---|---|---|---|---|---|
| Q1 `warm_minimal` | +0.6 | −0.5 | −0.2 | +0.3 | −0.3 | +0.3 | Warm Modern .5, Japandi .3, Scandi .2 |
| Q1 `cool_modern` | −0.6 | −0.4 | +0.2 | 0 | +0.1 | 0 | Soft Contemporary .4, Modern Industrial .3 |
| Q1 `classic_comfort` | +0.5 | +0.3 | +0.3 | +0.6 | −0.2 | +0.2 | Traditional .4, Transitional .4 |
| Q1 `eclectic_curated` | +0.3 | +0.5 | −0.2 | 0 | +0.5 | +0.4 | Bohemian .4, Maximalist .3, MCM .3 |
| Q3 `weathered_oak` | +0.2 | 0 | 0 | +0.2 | 0 | +0.3 | wood .9; patina +0.4 |
| Q3 `brushed_metal` | −0.3 | −0.2 | 0 | 0 | +0.1 | 0 | metal .9; Modern Industrial +.2 |
| Q4 `heirloom` | 0 | 0 | 0 | +0.3 | 0 | +0.4 | budget 5k–15k, ω +0.7 |
| Q2 `family` | 0 | 0 | −0.2 | 0 | 0 | 0 | durability: kids/pets (near-hard filter) |

### 7.3 Deepening (Phase 2)

- **Deep dive** (10+ saves or services interest): photo-sorting + slider matrix + story completion → `client_style_profiles` new version with `source='deep_dive'`, higher confidences.
- **Behavioral updates** — `interactions` already flows; event weights: purchase +2.0, save +1.0, zoom +0.4, dwell > 10 s +0.3, ar_place +0.5, skip −0.6, fast-swipe reject −0.8. Dense: `v_client ← normalize(v_client + 0.02·u·v_p)`. Spectrum: `s ← s + 0.03·u·(s_p − s) ⊙ c_p`. **Daily movement cap Σ‖Δv‖ ≤ 0.15** — explicit answers must outweigh one restless scroll (brief §III). Price exploration nudges the budget anchor by at most ±20%.
- **Designer margin notes** (R58-compliant): columns on `designer_clients` — `contraindicated_style_ids uuid[]` (hard filter in matching) + `margin_notes jsonb` (hidden preferences, nuance). No parallel client-profile store.

---

## 8. The Designer Taste Profile

### 8.1 Taste is learned over an interpretable basis

A designer produces 10²–10⁴ judgments. Learning a 768-d weight vector from 300 pairs is statistically absurd; learning ~94 interpretable weights is sane, and it *directly* powers explainability, bias naming, and the confidence-scaled dial — this is the brief's cited "individual preference as a weighting of shared basis features," implemented literally.

**Feature map φ(p) ∈ R⁹⁴:**

```
φ(p) = [ s_p ⊙ c_p (6)          -- confidence-weighted spectrums
         a_p (12)                -- archetype weights (styles taxonomy)
         materials one-hot (10)  -- wood, metal, fabric, stone, glass, leather, rattan, marble, ceramic, mixed
         patina_potential (1)
         craftsmanship_tier (1)
         z_p (64)                -- Matryoshka-truncated aesthete_vector, ℓ2-normalized
       ]
```

**No price, no budget features** — taste can never learn to proxy budget (Part VIII guardrail, enforced structurally, testable).

**Pairwise model (Bradley–Terry):** `P(i ≻ j | designer D) = σ( θ_Dᵀ (φ_i − φ_j) )`.

### 8.2 Learning: nightly MAP refit, online preview

**Canonical: nightly batch refit** (in `aesthete-nightly`; scikit-learn L-BFGS, seconds per designer at this scale):

```
θ_D = argmin_θ  Σ_t  w_t · log(1 + exp(−y_t · θᵀΔφ_t))  +  λ‖θ − θ_H‖²
```

- `w_t = r_t · exp(−Δt_t / τ)`, **τ = 180 days** (taste drifts; old judgments fade). Event weights `r_t`: side-by-side judgment 1.0; correction-with-replacement 2.0 (live client stakes); rejection-only 1.0; rule-authoring pseudo-pair 0.5.
- **The prior mean is θ_H, not zero.** Regularizing toward the house gives graceful cold start, and `θ_D − θ_H` *is* the deviation-from-house readout the brief wants — free. λ = 0.5·30/(30+n), relaxing as evidence accumulates.
- Deterministic and replayable: judgments are the source of truth; θ is a cache. A feature-map change is a refit, never a corrupted incremental state.

**Online preview** (the "Your Eye" panel should visibly move after a teaching session): `θ_D ← θ_D + 0.05·r·(1−p̂)·(φ_i − φ_j)` applied immediately, flagged `preview`, overwritten nightly.

**Corrections:** with a replacement product in client context → a pairwise (replacement ≻ rejected) at weight 2.0. Rejection-only → hinge against a pseudo-item built from the client profile. The structured correction UI (dimension + direction picker: "too industrial" → warmth↓ evidence) additionally yields direct per-dimension labels consumed by bias naming (§8.5) and the Phase-2 spectrum regressors (§4.4).

**Explicit rules stay explicit *and* nudge the vector** (brief stream 4, literal): a `taste_rules` row also emits a 0.5-weight pseudo-pair into `taste_judgments(kind='rule_pseudo')`.

### 8.3 Reliability ρ_D — predictability, not low variance

A designer with strong, wide-ranging taste is not "unreliable"; an unpredictable one is.

- **Temporal-blocked cross-validation:** fit on judgments before each fold boundary, score held-out later judgments → pairwise AUC.
- `ρ_D = (n/(n+30)) · clamp(2·(AUC − 0.5), 0, 1)` — shrunk hard at low n; a portfolio-only designer floors at ρ ≈ 0.15.
- **Blind repeat probes:** ~1 in 25 teaching pairs is a previously judged pair, order-reversed, ≥ 14 days later. Agreement blends in at 25%: `ρ_D = 0.75·ρ_AUC + 0.25·ρ_probe`. Probes are invisible — no "consistency check!" copy (de-gamified law).

### 8.4 Confidence map, drift, decay

- **Per archetype g:** `c_D(g) = (n_g/(n_g+10)) · [0.5·clamp(2·AUC_g − 1, 0, 1) + 0.5·consensus_g]` where `consensus_g` = teaching-validation agreement rate in g. Labels: expert ≥ 0.7, advanced ≥ 0.4, learning < 0.4. Stored relationally (`designer_style_confidence`) for the hot-path join. **This computation finally gives `designer_teaching_stats.accuracy_score` and `match_impact_count` writers** (nightly, §12.2).
- **Drift detector:** if `n_recent(60d) ≥ 40` and `cos(θ_recent, θ_trailing_12mo) < 0.7` → surface "your eye is shifting" in Your Eye (a feature, never a silent overwrite) and halve τ for the next refit.
- **Starvation decay:** no judgments for 90 days → `c_D(g) ← 0.95·c_D(g)` monthly; the deviation `(θ_D − θ_H)` shrinks by `exp(−months_idle/12)`. The portfolio seed never decays — it's who they are, not what they did lately.

### 8.5 "Your Eye": named biases without corrupting the learned state

1. **Derivation:** standardized deviation `d_k = (θ_D,k − θ_H,k)/σ_k` per feature group (σ_k = cross-designer std; bootstrap SE while the roster is small). Candidate bias when `|d_k| ≥ 1.0` **and** sign-stable in ≥ 80% of bootstrap refits — the stability filter kills noise-minted "signature moves."
2. **Naming:** `bias_templates` maps feature-group patterns to human-authored names ("warmth+ on metal products" → *Warms up cool pieces*; "craftsmanship+ ∧ patina+" → *Patina-first*). For novel patterns, Claude may propose a name + one-liner from the evidence set — internal tooling only; a designer or lead approves the label before it renders. Structured corrections mint candidates directly with citations ("you said 'too industrial' 7× on metal-legged pieces").
3. **The edit invariant:** named biases are a **view + override layer; edits never write back into θ_D.** Muting bias group M applies at match time: `θ_eff = θ_blend − w_eff·(M ⊙ (θ_D − θ_H))`. Strengthen/weaken = bounded scalar (×[0.5, 1.5]) on that group's deviation. Overrides are versioned and survive nightly refits (refit recomputes θ_D; overrides re-apply on top). A designer edit is also logged as weak supervision but consumed only as a report ("your learned lean disagrees with your stated bias") — never as pseudo-data. Machine state stays honest; human edits stay explicit.
4. The panel shows: center of gravity (six spectrum coords), top signature biases with evidence, confidence by style, deviation-from-house ("here's where your eye diverges — that's what makes you you"). Consistent with R58: display is derived; only overrides are stored.

---

## 9. House taste & the dial

### 9.1 House taste: curated first, consensus when it's earned

The brief's reliability-weighted consensus assumes judgment histories that won't exist at week 6. Staged honestly:

- **MVP (week 5):** `v_H` = geometric median of a lead-curated exemplar collection — **"the House Hundred"** (~100 products that *are* the Middle West look). `s_H` hand-set by the lead in a one-hour calibration session against `spectrum_calibration_products`. `θ_H` derived: spectrum-aligned weights, zero deviation. Versioned row in `house_taste`, `computed_from = {"collection": "house-hundred"}`.
- **Phase 2 (consensus, per archetype):** `θ_H(g) = trimmed_mean₁₀% ( θ_D weighted by ρ_D · c_D(g) )` with eligibility ρ_D ≥ 0.3 and n ≥ 50, and **any single designer's normalized weight capped at 0.35** (no-runaway-capture guardrail, monitored weekly). Consensus lands as a `draft` row; **activation is human** — the lead approves, especially when drift from the pinned baseline exceeds threshold.
- **Curation ops** (versioned, reversible): `PIN(dim, value)` freeze a coordinate; `NUDGE(dim, δ)`; `PROTECT(dim)` — recompute needs lead approval on that coordinate; `RESEED(collection)` — recompute v_H from a curated collection. Rollback = reactivate a prior version row.

### 9.2 The dial: exact formulas

Per match, in style neighborhood g (the product's primary archetype):

```
w_eff(D, g) = w · ρ_D · c_D(g)                       -- dial × reliability × per-style confidence
θ_blend     = θ_H + w_eff · (θ_D − θ_H)              -- the real dial: preference-weight blend
v_blend     = normalize( vec_lerp(v_D, v_H, w_eff) ) -- dense blend, ANN query tinting only
```

**Blend at θ-level, not raw-vector level.** Averaging unit vectors has no confidence semantics and collapses nonlinearly toward the house; θ_blend is exactly the brief's `influence()` formula with the confidence-map interaction made precise. (Normalized lerp ≈ slerp at the angles involved; slerp rejected for implementation cost, not math.)

**The warping bound — "amplifies, never overrules" as a weight cap:** taste enters scoring only through T_taste at fixed weight 0.12 (§10.3) — an additive re-rank term, never a multiplier on client fit. Even `w_eff = 1` can reorder within the client's plausible set; it cannot overrule the client.

### 9.3 Dial surface, defaults, cold start

- Client-visible: three stops — **House / Blended / Designer's eye** → w ∈ {0, 0.35, 0.9} (continuous under the hood; per-relationship value on `designer_clients`).
- Context defaults: anonymous quiz w = 0; assigned designer w = 0.35; "show me their eye" w = 0.9.
- **Cold start is self-limiting:** a new designer has ρ ≈ 0.15 (portfolio-only), so even w = 0.9 yields w_eff ≤ 0.14. The dial *exists from day one* (brief's MVP requirement) but bends recommendations only as fast as the vector becomes real.
- **The dial earns its clicks:** the 0.9 stop unlocks per-designer only when their θ_D beats θ_H on their *own held-out judgments* by ≥ 5 points (§14.4) — the eval metric and the product gate are the same number.
- Client↔designer matching (Phase 2 payoff): `sim = ½(1 + cos(v_client, v_D))`, always reported with the confidence map and n — "Ana's eye aligns with yours" is never a bare percentage.

---

## 10. Matching & explainability

### 10.1 RPC signature

```sql
CREATE FUNCTION get_aesthete_matches(
  p_session_key uuid,                  -- client capability (anon or claimed)
  p_designer_id uuid  DEFAULT NULL,    -- NULL → pure house
  p_w real            DEFAULT NULL,    -- NULL → context default (0 anon, 0.35 assigned)
  p_category text     DEFAULT NULL,
  p_room_id uuid      DEFAULT NULL,
  p_layer text        DEFAULT 'catalog',
  p_limit int         DEFAULT 10,
  p_offset int        DEFAULT 0,
  p_explore_ratio real DEFAULT 0.2,
  p_weights_profile text DEFAULT 'default'
) RETURNS TABLE (product_id uuid, rank int, score real, confidence real,
                 is_exploration boolean, why jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION get_aesthete_matches TO anon, authenticated;
```

### 10.2 Pipeline

**Stage 0 — hard filters** (SQL WHERE): layer visibility (anon ⇒ catalog only, enforced internally); status published; category/function when requested; `price_retail ≤ 1.25 · budget_max` (the perception model handles everything softer); designer contraindications (`designer_clients.contraindicated_style_ids` ∩ product archetypes = exclusion); `taste_rules` with `action='block'`; kids/pets durability when Q2 demanded it.

**Stage 1 — candidates:** ANN top-200 by `aesthete_vector <=> v_query` where `v_query = vec_normalize(0.8·v_client + 0.2·v_blend)` (`SET LOCAL hnsw.ef_search=100` / `ivfflat.probes=10`). When a text ask exists (⌘K), union `aesthete_search()` FTS candidates into the same scorer — **this union point is the Typesense seam**: candidate generation is the only thing Typesense would ever replace.

**Stage 2 — scoring** (weights from the active `match_weight_profiles` row):

### 10.3 Scoring function

`S = Σ w_t · T_t − 0.30 · P`, every term ∈ [0,1], missing-data terms dropped and remaining weights renormalized; row `confidence` = Σ(available weights) × mean(attribute confidences):

| Term | Formula | Weight | Lineage |
|---|---|---|---|
| `T_style_dense` | affine-calibrated `cos(v_client, v_p)`: `clamp((cos − 0.25)/0.60, 0, 1)` (recalibrated from the catalog distribution at first eval) | **.30** | old vec .45, split three ways |
| `T_spectrum` | `1 − ½·sqrt( Σ_k γ_k c_k^c c_k^p (s_k^c − s_k^p)² / Σ_k γ_k c_k^c c_k^p )` with per-axis salience γ = (1.2, 1.0, 0.8, 0.6, 1.1, 1.0) — warmth and boldness read loudest | **.15** | new — the interpretable channel |
| `T_taste` | `σ( θ_blendᵀ φ_p )`, calibrated; weight additionally scaled by w_eff so at w = 0 it collapses into pure house | **.12** | old rules .15 |
| `T_material_color` | material-affinity dot + color-temperature agreement + `material_compatibility` bonus | **.10** | new |
| `T_budget` | perception model (§10.4) | **.10** | old price .10 |
| `T_function` | lifestyle/durability tags vs Q2 (honest kids/pets/high-traffic tags) | **.08** | new |
| `T_context` | room known: utilization curve (optimal 30–60% of room dimension, salvaged from the old scorer); else 0.5 | **.05** | old size .10 |
| `T_patina` | `patina_potential · client.patina_affinity`, floor at material_honesty·0.4 — the brand dimension gets an explicit term | **.05** | replaces old freshness .05 (furniture isn't news) |
| `T_behavioral` | `smoothed_save_rate` from the matview (Laplace prior protects new pieces) | **.05** | old pop .05 |
| `P` (penalty) | stock/discontinued/lead-time/blocked-material leaks, capped at 1 | **−.30** | old penalty .30 |

Soft `taste_rules` (`boost`/`bury`) apply as ±magnitude on S with scope priority global < category < style (harvested from the old rule engine). Diversification: salvaged MMR (λ = 0.8; caps ≤ 3/brand, ≤ 5/dominant-color) before slotting.

### 10.4 Budget perception (not a price filter)

Client carries `(B_min, B_max, ω)` with ω = value orientation from Q4. Anchor `A = sqrt(B_min·B_max)` (or `0.8·B_max` when B_min = 0); `δ = ln(price/A)`:

```
T_budget = exp( −(δ − μ(ω))² / (2·σ(ω)²) ),   μ(ω) = 0.25·ω,   σ(ω) = 0.45 + 0.15·ω
```

A log-space bell: price perception is multiplicative. Investment-minded clients (ω > 0) have a comfort center *above* their stated anchor with wider tolerance; price-sensitive clients sit below and tighter. **Value-story softener:** when over-anchor (δ > μ) and `craftsmanship_tier ≥ 0.6` with a provenance story, `T_budget += 0.10` (capped) — "perceived value, not absolute dollars," and the why then cites the story. Structural guardrails: budget never feeds T_style or T_taste; ω never scales taste.

### 10.5 Exploration: two honest stretch slots

Top-10 = **8 exploit** (post-MMR score order) + **2 explore**: sampled without replacement from candidates ranked 20–80 with

```
P(p) ∝ exp(S_p / 0.1) · novelty_p,    novelty_p = 1 − max_{h ∈ saves} cos(v_p, v_h)   (0.7 when no history)
```

seeded deterministically per `(session_key, current_date)` — reproducible within a day (testable in CI), fresh across days. Rejected: ε-greedy (wastes slots on uniform junk); Thompson (no per-arm posterior is worth maintaining at hundreds of quizzes/month). Served rows carry `is_exploration` so Loop 4 measures **stretch acceptance** (healthy band §14.6); the why is honest: *"a step outside your usual — worth a look."* The floor `GREATEST(1, floor(p_explore_ratio · p_limit))` is enforced in the RPC and audited weekly from `match_events`.

### 10.6 The "why" payload

Computed in the same query that scores — there is no unexplained score path:

```jsonc
{
  "score": 87, "confidence": 0.72, "is_exploration": false, "weights_version": 3,
  "blend": { "w": 0.35, "w_effective": 0.18, "designer_id": "…", "house_version": 1 },
  "terms": { "style_dense": 0.27, "spectrum": 0.13, "taste": 0.08, "budget": 0.10,
             "material_color": 0.06, "function": 0.05, "patina": 0.05, "behavioral": 0.04 },
  "top_reasons": [
    { "term": "spectrum",  "phrase": "Matches your warm, natural-material leaning", "contribution": 0.13 },
    { "term": "budget",    "phrase": "Comfortably within your range", "contribution": 0.10,
      "detail": { "perception": "fair", "price_cents": 185000 } },
    { "term": "patina",    "phrase": "The kind of oak that only gets better", "contribution": 0.05 }
  ],
  "cautions": [ { "term": "context", "phrase": "On the larger side for your room", "penalty": -0.03 } ],
  "stretch_axis": null
}
```

Rendering rules (server-side, from `why_phrases` bands): ≤ 3 reasons; ≥ 1 must be concrete (material/dimension/price); never numbers or scores in copy; never "AI" (copy law — one string source for web, iOS, marketing). Match confidence surfaces as {early read / good / strong} — never a percent. Full per-term contributions land in `match_events` for audit and replay.

### 10.7 Frozen contracts

`get_recommendations(p_room_id, p_category, p_limit, p_offset)` keeps its exact signature and RETURNS TABLE; the body becomes a shim — resolve the caller's `client_style_profiles` (bridging `user_style_signals` if needed), call `get_aesthete_matches`, map score → 0–100. `process_style_quiz` likewise delegates to `_compute_quiz_profile()`. **iOS ships nothing.**

---

## 11. The five learning loops → mechanisms

| # | Loop (brief §VI) | Signal source | Mechanism | Updates | Phase |
|---|---|---|---|---|---|
| 1 | Client implicit signals | `interactions` → `engagement_events` (exists) | behavioral updates w/ daily movement cap (§7.3); `product_behavior_stats` matview | client vector/spectrums; T_behavioral | ○ P2 |
| 2 | Designer teaching | teaching UI + `taste_judgments` + `taste_corrections` + `teaching_validations` | draft-confirm flow (§6); nightly BT refit (§8.2); DNA confidence roll-up trigger | Product DNA confidence; θ_D, v_D | ⭐ queue+tagging MVP; vector learning P2 |
| 3 | Portfolio ingestion | `designer_portfolio_items` (private bucket) | embed jobs → geometric median seed | v_D0, taste cold start | ○ P2 (table ships W0) |
| 4 | Field outcomes | `match_events` × `interactions` × orders | offline replay over served results (§14.5); weight changes ship as new `match_weight_profiles` version rows — never code edits | term weights | ○ P2 |
| 5 | Consensus & conflict | `teaching_validations` (3-touch path, exists) + house recompute | validation upgrades spectrum/DNA source + confidence; Phase-2 trimmed-mean consensus w/ 0.35 cap | product confidence; θ_H | ○ P2 |

The through-line the brief demands — *every designer action does double duty* — is structural: a correction fixes today's match (Loop 2, immediate) **and** appends a directional training row (Loop 2, nightly refit) **and** feeds tomorrow's house (Loop 5).

---

## 12. Runtime & operations

### 12.1 The inference worker

`services/aesthete-inference` — new directory, deliberately tiny:

- **API:** `POST /embed/text {inputs: [{id, text, kind: 'document'|'query'}]}`, `POST /embed/image {inputs: [{id, url}]}` (batch ≤ 16), `GET /healthz → {status, model_version, text_dim: 768, image_dim: 768, warmed: true}`. Stateless, **no DB access**, internal Docker network only, bearer `INFERENCE_TOKEN`.
- **Build:** multi-stage Dockerfile — stage 1 downloads + ONNX-exports both nomic v1.5 models with int8 dynamic quantization; stage 2 = `python:3.12-slim` + `onnxruntime, tokenizers, pillow, fastapi, uvicorn, httpx` + baked `/models`. Weights baked into the image (atomic deploy/rollback, content-addressed `model_version`); ~0.5–1 GB image is fine on a single-host registry.
- **Sizing:** `mem_limit 2g`, `cpus 2.0`; onnxruntime intra-op threads = 2; single uvicorn worker; in-process semaphore returns **429 past depth 8** so edge fns back off and re-enqueue rather than pile on.
- **Degradation ladder when it's down:** (1) quiz → matches: **unaffected** — pure SQL by design; (2) ⌘K ask: 1.5 s timeout → `aesthete_search()` FTS-only with the UI state *"the Engine is resting"* (copy law: never "error," never "AI"); (3) embed/draft/portfolio jobs: queue and drain on recovery — nothing lost. Per-request timeout is the circuit breaker; no shared breaker needed at this scale.

### 12.2 Job orchestration

One outbox (`aesthete_jobs`), one claim pattern (`FOR UPDATE SKIP LOCKED` via `claim_aesthete_jobs`), cron-driven drains through the existing `pg_cron → invoke_edge_function` bridge (00081: dual apikey+Bearer headers, 60 s pg_net timeout — **every batch must finish well inside 60 s; jobs are re-entrant, nothing relies on one long invocation**). Rejected: pgmq (not installed), per-kind tables (ops sprawl), per-row pg_net outbox (no external consumer; watermarks over append-only sources give replayability without delivery semantics to babysit).

| Job | Trigger | Batch | Idempotency | Failure |
|---|---|---|---|---|
| `embed_text` / `embed_fused` | product trigger + cron 1 min | 16 images (~5–10 s) | UPSERT keyed product_id + model version | backoff 1 m/5 m/25 m, max 5 → `failed`; per-image errors re-enqueued individually |
| `dna_draft` | product trigger (personal/studio commits + catalog promotion) + cron 2 min | 4 products, 2-way concurrency | `dedupe_key` on prompt_version; drafts never clobber designer-validated rows | same backoff; **spend guard parks the queue** at daily budget |
| `taste_refit` | `aesthete-nightly` 02:30 phase 1 | all designers (seconds) | full recompute → new snapshot version | log + self-heal next night |
| `house_draft` | nightly phase 2 (Phase 2) | full | new `house_taste` draft row; activation human | same |
| `stats_writer` | nightly phase 3 | full | overwrite recompute of `designer_teaching_stats.accuracy_score` (validation-consensus agreement) + `match_impact_count` (match_events citing products whose spectrums the designer taught) | same |
| `centroids + matview` | nightly phase 4 | `style_centroids` recompute + `REFRESH MATERIALIZED VIEW CONCURRENTLY product_behavior_stats` | by construction | same |
| `drift_audit` | Sun 04:00 | full | keyed (week, check) | PostHog alert on failure |
| `janitor` | daily | — | purge unclaimed anon > 90 d, rate rows > 1 d, stale snapshots | — |
| `reembed_migration` | manual: `SELECT enqueue_reembed('<model_version>')` | reuses embed kinds | `aesthete_model_version` makes mixed states detectable; scoring compares same-version vectors only | throttled by cron cadence |

### 12.3 Caching & performance

**Redis (256 MB, shared — be stingy):** cache ONLY ⌘K query-text embeddings (`sha1(model_version + query)` → 768×f16 ≈ 1.5 KB, TTL 7 d, ≤ 10 MB envelope). **Rejected:** rec-result caching (the old service's L1–L3) — at 10⁴ products the match RPC is < 100 ms of SQL and invalidation complexity exceeds benefit; Redis rate counters — eviction under a shared cap fails open; counters live in Postgres.

**Postgres materializes:** versioned taste/house rows (the version rows *are* the materialization), `style_centroids`, `product_behavior_stats`, per-style validated counts.

**Scale reality:** 10⁴ products × 3 KB × 2 vector columns + index ≈ tens of MB — the whole working set fits in `shared_buffers`. **Exact-scan scoring post-hard-filter is acceptable at MVP scale** (better recall, zero probe tuning); the ANN index is engaged behind one CTE and matters from ~5×10⁴ products.

**Latency budgets:** quiz submit → profile **p95 < 300 ms**; quiz → top-10 **p95 < 1.0 s end-to-end, < 250 ms in SQL**; ⌘K ask **p95 < 1.2 s** with vector (~30 ms embed + RPC), **< 400 ms** on FTS fallback; DNA draft async, p50 < 60 s capture→draft-in-queue; embed backfill 10⁴ images ≈ 50–90 min off-peak.

### 12.4 Observability

- **`match_events` is the substrate**: every match call logs one compact row (session/user refs, context, blend + versions, per-term contributions, exploration flags, latency). Full logging — no sampling at this scale. Triple duty: debugging, guardrail audits, Loop-4 ground truth. **Exception (product law): `source='engine_ask'` rows carry no query text.**
- **PostHog** (already in stack): client-side quiz funnel (`quiz_started/question_answered/quiz_completed/matches_viewed/match_saved`), match CTR by exploration flag; server-side edge-fn events (`embed_batch_done`, `dna_draft_done` w/ tokens+cost, `nightly_phase_done`, `guardrail_audit_result`).
- **Logflare**: structured JSON lines from all aesthete edge fns (existing pattern).
- **Dashboards** (§14.6): embedding coverage %, draft-confidence histogram, calibration MAE trend, explore-vs-exploit save-rate ratio, max designer share in θ_H, quiz p95.

### 12.5 Security

- RLS boundaries per §5.6; DEFINER RPCs pin `search_path` and filter layers internally.
- **Fix shipped in 00240:** `quiz_sessions` RLS is currently wide-open to anon+authenticated — restricted to owner/claimed reads; anon INSERT stays (waitlist pattern).
- **Anthropic API key**: edge-fn secret only (supabase secrets / Coolify env), read solely by `aesthete-dna-draft`; never in DB, client bundles, or logs; the spend ledger bounds the blast radius of a leak or a loop.
- **Taste vectors are designer IP**: raw vectors never leave PostgREST to any client role (redacting views); "Your Eye" renders derived spectrums + named biases; export is owner-initiated (`export_designer_taste` → full JSON: vectors, θ, biases, judgments, snapshots); `retire_designer_taste` excludes a departing designer from the next house recompute and tombstones profile versions (judgment hard-delete per contract terms). Both ship week 0 — cheap now, contractual later.
- Anon quiz abuse: §7.1 posture (Cloudflare wall, in-DB backstop, engagement-gated learning).

---

## 13. Guardrails (brief Part VIII → mechanisms)

| Guardrail | Mechanism | Where enforced | Audited |
|---|---|---|---|
| No runaway house capture | 0.35 per-designer weight cap + 10% trimmed mean; consensus lands as *draft*; activation requires lead approval when drift > threshold | `compute_house_taste_draft` | weekly: max share alarm |
| Taste ≠ budget-shaming | **Structural**: no price/budget features in φ; budget enters scoring only as filter + T_budget; ω never scales taste | feature map + RPC shape (testable) | weekly: craftsmanship/quality distribution served across budget tiers → `aesthete_audit` |
| Against the filter bubble | exploration floor in the RPC (`GREATEST(1, floor(ratio·limit))`); novelty-weighted stretch slots; client dial control | `get_aesthete_matches` | weekly: served exploration share ≥ floor; stretch-acceptance band |
| Human in the loop | contraindications are hard filters; house activation is human; drafts never write canonical rows; high-stakes = designer surfaces only | schema + RPC shape | — |
| Explainable by default | whys computed in the scoring query — no unexplained score path; "Your Eye" inspectable; blend + versions in every payload | §10.6 | why-coverage metric |
| Consent & portability | `export_designer_taste` / `retire_designer_taste` ship in W0; snapshots append-only | §12.5 | — |

---

## 14. Evaluation framework

1. **G1 — spectrum golden set:** 150 products independently scored by 2–3 designers (superset of the calibration anchors). *Measure the human ceiling first:* Krippendorff's α (interval) per dimension; any dimension with α < 0.6 gets its definition/anchors fixed before any model is blamed. Model bar: MAE ≤ 0.20/dimension vs designer mean; archetype top-1 ≥ 70%, top-2 ≥ 90%.
2. **G2 — neighborhood golden set:** 30 seed products; designers mark the "closest 5 of 20." Embedding kNN precision@5 ≥ 0.5. **Category-leak metric:** fraction of unconstrained top-10 neighbors sharing style archetype vs merely category — tracked before/after the Phase-2 style projection; the projection ships only if it improves leak without hurting precision.
3. **Quiz→rec persona panel:** 4 fixed personas (each designer channels a real past client) + free-form runs. Per top-10: love ≥ 3, kill ≤ 2, zero category errors, zero budget violations, ≥ 1 "wouldn't have thought of it, but yes." Every card's why judged coherent.
4. **Taste-vector sanity ("does Ana's vector predict Ana"):** chronological backtest — fit θ on judgments < t, score judgments > t. Bars: pairwise accuracy ≥ 0.65 @ 100 judgments, ≥ 0.72 @ 300 (chance = 0.5). **Ablation gate:** θ_D must beat θ_H on the designer's own held-out judgments by ≥ 5 points or their dial's high stop stays locked. This number *is* ρ_D — eval and product share one metric.
5. **Offline replay:** `match_events` (scores + contributions + exploration flags) replayed under candidate weight vectors; NDCG against realized saves/purchases + rank-overlap diff. Weight changes ship only on non-regressing replay + panel spot-check. No MLflow — a notebook and a table.
6. **Ops dashboards:** embedding coverage, draft-confidence histogram, calibration MAE trend, **explore-slot save-rate / exploit save-rate healthy band 0.4–0.8** (below = junk stretches; above = be bolder), max designer share in θ_H ≤ 0.35, quiz p95.
7. **The week-6 demo bar:** quiz → top-10 with (i) zero category errors and zero budget violations across the 4 personas; (ii) ≥ 6/10 panel-endorsed; (iii) a plain-language why on every card passing copy law; (iv) p95 quiz→results < 2 s on the all-SQL path; (v) the dial visibly changes the set (house vs one seeded designer portfolio vector).

Eval harness lives at `scripts/aesthete-eval/`; the labeled sets are built as a by-product of the week-4 validation sprint.

---

## 15. Rollout

### 15.1 Weeks 0–6 (week-level)

| Week | Build | Reuse | Exit criterion |
|---|---|---|---|
| **0** | Migrations 00236–00241 (§15.4); delete `services/aesthete-engine`; scaffold `aesthete-inference` (/healthz, /embed/text); **verify prod pgvector** (`SELECT extversion FROM pg_extension WHERE extname='vector'`) | migration conventions, `supabase db reset` | reset green; prod extversion known; export/retire RPCs exist |
| **1** | /embed/image + int8 ONNX bake; Coolify internal deploy; `aesthete-embed-worker` + claim RPCs + product triggers; backfill seed vectors | `_shared/` edge helpers, 00081 invoke pattern | seed products have vectors; cron drain visible in Logflare |
| **2** | `_compute_quiz_profile()`; `submit_style_quiz` + `claim_quiz_session`; `quiz_option_loadings` seed; `packages/aesthete-quiz` core + wire client; quiz SQL smoke | 00067 quiz logic, waitlist anon pattern | anon curl → full profile JSON |
| **3** | `get_aesthete_matches` v1 (filters, spectrum, cosine, budget bell, exploration floor, whys, `match_events`); `get_recommendations` shim | spectrum schema, three-layer RLS | deterministic seed test asserts ranking + whys; iOS contract test green |
| **4** | `aesthete-dna-draft` (Claude structured output + spend ledger); teaching-UI prefill from drafts; **designer validation sprint on a curated 300–500 demo set** | teaching_queue trigger, teaching sliders | ≥ 300 validated products with spectrums + vectors |
| **5** | client-portal quiz embed + results page with whys; wire-contract doc handed to marketing repo; **house v0 (House Hundred + calibration session)**; dial plumbing (default house) | client-portal shell, design system | quiz→results in client-portal staging |
| **6** | **DEMO: quiz → top 10 on real seed data.** Hardening: rate caps, PostHog funnel, Logflare dashboard, load sanity | — | §14.7 bar met |

### 15.2 Weeks 7–22

- **7–10:** side-by-side judgments UI (`submit_taste_judgment`, probe injection); portfolio ingestion → centroid seed; "Your Eye" v1 (centroid + declared biases + confidence map); nightly stats writers + behavioral matview. *Completes the brief's MVP ⭐ list.*
- **11–14:** learned taste (nightly BT refit + preview); confidence-scaled dial live; **⌘K/EngineResults vector upgrade via `aesthete-ask`** — deliberately *after* validated vectors exist, so the Engine's first designer-facing impression isn't garbage; behavioral priors term.
- **15–18:** house consensus + damping + lead curation UI; client↔designer alignment surfaces; full `drift_audit` suite; Typesense seam validated (interface test only, no deploy).
- **19–22:** eval-harness gating; marketing-site quiz GA; iOS parity soak (shim flag flip + contract soak); docs; residual dead-code cleanup (hardcoded style lists → DB taxonomy).

Integration order is dependency-driven: iOS shim (W3, zero client change) → teaching prefill (W4) → client-portal quiz (W5) → judgments (W7–8) → ⌘K upgrade (W11–12).

### 15.3 Definition of done (MVP cut)

Anon + authed quiz green on both hosts; match RPC with whys/exploration/budget-bell; ≥ 500 designer-validated products carrying vectors + spectrums; iOS `process_style_quiz`/`get_recommendations` byte-compatible and soaked; teaching prefill live; taste tables + export/retire shipped; dial live and defaulted house-leaning; all SQL suites pass on fresh reset; inference-down drill passes (quiz unaffected, ⌘K degrades to FTS); guardrail audits running green two consecutive weeks.

### 15.4 Migration sequence & backward compatibility

| # | Contents |
|---|---|
| **00236** `aesthete_space` | pgvector version assert; `aesthete_vector` re-type → 768 (views dropped/recreated **verbatim**); `style_caption`, `aesthete_vector_at`, `aesthete_model_version`; vec helpers; HNSW-else-ivfflat index block |
| **00237** `product_dna` | `product_dna`, `product_dna_drafts`, `dna_vocab` (+seed), spectrum additive columns, RLS |
| **00238** `aesthete_jobs` | queue + claim RPCs, product/DNA triggers, embed/draft crons, catalog backfill enqueue |
| **00239** `taste_foundation` | all §5.4 tables + RLS; export/retire + house curation RPCs; house v0 seed slot; `style_centroids` |
| **00240** `client_style_profiles` | table + `submit_style_quiz` + `claim_quiz_session` + `quiz_option_loadings` seed + rate limits + janitor + **quiz_sessions RLS fix** |
| **00241** `match_rpc` | `match_weight_profiles` (+v1 seed), `why_phrases` (+seed), `get_aesthete_matches`, `aesthete_search`, `get_recommendations` shim |
| **00242** `behavior_stats` | matview + nightly refresh cron |
| **00243** `quiz_bridge` | `process_style_quiz` internals → `_compute_quiz_profile()` (signature + GRANT frozen) |

**Guarantees:** the five 00008 similarity RPCs are untouched (and newly functional once `embedding` populates); `v_aesthete_*_input` names/columns identical; `process_style_quiz`/`get_recommendations` signatures frozen; `user_style_signals` still written on claim (iOS reads live). Phase-2 migrations (relationships, learned-taste crons, `match_designers_for_client`, `designer_clients` margin-note columns) are numbered when they ship.

---

## 16. Reconciliation: the fate of every existing artifact

| Artifact | Fate |
|---|---|
| `services/aesthete-engine` (71 files, Dec 2025, never deployed) | **Deleted in week 0** (git history is the archive). Salvaged as ideas: 8-signal weight priors → `match_weight_profiles` v1; MMR λ=0.8 → §10.3; rule-predicate jsonb + scope precedence → `taste_rules`; size-utilization curve → T_context; `score_breakdown` shape → the why payload. Its CLIP 512/768 dim bug, mock profiles, stubbed OpenSearch, MLflow, and compose stack die with it. |
| `products.aesthete_vector vector(1536)` | Re-typed to `vector(768)` (empty column, free change); becomes the canonical fused style vector |
| `products.embedding vector(768)` + 00008 RPCs | Kept and **finally populated** (text embedding); `search_products_semantic` etc. come alive for free |
| `use-embeddings.ts` + phantom `/api/products/[id]/embed`, `/api/embeddings` routes | **Deleted** (dead since 00007); replaced by the jobs pipeline |
| `/api/search/similar` same-category heuristic | Re-pointed at `find_similar_products` (00008) once embeddings populate |
| `EngineResults` / `useCrossLayerSearch` (⌘K, keyword-only) | Upgraded to `aesthete-ask` in weeks 11–12 — after vectors are validated; FTS fallback preserves today's behavior |
| `process_style_quiz` / `get_recommendations` (00067) | Signatures frozen; bodies become shims over engine internals; iOS ships nothing |
| `product_style_spectrum` + `spectrum_calibration_products` | Canonical six-spectrum store, finally populated (calibration anchors seeded W4); additive source/confidence columns |
| Teaching tables + UI (00005, `/portal/teaching/*`) | Reused as-is; deep-analysis sliders prefill from drafts; validation upgrades confidence; `designer_teaching_stats.accuracy_score`/`match_impact_count` **get writers** (nightly) |
| `product_client_matches` (archetype-based matching) | Retained as designer-taught appeal data feeding teaching surfaces; superseded as *the* matcher by vector+spectrum scoring; revisit in Phase 3 |
| `quiz_sessions` / `client_profiles` / `user_style_signals` | Reused: quiz_sessions gets the RLS fix + session keying; client_profiles written on claim; user_style_signals bridged for iOS, never extended |
| `v_aesthete_*_input` views (00157) | Recreated verbatim around the re-type; remain the layer-scoped read contract (stale 1536 comment fixed) |
| Hardcoded style lists in `teaching/product/[id]` | Replaced by the `styles` taxonomy (weeks 19–22 cleanup) |
| `companion-*` edge fns | Untouched — the companion chat remains a help surface; the Engine's product answers flow through `aesthete-ask` (I30 ruling: companion persists, engine asks don't) |
| `services/media` renditions pipeline | Not on the capture path today; Phase-2 option for image normalization before embedding — not a dependency |
| Stale docs (CLAUDE.md "backend-infra"/"11 edge fns"/"1536-dim"; supabase/CLAUDE.md "pgvector 1536"; 00157 header comment) | Corrected in the week-0 PR |
| Brief's referenced internal docs (`02-product/…`, `04-api/…`) | Do not exist in this repo; this document is now the canonical engineering reference |

---

## 17. Risk register

| # | Risk | Mitigation |
|---|---|---|
| 1 | Prod pgvector version unknown (HNSW/`sum(vector)` uncertain) | W0 extversion check; design needs only ≥ 0.5.0; exact scan viable at MVP scale; image bump is scheduled maintenance off the critical path |
| 2 | Single-host contention (embeds + Claude drafts + prod DB + everything else) | hard container limits (2 CPU/2 GB), cron-throttled batches, off-peak backfills, 429 backpressure from the worker |
| 3 | CPU embed throughput on re-embeds (model bump × 10⁵ images) | one designated primary style image per product where possible; int8 ONNX; `aesthete_model_version` enables gradual migration with mixed-state detection |
| 4 | Claude cost runaway (bulk capture auto-enqueues drafts) | daily spend ledger + budget guard parks the queue; ≤ 1092 px images; prompt caching; Batches API for backfill; cost telemetry |
| 5 | RLS leak via DEFINER RPCs / views (`commission_rate` on the catalog input view) | RPCs pin search_path + filter layers internally; dedicated RLS test suite; W0 grant audit |
| 6 | Cold-start quality kills the week-6 demo | W4 human validation sprint on a curated 300–500 set; demo serves validated products; drafts accelerate but never bypass designers |
| 7 | Nomic pair underperforms on *aesthetic* (vs semantic) similarity | spectrums carry the interpretable half of the score (vector is one term, not the backbone); eval gates weight shifts; Phase-2 style projection is the planned correction |
| 8 | Anon quiz abuse / junk sessions | Cloudflare wall + in-DB caps; engagement-gated learning; Turnstile as a one-day retrofit |
| 9 | pg_net 60 s window kills long jobs | all jobs re-entrant small batches; queue drains on cadence; no single long invocation anywhere |
| 10 | iOS semantic drift from the `get_recommendations` reimplementation | frozen signature + contract test (shape, 0–100 scaling, ordering sanity); shim behind a flag with parity soak in weeks 19–22 |
| 11 | Six-spectrum inter-rater reliability too low to learn from | G1 measures Krippendorff's α *first*; weak dimensions get definition/anchor fixes before any model work depends on them |
| 12 | House Hundred curation stalls (lead bandwidth) | the calibration session is 1 hour + an existing-collection pick; falls back to validated-catalog centroid with hand-set spectrums |

---

## 18. API reference (appendix)

### SQL RPCs (PostgREST `/rest/v1/rpc/…`)

| Function | Grant | Purpose |
|---|---|---|
| `submit_style_quiz(p_session_key uuid, p_answers jsonb, p_timings jsonb, p_source text, p_attribution jsonb) → jsonb` | anon, authenticated | Quiz v2 submit; returns profile (§7.1) |
| `claim_quiz_session(p_session_key uuid) → jsonb` | authenticated | Bind anon session on signup; bridge iOS signals |
| `get_aesthete_matches(p_session_key, p_designer_id, p_w, p_category, p_room_id, p_layer, p_limit, p_offset, p_explore_ratio, p_weights_profile) → TABLE(product_id, rank, score, confidence, is_exploration, why jsonb)` | anon, authenticated | The match (§10) |
| `aesthete_search(p_query text, p_filters jsonb) → TABLE(...)` | authenticated | Keyword/facet entry — the Typesense seam |
| `process_style_quiz(quiz_answers jsonb, timings jsonb) → jsonb` | authenticated | **Frozen** iOS contract; delegates to `_compute_quiz_profile()` |
| `get_recommendations(p_room_id, p_category, p_limit, p_offset) → TABLE(...)` | anon, authenticated | **Frozen** iOS contract; shim over `get_aesthete_matches` |
| `submit_taste_judgment(p_pair jsonb, p_choice text, p_context text, p_client_profile_id uuid, p_latency_ms int) → jsonb` | authenticated | Append pairwise judgment (+ probe injection server-side) |
| `submit_taste_correction(p_subject text, p_product_id uuid, p_replacement_product_id uuid, p_client_profile_id uuid, p_direction jsonb, p_free_text text, p_surface text) → jsonb` | authenticated | Append directional correction |
| `update_my_biases(p_overrides jsonb) → jsonb` | authenticated | Bias view/override layer (never touches θ) |
| `export_designer_taste(p_designer_id uuid) → jsonb` / `retire_designer_taste(p_designer_id uuid) → void` | owner/admin | Portability + departure guardrails |
| `compute_house_taste_draft() → uuid` / `activate_house_taste(p_version int) → void` | lead | House versioning + curation |
| `claim_aesthete_jobs(p_kind text, p_batch int)` / `complete_aesthete_job(p_id bigint, p_status text, p_error text)` | service-role | Queue mechanics |
| `match_designers_for_client(p_session_key uuid) → TABLE(designer_id, similarity, confidence)` | authenticated | Phase 2: client↔designer |

### Edge functions (`/functions/v1/…`)

| Function | Auth | Trigger |
|---|---|---|
| `aesthete-embed-worker` | service-role (cron) | pg_cron 1 min — drain embed jobs → inference worker → upsert vectors |
| `aesthete-dna-draft` | service-role (cron) | pg_cron 2 min — drain draft jobs → Claude → `product_dna_drafts` |
| `aesthete-nightly` | service-role (cron) | 02:30 — taste refit, house draft, stats writers, centroids/matview |
| `aesthete-drift-audit` | service-role (cron) | weekly — guardrail audits → `aesthete_audit` + PostHog |
| `aesthete-ask` | caller JWT | ⌘K / librarian bar — embed ask (1.5 s timeout → FTS), match, respond; never persists ask text |

### Inference worker (internal network only)

```
POST /embed/text   { inputs: [{id, text, kind: 'document'|'query'}] }
POST /embed/image  { inputs: [{id, url}] }                      # batch ≤ 16
  → { model_version, vectors: [{id, dim: 768, v: [...]}], errors: [{id, reason}] }
GET  /healthz      → { status, model_version, text_dim, image_dim, warmed }
Auth: Bearer $INFERENCE_TOKEN · 429 past concurrency 8 (callers re-enqueue)
```

---

*The Aesthete Engine, built where Patina lives: taste as data, learning as append-only history, matching as one honest query — and every designer action doing double duty, exactly as promised.*


