/**
 * Haptics — spec §8.3 (final, EXHAUSTIVE). These are the ONLY two haptics in Hush.
 *
 *  - Light Impact (single) on timer 00:00.
 *  - Success Haptic (single, no pattern) on Well Done.
 *
 * Nothing else triggers haptics. No haptics layered on system wheel pickers.
 * Adding any other haptic is a defect.
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
