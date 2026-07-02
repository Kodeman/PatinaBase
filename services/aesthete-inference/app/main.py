"""aesthete-inference — the Aesthete Engine's embedding worker (design §12.1, §18).

FastAPI app exposing:

    POST /embed/text   {inputs: [{id, text, kind: 'document'|'query'}]}
    POST /embed/image  {inputs: [{id, url}]}          # batch ≤ 16
    GET  /healthz      → {status, model_version, text_dim, image_dim, warmed}

Stateless, no DB access, internal Docker network only. /embed/* requires
`Authorization: Bearer $INFERENCE_TOKEN`; /healthz is open.

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
from fastapi import Depends, FastAPI, HTTPException, Request
from starlette.concurrency import run_in_threadpool

from .config import Settings, settings_from_env
from .embedder import EmbedderLike
from .images import ImageFetchError, fetch_image
from .schemas import (
    EmbedResponse,
    Healthz,
    ImageEmbedRequest,
    ItemError,
    TextEmbedRequest,
    Vector,
)

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

    return app
