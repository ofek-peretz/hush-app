/**
 * Hush v4 engine — Phase 5b: explanations (Frozen Spec §14, I-26/27).
 *
 * Every emitted change carries {observation, conclusion, action} + a headline (`text`). These are
 * i18n LINES ({key, params}) — never baked strings — so they obey the project copy law, translate,
 * and persist locale-independently; the Weekly Update screen resolves them through i18next. The
 * reprice explanation NEVER says "fatigue" and NEVER implies volume was cut (I-27): it states the
 * load was matched to demonstrated capability and the sets were kept.
 */
import type { SlotDecision, Explanation, ExplanationLine } from './types';

export type NameOf = (exerciseId: string) => string;

/** Round a load for display (the unit is added by the copy: "{{load}} kg"). */
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Shorthand for an i18n line under the `explain` namespace. */
const L = (key: string, params?: ExplanationLine['params']): ExplanationLine => ({
  key: `explain.${key}`,
  params,
});

export function explain(d: SlotDecision, nameOf: NameOf = (id) => id): Explanation | null {
  const ex = nameOf(d.exercise_id);
  const load = d.load_kg != null ? round1(d.load_kg) : null;
  const hasDelta = d.deltaKg != null && d.deltaKg !== 0;
  let observation: ExplanationLine;
  let conclusion: ExplanationLine;
  let action: ExplanationLine;
  let text: ExplanationLine;

  switch (d.type) {
    case 'progress_reps':
      observation = L('progressReps.observation', { ex });
      conclusion = L('progressReps.conclusion');
      action = L('progressReps.action', { reps: d.rep_target });
      text = L('progressReps.text', { ex });
      break;
    case 'progress_load':
      observation = L('progressLoad.observation', { ex });
      conclusion = L(hasDelta ? 'progressLoad.conclusion' : 'progressLoad.conclusionVariation');
      action = hasDelta
        ? L('progressLoad.action', { delta: d.deltaKg! })
        : L('progressLoad.actionVariation');
      text = hasDelta
        ? L('progressLoad.text', { ex, delta: d.deltaKg! })
        : L('progressLoad.textVariation', { ex });
      break;
    case 'reprice':
      // I-27: no "fatigue", no claim that volume changed.
      observation = L('reprice.observation', { ex });
      conclusion = L('reprice.conclusion');
      action = load != null ? L('reprice.action', { load }) : L('reprice.actionBw');
      text = load != null ? L('reprice.text', { ex, load }) : L('reprice.textBw', { ex });
      break;
    case 'lever_vol':
      observation = L('leverVol.observation', { ex });
      conclusion = L('leverVol.conclusion');
      action = L('leverVol.action', { sets: d.sets });
      text = L('leverVol.text', { ex });
      break;
    case 'lever_load':
      observation = L('leverLoad.observation', { ex });
      conclusion = L('leverLoad.conclusion');
      action = hasDelta ? L('leverLoad.action', { delta: d.deltaKg! }) : L('leverLoad.actionStep');
      text = hasDelta ? L('leverLoad.text', { ex, delta: d.deltaKg! }) : L('leverLoad.textStep', { ex });
      break;
    case 'lever_range':
      observation = L('leverRange.observation', { ex });
      conclusion = L('leverRange.conclusion');
      action = L('leverRange.action', { lo: d.rep_range[0], hi: d.rep_range[1] });
      text = L('leverRange.text', { ex, lo: d.rep_range[0], hi: d.rep_range[1] });
      break;
    case 'patient_hold':
      observation = L('patientHold.observation', { ex });
      conclusion = L('patientHold.conclusion');
      action = hasDelta ? L('patientHold.action') : L('patientHold.actionHold');
      text = L('patientHold.text', { ex });
      break;
    case 'swap':
      observation = L('swap.observation');
      conclusion = L('swap.conclusion');
      action = L('swap.action', { ex });
      text = L('swap.text', { ex });
      break;
    case 'deload':
      observation = L('deload.observation');
      conclusion = L('deload.conclusion');
      action = load != null ? L('deload.action', { load, sets: d.sets }) : L('deload.actionBw', { sets: d.sets });
      text = L('deload.text');
      break;
    case 'absence':
      observation = L('absence.observation');
      conclusion = L('absence.conclusion');
      action = load != null ? L('absence.action', { load }) : L('absence.actionBw');
      text = L('absence.text');
      break;
    case 'adherence_hold':
      observation = L('adherenceHold.observation');
      conclusion = L('adherenceHold.conclusion');
      action = L('adherenceHold.action', { sets: d.sets });
      text = L('adherenceHold.text');
      break;
    case 'calibrate':
    case 'hold':
    default:
      return null; // calibration steps + steady holds are not surfaced as a "change" (R7 / I-26)
  }
  return { slotId: d.slotId, pattern: d.pattern, observation, conclusion, action, text };
}
