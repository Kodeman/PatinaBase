#!/usr/bin/env python3
"""Assembles _preview-a.html from the built fragments (render-check harness)."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
ORDER = [
    ("a-M1.html", "M1 · Today — activeProject (Ruth) · light"),
    ("a-M1-dark.html", "M1 · Today — activeProject · dark"),
    ("a-M2.html", "M2 · Today — discovering (Maya) · light"),
    ("a-M3.html", "M3 · Piece detail — discovering · light"),
    ("a-M3-dark.html", "M3 · Piece detail — activeProject · dark"),
    ("a-M4.html", "M4 · The room — Living Room"),
    ("a-M5a.html", "M5a · Order sheet"),
    ("a-M5b.html", "M5b · Payment hand-off"),
    ("a-M5b-success.html", "M5b · Safari success page"),
    ("a-M5c.html", "M5c · Order placed"),
    ("a-M6a.html", "M6 · Lock Screen push + widget"),
    ("a-M6b.html", "M6 · the Today it opens"),
    ("a-M7.html", "M7 · Companion, expanded"),
    ("a-M8.html", "M8 · The permission moment"),
    ("a-M9.html", "M9 · Today — engaged (James)"),
]
sprite = open(os.path.join(HERE, "_sprite.html")).read()
parts = []
for f, cap in ORDER:
    parts.append('<figure><figcaption>%s</figcaption>\n%s</figure>' %
                 (cap, open(os.path.join(HERE, f)).read()))
SHEETS = ["a-M1.sheet.html","a-M2.sheet.html","a-M3.sheet.html","a-M4.sheet.html",
          "a-M5.sheet.html","a-M6.sheet.html","a-M7.sheet.html","a-M8.sheet.html","a-M9.sheet.html"]
sheets = "\n".join('<section class="sheet-block">%s</section>' %
                   open(os.path.join(HERE, f)).read() for f in SHEETS)
html = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<base href="../">
<title>Direction A — mock render check</title>
<link rel="stylesheet" href="kit.css">
<style>
  body { background:var(--pat-bg); margin:0; padding:40px; font-family:var(--pat-sans); }
  .rail { display:flex; gap:56px; align-items:flex-start; flex-wrap:nowrap; }
  figure { margin:0; }
  figcaption { font:600 12px/1.4 var(--pat-sans); text-transform:uppercase; letter-spacing:1.5px;
    color:var(--pat-text-muted); padding:0 0 14px 13px; white-space:nowrap; }
  .sheets { max-width:900px; margin-top:64px; }
  .sheet-block { margin-bottom:44px; }
</style></head><body>
%s
<div class="rail">
%s
</div>
<div class="sheets">
%s
</div>
</body></html>""" % (sprite, "\n".join(parts), sheets)
open(os.path.join(HERE, "_preview-a.html"), "w").write(html)
print("preview:", len(html))
