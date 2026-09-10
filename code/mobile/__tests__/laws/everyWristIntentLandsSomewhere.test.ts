/**
 * EVERY INTENT THE WRIST CAN SEND LANDS SOMEWHERE ON THE PHONE.
 *
 * ── The bug this exists to prevent ────────────────────────────────────────────────────────────
 * The watch talks to the phone through four layers, and each one can be complete on its own while
 * the chain is broken: the watch screen sends an intent, `protocol.parseWatchIntent` accepts it,
 * `WatchSession.apply` routes it to a delegate — and the PHONE constructs that delegate from an
 * object literal, so a handler it simply never lists is not a type error, not a runtime error, and
 * not a failing test. The optional call `this.d.reportPain?.(area)` evaluates to `undefined` and the
 * athlete's action disappears in silence.
 *
 * That is not hypothetical. `report_pain` (WT14 · What's off — the wrist's only way to say a
 * shoulder hurts) shipped exactly like this: the screen, the copy, the intent type, the parser and
 * the router were all built and correct, the phone's pain machinery (`app.reportPain`,
 * `profile.painEases`, `domain/painReport`) was built and correct, and **the two were never joined.**
 * The seam's own comment said "absent = accepted but not yet stored, pending the phone's pain
 * backend" — written when there was no backend, and left behind when the backend arrived.
 *
 * So this law reads the SOURCE and joins the chain mechanically: every delegate the bridge is
 * capable of calling must appear in the object literal the phone hands it.
 */
// @ts-nocheck

// 

import fs from 'fs';
import path from 'path';
import {
  WATCH_INTENT_TYPES, WATCH_PROTOCOL_VERSION, decideWatchIntent, parseWatchIntent,
  type WatchIntent, type WatchIntentType,
} from '@/platform/watch/protocol';
import type { SessionMirror } from '@/platform/sessionMirror';
import { musclesForWristArea, asPainSeverity, WRIST_PAIN_MUSCLES, PAIN_SEVERITIES } from '@/domain/painReport';
import { CANONICAL_MUSCLE_ORDER } from '@/engine/v5/constants';

const SRC = path.join(__dirname, '..', '..', 'src');
const bridgeSrc = fs.readFileSync(path.join(SRC, 'platform', 'watch', 'watchBridge.ts'), 'utf8');
const phoneSrc = fs.readFileSync(path.join(SRC, 'state', 'stores', 'sessionStore.tsx'), 'utf8');

/** Every delegate the bridge calls when an intent arrives — `this.d.X(...)` or `this.d.X?.(...)`. */
function delegatesCalledByBridge(): string[] {
  return [...new Set([...bridgeSrc.matchAll(/this\.d\.([a-zA-Z]+)\??\.\(/g)].map((m) => m[1]))];
}

/** The keys of the `new WatchSession({ … })` literal the phone actually constructs. */
function delegatesSuppliedByPhone(): string[] {
  const at = phoneSrc.indexOf('new WatchSession({');
  expect(at).toBeGreaterThan(-1); // the phone must still construct one
  let depth = 0;
  let end = at;
  for (let i = phoneSrc.indexOf('{', at); i < phoneSrc.length; i++) {
    if (phoneSrc[i] === '{') depth += 1;
    else if (phoneSrc[i] === '}') {
      depth -= 1;
      if (depth === 0) { end = i; break; }
    }
  }
  const literal = phoneSrc.slice(at, end);
  return [...new Set([...literal.matchAll(/^\s{6}([a-zA-Z]+):/gm)].map((m) => m[1]))];
}

const NOW = Date.parse('2026-06-15T12:00:00.000Z');

/** The payload each intent must carry to be meaningful (the rest carry only their type). */
const PAYLOAD: Partial<Record<WatchIntentType, Record<string, unknown>>> = {
  complete_set: { actualReps: 8, expectedGlobalIndex: 0 },
  swap_exercise: { exerciseId: 'db_bench_press' },
  select_workout: { workoutId: 'd1' },
  start_workout: { workoutId: 'd1' },
  add_rest: { seconds: 15 },
  report_pain: { area: 'Shoulders', severity: 'pain' },
};

/** The phase each intent belongs to. `null` = the pre-session lobby (no active mirror). */
const PHASE_FOR: Record<WatchIntentType, SessionMirror['phase'] | null> = {
  complete_set: 'active_set',
  end_rest: 'rest_inter',
  pause: 'active_set',
  resume: 'paused',
  finish_early: 'active_set',
  exercise_busy: 'active_set',
  swap_exercise: 'active_set',
  add_rest: 'rest_inter',
  report_pain: 'paused',
  select_workout: null,
  start_workout: null,
};

function mirrorIn(phase: SessionMirror['phase']): SessionMirror {
  return {
    schema: 1,
  /* The wrist's set row (2026-08-04) — her own sets, and last time's, which the dots never said. */
  setsSoFar: [],
  loadsSoFar: [],
  lastReps: [],
  lastLoadKg: null, phase, exerciseName: 'Bench', setLabel: 'Set 1 of 3',
    globalIndex: 0, totalSets: 3, targetWeight: 60, targetReps: 8,
    restEndsAt: phase.startsWith('rest') ? new Date(NOW + 60_000).toISOString() : null,
    restRemainingS: phase.startsWith('rest') ? 60 : null,
    nextExerciseName: null, nextTargetWeight: null, nextTargetReps: null,
    completedExerciseName: null, canMarkBusy: true,
    loadDeltaKg: 0, nextLoadDeltaKg: 0, liftIndex: 1, liftCount: 3,
    workoutName: 'Upper A', summary: null, swapOptions: [], nextSwapOptions: [],
    // Added when typechecking reached the tests: this literal had drifted nine fields behind the
    // mirror it claims to be, so every intent below was being routed against a frame the phone
    // stopped publishing.
    exerciseGroup: 'Chest', setNumber: 1, setsInExercise: 3, nextSetLabel: 'Set 2 of 3',
    nextSetNumber: 2, nextSetsInExercise: 3, targetRepsHi: 12, restTotalS: 120,
    liveVolumeKg: 0, liveSets: 0,
  };
}

describe('the wrist → phone chain is joined at every link', () => {
  it('every delegate the bridge can call is one the phone actually supplies', () => {
    const called = delegatesCalledByBridge();
    const supplied = new Set(delegatesSuppliedByPhone());
    expect(called.length).toBeGreaterThan(4); // the extraction must not be silently matching nothing
    const dropped = called.filter((name) => !supplied.has(name)); // AB
    expect({ callableButNeverSupplied: dropped }).toEqual({ callableButNeverSupplied: [] });
  });

  it('every intent type the protocol declares is DECIDABLE — the phone knows what it means', () => {
    // Behavioural, not a text scan: run the real decider for every intent, in the phase where that
    // intent belongs, and require it to yield an ACTION. An intent that decides to nothing is a
    // wrist tap that dies before the bridge ever sees it.
    const undecided: string[] = [];
    for (const type of WATCH_INTENT_TYPES) {
      const inPhase = PHASE_FOR[type];
      const d = decideWatchIntent(
        { v: WATCH_PROTOCOL_VERSION, type, intentId: `i_${type}`, issuedAt: new Date(NOW).toISOString(), ...(PAYLOAD[type] ?? {}) },
        inPhase === null ? null : mirrorIn(inPhase),
        NOW,
        new Set<string>(),
      );
      if (!d.accept || d.action == null) undecided.push(`${type} → ${d.reason ?? 'no action'}`);
    }
    expect({ acceptedButUndecided: undecided }).toEqual({ acceptedButUndecided: [] });
  });

  it('every intent type the protocol declares actually parses', () => {
    // A type in the list that `parseWatchIntent` cannot produce is a screen that can never be heard.
    const carriesPayload: Partial<Record<(typeof WATCH_INTENT_TYPES)[number], Record<string, unknown>>> = {
      complete_set: { actualReps: 8, expectedGlobalIndex: 0 },
      swap_exercise: { exerciseId: 'db_bench_press' },
      select_workout: { workoutId: 'd1' },
      start_workout: { workoutId: 'd1' },
      add_rest: { seconds: 15 },
      report_pain: { area: 'Shoulders', severity: 'pain' },
    };
    const unparseable = WATCH_INTENT_TYPES.filter((type) => {
      const parsed: WatchIntent | null = parseWatchIntent({
        type, intentId: `i_${type}`, issuedAt: new Date().toISOString(), ...(carriesPayload[type] ?? {}),
      });
      return parsed == null;
    });
    expect({ declaredButUnparseable: unparseable }).toEqual({ declaredButUnparseable: [] });
  });
});

/**
 * WT14 → WT14b → the phone. The wrist's pain report is the one intent that crosses the bridge and
 * then changes the PROGRAMME, so its two answers — which muscle, how sharp — are followed the whole
 * way: from the words the watch offers, through the wire, to the muscle the engine rests.
 */
describe('the pain report she files on the wrist is the one the engine acts on', () => {
  it('every muscle the wrist offers resolves to itself — one vocabulary, no interpretation', () => {
    // The wrist used to name JOINTS while the map knew only MUSCLES, so the report needed a
    // translation nobody had written. Founder 2026-07-28: the wrist names the map's own muscles.
    const unresolved = WRIST_PAIN_MUSCLES.filter((m) => {
      const out = musclesForWristArea(m);
      return out.length !== 1 || out[0] !== m;
    });
    expect({ unresolved }).toEqual({ unresolved: [] });
  });

  it('the muscles the wrist offers are muscles the body map actually trains', () => {
    // A word on the wrist that the map does not know would rest nothing, silently.
    const strangers = WRIST_PAIN_MUSCLES.filter((m) => !CANONICAL_MUSCLE_ORDER.includes(m));
    expect({ notOnTheMap: strangers }).toEqual({ notOnTheMap: [] });
  });

  it('the JOINT words an un-updated wrist still sends keep landing', () => {
    // A watch updates separately from its phone. An older build goes on sending "Knee" long after
    // the phone stops offering it, and an unmapped word rests NOTHING — the exact silence this
    // whole seam was fixed for.
    for (const joint of ['Shoulder', 'Lower back', 'Knee', 'Elbow', 'Wrist', 'Hip']) {
      const muscles = musclesForWristArea(joint);
      expect({ joint, restsSomething: muscles.length > 0 }).toEqual({ joint, restsSomething: true });
      for (const m of muscles) expect(CANONICAL_MUSCLE_ORDER).toContain(m);
    }
  });

  it('a word neither the map nor the aliases know rests NOTHING — never a guess', () => {
    expect(musclesForWristArea('Neck')).toEqual([]);
    expect(musclesForWristArea('')).toEqual([]);
  });

  it('the three severities the wrist offers are exactly the three the phone acts on', () => {
    // The wrist asks the same question the phone asks (WT14b); a fourth word on either side would
    // arrive as null and the report would be dropped after she had already answered it.
    for (const s of PAIN_SEVERITIES) expect(asPainSeverity(s)).toBe(s);
    expect(asPainSeverity('mild')).toBeNull();
    expect(asPainSeverity(undefined)).toBeNull();
  });

  it('a report with no severity never reaches the phone — the engine picks no window for her', () => {
    const withSeverity = parseWatchIntent({
      v: WATCH_PROTOCOL_VERSION, type: 'report_pain', intentId: 'a', issuedAt: new Date(NOW).toISOString(),
      area: 'Shoulders', severity: 'sharp',
    });
    const decided = decideWatchIntent(withSeverity, mirrorIn('paused'), NOW, new Set());
    expect(decided.action).toEqual({ kind: 'report_pain', area: 'Shoulders', severity: 'sharp' });

    const noSeverity = decideWatchIntent(
      { v: WATCH_PROTOCOL_VERSION, type: 'report_pain', intentId: 'b', issuedAt: new Date(NOW).toISOString(), area: 'Shoulders' },
      mirrorIn('paused'), NOW, new Set(),
    );
    expect(noSeverity.action).toBeNull();
  });
  it('the words the WATCH offers are the words the phone resolves — read from the Swift itself', () => {
    // Two lists in two languages that must never drift: `WatchCopy.painAreas` (what she taps) and
    // `WRIST_PAIN_MUSCLES` (what the phone rests). A word added to one and not the other is a row
    // that silently rests nothing — and Swift is not compiled by this suite, so nothing else would
    // catch it.
    const swift = fs.readFileSync(
      path.join(__dirname, '..', '..', 'targets', 'watch', 'WatchCopy.swift'), 'utf8',
    );
    // `painAreaValues`, not `painAreas`: since the wrist speaks Hebrew the list carries a WIRE
    // VALUE and a LABEL separately, and this law is about the value — the word the phone resolves.
    const block = swift.slice(swift.indexOf('static let painAreaValues'));
    const offered = [...block.slice(0, block.indexOf(']')).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(offered.length).toBeGreaterThan(4); // the extraction must not silently match nothing
    expect({ watchOffers: offered }).toEqual({ watchOffers: [...WRIST_PAIN_MUSCLES] });

    // …and the severities, the same way. The rows are read from the declaration itself rather than
    // from a bracket: the labels now come from the copy pack, so the shape around them has changed
    // once already and will again.
    const sevAt = swift.indexOf('static var severityChoices');
    expect(sevAt).toBeGreaterThan(-1);
    const values = [...swift.slice(sevAt, sevAt + 500).matchAll(/value:\s*"([a-z]+)"/g)].map((m) => m[1]);
    expect(values.length).toBeGreaterThan(2); // the extraction must not silently match nothing
    expect({ watchSeverities: values }).toEqual({ watchSeverities: [...PAIN_SEVERITIES] });
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ A PAIN REPORT SURVIVES EVERY GATE BETWEEN THE WRIST AND THE ENGINE.
 *
 * FOUNDER, 2026-08-05: *"when you press injury mode on the watch it shows the area picker and the
 * pain level, which is fine — but when I press it nothing happens."*
 *
 * It was dropped THREE separate times along one path, and each drop was silent:
 *
 *   1. THE WRIST         `reportPain` guarded on `manager.isReachable`, and every one of his
 *                        screenshots has the aeroplane glyph. The intent was never sent.
 *   2. THE PHONE'S NATIVE `didReceiveUserInfo` read only `record`, so once the report moved onto
 *      SIDE                the durable channel it would have arrived and died — the WT14 shape.
 *   3. THIS FUNCTION      `noActiveSession` and a fifteen-second TTL. A queued report is late by
 *                        definition, and one filed from a CARDIO run has no strength mirror at
 *                        all — so the durable channel would have delivered it and this would have
 *                        thrown it away.
 *
 * ⚠️ ALL THREE FAILED THE SAME WAY: no crash, no log, nothing on screen. Every layer was
 * individually defensible and the chain was dead. That is what this file exists for.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('⛔ a pain report is a standing fact, not a proposal', () => {
  const painIntent = (issuedAt: string) => ({
    v: WATCH_PROTOCOL_VERSION,
    type: 'report_pain',
    intentId: `pain_${issuedAt}`,
    issuedAt,
    area: 'Shoulders',
    severity: 'pain',
  });
  const now = Date.parse('2026-08-05T12:00:00.000Z');

  it('is accepted with NO session running — after the workout, or from a run', () => {
    const d = decideWatchIntent(painIntent(new Date(now).toISOString()), null, now, new Set());
    expect(d.accept).toBe(true);
    expect(d.action).toEqual({ kind: 'report_pain', area: 'Shoulders', severity: 'pain' });
  });

  it('⛔ is accepted LATE — the whole point of the durable channel', () => {
    // Twenty minutes old. The intent TTL is fifteen SECONDS, which is right for a `complete_set`
    // against a session that has moved on, and fatal for a report that queued in a locker.
    const issued = new Date(now - 20 * 60_000).toISOString();
    const d = decideWatchIntent(painIntent(issued), null, now, new Set());
    expect(d.accept).toBe(true);
  });

  it('⚠️ and a re-delivery is still rejected — at-least-once must not mean twice', () => {
    const i = painIntent(new Date(now).toISOString());
    const d = decideWatchIntent(i, null, now, new Set([i.intentId]));
    expect(d.accept).toBe(false);
    expect(d.reason).toBe('duplicate');
  });

  it('⚠️ a report with no severity is still refused — a half-finished flow is not a report', () => {
    const i = { ...painIntent(new Date(now).toISOString()), severity: undefined };
    expect(decideWatchIntent(i, null, now, new Set()).accept).toBe(false);
  });

  it('the phone reads intents off the DURABLE channel, not only off messages', () => {
    // Link 2. The wrist queues it under `intent`; if the native side only looks for `record`, the
    // report reaches the phone and dies with nothing to show for it.
    const native = fs.readFileSync(
      path.join(__dirname, '../../modules/hush-watch-connectivity/ios/HushWatchConnectivityModule.swift'),
      'utf8',
    );
    const handler = native.slice(native.indexOf('didReceiveUserInfo'));
    expect(handler).toContain('userInfo["intent"]');
    expect(handler).toContain('onIntent(intent)');
  });

  it('the wrist queues it rather than requiring a connection', () => {
    // Link 1. `guard localEngine == nil, manager.isReachable else { return false }` was the drop.
    const model = fs.readFileSync(path.join(__dirname, '../../targets/watch/WatchModel.swift'), 'utf8');
    const fn = model.slice(model.indexOf('func reportPain'), model.indexOf('func reportPain') + 700);
    expect(fn).toContain('manager.transferIntent');
    expect(fn).not.toMatch(/guard localEngine == nil, manager\.isReachable else \{ return false \}/);
  });
});
