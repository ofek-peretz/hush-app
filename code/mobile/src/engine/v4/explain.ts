/**
 * Hush v4 engine — Phase 5b: explanations (Frozen Spec §14, I-26/27).
 *
 * Every emitted change carries {observation, conclusion, action} + rendered text. The reprice
 * explanation NEVER says "fatigue" and NEVER implies volume was cut (I-27) — it says the load was
 * matched to demonstrated capability and volume was kept.
 */
import type { SlotDecision, Explanation } from './types';

export type NameOf = (exerciseId: string) => string;

const fmt = (n: number | null): string => (n == null ? 'bodyweight' : `${Math.round(n * 10) / 10} kg`);

export function explain(d: SlotDecision, nameOf: NameOf = (id) => id): Explanation | null {
  const ex = nameOf(d.exercise_id);
  let observation = '';
  let conclusion = '';
  let action = '';
  let text = '';

  switch (d.type) {
    case 'progress_reps':
      observation = `Improving on ${ex} but near your limit.`;
      conclusion = `One more rep per set first.`;
      action = `Target ${d.rep_target} reps.`;
      text = `Improving but near your limit — one more rep per set first.`;
      break;
    case 'progress_load':
      observation = `Your ${ex} hit the top of the range with room.`;
      conclusion = `Time to add load.`;
      action = d.deltaKg ? `Added ${d.deltaKg} kg.` : `Graduated to a harder variation.`;
      text = d.deltaKg ? `Your ${ex} hit the top reps with room, so I added ${d.deltaKg} kg.` : `Your ${ex} owns this — stepping up to a harder variation.`;
      break;
    case 'reprice':
      // I-27: no "fatigue", no claim that volume changed.
      observation = `Last week ${ex} came in under the target.`;
      conclusion = `That tells me the right weight for now.`;
      action = `Set to ${fmt(d.load_kg)}, sets unchanged so you keep training hard.`;
      text = `Last week ${ex} came in under the prescription — that tells me the right weight for now. Set to ${fmt(d.load_kg)}, sets unchanged so you keep training hard.`;
      break;
    case 'lever_vol':
      observation = `Your ${ex} held steady.`;
      conclusion = `Adding a set for more stimulus.`;
      action = `Now ${d.sets} sets.`;
      text = `Your ${ex} held steady, so I added a set for more stimulus.`;
      break;
    case 'lever_load':
      observation = `${ex} plateaued.`;
      conclusion = `Nudging the load to break the stall.`;
      action = d.deltaKg ? `Added ${d.deltaKg} kg.` : `Stepped the load up.`;
      text = `${ex} plateaued with full volume — adding ${d.deltaKg ?? ''} kg to break the stall.`;
      break;
    case 'lever_range':
      observation = `${ex} plateaued with full volume.`;
      conclusion = `Changing the rep scheme, keeping the lift.`;
      action = `New range ${d.rep_range[0]}–${d.rep_range[1]}.`;
      text = `${ex} plateaued with full volume — changing the scheme to ${d.rep_range[0]}–${d.rep_range[1]}, keeping the lift.`;
      break;
    case 'patient_hold':
      observation = `${ex} is steady right now.`;
      conclusion = `Holding and re-testing.`;
      action = d.deltaKg ? `Probing a small bump.` : `Holding this week.`;
      text = `${ex} is steady right now — holding it and re-testing; I'll probe a bump shortly.`;
      break;
    case 'swap':
      observation = `${ex}'s slot has missed the mark while your other lifts are fine.`;
      conclusion = `Swapping the exercise.`;
      action = `Moved to ${ex}.`;
      text = `That lift missed the mark for a few weeks while your other lifts were fine — swapping to ${ex}.`;
      break;
    case 'deload':
      observation = `You flagged something to train around.`;
      conclusion = `Pulling the weight and volume back so you can train safely.`;
      action = `Eased to ${fmt(d.load_kg)}, ${d.sets} sets.`;
      text = `I've pulled the weight and volume back so you can keep training safely.`;
      break;
    case 'absence':
      observation = `Over a week off.`;
      conclusion = `Easing back in.`;
      action = `Eased ~10% to ${fmt(d.load_kg)}.`;
      text = `Over a week off — eased ~10% and we'll rebuild.`;
      break;
    case 'adherence_hold':
      observation = `Last week didn't fully happen.`;
      conclusion = `Holding everything and trimming volume to make this week finishable.`;
      action = `Trimmed to ${d.sets} sets.`;
      text = `Held everything and trimmed volume to make this week finishable.`;
      break;
    case 'calibrate':
    case 'hold':
    default:
      return null; // calibration steps + steady holds are not surfaced as a "change" (R7 / I-26)
  }
  return { slotId: d.slotId, pattern: d.pattern, observation, conclusion, action, text };
}
