#!/usr/bin/env bash
# Assembles mock/direction-a.html from the five self-contained screen parts.
# Run: bash mock/a/build.sh   (from anywhere — paths are absolute-from-script)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOCK="$(cd "$HERE/.." && pwd)"
OUT="$MOCK/direction-a.html"

{
  cat <<'HEAD'
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Everything Prints</title>
<link rel="stylesheet" href="kit.css">
<link rel="stylesheet" href="direction-a.css">
<style>
  body { margin: 0; background: var(--bg-primary); }
  .a-sheetstack { padding: 40px; display: flex; flex-direction: column; gap: 48px; align-items: flex-start; }
  .a-deckhead { font-family: var(--font-display); font-size: 30px; font-weight: 500; color: var(--color-charcoal); }
  .a-decksub { margin-top: 6px; font-family: var(--font-meta); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--text-muted); }
</style>
</head>
<body class="patina-mock">
<div class="a-sheetstack">
<header>
  <h1 class="a-deckhead">Direction A — Everything Prints</h1>
  <p class="a-decksub">The Document · Wayfinding Review · 2026-08-25 · five screens · the Vandersteen residence</p>
</header>
HEAD

  for n in 1 2 3 4 5; do
    cat "$HERE/M${n}.html"
    echo
  done

  cat <<'FOOT'
</div>
</body>
</html>
FOOT
} > "$OUT"

echo "wrote $OUT ($(wc -c < "$OUT") bytes)"
