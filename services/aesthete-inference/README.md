# aesthete-inference

The Aesthete Engine's embedding worker (system design §12.1, §18): one tiny
FastAPI service running **nomic-embed-text-v1.5 + nomic-embed-vision-v1.5**
(768-d, aligned, Apache-2.0) as **int8 ONNX** on CPU. Stateless, no DB access,
internal Docker network only.

> Deliberately **not** a pnpm workspace member — Python services are
> pnpm/turbo-invisible by design; Docker is the build path.

## API

```
POST /embed/text          {"inputs": [{"id": "…", "text": "…", "kind": "document" | "query"}]}
POST /embed/image         {"inputs": [{"id": "…", "url": "https://…"}]}
POST /fit/taste           BT MAP taste refit (design §8.2 — Wave 4A)
POST /fit/taste/backtest  chronological split eval (design §8.3/§14.4)
GET  /healthz  →   {"status", "model_version", "text_dim": 768, "image_dim": 768, "warmed": true}
```

- **Auth:** `/embed/*` and `/fit/*` require `Authorization: Bearer $INFERENCE_TOKEN`;
  `/healthz` is open. The worker **refuses to start** if `INFERENCE_TOKEN` is
  unset.
- **`/fit/taste` (stateless, model-free):** request carries
  `{designer: {theta_prior: [94 floats]|null}, judgments: [{phi_a, phi_b,
  choice: a|b|neither|both, weight, age_days}], hyper: {tau_days: 180,
  lambda0: 0.5, lambda_n0: 30}}` → `{theta, converged, n_effective,
  train_accuracy, n_used, n_skipped, n_iter, lambda_used, dim}`. φ features
  are computed DB-side by 00244's `_aesthete_phi` (the 94-d ordering contract
  lives in SQL); a `null` prior means the zero vector. `neither`/`both` rows
  carry no pairwise preference and are skipped (counted in `n_skipped`).
  Solved by damped Newton on the convex §8.2 objective — pure numpy, no new
  dependencies. `/fit/taste/backtest` adds `test_fraction` (default 0.3),
  splits chronologically by `age_days`, and returns
  `{pairwise_accuracy, auc, prior_accuracy, prior_auc, n_train, n_test}` —
  `prior_accuracy` is θ_H scored on the same held-out block, so the §14.4
  dial-unlock comparison (θ_D ≥ θ_H + 5 pts) is one call.
- **Batch:** ≤ 16 inputs per request; more (or zero) is a `400`.
- **Response (both embed routes):**
  `{"model_version": "…", "vectors": [{"id", "dim": 768, "v": [768 floats]}], "errors": [{"id", "reason"}]}`
  — per-item error isolation: one bad URL / empty text lands in `errors[]`
  and never fails the batch. All vectors are **L2-normalized**.
- **Backpressure:** an in-process gate admits **8** concurrent embed requests;
  the 9th gets `429` + `Retry-After: 1`. Callers (edge fns) back off and
  re-enqueue — do not retry-loop hot.

### Task prefixes are applied worker-side — never send them

nomic v1.5 requires task prefixes and mixed prefixes silently degrade
similarity (§4.2). The mapping lives in exactly one place
(`app/main.py::TASK_PREFIXES`) and is derived from `kind`:

| caller sends | worker embeds |
|---|---|
| `kind: "document"` (products, portfolio, captions) | `search_document: {text}` |
| `kind: "query"` (quiz-profile text, ⌘K asks) | `search_query: {text}` |

Callers send **raw text only**. If you find yourself typing
`search_document:` anywhere outside this service, stop.

## Models & export lineage

Both HuggingFace repos publish fp32 ONNX exports; we consume those at
**pinned revisions** and apply int8 *dynamic* quantization ourselves
(onnxruntime `quantize_dynamic`, `QInt8` weights) so quantization parameters
are pinned in this repo rather than inherited from an unversioned upstream
`model_quantized.onnx`:

| tower | source | revision |
|---|---|---|
| text | `nomic-ai/nomic-embed-text-v1.5` → `onnx/model.onnx` | `e9b6763023c676ca8431644204f50c2b100d9aab` |
| vision | `nomic-ai/nomic-embed-vision-v1.5` → `onnx/model.onnx` | `e3a725bce72db07ca4adb1d83da08903f3ee02f8` |

`models/manifest.json` (written by the export) records revisions, sha256 of
source + quantized files, quantization params, and onnxruntime version.
`model_version` (currently **`nomic-v1.5-onnx-int8-r1`**) is surfaced by
`/healthz` and every embed response; bump the `-rN` suffix in
`scripts/export_models.py` whenever any of the above changes, then run
`make export && make golden` and commit the regenerated golden vectors.

Pooling recipes (from the model cards, in numpy):

- **text:** mean-pool over attention mask → `layer_norm` → L2 (the layer_norm
  is the v1.5 Matryoshka recipe — load-bearing, do not remove)
- **vision:** CLS token of `last_hidden_state` → L2; preprocessing follows the
  repo's `CLIPImageProcessor` config (bicubic resize → center-crop 224 →
  CLIP mean/std)

Text truncation defaults to 2048 tokens (`TEXT_MAX_TOKENS`) — the model's
trained context; a deliberate CPU latency guard.

**Batch-composition variance (int8 dynamic quantization):** activation scales
are derived per-tensor at runtime, so the same item embedded in different
batch compositions drifts slightly (cosine ≈ 0.9966 observed worst-case).
Harmless for retrieval; it's why the golden fixtures are defined as
single-item embeddings, and why byte-identical vectors across batchings must
not be assumed anywhere downstream.

## Run

```bash
make test      # pytest (bootstraps .venv; golden tests auto-skip until models exist)
make export    # download + quantize both models into models/ (~1 GB download, once)
make test      # now includes the golden-cosine regression against real models
make serve     # INFERENCE_TOKEN=dev-token make serve → http://127.0.0.1:8000
make bench     # rough p50 latency loop
make golden    # regenerate tests/fixtures/golden_vectors.json (model bumps only)
```

`scripts/aesthete-gate.sh worker` honors `make test`.

## Docker

```bash
docker build -t aesthete-inference services/aesthete-inference
docker run --rm -p 8000:8000 -e INFERENCE_TOKEN=… --memory 2g --cpus 2.0 aesthete-inference
```

Multi-stage: stage 1 re-runs the export (network required at build time);
stage 2 is `python:3.12-slim` + baked `/models` — atomic deploy/rollback.
Deploy sizing per §12.1: **mem 2g / cpus 2.0**, single uvicorn worker,
onnxruntime intra-op threads = 2.

> **⚠ Build verification deferred to Wave 5B (environment-blocked, 2026-07-01).**
> The Wave-1C dev machine's Docker Desktop VM lost all registry egress while
> the host network stayed healthy, so the image build could not be verified
> there (conductor independently reproduced; ruled network-side, not this
> Dockerfile). Evidence:
>
> - `docker build` failed on **both** the `patina-builder` (docker-container)
>   and `desktop-linux` builders at `FROM python:3.12-slim` with
>   `ERROR: failed to build: failed to solve: DeadlineExceeded: context deadline exceeded`
>   (metadata load, step `#2`).
> - `docker pull python:3.12-slim` hung > 25 min with zero layer progress.
> - Registry probes both hung until killed: `docker pull alpine:3.21`
>   (Docker Hub) **and** `docker pull public.ecr.aws/docker/library/alpine:3.20`
>   (Amazon ECR Public) — daemon-wide, not Hub-specific.
> - Host-level `curl https://registry-1.docker.io/v2/` → `401` in 0.2 s and
>   `auth.docker.io/token` → `200` — the host's network path to Docker Hub is
>   fine; the fault is inside the Docker Desktop VM.
>
> Everything the image runs was verified outside Docker on the same machine:
> the full pytest suite (incl. golden-cosine against the real int8 models) and
> a live `uvicorn` smoke of `/healthz` + authed `/embed/text` + `/embed/image`
> with a real external URL. The active Cloudflare inference Worker build is
> documented in `infra/inference-worker/README.md`.

### Environment

| var | default | notes |
|---|---|---|
| `INFERENCE_TOKEN` | — | **required**; startup fails without it |
| `MODELS_DIR` | `./models` (image: `/models`) | |
| `INFERENCE_MAX_CONCURRENCY` | `8` | 429 past this depth |
| `ORT_INTRA_OP_THREADS` | `2` | match the cpu limit |
| `IMAGE_FETCH_TIMEOUT_S` | `10` | per-URL httpx timeout |
| `IMAGE_MAX_BYTES` | `15728640` (15 MB) | content-length + streamed-body cap |
| `TEXT_MAX_TOKENS` | `2048` | tokenizer truncation |

## Latency (measured)

Measured with `make bench` (25 iterations, single item per call, engine-level:
tokenize/preprocess + inference, no HTTP/fetch) on an Apple-Silicon dev
machine, int8, 2 intra-op threads:

| op | p50 | min | max |
|---|---|---|---|
| 1 short text (~25 tokens) | **8.7 ms** | 8.6 | 9.2 |
| 1 image (192×128 → 224²) | **66.3 ms** | 60.1 | 83.4 |

Design §4.2 planning numbers for the production 2-CPU container:
~30–80 ms/short text, ~200–350 ms/image; a 5k-product backfill ≈ 1.5–2 h
single-worker, run off-peak.

## Degradation ladder (when this worker is down — §12.1)

1. **Quiz → matches: unaffected** — that path is pure SQL by design.
2. **⌘K ask:** callers time out at 1.5 s → `aesthete_search()` FTS-only, UI
   shows *"the Engine is resting"* (copy law: never "error", never "AI").
3. **Embed / draft / portfolio jobs:** queue in `aesthete_jobs` and drain on
   recovery — nothing is lost. Per-request timeout is the circuit breaker; no
   shared breaker at this scale.

## Tests

- **API-shape suite** (always runs, model layer faked): response shapes, auth,
  batch limits, per-item error isolation, content-type/size sanity, prefix
  application, 429 backpressure, startup refusal without token.
- **Golden-cosine regression** (`-m golden`, auto-skips without `models/`):
  3 committed fixture images + 3 fixture texts embedded with the REAL int8
  models must stay within cosine ≥ 0.999 of the committed vectors in
  `tests/fixtures/golden_vectors.json`; plus a real-model check that
  document/query prefixes produce different vectors.
