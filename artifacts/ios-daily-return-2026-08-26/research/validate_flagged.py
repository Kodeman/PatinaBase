#!/usr/bin/env python3
import os, json
from PIL import Image

SHOTS_DIR = "/Users/kody/Code/patina-merged/artifacts/ios-daily-return-2026-08-26/shots"

flagged = ["c-00-start-state.png","c-21-notifications-signed-in.png","c-30-after-keychain-signout.png",
"d-04-piece-detail.png","d-06a-room-summary-light-locked.png","d-10-notifications.png",
"d-check-after-tap.png","d-check-studio-bottom2.png","d-check12.png","d-check3.png",
"d-check4-invoices-list.png","d-check5.png","d-check8.png","g-01-splash.png",
"g-02-first-screen-after-splash.png","g-27-room-with-recommendations.png","g-28-room-view-final.png",
"g-29-notifications-guest.png","g-38-relaunch-returning-guest.png","s-01-first-launch.png",
"s-04-relaunch-guest-persist.png","s-06-applescript-tap-test.png","s-07-helper-script-tap.png"]

for f in flagged:
    path = os.path.join(SHOTS_DIR, f)
    im = Image.open(path).convert("RGB")
    w, h = im.size
    small = im.resize((64, 64))
    colours = small.getcolors(64*64)
    n_distinct_full = len(colours) if colours else "many(>4096)"
    # extrema per channel over full image at reduced res
    extrema = small.convert("L").getextrema()
    # also count distinct colours over a denser 32x32 grid sample of ORIGINAL (not resized/interpolated)
    xs = [int(w * (i + 0.5) / 32) for i in range(32)]
    ys = [int(h * (j + 0.5) / 32) for j in range(32)]
    cols = set()
    for x in xs:
        for y in ys:
            x = min(x, w-1); y = min(y, h-1)
            cols.add(im.getpixel((x,y)))
    print(f, "| full-resize-64x64 distinct:", n_distinct_full, "| grayscale extrema:", extrema, "| 32x32-grid distinct:", len(cols))
