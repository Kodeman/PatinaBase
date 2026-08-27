#!/usr/bin/env python3
import os, sys, subprocess, json

SHOTS_DIR = "/Users/kody/Code/patina-merged/artifacts/ios-daily-return-2026-08-26/shots"

try:
    from PIL import Image
    HAVE_PIL = True
except ImportError:
    HAVE_PIL = False

def sips_dims(path):
    try:
        out = subprocess.check_output(["sips", "-g", "pixelWidth", "-g", "pixelHeight", path], text=True, stderr=subprocess.STDOUT)
        w = h = None
        for line in out.splitlines():
            line = line.strip()
            if line.startswith("pixelWidth:"):
                w = int(line.split(":")[1].strip())
            elif line.startswith("pixelHeight:"):
                h = int(line.split(":")[1].strip())
        return w, h
    except Exception as e:
        return None, None

def sample_colours(path, n=64):
    if not HAVE_PIL:
        return None
    try:
        im = Image.open(path).convert("RGB")
        w, h = im.size
        import itertools
        cols = set()
        # sample an 8x8 grid across the image
        xs = [int(w * (i + 0.5) / 8) for i in range(8)]
        ys = [int(h * (j + 0.5) / 8) for j in range(8)]
        for x in xs:
            for y in ys:
                x = min(x, w - 1)
                y = min(y, h - 1)
                cols.add(im.getpixel((x, y)))
        return len(cols)
    except Exception as e:
        return None

results = []
files = sorted(f for f in os.listdir(SHOTS_DIR) if f.endswith(".png"))
for f in files:
    path = os.path.join(SHOTS_DIR, f)
    size = os.path.getsize(path)
    w, h = sips_dims(path)
    distinct = sample_colours(path)
    flag_size = size < 20 * 1024
    flag_flat = (distinct is not None and distinct <= 2)
    results.append({
        "file": f,
        "size_bytes": size,
        "width": w,
        "height": h,
        "distinct_colours_64": distinct,
        "flag_undersize": flag_size,
        "flag_flat": flag_flat,
    })

print(json.dumps(results, indent=2))
