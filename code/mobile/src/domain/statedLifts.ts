/**
 * ════ THE WEIGHTS SHE LIFTS TODAY, ASKED ONCE ════
 *
 * Founder, 2026-10-11, after a live walk as a man who benches 100 kg: *"אני לא חושב שצריך כרגע לתת לו
 * את העט כי בשביל זה יש את הבינה — אם היא צריכה מידע נוסף בשביל לדייק כמה שיותר את התוכנית עבור
 * המתאמן אפשר להוסיף עוד נתונים שהבינה חייבת למסכים ב-onboarding. אני רוצה את תוכנית האימון הטובה
 * ביותר לכל מתאמן."*
 *
 * What the walk showed the model was missing: it wrote the four lifts he had typed at his numbers,
 * exactly — and every lift he had NOT typed opened at a stranger's weight (a Romanian deadlift at
 * 55 kg beside a 160 kg deadlift; an incline dumbbell press at 16 kg a hand beside a 100 kg bench).
 * 26 of 30. And he had typed his numbers only because he was playing a man who would; the field is
 * one free line, and most people write a goal in it.
 *
 * So the one thing the model must have and was not reliably given is asked for outright: a few
 * lifts, each a weight and a count of reps, every one optional. It is asked only of an athlete who
 * said she has trained before — a beginner has no numbers, and the cold start is right for her.
 *
 * ⚠️ FOUR LIFTS, NOT A FORM. His own rulings on the intake stand (2026-09-16: *"המוח של האדם הוא
 * עצלן… צריך לדלל"*; no session-length wheel, "full freedom" to the model on everything a coach
 * decides). A goal, a length, a room and a focus are coaching decisions she can write in her line;
 * her bench is a FACT only she has. This step asks for facts and nothing else.
 */

import type { Program } from '@/data/local/models';
import { exerciseById } from '@/data/exercises';

export interface StatedLift {
  exerciseId: string;
  /** The total on the bar, in kg — as every load in this app is stored. */
  kg: number;
  /** How many reps she does with it. Absent when she gave only the weight. */
  reps?: number;
}

/**
 * Which lifts the step asks about — the ones a week's other loads can be read from. By sex, the
 * way the milestone ladders already lean (`domain/milestones`): the posterior chain leads for a
 * woman, the classics for a man. Four, so the step is one screen and no scroll.
 */
export function intakeLifts(sex: 'female' | 'male' | undefined): readonly string[] {
  return sex === 'female'
    ? ['bb_back_squat', 'hip_thrust', 'bb_deadlift', 'bb_bench_press']
    : ['bb_bench_press', 'bb_back_squat', 'bb_deadlift', 'bb_overhead_press'];
}

/** Is this athlete asked what she lifts? Only one who said she has trained — see the header. */
export function asksStatedLifts(experience: string | null | undefined): boolean {
  return experience === 'intermediate' || experience === 'advanced';
}

/** How many steps her intake has: three, or four with this one. One rule, read by every screen's bar. */
export function intakeStepsFor(experience: string | null | undefined): 3 | 4 {
  return asksStatedLifts(experience) ? 4 : 3;
}

/** The heaviest a typed lift may be before it is a slip of the thumb rather than a lift. */
export const STATED_LIFT_MAX_KG = 500;
export const STATED_REPS_MAX = 50;

/** Only real lifts leave the step: a known id, a positive finite weight, a sane count. */
export function cleanStatedLifts(lifts: readonly Partial<StatedLift>[] | null | undefined): StatedLift[] {
  const out: StatedLift[] = [];
  const seen = new Set<string>();
  for (const l of lifts ?? []) {
    if (!l || typeof l.exerciseId !== 'string' || seen.has(l.exerciseId) || !exerciseById(l.exerciseId)) continue;
    const kg = Number(l.kg);
    if (!Number.isFinite(kg) || kg <= 0 || kg > STATED_LIFT_MAX_KG) continue;
    const reps = Number(l.reps);
    const hasReps = Number.isInteger(reps) && reps >= 1 && reps <= STATED_REPS_MAX;
    seen.add(l.exerciseId);
    out.push({ exerciseId: l.exerciseId, kg: Math.round(kg * 100) / 100, ...(hasReps ? { reps } : {}) });
  }
  return out;
}

/**
 * The line the model reads: catalogue ids, so nothing has to be matched by name.
 * `bb_bench_press 100 kg x 6; bb_back_squat 130 kg x 5`
 */
export function statedLiftsLine(lifts: readonly StatedLift[]): string {
  return lifts.map((l) => `${l.exerciseId} ${l.kg} kg${l.reps ? ` x ${l.reps}` : ''}`).join('; ');
}

/**
 * Her own number opens her own lift, whatever the model did with it.
 *
 * The model is asked to carry these into the week, and it does. This is the floor under that: a
 * lift she named that the week contains and the model left without a load opens at HER number —
 * never at a stranger's. A load the model did write is left alone (it may have chosen a rep range
 * her number was not lifted in). Bodyweight lifts take no load in a week (`Slot.startLoadKg`).
 */
export function seedStatedLoads(program: Program, lifts: readonly StatedLift[]): Program {
  if (!lifts.length) return program;
  const byId = new Map(lifts.map((l) => [l.exerciseId, l.kg]));
  let touched = false;
  const days = program.days.map((d) => ({
    ...d,
    slots: d.slots.map((s) => {
      const kg = byId.get(s.exerciseId);
      if (kg == null || s.startLoadKg != null || exerciseById(s.exerciseId)?.bodyweight) return s;
      touched = true;
      return { ...s, startLoadKg: kg };
    }),
  }));
  return touched ? { ...program, days } : program;
}
