"""USDZ → GLB conversion tests (Room View archival lane — R107).

Two levels: the pure converter (fast, deterministic) and the HTTP route
(auth + status mapping + content-type). The whole module skips-with-reason when
usd-core / pygltflib aren't installed — the CI gate runs it in Docker where
requirements.txt has both; a bare dev machine without USD gets a clean skip
rather than a false pass.
"""

from __future__ import annotations

import json
import struct

import httpx
import pytest

pytest.importorskip("pxr", reason="usd-core not installed — run in Docker / `make test`")
pytest.importorskip("pygltflib", reason="pygltflib not installed — run in Docker / `make test`")

from conftest import AUTH, FIXTURES, FakeEmbedder, make_settings  # noqa: E402
from app.main import create_app  # noqa: E402
from app.usdz import UsdConversionError, convert_usdz_to_glb  # noqa: E402

FIXTURE = FIXTURES / "box-room.usdz"


def fixture_bytes() -> bytes:
    return FIXTURE.read_bytes()


def gltf_json(glb: bytes) -> dict:
    """Parse the JSON chunk out of a binary-glTF container."""
    assert glb[:4] == b"glTF", "GLB magic missing"
    json_len = struct.unpack("<I", glb[12:16])[0]
    return json.loads(glb[20 : 20 + json_len])


# ── pure converter ──────────────────────────────────────────────────────────


def test_convert_produces_glb_with_named_meshes():
    glb = convert_usdz_to_glb(fixture_bytes())
    assert glb[:4] == b"glTF"  # binary-glTF magic
    doc = gltf_json(glb)
    assert len(doc["meshes"]) >= 1
    names = {n.get("name") for n in doc["nodes"]}
    assert "Floor" in names  # node names survive the conversion
    assert any(n and n.startswith("Wall") for n in names)
    # every mesh primitive carries a POSITION accessor + triangle indices
    for mesh in doc["meshes"]:
        prim = mesh["primitives"][0]
        assert "POSITION" in prim["attributes"]
        assert "indices" in prim


def test_convert_roundtrips_through_pygltflib():
    import pygltflib

    glb = convert_usdz_to_glb(fixture_bytes())
    model = pygltflib.GLTF2().load_from_bytes(glb)
    assert len(model.meshes) == 5
    assert len(model.nodes) == 5


def test_convert_garbage_bytes_is_conversion_error():
    with pytest.raises(UsdConversionError):
        convert_usdz_to_glb(b"definitely not a usdz file")


def test_convert_empty_bytes_is_conversion_error():
    with pytest.raises(UsdConversionError):
        convert_usdz_to_glb(b"")


# ── HTTP route ──────────────────────────────────────────────────────────────


def convert_transport(usdz: bytes) -> httpx.MockTransport:
    """Fake CDN serving the fixture, garbage, and a 404 for the convert route."""

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == "/room.usdz":
            return httpx.Response(200, content=usdz, headers={"content-type": "model/vnd.usdz+zip"})
        if path == "/garbage.usdz":
            return httpx.Response(
                200,
                content=b"not a usd file at all",
                headers={"content-type": "application/octet-stream"},
            )
        if path == "/missing.usdz":
            return httpx.Response(404, content=b"nope")
        return httpx.Response(500, content=b"unhandled fixture route")

    return httpx.MockTransport(handler)


def convert_client(usdz: bytes):
    from fastapi.testclient import TestClient

    from conftest import public_test_resolver

    app = create_app(
        make_settings(),
        embedder=FakeEmbedder(),
        http_transport=convert_transport(usdz),
        hostname_resolver=public_test_resolver,
    )
    return TestClient(app)


def convert_payload(name: str) -> dict:
    return {"usdz_url": f"https://cdn.test/{name}", "scan_id": "scan-1"}


def test_convert_route_requires_bearer_token():
    with convert_client(fixture_bytes()) as c:
        assert c.post("/convert/usdz-to-glb", json=convert_payload("room.usdz")).status_code == 401


def test_convert_route_happy_path_returns_glb_bytes():
    with convert_client(fixture_bytes()) as c:
        res = c.post("/convert/usdz-to-glb", json=convert_payload("room.usdz"), headers=AUTH)
    assert res.status_code == 200
    assert res.headers["content-type"] == "model/gltf-binary"
    assert res.content[:4] == b"glTF"
    assert len(gltf_json(res.content)["meshes"]) == 5


def test_convert_route_garbage_is_422():
    with convert_client(b"") as c:
        res = c.post("/convert/usdz-to-glb", json=convert_payload("garbage.usdz"), headers=AUTH)
    assert res.status_code == 422


def test_convert_route_fetch_failure_is_502():
    with convert_client(b"") as c:
        res = c.post("/convert/usdz-to-glb", json=convert_payload("missing.usdz"), headers=AUTH)
    assert res.status_code == 502


# ── healthz exposes the probe ───────────────────────────────────────────────


def test_healthz_reports_usd_available_true_when_installed():
    # This module only runs when pxr + pygltflib import (see importorskip above),
    # so the cached probe must report available here.
    with convert_client(fixture_bytes()) as c:
        assert c.get("/healthz").json()["usd_available"] is True
