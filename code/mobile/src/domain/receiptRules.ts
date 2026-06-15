/**
 * Receipt rules — the trust engine (UX §5.8, spec §5.4, §2.9, §6.4).
 *
 * THE ASYMMETRY, PROTECTED ABOVE ALL:
 *   Hush is loud (once, quietly) when RIGHT, and silent when WRONG.
 *   A receipt surfaces only for a forecast that came TRUE, once, on the set
 *   where it resolves. Misses and voids are retired SILENTLY — never announced,
 *   apologized for, defended, or blamed on the athlete.
 *
 * This is the single code path that resolves forecasts. Do not add any branch
 * that surfaces a miss.
 */
import type { Line } from '@/domain/voice';
import type {
  ForecastRecord as Rec,
  ForecastState,
  PortraitSnapshot,
  SetLog,
} from '@/data/local/models';
import { isStillLearning } from '@/domain/portrait';

export interface Resolution {
  state: ForecastState;
  receipt: Line | null; // non-null ONLY on HIT
}

/**
 * Resolve an increase forecast against the set the athlete just logged.
 * HIT iff actual reps met/exceeded the predicted reps. Otherwise MISS (silent).
 */
export function resolveIncrease(rec: Rec, log: SetLog): Resolution {
  const predictedReps = rec.predictedReps ?? 0;
  const hit = log.actualReps >= predictedReps && log.actualReps > 0;
  if (!hit) return { state: 'MISS', receipt: null }; // silent retire (§5.4 R14)
  return {
    state: 'HIT',
    receipt: receiptFor(rec, log),
  };
}

/**
 * Resolve a hold forecast against a later logged set. HIT iff the athlete PASSED
 * the held weight — i.e. lifted STRICTLY MORE than the held load for the target
 * reps. The comparison is strict (>) on purpose: re-lifting the same held weight
 * (or the very set that issued the hold) is not "passing it", so it must not earn
 * a receipt. A non-pass is a silent non-event — the horizonless caller leaves the
 * forecast PENDING (it has not failed; the breakthrough simply hasn't come yet).
 * If the capability's basis is lost (frame change / skip), the caller voids it
 * (§7.6) — never a miss-with-message.
 */
export function resolveHold(rec: Rec, log: SetLog): Resolution {
  const passed =
    log.actualWeight != null &&
    log.actualWeight > rec.predictedValue &&
    log.actualReps >= (rec.predictedReps ?? 1);
  if (!passed) return { state: 'MISS', receipt: null }; // silent (§7.7)
  return { state: 'HIT', receipt: receiptFor(rec, log) };
}

/** A forecast becomes unevaluable (frame change / capability skipped / override basis lost). */
export function voidForecast(): Resolution {
  return { state: 'VOID', receipt: null }; // silent (§6.4, §7.6)
}

/**
 * Resolve the Portrait's gap-closing forecast against a later snapshot.
 * HORIZONLESS (ratified 2026-06-14): there is no deadline, so there is no timed
 * miss — a forecast that hasn't closed simply stays PENDING (silent, no receipt).
 * Same asymmetry: a receipt ONLY when the gap actually closed; void if the
 * capability fell back to still-learning (basis lost). The receipt resurfaces
 * the Portrait in Compare mode (handled by the caller).
 */
export function resolvePortrait(rec: Rec, snapshot: PortraitSnapshot): Resolution {
  if (isStillLearning(snapshot, rec.capability)) {
    return { state: 'VOID', receipt: null }; // basis lost — silent (§6.4)
  }
  const closed = snapshot.perCapability[rec.capability] >= rec.predictedValue;
  if (!closed) return { state: 'PENDING', receipt: null }; // not yet — stays pending, silent
  return { state: 'HIT', receipt: { key: 'portrait.receiptClosed' } };
}

/** Receipt copy (§4.6). "Told you. [weight], clean." or "Told you. [weight] × [reps]." */
function receiptFor(rec: Rec, log: SetLog): Line {
  const weight = log.actualWeight ?? rec.predictedValue;
  // "clean" variant when reps exactly met target; reps variant otherwise.
  if (rec.predictedReps != null && log.actualReps === rec.predictedReps) {
    return { key: 'workout.receiptClean', params: { weight } };
  }
  return { key: 'workout.receiptWithReps', params: { weight, reps: log.actualReps } };
}
