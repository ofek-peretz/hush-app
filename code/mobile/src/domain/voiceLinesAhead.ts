/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE LINES AHEAD (2026-09-27) — what the coach is about to say, so the natural voice has it ready.
 *
 * The natural voice (`platform/voice/neuralVoice`) fetches a line the first time it is needed and
 * keeps it for good. A line fetched at the moment it is needed makes her wait; a line fetched during
 * the rest before it does not. This lists, from the step she is on to the end of the workout, the
 * lines the script can already write: the loading dialogue of each lift ahead (both its "first time"
 * and its "calibrated" forms — which one is said depends on a history this view does not hold), the
 * set lines, the echo of every likely number of reps at the planned load, the rest and crossing lines,
 * and the fixed questions. Lines that depend on what she will answer (a verdict's new load, a round's
 * echo) are left to the moment — a moment the mouth waits on (`coachVoice` NEURAL_WAIT_MS).
 *
 * Pure: steps in, strings out — the same `voiceScript` builders the conductor speaks with, so a
 * prefetched line is byte-for-byte the line that will be asked for.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import { exerciseDisplayName } from '@/data/exercises';
import { voiceScript, type VoiceLocale } from '@/domain/voiceScript';

/** The slice of a live step this needs (structurally `Step` from the session store). */
export interface StepAhead {
  exerciseId: string;
  exerciseSetIndex: number;
  totalSetsInExercise: number;
  target?: { recommendedWeight: number | null; recommendedReps: number; repBandLo?: number; repBandHi?: number };
  item?: { kind: string; seconds?: number; metres?: number };
  restAfterS?: number;
  warmup?: unknown;
}

/** The most distinct lines one call asks for — a long workout's whole list is under this. */
const MAX_LINES = 260;

/** The lines that are the same in every workout. */
export function fixedLines(): string[] {
  return [
    voiceScript.go(), voiceScript.readyPrompt(), voiceScript.readyNotHeard(), voiceScript.readyFallback(),
    voiceScript.askDone(), voiceScript.askDoneLast(), voiceScript.askDoneWarmup(), voiceScript.askReps(),
    voiceScript.okWait(), voiceScript.askAgainSoon(), voiceScript.didntGet(), voiceScript.notHeard(),
    voiceScript.remindDone(), voiceScript.sayDoneWhenDone(), voiceScript.tenSeconds(), voiceScript.verdictHold(),
    voiceScript.record(), voiceScript.paused(), voiceScript.resumed(), voiceScript.back(),
    voiceScript.finishOnPhone(), voiceScript.cantHear(), voiceScript.markOnLock(), voiceScript.askDoneHoldAgain(),
    voiceScript.holdNotHeard(), voiceScript.cantSkip(), voiceScript.askDoneHold(),
  ];
}

export function voiceLinesAhead(plan: readonly StepAhead[], fromIndex: number, restSeconds: (s: StepAhead) => number, l: VoiceLocale): string[] {
  const out: string[] = [];
  const add = (s: string | null | undefined) => {
    if (s && out.length < MAX_LINES && !out.includes(s)) out.push(s);
  };
  const steps = plan.slice(Math.max(0, fromIndex));
  for (let i = 0; i < steps.length && out.length < MAX_LINES; i++) {
    const st = steps[i];
    const next = steps[i + 1];
    const ex = st.exerciseId;
    const rest = restSeconds(st);
    if (st.item && st.item.kind === 'time' && st.item.seconds) {
      const name = exerciseDisplayName(ex);
      add(voiceScript.holdLoading(name, st.item.seconds, l));
      add(voiceScript.holdEcho(st.item.seconds, l));
    } else if (st.target && !st.warmup) {
      const kg = st.target.recommendedWeight;
      const lo = st.target.repBandLo ?? st.target.recommendedReps;
      const hi = st.target.repBandHi ?? lo;
      const n = st.exerciseSetIndex + 1;
      const m = st.totalSetsInExercise;
      if (n === 1) {
        add(voiceScript.loadCalibrated(ex, kg, lo, hi, l));
        add(voiceScript.loadFirstTime(ex, kg, lo, hi, l));
      } else {
        add(voiceScript.setStart(n, m, false, l));
        // A load the verdict moved is on the plan by the rest that follows it: the set that names it
        // is fetched during that rest, like every other line.
        const before = plan[Math.max(0, fromIndex) + i - 1];
        if (kg != null && before && before.exerciseId === ex && before.target && before.target.recommendedWeight !== kg) {
          add(voiceScript.loadChanged(ex, kg, n, m, false, l));
        }
      }
      // The numbers she is likely to say, said back — her reps alone, the load being the plan's.
      for (let r = Math.max(1, lo - 2); r <= hi + 3; r++) add(voiceScript.echo(kg, r, l, kg));
    }
    if (rest > 0) add(voiceScript.rest(rest, l));
    if (next && !steps.slice(i + 1).some((s) => s.exerciseId === ex)) {
      const ahead = new Set(steps.slice(i + 1).map((s) => s.exerciseId));
      const nextKg = next.item && next.item.kind !== 'reps' ? null : (next.target?.recommendedWeight ?? null);
      if (rest > 0) add(voiceScript.liftDone(next.exerciseId, nextKg, ahead.size === 1, rest, l));
    }
  }
  return out;
}
