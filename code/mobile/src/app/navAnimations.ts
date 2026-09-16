/**
 * FOUNDER RULING 2026-07-12 — CLOSED: the platform's own transitions, nothing more. No
 * shared-element choreography (the ochre button expanding into the black stage, the last set
 * card sliding into Top Set). A FAKED shared element — a cross-fade wearing the costume — reads
 * as a cheap bug, and a real one at 60fps is a large infrastructure project in React Native.
 * Speed and reliability beat theatre. Use Push / Modal and be fast.
 *
 * Navigation animation selection under Reduced Motion (spec §8.2, §7.1).
 * Full-layer slides and sheet slide-ups both collapse to opacity fades; the
 * product remains fully expressive through copy and layout without motion.
 */

// 

export type StackAnimation = 'default' | 'slide_from_right' | 'slide_from_left' | 'slide_from_bottom' | 'fade';

/**
 * Full-layer push/pop: the PLATFORM'S OWN push, which is this file's own ruling at the top.
 *
 * ⛔ IT WAS AN `I18nManager`-CONDITIONAL PHYSICAL VALUE, AND THIS APP HAS BEEN BURNED BY THAT EXACT
 * SHAPE BEFORE (founder, 2026-09-16: *"אין תקיעות או קפיצות מוזרות"*).
 *
 * It read `isRTL ? 'slide_from_left' : 'slide_from_right'` — a physical direction, chosen by us, per
 * direction. `i18n/bidi` records what happened the last time this codebase did that with `textAlign`:
 * *"an I18nManager-conditional value DOUBLE-flips and lands on the wrong edge"*, because the platform
 * mirrors an explicit physical value itself under RTL. A transition mirrored twice arrives from the
 * side a POP arrives from, so a push reads as a step backwards — and, worse, the back-swipe gesture
 * keeps the platform's own direction, so the gesture and the animation travel opposite ways. That is
 * what a "strange jump" between screens is made of.
 *
 * `'default'` hands the whole question back to the OS: UIKit's push (which mirrors correctly in an
 * RTL app, gesture included) and Android's own. It is also literally what the ruling at the top of
 * this file asks for — *"Use Push / Modal and be fast"* — and it cannot disagree with the gesture,
 * because it IS the gesture's animation.
 *
 * ⚠️ REDUCE MOTION STILL FADES. That is not a direction, it is an absence of one.
 */
export function fullLayerAnimation(reduced: boolean): StackAnimation {
  return reduced ? 'fade' : 'default';
}

/** Sheet present (slide-up) normally, fade under Reduce Motion. */
export function sheetAnimation(reduced: boolean): StackAnimation {
  return reduced ? 'fade' : 'slide_from_bottom';
}
