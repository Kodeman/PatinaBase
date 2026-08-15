"""HEIC → JPEG derivative-lane tests (Room View — I78).

Two levels: the pure converter (fast, deterministic) and the HTTP route
(auth + status mapping + gate). The whole module skips-with-reason when
pillow-heif isn't installed — the CI gate runs it in Docker where
requirements.txt has it; a bare dev machine without libheif gets a clean skip
rather than a false pass.
"""

from __future__ import annotations

import base64
from io import BytesIO

import httpx
import pytest

pytest.importorskip(
    "pillow_heif", reason="pillow-heif not installed — run in Docker / `make test`"
)

from PIL import Image  # noqa: E402

from conftest import AUTH, FIXTURES, FakeEmbedder, make_settings  # noqa: E402
from app.main import create_app  # noqa: E402
from app.photos import PhotoDecodeError, convert_heic_to_jpeg  # noqa: E402

FIXTURE = FIXTURES / "room-photo.heic"

# The committed fixture is authored by scripts/make_test_heic.py — 2000×1500 (4:3).
pytestmark = pytest.mark.skipif(
    not FIXTURE.exists(),
    reason="tests/fixtures/room-photo.heic missing — run scripts/make_test_heic.py",
)


def fixture_bytes() -> bytes:
    return FIXTURE.read_bytes()


def jpeg_dims(b64: str) -> tuple[int, int]:
    raw = base64.b64decode(b64)
    assert raw[:3] == b"\xff\xd8\xff", "JPEG magic missing"
    return Image.open(BytesIO(raw)).size


# ── pure converter ──────────────────────────────────────────────────────────


def test_convert_produces_two_jpeg_variants_within_caps():
    out = convert_heic_to_jpeg(
        fixture_bytes(), thumb_max_px=512, preview_max_px=1600, jpeg_quality=0.8
    )
    # both variants are real JPEGs (magic checked in jpeg_dims)
    tw, th = jpeg_dims(out["thumb"]["b64"])
    pw, ph = jpeg_dims(out["preview"]["b64"])

    # dims never exceed their caps, and neither is upscaled past the 4:3 source
    assert max(tw, th) <= 512
    assert max(pw, ph) <= 1600
    assert (tw, th) == (512, 384)
    assert (pw, ph) == (1600, 1200)

    # reported width/height/bytes match the decoded JPEG
    assert (out["thumb"]["width"], out["thumb"]["height"]) == (tw, th)
    assert (out["preview"]["width"], out["preview"]["height"]) == (pw, ph)
    assert out["thumb"]["bytes"] == len(base64.b64decode(out["thumb"]["b64"]))
    assert out["preview"]["bytes"] == len(base64.b64decode(out["preview"]["b64"]))


def test_convert_preserves_aspect_ratio():
    out = convert_heic_to_jpeg(fixture_bytes())
    tw, th = jpeg_dims(out["thumb"]["b64"])
    pw, ph = jpeg_dims(out["preview"]["b64"])
    # source is 4:3 → both derivatives keep it
    assert tw / th == pytest.approx(4 / 3, abs=0.01)
    assert pw / ph == pytest.approx(4 / 3, abs=0.01)


def test_convert_garbage_bytes_is_decode_error():
    with pytest.raises(PhotoDecodeError):
        convert_heic_to_jpeg(b"definitely not a heic file")


def test_convert_empty_bytes_is_decode_error():
    with pytest.raises(PhotoDecodeError):
        convert_heic_to_jpeg(b"")


def test_convert_rejects_heic_dimensions_over_decoded_pixel_cap():
    with pytest.raises(PhotoDecodeError, match="too large"):
        convert_heic_to_jpeg(fixture_bytes(), max_pixels=100)


# ── HTTP route ──────────────────────────────────────────────────────────────


def convert_transport(heic: bytes) -> httpx.MockTransport:
    """Fake CDN serving the fixture, garbage, and a 404 for the convert route."""

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == "/room.heic":
            return httpx.Response(200, content=heic, headers={"content-type": "image/heic"})
        if path == "/garbage.heic":
            return httpx.Response(
                200,
                content=b"not a heic file at all",
                headers={"content-type": "application/octet-stream"},
            )
        if path == "/missing.heic":
            return httpx.Response(404, content=b"nope")
        return httpx.Response(500, content=b"unhandled fixture route")

    return httpx.MockTransport(handler)


def convert_client(heic: bytes):
    from fastapi.testclient import TestClient

    from conftest import public_test_resolver

    app = create_app(
        make_settings(),
        embedder=FakeEmbedder(),
        http_transport=convert_transport(heic),
        hostname_resolver=public_test_resolver,
    )
    return TestClient(app)


def convert_payload(name: str) -> dict:
    return {"image_url": f"https://cdn.test/{name}", "image_id": "img-1"}


def test_convert_route_requires_bearer_token():
    with convert_client(fixture_bytes()) as c:
        assert c.post("/convert/heic-to-jpeg", json=convert_payload("room.heic")).status_code == 401


def test_convert_route_happy_path_returns_two_variants():
    with convert_client(fixture_bytes()) as c:
        res = c.post("/convert/heic-to-jpeg", json=convert_payload("room.heic"), headers=AUTH)
    assert res.status_code == 200
    body = res.json()
    assert set(body) == {"thumb", "preview"}
    assert jpeg_dims(body["thumb"]["b64"]) == (512, 384)
    assert jpeg_dims(body["preview"]["b64"]) == (1600, 1200)


def test_convert_route_garbage_is_422():
    with convert_client(b"") as c:
        res = c.post("/convert/heic-to-jpeg", json=convert_payload("garbage.heic"), headers=AUTH)
    assert res.status_code == 422


def test_convert_route_fetch_failure_is_502():
    with convert_client(b"") as c:
        res = c.post("/convert/heic-to-jpeg", json=convert_payload("missing.heic"), headers=AUTH)
    assert res.status_code == 502


def test_convert_route_429_when_at_capacity():
    with convert_client(fixture_bytes()) as c:
        gate = c.app.state.gate
        while gate.try_enter():  # fill every slot
            pass
        try:
            res = c.post("/convert/heic-to-jpeg", json=convert_payload("room.heic"), headers=AUTH)
        finally:
            while gate.active:
                gate.leave()
    assert res.status_code == 429
    assert res.headers.get("retry-after") == "1"


# ── healthz exposes the probe ───────────────────────────────────────────────


def test_healthz_reports_heif_available_true_when_installed():
    # This module only runs when pillow_heif imports (see importorskip above),
    # so the cached probe must report available here.
    with convert_client(fixture_bytes()) as c:
        assert c.get("/healthz").json()["heif_available"] is True
