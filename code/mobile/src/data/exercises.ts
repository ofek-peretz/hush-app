/**
 * Exercise catalog. V1 is gym-based with a full commercial gym available (barbell,
 * dumbbells, machines, cables). The catalog is a broad set of the most common,
 * proven, high-yield movements â€” the lifts people actually do â€” never obscure ones.
 *
 * Each exercise carries exactly 3 plain-language TECHNIQUE CUES (a reminder, never a
 * lesson; surfaced as "Technique notes"). Hush ships NO demo videos.
 *
 * TWO classifications per exercise (kept DISTINCT on purpose):
 *   capability â€” the engine's primitive (FIVE Class-A patterns). The model owns
 *     load/progression per capability and the slot's capability is FIXED. Every
 *     exercise maps to its NEAREST capability so swaps stay in-pattern.
 *   muscle     â€” the human-readable muscle group, used for DISPLAY and to SCOPE swaps
 *     (chest swaps with chest, not triceps; calves only with calves). Each muscle is a
 *     strict SUBSET of one capability, so a muscle-scoped swap never crosses the slot's
 *     capability contract:
 *       horizontal_push â†’ { Chest, Triceps }
 *       horizontal_pull â†’ { Back, Biceps }
 *       vertical_push   â†’ { Shoulders }
 *       knee_dominant   â†’ { Quads, Calves }
 *       hip_dominant    â†’ { Hamstrings, Glutes, Core }
 *     (Decouple decision 2026-06-21: Calves/Core/arms get full coverage as muscle
 *     groups WITHOUT adding engine capabilities â€” the 5-bar Capability Portrait and the
 *     frozen engine stay untouched.)
 *
 * Seed metadata (`baseKg` / `bwScaled` / `tier` / `bodyweight`) feeds the cold-start
 * starting-weight model in fixtureModel.sessionTargets (personalized by sex, bodyweight,
 * experience, age). `baseKg` is a CONSERVATIVE starting load for an intermediate male
 * ~75kg (per dumbbell for dumbbell lifts); `bwScaled` lifts scale with the athlete's
 * bodyweight.
 */
import i18next from 'i18next';
import { getGender } from '@/i18n/gender';
import type { Capability } from './local/models';
import { MOVEMENTS } from './movements';

export type EquipmentFamily = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight';

/**
 * How a load is physically SET UP â€” finer than `equipment`, so the live workout can tell the
 * athlete exactly what to do (plate math, dumbbell-per-hand, a pin, a fixed bar) and they never
 * have to calculate. Display-only; the engine never reads it (it keys on `capability`). Defaults
 * are derived from `equipment` (see `loadStyleOf`); an exercise overrides only when the default is
 * wrong (e.g. a plate-loaded machine, which the default would treat as a selectorized pin stack).
 */
export type LoadStyle =
  | 'barbell' // an Olympic bar + plates â†’ "20 + 20 / side", "20 kg bar"
  | 'fixed_barbell' // a pre-weighted fixed bar â†’ "Use the 30 kg bar"
  | 'dumbbell' // one dumbbell per hand â†’ "20 kg / hand"
  | 'selectorized' // a pin-selected weight stack â†’ "Set the pin to 24"
  | 'cable' // a pin-selected cable stack â†’ "Set the pin to 28"
  | 'plate_loaded' // a lever machine loaded with plates â†’ "30 + 30 / side"
  | 'bodyweight'; // no external load

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• THE SWAP TAXONOMY (founder 2026-07-12) â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 *
 * `muscle` alone is far too coarse to choose a substitute. Every quad exercise is "Quads", so a
 * pool keyed on muscle happily answered "the leg press is taken" with "do a back squat" â€” the lift
 * the athlete had already done that day â€” and answered "the lat pulldown is taken" with "do a
 * barbell row", which is a different movement plane entirely.
 *
 * FOUNDER'S LAW: a swap is a SYNONYM, not a variation. The engine chose this slot for a reason; if
 * the station is busy, the athlete still needs the training effect the slot was designed to
 * deliver â€” the closest thing to it, on different equipment. A swap that "gives a fresh stimulus"
 * is not a swap, it is a different workout.
 *
 * Three fields make that decidable. All three are objective facts about the movement; none are
 * invented, and none are read by the engine (capability is untouched, so the slot contract holds).
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•*/

/**
 * The movement SHAPE, finer than muscle. Two exercises with the same pattern train the same thing;
 * two with different patterns do not, however much muscle they share. Scoped WITHIN a muscle, so
 * 'hinge' under Hamstrings (an RDL) and 'hinge' under Glutes (a pull-through) never meet.
 */
export type SwapPattern =
  // Chest
  | 'press_flat' | 'press_incline' | 'fly'
  // Triceps
  | 'press' | 'elbow_extension'
  // Back â€” a SHRUG is scapular elevation, not a row: nothing else in the catalogue trains it, and
  // scoring it as a row would answer a busy shrug with a barbell row.
  | 'row' | 'pulldown' | 'rear_delt' | 'shrug'
  // Biceps
  | 'curl'
  // Shoulders â€” a FRONT raise is a different plane from a lateral one, and the delt it trains is
  // the one the presses already hammer. Kept apart so a swap never trades one for the other.
  | 'press_overhead' | 'lateral_raise' | 'front_raise'
  // Quads
  | 'squat' | 'lunge' | 'knee_extension'
  // Calves â€” straight knee is the GASTROCNEMIUS, bent knee is the SOLEUS. Different muscles.
  // Without this split, a swap silently trades one for the other.
  | 'calf_straight' | 'calf_bent'
  // Hamstrings
  | 'hinge' | 'knee_flexion'
  // Glutes
  | 'thrust' | 'kickback' | 'abduction' | 'adduction'
  // Core â€” ROTATION is a function the catalogue had no entry for at all: every core movement in it
  // flexed the spine or resisted it, and nothing turned it.
  | 'crunch' | 'leg_raise' | 'anti_extension' | 'rotation';

/**
 * How much of the STABILISATION the equipment has taken away. Ordered, not boolean â€” that is the
 * whole point. It is what makes the Hack Squat (guided) a closer substitute for the Leg Press
 * (supported) than the Back Squat (free) is.
 */
export type Support =
  | 'free' // you stabilise the load AND yourself â€” barbell, dumbbell, pull-up
  | 'guided' // the load's PATH is fixed, but you stand and carry it â€” hack squat, every cable
  | 'supported'; // a seat or pad carries YOU â€” leg press, every seated machine

export const SUPPORT_RANK: Record<Support, number> = { free: 0, guided: 1, supported: 2 };

/**
 * The functional FAMILY a pattern belongs to. A swap may never cross families.
 *
 * This exists for exactly one reason, and it is a real one: hip ABduction and hip ADduction are
 * both filed under Glutes, both machine isolations, both bilateral â€” so on every axis except the
 * movement itself they are twins. A pure score would hand the athlete the ADductor machine when
 * the ABductor machine is busy. That is the opposite movement. No score should be allowed to
 * express that, so it is a gate, not a penalty.
 */
export type PatternFamily = 'primary' | 'abduction' | 'adduction';

const PATTERN_FAMILY: Partial<Record<SwapPattern, PatternFamily>> = {
  abduction: 'abduction',
  adduction: 'adduction',
};

/** The family of a pattern â€” everything that is not an abduction/adduction is the muscle's
 *  primary work, and those are all legitimate fallbacks for one another. */
export function patternFamily(pattern: SwapPattern): PatternFamily {
  return PATTERN_FAMILY[pattern] ?? 'primary';
}

/** Human-readable muscle group â€” display + swap scoping. Subset of one capability. */
export type MuscleGroup =
  | 'Chest'
  | 'Triceps'
  | 'Back'
  | 'Biceps'
  | 'Shoulders'
  | 'Quads'
  | 'Calves'
  | 'Hamstrings'
  | 'Glutes'
  | 'Core';

export interface Exercise {
  id: string;
  name: string;
  capability: Capability;
  /** Display + swap-scoping muscle group (strict subset of `capability`). */
  muscle: MuscleGroup;
  equipment: EquipmentFamily;
  /** The movement SHAPE (see SwapPattern). The primary axis a substitute is chosen on. */
  pattern: SwapPattern;
  /** How much stabilisation the equipment removes (see Support). Ordered. */
  support: Support;
  /** One limb at a time (dumbbell row, Bulgarian split squat, cable kickback). */
  unilateral?: boolean;
  /** An EASIER scaling of another movement (knee push-up), not a peer of it. Reachable â€” a
   *  beginner needs it â€” but never the answer when a loaded lift's station is busy. */
  regression?: boolean;
  /** Setup convention for the load display (defaults from `equipment`; override only when the
   *  default is wrong â€” e.g. a plate-loaded leg press, not a selectorized stack). */
  loadStyle?: LoadStyle;
  /** The PHYSICAL station this lift shares with another lift (register Part 3 #3 â€” "enter once,
   *  leave it finished"). Two lifts carrying the same value are done back to back, so the athlete
   *  never leaves a machine and returns to it. Set ONLY where two catalogue lifts genuinely share
   *  one piece of equipment (the leg press and its calf raise); absent = the lift is its own
   *  station, and the equipment-class grouping already keeps the walk sane. */
  station?: string;
  /** Exactly 3 concise technique cues. */
  cues: [string, string, string];
  synonyms?: string[];
  /** Big multi-joint lift vs single-joint accessory â€” drives default reps. */
  tier: 'compound' | 'isolation';
  /** Conservative starting load (kg) for an intermediate male ~75kg; per dumbbell for
   *  dumbbell lifts. Omitted for bodyweight movements. */
  baseKg?: number;
  /** Scale the seed with the athlete's bodyweight (true for the big barbell lifts). */
  bwScaled?: boolean;
  /** Loaded by bodyweight â€” no external weight prescribed. */
  bodyweight?: boolean;
  /** Intentionally NOT placed in the auto-generated split â€” available only as a swap /
   *  equipment-busy backup. Every catalog exercise must be reachable by generation OR be
   *  flagged swapOnly (enforced by the catalogSync test), so nothing is ever orphaned. */
  swapOnly?: boolean;
}

/*
 * â•â•â•â• TWO STATIONS THAT NEEDED A DECISION BEFORE THEY COULD BE LISTED (2026-08-02) â•â•â•â•
 *
 * â”€â”€ THE SMITH MACHINE â€” `machine` + `plate_loaded`, and NO new equipment family â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * I had it excluded on the strength of a line in a 2026-07-05 list headed **"FOUNDER SCOPE
 * EXCLUSIONS (do NOT revisit)"** â€” a list of things not to spend that audit's time on, beside
 * "height changes" and "Progress/dashboard work". It was never a ruling about the exercise, and
 * reading it as one kept the most-used rack in most gyms out of the catalogue for a month.
 *
 * It is filed as a MACHINE whose load is plate-loaded, which is the truthful description and costs
 * no new taxonomy: the athlete adds plates per side, and the display says so. What it deliberately
 * does NOT do is claim a bar weight. An Olympic bar is 20 kg everywhere; a Smith carriage is
 * counterbalanced and runs 7â€“20 kg depending on the machine, so `barbell` â€” which adds 20 to every
 * figure she reads â€” would be a lie about her gym on every single set. `plate_loaded` states the
 * plates and nothing else, which is exactly what is knowable.
 *
 * â”€â”€ THE ASSIST MACHINES â€” `bodyweight: true`, no load, ever â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * I refused these on a real observation and the wrong conclusion. The observation: on an assist
 * machine MORE weight is EASIER, so anything that reasons about load runs backwards on it â€” Loop 1
 * would answer a strong set by adding assistance, the rail would cap her at her weakest, and the
 * record would show a rising number for a falling effort. The wrong conclusion was to delete the
 * station, which is the standard tool for everyone who cannot yet do a pull-up.
 *
 * They are bodyweight lifts. No load is prescribed, no load is recorded, nothing inverted ever
 * enters the model â€” and the coach says in words how much help to take, which is what a coach would
 * say anyway. `regression: true` keeps them out of the equipment-busy answer for a loaded lift.
 */
export const EXERCISES: Exercise[] = [
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ horizontal_push Â· Chest â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  { id: 'bb_bench_press', name: 'Barbell Bench Press', capability: 'horizontal_push', muscle: 'Chest', pattern: 'press_flat', support: 'free', equipment: 'barbell', tier: 'compound', baseKg: 40, bwScaled: true, cues: ['Keep your feet planted.', 'Lower to the chest with control.', 'Drive the bar straight up.'], synonyms: ['bench'] },
  { id: 'incline_bb_press', name: 'Incline Barbell Press', capability: 'horizontal_push', muscle: 'Chest', pattern: 'press_incline', support: 'free', equipment: 'barbell', tier: 'compound', baseKg: 30, bwScaled: true, cues: ['Set a ~30Â° incline.', 'Lower to the upper chest.', 'Press up and slightly back.'], synonyms: ['incline bench'] },
  { id: 'db_bench_press', name: 'Dumbbell Bench Press', capability: 'horizontal_push', muscle: 'Chest', pattern: 'press_flat', support: 'free', equipment: 'dumbbell', tier: 'compound', baseKg: 16, cues: ['Stack your wrists.', 'Lower under control.', 'Press to lockout.'], synonyms: ['db press', 'dumbbell press'] },
  { id: 'incline_db_press', name: 'Incline Dumbbell Press', capability: 'horizontal_push', muscle: 'Chest', pattern: 'press_incline', support: 'free', equipment: 'dumbbell', tier: 'compound', baseKg: 14, cues: ['Set a ~30Â° incline.', 'Lower to the upper chest.', 'Press up evenly.'], synonyms: ['incline db'] },
  { id: 'incline_machine_press', name: 'Incline Machine Press', capability: 'horizontal_push', muscle: 'Chest', pattern: 'press_incline', support: 'supported', equipment: 'machine', tier: 'compound', baseKg: 30, cues: ['Set the handles at upper-chest height.', 'Press up and slightly in.', 'Control the return.'], synonyms: ['incline machine'] },
  { id: 'machine_chest_press', name: 'Machine Chest Press', capability: 'horizontal_push', muscle: 'Chest', pattern: 'press_flat', support: 'supported', equipment: 'machine', tier: 'compound', baseKg: 35, cues: ['Set the seat height.', 'Press smoothly.', 'Control the return.'] },
  { id: 'chest_dip', name: 'Chest Dip', capability: 'horizontal_push', muscle: 'Chest', pattern: 'press_flat', support: 'free', equipment: 'bodyweight', tier: 'compound', bodyweight: true, cues: ['Lean slightly forward.', 'Lower to a deep stretch.', 'Press to lockout.'], synonyms: ['dips'] },
  { id: 'push_up', name: 'Push-Up', capability: 'horizontal_push', muscle: 'Chest', pattern: 'press_flat', support: 'free', equipment: 'bodyweight', tier: 'compound', bodyweight: true, cues: ['Body in a straight line.', 'Lower the chest to the floor.', 'Press the floor away.'] },
  { id: 'knee_push_up', name: 'Knee Push-Up', capability: 'horizontal_push', muscle: 'Chest', pattern: 'press_flat', support: 'free', regression: true, equipment: 'bodyweight', tier: 'compound', bodyweight: true, cues: ['Body straight from knees to head.', 'Lower the chest to the floor.', 'Press the floor away.'], synonyms: ['kneeling push-up'] },
  { id: 'pec_deck', name: 'Pec Deck Fly', capability: 'horizontal_push', muscle: 'Chest', pattern: 'fly', support: 'supported', equipment: 'machine', tier: 'isolation', baseKg: 25, cues: ['Soft elbows.', 'Squeeze the chest together.', 'Open slowly.'], synonyms: ['chest fly', 'machine fly'] },
  { id: 'cable_fly', name: 'Cable Fly', capability: 'horizontal_push', muscle: 'Chest', pattern: 'fly', support: 'guided', equipment: 'cable', tier: 'isolation', baseKg: 12, cues: ['Slight forward lean.', 'Hug the arms together.', 'Control the stretch.'] },
  { id: 'incline_db_fly', name: 'Incline Dumbbell Fly', capability: 'horizontal_push', muscle: 'Chest', pattern: 'fly', support: 'free', equipment: 'dumbbell', tier: 'isolation', baseKg: 8, cues: ['Set a ~30Â° incline.', 'Open wide with soft elbows.', 'Hug the weights together.'] },
  { id: 'incline_push_up', name: 'Incline Push-Up', capability: 'horizontal_push', muscle: 'Chest', pattern: 'press_flat', support: 'free', equipment: 'bodyweight', tier: 'compound', regression: true, bodyweight: true, cues: ['Hands on a bench or bar.', 'Body in a straight line.', 'Lower the chest to the bar.'] },
  { id: 'decline_push_up', name: 'Decline Push-Up', capability: 'horizontal_push', muscle: 'Chest', pattern: 'press_flat', support: 'free', equipment: 'bodyweight', tier: 'compound', bodyweight: true, cues: ['Feet up on a bench.', 'Body in a straight line.', 'Lower the chest to the floor.'] },
  { id: 'smith_bench_press', name: 'Smith Machine Bench Press', capability: 'horizontal_push', muscle: 'Chest', pattern: 'press_flat', support: 'guided', equipment: 'machine', tier: 'compound', loadStyle: 'plate_loaded', baseKg: 30, bwScaled: true, cues: ['Set the bench under the bar.', 'Lower to the chest with control.', 'Press to lockout.'] },
  { id: 'assisted_dip', name: 'Assisted Dip', capability: 'horizontal_push', muscle: 'Chest', pattern: 'press_flat', support: 'supported', equipment: 'machine', tier: 'compound', regression: true, bodyweight: true, cues: ['Set the assist you need today.', 'Lean slightly forward.', 'Press to lockout.'] },

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ horizontal_push Â· Triceps â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  { id: 'close_grip_bench', name: 'Close-Grip Bench Press', capability: 'horizontal_push', muscle: 'Triceps', pattern: 'press', support: 'free', equipment: 'barbell', tier: 'compound', baseKg: 32, bwScaled: true, cues: ['Hands shoulder-width.', 'Tuck the elbows.', 'Press through the triceps.'] },
  { id: 'triceps_pushdown', name: 'Triceps Pushdown', capability: 'horizontal_push', muscle: 'Triceps', pattern: 'elbow_extension', support: 'guided', equipment: 'cable', tier: 'isolation', baseKg: 20, cues: ['Pin the elbows to your sides.', 'Extend fully.', 'Resist on the way up.'], synonyms: ['pushdown'] },
  { id: 'overhead_triceps_ext', name: 'Overhead Triceps Extension', capability: 'horizontal_push', muscle: 'Triceps', pattern: 'elbow_extension', support: 'guided', equipment: 'cable', tier: 'isolation', baseKg: 15, cues: ['Elbows by your ears.', 'Stretch behind the head.', 'Extend to lockout.'] },
  { id: 'skullcrusher', name: 'Skullcrusher', capability: 'horizontal_push', muscle: 'Triceps', pattern: 'elbow_extension', support: 'free', equipment: 'barbell', tier: 'isolation', baseKg: 20, cues: ['Elbows pointed up.', 'Lower to the forehead.', 'Extend to lockout.'], synonyms: ['lying triceps extension'] },
  { id: 'machine_dip', name: 'Seated Dip Machine', capability: 'horizontal_push', muscle: 'Triceps', pattern: 'press', support: 'supported', equipment: 'machine', tier: 'compound', baseKg: 40, cues: ['Chest tall, shoulders down.', 'Press the handles to lockout.', 'Control the return.'], synonyms: ['triceps dip machine', 'seated dip'] },
  { id: 'db_overhead_triceps_ext', name: 'Dumbbell Overhead Extension', capability: 'horizontal_push', muscle: 'Triceps', pattern: 'elbow_extension', support: 'free', equipment: 'dumbbell', tier: 'isolation', baseKg: 12, cues: ['Elbows by your ears.', 'Lower behind the head.', 'Extend to lockout.'] },
  { id: 'triceps_kickback', name: 'Triceps Kickback', capability: 'horizontal_push', muscle: 'Triceps', pattern: 'elbow_extension', support: 'free', equipment: 'dumbbell', tier: 'isolation', unilateral: true, baseKg: 6, cues: ['Hinge forward, upper arm still.', 'Extend the elbow back.', 'Return under control.'] },
  { id: 'bench_dip', name: 'Bench Dip', capability: 'horizontal_push', muscle: 'Triceps', pattern: 'press', support: 'free', equipment: 'bodyweight', tier: 'compound', bodyweight: true, cues: ['Hands on the bench edge.', 'Lower until the elbows bend 90Â°.', 'Press back to lockout.'] },
  { id: 'diamond_push_up', name: 'Diamond Push-Up', capability: 'horizontal_push', muscle: 'Triceps', pattern: 'press', support: 'free', equipment: 'bodyweight', tier: 'compound', bodyweight: true, cues: ['Hands together under the chest.', 'Elbows brush the ribs.', 'Press the floor away.'] },
  { id: 'machine_triceps_ext', name: 'Triceps Extension Machine', capability: 'horizontal_push', muscle: 'Triceps', pattern: 'elbow_extension', support: 'supported', equipment: 'machine', tier: 'isolation', baseKg: 25, cues: ['Set the seat height.', 'Extend fully.', 'Resist on the way back.'] },
  { id: 'single_arm_pushdown', name: 'Single-Arm Pushdown', capability: 'horizontal_push', muscle: 'Triceps', pattern: 'elbow_extension', support: 'guided', equipment: 'cable', tier: 'isolation', unilateral: true, baseKg: 10, cues: ['Elbow pinned to your side.', 'Extend fully.', 'Resist on the way up.'] },

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ horizontal_pull Â· Back â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  { id: 'bb_row', name: 'Barbell Row', capability: 'horizontal_pull', muscle: 'Back', pattern: 'row', support: 'free', equipment: 'barbell', tier: 'compound', baseKg: 40, bwScaled: true, cues: ['Hinge to about 45Â°.', 'Pull to your lower ribs.', 'Control the descent.'] },
  { id: 'pull_up', name: 'Pull-Up', capability: 'horizontal_pull', muscle: 'Back', pattern: 'pulldown', support: 'free', equipment: 'bodyweight', tier: 'compound', bodyweight: true, cues: ['Start from a dead hang.', 'Drive the elbows down.', 'Chin over the bar.'] },
  { id: 'chin_up', name: 'Chin-Up', capability: 'horizontal_pull', muscle: 'Back', pattern: 'pulldown', support: 'free', equipment: 'bodyweight', tier: 'compound', bodyweight: true, cues: ['Underhand grip.', 'Pull the chest to the bar.', 'Lower under control.'] },
  { id: 'lat_pulldown', name: 'Lat Pulldown', capability: 'horizontal_pull', muscle: 'Back', pattern: 'pulldown', support: 'supported', equipment: 'cable', tier: 'compound', baseKg: 35, cues: ['Tall chest.', 'Pull to the collarbone.', 'Control the bar up.'], synonyms: ['pulldown'] },
  { id: 'cable_row', name: 'Seated Cable Row', capability: 'horizontal_pull', muscle: 'Back', pattern: 'row', support: 'supported', equipment: 'cable', tier: 'compound', baseKg: 35, cues: ['Tall chest.', 'Pull to your waist.', 'Release slowly.'] },
  { id: 'db_row', name: 'Dumbbell Row', capability: 'horizontal_pull', muscle: 'Back', pattern: 'row', support: 'free', unilateral: true, equipment: 'dumbbell', tier: 'compound', baseKg: 18, cues: ['Keep a flat back.', 'Row to your hip.', 'Control the way down.'], synonyms: ['db row'] },
  { id: 't_bar_row', name: 'T-Bar Row', capability: 'horizontal_pull', muscle: 'Back', pattern: 'row', support: 'free', equipment: 'barbell', tier: 'compound', baseKg: 30, bwScaled: true, cues: ['Hinge with a flat back.', 'Pull to the chest.', 'Lower fully.'] },
  { id: 'machine_row', name: 'Machine Row', capability: 'horizontal_pull', muscle: 'Back', pattern: 'row', support: 'supported', equipment: 'machine', tier: 'compound', baseKg: 35, cues: ['Chest on the pad.', 'Drive the elbows back.', 'Control the return.'] },
  { id: 'face_pull', name: 'Face Pull', capability: 'horizontal_pull', muscle: 'Back', pattern: 'rear_delt', support: 'guided', equipment: 'cable', tier: 'isolation', baseKg: 15, cues: ['Pull to your forehead.', 'Lead with the elbows.', 'Squeeze the rear delts.'] },
  { id: 'rear_delt_fly', name: 'Rear Delt Fly', capability: 'horizontal_pull', muscle: 'Back', pattern: 'rear_delt', support: 'free', equipment: 'dumbbell', tier: 'isolation', baseKg: 7, cues: ['Soft elbows.', 'Open to the sides.', 'Squeeze the rear delts.'] },
  { id: 'incline_db_row', name: 'Chest-Supported Dumbbell Row', capability: 'horizontal_pull', muscle: 'Back', pattern: 'row', support: 'supported', equipment: 'dumbbell', tier: 'compound', baseKg: 16, cues: ['Chest on the incline bench.', 'Row to your lower ribs.', 'Lower fully.'] },
  { id: 'single_arm_cable_row', name: 'Single-Arm Cable Row', capability: 'horizontal_pull', muscle: 'Back', pattern: 'row', support: 'supported', equipment: 'cable', tier: 'compound', unilateral: true, baseKg: 20, cues: ['Tall chest.', 'Pull to your waist.', 'Let the shoulder travel forward.'] },
  { id: 'inverted_row', name: 'Inverted Row', capability: 'horizontal_pull', muscle: 'Back', pattern: 'row', support: 'free', equipment: 'bodyweight', tier: 'compound', bodyweight: true, cues: ['Bar at hip height.', 'Body in a straight line.', 'Pull the chest to the bar.'] },
  { id: 'straight_arm_pulldown', name: 'Straight-Arm Pulldown', capability: 'horizontal_pull', muscle: 'Back', pattern: 'pulldown', support: 'guided', equipment: 'cable', tier: 'isolation', baseKg: 20, cues: ['Soft elbows, arms long.', 'Sweep the bar to your thighs.', 'Return slowly.'] },
  { id: 'reverse_pec_deck', name: 'Reverse Pec Deck', capability: 'horizontal_pull', muscle: 'Back', pattern: 'rear_delt', support: 'supported', equipment: 'machine', tier: 'isolation', baseKg: 20, cues: ['Chest on the pad.', 'Open to the sides.', 'Squeeze the rear delts.'] },
  { id: 'bb_shrug', name: 'Barbell Shrug', capability: 'horizontal_pull', muscle: 'Back', pattern: 'shrug', support: 'free', equipment: 'barbell', tier: 'isolation', baseKg: 50, cues: ['Arms long, no curling.', 'Lift the shoulders straight up.', 'Lower for a full stretch.'] },
  { id: 'db_shrug', name: 'Dumbbell Shrug', capability: 'horizontal_pull', muscle: 'Back', pattern: 'shrug', support: 'free', equipment: 'dumbbell', tier: 'isolation', baseKg: 24, cues: ['Weights at your sides.', 'Lift the shoulders straight up.', 'Lower for a full stretch.'] },
  { id: 'smith_row', name: 'Smith Machine Row', capability: 'horizontal_pull', muscle: 'Back', pattern: 'row', support: 'guided', equipment: 'machine', tier: 'compound', loadStyle: 'plate_loaded', baseKg: 30, cues: ['Hinge to about 45Â°.', 'Pull to your lower ribs.', 'Control the descent.'] },
  { id: 'assisted_pull_up', name: 'Assisted Pull-Up', capability: 'horizontal_pull', muscle: 'Back', pattern: 'pulldown', support: 'supported', equipment: 'machine', tier: 'compound', regression: true, bodyweight: true, cues: ['Set the assist you need today.', 'Drive the elbows down.', 'Chin over the bar.'] },

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ horizontal_pull Â· Biceps â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  { id: 'bb_curl', name: 'Barbell Curl', capability: 'horizontal_pull', muscle: 'Biceps', pattern: 'curl', support: 'free', equipment: 'barbell', tier: 'isolation', baseKg: 20, cues: ['Elbows pinned to your sides.', 'Curl without swinging.', 'Lower under control.'] },
  { id: 'db_curl', name: 'Dumbbell Curl', capability: 'horizontal_pull', muscle: 'Biceps', pattern: 'curl', support: 'free', equipment: 'dumbbell', tier: 'isolation', baseKg: 10, cues: ['No swinging.', 'Curl and squeeze.', 'Lower slowly.'] },
  { id: 'hammer_curl', name: 'Hammer Curl', capability: 'horizontal_pull', muscle: 'Biceps', pattern: 'curl', support: 'free', equipment: 'dumbbell', tier: 'isolation', baseKg: 10, cues: ['Neutral grip.', 'Keep elbows still.', 'Control the descent.'] },
  { id: 'preacher_curl', name: 'Preacher Curl', capability: 'horizontal_pull', muscle: 'Biceps', pattern: 'curl', support: 'supported', equipment: 'machine', tier: 'isolation', baseKg: 18, cues: ['Arms flat on the pad.', 'Curl without lifting the elbows.', 'Lower under control.'] },
  { id: 'incline_db_curl', name: 'Incline Dumbbell Curl', capability: 'horizontal_pull', muscle: 'Biceps', pattern: 'curl', support: 'supported', equipment: 'dumbbell', tier: 'isolation', baseKg: 8, cues: ['Sit back on the incline.', 'Let the arms hang behind you.', 'Curl without moving the elbows.'] },
  { id: 'cable_curl', name: 'Cable Curl', capability: 'horizontal_pull', muscle: 'Biceps', pattern: 'curl', support: 'guided', equipment: 'cable', tier: 'isolation', baseKg: 18, cues: ['Elbows pinned to your sides.', 'Curl without swinging.', 'Resist on the way down.'] },
  { id: 'concentration_curl', name: 'Concentration Curl', capability: 'horizontal_pull', muscle: 'Biceps', pattern: 'curl', support: 'supported', equipment: 'dumbbell', tier: 'isolation', unilateral: true, baseKg: 8, cues: ['Elbow braced on the inner thigh.', 'Curl and squeeze.', 'Lower slowly.'] },
  { id: 'reverse_curl', name: 'Reverse Curl', capability: 'horizontal_pull', muscle: 'Biceps', pattern: 'curl', support: 'free', equipment: 'barbell', tier: 'isolation', baseKg: 15, cues: ['Overhand grip.', 'Elbows still.', 'Lower under control.'] },
  { id: 'single_arm_cable_curl', name: 'Single-Arm Cable Curl', capability: 'horizontal_pull', muscle: 'Biceps', pattern: 'curl', support: 'guided', equipment: 'cable', tier: 'isolation', unilateral: true, baseKg: 8, cues: ['Elbow pinned to your side.', 'Curl and squeeze.', 'Resist on the way down.'] },

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ vertical_push Â· Shoulders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  { id: 'bb_overhead_press', name: 'Overhead Press', capability: 'vertical_push', muscle: 'Shoulders', pattern: 'press_overhead', support: 'free', equipment: 'barbell', tier: 'compound', baseKg: 25, bwScaled: true, cues: ['Brace your midsection.', 'Bar over the mid-foot.', 'Lock out overhead.'], synonyms: ['ohp', 'shoulder press'] },
  { id: 'db_shoulder_press', name: 'Dumbbell Shoulder Press', capability: 'vertical_push', muscle: 'Shoulders', pattern: 'press_overhead', support: 'free', equipment: 'dumbbell', tier: 'compound', baseKg: 14, cues: ['Brace first.', 'Press overhead.', 'Lower to your ears.'], synonyms: ['db ohp'] },
  { id: 'machine_shoulder_press', name: 'Machine Shoulder Press', capability: 'vertical_push', muscle: 'Shoulders', pattern: 'press_overhead', support: 'supported', equipment: 'machine', tier: 'compound', baseKg: 25, cues: ['Set the seat.', 'Press up.', 'Control the way down.'] },
  { id: 'arnold_press', name: 'Arnold Press', capability: 'vertical_push', muscle: 'Shoulders', pattern: 'press_overhead', support: 'free', equipment: 'dumbbell', tier: 'compound', baseKg: 12, cues: ['Start palms facing you.', 'Rotate as you press.', 'Lower with control.'] },
  { id: 'lateral_raise', name: 'Lateral Raise', capability: 'vertical_push', muscle: 'Shoulders', pattern: 'lateral_raise', support: 'free', equipment: 'dumbbell', tier: 'isolation', baseKg: 7, cues: ['Soft elbows.', 'Raise to shoulder height.', 'Lower slowly.'], synonyms: ['side raise'] },
  { id: 'cable_lateral_raise', name: 'Cable Lateral Raise', capability: 'vertical_push', muscle: 'Shoulders', pattern: 'lateral_raise', support: 'guided', equipment: 'cable', tier: 'isolation', baseKg: 6, cues: ['Lead with the elbow.', 'Raise to shoulder height.', 'Resist on the way down.'] },
  { id: 'machine_lateral_raise', name: 'Machine Lateral Raise', capability: 'vertical_push', muscle: 'Shoulders', pattern: 'lateral_raise', support: 'supported', equipment: 'machine', tier: 'isolation', baseKg: 20, cues: ['Set the seat so pads sit at the elbows.', 'Raise to shoulder height.', 'Lower slowly.'], synonyms: ['lateral raise machine', 'side raise machine'] },
  { id: 'landmine_press', name: 'Landmine Press', capability: 'vertical_push', muscle: 'Shoulders', pattern: 'press_overhead', support: 'free', equipment: 'barbell', tier: 'compound', unilateral: true, baseKg: 15, cues: ['Stand tall, brace.', 'Press up and slightly across.', 'Lower to the shoulder.'] },
  { id: 'pike_push_up', name: 'Pike Push-Up', capability: 'vertical_push', muscle: 'Shoulders', pattern: 'press_overhead', support: 'free', equipment: 'bodyweight', tier: 'compound', bodyweight: true, cues: ['Hips high, head between the arms.', 'Lower the crown to the floor.', 'Press the floor away.'] },
  { id: 'db_front_raise', name: 'Front Raise', capability: 'vertical_push', muscle: 'Shoulders', pattern: 'front_raise', support: 'free', equipment: 'dumbbell', tier: 'isolation', baseKg: 7, cues: ['Soft elbows.', 'Raise to shoulder height.', 'Lower slowly.'] },
  { id: 'cable_front_raise', name: 'Cable Front Raise', capability: 'vertical_push', muscle: 'Shoulders', pattern: 'front_raise', support: 'guided', equipment: 'cable', tier: 'isolation', baseKg: 8, cues: ['Cable from behind you.', 'Raise to shoulder height.', 'Resist on the way down.'] },
  { id: 'smith_overhead_press', name: 'Smith Machine Overhead Press', capability: 'vertical_push', muscle: 'Shoulders', pattern: 'press_overhead', support: 'guided', equipment: 'machine', tier: 'compound', loadStyle: 'plate_loaded', baseKg: 20, cues: ['Seat or stand under the bar.', 'Press overhead.', 'Lower to your ears.'] },

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ knee_dominant Â· Quads â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  { id: 'bb_back_squat', name: 'Barbell Back Squat', capability: 'knee_dominant', muscle: 'Quads', pattern: 'squat', support: 'free', equipment: 'barbell', tier: 'compound', baseKg: 50, bwScaled: true, cues: ['Big breath, brace.', 'Sit between the hips.', 'Drive up evenly.'], synonyms: ['squat'] },
  { id: 'front_squat', name: 'Front Squat', capability: 'knee_dominant', muscle: 'Quads', pattern: 'squat', support: 'free', equipment: 'barbell', tier: 'compound', baseKg: 35, bwScaled: true, cues: ['Elbows high.', 'Stay upright.', 'Drive through mid-foot.'] },
  { id: 'leg_press', station: 'leg_press', name: 'Leg Press', capability: 'knee_dominant', muscle: 'Quads', pattern: 'squat', support: 'supported', equipment: 'machine', loadStyle: 'plate_loaded', tier: 'compound', baseKg: 80, bwScaled: true, cues: ['Feet mid-platform.', 'Knees track your toes.', "Don't lock out hard."] },
  { id: 'hack_squat', name: 'Hack Squat', capability: 'knee_dominant', muscle: 'Quads', pattern: 'squat', support: 'guided', equipment: 'machine', loadStyle: 'plate_loaded', tier: 'compound', baseKg: 50, bwScaled: true, cues: ['Back flat on the pad.', 'Sit down and back.', 'Drive through the heels.'] },
  { id: 'goblet_squat', name: 'Goblet Squat', capability: 'knee_dominant', muscle: 'Quads', pattern: 'squat', support: 'free', equipment: 'dumbbell', tier: 'compound', baseKg: 16, cues: ['Hold it at your chest.', 'Sit straight down.', 'Drive up.'] },
  { id: 'bulgarian_split_squat', name: 'Bulgarian Split Squat', capability: 'knee_dominant', muscle: 'Quads', pattern: 'lunge', support: 'free', unilateral: true, equipment: 'dumbbell', tier: 'compound', baseKg: 10, cues: ['Back foot elevated.', 'Drop straight down.', 'Drive through the front heel.'], synonyms: ['split squat'] },
  { id: 'walking_lunge', name: 'Walking Lunge', capability: 'knee_dominant', muscle: 'Quads', pattern: 'lunge', support: 'free', unilateral: true, equipment: 'dumbbell', tier: 'compound', baseKg: 10, cues: ['Long step.', 'Knee tracks the toes.', 'Push off the front foot.'], synonyms: ['lunge'] },
  { id: 'leg_extension', name: 'Leg Extension', capability: 'knee_dominant', muscle: 'Quads', pattern: 'knee_extension', support: 'supported', equipment: 'machine', tier: 'isolation', baseKg: 30, cues: ['Sit tall.', 'Extend fully.', 'Lower under control.'] },
  { id: 'reverse_lunge', name: 'Reverse Lunge', capability: 'knee_dominant', muscle: 'Quads', pattern: 'lunge', support: 'free', equipment: 'dumbbell', tier: 'compound', unilateral: true, baseKg: 10, cues: ['Step back, not forward.', 'Drop the back knee straight down.', 'Drive through the front heel.'] },
  { id: 'step_up', name: 'Step-Up', capability: 'knee_dominant', muscle: 'Quads', pattern: 'lunge', support: 'free', equipment: 'dumbbell', tier: 'compound', unilateral: true, baseKg: 10, cues: ['Box at about knee height.', 'Drive through the top foot.', 'Lower under control.'] },
  { id: 'bodyweight_squat', name: 'Bodyweight Squat', capability: 'knee_dominant', muscle: 'Quads', pattern: 'squat', support: 'free', equipment: 'bodyweight', tier: 'compound', regression: true, bodyweight: true, cues: ['Feet shoulder-width.', 'Sit straight down.', 'Drive up through mid-foot.'] },
  { id: 'single_leg_press', station: 'leg_press', name: 'Single-Leg Press', capability: 'knee_dominant', muscle: 'Quads', pattern: 'squat', support: 'supported', equipment: 'machine', tier: 'compound', unilateral: true, loadStyle: 'plate_loaded', baseKg: 40, cues: ['One foot mid-platform.', 'Knee tracks the toes.', 'Stop short of lockout.'] },
  { id: 'smith_squat', name: 'Smith Machine Squat', capability: 'knee_dominant', muscle: 'Quads', pattern: 'squat', support: 'guided', equipment: 'machine', tier: 'compound', loadStyle: 'plate_loaded', baseKg: 40, bwScaled: true, cues: ['Bar on your upper back.', 'Sit straight down.', 'Drive up through mid-foot.'] },

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ knee_dominant Â· Calves â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  { id: 'standing_calf_raise', name: 'Standing Calf Raise', capability: 'knee_dominant', muscle: 'Calves', pattern: 'calf_straight', support: 'supported', equipment: 'machine', tier: 'isolation', baseKg: 40, bwScaled: true, cues: ['Rise onto the balls of your feet.', 'Pause at the top.', 'Lower for a full stretch.'] },
  { id: 'seated_calf_raise', name: 'Seated Calf Raise', capability: 'knee_dominant', muscle: 'Calves', pattern: 'calf_bent', support: 'supported', equipment: 'machine', tier: 'isolation', baseKg: 25, cues: ['Knees under the pad.', 'Drive through the toes.', 'Stretch at the bottom.'] },
  { id: 'leg_press_calf_raise', station: 'leg_press', name: 'Leg Press Calf Raise', capability: 'knee_dominant', muscle: 'Calves', pattern: 'calf_straight', support: 'supported', equipment: 'machine', loadStyle: 'plate_loaded', tier: 'isolation', baseKg: 60, bwScaled: true, cues: ['Toes on the platform edge.', 'Press through the balls of your feet.', 'Control the stretch.'] },
  { id: 'db_calf_raise', name: 'Dumbbell Calf Raise', capability: 'knee_dominant', muscle: 'Calves', pattern: 'calf_straight', support: 'free', equipment: 'dumbbell', tier: 'isolation', baseKg: 16, cues: ['Balls of the feet on a step.', 'Rise as high as you can.', 'Lower for a full stretch.'] },
  { id: 'single_leg_calf_raise', name: 'Single-Leg Calf Raise', capability: 'knee_dominant', muscle: 'Calves', pattern: 'calf_straight', support: 'free', equipment: 'bodyweight', tier: 'isolation', unilateral: true, bodyweight: true, cues: ['One foot on a step.', 'Rise as high as you can.', 'Lower for a full stretch.'] },
  { id: 'seated_db_calf_raise', name: 'Seated Dumbbell Calf Raise', capability: 'knee_dominant', muscle: 'Calves', pattern: 'calf_bent', support: 'free', equipment: 'dumbbell', tier: 'isolation', baseKg: 12, cues: ['Weights on the knees.', 'Drive through the toes.', 'Stretch at the bottom.'] },
  { id: 'bw_calf_raise', name: 'Bodyweight Calf Raise', capability: 'knee_dominant', muscle: 'Calves', pattern: 'calf_straight', support: 'free', equipment: 'bodyweight', tier: 'isolation', regression: true, bodyweight: true, cues: ['Stand tall.', 'Rise onto the balls of your feet.', 'Lower slowly.'] },
  { id: 'smith_calf_raise', name: 'Smith Machine Calf Raise', capability: 'knee_dominant', muscle: 'Calves', pattern: 'calf_straight', support: 'guided', equipment: 'machine', tier: 'isolation', loadStyle: 'plate_loaded', baseKg: 40, bwScaled: true, cues: ['Balls of the feet on a step.', 'Rise as high as you can.', 'Lower for a full stretch.'] },

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ hip_dominant Â· Hamstrings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  { id: 'bb_deadlift', name: 'Deadlift', capability: 'hip_dominant', muscle: 'Hamstrings', pattern: 'hinge', support: 'free', equipment: 'barbell', tier: 'compound', baseKg: 60, bwScaled: true, cues: ['Bar over mid-foot.', 'Flat back, brace.', 'Push the floor away.'], synonyms: ['conventional deadlift'] },
  { id: 'bb_rdl', name: 'Romanian Deadlift', capability: 'hip_dominant', muscle: 'Hamstrings', pattern: 'hinge', support: 'free', equipment: 'barbell', tier: 'compound', baseKg: 50, bwScaled: true, cues: ['Soft knees.', 'Push the hips back.', 'Keep the bar close.'], synonyms: ['rdl'] },
  { id: 'sumo_deadlift', name: 'Sumo Deadlift', capability: 'hip_dominant', muscle: 'Hamstrings', pattern: 'hinge', support: 'free', equipment: 'barbell', tier: 'compound', baseKg: 60, bwScaled: true, cues: ['Wide stance.', 'Knees out.', 'Drive hips through.'] },
  { id: 'db_rdl', name: 'Dumbbell Romanian Deadlift', capability: 'hip_dominant', muscle: 'Hamstrings', pattern: 'hinge', support: 'free', equipment: 'dumbbell', tier: 'compound', baseKg: 18, cues: ['Soft knees.', 'Hips back.', 'Keep the weights close.'], synonyms: ['db rdl', 'dumbbell rdl'] },
  /*
   * âš ï¸ THE GOOD MORNING IS BACK (founder, 2026-08-02: *"these are common exercises â€” so if an
   * athlete wants to do them, they just don't exist? that isn't serious"*).
   *
   * It was deleted on 2026-07-05 as "the highest injury-to-value hinge in the catalogue for the
   * general population", and that reasoning was sound **for an app that ASSIGNED exercises**. A
   * generator handing a good morning to a woman in her first week is a risk with nobody weighing
   * it. There is no generator: a coach decides who gets this, and an athlete can ask for it by
   * name. The reason did not survive the rewrite, and a ruling outlives its reason only if nobody
   * checks.
   *
   * The register's own law, applied to itself: **ask whether the ruling's REASON survived.**
   */
  { id: 'leg_curl', name: 'Lying Leg Curl', capability: 'hip_dominant', muscle: 'Hamstrings', pattern: 'knee_flexion', support: 'supported', equipment: 'machine', tier: 'isolation', baseKg: 25, cues: ['Hips down.', 'Curl fully.', 'Lower slowly.'], synonyms: ['hamstring curl', 'leg curl', 'lying hamstring curl'] },
  { id: 'seated_leg_curl', name: 'Seated Leg Curl', capability: 'hip_dominant', muscle: 'Hamstrings', pattern: 'knee_flexion', support: 'supported', equipment: 'machine', tier: 'isolation', baseKg: 30, cues: ['Pad low across the thighs.', 'Curl the heels under the seat.', 'Straighten the knees fully.'], synonyms: ['seated hamstring curl'] },
  { id: 'back_extension', name: 'Back Extension', capability: 'hip_dominant', muscle: 'Hamstrings', pattern: 'hinge', support: 'supported', equipment: 'machine', tier: 'isolation', bodyweight: true, cues: ['Hinge at the hips.', 'Squeeze at the top.', 'Lower slowly.'], synonyms: ['hyperextension'] },
  { id: 'single_leg_rdl', name: 'Single-Leg Romanian Deadlift', capability: 'hip_dominant', muscle: 'Hamstrings', pattern: 'hinge', support: 'free', equipment: 'dumbbell', tier: 'compound', unilateral: true, baseKg: 10, cues: ['Soft standing knee.', 'Hinge, free leg travels back.', 'Stand up through the hip.'] },
  { id: 'trap_bar_deadlift', name: 'Trap Bar Deadlift', capability: 'hip_dominant', muscle: 'Hamstrings', pattern: 'hinge', support: 'free', equipment: 'barbell', tier: 'compound', baseKg: 60, bwScaled: true, cues: ['Stand in the middle of the bar.', 'Flat back, brace.', 'Push the floor away.'] },
  { id: 'standing_leg_curl', name: 'Standing Leg Curl', capability: 'hip_dominant', muscle: 'Hamstrings', pattern: 'knee_flexion', support: 'guided', equipment: 'machine', tier: 'isolation', unilateral: true, baseKg: 12, cues: ['Hips against the pad.', 'Curl the heel to the glute.', 'Straighten the knee fully.'] },
  { id: 'nordic_curl', name: 'Nordic Curl', capability: 'hip_dominant', muscle: 'Hamstrings', pattern: 'knee_flexion', support: 'free', equipment: 'bodyweight', tier: 'isolation', bodyweight: true, cues: ['Ankles anchored, hips locked.', 'Lower as slowly as you can.', 'Catch with your hands.'] },
  { id: 'good_morning', name: 'Good Morning', capability: 'hip_dominant', muscle: 'Hamstrings', pattern: 'hinge', support: 'free', equipment: 'barbell', tier: 'compound', baseKg: 30, bwScaled: true, cues: ['Bar high on the back, soft knees.', 'Push the hips back.', 'Stand up through the hips.'] },

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ hip_dominant Â· Glutes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  { id: 'hip_thrust', name: 'Barbell Hip Thrust', capability: 'hip_dominant', muscle: 'Glutes', pattern: 'thrust', support: 'free', equipment: 'barbell', tier: 'compound', baseKg: 40, bwScaled: true, cues: ['Upper back on the bench.', 'Drive through the heels.', 'Squeeze the glutes at the top.'], synonyms: ['thrust'] },
  { id: 'glute_bridge', name: 'Glute Bridge', capability: 'hip_dominant', muscle: 'Glutes', pattern: 'thrust', support: 'free', equipment: 'barbell', tier: 'compound', baseKg: 30, cues: ['Heels close.', 'Drive the hips up.', 'Squeeze at the top.'] },
  { id: 'cable_pull_through', name: 'Cable Pull-Through', capability: 'hip_dominant', muscle: 'Glutes', pattern: 'hinge', support: 'guided', equipment: 'cable', tier: 'isolation', baseKg: 25, cues: ['Hinge at the hips.', 'Push the hips back.', 'Snap the hips forward.'] },
  { id: 'hip_abduction', name: 'Hip Abduction', capability: 'hip_dominant', muscle: 'Glutes', pattern: 'abduction', support: 'supported', equipment: 'machine', tier: 'isolation', baseKg: 30, cues: ['Sit tall.', 'Press the knees out.', 'Control the return.'], synonyms: ['abductor machine'] },
  { id: 'cable_hip_abduction', name: 'Cable Hip Abduction', capability: 'hip_dominant', muscle: 'Glutes', pattern: 'abduction', support: 'guided', unilateral: true, equipment: 'cable', tier: 'isolation', baseKg: 8, cues: ['Cuff on the outside ankle.', 'Sweep the leg out and slightly back.', 'Return under control.'], synonyms: ['standing cable abduction'] },
  { id: 'cable_kickback', name: 'Cable Glute Kickback', capability: 'hip_dominant', muscle: 'Glutes', pattern: 'kickback', support: 'guided', unilateral: true, equipment: 'cable', tier: 'isolation', baseKg: 10, cues: ['Hinge slightly forward.', 'Drive the heel back.', 'Squeeze the glute.'], synonyms: ['glute kickback'] },
  { id: 'machine_hip_thrust', name: 'Machine Hip Thrust', capability: 'hip_dominant', muscle: 'Glutes', pattern: 'thrust', support: 'supported', equipment: 'machine', loadStyle: 'plate_loaded', tier: 'compound', baseKg: 40, bwScaled: true, cues: ['Upper back settled on the pad.', 'Drive through the heels.', 'Squeeze the glutes at the top.'], synonyms: ['hip thrust machine', 'glute drive'] },
  { id: 'hip_adduction', name: 'Hip Adduction', capability: 'hip_dominant', muscle: 'Glutes', pattern: 'adduction', support: 'supported', equipment: 'machine', tier: 'isolation', baseKg: 30, cues: ['Sit tall.', 'Squeeze the knees together.', 'Control the return.'], synonyms: ['adductor machine', 'inner thigh machine'] },
  { id: 'cable_hip_adduction', name: 'Cable Hip Adduction', capability: 'hip_dominant', muscle: 'Glutes', pattern: 'adduction', support: 'guided', unilateral: true, equipment: 'cable', tier: 'isolation', baseKg: 8, cues: ['Cuff on the inside ankle.', 'Pull the leg across your midline.', 'Resist on the way out.'], synonyms: ['standing cable adduction'] },
  { id: 'single_leg_hip_thrust', name: 'Single-Leg Hip Thrust', capability: 'hip_dominant', muscle: 'Glutes', pattern: 'thrust', support: 'free', equipment: 'bodyweight', tier: 'compound', unilateral: true, bodyweight: true, cues: ['Upper back on the bench.', 'Drive through one heel.', 'Squeeze at the top.'] },
  { id: 'machine_kickback', name: 'Glute Kickback Machine', capability: 'hip_dominant', muscle: 'Glutes', pattern: 'kickback', support: 'supported', equipment: 'machine', tier: 'isolation', unilateral: true, baseKg: 20, cues: ['Hips against the pad.', 'Drive the heel back.', 'Return under control.'] },
  { id: 'bw_glute_bridge', name: 'Bodyweight Glute Bridge', capability: 'hip_dominant', muscle: 'Glutes', pattern: 'thrust', support: 'free', equipment: 'bodyweight', tier: 'compound', regression: true, bodyweight: true, cues: ['Heels close to your seat.', 'Drive the hips up.', 'Squeeze at the top.'] },

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ hip_dominant Â· Core â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Generation pool = the accessible movements (cable/machine crunch); hanging leg raise and the
  // ab wheel demand strength/skill a first-week athlete does not have, so they are swap-only â€”
  // reachable the day an athlete asks for them, never assigned by default.
  { id: 'cable_crunch', name: 'Cable Crunch', capability: 'hip_dominant', muscle: 'Core', pattern: 'crunch', support: 'guided', equipment: 'cable', tier: 'isolation', baseKg: 25, cues: ['Hips fixed.', 'Crunch through the abs.', 'Resist on the way up.'] },
  { id: 'machine_crunch', name: 'Ab Crunch Machine', capability: 'hip_dominant', muscle: 'Core', pattern: 'crunch', support: 'supported', equipment: 'machine', tier: 'isolation', baseKg: 30, cues: ['Chest on the pad.', 'Crunch down through the abs.', 'Return with control.'], synonyms: ['crunch machine', 'ab machine'] },
  { id: 'hanging_leg_raise', name: 'Hanging Leg Raise', capability: 'hip_dominant', muscle: 'Core', pattern: 'leg_raise', support: 'free', equipment: 'bodyweight', tier: 'isolation', bodyweight: true, cues: ['Hang tall, no swing.', 'Raise the legs with control.', 'Lower slowly.'] },
  { id: 'ab_wheel', name: 'Ab Wheel Rollout', capability: 'hip_dominant', muscle: 'Core', pattern: 'anti_extension', support: 'free', equipment: 'bodyweight', tier: 'isolation', bodyweight: true, cues: ['Brace hard.', 'Roll out only as far as you control.', 'Pull back with the abs.'], synonyms: ['rollout'] },
  { id: 'lying_leg_raise', name: 'Lying Leg Raise', capability: 'hip_dominant', muscle: 'Core', pattern: 'leg_raise', support: 'free', equipment: 'bodyweight', tier: 'isolation', bodyweight: true, cues: ['Lower back flat on the floor.', 'Raise the legs with control.', 'Stop before the back arches.'] },
  { id: 'captains_chair_raise', name: 'Captainâ€™s Chair Knee Raise', capability: 'hip_dominant', muscle: 'Core', pattern: 'leg_raise', support: 'supported', equipment: 'bodyweight', tier: 'isolation', bodyweight: true, cues: ['Back against the pad.', 'Raise the knees to your chest.', 'Lower without swinging.'] },
  { id: 'sit_up', name: 'Sit-Up', capability: 'hip_dominant', muscle: 'Core', pattern: 'crunch', support: 'free', equipment: 'bodyweight', tier: 'isolation', bodyweight: true, cues: ['Feet planted, knees bent.', 'Sit all the way up.', 'Lower one vertebra at a time.'] },
  { id: 'bicycle_crunch', name: 'Bicycle Crunch', capability: 'hip_dominant', muscle: 'Core', pattern: 'crunch', support: 'free', equipment: 'bodyweight', tier: 'isolation', bodyweight: true, cues: ['Lower back flat on the floor.', 'Elbow towards the opposite knee.', 'Slow, not fast.'] },
  { id: 'russian_twist', name: 'Russian Twist', capability: 'hip_dominant', muscle: 'Core', pattern: 'rotation', support: 'free', equipment: 'bodyweight', tier: 'isolation', bodyweight: true, cues: ['Lean back, chest tall.', 'Rotate from the ribs.', 'Touch the floor each side.'] },
  { id: 'cable_woodchop', name: 'Cable Woodchop', capability: 'hip_dominant', muscle: 'Core', pattern: 'rotation', support: 'guided', equipment: 'cable', tier: 'isolation', unilateral: true, baseKg: 15, cues: ['Arms long, hips square.', 'Rotate from the ribs.', 'Return under control.'] },
  { id: 'dead_bug', name: 'Dead Bug', capability: 'hip_dominant', muscle: 'Core', pattern: 'anti_extension', support: 'free', equipment: 'bodyweight', tier: 'isolation', bodyweight: true, cues: ['Lower back flat on the floor.', 'Opposite arm and leg reach out.', 'Stop before the back arches.'] },
];

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ catalog â†” engine synchronization â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// The single registry that guarantees every catalog exercise is fully wired: reachable,
// progressable, swappable, and backed by an alternative. The catalogSync test asserts
// 100% coverage against this section, so a newly-added exercise cannot silently drift.

/**
 * SWAP-ONLY exercises: present in the catalog and offered as swaps / equipment-busy
 * backups, but deliberately NOT in the auto-generated split (so the default program stays
 * focused). Listing here is the conscious "this is a swap alternate, not orphaned" decision
 * the catalogSync reachability test requires. Everything NOT listed must appear in a
 * generated program (a blueprint slot or the weekly core insertion).
 */
export const SWAP_ONLY_IDS: ReadonlySet<string> = new Set([
  // horizontal_push (machine_dip added 2026-07-10 â€” common-machines pass;
  //   incline_machine_press added 2026-07-12 â€” the swap-taxonomy pass: press_incline had no
  //   supported member, so an occupied incline bench had no answer at all)
  'machine_chest_press', 'push_up', 'knee_push_up', 'pec_deck', 'cable_fly', 'close_grip_bench', 'skullcrusher', 'machine_dip',
  'incline_machine_press',
  // horizontal_pull (preacher_curl generates since P2 â€” men's 5-day Pull B)
  'chin_up', 'db_row', 'machine_row', 'db_curl',
  // vertical_push (machine_lateral_raise added 2026-07-10 â€” common-machines pass)
  'machine_shoulder_press', 'arnold_press', 'machine_lateral_raise',
  // knee_dominant
  'leg_press_calf_raise', 'goblet_squat',
  // hip_dominant (alternate hinges; deadlift IS auto-generated â€” men's Pull; db_rdl since P3 â€” women's
  // Legs A; machine_hip_thrust + hip_adduction added 2026-07-10 â€” common-machines pass, founder ask)
  'sumo_deadlift', 'back_extension', 'machine_hip_thrust', 'hip_adduction',
  // 2026-07-12 swap-taxonomy pass: seated_leg_curl gives knee_flexion a second member (a busy
  //   leg curl used to fall through to a DEADLIFT); the two cable variants give the abductor and
  //   adductor machines a real peer each, so neither is ever answered with the other.
  'seated_leg_curl', 'cable_hip_abduction', 'cable_hip_adduction',
  // core â€” advanced movements are never assigned by default (generation pool = cable/machine crunch)
  'hanging_leg_raise', 'ab_wheel',
  /*
   * 2026-08-01 catalogue expansion. Two kinds join the list, for the reason the core entries above
   * already give: a REGRESSION is the answer to "I cannot do the loaded one yet", never something
   * to hand an athlete who did not ask (offering a bodyweight squat to someone squatting 60 kg
   * reads as the app losing confidence in her); and a movement that demands strength or skill she
   * may not have is hers to choose, not the app's to assign.
   */
  'incline_push_up', 'decline_push_up', 'bodyweight_squat', 'bw_calf_raise', 'bw_glute_bridge',
  'nordic_curl', 'pike_push_up',
  // The assist machines are the regression case in its purest form: the answer to "I cannot do the
  // loaded one yet", and never something to hand an athlete who did not ask for it.
  'assisted_pull_up', 'assisted_dip',
]);

export function isSwapOnly(id: string): boolean {
  return SWAP_ONLY_IDS.has(id);
}

// â”€â”€ Movement patterns (so coverage of the six fundamentals is verifiable) â”€â”€â”€â”€â”€
// The engine's `capability` is coarse (it folds vertical_pull into horizontal_pull). For
// movement-balance auditing we need the finer pattern â€” most importantly VERTICAL PULL
// (pull-ups / pulldowns), which the capability layer hides. Derived (never hand-maintained)
// so it can't drift from the catalog.
export type MovementPattern =
  | 'horizontal_push'
  | 'vertical_push'
  | 'horizontal_pull'
  | 'vertical_pull'
  | 'squat'
  | 'hinge'
  | 'arms'
  | 'side_delt'
  | 'calf'
  | 'core';

/** The six fundamental patterns a complete week should cover. */
export const FUNDAMENTAL_PATTERNS: readonly MovementPattern[] = [
  'horizontal_push', 'vertical_push', 'horizontal_pull', 'vertical_pull', 'squat', 'hinge',
];

const VERTICAL_PULL_IDS = new Set(['pull_up', 'chin_up', 'lat_pulldown']);

/** The movement pattern an exercise trains, finer than its engine capability. */
export function movementPattern(id: string): MovementPattern {
  const ex = BY_ID.get(id);
  if (!ex) return 'horizontal_push';
  if (VERTICAL_PULL_IDS.has(id)) return 'vertical_pull';
  switch (ex.capability) {
    case 'horizontal_push':
      return ex.muscle === 'Triceps' && ex.tier === 'isolation' ? 'arms' : 'horizontal_push';
    case 'horizontal_pull':
      return ex.muscle === 'Biceps' ? 'arms' : 'horizontal_pull';
    case 'vertical_push':
      return ex.tier === 'isolation' ? 'side_delt' : 'vertical_push';
    case 'knee_dominant':
      return ex.muscle === 'Calves' ? 'calf' : 'squat';
    case 'hip_dominant':
      return ex.muscle === 'Core' ? 'core' : 'hinge';
  }
}

/** The pattern if it is one of the six fundamentals, else null (an accessory pattern). */
export function fundamentalPattern(id: string): MovementPattern | null {
  const p = movementPattern(id);
  return (FUNDAMENTAL_PATTERNS as readonly string[]).includes(p) ? p : null;
}

// â”€â”€ Equipment-aware progression â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// WHEN to apply a step is the model's call; the catalog owns the GRANULARITY (the smallest
// real-world increment for the equipment), so a load never moves by an unloadable amount.
export const LOAD_STEP_KG: Record<EquipmentFamily, number> = {
  barbell: 2.5, // smallest plate pair commonly available (1.25 kg/side)
  dumbbell: 2, // next dumbbell up in the working range
  machine: 5, // pin / plate-stack increment
  cable: 5, // pin-stack increment
  bodyweight: 0, // no external load â€” progress by reps, then a harder variation
};

export type ProgressionMode = 'load' | 'reps';

export interface ProgressionRule {
  mode: ProgressionMode;
  /** Load step in kg (load mode only). */
  loadStepKg?: number;
  /** Rep target ceiling before advancing (reps mode only). */
  repCeiling?: number;
  /** A harder catalog variation to graduate to once the rep ceiling is held (reps mode). */
  harder?: string;
}

// Bodyweight lifts have no load axis: add reps to a ceiling, then graduate to a harder
// variation where one exists (else keep adding reps / external load on a belt).
const BODYWEIGHT_PROGRESSION: Record<string, { repCeiling: number; harder?: string }> = {
  knee_push_up: { repCeiling: 20, harder: 'push_up' },
  push_up: { repCeiling: 20, harder: 'chest_dip' },
  chest_dip: { repCeiling: 15 }, // then add load on a dip belt
  chin_up: { repCeiling: 12, harder: 'pull_up' },
  pull_up: { repCeiling: 12 }, // then add load on a belt
  hanging_leg_raise: { repCeiling: 15 },
  ab_wheel: { repCeiling: 12 },
};

/** The progression rule every exercise carries (load step, or a bodyweight rep/variation
 *  ladder). Defined for ALL catalog ids â€” the catalogSync test asserts 100% coverage. */
export function progressionRule(id: string): ProgressionRule {
  const ex = BY_ID.get(id);
  if (!ex) return { mode: 'load', loadStepKg: LOAD_STEP_KG.barbell };
  if (ex.bodyweight || ex.equipment === 'bodyweight') {
    const bw = BODYWEIGHT_PROGRESSION[id] ?? { repCeiling: 15 };
    return { mode: 'reps', repCeiling: bw.repCeiling, harder: bw.harder };
  }
  return { mode: 'load', loadStepKg: LOAD_STEP_KG[ex.equipment] };
}

// â”€â”€ Equipment-native load setup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// The default setup convention each equipment family implies. A machine is assumed SELECTORIZED
// (a pin stack) â€” the common case; the few plate-loaded machines carry an explicit `loadStyle`.
const DEFAULT_LOAD_STYLE: Record<EquipmentFamily, LoadStyle> = {
  barbell: 'barbell',
  dumbbell: 'dumbbell',
  cable: 'cable',
  machine: 'selectorized',
  bodyweight: 'bodyweight',
};

/** The load-setup convention for an exercise (explicit override, else the equipment default). A
 *  bodyweight movement is always 'bodyweight' regardless of its nominal equipment family. */
export function loadStyleOf(id: string | null | undefined): LoadStyle {
  const ex = id ? BY_ID.get(id) ?? BY_ID.get(catalogIdFromEngine(id)) : undefined;
  if (!ex) return 'barbell';
  if (ex.bodyweight || ex.equipment === 'bodyweight') return 'bodyweight';
  return ex.loadStyle ?? DEFAULT_LOAD_STYLE[ex.equipment];
}

// â”€â”€ Engine â†” catalog id reconciliation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// The frozen Python engine uses bare ids (bench_press) where the mobile catalog uses
// equipment-prefixed ids (bb_bench_press). This map reconciles the two WITHOUT renaming the
// frozen engine catalog or its append-only history, so a backend-driven block resolves to the
// right catalog exercise. The four dumbbell/machine ids already match and need no entry.
const ENGINE_TO_CATALOG: Record<string, string> = {
  bench_press: 'bb_bench_press',
  barbell_row: 'bb_row',
  overhead_press: 'bb_overhead_press',
  back_squat: 'bb_back_squat',
  deadlift: 'bb_deadlift',
  romanian_deadlift: 'bb_rdl',
};
const CATALOG_TO_ENGINE: Record<string, string> = Object.fromEntries(
  Object.entries(ENGINE_TO_CATALOG).map(([eng, cat]) => [cat, eng]),
);

/** Map a (possibly bare) engine exercise id to its mobile-catalog id. Identity if unknown. */
export function catalogIdFromEngine(id: string): string {
  return ENGINE_TO_CATALOG[id] ?? id;
}

/** Map a mobile-catalog id to the engine's bare id. Identity if unknown. */
export function engineIdFromCatalog(id: string): string {
  return CATALOG_TO_ENGINE[id] ?? id;
}

const BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));
const BY_CAPABILITY = new Map<Capability, Exercise[]>();
const BY_MUSCLE = new Map<MuscleGroup, Exercise[]>();
for (const e of EXERCISES) {
  const capList = BY_CAPABILITY.get(e.capability) ?? [];
  capList.push(e);
  BY_CAPABILITY.set(e.capability, capList);
  const mList = BY_MUSCLE.get(e.muscle) ?? [];
  mList.push(e);
  BY_MUSCLE.set(e.muscle, mList);
}

export function exerciseById(id: string): Exercise | undefined {
  return BY_ID.get(id);
}

/** The muscle group an exercise trains; undefined ids fall back to a safe default. */
export function muscleOf(id: string | null | undefined): MuscleGroup | undefined {
  return id ? BY_ID.get(id)?.muscle : undefined;
}

/**
 * A readable name for any exercise id, even one absent from the local catalog (the
 * live backend uses bare ids like "overhead_press" where the catalog has
 * "bb_overhead_press"). Returns the catalog name when known, otherwise humanizes the
 * id ("overhead_press" â†’ "Overhead Press"). Never returns a raw snake_case id.
 *
 * âš ï¸ AND THE THINGS THAT ARE NOT LIFTS HAVE NAMES TOO. The coach may prescribe any of the 25
 * MOVEMENTS, none of which is in `EXERCISES` â€” by design, since a run has no muscle and no
 * capability (`data/movements`). Left to the humaniser, `run_outdoor` came out as "Run Outdoor"
 * and `farmer_carry` lost its apostrophe: a catalogue we ship, spelled by a fallback.
 */
const EQUIP_PREFIX = new Set(['bb', 'db', 'kb', 'machine', 'cable', 'smith']);
export function exerciseDisplayName(id: string | null | undefined): string {
  if (!id) return '';
  const ex = BY_ID.get(id) ?? BY_ID.get(catalogIdFromEngine(id));
  if (ex) return ex.name;
  const move = MOVEMENTS.find((m) => m.id === id);
  if (move) return move.name;
  const parts = id.split('_').filter(Boolean);
  if (parts.length > 1 && EQUIP_PREFIX.has(parts[0])) parts.shift();
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

/**
 * Localized technique cues for an exercise. The catalog's English cues are the canonical source;
 * a locale overrides them under `cues.<exerciseId>.<0|1|2>` (Hebrew ships the full library â€”
 * technique guidance follows the app language even though exercise NAMES stay English by product
 * rule). Falls back to the catalog string per-cue, so a missing translation never blanks a note.
 *
 * GENDER (founder 2026-07-12). Every Hebrew cue that carries a verb is an IMPERATIVE â€” "×”×•×¨×“
 * ×œ×—×–×” ×‘×©×œ×™×˜×”" â€” and an imperative in Hebrew is gendered. The library was masculine throughout,
 * so a woman was being commanded in the wrong person on the one screen whose entire job is to
 * teach her how to move safely. `cues.<id>_female` carries her forms.
 *
 * This does NOT go through i18next's `context`, and cannot: context appends its suffix to the
 * whole key, which for an indexed array lookup would ask for `cues.bb_bench_press.0_female` â€”
 * a path that does not and cannot exist inside a JSON array. The gendered ARRAY is selected
 * first, and the masculine cue is its fallback, so an exercise with no feminine variant (a
 * gender-neutral note like "×ž×¨×¤×§×™× ×¦×ž×•×“×™× ×œ×’×•×£") simply keeps the one line it always had.
 */
export function exerciseCues(id: string | null | undefined): string[] {
  if (!id) return [];
  const ex = BY_ID.get(id) ?? BY_ID.get(catalogIdFromEngine(id));
  if (!ex) return [];
  if (!i18next.isInitialized) return [...ex.cues];
  const female = getGender() === 'female';
  return ex.cues.map((cue, i) => {
    const base = i18next.t(`cues.${ex.id}.${i}`, { defaultValue: cue });
    if (!female) return base;
    return i18next.t(`cues.${ex.id}_female.${i}`, { defaultValue: base });
  });
}

/**
 * Localized display for a muscle-group list ("Chest Â· Shoulders" / "×—×–×” Â· ×›×ª×¤×™×™×").
 * Exercise NAMES stay English by product rule; muscle groups follow the app language
 * (RTL audit ratification, 2026-06-30). Unknown values pass through untranslated.
 */
export function muscleGroupsLabel(groups: readonly string[] | undefined): string {
  if (!groups?.length) return '';
  return groups
    .map((m) => (i18next.isInitialized ? i18next.t(`muscle.${m}`, { defaultValue: m }) : m))
    .join(' Â· ');
}

/** Class-matched candidates for a slot's capability (the engine's coarse pattern). */
export function exercisesForCapability(capability: Capability): Exercise[] {
  return BY_CAPABILITY.get(capability) ?? [];
}

/**
 * Candidates that share a muscle group â€” the pool a SWAP draws from (UX Â§1.2). Because
 * each muscle is a strict subset of one capability, the slot's capability is preserved
 * automatically, and the swap never offers a cross-muscle option (no squat â†’ calf raise).
 */
export function exercisesForMuscle(muscle: MuscleGroup): Exercise[] {
  return BY_MUSCLE.get(muscle) ?? [];
}

/**
 * â”€â”€ REMOVED 2026-07-12: `similarExercises` and its name-token scorer. â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *
 * It ranked substitutes by counting shared WORDS in the exercise name, over a pool scoped only by
 * muscle. When no words matched â€” which is most of the time â€” every candidate tied, and the
 * "ranking" silently collapsed into CATALOG ORDER, i.e. the order the rows happen to sit in this
 * file. That is how the leg press came to suggest a Barbell Back Squat (first Quads row), the lat
 * pulldown a Barbell Row, and a busy leg curl a DEADLIFT.
 *
 * Substitution is now decided on movement facts â€” pattern, support, tier, unilateral â€” by the
 * single pool in `domain/swapPool`. Every surface (phone, watch, program editor, weekly rotation)
 * goes through it. Nothing chooses a substitute from this file any more.
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€*/
