# patina-media-worker

Cloudflare Queues consumer + Cloudflare Container that replaces the media
service's in-process BullMQ image worker (cloud migration **phase 3b**).
Deployed: `https://patina-media-worker.<subdomain>.workers.dev`.

```
NestJS media (producer)          Cloudflare
  addJob() ──POST /enqueue──▶  media-jobs queue
                                      │
                                      ▼
                         media-worker Worker (src/index.ts)
                           queue() consumer
                             RAW.get(rawKey)  ──bytes──▶  MediaProcessor container
                                                            (pure Sharp, container/)
                             PROCESSED.put(key) ◀─renditions─┘
                                      │
                            POST {COMPLETE_CALLBACK_URL}  → ledger update (NestJS)
```

The **Worker owns all R2 I/O** through its `RAW` / `PROCESSED` bindings; the
container is pure compute (no credentials) — it receives the raw image bytes in
the request body (+ the job spec in the `x-media-job` header) and returns the
renditions (base64) + metadata. This sidesteps the R2-jurisdiction gotcha below.

## What runs today
- Job types `IMAGE_PROCESS` / `IMAGE_TRANSFORM` / `METADATA_EXTRACT` → container ops
  `generate_renditions` (webp/avif/jpeg at 256–2048, mirrors `image-transform.service.ts`),
  `extract_metadata` (dimensions, blurhash, dominant colour), `optimize`.
- Other types ack without processing (3D/snapshot/virus are stubs in the source
  service; `media-bulk` is DB-heavy and stays in NestJS until phase 1).

## Deploy
```bash
npm install
# queues (one-time): media-jobs, media-jobs-dlq (also media-bulk, media-bulk-dlq)
wrangler queues create media-jobs && wrangler queues create media-jobs-dlq
wrangler deploy    # builds the container (linux/amd64) + deploys the Worker
```

### Deploy gotchas (macOS + Docker Desktop)
- Docker Desktop's `credsStore: desktop` credential helper can **hang** in a
  non-interactive shell, stalling the image build ("DeadlineExceeded" /
  "could not launch Docker CLI"). Work around it with a minimal `DOCKER_CONFIG`
  that drops `credsStore`/plugin hooks but symlinks `cli-plugins` (for buildx)
  and `contexts` (for the desktop-linux endpoint):
  ```bash
  mkdir -p /tmp/dcfg && python3 - <<'PY'
  import json; c=json.load(open("/Users/$USER/.docker/config.json"))
  [c.pop(k,None) for k in ("credsStore","credHelpers","plugins","features")]
  json.dump(c, open("/tmp/dcfg/config.json","w"))
  PY
  ln -sfn ~/.docker/cli-plugins /tmp/dcfg/cli-plugins
  ln -sfn ~/.docker/contexts    /tmp/dcfg/contexts
  DOCKER_CONFIG=/tmp/dcfg CLOUDFLARE_ACCOUNT_ID=<acct> wrangler deploy
  ```

## Test the pipeline
```bash
WK=https://patina-media-worker.<subdomain>.workers.dev
# put a raw image through the Worker's R2 binding (NOT `wrangler r2 object put`
# — that hits a different, jurisdiction-scoped bucket the binding cannot see):
curl -X PUT "$WK/debug-raw?key=images/test/original.jpg" --data-binary @some.jpg   # (debug route; add if needed)
curl -X POST "$WK/enqueue" -H 'content-type: application/json' \
  -H 'x-enqueue-secret: <MEDIA_WORKER_ENQUEUE_SECRET>' \
  -d '{"jobId":"t1","assetId":"test","type":"IMAGE_PROCESS","meta":{"rawKey":"images/test/original.jpg","operations":[{"type":"generate_renditions"},{"type":"extract_metadata"}]}}'
# renditions land at patina-processed/images/test/{256x256..1600x1600}.{webp,avif,jpeg}
```
`/enqueue` requires the same `MEDIA_WORKER_ENQUEUE_SECRET` configured on the
NestJS producer. Configure `COMPLETE_CALLBACK_URL` on this Worker and the same
`COMPLETE_CALLBACK_SECRET` on this Worker and the Media service Container. The
Worker signs `timestamp + "." + exact JSON body` and retries the queue message
for any callback network error or non-2xx response.

## R2 jurisdiction gotcha
`wrangler r2 object put/get/list` (CLI) and the Worker's R2 **binding** resolved
`patina-raw` to **different physical buckets** (same name, same account) — CLI
writes were invisible to the binding and vice-versa. The binding's view matches
what the production media service (S3 API) reads/writes, so it is authoritative.
Always seed/inspect objects the Worker touches via the binding or the S3 API,
never the `wrangler r2 object` CLI.

## Completion ownership

The processing Worker never connects to Strata. Job-state and `MediaAsset`
writes flow through the signed `COMPLETE_CALLBACK_URL` into the retained Media
Container, which uses its existing Prisma/Supavisor connection. Do not add a
Hyperdrive path for this contract.
