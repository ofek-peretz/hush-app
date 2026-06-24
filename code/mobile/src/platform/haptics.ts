/**
 * Haptics — a single, intentional impact (never a pattern, never layered on
 * system wheel pickers). Only the Well Done success haptic is wired today; the
 * full rest-timer haptics experience is a planned, dedicated UX feature.
 */
import * as Haptics from 'expo-haptics';

/** Fired once on the Well Done screen. */
export function wellDone(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}
