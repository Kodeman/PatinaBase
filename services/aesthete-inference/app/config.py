"""Runtime settings for the aesthete-inference worker.

Everything comes from the environment; `INFERENCE_TOKEN` is mandatory and the
worker refuses to start without it (design §12.1: bearer-token auth on the
internal Docker network).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

_SERVICE_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MODELS_DIR = _SERVICE_ROOT / "models"


@dataclass(frozen=True)
class Settings:
    inference_token: str
    models_dir: Path = DEFAULT_MODELS_DIR
    # §12.1: in-process semaphore returns 429 past depth 8 so edge fns back off
    # and re-enqueue rather than pile on.
    max_concurrency: int = 8
    # §12.1: onnxruntime intra-op threads = 2 (the container gets cpus: 2.0).
    intra_op_threads: int = 2
    # §12.1: image fetch via httpx with a 10 s timeout and a 15 MB size cap.
    image_fetch_timeout_s: float = 10.0
    image_max_bytes: int = 15 * 1024 * 1024
    # Token truncation cap for text embeds. nomic-embed-text-v1.5 was trained
    # to 2048 positions (8192 via rotary scaling); 2048 is a deliberate CPU
    # latency guard — captions/quiz profiles are far shorter in practice.
    text_max_tokens: int = 2048
    # §12.1 / §18: batch ≤ 16 per request; larger is a 400.
    max_batch: int = 16
    # Room View USDZ→GLB conversion lane (R107). RoomPlan captures are a few MB;
    # generous caps that still bound a hostile/oversized fetch. The convert route
    # holds a ConcurrencyGate slot while the CPU-bound parse runs in the threadpool.
    usdz_fetch_timeout_s: float = 30.0
    usdz_max_bytes: int = 64 * 1024 * 1024
    # Room View HEIC→JPEG derivative lane (I78). A single iPhone HEIC is a few MB;
    # 20 MB caps a hostile/oversized fetch. The convert route holds a
    # ConcurrencyGate slot while the CPU-bound decode+encode runs in the threadpool.
    photo_fetch_timeout_s: float = 15.0
    photo_max_bytes: int = 20 * 1024 * 1024


def settings_from_env() -> Settings:
    token = os.environ.get("INFERENCE_TOKEN", "").strip()
    if not token:
        raise RuntimeError(
            "INFERENCE_TOKEN is not set — the aesthete-inference worker refuses to "
            "start without a bearer token. Set INFERENCE_TOKEN in the environment "
            "(callers must send `Authorization: Bearer $INFERENCE_TOKEN`). "
            "See services/aesthete-inference/README.md."
        )
    return Settings(
        inference_token=token,
        models_dir=Path(os.environ.get("MODELS_DIR", str(DEFAULT_MODELS_DIR))),
        max_concurrency=int(os.environ.get("INFERENCE_MAX_CONCURRENCY", "8")),
        intra_op_threads=int(os.environ.get("ORT_INTRA_OP_THREADS", "2")),
        image_fetch_timeout_s=float(os.environ.get("IMAGE_FETCH_TIMEOUT_S", "10")),
        image_max_bytes=int(os.environ.get("IMAGE_MAX_BYTES", str(15 * 1024 * 1024))),
        text_max_tokens=int(os.environ.get("TEXT_MAX_TOKENS", "2048")),
        usdz_fetch_timeout_s=float(os.environ.get("USDZ_FETCH_TIMEOUT_S", "30")),
        usdz_max_bytes=int(os.environ.get("USDZ_MAX_BYTES", str(64 * 1024 * 1024))),
        photo_fetch_timeout_s=float(os.environ.get("PHOTO_FETCH_TIMEOUT_S", "15")),
        photo_max_bytes=int(os.environ.get("PHOTO_MAX_BYTES", str(20 * 1024 * 1024))),
    )
