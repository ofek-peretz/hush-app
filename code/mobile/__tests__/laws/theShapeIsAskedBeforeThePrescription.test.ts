/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE FIRST CALL NAMES THE WEEK; THE SECOND FILLS IT — and neither may do the other's job.
 *
 * ⛔ FOUNDER, 2026-08-05: *"the plan build takes far too long… I don't think the right answer is to
 * lower the AI's intelligence during the build, because that is not the right fix."*
 *
 * Measured: a live three-turn intake ran 14.8 s, 20.8 s and 99.5 s, and `low` thinking on the
 * programme call was measured writing a ONE-EXERCISE week. So the intelligence stays and the call
 * splits: a shape at `low` (seconds), then the prescription at full strength, handed the shape.
 *
 * ⚠️ THE INVARIANT THAT MAKES IT SAFE: **call A may never state a load.** Two answers about what she
 * lifts, with nothing to say which one the app drew, is the single way this design could hurt her —
 * and it would hurt her silently, on the first screen of her first programme.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

// 

import { readFileSync } from 'fs';
import { join } from 'path';
import { COACH_SHAPE_SCHEMA, parseCoachShape } from '@/domain/coachPlan';

describe('⛔ the shape call cannot prescribe', () => {
  it('its schema has no room for a load, a rep range or an exercise', () => {
    /*
     * Structural, not a promise: the fields simply do not exist, and the schema is closed.
     *
     * ⚠️ WALKED AS PROPERTY NAMES, not searched as text. The first cut string-matched the JSON and
     * failed on `items` — which is JSON-Schema's own keyword for an array's element type, not a
     * field the coach can fill. A law that cannot tell a keyword from a field is a law that will be
     * silenced the next time it fires.
     */
    const names = new Set<string>();
    const walk = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      const o = node as Record<string, unknown>;
      if (o.properties && typeof o.properties === 'object') {
        for (const k of Object.keys(o.properties as object)) names.add(k);
      }
      for (const v of Object.values(o)) walk(v);
    };
    walk(COACH_SHAPE_SCHEMA);
    expect([...names].sort()).toEqual(['days', 'muscles', 'name', 'title', 'why']);
    for (const forbidden of ['load', 'reps', 'sets', 'ex', 'blocks', 'rounds', 'sessions']) {
      expect({ forbidden, present: names.has(forbidden) }).toEqual({ forbidden, present: false });
    }
    expect(COACH_SHAPE_SCHEMA.additionalProperties).toBe(false);
  });

  it('and the ask says so in words too', () => {
    const prompt = readFileSync(join(__dirname, '../../src/domain/coachPrompt.ts'), 'utf8');
    const shape = prompt.slice(prompt.indexOf("case 'first_shape':"), prompt.indexOf("case 'first_fill':"));
    expect(shape).toContain('NO LOADS, NO REP RANGES, NO EXERCISES');
    /*
     * ⚠️ AND IT RESOLVES THE PREAMBLE'S CONTRADICTION. The cacheable half describes "sessions",
     * "notes" and "brief" on every call — it is byte-identical by design and will not be branched —
     * but this turn is answered against a schema that has none of them. Structured output makes
     * emitting one impossible; being told at length about fields it cannot fill is still a
     * contradiction in its instructions, and this project has measured what those do to an answer.
     */
    expect(shape).toContain('belong to the NEXT turn');
  });
});

describe('⛔ a shape that does not arrive costs the screen, never the programme', () => {
  it('the build falls back to the single call it replaced', () => {
    const src = readFileSync(join(__dirname, '../../src/screens/onboarding/BuildingProgramme.tsx'), 'utf8');
    expect(src).toContain(": { kind: 'first_programme' },");
    // …and only the SECOND call decides whether she has a programme.
    expect(src).toContain('if (!reply.ok) { setFailed(true); return; }');
    expect(src).not.toMatch(/shapeReply[\s\S]{0,120}setFailed/);
  });

  it('⚠️ a reply with no title is refused — the title is the only thing this call alone can give', () => {
    expect(parseCoachShape('{"days":[]}')).toBeNull();
    expect(parseCoachShape('{"title":"   "}')).toBeNull();
    expect(parseCoachShape('not json')).toBeNull();
  });

  it('⚠️ …but a missing week is tolerated, because the catalogue can carry the wait', () => {
    expect(parseCoachShape('{"title":"Four Days"}')).toEqual({ title: 'Four Days', days: [] });
  });

  it('reads the days it was given, and drops a malformed one rather than the reply', () => {
    const out = parseCoachShape(
      '{"title":"T","days":[{"name":"Upper A","muscles":["Chest","Back"]},{"muscles":["Quads"]},{"name":"Lower A","muscles":[]}]}',
    );
    expect(out!.days).toEqual([
      { name: 'Upper A', muscles: ['Chest', 'Back'] },
      { name: 'Lower A', muscles: [] },
    ]);
  });
});

describe('⛔ and the coach cannot invent a muscle onto her screen', () => {
  it('the shape’s muscles are filtered against the catalogue before they are drawn', () => {
    /*
     * Call A returns muscle names as free text, and the view prints them through
     * `t('muscle.<name>')` — i18next returns the KEY when it does not know one. A coach that wrote
     * "Pecs" would have put **"muscle.Pecs" on the first screen of her programme**, and nothing
     * anywhere would have failed.
     */
    const src = readFileSync(join(__dirname, '../../src/screens/onboarding/BuildingProgramme.tsx'), 'utf8');
    expect(src).toContain('.filter((m) => CANONICAL_MUSCLE_ORDER.includes(m))');
    // ⚠️ The ticker counts the SAME filtered list, or the fill stalls on muscles never drawn.
    const ticker = src.slice(src.indexOf('const sketchedCount'), src.indexOf('const sketchedCount') + 260);
    expect(ticker).toContain('CANONICAL_MUSCLE_ORDER.includes(m)');
  });
});
