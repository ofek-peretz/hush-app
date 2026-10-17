/**
 * ════ ✦ FIRST LIGHT — TWO SECONDS BEFORE THE FIRST QUESTION (design audit, 2026-09-29) ════
 *
 * *"Today a new user lands straight on the 'a little about you' form. Proposal: the logo, the figure
 * lifting, and one promise line — 'a whole week, written for you' — that dissolve by themselves
 * into the form. No button and no extra screen."*
 *
 * The very first second of the product was a form. This is the product saying what it is before it
 * asks anything: the mark, the athlete — the same drawing she will train beside, on the stage's
 * black — and one sentence in the coach's serif. Then it gets out of the way.
 *
 * ⚠️ WHAT IT IS NOT:
 *   · **Not a screen.** It is a layer over About You, which is already mounted underneath — the form
 *     is there the moment the layer lifts, and nothing is routed.
 *   · **Not a wait.** A tap anywhere lifts it at once, and it lifts by itself at ~2 s.
 *   · **Not for everyone.** Reduce Motion skips it — a figure moving and a fade are the whole of it —
 *     and it plays once per launch: going back to About You does not replay it.
 *   · **Not read aloud.** It says nothing the form does not; VoiceOver meets the form first.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { FerroxMark } from '@/components/FerroxLogo';
import { noOrphan } from '@/components/onboarding/OnboardingScaffold';
import { MotionFigure, frameOf } from '@/motion/render/MotionFigure';
import { exerciseMotion } from '@/motion/registry';
import { useCopy } from '@/i18n/useCopy';
import { useReducedMotion } from '@/platform/reducedMotion';
import { font, motion, stage } from '@/design/tokens';

/** Held on screen before it lifts — with the fade in and out, the whole beat is ~2.1 s. */
const HOLD_MS = 1400;
/** Once per launch: About You remounts on a back-navigation, and a second showing is a wait. */
let shownThisLaunch = false;

export function FirstLight() {
  const { t } = useCopy();
  const reduced = useReducedMotion();
  const [on, setOn] = useState(() => !shownThisLaunch);
  /* TWO VALUES, ON PURPOSE. The black is whole from the first frame (`whole` starts at 1) so the form
     underneath is never glimpsed before the product has spoken; only the mark, the athlete and the
     line fade IN (`content`). At the end the whole layer fades OUT together, into the form. */
  const whole = useRef(new Animated.Value(1)).current;
  const content = useRef(new Animated.Value(0)).current;
  const lifting = useRef(false);
  const rig = exerciseMotion('bb_back_squat');

  const lift = () => {
    if (lifting.current) return;
    lifting.current = true;
    Animated.timing(whole, {
      toValue: 0,
      duration: motion.dur[4],
      easing: Easing.bezier(...motion.easeStandard),
      useNativeDriver: true,
    }).start(() => setOn(false));
  };

  useEffect(() => {
    if (!on) return;
    shownThisLaunch = true;
    if (reduced) {
      setOn(false);
      return;
    }
    Animated.timing(content, {
      toValue: 1,
      duration: motion.dur[4],
      easing: Easing.bezier(...motion.easeStandard),
      useNativeDriver: true,
    }).start();
    const t0 = setTimeout(lift, motion.dur[4] + HOLD_MS);
    return () => clearTimeout(t0);
    // `lift` reads refs only; the beat is scheduled once, on the first showing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, reduced]);

  if (!on || reduced) return null;
  const box = rig ? frameOf(rig, true) : null;
  return (
    <Animated.View
      style={[styles.root, { opacity: whole }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Pressable style={styles.fill} onPress={lift}>
        <Animated.View style={[styles.fill, { opacity: content }]}>
        <View style={styles.mark}>
          <FerroxMark width={64} />
        </View>
        {rig && box ? (
          <View style={[styles.figure, { aspectRatio: box.w / box.h }]}>
            <MotionFigure rig={rig} tone="stage" fit style={styles.fillFigure} />
          </View>
        ) : null}
        {/* A line that wraps never leaves its last word alone — `noOrphan`, the intake's own rule. */}
        <Text style={styles.promise}>{noOrphan(t('ob.firstLight'))}</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: stage[0], zIndex: 50 },
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  mark: { marginBottom: 28 },
  figure: { width: '100%', maxWidth: 340 },
  fillFigure: { width: '100%', height: '100%' },
  promise: {
    marginTop: 26,
    fontFamily: font.serif,
    fontSize: 28,
    lineHeight: 36,
    color: stage.ink0,
    textAlign: 'center',
  },
});
