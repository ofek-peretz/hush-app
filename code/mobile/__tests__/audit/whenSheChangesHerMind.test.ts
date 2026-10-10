/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * SHE CHANGES SOMETHING THE PROGRAMME WAS BUILT ON — what does the engine actually do?
 *
 * ⛔ FOUNDER, 2026-08-10, item 3: *"ארצה לבדוק מה קורה אם המתאמן משנה את כמות האימונים בשבוע או משנה
 * כל נתון אפשרי שהתוכנית שלנו הייתה בנויה עליו — איך המנוע מגיב לזה?"*
 *
 * Reading the code answered it once and the answer was wrong in a way reading could not show: the
 * edit path fired `askCoachToRevise` and never rebuilt anything, so on a bad signal she got the same
 * week back and nothing said so. That is fixed; this file is the part that makes it stay fixed.
 *
 * ⚠️ THESE ARE MEASUREMENTS, NOT ASSERTIONS ABOUT INTENT. Each one changes one datum on a real
 * profile, regenerates through the real assembler, and reads what came out. Nothing here is mocked
 * except the persistence layer, because the question is what the ENGINE decides.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import { fixtureModel } from '@/data/api/fixtureModel';
import { CANONICAL_MUSCLE_ORDER } from '@/engine/v5/constants';
import { muscleOf } from '@/data/exercises';
import type { MuscleStance, Profile, Program } from '@/data/local/models';

const athlete = (over: Partial<Profile> = {}): Profile => ({
  id: 'p1',
  name: 'Maya',
  sex: 'female',
  units: 'kg',
  weightKg: 62,
  startWeightKg: 62,
  daysPerWeek: 4,
  repBand: '8-10',
  repBandByMuscle: {},
  memberSince: new Date('2026-01-01').toISOString(),
  workoutMinutes: 60,
  ...over,
});

const build = (p: Profile): Promise<Program> => fixtureModel.generateProgram(p);

/** Every exercise in the week, first occurrence order. */
const lifts = (p: Program): string[] =>
  p.days.filter((d) => !d.isRest).flatMap((d) => d.slots.map((s) => s.exerciseId));

/** Every muscle the week actually trains. */
const trained = (p: Program): Set<string> => new Set(lifts(p).map((id) => muscleOf(id)).filter(Boolean) as string[]);

/** Sets per muscle across the whole week — the number a volume change has to move. */
function weeklySets(p: Program): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of p.days) {
    if (d.isRest) continue;
    for (const s of d.slots) {
      const m = muscleOf(s.exerciseId);
      if (m) out[m] = (out[m] ?? 0) + s.setCount;
    }
  }
  return out;
}

describe('she changes how many days she trains', () => {
  it('the number of workouts follows her, every step from 2 to 6', async () => {
    for (const days of [2, 3, 4, 5, 6]) {
      const p = await build(athlete({ daysPerWeek: days }));
      const workouts = p.days.filter((d) => !d.isRest).length;
      expect({ days, workouts }).toEqual({ days, workouts: days });
    }
  });

  it('⛔ more days is MORE TRAINING, not the same week spread thinner', async () => {
    /*
     * The failure this catches is the one a "rebuild" most easily fakes: re-dealing the same lifts
     * across more sessions. Frequency is the strongest lever hypertrophy has (2×/week ≈ 63% more
     * growth than 1×), so a week that gains a day must gain WORK.
     */
    const three = weeklySets(await build(athlete({ daysPerWeek: 3 })));
    const five = weeklySets(await build(athlete({ daysPerWeek: 5 })));
    const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
    expect(sum(five)).toBeGreaterThan(sum(three));
  });

  it('and dropping days does not silently drop a muscle out of the week', async () => {
    // Fewer sessions is less volume per muscle; it is not permission to stop training one. A muscle
    // that vanishes at 2 days is an athlete who asked for less and got a hole.
    const two = trained(await build(athlete({ daysPerWeek: 2 })));
    const six = trained(await build(athlete({ daysPerWeek: 6 })));
    for (const m of six) expect({ m, atTwoDays: two.has(m) }).toEqual({ m, atTwoDays: true });
  });
});

describe('she changes her body map', () => {
  it('⛔ a muscle turned OFF leaves the week entirely (S-3)', async () => {
    const before = await build(athlete());
    expect(trained(before).has('Calves')).toBe(true);
    const after = await build(athlete({ bodyMap: { Calves: 'off' } }));
    expect(trained(after).has('Calves')).toBe(false);
  });

  it('⛔ every muscle she can turn off actually leaves — not just the easy ones', async () => {
    /*
     * Swept rather than spot-checked. A muscle the assembler treats as structural (Back, Quads) is
     * exactly the one a "safety net" is most likely to put back, and the athlete who turned it off
     * is the one who most needs it gone.
     */
    const survivors: string[] = [];
    for (const m of CANONICAL_MUSCLE_ORDER) {
      const p = await build(athlete({ bodyMap: { [m]: 'off' as MuscleStance } }));
      if (trained(p).has(m)) survivors.push(m);
    }
    expect(survivors).toEqual([]);
  });

  /*
   * ⛔ THIS WAS THE DEFECT THIS FILE FOUND, AND IT IS FIXED (founder 2026-08-10).
   *
   * It shipped as `it.failing` for exactly as long as the bug lived. Marking Shoulders as a LEAD made
   * her shoulder training WORSE — three exercises became two, the set count did not move (9 → 9), and
   * Chest and Back each lost a set paying for it. The one deliberate instruction the body map exists
   * to carry produced a worse week.
   *
   * The mark is a TRANSFER now, measured in whole exercises rather than sets, so a marked muscle
   * cannot be trimmed back to where it started: the sets it gained are no longer being asked for
   * anywhere else. See `weeklyTargets`.
   */
  it('⛔ a muscle she marks EMPHASIS gets more of the week than it had', async () => {
    const plain = weeklySets(await build(athlete()));
    const led = weeklySets(await build(athlete({ bodyMap: { Shoulders: 'emphasis' } })));
    expect(led.Shoulders).toBeGreaterThan(plain.Shoulders);
  });

  it('⛔ …and EVERY muscle does, at every frequency — swept, not spot-checked', async () => {
    /*
     * Shoulders was the one that failed, and it failed because of where its share sat relative to the
     * rounding. Any muscle can land there, so the guarantee is asserted across the whole map and
     * across her real choices rather than on the one case that happened to break.
     */
    const flat: string[] = [];
    for (const days of [3, 4, 6]) {
      for (const m of CANONICAL_MUSCLE_ORDER) {
        if (m === 'Core') continue; // supplemental — sized by the map, never dealt a share of the week
        const plain = weeklySets(await build(athlete({ daysPerWeek: days })));
        const led = weeklySets(await build(athlete({ daysPerWeek: days, bodyMap: { [m]: 'emphasis' as MuscleStance } })));
        if ((led[m] ?? 0) <= (plain[m] ?? 0)) flat.push(`${days}d ${m} ${plain[m]}→${led[m]}`);
      }
    }
    expect(flat).toEqual([]);
  });

  it('⚠️ and it is a TRANSFER — the week does not grow to pay for her mark', async () => {
    /*
     * The half that makes the guarantee above reliable rather than lucky. If a mark could ADD volume,
     * the time cap would take it straight back out — which is precisely how the original defect
     * worked. Conserving the total is what stops the cap from having anything to reclaim.
     */
    const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
    const plain = sum(weeklySets(await build(athlete())));
    const led = sum(weeklySets(await build(athlete({ bodyMap: { Back: 'emphasis' } }))));
    expect(Math.abs(led - plain)).toBeLessThanOrEqual(3); // rounding at the day level, never a bonus
  });

  it('⚠️ and turning one muscle off does not quietly starve the others', async () => {
    // The volume freed by an `off` muscle has to go somewhere sensible. What must not happen is the
    // week shrinking overall — she removed one muscle, not a third of her training.
    const before = weeklySets(await build(athlete()));
    const after = weeklySets(await build(athlete({ bodyMap: { Calves: 'off' } })));
    const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
    expect(sum(after)).toBeGreaterThanOrEqual(sum(before) - (before.Calves ?? 0));
  });
});

describe('she changes what she weighs, or how long she has', () => {
  it('⚠️ bodyweight changes WHICH lift, not how many — and that is correct', async () => {
    /*
     * ⚠️ I EXPECTED THE WEEK TO BE IDENTICAL AND IT IS NOT. Measuring showed why, and the engine
     * is right:
     *
     *     55 kg → db_bench_press        95 kg → bb_bench_press
     *
     * An empty barbell is 20 kg. For a light beginner that is not a starting load, it is a working
     * set she cannot complete in her band — so the assembler picks the dumbbell, which goes lighter.
     * That is the load FLOOR reaching back into selection, not a week reshuffling because she stood
     * on a scale.
     *
     * ⛔ SO THE GUARANTEE IS ON THE SHAPE, WHICH IS WHAT ACTUALLY MATTERED: the same number of
     * lifts, the same muscles, the same volume. A bodyweight edit may swap an implement; it may
     * never cost her a session or a muscle.
     */
    const light = await build(athlete({ weightKg: 55 }));
    const heavy = await build(athlete({ weightKg: 95 }));
    /*
     * ⚠️ WITHIN ONE, NOT EXACTLY EQUAL (2026-08-11). This required identical counts and it was too
     * strict by one: after the pattern split, a 55 kg athlete comes out at 25 lifts against 26. The
     * muscles are IDENTICAL — the assertion below is the one that matters — and the missing lift is a
     * pattern whose only options she cannot load. Programming a lift she cannot perform to keep two
     * numbers matching would be the app serving its own test.
     */
    expect(Math.abs(lifts(light).length - lifts(heavy).length)).toBeLessThanOrEqual(1);
    expect(trained(light)).toEqual(trained(heavy));
  });

  it('⛔ a shorter session is a SHORTER session — the cap is obeyed, not decorative', async () => {
    const hour = await build(athlete({ workoutMinutes: 60 }));
    const short = await build(athlete({ workoutMinutes: 45 }));
    const slots = (p: Program) => p.days.filter((d) => !d.isRest).reduce((n, d) => n + d.slots.length, 0);
    expect(slots(short)).toBeLessThanOrEqual(slots(hour));
  });
});

describe('the rebuild is safe to run on an edit', () => {
  it('⛔ it is DETERMINISTIC — the same profile twice is the same week twice (I-24)', async () => {
    /*
     * The property that makes rebuilding-on-edit safe at all. If generation carried any randomness,
     * every settings visit would hand her a different programme and nothing would explain why.
     */
    const p = athlete({ bodyMap: { Back: 'emphasis', Calves: 'off' }, daysPerWeek: 5 });
    expect(lifts(await build(p))).toEqual(lifts(await build(p)));
  });

  it('⚠️ a lift that survives the reshape keeps its identity, so its progression survives too', async () => {
    /*
     * v5 keys every decision to the EXERCISE, never to a slot (S-29). That is what lets a rebuild be
     * cheap: the loads she earned are attached to `bb_bench_press`, not to "day 2 slot 1". This
     * measures the premise — that a change on one side of the body leaves the other side's lifts
     * exactly where they were, by id.
     */
    const before = await build(athlete());
    const after = await build(athlete({ bodyMap: { Calves: 'off' } }));
    const upper = (p: Program) => lifts(p).filter((id) => {
      const m = muscleOf(id);
      return m === 'Chest' || m === 'Back' || m === 'Biceps' || m === 'Triceps';
    });
    // Same lifts, still there, still addressed by the same ids the engine's state is keyed to.
    expect(new Set(upper(after))).toEqual(new Set(upper(before)));
  });
});
