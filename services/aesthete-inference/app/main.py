"""aesthete-inference — the Aesthete Engine's embedding worker (design §12.1, §18).

FastAPI app exposing:

    POST /embed/text          {inputs: [{id, text, kind: 'document'|'query'}]}
    POST /embed/image         {inputs: [{id, url}]}          # batch ≤ 16
    POST /fit/taste           BT MAP taste refit (design §8.2 — Wave 4A)
    POST /fit/taste/backtest  chronological split eval (§8.3/§14.4)
    GET  /healthz             → {status, model_version, text_dim, image_dim, warmed}

Stateless, no DB access, internal Docker network only. /embed/* and /fit/*
require `Authorization: Bearer $INFERENCE_TOKEN`; /healthz is open.

Task prefixes are applied HERE, worker-side, from `kind` — callers never send
prefixes (mixed prefixes silently degrade similarity; §4.2).

Run with a factory so tests can inject fakes and so a missing INFERENCE_TOKEN
fails startup loudly:

    uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from starlette.concurrency import run_in_threadpool

from .config import Settings, settings_from_env
from .embedder import EmbedderLike
from .fit import FitInputError, backtest, fit_bt_map
from .images import ImageFetchError, fetch_image
from .photos import (
    PhotoDecodeError,
    PhotoFetchError,
    convert_heic_to_jpeg,
    fetch_photo,
    heif_available,
)
from .schemas import (
    EmbedResponse,
    Healthz,
    HeicConvertRequest,
    HeicConvertResponse,
    ImageEmbedRequest,
    ItemError,
    TasteBacktestRequest,
    TasteBacktestResponse,
    TasteFitRequest,
    TasteFitResponse,
    TextEmbedRequest,
    UsdzConvertRequest,
    Vector,
)
from .usdz import UsdConversionError, UsdFetchError, convert_usdz_to_glb, fetch_usdz, usd_available

# §4.2: task prefixes are load-bearing and live in exactly one place — here.
TASK_PREFIXES = {
    "document": "search_document: ",
    "query": "search_query: ",
}


class ConcurrencyGate:
    """Non-blocking admission gate (§12.1): depth `max_concurrency`, then 429.

    Single event loop → plain counter is race-free; the CPU-bound inference
    runs in the threadpool while the slot is held.
    """

    def __init__(self, depth: int) -> None:
        self.depth = depth
        self.active = 0

    def try_enter(self) -> bool:
        if self.active >= self.depth:
            return False
        self.active += 1
        return True

    def leave(self) -> None:
        self.active = max(0, self.active - 1)


def create_app(
    settings: Settings | None = None,
    *,
    embedder: EmbedderLike | None = None,
    http_transport: httpx.AsyncBaseTransport | None = None,
) -> FastAPI:
    settings = settings or settings_from_env()
    gate = ConcurrencyGate(settings.max_concurrency)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if app.state.embedder is None:
            from .embedder import OnnxEmbedder

            def _load() -> OnnxEmbedder:
                eng = OnnxEmbedder(
                    settings.models_dir,
                    intra_op_threads=settings.intra_op_threads,
                    text_max_tokens=settings.text_max_tokens,
                )
                eng.warmup()
                return eng

            app.state.embedder = await run_in_threadpool(_load)
        app.state.http_client = httpx.AsyncClient(transport=http_transport)
        try:
            yield
        finally:
            await app.state.http_client.aclose()

    app = FastAPI(title="aesthete-inference", lifespan=lifespan)
    app.state.embedder = embedder
    app.state.gate = gate
    app.state.settings = settings

    # ── auth (healthz stays open) ────────────────────────────────────────────

    def require_token(request: Request) -> None:
        header = request.headers.get("authorization", "")
        if header != f"Bearer {settings.inference_token}":
            raise HTTPException(status_code=401, detail="invalid or missing bearer token")

    # ── helpers ──────────────────────────────────────────────────────────────

    def check_batch(n: int) -> None:
        if n < 1 or n > settings.max_batch:
            raise HTTPException(
                status_code=400,
                detail=f"inputs must contain between 1 and {settings.max_batch} items (got {n})",
            )

    def enter_gate() -> None:
        if not gate.try_enter():
            raise HTTPException(
                status_code=429,
                detail=f"at capacity (depth {gate.depth}) — back off and re-enqueue",
                headers={"Retry-After": "1"},
            )

    # ── routes ───────────────────────────────────────────────────────────────

    @app.get("/healthz", response_model=Healthz)
    async def healthz() -> Healthz:
        eng: EmbedderLike | None = app.state.embedder
        return Healthz(
            status="ok" if eng is not None and eng.warmed else "loading",
            model_version=eng.model_version if eng is not None else "unloaded",
            text_dim=eng.text_dim if eng is not None else 768,
            image_dim=eng.image_dim if eng is not None else 768,
            warmed=bool(eng is not None and eng.warmed),
            usd_available=usd_available(),
            heif_available=heif_available(),
        )

    @app.post("/embed/text", response_model=EmbedResponse, dependencies=[Depends(require_token)])
    async def embed_text(req: TextEmbedRequest) -> EmbedResponse:
        check_batch(len(req.inputs))
        eng: EmbedderLike = app.state.embedder

        errors: list[ItemError] = []
        good: list[tuple[str, str]] = []  # (id, prefixed text)
        for item in req.inputs:
            if not item.text.strip():
                errors.append(ItemError(id=item.id, reason="empty text"))
                continue
            good.append((item.id, TASK_PREFIXES[item.kind] + item.text))

        vectors: list[Vector] = []
        if good:
            enter_gate()
            try:
                embs = await run_in_threadpool(eng.embed_texts, [t for _, t in good])
            finally:
                gate.leave()
            vectors = [
                Vector(id=item_id, dim=int(emb.shape[-1]), v=emb.tolist())
                for (item_id, _), emb in zip(good, embs)
            ]

        return EmbedResponse(
            model_version=eng.model_version, vectors=vectors, errors=errors
        )

    @app.post("/embed/image", response_model=EmbedResponse, dependencies=[Depends(require_token)])
    async def embed_image(req: ImageEmbedRequest) -> EmbedResponse:
        check_batch(len(req.inputs))
        eng: EmbedderLike = app.state.embedder
        client: httpx.AsyncClient = app.state.http_client

        enter_gate()
        try:
            # Per-item error isolation: one bad URL never fails the batch.
            fetches = await asyncio.gather(
                *(
                    fetch_image(
                        client,
                        item.url,
                        timeout_s=settings.image_fetch_timeout_s,
                        max_bytes=settings.image_max_bytes,
                    )
                    for item in req.inputs
                ),
                return_exceptions=True,
            )

            errors: list[ItemError] = []
            good_ids: list[str] = []
            good_images = []
            for item, result in zip(req.inputs, fetches):
                if isinstance(result, ImageFetchError):
                    errors.append(ItemError(id=item.id, reason=str(result)))
                elif isinstance(result, BaseException):
                    errors.append(
                        ItemError(id=item.id, reason=f"fetch failed: {result.__class__.__name__}")
                    )
                else:
                    good_ids.append(item.id)
                    good_images.append(result)

            vectors: list[Vector] = []
            if good_images:
                embs = await run_in_threadpool(eng.embed_images, good_images)
                vectors = [
                    Vector(id=item_id, dim=int(emb.shape[-1]), v=emb.tolist())
                    for item_id, emb in zip(good_ids, embs)
                ]
        finally:
            gate.leave()

        return EmbedResponse(
            model_version=eng.model_version, vectors=vectors, errors=errors
        )

    # ── taste refit (design §8.2/§14.4 — Wave 4A) ────────────────────────────
    # Pure numpy, no model files involved: the request carries φ features
    # (computed DB-side by 00244's _aesthete_phi — the 94-d ordering contract
    # lives in SQL), the prior θ_H, and hyperparameters. Judgment lists cap at
    # FIT_MAX_JUDGMENTS (a full designer history, not an embed batch — the
    # 16-item embed cap does not apply).

    FIT_MAX_JUDGMENTS = 10_000

    def check_fit_size(n: int) -> None:
        if n > FIT_MAX_JUDGMENTS:
            raise HTTPException(
                status_code=400,
                detail=f"judgments must contain ≤ {FIT_MAX_JUDGMENTS} items (got {n})",
            )

    @app.post(
        "/fit/taste", response_model=TasteFitResponse, dependencies=[Depends(require_token)]
    )
    async def fit_taste(req: TasteFitRequest) -> TasteFitResponse:
        check_fit_size(len(req.judgments))
        enter_gate()
        try:
            result = await run_in_threadpool(
                fit_bt_map,
                [j.model_dump() for j in req.judgments],
                req.designer.theta_prior,
                req.hyper.tau_days,
                req.hyper.lambda0,
                req.hyper.lambda_n0,
            )
        except FitInputError as err:
            raise HTTPException(status_code=400, detail=str(err))
        finally:
            gate.leave()
        return TasteFitResponse(
            theta=result.theta.tolist(),
            converged=result.converged,
            n_effective=result.n_effective,
            train_accuracy=result.train_accuracy,
            n_used=result.n_used,
            n_skipped=result.n_skipped,
            n_iter=result.n_iter,
            lambda_used=result.lambda_used,
            dim=result.dim,
        )

    @app.post(
        "/fit/taste/backtest",
        response_model=TasteBacktestResponse,
        dependencies=[Depends(require_token)],
    )
    async def fit_taste_backtest(req: TasteBacktestRequest) -> TasteBacktestResponse:
        check_fit_size(len(req.judgments))
        enter_gate()
        try:
            result = await run_in_threadpool(
                backtest,
                [j.model_dump() for j in req.judgments],
                req.designer.theta_prior,
                req.hyper.tau_days,
                req.hyper.lambda0,
                req.hyper.lambda_n0,
                req.test_fraction,
            )
        except FitInputError as err:
            raise HTTPException(status_code=400, detail=str(err))
        finally:
            gate.leave()
        return TasteBacktestResponse(
            pairwise_accuracy=result.pairwise_accuracy,
            auc=result.auc,
            prior_accuracy=result.prior_accuracy,
            prior_auc=result.prior_auc,
            n_train=result.n_train,
            n_test=result.n_test,
        )

    # ── Room View USDZ→GLB (archival lane — R107) ────────────────────────────
    # Fetch the (signed) USDZ, parse it into minimal binary glTF. USD/pygltflib
    # imports are lazy (app.usdz), so a broken USD wheel can never take down
    # /embed/*. The CPU-bound parse runs in the threadpool while a gate slot is
    # held, exactly like the embed routes.
    #   200 model/gltf-binary  → converted bytes
    #   422                    → unconvertible (not a USD stage / no meshes)
    #   502                    → upstream fetch failure
    @app.post("/convert/usdz-to-glb", dependencies=[Depends(require_token)])
    async def convert_usdz(req: UsdzConvertRequest) -> Response:
        client: httpx.AsyncClient = app.state.http_client
        try:
            data = await fetch_usdz(
                client,
                req.usdz_url,
                timeout_s=settings.usdz_fetch_timeout_s,
                max_bytes=settings.usdz_max_bytes,
            )
        except UsdFetchError as err:
            raise HTTPException(status_code=502, detail=f"usdz fetch failed: {err}")

        enter_gate()
        try:
            glb = await run_in_threadpool(convert_usdz_to_glb, data)
        except UsdConversionError as err:
            raise HTTPException(status_code=422, detail=str(err))
        finally:
            gate.leave()

        return Response(content=glb, media_type="model/gltf-binary")

    # ── Room View HEIC→JPEG (derivative lane — I78) ──────────────────────────
    # Fetch the (signed) HEIC, decode it ONCE into a 512px thumb + 1600px
    # preview, both returned as base64 JPEG. pillow-heif is imported + registered
    # lazily (app.photos), so a broken libheif wheel can never take down
    # /embed/*. The CPU-bound decode+encode runs in the threadpool while a gate
    # slot is held, exactly like the embed + USDZ routes.
    #   200                    → {thumb:{b64,width,height,bytes}, preview:{…}}
    #   422                    → undecodable (not an image / broken HEIC)
    #   429                    → at capacity (gate full)
    #   502                    → upstream fetch failure
    @app.post(
        "/convert/heic-to-jpeg",
        response_model=HeicConvertResponse,
        dependencies=[Depends(require_token)],
    )
    async def convert_heic(req: HeicConvertRequest) -> HeicConvertResponse:
        client: httpx.AsyncClient = app.state.http_client
        try:
            data = await fetch_photo(
                client,
                req.image_url,
                timeout_s=settings.photo_fetch_timeout_s,
                max_bytes=settings.photo_max_bytes,
            )
        except PhotoFetchError as err:
            raise HTTPException(status_code=502, detail=f"photo fetch failed: {err}")

        enter_gate()
        try:
            result = await run_in_threadpool(
                convert_heic_to_jpeg,
                data,
                thumb_max_px=req.thumb_max_px,
                preview_max_px=req.preview_max_px,
                jpeg_quality=req.jpeg_quality,
            )
        except PhotoDecodeError as err:
            raise HTTPException(status_code=422, detail=str(err))
        finally:
            gate.leave()

        return HeicConvertResponse(**result)

    return app
