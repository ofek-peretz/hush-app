/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE DAY, PERFORMED — the athlete becomes the face of the product (founder, 2026-08-30)
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 *   > *"אני מרגיש שכל כך חבל שהשקענו בדמות שלנו והיא לא הפנים של המוצר. למשל במסך הHome במקום
 *   > להציג את התרגילים כסטטיים כמו עכשיו אפשר להציג אנימציה מלאה של כל תרגילי האימון של אותו
 *   > היום."*
 *
 * He is right, and the audit is blunt: 136 shipping rigs, depth, per-joint timing, two anatomies, a
 * 55-degree readability law and a per-exercise clip pass — and on the first screen of the app the
 * day was a list of words. The most expensive thing we have built was the least visible.
 *
 * ── ⛔ ONE CLOCK, NOT SIX (and this is the whole design) ─────────────────────────────────────────
 *
 * The obvious build is a row of small looping figures, one per lift. It is the wrong one twice:
 *
 *   · **Cost.** Every `MotionFigure` owns a `requestAnimationFrame` loop that calls `setState` on
 *     every frame. Six of them on the app's home screen is six render loops running for as long as
 *     she looks at it — on a screen she opens many times a day, on a phone she is about to train
 *     with. `MotionThumb` exists precisely because *"a list of forty looping figures would be forty
 *     rAF clocks; a list of forty stills is just SVG"*, and the same arithmetic applies at six.
 *   · **Meaning.** A grid of small loops reads as a CATALOGUE. One figure that the day passes
 *     through reads as *"this is your day"* — the same difference as a contact sheet versus a film.
 *
 * So: one figure, one clock, and the day walks through it — each lift held long enough to be
 * recognised, then the next. The rows keep their still `MotionThumb`s for identification, which is
 * the job a still is genuinely better at.
 *
 * ── ⚠️ REDUCE MOTION TAKES THE WHOLE THING, NOT HALF OF IT ───────────────────────────────────────
 *
 * `MotionFigure` freezes its own rom under Reduce Motion, so the figure would stop moving — and
 * this component would go on CUTTING between lifts every few seconds, which is a harder motion to
 * tolerate than the loop it replaced. Under Reduce Motion the cycling stops too and the first lift
 * stands still: one honest, legible pose. §8.2 — *"no Hush moment depends on motion to be
 * understood"*, and this one does not: the rows underneath say the same day in words.
 *
 * ── AND IT DRAWS NOTHING RATHER THAN A GAP ──────────────────────────────────────────────────────
 *
 * `exerciseMotion` returns null for anything with no rig — a run, a movement, a lift whose clip has
 * not been built. Those are filtered out entirely; if none of the day's steps has a rig the hero
 * does not exist, and the card is exactly what it was before. An empty frame where a body should be
 * is worse than no frame.
 */

//

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { MotionFigure } from '@/motion/render/MotionFigure';
import { MotionThumb } from '@/motion/render/MotionThumb';
import { exerciseMotion } from '@/motion/registry';
import type { FigureSex } from '@/motion/types';
import { useReducedMotion } from '@/platform/reducedMotion';

/**
 * How long each lift holds the stage.
 *
 * Long enough to read as a demonstration rather than a flicker — most rigs loop in about two
 * seconds, so this is roughly two full reps of the movement before the day moves on. Short enough
 * that a five-lift day comes round inside half a minute, which is about as long as anyone looks at
 * a home screen before pressing Begin.
 */
const HOLD_MS = 4200;

/**
 * ⛔ TWENTY-FOUR, NOT SIXTY (measured in Chrome, 2026-08-31).
 *
 * Every drawn frame rebuilds the whole rig (`buildFrame`) and re-renders every primitive in it.
 * Uncapped, that ran sixty times a second for as long as Today was on screen — on the app's
 * most-opened page, for decoration, on a phone the athlete is about to train with. It showed:
 * Today repeatedly timed out Chrome's own screenshot ("the renderer may be frozen or
 * unresponsive") while the set screen, which draws no figure, answered instantly.
 *
 * ⚠️ THE FORM DOOR IS NOT CAPPED, and must not be. There the clip IS the screen — she opened it to
 * study a movement — and `MotionFigure`'s default is unchanged for it and for every other caller.
 * Here the figure is the product's face, not its lesson, and a rig that loops in two seconds
 * through slowly-changing poses reads identically at cinema's rate.
 */
const HERO_FPS = 24;

/** The still's square edge when the clock is stopped — the card's own height, so the body does not
 *  jump size as she leaves the tab and comes back. */
const HERO_STILL = 132;

interface Props {
  /** The day's steps, in order. Anything without a rig is dropped (see the header). */
  exerciseIds: readonly string[];
  /** Her own athlete — the same `figure` switch every other motion surface takes. */
  figure?: FigureSex;
  /**
   * ⛔ STOP WHEN NOBODY IS LOOKING (2026-08-31).
   *
   * Today lives in a TAB navigator, so it stays MOUNTED when she walks to Progress or Cardio — and
   * a `requestAnimationFrame` clock does not care that its screen is behind another one. Left to
   * itself this would rebuild a rig forever, in the background, on a phone she is training with.
   * `Home` already asks `useIsFocused` for its own reasons; this is that answer, passed down.
   *
   * Absent = running, which is what the harness wants: the gallery mounts this page outside any
   * navigator and there is nothing to be focused by.
   */
  paused?: boolean;
  style?: ViewStyle;
}

export function DayInMotion({ exerciseIds, figure, paused, style }: Props) {
  const reduced = useReducedMotion();
  /* De-duplicated: a day that trains a lift in two blocks is one lift to look at, and holding the
     same body twice in one cycle reads as a stall rather than as a second exercise. */
  const rigged = React.useMemo(
    () => [...new Set(exerciseIds)].filter((id) => !!exerciseMotion(id)),
    [exerciseIds],
  );
  const [i, setI] = useState(0);

  useEffect(() => {
    setI(0); // a new day starts at its first lift, never mid-cycle
  }, [rigged.length]);

  useEffect(() => {
    if (paused || reduced || rigged.length < 2) return; // off-screen, or motion is not wanted
    const t = setInterval(() => setI((n) => (n + 1) % rigged.length), HOLD_MS);
    return () => clearInterval(t);
  }, [paused, reduced, rigged.length]);

  const id = rigged[Math.min(i, rigged.length - 1)];
  const rig = id ? exerciseMotion(id) : null;
  if (!rig) return null;
  /* Off-screen: draw the pose, stop the clock. `MotionThumb` is the same geometry pipeline frozen
     at mid-rep, so the card keeps a body in it — Today is not empty behind another tab, it is
     simply still — and nothing is running. */
  if (paused) {
    return (
      <View style={style} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <MotionThumb exerciseId={id} size={HERO_STILL} figure={figure} />
      </View>
    );
  }
  return (
    <View style={style} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {/*
        ⛔ KEYED ON THE LIFT, so React REMOUNTS the figure rather than re-rendering it with a
        different rig. `MotionFigure`'s rAF clock anchors its start instant in a ref at mount and its
        effect re-runs on rig identity — reusing the instance across a switch would drop the new
        movement in at whatever phase the old one had reached, so a squat would begin at the top of
        a press. A remount starts every movement at its own beginning, which is the only frame worth
        arriving on.

        ⚠️ AND IT IS DECORATION: the whole hero is hidden from VoiceOver. The day is READ from the
        rows beneath it — names and loads, in her language — and a screen reader announcing an
        unlabelled looping illustration between the session name and its lifts would be noise
        standing between her and the act.
      */}
      {/*
        ⛔ IT IS GIVEN A BOX, OR IT DRAWS NOTHING. `MotionFigure` renders its `<Svg>` at
        `width="100%" height="100%"` inside whatever `style` it is handed — hand it none and the
        inner View collapses to zero height and the figure is invisible while every test still
        passes. `FormMedia` fills it with `StyleSheet.absoluteFill` for the same reason; here the
        parent owns the height, so the figure fills the parent.

        The 16:10 frame letter-boxes inside that box (`VIEWBOX`, and the Svg's default
        `preserveAspectRatio`), so a wide phone and a narrow one both get the whole body.
      */}
      <MotionFigure key={id} rig={rig} figure={figure} style={styles.fill} fps={HERO_FPS} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
});
