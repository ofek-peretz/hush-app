#!/bin/bash
# ════ PHOTOGRAPH THE WRIST ════
#
# Builds the watch target's own sources (plus the gallery's entry point and its frames) into a
# watchOS-simulator app with `swiftc` — no Xcode project, no signing identity — boots a simulator
# of each case size, launches the app once per frame and takes the simulator's own screenshot.
#
#   bash native-tests/watch-gallery/render.sh <out-dir>
#
# macOS only (it needs the watchOS simulator). Everything it prints is also kept in <out>/render.log,
# because the photographs travel back on a branch and the log should travel with them.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
MOBILE="$(cd "$HERE/../.." && pwd)"
OUT="${1:-$HERE/out}"
WORK="$(mktemp -d)"
BUNDLE_ID="com.hushfitness.gallery.watch"
mkdir -p "$OUT"
exec > >(tee "$OUT/render.log") 2>&1

echo "── sources"
mkdir -p "$WORK/src"
cp "$MOBILE"/targets/watch/*.swift "$WORK/src/"
rm "$WORK/src/HushWatchApp.swift"
cp "$HERE/GalleryApp.swift" "$WORK/src/"
node "$HERE/build-frames.cjs" "$WORK/src/GalleryFrames.swift" || exit 1

echo "── build"
APP="$WORK/Gallery.app"
mkdir -p "$APP"
ARCH="$(uname -m)"
xcrun --sdk watchsimulator swiftc -parse-as-library -Onone -D GALLERY \
  -target "$ARCH-apple-watchos10.0-simulator" \
  -o "$APP/Gallery" "$WORK"/src/*.swift || exit 1
cp "$HERE/Info.plist" "$APP/Info.plist"
codesign --force --sign - "$APP" || exit 1
ls -la "$APP"

echo "── simulators"
RUNTIME="$(xcrun simctl list runtimes -j | python3 -c '
import json, sys
rs = [r for r in json.load(sys.stdin)["runtimes"] if r.get("platform") == "watchOS" and r.get("isAvailable")]
print(rs[-1]["identifier"] if rs else "")')"
if [ -z "$RUNTIME" ]; then echo "no watchOS simulator runtime on this machine"; exit 1; fi
echo "runtime: $RUNTIME"

# The device type whose name carries this case size, among the ones the runtime supports.
device_type() {
  xcrun simctl list runtimes -j | python3 -c '
import json, sys
want, runtime = sys.argv[1], sys.argv[2]
for r in json.load(sys.stdin)["runtimes"]:
    if r["identifier"] != runtime: continue
    hits = [t for t in r.get("supportedDeviceTypes", []) if want in t["name"]]
    if hits: print(hits[-1]["identifier"])
' "$1" "$RUNTIME"
}

FAILED=0
# The smallest case and the founder's by default; `GALLERY_SIZES="40mm 41mm 42mm 44mm 45mm 46mm 49mm"`
# photographs every case watchOS runs on (the workflow asks for that when the commit says [all-sizes]).
for SIZE in ${GALLERY_SIZES:-40mm 45mm}; do
  TYPE="$(device_type "($SIZE)")"
  if [ -z "$TYPE" ]; then echo "no $SIZE device type for $RUNTIME — skipped"; continue; fi
  echo "── $SIZE · $TYPE"
  UDID="$(xcrun simctl create "gallery-$SIZE" "$TYPE" "$RUNTIME")" || { FAILED=1; continue; }
  xcrun simctl boot "$UDID"
  xcrun simctl bootstatus "$UDID" -b
  if ! xcrun simctl install "$UDID" "$APP"; then echo "install failed on $SIZE"; FAILED=1; xcrun simctl delete "$UDID"; continue; fi
  mkdir -p "$OUT/$SIZE"
  while read -r SHOT FRAME OPEN DIRECT WAIT; do
    [ -z "$SHOT" ] && continue
    SIMCTL_CHILD_HUSH_FRAME="$FRAME" SIMCTL_CHILD_HUSH_OPEN="$OPEN" SIMCTL_CHILD_HUSH_DIRECT="$DIRECT" \
      xcrun simctl launch --terminate-running-process "$UDID" "$BUNDLE_ID" || { echo "launch failed: $SHOT"; FAILED=1; }
    sleep "${WAIT:-3}"
    xcrun simctl io "$UDID" screenshot --type=png --mask=black "$OUT/$SIZE/$SHOT.png" || FAILED=1
  done < "$WORK/src/shots.txt"
  xcrun simctl shutdown "$UDID"
  xcrun simctl delete "$UDID"
done

ls -R "$OUT" | head -80
exit "$FAILED"
