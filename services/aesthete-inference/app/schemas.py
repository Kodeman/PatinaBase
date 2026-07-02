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
