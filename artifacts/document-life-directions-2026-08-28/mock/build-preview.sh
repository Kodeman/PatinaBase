#!/usr/bin/env bash
# Build mock/preview.html: every mock fragment, grouped by lane, at natural
# size, stacked -- for a designer to eyeball a lane's mocks together without
# running the whole deck build.
#
#   bash mock/build-preview.sh
#
# For each lane in today/a/b/c, every mock/fragments/<lane>-*.html is stacked
# in filename order, unscaled (no dk-mock transform -- this is a raw preview,
# not the deck), with kit.css + the base64 font faces + all three direction
# stylesheets inlined (a lane script can borrow another lane's classes during
# review) and every mock/img/*.jpg product crop inlined as a --crop-<name>
# CSS variable so background-image:var(--crop-*) fragments render. A missing
# direction-{a,b,c}.css is tolerated (empty) -- Phase 0 has none yet.
#
# Then shoot it:
#   cd /Users/kody/Code/patina-merged/apps/designer-portal
#   node /Users/kody/Code/patina-merged/artifacts/document-life-directions-2026-08-28/mock/shoot-preview.mjs
# Not `set -u`: macOS ships bash 3.2, which treats a nullglob-emptied array
# reference (${files[@]}) as an unbound variable under nounset -- a known
# bash <4.4 bug, not a real hygiene issue here.
set -eo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOCK="$HERE"
FRAGMENTS="$MOCK/fragments"
IMG="$MOCK/img"
OUT="$MOCK/preview.html"

LANES=(today a b c)

read_or_empty() {
  if [ -f "$1" ]; then cat "$1"; else printf ''; fi
}

{
  printf '<!doctype html><html><head><meta charset="utf-8">\n'
  printf '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
  printf '<title>Mock preview -- The Life Review</title>\n'
  printf '<style>\n'
  printf '*{box-sizing:border-box}\n'
  printf 'body{margin:0;padding:40px;background:#ECE6DB;font-family:-apple-system,sans-serif}\n'
  printf '.lane{margin-bottom:72px}\n'
  printf '.lane > h2{font:600 22px/1.3 -apple-system,sans-serif;margin:0 0 4px;color:#1E1B18}\n'
  printf '.lane > p.lane-empty{font:13px/1.5 -apple-system,sans-serif;color:#6A5C4D}\n'
  printf '.frag-name{font:11px/1.6 ui-monospace,monospace;color:#6A5C4D;margin:28px 0 6px;text-transform:uppercase;letter-spacing:.06em}\n'
  printf '.frag-wrap{border:1px solid rgba(30,27,24,.2);display:inline-block;max-width:100%%;overflow:auto}\n'

  read_or_empty "$MOCK/assets/fonts/fonts-data-uri.css"
  read_or_empty "$MOCK/kit.css"
  read_or_empty "$MOCK/direction-a.css"
  read_or_empty "$MOCK/direction-b.css"
  read_or_empty "$MOCK/direction-c.css"

  if [ -d "$IMG" ]; then
    for imgfile in "$IMG"/*.jpg; do
      [ -f "$imgfile" ] || continue
      base="$(basename "$imgfile" .jpg)"
      b64="$(base64 < "$imgfile" | tr -d '\n')"
      printf ':root{--crop-%s:url("data:image/jpeg;base64,%s")}\n' "$base" "$b64"
    done
  fi

  printf '</style>\n</head><body>\n'

  for lane in "${LANES[@]}"; do
    printf '<section class="lane" id="lane-%s">\n' "$lane"
    printf '<h2>Lane: %s</h2>\n' "$lane"
    shopt -s nullglob
    files=("$FRAGMENTS/$lane"-*.html)
    shopt -u nullglob
    if [ "${#files[@]}" -eq 0 ]; then
      printf '<p class="lane-empty">No fragments yet for lane %s.</p>\n' "$lane"
    fi
    for f in "${files[@]}"; do
      name="$(basename "$f")"
      printf '<p class="frag-name">%s</p>\n' "$name"
      printf '<div class="frag-wrap">\n'
      cat "$f"
      printf '</div>\n'
    done
    printf '</section>\n'
  done

  printf '</body></html>\n'
} > "$OUT"

echo "wrote $OUT"
