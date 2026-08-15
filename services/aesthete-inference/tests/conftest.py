from __future__ import annotations

import hashlib
import sys
import threading
from io import BytesIO
from pathlib import Path

import httpx
import numpy as np
import pytest
from PIL import Image

SERVICE_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVICE_ROOT))

from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402

TEST_TOKEN = "test-token"
AUTH = {"Authorization": f"Bearer {TEST_TOKEN}"}
FIXTURES = SERVICE_ROOT / "tests" / "fixtures"
MODELS_DIR = SERVICE_ROOT / "models"


def models_available() -> bool:
    return (MODELS_DIR / "manifest.json").exists()


class FakeEmbedder:
    """Deterministic, model-free engine for API-shape tests. Records what it
    is asked to embed (prefix tests) and can block (backpressure tests)."""

    model_version = "fake-embedder-r0"
    text_dim = 768
    image_dim = 768
    warmed = True

    def __init__(self, block_event: threading.Event | None = None) -> None:
        self.block_event = block_event
        self.seen_texts: list[str] = []
        self.seen_image_sizes: list[tuple[int, int]] = []

    def _vec(self, material: str) -> np.ndarray:
        seed = int.from_bytes(hashlib.sha1(material.encode()).digest()[:4], "big")
        rng = np.random.default_rng(seed)
        v = rng.standard_normal(768).astype(np.float32)
        return v / np.linalg.norm(v)

    def embed_texts(self, texts):
        if self.block_event is not None:
            assert self.block_event.wait(timeout=30), "test block_event never released"
        self.seen_texts.extend(texts)
        return np.stack([self._vec(t) for t in texts])

    def embed_images(self, images):
        self.seen_image_sizes.extend(im.size for im in images)
        return np.stack([self._vec(f"img-{im.size}") for im in images])


def png_bytes(color=(200, 60, 30), size=(64, 48)) -> bytes:
    buf = BytesIO()
    Image.new("RGB", size, color).save(buf, format="PNG")
    return buf.getvalue()


def mock_image_transport() -> httpx.MockTransport:
    """Fake CDN for /embed/image tests."""

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == "/ok.png":
            return httpx.Response(200, content=png_bytes(), headers={"content-type": "image/png"})
        if path == "/ok2.png":
            return httpx.Response(
                200, content=png_bytes((20, 90, 160), (300, 200)), headers={"content-type": "image/png"}
            )
        if path == "/octet.jpg":  # sloppy CDN: image served as octet-stream — must pass
            buf = BytesIO()
            Image.new("RGB", (80, 80), (10, 120, 10)).save(buf, format="JPEG")
            return httpx.Response(
                200, content=buf.getvalue(), headers={"content-type": "application/octet-stream"}
            )
        if path == "/missing.png":
            return httpx.Response(404, content=b"not here")
        if path == "/page.html":
            return httpx.Response(200, content=b"<html></html>", headers={"content-type": "text/html"})
        if path == "/garbage.png":
            return httpx.Response(200, content=b"definitely not a png", headers={"content-type": "image/png"})
        if path == "/redirect-private.png":
            return httpx.Response(302, headers={"location": "http://127.0.0.1/internal.png"})
        if path == "/timeout.png":
            raise httpx.ReadTimeout("fixture timeout", request=request)
        if path == "/huge-declared.png":
            return httpx.Response(
                200,
                content=png_bytes(),
                headers={"content-type": "image/png", "content-length": str(64 * 1024 * 1024)},
            )
        if path == "/huge-body.png":
            return httpx.Response(
                200, content=b"\x00" * (2 * 1024 * 1024), headers={"content-type": "image/png"}
            )
        return httpx.Response(500, content=b"unhandled fixture route")

    return httpx.MockTransport(handler)


async def public_test_resolver(_host: str, _port: int) -> list[str]:
    return ["93.184.216.34"]


def make_settings(**overrides) -> Settings:
    overrides.setdefault("inference_token", TEST_TOKEN)
    return Settings(**overrides)


@pytest.fixture
def fake_embedder() -> FakeEmbedder:
    return FakeEmbedder()


@pytest.fixture
def client(fake_embedder):
    from fastapi.testclient import TestClient

    app = create_app(
        make_settings(),
        embedder=fake_embedder,
        http_transport=mock_image_transport(),
        hostname_resolver=public_test_resolver,
    )
    with TestClient(app) as c:
        yield c
