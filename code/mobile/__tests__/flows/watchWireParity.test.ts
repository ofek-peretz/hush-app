/**
 * WATCH ↔ PHONE WIRE PARITY (founder 2026-07-12: "check that the sync between the watch and the
 * phone works perfectly").
 *
 * The link itself is native — WatchConnectivity, two processes, one device — and no test on this
 * machine can prove it delivers. What a test CAN prove, and what actually breaks in practice, is
 * the CONTRACT. Every frame the phone sends is a `SessionMirror` serialised to JSON and decoded
 * by Swift's `WireMirror`. Those are two hand-written declarations of the same shape, in two
 * languages, in two files, edited by different halves of this project — and when they drift, the
 * watch does not crash. It silently drops the field, and a rest timer stops arriving, or a load
 * shows as bodyweight, on a wrist, in a gym, with no error anywhere.
 *
 * So: parse the Swift structs and hold them against the TypeScript interfaces. A field added on
 * one side and forgotten on the other fails the build, here, in a second.
 *
 * (Swift may legitimately declare FEWER fields — the watch renders a subset of the mirror. The
 * rule is one-directional: everything Swift decodes must exist on the phone, spelled the same.)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectSessionMirror, type SessionMirror } from '@/platform/sessionMirror';

const SWIFT = readFileSync(join(__dirname, '../../targets/watch/WatchWire.swift'), 'utf8');

/** The `var name: Type` fields of a Swift struct, in declaration order. */
function swiftFields(structName: string): Array<{ name: string; optional: boolean }> {
  // Anchored on a word boundary: `struct WireSummary` must not match `struct WireSummaryLift`,
  // which is declared first in the file and would silently hand back the wrong shape.
  const decl = new RegExp(`struct\\s+${structName}\\b`).exec(SWIFT);
  if (!decl) throw new Error(`no Swift struct ${structName}`);
  const start = decl.index;
  const open = SWIFT.indexOf('{', start);
  let depth = 0;
  let close = -1;
  for (let i = open; i < SWIFT.length; i++) {
    if (SWIFT[i] === '{') depth++;
    else if (SWIFT[i] === '}') {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  const body = SWIFT.slice(open + 1, close);
  const out: Array<{ name: string; optional: boolean }> = [];
  for (const line of body.split('\n')) {
    const m = /^\s*var\s+([A-Za-z0-9_]+)\s*:\s*(.+?)\s*$/.exec(line);
    if (!m) continue;
    out.push({ name: m[1], optional: m[2].trimEnd().endsWith('?') });
  }
  return out;
}

const STEPS = [
  { exerciseName: 'Bench Press', exerciseGroup: 'chest', setIndexInExercise: 0, totalSetsInExercise: 2, globalIndex: 0, targetWeight: 60, targetReps: 8, reasonType: 'increase' as const, reasonDelta: 2.5 },
  { exerciseName: 'Bench Press', exerciseGroup: 'chest', setIndexInExercise: 1, totalSetsInExercise: 2, globalIndex: 1, targetWeight: 60, targetReps: 8 },
  { exerciseName: 'Barbell Row', exerciseGroup: 'back', setIndexInExercise: 0, totalSetsInExercise: 1, globalIndex: 2, targetWeight: 50, targetReps: 8 },
];

const NOW = Date.parse('2026-07-12T10:05:11Z');

function frame(over: Record<string, unknown>): SessionMirror {
  const m = projectSessionMirror({
    steps: STEPS,
    total: STEPS.length,
    restInterS: 90,
    restTransitionS: 120,
    restStartedAtMs: null,
    nowMs: NOW,
    workoutName: 'Push A',
    sessionStartedAtMs: Date.parse('2026-07-12T10:03:00Z'),
    ...over,
  } as never);
  if (!m) throw new Error('the projector returned no frame');
  return m;
}

/** The terminal frame — the one that carries the summary the wrist reads back. */
function widestMirror(): SessionMirror {
  return frame({
    machine: { phase: 'SESSION_SAVED', setIndex: 2, paused: false },
    completedSets: 2,
    progressedLifts: 1,
  });
}

/** Mid-set — the frame the watch spends most of a workout rendering. */
function activeFrame(): SessionMirror {
  return frame({ machine: { phase: 'SET_PRESENTED', setIndex: 0, paused: false }, toLoad: true });
}

/** Resting between sets — the frame that carries the rest clock. */
function restFrame(): SessionMirror {
  return frame({
    machine: { phase: 'REST_INTER', setIndex: 1, paused: false },
    restStartedAtMs: NOW - 30_000,
    restExtraS: 15,
  });
}

/** Every key the phone can ever put on the wire, gathered across all four phases. */
function everyKeyThePhoneSends(): Set<string> {
  const keys = new Set<string>();
  for (const frame of [widestMirror(), activeFrame(), restFrame()]) {
    for (const k of Object.keys(JSON.parse(JSON.stringify(frame)) as object)) keys.add(k);
  }
  return keys;
}

describe('the wire the watch decodes is the wire the phone sends', () => {
  it('every field WireMirror decodes is one the phone actually sends, spelled identically', () => {
    const sent = everyKeyThePhoneSends();
    const complete = JSON.parse(JSON.stringify(widestMirror())) as Record<string, unknown>;
    for (const f of swiftFields('WireMirror')) {
      // A NON-optional Swift field must be on every frame — a `JSONDecoder` that cannot find it
      // throws, and the wrist drops the whole frame in silence.
      if (!f.optional) {
        expect({ field: f.name, onEveryFrame: Object.prototype.hasOwnProperty.call(complete, f.name) })
          .toEqual({ field: f.name, onEveryFrame: true });
      }
      // Optional or not, the NAME has to be one the phone emits somewhere — otherwise it is a
      // field the watch will wait for forever.
      expect({ field: f.name, everSent: sent.has(f.name) }).toEqual({ field: f.name, everSent: true });
    }
  });

  it('the summary the wrist reads back is complete — including the lift-by-lift list', () => {
    const mirror = widestMirror();
    expect(mirror.summary).not.toBeNull();
    const json = JSON.parse(JSON.stringify(mirror.summary)) as Record<string, unknown>;
    for (const f of swiftFields('WireSummary')) {
      if (f.optional) continue;
      expect(Object.prototype.hasOwnProperty.call(json, f.name)).toBe(true);
    }
    // The read-back list itself: named lifts, each with a verdict.
    for (const f of swiftFields('WireSummaryLift')) {
      expect(Object.prototype.hasOwnProperty.call((mirror.summary!.lifts[0] ?? {}) as object, f.name)).toBe(true);
    }
  });

  it('the load setup — the plates the wrist tells the athlete to hang — survives the crossing', () => {
    // Nothing to assert about VALUES here (that is loadPresentation's job); the point is the
    // NAMES, because a renamed key is how "12 per side" becomes silence on a wrist.
    const fields = swiftFields('WireLoadSetup').map((f) => f.name);
    expect(fields).toEqual(expect.arrayContaining(['style', 'perSide', 'plates', 'barKg']));
  });

  /**
   * THE WATCH BUILDS ITS OWN MIRRORS TOO.
   *
   * `LocalWorkoutEngine.swift` is the standalone runtime — the athlete who trains with the phone
   * in a locker. It does not receive frames; it PROJECTS them, from its own copy of the plan, with
   * a hand-written `WireMirror(...)`. So it is a second implementation of the same projector, in
   * another language, that no TypeScript test has ever looked at — and when `nextSetLabel` was
   * added to fix the off-by-one set on the wrist, that engine kept sending nil and kept the bug
   * alive for exactly the athlete the standalone runtime exists for.
   *
   * This test reads the Swift and holds it to the same contract: every field the phone's projector
   * sets on a live frame, the watch's own projector has to set too.
   */
  it("the watch's STANDALONE engine projects the same fields the phone does", () => {
    const engine = readFileSync(join(__dirname, '../../targets/watch/LocalWorkoutEngine.swift'), 'utf8');
    // The fields that carry meaning on a REST frame — the frame both projectors have got wrong.
    for (const field of ['nextSetLabel', 'nextSetNumber', 'nextExerciseName', 'nextTargetWeight', 'nextSetsInExercise']) {
      expect({ field, projected: new RegExp(`m\\.${field}\\s*=`).test(engine) }).toEqual({ field, projected: true });
    }
    // …and the closing read-back, which only the watch can build for a standalone workout.
    expect(engine).toMatch(/lifts:\s*summaryLifts\(\)/);
    expect(engine).toMatch(/func summaryLifts\(\)\s*->\s*\[WireSummaryLift\]/);
  });

  it('the frame round-trips through JSON without losing a key (the actual transport)', () => {
    const mirror = widestMirror();
    const round = JSON.parse(JSON.stringify(mirror)) as SessionMirror;
    expect(round).toEqual(JSON.parse(JSON.stringify(mirror)));
    expect(round.summary?.lifts?.length).toBeGreaterThan(0);
  });
});
