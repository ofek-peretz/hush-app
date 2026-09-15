/**
 * Salvaging a crashed workout (founder 2026-07-11 — supersedes §2.3's "an interrupted session does
 * not advance calibration").
 *
 * The app died mid-workout. Whatever was logged becomes an "ended early" History entry. The new law:
 * a crash is NOT the athlete's fault, so if the salvaged session TRAINED the workout (>= half its
 * prescribed sets — domain/completion) it is credited exactly like a workout finished by hand — the
 * caller advances the session count (free trial + calibration) and finishes the workout for the
 * week. A PARTIAL salvage credits nothing but its real work (History + engine + non-count
 * milestones). A replay of an already-salvaged session never credits twice.
 */
// @ts-nocheck

// 

import { salvageOrphanSession } from '@/state/sessionRecovery';
import { db } from '@/data/local/db';
import type { Program, Session, SetLog } from '@/data/local/models';

const DAY_ID = 'day_0';

// The workout prescribes 8 work sets (2 lifts × 4) → TRAINED at 4+, PARTIAL below.
const program: Program = {
  id: 'p',
  frequency: 3,
  days: [
    {
      id: DAY_ID,
      name: 'Push A',
      muscleGroups: ['Chest'],
      isRest: false,
      completed: false,
      slots: [
        { capability: 'horizontal_push', exerciseId: 'bb_bench_press', setCount: 4 },
        { capability: 'horizontal_pull', exerciseId: 'bb_row', setCount: 4 },
      ],
    },
  ],
};

const set = (i: number): SetLog => ({
  exerciseId: 'bb_bench_press',
  setIndex: i,
  recommendedWeight: 60,
  recommendedReps: 8,
  actualWeight: 60,
  actualReps: 8,
  edited: false,
  persistedAt: new Date().toISOString(),
});

/**
 * A crashed session, with the prescription it was started against.
 *
 * `prescribed` is stamped at START by whichever door opened the workout. That is what makes the
 * verdict answerable at all here: the salvage used to look the programme day up and count its
 * slots, and there is no programme to look in — so without the stamped number an unknown
 * prescription falls back to "any logged work counts" and a three-set crash credits a workout.
 */
const orphan = (sets: number): Session => ({
  id: 'sess_crashed',
  programDayId: DAY_ID,
  programDayName: 'Push A',
  prescribed: 8,
  startedAt: new Date().toISOString(),
  state: 'ACTIVE',
  earlyFinish: false,
  sets: Array.from({ length: sets }, (_, i) => set(i)),
});

beforeEach(async () => {
  await db.clearAll();
  await db.saveProgram(program);
});

describe('salvageOrphanSession — credit', () => {
  it('a TRAINED crash is credited (and stamped trained) — the athlete did the work', async () => {
    await db.saveActiveSession(orphan(6)); // 6 of 8 prescribed
    const result = await salvageOrphanSession();

    expect(result.trained).toBe(true);
    expect(result.programDayId).toBe(DAY_ID);
    const [saved] = await db.loadHistory();
    expect(saved.trained).toBe(true);
    expect(saved.earlyFinish).toBe(true); // it did not end by the athlete's hand
    expect(saved.annotation).toBe('ended_early');
    expect(await db.loadActiveSession()).toBeNull(); // the orphan is cleared
  });

  it('a PARTIAL crash is saved but credits nothing', async () => {
    await db.saveActiveSession(orphan(3)); // 3 of 8 — under half
    const result = await salvageOrphanSession();

    expect(result.trained).toBe(false);
    expect(result.programDayId).toBeNull();
    const [saved] = await db.loadHistory();
    expect(saved.trained).toBe(false); // the work is kept — it just isn't a workout
    expect(saved.sets).toHaveLength(3);
  });

  it('a REPLAY never credits twice (the session is already in History)', async () => {
    await db.saveActiveSession(orphan(6));
    expect((await salvageOrphanSession()).trained).toBe(true);

    // The same orphan lingers (a kill between the history write and the clear).
    await db.saveActiveSession(orphan(6));
    const again = await salvageOrphanSession();

    expect(again.trained).toBe(false); // de-duped → no second credit
    expect(await db.loadHistory()).toHaveLength(1); // and no duplicate record
  });

  it('nothing to salvage → no credit', async () => {
    expect(await salvageOrphanSession()).toEqual({ trained: false, programDayId: null });
    expect(await db.loadHistory()).toHaveLength(0);
  });

  /*
   * THE SESSION RUNS ITSELF (2026-09-07): the clock writes `presumed` sets she never touched. A
   * salvage has nobody's word behind it, so it keeps only the sets she actually logged.
   */
  it('⛔ a crash keeps only what she said — presumed sets are dropped before the verdict', async () => {
    const real = [set(0), set(1), set(2)]; // 3 of 8 — under half by her own hand
    const clock = [3, 4, 5, 6, 7].map((i) => ({ ...set(i), presumed: true as const }));
    await db.saveActiveSession({ ...orphan(0), sets: [...real, ...clock] });
    const result = await salvageOrphanSession();

    expect(result.trained).toBe(false); // the clock's five rows do not finish her workout
    const [saved] = await db.loadHistory();
    expect(saved.sets).toHaveLength(3);
    expect(saved.sets.some((s) => s.presumed)).toBe(false);
    expect(saved.finishedByAthlete).toBeUndefined(); // a salvage never carries her word
  });

  it('⛔ a crash whose every row was the clock\'s is not a workout at all', async () => {
    await db.saveActiveSession({ ...orphan(0), sets: [0, 1, 2, 3, 4, 5].map((i) => ({ ...set(i), presumed: true as const })) });
    const result = await salvageOrphanSession();

    expect(result.trained).toBe(false);
    expect(await db.loadHistory()).toHaveLength(0); // never saved
    expect(await db.loadActiveSession()).toBeNull(); // but the orphan is cleared
  });

  it('an EMPTY crash (zero sets) is not a workout at all', async () => {
    await db.saveActiveSession(orphan(0));
    const result = await salvageOrphanSession();

    expect(result.trained).toBe(false);
    expect(await db.loadHistory()).toHaveLength(0); // never saved
    expect(await db.loadActiveSession()).toBeNull(); // but the orphan is cleared
  });
});
