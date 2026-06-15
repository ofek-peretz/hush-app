/**
 * Navigation animation selection under Reduced Motion (spec §8.2, §7.1).
 * Full-layer slides and sheet slide-ups both collapse to opacity fades; the
 * product remains fully expressive through copy and layout without motion.
 */
export type StackAnimation = 'slide_from_right' | 'slide_from_bottom' | 'fade';

/** Full-layer push/pop: Slide Left normally, fade under Reduce Motion. */
export function fullLayerAnimation(reduced: boolean): StackAnimation {
  return reduced ? 'fade' : 'slide_from_right';
}

/** Sheet present (slide-up) normally, fade under Reduce Motion. */
export function sheetAnimation(reduced: boolean): StackAnimation {
  return reduced ? 'fade' : 'slide_from_bottom';
}
