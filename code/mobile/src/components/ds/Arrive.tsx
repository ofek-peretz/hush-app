/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * ARRIVE — a thing enters, in its turn.
 *
 * ⛔ FOUNDER, 2026-08-12: *"האם המוצר שלנו APPLE? אם לא, בוא נדאג שהוא יתחיל להיות ולהרגיש כך."*
 *
 * The honest answer was: the VOCABULARY is already that good and the CHOREOGRAPHY does not exist.
 * `tokens.motion` declares one settle curve and forbids overshoot; the type scale, the paper/ink
 * palette and the reduced-motion contract are all in place. What no screen had was TIME — every
 * element was simply present on the first frame, so a screen appeared rather than arriving.
 *
 * That is the single largest difference between this and the apps he is naming. Apple's own
 * onboarding surfaces are not more colourful or more animated; they are SEQUENCED. Elements land in
 * reading order, tens of milliseconds apart, on one curve, and the eye is walked down the screen
 * instead of being handed all of it at once.
 *
 * ── THE RULES, AND WHY THEY ARE TOKENS RATHER THAN ARGUMENTS ────────────────────────────────────
 * A stagger written by hand on each screen becomes six different rhythms within a month. So:
 *
 *   · ONE curve — `motion.easeStandard`, the settle the whole product already moves on.
 *   · ONE step  — `ARRIVE_STAGGER`. Order is an INDEX, not a millisecond count, so no screen can
 *                 invent its own tempo and two screens cannot disagree about what "next" means.
 *   · ONE rise  — 10px. Enough that the eye reads it as arriving from below; small enough that it
 *                 never looks like a slide transition competing with the navigator's own.
 *
 * ⚠️ AND IT IS FAST. 360ms a piece at a 70ms step: the last of six elements is home in under 700ms,
 * which is the difference between a screen that feels composed and one that feels slow. Ceremony
 * that costs the athlete time is not ceremony, it is a wait.
 *
 * ⚠️ REDUCED MOTION IS NOT A SHORTER ANIMATION — IT IS NONE. The content is present, at rest, on
 * the first frame. An athlete who has asked the OS to stop moving things has asked once, for
 * everything, and a "gentler" version of the thing they turned off is not an accommodation.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, type ViewProps, type ViewStyle, type StyleProp } from 'react-native';

import { motion } from '@/design/tokens';
import { useReducedMotion } from '@/platform/reducedMotion';

/** The beat between one element landing and the next beginning. */
export const ARRIVE_STAGGER = 70;

/** How far below its resting place a thing begins. */
const RISE = 10;

export interface ArriveProps {
  /**
   * Its place in the sequence, counted from zero in READING ORDER.
   *
   * ⚠️ An index rather than a delay, deliberately: a screen states what comes after what, and the
   * tempo stays the product's. Re-ordering a screen then means re-numbering it, not re-timing it.
   */
  order?: number;
  /** Held before the sequence starts — for a screen that must settle before anything moves. */
  after?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/**
 * ⛔ AN ARRIVAL MAY NOT COST A SCREEN ITS ACCESSIBILITY (2026-08-27).
 *
 * `Arrive` wraps the element it animates, so a block that carried `accessible` +
 * `accessibilityLabel` — the finish poster's hero reads as ONE node to VoiceOver, deliberately —
 * would have had to grow a second `View` inside the wrapper just to keep them. Two views, one for
 * the motion and one for the meaning, on every block that has both.
 *
 * The wrapper carries them instead. Choreography is a presentation concern; it does not get to
 * change what the screen announces.
 */
type ArriveA11y = Pick<
  ViewProps,
  'accessible' | 'accessibilityLabel' | 'accessibilityRole' | 'accessibilityState' | 'accessibilityHint'
>;

export function Arrive({ order = 0, after = 0, style, children, ...a11y }: ArriveProps & ArriveA11y) {
  const reduced = useReducedMotion();
  const t = useRef(new Animated.Value(reduced ? 1 : 0)).current;

  useEffect(() => {
    if (reduced) {
      t.setValue(1);
      return;
    }
    const anim = Animated.timing(t, {
      toValue: 1,
      duration: motion.dur[4],
      delay: after + order * ARRIVE_STAGGER,
      easing: Easing.bezier(...motion.easeStandard),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [t, order, after, reduced]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: t,
          transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [RISE, 0] }) }],
        },
      ]}
      {...a11y}
    >
      {children}
    </Animated.View>
  );
}
