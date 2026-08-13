/**
 * FormMedia — the in-app form guide's media frame, 1:1 from the Claude Design
 * `FormMedia` (ui_kits/app/v4.jsx). One coherent affordance whether it reveals a
 * looping demo video or the vector silhouette fallback: a single striped
 * "instructional media" field with a corner state chip. Today most lifts show
 * the silhouette; the video path lights up exercise-by-exercise as content is
 * supplied (see platform/media/exerciseVideo). Muted loop, no controls.
 */
// @ts-nocheck

// 

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Circle, Path, Defs, Pattern } from 'react-native-svg';
import { Icon } from '@/components/Icon';
import { ExerciseVideoPlayer } from '@/components/ExerciseVideoPlayer';
import { exerciseVideoSource } from '@/platform/media/exerciseVideo';
import { exerciseMotion } from '@/motion/registry';
import { MotionFigure } from '@/motion/render/MotionFigure';
import { useCopy } from '@/i18n/useCopy';
import { color, paper, radius, up, font, tracking, trackingPx } from '@/design/tokens';

interface Props {
  exerciseId?: string | null;
  title?: string;
}

export function FormMedia({ exerciseId, title }: Props) {
  const { t } = useCopy();
  const motion = exerciseMotion(exerciseId);
  const video = exerciseVideoSource(exerciseId);
  const hasVideo = !!video;
  const looping = !!motion || hasVideo; // both read as a live, muted, looping demonstration

  return (
    <View style={styles.frame}>
      {/* striped instructional field. absoluteFill goes on the WRAPPER and percentages inside it
          (the `components/ds/Stage` pattern) — putting both on the <Svg> gives it two ways to be
          sized, and they disagree on the first native frame before layout settles. See the
          first-four card in SessionFlow, where that is exactly what the founder photographed. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="formStripes" width={22} height={22} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <Rect width={11} height={22} fill={paper[3]} />
            <Rect x={11} width={11} height={22} fill={paper[2]} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#formStripes)" />
      </Svg>
      </View>

      {motion ? (
        <MotionFigure rig={motion} style={StyleSheet.absoluteFill as object} />
      ) : video ? (
        <ExerciseVideoPlayer source={video} accessibilityLabel={title ?? ''} style={StyleSheet.absoluteFill as object} />
      ) : (
        <View style={styles.center}>
          <Svg width={46} height={46} viewBox="0 0 24 24" fill="none" stroke={color.textMuted} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <Circle cx={12} cy={5} r={2.4} />
            <Path d="M12 7.6v6" />
            <Path d="M7 9.5 12 11l5-1.5" />
            <Path d="M12 13.6 8.5 20" />
            <Path d="M12 13.6 15.5 20" />
          </Svg>
        </View>
      )}
      {hasVideo ? (
        <View style={styles.center} pointerEvents="none">
          <Icon name="play" size={28} color={color.textSecondary} noMirror />
        </View>
      ) : null}

      {/* shared corner state chip — what makes presence + absence read as one component */}
      <View style={styles.chip}>
        <View style={[styles.chipDot, { backgroundColor: looping ? up[0] : color.textTertiary }]} />
        <Text style={styles.chipText}>{(looping ? t('workout.looping') : t('workout.illustration')).toUpperCase()}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    aspectRatio: 16 / 10,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: paper[2],
  },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  chip: {
    position: 'absolute',
    top: 10,
    start: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: radius.full,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  chipText: { fontFamily: font.sansMedium, fontSize: 17, letterSpacing: trackingPx(9.5, tracking.legend), color: color.textMuted, textTransform: 'uppercase', textAlign: 'left' },
});
