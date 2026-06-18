/**
 * Haptics (Living Dark direction, founder 2026-06-16). Haptics are part of the
 * app feeling alive — each is a single, intentional impact (never a pattern,
 * never layered on system wheel pickers):
 *
 *  - Light Impact on timer 00:00.
 *  - Success Haptic on Well Done.
 *  - Medium Impact on the Home Start press (the one moment of anticipation).
 */
import * as Haptics from 'expo-haptics';

/** Fired the instant an Inter-Set / Transition rest timer reaches 00:00. */
export function timerComplete(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

/** Fired once on the Well Done screen. */
export function wellDone(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

/** Fired on the Home Start press — the moment of anticipation before a workout. */
export function startWorkout(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}
