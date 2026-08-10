// @ts-nocheck
// 
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

  it('⛔ ASKS NOBODY — the week is assembled, not requested', () => {
    /*
     * ⛔ FOUNDER, 2026-08-10, closing the arc this clause has been tracking since 2026-08-05.
     *
     * It used to assert TWO calls: a `low`-thinking shape then a full-thinking fill, split because
     * *"the plan build takes far too long — this is the least SPOTIFY thing there is"*. The split
     * made a ninety-second wait survivable. Removing the call removes the wait.
     *
     * ⚠️ AND THE ASSERTION IS ON THE ABSENCE, not merely on the presence of the assembler. A screen
     * that generates locally AND still calls the coach is the worse of both: it pays for a network
     * round trip whose answer nothing reads, and it fails offline for a programme it already has.
     */
    const src = building();
    expect(src).toContain('await model.generateProgram(profile)');
    for (const gone of ['askCoach', 'coachRequest', 'coachFacts', 'COACH_DECISION_SCHEMA', 'COACH_SHAPE_SCHEMA', 'first_programme']) {
      expect({ gone, present: src.includes(gone) }).toEqual({ gone, present: false });
    }
    // The guard against a double build when the effect re-runs — two programmes racing to be stored
    // is still a week nobody chose, network or no network.
    expect(src).toContain('if (started.current) return;');
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

  it('⚠️ hands the assembler the BODY MAP — the only input that shapes the week', () => {
    /*
     * This asserted `COACH_DECISION_SCHEMA` — that the programme was demanded in the schema rather
     * than merely in the prose. The equivalent guarantee now is about the INPUT: `generateProgram`
     * reads `profile.bodyMap`, and a profile assembled here without it produces a full-body week for
     * an athlete who turned muscles off. Nothing would throw; she would simply be trained on
     * something she did not ask for.
     */
    const src = building();
    expect(src).toContain('bodyMap');
    expect(src).toContain('const profile = React.useMemo<Profile>(');
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
    expect(store).toContain('await live.generateProgram(profile)');
    expect(store).toContain('db.saveProgram(program)');
    // …and it is no longer the null it was left as when the coach owned the week.
    expect(store).not.toContain('const program: Program | null = null;');
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
