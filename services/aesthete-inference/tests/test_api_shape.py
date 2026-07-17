"""API-shape tests with the model layer faked — fast, always run (§12.1, §18)."""

from __future__ import annotations

from conftest import AUTH


def text_payload(n=1, kind="document"):
    return {"inputs": [{"id": f"t{i}", "text": f"walnut credenza {i}", "kind": kind} for i in range(n)]}


def image_payload(*paths):
    return {"inputs": [{"id": f"i{n}", "url": f"https://cdn.test{p}"} for n, p in enumerate(paths)]}


# ── healthz ────────────────────────────────────────────────────────────────────


def test_healthz_is_open_and_shaped(client):
    res = client.get("/healthz")  # no auth header — healthz is open
    assert res.status_code == 200
    body = res.json()
    # usd_available / heif_available are environment-dependent (the Room View
    # USDZ→GLB and HEIC→JPEG toolchains may or may not be installed on this
    # machine) — assert each is a bool and pin the rest of the shape.
    assert isinstance(body.pop("usd_available"), bool)
    assert isinstance(body.pop("heif_available"), bool)
    assert body == {
        "status": "ok",
        "model_version": "fake-embedder-r0",
        "text_dim": 768,
        "image_dim": 768,
        "warmed": True,
    }


# ── auth ───────────────────────────────────────────────────────────────────────


def test_embed_requires_bearer_token(client):
    assert client.post("/embed/text", json=text_payload()).status_code == 401
    assert (
        client.post(
            "/embed/text", json=text_payload(), headers={"Authorization": "Bearer wrong"}
        ).status_code
        == 401
    )
    assert client.post("/embed/image", json=image_payload("/ok.png")).status_code == 401


# ── /embed/text ────────────────────────────────────────────────────────────────


def test_embed_text_response_shape(client):
    res = client.post("/embed/text", json=text_payload(3), headers=AUTH)
    assert res.status_code == 200
    body = res.json()
    assert body["model_version"] == "fake-embedder-r0"
    assert body["errors"] == []
    assert [v["id"] for v in body["vectors"]] == ["t0", "t1", "t2"]
    for vec in body["vectors"]:
        assert vec["dim"] == 768
        assert len(vec["v"]) == 768
        norm = sum(x * x for x in vec["v"]) ** 0.5
        assert abs(norm - 1.0) < 1e-3  # L2-normalized


def test_embed_text_batch_limits(client):
    assert client.post("/embed/text", json=text_payload(17), headers=AUTH).status_code == 400
    assert client.post("/embed/text", json={"inputs": []}, headers=AUTH).status_code == 400
    assert client.post("/embed/text", json=text_payload(16), headers=AUTH).status_code == 200


def test_embed_text_invalid_kind_rejected(client):
    payload = {"inputs": [{"id": "t0", "text": "hi", "kind": "caption"}]}
    assert client.post("/embed/text", json=payload, headers=AUTH).status_code == 422


def test_embed_text_empty_text_is_item_error_not_batch_failure(client):
    payload = {
        "inputs": [
            {"id": "good", "text": "boucle lounge chair", "kind": "document"},
            {"id": "bad", "text": "   ", "kind": "document"},
        ]
    }
    res = client.post("/embed/text", json=payload, headers=AUTH)
    assert res.status_code == 200
    body = res.json()
    assert [v["id"] for v in body["vectors"]] == ["good"]
    assert body["errors"] == [{"id": "bad", "reason": "empty text"}]


# ── /embed/image ───────────────────────────────────────────────────────────────


def test_embed_image_response_shape(client, fake_embedder):
    res = client.post("/embed/image", json=image_payload("/ok.png", "/ok2.png"), headers=AUTH)
    assert res.status_code == 200
    body = res.json()
    assert body["model_version"] == "fake-embedder-r0"
    assert body["errors"] == []
    assert [v["id"] for v in body["vectors"]] == ["i0", "i1"]
    assert all(v["dim"] == 768 and len(v["v"]) == 768 for v in body["vectors"])
    assert fake_embedder.seen_image_sizes == [(64, 48), (300, 200)]


def test_embed_image_per_item_error_isolation(client):
    """One bad URL doesn't fail the batch (§12.1)."""
    res = client.post(
        "/embed/image",
        json=image_payload("/ok.png", "/missing.png", "/page.html", "/garbage.png"),
        headers=AUTH,
    )
    assert res.status_code == 200
    body = res.json()
    assert [v["id"] for v in body["vectors"]] == ["i0"]
    reasons = {e["id"]: e["reason"] for e in body["errors"]}
    assert set(reasons) == {"i1", "i2", "i3"}
    assert "HTTP 404" in reasons["i1"]
    assert "not an image" in reasons["i2"]  # content-type sanity
    assert "not a decodable image" in reasons["i3"]


def test_embed_image_octet_stream_content_type_allowed(client):
    res = client.post("/embed/image", json=image_payload("/octet.jpg"), headers=AUTH)
    assert res.status_code == 200
    assert [v["id"] for v in res.json()["vectors"]] == ["i0"]


def test_embed_image_size_caps(client):
    res = client.post(
        "/embed/image", json=image_payload("/huge-declared.png"), headers=AUTH
    )
    assert res.status_code == 200
    assert "exceeds limit" in res.json()["errors"][0]["reason"]


def test_embed_image_streaming_body_cap(fake_embedder):
    """A body that overruns the cap mid-stream is caught even without content-length."""
    from fastapi.testclient import TestClient

    from conftest import make_settings, mock_image_transport
    from app.main import create_app

    app = create_app(
        make_settings(image_max_bytes=1024),
        embedder=fake_embedder,
        http_transport=mock_image_transport(),
    )
    with TestClient(app) as c:
        res = c.post("/embed/image", json=image_payload("/huge-body.png"), headers=AUTH)
    assert res.status_code == 200
    assert "exceeds limit" in res.json()["errors"][0]["reason"]


def test_embed_image_batch_limit(client):
    res = client.post("/embed/image", json=image_payload(*(["/ok.png"] * 17)), headers=AUTH)
    assert res.status_code == 400
