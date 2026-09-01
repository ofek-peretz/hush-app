/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * A VIRTUAL ATHLETE, TRAINED ON THE REAL SEAM.
 *
 * `generateProgram` → `sessionTargets` → Loop 1 live → append → fold → regenerate, for someone whose
 * TRUE strength the engine cannot see. Nothing here models the engine: it performs what the engine
 * asks for and records what happened.
 *
 * ⛔ IT LIVES HERE BECAUSE TWO LAWS NEED THE SAME ATHLETE. `theProgrammeSurvivesTheMonths` asks
 * whether the programme is SAFE (never above her, never dead on a floor, the contract kept);
 * `thePrescriptionIsAccurate` asks how OFTEN the engine is right. Those are different questions
 * about one simulation, and running two simulations to ask them would let the two disagree about
 * the athlete — the failure this repo keeps finding in its own code.
 *
 * ── THE BODY MODEL, AND WHAT IT DELIBERATELY DOES NOT KNOW ───────────────────────────────────────
 * Her true capacity on a lift is the load at which she gets exactly `TLO` fresh reps. Reps fall
 * about 3% of load per rep (the rep-max relationship), another ~0.8 per set from accumulated fatigue
 * inside the exercise, and she gains strength week by week at a decaying novice rate. The noise is
 * ±0.8 reps, seeded — a law may not pass or fail by luck (I-24).
 *
 * ⚠️ THE PER-SET FATIGUE IS THE POINT OF THE WHOLE THING. She is asked for the same load and the
 * same reps on set 1 and set 4 (`fixtureModel.sessionTargets` emits one target per exercise, copied
 * across every set), while her body delivers ~2.4 fewer reps by the fourth. Any honest measurement
 * of "does the engine know what she can lift" has to include that drift, or it measures a set she
 * never does.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import { fixtureModel } from '@/data/api/fixtureModel';
import { db } from '@/data/local/db';
import { exerciseById } from '@/data/exercises';
import { carryWeightForward } from '@/engine/v5/liveSession';
import { modelledLoadKg } from '@/domain/startingLoad';
import { loadFloor } from '@/engine/v5/grid';
import type { Profile, Program, Session, SetLog } from '@/data/local/models';

export const TLO = 8;
export const THI = 10;

/** Deterministic — a law may not pass or fail by luck. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Person {
  label: string;
  sex: 'male' | 'female';
  weightKg: number;
  days: number;
  minutes: number;
  /** Her true strength as a fraction of what B-1 models for someone her size. */
  capRatio: number;
  seed: number;
}

/** One occurrence of one lift — what `theProgrammeSurvivesTheMonths` reads. */
export interface Occurrence { load: number; cap: number; reps: number[]; floor: number }

/** One PERFORMED set — what the accuracy scoreboard reads. */
export interface PerformedSet {
  week: number;
  exerciseId: string;
  /** Which set of the exercise this was: 0, 1, 2… */
  setIndex: number;
  /** How many occurrences of THIS lift she had already trained before this one. */
  priorOccurrences: number;
  bodyweight: boolean;
  load: number | null;
  bandLo: number;
  bandHi: number;
  reps: number;
}

export interface TrainingRun {
  trace: Record<string, Occurrence[]>;
  sets: PerformedSet[];
}

/**
 * Train one virtual athlete for `weeks` weeks on the real seam.
 *
 * ⚠️ `db.clearAll()` first, and the caller must not run two of these concurrently — the engine's
 * state is a single persisted blob, and two athletes sharing it is not two athletes.
 */
export async function train(p: Person, weeks: number): Promise<TrainingRun> {
  await db.clearAll();
  const r = rng(p.seed);
  const cap: Record<string, number> = {};
  const bwCap: Record<string, number> = {};
  const capFor = (id: string) => (cap[id] ??= (modelledLoadKg(exerciseById(id)!, p) ?? 10) * p.capRatio);
  const bwCapFor = (id: string) => (bwCap[id] ??= Math.max(2, Math.round(6 * p.capRatio + (p.sex === 'male' ? 4 : 0))));
  const repsFor = (id: string, load: number | null, setIndex: number) => {
    const ex = exerciseById(id)!;
    const wear = setIndex * 0.8 + (r() - 0.5) * 1.6;
    if (ex.bodyweight || load == null) return Math.max(0, Math.round(bwCapFor(id) + 4 - wear));
    const c = capFor(id);
    return Math.max(0, Math.round(TLO + (c - load) / Math.max(0.4, c * 0.03) - wear));
  };

  const profile: Profile = {
    units: 'kg', goal: 'build_muscle', healthConnected: false,
    sex: p.sex, weightKg: p.weightKg, daysPerWeek: p.days, workoutMinutes: p.minutes, repBand: '8-10',
  };
  await db.saveProfile(profile);

  const trace: Record<string, Occurrence[]> = {};
  const performed: PerformedSet[] = [];
  const occurrencesOf: Record<string, number> = {};
  /*
   * ⛔ THE RUN ENDS AT (ABOUT) NOW, AND IT USED TO END IN MARCH.
   *
   * This was a fixed `2026-01-05`, which was harmless while nothing in the engine compared her
   * history to the wall clock. B-9 does: `applyDetrainingV5` reads the gap between her most recent
   * session and now, and a run anchored in January describes an athlete who stopped training months
   * ago — so every `sessionTargets` call inside the simulation correctly decayed her loads, and the
   * accuracy board fell apart on a defect that was the HARNESS's.
   *
   * The engine was right and the fiction was wrong: "train one virtual athlete for N weeks" means the
   * N weeks up to today, not eight weeks last winter. Anchored backwards from now so it always does.
   *
   * ⚠️ IT IS STILL DETERMINISTIC IN EVERYTHING THAT DECIDES ANYTHING (I-24). The only thing the
   * absolute date reaches is the detraining gap, which this keeps at zero; every load, band, rung and
   * rep is driven by the seeded RNG and by the ORDER of sessions, both untouched.
   */
  let t = Date.now() - weeks * 7 * 86400000;

  /*
   * ⛔⛔ THE ATHLETE'S TODAY IS `t`, AND UNTIL 2026-08-16 IT WAS THE WALL CLOCK.
   *
   * The simulation advances its own clock week by week while the engine underneath read
   * `Date.now()`. Those were two different days, and nothing had ever compared them — so the
   * inconsistency sat here harmlessly for as long as no engine decision depended on the calendar.
   *
   * B-9 depends on the calendar: `applyDetrainingV5` reads the gap between her most recent session
   * and now. With the wall clock, week 1 of a ten-week run looked like an athlete returning after
   * seventy days away, so the engine correctly decayed her loads — and the accuracy board collapsed
   * to 37.5% in band with set 1 missing by THIRTEEN reps. Every one of those numbers was the
   * harness's fiction being measured, not the engine's forecast.
   *
   * ⚠️ SO THE WHOLE RUN HAPPENS ON HER CLOCK. This is not a workaround for detraining; it is the
   * simulation finally being self-consistent — `weekCadence`, the fold cursor and the recency window
   * all read the same day she is training on. Restored in `finally`, because a leaked `Date.now`
   * would silently corrupt every suite that runs after this one in the same worker.
   */
  const realNow = Date.now;
  Date.now = () => t;
  try {
  let program: Program = await fixtureModel.generateProgram(profile);
  await db.saveProgram(program);

  for (let w = 0; w < weeks; w++) {
    if (w > 0) {
      program = await fixtureModel.generateProgram(profile); // the weekly roll — Loop 3 reshapes here
      await db.saveProgram(program);
    }
    const trained = new Set<string>();
    for (const day of program.days) {
      if (day.isRest || day.slots.length === 0) continue;
      const targets = await fixtureModel.sessionTargets({ programDayId: day.id, completedSessions: 0 });
      let plan = day.slots
        .flatMap((slot) =>
          Array.from({ length: slot.setCount }, (_, s) => ({
            exerciseId: slot.exerciseId,
            globalIndex: 0,
            exerciseSetIndex: s,
            target:
              targets.find((x) => x.exerciseId === slot.exerciseId && x.setIndex === s) ??
              { exerciseId: slot.exerciseId, setIndex: s, recommendedWeight: null, recommendedReps: TLO, repBandLo: TLO, repBandHi: THI },
          })),
        )
        .map((s, i) => ({ ...s, globalIndex: i }));

      const sets: SetLog[] = [];
      const session: Session = {
        id: `s${w}_${day.id}`, programDayId: day.id, programDayName: day.name,
        startedAt: new Date(t).toISOString(), state: 'SAVED', earlyFinish: false, sets,
      };
      const history = await db.loadHistory();

      for (const step of plan) {
        const live = plan.find((s) => s.globalIndex === step.globalIndex)!; // Loop 1 may have moved it
        const load = live.target.recommendedWeight;
        const reps = repsFor(live.exerciseId, load, live.exerciseSetIndex);
        sets.push({
          exerciseId: live.exerciseId, setIndex: live.exerciseSetIndex,
          recommendedWeight: load, recommendedReps: live.target.recommendedReps,
          actualWeight: load, actualReps: reps, edited: false,
          persistedAt: new Date(t + live.globalIndex * 180000).toISOString(),
          restBeforeS: live.exerciseSetIndex === 0 ? 120 : 90,
        });
        performed.push({
          week: w,
          exerciseId: live.exerciseId,
          setIndex: live.exerciseSetIndex,
          priorOccurrences: occurrencesOf[live.exerciseId] ?? 0,
          bodyweight: !!exerciseById(live.exerciseId)?.bodyweight,
          load,
          bandLo: live.target.repBandLo ?? TLO,
          bandHi: live.target.repBandHi ?? THI,
          reps,
        });
        // Exactly the call sequence sessionStore makes on "Complete set" — which, since the
        // 2026-08-26 ruling, is CARRY ONLY: mid-session she is a logger, Loop 1 no longer touches
        // the iron, and the between-session mathematics (Loop 2) reads the sets as performed.
        plan = carryWeightForward(plan as never, live.globalIndex, load) as never;
      }

      await db.appendCompletedSession(session);
      await fixtureModel.sessionEarned!({ startedAtMs: Date.parse(session.startedAt) }); // folds the occurrence

      for (const slot of day.slots) {
        const ex = exerciseById(slot.exerciseId)!;
        const mine = sets.filter((s) => s.exerciseId === slot.exerciseId);
        if (mine.length === 0) continue;
        trained.add(slot.exerciseId);
        occurrencesOf[slot.exerciseId] = (occurrencesOf[slot.exerciseId] ?? 0) + 1;
        if (!ex.bodyweight && mine[0].actualWeight != null) {
          (trace[slot.exerciseId] ??= []).push({
            load: mine[0].actualWeight, cap: capFor(slot.exerciseId),
            reps: mine.map((s) => s.actualReps), floor: loadFloor(ex.equipment),
          });
        }
      }
      t += 2 * 86400000;
    }
    for (const id of trained) {
      const gain = (0.022 * Math.exp(-w / 10)) / Math.max(1, p.days / 2); // novice gains, decaying
      if (cap[id] != null) cap[id] *= 1 + gain;
      if (bwCap[id] != null && r() < gain * 12) bwCap[id] += 1;
    }
    t += 86400000;
  }
  return { trace, sets: performed };
  } finally {
    Date.now = realNow;
  }
}
