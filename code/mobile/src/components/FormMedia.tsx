/**
 * FormMedia — the in-app form guide's media frame, 1:1 from the Claude Design
 * `FormMedia` (ui_kits/app/v4.jsx). One coherent affordance whether it reveals a
 * looping demo video or the vector silhouette fallback: a single striped
 * "instructional media" field with a corner state chip. Today most lifts show
 * the silhouette; the video path lights up exercise-by-exercise as content is
 * supplied (see platform/media/exerciseVideo). Muted loop, no controls.
 */

// 

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Icon } from '@/components/Icon';
import { ExerciseVideoPlayer } from '@/components/ExerciseVideoPlayer';
import { exerciseVideoSource } from '@/platform/media/exerciseVideo';
import { exerciseMotion } from '@/motion/registry';
import { MotionFigure } from '@/motion/render/MotionFigure';
import { STAGE_FRAME_ASPECT } from '@/motion/frame';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { color, paper, radius, up, font, tracking, trackingPx } from '@/design/tokens';
import { legendVoice } from '@/design/monoVoice';

/**
 * 30, not uncapped: a rig loops in ~2 s through poses that change slowly, and the SVG
 * reconciliation of 45–95 nodes at 60 Hz was the one measurable cost of the form door
 * (execution pass, 2026-09-07). The eye reads the movement, not the frame rate.
 */
const FORM_DOOR_FPS = 30;

interface Props {
  exerciseId?: string | null;
  title?: string;
}

export function FormMedia({ exerciseId, title }: Props) {
  const { t } = useCopy();
  const app = useApp();
  // she demonstrates for her — the same rule MiniBody already follows on Home
  const figure = app.profile?.sex === 'female' ? ('female' as const) : ('male' as const);
  const motion = exerciseMotion(exerciseId);
  const video = exerciseVideoSource(exerciseId);
  const hasVideo = !!video;
  const looping = !!motion || hasVideo; // both read as a live, muted, looping demonstration

  /*
   * ════ THE FORM DOOR GETS THE STAGE'S FRAME (audit, 2026-09-03) ════
   *
   * The shared 16:10 crop reserves the top of the frame for the rigs that stand up, so a lying
   * press or a push-up filled 19 % of it — a thin band with a 73-point athlete on a 338-point
   * stage. `stageFrame` is the answer the set stage already uses: a fixed 264×202 box slid over
   * each rig's own content, ONE scale for the whole catalogue, so the athlete never changes size
   * between exercises and the letter-box goes to the drawing instead. The aspect must follow the
   * box, or the letter-boxing comes straight back; the video seam keeps its own 16:10.
   */
  return (
    <View style={[styles.frame, motion ? { aspectRatio: STAGE_FRAME_ASPECT } : null]}>
      {/*
        ════════════════════════════════════════════════════════════════════════════════════════
        ⛔ THE DIAGONAL STRIPES ARE DELETED (2026-08-27).

        This field carried a 45° hatch — `<Pattern patternTransform="rotate(45)">`, `paper[3]` over
        `paper[2]` — behind the demonstration. It came 1:1 from the design handoff, and on glass it
        does the one thing a texture must never do here:

        **A diagonal hatch is the universal mark for "nothing here yet."** It is what every tool in
        the world draws for a missing asset, a disabled region, an unfinished build. We were drawing
        it as the GROUND of the screen that teaches her how to lift correctly — so the surface said
        "unfinished" underneath a figure that was finished.

        And it cost twice: the demo is a dark line figure with grey equipment, and a busy ground is
        contrast taken away from the only thing on the panel anyone needs to read.

        ⚠️ THE SAME RULING WAS ALREADY MADE ONCE, on the neighbouring screen — founder 2026-08-12,
        of the bar's checked texture: *"תוריד את המשבצות האלה כי זה לא ברור בכלל."* This is that
        texture's twin, one screen away, and it survived because nobody had photographed it.

        The field is flat paper now (`frame` already sets `paper[2]`), which is what every other
        paper surface in this product is.
      */}

      {motion ? (
        <MotionFigure rig={motion} figure={figure} fit fps={FORM_DOOR_FPS} style={StyleSheet.absoluteFill as object} />
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
        {(() => {
          const l = (looping ? t('workout.looping') : t('workout.illustration')).toUpperCase();
          return <Text style={[styles.chipText, { letterSpacing: legendVoice(l, 17, tracking.legend).letterSpacing }]}>{l}</Text>;
        })()}
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
  /* The clip's own eyebrow.
     ⚠️ THE TRACKING IS SUPPLIED AT THE CALL SITE, from `legendVoice`. It is an answer about the
     STRING — Latin keeps the instrument's open track, Hebrew never gets it — and a StyleSheet
     cannot see a string. `noTrackedHebrew` holds every slot in this class. */
  chipText: { fontFamily: font.sansMedium, fontSize: 17, color: color.textMuted, textTransform: 'uppercase', textAlign: 'left' },
});
