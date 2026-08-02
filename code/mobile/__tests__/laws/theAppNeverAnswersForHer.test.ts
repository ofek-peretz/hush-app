import { coachFacts } from '@/domain/coachFacts';
import { preamble } from '@/domain/coachPrompt';
import type { Profile } from '@/data/local/models';

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * A NUMBER NOBODY ASKED HER FOR MAY NOT APPEAR ON A SHEET OF THINGS SHE DID.
 *
 * ⛔ FOUND ON THE DEVICE BY THE FOUNDER, 2026-08-02, and it was the difference between a coach and
 * a form:
 *
 *   > *"He decides by himself that he'll do 4 workouts for me, for some reason, without asking me
 *   > how many workouts I want."*
 *
 * `ConnectHealth` handed the intake `daysPerWeek: 4` as a placeholder, with a comment promising the
 * coach would replace it — *"so the placeholder survives exactly one exchange"*. It did not survive
 * one exchange. It went straight onto `coachFacts`, under a heading that says everything below it
 * is MEASURED rather than reported, and the preamble's own bound reads **"write exactly that many
 * sessions"**. So the coach wrote four, on the first reply, and never asked. `minutes` did the same
 * thing through `?? 60`.
 *
 * Both defaults were invisible in every test, because a default always produces a plausible answer.
 * It is only wrong in the one place it matters: **the app was making the decision and letting the
 * coach appear to have made it**, which is the exact thing the whole AI move exists to stop.
 *
 * ── THE CLASS, NOT THE INSTANCE ─────────────────────────────────────────────────────────────────
 * The sheet is the coach's only view of her. Absent has to mean "nobody knows", because the coach
 * has no other way to find out that a question is still open — and a question it does not know is
 * open is a question it will never ask.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Her, at the moment the intake starts: nothing has been asked yet. */
const beforeSheHasSaidAnything: Profile = {
  sex: 'female',
  units: 'kg',
  goal: 'build_muscle',
  daysPerWeek: 0,
  healthConnected: false,
};

const sheetFor = (profile: Profile) =>
  coachFacts({ profile, plan: null, history: [], language: 'he' }).athlete;

describe('the sheet says what is known and nothing else', () => {
  it('⚠️ carries no days-per-week until she has said one', () => {
    expect(sheetFor(beforeSheHasSaidAnything).daysPerWeek).toBeUndefined();
  });

  it('⚠️ carries no session length until she has said one', () => {
    // `?? 60` was the same bug with a friendlier face: every athlete on earth "had" an hour.
    expect(sheetFor(beforeSheHasSaidAnything).minutes).toBeUndefined();
  });

  it('carries them once she has, unchanged', () => {
    const said = sheetFor({ ...beforeSheHasSaidAnything, daysPerWeek: 3, workoutMinutes: 45 });
    expect({ days: said.daysPerWeek, minutes: said.minutes }).toEqual({ days: 3, minutes: 45 });
  });

  it('⚠️ tells the coach what an absent number MEANS, or absence is just a gap it fills itself', () => {
    /*
     * The omission alone is not the fix. A model handed a sheet with no `daysPerWeek`, under a rule
     * that says "write exactly that many sessions", will pick a number rather than write nothing —
     * and it would be right to. The bound has to name the case.
     */
    const text = preamble();
    expect(text).toMatch(/ABSENT MEANS NOBODY HAS ASKED HER/);
    expect(text).toContain('do not fill in a number on her behalf');
  });

  it('the placeholder that started it cannot come back unnoticed', () => {
    // A future `daysPerWeek: 4` in onboarding would be silently plausible again. This is the one
    // place that would go red.
    const stillPlaceheld = sheetFor({ ...beforeSheHasSaidAnything, daysPerWeek: 4 });
    expect(stillPlaceheld.daysPerWeek).toBe(4);
    // …which is why 0, and not 4, is what onboarding hands over. The screen's own value:
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', 'src', 'screens', 'onboarding', 'ConnectHealth.tsx'),
      'utf8',
    ) as string;
    expect(src).toContain('daysPerWeek: 0,');
  });
});
