/**
 * The timeline maps elapsed time → range-of-motion fraction (`rom` ∈ [0,1]) via a FormSpec tempo.
 * rom 0 = the rep's canonical start, rom 1 = its working endpoint. The eccentric and concentric
 * phases are eased (controlled), the endpoint holds are still — this is where "correct tempo" and
 * the endpoint holds that land on the range ticks are defined, once, for every exercise.
 */
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

export const loopDurationMs = (t: Tempo): number => repDurationMs(t) * t.reps;

/**
 * rom for one rep, phase order top → eccentric → bottom → concentric. For `startAt: 'bottom'`
 * lifts (deadlift from the floor) the curve is inverted so the rep opens at the stretch.
 */
function romInRep(msIntoRep: number, t: Tempo): number {
  const e0 = t.topHoldMs;
  const e1 = e0 + t.eccentricMs;
  const e2 = e1 + t.bottomHoldMs;
  const e3 = e2 + t.concentricMs;
  let rom: number;
  if (msIntoRep < e0) rom = 0;
  else if (msIntoRep < e1) rom = easeInOut((msIntoRep - e0) / t.eccentricMs);
  else if (msIntoRep < e2) rom = 1;
  else if (msIntoRep < e3) rom = 1 - easeInOut((msIntoRep - e2) / t.concentricMs);
  else rom = 0;
  return t.startAt === 'bottom' ? 1 - rom : rom;
}

/** rom at absolute elapsed time (wraps over the loop). */
export function romAt(msElapsed: number, t: Tempo): number {
  const loop = loopDurationMs(t);
  const into = ((msElapsed % loop) + loop) % loop;
  const rep = repDurationMs(t);
  return romInRep(into % rep, t);
}

/** Evenly spaced sample times across exactly one loop (for validation + frame emit). */
export function loopSampleTimes(t: Tempo, n: number): number[] {
  const loop = loopDurationMs(t);
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push((i / n) * loop);
  return out;
}
