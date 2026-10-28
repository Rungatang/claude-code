#!/usr/bin/env bash
# Run every automated check of Hollow Hours and print a summary.
#   tools/check.sh            (all checks; takes a few minutes)
#   tools/check.sh quick      (syntax, layouts, smoke test only)
cd "$(dirname "$0")/.."
mkdir -p renders/tests
pass=(); fail=()
run() { local name="$1"; shift; local out; if out=$("$@" 2>&1); then pass+=("$name"); else fail+=("$name"); echo "---- $name FAILED"; echo "$out" | tail -n 25; fi; }
expect() { local name="$1" want="$2"; shift 2; local out; out=$("$@" 2>&1); if echo "$out" | grep -q "$want"; then pass+=("$name"); else fail+=("$name"); echo "---- $name FAILED (wanted '$want')"; echo "$out" | tail -n 25; fi; }
for f in js/*.js js/art/*.js js/rooms/*.js; do node -e "new Function(require('fs').readFileSync('$f','utf8'))" >/dev/null 2>&1 || fail+=("syntax:$f"); done
[ ${#fail[@]} -eq 0 ] && pass+=("syntax")
run layouts node tools/validate.js
expect smoke "errors: none" node tools/tests/smoke.js
if [ "$1" != "quick" ]; then
  expect solver "SOLVER OK" node tools/solve.js
  expect mechanics "errors: none" node tools/tests/mech.js
  expect story-flow "errors: none" node tools/tests/flow2.js
  expect renders "errors: none" node tools/render.js all renders/tests
  expect room-sheets "errors: none" node tools/rooms-sheet.js renders/tests/rooms
  [ -f tools/music-check.js ] && expect music "music OK" node tools/music-check.js
fi
echo "passed: ${pass[*]}"
[ ${#fail[@]} -eq 0 ] && echo "ALL CHECKS PASSED" || { echo "FAILED: ${fail[*]}"; exit 1; }
