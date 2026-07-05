/**
 * Hush v4 engine — Phase 2: the per-slot decision core + state-machine routing.
 *
 * Each week a slot resolves into exactly ONE single-week action mode from observed data
 * (Handoff Artifact 3): CALIBRATING (persists until exit), PROGRESSING, REPRICING,
 * FLAT_HOLD_LEVERS, PATIENT_HOLD. The rules:
 *   • Missed → reprice load to demonstrated, KEEP volume, KEEP rep_target (rules 4, I-12/13).
 *   • Beat-with-room / trend UP → +1 rep_target (cap range top) else +STEP load reset to bottom (rule 5).
 *   • FLAT only acts after STALL_WINDOW; then the Minimum-Effective-Intervention ladder
 *     vol→load→range, one lever per week (rules 7/8, I-14/15), else PATIENT HOLD with a periodic
 *     load probe every PATIENT_PROBE_EVERY weeks (rule 9, I-16).
 *   • CALIBRATING per rule 22 / I-19: best≥target+3 → ×1.10; missed → ×0.90; else +STEP; exit after
 *     2 in-range (|best−target|≤2, not missed) weeks → seed discarded (no seed is ever stored, I-18).
 *
 * NO fatigue/variance/decay/trajectory is read anywhere; volume is never cut on a miss; the rail and
 * cross-slot volume allocation are applied LATER by apply_rails (Phase 5). This module is pure.
 */
import type {
  SlotState,
  SlotDecision,
  Equipment,
  EngineGoal,
  TrainingAge,
  LeverTag,
} from './types';
import { type Demonstrated, type Trend, type BodyRegion, type Tier, step, normalizeLoad } from './reads';
import { DEFAULTS, RANGE_ALTERNATE, type Constants } from './constants';

export interface ExerciseMeta {
  region: BodyRegion;
  tier: Tier;
  equipment: Equipment;
  bodyweight: boolean;
  /** The athlete's observed achievable loads for this exercise (the learned equipment grid).
   *  Injected by the integration façade from preserved history; absent for pure-engine callers,
   *  in which case normalizeLoad falls back to the static increment. */
  observed_loads?: number[];
}

export interface SlotInputs {
  meta: ExerciseMeta;
  ta: TrainingAge;
  goal: EngineGoal;
  trend: Trend;
  /** Pattern volume < ceiling AND session_sets+1 ≤ SESSION_SET_CAP — computed by the caller across
   *  the whole program (C-2). When false, the volume lever is skipped and the ladder escalates. */
  volumeLeverAvailable: boolean;
  consts?: Constants;
}

export interface SlotOutcome {
  decision: SlotDecision;
  next: SlotState;
}

const top = (s: SlotState) => s.rep_range[1];
const bottom = (s: SlotState) => s.rep_range[0];

/** Normalize an ideal load onto the athlete's observed grid (round DOWN to the nearest real rung),
 *  falling back to the static increment when no grid is known. The engine still decides the ideal
 *  load; this only picks the closest achievable real-world load. */
const gridNorm = (load: number, meta: ExerciseMeta): number =>
  normalizeLoad(load, meta.equipment, meta.observed_loads);

/** A single mis-entry must not double the prescription: an upward anchor adoption is capped at
 *  this multiple of the prescribed load (a genuine 2× underestimate still closes in one week). */
const ANCHOR_RAISE_CAP = 2;

/**
 * The load a weekly decision steps FROM: the load the athlete actually lifted this week when it
 * differs from the prescription (the prescription is a hypothesis; the completed sets are the
 * truth — Handoff §1.1.2). An athlete who put more on the bar than Hush asked for has demonstrated
 * that load; stepping from the stale prescription ignored the evidence and left the number wrong
 * for months. Downward differences are adopted as-is (they were performed); upward differences are
 * capped at ANCHOR_RAISE_CAP× to bound a typo. Bodyweight / empty weeks anchor on the prescription.
 */
function anchorLoad(slot: SlotState, demo: Demonstrated, meta: ExerciseMeta): number | null {
  const prescribed = slot.current_load_kg;
  if (meta.bodyweight || prescribed == null || demo.best_load == null) return prescribed;
  if (demo.best_load > prescribed) return Math.min(demo.best_load, prescribed * ANCHOR_RAISE_CAP);
  return demo.best_load;
}

/** A decision that prescribes the given fields and threads the durable counters forward. */
function emit(
  slot: SlotState,
  type: SlotDecision['type'],
  fields: Partial<SlotDecision> & Partial<SlotState>,
): SlotOutcome {
  const next: SlotState = {
    ...slot,
    current_exercise_id: slot.current_exercise_id,
    current_load_kg: fields.current_load_kg ?? fields.load_kg ?? slot.current_load_kg,
    current_sets: fields.current_sets ?? fields.sets ?? slot.current_sets,
    rep_target: fields.rep_target ?? slot.rep_target,
    rep_range: fields.rep_range ?? slot.rep_range,
    tenure_weeks: fields.tenure_weeks ?? slot.tenure_weeks,
    flat_weeks: fields.flat_weeks ?? slot.flat_weeks,
    miss_streak: fields.miss_streak ?? slot.miss_streak,
    levers_tried: fields.levers_tried ?? slot.levers_tried,
    hold_mode: fields.hold_mode ?? slot.hold_mode,
    weeks_since_swap: fields.weeks_since_swap ?? slot.weeks_since_swap,
    calibrating: fields.calibrating ?? slot.calibrating,
    calib_weeks: fields.calib_weeks ?? slot.calib_weeks,
  };
  const decision: SlotDecision = {
    slotId: slot.slotId,
    pattern: slot.pattern,
    type,
    exercise_id: slot.current_exercise_id,
    load_kg: next.current_load_kg,
    sets: next.current_sets,
    rep_target: next.rep_target,
    rep_range: next.rep_range,
    deltaKg: fields.deltaKg,
  };
  return { decision, next };
}

// ───────────────────────────── CALIBRATING (rule 22 / I-19) ─────────────────────────────
export function calibrate(slot: SlotState, demo: Demonstrated, meta: ExerciseMeta, consts: Constants = DEFAULTS): SlotOutcome {
  const target = slot.rep_target;
  const inRange = !demo.missed && !demo.empty && Math.abs(demo.best_reps - target) <= 2;
  // Calibration corrections apply to the load the athlete actually LIFTED, not the guess they
  // ignored — an athlete who put 90 on a 50 kg prescription has already calibrated themselves.
  let load = anchorLoad(slot, demo, meta);
  let deltaKg: number | undefined;

  if (!meta.bodyweight && load != null) {
    if (demo.empty || demo.missed) {
      load = gridNorm(load * 0.9, meta);
    } else if (demo.best_reps >= target + 3) {
      load = gridNorm(load * 1.1, meta);
    } else {
      const st = step(load, meta.region, meta.tier);
      deltaKg = st;
      load = gridNorm(load + st, meta);
    }
  }

  const inRangeCount = slot.calib_weeks + (inRange ? 1 : 0);
  const exit = inRangeCount >= 2;
  return emit(slot, 'calibrate', {
    current_load_kg: load,
    tenure_weeks: slot.tenure_weeks + 1,
    weeks_since_swap: slot.weeks_since_swap + 1,
    calib_weeks: exit ? 0 : inRangeCount,
    calibrating: !exit,
    deltaKg,
  });
}

// ───────────────────────────── REPRICING (rule 4, I-12/13) ─────────────────────────────
export function repriceKeepVolume(slot: SlotState, demo: Demonstrated, meta: ExerciseMeta): SlotOutcome {
  // Bodyweight has no load to reprice — hold everything, bank the miss.
  if (meta.bodyweight || slot.current_load_kg == null) {
    return emit(slot, 'reprice', {
      miss_streak: slot.miss_streak + 1,
      flat_weeks: 0,
      hold_mode: false,
      levers_tried: [],
      tenure_weeks: slot.tenure_weeks + 1,
      weeks_since_swap: slot.weeks_since_swap + 1,
    });
  }
  // Reprice DOWN to demonstrated capability; never raise on a miss (I-13). KEEP sets + rep_target (I-12).
  const target = slot.current_load_kg;
  const demoLoad = demo.demonstrated_load_at_target ?? target;
  const load = gridNorm(Math.min(target, demoLoad), meta);
  return emit(slot, 'reprice', {
    current_load_kg: load,
    miss_streak: slot.miss_streak + 1,
    flat_weeks: 0,
    hold_mode: false,
    levers_tried: [],
    tenure_weeks: slot.tenure_weeks + 1,
    weeks_since_swap: slot.weeks_since_swap + 1,
  });
}

// ───────────────────────────── all-zero week (C4-2) ─────────────────────────────
function emptyWeek(slot: SlotState, meta: ExerciseMeta): SlotOutcome {
  // No demonstrated capability → load ×0.90, KEEP volume + rep_target. Does NOT bank a miss
  // (a logged zero week is ambiguous, not a demonstrated failure — avoids a spurious swap).
  const load =
    meta.bodyweight || slot.current_load_kg == null ? slot.current_load_kg : gridNorm(slot.current_load_kg * 0.9, meta);
  return emit(slot, 'reprice', {
    current_load_kg: load,
    flat_weeks: 0,
    hold_mode: false,
    tenure_weeks: slot.tenure_weeks + 1,
    weeks_since_swap: slot.weeks_since_swap + 1,
  });
}

// ───────────────────────────── REACTIVE PROGRESS (rules 5/7/8/9) ─────────────────────────────
function progress(slot: SlotState, demo: Demonstrated, meta: ExerciseMeta): SlotOutcome {
  const cleared = { flat_weeks: 0, hold_mode: false, levers_tried: [] as LeverTag[], miss_streak: 0,
    tenure_weeks: slot.tenure_weeks + 1, weeks_since_swap: slot.weeks_since_swap + 1 };
  // Below the range top → earn a rep first (at the load actually lifted, when it differs).
  if (slot.rep_target < top(slot)) {
    const adopted = anchorLoad(slot, demo, meta);
    return emit(slot, 'progress_reps', {
      ...cleared,
      rep_target: slot.rep_target + 1,
      current_load_kg: meta.bodyweight || adopted == null ? slot.current_load_kg : gridNorm(adopted, meta),
    });
  }
  // At the range top → add load, reset to the bottom (bodyweight has no load → graduate variation).
  if (meta.bodyweight || slot.current_load_kg == null) {
    return emit(slot, 'progress_load', { ...cleared, rep_target: top(slot) }); // hold at top; variation surfaced at integration
  }
  const base = anchorLoad(slot, demo, meta) ?? slot.current_load_kg;
  const st = step(base, meta.region, meta.tier);
  const load = gridNorm(base + st, meta);
  return emit(slot, 'progress_load', { ...cleared, current_load_kg: load, rep_target: bottom(slot), deltaKg: st });
}

function rangeChange(slot: SlotState, demo: Demonstrated, meta: ExerciseMeta): [number, number] {
  const [lo, hi] = slot.rep_range;
  const alt = RANGE_ALTERNATE.find((r) => r.from[0] === lo && r.from[1] === hi);
  return alt ? alt.to : slot.rep_range;
}

export function reactiveProgress(slot: SlotState, demo: Demonstrated, inp: SlotInputs): SlotOutcome {
  const consts = inp.consts ?? DEFAULTS;
  const { meta } = inp;

  // BEAT TARGET (room) or trend UP → progress (rule 5).
  if (demo.room || inp.trend === 'UP') return progress(slot, demo, meta);

  // DOWN (first occurrence): hold, re-test next week — no withdrawal (§7).
  if (inp.trend === 'DOWN') {
    return emit(slot, 'hold', { tenure_weeks: slot.tenure_weeks + 1, weeks_since_swap: slot.weeks_since_swap + 1 });
  }

  // FLAT: act only after the STALL_WINDOW (rule 7 / I-14).
  const flat_weeks = slot.flat_weeks + 1;
  const window = consts.STALL_WINDOW[inp.ta];
  if (flat_weeks <= window) {
    return emit(slot, 'hold', {
      flat_weeks,
      tenure_weeks: slot.tenure_weeks + 1,
      weeks_since_swap: slot.weeks_since_swap + 1,
    });
  }

  // Past the window → Minimum-Effective-Intervention ladder, one lever/week (rule 8 / I-15).
  const tried = new Set(slot.levers_tried);
  const carry = { flat_weeks, tenure_weeks: slot.tenure_weeks + 1, weeks_since_swap: slot.weeks_since_swap + 1 };

  if (!tried.has('vol') && inp.volumeLeverAvailable) {
    return emit(slot, 'lever_vol', { ...carry, current_sets: slot.current_sets + 1, levers_tried: [...slot.levers_tried, 'vol'] });
  }
  if (!tried.has('load') && !meta.bodyweight && slot.current_load_kg != null) {
    const base = anchorLoad(slot, demo, meta) ?? slot.current_load_kg;
    const st = step(base, meta.region, meta.tier);
    const load = gridNorm(base + st, meta);
    return emit(slot, 'lever_load', { ...carry, current_load_kg: load, levers_tried: [...slot.levers_tried, 'load'], deltaKg: st });
  }
  if (!tried.has('range')) {
    const newRange = rangeChange(slot, demo, meta);
    const newTarget = newRange[0];
    let load = slot.current_load_kg;
    if (!meta.bodyweight && demo.best_e1rm) load = gridNorm(demo.best_e1rm / (1 + newTarget / 30), meta);
    return emit(slot, 'lever_range', {
      ...carry,
      rep_range: newRange,
      rep_target: newTarget,
      current_load_kg: load,
      levers_tried: [...slot.levers_tried, 'range'],
    });
  }

  // All levers exhausted → PATIENT HOLD; a single load probe every PATIENT_PROBE_EVERY flat weeks (rule 9 / I-16).
  const probe = flat_weeks % consts.PATIENT_PROBE_EVERY === 0;
  if (probe && !meta.bodyweight && slot.current_load_kg != null) {
    const base = anchorLoad(slot, demo, meta) ?? slot.current_load_kg;
    const st = step(base, meta.region, meta.tier);
    const load = gridNorm(base + st, meta);
    return emit(slot, 'patient_hold', { ...carry, hold_mode: true, current_load_kg: load, deltaKg: st });
  }
  return emit(slot, 'patient_hold', { ...carry, hold_mode: true });
}

// ───────────────────────────── routing (state-machine wiring, Artifact 3) ─────────────────────────────
/** Resolve a slot for the week: calibrate → empty → reprice(miss) → reactive. Pure. */
export function decideSlot(slot: SlotState, demo: Demonstrated, inp: SlotInputs): SlotOutcome {
  if (slot.calibrating) return calibrate(slot, demo, inp.meta, inp.consts ?? DEFAULTS);
  if (demo.empty) return emptyWeek(slot, inp.meta);
  if (demo.missed) return repriceKeepVolume(slot, demo, inp.meta);
  return reactiveProgress(slot, demo, inp);
}
