#!/usr/bin/env bash
# How long Apple's networking waits on a quiet line — see probe.swift for the question and the
# decision table. Runs the same probe twice against one local server: natively on macOS, and
# inside the iOS simulator (so the Foundation and CFNetwork under it are iOS's own).
#
#   bash probe.sh <results-dir>
set -uo pipefail

OUT="$1"
mkdir -p "$OUT"
DIR="$(cd "$(dirname "$0")" && pwd)"
WORK="${RUNNER_TEMP:-/tmp}/net-probe"
mkdir -p "$WORK"
PORT=8765

python3 "$DIR/server.py" "$PORT" &
SERVER=$!
sleep 1

{
  xcodebuild -version
  sw_vers
} > "$OUT/toolchain.txt" 2>&1

# ── macOS, natively ────────────────────────────────────────────────────────────────────────────
MAC=""
if xcrun swiftc -swift-version 5 -O "$DIR/probe.swift" -o "$WORK/probe-mac" > "$OUT/compile-macos.txt" 2>&1; then
  "$WORK/probe-mac" "$PORT" > "$OUT/macos.txt" 2>&1 &
  MAC=$!
else
  echo "the macOS build failed — see compile-macos.txt" > "$OUT/macos.txt"
fi

# ── the iOS simulator ──────────────────────────────────────────────────────────────────────────
ARCH="$(uname -m)"
SDK="$(xcrun --sdk iphonesimulator --show-sdk-path)"
if xcrun --sdk iphonesimulator swiftc -swift-version 5 -O -target "$ARCH-apple-ios16.0-simulator" -sdk "$SDK" \
    "$DIR/probe.swift" -o "$WORK/probe-ios" > "$OUT/compile-ios.txt" 2>&1; then
  UDID="$(xcrun simctl list devices available -j | python3 -c "
import json, sys
devices = json.load(sys.stdin)['devices']
for runtime in sorted(devices, reverse=True):
    if 'iOS' not in runtime:
        continue
    for device in devices[runtime]:
        if 'iPhone' in device['name']:
            print(device['udid'])
            sys.exit(0)
")"
  if [ -n "$UDID" ]; then
    xcrun simctl list devices available | grep "$UDID" > "$OUT/ios-device.txt" 2>&1 || true
    xcrun simctl boot "$UDID" > "$OUT/ios-boot.txt" 2>&1 || true
    xcrun simctl bootstatus "$UDID" -b >> "$OUT/ios-boot.txt" 2>&1 || true
    xcrun simctl spawn "$UDID" "$WORK/probe-ios" "$PORT" > "$OUT/ios-simulator.txt" 2>&1
    echo "exit $?" >> "$OUT/ios-simulator.txt"
    xcrun simctl shutdown "$UDID" > /dev/null 2>&1 || true
  else
    echo "no iPhone simulator is installed on this runner" > "$OUT/ios-simulator.txt"
  fi
else
  echo "the iOS-simulator build failed — see compile-ios.txt" > "$OUT/ios-simulator.txt"
fi

if [ -n "$MAC" ]; then
  wait "$MAC" || true
fi
kill "$SERVER" > /dev/null 2>&1 || true
echo "finished"
