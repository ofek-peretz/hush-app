/**
 * Button — v7. The primary action is CREAM standing on the dark stage, reserved
 * for the one true next action. Everything else is secondary, ghost, quiet,
 * danger, or onstage. No gradients, no rest shadow; press settles to 0.98 scale,
 * never bounces.
 */
// @ts-nocheck

// 

import React from 'react';
import { Pressable, Text, View, StyleSheet, type ViewStyle } from 'react-native';
import {
  color,
  radius,
  control,
  space,
  font,
  textScale,
  signal,
  alert,
  paper,
  stage as stageC,
} from '@/design/tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'quiet' | 'danger' | 'onstage' | 'onstageGhost' | 'signal';
/**
 * Three full-width primaries, and the handoff draws each at its own size:
 *  - `lg`    — 58 / radius 19 / 600·16 — the page's action (onboarding, paywall, Done).
 *  - `crossing` — 60 / radius 19 / 600·17, FLAT — the act between two lifts. No shadow: the
 *              crossing screen has no chrome and no second control with an edge, so nothing has
 *              to be lifted clear of anything.
 *  - `act`   — 62 / radius 19 / 600·17 — a stage's CONTINUE (Start next set, Done). It lifts
 *              too, a shade less: `0 10px 30px rgba(0,0,0,.35)`.
 *  - `stage` — 64 / radius 20 / 600·18 — the training stage's single act, the heaviest lift in
 *              the product (`0 12px 34px rgba(0,0,0,.4)`).
 *  - `card`  — 56 / radius 17 / 600·15.5 — an action INSIDE a card, which must read as smaller
 *              than the page's own.
 *  - `whySheet` — 56 / radius 18 / 600·16 — the WHY sheet's "Got it" (v7 2.1b).
 */
type Size = 'sm' | 'md' | 'lg' | 'crossing' | 'act' | 'stage' | 'card' | 'whySheet';

interface Props {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  block?: boolean;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  disabled?: boolean;
  style?: ViewStyle | ViewStyle[];
}

const HEIGHT: Record<Size, number> = { sm: control.hSm, md: control.h, lg: control.hLg, crossing: 60, act: 62, stage: 64, card: 56, whySheet: 56 };
// `lg` is the 58px full-width action the handoff draws eight times over, always at 600/16 —
// never 17, and never tracked. A button label is a word, not a measurement.
/*
 * ⛔ NOTHING HERE IS UNDER 17 (founder 2026-08-12, the type floor).
 *
 * `lg` was 16, `card` 15.5, `whySheet` 16 — **so the primary act, the single most important string
 * the app draws, was below the floor on three of its eight sizes.** It is "Begin Upper B": the one
 * thing the screen exists to offer.
 *
 * ⚠️ AND `typeHasAFloor` COULD NOT SEE IT, which is the more useful half. The law sweeps `fontSize:`
 * and `<Legend size={…}>`; this is a lookup table of bare numbers that happens to be consumed as a
 * font size two functions later. A general "any number in a Record" rule would flag `RADIUS.card:
 * 17` on the very next line — a corner radius, not type. So the law names this map explicitly
 * instead, which is the honest shape for a one-off.
 */
const FONT: Record<Size, number> = { sm: textScale.sm, md: textScale.base, lg: 17, crossing: 17, act: 17, stage: 18, card: 17, whySheet: 17 };
const PADX: Record<Size, number> = { sm: space[3], md: space[5], lg: space[7], crossing: space[7], act: space[7], stage: space[7], card: space[7], whySheet: space[7] };
const RADIUS: Record<Size, number> = { sm: radius.md, md: radius.control, lg: radius.button, crossing: radius.button, act: radius.button, stage: radius.xl, card: 17, whySheet: 18 };

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  block = false,
  leading,
  trailing,
  disabled,
  style,
}: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      // A disabled button that does not SAY it is disabled is the same bug as a silent refusal:
      // VoiceOver announces an ordinary button, the athlete activates it, and nothing happens with
      // no account of why. `disabled` alone only stops the touch — this is what tells her.
      // (Found 2026-07-17 by the body-map screen's own test, which asked whether Continue announced
      // itself as blocked when the map was unbuildable. It didn't. This is every disabled button in
      // the app.)
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        { height: HEIGHT[size], paddingHorizontal: PADX[size], borderRadius: RADIUS[size], gap: size === 'stage' ? 9 : space[2] },
        size === 'stage' && styles.stageLift,
        size === 'act' && styles.actLift,
        FILL[variant].container,
        block && styles.block,
        pressed && !disabled && styles.pressed,
        pressed && !disabled && FILL[variant].pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {leading}
      <Text
        numberOfLines={1}
        style={[
          styles.label,
          { fontSize: FONT[size], color: FILL[variant].fg },
        ]}
      >
        {label}
      </Text>
      {trailing ? <View>{trailing}</View> : null}
    </Pressable>
  );
}

const FILL: Record<Variant, { container: ViewStyle; pressed: ViewStyle; fg: string }> = {
  // Cream, with ink on it — the primary action is light standing on the dark stage.
  // Under v7 the strongest affordance is the one furthest into the light.
  primary: { container: { backgroundColor: signal.fill }, pressed: { backgroundColor: signal.fillPressed }, fg: color.onAccent },
  secondary: {
    container: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.borderControl },
    pressed: { backgroundColor: color.fillSubtle, borderColor: color.borderStrong },
    fg: color.textPrimary,
  },
  ghost: { container: { backgroundColor: 'transparent' }, pressed: { backgroundColor: color.fillSubtle }, fg: color.textPrimary },
  quiet: { container: { backgroundColor: 'transparent' }, pressed: {}, fg: color.textSecondary },
  danger: {
    // CLAY, and it must not follow the direction token. This read `down.stage`, which was the lit
    // clay until `down` became the eased-load BLUE — at which point every destructive confirm in
    // the app quietly turned the colour of a load coming down (founder 2026-07-29). `alert` is the
    // clay, kept for exactly this and for pain.
    container: { backgroundColor: 'transparent', borderWidth: 1, borderColor: color.borderControl },
    pressed: { backgroundColor: alert.wash, borderColor: alert.stage },
    fg: alert.stage,
  },
  onstage: { container: { backgroundColor: stageC.ink0 }, pressed: { backgroundColor: paper[0] }, fg: stageC[0] },
  // MOSS, with ink on it. The page's primary is CREAM everywhere — except where the page already
  // holds a cream object and a cream act would read as a second slab of the same thing. That is
  // exactly the paywall (v7 4.3): the annual plan is a paper card, so the act takes the signal.
  // One screen, by the handoff's own hand — not a second primary.
  signal: { container: { backgroundColor: signal[0] }, pressed: { backgroundColor: signal.mossPressed }, fg: color.onAccent },
  // Ghost on the inverted stage — light ink on the dark surface (the paper `ghost`
  // fg is near-black and disappears on stage).
  onstageGhost: { container: { backgroundColor: 'transparent' }, pressed: { backgroundColor: stageC[1] }, fg: stageC.ink0 },
};

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2], borderWidth: 1, borderColor: 'transparent' },
  block: { alignSelf: 'stretch', width: '100%' },
  // The one shadow in the product: the training stage's act stands OFF the dark, so a hand finds
  // it without looking. Everywhere else, v7 elevation is felt in tone, not in a drop.
  stageLift: {
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 17,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  actLift: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  pressed: { transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.4 },
  label: { fontFamily: font.sansSemibold, textAlign: 'left' },
});
