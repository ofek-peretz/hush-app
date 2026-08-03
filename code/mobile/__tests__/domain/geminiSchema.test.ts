import { geminiSchema } from '@/domain/geminiSchema';
import { COACH_PLAN_SCHEMA, parseCoachPlan, COACH_PLAN_VERSION } from '@/domain/coachPlan';

/**
 * Our schema is JSON Schema; Gemini's `responseSchema` is a subset of OpenAPI 3.0 — a different
 * thing wearing similar clothes.
 *
 * The failure this guards is the quiet one. A schema Google REJECTS is the good case: it breaks on
 * the first call and you fix it. A schema Google half-understands returns something plausible that
 * `parseCoachPlan` then refuses, and the athlete is told her update is waiting — for ever, with
 * nothing to show for it but a rising count of unreadable replies.
 */

const translated = () => geminiSchema(COACH_PLAN_SCHEMA);

/**
 * Every SCHEMA node in the translated tree.
 *
 * `properties` is a map keyed by FIELD NAME, not a schema node — walking into it as one makes every
 * field name look like a schema keyword. Descend into its values, never into the map itself.
 */
function nodes(schema: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (schema == null || typeof schema !== 'object' || Array.isArray(schema)) return out;
  const n = schema as Record<string, unknown>;
  out.push(n);
  if (n.items) nodes(n.items, out);
  if (n.properties && typeof n.properties === 'object') {
    for (const child of Object.values(n.properties as Record<string, unknown>)) nodes(child, out);
  }
  return out;
}

describe('the three constructs that do not survive the trip', () => {
  it('drops `additionalProperties` everywhere — Gemini has no equivalent and rejects it', () => {
    expect(JSON.stringify(COACH_PLAN_SCHEMA)).toContain('additionalProperties');
    expect(JSON.stringify(translated())).not.toContain('additionalProperties');
  });

  it('turns a union type into a single type plus `nullable`', () => {
    // `["number","null"]` is how our schema says "a load, or nothing, because this is a bodyweight
    // lift". Losing the null half puts a fabricated weight on every bodyweight prescription.
    const load = geminiSchema({ type: ['number', 'null'] });
    expect(load).toEqual({ type: 'NUMBER', nullable: true });
    // And a plain type does NOT acquire a nullable flag it never had.
    expect(geminiSchema({ type: 'number' })).toEqual({ type: 'NUMBER' });
  });

  it('uppercases every type name', () => {
    const types = nodes(translated())
      .map((n) => n.type)
      .filter((t): t is string => typeof t === 'string');
    expect(types.length).toBeGreaterThan(5);
    expect(types.every((t) => t === t.toUpperCase())).toBe(true);
    expect(new Set(types)).toEqual(new Set(['OBJECT', 'ARRAY', 'STRING', 'INTEGER', 'NUMBER']));
  });
});

describe('the constraints that must survive', () => {
  it('keeps every required field, at every level', () => {
    const t = translated();
    // `say` is required and `sessions` is not — every turn speaks, only some decide.
    expect(t.required).toEqual(['say']);
    const session = ((t.properties as Record<string, Record<string, unknown>>).sessions.items) as Record<string, unknown>;
    expect(session.required).toEqual(['name', 'blocks']);
    const block = ((session.properties as Record<string, Record<string, unknown>>).blocks.items) as Record<string, unknown>;
    expect(block.required).toEqual(['rounds', 'items']);
  });

  it('keeps the four shapes as an enum, WITH the format Gemini needs to honour it', () => {
    // Without `format: "enum"` Gemini treats it as a free string and the constraint is silently
    // ignored — the model may answer with a fifth shape the parse will then reject.
    const kind = nodes(translated()).find((n) => Array.isArray(n.enum) && (n.enum as string[]).includes('reps'))!;
    expect([...(kind.enum as string[])].sort()).toEqual(['distance', 'open', 'reps', 'time']);
    expect(kind.format).toBe('enum');
    expect(kind.type).toBe('STRING');
  });

  it('keeps the weekday enum', () => {
    const day = nodes(translated()).find((n) => Array.isArray(n.enum) && (n.enum as string[]).includes('sun'))!;
    expect((day.enum as string[]).length).toBe(7);
    expect(day.format).toBe('enum');
  });

  it('keeps a rep band pinned to exactly two numbers', () => {
    const band = nodes(translated()).find((n) => n.minItems === 2)!;
    expect({ min: band.minItems, max: band.maxItems, type: band.type }).toEqual({ min: 2, max: 2, type: 'ARRAY' });
  });

  it('states the field order, so the reply is deterministic in shape', () => {
    const t = translated();
    /*
     * `learned` is last on purpose: it is the rarest field on the object — she states her bodyweight
     * once — and the ordering is what the model fills in, in order.
     *
     * ⚠️ `next` sits SECOND, and the position is the point rather than an accident of where it was
     * declared. It is written immediately after the sentence she reads and BEFORE `sessions`, so
     * the model commits to which of its two moves it is making while the programme is still ahead
     * of it. Answering "built" and then finding nothing left to write is the whole failure this
     * field exists to catch.
     */
    expect(t.propertyOrdering).toEqual(['say', 'next', 'hurts', 'sessions', 'notes', 'learned', 'brief']);
  });
});

describe('it invents nothing', () => {
  it('carries no key Gemini does not document', () => {
    const allowed = new Set([
      'type', 'nullable', 'description', 'enum', 'format',
      'items', 'minItems', 'maxItems', 'properties', 'propertyOrdering', 'required',
    ]);
    const stray = new Set<string>();
    for (const n of nodes(translated())) for (const k of Object.keys(n)) if (!allowed.has(k)) stray.add(k);
    expect([...stray]).toEqual([]);
  });

  it('drops an unrecognised construct rather than passing it through', () => {
    // Google rejects unknown fields, and a schema that fails to load takes structured output with
    // it — which is the one guarantee the transport is buying.
    expect(geminiSchema({ type: 'string', pattern: '^x$', minLength: 2, $comment: 'no' }))
      .toEqual({ type: 'STRING' });
  });

  it('does not emulate `additionalProperties` with something that only looks like it', () => {
    // Compared as KEYS, not as substrings — `"not"` lives inside `"notes"`, which is a field of
    // ours and entirely legitimate.
    const keys = new Set(nodes(translated()).flatMap((n) => Object.keys(n)));
    for (const fake of ['unevaluatedProperties', 'patternProperties', 'not', 'allOf', 'oneOf', 'anyOf', '$ref']) {
      expect({ fake, present: keys.has(fake) }).toEqual({ fake, present: false });
    }
  });
});

describe('the shape it promises is the shape the parse accepts', () => {
  it('round-trips: a reply built to the translated schema is readable', () => {
    // The two must not drift. A schema that permits what the parse refuses is an athlete told her
    // update is waiting, for ever.
    const reply = JSON.stringify({
      say: 'x',
      sessions: [{
        name: 'Upper A',
        day: 'tue',
        blocks: [
          { rounds: 4, restS: 120, items: [{ kind: 'reps', ex: 'bb_bench_press', reps: [8, 12], load: 32.5, say: 'Last one near failure.' }] },
          { rounds: 1, items: [{ kind: 'distance', ex: 'run_outdoor', metres: 5000 }] },
          { rounds: 3, restS: 45, items: [{ kind: 'time', ex: 'plank', seconds: 45 }] },
          { rounds: 1, items: [{ kind: 'open', ex: 'mobility' }] },
        ],
      }],
      notes: [{ ex: 'bb_bench_press', say: 'Up — you cleared 12 twice.' }],
    });
    const r = parseCoachPlan(reply);
    expect(r.ok).toBe(true);
  });

  it('keeps a bodyweight load nullable all the way through', () => {
    const bodyweight = JSON.stringify({
      say: 'x',
      sessions: [{ name: 'D', blocks: [{ rounds: 3, items: [{ kind: 'reps', ex: 'pull_up', reps: [5, 8], load: null }] }] }],
    });
    expect(parseCoachPlan(bodyweight).ok).toBe(true);
    // …and the translated schema is what permits that null.
    const load = nodes(translated()).find((n) => n.type === 'NUMBER' && n.nullable === true);
    expect(load).toBeDefined();
  });
});
