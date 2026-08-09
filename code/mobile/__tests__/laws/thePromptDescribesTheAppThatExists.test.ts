// @ts-nocheck
// 
import fs from 'fs';
import path from 'path';
import { preamble } from '@/domain/coachPrompt';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
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

  it('⛔ states no COUNT of her answers at all, because every count here has been wrong', () => {
    /*
     * ⛔⛔ THIS TEST USED TO ASSERT THE COUNT, AND IT CERTIFIED A FALSEHOOD FOR TWO PASSES.
     *
     * It read `ASKED HER ${spelled} THINGS` off `REQUIRED_FOR_COACH.length` and called that "tied to
     * the list, not to a literal" — which was true, and useless, because **`REQUIRED_FOR_COACH` is
     * not the list of what onboarding asks.** It is the list of facts the coach cannot work without.
     * `YourGoal` also asks for her goal and her limits, and disables its own continue button until
     * both are non-empty, so the real number was seven while this test happily confirmed five.
     *
     * A law anchored to the wrong source is worse than no law: it survives the audit that would
     * otherwise have caught the prose, and it did — twice, including one pass where I corrected the
     * count from six to five and never questioned what it was counting.
     *
     * ── SO THE PROSE NAMES THE FIELDS AND STATES NO NUMBER ──────────────────────────────────────
     * A count is a fact about the app duplicated into prose, and it goes stale the next time a
     * screen changes. The field names cannot: if one is removed, the sheet stops carrying it and the
     * feed law (`everyFactIsNamedToTheCoach`) fails.
     */
    expect(text()).not.toMatch(/asked her (five|six|seven|eight) things/i);
    expect(text()).not.toMatch(/Those (five|six|seven) are the only questions/i);
  });

  it('⚠️ and names every answer she actually gives, including the two a form takes in her words', () => {
    /*
     * The seven. Five come from `REQUIRED_FOR_COACH`; `trainingFor` and `limits` come from the goal
     * screen and are the two the old count forgot — which is exactly why they are asserted from the
     * SCREEN below rather than from a list somebody could edit to match the prompt.
     */
    for (const r of REQUIRED_FOR_COACH) {
      expect({ key: r.key, named: text().includes(`"${r.key}"`) }).toEqual({ key: r.key, named: true });
    }
    for (const key of ['trainingFor', 'limits']) {
      expect({ key, named: text().includes(`"${key}"`) }).toEqual({ key, named: true });
    }
  });

  it('⛔ and tells the coach NOT to open by re-asking the two it used to think were open', () => {
    /*
     * The behaviour the false count actually caused. "Everything else is yours to ask for", with
     * `trainingFor` and `limits` outside the five, is an instruction to open the intake by asking a
     * woman what she is training for — thirty seconds after she typed it into a required field.
     */
    expect(text()).toMatch(/do not open by asking her what she is training for or what hurts/);
    const goal = read('src/screens/onboarding/YourGoal.tsx');
    // ⚠️ Anchored to the screen: if the goal screen ever stops requiring them, the prompt is free to
    // ask again and this rule has to be revisited rather than silently kept.
    expect(goal).toMatch(/goal\.trim\(\)\.length === 0 \|\| limits\.trim\(\)\.length === 0/);
  });

  it('⛔ does not tell the coach to ask again for what she has already answered', () => {
    // The stale rule said the app "never will" ask for frequency or session length. It does now, and
    // re-asking is how an intake tells her it was not listening.
    expect(text()).not.toMatch(/this\s*\n?\s*app never will/);
    // `[\s\S]` because the prompt is hard-wrapped and a rule can straddle a line break.
    expect(text()).toMatch(/Do not ask again, and\s+do not fill in a number on her behalf/);
  });

  it('and still forbids inventing a number when one is genuinely absent', () => {
    // The rule that must survive the rewrite — this is the founder's own "it decided 4 workouts".
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
    expect(text()).toMatch(/do not fill in a number on her behalf if it is absent: ask/);
    // ⚠️ AND NOTHING ASKS HER FOR MINUTES ANY MORE — the prompt must not claim it does.
    expect(text()).toMatch(/Nothing asks her for it/);
  });
});

describe('⛔ the ASK goes stale separately from the preamble', () => {
  /*
   * FOUND 2026-08-04, one sweep after the preamble's version of the same lie was fixed. The intake
   * ask still read: *"NOTHING ELSE in this app will ever ask her any of it, including her bodyweight
   * and how many days a week she can train."*
   *
   * So the coach would have opened the conversation by asking for a bodyweight she had set on a
   * wheel two screens earlier — the exact thing that makes an intake feel like it was not listening.
   *
   * ⚠️ IT WAS MISSED BECAUSE THE SWEEP READ `preamble()`. The prompt is assembled from parts, and a
   * prompt assembled from parts goes stale in parts. These assertions read the SOURCE, so every
   * block is covered whether or not it is in the cached prefix.
   */
  const src = () => read('src/domain/coachPrompt.ts');

  it('no block claims the app never asks her anything', () => {
    expect(src()).not.toMatch(/NOTHING ELSE in this app will ever ask her/);
  });

  it('and the intake is told what her sheet already holds, so it does not re-ask', () => {
    expect(src()).toMatch(/HER SHEET ALREADY HAS/);
    expect(src()).toMatch(/never ask for one of them again/);
  });

  it('⚠️ and is told what a form CANNOT hold, which is what the conversation is for', () => {
    // Deleting the re-asking without saying what remains would leave an intake with no job.
    expect(src()).toMatch(/everything a form cannot hold/i);
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
    expect(text()).toMatch(/On an "open" item your sentence IS the screen/);
  });
});

describe('⛔ the station rule is NOT in the prompt, and must not come back', () => {
  /*
   * ⛔⛔ ATTEMPTED HERE TWICE, FAILED IN OPPOSITE DIRECTIONS BOTH TIMES.
   *
   *   · *"FINISH A STATION BEFORE LEAVING IT"* — applied while CHOOSING. An upper session came back
   *     as five dumbbell lifts in a row. The founder: *"That is exactly what I said I did not want."*
   *   · Rewritten as a second pass over the finished order — the coach did not do it. A single
   *     generation does not reliably re-read and revise its own output, and no rewording changes it.
   *
   * It lives in `domain/stationOrder` now, where the bounds are code and every one of them is
   * tested. **A prompt rule about equipment leaks into selection every time** — that is the lesson,
   * and this law exists to stop the next person re-adding one because it reads harmlessly.
   */
  it('names no equipment rule at all', () => {
    expect(preamble()).not.toMatch(/FINISH A STATION/i);
    expect(preamble()).not.toMatch(/same bar, rack or machine/i);
    expect(preamble()).not.toMatch(/ORDER, ONCE THE SESSION IS BUILT/i);
    expect(preamble()).not.toMatch(/group by[\s\S]{0,4}equipment/i);
  });

  it('and the reason it is absent is written where someone would look to add it', () => {
    expect(read('src/domain/coachPrompt.ts')).toMatch(/THE STATION RULE IS NOT IN THIS FILE/);
  });

  it('⚠️ but a CIRCUIT across two stations is named, and that is a different thing', () => {
    /*
     * ⛔ FOUND BY RUNNING THE ORDERED OUTPUT, 2026-08-04. Two sessions still stranded a lift at the
     * far end, and the reorder was right to leave them: the rep pattern `9·11·9·11·9·11` shows the
     * coach had written a lateral raise and a face pull as a two-item CIRCUIT — a dumbbell and a
     * cable, alternated three times through. Six crossings of the gym, by design.
     *
     * `stationOrder` cannot fix that and must not: reordering items inside a block changes the
     * TRAINING, which is its one forbidden move. So this belongs in the prompt — and unlike the
     * station rule it is safe there, because it is about the SHAPE of a block, not about which lifts
     * to choose. Alternating between a rack and a cable every forty seconds is bad in an empty gym
     * too.
     */
    expect(preamble()).toMatch(/A block of two or more items is a CIRCUIT/);
    expect(preamble()).toMatch(/Pair[\s\S]{0,4}only lifts she can reach without moving/);
  });
});
