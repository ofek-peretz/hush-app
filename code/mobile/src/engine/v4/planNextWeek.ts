/**
 * Hush v4 engine — Phase 4: engine-global ordering + deload-by-fact (Frozen Spec §6/§9/§15,
 * Handoff rules 1/2/3/15/16/17, I-6/20/21/22).
 *
 * Global decision order (§6):
 *   1. adherence < 0.67  → hold all, sets −1 (floor), no progression → EMIT, STOP  (I-22)
 *   2. injury_flag       → DELOAD all (load×0.85, sets×0.50 floor, rep mid)        (I-20/21)
 *      extended_absence  → all load ×0.90, KEEP volume, fresh baseline (rebuild)   (I-6, §6 step 2)
 *   3. else              → per-slot reactive loop (§7) + swap consideration (§8)
 *
 * Deload is reachable ONLY from these two FACTS — never from any performance metric (I-34). There is
 * no calendar, systemic, or sustained-drop trigger; a declining lift flows into reprice + HOLD.
 *
 * This returns the raw per-slot decisions + updated state; safety rails, cross-slot volume
 * allocation, assembly, and explanations are applied afterward by Phase 5 (planWeek).
 */
import type {
  EngineProfile,
  SlotState,
  GlobalState,
  SlotResult,
  SlotDecision,
  WeekRecord,
  Pattern,
} from './types';
import { demonstrated, classifyTrend, progressMetric, normalizeLoad, type Trend } from './reads';
import { decideSlot, type ExerciseMeta, type SlotInputs } from './decisions';
import { swapAllowed, selectReplacement, applySwap, type LibraryEntry } from './swap';
import { DEFAULTS, REP_RANGE_BY_GOAL, type Constants } from './constants';

/** A hard per-slot minimum so a deload/adherence cut never empties a slot. Pattern-level MEV is
 *  reconciled by apply_rails (Phase 5); a deload week is permitted to sit at the floor (I-4). */
const MIN_SLOT_SETS = 2;

export interface PlanInputs {
  profile: EngineProfile;
  slots: SlotState[];
  global: GlobalState;
  results: SlotResult[]; // completed week (empty for week 0)
  meta: (exerciseId: string) => ExerciseMeta;
  // Swap providers — when omitted, engine-initiated swaps are skipped (manual replace still works).
  candidates?: (pattern: Pattern) => LibraryEntry[];
  recentlyUsed?: (slotId: string) => ReadonlySet<string>;
  seedLoad?: (exerciseId: string) => number | null;
  /** Pattern volume < ceiling AND session+1 ≤ cap for this slot (C-2). Default: always available. */
  volumeLeverAvailable?: (slotId: string) => boolean;
  consts?: Constants;
}

export interface CorePlan {
  decisions: SlotDecision[];
  updated_slots: SlotState[];
  updated_global: GlobalState;
  /** The dominant global mode this week, for explanation routing. */
  mode: 'adherence' | 'injury' | 'absence' | 'normal';
}

// ───────────────────────────── helpers ─────────────────────────────
function adherenceOf(results: SlotResult[]): number {
  let done = 0;
  let planned = 0;
  for (const r of results) {
    done += r.sessions_completed;
    planned += r.sessions_planned;
  }
  if (planned === 0) return 1; // nothing planned → not an adherence failure
  return done / planned;
}

function midRange([lo, hi]: [number, number]): number {
  return Math.round((lo + hi) / 2);
}

function decisionFrom(slot: SlotState, type: SlotDecision['type'], deltaKg?: number): SlotDecision {
  return {
    slotId: slot.slotId,
    pattern: slot.pattern,
    type,
    exercise_id: slot.current_exercise_id,
    load_kg: slot.current_load_kg,
    sets: slot.current_sets,
    rep_target: slot.rep_target,
    rep_range: slot.rep_range,
    deltaKg,
  };
}

function holdReduce(slot: SlotState, meta: ExerciseMeta): SlotState {
  // Adherence gate: hold everything, trim one set (floor), zero progression (I-22).
  return { ...slot, current_sets: Math.max(MIN_SLOT_SETS, slot.current_sets - 1) };
}

function deloadSlot(slot: SlotState, meta: ExerciseMeta, consts: Constants): SlotState {
  const load =
    meta.bodyweight || slot.current_load_kg == null
      ? slot.current_load_kg
      : normalizeLoad(slot.current_load_kg * consts.DELOAD_LOAD, meta.equipment, meta.observed_loads);
  return {
    ...slot,
    current_load_kg: load,
    current_sets: Math.max(MIN_SLOT_SETS, Math.round(slot.current_sets * consts.DELOAD_SETS)),
    rep_target: midRange(slot.rep_range),
    // fresh baseline next week
    flat_weeks: 0,
    hold_mode: false,
    levers_tried: [],
    miss_streak: 0,
  };
}

function absenceSlot(slot: SlotState, meta: ExerciseMeta): SlotState {
  // Ease ~10%, KEEP volume, rebuild (I-6: never resume above 0.90× pre-gap load).
  const load =
    meta.bodyweight || slot.current_load_kg == null
      ? slot.current_load_kg
      : normalizeLoad(slot.current_load_kg * 0.9, meta.equipment, meta.observed_loads);
  return {
    ...slot,
    current_load_kg: load,
    flat_weeks: 0,
    hold_mode: false,
    levers_tried: [],
    miss_streak: 0,
  };
}

function priorMetrics(slot: SlotState, goal: EngineProfile['goal']): number[] {
  // history is newest-first; trend baseline uses the previous up-to-2 weeks.
  return slot.history.map((w: WeekRecord) => progressMetric(w, goal));
}

// ───────────────────────────── the global run ─────────────────────────────
export function runWeek(inp: PlanInputs): CorePlan {
  const consts = inp.consts ?? DEFAULTS;
  const bySlot = new Map(inp.results.map((r) => [r.slotId, r]));

  // ── 1. Adherence gate (I-22) ──
  if (inp.results.length > 0 && adherenceOf(inp.results) < consts.ADHERENCE_MIN) {
    const updated_slots = inp.slots.map((s) => holdReduce(s, inp.meta(s.current_exercise_id)));
    return {
      decisions: updated_slots.map((s) => decisionFrom(s, 'adherence_hold')),
      updated_slots,
      updated_global: inp.global,
      mode: 'adherence',
    };
  }

  // ── 2a. Injury → full deload (I-20/21) ──
  if (inp.global.injury_flag) {
    const updated_slots = inp.slots.map((s) => deloadSlot(s, inp.meta(s.current_exercise_id), consts));
    return {
      decisions: updated_slots.map((s) => decisionFrom(s, 'deload')),
      updated_slots,
      updated_global: inp.global,
      mode: 'injury',
    };
  }

  // ── 2b. Extended absence → ease 10%, rebuild (I-6) ──
  if (inp.global.days_since_last_session > consts.ABSENCE_DAYS) {
    const updated_slots = inp.slots.map((s) => absenceSlot(s, inp.meta(s.current_exercise_id)));
    return {
      decisions: updated_slots.map((s) => decisionFrom(s, 'absence')),
      updated_slots,
      updated_global: inp.global,
      mode: 'absence',
    };
  }

  // ── 3. Per-slot reactive loop (§7) + swap consideration (§8) ──
  const decisions: SlotDecision[] = [];
  const updated_slots: SlotState[] = [];
  for (const slot of inp.slots) {
    const result = bySlot.get(slot.slotId);
    const meta = inp.meta(slot.current_exercise_id);

    if (!result) {
      // No completed data for this slot (e.g. week 0) → emit current prescription unchanged.
      decisions.push(decisionFrom(slot, slot.calibrating ? 'calibrate' : 'hold'));
      updated_slots.push(slot);
      continue;
    }

    const demo = demonstrated(result.sets, slot.rep_target);
    const nowMetric = demo.bodyweight ? demo.best_reps : (demo.best_e1rm ?? 0);
    const trend: Trend = classifyTrend(nowMetric, priorMetrics(slot, inp.profile.goal), inp.profile.training_age);

    const slotInputs: SlotInputs = {
      meta,
      ta: inp.profile.training_age,
      goal: inp.profile.goal,
      trend,
      volumeLeverAvailable: inp.volumeLeverAvailable ? inp.volumeLeverAvailable(slot.slotId) : true,
      consts,
    };
    let { decision, next } = decideSlot(slot, demo, slotInputs);

    // §8 swap consideration: only after a reprice, only on an isolated persistent mismatch.
    if (
      decision.type === 'reprice' &&
      inp.candidates &&
      swapAllowed(next, { available_equipment: inp.profile.available_equipment, trendDown: trend === 'DOWN', broadCause: false, consts })
    ) {
      const recents = inp.recentlyUsed ? inp.recentlyUsed(slot.slotId) : new Set<string>();
      const replacement = selectReplacement(
        next.current_exercise_id,
        inp.candidates(slot.pattern),
        inp.profile.available_equipment,
        recents,
      );
      if (replacement) {
        const seed = inp.seedLoad ? inp.seedLoad(replacement) : null;
        next = applySwap(next, replacement, seed, REP_RANGE_BY_GOAL[inp.profile.goal]);
        decision = decisionFrom(next, 'swap');
      }
    }

    decisions.push(decision);
    updated_slots.push(next);
  }

  return { decisions, updated_slots, updated_global: inp.global, mode: 'normal' };
}
