/**
 * Hush Engine v5 — Loop 2, the Exercise loop (end of every occurrence). The heart of progression.
 *
 * S-22 (all sets met Tlo → up), S-24 (not all → hold at the median anchor), S-25 (stall → back off,
 * then rotate), S-16 (ambiguous → hold). L10 (median anchor — a mis-key is not the median of
 * several), L11 (the rail — never above one rung past her settled best at Tlo). Bodyweight (S-51/52)
 * has no load axis: reps carry it, and it graduates at Thi or on a stall.
 *
 * Pure. Reads no wall-clock as a trigger, no RNG.
 */

import type { Band, ExerciseMeta, ExerciseState, Loop2Result, SetPerf, SessionRecord } from './types';
import { median, percentileNearestRank } from './stats';
import { snapDown, moveRungs, nextRung, prevRung, loadFloor } from './grid';
import { repsPerRung, rungsForHeadroom } from './repsPerRung';
import { RECENCY_WINDOW_SESSIONS, N_PERCENTILE, ATTEMPTS_TO_CLEAR_SEED } from './constants';

const EPS = 1e-6;

/** Working sets only (approach sets are measurements, never decisions — S-60). */
const working = (sets: SetPerf[]): SetPerf[] => sets.filter((s) => !s.isApproach && s.reps >= 0);

/** Did the set meet the target (reps ≥ Tlo, and it was really performed)? */
const metTlo = (s: SetPerf, band: Band): boolean => s.reps >= band.lo && s.reps > 0;

/**
 * S-25.2 — has she hit the SAME wall twice? A repeated stall at the current prescribed load, with a
 * back-off (a lower-load occurrence) MORE RECENT than the earlier stall, means back-off-and-re-climb
 * (S-25.1) has persistently failed — the signal to ROTATE rather than back off yet again. A
 * first stall at a wall (no earlier stall at this load, or no rebuild between) returns false, so the
 * first response is always to back off and re-climb. History is newest-first; only the recency window
 * counts (an old plateau is not "her today"). Bodyweight has no load axis → never a rotate signal.
 */
function isRepeatedStall(history: SessionRecord[], currentLoad: number | null, band: Band): boolean {
  if (currentLoad == null) return false;
  const stalledHere = (rec: SessionRecord): boolean =>
    rec.load != null && Math.abs(rec.load - currentLoad) < EPS && rec.sets.length > 0 && !rec.sets.every((s) => metTlo(s, band));
  let sawBackoff = false; // walking newest → oldest, a back-off is more recent than the earlier stall
  for (const rec of history.slice(0, RECENCY_WINDOW_SESSIONS)) {
    if (rec.load != null && rec.load < currentLoad - EPS) sawBackoff = true;
    if (sawBackoff && stalledHere(rec)) return true;
  }
  return false;
}

// ── The rail (L11) ─────────────────────────────────────────────────────────
/**
 * The heaviest load she has COMPLETED at ≥ Tlo reps in her settled history (the sessions before this
 * one, inside the recency window). null when there is no such record → the rail is inactive and the
 * approach set guards instead (S-60). Never reads the current session, so a fat-finger cannot lift
 * its own ceiling.
 */
function railRecord(history: SessionRecord[], band: Band): number | null {
  let best: number | null = null;
  for (const rec of history.slice(0, RECENCY_WINDOW_SESSIONS)) {
    for (const s of rec.sets) {
      if (s.isApproach || s.load == null) continue;
      if (s.reps >= band.lo && (best == null || s.load > best)) best = s.load;
    }
  }
  return best;
}

/**
 * Clamp a proposed load to the rail: one rung above the heaviest load she completed at Tlo. The base
 * is `max(settled record, this session's anchor)` — the anchor is the MEDIAN of met-Tlo loads, so a
 * single mis-key can never lift it (L11's real purpose), yet a load she cleanly completed THIS
 * session DOES count, so normal progression is one rung per clear (S-22) — not the half-speed the
 * literal "settled only" reading would force (a register contradiction resolved in S-22's favour).
 * Inactive (no settled record AND no anchor) → unchanged; the approach set guards a never-done lift.
 */
function applyRail(load: number, history: SessionRecord[], band: Band, meta: ExerciseMeta, anchor: number | null): number {
  const rec = railRecord(history, band);
  const base = rec == null ? anchor : anchor == null ? rec : Math.max(rec, anchor);
  if (base == null) return load;
  const ceil = nextRung(base, meta.equipment, meta.observedLoads);
  return load > ceil + EPS ? ceil : load;
}

// ── The stall read (S-25) ──────────────────────────────────────────────────
/** Her typical attempts-to-clear a load on this lift (nearest-rank 75th percentile, F-13). */
function attemptsToClearN(history: SessionRecord[], band: Band): number {
  // Walk newest→oldest, grouping consecutive same-load sessions that END in a clear (all met Tlo).
  const recent = history.slice(0, RECENCY_WINDOW_SESSIONS);
  const runs: number[] = [];
  let run = 0;
  let runLoad: number | null | undefined;
  // Oldest-first so a run reads naturally toward its clearing session.
  for (const rec of [...recent].reverse()) {
    const cleared = rec.sets.length > 0 && rec.sets.every((s) => metTlo(s, band));
    if (runLoad === undefined || rec.load !== runLoad) {
      run = 0;
      runLoad = rec.load;
    }
    run += 1;
    if (cleared) {
      runs.push(run);
      run = 0;
      runLoad = undefined;
    }
  }
  if (runs.length === 0) return ATTEMPTS_TO_CLEAR_SEED;
  return Math.max(1, percentileNearestRank(runs, N_PERCENTILE));
}

/** Consecutive newest sessions at the CURRENT load that did not clear (incl. this one). */
function attemptsAtCurrentLoad(state: ExerciseState, thisSessionCleared: boolean, band: Band): number {
  let count = thisSessionCleared ? 0 : 1;
  if (thisSessionCleared) return 0;
  for (const rec of state.history.slice(0, RECENCY_WINDOW_SESSIONS)) {
    // Same load also means "both bodyweight" (null == null) — a bodyweight lift has no load axis.
    const sameLoad =
      (rec.load == null && state.load == null) ||
      (rec.load != null && state.load != null && Math.abs(rec.load - state.load) < EPS);
    const cleared = rec.sets.length > 0 && rec.sets.every((s) => metTlo(s, band));
    if (!sameLoad || cleared) break;
    count += 1;
  }
  return count;
}

/** The heaviest load in her history where ALL sets met Tlo (the back-off target, S-25.1). */
function heaviestFullClear(history: SessionRecord[], band: Band): number | null {
  let best: number | null = null;
  for (const rec of history.slice(0, RECENCY_WINDOW_SESSIONS)) {
    if (rec.load == null || rec.sets.length === 0) continue;
    if (rec.sets.every((s) => metTlo(s, band)) && (best == null || rec.load > best)) best = rec.load;
  }
  return best;
}

// ── The main decision ──────────────────────────────────────────────────────
export interface Loop2Input {
  state: ExerciseState;
  session: SetPerf[];
  meta: ExerciseMeta;
  /** Same-muscle rotation available? (S-25.2). Provided by the assembler; default false. */
  rotationAvailable?: boolean;
}

export function decideExercise(inp: Loop2Input): Loop2Result {
  const { state, meta } = inp;
  const band = state.band;
  const sets = working(inp.session);

  // Bodyweight has its own axis (S-51/52).
  if (meta.bodyweight || state.load == null) return decideBodyweight(inp, sets);

  // S-16: no usable working data → hold, bank nothing.
  const usable = sets.filter((s) => s.load != null && s.reps > 0);
  if (usable.length === 0) {
    return { decision: 'ambiguous', load: state.load, band, sets: state.sets };
  }

  const allMet = sets.every((s) => metTlo(s, band));
  const metLoads = sets.filter((s) => metTlo(s, band)).map((s) => s.load as number);

  // The anchor (L10): median of the loads of sets that met Tlo, snapped down. If none met, hold at
  // the last rung Loop 1 settled on (the last performed load) — never a stale pre-session number.
  const anchor = metLoads.length
    ? snapDown(median(metLoads), meta.equipment, meta.observedLoads)
    : snapDown((usable[usable.length - 1].load as number), meta.equipment, meta.observedLoads);

  if (allMet) {
    // S-22: progress. Move up by as many rungs as her measured headroom over Tlo justifies.
    const worstReps = Math.min(...sets.map((s) => s.reps));
    const perRung = repsPerRung(inp.session, state.history, meta);
    const n = rungsForHeadroom(worstReps - band.lo, perRung);
    let load = snapDown(moveRungs(anchor, n, meta.equipment, meta.observedLoads), meta.equipment, meta.observedLoads);
    load = applyRail(load, state.history, band, meta, anchor); // L11 (base = max(settled, anchor))
    return { decision: 'progress', load, band, sets: state.sets };
  }

  // Not all met Tlo → S-24 hold, unless it is a stall (S-25).
  const attempts = attemptsAtCurrentLoad(state, false, band);
  const N = attemptsToClearN(state.history, band);

  // S-25: a stall is failing this load MORE times than her own typical attempts-to-clear (strict).
  if (attempts > N) {
    // S-25.1: back off to the heaviest full-clear load, else one rung down; re-climb. The load backs
    // off in BOTH the back-off and the rotate case (the rotated-from lift trains it until the roll).
    const backTo = heaviestFullClear(state.history, band);
    const load = backTo != null
      ? snapDown(backTo, meta.equipment, meta.observedLoads)
      : Math.max(loadFloor(meta.equipment, meta.observedLoads), prevRung(state.load, meta.equipment, meta.observedLoads));
    // S-25.2: rotate ONLY on a REPEATED stall at the same wall (back-off-and-re-climb has failed) —
    // never on a first stall. `wantsChange` signals the structural swap, enacted only if a same-muscle
    // target exists (else the lift simply backs off, S-53). rotationAvailable stays a hook the caller
    // may gate; the persistence test is the trigger.
    if (inp.rotationAvailable && isRepeatedStall(state.history, state.load, band)) {
      return { decision: 'stall_rotate', load, band, sets: state.sets, wantsChange: 'rotate' };
    }
    return { decision: 'stall_backoff', load, band, sets: state.sets };
  }

  // S-24: plain hold at the anchor.
  return { decision: 'hold', load: anchor, band, sets: state.sets };
}

// ── Bodyweight (S-51/52/53) ────────────────────────────────────────────────
function decideBodyweight(inp: Loop2Input, sets: SetPerf[]): Loop2Result {
  const { state, meta } = inp;
  const band = state.band;
  const usable = sets.filter((s) => s.reps > 0);
  if (usable.length === 0) return { decision: 'ambiguous', load: null, band, sets: state.sets };

  const allMetThi = sets.every((s) => s.reps >= band.hi); // S-52 trigger 1: too easy
  if (allMetThi) {
    return { decision: 'graduate', load: null, band, sets: state.sets, wantsChange: 'graduate' };
  }

  // S-52 trigger 2: stalled below Thi — no load lever, so the only way forward is a harder movement.
  const attempts = attemptsAtCurrentLoad(state, false, band);
  const N = attemptsToClearN(state.history, band);
  const advancedThisSession = sets.every((s) => s.reps >= band.lo); // reps climbing within band
  if (!advancedThisSession && attempts > N) {
    return { decision: 'graduate', load: null, band, sets: state.sets, wantsChange: 'graduate' };
  }

  // Otherwise reps carry the progression within the band (no load to move).
  return { decision: advancedThisSession ? 'progress' : 'hold', load: null, band, sets: state.sets };
}
