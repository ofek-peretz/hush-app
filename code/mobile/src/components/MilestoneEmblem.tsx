/**
 * MilestoneEmblem — the mark, v7 (2.6 / 2.6b / 2.6c).
 *
 * ════ IT IS A SEAL, NOT A MEDAL ════
 *
 * This used to be an engraved medallion: 48 foil ticks around a double ring, a motif struck in the
 * middle, the figure beneath. It read as a game trophy — the one thing the product is not. v7 draws
 * it as a SEAL: a dashed outer ring, a plain inner ring, the figure lit inside it, and a small moss
 * check stamped at the crown where a seal's mark goes. Nothing is gold, nothing is foil, and the
 * only accent on the whole object is that check and the mark's own glyph.
 *
 * The dashed ring is the point of the drawing: a seal is made of the thing it certifies, and what
 * certifies a milestone here is a countable number of sessions. So the ring is a measure, drawn as
 * a measure, rather than a laurel.
 *
 * `pulse` adds one slow moss ring breathing outward behind it — the celebration beat only, where
 * the mark should feel like it is giving off heat rather than sitting in a list.
 */

// 

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { MilestoneGlyph, type MilestoneGlyphName } from '@/components/MilestoneGlyph';
import { Icon } from '@/components/Icon';
import { stage, signal, font, motion } from '@/design/tokens';
import { legendVoice } from '@/design/monoVoice';
import { useReducedMotion } from '@/platform/reducedMotion';

export interface MilestoneEmblemProps {
  size: number;
  tone?: 'foil' | 'locked';
  onStage?: boolean; // dark stage vs paper
  value: string; // the figure inside the seal, e.g. "40", "10", "12"
  caption?: string; // the line under the figure, e.g. "KG" / "WORKOUTS"
  glyph?: MilestoneGlyphName; // the mark's meaning, struck in moss above the figure
  /** Celebration only: one slow moss ring breathing outward behind the seal. */
  pulse?: boolean;
  /**
   * ⛔ A LOCKED SEAL SHOWS HOW FAR SHE STANDS FROM IT (design review 2026-09-01). 0..1. The wall's
   * next mark printed its THRESHOLD as the hero ("10 אימונים") and her progress as a footnote —
   * the biggest number on the progress screen was not her progress. The dashed ring is already
   * "a measure, drawn as a measure": with `progress`, the measure FILLS, in moss, so the object
   * itself carries the achievement and the threshold stays the label it should be.
   */
  progress?: number;
}

export function MilestoneEmblem({ size, tone = 'foil', onStage = false, value, caption, glyph, pulse = false, progress }: MilestoneEmblemProps) {
  // A LOCKED mark (the gallery's silhouette of what is next) is the same object with the light
  // taken out of it: the rings recede and the figure stops glowing.
  const locked = tone === 'locked';
  const ring = locked ? 'rgba(241,238,229,0.16)' : 'rgba(241,238,229,0.4)';
  const innerRing = locked ? 'rgba(241,238,229,0.10)' : 'rgba(241,238,229,0.18)';
  const figure = locked ? stage.ink2 : '#f6f3ea';
  const accent = locked ? stage.ink2 : signal[0];

  // The handoff's proportions, held at any size: the inner ring is 82% of the seal, the figure a
  // third of it, and the caption a fifth of the figure.
  const inner = Math.round(size * 0.824);
  const valueSize = Math.round(size * (value.length > 2 ? 0.26 : 0.315));
  /*
   * ⛔ THE CAPTION OBEYS THE TYPE FLOOR — IT WAS THE ONE WORD ON THE CELEBRATION SCREEN NOBODY
   * COULD READ.
   *
   * The clamp here was 9. Every call site in the product passes `size={216}` (WellDone's milestone
   * beat, and the gallery's copy of it), so `216 × 0.06` printed **KG / WORKOUTS at 13pt**, and a
   * longer caption at `216 × 0.049` printed at **11pt** — under a floor the founder has now stated
   * five times. She finishes a workout, the seal lifts a number at her, and the word saying WHAT
   * the number counts is the smallest type on the screen.
   *
   * ⚠️ AND `typeHasAFloor` COULD NOT SEE IT, which is the part worth recording. The sweep reads
   * `fontSize:` literals and `<Legend size={…}>`; this is a COMPUTED LOCAL consumed as
   * `fontSize: captionSize` two hundred lines later — the same shape as `Button.FONT` and
   * `SegmentedControl.GEOM`, the two tables that law had to name explicitly. This file is now the
   * third name on that list.
   *
   * The proportion is kept as the FLOOR's ceiling rather than deleted: at a seal larger than ~283
   * the caption grows with the drawing again, exactly as the handoff intended.
   */
  const captionSize = Math.max(17, Math.round(size * (caption && caption.length > 12 ? 0.049 : 0.06)));
  const badge = Math.round(size * 0.093);

  /*
   * The breath: outward and away, 4s, never a flash.
   *
   * ⚠️ AND IT IS THE ONE ANIMATION IN THIS APP THAT NEVER STOPS (motion audit, 2026-08-24). Every
   * other movement in Hush is a transition — it starts, it arrives, it is over. This is an
   * `Animated.loop`, so on the milestone screen something is moving for as long as the athlete
   * stands there. A perpetual loop is the exact class of motion the Reduced-Motion setting exists
   * for, and it was the only animated component in the app that never asked.
   *
   * Under the setting the halo simply does not run and the ring is not drawn. Nothing is lost: the
   * emblem, the number and the caption carry the whole statement, and §8.2's rule is that no Hush
   * moment may depend on motion to be understood.
   */
  const halo = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  const breathing = pulse && !reduced;
  useEffect(() => {
    if (!breathing) return;
    const loop = Animated.loop(
      Animated.timing(halo, { toValue: 1, duration: motion.dur.breath, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [breathing, halo]);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {breathing ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pulseRing,
            {
              borderRadius: (size + 28) / 2,
              opacity: halo.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.5, 0, 0] }),
              transform: [{ scale: halo.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1.9] }) }],
            },
          ]}
        />
      ) : null}

      {/* The seal itself: a dashed measure around a plain rule. */}
      <View style={[styles.outer, { width: size, height: size, borderRadius: size / 2, borderColor: ring }]}>
        {/* The measure, filling — the locked seal's own progress, drawn ON the ring (see `progress`). */}
        {locked && progress != null && progress > 0 ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, styles.progressSvg]}>
            <Svg width={size} height={size}>
              <Circle
                cx={size / 2}
                cy={size / 2}
                r={(size - 1.5) / 2}
                stroke={signal[0]}
                strokeWidth={2.5}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={Math.PI * (size - 1.5)}
                strokeDashoffset={Math.PI * (size - 1.5) * (1 - Math.min(1, Math.max(0, progress)))}
              />
            </Svg>
          </View>
        ) : null}
        <View style={[styles.inner, { width: inner, height: inner, borderRadius: inner / 2, borderColor: innerRing }]}>
          {glyph ? (
            <View style={styles.glyph}>
              {/* ⛔ A SEAL WITH NO FIGURE PROMOTES ITS GLYPH (design review 2026-09-01). The first-raise
                  mark has no number ("value: ''"), and at 216 points that left a near-empty ring with a
                  30-point icon lost in it — a celebration drawn as a placeholder. When the glyph is the
                  only thing inside the measure, it takes the figure's own share of it. */}
              <MilestoneGlyph name={glyph} size={Math.round(size * (value ? 0.139 : 0.3))} color={accent} />
            </View>
          ) : null}
          {value ? (
            <Text
              numberOfLines={1}
              style={[
                styles.value,
                {
                  fontSize: valueSize,
                  lineHeight: valueSize,
                  letterSpacing: -valueSize * 0.03,
                  color: figure,
                  textShadowColor: locked ? 'transparent' : 'rgba(246,243,234,0.14)',
                },
              ]}
            >
              {value}
            </Text>
          ) : null}
          {/*
            ════════════════════════════════════════════════════════════════════════════════════
            ⛔ THE SEAL WAS SPELLING ITS OWN CAPTION OUT LETTER BY LETTER (2026-08-27)

            On the glass it read `א י מ ו נ י ם`, in a face this component never chose. Two faults
            in one line, and they are the same fault:

              · `styles.caption` hard-set `font.monoMedium`. **IBM Plex Mono has no Hebrew.** So the
                caption inside the badge — the one word that says what the number counts — was
                drawn in whatever the system silently substituted.
              · `letterSpacing: captionSize * 0.22` was applied to every string. .22em is a Latin
                device; on Hebrew it pulls a word into seven separate letters.

            ⚠️ NEITHER LINT COULD SEE IT, and the reason is worth keeping. The type lint fires on
            `font.sans` styles that track — this one tracks a MONO style, which is normally legal.
            `monoCarriesNoWords` fires on a `t(…)` beside a mono style — `caption` arrives as a
            PROP, from three screens away. Between them the two rules describe this exactly, and
            neither is looking at it.

            `legendVoice` is the one question both halves come from: mono can draw it, so track it
            and set it in mono; mono cannot, so set it in the sans and do not touch its spacing.
            The same call `Legend` makes.
            ════════════════════════════════════════════════════════════════════════════════════
          */}
          {caption ? (
            <Text
              numberOfLines={1}
              style={[
                styles.caption,
                {
                  // rtl-ok: merged onto styles.caption, which sets textAlign: 'center'
                  fontFamily: legendVoice(caption, captionSize, 0.22).latin ? font.monoMedium : font.sansMedium,
                  fontSize: captionSize,
                  letterSpacing: legendVoice(caption, captionSize, 0.22).letterSpacing,
                },
              ]}
            >
              {caption}
            </Text>
          ) : null}
        </View>

        {/* The stamp at the crown — the one place this object is allowed an accent.
            ⛔ NOT ON A LOCKED SEAL (design review 2026-09-01): a check is a certification, and a
            mark she has not reached certifies nothing. The locked object carries its glyph and
            its filling measure; the stamp arrives with the milestone. */}
        {locked ? null : (
          <View
            style={[
              styles.badge,
              { width: badge, height: badge, borderRadius: badge / 2, top: -badge / 2 + 1, marginStart: -badge / 2, borderColor: accent },
            ]}
          >
            <Icon name="check" size={Math.round(badge * 0.55)} color={accent} strokeWidth={3} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pulseRing: { ...StyleSheet.absoluteFillObject, margin: -14, borderWidth: 1.5, borderColor: 'rgba(169,196,159,0.35)' },
  outer: { borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  inner: { borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  glyph: { marginBottom: 6 },
  value: {
    fontFamily: font.monoMedium,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    textShadowRadius: 40,
    textShadowOffset: { width: 0, height: 0 },
  },
  /* The face is chosen per STRING at the call site — see the note there. This is the Latin default
     and the fallback when the string never reaches the branch. */
  caption: { fontFamily: font.monoMedium, textTransform: 'uppercase', color: stage.ink1, textAlign: 'center' },
  /* -90°: the measure starts at the crown, where a gauge starts. */
  progressSvg: { transform: [{ rotate: '-90deg' }] },
  badge: {
    position: 'absolute',
    start: '50%',
    backgroundColor: stage[0],
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
