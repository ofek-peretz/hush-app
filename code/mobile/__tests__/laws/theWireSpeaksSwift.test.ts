/**
 * ════ THE WIRE SPEAKS SWIFT (founder's wrist, build 59, 2026-08-26) ════
 *
 * The watch decodes every phone envelope with `try? JSONDecoder().decode(WireEnvelope.self, …)` —
 * one nested field of the wrong shape and the WHOLE envelope dies without a trace, which presents
 * exactly as his report: a wrist stuck on "Open on iPhone" while the phone believes it is
 * publishing. Swift's Codable is stricter than anything on the TS side ever checks:
 *
 *   · a REQUIRED (non-optional) field that is absent or JSON-null kills the frame;
 *   · an `Int` field that arrives as 97.5 kills the frame — optionality permits ABSENCE,
 *     never a type mismatch;
 *   · a `[String: String]` with one null value kills the frame.
 *
 * So this law parses the Swift structs THEMSELVES (targets/watch — the same file the wrist
 * compiles) and holds real phone-encoded envelopes against them: the lobby+plan envelope exactly
 * as Home builds it, and mirror frames across the phases a live session walks. A field added on
 * either side of the wire now meets this contract before it meets an athlete's wrist.
 */
// @ts-nocheck

import fs from 'fs';
import path from 'path';
import { makeStateEnvelope, serializeEnvelope } from '@/platform/watch/protocol';
import { buildCoachWatchPlan, watchPlanToPublish } from '@/platform/watch/watchPlan';
import { watchCopyPack } from '@/platform/watch/watchCopyPack';
import { projectSessionMirror } from '@/platform/sessionMirror';
import { buildMirrorSteps } from '@/state/stores/sessionStore';
import { initI18n } from '@/i18n';

const SWIFT = ['targets/watch/WatchWire.swift', 'targets/watch/WatchCopy.swift']
  .map((p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8'))
  .join('\n');

/** struct name → [{ field, type, optional }] parsed from the Swift source. */
function parseStructs(src) {
  const out = new Map();
  const re = /struct\s+(\w+)\s*:\s*Codable[^{]*\{/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1];
    // walk to the matching brace
    let depth = 1;
    let i = re.lastIndex;
    const start = i;
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth += 1;
      else if (src[i] === '}') depth -= 1;
      i += 1;
    }
    const body = src.slice(start, i - 1);
    const fields = [];
    for (const line of body.split('\n')) {
      const f = line.match(/^\s*var\s+(\w+)\s*:\s*([\w[\]:?\s]+?)\s*(?:\/\/.*)?$/);
      if (!f) continue;
      const type = f[2].trim();
      fields.push({ field: f[1], type: type.replace(/\?$/, ''), optional: type.endsWith('?') });
    }
    out.set(name, fields);
  }
  return out;
}

const STRUCTS = parseStructs(SWIFT);

/** Would Swift's JSONDecoder accept `value` for `type`? Returns a defect string or null. */
function check(value, type, where) {
  if (type.endsWith('?')) type = type.slice(0, -1); // inner optionals ([Double?] elements)
  if (type === 'Int') {
    return typeof value === 'number' && Number.isInteger(value) ? null : `${where}: Int got ${JSON.stringify(value)}`;
  }
  if (type === 'Double') {
    return typeof value === 'number' && Number.isFinite(value) ? null : `${where}: Double got ${JSON.stringify(value)}`;
  }
  if (type === 'String') return typeof value === 'string' ? null : `${where}: String got ${JSON.stringify(value)}`;
  if (type === 'Bool') return typeof value === 'boolean' ? null : `${where}: Bool got ${JSON.stringify(value)}`;
  const arr = type.match(/^\[(.+)\]$/);
  if (arr && arr[1].includes(':')) {
    // dictionary [K: V]
    const v = arr[1].split(':')[1].trim();
    if (!value || typeof value !== 'object' || Array.isArray(value)) return `${where}: dict got ${JSON.stringify(value)}`;
    for (const [k, item] of Object.entries(value)) {
      const d = check(item, v, `${where}.${k}`);
      if (d) return d;
    }
    return null;
  }
  if (arr) {
    if (!Array.isArray(value)) return `${where}: array got ${JSON.stringify(value)}`;
    const inner = arr[1].trim();
    for (let i = 0; i < value.length; i++) {
      if (value[i] == null) {
        if (inner.endsWith('?')) continue; // [Double?] permits null elements
        return `${where}[${i}]: null element in [${inner}]`;
      }
      const d = check(value[i], inner, `${where}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  // nested struct
  return checkStruct(value, type, where);
}

function checkStruct(obj, structName, where) {
  const fields = STRUCTS.get(structName);
  if (!fields) return `${where}: unknown Swift struct ${structName} — the parser lost it`;
  if (!obj || typeof obj !== 'object') return `${where}: ${structName} got ${JSON.stringify(obj)}`;
  for (const f of fields) {
    const v = obj[f.field];
    if (v === undefined || v === null) {
      if (f.optional) continue;
      return `${where}.${f.field}: REQUIRED ${f.type} is ${v === null ? 'null' : 'absent'}`;
    }
    const d = check(v, f.type, `${where}.${f.field}`);
    if (d) return d;
  }
  return null;
}

/** Encode → parse → hold against WireEnvelope, exactly what the wrist does minus the silence. */
function decodable(env) {
  return checkStruct(JSON.parse(serializeEnvelope(env)), 'WireEnvelope', 'envelope');
}

// ── real payloads ────────────────────────────────────────────────────────────────────────────────

const NOW = Date.parse('2026-08-26T10:00:00.000Z');

/** Blocks in the coach-plan vocabulary — the shape Home feeds buildCoachWatchPlan. */
const BLOCKS = [
  { rounds: 3, items: [{ kind: 'reps', ex: 'bb_bench_press', reps: [8, 10], load: 40 }] },
  { rounds: 3, items: [{ kind: 'reps', ex: 'pull_up', reps: [6, 10], load: null }] },
];

beforeAll(async () => {
  await initI18n();
});

describe('the envelopes the phone actually sends decode on the wrist', () => {
  it('the lobby envelope — lobby + plan + copy pack, exactly as Home publishes it', () => {
    const built = buildCoachWatchPlan({
      history: [],
      sessions: [{ id: 'w1', name: 'Upper A', blocks: BLOCKS }],
      nowMs: NOW,
      restInterSFor: () => null,
      restInterS: 90,
      restTransitionS: 120,
    });
    const plan = watchPlanToPublish({ built, weekLoaded: true, nowMs: NOW, restInterS: 90, restTransitionS: 120 });
    const lobby = {
      workoutId: 'w1',
      workoutName: 'Upper A',
      muscles: '',
      lifts: 2,
      durationLabel: undefined, // the coach stated no duration — Home omits, Swift optional
      firstWorkout: false,
      resting: false,
      gated: false,
      workouts: [{ id: 'w1', name: 'Upper A', lifts: 2, muscles: '', done: false }],
    };
    const env = makeStateEnvelope(null, 1, NOW, lobby, plan, watchCopyPack(), NOW);
    expect(decodable(env)).toBeNull();
  });

  it('the mirror envelopes — an active set, and a rest with the countdown live', () => {
    const steps = buildMirrorSteps([
      {
        exerciseId: 'bb_bench_press',
        globalIndex: 0,
        exerciseSetIndex: 0,
        totalSetsInExercise: 3,
        target: { exerciseId: 'bb_bench_press', setIndex: 0, recommendedWeight: 40, recommendedReps: 8, repBandLo: 8, repBandHi: 10 },
        lastSetOfExercise: false,
        lastSetOfSession: false,
      },
      {
        exerciseId: 'bb_bench_press',
        globalIndex: 1,
        exerciseSetIndex: 1,
        totalSetsInExercise: 3,
        target: { exerciseId: 'bb_bench_press', setIndex: 1, recommendedWeight: 40, recommendedReps: 8, repBandLo: 8, repBandHi: 10 },
        lastSetOfExercise: false,
        lastSetOfSession: false,
      },
    ]);
    const base = {
      steps,
      total: 2,
      restInterS: 90,
      restTransitionS: 120,
      restIsLearned: false,
      loggedSets: [],
      nowMs: NOW,
    };
    const active = projectSessionMirror({ ...base, machine: { phase: 'SET_ACTIVE', setIndex: 0 } });
    const activeDefect = decodable(makeStateEnvelope(active, 2, NOW, null, null, null, NOW));
    expect(activeDefect).toBeNull();

    const resting = projectSessionMirror({
      ...base,
      machine: { phase: 'REST_INTER', setIndex: 0 },
      restStartedAtMs: NOW - 10_000,
    });
    const restDefect = decodable(makeStateEnvelope(resting, 3, NOW, null, null, null, NOW));
    expect(restDefect).toBeNull();
  });

  it("⛔ THE FOUNDER'S OWN WEEK, IN HEBREW — the real engine, the real plan, the warm-up frames", async () => {
    /*
     * 2026-08-26, second report: phone-side WCSession alive (the wrist-offer screen proved
     * `pairingState` true across the board) and the wrist still starving. The fixtures above are
     * hand-shaped; THIS case rebuilds his envelope end-to-end — engine week from a real profile,
     * `coachPlanFromProgram` → `coachSession` blocks exactly as Home feeds them, Hebrew copy pack,
     * and the runner's own warm-up bridge frames (negative set indices!) — so a decode-killer
     * hiding in real data, not in shapes, has nowhere left to live.
     */
    const { setLocale } = require('@/i18n');
    const { db } = require('@/data/local/db');
    const { fixtureModel } = require('@/data/api/fixtureModel');
    const { coachPlanFromProgram, bandFromChoice } = require('@/domain/enginePlan');
    const { coachSession } = require('@/domain/coachWeek');
    const { buildPlanFromCoach, buildMirrorSteps: steps2, warmupOffer, insertWarmup } = require('@/state/stores/sessionStore');

    await setLocale('he');
    const profile = { id: 'p1', name: 'עופר', sex: 'male', units: 'kg', weightKg: 78, daysPerWeek: 4, bodyMap: {}, repBandByMuscle: {} };
    await db.clearAll();
    await db.saveProfile(profile);
    const program = await fixtureModel.generateProgram(profile);
    const targets = await fixtureModel.sessionTargets({ programDayId: program.days[0].id, completedSessions: 0 });
    const coachPlan = coachPlanFromProgram(program, targets, bandFromChoice(undefined));

    // The LOBBY envelope, from his real week:
    const sessions = coachPlan.sessions.map((s, i) => ({ id: `w${i}`, name: s.name, blocks: coachSession(coachPlan, `w${i}`)?.blocks ?? s.blocks }));
    const built = buildCoachWatchPlan({ history: [], sessions, nowMs: NOW, restInterSFor: () => null, restInterS: 90, restTransitionS: 120 });
    const plan = watchPlanToPublish({ built, weekLoaded: true, nowMs: NOW, restInterS: 90, restTransitionS: 120 });
    const lobby = {
      workoutId: 'w0', workoutName: coachPlan.sessions[0].name, muscles: '', lifts: 7,
      durationLabel: '55 min', firstWorkout: true, resting: false, gated: false,
      workouts: sessions.map((s, i) => ({ id: s.id, name: s.name, lifts: 7, muscles: '', done: i === 1 })),
    };
    expect(decodable(makeStateEnvelope(null, 10, NOW, lobby, plan, watchCopyPack(), NOW))).toBeNull();

    /* The MIRROR envelopes, from the runner's own steps — including the warm-up bridge frames.
       ⛔ THE BRIDGES ARE PRESSED IN, NOT BUILT IN (founder 2026-08-30): no plan carries a ramp any
       more, so this asks for one the way the stage does. The coverage that matters here is
       unchanged and is the reason the ramp is put back: a warm-up frame is a shape the wrist has to
       decode, and it must be exercised on the wire whatever inserts it. */
    const bare = buildPlanFromCoach(coachSession(coachPlan, 'w0') ?? coachPlan.sessions[0]);
    expect(bare.some((s) => s.warmup)).toBe(false);
    const offer = warmupOffer(bare, 0);
    const runnerSteps = offer ? insertWarmup(bare, offer.at, offer.ramp) : bare;
    const mSteps = steps2(runnerSteps);
    expect(runnerSteps.some((s) => s.warmup)).toBe(true); // his session opens on a bridge
    const base = { steps: mSteps, total: mSteps.length, restInterS: 90, restTransitionS: 120, restIsLearned: false, loggedSets: [], nowMs: NOW };
    for (let idx = 0; idx < Math.min(mSteps.length, 6); idx++) {
      const active = projectSessionMirror({ ...base, machine: { phase: 'SET_ACTIVE', setIndex: idx } });
      expect(decodable(makeStateEnvelope(active, 20 + idx * 2, NOW, null, null, null, NOW))).toBeNull();
      const rest = projectSessionMirror({ ...base, machine: { phase: 'REST_INTER', setIndex: idx }, restStartedAtMs: NOW - 5000 });
      expect(decodable(makeStateEnvelope(rest, 21 + idx * 2, NOW, null, null, null, NOW))).toBeNull();
    }
  });

  it('the parser can actually fail — a fractional Int and a missing required field are caught', () => {
    expect(check(97.5, 'Int', 'x')).toContain('Int got 97.5');
    expect(checkStruct({}, 'WireLobby', 'x')).toContain('REQUIRED');
    // and the Swift source really was parsed — the structs the wire depends on all exist
    for (const s of ['WireEnvelope', 'WireMirror', 'WireLobby', 'WirePlan', 'WirePlanWorkout', 'WirePlanStep', 'WireCopyPack']) {
      expect(STRUCTS.has(s)).toBe(true);
    }
  });
});
