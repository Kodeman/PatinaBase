#!/bin/zsh
# GAP7 atomic deep-link probe: ensure signed-in Today, then openurl, capture.
export PATH=/Users/kody/.blitz/python/bin:$PATH
U=670DE752-BA1B-40C1-899E-57B50D5743B5
D=/Users/kody/Code/patina-merged/artifacts/ios-testflight-polish-2026-09-01/shots/GAP7
URL="$1"; SHOT="$2"
dump() { idb ui describe-all --udid $U 2>/dev/null | python3 -c "
import sys,json
try: d=json.loads(sys.stdin.read())
except Exception: print('AX dump failed'); raise SystemExit
for e in d[:18]:
    l=e.get('AXLabel')
    if l: print(' *',repr(l)[:120], e.get('role'))
"; }
ok=0
for try in 1 2 3; do
  xcrun simctl terminate $U cloud.patina.app >/dev/null 2>&1
  /bin/sleep 0.4
  xcrun simctl launch $U cloud.patina.app -DeploymentTarget local -PatinaFlags house-widget >/dev/null 2>&1
  /bin/sleep 6
  pre=$(dump)
  if print -r -- "$pre" | grep -q "Your Studio"; then ok=1; break; fi
  echo "precondition attempt $try FAILED"; print -r -- "$pre" | head -4
done
if [ $ok -eq 0 ]; then echo "ABORT: could not reach signed-in Today"; exit 1; fi
echo "precondition OK $(date +%H:%M:%S) — signed-in Today"
xcrun simctl openurl $U "$URL"
t0=$(date +%s.%N)
/bin/sleep 2.5
xcrun simctl io $U screenshot "$D/$SHOT" >/dev/null 2>&1
echo "### after $URL  $(date +%H:%M:%S)"
dump
