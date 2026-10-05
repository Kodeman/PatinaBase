"""SQ-362 calibration · step 2: deck-like query crops and their image vectors.

    services/aesthete-inference/.venv/bin/python scripts/deck-import-calibration/queries.py

Reads $CAL_DIR/catalog.json (crawl.ts) and writes, outside the repo:
  $CAL_DIR/q/<qid>.webp      the query crops, made the way a deck shows a
                             picture: cropped, long edge <= 2048 px (deck
                             crop.ts DECK_CROP_MAX_EDGE), WebP quality 0.9
                             (crop.ts WEBP_QUALITY)
  $CAL_DIR/queries.json      [{qid, product_key, domain, kind, file, kept_file?}]
  $CAL_DIR/query_vectors.npy float32 [n, 768], row i = queries[i]

Kinds:
  alt_studio    a gallery shot of the product that the catalog did not embed,
                plain (near-white) background
  alt_scene     the same, a room scene (lifestyle); cropped toward the centre
                the way a designer cuts the piece out of a room photo
  same_picture  the catalog's own hero picture, re-cropped (the designer
                pasted the retailer photo). Also writes kept_file: a second,
                independent crop of the same picture, standing in for the crop
                a designer kept from an earlier deck (designer_confirmed rows
                carry a phash; product_image rows do not).
  negative_*    pictures of held-out products that are NOT in the catalog.

The vectors come from the inference service's own decoder and ONNX engine
in-process (app.images.decode_image + OnnxEmbedder.embed_images, batches of
16): the HTTP worker refuses loopback URLs by design (safe_fetch), and these
crops exist only on this machine.
"""

from __future__ import annotations

import io
import json
import os
import random
import sys
from pathlib import Path

import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parents[2]
SERVICE = REPO / "services" / "aesthete-inference"
sys.path.insert(0, str(SERVICE))

from app.embedder import OnnxEmbedder  # noqa: E402
from app.images import decode_image  # noqa: E402

CAL_DIR = Path(os.environ.get("CAL_DIR", Path.home() / "patina-deck-samples" / "calibration"))
MODELS_DIR = Path(os.environ.get("MODELS_DIR", SERVICE / "models"))
MAX_EDGE = 2048
WEBP_QUALITY = 90
SAME_PICTURE_EVERY = 3  # one catalog product in three also gets a same-picture query
rng = random.Random(362)


def is_scene(image: Image.Image) -> bool:
    """A room scene has a non-white border; a studio shot sits on white/grey."""
    small = image.convert("RGB").resize((64, 64))
    a = np.asarray(small, dtype=np.float32)
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    light = (border.min(axis=1) > 215) & (border.max(axis=1) - border.min(axis=1) < 25)
    return light.mean() < 0.6


def deck_crop(image: Image.Image, scene: bool) -> bytes:
    image = image.convert("RGBA") if image.mode in ("RGBA", "LA", "P") else image.convert("RGB")
    w, h = image.size
    if scene:
        # The piece cut out of a room: 45-80 % of each side, around the centre.
        fw, fh = rng.uniform(0.45, 0.8), rng.uniform(0.45, 0.8)
        cx, cy = rng.uniform(0.4, 0.6), rng.uniform(0.4, 0.65)
    else:
        # A pasted product photo, trimmed a little.
        fw, fh = rng.uniform(0.8, 1.0), rng.uniform(0.8, 1.0)
        cx, cy = 0.5 + rng.uniform(-0.05, 0.05), 0.5 + rng.uniform(-0.05, 0.05)
    cw, ch = max(16, int(w * fw)), max(16, int(h * fh))
    x0 = int(min(max(cx * w - cw / 2, 0), w - cw))
    y0 = int(min(max(cy * h - ch / 2, 0), h - ch))
    crop = image.crop((x0, y0, x0 + cw, y0 + ch))
    edge = rng.randint(480, MAX_EDGE)
    scale = min(1.0, edge / max(crop.size))
    if scale < 1.0:
        crop = crop.resize((max(1, round(crop.width * scale)), max(1, round(crop.height * scale))), Image.LANCZOS)
    out = io.BytesIO()
    crop.save(out, format="WEBP", quality=WEBP_QUALITY)
    return out.getvalue()


def load(file: str) -> Image.Image | None:
    try:
        return decode_image((CAL_DIR / "img" / f"{file}.bin").read_bytes())
    except Exception:  # noqa: BLE001 - an undecodable download is skipped
        return None


def main() -> None:
    catalog = json.loads((CAL_DIR / "catalog.json").read_text())
    (CAL_DIR / "q").mkdir(parents=True, exist_ok=True)
    queries: list[dict] = []

    def add(product: dict, kind: str, data: bytes, kept: bytes | None = None) -> None:
        qid = f"q{len(queries):04d}"
        (CAL_DIR / "q" / f"{qid}.webp").write_bytes(data)
        row = {"qid": qid, "product_key": product["key"], "domain": product["domain"], "kind": kind,
               "file": f"q/{qid}.webp"}
        if kept is not None:
            (CAL_DIR / "q" / f"{qid}.kept.webp").write_bytes(kept)
            row["kept_file"] = f"q/{qid}.kept.webp"
        queries.append(row)

    catalog_index = 0
    for product in catalog:
        negative = product["role"] == "negative"
        for alt in product["alt_images"]:
            image = load(alt["file"])
            if image is None:
                continue
            scene = is_scene(image)
            kind = ("negative_" if negative else "alt_") + ("scene" if scene else "studio")
            add(product, kind, deck_crop(image, scene))
        if product.get("hero_file"):
            if negative:
                image = load(product["hero_file"])
                if image is not None:
                    add(product, "negative_hero", deck_crop(image, False))
            else:
                catalog_index += 1
                if catalog_index % SAME_PICTURE_EVERY == 0:
                    image = load(product["hero_file"])
                    if image is not None:
                        add(product, "same_picture", deck_crop(image, False), deck_crop(image, False))

    engine = OnnxEmbedder(MODELS_DIR, intra_op_threads=4)
    engine.warmup()
    vectors = np.zeros((len(queries), 768), dtype=np.float32)
    for start in range(0, len(queries), 16):
        batch = queries[start:start + 16]
        images = [decode_image((CAL_DIR / q["file"]).read_bytes()) for q in batch]
        vectors[start:start + len(batch)] = engine.embed_images(images)
    np.save(CAL_DIR / "query_vectors.npy", vectors)
    (CAL_DIR / "queries.json").write_text(json.dumps(queries, indent=1))
    kinds: dict[str, int] = {}
    for q in queries:
        kinds[q["kind"]] = kinds.get(q["kind"], 0) + 1
    print(json.dumps({"queries": len(queries), "kinds": kinds}))


if __name__ == "__main__":
    main()
