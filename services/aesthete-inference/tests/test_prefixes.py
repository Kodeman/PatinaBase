"""Task prefixes are applied WORKER-SIDE from `kind` — callers never send them
(§4.2: mixed prefixes silently degrade similarity; the prefix lives in exactly
one place, main.TASK_PREFIXES). This suite pins that behavior at the API layer;
tests/test_golden.py additionally proves the two prefixes produce different
vectors with the real models."""

from __future__ import annotations

from conftest import AUTH


def test_document_and_query_prefixes_applied_worker_side(client, fake_embedder):
    payload = {
        "inputs": [
            {"id": "d", "text": "walnut credenza, oiled finish", "kind": "document"},
            {"id": "q", "text": "walnut credenza, oiled finish", "kind": "query"},
        ]
    }
    res = client.post("/embed/text", json=payload, headers=AUTH)
    assert res.status_code == 200
    assert fake_embedder.seen_texts == [
        "search_document: walnut credenza, oiled finish",
        "search_query: walnut credenza, oiled finish",
    ]


def test_prefixed_inputs_differ_even_for_identical_caller_text(client):
    """Same caller text, different kind → different vectors (fake is
    content-addressed, so this holds by construction once prefixes differ)."""
    payload = {
        "inputs": [
            {"id": "d", "text": "boucle lounge chair", "kind": "document"},
            {"id": "q", "text": "boucle lounge chair", "kind": "query"},
        ]
    }
    body = client.post("/embed/text", json=payload, headers=AUTH).json()
    vecs = {v["id"]: v["v"] for v in body["vectors"]}
    assert vecs["d"] != vecs["q"]
