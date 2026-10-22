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

## Client plate lane (`POST /plates/ingest`, US-49)
The `client-plate-copy` edge function posts
`{projectId, requestId, sourceKind, sourceUrl, focal?, subjectBox?}` (focal and
subject box normalised 0–1) with `Authorization: Bearer <PLATE_INGEST_SECRET>`.
The Worker fetches the source once (10 s for the whole redirect chain, `image/*`
only, ≤ 20 MB), hashes it, and runs container op `plate_ingest` (`container/plates.mjs`
holds the crop geometry, `plate-job.mjs` the Sharp I/O): EXIF-orient, ground (`white` |
`drawing` | `scene`), dominant colour, a ≤ 800-char WebP LQIP, and every PLAN crop
the source meets (`wide`, `cover_phone`, `tall`, `wide32`, `pair`, `piece`; sheets and
boards also get an uncropped `sheet` / `board` plate) as AVIF q50 + WebP q72.

**Source origin policy.** Checked on the `sourceUrl` and again on every redirect
`Location` before it is fetched. Fetches use `redirect: 'manual'`, send only
`Accept: image/*`, and follow at most 3 redirects (a 4th is a 502).

| Target | Rule | Refusal |
| --- | --- | --- |
| any `sourceUrl` | `https:` only | 400 |
| any hop | `https:` only; no `user:pass@` | 403 |
| any kind whose initial URL origin equals `SUPABASE_STORAGE_ORIGIN` | private path: every hop must keep that origin | 403 |
| outside `maker` or `board` hotlink | public path: every hop must be a public host; never a literal IPv4/IPv6 address, a single-label name, `localhost`, `*.local`, `*.internal`, `*.workers.dev`, `patina.cloud` or `*.patina.cloud` | 403 |
| private-only kinds (`upload`, `concept`, `scan`, `sheet`, `installed`) | origin equals `SUPABASE_STORAGE_ORIGIN`; refused while that var is empty or not https | 403 |

Fetch provenance is selected from the initial URL, not its rendition role, and
kept through redirects. Storage URLs (including signed URLs forwarded by the
edge) retain the origin pin; the worker never adds credentials. Retailer and
board-cover hotlinks are open by design (no host allowlist). Source kind still
drives crop requirements unchanged.

**Deadline.** The Worker gives the container 25 s (the edge abandons the call at
30 s); past that it answers 504 and aborts the container request. The job carries
`budgetMs`, what is left of those 25 s less 1 s. The container runs one plate job at
a time (`container/plate-lane.mjs`), each in its own forked `plate-job.mjs` process;
a second job meanwhile gets `503 {"error":"busy"}`, which the Worker passes on as
503 `busy`. At the budget (counted from when the request arrives) or when the Worker
hangs up, the container SIGKILLs the job process and answers 504, and takes the next
job only once that process has exited. A result that lands after the budget is a 504.

Objects land in the **private** `PLATES` bucket:

```
plates/{projectId}/{sha256}/original.{format}
plates/{projectId}/{sha256}/{crop}-{width}.{avif|webp}
plates/{projectId}/{sha256}/crops.json   # written last; the response record + focal/subjectBox + sourceKinds
```

The response is `{sha256, width, height, format, ground, dominantHex, lqip,
originalKey, crops}` with `crops = {<crop>: {rect: [x, y, w, h] in source px,
widths}}`; errors are `{error}` with a 4xx/5xx status. Re-ingesting the same bytes
with the same focal/subject box and a source kind already in `sourceKinds` returns
the stored `crops.json` without reprocessing. A new source kind (say `board` after
`maker`) runs the container with `skip` = the crop keys already stored, so it encodes
only what that kind adds, and `crops.json` keeps the union. A new focal or subject
box reprocesses from scratch. Nothing in the bucket is public; the client portal
serves plates through its own `PLATES` read binding after a membership check.

- **Bucket**: `patina-plates` (prod) / `patina-plates-staging` are created by the
  US-49 Phase 1 deploy ticket (`wrangler r2 bucket create patina-plates`) before
  this Worker is deployed with the binding.
- **Secret**: `PLATE_INGEST_SECRET` is a Worker secret
  (`wrangler secret put PLATE_INGEST_SECRET`), never a `vars` entry; the same value
  is set on the `client-plate-copy` edge function. With it unset, every ingest is 401.
- **Var**: `SUPABASE_STORAGE_ORIGIN` (not a secret) is a `vars` literal in
  `wrangler.jsonc`, top level and `env.staging`, empty by default. Set it to the
  edge's `SUPABASE_URL` origin (`https://<project-ref>.supabase.co`) before the deploy
  that should accept private sources; `wrangler deploy` overwrites dashboard vars.

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
