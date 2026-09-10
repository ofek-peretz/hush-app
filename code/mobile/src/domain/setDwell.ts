/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * HOW LONG A SET SHOULD TAKE, AND WHEN IT HAS TAKEN LONGER THAN THAT
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ⛔ THE FOUNDER, FROM HIS OWN SESSION (2026-08-30):
 *
 *   > *"אני לפעמים שוכח להזין את תוצאות הסט וכבר ממתין לסט הבא ואז כשרואה שזה לא הגיוני שהמנוחה
 *   > עדיין לא הסתיימה אני מבין ששכחתי להזין בכלל את סיום הסט."*
 *
 * The app cannot know when a set ENDED — it knows when a set was PRESENTED and when it was LOGGED,
 * and nothing in between. Everything downstream of that gap goes wrong at once: the rest clock
 * starts at the tap rather than at the last rep, `learnedExecS` reads the whole gap as execution,
 * and the skip that follows used to be banked as a two-second rest.
 *
 * The answer is to ASK, not to infer (his ruling, 2026-08-31): a notification and a line, at the
 * point the set has plainly run long. This module owns the one question that makes it possible:
 * **when has this set run long?**
 *
 * ── ⛔ AND THE ANSWER IS ARITHMETIC, NOT A MEASUREMENT (his ruling, 2026-08-31, second pass) ─────
 *
 *   > *"אני חושב שסתם סיבכת את זה. לא צריך לחשב כמה זמן לוקח לכל בן אדם לעשות סט… אפשר לחשב כמה
 *   > זמן בערך לוקח לעשות את התרגיל הזה כולל מספר החזרות ואז להוסיף לזה עשר שניות בטחון… זה צריך
 *   > להיות פשוט."*
 *
 * The first build was twice `learnedExecS` — her own measured execution on this lift, derived from
 * her timestamps. It is a better statistic and it is the wrong tool, and his reason is the one that
 * settles it: **her set time is exactly the thing that varies.** A statistic whose whole job is to
 * say "this is longer than normal" cannot itself be built out of the noise it is measuring — one
 * long set drags the median and the next honest long set stops qualifying.
 *
 * What does NOT vary is what the exercise is and how many reps were prescribed. Both are known
 * before she starts, both come off data the app already ships:
 *
 *     nudgeAfterS = SETUP_S(tier) + reps × repSeconds(rig) + BUFFER_S
 *
 * ⚠️ AND IT IS BOUNDED BY CONSTRUCTION, so the floor and the ceiling the measured version needed
 * are both gone. A five-rep heavy squat lands at 90 s and a fifteen-rep curl at 110 — the same
 * window the hand-set `NUDGE_FLOOR_S`/`NUDGE_CEILING_S` were reaching for, arrived at from the
 * prescription instead of from a clamp. Nothing here can produce a number that is not the sum of
 * three things you can read off the screen.
 *
 * ⚠️ THE FOUNDER'S FRAMING IS STILL THE COPY DECISION: *"אל תשכח להזין"* is an alarm; *"this set is
 * running longer than yours usually do"* is somebody who has been watching. Same feature, opposite
 * meaning.
 *
 * Deterministic and pure. No clocks, no state, no history: the caller supplies the step.
 */

//

import { exerciseById } from '@/data/exercises';
import { isEvidenceSet } from '@/domain/setEvidence';
import { exerciseMotion } from '@/motion/registry';
import { DEFAULT_TEMPO, repDurationMs } from '@/motion/timeline';
import { learnedExecS, type ExecSample } from '@/engine/v5/timeBudget';
import type { Session } from '@/data/local/models';

/**
 * EVERYTHING THAT IS NOT A REP — walking to the rack, finding plates, loading both sides, setting
 * up, bracing, and racking it again at the end.
 *
 * ⛔ IT IS DELIBERATELY GENEROUS, AND THAT IS THE ONE PLACE THIS MODULE SPENDS CARE. An athlete
 * asked *"are you done?"* while she is still under the bar learns in one session that the app does
 * not know what she is doing, and the nudge is dead for ever after. A guard that fires late costs
 * one set; a guard that fires early costs the feature.
 *
 * ⚠️ NOT `SET_EXEC_SECONDS` (45 / 30). Those price a WHOLE set including its reps, for the time
 * budget; using them here and then adding the reps again would count the reps twice.
 */
const SETUP_S = { compound: 60, isolation: 40 } as const;

/** The founder's own margin, by name: *"ואז להוסיף לזה עשר שניות בטחון"*. */
export const BUFFER_S = 10;

/**
 * How long one rep of this lift takes, in seconds — off the rig's OWN tempo, which is the clock the
 * demonstration loops at and therefore the only per-exercise rep time this codebase has ever
 * agreed on. A lift with no rig yet takes the canon (`DEFAULT_TEMPO`, 4.0 s), which is what its
 * clip would run at the day one is written for it.
 */
function repSeconds(exerciseId: string | null | undefined): number {
  const rig = exerciseMotion(exerciseId);
  return repDurationMs(rig ? rig.formspec.tempo : DEFAULT_TEMPO) / 1000;
}

/**
 * When this set has run long enough to ask about — in seconds since it was PRESENTED.
 *
 * `reps` is the prescription's rep target (the band's floor is the honest one to use: it is the
 * fewest reps that still counts as the set done, so the estimate cannot run long on a band she
 * finishes early).
 */
export function nudgeAfterS(exerciseId: string | null | undefined, reps: number): number {
  const ex = exerciseById(exerciseId ?? '');
  const setup = SETUP_S[ex?.tier === 'isolation' ? 'isolation' : 'compound'];
  const n = Number.isFinite(reps) && reps > 0 ? reps : 8;
  return Math.round(setup + n * repSeconds(exerciseId) + BUFFER_S);
}

/** The founder's margin for a set whose START is known: fifteen seconds, not ten (spec §3.3). */
export const VOICE_BUFFER_S = 15;

/**
 * ════ WHEN THE VOICE ASKS "סיימת?" (spec §3.3) ════
 *
 * The clock's `nudgeAfterS` prices the walk to the rack and the loading because it counts from
 * the moment the set went ON SCREEN. The voice counts from the moment she said "מוכן" — or from
 * the end of the rest, when the set starts on that beat — so the setup is already paid for and
 * the only unknowns are the reps themselves. Floor reps × this lift's rep time, plus fifteen.
 */
export function voiceAskAfterS(exerciseId: string | null | undefined, reps: number): number {
  const n = Number.isFinite(reps) && reps > 0 ? reps : 8;
  return Math.round(n * repSeconds(exerciseId) + VOICE_BUFFER_S);
}

/**
 * Is a nudge legal for this step at all?
 *
 * ⛔ ONLY A SET. A hold, a distance and an open item are all steps whose whole point is that they
 * take as long as they take — a five-kilometre run past its "expected" duration is a slow run, not
 * a forgotten log, and asking about it would be the app failing to understand the thing it
 * prescribed. `ItemStage` runs those, and it is not this feature's screen.
 *
 * ⚠️ AND NOT A WARM-UP BRIDGE. A bridge is one light set with a 45-second breath after it; the
 * shortest thing in the session is not where a "you are taking too long" line belongs, and the
 * ramp's own contract keeps it out of every other measurement in the app.
 */
export function nudgeApplies(step: {
  target?: unknown;
  item?: { kind: string };
  warmup?: unknown;
  exerciseId: string;
}): boolean {
  if (step.warmup) return false;
  if (step.item && step.item.kind !== 'reps') return false;
  if (!step.target) return false;
  return !!exerciseById(step.exerciseId);
}

/**
 * ════ HER MEASURED EXECUTION ON ONE LIFT — one implementation, two callers ════
 *
 * ⛔ THE NUDGE NO LONGER USES THIS, and the reason is at the top of this file: her set time is the
 * thing that varies, so it is the wrong basis for "this is longer than normal". It stays HERE
 * rather than moving out with the feature that used to call it, because the two surfaces that do
 * still want it — the time budget (`fixtureModel`) and *what the app knows about you*
 * (`whatIKnow`) — genuinely want a MEASUREMENT, and this file's scar is about there being one copy
 * of it.
 *
 * ⚠️ EXTRACTED FROM `fixtureModel` ON 2026-08-31, WHERE IT WAS THE ONLY COPY AND ABOUT TO BECOME
 * THE FIRST OF TWO. That file's own header carries the scar this avoids: *"THERE WERE THREE, AND
 * THEY DID NOT AGREE"* — three hand-rolled walks over the same logs, so the budget priced her hour
 * off a statistic the rest timer refused to run.
 *
 * The arithmetic itself is `learnedExecS`'s and is not repeated: this only gathers the samples for
 * one lift, in time order, with the standing exclusions (`isApproach` sweeps warm-up bridges and
 * legacy approach sets alike).
 *
 * ⛔ AND A GAP WITH NO KNOWN REST IN IT IS NOT EVIDENCE — `learnedExecS` drops those itself (L3:
 * an unknown rest is never read as zero).
 */
export function learnedExecSFor(history: Session[], exerciseId: string): number | null {
  const samples: ExecSample[] = [];
  for (const s of history)
    for (const l of s.sets) {
      if (l.exerciseId !== exerciseId || !isEvidenceSet(l)) continue; // a presumed set's stamp is the clock's, not her last rep
      samples.push({ exerciseId: l.exerciseId, sessionId: s.id, atMs: Date.parse(l.persistedAt), restBeforeS: l.restBeforeS });
    }
  samples.sort((a, b) => a.atMs - b.atMs);
  return learnedExecS(samples);
}
