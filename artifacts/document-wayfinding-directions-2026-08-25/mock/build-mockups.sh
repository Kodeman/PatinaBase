#!/usr/bin/env bash
# Assembles mock/mockups.html — a side-by-side comparison of Direction A
# ("Everything Prints") and Direction B ("The Shop Ticket") across screens
# M1..M5, using the fragment files in mock/fragments/.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$HERE/mockups.html"
FRAG="$HERE/fragments"

row() {
  # $1 = screen id, $2 = zoom factor (css value), $3 = row title
  local n="$1" zoom="$2" title="$3"
  cat <<EOF
<section class="cmp-row" id="row-${n}">
  <h2 class="cmp-row-title">${title}</h2>
  <div class="cmp-pair">
    <div class="cmp-cell">
      <p class="cmp-lane cmp-lane-a">Direction A — Everything Prints</p>
      <div class="cmp-frame" style="zoom:${zoom}">
$(cat "$FRAG/a-${n}.html")
      </div>
    </div>
    <div class="cmp-cell">
      <p class="cmp-lane cmp-lane-b">Direction B — The Shop Ticket</p>
      <div class="cmp-frame" style="zoom:${zoom}">
$(cat "$FRAG/b-${n}.html")
      </div>
    </div>
  </div>
</section>
EOF
}

{
cat <<'HEAD'
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Wayfinding Mockups — A vs B</title>
<link rel="stylesheet" href="kit.css">
<link rel="stylesheet" href="direction-a.css">
<link rel="stylesheet" href="direction-b.css">
<style>
  html, body { margin: 0; background: var(--bg-primary, #FAF7F2); }
  .cmp-page { width: 1600px; margin: 0 auto; padding: 48px 40px 96px; box-sizing: border-box; }
  .cmp-head { margin-bottom: 40px; }
  .cmp-title { font-family: var(--font-display); font-size: 32px; font-weight: 500; color: var(--color-charcoal); margin: 0 0 8px; }
  .cmp-sub { font-family: var(--font-meta); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--text-muted); margin: 0; }
  .cmp-legend { margin-top: 18px; display: flex; gap: 28px; font-family: var(--font-meta); font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; }
  .cmp-legend-a::before, .cmp-legend-b::before { content: "●"; margin-right: 6px; }
  .cmp-legend-a { color: var(--color-clay, #A8532E); }
  .cmp-legend-b { color: var(--color-dusty-blue, #5C7A8A); }
  .cmp-row { border-top: 1px solid var(--border-hairline, #DCD5C8); padding: 36px 0; }
  .cmp-row:first-of-type { border-top: none; }
  .cmp-row-title { font-family: var(--font-meta); font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: var(--text-muted); margin: 0 0 20px; }
  .cmp-pair { display: flex; gap: 40px; align-items: flex-start; }
  .cmp-cell { flex: 1; min-width: 0; }
  .cmp-cell.cmp-cell-1to1 { flex: none; width: 390px; }
  .cmp-cell.cmp-cell-1to1 .cmp-frame { width: 390px; }
  .cmp-lane { font-family: var(--font-meta); font-size: 10px; letter-spacing: .08em; text-transform: uppercase; margin: 0 0 10px; padding-bottom: 6px; border-bottom: 1px solid var(--border-hairline, #DCD5C8); }
  .cmp-lane-a { color: var(--color-clay, #A8532E); }
  .cmp-lane-b { color: var(--color-dusty-blue, #5C7A8A); }
  .cmp-frame { border: 1px solid var(--border-hairline, #DCD5C8); overflow: hidden; background: var(--doc-paper, #fff); transform-origin: top left; }
  .cmp-frame figcaption { font-family: var(--font-body, Inter, sans-serif); font-size: 12.5px; line-height: 1.5; color: var(--text-secondary, #5B5347); padding: 12px 16px; background: var(--bg-secondary, #F2ECE0); border-top: 1px solid var(--border-hairline, #DCD5C8); }
  .cmp-row-m4 .cmp-pair { gap: 40px; }
</style>
</head>
<body class="patina-mock">
<div class="cmp-page">
  <header class="cmp-head">
    <h1 class="cmp-title">The Document — Wayfinding Review</h1>
    <p class="cmp-sub">Direction A vs Direction B · five screens · the Vandersteen residence · 2026-08-25</p>
    <div class="cmp-legend">
      <span class="cmp-legend-a">Direction A — Everything Prints</span>
      <span class="cmp-legend-b">Direction B — The Shop Ticket</span>
    </div>
  </header>
HEAD

row "M1" "0.5"  "M1 · /desk at 1440"
row "M2" "0.5"  "M2 · /doc project at 1440 — the fold"
row "M3" "0.56" "M3 · /doc project at 1280 — compact spine"

# M4 is mobile (390 wide) — render at 1:1, side by side, not scaled.
cat <<EOF
<section class="cmp-row cmp-row-m4" id="row-M4">
  <h2 class="cmp-row-title">M4 · /doc project at 390 — mobile, More sheet open</h2>
  <div class="cmp-pair">
    <div class="cmp-cell cmp-cell-1to1">
      <p class="cmp-lane cmp-lane-a">Direction A — Everything Prints</p>
      <div class="cmp-frame" style="zoom:1">
$(cat "$FRAG/a-M4.html")
      </div>
    </div>
    <div class="cmp-cell cmp-cell-1to1">
      <p class="cmp-lane cmp-lane-b">Direction B — The Shop Ticket</p>
      <div class="cmp-frame" style="zoom:1">
$(cat "$FRAG/b-M4.html")
      </div>
    </div>
  </div>
</section>
EOF

row "M5" "0.5"  "M5 · /doc at 1440 — a second document state"

cat <<'TAIL'
</div>
</body>
</html>
TAIL
} > "$OUT"

echo "wrote $OUT ($(wc -c < "$OUT") bytes)"
