// @ts-nocheck
/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 * THE COACH IS TOLD WHAT SHE LIFTS — AND PRICES EVERY LIFT FROM IT (2026-10-11)
 *
 * The founder asked whether a man who loves the gym would pay for this. I walked the live app as
 * one: five days, six years of training, "bench 100, squat 130, deadlift 160". The week came back
 * as his split with those three at his numbers — and a Romanian deadlift at 55 kg, a leg press at
 * 87, an incline dumbbell press at 16 kg a hand. 26 lifts of 30 priced for a stranger of his
 * bodyweight, on the screen where he decides whether the app understands him.
 *
 * His ruling: *"אני לא חושב שצריך כרגע לתת לו את העט כי בשביל זה יש את הבינה — אם היא צריכה מידע נוסף
 * בשביל לדייק כמה שיותר את התוכנית עבור המתאמן אפשר להוסיף עוד נתונים שהבינה חייבת למסכים
 * ב-onboarding. אני רוצה את תוכנית האימון הטובה ביותר לכל מתאמן."*
 *
 * Two causes, two fixes, both held here:
 *   1. The model was never ASKED to price the lifts she did not name. The schema said "from what
 *      the athlete told you… omit it when nothing lets you ground it", and it obeyed.
 *   2. The only numbers it had were whatever she happened to type into a free line. The intake now
 *      asks an athlete who has trained for four lifts — facts only she has — and nothing else.
 *
 * Walked again after: the same man, his numbers given on the new step and a sentence with no
 * number in it, received a load on every one of 26 lifts (RDL 90, leg press 180, incline DB 30).
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

import fs from 'node:fs';
import path from 'node:path';
import { buildWeekRequest, BUILD_PROMPT_VERSION } from '@/domain/buildPrompt';
import {
  asksStatedLifts,
  cleanStatedLifts,
  intakeLifts,
  intakeStepsFor,
  seedStatedLoads,
  statedLiftsLine,
} from '@/domain/statedLifts';
import { exerciseById } from '@/data/exercises';

const MOBILE = path.join(__dirname, '..', '..');
const read = (rel: string): string => fs.readFileSync(path.join(MOBILE, rel), 'utf8');
const loadDescription = (req: ReturnType<typeof buildWeekRequest>): string => {
  const hit = JSON.stringify(req.schema).match(/"load":\{"type":"number","description":"([^"]+)"/);
  expect(hit).not.toBeNull();
  return hit![1];
};

describe('⛔ the model prices every lift, not only the ones she named', () => {
  const req = buildWeekRequest({ daysPerWeek: 5, sex: 'male', weightKg: 80, experience: 'advanced', ask: 'PPL', locale: 'he' });

  it('the field says so, in the one place the model reads what a field means', () => {
    const d = loadDescription(req);
    expect(d).toContain('EVERY exercise of the week that takes a load');
    expect(d).toContain('Each of the others is your estimate from those numbers');
    // Her own number is not shaved: walked 2026-10-11, "with a little in hand" was read as applying to
    // the lifts she NAMED as well, and a stated 100 kg bench opened at 95.
    expect(d).toContain('A lift they named opens at exactly the weight they gave');
    expect(d).toContain('never a lighter weight');
    // The convention a wrong bar comes from, kept: kilograms, one dumbbell.
    expect(d).toContain('the weight of ONE dumbbell');
    // …and when it has nothing of hers to reason from, the app's own estimate still stands.
    expect(d).toContain('when the athlete gave you no weight at all');
  });

  it('the wording changed an answer, so the version moved', () => {
    expect(BUILD_PROMPT_VERSION).toBeGreaterThanOrEqual(7);
    expect(req.v).toBe(BUILD_PROMPT_VERSION);
  });
});

describe('her lifts reach the model as facts about her', () => {
  const lifts = [
    { exerciseId: 'bb_bench_press', kg: 100, reps: 6 },
    { exerciseId: 'bb_back_squat', kg: 130 },
  ];

  it('in the catalogue ids, on a line of their own, above her sentence', () => {
    const req = buildWeekRequest({ daysPerWeek: 4, sex: 'male', lifts, ask: 'legs first', locale: 'en' });
    const her = req.blocks[req.blocks.length - 1].text;
    expect(her).toContain('- weights they lift today: bb_bench_press 100 kg x 6; bb_back_squat 130 kg');
    expect(her.indexOf('weights they lift today')).toBeLessThan(her.indexOf('WHAT THE ATHLETE ASKED FOR'));
    // The catalogue stays the cached half: nothing about her is in it.
    expect(req.blocks[0].text).not.toContain('weights they lift today');
  });

  it('an athlete who gave none gets no such line — nothing is invented for her', () => {
    for (const given of [undefined, []]) {
      const req = buildWeekRequest({ daysPerWeek: 3, sex: 'female', lifts: given, locale: 'en' });
      expect(req.blocks.map((b) => b.text).join('\n')).not.toContain('weights they lift today');
    }
  });

  it('the line is the function, to the character', () => {
    expect(statedLiftsLine(lifts)).toBe('bb_bench_press 100 kg x 6; bb_back_squat 130 kg');
  });
});

describe('the step asks for four facts, and only of an athlete who has them', () => {
  it('four lifts by sex, every one a loaded lift the catalogue knows', () => {
    for (const sex of ['male', 'female', undefined] as const) {
      const ids = intakeLifts(sex);
      expect(ids).toHaveLength(4);
      expect(new Set(ids).size).toBe(4);
      for (const id of ids) {
        const ex = exerciseById(id);
        expect(ex).toBeTruthy();
        expect(ex.bodyweight).toBeFalsy();
      }
    }
    expect(intakeLifts('male')).toContain('bb_bench_press');
    expect(intakeLifts('female')).toContain('hip_thrust');
  });

  it('a beginner is not asked; an athlete who has trained is — and the bar counts the step', () => {
    expect(asksStatedLifts('beginner')).toBe(false);
    expect(asksStatedLifts(undefined)).toBe(false);
    expect(asksStatedLifts('intermediate')).toBe(true);
    expect(asksStatedLifts('advanced')).toBe(true);
    expect(intakeStepsFor('beginner')).toBe(3);
    expect(intakeStepsFor('advanced')).toBe(4);
  });

  it('the Health step routes on the one rule, and every screen draws its bar from it', () => {
    const health = read('src/screens/onboarding/ConnectHealth.tsx');
    expect(health).toContain("if (asksStatedLifts(inputs.experience)) {");
    expect(health).toContain("navigation.navigate('YourLifts', { inputs });");
    expect(health).toContain('progress={{ index: 2, total: intakeStepsFor(route.params?.experience) }}');
    expect(read('src/screens/onboarding/AboutYou.tsx')).toContain('progress={{ index: 1, total: intakeStepsFor(experience) }}');
    const lifts = read('src/screens/onboarding/YourLifts.tsx');
    expect(lifts).toContain('progress={{ index: 3, total: 4 }}');
    expect(read('src/screens/plan/PlanBuilder.tsx')).toContain('progress={{ index: steps, total: steps }}');
    expect(read('src/app/Root.tsx')).toContain('<OnboardingStack.Screen name="YourLifts" component={YourLifts} />');
  });

  it('every field is optional: two ways out, and neither needs a figure', () => {
    const lifts = read('src/screens/onboarding/YourLifts.tsx');
    expect(lifts).toContain('onPress={() => proceed(true)}');
    expect(lifts).toContain('onPress={() => proceed(false)}');
    // What she typed travels on in the intake's own relay, in kilograms — or not at all.
    expect(lifts).toContain("navigation.navigate('PlanBuilder', { inputs: { ...inputs, ...(lifts.length > 0 ? { lifts } : {}) } });");
    expect(lifts).toContain('kgFromDisplay(shown, units)');
  });
});

describe('only real lifts leave the step', () => {
  it('a slip of the thumb, an unknown lift and a repeat are dropped; reps are kept when sane', () => {
    expect(
      cleanStatedLifts([
        { exerciseId: 'bb_bench_press', kg: 100, reps: 6 },
        { exerciseId: 'bb_bench_press', kg: 110 }, // said twice — the first stands
        { exerciseId: 'bb_back_squat', kg: 0 },
        { exerciseId: 'bb_deadlift', kg: 900 },
        { exerciseId: 'not_a_lift', kg: 50 },
        { exerciseId: 'bb_overhead_press', kg: 60.004, reps: 0 },
        { exerciseId: 'hip_thrust', kg: Number.NaN },
        {},
      ]),
    ).toEqual([
      { exerciseId: 'bb_bench_press', kg: 100, reps: 6 },
      { exerciseId: 'bb_overhead_press', kg: 60 },
    ]);
    expect(cleanStatedLifts(null)).toEqual([]);
  });
});

describe('her own number opens her own lift, whatever the model did', () => {
  const week = {
    id: 'w',
    frequency: 2,
    days: [
      { id: 'd1', name: 'A', muscleGroups: [], isRest: false, slots: [
        { capability: 'horizontal_push', exerciseId: 'bb_bench_press', setCount: 3 },
        { capability: 'horizontal_push', exerciseId: 'incline_db_press', setCount: 3, startLoadKg: 30 },
        { capability: 'horizontal_pull', exerciseId: 'pull_up', setCount: 3 },
      ] },
      { id: 'd2', name: 'B', muscleGroups: [], isRest: false, slots: [
        { capability: 'knee_dominant', exerciseId: 'bb_back_squat', setCount: 3, startLoadKg: 120 },
      ] },
    ],
  };
  const lifts = [
    { exerciseId: 'bb_bench_press', kg: 100 },
    { exerciseId: 'bb_back_squat', kg: 130 },
    { exerciseId: 'pull_up', kg: 20 },
  ];

  it('a named lift the model left bare opens at her number; one it priced is left alone', () => {
    const out = seedStatedLoads(week, lifts);
    expect(out.days[0].slots[0].startLoadKg).toBe(100);
    expect(out.days[0].slots[1].startLoadKg).toBe(30);
    expect(out.days[1].slots[0].startLoadKg).toBe(120); // the model chose; her first set corrects it
    // A bodyweight lift takes no load in a week.
    expect(out.days[0].slots[2].startLoadKg).toBeUndefined();
    // …and the week it was handed is not written on.
    expect(week.days[0].slots[0].startLoadKg).toBeUndefined();
  });

  it('nothing given, nothing changed — the same object back', () => {
    expect(seedStatedLoads(week, [])).toBe(week);
  });

  it('the build carries them to the model AND seeds the week it gets back', () => {
    const build = read('src/screens/onboarding/BuildingProgramme.tsx');
    expect(build).toContain('...(inputs.lifts?.length ? { lifts: inputs.lifts } : {}),');
    expect(build).toContain('sealAuthored(seedStatedLoads(answer.program, inputs.lifts ?? []))');
  });
});

describe('the Ready screen and the screens after it stand on the same rungs', () => {
  it('before a profile exists, the load room is the units the intake will write', () => {
    const store = read('src/state/stores/appStore.tsx');
    expect(store).toContain('setLoadRoom(state.profile?.units ?? unitsForDevice(Localization.getLocales()[0]));');
  });
});
