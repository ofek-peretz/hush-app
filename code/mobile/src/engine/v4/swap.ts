/**
 * Hush v4 engine — Phase 3: exercise change (Frozen Spec §8, Handoff rules 18–21, I-7..I-11/39/40).
 *
 * NO scoring, NO benefit/cost arithmetic, NO "another exercise is theoretically better" trigger
 * (I-37/I-39). Attachment is protected by LOCKED (the athlete's stated choice); churn by a 4-week
 * minimum tenure; the trigger is a BINARY observed mismatch of the CURRENT exercise. Selection is
 * deterministic (I-40 / C3-7: first in library order on ties).
 *
 * SLOT-DURABLE swap (approved C-1): a swap keeps the slot's identity (slotId, pattern, order_index,
 * locked) and re-initializes only the exercise-scoped fields — the new lift starts CALIBRATING.
 */
import type { SlotState, Pattern, Equipment } from './types';
import { DEFAULTS, type Constants } from './constants';

export interface LibraryEntry {
  id: string;
  pattern: Pattern;
  is_compound: boolean;
  equipment: Equipment;
  bodyweight?: boolean;
}

export interface SwapContext {
  available_equipment: Equipment[];
  /** The slot's trend is DOWN this week (Frozen Spec §15 swap precondition). */
  trendDown: boolean;
  /** A broad cause is in play this week (extended absence / injury) → mismatch is NOT isolated. */
  broadCause: boolean;
  consts?: Constants;
}

/**
 * Whether an engine-initiated swap is permitted this week. LOCKED never swaps (I-7); a calibrating
 * lift has no tenure and cannot be replaced (Artifact 3.3); tenure < 4 never swaps (I-9); within 4
 * weeks of the last swap never swaps (I-10); a broad cause is not isolated; otherwise swap iff
 * miss_streak ≥ MISS_ESCALATE and the trend is DOWN (I-11). A LOCKED lift can still be replaced
 * MANUALLY by the athlete — this gate governs only ENGINE-initiated swaps.
 */
export function swapAllowed(slot: SlotState, ctx: SwapContext): boolean {
  const c = ctx.consts ?? DEFAULTS;
  if (slot.locked) return false; // I-7
  if (slot.calibrating) return false; // forbidden transition CALIBRATING→swap
  if (slot.tenure_weeks < c.SWAP_MIN_TENURE) return false; // I-9
  if (slot.weeks_since_swap < c.SWAP_COOLDOWN_WEEKS) return false; // I-10
  if (ctx.broadCause) return false; // mismatch not isolated
  return slot.miss_streak >= c.MISS_ESCALATE && ctx.trendDown; // I-11
}

/**
 * Pick the replacement exercise: same pattern, equipment available, prefer the same compound class,
 * unused in the last SWAP_REUSE_WEEKS weeks. Deterministic — first in library order on ties (C3-7 /
 * I-40). Returns undefined when nothing qualifies (caller does an in-place fallback, E-no-equipment).
 *
 * `candidates` must be passed in canonical (stable) library order. `recentlyUsed` is the set of
 * exercise ids this slot has run within the reuse window.
 */
export function selectReplacement(
  currentId: string,
  candidates: LibraryEntry[],
  available: Equipment[],
  recentlyUsed: ReadonlySet<string>,
): string | undefined {
  const avail = new Set(available);
  const cur = candidates.find((e) => e.id === currentId);
  const pool = candidates.filter((e) => e.id !== currentId && avail.has(e.equipment) && !recentlyUsed.has(e.id));
  if (pool.length === 0) return undefined;
  const sameClass = cur ? pool.filter((e) => e.is_compound === cur.is_compound) : [];
  const ordered = sameClass.length > 0 ? sameClass : pool; // same-class preferred; else any
  return ordered[0].id; // library order is the deterministic tie-break (C3-7)
}

/**
 * Apply a swap to a slot: keep the durable identity, re-initialize the exercise-scoped state, start
 * CALIBRATING (Frozen Spec §8). `seedLoad` is the cold-start load for the replacement (null for
 * bodyweight); `scheme` is the goal rep range/target.
 */
export function applySwap(
  slot: SlotState,
  replacementId: string,
  seedLoad: number | null,
  scheme: { range: [number, number]; target: number },
): SlotState {
  return {
    // slot-durable (C-1)
    slotId: slot.slotId,
    pattern: slot.pattern,
    order_index: slot.order_index,
    locked: slot.locked,
    // exercise-scoped — reset
    current_exercise_id: replacementId,
    current_load_kg: seedLoad,
    current_sets: slot.current_sets, // the slot keeps its volume; the new lift calibrates into it
    rep_target: scheme.target,
    rep_range: scheme.range,
    tenure_weeks: 0,
    flat_weeks: 0,
    miss_streak: 0,
    levers_tried: [],
    hold_mode: false,
    weeks_since_swap: 0,
    calibrating: true,
    calib_weeks: 0,
    history: [],
  };
}
