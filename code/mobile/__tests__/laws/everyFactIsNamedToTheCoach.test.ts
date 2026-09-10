/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * A FIELD ON THE WIRE THAT THE PROMPT NEVER NAMES IS A FIELD THE COACH IS GUESSING AT.
 *
 * ⛔ FOUNDER, 2026-08-05: *"go over the prompt again and check whether there are things in it that
 * are no longer relevant and are just taking up space."*
 *
 * The pass found the opposite problem as well. **Seven fields were being SENT to the coach and named
 * nowhere in the entire prompt file** — not the preamble, not any ask:
 *
 *   `resting`, `swappedByHer`, `keepsByHer`, `ranOwn`, `emphasis`, `startWeightKg`, and `band`.
 *
 * The middle four are the most coaching-relevant signals on the sheet, because they are the athlete
 * acting on her own programme rather than describing it — the lift she swapped out herself, the one
 * she kept when offered a change, the run she went and did unprompted. They arrived as unlabelled
 * JSON beside twenty documented fields.
 *
 * ⚠️ `resting` was the worst of them, and it is the exact shape of the `day` bug from the previous
 * pass: the injury paragraph made a PROMISE about it — *"the app tells you when a window is up"* —
 * while never once giving the field's name. A promise about a field nobody can find is not a
 * promise, and a coach cannot ask a clarifying question about JSON.
 *
 * ── WHY THE EXISTING LAW COULD NOT SEE THIS ─────────────────────────────────────────────────────
 * `thePromptAndTheSchemaAgree` checks the direction the coach ANSWERS in: every field of the
 * response schema is explained. Nothing checked the direction it LISTENS in. That is the recurring
 * shape in this codebase — a law that tests the drawing and never its feed — and this is the feed.
 *
 * ── WHAT IS EXEMPT, AND WHY EACH ────────────────────────────────────────────────────────────────
 * Exemptions are named one at a time, never by pattern, so that adding a field cannot quietly
 * inherit someone else's excuse.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

// 

import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Every field the fact sheet can put on the wire, read off the DECLARED shape rather than off one
 * sample — a field that only appears for an injured athlete is exactly the one a fixture misses.
 */
function wireFields(): string[] {
  const src = readFileSync(join(__dirname, '../../src/domain/coachFacts.ts'), 'utf8');
  const start = src.indexOf('export interface CoachFacts');
  expect(start).toBeGreaterThan(-1);
  // The interface ends at the next top-level export.
  const body = src.slice(start, src.indexOf('\nexport ', start + 10));
  // Strip comments first, or a field named only inside a deletion note counts as live.
  const code = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  return [...new Set([...code.matchAll(/^\s+([a-zA-Z][a-zA-Z0-9_]*)\??:/gm)].map((m) => m[1]))];
}

/** The whole prompt as the coach receives it: the cached preamble plus every per-turn ask. */
function promptText(): string {
  const src = readFileSync(join(__dirname, '../../src/domain/coachPrompt.ts'), 'utf8');
  // The asks are template literals in this file; the preamble is assembled from its constants. The
  // source IS the text, minus the block comments that explain it to a reader rather than to Gemini.
  return src.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('⛔ every fact the coach is sent is named in the prompt', () => {
  it('names each one', () => {
    /*
     * ⚠️ EXEMPT — each with its own reason:
     *   `v`        — our schema stamp; the coach neither reads nor writes it.
     *   `language` — deliberately NOT in the cacheable preamble. It is stated in the per-turn ask
     *                (`languageName`), because one athlete's language in the shared prefix would
     *                cold-cache every other athlete. It is named, just not where this test reads.
     *   `at`       — the timestamp inside `session`; the ask says when the session happened.
     *   `work`     — the non-lift half of a finished session, covered by the movements list.
     */
    const EXEMPT = new Set(['v', 'language', 'at', 'work']);
    const text = promptText();
    const missing = wireFields()
      .filter((f) => !EXEMPT.has(f))
      .filter((f) => !new RegExp('(^|[^A-Za-z])' + f + '($|[^A-Za-z])').test(text));
    expect(missing.sort()).toEqual([]);
  });

  it('⛔ …including the ones whose names are ordinary English', () => {
    /*
     * ⚠️ THE TEST ABOVE HAS A KNOWN HOLE, and this is the patch for it. It matches the field name as
     * a WORD, so a field called `trained` passes on the sentence "she has never trained with you" —
     * prose about the athlete, not a description of the field. `trained` was in exactly that state:
     * on the wire, falsely green, explained nowhere.
     *
     * Any field whose name is also a normal English word has to be named IN QUOTES, the way the
     * prompt names every other field. The four `…ByHer`/`ranOwn`/`resting` entries are here for a
     * different reason — they are what this law was written for, and a future trim of the prose
     * should have to delete them deliberately rather than lose them by accident.
     */
    const text = promptText();
    for (const f of ['swappedByHer', 'keepsByHer', 'ranOwn', 'resting', 'trained', 'endedEarly']) {
      expect({ f, named: text.includes(`"${f}"`) }).toEqual({ f, named: true });
    }
  });

  it('⛔ and "resting" only ever carries windows that are still standing', () => {
    /*
     * ⛔ THE PROSE PROMISED THIS BEFORE THE CODE DID, 2026-08-05, and I wrote the promise.
     *
     * `coachFacts` mapped `profile.painEases` straight onto the wire with no filter, so a shoulder
     * rested for four days in March was still arriving in August under a field named `resting`. The
     * coach had to notice that `untilMs` was in the past — and nothing told it to — or it would go
     * on planning around an injury that had healed months earlier.
     *
     * `activeEases` is the filter the rest of the app already applies to this same list; the sheet
     * was the one consumer that skipped it.
     */
    const { coachFacts } = require('@/domain/coachFacts');
    const now = 1_000_000;
    const f = coachFacts({
      profile: {
        id: 'p1', sex: 'female', units: 'kg', weightKg: 62, daysPerWeek: 3,
        painEases: [
          { muscle: 'Shoulders', severity: 'twinge', fromMs: 1, untilMs: now - 1 }, // healed
          { muscle: 'Knees', severity: 'sharp', fromMs: 1, untilMs: now + 50_000 }, // live
        ],
      },
      plan: null, history: [], nowMs: now,
    });
    expect(f.athlete.resting).toEqual([{ muscle: 'Knees', severity: 'sharp', untilMs: now + 50_000 }]);
  });

  it('⚠️ and an entirely healed athlete has no "resting" key at all, not an empty one', () => {
    // The prompt tells the coach that an absent `resting` means nothing is being rested, so an empty
    // array would be a third state it was never told about.
    const { coachFacts } = require('@/domain/coachFacts');
    const now = 1_000_000;
    const f = coachFacts({
      profile: {
        id: 'p1', sex: 'female', units: 'kg', weightKg: 62, daysPerWeek: 3,
        painEases: [{ muscle: 'Shoulders', severity: 'twinge', fromMs: 1, untilMs: now - 1 }],
      },
      plan: null, history: [], nowMs: now,
    });
    expect('resting' in f.athlete).toBe(false);
  });

  it('⚠️ and the injury promise names the field it is promising about', () => {
    /*
     * The prose said the app would tell the coach when a rest window was up. It does — via
     * `resting`, whose name appeared nowhere. Either half alone reads as correct, which is why this
     * survived a read-through.
     */
    const text = promptText();
    const hurt = text.slice(text.indexOf('WHEN SHE IS HURT'), text.indexOf('REASON FROM WHAT'));
    expect(hurt).toContain('"resting"');
    expect(hurt).not.toContain('The app tells you when a window is up');
  });
});

describe('⛔ and nothing is sent that is not about HER', () => {
  it('the rep band is not on her sheet, because it was never her answer', () => {
    /*
     * `profile.repBand` is the literal '8-10', written once at sign-up, identical for every athlete
     * who has ever installed the app. Beside her age and her bodyweight it read as a preference she
     * had expressed. A coach honouring it was honouring a constant.
     */
    const facts = readFileSync(join(__dirname, '../../src/domain/coachFacts.ts'), 'utf8');
    const code = facts.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code).not.toMatch(/\bband:\s*profile\.repBand\b/);
    expect(code).not.toMatch(/bandByMuscle:/);
  });

  it('⛔ nor the body map, because there is no screen left on which she draws one', () => {
    /*
     * ⛔ FOUND IN THE HERMETIC PASS, 2026-08-05 — by reading the assembled preamble rather than the
     * diff, which is the only way this class shows up.
     *
     * I had just WRITTEN the sentence explaining `emphasis` ("a muscle she asked for more of, in the
     * weekly update") and it was false in both halves. `MuscleStance` is `'off' | 'normal' |
     * 'emphasis'`, so the map can also carry a muscle she wants NOT trained — and more to the point
     * the only live writer is `WeeklyUpdate`, which writes `'normal'` when she brings a rested muscle
     * back. Nothing in the shipping app can set `'emphasis'` or `'off'` at all.
     *
     * ⚠️ So I fixed a field being unexplained by explaining it wrongly — the same defect, one layer
     * further in. It is off the wire instead.
     */
    const facts = readFileSync(join(__dirname, '../../src/domain/coachFacts.ts'), 'utf8');
    const code = facts.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code).not.toMatch(/emphasis:/);

    // Anchored to the cause: a screen that lets her set a stance makes this decision wrong again.
    const writers = readFileSync(
      join(__dirname, '../../src/screens/weekly/WeeklyUpdate.tsx'),
      'utf8',
    );
    expect(writers).toContain("[m]: 'normal' as const");
  });

  it('⚠️ and the hard-coded default is still what it was, so this stays true for the right reason', () => {
    /*
     * If onboarding ever starts ASKING her for a band, this assertion fails and whoever changed it
     * has to come back here and decide to send it — which is the outcome we want. The test is
     * anchored to the cause, not to the symptom.
     */
    const ob = readFileSync(
      join(__dirname, '../../src/screens/onboarding/BuildingProgramme.tsx'),
      'utf8',
    );
    // The literal became the shared constant on 2026-09-10 (8-12, measured) — still one default for
    // everybody, still never asked, so the fact stays unsent for the same reason.
    expect(ob).toContain('repBand: DEFAULT_REP_BAND');
    expect(ob).not.toMatch(/repBand:\s*inputs\./);
  });
});

describe('⛔ the prompt does not misdescribe what onboarding asks', () => {
  it('it never claims the app asked her five things', () => {
    /*
     * It asks seven. `YourGoal` disables its own continue button until BOTH her goal and her limits
     * are non-empty, so `trainingFor` and `limits` are answers she has already given — and the
     * prompt was telling the coach they were open questions.
     */
    const text = promptText();
    expect(text).not.toMatch(/asked her five things/);
    expect(text).not.toMatch(/Those five are the only questions/);
    expect(text).toMatch(/it is the whole of what this app asks/);
    // And the coach is told not to re-ask them, which is the behaviour the false count caused.
    expect(text).toMatch(/do not open by asking her what she is training for/);
  });

  it('⛔ …and the rule was REVISITED when the screen it rested on was deleted', () => {
    /*
     * ⛔ THIS TEST USED TO READ `YourGoal.tsx` AND ASSERT THAT IT REQUIRED BOTH FIELDS. Its sibling
     * in `thePromptDescribesTheAppThatExists` carried the note that mattered: *"if the goal screen
     * ever stops requiring them, the prompt is free to ask again and this rule has to be revisited
     * rather than silently kept."*
     *
     * On 2026-08-12 the screen was deleted — the body map replaced it, and measuring who READ her
     * prose found that the ENGINE never has. So both fields are now OPTIONAL: absent for an athlete
     * who came through onboarding, present only where an imported programme carried them.
     *
     * "Do not ask, she already told you" is therefore only true CONDITIONALLY, and a flat instruction
     * would have left the coach unable to learn her goal at all. The prose says so, and this asserts
     * the conditional rather than a screen that no longer exists.
     */
    const text = promptText();
    expect(text).toMatch(/PRESENT ONLY WHEN SHE HAS GIVEN THEM/);
    expect(text).toMatch(/Where a field is ABSENT she has never been asked/);
    // …and the fields really are optional on the type she is built from.
    const models = readFileSync(join(__dirname, '../../src/data/local/models.ts'), 'utf8');
    expect(models).toMatch(/goalText\?: string;/);
    expect(models).toMatch(/limitsText\?: string;/);
  });
});

describe('⛔ the catalogue does not restate the muscle as a movement pattern', () => {
  it('`capability` is off the wire', () => {
    /*
     * 1,797 characters — 9% of the preamble — of a field that is a pure function of `muscle` (all
     * ten muscles map to exactly one capability, no ambiguity) and that reads as false to anyone who
     * trains: `bb_curl` as a horizontal_pull, `lateral_raise` as a vertical_push, every ab exercise
     * as hip_dominant. They are the old assembler's slot buckets, and the assembler chooses nothing
     * any more.
     */
    const src = readFileSync(join(__dirname, '../../src/domain/coachPrompt.ts'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/e\.capability/);
    expect(code).toContain('THE LIFTS YOU MAY PRESCRIBE — id | muscle | equipment');
  });

  it('⚠️ and it is still redundant, so the removal keeps being correct', () => {
    // Anchored to the cause: if a muscle ever carries two capabilities, the column would start
    // carrying information and this decision would deserve a second look.
    const { EXERCISES } = require('@/data/exercises');
    const byMuscle = new Map<string, Set<string>>();
    for (const e of EXERCISES as { muscle: string; capability: string }[]) {
      if (!byMuscle.has(e.muscle)) byMuscle.set(e.muscle, new Set());
      byMuscle.get(e.muscle)!.add(e.capability);
    }
    const ambiguous = [...byMuscle].filter(([, caps]) => caps.size > 1).map(([m]) => m);
    expect(ambiguous).toEqual([]);
  });
});
