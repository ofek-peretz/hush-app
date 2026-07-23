/**
 * Button — v7. The primary action is CREAM standing on the dark stage, reserved
 * for the one true next action. Everything else is secondary, ghost, quiet,
 * danger, or onstage. No gradients, no rest shadow; press settles to 0.98 scale,
 * never bounces.
 */
import React from 'react';
import { Pressable, Text, View, StyleSheet, type ViewStyle } from 'react-native';
import {
  color,
  radius,
  control,
  space,
  font,
  textScale,
  tracking,
  trackingPx,
  signal,
  down,
  paper,
  stage as stageC,
} from '@/design/tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'quiet' | 'danger' | 'onstage' | 'onstageGhost';
type Size = 'sm' | 'md' | 'lg';

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

const HEIGHT: Record<Size, number> = { sm: control.hSm, md: control.h, lg: control.hLg };
const FONT: Record<Size, number> = { sm: textScale.sm, md: textScale.base, lg: textScale.md };
const PADX: Record<Size, number> = { sm: space[3], md: space[5], lg: space[7] };

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
        {
          height: HEIGHT[size],
          paddingHorizontal: PADX[size],
          borderRadius: size === 'lg' ? radius.button : size === 'sm' ? radius.md : radius.control,
        },
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
          { fontSize: FONT[size], color: FILL[variant].fg, letterSpacing: trackingPx(FONT[size], tracking.tight) },
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
    // v7 (2026-07-22): clay on the DARK stage — `down[0]` is the paper clay, too dark to read on
    // the sheet the confirm buttons sit on. `down.stage` is the lit clay the rest of the app uses.
    container: { backgroundColor: 'transparent', borderWidth: 1, borderColor: color.borderControl },
    pressed: { backgroundColor: down.wash, borderColor: down.stage },
    fg: down.stage,
  },
  onstage: { container: { backgroundColor: stageC.ink0 }, pressed: { backgroundColor: paper[0] }, fg: stageC[0] },
  // Ghost on the inverted stage — light ink on the dark surface (the paper `ghost`
  // fg is near-black and disappears on stage).
  onstageGhost: { container: { backgroundColor: 'transparent' }, pressed: { backgroundColor: stageC[1] }, fg: stageC.ink0 },
};

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2], borderWidth: 1, borderColor: 'transparent' },
  block: { alignSelf: 'stretch', width: '100%' },
  pressed: { transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.4 },
  label: { fontFamily: font.sansSemibold, textAlign: 'left' },
});
