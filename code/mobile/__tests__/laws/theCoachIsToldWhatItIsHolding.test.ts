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
    expect(text()).toMatch(/"units" is how she reads weights,\s*\n?not how you write them/);
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
      const onWire = r.key === 'workoutMinutes' ? 'minutes' : r.key;
      expect({ key: r.key, named: names(onWire) }).toEqual({ key: r.key, named: true });
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
    expect(text()).toMatch(/experience" is the one to weigh hardest on the FIRST programme/);
  });

  it('⚠️ says these six are ALL the app asks, so the coach knows what is left to it', () => {
    expect(text()).toMatch(/the only questions this app asks/);
  });
});
