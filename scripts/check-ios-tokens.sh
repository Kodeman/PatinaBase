#!/usr/bin/env bash
#
# check-ios-tokens.sh — iOS design-token ratchet guard (Wave 3 / R22+R24)
#
# Greps apps/mobile/Patina/Patina/Features/ for three classes of
# design-token violations and FAILS (exit 1) only when a category's count
# EXCEEDS the baseline recorded below — i.e. new violations were added.
# Lowering a count is always fine (and you should then lower the baseline
# here to lock in the win).
#
# Categories:
#   A  .font(.system(size:        — raw system fonts (should be a
#                                   PatinaTypography token; SF Symbol icon
#                                   glyphs are the accepted exceptions and
#                                   make up the baseline)
#   B  .font(.custom( w/o relativeTo on the same line
#                                 — custom fonts that won't scale with
#                                   Dynamic Type (fixed-size monogram/glyph
#                                   decorations are the accepted exceptions)
#   C  PatinaColors.(offWhite|softCream|charcoal|warmWhite|mocha)
#                                 — direct legacy palette colors; the
#                                   dark-mode migration regression guard.
#                                   Use PatinaColors.Text/Background/
#                                   Interactive semantic roles instead.
#                                   (Deliberate dark surfaces — companion
#                                   panel, toasts, dark hero overlays —
#                                   make up the baseline.)
#
# Usage:
#   ./scripts/check-ios-tokens.sh          # run the check (CI-friendly)
#
# Updating baselines: after deliberately removing violations (or adding a
# documented exception), re-run the counts and edit the BASELINE_* constants.
#
set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FEATURES_DIR="$REPO_ROOT/apps/mobile/Patina/Patina/Features"

# ── Baselines (re-baselined 2026-07-09 for the iOS alignment Wave 3 B.3
#    ratchet; pins current reality, was A=148 / B=8 / C=146) ───────────────────
BASELINE_SYSTEM_FONT=137      # category A — lines
BASELINE_CUSTOM_NO_RELATIVE=8 # category B — lines
BASELINE_LEGACY_COLOR=143     # category C — occurrences

if [ ! -d "$FEATURES_DIR" ]; then
  echo "check-ios-tokens: features dir not found: $FEATURES_DIR" >&2
  exit 2
fi

PATTERN_A='\.font\(\.system\(size:'
PATTERN_B='\.font\(\.custom\('
PATTERN_C='PatinaColors\.(offWhite|softCream|charcoal|warmWhite|mocha)\b'

# Category A: lines with raw .font(.system(size:
matches_a="$(grep -rnE --include='*.swift' "$PATTERN_A" "$FEATURES_DIR" || true)"
count_a="$(printf '%s' "$matches_a" | grep -c . || true)"

# Category B: lines with .font(.custom( that lack relativeTo on the same line
matches_b="$(grep -rnE --include='*.swift' "$PATTERN_B" "$FEATURES_DIR" | grep -v 'relativeTo' || true)"
count_b="$(printf '%s' "$matches_b" | grep -c . || true)"

# Category C: individual occurrences of direct legacy palette colors
matches_c="$(grep -rnoE --include='*.swift' "$PATTERN_C" "$FEATURES_DIR" || true)"
count_c="$(printf '%s' "$matches_c" | grep -c . || true)"

failed=0

report_category() {
  local label="$1" count="$2" baseline="$3" matches="$4"
  if [ "$count" -gt "$baseline" ]; then
    failed=1
    echo ""
    echo "FAIL [$label]: $count violations (baseline $baseline) — new violations introduced."
    echo "Per-file counts:"
    printf '%s\n' "$matches" \
      | sed "s|^$FEATURES_DIR/||" \
      | cut -d: -f1 \
      | sort | uniq -c | sort -rn \
      | sed 's/^/  /'
    echo "Offending lines:"
    printf '%s\n' "$matches" | sed "s|^$FEATURES_DIR/||" | sed 's/^/  /'
  else
    echo "OK   [$label]: $count violations (baseline $baseline)"
  fi
}

echo "check-ios-tokens — ratchet guard over $FEATURES_DIR"
report_category "A: raw .font(.system(size:)" "$count_a" "$BASELINE_SYSTEM_FONT" "$matches_a"
report_category "B: .font(.custom() without relativeTo" "$count_b" "$BASELINE_CUSTOM_NO_RELATIVE" "$matches_b"
report_category "C: direct legacy PatinaColors palette" "$count_c" "$BASELINE_LEGACY_COLOR" "$matches_c"

if [ "$failed" -ne 0 ]; then
  echo ""
  echo "New token violations detected. Either:"
  echo "  • use a PatinaTypography / semantic PatinaColors token, or"
  echo "  • for a deliberate exception (icon glyph, dark surface), add a"
  echo "    comment at the call site and bump the matching BASELINE_* in"
  echo "    scripts/check-ios-tokens.sh in the same commit."
  exit 1
fi

echo "All categories at or below baseline."
exit 0
