/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE IMPORT, END TO END — photograph or text in, a programme and a report out.
 *
 * ⛔ FOUNDER, 2026-08-11: *"תמשיך למסך הכניסה והחיווט."*
 *
 * Four steps, and the order is the product decision:
 *
 *   1. READ    her photograph, if she gave one. The model does this and nothing else.
 *   2. MATCH   her names onto catalogue ids — LOCALLY, deterministically, 117/117 by name.
 *   3. ASK     the model about the leftovers only, and only if there are any.
 *   4. REPORT  what breaks a Hush rule. Never fix it.
 *
 * ⚠️ STEP 3 IS SKIPPED WHENEVER IT CAN BE, and that is not only a saving. Every name the local
 * matcher answers is a name no model can get wrong, so the cheapest path is also the safest one.
 *
 * ── WHY THE CALL IS INJECTED ───────────────────────────────────────────────────────────────────
 * `ask` is a parameter rather than an import, so this whole flow is testable without a network, a
 * key or a Worker — including the paths that matter most: the model returning nonsense, the model
 * inventing a lift, the call failing outright. A feature whose failure modes can only be exercised
 * against a live API is a feature whose failure modes are never exercised.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import {
  matchWeek,
  toProgram,
  reviewFindings,
  isRunnable,
  type ImportedWeek,
  type Finding,
  type MatchedWeek,
} from '@/domain/importedPlan';
import {
  importReadRequest,
  importRequest,
  readImportedWeek,
  readImportReply,
  type ImportSuggestion,
} from '@/domain/importPrompt';
import type { Program } from '@/data/local/models';

/** Exactly what `askCoach` offers, narrowed to what this flow uses. */
export type AskFn = (
  request: { v: number; blocks: { text: string; cache?: true }[] },
  schema?: Record<string, unknown>,
  think?: 'minimal' | 'low' | 'medium' | 'high',
  images?: { mime: string; data: string }[],
  kind?: 'build' | 'import' | 'review' | 'chat',
) => Promise<{ ok: true; text: string } | { ok: false; reason: string }>;

export type ImportFailure =
  /** She gave us nothing to read. */
  | 'nothing_given'
  /** The call did not come back — no signal, no key, the Worker is down. */
  | 'unreachable'
  /** It came back, and there was no programme in it. A photo of a cat, a blank page. */
  | 'unreadable'
  /** We read it, and not one lift was ours. Almost always the wrong photograph. */
  | 'nothing_matched';

export interface ImportOutcome {
  ok: true;
  program: Program;
  findings: Finding[];
  /**
   * What the model suggested for the names we could not place. **Rendered and acceptable** — she
   * taps, `applySuggestion` repairs the match, and `toProgram` rebuilds her week. Never applied on
   * her behalf: a verified id is proof the lift EXISTS, not proof it is the one she meant.
   */
  suggestions: ImportSuggestion[];
  /**
   * The matched week the programme was built from — carried so an accepted suggestion can put the
   * lift back in the SESSION she wrote it in, rather than appended somewhere plausible.
   */
  matched: MatchedWeek;
  sessionCount: number;
  liftCount: number;
  title?: string;
}

export type ImportResult = ImportOutcome | { ok: false; reason: ImportFailure };

/** Parse a reply that is supposed to be JSON, without letting a bad one throw. */
function asJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Run the import.
 *
 * `week` is her programme when she typed or pasted it; `images` when she photographed it. One or
 * the other — a caller with both should prefer what she actually gave last.
 */
export async function runImport(
  ask: AskFn,
  input: {
    week?: ImportedWeek;
    images?: { mime: string; data: string }[];
    locale?: 'en' | 'he';
    /**
     * ⛔ SHE DOES NOT WAIT FOR THE SECOND CALL (founder 2026-08-11: *"התהליך של ההמתנה צריך לעבור
     * בצורה הכי חלקה ומהירה שיש"*).
     *
     * By the time step 2 finishes, her programme and her whole report EXIST — the leftovers call
     * only adds a suggested alternative for the handful of names we could not place. Making her
     * watch a spinner for it means the slowest part of the flow is the part that matters least, and
     * on a bad connection it means waiting for something that may never arrive.
     *
     * So the report is handed over the moment it is ready, and the suggestions land on a screen she
     * is already reading. `runImport` still resolves with the complete result, so a caller that does
     * not pass this behaves exactly as before.
     */
    onReady?: (partial: ImportOutcome) => void;
    /** Which step is running, for the one honest sentence a spinner should carry. */
    onPhase?: (phase: 'reading' | 'matching') => void;
  },
): Promise<ImportResult> {
  const locale = input.locale ?? 'en';

  /* ── 1 · READ ─────────────────────────────────────────────────────────────────────────────── */
  let week = input.week;
  if (!week) {
    if (!input.images || input.images.length === 0) return { ok: false, reason: 'nothing_given' };
    input.onPhase?.('reading');
    const req = importReadRequest({ locale });
    const reply = await ask({ v: req.v, blocks: req.blocks }, req.schema, req.think, input.images, 'import');
    if (!reply.ok) return { ok: false, reason: 'unreachable' };
    week = readImportedWeek(asJson(reply.text));
  }
  if (!week || week.sessions.length === 0) return { ok: false, reason: 'unreadable' };

  /* ── 2 · MATCH, locally ───────────────────────────────────────────────────────────────────── */
  const matched = matchWeek(week);

  /* ── 3 · BUILD and REPORT — before the second call, so she reads while it runs ────────────── */
  const program = toProgram(matched);
  if (!isRunnable(program)) return { ok: false, reason: 'nothing_matched' };

  const outcome: ImportOutcome = {
    ok: true,
    program,
    findings: reviewFindings(matched, program),
    suggestions: [],
    matched,
    /*
     * ⚠️ BOTH FIGURES COUNT WHAT WAS **READ**, and until now the lift one counted what SURVIVED.
     * The review says "{{sessions}} sessions · {{lifts}} exercises read" — so a sheet of twelve
     * lifts with two we could not place reported ten, understating her own programme back at her
     * while the findings underneath named the two by name. The counts and the findings now measure
     * the same week: this line is what arrived, the findings are what happened to it.
     */
    sessionCount: matched.sessions.length,
    liftCount: matched.sessions.reduce((n, s) => n + s.lifts.length, 0),
    ...(matched.title ? { title: matched.title } : {}),
  };
  input.onReady?.(outcome);

  /* ── 4 · ASK about the leftovers, and ONLY if there are any ───────────────────────────────── */
  let suggestions: ImportSuggestion[] = [];
  if (matched.unmatched.length > 0) {
    input.onPhase?.('matching');
    const req = importRequest({ unmatched: matched.unmatched, locale });
    const reply = await ask({ v: req.v, blocks: req.blocks }, req.schema, req.think, undefined, 'import');
    /*
     * ⚠️ A FAILED SUGGESTION CALL IS NOT A FAILED IMPORT. Her matched lifts are already a programme;
     * the leftovers simply stay on the report as "I could not find this", which is a true sentence
     * and one she can act on. Losing the whole import because the second call timed out would be
     * throwing away everything the local matcher got right.
     */
    if (reply.ok) suggestions = readImportReply(asJson(reply.text), matched.unmatched);
  }

  return { ...outcome, suggestions };
}
