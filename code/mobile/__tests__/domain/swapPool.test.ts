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
// @ts-nocheck

// 

import {
  swapCandidates,
  swapScore,
  bestSwap,
  defaultBackup,
  isSwapMoment,
} from '@/domain/swapPool';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

  it('a bench press is answered with dumbbells before bodyweight, and the regression comes last', () => {
    const list = offers('bb_bench_press');
    expect(list[0]).toBe('Dumbbell Bench Press');
    expect(list.indexOf('Push-Up')).toBeGreaterThan(list.indexOf('Machine Chest Press'));
    // The knee push-up used to carry the "a regression is never a peer" half of this law, and it
    // was deleted in the 2026-08-08 gym-only cull — a room with a chest press starts a beginner
    // lighter AND progresses her. The law itself is unchanged, so it is asserted on the regression
    // that survived: the assisted dip still sorts behind the loaded answers, never among them.
    expect(list).not.toContain('Knee Push-Up');
    expect(list.indexOf('Assisted Dip')).toBeGreaterThan(list.indexOf('Machine Chest Press'));
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

/**
 * WHEN the verb is offered — the same law one axis over, and it drifted the same way.
 *
 * The pool above fixed four surfaces disagreeing about WHAT a legal swap is. Nobody noticed the two
 * live surfaces also disagreed about WHEN to offer one: the wrist gated on the first set of ANY
 * lift, the phone's stage on the first set of the FIRST lift only. Same instant, same lift, two
 * answers — the glyph on her watch, nothing on her phone.
 *
 * The phone's rule was survivable only while the programme-edit screen existed. S-73 deleted it, so
 * the stage is now the only place the verb is taught (the brief says so in as many words), and
 * teaching it once per session and then hiding it is not teaching it.
 */
describe('when the swap verb is offered (isSwapMoment)', () => {
  it('is offered before the first set of a lift, and never after one is logged', () => {
    // A swap belongs BEFORE the work: once a set is logged against the lift she has trained it, and
    // replacing it would strand those sets on an exercise no longer in the session.
    expect(isSwapMoment(0)).toBe(true);
    expect(isSwapMoment(1)).toBe(false);
    expect(isSwapMoment(3)).toBe(false);
  });

  it('does not care WHICH lift it is — the 4th lift is as swappable as the 1st', () => {
    // The regression itself: the rule is about the set index within the lift, never the lift's
    // ordinal in the session. There is no session-position argument to pass, by design.
    expect(isSwapMoment.length).toBe(1);
  });

  it('BOTH surfaces ask this function — not two rules that happen to agree', () => {
    // The bug was two hard-coded gates. A gate is cheap to re-hard-code, and the next one would be
    // just as invisible: it fails no typecheck and no render test — it is simply a button that is
    // not there, on the surface the athlete is not currently looking at.
    const read = (p: string) => readFileSync(join(__dirname, '../../src', p), 'utf8');
    const stage = read('screens/session/SessionFlow.tsx');
    const mirror = read('state/stores/sessionStore.tsx');

    // Match CODE, not prose: both files explain the old rule in a comment, and an assertion that
    // cannot tell an explanation from an instruction would fail on its own documentation. (It did.)
    const code = (src: string) =>
      src
        .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
        .replace(/^\s*\/\/.*$/gm, '') // whole-line comments
        .replace(/\/\/.*$/gm, ''); // trailing comments

    expect(code(stage)).toMatch(/canSwap\s*=\s*isSwapMoment\(/);
    expect(code(mirror)).toMatch(/isSwapMoment\(/);
    // …and neither may resurrect its own answer. Scoped to the SWAP: `exerciseSetIndex === 0` also
    // spells the Equipment-Occupied law ("applies at the START of an exercise"), which is a
    // different rule that merely shares this shape — a blanket ban would forbid it too.
    expect(code(stage)).not.toMatch(/canSwap\s*=\s*exNo/);
    expect(code(mirror)).not.toMatch(/swapOptions[\s\S]{0,120}?exerciseSetIndex === 0/);
  });
});
