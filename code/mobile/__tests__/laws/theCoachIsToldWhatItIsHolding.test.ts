// @ts-nocheck
// 
import { preamble } from '@/domain/coachPrompt';
import { REQUIRED_FOR_COACH } from '@/domain/coachRequirements';

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * A FACT ON THE SHEET THE PROMPT NEVER NAMES IS A FACT THE COACH CANNOT USE.
 *
 * ⛔ FOUND 2026-08-04, checking the founder's question — *"make sure the coach actually uses all the
 * information from onboarding."* It did not, and could not:
 *
 *   `age`, `experience`, `sex` and `units` were on the athlete sheet and **named nowhere in the
 *   prompt.** `experience` is a three-value enum — `beginner | intermediate | advanced` — and it is
 *   the single biggest input to a STARTING load, the one number week one has no measurement for.
 *   An unexplained enum is a token the model has to guess the meaning of.
 *
 * ── ⛔⛔ AND THE ONE THAT WAS DANGEROUS ─────────────────────────────────────────────────────────
 * The prompt never said what unit "load" is in. `displayWeight(kg, units)` multiplies by 2.2046 for
 * an athlete reading pounds — and `units: 'lb'` was ON THE SHEET, so the coach could see she was
 * American and had every reason to write a pound number. **A 135 lb bench would have reached her as
 * 135 kg, which is 297 lb.**
 *
 * Nothing would have failed. The parse accepts it, the equipment grid snaps it, the screen draws it.
 * The first thing that notices is an athlete under a barbell.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const text = () => preamble();
/** Named as a WORD — `age` inside "language" and "message" is not the coach being told anything. */
const names = (w: string) => new RegExp('(^|[^A-Za-z])' + w + '($|[^A-Za-z])').test(text());

describe('the unit is stated, because getting it wrong loads a bar', () => {
  it('⛔ says every weight is kilograms', () => {
    expect(text()).toMatch(/EVERY WEIGHT YOU WRITE IS IN KILOGRAMS/);
  });

  it('⛔ and says `units` is for DISPLAY, so a pound athlete is not a reason to write pounds', () => {
    // The trap is specific: the sheet tells the coach she reads lb. Without this line that is an
    // instruction to write lb.
    expect(text()).toMatch(/that field is only how the app DISPLAYS them/);
    // ⚠️ Newline-tolerant: the clause wraps wherever the paragraph above it happens to end, and
    // the 2026-08-05 pass moved it. The CLAIM is the sentence, never where the line breaks.
    expect(text()).toMatch(/"units" is how she\s+reads weights, not how you write them/);
  });

  it('and the rule sits with the other things that are NOT the coach\'s to choose', () => {
    /*
     * Placement is the point. This is not coaching advice — it is the wire. It belongs beside "only
     * ids from these lists" and "the equipment's step", where the prompt already explains that
     * getting one of them wrong means the answer never reaches her at all.
     */
    const wire = text().slice(text().indexOf('THE ONLY THINGS THAT ARE NOT YOURS TO CHOOSE'));
    expect(wire).toContain('EVERY WEIGHT YOU WRITE IS IN KILOGRAMS');
    expect(wire.indexOf('KILOGRAMS')).toBeLessThan(wire.indexOf('ONLY ids from the two lists'));
  });
});

describe('every fact onboarding collects is named to the coach', () => {
  it('⛔ names each one as a word', () => {
    /*
     * ⚠️ TIED TO `REQUIRED_FOR_COACH`, so adding a seventh question forces the prompt to be told
     * about it. That is the whole guarantee: collecting a fact and shipping it is not the same as
     * the coach knowing what it is.
     */
    for (const r of REQUIRED_FOR_COACH) {
      // ⚠️ The `minutes` rename went with `workoutMinutes` when it left the list — see the sister
      // assertion in `theCoachIsNeverAskedWithoutWhatItNeeds`.
      expect({ key: r.key, named: names(r.key) }).toEqual({ key: r.key, named: true });
    }
  });

  it('⚠️ explains `experience`, which is an enum and not a number', () => {
    // "intermediate" means nothing on its own. The three values are spelled out so the coach is
    // reading a scale rather than guessing at a label.
    for (const v of ['beginner', 'intermediate', 'advanced']) {
      expect({ v, spelled: text().includes(v) }).toEqual({ v, spelled: true });
    }
  });

  it('and says which of them matters most where there is no record yet', () => {
    // Week one is the only prescription with nothing behind it, and this is what stands in for the
    // measurement that does not exist.
    expect(text()).toMatch(/Weigh "experience" hardest on the FIRST programme/);
  });

  it('⚠️ says the sheet is ALL the app asks, so the coach knows what is left to it', () => {
    /*
     * ⛔ THIS USED TO ASSERT "the only questions this app asks", which sat immediately after a list
     * of five — and the app asks seven. The CLAIM the coach needs is unchanged and is the reason
     * this assertion exists: whatever is on her sheet is the end of what the app will ever ask, so
     * anything else it needs, it has to ask for itself. What changed is that the sentence no longer
     * pretends to enumerate. `[\s\S]` because the prompt is hard-wrapped.
     */
    expect(text()).toMatch(/it is the whole of what this app\s+asks/);
    expect(text()).toMatch(/Everything else is yours to ask for/);
  });
});
