// @ts-nocheck
// 
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
  units: 'kg', healthConnected: false,
};

describe('what the coach cannot work without', () => {
  it('names each requirement with the reason it is one', () => {
    // The list is the contract. A requirement with no stated reason is one nobody can argue with
    // later, which is how a floor becomes a questionnaire.
    /*
     * ⛔ FIVE SINCE 2026-08-05. `workoutMinutes` was the sixth and it left with the question that
     * collected it — the founder removed session length from onboarding because she cannot answer
     * it before her first session, so the coach sets the budget itself (never under 45).
     *
     * ⚠️ A FACT NOTHING ASKS FOR CANNOT SIT IN A LIST OF "what she must be asked". `missingForCoach`
     * would have reported it missing for every athlete alive, for ever.
     */
    expect(REQUIRED_FOR_COACH.map((r) => r.key)).toEqual([
      'sex', 'weightKg', 'daysPerWeek',
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
    /* ⛔ FIVE, NOT SIX (2026-08-05). Session length is no longer something she is asked for, so it
       cannot be something she is MISSING — a warning that is always on is a warning nobody reads. */
    const every = ['sex', 'weightKg', 'daysPerWeek'];
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
  it('⛔ EVERY requirement reaches the sheet — walked, not spot-checked', () => {
    /*
     * ⛔ THIS ASSERTION USED TO CHECK ONE FIELD (the bodyweight, `toContain('62')`) AND IT LET TWO
     * MORE THROUGH THE VERY NEXT TURN.
     *
     * `AboutYou` asks for age and experience, `REQUIRED_FOR_COACH` calls both critical, `Profile`
     * stores both — and `coachFacts`, the only thing the coach actually reads, carried neither. Two
     * screens of hers, answered and thrown away, with every test green.
     *
     * It is the same failure the founder caught in the bodyweight one turn earlier, committed while
     * fixing it: a conditional spread makes an absent fact invisible, so nothing is surprised by a
     * field that never arrives. A spot-check cannot see that; walking the list can.
     */
    const facts = coachFacts({ profile: full, history: [], cardio: [], program: null } as never);
    const athlete = (facts as { athlete: Record<string, unknown> }).athlete;
    for (const r of REQUIRED_FOR_COACH) {
      // ⚠️ `workoutMinutes` used to need a rename here (it is `minutes` on the wire). It left the
      // list on 2026-08-05 — the coach sets the budget itself now — so every remaining requirement
      // keeps its own name, and the special case went with it.
      expect({ key: r.key, sent: athlete[r.key] !== undefined }).toEqual({ key: r.key, sent: true });
    }
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
    /* ⚠️ `NameEntry` IS MERGED INTO `AboutYou` AND DELETED (founder 2026-08-04) — four answering
       screens now, not five. The list is the PATH, so it changes when the path does; what may not
       change is that every requirement is still collected on it. */
    /* ⛔ `Start` JOINED THE PATH ON 2026-08-12 — the fork where she says whether she already has a
       programme. It collects nothing the coach needs, but a law that lists "the only path through"
       and omits a step on it is a law describing a flow that does not exist. */
    /* ⛔ `BodyMap` LEFT THE PATH ON 2026-08-29 (founder) — the builder took its seat, and the
       builder asks for nothing the coach needs: it is where she WRITES a week, not where she
       answers a question. So the answering path is three screens, and every requirement is still
       collected on it — which is the only claim this law has ever made. */
    const flow = ['Start', 'AboutYou', 'ConnectHealth']
      .map((f) => read(`src/screens/onboarding/${f}.tsx`))
      .join('\n');
    for (const r of REQUIRED_FOR_COACH) {
      /*
       * ⚠️ `sex` IS PROBED BY ITS CHOICES, NOT BY ITS LABEL. It used to be found via `t('ob.sex')` —
       * the legend over the control — and that legend is deleted: the headline names the screen and
       * two labelled choices need no third word above them. The law is that sex is COLLECTED on the
       * path, so it asks after the control rather than after the caption that used to sit on it.
       */
      /*
       * ⚠️ BY THE KEY, NOT BY THE CALL. This read `t('ob.female')` literally, and on 2026-08-12 the
       * segmented control became two mapped choices — `t(v === 'female' ? 'ob.female' : 'ob.male')`
       * — so the probe went looking for a spelling rather than for the question being asked.
       */
      const asked = r.key === 'sex' ? flow.includes("'ob.female'") : new RegExp(`\\b${r.key}\\b`).test(flow);
      expect({ key: r.key, asked }).toEqual({ key: r.key, asked: true });
    }
  });

  it('⛔ sex is asked with NO DEFAULT, and the act waits for it', () => {
    /*
     * ⛔ IT DEFAULTED TO `'male'` (founder 2026-08-04, the tap audit). A woman who did not notice
     * got an app that addressed her in the wrong gender in every line of Hebrew it would ever write
     * her — silently, for ever, because Hebrew conjugates the second person and the whole copy layer
     * keys off this single value.
     *
     * One extra tap for a man is not a price. It is the removal of the worst default in the product,
     * and the assertion is on the ABSENCE of the fallback rather than on the control.
     */
    const src = read('src/screens/onboarding/AboutYou.tsx');
    expect(src).toContain("useState<'female' | 'male' | null>(app.profile?.sex ?? null)");
    expect(src).not.toMatch(/\?\?\s*'male'/);
    expect(src).toContain('disabled={!sex}');
  });

  it('⚠️ and the NAME she was already handed is filled in, not asked for again', () => {
    /*
     * `AuthResult` carries `name` (Apple returns it on first authorization) and `appStore` catches
     * it into `pendingNameRef` at sign-in. The screen that asked for it read `app.profile?.name` —
     * which does not exist during onboarding — so its field was ALWAYS empty and she retyped a name
     * the product had been given one screen earlier.
     */
    expect(read('src/screens/onboarding/AboutYou.tsx')).toContain('useState(app.pendingName()');
  });

  it('⚠️ the two rules sit ON THE ONLY PATH THROUGH', () => {
    /*
     * A step that can be skipped is not a guarantee. `NameEntry` goes to `AboutYou` and nowhere
     * else; `AboutYou` goes to `YourTraining` carrying both numbers; `YourTraining` goes to
     * `ConnectHealth` carrying everything. There is no route to the coach that misses one.
     *
     * ⚠️ MERGED 2026-08-04 on the founder's instruction — `Bodyweight` and the age half of the old
     * `AboutYou` are one screen now, because they answer the same question and splitting them made
     * the intake read as a form with pages.
     */
    /*
     * ⛔ THE THREE WHEELS MOVED TO `YourTraining` (founder 2026-08-05): *"make one screen of 3
     * rulers — DAYS A WEEK together with BODYWEIGHT and AGE — and move the years of experience to
     * the screen with the name and the sex."*
     *
     * The law's claim is unchanged and is what is asserted: **there is no route to the coach that
     * misses one of them.** Which screen holds which is his to arrange; that every one is carried
     * forward is not.
     */
    /*
     * ⛔ ONE ANSWERING SCREEN FEWER (founder 2026-08-10): *"תמשיך למיזוג המסכים."* Once age and
     * experience left, `YourTraining` held two wheels and `AboutYou` held two controls — four
     * answers over two half-empty screens, which is one form with an extra tap in the middle of it.
     *
     * ⚠️ THE LAW'S CLAIM IS STILL THE SAME ONE: there is no route to the programme that drops one
     * of her numbers. What changed is how many steps collect them, which is his to arrange.
     */
    /*
     * ⛔ ONE WHEEL LEFT ON THIS SCREEN (founder 2026-08-29): *"להוריד את כמות האימונים בשבוע. כי זה
     * שייך לבניית התוכנית."*
     *
     * ⚠️ AND THE LAW'S CLAIM SURVIVES THE DELETION INTACT, which is the only reason it is allowed:
     * there is still no route to a programme that drops one of her numbers. Frequency did not stop
     * being collected — it moved to the door that consumes it, and the two doors that do NOT
     * consume it derive the number from the week she ends up holding (`onSave` re-stamps it). So
     * the chain is asserted in three halves now: this screen carries what it asks, the builder
     * asks the rest, and every exit from the builder stamps a frequency that is true of the week.
     */
    const about = read('src/screens/onboarding/AboutYou.tsx');
    expect(about.match(/<WheelPicker/g)).toHaveLength(1);
    expect(about).toContain("navigation.navigate('ConnectHealth', { sex, weightKg: kg })");
    const builderSrc = read('src/screens/plan/PlanBuilder.tsx');
    // the door that cannot derive it asks for it, and hands on exactly what it was told
    /* ⛔ A FULL STEP SINCE 2026-08-29, not the bottom sheet it was for a day — the founder chose it
       over the sheet when the AI screen was designed. What this clause guards is unchanged: the one
       door that cannot derive a frequency is the one that asks for it. */
    expect(builderSrc).toContain('function AskTheCoach');
    expect(builderSrc).toContain("inputs: { ...inputs, daysPerWeek, ...(minutes ? { workoutMinutes: minutes } : {}) },");
    // the doors that CAN derive it do, from the sealed week rather than from an earlier answer
    expect(builderSrc).toContain("daysPerWeek: sealed.days.filter((day) => !day.isRest).length");
    /*
     * ⛔ THE STEP AFTER THIS ONE IS THE BODY MAP NOW (founder 2026-08-08): *"פציעות כאבים ומה אסור
     * יהיה בBODYMAP לכן לא צריך טקסט חופשי."* `YourGoal` asked for two paragraphs, and measuring
     * who READ them found one consumer — the AI's fact pack — which is out of the front door.
     *
     * ⚠️ THE LAW'S CLAIM IS UNCHANGED: there is no route to the programme that drops one of her
     * numbers. Only the name of the next hop moved, and the spread (`...route.params`) is the half
     * that actually carries them — which is why it is pinned rather than the screen name alone.
     */
    expect(read('src/app/Root.tsx')).toContain('name="AboutYou"');
    /* ⛔ AND THE STEP AFTER HEALTH IS THE BUILDER NOW (founder 2026-08-29). Registered on the
       ONBOARDING stack, not merely on the main one — they are separate navigators, and a route that
       exists only on the other one is a tap that finds nothing at runtime. */
    expect(read('src/app/Root.tsx')).toContain('<OnboardingStack.Screen name="PlanBuilder"');
    expect(read('src/app/Root.tsx')).not.toContain('name="BodyMap"');
    expect(read('src/app/Root.tsx')).not.toContain('YourTraining');
    /*
     * ⚠️ AND THE MAP RELAYS WHAT IT WAS GIVEN. This is the defect the wiring actually shipped: the
     * screen was written against a `{ inputs }` param no step in this navigator sends, so her sex,
     * weight and days died on the way IN and the map died on the way OUT. A test on the screen name
     * alone would have passed against exactly that.
     */
    const health = read('src/screens/onboarding/ConnectHealth.tsx');
    expect(health).toContain("navigation.navigate('PlanBuilder', { inputs })");
    /* ⚠️ AND THE DELETED SCREEN IS GONE FROM THE NAVIGATOR, not merely unrouted — a screen left
       registered is a screen a deep link can still reach. */
    expect(read('src/app/Root.tsx')).not.toContain('NameEntry');
    expect(read('src/app/Root.tsx')).not.toContain('YourGoal');
    /* ⛔ THE FORK IS THE FRONT DOOR AND SIGN-IN IS THE CLOSER (2026-09-01, audit lever 3 —
       decided under the founder's grant). The chain the law protects is unchanged — no route to
       the programme drops one of her numbers — but the account now stands AFTER the aha: the fork
       opens the intake, the Ready screen's CTA pushes Authentication when no account exists, and
       success hands her back for the focus listener to finish. Both halves asserted. */
    const root = read('src/app/Root.tsx');
    expect(root.indexOf('<OnboardingStack.Screen name="Start"')).toBeLessThan(
      root.indexOf('<OnboardingStack.Screen name="Authentication"'),
    );
    expect(read('src/screens/onboarding/Start.tsx')).toContain("navigation.navigate('AboutYou')");
    expect(read('src/screens/onboarding/ProgramCreated.tsx')).toContain("navigation.navigate('Authentication')");
    expect(read('src/screens/onboarding/Authentication.tsx')).toContain('navigation.goBack()');
  });

  it('and the LAST step puts it into the inputs the profile is built from', () => {
    /*
     * ⛔ AND IT IS `ConnectHealth` AGAIN (founder 2026-08-29). The rule has always been that ONE
     * place builds `OnboardingInputs`; what moves is WHICH place, and it follows the last step that
     * collects an ANSWER. That was the body map from 2026-08-10; the map is deleted and the step
     * that replaced it — the builder — has THREE ways out. A relay assembled in three exits is three
     * places for her bodyweight to go missing, which is the precise bug this clause's own history
     * records, so the object is sealed one step earlier and the builder only carries it.
     */
    const src = read('src/screens/onboarding/ConnectHealth.tsx');
    expect(src).toContain('const inputs: OnboardingInputs = {');
    expect(src).toContain('...(route.params?.weightKg != null ? { weightKg: route.params.weightKg } : {})');
    // …and what only THIS step can know is written here rather than relayed to itself.
    expect(src).toContain('healthConnected: withHealth,');
    expect(src).toContain('units: unitsForDevice(');
    /*
     * ⚠️ AND NOTHING IN THE INTAKE PUTS A BODY MAP IN IT ANY MORE. The screen that produced one is
     * deleted; asserting the ABSENCE is what stops the field being resurrected by half — a relay
     * that carries a key no screen writes is a fact the profile will claim to have and never does.
     *
     * ⚠️ ASSERTED ON THE CODE, NOT ON THE FILE — the same trap `onboardingEndsInAProgramme` records:
     * a law that forbids a WORD trips on the comment explaining why it is forbidden, and the note
     * above this line names `bodyMap` twice.
     */
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toContain('bodyMap');
  });

  it('⚠️ the wheel opens on a plausible weight, not on the bottom of its range', () => {
    // She is adjusting, not counting up from 30 kg. A rule that opens at its floor is a rule she has
    // to scroll before she can answer, which is how a form becomes a chore.
    const src = read('src/screens/onboarding/AboutYou.tsx');
    expect(src).toMatch(/WEIGHT_OPENS_ON: Record<'kg' \| 'lb', number> = \{ kg: \d+, lb: \d+ \}/);
    /*
     * ⚠️ THE AGE WHEEL IS GONE, so its opening value is too — and what replaces the assertion is the
     * one that matters: **no wheel on this screen may open at its own floor.** A rule that opens at
     * 30 kg or at 2 days is a rule she has to scroll before she can answer.
     */
    expect(src).not.toContain('AGE_OPENS_ON');
    expect(src).not.toContain("t('ob.age')");
    expect(src).toMatch(/min=\{units === 'kg' \? 30 : 66\}/);
    /*
     * ⚠️ THE DAYS WHEEL IS NO LONGER ON THIS SCREEN (founder 2026-08-29: *"להוריד את כמות
     * האימונים בשבוע… כי זה שייך לבניית התוכנית"*). The RULE it was asserted for — no wheel opens
     * on its own floor — travelled with the question, so it is asked of the screen that now holds
     * it. Asserting it here as well would only pin an absence that the line below already pins.
     */
    expect(src).not.toMatch(/const DAYS_OPENS_ON/);
    expect(src).not.toContain("label={t('ob.daysPerWeek')}");
    const builder = read('src/screens/plan/PlanBuilder.tsx');
    expect(builder).toMatch(/DAYS_OPENS_ON = \d+/);
    expect(builder).toContain("t('ob.daysPerWeek')");
  });

  it('is written in both languages, and to HER in Hebrew', () => {
    for (const loc of ['en', 'he']) {
      const copy = JSON.parse(read(`src/i18n/locales/${loc}.json`)) as { ob: Record<string, string> };
      /*
       * ⚠️ `weightSub` IS GONE, AND THAT IS THE POINT (founder 2026-08-04): *"take the text off the
       * top and leave only titles — nobody reads whole sentences in onboarding."* Every explanatory
       * line in the intake was deleted; what a step still needs is its LEGEND and its TITLE.
       *
       * The one exception is the Health step, whose line is a promise about her data rather than
       * prose — `theV4WorldIsGoneFromTheCopy` holds that one, and it caught me deleting it.
       */
      for (const k of ['weightLegend', 'weightTitle']) expect(copy.ob[k]).toBeTruthy();
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
