#!/usr/bin/env python3
"""Crop tall page shots to their top band, downscale, and write JPEGs for the deck."""
import os
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "shots")
OUT = os.path.join(ROOT, "mock", "deck-assets")
os.makedirs(OUT, exist_ok=True)

# name -> (crop_to_top_device_px or None, target_css_width)
SPEC = {
    "w1440-desk":               (1300, 1180),
    "w1440-doc-project-rich":   (1300, 1180),
    "w1280-doc-project-rich":   (1300, 1180),
    "m390-doc-project-rich":    (2600, 620),
    "w1440-spine-detail":       (None, 1180),
    "w1280-spine-detail":       (None, 1180),
    "w1440-shelves-block":      (None, 1180),
    "w1440-shelf-knowledge":    (None, 1180),
    "w1440-doc-install":        (1300, 1180),
    "w1440-doc-care":           (1300, 1180),
    "w1440-money-region":       (None, 948),
    "w1440-cmdk-typed":         (None, 1180),
    "w1440-drawer-books":       (None, 1180),
    "m390-mobile-bar":          (None, 620),
    "m390-mobile-spine-sheet":  (None, 620),
    "w1440-room-rooms":         (1300, 1180),
    "wt-speccing-1440":         (1300, 1180),
    "wt-finalize-head":         (None, 948),
    "wt-delivery-project-1440": (1300, 1180),
    "w1440-red-letter-zone":    (None, 948),
}

total = 0
for name, (crop_h, target_w) in SPEC.items():
    src = os.path.join(SRC, name + ".png")
    if not os.path.exists(src):
        print("MISSING", name)
        continue
    im = Image.open(src).convert("RGB")
    w, h = im.size
    if crop_h and h > crop_h:
        im = im.crop((0, 0, w, crop_h))
        w, h = im.size
    if w > target_w:
        ratio = target_w / w
        im = im.resize((target_w, max(1, int(h * ratio))), Image.LANCZOS)
    dst = os.path.join(OUT, name + ".jpg")
    im.save(dst, "JPEG", quality=84, optimize=True, progressive=True)
    size = os.path.getsize(dst)
    total += size
    print("%-28s %5dx%-5d %7.1f KB" % (name, im.size[0], im.size[1], size / 1024))
print("TOTAL %.2f MB  (base64 ≈ %.2f MB)" % (total / 1048576, total * 1.34 / 1048576))

import json
manifest = {}
for name in SPEC:
    p = os.path.join(OUT, name + ".jpg")
    if os.path.exists(p):
        with Image.open(p) as m:
            manifest[name] = {"w": m.size[0], "h": m.size[1]}
with open(os.path.join(OUT, "manifest.json"), "w") as fh:
    json.dump(manifest, fh, indent=1)
print("manifest:", len(manifest), "entries")
