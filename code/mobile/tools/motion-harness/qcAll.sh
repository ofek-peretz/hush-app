#!/usr/bin/env bash
# QC pipeline: filmstrip every rig in the registry → headless-Chrome PNG at 2x.
# Usage: bash tools/motion-harness/qcAll.sh [idFilter...]
set -u
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
OUT=".motion-build/qc"
mkdir -p "$OUT"
IDS=$(node -e "const p=require('path');console.log(Object.keys(require(p.resolve('.motion-build/registry.js')).EXERCISE_MOTION).join('\n'))")
if [ $# -gt 0 ]; then IDS=$(echo "$IDS" | grep -E "$(IFS='|'; echo "$*")"); fi
for id in $IDS; do
  node tools/motion-harness/filmstrip.js "$id" "$OUT/$id.html" >/dev/null 2>&1
  "$CHROME" --headless=new --disable-gpu --force-device-scale-factor=2 \
    --screenshot="$(cygpath -w "$PWD/$OUT/$id.png")" --window-size=1120,290 --hide-scrollbars \
    "file:///$(cygpath -m "$PWD/$OUT/$id.html")" >/dev/null 2>&1
  [ -f "$OUT/$id.png" ] && echo "ok  $id" || echo "FAIL $id"
done
