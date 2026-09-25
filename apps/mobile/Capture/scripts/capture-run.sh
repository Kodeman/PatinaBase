#!/usr/bin/env bash
# capture-run.sh — the "run" half of the Claude Code <-> Xcode loop.
# Generates the project, builds for the simulator, boots it, installs, and
# launches the Capture app — optionally jumping straight to one of the 33
# screens via the `-CaptureScreen <suffix>` harness.
#
# (capture-gate.sh is the "verify" half: build / unit tests / lint.)
#
# Usage:
#   scripts/capture-run.sh                       # open to the real entry (viewfinder/onboarding)
#   scripts/capture-run.sh C5.specimen-sheet     # jump to a specific screen
#   scripts/capture-run.sh T1.settings
#
# CAPTURE_SIM_UDID is required — this lane's OWN simulator clone, the same
# variable capture-gate.sh reads. The script refuses to guess; see below.
#
# Screen suffixes are the tail of each CaptureScreenID, e.g.
#   O1.welcome  C1.viewfinder  C5.specimen-sheet  N1.tag-ocr  S3.destination
#   V3.detail   U1.sync        U2.library-search  T1.settings  T2.account
# (full list: CaptureKit/.../CaptureScreenID.swift)
#
# After this prints "running", drive the app from Claude Code with the
# blitz-iphone MCP against this lane's udid ($CAPTURE_SIM_UDID) — not "booted",
# which is whichever lane's simulator happens to be up:
#   get_screenshot · describe_screen · scan_ui · device_action (tap/swipe/input-text)
set -euo pipefail
cd "$(dirname "$0")/.."

BUNDLE_ID="cloud.patina.field"
SCREEN="${1:-}"

# The same per-checkout DerivedData capture-gate.sh builds into, outside the
# worktree (see its header). The key hashes this checkout's absolute path.
PROJECT_DIR="$PWD"                                   # apps/mobile/Capture
PATINA_DERIVED_ROOT="${PATINA_DERIVED_ROOT:-$HOME/Library/Caches/patina-derived}"
KEY="capture-$(printf %s "$PROJECT_DIR" | shasum -a 256 | cut -c1-12)"
DERIVED="$PATINA_DERIVED_ROOT/$KEY/DerivedData"

# --- the simulator is explicit, or this refuses to guess ----------------------
# This resolved ${CAPTURE_SIM:-iPhone 17} by NAME — the same device in every
# concurrent Field lane, so two lanes installed over each other's app, and a
# name the installed runtimes need not contain at all. Same contract as
# capture-gate.sh sim_destination(). Checked BEFORE generate_project.rb, which
# rm -rf's the TRACKED Capture.xcodeproj: a run that is going to refuse must
# refuse before it has rewritten the working tree.
# Pinned by scripts/capture-gate-guard.test.sh.
if [[ -z "${CAPTURE_SIM_UDID:-}" ]]; then
  printf '%s\n' \
    "✘ CAPTURE_SIM_UDID is unset." \
    "" \
    "capture-run.sh needs an explicit simulator udid: this lane's OWN clone —" \
    "never a shared device, never 'booted', never a device name. CAPTURE_SIM" \
    "(a device NAME) is no longer read. Create the clone and export its udid:" \
    "" \
    "  xcrun simctl list devices                   # pick a source; note its udid" \
    "  xcrun simctl shutdown <source-udid>         # clone refuses a booted source" \
    '  export CAPTURE_SIM_UDID="$(xcrun simctl clone <source-udid> field-<lane>)"' >&2
  exit 2
fi
DEVICE_ID="$CAPTURE_SIM_UDID"

echo "→ regenerating project"
ruby scripts/generate_project.rb >/dev/null

echo "→ building (Debug · iphonesimulator)"
# CHECKOUT maps the hashed dir back to its checkout, so scripts/repo-gc.sh can
# sweep the dirs of worktrees that no longer exist.
mkdir -p "$PATINA_DERIVED_ROOT/$KEY"
printf '%s\n' "$PROJECT_DIR" > "$PATINA_DERIVED_ROOT/$KEY/CHECKOUT"
xcodebuild build -project Capture.xcodeproj -scheme Capture \
  -configuration Debug -sdk iphonesimulator \
  -destination "platform=iOS Simulator,id=$DEVICE_ID" \
  -derivedDataPath "$DERIVED" CODE_SIGNING_ALLOWED=NO -quiet

APP="$DERIVED/Build/Products/Debug-iphonesimulator/Capture.app"
[ -d "$APP" ] || { echo "✘ built app not found at $APP"; exit 1; }

echo "→ booting simulator"
xcrun simctl boot "$DEVICE_ID" 2>/dev/null || true   # no-op if already booted
open -a Simulator
xcrun simctl bootstatus "$DEVICE_ID" >/dev/null 2>&1 || true

echo "→ installing"
xcrun simctl install "$DEVICE_ID" "$APP"

if [ -n "$SCREEN" ]; then
  echo "→ launching at screen $SCREEN"
  xcrun simctl launch "$DEVICE_ID" "$BUNDLE_ID" -CaptureScreen "$SCREEN"
else
  echo "→ launching"
  xcrun simctl launch "$DEVICE_ID" "$BUNDLE_ID"
fi

echo "✔ running on $DEVICE_ID — bundle $BUNDLE_ID"
echo "  drive from Claude Code via blitz-iphone (udid \"$DEVICE_ID\"):"
echo "    get_screenshot · describe_screen · scan_ui · device_action"
