/**
 * Exercise catalog. V1 is gym-based with a full commercial gym available (barbell,
 * dumbbells, machines, cables). The catalog is a broad set of the most common,
 * proven, high-yield movements — the lifts people actually do — never obscure ones.
 *
 * Each exercise carries exactly 3 plain-language TECHNIQUE CUES (a reminder, never a
 * lesson; surfaced as "Technique notes"). Hush ships NO demo videos.
 *
 * Movement model: the engine's primitive is the FIVE Class-A capabilities. Every
 * exercise is classified into its NEAREST capability so swaps stay in-pattern and the
 * model can own load/progression per capability:
 *   horizontal_push — chest / triceps pressing      (incl. dips, pec deck, pushdowns)
 *   horizontal_pull — back / lats / biceps pulling   (incl. pulldowns, pull-ups, curls)
 *   vertical_push   — shoulders pressing             (incl. lateral raises)
 *   knee_dominant   — quads (squat pattern)          (incl. lunges, extensions)
 *   hip_dominant    — posterior chain / glutes       (incl. deadlift, RDL, hip thrust, curls)
 *
 * Seed metadata (`baseKg` / `bwScaled` / `tier` / `bodyweight`) feeds the cold-start
 * starting-weight model in fixtureModel.sessionTargets (personalized by sex, bodyweight,
 * experience). `baseKg` is a CONSERVATIVE starting load for an intermediate male ~75kg
 * (per dumbbell for dumbbell lifts); `bwScaled` lifts scale with the athlete's bodyweight.
 */
import type { Capability } from './local/models';

export type EquipmentFamily = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight';

export interface Exercise {
  id: string;
  name: string;
  capability: Capability;
  equipment: EquipmentFamily;
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
}

export const EXERCISES: Exercise[] = [
  // ───────────────────────── horizontal_push (chest / triceps) ─────────────────────────
  { id: 'bb_bench_press', name: 'Barbell Bench Press', capability: 'horizontal_push', equipment: 'barbell', tier: 'compound', baseKg: 40, bwScaled: true, cues: ['Keep your feet planted.', 'Lower to the chest with control.', 'Drive the bar straight up.'], synonyms: ['bench'] },
  { id: 'incline_bb_press', name: 'Incline Barbell Press', capability: 'horizontal_push', equipment: 'barbell', tier: 'compound', baseKg: 30, bwScaled: true, cues: ['Set a ~30° incline.', 'Lower to the upper chest.', 'Press up and slightly back.'], synonyms: ['incline bench'] },
  { id: 'db_bench_press', name: 'Dumbbell Bench Press', capability: 'horizontal_push', equipment: 'dumbbell', tier: 'compound', baseKg: 16, cues: ['Stack your wrists.', 'Lower under control.', 'Press to lockout.'], synonyms: ['db press', 'dumbbell press'] },
  { id: 'incline_db_press', name: 'Incline Dumbbell Press', capability: 'horizontal_push', equipment: 'dumbbell', tier: 'compound', baseKg: 14, cues: ['Set a ~30° incline.', 'Lower to the upper chest.', 'Press up evenly.'], synonyms: ['incline db'] },
  { id: 'machine_chest_press', name: 'Machine Chest Press', capability: 'horizontal_push', equipment: 'machine', tier: 'compound', baseKg: 35, cues: ['Set the seat height.', 'Press smoothly.', 'Control the return.'] },
  { id: 'close_grip_bench', name: 'Close-Grip Bench Press', capability: 'horizontal_push', equipment: 'barbell', tier: 'compound', baseKg: 32, bwScaled: true, cues: ['Hands shoulder-width.', 'Tuck the elbows.', 'Press through the triceps.'] },
  { id: 'chest_dip', name: 'Chest Dip', capability: 'horizontal_push', equipment: 'bodyweight', tier: 'compound', bodyweight: true, cues: ['Lean slightly forward.', 'Lower to a deep stretch.', 'Press to lockout.'], synonyms: ['dips'] },
  { id: 'push_up', name: 'Push-Up', capability: 'horizontal_push', equipment: 'bodyweight', tier: 'compound', bodyweight: true, cues: ['Body in a straight line.', 'Lower the chest to the floor.', 'Press the floor away.'] },
  { id: 'pec_deck', name: 'Pec Deck Fly', capability: 'horizontal_push', equipment: 'machine', tier: 'isolation', baseKg: 25, cues: ['Soft elbows.', 'Squeeze the chest together.', 'Open slowly.'], synonyms: ['chest fly', 'machine fly'] },
  { id: 'cable_fly', name: 'Cable Fly', capability: 'horizontal_push', equipment: 'cable', tier: 'isolation', baseKg: 12, cues: ['Slight forward lean.', 'Hug the arms together.', 'Control the stretch.'] },
  { id: 'triceps_pushdown', name: 'Triceps Pushdown', capability: 'horizontal_push', equipment: 'cable', tier: 'isolation', baseKg: 20, cues: ['Pin the elbows to your sides.', 'Extend fully.', 'Resist on the way up.'], synonyms: ['pushdown'] },
  { id: 'overhead_triceps_ext', name: 'Overhead Triceps Extension', capability: 'horizontal_push', equipment: 'cable', tier: 'isolation', baseKg: 15, cues: ['Elbows by your ears.', 'Stretch behind the head.', 'Extend to lockout.'] },

  // ───────────────────────── horizontal_pull (back / lats / biceps) ─────────────────────────
  { id: 'bb_row', name: 'Barbell Row', capability: 'horizontal_pull', equipment: 'barbell', tier: 'compound', baseKg: 40, bwScaled: true, cues: ['Hinge to about 45°.', 'Pull to your lower ribs.', 'Control the descent.'] },
  { id: 'pull_up', name: 'Pull-Up', capability: 'horizontal_pull', equipment: 'bodyweight', tier: 'compound', bodyweight: true, cues: ['Start from a dead hang.', 'Drive the elbows down.', 'Chin over the bar.'] },
  { id: 'chin_up', name: 'Chin-Up', capability: 'horizontal_pull', equipment: 'bodyweight', tier: 'compound', bodyweight: true, cues: ['Underhand grip.', 'Pull the chest to the bar.', 'Lower under control.'] },
  { id: 'lat_pulldown', name: 'Lat Pulldown', capability: 'horizontal_pull', equipment: 'cable', tier: 'compound', baseKg: 35, cues: ['Tall chest.', 'Pull to the collarbone.', 'Control the bar up.'], synonyms: ['pulldown'] },
  { id: 'cable_row', name: 'Seated Cable Row', capability: 'horizontal_pull', equipment: 'cable', tier: 'compound', baseKg: 35, cues: ['Tall chest.', 'Pull to your waist.', 'Release slowly.'] },
  { id: 'db_row', name: 'Dumbbell Row', capability: 'horizontal_pull', equipment: 'dumbbell', tier: 'compound', baseKg: 18, cues: ['Keep a flat back.', 'Row to your hip.', 'Control the way down.'], synonyms: ['db row'] },
  { id: 't_bar_row', name: 'T-Bar Row', capability: 'horizontal_pull', equipment: 'barbell', tier: 'compound', baseKg: 30, bwScaled: true, cues: ['Hinge with a flat back.', 'Pull to the chest.', 'Lower fully.'] },
  { id: 'machine_row', name: 'Machine Row', capability: 'horizontal_pull', equipment: 'machine', tier: 'compound', baseKg: 35, cues: ['Chest on the pad.', 'Drive the elbows back.', 'Control the return.'] },
  { id: 'face_pull', name: 'Face Pull', capability: 'horizontal_pull', equipment: 'cable', tier: 'isolation', baseKg: 15, cues: ['Pull to your forehead.', 'Lead with the elbows.', 'Squeeze the rear delts.'] },
  { id: 'bb_curl', name: 'Barbell Curl', capability: 'horizontal_pull', equipment: 'barbell', tier: 'isolation', baseKg: 20, cues: ['Elbows pinned to your sides.', 'Curl without swinging.', 'Lower under control.'] },
  { id: 'db_curl', name: 'Dumbbell Curl', capability: 'horizontal_pull', equipment: 'dumbbell', tier: 'isolation', baseKg: 10, cues: ['No swinging.', 'Curl and squeeze.', 'Lower slowly.'] },
  { id: 'hammer_curl', name: 'Hammer Curl', capability: 'horizontal_pull', equipment: 'dumbbell', tier: 'isolation', baseKg: 10, cues: ['Neutral grip.', 'Keep elbows still.', 'Control the descent.'] },
  { id: 'rear_delt_fly', name: 'Rear Delt Fly', capability: 'horizontal_pull', equipment: 'dumbbell', tier: 'isolation', baseKg: 7, cues: ['Soft elbows.', 'Open to the sides.', 'Squeeze the rear delts.'] },

  // ───────────────────────── vertical_push (shoulders) ─────────────────────────
  { id: 'bb_overhead_press', name: 'Overhead Press', capability: 'vertical_push', equipment: 'barbell', tier: 'compound', baseKg: 25, bwScaled: true, cues: ['Brace your midsection.', 'Bar over the mid-foot.', 'Lock out overhead.'], synonyms: ['ohp', 'shoulder press'] },
  { id: 'db_shoulder_press', name: 'Dumbbell Shoulder Press', capability: 'vertical_push', equipment: 'dumbbell', tier: 'compound', baseKg: 14, cues: ['Brace first.', 'Press overhead.', 'Lower to your ears.'], synonyms: ['db ohp'] },
  { id: 'machine_shoulder_press', name: 'Machine Shoulder Press', capability: 'vertical_push', equipment: 'machine', tier: 'compound', baseKg: 25, cues: ['Set the seat.', 'Press up.', 'Control the way down.'] },
  { id: 'arnold_press', name: 'Arnold Press', capability: 'vertical_push', equipment: 'dumbbell', tier: 'compound', baseKg: 12, cues: ['Start palms facing you.', 'Rotate as you press.', 'Lower with control.'] },
  { id: 'lateral_raise', name: 'Lateral Raise', capability: 'vertical_push', equipment: 'dumbbell', tier: 'isolation', baseKg: 7, cues: ['Soft elbows.', 'Raise to shoulder height.', 'Lower slowly.'], synonyms: ['side raise'] },
  { id: 'cable_lateral_raise', name: 'Cable Lateral Raise', capability: 'vertical_push', equipment: 'cable', tier: 'isolation', baseKg: 6, cues: ['Lead with the elbow.', 'Raise to shoulder height.', 'Resist on the way down.'] },

  // ───────────────────────── knee_dominant (quads) ─────────────────────────
  { id: 'bb_back_squat', name: 'Barbell Back Squat', capability: 'knee_dominant', equipment: 'barbell', tier: 'compound', baseKg: 50, bwScaled: true, cues: ['Big breath, brace.', 'Sit between the hips.', 'Drive up evenly.'], synonyms: ['squat'] },
  { id: 'front_squat', name: 'Front Squat', capability: 'knee_dominant', equipment: 'barbell', tier: 'compound', baseKg: 35, bwScaled: true, cues: ['Elbows high.', 'Stay upright.', 'Drive through mid-foot.'] },
  { id: 'leg_press', name: 'Leg Press', capability: 'knee_dominant', equipment: 'machine', tier: 'compound', baseKg: 80, bwScaled: true, cues: ['Feet mid-platform.', 'Knees track your toes.', "Don't lock out hard."] },
  { id: 'hack_squat', name: 'Hack Squat', capability: 'knee_dominant', equipment: 'machine', tier: 'compound', baseKg: 50, bwScaled: true, cues: ['Back flat on the pad.', 'Sit down and back.', 'Drive through the heels.'] },
  { id: 'goblet_squat', name: 'Goblet Squat', capability: 'knee_dominant', equipment: 'dumbbell', tier: 'compound', baseKg: 16, cues: ['Hold it at your chest.', 'Sit straight down.', 'Drive up.'] },
  { id: 'bulgarian_split_squat', name: 'Bulgarian Split Squat', capability: 'knee_dominant', equipment: 'dumbbell', tier: 'compound', baseKg: 10, cues: ['Back foot elevated.', 'Drop straight down.', 'Drive through the front heel.'], synonyms: ['split squat'] },
  { id: 'walking_lunge', name: 'Walking Lunge', capability: 'knee_dominant', equipment: 'dumbbell', tier: 'compound', baseKg: 10, cues: ['Long step.', 'Knee tracks the toes.', 'Push off the front foot.'], synonyms: ['lunge'] },
  { id: 'leg_extension', name: 'Leg Extension', capability: 'knee_dominant', equipment: 'machine', tier: 'isolation', baseKg: 30, cues: ['Sit tall.', 'Extend fully.', 'Lower under control.'] },

  // ───────────────────────── hip_dominant (posterior chain / glutes) ─────────────────────────
  { id: 'bb_deadlift', name: 'Deadlift', capability: 'hip_dominant', equipment: 'barbell', tier: 'compound', baseKg: 60, bwScaled: true, cues: ['Bar over mid-foot.', 'Flat back, brace.', 'Push the floor away.'], synonyms: ['conventional deadlift'] },
  { id: 'bb_rdl', name: 'Romanian Deadlift', capability: 'hip_dominant', equipment: 'barbell', tier: 'compound', baseKg: 50, bwScaled: true, cues: ['Soft knees.', 'Push the hips back.', 'Keep the bar close.'], synonyms: ['rdl'] },
  { id: 'sumo_deadlift', name: 'Sumo Deadlift', capability: 'hip_dominant', equipment: 'barbell', tier: 'compound', baseKg: 60, bwScaled: true, cues: ['Wide stance.', 'Knees out.', 'Drive hips through.'] },
  { id: 'db_rdl', name: 'Dumbbell Romanian Deadlift', capability: 'hip_dominant', equipment: 'dumbbell', tier: 'compound', baseKg: 18, cues: ['Soft knees.', 'Hips back.', 'Keep the weights close.'], synonyms: ['db rdl', 'dumbbell rdl'] },
  { id: 'hip_thrust', name: 'Barbell Hip Thrust', capability: 'hip_dominant', equipment: 'barbell', tier: 'compound', baseKg: 40, bwScaled: true, cues: ['Upper back on the bench.', 'Drive through the heels.', 'Squeeze the glutes at the top.'], synonyms: ['thrust'] },
  { id: 'glute_bridge', name: 'Glute Bridge', capability: 'hip_dominant', equipment: 'barbell', tier: 'compound', baseKg: 30, cues: ['Heels close.', 'Drive the hips up.', 'Squeeze at the top.'] },
  { id: 'cable_pull_through', name: 'Cable Pull-Through', capability: 'hip_dominant', equipment: 'cable', tier: 'isolation', baseKg: 25, cues: ['Hinge at the hips.', 'Push the hips back.', 'Snap the hips forward.'] },
  { id: 'good_morning', name: 'Good Morning', capability: 'hip_dominant', equipment: 'barbell', tier: 'compound', baseKg: 25, bwScaled: true, cues: ['Soft knees.', 'Hinge with a flat back.', 'Feel the hamstrings.'] },
  { id: 'leg_curl', name: 'Leg Curl', capability: 'hip_dominant', equipment: 'machine', tier: 'isolation', baseKg: 25, cues: ['Hips down.', 'Curl fully.', 'Lower slowly.'], synonyms: ['hamstring curl'] },
  { id: 'back_extension', name: 'Back Extension', capability: 'hip_dominant', equipment: 'machine', tier: 'isolation', bodyweight: true, cues: ['Hinge at the hips.', 'Squeeze at the top.', 'Lower slowly.'], synonyms: ['hyperextension'] },
];

const BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));
const BY_CAPABILITY = new Map<Capability, Exercise[]>();
for (const e of EXERCISES) {
  const list = BY_CAPABILITY.get(e.capability) ?? [];
  list.push(e);
  BY_CAPABILITY.set(e.capability, list);
}

export function exerciseById(id: string): Exercise | undefined {
  return BY_ID.get(id);
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
  const ex = BY_ID.get(id);
  if (ex) return ex.name;
  const parts = id.split('_').filter(Boolean);
  if (parts.length > 1 && EQUIP_PREFIX.has(parts[0])) parts.shift();
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

/** Class-matched candidates for a slot's capability (Replacement stays in-class, UX §1.2). */
export function exercisesForCapability(capability: Capability): Exercise[] {
  return BY_CAPABILITY.get(capability) ?? [];
}
