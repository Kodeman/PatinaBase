#!/usr/bin/env bash
# capture-shots.sh — sweep every screen in the 32-screen matrix and save a PNG
# of each, using only the simulator + simctl (no MCP needed). The CLI "visual
# regression" counterpart to driving the app interactively via blitz-iphone.
#
# Builds + installs once, then for each CaptureScreenID: terminate → launch with
# `-CaptureScreen <suffix>` → screenshot. Output defaults to .build/shots/
# (gitignored); override with CAPTURE_SHOTS_DIR.
#
# Usage:
#   scripts/capture-shots.sh                      # all 32 screens
#   scripts/capture-shots.sh C5 N1 S3             # only the given screens (prefix match)
#   CAPTURE_SIM="iPhone 17 Pro" scripts/capture-shots.sh
set -euo pipefail
cd "$(dirname "$0")/.."

SIM="${CAPTURE_SIM:-iPhone 17}"
BUNDLE_ID="cloud.patina.capture"
DERIVED=".build/derived"
OUT="${CAPTURE_SHOTS_DIR:-.build/shots}"
SETTLE="${CAPTURE_SHOT_SETTLE:-1.4}"   # seconds to let a screen render before the shot

# The full screen matrix (suffix = tail of each CaptureScreenID).
ALL_SCREENS=(
  O1.welcome O2.connect O3.camera-priming O4.ready
  E1.app-icon E2.system-entry E3.share-sheet
  C1.viewfinder C2.framing C3.specimen-forms C4.multi-shot C5.specimen-sheet
  N1.tag-ocr N2.scan N3.measure N4.voice N5.smart-guess
  R1.low-light R2.ocr-fallback R3.denied R4.offline
  S1.assign S2.create-project S3.destination S4.saved S5.inbox
  V1.session-tray V2.cull V3.detail
  U1.sync U2.library-search T1.settings T2.account
)

# Optional filter: keep screens whose suffix starts with any given prefix (e.g. "C5", "N").
SCREENS=()
if [ "$#" -gt 0 ]; then
  for s in "${ALL_SCREENS[@]}"; do
    for want in "$@"; do
      if [[ "$s" == "$want"* ]]; then SCREENS+=("$s"); break; fi
    done
  done
else
  SCREENS=("${ALL_SCREENS[@]}")
fi
[ "${#SCREENS[@]}" -gt 0 ] || { echo "✘ no screens matched: $*"; exit 2; }

echo "→ regenerating project"
ruby scripts/generate_project.rb >/dev/null

DEVICE_ID=$(ruby -rjson -e '
  sim = ARGV[0]
  devices = JSON.parse(`xcrun simctl list devices available --json`)["devices"]
  best = nil; best_ver = [-1, -1]
  devices.each do |runtime, devs|
    next unless runtime =~ /SimRuntime\.iOS-(\d+)-(\d+)/
    ver = [$1.to_i, $2.to_i]
    devs.each { |d| (best = d["udid"]; best_ver = ver) if d["name"] == sim && (ver <=> best_ver) >= 0 }
  end
  abort "no available simulator named #{sim.inspect}" unless best
  print best
' "$SIM")

echo "→ building (Debug · iphonesimulator) — udid $DEVICE_ID"
xcodebuild build -project Capture.xcodeproj -scheme Capture \
  -configuration Debug -sdk iphonesimulator -destination "id=$DEVICE_ID" \
  -derivedDataPath "$DERIVED" CODE_SIGNING_ALLOWED=NO -quiet

APP="$DERIVED/Build/Products/Debug-iphonesimulator/Capture.app"
[ -d "$APP" ] || { echo "✘ built app not found at $APP"; exit 1; }

echo "→ booting + installing"
xcrun simctl boot "$DEVICE_ID" 2>/dev/null || true
open -a Simulator
xcrun simctl bootstatus "$DEVICE_ID" >/dev/null 2>&1 || true
xcrun simctl install "$DEVICE_ID" "$APP"

mkdir -p "$OUT"
echo "→ sweeping ${#SCREENS[@]} screen(s) → $OUT/"
for screen in "${SCREENS[@]}"; do
  xcrun simctl terminate "$DEVICE_ID" "$BUNDLE_ID" >/dev/null 2>&1 || true
  xcrun simctl launch "$DEVICE_ID" "$BUNDLE_ID" -CaptureScreen "$screen" >/dev/null
  sleep "$SETTLE"
  xcrun simctl io "$DEVICE_ID" screenshot "$OUT/$screen.png" >/dev/null 2>&1
  echo "  ✔ $screen.png"
done

echo "✔ ${#SCREENS[@]} screenshot(s) in $OUT/"
