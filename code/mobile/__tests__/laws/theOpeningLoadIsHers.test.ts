/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE OPENING LOAD IS HERS — AND DOING WHAT SHE WAS TOLD NEVER MAKES HER WEAKER (founder, 2026-09-28).
 *
 * *"לגבי סעיף 3 - לתקן את זה דחוף … אין בעיה לבטל את B1 אבל מה שאני חושב שחובה הוא לתת לבינה את כל
 * המידע שהיא צריכה על מנת שהיא תבנה את התוכנית הטובה ביותר עבור המתאמן. כולל משקל, חזרות וסטים."*
 *
 * Walked live the same day: an athlete who wrote "לחיצת חזה 80 קילו 4 על 8" opened at 35 kg; he did
 * day A exactly as written, and every load of day B fell 8–15% — on the screen that had just told him
 * "nothing needed to move". Two defects, and this law holds both closed:
 *
 *   1. B-1 IS CANCELLED. The model may write an opening load per lift from what she told it
 *      (`BUILD_WEEK_SCHEMA.load` → `Slot.startLoadKg`), and the engine seeds a lift she has never
 *      lifted from it. Her experience (one tap on AboutYou) reaches the model and the app's own
 *      estimate. Her first real set still replaces every seed.
 *   2. A SET DONE AS WRITTEN IS A FLOOR, NOT A MEASUREMENT (`doneAsWritten`). It can never lower the
 *      personal scale, and never drag a transfer below the cold start. A set she REPORTED still is one.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import * as fs from 'fs';
import * as path from 'path';
import { EXERCISES, exerciseById, isSwapOnly } from '@/data/exercises';
import { smartSeed } from '@/data/api/fixtureModel';
import { doneAsWritten, experienceFactor, modelledLoadKg, personalScale, startingWeight } from '@/domain/startingLoad';
import { epley } from '@/engine/loadMath';
import { readCoachWeek, draftFromCoachWeek } from '@/domain/coachDraft';
import { replaceLift, setLiftStartLoad, START_LOAD_MAX_KG } from '@/domain/planBuilder';
import { BUILD_WEEK_SCHEMA, buildWeekRequest } from '@/domain/buildPrompt';

const ROOT = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const he = { sex: 'male', weightKg: 80 } as const;
const TLO = 8;
/** A set exactly as the stage writes one: `asWritten` = "Done" untouched; otherwise she reported it. */
const log = (exerciseId: string, w: number, reps: number, asWritten: boolean) => ({
  exerciseId, setIndex: 0,
  recommendedWeight: w, recommendedReps: asWritten ? reps : TLO,
  actualWeight: w, actualReps: reps,
  edited: !asWritten, persistedAt: '',
});
const session = (sets: unknown[]) => ({ id: 's1', programDayId: 'd', startedAt: '2026-09-28T10:00:00Z', state: 'SAVED', earlyFinish: false, sets });
const LOADED = EXERCISES.filter((e) => !isSwapOnly(e.id) && !e.bodyweight && e.baseKg != null).map((e) => e.id);
const THREE = LOADED.slice(0, 3);
/** 85% of what the model predicts at Tlo — the one-rung-light first bar, roughly. */
const light = (id: string) => Math.round(modelledLoadKg(exerciseById(id)!, he)! * 0.85 * 100) / 100;

describe('2 · ⛔ a set done as written is a floor, never a measurement', () => {
  it('"Done" untouched is as-written; edited, or different from what was written, is a report', () => {
    expect(doneAsWritten({ actualWeight: 40, actualReps: 8, recommendedWeight: 40, recommendedReps: 8, edited: false })).toBe(true);
    expect(doneAsWritten({ actualWeight: 40, actualReps: 8, recommendedWeight: 40, recommendedReps: 8, edited: true })).toBe(false);
    expect(doneAsWritten({ actualWeight: 40, actualReps: 6, recommendedWeight: 40, recommendedReps: 8, edited: false })).toBe(false);
    expect(doneAsWritten({ actualWeight: 42.5, actualReps: 8, recommendedWeight: 40, recommendedReps: 8, edited: false })).toBe(false);
    // A record with no prescription on it (an import, an older log) is not "as written".
    expect(doneAsWritten({ actualWeight: 40, actualReps: 8 })).toBe(false);
  });

  it('⛔ the walked defect: day A done as written at a light bar does NOT scale the rest of the week down', () => {
    const asWritten = [session(THREE.map((id) => log(id, light(id), TLO, true)))];
    expect(personalScale(asWritten, he, exerciseById, TLO, epley)).toBeNull();
    const untried = LOADED.find((id) => !THREE.includes(id) && startingWeight(exerciseById(id)!, he)! > 30)!;
    expect(smartSeed(untried, he, asWritten, TLO)).toBe(smartSeed(untried, he, [], TLO));
  });

  it('…while the same loads REPORTED short of the target still measure her — nothing she said is lost', () => {
    const reported = [session(THREE.map((id) => log(id, light(id), TLO - 2, false)))];
    const s = personalScale(reported, he, exerciseById, TLO, epley)!;
    expect(s).toBeLessThan(1);
    expect(s).toBeGreaterThan(0.5);
  });

  it('an as-written donor may raise a lift above the cold start, never pull it below', () => {
    const bench = 'bb_bench_press';
    const recipient = 'machine_chest_press';
    const cold = smartSeed(recipient, he, [], TLO)!;
    const tiny = [session([log(bench, 20, TLO, true)])]; // the empty bar, done as written
    expect(smartSeed(recipient, he, tiny, TLO)).toBeGreaterThanOrEqual(cold);
    const strong = [session([log(bench, 100, TLO, true)])];
    expect(smartSeed(recipient, he, strong, TLO)).toBeGreaterThan(cold);
  });
});

describe('1 · ⛔ B-1 cancelled — the model writes the opening load from what she told it', () => {
  it('the schema carries `load`, in kg, one dumbbell — and optional', () => {
    const lift = BUILD_WEEK_SCHEMA.properties.days.items.properties.lifts.items;
    expect(lift.properties.load.type).toBe('number');
    expect(lift.properties.load.description).toMatch(/kg/);
    expect(lift.properties.load.description).toMatch(/ONE dumbbell/);
    // Optional in the SCHEMA (the `required` list below). The description stopped opening on the
    // word on 2026-10-11: it now says exactly when to omit, because "optional" was being read as
    // "only the lifts she named" — see `theCoachIsToldWhatSheLifts`.
    expect(lift.properties.load.description).toMatch(/Omit it only for/);
    expect(lift.required).toEqual(['ex', 'sets']);
  });

  it('the reader keeps a real load and refuses anything that is not one', () => {
    const week = (load: unknown) => readCoachWeek({ days: [{ name: 'א', lifts: [{ ex: 'bb_bench_press', sets: 4, load }] }] })!.days[0].lifts[0];
    expect(week(80).load).toBe(80);
    expect(week(82.5).load).toBe(82.5);
    for (const bad of [0, -20, Number.NaN, '80', null, START_LOAD_MAX_KG + 1]) expect(week(bad).load).toBeUndefined();
  });

  it('the draft puts it on the lift’s seat; a swap takes it away with the lift it was written for', () => {
    const p = draftFromCoachWeek({ days: [{ name: 'א', lifts: [{ ex: 'bb_bench_press', sets: 4, load: 80 }, { ex: 'db_row', sets: 3 }] }] })!;
    expect(p.days[0].slots[0].startLoadKg).toBe(80);
    expect(p.days[0].slots[1].startLoadKg).toBeUndefined();
    expect(replaceLift(p, 0, 0, 'db_bench_press').days[0].slots[0].startLoadKg).toBeUndefined();
    expect(setLiftStartLoad(p, 0, 1, 30).days[0].slots[1].startLoadKg).toBe(30);
  });

  it('the engine seeds a never-lifted lift from the seat’s load before its own estimate', () => {
    const src = read('src/data/api/fixtureModel.ts');
    expect(src).toContain('const seedFor = (id: string) => slotStartLoadOf(program, id) ?? smartSeed(id, profile, history, bandOf(id).lo);');
    expect(src).toContain('slotStartLoadOf(program, ex.id) ?? smartSeed(ex.id, profile, history, bandOf(ex.id).lo)');
  });

  it('her experience reaches the model, and the days she wrote beat the wheel', () => {
    const req = buildWeekRequest({ daysPerWeek: 3, sex: 'male', weightKg: 80, experience: 'advanced', ask: 'ארבע פעמים בשבוע', locale: 'he' });
    expect(req.blocks[1].text).toContain('- training experience: several years');
    expect(req.blocks[1].text).toContain('- days per week: 3 (if their own words below name a number of days, their words win)');
    const quiet = buildWeekRequest({ daysPerWeek: 3, sex: 'male', locale: 'he' });
    expect(quiet.blocks[1].text).not.toContain('training experience');
  });
});

describe('…and her one tap of experience', () => {
  it('unanswered changes nothing; beginner is lighter, advanced heavier', () => {
    expect(experienceFactor(undefined)).toBe(1);
    expect(experienceFactor('intermediate')).toBe(1);
    expect(experienceFactor('beginner')).toBeLessThan(1);
    expect(experienceFactor('advanced')).toBeGreaterThan(1);
  });

  it('the cold start reads it only until she has shown something of her own', () => {
    const id = 'machine_chest_press';
    expect(smartSeed(id, { ...he, experience: 'advanced' }, [], TLO)).toBeGreaterThan(smartSeed(id, he, [], TLO));
    expect(smartSeed(id, { ...he, experience: 'beginner' }, [], TLO)).toBeLessThan(smartSeed(id, he, [], TLO));
  });

  it('AboutYou asks it in one optional tap, and the answer travels to the builder', () => {
    const about = read('src/screens/onboarding/AboutYou.tsx');
    expect(about).toContain("navigation.navigate('ConnectHealth', { sex, weightKg: kg, ...(experience ? { experience } : {}) });");
    expect(about).toContain('onPress={() => setExperience(experience === v ? null : v)}');
    expect(read('src/screens/onboarding/ConnectHealth.tsx')).toContain('...(route.params?.experience ? { experience: route.params.experience } : {}),');
    expect(read('src/screens/onboarding/BuildingProgramme.tsx')).toContain('...(inputs.experience ? { experience: inputs.experience } : {}),');
  });
});
