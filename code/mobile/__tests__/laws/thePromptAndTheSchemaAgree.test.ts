/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE PROMPT AND THE SCHEMA DESCRIBE THE SAME ANSWER.
 *
 * ⛔ FOUNDER, 2026-08-05: *"go over our prompt… I'm sure there are things in it that are no longer
 * relevant at all."*
 *
 * He was right, and what the pass found was not bloat — it was the prompt and the app disagreeing.
 * Three of them were live: the coach was told she had answered SIX questions including "minutes",
 * twenty lines above the rule saying nothing asks her for minutes; a stray "never ask a seventh"
 * from when the count was six; and `day` — a field in the schema that the entire week board runs
 * on — was never mentioned to the coach at all.
 *
 * ── WHY THIS IS MECHANICAL AND NOT A READ-THROUGH ───────────────────────────────────────────────
 * Every one of those survived being read. They are invisible to a person going down the file
 * because each half is correct on its own; only the PAIR is wrong. The schema is the contract and
 * the prose is what makes the contract usable, so the two are checked against each other:
 *
 *   · every field the coach can send is explained somewhere in the prose, or it is a field nobody
 *     told it what to do with (that was `day`);
 *   · every field the prose names exists in the schema, or it is an instruction to fill something
 *     that cannot be sent.
 *
 * ⚠️ This cannot see a WRONG explanation, only a missing one. The contradictions above needed a
 * human. What it can do is make sure the next field added to either half is added to both.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { preamble } from '@/domain/coachPrompt';
import { COACH_DECISION_SCHEMA, COACH_PLAN_SCHEMA, COACH_SHAPE_SCHEMA } from '@/domain/coachPlan';

/** Every property name a schema lets the coach send, at any depth. */
function fields(schema: unknown, out = new Set<string>()): Set<string> {
  if (!schema || typeof schema !== 'object') return out;
  const o = schema as Record<string, unknown>;
  if (o.properties && typeof o.properties === 'object') {
    for (const k of Object.keys(o.properties as object)) out.add(k);
  }
  for (const v of Object.values(o)) fields(v, out);
  return out;
}

const text = preamble();

describe('⛔ every field the coach can send is explained to it', () => {
  it('the decision schema', () => {
    /*
     * ⚠️ EXEMPT, and each for a reason rather than a shrug:
     *   `v`      — ours, stamped at parse; the coach never sends it (see COACH_PLAN_SCHEMA's note).
     *   `ex`/`to`/`do`/`n` — the `today` verbs, spelled out as a table of six literal shapes.
     *   `muscle`/`severity`/`area` — inside `hurts`, explained as "name the MUSCLE … and how bad".
     *   `name`   — a session's name; the shape ask and the fill ask both speak of naming days.
     */
    const EXPLAINED_BY_TABLE = new Set(['v', 'ex', 'to', 'do', 'n', 'muscle', 'severity', 'area', 'name']);
    const missing = [...fields(COACH_DECISION_SCHEMA)]
      .filter((f) => !EXPLAINED_BY_TABLE.has(f))
      /* ⚠️ Quoted OR bare: "A session is blocks; a block is items done rounds times" explains both
         without quoting either, and demanding the quotes would be the test dictating prose style
         rather than checking that the field was described. */
      .filter((f) => !text.includes(`"${f}"`) && !new RegExp(`\\b${f}\\b`).test(text));
    expect(missing.sort()).toEqual([]);
  });

  it('⛔ …including `day`, which the whole week board runs on', () => {
    // The one this test was written for. It was in the schema, parsed, stored, drawn and draggable
    // — and the coach had never been told the field existed.
    expect(fields(COACH_PLAN_SCHEMA).has('day')).toBe(true);
    expect(text).toContain('"day" on a session puts it on a WEEKDAY');
  });

  it('the shape schema — the first of the two calls', () => {
    // Its own fields are described in its own ask rather than the preamble, so this asserts the
    // pair exists at all: a schema with a field nobody mentions is the `day` shape again.
    for (const f of ['title', 'why', 'days', 'muscles']) {
      expect({ f, present: fields(COACH_SHAPE_SCHEMA).has(f) }).toEqual({ f, present: true });
    }
  });
});

describe('⛔ and the prompt does not contradict itself about her sheet', () => {
  it('it never claims minutes is one of her answers', () => {
    /*
     * The contradiction that shipped: "sex, age, weightKg, experience, daysPerWeek, minutes. Those
     * six are the only questions this app asks" — above a rule saying nothing asks her for minutes.
     * Since 2026-08-05 nothing does: the coach sets the budget, never under 45.
     */
    expect(text).toMatch(/Those five are the only questions this app\s+asks/);
    expect(text).not.toMatch(/Those six are the only questions/);
    expect(text).toMatch(/"minutes" is a BUDGET and it is YOURS/);
  });

  it('⚠️ and the count it states matches the list it states', () => {
    // "…asked her five things …and will never ask another." A stray "seventh" outlived the six.
    expect(text).toMatch(/asked her five things/);
    expect(text).not.toMatch(/never ask a seventh/);
  });
});

describe('⛔ the second call is told to send back what the first one named', () => {
  it('the fill ask asks for the title', () => {
    /*
     * The sketch's title is what the build screen ends on and what Today calls her programme for as
     * long as she is on it — and the FILL turn is the one whose answer gets stored. Without this
     * the coach has no reason to repeat a title it has already given, the plan is saved with none,
     * and the name survives exactly as long as the reveal animation.
     */
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../../src/domain/coachPrompt.ts'),
      'utf8',
    ) as string;
    const fill = src.slice(src.indexOf("case 'first_fill':"), src.indexOf("case 'intake':"));
    expect(fill).toContain('SEND "title" AND "why" BACK');
  });
});
