/**
 * Button — 1:1 from the design `components/core/Button.jsx`.
 * Primary carries the single signal color and is reserved for the one true next
 * action. Everything else is secondary, ghost, quiet, danger, or onstage. No
 * gradients, no rest shadow; press settles 1px, never bounces.
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

type Variant = 'primary' | 'secondary' | 'ghost' | 'quiet' | 'danger' | 'onstage';
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
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        {
          height: HEIGHT[size],
          paddingHorizontal: PADX[size],
          borderRadius: size === 'sm' ? radius.sm : radius.md,
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
  primary: { container: { backgroundColor: signal[0] }, pressed: { backgroundColor: signal[1] }, fg: paper[0] },
  secondary: {
    container: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.borderControl },
    pressed: { backgroundColor: color.fillSubtle, borderColor: color.borderStrong },
    fg: color.textPrimary,
  },
  ghost: { container: { backgroundColor: 'transparent' }, pressed: { backgroundColor: color.fillSubtle }, fg: color.textPrimary },
  quiet: { container: { backgroundColor: 'transparent' }, pressed: {}, fg: color.textSecondary },
  danger: {
    container: { backgroundColor: 'transparent', borderWidth: 1, borderColor: color.borderControl },
    pressed: { backgroundColor: down.wash, borderColor: down[0] },
    fg: down[0],
  },
  onstage: { container: { backgroundColor: stageC.ink0 }, pressed: { backgroundColor: paper[0] }, fg: stageC[0] },
};

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2], borderWidth: 1, borderColor: 'transparent' },
  block: { alignSelf: 'stretch', width: '100%' },
  pressed: { transform: [{ translateY: 1 }] },
  disabled: { opacity: 0.4 },
  label: { fontFamily: font.sansSemibold },
});
