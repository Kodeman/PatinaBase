#!/usr/bin/env bash
# capture-run.sh — the "run" half of the Claude Code <-> Xcode loop.
# Generates the project, builds for the simulator, boots it, installs, and
# launches the Capture app — optionally jumping straight to one of the 32
# screens via the `-CaptureScreen <suffix>` harness.
#
# (capture-gate.sh is the "verify" half: build / unit tests / lint.)
#
# Usage:
#   scripts/capture-run.sh                       # open to the real entry (viewfinder/onboarding)
#   scripts/capture-run.sh C5.specimen-sheet     # jump to a specific screen
#   scripts/capture-run.sh T1.settings
#   CAPTURE_SIM="iPhone 17 Pro" scripts/capture-run.sh N3.measure
#
# Screen suffixes are the tail of each CaptureScreenID, e.g.
#   O1.welcome  C1.viewfinder  C5.specimen-sheet  N1.tag-ocr  S3.destination
#   V3.detail   U1.sync        U2.library-search  T1.settings  T2.account
# (full list: CaptureKit/.../CaptureScreenID.swift)
#
# After this prints "running", drive the app from Claude Code with the
# blitz-iphone MCP against udid "booted":
#   get_screenshot · describe_screen · scan_ui · device_action (tap/swipe/input-text)
set -euo pipefail
cd "$(dirname "$0")/.."

SIM="${CAPTURE_SIM:-iPhone 17}"
BUNDLE_ID="cloud.patina.capture"
DERIVED=".build/derived"          # under the gitignored .build/
SCREEN="${1:-}"

echo "→ regenerating project"
ruby scripts/generate_project.rb >/dev/null

echo "→ resolving simulator: $SIM (newest available iOS runtime)"
DEVICE_ID=$(ruby -rjson -e '
  sim = ARGV[0]
  devices = JSON.parse(`xcrun simctl list devices available --json`)["devices"]
  best = nil; best_ver = [-1, -1]
  devices.each do |runtime, devs|
    next unless runtime =~ /SimRuntime\.iOS-(\d+)-(\d+)/
    ver = [$1.to_i, $2.to_i]
    devs.each do |d|
      next unless d["name"] == sim
      if (ver <=> best_ver) >= 0
        best = d["udid"]; best_ver = ver
      end
    end
  end
  abort "no available simulator named #{sim.inspect} — try `xcrun simctl list devices available`" unless best
  print best
' "$SIM")
echo "  udid $DEVICE_ID"

echo "→ building (Debug · iphonesimulator)"
xcodebuild build -project Capture.xcodeproj -scheme Capture \
  -configuration Debug -sdk iphonesimulator \
  -destination "id=$DEVICE_ID" \
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

echo "✔ running on \"$SIM\" ($DEVICE_ID) — bundle $BUNDLE_ID"
echo "  drive from Claude Code via blitz-iphone (udid \"booted\"):"
echo "    get_screenshot · describe_screen · scan_ui · device_action"
