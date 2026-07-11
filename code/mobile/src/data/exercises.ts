/**
 * Exercise catalog. V1 is gym-based with a full commercial gym available (barbell,
 * dumbbells, machines, cables). The catalog is a broad set of the most common,
 * proven, high-yield movements — the lifts people actually do — never obscure ones.
 *
 * Each exercise carries exactly 3 plain-language TECHNIQUE CUES (a reminder, never a
 * lesson; surfaced as "Technique notes"). Hush ships NO demo videos.
 *
 * TWO classifications per exercise (kept DISTINCT on purpose):
 *   capability — the engine's primitive (FIVE Class-A patterns). The model owns
 *     load/progression per capability and the slot's capability is FIXED. Every
 *     exercise maps to its NEAREST capability so swaps stay in-pattern.
 *   muscle     — the human-readable muscle group, used for DISPLAY and to SCOPE swaps
 *     (chest swaps with chest, not triceps; calves only with calves). Each muscle is a
 *     strict SUBSET of one capability, so a muscle-scoped swap never crosses the slot's
 *     capability contract:
 *       horizontal_push → { Chest, Triceps }
 *       horizontal_pull → { Back, Biceps }
 *       vertical_push   → { Shoulders }
 *       knee_dominant   → { Quads, Calves }
 *       hip_dominant    → { Hamstrings, Glutes, Core }
 *     (Decouple decision 2026-06-21: Calves/Core/arms get full coverage as muscle
 *     groups WITHOUT adding engine capabilities — the 5-bar Capability Portrait and the
 *     frozen engine stay untouched.)
 *
 * Seed metadata (`baseKg` / `bwScaled` / `tier` / `bodyweight`) feeds the cold-start
 * starting-weight model in fixtureModel.sessionTargets (personalized by sex, bodyweight,
 * experience, age). `baseKg` is a CONSERVATIVE starting load for an intermediate male
 * ~75kg (per dumbbell for dumbbell lifts); `bwScaled` lifts scale with the athlete's
 * bodyweight.
 */
import i18next from 'i18next';
import type { Capability } from './local/models';

export type EquipmentFamily = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight';

/**
 * How a load is physically SET UP — finer than `equipment`, so the live workout can tell the
 * athlete exactly what to do (plate math, dumbbell-per-hand, a pin, a fixed bar) and they never
 * have to calculate. Display-only; the engine never reads it (it keys on `capability`). Defaults
 * are derived from `equipment` (see `loadStyleOf`); an exercise overrides only when the default is
 * wrong (e.g. a plate-loaded machine, which the default would treat as a selectorized pin stack).
 */
export type LoadStyle =
  | 'barbell' // an Olympic bar + plates → "20 + 20 / side", "20 kg bar"
  | 'fixed_barbell' // a pre-weighted fixed bar → "Use the 30 kg bar"
  | 'dumbbell' // one dumbbell per hand → "20 kg / hand"
  | 'selectorized' // a pin-selected weight stack → "Set the pin to 24"
  | 'cable' // a pin-selected cable stack → "Set the pin to 28"
  | 'plate_loaded' // a lever machine loaded with plates → "30 + 30 / side"
  | 'bodyweight'; // no external load

/** Human-readable muscle group — display + swap scoping. Subset of one capability. */
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
  /** Setup convention for the load display (defaults from `equipment`; override only when the
   *  default is wrong — e.g. a plate-loaded leg press, not a selectorized stack). */
  loadStyle?: LoadStyle;
  /** Exactly 3 concise technique cues. */
  cues: [string, string, string];
  synonyms?: string[];
  /** Big multi-joint lift vs single-joint accessory — drives default reps. */
  tier: 'compound' | 'isolation';
  /** Conservative starting load (kg) for an intermediate male ~75kg; per dumbbell for
   *  dumbbell lifts. Omitted for bodyweight movements. */
  baseKg?: number;
  /** Scale the seed with the athlete's bodyweight (true for the big barbell lifts). */
  bwScaled?: boolean;
  /** Loaded by bodyweight — no external weight prescribed. */
  bodyweight?: boolean;
  /** Intentionally NOT placed in the auto-generated split — available only as a swap /
   *  equipment-busy backup. Every catalog exercise must be reachable by generation OR be
   *  flagged swapOnly (enforced by the catalogSync test), so nothing is ever orphaned. */
  swapOnly?: boolean;
}

export const EXERCISES: Exercise[] = [
  // ───────────────────────── horizontal_push · Chest ─────────────────────────
  { id: 'bb_bench_press', name: 'Barbell Bench Press', capability: 'horizontal_push', muscle: 'Chest', equipment: 'barbell', tier: 'compound', baseKg: 40, bwScaled: true, cues: ['Keep your feet planted.', 'Lower to the chest with control.', 'Drive the bar straight up.'], synonyms: ['bench'] },
  { id: 'incline_bb_press', name: 'Incline Barbell Press', capability: 'horizontal_push', muscle: 'Chest', equipment: 'barbell', tier: 'compound', baseKg: 30, bwScaled: true, cues: ['Set a ~30° incline.', 'Lower to the upper chest.', 'Press up and slightly back.'], synonyms: ['incline bench'] },
  { id: 'db_bench_press', name: 'Dumbbell Bench Press', capability: 'horizontal_push', muscle: 'Chest', equipment: 'dumbbell', tier: 'compound', baseKg: 16, cues: ['Stack your wrists.', 'Lower under control.', 'Press to lockout.'], synonyms: ['db press', 'dumbbell press'] },
  { id: 'incline_db_press', name: 'Incline Dumbbell Press', capability: 'horizontal_push', muscle: 'Chest', equipment: 'dumbbell', tier: 'compound', baseKg: 14, cues: ['Set a ~30° incline.', 'Lower to the upper chest.', 'Press up evenly.'], synonyms: ['incline db'] },
  { id: 'machine_chest_press', name: 'Machine Chest Press', capability: 'horizontal_push', muscle: 'Chest', equipment: 'machine', tier: 'compound', baseKg: 35, cues: ['Set the seat height.', 'Press smoothly.', 'Control the return.'] },
  { id: 'chest_dip', name: 'Chest Dip', capability: 'horizontal_push', muscle: 'Chest', equipment: 'bodyweight', tier: 'compound', bodyweight: true, cues: ['Lean slightly forward.', 'Lower to a deep stretch.', 'Press to lockout.'], synonyms: ['dips'] },
  { id: 'push_up', name: 'Push-Up', capability: 'horizontal_push', muscle: 'Chest', equipment: 'bodyweight', tier: 'compound', bodyweight: true, cues: ['Body in a straight line.', 'Lower the chest to the floor.', 'Press the floor away.'] },
  { id: 'knee_push_up', name: 'Knee Push-Up', capability: 'horizontal_push', muscle: 'Chest', equipment: 'bodyweight', tier: 'compound', bodyweight: true, cues: ['Body straight from knees to head.', 'Lower the chest to the floor.', 'Press the floor away.'], synonyms: ['kneeling push-up'] },
  { id: 'pec_deck', name: 'Pec Deck Fly', capability: 'horizontal_push', muscle: 'Chest', equipment: 'machine', tier: 'isolation', baseKg: 25, cues: ['Soft elbows.', 'Squeeze the chest together.', 'Open slowly.'], synonyms: ['chest fly', 'machine fly'] },
  { id: 'cable_fly', name: 'Cable Fly', capability: 'horizontal_push', muscle: 'Chest', equipment: 'cable', tier: 'isolation', baseKg: 12, cues: ['Slight forward lean.', 'Hug the arms together.', 'Control the stretch.'] },

  // ───────────────────────── horizontal_push · Triceps ─────────────────────────
  { id: 'close_grip_bench', name: 'Close-Grip Bench Press', capability: 'horizontal_push', muscle: 'Triceps', equipment: 'barbell', tier: 'compound', baseKg: 32, bwScaled: true, cues: ['Hands shoulder-width.', 'Tuck the elbows.', 'Press through the triceps.'] },
  { id: 'triceps_pushdown', name: 'Triceps Pushdown', capability: 'horizontal_push', muscle: 'Triceps', equipment: 'cable', tier: 'isolation', baseKg: 20, cues: ['Pin the elbows to your sides.', 'Extend fully.', 'Resist on the way up.'], synonyms: ['pushdown'] },
  { id: 'overhead_triceps_ext', name: 'Overhead Triceps Extension', capability: 'horizontal_push', muscle: 'Triceps', equipment: 'cable', tier: 'isolation', baseKg: 15, cues: ['Elbows by your ears.', 'Stretch behind the head.', 'Extend to lockout.'] },
  { id: 'skullcrusher', name: 'Skullcrusher', capability: 'horizontal_push', muscle: 'Triceps', equipment: 'barbell', tier: 'isolation', baseKg: 20, cues: ['Elbows pointed up.', 'Lower to the forehead.', 'Extend to lockout.'], synonyms: ['lying triceps extension'] },
  { id: 'machine_dip', name: 'Seated Dip Machine', capability: 'horizontal_push', muscle: 'Triceps', equipment: 'machine', tier: 'compound', baseKg: 40, cues: ['Chest tall, shoulders down.', 'Press the handles to lockout.', 'Control the return.'], synonyms: ['triceps dip machine', 'seated dip'] },

  // ───────────────────────── horizontal_pull · Back ─────────────────────────
  { id: 'bb_row', name: 'Barbell Row', capability: 'horizontal_pull', muscle: 'Back', equipment: 'barbell', tier: 'compound', baseKg: 40, bwScaled: true, cues: ['Hinge to about 45°.', 'Pull to your lower ribs.', 'Control the descent.'] },
  { id: 'pull_up', name: 'Pull-Up', capability: 'horizontal_pull', muscle: 'Back', equipment: 'bodyweight', tier: 'compound', bodyweight: true, cues: ['Start from a dead hang.', 'Drive the elbows down.', 'Chin over the bar.'] },
  { id: 'chin_up', name: 'Chin-Up', capability: 'horizontal_pull', muscle: 'Back', equipment: 'bodyweight', tier: 'compound', bodyweight: true, cues: ['Underhand grip.', 'Pull the chest to the bar.', 'Lower under control.'] },
  { id: 'lat_pulldown', name: 'Lat Pulldown', capability: 'horizontal_pull', muscle: 'Back', equipment: 'cable', tier: 'compound', baseKg: 35, cues: ['Tall chest.', 'Pull to the collarbone.', 'Control the bar up.'], synonyms: ['pulldown'] },
  { id: 'cable_row', name: 'Seated Cable Row', capability: 'horizontal_pull', muscle: 'Back', equipment: 'cable', tier: 'compound', baseKg: 35, cues: ['Tall chest.', 'Pull to your waist.', 'Release slowly.'] },
  { id: 'db_row', name: 'Dumbbell Row', capability: 'horizontal_pull', muscle: 'Back', equipment: 'dumbbell', tier: 'compound', baseKg: 18, cues: ['Keep a flat back.', 'Row to your hip.', 'Control the way down.'], synonyms: ['db row'] },
  { id: 't_bar_row', name: 'T-Bar Row', capability: 'horizontal_pull', muscle: 'Back', equipment: 'barbell', tier: 'compound', baseKg: 30, bwScaled: true, cues: ['Hinge with a flat back.', 'Pull to the chest.', 'Lower fully.'] },
  { id: 'machine_row', name: 'Machine Row', capability: 'horizontal_pull', muscle: 'Back', equipment: 'machine', tier: 'compound', baseKg: 35, cues: ['Chest on the pad.', 'Drive the elbows back.', 'Control the return.'] },
  { id: 'face_pull', name: 'Face Pull', capability: 'horizontal_pull', muscle: 'Back', equipment: 'cable', tier: 'isolation', baseKg: 15, cues: ['Pull to your forehead.', 'Lead with the elbows.', 'Squeeze the rear delts.'] },
  { id: 'rear_delt_fly', name: 'Rear Delt Fly', capability: 'horizontal_pull', muscle: 'Back', equipment: 'dumbbell', tier: 'isolation', baseKg: 7, cues: ['Soft elbows.', 'Open to the sides.', 'Squeeze the rear delts.'] },

  // ───────────────────────── horizontal_pull · Biceps ─────────────────────────
  { id: 'bb_curl', name: 'Barbell Curl', capability: 'horizontal_pull', muscle: 'Biceps', equipment: 'barbell', tier: 'isolation', baseKg: 20, cues: ['Elbows pinned to your sides.', 'Curl without swinging.', 'Lower under control.'] },
  { id: 'db_curl', name: 'Dumbbell Curl', capability: 'horizontal_pull', muscle: 'Biceps', equipment: 'dumbbell', tier: 'isolation', baseKg: 10, cues: ['No swinging.', 'Curl and squeeze.', 'Lower slowly.'] },
  { id: 'hammer_curl', name: 'Hammer Curl', capability: 'horizontal_pull', muscle: 'Biceps', equipment: 'dumbbell', tier: 'isolation', baseKg: 10, cues: ['Neutral grip.', 'Keep elbows still.', 'Control the descent.'] },
  { id: 'preacher_curl', name: 'Preacher Curl', capability: 'horizontal_pull', muscle: 'Biceps', equipment: 'machine', tier: 'isolation', baseKg: 18, cues: ['Arms flat on the pad.', 'Curl without lifting the elbows.', 'Lower under control.'] },

  // ───────────────────────── vertical_push · Shoulders ─────────────────────────
  { id: 'bb_overhead_press', name: 'Overhead Press', capability: 'vertical_push', muscle: 'Shoulders', equipment: 'barbell', tier: 'compound', baseKg: 25, bwScaled: true, cues: ['Brace your midsection.', 'Bar over the mid-foot.', 'Lock out overhead.'], synonyms: ['ohp', 'shoulder press'] },
  { id: 'db_shoulder_press', name: 'Dumbbell Shoulder Press', capability: 'vertical_push', muscle: 'Shoulders', equipment: 'dumbbell', tier: 'compound', baseKg: 14, cues: ['Brace first.', 'Press overhead.', 'Lower to your ears.'], synonyms: ['db ohp'] },
  { id: 'machine_shoulder_press', name: 'Machine Shoulder Press', capability: 'vertical_push', muscle: 'Shoulders', equipment: 'machine', tier: 'compound', baseKg: 25, cues: ['Set the seat.', 'Press up.', 'Control the way down.'] },
  { id: 'arnold_press', name: 'Arnold Press', capability: 'vertical_push', muscle: 'Shoulders', equipment: 'dumbbell', tier: 'compound', baseKg: 12, cues: ['Start palms facing you.', 'Rotate as you press.', 'Lower with control.'] },
  { id: 'lateral_raise', name: 'Lateral Raise', capability: 'vertical_push', muscle: 'Shoulders', equipment: 'dumbbell', tier: 'isolation', baseKg: 7, cues: ['Soft elbows.', 'Raise to shoulder height.', 'Lower slowly.'], synonyms: ['side raise'] },
  { id: 'cable_lateral_raise', name: 'Cable Lateral Raise', capability: 'vertical_push', muscle: 'Shoulders', equipment: 'cable', tier: 'isolation', baseKg: 6, cues: ['Lead with the elbow.', 'Raise to shoulder height.', 'Resist on the way down.'] },
  { id: 'machine_lateral_raise', name: 'Machine Lateral Raise', capability: 'vertical_push', muscle: 'Shoulders', equipment: 'machine', tier: 'isolation', baseKg: 20, cues: ['Set the seat so pads sit at the elbows.', 'Raise to shoulder height.', 'Lower slowly.'], synonyms: ['lateral raise machine', 'side raise machine'] },

  // ───────────────────────── knee_dominant · Quads ─────────────────────────
  { id: 'bb_back_squat', name: 'Barbell Back Squat', capability: 'knee_dominant', muscle: 'Quads', equipment: 'barbell', tier: 'compound', baseKg: 50, bwScaled: true, cues: ['Big breath, brace.', 'Sit between the hips.', 'Drive up evenly.'], synonyms: ['squat'] },
  { id: 'front_squat', name: 'Front Squat', capability: 'knee_dominant', muscle: 'Quads', equipment: 'barbell', tier: 'compound', baseKg: 35, bwScaled: true, cues: ['Elbows high.', 'Stay upright.', 'Drive through mid-foot.'] },
  { id: 'leg_press', name: 'Leg Press', capability: 'knee_dominant', muscle: 'Quads', equipment: 'machine', loadStyle: 'plate_loaded', tier: 'compound', baseKg: 80, bwScaled: true, cues: ['Feet mid-platform.', 'Knees track your toes.', "Don't lock out hard."] },
  { id: 'hack_squat', name: 'Hack Squat', capability: 'knee_dominant', muscle: 'Quads', equipment: 'machine', loadStyle: 'plate_loaded', tier: 'compound', baseKg: 50, bwScaled: true, cues: ['Back flat on the pad.', 'Sit down and back.', 'Drive through the heels.'] },
  { id: 'goblet_squat', name: 'Goblet Squat', capability: 'knee_dominant', muscle: 'Quads', equipment: 'dumbbell', tier: 'compound', baseKg: 16, cues: ['Hold it at your chest.', 'Sit straight down.', 'Drive up.'] },
  { id: 'bulgarian_split_squat', name: 'Bulgarian Split Squat', capability: 'knee_dominant', muscle: 'Quads', equipment: 'dumbbell', tier: 'compound', baseKg: 10, cues: ['Back foot elevated.', 'Drop straight down.', 'Drive through the front heel.'], synonyms: ['split squat'] },
  { id: 'walking_lunge', name: 'Walking Lunge', capability: 'knee_dominant', muscle: 'Quads', equipment: 'dumbbell', tier: 'compound', baseKg: 10, cues: ['Long step.', 'Knee tracks the toes.', 'Push off the front foot.'], synonyms: ['lunge'] },
  { id: 'leg_extension', name: 'Leg Extension', capability: 'knee_dominant', muscle: 'Quads', equipment: 'machine', tier: 'isolation', baseKg: 30, cues: ['Sit tall.', 'Extend fully.', 'Lower under control.'] },

  // ───────────────────────── knee_dominant · Calves ─────────────────────────
  { id: 'standing_calf_raise', name: 'Standing Calf Raise', capability: 'knee_dominant', muscle: 'Calves', equipment: 'machine', tier: 'isolation', baseKg: 40, bwScaled: true, cues: ['Rise onto the balls of your feet.', 'Pause at the top.', 'Lower for a full stretch.'] },
  { id: 'seated_calf_raise', name: 'Seated Calf Raise', capability: 'knee_dominant', muscle: 'Calves', equipment: 'machine', tier: 'isolation', baseKg: 25, cues: ['Knees under the pad.', 'Drive through the toes.', 'Stretch at the bottom.'] },
  { id: 'leg_press_calf_raise', name: 'Leg Press Calf Raise', capability: 'knee_dominant', muscle: 'Calves', equipment: 'machine', loadStyle: 'plate_loaded', tier: 'isolation', baseKg: 60, bwScaled: true, cues: ['Toes on the platform edge.', 'Press through the balls of your feet.', 'Control the stretch.'] },

  // ───────────────────────── hip_dominant · Hamstrings ─────────────────────────
  { id: 'bb_deadlift', name: 'Deadlift', capability: 'hip_dominant', muscle: 'Hamstrings', equipment: 'barbell', tier: 'compound', baseKg: 60, bwScaled: true, cues: ['Bar over mid-foot.', 'Flat back, brace.', 'Push the floor away.'], synonyms: ['conventional deadlift'] },
  { id: 'bb_rdl', name: 'Romanian Deadlift', capability: 'hip_dominant', muscle: 'Hamstrings', equipment: 'barbell', tier: 'compound', baseKg: 50, bwScaled: true, cues: ['Soft knees.', 'Push the hips back.', 'Keep the bar close.'], synonyms: ['rdl'] },
  { id: 'sumo_deadlift', name: 'Sumo Deadlift', capability: 'hip_dominant', muscle: 'Hamstrings', equipment: 'barbell', tier: 'compound', baseKg: 60, bwScaled: true, cues: ['Wide stance.', 'Knees out.', 'Drive hips through.'] },
  { id: 'db_rdl', name: 'Dumbbell Romanian Deadlift', capability: 'hip_dominant', muscle: 'Hamstrings', equipment: 'dumbbell', tier: 'compound', baseKg: 18, cues: ['Soft knees.', 'Hips back.', 'Keep the weights close.'], synonyms: ['db rdl', 'dumbbell rdl'] },
  // (Good Morning removed 2026-07-05 — highest injury-to-value hinge in the catalog for the
  // general population; RDL / back extension cover the movement.)
  { id: 'leg_curl', name: 'Leg Curl', capability: 'hip_dominant', muscle: 'Hamstrings', equipment: 'machine', tier: 'isolation', baseKg: 25, cues: ['Hips down.', 'Curl fully.', 'Lower slowly.'], synonyms: ['hamstring curl'] },
  { id: 'back_extension', name: 'Back Extension', capability: 'hip_dominant', muscle: 'Hamstrings', equipment: 'machine', tier: 'isolation', bodyweight: true, cues: ['Hinge at the hips.', 'Squeeze at the top.', 'Lower slowly.'], synonyms: ['hyperextension'] },

  // ───────────────────────── hip_dominant · Glutes ─────────────────────────
  { id: 'hip_thrust', name: 'Barbell Hip Thrust', capability: 'hip_dominant', muscle: 'Glutes', equipment: 'barbell', tier: 'compound', baseKg: 40, bwScaled: true, cues: ['Upper back on the bench.', 'Drive through the heels.', 'Squeeze the glutes at the top.'], synonyms: ['thrust'] },
  { id: 'glute_bridge', name: 'Glute Bridge', capability: 'hip_dominant', muscle: 'Glutes', equipment: 'barbell', tier: 'compound', baseKg: 30, cues: ['Heels close.', 'Drive the hips up.', 'Squeeze at the top.'] },
  { id: 'cable_pull_through', name: 'Cable Pull-Through', capability: 'hip_dominant', muscle: 'Glutes', equipment: 'cable', tier: 'isolation', baseKg: 25, cues: ['Hinge at the hips.', 'Push the hips back.', 'Snap the hips forward.'] },
  { id: 'hip_abduction', name: 'Hip Abduction', capability: 'hip_dominant', muscle: 'Glutes', equipment: 'machine', tier: 'isolation', baseKg: 30, cues: ['Sit tall.', 'Press the knees out.', 'Control the return.'], synonyms: ['abductor machine'] },
  { id: 'cable_kickback', name: 'Cable Glute Kickback', capability: 'hip_dominant', muscle: 'Glutes', equipment: 'cable', tier: 'isolation', baseKg: 10, cues: ['Hinge slightly forward.', 'Drive the heel back.', 'Squeeze the glute.'], synonyms: ['glute kickback'] },
  { id: 'machine_hip_thrust', name: 'Machine Hip Thrust', capability: 'hip_dominant', muscle: 'Glutes', equipment: 'machine', loadStyle: 'plate_loaded', tier: 'compound', baseKg: 40, bwScaled: true, cues: ['Upper back settled on the pad.', 'Drive through the heels.', 'Squeeze the glutes at the top.'], synonyms: ['hip thrust machine', 'glute drive'] },
  { id: 'hip_adduction', name: 'Hip Adduction', capability: 'hip_dominant', muscle: 'Glutes', equipment: 'machine', tier: 'isolation', baseKg: 30, cues: ['Sit tall.', 'Squeeze the knees together.', 'Control the return.'], synonyms: ['adductor machine', 'inner thigh machine'] },

  // ───────────────────────── hip_dominant · Core ─────────────────────────
  // Generation pool = the accessible movements (cable/machine crunch); hanging leg raise and the
  // ab wheel demand strength/skill a first-week athlete does not have, so they are swap-only —
  // reachable the day an athlete asks for them, never assigned by default.
  { id: 'cable_crunch', name: 'Cable Crunch', capability: 'hip_dominant', muscle: 'Core', equipment: 'cable', tier: 'isolation', baseKg: 25, cues: ['Hips fixed.', 'Crunch through the abs.', 'Resist on the way up.'] },
  { id: 'machine_crunch', name: 'Ab Crunch Machine', capability: 'hip_dominant', muscle: 'Core', equipment: 'machine', tier: 'isolation', baseKg: 30, cues: ['Chest on the pad.', 'Crunch down through the abs.', 'Return with control.'], synonyms: ['crunch machine', 'ab machine'] },
  { id: 'hanging_leg_raise', name: 'Hanging Leg Raise', capability: 'hip_dominant', muscle: 'Core', equipment: 'bodyweight', tier: 'isolation', bodyweight: true, cues: ['Hang tall, no swing.', 'Raise the legs with control.', 'Lower slowly.'] },
  { id: 'ab_wheel', name: 'Ab Wheel Rollout', capability: 'hip_dominant', muscle: 'Core', equipment: 'bodyweight', tier: 'isolation', bodyweight: true, cues: ['Brace hard.', 'Roll out only as far as you control.', 'Pull back with the abs.'], synonyms: ['rollout'] },
];

// ───────────────────────── catalog ↔ engine synchronization ─────────────────────────
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
  // horizontal_push (machine_dip added 2026-07-10 — common-machines pass)
  'machine_chest_press', 'push_up', 'knee_push_up', 'pec_deck', 'cable_fly', 'close_grip_bench', 'skullcrusher', 'machine_dip',
  // horizontal_pull (preacher_curl generates since P2 — men's 5-day Pull B)
  'chin_up', 'db_row', 'machine_row', 'db_curl',
  // vertical_push (machine_lateral_raise added 2026-07-10 — common-machines pass)
  'machine_shoulder_press', 'arnold_press', 'machine_lateral_raise',
  // knee_dominant
  'leg_press_calf_raise', 'goblet_squat',
  // hip_dominant (alternate hinges; deadlift IS auto-generated — men's Pull; db_rdl since P3 — women's
  // Legs A; machine_hip_thrust + hip_adduction added 2026-07-10 — common-machines pass, founder ask)
  'sumo_deadlift', 'back_extension', 'machine_hip_thrust', 'hip_adduction',
  // core — advanced movements are never assigned by default (generation pool = cable/machine crunch)
  'hanging_leg_raise', 'ab_wheel',
]);

export function isSwapOnly(id: string): boolean {
  return SWAP_ONLY_IDS.has(id);
}

// ── Movement patterns (so coverage of the six fundamentals is verifiable) ─────
// The engine's `capability` is coarse (it folds vertical_pull into horizontal_pull). For
// movement-balance auditing we need the finer pattern — most importantly VERTICAL PULL
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

// ── Equipment-aware progression ──────────────────────────────────────────────
// WHEN to apply a step is the model's call; the catalog owns the GRANULARITY (the smallest
// real-world increment for the equipment), so a load never moves by an unloadable amount.
export const LOAD_STEP_KG: Record<EquipmentFamily, number> = {
  barbell: 2.5, // smallest plate pair commonly available (1.25 kg/side)
  dumbbell: 2, // next dumbbell up in the working range
  machine: 5, // pin / plate-stack increment
  cable: 5, // pin-stack increment
  bodyweight: 0, // no external load — progress by reps, then a harder variation
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
 *  ladder). Defined for ALL catalog ids — the catalogSync test asserts 100% coverage. */
export function progressionRule(id: string): ProgressionRule {
  const ex = BY_ID.get(id);
  if (!ex) return { mode: 'load', loadStepKg: LOAD_STEP_KG.barbell };
  if (ex.bodyweight || ex.equipment === 'bodyweight') {
    const bw = BODYWEIGHT_PROGRESSION[id] ?? { repCeiling: 15 };
    return { mode: 'reps', repCeiling: bw.repCeiling, harder: bw.harder };
  }
  return { mode: 'load', loadStepKg: LOAD_STEP_KG[ex.equipment] };
}

// ── Equipment-native load setup ──────────────────────────────────────────────
// The default setup convention each equipment family implies. A machine is assumed SELECTORIZED
// (a pin stack) — the common case; the few plate-loaded machines carry an explicit `loadStyle`.
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

// ── Equipment-busy backups ───────────────────────────────────────────────────
// General availability of an equipment family (lower = easier to grab when the gym is busy).
const EQUIP_AVAILABILITY: Record<EquipmentFamily, number> = {
  bodyweight: 0,
  dumbbell: 1,
  machine: 2,
  cable: 3,
  barbell: 4, // the contended rack/platform — worst fallback when busy
};

/**
 * The default equipment-busy backup for an exercise: a same-muscle alternative on a
 * DIFFERENT (and generally more available) equipment family, so if the current station is
 * taken the backup isn't. Deterministic; the slot's capability is preserved automatically
 * (muscle ⊂ capability). Returns undefined only if the muscle has no other exercise.
 */
export function defaultBackup(id: string): Exercise | undefined {
  const cur = BY_ID.get(id);
  if (!cur) return undefined;
  const pool = (BY_MUSCLE.get(cur.muscle) ?? []).filter((e) => e.id !== id);
  if (!pool.length) return undefined;
  return pool.slice().sort((a, b) => {
    const diff = (a.equipment === cur.equipment ? 1 : 0) - (b.equipment === cur.equipment ? 1 : 0);
    if (diff) return diff; // prefer a different equipment family first
    const avail = EQUIP_AVAILABILITY[a.equipment] - EQUIP_AVAILABILITY[b.equipment];
    if (avail) return avail; // then the more available family
    return (a.tier === cur.tier ? 0 : 1) - (b.tier === cur.tier ? 0 : 1); // then same tier
  })[0];
}

// ── Engine ↔ catalog id reconciliation ───────────────────────────────────────
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
 * id ("overhead_press" → "Overhead Press"). Never returns a raw snake_case id.
 */
const EQUIP_PREFIX = new Set(['bb', 'db', 'kb', 'machine', 'cable', 'smith']);
export function exerciseDisplayName(id: string | null | undefined): string {
  if (!id) return '';
  const ex = BY_ID.get(id) ?? BY_ID.get(catalogIdFromEngine(id));
  if (ex) return ex.name;
  const parts = id.split('_').filter(Boolean);
  if (parts.length > 1 && EQUIP_PREFIX.has(parts[0])) parts.shift();
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

/**
 * Localized technique cues for an exercise. The catalog's English cues are the
 * canonical source; a locale overrides them under `cues.<exerciseId>.<0|1|2>`
 * (Hebrew ships the full library — technique guidance follows the app language even
 * though exercise NAMES stay English by product rule). Falls back to the catalog
 * string per-cue, so a missing translation never blanks a note.
 */
export function exerciseCues(id: string | null | undefined): string[] {
  if (!id) return [];
  const ex = BY_ID.get(id) ?? BY_ID.get(catalogIdFromEngine(id));
  if (!ex) return [];
  return ex.cues.map((cue, i) =>
    i18next.isInitialized ? i18next.t(`cues.${ex.id}.${i}`, { defaultValue: cue }) : cue,
  );
}

/**
 * Localized display for a muscle-group list ("Chest · Shoulders" / "חזה · כתפיים").
 * Exercise NAMES stay English by product rule; muscle groups follow the app language
 * (RTL audit ratification, 2026-06-30). Unknown values pass through untranslated.
 */
export function muscleGroupsLabel(groups: readonly string[] | undefined): string {
  if (!groups?.length) return '';
  return groups
    .map((m) => (i18next.isInitialized ? i18next.t(`muscle.${m}`, { defaultValue: m }) : m))
    .join(' · ');
}

/** Class-matched candidates for a slot's capability (the engine's coarse pattern). */
export function exercisesForCapability(capability: Capability): Exercise[] {
  return BY_CAPABILITY.get(capability) ?? [];
}

/**
 * Candidates that share a muscle group — the pool a SWAP draws from (UX §1.2). Because
 * each muscle is a strict subset of one capability, the slot's capability is preserved
 * automatically, and the swap never offers a cross-muscle option (no squat → calf raise).
 */
export function exercisesForMuscle(muscle: MuscleGroup): Exercise[] {
  return BY_MUSCLE.get(muscle) ?? [];
}

/** Equipment / qualifier words that don't describe the training EFFECT. */
const SWAP_STOPWORDS = new Set(['barbell', 'dumbbell', 'machine', 'cable', 'seated', 'standing', 'db', 'bb', 'the', 'a']);
function movementTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((t) => t && !SWAP_STOPWORDS.has(t));
}

/**
 * Swap candidates for an exercise, ordered by how closely they MIMIC THE SAME
 * EFFECT — same tier (compound/isolation) weighs most, then shared movement words
 * in the name (e.g. "press", "row", "curl"). Always muscle-scoped (so the slot's
 * capability contract holds). Pass `limit` to cap the list (the in-workout swap
 * offers the best 2; the Program editor passes no limit to keep the full variety,
 * still best-matched first).
 */
export function similarExercises(currentId: string, limit?: number): Exercise[] {
  const current = BY_ID.get(currentId);
  if (!current) return [];
  const curTokens = new Set(movementTokens(current.name));
  const pool = (BY_MUSCLE.get(current.muscle) ?? []).filter((e) => e.id !== currentId);
  const scored = pool.map((e, i) => {
    let score = e.tier === current.tier ? 10 : 0;
    for (const tok of movementTokens(e.name)) if (curTokens.has(tok)) score += 3;
    return { e, score, i };
  });
  // Highest score first; stable (catalog order) for ties.
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  const ordered = scored.map((s) => s.e);
  return limit != null ? ordered.slice(0, limit) : ordered;
}
