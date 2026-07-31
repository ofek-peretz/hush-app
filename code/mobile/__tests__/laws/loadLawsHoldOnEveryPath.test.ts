/**
 * A LOAD LAW IS NOT A MODULE'S LAW. IT IS EVERY PATH'S LAW.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────────────────────────
 * The 2026-07-21 register audit found eight defects. Not one of them was a mistake in the thinking —
 * every single one was a law that held on ONE path and not on its neighbour:
 *
 *   · **S-55, the bar.** `BAR_KG` was applied in `engine/loadMath.normalizeLoad`, which is the
 *     COLD-START SEED's path. Loop 1's down-correction and Loop 2's stall back-off walk
 *     `engine/v5/grid`, which had never heard of a bar — so a failed `bb_curl` at 20 kg prescribed
 *     **17.5 kg**. `barIsTheFloor.test.ts` had already killed that exact bug, thoroughly, with a
 *     sweep of the whole catalogue… through one entry point. The other one shipped it for months.
 *   · **L11, the rail.** Clamped in Loop 2. Never clamped in Loop 1, though S-11 says a raise is
 *     "always inside the rail" and S-14 calls the rail absolute.
 *   · **S-17, her rest.** Her measured median fed the time BUDGET and never the rest TIMER.
 *
 * Part 7 of the register asks exactly the right question — "is anything built but unconnected?" —
 * and the engine keeps answering it per MODULE. These three answered per module and still hid,
 * because each law had two homes and only one of them was furnished.
 *
 * ── What this file does differently ──────────────────────────────────────────────────────────────
 * It does not test a function. It states a LAW, then sweeps EVERY entry point that can put a number
 * on the bar — the real catalogue, every equipment class, loads sitting on the floor, rep counts
 * from zero to absurd, with and without her learned grid — and asserts the law survives all of them.
 * A new path that computes a load and forgets the law fails here on the day it is written, not the
 * month someone reads a screenshot.
 *
 * If you add a function that returns a prescribed weight, ADD IT TO `LOAD_PRODUCERS`. That is the
 * whole maintenance contract, and it is the only thing standing between this class of bug and the
 * next one.
 */
import { EXERCISES, exerciseById, type Exercise } from '@/data/exercises';
import { exerciseMeta, type Equipment } from '@/engine/catalog';
import { BAR_KG, normalizeLoad } from '@/engine/loadMath';
import { startingWeight } from '@/domain/startingLoad';
import { smartSeed } from '@/data/api/fixtureModel';
import { snapDown, nextRung, prevRung, moveRungs, loadFloor } from '@/engine/v5/grid';
import { STARTING_INCREMENT } from '@/engine/v5/constants';
import { correctInSession } from '@/engine/v5/loop1';
import { decideExercise } from '@/engine/v5/loop2';
import type { Band, ExerciseMeta, ExerciseState, SessionRecord } from '@/engine/v5/types';
import type { Profile, Session } from '@/data/local/models';

const BAND: Band = { lo: 8, hi: 10 };

/**
 * THE LAW ITSELF, stated independently of the code under test (S-55): "A prescription may never fall
 * to or below zero, or below the lightest weight that physically exists (the empty bar, the smallest
 * dumbbell, the first pin)."
 *
 * Only the BAR is a hard number — it is a fact of the room. For a stack or a dumbbell rack the
 * lightest thing that exists is a property of HER gym, which the engine deliberately does not model
 * (F-2: "a prescribed rung is a suggestion, never a requirement"), and the founder ratified 1 kg
 * granularity for the cold-start seed. So the law asserts what is actually knowable: **strictly
 * above zero, and never under the bar.** Anything finer would be this test inventing a number, which
 * is the thing the whole ledger exists to prevent.
 */
function violatesFloor(equipment: Equipment, kg: number): boolean {
  if (!Number.isFinite(kg)) return true;
  if (equipment === 'barbell') return kg < BAR_KG - 1e-9;
  return kg <= 0;
}

/** Where the equipment's own rungs START — used to BUILD realistic probes, never to assert. */
function gridStart(equipment: Equipment): number {
  return equipment === 'barbell' ? BAR_KG : STARTING_INCREMENT[equipment] || 1;
}

/** A loaded (non-bodyweight) exercise's engine meta, with and without her learned grid. */
function metasFor(ex: Exercise): { label: string; meta: ExerciseMeta }[] {
  const m = exerciseMeta(ex.id);
  const base: ExerciseMeta = { equipment: m.equipment, bodyweight: m.bodyweight };
  const floor = gridStart(m.equipment);
  return [
    { label: 'no grid yet (B-6)', meta: base },
    // A lift she has only ever done at ONE load — EVERY lift on its second session, and the shape
    // that both froze the back-off (S-25.1) and cancelled Loop 1's drop (the snapDown snap-UP).
    { label: 'single-load grid', meta: { ...base, observedLoads: [floor + 20] } },
    { label: 'sparse learned grid', meta: { ...base, observedLoads: [floor, floor + 10, floor + 20] } },
  ];
}

/**
 * Loads worth probing, all ON the equipment's real grid: sitting on the floor, one rung up, and
 * comfortably above it. Off-grid ideals are a separate question — the floor law probes those
 * directly (see the `snapDown` ideals below); feeding one in as a *current* load would only test
 * that normalisation works, which it does.
 */
function loadsFor(equipment: Equipment): number[] {
  const f = gridStart(equipment);
  const inc = STARTING_INCREMENT[equipment] || 1;
  return [f, f + inc, f + 2 * inc, f + 20 * inc, f + 40 * inc];
}

const REPS = [0, 1, 3, 5, 7, 8, 9, 10, 11, 15, 30, 60]; // including the absurd — a mis-key is a fact too
const PER_RUNGS: (number | null)[] = [null, 0.5, 2];

const loaded = EXERCISES.filter((ex) => !exerciseMeta(ex.id).bodyweight);

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// LAW 1 · S-55 — NO PATH MAY PRESCRIBE A WEIGHT THAT DOES NOT PHYSICALLY EXIST
// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('LAW · S-55 — every path that computes a load respects the physical floor', () => {
  /** Each entry: a named producer, and every load it can emit for one exercise. */
  const LOAD_PRODUCERS: { name: string; emit: (ex: Exercise) => number[] }[] = [
    {
      name: 'engine/v5/grid — the rungs the loops actually walk',
      emit: (ex) => {
        const out: number[] = [];
        for (const { meta } of metasFor(ex)) {
          const g = meta.observedLoads;
          out.push(loadFloor(meta.equipment, g));
          for (const l of loadsFor(meta.equipment)) {
            out.push(snapDown(l, meta.equipment, g), prevRung(l, meta.equipment, g), nextRung(l, meta.equipment, g));
            for (const n of [-6, -3, -1, 1, 3]) out.push(moveRungs(l, n, meta.equipment, g));
          }
          // The ideal load can arrive from anywhere — a median, a slope, a seed. It is never trusted.
          for (const ideal of [0, 0.1, 1, 5, 17.5, 19.9]) out.push(snapDown(ideal, meta.equipment, g));
        }
        return out;
      },
    },
    {
      name: 'Loop 1 — the in-session correction (S-11/S-12)',
      emit: (ex) => {
        const out: number[] = [];
        for (const { meta } of metasFor(ex)) {
          for (const currentLoad of loadsFor(meta.equipment)) {
            for (const repsJustDone of REPS) {
              for (const perRung of PER_RUNGS) {
                const r = correctInSession({
                  currentLoad, band: BAND, repsJustDone, correctionsSoFar: 0, isLastSet: false, meta, perRung,
                });
                if (r.nextLoad != null) out.push(r.nextLoad);
              }
            }
          }
        }
        return out;
      },
    },
    {
      name: 'Loop 2 — progress / hold / stall back-off (S-22/S-24/S-25)',
      emit: (ex) => {
        const out: number[] = [];
        for (const { meta } of metasFor(ex)) {
          for (const load of loadsFor(meta.equipment)) {
            // Histories that drive each branch: a clean clear, a wall she once cleared, a fresh lift.
            const histories: SessionRecord[][] = [
              [],
              [{ load, sets: [{ load, reps: 8 }, { load, reps: 8 }] }], // cleared this very load before
              [
                { load, sets: [{ load, reps: 5 }] },
                { load, sets: [{ load, reps: 5 }] },
                { load, sets: [{ load, reps: 8 }, { load, reps: 8 }] },
              ],
            ];
            for (const history of histories) {
              const state: ExerciseState = { exerciseId: ex.id, load, band: BAND, sets: 4, history };
              for (const reps of REPS) {
                const r = decideExercise({
                  state,
                  session: [{ load, reps }, { load, reps }],
                  meta,
                  rotationAvailable: true,
                });
                if (r.load != null) out.push(r.load);
              }
            }
          }
        }
        return out;
      },
    },
    {
      name: 'engine/loadMath.normalizeLoad — the cold-start seed path',
      emit: (ex) => {
        const eq = exerciseMeta(ex.id).equipment;
        return [0, 1, 5, 15, 17.5, 19.9, 40].flatMap((l) => [
          normalizeLoad(l, eq),
          normalizeLoad(l, eq, [gridStart(eq) + 20, gridStart(eq) + 40]),
        ]);
      },
    },
    {
      name: 'domain/startingLoad.startingWeight — day one',
      emit: (ex) => {
        const out: number[] = [];
        /*
         * There used to be an `experience` loop here — beginner / intermediate / advanced — and the
         * field has not existed on this type since the founder excluded the experience axis. It was
         * passed and ignored, so this ran the SAME case three times while reporting three-way
         * coverage. Removed rather than replaced: the app has no such input to sweep.
         */
        for (const sex of ['male', 'female'] as const)
          for (const weightKg of [45, 75, 120])
            {
              const kg = startingWeight(ex, { sex, weightKg });
              if (kg != null) out.push(kg);
            }
        return out;
      },
    },
    {
      name: 'fixtureModel.smartSeed — the cross-exercise transfer (B-1/S-9)',
      emit: (ex) => {
        const profile: Pick<Profile, 'sex' | 'weightKg'> = {
          sex: 'female', weightKg: 45, // the lightest athlete we serve
        };
        const out: number[] = [];
        const seed = smartSeed(ex.id, profile, []);
        if (seed != null) out.push(seed);
        // …and seeded from a very light performed history on the same lift (the transfer's low end).
        const history: Session[] = [{
          id: 's', programDayId: 'd', startedAt: '2026-07-01T10:00:00Z',
          state: 'SAVED', earlyFinish: false,
          sets: [{ exerciseId: ex.id, setIndex: 0, recommendedWeight: 5, recommendedReps: 8, actualWeight: 5, actualReps: 1, edited: false, restBeforeS: 120, persistedAt: '2026-07-01T10:00:00Z' }],
        }];
        const transferred = smartSeed(ex.id, profile, history);
        if (transferred != null) out.push(transferred);
        return out;
      },
    },
  ];

  for (const producer of LOAD_PRODUCERS) {
    it(`${producer.name} never goes under the floor`, () => {
      const violations: string[] = [];
      for (const ex of loaded) {
        const eq = exerciseMeta(ex.id).equipment;
        for (const kg of producer.emit(ex)) {
          if (violatesFloor(eq, kg)) violations.push(`${ex.id} (${eq}): ${kg} kg`);
        }
      }
      expect({ under: [...new Set(violations)].slice(0, 12) }).toEqual({ under: [] });
    });
  }

  it('the barbell floor is the SAME number everywhere — one bar, not two opinions', () => {
    // Two copies of a physical constant are two chances to disagree about what is loadable. The
    // grid, the seed path, and the plate maths must all resolve to `BAR_KG`.
    expect(prevRung(BAR_KG + 2.5, 'barbell')).toBe(BAR_KG);
    expect(normalizeLoad(1, 'barbell')).toBe(BAR_KG);
    expect(loadFloor('barbell')).toBe(BAR_KG);
    expect(startingWeight(exerciseById('bb_curl')!, { sex: 'female', weightKg: 45 })).toBeGreaterThanOrEqual(BAR_KG);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// LAW 2 · L11 — NO LOOP MAY PRESCRIBE ABOVE ONE RUNG PAST HER OWN RECORD
// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('LAW · L11 — every UPWARD move, from either loop, stops at the rail', () => {
  it('Loop 1 · no rep count, however absurd, raises past the rail', () => {
    const violations: string[] = [];
    for (const ex of loaded) {
      for (const { meta } of metasFor(ex)) {
        for (const currentLoad of loadsFor(meta.equipment)) {
          const rail = nextRung(currentLoad, meta.equipment, meta.observedLoads);
          for (const repsJustDone of REPS) {
            for (const perRung of PER_RUNGS) {
              const r = correctInSession({
                currentLoad, band: BAND, repsJustDone, correctionsSoFar: 0, isLastSet: false, meta,
                perRung, railCeiling: rail,
              });
              // The rail binds a RAISE. It may never drag her below the load she is already on.
              if (r.nextLoad != null && r.nextLoad > Math.max(rail, currentLoad) + 1e-9)
                violations.push(`${ex.id}: ${currentLoad} ×${repsJustDone} → ${r.nextLoad} (rail ${rail})`);
              if (r.direction === 'up' && r.nextLoad != null && r.nextLoad < currentLoad - 1e-9)
                violations.push(`${ex.id}: a RAISE went down — ${currentLoad} → ${r.nextLoad}`);
            }
          }
        }
      }
    }
    expect({ pastTheRail: [...new Set(violations)].slice(0, 12) }).toEqual({ pastTheRail: [] });
  });

  it('Loop 2 · no session, however good, progresses past the rail', () => {
    const violations: string[] = [];
    for (const ex of loaded) {
      for (const { meta } of metasFor(ex)) {
        for (const load of loadsFor(meta.equipment)) {
          const history: SessionRecord[] = [{ load, sets: [{ load, reps: 8 }, { load, reps: 8 }] }];
          const state: ExerciseState = { exerciseId: ex.id, load, band: BAND, sets: 4, history };
          for (const reps of REPS) {
            const r = decideExercise({ state, session: [{ load, reps }, { load, reps }], meta });
            // Her record is the heaviest load she completed at ≥ Tlo, across settled history AND
            // this session's anchor (which is a SNAPPED rung, L11); the ceiling is one rung past it.
            const best = Math.max(load, snapDown(load, meta.equipment, meta.observedLoads));
            const ceiling = nextRung(best, meta.equipment, meta.observedLoads);
            if (r.load != null && r.load > ceiling + 1e-9)
              violations.push(`${ex.id}: ${load} ×${reps} → ${r.load} (rail ${ceiling}, ${r.decision})`);
          }
        }
      }
    }
    expect({ pastTheRail: [...new Set(violations)].slice(0, 12) }).toEqual({ pastTheRail: [] });
  });

  it('the rail is INACTIVE on a lift she has never completed at Tlo — S-49, not an invented ceiling', () => {
    // The one place the register refuses to add a guard: a brand-new lift has no record to rail
    // against, and the athlete's own eyes are the guard. A "safe default" ceiling here would be
    // exactly the theory F-10 was deleted for.
    const meta: ExerciseMeta = { equipment: 'machine', bodyweight: false };
    const free = correctInSession({
      currentLoad: 20, band: BAND, repsJustDone: 40, correctionsSoFar: 0, isLastSet: false, meta, perRung: 0.5,
    });
    expect(free.nextLoad!).toBeGreaterThan(20 + 2.5); // more than one cautious rung — S-11's whole point
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// LAW 3 · S-25.1 — A BACK-OFF MUST GO DOWN
// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('LAW · S-25.1 — a stall back-off always steps DOWN, on every lift in the catalogue', () => {
  it('no lift can be stalled into a back-off that leaves the load where it was', () => {
    const violations: string[] = [];
    for (const ex of loaded) {
      for (const { meta, label } of metasFor(ex)) {
        for (const load of loadsFor(meta.equipment)) {
          if (load <= gridStart(meta.equipment) + 1e-9) continue; // already at the floor — nowhere to go
          // The freeze shape: she cleared this load once, went up, came back, and is failing it.
          const history: SessionRecord[] = [
            { load, sets: [{ load, reps: 5 }] },
            { load: load + 2.5, sets: [{ load: load + 2.5, reps: 5 }] },
            { load, sets: [{ load, reps: 8 }, { load, reps: 8 }] }, // the old clear AT the wall
          ];
          const state: ExerciseState = { exerciseId: ex.id, load, band: BAND, sets: 4, history };
          const r = decideExercise({ state, session: [{ load, reps: 4 }], meta, rotationAvailable: true });
          if (r.decision !== 'stall_backoff' && r.decision !== 'stall_rotate') continue;
          if (r.load != null && r.load >= load - 1e-9)
            violations.push(`${ex.id} (${label}): stalled at ${load} → backed off to ${r.load}`);
        }
      }
    }
    expect({ frozen: [...new Set(violations)].slice(0, 12) }).toEqual({ frozen: [] });
  });
});
