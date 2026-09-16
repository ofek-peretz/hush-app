/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * A RUN SHE DID IS CARRIED INTO HER LEGS — founder authorization, 2026-08-24.
 *
 * The competitive review's open lane: no engine on the market folds external work into the
 * strength prescription with a sentence (Fitbod ingests and explains nothing; Juggernaut and RP
 * ASK). Hush's version is readiness WITHOUT a questionnaire — the run is a fact this product
 * already measures, and this law holds its whole contract (engine/v5/runEase):
 *
 *   1 · only a real cost triggers it: a RUN (never a walk), long enough, inside 36 hours;
 *   2 · the answer is scoped and honest: LOWER-BODY lifts only, ONE rung on the room's ladder,
 *       stamped with the run that earned it — and Loop 1 stays free to raise (a caution, not a
 *       verdict — the deliberate difference from the deload);
 *   3 · one run answers once (idempotent), never during a light week, and the eased occurrence
 *       does not fold;
 *   4 · it closes the moment the eased session happened — or when the window lapses, even on a
 *       pure read — and the loads walk back exactly, stamped;
 *   5 · both sentences exist, in both of her languages.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import * as fs from 'fs';
import * as path from 'path';
import { advanceV5, currentV5Targets, resetV5, explainChange } from '@/engine/v5/v5Engine';
import { runQualifies, easeDueFor, RUN_EASE_MIN_KM, RUN_EASE_MIN_SEC, RUN_EASE_WINDOW_H, RUN_EASE_MUSCLES } from '@/engine/v5/runEase';
import { bandFor } from '@/engine/v5/repBand';
import { db } from '@/data/local/db';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CardioActivity, Session, SetLog } from '@/data/local/models';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

const BAND = bandFor('8-10');
const SQUAT = 'bb_back_squat'; // Quads — eased
const BENCH = 'bb_bench_press'; // Chest — untouched
const LIFTS = [SQUAT, BENCH];
const seed = () => 60;
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

const set = (exerciseId: string, setIndex: number, reps: number): SetLog => ({
  exerciseId, setIndex, recommendedWeight: 60, recommendedReps: 8, actualWeight: 60, actualReps: reps, edited: false, persistedAt: '', restBeforeS: 90,
});
const session = (startedAt: string, reps = 8): Session => ({
  id: `s_${startedAt}`,
  programDayId: 'd',
  startedAt,
  state: 'SAVED',
  earlyFinish: false,
  sets: LIFTS.flatMap((id) => [0, 1, 2].map((i) => set(id, i, reps))),
});
const T = (n: number, hour = 10) => new Date(2026, 4, 4 + n, hour).toISOString();

const run = (startedAt: string, km: number, durationSec = 40 * 60): CardioActivity => ({
  kind: 'cardio',
  id: `c_${startedAt}`,
  gait: 'run',
  startedAt,
  durationSec,
  distanceKm: km,
  avgPaceSec: km > 0 ? Math.round(durationSec / km) : 0,
  splits: [],
});

describe('1 · only a real cost triggers it', () => {
  it('a run qualifies by distance or by duration; a walk never does', () => {
    expect(runQualifies(run(T(0), RUN_EASE_MIN_KM))).toBe(true);
    expect(runQualifies(run(T(0), 2, RUN_EASE_MIN_SEC))).toBe(true);
    expect(runQualifies(run(T(0), 2, 15 * 60))).toBe(false); // short and slow — training, not fatigue
    expect(runQualifies({ ...run(T(0), 10), gait: 'walk' })).toBe(false);
  });

  it('the window is 36 hours from the run’s END — outside it the legs answered for themselves', () => {
    const r = run(T(0), 8);
    const end = Date.parse(r.startedAt) + r.durationSec * 1000;
    expect(easeDueFor([r], end + (RUN_EASE_WINDOW_H - 1) * HOUR, null)).toBe(r);
    expect(easeDueFor([r], end + (RUN_EASE_WINDOW_H + 1) * HOUR, null)).toBeNull();
    expect(easeDueFor([r], Date.parse(r.startedAt) - HOUR, null)).toBeNull(); // the future is not evidence
  });
});

describe('2+3+4 · the whole arc, scoped and honest', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await resetV5();
  });

  it('legs ease one rung with the run stamped on them; the bench is untouched; loads walk back after the session', async () => {
    // Two weeks of ordinary training, then a Saturday-evening 8 km run.
    const history = Array.from({ length: 6 }, (_, n) => session(T(n * 2)));
    const lastAt = Date.parse(history[5].startedAt);
    await advanceV5(LIFTS, BAND, history, seed, lastAt);
    const before = await currentV5Targets(history, lastAt);

    await db.appendCardioActivity(run(T(11, 18), 8.2)); // evening run, day 11
    const morningAfter = Date.parse(T(12, 9));
    await advanceV5(LIFTS, BAND, history, seed, morningAfter); // a pure read — no new sessions

    const state = await db.loadEngineV5();
    expect(state.runEase).toBeTruthy();
    expect(Object.keys(state.runEase.restore)).toEqual([SQUAT]); // lower body only
    const opens = (state.changeLog ?? []).filter((c) => c.kind === 'ease' && c.loadTo < c.loadFrom);
    expect(opens).toHaveLength(1);
    expect(opens[0].exerciseId).toBe(SQUAT);
    expect(opens[0].runKm).toBe(8.2); // the sentence carries the run that earned it

    const eased = await currentV5Targets(history, morningAfter);
    expect(eased[SQUAT].weight).toBeLessThan(before[SQUAT].weight);
    expect(eased[BENCH].weight).toBe(before[BENCH].weight); // the run cost her legs, not her bench

    // She trains that morning — a strong session AT THE PRESCRIBED LOADS (the bench rows carry its
    // real prescription, or the rail would read a lighter demonstration and hold it — fixture
    // honesty, not an engine quirk). The eased lift does NOT fold (a cautious start is not
    // capability news); the bench folds normally; and the ease closes, loads restored.
    const easedSession: Session = {
      ...session(T(12, 10), 9),
      sets: [
        ...[0, 1, 2].map((i) => set(SQUAT, i, 10)),
        ...[0, 1, 2].map((i) => ({ ...set(BENCH, i, 10), recommendedWeight: before[BENCH].weight, actualWeight: before[BENCH].weight })),
      ],
    };
    await advanceV5(LIFTS, BAND, [...history, easedSession], seed, Date.parse(easedSession.startedAt) + HOUR);
    const after = await db.loadEngineV5();
    expect(after.runEase).toBeUndefined();
    const restores = (after.changeLog ?? []).filter((c) => c.kind === 'ease' && c.loadTo > c.loadFrom);
    expect(restores).toHaveLength(1);
    const final = await currentV5Targets([...history, easedSession], Date.parse(easedSession.startedAt) + HOUR);
    expect(final[SQUAT].weight).toBe(before[SQUAT].weight); // exactly where it stood
    expect(final[BENCH].weight).toBeGreaterThan(before[BENCH].weight); // the bench progressed — its fold ran

    // …and the same run can never ease twice.
    await advanceV5(LIFTS, BAND, [...history, easedSession], seed, Date.parse(easedSession.startedAt) + 2 * HOUR);
    expect((await db.loadEngineV5()).runEase).toBeUndefined();
  });

  it('a lapsed window restores on a pure read — she skipped the gym, nothing lingers', async () => {
    const history = Array.from({ length: 6 }, (_, n) => session(T(n * 2)));
    const lastAt = Date.parse(history[5].startedAt);
    await advanceV5(LIFTS, BAND, history, seed, lastAt);
    const before = await currentV5Targets(history, lastAt);

    await db.appendCardioActivity(run(T(11, 18), 8.2));
    await advanceV5(LIFTS, BAND, history, seed, Date.parse(T(12, 9))); // opens
    await advanceV5(LIFTS, BAND, history, seed, Date.parse(T(14, 9))); // 39 h later — lapsed
    const state = await db.loadEngineV5();
    expect(state.runEase).toBeUndefined();
    const final = await currentV5Targets(history, Date.parse(T(14, 9)));
    expect(final[SQUAT].weight).toBe(before[SQUAT].weight);
  });

  it('a catch-up fold never fabricates an ease — the review find of 2026-08-24', async () => {
    /*
     * Offline stretch: she ran Monday and trained Tuesday AT THE FULL PRESCRIPTION (the app was
     * closed, so no ease was ever shown). The Wednesday catch-up fold must (1) fold Tuesday's real
     * evidence — the squat PROGRESSES — and only then (2) open the ease at the read moment, on top
     * of the progressed load, with the restore pointing at the progressed load. First written the
     * other way, and the other way threw her real Tuesday away.
     */
    const history = Array.from({ length: 6 }, (_, n) => session(T(n * 2)));
    const lastAt = Date.parse(history[5].startedAt);
    await advanceV5(LIFTS, BAND, history, seed, lastAt);
    const before = await currentV5Targets(history, lastAt);

    await db.appendCardioActivity(run(T(11, 22), 8.2)); // Monday night's run (window → Wed ~10:40)
    const offline = {
      ...session(T(12, 10), 9),
      sets: [0, 1, 2].map((i) => ({ ...set(SQUAT, i, 10), recommendedWeight: before[SQUAT].weight, actualWeight: before[SQUAT].weight })),
    };
    // First fold since before the run — Wednesday morning, still inside the 36 h window.
    await advanceV5(LIFTS, BAND, [...history, offline], seed, Date.parse(T(13, 9)));
    const state = await db.loadEngineV5();
    expect(state.runEase).toBeTruthy(); // the ease opened — at the READ, for the session ahead
    const progressed = state.runEase.restore[SQUAT];
    expect(progressed).toBeGreaterThan(before[SQUAT].weight); // …on TOP of Tuesday's real progress
  });

  it('an ease answers the occasional run — four days of hysteresis, never every leg day', async () => {
    const { RUN_EASE_COOLDOWN_H } = require('@/engine/v5/runEase');
    expect(RUN_EASE_COOLDOWN_H).toBe(96);
    const r1 = run(T(0, 18), 8);
    const r2 = run(T(2, 18), 8); // two days later — an adapted runner's ordinary week
    const afterR2 = Date.parse(T(3, 9));
    expect(easeDueFor([r1, r2], afterR2, Date.parse(r1.startedAt))).toBeNull(); // inside the cooldown
    const r3 = run(T(5, 18), 8); // five days after the answered run
    expect(easeDueFor([r1, r2, r3], Date.parse(T(6, 9)), Date.parse(r1.startedAt))).toBe(r3);
  });

  it('never during a light week — the deload already answered', async () => {
    const src = read('src/engine/v5/v5Engine.ts');
    expect(src).toContain('if (state.deload || state.runEase) return;');
    expect(src).toContain('!state.deload && !state.runEase');
  });

  it('Loop 1 stays free to raise — a caution, not a verdict (no hold flag exists for the ease)', () => {
    const src = read('src/engine/v5/runEase.ts');
    expect(src).toContain('NO `deloadHold`');
    expect(read('src/data/api/fixtureModel.ts')).not.toContain('easeHold');
  });
});

describe('5 · both sentences exist, in both of her languages', () => {
  const en = JSON.parse(read('src/i18n/locales/en.json'));
  const he = JSON.parse(read('src/i18n/locales/he.json'));
  it('easeStart (km + long variants) and easeEnd, en + he', () => {
    for (const lang of [en, he]) {
      expect(lang.explain.easeStart.observationKm).toBeTruthy();
      expect(lang.explain.easeStart.observationLong).toBeTruthy();
      expect(lang.explain.easeStart.textKm).toBeTruthy();
      expect(lang.explain.easeEnd.text).toBeTruthy();
    }
  });

  it('explainChange narrates by direction, and the km rides the entry', () => {
    const base = { exerciseId: SQUAT, decision: 'ease', setsFrom: 3, setsTo: 3, bandFrom: [8, 10], bandTo: [8, 10], at: 0, kind: 'ease' };
    expect(explainChange({ ...base, loadFrom: 60, loadTo: 57.5, runKm: 8.2 }).observation.key).toBe('explain.easeStart.observationKm');
    expect(explainChange({ ...base, loadFrom: 60, loadTo: 57.5, runKm: null }).observation.key).toBe('explain.easeStart.observationLong');
    expect(explainChange({ ...base, loadFrom: 57.5, loadTo: 60 }).observation.key).toBe('explain.easeEnd.observation');
  });

  it('the muscles the run spends are the canonical lower body', () => {
    expect([...RUN_EASE_MUSCLES].sort()).toEqual(['Calves', 'Glutes', 'Hamstrings', 'Quads']);
  });
});
