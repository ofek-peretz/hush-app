/**
 * Hush v4 engine — Phase 5a: safety rails, the LAST transform before output (Frozen Spec §11,
 * Handoff rules 10–14b, I-1..I-5b, I-29). Nothing may prescribe past this.
 *
 *   I-1  implied-e1RM rail: load×(1+rep_target/30) ≤ best_e1rm×(1+RAIL_HEADROOM). Caps DEMAND, not
 *        raw load; inactive for a never-demonstrated (CALIBRATING) lift.
 *   I-2  single load jump ≤ 10% (except calibrate ×1.10/×0.90, deload ×0.85, absence ×0.90).
 *   I-2b loads are already round-DOWN normalized upstream; the rail is re-checked here.
 *   I-4/5/5b  pattern weekly volume ≤ ceiling; ≤ +1 set/pattern; ≤ 2 patterns get +1; RA-1 order:
 *        session-cap-safe → spread-not-stack → longest-flat → pattern enum (session-aware parts are
 *        supplied by the integration assembler via sessionOf; engine enforces flat→enum + ceiling).
 *   I-29 rep_target ∈ rep_range.
 *
 * Operates on (decision, slot, prev) triples so reverted volume levers also roll back slot state.
 */
import type { SlotDecision, SlotState, Equipment, TrainingAge } from './types';
import { PATTERNS } from './constants';
import { normalizeLoad, LOAD_INCREMENT } from './reads';
import { DEFAULTS, type Constants } from './constants';

export interface SlotPlan {
  decision: SlotDecision;
  slot: SlotState; // the engine's proposed next state
  prev: SlotState; // last week's state (for jump cap + volume revert)
  bestE1rm: number | null; // demonstrated this week (null → rail inactive)
  /** Heaviest load actually lifted this week — the jump cap's upward base includes it, so a
   *  decision anchored on the performed load (athlete lifted heavier than prescribed) is not
   *  clamped back to ±10% of the stale prescription. Null when nothing was lifted. */
  performedMax?: number | null;
  equipment: Equipment;
}

export interface RailCtx {
  ta: TrainingAge;
  consts?: Constants;
  /** Workout key a slot belongs to — lets the rail enforce the session set cap (I-3) and RA-1
   *  session-spread. Supplied by the split-library integration; omitted in pure tests. */
  sessionOf?: (slotId: string) => string;
}

const EXEMPT_FROM_JUMP_CAP = new Set<SlotDecision['type']>(['calibrate', 'deload', 'absence']);

/** Clamp a single slot's load + rep_target to the rail and the jump cap. Mutates the triple. */
function railSlot(p: SlotPlan, consts: Constants): void {
  const d = p.decision;
  // I-29 rep_target within range.
  const [lo, hi] = d.rep_range;
  if (d.rep_target < lo) d.rep_target = lo;
  if (d.rep_target > hi) d.rep_target = hi;

  if (d.load_kg == null) {
    sync(p);
    return;
  }

  // I-1 implied-e1RM rail (inactive for a CALIBRATING / never-demonstrated lift).
  if (d.type !== 'calibrate' && p.bestE1rm != null) {
    const maxLoad = (p.bestE1rm * (1 + consts.RAIL_HEADROOM)) / (1 + d.rep_target / 30);
    if (d.load_kg > maxLoad) d.load_kg = normalizeLoad(maxLoad, p.equipment);
  }

  // I-2 jump cap (±10%), except calibration / deload / absence moves. The UPWARD base is the
  // heavier of the prior prescription and what was actually lifted this week — a performed load
  // IS a demonstrated single-week reality, so stepping from it is not a jump. The DOWNWARD cap
  // stays prescription-based (staged descent, unchanged).
  if (!EXEMPT_FROM_JUMP_CAP.has(d.type) && p.prev.current_load_kg != null) {
    const prev = p.prev.current_load_kg;
    const upBase = Math.max(prev, p.performedMax ?? 0);
    const up = upBase * (1 + consts.LOAD_STEP_CAP);
    const down = prev * (1 - consts.LOAD_STEP_CAP);
    if (d.load_kg > up) d.load_kg = normalizeLoad(up, p.equipment);
    if (d.load_kg < down) d.load_kg = normalizeLoad(down, p.equipment);
  }

  // Load floor: a prescription may never fall to/below zero — clamp to the smallest loadable
  // increment so the weight stays real and loadable (I-2b / validation: load > 0).
  const inc = LOAD_INCREMENT[p.equipment];
  if (inc > 0 && d.load_kg < inc) d.load_kg = inc;
  sync(p);
}

/** Keep the slot state consistent with the (possibly clamped) decision. */
function sync(p: SlotPlan): void {
  p.slot = { ...p.slot, current_load_kg: p.decision.load_kg, rep_target: p.decision.rep_target, current_sets: p.decision.sets };
}

/** Revert a volume-lever slot that lost RA-1 allocation back to a HOLD (eligible again next week). */
function revertVol(p: SlotPlan): void {
  p.decision = { ...p.decision, type: 'hold', sets: p.prev.current_sets, deltaKg: undefined };
  p.slot = {
    ...p.slot,
    current_sets: p.prev.current_sets,
    levers_tried: p.prev.levers_tried, // do NOT bank 'vol' — stays eligible (E-two-patterns-want-set)
  };
}

export function applyRails(plans: SlotPlan[], ctx: RailCtx): SlotPlan[] {
  const consts = ctx.consts ?? DEFAULTS;
  for (const p of plans) railSlot(p, consts);

  // ── Volume allocation (I-4/5/5b, RA-1) ──
  // Candidates = slots that applied the volume lever this week.
  const volPlans = plans.filter((p) => p.decision.type === 'lever_vol');
  if (volPlans.length === 0) return plans;

  // I-5: at most ONE slot per pattern may take +1 set. Keep the longest-flat per pattern; revert the rest.
  const byPattern = new Map<string, SlotPlan[]>();
  for (const p of volPlans) {
    const list = byPattern.get(p.slot.pattern) ?? [];
    list.push(p);
    byPattern.set(p.slot.pattern, list);
  }
  const patternWinners: SlotPlan[] = [];
  for (const [, list] of byPattern) {
    list.sort((a, b) => b.prev.flat_weeks - a.prev.flat_weeks || a.slot.order_index - b.slot.order_index);
    patternWinners.push(list[0]);
    for (const loser of list.slice(1)) revertVol(loser);
  }

  // I-4: a +1 must keep the pattern's weekly volume ≤ ceiling.
  const ceil = consts.VOL_CEIL[ctx.ta];
  const patternTotal = (pattern: string) =>
    plans.filter((p) => p.slot.pattern === pattern).reduce((sum, p) => sum + p.decision.sets, 0);
  const ceilOk = patternWinners.filter((p) => {
    if (patternTotal(p.slot.pattern) > ceil) {
      revertVol(p);
      return false;
    }
    return true;
  });

  // I-3: keep every session ≤ SESSION_SET_CAP (when session membership is known).
  const sessionSafe = ceilOk.filter((p) => {
    if (!ctx.sessionOf) return true;
    const key = ctx.sessionOf(p.slot.slotId);
    const sessionSets = plans
      .filter((q) => ctx.sessionOf!(q.slot.slotId) === key)
      .reduce((sum, q) => sum + q.decision.sets, 0);
    if (sessionSets > consts.SESSION_SET_CAP) {
      revertVol(p);
      return false;
    }
    return true;
  });

  // I-5/5b: at most 2 patterns receive +1 — RA-1 order: longest-flat, then pattern enum.
  sessionSafe.sort(
    (a, b) =>
      b.prev.flat_weeks - a.prev.flat_weeks ||
      PATTERNS.indexOf(a.slot.pattern) - PATTERNS.indexOf(b.slot.pattern),
  );
  for (const loser of sessionSafe.slice(2)) revertVol(loser);

  return plans;
}
