#!/usr/bin/env bash
# SQ-351 browser-parse spike: generate synthetic decks into $TMPDIR, run the headless-Chromium
# benchmark, print the results table. Nothing generated lands in the repo.
#
#   ./run.sh          full run: 10/50/100/150 MB decks x 3 unzip strategies + ZIP64 variants
#   ./run.sh quick    10 MB deck only (smoke check)
#
# Needs: python3, node >= 20, network to PyPI and npm (first run only), and the Playwright
# Chromium headless shell in the Playwright cache (pnpm exec playwright install chromium).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
MODE="${1:-full}"
WORK="${TMPDIR:-/tmp}/deck-spike"
DECKS="$WORK/decks"
DEPS="$WORK/node"
mkdir -p "$WORK" "$DECKS" "$DEPS"

# Python: python-pptx + Pillow in a throwaway venv
if [ ! -x "$WORK/venv/bin/python" ]; then
  if command -v uv >/dev/null 2>&1; then
    UV_CACHE_DIR="$WORK/uv-cache" uv venv -q "$WORK/venv" --python "$(command -v python3)"
    UV_CACHE_DIR="$WORK/uv-cache" uv pip install -q --python "$WORK/venv/bin/python" python-pptx Pillow
  else
    python3 -m venv "$WORK/venv"
    "$WORK/venv/bin/pip" install -q python-pptx Pillow
  fi
fi

# Node: fflate (the candidate dependency) + playwright-core pinned to the repo's Playwright version
if [ ! -d "$DEPS/node_modules/fflate" ] || [ ! -d "$DEPS/node_modules/playwright-core" ]; then
  echo '{"name":"deck-spike-deps","private":true}' > "$DEPS/package.json"
  npm_config_cache="$WORK/npm-cache" npm install --prefix "$DEPS" --no-audit --no-fund --silent \
    fflate@0.8.3 playwright-core@1.58.2
fi

if [ "$MODE" = quick ]; then SIZES=(10); else SIZES=(10 50 100 150); fi
need=0
for mb in "${SIZES[@]}"; do [ -f "$DECKS/deck-$mb.pptx.truth.json" ] || need=1; done
if [ "$need" = 1 ]; then
  "$WORK/venv/bin/python" "$HERE/gen_decks.py" "$DECKS" "${SIZES[@]}"
fi

if [ "$MODE" = quick ]; then
  node "$HERE/bench.mjs" "$DECKS" "$DEPS" "$WORK/results-quick.json" quick
else
  node "$HERE/bench.mjs" "$DECKS" "$DEPS" "$WORK/results.json"
fi
