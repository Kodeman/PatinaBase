"""Golden-cosine regression against the real int8 ONNX models (§12.1 DoD).

Embeds 3 committed fixture images + 3 fixture texts with the REAL models and
asserts cosine(current, committed-golden-vector) ≥ 0.999. Catches model-file
drift, pooling/preprocessing regressions, and quantization changes.

Auto-skips (clearly) when models/ is absent; regenerate goldens after an
intentional model bump with `make golden`.
"""

from __future__ import annotations

import json

import numpy as np
import pytest

from conftest import FIXTURES, MODELS_DIR, models_available

pytestmark = pytest.mark.golden

if not models_available():
    pytest.skip(
        "models/ absent — run `make export` (downloads + quantizes the nomic v1.5 "
        "pair) to enable the golden-cosine regression tests",
        allow_module_level=True,
    )

COSINE_FLOOR = 0.999


@pytest.fixture(scope="module")
def engine():
    from app.embedder import OnnxEmbedder

    return OnnxEmbedder(MODELS_DIR)


@pytest.fixture(scope="module")
def golden() -> dict:
    return json.loads((FIXTURES / "golden_vectors.json").read_text())


@pytest.fixture(scope="module")
def fixture_texts() -> list[dict]:
    return json.loads((FIXTURES / "texts.json").read_text())


def cosine(a, b) -> float:
    a = np.asarray(a, dtype=np.float64)
    b = np.asarray(b, dtype=np.float64)
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))


def test_golden_model_version_matches(engine, golden):
    assert golden["model_version"] == engine.model_version, (
        "models/ carries a different model_version than the committed goldens — "
        "regenerate with `make golden` after an intentional bump"
    )


def test_text_golden_cosines(engine, golden, fixture_texts):
    # One item per call — goldens are defined as single-item embeddings because
    # int8 dynamic quantization makes vectors mildly batch-composition-dependent
    # (per-tensor runtime activation scales; see scripts/make_golden.py).
    from app.main import TASK_PREFIXES

    for item in fixture_texts:
        vec = engine.embed_texts([TASK_PREFIXES[item["kind"]] + item["text"]])[0]
        assert vec.shape == (768,)
        assert abs(np.linalg.norm(vec) - 1.0) < 1e-3, f"{item['id']} not L2-normalized"
        cos = cosine(vec, golden["text"][item["id"]])
        assert cos >= COSINE_FLOOR, f"text {item['id']}: cosine {cos:.6f} < {COSINE_FLOOR}"


def test_image_golden_cosines(engine, golden):
    from app.images import decode_image

    for image_id, expected in golden["image"].items():
        img = decode_image((FIXTURES / f"{image_id}.png").read_bytes())
        vec = engine.embed_images([img])[0]
        assert vec.shape == (768,)
        assert abs(np.linalg.norm(vec) - 1.0) < 1e-3, f"{image_id} not L2-normalized"
        cos = cosine(vec, expected)
        assert cos >= COSINE_FLOOR, f"image {image_id}: cosine {cos:.6f} < {COSINE_FLOOR}"


def test_document_vs_query_prefixes_produce_different_vectors(engine):
    """Prefix correctness with the real text model: the two task prefixes must
    move the vector (if they didn't, prefix handling would be dead code and
    §4.2's alignment guarantees meaningless)."""
    text = "walnut credenza with an oiled finish and brass pulls"
    doc, query = engine.embed_texts([f"search_document: {text}", f"search_query: {text}"])
    cos = cosine(doc, query)
    assert cos < COSINE_FLOOR, f"prefixes should produce different vectors (cosine={cos:.6f})"
