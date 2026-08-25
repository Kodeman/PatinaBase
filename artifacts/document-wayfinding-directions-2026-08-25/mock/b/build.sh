#!/usr/bin/env bash
# Assembles direction-b.html from the five self-contained screen fragments.
# Each M*.html is a <section class="mock-frame" data-screen="Mn" …> fragment;
# nothing here is generated — the parts are the source of truth.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/../direction-b.html"

{
cat <<'HEAD'
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Direction B — The Shop Ticket</title>
<link rel="stylesheet" href="../mock/kit.css" />
<link rel="stylesheet" href="../mock/direction-b.css" />
<style>
  html, body { margin: 0; padding: 0; background: var(--bg-primary, #FAF7F2); }
</style>
</head>
<body>
<div class="patina-mock b-deck">
  <header class="b-deck-head">
    <h1 class="b-deck-title">Direction B — The Shop Ticket</h1>
    <p class="b-deck-sub">The Document · Wayfinding Review · 2026-08-25 · five screens · the Vandersteen residence, Tuesday August 25</p>
  </header>
HEAD

for n in 1 2 3 4 5; do
  cat "$DIR/M$n.html"
done

cat <<'TAIL'
</div>
</body>
</html>
TAIL
} > "$OUT"

echo "wrote $OUT ($(wc -c < "$OUT") bytes)"
