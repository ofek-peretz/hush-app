/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE WRIST OFFERS THE WARM-UP THE PHONE OFFERS — with the phone, and without it. (2026-10-17)
 *
 *   > *"אני חושב שרק בתרגילי הקומפאונד צריך להופיע האפשרות לפקד חימום ובשאר לא. לא לקבוע מראש
 *   > לאף אחד חימום ומי שרוצה שילחץ על הפקד."* — the founder, 2026-08-30
 *
 * Since that ruling the phone's stage has drawn a warm-up disc on a compound's first set, and a press
 * inserts the bridges (`warmupOffer` / `insertWarmup`). The wrist never offered it — not with the
 * phone in her pocket, not with the phone in a locker — so a lifter reading her sets off her wrist
 * met her first heavy squat cold. The wrist-alone plan's stage 2 (approved 2026-10-13, "כן מאשר").
 *
 * ONE OFFER, THREE ROADS TO IT, AND THIS LAW JOINS THEM:
 *   · with the phone — the frame says how many bridges are on offer (`warmupOffered`), the wrist
 *     proposes `add_warmup`, and the phone's own disc press puts them in;
 *   · without it — the plan the wrist holds carries the phone's answer for that step (`ramp`), and
 *     the wrist's engine inserts exactly those bridges (played on the real engine by
 *     `sync/theWristRunsWhatThePhoneRuns`, scenario `warm-up`);
 *   · and home again — a bridge done on the wrist arrives as the bridge it is, whichever way it
 *     travels (the finished record, or the live handover), and a session of bridges alone is not a
 *     workout on either device.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck
//
import fs from 'fs';
import path from 'path';
import { buildCoachWatchPlan } from '@/platform/watch/watchPlan';
import { buildPlanFromCoach, warmupOffer } from '@/state/stores/sessionStore';
import { loadSetup } from '@/domain/loadPresentation';
import { WARMUP_REST_S } from '@/domain/warmupRamp';
import { projectSessionMirror } from '@/platform/sessionMirror';
import { decideWatchIntent, parseWatchLocalSession, WATCH_PROTOCOL_VERSION } from '@/platform/watch/protocol';
import { watchRecordToSession, applyWatchSessionRecord } from '@/platform/watch/watchReconcile';
import { adoptWatchSession } from '@/platform/watch/watchAdopt';

const ROOT = path.resolve(__dirname, '..', '..');
const swift = (f: string) => fs.readFileSync(path.join(ROOT, 'targets', 'watch', f), 'utf8');
const NOW = Date.parse('2026-10-17T09:00:00.000Z');
const reps = (ex: string, load: number | null, band: [number, number] = [6, 10]) => ({ kind: 'reps', ex, load, reps: band });

/** A day with every case the ruling names: a first compound, an isolation, a superset, a later compound, a hold. */
const DAY = {
  name: 'Full A',
  blocks: [
    { rounds: 3, items: [reps('bb_back_squat', 100, [5, 8])] },
    { rounds: 2, items: [reps('leg_extension', 40, [10, 15])] },
    { rounds: 2, items: [reps('bb_bench_press', 60), reps('bb_row', 50)] }, // a superset: no bridge inside a round
    { rounds: 2, items: [reps('bb_rdl', 80, [8, 10])] },
    { rounds: 1, items: [{ kind: 'time', ex: 'plank', seconds: 45 }] },
  ],
};

describe('the plan the wrist holds carries the phone’s own offer — and nowhere else', () => {
  const built = buildCoachWatchPlan({ sessions: [{ id: 'd1', ...DAY }], nowMs: NOW, restInterS: 90, restTransitionS: 120 });
  const steps = (built.workouts[0] ?? built.moreWorkouts[0]).steps;
  const own = buildPlanFromCoach(DAY);

  it('⛔ a step carries a ramp exactly where `warmupOffer` answers on the phone’s own plan of the day', () => {
    expect(steps.length).toBe(own.length);
    const offeredAt = own.map((_, i) => (warmupOffer(own, i) ? i : -1)).filter((i) => i >= 0);
    const carriedAt = steps.map((s, i) => (s.ramp ? i : -1)).filter((i) => i >= 0);
    expect(carriedAt).toEqual(offeredAt);
    // The cases the ruling names, by name: the first squat (two bridges) and the first deadlift (one).
    expect(carriedAt.map((i) => `${steps[i].exerciseId} ×${steps[i].ramp.length}`)).toEqual(['bb_back_squat ×2', 'bb_rdl ×1']);
  });

  it('…the same bridges, to the kilo, each with the bar it is loaded on', () => {
    for (const [i, s] of steps.entries()) {
      if (!s.ramp) continue;
      const offer = warmupOffer(own, i)!;
      expect(s.ramp.map((r) => [r.weightKg, r.reps])).toEqual(offer.ramp.map((w) => [w.weightKg, w.reps]));
      for (const r of s.ramp) expect(r.loadSetup?.perSide).toBe(loadSetup(s.exerciseId, r.weightKg, 'kg')?.perSide);
    }
  });

  it('no plan the wrist is sent ever CONTAINS a bridge — the warm-up is offered, never written in', () => {
    expect(steps.some((s) => s.warmup)).toBe(false);
  });
});

describe('with the phone: the frame says it, the wrist asks for it, the phone decides', () => {
  const STEPS = [
    { exerciseName: 'Back Squat', setIndexInExercise: 0, totalSetsInExercise: 3, globalIndex: 0, targetWeight: 100, targetReps: 5 },
    { exerciseName: 'Back Squat', setIndexInExercise: 1, totalSetsInExercise: 3, globalIndex: 1, targetWeight: 100, targetReps: 5 },
  ];
  const frame = (phase: string, warmupOffered?: number) =>
    projectSessionMirror({ steps: STEPS, total: 2, machine: { phase, setIndex: 0, resumePhase: 'SET_PRESENTED' }, restInterS: 90, restTransitionS: 120, restStartedAtMs: NOW - 10_000, nowMs: NOW, warmupOffered } as never)!;
  const intent = (over = {}) => ({ v: WATCH_PROTOCOL_VERSION, type: 'add_warmup', intentId: `w${Math.random()}`, issuedAt: new Date(NOW).toISOString(), expectedGlobalIndex: 0, ...over });

  it('the offer rides an ACTIVE SET only, and only when there is one', () => {
    expect(frame('SET_PRESENTED', 2).warmupOffered).toBe(2);
    expect('warmupOffered' in frame('SET_PRESENTED', 0)).toBe(false);
    expect('warmupOffered' in frame('REST_INTER', 2)).toBe(false);
    expect('warmupOffered' in frame('PAUSED', 2)).toBe(false);
  });

  it('⛔ "+ Warm-up" is accepted only against an offer, on the set it was offered for', () => {
    expect(decideWatchIntent(intent(), frame('SET_PRESENTED', 2), NOW, new Set())).toMatchObject({ accept: true, action: { kind: 'add_warmup' } });
    // No offer (a curl, or the bridges already in): refused — never a second ramp.
    expect(decideWatchIntent(intent(), frame('SET_PRESENTED', 0), NOW, new Set())).toMatchObject({ accept: false, reason: 'phase_mismatch' });
    // A tap from the set before, landing late: refused.
    expect(decideWatchIntent(intent({ expectedGlobalIndex: 1 }), frame('SET_PRESENTED', 2), NOW, new Set())).toMatchObject({ accept: false, reason: 'index_mismatch' });
    // Resting: there is no set on stage to warm up for.
    expect(decideWatchIntent(intent(), frame('REST_INTER', 2), NOW, new Set())).toMatchObject({ accept: false });
  });
});

describe('home again: a bridge done on the wrist is filed as the bridge it is', () => {
  const at = (s: number) => new Date(NOW - s * 1000).toISOString();
  const bridge = { exerciseId: 'bb_back_squat', setIndex: -2, recommendedWeight: 50, recommendedReps: 5, actualWeight: 50, actualReps: 5, completedAt: at(300), isWarmup: true };
  const work = { exerciseId: 'bb_back_squat', setIndex: 0, recommendedWeight: 100, recommendedReps: 5, actualWeight: 100, actualReps: 5, completedAt: at(100) };
  const record = (sets) => ({ v: WATCH_PROTOCOL_VERSION, type: 'session_record', recordId: `r${sets.length}`, workoutId: 'd1', workoutName: 'Full A', startedAt: at(900), endedAt: at(0), earlyFinish: true, sets });

  it('the finished record: both of the phone’s marks, and the working set untouched', () => {
    const s = watchRecordToSession(record([bridge, work]));
    expect(s.sets[0]).toMatchObject({ setIndex: -2, isApproach: true, isWarmup: true });
    expect(s.sets[1].isApproach).toBeUndefined();
  });

  it('⛔ a session of bridges alone is not a workout — the phone’s own rule for one it ran', async () => {
    const saved = [];
    const acked = [];
    const deps = {
      loadHistory: async () => [],
      appendCompletedSession: async (x) => void saved.push(x),
      recordSessionCompleted: async () => ({ unlockedPortrait: false }),
      markWorkoutCompleted: async () => {},
      recordToModel: async () => {},
      enqueuePendingSync: async () => {},
      track: () => {},
      ack: (id) => void acked.push(id),
    };
    await applyWatchSessionRecord(record([bridge]), deps);
    expect(saved).toEqual([]);
    await applyWatchSessionRecord(record([bridge, work]), deps);
    expect(saved.length).toBe(1);
    expect(acked).toEqual(['r1', 'r2']); // both answered, so the wrist's outbox clears either way
  });

  it('the live handover: a bridge on stage is a bridge on the phone, and its log keeps its marks', () => {
    const step = (over) => ({ exerciseId: 'bb_back_squat', exerciseName: 'Back Squat', setIndexInExercise: 0, totalSetsInExercise: 3, globalIndex: 0, targetWeight: 100, targetReps: 5, targetRepsHi: 8, ...over });
    const steps = [
      step({ setIndexInExercise: -2, targetWeight: 50, targetReps: 5, targetRepsHi: undefined, warmup: { index: 0, count: 2 }, restAfterS: WARMUP_REST_S, restWritten: true }),
      step({ globalIndex: 1, setIndexInExercise: -1, targetWeight: 75, targetReps: 3, targetRepsHi: undefined, warmup: { index: 1, count: 2 }, restAfterS: WARMUP_REST_S, restWritten: true }),
      step({ globalIndex: 2, at: { block: 1, round: 1, position: 1 } }),
    ];
    const offer = { v: WATCH_PROTOCOL_VERSION, type: 'local_session', recordId: 'rec-w', workoutId: 'd1', workoutName: 'Full A', startedAt: at(900), phase: 'active_set', currentIndex: 1, steps, sets: [bridge], sentAt: at(0) };
    const parsed = parseWatchLocalSession(JSON.parse(JSON.stringify(offer)));
    expect(parsed).not.toBeNull();
    const adopted = adoptWatchSession(parsed, NOW);
    expect(adopted.plan[1]).toMatchObject({ warmup: { index: 1, count: 2 }, exerciseSetIndex: -1, restAfterS: WARMUP_REST_S, lastSetOfExercise: false });
    expect(adopted.plan[1].where).toBeUndefined(); // the ramp is the app's own, not a coach item
    expect(adopted.plan[2].warmup).toBeUndefined();
    expect(adopted.session.sets[0]).toMatchObject({ isApproach: true, isWarmup: true, setIndex: -2 });
    // …and a negative set number with no warm-up mark is still junk.
    expect(parseWatchLocalSession({ ...offer, sets: [{ ...bridge, isWarmup: undefined }] })).toBeNull();
  });
});

describe('the wrist’s half, read from its source (it is compiled and RUN on a Mac by the instrument)', () => {
  it('the breath after a bridge is the phone’s number', () => {
    const m = swift('WatchWire.swift').match(/let WARMUP_REST_S = (\d+)/);
    expect(Number(m?.[1])).toBe(WARMUP_REST_S);
  });

  it('the set screen offers it beside Complete set while — and only while — one is on offer', () => {
    const screens = swift('WatchScreens.swift');
    const footer = screens.slice(screens.indexOf('private var footer: some View'));
    expect(footer).toMatch(/mirror\.warmupOffered \?\? 0\) > 0/);
    expect(footer).toContain('WatchCopy.addWarmup');
    expect(footer).toContain('action: onWarmup');
    expect(screens).toContain('onWarmup: model.addWarmup');
  });

  it('one press, two routes: the wrist’s own engine alone, the phone’s disc otherwise', () => {
    const model = swift('WatchModel.swift');
    const fn = model.slice(model.indexOf('func addWarmup()'), model.indexOf('func addRest()'));
    expect(fn).toContain('engine.addWarmup()');
    expect(fn).toContain('"add_warmup"');
  });

  it('⛔ the engine inserts what it was told and spends the offer — it computes no ramp of its own', () => {
    const engine = swift('LocalWorkoutEngine.swift');
    const fn = engine.slice(engine.indexOf('func addWarmup()'), engine.indexOf('func endRest()'));
    expect(fn).toContain('anchor.ramp');
    expect(fn).toContain('state.steps[at].ramp = nil');
    expect(fn).not.toMatch(/\* 0\.[0-9]/); // no fraction of a working weight is worked out on the wrist
    // …and a bridge's weight is never carried onto the working sets.
    expect(engine).toMatch(/if !step\.isBridge \{ carryForward/);
  });
});
