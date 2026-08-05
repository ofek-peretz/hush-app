import fs from 'fs';
import path from 'path';

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
    expect(read('src/screens/onboarding/ConnectHealth.tsx')).toContain("navigation.navigate('BuildingProgramme'");
  });

  it('asks the coach exactly once, with an ask that has no conversation in it', () => {
    expect(building()).toContain("ask: { kind: 'first_programme' }");
    // The guard against a double build when the effect re-runs — she must never be billed twice, and
    // two programmes racing to be stored is a week nobody chose.
    expect(building()).toContain('if (started.current) return;');
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
    expect(src).not.toContain('completeOnboarding');
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

  it('⛔ invents NO programme when the coach cannot be reached', () => {
    /*
     * The whole ruling in one assertion: no local generator, no cached week, no "starter plan". The
     * only thing that happens on failure is that she is told.
     */
    const src = building();
    expect(src).toContain('if (!reply.ok) { setFailed(true); return; }');
    expect(src).toContain("if (!parsed.ok || !parsed.answer.plan) { setFailed(true); return; }");
    expect(src).not.toMatch(/generateProgram|buildPlan|fallbackPlan|starterWeek/);
  });

  it('⚠️ requires the programme in the SCHEMA, not merely in the prose', () => {
    // She is looking at a screen that promised her a week. "sessions IS REQUIRED" in words is what
    // the post-session call once ignored while describing a change it had not attached.
    expect(building()).toContain('COACH_DECISION_SCHEMA');
  });

  it('stores what came back before it moves on', () => {
    // `ProgramCreated` reads the plan from the db. An un-awaited write here is the exact bug the
    // founder hit as "here is your plan" over an empty screen.
    const src = building();
    expect(src).toContain('await db.recordCoachAnswer(');
    /*
     * ⚠️ ASSERTED AS A DEPENDENCY, NOT AS A SOURCE POSITION (2026-08-05). This compared the two
     * offsets in the file, which held while both lived in `build()` — and the navigation moved into
     * an effect when the simulation's reveal was gated on the fill finishing, so the LINE order
     * flipped while the ORDER OF EVENTS did not.
     *
     * The chain is: the write is awaited → `setBuilt` → the rows fill → `revealed` → navigate.
     * Every link is checked, so the position in the file is free to change again.
     */
    expect(src).toMatch(/await db\.recordCoachAnswer\([\s\S]{0,600}setBuilt\(/);
    expect(src).toMatch(/if \(!revealed\) return;[\s\S]{0,400}navigation\.replace\('ProgramCreated'/);
    expect(src).toContain('const filled = !!built && shownMuscles >= built.muscles.length;');
  });

  it('⛔ lands on the screen that SHOWS her the week', () => {
    // *"It moved me straight to the transition screen without showing me the plan."*
    expect(building()).toContain("navigation.replace('ProgramCreated', { inputs })");
    expect(read('src/screens/onboarding/ProgramCreated.tsx')).toContain('<PlanWeek');
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

  it('⛔ shows HER OWN ANSWERS being considered, not a generic stage name', () => {
    /*
     * This is the difference between "analysing your goals…" — which is the AI-app noise the founder
     * is trying to get away from — and a wait that is evidence something is being done with what she
     * typed. Every line is a value she gave two screens ago.
     */
    /*
     * ⛔ THE FOUR FADING SENTENCES BECAME A SIMULATION (founder 2026-08-05). The claim is
     * unchanged and is now made in numbers rather than in prose: the screen opens on HER three
     * answers — days, bodyweight, age — each ruler travelling from zero to the figure she set.
     */
    const src = building();
    expect(src).toContain('days={inputs.daysPerWeek}');
    expect(src).toContain('inputs.weightKg');
    expect(src).toContain('inputs.age');
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
    expect(src).toContain('PLACEHOLDER_MUSCLES');
    expect(src).toMatch(/PLACEHOLDER_MUSCLES\.slice\(0, shownMuscles\)\.map\(\(m\) => \(\{ muscle: m, lifts: \[\{ name: '' \}, \{ name: '' \}\] \}\)\)/);
    // …and the real rows only ever come from the parsed plan.
    expect(src).toContain('muscles: buildMuscles(plan, inputs.units)');
  });

  it('⚠ and it does not drag on once the programme is built', () => {
    // His own instruction. The fill is 90 ms a row once the answer is in hand, whatever is left.
    expect(building()).toContain('built ? 90 : MUSCLE_MS');
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
