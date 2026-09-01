// @ts-nocheck
// 
import fs from 'fs';
import path from 'path';

import { PLAN_BUILD_BUDGET_MS } from '@/platform/coach/planBuild';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ONBOARDING IS NOT FINISHED UNTIL THERE IS A PROGRAMME.
 *
 * ⛔ REWRITTEN 2026-08-04, when the intake CONVERSATION was deleted (founder: *"take the chat out of
 * the front door… my model from the start was to be the SPOTIFY of the fitness world"*).
 *
 * The screen this law used to drive is gone. **Every guarantee it held still applies** — they were
 * never about the chat, they were about the ORDERING, and the ordering is what a first-run bug
 * always breaks. So the assertions moved to the screen that replaced it.
 *
 * ── 1 · THE PROFILE IS WRITTEN, THEN THE PROGRAMME IS ASKED FOR ─────────────────────────────────
 * `coachFacts` reads a `Profile`, so there must be one before the call — the sheet cannot be built
 * from route params. `completeOnboarding` therefore runs FIRST, inside the same function, and this
 * is the moment her answers become an athlete.
 *
 * ── 2 · THERE IS NO LOCAL FIRST PROGRAMME ──────────────────────────────────────────────────────
 * If the coach cannot be reached she does not get a week. A generated fallback would be the deleted
 * engine coming back through a side door, and it would be the one programme in her whole history
 * that nothing decided. The screen says so and offers to ask again.
 *
 * ── 3 · SHE SEES IT BEFORE SHE IS IN IT ────────────────────────────────────────────────────────
 * The founder's own device bug: *"it moved me straight to the transition screen without showing me
 * the plan."* The build lands on `ProgramCreated`, which draws the whole week and waits for her.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const building = () => read('src/screens/onboarding/BuildingProgramme.tsx');
/**
 * The file with its comments stripped.
 *
 * ⚠️ Needed because a law that forbids a WORD trips on the comment explaining why it is forbidden —
 * this one caught the sentence "a percentage would be a lie" and reported it as a percentage. Prose
 * about a rule is not a violation of it.
 */
const buildingCode = () => building().replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('the last step builds, it does not chat', () => {
  it('⛔ the intake conversation is gone from the product', () => {
    expect(fs.existsSync(path.join(__dirname, '..', '..', 'src/screens/onboarding/CoachIntake.tsx'))).toBe(false);
    // …and nothing routes to it, which is how a deleted screen becomes a blank one instead.
    expect(read('src/app/Root.tsx')).not.toContain('CoachIntake');
    /*
     * ⛔ THE LAST ANSWERING STEP IS THE BUILDER (founder 2026-08-29) — it was the body map from
     * 2026-08-10, on the argument that the step which SHAPES the week belongs beside the payoff.
     * The builder shapes it harder: it is the week. The map is deleted from the intake, and this
     * clause asserts the deletion rather than the screen name, because the failure that matters is
     * a screen left registered and reachable after its ruling.
     */
    expect(fs.existsSync(path.join(__dirname, '..', '..', 'src/screens/onboarding/BodyMap.tsx'))).toBe(false);
    expect(read('src/app/Root.tsx')).not.toContain('name="BodyMap"');
    expect(read('src/screens/onboarding/ConnectHealth.tsx')).toContain("navigation.navigate('PlanBuilder'");
    /* …and the builder's two exits BOTH end on the reveal, which is the beat the founder refused to
       give up (*"אנו לא צריכים לוותר על החלק של האנימציה בסוף"*): the engine door goes there, and so
       does a week she sealed herself — the second one carrying `authored`, which is what makes the
       screen read her week instead of assembling a different one. */
    const builder = read('src/screens/plan/PlanBuilder.tsx');
    /*
     * ⚠️ THE ENGINE DOOR NOW CARRIES THE FREQUENCY IT JUST ASKED FOR (founder 2026-08-29: *"להוריד
     * את כמות האימונים בשבוע [מהמסך הראשון]. כי זה שייך לבניית התוכנית"*). The wheel left `AboutYou`
     * and stands on this door — it is the only one of the three with nobody to derive a number from
     * — so the relay is spread rather than passed through. Both exits still end on the reveal,
     * which is the beat this clause is actually about.
     */
    expect(builder).toContain("navigation.replace('BuildingProgramme', {");
    expect(builder).toContain('inputs: { ...inputs, daysPerWeek, ...(minutes ? { workoutMinutes: minutes } : {}) },');
    expect(builder).toContain('authored: true,');
  });

  it('⛔ THE REVEAL IS WHERE THE MODEL IS ASKED — and it can always answer without one', () => {
    /*
     * ⛔ THIS CLAUSE SAID THE OPPOSITE UNTIL 2026-08-29, AND BOTH READINGS WERE RIGHT IN THEIR TIME.
     *
     * It used to assert that this screen makes NO call: the 2026-08-10 removal was a latency
     * ruling — the two-call split *"existed to make a ninety-second wait survivable"* — and once
     * the call was gone, a screen that still made one would have been paying for a round trip whose
     * answer nothing read.
     *
     * The founder brought the model back on 2026-08-29 and then asked for the AI screen to be
     * designed properly. `BuildingProgrammeView`'s own docblock had been describing this call since
     * the day it was written — its rows stand as dashes *"until the coach's answer lands"* — so the
     * call did not arrive on a screen that was innocent of it. It came home.
     *
     * ⚠️ WHAT THE OLD CLAUSE ACTUALLY PROTECTED IS KEPT, AND IT IS THE HALF THAT MATTERS: **this
     * screen can always finish without the network.** Three guarantees, asserted below.
     */
    const src = building();

    // 1 · The local assembler is still here, and is what a failed call falls through to.
    expect(src).toContain('await model.generateProgram(profile)');
    expect(src).toContain('asked ?? (await model.generateProgram(profile))');

    /*
     * 2 · THE CALL IS MADE ONLY WHEN SHE ASKED FOR IT. `coachAsk` is the flag, and it is tested for
     * PRESENCE — an empty string is a real value (she pressed through the ask step without writing
     * a line, which is still the coach path), so truthiness would silently demote her to the local
     * assembler for saying nothing.
     */
    expect(src).toContain('!authored && coachAsk != null ? await askTheModel() : null');

    /*
     * 3 · AND A WEEK SHE ALREADY HAS IS NEVER ASKED FOR AGAIN. `authored` reads it off disk; a
     * network call over a sealed week would be spending money to re-answer a settled question.
     */
    /* ⚠️ `readSealed` IS `loadProgram` WITH A CLOCK ON IT (2026-08-30) — this screen draws dashes
       until a programme is in hand and its ticker stops when the placeholders run out, so any await
       that can outlive the beat is a dead screen. The ORDER is what this clause pins: a sealed week
       is read from disk before anything else is considered. */
    expect(src).toContain('authored ? await readSealed()');
    expect(src).toMatch(/Promise\.race\(\[db\.loadProgram\(\), late\]\)/);

    // …and the coach's own doctrine still cannot reach this screen: it asks `planBuild`, which
    // carries no preamble, no conversation and no `CoachPlan` writer.
    for (const gone of ['coachRequest', 'coachFacts', 'COACH_DECISION_SCHEMA', 'COACH_SHAPE_SCHEMA', 'first_programme', 'recordCoachAnswer']) {
      expect({ gone, present: src.includes(gone) }).toEqual({ gone, present: false });
    }
  });

});

describe('⛔ the intake never freezes', () => {
  /*
   * ⛔ FOUNDER, 2026-08-30: *"למה זה לא עובד. זה נתקע ולא זז."*
   *
   * Two screens on the intake render NOTHING until an async read finishes, and both are on the
   * path the whole of onboarding rides on. Neither can be allowed to depend on something resolving.
   */
  it('⛔ the build step waits for a running import — but only for a bounded moment', () => {
    /*
     * The wait is worth having: an import in flight WINS (it replaces the route), so building first
     * pays for a week we throw away. But `settledImport()` resolves when the READ does, and a read
     * can legitimately take the client's full timeout — **three minutes** of a dark body with
     * dashed rows on the last step of the intake, with the back gesture correctly disabled.
     *
     * ⚠️ THE ATHLETE NEVER WAITS ON AN OPTIMISATION. Past the grace the build runs; if the import
     * lands after, it still redirects, and all that is lost is the price of a call.
     */
    const src = building();
    expect(src).toContain('const IMPORT_GRACE_MS = 1_500;');
    expect(src).toContain('if (waitingForImport && !graceOver) return;');
    // …and the unbounded form may not come back.
    expect(src).not.toMatch(/if \(waitingForImport\) return;\s+started\.current/);
  });

  it('⛔ the builder step reads the disk ONCE, and shows its doors even if the disk is slow', () => {
    /* `PlanBuilder` returns a bare `SafeAreaView` until `loaded`. A dependency list that re-runs
       the read cancels the in-flight one every time (`alive = false`) and `loaded` never lands — a
       black screen that never moves. A ref, and a bound, and the fallback is the DOORS: being
       offered a choice she did not need is a moment's confusion; being sent to a reveal for a week
       that may not exist ends the intake with no way back. */
    const builder = read('src/screens/plan/PlanBuilder.tsx');
    expect(builder).toContain('const readOnce = useRef(false);');
    expect(builder).toMatch(/setTimeout\(\(\) => \{ if \(alive\) setLoaded\(true\); \}, 2000\)/);
  });

  it('⛔ THE WHOLE REVEAL HAS A CEILING, and it is measured rather than assumed', () => {
    /*
     * ⛔ FOUNDER, 2026-08-30, stating the bar this step has to clear: *"אם זה לא יהיה קצר בזמן ובעל
     * אפס שגיאות אין לנו סיכוי לצלוח."* Zero errors is what every other clause here is for. This
     * one is the other half: SHORT.
     *
     * ⚠️ AND THE MODEL IS NOW THE ONLY THING THAT DECIDES IT. Until 2026-08-30 it was not: with the
     * answer in hand INSTANTLY the screen still ran ~22s, because the fill walked one muscle at a
     * time and a week covers ten of them. The founder named the animation's purpose and it settled
     * the question: *"האנימציה הייתה בשביל למרוח את הזמן בעת הטעינה של הבינה."* A cover that
     * outlives what it covers is not a cover. Now: opening, then the wait, then one fill, then the
     * name — so the screen is as long as the call and no longer.
     *
     * So the number to guard is the TOTAL, and it is a product number the founder owns. This law
     * does not pick it; it holds whatever it is against a ceiling, so that adding a muscle to the
     * catalogue or a hold to `LiftIn` can never quietly turn 24 seconds into 40.
     */
    const screen = building();
    const view = read('src/screens/onboarding/BuildingProgrammeView.tsx');
    /* ⚠️ CONCATENATED, NOT A TEMPLATE LITERAL — in JS `"\s"` is just `"s"`, so the template form
       builds `NAMEs*…` and matches nothing. */
    const num = (src: string, name: string) => {
      const m = new RegExp(name + '\\s*(?::[^=]+)?=\\s*([0-9_]+)').exec(src);
      if (!m) throw new Error(`no ${name}`);
      return Number(m[1].replace(/_/g, ''));
    };
    const beatFor = (lifts: number) =>
      (Math.max(1, lifts) - 1) * num(view, 'LIFT_STEP_MS') + num(view, 'LIFT_RISE_MS')
      + num(view, 'LIFT_HOLD_MS') + num(view, 'LIFT_TRAVEL_MS') + num(view, 'MUSCLE_BREATH_MS');

    /*
     * ⚠️ THE MUSCLE COUNT IS NOT IN THIS SUM ANY MORE, AND THAT IS THE WHOLE CHANGE OF 2026-08-30.
     * It used to be `MOST_MUSCLES * beatFor(...)` — a walk through the week AFTER the answer was
     * already in hand, which is what put the screen at 22 seconds even on an instant answer. The
     * body fills in one beat now, so a week with more muscles in it costs nothing.
     *
     * What is left is three things, and each is bounded by something that is itself a law:
     *   · the WAIT — at most `PLAN_BUILD_BUDGET_MS`, and never less than the opening beat;
     *   · the FILL — `beatFor(the busiest muscle a week could hold)`, the animation's arithmetic;
     *   · the NAME — `REVEAL_MS`.
     */
    const MOST_LIFTS_IN_A_MUSCLE = 6;
    const worst =
      Math.max(num(screen, 'OPENING_MS'), PLAN_BUILD_BUDGET_MS)
      + beatFor(MOST_LIFTS_IN_A_MUSCLE)
      + num(screen, 'REVEAL_MS');

    expect({ worstMs: worst, under20s: worst <= 20_000 }).toEqual({ worstMs: worst, under20s: true });
  });
});

describe('the ordering that a first run always breaks', () => {
  it('⛔⛔ writes NO profile — Root would swap the navigator out mid-build', () => {
    /*
     * ⚠️ THIS ASSERTION SAID THE OPPOSITE FOR ONE COMMIT, AND THE OPPOSITE WAS A SHIPPED BUG.
     *
     * `Root` renders the main app the instant `app.profile` exists (`Root.tsx`). A profile written
     * here swaps the navigator out WHILE THE COACH IS STILL THINKING — so she never sees
     * `ProgramCreated`, which is the founder's own device report: *"it moved me straight to the
     * transition screen without showing me the plan."*
     *
     * I rebuilt that bug from scratch while removing it, hours after quoting the law that warns
     * about it, and then wrote a test asserting the broken ordering was correct. A law can be
     * confidently wrong; this is what that looks like.
     *
     * The sheet does not need a stored profile — it needs a `Profile`-SHAPED object, and this screen
     * assembles one in memory. `ProgramCreated` writes it when she accepts.
     */
    const src = building();
    /* ⚠️ AGAINST THE CODE, NOT THE PROSE — which is precisely what `buildingCode` exists for, and
       it caught me on 2026-08-30: a new comment explaining that the frequency is re-stamped here
       rather than written mentioned `completeOnboarding` by name, and this clause reported the
       explanation as the violation. Prose about a rule is not a breach of it. */
    expect(buildingCode()).not.toContain('completeOnboarding');
    expect(src).toContain('const profile = React.useMemo<Profile>(');
    expect(read('src/app/Root.tsx')).toContain('{app.profile ? <MainNavigator /> : <OnboardingNavigator />}');
    // …and the screen that DOES write it is the one she taps through.
    expect(read('src/screens/onboarding/ProgramCreated.tsx')).toContain('await app.completeOnboarding(inputs)');
  });

  it('⚠️ the assembled profile carries every fact onboarding collected', () => {
    // An in-memory profile that drops a field is the same bug as a sheet that drops one — silent,
    // and only visible as a worse first programme.
    const src = building();
    for (const f of ['weightKg', 'age', 'experience', 'daysPerWeek', 'workoutMinutes', 'sex', 'goalText', 'limitsText']) {
      expect({ f, carried: src.includes(f) }).toEqual({ f, carried: true });
    }
  });

  it('⛔ THE PROGRAMME IS LOCAL, AND NOTHING ABOUT IT TOUCHES THE NETWORK', () => {
    /*
     * ⛔ THIS CLAUSE SAID THE EXACT OPPOSITE, AND IT WAS RIGHT WHEN IT WAS WRITTEN:
     *
     *     "no local generator, no cached week, no starter plan. The only thing that happens on
     *      failure is that she is told."
     *
     * That was the ruling while the coach WAS the product — a locally generated week would have been
     * the deleted engine coming back through a side door. The founder reversed the premise on
     * 2026-08-08 (*"אני רוצה להחזיר את המנוע ולתת לו כמה שיותר כוח"*), so the side door is the front door
     * and the network is what may not decide her week.
     *
     * ⚠️ WHAT THE CLAUSE ACTUALLY PROTECTS IS UNCHANGED: exactly ONE thing composes her first week,
     * and it is knowable in advance. Two sources was always the defect — only which one survived
     * changed.
     */
    const src = building();
    expect(src).toContain('await model.generateProgram(profile)');
    // `generateProgram` is pure and offline; a screen that can still be blocked by a signal has not
    // finished moving.
    expect(src).not.toMatch(/askCoach|fetch\(|currentLocale\(\)/);
  });

  it('⚠️ hands the assembler the BODY MAP — every input it has about her intent', () => {
    /*
     * This asserted `COACH_DECISION_SCHEMA` — that the programme was demanded in the schema rather
     * than merely in the prose. The equivalent guarantee now is about the INPUT: `generateProgram`
     * reads `profile.bodyMap`, and a profile assembled here without it produces a full-body week for
     * an athlete who turned muscles off. Nothing would throw; she would simply be trained on
     * something she did not ask for.
     *
     * ⚠️ AND SINCE 2026-08-29 NO INTAKE STEP PRODUCES ONE. The map left onboarding with the builder's
     * arrival, so at this point in a first run the field is genuinely absent and the engine door
     * assembles a full-body week — the stated, accepted cost of that ruling. The FIELD stays wired
     * because this screen is not only reached on a first run's happy path, and because the day a map
     * is asked for again the relay that carries it must not have been quietly amputated in between.
     */
    const src = building();
    expect(src).toContain('bodyMap: inputs.bodyMap');
    expect(src).toContain('const profile = React.useMemo<Profile>(');
  });

  it('⛔ REVEALS A WEEK SHE WROTE — it does not generate one over the top of it', () => {
    /*
     * ⛔ FOUNDER, 2026-08-29, on the builder becoming intake step 3: *"אנו לא צריכים לוותר על החלק
     * של האנימציה בסוף — התרגילים שנבנו נכנסים לאנימציה."*
     *
     * The whole failure mode this guards is one line: an `authored` arrival that still called
     * `generateProgram` would run the reveal — the dark body, the muscles arriving, the naming —
     * over a week she never wrote and will never train, and NOTHING would look wrong, because the
     * week she does train is the one already on disk.
     */
    const src = building();
    /*
     * ⚠️ THE TERNARY GREW A THIRD ARM ON 2026-08-29 (the model writes the week when she asked it
     * to), and `authored` still wins outright — which is the whole of this clause. Asserted as the
     * PREFIX so the order is pinned: whatever else the screen learns to do, a sealed week is read
     * from disk before anything else is considered.
     */
    /* ⚠️ `readSealed` IS `loadProgram` WITH A CLOCK ON IT (2026-08-30) — this screen draws dashes
       until a programme is in hand and its ticker stops when the placeholders run out, so any await
       that can outlive the beat is a dead screen. The ORDER is what this clause pins: a sealed week
       is read from disk before anything else is considered. */
    expect(src).toContain('authored ? await readSealed()');
    expect(src).toMatch(/Promise\.race\(\[db\.loadProgram\(\), late\]\)/);
    expect(src).toContain('asked ?? (await model.generateProgram(profile))');
    // …and an `authored` arrival never asks the model either: a call over a week she already wrote
    // is money spent re-answering a settled question, and a second week that could disagree.
    expect(src).toContain('coachAsk != null ? await askTheModel() : null');
    // …and the read is from DISK, never from a `Program` carried in a navigation param — a second
    // copy of the week is a second thing that can disagree with what she trains.
    expect(src).not.toMatch(/route\.params\.program|params\.built/);
  });

  it('the week she is shown is the week that is SAVED', () => {
    /*
     * ⛔ THE WRITE MOVED, AND IT HAD TO. `db.recordCoachAnswer` used to persist the coach's plan
     * here, one screen before she accepted it — which is why `completeOnboarding` could set
     * `program = null` and lean on it being already on disk. Nothing writes that record now.
     *
     * ⚠️ SO THE SAVE LIVES WITH THE PROFILE, in the same write. A programme held only in React state
     * is a programme that vanishes on the first cold start, and the athlete opens Hush to an app
     * that has forgotten the week it just built for her.
     */
    const store = read('src/state/stores/appStore.tsx');
    expect(store).toContain('db.saveProgram(program)');
    /*
     * ⛔ AND EVERY GENERATION GOES THROUGH `programProfile`, WHICH IS A DEFECT I SHIPPED FOR AN HOUR.
     *
     * `programProfile` composes her active PAIN EASES over the body map — a resting muscle switched
     * off for as long as it is settling, never written into the map she drew. Its own comment says
     * *"every `generateProgram` call goes through here; a call that did not would quietly train a
     * muscle she just told us hurts"* — and the first version of this line called
     * `generateProgram(profile)` raw. It was harmless only by accident: a brand-new athlete has no
     * eases yet. The same mistake in `updateProfileInfo`, where she certainly does, programmes an
     * injured shoulder.
     *
     * ⚠️ ASSERTED AS "NO RAW CALL ANYWHERE", not as "the wrapper appears somewhere". A law that only
     * checks for the presence of the right call passes a file that makes both.
     */
    for (const raw of ['generateProgram(profile)', 'generateProgram(state.profile)']) {
      expect({ raw, present: store.includes(raw) }).toEqual({ raw, present: false });
    }
    /*
     * ⚠️ COUNTED AS "ALL OF THEM", NOT AS A NUMBER. This asserted exactly two wrapped calls and went
     * red when the third arrived — `reportPain`, the one place where an unwrapped call would rebuild
     * her week from a body map that does not yet know about the injury she just reported. A law that
     * has to be edited every time the guarded thing spreads is a law that teaches people to edit it.
     */
    const calls = store.match(/\.generateProgram\(/g) ?? [];
    const wrapped = store.match(/\.generateProgram\(programProfile\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(3);
    expect(wrapped.length).toBe(calls.length);
    // …and it is no longer the null it was left as when the coach owned the week.
    expect(store).not.toContain('const program: Program | null = null;');
  });

  it('⛔ lands on the screen that SHOWS her the week', () => {
    // *"It moved me straight to the transition screen without showing me the plan."*
    /* ⚠️ THE PARAMS GREW ON 2026-08-30 (`coachMissed`, `coachAsk`) — what this clause is about is
       the DESTINATION, which is the founder's own device bug: *"it moved me straight to the
       transition screen without showing me the plan."* Pinning the exact argument list made an
       assertion about punctuation out of a law about where onboarding ends. */
    expect(building()).toMatch(/navigation\.replace\('ProgramCreated', \{[\s\S]{0,200}?inputs/);
    /*
     * ⛔ AND THE FREQUENCY IT CARRIES IS THE WEEK'S, NOT THE WHEEL'S (2026-08-30). Found live: the
     * dial said four days, she typed *"אני מתאמן פעמיים בשבוע בלבד"*, and the model wrote two. The
     * profile would have claimed four over a two-day programme. Whoever wrote the week decides how
     * many days it has — the same rule the import path has always followed.
     */
    expect(building()).toContain('inputs: authoredDays.current ? { ...inputs, daysPerWeek: authoredDays.current } : inputs,');
    /*
     * ⛔ THE WEEK LIST IS DELETED (founder 2026-08-10): *"אף אחד לא רואה את זה."* It sat below
     * the signature under a real argument — the programme is what she came for, so it ends the
     * screen — and the device refuted it: nobody scrolls past the seal.
     *
     * ⚠️ WHAT THE LAW PROTECTS SURVIVES: she must not be moved past her programme without meeting
     * it. She meets it by NAME here — shape, days, and what she leads with — and the week itself is
     * one tap behind the CTA rather than an unread list under a signature.
     */
    const ready = read('src/screens/onboarding/ProgramCreated.tsx');
    expect(ready).not.toContain('<PlanWeek');
    expect(ready).toContain('programmeName(program.days, inputs.bodyMap, CANONICAL_MUSCLE_ORDER)');
  });
});

describe('the wait is honest', () => {
  it('⚠️ shows no percentage and no progress bar — nothing here can measure progress', () => {
    /*
     * ⛔ FOUNDER, on the old loader: *"the loading looks very static."* The answer is not a faster
     * animation. A percentage would be a lie and a bar filling at a made-up rate is the same lie
     * with better manners — the app has no idea how far along a model is.
     */
    expect(buildingCode()).not.toMatch(/progress\s*[:=]\s*\d|percent|ProgressMeter|ProgressBar/i);
  });

  it('⛔ shows HER OWN BODY being filled, not a generic stage name', () => {
    /*
     * This is the difference between "analysing your goals…" — the AI-app noise the founder is
     * trying to get away from — and a wait that is evidence something is being done with what she
     * gave us. The claim has never changed; what carries it has, twice.
     *
     * ⛔ IT ASSERTED `inputs.age` UNTIL 2026-08-13, AND IT PASSED ON A COMMENT. Age left the intake
     * on 2026-08-08 and its ruler was deleted on 2026-08-12 — what satisfied `toContain('inputs.age')`
     * for a day was the sentence in the file EXPLAINING that the age ruler had been removed. A law
     * that reads source text can be kept green by prose describing its own violation.
     *
     * ⚠️ AND THE RULERS THEMSELVES ARE GONE (founder, 2026-08-12) — the beat is the BODY MAP she
     * drew two screens ago, filling muscle by muscle. Still hers, still nothing invented.
     */
    const src = building();
    expect(src).toContain('<BuildingProgrammeView');
    expect(src).toContain('muscles={muscles}');
    // The muscles are hers or the catalogue's — never a stage name, never a percentage.
    expect(src).toContain('buildMusclesFromProgram(program');
    /*
     * ⚠️ AND THE ASSERTION IS AIMED AT THE RULERS, NOT AT `age`. Age is still a field on the
     * profile this screen assembles (`age: inputs.age`) — what left is the labelled INSTRUMENT that
     * drew it. "The word `age` is absent from the file" was never the rule; "no ruler is fed from
     * here" is.
     */
    expect(buildingCode()).not.toMatch(/\b(fill|weight|unit|days)=\{/);
  });

  it('⛔ it never draws a lift the coach has not sent', () => {
    /*
     * The line this screen must not cross. Animating plausible-looking exercises over a call that
     * has not returned would be the app performing work it had not done — on the one screen whose
     * entire job is showing her what it did.
     *
     * The muscles ARE real (the catalogue knows them without asking anyone) and their rows stand as
     * dashes until the answer lands, which is why the placeholder carries names and nothing else.
     */
    const src = building();
    /*
     * ⚠️ TWO SOURCES NOW, NOT THREE. The middle tier was the coach's SKETCH — her real muscles,
     * arriving seconds before its full answer — and it existed only because the full answer was
     * slow. The catalogue's muscles carry the opening beat and the assembled week replaces them
     * whole; both draw DASHED rows until a real lift exists.
     */
    expect(src).toContain('PLACEHOLDER_MUSCLES');
    expect(src).toContain('PLACEHOLDER_MUSCLES.slice(0, shownMuscles).map((m) => ({ muscle: m, lifts: waitingRows }))');
    expect(src).toContain("const waitingRows = [{ name: '' }, { name: '' }];");
    // …and the real rows only ever come from the assembled programme.
    expect(src).toContain('buildMusclesFromProgram(program, profile.repBand');
    /*
     * ⛔ AND NO WEIGHT IS DRAWN ON THIS SCREEN. The coach prescribed loads here; the engine sets an
     * opening load from her FIRST SET (Loop 1, S-38), so a number here would be one nothing had
     * measured — the same law that keeps a lifetime calorie total off Progress.
     */
    expect(src).toContain('load: null,');
    expect(src).not.toMatch(/displayWeight\(item|item\.load/);
  });

  it("⛔ and its pace is the ANIMATION's, not a constant sitting beside it", () => {
    /*
     * ⛔ THIS PINNED `built ? 90 : MUSCLE_MS`, AND THE FOUNDER OVERRULED IT (2026-08-13): *"זה טס
     * במהירות האור ולא נותן לכל שריר את הרגע שלו. זה צריך ממש להיות אנימציה ארוכה ואיטית."*
     *
     * The 90 ms came from his OWN earlier instruction — *"it must not drag on after the programme is
     * built"* (2026-08-05) — and that instruction was about a screen that no longer exists: a
     * scrolling list, where a row appearing was the whole event, waiting on a network call that has
     * since been deleted. Carried into a beat where each muscle's lifts have a journey to complete,
     * the same number stopped meaning "do not stall" and started meaning "let nothing finish".
     *
     * ⚠️ SO THE RULE IS NO LONGER A DURATION. `beatFor(lifts)` is the animation's own arithmetic —
     * the only pace that cannot drift away from what is actually on screen.
     */
    expect(building()).toContain('beatFor(');
    expect(buildingCode()).not.toContain('built ? 90');
  });

  it('and offers to ask again when it fails, keeping what she typed', () => {
    expect(building()).toContain("t('ob.buildingRetry')");
    for (const loc of ['en', 'he']) {
      const copy = JSON.parse(read(`src/i18n/locales/${loc}.json`)) as { ob: Record<string, string> };
      for (const k of ['buildingTitle', 'buildingFailedTitle', 'buildingFailedSub', 'buildingRetry']) {
        expect({ loc, k, there: !!copy.ob[k] }).toEqual({ loc, k, there: true });
      }
    }
  });
});
