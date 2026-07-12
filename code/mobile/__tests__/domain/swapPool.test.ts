/**
 * THE SWAP LAW (founder, 2026-07-12).
 *
 *   A swap is a SYNONYM, not a variation.
 *
 * The engine put this exercise in this slot for a reason. If the station is busy, the athlete
 * still needs the training effect the slot was designed to deliver — the CLOSEST thing to it, on
 * different equipment. A swap that hands them "a fresh stimulus" is not a substitution; it is a
 * different workout, and it quietly undoes the program the engine spent a week building.
 *
 * Every case below is a defect the old muscle-only pool actually shipped. They are pinned here
 * because they are all invisible in a typecheck and only one of them was ever caught by a human.
 */
import {
  swapCandidates,
  swapScore,
  bestSwap,
  defaultBackup,
} from '@/domain/swapPool';
import { EXERCISES, exerciseById, exercisesForMuscle, patternFamily, type Exercise } from '@/data/exercises';

/** The offered list, by name, for a slot with nothing else in the session. */
const offers = (id: string, session: string[] = []): string[] =>
  swapCandidates(id, { sessionExerciseIds: session }).map((e) => e.name);

const ex = (id: string): Exercise => exerciseById(id)!;

describe('the founder’s case: squat done, leg press taken', () => {
  const SESSION = ['bb_back_squat', 'leg_press', 'bb_rdl'];

  it('never re-offers the squat the athlete already did', () => {
    expect(offers('leg_press', SESSION)).not.toContain('Barbell Back Squat');
  });

  it('answers with the nearest SUPPORTED squat, not a different movement', () => {
    // Hack Squat is `guided` — one step from the Leg Press's `supported` — so it beats the free
    // squats (two steps). A lunge or a leg extension is not a substitute at all.
    expect(offers('leg_press', SESSION)[0]).toBe('Hack Squat');
  });

  it('ranks the same MOVEMENT above any other quad work', () => {
    const list = offers('leg_press', SESSION);
    const squats = ['Hack Squat', 'Front Squat', 'Goblet Squat'];
    const others = ['Bulgarian Split Squat', 'Walking Lunge', 'Leg Extension'];
    const worstSquat = Math.max(...squats.map((n) => list.indexOf(n)));
    const bestOther = Math.min(...others.map((n) => list.indexOf(n)));
    expect(worstSquat).toBeLessThan(bestOther);
  });
});

describe('the defects the old name-token pool shipped', () => {
  it('a lat pulldown is NOT answered with a barbell row (different movement plane)', () => {
    const list = offers('lat_pulldown');
    expect(list[0]).toBe('Pull-Up'); // the same vertical pull
    expect(list.indexOf('Barbell Row')).toBeGreaterThan(list.indexOf('Chin-Up'));
  });

  it('a busy leg curl is NOT answered with a DEADLIFT', () => {
    // The single worst suggestion the old pool could make: a hamstring ISOLATION replaced by the
    // heaviest compound in the catalog.
    const list = offers('leg_curl');
    expect(list[0]).toBe('Seated Leg Curl');
    expect(list.indexOf('Deadlift')).toBeGreaterThan(list.indexOf('Seated Leg Curl'));
  });

  it('an incline press is NOT answered with a FLAT press (a different chest)', () => {
    const list = offers('incline_bb_press');
    expect(list.slice(0, 2)).toEqual(['Incline Dumbbell Press', 'Incline Machine Press']);
    expect(list.indexOf('Barbell Bench Press')).toBeGreaterThan(list.indexOf('Incline Machine Press'));
  });

  it('a bench press is answered with dumbbells before bodyweight — and never a KNEE push-up', () => {
    const list = offers('bb_bench_press');
    expect(list[0]).toBe('Dumbbell Bench Press');
    expect(list.indexOf('Push-Up')).toBeGreaterThan(list.indexOf('Machine Chest Press'));
    expect(list.indexOf('Knee Push-Up')).toBeGreaterThan(list.indexOf('Push-Up')); // a regression, never a peer
  });

  it('a straight-knee calf raise is NOT answered with a SEATED one (a different muscle)', () => {
    // Straight knee = gastrocnemius. Bent knee = soleus. Swapping one for the other silently
    // trades the muscle the slot was there to train.
    const list = offers('standing_calf_raise');
    expect(list[0]).toBe('Leg Press Calf Raise'); // the other straight-knee raise
    expect(list.indexOf('Seated Calf Raise')).toBeGreaterThan(0);
  });
});

describe('the family gate: no score may offer the opposite movement', () => {
  it('the ABductor machine is never answered with the ADductor machine', () => {
    // On every axis but the movement itself they are twins — same muscle group, same machine,
    // same tier, same support, both bilateral. Only a hard gate can stop this.
    const list = offers('hip_abduction');
    expect(list).not.toContain('Hip Adduction');
    expect(list).toEqual(['Cable Hip Abduction']);
  });

  it('…and the reverse', () => {
    expect(offers('hip_adduction')).toEqual(['Cable Hip Adduction']);
  });

  it('every abduction/adduction lift still HAS an answer (that is why the cable pair exists)', () => {
    for (const id of ['hip_abduction', 'hip_adduction', 'cable_hip_abduction', 'cable_hip_adduction']) {
      expect(bestSwap(id, { sessionExerciseIds: [] })).toBeTruthy();
    }
  });
});

describe('the hard gates hold for every exercise in the catalog', () => {
  it('a swap never leaves the muscle, the capability, or the pattern family', () => {
    for (const e of EXERCISES) {
      for (const alt of swapCandidates(e.id, { sessionExerciseIds: [] })) {
        expect(alt.muscle).toBe(e.muscle);
        expect(alt.capability).toBe(e.capability); // the engine's slot contract
        expect(patternFamily(alt.pattern)).toBe(patternFamily(e.pattern));
        expect(alt.id).not.toBe(e.id);
      }
    }
  });

  it('a swap never offers ANY lift already in the session', () => {
    // The exact bug the founder found — and the one the watch was shipping.
    for (const e of EXERCISES) {
      const pool = exercisesForMuscle(e.muscle).map((x) => x.id);
      const offered = swapCandidates(e.id, { sessionExerciseIds: pool });
      expect(offered).toEqual([]); // everything in the muscle is in the session ⇒ nothing to offer
    }
  });

  it('every exercise has at least one real substitute', () => {
    const orphans = EXERCISES.filter((e) => !defaultBackup(e.id)).map((e) => e.id);
    expect(orphans).toEqual([]);
  });

  it('is deterministic — the same question always gets the same answer', () => {
    for (const e of EXERCISES) {
      expect(offers(e.id)).toEqual(offers(e.id));
    }
  });
});

describe('the score encodes the law, in order', () => {
  it('a different MOVEMENT costs more than anything else', () => {
    const legPress = ex('leg_press');
    const sameMovement = swapScore(legPress, ex('front_squat')); // squat, 2 support steps away
    const otherMovement = swapScore(legPress, ex('walking_lunge')); // a lunge
    expect(sameMovement).toBeLessThan(otherMovement);
  });

  it('a compound is not replaced by an isolation', () => {
    const squat = ex('bb_back_squat');
    expect(swapScore(squat, ex('leg_extension'))).toBeGreaterThan(swapScore(squat, ex('hack_squat')));
  });

  it('SUPPORT is a graded ladder — this is what makes the hack squat the leg press’s answer', () => {
    const legPress = ex('leg_press'); // supported
    expect(swapScore(legPress, ex('hack_squat'))) // guided — one step
      .toBeLessThan(swapScore(legPress, ex('front_squat'))); // free — two steps
  });

  it('an identical movement on identical equipment scores near zero', () => {
    expect(swapScore(ex('leg_curl'), ex('seated_leg_curl'))).toBeLessThan(10);
    expect(swapScore(ex('bb_bench_press'), ex('db_bench_press'))).toBe(0);
  });
});
