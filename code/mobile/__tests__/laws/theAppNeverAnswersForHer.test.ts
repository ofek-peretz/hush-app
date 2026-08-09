// @ts-nocheck
// 
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
     * ⚠️ THE WORDING CHANGED ON 2026-08-03 AND THE RULE DID NOT. It read "ABSENT MEANS NOBODY HAS
     * ASKED HER — this app never will", which was true until `YourWeek` started asking for frequency
     * and session length. The claim had to go; what may never go is that an absent number is never
     * one the coach invents.
     */
    /*
     * The omission alone is not the fix. A model handed a sheet with no `daysPerWeek`, under a rule
     * that says "write exactly that many sessions", will pick a number rather than write nothing —
     * and it would be right to. The bound has to name the case.
     */
    const text = preamble();
    /*
     * ⛔ THE WORDING MOVED WHEN SESSION LENGTH LEFT THE FORM (2026-08-05). The rule used to cover
     * "daysPerWeek" AND "minutes" in one sentence — both were her answers, both absent meant "she
     * was never asked". Then the founder removed the length question entirely, so absent became the
     * state of EVERY new athlete and telling the coach to ask would have made it open by asking the
     * one thing he had just decided she should not be asked.
     *
     * ⚠️ THE CLAIM IS UNCHANGED FOR EVERYTHING SHE STILL ANSWERS: the app never fills in a number
     * on her behalf. What changed is that MINUTES is no longer one of her answers — it is the
     * coach's budget, with his 45-minute floor.
     */
    expect(text).toContain('do not fill in a number on her behalf if it is absent: ask');
    // …and the one number that is NOT hers carries its floor instead.
    expect(text).toMatch(/absent means you choose, never under 45/);
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
    /*
     * ⛔ THE PLACEHOLDER IS STILL FORBIDDEN — but the field is no longer always empty (2026-08-03).
     *
     * The founder caught `daysPerWeek: 4` hard-coded here and watched the coach decide his week
     * unasked. The fix then was to send nothing. Hours later he put frequency on the list of things
     * onboarding must COLLECT, and `YourWeek` now asks her.
     *
     * Those are the same ruling: what he objected to was the APP INVENTING a number. `0` survives as
     * the fallback precisely so `coachFacts` omits the field rather than stating a figure nobody
     * gave — so this assertion still watches for a literal creeping back in.
     */
    expect(src).toContain('daysPerWeek: daysPerWeekAsked ?? 0,');
    expect(src).not.toMatch(/daysPerWeek:\s*[1-9]/);
  });
});
