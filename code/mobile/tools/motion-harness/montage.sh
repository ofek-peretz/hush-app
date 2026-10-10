#!/usr/bin/env bash
# Many exercises on one sheet — the triage surface before the eye-pass.
# Usage: bash tools/motion-harness/montage.sh <out-name> <id> <id> ...
set -eu
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
NAME="$1"; shift
OUT=".motion-build/eyepass"
node tools/motion-harness/montage.js "$NAME" "$@" >/dev/null
N=$#
# page width 1180 => panel w = (1180-16-10)/3; row = panel h + label
PW=$(node -e "console.log(Math.round((1180-16-10)/3))")
H=$(node -e "console.log(Math.round(16 + $N*(($PW*187.5/300)+24)))")
"$CHROME" --headless=new --disable-gpu --force-device-scale-factor=1 \
  --screenshot="$(cygpath -w "$PWD/$OUT/$NAME.png")" --window-size=1180,$H --hide-scrollbars \
  "file:///$(cygpath -m "$PWD/$OUT/$NAME.html")" >/dev/null 2>&1
echo "$OUT/$NAME.png"
