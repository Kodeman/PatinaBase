"""Wire shapes for the aesthete-inference worker (design §18)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class TextInput(BaseModel):
    id: str
    text: str
    kind: Literal["document", "query"]


class TextEmbedRequest(BaseModel):
    inputs: list[TextInput]


class ImageInput(BaseModel):
    id: str
    url: str


class ImageEmbedRequest(BaseModel):
    inputs: list[ImageInput]


class Vector(BaseModel):
    id: str
    dim: int
    v: list[float]


class ItemError(BaseModel):
    id: str
    reason: str


class EmbedResponse(BaseModel):
    model_version: str
    vectors: list[Vector]
    errors: list[ItemError]


class Healthz(BaseModel):
    status: str
    model_version: str
    text_dim: int
    image_dim: int
    warmed: bool
    usd_available: bool  # Room View USDZ→GLB toolchain importable (cheap cached probe)
    heif_available: bool  # Room View HEIC→JPEG toolchain importable (cheap cached probe)


# ─── /convert/usdz-to-glb (Room View archival lane — R107) ───────────────────


class UsdzConvertRequest(BaseModel):
    usdz_url: str
    scan_id: str


# ─── /convert/heic-to-jpeg (Room View derivative lane — I78) ─────────────────


class HeicConvertRequest(BaseModel):
    image_url: str  # signed URL to the source HEIC
    image_id: str
    thumb_max_px: int = 512
    preview_max_px: int = 1600
    jpeg_quality: float = 0.8  # 0–1; mapped to Pillow's 1–95 int worker-side


class PhotoVariant(BaseModel):
    b64: str  # base64-encoded JPEG bytes
    width: int
    height: int
    bytes: int  # decoded JPEG byte length


class HeicConvertResponse(BaseModel):
    thumb: PhotoVariant
    preview: PhotoVariant


# ─── /fit/taste (design §8.2 BT MAP refit — Wave 4A) ─────────────────────────


class TasteJudgment(BaseModel):
    phi_a: list[float]
    phi_b: list[float]
    choice: Literal["a", "b", "neither", "both"]
    weight: float = 1.0  # r_t: judgment/probe 1.0, correction 2.0, rule 0.5
    age_days: float = 0.0


class TasteDesigner(BaseModel):
    theta_prior: list[float] | None = None  # θ_H; None → zero-vector prior


class TasteHyper(BaseModel):
    tau_days: float = 180.0
    lambda0: float = 0.5
    lambda_n0: float = 30.0


class TasteFitRequest(BaseModel):
    designer: TasteDesigner
    judgments: list[TasteJudgment]
    hyper: TasteHyper = TasteHyper()


class TasteFitResponse(BaseModel):
    theta: list[float]
    converged: bool
    n_effective: float  # Σ w_t after decay
    train_accuracy: float | None  # None when zero usable pairs
    n_used: int
    n_skipped: int  # 'neither'/'both' rows
    n_iter: int
    lambda_used: float
    dim: int


class TasteBacktestRequest(TasteFitRequest):
    test_fraction: float = 0.3


class TasteBacktestResponse(BaseModel):
    pairwise_accuracy: float
    auc: float | None  # None when the held-out block is one-class
    prior_accuracy: float  # θ_H scored on the same held-out block (§14.4)
    prior_auc: float | None
    n_train: int
    n_test: int
