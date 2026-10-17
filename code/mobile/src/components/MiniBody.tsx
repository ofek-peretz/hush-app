/**
 * A body as a MIRROR — the figure at any size, drawing only.
 *
 * ⛔ WHY THIS EXISTS AND `BodyMapFigure` COULD NOT BE SHRUNK (Home's living half, 2026-08-23).
 * The editor figure carries a press target per limb, so it holds a FLOOR under its own width —
 * a thumb is 44 pt and a target smaller than that is a control she misses. That floor is the law
 * for an editor and exactly wrong for a mirror: Home wants her week ON her body at postcard size,
 * and a mirror has nothing to press. Same paths, same silhouette, same sexed shape function —
 * imported from the one source, never copied — with the controls simply absent.
 *
 * `lit` muscles wear the choice green (the emphasis skin's own pair); the rest sit as barely-there
 * cream, so the read is "what worked" and not a second body-map editor.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ✦ AND IT CAN BLOOM (2026-08-27) — the finish screen's one moment.
 *
 * The mirror was drawn already-lit, everywhere, always. On the wall of a card that is right: it is
 * a reference, and a reference does not perform. On the FINISH poster it was the whole miss. That
 * screen is the emotional peak of the product — she has just put a workout down — and it opened
 * with a filename and a number, static, like a receipt printing.
 *
 * `bloom` makes the lit muscles arrive one after another, in the order the body reads, over
 * `motion.dur.bloom`. She watches her own body light up with what she just did. Nothing else in
 * this app can do that: the silhouette, the sexed shape and the worked-muscle set are already ours,
 * and they were being spent as decoration under a hero number.
 *
 * ⚠️ IT IS AN ARRIVAL, NOT A LOOP. It runs once, it ends lit, and the screen it ends on is the
 * screen you would have drawn anyway — so nothing is ever *waiting* on it and no fact is withheld
 * behind motion. Under Reduce Motion it does not run at all: `bloom` resolves to the finished state
 * on the first frame, which is the rule this app has held since §8.2 — *"no Hush moment depends on
 * motion to be understood."*
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing } from 'react-native';
import Svg, { Path, Ellipse, G } from 'react-native-svg';
import { fillerFor, zonesFor, HEAD, FILL_IDLE, BOX } from '@/components/BodyMapFigure';
import type { Face } from '@/components/BodyMapFigure';
import { motion } from '@/design/tokens';
import { useReducedMotion } from '@/platform/reducedMotion';

export interface MiniBodyProps {
  face: Face;
  sex?: 'female' | 'male';
  /** Muscles drawn lit (moss). Everything else rests dim. */
  lit: readonly string[];
  height: number;
  /**
   * The lit muscles ARRIVE instead of being already on — see the note above. Off everywhere the
   * figure is a reference; on where it is the moment. Ignored under Reduce Motion.
   */
  bloom?: boolean;
  /**
   * ✦ Held before the bloom begins, in ms (2026-08-27).
   *
   * A figure that is itself ARRIVING must not light up while it is still fading in — the muscles
   * would open under a half-transparent body and the two motions would read as one smear. The
   * caller knows when this element lands (its `Arrive` beat); it tells the bloom to wait for it.
   */
  bloomDelay?: number;
}

const LIT = { fill: '#CFE0BE', stroke: '#8FB27F', strokeWidth: 1.25 };
/* ⛔ 0.08/0.10 was a body below the threshold of sight (design review 2026-09-01): on WellDone the
   pair of figures read as two smudges with a green dot. The OUTLINE carries the silhouette now
   (~3.8:1); the fill stays a whisper so the lit muscles keep their full distance. */
const DIM = { fill: 'rgba(241,238,229,0.14)', stroke: 'rgba(241,238,229,0.42)', strokeWidth: 1 };

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * Each lit muscle opens over 40% of the run, and the starts are spread across the first 60% — so
 * the last one begins before the first has finished and the body fills like a breath rather than
 * ticking like a checklist. One shared driver, so they can never drift apart.
 */
const HOLD = 0.4;
const SPREAD = 0.6;

export function MiniBody({ face, sex, lit, height, bloom = false, bloomDelay = 0 }: MiniBodyProps) {
  const width = (height * BOX.w) / BOX.h;
  const flip = 'translate(' + BOX.w + ', 0) scale(-1, 1)';
  const reduced = useReducedMotion();
  const running = bloom && !reduced;

  const progress = useRef(new Animated.Value(running ? 0 : 1)).current;
  useEffect(() => {
    if (!running) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const run = Animated.timing(progress, {
      toValue: 1,
      delay: bloomDelay,
      duration: motion.dur.bloom,
      easing: Easing.out(Easing.cubic),
      /* SVG path opacity is not a transform, so this one cannot ride the native driver. It is a
         handful of paths for one and a half seconds, once, on a screen with nothing else moving. */
      useNativeDriver: false,
    });
    run.start();
    /* ⚠️ STOPPED ON UNMOUNT, and this is not housekeeping. A figure that leaves a timer running
       after it is gone keeps a render alive — in the app when she taps through the poster before it
       has finished, and in the suite, where it surfaced immediately as a worker that would not exit
       gracefully. An arrival owns its own animation for exactly as long as it is on screen. */
    return () => run.stop();
  }, [running, progress, bloomDelay]);

  const zones = zonesFor(sex)[face];
  /* Indexed among the LIT ones only — the dim ground is not part of the arrival, so a body with two
     worked muscles opens in two beats rather than in two of eleven. */
  const litOrder = zones.filter((z) => lit.includes(z.muscle)).map((z) => z.muscle);

  return (
    <View style={{ width, height }} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox={'0 0 ' + BOX.w + ' ' + BOX.h}>
        <Ellipse {...HEAD} fill={FILL_IDLE} />
        {fillerFor(sex).map((d, i) => (
          <Path key={'f-' + i} d={d} fill={FILL_IDLE} />
        ))}
        {zones.map((z) => {
          const isLit = lit.includes(z.muscle);
          const s = isLit ? LIT : DIM;
          if (!isLit || !running) {
            return (
              <React.Fragment key={z.muscle}>
                <Path d={z.d} {...s} />
                {z.mirrored ? (
                  <G transform={flip}>
                    <Path d={z.d} {...s} />
                  </G>
                ) : null}
              </React.Fragment>
            );
          }
          const i = litOrder.indexOf(z.muscle);
          const start = litOrder.length > 1 ? (i / (litOrder.length - 1)) * SPREAD : 0;
          const opacity = progress.interpolate({
            inputRange: [start, Math.min(1, start + HOLD)],
            outputRange: [0, 1],
            extrapolate: 'clamp',
          });
          return (
            <React.Fragment key={z.muscle}>
              {/* The dim ground stays under it, so a muscle opens INTO the body rather than onto
                  the black — there is never a hole where a muscle is about to be. */}
              <Path d={z.d} {...DIM} />
              <AnimatedPath d={z.d} {...s} opacity={opacity} />
              {z.mirrored ? (
                <G transform={flip}>
                  <Path d={z.d} {...DIM} />
                  <AnimatedPath d={z.d} {...s} opacity={opacity} />
                </G>
              ) : null}
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}
