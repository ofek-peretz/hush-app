/**
 * Cardio record admission (founder 2026-07-10): an activity that was never actually
 * performed must not become a History record — parity with the strength rule that a
 * session with zero completed sets is "NOT STARTED" and is never saved (UX item 3A).
 *
 * "Performed" = at least a minute on the clock OR real GPS distance. Anything below
 * both floors is a false start (opened the screen, finished immediately) and is
 * discarded, never recorded.
 *
 * Pure + I/O-free so it is unit-testable and shared by the recorder (write gate)
 * and History (display gate for records persisted before this rule existed).
 */
// @ts-nocheck

// 


export const CARDIO_MIN_DURATION_S = 60;
export const CARDIO_MIN_DISTANCE_KM = 0.05;

export function cardioPerformed(durationSec: number, distanceKm: number): boolean {
  return durationSec >= CARDIO_MIN_DURATION_S || distanceKm >= CARDIO_MIN_DISTANCE_KM;
}
