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
// @ts-nocheck

// 

import { watchCopyPack } from '@/platform/watch/watchCopyPack';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectSessionMirror, type SessionMirror } from '@/platform/sessionMirror';
import {
  WATCH_PROTOCOL_VERSION, WATCH_PLAN_SCHEMA_VERSION, makeStateEnvelope, parseWatchIntent,
  parseSessionRecord, parseCardioRecord,
  type WatchIntent, type WatchLobby, type WatchLobbyWorkout, type WatchPlanSnapshot,
  type WatchPlanStep, type WatchPlanWorkout, type WatchRecordSet, type WatchSessionRecord,
  type WatchCardioRecord,
} from '@/platform/watch/protocol';

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

  /**
   * THE OTHER DIRECTION — and the hole that cost us the signature moment.
   *
   * The rule above is one-directional on purpose: the watch renders a SUBSET, so Swift declaring
   * fewer fields is legal. But "legal" and "intended" are not the same thing, and nothing here
   * could tell them apart. On 2026-07-17 the phone gained `correction` — Loop 1 moving the next
   * set's load, which the brief calls the single most distinctive moment in the product and
   * explicitly requires on BOTH surfaces. `WireMirror` never gained the field. The phone published
   * it on every rest; the wrist's decoder didn't ask for it; every test on this machine passed. The
   * load on her wrist just changed, with no account of why — exactly the silent drop this file was
   * written to prevent, arriving through the one door it left open.
   *
   * So the omission has to be a DECISION. Every field the phone sends is either decoded by the
   * watch or named below with the reason it isn't. Adding a mirror field now forces the question
   * "does the wrist need this?" to be answered in writing, instead of by default, in silence.
   */
  it('every field the phone sends is either decoded by the watch or deliberately declined', () => {
    // Fields the wrist knowingly does not render. EMPTY, and that is the honest state today: the
    // watch decodes all 35. Adding one here is a real decision — write the reason, not just the name.
    const DELIBERATELY_NOT_ON_THE_WRIST: Record<string, string> = {};

    const decoded = new Set(swiftFields('WireMirror').map((f) => f.name));
    const undecoded = [...everyKeyThePhoneSends()].filter(
      (k) => !decoded.has(k) && !(k in DELIBERATELY_NOT_ON_THE_WRIST),
    );
    expect({ silentlyDroppedByTheWatch: undecoded }).toEqual({ silentlyDroppedByTheWatch: [] });
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

  /**
   * THE MARK — and the hole this test used to have. The loop above skips OPTIONAL Swift fields,
   * and every field added after v1 is optional (a phone on a new build must never break an old
   * watch binary). Which means the milestone — a whole nested struct, added 2026-07-13 — crossed
   * the wire completely unchecked: rename `caption` on one side and the wrist would stamp a
   * medallion with a blank face, silently, on the one workout in a hundred that earned it.
   *
   * So the mark is held to the same standard as the rest of the frame, optional or not.
   */
  it('the mark the wrist stamps is the mark the phone earned', () => {
    const milestone = { value: '100', caption: 'workouts', title: '100 workouts.', sub: 'Since you started.' };
    const m = frame({
      machine: { phase: 'SESSION_SAVED', setIndex: 2, paused: false },
      completedSets: 2,
      progressedLifts: 1,
      milestone,
    });
    const summary = JSON.parse(JSON.stringify(m.summary)) as Record<string, unknown>;
    // The wrist can only read a key the phone actually puts on the wire.
    expect(Object.prototype.hasOwnProperty.call(summary, 'milestone')).toBe(true);
    const sent = summary.milestone as Record<string, unknown>;
    for (const f of swiftFields('WireMilestone')) {
      expect({ field: f.name, sent: Object.prototype.hasOwnProperty.call(sent, f.name) }).toEqual({
        field: f.name,
        sent: true,
      });
    }
    expect(sent).toEqual(milestone);

    // …and a workout that crossed nothing sends an explicit null, which Swift's `decodeIfPresent`
    // reads as "no mark" — never a half-decoded struct.
    expect(widestMirror().summary!.milestone).toBeNull();
  });

  /**
   * THE SIGNATURE MOMENT, field by field — held to the same standard as the mark, and for the same
   * reason: it is a nested struct that only appears on the rare frame that earned it, so a drifted
   * key here is invisible until an athlete is mid-rest in a gym. `reps` is the load-bearing one —
   * it is the entire measured reason ("You did 12, so I added weight"), and if the wrist decodes
   * nothing there, Hush either says nothing or states a reason it cannot back.
   */
  it('the correction the wrist announces is the correction the phone made', () => {
    const correction = { from: 60, to: 62.5, direction: 'up' as const, reps: 12 };
    const m = frame({
      machine: { phase: 'REST_INTER', setIndex: 1, paused: false },
      restStartedAtMs: NOW - 30_000,
      correction,
    });
    const sent = JSON.parse(JSON.stringify(m.correction)) as Record<string, unknown>;
    for (const f of swiftFields('WireCorrection')) {
      expect({ field: f.name, sent: Object.prototype.hasOwnProperty.call(sent, f.name) }).toEqual({
        field: f.name,
        sent: true,
      });
    }
    expect(sent).toEqual(correction);
    // A rest that earned nothing sends an explicit null — Swift's `decodeIfPresent` reads that as
    // "no news", never a half-decoded struct announcing a change that never happened.
    expect(restFrame().correction).toBeNull();
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
    // EVERY field, not a hand-picked few. The list below named five, and the sixth is exactly how
    // this class of bug survives: `targetRepsHi` was never set here, so the phone-absent athlete —
    // the one the standalone runtime exists FOR — saw a single rep target where every mirrored set
    // shows a RANGE, and WT2's "8 … 10" ruler collapsed to "8". Nothing failed; it quietly told
    // her less.
    const unset = swiftFields('WireMirror')
      .map((f) => f.name)
      .filter((name) => !new RegExp('(\\b' + name + ':|m\\.' + name + '\\s*=)').test(engine));
    expect({ neverSetByTheStandaloneProjector: unset }).toEqual({ neverSetByTheStandaloneProjector: [] });
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

/**
 * ════ THE OTHER TEN STRUCTS ════
 *
 * The block above proved ONE contract — `WireMirror` ↔ `SessionMirror` — and it proved it well.
 * But sixteen `Wire*` structs cross this bridge and only six were ever held to a counterpart, so
 * ten of them were two hand-written declarations in two languages with nothing joining them:
 *
 *   · `WireLobby` — the Start screen. A drifted field there means WT1 shows the wrong workout, or
 *     WT7's first-workout face never appears because the flag arrives under a different name.
 *   · `WireIntent` — the only thing that travels wrist → phone. A misspelled field is not a
 *     degraded screen; it is an action of hers that the phone throws away as malformed. When
 *     `severity` was added for WT14b, a typo here would have dropped **every pain report she
 *     ever filed**, in silence, with the screen still working perfectly.
 *   · `WirePlan*` / `WireSessionRecord` — the standalone contract, in both directions: the
 *     workout she trains with the phone in a locker, and the record that carries it home.
 *
 * The rule is the same one-directional rule: the watch may decode FEWER fields than the phone
 * sends, but never a field the phone does not send, and never under a different spelling.
 */
describe('every struct that crosses the bridge is joined, not just the mirror', () => {
  /** Every key a TS value can put on the wire, including the ones only some shapes carry. */
  const keysOf = (...samples: object[]): Set<string> => {
    const out = new Set<string>();
    for (const s of samples) for (const k of Object.keys(JSON.parse(JSON.stringify(s)) as object)) out.add(k);
    return out;
  };

  /** Swift decodes only names the phone can actually emit — spelled identically. */
  const joined = (struct: string, sent: Set<string>, declined: Record<string, string> = {}) => {
    const strangers = swiftFields(struct)
      .map((f) => f.name)
      .filter((n) => !sent.has(n) && !(n in declined));
    expect({ struct, decodedButNeverSent: strangers }).toEqual({ struct, decodedButNeverSent: [] });
  };

  it('WireLobby + WireLobbyWorkout — the Start screen the wrist draws (WT1 / WT1b / WT7)', () => {
    const workout: WatchLobbyWorkout = { id: 'd1', name: 'Upper A', lifts: 6, muscles: 'chest · back', done: false };
    const lobby: WatchLobby = {
      workoutId: 'd1', workoutName: 'Upper A', muscles: 'chest · back', lifts: 6,
      durationLabel: '~48 min', firstWorkout: true, resting: false, gated: false, workouts: [workout],
    };
    joined('WireLobby', keysOf(lobby));
    joined('WireLobbyWorkout', keysOf(workout));
  });

  it('WireIntent — the ONE thing that travels wrist → phone (a typo here silently drops her action)', () => {
    const intent: WatchIntent = {
      v: WATCH_PROTOCOL_VERSION, type: 'report_pain', intentId: 'i1',
      issuedAt: new Date(NOW).toISOString(), expectedGlobalIndex: 0, actualReps: 8, actualWeight: 60,
      workoutId: 'd1', exerciseId: 'db_bench_press', seconds: 15, area: 'Shoulders', severity: 'pain',
    };
    joined('WireIntent', keysOf(intent));
    // …and every field the wrist SENDS is one the phone's parser reads back, or the payload is
    // accepted and the value quietly lost.
    const parsed = parseWatchIntent(JSON.parse(JSON.stringify(intent)));
    expect(parsed).not.toBeNull();
    for (const f of swiftFields('WireIntent')) {
      expect({ field: f.name, survivesParsing: Object.prototype.hasOwnProperty.call(parsed, f.name) })
        .toEqual({ field: f.name, survivesParsing: true });
    }
  });

  it('WirePlan* — the standalone plan the wrist executes with the phone in a locker', () => {
    const step: WatchPlanStep = {
      exerciseId: 'db_bench_press', exerciseName: 'DB Bench', exerciseGroup: 'chest',
      setIndexInExercise: 0, totalSetsInExercise: 3, globalIndex: 0, targetWeight: 20, targetReps: 8,
      targetRepsHi: 10,
      /*
       * ⚠️ THE SAMPLE CARRIES HISTORY ON PURPOSE (2026-08-04). This law reads the keys a real TS
       * value can put on the wire, so a field the builder only emits WHEN THERE IS HISTORY is
       * invisible to it unless the sample has some — and it caught exactly that the moment
       * `lastReps` was added. A sample without history would have let the wrist decode a field the
       * phone had never been proven to send.
       */
      lastReps: [8, 8, 7], lastLoadKg: 20,
      blockId: 'b1', reasonType: 'increase', reasonDelta: 2.5, loadSetup: null, restInterS: 90,
      /* ⛔ AND WHETHER THAT REST IS HERS (2026-08-16). The wrist's "your pace" line used to infer it
         from `restInterS != nil`, which is also true of a rest the COACH wrote — so the badge put
         her name on a number she had never produced. The phone states it now, and this sample is
         what proves the phone really sends it: exactly the check that caught `lastReps`. */
      restIsLearned: true,
    };
    const workout: WatchPlanWorkout = { id: 'd1', name: 'Upper A', muscles: 'chest', steps: [step] };
    const plan: WatchPlanSnapshot = {
      schema: WATCH_PLAN_SCHEMA_VERSION, planId: 'p1', generatedAt: new Date(NOW).toISOString(),
      restInterS: 90, restTransitionS: 120, workouts: [workout],
    };
    joined('WirePlanStep', keysOf(step));
    joined('WirePlanWorkout', keysOf(workout));
    joined('WirePlan', keysOf(plan));
  });

  it('WireSessionRecord + WireRecordSet — the standalone workout carried home', () => {
    const set: WatchRecordSet = {
      exerciseId: 'db_bench_press', setIndex: 0, blockId: 'b1', recommendedWeight: 20,
      recommendedReps: 8, actualWeight: 20, actualReps: 9, completedAt: new Date(NOW).toISOString(),
    };
    const record: WatchSessionRecord = {
      v: WATCH_PROTOCOL_VERSION, type: 'session_record', recordId: 'r1', planId: 'p1',
      workoutId: 'd1', workoutName: 'Upper A', startedAt: new Date(NOW).toISOString(),
      endedAt: new Date(NOW).toISOString(), earlyFinish: false, kcal: 412, sets: [set],
    };
    joined('WireRecordSet', keysOf(set));
    joined('WireSessionRecord', keysOf(record));
    // The phone must be able to READ what the wrist writes — the reconciliation, end to end.
    expect(parseSessionRecord(JSON.parse(JSON.stringify(record)))).not.toBeNull();
  });

  it('WireCardioRecord — the run the wrist carries home (founder 2026-07-28)', () => {
    const record: WatchCardioRecord = {
      v: WATCH_PROTOCOL_VERSION, type: 'cardio_record', recordId: 'c1', gait: 'run',
      startedAt: new Date(NOW).toISOString(), endedAt: new Date(NOW + 1574_000).toISOString(),
      durationSec: 1574, distanceKm: 4.2, avgHr: 141, kcal: 318,
    };
    joined('WireCardioRecord', keysOf(record));
    // …and the phone can read what the wrist writes, end to end.
    expect(parseCardioRecord(JSON.parse(JSON.stringify(record)))).not.toBeNull();
  });

  it('WireEnvelope — the wrapper every frame arrives in', () => {
    // BOTH shapes: `copy` rides the lobby and is absent from a mirror frame, so an envelope built
    // without one would leave the wrist decoding a field this test had never seen sent.
    /* ⚠️ BOTH FRAMES CARRY AN EPOCH, because the bridge always does: `authorityEpoch` is taken from
       the clock in `WatchSession`'s constructor, so no envelope the app emits is ever without one.
       A sample that omitted it would let the field be decoded on the wrist and never sent from the
       phone — precisely the one-directional drift this file exists to fail on. */
    const mirrorFrame = makeStateEnvelope(widestMirror(), 7, NOW, null, null, null, NOW, 'rec-parity');
    const lobbyFrame = makeStateEnvelope(null, 8, NOW, null, null, watchCopyPack(), NOW);
    joined('WireEnvelope', keysOf(mirrorFrame, lobbyFrame));
  });

  it('WireLocalSession — the workout the wrist hands over mid-flight', () => {
    /*
     * ⛔ THE ONE MESSAGE THAT CARRIES A WHOLE WORKOUT. It travels wrist → phone and is written into
     * her session log, so a field misspelled on one side is not a degraded screen: it is a handover
     * the phone silently refuses as malformed, leaving her workout stranded on the wrist with the
     * app showing Today — the exact bug this was built to fix, arriving through its own contract.
     */
    const offer = {
      v: WATCH_PROTOCOL_VERSION,
      type: 'local_session',
      recordId: 'rec-1',
      workoutId: 'day_1',
      workoutName: 'Upper A',
      startedAt: new Date(NOW - 600_000).toISOString(),
      phase: 'rest_inter',
      pausedFrom: 'active_set',
      currentIndex: 1,
      restEndsAt: new Date(NOW + 45_000).toISOString(),
      restTotalS: 90,
      steps: [],
      sets: [],
      sentAt: new Date(NOW).toISOString(),
    };
    joined('WireLocalSession', keysOf(offer));
  });

  it('WireSwapOption — the replacement the wrist offers is one the phone chose', () => {
    joined('WireSwapOption', keysOf({ id: 'db_bench_press', name: 'DB Bench' }));
  });
});
