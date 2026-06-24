/**
 * Hush v4 engine — Phase 5c: the public top-level pure function.
 *
 *   plan_next_week(profile, slots, global, week_results, library, constants) → PlanResult
 *
 * Composition: runWeek (global order + per-slot reactive loop + swap, Phase 4) → applyRails (safety,
 * Phase 5a) → assemble per-slot prescriptions → explain (Phase 5b). Deterministic; identical inputs
 * yield deep-equal output (I-24). No wall-clock / RNG / external state (I-25).
 *
 * The PURE engine emits a per-slot prescription (next_slots) + updated state + explanations. Mapping
 * those slots into the athlete's actual workouts is the assembler's job (the split library, owned by
 * the integration layer per approved override §6) — so workout assembly is intentionally NOT here.
 */
import type { PlanResult, PlanSlot, Explanation } from './types';
import { runWeek, type PlanInputs } from './planNextWeek';
import { applyRails, type SlotPlan, type RailCtx } from './rails';
import { demonstrated } from './reads';
import { PATTERNS } from './constants';
import { explain, type NameOf } from './explain';

export interface PlanWeekInputs extends PlanInputs {
  /** Workout key per slot (split library) — enables the session set cap (I-3). Optional. */
  sessionOf?: (slotId: string) => string;
  /** Display name for explanation copy. Optional (defaults to the exercise id). */
  nameOf?: NameOf;
}

export function planNextWeek(inp: PlanWeekInputs): PlanResult {
  const core = runWeek(inp);

  const prevById = new Map(inp.slots.map((s) => [s.slotId, s]));
  const resultById = new Map(inp.results.map((r) => [r.slotId, r]));

  // Build (decision, slot, prev, bestE1rm) triples — runWeek preserves inp.slots order.
  const plans: SlotPlan[] = core.updated_slots.map((slot, i) => {
    const prev = prevById.get(slot.slotId) ?? slot;
    const result = resultById.get(slot.slotId);
    const demo = result ? demonstrated(result.sets, prev.rep_target) : null;
    return {
      decision: core.decisions[i],
      slot,
      prev,
      bestE1rm: demo ? demo.best_e1rm : null,
      equipment: inp.meta(prev.current_exercise_id).equipment,
    };
  });

  const ctx: RailCtx = { ta: inp.profile.training_age, consts: inp.consts, sessionOf: inp.sessionOf };
  const railed = applyRails(plans, ctx);

  // Assemble per-slot prescriptions deterministically (pattern enum, then order_index) — I-43.
  const next_slots: PlanSlot[] = railed
    .map((p) => p.slot)
    .slice()
    .sort((a, b) => PATTERNS.indexOf(a.pattern) - PATTERNS.indexOf(b.pattern) || a.order_index - b.order_index)
    .map((s) => ({
      slotId: s.slotId,
      pattern: s.pattern,
      exercise_id: s.current_exercise_id,
      load_kg: s.current_load_kg,
      sets: s.current_sets,
      rep_target: s.rep_target,
      rep_range: s.rep_range,
      order_index: s.order_index,
    }));

  const explanations: Explanation[] = railed
    .map((p) => explain(p.decision, inp.nameOf))
    .filter((e): e is Explanation => e !== null);

  return {
    next_slots,
    updated_slots: railed.map((p) => p.slot),
    updated_global: core.updated_global,
    explanations,
  };
}
