/**
 * FormMedia — the in-app form guide's media frame, 1:1 from the Claude Design
 * `FormMedia` (ui_kits/app/v4.jsx). One coherent affordance whether it reveals a
 * looping demo video or the vector silhouette fallback: a single striped
 * "instructional media" field with a corner state chip. Today most lifts show
 * the silhouette; the video path lights up exercise-by-exercise as content is
 * supplied (see platform/media/exerciseVideo). Muted loop, no controls.
 */

// 

import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Icon } from '@/components/Icon';
import { ExerciseVideoPlayer } from '@/components/ExerciseVideoPlayer';
import { exerciseVideoSource } from '@/platform/media/exerciseVideo';
import { exerciseMotion } from '@/motion/registry';
import { FRONT_VIEWS } from '@/motion/library/frontViews';
import { MotionFigure } from '@/motion/render/MotionFigure';
import { STAGE_FRAME_ASPECT } from '@/motion/frame';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { color, stage, radius, up, font, tracking, trackingPx } from '@/design/tokens';
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
  /* ✦ HALF SPEED, ON ASK (design audit 2026-09-29: "slow motion is what turns a figure into a real
     lesson"). One toggle on the clip itself — the bar path and the lockout are what she opened
     this card to study, and at the authored tempo a rep is gone in two seconds. */
  const [slow, setSlow] = useState(false);
  /* ✦ THE SECOND CAMERA (2026-09-30, `motion/library/frontViews`). The side shows the PATH; the front
     shows the stance, the knees over the toes and the grip. Offered only where a face-on view has been
     authored and proven to be the same rep — so the switch continues the rep rather than restarting it. */
  const front = exerciseId ? FRONT_VIEWS[exerciseId] : undefined;
  const [view, setView] = useState<'side' | 'front'>('side');
  const rig = view === 'front' && front ? front : motion;

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
    <View style={styles.frame}>
      <View style={[styles.clip, motion ? { aspectRatio: STAGE_FRAME_ASPECT } : null]}>
        {/* ── the demonstration ── */}
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
        /* ⛔ THE STAGE'S ATHLETE, NOT A SILHOUETTE ON PAPER (design audit 2026-09-29). This well was
           cream with the figure in ink — the one place in the product she was drawn dark on light, a
           third style beside Today's and the stage's. The form door is where she studies the SAME
           athlete she trains beside, so it is the same drawing on the same black. */
        <MotionFigure rig={rig!} figure={figure} fit fps={FORM_DOOR_FPS} tone="stage" speed={slow ? 0.5 : 1} style={StyleSheet.absoluteFill as object} />
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

      {/*
        ⛔ THE CONTROLS SIT UNDER THE CLIP, NEVER ON IT (2026-09-30). On the drawing they covered the
        very things they help her study — a plate at the end of the bar, the hands at an overhead
        lockout. A strip of the same black under the clip keeps the whole demonstration clear: the
        camera on the start side, the pace on the end side.
      */}
      {motion ? (
        <View style={styles.controls}>
          {/* The camera, where a second one exists; an empty start otherwise, so the pace keeps its end. */}
          {front ? (
            <View style={styles.views} accessibilityRole="radiogroup" accessibilityLabel={t('workout.viewA11y')}>
              {(['side', 'front'] as const).map((v) => (
                <Pressable
                  key={v}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: view === v }}
                  accessibilityLabel={t(v === 'side' ? 'workout.viewSide' : 'workout.viewFront')}
                  onPress={() => setView(v)}
                  hitSlop={{ top: 8, bottom: 8 }}
                  style={[styles.viewCell, view === v && styles.viewCellOn]}
                >
                  <Text style={[styles.viewText, view === v && styles.viewTextOn]}>{t(v === 'side' ? 'workout.viewSide' : 'workout.viewFront')}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <View />
          )}
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: slow }}
            accessibilityLabel={t('workout.slowMotionA11y')}
            onPress={() => setSlow((s) => !s)}
            hitSlop={8}
            style={({ pressed }) => [styles.slow, slow && styles.slowOn, pressed && styles.slowPressed]}
          >
            <Icon name="history" size={15} color={slow ? color.onAccent : color.textSecondary} strokeWidth={2} />
            <Text style={[styles.slowText, slow && styles.slowTextOn]}>{t('workout.slowMotion')}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: stage[0],
  },
  /* The demonstration's own box — 16:10 for a video, the stage frame's aspect for a figure. */
  clip: { aspectRatio: 16 / 10 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
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
  /* The slow toggle — the chip's twin at the other corner, and a real 36-point control (8 of slop
     makes it 52). On: the app's one "on" dress, cream with ink. */
  slow: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  slowOn: { backgroundColor: color.accentFill, borderColor: color.accentFill },
  /* The camera switch — the bottom corner, the slow toggle's dress, one cell lit. */
  views: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: radius.full,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  viewCell: { height: 32, minWidth: 64, paddingHorizontal: 12, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  viewCellOn: { backgroundColor: color.accentFill },
  viewText: { fontFamily: font.sansMedium, fontSize: 17, color: color.textSecondary, textAlign: 'center' },
  viewTextOn: { color: color.onAccent },
  slowPressed: { backgroundColor: color.surface2 },
  slowText: { fontFamily: font.sansMedium, fontSize: 17, color: color.textSecondary, textAlign: 'left' },
  slowTextOn: { color: color.onAccent },
  /* The clip's own eyebrow.
     ⚠️ THE TRACKING IS SUPPLIED AT THE CALL SITE, from `legendVoice`. It is an answer about the
     STRING — Latin keeps the instrument's open track, Hebrew never gets it — and a StyleSheet
     cannot see a string. `noTrackedHebrew` holds every slot in this class. */
  chipText: { fontFamily: font.sansMedium, fontSize: 17, color: color.textMuted, textTransform: 'uppercase', textAlign: 'left' },
});
