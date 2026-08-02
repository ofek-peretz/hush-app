/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * MOVEMENTS — the things a coach can prescribe that are not lifts.
 *
 * A run, a plank, a carry, a skipping rope. The exercise catalogue holds 68 LIFTS, and every one of
 * them is described in the vocabulary of hypertrophy: a capability, a muscle, a movement pattern, a
 * cold-start load. That vocabulary is correct for a bench press and meaningless for a 10 km run —
 * a run has no capability class, no primary muscle worth naming, and no bar to load.
 *
 * ── WHY A SECOND LIST AND NOT A WIDER CATALOGUE ─────────────────────────────────────────────────
 * The obvious move is to add `run_outdoor` to `EXERCISES` with `capability: 'knee_dominant'` and a
 * muscle of "Quads". It would compile. It would also be a lie that spreads: the selector picks
 * lifts by capability, the swap pool answers "the leg press is taken" from the same field, and the
 * volume model counts sets per muscle. A run wearing a lift's clothes would be offered as a
 * substitute for a squat, and counted as leg volume.
 *
 * So a movement is described by what is actually true of it — what it is, and how it is naturally
 * MEASURED — and by nothing else. The lift taxonomy stays clean and this list stays honest.
 *
 * ── WHAT `measures` IS AND IS NOT ───────────────────────────────────────────────────────────────
 * A hint to the coach about which shapes suit this movement, not a rule the app enforces. A plank
 * is normally held for time, but "as long as you can" is legitimate and so is a set of ten 10-second
 * holds. The coach decides; this only says what is usual. Nothing reads it to reject a prescription.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** How a movement is naturally measured. Advisory — see the header. */
export type Measure = 'distance' | 'time' | 'reps';

export interface Movement {
  id: string;
  name: string;
  /** The shapes that usually suit it, most natural first. */
  measures: Measure[];
  /** True when the athlete can be holding weight while doing it (a carry, a weighted hang). */
  loadable?: true;
  /** Outdoors and GPS-tracked, so distance and pace come from the phone rather than her report. */
  gps?: true;
}

export const MOVEMENTS: Movement[] = [
  // ── Aerobic ──────────────────────────────────────────────────────────────────────────────────
  { id: 'run_outdoor', name: 'Run', measures: ['distance', 'time'], gps: true },
  { id: 'run_treadmill', name: 'Treadmill Run', measures: ['distance', 'time'] },
  { id: 'walk_outdoor', name: 'Walk', measures: ['distance', 'time'], gps: true },
  { id: 'cycle_outdoor', name: 'Cycle', measures: ['distance', 'time'], gps: true },
  { id: 'cycle_stationary', name: 'Stationary Bike', measures: ['time', 'distance'] },
  { id: 'row_erg', name: 'Rowing Machine', measures: ['distance', 'time'] },
  { id: 'elliptical', name: 'Elliptical', measures: ['time', 'distance'] },
  { id: 'stair_climber', name: 'Stair Climber', measures: ['time'] },
  { id: 'swim', name: 'Swim', measures: ['distance', 'time'] },
  { id: 'jump_rope', name: 'Jump Rope', measures: ['time', 'reps'] },

  // ── Held, carried, or covered — strength work that is not counted in reps ────────────────────
  { id: 'plank', name: 'Plank', measures: ['time'] },
  { id: 'side_plank', name: 'Side Plank', measures: ['time'] },
  { id: 'hollow_hold', name: 'Hollow Hold', measures: ['time'] },
  { id: 'dead_hang', name: 'Dead Hang', measures: ['time'], loadable: true },
  { id: 'farmer_carry', name: 'Farmer’s Carry', measures: ['distance', 'time'], loadable: true },
  { id: 'sled_push', name: 'Sled Push', measures: ['distance'], loadable: true },
  { id: 'wall_sit', name: 'Wall Sit', measures: ['time'] },

  // ── Fast, and not counted in reps ────────────────────────────────────────────────────────────
  { id: 'sprint', name: 'Sprint', measures: ['distance'] },
  { id: 'shuttle_run', name: 'Shuttle Run', measures: ['distance', 'reps'] },
  { id: 'box_jump', name: 'Box Jump', measures: ['reps'] },
  { id: 'broad_jump', name: 'Broad Jump', measures: ['reps', 'distance'] },

  // ── Everything with no number worth stating ──────────────────────────────────────────────────
  { id: 'mobility', name: 'Mobility', measures: ['time'] },
  { id: 'warm_up', name: 'Warm-up', measures: ['time'] },
  { id: 'cool_down', name: 'Cool-down', measures: ['time'] },
  { id: 'skill_practice', name: 'Skill Practice', measures: ['time'] },
];

const byId = new Map<string, Movement>(MOVEMENTS.map((m) => [m.id, m]));

export function movementById(id: string): Movement | undefined {
  return byId.get(id);
}

/**
 * Does the PHONE measure this one?
 *
 * The dividing line between a distance she reports and a distance she is handed a map for. A 40 m
 * farmer's carry has nothing to track; a run, a walk or a ride outdoors has everything to track,
 * and a "Done" button on one of those asks her to confirm what the phone already knows.
 */
export function isGpsMovement(id: string): boolean {
  return byId.get(id)?.gps === true;
}
