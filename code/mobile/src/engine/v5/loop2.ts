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
import { snapDown, moveRungs, nextRung, prevRung, loadFloor, isBigJump } from './grid';
import { repsPerRung, rungsForHeadroom } from './repsPerRung';
import { RECENCY_WINDOW_SESSIONS, N_PERCENTILE, ATTEMPTS_TO_CLEAR_SEED } from './constants';

const EPS = 1e-6;

/** Working sets only. `isApproach` marks LEGACY Build-#33 approach sets (Rev 8 deleted the
 *  mechanism; nothing writes the mark any more) — they stay excluded so those histories never
 *  pollute a decision. */
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
 * one, inside the recency window). null when there is no such record → the rail is inactive, and
 * deliberately nothing replaces it there (L11, Rev 8): the guard is Loop 1 correcting from the very
 * first set, plus the athlete's own eyes on a visible number (S-49). Never reads the current
 * session, so a fat-finger cannot lift its own ceiling.
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
 * Inactive (no settled record AND no anchor) → unchanged; on a never-done lift Loop 1 and her own
 * eyes are the guard (L11 / S-49 — no ceiling is invented for that moment).
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

/** Consecutive newest sessions at the CURRENT load that did not clear, incl. this (uncleared) one.
 *  Loaded lifts only — the bodyweight path runs the same S-25 read on the reps axis instead. */
function attemptsAtCurrentLoad(state: ExerciseState, band: Band): number {
  let count = 1;
  for (const rec of state.history.slice(0, RECENCY_WINDOW_SESSIONS)) {
    const sameLoad = rec.load != null && state.load != null && Math.abs(rec.load - state.load) < EPS;
    const cleared = rec.sets.length > 0 && rec.sets.every((s) => metTlo(s, band));
    if (!sameLoad || cleared) break;
    count += 1;
  }
  return count;
}

/**
 * The heaviest load in her history where ALL sets met Tlo — the back-off target (S-25.1) — read
 * STRICTLY BELOW the load she is stalled at.
 *
 * The "below" is the whole point and it was missing: S-25.1 says "back OFF and re-climb," and a
 * back-off target equal to the current load is not a back-off, it is a freeze. It happens on a real
 * path: she clears 40 (→ 42.5), fails 42.5 twice (→ back to 40), then fails 40 twice — the window
 * still holds her old 40 clear, so the "heaviest full clear" was 40, the load never moved, and
 * `isRepeatedStall` never fired either (it needs an occurrence LOWER than the current load, and
 * 42.5 is not lower). The lift stalled at 40 for ever, decision after decision, with nothing in the
 * changeLog to show for it. Reading only below the wall means the engine always has a real step
 * down — her heaviest proven lighter load, else one rung (the caller's fallback).
 */
function heaviestFullClear(history: SessionRecord[], band: Band, below: number): number | null {
  let best: number | null = null;
  for (const rec of history.slice(0, RECENCY_WINDOW_SESSIONS)) {
    if (rec.load == null || rec.sets.length === 0) continue;
    if (rec.load >= below - EPS) continue; // not a back-off — S-25.1 steps DOWN or not at all
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
    // The rung she is about to be asked for — priced at THE ANCHOR, not at her grid's top (S-28).
    const perRung = repsPerRung(inp.session, state.history, meta, anchor);

    // S-28 · THE NEXT RUNG IS A BIG JUMP. Two conditions, both stated in the situation itself:
    //   (1) "a machine with 10 kg pins; NO MICRO-LOADING" — the real rung exceeds the equipment's
    //       finest step (isBigJump). False on a barbell, so S-22 below is untouched there.
    //   (2) "the load cannot move without breaking her" — her own measured reps-per-rung says the
    //       step lands her under Tlo. The release is the same number read the other way: "when her
    //       reps give her a FULL RUNG'S WORTH OF HEADROOM, the rung is taken" (reps − perRung ≥ Tlo).
    // Then: "T is hers, so the engine may not quietly raise it" — the load HOLDS at the anchor, she
    // climbs reps at it, and the engine SAYS SO. Silent until her slope is fitted (F-12): with no
    // measured perRung there is no fact that the jump breaks her, and B-5's cautious rung stands.
    if (perRung != null && isBigJump(anchor, meta.equipment, meta.observedLoads) && worstReps - perRung < band.lo) {
      return { decision: 'rung_out_of_reach', load: anchor, band, sets: state.sets };
    }

    const n = rungsForHeadroom(worstReps - band.lo, perRung);
    let load = snapDown(moveRungs(anchor, n, meta.equipment, meta.observedLoads), meta.equipment, meta.observedLoads);
    load = applyRail(load, state.history, band, meta, anchor); // L11 (base = max(settled, anchor))
    return { decision: 'progress', load, band, sets: state.sets };
  }

  // Not all met Tlo → S-24 hold, unless it is a stall (S-25).
  const attempts = attemptsAtCurrentLoad(state, band);
  const N = attemptsToClearN(state.history, band);

  // S-25: a stall is failing this load MORE times than her own typical attempts-to-clear (strict).
  if (attempts > N) {
    // S-25.1: back off to the heaviest full-clear load, else one rung down; re-climb. The load backs
    // off in BOTH the back-off and the rotate case (the rotated-from lift trains it until the roll).
    const backTo = heaviestFullClear(state.history, band, state.load);
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
/** The occurrence's WORST working set's reps — the scalar the reps axis progresses on (S-51). Reads
 *  ALL sets, the same discipline as S-22 ("10/9/8 ≠ 10/7/5"). null when nothing was performed. */
function repsScore(sets: SetPerf[]): number | null {
  const usable = sets.filter((s) => !s.isApproach && s.reps > 0);
  if (usable.length === 0) return null;
  return Math.min(...usable.map((s) => s.reps));
}

/**
 * S-51/S-52 — a bodyweight lift has no load axis, so REPS carry the progression and the S-25 stall
 * machinery runs on the reps axis:
 *
 *   · "advanced" is a FACT: this occurrence's worst-set reps beat every previous occurrence's (a
 *     first occurrence sets the wall). Merely repeating a number — even a number at Tlo — is not an
 *     advance, which is what keeps Loop 3 honest (S-32b: completed but nothing advanced → hold).
 *   · a STALL is exceeding her own attempts-to-improve: N = the 75th percentile (nearest-rank, F-13)
 *     of the occurrences she has historically spent before adding a rep to her worst set (B-3 seed
 *     until she has one). This is what frees the register's own trap case — the athlete in a 12-15
 *     band stuck flat at 3×12: she meets Tlo every time, so a "failed to clear Tlo" read would never
 *     fire and she would be frozen forever with no load lever. Reps not moving IS the wall.
 *   · and the converse trap: a lift climbing reps BELOW Tlo (every new lift right after a
 *     graduation) is ADVANCING, not stalling — the old "not every set met Tlo" read would have
 *     graduated her again after two occurrences of honest climbing, cascading up the ladder.
 *
 * Two graduation triggers, exactly as S-52 states them: every set at Thi (too easy), or a stall.
 */
function decideBodyweight(inp: Loop2Input, sets: SetPerf[]): Loop2Result {
  const { state } = inp;
  const band = state.band;
  const score = repsScore(sets);
  if (score == null) return { decision: 'ambiguous', load: null, band, sets: state.sets };

  const allMetThi = sets.every((s) => s.reps >= band.hi); // S-52 trigger 1: too easy
  if (allMetThi) {
    return { decision: 'graduate', load: null, band, sets: state.sets, wantsChange: 'graduate' };
  }

  // Her past scores, oldest-first, inside the recency window (F-8).
  const past = [...state.history.slice(0, RECENCY_WINDOW_SESSIONS)]
    .reverse()
    .map((r) => repsScore(r.sets))
    .filter((s): s is number => s != null);
  let best: number | null = null;
  let trailing = 0; // consecutive most-recent occurrences that failed to improve
  const runs: number[] = []; // occurrences spent before each improvement — her attempts-to-improve
  let run = 0;
  for (const s of past) {
    run += 1;
    if (best == null || s > best) {
      runs.push(run);
      run = 0;
      best = s;
      trailing = 0;
    } else {
      trailing += 1;
    }
  }
  const advanced = best == null || score > best;
  if (advanced) return { decision: 'progress', load: null, band, sets: state.sets };

  // S-52 trigger 2: a stall below Thi — she cannot add reps, and there is no load to add.
  const N = runs.length === 0 ? ATTEMPTS_TO_CLEAR_SEED : Math.max(1, percentileNearestRank(runs, N_PERCENTILE));
  const attempts = trailing + 1; // the flat occurrences before this one, plus this one
  if (attempts > N) {
    return { decision: 'graduate', load: null, band, sets: state.sets, wantsChange: 'graduate' };
  }
  return { decision: 'hold', load: null, band, sets: state.sets };
}
