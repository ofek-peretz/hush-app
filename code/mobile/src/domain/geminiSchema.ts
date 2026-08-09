/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * GEMINI SCHEMA — translating our schema into the one Google will accept.
 *
 * `COACH_PLAN_SCHEMA` is JSON Schema. Gemini's `responseSchema` is a SUBSET OF OPENAPI 3.0, which
 * is a different thing wearing similar clothes. Three of our constructs do not survive the trip,
 * and each fails differently:
 *
 *   · `additionalProperties: false` — not part of the subset. **Rejected outright**, which is the
 *     good case: you find out on the first call.
 *   · `type: ["number", "null"]` — a union type array. Gemini spells this `nullable: true` on a
 *     single type. Sent as-is it is **not understood**, and a load that should be allowed to be
 *     null on a bodyweight lift becomes a field the model must fill.
 *   · lowercase type names — Gemini's are uppercase (`OBJECT`, `STRING`, `INTEGER`).
 *
 * ── WHY THIS IS WORTH A FILE AND A TEST ─────────────────────────────────────────────────────────
 * Because structured output is the thing keeping the app from crashing on a bad reply, and a schema
 * that is silently half-understood is worse than one that is rejected: the model returns something
 * plausible, `parseCoachPlan` refuses it, and the athlete is told the update is waiting — for ever,
 * with nothing in the logs but a rising count of unreadable responses.
 *
 * ── WHAT IS NOT TRANSLATED, ON PURPOSE ──────────────────────────────────────────────────────────
 * Nothing is invented to fill a gap. `additionalProperties: false` is DROPPED rather than emulated,
 * because Gemini has no equivalent and pretending otherwise would be a promise the transport cannot
 * keep. The guarantee it was buying — that the coach cannot invent a field — is enforced where it
 * always really was: `parseCoachPlan` reads only the fields it knows and ignores the rest.
 *
 * Pure and I/O-free. Knows nothing about the transport, the key, or the request.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

// 


/** The JSON-Schema shape we author. Loose on purpose — this reads a literal, it does not validate one. */
type JsonSchema = Record<string, unknown>;

/** Gemini's type names are uppercase, and `integer` is its own type rather than a `number` format. */
const TYPE: Record<string, string> = {
  object: 'OBJECT',
  array: 'ARRAY',
  string: 'STRING',
  number: 'NUMBER',
  integer: 'INTEGER',
  boolean: 'BOOLEAN',
};

/**
 * Read a JSON-Schema `type` — which may be a string or an array of strings — into Gemini's pair of
 * a single type plus a nullable flag.
 *
 * `["number", "null"]` is how our schema says "a load, or nothing, because this is a bodyweight
 * lift". Losing the null half would make every bodyweight prescription carry a fabricated weight.
 */
function typeAndNullable(raw: unknown): { type?: string; nullable?: true } {
  if (typeof raw === 'string') {
    return TYPE[raw] ? { type: TYPE[raw] } : {};
  }
  if (Array.isArray(raw)) {
    const nullable = raw.includes('null');
    const real = raw.find((t) => typeof t === 'string' && t !== 'null') as string | undefined;
    return {
      ...(real && TYPE[real] ? { type: TYPE[real] } : {}),
      ...(nullable ? { nullable: true as const } : {}),
    };
  }
  return {};
}

/**
 * Translate one node, depth-first.
 *
 * Only the keys Gemini documents are carried. An unrecognised key is DROPPED rather than passed
 * through — Google rejects unknown fields, and a schema that fails to load takes structured output
 * with it, which is the one guarantee we are buying.
 */
function node(schema: JsonSchema): Record<string, unknown> {
  const out: Record<string, unknown> = { ...typeAndNullable(schema.type) };

  if (typeof schema.description === 'string') out.description = schema.description;

  if (Array.isArray(schema.enum)) {
    out.enum = [...schema.enum];
    // Gemini requires `format: "enum"` alongside a string enum, or the constraint is ignored and
    // the model is free to answer with any string at all.
    if (out.type === 'STRING') out.format = 'enum';
  }

  if (schema.items && typeof schema.items === 'object') {
    out.items = node(schema.items as JsonSchema);
  }
  if (typeof schema.minItems === 'number') out.minItems = schema.minItems;
  if (typeof schema.maxItems === 'number') out.maxItems = schema.maxItems;

  if (schema.properties && typeof schema.properties === 'object') {
    const props = schema.properties as Record<string, JsonSchema>;
    const keys = Object.keys(props);
    out.properties = Object.fromEntries(keys.map((k) => [k, node(props[k])]));
    // Gemini honours the order fields are asked for. Stating it explicitly keeps the model's output
    // deterministic in shape, which is also what keeps the request bytes stable for caching.
    out.propertyOrdering = keys;
  }
  if (Array.isArray(schema.required) && schema.required.length > 0) {
    out.required = [...schema.required];
  }

  // `additionalProperties` is deliberately not carried — see the file header.
  return out;
}

/**
 * Our schema, in the dialect Google accepts.
 *
 * The guarantee it buys is the one that matters: the reply is JSON of this shape, so the app cannot
 * be handed prose where it expects a programme. Everything `parseCoachPlan` checks it still checks —
 * a schema is a promise about SHAPE, never about whether the decision inside it is a good one.
 */
export function geminiSchema(schema: JsonSchema): Record<string, unknown> {
  return node(schema);
}
