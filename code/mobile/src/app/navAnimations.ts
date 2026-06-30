/**
 * Navigation animation selection under Reduced Motion (spec §8.2, §7.1).
 * Full-layer slides and sheet slide-ups both collapse to opacity fades; the
 * product remains fully expressive through copy and layout without motion.
 */
import { I18nManager } from 'react-native';

export type StackAnimation = 'slide_from_right' | 'slide_from_left' | 'slide_from_bottom' | 'fade';

/**
 * Full-layer push/pop: a forward push slides in from the leading edge — from the
 * RIGHT in LTR, the LEFT in RTL (Hebrew), so "forward" always follows the reading
 * direction. The native-stack back-swipe gesture mirrors with the animation. Fades
 * under Reduce Motion.
 */
export function fullLayerAnimation(reduced: boolean): StackAnimation {
  if (reduced) return 'fade';
  return I18nManager.isRTL ? 'slide_from_left' : 'slide_from_right';
}

/** Sheet present (slide-up) normally, fade under Reduce Motion. */
export function sheetAnimation(reduced: boolean): StackAnimation {
  return reduced ? 'fade' : 'slide_from_bottom';
}
