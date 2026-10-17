/**
 * ════ THE LIGHT WEEK — a deload that is EARNED BY EVIDENCE, ANNOUNCED, AND EXPLAINED ════
 * (founder authorization, 2026-08-24 — the competitive review's flagship engine gap)
 *
 * Every serious programme deloads; every competing engine does it badly, each in its own way:
 * Alpha Progression fires on the CALENDAR and misses real fatigue; RP's arrives UNANNOUNCED
 * (their help center keeps an article titled "Why did my training get so much easier?"); Dr.
 * Muscle only reacts per-exercise after the damage. The open lane — and the only shape this
 * engine is allowed to take (L1: facts it measured; L7: never the calendar) — is:
 *
 *   the deload is CALLED by the week's own evidence, told the moment it is born, and every
 *   moved load opens its reason.
 *
 * ── THE EVIDENCE (the observation) ──────────────────────────────────────────────────────────────
 * One lift below its rep floor is a bad day; Loop 2 already answers it (hold / back-off). A
 * DELOAD answers something none of the three loops can see: MOST of her lifts failing AT ONCE,
 * TWICE IN A ROW. Per lift, the fatigue mark requires all three, on its last two occurrences:
 *
 *   · both occurrences finished DEEP under the band floor (worst set ≥ `DELOAD_MISS_DEPTH` reps
 *     below Tlo) — persistent and unmistakable, never one-rep noise;
 *   · not improving (the last worst ≤ the previous worst) — sliding, not climbing back;
 *   · the load did not RISE between them — the misses are not explained by heavier iron. An equal
 *     load is plain fatigue; a lower one (a back-off she still missed under) is louder still.
 *
 * The trigger is the SHARE: at least `DELOAD_MIN_ELIGIBLE` lifts with enough history to judge,
 * and at least `DELOAD_TRIGGER_SHARE` of them carrying the mark. Noise cannot assemble that;
 * systemic fatigue is the only thing that looks like this.
 *
 * ── THE ANSWER (the action) ─────────────────────────────────────────────────────────────────────
 * One light week: every managed load steps down to `DELOAD_FRACTION` of itself (snapped to her
 * real grid, never under the floor), stamped in the changeLog like every other decision so the
 * Saturday letter and every why-sheet can say it. While the week runs, its sessions are RECORDED
 * and NEVER FOLDED — light work is recovery, not evidence about her capability — and Loop 1 does
 * not raise (a light bar always overshoots the band; correcting it up would undo the decision
 * mid-session). When the window lapses, the loads come back to exactly where they stood, stamped
 * again, and the loops resume from honest state.
 *
 * ── HYSTERESIS, NOT A CALENDAR ──────────────────────────────────────────────────────────────────
 * `DELOAD_COOLDOWN_DAYS` does not schedule anything; it only stops a deload from answering the
 * evidence of the previous deload's own aftermath. Between cooldowns the trigger is pure fact.
 *
 * Pure and clock-free: every function reads the timestamps it is handed.
 */

//

export const DELOAD_DAYS = 7;
/** The light week's load: 90% of standing — heavy enough to keep the pattern, light enough to recover. */
export const DELOAD_FRACTION = 0.9;
/** Fewer judgeable lifts than this cannot prove SYSTEMIC fatigue — no deload, whatever the share. */
export const DELOAD_MIN_ELIGIBLE = 4;
/** The share of judgeable lifts that must carry the fatigue mark. */
export const DELOAD_TRIGGER_SHARE = 0.5;
/** A deload may not answer its own aftermath. Hysteresis, not a schedule. */
export const DELOAD_COOLDOWN_DAYS = 28;
/** Below this much history the "systemic" read is not statistics — day-one noise never deloads. */
export const DELOAD_MIN_HISTORY_SESSIONS = 12;
/**
 * How far under the band floor a "miss" must land to count toward the mark, in reps.
 *
 * ⚠️ MEASURED, 2026-08-24, against `thePrescriptionIsAccurate`'s simulated athletes: an ordinary
 * athlete's sets miss the floor by ~1 rep all the time (the audit's own mean miss is ~0.9), and a
 * depth-1 trigger fired on her — a deload answering NOISE, which is exactly Alpha Progression's
 * calendar mistake wearing an evidence costume. Two reps under, twice running, across half the
 * roster is a pattern noise does not assemble.
 */
export const DELOAD_MISS_DEPTH = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The open light week, as stored on EngineV5State. `restore` holds every pre-deload load. */
export interface DeloadState {
  startedAt: number;
  endsAt: number;
  restore: Record<string, number | null>;
}

/** The slice of ExerciseState the trigger reads — structural, so the module stays pure. */
export interface DeloadExerciseView {
  load: number | null;
  band: { lo: number; hi: number };
  /** Newest-first occurrence records, exactly as the fold keeps them. */
  history: { load?: number | null; sets: { reps: number; isApproach?: boolean }[] }[];
}

const worstOf = (sets: { reps: number; isApproach?: boolean }[]): number | null => {
  const working = sets.filter((s) => !s.isApproach && s.reps > 0);
  return working.length === 0 ? null : Math.min(...working.map((s) => s.reps));
};

/** Does this lift carry the fatigue mark? (see the header — all three conditions, last two occurrences) */
export function liftIsFatigued(ex: DeloadExerciseView): boolean {
  const [last, prev] = ex.history;
  if (!last || !prev) return false;
  const lastWorst = worstOf(last.sets);
  const prevWorst = worstOf(prev.sets);
  if (lastWorst == null || prevWorst == null) return false;
  const deep = ex.band.lo - DELOAD_MISS_DEPTH; // e.g. band 8-10 → a counting miss is ≤ 6
  if (!(lastWorst <= deep && prevWorst <= deep)) return false; // persistent AND deep, not a slip
  if (!(lastWorst <= prevWorst)) return false; // sliding, not climbing back
  const lastLoad = last.load ?? 0;
  const prevLoad = prev.load ?? 0;
  // The misses are not explained by heavier iron: the load did not RISE between the two
  // occurrences. Equal load = plain fatigue; a LOWER load is worse still — she is missing the
  // floor even after Loop 2 backed her off, which is the loudest version of the same fact.
  return lastLoad <= prevLoad + 1e-6;
}

export interface DeloadVerdict {
  due: boolean;
  eligible: number;
  fatigued: number;
}

/**
 * Is a light week due, at the fold moment `atMs`? Pure over the state it is handed.
 * `historySessions` = completed sessions on record (the statistics floor);
 * `lastDeloadStartedAt` = the previous deload's opening stamp, for the hysteresis.
 */
export function deloadDue(inputs: {
  atMs: number;
  exercises: Record<string, DeloadExerciseView>;
  managed: ReadonlySet<string>;
  historySessions: number;
  lastDeloadStartedAt: number | null;
}): DeloadVerdict {
  const { atMs, exercises, managed, historySessions, lastDeloadStartedAt } = inputs;
  const none: DeloadVerdict = { due: false, eligible: 0, fatigued: 0 };
  if (historySessions < DELOAD_MIN_HISTORY_SESSIONS) return none;
  if (lastDeloadStartedAt != null && atMs - lastDeloadStartedAt < DELOAD_COOLDOWN_DAYS * DAY_MS) return none;

  let eligible = 0;
  let fatigued = 0;
  for (const id of Object.keys(exercises)) {
    if (!managed.has(id)) continue;
    const ex = exercises[id];
    if (ex.load == null) continue; // bodyweight — no load axis to lighten (S-51)
    if (ex.history.length < 2) continue; // not judgeable yet
    eligible += 1;
    if (liftIsFatigued(ex)) fatigued += 1;
  }
  const due = eligible >= DELOAD_MIN_ELIGIBLE && fatigued / eligible >= DELOAD_TRIGGER_SHARE;
  return { due, eligible, fatigued };
}

/** Is `atMs` inside an open light week? */
export function deloadActiveAt(deload: DeloadState | null | undefined, atMs: number): boolean {
  return deload != null && atMs >= deload.startedAt && atMs < deload.endsAt;
}
