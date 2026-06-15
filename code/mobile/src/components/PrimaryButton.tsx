/**
 * The One Button (spec §8.1). The ONLY primary button in Hush.
 * White bg / black text, 64px (Home CTA 60px/18r), 16px radius, pressed -> 95%
 * opacity 150ms. Forbidden forever: scale, bounce, glow, shadow, color variants.
 * Destructive actions use this identical button (no danger color).
 */
import React from 'react';
import { Pressable, Text, StyleSheet, type ViewStyle } from 'react-native';
import { button, color } from '@/design/tokens';

interface Props {
  label: string;
  onPress: () => void;
  variant?: 'default' | 'home';
  disabled?: boolean;
  style?: ViewStyle;
}

export function PrimaryButton({ label, onPress, variant = 'default', disabled, style }: Props) {
  const height = variant === 'home' ? button.homeCta.height : button.primary.height;
  const radius = variant === 'home' ? button.homeCta.radius : button.primary.radius;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        { height, borderRadius: radius, opacity: pressed ? button.primary.pressedOpacity : 1 },
        style,
      ]}
    >
      <Text style={styles.label}>{label}</Text>
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
  label: {
    color: color.bgBase,
    fontSize: button.primary.fontSize,
    fontWeight: button.primary.fontWeight,
  },
});
