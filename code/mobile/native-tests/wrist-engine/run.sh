#!/usr/bin/env bash
# The watch's real workout engine, compiled for the Mac it runs on and played against the phone's
# own scripts — see main.swift. Used by the `swift` job of ci.yml (a gate) and by wrist-engine.yml
# (on demand, with the report sent back on a branch so it can be read without signing in).
#
#   bash code/mobile/native-tests/wrist-engine/run.sh [out-dir]
#
# With an out-dir: build.log and report.txt are left there whatever happens.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
MOBILE="$(cd "$HERE/../.." && pwd)"
WATCH="$MOBILE/targets/watch"
OUT="${1:-}"
BIN="${RUNNER_TEMP:-/tmp}/wristengine"

if [ -n "$OUT" ]; then
  mkdir -p "$OUT"
  xcodebuild -version > "$OUT/toolchain.txt" 2>&1 || true
  if ! xcrun swiftc "$WATCH/LocalWorkoutEngine.swift" "$WATCH/WatchStore.swift" "$WATCH/WatchWire.swift" "$WATCH/WatchCopy.swift" "$HERE/main.swift" -o "$BIN" > "$OUT/build.log" 2>&1; then
    echo "wrist-engine: the watch's engine did not compile on this Mac" | tee "$OUT/report.txt"
    cat "$OUT/build.log"
    exit 1
  fi
  "$BIN" "$MOBILE/__tests__/sync/__fixtures__/wrist-engine" "$OUT/report.txt"
  exit $?
fi

xcrun swiftc "$WATCH/LocalWorkoutEngine.swift" "$WATCH/WatchStore.swift" "$WATCH/WatchWire.swift" "$WATCH/WatchCopy.swift" "$HERE/main.swift" -o "$BIN" || exit 1
"$BIN" "$MOBILE/__tests__/sync/__fixtures__/wrist-engine"
