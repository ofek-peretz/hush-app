/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE BAKE-OFF'S OTHER PROVIDERS (2026-09-17) — Claude and GPT, behind `env.PROBE` only.
 *
 * Founder: *"אני רוצה מקסימום איכות + מינימום זמן בנייה. המודל שייתן לנו את המענה הטוב ביותר עבור
 * המטרה הזאת הוא המנצח."* To compare models honestly they must answer the SAME call: the app's own
 * blocks and schema, arriving through this Worker's own auth and validation. This file turns that
 * call into a Claude or an OpenAI request and hands back the Worker's own reply shape
 * (`{ text, finishReason, usage, model }`), so the app-side reader cannot tell who answered.
 *
 * ⛔ REACHABLE ONLY WHEN `PROBE === '1'` — set with `--var` on a preview version, never in
 * `[vars]`. Production never loads a byte of this path.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export interface ProbeCall {
  model: string;
  /** `low` … `max`, or `default` for the provider's own. */
  effort: string;
  text: string;
  schema: Record<string, unknown>;
  /** The call's photographs (import read), forwarded AFTER the text exactly as the Gemini path orders them. */
  images?: { mime: string; data: string }[];
  /** The structured-output name OpenAI requires. Generic unless the caller names it. */
  schemaName?: string;
}

export interface ProbeKeys {
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
}

export interface ProbeReply {
  text: string;
  finishReason: string;
  usage: Record<string, unknown>;
  model: string;
}

/**
 * Structured outputs on both providers refuse array/number/string bounds — the app's reader re-checks them.
 * And the app's schemas speak Gemini's OpenAPI `nullable: true`, which is not JSON Schema: it becomes a
 * `[type, "null"]` union here so a null `id` (the import's "not one of ours") stays a legal answer.
 */
export function stripBounds(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripBounds);
  if (!node || typeof node !== 'object') return node;
  const src = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    if (['minItems', 'maxItems', 'minimum', 'maximum', 'minLength', 'maxLength', 'nullable'].includes(k)) continue;
    out[k] = stripBounds(v);
  }
  if (src.nullable === true && typeof src.type === 'string') out.type = [src.type, 'null'];
  return out;
}

export function isProbeProvider(model: string): boolean {
  return /^claude-[\w.-]+$/.test(model) || /^gpt-[\w.-]+$/.test(model);
}

export async function callProbeProvider(call: ProbeCall, keys: ProbeKeys): Promise<ProbeReply> {
  const schema = stripBounds(call.schema) as Record<string, unknown>;

  if (call.model.startsWith('claude-')) {
    if (!keys.ANTHROPIC_API_KEY) throw new Error('no_anthropic_key');
    const client = new Anthropic({ apiKey: keys.ANTHROPIC_API_KEY });
    const effort = (['low', 'medium', 'high', 'xhigh', 'max'] as const).find((e) => e === call.effort);
    const stream = client.messages.stream({
      model: call.model,
      max_tokens: 32000,
      thinking: { type: 'adaptive' },
      output_config: {
        ...(effort ? { effort } : {}),
        format: { type: 'json_schema', schema },
      },
      messages: [{
        role: 'user',
        content: call.images?.length
          ? [
              { type: 'text' as const, text: call.text },
              ...call.images.map((img) => ({
                type: 'image' as const,
                source: { type: 'base64' as const, media_type: img.mime as 'image/jpeg' | 'image/png' | 'image/webp', data: img.data },
              })),
            ]
          : call.text,
      }],
    });
    const msg = await stream.finalMessage();
    const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    return { text, finishReason: String(msg.stop_reason), usage: msg.usage as unknown as Record<string, unknown>, model: msg.model };
  }

  if (!keys.OPENAI_API_KEY) throw new Error('no_openai_key');
  const client = new OpenAI({ apiKey: keys.OPENAI_API_KEY });
  const effort = (['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const).find((e) => e === call.effort);
  const res = await client.responses.create({
    model: call.model,
    input: call.images?.length
      ? [{
          role: 'user' as const,
          content: [
            { type: 'input_text' as const, text: call.text },
            ...call.images.map((img) => ({ type: 'input_image' as const, detail: 'high' as const, image_url: `data:${img.mime};base64,${img.data}` })),
          ],
        }]
      : call.text,
    max_output_tokens: 32000,
    ...(effort ? { reasoning: { effort } } : {}),
    // Not `strict`: strict mode demands every property be required, and four of ours are optional.
    text: { format: { type: 'json_schema', name: call.schemaName ?? 'reply', schema, strict: false } },
  });
  return { text: res.output_text, finishReason: String(res.status), usage: (res.usage ?? {}) as unknown as Record<string, unknown>, model: res.model };
}
