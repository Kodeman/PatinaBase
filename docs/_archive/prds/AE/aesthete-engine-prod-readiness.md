> [!WARNING]
> Historical only. This readiness snapshot is superseded by the Cloudflare roadmap and `infra/inference-worker/README.md`.

# Aesthete Engine — Production Readiness Report (go/no-go)

**For:** Kody (human deploy gate) · **From:** Agent 5B (prod prep) · **Date:** 2026-07-02
**Companion:** `docs/prds/AE/aesthete-engine-runbook.md` (5A — step-by-step commands; this doc is the decision, the runbook is the procedure)
**Build state:** local `main`, migrations 00239–00250, 5 edge fns, worker at `services/aesthete-inference/`. G4 green (delivery log 2026-07-02).

---

## RECOMMENDATION: **GO — conditional**

The engine is deploy-safe and degrades honestly at every missing dependency. **Deploy it.** Four operational conditions must be met at deploy time (none are code work; all are ops), and three named "blockers" are **not** deploy-blockers — the engine ships without them and lights up later.

**Required before/at deploy (must all be true):**
1. **LAN/SSH access to the prod box** — the immediate logistical blocker (see §2; SSH to `192.168.1.14` is currently timing out, same reason The Document's 00230/00231 are still undeployed).
2. **Migrations 00230–00250 apply clean** on prod (adds 21 migrations; 9 are non-AE — see §2).
3. **Inference worker service stood up** on Coolify and reachable from the `functions` container (§3) — the one genuinely new runtime piece and the single highest-uncertainty step (its image has never been built end-to-end).
4. **Cron→edge GUCs present + INFERENCE_URL/TOKEN wired** on the `functions` container (§4).

**NOT deploy-blockers (ship-and-degrade, verified in the delivery log):**
- `ANTHROPIC_API_KEY` unprovisioned → `aesthete-dna-draft` **parks** (`{parked:true, reason:'no_api_key'}`), never crashes. DNA drafts simply don't auto-fill; teaching/matching unaffected.
- House Hundred curation not done → house taste stays pre-consensus / neutral θ (the dial reads validated-catalog centroid). Matching still works.
- Real designer validation absent → learning loops proven on synthetic judgments; they activate on real data with zero code change.

---

## 1. Prod pgvector version (design risk #1 — the headline)

**FINDING: prod runs pgvector 0.7.0. Risk #1 is cleared by evidence.**

- Prod Postgres image is **`supabase/postgres:15.1.1.78`** (`infra/coolify/docker-compose.supabase-coolify.yml:3`).
- That image pins **`pgvector_release: "0.7.0"`** (supabase/postgres `ansible/vars.yml` at tag `15.1.1.78`, sha256 `1b5503a3…`).
- The `vector` extension on prod was `CREATE`d on this same fixed image (migrations 00001/00007/00152, all applied — prod is past them), so the **installed** version is the image's 0.7.0.

**0.7.0 satisfies every engine requirement:** ≥ 0.5.0 floor → HNSW available (introduced in 0.5.0), `sum(vector)` aggregate + `vector↔real[]` casts present. Migration 00239 will build the **HNSW** index (`idx_products_aesthete_hnsw`), not the ivfflat fallback.

**Direct verification (SSH unavailable to 5B — port 22 timed out, matching the known LAN-access issue).** Operator runs this one line during deploy to confirm:
```sql
SELECT extversion FROM pg_extension WHERE extname='vector';  -- expect 0.7.0
SHOW server_version;                                          -- expect 15.x
```
via `scripts/remote-db.sh psql` (SSH tunnel).

**Why the deploy is safe regardless of what that query returns** — 00239's exact behavior:
- **Modern pgvector (≥0.5.0, i.e. prod's 0.7.0):** version assert passes → HNSW index builds → done. This is the expected path.
- **Old pgvector (<0.5.0):** 00239 first runs a best-effort `ALTER EXTENSION vector UPDATE` (WARNs, not fails, if postgres lacks owner privilege), then a **hard numeric assert** `RAISE EXCEPTION 'requires pgvector >= 0.5.0'`. The exception aborts migration 00239 inside its transaction → **clean rollback, prod schema untouched, deploy fails fast**. It cannot produce a silently-broken state.
- The **HNSW-else-ivfflat** `DO` block (00239:194–204) only runs after the assert passes; it degrades HNSW→ivfflat if index creation fails for any other reason (e.g. build memory). Index type never blocks launch — at ≤50k products an exact scan is an acceptable degraded mode.

**One pre-check the operator should still run** (cheap insurance): 00239 re-types `products.aesthete_vector` from `vector(1536)`→`vector(768)` with `USING NULL`, which **discards any existing values** in that column. The column was added by 00152 for the never-deployed old service and should be empty on prod. Confirm before migrate:
```sql
SELECT count(*) FROM products WHERE aesthete_vector IS NOT NULL;  -- expect 0
```

---

## 2. Prod migration tip & the full gap

**FINDING: prod tip = 00229. A prod migrate applies 00230–00250 (21 migrations). 9 of them are NOT Aesthete.**

- **Prod is at 00229** — confirmed in `docs/design/the-document/the-document-IMPLEMENTATION-INDEX.md`: *"Prod is at 00229 — owes 00230–00231 + the proposal-nudge edge fn (blocked on LAN access to the prod box as of 2026-07-01)."* Corroborated by the gap-matrix (NAT-32 "NOT on prod (prod at 00229)") and MEMORY (The Piece deploy 2026-06-24 at 00229).
- **UNVERIFIED without DB access** — operator must confirm with `SELECT max(version) FROM supabase_migrations.schema_migrations;` before migrating.
- Migrations reach prod via **`scripts/remote-db.sh push`** (opens an SSH tunnel `localhost:54322 → box:5433`, runs `supabase db push --db-url …`). **This depends on LAN/SSH to `kody@192.168.1.14`, which is the current blocker** for both The Document's undeployed migrations and this program.

**Full 00230→tip gap a prod migrate will apply (they deploy together — you cannot ship AE without shipping these):**

| # | Migration | Workstream | Operator note |
|---|---|---|---|
| 00230 | `document_state_proposal_opens` | The Document (proposal watch P2) | additive |
| 00231 | `proposal_nudge` | The Document (proposal watch P3) | **also needs the `proposal-nudge` edge fn deployed** (not in the AE deploy script — deploy separately) |
| 00232 | `products_field_capture_origin` | iOS Field Capture | additive column |
| 00233 | `field_captures_inbox` | iOS Field Capture | additive table |
| 00234 | `capture_media_bucket` | iOS Field Capture | **creates a storage bucket** — verify bucket creation succeeds on self-hosted Storage |
| 00235 | `commit_field_capture_rpc` | iOS Field Capture | RPC |
| 00236 | `document_state_relationship_title` | The Document | additive |
| 00237 | `open_project_direct` | The Document | RPC |
| 00238 | `close_project` | The Document | RPC |
| 00239–00250 | Aesthete Engine block | **this program** | see §1, §4 |

**Operator flags:**
- **9 non-AE migrations ride along.** They are additive and independently safe, but the AE deploy is the vehicle that finally ships The Document's proposal-watch tail (00230/00231) and the entire iOS field-capture backend (00232–00235). Brief whoever owns those workstreams; smoke their surfaces too, not just the quiz.
- **00231 owes an edge fn** (`proposal-nudge`) that is *not* in `scripts/deploy-edge-functions.sh` — deploy it in the same edge-fn pass.
- **Re-check the tip at deploy time.** Concurrent programs consume migration numbers (The Document already forced the AE renumber once). Local main tops out at **00250** as of this report; 5A may add 00251. `ls supabase/migrations/ | tail` right before push.

---

## 3. Coolify inference-worker service (the one new runtime piece)

**FINDING: everything else is migrations + edge fns already on the tested path. Only the worker is net-new infrastructure, and its image has never been built end-to-end (Wave-1C Docker egress was blocked; deferred here by design).**

**What it is:** `services/aesthete-inference/` — a stateless FastAPI service, nomic-embed text+vision v1.5 as int8 ONNX, 768-d, CPU, **internal Docker network only**, Bearer-token auth. No DB access. Endpoints: `/embed/text`, `/embed/image`, `/fit/taste`, `/fit/taste/backtest`, `/healthz`.

**Build path:** multi-stage Dockerfile. **Stage 1 downloads ~1 GB of models from HuggingFace at build time** (pinned revisions) and int8-quantizes them; stage 2 bakes `/models` into a `python:3.12-slim` runtime (atomic deploy/rollback). Build on the **Coolify host** (it has registry + HF egress — it already pulls ghcr images). ⚠ **This is the highest-uncertainty step in the whole deploy** — the image build has been verified only *outside* Docker (full pytest incl. golden-cosine + a live uvicorn smoke). If the HF download fails on the host, fallbacks: build on any egress-capable machine and push to `ghcr.io/kodeman/aesthete-inference`, or bake models via a mounted volume. (Note: CI→GHCR portal pushes have been 403ing — prefer Coolify build-from-repo over the CI path.)

**Sizing / runtime (design §12.1, Dockerfile):** `mem 2g`, `cpus 2.0`, single uvicorn worker, `ORT_INTRA_OP_THREADS=2`. Healthcheck is baked into the Dockerfile (`/healthz` must report `status:ok` + `warmed:true`; `--start-period=90s` covers cold model load — **honor this; a shorter grace will flap the container**).

**Network — the load-bearing constraint.** The edge fns reach the worker by URL from the **`functions`** container, which is on Docker network **`es8w8g0c00og4gsgg0k8w8o8`** (the supabase-stack network; `docker-compose.supabase-coolify.yml:747`). The worker **must join that network** and be resolvable at a stable name so `INFERENCE_URL=http://aesthete-inference:8000` works. Do **not** expose it publicly (no domain) — Bearer token is defense-in-depth, but design says internal-only.

**Env (required):** `INFERENCE_TOKEN` (generate a strong secret; the worker *refuses to start* without it — `app/config.py`). Optional: `INFERENCE_MAX_CONCURRENCY=8`, `ORT_INTRA_OP_THREADS=2`, `IMAGE_FETCH_TIMEOUT_S`, `IMAGE_MAX_BYTES`. **Egress note:** `/embed/image` fetches product image URLs — on prod these are **Cloudflare R2**-backed; the worker container needs egress to reach them, or catalog image embeds land in `errors[]` (text embeds/caption fusion still proceed).

**Recommended shape — Coolify Dockerfile application (matches `infra/coolify/coolify-setup.sh` `build_pack:"dockerfile"` pattern):**

```
POST /api/v1/applications/public
  build_pack: "dockerfile"
  project_uuid: l4g8cswgosw8s80ck84so880        # from infra/coolify/.env.coolify
  server_uuid:  h84kc084skwkck40w0ow0o0c
  environment_name: production
  git_repository: Kodeman/PatinaBase   git_branch: main
  base_directory: /services/aesthete-inference
  dockerfile_location: /services/aesthete-inference/Dockerfile   # 'dockerfile_location' = PATH (MEMORY gotcha; 'dockerfile' = raw content)
  ports_exposes: "8000"
  # NO public domain — internal only
then:
  push_env  applications <uuid> INFERENCE_TOKEN <generated-secret>   # is_buildtime:false
  PATCH limits: memory 2g, cpus 2.0, healthcheck start-period 90s
  attach to predefined network es8w8g0c00og4gsgg0k8w8o8 with alias/name aesthete-inference
  deploy:  POST /api/v1/applications/<uuid>/restart   # (MEMORY: 'restart' is the deploy endpoint, not '/deploy')
```

**Equivalent compose snippet** (if slotted into the supabase-stack compose instead — cleanest for the network alias):
```yaml
  aesthete-inference:
    build:
      context: ../../services/aesthete-inference
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      INFERENCE_TOKEN: '${INFERENCE_TOKEN}'
      ORT_INTRA_OP_THREADS: '2'
    deploy:
      resources:
        limits: { cpus: '2.0', memory: 2g }
    networks:
      es8w8g0c00og4gsgg0k8w8o8:
        aliases: [aesthete-inference]
    # healthcheck inherited from the Dockerfile
```

---

## 4. Edge functions + secrets + cron GUC checklist

**Five aesthete edge fns**, all already registered JWT-protected in `scripts/deploy-edge-functions.sh` (deploy via `./scripts/deploy-edge-functions.sh aesthete`, or the whole script):

| Edge fn | Trigger | Needs |
|---|---|---|
| `aesthete-embed-worker` | cron every 1 min (00241) | `INFERENCE_URL`, `INFERENCE_TOKEN` |
| `aesthete-dna-draft` | cron every 2 min (00241) | `ANTHROPIC_API_KEY` (absent → **parks gracefully**) |
| `aesthete-nightly` | cron 02:30 (00248) | `INFERENCE_URL`, `INFERENCE_TOKEN` (absent → watermark-only, no refit) |
| `aesthete-drift-audit` | cron Sun 04:00 (00250) | `POSTHOG_KEY` optional (absent → log-only) |
| `aesthete-ask` | caller JWT (⌘K/librarian) | `INFERENCE_URL`, `INFERENCE_TOKEN` (absent → straight to FTS, "the Engine is resting") |

**Secrets to set on the `functions` container** (self-hosted: edge-runtime exposes all container env to Deno; set via Coolify env → renders to the stack `.env`; the container already does `env_file: .env`):

| Var the fns read | Status on prod today | Action |
|---|---|---|
| `INFERENCE_URL` | **missing** | set `http://aesthete-inference:8000` |
| `INFERENCE_TOKEN` | **missing** | set = the worker's token |
| `ANTHROPIC_API_KEY` | **NAME MISMATCH** — container has `CLAUDE_API_KEY`, the fn reads `ANTHROPIC_API_KEY` | provision the key **under `ANTHROPIC_API_KEY`** (or add a mapping). Until then dna-draft parks — acceptable. |
| `POSTHOG_KEY` | **NAME MISMATCH** — container has `POSTHOG_API_KEY`, the fn reads `POSTHOG_KEY` | optional; set `POSTHOG_KEY` (phc_…) if you want AE server events. `POSTHOG_HOST` already present and correct. |

⚠ **MEMORY gotcha:** Coolify env PATCH does **not** re-render the on-disk `.env` — after setting these, SSH to the box and confirm the `.env` actually carries them (or force a stack re-render), then recreate the `functions` container. This exact drift silently broke email cron→edge for 14 days.

**Cron→edge GUCs (the email cautionary tale):** the 4 edge-firing crons (embed, dna-draft, nightly, drift-audit) call `public.invoke_edge_function`, which reads `app.settings.supabase_url` + `app.settings.service_role_key`. **These are already provisioned on prod** — the live email/notification/procurement crons use the same bridge — so aesthete inherits a working path. **Still verify** (keys rotate; a stale `service_role_key` GUC is exactly what broke email):
```sql
SELECT current_setting('app.settings.supabase_url', true),
       left(current_setting('app.settings.service_role_key', true), 12);
```
The pure-SQL crons (`aesthete-behavior-stats` 03:20, `aesthete-quiz-janitor` 03:45, `aesthete-house-portfolio` 03:15, `aesthete-jobs-janitor` /10 min) call local functions — no GUC, no edge, no worker dependency.

---

## 5. Deploy sequence · smoke · rollback

**Sequence (migrations before apps — plan §Wave 5):**
1. **Pre-checks** (SSH tunnel): confirm tip = 00229; `vector` extversion = 0.7.0; `aesthete_vector` all-NULL; GUCs set.
2. **Migrations:** `scripts/remote-db.sh push` → applies 00230–00250. Watch 00239 (HNSW build), 00234 (bucket create).
3. **Edge fns:** `./scripts/deploy-edge-functions.sh aesthete` (5 fns) **plus** `proposal-nudge` (rides 00231).
4. **Worker:** build + start on Coolify (§3); `curl` `/healthz` from inside the `functions` container → `status:ok, warmed:true`.
5. **Functions env:** set `INFERENCE_URL`/`INFERENCE_TOKEN` (+ `ANTHROPIC_API_KEY`/`POSTHOG_KEY` if provisioning); confirm `.env` re-rendered; recreate `functions` container.
6. **Portals:** deploy designer/client/admin via their GHCR pipeline (they read new RPCs/columns — must land after migrations). Build portals locally if CI 403s (MEMORY).
7. **Smoke** (§below).

**Prod smoke (the acceptance test):**
- **anon quiz → matches** (the money path, pure SQL, no worker/key needed): `submit_style_quiz` over PostgREST as anon → six-spectrum profile; `get_aesthete_matches` → top-10 with `why` payloads; latency within §12.3 budget.
- Worker health green from the functions network; within ~2 min the embed cron drains a batch and seed/catalog products gain `aesthete_vector` (`SELECT count(*) FROM products WHERE aesthete_vector IS NOT NULL`).
- ⌘K/librarian returns results (vector if worker up, FTS "resting" if not — both are pass).
- Drift-audit fn invokes clean (manual trigger) → rows in `aesthete_audit`.

**Rollback posture:**
- **Migrations are forward-only and additive** — no destructive change to existing app tables (the only re-type, `aesthete_vector` 1536→768, is on an empty column). Nothing pre-existing depends on the new objects, so **leaving the schema applied is harmless** even if you abort the launch.
- **To disable the engine without a DB rollback:** unschedule the 6 aesthete crons (`cron.unschedule('aesthete-embed'|'aesthete-dna-draft'|'aesthete-nightly'|'aesthete-behavior-stats'|'aesthete-quiz-janitor'|'aesthete-jobs-janitor'|'aesthete-drift-audit'|'aesthete-house-portfolio')`) and don't route users to `/quiz`/⌘K-vector. The worker can be stopped independently (embed jobs queue harmlessly).
- **Portals + worker roll back independently** via Coolify to the prior image/commit.
- **The non-AE migrations (00230–00238) are not reversible via this path either** — accept that shipping AE also ships them for good; they were merged-to-main and intended for prod.

---

## 6. Blockers summary (what Kody must decide / provide)

| Item | Deploy-blocker? | State |
|---|---|---|
| **LAN/SSH to the prod box** | **YES — logistical** | SSH to 192.168.1.14 timing out; blocks migrate + smoke. Get on the LAN / tunnel first. |
| **Migrations 00230–00250 apply clean** | **YES** | high confidence (additive; 00239 safe either way); verify at apply. |
| **Worker service stood up** | **YES** | image build unverified end-to-end — the one real risk; build on Coolify host. |
| **Cron GUCs + INFERENCE_URL/TOKEN wired** | **YES** | GUCs already live (email/procurement crons); INFERENCE_* are new; mind the env-name mismatches + .env re-render gotcha. |
| `ANTHROPIC_API_KEY` | no | dna-draft parks; provide under the correct var name whenever. |
| House Hundred curation | no | house stays neutral θ / validated-catalog centroid. |
| Real designer validation | no | learning proven on synthetic; activates on real data, no code change. |

**Bottom line: GO.** The quiz→matches money path is pure SQL and needs neither the worker, a Claude key, nor curated house taste. Everything unprovisioned degrades to a named, honest fallback (never an error, never "AI"). Stand up the worker, wire four env vars, apply the migrations (over a working SSH tunnel), and the engine is live; the Claude key, House Hundred, and real judgments each light up an additional capability afterward with zero further deploys.
