#!/bin/zsh
export PATH=/Users/kody/.blitz/python/bin:$PATH
U=670DE752-BA1B-40C1-899E-57B50D5743B5
D=/Users/kody/Code/patina-merged/artifacts/ios-testflight-polish-2026-09-01/shots/GAP7
URL="$1"; SHOT="$2"; MODE="$3"   # MODE=cold | running
dump() { idb ui describe-all --udid $U 2>/dev/null | python3 -c "
import sys,json
try: d=json.loads(sys.stdin.read())
except Exception: print('AX dump failed'); raise SystemExit
for e in d[:10]:
    l=e.get('AXLabel')
    if l: print('   *',repr(l)[:110], e.get('role'))
"; }
if [ "$MODE" = "running" ]; then
  ok=0
  for try in 1 2 3; do
    xcrun simctl terminate $U cloud.patina.app >/dev/null 2>&1; /bin/sleep 0.4
    xcrun simctl launch $U cloud.patina.app >/dev/null 2>&1     # no args = production = signed out
    /bin/sleep 6
    pre=$(dump)
    if print -r -- "$pre" | grep -q "Welcome home"; then ok=1; break; fi
    echo "precondition attempt $try FAILED"; print -r -- "$pre" | head -3
  done
  [ $ok -eq 0 ] && { echo "ABORT: could not reach Welcome"; exit 1; }
  echo "precondition OK $(date +%H:%M:%S) — app RUNNING at the Welcome/auth wall"
else
  xcrun simctl terminate $U cloud.patina.app >/dev/null 2>&1
  /bin/sleep 1
  echo "app terminated — firing COLD $(date +%H:%M:%S)"
fi
xcrun simctl openurl $U "$URL"
/bin/sleep 2
echo "### +2s after $URL"; dump
/bin/sleep 3
echo "### +5s"; dump | head -6
xcrun simctl io $U screenshot "$D/$SHOT" >/dev/null 2>&1
