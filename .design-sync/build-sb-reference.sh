#!/usr/bin/env bash
# Build the reference Storybook that design-sync uses as its fidelity oracle.
#
# Why this script exists (see .design-sync/NOTES.md for the full story):
#   - @patina/design-system declares tailwindcss ^4 but is authored for v3
#     (v3 @tailwind directives, v3 JS config, `tailwindcss` as a postcss
#     plugin). Its own `storybook build` therefore fails at postcss. Production
#     (the Next.js portals) uses tailwindcss 3.4.x — that is the truth to match.
#   - The DS's tailwind.config wraps tokens as hsl(var(--x)) but the tokens are
#     oklch triplets; the portals wrap them as oklch(var(--x)). So we compile
#     with an oklch-corrected copy of the DS config.
#   - The DS's typography/fonts depend on portal-provided CSS vars + fonts; we
#     inject .design-sync/portal-contract.css into the preview.
#
# The DS's committed files are patched in place, the build runs, and an EXIT
# trap restores them — the repo is left byte-identical to how it started.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG="$REPO_ROOT/packages/patina-design-system"
OUT="$REPO_ROOT/.design-sync/sb-reference"
BAK="$REPO_ROOT/.design-sync/.cache/sb-build-backup"
mkdir -p "$BAK" "$REPO_ROOT/.design-sync/.cache/logs"

V3ABS="$(ls -d "$REPO_ROOT"/node_modules/.pnpm/tailwindcss@3*/node_modules/tailwindcss 2>/dev/null | head -1)"
if [ -z "$V3ABS" ]; then echo "FATAL: tailwindcss@3 not found in pnpm store" >&2; exit 2; fi
echo "using tailwind v3 at: $V3ABS"

POSTCSS="$PKG/postcss.config.mjs"
PREVIEW="$PKG/.storybook/preview.ts"
OKLCH_CFG="$PKG/tailwind.dssync-oklch.ts"
PREVIEW_HEAD="$PKG/.storybook/preview-head.html"
CSS_ENTRY="$PKG/.dssync-tailwind.css"        # cssEntry the converter reads (gitignored)
GOOGLE_FONTS='https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,500;1,600&family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300;1,400;1,500&display=swap'

HADHEAD=0; [ -f "$PREVIEW_HEAD" ] && { cp -f "$PREVIEW_HEAD" "$BAK/preview-head.html"; HADHEAD=1; }
restore() {
  [ -f "$BAK/postcss.config.mjs" ] && cp -f "$BAK/postcss.config.mjs" "$POSTCSS"
  [ -f "$BAK/preview.ts" ] && cp -f "$BAK/preview.ts" "$PREVIEW"
  rm -f "$OKLCH_CFG"
  if [ "$HADHEAD" = 1 ]; then cp -f "$BAK/preview-head.html" "$PREVIEW_HEAD"; else rm -f "$PREVIEW_HEAD"; fi
  echo "restored DS files to original state"
}
trap restore EXIT

# 1. back up the two files we patch
cp -f "$POSTCSS" "$BAK/postcss.config.mjs"
cp -f "$PREVIEW" "$BAK/preview.ts"

# preview-head.html: a remote <link> to the brand fonts. The oracle loads them,
# and — because it appears in iframe.html — the converter's scrapeRemoteImports
# hoists it to a top-level @import url(...) in the shipped styles.css (a mid-file
# @import appended via cssEntry would be invalid). Temp; removed by restore().
cat > "$PREVIEW_HEAD" <<EOF
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="$GOOGLE_FONTS">
EOF

# 2. oklch-corrected copy of the DS tailwind config (not named tailwind.config.*
#    so tailwind won't auto-discover it; referenced explicitly by postcss below)
# hsl(var(--x)) -> oklch(var(--x) / <alpha-value>): oklch matches production
# (portal) AND the <alpha-value> slot lets Tailwind opacity modifiers
# (bg-primary/20, bg-muted-foreground/50 in globals.css) resolve. Without it,
# tailwind v3 rejects those @apply rules ("class does not exist").
sed -E 's#hsl\(var\((--[a-z-]+)\)\)#oklch(var(\1) / <alpha-value>)#g' "$PKG/tailwind.config.ts" > "$OKLCH_CFG"

# 3. patched postcss: pin tailwind v3 + the oklch config
cat > "$POSTCSS" <<EOF
// TEMP (design-sync reference build) — restored by build-sb-reference.sh
import tailwindcss from '$V3ABS/lib/index.js'
import autoprefixer from 'autoprefixer'
export default {
  plugins: [
    tailwindcss('./tailwind.dssync-oklch.ts'),
    autoprefixer,
  ],
}
EOF

# 4. inject the portal font/token contract into the preview graph so the
#    compiled (and later scraped) CSS carries the brand fonts + vars
printf "\nimport '../../../.design-sync/portal-contract.css'\n" >> "$PREVIEW"

# 5. build
cd "$PKG"
echo "building reference storybook -> $OUT"
# STORYBOOK_DISABLE_TELEMETRY + </dev/null: on a failed build storybook prompts
# "send anonymous crash reports? (Y/n)" and blocks on stdin, hanging the script.
STORYBOOK_DISABLE_TELEMETRY=1 NODE_OPTIONS=--max-old-space-size=8192 \
  npx storybook build --disable-telemetry -c .storybook -o "$OUT" \
  > "$REPO_ROOT/.design-sync/.cache/logs/sb-build.log" 2>&1 < /dev/null
CODE=$?
echo "STORYBOOK_BUILD_EXIT=$CODE"
if [ -s "$OUT/iframe.html" ]; then
  echo "OK iframe.html: $(wc -c < "$OUT/iframe.html") bytes"
  # Export the compiled Tailwind CSS as the converter's cssEntry. The DS ships
  # no dist CSS and the storybook scrape is skipped because the JS bundle drags
  # react-day-picker's style.css into _ds_bundle.css; cfg.cssEntry appends this
  # (utilities + oklch tokens + typography + font vars) to _ds_bundle.css. Strip
  # the leading google-fonts @import (fonts load via the scraped <link> above; a
  # mid-file @import would be invalid).
  BIG="$(ls -S "$OUT"/assets/preview-*.css 2>/dev/null | head -1)"
  if [ -n "$BIG" ]; then
    sed -E 's#@import"https://[^"]*";##g' "$BIG" > "$CSS_ENTRY"
    echo "cssEntry: $CSS_ENTRY ($(wc -c < "$CSS_ENTRY") bytes) from $(basename "$BIG")"
  else
    echo "WARN: no preview-*.css found in $OUT/assets — cssEntry not updated" >&2
  fi
else
  echo "FAIL: iframe.html missing/empty"; tail -20 "$REPO_ROOT/.design-sync/.cache/logs/sb-build.log" >&2
fi
exit $CODE
