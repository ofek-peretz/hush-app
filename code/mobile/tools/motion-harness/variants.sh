#!/usr/bin/env bash
set -eu
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
EX="$1"; LIB="$2"; CONST="$3"; VALS="$4"; ROMS="$5"
node tools/motion-harness/variants.js "$EX" "$LIB" "$CONST" "$VALS" "$ROMS" >/dev/null
NV=$(echo "$VALS" | tr ',' '\n' | wc -l); NR=$(echo "$ROMS" | tr ',' '\n' | wc -l)
PW=$(node -e "console.log(Math.round((1540-20-6*($NR-1))/$NR))")
H=$(node -e "console.log(Math.round(40 + $NV*(($PW*10/16)+40) + 10))")
"$CHROME" --headless=new --disable-gpu --force-device-scale-factor=1 \
  --screenshot="$(cygpath -w "$PWD/.motion-build/eyepass/$EX.variants.png")" \
  --window-size=1540,$H --hide-scrollbars \
  "file:///$(cygpath -m "$PWD/.motion-build/eyepass/$EX.variants.html")" >/dev/null 2>&1
echo ".motion-build/eyepass/$EX.variants.png"
