#!/usr/bin/env python3
"""Rough latency loop: p50 for 1 short text and 1 image (design §12.1 DoD).

Times OnnxEmbedder.embed_texts/[image] directly (tokenize/preprocess included,
HTTP + fetch excluded). Run: `make bench`.
"""

from __future__ import annotations

import statistics
import sys
import time
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVICE_ROOT))

from PIL import Image  # noqa: E402

from app.embedder import OnnxEmbedder  # noqa: E402

FIXTURES = SERVICE_ROOT / "tests" / "fixtures"
N = 25

SHORT_TEXT = (
    "search_document: low-slung credenza in solid walnut, oiled finish, "
    "warm earth palette, quiet craftsmanship, calm ambiance"
)


def timed(fn, n=N) -> list[float]:
    samples = []
    for _ in range(n):
        t0 = time.perf_counter()
        fn()
        samples.append((time.perf_counter() - t0) * 1000)
    return samples


def report(label: str, samples: list[float]) -> None:
    print(
        f"{label:14s} p50 {statistics.median(samples):7.1f} ms   "
        f"min {min(samples):7.1f}   max {max(samples):7.1f}   (n={len(samples)})"
    )


def main() -> int:
    engine = OnnxEmbedder(SERVICE_ROOT / "models")
    engine.warmup()
    img = Image.open(FIXTURES / "img-warm-gradient.png")

    report("short text", timed(lambda: engine.embed_texts([SHORT_TEXT])))
    report("1 image", timed(lambda: engine.embed_images([img])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
