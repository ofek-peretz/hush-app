/**
 * Hush v4 engine — Phase 6: the invariant runner (Handoff Artifact 4, I-1..I-43).
 *
 * `checkInvariants` runs on every emitted PlanResult; CI asserts it returns NO violations across all
 * tests. It enforces the SAFETY + OUTPUT-INTEGRITY invariants that are checkable from a plan, plus
 * the STRUCTURAL forbidden-concept guards (I-30..I-41): no state object may carry a fatigue,
 * readiness, score, confidence, variance, decay, trajectory, ceiling, maintenance, aggression,
 * block_week, seed, satisfaction, engagement, or human_review field — reintroducing any of them
 * violates the freeze.
 */
import type { PlanResult, SlotState, GlobalState, TrainingAge } from './types';
import { DEFAULTS, PATTERNS, type Constants } from './constants';
import { epley } from './reads';

export interface InvariantCtx {
  ta: TrainingAge;
  /** best_e1rm per slot this week (for the rail, I-1); null/absent → rail inactive (CALIBRATING). */
  bestE1rm?: (slotId: string) => number | null;
  /** Workout key per slot — enables the session set cap (I-3). */
  sessionOf?: (slotId: string) => string;
  /** Smallest loadable weight per slot (equipment increment / empty bar). The rail (I-1) is a DEMAND
   *  cap that yields to this physical floor: a load already at the minimum cannot be clamped lower,
   *  so the rail is considered satisfied there (only reachable at a near-zero demonstrated capacity). */
  minLoadable?: (slotId: string) => number;
  /** This was a deload/adherence week (volume may sit at the floor; I-4 relaxed). */
  reducedWeek?: boolean;
  /** Enforce the per-pattern MEV floor (true once a real split guarantees enough slots/pattern). */
  enforceFloor?: boolean;
  consts?: Constants;
}

/** Fields whose mere presence on engine state violates the freeze (I-30..I-41). */
const FORBIDDEN_KEYS = [
  'fatigue',
  'readiness',
  'recovery',
  'score',
  'confidence',
  'variance',
  'var_w',
  'decay',
  'trajectory',
  'ceiling',
  'velocity',
  'maintenance',
  'aggression',
  'dial',
  'block_week',
  'seed',
  'favorite',
  'satisfaction',
  'satisfaction_history',
  'engagement',
  'engagement_mode',
  'human_review',
  'human_review_flag',
];

function checkForbiddenKeys(obj: Record<string, unknown>, where: string, out: string[]): void {
  for (const k of Object.keys(obj)) {
    if (FORBIDDEN_KEYS.includes(k)) out.push(`forbidden field "${k}" on ${where} (freeze violation I-30..I-41)`);
  }
}

export function checkInvariants(result: PlanResult, ctx: InvariantCtx): string[] {
  const consts = ctx.consts ?? DEFAULTS;
  const v: string[] = [];

  // ── Per-slot output integrity + safety ──
  for (const s of result.next_slots) {
    const [lo, hi] = s.rep_range;
    // I-29 rep_target ∈ rep_range
    if (s.rep_target < lo || s.rep_target > hi) v.push(`I-29 rep_target ${s.rep_target} outside [${lo},${hi}] (${s.slotId})`);
    // I-1 implied-e1RM rail
    const best = ctx.bestE1rm ? ctx.bestE1rm(s.slotId) : null;
    const floor = ctx.minLoadable ? ctx.minLoadable(s.slotId) : 0;
    if (best != null && s.load_kg != null && s.load_kg > floor) {
      const implied = epley(s.load_kg, s.rep_target);
      if (implied > best * (1 + consts.RAIL_HEADROOM) + 1e-6)
        v.push(`I-1 rail: implied e1RM ${implied.toFixed(1)} > ${(best * (1 + consts.RAIL_HEADROOM)).toFixed(1)} (${s.slotId})`);
    }
    // I-2b loadable increment (≥ 0; multiples handled upstream by normalizeLoad)
    if (s.load_kg != null && s.load_kg <= 0) v.push(`I-2b non-positive load (${s.slotId})`);
  }

  // ── I-4 pattern weekly volume bounds ──
  for (const pattern of PATTERNS) {
    const slots = result.next_slots.filter((s) => s.pattern === pattern);
    if (slots.length === 0) continue;
    const total = slots.reduce((sum, s) => sum + s.sets, 0);
    if (total > consts.VOL_CEIL[ctx.ta]) v.push(`I-4 ${pattern} volume ${total} > ceil ${consts.VOL_CEIL[ctx.ta]}`);
    if (ctx.enforceFloor && !ctx.reducedWeek && total < consts.VOL_FLOOR[ctx.ta])
      v.push(`I-4 ${pattern} volume ${total} < floor ${consts.VOL_FLOOR[ctx.ta]}`);
  }

  // ── I-3 session set cap ──
  if (ctx.sessionOf) {
    const bySession = new Map<string, number>();
    for (const s of result.next_slots) {
      const key = ctx.sessionOf(s.slotId);
      bySession.set(key, (bySession.get(key) ?? 0) + s.sets);
    }
    for (const [key, total] of bySession) {
      if (total > consts.SESSION_SET_CAP) v.push(`I-3 session ${key} has ${total} sets > cap ${consts.SESSION_SET_CAP}`);
    }
  }

  // ── I-26 every emitted change carries a non-empty explanation ──
  for (const e of result.explanations) {
    if (!e.observation || !e.conclusion || !e.action || !e.text) v.push(`I-26 empty explanation field (${e.slotId})`);
    // I-27 reprice never says "fatigue" / never claims volume changed
    if (e.text.toLowerCase().includes('fatigue')) v.push(`I-27 explanation says "fatigue" (${e.slotId})`);
  }

  // ── Structural forbidden-concept guards (I-30..I-41) ──
  checkForbiddenKeys(result.updated_global as unknown as Record<string, unknown>, 'GlobalState', v);
  for (const s of result.updated_slots) checkForbiddenKeys(s as unknown as Record<string, unknown>, `slot ${s.slotId}`, v);

  return v;
}

/** Convenience for tests: throw if any invariant is violated. */
export function assertInvariants(result: PlanResult, ctx: InvariantCtx): void {
  const v = checkInvariants(result, ctx);
  if (v.length) throw new Error(`Invariant violations:\n - ${v.join('\n - ')}`);
}

export const __FORBIDDEN_KEYS_FOR_TEST = FORBIDDEN_KEYS;
