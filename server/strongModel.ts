/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE STRONG CALL THAT WRITES THE WEEK — OpenAI GPT-6 Sol at `high` reasoning, for `kind: 'build'` only.
 *
 * Founder, 2026-09-28: *"בוא נשתמש רק ב-OPEN AI עבור כל המטרות שלנו"*, and then, over my first pick
 * (Astra @ medium): *"שים את sol בחשיבה גבוהה במקום astra 6"*. One provider, one bill. The week is the
 * one decision the product sells, so it is thought through at `high`; the model and the effort are
 * the Worker's (`BUILD_STRONG_MODEL` / `BUILD_STRONG_EFFORT`). Until 2026-09-28 this file called
 * Claude Opus 5.5; the interface did not change.
 *
 * Never throws. Anything but a finished, parseable JSON answer inside `deadlineMs` is a MISS, and the
 * Worker hands the same call to the fast lane (`gpt-6-sol` @ `low`) in the time it kept back — a week
 * always lands.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { askOpenAI, type OpenAIEffort } from './openaiModel.ts';

export type StrongEffort = OpenAIEffort;

export type StrongResult =
  | { ok: true; text: string; usage: Record<string, unknown>; model: string }
  | { ok: false; why: string };

export async function askStrongModel(
  args: { model: string; effort: StrongEffort; text: string; schema: Record<string, unknown>; deadlineMs: number },
  apiKey: string,
): Promise<StrongResult> {
  const r = await askOpenAI(
    { model: args.model, effort: args.effort, text: args.text, schema: args.schema, deadlineMs: args.deadlineMs, maxOutputTokens: 32_000 },
    apiKey,
  );
  if (!r.ok) return { ok: false, why: r.why };
  // A cut week (`max_output_tokens`) or an unfinished one is no week: the fast model answers instead.
  if (r.finishReason !== 'STOP') return { ok: false, why: `stop:${r.finishReason}` };
  try {
    JSON.parse(r.text);
  } catch {
    return { ok: false, why: 'not_json' };
  }
  return { ok: true, text: r.text, usage: r.usage, model: r.model };
}
