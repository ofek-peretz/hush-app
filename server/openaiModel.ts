/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ONE CALL TO OPENAI'S RESPONSES API (2026-09-28) — the coach's only model provider.
 *
 * Founder: *"בוא נשתמש רק ב-OPEN AI עבור כל המטרות שלנו וזהו הכי פשוט."* Every job the coach does —
 * the week, reading a routine, reviewing a week she wrote — is one of these. Plain `fetch`, no SDK:
 * the Worker ships what it runs, and the request is four fields.
 *
 *   · Structured output: `text.format` = the app's JSON Schema (bounds stripped — `stripBounds`),
 *     `strict: false` because some of our fields are optional and strict mode requires all of them.
 *   · `max_output_tokens` INCLUDES the reasoning tokens, exactly as Gemini's `maxOutputTokens` did —
 *     a cap sized for the visible answer alone cuts a thinking model's answer in half.
 *   · The reply is read to the end and reported as the Worker always has: `finishReason: 'STOP'`
 *     for a finished answer (the app reads exactly that), the cut reason otherwise.
 *
 * Never throws: a failure is `{ ok: false, why, status }`, and the caller decides what comes next.
 * The upstream's error text goes to `wrangler tail`, never back to the phone (it can quote her record).
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { stripBounds } from './probeProviders.ts';

export type OpenAIEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export type OpenAIResult =
  | { ok: true; text: string; finishReason: string; usage: Record<string, unknown>; model: string }
  | { ok: false; why: string; status?: number };

export const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

interface ResponsesReply {
  status?: string;
  model?: string;
  incomplete_details?: { reason?: string } | null;
  output?: { type?: string; content?: { type?: string; text?: string }[] }[];
  usage?: Record<string, unknown>;
}

export async function askOpenAI(
  args: {
    model: string;
    effort: OpenAIEffort;
    text: string;
    schema?: Record<string, unknown>;
    images?: { mime: string; data: string }[];
    deadlineMs: number;
    maxOutputTokens: number;
    signal?: AbortSignal;
  },
  apiKey: string,
): Promise<OpenAIResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1_000, args.deadlineMs));
  const outer = args.signal;
  const onOuter = () => controller.abort();
  outer?.addEventListener('abort', onOuter);
  try {
    const input = args.images?.length
      ? [{
          role: 'user',
          content: [
            { type: 'input_text', text: args.text },
            // What she photographed is read at full detail — a rep count in a corner is the whole point.
            ...args.images.map((img) => ({ type: 'input_image', detail: 'high', image_url: `data:${img.mime};base64,${img.data}` })),
          ],
        }]
      : args.text;
    const res = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: args.model,
        input,
        max_output_tokens: args.maxOutputTokens,
        reasoning: { effort: args.effort },
        store: false,
        ...(args.schema
          ? { text: { format: { type: 'json_schema', name: 'reply', schema: stripBounds(args.schema), strict: false } } }
          : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.log(`openai ${res.status} :: ${detail.slice(0, 800)}`);
      let message = '';
      try {
        message = String((JSON.parse(detail) as { error?: { message?: string } })?.error?.message ?? '');
      } catch {
        /* not JSON */
      }
      return { ok: false, why: `http_${res.status}${message ? `: ${message.slice(0, 160)}` : ''}`, status: res.status };
    }
    const body = (await res.json()) as ResponsesReply;
    const text = (body.output ?? [])
      .flatMap((item) => (item.type === 'message' ? item.content ?? [] : []))
      .map((c) => (c.type === 'output_text' ? c.text ?? '' : ''))
      .join('');
    const finishReason =
      body.status === 'completed'
        ? 'STOP'
        : body.status === 'incomplete'
          ? body.incomplete_details?.reason === 'max_output_tokens'
            ? 'MAX_TOKENS'
            : String(body.incomplete_details?.reason ?? 'INCOMPLETE').toUpperCase()
          : String(body.status ?? 'UNKNOWN').toUpperCase();
    return { ok: true, text, finishReason, usage: body.usage ?? {}, model: body.model ?? args.model };
  } catch (e) {
    return { ok: false, why: controller.signal.aborted ? 'deadline' : String((e as Error)?.message ?? e).slice(0, 160) };
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', onOuter);
  }
}
