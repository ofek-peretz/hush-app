/**
 * Exercise Demo (spec §4.15) — silent form guide bottom-sheet. A grayscale
 * silhouette frame with a pulsing "Form guide" dot, then "FOCUS ON" + the three
 * technique cues, then Done. Pure reference; no logging. (Hush ships a clean
 * vector silhouette rather than video; the spec permits this fallback.)
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Rect, Defs, RadialGradient, Stop } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { BottomSheet } from '@/components/BottomSheet';
import { Eyebrow } from '@/components/Eyebrow';
import { TextAction } from '@/components/TextAction';
import { useReducedMotion } from '@/platform/reducedMotion';
import { color, heroTitle, s } from '@/design/tokens';

interface Props {
  title: string;
  cues: string[];
  focusLabel: string;
  formGuideLabel: string;
  doneLabel: string;
  onDone: () => void;
}

export function ExerciseDemo({ title, cues, focusLabel, formGuideLabel, doneLabel, onDone }: Props) {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0.4);
  useEffect(() => {
    if (reduced) return;
    pulse.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => {
      pulse.value = 0.4;
    };
  }, [reduced, pulse]);
  const dotStyle = useAnimatedStyle(() => ({ opacity: reduced ? 0.7 : pulse.value }));

  return (
    <BottomSheet onClose={onDone} background={color.surface} heightFraction={0.66}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.frame}>
        <Svg width="100%" height="100%" viewBox="0 0 160 100">
          <Defs>
            <RadialGradient id="demoBg" cx="50%" cy="20%" r="120%">
              <Stop offset="0" stopColor="#202022" />
              <Stop offset="0.55" stopColor="#161618" />
              <Stop offset="1" stopColor="#0C0C0D" />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="160" height="100" rx="14" fill="url(#demoBg)" />
          {/* Generic grayscale figure silhouette (clean vector, exercise-agnostic). */}
          <Circle cx="80" cy="34" r="9" fill="#3A3A3C" />
          <Path d="M80 44 C72 44 68 52 68 62 L68 78 L74 78 L75 64 L85 64 L86 78 L92 78 L92 62 C92 52 88 44 80 44 Z" fill="#3A3A3C" />
        </Svg>
        <View style={styles.guideRow}>
          <Animated.View style={[styles.dot, dotStyle]} />
          <Text style={styles.guideLabel}>{formGuideLabel}</Text>
        </View>
      </View>
      <Eyebrow label={focusLabel} size={11} trackingPx={1.5} style={styles.focus} />
      {cues.map((c, i) => (
        <Text key={i} style={styles.cue}>{c}</Text>
      ))}
      <View style={styles.doneRow}>
        <TextAction label={doneLabel} tone="primary" onPress={onDone} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { ...heroTitle(s(21)), color: color.textPrimary, fontSize: s(21), fontWeight: '600', textAlign: 'center', marginBottom: 16 },
  frame: {
    aspectRatio: 16 / 10,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: '#262628',
    overflow: 'hidden',
    marginBottom: 18,
  },
  guideRow: { position: 'absolute', left: 12, bottom: 10, flexDirection: 'row', alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#9A9AA0', marginRight: 6 },
  guideLabel: { fontSize: 10, letterSpacing: 0.3, color: '#8A8A90' },
  focus: { marginBottom: 10 },
  cue: { fontSize: s(14), lineHeight: s(14) * 1.95, color: color.textPrimary },
  doneRow: { marginTop: 12, alignItems: 'center' },
});
