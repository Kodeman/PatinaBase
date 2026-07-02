#!/usr/bin/env python3
"""Regenerate tests/fixtures/golden_vectors.json from the REAL exported models.

Run once after `make export` (and again after any intentional model_version
bump). The golden-cosine tests (tests/test_golden.py) assert current vectors
stay within cosine ≥ 0.999 of these committed values.

Also (re)creates the three committed fixture images if they are missing —
they are deterministic PIL compositions, tiny on disk, and visually distinct
so their embeddings are far apart.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

SERVICE_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVICE_ROOT))

from app.embedder import OnnxEmbedder  # noqa: E402
from app.main import TASK_PREFIXES  # noqa: E402

FIXTURES = SERVICE_ROOT / "tests" / "fixtures"
MODELS_DIR = SERVICE_ROOT / "models"


def make_fixture_images() -> list[Path]:
    """Three deterministic, visually distinct small images (committed)."""
    paths = []

    # 1. warm two-tone gradient (reads "warm interior wall")
    p = FIXTURES / "img-warm-gradient.png"
    if not p.exists():
        im = Image.new("RGB", (192, 128))
        for x in range(192):
            for y in range(128):
                im.putpixel((x, y), (180 + x // 5, 120 + y // 4, 80))
        im.save(p, format="PNG")
    paths.append(p)

    # 2. checkerboard (high-frequency graphic pattern)
    p = FIXTURES / "img-checker.png"
    if not p.exists():
        im = Image.new("RGB", (160, 160), (245, 240, 230))
        d = ImageDraw.Draw(im)
        for gx in range(0, 160, 20):
            for gy in range(0, 160, 20):
                if (gx // 20 + gy // 20) % 2 == 0:
                    d.rectangle([gx, gy, gx + 19, gy + 19], fill=(40, 45, 60))
        im.save(p, format="PNG")
    paths.append(p)

    # 3. circle-on-field composition (simple object silhouette)
    p = FIXTURES / "img-circle.png"
    if not p.exists():
        im = Image.new("RGB", (144, 192), (90, 110, 95))
        d = ImageDraw.Draw(im)
        d.ellipse([32, 56, 112, 136], fill=(220, 205, 180), outline=(30, 30, 30), width=3)
        d.rectangle([0, 160, 144, 192], fill=(60, 50, 40))
        im.save(p, format="PNG")
    paths.append(p)

    return paths


def main() -> int:
    engine = OnnxEmbedder(MODELS_DIR)

    # NOTE: embed one item per call. int8 *dynamic* quantization derives
    # activation scales per-tensor at runtime, so batch composition shifts each
    # item's vector slightly (cosine ~0.996 across batchings) — goldens are
    # defined as the single-item embeddings and the tests compare like-for-like.
    texts = json.loads((FIXTURES / "texts.json").read_text())
    text_vecs = [
        engine.embed_texts([TASK_PREFIXES[t["kind"]] + t["text"]])[0] for t in texts
    ]

    image_paths = make_fixture_images()
    image_vecs = [engine.embed_images([Image.open(p)])[0] for p in image_paths]

    golden = {
        "model_version": engine.model_version,
        "text": {
            t["id"]: [round(float(x), 7) for x in vec]
            for t, vec in zip(texts, text_vecs)
        },
        "image": {
            p.stem: [round(float(x), 7) for x in vec]
            for p, vec in zip(image_paths, image_vecs)
        },
    }
    out = FIXTURES / "golden_vectors.json"
    out.write_text(json.dumps(golden) + "\n")
    print(f"✓ wrote {out} (model_version={engine.model_version})")

    # sanity: fixtures should be mutually distinguishable
    tv = np.stack(text_vecs)
    iv = np.stack(image_vecs)
    print("text×text cosines:\n", np.round(tv @ tv.T, 3))
    print("image×image cosines:\n", np.round(iv @ iv.T, 3))
    return 0


if __name__ == "__main__":
    sys.exit(main())
