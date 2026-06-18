/**
 * The One Button (spec §8.1). The ONLY primary button in Hush.
 * White bg / black text, 64px (Home CTA 60px/18r), 16px radius, pressed -> 95%
 * opacity 150ms. Forbidden forever: scale, bounce, glow, shadow, color variants.
 * Destructive actions use this identical button (no danger color).
 */
import React from 'react';
import { Pressable, Text, View, StyleSheet, type ViewStyle } from 'react-native';
import { button, color, radius as radii, s } from '@/design/tokens';

interface Props {
  label: string;
  onPress: () => void;
  /** 'compact' = HUSH_BUILD_SPEC §2.6.1 (white fill, radius 14, height 48, 15/500). */
  variant?: 'default' | 'home' | 'compact';
  leading?: React.ReactNode; // e.g. Apple logo on auth (§4.1)
  trailing?: React.ReactNode; // e.g. check on Set Confirmation (§4.10)
  disabled?: boolean;
  style?: ViewStyle;
}

export function PrimaryButton({ label, onPress, variant = 'default', leading, trailing, disabled, style }: Props) {
  const home = variant === 'home';
  const compact = variant === 'compact';
  const height = compact ? s(48) : home ? button.homeCta.height : button.primary.height;
  const radius = compact ? radii.card : home ? button.homeCta.radius : button.primary.radius;
  const fontSize = compact ? s(15) : home ? button.homeCta.fontSize : button.primary.fontSize;
  const fontWeight = compact ? ('500' as const) : home ? button.homeCta.fontWeight : button.primary.fontWeight;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        { height, borderRadius: radius, opacity: pressed ? button.primary.pressedOpacity : 1 },
        leading || trailing ? styles.row : null,
        style,
      ]}
    >
      {leading}
      <Text style={[styles.label, leading ? styles.labelGap : null, { fontSize, fontWeight }]}>{label}</Text>
      {trailing ? <View style={styles.trailingGap}>{trailing}</View> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'stretch',
    marginHorizontal: 0, // caller owns the 24px screen margin
    backgroundColor: button.primary.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row' },
  labelGap: { marginLeft: 8 },
  trailingGap: { marginLeft: 7 }, // 7pt gap (§4.10)
  label: {
    color: color.bgBase,
    fontSize: button.primary.fontSize,
    fontWeight: button.primary.fontWeight,
  },
});
