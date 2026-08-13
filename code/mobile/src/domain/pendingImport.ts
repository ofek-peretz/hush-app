/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE IMPORT THAT RUNS WHILE SHE ANSWERS THE REST OF THE INTAKE.
 *
 * ⛔ FOUNDER, 2026-08-11: *"לא עדיף לשים את זה במסך הראשון בONBORDING? … בזמן שהבינה מייבאת את
 * התוכנית שלו הוא עובר את תהליך הONBORDING … זה יתן לנו עוד זמן יקר וכך המעבר יהיה חלק יותר."*
 *
 * He is right, and my first placement was wrong. I put the door on the LAST step, reasoning that we
 * need her sex, weight and days first — but that is when the LOADS are fitted, not when a programme
 * is read. `runImport` does not reference `Profile` at all. So the slowest thing in the whole flow
 * was scheduled at the one moment she has nothing else to do: staring at a spinner on the last
 * screen before her programme.
 *
 * Started at the FIRST question instead, the read runs underneath `AboutYou`, `ConnectHealth` and
 * the body map — twenty to sixty seconds of her answering things — and is almost always finished
 * before she reaches the build. The latency does not get shorter; it stops being time she spends
 * waiting.
 *
 * ── WHY IT IS A MODULE AND NOT A SCREEN'S STATE ────────────────────────────────────────────────
 * Because it has to survive four screen transitions. A promise held in `ImportPlan`'s `useState` is
 * collected the moment she navigates on, and the call it was waiting for becomes an answer nobody
 * receives — paid for, and thrown away.
 *
 * ⚠️ AND IT NEVER THROWS. Every failure is a settled `ImportResult`, because the thing awaiting this
 * is a screen at the end of onboarding: an unhandled rejection there is a white screen between her
 * and her programme, on the one path where she cannot go back.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import { runImport, type AskFn, type ImportResult, type ImportOutcome } from '@/domain/runImport';
import type { ImportedWeek } from '@/domain/importedPlan';

export type ImportPhase = 'reading' | 'matching';

export type PendingState =
  | { phase: 'idle' }
  /** In flight. `step` is what to say on a waiting screen; `partial` is the report if it has landed. */
  | { phase: 'running'; step: ImportPhase; partial: ImportOutcome | null }
  | { phase: 'done'; result: ImportResult };

let state: PendingState = { phase: 'idle' };
let inFlight: Promise<ImportResult> | null = null;
const watchers = new Set<(s: PendingState) => void>();

function set(next: PendingState): void {
  state = next;
  for (const w of watchers) w(state);
}

/** Watch the import from a screen. Returns the unsubscribe. */
export function watchImport(fn: (s: PendingState) => void): () => void {
  watchers.add(fn);
  fn(state);
  return () => watchers.delete(fn);
}

export function peekImport(): PendingState {
  return state;
}

/**
 * Begin. Safe to call twice — the second call is ignored rather than paying for a second read.
 *
 * ⚠️ IGNORING THE SECOND CALL IS DELIBERATE AND IS NOT A RACE GUARD. She can reach the import screen
 * twice (back out of onboarding, come in again). Starting a second read would spend a second call on
 * the same photograph and leave two answers competing over one programme.
 */
export function startImport(
  ask: AskFn,
  input: { week?: ImportedWeek; images?: { mime: string; data: string }[]; locale?: 'en' | 'he' },
): void {
  if (inFlight) return;
  set({ phase: 'running', step: 'reading', partial: null });
  inFlight = runImport(ask, {
    ...input,
    onPhase: (step) => {
      if (state.phase === 'running') set({ ...state, step });
    },
    /*
     * The report exists before the leftovers call finishes — see `runImport`. Holding it here means a
     * waiting screen can show her the real thing the moment it lands rather than a spinner, even
     * while the optional half is still in the air.
     */
    onReady: (partial) => {
      if (state.phase === 'running') set({ ...state, partial });
    },
  })
    .catch((): ImportResult => ({ ok: false, reason: 'unreachable' }))
    .then((result) => {
      set({ phase: 'done', result });
      return result;
    });
}

/**
 * The result, whenever it arrives.
 *
 * Resolves immediately when it has already landed, waits when it has not, and answers `null` when
 * nothing was ever started — which is the ordinary case for every athlete who did not bring a
 * programme, and must not be an error.
 */
export async function settledImport(): Promise<ImportResult | null> {
  if (state.phase === 'done') return state.result;
  if (!inFlight) return null;
  return inFlight;
}

/** Forget it — she chose her week, or she abandoned the intake. */
export function clearImport(): void {
  state = { phase: 'idle' };
  inFlight = null;
  for (const w of watchers) w(state);
}
