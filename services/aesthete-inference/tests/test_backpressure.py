"""§12.1: in-process semaphore returns 429 past depth 8 so edge fns back off
and re-enqueue rather than pile on."""

from __future__ import annotations

import threading
import time

from fastapi.testclient import TestClient

from conftest import AUTH, FakeEmbedder, make_settings, mock_image_transport
from app.main import create_app

PAYLOAD = {"inputs": [{"id": "t", "text": "hold the line", "kind": "document"}]}


def test_429_past_depth_then_recovers():
    release = threading.Event()
    embedder = FakeEmbedder(block_event=release)
    app = create_app(
        make_settings(max_concurrency=8),
        embedder=embedder,
        http_transport=mock_image_transport(),
    )

    with TestClient(app) as client:
        statuses: list[int] = []
        threads = [
            threading.Thread(
                target=lambda: statuses.append(
                    client.post("/embed/text", json=PAYLOAD, headers=AUTH).status_code
                )
            )
            for _ in range(8)
        ]
        for t in threads:
            t.start()

        # Wait for all 8 slots to be held (each request is blocked inside the
        # fake embedder until we set `release`).
        deadline = time.time() + 10
        while app.state.gate.active < 8:
            assert time.time() < deadline, f"gate never filled (active={app.state.gate.active})"
            time.sleep(0.01)

        # The 9th concurrent request must be rejected with 429 + Retry-After.
        res = client.post("/embed/text", json=PAYLOAD, headers=AUTH)
        assert res.status_code == 429
        assert res.headers.get("retry-after") == "1"

        # healthz stays reachable under saturation (no gate on it).
        assert client.get("/healthz").status_code == 200

        release.set()
        for t in threads:
            t.join(timeout=30)
        assert statuses == [200] * 8

        # Slots drained → next request succeeds.
        assert app.state.gate.active == 0
        assert client.post("/embed/text", json=PAYLOAD, headers=AUTH).status_code == 200
