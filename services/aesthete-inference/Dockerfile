# aesthete-inference — multi-stage build (design §12.1).
#
# Stage 1 downloads the published fp32 ONNX exports of the nomic v1.5 pair at
# pinned revisions and int8-quantizes them (see scripts/export_models.py for
# the full lineage). Stage 2 is a slim runtime with the weights baked into the
# image — atomic deploy/rollback; model_version travels with the container.
#
# Container sizing:                   memory: 2 GB   cpu: 2
# Runtime env (required):              INFERENCE_TOKEN
#
#   docker build -t aesthete-inference services/aesthete-inference
#   docker run --rm -p 8000:8000 -e INFERENCE_TOKEN=… \
#     --memory 2g --cpus 2.0 aesthete-inference

# ── stage 1: export + quantize ────────────────────────────────────────────────
FROM python:3.12-slim AS export

WORKDIR /export
COPY requirements-export.txt .
RUN pip install --no-cache-dir -r requirements-export.txt

COPY scripts/export_models.py scripts/
RUN python scripts/export_models.py --out /models

# ── stage 2: runtime ──────────────────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /srv
COPY requirements.txt .
# ⚠ Room View (R107): usd-core adds ~220 MB unpacked (~35 MB wheel) to the
# image for the USDZ→GLB archival lane; its import is lazy (app/usdz.py) so it
# never costs the embed path a millisecond, only image size + rare convert calls.
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ app/
COPY --from=export /models /models

ENV MODELS_DIR=/models \
    ORT_INTRA_OP_THREADS=2 \
    PYTHONUNBUFFERED=1

EXPOSE 8000

# start-period covers model load + warmup on a cold 2-cpu container
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 CMD \
  python -c "import urllib.request,json,sys; d=json.load(urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=4)); sys.exit(0 if d.get('status')=='ok' and d.get('warmed') else 1)"

CMD ["uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
