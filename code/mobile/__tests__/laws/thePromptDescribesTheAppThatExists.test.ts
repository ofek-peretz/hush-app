import { preamble } from '@/domain/coachPrompt';
import { coachMovements } from '@/domain/coachFacts';
import { REQUIRED_FOR_COACH } from '@/domain/coachRequirements';
import { MOVEMENTS } from '@/data/movements';

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE PROMPT DESCRIBES THE APP THAT EXISTS — NOT THE ONE IT DESCRIBED LAST WEEK.
 *
 * ⛔ FOUND IN THE 2026-08-03 AUDIT, at the founder's instruction to check the prompt itself. In FOUR
 * places it was describing a product that had changed underneath it:
 *
 *   · *"Nothing else in this app will ever ask her a question"* — onboarding now asks six things.
 *   · *"'daysPerWeek' and 'minutes' … this app never will [ask]"* — `YourWeek` asks for both, so the
 *     coach would have re-asked her for two answers she had just given on a form.
 *   · *"'learned' … you are the only part of the app that hears her"* — the form hears her first.
 *   · *"Indoors — treadmill, rower, bike, stair climber, pool"* — the rower, bike, stair climber and
 *     pool had just been removed from the movements the coach may choose.
 *
 * ── WHY THIS IS ITS OWN LAW ─────────────────────────────────────────────────────────────────────
 * A stale prompt cannot fail a test, throw an error, or look wrong in a gallery. It produces a coach
 * that behaves correctly against a description of the world — which is the most expensive kind of
 * wrong, because everything looks fine and the athlete is the one who notices.
 *
 * So the checks below tie the PROSE to things the code can actually count.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const text = () => preamble();

describe('the prompt does not name what the coach may not choose', () => {
  it('⛔ never names a movement that is filtered out of the offer', () => {
    /*
     * The rower, the bike, the erg, the stair climber, the pool. Naming one in prose is worse than
     * naming it in the catalogue: the catalogue is a list the coach checks, prose is what it BELIEVES
     * about the world, and it will reach for a believed-in machine when the list disappoints it.
     */
    const offered = new Set(coachMovements().map((m) => m.id));
    const withheld = MOVEMENTS.filter((m) => !offered.has(m.id));
    expect(withheld.length).toBeGreaterThan(0); // the filter is live, or this test proves nothing
    const prose = text().toLowerCase();
    // Matched on the WORDS a coach would use, not our ids — "row_erg" was never the risk.
    for (const word of ['rower', 'stair climber', 'elliptical', 'jump rope']) {
      expect({ word, named: prose.includes(word) }).toEqual({ word, named: false });
    }
  });

  it('and every movement it DOES offer is in the list it sends', () => {
    for (const kept of ['run_outdoor', 'walk_outdoor', 'run_treadmill']) {
      expect({ id: kept, listed: text().includes(kept) }).toEqual({ id: kept, listed: true });
    }
  });
});

describe('the prompt tells the truth about who asks her things', () => {
  it('⛔ does not claim the app never asks her a question', () => {
    // It asks six. The claim was true when the coach was the entire intake.
    expect(text()).not.toMatch(/Nothing else in this app will ever ask her a question/);
  });

  it('names the number onboarding actually collects', () => {
    /*
     * ⚠️ TIED TO THE LIST, NOT TO A LITERAL. Add a seventh requirement and this fails, which is the
     * only way a sentence in prose can be kept honest by a test.
     */
    const spelled = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT'][REQUIRED_FOR_COACH.length];
    expect(text().toUpperCase()).toContain(`ASKED HER ${spelled} THINGS`);
  });

  it('⛔ does not tell the coach to ask again for what she has already answered', () => {
    // The stale rule said the app "never will" ask for frequency or session length. It does now, and
    // re-asking is how an intake tells her it was not listening.
    expect(text()).not.toMatch(/this\s*\n?\s*app never will/);
    // `[\s\S]` because the prompt is hard-wrapped and a rule can straddle a line break.
    expect(text()).toMatch(/do not ask her again[\s\S]{0,4}for something she has already told the app/);
  });

  it('and still forbids inventing a number when one is genuinely absent', () => {
    // The rule that must survive the rewrite — this is the founder's own "it decided 4 workouts".
    expect(text()).toMatch(/do not fill in a number on her behalf/);
  });
});

describe('the prompt tells the truth about where its words land', () => {
  it('⚠️ describes the item `say` as living behind a control, not on the stage', () => {
    /*
     * It moved on 2026-08-02, on the founder's own proposal — a KEY POINTS control instead of text
     * printed onto the training screen. The prompt still said "on the screen for a hold, a run or a
     * distance", which is where it used to be drawn.
     */
    expect(text()).toContain('behind the KEY POINTS control');
  });

  it('and says what an `open` item is, since there the sentence IS the screen', () => {
    expect(text()).toMatch(/On an "open" item it IS the screen/);
  });
});
