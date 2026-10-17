#!/usr/bin/env bash
# Render the eye-pass sheet for one exercise to PNG.
# Usage: bash tools/motion-harness/eyepass.sh <exerciseId> [cols] [rows] [male|female]
set -eu
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
ID="$1"; COLS="${2:-3}"; ROWS="${3:-4}"; FIG="${4:-male}"; ROMS="${5:-}"; CROP="${6:-}"
OUT=".motion-build/eyepass"
node tools/motion-harness/eyepass.js "$ID" "$COLS" "$ROWS" "$FIG" $ROMS $CROP >/dev/null
# panel = 16:10; page width 1540 => panel w = (1540-20-6*(COLS-1))/COLS
PW=$(node -e "console.log(Math.round((1540-20-6*($COLS-1))/$COLS))")
AR=$(node -e "const c='$CROP'.replace('--crop=','');const a=c?c.split(',').map(Number):[0,0,16,10];console.log(a[2]/a[3])")
H=$(node -e "console.log(Math.round(40 + $ROWS*(($PW/$AR)+18) + 10))")
"$CHROME" --headless=new --disable-gpu --force-device-scale-factor=1 \
  --screenshot="$(cygpath -w "$PWD/$OUT/$ID.png")" --window-size=1540,$H --hide-scrollbars \
  "file:///$(cygpath -m "$PWD/$OUT/$ID.html")" >/dev/null 2>&1
echo "$OUT/$ID.png"
