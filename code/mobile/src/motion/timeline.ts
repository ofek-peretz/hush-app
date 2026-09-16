/**
 * The timeline maps elapsed time → range-of-motion fraction (`rom` ∈ [0,1]) via a FormSpec tempo.
 * rom 0 = the rep's canonical start, rom 1 = its working endpoint. The eccentric and concentric
 * phases are eased (controlled), the endpoint holds are still — this is where "correct tempo" and
 * the endpoint holds that land on the range ticks are defined, once, for every exercise.
 */

// 

import type { Tempo } from './types';
import { easeInOut } from './geometry';

/** Canonical tempo (MOTION_FORM_STANDARD_V1 §0/§4): 2.0s down · 0.4s hold · 1.1s up · 0.5s reset. */
export const DEFAULT_TEMPO: Tempo = {
  topHoldMs: 500,
  eccentricMs: 2000,
  bottomHoldMs: 400,
  concentricMs: 1100,
  reps: 2,
  startAt: 'top',
};

export const repDurationMs = (t: Tempo): number =>
  t.topHoldMs + t.eccentricMs + t.bottomHoldMs + t.concentricMs;

/**
 * The same clock, for every lift whose WORKING ENDPOINT is reached by the muscle SHORTENING — the
 * curls, rows, pulldowns, raises, pushdowns, calf raises, thrusts, extensions and presses that
 * finish at lockout rather than at the stretch. See `Tempo.endpointIsConcentric`.
 */
export const CONCENTRIC_TEMPO: Tempo = { ...DEFAULT_TEMPO, endpointIsConcentric: true };

export const loopDurationMs = (t: Tempo): number => repDurationMs(t) * t.reps;

/**
 * rom for one rep, phase order top → eccentric → bottom → concentric. For `startAt: 'bottom'`
 * lifts (deadlift from the floor) the curve is inverted so the rep opens at the stretch.
 */
function romInRep(msIntoRep: number, t: Tempo): number {
  /*
   * WHICH PHASE GETS THE SLOW CLOCK.
   *
   * The loop's first timed move runs from wherever the rep opens to the other end; the second
   * brings it back. Whether the first of those is the ECCENTRIC depends on two facts, and this used
   * to assume both: that rom 1 is the loaded/lowered end (`endpointIsConcentric` says otherwise for
   * every curl, row, raise and pull in the catalogue), and that the loop opens at rom 0 (`startAt`
   * already said otherwise for the deadlift, which opens on the floor and PULLS first).
   *
   * Taken together they decide it: with `startAt: 'bottom'` the first move runs rom 1 → rom 0, so
   * the two flags cancel. Every clip then spends 2.0s on the lowering and 1.1s on the lift, which
   * is what `DEFAULT_TEMPO` has always claimed to be.
   */
  const rom0to1IsConcentric = t.endpointIsConcentric === true;
  const firstIsConcentric = t.startAt === 'bottom' ? !rom0to1IsConcentric : rom0to1IsConcentric;
  const firstMs = firstIsConcentric ? t.concentricMs : t.eccentricMs;
  const secondMs = firstIsConcentric ? t.eccentricMs : t.concentricMs;

  const e0 = t.topHoldMs;
  const e1 = e0 + firstMs;
  const e2 = e1 + t.bottomHoldMs;
  const e3 = e2 + secondMs;
  let rom: number;
  if (msIntoRep < e0) rom = 0;
  else if (msIntoRep < e1) rom = easeInOut((msIntoRep - e0) / firstMs);
  else if (msIntoRep < e2) rom = 1;
  else if (msIntoRep < e3) rom = 1 - easeInOut((msIntoRep - e2) / secondMs);
  else rom = 0;
  return t.startAt === 'bottom' ? 1 - rom : rom;
}

/** rom at absolute elapsed time (wraps over the loop). */
export function romAt(msElapsed: number, t: Tempo): number {
  const loop = loopDurationMs(t);
  const into = ((msElapsed % loop) + loop) % loop;
  const rep = repDurationMs(t);
  const rom = romInRep(into % rep, t);
  if (!t.repRanges || t.repRanges.length === 0) return rom;
  /* A partial-rep protocol: this rep travels only its own slice of the range. See `Tempo.repRanges`. */
  const k = Math.min(t.repRanges.length - 1, Math.floor(into / rep));
  const [lo, hi] = t.repRanges[k];
  /*
   * THE HAND-OFF BETWEEN TWO RANGES IS A MOVE, NOT A CUT (audit, 2026-09-03).
   *
   * Each rep opens at its own `lo` and returns to it. When the next rep's `lo` is a different
   * place — `bb_curl_21` goes [0,0.5] → [0.5,1] — the figure used to teleport there at the rep
   * boundary: 25 units of hand travel in one frame, twice per loop, and nothing could see it,
   * because every validator samples inside a rep. So the rep's opening hold (`topHoldMs`, the
   * still moment before the first move) now carries an eased glide from where the previous rep
   * finished to where this one begins. The endpoints of every rep are untouched.
   */
  const prevK = (k - 1 + t.repRanges.length) % t.repRanges.length;
  const prevLo = t.repRanges[prevK][0];
  const intoRep = into % rep;
  if (prevLo !== lo && intoRep < t.topHoldMs && t.topHoldMs > 0) {
    return prevLo + (lo - prevLo) * easeInOut(intoRep / t.topHoldMs);
  }
  return lo + (hi - lo) * rom;
}

/** Evenly spaced sample times across exactly one loop (for validation + frame emit). */
export function loopSampleTimes(t: Tempo, n: number): number[] {
  const loop = loopDurationMs(t);
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push((i / n) * loop);
  return out;
}
