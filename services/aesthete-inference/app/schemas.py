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
