#!/bin/sh
# SQ-952: run every local scenario sequentially (one Chromium at a time).
# Usage: STATE=<storageState.json> sh run-all.sh
cd "$(dirname "$0")" || exit 1
for spec in "P1 3 1440" "P1 3 390" "P1hard 3 1440" "P2 3 1440" "P2 3 390" "P2hard 3 1440" "P3 3 1440" "P3hard 3 1440" "P4 3 1440" "P5 3 1440" "P6 3 1440" "P10 3 1440"; do
  set -- $spec
  echo "== $1 $3"
  node lab.mjs run "$1" "$2" "$3" || echo "!! $1 $3 exit $?"
done
for s in P1 P2 P3 P4 P5; do
  echo "== shots $s"
  node lab.mjs shots "$s" || echo "!! shots $s exit $?"
done
echo "ALL DONE"
