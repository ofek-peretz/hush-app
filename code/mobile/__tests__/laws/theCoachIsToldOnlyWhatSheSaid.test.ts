// @ts-nocheck
/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 * THE COACH IS TOLD EVERYTHING SHE SAID — AND NOTHING SHE DID NOT (2026-10-11)
 *
 * The founder asked the coach, in the plan builder: *"האם התוכנית הזאת אופטימלית עבור יצירה של גוף
 * הרקולס? ומדוע נתת לי בחלק מהתרגילים רק 2 סטים?"* — and it answered that adding sets *"עלולה
 * להאריך את האימון מעבר לשעה"*. His reply to me:
 *
 *   > *"אני לא מקבל את זה כל כך כי מאיפה הוא יודע שאסור לו לעבור את השעה אימון בכלל? אני רוצה
 *   > שתעבור טוב טוב על הפרומפט ותוודא שהוא אכן צורך את כל מה שאנו מזינים באפליקציה בכל הנתונים
 *   > שממלאים + שהוא צורך את מה שאנו כותבים בהודעה החופשית שרושמים לו."*
 *
 * WHERE THE HOUR CAME FROM. Not from the prompt — from the app. `completeOnboarding` wrote
 * `workoutMinutes: 60` into every profile ("editable in Settings"; no such setting exists), and
 * `coachFacts` stated it on her sheet as `"minutes": 60` — a field whose own type says "absent
 * until she has said, never 60 by default". An older law (`theAppNeverAnswersForHer`) proved the
 * function omits it for a profile without one; no profile was ever without one. The reviewer was
 * handed a limit and reasoned from it, as it should.
 *
 * THE AUDIT HE ASKED FOR, as assertions. There are two live AI calls (`theAiHasOneJob`): the week's
 * build and the plan's review. For each: every fact the app collects about her reaches it, her
 * free line reaches it whole, and nothing arrives that she did not say.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

import fs from 'node:fs';
import path from 'node:path';
import { buildWeekRequest } from '@/domain/buildPrompt';
import { coachFacts } from '@/domain/coachFacts';
import { reviewRequest } from '@/domain/reviewPrompt';
import en from '@/i18n/locales/en.json';
import he from '@/i18n/locales/he.json';

const MOBILE = path.join(__dirname, '..', '..');
const read = (rel: string): string => fs.readFileSync(path.join(MOBILE, rel), 'utf8');

/** A profile exactly as every phone holds it today: the invented hour is on it. */
const onAPhoneToday = {
  sex: 'male',
  units: 'kg',
  weightKg: 82,
  experience: 'advanced',
  daysPerWeek: 4,
  healthConnected: false,
  goalText: 'גוף של הרקולס, אין לי מגבלת זמן',
  workoutMinutes: 60,
};
const DRAFT = {
  id: 'w',
  frequency: 1,
  authored: 'athlete',
  days: [{ id: 'd1', name: 'A', muscleGroups: ['Chest'], isRest: false, slots: [{ capability: 'horizontal_push', exerciseId: 'bb_bench_press', setCount: 2 }] }],
};

describe('⛔ nobody asked her how long she has, so nothing says she answered', () => {
  it('a new profile is written without a session length', () => {
    const store = read('src/state/stores/appStore.tsx');
    expect(store).not.toMatch(/workoutMinutes:\s*inputs\.workoutMinutes\s*\?\?\s*60/);
    expect(store).toContain('...(inputs.workoutMinutes != null ? { workoutMinutes: inputs.workoutMinutes } : {}),');
    expect(read('src/screens/onboarding/ProgramCreated.tsx')).not.toMatch(/workoutMinutes[^\n]*\?\?\s*60/);
  });

  it('…and the profiles that already carry the invented 60 do not put it on her sheet', () => {
    const sheet = coachFacts({ profile: onAPhoneToday, plan: null, history: [], language: 'he' });
    expect(sheet.athlete.minutes).toBeUndefined();
    expect(JSON.stringify(sheet.athlete)).not.toMatch(/"minutes"/);
  });

  it('the reviewer is not handed an hour — in the sheet or in the instructions', () => {
    const facts = coachFacts({ profile: onAPhoneToday, plan: null, history: [], language: 'he' });
    const req = reviewRequest({ facts, draft: DRAFT, ask: 'למה רק 2 סטים?' });
    const sheet = req.blocks[1].text;
    expect(sheet.slice(0, sheet.indexOf('Everything you write'))).not.toMatch(/"minutes":\s*\d/);
    // The instructions state no session length, no cap and no budget of their own.
    const instructions = req.blocks[0].text.slice(0, req.blocks[0].text.indexOf('CATALOGUE'));
    expect(instructions).not.toMatch(/\b(60|hour|minutes|budget)\b/i);
  });

  it('the builder is not handed one either: its only numbers about her are hers', () => {
    const req = buildWeekRequest({ daysPerWeek: 4, sex: 'male', weightKg: 82, experience: 'advanced', ask: 'גוף של הרקולס', locale: 'he' });
    const instructions = req.blocks[0].text.slice(0, req.blocks[0].text.indexOf('CATALOGUE'));
    expect(instructions).not.toMatch(/\b(hour|minutes|budget)\b/i);
    expect(req.blocks[1].text).not.toMatch(/\b(hour|minutes|budget)\b/i);
    // …and the schema bounds a week by days and a lift by sets — never by time.
    expect(JSON.stringify(req.schema)).not.toMatch(/minute|hour|budget/i);
  });

  it('the app itself no longer says "that you asked for" about a length she never gave', () => {
    expect(he.budgetNote.over).not.toContain('שביקשת');
    expect(en.budgetNote.over).not.toMatch(/you asked for/i);
  });
});

describe('everything the intake collects about her reaches the builder', () => {
  const lifts = [{ exerciseId: 'bb_bench_press', kg: 100, reps: 6 }];
  const her = buildWeekRequest({ daysPerWeek: 5, sex: 'female', weightKg: 61.5, experience: 'intermediate', lifts, ask: 'ישבן ורגליים', locale: 'he' }).blocks[1].text;

  it('days, sex, bodyweight, experience, her lifts — each on its own line', () => {
    expect(her).toContain('- days per week: 5');
    expect(her).toContain('- sex: female');
    expect(her).toContain('- bodyweight: 61.5 kg');
    expect(her).toContain('- training experience: about one to two years');
    expect(her).toContain('- weights they lift today: bb_bench_press 100 kg x 6');
  });

  it('the screen that calls it passes every one of them', () => {
    const build = read('src/screens/onboarding/BuildingProgramme.tsx');
    for (const line of [
      'daysPerWeek: inputs.daysPerWeek,',
      "sex: inputs.sex === 'female' ? 'female' : 'male',",
      '...(inputs.weightKg != null ? { weightKg: inputs.weightKg } : {}),',
      '...(inputs.experience ? { experience: inputs.experience } : {}),',
      '...(inputs.lifts?.length ? { lifts: inputs.lifts } : {}),',
      '...(coachAsk ? { ask: coachAsk } : {}),',
    ]) {
      expect(build).toContain(line);
    }
  });

  it('what the intake asks and the builder is NOT told is a short list, each with its reason', () => {
    // The relay's whole shape (`OnboardingInputs`). A field added to it must be placed in one list.
    const models = read('src/data/local/models.ts');
    const shape = models.slice(models.indexOf('export interface OnboardingInputs {'), models.indexOf('/** A frame-owned slot in a program day. */'));
    const fields = [...shape.matchAll(/^  (\w+)\??:/gm)].map((m) => m[1]).sort();
    const sent = ['daysPerWeek', 'experience', 'lifts', 'sex', 'weightKg'];
    const notSent = {
      name: 'who she is, not how she trains',
      units: 'how the app shows a weight — every weight on the wire is kilograms',
      healthConnected: 'a permission; Health is never a model input (ratified)',
      goalText: 'IS sent — it is her free line, as `ask` (and saved for the reviewer)',
      limitsText: 'no screen writes it since 2026-08-04; her limits are in her free line',
      heightCm: 'no screen asks',
      age: 'no screen asks',
      bodyMap: 'no screen asks since the builder replaced the body map',
      workoutMinutes: 'no screen asks — and nothing may invent it (above)',
    };
    expect(fields).toEqual([...sent, ...Object.keys(notSent)].sort());
  });
});

describe('her free line reaches the model whole', () => {
  const long = 'א'.repeat(400);

  it('the builder gets all 400 characters — and the field cannot hold more than that', () => {
    const her = buildWeekRequest({ daysPerWeek: 3, sex: 'male', ask: long, locale: 'he' }).blocks[1].text;
    expect(her).toContain(`WHAT THE ATHLETE ASKED FOR, in their own words:\n${long}`);
    // The intake's field and the Program tab's coach box stop at the same length the prompt keeps,
    // so nothing she managed to type is cut on the way.
    expect(read('src/screens/plan/PlanBuilder.tsx')).toMatch(/placeholder=\{t\('ob\.weekAskPlaceholder'\)\}\s*maxLength=\{400\}/);
    expect(read('src/screens/program/ProgramTab.tsx')).toContain('maxLength={400}');
    expect(read('src/domain/buildPrompt.ts')).toContain(".trim().slice(0, 400);");
  });

  it('it is her LAST word in the call, labelled as hers', () => {
    const req = buildWeekRequest({ daysPerWeek: 3, sex: 'male', weightKg: 80, ask: 'בלי רגליים', locale: 'he' });
    expect(req.blocks[req.blocks.length - 1].text.trimEnd().endsWith('בלי רגליים')).toBe(true);
  });

  it('the reviewer gets her question whole, last, and her intake line as what she trains for', () => {
    const facts = coachFacts({ profile: onAPhoneToday, plan: null, history: [], language: 'he' });
    expect(facts.athlete.trainingFor).toBe(onAPhoneToday.goalText);
    const req = reviewRequest({ facts, draft: DRAFT, ask: long });
    expect(req.blocks[req.blocks.length - 1].text).toBe(`WHAT SHE ASKED FOR, in her own words:\n${long}`);
    expect(req.blocks[1].text).toContain('"trainingFor":"גוף של הרקולס, אין לי מגבלת זמן"');
  });

  it('the intake line is SAVED, so the reviewer of a later day still knows what the week is for', () => {
    const ready = read('src/screens/onboarding/ProgramCreated.tsx');
    expect(ready).toContain('await app.completeOnboarding(said && !inputs.goalText ? { ...inputs, goalText: said } : inputs);');
    expect(read('src/state/stores/appStore.tsx')).toContain('...(inputs.goalText ? { goalText: inputs.goalText } : {}),');
  });

  it('the reviewer is told what the athlete told the app: sex, bodyweight, experience, days', () => {
    const a = coachFacts({ profile: onAPhoneToday, plan: null, history: [], language: 'he' }).athlete;
    expect(a).toMatchObject({ sex: 'male', weightKg: 82, experience: 'advanced', daysPerWeek: 4 });
  });
});
