import fs from 'fs';
import path from 'path';
import { REQUIRED_FOR_COACH, missingForCoach, readyForCoach } from '@/domain/coachRequirements';
import { coachFacts } from '@/domain/coachFacts';
import type { Profile } from '@/data/local/models';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE COACH IS NEVER ASKED TO BUILD ANYTHING WITHOUT WHAT IT NEEDS.
 *
 * ⛔ FOUNDER, 2026-08-03, after his first real intake on build 40:
 *
 *   > *"The coach didn't ask for my weight, and as far as I know that's critical for it. Maybe we
 *   > should put everything the coach has to use for the athlete into onboarding, and then a chat
 *   > window at the end for extra requests."*
 *
 * ── HOW IT WENT MISSING, AND WHY NOTHING NOTICED ────────────────────────────────────────────────
 * Nothing was broken. `coachFacts` spreads every field conditionally, so an absent fact is an absent
 * LINE on the sheet — no error, no warning, no gap anywhere in the app. Her bodyweight reached the
 * coach only if she happened to mention it in conversation.
 *
 * **A conversation cannot guarantee coverage.** That is not a flaw in the model; it is what a
 * conversation IS. This law is the guarantee a conversation could not make.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const full: Profile = {
  sex: 'female', weightKg: 62, age: 34, experience: 'intermediate',
  daysPerWeek: 4, workoutMinutes: 60,
  units: 'kg', goal: 'build_muscle', healthConnected: false,
};

describe('what the coach cannot work without', () => {
  it('names each requirement with the reason it is one', () => {
    // The list is the contract. A requirement with no stated reason is one nobody can argue with
    // later, which is how a floor becomes a questionnaire.
    expect(REQUIRED_FOR_COACH.map((r) => r.key)).toEqual([
      'sex', 'weightKg', 'age', 'experience', 'daysPerWeek', 'workoutMinutes',
    ]);
    for (const r of REQUIRED_FOR_COACH) expect(r.why.length).toBeGreaterThan(20);
  });

  it('a complete profile is ready', () => {
    expect(missingForCoach(full)).toEqual([]);
    expect(readyForCoach(full)).toBe(true);
  });

  it('⚠️ NO profile is missing everything, not nothing', () => {
    // `undefined` here means onboarding has not run. Answering "nothing is missing" would be the
    // exact hole this file exists to close, and it is the answer a naive `Object.keys` filter gives.
    const every = ['sex', 'weightKg', 'age', 'experience', 'daysPerWeek', 'workoutMinutes'];
    expect(missingForCoach(null)).toEqual(every);
    expect(missingForCoach(undefined)).toEqual(every);
  });

  it('⚠️ a bodyweight of 0 is absence wearing a number', () => {
    // `weightKg?: number` cannot say "present but meaningless". A zero would sail through a null
    // check and put a bodyweight of nothing on the sheet.
    expect(missingForCoach({ ...full, weightKg: 0 })).toEqual(['weightKg']);
    expect(missingForCoach({ ...full, weightKg: Number.NaN })).toEqual(['weightKg']);
    expect(missingForCoach({ ...full, sex: undefined })).toEqual(['sex']);
  });

  it('⛔ a daysPerWeek of 0 is MISSING, not "the coach will ask"', () => {
    /*
     * ⚠️ THIS ASSERTION WAS THE EXACT OPPOSITE THIS MORNING, and both versions were right at the
     * time. The founder caught the app handing the coach a placeholder 4 — *"it decides on its own
     * that it will do 4 workouts for me, without asking"* — and the fix then was to send nothing.
     * Hours later he put frequency on the list of things onboarding must collect.
     *
     * Not a contradiction: what he objected to was the APP INVENTING a number. Asking HER is the
     * opposite. A placeholder is a lie; a question is a question. `0` still means "not answered",
     * which is why it reads as missing rather than as an answer of zero.
     */
    expect(missingForCoach({ ...full, daysPerWeek: 0 })).toEqual(['daysPerWeek']);
    expect(readyForCoach({ ...full, daysPerWeek: 0 })).toBe(false);
  });
});

describe('the fact actually reaches the sheet', () => {
  it('⚠️ her bodyweight is ON the sheet the coach reads', () => {
    /*
     * The requirement list being right proves nothing about whether the number travels. This is the
     * assertion that covers the original bug: `coachFacts` is what the coach actually sees.
     */
    const facts = coachFacts({ profile: full, history: [], cardio: [], program: null } as never);
    expect(JSON.stringify(facts)).toContain('62');
  });

  it('and is absent — rather than invented — when it genuinely is not known', () => {
    // The other half: nothing anywhere may fill this in with a plausible number. An absent fact must
    // read as absent, which is what makes `missingForCoach` the thing that catches it.
    const facts = coachFacts({ profile: { ...full, weightKg: undefined }, history: [], cardio: [], program: null } as never);
    expect(JSON.stringify(facts)).not.toContain('weightKg');
  });
});

describe('onboarding asks for every one of them', () => {
  /*
   * ⛔ THESE READ THE SCREENS. A requirement list that nothing collects is a document, and the whole
   * point of this batch is that the guarantee lives in the flow rather than in a hope.
   */
  it('every requirement is collected by a step on the path', () => {
    /*
     * ⛔ THE ASSERTION THAT KEEPS THE LIST HONEST. Add a requirement without a screen that asks for
     * it and this fails — which is the whole guarantee, since the original bug was a fact nothing
     * anywhere collected.
     */
    const flow = ['NameEntry', 'Bodyweight', 'AboutYou', 'YourWeek', 'ConnectHealth']
      .map((f) => read(`src/screens/onboarding/${f}.tsx`))
      .join('\n');
    for (const r of REQUIRED_FOR_COACH) {
      // `sex` is the one whose state variable is named after the copy key rather than the field.
      const asked = r.key === 'sex' ? flow.includes("t('ob.sex')") : new RegExp(`\\b${r.key}\\b`).test(flow);
      expect({ key: r.key, asked }).toEqual({ key: r.key, asked: true });
    }
  });

  it('sex is asked on NameEntry, and carried forward', () => {
    const src = read('src/screens/onboarding/NameEntry.tsx');
    expect(src).toContain("t('ob.sex')");
    expect(src).toContain("navigation.navigate('Bodyweight', { sex })");
  });

  it('⚠️ bodyweight has its own step, ON THE ONLY PATH THROUGH', () => {
    /*
     * A step that can be skipped is not a guarantee. `NameEntry` goes to `Bodyweight` and nowhere
     * else, and `Bodyweight` goes on to `ConnectHealth` carrying the number — so there is no route
     * to the coach that misses it.
     */
    const src = read('src/screens/onboarding/Bodyweight.tsx');
    expect(src).toContain('<WheelPicker');
    expect(src).toContain("navigation.navigate('AboutYou', { sex: route.params.sex, weightKg: kg })");
    // …and it is registered, or the route is a type that resolves to a blank screen.
    expect(read('src/app/Root.tsx')).toContain('name="Bodyweight"');
  });

  it('and ConnectHealth puts it into the inputs the profile is built from', () => {
    const src = read('src/screens/onboarding/ConnectHealth.tsx');
    expect(src).toContain('const weightKg = route.params?.weightKg;');
    expect(src).toContain('...(weightKg != null ? { weightKg } : {})');
  });

  it('⚠️ the wheel opens on a plausible weight, not on the bottom of its range', () => {
    // She is adjusting, not counting up from 30 kg. A rule that opens at its floor is a rule she has
    // to scroll before she can answer, which is how a form becomes a chore.
    const src = read('src/screens/onboarding/Bodyweight.tsx');
    expect(src).toMatch(/OPENS_ON = \{ kg: \d+, lb: \d+ \}/);
    expect(src).toMatch(/min=\{units === 'kg' \? 30 : 66\}/);
  });

  it('is written in both languages, and to HER in Hebrew', () => {
    for (const loc of ['en', 'he']) {
      const copy = JSON.parse(read(`src/i18n/locales/${loc}.json`)) as { ob: Record<string, string> };
      for (const k of ['weightLegend', 'weightTitle', 'weightSub']) expect(copy.ob[k]).toBeTruthy();
    }
    /*
     * The Hebrew base form is MASCULINE, so a feminine variant is what makes the screen speak to her
     * — on the line that HAS a gendered verb. `weightSub` has none, and a `_female` identical to its
     * base is a variant that overrides nothing; `gender.test.ts` catches exactly that, and did.
     */
    const he = JSON.parse(read('src/i18n/locales/he.json')) as { ob: Record<string, string> };
    expect(he.ob.weightTitle_female).toBeTruthy();
    expect(he.ob.weightTitle_female).not.toBe(he.ob.weightTitle);
    expect(he.ob.weightSub_female).toBeUndefined();
  });
});
