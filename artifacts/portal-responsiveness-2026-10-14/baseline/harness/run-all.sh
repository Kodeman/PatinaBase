#!/bin/sh
# SQ-952 / SQ-966: run every local scenario sequentially (one Chromium at a time).
# Usage: STATE=<storageState.json> [OUT=<dir>] [BASE=http://localhost:3000] [SPECS="P6 3 1440;..."] [SHOTS=1] sh run-all.sh
# The default SPECS are the F17 set (US-34): P1-P10 plus the three hard loads, 3 runs each at 1440.
# SQ-952's original list also ran "P1 3 390" and "P2 3 390".
cd "$(dirname "$0")" || exit 1
SPECS=${SPECS:-"P1 3 1440;P1hard 3 1440;P2 3 1440;P2hard 3 1440;P3 3 1440;P3hard 3 1440;P4 3 1440;P5 3 1440;P6 3 1440;P7 3 1440;P8 3 1440;P9 3 1440;P10 3 1440"}
IFS=';'
for spec in $SPECS; do
  IFS=' '
  set -- $spec
  echo "== $1 $3"
  node lab.mjs run "$1" "$2" "$3" || echo "!! $1 $3 exit $?"
  IFS=';'
done
IFS=' '
if [ -n "$SHOTS" ]; then
  for s in P1 P2 P3 P4 P5; do
    echo "== shots $s"
    node lab.mjs shots "$s" || echo "!! shots $s exit $?"
  done
fi
echo "ALL DONE"
