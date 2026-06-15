/**
 * Exercise catalog. V1 is gym-based with a barbell always present (ratified
 * product scope). Each capability has at least one class-matched exercise.
 *
 * Each exercise carries exactly 3 plain-language TECHNIQUE CUES — a quick
 * reminder before a set, surfaced as "Technique notes" (Pause → Technique notes).
 * Hush does NOT ship demo videos, clips, or any content-delivery surface
 * (removed from v1, 2026-06-13). The goal is decision-making, not teaching.
 *
 * Exercise names are proper nouns kept in the catalog (not Hush voice copy);
 * catalog localization is future scope alongside Hebrew.
 */
import type { Capability } from './local/models';

export type EquipmentFamily = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight';

export interface Exercise {
  id: string;
  name: string;
  capability: Capability;
  equipment: EquipmentFamily;
  /** Exactly 3 concise technique cues (UX: a reminder, never a lesson). */
  cues: [string, string, string];
  synonyms?: string[]; // forgiving search (e.g. "RDL" -> Romanian deadlift)
}

export const EXERCISES: Exercise[] = [
  { id: 'bb_bench_press', name: 'Barbell Bench Press', capability: 'horizontal_push', equipment: 'barbell', cues: ['Keep your feet planted.', 'Lower with control.', 'Drive the bar straight up.'] },
  { id: 'bb_row', name: 'Barbell Row', capability: 'horizontal_pull', equipment: 'barbell', cues: ['Hinge to about 45°.', 'Pull to your lower ribs.', 'Control the descent.'] },
  { id: 'bb_overhead_press', name: 'Overhead Press', capability: 'vertical_push', equipment: 'barbell', cues: ['Brace your midsection.', 'Bar over the mid-foot.', 'Lock out overhead.'] },
  { id: 'bb_back_squat', name: 'Barbell Back Squat', capability: 'knee_dominant', equipment: 'barbell', cues: ['Big breath, brace.', 'Sit between the hips.', 'Drive up evenly.'] },
  { id: 'bb_rdl', name: 'Romanian Deadlift', capability: 'hip_dominant', equipment: 'barbell', cues: ['Soft knees.', 'Push the hips back.', 'Keep the bar close.'], synonyms: ['rdl'] },

  // Class-matched alternatives (for Replacement; UX §1.2 keeps choices in-class).
  { id: 'db_bench_press', name: 'Dumbbell Bench Press', capability: 'horizontal_push', equipment: 'dumbbell', cues: ['Stack your wrists.', 'Lower under control.', 'Press to lockout.'], synonyms: ['db press', 'dumbbell press'] },
  { id: 'machine_chest_press', name: 'Machine Chest Press', capability: 'horizontal_push', equipment: 'machine', cues: ['Set the seat height.', 'Press smoothly.', 'Control the return.'] },
  { id: 'cable_row', name: 'Seated Cable Row', capability: 'horizontal_pull', equipment: 'cable', cues: ['Tall chest.', 'Pull to your waist.', 'Release slowly.'] },
  { id: 'db_row', name: 'Dumbbell Row', capability: 'horizontal_pull', equipment: 'dumbbell', cues: ['Keep a flat back.', 'Row to your hip.', 'Control the way down.'], synonyms: ['db row'] },
  { id: 'db_shoulder_press', name: 'Dumbbell Shoulder Press', capability: 'vertical_push', equipment: 'dumbbell', cues: ['Brace first.', 'Press overhead.', 'Lower to your ears.'], synonyms: ['db ohp'] },
  { id: 'machine_shoulder_press', name: 'Machine Shoulder Press', capability: 'vertical_push', equipment: 'machine', cues: ['Set the seat.', 'Press up.', 'Control the way down.'] },
  { id: 'leg_press', name: 'Leg Press', capability: 'knee_dominant', equipment: 'machine', cues: ['Feet mid-platform.', 'Knees track your toes.', "Don't lock out hard."] },
  { id: 'goblet_squat', name: 'Goblet Squat', capability: 'knee_dominant', equipment: 'dumbbell', cues: ['Hold it at your chest.', 'Sit straight down.', 'Drive up.'] },
  { id: 'db_rdl', name: 'Dumbbell Romanian Deadlift', capability: 'hip_dominant', equipment: 'dumbbell', cues: ['Soft knees.', 'Hips back.', 'Keep the weights close.'], synonyms: ['db rdl', 'dumbbell rdl'] },
  { id: 'back_extension', name: 'Back Extension', capability: 'hip_dominant', equipment: 'machine', cues: ['Hinge at the hips.', 'Squeeze at the top.', 'Lower slowly.'], synonyms: ['hyperextension'] },
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

/** Class-matched candidates for a slot's capability (Replacement stays in-class, UX §1.2). */
export function exercisesForCapability(capability: Capability): Exercise[] {
  return BY_CAPABILITY.get(capability) ?? [];
}
