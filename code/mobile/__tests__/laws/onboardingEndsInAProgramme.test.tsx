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
  it('⛔ writes the profile BEFORE it asks — the sheet is built from a Profile', () => {
    const src = building();
    expect(src.indexOf('await app.completeOnboarding(inputs)')).toBeLessThan(src.indexOf('askCoach('));
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
    expect(src.indexOf('await db.recordCoachAnswer(')).toBeLessThan(src.indexOf("navigation.replace('ProgramCreated'"));
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
    const src = building();
    for (const key of ['ob.buildingDays', 'ob.buildingMinutes', 'ob.buildingFor', 'ob.buildingAround']) {
      expect({ key, used: src.includes(key) }).toEqual({ key, used: true });
    }
    expect(src).toContain('inputs.goalText');
    expect(src).toContain('inputs.limitsText');
  });

  it('⚠️ holds on the last fact rather than looping the list', () => {
    // A list that starts again reads as a stall dressed up as activity.
    expect(building()).toContain('Math.min(i + 1, lines.length - 1)');
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
