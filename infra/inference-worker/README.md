# patina-inference-worker

Cloudflare Worker + Container hosting the **aesthete-inference** embedding
service (cloud migration **phase 3d**). Deployed:
`https://patina-inference-worker.<subdomain>.workers.dev`.

The service (`services/aesthete-inference/`, FastAPI + ONNX, nomic v1.5 int8,
768-d) is stateless — no DB, no Redis — so it moves cleanly to a Cloudflare
Container. The Worker routes all traffic to one warm instance (`getContainer(…,
'singleton')`); the model loads once at startup (~15–90 s cold) and `sleepAfter`
keeps it warm across the aesthete edge functions' bursty calls.

Routes (proxied unchanged to the container): `GET /healthz` (open),
`POST /embed/text`, `POST /embed/image`, `POST /fit/taste[/backtest]`
(all `Authorization: Bearer $INFERENCE_TOKEN`).

## Model export (before deploy)
The image copies models exported **natively on the host** — ONNX is
platform-independent, so this avoids running the int8 quantization under amd64
emulation:
```bash
cd services/aesthete-inference
python3 -m venv .venv && .venv/bin/pip install -r requirements-export.txt
.venv/bin/python scripts/export_models.py --out models   # ~1.5GB download → models/ (224MB, gitignored)
```
`services/aesthete-inference/Dockerfile.cf` copies `models/` in; the stock
`Dockerfile` (which quantizes in-image) is unchanged for other deploy targets.

## Deploy
```bash
cd infra/inference-worker && npm install
wrangler secret put INFERENCE_TOKEN --name patina-inference-worker   # generate: openssl rand -hex 32
wrangler deploy    # builds services/aesthete-inference/Dockerfile.cf (standard-3: 2 vCPU / 8 GiB)
```
See `infra/media-worker/README.md` for the macOS Docker-Desktop `DOCKER_CONFIG`
credential-helper workaround (applies to any `wrangler deploy` that builds a
container).

## Verify
```bash
WK=https://patina-inference-worker.<subdomain>.workers.dev
curl $WK/healthz                          # {"status":"ok",...,"warmed":true}
curl -X POST $WK/embed/text -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"inputs":[{"id":"a","text":"walnut lounge chair","kind":"document"}]}'   # → 768-d normalized vector
```

## Integration (edge functions)
The aesthete edge functions (`aesthete-embed-worker`, `aesthete-nightly`) call
this via `INFERENCE_URL` + `INFERENCE_TOKEN`. When they move to Supabase Cloud
(phase 2), set `INFERENCE_URL` = this Worker's URL and `INFERENCE_TOKEN` = the
secret above as Function secrets. The current self-hosted value
(`http://host.docker.internal:8000`) is replaced by the Worker URL.
